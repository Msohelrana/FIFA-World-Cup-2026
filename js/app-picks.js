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

  updatePicksBadge(ko);
}

// Count still-predictable matches the user hasn't picked that lock within 24h.
function countUnpredictedSoon(ko) {
  if (typeof FIXTURES === "undefined") return 0;
  ko = ko || getKnockoutAssignments();
  const now = Date.now();
  const WINDOW = 24 * 60 * 60 * 1000;
  let n = 0;
  for (const m of FIXTURES) {
    const koMs = fixtureToUTC(m).getTime();
    if (koMs <= now || koMs - now > WINDOW) continue;       // already locked, or not soon
    const { team1, team2 } = resolveMatchTeams(m, ko);
    if (!team1 || !team2) continue;                          // teams undecided → can't predict
    const p = state.matchPicks[matchId(m)];
    if (p && p.score1 !== undefined && p.score2 !== undefined) continue;
    n++;
  }
  return n;
}

// Show/refresh the count bubble on the Match Predict tab(s).
function updatePicksBadge(ko) {
  const n = countUnpredictedSoon(ko);
  document.querySelectorAll('.tab[data-view="picks"]').forEach(btn => {
    let badge = btn.querySelector(".tab-badge");
    if (n > 0) {
      if (!badge) { badge = document.createElement("span"); badge.className = "tab-badge"; btn.appendChild(badge); }
      badge.textContent = String(n);
      badge.setAttribute("aria-label", `${n} match${n === 1 ? "" : "es"} lock within 24h, not predicted`);
      badge.title = badge.getAttribute("aria-label");
    } else if (badge) {
      badge.remove();
    }
  });
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

  // Nudge: flag a still-predictable match the user hasn't picked yet, with
  // extra emphasis if it locks within 24h.
  const hasPick = pick.score1 !== undefined && pick.score2 !== undefined;
  if (!locked && teamsKnown && !hasPick) {
    card.classList.add("is-unpredicted");
    if (kickoffUtcMs - Date.now() <= 24 * 60 * 60 * 1000) card.classList.add("is-locking-soon");
  }

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
  updatePicksBadge();
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

