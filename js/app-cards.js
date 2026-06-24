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
    // A hand-typed score becomes the canonical admin entry — drop any
    // auto-archived flag so the live/API feed no longer overrides it.
    const next = { ...(prev || {}), score1: v1, score2: v2 };
    delete next.auto;

    if (p1 && p2) {
      next.pen1 = parseNum(p1);
      next.pen2 = parseNum(p2);
    }

    const hasScorers = Array.isArray(next.scorers) && next.scorers.length > 0;
    const cleared = v1 === undefined && v2 === undefined && next.pen1 === undefined && next.pen2 === undefined && !hasScorers;
    if (cleared) {
      delete state.results[id];
    } else {
      state.results[id] = next;
    }
    saveResults();
    appwriteSync.scheduleMatch(id);

    // Cleared the override but the API still has a result → reveal it right away
    // (re-render so getResult's live value shows, instead of waiting for a manual
    // "Refresh scorers" click).
    if (cleared) {
      const live = (typeof liveScores !== "undefined") ? liveScores.get(id) : null;
      if (live) {
        preserveScrollAndFocus(() => renderSchedule(state.selectedTeam, state.selectedDate));
        return;
      }
    }

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

