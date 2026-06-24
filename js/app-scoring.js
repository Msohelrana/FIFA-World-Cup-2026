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
