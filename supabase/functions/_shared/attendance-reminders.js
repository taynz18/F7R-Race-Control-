export function reminderSettings(value, startsAt, roleId, now = Date.now()) {
  if (!value || value.count === 0) return null;
  const {intervalHours, count} = value;
  if (!Number.isInteger(intervalHours) || intervalHours < 1 || intervalHours > 720 ||
      !Number.isInteger(count) || count < 1 || count > 20) throw new Error('Choose 1–720 hours between reminders and 1–20 pings.');
  if (!/^\d{17,20}$/.test(roleId || '')) throw new Error('Reminders need a full-time driver role; open entry cannot use role reminders.');
  if (now + intervalHours * 3600000 >= startsAt) throw new Error('The first reminder must be before the race starts.');
  return {intervalHours, count};
}

export function reminderPayload(row) {
  return {
    content: `<@&${row.role_id}>\n**Attendance reminder**\nPlease vote on attendance: check in or choose Not participating.\nhttps://discord.com/channels/${row.guild_id}/${row.channel_id}/${row.message_id}\nReminder ${row.sent_count + 1} of ${row.total_count}`,
    allowed_mentions: {parse: [], roles: [row.role_id]},
    nonce: `${BigInt(row.message_id).toString(36)}r${row.sent_count + 1}`, enforce_nonce: true
  };
}

// A failed/ambiguous delivery is paused, rather than risking a second role ping.
export async function deliverReminder(row, {fetch: send = fetch, token, now = Date.now()}) {
  if (Date.parse(row.starts_at) <= now) return {status: 'completed'};
  const endpoint = `https://discord.com/api/v10/channels/${row.channel_id}/messages`;
  const headers = {Authorization: 'Bot ' + token, 'Content-Type': 'application/json'};
  let original;
  try { original = await send(endpoint + '/' + row.message_id, {headers}); }
  catch { return {status: 'active', error: 'Could not check attendance message.', retrySeconds: 300}; }
  if (original.status === 404) return {status: 'cancelled', error: 'Attendance message was deleted.'};
  if (!original.ok) return {status: 'active', error: 'Could not check attendance message.', retrySeconds: 300};
  const post = await original.json();
  if (post.author?.id !== '1004676760815796334') return {status: 'cancelled', error: 'Not an F7R attendance message.'};
  if (Date.parse(row.starts_at) <= Date.now()) return {status: 'completed'};
  let result;
  try { result = await send(endpoint, {method: 'POST', headers, body: JSON.stringify(reminderPayload(row))}); }
  catch { return {status: 'paused', error: 'Delivery uncertain. Check Discord before starting another schedule.'}; }
  if (result.ok) return {status: 'sent'};
  if (result.status === 429) {
    const data = await result.json().catch(() => ({}));
    return {status: 'active', error: 'Discord rate limit; retrying later.', retrySeconds: Math.max(60, Math.min(3600, Number(data.retry_after) || 60))};
  }
  return {status: 'paused', error: 'Discord could not accept the reminder. Check bot permissions before restarting.'};
}
