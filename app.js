const API_URL = 'https://script.google.com/macros/s/AKfycbyEQsjdYNmRx7Q3U1pmmVlwH8-qvk6cjXy6JWzX4xoCwdB3_VwvCu9l0mJ0ylb5bySR/exec';

const state = {
  raw: [],
  apiCount: 0,
  page: 'dashboard',
  sort: {},
  sportDrilldown: false,
  statsTab: null, // null (shows ball selector) | 'members' | 'sports' | 'bettypes' | 'odds'
  selectedMember: null, // shared "who am I" selection for Pick Assistant / Stats -> Members / Records
  filters: { member: '', group: '', betType: '', year: '', odds: '', result: '', query: '' }, // Search-page-local
};

const MEMBER_NICKNAMES = { TP: 'Te Pioneer', LS: 'Wayfinder', MA: 'Chief', TF: 'Reformer', MV: 'Ace', SB: 'Maverick' };

function memberPickerHtml(promptText) {
  const members = Object.keys(TEAM_MAP).slice().sort();
  const buttons = members.map(m => {
    const nick = MEMBER_NICKNAMES[m];
    return `<button class="member-pick-btn" data-member="${m}"><span class="member-pick-code">${m}</span>${nick ? `<span class="member-pick-nick">${escapeHtml(nick)}</span>` : ''}</button>`;
  }).join('');
  return `<p class="member-pick-prompt">${escapeHtml(promptText || 'Select your name below to personalise for you.')}</p><div class="member-pick-grid">${buttons}</div>`;
}

function bindMemberPicker() {
  setTimeout(() => {
    document.querySelectorAll('.member-pick-btn').forEach(btn => {
      btn.onclick = () => {
        state.selectedMember = btn.dataset.member;
        render();
      };
    });
  }, 0);
}

const ODDS = [
  ['under1.20', 'Under 1.20', 1, 1.199999],
  ['1.20-1.39', '1.20-1.39', 1.2, 1.399999],
  ['1.40-1.59', '1.40-1.59', 1.4, 1.599999],
  ['1.60-1.89', '1.60-1.89', 1.6, 1.899999],
  ['1.90-1.99', '1.90-1.99', 1.9, 1.999999],
  ['2plus', '2.00+', 2, 999],
];

// Team membership, Aug 2026 AGM decision. Captain is the first-named member
// of each team. This is hardcoded here as a first cut - the agreed long-term
// source of truth is a Member -> Team lookup on the Lists tab, once that
// column exists and the Hub API (Code.gs) exposes it.
const TEAM_MAP = {
  MA: 'Team One', AA: 'Team One', SB: 'Team One',
  AF: 'Team Two', LS: 'Team Two', SF: 'Team Two',
  AT: 'Team Three', PN: 'Team Three', TP: 'Team Three',
  MV: 'Team Four', JF: 'Team Four', TF: 'Team Four',
};
const TEAM_ORDER = ['Team One', 'Team Two', 'Team Three', 'Team Four'];

const $ = id => document.getElementById(id);
const clean = value => String(value ?? '').trim();
const lower = value => clean(value).toLowerCase();
const num = value => {
  const n = parseFloat(String(value ?? '').replace(/[$,%]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const pct = value => `${((Number.isFinite(value) ? value : 0) * 100).toFixed(1)}%`;
const oddsFmt = value => Number.isFinite(value) ? value.toFixed(2) : '-';

function pick(row, names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row, name) && clean(row[name]) !== '') return row[name];
  }
  const normalised = Object.fromEntries(Object.keys(row).map(k => [k.toLowerCase().replace(/[^a-z0-9]/g, ''), k]));
  for (const name of names) {
    const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalised[key] && clean(row[normalised[key]]) !== '') return row[normalised[key]];
  }
  return '';
}

// The Sheet accumulates inconsistent capitalization over years of manual
// entry (e.g. "H2H", "h2h", "H2h" all meaning the same thing). Grouped
// views already lowercase before comparing so they're unaffected, but exact
// -match fields (Rate Your Pick's dropdowns, comboCandidates' keys/labels)
// need one consistent string per real-world value, or the same underlying
// bet type/team/sport silently fragments into several. Picks whichever
// exact casing is most common in the data as the canonical form.
function canonicalizeCasing(rows, field) {
  const variantCounts = new Map();
  rows.forEach(r => {
    const value = r[field];
    if (!value) return;
    const key = value.toLowerCase();
    if (!variantCounts.has(key)) variantCounts.set(key, new Map());
    const variants = variantCounts.get(key);
    variants.set(value, (variants.get(value) || 0) + 1);
  });
  const canonical = new Map();
  variantCounts.forEach((variants, key) => {
    let best = null, bestCount = -1;
    variants.forEach((count, casing) => { if (count > bestCount) { best = casing; bestCount = count; } });
    canonical.set(key, best);
  });
  rows.forEach(r => {
    const value = r[field];
    if (!value) return;
    r[field] = canonical.get(value.toLowerCase());
  });
}

function normalise(row, index) {

  const member = clean(row["Member code"]);

  const year = clean(row["Synd. Year"]);

  const date = clean(row["Date"]);

  const sport = clean(row["Sport"]);

  const betType = clean(row["Bet Type"]);

  const name = clean(row["Option"]);

  const key = clean(row["Key"]);

  const mm = clean(row["MM drop"]);
  const mmKiller = clean(row["MM Killer?"]);

  const winningMM = clean(row["Winning MM?"]);

  const tierKiller = clean(row["Tier Killer?"]);

  const lonesomeLoser = clean(row["Lonesome Loser?"]);

  const comments = clean(row["Comments"]);

  const odds = num(row["Odds"]);

  const mmReturn = num(row["MM Return"]) || 0;

  const resultRaw = lower(row["Result"]);

  let result = "";

  if (["yes","y","win","won","true","1"].includes(resultRaw))
    result = "Win";

  else if (["no","n","loss","lost","false","0"].includes(resultRaw))
    result = "Loss";

  return {

    key: key || String(index + 1),

    member: member || "Unknown",

    year,

    date,

    sport,

    group: sportGroup(sport),

    betType,

    betTypeGroup: betTypeGroup(betType),

    name,

    odds,

    mmReturn,

    result,

    win: result === "Win",

    loss: result === "Loss",

    mm,
    mmKiller,

    winningMM,

    tierKiller,

    lonesomeLoser,

    comments,

    row

  };

}

// A middle tier between the raw sport string (used by Search) and the
// broad sportGroup (used by Stats/Dashboard) - consolidates competitions
// that have simply been renamed over the years, without merging genuinely
// different competitions or eras where the underlying picks aren't safely
// knowable to be the same thing. Used by Rate Your Pick, where statistical
// robustness matters more than granularity.
function competitionFamily(sport, teamName) {
  const x = lower(sport);

  // Super Rugby: renamed several times (regional splits during COVID,
  // current Pacific-wide format) but it's the same underlying competition.
  if (x.includes('super rugby')) return 'Super Rugby';

  // Six Nations: "Six Nations" / "6 Nations", same thing.
  if (x.includes('six nations') || x === '6 nations') return 'Six Nations';

  // English club rugby: Premiership Rugby was renamed Gallagher
  // Premiership on a new sponsorship deal - same competition.
  if (x.includes('gallagher premiership') || x.includes('premiership rugby') || x === 'rugby union (english domestic)') return 'English Premiership Rugby';

  // French club rugby: Top 14 / French Top 14, same competition. Pro D2
  // is genuinely the second tier, kept separate.
  if (x.includes('top 14')) return 'French Top 14';

  // Pro14 was renamed United Rugby Championship when South African teams
  // joined - same underlying competition, real rename.
  if (x.includes('pro14') || x.includes('pro 14') || x.includes('united rugby championship')) return 'United Rugby Championship';

  // German football: Bundesliga renamed/reformatted label over the years.
  if (x.includes('bundesliga')) return 'German Bundesliga';

  // Spanish football: La Liga / Spanish Domestic, same competition.
  if (x.includes('la liga') || x === 'football (spanish domestic)') return 'Spanish La Liga';

  // Rugby World Cup: "World Cup" / "Mens World Cup", same event (women's
  // version already says so explicitly and stays separate).
  if (x.includes('rugby union') && x.includes('world cup') && !x.includes('womens')) return 'Rugby World Cup';

  // MMA: fold all promotions together (UFC, Bellator, TUF, bare MMA).
  if (x.includes('mma')) return 'MMA';

  // Basketball NBL: genuinely ambiguous on its own, since both Australia
  // and NZ have a league called this. NZ Breakers play in the Australian
  // league (ANBL) despite being an NZ-based team; anything else under a
  // bare "NBL" label defaults to the NZ domestic league (NZNBL), since
  // ANBL/NZNBL-labelled rows already say which one they are. This default
  // is an assumption, not a confirmed rule - flag any misclassifications.
  if (x.includes('anbl') || (teamName && lower(teamName).includes('nz breakers'))) return 'Basketball (ANBL)';
  if (x.includes('nznbl')) return 'Basketball (NZNBL)';
  if (x === 'basketball (nbl)') return 'Basketball (NZNBL)';

  // Genuinely ambiguous historical catch-alls - do NOT merge into any
  // specific competition, since the underlying picks could plausibly be
  // any of several different real competitions and merging would silently
  // misattribute data into the wrong bucket.
  if (x === 'football (england domestic)') return 'Football (England Domestic - mixed competitions)';
  if (x === 'rugby union (european competition)') return 'Rugby Union (European Competition - mixed competitions)';

  // Default: no known family, just use the sport as-is.
  return sport || 'Other';
}

function sportGroup(sport) {
  const x = lower(sport);
  if (x.includes('rugby league') || x.includes('nrl') || x.includes('super league')) return 'Rugby League';
  if (x.includes('rugby union') || x.includes('super rugby') || x.includes('six nations') || x.includes('npc')) return 'Rugby Union';
  if (x.includes('american football') || x.includes('nfl') || x.includes('ncaaf')) return 'American Football';
  if (x.includes('football') || x.includes('epl') || x.includes('premier league') || x.includes('soccer')) return 'Football';
  if (x.includes('basketball') || x.includes('nba') || x.includes('anbl') || x.includes('wnbl')) return 'Basketball';
  if (x.includes('afl')) return 'AFL';
  if (x.includes('mma') || x.includes('ufc')) return 'MMA';
  if (x.includes('olympic')) return 'Olympics';
  return sport ? sport.split('(')[0].trim() : 'Other';
}

function betTypeGroup(betType) {
  const x = lower(betType);
  if (x.includes('h2h') || x.includes('head to head') || x.includes('moneyline')) return 'Head to Head (H2H)';
  if (x.includes('point start') || x.includes('points start') || x.includes('handicap') || x.includes('line ')) return 'Point Starts';
  if (x.includes('margin')) return 'Winning Margins';
  if (x.includes('scorer') || x.includes('anytime') || x.includes('try scorer') || x.includes('goal scorer')) return 'Anytime Scorers';
  if (x.includes('total') || x.includes('over') || x.includes('under')) return 'Totals (Over/Under)';
  if (x.includes('half/full') || (x.includes('half time') && x.includes('full time'))) return 'Half Time/Full Time';
  if (x.includes('multi') || x.includes('parlay') || x.includes('accumulator')) return 'Multis';
  if (x.includes('future') || x.includes('outright') || x.includes('premiership') || x.includes('winner')) return 'Futures/Outrights';
  return betType || 'Other';
}

function qualifies(row) {

  // Ignore future template rows
  if (!row.name) return false;

  if (!row.sport) return false;

  if (!row.betType) return false;

  return true;
}

async function init() {
  try {
    const res = await fetch(`${API_URL}?v=${Date.now()}`, { cache: 'no-store' });

    const json = await res.json();

    console.log("API count:", json.count);
    console.log("API data length:", json.data.length);

    state.apiCount = Number(json.count || 0);
    state.raw = (json.data || []).map(normalise).filter(r => r.name !== '');
    canonicalizeCasing(state.raw, 'betType');
    canonicalizeCasing(state.raw, 'name');
    canonicalizeCasing(state.raw, 'sport');

    bind();
    render();
    $('status').textContent = `${state.raw.length.toLocaleString()} picks loaded from Google Sheets (${state.apiCount.toLocaleString()} source rows)`;
  } catch (error) {
    $('status').textContent = 'Could not load Google Sheet data';
    console.error(error);
  }
}

function isRealPick(row) {
  // Excludes admin/non-pick rows (e.g. Stand Down) from team-MM detection,
  // so a standing-down member doesn't get silently counted as part of a drop.
  const name = lower(row.name);
  const betType = lower(row.betType);
  return name !== 'stand down' && betType !== 'stand down';
}

// A team's weekly MM is "dropped" when all three of that team's members have
// a real pick recorded for the same date (columns H/I/J/K all filled in per
// member), and "successful" when all three of those picks won (column L =
// Yes for everyone). There is no dedicated flag column for this on the
// Sheet - it's derived purely from team membership + date, confirmed against
// how the Sheet's own Team Race table works.
function computeTeamMM(rows) {
  const perTeamDate = new Map();
  rows.forEach(row => {
    const team = teamOf(row.member);
    if (!team || !isRealPick(row)) return;
    if (!perTeamDate.has(team)) perTeamDate.set(team, new Map());
    const byDate = perTeamDate.get(team);
    if (!byDate.has(row.date)) byDate.set(row.date, []);
    byDate.get(row.date).push(row);
  });
  const result = new Map();
  perTeamDate.forEach((byDate, team) => {
    const teamMembers = Object.keys(TEAM_MAP).filter(m => TEAM_MAP[m] === team);
    byDate.forEach((memberRows, date) => {
      const membersPresent = uniq(memberRows.map(r => r.member));
      const dropped = teamMembers.length > 0 && teamMembers.every(m => membersPresent.includes(m));
      if (!dropped) return;
      const successful = memberRows.every(r => r.win);
      result.set(`${date}||${team}`, { team, date, successful, memberRows });
    });
  });
  return result;
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
}

function bind() {
  document.querySelectorAll('.tab').forEach(button => {
    button.onclick = () => {
      state.page = button.dataset.page;
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      button.classList.add('active');
      render();
    };
  });
}

function filtered() {
  let data = [...state.raw];
  const { member, group, betType, year, odds, result, query } = state.filters;
  if (member) data = data.filter(r => r.member === member);
  if (group) data = data.filter(r => r.group === group);
  if (betType) data = data.filter(r => r.betTypeGroup === betType);
  if (year) data = data.filter(r => r.year === year);
  if (result) data = data.filter(r => r.result === result);
  if (odds) {
    const band = ODDS.find(x => x[0] === odds);
    if (band) data = data.filter(r => r.odds >= band[2] && r.odds <= band[3]);
  }
  if (query) {
    const q = lower(query);
    data = data.filter(r => [r.member, r.sport, r.group, r.betType, r.name, r.year].join(' ').toLowerCase().includes(q));
  }
  return data;
}

function presidentialRace(data) {
  const teamMM = computeTeamMM(data);
  const map = new Map();
  data.forEach(row => {
    if (!row.member) return;
    if (!map.has(row.member)) {
      map.set(row.member, { name: row.member, points: 0, picks: 0, wins: 0, losses: 0, mmBonus: 0, bigWins: 0, bigLosses: 0, winOddsSum: 0, lowestLossOdds: null });
    }
    const m = map.get(row.member);
    m.picks += 1;
    if (row.win) {
      m.points += 0.5; m.wins += 1;
      if (Number.isFinite(row.odds)) m.winOddsSum += row.odds;
    }
    if (row.loss) {
      m.points -= 1; m.losses += 1;
      if (Number.isFinite(row.odds) && (m.lowestLossOdds === null || row.odds < m.lowestLossOdds)) m.lowestLossOdds = row.odds;
    }
    const team = teamOf(row.member);
    const entry = team ? teamMM.get(`${row.date}||${team}`) : null;
    if (entry && entry.successful) { m.points += 1.5; m.mmBonus += 1; }
    if (row.win && Number.isFinite(row.odds) && row.odds >= 2) { m.points += 3; m.bigWins += 1; }
    if (row.loss && Number.isFinite(row.odds) && row.odds >= 2) { m.points -= 3; m.bigLosses += 1; }
  });

  const teamWinningsByTeam = new Map(teamStats(data).map(t => [t.name, t.winnings]));

  // Official tiebreaker order when total points are equal:
  // 1. Wins (highest) 2. MM wins (highest) 3. Avg winning odds (highest)
  // 4. Lowest individual losing odds (lowest) 5. Team MM winnings (highest)
  // 6. Coin flip / spin the wheel - not automatable, flagged instead.
  const rows = [...map.values()].map(m => ({
    ...m,
    avgWinOdds: m.wins ? m.winOddsSum / m.wins : 0,
    lowestLossOdds: m.lowestLossOdds === null ? -Infinity : m.lowestLossOdds,
    teamWinnings: teamOf(m.name) ? (teamWinningsByTeam.get(teamOf(m.name)) || 0) : 0,
  })).sort((a, b) =>
    (b.points - a.points) ||
    (b.wins - a.wins) ||
    (b.mmBonus - a.mmBonus) ||
    (b.avgWinOdds - a.avgWinOdds) ||
    (a.lowestLossOdds - b.lowestLossOdds) ||
    (b.teamWinnings - a.teamWinnings) ||
    a.name.localeCompare(b.name) // unresolved after every tiebreaker - needs an actual coin flip/wheel
  );
  return rows.map((row, index, arr) => {
    const tiedWithNeighbour = other => other && row.points === other.points && row.wins === other.wins &&
      row.mmBonus === other.mmBonus && row.avgWinOdds === other.avgWinOdds &&
      row.lowestLossOdds === other.lowestLossOdds && row.teamWinnings === other.teamWinnings;
    const needsCoinFlip = tiedWithNeighbour(arr[index - 1]) || tiedWithNeighbour(arr[index + 1]);
    return {
      ...row,
      rank: index + 1,
      needsCoinFlip,
      title: index === 0 ? 'Minor Premier' : index === 1 ? 'Runner-up' : index === arr.length - 1 && arr.length > 2 ? 'Benson' : '',
    };
  });
}

function presidentialCols() {
  return [
    { key: 'rank', label: 'Rank', type: 'num' },
    { key: 'name', label: 'Member', primary: true },
    { key: 'points', label: 'Points', type: 'num1' },
    { key: 'wins', label: 'Wins', type: 'num' },
    { key: 'losses', label: 'Losses', type: 'num' },
    { key: 'mmBonus', label: 'Successful MMs', type: 'num' },
    { key: 'bigWins', label: '$2+ wins', type: 'num' },
    { key: 'bigLosses', label: '$2+ losses', type: 'num' },
    { key: 'title', label: 'Standing' },
  ];
}

function aggregate(data, key) {
  const map = new Map();
  data.forEach(row => {
    const name = row[key] || 'Unknown';
    if (!map.has(name)) map.set(name, { name, picks: 0, wins: 0, losses: 0, oddsSum: 0 });
    const item = map.get(name);
    item.picks += 1;
    if (row.win) item.wins += 1;
    if (row.loss) item.losses += 1;
    item.oddsSum += row.odds || 0;
  });
  return [...map.values()].map(item => ({
    ...item,
    success: item.picks ? item.wins / item.picks : 0,
    avgOdds: item.picks ? item.oddsSum / item.picks : 0,
    confidence: item.picks >= 50 ? 'High' : item.picks >= 20 ? 'Moderate' : 'Low',
  }));
}

function sortRows(rows, table, defaultKey = 'success') {
  const sort = state.sort[table] || { key: defaultKey, dir: -1 };
  return rows.sort((a, b) => {
    const av = sortValue(a, sort.key);
    const bv = sortValue(b, sort.key);
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sort.dir;
    return String(av ?? '').localeCompare(String(bv ?? '')) * sort.dir;
  });
}

function sortValue(row, key) {
  if (key === 'currentStreak') return row.streakValue ?? 0;
  if (key === 'last10') return row.last10Value ?? 0;
  return row[key];
}

function table(rows, tableId, columns) {
  const sort = state.sort[tableId] || {};
  const head = columns.map(col => {
    const marker = sort.key === col.key ? (sort.dir === -1 ? ' ↓' : ' ↑') : '';
    return `<th data-table="${tableId}" data-key="${col.key}">${col.label}${marker}</th>`;
  }).join('');
  const body = rows.map(row => `<tr>${columns.map(col => `<td>${format(col, row[col.key], row)}</td>`).join('')}</tr>`).join('');
  const cards = rows.map(row => `<div class="mini-card">${cardContent(columns, row)}</div>`).join('');
  setTimeout(() => {
    document.querySelectorAll(`th[data-table="${tableId}"]`).forEach(th => {
      th.onclick = () => {
        const id = th.dataset.table;
        const key = th.dataset.key;
        const current = state.sort[id] || {};
        state.sort[id] = { key, dir: current.key === key ? -current.dir : -1 };
        render();
      };
    });
  }, 0);
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div><div class="cards compact-cards">${cards}</div>`;
}

function format(column, value) {
  if (column.type === 'pct') return `<span class="good">${pct(value)}</span>`;
  if (column.type === 'num') return Number(value || 0).toLocaleString();
  if (column.type === 'num1') return Number(value || 0).toFixed(1);
  if (column.type === 'odds') return oddsFmt(value);
  return escapeHtml(value ?? '');
}

function cardContent(columns, row) {
  const titleKey = columns.find(c => c.primary)?.key || columns[1]?.key || columns[0].key;
  const rank = row.rank ? `#${row.rank}` : '';
  const preferred = ['picks', 'success', 'avgOdds', 'confidence', 'streak', 'wins', 'losses'];
  const eligible = columns.filter(col => !col.primary && col.key !== 'rank');
  const preferredMatches = preferred
    .map(key => eligible.find(col => col.key === key))
    .filter(Boolean);
  // Tables whose columns aren't in the preferred list (e.g. Recent picks:
  // bet/betType/sport/odds/result) previously showed nothing on mobile
  // beyond the title and rank - fall back to the table's own column order.
  // Tables whose columns aren't in the preferred list (e.g. Recent picks:
  // bet/betType/sport/odds/result) previously showed nothing on mobile
  // beyond the title and rank - fall back to the table's own columns,
  // prioritising the fields most worth seeing at a glance on a small card.
  const mobilePriority = ['result', 'odds', 'sport', 'bet', 'betType', 'year'];
  const fallback = eligible.slice().sort((a, b) => {
    const ai = mobilePriority.indexOf(a.key);
    const bi = mobilePriority.indexOf(b.key);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
  const visible = (preferredMatches.length ? preferredMatches : fallback).slice(0, 4);
  const stats = visible.map(col => `<div><span class="muted">${col.label}</span><strong>${format(col, row[col.key], row)}</strong></div>`).join('');
  return `<div class="mini-title"><span>${escapeHtml(row[titleKey])}</span><span>${rank}</span></div><div class="mini-stats">${stats}</div>`;
}

function rank(rows) {
  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

function seasonStart(year) {
  const text = clean(year);
  const match = text.match(/(\d{2,4})\s*\/\s*(\d{2,4})/);
  if (!match) return -1;
  let start = Number(match[1]);
  if (start < 100) start += 2000;
  return start;
}

function normalisedSeason(year) {
  const start = seasonStart(year);
  if (start < 0) return clean(year);
  return `${start}/${String(start + 1).slice(-2)}`;
}

function seasonEqual(a, b) {
  return normalisedSeason(a) === normalisedSeason(b);
}

function currentYear(data) {
  const seasons = uniq(data.map(r => normalisedSeason(r.year))).filter(Boolean);
  return seasons.sort((a, b) => seasonStart(a) - seasonStart(b)).pop() || '';
}

// ---------- Date helpers (Sheet dates are DD/MM/YYYY - not safe to rely on
// the browser's ambiguous Date.parse for these) ----------

function parseDMY(str) {
  const s = clean(str);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  let y = Number(m[3]);
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function fmtMoney(n) {
  const v = Number.isFinite(n) ? n : 0;
  return `${v < 0 ? '-' : ''}$${Math.abs(v).toFixed(2)}`;
}

// ---------- Season-to-date comparison (this season vs the same elapsed
// window last season, not a straight calendar-quarter match) ----------

function seasonList() {
  return uniq(state.raw.map(r => normalisedSeason(r.year))).filter(Boolean).sort((a, b) => seasonStart(a) - seasonStart(b));
}

function previousSeasonOf(season) {
  const seasons = seasonList();
  const idx = seasons.indexOf(season);
  return idx > 0 ? seasons[idx - 1] : null;
}

function roundDatesSorted(rows) {
  const map = new Map();
  rows.forEach(r => {
    if (!r.win && !r.loss) return; // not resulted yet - round isn't complete
    const parsed = parseDMY(r.date);
    if (parsed && !map.has(r.date)) map.set(r.date, parsed);
  });
  return [...map.entries()].sort((a, b) => a[1] - b[1]).map(([raw]) => raw);
}

function seasonToDateComparison(currentSeason) {
  const current = state.raw.filter(r => seasonEqual(r.year, currentSeason));
  const currentRoundDates = roundDatesSorted(current);
  const roundCount = currentRoundDates.length;
  const prevSeason = previousSeasonOf(currentSeason);
  if (!prevSeason) return { current, previous: null, roundCount };
  const prevAll = state.raw.filter(r => seasonEqual(r.year, prevSeason));
  const previousRoundDates = roundDatesSorted(prevAll);
  if (!roundCount || !previousRoundDates.length) return { current, previous: null, roundCount };
  // Compare the same number of completed rounds (distinct dates), not elapsed
  // calendar time - season starts, byes etc. don't line up year to year.
  const matchedDates = new Set(previousRoundDates.slice(0, roundCount));
  const previous = prevAll.filter(r => matchedDates.has(r.date));
  return { current, previous, roundCount };
}

function seasonMetrics(rows) {
  const wins = rows.filter(r => r.win);
  const losses = rows.filter(r => r.loss);
  const successRate = (wins.length + losses.length) ? wins.length / (wins.length + losses.length) : 0;
  const winnings = rows.reduce((sum, r) => sum + (r.mmReturn || 0), 0);
  const avgWinOdds = wins.length ? wins.reduce((s, r) => s + (r.odds || 0), 0) / wins.length : 0;
  const winningMMs = [...computeTeamMM(rows).values()].filter(e => e.successful).length;
  return { winCount: wins.length, successRate, winnings, avgWinOdds, winningMMs };
}

function extremeOddsPick(rows, wantWin) {
  const pool = rows.filter(r => (wantWin ? r.win : r.loss) && Number.isFinite(r.odds));
  if (!pool.length) return null;
  return pool.reduce((best, r) => (!best || (wantWin ? r.odds > best.odds : r.odds < best.odds)) ? r : best, null);
}

function topSuccessRateTile(rows) {
  const aggRows = aggregate(rows, 'member').filter(x => x.picks > 0);
  if (!aggRows.length) return { names: '-', detail: '' };
  const maxSuccess = Math.max(...aggRows.map(x => x.success));
  const tied = aggRows.filter(x => Math.abs(x.success - maxSuccess) < 1e-9);
  const order = presidentialRace(rows).map(r => r.name);
  tied.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  const sameSample = tied.every(x => x.wins === tied[0].wins && x.picks === tied[0].picks);
  const names = tied.map(x => x.name).join(', ');
  const detail = sameSample
    ? `${tied[0].wins} from ${tied[0].picks}`
    : tied.map(x => `${x.name} ${x.wins}/${x.picks}`).join(' \u00b7 ');
  return { names, detail };
}

// ---------- Teams competition (Team One-Four, agreed at AGM) ----------

function teamOf(member) {
  return TEAM_MAP[member] || null;
}

function teamStats(rows) {
  const winnings = new Map(TEAM_ORDER.map(t => [t, 0]));
  rows.forEach(r => {
    const team = teamOf(r.member);
    if (!team) return;
    winnings.set(team, winnings.get(team) + (r.mmReturn || 0));
  });
  const teamMM = computeTeamMM(rows);
  const dropped = new Map(TEAM_ORDER.map(t => [t, 0]));
  const won = new Map(TEAM_ORDER.map(t => [t, 0]));
  teamMM.forEach(entry => {
    dropped.set(entry.team, dropped.get(entry.team) + 1);
    if (entry.successful) won.set(entry.team, won.get(entry.team) + 1);
  });
  return TEAM_ORDER.map(name => {
    const members = Object.keys(TEAM_MAP).filter(m => TEAM_MAP[m] === name);
    return {
      name,
      members,
      winnings: winnings.get(name),
      mmDropped: dropped.get(name),
      mmWon: won.get(name),
      successRate: dropped.get(name) ? won.get(name) / dropped.get(name) : null,
    };
  });
}

function currentQuarterRange(today = new Date()) {
  const q = Math.floor(today.getUTCMonth() / 3);
  const start = new Date(Date.UTC(today.getUTCFullYear(), q * 3, 1));
  const end = new Date(Date.UTC(today.getUTCFullYear(), q * 3 + 3, 0));
  return { start, end };
}

function currentQuarterLabel(today = new Date()) {
  const { start, end } = currentQuarterRange(today);
  const fmt = d => d.toLocaleDateString('en-NZ', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  return `${fmt(start)} \u2013 ${fmt(end)}`;
}

function teamQuarterForm(today = new Date()) {
  const { start, end } = currentQuarterRange(today);
  const cy = currentYear(state.raw);
  const rows = state.raw.filter(r => {
    if (!seasonEqual(r.year, cy)) return false;
    const d = parseDMY(r.date);
    return d && d >= start && d <= end;
  });
  return teamStats(rows);
}

// ---------- Dashboard tiles (12, grouped: wins & losses / money & people /
// odds - AGM-agreed layout, Aug 2026) ----------

function dashboardTiles(current, previous, roundCount) {
  const cur = seasonMetrics(current);
  const prev = previous ? seasonMetrics(previous) : null;
  const kills = memberFieldLeaderboard(current, 'mmKiller');
  const topSuccess = topSuccessRateTile(current);
  const highOdds = extremeOddsPick(current, true);
  const lowOdds = extremeOddsPick(current, false);

  const tile = (cls, label, value, hint) =>
    `<div class="tile ${cls}"><div class="tile-label">${escapeHtml(label)}</div><div class="tile-value">${value}</div>${hint ? `<div class="tile-hint">${hint}</div>` : ''}</div>`;

  const roundLabel = `after ${roundCount} round${roundCount === 1 ? '' : 's'} last year`;
  const vsLastYear = (fmt, curVal, prevVal) => prev ? `vs ${fmt(prevVal)} ${roundLabel}` : '';

  const winsLosses = [
    tile('tile-teal', 'Success rate', pct(cur.successRate), vsLastYear(pct, cur.successRate, prev?.successRate)),
    tile('tile-teal', 'Successful picks', cur.winCount.toLocaleString(), vsLastYear(v => v.toLocaleString(), cur.winCount, prev?.winCount)),
    tile('tile-teal', 'Winning MMs YTD', cur.winningMMs.toLocaleString(), vsLastYear(v => v.toLocaleString(), cur.winningMMs, prev?.winningMMs)),
  ].join('');

  const moneyPeople = [
    tile('tile-coral', 'Winnings to date', fmtMoney(cur.winnings), vsLastYear(fmtMoney, cur.winnings, prev?.winnings)),
    tile('tile-coral', 'Highest success rate', escapeHtml(topSuccess.names), escapeHtml(topSuccess.detail)),
    tile('tile-coral', 'Most MM kills', kills.count ? escapeHtml(kills.members.join(', ')) : '-', kills.count ? `${kills.count} MM Kill${kills.count === 1 ? '' : 's'}` : ''),
  ].join('');

  const odds = [
    tile('tile-purple', 'Avg winning odds', fmtMoney(cur.avgWinOdds), vsLastYear(fmtMoney, cur.avgWinOdds, prev?.avgWinOdds)),
    tile('tile-purple', 'Highest winning odds', highOdds ? fmtMoney(highOdds.odds) : '-', highOdds ? `${escapeHtml(highOdds.member)} \u00b7 ${escapeHtml(highOdds.name)}` : ''),
    tile('tile-purple', 'Lowest losing odds', lowOdds ? fmtMoney(lowOdds.odds) : '-', lowOdds ? `${escapeHtml(lowOdds.member)} \u00b7 ${escapeHtml(lowOdds.name)}` : ''),
  ].join('');

  return `<div class="tile-group-label">Wins &amp; losses</div><div class="tile-row">${winsLosses}</div>
<div class="tile-group-label">Money &amp; people</div><div class="tile-row">${moneyPeople}</div>
<div class="tile-group-label">Odds</div><div class="tile-row">${odds}</div>`;
}

function presidentialTeamsSection(currentSeasonRows) {
  const presidentialRows = presidentialRace(currentSeasonRows);
  const presTable = presidentialRows.map(r =>
    `<tr><td>${r.rank}</td><td>${escapeHtml(r.name)}${r.title ? ` <span class="muted small">(${escapeHtml(r.title)})</span>` : ''}${r.needsCoinFlip ? ' <span class="muted small" title="Tied on every tiebreaker - needs a coin flip / wheel spin to resolve">\u00b9</span>' : ''}</td><td class="num">${r.points.toFixed(1)}</td></tr>`
  ).join('');

  const teams = teamStats(currentSeasonRows);
  const teamTable = teams.map(t =>
    `<tr><td>${escapeHtml(t.name)}</td><td>${t.members.map((m, i) => i === 0 ? `${escapeHtml(m)}*` : escapeHtml(m)).join(', ')}</td><td class="num">${fmtMoney(t.winnings)}</td><td class="num">${t.successRate === null ? '\u2013' : pct(t.successRate)}</td></tr>`
  ).join('');

  return `<section class="two standings-row">
    <div class="panel standings-panel"><h3>Presidential race</h3><p class="muted small">Current season only. 0.5/win, -1/loss, +1.5 for a successful 3-pick MM, +/-3 for a $2+ win or loss.</p><div class="mini-table-wrap"><table class="mini-table"><thead><tr><th>Rank</th><th>Member</th><th class="num">Pts</th></tr></thead><tbody>${presTable}</tbody></table></div>${presidentialRows.some(r => r.needsCoinFlip) ? '<p class="muted small">\u00b9 Tied on every tiebreaker - needs a coin flip / wheel spin to resolve.</p>' : ''}</div>
    <div class="standings-col">
      <div class="panel standings-panel"><h3>Teams competition</h3><div class="mini-table-wrap"><table class="mini-table"><thead><tr><th>Team</th><th>Members</th><th class="num">Win $</th><th class="num">Succ.%</th></tr></thead><tbody>${teamTable}</tbody></table></div><p class="muted small">* captain</p></div>
      ${teamQuarterFormPanel()}
    </div>
  </section>`;
}

function teamQuarterFormPanel() {
  const teams = teamQuarterForm();
  const withData = teams.filter(t => t.mmDropped > 0);
  const ranked = withData.slice().sort((a, b) => b.winnings - a.winnings);
  const bestName = ranked[0]?.name;
  const worstName = ranked.length > 1 ? ranked[ranked.length - 1]?.name : null;
  const rows = teams.map(t => {
    const cls = withData.length > 1 && t.name === bestName ? 'row-best' : withData.length > 1 && t.name === worstName ? 'row-worst' : '';
    return `<tr class="${cls}"><td>${escapeHtml(t.name)}</td><td class="num">${fmtMoney(t.winnings)}</td><td class="num">${t.successRate === null ? '\u2013' : pct(t.successRate)}</td></tr>`;
  }).join('');
  return `<div class="panel standings-panel form-panel"><h3>Team form this quarter</h3><p class="muted small">${escapeHtml(currentQuarterLabel())} \u00b7 all four teams compared over the same window, independent of each team's own AC captaincy cycle</p><div class="mini-table-wrap"><table class="mini-table"><thead><tr><th>Team</th><th class="num">Win $</th><th class="num">Succ.%</th></tr></thead><tbody>${rows}</tbody></table></div>${bestName && worstName ? `<p class="muted small">Best \u00b7 <span class="good">${escapeHtml(bestName)}</span>&nbsp;&nbsp;Worst \u00b7 <span class="bad">${escapeHtml(worstName)}</span></p>` : ''}</div>`;
}

// ---------- "Insights this year" strip (top sport / bet option / pick
// option, weighted by a minimum-picks confidence floor) ----------

function yearInsightStrip(currentSeasonRows) {
  const MIN_PICKS = 5;
  const topBy = key => {
    const rows = aggregate(currentSeasonRows, key).filter(x => x.picks >= MIN_PICKS);
    if (!rows.length) return null;
    return rows.slice().sort((a, b) => b.success - a.success || b.picks - a.picks)[0];
  };
  const topSport = topBy('group');
  const topBetType = topBy('betTypeGroup');
  const topPick = topBy('name');

  const card = (cls, label, item) => item
    ? `<div class="insight-mini ${cls}"><div class="insight-mini-label">${escapeHtml(label)}</div><div class="insight-mini-value">${escapeHtml(item.name)} ${pct(item.success)}</div></div>`
    : `<div class="insight-mini ${cls}"><div class="insight-mini-label">${escapeHtml(label)}</div><div class="insight-mini-value muted">Not enough data yet (min ${MIN_PICKS} picks)</div></div>`;

  return `<div class="panel"><h3>Insights this year</h3><div class="insight-mini-row">${card('insight-accent', 'Top sport', topSport)}${card('insight-good', 'Top bet option', topBetType)}${card('insight-warn', 'Top pick option', topPick)}</div></div>`;
}

function render() {
  const page = state.page;
  const app = $('app');
  const data = page === 'search' ? filtered() : state.raw;
  if (page === 'dashboard') app.innerHTML = dashboard(data);
  if (page === 'stats') app.innerHTML = statsPage(data);
  if (page === 'records') app.innerHTML = records(data);
  if (page === 'search') app.innerHTML = search(data);
  if (page === 'pickassistant') app.innerHTML = pickAssistant(data);
}

function dashboard(data) {
  const cy = currentYear(state.raw);
  const { current: currentSeasonRows, previous: previousSeasonToDateRows, roundCount } = seasonToDateComparison(cy);
  const presRows = presidentialRace(currentSeasonRows);
  const presidents = presRows.filter(r => r.rank === 1).map(r => r.name);
  const seasonHeading = `<p class="dashboard-season-heading">${escapeHtml(cy || 'Current season')}${presidents.length ? ` | President: ${escapeHtml(presidents.join(', '))}` : ''}</p>`;
  const recent = data.slice().sort(comparePickOrder).slice(-12).reverse().map((r, i) => ({
    rank: i + 1, name: r.member, bet: r.name, betType: r.betType, sport: r.sport, odds: r.odds, result: r.result, year: r.year
  }));
  return `${seasonHeading}
${dashboardTiles(currentSeasonRows, previousSeasonToDateRows, roundCount)}
${presidentialTeamsSection(currentSeasonRows)}
${yearInsightStrip(currentSeasonRows)}
<div class="panel"><h2>Recent picks</h2>${table(recent, 'recentPicks', [
    { key: 'rank', label: '#', type: 'num' },
    { key: 'name', label: 'Member', primary: true },
    { key: 'bet', label: 'Bet' },
    { key: 'betType', label: 'Bet type' },
    { key: 'sport', label: 'Sport' },
    { key: 'odds', label: 'Odds', type: 'odds' },
    { key: 'result', label: 'Result' },
  ])}</div>`;
}

function statsBallSelector() {
  return `<div class="stats-ball-page">
    <p class="stats-ball-prompt">What are you interested in?</p>
    <svg id="statsBall" viewBox="0 0 300 180" class="stats-ball-svg">
      <path data-stats-tab="members" d="M150,90 L150,15 A145,75 0 0 1 295,90 Z" fill="#8a5a34"></path>
      <path data-stats-tab="sports" d="M150,90 L295,90 A145,75 0 0 1 150,165 Z" fill="#7c4f2c"></path>
      <path data-stats-tab="bettypes" d="M150,90 L150,165 A145,75 0 0 1 5,90 Z" fill="#8a5a34"></path>
      <path data-stats-tab="odds" d="M150,90 L5,90 A145,75 0 0 1 150,15 Z" fill="#7c4f2c"></path>
      <path d="M150,15 Q170,90 150,165" fill="none" stroke="#f4ede0" stroke-width="2" style="pointer-events:none;"></path>
      <path d="M5,90 Q150,72 295,90" fill="none" stroke="#f4ede0" stroke-width="2" style="pointer-events:none;"></path>
      <path d="M5,90 Q150,108 295,90" fill="none" stroke="#f4ede0" stroke-width="2" style="pointer-events:none;"></path>
      <line x1="146" y1="55" x2="154" y2="53" stroke="#f4ede0" stroke-width="2" style="pointer-events:none;"></line>
      <line x1="146" y1="65" x2="154" y2="63" stroke="#f4ede0" stroke-width="2" style="pointer-events:none;"></line>
      <line x1="146" y1="75" x2="154" y2="73" stroke="#f4ede0" stroke-width="2" style="pointer-events:none;"></line>
      <line x1="147" y1="60" x2="147" y2="68" stroke="#f4ede0" stroke-width="1.5" style="pointer-events:none;"></line>
      <path d="M150,78 L152.4,85.2 L160,85.2 L153.8,89.8 L156.2,97 L150,92.4 L143.8,97 L146.2,89.8 L140,85.2 L147.6,85.2 Z" fill="#f4ede0" style="pointer-events:none;"></path>
      <text x="215" y="50" text-anchor="middle" class="stats-ball-label">Members</text>
      <text x="215" y="130" text-anchor="middle" class="stats-ball-label">Sports</text>
      <text x="85" y="130" text-anchor="middle" class="stats-ball-label">Bet types</text>
      <text x="85" y="50" text-anchor="middle" class="stats-ball-label">Odds</text>
    </svg>
  </div>`;
}

function statsPage(data) {
  const tabs = [
    { key: 'members', label: 'Members' },
    { key: 'sports', label: 'Sports' },
    { key: 'bettypes', label: 'Bet types' },
    { key: 'odds', label: 'Odds' },
  ];
  if (!state.statsTab) {
    setTimeout(() => {
      document.querySelectorAll('#statsBall path[data-stats-tab]').forEach(p => {
        p.onclick = () => {
          state.statsTab = p.dataset.statsTab;
          render();
        };
      });
    }, 0);
    return statsBallSelector();
  }
  const active = state.statsTab;
  const nav = tabs.map(t =>
    `<button class="stats-tab${t.key === active ? ' active' : ''}" data-stats-tab="${t.key}">${t.label}</button>`
  ).join('');
  const content = active === 'members' ? members(data)
    : active === 'sports' ? sports(data)
    : active === 'bettypes' ? betTypes(data)
    : odds(data);
  setTimeout(() => {
    document.querySelectorAll('.stats-tab').forEach(btn => {
      btn.onclick = () => {
        state.statsTab = btn.dataset.statsTab;
        render();
      };
    });
  }, 0);
  return `<div class="stats-subnav">${nav}</div>${content}`;
}

function members(data) {
  const selected = state.selectedMember;
  if (selected) return memberIntelligence(selected, data);
  bindMemberPicker();
  const rows = rank(sortRows(enrichMembers(aggregate(data, 'member'), data).filter(x => x.picks >= 1), 'membersPage'));
  return `${memberPickerHtml()}<div class="panel"><h2>All members</h2>${table(rows, 'membersPage', memberCols())}</div>`;
}


function memberIntelligence(member, data) {
  const allMemberRows = state.raw.filter(r => r.member === member).sort(comparePickOrder);
  const currentSeason = currentYear(state.raw);
  const currentRows = allMemberRows.filter(r => seasonEqual(r.year, currentSeason));
  const filteredRows = data.filter(r => r.member === member).sort(comparePickOrder);
  const profileData = filteredRows.length ? filteredRows : allMemberRows;
  const career = summary(profileData);
  const careerAll = summary(allMemberRows);
  const season = summary(currentRows);
  const active = activeStreak(allMemberRows);
  const last10 = recentRecord(allMemberRows, 10);
  const last20 = recentRecord(allMemberRows, 20);
  const bestWin = longestStreak(allMemberRows, 'Win');
  const bestLoss = longestStreak(allMemberRows, 'Loss');
  const highWin = allMemberRows.filter(r => r.win && Number.isFinite(r.odds)).sort((a, b) => b.odds - a.odds)[0];
  const latest = allMemberRows.slice(-12).reverse().map((r, i) => ({
    rank: i + 1,
    name: r.member,
    bet: r.name,
    betType: r.betType,
    sport: r.sport,
    odds: r.odds,
    result: r.result,
    year: r.year,
  }));
  const bestSports = rank(sortRows(aggregate(profileData, 'group').filter(x => x.picks >= 5), `memberSports-${member}`, 'success').slice(0, 8));
  const betRows = rank(sortRows(aggregate(profileData, 'betTypeGroup').filter(x => x.picks >= 5), `memberBetTypes-${member}`, 'success').slice(0, 8));
  const oddsRows = rank(sortRows(memberOddsBands(profileData), `memberOdds-${member}`, 'success'));
  const worstSports = rank(sortRows(aggregate(profileData, 'group').filter(x => x.picks >= 5), `memberWorstSports-${member}`, 'success').reverse().slice(0, 5));

  setTimeout(() => {
    const changeLink = document.querySelector('.change-member-link');
    if (changeLink) {
      changeLink.onclick = (e) => {
        e.preventDefault();
        state.selectedMember = null;
        render();
      };
    }
  }, 0);

  return `<section class="member-profile">
    <div class="panel profile-hero">
      <div>
        <p class="eyebrow">Member Intelligence Centre</p>
        <h2>${escapeHtml(member)}${MEMBER_NICKNAMES[member] ? ` <span class="muted">"${escapeHtml(MEMBER_NICKNAMES[member])}"</span>` : ''}</h2>
        <p class="muted">Full career analysis. <a href="#" class="change-member-link">Not you?</a></p>
      </div>
      <div class="profile-badges">
        <span>${career.picks.toLocaleString()} filtered picks</span>
        <span>${careerAll.picks.toLocaleString()} career picks</span>
        <span>${confidence(career.picks)} confidence</span>
      </div>
    </div>

    <section class="grid profile-kpis">
      <div class="kpi"><div class="label">Filtered success</div><div class="value">${pct(career.success)}</div><div class="hint">${career.wins.toLocaleString()} wins / ${career.losses.toLocaleString()} losses</div></div>
      <div class="kpi"><div class="label">Career success</div><div class="value">${pct(careerAll.success)}</div><div class="hint">${careerAll.picks.toLocaleString()} all-time picks</div></div>
      <div class="kpi"><div class="label">${escapeHtml(currentSeason || 'Current season')}</div><div class="value">${season.picks ? pct(season.success) : '-'}</div><div class="hint">${season.picks.toLocaleString()} current-season picks</div></div>
      <div class="kpi"><div class="label">Current streak</div><div class="value">${active.count ? `${active.count}${active.type === 'Win' ? 'W' : 'L'}` : '-'}</div><div class="hint">Best W${bestWin} / Worst L${bestLoss}</div></div>
    </section>

    ${insights(profileData)}

    <section class="two">
      <div class="panel"><h2>Form guide</h2><div class="form-grid">
        ${formCard('Last 5', recentRecord(allMemberRows, 5))}
        ${formCard('Last 10', last10)}
        ${formCard('Last 20', last20)}
        ${formCard('Highest win', { text: highWin ? oddsFmt(highWin.odds) : '-', detail: highWin ? `${highWin.name || highWin.sport || 'Unknown'} (${highWin.year || '-'})` : 'No winning odds found' })}
      </div></div>
      <div class="panel"><h2>Member records</h2><div class="record-list">
        <div><span>Longest winning streak</span><strong>${bestWin}</strong></div>
        <div><span>Longest losing streak</span><strong>${bestLoss}</strong></div>
        <div><span>Average odds</span><strong>${oddsFmt(career.avgOdds)}</strong></div>
        <div><span>Confidence</span><strong>${confidence(career.picks)}</strong></div>
      </div></div>
    </section>

    <section class="two">
      <div class="panel"><h2>Best sports</h2>${table(bestSports, `memberSports-${member}`, sportCols('Sport group'))}</div>
      <div class="panel"><h2>Watch areas</h2><p class="muted">Lower success areas with at least five picks in the current view.</p>${table(worstSports, `memberWorstSports-${member}`, sportCols('Sport group'))}</div>
    </section>

    <section class="two">
      <div class="panel"><h2>Best bet types</h2>${table(betRows, `memberBetTypes-${member}`, sportCols('Bet type group'))}</div>
      <div class="panel"><h2>Odds bands</h2>${table(oddsRows, `memberOdds-${member}`, sportCols('Odds band'))}</div>
    </section>

    <div class="panel"><h2>Latest picks</h2>${table(latest, `memberLatest-${member}`, [
      { key: 'rank', label: '#', type: 'num' },
      { key: 'bet', label: 'Bet', primary: true },
      { key: 'betType', label: 'Bet type' },
      { key: 'sport', label: 'Sport' },
      { key: 'odds', label: 'Odds', type: 'odds' },
      { key: 'result', label: 'Result' },
      { key: 'year', label: 'Year' },
    ])}</div>
  </section>`;
}

function summary(rows) {
  const wins = rows.filter(r => r.win).length;
  const losses = rows.filter(r => r.loss).length;
  const picks = rows.length;
  const oddsRows = rows.filter(r => Number.isFinite(r.odds));
  return {
    picks,
    wins,
    losses,
    success: picks ? wins / picks : 0,
    avgOdds: oddsRows.length ? oddsRows.reduce((sum, r) => sum + r.odds, 0) / oddsRows.length : 0,
  };
}

function recentRecord(rows, n) {
  const recent = rows.slice().sort(comparePickOrder).slice(-n);
  const wins = recent.filter(r => r.win).length;
  return {
    picks: recent.length,
    wins,
    losses: recent.length - wins,
    rate: recent.length ? wins / recent.length : 0,
    text: recent.length ? `${wins}/${recent.length}` : '-',
    detail: recent.length ? `${pct(recent.length ? wins / recent.length : 0)} success` : 'No recent picks',
  };
}

function formCard(label, record) {
  return `<div class="form-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(record.text)}</strong><em>${escapeHtml(record.detail || '')}</em></div>`;
}

function longestStreak(rows, type) {
  const target = type === 'Win' ? 'win' : 'loss';
  let best = 0;
  let current = 0;
  rows.slice().sort(comparePickOrder).forEach(row => {
    const hit = target === 'win' ? row.win : row.loss;
    if (hit) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  });
  return best;
}

function memberOddsBands(data) {
  return ODDS.map(band => {
    const rows = data.filter(r => r.odds >= band[2] && r.odds <= band[3]);
    const wins = rows.filter(r => r.win).length;
    const oddsRows = rows.filter(r => Number.isFinite(r.odds));
    return {
      name: band[1],
      picks: rows.length,
      wins,
      losses: rows.length - wins,
      success: rows.length ? wins / rows.length : 0,
      avgOdds: oddsRows.length ? oddsRows.reduce((sum, r) => sum + r.odds, 0) / oddsRows.length : 0,
      confidence: rows.length >= 50 ? 'High' : rows.length >= 20 ? 'Moderate' : 'Low',
    };
  }).filter(x => x.picks > 0);
}

function sports(data) {
  const min = 10;
  const realPicks = data.filter(isRealPick);
  const groupedRows = rank(sortRows(aggregate(realPicks, 'group').filter(x => x.picks >= min), 'sportsPage'));
  const competitionRows = rank(sortRows(aggregate(realPicks, 'sport').filter(x => x.picks >= min), 'competitionsPage'));
  return `<div class="panel"><h2>Sports</h2><p class="muted">Sports are grouped by default. Use Search to narrow to a specific sport or competition.</p>${table(groupedRows, 'sportsPage', sportCols('Sport group'))}</div><div class="panel"><h2>Competitions</h2>${table(competitionRows, 'competitionsPage', sportCols('Competition'))}</div>`;
}

function betTypes(data) {
  const min = 10;
  const realPicks = data.filter(isRealPick);
  const groupedRows = rank(sortRows(aggregate(realPicks, 'betTypeGroup').filter(x => x.picks >= min), 'betTypesGrouped'));
  const specificRows = rank(sortRows(aggregate(realPicks, 'betType').filter(x => x.picks >= min), 'betTypesSpecific'));
  return `<div class="panel"><h2>Bet types</h2><p class="muted">Bet types are grouped by default. Use Search to narrow to a specific market.</p>${table(groupedRows, 'betTypesGrouped', sportCols('Bet type group'))}</div><div class="panel"><h2>Specific bet types</h2>${table(specificRows, 'betTypesSpecific', sportCols('Bet type'))}</div>`;
}

function odds(data) {
  const realPicks = data.filter(isRealPick);
  const rows = ODDS.map(band => {
    const bandRows = realPicks.filter(r => r.odds >= band[2] && r.odds <= band[3]);
    const wins = bandRows.filter(r => r.win).length;
    const losses = bandRows.filter(r => r.loss).length;
    const avgOdds = bandRows.reduce((sum, r) => sum + r.odds, 0) / (bandRows.length || 1);
    return {
      name: band[1],
      picks: bandRows.length,
      wins,
      losses,
      success: bandRows.length ? wins / bandRows.length : 0,
      avgOdds,
      confidence: bandRows.length >= 50 ? 'High' : bandRows.length >= 20 ? 'Moderate' : 'Low',
    };
  });

  // Top 5 by exact odds value (e.g. 1.20, 1.25), not band - naturally smaller
  // sample sizes per value than a whole band, so fewer may clear "High".
  const byExactOdds = new Map();
  realPicks.forEach(r => {
    if (!Number.isFinite(r.odds)) return;
    const key = r.odds.toFixed(2);
    if (!byExactOdds.has(key)) byExactOdds.set(key, []);
    byExactOdds.get(key).push(r);
  });
  const exactOddsRows = [...byExactOdds.entries()].map(([key, oddsRows]) => {
    const wins = oddsRows.filter(r => r.win).length;
    return {
      name: oddsFmt(Number(key)),
      picks: oddsRows.length,
      success: oddsRows.length ? wins / oddsRows.length : 0,
      confidence: oddsRows.length >= 50 ? 'High' : oddsRows.length >= 20 ? 'Moderate' : 'Low',
    };
  });
  const topFive = exactOddsRows
    .filter(r => r.confidence === 'High')
    .sort((a, b) => b.success - a.success)
    .slice(0, 5);
  const topFiveRows = topFive.map((r, i) =>
    `<tr><td>${i + 1}</td><td>${escapeHtml(r.name)}</td><td class="num">${pct(r.success)}</td><td class="num">${r.picks.toLocaleString()}</td></tr>`
  ).join('');
  const topFivePanel = topFive.length
    ? `<div class="panel standings-panel"><h3>Top 5 most successful (high confidence)</h3><p class="muted small">Specific odds values, not bands. High confidence = 50+ picks at that exact price.</p><div class="mini-table-wrap"><table class="mini-table"><thead><tr><th>Rank</th><th>Odds</th><th class="num">Success</th><th class="num">Picks</th></tr></thead><tbody>${topFiveRows}</tbody></table></div></div>`
    : `<div class="panel standings-panel"><h3>Top 5 most successful (high confidence)</h3><p class="muted small">No individual odds value has 50+ picks yet - try again once more data's in, or ask to lower the confidence bar.</p></div>`;

  return `<div class="panel"><h2>Odds bands</h2>${table(rank(sortRows(rows, 'odds', 'success')), 'odds', sportCols('Odds band'))}</div>${topFivePanel}`;
}
function recordsPool(forceCurrentSeason) {
  let data = [...state.raw].filter(isRealPick);
  if (forceCurrentSeason) {
    const cy = currentYear(state.raw);
    data = data.filter(r => seasonEqual(r.year, cy));
  }
  return data;
}

function extremeOddsRecord(data, wantWin, direction) {
  const rows = data.filter(r => Number.isFinite(r.odds) && (wantWin ? r.win : r.loss));
  if (!rows.length) return null;
  const target = direction === 'max' ? Math.max(...rows.map(r => r.odds)) : Math.min(...rows.map(r => r.odds));
  return { odds: target, matches: rows.filter(r => r.odds === target) };
}

function formatOddsRecord(rec) {
  if (!rec) return 'Not enough data yet.';
  const counts = {};
  rec.matches.forEach(r => { counts[r.member] = (counts[r.member] || 0) + 1; });
  const names = Object.entries(counts).map(([m, c]) => c > 1 ? `${m} (x${c})` : m).join(', ');
  const single = rec.matches.length === 1 ? rec.matches[0] : null;
  const detail = single ? ` - ${single.name}, ${single.date}` : '';
  return `${oddsFmt(rec.odds)} - ${names}${detail}`;
}

function currentTrailingStreakRecord(allData, wantWin) {
  // The member's live streak as of their most recent pick, computed over
  // their FULL history - a season boundary shouldn't silently truncate a
  // streak that's still running when the new season starts.
  const grouped = groupBy(allData, 'member');
  let best = 0;
  const perMember = {};
  Object.entries(grouped).forEach(([member, picks]) => {
    picks.sort(comparePickOrder);
    let current = 0;
    for (let i = picks.length - 1; i >= 0; i--) {
      const hit = wantWin ? picks[i].win : picks[i].loss;
      const breaks = wantWin ? picks[i].loss : picks[i].win;
      if (hit) current += 1;
      else if (breaks) break;
      // else: skip N/A rows (e.g. immunity-protected results) without
      // breaking the streak.
    }
    perMember[member] = current;
    if (current > best) best = current;
  });
  const members = Object.entries(perMember).filter(([, v]) => v === best && best > 0).map(([m]) => m);
  return { streak: best, members };
}

function longestStreakRecord(data, wantWin) {
  const grouped = groupBy(data, 'member');
  let best = 0;
  const perMember = {};
  Object.entries(grouped).forEach(([member, picks]) => {
    picks.sort(comparePickOrder);
    let current = 0, top = 0;
    picks.forEach(p => {
      const hit = wantWin ? p.win : p.loss;
      const breaks = wantWin ? p.loss : p.win;
      if (hit) { current += 1; top = Math.max(top, current); }
      else if (breaks) { current = 0; }
      // else: neither a hit nor a genuine break (e.g. an immunity-protected
      // N/A result) - skip it, don't reset the streak.
    });
    perMember[member] = top;
    if (top > best) best = top;
  });
  const members = Object.entries(perMember).filter(([, v]) => v === best && best > 0).map(([m]) => m);
  return { streak: best, members };
}

function bestWinPercentRecord(data, minPicks) {
  const rows = aggregate(data, 'member').filter(x => x.picks >= minPicks);
  if (!rows.length) return null;
  const maxSuccess = Math.max(...rows.map(x => x.success));
  const tied = rows.filter(x => Math.abs(x.success - maxSuccess) < 1e-9);
  const sameSample = tied.every(x => x.wins === tied[0].wins && x.picks === tied[0].picks);
  return { names: tied.map(x => x.name), success: maxSuccess, wins: tied[0].wins, picks: tied[0].picks, sameSample, tied };
}

function mostWinsRecord(data) {
  const rows = aggregate(data, 'member');
  if (!rows.length) return null;
  const maxWins = Math.max(...rows.map(x => x.wins));
  const tied = rows.filter(x => x.wins === maxWins);
  return { names: tied.map(x => x.name), wins: maxWins };
}

function losingSeasonRecord(data, minPicks) {
  const rows = aggregate(data, 'member').filter(x => x.picks >= minPicks);
  const losing = rows.filter(x => x.losses > x.wins);
  if (!losing.length) return '';
  return losing.map(x => `${x.name} (${x.wins}-${x.losses})`).join(', ');
}
function memberFieldLeaderboard(data, field) {
  const counts = {};
  data.forEach(r => { if (r[field]) counts[r[field]] = (counts[r[field]] || 0) + 1; });
  const entries = Object.entries(counts);
  if (!entries.length) return { count: 0, members: [] };
  const best = Math.max(...entries.map(([, c]) => c));
  return { count: best, members: entries.filter(([, c]) => c === best).map(([m]) => m) };
}

function fieldEventTotal(data, field) {
  const counts = {};
  data.forEach(r => { if (r[field]) counts[r[field]] = (counts[r[field]] || 0) + 1; });
  const total = Object.values(counts).reduce((s, c) => s + c, 0);
  const names = Object.entries(counts).map(([m, c]) => c > 1 ? `${m} (x${c})` : m);
  return { total, names };
}

function tierCrasherCount(data) {
  const dates = new Set(data.filter(r => r.tierKiller).map(r => r.date));
  return dates.size;
}

function perfectRoundCount(data) {
  // Active roster has grown over time (from ~6 members to 12) - derive it
  // per season from who actually picked that season, rather than hardcoding
  // the current 12, so early-season Perfect Rounds aren't wrongly excluded.
  const rosterBySeason = {};
  data.forEach(r => {
    const season = normalisedSeason(r.year);
    if (!rosterBySeason[season]) rosterBySeason[season] = new Set();
    rosterBySeason[season].add(r.member);
  });
  const byDate = groupBy(data, 'date');
  let count = 0;
  Object.values(byDate).forEach(picks => {
    const resulted = picks.filter(p => p.win || p.loss);
    if (!resulted.length) return;
    const season = normalisedSeason(resulted[0].year);
    const roster = rosterBySeason[season] || new Set();
    const membersWithResult = uniq(resulted.map(p => p.member));
    const allRosterPlayed = [...roster].every(m => membersWithResult.includes(m));
    if (allRosterPlayed && resulted.every(p => p.win)) count += 1;
  });
  return count;
}
function bestAnnualWinPercentRecord(data, minPicks) {
  const groups = {};
  data.forEach(r => {
    if (!r.member) return;
    const season = normalisedSeason(r.year);
    const key = `${r.member}||${season}`;
    if (!groups[key]) groups[key] = { member: r.member, season, wins: 0, picks: 0 };
    groups[key].picks += 1;
    if (r.win) groups[key].wins += 1;
  });
  const rows = Object.values(groups)
    .filter(g => g.picks >= minPicks)
    .map(g => ({ ...g, success: g.wins / g.picks }))
    .sort((a, b) => b.success - a.success || b.picks - a.picks);
  return rows[0] || null;
}
function recordsColumnHtml(title, data, opts, scope) {
  const minPicks = opts.minPicks || 10;
  const highWin = extremeOddsRecord(data, true, 'max');
  const lowLoss = extremeOddsRecord(data, false, 'min');
  // A live streak shouldn't be truncated just because a new season started -
  // use the full-history trailing streak when this column has one supplied.
  const winStreak = opts.trailingStreakData
    ? currentTrailingStreakRecord(opts.trailingStreakData, true)
    : longestStreakRecord(data, true);
  const items = [];
  items.push(['Highest successful odds', formatOddsRecord(highWin)]);
  items.push(['Lowest unsuccessful odds', formatOddsRecord(lowLoss)]);
items.push(['Longest winning streak', winStreak.streak ? `${winStreak.streak} - ${winStreak.members.join(', ')}` : 'Not enough data yet.']);
  if (opts.includeLosingStreak) {
    const loseStreak = longestStreakRecord(data, false);
    items.push(['Longest losing streak', loseStreak.streak ? `${loseStreak.streak} - ${loseStreak.members.join(', ')}` : 'Not enough data yet.']);
  }
  if (opts.includeWinPercent) {
    const best = bestWinPercentRecord(data, minPicks);
    if (best) {
      const detail = best.sameSample
        ? `${best.wins} wins from ${best.picks.toLocaleString()} picks`
        : best.tied.map(x => `${x.name} ${x.wins}/${x.picks}`).join(', ');
      items.push(['Highest winning percentage', `${best.names.join(', ')} - ${pct(best.success)} (${detail})`]);
    }
    const mostWins = mostWinsRecord(data);
    if (mostWins) items.push(['Most wins', `${mostWins.names.join(', ')} - ${mostWins.wins.toLocaleString()}`]);
  }
  if (opts.includeLosingSeason) {
    const losingSeason = losingSeasonRecord(data, minPicks);
    if (losingSeason) items.push(['Member with a losing season', losingSeason]);
  }
  if (opts.includeSyndicateEvents) {
    const mmKillers = memberFieldLeaderboard(data, 'mmKiller');
    if (mmKillers.count) items.push(['Most MM Killers', `${mmKillers.count} - ${mmKillers.members.join(', ')}`]);
    const lonesome = fieldEventTotal(data, 'lonesomeLoser');
    if (lonesome.total) items.push(['Lonesome Loser(s)', `${lonesome.total} - ${lonesome.names.join(', ')}`]);
    const tierCrashers = tierCrasherCount(data);
    if (tierCrashers) items.push(['Tier Crashers (all members crash)', `${tierCrashers}`]);
    const perfectRounds = perfectRoundCount(data);
    if (perfectRounds) items.push(['Perfect Rounds (all members successful)', `${perfectRounds}`]);
  }
  if (opts.includeAnnualBest) {
    const bestAnnual = bestAnnualWinPercentRecord(data, minPicks);
    if (bestAnnual) items.push(['Highest annual winning percentage', `${bestAnnual.member} - ${pct(bestAnnual.success)} (${bestAnnual.wins} of ${bestAnnual.picks}) - ${bestAnnual.season}`]);
  }
  const scopeClass = scope === 'current' ? 'record-gold-current' : 'record-gold-alltime';
  return `<div class="panel"><h2>${escapeHtml(title)}</h2><div class="record-list">${items.map(([label, value]) => `<div class="record-shield ${scopeClass}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('')}</div></div>`;
}
function records(data) {
  const cy = currentYear(state.raw);
  const seasonData = recordsPool(true);
  const allTimeData = recordsPool(false);
  const member = state.selectedMember;
  const memberSection = member
    ? recordsColumnHtml(`${member} records`, allTimeData.filter(r => r.member === member), { minPicks: 1, includeWinPercent: true, includeLosingStreak: true }, 'alltime')
    : '';
  const officialRecords = `<section class="two">${recordsColumnHtml(`${cy || 'This season'} records`, seasonData, { minPicks: 1, includeWinPercent: true, includeLosingSeason: true, includeSyndicateEvents: true, trailingStreakData: allTimeData }, 'current')}${recordsColumnHtml('All-time records', allTimeData, { minPicks: 10, includeLosingStreak: true, includeSyndicateEvents: true, includeAnnualBest: true }, 'alltime')}</section>${memberSection}`;

  const streakMiniTable = (rows) => {
    const body = rows.slice(0, 6).map(r => `<tr><td>${r.rank}</td><td>${escapeHtml(r.name)}</td><td class="num">${r.streak}</td></tr>`).join('');
    return `<table class="mini-table"><thead><tr><th>Rank</th><th>Member</th><th class="num">Best streak</th></tr></thead><tbody>${body}</tbody></table>`;
  };
  const highOddsTop6 = (rows) => rows
    .filter(r => r.win && Number.isFinite(r.odds))
    .sort((a, b) => b.odds - a.odds)
    .slice(0, 6)
    .map((r, i) => ({ rank: i + 1, name: r.member, bet: r.name, odds: r.odds, year: r.year }));
  const oddsMiniTable = (rows) => {
    const body = rows.map(r => `<tr><td>${r.rank}</td><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.bet)}</td><td class="num">${oddsFmt(r.odds)}</td><td class="num">${escapeHtml(r.year)}</td></tr>`).join('');
    return `<table class="mini-table"><thead><tr><th>Rank</th><th>Member</th><th>Bet</th><th class="num">Odds</th><th class="num">Year</th></tr></thead><tbody>${body}</tbody></table>`;
  };

  // Generic reusable scope toggle: pass tabs as [{ key, label }] and panels
  // as { key: htmlString }. Self-contained per instance (via closest()), so
  // any number of these can sit on one page without interfering.
  const scopeToggle = (tabs, panels) => {
    const nav = tabs.map((t, i) =>
      `<button class="scope-toggle-btn${i === 0 ? ' active' : ''}" data-scope="${t.key}">${escapeHtml(t.label)}</button>`
    ).join('');
    const panelHtml = tabs.map((t, i) =>
      `<div class="mini-table-wrap" data-scope-panel="${t.key}"${i === 0 ? '' : ' style="display:none;"'}>${panels[t.key]}</div>`
    ).join('');
    return `<div class="scope-toggle-group"><div class="scope-toggle">${nav}</div>${panelHtml}</div>`;
  };

  const streaksSection = `<div class="panel standings-panel">
    <h3>Best winning streaks</h3>
    ${scopeToggle(
      [{ key: 'alltime', label: 'All-time' }, { key: 'current', label: cy || 'Current season' }],
      { alltime: streakMiniTable(bestStreaks(allTimeData)), current: streakMiniTable(bestStreaks(seasonData)) }
    )}
  </div>`;
  const oddsSection = `<div class="panel standings-panel">
    <h3>Highest winning odds</h3>
    ${scopeToggle(
      [{ key: 'alltime', label: 'All-time' }, { key: 'current', label: cy || 'Current season' }],
      { alltime: oddsMiniTable(highOddsTop6(allTimeData)), current: oddsMiniTable(highOddsTop6(seasonData)) }
    )}
  </div>`;

  setTimeout(() => {
    document.querySelectorAll('.scope-toggle-btn').forEach(btn => {
      btn.onclick = () => {
        const group = btn.closest('.scope-toggle-group');
        if (!group) return;
        group.querySelectorAll('.scope-toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const scope = btn.dataset.scope;
        group.querySelectorAll('[data-scope-panel]').forEach(panel => {
          panel.style.display = panel.dataset.scopePanel === scope ? '' : 'none';
        });
      };
    });
  }, 0);

  return `${officialRecords}<section class="two standings-row">${oddsSection}${streaksSection}</section>`;
}

function bestStreaks(data) {
  const grouped = groupBy(data, 'member');
  const rows = Object.entries(grouped).map(([member, picks]) => {
    picks.sort(comparePickOrder);
    let best = 0;
    let current = 0;
    picks.forEach(pick => {
      if (pick.win) {
        current += 1;
        best = Math.max(best, current);
      } else if (pick.loss) {
        current = 0;
      }
      // else: N/A result (e.g. immunity-protected) - skip, don't break the streak.
    });
    return { name: member, streak: best };
  }).sort((a, b) => b.streak - a.streak || a.name.localeCompare(b.name));
  return rank(rows);
}

function search(data) {
  const f = state.filters;
  const memberOptions = uniq(state.raw.map(r => r.member));
  const groupOptions = uniq(state.raw.map(r => r.group));
  const betTypeOptions = uniq(state.raw.map(r => r.betTypeGroup));
  const yearOptions = uniq(state.raw.map(r => r.year));

  const selectHtml = (key, label, options, current) =>
    `<label>${escapeHtml(label)}<select data-filter-key="${key}"><option value="">All</option>${options.map(o => `<option value="${escapeHtml(o)}"${o === current ? ' selected' : ''}>${escapeHtml(o)}</option>`).join('')}</select></label>`;

  const oddsSelectHtml = () =>
    `<label>Odds<select data-filter-key="odds"><option value="">All</option>${ODDS.map(o => `<option value="${o[0]}"${o[0] === f.odds ? ' selected' : ''}>${o[1]}</option>`).join('')}</select></label>`;

  const resultSelectHtml = () =>
    `<label>Result<select data-filter-key="result"><option value="">All</option><option${f.result === 'Win' ? ' selected' : ''}>Win</option><option${f.result === 'Loss' ? ' selected' : ''}>Loss</option></select></label>`;

  const activeCount = ['member', 'group', 'betType', 'year', 'odds', 'result', 'query'].filter(k => f[k]).length;

  const filtersHtml = `<div class="panel search-filters">
    <h2>Search</h2>
    <div class="search-filters-grid">
      ${selectHtml('member', 'Member', memberOptions, f.member)}
      ${selectHtml('group', 'Sport group', groupOptions, f.group)}
      ${selectHtml('betType', 'Bet type', betTypeOptions, f.betType)}
      ${selectHtml('year', 'Year', yearOptions, f.year)}
      ${oddsSelectHtml()}
      ${resultSelectHtml()}
      <label class="search-text-label">Search text<input data-filter-key="query" type="text" value="${escapeHtml(f.query)}" placeholder="Warriors, Bunnings, McCaw..."></label>
    </div>
    <div class="search-filters-actions">
      <span class="muted">${activeCount ? `${activeCount} filter${activeCount === 1 ? '' : 's'} active` : 'No filters active - showing everything, all-time'}</span>
      <button type="button" id="searchResetBtn">Reset</button>
    </div>
  </div>`;

  const rows = data.slice(0, 500).map((r, i) => ({
    rank: i + 1,
    name: r.member,
    bet: r.name,
    betType: r.betType,
    sport: r.sport,
    odds: r.odds,
    result: r.result,
    year: r.year,
  }));

  const resultsHtml = `<div class="panel"><h2>Results</h2><p class="muted">${data.length.toLocaleString()} matching pick${data.length === 1 ? '' : 's'}${data.length > 500 ? ' (showing first 500)' : ''}.</p>${table(rows, 'search', [
    { key: 'rank', label: '#', type: 'num' },
    { key: 'name', label: 'Member', primary: true },
    { key: 'bet', label: 'Bet' },
    { key: 'betType', label: 'Bet type' },
    { key: 'sport', label: 'Sport' },
    { key: 'odds', label: 'Odds', type: 'odds' },
    { key: 'result', label: 'Result' },
    { key: 'year', label: 'Year' },
  ])}</div>`;

  setTimeout(() => {
    document.querySelectorAll('[data-filter-key]').forEach(el => {
      const evt = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(evt, () => {
        state.filters[el.dataset.filterKey] = el.value;
        render();
      });
    });
    const resetBtn = document.getElementById('searchResetBtn');
    if (resetBtn) {
      resetBtn.onclick = () => {
        state.filters = { member: '', group: '', betType: '', year: '', odds: '', result: '', query: '' };
        render();
      };
    }
  }, 0);

  return `${filtersHtml}${resultsHtml}`;
}
function pickAssistant(data) {
  const member = state.selectedMember;
  if (!member) {
    bindMemberPicker();
    return `
      <div class="pa-page">
        <div class="pa-header">
          <h1>Pick Assistant</h1>
        </div>

        ${memberPickerHtml()}
      </div>
    `;
  }

  const memberRows = data.filter(r => r.member === member);
  const allMemberRows = state.raw
    .filter(r => r.member === member)
    .sort(comparePickOrder);

  const yourPool = patternCandidatePool(memberRows);
  const otherMembersRows = state.raw.filter(r => r.member !== member);
  const syndicatePool = patternCandidatePool(otherMembersRows);
  const yourPatterns = buildYourPatterns(yourPool, allMemberRows);
  const syndicatePatterns = buildSyndicatePatterns(syndicatePool);

  const nameOptions = uniq(state.raw.map(r => r.name)).filter(Boolean);
  const betTypeOptions = uniq(state.raw.map(r => r.betType)).filter(Boolean);
  const sportOptions = uniq(state.raw.map(r => competitionFamily(r.sport, r.name))).filter(Boolean);

  setTimeout(() => {
    const changeLink = document.querySelector('.change-member-link');
    if (changeLink) {
      changeLink.onclick = (e) => {
        e.preventDefault();
        state.selectedMember = null;
        render();
      };
    }
    bindAutocomplete('rateAPickName', 'rateAPickNameList', nameOptions);
    bindAutocomplete('rateAPickBetType', 'rateAPickBetTypeList', betTypeOptions);
    bindAutocomplete('rateAPickSport', 'rateAPickSportList', sportOptions);
    const rateBtn = document.getElementById('rateAPickBtn');
    if (rateBtn) {
      rateBtn.onclick = () => {
        const name = clean($('rateAPickName').value) || null;
        const betType = clean($('rateAPickBetType').value) || null;
        const sport = clean($('rateAPickSport').value) || null;
        const oddsRaw = $('rateAPickOdds').value;
        const odds = oddsRaw !== '' && Number.isFinite(Number(oddsRaw)) && Number(oddsRaw) > 1 ? Number(oddsRaw) : null;
        const resultsEl = document.getElementById('rateAPickResults');
        if (!sport || (!odds && !(name && betType))) {
          resultsEl.innerHTML = '<p class="muted small">Fill in at least a sport plus either (odds) or (selection + bet type) to get a rating - the more you fill in, the sharper the rating.</p>';
          return;
        }
        const result = ratePotentialPick(name, betType, sport, odds);
        resultsEl.innerHTML = `
          <div class="pa-rating-signals">
            ${result.signals.map(s => `<p class="pa-rating-signal">${escapeHtml(s.text)}</p>`).join('')}
          </div>
          ${ratingFlamesHtml(result.rating)}
          ${result.lowConfidence ? '<p class="muted small">Small sample size - treat this rating as indicative, not certain.</p>' : ''}
        `;
      };
    }
  }, 0);

  return `
    <div class="pa-page">

      <div class="pa-header">
        <h1>Pick Assistant - ${escapeHtml(member)}${MEMBER_NICKNAMES[member] ? ` <span class="muted">"${escapeHtml(MEMBER_NICKNAMES[member])}"</span>` : ''}</h1>
        <p>Personalised insights based on your betting history. <a href="#" class="change-member-link">Not you?</a></p>
      </div>

      <div class="pa-card">

        <div class="pa-title">THIS WEEK - WORTH WATCHING</div>

        <div class="pa-pattern-columns">
          <div class="pa-pattern-col">
            <div class="pa-label">Based on your past picks you could consider these picks</div>
            ${yourPatterns.length ? yourPatterns.map(item => patternCardHtml(item, 'pa-pattern-you')).join('') : '<div class="pa-watch">Not enough data yet to identify a strong pattern.</div>'}
          </div>
          <div class="pa-pattern-col">
            <div class="pa-label">Based on everyone else's picks, you could consider these picks</div>
            ${syndicatePatterns.length ? syndicatePatterns.map(item => patternCardHtml(item, 'pa-pattern-syndicate')).join('') : '<div class="pa-watch">Not enough syndicate-wide data yet to identify a strong pattern.</div>'}
          </div>
        </div>

      </div>

      <div class="pa-card pa-rate-card">
        <div class="pa-title pa-rate-title">RATE YOUR PICK</div>
        <p class="muted small">Type in a pick you're considering and see how it's checked out historically. Nothing here is saved or shared - it's just a lookup.</p>
        <div class="pa-rate-form">
          <label>Selection<span class="pa-autocomplete"><input autocomplete="off" id="rateAPickName" placeholder="Please type e.g. NZ Warriors"><div class="pa-autocomplete-list" id="rateAPickNameList"></div></span></label>
          <label>Bet type<span class="pa-autocomplete"><input autocomplete="off" id="rateAPickBetType" placeholder="Please type e.g. H2H"><div class="pa-autocomplete-list" id="rateAPickBetTypeList"></div></span></label>
          <label>Sport<span class="pa-autocomplete"><input autocomplete="off" id="rateAPickSport" placeholder="Please type e.g. Rugby League (NRL)"><div class="pa-autocomplete-list" id="rateAPickSportList"></div></span></label>
          <label>Odds<input type="number" step="0.01" min="1.01" id="rateAPickOdds" placeholder="Please type e.g. 1.35"></label>
          <button type="button" id="rateAPickBtn">Rate this pick</button>
        </div>
        <div id="rateAPickResults" class="pa-rating-results"></div>
      </div>

`;
}
function insights(data) {
  const scope = insightScopeLabel();
  const cards = smartInsightCards(data);
  return `<div class="panel smart-insights"><h2>Smart insights</h2><p class="muted">${escapeHtml(scope)}</p><div class="insight-list">
${cards.map(card => `<div class="insight ${card.kind || ''}"><span>${escapeHtml(card.label)}</span>${card.valueHtml ? card.valueHtml : `<strong>${escapeHtml(card.value)}</strong>`}${card.detailHtml ? card.detailHtml : `<em>${escapeHtml(card.detail)}</em>`}</div>`).join('')}</div></div>`;
}function smartInsightCards(data) {
  const cards = [];

  if (!data.length) {
    return [
      { label: 'No data', value: '0 picks', detail: 'Adjust or clear filters to generate insights.' }
    ];
  }

  cards.push(memberPerformanceCard(data));
  cards.push(currentFormCard(data));
  cards.push(highConfidenceCard(data));
  cards.push(oddsPerformanceCard(data));

  return cards.filter(Boolean);
}function memberPerformanceCard(data) {
  const rows = aggregate(data, 'member')
    .filter(x => x.picks >= 10)
    .sort((a, b) => b.success - a.success || b.picks - a.picks);

  const career = rows[0];

  const sorted = data.slice().sort(comparePickOrder);
  const last500 = sorted.slice(-500);
  const last1000 = sorted.slice(-1000);

  const recent = rows.map(row => {
    const member500 = last500.filter(r => r.member === row.name);
    const member1000 = last1000.filter(r => r.member === row.name);

    const wins500 = member500.filter(r => r.win).length;
    const wins1000 = member1000.filter(r => r.win).length;

    return {
      name: row.name,
      last500: member500.length ? wins500 / member500.length : 0,
      last1000: member1000.length ? wins1000 / member1000.length : 0,
      picks500: member500.length,
      picks1000: member1000.length
    };
  });

  const best500 = recent
    .filter(x => x.picks500 >= 10)
    .sort((a, b) => b.last500 - a.last500 || b.picks500 - a.picks500)[0];

  const best1000 = recent
    .filter(x => x.picks1000 >= 10)
    .sort((a, b) => b.last1000 - a.last1000 || b.picks1000 - a.picks1000)[0];

  return {
    label: 'Member performance',
    value: '',
      valueHtml:
      '<span class="metric-line"><span class="member-metric"><b>' + (career ? career.name : '-') + '</b> Career: ' + (career ? pct(career.success) : '-') + '</span> | ' +
      '<span class="member-metric"><b>' + (best500 ? best500.name : '-') + '</b> Last 500: ' + (best500 ? pct(best500.last500) : '-') + '</span> | ' +
      '<span class="member-metric"><b>' + (best1000 ? best1000.name : '-') + '</b> Last 1,000: ' + (best1000 ? pct(best1000.last1000) : '-') + '</span></span>',
    detail: ''
  };
}
function currentFormCard(data) {
    const rows = groupBy(data, 'member');

  const members = Object.entries(rows).map(([member, picks]) => {
    const recent = picks.slice().sort(comparePickOrder).slice(-12);
    const wins = recent.filter(r => r.win).length;

    return {
      member,
      picks: recent.length,
      wins,
      success: recent.length ? wins / recent.length : 0
    };
  })
  .filter(x => x.picks >= 5)
  .sort((a, b) => b.success - a.success || b.wins - a.wins);

  const top = members[0];

  if (!top) {
    return {
      label: 'Current form',
      value: '-',
      detail: 'Not enough recent picks.'
    };
  }

  return {
    label: 'Current form',
    value: top.member,
    detail: `${top.wins}/${top.picks} wins in last ${top.picks} picks (${pct(top.success)})`
    };
}
    function highConfidenceCard(data) {
  const sportRows = aggregate(data, 'group')
    .filter(x => x.picks >= 100)
    .sort((a, b) => b.success - a.success || b.picks - a.picks);

  const betTypeRows = aggregate(data, 'betTypeGroup')
    .filter(x => x.picks >= 100)
    .sort((a, b) => b.success - a.success || b.picks - a.picks);

  const sport = sportRows[0];
  const betType = betTypeRows[0];

  return {
    label: 'Best Sports and Bet Type (high confidence)',
    value: '',
    valueHtml: `
      <span class="metric-line"><strong>Sport</strong>: ${sport ? `${sport.name} ${pct(sport.success)} from ${sport.picks.toLocaleString()} picks` : 'No high-confidence sport'} | <strong>Bet type</strong>: ${betType ? `${betType.name} ${pct(betType.success)} from ${betType.picks.toLocaleString()} picks` : 'No high-confidence bet type'}</span>
    `,
    detail: ''
  };
}
function oddsPerformanceCard(data) {
  const bands = [];

  for (let start = 1.01; start < 2.00; start += 0.10) {
    const lower = Number(start.toFixed(2));
    const upper = Number(Math.min(2.00, start + 0.09).toFixed(2));
    const picks = data.filter(r => r.odds >= lower && r.odds <= upper);
    const wins = picks.filter(r => r.win).length;

    if (picks.length >= 10) {
      const success = wins / picks.length;
      const implied = picks.reduce((sum, r) => sum + (1 / r.odds), 0) / picks.length;

      bands.push({
        label: `${lower.toFixed(2)}-${upper.toFixed(2)}`,
        picks: picks.length,
        success,
        implied,
        difference: success - implied
      });
    }
  }

  const twoPlus = data.filter(r => r.odds >= 2);
  const twoPlusWins = twoPlus.filter(r => r.win).length;

  if (twoPlus.length >= 10) {
    const success = twoPlusWins / twoPlus.length;
    const implied = twoPlus.reduce((sum, r) => sum + (1 / r.odds), 0) / twoPlus.length;

    bands.push({
      label: '2.00+',
      picks: twoPlus.length,
      success,
      implied,
      difference: success - implied
    });
  }

  const top = bands.sort((a, b) =>
    b.difference - a.difference || b.picks - a.picks
  )[0];

  if (!top) {
    return {
      label: 'Odds performance',
      value: '-',
      detail: 'Not enough picks within the odds ranges.'
    };
  }

  const points = (top.difference * 100).toFixed(1);

  return {
    label: 'Odds performance',
    value: top.label,
    detail: `${pct(top.success)} actual | ${pct(top.implied)} implied | ${points >= 0 ? '+' : ''}${points} pts | ${top.picks} picks`
  };
}
function highestWinCard(data, label) {
  const top = data.filter(r => r.win && Number.isFinite(r.odds)).sort((a, b) => b.odds - a.odds)[0];
  if (!top) return { label, value: '-', detail: 'No winning pick in this filter.' };
  return { label, value: oddsFmt(top.odds), detail: `${top.member} - ${top.name || top.sport || 'Unknown pick'} (${top.year || '-'})` };
}

// ----------------------------------------------------------------------
// Pattern detection helpers (used by "Worth Watching" on Pick Assistant)
// ----------------------------------------------------------------------

// Pulls a numeric line/handicap value out of a bet type string, e.g.
// "12.5 point start" -> 12.5. Returns null when no number is present.
function parsePointValue(betType) {
  const match = String(betType || '').match(/(\d+(\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

// Wilson lower-bound score: a statistically sound way to rank success
// rates without an arbitrary minimum-picks cutoff. A small sample gets
// pulled back toward 50% (so a lucky 1-from-1 can't outrank a proven
// 45-from-50), while a large reliable sample scores close to its raw
// success rate. Nothing is excluded - everything is just ranked fairly.
function wilsonLowerBound(wins, picks, z = 1.96) {
  if (!picks) return 0;
  const phat = wins / picks;
  const denominator = 1 + (z * z) / picks;
  const numerator = phat + (z * z) / (2 * picks) - z * Math.sqrt((phat * (1 - phat) + (z * z) / (4 * picks)) / picks);
  return numerator / denominator;
}

function byBestStory(a, b) {
  return wilsonLowerBound(b.wins, b.picks) - wilsonLowerBound(a.wins, a.picks);
}

// Groups rows by an arbitrary composite key and returns picks/wins/success
// per group, alongside a human-readable label for each group. Also tracks
// the most recent pick date and average odds per group, so callers can
// filter stale patterns and show value context.
function aggregateComposite(rows, keyFn, labelFn) {
  const map = new Map();
  rows.forEach(row => {
    const key = keyFn(row);
    if (!key) return;
    if (!map.has(key)) map.set(key, { key, label: labelFn(row), picks: 0, wins: 0, oddsSum: 0, lastDate: null, firstDate: null, group: row.group || null, betTypeGroup: row.betTypeGroup || null });
    const item = map.get(key);
    item.picks += 1;
    if (row.win) item.wins += 1;
    if (Number.isFinite(row.odds)) item.oddsSum += row.odds;
    const d = parseDMY(row.date);
    if (d && (!item.lastDate || d > item.lastDate)) item.lastDate = d;
    if (d && (!item.firstDate || d < item.firstDate)) item.firstDate = d;
  });
  return [...map.values()].map(item => ({
    ...item,
    success: item.picks ? item.wins / item.picks : 0,
    avgOdds: item.picks ? item.oddsSum / item.picks : 0,
  }));
}

// A pattern is only shown if it's active within the current season or the
// one immediately before it - anchored to real season boundaries (not an
// arbitrary day count), so we're not leaning on a pattern that's gone
// completely quiet for a full season or more.
function recencyCutoffDate() {
  const cy = currentYear(state.raw);
  const prevSeason = previousSeasonOf(cy);
  const cutoffSeason = prevSeason || cy;
  const cutoffYear = seasonStart(cutoffSeason);
  if (!Number.isFinite(cutoffYear) || cutoffYear < 0) return null;
  return new Date(Date.UTC(cutoffYear, 0, 1));
}

function isPatternRecentEnough(lastDate, cutoffDate) {
  if (!lastDate) return false;
  if (!cutoffDate) return true;
  return lastDate.getTime() >= cutoffDate.getTime();
}

// Team + exact bet type combos, e.g. "Gold Coast Titans (12.5 point start)".
// Scoped by sport group too, not just name - the same name can exist across
// different sports (e.g. "Ireland" in rugby vs football), and without this
// their results would silently blend into one misleading number.
function comboCandidates(rows) {
  return aggregateComposite(
    rows,
    r => (r.name && r.betType && r.group) ? `${r.name}||${r.group}||${r.betType}` : null,
    r => `${r.name} (${r.group}) - ${r.betType}`
  ).map(c => ({
    ...c,
    team: c.label.split(' (')[0],
    family: c.betTypeGroup === 'Point Starts' ? `points||${c.label.split(' (')[0]}||${c.group}` : c.key,
  }));
}

// "X point start or higher" thresholds, optionally scoped to one team (and,
// when scoped to a team, its sport group too - see comboCandidates for why).
function thresholdsFromPool(pool, teamName, sportGroupName) {
  if (!pool.length) return [];
  const thresholds = uniq(pool.map(r => parsePointValue(r.betType))).sort((a, b) => a - b);
  return thresholds.map(t => {
    const subset = pool.filter(r => parsePointValue(r.betType) >= t);
    const wins = subset.filter(r => r.win).length;
    const dates = subset.map(r => parseDMY(r.date)).filter(Boolean);
    const lastDate = dates.length ? new Date(Math.max(...dates.map(d => d.getTime()))) : null;
    const firstDate = dates.length ? new Date(Math.min(...dates.map(d => d.getTime()))) : null;
    const avgOdds = subset.reduce((s, r) => s + (r.odds || 0), 0) / (subset.length || 1);
    const label = teamName
      ? `${teamName} (${sportGroupName ? sportGroupName + ' - ' : ''}${t} point start or higher)`
      : sportGroupName
        ? `${t} point start or higher (${sportGroupName})`
        : `${t} point start or higher`;
    return {
      key: `points||${teamName || 'all'}||${sportGroupName || 'all'}||${t}`,
      // Every threshold for the same team+sport (or the same sport overall)
      // is really one underlying pattern viewed at different cutoffs, not
      // several independent ones - "6.5+", "9.5+" and "12.5+" overlap
      // heavily. Grouped under one family so only the best-scoring
      // threshold in each family survives deduplication.
      family: `points||${teamName || 'all'}||${sportGroupName || 'all'}`,
      label,
      team: teamName || null,
      group: sportGroupName || null,
      picks: subset.length,
      wins,
      success: subset.length ? wins / subset.length : 0,
      avgOdds,
      firstDate,
      lastDate,
    };
  });
}

// Convenience wrapper for callers with an already-small dataset (a recent
// picks window, a post-streak subset) where filtering from raw rows each
// call is cheap. patternCandidatePool below avoids this path for its
// per-team+sport loop, since that would mean re-scanning the full row set
// once per distinct team+sport combination.
function pointThresholdCandidates(rows, teamName, sportGroupName) {
  const pool = rows.filter(r =>
    r.betTypeGroup === 'Point Starts' &&
    parsePointValue(r.betType) !== null &&
    (!teamName || r.name === teamName) &&
    (!sportGroupName || r.group === sportGroupName)
  );
  return thresholdsFromPool(pool, teamName, sportGroupName);
}

// Full candidate pool for a set of rows: team+bet-type combos, point-start
// thresholds (overall and per team+sport), and single-dimension fallbacks.
// No minimum-picks restriction, but patterns whose most recent pick is more
// than ~2 years old are dropped - a team/market can change enough over that
// time that an old pattern isn't something to act on this week.
function patternCandidatePool(rows) {
  rows = rows.filter(isRealPick);

  // Point-Starts rows filtered and grouped by team+sport in one pass each,
  // rather than re-scanning the full row set once per distinct combination.
  const pointStartRows = rows.filter(r => r.betTypeGroup === 'Point Starts' && parsePointValue(r.betType) !== null);
  const byTeamGroup = new Map();
  const byGroupOnly = new Map();
  pointStartRows.forEach(r => {
    if (!r.group) return;
    if (!byGroupOnly.has(r.group)) byGroupOnly.set(r.group, []);
    byGroupOnly.get(r.group).push(r);
    if (!r.name) return;
    const key = `${r.name}||${r.group}`;
    if (!byTeamGroup.has(key)) byTeamGroup.set(key, []);
    byTeamGroup.get(key).push(r);
  });
  const perTeamThresholds = [...byTeamGroup.entries()].flatMap(([key, teamRows]) => {
    const [team, group] = key.split('||');
    return thresholdsFromPool(teamRows, team, group);
  });
  // Scoped by sport group, not pooled across every sport - "12.5 point
  // start" means something different in league vs union vs AFL, so pooling
  // them together would be the same conflation the team-name fix addressed.
  const overallThresholds = [...byGroupOnly.entries()].flatMap(([group, groupRows]) =>
    thresholdsFromPool(groupRows, null, group)
  );

  const teamCombos = comboCandidates(rows);
  const teamsCoveredByCombo = new Set(teamCombos.map(c => `${c.team}||${c.group}`));
  const fallback = aggregateComposite(rows, r => r.name && r.group ? `${r.name}||${r.group}` : null, r => `${r.name} (${r.group}) - all bet types`)
    .map(x => ({ ...x, team: x.label.split(' (')[0] }))
    .filter(x => !teamsCoveredByCombo.has(`${x.team}||${x.group}`))
    .concat(aggregateComposite(rows, r => r.betType && r.group ? `${r.betType}||${r.group}` : null, r => `${r.betType} (${r.group})`)
      .map(x => ({ ...x, team: null })));

  const cutoffDate = recencyCutoffDate();
  const MIN_ROBUST_PICKS = 12;
  const MIN_ROBUST_SUCCESS = 0.65;
  const allCandidates = teamCombos
    .concat(overallThresholds)
    .concat(perTeamThresholds)
    .concat(fallback)
    .filter(c => isPatternRecentEnough(c.lastDate, cutoffDate))
    .filter(c => c.picks >= MIN_ROBUST_PICKS && c.success >= MIN_ROBUST_SUCCESS)
    .sort(byBestStory);

  // Keep only the single best-scoring candidate per family - drops the
  // overlapping "6.5+", "9.5+", "12.5+" nested variants down to just
  // whichever one tells the strongest story.
  const seenFamilies = new Set();
  return allCandidates.filter(c => {
    const family = c.family || c.key;
    if (seenFamilies.has(family)) return false;
    seenFamilies.add(family);
    return true;
  });
}

// Selects up to `count` candidates spread across sports rather than letting
// one high-volume sport dominate the list. Round-robins through sports
// ordered by how recently the syndicate has actually picked in that sport -
// a proxy for "currently in season" since there's no real fixture calendar
// to check against yet.
function selectDiversePatterns(candidates, count) {
  const bySport = new Map();
  candidates.forEach(c => {
    const sport = c.group || 'Other';
    if (!bySport.has(sport)) bySport.set(sport, []);
    bySport.get(sport).push(c);
  });
  const sportsByRecency = [...bySport.entries()].sort((a, b) => {
    const aDate = Math.max(0, ...a[1].map(c => c.lastDate ? c.lastDate.getTime() : 0));
    const bDate = Math.max(0, ...b[1].map(c => c.lastDate ? c.lastDate.getTime() : 0));
    return bDate - aDate;
  });
  const selected = [];
  for (let round = 0; selected.length < count; round++) {
    let addedThisRound = false;
    for (const [, list] of sportsByRecency) {
      if (selected.length >= count) break;
      if (list[round]) { selected.push(list[round]); addedThisRound = true; }
    }
    if (!addedThisRound) break;
  }
  return selected;
}

// Best pattern from a member's most recent picks (last N) - surfaces
// "what's working right now" as one of the 3 "Your pattern" slots.
function recencyPattern(memberRowsSorted, usedKeys, windowSize = 15) {
  const pool = memberRowsSorted.filter(isRealPick).slice(-windowSize);
  const pointStartsBySport = new Map();
  pool.filter(r => r.betTypeGroup === 'Point Starts' && parsePointValue(r.betType) !== null && r.group).forEach(r => {
    if (!pointStartsBySport.has(r.group)) pointStartsBySport.set(r.group, []);
    pointStartsBySport.get(r.group).push(r);
  });
  const scopedThresholds = [...pointStartsBySport.entries()].flatMap(([group, groupRows]) => thresholdsFromPool(groupRows, null, group));
  const candidates = comboCandidates(pool)
    .concat(scopedThresholds)
    .concat(aggregateComposite(pool, r => r.betType && r.group ? `${r.betType}||${r.group}` : null, r => `${r.betType} (${r.group})`))
    .filter(c => !usedKeys.has(c.key))
    .filter(c => c.picks >= 5 && c.success >= 0.65)
    .sort(byBestStory);
  const top = candidates[0];
  if (!top) return null;
  return { label: top.label, success: top.success, picks: top.picks, avgOdds: top.avgOdds, lastDate: top.lastDate, firstDate: top.firstDate };
}

// Up to 3 detailed "Your pattern" items for the given member.
function buildYourPatterns(pool, allMemberRowsSorted) {
  const diverse = selectDiversePatterns(pool, 4);
  const items = diverse.map(c => ({ source: 'Your pattern', label: c.label, success: c.success, picks: c.picks, avgOdds: c.avgOdds, lastDate: c.lastDate, firstDate: c.firstDate }));
  const usedKeys = new Set(diverse.map(c => c.key));

  const recent = recencyPattern(allMemberRowsSorted, usedKeys);
  if (recent) {
    items.push({ source: 'Your pattern', label: recent.label, success: recent.success, picks: recent.picks, avgOdds: recent.avgOdds, lastDate: recent.lastDate, firstDate: recent.firstDate, isRecent: true });
  } else {
    const extra = pool.find(c => !usedKeys.has(c.key));
    if (extra) items.push({ source: 'Your pattern', label: extra.label, success: extra.success, picks: extra.picks, avgOdds: extra.avgOdds, lastDate: extra.lastDate, firstDate: extra.firstDate });
  }

  return items.slice(0, 5);
}

// Up to 5 detailed "Syndicate pattern" items, drawn from all-time,
// syndicate-wide data (excluding the highlighted member). No minimum-picks
// or season-window restriction.
function buildSyndicatePatterns(pool) {
  const diverse = selectDiversePatterns(pool, 5);
  return diverse.map(c => ({ source: 'Syndicate pattern', label: c.label, success: c.success, picks: c.picks, avgOdds: c.avgOdds, lastDate: c.lastDate, firstDate: c.firstDate }));
}

// ----------------------------------------------------------------------
// Small inline SVG visuals for Corroboration/Conflict, Fade Alerts, and
// Streak Watch, so those read as graphics rather than lines of text.
// ----------------------------------------------------------------------

function patternCardHtml(item, colorClass) {
  const sinceYear = item.firstDate ? item.firstDate.getFullYear() : null;
  return `<div class="pa-pattern-card ${colorClass}">
    <div class="pa-pattern-top"><span class="pa-pattern-label">${escapeHtml(item.label)}</span><span class="pa-pattern-success">${pct(item.success)}</span></div>
    ${svgStatBar(item.success, '#4ade80')}
    <div class="pa-pattern-meta"><span>Based on ${item.picks.toLocaleString()} pick${item.picks === 1 ? '' : 's'}${sinceYear ? ` since ${sinceYear}` : ''}</span><span>Avg ${fmtMoney(item.avgOdds)}</span></div>
  </div>`;
}

function svgStatBar(success, color) {
  const width = Math.max(2, Math.round(Math.min(1, Math.max(0, success)) * 100));
  return `<svg class="pa-bar" viewBox="0 0 100 10" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="100" height="10" rx="5" fill="rgba(255,255,255,0.10)"></rect>
    <rect x="0" y="0" width="${width}" height="10" rx="5" fill="${color}"></rect>
  </svg>`;
}

// ----------------------------------------------------------------------
// Rate a Pick - a member types in a hypothetical pick (name, bet type,
// sport, odds) and gets it checked against real history. Nothing is
// written anywhere - purely a client-side lookup against state.raw.
// ----------------------------------------------------------------------

// Unlike Worth Watching, Rate Your Pick is deliberately historically based -
// a member typing in a specific hypothetical pick should see everything
// that's known, not have older evidence silently excluded. Instead, if the
// evidence is old, say so plainly rather than filtering it out.
// Custom autocomplete: native <datalist> gives no control over match order
// (browsers just show options in DOM order), so this ranks "starts with
// what you typed" above "contains it somewhere in the middle" instead.
function bindAutocomplete(inputId, listId, options) {
  const input = document.getElementById(inputId);
  const list = document.getElementById(listId);
  if (!input || !list) return;

  const render = () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { list.style.display = 'none'; list.innerHTML = ''; return; }
    const starts = [];
    const contains = [];
    options.forEach(o => {
      const lower = o.toLowerCase();
      if (lower.startsWith(q)) starts.push(o);
      else if (lower.includes(q)) contains.push(o);
    });
    starts.sort((a, b) => a.localeCompare(b));
    contains.sort((a, b) => a.localeCompare(b));
    const matches = starts.concat(contains).slice(0, 8);
    if (!matches.length) { list.style.display = 'none'; list.innerHTML = ''; return; }
    list.innerHTML = matches.map(m => `<div class="pa-autocomplete-item" data-value="${escapeHtml(m)}">${escapeHtml(m)}</div>`).join('');
    list.style.display = 'block';
    list.querySelectorAll('.pa-autocomplete-item').forEach(item => {
      item.onmousedown = (e) => {
        e.preventDefault();
        input.value = item.dataset.value;
        list.style.display = 'none';
        list.innerHTML = '';
      };
    });
  };

  input.addEventListener('input', render);
  input.addEventListener('focus', render);
  input.addEventListener('blur', () => setTimeout(() => { list.style.display = 'none'; }, 150));
}

function stalenessCaveat(rows) {
  const dates = rows.map(r => parseDMY(r.date)).filter(Boolean);
  if (!dates.length) return '';
  const lastDate = new Date(Math.max(...dates.map(d => d.getTime())));
  const cutoff = recencyCutoffDate();
  if (cutoff && lastDate.getTime() >= cutoff.getTime()) return '';
  const firstDate = new Date(Math.min(...dates.map(d => d.getTime())));
  const firstYear = firstDate.getUTCFullYear();
  const lastYear = lastDate.getUTCFullYear();
  const span = firstYear === lastYear ? `in ${firstYear}` : `between ${firstYear} and ${lastYear}`;
  return ` This trend was particularly strong ${span} - there's limited recent evidence, so consider carefully.`;
}

function sampleSizeSentence(sampleSize) {
  if (sampleSize >= 50) return 'That\'s a large sample, so it\'s about as trustworthy as this kind of data gets.';
  if (sampleSize >= 20) return 'That\'s a solid sample size, so this looks like a genuine trend rather than noise.';
  return 'That\'s a fairly small sample, so treat it as an early signal rather than a certainty.';
}

function ratePotentialPick(name, betType, sport, odds) {
  const signals = [];
  const pool = state.raw.filter(isRealPick);

  // Signal 1: this team+bet type+sport. For point-start bets, matched the
  // same way Worth Watching computes its own threshold patterns ("X or
  // higher"), not an exact text match - otherwise typing in exactly one of
  // Worth Watching's own recommended picks could fail to find the data it
  // was built from, since a threshold pattern pools several exact bet-type
  // values together (1.5, 2.5, 3.5...) rather than matching one literally.
  if (name && betType && sport) {
    const enteredFamily = competitionFamily(sport, name);
    const enteredPointValue = parsePointValue(betType);
    const isPointStart = enteredPointValue !== null && betTypeGroup(betType) === 'Point Starts';
    const comboRows = isPointStart
      ? pool.filter(r => r.name === name && competitionFamily(r.sport, r.name) === enteredFamily && r.betTypeGroup === 'Point Starts' && parsePointValue(r.betType) !== null && parsePointValue(r.betType) >= enteredPointValue)
      : pool.filter(r => r.name === name && r.betType === betType && competitionFamily(r.sport, r.name) === enteredFamily);
    const betLabel = isPointStart ? `${enteredPointValue} point start or higher` : betType;
    if (comboRows.length >= 3) {
      const allTimeWins = comboRows.filter(r => r.win).length;
      const allTimeSuccess = allTimeWins / comboRows.length;
      const twoYearsAgo = new Date(Date.UTC(new Date().getUTCFullYear() - 2, new Date().getUTCMonth(), new Date().getUTCDate()));
      const recentRows = comboRows.filter(r => { const d = parseDMY(r.date); return d && d >= twoYearsAgo; });
      const recentSuccess = recentRows.length >= 3 ? recentRows.filter(r => r.win).length / recentRows.length : null;
      const sinceYear = comboRows.map(r => parseDMY(r.date)).filter(Boolean).reduce((min, d) => !min || d < min ? d : min, null);
      const headline = recentSuccess !== null
        ? `${name} ${betLabel} is successful ${pct(allTimeSuccess)} all time, but ${pct(recentSuccess)} over the last two years.`
        : `${name} ${betLabel} is successful ${pct(allTimeSuccess)} all time (${comboRows.length.toLocaleString()} picks${sinceYear ? ` since ${sinceYear.getUTCFullYear()}` : ''}).`;
      const finalSuccess = recentSuccess !== null ? recentSuccess : allTimeSuccess;
      const finalSampleSize = recentSuccess !== null ? recentRows.length : comboRows.length;
      const caveat = stalenessCaveat(comboRows) || ` ${sampleSizeSentence(finalSampleSize)}`;
      signals.push({ text: `${headline}${caveat}`, success: finalSuccess, sampleSize: finalSampleSize });
    } else {
      signals.push({ text: `No real history yet for ${name} ${betLabel} in ${sport} - only ${comboRows.length} pick${comboRows.length === 1 ? '' : 's'} found, so there's nothing reliable to say either way.`, success: null, sampleSize: 0 });
    }
  }

  // Signal 2: this sport, odds within +/-$0.05 of the entered price. Prefers
  // the last six months if there's enough there, but falls back to all-time
  // data rather than showing nothing when recent activity is thin (e.g. the
  // sport's out of season right now). Only runs if sport + odds were given.
  if (sport && Number.isFinite(odds)) {
    const enteredFamily = competitionFamily(sport, name);
    const bandLow = Math.round((odds - 0.05) * 100) / 100;
    const bandHigh = Math.round((odds + 0.05) * 100) / 100;
    const sixMonthsAgo = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 6, new Date().getUTCDate()));
    const bandRows = pool.filter(r => competitionFamily(r.sport, r.name) === enteredFamily && r.odds >= bandLow && r.odds <= bandHigh);
    const recentBandRows = bandRows.filter(r => { const d = parseDMY(r.date); return d && d >= sixMonthsAgo; });
    const contextNote = ' This is the sport overall at this price, not this specific selection, so treat it as market context rather than a team-specific edge.';
    if (recentBandRows.length >= 5) {
      const bandSuccess = recentBandRows.filter(r => r.win).length / recentBandRows.length;
      const headline = `${sport} picks with odds between ${fmtMoney(bandLow)} and ${fmtMoney(bandHigh)} have been successful ${pct(bandSuccess)} over the last six months (${recentBandRows.length.toLocaleString()} picks).`;
      signals.push({ text: `${headline} ${sampleSizeSentence(recentBandRows.length)}${contextNote}`, success: bandSuccess, sampleSize: recentBandRows.length });
    } else if (bandRows.length >= 5) {
      const bandSuccess = bandRows.filter(r => r.win).length / bandRows.length;
      const headline = `${sport} picks with odds between ${fmtMoney(bandLow)} and ${fmtMoney(bandHigh)} have been successful ${pct(bandSuccess)} all time (${bandRows.length.toLocaleString()} picks).`;
      const caveat = stalenessCaveat(bandRows) || ` ${sampleSizeSentence(bandRows.length)}`;
      signals.push({ text: `${headline}${caveat}${contextNote}`, success: bandSuccess, sampleSize: bandRows.length });
    } else {
      signals.push({ text: `Not enough ${sport} picks between ${fmtMoney(bandLow)} and ${fmtMoney(bandHigh)} at any point (only ${bandRows.length} found) to show a trend.`, success: null, sampleSize: 0 });
    }
  }

  if (!signals.length) {
    signals.push({ text: 'Not enough information to check any trend - try adding a sport plus either odds or a selection and bet type.', success: null, sampleSize: 0 });
  }

  // Rating: weighted average of whichever signals had enough data (weight
  // capped at 50 so one huge sample can't completely drown out the other
  // signal), mapped onto a 1-5 scale. Null (no usable rating) when neither
  // signal had enough data at all.
  const usable = signals.filter(s => s.success !== null);
  let rating = null;
  if (usable.length) {
    const totalWeight = usable.reduce((sum, s) => sum + Math.min(s.sampleSize, 50), 0);
    const weighted = usable.reduce((sum, s) => sum + s.success * Math.min(s.sampleSize, 50), 0) / totalWeight;
    rating = Math.max(1, Math.min(5, Math.round(weighted * 5)));
  }
  const lowConfidence = usable.length > 0 && usable.every(s => s.sampleSize < 15);

  return { signals, rating, lowConfidence };
}

function svgFlame(filled) {
  const color = filled ? '#f97316' : 'rgba(255,255,255,0.15)';
  return `<svg viewBox="0 0 24 24" width="22" height="22" fill="${color}"><path d="M12,2 C8,6 6,10 8,14 C6,13 5,15 6,17 C7,19.5 10,21 12,21 C16,21 18,17 17,13 C16,15 15,15 15,13 C17,10 14,6 12,2 Z"/></svg>`;
}

function ratingFlamesHtml(rating) {
  if (rating === null) return '<span class="muted small">Not enough data yet to give a rating.</span>';
  return `<div class="pa-flames">${[1, 2, 3, 4, 5].map(n => svgFlame(n <= rating)).join('')}<span class="pa-flames-text">${rating} out of 5</span></div>`;
}


function hotMemberCard(data) {
  const grouped = groupBy(data, 'member');
  const rows = Object.entries(grouped).map(([member, picks]) => {
    const sorted = picks.slice().sort(comparePickOrder);
    const last10 = sorted.slice(-10);
    const wins = last10.filter(r => r.win).length;
    return { member, total: last10.length, wins, rate: last10.length ? wins / last10.length : 0 };
  }).filter(x => x.total >= 5).sort((a, b) => b.rate - a.rate || b.total - a.total);
  const top = rows[0];
  if (!top) return { label: 'Current form', value: '-', detail: 'Not enough recent picks in this filter.' };
  return { label: 'Current form', value: top.member, detail: `${top.wins}/${top.total} in latest picks within this filter` };
}

function confidence(n) {
  if (n >= 100) return 'High';
  if (n >= 40) return 'Medium';
  if (n >= 10) return 'Low';
  return 'Very low';
}

function nextRoundInsightCards(data) {
  return nextRoundInsights(data).map(text => ({ label: 'Next round', value: stripHtml(text).split('.')[0].slice(0, 38), detail: stripHtml(text) }));
}

function stripHtml(value) {
  return String(value || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function nextRoundInsights(data) {
  const grouped = groupBy(data, 'member');
  const rows = [];
  for (const [member, picks] of Object.entries(grouped)) {
    picks.sort(comparePickOrder);
    const active = activeStreak(picks);
    if (active.type !== 'Win' || active.count < 2) continue;
    const history = afterStreakRecord(picks, active.count);
    if (!history.total) {
      rows.push(`<strong>${member}</strong> is on a ${active.count}-pick winning streak. There is not enough history after similar streaks yet.`);
      continue;
    }
    const band = bestAfterStreakBand(history.byBand);
    const bandText = band && band.total >= 3
      ? ` In the strongest odds band (${band.label}), the next pick has gone ${band.wins} from ${band.total}.`
      : '';
    rows.push(`<strong>${member}</strong> is on a ${active.count}-pick winning streak. Historically, after ${active.count}+ wins, the next pick is ${history.wins} from ${history.total} (${pct(history.wins / history.total)}).${bandText}`);
  }
  return rows;
}

function activeStreak(picks) {
  let type = '';
  let count = 0;
  for (let i = picks.length - 1; i >= 0; i--) {
    const result = picks[i].win ? 'Win' : picks[i].loss ? 'Loss' : '';
    if (!result) continue;
    if (!type) type = result;
    if (result === type) count += 1;
    else break;
  }
  return { type, count };
}

function afterStreakRecord(picks, threshold) {
  let current = 0;
  const summary = { wins: 0, total: 0, byBand: {} };
  for (const pick of picks) {
    if (current >= threshold) {
      summary.total += 1;
      if (pick.win) summary.wins += 1;
      const band = bandForOdds(pick.odds);
      if (band) {
        summary.byBand[band.id] ||= { label: band.label, wins: 0, total: 0 };
        summary.byBand[band.id].total += 1;
        if (pick.win) summary.byBand[band.id].wins += 1;
      }
    }
    current = pick.win ? current + 1 : 0;
  }
  return summary;
}

function bandForOdds(odds) {
  const band = ODDS.find(b => odds >= b[2] && odds <= b[3]);
  return band ? { id: band[0], label: band[1] } : null;
}

function bestAfterStreakBand(byBand) {
  return Object.values(byBand).sort((a, b) => (b.wins / b.total) - (a.wins / a.total) || b.total - a.total)[0];
}

function memberCols() {
  return [
    { key: 'rank', label: 'Rank', type: 'num' },
    { key: 'name', label: 'Name', primary: true },
    { key: 'picks', label: 'Picks', type: 'num' },
    { key: 'wins', label: 'Wins', type: 'num' },
    { key: 'losses', label: 'Losses', type: 'num' },
    { key: 'success', label: 'Success', type: 'pct' },
    { key: 'avgOdds', label: 'Avg odds', type: 'odds' },
    { key: 'currentStreak', label: 'Current streak' },
    { key: 'last10', label: 'Last 10' },
  ];
}

function sportCols(label = 'Sport') {
  return [
    { key: 'rank', label: 'Rank', type: 'num' },
    { key: 'name', label, primary: true },
    { key: 'picks', label: 'Picks', type: 'num' },
    { key: 'wins', label: 'Wins', type: 'num' },
    { key: 'losses', label: 'Losses', type: 'num' },
    { key: 'success', label: 'Success', type: 'pct' },
    { key: 'avgOdds', label: 'Avg odds', type: 'odds' },
    { key: 'confidence', label: 'Confidence' },
  ];
}


function enrichMembers(rows, data) {
  const grouped = groupBy(data, 'member');
  return rows.map(row => {
    const picks = (grouped[row.name] || []).slice().sort(comparePickOrder);
    const active = activeStreak(picks);
    const last10Rows = picks.slice(-10);
    const last10Wins = last10Rows.filter(p => p.win).length;
    return {
      ...row,
      currentStreak: active.count ? `${active.count}${active.type === 'Win' ? 'W' : 'L'}` : '-',
      streakValue: active.type === 'Win' ? active.count : -active.count,
      last10: last10Rows.length ? `${last10Wins}/${last10Rows.length}` : '-',
      last10Value: last10Rows.length ? last10Wins / last10Rows.length : 0,
    };
  });
}

function insightScopeLabel() {
  return 'Overall intelligence across all resulted picks.';
}

function groupBy(data, key) {
  return data.reduce((acc, row) => {
    const value = row[key] || 'Unknown';
    (acc[value] ||= []).push(row);
    return acc;
  }, {});
}

function comparePickOrder(a, b) {
  const dateA = parseDMY(a.date);
  const dateB = parseDMY(b.date);
  if (dateA && dateB && dateA.getTime() !== dateB.getTime()) return dateA - dateB;
  return String(a.key).localeCompare(String(b.key), undefined, { numeric: true });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

init();
