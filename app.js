const API_URL = 'https://script.google.com/macros/s/AKfycbxkk34u9pyYb6KIKZ6J08owwLmqiT_WXBfHkXtDhdsW4PDlZZ3wn9yWmmJafudaYCEG/exec';

const state = {
  raw: [],
  apiCount: 0,
  page: 'dashboard',
  sort: {},
  sportDrilldown: false,
  seasonScope: 'all', // 'all' | 'current'
  mmSuccess: new Map(),
};

const FILTER_IDS = ['memberFilter', 'sportGroupFilter', 'betTypeFilter', 'yearFilter', 'oddsFilter', 'resultFilter', 'searchInput'];

const ODDS = [
  ['under1.20', 'Under 1.20', 0, 1.199999],
  ['1.20-1.39', '1.20-1.39', 1.2, 1.399999],
  ['1.40-1.59', '1.40-1.59', 1.4, 1.599999],
  ['1.60-1.89', '1.60-1.89', 1.6, 1.899999],
  ['1.90-1.99', '1.90-1.99', 1.9, 1.999999],
  ['2plus', '2.00+', 2, 999],
];

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

function normalise(row, index) {
  const resultRaw = clean(pick(row, [
    'Result', 'Bet successful', 'Bet Successful', 'Successful', 'Success',
    'Correct', 'Win Loss', 'Win/Loss', 'W/L'
  ]));

  const result = /^(yes|y|win|won|true|1|correct|success)$/i.test(resultRaw)
    ? 'Win'
    : /^(no|n|loss|lost|false|0|incorrect|crash|failed)$/i.test(resultRaw)
      ? 'Loss'
      : '';

  const sport = clean(pick(row, ['Sport', 'Competition', 'Sport / Competition', 'sport']));
  const betType = clean(pick(row, [
    'Bet Type', 'Bet type', 'Betting Type', 'Betting type', 'Bet Option',
    'Option', 'Market', 'Type', 'betType'
  ])) || 'Unknown';
  const odds = num(pick(row, ['Odds', 'Final odds', 'Final Odds', 'Price', 'TAB odds', 'TAB Odds']));
  const member = clean(pick(row, ['Member code', 'Member Code', 'Member', 'Code', 'member']));
  const year = clean(pick(row, ['Synd. Year', 'Synd Year', 'Syndicate Year', 'Year', 'Season', 'season']));
  const date = clean(pick(row, ['Date', 'Drop Date', 'date']));
  const name = clean(pick(row, ['Bet Name', 'Name', 'Bet', 'Selection', 'Team', 'Option Name', 'betName']));
  const key = clean(pick(row, ['Key', 'ID', 'Id', 'Record ID']));
  const mm = clean(pick(row, ['MM drop', 'MM Drop', 'Team', 'mm']));

  return {
    key: key || String(index + 1),
    member,
    sport,
    group: sportGroup(sport),
    betType,
    betTypeGroup: betTypeGroup(betType),
    odds,
    result,
    win: result === 'Win',
    loss: result === 'Loss',
    year,
    date,
    name,
    mm,
    row,
  };
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
  if (x.includes('multi') || x.includes('parlay') || x.includes('accumulator')) return 'Multis';
  if (x.includes('future') || x.includes('outright') || x.includes('premiership') || x.includes('winner')) return 'Futures/Outrights';
  return betType || 'Other';
}

function qualifies(row) {
  // Count only resulted pick rows. Missing bet type is allowed and shown as Unknown.
  return row.member && row.result && Number.isFinite(row.odds);
}

async function init() {
  try {
    const res = await fetch(`${API_URL}?v=${Date.now()}`, { cache: 'no-store' });
    const json = await res.json();
    state.apiCount = Number(json.count || 0);
    state.raw = (json.data || []).map(normalise).filter(qualifies);
    state.mmSuccess = buildMMSuccess(state.raw);
    buildFilters();
    bind();
    render();
    $('status').textContent = `${state.raw.length.toLocaleString()} resulted picks loaded from Google Sheets (${state.apiCount.toLocaleString()} source rows)`;
  } catch (error) {
    $('status').textContent = 'Could not load Google Sheet data';
    console.error(error);
  }
}

function mmKey(row) {
  return row.mm ? `${row.date}||${row.mm}` : '';
}

function buildMMSuccess(rows) {
  const groups = new Map();
  rows.forEach(row => {
    const key = mmKey(row);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  const success = new Map();
  groups.forEach((legs, key) => success.set(key, legs.length > 0 && legs.every(r => r.win)));
  return success;
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
}

function fill(id, values, all = 'All') {
  $(id).innerHTML = `<option value="">${all}</option>` + values.map(v => `<option>${escapeHtml(v)}</option>`).join('');
}

function buildFilters() {
  fill('memberFilter', uniq(state.raw.map(r => r.member)));
  fill('sportGroupFilter', uniq(state.raw.map(r => r.group)));
  fill('betTypeFilter', uniq(state.raw.map(r => r.betTypeGroup)));
  fill('yearFilter', uniq(state.raw.map(r => r.year)));
  $('oddsFilter').innerHTML = '<option value="">All</option>' + ODDS.map(o => `<option value="${o[0]}">${o[1]}</option>`).join('');
  $('resultFilter').innerHTML = '<option value="">All</option><option>Win</option><option>Loss</option>';
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
  document.querySelectorAll('.season-btn').forEach(button => {
    button.onclick = () => {
      state.seasonScope = button.dataset.season;
      document.querySelectorAll('.season-btn').forEach(x => x.classList.remove('active'));
      button.classList.add('active');
      render();
    };
  });
  [...FILTER_IDS, 'minPicks'].forEach(id => $(id).addEventListener('input', render));
  $('resetBtn').onclick = () => {
    FILTER_IDS.forEach(id => $(id).value = '');
    $('minPicks').value = 10;
    render();
  };
}

function updateFiltersSummary() {
  const active = FILTER_IDS.filter(id => $(id).value).length;
  $('filtersSummary').innerHTML = `Filters${active ? ` (${active} active)` : ''} <span class="chev">&#9662;</span>`;
}

function filtered() {
  let data = [...state.raw];
  const member = $('memberFilter').value;
  const group = $('sportGroupFilter').value;
  const betType = $('betTypeFilter').value;
  const year = $('yearFilter').value;
  const odds = $('oddsFilter').value;
  const result = $('resultFilter').value;
  const query = lower($('searchInput').value);
  if (!year && state.seasonScope === 'current') {
    const cy = currentYear(state.raw);
    data = data.filter(r => seasonEqual(r.year, cy));
  }
  if (member) data = data.filter(r => r.member === member);
  if (group) data = data.filter(r => r.group === group);
  if (betType) data = data.filter(r => r.betTypeGroup === betType);
  if (year) data = data.filter(r => r.year === year);
  if (result) data = data.filter(r => r.result === result);
  if (odds) {
    const band = ODDS.find(x => x[0] === odds);
    data = data.filter(r => r.odds >= band[2] && r.odds <= band[3]);
  }
  if (query) {
    data = data.filter(r => [r.member, r.sport, r.group, r.betType, r.name, r.year].join(' ').toLowerCase().includes(query));
  }
  return data;
}

function presidentialRace(data) {
  const map = new Map();
  data.forEach(row => {
    if (!row.member) return;
    if (!map.has(row.member)) {
      map.set(row.member, { name: row.member, points: 0, picks: 0, wins: 0, losses: 0, mmBonus: 0, bigWins: 0, bigLosses: 0 });
    }
    const m = map.get(row.member);
    m.picks += 1;
    if (row.win) { m.points += 0.5; m.wins += 1; }
    if (row.loss) { m.points -= 1; m.losses += 1; }
    const key = mmKey(row);
    if (key && state.mmSuccess.get(key)) { m.points += 1.5; m.mmBonus += 1; }
    if (row.win && Number.isFinite(row.odds) && row.odds >= 2) { m.points += 3; m.bigWins += 1; }
    if (row.loss && Number.isFinite(row.odds) && row.odds >= 2) { m.points -= 3; m.bigLosses += 1; }
  });
  const rows = [...map.values()].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  return rows.map((row, index, arr) => ({
    ...row,
    rank: index + 1,
    title: index === 0 ? 'Minor Premier' : index === 1 ? 'Runner-up' : index === arr.length - 1 && arr.length > 2 ? 'Benson' : '',
  }));
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
  const visible = preferred
    .map(key => columns.find(c => c.key === key))
    .filter(Boolean)
    .filter(col => !col.primary && col.key !== 'rank')
    .slice(0, 4);
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

function kpis(data) {
  const wins = data.filter(r => r.win).length;
  const losses = data.filter(r => r.loss).length;
  const avg = data.reduce((sum, row) => sum + (row.odds || 0), 0) / (data.length || 1);
  const excluded = Math.max(0, state.apiCount - state.raw.length);
  return `<section class="grid">
    <div class="kpi"><div class="label">Resulted picks</div><div class="value">${data.length.toLocaleString()}</div><div class="hint">${state.raw.length.toLocaleString()} valid picks in database</div></div>
    <div class="kpi"><div class="label">Success rate</div><div class="value">${pct(wins / (wins + losses || 1))}</div><div class="hint">${wins.toLocaleString()} wins / ${losses.toLocaleString()} losses</div></div>
    <div class="kpi"><div class="label">Average odds</div><div class="value">${oddsFmt(avg)}</div><div class="hint">Known odds only</div></div>
    <div class="kpi"><div class="label">Source rows</div><div class="value">${state.apiCount.toLocaleString()}</div><div class="hint">${excluded.toLocaleString()} admin/non-pick rows excluded</div></div>
  </section>`;
}

function render() {
  updateFiltersSummary();
  const data = filtered();
  const page = state.page;
  const app = $('app');
  if (page === 'dashboard') app.innerHTML = dashboard(data);
  if (page === 'members') app.innerHTML = members(data);
  if (page === 'sports') app.innerHTML = sports(data);
  if (page === 'bettypes') app.innerHTML = betTypes(data);
  if (page === 'odds') app.innerHTML = odds(data);
  if (page === 'records') app.innerHTML = records(data);
  if (page === 'search') app.innerHTML = search(data);
}

function dashboard(data) {
  const min = Number($('minPicks').value) || 1;
  const cy = currentYear(state.raw);
  const scopeLabel = state.seasonScope === 'current' ? `${cy || 'Current season'} (current season)` : 'All-time';
  const members = rank(sortRows(enrichMembers(aggregate(data, 'member'), data).filter(x => x.picks >= min), 'members').slice(0, 13));
  const presidential = sortRows(presidentialRace(data), 'presidentialRace', 'points');
  const sportGroups = rank(sortRows(aggregate(data, 'group').filter(x => x.picks >= min), 'sports').slice(0, 20));
  const betTypeGroups = rank(sortRows(aggregate(data, 'betTypeGroup').filter(x => x.picks >= min), 'dashboardBetTypes').slice(0, 20));
  const recent = data.slice().sort(comparePickOrder).slice(-10).reverse().map((r, i) => ({
    rank: i + 1, name: r.member, bet: r.name, betType: r.betType, sport: r.sport, odds: r.odds, result: r.result, year: r.year
  }));
  return `<p class="muted scope-line">Showing: ${escapeHtml(scopeLabel)}</p>${kpis(data)}${insights(data)}<section class="two"><div class="panel"><h2>Top members</h2>${table(members, 'members', memberCols())}</div><div class="panel"><h2>Presidential Race</h2><p class="muted">0.5/win, -1/loss, +1.5 for a successful 3-pick MM, +/-3 for a $2+ win or loss.</p>${table(presidential, 'presidentialRace', presidentialCols())}</div></section><section class="two"><div class="panel"><h2>Sport group performance</h2>${table(sportGroups, 'sports', sportCols('Sport group'))}</div><div class="panel"><h2>Bet type performance</h2>${table(betTypeGroups, 'dashboardBetTypes', sportCols('Bet type group'))}</div></section><div class="panel"><h2>Recent picks</h2>${table(recent, 'recentPicks', [
    { key: 'rank', label: '#', type: 'num' },
    { key: 'name', label: 'Member', primary: true },
    { key: 'bet', label: 'Bet' },
    { key: 'betType', label: 'Bet type' },
    { key: 'sport', label: 'Sport' },
    { key: 'odds', label: 'Odds', type: 'odds' },
    { key: 'result', label: 'Result' },
  ])}</div>`;
}

function members(data) {
  const selected = $('memberFilter').value;
  if (selected) return memberIntelligence(selected, data);
  const min = Number($('minPicks').value) || 1;
  const rows = rank(sortRows(enrichMembers(aggregate(data, 'member'), data).filter(x => x.picks >= min), 'membersPage'));
  return `<div class="panel"><h2>Members</h2><p class="muted">Select a member from the Member filter to open their Member Intelligence Centre.</p>${table(rows, 'membersPage', memberCols())}</div>`;
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

  return `<section class="member-profile">
    <div class="panel profile-hero">
      <div>
        <p class="eyebrow">Member Intelligence Centre</p>
        <h2>${escapeHtml(member)}</h2>
        <p class="muted">This view uses the current filters where possible. Clear filters for full-career analysis.</p>
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
  const min = Number($('minPicks').value) || 1;
  const groupedRows = rank(sortRows(aggregate(data, 'group').filter(x => x.picks >= min), 'sportsPage'));
  const competitionRows = rank(sortRows(aggregate(data, 'sport').filter(x => x.picks >= min), 'competitionsPage'));
  return `<div class="panel"><h2>Sports</h2><p class="muted">Sports are grouped by default. Use the Sport group filter to narrow a code, or review competitions below.</p>${table(groupedRows, 'sportsPage', sportCols('Sport group'))}</div><div class="panel"><h2>Competitions</h2>${table(competitionRows, 'competitionsPage', sportCols('Competition'))}</div>`;
}

function betTypes(data) {
  const min = Number($('minPicks').value) || 1;
  const groupedRows = rank(sortRows(aggregate(data, 'betTypeGroup').filter(x => x.picks >= min), 'betTypesGrouped'));
  const specificRows = rank(sortRows(aggregate(data, 'betType').filter(x => x.picks >= min), 'betTypesSpecific'));
  return `<div class="panel"><h2>Bet types</h2><p class="muted">Bet types are grouped by default. Use the Bet type filter to narrow a category, or search for a specific market below.</p>${table(groupedRows, 'betTypesGrouped', sportCols('Bet type group'))}</div><div class="panel"><h2>Specific bet types</h2>${table(specificRows, 'betTypesSpecific', sportCols('Bet type'))}</div>`;
}

function odds(data) {
  const rows = ODDS.map(band => {
    const bandRows = data.filter(r => r.odds >= band[2] && r.odds <= band[3]);
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
  return `<div class="panel"><h2>Odds bands</h2>${table(rank(sortRows(rows, 'odds', 'success')), 'odds', sportCols('Odds band'))}</div>`;
}

function records(data) {
  const streaks = bestStreaks(data);
  const highWins = data.filter(r => r.win && Number.isFinite(r.odds))
    .sort((a, b) => b.odds - a.odds)
    .slice(0, 20)
    .map((r, i) => ({ rank: i + 1, name: r.member, bet: r.name, odds: r.odds, year: r.year, sport: r.sport }));
  return `<section class="two"><div class="panel"><h2>Best winning streaks</h2>${table(streaks, 'streaks', [
    { key: 'rank', label: 'Rank', type: 'num' },
    { key: 'name', label: 'Member', primary: true },
    { key: 'streak', label: 'Best streak', type: 'num' },
  ])}</div><div class="panel"><h2>Highest winning odds</h2>${table(highWins, 'highWins', [
    { key: 'rank', label: 'Rank', type: 'num' },
    { key: 'name', label: 'Member', primary: true },
    { key: 'bet', label: 'Bet' },
    { key: 'odds', label: 'Odds', type: 'odds' },
    { key: 'year', label: 'Year' },
    { key: 'sport', label: 'Sport' },
  ])}</div></section>`;
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
      } else {
        current = 0;
      }
    });
    return { name: member, streak: best };
  }).sort((a, b) => b.streak - a.streak || a.name.localeCompare(b.name));
  return rank(rows);
}

function search(data) {
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
  return `<div class="panel"><h2>Search results</h2>${table(rows, 'search', [
    { key: 'rank', label: '#', type: 'num' },
    { key: 'name', label: 'Member', primary: true },
    { key: 'bet', label: 'Bet' },
    { key: 'betType', label: 'Bet type' },
    { key: 'sport', label: 'Sport' },
    { key: 'odds', label: 'Odds', type: 'odds' },
    { key: 'result', label: 'Result' },
    { key: 'year', label: 'Year' },
  ])}</div>`;
}

function insights(data) {
  const scope = insightScopeLabel();
  const cards = smartInsightCards(data);
  return `<div class="panel smart-insights"><h2>Smart insights</h2><p class="muted">${escapeHtml(scope)}</p><div class="insight-list">
    ${cards.map(card => `<div class="insight ${card.kind || ''}"><span>${escapeHtml(card.label)}</span><strong>${escapeHtml(card.value)}</strong><em>${escapeHtml(card.detail)}</em></div>`).join('')}
  </div></div>`;
}

function smartInsightCards(data) {
  const member = $('memberFilter').value;
  const group = $('sportGroupFilter').value;
  const betType = $('betTypeFilter').value;
  const oddsFilter = $('oddsFilter').value;
  const cards = [];
  const wins = data.filter(r => r.win).length;
  const losses = data.filter(r => r.loss).length;
  const success = data.length ? wins / data.length : 0;
  cards.push({ label: 'Filtered record', value: data.length.toLocaleString(), detail: `${pct(success)} success | ${confidence(data.length)} confidence` });

  if (!data.length) {
    return [
      { label: 'No data', value: '0 picks', detail: 'Adjust or clear filters to generate insights.' }
    ];
  }

  if (member) {
    const memberRows = data.filter(r => r.member === member);
    const allMemberRows = state.raw.filter(r => r.member === member).sort(comparePickOrder);
    const active = activeStreak(allMemberRows);
    const last10 = allMemberRows.slice(-10);
    const last10Wins = last10.filter(r => r.win).length;
    cards.push({ label: `${member} current streak`, value: active.count ? `${active.count}${active.type === 'Win' ? 'W' : 'L'}` : '-', detail: `${last10Wins}/${last10.length || 0} in last 10 overall` });
    cards.push(bestDimensionCard(memberRows, 'group', `${member} best sport`, 'Sport group'));
    cards.push(bestOddsBandCard(memberRows, `${member} best odds band`));
    cards.push(highestWinCard(memberRows, `${member} highest win`));
  } else if (group) {
    cards.push(bestDimensionCard(data, 'member', `Best ${group} member`, 'Member'));
    cards.push(bestDimensionCard(data, 'betTypeGroup', `Best ${group} bet type`, 'Bet type'));
    cards.push(bestOddsBandCard(data, `Best ${group} odds band`));
    cards.push(hotMemberCard(data));
  } else if (betType) {
    cards.push(bestDimensionCard(data, 'member', `Best ${betType} member`, 'Member'));
    cards.push(bestDimensionCard(data, 'group', `Best ${betType} sport`, 'Sport group'));
    cards.push(bestOddsBandCard(data, `Best ${betType} odds band`));
    cards.push(hotMemberCard(data));
  } else if (oddsFilter) {
    cards.push(bestDimensionCard(data, 'member', 'Best member in odds band', 'Member'));
    cards.push(bestDimensionCard(data, 'group', 'Best sport in odds band', 'Sport group'));
    cards.push(bestDimensionCard(data, 'betTypeGroup', 'Best bet type in odds band', 'Bet type'));
    cards.push(hotMemberCard(data));
  } else {
    cards.push(bestDimensionCard(data, 'member', 'Best overall member', 'Member'));
    cards.push(hotMemberCard(data));
    cards.push(bestDimensionCard(data, 'group', 'Best sport group', 'Sport group'));
    cards.push(bestDimensionCard(data, 'betTypeGroup', 'Best bet type', 'Bet type'));
    cards.push(bestOddsBandCard(data, 'Best odds band'));
  }

  const streakCards = nextRoundInsightCards(data).slice(0, 3);
  cards.push(...streakCards);
  return cards.filter(Boolean).slice(0, 8);
}

function bestDimensionCard(data, key, label, noun) {
  const min = Math.min(20, Math.max(5, Number($('minPicks').value) || 10));
  const rows = aggregate(data, key).filter(x => x.picks >= min).sort((a, b) => b.success - a.success || b.picks - a.picks);
  const top = rows[0];
  if (!top) return { label, value: '-', detail: `No ${noun.toLowerCase()} meets the ${min}-pick threshold.` };
  return { label, value: top.name, detail: `${pct(top.success)} from ${top.picks.toLocaleString()} picks | ${confidence(top.picks)} confidence` };
}

function bestOddsBandCard(data, label) {
  const rows = ODDS.map(band => {
    const picks = data.filter(r => r.odds >= band[2] && r.odds <= band[3]);
    const wins = picks.filter(r => r.win).length;
    return { label: band[1], picks: picks.length, wins, success: picks.length ? wins / picks.length : 0 };
  }).filter(x => x.picks >= 5).sort((a, b) => b.success - a.success || b.picks - a.picks);
  const top = rows[0];
  if (!top) return { label, value: '-', detail: 'Not enough odds-band data in this filter.' };
  return { label, value: top.label, detail: `${pct(top.success)} from ${top.picks.toLocaleString()} picks | ${confidence(top.picks)} confidence` };
}

function highestWinCard(data, label) {
  const top = data.filter(r => r.win && Number.isFinite(r.odds)).sort((a, b) => b.odds - a.odds)[0];
  if (!top) return { label, value: '-', detail: 'No winning pick in this filter.' };
  return { label, value: oddsFmt(top.odds), detail: `${top.member} - ${top.name || top.sport || 'Unknown pick'} (${top.year || '-'})` };
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
  const parts = [];
  const year = $('yearFilter').value;
  if (!year && state.seasonScope === 'current') parts.push(`Season: ${currentYear(state.raw) || 'Current season'}`);
  const member = $('memberFilter').value;
  const group = $('sportGroupFilter').value;
  const betType = $('betTypeFilter').value;
  const odds = $('oddsFilter').value;
  const result = $('resultFilter').value;
  const query = $('searchInput').value;
  if (member) parts.push(`Member: ${member}`);
  if (group) parts.push(`Sport group: ${group}`);
  if (betType) parts.push(`Bet type: ${betType}`);
  if (year) parts.push(`Year: ${year}`);
  if (odds) parts.push(`Odds: ${ODDS.find(o => o[0] === odds)?.[1] || odds}`);
  if (result) parts.push(`Result: ${result}`);
  if (query) parts.push(`Search: ${query}`);
  return parts.length ? `Insights based on current filters - ${parts.join(' | ')}` : 'Overall intelligence across all resulted picks.';
}

function groupBy(data, key) {
  return data.reduce((acc, row) => {
    const value = row[key] || 'Unknown';
    (acc[value] ||= []).push(row);
    return acc;
  }, {});
}

function comparePickOrder(a, b) {
  const dateA = Date.parse(a.date);
  const dateB = Date.parse(b.date);
  if (Number.isFinite(dateA) && Number.isFinite(dateB) && dateA !== dateB) return dateA - dateB;
  return String(a.key).localeCompare(String(b.key), undefined, { numeric: true });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

init();
