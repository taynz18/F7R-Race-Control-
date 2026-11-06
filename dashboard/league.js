import {POINTS, pointsFor, validateArchive} from './league-model.js?v=1';
import {TEAMS} from './teams.js?v=0.14.0';
import {lapTime} from './model.js?v=0.10.1';

const $ = id => document.getElementById(id);
const storageKey = 'f7r-league-review-v1';
let season;
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

function save(message) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(season));
    status(message);
  } catch {
    status('Browser saving unavailable. Download the edited season to keep your changes.');
  }
}

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
  const team = Object.values(TEAMS).find(team => team.name === teamName ||
    (team.key === 'redbull' && teamName === 'Red Bull'));
  const text = node('span');
  if (team?.logo) {
    const image = node('img');
    image.src = './assets/teams/' + team.logo;
    image.alt = '';
    image.width = 26;
    image.height = 24;
    image.style.cssText = 'vertical-align:middle;object-fit:contain;margin-right:8px';
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
  $('points-option').hidden = session?.type !== 1 || !session.results.length;
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
  $('season-summary').textContent = season.events.length + ' calendar entries · Points scale ' + POINTS[season.scale].join(' / ');
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
  try {
    if (file.size > 10_000_000) throw Error('The season file exceeds 10 MB.');
    const incoming = validateArchive(JSON.parse(await file.text()));
    if (season && !confirm('Replace the season in this browser? Download an edited backup first if you want to keep it.')) return;
    season = incoming;
    save('Season imported into this browser.');
    render();
  } catch (error) {
    status(error.message);
  } finally {
    input.value = '';
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
try {
  const saved = localStorage.getItem(storageKey);
  if (saved) {
    season = validateArchive(JSON.parse(saved));
    render();
    status('Saved season loaded from this browser.');
  }
} catch {
  status('Could not restore the local season. Import a season file to continue.');
}
