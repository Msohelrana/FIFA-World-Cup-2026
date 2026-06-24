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
  leaderboardLoaded: false,      // true once fetchAll() has been called (lazy)
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

function getResult(m) {
  const id = matchId(m);
  const manual = state.results[id];
  const live = (typeof liveScores !== "undefined") ? liveScores.get(id) : null;
  if (!live) return manual;
  if (live.isLive) return live;   // in play: the FIFA feed wins
  if (!manual) return live;       // no admin entry yet: show the API result
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
function renderMatchCard(m, highlightTeam, ko) {
  const stageLabel = STAGE_LABELS[m.stage] + (m.group ? ` · Group ${m.group}` : "");

  const card = document.createElement("article");
  card.className = "match-card";

  const { team1: resolved1, team2: resolved2 } = resolveMatchTeams(m, ko);
  const displayTeam1 = resolved1 || m.team1;
  const displayTeam2 = resolved2 || m.team2;
  const teamsKnown = resolved1 && resolved2;

  const kickoffUtcMs = fixtureToUTC(m).getTime();
  const localTime = formatTimeInTz(fixtureToUTC(m), state.selectedTz);
  const stageBadge = `<span class="stage-badge ${m.stage}">${stageLabel}</span>`;
  const cd = applyLiveChip(matchId(m), formatCountdown(m));
  const countdownChip = cd.state === "ended"
    ? ""
    : `<span class="match-countdown ${cd.state}">${cd.text}</span>`;
  const timeText = cd.state === "ended" ? `<span class="match-time-ft">FT</span> <span class="match-time-scheduled">${localTime}</span>` : localTime;
  const editing = isCardEditing(matchId(m));
  const editBtn = state.isAdmin
    ? `<button type="button" class="card-edit-btn${editing ? " is-editing" : ""}" title="${editing ? "Finish editing this result" : "Edit this result"}">${editing ? "✓ Done" : "✏ Edit"}</button>`
    : "";
  const meta = `<div class="match-meta">${stageBadge}<span class="match-time">${timeText}</span>${countdownChip}${editBtn}</div>`;
  if (cd.state === "live") card.classList.add("is-live");
  card.dataset.kickoff = String(kickoffUtcMs);
  card.dataset.stage = m.stage;       // ticker uses this to pick the right LIVE window

  const t1Class = highlightTeam && displayTeam1 === highlightTeam ? "team highlight" : "team";
  const t2Class = highlightTeam && displayTeam2 === highlightTeam ? "team right highlight" : "team right";
  const f1 = flagFor(displayTeam1);
  const f2 = flagFor(displayTeam2);
  const teamsHTML = `<div class="match-teams">
    <span class="${t1Class}"><span class="flag">${f1}</span><span class="team-name" title="${displayTeam1}">${displayTeam1}</span></span>
    <span class="vs">VS</span>
    <span class="${t2Class}"><span class="team-name" title="${displayTeam2}">${displayTeam2}</span><span class="flag flag-right">${f2}</span></span>
  </div>`;

  const r = getResult(m) || {};
  const s1 = r.score1 ?? "";
  const s2 = r.score2 ?? "";
  const isKnockout = m.stage !== "group";
  const tied = r.score1 !== undefined && r.score2 !== undefined && r.score1 === r.score2;
  const p1 = r.pen1 ?? "";
  const p2 = r.pen2 ?? "";

  // For knockouts, always render PK inputs but disable them unless regulation is tied
  // (and unconditionally disable for viewers in read-only mode).
  const penDisabled = (tied && editing) ? "" : "disabled";
  const penInputs = isKnockout
    ? `<span class="pen-block ${tied ? "" : "is-disabled"}">
        <span class="pk-tag">PK</span>
        <input type="number" min="0" max="99" class="score-input pen-input pen1" value="${p1}" placeholder="–" aria-label="${displayTeam1} penalty score" ${penDisabled}>
        <span class="score-sep">:</span>
        <input type="number" min="0" max="99" class="score-input pen-input pen2" value="${p2}" placeholder="–" aria-label="${displayTeam2} penalty score" ${penDisabled}>
       </span>`
    : "";

  const winnerLabel = resultLabel(m, r, displayTeam1, displayTeam2);
  const lockedAttr = editing ? "" : "disabled";
  // Scores sit under their team names (left under team1, right under team2),
  // PK inputs in the centre, result label on its own line below — same layout
  // as the Match Predict cards.
  const resultHTML = `
    <div class="pb-section pb-result-section">
      <div class="pb-row pb-result" data-mid="${matchId(m)}">
        <input type="number" min="0" max="99" class="score-input score1" value="${s1}" placeholder="–" aria-label="${displayTeam1} score" ${lockedAttr}>
        <span class="score-sep">:</span>
        <input type="number" min="0" max="99" class="score-input score2" value="${s2}" placeholder="–" aria-label="${displayTeam2} score" ${lockedAttr}>
      </div>
      ${penInputs ? `<div class="pb-pk-row">${penInputs}</div>` : ""}
      <div class="pb-label-row"><span class="result-label">${winnerLabel}</span></div>
    </div>`;

  const scorersHTML = `<div class="scorers-row" data-mid="${matchId(m)}"></div>`;

  // Match Stats button: only when the FIFA overlay can resolve this match's
  // stats feed (started matches with known team ids — see liveScores.getStats)
  const liveRec = (typeof liveScores !== "undefined") ? liveScores.get(matchId(m)) : null;
  const statsBtnHTML = (liveRec && liveRec.statsId && liveRec.idTeam1 && liveRec.idTeam2)
    ? `<button type="button" class="stats-btn">📊 Match Stats</button>`
    : "";
  // Admin-only: pull this match's scorers/cards from the FIFA API on demand
  // (for games that finished while no one was on the app).
  const refreshBtnHTML = (state.isAdmin && liveRec)
    ? `<button type="button" class="refresh-scorers-btn" title="Fetch scorers & cards from the FIFA API">⚽ Refresh scorers</button>`
    : "";
  const footer = `<div class="match-footer"><span class="venue">${venueWithCountry(m.venue)}</span>${refreshBtnHTML}${statsBtnHTML}</div>`;

  card.innerHTML = meta + teamsHTML + resultHTML + scorersHTML + footer;

  const editBtnEl = card.querySelector(".card-edit-btn");
  if (editBtnEl) {
    editBtnEl.addEventListener("click", () => {
      const id = matchId(m);
      if (editingCards.has(id)) editingCards.delete(id);
      else editingCards.add(id);
      card.replaceWith(renderMatchCard(m, highlightTeam, ko));
    });
  }

  const statsBtnEl = card.querySelector(".stats-btn");
  if (statsBtnEl) {
    statsBtnEl.addEventListener("click", () => showMatchStats(m, displayTeam1, displayTeam2));
  }

  const refreshBtnEl = card.querySelector(".refresh-scorers-btn");
  if (refreshBtnEl) {
    refreshBtnEl.addEventListener("click", async () => {
      const orig = refreshBtnEl.textContent;
      refreshBtnEl.disabled = true;
      refreshBtnEl.textContent = "⏳ Fetching…";
      const res = await liveScores.fetchScorers(matchId(m), displayTeam1, displayTeam2);
      if (!res || (!res.scorers.length && !res.cards.length)) {
        refreshBtnEl.textContent = "No scorers found";
        setTimeout(() => { refreshBtnEl.disabled = false; refreshBtnEl.textContent = orig; }, 2000);
        return;
      }
      const id = matchId(m);
      const r = { ...(state.results[id] || {}) };
      r.scorers = res.scorers;
      if (res.cards.length) r.cards = res.cards;
      // Ensure a score is present so it counts as a real result.
      if ((r.score1 === undefined || r.score2 === undefined) && liveRec && liveRec.score1 !== undefined) {
        r.score1 = liveRec.score1; r.score2 = liveRec.score2;
      }
      state.results[id] = sanitizeResult(r);
      saveResults();
      appwriteSync.scheduleMatch(id);       // sync to Firestore
      card.replaceWith(renderMatchCard(m, highlightTeam, ko));
    });
  }

  wireScoreInputs(card, m, displayTeam1, displayTeam2, teamsKnown);
  renderScorersBlock(card, m, displayTeam1, displayTeam2, teamsKnown);
  return card;
}

// --- Scorers ---
function getScorers(m) {
  const r = getResult(m);
  // Guard: card entries can never display as goals (legacy mixed data)
  return (r && Array.isArray(r.scorers)) ? r.scorers.filter(s => s && !s.card) : [];
}

// Bookings come only from the FIFA API (no manual admin entry) — display-only.
function getCards(m) {
  const r = getResult(m);
  return (r && Array.isArray(r.cards)) ? r.cards : [];
}

// Collect unique scorer names previously recorded for a given team across all matches.
// Used to populate the autocomplete dropdown when admin enters a new scorer.
function getKnownScorerNamesForTeam(teamName) {
  if (!teamName) return [];
  const ko = getKnockoutAssignments();
  const names = new Set();
  for (const fx of FIXTURES) {
    const r = state.results[matchId(fx)];
    if (!r || !Array.isArray(r.scorers) || r.scorers.length === 0) continue;
    const { team1, team2 } = resolveMatchTeams(fx, ko);
    for (const s of r.scorers) {
      if (s && s.card) continue; // card entry, not a goal (legacy mixed data)
      const sideTeam = s.team === 1 ? team1 : team2;
      if (sideTeam === teamName) {
        const n = (s.name || "").trim();
        if (n) names.add(n);
      }
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

function setScorers(m, scorers) {
  const id = matchId(m);
  const prev = state.results[id] || {};
  const c1 = scorers.filter(s => s.team === 1).length;
  const c2 = scorers.filter(s => s.team === 2).length;

  // No scorers left + no PKs → entry is meaningless (score was driven by scorers), drop it
  if (scorers.length === 0 && prev.pen1 === undefined && prev.pen2 === undefined) {
    if (state.results[id]) {
      delete state.results[id];
      saveResults();
      appwriteSync.scheduleMatch(id);
    }
    return;
  }

  // Scorer count drives the score for each side
  const next = { ...prev, scorers, score1: c1, score2: c2 };
  // KO: if no longer tied, drop any stale PK values
  if (m.stage !== "group" && next.score1 !== next.score2) {
    next.pen1 = undefined;
    next.pen2 = undefined;
  }
  state.results[id] = next;
  saveResults();
  appwriteSync.scheduleMatch(id);
}

// Update the visible score input + result label + PK block after scorers change.
// Mirrors the inline-update logic in wireScoreInputs.onChange.
function syncScoreUIAfterScorers(card, m, t1, t2, prevWinner) {
  const id = matchId(m);
  const r = state.results[id] || {};
  const isKnockout = m.stage !== "group";

  const s1El = card.querySelector(".score1");
  const s2El = card.querySelector(".score2");
  if (s1El) s1El.value = r.score1 ?? "";
  if (s2El) s2El.value = r.score2 ?? "";

  const label = card.querySelector(".result-label");
  if (label) label.textContent = resultLabel(m, r, t1, t2);

  const penBlock = card.querySelector(".pen-block");
  if (penBlock) {
    const tiedNow = isKnockout && r.score1 !== undefined && r.score2 !== undefined && r.score1 === r.score2;
    penBlock.classList.toggle("is-disabled", !tiedNow);
    const p1 = card.querySelector(".pen1");
    const p2 = card.querySelector(".pen2");
    if (p1) { p1.disabled = !tiedNow; if (!tiedNow) p1.value = ""; }
    if (p2) { p2.disabled = !tiedNow; if (!tiedNow) p2.value = ""; }
  }

  if (isKnockout) {
    const newWinner = computeWinnerFromResult(m, r, t1, t2);
    if (newWinner !== prevWinner) {
      preserveScrollAndFocus(() =>
        renderSchedule(state.selectedTeam, state.selectedDate)
      );
    }
  }
  if (state.view === "standings") renderStandings();
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function renderScorersBlock(card, m, t1, t2, teamsKnown) {
  const block = card.querySelector(".scorers-row");
  if (!block) return;
  const scorers = getScorers(m);
  const admin = isCardEditing(matchId(m));

  // Viewer mode + no scorers → render nothing (keeps the card tight)
  if (!admin && scorers.length === 0) {
    block.innerHTML = "";
    block.hidden = true;
    return;
  }
  block.hidden = false;

  const col = (sideKey, teamName, alignRight) => {
    const items = scorers
      .map((s, idx) => ({ ...s, _idx: idx }))
      .filter(s => s.team === sideKey);
    const lis = items.map(s => {
      const min = (s.minute !== undefined && s.minute !== null && s.minute !== "")
        ? ` <span class="scorer-min">${escapeHTML(s.minute)}'</span>`
        : "";
      const rm = admin
        ? ` <button type="button" class="scorer-rm" data-idx="${s._idx}" aria-label="Remove scorer">×</button>`
        : "";
      return `<li class="scorer-item">⚽ <span class="scorer-name">${escapeHTML(s.name)}</span>${min}${rm}</li>`;
    }).join("");
    const addBtn = admin
      ? `<button type="button" class="scorer-add-btn" data-side="${sideKey}" ${teamsKnown ? "" : "disabled title=\"Teams not yet decided\""}>+ Add</button>`
      : "";
    return `
      <div class="scorer-col${alignRight ? " right" : ""}">
        <div class="scorer-team">${escapeHTML(teamName)}</div>
        <ul class="scorer-list">${lis}</ul>
        ${addBtn}
      </div>`;
  };

  block.innerHTML = `
    ${col(1, t1, false)}
    <div class="scorer-divider" aria-hidden="true"></div>
    ${col(2, t2, true)}
  `;

  if (!admin) return;

  // Wire remove buttons
  block.querySelectorAll(".scorer-rm").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.idx, 10);
      const prevR = state.results[matchId(m)];
      const prevWinner = computeWinnerFromResult(m, prevR, t1, t2);
      const next = getScorers(m).filter((_, i) => i !== idx);
      setScorers(m, next);
      syncScoreUIAfterScorers(card, m, t1, t2, prevWinner);
      renderScorersBlock(card, m, t1, t2, teamsKnown);
    });
  });

  // Wire add buttons → reveal inline form scoped to that team's column
  block.querySelectorAll(".scorer-add-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const side = parseInt(btn.dataset.side, 10);
      const colEl = btn.closest(".scorer-col");
      // If a form already exists in this column, focus it instead of stacking
      const existing = colEl.querySelector(".scorer-form");
      if (existing) { existing.querySelector(".scorer-name-input").focus(); return; }

      const teamName = side === 1 ? t1 : t2;
      const knownNames = getKnownScorerNamesForTeam(teamName);
      const dlId = `scorer-dl-${matchId(m)}-${side}`;
      const dlOptions = knownNames.map(n => `<option value="${escapeHTML(n)}"></option>`).join("");
      const listAttr = knownNames.length ? ` list="${dlId}"` : "";

      const form = document.createElement("div");
      form.className = "scorer-form";
      form.innerHTML = `
        <input type="text" class="scorer-name-input" placeholder="Player name" maxlength="40"${listAttr} autocomplete="off">
        ${knownNames.length ? `<datalist id="${dlId}">${dlOptions}</datalist>` : ""}
        <input type="number" class="scorer-min-input" placeholder="min" min="1" max="130">
        <button type="button" class="scorer-save">✓</button>
        <button type="button" class="scorer-cancel">×</button>
      `;
      colEl.appendChild(form);
      const nameEl = form.querySelector(".scorer-name-input");
      const minEl = form.querySelector(".scorer-min-input");
      nameEl.focus();

      const save = () => {
        const name = nameEl.value.trim();
        if (!name) { nameEl.focus(); return; }
        const minRaw = minEl.value.trim();
        const parsedMin = parseInt(minRaw, 10);
        const minute = (minRaw === "" || isNaN(parsedMin)) ? undefined : Math.max(1, parsedMin);
        const prevR = state.results[matchId(m)];
        const prevWinner = computeWinnerFromResult(m, prevR, t1, t2);
        const next = getScorers(m).concat([{ team: side, name, minute }]);
        setScorers(m, next);
        syncScoreUIAfterScorers(card, m, t1, t2, prevWinner);
        renderScorersBlock(card, m, t1, t2, teamsKnown);
      };
      form.querySelector(".scorer-save").addEventListener("click", save);
      form.querySelector(".scorer-cancel").addEventListener("click", () => form.remove());
      nameEl.addEventListener("keydown", e => { if (e.key === "Enter") save(); if (e.key === "Escape") form.remove(); });
      minEl.addEventListener("keydown", e => { if (e.key === "Enter") save(); if (e.key === "Escape") form.remove(); });
    });
  });
}

function resultLabel(m, r, t1, t2) {
  if (!r || r.score1 === undefined || r.score2 === undefined) return "";
  const isKnockout = m.stage !== "group";
  if (r.score1 > r.score2) return `${t1} ${isKnockout ? "advances" : "won"}`;
  if (r.score2 > r.score1) return `${t2} ${isKnockout ? "advances" : "won"}`;
  if (!isKnockout) return "Draw";
  if (r.pen1 !== undefined && r.pen2 !== undefined && r.pen1 !== r.pen2) {
    return r.pen1 > r.pen2
      ? `${t1} wins on penalties`
      : `${t2} wins on penalties`;
  }
  return "Tied — enter penalties";
}

function computeWinnerFromResult(m, r, t1, t2) {
  if (!r || r.score1 === undefined || r.score2 === undefined) return null;
  if (r.score1 > r.score2) return t1;
  if (r.score2 > r.score1) return t2;
  if (m.stage === "group") return null; // draw
  if (r.pen1 !== undefined && r.pen2 !== undefined && r.pen1 !== r.pen2) {
    return r.pen1 > r.pen2 ? t1 : t2;
  }
  return null;
}

function preserveScrollAndFocus(fn) {
  const scrollY = window.scrollY;
  const active = document.activeElement;
  const row = active && active.closest && active.closest(".pb-result");
  const mid = row ? row.dataset.mid : null;
  const cls = ["score1", "score2", "pen1", "pen2"].find(c => active && active.classList && active.classList.contains(c));

  fn();

  if (mid && cls) {
    const sel = `.pb-result[data-mid="${CSS.escape(mid)}"] .${cls}`;
    const el = document.querySelector(sel);
    if (el) el.focus();
  }
  window.scrollTo(0, scrollY);
}

function wireScoreInputs(card, m, t1, t2, teamsKnown) {
  const row = card.querySelector(".pb-result");
  const section = row.closest(".pb-section") || card;
  const s1 = row.querySelector(".score1");
  const s2 = row.querySelector(".score2");
  const p1 = section.querySelector(".pen1");
  const p2 = section.querySelector(".pen2");
  const penBlock = section.querySelector(".pen-block");
  const label = card.querySelector(".result-label");
  const isKnockout = m.stage !== "group";

  const parseNum = el => el.value === "" ? undefined : Math.max(0, parseInt(el.value, 10) || 0);

  const onChange = () => {
    const id = matchId(m);
    const prev = state.results[id];
    const prevWinner = computeWinnerFromResult(m, prev, t1, t2);

    const v1 = parseNum(s1);
    const v2 = parseNum(s2);
    const next = { ...(prev || {}), score1: v1, score2: v2 };

    if (p1 && p2) {
      next.pen1 = parseNum(p1);
      next.pen2 = parseNum(p2);
    }

    const hasScorers = Array.isArray(next.scorers) && next.scorers.length > 0;
    if (v1 === undefined && v2 === undefined && next.pen1 === undefined && next.pen2 === undefined && !hasScorers) {
      delete state.results[id];
    } else {
      state.results[id] = next;
    }
    saveResults();
    appwriteSync.scheduleMatch(id);

    // Inline updates: result label + PK enabled state — no DOM rebuild
    const newR = state.results[id];
    label.textContent = resultLabel(m, newR || {}, t1, t2);
    if (penBlock) {
      const tiedNow = isKnockout && v1 !== undefined && v2 !== undefined && v1 === v2;
      penBlock.classList.toggle("is-disabled", !tiedNow);
      if (p1) p1.disabled = !tiedNow;
      if (p2) p2.disabled = !tiedNow;
      if (!tiedNow) {
        // Clear any stale PK values when match is no longer tied
        if (p1) p1.value = "";
        if (p2) p2.value = "";
      }
    }

    // Only re-render the schedule when the winner of THIS knockout match changes,
    // because that's the only event that affects downstream cards.
    if (isKnockout) {
      const newWinner = computeWinnerFromResult(m, newR, t1, t2);
      if (newWinner !== prevWinner) {
        preserveScrollAndFocus(() =>
          renderSchedule(state.selectedTeam, state.selectedDate)
        );
      }
    }

    if (state.view === "standings") renderStandings();
  };

  s1.addEventListener("input", onChange);
  s2.addEventListener("input", onChange);
  if (p1) p1.addEventListener("input", onChange);
  if (p2) p2.addEventListener("input", onChange);
}

let _showOldFinished = false;
let _showRecentFinished = false;
let _showUpcoming = false;
let _picksShowOldFinished = false;
let _picksShowRecentFinished = false;
let _picksShowUpcoming = false;
const _prevLbRanks = new Map(); // userId → rank, persists between renders for animation
let _lastMyExactCount = null;   // tracks own exact count to detect new exact scores

function renderScheduleDayGroups(byDate, filterTeam, ko, container, desc = false) {
  const sortedDates = [...byDate.keys()].sort();
  if (desc) sortedDates.reverse();
  for (const key of sortedDates) {
    const dayMatches = byDate.get(key);
    dayMatches.sort((a, b) => fixtureToUTC(a).getTime() - fixtureToUTC(b).getTime());
    if (desc) dayMatches.reverse();
    const dayGroup = document.createElement("div");
    dayGroup.className = "day-group";
    const count = dayMatches.length;
    const header = document.createElement("div");
    header.className = "day-header";
    header.innerHTML = `
      <span class="day-date">${formatLocalDateLabel(key)}</span>
      <span class="day-count">${count} ${count === 1 ? "match" : "matches"}</span>
    `;
    dayGroup.appendChild(header);
    const list = document.createElement("div");
    list.className = "match-list";
    for (const m of dayMatches) list.appendChild(renderMatchCard(m, filterTeam, ko));
    dayGroup.appendChild(list);
    container.appendChild(dayGroup);
  }
}

function renderPicksDayGroups(byDate, ko, container, desc = false) {
  const sortedDates = [...byDate.keys()].sort();
  if (desc) sortedDates.reverse();
  for (const key of sortedDates) {
    const dayMatches = byDate.get(key);
    dayMatches.sort((a, b) => fixtureToUTC(a).getTime() - fixtureToUTC(b).getTime());
    if (desc) dayMatches.reverse();
    const dayGroup = document.createElement("div");
    dayGroup.className = "day-group";
    const count = dayMatches.length;
    const header = document.createElement("div");
    header.className = "day-header";
    header.innerHTML = `
      <span class="day-date">${formatLocalDateLabel(key)}</span>
      <span class="day-count">${count} ${count === 1 ? "match" : "matches"}</span>
    `;
    dayGroup.appendChild(header);
    const list = document.createElement("div");
    list.className = "match-list";
    for (const m of dayMatches) list.appendChild(renderPickCard(m, ko));
    dayGroup.appendChild(list);
    container.appendChild(dayGroup);
  }
}

function renderSchedule(filterTeam, filterDate) {
  els.scheduleView.innerHTML = "";
  const tz = state.selectedTz;
  const ko = getKnockoutAssignments();
  const now = Date.now();
  const TWENTY_FOUR_H = 24 * 60 * 60 * 1000;

  if (ko.complete) {
    const finalMatch = FIXTURES.find(f => f.stage === "final");
    const champion = finalMatch ? getKnockoutOutcome(finalMatch, "winner", ko) : null;
    const banner = document.createElement("div");
    if (champion) {
      banner.className = "ko-banner champion-banner";
      banner.innerHTML = `🏆 <span class="flag">${flagFor(champion)}</span> <strong>${champion}</strong> are World Champions!`;
    } else {
      banner.className = "ko-banner";
      banner.innerHTML = `✅ Group stage complete — knockout bracket auto-fills as you enter results.`;
    }
    els.scheduleView.appendChild(banner);
  }

  // ── Live Now (pinned at top) ──────────────────────────────────────────────
  const liveMatches = FIXTURES.filter(m => {
    if (!matchInvolves(m, filterTeam, ko)) return false;
    return applyLiveChip(matchId(m), formatCountdown(m)).state === "live";
  });
  const liveIds = new Set(liveMatches.map(m => matchId(m)));

  if (liveMatches.length > 0) {
    const liveGroup = document.createElement("div");
    liveGroup.className = "day-group live-now-group";
    const liveHeader = document.createElement("div");
    liveHeader.className = "day-header live-now-header";
    liveHeader.innerHTML = `
      <span class="day-date live-now-label">🔴 Live Now</span>
      <span class="day-count">${liveMatches.length} ${liveMatches.length === 1 ? "match" : "matches"}</span>
    `;
    liveGroup.appendChild(liveHeader);
    const liveList = document.createElement("div");
    liveList.className = "match-list";
    for (const m of liveMatches) liveList.appendChild(renderMatchCard(m, filterTeam, ko));
    liveGroup.appendChild(liveList);
    els.scheduleView.appendChild(liveGroup);
  }

  // ── Bucket remaining matches into 3 groups ────────────────────────────────
  const upcomingByDate = new Map();
  const recentByDate   = new Map();
  const oldByDate      = new Map();

  for (const m of FIXTURES) {
    if (!matchInvolves(m, filterTeam, ko)) continue;
    const mid = matchId(m);
    if (liveIds.has(mid)) continue;
    const key = dateKeyInTz(fixtureToUTC(m), tz);
    if (filterDate && key !== filterDate) continue;
    const kickoffMs = fixtureToUTC(m).getTime();
    const cd = applyLiveChip(mid, formatCountdown(m));
    let bucket;
    if (cd.state === "ended" && now - kickoffMs >= TWENTY_FOUR_H) bucket = oldByDate;
    else if (cd.state === "ended")                                  bucket = recentByDate;
    else                                                            bucket = upcomingByDate;
    if (!bucket.has(key)) bucket.set(key, []);
    bucket.get(key).push(m);
  }

  const hasAny = liveMatches.length > 0 || upcomingByDate.size > 0
               || recentByDate.size > 0 || oldByDate.size > 0;
  if (!hasAny) {
    els.scheduleView.innerHTML = `<div class="empty">No matches found for the selected filters.</div>`;
    return;
  }

  // ── Section: Finished > 24h (collapsed, at top) ──────────────────────────
  if (oldByDate.size > 0) {
    const totalOld = [...oldByDate.values()].reduce((s, a) => s + a.length, 0);
    const sec = document.createElement("div");
    sec.className = "schedule-section schedule-section-archived";

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "schedule-archive-toggle";
    toggleBtn.innerHTML = _showOldFinished
      ? `🕘 Older Matches <span class="archive-badge">${totalOld}</span><span class="archive-chevron open" style="margin-left:auto">Hide ▲</span>`
      : `🕘 Older Matches <span class="archive-badge">${totalOld}</span><span class="archive-chevron" style="margin-left:auto">Show ▼</span>`;
    sec.appendChild(toggleBtn);

    const archiveBody = document.createElement("div");
    archiveBody.className = "schedule-archive-body";
    archiveBody.style.display = _showOldFinished ? "" : "none";
    renderScheduleDayGroups(oldByDate, filterTeam, ko, archiveBody);
    sec.appendChild(archiveBody);

    toggleBtn.addEventListener("click", () => {
      _showOldFinished = !_showOldFinished;
      archiveBody.style.display = _showOldFinished ? "" : "none";
      toggleBtn.innerHTML = _showOldFinished
        ? `🕘 Older Matches <span class="archive-badge">${totalOld}</span><span class="archive-chevron open" style="margin-left:auto">Hide ▲</span>`
        : `🕘 Older Matches <span class="archive-badge">${totalOld}</span><span class="archive-chevron" style="margin-left:auto">Show ▼</span>`;
    });

    els.scheduleView.appendChild(sec);
  }

  // ── Section: Recently Finished (< 24h) ───────────────────────────────────
  if (recentByDate.size > 0) {
    const totalRecent = [...recentByDate.values()].reduce((s, a) => s + a.length, 0);
    const sec = document.createElement("div");
    sec.className = "schedule-section schedule-section-archived";

    const recentToggleBtn = document.createElement("button");
    recentToggleBtn.type = "button";
    recentToggleBtn.className = "schedule-archive-toggle recent-toggle";
    recentToggleBtn.innerHTML = _showRecentFinished
      ? `✅ Recently Finished <span class="archive-badge recent-badge">${totalRecent}</span><span class="archive-chevron open" style="margin-left:auto">Hide ▲</span>`
      : `✅ Recently Finished <span class="archive-badge recent-badge">${totalRecent}</span><span class="archive-chevron" style="margin-left:auto">Show ▼</span>`;
    sec.appendChild(recentToggleBtn);

    const recentBody = document.createElement("div");
    recentBody.className = "schedule-archive-body";
    recentBody.style.display = _showRecentFinished ? "" : "none";
    renderScheduleDayGroups(recentByDate, filterTeam, ko, recentBody, true);
    sec.appendChild(recentBody);

    recentToggleBtn.addEventListener("click", () => {
      _showRecentFinished = !_showRecentFinished;
      recentBody.style.display = _showRecentFinished ? "" : "none";
      recentToggleBtn.innerHTML = _showRecentFinished
        ? `✅ Recently Finished <span class="archive-badge recent-badge">${totalRecent}</span><span class="archive-chevron open" style="margin-left:auto">Hide ▲</span>`
        : `✅ Recently Finished <span class="archive-badge recent-badge">${totalRecent}</span><span class="archive-chevron" style="margin-left:auto">Show ▼</span>`;
    });

    els.scheduleView.appendChild(sec);
  }

  // ── Section: Upcoming ─────────────────────────────────────────────────────
  if (upcomingByDate.size > 0) {
    const totalUpcoming = [...upcomingByDate.values()].reduce((s, a) => s + a.length, 0);
    const sec = document.createElement("div");
    sec.className = "schedule-section schedule-section-archived";

    const upcomingToggleBtn = document.createElement("button");
    upcomingToggleBtn.type = "button";
    upcomingToggleBtn.className = "schedule-archive-toggle upcoming-toggle";
    upcomingToggleBtn.innerHTML = _showUpcoming
      ? `📅 Upcoming <span class="archive-badge upcoming-badge">${totalUpcoming}</span><span class="archive-chevron open" style="margin-left:auto">Hide ▲</span>`
      : `📅 Upcoming <span class="archive-badge upcoming-badge">${totalUpcoming}</span><span class="archive-chevron" style="margin-left:auto">Show ▼</span>`;
    sec.appendChild(upcomingToggleBtn);

    const upcomingBody = document.createElement("div");
    upcomingBody.className = "schedule-archive-body";
    upcomingBody.style.display = _showUpcoming ? "" : "none";
    renderScheduleDayGroups(upcomingByDate, filterTeam, ko, upcomingBody);
    sec.appendChild(upcomingBody);

    upcomingToggleBtn.addEventListener("click", () => {
      _showUpcoming = !_showUpcoming;
      upcomingBody.style.display = _showUpcoming ? "" : "none";
      upcomingToggleBtn.innerHTML = _showUpcoming
        ? `📅 Upcoming <span class="archive-badge upcoming-badge">${totalUpcoming}</span><span class="archive-chevron open" style="margin-left:auto">Hide ▲</span>`
        : `📅 Upcoming <span class="archive-badge upcoming-badge">${totalUpcoming}</span><span class="archive-chevron" style="margin-left:auto">Show ▼</span>`;
    });

    els.scheduleView.appendChild(sec);
  }
}

// --- Knockout resolution ---
function isGroupStageComplete() {
  return FIXTURES
    .filter(m => m.stage === "group")
    .every(m => {
      const r = getResult(m);
      return r && r.score1 !== undefined && r.score2 !== undefined;
    });
}

// Builds a KO assignment object based on current standings, always resolving
// teams from live group standings regardless of whether the group stage is complete.
// Used for the "Current Bracket" view in Table Predict.
function buildCurrentBracketKo() {
  const winners = {};
  const runnersUp = {};
  const thirds = [];

  for (const letter of Object.keys(GROUPS)) {
    const s = computeStandings(letter);
    if (s[0]) winners[letter] = s[0].team;
    if (s[1]) runnersUp[letter] = s[1].team;
    if (s[2]) thirds.push({ group: letter, ...s[2] });
  }

  thirds.sort((a, b) =>
    b.points - a.points || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team)
  );
  const rankedThirds = applyThirdsOverride(thirds);
  const top8 = rankedThirds.slice(0, 8);

  const thirdsAssignments = {};
  if (top8.length === 8) {
    const matrixLookup = (typeof lookupFifaThirdPlaceMatrix === "function")
      ? lookupFifaThirdPlaceMatrix(top8.map(t => t.group))
      : null;

    if (matrixLookup) {
      const groupToTeam = {};
      for (const t of top8) groupToTeam[t.group] = t;
      for (const m of FIXTURES) {
        if (m.stage !== "r32") continue;
        const winMatch = m.team1.match(/^([A-L])1$/);
        if (!winMatch) continue;
        const winnerLetter = winMatch[1];
        const thirdGroup = matrixLookup[winnerLetter];
        if (!thirdGroup) continue;
        const teamInfo = groupToTeam[thirdGroup];
        if (teamInfo) thirdsAssignments[`${matchId(m)}:2`] = teamInfo;
      }
    } else {
      const used = new Set();
      for (const m of FIXTURES) {
        if (m.stage !== "r32") continue;
        for (const pos of [1, 2]) {
          const ph = pos === 1 ? m.team1 : m.team2;
          if (!ph.startsWith("3rd ")) continue;
          const candidates = ph.replace("3rd ", "").split("/");
          const pick = top8.find(t => !used.has(t.team) && candidates.includes(t.group));
          if (pick) {
            thirdsAssignments[`${matchId(m)}:${pos}`] = pick;
            used.add(pick.team);
          }
        }
      }
    }
  }

  // Force complete=true so resolveTeamName resolves all R32 slots
  return { complete: true, winners, runnersUp, allThirds: rankedThirds, top8, thirdsAssignments };
}

// Reorders the ranked third-place table by the admin override (a list of group
// letters), mirroring the per-group standings override. Used to make the best-8
// cut match FIFA when third-placed teams are tied beyond what the app computes
// (fair play / drawing of lots). Returns the input unchanged when no override.
function applyThirdsOverride(thirds) {
  const override = state.standingsOverride[THIRDS_OVERRIDE_KEY];
  if (!Array.isArray(override) || override.length === 0) return thirds;
  const byGroup = new Map(thirds.map(r => [r.group, r]));
  const ordered = [];
  for (const g of override) {
    if (byGroup.has(g)) { ordered.push(byGroup.get(g)); byGroup.delete(g); }
  }
  // Append any thirds not named in the override, keeping their computed order.
  for (const r of byGroup.values()) ordered.push(r);
  return ordered;
}

function getKnockoutAssignments() {
  const complete = isGroupStageComplete();
  const winners = {};
  const runnersUp = {};
  const thirds = [];
  // Group positions that are mathematically locked (even before the group is
  // finished) so clinched teams drop into their A1/A2 knockout slots early.
  const locked = {};

  for (const letter of Object.keys(GROUPS)) {
    const s = computeStandings(letter);
    if (s[0]) winners[letter] = s[0].team;
    if (s[1]) runnersUp[letter] = s[1].team;
    if (s[2]) thirds.push({ group: letter, ...s[2] });
    if (!complete) locked[letter] = groupClinch(letter).locked;
  }

  thirds.sort((a, b) =>
    b.points - a.points || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team)
  );
  const top8 = applyThirdsOverride(thirds).slice(0, 8);

  // Assign the 8 qualifying third-placers to R32 slots. When the official
  // FIFA matrix (495-row lookup) is loaded, use it for an exact match to
  // FIFA's published bracket. Otherwise fall back to a greedy assignment.
  const thirdsAssignments = {};
  if (complete) {
    const matrixLookup = (typeof lookupFifaThirdPlaceMatrix === "function")
      ? lookupFifaThirdPlaceMatrix(top8.map(t => t.group))
      : null;

    if (matrixLookup) {
      // Official FIFA matrix: each Winner letter maps to the 3rd-of-X group letter.
      const groupToTeam = {};
      for (const t of top8) groupToTeam[t.group] = t;
      for (const m of FIXTURES) {
        if (m.stage !== "r32") continue;
        const winMatch = m.team1.match(/^([A-L])1$/);
        if (!winMatch) continue;
        const winnerLetter = winMatch[1];
        const thirdGroup = matrixLookup[winnerLetter];
        if (!thirdGroup) continue;
        const teamInfo = groupToTeam[thirdGroup];
        if (teamInfo) thirdsAssignments[`${matchId(m)}:2`] = teamInfo;
      }
    } else {
      // Fallback: greedy assignment respecting candidate-group constraints.
      const used = new Set();
      for (const m of FIXTURES) {
        if (m.stage !== "r32") continue;
        for (const pos of [1, 2]) {
          const ph = pos === 1 ? m.team1 : m.team2;
          if (!ph.startsWith("3rd ")) continue;
          const candidates = ph.replace("3rd ", "").split("/");
          const pick = top8.find(t => !used.has(t.team) && candidates.includes(t.group));
          if (pick) {
            thirdsAssignments[`${matchId(m)}:${pos}`] = pick;
            used.add(pick.team);
          }
        }
      }
    }
  }

  return { complete, winners, runnersUp, locked, top8, thirdsAssignments };
}

function resolveTeamName(placeholder, m, pos, ko) {
  if (!ko) return null;
  let match;
  // Group winner / runner-up: use the final order once complete, otherwise fall
  // back to a mathematically-locked position (clinched team) if there is one.
  if ((match = placeholder.match(/^([A-L])1$/))) {
    const L = match[1];
    if (ko.complete) return ko.winners[L] || null;
    return (ko.locked && ko.locked[L] && ko.locked[L][1]) || null;
  }
  if ((match = placeholder.match(/^([A-L])2$/))) {
    const L = match[1];
    if (ko.complete) return ko.runnersUp[L] || null;
    return (ko.locked && ko.locked[L] && ko.locked[L][2]) || null;
  }
  // Best-third slots still need the full group stage finished.
  if (placeholder.startsWith("3rd ")) {
    if (!ko.complete) return null;
    const a = ko.thirdsAssignments[`${matchId(m)}:${pos}`];
    return a ? a.team : null;
  }
  return null;
}

// Recursively resolve the two teams that should be in a match, walking back
// through the bracket as far as results allow. Returns { team1, team2 } where
// each is a real team name or null when not yet determined.
function resolveMatchTeams(m, ko) {
  if (m.stage === "group") return { team1: m.team1, team2: m.team2 };
  if (m.stage === "r32") {
    return {
      team1: resolveTeamName(m.team1, m, 1, ko),
      team2: resolveTeamName(m.team2, m, 2, ko),
    };
  }
  if (!m.bracket) return { team1: null, team2: null };
  return {
    team1: resolveBracketSlot(m.bracket.team1, ko),
    team2: resolveBracketSlot(m.bracket.team2, ko),
  };
}

function resolveBracketSlot(slot, ko) {
  const stageMatches = FIXTURES.filter(f => f.stage === slot.stage);
  const src = stageMatches[slot.index];
  if (!src) return null;
  return getKnockoutOutcome(src, slot.role, ko);
}

// Returns the winner or loser name of a knockout match, or null if undecided.
function getKnockoutOutcome(m, role, ko) {
  const { team1, team2 } = resolveMatchTeams(m, ko);
  if (!team1 || !team2) return null;
  const r = getResult(m);
  if (!r || r.score1 === undefined || r.score2 === undefined) return null;
  let winner, loser;
  if (r.score1 > r.score2) { winner = team1; loser = team2; }
  else if (r.score2 > r.score1) { winner = team2; loser = team1; }
  else if (r.pen1 !== undefined && r.pen2 !== undefined && r.pen1 !== r.pen2) {
    if (r.pen1 > r.pen2) { winner = team1; loser = team2; }
    else { winner = team2; loser = team1; }
  } else {
    return null; // tied without a tiebreaker
  }
  return role === "winner" ? winner : loser;
}

// resolveResult lets callers inject hypothetical results (used by clinchStatus's
// enumeration); applyOverride=false skips the admin manual reordering so the
// returned order reflects pure on-pitch computation.
function computeStandings(groupLetter, resolveResult = getResult, applyOverride = true) {
  const teams = GROUPS[groupLetter];
  const stats = {};
  teams.forEach(t => {
    stats[t] = { team: t, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, gd: 0, points: 0, fp: 0 };
  });

  const playedMatches = []; // for head-to-head tiebreaks
  for (const m of FIXTURES) {
    if (m.stage !== "group" || m.group !== groupLetter) continue;
    const r = resolveResult(m);
    if (!r || r.score1 === undefined || r.score2 === undefined) continue;
    const a = stats[m.team1], b = stats[m.team2];
    if (!a || !b) continue;
    playedMatches.push({ t1: m.team1, t2: m.team2, s1: r.score1, s2: r.score2 });
    // Fair play points (FIFA: yellow −1, second yellow −3, red −4, yellow+red −5)
    if (Array.isArray(r.cards)) {
      const byPlayer = {};
      for (const c of r.cards) {
        const p = byPlayer[c.team + "|" + c.name] || (byPlayer[c.team + "|" + c.name] = { side: c.team, y: 0, yr: 0, rd: 0 });
        p[c.card === "yellow" ? "y" : c.card === "yellowred" ? "yr" : "rd"]++;
      }
      for (const k in byPlayer) {
        const p = byPlayer[k];
        (p.side === 1 ? a : b).fp -= (p.rd && p.y) ? 5 : p.rd ? 4 : p.yr ? 3 : 1;
      }
    }
    a.played++; b.played++;
    a.gf += r.score1; a.ga += r.score2;
    b.gf += r.score2; b.ga += r.score1;
    if (r.score1 > r.score2) { a.wins++; a.points += 3; b.losses++; }
    else if (r.score2 > r.score1) { b.wins++; b.points += 3; a.losses++; }
    else { a.draws++; b.draws++; a.points++; b.points++; }
  }

  for (const t in stats) stats[t].gd = stats[t].gf - stats[t].ga;

  // Final fallback when every sporting criterion is equal. FIFA 2026 removed the
  // drawing of lots and uses the FIFA World Ranking; we approximate that with
  // FIFA's official published group position, then alphabetical if the live
  // standings feed isn't available.
  const officialPos = (team) =>
    (typeof liveScores !== "undefined" && liveScores.officialPosition)
      ? liveScores.officialPosition(team) : null;
  const finalTieBreak = (x, y) => {
    const px = officialPos(x.team), py = officialPos(y.team);
    if (px !== null && py !== null && px !== py) return px - py;
    return x.team.localeCompare(y.team);
  };

  // Head-to-head mini-table (points/GD/GF) among a subset of teams.
  function h2hTable(group) {
    const ids = new Set(group.map(s => s.team));
    const t = {};
    group.forEach(s => { t[s.team] = { p: 0, gd: 0, gf: 0 }; });
    for (const g of playedMatches) {
      if (!ids.has(g.t1) || !ids.has(g.t2)) continue;
      t[g.t1].gf += g.s1; t[g.t1].gd += g.s1 - g.s2;
      t[g.t2].gf += g.s2; t[g.t2].gd += g.s2 - g.s1;
      if (g.s1 > g.s2) t[g.t1].p += 3;
      else if (g.s2 > g.s1) t[g.t2].p += 3;
      else { t[g.t1].p++; t[g.t2].p++; }
    }
    return t;
  }

  // FIFA 2026 tiebreakers for teams level on POINTS — head-to-head now ranks
  // ABOVE overall goal difference:
  //   1) H2H points  2) H2H GD  3) H2H GF  (re-applied to any subset still level)
  //   then 4) overall GD  5) overall GF  6) fair play  7) FIFA ranking.
  function rankLevelOnPoints(group) {
    if (group.length === 1) return group;
    const h = h2hTable(group);
    const ordered = [...group].sort((x, y) =>
      h[y.team].p - h[x.team].p || h[y.team].gd - h[x.team].gd || h[y.team].gf - h[x.team].gf || 0);
    const out = [];
    for (let i = 0; i < ordered.length; ) {
      let j = i + 1;
      while (j < ordered.length &&
        h[ordered[j].team].p === h[ordered[i].team].p &&
        h[ordered[j].team].gd === h[ordered[i].team].gd &&
        h[ordered[j].team].gf === h[ordered[i].team].gf) j++;
      const sub = ordered.slice(i, j);
      if (sub.length === 1) out.push(sub[0]);
      else if (sub.length < group.length) out.push(...rankLevelOnPoints(sub)); // re-apply H2H to the still-level subset
      else out.push(...sub.sort((x, y) =>   // whole set still level on H2H → overall criteria
        y.gd - x.gd || y.gf - x.gf || y.fp - x.fp || finalTieBreak(x, y)));
      i = j;
    }
    return out;
  }

  // If the group has no entered results, show all teams alphabetically with zeros.
  const groupHasAnyResult = Object.values(stats).some(s => s.played > 0);
  let sorted;
  if (!groupHasAnyResult) {
    sorted = Object.values(stats).sort((x, y) => x.team.localeCompare(y.team));
  } else {
    sorted = Object.values(stats).sort((x, y) => y.points - x.points);
    // Re-rank each run of teams level on points by the FIFA 2026 criteria.
    for (let i = 0; i < sorted.length; ) {
      let j = i + 1;
      while (j < sorted.length && sorted[j].points === sorted[i].points) j++;
      if (j - i > 1) sorted.splice(i, j - i, ...rankLevelOnPoints(sorted.slice(i, j)));
      i = j;
    }
  }

  // Apply admin override (manual reordering) if present for this group.
  const override = applyOverride ? state.standingsOverride[groupLetter] : null;
  if (override && Array.isArray(override) && override.length > 0) {
    const byName = new Map(sorted.map(r => [r.team, r]));
    const ordered = [];
    for (const name of override) {
      const row = byName.get(name);
      if (row) {
        ordered.push(row);
        byName.delete(name);
      }
    }
    // Append any teams not in the override (e.g., if data shifted), keeping their sorted order
    for (const row of byName.values()) ordered.push(row);
    return ordered;
  }
  return sorted;
}

// Tiebreaker-aware clinch detection: which teams have mathematically secured 1st
// place or a top-2 (knockout) spot, no matter how the remaining group matches go.
// Enumerates every win/draw/loss combination of the not-yet-final matches and,
// within each, uses scorelines maximally adversarial to the team being tested,
// then runs the real FIFA-2026 tiebreakers via computeStandings(). This catches
// clinches that are locked by head-to-head before they show on raw points.
// Tiebreaker-aware group analysis. Enumerates every win/draw/loss combination of
// the not-yet-final matches and runs the real FIFA-2026 tiebreakers via
// computeStandings(), using scorelines adversarial (worst rank) or favorable
// (best rank) to each team. Returns:
//   status: { team: "champ"|"qualified"|"out" }
//     champ     = guaranteed 1st            qualified = guaranteed top 2
//     out       = can't reach the top 3 (eliminated; 4th never advances and
//                 best-thirds are 3rd-placed teams)
//   locked: { 1: team, 2: team }  group positions that are mathematically fixed,
//           so they can be dropped straight into the A1 / A2 knockout slots.
const _groupClinchCache = new Map(); // letter -> { sig, value } — clinch depends only on FINAL results
function groupClinch(groupLetter) {
  const teams = GROUPS[groupLetter];

  // Split this group's matches into final (locked result) and remaining, and
  // build a signature of the final results (the only thing clinch depends on —
  // a live, in-progress match doesn't change it until it ends).
  const finalIds = new Set();
  const remaining = [];
  const sigParts = [];
  for (const m of FIXTURES) {
    if (m.stage !== "group" || m.group !== groupLetter) continue;
    const r = getResult(m);
    const ended = formatCountdown(m).state === "ended";
    const live = typeof liveScores !== "undefined" && liveScores.get(matchId(m)) && liveScores.get(matchId(m)).isLive;
    if (ended && !live && r && r.score1 !== undefined && r.score2 !== undefined) {
      finalIds.add(matchId(m));
      sigParts.push(`${r.score1}-${r.score2}`);
    } else {
      remaining.push(m);
      sigParts.push("x");
    }
  }
  const sig = sigParts.join(",");
  const cached = _groupClinchCache.get(groupLetter);
  if (cached && cached.sig === sig) return cached.value;

  const status = {}, locked = {};
  // Nothing can be clinched this early; also caps the enumeration (3^5 = 243).
  if (remaining.length > 5) { const v = { status, locked }; _groupClinchCache.set(groupLetter, { sig, value: v }); return v; }

  const BIG = 50; // dominates any realistic group goal difference
  const total = Math.pow(3, remaining.length);

  // favor=false → scorelines push X as low as possible; favor=true → as high.
  const resolverFor = (X, favor, outcome) => (m) => {
    const id = matchId(m);
    if (finalIds.has(id)) return getResult(m);
    const o = outcome.get(id);                   // 0 = team1 win, 1 = draw, 2 = team2 win
    if (o === undefined) return undefined;
    if (o === 1) return { score1: 0, score2: 0 };
    if (favor) {
      if (o === 0) return { score1: m.team1 === X ? BIG : 1, score2: 0 };
      return { score1: 0, score2: m.team2 === X ? BIG : 1 };
    }
    if (o === 0) return { score1: m.team1 === X ? 1 : BIG, score2: 0 };
    return { score1: 0, score2: m.team2 === X ? 1 : BIG };
  };
  const forEachCombo = (cb) => {
    for (let c = 0; c < total; c++) {
      let n = c;
      const outcome = new Map();
      for (const m of remaining) { outcome.set(matchId(m), n % 3); n = Math.floor(n / 3); }
      if (cb(outcome) === false) break;
    }
  };
  // Highest (worst) index X can finish at, across all completions.
  const worstRank = (X) => {
    let worst = 0;
    forEachCombo((o) => {
      const rank = computeStandings(groupLetter, resolverFor(X, false, o), false).findIndex(s => s.team === X);
      if (rank > worst) worst = rank;
      if (worst >= 2) return false;   // already out of the top 2 somewhere
    });
    return worst;
  };
  // Does any completion let X finish at index <= target? (favorable scorelines)
  const canReach = (X, target) => {
    let ok = false;
    forEachCombo((o) => {
      const rank = computeStandings(groupLetter, resolverFor(X, true, o), false).findIndex(s => s.team === X);
      if (rank <= target) { ok = true; return false; }
    });
    return ok;
  };

  for (const t of teams) {
    const w = worstRank(t);
    if (w === 0) { status[t] = "champ"; locked[1] = t; }       // always 1st
    else if (w === 1) {
      status[t] = "qualified";
      if (!canReach(t, 0)) locked[2] = t;                       // never 1st, never below 2nd → fixed 2nd
    } else if (!canReach(t, 2)) {
      status[t] = "out";                                        // can't reach the top 3
    }
  }
  const value = { status, locked };
  _groupClinchCache.set(groupLetter, { sig, value });
  return value;
}

function clinchStatus(groupLetter) { return groupClinch(groupLetter).status; }

function buildStandingsTable(letter, thirdQualifyingGroups) {
  const rows = computeStandings(letter);
  const clinch = clinchStatus(letter);
  const table = document.createElement("div");
  table.className = "standings-table";
  table.dataset.group = letter;
  const hasOverride = Array.isArray(state.standingsOverride[letter]) &&
    state.standingsOverride[letter].length > 0;
  const resetBtnHTML = (state.isAdmin && hasOverride)
    ? `<button class="reset-order-btn" data-group="${letter}" title="Reset to computed order">↻ Reset order</button>`
    : "";
  table.innerHTML = `
    <h3>Group ${letter} ${resetBtnHTML}</h3>
    <table>
      <thead>
        <tr>
          <th class="pos">#</th>
          <th class="team-col">Team</th>
          <th>P</th><th>W</th><th>D</th><th>L</th>
          <th>GF</th><th>GA</th><th>GD</th><th class="pts">Pts</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((r, i) => {
    let cls = "";
    if (i < 2) cls = "qualify";
    else if (i === 2 && thirdQualifyingGroups.has(letter)) cls = "qualify-third";
    const moveBtns = state.isAdmin
      ? `<span class="row-move">
                 <button class="row-move-btn" data-group="${letter}" data-from="${i}" data-dir="-1" ${i === 0 ? "disabled" : ""} title="Move up">▲</button>
                 <button class="row-move-btn" data-group="${letter}" data-from="${i}" data-dir="1" ${i === rows.length - 1 ? "disabled" : ""} title="Move down">▼</button>
               </span>`
      : "";
    const clinchBadge = clinch[r.team] === "champ"
      ? `<span class="clinch-badge clinch-champ" title="Group winner secured — can't be caught">🏆 1st</span>`
      : clinch[r.team] === "qualified"
        ? `<span class="clinch-badge clinch-qualified" title="Qualified — top-2 spot secured">✓ Qualified</span>`
        : clinch[r.team] === "out"
          ? `<span class="clinch-badge clinch-out" title="Eliminated — can't reach the top 3">❌ Out</span>`
          : "";
    const rowCls = cls + (clinch[r.team] === "out" ? " eliminated-row" : "");
    return `
          <tr class="${rowCls}" data-team="${escapeHTML(r.team)}">
            <td class="pos">${i + 1}${moveBtns}</td>
            <td class="team-col"><span class="flag">${flagFor(r.team)}</span>${r.team}${clinchBadge}</td>
            <td>${r.played}</td>
            <td>${r.wins}</td>
            <td>${r.draws}</td>
            <td>${r.losses}</td>
            <td>${r.gf}</td>
            <td>${r.ga}</td>
            <td>${r.gd > 0 ? "+" + r.gd : r.gd}</td>
            <td class="pts"><span class="st-pts-val">${r.points}</span></td>
          </tr>`;
  }).join("")}
      </tbody>
    </table>
  `;
  return table;
}

// Patch only the standings tables for the given group letters —
// leaves the intro section and all other group tables untouched.
function patchStandingsTables(changedGroups) {
  const grid = els.standingsView.querySelector(".standings-grid");
  if (!grid) { renderStandings(); return; }
  const ko = buildCurrentBracketKo();
  const thirdQualifyingGroups = new Set(ko.top8.map(t => t.group));
  const flipFirst = captureStandingsPositions(grid);
  for (const letter of changedGroups) {
    const existing = grid.querySelector(`.standings-table[data-group="${letter}"]`);
    if (!existing) continue;
    existing.replaceWith(buildStandingsTable(letter, thirdQualifyingGroups));
  }
  applyStandingsFlipCount(grid, flipFirst);
  const existingPanel = els.standingsView.querySelector(".thirds-panel");
  if (existingPanel) existingPanel.replaceWith(renderThirdPlacePanel(ko.allThirds));
}

function renderThirdPlacePanel(allThirds) {
  if (!allThirds) allThirds = buildCurrentBracketKo().allThirds;

  const panel = document.createElement("div");
  panel.className = "thirds-panel";
  const thirds = allThirds;

  if (thirds.length === 0) {
    panel.innerHTML = `<h3 class="thirds-panel-title">Best Third-Place Teams</h3><p class="thirds-panel-hint">No group matches played yet.</p>`;
    return panel;
  }

  const isAdmin = state.isAdmin;
  const hasOverride = Array.isArray(state.standingsOverride[THIRDS_OVERRIDE_KEY]) &&
    state.standingsOverride[THIRDS_OVERRIDE_KEY].length > 0;

  const rows = thirds.map((r, i) => {
    const isQ = i < 8;
    const gdStr = r.gd > 0 ? "+" + r.gd : r.gd;
    const moveBtns = isAdmin
      ? `<td class="thirds-move"><span class="row-move">
             <button class="row-move-btn thirds-move-btn" data-from="${i}" data-dir="-1" ${i === 0 ? "disabled" : ""} title="Move up">▲</button>
             <button class="row-move-btn thirds-move-btn" data-from="${i}" data-dir="1" ${i === thirds.length - 1 ? "disabled" : ""} title="Move down">▼</button>
           </span></td>`
      : "";
    return `
      <tr class="${isQ ? "qualify-third" : "thirds-out"}${i === 7 ? " thirds-cutoff" : ""}">
        <td class="thirds-pos">${i + 1}</td>
        <td class="thirds-team"><span class="flag">${flagFor(r.team)}</span>${escapeHTML(r.team)}</td>
        <td class="thirds-group">Group ${r.group}</td>
        <td>${r.points}</td>
        <td>${gdStr}</td>
        <td>${r.gf}</td>
        <td>${r.played}</td>
        ${moveBtns}
      </tr>`;
  }).join("");

  const resetBtn = (isAdmin && hasOverride)
    ? `<button class="reset-order-btn thirds-reset-btn" title="Reset to computed order">↻ Reset order</button>`
    : "";
  const adminHint = isAdmin
    ? `<p class="thirds-panel-hint">Admin: reorder with ▲▼ to set which 8 qualify when third-placed teams are tied beyond goals (FIFA fair play / drawing of lots). Your order syncs to all viewers.</p>`
    : "";

  panel.innerHTML = `
    <h3 class="thirds-panel-title">Best Third-Place Teams ${resetBtn}</h3>
    <p class="thirds-panel-hint">Top 8 of 12 third-placed teams qualify for the Round of 32 (<span class="legend-gold">gold</span>). Updates live.</p>
    ${adminHint}
    <div class="thirds-table-wrap">
      <table class="thirds-table">
        <thead>
          <tr>
            <th class="thirds-pos">#</th>
            <th class="thirds-team">Team</th>
            <th class="thirds-group">Group</th>
            <th title="Points">Pts</th>
            <th title="Goal Difference">GD</th>
            <th title="Goals For">GF</th>
            <th title="Played">P</th>
            ${isAdmin ? `<th class="thirds-move" title="Reorder">⇅</th>` : ""}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  // Admin reorder + reset (listener lives on the panel so it survives the
  // wholesale panel replacement done by patchStandingsTables).
  if (isAdmin) {
    panel.addEventListener("click", (e) => {
      const moveBtn = e.target.closest(".thirds-move-btn");
      const reset = e.target.closest(".thirds-reset-btn");
      if (moveBtn) {
        moveThirdsRow(+moveBtn.dataset.from, +moveBtn.dataset.dir);
      } else if (reset) {
        delete state.standingsOverride[THIRDS_OVERRIDE_KEY];
        saveStandingsOverride();
        appwriteSync.scheduleStandings(THIRDS_OVERRIDE_KEY);
        renderStandings();
      }
    });
  }
  return panel;
}

function moveThirdsRow(fromIndex, dir) {
  // Capture the current displayed ranking (group letters), swap, and pin it.
  const order = buildCurrentBracketKo().allThirds.map(r => r.group);
  const to = fromIndex + dir;
  if (to < 0 || to >= order.length) return;
  [order[fromIndex], order[to]] = [order[to], order[fromIndex]];
  state.standingsOverride[THIRDS_OVERRIDE_KEY] = order;
  saveStandingsOverride();
  appwriteSync.scheduleStandings(THIRDS_OVERRIDE_KEY);
  renderStandings();
}

// Live-standings animation (same feel as the leaderboard): rows slide to new
// positions and the Pts value counts up/down with a pop + ▲/▼ badge + sound.
const _stTotals = new Map();   // team -> last shown points
function captureStandingsPositions(container) {
  const pos = new Map();
  if (!container || container.offsetParent === null) return pos;   // hidden → no animation
  container.querySelectorAll("tr[data-team]").forEach(tr => pos.set(tr.dataset.team, tr.getBoundingClientRect().top));
  return pos;
}
function applyStandingsFlipCount(container, firstPos) {
  let anyChange = false, anyUp = false;
  container.querySelectorAll("tr[data-team]").forEach(tr => {
    const team = tr.dataset.team;
    const ptsEl = tr.querySelector(".st-pts-val");
    if (ptsEl) {
      const np = Number(ptsEl.textContent);
      const pp = _stTotals.get(team);
      if (pp !== undefined && pp !== np) {
        animateCount(ptsEl, pp, np, tr.querySelector(".pts"));
        anyChange = true;
        if (np > pp) anyUp = true;
      }
      _stTotals.set(team, np);
    }
    const first = firstPos.get(team);
    if (first === undefined) return;
    const delta = first - tr.getBoundingClientRect().top;
    if (Math.abs(delta) < 1) return;
    tr.style.transition = "none";
    tr.style.transform = `translateY(${delta}px)`;
    requestAnimationFrame(() => {
      tr.style.transition = "transform 0.55s cubic-bezier(0.25, 0.46, 0.45, 0.94)";
      tr.style.transform = "";
      tr.addEventListener("transitionend", () => { tr.style.transition = ""; tr.style.transform = ""; }, { once: true });
    });
  });
  if (anyChange) playPointChangeSound(anyUp);
}

function renderStandings() {
  const flipFirst = captureStandingsPositions(els.standingsView);
  els.standingsView.innerHTML = "";

  const intro = document.createElement("div");
  intro.className = "standings-intro";
  intro.innerHTML = `
    <p>Tables below update live. Top two from each group qualify (<span class="legend-green">green</span>), plus the 8 best third-placed teams across all groups (<span class="legend-gold">gold</span>). See the ranked table below the group tables.</p>
    ${state.isAdmin ? `
      <div class="action-row">
        <button id="exportBtn" type="button" class="action-btn">⬇ Export results</button>
        <label class="action-btn" id="importLabel">
          ⬆ Import results
          <input id="importInput" type="file" accept="application/json,.json" hidden>
        </label>
        <button id="loadLatestBtn" type="button" class="action-btn">⟳ Load latest from server</button>
        <button id="resetResultsBtn" type="button" class="danger-btn">Clear all results</button>
      </div>
      <p class="hint">
        <strong>Sharing results via GitHub:</strong> click <em>Export</em>, commit the downloaded
        <code>results.json</code> file in your repo, push it, and every visitor will see those
        results as defaults (their personal edits in localStorage take priority).
      </p>` : ""}
  `;
  els.standingsView.appendChild(intro);

  if (state.isAdmin) {
    intro.querySelector("#resetResultsBtn").addEventListener("click", async () => {
      const ok = await showConfirm(
        "This will clear every match score and reset the standings tables to their default order.",
        {
          title: "Clear all results?",
          icon: "🗑",
          iconType: "danger",
          confirmLabel: "Clear all",
          danger: true,
        });
      if (!ok) return;
      // Pull the full server-side list FIRST so we delete what actually exists
      // on Appwrite, not just whatever this device happens to have cached.
      // Without this, clearing from a stale device leaves other devices' writes intact.
      const allMatchIds = new Set(Object.keys(state.results));
      const allLetters = new Set(Object.keys(state.standingsOverride));
      if (appwriteSync.available) {
        const serverData = await appwriteSync.bootstrap();
        if (serverData) {
          for (const mid of Object.keys(serverData.results)) allMatchIds.add(mid);
          for (const letter of Object.keys(serverData.overrides)) allLetters.add(letter);
        }
      }
      state.results = {};
      state.standingsOverride = {};
      saveResults();
      saveStandingsOverride();
      // Propagate deletions — every pushMatch sees no local entry → sends DELETE
      for (const mid of allMatchIds) appwriteSync.scheduleMatch(mid);
      for (const letter of allLetters) appwriteSync.scheduleStandings(letter);
      // Also clear cached version so the next page load doesn't trust stale meta
      try { localStorage.removeItem(CACHE_VERSION_KEY); } catch {}
      renderStandings();
      if (state.view === "schedule") renderSchedule(state.selectedTeam, state.selectedDate);
    });

    intro.querySelector("#exportBtn").addEventListener("click", exportResults);

    intro.querySelector("#importInput").addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) importResultsFromFile(file);
      e.target.value = ""; // allow re-selecting the same file
    });

    intro.querySelector("#loadLatestBtn").addEventListener("click", async () => {
      // With Appwrite available, pull fresh state directly from the realtime backend
      let payload;
      if (appwriteSync.available) {
        const data = await appwriteSync.bootstrap();
        if (!data) {
          showAlert("Could not reach Appwrite. Check your network or project settings.", {
            title: "Load failed", icon: "⚠️", iconType: "warning",
          });
          return;
        }
        payload = { results: data.results, standingsOverride: data.overrides };
      } else {
        const p = await loadLatestFromServer();
        if (p && p.__error) {
          showAlert(
            `Could not load results.json from server.\n\n${p.__error}\n\nMake sure results.json is committed to the repo root.`,
            { title: "Load failed", icon: "⚠️", iconType: "warning" }
          );
          return;
        }
        payload = p;
      }
      if (!payload || Object.keys(payload.results).length === 0) {
        showAlert("No results found on the server.", {
          title: "Nothing to load", icon: "ℹ️", iconType: "info",
        });
        return;
      }
      if (Object.keys(state.results).length > 0) {
        const ok = await showConfirm("Overwrite your local results with the latest from the server?", {
          title: "Load from server",
          icon: "⟳",
          confirmLabel: "Overwrite",
          danger: true,
        });
        if (!ok) return;
      }
      applyServerData(payload);
      rerenderActive();
      showAlert(`Loaded ${Object.keys(payload.results).length} match results from server.`, {
        title: "Loaded",
        icon: "✅",
        iconType: "success",
      });
    });
  }

  const grid = document.createElement("div");
  grid.className = "standings-grid";

  const ko = buildCurrentBracketKo();
  const thirdQualifyingGroups = new Set(ko.top8.map(t => t.group));

  const letters = Object.keys(GROUPS).sort();
  for (const letter of letters) {
    const table = buildStandingsTable(letter, thirdQualifyingGroups);
    grid.appendChild(table);
  }

  els.standingsView.appendChild(grid);
  els.standingsView.appendChild(renderThirdPlacePanel(ko.allThirds));
  applyStandingsFlipCount(els.standingsView, flipFirst);

  // Admin: wire up row reorder + per-group reset buttons (event delegation).
  if (state.isAdmin) {
    grid.addEventListener("click", (e) => {
      const moveBtn = e.target.closest(".row-move-btn");
      const resetBtn = e.target.closest(".reset-order-btn");
      if (moveBtn) {
        const letter = moveBtn.dataset.group;
        const from = +moveBtn.dataset.from;
        const dir = +moveBtn.dataset.dir;
        moveStandingsRow(letter, from, dir);
      } else if (resetBtn) {
        const letter = resetBtn.dataset.group;
        delete state.standingsOverride[letter];
        saveStandingsOverride();
        appwriteSync.scheduleStandings(letter);
        renderStandings();
      }
    });
  }
}

function moveStandingsRow(letter, fromIndex, dir) {
  // Build the current order (using whatever standings computeStandings returns)
  const currentRows = computeStandings(letter);
  const order = currentRows.map(r => r.team);
  const to = fromIndex + dir;
  if (to < 0 || to >= order.length) return;
  [order[fromIndex], order[to]] = [order[to], order[fromIndex]];
  state.standingsOverride[letter] = order;
  saveStandingsOverride();
  appwriteSync.scheduleStandings(letter);
  renderStandings();
}

function renderBracket(ko) {
  els.bracketView.innerHTML = "";
  if (!ko) ko = buildCurrentBracketKo();

  const finalMatch = FIXTURES.find(m => m.stage === "final");
  const champion = finalMatch ? getKnockoutOutcome(finalMatch, "winner", ko) : null;
  if (champion) {
    const banner = document.createElement("div");
    banner.className = "ko-banner champion-banner";
    banner.innerHTML = `🏆 <span class="flag">${flagFor(champion)}</span> <strong>${champion}</strong> are World Champions!`;
    els.bracketView.appendChild(banner);
  }

  // ── Layout toggle ─────────────────────────────────────────────────────────
  const toggleBar = document.createElement("div");
  toggleBar.className = "bracket-layout-toggle";
  toggleBar.innerHTML = `
    <span class="bracket-layout-label">Layout:</span>
    <button type="button" class="bracket-layout-btn${state.bracketLayout === "onesided" ? " active" : ""}" data-layout="onesided">One-sided</button>
    <button type="button" class="bracket-layout-btn${state.bracketLayout === "twosided" ? " active" : ""}" data-layout="twosided">Two-sided</button>
  `;
  toggleBar.querySelectorAll(".bracket-layout-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      state.bracketLayout = btn.dataset.layout;
      localStorage.setItem("wc26_bracketLayout", state.bracketLayout);
      renderBracket();
    });
  });
  els.bracketView.appendChild(toggleBar);

  const allR32   = getMatchesInBracketOrder("r32");
  const allR16   = getMatchesInBracketOrder("r16");
  const allQF    = getMatchesInBracketOrder("qf");
  const allSF    = getMatchesInBracketOrder("sf");
  const allFinal = getMatchesInBracketOrder("final");

  function makeRound(label, matches) {
    const col = document.createElement("div");
    col.className = "bracket-round";
    const title = document.createElement("h3");
    title.className = "bracket-round-title";
    title.textContent = label;
    col.appendChild(title);
    const matchesDiv = document.createElement("div");
    matchesDiv.className = "bracket-matches";
    for (const m of matches) matchesDiv.appendChild(renderBracketMatch(m, ko));
    col.appendChild(matchesDiv);
    return col;
  }

  const wrap = document.createElement("div");
  wrap.className = "bracket-scroll";

  if (state.bracketLayout === "twosided") {
    const grid = document.createElement("div");
    grid.className = "bracket-two-sided";

    const leftHalf = document.createElement("div");
    leftHalf.className = "bracket-half bracket-left";
    leftHalf.appendChild(makeRound("Round of 32", allR32.slice(0, 8)));
    leftHalf.appendChild(makeRound("Round of 16", allR16.slice(0, 4)));
    leftHalf.appendChild(makeRound("Quarterfinals", allQF.slice(0, 2)));
    leftHalf.appendChild(makeRound("Semifinals", allSF.slice(0, 1)));

    const center = document.createElement("div");
    center.className = "bracket-center";
    const centerTitle = document.createElement("h3");
    centerTitle.className = "bracket-round-title";
    centerTitle.textContent = "Final";
    center.appendChild(centerTitle);
    const finalDiv = document.createElement("div");
    finalDiv.className = "bracket-matches";
    for (const m of allFinal) finalDiv.appendChild(renderBracketMatch(m, ko));
    center.appendChild(finalDiv);

    const rightHalf = document.createElement("div");
    rightHalf.className = "bracket-half bracket-right";
    rightHalf.appendChild(makeRound("Semifinals", allSF.slice(1)));
    rightHalf.appendChild(makeRound("Quarterfinals", allQF.slice(2)));
    rightHalf.appendChild(makeRound("Round of 16", allR16.slice(4)));
    rightHalf.appendChild(makeRound("Round of 32", allR32.slice(8)));

    grid.appendChild(leftHalf);
    grid.appendChild(center);
    grid.appendChild(rightHalf);
    wrap.appendChild(grid);
  } else {
    const bracket = document.createElement("div");
    bracket.className = "bracket";
    for (const [label, matches] of [
      ["Round of 32", allR32], ["Round of 16", allR16],
      ["Quarterfinals", allQF], ["Semifinals", allSF], ["Final", allFinal],
    ]) bracket.appendChild(makeRound(label, matches));
    wrap.appendChild(bracket);
  }

  els.bracketView.appendChild(wrap);

  const thirdMatch = FIXTURES.find(m => m.stage === "third");
  if (thirdMatch) {
    const thirdSection = document.createElement("div");
    thirdSection.className = "bracket-third";
    const title = document.createElement("h3");
    title.className = "bracket-round-title";
    title.textContent = "Third-Place Match";
    thirdSection.appendChild(title);
    thirdSection.appendChild(renderBracketMatch(thirdMatch, ko));
    els.bracketView.appendChild(thirdSection);
  }
}

function renderBracketMatch(m, ko) {
  const { team1: resolved1, team2: resolved2 } = resolveMatchTeams(m, ko);
  const t1 = resolved1 || m.team1;
  const t2 = resolved2 || m.team2;
  const r = getResult(m) || {};
  const winner = computeWinnerFromResult(m, r, t1, t2);

  const card = document.createElement("div");
  card.className = "bracket-match";

  const s1 = r.score1 !== undefined ? r.score1 : "";
  const s2 = r.score2 !== undefined ? r.score2 : "";
  const pen1 = r.pen1 !== undefined ? ` (${r.pen1})` : "";
  const pen2 = r.pen2 !== undefined ? ` (${r.pen2})` : "";

  const row = (team, resolvedFlag, score, pen, isWinner, isLoser, isPlaceholder) => `
    <div class="bracket-team ${isWinner ? "win" : ""} ${isLoser ? "lose" : ""} ${isPlaceholder ? "placeholder" : ""}">
      <span class="flag">${resolvedFlag ? flagFor(team) : ""}</span>
      <span class="bracket-team-name" title="${team}">${team}</span>
      <span class="bracket-score">${score === "" ? "" : score + pen}</span>
    </div>`;

  card.innerHTML =
    row(t1, !!resolved1, s1, pen1, winner === t1, winner && winner !== t1, !resolved1) +
    row(t2, !!resolved2, s2, pen2, winner === t2, winner && winner !== t2, !resolved2);

  return card;
}

// --- Top Scorers ---
function computeTopScorers() {
  const ko = getKnockoutAssignments();
  // Key by "name|team" so same name on different teams stays separate
  const agg = new Map();
  for (const m of FIXTURES) {
    const r = getResult(m);
    if (!r || !Array.isArray(r.scorers) || r.scorers.length === 0) continue;
    const { team1, team2 } = resolveMatchTeams(m, ko);
    if (!team1 || !team2) continue;        // unresolved KO match — skip
    for (const s of r.scorers) {
      if (s && s.card) continue; // card entry, not a goal (legacy mixed data)
      const teamName = s.team === 1 ? team1 : team2;
      if (!teamName) continue;
      const name = (s.name || "").trim();
      if (!name) continue;
      const key = `${name}|${teamName}`;
      let row = agg.get(key);
      if (!row) {
        row = { name, team: teamName, goals: 0, matchIds: new Set(), minutes: [] };
        agg.set(key, row);
      }
      row.goals += 1;
      row.matchIds.add(matchId(m));
      if (s.minute !== undefined && s.minute !== null && s.minute !== "") {
        row.minutes.push(s.minute);
      }
    }
  }
  const rows = [...agg.values()].map(r => ({
    name: r.name,
    team: r.team,
    goals: r.goals,
    matches: r.matchIds.size,
    minutes: r.minutes,
  }));
  // Sort: goals desc, then matches asc (more efficient scorer), then name asc
  rows.sort((a, b) =>
    b.goals - a.goals
    || a.matches - b.matches
    || a.name.localeCompare(b.name)
  );
  return rows;
}

// --- Picks (per-match score predictions) ---
// Verdict label for a user's predicted score (group → "wins"/"Draw", KO → "advances"/"Tied").
function pickResultLabel(m, pick, t1, t2) {
  if (!pick || pick.score1 === undefined || pick.score2 === undefined) return "";
  const isKO = m.stage !== "group";
  if (pick.score1 > pick.score2) return `${t1} ${isKO ? "advances" : "wins"}`;
  if (pick.score2 > pick.score1) return `${t2} ${isKO ? "advances" : "wins"}`;
  // Equal scores
  return isKO ? "Tied — pick a winning score" : "Draw";
}

function renderPicks() {
  const view = els.picksView;
  view.innerHTML = "";

  // Sign-in banner (only when not logged in) — non-blocking; local picks still work
  if (appwriteAuth.available && !state.currentUser) {
    const banner = document.createElement("div");
    banner.className = "picks-signin-banner";
    banner.innerHTML = `
      <div class="picks-signin-text">
        <strong>Sign in</strong> to save your picks and join the prediction leaderboard.
        Without an account, picks stay on this device only.
      </div>
      <div class="picks-signin-actions">
        <button type="button" class="action-btn" id="picksSignInBtn">Sign in</button>
        <button type="button" class="action-btn" id="picksSignUpBtn">Create account</button>
      </div>
    `;
    view.appendChild(banner);
    banner.querySelector("#picksSignInBtn").addEventListener("click", () => openAuthModal("signin"));
    banner.querySelector("#picksSignUpBtn").addEventListener("click", () => openAuthModal("signup"));
  }

  // Header with intro + counter + action buttons
  const total = FIXTURES.length;
  const filled = Object.keys(state.matchPicks).filter(id =>
    state.matchPicks[id].score1 !== undefined && state.matchPicks[id].score2 !== undefined
  ).length;
  const header = document.createElement("div");
  header.className = "predict-header";
  const savedNote = state.currentUser ? " (synced to your account)" : " (this device only)";
  header.innerHTML = `
    <p>Predict the final score of every match. Locks at each match's kickoff.
       <strong style="color: var(--accent-2)">${filled}/${total}</strong> filled in${savedNote}.</p>
    <div class="predict-header-actions">
      <button type="button" id="picksRulesBtn" class="action-btn">📖 Rules</button>
      <button type="button" id="picksResetBtn" class="danger-btn">Reset all picks</button>
    </div>
  `;
  view.appendChild(header);
  header.querySelector("#picksRulesBtn").addEventListener("click", openRulesModal);
  header.querySelector("#picksResetBtn").addEventListener("click", async () => {
    const ok = await showConfirm("Clear your predictions for upcoming matches? Picks for matches that already kicked off are locked and will be kept.", {
      title: "Reset picks",
      icon: "♻",
      confirmLabel: "Reset",
      danger: true,
    });
    if (!ok) return;
    // Keep locked picks: they already count on the leaderboard and can't be
    // re-entered once a match has kicked off.
    const kept = {};
    for (const m of FIXTURES) {
      const id = matchId(m);
      if (state.matchPicks[id] && isMatchLocked(m)) kept[id] = state.matchPicks[id];
    }
    state.matchPicks = kept;
    saveMatchPicks();
    if (state.currentUser) userPicksSync.saveOwn();
    renderPicks();
  });

  // Bucket matches into three sections
  const tz = state.selectedTz;
  const ko = getKnockoutAssignments();
  const now = Date.now();
  const TWENTY_FOUR_H = 24 * 60 * 60 * 1000;

  // ── Live Now (pinned at top, like the Schedule tab) ──
  const liveMatches = FIXTURES.filter(m => applyLiveChip(matchId(m), formatCountdown(m)).state === "live");
  const liveIds = new Set(liveMatches.map(m => matchId(m)));
  if (liveMatches.length > 0) {
    const liveGroup = document.createElement("div");
    liveGroup.className = "day-group live-now-group";
    const liveHeader = document.createElement("div");
    liveHeader.className = "day-header live-now-header";
    liveHeader.innerHTML = `<span class="day-date live-now-label">🔴 Live Now</span><span class="day-count">${liveMatches.length} ${liveMatches.length === 1 ? "match" : "matches"}</span>`;
    liveGroup.appendChild(liveHeader);
    const liveList = document.createElement("div");
    liveList.className = "match-list";
    for (const m of liveMatches) liveList.appendChild(renderPickCard(m, ko));
    liveGroup.appendChild(liveList);
    view.appendChild(liveGroup);
  }

  const upcomingByDate = new Map();
  const recentByDate   = new Map();
  const oldByDate      = new Map();

  for (const m of FIXTURES) {
    if (liveIds.has(matchId(m))) continue;
    const key = dateKeyInTz(fixtureToUTC(m), tz);
    const kickoffMs = fixtureToUTC(m).getTime();
    const cd = formatCountdown(m);
    let bucket;
    if (cd.state === "ended" && now - kickoffMs >= TWENTY_FOUR_H) bucket = oldByDate;
    else if (cd.state === "ended")                                  bucket = recentByDate;
    else                                                            bucket = upcomingByDate;
    if (!bucket.has(key)) bucket.set(key, []);
    bucket.get(key).push(m);
  }

  // ── Section: Finished > 24h (collapsed, at top) ──────────────────────────
  if (oldByDate.size > 0) {
    const totalOld = [...oldByDate.values()].reduce((s, a) => s + a.length, 0);
    const sec = document.createElement("div");
    sec.className = "schedule-section schedule-section-archived";

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "schedule-archive-toggle";
    toggleBtn.innerHTML = _picksShowOldFinished
      ? `🕘 Older Matches <span class="archive-badge">${totalOld}</span><span class="archive-chevron open" style="margin-left:auto">Hide ▲</span>`
      : `🕘 Older Matches <span class="archive-badge">${totalOld}</span><span class="archive-chevron" style="margin-left:auto">Show ▼</span>`;
    sec.appendChild(toggleBtn);

    const archiveBody = document.createElement("div");
    archiveBody.className = "schedule-archive-body";
    archiveBody.style.display = _picksShowOldFinished ? "" : "none";
    renderPicksDayGroups(oldByDate, ko, archiveBody);
    sec.appendChild(archiveBody);

    toggleBtn.addEventListener("click", () => {
      _picksShowOldFinished = !_picksShowOldFinished;
      archiveBody.style.display = _picksShowOldFinished ? "" : "none";
      toggleBtn.innerHTML = _picksShowOldFinished
        ? `🕘 Older Matches <span class="archive-badge">${totalOld}</span><span class="archive-chevron open" style="margin-left:auto">Hide ▲</span>`
        : `🕘 Older Matches <span class="archive-badge">${totalOld}</span><span class="archive-chevron" style="margin-left:auto">Show ▼</span>`;
    });

    view.appendChild(sec);
  }

  // ── Section: Recently Finished (< 24h) ───────────────────────────────────
  if (recentByDate.size > 0) {
    const totalRecent = [...recentByDate.values()].reduce((s, a) => s + a.length, 0);
    const sec = document.createElement("div");
    sec.className = "schedule-section schedule-section-archived";

    const recentToggleBtn = document.createElement("button");
    recentToggleBtn.type = "button";
    recentToggleBtn.className = "schedule-archive-toggle recent-toggle";
    recentToggleBtn.innerHTML = _picksShowRecentFinished
      ? `✅ Recently Finished <span class="archive-badge recent-badge">${totalRecent}</span><span class="archive-chevron open" style="margin-left:auto">Hide ▲</span>`
      : `✅ Recently Finished <span class="archive-badge recent-badge">${totalRecent}</span><span class="archive-chevron" style="margin-left:auto">Show ▼</span>`;
    sec.appendChild(recentToggleBtn);

    const recentBody = document.createElement("div");
    recentBody.className = "schedule-archive-body";
    recentBody.style.display = _picksShowRecentFinished ? "" : "none";
    renderPicksDayGroups(recentByDate, ko, recentBody, true);
    sec.appendChild(recentBody);

    recentToggleBtn.addEventListener("click", () => {
      _picksShowRecentFinished = !_picksShowRecentFinished;
      recentBody.style.display = _picksShowRecentFinished ? "" : "none";
      recentToggleBtn.innerHTML = _picksShowRecentFinished
        ? `✅ Recently Finished <span class="archive-badge recent-badge">${totalRecent}</span><span class="archive-chevron open" style="margin-left:auto">Hide ▲</span>`
        : `✅ Recently Finished <span class="archive-badge recent-badge">${totalRecent}</span><span class="archive-chevron" style="margin-left:auto">Show ▼</span>`;
    });

    view.appendChild(sec);
  }

  // ── Section: Upcoming ─────────────────────────────────────────────────────
  if (upcomingByDate.size > 0) {
    const totalUpcoming = [...upcomingByDate.values()].reduce((s, a) => s + a.length, 0);
    const sec = document.createElement("div");
    sec.className = "schedule-section schedule-section-archived";

    const upcomingToggleBtn = document.createElement("button");
    upcomingToggleBtn.type = "button";
    upcomingToggleBtn.className = "schedule-archive-toggle upcoming-toggle";
    upcomingToggleBtn.innerHTML = _picksShowUpcoming
      ? `📅 Upcoming <span class="archive-badge upcoming-badge">${totalUpcoming}</span><span class="archive-chevron open" style="margin-left:auto">Hide ▲</span>`
      : `📅 Upcoming <span class="archive-badge upcoming-badge">${totalUpcoming}</span><span class="archive-chevron" style="margin-left:auto">Show ▼</span>`;
    sec.appendChild(upcomingToggleBtn);

    const upcomingBody = document.createElement("div");
    upcomingBody.className = "schedule-archive-body";
    upcomingBody.style.display = _picksShowUpcoming ? "" : "none";
    renderPicksDayGroups(upcomingByDate, ko, upcomingBody);
    sec.appendChild(upcomingBody);

    upcomingToggleBtn.addEventListener("click", () => {
      _picksShowUpcoming = !_picksShowUpcoming;
      upcomingBody.style.display = _picksShowUpcoming ? "" : "none";
      upcomingToggleBtn.innerHTML = _picksShowUpcoming
        ? `📅 Upcoming <span class="archive-badge upcoming-badge">${totalUpcoming}</span><span class="archive-chevron open" style="margin-left:auto">Hide ▲</span>`
        : `📅 Upcoming <span class="archive-badge upcoming-badge">${totalUpcoming}</span><span class="archive-chevron" style="margin-left:auto">Show ▼</span>`;
    });

    view.appendChild(sec);
  }
}

function renderPickCard(m, ko) {
  const stageLabel = STAGE_LABELS[m.stage] + (m.group ? ` · Group ${m.group}` : "");
  const card = document.createElement("article");
  card.className = "match-card pick-card";

  const { team1: resolved1, team2: resolved2 } = resolveMatchTeams(m, ko);
  const t1 = resolved1 || m.team1;
  const t2 = resolved2 || m.team2;
  const teamsKnown = !!(resolved1 && resolved2) || m.stage === "group";

  const kickoffUtcMs = fixtureToUTC(m).getTime();
  const localTime = formatTimeInTz(fixtureToUTC(m), state.selectedTz);
  const locked = isMatchLocked(m);
  const cd = formatCountdown(m);
  const countdownChip = cd.state === "ended"
    ? ""
    : `<span class="match-countdown ${cd.state}">${cd.text}</span>`;
  const stageBadge = `<span class="stage-badge ${m.stage}">${stageLabel}</span>`;
  const timeText = cd.state === "ended" ? `<span class="match-time-ft">FT</span> <span class="match-time-scheduled">${localTime}</span>` : localTime;
  const meta = `<div class="match-meta">${stageBadge}<span class="match-time">${timeText}</span>${countdownChip}</div>`;
  if (cd.state === "live") card.classList.add("is-live");
  if (cd.state === "ended") card.classList.add("is-ended");
  if (locked) card.classList.add("is-locked");
  card.dataset.kickoff = String(kickoffUtcMs);
  card.dataset.stage = m.stage;

  const f1 = flagFor(t1);
  const f2 = flagFor(t2);
  // Real (non-placeholder) teams get a clickable name → squad / team-info modal.
  const t1Known = m.stage === "group" || !!resolved1;
  const t2Known = m.stage === "group" || !!resolved2;
  const nameAttrs = (name, known) => known
    ? ` class="team-name team-info-link" data-team="${escapeHTML(name)}" title="View ${escapeHTML(name)} squad & team info"`
    : ` class="team-name" title="${escapeHTML(name)}"`;
  const teamsHTML = `<div class="match-teams">
    <span class="team"><span class="flag">${f1}</span><span${nameAttrs(t1, t1Known)}>${t1}</span></span>
    <span class="vs">VS</span>
    <span class="team right"><span${nameAttrs(t2, t2Known)}>${t2}</span><span class="flag flag-right">${f2}</span></span>
  </div>`;

  const pick = getMatchPick(m) || {};
  const s1 = pick.score1 ?? "";
  const s2 = pick.score2 ?? "";

  const disabledAttr = (!teamsKnown || locked) ? "disabled" : "";
  const lockBadge = locked
    ? `<span class="pick-lock-badge" title="Match has kicked off">🔒 Locked</span>`
    : (!teamsKnown ? `<span class="pick-lock-badge pending" title="Teams not yet decided">⏳ TBD</span>` : "");
  const labelText = pickResultLabel(m, pick, t1, t2);
  const isDraw = pick.score1 !== undefined && pick.score2 !== undefined && pick.score1 === pick.score2;
  const isKO = m.stage !== "group";
  const showPkPicker = isKO && isDraw && !locked && teamsKnown;
  const pkPickerHTML = showPkPicker ? `
    <div class="pk-picker-row" aria-label="Predicted penalty winner">
      <span class="pk-label">PK winner:</span>
      <button type="button" class="pk-btn ${pick.pkWinner === 1 ? "is-picked" : ""}" data-pk="1">${escapeHTML(t1)}</button>
      <button type="button" class="pk-btn ${pick.pkWinner === 2 ? "is-picked" : ""}" data-pk="2">${escapeHTML(t2)}</button>
    </div>` : "";
  // Prediction scores sit directly under each team name (left under team1,
  // right under team2). The lock/TBD badge — or a "Your pick" tag — goes in the
  // centre, and the verdict label drops to its own line below.
  const predRow = `
    <div class="pb-section pb-pred-section">
      <div class="pb-row pb-pred" data-mid="${matchId(m)}">
        <input type="number" min="0" max="99" class="score-input pick-s1" value="${s1}" placeholder="–" aria-label="Predicted score for ${t1}" ${disabledAttr}>
        <span class="pb-center">${lockBadge || '<span class="pb-tag">Your pick</span>'}</span>
        <input type="number" min="0" max="99" class="score-input pick-s2" value="${s2}" placeholder="–" aria-label="Predicted score for ${t2}" ${disabledAttr}>
      </div>
      <div class="pb-label-row"><span class="result-label ${isDraw ? "is-draw" : ""}">${labelText}</span></div>
    </div>
    ${pkPickerHTML}`;

  // Actual result (live or final) so the user can compare it with their pick.
  const result = getResult(m);
  const hasResult = result && result.score1 !== undefined && result.score2 !== undefined;
  let actualHTML = "";
  if (hasResult) {
    const isLiveResult = !!result.isLive;
    const wentToPK = isKO && result.score1 === result.score2
      && result.pen1 !== undefined && result.pen2 !== undefined && result.pen1 !== result.pen2;
    const pensHTML = wentToPK ? `<span class="pick-actual-pens">(PK ${result.pen1}–${result.pen2})</span>` : "";

    const hasPick = pick.score1 !== undefined && pick.score2 !== undefined;
    const s = hasPick ? scoreMatchPick(pick, result, m) : null;
    let verdict;
    if (!hasPick) {
      verdict = `<span class="pick-verdict v-none">No prediction</span>`;
    } else if (isLiveResult) {
      verdict = `<span class="pick-verdict v-live">+${s ? s.awarded : 0} so far</span>`;
    } else if (s && s.exact) {
      verdict = `<span class="pick-verdict v-exact">🎯 Exact · +${s.awarded}</span>`;
    } else if (s && s.awarded > 0) {
      const parts = [];
      if (s.outcome) parts.push("Outcome");
      if (s.diff) parts.push("GD");
      if (s.pkBonus > 0) parts.push("PK");
      verdict = `<span class="pick-verdict v-partial">✓ ${parts.join(" + ") || "Close"} · +${s.awarded}</span>`;
    } else {
      verdict = `<span class="pick-verdict v-miss">✗ Missed · 0</span>`;
    }

    // Mirrors the prediction row: each actual score under its team name, in a
    // distinct color so it reads as the official result, not an editable input.
    actualHTML = `
      <div class="pb-section pb-actual-section${isLiveResult ? " is-live-result" : ""}">
        <div class="pb-row pb-actual">
          <span class="score-box">${result.score1}</span>
          <span class="pb-center actual-tag">${isLiveResult ? "Live" : "Result"}${pensHTML}</span>
          <span class="score-box">${result.score2}</span>
        </div>
        <div class="pb-label-row">${verdict}</div>
      </div>`;
  }

  const footer = `<div class="match-footer"><span class="venue">${venueWithCountry(m.venue)}</span></div>`;
  card.innerHTML = meta + teamsHTML + predRow + actualHTML + footer;

  // Tapping a known team's name opens its squad + team-info (independent of lock).
  card.querySelectorAll(".team-info-link").forEach(el => {
    el.addEventListener("click", () => openTeamModal(el.dataset.team));
  });

  if (!locked && teamsKnown) {
    const label = card.querySelector(".pb-label-row .result-label");
    const i1 = card.querySelector(".pick-s1");
    const i2 = card.querySelector(".pick-s2");
    const parse = el => el.value === "" ? undefined : Math.max(0, Math.min(99, parseInt(el.value, 10) || 0));
    const onChange = () => {
      // Re-check lock at change time; if just kicked off, refuse + re-render
      if (isMatchLocked(m)) { renderPicks(); return; }
      const v1 = parse(i1);
      const v2 = parse(i2);
      const prev = getMatchPick(m) || {};
      const nowDraw = v1 !== undefined && v2 !== undefined && v1 === v2;
      const wasDraw = prev.score1 === prev.score2;
      // Keep pkWinner if scores are still tied; drop it otherwise
      const next = { score1: v1, score2: v2 };
      if (isKO && nowDraw && (prev.pkWinner === 1 || prev.pkWinner === 2)) {
        next.pkWinner = prev.pkWinner;
      }
      saveMatchPickFull(m, next);
      // Update the verdict label inline (no full re-render → keeps input focus)
      label.textContent = pickResultLabel(m, next, t1, t2);
      label.classList.toggle("is-draw", nowDraw);
      // If the draw state toggled on a KO match, the PK picker visibility changes — re-render this card
      if (isKO && nowDraw !== wasDraw) renderPicks();
    };
    i1.addEventListener("input", onChange);
    i2.addEventListener("input", onChange);

    if (showPkPicker) {
      card.querySelectorAll(".pk-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          if (isMatchLocked(m)) { renderPicks(); return; }
          const side = parseInt(btn.dataset.pk, 10);
          const prev = getMatchPick(m) || {};
          // Toggle: clicking the current pick clears it
          const nextPk = prev.pkWinner === side ? undefined : side;
          saveMatchPickFull(m, { score1: prev.score1, score2: prev.score2, pkWinner: nextPk });
          card.querySelectorAll(".pk-btn").forEach(b => b.classList.toggle("is-picked", parseInt(b.dataset.pk, 10) === nextPk));
        });
      });
    }
  }

  return card;
}

// Sets the match pick to the full {score1, score2, pkWinner?} payload. Drops the
// entry entirely when scores are empty. Also pushes to server when logged in.
function saveMatchPickFull(m, next) {
  const id = matchId(m);
  if (next.score1 === undefined && next.score2 === undefined) {
    delete state.matchPicks[id];
  } else {
    const clean = { score1: next.score1, score2: next.score2 };
    if (next.pkWinner === 1 || next.pkWinner === 2) clean.pkWinner = next.pkWinner;
    state.matchPicks[id] = clean;
  }
  saveMatchPicks();
  if (state.currentUser && userPicksSync.available) userPicksSync.saveOwn();
}

function openRulesModal() {
  const existing = document.getElementById("rulesModal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "rulesModal";
  modal.className = "modal";
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-dialog rules-modal" role="dialog" aria-modal="true" aria-labelledby="rulesTitle">
      <div class="modal-icon modal-icon-info">📖</div>
      <h2 id="rulesTitle">Prediction Rules</h2>
      <div class="rules-body">
        <section>
          <h3>How to play</h3>
          <ul>
            <li>Predict the final regulation score of every match before its kickoff.</li>
            <li>Picks <strong>cannot be edited after kickoff</strong> — they lock automatically.</li>
            <li>One prediction per user per match.</li>
            <li>For knockout matches predicted as a draw, also pick the <strong>penalty shootout winner</strong>.</li>
          </ul>
        </section>
        <section>
          <h3>Base points</h3>
          <table class="rules-table">
            <tr><th>Outcome</th><th>Points</th></tr>
            <tr><td><strong>Exact score</strong> (e.g. picked 2-1, actual 2-1)</td><td class="rules-pts">15</td></tr>
            <tr><td><strong>Correct winner / draw</strong> only</td><td class="rules-pts">5</td></tr>
            <tr><td><strong>Correct goal difference</strong> only</td><td class="rules-pts">3</td></tr>
            <tr><td><strong>Correct winner AND goal difference</strong> (not exact)</td><td class="rules-pts">8</td></tr>
          </table>
          <p class="rules-note">If the exact score is correct, only the 15 points apply — outcome/diff are not added on top.</p>
        </section>
        <section>
          <h3>Penalty shootout bonus</h3>
          <p>Applies only to KO matches that actually go to penalties. If the user's predicted PK winner matches the actual PK winner: <strong>+5 bonus points</strong>. Ignored when no shootout happens.</p>
        </section>
        <section>
          <h3>Stage multipliers</h3>
          <table class="rules-table">
            <tr><th>Stage</th><th>Multiplier</th></tr>
            <tr><td>Group Stage</td><td class="rules-pts">×1.0</td></tr>
            <tr><td>Round of 32</td><td class="rules-pts">×1.1</td></tr>
            <tr><td>Round of 16</td><td class="rules-pts">×1.25</td></tr>
            <tr><td>Quarterfinal</td><td class="rules-pts">×1.5</td></tr>
            <tr><td>Semifinal</td><td class="rules-pts">×2.0</td></tr>
            <tr><td>Third-Place Match</td><td class="rules-pts">×2.0</td></tr>
            <tr><td>Final</td><td class="rules-pts">×3.0</td></tr>
          </table>
          <p class="rules-note">Awarded = <code>round((Base + PK Bonus) × Multiplier)</code></p>
        </section>
        <section>
          <h3>Examples</h3>
          <ul class="rules-examples">
            <li><strong>Group, picked 2-1, actual 2-1</strong> → 15 × 1.0 = <strong>15 pts</strong></li>
            <li><strong>QF, picked 3-2, actual 2-1</strong> → outcome 5 + diff 3 = 8; 8 × 1.5 = <strong>12 pts</strong></li>
            <li><strong>Final, picked 1-1 with PK Argentina, actual 1-1, PK Argentina</strong> → (15 + 5) × 3.0 = <strong>60 pts</strong></li>
          </ul>
        </section>
        <section>
          <h3>Leaderboard tiebreakers</h3>
          <ol>
            <li>Total points (highest first)</li>
            <li>Exact-score predictions</li>
            <li>Correct outcomes</li>
            <li>Correct penalty predictions</li>
            <li>Earliest first-prediction time</li>
          </ol>
        </section>
      </div>
      <div class="modal-actions">
        <button class="modal-btn modal-btn-primary" id="rulesCloseBtn" type="button">Got it</button>
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
  modal.querySelector(".modal-backdrop").addEventListener("click", close);
  modal.querySelector("#rulesCloseBtn").addEventListener("click", close);
  modal.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
  setTimeout(() => modal.querySelector("#rulesCloseBtn").focus(), 60);
}

function openUserPredictionsModal(userId, userName) {
  const existing = document.getElementById("userPredModal");
  if (existing) existing.remove();

  const myId = state.currentUser && state.currentUser.id;
  const isOwnModal = myId === userId;
  const userEntry = state.leaderboardUsers.find(u => u.userId === userId);
  const picks = userEntry ? userEntry.picks : {};
  const ko = getKnockoutAssignments();

  const STAGE_LABELS_PRED = { group: "Group Stage", r32: "Round of 32", r16: "Round of 16", qf: "Quarter-finals", sf: "Semi-finals", third: "Third-Place Match", final: "Final" };
  const stageOrder = ["group", "r32", "r16", "qf", "sf", "third", "final"];

  let totalPts = 0;
  let exactCount = 0;
  let outcomeCount = 0;
  let missedCount = 0;

  const byStage = {};
  for (const m of FIXTURES) {
    if (!byStage[m.stage]) byStage[m.stage] = [];
    byStage[m.stage].push(m);
  }

  let tableHTML = "";
  for (const stage of stageOrder) {
    const matches = byStage[stage];
    if (!matches || matches.length === 0) continue;
    tableHTML += `<tr class="upred-stage-row"><td colspan="4">${STAGE_LABELS_PRED[stage] || stage}</td></tr>`;
    for (const m of matches) {
      // Non-admins viewing someone else's modal only see locked matches
      if (!state.isAdmin && !isOwnModal && !isMatchLocked(m)) continue;
      const id = matchId(m);
      const pick = picks[id];
      const result = getResult(m);
      const hasPick = pick && pick.score1 !== undefined && pick.score2 !== undefined;
      const hasResult = result && result.score1 !== undefined && result.score2 !== undefined;
      const isLive = applyLiveChip(id, formatCountdown(m)).state === "live";

      const { team1: t1, team2: t2 } = resolveMatchTeams(m, ko);
      const displayT1 = t1 || m.team1;
      const displayT2 = t2 || m.team2;

      let predCell, resultCell, ptsCell, rowClass = "";

      if (state.isAdmin) {
        // Admin can set/edit this user's prediction (incl. finished matches).
        const s1v = hasPick ? pick.score1 : "";
        const s2v = hasPick ? pick.score2 : "";
        const pkSel = m.stage !== "group" ? `
            <select class="upred-pk" aria-label="Predicted PK winner">
              <option value="">PK?</option>
              <option value="1" ${pick && pick.pkWinner === 1 ? "selected" : ""}>${escapeHTML(displayT1)}</option>
              <option value="2" ${pick && pick.pkWinner === 2 ? "selected" : ""}>${escapeHTML(displayT2)}</option>
            </select>` : "";
        predCell = `<span class="upred-edit" data-mid="${id}">
            <input type="number" min="0" max="99" class="upred-in upred-in-s1" value="${s1v}" placeholder="–">
            <span class="upred-sep">:</span>
            <input type="number" min="0" max="99" class="upred-in upred-in-s2" value="${s2v}" placeholder="–">${pkSel}
          </span>`;
      } else if (hasPick) {
        let predStr = `${pick.score1}–${pick.score2}`;
        if (pick.pkWinner) predStr += ` (PK: ${pick.pkWinner === 1 ? escapeHTML(displayT1) : escapeHTML(displayT2)})`;
        predCell = `<span class="upred-pick-val">${escapeHTML(predStr)}</span>`;
      } else {
        predCell = `<span class="upred-no-pick">No pick</span>`;
      }

      if (hasResult) {
        let resStr = `${result.score1}–${result.score2}`;
        if (result.pen1 !== undefined && result.pen2 !== undefined && result.pen1 !== result.pen2) {
          resStr += ` (PK: ${result.pen1}–${result.pen2})`;
        }
        resultCell = `<span class="upred-result-val">${escapeHTML(resStr)}</span>`;

        if (hasPick) {
          const s = scoreMatchPick(pick, result, m);
          if (s && s.awarded > 0) {
            totalPts += s.awarded;
            if (s.exact) { exactCount++; rowClass = "upred-row-exact"; }
            else if (s.outcome) { outcomeCount++; rowClass = "upred-row-outcome"; }
            else rowClass = "upred-row-partial";
            ptsCell = `<span class="upred-pts-val upred-pts-scored">${s.awarded}</span>`;
          } else {
            if (s) totalPts += s.awarded;
            rowClass = "upred-row-wrong";
            ptsCell = `<span class="upred-pts-val upred-pts-zero">0</span>`;
          }
        } else {
          // No pick on a finished match = 0 points by default
          missedCount++;
          rowClass = "upred-row-missed";
          ptsCell = `<span class="upred-pts-val upred-pts-missed">0</span>`;
        }
      } else {
        resultCell = `<span class="upred-pending">–</span>`;
        ptsCell = `<span class="upred-pending">–</span>`;
        if (!hasPick) missedCount++;
      }

      tableHTML += `
        <tr class="upred-row ${rowClass}${isLive ? " upred-row-live" : ""}">
          <td class="upred-td-match">${isLive ? '<span class="upred-live-dot" title="Live now">🔴</span> ' : ""}<span class="upred-team"><span class="flag">${flagFor(displayT1)}</span>${escapeHTML(displayT1)}</span> <span class="upred-vs">vs</span> <span class="upred-team"><span class="flag">${flagFor(displayT2)}</span>${escapeHTML(displayT2)}</span></td>
          <td class="upred-td-pick">${predCell}</td>
          <td class="upred-td-result">${resultCell}</td>
          <td class="upred-td-pts">${ptsCell}</td>
        </tr>`;
    }
  }

  const bonus = getUserBonus(userId);
  totalPts += bonus;

  const modal = document.createElement("div");
  modal.id = "userPredModal";
  modal.className = "modal";
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-dialog upred-modal" role="dialog" aria-modal="true" aria-labelledby="upredTitle">
      <div class="upred-header">
        <h2 id="upredTitle">${escapeHTML(userName)}'s Predictions</h2>
        <div class="upred-stats-row">
          <span class="upred-stat upred-stat-pts">${totalPts} pts</span>
          <span class="upred-stat">${exactCount} exact</span>
          <span class="upred-stat">${outcomeCount} outcome</span>
          <span class="upred-stat upred-stat-missed">${missedCount} missed</span>
        </div>
      </div>
      <div class="upred-table-wrap">
        <table class="upred-table">
          <thead>
            <tr>
              <th class="upred-th-match">Match</th>
              <th class="upred-th-pick">Prediction</th>
              <th class="upred-th-result">Result</th>
              <th class="upred-th-pts">Pts</th>
            </tr>
          </thead>
          <tbody>${tableHTML}</tbody>
        </table>
      </div>
      <div class="modal-actions">
        ${state.isAdmin && userPicksSync.available ? `<button class="modal-btn" id="upredSaveBtn" type="button">💾 Save predictions</button>` : ""}
        <button class="modal-btn modal-btn-primary" id="upredCloseBtn" type="button">Close</button>
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
  modal.querySelector(".modal-backdrop").addEventListener("click", close);
  modal.querySelector("#upredCloseBtn").addEventListener("click", close);
  modal.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
  setTimeout(() => modal.querySelector("#upredCloseBtn").focus(), 60);

  const saveBtn = modal.querySelector("#upredSaveBtn");
  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      const orig = saveBtn.textContent;
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving…";
      const next = { ...(userEntry ? userEntry.picks : {}) };
      modal.querySelectorAll(".upred-edit").forEach(cell => {
        const mid = cell.dataset.mid;
        const s1 = parseInt(cell.querySelector(".upred-in-s1").value, 10);
        const s2 = parseInt(cell.querySelector(".upred-in-s2").value, 10);
        if (Number.isFinite(s1) && Number.isFinite(s2)) {
          const p = { score1: Math.max(0, Math.min(99, s1)), score2: Math.max(0, Math.min(99, s2)) };
          const pk = cell.querySelector(".upred-pk");
          if (pk && pk.value && p.score1 === p.score2) p.pkWinner = parseInt(pk.value, 10);
          next[mid] = p;
        } else {
          delete next[mid]; // both cleared → remove the pick
        }
      });
      try {
        await userPicksSync.saveForUser(userId, userName, next, userEntry && userEntry.firstSubmittedAt);
        if (userEntry) userEntry.picks = next;
        else state.leaderboardUsers.push({ userId, userName, picks: next, firstSubmittedAt: new Date().toISOString(), totalPicks: 0 });
        if (state.view === "leaderboard") renderLeaderboardView();
        openUserPredictionsModal(userId, userName); // rebuild with recomputed points
      } catch (e) {
        saveBtn.disabled = false;
        saveBtn.textContent = "Save failed — retry";
        setTimeout(() => { saveBtn.textContent = orig; }, 2500);
      }
    });
  }
}

function playExactScoreSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const resume = ctx.state === "suspended" ? ctx.resume() : Promise.resolve();
    resume.then(() => {
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.35, ctx.currentTime);
      master.connect(ctx.destination);
      // Ascending C major arpeggio: C5 → E5 → G5 → C6
      [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
        const t = ctx.currentTime + i * 0.11;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(master);
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.5, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
        osc.start(t);
        osc.stop(t + 0.45);
      });
      setTimeout(() => ctx.close(), 2000);
    });
  } catch (e) { /* audio unavailable — fail silently */ }
}

function fireConfetti() {
  playExactScoreSound();
  const COLORS = ["#ffd166", "#06d6a0", "#4cc9f0", "#ef476f", "#a855f7", "#f4a261"];
  const container = document.createElement("div");
  container.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9000;overflow:hidden;";
  document.body.appendChild(container);
  for (let i = 0; i < 90; i++) {
    const el = document.createElement("div");
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const size = Math.random() * 7 + 4;
    const isCircle = Math.random() < 0.3;
    el.style.cssText = `position:absolute;width:${size}px;height:${isCircle ? size : size * 2.5}px;`
      + `background:${color};border-radius:${isCircle ? "50%" : "2px"};`
      + `left:${Math.random() * 100}%;top:-20px;`
      + `--drift:${(Math.random() - 0.5) * 250}px;--rot:${Math.random() * 720 - 360}deg;`
      + `animation:confetti-fall ${(Math.random() * 1.5 + 1.5).toFixed(2)}s ${(Math.random() * 0.4).toFixed(2)}s ease-in forwards;`;
    container.appendChild(el);
  }
  setTimeout(() => container.remove(), 3500);
}

function lbAvatar(name) {
  const words = name.trim().split(/\s+/);
  const initials = words.length >= 2
    ? (words[0][0] + words[words.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  const hue = Math.abs(hash) % 360;
  return `<span class="lb-avatar" style="--av-hue:${hue}" aria-hidden="true">${escapeHTML(initials)}</span>`;
}

function renderPicksLeaderboard() {
  const wrap = document.createElement("section");
  wrap.className = "picks-leaderboard-section";
  const rows = computeLeaderboard();
  if (rows.length === 0) {
    wrap.innerHTML = `
      <h3 class="picks-lb-title">🏆 Prediction Leaderboard</h3>
      <p class="picks-lb-empty">No one's predictions have been scored yet. Sign in and predict matches to be the first!</p>
    `;
    return wrap;
  }
  const myId = state.currentUser && state.currentUser.id;
  const tbody = rows.slice(0, 20).map(r => {
    const medal = r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : "";
    const isMe = myId === r.userId;
    const rankClass = r.rank === 1 ? "lb-rank-1" : r.rank === 2 ? "lb-rank-2" : r.rank === 3 ? "lb-rank-3" : "";
    const bonusCell = state.isAdmin
      ? `<td class="lb-bonus"><input type="number" min="0" max="99" class="score-input lb-bonus-input" data-uid="${escapeHTML(r.userId)}" value="${r.bonus || ""}" placeholder="–" aria-label="Bonus points for ${escapeHTML(r.userName)}"></td>`
      : `<td class="lb-bonus">${r.bonus ? "+" + r.bonus : "–"}</td>`;
    const viewBtn = `<button class="lb-view-btn" data-uid="${escapeHTML(r.userId)}" data-name="${escapeHTML(r.userName)}" title="View ${escapeHTML(r.userName)}'s predictions" aria-label="View ${escapeHTML(r.userName)}'s predictions"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> View</button>`;
    const prevRank = _prevLbRanks.get(r.userId);
    const rankArrow = prevRank === undefined || prevRank === r.rank ? ""
      : prevRank > r.rank ? ' <span class="lb-arrow lb-arrow-up">▲</span>'
      : ' <span class="lb-arrow lb-arrow-down">▼</span>';
    return `
      <tr class="${isMe ? "is-me" : ""} ${rankClass}" data-uid="${escapeHTML(r.userId)}">
        <td class="lb-rank">${medal} ${r.rank}${rankArrow}</td>
        <td class="lb-name">${viewBtn}${lbAvatar(r.userName)}${escapeHTML(r.userName)}${isMe ? ' <span class="lb-you">you</span>' : ""}</td>
        <td class="lb-total"><span class="lb-total-val">${r.total}</span></td>
        <td class="lb-exact">${r.exactCount}</td>
        <td class="lb-outcome">${r.outcomeCount}</td>
        <td class="lb-gd">${r.gdCount}</td>
        <td class="lb-pk">${r.pkCount}</td>
        <td class="lb-acc">${r.accPct !== null ? r.accPct + '%' : '–'}</td>
        ${bonusCell}
      </tr>`;
  }).join("");
  wrap.innerHTML = `
    <h3 class="picks-lb-title">🏆 Prediction Leaderboard</h3>
    <div class="picks-lb-table-wrap">
      <table class="picks-lb-table">
        <thead>
          <tr>
            <th class="lb-rank">#</th>
            <th class="lb-name">Player</th>
            <th class="lb-total" title="Total points">Pts</th>
            <th class="lb-exact" title="Exact-score predictions">Exact</th>
            <th class="lb-outcome" title="Correct outcomes (winner / draw)">Outcome</th>
            <th class="lb-gd" title="Correct goal difference">GD</th>
            <th class="lb-pk" title="Correct penalty winners">PK</th>
            <th class="lb-acc" title="% of locked picks that scored any points">Acc%</th>
            <th class="lb-bonus" title="Admin-awarded bonus points">Bonus</th>
          </tr>
        </thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>
  `;
  // Animate rows whose rank changed since last render
  wrap.querySelectorAll("tr[data-uid]").forEach(tr => {
    const uid = tr.dataset.uid;
    const row = rows.find(r => r.userId === uid);
    if (!row) return;
    const prev = _prevLbRanks.get(uid);
    if (prev !== undefined && prev !== row.rank) {
      tr.classList.add(row.rank < prev ? "lb-rank-up" : "lb-rank-down");
    }
  });
  // Update stored ranks for next render
  rows.forEach(r => _prevLbRanks.set(r.userId, r.rank));

  // Admin: saving a bonus re-sorts the board, so re-render on change (blur/Enter)
  wrap.querySelectorAll(".lb-bonus-input").forEach(inp => {
    inp.addEventListener("change", () => {
      setUserBonus(inp.dataset.uid, inp.value);
      rerenderActive();
    });
  });
  // Admin: view user predictions modal
  wrap.querySelectorAll(".lb-view-btn").forEach(btn => {
    btn.addEventListener("click", () => openUserPredictionsModal(btn.dataset.uid, btn.dataset.name));
  });
  return wrap;
}

// ===== Top-5 live drawer (Match Predict tab) =====
// Reuses the single shared userpicks listener — no extra Firestore reads beyond
// the leaderboard that's already loaded. Just renders the top 5 of the same
// in-memory ranking.
function renderTop5Rows() {
  const rows = computeLeaderboard().slice(0, 5);
  if (rows.length === 0) return `<p class="top5-empty">No scored predictions yet.</p>`;
  const myId = state.currentUser && state.currentUser.id;
  return rows.map(r => {
    const medal = r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : `<span class="top5-rank-num">${r.rank}</span>`;
    const isMe = myId === r.userId;
    return `
      <div class="top5-row${isMe ? " is-me" : ""}" data-uid="${escapeHTML(r.userId)}">
        <span class="top5-rank">${medal}</span>
        <span class="top5-name">${lbAvatar(r.userName)}${escapeHTML(r.userName)}${isMe ? ' <span class="lb-you">you</span>' : ""}</span>
        <span class="top5-pts">${r.total}</span>
      </div>`;
  }).join("");
}

// uid → last shown total, so we can count-up animate when a score changes.
const _top5Totals = new Map();   // Top-5 drawer
const _lbTotals = new Map();     // full Leaderboard tab

// Shared audio context, unlocked on drawer open (a user gesture) so the
// point-change sound is allowed to play on later live updates.
let _pointAudioCtx = null;
function unlockPointAudio() {
  try {
    _pointAudioCtx = _pointAudioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (_pointAudioCtx.state === "suspended") _pointAudioCtx.resume();
    // iOS needs an actual sound played *inside* the user gesture to fully unlock
    // Web Audio. Play a 1-frame silent buffer to satisfy that.
    const buf = _pointAudioCtx.createBuffer(1, 1, 22050);
    const src = _pointAudioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(_pointAudioCtx.destination);
    src.start(0);
  } catch { /* no audio support */ }
}
function playPointChangeSound(up) {
  try {
    if (!_pointAudioCtx) return;            // not unlocked yet
    const ctx = _pointAudioCtx;
    if (ctx.state === "suspended") ctx.resume();
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.2, ctx.currentTime);
    master.connect(ctx.destination);
    const notes = up ? [659.25, 987.77] : [493.88, 329.63];   // up: E5→B5, down: B4→E4
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const t0 = ctx.currentTime + i * 0.1;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.6, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
      osc.connect(g); g.connect(master);
      osc.start(t0); osc.stop(t0 + 0.24);
    });
  } catch { /* ignore */ }
}

// Tween an element's number from `from` to `to` with a "pop" and a floating
// ▲/▼ delta badge showing how many points were gained/lost. `badgeHost` is the
// positioned ancestor the badge is appended to (defaults to the element's parent).
function animateCount(el, from, to, badgeHost) {
  const delta = to - from;
  const host = badgeHost || el.parentElement;
  if (host) {
    const badge = document.createElement("span");
    badge.className = "pts-delta " + (delta > 0 ? "up" : "down");
    badge.textContent = (delta > 0 ? "▲ +" : "▼ ") + delta;
    host.appendChild(badge);
    badge.addEventListener("animationend", () => badge.remove(), { once: true });
  }
  el.classList.add("pts-bump");
  const dur = 1500, start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - t, 3);   // ease-out
    el.textContent = String(Math.round(from + (to - from) * eased));
    if (t < 1) requestAnimationFrame(step);
    else { el.textContent = String(to); el.classList.remove("pts-bump"); }
  };
  requestAnimationFrame(step);
}

function refreshTop5Drawer() {
  const list = document.querySelector("#top5Drawer .top5-list");
  if (!list) return;
  // FLIP: record each row's position before the rebuild, then slide it from its
  // old spot to the new one — same live-standings animation as the leaderboard.
  const firstPos = new Map();
  list.querySelectorAll(".top5-row[data-uid]").forEach(r => firstPos.set(r.dataset.uid, r.getBoundingClientRect().top));
  list.innerHTML = renderTop5Rows();
  // Count-up animate any total that changed since the last render.
  let anyChange = false, anyUp = false;
  list.querySelectorAll(".top5-row[data-uid]").forEach(r => {
    const uid = r.dataset.uid;
    const ptsEl = r.querySelector(".top5-pts");
    const newTotal = Number(ptsEl.textContent);
    const prevTotal = _top5Totals.get(uid);
    if (prevTotal !== undefined && prevTotal !== newTotal) {
      animateCount(ptsEl, prevTotal, newTotal, r);
      anyChange = true;
      if (newTotal > prevTotal) anyUp = true;
    }
    _top5Totals.set(uid, newTotal);
  });
  if (anyChange) playPointChangeSound(anyUp);   // one sound per update, not per row
  if (firstPos.size === 0) return;
  requestAnimationFrame(() => {
    list.querySelectorAll(".top5-row[data-uid]").forEach(r => {
      const prev = firstPos.get(r.dataset.uid);
      if (prev === undefined) return;
      const delta = prev - r.getBoundingClientRect().top;
      if (Math.abs(delta) < 1) return;
      r.style.transition = "none";
      r.style.transform = `translateY(${delta}px)`;
      requestAnimationFrame(() => {
        r.style.transition = "transform 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)";
        r.style.transform = "";
        r.addEventListener("transitionend", () => { r.style.transition = ""; r.style.transform = ""; }, { once: true });
      });
    });
  });
}

function closeTop5Drawer() {
  const drawer = document.getElementById("top5Drawer");
  if (!drawer) return;
  _top5Totals.clear();   // fresh baseline next time it opens
  drawer.classList.remove("open");
  drawer.addEventListener("transitionend", () => drawer.remove(), { once: true });
}

function openTop5Drawer() {
  if (document.getElementById("top5Drawer")) return;
  unlockPointAudio();   // this click is a user gesture → audio allowed afterwards
  // Reuse the one shared collection listener — attach it only if not already on.
  if (userPicksSync.available && !state.leaderboardLoaded) {
    state.leaderboardLoaded = true;
    userPicksSync.subscribe();
  }
  const loading = userPicksSync.available && state.leaderboardUsers.length === 0;

  // No backdrop: the drawer floats on the right so the rest of the page stays
  // interactive (switch tabs, scroll, tap cards) while it's open. It only closes
  // via the ✕ button or Esc.
  const drawer = document.createElement("aside");
  drawer.className = "top5-drawer";
  drawer.id = "top5Drawer";
  drawer.setAttribute("aria-label", "Top 5 leaderboard");
  drawer.innerHTML = `
    <div class="top5-drawer-header">
      <span class="top5-drawer-title">🏆 Top 5 · Live</span>
      <button type="button" class="top5-drawer-close" aria-label="Close">✕</button>
    </div>
    <div class="top5-list">${loading ? '<p class="top5-empty">Loading…</p>' : renderTop5Rows()}</div>
    <button type="button" class="top5-viewfull">View full leaderboard →</button>
  `;

  document.body.appendChild(drawer);
  requestAnimationFrame(() => drawer.classList.add("open"));

  // Seed baseline totals so the first live change animates (no pop on open).
  drawer.querySelectorAll(".top5-row[data-uid]").forEach(r =>
    _top5Totals.set(r.dataset.uid, Number(r.querySelector(".top5-pts").textContent)));

  drawer.querySelector(".top5-drawer-close").addEventListener("click", closeTop5Drawer);
  drawer.querySelector(".top5-viewfull").addEventListener("click", () => { closeTop5Drawer(); switchView("leaderboard"); });
  const esc = (e) => { if (e.key === "Escape") { closeTop5Drawer(); document.removeEventListener("keydown", esc); } };
  document.addEventListener("keydown", esc);
}

function renderLeaderboardView() {
  const view = els.leaderboardView;

  // FLIP step 1 — record current row positions before wiping the DOM, so we
  // can slide each row from its old spot to its new one after the rebuild.
  const lbFirstPos = new Map();
  view.querySelectorAll("tr[data-uid]").forEach(tr => {
    lbFirstPos.set(tr.dataset.uid, tr.getBoundingClientRect().top);
  });

  view.innerHTML = "";

  if (appwriteAuth.available && !state.currentUser) {
    const banner = document.createElement("div");
    banner.className = "picks-signin-banner";
    banner.innerHTML = `
      <div class="picks-signin-text">
        <strong>Sign in</strong> to save your picks and join the prediction leaderboard.
        Without an account, picks stay on this device only.
      </div>
      <div class="picks-signin-actions">
        <button type="button" class="action-btn" id="lbSignInBtn">Sign in</button>
        <button type="button" class="action-btn" id="lbSignUpBtn">Create account</button>
      </div>
    `;
    view.appendChild(banner);
    banner.querySelector("#lbSignInBtn").addEventListener("click", () => openAuthModal("signin"));
    banner.querySelector("#lbSignUpBtn").addEventListener("click", () => openAuthModal("signup"));
  }

  if (!state.leaderboardLoaded && userPicksSync.available) {
    const spinner = document.createElement("p");
    spinner.className = "picks-lb-loading";
    spinner.textContent = "Loading leaderboard…";
    view.appendChild(spinner);
    state.leaderboardLoaded = true;
    // Single read path: the realtime subscription's first snapshot loads every
    // user's picks and re-renders, then keeps the board live — no separate
    // fetchAll() (that was a duplicate full-collection read).
    userPicksSync.subscribe();
    return;
  }

  // Celebrate when one of the current user's predictions has just scored exact —
  // fire confetti the moment their exact-score count ticks up.
  if (state.currentUser) {
    const myEntry = state.leaderboardUsers.find(u => u.userId === state.currentUser.id);
    if (myEntry) {
      const myStats = computeUserLeaderboardRow(myEntry);
      if (_lastMyExactCount !== null && myStats.exactCount > _lastMyExactCount) {
        fireConfetti();
      }
      _lastMyExactCount = myStats.exactCount;
    }
  }

  view.appendChild(renderPicksLeaderboard());

  // Count-up + ▲/▼ badge + sound for any total that changed since last render.
  let lbAnyChange = false, lbAnyUp = false;
  view.querySelectorAll("tr[data-uid]").forEach(tr => {
    const uid = tr.dataset.uid;
    const valEl = tr.querySelector(".lb-total-val");
    if (!valEl) return;
    const newTotal = Number(valEl.textContent);
    const prevTotal = _lbTotals.get(uid);
    if (prevTotal !== undefined && prevTotal !== newTotal) {
      animateCount(valEl, prevTotal, newTotal, tr.querySelector(".lb-total"));
      lbAnyChange = true;
      if (newTotal > prevTotal) lbAnyUp = true;
    }
    _lbTotals.set(uid, newTotal);
  });
  if (lbAnyChange) playPointChangeSound(lbAnyUp);

  // FLIP steps 2-4 — animate each row from its old pixel position to the new
  // one (translateY + transition), giving the live-standings slide effect.
  if (lbFirstPos.size > 0) {
    requestAnimationFrame(() => {
      view.querySelectorAll("tr[data-uid]").forEach(tr => {
        const first = lbFirstPos.get(tr.dataset.uid);
        if (first === undefined) return;
        const last = tr.getBoundingClientRect().top;
        const delta = first - last;
        if (Math.abs(delta) < 1) return;
        tr.style.transition = "none";
        tr.style.transform = `translateY(${delta}px)`;
        requestAnimationFrame(() => {
          tr.style.transition = "transform 0.55s cubic-bezier(0.25, 0.46, 0.45, 0.94)";
          tr.style.transform = "";
          tr.addEventListener("transitionend", () => {
            tr.style.transition = "";
            tr.style.transform = "";
          }, { once: true });
        });
      });
    });
  }
}

function renderTopScorers() {
  const view = els.scorersView;
  view.innerHTML = "";
  const rows = computeTopScorers();

  if (rows.length === 0) {
    view.innerHTML = `<div class="empty">No goals recorded yet. Scorers added on the Schedule tab will appear here.</div>`;
    return;
  }

  // Assign ranks with proper ties (1, 2, 2, 4...)
  let lastGoals = null;
  let lastRank = 0;
  rows.forEach((r, i) => {
    if (r.goals !== lastGoals) {
      lastRank = i + 1;
      lastGoals = r.goals;
    }
    r.rank = lastRank;
  });

  const totalGoals = rows.reduce((s, r) => s + r.goals, 0);
  const goldenBoot = renderGoldenBootCard(rows);

  const tbody = rows.map(r => {
    const flag = flagFor(r.team);
    const medalClass = r.rank === 1 ? "ts-rank-1" : r.rank === 2 ? "ts-rank-2" : r.rank === 3 ? "ts-rank-3" : "";
    return `
      <tr class="${medalClass}">
        <td class="ts-rank">${r.rank}</td>
        <td class="ts-player"><span class="ts-name">${escapeHTML(r.name)}</span></td>
        <td class="ts-team"><span class="flag">${flag}</span><span class="ts-team-name">${escapeHTML(r.team)}</span></td>
        <td class="ts-goals">${r.goals}</td>
        <td class="ts-matches">${r.matches}</td>
      </tr>`;
  }).join("");

  view.innerHTML = `
    ${goldenBoot}
    <div class="ts-intro">
      <p>Goals scored across all matches. Updates automatically as the admin adds scorers.</p>
      <p class="ts-summary"><strong>${rows.length}</strong> scorer${rows.length === 1 ? "" : "s"} · <strong>${totalGoals}</strong> goal${totalGoals === 1 ? "" : "s"}</p>
    </div>
    <div class="ts-table-wrap">
      <table class="ts-table">
        <thead>
          <tr>
            <th class="ts-rank">#</th>
            <th class="ts-player">Player</th>
            <th class="ts-team">Team</th>
            <th class="ts-goals">Goals</th>
            <th class="ts-matches">Matches</th>
          </tr>
        </thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>
  `;
}

// Golden Boot = the tournament's top goalscorer. FIFA breaks ties by assists,
// then fewest minutes played — neither is available from the public feed, so we
// show every player level on the top goal count as co-leaders and say why.
function renderGoldenBootCard(rows) {
  if (!rows.length || rows[0].goals === 0) return "";
  const topGoals = rows[0].goals;
  const leaders = rows.filter(r => r.goals === topGoals);
  const tied = leaders.length > 1;

  const leaderHTML = leaders.map(r => `
    <span class="gb-leader">
      <span class="flag">${flagFor(r.team)}</span>
      <span class="gb-name">${escapeHTML(r.name)}</span>
      <span class="gb-team">${escapeHTML(r.team)}</span>
    </span>`).join(tied ? `<span class="gb-amp">&amp;</span>` : "");

  const note = tied
    ? `<p class="gb-note">${leaders.length} players tied on ${topGoals}. FIFA breaks ties by assists, then fewest minutes played — not available from public data, so co-leaders are shown.</p>`
    : `<p class="gb-note">Provisional — leads on goals. FIFA breaks ties by assists, then fewest minutes played.</p>`;

  return `
    <div class="golden-boot-card${tied ? " is-tied" : ""}">
      <div class="gb-trophy" aria-hidden="true">🥇</div>
      <div class="gb-body">
        <div class="gb-label">Golden Boot · current ${tied ? "co-leaders" : "leader"}</div>
        <div class="gb-leaders">${leaderHTML}</div>
        <div class="gb-goals"><strong>${topGoals}</strong> goal${topGoals === 1 ? "" : "s"}</div>
        ${note}
      </div>
    </div>
  `;
}

// Display order for the bracket visualization — maps each stage's FIXTURES order
// (which is chronological) to the order that visually pairs each match with its
// two upstream feeders. Without this, FIFA's cross-bracket (where R16 M89 pulls
// from R32 indices 2 and 5, not 0 and 1) makes the column alignment chaotic.
// Visual top-to-bottom order of matches in each round so that every match sits
// directly beside the two matches that feed it. Derived from the bracket wiring
// in fixtures.js (the `bracket: {stage,index,role}` objects): walking down from
// the Final, each parent at display position p expects its two feeder matches at
// child positions 2p and 2p+1 (team1 feeder on top, team2 feeder below).
//   sf  [0,1]                  ← final's two feeders
//   qf  [0,1,2,3]              ← sf[0]←{qf0,qf1}, sf[1]←{qf2,qf3}
//   r16 [0,1,4,5,2,3,6,7]      ← qf[0]←{r16 0,1}, qf[1]←{r16 4,5}, qf[2]←{r16 2,3}, qf[3]←{r16 6,7}
//   r32 expands each r16 match into its two r32 feeders, in that same r16 order.
// These are RAW indices into FIXTURES.filter(stage===…); they only reorder the
// display — winner propagation uses the wiring indices directly, so the data is
// unaffected. If the wiring in fixtures.js changes, re-derive these.
const BRACKET_DISPLAY_ORDER = {
  r32: [0, 2, 1, 4, 10, 11, 8, 9, 3, 5, 6, 7, 13, 15, 12, 14],
  r16: [0, 1, 4, 5, 2, 3, 6, 7],
  qf:  [0, 1, 2, 3],
  sf:  [0, 1],
  final: [0],
};

function getMatchesInBracketOrder(stage) {
  const matches = FIXTURES.filter(m => m.stage === stage);
  const order = BRACKET_DISPLAY_ORDER[stage];
  if (!order || order.length !== matches.length) return matches;
  return order.map(i => matches[i]).filter(Boolean);
}

// ===== Prediction lock helpers =====
// Predictions lock once real-world matches have started, so users can't update
// their picks after seeing actual results.
function isMatchLocked(m, nowMs = Date.now()) {
  return fixtureToUTC(m).getTime() <= nowMs;
}
function isGroupLocked(letter, nowMs = Date.now()) {
  return FIXTURES.some(m =>
    m.stage === "group" && m.group === letter && fixtureToUTC(m).getTime() <= nowMs
  );
}

// ===== Prediction Mode =====
function getPredictedGroupOrder(letter) {
  const stored = state.prediction.groupOrder[letter];
  const teams = GROUPS[letter];
  if (Array.isArray(stored) && stored.length === teams.length
      && stored.every(t => teams.includes(t))
      && new Set(stored).size === stored.length) {
    return stored;
  }
  return teams.slice();
}

function setPredictedGroupOrder(letter, order) {
  state.prediction.groupOrder[letter] = order.slice();
  savePrediction();
}

function getPredictedThirds() {
  // 3rd-place team per group, in alphabetical group order
  return Object.keys(GROUPS).sort().map(letter => ({
    group: letter,
    team: getPredictedGroupOrder(letter)[2],
  }));
}

function toggleBestThird(team) {
  const arr = state.prediction.bestThirds;
  const idx = arr.indexOf(team);
  if (idx >= 0) {
    arr.splice(idx, 1);
  } else if (arr.length < 8) {
    arr.push(team);
  }
  savePrediction();
}

function buildPredictionKo() {
  const winners = {};
  const runnersUp = {};
  const top8 = [];

  for (const letter of Object.keys(GROUPS)) {
    const order = getPredictedGroupOrder(letter);
    if (order[0]) winners[letter] = order[0];
    if (order[1]) runnersUp[letter] = order[1];
  }

  // Build top8 from user's chosen bestThirds (must be exactly 8 to unlock bracket)
  const thirdsByTeam = {};
  for (const { group, team } of getPredictedThirds()) {
    thirdsByTeam[team] = { group, team };
  }
  for (const team of state.prediction.bestThirds) {
    if (thirdsByTeam[team]) top8.push(thirdsByTeam[team]);
  }

  const ready = top8.length === 8;
  const thirdsAssignments = {};
  if (ready && typeof lookupFifaThirdPlaceMatrix === "function") {
    const matrixLookup = lookupFifaThirdPlaceMatrix(top8.map(t => t.group));
    if (matrixLookup) {
      const groupToTeam = {};
      for (const t of top8) groupToTeam[t.group] = t;
      for (const m of FIXTURES) {
        if (m.stage !== "r32") continue;
        const winMatch = m.team1.match(/^([A-L])1$/);
        if (!winMatch) continue;
        const winnerLetter = winMatch[1];
        const thirdGroup = matrixLookup[winnerLetter];
        if (!thirdGroup) continue;
        const ti = groupToTeam[thirdGroup];
        if (ti) thirdsAssignments[`${matchId(m)}:2`] = ti;
      }
    }
  }

  const predKo = { complete: ready, winners, runnersUp, top8, thirdsAssignments };
  if (!isViewingShared()) pruneStalePredictKoWinners(predKo);
  return predKo;
}

// A KO winner is stored by team NAME. If an upstream change (group order, best
// thirds, or an earlier-round pick) means a stored winner is no longer one of
// the two teams now in that match, drop it permanently — otherwise it would
// silently reactivate if that same team later flows back into the slot, looking
// like the next round auto-selected itself. Forward pass (R32→Final) so clearing
// an early pick cascades to the rounds it feeds within the same sweep.
function pruneStalePredictKoWinners(predKo) {
  let changed = false;
  for (const stage of ["r32", "r16", "qf", "sf", "third", "final"]) {
    for (const m of FIXTURES) {
      if (m.stage !== stage) continue;
      const id = matchId(m);
      const picked = state.prediction.koWinners[id];
      if (!picked) continue;
      const { team1, team2 } = predictResolveMatchTeams(m, predKo);
      if (picked !== team1 && picked !== team2) {
        delete state.prediction.koWinners[id];
        changed = true;
      }
    }
  }
  if (changed) savePrediction();
}

function predictResolveTeamName(placeholder, m, pos, predKo) {
  if (!predKo) return null;
  let mt;
  if ((mt = placeholder.match(/^([A-L])1$/))) return predKo.winners[mt[1]] || null;
  if ((mt = placeholder.match(/^([A-L])2$/))) return predKo.runnersUp[mt[1]] || null;
  if (placeholder.startsWith("3rd ")) {
    if (!predKo.complete) return null;
    const a = predKo.thirdsAssignments[`${matchId(m)}:${pos}`];
    return a ? a.team : null;
  }
  return null;
}

function predictGetWinner(m, predKo) {
  const { team1, team2 } = predictResolveMatchTeams(m, predKo);
  if (!team1 || !team2) return null;
  const picked = state.prediction.koWinners[matchId(m)];
  if (picked && (picked === team1 || picked === team2)) return picked;
  return null;
}

function predictResolveBracketSlot(slot, predKo) {
  const stageMatches = FIXTURES.filter(f => f.stage === slot.stage);
  const src = stageMatches[slot.index];
  if (!src) return null;
  if (slot.role === "winner") return predictGetWinner(src, predKo);
  // loser slot (third-place match)
  const { team1, team2 } = predictResolveMatchTeams(src, predKo);
  if (!team1 || !team2) return null;
  const winner = predictGetWinner(src, predKo);
  if (!winner) return null;
  return winner === team1 ? team2 : team1;
}

function predictResolveMatchTeams(m, predKo) {
  if (m.stage === "group") return { team1: m.team1, team2: m.team2 };
  if (m.stage === "r32") {
    return {
      team1: predictResolveTeamName(m.team1, m, 1, predKo),
      team2: predictResolveTeamName(m.team2, m, 2, predKo),
    };
  }
  if (!m.bracket) return { team1: null, team2: null };
  return {
    team1: predictResolveBracketSlot(m.bracket.team1, predKo),
    team2: predictResolveBracketSlot(m.bracket.team2, predKo),
  };
}

function setPredictKoWinner(m, team) {
  if (team) state.prediction.koWinners[matchId(m)] = team;
  else delete state.prediction.koWinners[matchId(m)];
  savePrediction();
}

function clearAllPredictions() {
  state.prediction = { groupOrder: {}, bestThirds: [], koWinners: {} };
  savePrediction();
}

// ===== Shareable prediction link =====
// Encode shape: "v1.<48-digit group orders>.<thirds letters>.<32-digit KO winners>"
//   - groups: 4 digits per group A→L, each a 0-3 index into GROUPS[letter]
//   - thirds: 0-12 letters (groups whose 3rd-place team the user picked as best-8)
//   - KO:     1 digit per KO match in FIXTURES order — 0=no pick, 1=team1, 2=team2
// Total: ~92 chars worst case. Easy to text/share.
function encodePrediction(pred) {
  const letters = Object.keys(GROUPS).sort();

  // Group orders → 48 digits
  const groupStr = letters.map(letter => {
    const teams = GROUPS[letter];
    const userOrder = (pred.groupOrder && pred.groupOrder[letter]) || teams;
    const valid = userOrder.length === teams.length
      && userOrder.every(t => teams.includes(t))
      && new Set(userOrder).size === teams.length;
    if (!valid) return "0123";
    return userOrder.map(t => teams.indexOf(t)).join("");
  }).join("");

  // Thirds → group letters (sorted, dedup)
  const teamToGroup = {};
  for (const letter of letters) {
    const order = (pred.groupOrder && pred.groupOrder[letter]) || GROUPS[letter];
    if (order[2]) teamToGroup[order[2]] = letter;
  }
  const thirdsStr = [...new Set((pred.bestThirds || []).map(t => teamToGroup[t]).filter(Boolean))]
    .sort().join("");

  // KO winners → 0/1/2 per match. Use temporary state.prediction swap so
  // predictResolveMatchTeams resolves against the prediction we're encoding,
  // not the user's live state.
  const koMatches = FIXTURES.filter(m => m.stage !== "group");
  let koStr = "";
  const saved = state.prediction;
  state.prediction = pred;
  try {
    const predKo = buildPredictionKo();
    for (const m of koMatches) {
      const winner = (pred.koWinners || {})[matchId(m)];
      if (!winner) { koStr += "0"; continue; }
      const { team1, team2 } = predictResolveMatchTeams(m, predKo);
      koStr += winner === team1 ? "1" : winner === team2 ? "2" : "0";
    }
  } finally {
    state.prediction = saved;
  }

  return `v1.${groupStr}.${thirdsStr}.${koStr}`;
}

function decodePrediction(str) {
  if (!str || !str.startsWith("v1.")) return null;
  const parts = str.slice(3).split(".");
  if (parts.length !== 3) return null;
  const [groupStr, thirdsStr, koStr] = parts;

  const letters = Object.keys(GROUPS).sort();
  if (groupStr.length !== letters.length * 4) return null;

  // Group orders
  const groupOrder = {};
  for (let i = 0; i < letters.length; i++) {
    const letter = letters[i];
    const teams = GROUPS[letter];
    const segment = groupStr.slice(i * 4, (i + 1) * 4);
    const indices = segment.split("").map(c => parseInt(c, 10));
    if (indices.some(n => isNaN(n) || n < 0 || n >= teams.length)) return null;
    if (new Set(indices).size !== teams.length) return null; // must be a permutation
    groupOrder[letter] = indices.map(idx => teams[idx]);
  }

  // Thirds — derive team names from the decoded group orders
  const bestThirds = [];
  for (const c of thirdsStr) {
    if (!GROUPS[c]) continue;
    const team = groupOrder[c] && groupOrder[c][2];
    if (team && !bestThirds.includes(team)) bestThirds.push(team);
  }

  // KO winners — resolve teams progressively using the in-progress prediction
  const koMatches = FIXTURES.filter(m => m.stage !== "group");
  if (koStr.length !== koMatches.length) return null;

  const decoded = { groupOrder, bestThirds, koWinners: {} };
  const saved = state.prediction;
  state.prediction = decoded;
  try {
    for (let i = 0; i < koMatches.length; i++) {
      const code = koStr[i];
      if (code !== "1" && code !== "2") continue;
      const m = koMatches[i];
      const predKo = buildPredictionKo();
      const { team1, team2 } = predictResolveMatchTeams(m, predKo);
      const winner = code === "1" ? team1 : team2;
      if (winner) decoded.koWinners[matchId(m)] = winner;
    }
  } finally {
    state.prediction = saved;
  }

  return decoded;
}

// ----- Render -----
function renderPredict() {
  const view = els.predictView;
  view.innerHTML = "";
  const viewingShared = isViewingShared();

  // VIEW-ONLY mode for a shared prediction: show a banner with Save/Discard actions,
  // render everything else using the shared prediction (via a synchronous swap), and
  // skip attaching any edit handlers so the user's own picks stay safe.
  if (viewingShared) {
    const banner = document.createElement("div");
    banner.className = "predict-shared-banner";
    banner.innerHTML = `
      <div class="predict-shared-text">
        <strong>🔗 Viewing a shared prediction.</strong>
        Your own picks are still saved. Tap <em>Save as mine</em> to keep this instead, or <em>Back to mine</em> to discard.
      </div>
      <div class="predict-shared-actions">
        <button type="button" id="sharedSaveBtn" class="action-btn">Save as mine</button>
        <button type="button" id="sharedBackBtn" class="danger-btn">Back to mine</button>
      </div>
    `;
    view.appendChild(banner);
    banner.querySelector("#sharedSaveBtn").addEventListener("click", async () => {
      const ok = await showConfirm(
        "Save this shared prediction as your own? Your current picks will be replaced.",
        { title: "Save shared prediction?", icon: "🔗", iconType: "info", confirmLabel: "Save as mine" }
      );
      if (!ok) return;
      // Deep-copy so future shared edits don't mutate user's state
      state.prediction = JSON.parse(JSON.stringify(state.sharedPrediction));
      savePrediction();
      state.sharedPrediction = null;
      renderPredict();
    });
    banner.querySelector("#sharedBackBtn").addEventListener("click", () => {
      state.sharedPrediction = null;
      renderPredict();
    });
  }

  const header = document.createElement("div");
  header.className = "predict-header";
  header.innerHTML = `
    <p>${viewingShared
        ? "You're viewing a friend's picks (read-only). Use the banner above to save them or return to your own."
        : "Pick your full World Cup prediction. All choices save automatically to this browser only."
      }</p>
    <div class="predict-header-actions">
      <button type="button" id="predictShareBtn" class="action-btn" ${viewingShared ? "disabled" : ""}>🔗 Share link</button>
      <button type="button" id="predictSaveImgBtn" class="action-btn">📷 Save image</button>
      <button type="button" id="predictSavePdfBtn" class="action-btn">📄 Save PDF</button>
      <button type="button" id="predictResetBtn" class="danger-btn" ${viewingShared ? "disabled" : ""}>Reset all</button>
    </div>
  `;
  view.appendChild(header);
  if (!viewingShared) {
    header.querySelector("#predictResetBtn").addEventListener("click", async () => {
      const ok = await showConfirm("Clear all your group standings, third-place picks, and bracket choices?", {
        title: "Reset predictions",
        icon: "♻",
        confirmLabel: "Reset",
        danger: true,
      });
      if (!ok) return;
      clearAllPredictions();
      renderPredict();
    });
    header.querySelector("#predictShareBtn").addEventListener("click", () => sharePredictionLink());
  }
  header.querySelector("#predictSaveImgBtn").addEventListener("click", (e) => downloadPrediction("png", e.currentTarget));
  header.querySelector("#predictSavePdfBtn").addEventListener("click", (e) => downloadPrediction("pdf", e.currentTarget));

  // Sub-renders read state.prediction. Swap it to the shared one for the duration
  // of this synchronous render, then restore — so the rendered DOM reflects the
  // shared prediction without ever mutating the user's saved state.
  const savedOwn = state.prediction;
  if (viewingShared) state.prediction = state.sharedPrediction;
  try {
    view.appendChild(renderPredictGroupsSection());
    view.appendChild(renderPredictThirdsSection());
    view.appendChild(renderPredictBracketSection());
  } finally {
    state.prediction = savedOwn;
  }
}

async function sharePredictionLink() {
  const encoded = encodePrediction(state.prediction);
  // Strip any existing hash before appending the new one
  const baseUrl = `${location.origin}${location.pathname}${location.search}`;
  const url = `${baseUrl}#pred=${encoded}`;

  // Try modern clipboard API first; needs HTTPS + user gesture (we have both)
  let copied = false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(url);
      copied = true;
    }
  } catch { /* fall through to manual copy modal */ }

  const message = copied
    ? "Link copied to your clipboard. Paste it in any chat or email — recipients see your exact picks when they open it."
    : "Copy the link below and share it. Recipients see your exact picks when they open it.";

  // Show a modal with the URL so the user can verify (or copy manually if clipboard failed)
  const existing = document.getElementById("shareModal");
  if (existing) existing.remove();
  const modal = document.createElement("div");
  modal.id = "shareModal";
  modal.className = "modal";
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-dialog" role="dialog" aria-modal="true">
      <div class="modal-icon modal-icon-info">🔗</div>
      <h2>${copied ? "Link copied!" : "Share this link"}</h2>
      <p class="modal-subtitle">${message}</p>
      <input type="text" class="modal-input" id="shareUrlInput" readonly value="${url.replace(/"/g, "&quot;")}">
      <div class="modal-actions">
        <button class="modal-btn modal-btn-ghost" id="shareCloseBtn" type="button">Close</button>
        <button class="modal-btn modal-btn-primary" id="shareCopyBtn" type="button">${copied ? "Copy again" : "Copy"}</button>
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
  const urlInput = modal.querySelector("#shareUrlInput");
  urlInput.addEventListener("focus", () => urlInput.select());
  modal.querySelector(".modal-backdrop").addEventListener("click", close);
  modal.querySelector("#shareCloseBtn").addEventListener("click", close);
  modal.querySelector("#shareCopyBtn").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(url);
      modal.querySelector("h2").textContent = "Link copied!";
    } catch {
      urlInput.focus();
      urlInput.select();
      document.execCommand && document.execCommand("copy");
    }
  });
  // Auto-select the URL after a tick so user can ctrl-c immediately
  setTimeout(() => urlInput.select(), 80);
}

// Lazy-load a CDN script; resolves once it's available globally.
function loadExternalScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.dataset.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

async function downloadPrediction(format, btnEl) {
  const target = els.predictView;
  if (!target) return;

  // UI feedback while we load libs + render the capture
  const originalText = btnEl ? btnEl.textContent : "";
  const setBtn = (text, disabled) => {
    if (!btnEl) return;
    btnEl.textContent = text;
    btnEl.disabled = !!disabled;
  };
  setBtn("Working…", true);

  // Hide the header action buttons (and the page's sticky filter bar) during
  // capture so the saved file shows just the prediction itself.
  const hideDuringCapture = [
    target.querySelector(".predict-header-actions"),
    document.querySelector(".controls"),
  ].filter(Boolean);
  const originalDisplay = hideDuringCapture.map(el => el.style.display);
  hideDuringCapture.forEach(el => { el.style.display = "none"; });

  // Bracket scroll containers crop the wide bracket to the viewport; relax them
  // so the full bracket is captured rather than only the visible portion.
  const scrollers = target.querySelectorAll(".bracket-scroll");
  const originalOverflow = [];
  scrollers.forEach(s => {
    originalOverflow.push(s.style.overflow);
    s.style.overflow = "visible";
  });

  try {
    await loadExternalScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js");
    if (format === "pdf") {
      await loadExternalScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
    }

    const canvas = await window.html2canvas(target, {
      backgroundColor: "#0b1020",
      scale: Math.min(2, window.devicePixelRatio || 1.5),
      useCORS: true,
      logging: false,
      windowWidth: Math.max(document.documentElement.clientWidth, target.scrollWidth),
    });

    const stamp = new Date().toISOString().slice(0, 10);

    if (format === "png") {
      const link = document.createElement("a");
      link.download = `wc2026-prediction-${stamp}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } else {
      const { jsPDF } = window.jspdf;
      const w = canvas.width;
      const h = canvas.height;
      const pdf = new jsPDF({
        orientation: w > h ? "landscape" : "portrait",
        unit: "px",
        format: [w, h],
        compress: true,
      });
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, w, h);
      pdf.save(`wc2026-prediction-${stamp}.pdf`);
    }
  } catch (err) {
    showAlert("Could not generate the file: " + (err.message || err), {
      title: "Save failed",
      icon: "⚠️",
      iconType: "warning",
    });
  } finally {
    hideDuringCapture.forEach((el, i) => { el.style.display = originalDisplay[i] || ""; });
    scrollers.forEach((s, i) => { s.style.overflow = originalOverflow[i] || ""; });
    setBtn(originalText, false);
  }
}

function renderPredictGroupsSection() {
  const section = document.createElement("section");
  section.className = "predict-step";
  section.innerHTML = `
    <h2 class="predict-step-title"><span class="predict-step-num">1</span> Group Standings</h2>
    <p class="predict-step-hint">Use ↑ / ↓ to order each group from 1st to 4th. Top 2 of each group always qualify (green). The 3rd-placed team is eligible for the best-8 picker below (gold).</p>
    <div class="predict-groups"></div>
  `;
  const grid = section.querySelector(".predict-groups");
  const letters = Object.keys(GROUPS).sort();
  for (const letter of letters) {
    const card = document.createElement("div");
    card.className = "predict-group-card";
    const order = getPredictedGroupOrder(letter);
    const locked = isViewingShared();
    if (locked) card.classList.add("is-locked");
    card.innerHTML = `
      <h3>Group ${letter}</h3>
      <ol class="predict-group-list">
        ${order.map((team, idx) => `
          <li class="predict-team-row ${idx < 2 ? "qualify" : idx === 2 ? "third" : "out"}">
            <span class="predict-pos">${idx + 1}</span>
            <span class="flag">${flagFor(team)}</span>
            <span class="predict-team-name">${escapeHTML(team)}</span>
            <span class="predict-move">
              <button type="button" class="predict-move-btn" data-dir="up" data-team="${escapeHTML(team)}" ${(idx === 0 || locked) ? "disabled" : ""} aria-label="Move ${escapeHTML(team)} up">▲</button>
              <button type="button" class="predict-move-btn" data-dir="down" data-team="${escapeHTML(team)}" ${(idx === order.length - 1 || locked) ? "disabled" : ""} aria-label="Move ${escapeHTML(team)} down">▼</button>
            </span>
          </li>
        `).join("")}
      </ol>
    `;
    if (!locked) {
      card.querySelectorAll(".predict-move-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          const team = btn.dataset.team;
          const dir = btn.dataset.dir;
          const curr = getPredictedGroupOrder(letter);
          const i = curr.indexOf(team);
          if (i < 0) return;
          const j = dir === "up" ? i - 1 : i + 1;
          if (j < 0 || j >= curr.length) return;
          [curr[i], curr[j]] = [curr[j], curr[i]];
          setPredictedGroupOrder(letter, curr);
          renderPredict();
        });
      });
    }
    grid.appendChild(card);
  }
  return section;
}

function renderPredictThirdsSection() {
  const section = document.createElement("section");
  section.className = "predict-step";
  const thirds = getPredictedThirds();

  // Drop any best-third picks that are no longer 3rd in their group
  // (can happen when the user reorders a group after picking)
  const currentTeamSet = new Set(thirds.map(t => t.team));
  const cleaned = state.prediction.bestThirds.filter(t => currentTeamSet.has(t));
  if (cleaned.length !== state.prediction.bestThirds.length) {
    state.prediction.bestThirds = cleaned;
    savePrediction();
  }

  const selected = new Set(state.prediction.bestThirds);
  const count = state.prediction.bestThirds.length;

  section.innerHTML = `
    <h2 class="predict-step-title"><span class="predict-step-num">2</span> Best 8 Third-Place Teams</h2>
    <p class="predict-step-hint">Tap to select which 8 of the 12 third-placed teams advance to the Round of 32. <strong class="predict-thirds-count ${count === 8 ? "is-complete" : ""}">${count}/8 selected</strong></p>
    <div class="predict-thirds-grid"></div>
  `;
  const grid = section.querySelector(".predict-thirds-grid");
  for (const { group, team } of thirds) {
    const isSelected = selected.has(team);
    const isLocked = isViewingShared();
    // Reaching 8 disables only the unselected ones
    const isDisabled = isLocked || (!isSelected && count >= 8);
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `predict-third-chip${isSelected ? " is-selected" : ""}${isDisabled ? " is-disabled" : ""}${isLocked ? " is-locked" : ""}`;
    chip.disabled = isDisabled;
    chip.innerHTML = `
      <span class="predict-third-group">3rd ${group}</span>
      <span class="flag">${flagFor(team)}</span>
      <span class="predict-third-team">${escapeHTML(team)}</span>
    `;
    if (!isLocked) {
      chip.addEventListener("click", () => {
        toggleBestThird(team);
        renderPredict();
      });
    }
    grid.appendChild(chip);
  }
  return section;
}

function renderPredictBracketSection() {
  const section = document.createElement("section");
  section.className = "predict-step";

  const predKo = buildPredictionKo();

  const finalMatch = FIXTURES.find(m => m.stage === "final");
  const champion = finalMatch ? predictGetWinner(finalMatch, predKo) : null;

  section.innerHTML = `
    <h2 class="predict-step-title"><span class="predict-step-num">3</span> Bracket</h2>
    <p class="predict-step-hint">Tap a team in each match to pick the winner. Picks propagate to the next round automatically.</p>
    ${champion ? `<div class="ko-banner champion-banner">🏆 <span class="flag">${flagFor(champion)}</span> <strong>${escapeHTML(champion)}</strong> — your predicted World Champion!</div>` : ""}
    <div class="bracket-layout-toggle">
      <span class="bracket-layout-label">Layout:</span>
      <button type="button" class="bracket-layout-btn${state.bracketLayout === "onesided" ? " active" : ""}" data-layout="onesided">One-sided</button>
      <button type="button" class="bracket-layout-btn${state.bracketLayout === "twosided" ? " active" : ""}" data-layout="twosided">Two-sided</button>
    </div>
    <div class="bracket-scroll"></div>
  `;

  section.querySelectorAll(".bracket-layout-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      state.bracketLayout = btn.dataset.layout;
      localStorage.setItem("wc26_bracketLayout", state.bracketLayout);
      renderPredict();
    });
  });

  const scrollWrap = section.querySelector(".bracket-scroll");

  const allR32   = getMatchesInBracketOrder("r32");
  const allR16   = getMatchesInBracketOrder("r16");
  const allQF    = getMatchesInBracketOrder("qf");
  const allSF    = getMatchesInBracketOrder("sf");
  const allFinal = getMatchesInBracketOrder("final");

  function makeRound(label, matches) {
    const col = document.createElement("div");
    col.className = "bracket-round";
    col.innerHTML = `<h3 class="bracket-round-title">${label}</h3>`;
    const matchesDiv = document.createElement("div");
    matchesDiv.className = "bracket-matches";
    for (const m of matches) matchesDiv.appendChild(renderPredictBracketMatch(m, predKo));
    col.appendChild(matchesDiv);
    return col;
  }

  if (state.bracketLayout === "twosided") {
    const grid = document.createElement("div");
    grid.className = "bracket-two-sided";

    const leftHalf = document.createElement("div");
    leftHalf.className = "bracket-half bracket-left";
    leftHalf.appendChild(makeRound("Round of 32", allR32.slice(0, 8)));
    leftHalf.appendChild(makeRound("Round of 16", allR16.slice(0, 4)));
    leftHalf.appendChild(makeRound("Quarterfinals", allQF.slice(0, 2)));
    leftHalf.appendChild(makeRound("Semifinals", allSF.slice(0, 1)));

    const center = document.createElement("div");
    center.className = "bracket-center";
    center.innerHTML = `<h3 class="bracket-round-title">Final</h3>`;
    const finalDiv = document.createElement("div");
    finalDiv.className = "bracket-matches";
    for (const m of allFinal) finalDiv.appendChild(renderPredictBracketMatch(m, predKo));
    center.appendChild(finalDiv);

    const rightHalf = document.createElement("div");
    rightHalf.className = "bracket-half bracket-right";
    rightHalf.appendChild(makeRound("Semifinals", allSF.slice(1)));
    rightHalf.appendChild(makeRound("Quarterfinals", allQF.slice(2)));
    rightHalf.appendChild(makeRound("Round of 16", allR16.slice(4)));
    rightHalf.appendChild(makeRound("Round of 32", allR32.slice(8)));

    grid.appendChild(leftHalf);
    grid.appendChild(center);
    grid.appendChild(rightHalf);
    scrollWrap.appendChild(grid);
  } else {
    const bracket = document.createElement("div");
    bracket.className = "bracket predict-bracket";
    for (const [label, matches] of [
      ["Round of 32", allR32], ["Round of 16", allR16],
      ["Quarterfinals", allQF], ["Semifinals", allSF], ["Final", allFinal],
    ]) bracket.appendChild(makeRound(label, matches));
    scrollWrap.appendChild(bracket);
  }

  // Third-place match
  const thirdMatch = FIXTURES.find(m => m.stage === "third");
  if (thirdMatch) {
    const thirdSection = document.createElement("div");
    thirdSection.className = "bracket-third";
    thirdSection.innerHTML = `<h3 class="bracket-round-title">Third-Place Match</h3>`;
    thirdSection.appendChild(renderPredictBracketMatch(thirdMatch, predKo));
    section.appendChild(thirdSection);
  }

  return section;
}

function renderPredictBracketMatch(m, predKo) {
  const { team1, team2 } = predictResolveMatchTeams(m, predKo);
  const winner = predictGetWinner(m, predKo);
  const locked = isViewingShared();

  const card = document.createElement("div");
  card.className = "bracket-match predict-bracket-match";
  if (locked) card.classList.add("is-locked");

  const row = (team, isWinner, isLoser, isPlaceholder, side) => {
    const safeTeam = team ? escapeHTML(team) : "";
    const clickable = team && !isPlaceholder && !locked;
    return `
      <div class="bracket-team predict-bracket-team${isWinner ? " win" : ""}${isLoser ? " lose" : ""}${isPlaceholder ? " placeholder" : ""}${clickable ? " clickable" : ""}"
           ${clickable ? `data-team="${safeTeam}"` : ""}
           role="${clickable ? "button" : ""}"
           tabindex="${clickable ? "0" : "-1"}"
           >
        <span class="flag">${team ? flagFor(team) : ""}</span>
        <span class="bracket-team-name" title="${safeTeam}">${team || "TBD"}</span>
      </div>`;
  };

  const lockBadge = "";

  card.innerHTML =
    row(team1, winner && winner === team1, winner && winner !== team1, !team1, 1) +
    row(team2, winner && winner === team2, winner && winner !== team2, !team2, 2) +
    lockBadge;

  card.querySelectorAll(".predict-bracket-team.clickable").forEach(el => {
    const pickTeam = el.dataset.team;
    const select = () => {
      // Save horizontal scroll before re-render so the right side of the
      // two-sided bracket doesn't jump back to the left after picking.
      const scrollEl = els.predictView.querySelector(".bracket-scroll");
      const savedScroll = scrollEl ? scrollEl.scrollLeft : 0;

      const current = state.prediction.koWinners[matchId(m)];
      setPredictKoWinner(m, current === pickTeam ? null : pickTeam);
      renderPredict();

      if (savedScroll > 0) {
        requestAnimationFrame(() => {
          const newScroll = els.predictView.querySelector(".bracket-scroll");
          if (newScroll) newScroll.scrollLeft = savedScroll;
        });
      }
    };
    el.addEventListener("click", select);
    el.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(); }
    });
  });

  return card;
}

function renderGroups() {
  els.groupsView.innerHTML = "";
  const letters = Object.keys(GROUPS).sort();
  for (const letter of letters) {
    const teams = GROUPS[letter];
    const card = document.createElement("div");
    card.className = "group-card";
    card.innerHTML = `
      <h3>Group ${letter}</h3>
      <ul>${teams.map(t => `<li data-team="${t}"><span class="flag">${flagFor(t)}</span>${t}</li>`).join("")}</ul>
    `;
    card.querySelectorAll("li").forEach(li => {
      li.addEventListener("click", () => {
        state.selectedTeam = li.dataset.team;
        els.teamSelect.value = state.selectedTeam;
        switchView("schedule");
        render();
      });
    });
    els.groupsView.appendChild(card);
  }
}

function renderSummary(team, date) {
  if (!team && !date) {
    els.summary.hidden = true;
    return;
  }

  const parts = [];

  if (team) {
    const teamMatches = FIXTURES.filter(m => matchInvolves(m, team));
    let groupLetter = null;
    for (const [letter, teams] of Object.entries(GROUPS)) {
      if (teams.includes(team)) { groupLetter = letter; break; }
    }
    const opponents = teamMatches.map(m => m.team1 === team ? m.team2 : m.team1);
    parts.push(`<strong>${team}</strong>${groupLetter ? ` (Group ${groupLetter})` : ""} — ${teamMatches.length} group-stage matches vs ${opponents.join(", ")}.`);
  }

  if (date) {
    const tz = state.selectedTz;
    const dateMatches = FIXTURES.filter(m => dateKeyInTz(fixtureToUTC(m), tz) === date);
    parts.push(`<strong>${dateMatches.length}</strong> match${dateMatches.length === 1 ? "" : "es"} scheduled on <strong>${formatLocalDateLabel(date)}</strong>.`);
  }

  els.summary.hidden = false;
  els.summary.innerHTML = parts.join("<br>");
}

// --- View switching ---
function switchView(view) {
  state.view = view;
  unlockPointAudio();   // tab tap is a user gesture → unlock the point-change sound
  try { localStorage.setItem("wc26_lastView", view); } catch { /* quota */ }
  els.tabs.forEach(t => {
    const active = t.dataset.view === view;
    t.classList.toggle("active", active);
    t.setAttribute("aria-selected", active ? "true" : "false");
  });
  els.scheduleView.hidden = view !== "schedule";
  els.groupsView.hidden = view !== "groups";
  els.standingsView.hidden = view !== "standings";
  els.bracketView.hidden = view !== "bracket";
  els.scorersView.hidden = view !== "scorers";
  els.predictView.hidden = view !== "predict";
  els.picksView.hidden = view !== "picks";
  els.leaderboardView.hidden = view !== "leaderboard";
  if (view === "schedule") render();
  if (view === "groups") renderGroups();
  if (view === "standings") renderStandings();
  if (view === "bracket") renderBracket();
  if (view === "scorers") renderTopScorers();
  if (view === "predict") renderPredict();
  if (view === "picks") renderPicks();
  if (view === "leaderboard") renderLeaderboardView();
}

function render() {
  renderSummary(state.selectedTeam, state.selectedDate);
  if (state.view === "schedule") renderSchedule(state.selectedTeam, state.selectedDate);
}

// --- Events ---
let _renderDebounceTimer = 0;
function debouncedRender() {
  clearTimeout(_renderDebounceTimer);
  _renderDebounceTimer = setTimeout(render, 150);
}

els.teamSelect.addEventListener("change", e => {
  state.selectedTeam = e.target.value;
  if (state.view !== "schedule") switchView("schedule");
  else debouncedRender();
});

els.dateSelect.addEventListener("change", e => {
  state.selectedDate = e.target.value;
  if (state.view !== "schedule") switchView("schedule");
  else debouncedRender();
});

els.tzSelect.addEventListener("change", e => {
  state.selectedTz = e.target.value;
  populateDates(); // re-derive date options in new tz (immediate)
  debouncedRender();
});

els.clearBtn.addEventListener("click", () => {
  state.selectedTeam = "";
  state.selectedDate = "";
  state.selectedTz = "Asia/Dhaka";
  els.teamSelect.value = "";
  els.dateSelect.value = "";
  els.tzSelect.value = state.selectedTz;
  populateDates();
  render();
});

els.tabs.forEach(t => {
  t.addEventListener("click", () => switchView(t.dataset.view));
});

// ===== User auth UI =====
function updateUserBtn() {
  if (!els.userBtn) return;
  const label = els.userBtn.querySelector(".btn-label");
  if (state.currentUser) {
    if (label) label.textContent = ` ${state.currentUser.name}`;
    els.userBtn.classList.add("is-active");
    els.userBtn.title = "Click to sign out";
    if (els.settingsBtn) els.settingsBtn.hidden = false;
  } else {
    if (label) label.textContent = " Sign in";
    els.userBtn.classList.remove("is-active");
    els.userBtn.title = "Sign in to join the prediction leaderboard";
    if (els.settingsBtn) els.settingsBtn.hidden = true;
  }
}

function openAuthModal(mode = "signin") {
  const existing = document.getElementById("authModal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "authModal";
  modal.className = "modal";
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-dialog" role="dialog" aria-modal="true">
      <div class="modal-icon modal-icon-info">👤</div>
      <h2 id="authTitle">${mode === "signup" ? "Create account" : "Sign in"}</h2>
      <p class="modal-subtitle">${mode === "signup"
        ? "Join the leaderboard. Your picks will be saved to your account."
        : "Sign in to save picks and join the leaderboard."}</p>
      <input type="text" id="authName" class="modal-input"
             placeholder="Display name" autocomplete="name" spellcheck="false"
             style="${mode === "signup" ? "" : "display:none"}; margin-bottom:8px;">
      <input type="email" id="authEmail" class="modal-input"
             placeholder="Email" autocomplete="email" spellcheck="false" style="margin-bottom:8px;">
      <input type="password" id="authPassword" class="modal-input"
             placeholder="Password (min 8 chars)" autocomplete="${mode === "signup" ? "new-password" : "current-password"}">
      <p class="modal-error" id="authError" aria-live="polite"></p>
      <div class="modal-actions">
        <button id="authToggle" class="modal-btn modal-btn-ghost" type="button">
          ${mode === "signup" ? "Have an account? Sign in" : "New here? Create account"}
        </button>
        <button id="authSubmit" class="modal-btn modal-btn-primary" type="button">
          ${mode === "signup" ? "Sign up" : "Sign in"}
        </button>
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

  const err = modal.querySelector("#authError");
  const nameEl = modal.querySelector("#authName");
  const emailEl = modal.querySelector("#authEmail");
  const pwEl = modal.querySelector("#authPassword");
  const submit = async () => {
    err.textContent = "";
    const email = emailEl.value.trim();
    const pw = pwEl.value;
    if (!email || !pw) { err.textContent = "Email and password are required."; return; }
    if (mode === "signup" && !nameEl.value.trim()) { err.textContent = "Display name is required."; return; }
    if (pw.length < 8) { err.textContent = "Password must be at least 8 characters."; return; }
    try {
      const user = mode === "signup"
        ? await appwriteAuth.signUp(email, pw, nameEl.value.trim())
        : await appwriteAuth.logIn(email, pw);
      if (!user) { err.textContent = "Sign-in failed. Please try again."; return; }
      state.currentUser = user;
      setAdmin(isUserAdmin(user)); // grant admin only if this is the owner account
      updateUserBtn();
      close();
      await afterLogin();
      rerenderActive();           // re-render so admin-only UI appears immediately
    } catch (ex) {
      err.textContent = (ex && ex.message) || "Authentication error.";
    }
  };

  modal.querySelector(".modal-backdrop").addEventListener("click", close);
  modal.querySelector("#authSubmit").addEventListener("click", submit);
  modal.querySelector("#authToggle").addEventListener("click", () => {
    close();
    openAuthModal(mode === "signup" ? "signin" : "signup");
  });
  [nameEl, emailEl, pwEl].forEach(el => el.addEventListener("keydown", e => {
    if (e.key === "Enter") submit();
    if (e.key === "Escape") close();
  }));
  setTimeout(() => (mode === "signup" ? nameEl : emailEl).focus(), 60);
}

async function logoutUser() {
  const ok = await showConfirm(`Sign out of ${state.currentUser.name}?`, {
    title: "Sign out", icon: "👤", iconType: "info", confirmLabel: "Sign out",
  });
  if (!ok) return;
  await appwriteAuth.logOut();
  state.currentUser = null;
  state.matchPicks = {};           // clear picks so the next login doesn't inherit them
  saveMatchPicks();                // wipe localStorage too
  state.leaderboardUsers = [];
  state.leaderboardLoaded = false;
  setAdmin(false);                 // any admin powers go away with logout
  updateUserBtn();
  rerenderActive();                // re-render to drop admin-only controls
}

els.userBtn.addEventListener("click", () => {
  if (state.currentUser) logoutUser();
  else openAuthModal("signin");
});
if (els.settingsBtn) els.settingsBtn.addEventListener("click", openSettingsModal);

function openSettingsModal() {
  const existing = document.getElementById("settingsModal");
  if (existing) existing.remove();

  const u = state.currentUser;
  const modal = document.createElement("div");
  modal.id = "settingsModal";
  modal.className = "modal";
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-dialog" role="dialog" aria-modal="true">
      <div class="modal-icon modal-icon-info">⚙️</div>
      <h2>Account Settings</h2>
      <p class="modal-subtitle"><strong>${escapeHTML(u.name)}</strong><br><span style="opacity:0.7;font-size:13px">${escapeHTML(u.email)}</span></p>
      <div class="modal-actions" style="flex-direction:column;gap:10px">
        <button id="settingsChangePw" class="modal-btn modal-btn-primary" type="button" style="width:100%">🔑 Change Password</button>
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

  modal.querySelector(".modal-backdrop").addEventListener("click", close);
  modal.querySelector("#settingsChangePw").addEventListener("click", () => { close(); openChangePasswordModal(); });
}

function openChangePasswordModal() {
  const existing = document.getElementById("changePwModal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "changePwModal";
  modal.className = "modal";
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-dialog" role="dialog" aria-modal="true">
      <div class="modal-icon modal-icon-info">🔑</div>
      <h2>Change Password</h2>
      <input type="password" id="cpwCurrent" class="modal-input" placeholder="Current password" autocomplete="current-password" style="margin-bottom:8px">
      <input type="password" id="cpwNew" class="modal-input" placeholder="New password (min 8 chars)" autocomplete="new-password" style="margin-bottom:8px">
      <input type="password" id="cpwConfirm" class="modal-input" placeholder="Confirm new password" autocomplete="new-password">
      <p class="modal-error" id="cpwError" aria-live="polite"></p>
      <div class="modal-actions">
        <button id="cpwCancel" class="modal-btn modal-btn-ghost" type="button">Cancel</button>
        <button id="cpwSubmit" class="modal-btn modal-btn-primary" type="button">Update Password</button>
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

  const err = modal.querySelector("#cpwError");
  const submit = async () => {
    err.textContent = "";
    const current = modal.querySelector("#cpwCurrent").value;
    const next = modal.querySelector("#cpwNew").value;
    const confirm = modal.querySelector("#cpwConfirm").value;
    if (!current || !next || !confirm) { err.textContent = "All fields are required."; return; }
    if (next.length < 8) { err.textContent = "New password must be at least 8 characters."; return; }
    if (next !== confirm) { err.textContent = "New passwords do not match."; return; }
    const btn = modal.querySelector("#cpwSubmit");
    btn.disabled = true;
    btn.textContent = "Updating…";
    try {
      await appwriteAuth.updatePassword(next, current);
      close();
      showAlert("Your password has been updated.", { title: "Password changed", icon: "✅", iconType: "success" });
    } catch (ex) {
      err.textContent = (ex && ex.message) || "Failed to update password.";
      btn.disabled = false;
      btn.textContent = "Update Password";
    }
  };

  modal.querySelector(".modal-backdrop").addEventListener("click", close);
  modal.querySelector("#cpwCancel").addEventListener("click", close);
  modal.querySelector("#cpwSubmit").addEventListener("click", submit);
  modal.querySelectorAll("input").forEach(el => el.addEventListener("keydown", e => {
    if (e.key === "Enter") submit();
    if (e.key === "Escape") close();
  }));
  setTimeout(() => modal.querySelector("#cpwCurrent").focus(), 60);
}

// First-login migration: push any local picks up so the user's account adopts them.
async function afterLogin() {
  // Only fetch own doc (1 read). Full leaderboard is lazy-loaded when first opened.
  const ownServerRow = await userPicksSync.fetchOwn();
  if (ownServerRow) {
    // Keep own row in leaderboardUsers for self-scoring while leaderboard is unloaded
    const idx = state.leaderboardUsers.findIndex(u => u.userId === state.currentUser.id);
    if (idx >= 0) state.leaderboardUsers[idx] = ownServerRow;
    else state.leaderboardUsers.push(ownServerRow);
  }
  state.leaderboardLoaded = false; // force reload on next leaderboard open
  const localCount = Object.keys(state.matchPicks).length;
  const serverCount = ownServerRow ? Object.keys(ownServerRow.picks).length : 0;

  if (localCount > 0 && serverCount === 0) {
    // First-time login with local picks → push them up
    state.currentUser.firstSubmittedAt = new Date().toISOString();
    await userPicksSync.saveOwn();
  } else if (serverCount > 0 && localCount === 0) {
    // Returning user, no local picks → pull server picks
    state.matchPicks = ownServerRow.picks;
    saveMatchPicks();
  } else if (serverCount > 0 && localCount > 0) {
    // Both exist — prompt user to choose
    const useLocal = await showConfirm(
      `You have ${localCount} picks on this device and ${serverCount} on your account. Keep this device's picks and overwrite the server?`,
      { title: "Merge picks", icon: "🔀", iconType: "info", confirmLabel: "Use device", danger: true }
    );
    if (useLocal) {
      await userPicksSync.saveOwn();
    } else {
      state.matchPicks = ownServerRow.picks;
      saveMatchPicks();
    }
  }
  if (state.view === "picks") renderPicks();
}

// ===== Firebase backend config =====
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCNC2IsCGqZjyapHwDD7yH_9FoNeFjurOY",
  authDomain: "wc2026-aaddd.firebaseapp.com",
  projectId: "wc2026-aaddd",
  storageBucket: "wc2026-aaddd.firebasestorage.app",
  messagingSenderId: "689847361298",
  appId: "1:689847361298:web:94be2c7f0b47e74a031dcb",
};
// Admins are identified by email — must match the Firestore security rules.
const ADMIN_EMAILS = ["tpsohel46@gmail.com"];
const FB_COLL = { results: "matchresults", standings: "standingsoverrides", userpicks: "userpicks" };

// Shared Firebase handles (the compat SDK exposes a global `firebase`).
let _fbDb = null, _fbAuth = null;
if (typeof firebase !== "undefined" && firebase.initializeApp) {
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    _fbDb = firebase.firestore();
    // Offline persistence (IndexedDB): onSnapshot then serves from the local
    // cache and pulls only *changed* docs from the server, so repeat loads cost
    // ~no reads. Must run before any other Firestore use. Rejects harmlessly if
    // multiple tabs are open or the browser doesn't support it.
    try { _fbDb.enablePersistence({ synchronizeTabs: true }).catch(() => {}); }
    catch { /* persistence unsupported — falls back to network reads */ }
    _fbAuth = firebase.auth();
    _fbAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});
  } catch (e) {
    console.warn("Firebase init failed — local-only mode:", e.message || e);
  }
}
const _fbServerTime = () => firebase.firestore.FieldValue.serverTimestamp();
const _fbIso = (t) => (t && t.toDate) ? t.toDate().toISOString() : "";

// ===== Results + standings sync (Firestore) =====
const appwriteSync = (() => {
  if (!_fbDb) {
    console.warn("Firebase not available — running in local-only mode.");
    return {
      available: false,
      scheduleMatch() {}, scheduleStandings() {},
      deleteMatch() {}, deleteStandings() {},
      bootstrap: async () => null, isConnected: () => false,
    };
  }
  const db = _fbDb;
  const RESULTS = FB_COLL.results, STANDINGS = FB_COLL.standings;

  // matchIds contain spaces/slashes; Firestore doc IDs can't contain "/". Hash to a safe id.
  function safeDocId(matchId) {
    let h1 = 5381, h2 = 52711;
    for (let i = 0; i < matchId.length; i++) {
      const c = matchId.charCodeAt(i);
      h1 = ((h1 << 5) + h1 + c) >>> 0;
      h2 = ((h2 << 5) - h2 + c) >>> 0;
    }
    return ("m" + h1.toString(36) + h2.toString(36)).slice(0, 36);
  }

  function docToResult(data) {
    const r = {};
    if (data.score1 !== null && data.score1 !== undefined) r.score1 = data.score1;
    if (data.score2 !== null && data.score2 !== undefined) r.score2 = data.score2;
    if (data.pen1 !== null && data.pen1 !== undefined) r.pen1 = data.pen1;
    if (data.pen2 !== null && data.pen2 !== undefined) r.pen2 = data.pen2;
    if (Array.isArray(data.scorers) && data.scorers.length) r.scorers = data.scorers;
    if (Array.isArray(data.cards) && data.cards.length) r.cards = data.cards;
    return sanitizeResult(r);
  }

  // Firestore rejects `undefined` anywhere — a JSON round-trip drops those keys.
  const clean = (arr) => JSON.parse(JSON.stringify(arr || []));
  function resultToPayload(matchId, r) {
    return {
      matchId,
      score1: r.score1 ?? null,
      score2: r.score2 ?? null,
      pen1: r.pen1 ?? null,
      pen2: r.pen2 ?? null,
      scorers: clean((Array.isArray(r.scorers) ? r.scorers : []).filter(s => s && !s.card)),
      cards: clean(Array.isArray(r.cards) ? r.cards : []),
      updatedAt: _fbServerTime(),
    };
  }

  const pendingMatchTimers = new Map();
  const pendingStandingTimers = new Map();
  const DEBOUNCE_MS = 400;

  async function pushMatch(matchId) {
    const r = state.results[matchId];
    const ref = db.collection(RESULTS).doc(safeDocId(matchId));
    try {
      if (!r) await ref.delete();
      else await ref.set(resultToPayload(matchId, r));
    } catch (err) { console.warn("Firestore match write failed:", err.message || err); }
  }

  async function pushStandings(groupLetter) {
    const order = state.standingsOverride[groupLetter];
    const ref = db.collection(STANDINGS).doc(groupLetter);
    try {
      if (!Array.isArray(order) || order.length === 0) await ref.delete();
      else await ref.set({ groupLetter, order, updatedAt: _fbServerTime() });
    } catch (err) { console.warn("Firestore standings write failed:", err.message || err); }
  }

  function scheduleMatch(matchId) {
    clearTimeout(pendingMatchTimers.get(matchId));
    pendingMatchTimers.set(matchId, setTimeout(() => { pendingMatchTimers.delete(matchId); pushMatch(matchId); }, DEBOUNCE_MS));
  }
  function scheduleStandings(groupLetter) {
    clearTimeout(pendingStandingTimers.get(groupLetter));
    pendingStandingTimers.set(groupLetter, setTimeout(() => { pendingStandingTimers.delete(groupLetter); pushStandings(groupLetter); }, DEBOUNCE_MS));
  }

  // Lightweight version probe: per-collection doc count + newest updatedAt, so a
  // fresh cache can skip the full bootstrap.
  async function collMeta(coll) {
    let total = 0, latest = "";
    try { total = (await db.collection(coll).count().get()).data().count; }
    catch { total = (await db.collection(coll).get()).size; }
    try {
      const snap = await db.collection(coll).orderBy("updatedAt", "desc").limit(1).get();
      if (!snap.empty) latest = _fbIso(snap.docs[0].get("updatedAt"));
    } catch { /* updatedAt field not present yet */ }
    return { total, latest };
  }
  async function checkRemoteVersion() {
    try {
      const [res, ovr] = await Promise.all([collMeta(RESULTS), collMeta(STANDINGS)]);
      return { resultsTotal: res.total, overridesTotal: ovr.total, latestResultUpdate: res.latest, latestStandingsUpdate: ovr.latest };
    } catch (err) { console.warn("Firestore version check failed:", err.message || err); return null; }
  }

  async function bootstrap() {
    try {
      const [resSnap, ovrSnap] = await Promise.all([db.collection(RESULTS).get(), db.collection(STANDINGS).get()]);
      const results = {}, overrides = {};
      let maxR = "", maxS = "";
      resSnap.forEach(doc => {
        const data = doc.data();
        const r = docToResult(data);
        if (data.matchId && Object.keys(r).length > 0) results[data.matchId] = r;
        const iso = _fbIso(data.updatedAt); if (iso > maxR) maxR = iso;
      });
      ovrSnap.forEach(doc => {
        const data = doc.data();
        if (data.groupLetter && Array.isArray(data.order)) overrides[data.groupLetter] = data.order;
        const iso = _fbIso(data.updatedAt); if (iso > maxS) maxS = iso;
      });
      return { results, overrides, meta: { resultsTotal: resSnap.size, overridesTotal: ovrSnap.size, latestResultUpdate: maxR, latestStandingsUpdate: maxS } };
    } catch (err) { console.warn("Firestore bootstrap failed:", err.message || err); return null; }
  }

  function subscribe() {
    let seededResults = false, seededStandings = false;
    db.collection(RESULTS).onSnapshot((snap) => {
      // First *server* load doubles as the seed: if the server is empty but this
      // (admin) device has local results, upload them once. Wait for a non-cache
      // snapshot so the offline cache's empty first emit doesn't trigger it.
      if (!seededResults && !snap.metadata.fromCache) {
        seededResults = true;
        if (snap.empty && Object.keys(state.results).length > 0) {
          for (const mid of Object.keys(state.results)) scheduleMatch(mid);
        }
      }
      let changed = false;
      snap.docChanges().forEach((ch) => {
        const data = ch.doc.data();
        const mid = data.matchId;
        if (!mid) return;
        const iso = _fbIso(data.updatedAt);
        if (ch.type === "removed") {
          if (mid in state.results) { delete state.results[mid]; changed = true; }
        } else {
          const newR = docToResult(data);
          if (JSON.stringify(state.results[mid]) === JSON.stringify(newR)) { bumpCacheVersionFromEvent("results", { $updatedAt: iso }); return; }
          state.results[mid] = newR; changed = true;
        }
        bumpCacheVersionFromEvent("results", { $updatedAt: iso });
      });
      if (changed) { saveResults(); rerenderActive(); }
    }, (err) => console.warn("Firestore results subscribe failed:", err.message || err));

    db.collection(STANDINGS).onSnapshot((snap) => {
      if (!seededStandings && !snap.metadata.fromCache) {
        seededStandings = true;
        if (snap.empty && Object.keys(state.standingsOverride).length > 0) {
          for (const g of Object.keys(state.standingsOverride)) scheduleStandings(g);
        }
      }
      let changed = false;
      snap.docChanges().forEach((ch) => {
        const data = ch.doc.data();
        const g = data.groupLetter;
        if (!g) return;
        const iso = _fbIso(data.updatedAt);
        if (ch.type === "removed") {
          if (g in state.standingsOverride) { delete state.standingsOverride[g]; changed = true; }
        } else if (Array.isArray(data.order)) {
          if (JSON.stringify(state.standingsOverride[g]) === JSON.stringify(data.order)) { bumpCacheVersionFromEvent("standings", { $updatedAt: iso }); return; }
          state.standingsOverride[g] = data.order; changed = true;
        }
        bumpCacheVersionFromEvent("standings", { $updatedAt: iso });
      });
      if (changed) { saveStandingsOverride(); rerenderActive(); }
    }, (err) => console.warn("Firestore standings subscribe failed:", err.message || err));
  }

  return {
    available: true,
    scheduleMatch, scheduleStandings,
    deleteMatch: (m) => pushMatch(m),
    deleteStandings: (g) => pushStandings(g),
    bootstrap, checkRemoteVersion, subscribe,
  };
})();

// ===== User auth (Firebase Auth) =====
const appwriteAuth = (() => {
  if (!_fbAuth) {
    return {
      available: false,
      getCurrent: async () => null,
      signUp: async () => { throw new Error("Auth unavailable"); },
      logIn: async () => { throw new Error("Auth unavailable"); },
      logOut: async () => {},
    };
  }
  const auth = _fbAuth;
  const toUser = (u) => u ? { id: u.uid, name: u.displayName || u.email, email: u.email, labels: [] } : null;

  async function getCurrent() {
    const u = auth.currentUser || await new Promise((resolve) => {
      const unsub = auth.onAuthStateChanged((usr) => { unsub(); resolve(usr); }, () => resolve(null));
    });
    return toUser(u);
  }
  async function signUp(email, password, name) {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    if (name && cred.user) { try { await cred.user.updateProfile({ displayName: name }); } catch { /* non-fatal */ } }
    return toUser(auth.currentUser);
  }
  async function logIn(email, password) {
    await auth.signInWithEmailAndPassword(email, password);
    return toUser(auth.currentUser);
  }
  async function logOut() { try { await auth.signOut(); } catch { /* ignore */ } }
  async function updatePassword(newPassword, oldPassword) {
    const u = auth.currentUser;
    if (!u) throw new Error("Not signed in");
    try {
      const cred = firebase.auth.EmailAuthProvider.credential(u.email, oldPassword);
      await u.reauthenticateWithCredential(cred);
    } catch { throw new Error("Current password is incorrect"); }
    await u.updatePassword(newPassword);
  }
  return { available: true, getCurrent, signUp, logIn, logOut, updatePassword };
})();

// ===== Compact picks encoding (fits 104 matches in < 1 KB) =====
// Format: comma-separated tokens, one per fixture in FIXTURES order.
//   ""       no pick
//   "2-1"    group/KO regulation prediction
//   "1-1p1"  KO tied prediction with PK winner = team1 (or p2 = team2)
// Numbers are 0-99; pkWinner is "1" or "2" or absent.
function encodeMatchPicks(picksObj) {
  const tokens = FIXTURES.map(m => {
    const p = picksObj[matchId(m)];
    if (!p || p.score1 === undefined || p.score2 === undefined) return "";
    let t = `${p.score1}-${p.score2}`;
    if (p.pkWinner === 1 || p.pkWinner === 2) t += `p${p.pkWinner}`;
    return t;
  });
  return tokens.join(",");
}
function decodeMatchPicks(str) {
  const out = {};
  if (typeof str !== "string" || !str) return out;
  const tokens = str.split(",");
  for (let i = 0; i < FIXTURES.length && i < tokens.length; i++) {
    const tok = tokens[i];
    if (!tok) continue;
    const mr = tok.match(/^(\d{1,2})-(\d{1,2})(?:p([12]))?$/);
    if (!mr) continue;
    const m = FIXTURES[i];
    out[matchId(m)] = {
      score1: parseInt(mr[1], 10),
      score2: parseInt(mr[2], 10),
      ...(mr[3] ? { pkWinner: parseInt(mr[3], 10) } : {}),
    };
  }
  return out;
}

// ===== User picks server sync (Firestore) =====
const userPicksSync = (() => {
  if (!_fbDb) {
    return { available: false, saveOwn: async () => {}, fetchOwn: async () => null, fetchAll: async () => [], subscribe: () => {} };
  }
  const db = _fbDb;
  const COLL = FB_COLL.userpicks;
  let pendingSaveTimer = null;
  const SAVE_DEBOUNCE_MS = 600;

  const rowFromDoc = (data) => ({
    userId: data.userId,
    userName: data.userName,
    picks: decodeMatchPicks(data.picks || ""),
    firstSubmittedAt: data.firstSubmittedAt || "",
    totalPicks: data.totalPicks || 0,
  });

  async function saveOwn() {
    if (!state.currentUser) return;
    if (pendingSaveTimer) clearTimeout(pendingSaveTimer);
    pendingSaveTimer = setTimeout(() => doSaveOwn().catch(err => console.warn("User picks save failed:", err.message || err)), SAVE_DEBOUNCE_MS);
  }
  async function doSaveOwn() {
    if (!state.currentUser) return;
    const uid = state.currentUser.id;
    if (!state.currentUser.firstSubmittedAt) state.currentUser.firstSubmittedAt = new Date().toISOString();

    // A kicked-off match's pick is final. Never let this device overwrite the
    // server's existing pick for a locked match (e.g. via the "use device"
    // merge, or a stale second device). Merge the server's locked picks back in
    // before saving. Only needed once matches start locking.
    let picks = state.matchPicks;
    if (FIXTURES.some(m => isMatchLocked(m))) {
      try {
        const snap = await db.collection(COLL).doc(uid).get();
        if (snap.exists) {
          const serverPicks = decodeMatchPicks(snap.data().picks || "");
          picks = { ...state.matchPicks };
          for (const m of FIXTURES) {
            const id = matchId(m);
            if (isMatchLocked(m) && serverPicks[id]) picks[id] = serverPicks[id];
          }
        }
      } catch { /* read failed — fall back to device picks */ }
    }

    const payload = {
      userId: uid,
      userName: state.currentUser.name,
      picks: encodeMatchPicks(picks),
      firstSubmittedAt: state.currentUser.firstSubmittedAt,
      totalPicks: Object.keys(picks).filter(id => {
        const p = picks[id];
        return p && p.score1 !== undefined && p.score2 !== undefined;
      }).length,
      updatedAt: _fbServerTime(),
    };
    // doc id = uid; Firestore rules require data.userId == auth.uid for write.
    await db.collection(COLL).doc(uid).set(payload, { merge: true });
  }

  async function fetchAll() {
    const all = [];
    try {
      const snap = await db.collection(COLL).get();
      snap.forEach(doc => {
        const row = rowFromDoc(doc.data());
        all.push(row);
        if (state.currentUser && row.userId === state.currentUser.id && row.firstSubmittedAt) {
          state.currentUser.firstSubmittedAt = row.firstSubmittedAt;
        }
      });
    } catch (err) { console.warn("User picks fetchAll failed:", err.message || err); }
    return all;
  }

  async function fetchOwn() {
    if (!state.currentUser) return null;
    try {
      const doc = await db.collection(COLL).doc(state.currentUser.id).get();
      if (!doc.exists) return null;
      const row = rowFromDoc(doc.data());
      if (row.firstSubmittedAt) state.currentUser.firstSubmittedAt = row.firstSubmittedAt;
      return row;
    } catch (err) { console.warn("User picks fetchOwn failed:", err.message || err); return null; }
  }

  function subscribe() {
    db.collection(COLL).onSnapshot((snap) => {
      snap.docChanges().forEach((ch) => {
        const data = ch.doc.data();
        const idx = state.leaderboardUsers.findIndex(u => u.userId === data.userId);
        if (ch.type === "removed") { if (idx >= 0) state.leaderboardUsers.splice(idx, 1); }
        else { const row = rowFromDoc(data); if (idx >= 0) state.leaderboardUsers[idx] = row; else state.leaderboardUsers.push(row); }
      });
      if (state.view === "picks") renderPicks();
      else if (state.view === "leaderboard") renderLeaderboardView();
      refreshTop5Drawer();   // keep the Top-5 drawer live (no-op if closed)
    }, (err) => console.warn("User picks subscribe failed:", err.message || err));
  }

  // Admin: write another user's picks (e.g. backfilling a finished match's
  // prediction). Requires the Firestore rules to allow admin writes to userpicks.
  async function saveForUser(userId, userName, picksObj, firstSubmittedAt) {
    const totalPicks = Object.keys(picksObj).filter(id => {
      const p = picksObj[id];
      return p && p.score1 !== undefined && p.score2 !== undefined;
    }).length;
    await db.collection(COLL).doc(userId).set({
      userId,
      userName,
      picks: encodeMatchPicks(picksObj),
      firstSubmittedAt: firstSubmittedAt || new Date().toISOString(),
      totalPicks,
      updatedAt: _fbServerTime(),
    }, { merge: true });
  }

  return { available: true, saveOwn, fetchOwn, fetchAll, subscribe, saveForUser };
})();

// Global Top-5 leaderboard drawer button (hero header) — shown on every tab when
// the backend is available. Wired here, after userPicksSync is defined.
if (els.top5Btn && userPicksSync.available) {
  els.top5Btn.hidden = false;
  els.top5Btn.addEventListener("click", openTop5Drawer);
}

// ===== Scoring engine =====
const STAGE_MULTIPLIERS = {
  group: 1.0,
  r32:   1.1,
  r16:   1.25,
  qf:    1.5,
  sf:    2.0,
  third: 2.0,
  final: 3.0,
};

// Returns { exact, outcome, diff, pkBonus, basePoints, awarded } or null when no points apply yet.
function scoreMatchPick(pick, result, m) {
  if (!pick || pick.score1 === undefined || pick.score2 === undefined) return null;
  if (!result || result.score1 === undefined || result.score2 === undefined) return null;

  const exact = pick.score1 === result.score1 && pick.score2 === result.score2;
  let basePoints = 0;
  let outcome = false;
  let diff = false;

  if (exact) {
    basePoints = 15;
  } else {
    const pickWinner = pick.score1 > pick.score2 ? 1 : pick.score2 > pick.score1 ? 2 : 0;
    const actualWinner = result.score1 > result.score2 ? 1 : result.score2 > result.score1 ? 2 : 0;
    if (pickWinner === actualWinner) { basePoints += 5; outcome = true; }
    if ((pick.score1 - pick.score2) === (result.score1 - result.score2)) { basePoints += 3; diff = true; }
  }

  // Penalty bonus: only when actual match went to PKs (KO + regulation tied + PKs entered)
  let pkBonus = 0;
  const isKO = m.stage !== "group";
  const wentToPK = isKO
    && result.score1 === result.score2
    && result.pen1 !== undefined && result.pen2 !== undefined
    && result.pen1 !== result.pen2;
  if (wentToPK) {
    const actualPkWinner = result.pen1 > result.pen2 ? 1 : 2;
    if (pick.pkWinner === actualPkWinner) pkBonus = 5;
  }

  const mul = STAGE_MULTIPLIERS[m.stage] || 1;
  const awarded = Math.round((basePoints + pkBonus) * mul);
  return { exact, outcome, diff, pkBonus, basePoints, awarded };
}

// --- Admin bonus points ---
// Stored as pseudo-entries in the results store under "bonus:<userId>" with
// the points in score1 — they ride the existing Appwrite sync (push, realtime,
// bootstrap) and the admin's write permission without any new collection.
const BONUS_KEY_PREFIX = "bonus:";

function getUserBonus(userId) {
  const r = state.results[BONUS_KEY_PREFIX + userId];
  return r ? (Number(r.score1) || 0) : 0;
}

function setUserBonus(userId, points) {
  const id = BONUS_KEY_PREFIX + userId;
  const n = Math.max(0, Math.min(99, parseInt(points, 10) || 0));
  if (n === 0) delete state.results[id];
  else state.results[id] = { score1: n };
  saveResults();
  appwriteSync.scheduleMatch(id);
}

function computeUserLeaderboardRow(user) {
  let total = 0;
  let exactCount = 0;
  let outcomeCount = 0;
  let gdCount = 0;
  let pkCount = 0;
  let lockedCount = 0;
  let correctCount = 0;
  for (const m of FIXTURES) {
    const pick = user.picks[matchId(m)];
    // Manual entry or FIFA API result — in-play scores count too, so
    // leaderboard points update live as goals go in.
    const result = getResult(m);
    const s = scoreMatchPick(pick, result, m);
    if (!s) continue;
    lockedCount++;
    total += s.awarded;
    if (s.awarded > 0) correctCount++;
    if (s.exact) exactCount++;
    if (s.outcome) outcomeCount++;
    if (s.diff) gdCount++;
    if (s.pkBonus > 0) pkCount++;
  }
  const accPct = lockedCount > 0 ? Math.round((correctCount / lockedCount) * 100) : null;
  const bonus = getUserBonus(user.userId);
  return {
    userId: user.userId,
    userName: user.userName,
    total: total + bonus,
    bonus,
    exactCount,
    outcomeCount,
    gdCount,
    pkCount,
    lockedCount,
    correctCount,
    accPct,
    firstSubmittedAt: user.firstSubmittedAt || "",
  };
}

function computeLeaderboard() {
  const rows = state.leaderboardUsers.map(computeUserLeaderboardRow);
  rows.sort((a, b) =>
    b.total - a.total
    || b.exactCount - a.exactCount
    || b.outcomeCount - a.outcomeCount
    || b.gdCount - a.gdCount
    || b.pkCount - a.pkCount
    || (b.accPct ?? -1) - (a.accPct ?? -1)
    || (a.firstSubmittedAt || "").localeCompare(b.firstSubmittedAt || "")
    || a.userName.localeCompare(b.userName)
  );
  // Assign ranks with ties
  let lastKey = null;
  let lastRank = 0;
  rows.forEach((r, i) => {
    const key = `${r.total}|${r.exactCount}|${r.outcomeCount}|${r.gdCount}|${r.pkCount}|${r.accPct}`;
    if (key !== lastKey) { lastRank = i + 1; lastKey = key; }
    r.rank = lastRank;
  });
  return rows;
}

// ===== Cache versioning =====
// Stores the data shape (counts + newest doc $updatedAt) at the time of the
// last successful sync. On the next page load we only do a full bootstrap if
// the remote version differs — otherwise we render straight from localStorage.
const CACHE_VERSION_KEY = "wc2026_cache_version";

function getCacheVersion() {
  try { return JSON.parse(localStorage.getItem(CACHE_VERSION_KEY)) || null; }
  catch { return null; }
}
function setCacheVersion(v) {
  if (!v) return;
  localStorage.setItem(CACHE_VERSION_KEY, JSON.stringify(v));
}
function isCacheStale(local, remote) {
  if (!local) return true;
  if (local.resultsTotal !== remote.resultsTotal) return true;
  if (local.overridesTotal !== remote.overridesTotal) return true;
  if ((remote.latestResultUpdate || "") > (local.latestResultUpdate || "")) return true;
  if ((remote.latestStandingsUpdate || "") > (local.latestStandingsUpdate || "")) return true;
  return false;
}
function bumpCacheVersionFromEvent(collectionType, doc) {
  const v = getCacheVersion() || {
    resultsTotal: 0, overridesTotal: 0,
    latestResultUpdate: "", latestStandingsUpdate: "",
  };
  if (collectionType === "results") {
    if (doc.$updatedAt > (v.latestResultUpdate || "")) v.latestResultUpdate = doc.$updatedAt;
  } else {
    if (doc.$updatedAt > (v.latestStandingsUpdate || "")) v.latestStandingsUpdate = doc.$updatedAt;
  }
  // Recompute totals from current local state (which already reflects the event)
  v.resultsTotal = Object.keys(state.results).length;
  v.overridesTotal = Object.keys(state.standingsOverride).length;
  setCacheVersion(v);
}

// --- Init ---
applyAdminClass();
updateUserBtn();
populateTeams();
populateTimezones();
populateDates();
const VALID_VIEWS = ["schedule", "groups", "standings", "bracket", "scorers", "predict", "picks"];
const savedView = localStorage.getItem("wc26_lastView");
if (savedView && VALID_VIEWS.includes(savedView) && savedView !== "schedule") {
  switchView(savedView);
} else {
  render();
}
updateProgressBar();

// Mobile sidebar navigation
(function () {
  const sidebar = document.getElementById("mobileSidebar");
  const overlay = document.getElementById("sidebarOverlay");
  const menuBtn = document.getElementById("menuBtn");
  const closeBtn = document.getElementById("sidebarCloseBtn");
  if (!sidebar || !overlay || !menuBtn) return;

  function openSidebar() {
    sidebar.classList.add("open");
    overlay.classList.add("open");
    menuBtn.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
  }

  function closeSidebar() {
    sidebar.classList.remove("open");
    overlay.classList.remove("open");
    menuBtn.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  }

  menuBtn.addEventListener("click", openSidebar);
  if (closeBtn) closeBtn.addEventListener("click", closeSidebar);
  overlay.addEventListener("click", closeSidebar);

  // Close on Escape key
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && sidebar.classList.contains("open")) closeSidebar();
  });

  // Close sidebar when a tab is picked (delegated to sidebar)
  sidebar.addEventListener("click", e => {
    const tab = e.target.closest(".tab[data-view]");
    if (tab) closeSidebar();
  });
})();

// Restore Appwrite auth session (if any) + hydrate own picks only.
// Full leaderboard (fetchAll) is deferred until the user opens the leaderboard.
if (appwriteAuth.available) {
  appwriteAuth.getCurrent().then(async user => {
    if (user) {
      state.currentUser = user;
      setAdmin(isUserAdmin(user));
      updateUserBtn();
      // 1 read instead of 100+ — only fetch the logged-in user's own doc
      const own = await userPicksSync.fetchOwn();
      if (own) {
        state.leaderboardUsers = [own];  // seed leaderboard with just self for scoring
        state.matchPicks = own.picks;
        saveMatchPicks();
      }
    }
    rerenderActive();
  }).catch(err => console.warn("Auth bootstrap failed:", err.message || err));
}

// Shared prediction link handler: someone opened the site with #pred=… in the URL.
// View-only mode — load into state.sharedPrediction so the user's own picks stay safe.
// The recipient can explicitly tap "Save as mine" to commit, or "Back to mine" to discard.
(function handleSharedPrediction() {
  const hash = window.location.hash || "";
  const match = hash.match(/^#pred=(.+)$/);
  if (!match) return;
  const encoded = decodeURIComponent(match[1]);
  const decoded = decodePrediction(encoded);
  if (!decoded) return;

  // Clear the hash so a refresh doesn't re-trigger the load
  history.replaceState(null, "", `${location.pathname}${location.search}`);

  state.sharedPrediction = decoded;
  switchView("predict");
})();

// Tick every 1s to refresh countdowns and toggle LIVE state in place
// without rebuilding the entire DOM (which would lose input focus).
const LIVE_WINDOW_MAX_MS = LIVE_DURATION_KO_MS; // longest possible live window
function tickCountdowns() {
  const now = Date.now();
  const cards = document.querySelectorAll(".match-card[data-kickoff]");
  cards.forEach(card => {
    const kickoff = +card.dataset.kickoff;
    if (!kickoff) return;
    const diff = kickoff - now;
    // Skip cards that are already ended (well past live window) — nothing to update
    if (diff < -LIVE_WINDOW_MAX_MS) return;
    // Skip cards > 24h away on sub-minute ticks — their text won't change
    if (diff > 24 * 60 * 60 * 1000 && _tickN % 60 !== 0) return;
    const stage = card.dataset.stage || "group";
    const mid = card.querySelector("[data-mid]")?.dataset.mid;
    const cdFinal = applyLiveChip(mid, formatCountdownDirect(kickoff, stage, now));
    card.classList.toggle("is-live", cdFinal.state === "live");
    if (cdFinal.state === "ended") {
      const t = card.querySelector(".match-time");
      if (t && !t.querySelector(".match-time-ft")) {
        const localTime = t.textContent.trim();
        t.innerHTML = `<span class="match-time-ft">FT</span> <span class="match-time-scheduled">${localTime}</span>`;
      }
    }
    const chip = card.querySelector(".match-countdown");
    if (!chip) {
      if (cdFinal.state !== "ended") {
        const meta = card.querySelector(".match-meta");
        if (meta) {
          const newChip = document.createElement("span");
          newChip.className = `match-countdown ${cdFinal.state}`;
          newChip.textContent = cdFinal.text;
          meta.appendChild(newChip);
        }
      }
      return;
    }
    if (cdFinal.state === "ended") {
      chip.remove();
      return;
    }
    chip.textContent = cdFinal.text;
    chip.className = `match-countdown ${cdFinal.state}`;
  });
  // Re-render Predict/Picks every 30s so newly-kicked-off matches lock inputs
  _tickN++;
  if (_tickN % 30 === 0) {
    if (state.view === "predict") renderPredict();
    if (state.view === "picks") renderPicks();
  }
}

// Same shape as formatCountdown but called with already-known kickoff ms + stage —
// avoids the fixtureToUTC round-trip for the per-tick path.
function formatCountdownDirect(kickoffMs, stage, nowMs) {
  const liveWindow = (stage && stage !== "group") ? LIVE_DURATION_KO_MS : LIVE_DURATION_GROUP_MS;
  const diff = kickoffMs - nowMs;
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
let _tickN = 0;
setInterval(tickCountdowns, 1000);

// Bootstrap from Appwrite (preferred) or fall back to results.json.
// Smart strategy: do a lightweight version check first (2 tiny queries).
// If the cached snapshot matches what's on Appwrite, skip the full bootstrap
// entirely — saves ~100 doc reads per page load on the free tier.
if (appwriteSync.available) {
  // A single realtime subscription is the loader: its first onSnapshot fills
  // results + standings from Firestore (served from the offline cache on repeat
  // loads, so ~no reads), keeps them live, and seeds the server if it's empty.
  // No separate bootstrap/version-check — that was redundant double-reading.
  appwriteSync.subscribe();
} else {
  loadLatestFromServer().then(payload => {
    if (payload && !payload.__error && Object.keys(payload.results).length > 0) {
      applyServerData(payload);
      rerenderActive();
    }
  });
}

// ===== Live scores (unofficial FIFA API overlay — see live-scores.js) =====

// ── Match Stats modal (data fetched on demand via liveScores.getStats) ──

const CARD_ICONS = { yellow: "🟨", red: "🟥", yellowred: "🟨🟥" };

// [label, FIFA stat key, format] — "passPct" is derived, not a raw key
const STAT_ROWS = [
  ["Possession", "Possession", "pct"],
  ["Expected goals (xG)", "XG", "xg"],
  ["Shots", "AttemptAtGoal", "int"],
  ["Shots on target", "AttemptAtGoalOnTarget", "int"],
  ["Passes", "Passes", "int"],
  ["Pass accuracy", null, "passPct"],
  ["Corners", "Corners", "int"],
  ["Fouls committed", "FoulsAgainst", "int"],
  ["Offsides", "Offsides", "int"],
  ["Yellow cards", "YellowCards", "int"],
  ["Red cards", "RedCards", "int"],
  ["Saves", "GoalkeeperSaves", "int"],
];

function statValue(stats, key, kind) {
  if (kind === "passPct") {
    const p = stats.Passes, c = stats.PassesCompleted;
    return (p > 0 && c !== undefined) ? Math.round((c / p) * 100) + "%" : "–";
  }
  const v = stats[key];
  if (v === undefined || v === null) return "–";
  if (kind === "pct") return Math.round(v * 100) + "%";
  if (kind === "xg") return v.toFixed(2);
  return String(Math.round(v));
}

function statRaw(stats, key, kind) {
  if (kind === "passPct") {
    const p = stats.Passes, c = stats.PassesCompleted;
    return (p > 0 && c !== undefined) ? c / p : null;
  }
  if (!key) return null;
  const v = stats[key];
  return (v !== undefined && v !== null) ? Number(v) : null;
}

function showMatchStats(m, t1, t2) {
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-dialog stats-modal" role="dialog" aria-modal="true" aria-labelledby="statsTitle">
      <div class="modal-icon modal-icon-info">📊</div>
      <h2 id="statsTitle">Match Stats</h2>
      <div class="stats-teams">
        <span class="stats-team">${flagFor(t1)}<span class="stats-team-name">${escapeHTML(t1)}</span></span>
        <span class="stats-vs">vs</span>
        <span class="stats-team right">${flagFor(t2)}<span class="stats-team-name">${escapeHTML(t2)}</span></span>
      </div>
      <div class="stats-body"><p class="stats-msg">Loading stats…</p></div>
      <div class="modal-actions">
        <button class="modal-btn modal-btn-primary" type="button">Close</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.body.classList.add("modal-open");

  const close = () => {
    modal.classList.add("modal-closing");
    modal.addEventListener("animationend", () => {
      modal.remove();
      if (!document.querySelector(".modal")) document.body.classList.remove("modal-open");
    }, { once: true });
  };
  modal.querySelector(".modal-backdrop").addEventListener("click", close);
  modal.querySelector(".modal-btn").addEventListener("click", close);
  modal.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

  const body = modal.querySelector(".stats-body");
  liveScores.getStats(matchId(m))
    .catch(() => null)
    .then((stats) => {
      if (!modal.isConnected) return; // closed while loading
      if (!stats) {
        body.innerHTML = `<p class="stats-msg">Stats are not available for this match.</p>`;
        return;
      }
      // Possession split bar on top, then the comparison rows
      let bar = "";
      const p1 = stats.s1.Possession, p2 = stats.s2.Possession;
      if (p1 >= 0 && p2 >= 0 && p1 + p2 > 0) {
        const w = Math.round((p1 / (p1 + p2)) * 100);
        bar = `<div class="stat-bar"><span style="width:${w}%"></span></div>`;
      }
      const rows = STAT_ROWS.map(([label, key, kind]) => {
        const r1 = statRaw(stats.s1, key, kind);
        const r2 = statRaw(stats.s2, key, kind);
        let miniBar = "";
        if (r1 !== null && r2 !== null && r1 + r2 > 0) {
          const pct = Math.round((r1 / (r1 + r2)) * 100);
          miniBar = `<div class="stat-split-bar"><div class="stat-split-left" style="width:${pct}%"></div></div>`;
        }
        return `<div class="stat-row">
          <span class="stat-v">${statValue(stats.s1, key, kind)}</span>
          <div class="stat-center">${miniBar}<span class="stat-label">${label}</span></div>
          <span class="stat-v">${statValue(stats.s2, key, kind)}</span>
        </div>`;
      }).join("");
      // Who got booked (from the timeline cards, when we have them) — split
      // into columns under each team's side, same orientation as the header
      const cards = getCards(m);
      const bookingCol = (sideKey) => cards
        .filter(c => c.team === sideKey)
        .map(c => `<span class="booking">${CARD_ICONS[c.card] || "🟥"} ${escapeHTML(c.name)}${c.minute ? ` ${escapeHTML(c.minute)}'` : ""}</span>`)
        .join("");
      const bookings = cards.length
        ? `<div class="stats-bookings">
            <div class="booking-col">${bookingCol(1)}</div>
            <div class="booking-col right">${bookingCol(2)}</div>
          </div>`
        : "";
      body.innerHTML = bar + rows + bookings;
    });
}

// ── Team info + squad modal (data fetched on demand via liveScores) ──

const SQUAD_GROUPS = [[0, "Goalkeepers"], [1, "Defenders"], [2, "Midfielders"], [3, "Forwards"]];

// FIFA digitalhub photos are multi-MB at full size; request a square thumbnail
// transform (drops a 1.1MB png to a few KB). Other hosts are used as-is.
function playerPhotoUrl(photo, size) {
  if (!photo) return null;
  if (!photo.includes("digitalhub.fifa.com")) return photo;
  const sep = photo.includes("?") ? "&" : "?";
  return `${photo}${sep}io=transform:fill,width:${size},height:${size}`;
}

// Full uncropped portrait for the lightbox — scaled to 720 tall (~60KB vs the
// ~1.1MB original) rather than cropped to a square like the thumbnails.
function playerPhotoFull(photo) {
  if (!photo) return null;
  if (!photo.includes("digitalhub.fifa.com")) return photo;
  const sep = photo.includes("?") ? "&" : "?";
  return `${photo}${sep}io=transform:fit,height:720`;
}

function openImageLightbox(url, caption) {
  if (!url) return;
  const box = document.createElement("div");
  box.className = "img-lightbox";
  box.innerHTML = `
    <button class="img-lightbox-close" type="button" aria-label="Close">✕</button>
    <figure class="img-lightbox-fig">
      <img src="${encodeURI(url)}" alt="${caption ? escapeHTML(caption) : ""}">
      ${caption ? `<figcaption>${escapeHTML(caption)}</figcaption>` : ""}
    </figure>`;
  document.body.appendChild(box);
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  const close = () => { box.remove(); document.removeEventListener("keydown", onKey, true); };
  // Click anywhere except the image/caption closes; Esc closes (capture so it
  // doesn't also bubble up and close the team modal underneath).
  box.addEventListener("click", (e) => {
    if (e.target.tagName === "IMG" || e.target.tagName === "FIGCAPTION") return;
    close();
  });
  document.addEventListener("keydown", onKey, true);
  requestAnimationFrame(() => box.classList.add("is-open"));
}

function playerAvatarHTML(p, size, cls) {
  const url = playerPhotoUrl(p.photo, size);
  const img = url
    ? `<img src="${encodeURI(url)}" alt="" loading="lazy" onerror="this.style.display='none'">`
    : "";
  return `<span class="${cls}">${img}</span>`;
}

function playerAge(iso) {
  if (!iso) return null;
  const b = new Date(iso);
  if (isNaN(b.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  const mm = now.getMonth() - b.getMonth();
  if (mm < 0 || (mm === 0 && now.getDate() < b.getDate())) a--;
  return (a > 10 && a < 60) ? a : null;
}

function renderPlayerDetail(p) {
  const items = [];
  if (p.position) items.push(["Position", p.position]);
  if (p.num !== null && p.num !== undefined) items.push(["Shirt", "#" + p.num]);
  const age = playerAge(p.dob);
  if (age) items.push(["Age", age]);
  if (p.height) items.push(["Height", p.height + " cm"]);
  if (p.weight) items.push(["Weight", p.weight + " kg"]);
  // Tournament tallies — shown only once the feed populates them.
  if (p.matches) items.push(["Matches", p.matches]);
  if (p.goals) items.push(["Goals", p.goals]);
  if (p.yellow) items.push(["Yellow", p.yellow]);
  if (p.red) items.push(["Red", p.red]);
  const grid = items.map(([k, v]) =>
    `<div class="pd-item"><span class="pd-k">${k}</span><span class="pd-v">${escapeHTML(String(v))}</span></div>`
  ).join("");
  const photoUrl = playerPhotoUrl(p.photo, 160);
  const photo = photoUrl
    ? `<img class="pd-photo" src="${encodeURI(photoUrl)}" alt="" loading="lazy" onerror="this.remove()"
         data-full="${encodeURI(playerPhotoFull(p.photo))}" data-name="${escapeHTML(p.name)}" title="View full image">`
    : "";
  return `<div class="player-detail-inner">${photo}<div class="pd-grid">${grid}</div></div>`;
}

function renderTeamForm(form) {
  if (!form || !form.length) return "";
  // Newest first. Pills give a quick W/D/L glance; the list adds context.
  const pills = form.map(f =>
    `<span class="form-pill form-${f.result}" title="${f.date} ${f.home ? "vs" : "@"} ${escapeHTML(f.opponent)} ${f.gf}-${f.ga}">${f.result}</span>`
  ).join("");
  const rows = form.map(f => `
    <div class="form-match">
      <span class="form-badge form-${f.result}">${f.result}</span>
      <span class="form-opp">${f.home ? "vs " : "@ "}<span class="form-opp-flag">${flagFor(f.opponent)}</span>${escapeHTML(f.opponent)}</span>
      <span class="form-score">${f.gf}–${f.ga}</span>
      <span class="form-comp">${escapeHTML(f.competition)}</span>
    </div>`).join("");
  return `
    <div class="team-form">
      <div class="team-form-head">
        <span class="form-label">Recent form <small>(latest first)</small></span>
        <span class="form-pills">${pills}</span>
      </div>
      <div class="form-list">${rows}</div>
    </div>`;
}

function renderSquadList(squad) {
  const used = new Set();
  let html = "";
  const groupHTML = (label, players) => {
    if (!players.length) return "";
    const rows = players.map((p) => {
      const idx = squad.indexOf(p);
      const goalChip = p.goals ? `<span class="squad-stat">⚽ ${p.goals}</span>` : "";
      return `
        <div class="squad-player" data-idx="${idx}">
          <div class="squad-player-row">
            <span class="squad-num">${p.num ?? ""}</span>
            ${playerAvatarHTML(p, 96, "squad-avatar")}
            <span class="squad-name">${escapeHTML(p.name)}</span>
            ${goalChip}
            <span class="squad-chevron" aria-hidden="true">▾</span>
          </div>
          <div class="player-detail"></div>
        </div>`;
    }).join("");
    return `<div class="squad-group"><h4 class="squad-group-title">${label}</h4>${rows}</div>`;
  };
  for (const [code, label] of SQUAD_GROUPS) {
    const players = squad.filter(p => p.posCode === code);
    players.forEach(p => used.add(p));
    html += groupHTML(label, players);
  }
  const rest = squad.filter(p => !used.has(p));
  html += groupHTML("Other", rest);
  return html;
}

function openTeamModal(teamName) {
  if (typeof liveScores === "undefined" || !liveScores.getSquadByName) return;
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-dialog team-modal" role="dialog" aria-modal="true" aria-labelledby="teamModalTitle">
      <div class="team-modal-header">
        <span class="team-modal-flag">${flagFor(teamName)}</span>
        <div>
          <h2 id="teamModalTitle">${escapeHTML(teamName)}</h2>
          <div class="team-modal-sub"></div>
        </div>
      </div>
      <div class="team-modal-body"><p class="stats-msg">Loading team &amp; squad…</p></div>
      <div class="modal-actions">
        <button class="modal-btn modal-btn-primary" type="button">Close</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.body.classList.add("modal-open");

  const close = () => {
    modal.classList.add("modal-closing");
    modal.addEventListener("animationend", () => {
      modal.remove();
      if (!document.querySelector(".modal")) document.body.classList.remove("modal-open");
    }, { once: true });
  };
  modal.querySelector(".modal-backdrop").addEventListener("click", close);
  modal.querySelector(".modal-btn").addEventListener("click", close);
  modal.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

  const sub = modal.querySelector(".team-modal-sub");
  const body = modal.querySelector(".team-modal-body");

  Promise.all([
    liveScores.getTeamInfoByName(teamName).catch(() => null),
    liveScores.getSquadByName(teamName).catch(() => null),
    liveScores.getTeamFormByName ? liveScores.getTeamFormByName(teamName).catch(() => null) : Promise.resolve(null),
  ]).then(([info, squad, form]) => {
    if (!modal.isConnected) return; // closed while loading
    if (info) {
      const bits = [];
      if (info.confederation) bits.push(escapeHTML(info.confederation));
      if (info.founded) bits.push("Est. " + info.founded);
      if (info.city) bits.push(escapeHTML(info.city));
      sub.innerHTML = bits.join(" · ");
    }
    const formHTML = renderTeamForm(form);
    if (!squad || squad.length === 0) {
      body.innerHTML = formHTML + `<p class="stats-msg">Squad list isn't available for this team yet.</p>`;
      return;
    }
    body.innerHTML = formHTML + `<p class="squad-hint">${squad.length} players · tap a name for details</p>` + renderSquadList(squad);
    body.querySelectorAll(".squad-player").forEach((el) => {
      el.querySelector(".squad-player-row").addEventListener("click", () => {
        const open = el.classList.toggle("is-open");
        const detail = el.querySelector(".player-detail");
        if (open && detail && !detail.dataset.filled) {
          detail.innerHTML = renderPlayerDetail(squad[+el.dataset.idx]);
          detail.dataset.filled = "1";
        }
      });
    });
    // Tapping a player's detail photo opens a full-image lightbox.
    body.addEventListener("click", (e) => {
      const ph = e.target.closest(".pd-photo");
      if (ph && ph.dataset.full) openImageLightbox(ph.dataset.full, ph.dataset.name);
    });
  });
}

// Admin housekeeping: once a match is FINISHED, persist the FIFA API result
// into the regular store (local + Appwrite). Appwrite then keeps serving the
// result to every visitor even if the unofficial API breaks later.
// Existing entries are never overwritten — admin corrections always win —
// except to fill a missing scorers list when both agree on the score.
function archiveFinishedApiResults() {
  if (!state.isAdmin || typeof liveScores === "undefined") return 0;
  let archived = 0;
  for (const m of FIXTURES) {
    const id = matchId(m);
    const live = liveScores.get(id);
    if (!live || live.isLive) continue;     // no API data, or not finished yet
    const existing = state.results[id];
    if (existing) {
      if (Number(existing.score1) === Number(live.score1) &&
          Number(existing.score2) === Number(live.score2)) {
        const fill = {};
        if ((!Array.isArray(existing.scorers) || existing.scorers.length === 0) &&
            Array.isArray(live.scorers) && live.scorers.length > 0) fill.scorers = live.scorers;
        if ((!Array.isArray(existing.cards) || existing.cards.length === 0) &&
            Array.isArray(live.cards) && live.cards.length > 0) fill.cards = live.cards;
        if (Object.keys(fill).length) {
          state.results[id] = { ...existing, ...fill };
          appwriteSync.scheduleMatch(id);
          archived++;
        }
      }
      continue;
    }
    const rec = { score1: live.score1, score2: live.score2 };
    if (live.pen1 !== undefined) { rec.pen1 = live.pen1; rec.pen2 = live.pen2; }
    if (Array.isArray(live.scorers) && live.scorers.length) rec.scorers = live.scorers;
    if (Array.isArray(live.cards) && live.cards.length) rec.cards = live.cards;
    state.results[id] = rec;
    appwriteSync.scheduleMatch(id);
    archived++;
  }
  if (archived) {
    saveResults();
  }
  return archived;
}

if (typeof liveScores !== "undefined") {
  let lastLiveKo = "";        // serialized KO assignments at last schedule poll
  let lastLiveBracketKo = ""; // serialized KO assignments at last bracket poll
  liveScores.start((changedIds) => {
    const archived = archiveFinishedApiResults();
    if (!changedIds.length && !archived) return;
    updateProgressBar();
    // Results changed → leaderboard standings may shift; keep the Top-5 drawer live.
    refreshTop5Drawer();
    // Don't rebuild the DOM under the admin's cursor mid-entry
    const ae = document.activeElement;
    if (ae && ae.closest && ae.closest(".pb-result, .scorer-form")) return;
    // Groups view is static (team names only) — live scores never affect it
    if (state.view === "groups") return;
    // Standings: patch only the tables for groups with changed matches.
    // Full re-render only when a match finishes (archived) since that can
    // shift third-place qualification and reorder multiple groups at once.
    if (state.view === "standings") {
      if (archived) { renderStandings(); return; }
      const changedGroups = new Set(
        changedIds.flatMap(id => {
          const m = FIXTURES.find(fx => matchId(fx) === id);
          return m && m.group ? [m.group] : [];
        })
      );
      if (changedGroups.size) patchStandingsTables(changedGroups);
      return;
    }
    // Bracket: only re-render when the projected KO assignments actually changed.
    // A live score update that doesn't shift any group position is skipped.
    if (state.view === "bracket") {
      const ko = buildCurrentBracketKo();
      const koJSON = JSON.stringify(ko);
      if (koJSON !== lastLiveBracketKo) {
        lastLiveBracketKo = koJSON;
        renderBracket(ko);
      }
      return;
    }
    // Scorers: reads state.results only — live goals aren't stored there until
    // archiveFinishedApiResults() runs, so only update when a match finishes.
    if (state.view === "scorers") {
      if (archived) renderTopScorers();
      return;
    }
    // Predict / Picks: input locking is driven by tickCountdowns (every 30s).
    // A live score change has nothing to update in either view.
    if (state.view === "predict" || state.view === "picks") return;
    if (state.view !== "schedule") { rerenderActive(); return; }
    // Schedule view: replace only the changed match cards — unless knockout
    // assignments shifted, which can rename teams in unrelated cards.
    const ko = buildCurrentBracketKo();
    const koJSON = JSON.stringify(ko);
    if (koJSON !== lastLiveKo) {
      lastLiveKo = koJSON;
      rerenderActive();
      return;
    }
    for (const id of changedIds) {
      const row = document.querySelector(`.pb-result[data-mid="${CSS.escape(id)}"]`);
      const card = row && row.closest(".match-card");
      if (!card) continue; // not rendered under the current filters
      const m = FIXTURES.find((fx) => matchId(fx) === id);
      if (m) card.replaceWith(renderMatchCard(m, state.selectedTeam, ko));
    }
  });
}

// ===== Service worker (offline + installable PWA) =====
// Only register on http(s), not file:// — and skip silently if unsupported.
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js")
      .then((reg) => {
        // Show "Update available" toast as soon as the new SW finishes installing.
        // Only activate it (SKIP_WAITING) when the user clicks Refresh — avoids
        // disrupting the page mid-session.
        const showUpdateToast = (waitingSW) => {
          if (document.querySelector(".update-toast")) return;
          const t = document.createElement("div");
          t.className = "update-toast";
          t.innerHTML = `<span>✨ New version available</span><button type="button">Refresh</button>`;
          t.querySelector("button").addEventListener("click", () => {
            waitingSW.postMessage("SKIP_WAITING");
            window.location.reload();
          });
          document.body.appendChild(t);
        };

        // New SW found while page is open
        reg.addEventListener("updatefound", () => {
          const newSW = reg.installing;
          if (!newSW) return;
          newSW.addEventListener("statechange", () => {
            if (newSW.state === "installed" && navigator.serviceWorker.controller) {
              showUpdateToast(newSW);
            }
          });
        });

        // SW was already waiting when the page loaded (e.g. tab was open during deploy)
        if (reg.waiting && navigator.serviceWorker.controller) {
          showUpdateToast(reg.waiting);
        }
      })
      .catch((err) => console.warn("Service worker registration failed:", err));
  });
}
