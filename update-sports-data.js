// Fetches recent EPL and NFL results from TheSportsDB's free API and
// merges any games not already present into the existing
// epl_full_match_history.json / nfl_full_match_history.json files.
//
// Runs unattended via .github/workflows/update-sports-data.yml on a
// schedule - this script never needs to be run by hand, but you can run
// it locally with `node scripts/update-sports-data.js` to test it.
//
// Data source: TheSportsDB (https://www.thesportsdb.com), free tier,
// key "123" - no signup required, confirmed working for EPL (league id
// 4328) and NFL (league id 4391) as of Sept 2026. Free tier does not
// include betting odds, so newly-added games have null odds fields -
// same convention already used for older/incomplete rows in these files.
//
// IMPORTANT - first run should be checked by hand: the season-string
// format TheSportsDB expects for NFL wasn't confirmed the same way EPL's
// was (EPL is definitely "2025-2026" style; NFL might be a single year
// like "2026" instead). This script tries both and uses whichever
// returns data, but if NFL comes back empty for several weeks running,
// that's the first thing to check.

const fs = require('fs');
const path = require('path');

const API_KEY = '123'; // TheSportsDB free tier key - documented as public, no registration
const BASE_URL = `https://www.thesportsdb.com/api/v1/json/${API_KEY}`;

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
];

function normalizeTeamName(name, aliases) {
  return aliases[name] || name;
}

async function fetchSeason(leagueId, season) {
  const url = `${BASE_URL}/eventsseason.php?id=${leagueId}&s=${season}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = await res.json();
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
  }
  if (sport.name === 'NFL') {
    row.home_odds_close = null;
    row.away_odds_close = null;
    row.playoff_game = event.strDescriptionEN && /playoff|super bowl/i.test(event.strDescriptionEN) ? 'Y' : null;
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
  data.meta.last_auto_update_source = 'TheSportsDB free API, via scripts/update-sports-data.js';

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
