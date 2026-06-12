// FIFA WC 2026 — Live scores + scorers overlay (unofficial FIFA API)
//
// api.fifa.com is NOT an official public API: FIFA can change or block it at
// any time. This module is therefore a read-only display overlay:
//   - it NEVER writes into state.results, the results localStorage key, or
//     Appwrite — manual admin entry stays the canonical store, so the whole
//     site keeps working exactly as before if this API disappears.
// Merge rules (implemented in app.js getResult):
//   - while a match is live, the FIFA feed wins (real-time score + scorers);
//   - after full time, a manual admin entry takes priority over the API.

const liveScores = (() => {
  const API = "https://api.fifa.com/api/v3";
  const ID_COMPETITION = "17";  // FIFA World Cup
  const ID_SEASON = "285023";   // 2026 edition

  // MatchStatus codes (observed): 0 = finished, 1 = scheduled, 3 = live
  const STATUS_FINISHED = 0;
  const STATUS_LIVE = 3;

  // Timeline event types that put a goal on the board:
  // 0 = goal, 34 = own goal, 39 = free-kick goal, 41 = penalty goal
  const GOAL_TYPES = new Set([0, 34, 39, 41]);
  const TYPE_OWN_GOAL = 34;
  const PERIOD_SHOOTOUT = 11; // shootout kicks are not goal-scorer entries

  // FIFA's English team names → names used in fixtures.js
  const TEAM_ALIASES = {
    "Korea Republic": "South Korea",
    "USA": "United States",
    "IR Iran": "Iran",
    "Côte d'Ivoire": "Ivory Coast",
    "Cabo Verde": "Cape Verde",
    "Congo DR": "DR Congo",
  };

  const POLL_LIVE_MS = 60 * 1000;        // something is in play
  const POLL_IDLE_MS = 10 * 60 * 1000;   // nothing live right now
  const TIMELINE_RECENT_MS = 48 * 36e5;  // fetch scorers for matches < 48h old
  const KICKOFF_TOLERANCE_MS = 90 * 60 * 1000;

  // app matchId → {score1, score2, pen1, pen2, scorers, isLive, matchTime}
  const overlay = new Map();

  // Finished matches' scorers are immutable — cache them across reloads so a
  // page load doesn't refetch every recent timeline.
  const CACHE_KEY = "wc2026_live_scorer_cache";
  let scorerCache = {};
  try { scorerCache = JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch { /* fresh start */ }
  function persistScorerCache() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(scorerCache)); } catch { /* quota — cache is optional */ }
  }

  let onUpdate = null;
  let timer = null;
  let lastSnapshot = "";

  const localName = (n) => TEAM_ALIASES[n] || n;

  function sideName(side) {
    return (side && Array.isArray(side.TeamName) && side.TeamName[0])
      ? localName(side.TeamName[0].Description)
      : null;
  }

  // "Winner C" → "1C", "Runner-up A" → "2A", "3rd A/B/C/D/F" → "3ABCDF"
  // (FIFA's PlaceHolderA/B codes for not-yet-decided knockout slots)
  function placeholderCode(label) {
    if (!label) return null;
    let m = /^Winner ([A-L])$/.exec(label);
    if (m) return "1" + m[1];
    m = /^Runner-up ([A-L])$/.exec(label);
    if (m) return "2" + m[1];
    m = /^3rd ([A-Z/]+)$/.exec(label);
    if (m) return "3" + m[1].replace(/\//g, "");
    return null;
  }

  // Map one FIFA match onto a local fixture. Kickoff time is the primary key
  // (fixtures store ET, FIFA sends UTC — fixtureToUTC aligns them exactly);
  // simultaneous kickoffs are disambiguated by team names or placeholder
  // codes. Returns { fixture, flipped } or null.
  function findFixture(fm, ko) {
    const kickoff = Date.parse(fm.Date);
    const home = sideName(fm.Home);
    const away = sideName(fm.Away);

    const candidates = FIXTURES.filter(
      (m) => Math.abs(fixtureToUTC(m).getTime() - kickoff) <= KICKOFF_TOLERANCE_MS
    );
    if (candidates.length === 0) return null;

    if (home && away) {
      for (const m of candidates) {
        const r = resolveMatchTeams(m, ko);
        const t1 = r.team1 || m.team1;
        const t2 = r.team2 || m.team2;
        if (t1 === home && t2 === away) return { fixture: m, flipped: false };
        if (t1 === away && t2 === home) return { fixture: m, flipped: true };
      }
    }
    if (fm.PlaceHolderA && fm.PlaceHolderB) {
      for (const m of candidates) {
        if (placeholderCode(m.team1) === fm.PlaceHolderA &&
            placeholderCode(m.team2) === fm.PlaceHolderB) {
          return { fixture: m, flipped: false };
        }
      }
    }
    // Unique kickoff slot → safe even without resolvable names
    if (candidates.length === 1) return { fixture: candidates[0], flipped: false };
    return null;
  }

  // Timeline goal events → app scorer shape [{team: 1|2, name, minute}]
  function parseScorers(timeline, t1, t2) {
    const out = [];
    for (const ev of timeline.Event || []) {
      if (!GOAL_TYPES.has(ev.Type)) continue;
      if (ev.Period === PERIOD_SHOOTOUT) continue;
      const desc = (Array.isArray(ev.EventDescription) && ev.EventDescription[0])
        ? ev.EventDescription[0].Description : "";
      // "Julian QUINONES (Mexico) scores!!" → name + team
      const m = /^(.+?)\s*\(([^)]+)\)/.exec(desc);
      if (!m) continue;
      let name = m[1].replace(/^own goal by\s+/i, "").trim();
      const team = localName(m[2].trim());
      let side = team === t1 ? 1 : team === t2 ? 2 : 0;
      if (!side) continue;
      if (ev.Type === TYPE_OWN_GOAL) {
        side = side === 1 ? 2 : 1; // counts for the opponent
        name += " (OG)";
      }
      out.push({ team: side, name, minute: (ev.MatchMinute || "").replace(/'/g, "") });
    }
    return out;
  }

  async function fetchJSON(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("FIFA API HTTP " + res.status);
    return res.json();
  }

  // One poll: full tournament calendar (one request, all 104 matches), then
  // timelines only for live matches + recently-finished ones not yet cached.
  async function poll() {
    const now = Date.now();
    const data = await fetchJSON(
      `${API}/calendar/matches?idCompetition=${ID_COMPETITION}&idSeason=${ID_SEASON}&language=en&count=500`
    );
    const matches = data.Results || [];
    const ko = getKnockoutAssignments();
    let anyLive = false;
    let nextKickoff = Infinity;
    let cacheDirty = false;
    overlay.clear();
    const timelineJobs = [];

    for (const fm of matches) {
      const kickoff = Date.parse(fm.Date);
      const finished = fm.MatchStatus === STATUS_FINISHED;
      // Treat "started and not finished" as live even if the status code is
      // unexpected — losing the live flag is worse than a false positive.
      const isLive = !finished &&
        (fm.MatchStatus === STATUS_LIVE ||
          (now >= kickoff && now - kickoff < 3.75 * 36e5));
      if (!finished && !isLive) {
        if (kickoff > now) nextKickoff = Math.min(nextKickoff, kickoff);
        continue;
      }
      if (isLive) anyLive = true;

      const hit = findFixture(fm, ko);
      if (!hit) continue;
      const { fixture, flipped } = hit;

      const hs = fm.HomeTeamScore ?? (fm.Home && fm.Home.Score);
      const as_ = fm.AwayTeamScore ?? (fm.Away && fm.Away.Score);
      if (hs === null || hs === undefined || as_ === null || as_ === undefined) continue;

      const rec = {
        score1: flipped ? as_ : hs,
        score2: flipped ? hs : as_,
        isLive,
        matchTime: fm.MatchTime || "",
      };
      const hp = fm.HomeTeamPenaltyScore, ap = fm.AwayTeamPenaltyScore;
      if (hp !== null && hp !== undefined && ap !== null && ap !== undefined && (hp || ap)) {
        rec.pen1 = flipped ? ap : hp;
        rec.pen2 = flipped ? hp : ap;
      }

      // Scorers: cached for finished matches, refreshed every poll while live
      if (finished && scorerCache[fm.IdMatch]) {
        rec.scorers = scorerCache[fm.IdMatch];
      } else if (isLive || (finished && now - kickoff < TIMELINE_RECENT_MS)) {
        const rt = resolveMatchTeams(fixture, ko);
        timelineJobs.push({
          fm, rec, finished,
          t1: rt.team1 || fixture.team1,
          t2: rt.team2 || fixture.team2,
        });
      }
      overlay.set(matchId(fixture), rec);
    }

    await Promise.all(timelineJobs.map(async ({ fm, rec, finished, t1, t2 }) => {
      try {
        const tl = await fetchJSON(
          `${API}/timelines/${fm.IdCompetition}/${fm.IdSeason}/${fm.IdStage}/${fm.IdMatch}?language=en`
        );
        const scorers = parseScorers(tl, t1, t2);
        if (scorers.length) rec.scorers = scorers;
        if (finished) {
          scorerCache[fm.IdMatch] = scorers;
          cacheDirty = true;
        }
      } catch { /* scorers are optional — the score is already set */ }
    }));
    if (cacheDirty) persistScorerCache();

    const snapshot = JSON.stringify(
      [...overlay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
    );
    const changed = snapshot !== lastSnapshot;
    if (changed) lastSnapshot = snapshot;
    // Always notify (not only on change): the app also runs admin
    // housekeeping after each poll, e.g. pruning redundant manual entries.
    if (onUpdate) onUpdate(changed);

    if (anyLive) return POLL_LIVE_MS;
    if (nextKickoff < Infinity) {
      // Sleep until just after the next kickoff, capped at the idle cadence
      return Math.max(POLL_LIVE_MS, Math.min(POLL_IDLE_MS, nextKickoff - now + 30e3));
    }
    return POLL_IDLE_MS;
  }

  let firstRun = true;

  async function tick() {
    clearTimeout(timer);
    let delay = POLL_IDLE_MS;
    // Always poll on the first run, even in a background tab, so the page
    // isn't empty when it becomes visible (e.g. PWA cold start).
    if (firstRun || !document.hidden) {
      firstRun = false;
      try {
        delay = await poll();
      } catch (err) {
        console.warn("Live scores unavailable (manual results still apply):", err.message);
        delay = 5 * 60 * 1000;
      }
    }
    timer = setTimeout(tick, delay);
  }

  return {
    get(id) { return overlay.get(id) || null; },
    start(updateCb) {
      onUpdate = updateCb;
      // Tab was backgrounded (polling paused) → refresh as soon as it returns
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) tick();
      });
      tick();
    },
  };
})();
