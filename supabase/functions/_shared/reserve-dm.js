export async function sendReserveConfirmation({token, driverId, team, guild, channelId, messageId, fetch: send = fetch}) {
  const headers = {Authorization:'Bot '+token, 'Content-Type':'application/json'};
  try {
    const channel = await send('https://discord.com/api/v10/users/@me/channels', {
      method:'POST',headers,body:JSON.stringify({recipient_id:driverId})
    });
    if (!channel.ok) return 'failed';
    const dm = await channel.json();
    if (!/^\d{17,20}$/.test(dm.id || '')) return 'failed';
    const result = await send('https://discord.com/api/v10/channels/'+dm.id+'/messages', {
      method:'POST',headers,body:JSON.stringify({
        content:`**F7R reserve seat confirmed**\nYou have been confirmed as a reserve for **${team.replace(/[\\*_~`|]/g,'')}**.\nView the race details and attendance here:\nhttps://discord.com/channels/${guild}/${channelId}/${messageId}`,
        allowed_mentions:{parse:[]}
      })
    });
    return result.ok ? 'sent' : 'failed';
  } catch { return 'uncertain'; }
}
