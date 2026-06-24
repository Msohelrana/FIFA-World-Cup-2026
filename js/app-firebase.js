// ===== Firebase backend config =====
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCNC2IsCGqZjyapHwDD7yH_9FoNeFjurOY",
  authDomain: "wc2026-aaddd.firebaseapp.com",
  projectId: "wc2026-aaddd",
  storageBucket: "wc2026-aaddd.firebasestorage.app",
  messagingSenderId: "689847361298",
  appId: "1:689847361298:web:94be2c7f0b47e74a031dcb",
};
// Admins are identified by email — must match the Firestore security rules.
const ADMIN_EMAILS = ["tpsohel46@gmail.com"];
const FB_COLL = { results: "matchresults", standings: "standingsoverrides", userpicks: "userpicks" };

// Shared Firebase handles (the compat SDK exposes a global `firebase`).
let _fbDb = null, _fbAuth = null;
if (typeof firebase !== "undefined" && firebase.initializeApp) {
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    _fbDb = firebase.firestore();
    // Offline persistence (IndexedDB): onSnapshot then serves from the local
    // cache and pulls only *changed* docs from the server, so repeat loads cost
    // ~no reads. Must run before any other Firestore use. Rejects harmlessly if
    // multiple tabs are open or the browser doesn't support it.
    try { _fbDb.enablePersistence({ synchronizeTabs: true }).catch(() => {}); }
    catch { /* persistence unsupported — falls back to network reads */ }
    _fbAuth = firebase.auth();
    _fbAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});
  } catch (e) {
    console.warn("Firebase init failed — local-only mode:", e.message || e);
  }
}
const _fbServerTime = () => firebase.firestore.FieldValue.serverTimestamp();
const _fbIso = (t) => (t && t.toDate) ? t.toDate().toISOString() : "";

// ===== Results + standings sync (Firestore) =====
const appwriteSync = (() => {
  if (!_fbDb) {
    console.warn("Firebase not available — running in local-only mode.");
    return {
      available: false,
      scheduleMatch() {}, scheduleStandings() {},
      deleteMatch() {}, deleteStandings() {},
      bootstrap: async () => null, isConnected: () => false,
    };
  }
  const db = _fbDb;
  const RESULTS = FB_COLL.results, STANDINGS = FB_COLL.standings;

  // matchIds contain spaces/slashes; Firestore doc IDs can't contain "/". Hash to a safe id.
  function safeDocId(matchId) {
    let h1 = 5381, h2 = 52711;
    for (let i = 0; i < matchId.length; i++) {
      const c = matchId.charCodeAt(i);
      h1 = ((h1 << 5) + h1 + c) >>> 0;
      h2 = ((h2 << 5) - h2 + c) >>> 0;
    }
    return ("m" + h1.toString(36) + h2.toString(36)).slice(0, 36);
  }

  function docToResult(data) {
    const r = {};
    if (data.score1 !== null && data.score1 !== undefined) r.score1 = data.score1;
    if (data.score2 !== null && data.score2 !== undefined) r.score2 = data.score2;
    if (data.pen1 !== null && data.pen1 !== undefined) r.pen1 = data.pen1;
    if (data.pen2 !== null && data.pen2 !== undefined) r.pen2 = data.pen2;
    if (Array.isArray(data.scorers) && data.scorers.length) r.scorers = data.scorers;
    if (Array.isArray(data.cards) && data.cards.length) r.cards = data.cards;
    if (data.auto) r.auto = true;   // auto-archived API value (not hand-entered)
    return sanitizeResult(r);
  }

  // Firestore rejects `undefined` anywhere — a JSON round-trip drops those keys.
  const clean = (arr) => JSON.parse(JSON.stringify(arr || []));
  function resultToPayload(matchId, r) {
    return {
      matchId,
      score1: r.score1 ?? null,
      score2: r.score2 ?? null,
      pen1: r.pen1 ?? null,
      pen2: r.pen2 ?? null,
      scorers: clean((Array.isArray(r.scorers) ? r.scorers : []).filter(s => s && !s.card)),
      cards: clean(Array.isArray(r.cards) ? r.cards : []),
      auto: r.auto === true,   // true = auto-archived API value; false = hand-entered
      updatedAt: _fbServerTime(),
    };
  }

  const pendingMatchTimers = new Map();
  const pendingStandingTimers = new Map();
  const DEBOUNCE_MS = 400;

  async function pushMatch(matchId) {
    const r = state.results[matchId];
    const ref = db.collection(RESULTS).doc(safeDocId(matchId));
    try {
      if (!r) await ref.delete();
      else await ref.set(resultToPayload(matchId, r));
    } catch (err) { console.warn("Firestore match write failed:", err.message || err); }
  }

  async function pushStandings(groupLetter) {
    const order = state.standingsOverride[groupLetter];
    const ref = db.collection(STANDINGS).doc(groupLetter);
    try {
      if (!Array.isArray(order) || order.length === 0) await ref.delete();
      else await ref.set({ groupLetter, order, updatedAt: _fbServerTime() });
    } catch (err) { console.warn("Firestore standings write failed:", err.message || err); }
  }

  function scheduleMatch(matchId) {
    clearTimeout(pendingMatchTimers.get(matchId));
    pendingMatchTimers.set(matchId, setTimeout(() => { pendingMatchTimers.delete(matchId); pushMatch(matchId); }, DEBOUNCE_MS));
  }
  function scheduleStandings(groupLetter) {
    clearTimeout(pendingStandingTimers.get(groupLetter));
    pendingStandingTimers.set(groupLetter, setTimeout(() => { pendingStandingTimers.delete(groupLetter); pushStandings(groupLetter); }, DEBOUNCE_MS));
  }

  // Lightweight version probe: per-collection doc count + newest updatedAt, so a
  // fresh cache can skip the full bootstrap.
  async function collMeta(coll) {
    let total = 0, latest = "";
    try { total = (await db.collection(coll).count().get()).data().count; }
    catch { total = (await db.collection(coll).get()).size; }
    try {
      const snap = await db.collection(coll).orderBy("updatedAt", "desc").limit(1).get();
      if (!snap.empty) latest = _fbIso(snap.docs[0].get("updatedAt"));
    } catch { /* updatedAt field not present yet */ }
    return { total, latest };
  }
  async function checkRemoteVersion() {
    try {
      const [res, ovr] = await Promise.all([collMeta(RESULTS), collMeta(STANDINGS)]);
      return { resultsTotal: res.total, overridesTotal: ovr.total, latestResultUpdate: res.latest, latestStandingsUpdate: ovr.latest };
    } catch (err) { console.warn("Firestore version check failed:", err.message || err); return null; }
  }

  async function bootstrap() {
    try {
      const [resSnap, ovrSnap] = await Promise.all([db.collection(RESULTS).get(), db.collection(STANDINGS).get()]);
      const results = {}, overrides = {};
      let maxR = "", maxS = "";
      resSnap.forEach(doc => {
        const data = doc.data();
        const r = docToResult(data);
        if (data.matchId && Object.keys(r).length > 0) results[data.matchId] = r;
        const iso = _fbIso(data.updatedAt); if (iso > maxR) maxR = iso;
      });
      ovrSnap.forEach(doc => {
        const data = doc.data();
        if (data.groupLetter && Array.isArray(data.order)) overrides[data.groupLetter] = data.order;
        const iso = _fbIso(data.updatedAt); if (iso > maxS) maxS = iso;
      });
      return { results, overrides, meta: { resultsTotal: resSnap.size, overridesTotal: ovrSnap.size, latestResultUpdate: maxR, latestStandingsUpdate: maxS } };
    } catch (err) { console.warn("Firestore bootstrap failed:", err.message || err); return null; }
  }

  function subscribe() {
    let seededResults = false, seededStandings = false;
    db.collection(RESULTS).onSnapshot((snap) => {
      // First *server* load doubles as the seed: if the server is empty but this
      // (admin) device has local results, upload them once. Wait for a non-cache
      // snapshot so the offline cache's empty first emit doesn't trigger it.
      if (!seededResults && !snap.metadata.fromCache) {
        seededResults = true;
        if (snap.empty && Object.keys(state.results).length > 0) {
          for (const mid of Object.keys(state.results)) scheduleMatch(mid);
        }
      }
      let changed = false;
      snap.docChanges().forEach((ch) => {
        const data = ch.doc.data();
        const mid = data.matchId;
        if (!mid) return;
        const iso = _fbIso(data.updatedAt);
        if (ch.type === "removed") {
          if (mid in state.results) { delete state.results[mid]; changed = true; }
        } else {
          const newR = docToResult(data);
          if (JSON.stringify(state.results[mid]) === JSON.stringify(newR)) { bumpCacheVersionFromEvent("results", { $updatedAt: iso }); return; }
          state.results[mid] = newR; changed = true;
        }
        bumpCacheVersionFromEvent("results", { $updatedAt: iso });
      });
      if (changed) { saveResults(); rerenderActive(); }
    }, (err) => console.warn("Firestore results subscribe failed:", err.message || err));

    db.collection(STANDINGS).onSnapshot((snap) => {
      if (!seededStandings && !snap.metadata.fromCache) {
        seededStandings = true;
        if (snap.empty && Object.keys(state.standingsOverride).length > 0) {
          for (const g of Object.keys(state.standingsOverride)) scheduleStandings(g);
        }
      }
      let changed = false;
      snap.docChanges().forEach((ch) => {
        const data = ch.doc.data();
        const g = data.groupLetter;
        if (!g) return;
        const iso = _fbIso(data.updatedAt);
        if (ch.type === "removed") {
          if (g in state.standingsOverride) { delete state.standingsOverride[g]; changed = true; }
        } else if (Array.isArray(data.order)) {
          if (JSON.stringify(state.standingsOverride[g]) === JSON.stringify(data.order)) { bumpCacheVersionFromEvent("standings", { $updatedAt: iso }); return; }
          state.standingsOverride[g] = data.order; changed = true;
        }
        bumpCacheVersionFromEvent("standings", { $updatedAt: iso });
      });
      if (changed) { saveStandingsOverride(); rerenderActive(); }
    }, (err) => console.warn("Firestore standings subscribe failed:", err.message || err));
  }

  return {
    available: true,
    scheduleMatch, scheduleStandings,
    deleteMatch: (m) => pushMatch(m),
    deleteStandings: (g) => pushStandings(g),
    bootstrap, checkRemoteVersion, subscribe,
  };
})();

// ===== User auth (Firebase Auth) =====
const appwriteAuth = (() => {
  if (!_fbAuth) {
    return {
      available: false,
      getCurrent: async () => null,
      signUp: async () => { throw new Error("Auth unavailable"); },
      logIn: async () => { throw new Error("Auth unavailable"); },
      logOut: async () => {},
    };
  }
  const auth = _fbAuth;
  const toUser = (u) => u ? { id: u.uid, name: u.displayName || u.email, email: u.email, labels: [] } : null;

  async function getCurrent() {
    const u = auth.currentUser || await new Promise((resolve) => {
      const unsub = auth.onAuthStateChanged((usr) => { unsub(); resolve(usr); }, () => resolve(null));
    });
    return toUser(u);
  }
  async function signUp(email, password, name) {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    if (name && cred.user) { try { await cred.user.updateProfile({ displayName: name }); } catch { /* non-fatal */ } }
    return toUser(auth.currentUser);
  }
  async function logIn(email, password) {
    await auth.signInWithEmailAndPassword(email, password);
    return toUser(auth.currentUser);
  }
  async function logOut() { try { await auth.signOut(); } catch { /* ignore */ } }
  async function updatePassword(newPassword, oldPassword) {
    const u = auth.currentUser;
    if (!u) throw new Error("Not signed in");
    try {
      const cred = firebase.auth.EmailAuthProvider.credential(u.email, oldPassword);
      await u.reauthenticateWithCredential(cred);
    } catch { throw new Error("Current password is incorrect"); }
    await u.updatePassword(newPassword);
  }
  return { available: true, getCurrent, signUp, logIn, logOut, updatePassword };
})();

// ===== Compact picks encoding (fits 104 matches in < 1 KB) =====
// Format: comma-separated tokens, one per fixture in FIXTURES order.
//   ""       no pick
//   "2-1"    group/KO regulation prediction
//   "1-1p1"  KO tied prediction with PK winner = team1 (or p2 = team2)
// Numbers are 0-99; pkWinner is "1" or "2" or absent.
function encodeMatchPicks(picksObj) {
  const tokens = FIXTURES.map(m => {
    const p = picksObj[matchId(m)];
    if (!p || p.score1 === undefined || p.score2 === undefined) return "";
    let t = `${p.score1}-${p.score2}`;
    if (p.pkWinner === 1 || p.pkWinner === 2) t += `p${p.pkWinner}`;
    return t;
  });
  return tokens.join(",");
}
function decodeMatchPicks(str) {
  const out = {};
  if (typeof str !== "string" || !str) return out;
  const tokens = str.split(",");
  for (let i = 0; i < FIXTURES.length && i < tokens.length; i++) {
    const tok = tokens[i];
    if (!tok) continue;
    const mr = tok.match(/^(\d{1,2})-(\d{1,2})(?:p([12]))?$/);
    if (!mr) continue;
    const m = FIXTURES[i];
    out[matchId(m)] = {
      score1: parseInt(mr[1], 10),
      score2: parseInt(mr[2], 10),
      ...(mr[3] ? { pkWinner: parseInt(mr[3], 10) } : {}),
    };
  }
  return out;
}

// ===== User picks server sync (Firestore) =====
const userPicksSync = (() => {
  if (!_fbDb) {
    return { available: false, saveOwn: async () => {}, fetchOwn: async () => null, fetchAll: async () => [], subscribe: () => {} };
  }
  const db = _fbDb;
  const COLL = FB_COLL.userpicks;
  let pendingSaveTimer = null;
  const SAVE_DEBOUNCE_MS = 600;

  const rowFromDoc = (data) => ({
    userId: data.userId,
    userName: data.userName,
    picks: decodeMatchPicks(data.picks || ""),
    firstSubmittedAt: data.firstSubmittedAt || "",
    totalPicks: data.totalPicks || 0,
  });

  async function saveOwn() {
    if (!state.currentUser) return;
    if (pendingSaveTimer) clearTimeout(pendingSaveTimer);
    pendingSaveTimer = setTimeout(() => doSaveOwn().catch(err => console.warn("User picks save failed:", err.message || err)), SAVE_DEBOUNCE_MS);
  }
  async function doSaveOwn() {
    if (!state.currentUser) return;
    const uid = state.currentUser.id;
    if (!state.currentUser.firstSubmittedAt) state.currentUser.firstSubmittedAt = new Date().toISOString();

    // A kicked-off match's pick is final. Never let this device overwrite the
    // server's existing pick for a locked match (e.g. via the "use device"
    // merge, or a stale second device). Merge the server's locked picks back in
    // before saving. Only needed once matches start locking.
    let picks = state.matchPicks;
    if (FIXTURES.some(m => isMatchLocked(m))) {
      try {
        const snap = await db.collection(COLL).doc(uid).get();
        if (snap.exists) {
          const serverPicks = decodeMatchPicks(snap.data().picks || "");
          picks = { ...state.matchPicks };
          for (const m of FIXTURES) {
            const id = matchId(m);
            if (isMatchLocked(m) && serverPicks[id]) picks[id] = serverPicks[id];
          }
        }
      } catch { /* read failed — fall back to device picks */ }
    }

    const payload = {
      userId: uid,
      userName: state.currentUser.name,
      picks: encodeMatchPicks(picks),
      firstSubmittedAt: state.currentUser.firstSubmittedAt,
      totalPicks: Object.keys(picks).filter(id => {
        const p = picks[id];
        return p && p.score1 !== undefined && p.score2 !== undefined;
      }).length,
      updatedAt: _fbServerTime(),
    };
    // doc id = uid; Firestore rules require data.userId == auth.uid for write.
    await db.collection(COLL).doc(uid).set(payload, { merge: true });
  }

  async function fetchAll() {
    const all = [];
    try {
      const snap = await db.collection(COLL).get();
      snap.forEach(doc => {
        const row = rowFromDoc(doc.data());
        all.push(row);
        if (state.currentUser && row.userId === state.currentUser.id && row.firstSubmittedAt) {
          state.currentUser.firstSubmittedAt = row.firstSubmittedAt;
        }
      });
    } catch (err) { console.warn("User picks fetchAll failed:", err.message || err); }
    return all;
  }

  async function fetchOwn() {
    if (!state.currentUser) return null;
    try {
      const doc = await db.collection(COLL).doc(state.currentUser.id).get();
      if (!doc.exists) return null;
      const row = rowFromDoc(doc.data());
      if (row.firstSubmittedAt) state.currentUser.firstSubmittedAt = row.firstSubmittedAt;
      return row;
    } catch (err) { console.warn("User picks fetchOwn failed:", err.message || err); return null; }
  }

  function subscribe() {
    const rerender = () => {
      if (state.view === "picks") renderPicks();
      else if (state.view === "leaderboard") renderLeaderboardView();
      refreshTop5Drawer();   // keep the Top-5 drawer live (no-op if closed)
    };
    // includeMetadataChanges so we also get the cache→server confirmation even
    // when the doc set is unchanged (warm cache).
    db.collection(COLL).onSnapshot({ includeMetadataChanges: true }, (snap) => {
      snap.docChanges().forEach((ch) => {
        const data = ch.doc.data();
        const idx = state.leaderboardUsers.findIndex(u => u.userId === data.userId);
        if (ch.type === "removed") { if (idx >= 0) state.leaderboardUsers.splice(idx, 1); }
        else { const row = rowFromDoc(data); if (idx >= 0) state.leaderboardUsers[idx] = row; else state.leaderboardUsers.push(row); }
      });
      // The first snapshot can be served from the local cache holding only the
      // current user's doc — don't render the partial board as if it were full.
      // Ready once the server confirms (!fromCache) OR the cache already has
      // more than just the current user.
      if (!snap.metadata.fromCache || state.leaderboardUsers.length > 1) state.leaderboardReady = true;
      rerender();
    }, (err) => { console.warn("User picks subscribe failed:", err.message || err); state.leaderboardReady = true; rerender(); });
    // Offline / very slow network: don't spin forever — show whatever we have.
    setTimeout(() => { if (!state.leaderboardReady) { state.leaderboardReady = true; rerender(); } }, 6000);
  }

  // Admin: write another user's picks (e.g. backfilling a finished match's
  // prediction). Requires the Firestore rules to allow admin writes to userpicks.
  async function saveForUser(userId, userName, picksObj, firstSubmittedAt) {
    const totalPicks = Object.keys(picksObj).filter(id => {
      const p = picksObj[id];
      return p && p.score1 !== undefined && p.score2 !== undefined;
    }).length;
    await db.collection(COLL).doc(userId).set({
      userId,
      userName,
      picks: encodeMatchPicks(picksObj),
      firstSubmittedAt: firstSubmittedAt || new Date().toISOString(),
      totalPicks,
      updatedAt: _fbServerTime(),
    }, { merge: true });
  }

  return { available: true, saveOwn, fetchOwn, fetchAll, subscribe, saveForUser };
})();

// Global Top-5 leaderboard drawer button (hero header) — shown on every tab when
// the backend is available. Wired here, after userPicksSync is defined.
if (els.top5Btn && userPicksSync.available) {
  els.top5Btn.hidden = false;
  els.top5Btn.addEventListener("click", openTop5Drawer);
}

