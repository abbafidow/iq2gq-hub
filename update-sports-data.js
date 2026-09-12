// Fetches recent results for EPL, NFL, NRL, Super Rugby, AFL and NPC from
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
// NFL 4391, NRL 4416, Super Rugby 4551, AFL 4456, NPC 5278.
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
];

function normalizeTeamName(name, aliases) {
  return aliases[name] || name;
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
  if (homeScore === null || homeScore === undefined || awayScore === null || awayScore === undefined) return null;

  const row = {
    date: event.dateEvent,
    home_team: normalizeTeamName(event.strHomeTeam, sport.teamAliases),
    away_team: normalizeTeamName(event.strAwayTeam, sport.teamAliases),
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

function gameKey(g) {
  return `${g.date}|${g.home_team}|${g.away_team}`;
}

async function updateSport(sport) {
  console.log(`\n=== ${sport.name} ===`);
  const raw = fs.readFileSync(sport.file, 'utf8');
  const data = JSON.parse(raw);

  const existingKeys = new Set(data.games.map(gameKey));
  const currentYear = new Date().getUTCFullYear();

  let fetched = [];
  for (const season of sport.seasonFormats(currentYear)) {
    const events = await fetchSeason(sport.leagueId, season);
    if (events.length) {
      console.log(`  season "${season}" returned ${events.length} events`);
      fetched = fetched.concat(events);
    } else {
      console.log(`  season "${season}" returned no events (trying next format if any)`);
    }
  }

  const newGames = [];
  fetched.forEach((event) => {
    const row = toGameRow(event, sport);
    if (!row) return;
    if (existingKeys.has(gameKey(row))) return;
    existingKeys.add(gameKey(row));
    newGames.push(row);
  });

  if (!newGames.length) {
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

async function main() {
  for (const sport of SPORTS) {
    try {
      await updateSport(sport);
    } catch (err) {
      // One sport failing shouldn't block the other from updating.
      console.error(`  ERROR updating ${sport.name}:`, err.message);
    }
  }
}

main();
