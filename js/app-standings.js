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

  const mobile = isMobileBracket();
  _bracketIsMobile = mobile;

  if (mobile) {
    // ── Mobile: vertically-folded bracket (rounds flow top → center → bottom) ──
    const thirdM = FIXTURES.find(m => m.stage === "third");
    wrap.appendChild(buildFoldedBracket((m) => renderBracketMatch(m, ko), {
      trophy: true, badges: true, bronze: thirdM || null,
    }));
  } else {
    const grid = document.createElement("div");
    grid.className = "bracket-two-sided";

    const leftHalf = document.createElement("div");
    leftHalf.className = "bracket-half bracket-left";
    leftHalf.appendChild(makeRound("R32", allR32.slice(0, 8)));
    leftHalf.appendChild(makeRound("R16", allR16.slice(0, 4)));
    leftHalf.appendChild(makeRound("Quarterfinals", allQF.slice(0, 2)));
    leftHalf.appendChild(makeRound("Semifinals", allSF.slice(0, 1)));

    const center = document.createElement("div");
    center.className = "bracket-center";

    const trophy = document.createElement("div");
    trophy.className = "bracket-trophy";
    trophy.innerHTML = `<div class="bracket-trophy-icon" aria-hidden="true">🏆</div><div class="bracket-trophy-label">Champion</div>`;
    center.appendChild(trophy);

    for (const m of allFinal) {
      const wrap = document.createElement("div");
      wrap.className = "bracket-center-match";
      wrap.appendChild(renderBracketMatch(m, ko));
      wrap.insertAdjacentHTML("beforeend", `<span class="bracket-badge badge-final">Final</span>`);
      center.appendChild(wrap);
    }

    const thirdM = FIXTURES.find(m => m.stage === "third");
    if (thirdM) {
      const wrap = document.createElement("div");
      wrap.className = "bracket-center-match";
      wrap.appendChild(renderBracketMatch(thirdM, ko));
      wrap.insertAdjacentHTML("beforeend", `<span class="bracket-badge badge-bronze">Bronze Final</span>`);
      center.appendChild(wrap);
    }

    const rightHalf = document.createElement("div");
    rightHalf.className = "bracket-half bracket-right";
    rightHalf.appendChild(makeRound("Semifinals", allSF.slice(1)));
    rightHalf.appendChild(makeRound("Quarterfinals", allQF.slice(2)));
    rightHalf.appendChild(makeRound("R16", allR16.slice(4)));
    rightHalf.appendChild(makeRound("R32", allR32.slice(8)));

    grid.appendChild(leftHalf);
    grid.appendChild(center);
    grid.appendChild(rightHalf);
    wrap.appendChild(grid);
  }

  els.bracketView.appendChild(wrap);

  // Draw connector lines once the cards are laid out (both layouts).
  requestAnimationFrame(() => {
    if (mobile) {
      const c = els.bracketView.querySelector(".bracket-vfold");
      if (c) drawFoldedConnectors(c);
    } else {
      drawBracketConnectors();
    }
  });
  if (!_bracketResizeBound) {
    _bracketResizeBound = true;
    let raf = 0;
    window.addEventListener("resize", () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (state.view !== "bracket" || els.bracketView.hidden) return;
        // Switching across the mobile/desktop boundary rebuilds the whole layout.
        if (isMobileBracket() !== _bracketIsMobile) { renderBracket(); return; }
        if (_bracketIsMobile) {
          const c = els.bracketView.querySelector(".bracket-vfold");
          if (c) drawFoldedConnectors(c);
        } else {
          drawBracketConnectors();
        }
      });
    });
  }
}

function isMobileBracket() {
  return window.matchMedia("(max-width: 700px)").matches;
}

// Build the mobile folded bracket: rounds flow top → center → bottom, with the
// final, bronze final and champion trophy in the middle. cardFn(m) renders a
// single match cell (so both the bracket tab and Table Predict can reuse this).
function buildFoldedBracket(cardFn, opts) {
  opts = opts || {};
  const canvas = document.createElement("div");
  canvas.className = "bracket-vfold";

  const allR32 = getMatchesInBracketOrder("r32");
  const allR16 = getMatchesInBracketOrder("r16");
  const allQF  = getMatchesInBracketOrder("qf");
  const allSF  = getMatchesInBracketOrder("sf");
  const allFinal = getMatchesInBracketOrder("final");

  const mkRow = (matches, key) => {
    const r = document.createElement("div");
    r.className = "bracket-vrow vr-" + key;
    for (const m of matches) {
      const cell = document.createElement("div");
      cell.className = "bracket-vcell";
      cell.appendChild(cardFn(m));
      r.appendChild(cell);
    }
    canvas.appendChild(r);
  };

  // Top half flows down to the centre.
  mkRow(allR32.slice(0, 8), "r32t");
  mkRow(allR16.slice(0, 4), "r16t");
  mkRow(allQF.slice(0, 2), "qft");
  mkRow(allSF.slice(0, 1), "sft");

  // Centre: bronze (left) · final (middle) · champion (right).
  const center = document.createElement("div");
  center.className = "bracket-vcenter";
  if (opts.bronze) {
    const bw = document.createElement("div");
    bw.className = "bracket-center-match bracket-vbronze";
    bw.appendChild(cardFn(opts.bronze));
    if (opts.badges) bw.insertAdjacentHTML("beforeend", `<span class="bracket-badge badge-bronze">Bronze Final</span>`);
    center.appendChild(bw);
  } else {
    center.appendChild(document.createElement("div")); // keep the grid column
  }
  for (const m of allFinal) {
    const fw = document.createElement("div");
    fw.className = "bracket-center-match bracket-vfinalcard";
    fw.appendChild(cardFn(m));
    if (opts.badges) fw.insertAdjacentHTML("beforeend", `<span class="bracket-badge badge-final">Final</span>`);
    center.appendChild(fw);
  }
  if (opts.trophy) {
    const tw = document.createElement("div");
    tw.className = "bracket-trophy";
    tw.innerHTML = `<div class="bracket-trophy-icon" aria-hidden="true">🏆</div><div class="bracket-trophy-label">Champion</div>`;
    center.appendChild(tw);
  } else {
    center.appendChild(document.createElement("div"));
  }
  canvas.appendChild(center);

  // Bottom half flows up to the centre.
  mkRow(allSF.slice(1), "sfb");
  mkRow(allQF.slice(2), "qfb");
  mkRow(allR16.slice(4), "r16b");
  mkRow(allR32.slice(8), "r32b");

  return canvas;
}

// Vertical connector lines for the folded bracket. Uses offset geometry
// (layout positions, unaffected by any transform) relative to the canvas.
function drawFoldedConnectors(canvas) {
  if (!canvas) return;
  const old = canvas.querySelector(".bracket-conn-svg");
  if (old) old.remove();
  const W = canvas.offsetWidth, H = canvas.offsetHeight;
  if (!W || !H) return;

  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "bracket-conn-svg");
  svg.setAttribute("width", W);
  svg.setAttribute("height", H);
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.style.zIndex = "-1";

  const line = (d) => {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    p.setAttribute("class", "bracket-conn-line");
    svg.appendChild(p);
  };
  const g = (el) => ({
    cx: el.offsetLeft + el.offsetWidth / 2,
    top: el.offsetTop,
    bottom: el.offsetTop + el.offsetHeight,
  });
  const cells = (key) => {
    const row = canvas.querySelector(".vr-" + key);
    return row ? Array.from(row.children) : [];
  };
  const joinDown = (up, down) => {
    for (let k = 0; k < down.length; k++) {
      if (!up[2 * k] || !up[2 * k + 1] || !down[k]) continue;
      const a = g(up[2 * k]), b = g(up[2 * k + 1]), d = g(down[k]);
      const midY = (Math.max(a.bottom, b.bottom) + d.top) / 2;
      line(`M${a.cx},${a.bottom} V${midY}`);
      line(`M${b.cx},${b.bottom} V${midY}`);
      line(`M${a.cx},${midY} H${b.cx}`);
      line(`M${d.cx},${midY} V${d.top}`);
    }
  };
  const joinUp = (low, up) => {
    for (let k = 0; k < up.length; k++) {
      if (!low[2 * k] || !low[2 * k + 1] || !up[k]) continue;
      const a = g(low[2 * k]), b = g(low[2 * k + 1]), u = g(up[k]);
      const midY = (u.bottom + Math.min(a.top, b.top)) / 2;
      line(`M${a.cx},${a.top} V${midY}`);
      line(`M${b.cx},${b.top} V${midY}`);
      line(`M${a.cx},${midY} H${b.cx}`);
      line(`M${u.cx},${midY} V${u.bottom}`);
    }
  };

  joinDown(cells("r32t"), cells("r16t"));
  joinDown(cells("r16t"), cells("qft"));
  joinDown(cells("qft"), cells("sft"));
  joinUp(cells("qfb"), cells("sfb"));
  joinUp(cells("r16b"), cells("qfb"));
  joinUp(cells("r32b"), cells("r16b"));

  // Semifinals into the central final.
  const finalCell = canvas.querySelector(".bracket-vfinalcard");
  const sft = cells("sft")[0], sfb = cells("sfb")[0];
  if (finalCell && sft) {
    const s = g(sft), f = g(finalCell), midY = (s.bottom + f.top) / 2;
    line(`M${s.cx},${s.bottom} V${midY} H${f.cx} V${f.top}`);
  }
  if (finalCell && sfb) {
    const s = g(sfb), f = g(finalCell), midY = (f.bottom + s.top) / 2;
    line(`M${f.cx},${f.bottom} V${midY} H${s.cx} V${s.top}`);
  }

  canvas.insertBefore(svg, canvas.firstChild);
}

// SVG bracket connectors — drawn from measured card positions so they stay
// correct in the mirrored two-sided layout.
let _bracketResizeBound = false;
let _bracketIsMobile = false;

function drawBracketConnectors() {
  const grid = els.bracketView.querySelector(".bracket-two-sided, .bracket");
  if (!grid) return;
  const old = grid.querySelector(".bracket-conn-svg");
  if (old) old.remove();

  const gridRect = grid.getBoundingClientRect();
  if (!gridRect.width || !gridRect.height) return; // hidden / not laid out yet

  const NS = "http://www.w3.org/2000/svg";
  const W = grid.scrollWidth, H = grid.scrollHeight;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "bracket-conn-svg");
  svg.setAttribute("width", W);
  svg.setAttribute("height", H);
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

  const geom = (el) => {
    const r = el.getBoundingClientRect();
    return {
      left: r.left - gridRect.left,
      right: r.right - gridRect.left,
      cy: (r.top + r.bottom) / 2 - gridRect.top,
    };
  };
  const line = (d) => {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    p.setAttribute("class", "bracket-conn-line");
    svg.appendChild(p);
  };
  // Join two feeder cards to one target. side "right": target is right of feeders.
  const join = (f1, f2, target, side) => {
    if (!f1 || !f2 || !target) return;
    const a = geom(f1), b = geom(f2), t = geom(target);
    const x0 = side === "right" ? a.right : a.left;
    const x1 = side === "right" ? t.left : t.right;
    const mid = (x0 + x1) / 2;
    line(`M${x0},${a.cy} H${mid}`);
    line(`M${x0},${b.cy} H${mid}`);
    line(`M${mid},${a.cy} V${b.cy}`);
    line(`M${mid},${t.cy} H${x1}`);
  };
  const cardsOf = (round) => Array.from(round.querySelectorAll(".bracket-matches > .bracket-match"));

  if (grid.classList.contains("bracket-two-sided")) {
    const left = grid.querySelector(".bracket-left");
    const right = grid.querySelector(".bracket-right");
    const center = grid.querySelector(".bracket-center");
    const leftRounds = left ? Array.from(left.querySelectorAll(":scope > .bracket-round")) : [];
    const rightRounds = right ? Array.from(right.querySelectorAll(":scope > .bracket-round")) : [];

    for (let i = 0; i < leftRounds.length - 1; i++) {
      const f = cardsOf(leftRounds[i]), tg = cardsOf(leftRounds[i + 1]);
      for (let k = 0; k < tg.length; k++) join(f[2 * k], f[2 * k + 1], tg[k], "right");
    }
    for (let i = rightRounds.length - 1; i > 0; i--) {
      const f = cardsOf(rightRounds[i]), tg = cardsOf(rightRounds[i - 1]);
      for (let k = 0; k < tg.length; k++) join(f[2 * k], f[2 * k + 1], tg[k], "left");
    }

    // Both semifinals feed the central final.
    const finalCard = center ? center.querySelector(".bracket-center-match .bracket-match") : null;
    const sfLeft = leftRounds.length ? cardsOf(leftRounds[leftRounds.length - 1])[0] : null;
    const sfRight = rightRounds.length ? cardsOf(rightRounds[0])[0] : null;
    if (finalCard && sfLeft) {
      const s = geom(sfLeft), f = geom(finalCard), mid = (s.right + f.left) / 2;
      line(`M${s.right},${s.cy} H${mid} V${f.cy} H${f.left}`);
    }
    if (finalCard && sfRight) {
      const s = geom(sfRight), f = geom(finalCard), mid = (f.right + s.left) / 2;
      line(`M${s.left},${s.cy} H${mid} V${f.cy} H${f.right}`);
    }
  } else {
    const rounds = Array.from(grid.querySelectorAll(":scope > .bracket-round"));
    for (let i = 0; i < rounds.length - 1; i++) {
      const f = cardsOf(rounds[i]), tg = cardsOf(rounds[i + 1]);
      for (let k = 0; k < tg.length; k++) join(f[2 * k], f[2 * k + 1], tg[k], "right");
    }
  }

  grid.insertBefore(svg, grid.firstChild);
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
      <span class="bracket-team-name" title="${team}"><span class="tn-full">${team}</span><span class="tn-abbr">${teamAbbr(team)}</span></span>
      <span class="bracket-score">${score === "" ? "" : score + pen}</span>
    </div>`;

  const mn = matchNumber(m);
  card.innerHTML =
    (mn ? `<button type="button" class="bracket-match-no" title="View match card">M${mn}</button>` : "") +
    `<div class="bracket-teams">` +
      row(t1, !!resolved1, s1, pen1, winner === t1, winner && winner !== t1, !resolved1) +
      `<span class="bracket-vs">vs</span>` +
      row(t2, !!resolved2, s2, pen2, winner === t2, winner && winner !== t2, !resolved2) +
    `</div>` +
    (bracketDate(m) ? `<div class="bracket-date">${bracketDate(m)}</div>` : "");

  const noBtn = card.querySelector(".bracket-match-no");
  if (noBtn) noBtn.addEventListener("click", (e) => { e.stopPropagation(); openMatchCardModal(m); });

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

