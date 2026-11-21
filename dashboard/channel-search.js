export function channelSearchText(value) {
 const small='ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘꞯʀꜱᴛᴜᴠᴡʏᴢ',plain='abcdefghijklmnopqrstuvwyz';
 return String(value||'').normalize('NFKD').toLowerCase().replace(/[ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘꞯʀꜱᴛᴜᴠᴡʏᴢ]/g,c=>plain[small.indexOf(c)]).replace(/\p{M}/gu,'').replace(/[^a-z0-9]+/g,'');
}
export function filterChannels(channels,query,type) {
 const words=String(query||'').trim().split(/\s+/).map(channelSearchText).filter(Boolean);
 return channels.filter(c=>c.type===type&&words.every(word=>channelSearchText(c.name).includes(word)));
}
