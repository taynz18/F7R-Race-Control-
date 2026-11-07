import { circuitFor } from './circuits.js';
import { sessionInfo, sessionStats, compoundName } from './history-model.js?v=0.15.0';
import { lapTime, reading } from './model.js?v=0.10.1';
import { teamFor } from './teams.js?v=0.14.0';
import { driverRecords, compareLaps } from './race-data-model.js?v=1';

const byId = id => document.getElementById(id);
const element = (tag, text) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
};
const date = value => new Date(value).toLocaleString('en-GB');
const circuit = record => circuitFor(record.final_data?.track_id).name;
const records = new Map();
let client, signedIn = false, request = 0, offset = 0;

function choices(select, items) {
  const previous = select.value;
  select.replaceChildren(...items.map(([value, label]) => {
    const option = element('option', label);
    option.value = value;
    return option;
  }));
  if (items.some(([value]) => value === previous)) select.value = previous;
}

function table(columns, rows) {
  const wrapper = element('div');
  wrapper.className = 'data-table';
  const grid = element('table');
  const headings = element('tr');
  for (const column of columns) {
    const cell = element('th', column);
    cell.scope = 'col';
    headings.append(cell);
  }
  grid.createTHead().append(headings);
  const body = grid.createTBody();
  for (const values of rows) {
    const row = element('tr');
    for (const value of values) row.append(element('td', String(value)));
    body.append(row);
  }
  wrapper.append(grid);
  return wrapper;
}

function resetDetail() {
  request++;
  byId('analyse').disabled = !byId('session').value;
  byId('session-detail').replaceChildren();
  byId('session-status').textContent = 'Choose a recording to see the classification snapshot and observed lap times.';
}

function renderArchive() {
  const all = [...records.values()];
  const circuits = [...new Set(all.map(circuit))].sort();
  choices(byId('circuit'), [['', 'All circuits'], ...circuits.map(name => [name, name])]);
  const selectedCircuit = byId('circuit').value;
  const kind = byId('kind').value;
  const filtered = all.filter(record =>
    (!selectedCircuit || circuit(record) === selectedCircuit) &&
    (!kind || sessionInfo(record).kind === kind)
  );
  const races = filtered.filter(record => sessionInfo(record).kind === 'race');
  const drivers = driverRecords(races);
  byId('archive-metrics').replaceChildren(...[
    [filtered.length, 'Saved sessions'], [races.length, 'Race sessions'],
    [new Set(filtered.map(circuit)).size, 'Circuits'], [drivers.length, 'Named race drivers'],
  ].map(([value, label]) => {
    const metric = element('div');
    metric.append(element('strong', String(value)), element('span', label));
    return metric;
  }));
  byId('driver-records').replaceChildren(drivers.length
    ? table(['Driver', 'Appearances', 'Recorded finishes', 'Wins', 'Podiums', 'DNF / retired', 'Avg finish'],
      drivers.map(d => [d.name, d.appearances, d.finishes, d.wins, d.podiums, d.dnf,
        d.finishes ? (d.positionSum / d.finishes).toFixed(1) : '—']))
    : element('p', 'No named drivers from race sessions match these filters. Older recordings may need a race label in Previous sessions.'));
  choices(byId('session'), [['', 'Select a saved session'], ...filtered.map(r =>
    [r.id, circuit(r) + ' · ' + sessionInfo(r).label + ' · ' + date(r.started_at) + (r.title && r.title !== 'F7R session' ? ' · ' + r.title : '')]
  )]);
  resetDetail();
}

async function loadArchive() {
  const button = byId('load-more');
  button.disabled = true;
  try {
    const { data, error } = await client.from('f7r_recordings')
      .select('id,title,started_at,final_data,session_kind,archive_reason')
      .eq('state', 'saved').order('started_at', { ascending: false }).order('id')
      .range(offset, offset + 49);
    if (!signedIn) return;
    if (error) throw error;
    for (const record of data) records.set(record.id, record);
    offset += data.length;
    button.hidden = data.length < 50;
    byId('archive').hidden = false;
    byId('archive-status').textContent = records.size + ' saved sessions loaded.';
    renderArchive();
  } catch {
    byId('archive-status').textContent = 'Could not load saved sessions. Refresh to try again.';
  } finally {
    button.disabled = false;
  }
}

function comparison(stats) {
  const section = element('section');
  section.append(element('h3', 'Compare two drivers'), element('p', 'Lap deltas compare the same recorded lap number. A positive delta means Driver A was slower.'));
  const eligible = stats.filter(driver => driver.laps.length);
  if (eligible.length < 2) {
    section.append(element('p', 'Two drivers with observed laps are needed for comparison.'));
    return section;
  }
  const controls = element('div');
  controls.className = 'data-controls';
  const picks = ['Driver A', 'Driver B'].map(name => {
    const label = element('label', name);
    const select = element('select');
    choices(select, eligible.map(driver => [String(driver.slot), driver.name + ' · ' + teamFor(driver.driver.team_id).name + ' · slot ' + (driver.slot + 1)]));
    label.append(select);
    controls.append(label);
    return select;
  });
  picks[1].selectedIndex = 1;
  const output = element('div');
  function render() {
    const [a, b] = picks.map(select => eligible.find(driver => String(driver.slot) === select.value));
    if (a === b) {
      output.replaceChildren(element('p', 'Select two different drivers.'));
      return;
    }
    output.replaceChildren(table(['Lap', 'Driver A', 'Driver B', 'A − B'], compareLaps(a, b).map(lap =>
      [lap.lap, lapTime(lap.first), lapTime(lap.second), lap.delta === null ? '—' : (lap.delta > 0 ? '+' : '') + (lap.delta / 1000).toFixed(3) + ' s'])));
  }
  picks.forEach(select => select.addEventListener('change', render));
  section.append(controls, output);
  render();
  return section;
}

async function analyse() {
  const record = records.get(byId('session').value);
  if (!record || !signedIn) return;
  const generation = ++request;
  const status = byId('session-status');
  const detail = byId('session-detail');
  byId('analyse').disabled = true;
  detail.replaceChildren();
  status.textContent = 'Loading the saved lap samples…';
  try {
    const samples = [];
    for (let start = 0; ; start += 250) {
      const { data, error } = await client.from('f7r_recording_samples').select('frame,data')
        .eq('recording_id', record.id).order('frame').range(start, start + 249);
      if (generation !== request) return;
      if (error) throw error;
      samples.push(...data);
      if (data.length < 250) break;
      status.textContent = samples.length + ' samples loaded…';
    }
    const stats = sessionStats(samples, record.final_data ?? {});
    const pace = stats.filter(driver => driver.best !== null).sort((a, b) => a.best - b.best);
    status.textContent = circuit(record) + ' · ' + sessionInfo(record).label + ' · ' + samples.length + ' saved samples' +
      (record.archive_reason === 'inactive' ? ' · Feed ended or was interrupted' : '');
    const states = {2:'Racing',3:'Finished',4:'DNF',5:'Disqualified',6:'Not classified',7:'Retired'};
    detail.append(element('h3', 'Last recorded order'), table(['Pos', 'Driver', 'Car', 'Status', 'Last lap number', 'Game penalties', 'Observed pit entries'],
      stats.map(({driver: d, name, pitStops}) => [d.position || '—', name, teamFor(d.team_id).name, states[d.result_status] ?? '—',
        d.lap || '—', reading(d.penalties, ' s', 0), pitStops])));
    detail.append(element('h3', 'Observed pace leaderboard'), element('p', 'Based on captured lap transitions. Incomplete coverage, pit laps and changing conditions can affect these figures.'));
    detail.append(pace.length ? table(['Rank', 'Driver', 'Best lap', 'Average lap', 'Lap time spread', 'Laps sampled', 'Observed tyre changes'],
      pace.map((d, index) => [index + 1, d.name, lapTime(d.best), lapTime(d.average), reading(d.consistency === null ? null : d.consistency / 1000, ' s', 3),
        d.laps.length, d.stints.map(stint => compoundName(stint.compound) + ' L' + (stint.lap || '—')).join(' → ') || '—']))
      : element('p', 'No completed lap transitions were recorded.'));
    detail.append(comparison(stats));
  } catch {
    if (generation === request) status.textContent = 'Could not load the selected recording. Try Analyse session again.';
  } finally {
    if (generation === request) byId('analyse').disabled = false;
  }
}

choices(byId('kind'), [['', 'All session types'], ['race', 'Race'], ['qualifying', 'Qualifying'],
  ['practice', 'Practice'], ['time-trial', 'Time trial'], ['unknown', 'Unclassified']]);
byId('kind').addEventListener('change', renderArchive);
byId('circuit').addEventListener('change', renderArchive);
byId('session').addEventListener('change', resetDetail);
byId('analyse').addEventListener('click', analyse);
byId('load-more').addEventListener('click', loadArchive);

async function init() {
  try {
    const response = await fetch('./config.json', { cache: 'no-store' });
    if (!response.ok) throw Error('Configuration unavailable');
    const config = await response.json();
    client = window.supabase.createClient(config.supabase_url, config.supabase_publishable_key,
      { auth: window.F7RAuth.options() });
    const { data, error } = await client.auth.getUser();
    if (error || !data.user || data.user.is_anonymous) {
      const link = element('a', 'Sign in to F7R');
      link.href = './index.html?next=race-data';
      byId('archive-status').replaceChildren('Race Data uses the signed-in session archive. ', link);
      return;
    }
    signedIn = true;
    client.auth.onAuthStateChange(event => {
      if (event !== 'SIGNED_OUT') return;
      signedIn = false;
      records.clear();
      resetDetail();
      renderArchive();
      byId('archive').hidden = true;
      byId('archive-status').textContent = 'Signed out. Sign in again to view Race Data.';
    });
    await loadArchive();
  } catch {
    byId('archive-status').textContent = 'Race Data could not connect. Refresh to try again.';
  }
}
init();
