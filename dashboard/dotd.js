const $ = id => document.getElementById('dotd-' + id);
let client, user, polls = [], current, results = [], vote, loading = false, closed = false;
const status = message => { $('status').textContent = message; };

function node(tag, text) {
  const el = document.createElement(tag);
  if (text) el.textContent = text;
  return el;
}

function resultRows(poll, counts) {
  const total = counts.reduce((sum, row) => sum + Number(row.votes), 0);
  const rows = counts.map(row => ({
    name: poll.nominees[row.nominee - 1],
    votes: Number(row.votes),
    share: total ? 100 * Number(row.votes) / total : 0
  })).sort((a, b) => b.votes - a.votes);
  const winners = rows.filter(row => row.votes > 0 && row.votes === rows[0].votes);
  return {total, rows, headline: winners.length === 1 ? winners[0].name : winners.length ? 'Joint winners' : 'No votes cast'};
}

function paintResults(poll, counts) {
  const {total, rows, headline} = resultRows(poll, counts);
  $('summary').textContent = headline + ' · ' + total + ' ' + (total === 1 ? 'vote' : 'votes');
  $('results-list').replaceChildren(...rows.map(row => {
    const item = node('li', row.name + ' · ' + row.votes + ' · ' + row.share.toFixed(1) + '%');
    const bar = node('span');
    bar.className = 'dotd-bar';
    bar.style.setProperty('--share', row.share + '%');
    item.append(bar);
    return item;
  }));
  $('results').hidden = false;
}

async function readResult(poll) {
  const {data, error} = await client.rpc('f7r_dotd_results', {poll: poll.id});
  if (current?.id !== poll.id) return;
  if (error) throw error;
  if (!data.length) return;
  results = data;
  paintResults(poll, results);
}

function tick() {
  if (!current) return;
  const seconds = Math.max(0, Math.ceil((Date.parse(current.ends_at) - Date.now()) / 1000));
  if (!seconds) {
    $('clock').textContent = 'Voting closed';
    $('vote').hidden = $('signin').hidden = true;
    if (!closed) {
      closed = true;
      readResult(current).catch(() => status('Could not load results. Retrying shortly.'));
    }
    return;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  $('clock').textContent = 'Voting closes in ' + (hours ? hours + 'h ' : '') + minutes + 'm ' + (seconds % 60) + 's';
}

async function selectPoll(id) {
  current = polls.find(poll => poll.id === id);
  results = [];
  vote = null;
  closed = false;
  $('vote').hidden = $('signin').hidden = $('results').hidden = true;
  const poll = current;
  $('title').textContent = poll?.title || 'No race polls yet';
  $('clock').textContent = '';
  if (!poll) return;
  $('race').value = poll.id;
  $('signin').href = './index.html?next=dotd&poll=' + encodeURIComponent(poll.id);
  const url = new URL(location.href);
  url.searchParams.set('poll', poll.id);
  history.replaceState(null, '', url);
  $('options').replaceChildren(...poll.nominees.map((name, index) => {
    const label = node('label');
    label.className = 'dotd-option';
    const radio = node('input');
    radio.type = 'radio';
    radio.name = 'nominee';
    radio.value = String(index + 1);
    radio.required = true;
    label.append(radio, node('span', name));
    return label;
  }));
  if (user) {
    const {data, error} = await client.from('f7r_dotd_votes').select('nominee').eq('poll_id', poll.id).maybeSingle();
    if (current?.id !== poll.id) return;
    if (error) throw error;
    vote = data?.nominee;
    if (vote) status('Your vote for ' + poll.nominees[vote - 1] + ' is recorded.');
  }
  if (Date.now() < Date.parse(poll.ends_at)) {
    $('vote').hidden = !user || !!vote;
    $('signin').hidden = !!user;
  }
  tick();
}

async function refresh(wanted = current?.id) {
  if (loading) return;
  loading = true;
  const initial = current?.id;
  try {
    let {data, error} = await client.from('f7r_dotd_polls').select('id,title,nominees,ends_at').order('created_at', {ascending:false}).limit(50);
    if (error) throw error;
    if (wanted && !data.some(poll => poll.id === wanted) && /^[0-9a-f-]{36}$/i.test(wanted)) {
      const older = await client.from('f7r_dotd_polls').select('id,title,nominees,ends_at').eq('id', wanted).maybeSingle();
      if (older.error) throw older.error;
      if (older.data) data = [...data, older.data];
    }
    if (initial !== current?.id) return;
    const selected = wanted || current?.id;
    polls = data;
    $('race').replaceChildren(...(polls.length ? polls.map(poll => new Option(poll.title, poll.id)) : [new Option('No polls yet')]));
    $('race').disabled = !polls.length;
    const id = polls.find(poll => poll.id === selected)?.id ?? polls[0]?.id;
    if (id !== current?.id || !current) await selectPoll(id);
    else {
      $('race').value = id;
      if (closed && !results.length) await readResult(current);
    }
  } finally {
    loading = false;
  }
}

$('race').onchange = () => {
  status('');
  selectPoll($('race').value).catch(error => status(error.message));
};

$('vote').onsubmit = async event => {
  event.preventDefault();
  const poll = current;
  const nominee = Number(new FormData(event.currentTarget).get('nominee'));
  if (!poll || !nominee) return;
  const button = event.submitter;
  button.disabled = true;
  try {
    const {error} = await client.from('f7r_dotd_votes').insert({poll_id:poll.id, nominee});
    if (error) throw error;
    if (current?.id === poll.id) {
      vote = nominee;
      $('vote').hidden = true;
      status('Your vote for ' + poll.nominees[nominee - 1] + ' is recorded.');
    }
  } catch (error) {
    if (current?.id === poll.id) {
      status(error.code === '23505' ? 'You already voted in this race.' : 'Could not vote. Check that voting is still open.');
      if (error.code === '23505') $('vote').hidden = true;
      tick();
    }
  } finally {
    button.disabled = false;
  }
};

$('create').onsubmit = async event => {
  event.preventDefault();
  const candidates = $('nominees').value.split(/\r?\n/).map(name => name.trim()).filter(Boolean);
  const button = event.submitter;
  button.disabled = true;
  try {
    const {data, error} = await client.rpc('f7r_dotd_create', {
      race_title: $('race-title').value.trim(),
      candidates,
      minutes: $('minutes').valueAsNumber
    });
    if (error) throw error;
    // Select the new poll even if a scheduled refresh is already in flight.
    const poll = data;
    polls.unshift(poll);
    $('race').add(new Option(poll.title, poll.id), 0);
    $('race').disabled = false;
    await selectPoll(poll.id);
    $('create').reset();
    status('Voting is open. Share this page link with drivers.');
  } catch (error) {
    status(error.code === '23505' ? 'This race already has a poll. Use a unique race name including the tier and round.' : error.message);
  } finally {
    button.disabled = false;
  }
};

$('download').onclick = async () => {
  if (!current || !results.length) return;
  const title = current.title;
  const {total, rows, headline} = resultRows(current, results);
  const canvas = node('canvas');
  canvas.width = 1200;
  canvas.height = 350 + rows.length * 64;
  const ctx = canvas.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, 1200, canvas.height);
  bg.addColorStop(0, '#301b49');
  bg.addColorStop(1, '#0c1425');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1200, canvas.height);
  ctx.save();
  ctx.strokeStyle = '#c79bff22';
  for (let x = 100; x < 1200 + canvas.height; x += 48) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x - canvas.height, canvas.height); ctx.stroke();
  }
  ctx.restore();
  const logo = new Image();
  logo.src = './assets/f7r-logo.png';
  try { await logo.decode(); ctx.drawImage(logo, 930, 50, 220, 220 * logo.naturalHeight / logo.naturalWidth); } catch {}
  const write = (text, x, y, font, colour, width) => {
    ctx.font = font; ctx.fillStyle = colour; ctx.fillText(text, x, y, width);
  };
  write('F7R RACE CONTROL  /  FINAL VOTE', 64, 62, 'bold 20px Arial', '#d8b9ff', 800);
  write('DRIVER OF THE DAY', 64, 132, 'bold 56px Arial', '#ffffff', 1050);
  write(title, 64, 181, '27px Arial', '#d8cbed', 1060);
  write(headline, 64, 247, 'bold 44px Arial', '#e6caff', 1060);
  write(total + (total === 1 ? ' vote cast' : ' votes cast'), 64, 282, '22px Arial', '#ffffff', 1060);
  rows.forEach((row, index) => {
    const y = 332 + index * 64;
    write(row.name, 64, y, 'bold 23px Arial', '#ffffff', 780);
    ctx.textAlign = 'right';
    write(row.votes + (row.votes === 1 ? ' vote' : ' votes') + '  ·  ' + row.share.toFixed(1) + '%', 1136, y, 'bold 21px Arial', '#ffffff', 270);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#404967';
    ctx.fillRect(64, y + 11, 1072, 7);
    ctx.fillStyle = '#c497ff';
    ctx.fillRect(64, y + 11, 1072 * row.share / 100, 7);
  });
  const link = node('a');
  link.href = canvas.toDataURL('image/png');
  link.download = 'F7R-Driver-of-the-Day.png';
  link.click();
};

async function start() {
  const response = await fetch('./config.json', {cache:'no-store'});
  if (!response.ok) throw Error('Race Control configuration could not load.');
  const config = await response.json();
  client = window.supabase.createClient(config.supabase_url, config.supabase_publishable_key, {auth:window.F7RAuth.options()});
  const {data} = await client.auth.getUser();
  user = data.user?.is_anonymous ? null : data.user;
  if (user) {
    const admin = await client.from('flag_admins').select('user_id').eq('user_id', user.id).maybeSingle();
    $('create').hidden = !admin.data;
  }
  await refresh(new URLSearchParams(location.search).get('poll'));
  setInterval(tick, 1000);
  setInterval(() => refresh().catch(() => status('Could not refresh race polls. Retrying shortly.')), 12000);
}

start().catch(error => status(error.message));
