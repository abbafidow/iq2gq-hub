const API_URL = 'https://script.google.com/macros/s/AKfycbxkk34u9pyYb6KIKZ6J08owwLmqiT_WXBfHkXtDhdsW4PDlZZ3wn9yWmmJafudaYCEG/exec';

const state = {
  raw: [],
  apiCount: 0,
  page: 'dashboard',
  sort: {},
};

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
  const date = clean(pick(row, ['Date', 'MM Drop', 'Drop Date', 'date']));
  const name = clean(pick(row, ['Bet Name', 'Name', 'Bet', 'Selection', 'Team', 'Option Name', 'betName']));
  const key = clean(pick(row, ['Key', 'ID', 'Id', 'Record ID']));

  return {
    key: key || String(index + 1),
    member,
    sport,
    group: sportGroup(sport),
    betType,
    odds,
    result,
    win: result === 'Win',
    loss: result === 'Loss',
    year,
    date,
    name,
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
  return sport ? sport.split('(')[0].trim() : 'Other';
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
    buildFilters();
    bind();
    render();
    $('status').textContent = `${state.raw.length.toLocaleString()} resulted picks loaded from Google Sheets (${state.apiCount.toLocaleString()} source rows)`;
  } catch (error) {
    $('status').textContent = 'Could not load Google Sheet data';
    console.error(error);
  }
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
  fill('betTypeFilter', uniq(state.raw.map(r => r.betType)));
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
  ['memberFilter', 'sportGroupFilter', 'betTypeFilter', 'yearFilter', 'oddsFilter', 'resultFilter', 'searchInput', 'minPicks']
    .forEach(id => $(id).addEventListener('input', render));
  $('resetBtn').onclick = () => {
    ['memberFilter', 'sportGroupFilter', 'betTypeFilter', 'yearFilter', 'oddsFilter', 'resultFilter', 'searchInput']
      .forEach(id => $(id).value = '');
    $('minPicks').value = 10;
    render();
  };
  document.querySelectorAll('[data-quick]').forEach(button => button.onclick = () => quick(button.dataset.quick));
}

function quick(q) {
  $('memberFilter').value = '';
  $('sportGroupFilter').value = '';
  $('betTypeFilter').value = '';
  $('oddsFilter').value = '';
  $('resultFilter').value = '';
  $('searchInput').value = '';
  if (q === 'nrl') $('searchInput').value = 'NRL';
  if (q === 'nfl') $('searchInput').value = 'NFL';
  if (q === 'union') $('sportGroupFilter').value = 'Rugby Union';
  if (q === 'football') $('sportGroupFilter').value = 'Football';
  if (q === 'h2h') $('searchInput').value = 'H2H';
  if (q === 'point') $('searchInput').value = 'point start';
  if (q === 'scorer') $('searchInput').value = 'scorer';
  if (q === '2plus') $('oddsFilter').value = '2plus';
  if (q === 'losses') $('resultFilter').value = 'Loss';
  render();
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
  if (member) data = data.filter(r => r.member === member);
  if (group) data = data.filter(r => r.group === group);
  if (betType) data = data.filter(r => r.betType === betType);
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
    const av = a[sort.key];
    const bv = b[sort.key];
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sort.dir;
    return String(av ?? '').localeCompare(String(bv ?? '')) * sort.dir;
  });
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

function currentYear(data) {
  return uniq(data.map(r => r.year)).pop() || '';
}

function kpis(data) {
  const wins = data.filter(r => r.win).length;
  const losses = data.filter(r => r.loss).length;
  const avg = data.reduce((sum, row) => sum + (row.odds || 0), 0) / (data.length || 1);
  return `<section class="grid">
    <div class="kpi"><div class="label">Resulted picks</div><div class="value">${data.length.toLocaleString()}</div><div class="hint">${state.apiCount.toLocaleString()} source rows</div></div>
    <div class="kpi"><div class="label">Success rate</div><div class="value">${pct(wins / (wins + losses || 1))}</div><div class="hint">${wins} wins / ${losses} losses</div></div>
    <div class="kpi"><div class="label">Average odds</div><div class="value">${oddsFmt(avg)}</div><div class="hint">Known odds only</div></div>
    <div class="kpi"><div class="label">Members</div><div class="value">${uniq(data.map(r => r.member)).length}</div><div class="hint">In filtered data</div></div>
  </section>`;
}

function render() {
  const data = filtered();
  const page = state.page;
  const app = $('app');
  if (page === 'dashboard') app.innerHTML = dashboard(data);
  if (page === 'live') app.innerHTML = live(data);
  if (page === 'members') app.innerHTML = members(data);
  if (page === 'sports') app.innerHTML = sports(data);
  if (page === 'bettypes') app.innerHTML = betTypes(data);
  if (page === 'odds') app.innerHTML = odds(data);
  if (page === 'records') app.innerHTML = records(data);
  if (page === 'search') app.innerHTML = search(data);
}

function dashboard(data) {
  const min = Number($('minPicks').value) || 1;
  const members = rank(sortRows(aggregate(data, 'member').filter(x => x.picks >= min), 'members').slice(0, 13));
  const sports = rank(sortRows(aggregate(data, 'sport').filter(x => x.picks >= min), 'sports').slice(0, 20));
  return `${kpis(data)}<section class="two"><div class="panel"><h2>Top members</h2>${table(members, 'members', memberCols())}</div><div class="panel"><h2>Sport performance</h2>${table(sports, 'sports', sportCols())}</div></section>${insights(data)}`;
}

function live(data) {
  const cy = currentYear(state.raw);
  const current = data.filter(r => r.year === cy);
  return `<div class="panel"><h2>${escapeHtml(cy || 'Current season')} Live</h2><p class="muted">Current season view. When Raw_Live starts on 7 August 2026, this page becomes the priority weekly page.</p></div>${dashboard(current)}`;
}

function members(data) {
  const min = Number($('minPicks').value) || 1;
  const rows = rank(sortRows(aggregate(data, 'member').filter(x => x.picks >= min), 'membersPage'));
  return `<div class="panel"><h2>Members</h2>${table(rows, 'membersPage', memberCols())}</div>`;
}

function sports(data) {
  const min = Number($('minPicks').value) || 1;
  const rows = rank(sortRows(aggregate(data, 'sport').filter(x => x.picks >= min), 'sportsPage'));
  return `<div class="panel"><h2>Sports and competitions</h2>${table(rows, 'sportsPage', sportCols())}</div>`;
}

function betTypes(data) {
  const min = Number($('minPicks').value) || 1;
  const rows = rank(sortRows(aggregate(data, 'betType').filter(x => x.picks >= min), 'betTypes'));
  return `<div class="panel"><h2>Bet types</h2>${table(rows, 'betTypes', sportCols('Bet type'))}</div>`;
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
  const topMember = sortRows(aggregate(data, 'member'), 'insM')[0];
  const topSport = sortRows(aggregate(data, 'sport'), 'insS')[0];
  const next = nextRoundInsights(state.raw).slice(0, 6);
  return `<div class="panel"><h2>Quick insights</h2><div class="insight-list">
    <div class="insight">Best member in this view: <strong>${topMember?.name || '-'}</strong> (${topMember ? pct(topMember.success) : '-'})</div>
    <div class="insight">Best sport in this view: <strong>${topSport?.name || '-'}</strong> (${topSport ? pct(topSport.success) : '-'})</div>
    ${next.map(text => `<div class="insight">${text}</div>`).join('')}
  </div></div>`;
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
