// One-time backfill: fetch every finished match's scorers + cards from the FIFA
// timelines and write them into Firestore `matchresults`. The app itself only
// fetches timelines for matches finished within ~4h, so older matches end up
// archived with a score but no scorer names — this fills those in once.
//
// Needs serviceAccount.json (Firebase) in the folder. No Appwrite involved.
//   npm install firebase-admin     (already installed)
//   node backfill-scorers.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const API = "https://api.fifa.com/api/v3";
const ID_COMPETITION = "17", ID_SEASON = "285023";
const STATUS_FINISHED = 0;
const GOAL_TYPES = new Set([0, 34, 39, 41]);
const TYPE_OWN_GOAL = 34, PERIOD_SHOOTOUT = 11;
const CARD_TYPES = new Map([[2, "yellow"], [3, "red"], [4, "yellowred"]]);
const ALIAS = {
  "Korea Republic": "South Korea", "USA": "United States", "IR Iran": "Iran",
  "Côte d'Ivoire": "Ivory Coast", "Cabo Verde": "Cape Verde", "Congo DR": "DR Congo",
};
const localName = (n) => ALIAS[n] || n;

// Load FIXTURES out of the classic-script fixtures.js without modifying it.
const ctx = { __OUT: {} };
vm.createContext(ctx);
vm.runInContext(readFileSync("fixtures.js", "utf8") + "\n;__OUT.FIXTURES=FIXTURES;", ctx);
const FIXTURES = ctx.__OUT.FIXTURES;

const matchId = (m) => `${m.date}_${m.team1}_${m.team2}`;
function safeDocId(mid) {
  let h1 = 5381, h2 = 52711;
  for (let i = 0; i < mid.length; i++) { const c = mid.charCodeAt(i); h1 = ((h1 << 5) + h1 + c) >>> 0; h2 = ((h2 << 5) - h2 + c) >>> 0; }
  return ("m" + h1.toString(36) + h2.toString(36)).slice(0, 36);
}
const sideName = (s) => (s && Array.isArray(s.TeamName) && s.TeamName[0]) ? localName(s.TeamName[0].Description) : null;

function parseTimeline(tl, t1, t2) {
  const scorers = [], cards = [];
  for (const ev of (tl.Event || [])) {
    const desc = (Array.isArray(ev.EventDescription) && ev.EventDescription[0]) ? ev.EventDescription[0].Description : "";
    const m = /^(.+?)\s*\(([^)]+)\)/.exec(desc);
    const minute = (ev.MatchMinute || "").replace(/'/g, "");
    if (GOAL_TYPES.has(ev.Type) && ev.Period !== PERIOD_SHOOTOUT) {
      if (!m) continue;
      let name = m[1].replace(/^own goal by\s+/i, "").trim();
      const team = localName(m[2].trim());
      let side = team === t1 ? 1 : team === t2 ? 2 : 0;
      if (!side) continue;
      if (ev.Type === TYPE_OWN_GOAL) { side = side === 1 ? 2 : 1; name += " (OG)"; }
      scorers.push({ team: side, name, minute });
    } else if (CARD_TYPES.has(ev.Type)) {
      if (!m) continue;
      const team = localName(m[2].trim());
      const side = team === t1 ? 1 : team === t2 ? 2 : 0;
      if (!side) continue;
      cards.push({ team: side, name: m[1].trim(), minute, card: CARD_TYPES.get(ev.Type) });
    }
  }
  return { scorers, cards };
}

const fetchJSON = async (u) => { const r = await fetch(u, { cache: "no-store" }); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); };

initializeApp({ credential: cert(JSON.parse(readFileSync("serviceAccount.json", "utf8"))) });
const fdb = getFirestore();

const cal = await fetchJSON(`${API}/calendar/matches?idCompetition=${ID_COMPETITION}&idSeason=${ID_SEASON}&language=en&count=500`);
let done = 0, skipped = 0;
for (const fm of (cal.Results || [])) {
  if (fm.MatchStatus !== STATUS_FINISHED) continue;
  const home = sideName(fm.Home), away = sideName(fm.Away);
  if (!home || !away) { skipped++; continue; }
  // Group-stage matching by team pairing (unique in the group stage).
  const fix = FIXTURES.find(f => f.stage === "group" &&
    ((f.team1 === home && f.team2 === away) || (f.team1 === away && f.team2 === home)));
  if (!fix) { skipped++; continue; }
  try {
    const tl = await fetchJSON(`${API}/timelines/${fm.IdCompetition}/${fm.IdSeason}/${fm.IdStage}/${fm.IdMatch}?language=en`);
    const { scorers, cards } = parseTimeline(tl, fix.team1, fix.team2);
    if (!scorers.length && !cards.length) { skipped++; continue; }
    const update = { matchId: matchId(fix), updatedAt: FieldValue.serverTimestamp() };
    if (scorers.length) update.scorers = scorers;
    if (cards.length) update.cards = cards;
    await fdb.collection("matchresults").doc(safeDocId(matchId(fix))).set(update, { merge: true });
    console.log(`✓ ${fix.team1} ${fm.HomeTeamScore ?? "?"}-${fm.AwayTeamScore ?? "?"} ${fix.team2} — ${scorers.length} scorers, ${cards.length} cards`);
    done++;
  } catch (e) { console.warn(`× ${home} v ${away}: ${e.message}`); skipped++; }
}
console.log(`\nDone. Updated ${done} matches, skipped ${skipped}.`);
