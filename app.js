// World Cup 2026 fixture viewer

const els = {
  teamSelect: document.getElementById("teamSelect"),
  dateSelect: document.getElementById("dateSelect"),
  tzSelect: document.getElementById("tzSelect"),
  clearBtn: document.getElementById("clearBtn"),
  adminBtn: document.getElementById("adminBtn"),
  scheduleView: document.getElementById("scheduleView"),
  groupsView: document.getElementById("groupsView"),
  standingsView: document.getElementById("standingsView"),
  bracketView: document.getElementById("bracketView"),
  scorersView: document.getElementById("scorersView"),
  predictView: document.getElementById("predictView"),
  summary: document.getElementById("summary"),
  tabs: document.querySelectorAll(".tab"),
};

const RESULTS_KEY = "wc2026_results";
const ADMIN_KEY = "wc2026_admin";
const OVERRIDE_KEY = "wc2026_standings_override";
const PREDICTION_KEY = "wc2026_prediction";

// ─────────────────────────────────────────────────────────────
// CHANGE THIS PASSWORD before deploying. Only people who know
// it can edit results; everyone else sees read-only data.
// Note: this is a soft lock (client-side), not real security.
// ─────────────────────────────────────────────────────────────
const ADMIN_PASSWORD = "@466726";

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
  isAdmin: localStorage.getItem(ADMIN_KEY) === "1",
};

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
  if (state.isAdmin) localStorage.setItem(ADMIN_KEY, "1");
  else localStorage.removeItem(ADMIN_KEY);
  applyAdminClass();
}

function applyAdminClass() {
  document.body.classList.toggle("is-admin", state.isAdmin);
  document.body.classList.toggle("is-viewer", !state.isAdmin);
}

function openLoginModal() {
  // Remove any existing modal first
  const existing = document.getElementById("loginModal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "loginModal";
  modal.className = "modal";
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="loginTitle">
      <div class="modal-icon">🔒</div>
      <h2 id="loginTitle">Admin Login</h2>
      <p class="modal-subtitle">Enter your password to enable result editing.</p>
      <input type="password" id="loginPassword" class="modal-input"
             placeholder="Password" autocomplete="current-password" spellcheck="false">
      <p class="modal-error" id="loginError" aria-live="polite"></p>
      <div class="modal-actions">
        <button id="loginCancel" class="modal-btn modal-btn-ghost" type="button">Cancel</button>
        <button id="loginSubmit" class="modal-btn modal-btn-primary" type="button">Unlock</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.body.classList.add("modal-open");

  const input = modal.querySelector("#loginPassword");
  const err = modal.querySelector("#loginError");

  const close = () => {
    modal.classList.add("modal-closing");
    modal.addEventListener("animationend", () => {
      modal.remove();
      document.body.classList.remove("modal-open");
    }, { once: true });
  };

  const submit = () => {
    const pw = input.value;
    if (pw === ADMIN_PASSWORD) {
      setAdmin(true);
      updateAdminBtn();
      rerenderActive();
      close();
    } else {
      err.textContent = "Wrong password. Try again.";
      input.classList.add("modal-input-error");
      input.focus();
      input.select();
      setTimeout(() => input.classList.remove("modal-input-error"), 400);
    }
  };

  modal.querySelector("#loginCancel").addEventListener("click", close);
  modal.querySelector(".modal-backdrop").addEventListener("click", close);
  modal.querySelector("#loginSubmit").addEventListener("click", submit);
  modal.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
    if (e.key === "Enter" && document.activeElement === input) submit();
  });

  // Focus the password field after the modal animates in
  setTimeout(() => input.focus(), 60);
}

async function logout() {
  const ok = await showConfirm("Switch to viewer mode? Editing will be locked.", {
    title: "Logout",
    icon: "🔒",
    iconType: "info",
    confirmLabel: "Logout",
  });
  if (!ok) return;
  setAdmin(false);
  updateAdminBtn();
  rerenderActive();
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
function loadResults() {
  try {
    return JSON.parse(localStorage.getItem(RESULTS_KEY)) || {};
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
}

function matchId(m) {
  return `${m.date}_${m.team1}_${m.team2}`;
}

function getResult(m) {
  return state.results[matchId(m)];
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
function fixtureToUTC(m) {
  const [hh, mm] = m.time.split(" ")[0].split(":").map(Number);
  const [y, mo, d] = m.date.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, hh + 4, mm));
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

// --- Renderers ---
function renderMatchCard(m, highlightTeam, ko) {
  const stageLabel = STAGE_LABELS[m.stage] + (m.group ? ` · Group ${m.group}` : "");

  const card = document.createElement("article");
  card.className = "match-card";

  const { team1: resolved1, team2: resolved2 } = resolveMatchTeams(m, ko);
  const displayTeam1 = resolved1 || m.team1;
  const displayTeam2 = resolved2 || m.team2;
  const teamsKnown = resolved1 && resolved2;

  const localTime = formatTimeInTz(fixtureToUTC(m), state.selectedTz);
  const stageBadge = `<span class="stage-badge ${m.stage}">${stageLabel}</span>`;
  const meta = `<div class="match-meta">${stageBadge}<span>${localTime}</span></div>`;

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
  const penDisabled = (tied && state.isAdmin) ? "" : "disabled";
  const penInputs = isKnockout
    ? `<span class="pen-block ${tied ? "" : "is-disabled"}">PK
        <input type="number" min="0" max="99" class="score-input pen-input pen1" value="${p1}" placeholder="–" aria-label="${displayTeam1} penalty score" ${penDisabled}>
        <span class="score-sep">:</span>
        <input type="number" min="0" max="99" class="score-input pen-input pen2" value="${p2}" placeholder="–" aria-label="${displayTeam2} penalty score" ${penDisabled}>
       </span>`
    : "";

  const winnerLabel = resultLabel(m, r, displayTeam1, displayTeam2);
  const lockedAttr = state.isAdmin ? "" : "disabled";
  const resultHTML = `
    <div class="result-row" data-mid="${matchId(m)}">
      <input type="number" min="0" max="99" class="score-input score1" value="${s1}" placeholder="–" aria-label="${displayTeam1} score" ${lockedAttr}>
      <span class="score-sep">:</span>
      <input type="number" min="0" max="99" class="score-input score2" value="${s2}" placeholder="–" aria-label="${displayTeam2} score" ${lockedAttr}>
      ${penInputs}
      <span class="result-label">${winnerLabel}</span>
    </div>`;

  const scorersHTML = `<div class="scorers-row" data-mid="${matchId(m)}"></div>`;

  const footer = `<div class="match-footer"><span class="venue">${venueWithCountry(m.venue)}</span></div>`;

  card.innerHTML = meta + teamsHTML + resultHTML + scorersHTML + footer;

  wireScoreInputs(card, m, displayTeam1, displayTeam2, teamsKnown);
  renderScorersBlock(card, m, displayTeam1, displayTeam2, teamsKnown);
  return card;
}

// --- Scorers ---
function getScorers(m) {
  const r = state.results[matchId(m)];
  return (r && Array.isArray(r.scorers)) ? r.scorers : [];
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
  const admin = state.isAdmin;

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
  const row = active && active.closest && active.closest(".result-row");
  const mid = row ? row.dataset.mid : null;
  const cls = ["score1", "score2", "pen1", "pen2"].find(c => active && active.classList && active.classList.contains(c));

  fn();

  if (mid && cls) {
    const sel = `.result-row[data-mid="${CSS.escape(mid)}"] .${cls}`;
    const el = document.querySelector(sel);
    if (el) el.focus();
  }
  window.scrollTo(0, scrollY);
}

function wireScoreInputs(card, m, t1, t2, teamsKnown) {
  const row = card.querySelector(".result-row");
  const s1 = row.querySelector(".score1");
  const s2 = row.querySelector(".score2");
  const p1 = row.querySelector(".pen1");
  const p2 = row.querySelector(".pen2");
  const penBlock = row.querySelector(".pen-block");
  const label = row.querySelector(".result-label");
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

function renderSchedule(filterTeam, filterDate) {
  els.scheduleView.innerHTML = "";
  const tz = state.selectedTz;
  const ko = getKnockoutAssignments();

  if (ko.complete) {
    // Check if the Final is decided
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

  // Bucket by date-key in selected timezone
  const byDate = new Map();
  for (const m of FIXTURES) {
    if (!matchInvolves(m, filterTeam, ko)) continue;
    const key = dateKeyInTz(fixtureToUTC(m), tz);
    if (filterDate && key !== filterDate) continue;
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(m);
  }

  if (byDate.size === 0) {
    els.scheduleView.innerHTML = `<div class="empty">No matches found for the selected filters.</div>`;
    return;
  }

  const sortedDates = [...byDate.keys()].sort();

  for (const key of sortedDates) {
    const dayMatches = byDate.get(key);
    // Sort matches within a day chronologically (AM → PM in selected tz).
    // Comparing UTC ms is equivalent to comparing local time when both
    // matches fall on the same local calendar day, which they do here.
    dayMatches.sort((a, b) => fixtureToUTC(a).getTime() - fixtureToUTC(b).getTime());

    const dayGroup = document.createElement("div");
    dayGroup.className = "day-group";

    const header = document.createElement("div");
    header.className = "day-header";
    const count = dayMatches.length;
    header.innerHTML = `
      <span class="day-date">${formatLocalDateLabel(key)}</span>
      <span class="day-count">${count} ${count === 1 ? "match" : "matches"}</span>
    `;
    dayGroup.appendChild(header);

    const list = document.createElement("div");
    list.className = "match-list";
    for (const m of dayMatches) {
      list.appendChild(renderMatchCard(m, filterTeam, ko));
    }
    dayGroup.appendChild(list);

    els.scheduleView.appendChild(dayGroup);
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

function getKnockoutAssignments() {
  const complete = isGroupStageComplete();
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
  const top8 = thirds.slice(0, 8);

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
        const winMatch = m.team1.match(/^Winner ([A-L])$/);
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

  return { complete, winners, runnersUp, top8, thirdsAssignments };
}

function resolveTeamName(placeholder, m, pos, ko) {
  if (!ko || !ko.complete) return null;
  let match;
  if ((match = placeholder.match(/^Winner ([A-L])$/))) return ko.winners[match[1]] || null;
  if ((match = placeholder.match(/^Runner-up ([A-L])$/))) return ko.runnersUp[match[1]] || null;
  if (placeholder.startsWith("3rd ")) {
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

function computeStandings(groupLetter) {
  const teams = GROUPS[groupLetter];
  const stats = {};
  teams.forEach(t => {
    stats[t] = { team: t, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, gd: 0, points: 0 };
  });

  for (const m of FIXTURES) {
    if (m.stage !== "group" || m.group !== groupLetter) continue;
    const r = getResult(m);
    if (!r || r.score1 === undefined || r.score2 === undefined) continue;
    const a = stats[m.team1], b = stats[m.team2];
    if (!a || !b) continue;
    a.played++; b.played++;
    a.gf += r.score1; a.ga += r.score2;
    b.gf += r.score2; b.ga += r.score1;
    if (r.score1 > r.score2) { a.wins++; a.points += 3; b.losses++; }
    else if (r.score2 > r.score1) { b.wins++; b.points += 3; a.losses++; }
    else { a.draws++; b.draws++; a.points++; b.points++; }
  }

  for (const t in stats) stats[t].gd = stats[t].gf - stats[t].ga;

  // If the group has no entered results, show all teams alphabetically with zeros.
  const groupHasAnyResult = Object.values(stats).some(s => s.played > 0);
  const sorted = groupHasAnyResult
    ? Object.values(stats).sort((x, y) =>
      y.points - x.points ||
      y.gd - x.gd ||
      y.gf - x.gf ||
      x.team.localeCompare(y.team)
    )
    : Object.values(stats).sort((x, y) => x.team.localeCompare(y.team));

  // Apply admin override (manual reordering) if present for this group.
  const override = state.standingsOverride[groupLetter];
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

function renderStandings() {
  els.standingsView.innerHTML = "";

  const intro = document.createElement("div");
  intro.className = "standings-intro";
  intro.innerHTML = `
    <p>Tables below update live. Top two from each group qualify (<span class="legend-green">green</span>), plus the 8 best third-placed teams across all groups (<span class="legend-gold">gold</span>, once the group stage is complete).</p>
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
      // Capture IDs BEFORE clearing so we can tell Appwrite which docs to delete
      const matchIdsToDelete = Object.keys(state.results);
      const lettersToDelete = Object.keys(state.standingsOverride);
      state.results = {};
      state.standingsOverride = {};
      saveResults();
      saveStandingsOverride();
      // Propagate deletions to Appwrite (each pushMatch sees no local entry → deletes the doc)
      for (const mid of matchIdsToDelete) appwriteSync.scheduleMatch(mid);
      for (const letter of lettersToDelete) appwriteSync.scheduleStandings(letter);
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

  // Once the group stage is complete, the best 8 of 12 third-placed teams also qualify.
  const ko = getKnockoutAssignments();
  const thirdQualifyingGroups = new Set(ko.complete ? ko.top8.map(t => t.group) : []);

  const letters = Object.keys(GROUPS).sort();
  for (const letter of letters) {
    const rows = computeStandings(letter);
    const table = document.createElement("div");
    table.className = "standings-table";
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
      return `
            <tr class="${cls}">
              <td class="pos">${i + 1}${moveBtns}</td>
              <td class="team-col"><span class="flag">${flagFor(r.team)}</span>${r.team}</td>
              <td>${r.played}</td>
              <td>${r.wins}</td>
              <td>${r.draws}</td>
              <td>${r.losses}</td>
              <td>${r.gf}</td>
              <td>${r.ga}</td>
              <td>${r.gd > 0 ? "+" + r.gd : r.gd}</td>
              <td class="pts">${r.points}</td>
            </tr>`;
    }).join("")}
        </tbody>
      </table>
    `;
    grid.appendChild(table);
  }

  els.standingsView.appendChild(grid);

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

function renderBracket() {
  els.bracketView.innerHTML = "";
  const ko = getKnockoutAssignments();

  // If a champion exists, show a banner above the bracket
  const finalMatch = FIXTURES.find(m => m.stage === "final");
  const champion = finalMatch ? getKnockoutOutcome(finalMatch, "winner", ko) : null;
  if (champion) {
    const banner = document.createElement("div");
    banner.className = "ko-banner champion-banner";
    banner.innerHTML = `🏆 <span class="flag">${flagFor(champion)}</span> <strong>${champion}</strong> are World Champions!`;
    els.bracketView.appendChild(banner);
  }

  const rounds = [
    { key: "r32", label: "Round of 32" },
    { key: "r16", label: "Round of 16" },
    { key: "qf", label: "Quarterfinals" },
    { key: "sf", label: "Semifinals" },
    { key: "final", label: "Final" },
  ];

  const wrap = document.createElement("div");
  wrap.className = "bracket-scroll";

  const bracket = document.createElement("div");
  bracket.className = "bracket";

  for (const round of rounds) {
    const col = document.createElement("div");
    col.className = "bracket-round";
    const title = document.createElement("h3");
    title.className = "bracket-round-title";
    title.textContent = round.label;
    col.appendChild(title);

    const matchesDiv = document.createElement("div");
    matchesDiv.className = "bracket-matches";
    const matches = getMatchesInBracketOrder(round.key);
    for (const m of matches) {
      matchesDiv.appendChild(renderBracketMatch(m, ko));
    }
    col.appendChild(matchesDiv);
    bracket.appendChild(col);
  }
  wrap.appendChild(bracket);
  els.bracketView.appendChild(wrap);

  // Third-place match — shown below the main bracket
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
    const r = state.results[matchId(m)];
    if (!r || !Array.isArray(r.scorers) || r.scorers.length === 0) continue;
    const { team1, team2 } = resolveMatchTeams(m, ko);
    if (!team1 || !team2) continue;        // unresolved KO match — skip
    for (const s of r.scorers) {
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

// Display order for the bracket visualization — maps each stage's FIXTURES order
// (which is chronological) to the order that visually pairs each match with its
// two upstream feeders. Without this, FIFA's cross-bracket (where R16 M89 pulls
// from R32 indices 2 and 5, not 0 and 1) makes the column alignment chaotic.
const BRACKET_DISPLAY_ORDER = {
  r32: [2, 5, 0, 3, 11, 10, 9, 8, 1, 4, 6, 7, 14, 13, 12, 15],
  r16: [1, 0, 4, 5, 2, 3, 6, 7],
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
        const winMatch = m.team1.match(/^Winner ([A-L])$/);
        if (!winMatch) continue;
        const winnerLetter = winMatch[1];
        const thirdGroup = matrixLookup[winnerLetter];
        if (!thirdGroup) continue;
        const ti = groupToTeam[thirdGroup];
        if (ti) thirdsAssignments[`${matchId(m)}:2`] = ti;
      }
    }
  }

  return { complete: ready, winners, runnersUp, top8, thirdsAssignments };
}

function predictResolveTeamName(placeholder, m, pos, predKo) {
  if (!predKo) return null;
  let mt;
  if ((mt = placeholder.match(/^Winner ([A-L])$/))) return predKo.winners[mt[1]] || null;
  if ((mt = placeholder.match(/^Runner-up ([A-L])$/))) return predKo.runnersUp[mt[1]] || null;
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

// ----- Render -----
function renderPredict() {
  const view = els.predictView;
  view.innerHTML = "";

  const header = document.createElement("div");
  header.className = "predict-header";
  header.innerHTML = `
    <p>Pick your full World Cup prediction. All choices save automatically to this browser only.</p>
    <div class="predict-header-actions">
      <button type="button" id="predictSaveImgBtn" class="action-btn">📷 Save image</button>
      <button type="button" id="predictSavePdfBtn" class="action-btn">📄 Save PDF</button>
      <button type="button" id="predictResetBtn" class="danger-btn">Reset all</button>
    </div>
  `;
  view.appendChild(header);
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
  header.querySelector("#predictSaveImgBtn").addEventListener("click", (e) => downloadPrediction("png", e.currentTarget));
  header.querySelector("#predictSavePdfBtn").addEventListener("click", (e) => downloadPrediction("pdf", e.currentTarget));

  view.appendChild(renderPredictGroupsSection());
  view.appendChild(renderPredictThirdsSection());
  view.appendChild(renderPredictBracketSection());
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
    card.innerHTML = `
      <h3>Group ${letter}</h3>
      <ol class="predict-group-list">
        ${order.map((team, idx) => `
          <li class="predict-team-row ${idx < 2 ? "qualify" : idx === 2 ? "third" : "out"}">
            <span class="predict-pos">${idx + 1}</span>
            <span class="flag">${flagFor(team)}</span>
            <span class="predict-team-name">${escapeHTML(team)}</span>
            <span class="predict-move">
              <button type="button" class="predict-move-btn" data-dir="up" data-team="${escapeHTML(team)}" ${idx === 0 ? "disabled" : ""} aria-label="Move ${escapeHTML(team)} up">▲</button>
              <button type="button" class="predict-move-btn" data-dir="down" data-team="${escapeHTML(team)}" ${idx === order.length - 1 ? "disabled" : ""} aria-label="Move ${escapeHTML(team)} down">▼</button>
            </span>
          </li>
        `).join("")}
      </ol>
    `;
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
    const isDisabled = !isSelected && count >= 8;
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `predict-third-chip${isSelected ? " is-selected" : ""}${isDisabled ? " is-disabled" : ""}`;
    chip.disabled = isDisabled;
    chip.innerHTML = `
      <span class="predict-third-group">3rd ${group}</span>
      <span class="flag">${flagFor(team)}</span>
      <span class="predict-third-team">${escapeHTML(team)}</span>
    `;
    chip.addEventListener("click", () => {
      toggleBestThird(team);
      renderPredict();
    });
    grid.appendChild(chip);
  }
  return section;
}

function renderPredictBracketSection() {
  const section = document.createElement("section");
  section.className = "predict-step";

  const predKo = buildPredictionKo();
  if (!predKo.complete) {
    section.innerHTML = `
      <h2 class="predict-step-title"><span class="predict-step-num">3</span> Bracket</h2>
      <p class="predict-step-hint">Pick your 8 best third-place teams above to unlock the bracket.</p>
    `;
    return section;
  }

  const finalMatch = FIXTURES.find(m => m.stage === "final");
  const champion = finalMatch ? predictGetWinner(finalMatch, predKo) : null;

  section.innerHTML = `
    <h2 class="predict-step-title"><span class="predict-step-num">3</span> Bracket</h2>
    <p class="predict-step-hint">Tap a team in each match to pick the winner. Picks propagate to the next round automatically.</p>
    ${champion ? `<div class="ko-banner champion-banner">🏆 <span class="flag">${flagFor(champion)}</span> <strong>${escapeHTML(champion)}</strong> — your predicted World Champion!</div>` : ""}
    <div class="bracket-scroll">
      <div class="bracket predict-bracket"></div>
    </div>
  `;

  const bracket = section.querySelector(".bracket");
  const rounds = [
    { key: "r32", label: "Round of 32" },
    { key: "r16", label: "Round of 16" },
    { key: "qf", label: "Quarterfinals" },
    { key: "sf", label: "Semifinals" },
    { key: "final", label: "Final" },
  ];

  for (const round of rounds) {
    const col = document.createElement("div");
    col.className = "bracket-round";
    col.innerHTML = `<h3 class="bracket-round-title">${round.label}</h3>`;
    const matchesDiv = document.createElement("div");
    matchesDiv.className = "bracket-matches";
    const matches = getMatchesInBracketOrder(round.key);
    for (const m of matches) {
      matchesDiv.appendChild(renderPredictBracketMatch(m, predKo));
    }
    col.appendChild(matchesDiv);
    bracket.appendChild(col);
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

  const card = document.createElement("div");
  card.className = "bracket-match predict-bracket-match";

  const row = (team, isWinner, isLoser, isPlaceholder, side) => {
    const safeTeam = team ? escapeHTML(team) : "";
    const clickable = team && !isPlaceholder;
    return `
      <div class="bracket-team predict-bracket-team${isWinner ? " win" : ""}${isLoser ? " lose" : ""}${isPlaceholder ? " placeholder" : ""}${clickable ? " clickable" : ""}"
           ${clickable ? `data-team="${safeTeam}"` : ""}
           role="${clickable ? "button" : ""}"
           tabindex="${clickable ? "0" : "-1"}">
        <span class="flag">${team ? flagFor(team) : ""}</span>
        <span class="bracket-team-name" title="${safeTeam}">${team || "TBD"}</span>
      </div>`;
  };

  card.innerHTML =
    row(team1, winner && winner === team1, winner && winner !== team1, !team1, 1) +
    row(team2, winner && winner === team2, winner && winner !== team2, !team2, 2);

  card.querySelectorAll(".predict-bracket-team.clickable").forEach(el => {
    const pickTeam = el.dataset.team;
    const select = () => {
      const current = state.prediction.koWinners[matchId(m)];
      // Clicking the already-winner clears the pick; clicking the other team replaces it
      setPredictKoWinner(m, current === pickTeam ? null : pickTeam);
      // Clearing or changing a pick can cascade — re-render the whole bracket section
      renderPredict();
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
  if (view === "schedule") render();
  if (view === "groups") renderGroups();
  if (view === "standings") renderStandings();
  if (view === "bracket") renderBracket();
  if (view === "scorers") renderTopScorers();
  if (view === "predict") renderPredict();
}

function render() {
  renderSummary(state.selectedTeam, state.selectedDate);
  if (state.view === "schedule") renderSchedule(state.selectedTeam, state.selectedDate);
}

// --- Events ---
els.teamSelect.addEventListener("change", e => {
  state.selectedTeam = e.target.value;
  if (state.view !== "schedule") switchView("schedule");
  else render();
});

els.dateSelect.addEventListener("change", e => {
  state.selectedDate = e.target.value;
  if (state.view !== "schedule") switchView("schedule");
  else render();
});

els.tzSelect.addEventListener("change", e => {
  state.selectedTz = e.target.value;
  populateDates(); // re-derive date options in new tz
  render();
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

function updateAdminBtn() {
  els.adminBtn.textContent = state.isAdmin ? "🔓 Admin (logout)" : "🔒 Admin";
  els.adminBtn.classList.toggle("is-active", state.isAdmin);
}
els.adminBtn.addEventListener("click", () => {
  if (state.isAdmin) logout();
  else openLoginModal();
});

// ===== Appwrite real-time sync =====
const APPWRITE_CONFIG = {
  endpoint: "https://sgp.cloud.appwrite.io/v1",
  projectId: "6a264e98000a60c067f3",
  databaseId: "6a2650420015db5d5e8a",
  resultsCollection: "matchresults",
  standingsCollection: "standingsoverrides",
};

const appwriteSync = (() => {
  // Detect SDK; if absent (CDN blocked / failed), fall back to the old results.json flow.
  if (typeof window.Appwrite === "undefined") {
    console.warn("Appwrite SDK not loaded — running in local-only mode.");
    return {
      available: false,
      scheduleMatch() {},
      scheduleStandings() {},
      deleteMatch() {},
      deleteStandings() {},
      bootstrap: async () => null,
      isConnected: () => false,
    };
  }

  const { Client, Databases, Query } = window.Appwrite;
  const client = new Client()
    .setEndpoint(APPWRITE_CONFIG.endpoint)
    .setProject(APPWRITE_CONFIG.projectId);
  const db = new Databases(client);

  // matchIds contain spaces/slashes; produce a deterministic, Appwrite-safe doc ID.
  function appwriteDocId(matchId) {
    let h1 = 5381, h2 = 52711;
    for (let i = 0; i < matchId.length; i++) {
      const c = matchId.charCodeAt(i);
      h1 = ((h1 << 5) + h1 + c) >>> 0;
      h2 = ((h2 << 5) - h2 + c) >>> 0;
    }
    return ("m" + h1.toString(36) + h2.toString(36)).slice(0, 36);
  }

  // Track which docs are known to exist so we know whether to create vs update.
  const knownResultDocs = new Set();
  const knownStandingDocs = new Set();

  function docToResult(doc) {
    const r = {};
    if (doc.score1 !== null && doc.score1 !== undefined) r.score1 = doc.score1;
    if (doc.score2 !== null && doc.score2 !== undefined) r.score2 = doc.score2;
    if (doc.pen1 !== null && doc.pen1 !== undefined) r.pen1 = doc.pen1;
    if (doc.pen2 !== null && doc.pen2 !== undefined) r.pen2 = doc.pen2;
    // scorers stored as Array of strings — each element is a JSON-encoded scorer object
    if (Array.isArray(doc.scorers) && doc.scorers.length) {
      const parsed = [];
      for (const s of doc.scorers) {
        try { parsed.push(JSON.parse(s)); } catch { /* skip malformed entry */ }
      }
      if (parsed.length) r.scorers = parsed;
    }
    return r;
  }

  function resultToPayload(matchId, r) {
    return {
      matchId,
      score1: r.score1 ?? null,
      score2: r.score2 ?? null,
      pen1: r.pen1 ?? null,
      pen2: r.pen2 ?? null,
      // Array attribute: one JSON-encoded scorer per element
      scorers: (Array.isArray(r.scorers) && r.scorers.length)
        ? r.scorers.map(s => JSON.stringify(s))
        : [],
    };
  }

  // Debounced pushers — coalesce rapid edits (typing in score input) into one write.
  const pendingMatchTimers = new Map();
  const pendingStandingTimers = new Map();
  const DEBOUNCE_MS = 400;

  async function pushMatch(matchId) {
    const r = state.results[matchId];
    const docId = appwriteDocId(matchId);
    if (!r) {
      // Entry was deleted locally — propagate
      if (!knownResultDocs.has(docId)) return;
      try {
        await db.deleteDocument(APPWRITE_CONFIG.databaseId, APPWRITE_CONFIG.resultsCollection, docId);
        knownResultDocs.delete(docId);
      } catch (err) {
        if (err.code !== 404) console.warn("Appwrite delete failed:", err.message || err);
      }
      return;
    }
    const payload = resultToPayload(matchId, r);
    if (knownResultDocs.has(docId)) {
      try {
        await db.updateDocument(APPWRITE_CONFIG.databaseId, APPWRITE_CONFIG.resultsCollection, docId, payload);
      } catch (err) {
        if (err.code === 404) {
          knownResultDocs.delete(docId);
          return pushMatch(matchId); // retry as create
        }
        console.warn("Appwrite update failed:", err.message || err);
      }
    } else {
      try {
        await db.createDocument(APPWRITE_CONFIG.databaseId, APPWRITE_CONFIG.resultsCollection, docId, payload);
        knownResultDocs.add(docId);
      } catch (err) {
        if (err.code === 409) {
          knownResultDocs.add(docId);
          try {
            await db.updateDocument(APPWRITE_CONFIG.databaseId, APPWRITE_CONFIG.resultsCollection, docId, payload);
          } catch (e2) { console.warn("Appwrite update failed:", e2.message || e2); }
        } else {
          console.warn("Appwrite create failed:", err.message || err);
        }
      }
    }
  }

  async function pushStandings(groupLetter) {
    const order = state.standingsOverride[groupLetter];
    const docId = groupLetter; // safe single-char Appwrite ID
    if (!Array.isArray(order) || order.length === 0) {
      if (!knownStandingDocs.has(docId)) return;
      try {
        await db.deleteDocument(APPWRITE_CONFIG.databaseId, APPWRITE_CONFIG.standingsCollection, docId);
        knownStandingDocs.delete(docId);
      } catch (err) {
        if (err.code !== 404) console.warn("Appwrite standings delete failed:", err.message || err);
      }
      return;
    }
    const payload = { groupLetter, order: JSON.stringify(order) };
    if (knownStandingDocs.has(docId)) {
      try {
        await db.updateDocument(APPWRITE_CONFIG.databaseId, APPWRITE_CONFIG.standingsCollection, docId, payload);
      } catch (err) {
        if (err.code === 404) {
          knownStandingDocs.delete(docId);
          return pushStandings(groupLetter);
        }
        console.warn("Appwrite standings update failed:", err.message || err);
      }
    } else {
      try {
        await db.createDocument(APPWRITE_CONFIG.databaseId, APPWRITE_CONFIG.standingsCollection, docId, payload);
        knownStandingDocs.add(docId);
      } catch (err) {
        if (err.code === 409) {
          knownStandingDocs.add(docId);
          try {
            await db.updateDocument(APPWRITE_CONFIG.databaseId, APPWRITE_CONFIG.standingsCollection, docId, payload);
          } catch (e2) { console.warn("Appwrite standings update failed:", e2.message || e2); }
        } else {
          console.warn("Appwrite standings create failed:", err.message || err);
        }
      }
    }
  }

  function scheduleMatch(matchId) {
    const existing = pendingMatchTimers.get(matchId);
    if (existing) clearTimeout(existing);
    pendingMatchTimers.set(matchId, setTimeout(() => {
      pendingMatchTimers.delete(matchId);
      pushMatch(matchId);
    }, DEBOUNCE_MS));
  }

  function scheduleStandings(groupLetter) {
    const existing = pendingStandingTimers.get(groupLetter);
    if (existing) clearTimeout(existing);
    pendingStandingTimers.set(groupLetter, setTimeout(() => {
      pendingStandingTimers.delete(groupLetter);
      pushStandings(groupLetter);
    }, DEBOUNCE_MS));
  }

  // Lightweight version check — 2 tiny queries (1 doc each) to read total count
  // + newest $updatedAt per collection. If these match the cached snapshot, the
  // client can serve from localStorage without doing a full bootstrap.
  async function checkRemoteVersion() {
    try {
      const [res, ovr] = await Promise.all([
        db.listDocuments(APPWRITE_CONFIG.databaseId, APPWRITE_CONFIG.resultsCollection,
          [Query.orderDesc("$updatedAt"), Query.limit(1)]),
        db.listDocuments(APPWRITE_CONFIG.databaseId, APPWRITE_CONFIG.standingsCollection,
          [Query.orderDesc("$updatedAt"), Query.limit(1)]),
      ]);
      return {
        resultsTotal: res.total,
        overridesTotal: ovr.total,
        latestResultUpdate: res.documents[0]?.$updatedAt || "",
        latestStandingsUpdate: ovr.documents[0]?.$updatedAt || "",
      };
    } catch (err) {
      console.warn("Appwrite version check failed:", err.message || err);
      return null;
    }
  }

  async function bootstrap() {
    const results = {};
    const overrides = {};
    let maxResultUpdate = "";
    let maxStandingsUpdate = "";
    let resultsTotal = 0;
    let overridesTotal = 0;
    try {
      // Pull all results (one collection, possibly > 25 docs — paginate up to 200)
      let offset = 0;
      while (true) {
        const page = await db.listDocuments(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.resultsCollection,
          [Query.limit(100), Query.offset(offset)]
        );
        if (offset === 0) resultsTotal = page.total;
        for (const doc of page.documents) {
          knownResultDocs.add(doc.$id);
          const r = docToResult(doc);
          if (Object.keys(r).length > 0) results[doc.matchId] = r;
          if (doc.$updatedAt > maxResultUpdate) maxResultUpdate = doc.$updatedAt;
        }
        if (page.documents.length < 100) break;
        offset += 100;
      }
      // Standings overrides — at most 12 docs (one per group)
      const ovr = await db.listDocuments(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.standingsCollection,
        [Query.limit(50)]
      );
      overridesTotal = ovr.total;
      for (const doc of ovr.documents) {
        knownStandingDocs.add(doc.$id);
        try { overrides[doc.groupLetter] = JSON.parse(doc.order); } catch { /* ignore */ }
        if (doc.$updatedAt > maxStandingsUpdate) maxStandingsUpdate = doc.$updatedAt;
      }
      return {
        results,
        overrides,
        meta: {
          resultsTotal,
          overridesTotal,
          latestResultUpdate: maxResultUpdate,
          latestStandingsUpdate: maxStandingsUpdate,
        },
      };
    } catch (err) {
      console.warn("Appwrite bootstrap failed:", err.message || err);
      return null;
    }
  }

  function subscribe() {
    const channels = [
      `databases.${APPWRITE_CONFIG.databaseId}.collections.${APPWRITE_CONFIG.resultsCollection}.documents`,
      `databases.${APPWRITE_CONFIG.databaseId}.collections.${APPWRITE_CONFIG.standingsCollection}.documents`,
    ];
    try {
      client.subscribe(channels, (msg) => {
        const events = (msg.events || []).join(" ");
        const isResults = events.includes(`.collections.${APPWRITE_CONFIG.resultsCollection}.`);
        const isStandings = events.includes(`.collections.${APPWRITE_CONFIG.standingsCollection}.`);
        const isDelete = events.includes(".delete");
        const doc = msg.payload;
        if (!doc) return;

        if (isResults && doc.matchId) {
          if (isDelete) {
            knownResultDocs.delete(doc.$id);
            if (!(doc.matchId in state.results)) {
              bumpCacheVersionFromEvent("results", doc);
              return;
            }
            delete state.results[doc.matchId];
          } else {
            knownResultDocs.add(doc.$id);
            const newR = docToResult(doc);
            const oldR = state.results[doc.matchId];
            // Skip render when echo matches our local state — prevents focus-jump
            // during admin typing and avoids unnecessary reflows.
            if (oldR && JSON.stringify(oldR) === JSON.stringify(newR)) {
              bumpCacheVersionFromEvent("results", doc);
              return;
            }
            state.results[doc.matchId] = newR;
          }
          saveResults();
          bumpCacheVersionFromEvent("results", doc);
          rerenderActive();
        } else if (isStandings && doc.groupLetter) {
          if (isDelete) {
            knownStandingDocs.delete(doc.$id);
            if (!(doc.groupLetter in state.standingsOverride)) {
              bumpCacheVersionFromEvent("standings", doc);
              return;
            }
            delete state.standingsOverride[doc.groupLetter];
          } else {
            knownStandingDocs.add(doc.$id);
            try {
              const newOrder = JSON.parse(doc.order);
              const oldOrder = state.standingsOverride[doc.groupLetter];
              if (oldOrder && JSON.stringify(oldOrder) === JSON.stringify(newOrder)) {
                bumpCacheVersionFromEvent("standings", doc);
                return;
              }
              state.standingsOverride[doc.groupLetter] = newOrder;
            } catch { return; }
          }
          saveStandingsOverride();
          bumpCacheVersionFromEvent("standings", doc);
          rerenderActive();
        }
      });
    } catch (err) {
      console.warn("Appwrite realtime subscribe failed:", err.message || err);
    }
  }

  return {
    available: true,
    scheduleMatch,
    scheduleStandings,
    deleteMatch: (matchId) => pushMatch(matchId),
    deleteStandings: (groupLetter) => pushStandings(groupLetter),
    bootstrap,
    checkRemoteVersion,
    subscribe,
  };
})();

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
updateAdminBtn();
populateTeams();
populateTimezones();
populateDates();
render();

// Bootstrap from Appwrite (preferred) or fall back to results.json.
// Smart strategy: do a lightweight version check first (2 tiny queries).
// If the cached snapshot matches what's on Appwrite, skip the full bootstrap
// entirely — saves ~100 doc reads per page load on the free tier.
if (appwriteSync.available) {
  // Always subscribe to realtime so any admin change reaches us live.
  appwriteSync.subscribe();

  const localHasData = Object.keys(state.results).length > 0
    || Object.keys(state.standingsOverride).length > 0;

  appwriteSync.checkRemoteVersion().then(async (remote) => {
    if (!remote) return; // network/CORS issue — fall back silently to cache

    const remoteHasData = remote.resultsTotal > 0 || remote.overridesTotal > 0;

    // Case 1: Appwrite empty + local has data → first ever run, seed Appwrite
    if (!remoteHasData && localHasData) {
      console.log(`Seeding Appwrite from local cache: ${Object.keys(state.results).length} results, ${Object.keys(state.standingsOverride).length} overrides.`);
      for (const matchId of Object.keys(state.results)) appwriteSync.scheduleMatch(matchId);
      for (const letter of Object.keys(state.standingsOverride)) appwriteSync.scheduleStandings(letter);
      return;
    }

    // Case 2: Both empty → nothing to do
    if (!remoteHasData && !localHasData) {
      setCacheVersion(remote);
      return;
    }

    // Case 3: cached snapshot is fresh → skip the expensive bootstrap
    const localVersion = getCacheVersion();
    if (!isCacheStale(localVersion, remote)) {
      console.log("Cache is fresh — using local data, no full fetch needed.");
      return;
    }

    // Case 4: cache is stale or missing → do a full bootstrap
    console.log("Cache stale, fetching latest from Appwrite...");
    const data = await appwriteSync.bootstrap();
    if (data) {
      state.results = data.results;
      state.standingsOverride = data.overrides;
      saveResults();
      saveStandingsOverride();
      setCacheVersion(data.meta);
      rerenderActive();
    }
  });
} else {
  loadLatestFromServer().then(payload => {
    if (payload && !payload.__error && Object.keys(payload.results).length > 0) {
      applyServerData(payload);
      rerenderActive();
    }
  });
}
