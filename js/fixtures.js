// FIFA World Cup 2026 — full fixture list
// Stage: "group" | "r32" | "r16" | "qf" | "sf" | "third" | "final"
// For knockout matches with TBD teams, team1/team2 are placeholder labels.

const GROUPS = {
  A: ["Mexico", "South Africa", "South Korea", "Czechia"],
  B: ["Canada", "Bosnia and Herzegovina", "Qatar", "Switzerland"],
  C: ["Brazil", "Morocco", "Haiti", "Scotland"],
  D: ["United States", "Paraguay", "Australia", "Türkiye"],
  E: ["Germany", "Curaçao", "Ivory Coast", "Ecuador"],
  F: ["Netherlands", "Japan", "Sweden", "Tunisia"],
  G: ["Belgium", "Egypt", "Iran", "New Zealand"],
  H: ["Spain", "Cape Verde", "Saudi Arabia", "Uruguay"],
  I: ["France", "Senegal", "Iraq", "Norway"],
  J: ["Argentina", "Algeria", "Austria", "Jordan"],
  K: ["Portugal", "DR Congo", "Uzbekistan", "Colombia"],
  L: ["England", "Croatia", "Ghana", "Panama"],
};

const FIXTURES = [
  // ===== GROUP STAGE =====
  // June 11
  { stage: "group", group: "A", date: "2026-06-11", time: "15:00 ET", team1: "Mexico", team2: "South Africa", venue: "Estadio Azteca, Mexico City" },
  { stage: "group", group: "A", date: "2026-06-11", time: "22:00 ET", team1: "South Korea", team2: "Czechia", venue: "Zapopan, Mexico" },

  // June 12
  { stage: "group", group: "B", date: "2026-06-12", time: "15:00 ET", team1: "Canada", team2: "Bosnia and Herzegovina", venue: "BMO Field, Toronto" },
  { stage: "group", group: "D", date: "2026-06-12", time: "21:00 ET", team1: "United States", team2: "Paraguay", venue: "SoFi Stadium, Inglewood" },

  // June 13
  { stage: "group", group: "B", date: "2026-06-13", time: "15:00 ET", team1: "Qatar", team2: "Switzerland", venue: "Santa Clara, CA" },
  { stage: "group", group: "C", date: "2026-06-13", time: "18:00 ET", team1: "Brazil", team2: "Morocco", venue: "East Rutherford, NJ" },
  { stage: "group", group: "C", date: "2026-06-13", time: "21:00 ET", team1: "Haiti", team2: "Scotland", venue: "Foxborough, MA" },
  { stage: "group", group: "D", date: "2026-06-14", time: "00:00 ET", team1: "Australia", team2: "Türkiye", venue: "Vancouver, Canada" },

  // June 14
  { stage: "group", group: "E", date: "2026-06-14", time: "13:00 ET", team1: "Germany", team2: "Curaçao", venue: "Houston" },
  { stage: "group", group: "F", date: "2026-06-14", time: "16:00 ET", team1: "Netherlands", team2: "Japan", venue: "Arlington, TX" },
  { stage: "group", group: "E", date: "2026-06-14", time: "19:00 ET", team1: "Ivory Coast", team2: "Ecuador", venue: "Philadelphia" },
  { stage: "group", group: "F", date: "2026-06-14", time: "22:00 ET", team1: "Sweden", team2: "Tunisia", venue: "Guadalupe, Mexico" },

  // June 15
  { stage: "group", group: "H", date: "2026-06-15", time: "12:00 ET", team1: "Spain", team2: "Cape Verde", venue: "Atlanta" },
  { stage: "group", group: "G", date: "2026-06-15", time: "15:00 ET", team1: "Belgium", team2: "Egypt", venue: "Seattle" },
  { stage: "group", group: "H", date: "2026-06-15", time: "18:00 ET", team1: "Saudi Arabia", team2: "Uruguay", venue: "Miami Gardens, FL" },
  { stage: "group", group: "G", date: "2026-06-15", time: "21:00 ET", team1: "Iran", team2: "New Zealand", venue: "Inglewood, CA" },

  // June 16
  { stage: "group", group: "I", date: "2026-06-16", time: "15:00 ET", team1: "France", team2: "Senegal", venue: "East Rutherford, NJ" },
  { stage: "group", group: "I", date: "2026-06-16", time: "18:00 ET", team1: "Iraq", team2: "Norway", venue: "Foxborough, MA" },
  { stage: "group", group: "J", date: "2026-06-16", time: "21:00 ET", team1: "Argentina", team2: "Algeria", venue: "Kansas City, MO" },
  { stage: "group", group: "J", date: "2026-06-17", time: "00:00 ET", team1: "Austria", team2: "Jordan", venue: "Santa Clara, CA" },

  // June 17
  { stage: "group", group: "K", date: "2026-06-17", time: "13:00 ET", team1: "Portugal", team2: "DR Congo", venue: "Houston" },
  { stage: "group", group: "L", date: "2026-06-17", time: "16:00 ET", team1: "England", team2: "Croatia", venue: "Arlington, TX" },
  { stage: "group", group: "L", date: "2026-06-17", time: "19:00 ET", team1: "Ghana", team2: "Panama", venue: "Toronto" },
  { stage: "group", group: "K", date: "2026-06-17", time: "22:00 ET", team1: "Uzbekistan", team2: "Colombia", venue: "Mexico City" },

  // June 18
  { stage: "group", group: "A", date: "2026-06-18", time: "12:00 ET", team1: "Czechia", team2: "South Africa", venue: "Atlanta" },
  { stage: "group", group: "B", date: "2026-06-18", time: "15:00 ET", team1: "Switzerland", team2: "Bosnia and Herzegovina", venue: "Inglewood, CA" },
  { stage: "group", group: "B", date: "2026-06-18", time: "18:00 ET", team1: "Canada", team2: "Qatar", venue: "Vancouver, Canada" },
  { stage: "group", group: "A", date: "2026-06-18", time: "21:00 ET", team1: "Mexico", team2: "South Korea", venue: "Zapopan, Mexico" },

  // June 19
  { stage: "group", group: "D", date: "2026-06-19", time: "15:00 ET", team1: "United States", team2: "Australia", venue: "Seattle" },
  { stage: "group", group: "C", date: "2026-06-19", time: "18:00 ET", team1: "Scotland", team2: "Morocco", venue: "Foxborough, MA" },
  { stage: "group", group: "C", date: "2026-06-19", time: "20:30 ET", team1: "Brazil", team2: "Haiti", venue: "Philadelphia" },
  { stage: "group", group: "D", date: "2026-06-19", time: "23:00 ET", team1: "Türkiye", team2: "Paraguay", venue: "Santa Clara, CA" },

  // June 20
  { stage: "group", group: "F", date: "2026-06-20", time: "13:00 ET", team1: "Netherlands", team2: "Sweden", venue: "Houston" },
  { stage: "group", group: "E", date: "2026-06-20", time: "16:00 ET", team1: "Germany", team2: "Ivory Coast", venue: "Toronto" },
  { stage: "group", group: "E", date: "2026-06-20", time: "20:00 ET", team1: "Ecuador", team2: "Curaçao", venue: "Kansas City, MO" },
  { stage: "group", group: "F", date: "2026-06-21", time: "00:00 ET", team1: "Tunisia", team2: "Japan", venue: "Guadalupe, Mexico" },

  // June 21
  { stage: "group", group: "H", date: "2026-06-21", time: "12:00 ET", team1: "Spain", team2: "Saudi Arabia", venue: "Atlanta" },
  { stage: "group", group: "G", date: "2026-06-21", time: "15:00 ET", team1: "Belgium", team2: "Iran", venue: "Inglewood, CA" },
  { stage: "group", group: "H", date: "2026-06-21", time: "18:00 ET", team1: "Uruguay", team2: "Cape Verde", venue: "Miami Gardens, FL" },
  { stage: "group", group: "G", date: "2026-06-21", time: "21:00 ET", team1: "New Zealand", team2: "Egypt", venue: "Vancouver, Canada" },

  // June 22
  { stage: "group", group: "J", date: "2026-06-22", time: "13:00 ET", team1: "Argentina", team2: "Austria", venue: "Arlington, TX" },
  { stage: "group", group: "I", date: "2026-06-22", time: "17:00 ET", team1: "France", team2: "Iraq", venue: "Philadelphia" },
  { stage: "group", group: "I", date: "2026-06-22", time: "20:00 ET", team1: "Norway", team2: "Senegal", venue: "East Rutherford, NJ" },
  { stage: "group", group: "J", date: "2026-06-22", time: "23:00 ET", team1: "Jordan", team2: "Algeria", venue: "Santa Clara, CA" },

  // June 23
  { stage: "group", group: "K", date: "2026-06-23", time: "13:00 ET", team1: "Portugal", team2: "Uzbekistan", venue: "Houston" },
  { stage: "group", group: "L", date: "2026-06-23", time: "16:00 ET", team1: "England", team2: "Ghana", venue: "Foxborough, MA" },
  { stage: "group", group: "L", date: "2026-06-23", time: "19:00 ET", team1: "Panama", team2: "Croatia", venue: "Toronto" },
  { stage: "group", group: "K", date: "2026-06-23", time: "22:00 ET", team1: "Colombia", team2: "DR Congo", venue: "Zapopan, Mexico" },

  // June 24
  { stage: "group", group: "B", date: "2026-06-24", time: "15:00 ET", team1: "Switzerland", team2: "Canada", venue: "Vancouver, Canada" },
  { stage: "group", group: "B", date: "2026-06-24", time: "15:00 ET", team1: "Bosnia and Herzegovina", team2: "Qatar", venue: "Seattle" },
  { stage: "group", group: "C", date: "2026-06-24", time: "18:00 ET", team1: "Scotland", team2: "Brazil", venue: "Miami Gardens, FL" },
  { stage: "group", group: "C", date: "2026-06-24", time: "18:00 ET", team1: "Morocco", team2: "Haiti", venue: "Atlanta" },
  { stage: "group", group: "A", date: "2026-06-24", time: "21:00 ET", team1: "Czechia", team2: "Mexico", venue: "Mexico City" },
  { stage: "group", group: "A", date: "2026-06-24", time: "21:00 ET", team1: "South Africa", team2: "South Korea", venue: "Guadalupe, Mexico" },

  // June 25
  { stage: "group", group: "E", date: "2026-06-25", time: "16:00 ET", team1: "Ecuador", team2: "Germany", venue: "East Rutherford, NJ" },
  { stage: "group", group: "E", date: "2026-06-25", time: "16:00 ET", team1: "Curaçao", team2: "Ivory Coast", venue: "Philadelphia" },
  { stage: "group", group: "F", date: "2026-06-25", time: "19:00 ET", team1: "Japan", team2: "Sweden", venue: "Arlington, TX" },
  { stage: "group", group: "F", date: "2026-06-25", time: "19:00 ET", team1: "Tunisia", team2: "Netherlands", venue: "Kansas City, MO" },
  { stage: "group", group: "D", date: "2026-06-25", time: "22:00 ET", team1: "Türkiye", team2: "United States", venue: "Inglewood, CA" },
  { stage: "group", group: "D", date: "2026-06-25", time: "22:00 ET", team1: "Paraguay", team2: "Australia", venue: "Santa Clara, CA" },

  // June 26
  { stage: "group", group: "I", date: "2026-06-26", time: "15:00 ET", team1: "Norway", team2: "France", venue: "Foxborough, MA" },
  { stage: "group", group: "I", date: "2026-06-26", time: "15:00 ET", team1: "Senegal", team2: "Iraq", venue: "Toronto" },
  { stage: "group", group: "H", date: "2026-06-26", time: "20:00 ET", team1: "Cape Verde", team2: "Saudi Arabia", venue: "Houston" },
  { stage: "group", group: "H", date: "2026-06-26", time: "20:00 ET", team1: "Uruguay", team2: "Spain", venue: "Zapopan, Mexico" },
  { stage: "group", group: "G", date: "2026-06-26", time: "23:00 ET", team1: "Egypt", team2: "Iran", venue: "Seattle" },
  { stage: "group", group: "G", date: "2026-06-26", time: "23:00 ET", team1: "New Zealand", team2: "Belgium", venue: "Vancouver, Canada" },

  // June 27
  { stage: "group", group: "L", date: "2026-06-27", time: "17:00 ET", team1: "Panama", team2: "England", venue: "East Rutherford, NJ" },
  { stage: "group", group: "L", date: "2026-06-27", time: "17:00 ET", team1: "Croatia", team2: "Ghana", venue: "Philadelphia" },
  { stage: "group", group: "K", date: "2026-06-27", time: "19:30 ET", team1: "Colombia", team2: "Portugal", venue: "Miami Gardens, FL" },
  { stage: "group", group: "K", date: "2026-06-27", time: "19:30 ET", team1: "DR Congo", team2: "Uzbekistan", venue: "Atlanta" },
  { stage: "group", group: "J", date: "2026-06-27", time: "22:00 ET", team1: "Algeria", team2: "Austria", venue: "Kansas City, MO" },
  { stage: "group", group: "J", date: "2026-06-27", time: "22:00 ET", team1: "Jordan", team2: "Argentina", venue: "Arlington, TX" },

  // ===== ROUND OF 32 =====
  { stage: "r32", group: null, date: "2026-06-28", time: "15:00 ET", team1: "A2", team2: "B2", venue: "Inglewood, CA" },
  { stage: "r32", group: null, date: "2026-06-29", time: "13:00 ET", team1: "C1", team2: "F2", venue: "Houston" },
  { stage: "r32", group: null, date: "2026-06-29", time: "16:30 ET", team1: "E1", team2: "3rd A/B/C/D/F", venue: "Foxborough, MA" },
  { stage: "r32", group: null, date: "2026-06-29", time: "21:00 ET", team1: "F1", team2: "C2", venue: "Guadalupe, Mexico" },
  { stage: "r32", group: null, date: "2026-06-30", time: "13:00 ET", team1: "E2", team2: "I2", venue: "Arlington, TX" },
  { stage: "r32", group: null, date: "2026-06-30", time: "17:00 ET", team1: "I1", team2: "3rd C/D/F/G/H", venue: "East Rutherford, NJ" },
  { stage: "r32", group: null, date: "2026-06-30", time: "21:00 ET", team1: "A1", team2: "3rd C/E/F/H/I", venue: "Mexico City" },
  { stage: "r32", group: null, date: "2026-07-01", time: "12:00 ET", team1: "L1", team2: "3rd E/H/I/J/K", venue: "Atlanta" },
  { stage: "r32", group: null, date: "2026-07-01", time: "16:00 ET", team1: "G1", team2: "3rd A/E/H/I/J", venue: "Seattle" },
  { stage: "r32", group: null, date: "2026-07-01", time: "20:00 ET", team1: "D1", team2: "3rd B/E/F/I/J", venue: "Santa Clara, CA" },
  { stage: "r32", group: null, date: "2026-07-02", time: "15:00 ET", team1: "H1", team2: "J2", venue: "Inglewood, CA" },
  { stage: "r32", group: null, date: "2026-07-02", time: "19:00 ET", team1: "K2", team2: "L2", venue: "Toronto" },
  { stage: "r32", group: null, date: "2026-07-02", time: "23:00 ET", team1: "B1", team2: "3rd E/F/G/I/J", venue: "Vancouver, Canada" },
  { stage: "r32", group: null, date: "2026-07-03", time: "14:00 ET", team1: "D2", team2: "G2", venue: "Arlington, TX" },
  { stage: "r32", group: null, date: "2026-07-03", time: "18:00 ET", team1: "J1", team2: "H2", venue: "Miami Gardens, FL" },
  { stage: "r32", group: null, date: "2026-07-03", time: "21:30 ET", team1: "K1", team2: "3rd D/E/I/J/L", venue: "Kansas City, MO" },

  // ===== ROUND OF 16 =====
  // R16 cross-bracket is per FIFA's official 2026 structure (Wikipedia: 2026 World Cup knockout stage).
  // M90 (Houston):       W M73 vs W M75 = r32[0]+r32[3]
  { stage: "r16", group: null, date: "2026-07-04", time: "13:00 ET", team1: "W73", team2: "W75", bracket: { team1: { stage: "r32", index: 0, role: "winner" }, team2: { stage: "r32", index: 3, role: "winner" } }, venue: "Houston" },
  // M89 (Philadelphia):  W M74 vs W M77 = r32[2]+r32[5]
  { stage: "r16", group: null, date: "2026-07-04", time: "17:00 ET", team1: "W74", team2: "W77", bracket: { team1: { stage: "r32", index: 2, role: "winner" }, team2: { stage: "r32", index: 5, role: "winner" } }, venue: "Philadelphia" },
  // M91 (East Ruth.):    W M76 vs W M78 = r32[1]+r32[4]
  { stage: "r16", group: null, date: "2026-07-05", time: "16:00 ET", team1: "W76", team2: "W78", bracket: { team1: { stage: "r32", index: 1, role: "winner" }, team2: { stage: "r32", index: 4, role: "winner" } }, venue: "East Rutherford, NJ" },
  // M92 (Mexico City):   W M79 vs W M80 = r32[6]+r32[7]
  { stage: "r16", group: null, date: "2026-07-05", time: "20:00 ET", team1: "W79", team2: "W80", bracket: { team1: { stage: "r32", index: 6, role: "winner" }, team2: { stage: "r32", index: 7, role: "winner" } }, venue: "Mexico City" },
  // M93 (Arlington):     W M83 vs W M84 = r32[11]+r32[10]
  { stage: "r16", group: null, date: "2026-07-06", time: "15:00 ET", team1: "W83", team2: "W84", bracket: { team1: { stage: "r32", index: 11, role: "winner" }, team2: { stage: "r32", index: 10, role: "winner" } }, venue: "Arlington, TX" },
  // M94 (Seattle):       W M81 vs W M82 = r32[9]+r32[8]
  { stage: "r16", group: null, date: "2026-07-06", time: "20:00 ET", team1: "W81", team2: "W82", bracket: { team1: { stage: "r32", index: 9, role: "winner" }, team2: { stage: "r32", index: 8, role: "winner" } }, venue: "Seattle" },
  // M95 (Atlanta):       W M86 vs W M88 = r32[14]+r32[13]
  { stage: "r16", group: null, date: "2026-07-07", time: "12:00 ET", team1: "W86", team2: "W88", bracket: { team1: { stage: "r32", index: 14, role: "winner" }, team2: { stage: "r32", index: 13, role: "winner" } }, venue: "Atlanta" },
  // M96 (Vancouver):     W M85 vs W M87 = r32[12]+r32[15]
  { stage: "r16", group: null, date: "2026-07-07", time: "16:00 ET", team1: "W85", team2: "W87", bracket: { team1: { stage: "r32", index: 12, role: "winner" }, team2: { stage: "r32", index: 15, role: "winner" } }, venue: "Vancouver, Canada" },

  // ===== QUARTERFINALS =====
  // M97 (Foxborough):   W M89 vs W M90 = r16[1]+r16[0]
  { stage: "qf", group: null, date: "2026-07-09", time: "16:00 ET", team1: "W89", team2: "W90", bracket: { team1: { stage: "r16", index: 1, role: "winner" }, team2: { stage: "r16", index: 0, role: "winner" } }, venue: "Foxborough, MA" },
  // M98 (Inglewood):    W M93 vs W M94 = r16[4]+r16[5]
  { stage: "qf", group: null, date: "2026-07-10", time: "15:00 ET", team1: "W93", team2: "W94", bracket: { team1: { stage: "r16", index: 4, role: "winner" }, team2: { stage: "r16", index: 5, role: "winner" } }, venue: "Inglewood, CA" },
  // M99 (Miami):        W M91 vs W M92 = r16[2]+r16[3]
  { stage: "qf", group: null, date: "2026-07-11", time: "17:00 ET", team1: "W91", team2: "W92", bracket: { team1: { stage: "r16", index: 2, role: "winner" }, team2: { stage: "r16", index: 3, role: "winner" } }, venue: "Miami Gardens, FL" },
  // M100 (Kansas City): W M95 vs W M96 = r16[6]+r16[7]
  { stage: "qf", group: null, date: "2026-07-11", time: "21:00 ET", team1: "W95", team2: "W96", bracket: { team1: { stage: "r16", index: 6, role: "winner" }, team2: { stage: "r16", index: 7, role: "winner" } }, venue: "Kansas City, MO" },

  // ===== SEMIFINALS =====
  { stage: "sf", group: null, date: "2026-07-14", time: "15:00 ET", team1: "W97", team2: "W98", bracket: { team1: { stage: "qf", index: 0, role: "winner" }, team2: { stage: "qf", index: 1, role: "winner" } }, venue: "Arlington, TX" },
  { stage: "sf", group: null, date: "2026-07-15", time: "15:00 ET", team1: "W99", team2: "W100", bracket: { team1: { stage: "qf", index: 2, role: "winner" }, team2: { stage: "qf", index: 3, role: "winner" } }, venue: "Atlanta" },

  // ===== THIRD-PLACE =====
  { stage: "third", group: null, date: "2026-07-18", time: "17:00 ET", team1: "RU101", team2: "RU102", bracket: { team1: { stage: "sf", index: 0, role: "loser" }, team2: { stage: "sf", index: 1, role: "loser" } }, venue: "Miami Gardens, FL" },

  // ===== FINAL =====
  { stage: "final", group: null, date: "2026-07-19", time: "15:00 ET", team1: "W101", team2: "W102", bracket: { team1: { stage: "sf", index: 0, role: "winner" }, team2: { stage: "sf", index: 1, role: "winner" } }, venue: "East Rutherford, NJ" },
];

// ISO 3166-1 alpha-2 codes used for flagcdn.com image URLs.
// Scotland/England are handled separately (sub-UK flags).
const TEAM_FLAGS = {
  "Mexico": "mx",
  "South Africa": "za",
  "South Korea": "kr",
  "Czechia": "cz",
  "Canada": "ca",
  "Bosnia and Herzegovina": "ba",
  "Qatar": "qa",
  "Switzerland": "ch",
  "Brazil": "br",
  "Morocco": "ma",
  "Haiti": "ht",
  "Scotland": "scotland",
  "United States": "us",
  "Paraguay": "py",
  "Australia": "au",
  "Türkiye": "tr",
  "Germany": "de",
  "Curaçao": "cw",
  "Ivory Coast": "ci",
  "Ecuador": "ec",
  "Netherlands": "nl",
  "Japan": "jp",
  "Sweden": "se",
  "Tunisia": "tn",
  "Belgium": "be",
  "Egypt": "eg",
  "Iran": "ir",
  "New Zealand": "nz",
  "Spain": "es",
  "Cape Verde": "cv",
  "Saudi Arabia": "sa",
  "Uruguay": "uy",
  "France": "fr",
  "Senegal": "sn",
  "Iraq": "iq",
  "Norway": "no",
  "Argentina": "ar",
  "Algeria": "dz",
  "Austria": "at",
  "Jordan": "jo",
  "Portugal": "pt",
  "DR Congo": "cd",
  "Uzbekistan": "uz",
  "Colombia": "co",
  "England": "england",
  "Croatia": "hr",
  "Ghana": "gh",
  "Panama": "pa",
};

// FIFA 3-letter codes — used in the compact (two-sided) bracket view.
const TEAM_ABBR = {
  "Mexico": "MEX", "South Africa": "RSA", "South Korea": "KOR", "Czechia": "CZE",
  "Canada": "CAN", "Bosnia and Herzegovina": "BIH", "Qatar": "QAT", "Switzerland": "SUI",
  "Brazil": "BRA", "Morocco": "MAR", "Haiti": "HAI", "Scotland": "SCO",
  "United States": "USA", "Paraguay": "PAR", "Australia": "AUS", "Türkiye": "TUR",
  "Germany": "GER", "Curaçao": "CUW", "Ivory Coast": "CIV", "Ecuador": "ECU",
  "Netherlands": "NED", "Japan": "JPN", "Sweden": "SWE", "Tunisia": "TUN",
  "Belgium": "BEL", "Egypt": "EGY", "Iran": "IRN", "New Zealand": "NZL",
  "Spain": "ESP", "Cape Verde": "CPV", "Saudi Arabia": "KSA", "Uruguay": "URU",
  "France": "FRA", "Senegal": "SEN", "Iraq": "IRQ", "Norway": "NOR",
  "Argentina": "ARG", "Algeria": "ALG", "Austria": "AUT", "Jordan": "JOR",
  "Portugal": "POR", "DR Congo": "COD", "Uzbekistan": "UZB", "Colombia": "COL",
  "England": "ENG", "Croatia": "CRO", "Ghana": "GHA", "Panama": "PAN",
};

const SPECIAL_FLAG_URLS = {
  "scotland": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/Flag_of_Scotland.svg/40px-Flag_of_Scotland.svg.png",
  "england": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Flag_of_England.svg/40px-Flag_of_England.svg.png",
};

const STAGE_LABELS = {
  group: "Group Stage",
  r32: "R32",
  r16: "R16",
  qf: "QF",
  sf: "SF",
  third: "Third-Place",
  final: "Final",
};
