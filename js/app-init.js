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
