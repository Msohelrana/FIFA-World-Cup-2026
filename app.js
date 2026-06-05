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
  summary: document.getElementById("summary"),
  tabs: document.querySelectorAll(".tab"),
};

const RESULTS_KEY = "wc2026_results";
const ADMIN_KEY = "wc2026_admin";
const OVERRIDE_KEY = "wc2026_standings_override";

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
  isAdmin: localStorage.getItem(ADMIN_KEY) === "1",
};

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
    const res = await fetch("results.json", { cache: "no-store" });
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
    <span class="${t1Class}"><span class="flag">${f1}</span>${displayTeam1}</span>
    <span class="vs">VS</span>
    <span class="${t2Class}">${displayTeam2}<span class="flag flag-right">${f2}</span></span>
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

  const footer = `<div class="match-footer"><span class="venue">${venueWithCountry(m.venue)}</span></div>`;

  card.innerHTML = meta + teamsHTML + resultHTML + footer;

  wireScoreInputs(card, m, displayTeam1, displayTeam2, teamsKnown);
  return card;
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

    if (v1 === undefined && v2 === undefined && next.pen1 === undefined && next.pen2 === undefined) {
      delete state.results[id];
    } else {
      state.results[id] = next;
    }
    saveResults();

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

  // Greedy assignment of the 8 qualifying third-placers to R32 slots.
  // Each "3rd X/Y/Z/..." slot has a candidate-group list; we pick the
  // best-ranked qualifying team whose group is in the list.
  const thirdsAssignments = {};
  if (complete) {
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
      state.results = {};
      state.standingsOverride = {};
      saveResults();
      saveStandingsOverride();
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
      const payload = await loadLatestFromServer();
      if (payload && payload.__error) {
        showAlert(
          `Could not load results.json from server.\n\n${payload.__error}\n\nMake sure results.json is committed to the repo root.`,
          { title: "Load failed", icon: "⚠️", iconType: "warning" }
        );
        return;
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
    const matches = FIXTURES.filter(m => m.stage === round.key);
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
  if (view === "schedule") render();
  if (view === "groups") renderGroups();
  if (view === "standings") renderStandings();
  if (view === "bracket") renderBracket();
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

// --- Init ---
applyAdminClass();
updateAdminBtn();
populateTeams();
populateTimezones();
populateDates();
render();

// Viewers always pull fresh data from results.json on every load — so any update
// you push to the repo is immediately visible to everyone.
// Admins keep their local edits across reloads (otherwise unpushed work would
// be lost every refresh). The admin can click "Load latest from server" to
// pull manually when they want.
const shouldAutoFetch = !state.isAdmin
  || (Object.keys(state.results).length === 0 &&
    Object.keys(state.standingsOverride).length === 0);
if (shouldAutoFetch) {
  loadLatestFromServer().then(payload => {
    if (payload && !payload.__error && Object.keys(payload.results).length > 0) {
      applyServerData(payload);
      rerenderActive();
    }
  });
}
