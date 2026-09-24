// Fetches recent results for EPL, NFL, NRL, Super Rugby, AFL, NPC, La Liga,
// French Top 14, Super League, NHL, NBA and international rugby from
// TheSportsDB and merges any games not already present into the existing
// *_full_match_history.json files.
//
// Runs unattended via .github/workflows/update-sports-data.yml on a
// schedule - this script never needs to be run by hand, but you can run
// it locally with `node scripts/update-sports-data.js` to test it
// (set SPORTSDB_API_KEY as an env var first, or it'll fall back to the
// free "123" test key).
//
// Data source: TheSportsDB (https://www.thesportsdb.com). Uses a Premium
// key (stored as the SPORTSDB_API_KEY repo secret, never hardcoded here)
// so every sport gets the full season each run rather than the free
// tier's ~5-events-a-day cap. Confirmed working league IDs: EPL 4328,
// NFL 4391, NRL 4416, Super Rugby 4551, AFL 4456, NPC 5278. Added
// 2026-09-24 (IDs from TheSportsDB's own league pages, not yet run live):
// La Liga 4335, Top 14 4430, Super League 4415, NHL 4380, NBA 4387,
// international rugby 5479 + Six Nations 4714 + Nations Championship 5852.
//
// Formula 1 (4370) and PGA Tour (4425) aren't two-team games with a home
// and away score, so they use a separate finishing-position pipeline -
// see RANKED_SPORTS near the bottom of this file.
//
// IMPORTANT - AFL and NPC are new, unlike the other four which already had
// years of manually-sourced history behind them: these two started as
// empty files, backfilled several seasons on their first run (see
// backfillSeasons below). Their season-string format is also unconfirmed
// against a live response (assumed plain year by analogy with NRL/Super
// Rugby) - check the first run's log for either sport before trusting it.

const fs = require('fs');
const path = require('path');

const API_KEY = process.env.SPORTSDB_API_KEY || '123'; // falls back to the free test key if the secret isn't set
const BASE_URL = `https://www.thesportsdb.com/api/v1/json/${API_KEY}`;

if (API_KEY === '123') {
  console.log('Using the free "123" test key - SPORTSDB_API_KEY secret was not set (or was empty).');
} else {
  console.log(`Using a key from SPORTSDB_API_KEY (length ${API_KEY.length}, not shown).`);
}

// Season-name helpers for the sports added 2026-09-24. Each returns every
// season to request on a run - the current one plus enough past seasons to
// backfill a new, empty file (dedup makes re-requesting old seasons harmless).
// plainYears: competitions inside one calendar year, named "2026".
// splitYears: competitions spanning two years (Aug-May etc), named "2026-2027".
function plainYears(count) {
  return (year) => {
    const out = [];
    for (let y = year; y > year - count; y--) out.push(`${y}`);
    return out;
  };
}
function splitYears(count) {
  return (year) => {
    const out = [];
    for (let y = year; y > year - count - 1; y--) out.push(`${y}-${y + 1}`);
    return out;
  };
}

// International rugby: TheSportsDB's "friendlies" league also holds tour
// games against clubs and invitational sides (e.g. "Bulls", "Barbarians",
// "Maori All Blacks", "England A Rugby"). Those aren't test matches and
// would distort a national side's streaks and home/away record, so only
// games between two full national teams are kept - TheSportsDB names every
// full national side "<Country> Rugby", and the second-string sides "A"/"XV".
function isFullTestMatch(event) {
  const national = (name) => /^[A-Za-z .'-]+ Rugby$/.test(name || '') && !/ A Rugby$/.test(name) && !/XV/.test(name);
  return national(event.strHomeTeam) && national(event.strAwayTeam);
}

// Every national side is "<Country> Rugby" on TheSportsDB - stored as just
// the country, which is also how the Hub displays other sports' teams.
function stripRugbySuffix(name) {
  return (name || '').replace(/ Rugby$/, '');
}

// NHL and NBA: TheSportsDB files their preseason exhibitions under the same
// league as the real games (checked 2026-09-24: roughly 65-110 preseason
// games per season, including exhibitions against non-NBA clubs like Ulm
// and the NZ Breakers). Starters are rested in these, so they'd distort
// streaks and home/away records. Any game dated before that season's
// opening night is dropped. Add each new season's opening night here once
// it's announced - a season with NO entry keeps none of its games (and
// says so in the run log), rather than silently letting preseason through.
// Nothing is lost by that: the games are fetched again on every run, so
// they fill in as soon as the date is added.
function splitSeasonForDate(date) {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  return m >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}
const warnedMissingSeason = new Set();
function isBeforeRegularSeason(date, sport) {
  if (!sport.regularSeasonStarts) return false;
  const season = splitSeasonForDate(date);
  const start = sport.regularSeasonStarts[season];
  if (!start) {
    const key = `${sport.name}|${season}`;
    if (!warnedMissingSeason.has(key)) {
      warnedMissingSeason.add(key);
      console.log(`  WARNING: no opening-night date listed for ${sport.name} ${season} - skipping that season's games until one is added to regularSeasonStarts`);
    }
    return true;
  }
  return date < start;
}

const SPORTS = [
  {
    name: 'EPL',
    leagueId: 4328,
    file: path.join(__dirname, '..', 'epl_full_match_history.json'),
    seasonFormats: (year) => [`${year}-${year + 1}`, `${year - 1}-${year}`], // EPL season spans Aug-May
    division: 'E0',
    // A handful of known naming differences between TheSportsDB and the
    // existing football-data.co.uk-sourced file. Expand this as real
    // mismatches turn up after the first few runs - this is not
    // guaranteed complete, just a starting point.
    teamAliases: {
      'Manchester United': 'Man United',
      'Manchester City': 'Man City',
      'Tottenham Hotspur': 'Tottenham',
      'Wolverhampton Wanderers': 'Wolves',
      'Newcastle United': 'Newcastle',
      'West Ham United': 'West Ham',
      'Brighton and Hove Albion': 'Brighton',
      'Nottingham Forest': "Nott'm Forest",
      'Leicester City': 'Leicester',
      'West Bromwich Albion': 'West Brom',
    },
  },
  {
    name: 'NFL',
    leagueId: 4391,
    file: path.join(__dirname, '..', 'nfl_full_match_history.json'),
    // NFL seasons on TheSportsDB may be a single year or a cross-year
    // range - try both, whichever responds with events wins.
    seasonFormats: (year) => [`${year}`, `${year - 1}-${year}`, `${year}-${year + 1}`],
    teamAliases: {}, // aussportsbetting.com already uses full team names, matching TheSportsDB's convention
  },
  {
    name: 'NRL',
    leagueId: 4416,
    file: path.join(__dirname, '..', 'nrl_full_match_history.json'),
    // Untested against a live response - see file header. Trying plain
    // year first since NRL runs within a calendar year like NFL/AFL.
    seasonFormats: (year) => [`${year}`, `${year - 1}-${year}`, `${year}-${year + 1}`],
    teamAliases: {
      // Confirmed by comparing TheSportsDB's names against the existing
      // file's dominant (majority-game-count) spelling on 2026-09-12 -
      // without these, the same team's history silently splits across
      // multiple name variants.
      'Canterbury Bankstown Bulldogs': 'Canterbury Bulldogs',
      'Canterbury-Bankstown Bulldogs': 'Canterbury Bulldogs',
      'Cronulla-Sutherland Sharks': 'Cronulla Sharks',
      'Manly-Warringah Sea Eagles': 'Manly Sea Eagles',
      'North Queensland Cowboys': 'North QLD Cowboys',
      'St. George Illawarra Dragons': 'St George Dragons',
      'St. George Illawara Dragons': 'St George Dragons',
    },
    oddsFieldStyle: 'plain', // this file uses home_odds/away_odds, not home_odds_close/away_odds_close
    hasPlayoffField: true,
  },
  {
    name: 'Super Rugby',
    leagueId: 4551,
    file: path.join(__dirname, '..', 'super_rugby_full_match_history.json'),
    // Untested against a live response - see file header. Super Rugby
    // also runs within a calendar year (Feb-June), so trying plain year first.
    seasonFormats: (year) => [`${year}`, `${year - 1}-${year}`, `${year}-${year + 1}`],
    teamAliases: {
      // Confirmed by comparing TheSportsDB's names against the existing
      // file's dominant (majority-game-count) spelling on 2026-09-12.
      'Hurricanes Super Rugby': 'Hurricanes',
      'Chiefs Super Rugby': 'Chiefs',
      'Blues Super Rugby': 'Blues',
      'Crusaders Super Rugby': 'Crusaders',
      'Highlanders Super Rugby': 'Highlanders',
      'Queensland Reds': 'Reds',
      'ACT Brumbies': 'Brumbies',
      'Western Force': 'Force',
      'New South Wales Waratahs': 'Waratahs',
    },
    oddsFieldStyle: 'plain', // this file uses home_odds/away_odds, not home_odds_close/away_odds_close
    hasPlayoffField: false,
  },
  {
    // AFL and NPC (below) start from an EMPTY file, unlike the four
    // sports above which already had years of manually-sourced history -
    // backfillSeasons pulls several past years on every run (not just the
    // current one) so these two build up real depth quickly rather than
    // starting thin and only growing one season at a time. Re-checking
    // already-backfilled seasons on every run is a little wasteful but
    // harmless (dedup drops anything already present) and self-healing if
    // a run ever partially fails.
    name: 'AFL',
    leagueId: 4456,
    file: path.join(__dirname, '..', 'afl_full_match_history.json'),
    backfillSeasons: 6,
    // Untested against a live response - assumed plain year by analogy
    // with NRL (also an Australian, single-calendar-year competition,
    // confirmed plain year) - falls back to hyphenated for the current
    // year only, to avoid needlessly doubling backfill API calls if this
    // assumption turns out wrong.
    seasonFormats: (year) => {
      const years = [];
      for (let y = year; y > year - 6; y--) years.push(`${y}`);
      years.push(`${year - 1}-${year}`, `${year}-${year + 1}`);
      return years;
    },
    teamAliases: {}, // no prior file existed to compare against - nothing to check yet
    oddsFieldStyle: 'plain',
    hasPlayoffField: false,
  },
  {
    name: 'NPC',
    leagueId: 5278,
    file: path.join(__dirname, '..', 'npc_full_match_history.json'),
    backfillSeasons: 6,
    // Untested against a live response - assumed plain year by analogy
    // with Super Rugby (also a single-calendar-year competition,
    // confirmed plain year), and TheSportsDB's own league listing showed
    // "strCurrentSeason":"2026" for this league (plain year) when it was
    // looked up - falls back to hyphenated for the current year only.
    seasonFormats: (year) => {
      const years = [];
      for (let y = year; y > year - 6; y--) years.push(`${y}`);
      years.push(`${year - 1}-${year}`, `${year}-${year + 1}`);
      return years;
    },
    teamAliases: {}, // no prior file existed to compare against - nothing to check yet
    oddsFieldStyle: 'plain',
    hasPlayoffField: false,
  },
  // ---- Added 2026-09-24. All six start from an EMPTY file and backfill on
  // their first run, same as AFL/NPC did. Season formats are taken from
  // each league's own TheSportsDB page ("Current Season" field), checked
  // 2026-09-24: La Liga "2026-2027", international rugby "2026", F1 "2026".
  // Top 14, NHL and NBA assumed "YYYY-YYYY" and Super League "YYYY" by the
  // same logic (cross-year vs calendar-year seasons) - check the first
  // run's log for "returned no events" on any of them before trusting it.
  {
    name: 'La Liga',
    leagueId: 4335,
    file: path.join(__dirname, '..', 'laliga_full_match_history.json'),
    seasonFormats: splitYears(6),
    // TheSportsDB used short/older club names for seasons up to 2023-24,
    // then switched - found 2026-09-24 when the first backfill split the
    // same club across two or three names. Mapped to the names TheSportsDB
    // uses now, so new games need no mapping at all.
    teamAliases: {
      'Alaves': 'Deportivo Alavés',
      'Ath Bilbao': 'Athletic Bilbao',
      'Ath Madrid': 'Atlético Madrid',
      'Atletico Madrid': 'Atlético Madrid',
      'Betis': 'Real Betis',
      'Espanol': 'Espanyol',
      'Sociedad': 'Real Sociedad',
      'Vallecano': 'Rayo Vallecano',
    },
    oddsFieldStyle: 'plain',
    hasPlayoffField: false,
  },
  {
    name: 'Top 14',
    leagueId: 4430,
    file: path.join(__dirname, '..', 'top14_full_match_history.json'),
    seasonFormats: splitYears(6),
    teamAliases: {},
    oddsFieldStyle: 'plain',
    hasPlayoffField: false,
  },
  {
    name: 'Super League',
    leagueId: 4415,
    file: path.join(__dirname, '..', 'super_league_full_match_history.json'),
    seasonFormats: plainYears(6),
    // Leigh renamed from Centurions to Leopards for 2023 - same club.
    teamAliases: { 'Leigh Centurions': 'Leigh Leopards' },
    oddsFieldStyle: 'plain',
    hasPlayoffField: false,
  },
  {
    // NHL and NBA play ~1,300 games a season each (roughly 4x an NRL
    // season), so they backfill 3 seasons rather than 6 - plenty of depth
    // for streaks and home/away patterns, without making every phone
    // download a much larger file on each Hub visit.
    name: 'NHL',
    leagueId: 4380,
    file: path.join(__dirname, '..', 'nhl_full_match_history.json'),
    seasonFormats: splitYears(3),
    // Utah Hockey Club renamed to Utah Mammoth for 2025-26 - same club.
    // Arizona Coyotes (2023-24) deliberately kept separate: the franchise
    // relocated, so its home record is a different city's.
    teamAliases: { 'Utah Hockey Club': 'Utah Mammoth' },
    // Opening nights (NHL). 2024-25 is the North American opener - the two
    // regular-season games played in Prague on 4-5 Oct 2024 are dropped
    // with the preseason, a deliberate trade-off for a simple rule.
    regularSeasonStarts: {
      '2023-2024': '2023-10-10',
      '2024-2025': '2024-10-08',
      '2025-2026': '2025-10-07',
      '2026-2027': '2026-09-29',
    },
    oddsFieldStyle: 'plain',
    hasPlayoffField: false,
  },
  {
    name: 'NBA',
    leagueId: 4387,
    file: path.join(__dirname, '..', 'nba_full_match_history.json'),
    seasonFormats: splitYears(3),
    teamAliases: {},
    // Opening nights (NBA).
    regularSeasonStarts: {
      '2023-2024': '2023-10-24',
      '2024-2025': '2024-10-22',
      '2025-2026': '2025-10-21',
      '2026-2027': '2026-10-20',
    },
    oddsFieldStyle: 'plain',
    hasPlayoffField: false,
  },
  {
    // Test matches only (see isFullTestMatch above). This league also
    // carries Rugby Championship fixtures (e.g. South Africa v New Zealand,
    // Aug-Sep 2026), so it covers the All Blacks' southern-hemisphere
    // tests as well as the July and November windows. TheSportsDB's
    // records here only start in 2021, so 6 seasons is the whole history.
    name: 'Rugby International',
    // Three TheSportsDB leagues feed this one file (added 2026-09-24):
    // 5479 friendlies (incl. Rugby Championship), 4714 Six Nations, and
    // 5852 Nations Championship - World Rugby's new competition that now
    // holds the July and November test windows (why 2026 looked thin with
    // friendlies alone). A test listed under more than one league is
    // merged by the same-game check, not counted twice.
    leagueIds: [5479, 4714, 5852],
    file: path.join(__dirname, '..', 'rugby_international_full_match_history.json'),
    seasonFormats: plainYears(6),
    includeEvent: isFullTestMatch,
    teamNameTransform: stripRugbySuffix,
    teamAliases: {},
    oddsFieldStyle: 'plain',
    hasPlayoffField: false,
  },
];

function normalizeTeamName(name, aliases, transform) {
  const base = transform ? transform(name) : name;
  return aliases[base] || base;
}

async function fetchSeason(leagueId, season) {
  const url = `${BASE_URL}/eventsseason.php?id=${leagueId}&s=${season}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '(could not read response body)');
    console.log(`  HTTP ${res.status} calling eventsseason.php?id=${leagueId}&s=${season}: ${body.slice(0, 300)}`);
    return [];
  }
  const json = await res.json();
  if (json.error) {
    console.log(`  API returned an error for id=${leagueId}&s=${season}: ${json.error}`);
  }
  return json.events || [];
}

function toGameRow(event, sport) {
  const homeScore = event.intHomeScore;
  const awayScore = event.intAwayScore;
  // Skip anything not actually finished yet - postponed, or no score recorded.
  if (event.strPostponed === 'yes') return null;
  if (sport.includeEvent && !sport.includeEvent(event)) return null;
  if (isBeforeRegularSeason(event.dateEvent, sport)) return null;
  if (homeScore === null || homeScore === undefined || awayScore === null || awayScore === undefined) return null;

  const row = {
    date: event.dateEvent,
    home_team: normalizeTeamName(event.strHomeTeam, sport.teamAliases, sport.teamNameTransform),
    away_team: normalizeTeamName(event.strAwayTeam, sport.teamAliases, sport.teamNameTransform),
    home_score: Number(homeScore),
    away_score: Number(awayScore),
  };
  if (sport.name === 'EPL') {
    row.division = sport.division;
    row.home_odds_close = null;
    row.away_odds_close = null;
  } else if (sport.oddsFieldStyle === 'plain') {
    // NRL/Super Rugby use unsuffixed odds field names - match the
    // existing file's convention rather than EPL/NFL's "_close" suffix.
    row.home_odds = null;
    row.away_odds = null;
    if (sport.hasPlayoffField) row.playoff_game = null;
  } else {
    row.home_odds_close = null;
    row.away_odds_close = null;
    if (sport.name === 'NFL') {
      row.playoff_game = event.strDescriptionEN && /playoff|super bowl/i.test(event.strDescriptionEN) ? 'Y' : null;
    }
  }
  return row;
}

function dayNumber(date) {
  return Math.round(Date.parse(`${date}T00:00:00Z`) / 86400000);
}
function isSameGame(a, b) {
  return a.home_team === b.home_team
    && a.away_team === b.away_team
    && a.home_score === b.home_score
    && a.away_score === b.away_score
    && Math.abs(dayNumber(a.date) - dayNumber(b.date)) <= 1;
}
// Quick lookup so "is this game already here?" doesn't scan the whole
// file each time (EPL alone is several thousand rows).
function fixtureKey(g) {
  return `${g.home_team}|${g.away_team}|${g.home_score}|${g.away_score}`;
}
class GameIndex {
  constructor() { this.map = new Map(); }
  find(row) {
    return (this.map.get(fixtureKey(row)) || []).find((g) => isSameGame(g.row, row));
  }
  add(row, slot) {
    const key = fixtureKey(row);
    if (!this.map.has(key)) this.map.set(key, []);
    this.map.get(key).push({ row, slot });
  }
}
function filledFieldCount(row) {
  return Object.values(row).filter((v) => v !== null && v !== undefined && v !== '').length;
}

async function updateSport(sport) {
  console.log(`\n=== ${sport.name} ===`);
  const raw = fs.readFileSync(sport.file, 'utf8');
  const data = JSON.parse(raw);

  // Tidy what's already in the file with the CURRENT rules on every run -
  // team aliases and the preseason cut-off. This is what applies a newly
  // added alias or opening-night date to games saved before it existed.
  //
  // It also merges duplicate copies of the same game. Checked 2026-09-24:
  // the NRL and Super Rugby files each held ~75-80 games twice - once from
  // the original manually-sourced history, and again from an early
  // automatic run before the team-name aliases existed (e.g. "ACT
  // Brumbies" alongside "Brumbies"), plus a couple of NRL games dated a
  // day apart (TheSportsDB's UTC date vs the local date). A duplicate
  // counts the same result twice in streaks and home/away records.
  // "Same game" = same two teams, same score, dated within a day. Where
  // two copies exist, the one with more filled-in fields (i.e. with
  // odds) is kept.
  const beforeCount = data.games.length;
  const beforeNames = data.games.map((g) => `${g.home_team}|${g.away_team}`);
  const kept = [];
  const index = new GameIndex();
  data.games.forEach((g) => {
    const row = {
      ...g,
      home_team: normalizeTeamName(g.home_team, sport.teamAliases),
      away_team: normalizeTeamName(g.away_team, sport.teamAliases),
    };
    if (isBeforeRegularSeason(row.date, sport)) return;
    const twin = index.find(row);
    if (!twin) {
      index.add(row, kept.length);
      kept.push(row);
    } else if (filledFieldCount(row) > filledFieldCount(kept[twin.slot])) {
      kept[twin.slot] = row;
      twin.row = row;
    }
  });
  const tidiedChanged = kept.length !== beforeCount
    || kept.some((g, i) => `${g.home_team}|${g.away_team}` !== beforeNames[i]);
  if (tidiedChanged) {
    console.log(`  tidied existing rows: ${beforeCount} -> ${kept.length} (renamed teams and/or removed preseason/duplicate games)`);
  }
  data.games = kept;

  const currentYear = new Date().getUTCFullYear();

  let fetched = [];
  const leagueIds = sport.leagueIds || [sport.leagueId];
  for (const leagueId of leagueIds) {
    const prefix = leagueIds.length > 1 ? `league ${leagueId} ` : '';
    for (const season of sport.seasonFormats(currentYear)) {
      const events = await fetchSeason(leagueId, season);
      if (events.length) {
        console.log(`  ${prefix}season "${season}" returned ${events.length} events`);
        fetched = fetched.concat(events);
      } else {
        console.log(`  ${prefix}season "${season}" returned no events (trying next format if any)`);
      }
    }
  }

  const newGames = [];
  fetched.forEach((event) => {
    const row = toGameRow(event, sport);
    if (!row) return;
    if (index.find(row)) return;
    index.add(row, -1);
    newGames.push(row);
  });

  if (!newGames.length && !tidiedChanged) {
    console.log('  no new games to add');
    return;
  }

  // Existing files are sorted most-recent-first - keep that convention.
  data.games = [...newGames, ...data.games].sort((a, b) => (a.date < b.date ? 1 : -1));
  data.meta.row_count = data.games.length;
  data.meta.last_auto_update = new Date().toISOString().slice(0, 10);
  data.meta.last_auto_update_source = 'TheSportsDB API, via scripts/update-sports-data.js';

  fs.writeFileSync(sport.file, JSON.stringify(data, null, 2) + '\n');
  console.log(`  added ${newGames.length} new game(s), file now has ${data.games.length} total`);
}

// ============================================================================
// Finishing-position sports: Formula 1 and PGA Tour golf (added 2026-09-24)
// ============================================================================
// These have no home/away score - each event has a field of drivers or
// golfers and a finishing order. The season list gives the events; each
// event's finishing order needs its own call (eventresults.php).
//
// Stored per event: { id, date, event, season, results: [{ position,
// tied, name, team }] }. Only events that actually have results are
// saved, so an event whose results TheSportsDB hasn't posted yet is simply
// retried on the next run. Events already saved are never re-requested,
// which keeps daily runs to a handful of calls.
//
// UNTESTED AGAINST A LIVE RESPONSE: the result field names (intPosition,
// strPlayer, strTeam) come from TheSportsDB's documented data model, not a
// run. The first run logs the fields it actually saw and how many events
// had results - check that before trusting the files.

const RANKED_SPORTS = [
  {
    name: 'Formula 1',
    leagueId: 4370,
    file: path.join(__dirname, '..', 'f1_results_history.json'),
    seasonFormats: plainYears(5),
    // Each race weekend is listed as separate sessions (Practice 1-3,
    // Qualifying, Sprint...). Only the Grand Prix itself decides a result
    // anyone bets on.
    isResultEvent: (name) => /grand prix$/i.test(name || '') && !/practice|qualifying|sprint|shootout/i.test(name || ''),
    eventLabel: (name) => name,
    // F1 results only carry the constructor's ID (no name) - looked up once
    // per new ID via lookupteam.php and kept in the file's meta.
    resolveTeamNames: true,
  },
  {
    name: 'PGA Tour',
    leagueId: 4425,
    file: path.join(__dirname, '..', 'pga_results_history.json'),
    // TheSportsDB switched this league's season names from "2022-2023" to
    // plain "2026"/"2025"/"2024" - checked on its league page 2026-09-24.
    // Both forms are tried for each of the last four years.
    seasonFormats: (year) => {
      const out = [];
      for (let y = year; y > year - 4; y--) out.push(`${y}`, `${y - 1}-${y}`);
      return out;
    },
    // Each tournament is listed round by round ("... Round 1" to "...
    // Final Round"/"Round 4"). The final round's order is the tournament
    // result. Team events (Presidents Cup, Ryder Cup) have no individual
    // finishing order and are skipped.
    isResultEvent: (name) => /(final round|round 4)$/i.test(name || '') && !/presidents cup|ryder cup/i.test(name || ''),
    eventLabel: (name) => (name || '').replace(/\s+(final round|round 4)$/i, ''),
    // Seasons before 2025 list each tournament once, under its plain name
    // ("The Sentry", "WM Phoenix Open") - checked in the 24 Sep 2026 run
    // log. For a season with no round-by-round events at all, those plain
    // entries are used instead.
    isFallbackResultEvent: (name) => !/round|practice|qualifying/i.test(name || '') && !/presidents cup|ryder cup|q school|q-school/i.test(name || ''),
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Returns the results array (possibly empty = TheSportsDB genuinely has no
// results for this event), or null if the request itself FAILED (rate
// limit, server error). A failure must never be treated as "no results" -
// on 24 Sep 2026 a run hit TheSportsDB's rate limit (HTTP 429) and the
// first version of this code wrongly recorded 107 golf events as having
// no results at all.
let rateLimitedUntilNextRun = false;
async function fetchEventResults(eventId) {
  if (rateLimitedUntilNextRun) return null;
  const url = `${BASE_URL}/eventresults.php?id=${eventId}`;
  // Paced at ~50 calls a minute - the 24 Sep run showed ~100 a minute
  // (0.6s apart) is enough to trip the limit once the season lookups
  // earlier in the run are counted too.
  for (let attempt = 1; attempt <= 3; attempt++) {
    await sleep(1200);
    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json();
      return json.results || [];
    }
    if (res.status === 429 && attempt < 3) {
      console.log(`  rate limited (HTTP 429) - waiting 60s before retrying (attempt ${attempt} of 3)`);
      await sleep(60000);
      continue;
    }
    console.log(`  HTTP ${res.status} calling eventresults.php?id=${eventId}`);
    if (res.status === 429) {
      rateLimitedUntilNextRun = true;
      console.log('  still rate limited after retries - stopping result fetches for this run; the rest will be picked up tomorrow');
    }
    return null;
  }
  return null;
}

// Schema 2 (24 Sep 2026): also keeps competitors who didn't finish (F1
// retirements, golfers who missed the cut or withdrew) with position null
// and the reason in status. Without them, a golfer who misses the cut
// half the time would look like a top-10 regular, because only the weeks
// he made the cut would be counted.
const RANKED_SCHEMA_VERSION = 2;
function toResultRow(r) {
  if (!r.strPlayer) return null;
  const raw = r.intPosition ?? r.strPosition ?? null;
  const match = raw === null ? null : String(raw).match(/\d+/);
  return {
    position: match ? Number(match[0]) : null,
    tied: match ? /^t/i.test(String(raw).trim()) : false,
    status: match ? null : (raw === null || raw === '' ? 'DNF' : String(raw)),
    name: r.strPlayer,
    team_id: r.idTeam || null,
    // Race time for F1, total strokes for golf - kept for future patterns.
    detail: r.strDetail || null,
  };
}

async function lookupTeamName(teamId) {
  await sleep(600);
  const res = await fetch(`${BASE_URL}/lookupteam.php?id=${teamId}`);
  if (!res.ok) return null;
  const json = await res.json();
  return (json.teams && json.teams[0] && json.teams[0].strTeam) || null;
}

async function updateRankedSport(sport) {
  console.log(`\n=== ${sport.name} ===`);
  const data = JSON.parse(fs.readFileSync(sport.file, 'utf8'));
  // Events saved by the first version of this pipeline (24 Sep 2026) lack
  // team_id/detail. Dropping them here means they're fetched again once,
  // with the fuller fields, then never again.
  // Events saved under an older schema are dropped and fetched again once
  // with the fuller fields, then never again.
  const beforeCount = data.events.length;
  if (data.meta.schema_version !== RANKED_SCHEMA_VERSION) {
    data.events = [];
    data.meta.schema_version = RANKED_SCHEMA_VERSION;
  }
  const refreshed = beforeCount - data.events.length;
  if (refreshed) console.log(`  re-fetching ${refreshed} event(s) saved under an older format (one-off, adds non-finishers)`);
  const savedIds = new Set(data.events.map((e) => String(e.id)));
  // Events more than 60 days old that still had no results are remembered
  // and skipped, so each run doesn't keep re-asking for results that
  // TheSportsDB is never going to post. Clear meta.no_results_ids to retry.
  // The original no_results_ids list (24 Sep 2026) was filled by rate-limit
  // failures, not real "no results" answers - discarded so those events
  // are fetched properly.
  const hadOldList = 'no_results_ids' in data.meta;
  delete data.meta.no_results_ids;
  data.meta.no_results_event_ids = data.meta.no_results_event_ids || [];
  const noResultIds = new Set(data.meta.no_results_event_ids);
  const noResultsBefore = noResultIds.size;
  const currentYear = new Date().getUTCFullYear();
  const today = new Date().toISOString().slice(0, 10);

  const candidates = [];
  for (const season of sport.seasonFormats(currentYear)) {
    const events = await fetchSeason(sport.leagueId, season);
    let relevant = events.filter((e) => sport.isResultEvent(e.strEvent));
    let usedFallback = false;
    if (!relevant.length && sport.isFallbackResultEvent) {
      relevant = events.filter((e) => sport.isFallbackResultEvent(e.strEvent));
      usedFallback = relevant.length > 0;
    }
    if (events.length) {
      console.log(`  season "${season}" returned ${events.length} events, ${relevant.length} of them result events${usedFallback ? ' (older single-entry format)' : ''}`);
      if (!relevant.length) {
        // Different naming in older seasons - show a few names so the
        // filter can be widened to match them.
        const sample = [...new Set(events.map((e) => e.strEvent))].slice(0, 6).join(' | ');
        console.log(`    (check) sample event names: ${sample}`);
      }
    }
    relevant.forEach((e) => {
      if (e.dateEvent && e.dateEvent <= today && !savedIds.has(String(e.idEvent)) && !noResultIds.has(String(e.idEvent))) {
        candidates.push({ ...e, season });
      }
    });
  }
  console.log(`  ${candidates.length} finished event(s) not yet saved - fetching their results`);

  let added = 0;
  let empty = 0;
  let failed = 0;
  let loggedResultFields = false;
  for (const [i, e] of candidates.entries()) {
    if (i && i % 25 === 0) console.log(`  ...${i} of ${candidates.length} fetched`);
    const results = await fetchEventResults(e.idEvent);
    if (results === null) { failed += 1; continue; } // request failed - retry next run, never mark as empty
    if (results.length && !loggedResultFields) {
      loggedResultFields = true;
      console.log(`  (check) result fields seen: ${Object.keys(results[0]).join(', ')}`);
      console.log(`  (check) first result row: ${JSON.stringify(results[0]).slice(0, 300)}`);
    }
    const rows = results.map(toResultRow).filter(Boolean)
      .sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity));
    if (!rows.some((r) => r.position !== null)) {
      empty += 1;
      const ageDays = (Date.parse(today) - Date.parse(e.dateEvent)) / 86400000;
      if (ageDays > 60) noResultIds.add(String(e.idEvent));
      continue;
    }
    const finishers = rows.filter((r) => r.position !== null).length;
    data.events.push({ id: String(e.idEvent), date: e.dateEvent, event: sport.eventLabel(e.strEvent), season: e.season, finishers, results: rows });
    savedIds.add(String(e.idEvent));
    added += 1;
  }
  data.meta.no_results_event_ids = [...noResultIds];
  const statusCounts = {};
  data.events.forEach((ev) => ev.results.forEach((r) => { if (r.status) statusCounts[r.status] = (statusCounts[r.status] || 0) + 1; }));
  if (Object.keys(statusCounts).length) console.log(`  (check) non-finisher statuses kept: ${JSON.stringify(statusCounts).slice(0, 200)}`);
  else if (data.events.length) console.log('  (check) no non-finisher rows in the data - TheSportsDB only lists finishers for this sport');
  if (failed) console.log(`  ${failed} event(s) couldn't be fetched this run (request failed) - will retry next run`);
  const newlyDead = noResultIds.size - noResultsBefore;
  if (empty) console.log(`  ${empty} event(s) had no usable results (${empty - newlyDead} recent - will retry; ${newlyDead} over 60 days old - won't be asked for again)`);

  if (sport.resolveTeamNames) {
    data.meta.team_names = data.meta.team_names || {};
    const unknown = [...new Set(data.events.flatMap((e) => e.results.map((r) => r.team_id)))]
      .filter((id) => id && !data.meta.team_names[id]);
    for (const id of unknown) {
      const name = await lookupTeamName(id);
      if (name) data.meta.team_names[id] = name;
    }
    if (unknown.length) console.log(`  looked up ${unknown.length} team name(s)`);
    if (!added && unknown.length) added = -1; // names changed - still save
  }

  if (!added && !refreshed && !newlyDead && !hadOldList) {
    console.log('  no new events to add');
    return;
  }
  data.events.sort((a, b) => (a.date < b.date ? 1 : -1));
  data.meta.row_count = data.events.length;
  data.meta.last_auto_update = today;
  data.meta.last_auto_update_source = 'TheSportsDB API, via scripts/update-sports-data.js';
  fs.writeFileSync(sport.file, JSON.stringify(data, null, 2) + '\n');
  console.log(`  added ${Math.max(added, 0)} event(s), file now has ${data.events.length} total`);
}

async function main() {
  for (const sport of SPORTS) {
    try {
      await updateSport(sport);
    } catch (err) {
      // One sport failing shouldn't block the others from updating.
      console.error(`  ERROR updating ${sport.name}:`, err.message);
    }
  }
  for (const sport of RANKED_SPORTS) {
    try {
      await updateRankedSport(sport);
    } catch (err) {
      console.error(`  ERROR updating ${sport.name}:`, err.message);
    }
  }
}

main();
