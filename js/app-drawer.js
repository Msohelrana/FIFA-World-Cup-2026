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

