import { CIRCUITS } from './circuits.js';
const $ = id => document.getElementById(id);
let client, verified = false, checkGeneration = 0;
const message = value => { $('message').textContent = value || ''; };
function closeDesk() {
  checkGeneration++;
  verified = false;
  $('console').hidden = true;
  $('login-card').hidden = false;
}
$('login-form').onsubmit = async event => {
  event.preventDefault();
  if (!client) return;
  $('sign-in').disabled = true;
  try {
    const {data,error} = await client.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});
    if (error) throw error;
    $('password').value = '';
    const access = await client.from('flag_admins').select('user_id').eq('user_id',data.user.id).maybeSingle();
    if (access.error || !access.data) {
      await client.auth.signOut({scope:'local'});
      throw Error('Approved race admin access required.');
    }
    checkGeneration++;
    verified = true;
    $('login-card').hidden = true;
    $('console').hidden = false;
    message();
  } catch (error) { message(error.message); }
  finally { $('sign-in').disabled = false; }
};
$('sign-out').onclick = async () => {
  closeDesk();
  const {error} = await client.auth.signOut({scope:'local'});
  if (error) message(error.message);
};
async function start() {
  try {
    const response = await fetch('./config.json', {cache:'no-store'});
    if (!response.ok) throw Error('Race Control configuration is unavailable.');
    const config = await response.json();
    client = window.supabase.createClient(config.supabase_url, config.supabase_publishable_key, {
      auth:{persistSession:false,autoRefreshToken:true,detectSessionInUrl:false}
    });
    client.auth.onAuthStateChange(event => { if (event === 'SIGNED_OUT') closeDesk(); });
    $('sign-in').disabled = false;
  } catch (error) { message(error.message); }
}
start();

const attendanceBrandLogos = new Map([['bmw', 'bmw'], ['porsche', 'porsche'], ['mercedes', 'mercedes']]);
let attendanceDraft;
let emojiDraft;
let activeRoster;
let discordBusy = false;
let attendanceChannels = [];

function channelSearchText(value) {
  const smallCaps = 'ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘꞯʀꜱᴛᴜᴠᴡʏᴢ';
  const plain = 'abcdefghijklmnopqrstuvwyz';
  return value.normalize('NFKC').toLowerCase().replace(/[ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘꞯʀꜱᴛᴜᴠᴡʏᴢ]/g, letter => plain[smallCaps.indexOf(letter)]);
}
function filterAttendanceChannels() {
  const search = channelSearchText($('attendance-channel-search').value.trim());
  const matches = attendanceChannels.filter(channel => channelSearchText(channel.name).includes(search));
  setChoices('attendance-channel', matches.map(channel => ({id:channel.id,name:'#' + channel.name})),
    matches.length ? 'Choose a channel' : attendanceChannels.length ? 'No matching channels' : 'Load Discord channels first');
  $('attendance-channel-count').textContent = attendanceChannels.length
    ? matches.length + ' of ' + attendanceChannels.length + ' channels'
    : 'No channels loaded.';
}
$('attendance-channel-search').oninput = filterAttendanceChannels;
async function requestDiscordAttendance(action, details) {
  const {imageFile, ...fields} = details;
  if (action === 'post' && imageFile) {
    fields.artworkFile = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({type:imageFile.type, data:String(reader.result).split(',')[1]});
      reader.onerror = () => reject(Error('Could not read the race image.'));
      reader.readAsDataURL(imageFile);
    });
    fields.artwork = '';
  }
  const { data, error } = await client.functions.invoke('f7r-discord-attendance', {
    body: { action, ...fields }
  });
  if (error) {
    const body = await error.context?.json?.().catch(() => null);
    throw Error(body?.error || 'Discord attendance service is unavailable.');
  }
  return data;
}
async function discordAction(action, details = {}) {
  if (!verified || discordBusy) return;
  discordBusy = true;
  const status = $('discord-status');
  const generation = checkGeneration;
  if (action !== 'roster' || !activeRoster) status.textContent = 'Contacting Discord attendance service…';
  try {
    const data = await requestDiscordAttendance(action, details);
    if (generation !== checkGeneration) return;
    if (action === 'options') {
      attendanceChannels = [...data.channels].sort((a,b) => a.name.localeCompare(b.name));
      filterAttendanceChannels();
      $('attendance-form').oninput();
      status.textContent = 'Discord channels loaded.';
    } else if (action === 'preview' || action === 'emoji_setup') {
      const isPreview = action === 'preview';
      if (isPreview && attendanceDraft !== details) return;
      if ($('attendance-game').value !== details.game) return;
      emojiDraft = details;
      $('attendance-send').hidden = !isPreview;
      $('attendance-queue-add').hidden = !isPreview;
      $('attendance-emoji-save').disabled = !data.emojiAvailable;
      $('attendance-eligibility').textContent = isPreview ? (data.openEntry ? 'Open entry. Drivers choose a car in Discord. No roles required.' : 'Full-time seats require ' + data.fullTimeRole + ' and a team role.') : 'Saved defaults for ' + details.game;
      if (!isPreview) $('attendance-summary').textContent = '';
      const artworkPreview = $('attendance-artwork-preview');
      artworkPreview.hidden = !isPreview || !details.artwork && !details.imageFile;
      artworkPreview.textContent = artworkPreview.hidden ? '' : 'Race artwork: ' + (details.imageFile?.name || details.artwork);
      const teams = $('attendance-teams');
      teams.replaceChildren();
      for (const team of data.teams) {
        const item = document.createElement('li');
        const brandLogo = team.logo || attendanceBrandLogos.get(team.name.toLowerCase());
        if (brandLogo) {
          const logo = document.createElement('img');
          logo.src = 'assets/teams/' + brandLogo + '.png';
          logo.width = logo.height = 26;
          logo.alt = '';
          item.append(logo);
        }
        item.append(' ' + team.name + (isPreview && !data.openEntry ? (team.ids.length ? ' · Role matched' : ' · Role missing') : ''));
        const picker = document.createElement('select');
        picker.setAttribute('aria-label', 'Discord emoji for ' + team.name);
        picker.add(new Option('No Discord emoji', ''));
        for (const emoji of data.emojis) picker.add(new Option(':' + emoji.name + ':', emoji.id));
        const key = 'f7r-attendance-emoji:' + details.game + ':' + team.name;
        let saved = null;
        try { saved = localStorage.getItem(key); } catch {}
        const normalizeEmoji = name => name.toLowerCase().replace(/[^a-z0-9]/g, '');
        const aliases = [normalizeEmoji(team.manufacturer || team.name.replace(/^(Hypercar|LMGT3) · /, '')), normalizeEmoji(team.logo || team.name)];
        const suggested = data.emojis.filter(emoji => aliases.includes(normalizeEmoji(emoji.name)));
        const configured = Object.hasOwn(data.savedEmojis, team.name) ? data.savedEmojis[team.name] : saved;
        const selected = configured === null && suggested.length === 1 ? suggested[0].id : configured;
        if (data.emojis.some(emoji => emoji.id === selected)) picker.value = selected;
        const icon = document.createElement('img');
        icon.alt = '';
        icon.width = icon.height = 24;
        function updateEmoji() {
          const emoji = data.emojis.find(emoji => emoji.id === picker.value);
          icon.hidden = !emoji;
          if (emoji) {
            icon.src = 'https://cdn.discordapp.com/emojis/' + emoji.id + (emoji.animated ? '.gif' : '.png');
            details.emojiIds[team.name] = emoji.id;
          } else {
            details.emojiIds[team.name] = '';
          }
        }
        picker.onchange = () => {
          updateEmoji();
          try { localStorage.setItem(key, picker.value); } catch {}
        };
        picker.disabled = !data.emojis.length;
        updateEmoji();
        item.append(' ', picker, icon);
        teams.append(item);
      }
      $('attendance-emoji-help').textContent = data.emojiAvailable ? 'Choose a server emoji for each team. Choices are remembered in this browser.' : 'Discord emoji could not be loaded. You can still post the check-in.';
      $('attendance-emoji-help').textContent = data.emojiAvailable ? 'Save team emojis to reuse them across browsers.' : 'Discord emoji could not be loaded.';
      $('attendance-preview').hidden = false;
      status.textContent = isPreview ? 'Preview ready. Nothing has been posted.' : 'Choose emojis, then save your mappings.';
    } else if (action === 'emoji_save') {
      status.textContent = 'Team emojis saved for all Race Control admins.';
    } else if (action === 'confirm_reserve') {
      status.textContent = data.refreshed ? 'Reserve confirmed and Discord lineup updated.' : 'Reserve confirmed. Discord could not refresh the message.';
      document.activeElement?.blur();
    } else if (action === 'post') {
      $('attendance-link').href = data.url;
      $('attendance-link').hidden = false;
      $('attendance-message').value = data.url;
      const [, channelId, messageId] = new URL(data.url).pathname.split('/').slice(2);
      activeRoster = {channelId, messageId};
      $('attendance-drivers').textContent = '';
      $('attendance-preview').hidden = true;
      attendanceDraft = null;
      status.textContent = 'Check-in posted.';
    } else {
      const roster = $('attendance-drivers');
      roster.replaceChildren();
      activeRoster = details;
      const groups = [...data.teams, {name: 'Reserves'}, {name: 'Confirmed reserves'}, {name: 'Checked out'}];
      for (const group of groups) {
        const drivers = data.drivers.filter(row => {
          if (group.name === 'Checked out') return Boolean(row.checked_out_at);
          if (row.checked_out_at) return false;
          if (group.name === 'Reserves') return row.placement === 'Reserve' && !row.confirmed_at;
          if (group.name === 'Confirmed reserves') return Boolean(row.confirmed_at);
          return (row.placement === 'Full-time' || row.confirmed_at) && row.team === group.name;
        });
        const heading = document.createElement('h4');
        const brandLogo = group.logo || attendanceBrandLogos.get(group.name.toLowerCase());
        if (brandLogo) {
          const logo = document.createElement('img');
          logo.src = 'assets/teams/' + brandLogo + '.png';
          logo.width = logo.height = 26;
          logo.alt = '';
          heading.append(logo);
        }
        heading.append(' ' + group.name + ' · ' + drivers.length);
        const list = document.createElement('ul');
        const f1Team = data.f1 && !['Reserves','Confirmed reserves','Checked out'].includes(group.name);
        const total = f1Team ? Math.max(2, drivers.length) : drivers.length;
        for (let index = 0; index < total; index++) {
          const item = document.createElement('li');
          const label = f1Team ? (index < 2 ? 'Seat ' + (index + 1) + ' · ' : 'Additional check-in · ') : '';
          const driver = f1Team ? drivers.find(row => row.seat === index + 1) ?? drivers.filter(row => row.seat == null)[index] : drivers[index];
          item.textContent = label + (driver?.driver_name || 'Awaiting check-in');
          for (const [caption, value] of [['In', driver?.checked_in_at], ['Out', driver?.checked_out_at]]) {
            if (!value) continue;
            const stamp = document.createElement('time');
            stamp.dateTime = value;
            stamp.className = 'secondary';
            stamp.textContent = caption + ' ' + new Intl.DateTimeFormat('en-GB', {
              timeZone:'Europe/London', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23'
            }).format(new Date(value)).replace(',', '');
            item.append(' ', stamp);
          }
          if (driver?.confirmed_at && group.name === 'Confirmed reserves') item.append(' → ' + driver.team);
          if (driver && group.name === 'Reserves' && details.channelId && data.teams.length) {
            const teamPicker = document.createElement('select');
            teamPicker.setAttribute('aria-label', 'Team for ' + driver.driver_name);
            teamPicker.add(new Option('Choose team', ''));
            for (const team of data.teams) teamPicker.add(new Option(team.name, team.name));
            const confirm = document.createElement('button');
            confirm.type = 'button';
            confirm.className = 'secondary';
            confirm.textContent = 'Confirm seat';
            confirm.disabled = true;
            teamPicker.onchange = () => { confirm.disabled = !teamPicker.value; };
            confirm.onclick = () => discordAction('confirm_reserve', {...details, driverId:driver.driver_id, team:teamPicker.value});
            item.append(teamPicker, confirm);
          }
          list.append(item);
        }
        roster.append(heading, list);
      }
      status.textContent = 'Roster loaded.';
    }
  } catch (error) {
    if (generation === checkGeneration) status.textContent = error.message;
  } finally {
    discordBusy = false;
  }
}
$('discord-check').onclick = () => discordAction('options');
$('attendance-form').oninput = () => {
  const game = $('attendance-game').value;
  const canOpen = game === 'Le Mans Ultimate' || game === 'Assetto Corsa Competizione';
  $('attendance-open-field').hidden = !canOpen;
  $('attendance-open-entry').disabled = !canOpen;
  if (!canOpen) $('attendance-open-entry').checked = false;
  const openEntry = $('attendance-open-entry').checked;
  $('attendance-lineup').disabled = openEntry;
  const useDefault = !openEntry && !$('attendance-lineup').value;
  const f1 = useDefault && $('attendance-game').value === 'F1';
  $('attendance-tier-field').hidden = !f1;
  $('attendance-tier').required = f1;
  const lmu = useDefault && $('attendance-game').value === 'Le Mans Ultimate';
  $('attendance-series-field').hidden = !lmu;
  $('attendance-series').required = lmu;
  attendanceDraft = null;
  emojiDraft = null;
  $('attendance-preview').hidden = true;
};
$('attendance-form').onsubmit = event => {
  event.preventDefault();
  if (!verified || discordBusy) return;
  const startsAt = new Date($('attendance-time').value).getTime();
  const track = $('attendance-track').value.trim();
  if (!track || !Number.isFinite(startsAt) || startsAt <= Date.now()) {
    $('discord-status').textContent = 'Enter a track and a race time in the future.';
    return;
  }
  const channel = $('attendance-channel');
  const openEntry = $('attendance-open-entry').checked;
  const lineupRoleId = openEntry ? '' : $('attendance-lineup').value;
  const tier = $('attendance-tier').value;
  const series = $('attendance-series').value;
  const game = $('attendance-game').value;
  const notes = $('attendance-notes').value.trim();
  const imageFile = $('attendance-artwork-file').files?.[0];
  if (imageFile && (imageFile.size > 2 * 1024 * 1024 || !['image/png','image/jpeg','image/webp','image/gif'].includes(imageFile.type))) {
    $('discord-status').textContent = 'Choose a PNG, JPG, WebP or GIF up to 2 MB.';
    return;
  }
  const artwork = imageFile ? '' : $('attendance-artwork').value.trim();
  const round = $('attendance-round').value.trim();
  attendanceDraft ??= {
    game, track, startsAt, notes, artwork, imageFile, round, channelId: channel.value, tier, series, lineupRoleId, openEntry,
    nonce: crypto.randomUUID().replaceAll('-', '').slice(0, 24)
  };
  $('attendance-summary').textContent = [
    game, track, round, new Date(startsAt).toLocaleString(), channel.selectedOptions[0].text,
    openEntry ? 'Open entry' : lineupRoleId ? $('attendance-lineup').selectedOptions[0].text : game === 'F1' ? tier : game === 'Le Mans Ultimate' ? series : '', notes
  ].filter(Boolean).join(' · ');
  attendanceDraft.emojiIds = Object.create(null);
  discordAction('preview', attendanceDraft);
};
$('attendance-send').onclick = () => {
  if (verified && attendanceDraft && !discordBusy && window.confirm('Post this check-in to the Discord channel shown in the preview?')) {
    discordAction('post', attendanceDraft);
  }
};
$('attendance-emoji-setup').onclick = () => {
  const game = $('attendance-game').value;
  if (!game) {
    $('discord-status').textContent = 'Choose a game before setting up team emojis.';
    return;
  }
  discordAction('emoji_setup', {game, emojiIds:Object.create(null)});
};
$('attendance-emoji-save').onclick = () => {
  if (emojiDraft) discordAction('emoji_save', {game:emojiDraft.game, emojiIds:emojiDraft.emojiIds});
};
$('attendance-roster').onclick = () => {
  const value = $('attendance-message').value.trim();
  const channelId = value.match(/^https:\/\/discord\.com\/channels\/\d+\/(\d{17,20})\//)?.[1];
  const messageId = /^(?:https:\/\/discord\.com\/channels\/\d+\/\d+\/)?(\d{17,20})\/?$/.exec(value)?.[1];
  if (!messageId) {
    $('discord-status').textContent = 'Enter the Discord message link or ID.';
    return;
  }
  discordAction('roster', {messageId, channelId});
};

$('attendance-message').oninput = () => { activeRoster = null; };
setInterval(() => { if (activeRoster && verified && !$('attendance-drivers').contains(document.activeElement)) discordAction('roster', activeRoster); }, 5000);

const attendanceBatch = [];
let postingBatch = false;

function renderAttendanceBatch() {
  $('attendance-batch').hidden = attendanceBatch.length === 0;
  $('attendance-batch-send').disabled = postingBatch || attendanceBatch.every(entry => entry.url);
  const list = $('attendance-batch-list');
  list.replaceChildren();
  for (const entry of attendanceBatch) {
    const item = document.createElement('li');
    item.textContent = entry.label + ' · ' + (entry.url ? 'Posted' : entry.error || 'Queued');
    if (entry.url) {
      const link = document.createElement('a');
      link.href = entry.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Open in Discord ↗';
      item.append(' ', link);
    } else {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'secondary';
      remove.textContent = 'Remove';
      remove.disabled = postingBatch;
      remove.onclick = () => {
        attendanceBatch.splice(attendanceBatch.indexOf(entry), 1);
        renderAttendanceBatch();
      };
      item.append(' ', remove);
    }
    list.append(item);
  }
}

$('attendance-queue-add').onclick = () => {
  if (!verified || !attendanceDraft || discordBusy || $('attendance-preview').hidden) return;
  attendanceBatch.push({
    draft: {...attendanceDraft, emojiIds: {...attendanceDraft.emojiIds}},
    label: $('attendance-summary').textContent
  });
  attendanceDraft = null;
  emojiDraft = null;
  $('attendance-preview').hidden = true;
  $('discord-status').textContent = 'Added to the queue. Set up and preview the next race.';
  renderAttendanceBatch();
};

$('attendance-batch-send').onclick = async () => {
  if (!verified || discordBusy || postingBatch) return;
  const pending = attendanceBatch.filter(entry => !entry.url);
  if (!pending.length || !window.confirm('Post ' + pending.length + ' check-in(s) to the Discord channels shown in the queue?')) return;
  postingBatch = discordBusy = true;
  const generation = checkGeneration;
  const status = $('attendance-batch-status');
  let posted = 0;
  renderAttendanceBatch();
  try {
    for (const entry of pending) {
      if (generation !== checkGeneration || !verified) break;
      status.textContent = 'Posting check-in ' + (posted + 1) + ' of ' + pending.length + '…';
      try {
        const data = await requestDiscordAttendance('post', entry.draft);
        entry.url = data.url;
        entry.error = '';
        posted++;
      } catch (error) {
        entry.error = error.message;
        break;
      }
      renderAttendanceBatch();
    }
    status.textContent = posted + ' of ' + pending.length + ' posted.' +
      (posted === pending.length ? '' : ' The remaining check-ins are still queued.');
  } finally {
    postingBatch = discordBusy = false;
    renderAttendanceBatch();
  }
};

const defaultF1Circuits = [...new Set([...CIRCUITS.map(circuit => circuit.name), 'Madrid'])];
let settingsGame = '';
let settingsDraft;
let settingsOptions;

function setChoices(id, rows, placeholder) {
  const select = $(id);
  const previous = select.value;
  select.replaceChildren(new Option(placeholder, ''));
  for (const row of rows) select.add(new Option(row.name, row.id));
  if (rows.some(row => row.id === previous)) select.value = previous;
}

function renderSettingsLists() {
  for (const [key,id] of [['lineups','settings-lineups'],['cars','settings-cars']]) {
    const list = $(id);
    list.replaceChildren();
    for (const row of settingsDraft[key]) {
      const item = document.createElement('li');
      const role = settingsOptions.roles.find(role => role.id === row.roleId);
      const emoji = settingsOptions.emojis.find(emoji => emoji.id === row.emojiId);
      const scope = settingsOptions.roles.find(role => role.id === row.lineupRoleId);
      item.textContent = row.name + ' · ' + (role?.name || 'Role unavailable') +
        (key === 'cars' ? ' · ' + (scope?.name || (row.lineupRoleId ? 'Lineup unavailable' : 'Game-wide')) : '') +
        (emoji ? ' · :' + emoji.name + ':' : '');
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'secondary';
      edit.textContent = 'Edit';
      edit.onclick = () => {
        const type = key === 'cars' ? 'car' : 'lineup';
        $('settings-' + type + '-name').value = row.name;
        $('settings-' + type + '-role').value = row.roleId;
        if (type === 'car') {
          $('settings-car-emoji').value = row.emojiId;
          $('settings-car-lineup').value = row.lineupRoleId || '';
        }
      };
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'secondary';
      remove.textContent = 'Remove';
      remove.onclick = () => {
        settingsDraft[key] = settingsDraft[key].filter(entry => entry !== row);
        renderSettingsLists();
      };
      item.append(' ', edit, ' ', remove);
      list.append(item);
    }
  }
}

async function loadGameSettings() {
  const game = $('attendance-game').value;
  if (!verified || !game) {
    $('settings-status').textContent = 'Choose a game in the check-in form.';
    return;
  }
  const generation = checkGeneration;
  try {
    const data = await requestDiscordAttendance('game_settings', {game});
    if (generation !== checkGeneration || $('attendance-game').value !== game) return;
    settingsGame = game;
    settingsOptions = data;
    $('settings-car-models').replaceChildren(...(data.models ?? []).map(model=>new Option(model)));
    settingsDraft = data.config;
    const circuits = settingsDraft.circuits.length ? settingsDraft.circuits : ['F1','F2'].includes(game) ? defaultF1Circuits : [];
    $('settings-circuits').value = circuits.join('\n');
    setChoices('attendance-track', circuits.map(name => ({id:name,name})), circuits.length ? 'Choose a circuit' : 'Add a circuit in League setup');
    setChoices('attendance-lineup', settingsDraft.lineups.map(row => ({id:row.roleId,name:row.name})), 'Use the standard tier or series role');
    const roles = [...data.roles].sort((a,b) => a.name.localeCompare(b.name));
    setChoices('settings-lineup-role', roles, 'Choose a full-time role');
    setChoices('settings-car-role', roles, 'Choose a car role');
    setChoices('settings-car-lineup', roles, 'Game-wide default');
    setChoices('settings-car-emoji', data.emojis.map(emoji => ({id:emoji.id,name:':' + emoji.name + ':'})), 'No emoji override');
    for (const id of ['settings-lineup-name','settings-car-name']) $(id).value = '';
    renderSettingsLists();
    $('attendance-form').oninput();
    $('settings-editor').hidden = false;
    $('settings-status').textContent = game + ' settings loaded.';
    if (!circuits.length) {
      $('discord-settings').open = true;
      $('settings-status').textContent = 'Add your first circuit and save the game settings.';
    }
  } catch (error) { $('settings-status').textContent = error.message; }
}

$('attendance-game').onchange = () => {
  settingsGame = '';
  $('settings-editor').hidden = true;
  setChoices('attendance-track', [], 'Loading circuits…');
  setChoices('attendance-lineup', [], 'Use the standard tier or series role');
  loadGameSettings();
};
$('settings-load').onclick = loadGameSettings;
for (const [type,key] of [['lineup','lineups'],['car','cars']]) {
  $('settings-' + type + '-add').onclick = () => {
    if (!settingsDraft || settingsGame !== $('attendance-game').value) return;
    const name = $('settings-' + type + '-name').value.trim();
    const roleId = $('settings-' + type + '-role').value;
    if (!name || !roleId) {
      $('settings-status').textContent = 'Enter a name and select a Discord role.';
      return;
    }
    const row = type === 'car' ? {name,roleId,emojiId:$('settings-car-emoji').value,lineupRoleId:$('settings-car-lineup').value} : {name,roleId};
    const index = settingsDraft[key].findIndex(entry => entry.roleId === roleId && (key !== "cars" || (entry.lineupRoleId || "") === row.lineupRoleId));
    if (index === -1) settingsDraft[key].push(row);
    else settingsDraft[key][index] = row;
    renderSettingsLists();
    $('settings-status').textContent = 'Click Save game settings to apply these changes.';
  };
}
$('settings-save').onclick = async () => {
  if (!verified || !settingsDraft || settingsGame !== $('attendance-game').value) return;
  const game = settingsGame;
  const button = $('settings-save');
  button.disabled = true;
  try {
    settingsDraft.circuits = [...new Set($('settings-circuits').value.split(/\r?\n/).map(name=>name.trim()).filter(Boolean))];
    await requestDiscordAttendance('save_game_settings', {game,settings:settingsDraft});
    if (game === $('attendance-game').value) await loadGameSettings();
    $('settings-status').textContent = game + ' settings saved.';
  } catch (error) { $('settings-status').textContent = error.message; }
  finally { button.disabled = false; }
};
