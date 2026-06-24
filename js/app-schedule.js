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

