// World Cup 2026 fixture viewer

const els = {
  teamSelect: document.getElementById("teamSelect"),
  dateSelect: document.getElementById("dateSelect"),
  tzSelect: document.getElementById("tzSelect"),
  clearBtn: document.getElementById("clearBtn"),
  userBtn: document.getElementById("userBtn"),
  settingsBtn: document.getElementById("settingsBtn"),
  top5Btn: document.getElementById("top5Btn"),
  scheduleView: document.getElementById("scheduleView"),
  groupsView: document.getElementById("groupsView"),
  standingsView: document.getElementById("standingsView"),
  bracketView: document.getElementById("bracketView"),
  scorersView: document.getElementById("scorersView"),
  predictView: document.getElementById("predictView"),
  picksView: document.getElementById("picksView"),
  leaderboardView: document.getElementById("leaderboardView"),
  summary: document.getElementById("summary"),
  tabs: document.querySelectorAll(".tab"),
};

const RESULTS_KEY = "wc2026_results";
const OVERRIDE_KEY = "wc2026_standings_override";
// Reserved key inside state.standingsOverride for the global best-thirds ranking
// override (admin-set). It's not a real group letter (groups are A–L), so it
// never collides with per-group overrides and reuses the same Appwrite sync.
const THIRDS_OVERRIDE_KEY = "T";

// Admin status is derived from the logged-in Appwrite user — only this account
// can edit official results, standings overrides, and scorers. Other signed-in
// users are regular viewers.
function isUserAdmin(user) { return !!user && typeof user.email === "string" && ADMIN_EMAILS.map(e => e.toLowerCase()).includes(user.email.toLowerCase()); }
const PREDICTION_KEY = "wc2026_prediction";
const MATCH_PICKS_KEY = "wc2026_match_picks";

const TIMEZONES = [
  { label: "Bangladesh (Dhaka) — default", tz: "Asia/Dhaka" },
  { label: "My local time", tz: Intl.DateTimeFormat().resolvedOptions().timeZone },
  { label: "USA East (ET)", tz: "America/New_York" },
  { label: "India (Kolkata)", tz: "Asia/Kolkata" },
  { label: "United Kingdom (London)", tz: "Europe/London" },
  { label: "Spain / France / Germany", tz: "Europe/Madrid" },
  { label: "Portugal (Lisbon)", tz: "Europe/Lisbon" },
  { label: "Brazil (São Paulo)", tz: "America/Sao_Paulo" },
  { label: "Argentina (Buenos Aires)", tz: "America/Argentina/Buenos_Aires" },
  { label: "Mexico (Mexico City)", tz: "America/Mexico_City" },
  { label: "USA West (PT)", tz: "America/Los_Angeles" },
  { label: "Canada (Toronto)", tz: "America/Toronto" },
  { label: "Saudi Arabia (Riyadh)", tz: "Asia/Riyadh" },
  { label: "Qatar (Doha)", tz: "Asia/Qatar" },
  { label: "Japan (Tokyo)", tz: "Asia/Tokyo" },
  { label: "South Korea (Seoul)", tz: "Asia/Seoul" },
  { label: "Australia (Sydney)", tz: "Australia/Sydney" },
  { label: "Nigeria (Lagos)", tz: "Africa/Lagos" },
  { label: "South Africa (Johannesburg)", tz: "Africa/Johannesburg" },
  { label: "Egypt (Cairo)", tz: "Africa/Cairo" },
];

const state = {
  selectedTeam: "",
  selectedDate: "",
  selectedTz: "Asia/Dhaka",
  view: "schedule",
  results: loadResults(),
  standingsOverride: loadStandingsOverride(),
  prediction: loadPrediction(),
  sharedPrediction: null,        // set when viewing someone else's shared link (read-only)
  matchPicks: loadMatchPicks(),
  currentUser: null,             // {id, name, email} once logged in
  leaderboardUsers: [],          // [{userId, userName, picks, firstSubmittedAt}] for ranking
  leaderboardLoaded: false,      // true once the realtime subscription has been started (lazy)
  leaderboardReady: false,       // true once the FULL board has actually arrived (not just self)
  isAdmin: false,                // set by auth bootstrap once currentUser is known
  bracketLayout: localStorage.getItem("wc26_bracketLayout") || "onesided",
};

function isViewingShared() { return !!state.sharedPrediction; }

// --- Per-match score predictions (the Picks tab) ---
function loadMatchPicks() {
  try { return JSON.parse(localStorage.getItem(MATCH_PICKS_KEY)) || {}; }
  catch { return {}; }
}
function saveMatchPicks() {
  localStorage.setItem(MATCH_PICKS_KEY, JSON.stringify(state.matchPicks));
}
function getMatchPick(m) { return state.matchPicks[matchId(m)]; }
function setMatchPick(m, score1, score2) {
  const id = matchId(m);
  if (score1 === undefined && score2 === undefined) {
    delete state.matchPicks[id];
  } else {
    state.matchPicks[id] = { score1, score2 };
  }
  saveMatchPicks();
}

function loadPrediction() {
  try {
    const obj = JSON.parse(localStorage.getItem(PREDICTION_KEY)) || {};
    return {
      groupOrder: (obj.groupOrder && typeof obj.groupOrder === "object") ? obj.groupOrder : {},
      bestThirds: Array.isArray(obj.bestThirds) ? obj.bestThirds : [],
      koWinners: (obj.koWinners && typeof obj.koWinners === "object") ? obj.koWinners : {},
    };
  } catch {
    return { groupOrder: {}, bestThirds: [], koWinners: {} };
  }
}
function savePrediction() {
  localStorage.setItem(PREDICTION_KEY, JSON.stringify(state.prediction));
}

function loadStandingsOverride() {
  try {
    return JSON.parse(localStorage.getItem(OVERRIDE_KEY)) || {};
  } catch { return {}; }
}
function saveStandingsOverride() {
  localStorage.setItem(OVERRIDE_KEY, JSON.stringify(state.standingsOverride));
}

function setAdmin(value) {
  state.isAdmin = !!value;
  applyAdminClass();
}

function applyAdminClass() {
  document.body.classList.toggle("is-admin", state.isAdmin);
  document.body.classList.toggle("is-viewer", !state.isAdmin);
}

// ───────────── Generic modal system (alert / confirm) ─────────────
function showModal({ icon, iconType, title, message, buttons }) {
  const modal = document.createElement("div");
  modal.className = "modal";
  const iconClass = iconType ? `modal-icon-${iconType}` : "";
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-dialog" role="dialog" aria-modal="true">
      ${icon ? `<div class="modal-icon ${iconClass}">${icon}</div>` : ""}
      ${title ? `<h2>${title}</h2>` : ""}
      <p class="modal-subtitle">${message}</p>
      <div class="modal-actions">
        ${buttons.map((b, i) => {
    const variant = b.primary
      ? (b.danger ? "modal-btn-danger" : "modal-btn-primary")
      : "modal-btn-ghost";
    return `<button class="modal-btn ${variant}" data-idx="${i}" type="button">${b.label}</button>`;
  }).join("")}
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.body.classList.add("modal-open");

  const close = () => {
    modal.classList.add("modal-closing");
    modal.addEventListener("animationend", () => {
      modal.remove();
      if (!document.querySelector(".modal")) document.body.classList.remove("modal-open");
    }, { once: true });
  };

  const fireCancel = () => {
    const cancelBtn = buttons.find(b => !b.primary);
    if (cancelBtn && typeof cancelBtn.action === "function") cancelBtn.action(close);
    else close();
  };
  const firePrimary = () => {
    const primaryBtn = buttons.find(b => b.primary);
    if (primaryBtn && typeof primaryBtn.action === "function") primaryBtn.action(close);
  };

  buttons.forEach((b, i) => {
    modal.querySelector(`[data-idx="${i}"]`).addEventListener("click", () => {
      if (typeof b.action === "function") b.action(close);
      else close();
    });
  });
  modal.querySelector(".modal-backdrop").addEventListener("click", fireCancel);
  modal.addEventListener("keydown", (e) => {
    if (e.key === "Escape") fireCancel();
    if (e.key === "Enter") firePrimary();
  });

  // Focus the primary button (or any button if no primary)
  setTimeout(() => {
    const focusBtn = modal.querySelector(".modal-btn-primary, .modal-btn-danger, .modal-btn");
    if (focusBtn) focusBtn.focus();
  }, 60);
}

function showAlert(message, opts = {}) {
  return new Promise(resolve => {
    showModal({
      icon: opts.icon ?? "ℹ️",
      iconType: opts.iconType ?? "info",
      title: opts.title ?? "Notice",
      message,
      buttons: [{
        label: opts.okLabel ?? "OK",
        primary: true,
        action: (close) => { close(); resolve(); }
      }],
    });
  });
}

function showConfirm(message, opts = {}) {
  return new Promise(resolve => {
    showModal({
      icon: opts.icon ?? "❓",
      iconType: opts.iconType ?? (opts.danger ? "danger" : "info"),
      title: opts.title ?? "Confirm",
      message,
      buttons: [
        { label: opts.cancelLabel ?? "Cancel", action: (close) => { close(); resolve(false); } },
        {
          label: opts.confirmLabel ?? "Confirm",
          primary: true,
          danger: !!opts.danger,
          action: (close) => { close(); resolve(true); },
        },
      ],
    });
  });
}

// --- Results storage ---
// Repair a result record: card entries don't belong in the scorers list
// (a pre-cards client could mix them in via the shared Appwrite attribute),
// and the cards list must hold no duplicates.
function sanitizeResult(r) {
  if (!r) return r;
  if (Array.isArray(r.scorers) && r.scorers.some(s => s && s.card)) {
    const cards = r.scorers.filter(s => s && s.card);
    r.scorers = r.scorers.filter(s => s && !s.card);
    if (!Array.isArray(r.cards) || r.cards.length === 0) r.cards = cards;
    if (r.scorers.length === 0) delete r.scorers;
  }
  if (Array.isArray(r.cards)) {
    const seen = new Set();
    r.cards = r.cards.filter(c => {
      const k = `${c.team}|${c.name}|${c.minute}|${c.card}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  return r;
}

function loadResults() {
  try {
    const all = JSON.parse(localStorage.getItem(RESULTS_KEY)) || {};
    for (const k in all) sanitizeResult(all[k]);
    return all;
  } catch {
    return {};
  }
}

function saveResults() {
  localStorage.setItem(RESULTS_KEY, JSON.stringify(state.results));
}

// --- Import / Export / Fetch defaults ---
function exportResults() {
  // Wrap in the new format only when overrides exist; otherwise stay backwards-compatible
  // with the bare results-only shape.
  const hasOverride = Object.keys(state.standingsOverride || {}).length > 0;
  const payload = hasOverride
    ? { results: state.results, standingsOverride: state.standingsOverride }
    : state.results;
  const data = JSON.stringify(payload, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "results.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importResultsFromFile(file) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const raw = JSON.parse(e.target.result);
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error("Not a results object");
      }
      const payload = normalizeServerPayload(raw);
      if (Object.keys(state.results).length > 0) {
        const ok = await showConfirm("This will replace your current results. Continue?", {
          title: "Import results",
          icon: "⬆",
          confirmLabel: "Replace",
          danger: true,
        });
        if (!ok) return;
      }
      applyServerData(payload);
      // Mirror the imported data up to Appwrite so other clients see it too
      if (appwriteSync.available) {
        for (const matchId of Object.keys(state.results)) appwriteSync.scheduleMatch(matchId);
        for (const letter of Object.keys(state.standingsOverride)) appwriteSync.scheduleStandings(letter);
      }
      rerenderActive();
      showAlert(`Imported ${Object.keys(payload.results).length} match results.`, {
        title: "Import complete",
        icon: "✅",
        iconType: "success",
      });
    } catch (err) {
      showAlert("Could not import file: " + err.message, {
        title: "Import failed",
        icon: "⚠️",
        iconType: "warning",
      });
    }
  };
  reader.onerror = () => showAlert("Could not read file.", {
    title: "Read failed", icon: "⚠️", iconType: "warning",
  });
  reader.readAsText(file);
}

async function loadLatestFromServer() {
  try {
    // Bust browser + GitHub-Pages CDN caches: a unique URL per request can't
    // be served from cache. Without this, mobile browsers (especially Safari)
    // keep serving the old results.json even after a fresh deploy.
    const bust = Date.now();
    const res = await fetch(`results.json?t=${bust}`, {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
      },
    });
    if (!res.ok) throw new Error("results.json not found (HTTP " + res.status + ")");
    const data = await res.json();
    if (!data || typeof data !== "object") throw new Error("Invalid file");
    return normalizeServerPayload(data);
  } catch (err) {
    return { __error: err.message };
  }
}

// Accepts either:
//   { matchId: {score1, score2, ...}, ... }   (legacy: bare results)
//   { results: {...}, standingsOverride: {...} }   (wrapped)
function normalizeServerPayload(data) {
  if (data.results || data.standingsOverride) {
    return {
      results: data.results || {},
      standingsOverride: data.standingsOverride || {},
    };
  }
  return { results: data, standingsOverride: {} };
}

function applyServerData(payload) {
  state.results = payload.results || {};
  state.standingsOverride = payload.standingsOverride || {};
  saveResults();
  saveStandingsOverride();
}

function rerenderActive() {
  if (state.view === "schedule") render();
  else if (state.view === "standings") renderStandings();
  else if (state.view === "groups") renderGroups();
  else if (state.view === "bracket") renderBracket();
  else if (state.view === "scorers") renderTopScorers();
  else if (state.view === "predict") renderPredict();
  else if (state.view === "picks") renderPicks();
  else if (state.view === "leaderboard") renderLeaderboardView();
  refreshTop5Drawer();   // keep the Top-5 drawer live on any data change (no-op if closed)
  updateProgressBar();
}

function updateProgressBar() {
  const fill = document.getElementById("progressFill");
  const text = document.getElementById("progressText");
  if (!fill || !text) return;
  const total = FIXTURES.length;
  const done = FIXTURES.filter(m => {
    const r = getResult(m);
    if (!r || r.score1 === undefined) return false;
    const live = typeof liveScores !== "undefined" && liveScores.get(matchId(m));
    return !live || !live.isLive;
  }).length;
  const pct = total > 0 ? (done / total) * 100 : 0;
  fill.style.width = pct + "%";
  text.textContent = `${done} / ${total} matches played`;
}

function matchId(m) {
  return `${m.date}_${m.team1}_${m.team2}`;
}

// Official FIFA match number for a knockout fixture (group matches → null).
// Keyed by FIFA's placeholder pair (NOT array order — FIFA's numbering doesn't
// follow our fixture order). Source: FIFA calendar API MatchNumber field.
const _FIFA_MATCH_NO = {
  "2A|2B": 73, "1E|3ABCDF": 74, "1F|2C": 75, "1C|2F": 76, "1I|3CDFGH": 77, "2E|2I": 78,
  "1A|3CEFHI": 79, "1L|3EHIJK": 80, "1D|3BEFIJ": 81, "1G|3AEHIJ": 82, "2K|2L": 83, "1H|2J": 84,
  "1B|3EFGIJ": 85, "1J|2H": 86, "1K|3DEIJL": 87, "2D|2G": 88,
  "W74|W77": 89, "W73|W75": 90, "W76|W78": 91, "W79|W80": 92,
  "W83|W84": 93, "W81|W82": 94, "W86|W88": 95, "W85|W87": 96,
  "W89|W90": 97, "W93|W94": 98, "W91|W92": 99, "W95|W96": 100,
  "W97|W98": 101, "W99|W100": 102, "RU101|RU102": 103, "W101|W102": 104,
};
// Our fixture placeholder → FIFA placeholder code (C1 → 1C, 3rd A/B/C → 3ABC,
// W73 / RU101 unchanged).
function _toFifaCode(label) {
  let m;
  if ((m = /^([A-L])([12])$/.exec(label))) return m[2] + m[1];
  if ((m = /^3rd ([A-Z/]+)$/.exec(label))) return "3" + m[1].replace(/\//g, "");
  return label;
}
function matchNumber(m) {
  if (m.stage === "group" || !m.stage) return null;
  return _FIFA_MATCH_NO[`${_toFifaCode(m.team1)}|${_toFifaCode(m.team2)}`] ?? null;
}

function getResult(m) {
  const id = matchId(m);
  const manual = state.results[id];
  const live = (typeof liveScores !== "undefined") ? liveScores.get(id) : null;
  if (!live) return manual;
  if (live.isLive) return live;   // in play: the FIFA feed wins
  if (!manual) return live;       // no admin entry yet: show the API result
  // Auto-archived API value (not a hand-entered score): the live/API feed stays
  // authoritative so a score snapshotted early (e.g. 3-0) self-corrects to the
  // real final (e.g. 5-0). Hand-typed admin entries below stay canonical.
  if (manual.auto) return live;
  // Admin entry is canonical after FT; fill missing scorers/cards from the
  // API, but only when both agree on the score — otherwise the card would
  // contradict itself (e.g. a manual 0:0 showing the API's three scorers).
  if (Number(manual.score1) === Number(live.score1) &&
      Number(manual.score2) === Number(live.score2)) {
    const merged = { ...manual };
    let filled = false;
    if ((!Array.isArray(manual.scorers) || manual.scorers.length === 0) &&
        Array.isArray(live.scorers) && live.scorers.length > 0) {
      merged.scorers = live.scorers; filled = true;
    }
    if ((!Array.isArray(manual.cards) || manual.cards.length === 0) &&
        Array.isArray(live.cards) && live.cards.length > 0) {
      merged.cards = live.cards; filled = true;
    }
    if (filled) return merged;
  }
  return manual;
}

// --- Populate dropdowns ---
function populateTeams() {
  const teams = new Set();
  Object.values(GROUPS).flat().forEach(t => teams.add(t));
  const sorted = [...teams].sort();
  for (const t of sorted) {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    els.teamSelect.appendChild(opt);
  }
}

function populateDates() {
  const tz = state.selectedTz;
  // Build {dateKey -> label} using fixture moments in selected tz
  const seen = new Map();
  for (const m of FIXTURES) {
    const utc = fixtureToUTC(m);
    const key = dateKeyInTz(utc, tz);
    if (!seen.has(key)) seen.set(key, formatDateInTz(utc, tz));
  }
  const sorted = [...seen.keys()].sort();
  // Preserve current selection if it still exists
  const prev = state.selectedDate;
  els.dateSelect.innerHTML = '<option value="">All dates</option>';
  for (const key of sorted) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = seen.get(key);
    els.dateSelect.appendChild(opt);
  }
  if (prev && seen.has(prev)) els.dateSelect.value = prev;
  else state.selectedDate = "";
}

function populateTimezones() {
  for (const z of TIMEZONES) {
    const opt = document.createElement("option");
    opt.value = z.tz;
    opt.textContent = z.label;
    els.tzSelect.appendChild(opt);
  }
  els.tzSelect.value = state.selectedTz;
}

// --- Timezone helpers ---
// Fixture times are stored as "HH:MM ET" on a given date.
// ET in June/July is EDT = UTC-4 (the entire 2026 World Cup falls inside DST).
const _fixtureUtcCache = new Map();
function fixtureToUTC(m) {
  const key = matchId(m);
  let cached = _fixtureUtcCache.get(key);
  if (!cached) {
    const [hh, mm] = m.time.split(" ")[0].split(":").map(Number);
    const [y, mo, d] = m.date.split("-").map(Number);
    cached = new Date(Date.UTC(y, mo - 1, d, hh + 4, mm));
    _fixtureUtcCache.set(key, cached);
  }
  return cached;
}

function dateKeyInTz(date, tz) {
  // en-CA gives YYYY-MM-DD reliably
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const get = t => parts.find(p => p.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function formatDateInTz(date, tz) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz, weekday: "long", month: "long", day: "numeric",
  }).format(date);
}

function formatTimeInTz(date, tz) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true,
  }).format(date);
}

// --- Helpers ---
function formatLocalDateLabel(key) {
  // key is YYYY-MM-DD already in target tz; format as a pure calendar date
  const [y, mo, d] = key.split("-").map(Number);
  const date = new Date(y, mo - 1, d);
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function matchInvolves(match, team, ko) {
  if (!team) return true;
  if (match.stage === "group") {
    return match.team1 === team || match.team2 === team;
  }
  const { team1, team2 } = resolveMatchTeams(match, ko);
  return team1 === team || team2 === team;
}

function venueWithCountry(venue) {
  if (/,\s*(USA|United States|Canada|Mexico)\s*$/i.test(venue)) return venue;
  if (/Mexico City|Zapopan|Guadalupe/i.test(venue)) return `${venue}, Mexico`;
  if (/Toronto|Vancouver/i.test(venue)) return `${venue}, Canada`;
  // Every other 2026 host city is in the United States.
  return `${venue}, USA`;
}

function flagFor(name) {
  const code = TEAM_FLAGS[name];
  if (!code) return "";
  const src = SPECIAL_FLAG_URLS[code] || `https://flagcdn.com/w40/${code}.png`;
  return `<img class="flag-img" src="${src}" alt="${name} flag" loading="lazy">`;
}

// --- Live countdown / LIVE state ---
// LIVE window: group matches are always done within ~110 min real time.
// Knockout matches can run an extra 30 min (extra time) + ~15 min (penalties),
// so give them more headroom before the LIVE chip auto-disappears.
// No minute counter — we can't honestly track stoppage / extra time without a
// real referee feed, so the chip is just "LIVE" + red glow on the card.
const LIVE_DURATION_GROUP_MS = 2 * 60 * 60 * 1000;          // 120 min
const LIVE_DURATION_KO_MS    = 2 * 60 * 60 * 1000 + 45 * 60 * 1000; // 165 min

function formatCountdown(m, nowMs = Date.now()) {
  // m can be a fixture object or just a kickoff timestamp number (back-compat)
  const utcMs = typeof m === "number" ? m : fixtureToUTC(m).getTime();
  const isKnockout = typeof m === "object" && m.stage && m.stage !== "group";
  const liveWindow = isKnockout ? LIVE_DURATION_KO_MS : LIVE_DURATION_GROUP_MS;
  const diff = utcMs - nowMs;

  if (diff > 0) {
    if (diff <= 24 * 60 * 60 * 1000) {
      const totalSec = Math.floor(diff / 1000);
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      const pad = n => String(n).padStart(2, "0");
      return { state: "soon", text: `⏰ ${pad(h)}:${pad(m)}:${pad(s)}` };
    }
    const totalMin = Math.floor(diff / 60000);
    const days = Math.floor(totalMin / 1440);
    const hours = Math.floor((totalMin % 1440) / 60);
    const minutes = totalMin % 60;
    let text;
    if (days >= 2) text = `in ${days}d ${hours}h`;
    else if (days === 1) text = `in 1d ${hours}h`;
    else if (hours > 0) text = `in ${hours}h ${minutes}m`;
    else if (minutes > 0) text = `in ${minutes} min`;
    else text = "starting soon";
    return { state: "upcoming", text: `⏰ ${text}` };
  }
  if (-diff < liveWindow) {
    return { state: "live", text: "🔴 LIVE" };
  }
  return { state: "ended", text: "" };
}

// Per-card edit mode: even for the admin, result inputs and scorer buttons
// stay locked until ✏ Edit is clicked on that card (session-only, in-memory).
const editingCards = new Set();
function isCardEditing(mid) {
  return state.isAdmin && editingCards.has(mid);
}

// Live-API override: the real match minute beats the time-window heuristic.
function applyLiveChip(mid, cd) {
  const live = (typeof liveScores !== "undefined" && mid) ? liveScores.get(mid) : null;
  if (live && live.isLive) {
    const label = live.liveLabel || (live.matchTime ? `LIVE ${live.matchTime}` : "LIVE");
    return { state: "live", text: `🔴 ${label}` };
  }
  return cd;
}

// --- Renderers ---
