# Code Map — FIFA World Cup 2026 PWA

A quick index of **where everything lives**, so you can jump straight to the code you want to edit.

> ⚠️ **Line numbers drift** every time the files are edited. If a line number here is off by a few, search for the **function/section name** in the file instead — the names are stable. Regenerate this map after big edits.

**App type:** Vanilla JS PWA — plain `<script>` tags, global scope, **no build step**. Edit a file → reload the browser. (Bump the service-worker `CACHE_VERSION` in `sw.js` to force clients to pick up changes.)

---

## File overview

The old monolithic `app.js` and `styles.css` were **split into smaller files** for
maintainability. They are still plain global `<script>`/`<link>` files (no build step).

> ⚠️ **The app scripts MUST load in the order below** (set in `index.html` and
> `sw.js`'s `APP_SHELL`). Definitions come first; then `app-auth.js` →
> `app-firebase.js` (init + IIFEs) → `app-scoring.js` → `app-init.js` (startup
> calls, wiring, live-scores, SW). Reordering will break startup. The CSS files
> must also stay in order so the cascade is unchanged.

| File | ~Lines | What it holds |
|------|-------|---------------|
| [index.html](index.html) | 175 | Page shell, header, tab bar, view `<section>`s, mobile nav, link/script tags |
| **App code (split from `app.js`, in `js/` — load in this order)** | | |
| [js/app-core.js](js/app-core.js) | 609 | `els`, constants, `state` + load/save, modal helpers, results, timezones, flags, countdown helpers |
| [js/app-cards.js](js/app-cards.js) | 474 | `renderMatchCard`, scorers get/set, `renderScorersBlock`, `resultLabel`, `wireScoreInputs`, day-group helpers |
| [js/app-schedule.js](js/app-schedule.js) | 896 | **Schedule** view, KO assignment + bracket resolve, `computeStandings`, **clinch** (`groupClinch`), `buildStandingsTable`, thirds panel |
| [js/app-standings.js](js/app-standings.js) | 365 | `renderStandings` (+ FLIP/count animation), **Bracket** render, `computeTopScorers` |
| [js/app-picks.js](js/app-picks.js) | 812 | **Match Predict** (`renderPicks`/`renderPickCard`), rules modal, user-predictions modal, leaderboard table |
| [js/app-drawer.js](js/app-drawer.js) | 401 | **Top-5 drawer** (+ count-up audio/badge), `renderLeaderboardView`, `renderTopScorers`, golden boot |
| [js/app-predict.js](js/app-predict.js) | 908 | Lock helpers, **Table Predict** (group order, thirds, bracket, share link), `renderPredict`, `switchView`, `render`, filter wiring |
| [js/app-auth.js](js/app-auth.js) | 261 | **Auth UI** (sign in/out, settings, change password) + user/settings button wiring |
| [js/app-firebase.js](js/app-firebase.js) | 425 | **Firebase** config + `appwriteSync`/`appwriteAuth`/`userPicksSync` IIFEs, picks encode/decode |
| [js/app-scoring.js](js/app-scoring.js) | 170 | Scoring engine (`scoreMatchPick`, `computeLeaderboard`), cache versioning |
| [js/app-init.js](js/app-init.js) | 686 | **Startup/init**, countdown ticker, live-scores glue, match-stats + team modal, SW registration |
| **Other JS (in `js/`)** | | |
| [js/fixtures.js](js/fixtures.js) | 252 | Match list, groups, team→flag map, stage labels |
| [js/live-scores.js](js/live-scores.js) | 615 | Unofficial FIFA API client (scores, scorers, squads, standings) |
| [js/third-place-matrix.js](js/third-place-matrix.js) | 534 | FIFA's best-third-place qualification lookup table |
| **Styles (split from `styles.css`, loaded in this order)** | | |
| [css/base.css](css/base.css) | 590 | Root vars, reset, hero, layout, controls, login modal |
| [css/schedule.css](css/schedule.css) | 971 | Summary, schedule view, countdown/cards, team + lightbox modals |
| [css/standings.css](css/standings.css) | 671 | Result row, scorers, standings, clinch badges, thirds panel |
| [css/bracket-groups.css](css/bracket-groups.css) | 562 | Bracket, groups, footer, mobile bottom nav, responsive |
| [css/leaderboard.css](css/leaderboard.css) | 911 | Top scorers, prediction mode, picks, Top-5 drawer, scoreboard, leaderboard table |
| [css/modals.css](css/modals.css) | 809 | Rules modal, predict-step styles, admin view-predictions |
| **PWA** | | |
| [sw.js](sw.js) | 138 | Service worker — offline cache (`APP_SHELL` lists all the above) + update toast |
| [manifest.webmanifest](manifest.webmanifest) | 27 | PWA metadata (name, icons, `portrait` orientation) |

> The deep-link line numbers in the sections below were written against the old
> single `app.js`; they're now **offsets within whichever split file** contains
> that function. Search by function name (stable) to find it.

---

## index.html — what's where

| What | Line |
|------|------|
| `<head>` / PWA meta tags | [4–19](index.html#L4) |
| Hero header + progress bar | [22–46](index.html#L22) |
| Filters (team / date / timezone / reset) | [49–68](index.html#L49) |
| Tab bar (`.view-toggle`) | [69–78](index.html#L69) |
| View sections (`#groupsView`, `#standingsView`, …) | [81–98](index.html#L81) |
| Mobile sidebar nav | [104–149](index.html#L104) |
| Script tags (Firebase SDK → fixtures → live-scores → app) | [151–157](index.html#L151) |

---

## app.js — the big one

### Setup & state
| What | Line |
|------|------|
| `els` — cached DOM element refs | [3](app.js#L3) |
| LocalStorage keys (`RESULTS_KEY`, `OVERRIDE_KEY`, …) | [22](app.js#L22) |
| `isUserAdmin()` — admin check by email | [32](app.js#L32) |
| Match-pick / prediction / override load+save helpers | [79–122](app.js#L79) |
| `setAdmin` / `applyAdminClass` | [122](app.js#L122) |

### Modals & dialogs
| What | Line |
|------|------|
| `showModal` (generic), `showAlert`, `showConfirm` | [133](app.js#L133), [193](app.js#L193), [209](app.js#L209) |
| `openRulesModal` — scoring rules dialog | [2488](app.js#L2488) |
| `openUserPredictionsModal` — leaderboard **"View" predictions** modal (live-row highlight here) | [2579](app.js#L2579) |
| `openAuthModal` — sign in / sign up | [4014](app.js#L4014) |
| `openSettingsModal` / `openChangePasswordModal` | [4120](app.js#L4120), [4154](app.js#L4154) |
| `openTeamModal` — team info / squad / form | [5309](app.js#L5309) |
| `openImageLightbox` — full player photo | [5188](app.js#L5188) |

### Results (admin-entered + API)
| What | Line |
|------|------|
| `sanitizeResult` / `loadResults` / `saveResults` | [233–263](app.js#L233) |
| `exportResults` / `importResultsFromFile` | [268](app.js#L268), [287](app.js#L287) |
| `getResult(m)` — resolved result for a match | [405](app.js#L405) |
| `loadLatestFromServer` / `applyServerData` | [331](app.js#L331), [366](app.js#L366) |
| `archiveFinishedApiResults` — persist finished live matches | [5387](app.js#L5387) |

### Match cards & scorers
| What | Line |
|------|------|
| `matchId(m)` — canonical match key | [401](app.js#L401) |
| `renderMatchCard` (Schedule card; admin **Refresh scorers** button) | [608](app.js#L608) |
| `getScorers` / `getCards` / `setScorers` | [741](app.js#L741), [748](app.js#L748), [775](app.js#L775) |
| `renderScorersBlock` / `wireScoreInputs` | [845](app.js#L845), [996](app.js#L996) |
| `formatCountdown` / `applyLiveChip` — live/upcoming chip state | [556](app.js#L556), [598](app.js#L598) |

### Schedule view
| What | Line |
|------|------|
| `renderSchedule` (+ day grouping helpers) | [1125](app.js#L1125), [1075](app.js#L1075) |
| `populateTeams` / `populateDates` / `populateTimezones` | [433](app.js#L433), [445](app.js#L445), [468](app.js#L468) |
| Timezone conversion helpers (`fixtureToUTC`, `formatTimeInTz`, …) | [482–516](app.js#L482) |
| `flagFor(name)` | [584](js/app-core.js#L584) |
| `teamAbbr(name)` — 3-letter code for compact bracket | [591](js/app-core.js#L591) |

### Standings & groups
| What | Line |
|------|------|
| `computeStandings` — **FIFA 2026 tiebreaker order** (h2h before overall GD) | [1499](app.js#L1499) |
| ↳ `h2hTable` / `rankLevelOnPoints` (nested helpers) | [1550](app.js#L1550), [1569](app.js#L1569) |
| `buildStandingsTable` / `patchStandingsTables` | [1626](app.js#L1626), [1680](app.js#L1680) |
| `renderStandings` (+ row reorder) | [1793](app.js#L1793), [1947](app.js#L1947) |
| `renderThirdPlacePanel` / `moveThirdsRow` | [1694](app.js#L1694), [1781](app.js#L1781) |
| `renderGroups` | [3874](app.js#L3874) |

### Knockout bracket (actual)
| What | Line |
|------|------|
| `isGroupStageComplete` / `buildCurrentBracketKo` | [1293](app.js#L1293), [1305](app.js#L1305) |
| `getKnockoutAssignments` / `resolveTeamName` / `resolveMatchTeams` | [1381](app.js#L1381), [1444](app.js#L1444), [1459](app.js#L1459) |
| `renderBracket` / `renderBracketMatch` | [1960](app.js#L1960), [2071](app.js#L2071) |

### Top scorers / Golden Boot
| What | Line |
|------|------|
| `computeTopScorers` | [2101](app.js#L2101) |
| `renderTopScorers` / `renderGoldenBootCard` | [3004](app.js#L3004), [3067](app.js#L3067) |

### Match Predict tab (per-match score picks)
| What | Line |
|------|------|
| `renderPicks` — **Live Now pinned section** lives here | [2156](app.js#L2156) |
| `renderPickCard` | [2352](app.js#L2352) |
| `saveMatchPickFull` | [2475](app.js#L2475) |

### Table Predict tab (predict group order + bracket)
| What | Line |
|------|------|
| `getPredictedGroupOrder` / `setPredictedGroupOrder` | [3129](app.js#L3129), [3140](app.js#L3140) |
| Best-thirds prediction (`getPredictedThirds`, `toggleBestThird`) | [3145](app.js#L3145), [3153](app.js#L3153) |
| `buildPredictionKo` + predict-resolve helpers | [3164–3256](app.js#L3164) |
| `clearAllPredictions` | [3262](app.js#L3262) |
| `encodePrediction` / `decodePrediction` — share link codec | [3273](app.js#L3273), [3318](app.js#L3318) |
| `renderPredict` (+ groups/thirds/bracket sections) | [3372](app.js#L3372), [3614](app.js#L3614), [3667](app.js#L3667), [3715](app.js#L3715) |
| `sharePredictionLink` / `downloadPrediction` (image export) | [3458](app.js#L3458), [3536](app.js#L3536) |

### Leaderboard
| What | Line |
|------|------|
| `renderPicksLeaderboard` | [2836](app.js#L2836) |
| `renderLeaderboardView` | [2921](app.js#L2921) |
| `lbAvatar` / `fireConfetti` / `playExactScoreSound` | [2825](app.js#L2825), [2804](app.js#L2804), [2776](app.js#L2776) |

### Scoring engine
| What | Line |
|------|------|
| `scoreMatchPick(pick, result, m)` — points per match | [4687](app.js#L4687) |
| `getUserBonus` / `setUserBonus` | [4728](app.js#L4728), [4733](app.js#L4733) |
| `computeUserLeaderboardRow` — Pts→Exact→Outcome→GD→PK→Acc% | [4742](app.js#L4742) |
| `computeLeaderboard` | [4783](app.js#L4783) |

### Lock helpers (kickoff = locked)
| What | Line |
|------|------|
| `isMatchLocked` / `isGroupLocked` | [3119](app.js#L3119), [3122](app.js#L3122) |

### Firebase backend
| What | Line |
|------|------|
| **Config block** (`FIREBASE_CONFIG`, `ADMIN_EMAILS`) | [4258](app.js#L4258) |
| `appwriteSync` — results + standings sync (Firestore) | [4293](app.js#L4293) |
| ↳ `bootstrap` / `subscribe` / `pushMatch` / `pushStandings` | [4393](app.js#L4393), [4413](app.js#L4413), [4347](app.js#L4347), [4356](app.js#L4356) |
| `appwriteAuth` — Firebase Auth wrapper | [4478](app.js#L4478) |
| `userPicksSync` — user predictions sync | [4555](app.js#L4555) |
| ↳ `doSaveOwn` — **locked-pick protection** | [4577](app.js#L4577) |
| `encodeMatchPicks` / `decodeMatchPicks` — compact picks codec | [4525](app.js#L4525), [4535](app.js#L4535) |
| Cache versioning (`getCacheVersion`, `isCacheStale`, `bumpCacheVersionFromEvent`) | [4812–4828](app.js#L4812) |

> 📌 The names `appwriteSync` / `appwriteAuth` are **historical** — they now talk to **Firebase**, not Appwrite. (Kept to avoid touching every call site.)

### Auth UI & app wiring
| What | Line |
|------|------|
| `updateUserBtn` / `logoutUser` / `afterLogin` | [3998](app.js#L3998), [4098](app.js#L4098), [4221](app.js#L4221) |
| `switchView` / `render` / `debouncedRender` | [3926](app.js#L3926), [3952](app.js#L3952), [3959](app.js#L3959) |
| Sidebar open/close | [4867](app.js#L4867), [4875](app.js#L4875) |
| `tickCountdowns` / `formatCountdownDirect` — 1s countdown loop | [4940](app.js#L4940), [4992](app.js#L4992) |

### Live scores glue + team/player UI
| What | Line |
|------|------|
| Live overlay init (`liveScores.start(...)`) | ~[5043](app.js#L5043) |
| `showMatchStats` — match stats modal | [5087](app.js#L5087) |
| Player photo helpers (`playerPhotoUrl`, `playerPhotoFull`, `playerAvatarHTML`) | [5172–5211](app.js#L5172) |
| `renderPlayerDetail` / `renderTeamForm` / `renderSquadList` | [5230](app.js#L5230), [5254](app.js#L5254), [5277](app.js#L5277) |
| Service worker registration + update toast | [5491](app.js#L5491) |

---

## fixtures.js

| What | Line |
|------|------|
| `GROUPS` — 12 groups × 4 teams | [5](fixtures.js#L5) |
| `FIXTURES` — all 104 matches | [20](fixtures.js#L20) |
| ↳ Group stage | [21](fixtures.js#L21) |
| ↳ Round of 32 (placeholders `A1`, `B2`, `3rd …`) | [128](fixtures.js#L128) |
| ↳ Round of 16 (`W73`… + `bracket` wiring) | [146](fixtures.js#L146) |
| ↳ Quarterfinals | [165](fixtures.js#L165) |
| ↳ Semifinals | [175](fixtures.js#L175) |
| ↳ Third-place | [179](fixtures.js#L179) |
| ↳ Final | [182](fixtures.js#L182) |
| `TEAM_FLAGS` — team → ISO country code | [188](js/fixtures.js#L188) |
| `TEAM_ABBR` — team → FIFA 3-letter code | [239](js/fixtures.js#L239) |
| `SPECIAL_FLAG_URLS` — Scotland/England flags | [239](fixtures.js#L239) |
| `STAGE_LABELS` | [244](fixtures.js#L244) |

> **To fix a kickoff time or matchup:** edit the relevant `{ stage, … }` object here. KO `bracket: { team1:{stage,index,role}, team2:{…} }` controls how winners/losers flow forward — `index` is 0-based within that stage.

---

## live-scores.js (`liveScores` module)

| What | Line |
|------|------|
| Module IIFE start | [12](live-scores.js#L12) |
| Scorer cache persistence | [55](live-scores.js#L55) |
| `placeholderCode` — maps `A1`/`W73` labels to FIFA codes | [89](live-scores.js#L89) |
| `findFixture` — match our fixture to FIFA's | [104](live-scores.js#L104) |
| `parseScorers` / `parseCards` | [137](live-scores.js#L137), [161](live-scores.js#L161) |
| `fetchCalendar` / `ensureCalendar` | [219](live-scores.js#L219), [242](live-scores.js#L242) |
| `getSquadByName` / `getTeamInfoByName` / `getTeamFormByName` | [247](live-scores.js#L247), [275](live-scores.js#L275), [296](live-scores.js#L296) |
| `fetchStandings` — official positions | [332](live-scores.js#L332) |
| `poll` — main live-score polling loop | [356](live-scores.js#L356) |
| `getStats(id)` — match statistics | [540](live-scores.js#L540) |
| `fetchScorers(appMatchId, t1, t2)` — admin button uses this | [580](live-scores.js#L580) |
| **Public API** (`get`, `officialPosition`, `start`, …) | [598–606](live-scores.js#L598) |

---

## third-place-matrix.js

| What | Line |
|------|------|
| `FIFA_SLOT_ORDER` | [10](third-place-matrix.js#L10) |
| `FIFA_THIRD_PLACE_MATRIX` — lookup table | [22](third-place-matrix.js#L22) |
| `lookupFifaThirdPlaceMatrix(qualifyingGroups)` | [524](third-place-matrix.js#L524) |

---

## styles.css — section index

| Section | Line |
|---------|------|
| Hero | [32](styles.css#L32) |
| Layout | [195](styles.css#L195) |
| Controls (filters/tabs) | [204](styles.css#L204) |
| Modal (login) | [313](styles.css#L313) |
| Summary | [572](styles.css#L572) |
| Schedule view | [587](styles.css#L587) |
| Result row | [1543](styles.css#L1543) |
| Scorers | [1604](styles.css#L1604) |
| Standings | [1873](styles.css#L1873) |
| Bracket | [2181](styles.css#L2181) |
| Groups view | [2410](styles.css#L2410) |
| Mobile sidebar | [2495](styles.css#L2495) |
| Responsive (media queries) | [2663](styles.css#L2663) |
| Top scorers | [2763](styles.css#L2763) |
| Prediction mode | [2966](styles.css#L2966) |
| Picks view | [3032](styles.css#L3032) |
| Rules modal | [3356](styles.css#L3356) |
| Admin "view predictions" button | [3821](styles.css#L3821) |
| User predictions modal (incl. `.upred-row-live` highlight) | [3850](styles.css#L3850) |
| Live Now pinned section | [4079](styles.css#L4079) |
| FT badge + scheduled time | [4126](styles.css#L4126) |

---

## sw.js (service worker)

| What | Line |
|------|------|
| `CACHE_VERSION` — **bump to force-refresh clients** | [9](sw.js#L9) |
| `APP_SHELL` — files precached for offline | [14](sw.js#L14) |
| `install` / `activate` | [27](sw.js#L27), [35](sw.js#L35) |
| `fetch` routing (network-first / cache-first / SWR) | [47](sw.js#L47) |
| `cacheFirst` / `networkFirst` / `staleWhileRevalidate` | [79](sw.js#L79), [94](sw.js#L94), [108](sw.js#L108) |

---

## Common edit recipes

- **Change a kickoff time / venue / matchup:** [fixtures.js](fixtures.js) → find the match object.
- **Change scoring points:** `scoreMatchPick` [app.js:4687](app.js#L4687); leaderboard sort `computeUserLeaderboardRow` [app.js:4742](app.js#L4742).
- **Change standings tiebreakers:** `computeStandings` [app.js:1499](app.js#L1499).
- **Add/remove an admin:** `ADMIN_EMAILS` near the Firebase config [app.js:4258](app.js#L4258) (and Firestore security rules in the Firebase console).
- **Tweak the live-row highlight:** `.upred-row-live` in [styles.css](styles.css#L3850); the `isLive` flag in `openUserPredictionsModal` [app.js:2579](app.js#L2579).
- **Force all users onto a new version:** bump `CACHE_VERSION` in [sw.js:9](sw.js#L9).
- **Lock behavior (kickoff):** `isMatchLocked` [app.js:3119](app.js#L3119); server-side protection in `doSaveOwn` [app.js:4577](app.js#L4577).
