const f1Teams = [
  ["Mercedes","mercedes"], ["Ferrari","ferrari"], ["Red Bull Racing","red-bull"],
  ["McLaren","mclaren"], ["Alpine","alpine"], ["Aston Martin","aston-martin"],
  ["Racing Bulls","racing-bulls"], ["Cadillac","cadillac"], ["Haas","haas"],
  ["Williams","williams"], ["Audi","audi"]
];
const normalize = value => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function teamRoles(roles, game, tier) {
  if (game === "F1") {
    const prefix = tier.toLowerCase() + " full time ";
    return f1Teams.map(([name, logo]) => ({
      name, logo, ids: roles.filter(role => {
        const label = normalize(role.name);
        const suffix = label.startsWith(prefix) ? label.slice(prefix.length) : label;
        return suffix === normalize(name) ||
          (logo === "red-bull" && suffix === "redbull") || (logo === "red-bull" && suffix === "red bull");
      }).map(role => role.id)
    }));
  }
  const suffix = game === "Le Mans Ultimate" ? "lmu" : "acc";
  const teams = new Map();
  for (const role of roles) {
    const label = normalize(role.name);
    if (!label.endsWith(" " + suffix)) continue;
    const brand = role.name.trim().replace(new RegExp("[\\s_-]+" + suffix + "$", "i"), "").trim();
    if (!brand || brand === role.name.trim()) continue;
    const key = normalize(brand);
    if (!teams.has(key)) teams.set(key, {
      name: brand, logo: f1Teams.find(([name]) => normalize(name) === key)?.[1], ids: []
    });
    teams.get(key).ids.push(role.id);
  }
  return [...teams.values()].sort((a,b)=>a.name.localeCompare(b.name));
}
const origins = new Set(["https://racecontrol.f7r.co.uk", "https://taynz18.github.io"]);
const snowflake = (value) => typeof value === "string" && /^\d{17,20}$/.test(value);

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  const headers = {
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store"
  };
  if (origins.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  const reply = (body, status = 200) => Response.json(body, { status, headers });
  if (origin && !origins.has(origin)) return reply({error: "Origin not allowed."}, 403);
  if (request.method === "OPTIONS") return new Response(null, {status: 204, headers});
  if (request.method !== "POST") return reply({error: "Use POST."}, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return reply({error: "Sign in first."}, 401);
    const authHeaders = {authorization, apikey: Deno.env.get("SUPABASE_ANON_KEY")};
    const userResponse = await fetch(url + "/auth/v1/user", {headers: authHeaders});
    if (!userResponse.ok) return reply({error: "Sign in again to continue."}, 401);
    const user = await userResponse.json();
    const adminQuery = new URLSearchParams({select: "user_id", user_id: "eq." + user.id});
    const admins = await fetch(url + "/rest/v1/flag_admins?" + adminQuery, {headers: authHeaders});
    if (!admins.ok || !(await admins.json()).some((row) => row.user_id === user.id)) {
      return reply({error: "Approved race admin access required."}, 403);
    }
    const input = await request.json().catch(() => null);
    if (!["options", "preview", "post", "roster", "emoji_setup", "emoji_save"].includes(input?.action)) return reply({error: "Invalid action."}, 400);
    const token = Deno.env.get("F7R_DISCORD_BOT_TOKEN");
    const guild = Deno.env.get("F7R_DISCORD_SERVER_ID");
    if (!token || !snowflake(guild)) return reply({error: "Set the bot token and F7R server ID in Supabase."}, 503);
    const discordHeaders = {Authorization: "Bot " + token, "Content-Type": "application/json"};
    const api = "https://discord.com/api/v10";
    if (input.action === "roster") {
      if (!snowflake(input.messageId)) return reply({error: "Enter a valid Discord message ID."}, 400);
      const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      const query = new URLSearchParams({select:"driver_name,placement,team,seat,checked_in_at,checked_out_at",guild_id:"eq."+guild,message_id:"eq."+input.messageId,order:"driver_name"});
      const result = await fetch(url + "/rest/v1/f7r_discord_check_ins?" + query, {headers:{apikey:service,Authorization:"Bearer "+service}});
      if (!result.ok) return reply({error:"Could not load the check-in roster."},502);
      const drivers = await result.json();
      let teams = [...new Set(drivers.map(row=>row.team).filter(Boolean))].map(name=>({name}));
      let f1 = false;
      if (snowflake(input.channelId)) {
        const message = await fetch(api + "/channels/" + input.channelId + "/messages/" + input.messageId, {headers:discordHeaders});
        if (!message.ok) return reply({error:"Could not open that check-in message. Check its link and the bot's Read Message History permission."},502);
        const post = await message.json();
        const embed = post.embeds?.find(item=>item.title==="Team roles");
        if (post.author?.id !== "1004676760815796334" || !embed) return reply({error:"This link is not an F7R team check-in."},400);
        f1 = embed.footer?.text === "F1";
        teams = f1 ? f1Teams.map(([name,logo])=>({name,logo})) : embed.fields.map(({name})=>({name}));
      }
      return reply({drivers,teams,f1});
    }
    const guildPath = api + "/guilds/" + guild;
    const [channelResponse, roleResponse] = await Promise.all([
      fetch(guildPath + "/channels", {headers:discordHeaders}),
      fetch(guildPath + "/roles", {headers:discordHeaders})
    ]);
    if (!channelResponse.ok || !roleResponse.ok) return reply({error:"Could not load the server. Check that the F7R bot is installed."},502);
    const channels = (await channelResponse.json()).filter(c=>c.type===0 || c.type===5).map(({id,name})=>({id,name}));
    const roles = (await roleResponse.json()).filter(r=>r.id!==guild && !r.managed).map(({id,name})=>({id,name}));
    if (input.action === "options") return reply({channels});
    const {channelId, tier, series, game, track, startsAt, notes, nonce} = input;
    if (!["F1","Le Mans Ultimate","Assetto Corsa","Assetto Corsa Competizione"].includes(game)) return reply({error:"Choose a game first."},400);
    const emojiResponse = await fetch(guildPath + "/emojis", {headers:discordHeaders});
    const emojis = emojiResponse.ok
      ? (await emojiResponse.json()).filter(emoji=>emoji.available!==false && !emoji.roles?.length && snowflake(emoji.id) && /^[a-zA-Z0-9_]+$/.test(emoji.name))
        .map(({id,name,animated})=>({id,name,animated}))
      : [];
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const settingsUrl = url + "/rest/v1/f7r_discord_team_emojis";
    const settingsHeaders = {apikey:service,Authorization:"Bearer "+service,"Content-Type":"application/json"};
    const query = new URLSearchParams({select:"team,emoji_id",guild_id:"eq."+guild,game:"eq."+game});
    const saved = await fetch(settingsUrl+"?"+query,{headers:settingsHeaders});
    if (!saved.ok) return reply({error:"Could not load saved team emojis."},502);
    const savedEmojis = Object.fromEntries((await saved.json()).map(row=>[row.team,row.emoji_id]));
    const validEmojiIds = values => values && typeof values==="object" && !Array.isArray(values) &&
      Object.values(values).every(id=>id==="" || emojis.some(emoji=>emoji.id===id));
    if (input.action === "emoji_setup" || input.action === "emoji_save") {
      const teams = teamRoles(roles,game,"");
      if (input.action === "emoji_setup") return reply({teams,emojis,emojiAvailable:emojiResponse.ok,savedEmojis});
      if (!emojiResponse.ok || !validEmojiIds(input.emojiIds) ||
          Object.keys(input.emojiIds).some(name=>!teams.some(team=>team.name===name))) return reply({error:"Invalid team emoji selection."},400);
      const rows = Object.entries(input.emojiIds).map(([team,emoji_id])=>({guild_id:guild,game,team,emoji_id}));
      if (rows.length) {
        const result = await fetch(settingsUrl,{method:"POST",headers:{...settingsHeaders,Prefer:"resolution=merge-duplicates"},body:JSON.stringify(rows)});
        if (!result.ok) return reply({error:"Could not save team emojis."},502);
      }
      return reply({saved:true});
    }
    const channel = channels.find(c=>c.id===channelId);
    if (!channel || (game === "Le Mans Ultimate" && !["WEC","ELMS"].includes(series)) || (game === "F1" && !["T1","T2","T3","T4"].includes(tier)) || !["F1","Le Mans Ultimate","Assetto Corsa","Assetto Corsa Competizione"].includes(game) ||
        typeof track!=="string" || !track.trim() || track.length>100 || typeof notes!=="string" || notes.length>500 ||
        !Number.isSafeInteger(startsAt) || startsAt<=Date.now() || startsAt>8640000000000000 ||
        typeof nonce!=="string" || !/^[a-f0-9]{24}$/.test(nonce)) return reply({error:"Choose a channel, game, track, future race time and an F1 tier where applicable."},400);
    const teams = teamRoles(roles, game, tier);
    const mapped = teams.filter(team=>team.ids.length);
    if (!mapped.length || mapped.length > 25 || mapped.some(team=>team.ids.join(",").length>1000)) {
      return reply({error:"No usable team role mappings. Check that your Discord role names follow the game and tier format."},400);
    }
    const fullTimeRole = game === "F1" ? tier + " Full Time" :
      game === "Le Mans Ultimate" ? series + " Full Time Driver" : "ACC Full Time Driver";
    const fullTimeRoles = roles.filter(role=>normalize(role.name)===normalize(fullTimeRole));
    if (fullTimeRoles.length !== 1) return reply({error:"Expected one Discord role named " + fullTimeRole + "."},400);
    if (input.action === "preview") return reply({teams,fullTimeRole,emojis,emojiAvailable:emojiResponse.ok,savedEmojis});
    const emojiIds = input.emojiIds ?? savedEmojis;
    if (!validEmojiIds(emojiIds)) return reply({error:"A selected emoji is no longer available. Preview the check-in again."},400);
    const teamField = (team) => {
      const emoji = emojis.find(emoji=>emoji.id===emojiIds[team.name]);
      const prefix = emoji ? "<"+(emoji.animated?"a":"")+":"+emoji.name+":"+emoji.id+"> " : "";
      return {name:team.name,value:prefix+team.ids.map(id=>"<@&"+id+">").join(" ")};
    };
    const time = Math.floor(startsAt/1000);
    const message = await fetch(api + "/channels/" + channel.id + "/messages", {
      method:"POST", headers:discordHeaders,
      body:JSON.stringify({
        content:"**F7R race check-in**\n" + game + " · " + track.trim() + "\nRace starts <t:" + time + ":F>" + (game === "F1" ? "\nTier: " + tier : "") + (game === "Le Mans Ultimate" ? "\nSeries: " + series : "") + "\nA matching team and full-time role are required for a seat. Other check-ins go to reserves." + (notes.trim()?"\n"+notes.trim():""),
        allowed_mentions:{parse:[]}, nonce, enforce_nonce:true,
        embeds:[{title:"Team roles",footer:{text:game},fields:mapped.map(teamField)},{title:"Full-time eligibility",description:"<@&"+fullTimeRoles[0].id+">"}],
        components:[{type:1,components:[{type:2,style:3,label:"Check in",custom_id:"f7r-team-rsvp:"+time},{type:2,style:2,label:"Check out",custom_id:"f7r-team-out:"+time}]}]
      })
    });
    if (!message.ok) return reply({error:message.status===429?"Discord is rate limiting requests. Try again shortly.":"Could not post. Check the bot's View Channel and Send Messages permissions."},502);
    const posted=await message.json();
    return reply({url:"https://discord.com/channels/"+guild+"/"+channel.id+"/"+posted.id, messageId:posted.id});
  } catch {
    return reply({error:"Discord attendance service is unavailable."},502);
  }
});
