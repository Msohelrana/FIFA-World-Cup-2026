// FIFA WC 2026 — Live scores + scorers overlay (unofficial FIFA API)
//
// api.fifa.com is NOT an official public API: FIFA can change or block it at
// any time. This module is therefore a read-only display overlay:
//   - it NEVER writes into state.results, the results localStorage key, or
//     Appwrite — manual admin entry stays the canonical store, so the whole
//     site keeps working exactly as before if this API disappears.
// Merge rules (implemented in app.js getResult):
//   - while a match is live, the FIFA feed wins (real-time score + scorers);
//   - after full time, a manual admin entry takes priority over the API.

const liveScores = (() => {
  const API = "https://api.fifa.com/api/v3";
  const ID_COMPETITION = "17";  // FIFA World Cup
  const ID_SEASON = "285023";   // 2026 edition

  // MatchStatus codes (observed): 0 = finished, 1 = scheduled, 3 = live
  const STATUS_FINISHED = 0;
  const STATUS_LIVE = 3;

  // Timeline event types that put a goal on the board:
  // 0 = goal, 34 = own goal, 39 = free-kick goal, 41 = penalty goal
  const GOAL_TYPES = new Set([0, 34, 39, 41]);
  const TYPE_OWN_GOAL = 34;
  const PERIOD_SHOOTOUT = 11; // shootout kicks are not goal-scorer entries

  // Card event types: 2 = yellow, 3 = straight red, 4 = second yellow → red.
  // (Type 71 is a bare "Red card given" notice with no player/team — skipped.)
  const CARD_TYPES = new Map([[2, "yellow"], [3, "red"], [4, "yellowred"]]);

  // FIFA's English team names → names used in fixtures.js
  const TEAM_ALIASES = {
    "Korea Republic": "South Korea",
    "USA": "United States",
    "IR Iran": "Iran",
    "Côte d'Ivoire": "Ivory Coast",
    "Cabo Verde": "Cape Verde",
    "Congo DR": "DR Congo",
  };

  const POLL_LIVE_MS = 45 * 1000;        // match actively in play
  const POLL_PAUSE_MS = 90 * 1000;       // all live matches in HT or ET break
  const POLL_IDLE_MS = 10 * 60 * 1000;   // nothing live right now
  const TIMELINE_RECENT_MS = 4 * 36e5;   // fetch scorers for matches < 4h old
  const KICKOFF_TOLERANCE_MS = 90 * 60 * 1000;

  // app matchId → {score1, score2, pen1, pen2, scorers, cards, isLive, matchTime}
  const overlay = new Map();

  // Finished matches' scorers are immutable — cache them across reloads so a
  // page load doesn't refetch every recent timeline.
  const CACHE_KEY = "wc2026_live_scorer_cache";
  let scorerCache = {};
  try { scorerCache = JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch { /* fresh start */ }
  function persistScorerCache() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(scorerCache)); } catch { /* quota — cache is optional */ }
  }

  let onUpdate = null;
  let timer = null;
  let lastById = new Map(); // matchId → serialized rec, for change detection

  // FIFA's official group standing position (1-4 within each group), keyed by
  // local team name. Used only as the last-resort standings tiebreaker: it
  // resolves "drawing of lots" ties the app can't compute and backstops the
  // fair-play tiebreaker when a finished match's card timeline isn't loaded.
  let standingPos = new Map();

  // Local team name → FIFA IdTeam, built from the calendar (group-stage matches
  // carry real team names). Powers on-demand squad / team-info lookups shown in
  // the prediction view. Squad + team payloads are cached per team.
  const teamIdByName = new Map();
  const squadCache = new Map();    // IdTeam → normalized players array
  const teamInfoCache = new Map(); // IdTeam → normalized team-info object
  const formCache = new Map();     // IdTeam → last-5 results array (60s TTL)
  const POSITION_LABELS = { 0: "Goalkeeper", 1: "Defender", 2: "Midfielder", 3: "Forward" };

  const localName = (n) => TEAM_ALIASES[n] || n;
  const desc1 = (a) => (Array.isArray(a) && a[0] && a[0].Description) ? a[0].Description : null;

  function sideName(side) {
    return (side && Array.isArray(side.TeamName) && side.TeamName[0])
      ? localName(side.TeamName[0].Description)
      : null;
  }

  // "C1" → "1C", "A2" → "2A", "3rd A/B/C/D/F" → "3ABCDF"
  // (FIFA's PlaceHolderA/B codes for not-yet-decided knockout slots)
  function placeholderCode(label) {
    if (!label) return null;
    let m = /^([A-L])1$/.exec(label);
    if (m) return "1" + m[1];
    m = /^([A-L])2$/.exec(label);
    if (m) return "2" + m[1];
    m = /^3rd ([A-Z/]+)$/.exec(label);
    if (m) return "3" + m[1].replace(/\//g, "");
    return null;
  }

  // Map one FIFA match onto a local fixture. Kickoff time is the primary key
  // (fixtures store ET, FIFA sends UTC — fixtureToUTC aligns them exactly);
  // simultaneous kickoffs are disambiguated by team names or placeholder
  // codes. Returns { fixture, flipped } or null.
  function findFixture(fm, ko) {
    const kickoff = Date.parse(fm.Date);
    const home = sideName(fm.Home);
    const away = sideName(fm.Away);

    const candidates = FIXTURES.filter(
      (m) => Math.abs(fixtureToUTC(m).getTime() - kickoff) <= KICKOFF_TOLERANCE_MS
    );
    if (candidates.length === 0) return null;

    if (home && away) {
      for (const m of candidates) {
        const r = resolveMatchTeams(m, ko);
        const t1 = r.team1 || m.team1;
        const t2 = r.team2 || m.team2;
        if (t1 === home && t2 === away) return { fixture: m, flipped: false };
        if (t1 === away && t2 === home) return { fixture: m, flipped: true };
      }
    }
    if (fm.PlaceHolderA && fm.PlaceHolderB) {
      for (const m of candidates) {
        if (placeholderCode(m.team1) === fm.PlaceHolderA &&
          placeholderCode(m.team2) === fm.PlaceHolderB) {
          return { fixture: m, flipped: false };
        }
      }
    }
    // Unique kickoff slot → safe even without resolvable names
    if (candidates.length === 1) return { fixture: candidates[0], flipped: false };
    return null;
  }

  // Timeline goal events → app scorer shape [{team: 1|2, name, minute}]
  function parseScorers(timeline, t1, t2) {
    const out = [];
    for (const ev of timeline.Event || []) {
      if (!GOAL_TYPES.has(ev.Type)) continue;
      if (ev.Period === PERIOD_SHOOTOUT) continue;
      const desc = (Array.isArray(ev.EventDescription) && ev.EventDescription[0])
        ? ev.EventDescription[0].Description : "";
      // "Julian QUINONES (Mexico) scores!!" → name + team
      const m = /^(.+?)\s*\(([^)]+)\)/.exec(desc);
      if (!m) continue;
      let name = m[1].replace(/^own goal by\s+/i, "").trim();
      const team = localName(m[2].trim());
      let side = team === t1 ? 1 : team === t2 ? 2 : 0;
      if (!side) continue;
      if (ev.Type === TYPE_OWN_GOAL) {
        side = side === 1 ? 2 : 1; // counts for the opponent
        name += " (OG)";
      }
      out.push({ team: side, name, minute: (ev.MatchMinute || "").replace(/'/g, "") });
    }
    return out;
  }

  // Timeline card events → [{team: 1|2, name, minute, card: "yellow"|"red"|"yellowred"}]
  function parseCards(timeline, t1, t2) {
    const out = [];
    for (const ev of timeline.Event || []) {
      const card = CARD_TYPES.get(ev.Type);
      if (!card) continue;
      const desc = (Array.isArray(ev.EventDescription) && ev.EventDescription[0])
        ? ev.EventDescription[0].Description : "";
      // "SITHOLE (South Africa) is sent off!" → name + team
      const m = /^(.+?)\s*\(([^)]+)\)/.exec(desc);
      if (!m) continue;
      const team = localName(m[2].trim());
      const side = team === t1 ? 1 : team === t2 ? 2 : 0;
      if (!side) continue;
      out.push({ team: side, name: m[1].trim(), minute: (ev.MatchMinute || "").replace(/'/g, ""), card });
    }
    return out;
  }

  async function fetchJSON(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("FIFA API HTTP " + res.status);
    return res.json();
  }

  // Returns { kickoff, finished, isLive } for a calendar match.
  // Treat "started and not finished" as live even if the status code is
  // unexpected — losing the live flag is worse than a false positive.
  function liveness(fm, now) {
    const kickoff = Date.parse(fm.Date);
    const finished = fm.MatchStatus === STATUS_FINISHED;
    const isLive = !finished &&
      (fm.MatchStatus === STATUS_LIVE ||
        (now >= kickoff && now - kickoff < 3.75 * 36e5));
    return { kickoff, finished, isLive };
  }

  // Period codes used by the live endpoint (community-documented):
  // 3 = 1st half, 4 = half-time, 5 = 2nd half,
  // 6 = ET 1st half, 7 = ET break, 8 = ET 2nd half, 9 = penalty shootout.
  // Unknown/missing codes fall back to the plain minute display.
  function liveChipLabel(period, matchTime) {
    switch (period) {
      case 4: return "HT";
      case 7: return "ET break";
      case 9: return "Pens";
      case 6:
      case 8: return matchTime ? `ET ${matchTime}` : "ET";
      default: return matchTime ? `LIVE ${matchTime}` : "LIVE";
    }
  }

  // The full calendar (104 matches, heavy) is cached and refreshed at the idle
  // cadence; live polls reuse it and get fresh scores/phases from the small
  // /live/football/now payload instead.
  let calMatches = null;
  let calAt = 0;
  const CALENDAR_TTL_MS = POLL_IDLE_MS;

  async function fetchCalendar() {
    const data = await fetchJSON(
      `${API}/calendar/matches?idCompetition=${ID_COMPETITION}&idSeason=${ID_SEASON}&language=en&count=500`
    );
    calMatches = data.Results || [];
    calAt = Date.now();
    // Refresh the official group standings on the same cadence (and whenever a
    // finished match forces a calendar refetch). Optional — failure leaves the
    // app on its own computed order.
    const groupMatch = calMatches.find((m) => m.GroupName && m.GroupName.length && m.IdStage);
    if (groupMatch) {
      try { await fetchStandings(groupMatch.IdStage); } catch { /* tiebreaker is optional */ }
    }
    // Index every real team's IdTeam for squad / team-info lookups.
    for (const fm of calMatches) {
      for (const side of [fm.Home, fm.Away]) {
        const nm = sideName(side);
        if (nm && side && side.IdTeam) teamIdByName.set(nm, side.IdTeam);
      }
    }
    return calMatches;
  }

  async function ensureCalendar() { if (!calMatches) await fetchCalendar(); }

  // Squad list (normalized) for a team, by local name. Each player carries the
  // stats the squad payload exposes — goals, cards, matches, position, etc. —
  // so the player-detail view needs no further request.
  async function getSquadByName(name) {
    await ensureCalendar();
    const id = teamIdByName.get(name);
    if (!id) return null;
    if (squadCache.has(id)) return squadCache.get(id);
    const d = await fetchJSON(
      `${API}/teams/${id}/squad?idCompetition=${ID_COMPETITION}&idSeason=${ID_SEASON}&language=en`
    );
    const players = (d.Players || []).map((p) => ({
      id: p.IdPlayer,
      name: desc1(p.PlayerName) || desc1(p.ShortName) || "Unknown",
      num: p.JerseyNum,
      position: desc1(p.PositionLocalized) || POSITION_LABELS[p.Position] || "",
      posCode: p.Position,
      matches: p.MatchesPlayed,
      goals: p.Goals,
      yellow: p.YellowCards,
      red: p.RedCards,
      dob: p.BirthDate || null,
      height: p.Height || null,
      weight: p.Weight || null,
      // PlayerPicture is an object {PictureUrl}; fall back to the flat fields.
      photo: (p.PlayerPicture && p.PlayerPicture.PictureUrl) || p.PictureUrl || p.ThumbnailUrl || null,
    }));
    squadCache.set(id, players);
    return players;
  }

  async function getTeamInfoByName(name) {
    await ensureCalendar();
    const id = teamIdByName.get(name);
    if (!id) return null;
    if (teamInfoCache.has(id)) return teamInfoCache.get(id);
    const t = await fetchJSON(`${API}/teams/${id}?language=en`);
    const info = {
      name: desc1(t.Name) || name,
      abbr: t.Abbreviation || null,
      confederation: t.IdConfederation || null,
      city: t.City || null,
      country: t.IdCountry || null,
      founded: t.FoundationYear || null,
    };
    teamInfoCache.set(id, info);
    return info;
  }

  // The team's last 5 finished matches across all competitions (form). The
  // unscoped idTeam calendar query spans competitions; a trailing date window
  // keeps the payload small. Cached briefly so it can refresh as results land.
  async function getTeamFormByName(name) {
    await ensureCalendar();
    const id = teamIdByName.get(name);
    if (!id) return null;
    const hit = formCache.get(id);
    if (hit && Date.now() - hit.at < 60 * 1000) return hit.form;
    // FIFA's calendar rejects ISO timestamps with milliseconds — strip them.
    const isoNoMs = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
    const from = isoNoMs(Date.now() - 540 * 864e5);
    const to = isoNoMs(Date.now() + 2 * 864e5);
    const d = await fetchJSON(
      `${API}/calendar/matches?idTeam=${id}&from=${from}&to=${to}&count=80&language=en`
    );
    const form = (d.Results || [])
      .filter((m) => m.MatchStatus === STATUS_FINISHED &&
        m.HomeTeamScore !== null && m.HomeTeamScore !== undefined &&
        m.AwayTeamScore !== null && m.AwayTeamScore !== undefined)
      .sort((a, b) => (b.Date || "").localeCompare(a.Date || ""))
      .slice(0, 5)
      .map((m) => {
        const homeIsTeam = m.Home && m.Home.IdTeam === id;
        const gf = homeIsTeam ? m.HomeTeamScore : m.AwayTeamScore;
        const ga = homeIsTeam ? m.AwayTeamScore : m.HomeTeamScore;
        return {
          date: (m.Date || "").slice(0, 10),
          opponent: sideName(homeIsTeam ? m.Away : m.Home) || "?",
          gf, ga,
          result: gf > ga ? "W" : gf < ga ? "L" : "D",
          home: homeIsTeam,
          competition: desc1(m.CompetitionName) || "",
        };
      });
    formCache.set(id, { at: Date.now(), form });
    return form;
  }

  async function fetchStandings(stageId) {
    const d = await fetchJSON(
      `${API}/calendar/${ID_COMPETITION}/${ID_SEASON}/${stageId}/standing?language=en`
    );
    const next = new Map();
    for (const r of d.Results || []) {
      const desc = r.Team && Array.isArray(r.Team.Name) && r.Team.Name[0] && r.Team.Name[0].Description;
      if (desc && r.Position) next.set(localName(desc), r.Position);
    }
    if (next.size) standingPos = next; // keep the last good map if a poll returns empty
  }

  // Live timelines are heavier than scores: refetch them only every other
  // 30s tick (or immediately when a score changes), reusing the last parse
  // in between. IdMatch → {scorers, cards}.
  const liveTL = new Map();
  // matchId → { score1, score2, count } — tracks a score decrease that needs
  // consecutive confirmation before being applied (guards against stale-data
  // flicker while still allowing genuine VAR cancellations through).
  const pendingScoreDown = new Map();
  let pollCount = 0;

  // One poll: calendar (cached), then timelines only for live matches +
  // recently-finished ones not yet cached.
  async function poll() {
    const now = Date.now();
    const tlTick = (++pollCount) % 2 === 1; // timelines on every other poll
    const prevOverlay = new Map(overlay);
    let matches = (calMatches && now - calAt < CALENDAR_TTL_MS)
      ? calMatches
      : await fetchCalendar();
    const ko = getKnockoutAssignments();
    let anyActiveLive = false;
    let anyPausedLive = false;
    let nextKickoff = Infinity;
    let cacheDirty = false;

    // While something is in play, one extra request to the live endpoint
    // gives the match phase (HT/ET/pens) and the freshest score/clock.
    const phaseByMatch = new Map();
    if (matches.some((fm) => liveness(fm, now).isLive)) {
      try {
        const ld = await fetchJSON(`${API}/live/football/now?language=en`);
        for (const lm of ld.Results || []) {
          phaseByMatch.set(lm.IdMatch, {
            period: lm.Period,
            matchTime: lm.MatchTime || "",
            hs: lm.HomeTeam ? lm.HomeTeam.Score : (lm.Home && lm.Home.Score),
            as: lm.AwayTeam ? lm.AwayTeam.Score : (lm.Away && lm.Away.Score),
          });
        }
      } catch { /* phase labels are optional — minute fallback still works */ }
      // A match the cached calendar thinks is live but the live feed no longer
      // lists has likely just finished — refresh the calendar for final data.
      if (now - calAt > POLL_LIVE_MS &&
        matches.some((fm) => liveness(fm, now).isLive && !phaseByMatch.has(fm.IdMatch))) {
        matches = await fetchCalendar();
      }
    }

    overlay.clear();
    const timelineJobs = [];

    for (const fm of matches) {
      const { kickoff, finished, isLive } = liveness(fm, now);
      if (!finished && !isLive) {
        if (kickoff > now) nextKickoff = Math.min(nextKickoff, kickoff);
        continue;
      }
      const lp = isLive ? phaseByMatch.get(fm.IdMatch) : null;
      const isPaused = isLive && lp && (lp.period === 4 || lp.period === 7);
      if (isLive) {
        if (isPaused) anyPausedLive = true;
        else anyActiveLive = true;
      }

      const hit = findFixture(fm, ko);
      if (!hit) continue;
      const { fixture, flipped } = hit;


      let hs = fm.HomeTeamScore ?? (fm.Home && fm.Home.Score);
      let as_ = fm.AwayTeamScore ?? (fm.Away && fm.Away.Score);
      if (lp && lp.hs !== null && lp.hs !== undefined) hs = lp.hs;
      if (lp && lp.as !== null && lp.as !== undefined) as_ = lp.as;
      if (hs === null || hs === undefined || as_ === null || as_ === undefined) continue;

      const rec = {
        score1: flipped ? as_ : hs,
        score2: flipped ? hs : as_,
        isLive,
        matchTime: (lp && lp.matchTime) || fm.MatchTime || "",
        // Identifiers for the on-demand match-stats endpoint (fdh-api)
        statsId: (fm.Properties && fm.Properties.IdIFES) || null,
        idTeam1: flipped ? (fm.Away && fm.Away.IdTeam) : (fm.Home && fm.Home.IdTeam),
        idTeam2: flipped ? (fm.Home && fm.Home.IdTeam) : (fm.Away && fm.Away.IdTeam),
      };
      if (isLive) rec.liveLabel = liveChipLabel(lp ? lp.period : undefined, rec.matchTime);
      const hp = fm.HomeTeamPenaltyScore, ap = fm.AwayTeamPenaltyScore;
      if (hp !== null && hp !== undefined && ap !== null && ap !== undefined && (hp || ap)) {
        rec.pen1 = flipped ? ap : hp;
        rec.pen2 = flipped ? hp : ap;
      }

      // Score-decrease guard: require 2 consecutive polls showing the same
      // lower score before applying it. This filters stale-data flicker
      // (alternating scores) while still passing through genuine VAR
      // cancellations (which persist across polls).
      if (isLive) {
        const mid = matchId(fixture);
        const prev = prevOverlay.get(mid);
        if (prev && (rec.score1 < prev.score1 || rec.score2 < prev.score2)) {
          const pend = pendingScoreDown.get(mid);
          if (pend && pend.score1 === rec.score1 && pend.score2 === rec.score2) {
            pend.count++;
            if (pend.count < 2) {
              // Not yet confirmed — hold the higher score for one more poll
              rec.score1 = prev.score1;
              rec.score2 = prev.score2;
            } else {
              pendingScoreDown.delete(mid); // confirmed VAR — apply and clear
            }
          } else {
            // First poll showing a lower score — start confirmation window
            pendingScoreDown.set(mid, { score1: rec.score1, score2: rec.score2, count: 1 });
            rec.score1 = prev.score1;
            rec.score2 = prev.score2;
          }
        } else {
          pendingScoreDown.delete(mid); // score same or higher — clear any pending
        }
      }

      // Timeline data (scorers + cards): cached for finished matches,
      // refreshed every poll while live. Legacy cache entries (a bare scorers
      // array, pre-cards) are refetched while recent to pick up cards.
      const cached = scorerCache[fm.IdMatch];
      const prevRec = prevOverlay.get(matchId(fixture));
      const scoreChanged = prevRec &&
        (prevRec.score1 !== rec.score1 || prevRec.score2 !== rec.score2);
      const tl = liveTL.get(fm.IdMatch);
      if (finished && cached && !Array.isArray(cached)) {
        if (cached.scorers && cached.scorers.length) rec.scorers = cached.scorers;
        if (cached.cards && cached.cards.length) rec.cards = cached.cards;
      } else if (isLive && tl && (!tlTick && !scoreChanged || isPaused)) {
        // off-tick or match paused (HT/ET break): reuse the last timeline parse
        if (tl.scorers.length) rec.scorers = tl.scorers;
        if (tl.cards.length) rec.cards = tl.cards;
      } else if (!isPaused && (isLive || (finished && now - kickoff < TIMELINE_RECENT_MS))) {
        const rt = resolveMatchTeams(fixture, ko);
        timelineJobs.push({
          fm, rec, finished,
          t1: rt.team1 || fixture.team1,
          t2: rt.team2 || fixture.team2,
        });
      } else if (finished && Array.isArray(cached) && cached.length) {
        rec.scorers = cached; // legacy entry too old to refetch — cards unknown
      }
      overlay.set(matchId(fixture), rec);
    }

    await Promise.all(timelineJobs.map(async ({ fm, rec, finished, t1, t2 }) => {
      try {
        const tl = await fetchJSON(
          `${API}/timelines/${fm.IdCompetition}/${fm.IdSeason}/${fm.IdStage}/${fm.IdMatch}?language=en`
        );
        const scorers = parseScorers(tl, t1, t2);
        const cards = parseCards(tl, t1, t2);
        if (scorers.length) rec.scorers = scorers;
        if (cards.length) rec.cards = cards;
        liveTL.set(fm.IdMatch, { scorers, cards });
        if (finished) {
          scorerCache[fm.IdMatch] = { scorers, cards };
          cacheDirty = true;
        }
      } catch { /* scorers are optional — the score is already set */ }
    }));
    if (cacheDirty) persistScorerCache();

    const byId = new Map();
    for (const [id, rec] of overlay) byId.set(id, JSON.stringify(rec));
    const changedIds = [];
    for (const [id, s] of byId) if (lastById.get(id) !== s) changedIds.push(id);
    for (const id of lastById.keys()) if (!byId.has(id)) changedIds.push(id);
    lastById = byId;
    // Always notify (even with no changes): the app also runs admin
    // housekeeping after each poll (archiving finished results to Appwrite).
    if (onUpdate) onUpdate(changedIds);

    if (anyActiveLive) return POLL_LIVE_MS;
    if (anyPausedLive) return POLL_PAUSE_MS;
    if (nextKickoff < Infinity) {
      // Sleep until just after the next kickoff, capped at the idle cadence
      return Math.max(POLL_LIVE_MS, Math.min(POLL_IDLE_MS, nextKickoff - now + 30e3));
    }
    return POLL_IDLE_MS;
  }

  // ── Match stats (fdh-api.fifa.com — same unofficial status as api.fifa.com) ──
  // Fetched on demand when the user opens the Match Stats modal, never polled.
  // statsId (IdIFES) → { at, data }; finished-match stats are immutable.
  const statsCache = new Map();
  const STATS_LIVE_TTL_MS = 60 * 1000;

  // Returns { s1: {StatName: value}, s2: {...} } oriented to the app's
  // team1/team2 sides, or null when stats can't be resolved for this match.
  async function getStats(id) {
    const rec = overlay.get(id);
    if (!rec || !rec.statsId || !rec.idTeam1 || !rec.idTeam2) return null;
    const hit = statsCache.get(rec.statsId);
    if (hit && (!rec.isLive || Date.now() - hit.at < STATS_LIVE_TTL_MS)) return hit.data;
    const raw = await fetchJSON(`https://fdh-api.fifa.com/v1/stats/match/${rec.statsId}/teams.json`);
    const rows1 = raw[rec.idTeam1], rows2 = raw[rec.idTeam2];
    if (!Array.isArray(rows1) || !Array.isArray(rows2)) return null;
    const toObj = (rows) => {
      const o = {};
      for (const r of rows) o[r[0]] = r[1];
      return o;
    };
    const data = { s1: toObj(rows1), s2: toObj(rows2) };
    statsCache.set(rec.statsId, { at: Date.now(), data });
    return data;
  }

  let firstRun = true;

  async function tick() {
    clearTimeout(timer);
    let delay = POLL_IDLE_MS;
    // Always poll on the first run, even in a background tab, so the page
    // isn't empty when it becomes visible (e.g. PWA cold start).
    if (firstRun || !document.hidden) {
      firstRun = false;
      try {
        delay = await poll();
      } catch (err) {
        console.warn("Live scores unavailable (manual results still apply):", err.message);
        delay = 5 * 60 * 1000;
      }
    }
    timer = setTimeout(tick, delay);
  }

  return {
    get(id) { return overlay.get(id) || null; },
    // FIFA's official within-group position for a team, or null if unknown.
    officialPosition(team) { return standingPos.get(team) || null; },
    getStats,
    getSquadByName,
    getTeamInfoByName,
    getTeamFormByName,
    start(updateCb) {
      onUpdate = updateCb;
      // Tab was backgrounded (polling paused) → refresh as soon as it returns
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) tick();
      });
      tick();
    },
  };
})();
