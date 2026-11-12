import {resolveTeam,styleTeamLogo} from './wec-logos.js?v=1';
import {POINTS, pointsFor, validateArchive} from './league-model.js?v=2';
import {TEAMS} from './teams.js?v=0.14.0';
import {lapTime} from './model.js?v=0.10.1';

const $ = id => document.getElementById(id);
const storageKey = 'f7r-league-review-v1';
let season;
let libraryDb;
const library = new Map();
const node = (tag, text) => {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  return el;
};
const flag = code => /^[A-Z]{2}$/.test(code ?? '')
  ? String.fromCodePoint(...[...code].map(letter => 127397 + letter.charCodeAt(0))) + ' ' : '';
const circuit = event => flag(event.country) + event.name;
const kind = session => ({0:'Qualifying',1:'Race'})[session.type] ?? 'Session';
const position = value => value > 0 ? value : '';
const status = message => { $('league-status').textContent = message; };

function seasonKey(value) {
  return value.id || 'name:' + value.name.trim().toLowerCase();
}

function openLibrary() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('f7r-league-library', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('seasons');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(Error('Close other League Archive tabs and retry.'));
  });
}

function storeSeasons(values) {
  return new Promise((resolve, reject) => {
    const transaction = libraryDb.transaction('seasons', 'readwrite');
    const records = transaction.objectStore('seasons');
    for (const value of values) records.put(value, seasonKey(value));
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error);
  });
}

async function save(message) {
  try {
    await storeSeasons([season]);
    status(message);
  } catch {
    status('Browser saving unavailable. Download the edited season to keep your changes.');
  }
}

function selectSeason(key) {
  season = library.get(key);
  if (!season) return;
  try { localStorage.setItem('f7r-league-active-season', key); } catch {}
  render();
}

function updatePicker(key) {
  const picker = $('season-picker');
  picker.replaceChildren(...[...library].map(([id, value]) => {
    const option = node('option', value.name + (value.archived === true ? ' · Archived' : ''));
    option.value = id;
    return option;
  }));
  picker.disabled = !library.size;
  if (library.has(key)) picker.value = key;
  selectSeason(picker.value);
}

$('season-picker').addEventListener('change', event => selectSeason(event.target.value));

function options(select, labels, value = 0) {
  select.replaceChildren(...labels.map((label, index) => {
    const option = node('option', label);
    option.value = index;
    return option;
  }));
  if (value < labels.length) select.value = value;
}

function table(container, columns, rows) {
  const wrap = node('div');
  wrap.className = 'data-table';
  const table = node('table');
  const header = table.createTHead().insertRow();
  columns.forEach(column => {
    const th = node('th', column);
    th.scope = 'col';
    header.append(th);
  });
  const body = table.createTBody();
  rows.forEach(values => {
    const row = body.insertRow();
    values.forEach(value => {
      const cell = row.insertCell();
      if (value instanceof Node) cell.append(value);
      else cell.textContent = value ?? '';
    });
  });
  wrap.append(table);
  container.replaceChildren(wrap);
}

function car(teamName) {
  const team = resolveTeam(teamName);
  const text = node('span');
  if (team?.logo) {
    const image = node('img');
    image.src = './assets/teams/' + team.logo;
    image.alt = '';
    image.width = 26;
    image.height = 24;
    image.style.cssText = 'vertical-align:middle;object-fit:contain;margin-right:8px';
    styleTeamLogo(image,team);
    text.append(image);
  }
  text.append(teamName ?? '');
  return text;
}

function driverLabel(name) {
  return (name === season.driverChampion ? '🏆 ' : '') + name;
}

function renderDriver() {
  const name = $('league-driver').selectedOptions[0]?.dataset.driver;
  const rows = [];
  for (const event of season.events) for (const session of event.sessions) {
    for (const result of session.results) if (result.driver === name) {
      rows.push([circuit(event), event.date, kind(session), car(result.team),
        position(result.grid), position(result.classification), result.laps, lapTime(result.fastestMs)]);
    }
  }
  table($('driver-results'), ['Circuit','Date','Session','Car','Grid','Classification','Laps','Fastest lap'], rows);
}

function renderProfiles() {
  const prior = $('league-driver').selectedOptions[0]?.dataset.driver;
  const names = [...new Set(season.events.flatMap(event => event.sessions.flatMap(session =>
    session.results.map(result => result.driver))))].filter(name => name && name !== 'Unnamed driver').sort();
  options($('league-driver'), names.map(driverLabel), names.indexOf(prior) < 0 ? 0 : names.indexOf(prior));
  [...$('league-driver').options].forEach((option, i) => { option.dataset.driver = names[i]; });
  renderDriver();
  const points = new Map();
  for (const event of season.events) for (const session of event.sessions) {
    if (session.type !== 1 || !session.scored) continue;
    for (const result of session.results) {
      const value = pointsFor(result.classification, season.scale);
      if (value === null || !result.driver || result.driver === 'Unnamed driver') continue;
      points.set(result.driver, (points.get(result.driver) ?? 0) + value);
    }
  }
  table($('points-table'), ['Driver','Points'], [...points].sort((a,b) => b[1] - a[1]).map(([name,value]) => [driverLabel(name), value]));
}

function renderResults() {
  const event = season.events[Number($('league-event').value)];
  const session = event?.sessions[Number($('league-session').value)];
  $('points-option').hidden = season.scale === 'unset' || session?.type !== 1 || !session.results.length;
  $('score-session').checked = !!session?.scored;
  $('results-note').textContent = session?.results.length ? kind(session) + ' · ' + session.results.length + ' driver records' : 'No results imported for this session.';
  $('league-results').replaceChildren();
  if (!session?.results.length) return;
  table($('league-results'), ['Class.','Recorded pos.','Driver','Car','Grid','Laps','Fastest lap','Stops','Game pen. (s)','Steward pen. (s)','Provisional pts'],
    session.results.map(result => {
      const editor = node('input');
      editor.value = result.driver || 'Unnamed driver';
      editor.maxLength = 64;
      editor.setAttribute('aria-label', 'Edit driver name, position ' + (result.classification || result.recordedPosition || 'unknown'));
      editor.addEventListener('change', () => {
        result.driver = editor.value.trim() || 'Unnamed driver';
        save('Driver name saved.');
        renderResults();
        renderProfiles();
      });
      return [position(result.classification),position(result.recordedPosition),editor,car(result.team),
        position(result.grid),result.laps,lapTime(result.fastestMs),result.pits,result.gamePenalty,result.stewardPenalty,
        session.type === 1 && session.scored ? pointsFor(result.classification, season.scale) : ''];
    }));
}

function renderEvent(sessionIndex = 0) {
  const event = season.events[Number($('league-event').value)];
  $('circuit-name').value = event?.name ?? '';
  $('country-code').value = event?.country ?? '';
  $('save-circuit').disabled = !event;
  options($('league-session'), (event?.sessions ?? []).map((s,i) => (i+1) + '. ' + kind(s) + ' · ' + (s.results.length ? s.results.length + ' drivers' : 'Awaiting results')), sessionIndex);
  renderResults();
}

function render(eventIndex = 0, sessionIndex = 0) {
  $('league-content').hidden = false;
  $('backup-season').disabled = false;
  $('season-title').textContent = season.name;
  $('points-rule').value = season.scale;
  $('season-summary').textContent = season.events.length + ' calendar entries · Points scale ' + (POINTS[season.scale]?.join(' / ') ?? 'not configured');
  $('driver-champion').value = season.driverChampion ?? '';
  $('team-champion').value = season.teamChampion ?? '';
  $('honours').textContent = [season.driverChampion && '🏆 Driver · ' + season.driverChampion, season.teamChampion && '🏆 Constructor · ' + season.teamChampion].filter(Boolean).join('   ');
  table($('season-calendar'), ['Date as stored','Circuit / event','Sessions with results'], season.events.map(event => {
    const count = event.sessions.filter(s => s.results.length).length;
    return [event.date,circuit(event),count || ''];
  }));
  options($('league-event'), season.events.map(event => circuit(event) + ' · ' + event.date.slice(0,10)), eventIndex);
  renderEvent(sessionIndex);
  renderProfiles();
}

$('points-rule').addEventListener('change', () => {
  season.scale = $('points-rule').value;
  save('Points rule saved for this season.');
  render(Number($('league-event').value), Number($('league-session').value));
});
$('league-event').addEventListener('change', () => renderEvent());
$('league-session').addEventListener('change', renderResults);
$('league-driver').addEventListener('change', renderDriver);
$('score-session').addEventListener('change', () => {
  const session = season.events[Number($('league-event').value)]?.sessions[Number($('league-session').value)];
  if (!session || session.type !== 1 || !session.results.length) return;
  session.scored = $('score-session').checked;
  save('Provisional points updated.');
  renderResults();
  renderProfiles();
});
$('save-circuit').addEventListener('click', () => {
  const eventIndex = Number($('league-event').value);
  const sessionIndex = Number($('league-session').value);
  const code = $('country-code').value.trim().toUpperCase();
  if (code && !/^[A-Z]{2}$/.test(code)) { status('Enter a two-letter country code.'); return; }
  const event = season.events[eventIndex];
  event.name = $('circuit-name').value.trim() || 'Unnamed circuit';
  event.country = code;
  save('Circuit saved.');
  render(eventIndex, sessionIndex);
});
$('save-honours').addEventListener('click', () => {
  season.driverChampion = $('driver-champion').value.trim();
  season.teamChampion = $('team-champion').value.trim();
  save('Confirmed champions saved.');
  render(Number($('league-event').value), Number($('league-session').value));
});
$('season-file').addEventListener('change', async event => {
  const input = event.target;
  const file = input.files[0];
  if (!file) return;
  input.disabled = true;
  try {
    if (file.size > 30_000_000) throw Error('The season file exceeds 30 MB.');
    const data = JSON.parse(await file.text());
    const isLibrary = data?.format === 'f7r-library-1';
    if (isLibrary && (!Array.isArray(data.seasons) || !data.seasons.length)) throw Error('The season library is empty or invalid.');
    const incoming = (isLibrary ? data.seasons : [data]).map(validateArchive);
    const pending = new Map();
    let skipped = 0;
    for (const value of incoming) {
      const key = seasonKey(value);
      const nameKey = 'name:' + value.name.trim().toLowerCase();
      const sameName = !value.id ? [...library.values()].filter(item => 'name:' + item.name.trim().toLowerCase() === nameKey) : [];
      const old = library.get(key) ?? library.get(nameKey) ?? (sameName.length === 1 ? sameName[0] : undefined);
      if (isLibrary && old) { skipped++; continue; }
      if (old && !confirm('Replace ' + old.name + ' in this browser? Download an edited backup first if needed.')) return;
      // Replacing a legacy single-season copy keeps its existing key.
      if (old) value.id = old.id;
      const finalKey = seasonKey(value);
      if (pending.has(finalKey)) throw Error('The file contains duplicate season identifiers.');
      pending.set(finalKey, value);
    }
    if (!libraryDb) throw Error('Browser storage is unavailable. Try a regular browser window.');
    await storeSeasons(pending.values());
    for (const [key, value] of pending) library.set(key, value);
    updatePicker(season ? seasonKey(season) : pending.keys().next().value);
    status(pending.size + ' seasons imported. ' + skipped + ' existing seasons kept. ' + library.size + ' available in this browser.');
  } catch (error) {
    status(error.message);
  } finally {
    input.value = '';
    input.disabled = false;
  }
});
$('backup-season').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(season,null,2)], {type:'application/json'}));
  const link = node('a');
  link.href = url;
  link.download = 'F7R-season-backup.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
async function initLibrary() {
  const input = $('season-file');
  input.disabled = true;
  try {
    libraryDb = await openLibrary();
    const values = await new Promise((resolve, reject) => {
      const request = libraryDb.transaction('seasons').objectStore('seasons').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    for (const value of values) library.set(seasonKey(value), validateArchive(value));
    const legacy = localStorage.getItem(storageKey);
    if (legacy && !library.size) {
      const value = validateArchive(JSON.parse(legacy));
      await storeSeasons([value]);
      library.set(seasonKey(value), value);
    }
    if (library.size) {
      updatePicker(localStorage.getItem('f7r-league-active-season'));
      status(library.size + ' saved seasons available in this browser.');
    }
  } catch {
    status('Could not open browser storage for the season library.');
  } finally {
    input.disabled = false;
  }
}
initLibrary();

