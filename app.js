const API_URL = 'https://script.google.com/macros/s/AKfycbyEQsjdYNmRx7Q3U1pmmVlwH8-qvk6cjXy6JWzX4xoCwdB3_VwvCu9l0mJ0ylb5bySR/exec';

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
    state.mmSuccess = buildMMSuccess(state.raw);

    buildFilters();
    bind();
    render();
    $('status').textContent = `${state.raw.length.toLocaleString()} picks loaded from Google Sheets (${state.apiCount.toLocaleString()} source rows)`;
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
  if (page === 'pickassistant') app.innerHTML = pickAssistant(data);
}

function dashboard(data) {
  const min = Number($('minPicks').value) || 1;
  const cy = currentYear(state.raw);
  const scopeLabel = state.seasonScope === 'current' ? `${cy || 'Current season'} (current season)` : 'All-time';
  const presidentialRows = state.raw.filter(r => seasonEqual(r.year, cy));
  const presidential = sortRows(presidentialRace(presidentialRows), 'presidentialRace', 'points');
  const sportGroups = rank(sortRows(aggregate(data, 'group').filter(x => x.picks >= min), 'sports').slice(0, 20));
  const betTypeGroups = rank(sortRows(aggregate(data, 'betTypeGroup').filter(x => x.picks >= min), 'dashboardBetTypes').slice(0, 20));
  const recent = data.slice().sort(comparePickOrder).slice(-10).reverse().map((r, i) => ({
    rank: i + 1, name: r.member, bet: r.name, betType: r.betType, sport: r.sport, odds: r.odds, result: r.result, year: r.year
  }));
  return `<p class="muted scope-line">Showing: ${escapeHtml(scopeLabel)}</p>${kpis(data)}${insights(data)}<div class="panel"><h2>Presidential Race</h2><p class="muted">${escapeHtml(cy || 'Current season')} only - always the full current season, independent of the filters and season toggle above. 0.5/win, -1/loss, +1.5 for a successful 3-pick MM, +/-3 for a $2+ win or loss.</p>${table(presidential, 'presidentialRace', presidentialCols())}</div><section class="two"><div class="panel"><h2>Sport group performance</h2>${table(sportGroups, 'sports', sportCols('Sport group'))}</div><div class="panel"><h2>Bet type performance</h2>${table(betTypeGroups, 'dashboardBetTypes', sportCols('Bet type group'))}</div></section><div class="panel"><h2>Recent picks</h2>${table(recent, 'recentPicks', [
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
function recordsPool(forceCurrentSeason) {
  let data = [...state.raw];
  const group = $('sportGroupFilter').value;
  const betType = $('betTypeFilter').value;
  const year = $('yearFilter').value;
  const odds = $('oddsFilter').value;
  const result = $('resultFilter').value;
  const query = lower($('searchInput').value);
  if (forceCurrentSeason) {
    const cy = currentYear(state.raw);
    data = data.filter(r => seasonEqual(r.year, cy));
  }
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

function longestStreakRecord(data, wantWin) {
  const grouped = groupBy(data, 'member');
  let best = 0;
  const perMember = {};
  Object.entries(grouped).forEach(([member, picks]) => {
    picks.sort(comparePickOrder);
    let current = 0, top = 0;
    picks.forEach(p => {
      const hit = wantWin ? p.win : p.loss;
      if (hit) { current += 1; top = Math.max(top, current); }
      else current = 0;
    });
    perMember[member] = top;
    if (top > best) best = top;
  });
  const members = Object.entries(perMember).filter(([, v]) => v === best && best > 0).map(([m]) => m);
  return { streak: best, members };
}

function bestWinPercentRecord(data, minPicks) {
  const rows = aggregate(data, 'member').filter(x => x.picks >= minPicks).sort((a, b) => b.success - a.success || b.picks - a.picks);
  return rows[0] || null;
}

function mostWinsRecord(data) {
  const rows = aggregate(data, 'member').sort((a, b) => b.wins - a.wins);
  return rows[0] || null;
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
  const byDate = groupBy(data, 'date');
  let count = 0;
  Object.values(byDate).forEach(picks => {
    const resulted = picks.filter(p => p.win || p.loss);
    if (resulted.length && resulted.every(p => p.win)) count += 1;
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
function recordsColumnHtml(title, data, opts) {
  const minPicks = opts.minPicks || 10;
  const highWin = extremeOddsRecord(data, true, 'max');
  const lowLoss = extremeOddsRecord(data, false, 'min');
  const winStreak = longestStreakRecord(data, true);
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
    items.push(['Highest winning percentage', best ? `${best.name} - ${pct(best.success)} (${best.wins} wins from ${best.picks.toLocaleString()} picks)` : 'Not enough data yet.']);
    const mostWins = mostWinsRecord(data);
    items.push(['Most wins', mostWins ? `${mostWins.name} - ${mostWins.wins.toLocaleString()}` : 'Not enough data yet.']);
  }
if (opts.includeLosingSeason) {
    items.push(['Member with a losing season', losingSeasonRecord(data, minPicks)]);
  }
 if (opts.includeSyndicateEvents) {
    const mmKillers = memberFieldLeaderboard(data, 'mmKiller');
    items.push(['Most MM Killers', mmKillers.count ? `${mmKillers.count} - ${mmKillers.members.join(', ')}` : 'Not enough data yet.']);
    const lonesome = fieldEventTotal(data, 'lonesomeLoser');
    items.push(['Lonesome Loser(s)', lonesome.total ? `${lonesome.total} - ${lonesome.names.join(', ')}` : 'Not enough data yet.']);
    const tierCrashers = tierCrasherCount(data);
    items.push(['Tier Crashers (all members crash)', tierCrashers ? `${tierCrashers}` : 'Not enough data yet.']);
    const perfectRounds = perfectRoundCount(data);
    items.push(['Perfect Rounds (all members successful)', perfectRounds ? `${perfectRounds}` : 'Not enough data yet.']);
  }
  if (opts.includeAnnualBest) {
    const bestAnnual = bestAnnualWinPercentRecord(data, minPicks);
    items.push(['Highest annual winning percentage', bestAnnual ? `${bestAnnual.member} - ${pct(bestAnnual.success)} (${bestAnnual.wins} of ${bestAnnual.picks}) - ${bestAnnual.season}` : 'Not enough data yet.']);
  }
  return `<div class="panel"><h2>${escapeHtml(title)}</h2><div class="record-list">${items.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('')}</div></div>`;
}
function records(data) {
  const streaks = bestStreaks(data);
  const highWins = data.filter(r => r.win && Number.isFinite(r.odds))
    .sort((a, b) => b.odds - a.odds)
    .slice(0, 20)
    .map((r, i) => ({ rank: i + 1, name: r.member, bet: r.name, odds: r.odds, year: r.year, sport: r.sport }));
  const cy = currentYear(state.raw);
  const seasonData = recordsPool(true);
  const allTimeData = recordsPool(false);
  const member = $('memberFilter').value;
  const memberSection = member
    ? recordsColumnHtml(`${member} records`, allTimeData.filter(r => r.member === member), { minPicks: 1, includeWinPercent: true, includeLosingStreak: true })
    : '';
const officialRecords = `<section class="two">${recordsColumnHtml(`${cy || 'This season'} records`, seasonData, { minPicks: 1, includeWinPercent: true, includeLosingSeason: true, includeSyndicateEvents: true })}${recordsColumnHtml('All-time records', allTimeData, { minPicks: 10, includeLosingStreak: true, includeSyndicateEvents: true, includeAnnualBest: true })}</section>${memberSection}`;
  return `${officialRecords}<section class="two"><div class="panel"><h2>Best winning streaks</h2>${table(streaks, 'streaks', [
    { key: 'rank', label: 'Rank', type: 'num' },    { key: 'name', label: 'Member', primary: true },
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
function pickAssistant(data) {
  const member = $('memberFilter').value;
const currentSeason = currentYear(state.raw);
  const trendingRows = trendingPool(currentSeason);
  if (!member) {
    return `
      <div class="pa-page">
        <div class="pa-header">
          <h1>Pick Assistant</h1>
          <p>Select your name in the Member filter to see your personalised insights.</p>
        </div>

        <div class="pa-card">
          <div class="pa-title">THIS WEEK</div>
          <div class="pa-section">
            <div class="pa-label">Member</div>
            <div class="pa-value">
              Select your member from the Member filter above.
            </div>
          </div>
        </div>
      </div>
    `;
  }

  const memberRows = data.filter(r => r.member === member);
  const allMemberRows = state.raw
    .filter(r => r.member === member)
    .sort(comparePickOrder);

  const career = summary(allMemberRows);
  const recent = recentRecord(allMemberRows, 20);
  const active = activeStreak(allMemberRows);

  const bestSport = bestDimensionCard(
    memberRows,
    'group',
    'Best sport',
    'sport group'
  );

  const bestOdds = bestOddsBandCard(
    memberRows,
    'Best odds band'
  );

  const memberSuccess = career.success;

  const syndicateRows = state.raw.filter(r =>
    seasonEqual(r.year, currentSeason)
  );

  const syndicateWins = syndicateRows.filter(r => r.win).length;
  const syndicateSuccess = syndicateRows.length
    ? syndicateWins / syndicateRows.length
    : 0;

  const trendText = memberSuccess > syndicateSuccess
    ? 'Above syndicate rate'
    : memberSuccess < syndicateSuccess
      ? 'Below syndicate rate'
      : 'At syndicate rate';

  const streakText = active.count
    ? `${active.count}${active.type === 'Win' ? 'W' : 'L'}`
    : '-';
  const yourPatterns = buildYourPatterns(memberRows, allMemberRows);
  const syndicatePatterns = buildSyndicatePatterns();

  const yourPool = patternCandidatePool(memberRows);
  const syndicatePool = patternCandidatePool(state.raw);
  const yourFadePool = fadeCandidatePool(memberRows);
  const syndicateFadePool = fadeCandidatePool(state.raw);
  const corroboration = corroborationNotes(yourPool, syndicatePool, yourFadePool, syndicateFadePool);
  const yourFades = buildFadeAlerts(memberRows, 'Your fade');
  const syndicateFades = buildFadeAlerts(state.raw, 'Syndicate fade');
  const streak = streakContinuationPatterns(allMemberRows);
  const opportunityText = bestSport.value !== '-'
    ? `${bestSport.value} is your strongest sport area based on your historical results.`
    : 'Not enough data yet to identify a strongest sport area.';

  const considerText = active.type === 'Loss' && active.count >= 2
    ? `You are currently on a ${active.count}-pick losing streak.`
    : active.type === 'Win' && active.count >= 2
      ? `You are currently on a ${active.count}-pick winning streak.`
      : 'Your recent form does not show a strong current streak.';

  return `
    <div class="pa-page">

      <div class="pa-header">
        <h1>Pick Assistant - ${escapeHtml(member)}</h1>
        <p>Personalised insights based on your betting history.</p>
      </div>

      <div class="pa-card">

        <div class="pa-title">THIS WEEK</div>

       <div class="pa-section">
            <div class="pa-label">Worth Watching - Your patterns</div>
            ${yourPatterns.length ? yourPatterns.map(item => `<div class="pa-watch"><strong>${escapeHtml(item.source)}:</strong> ${escapeHtml(item.text)}</div>`).join('') : '<div class="pa-watch">Not enough data yet to identify a strong pattern.</div>'}
          </div>

       <div class="pa-section">
            <div class="pa-label">Worth Watching - Syndicate patterns to consider</div>
            ${syndicatePatterns.length ? syndicatePatterns.map(item => `<div class="pa-watch pa-watch-syndicate"><strong>${escapeHtml(item.source)}:</strong> ${escapeHtml(item.text)}</div>`).join('') : '<div class="pa-watch">Not enough syndicate-wide data yet to identify a strong pattern.</div>'}
          </div>

          ${corroboration.length ? `
          <div class="pa-section">
            <div class="pa-label">Corroboration</div>
            <div class="pa-graphic-row">
              ${corroboration.map(note => `
                <div class="pa-graphic-item pa-graphic-venn">
                  ${svgVenn(note.kind)}
                  <div class="pa-graphic-caption"><strong>${escapeHtml(note.team)}</strong><span>${note.kind === 'corroborated' ? 'You + syndicate agree' : 'Signals disagree'}</span></div>
                </div>`).join('')}
            </div>
          </div>` : ''}

      </div>

      ${(yourFades.length || syndicateFades.length) ? `
      <div class="pa-card">
        <div class="pa-title">FADE ALERTS</div>
        <div class="pa-section">
          <div class="pa-label">Patterns to avoid</div>
          <div class="pa-graphic-list">
            ${yourFades.concat(syndicateFades).map(item => `
              <div class="pa-graphic-item pa-graphic-bar">
                ${svgStatBar(item.success, '#d84a4a')}
                <div class="pa-graphic-caption"><strong>${escapeHtml(item.source)}:</strong> ${escapeHtml(item.label)} - ${pct(item.success)} from ${item.picks.toLocaleString()} picks</div>
              </div>`).join('')}
          </div>
        </div>
      </div>` : ''}

      ${streak ? `
      <div class="pa-card">
        <div class="pa-title">STREAK WATCH</div>
        <div class="pa-section">
          <div class="pa-label">You're on a ${streak.active.count}-pick ${streak.active.type.toLowerCase()} streak</div>
          ${svgStreakPips(streak.active.count, streak.active.type)}
          <div class="pa-value" style="margin-top: 10px;">When others have been in this position, the strongest continuations have been:</div>
          <div class="pa-graphic-list">
            ${streak.items.map(item => `
              <div class="pa-graphic-item pa-graphic-bar">
                ${svgStatBar(item.success, '#7a4ad8')}
                <div class="pa-graphic-caption"><strong>${escapeHtml(item.label)}</strong> - ${pct(item.success)} from ${item.picks.toLocaleString()} picks</div>
              </div>`).join('')}
          </div>
      </div>` : ''}

      <div class="pa-card">

       <div class="pa-card">

    <div class="pa-title">TRENDING</div>

    <div class="pa-section">

        <div class="pa-label">Top Members</div>

<div id="pa-trending-members">${trendingMembersHtml(trendingRows)}</div>
        <div class="pa-section">
          <div class="pa-label">Recent form</div>
          <div class="pa-stats">
            <span>Last 20: ${escapeHtml(recent.text)}</span>
            <span>${escapeHtml(recent.detail)}</span>
<span>${bestOdds.value === '-' ? 'Not enough odds-band data yet' : escapeHtml(bestOdds.value) + ' odds band'}</span>          </div>
        </div>

    <div class="pa-section">

        <div class="pa-label">Top Sports</div>

<div id="pa-trending-sports">${trendingSportsHtml(trendingRows)}</div>
    </div>

    <div class="pa-section">

        <div class="pa-label">Top Competitions</div>

<div id="pa-trending-competitions">${trendingCompetitionsHtml(trendingRows)}</div>
    </div>

</div>

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
// per group, alongside a human-readable label for each group.
function aggregateComposite(rows, keyFn, labelFn) {
  const map = new Map();
  rows.forEach(row => {
    const key = keyFn(row);
    if (!key) return;
    if (!map.has(key)) map.set(key, { key, label: labelFn(row), picks: 0, wins: 0 });
    const item = map.get(key);
    item.picks += 1;
    if (row.win) item.wins += 1;
  });
  return [...map.values()].map(item => ({
    ...item,
    success: item.picks ? item.wins / item.picks : 0,
  }));
}

// Team + exact bet type combos, e.g. "Gold Coast Titans (12.5 point start)".
function comboCandidates(rows) {
  return aggregateComposite(
    rows,
    r => (r.name && r.betType) ? `${r.name}||${r.betType}` : null,
    r => `${r.name} (${r.betType})`
  ).map(c => ({ ...c, team: c.label.split(' (')[0] }));
}

// "X point start or higher" thresholds, optionally scoped to one team.
// Tests every point value actually present in the data as a threshold.
function pointThresholdCandidates(rows, teamName) {
  const pool = rows.filter(r =>
    r.betTypeGroup === 'Point Starts' &&
    parsePointValue(r.betType) !== null &&
    (!teamName || r.name === teamName)
  );
  if (!pool.length) return [];
  const thresholds = uniq(pool.map(r => parsePointValue(r.betType))).sort((a, b) => a - b);
  return thresholds.map(t => {
    const subset = pool.filter(r => parsePointValue(r.betType) >= t);
    const wins = subset.filter(r => r.win).length;
    const label = teamName
      ? `${teamName} (${t} point start or higher)`
      : `Point start of ${t} or higher`;
    return {
      key: `points||${teamName || 'all'}||${t}`,
      label,
      team: teamName || null,
      picks: subset.length,
      wins,
      success: subset.length ? wins / subset.length : 0,
    };
  });
}

// Full candidate pool for a set of rows: team+bet-type combos, point-start
// thresholds (overall and per team), and single-dimension fallbacks. No
// minimum-picks or time-window restriction - every combination the data
// actually contains is a candidate, ranked by Wilson score.
function patternCandidatePool(rows) {
  const teams = uniq(rows.map(r => r.name)).filter(Boolean);
  const perTeamThresholds = teams.flatMap(team => pointThresholdCandidates(rows, team));

  const fallback = aggregate(rows, 'name')
    .map(x => ({ key: `name||${x.name}`, label: `${x.name} (all bet types)`, team: x.name, picks: x.picks, wins: x.wins, success: x.success }))
    .concat(aggregate(rows, 'betType')
      .map(x => ({ key: `betType||${x.name}`, label: x.name, team: null, picks: x.picks, wins: x.wins, success: x.success })));

  return comboCandidates(rows)
    .concat(pointThresholdCandidates(rows))
    .concat(perTeamThresholds)
    .concat(fallback)
    .sort(byBestStory);
}

// Best pattern from a member's most recent picks (last N) - surfaces
// "what's working right now" as one of the 3 "Your pattern" slots.
function recencyPattern(memberRowsSorted, usedKeys, windowSize = 15) {
  const pool = memberRowsSorted.slice(-windowSize);
  const candidates = comboCandidates(pool)
    .concat(pointThresholdCandidates(pool))
    .concat(aggregate(pool, 'betType').map(x => ({ key: `betType||${x.name}`, label: x.name, picks: x.picks, wins: x.wins, success: x.success })))
    .filter(c => !usedKeys.has(c.key))
    .sort(byBestStory);
  const top = candidates[0];
  if (!top) return null;
  return { text: `${top.label} - ${pct(top.success)} over your last ${top.picks.toLocaleString()} picks` };
}

// Up to 3 detailed "Your pattern" items for the given member.
function buildYourPatterns(memberRows, allMemberRowsSorted) {
  const pool = patternCandidatePool(memberRows);

  const items = [];
  const usedKeys = new Set();

  pool.forEach(c => {
    if (items.length >= 2 || usedKeys.has(c.key)) return;
    usedKeys.add(c.key);
    items.push({ source: 'Your pattern', text: `${c.label} - ${pct(c.success)} from ${c.picks.toLocaleString()} picks` });
  });

  const recent = recencyPattern(allMemberRowsSorted, usedKeys);
  if (recent) {
    items.push({ source: 'Your pattern', text: recent.text });
  } else {
    const extra = pool.find(c => !usedKeys.has(c.key));
    if (extra) items.push({ source: 'Your pattern', text: `${extra.label} - ${pct(extra.success)} from ${extra.picks.toLocaleString()} picks` });
  }

  return items.slice(0, 3);
}

// Up to 3 detailed "Syndicate pattern" items, drawn from all-time,
// syndicate-wide data. No minimum-picks or season-window restriction.
function buildSyndicatePatterns() {
  const pool = patternCandidatePool(state.raw);
  const usedKeys = new Set();
  const items = [];
  pool.forEach(c => {
    if (items.length >= 3 || usedKeys.has(c.key)) return;
    usedKeys.add(c.key);
    items.push({ source: 'Syndicate pattern', text: `${c.label} - ${pct(c.success)} from ${c.picks.toLocaleString()} picks` });
  });
  return items;
}

// ----------------------------------------------------------------------
// Small inline SVG visuals for Corroboration/Conflict, Fade Alerts, and
// Streak Watch, so those read as graphics rather than lines of text.
// ----------------------------------------------------------------------

function svgStatBar(success, color) {
  const width = Math.max(2, Math.round(Math.min(1, Math.max(0, success)) * 100));
  return `<svg class="pa-bar" viewBox="0 0 100 10" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="100" height="10" rx="5" fill="rgba(255,255,255,0.10)"></rect>
    <rect x="0" y="0" width="${width}" height="10" rx="5" fill="${color}"></rect>
  </svg>`;
}

function svgVenn(kind) {
  const isConflict = kind === 'conflict';
  const leftColor = isConflict ? '#d84a4a' : '#4a8bd8';
  const rightColor = isConflict ? '#4a8bd8' : '#d8a24a';
  const overlapColor = isConflict ? '#d8c14a' : '#4ad87e';
  return `<svg class="pa-venn" viewBox="0 0 90 56" xmlns="http://www.w3.org/2000/svg">
    <circle cx="33" cy="28" r="21" fill="${leftColor}" fill-opacity="0.55"></circle>
    <circle cx="57" cy="28" r="21" fill="${rightColor}" fill-opacity="0.55"></circle>
    <ellipse cx="45" cy="28" rx="11" ry="18" fill="${overlapColor}" fill-opacity="0.85"></ellipse>
    <text x="33" y="52" text-anchor="middle" class="pa-venn-label">You</text>
    <text x="57" y="52" text-anchor="middle" class="pa-venn-label">Synd.</text>
  </svg>`;
}

function svgStreakPips(count, type) {
  const color = type === 'Win' ? '#4ad87e' : '#d84a4a';
  const spacing = 20;
  let dots = '';
  for (let i = 0; i < count; i++) {
    dots += `<circle cx="${9 + i * spacing}" cy="10" r="7" fill="${color}"></circle>`;
  }
  const width = count * spacing + 4;
  return `<svg class="pa-pips" viewBox="0 0 ${width} 20" xmlns="http://www.w3.org/2000/svg">${dots}</svg>`;
}

// ----------------------------------------------------------------------
// Fade alerts - the mirror of Worth Watching. Ranks the same candidate
// pool by how confidently BAD a pattern has been (Wilson lower bound on
// the loss rate), so a reliably cold pattern surfaces even though nothing
// about the ranking is inverted or hand-tuned.
// ----------------------------------------------------------------------

function fadeCandidatePool(rows) {
  return patternCandidatePool(rows)
    .map(c => ({ ...c, fadeScore: wilsonLowerBound(c.picks - c.wins, c.picks) }))
    .filter(c => c.picks - c.wins > 0)
    .sort((a, b) => b.fadeScore - a.fadeScore);
}

function buildFadeAlerts(rows, source, count = 2) {
  const pool = fadeCandidatePool(rows);
  const usedKeys = new Set();
  const items = [];
  pool.forEach(c => {
    if (items.length >= count || usedKeys.has(c.key)) return;
    usedKeys.add(c.key);
    items.push({ source, label: c.label, picks: c.picks, success: c.success });
  });
  return items;
}

// ----------------------------------------------------------------------
// Corroboration / conflict - flags when a member's own top patterns and
// the syndicate's top patterns point at the same team (extra confidence),
// or when one side's strong pattern is the other side's fade candidate
// (a signal worth double-checking before trusting either alone).
// ----------------------------------------------------------------------

function topTeams(pool, n, predicate) {
  return pool.filter(c => predicate(c.success)).slice(0, n).map(c => c.team).filter(Boolean);
}

function corroborationNotes(yourPool, syndicatePool, yourFadePool, syndicateFadePool) {
  const notes = [];
  const yourTop = new Set(topTeams(yourPool, 8, s => s >= 0.55));
  const syndTop = new Set(topTeams(syndicatePool, 8, s => s >= 0.55));
  const yourFadeTeams = new Set(topTeams(yourFadePool, 8, s => s <= 0.5));
  const syndFadeTeams = new Set(topTeams(syndicateFadePool, 8, s => s <= 0.5));

  const corroborated = [...yourTop].filter(t => syndTop.has(t));
  corroborated.slice(0, 2).forEach(team => {
    notes.push({ kind: 'corroborated', team });
  });

  const conflicts = new Set([
    ...[...yourTop].filter(t => syndFadeTeams.has(t)),
    ...[...syndTop].filter(t => yourFadeTeams.has(t)),
  ]);
  [...conflicts].slice(0, 2).forEach(team => {
    notes.push({ kind: 'conflict', team });
  });

  return notes;
}

// ----------------------------------------------------------------------
// Streak continuation - when a member is currently on a win/loss streak,
// looks at every syndicate member's picks made immediately after a streak
// of that type and length (or longer), and surfaces the strongest pattern
// within that specific situation.
// ----------------------------------------------------------------------

function picksAfterStreak(rows, type, threshold) {
  if (!type || threshold < 1) return [];
  const grouped = groupBy(rows, 'member');
  const results = [];
  Object.values(grouped).forEach(picks => {
    const sorted = picks.slice().sort(comparePickOrder);
    let runType = '';
    let runCount = 0;
    sorted.forEach(pick => {
      if (runType === type && runCount >= threshold) results.push(pick);
      const result = pick.win ? 'Win' : pick.loss ? 'Loss' : '';
      if (result === runType) runCount += 1;
      else { runType = result; runCount = result ? 1 : 0; }
    });
  });
  return results;
}

function oddsBandCandidates(rows) {
  return ODDS.map(band => {
    const picks = rows.filter(r => r.odds >= band[2] && r.odds <= band[3]);
    const wins = picks.filter(r => r.win).length;
    return { key: `odds||${band[0]}`, label: `Odds ${band[1]}`, picks: picks.length, wins, success: picks.length ? wins / picks.length : 0 };
  }).filter(c => c.picks > 0);
}

function streakContinuationPatterns(allMemberRowsSorted) {
  const active = activeStreak(allMemberRowsSorted);
  if (!active.type || active.count < 2) return null;
  const afterRows = picksAfterStreak(state.raw, active.type, active.count);
  if (!afterRows.length) return null;
  const candidates = patternCandidatePool(afterRows)
    .concat(oddsBandCandidates(afterRows))
    .sort(byBestStory);
  const top = candidates.slice(0, 2);
  if (!top.length) return null;
  return {
    active,
    items: top.map(c => ({ label: c.label, picks: c.picks, success: c.success })),
  };
}
function trendingPool(currentSeason) {
  if (state.seasonScope !== 'current') return state.raw.slice();
  const currentRows = state.raw.filter(r => seasonEqual(r.year, currentSeason));
  const currentRoundDates = uniq(currentRows.map(r => r.date));
  if (currentRoundDates.length >= 16) return currentRows;
  const priorRows = state.raw.filter(r => !seasonEqual(r.year, currentSeason));
  const priorDatesChronological = priorRows.slice().sort(comparePickOrder).map(r => r.date);
  const priorDatesMostRecentFirst = [...new Set(priorDatesChronological)].reverse();
  const roundsNeeded = 16 - currentRoundDates.length;
  const fillDates = priorDatesMostRecentFirst.slice(0, roundsNeeded);
  const fillRows = priorRows.filter(r => fillDates.includes(r.date));
  return fillRows.concat(currentRows);
}
function trendingMembersHtml(rows) {
  const min = Math.min(20, Math.max(5, Number($('minPicks').value) || 10));
  const top = aggregate(rows, 'member')
    .filter(x => x.picks >= min)
    .sort((a, b) => b.success - a.success || b.picks - a.picks)
    .slice(0, 3);
  if (!top.length) return '<div class="pa-placeholder">Not enough data yet.</div>';
  return '<div class="pa-stats">' + top.map((r, i) =>
    `<span>${i + 1}. ${escapeHtml(r.name)} - ${pct(r.success)} (${r.picks.toLocaleString()} picks)</span>`
  ).join('') + '</div>';
}

function trendingSportsHtml(rows) {
  const min = Math.min(50, Math.max(10, Number($('minPicks').value) || 20));
  const top = aggregate(rows, 'group')
    .filter(x => x.picks >= min)
    .sort((a, b) => b.success - a.success || b.picks - a.picks)
    .slice(0, 3);
  if (!top.length) return '<div class="pa-placeholder">Not enough data yet.</div>';
  return '<div class="pa-stats">' + top.map((r, i) =>
    `<span>${i + 1}. ${escapeHtml(r.name)} - ${pct(r.success)} (${r.picks.toLocaleString()} picks)</span>`
  ).join('') + '</div>';
}

function trendingCompetitionsHtml(rows) {
  const min = Math.min(30, Math.max(10, Number($('minPicks').value) || 15));
  const top = aggregate(rows, 'sport')
    .filter(x => x.picks >= min)
    .sort((a, b) => b.success - a.success || b.picks - a.picks)
    .slice(0, 3);
  if (!top.length) return '<div class="pa-placeholder">Not enough data yet.</div>';
  return '<div class="pa-stats">' + top.map((r, i) =>
    `<span>${i + 1}. ${escapeHtml(r.name)} - ${pct(r.success)} (${r.picks.toLocaleString()} picks)</span>`
  ).join('') + '</div>';
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
