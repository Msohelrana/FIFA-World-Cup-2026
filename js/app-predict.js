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

