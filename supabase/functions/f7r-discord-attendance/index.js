import { refreshDiscordRoster, rosterEmbed, readPostConfig, savePostConfig, classEmojiFor, classEmojiText } from "../_shared/discord-roster.js";
const accModels = [["Aston Martin V8 Vantage GT3","Aston Martin"],["Aston Martin V12 Vantage GT3","Aston Martin"],["Audi R8 LMS GT3","Audi"],["Audi R8 LMS GT3 Evo","Audi"],["Audi R8 LMS GT3 Evo II","Audi"],["Bentley Continental GT3 (2015)","Bentley"],["Bentley Continental GT3 (2018)","Bentley"],["BMW M4 GT3","BMW"],["BMW M6 GT3","BMW"],["Ferrari 296 GT3","Ferrari"],["Ferrari 488 GT3","Ferrari"],["Ferrari 488 GT3 Evo","Ferrari"],["Ford Mustang GT3","Ford"],["Honda NSX GT3","Honda"],["Honda NSX GT3 Evo","Honda"],["Jaguar Emil Frey G3","Jaguar"],["Lamborghini Huracán GT3","Lamborghini"],["Lamborghini Huracán GT3 Evo","Lamborghini"],["Lamborghini Huracán GT3 Evo2","Lamborghini"],["Lexus RC F GT3","Lexus"],["McLaren 650S GT3","McLaren"],["McLaren 720S GT3","McLaren"],["McLaren 720S GT3 Evo","McLaren"],["Mercedes-AMG GT3 (2015)","Mercedes"],["Mercedes-AMG GT3 Evo","Mercedes"],["Nissan GT-R Nismo GT3 (2015)","Nissan"],["Nissan GT-R Nismo GT3 (2018)","Nissan"],["Porsche 911 GT3 R (991)","Porsche"],["Porsche 911 GT3 R (991 II)","Porsche"],["Porsche 911 GT3 R (992)","Porsche"],["Reiter R-EX GT3","Reiter"]];
const accRoleAliases = [["Aston Martin Vantage (ACC)","Aston Martin Vantage GT3","Aston Martin"],["Audi R8 ACC","Audi R8 GT3","Audi"],["Mclaren 720s ACC","McLaren 720S GT3","McLaren"],["Ferari 296 ACC","Ferrari 296 GT3","Ferrari"],["Ferrari 296 ACC","Ferrari 296 GT3","Ferrari"],["Ferrari 488 ACC","Ferrari 488 GT3","Ferrari"],["Ford Mustang ACC","Ford Mustang GT3","Ford"],["Lamborghini Huracan","Lamborghini Huracán GT3","Lamborghini"],["Mclaren 720s EVO ACC","McLaren 720S GT3 Evo","McLaren"],["Lexus RC ACC","Lexus RC F GT3","Lexus"],["Porsche 911 ACC","Porsche 911 GT3 R","Porsche"],["Nissan GTR Nismo ACC","Nissan GT-R Nismo GT3","Nissan"],["BMW M4 ACC","BMW M4 GT3","BMW"],["Porsche 992 ACC","Porsche 911 GT3 R (992)","Porsche"],["Mercedes AMG ACC","Mercedes-AMG GT3","Mercedes"]];
const lmuClasses = {"Hypercar":["Alpine","Aston Martin","BMW","Cadillac","Ferrari","Genesis","Lamborghini","Peugeot","Porsche","Toyota"],"LMGT3":["Aston Martin","BMW","Chevrolet","Ferrari","Ford","Lamborghini","Lexus","McLaren","Porsche"]};
const f1Teams = [
  ["Mercedes","mercedes"], ["Ferrari","ferrari"], ["Red Bull Racing","red-bull"],
  ["McLaren","mclaren"], ["Alpine","alpine"], ["Aston Martin","aston-martin"],
  ["Racing Bulls","racing-bulls"], ["Cadillac","cadillac"], ["Haas","haas"],
  ["Williams","williams"], ["Audi","audi"]
];
const f2Teams = [["ART Grand Prix","f2-art"],["Campos Racing","f2-campos"],["Rodin Motorsport","f2-rodin"],["AIX Racing","f2-aix"],["DAMS Lucas Oil","f2-dams"],["Hitech","f2-hitech"],["MP Motorsport","f2-mp"],["PREMA Racing","f2-prema"],["Trident","f2-trident"],["Van Amersfoort Racing","f2-var"],["Invicta Racing","f2-invicta"]];
const isFormula = game => game==="F1" || game==="F2";
const normalize = value => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function teamRoles(roles, game, tier) {
  if (game === "F2") {
    return f2Teams.map(([name,logo])=>({name,logo,ids:roles.filter(role=>[normalize(name),normalize(name)+" f2"].includes(normalize(role.name))).map(role=>role.id)}));
  }
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
    const raw = role.name.normalize("NFKC").replace(/\p{Cf}/gu, "").trim();
    const separated = new RegExp("([^\\p{L}\\p{N}]+)" + suffix + "[^\\p{L}\\p{N}]*$", "iu");
    const attached = new RegExp(suffix.toUpperCase() + "[^\\p{L}\\p{N}]*$", "u");
    const ending = raw.match(separated) ?? raw.match(attached);
    if (!ending) continue;
    const brand = raw.slice(0, ending.index)
      .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (!normalize(brand) || /^f7r?\s*esports$/i.test(normalize(brand))) continue;
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
    if (!["options", "preview", "post", "roster", "emoji_setup", "emoji_save", "confirm_reserve", "game_settings", "save_game_settings"].includes(input?.action)) return reply({error: "Invalid action."}, 400);
    const token = Deno.env.get("F7R_DISCORD_BOT_TOKEN");
    const guild = Deno.env.get("F7R_DISCORD_SERVER_ID");
    if (!token || !snowflake(guild)) return reply({error: "Set the bot token and F7R server ID in Supabase."}, 503);
    const discordHeaders = {Authorization: "Bot " + token, "Content-Type": "application/json"};
    const api = "https://discord.com/api/v10";
    if (input.action === "confirm_reserve") {
      if (!snowflake(input.channelId) || !snowflake(input.messageId) || !snowflake(input.driverId)) return reply({error:"Open the roster with its Discord message link."},400);
      const channel = await fetch(api+"/channels/"+input.channelId,{headers:discordHeaders});
      if (!channel.ok || (await channel.json()).guild_id!==guild) return reply({error:"That channel is outside the configured server."},400);
      const message = await fetch(api+"/channels/"+input.channelId+"/messages/"+input.messageId,{headers:discordHeaders});
      if (!message.ok) return reply({error:"Could not open the check-in message."},502);
      const post = await message.json();
      const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      const postConfig = post.author?.id==="1004676760815796334" ? await readPostConfig(post,guild,service) : null;
      if (!postConfig?.fields.some(field=>field.name===input.team)) return reply({error:"Choose a team from this check-in."},400);
      const assigned = await fetch(url+"/rest/v1/rpc/f7r_confirm_discord_reserve",{
        method:"POST",headers:{apikey:service,Authorization:"Bearer "+service,"Content-Type":"application/json"},
        body:JSON.stringify({p_guild:guild,p_message:post.id,p_driver:input.driverId,p_team:input.team,p_f1:isFormula(postConfig.game)})
      });
      if (!assigned.ok) return reply({error:"Could not confirm this reserve."},502);
      const outcome = await assigned.json();
      if (outcome!=="Confirmed") return reply({error:outcome},409);
      const refreshed = await refreshDiscordRoster({message:post,channel_id:input.channelId},guild,service,postConfig).catch(()=>false);
      return reply({refreshed});
    }
    if (input.action === "roster") {
      if (!snowflake(input.messageId)) return reply({error: "Enter a valid Discord message ID."}, 400);
      const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      const query = new URLSearchParams({select:"driver_id,driver_name,placement,team,seat,checked_in_at,checked_out_at,confirmed_at",guild_id:"eq."+guild,message_id:"eq."+input.messageId,order:"driver_name"});
      const result = await fetch(url + "/rest/v1/f7r_discord_check_ins?" + query, {headers:{apikey:service,Authorization:"Bearer "+service}});
      if (!result.ok) return reply({error:"Could not load the check-in roster."},502);
      const drivers = await result.json();
      let teams = [...new Set(drivers.map(row=>row.team).filter(Boolean))].map(name=>({name}));
      let f1 = false;
      if (snowflake(input.channelId)) {
        const message = await fetch(api + "/channels/" + input.channelId + "/messages/" + input.messageId, {headers:discordHeaders});
        if (!message.ok) return reply({error:"Could not open that check-in message. Check its link and the bot's Read Message History permission."},502);
        const post = await message.json();
        const postConfig = post.author?.id==="1004676760815796334" ? await readPostConfig(post,guild,service) : null;
        if (!postConfig) return reply({error:"This link is not an F7R team check-in."},400);
        f1 = isFormula(postConfig.game);
        teams = f1 ? (postConfig.game==="F2"?f2Teams:f1Teams).map(([name,logo])=>({name,logo})) : postConfig.fields.map(({name})=>({name}));
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
    const roles = (await roleResponse.json()).filter(r=>r.id!==guild).map(({id,name})=>({id,name}));
    if (input.action === "options") return reply({channels});
    const {channelId, tier, series, game, track, startsAt, notes, nonce, artwork = "", artworkFile, round = "", lineupRoleId = ""} = input;
    if (!["F1","F2","Le Mans Ultimate","Assetto Corsa","Assetto Corsa Competizione"].includes(game)) return reply({error:"Choose a game first."},400);
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
    let savedEmojis = Object.fromEntries((await saved.json()).map(row=>[row.team,row.emoji_id]));
    const gameSettingsUrl = url + "/rest/v1/f7r_discord_game_settings";
    const gameQuery = new URLSearchParams({select:"settings",guild_id:"eq."+guild,game:"eq."+game});
    const configResponse = await fetch(gameSettingsUrl+"?"+gameQuery,{headers:settingsHeaders});
    if (!configResponse.ok) return reply({error:"Could not load attendance settings."},502);
    const defaults = {circuits:[],lineups:[],cars:[]};
    const config = (await configResponse.json())[0]?.settings ?? defaults;
    if (input.action === "game_settings") return reply({config,roles,emojis,models:game.startsWith("Assetto Corsa") ? accModels.map(([name])=>name) : []});
    if (input.action === "save_game_settings") {
      const settings = input.settings;
      const label = (value, max) => typeof value==="string" && value.trim().length>0 && value.length<=max;
      const hasRole = id => roles.some(role=>role.id===id);
      if (!settings || !Array.isArray(settings.circuits) || settings.circuits.length>200 ||
          !settings.circuits.every(name=>label(name,100)) ||
          !Array.isArray(settings.lineups) || settings.lineups.length>50 ||
          !settings.lineups.every(row=>row && label(row.name,80) && hasRole(row.roleId)) ||
          !Array.isArray(settings.cars) || settings.cars.length>100 ||
          !settings.cars.every(row=>row && label(row.name,100) && hasRole(row.roleId) &&
             (!isFormula(game) || (game==="F1"?f1Teams:f2Teams).some(([name])=>normalize(name)===normalize(row.name))) &&
             (!row.lineupRoleId || hasRole(row.lineupRoleId)) &&
             (row.emojiId==="" || emojis.some(emoji=>emoji.id===row.emojiId))) ||
          new Set(settings.lineups.map(row=>row.roleId)).size!==settings.lineups.length ||
          new Set(settings.cars.map(row=>(row.lineupRoleId??"")+":"+row.roleId)).size!==settings.cars.length) {
        return reply({error:"Check circuit names, role selections and emojis. Use each role once in its list."},400);
      }
      const result = await fetch(gameSettingsUrl,{method:"POST",headers:{...settingsHeaders,Prefer:"resolution=merge-duplicates"},
        body:JSON.stringify({guild_id:guild,game,settings})});
      if (!result.ok) return reply({error:"Could not save attendance settings."},502);
      return reply({saved:true});
    }
    const isLmu = game==="Le Mans Ultimate";
    const configuredTeams = (tier, eligibilityRole = "") => {
      const scoped = eligibilityRole ? config.cars.filter(row=>row.lineupRoleId===eligibilityRole) : [];
      const gameWide = config.cars.filter(row=>!row.lineupRoleId);
      const tierPrefix = tier ? normalize(tier)+" full time " : "";
      const tierRoles = tierPrefix ? roles.filter(role=>normalize(role.name).startsWith(tierPrefix)) : [];
      const source = scoped.length ? [] : tierRoles.length ? tierRoles : roles;
      const mappings = scoped.length ? (isLmu ? [...gameWide.filter(car=>!scoped.some(row=>row.roleId===car.roleId)),...scoped] : scoped) : tierRoles.length ? [] : gameWide;
      const assignedIds = new Set(mappings.map(row=>row.roleId));
      const autoRoles = isLmu ? source.filter(role=>!config.cars.some(car=>car.roleId===role.id)) : source;
      const rows = teamRoles(autoRoles,game,tier).map(team=>({...team,ids:team.ids.filter(id=>!assignedIds.has(id))}));
      for (const car of gameWide) {
        const team = rows.find(row=>normalize(row.name)===normalize(car.name));
        if (team && car.emojiId) savedEmojis[team.name]=car.emojiId;
      }
      for (const car of mappings) {
        if (!roles.some(role=>role.id===car.roleId)) continue;
        const existing = rows.find(team=>normalize(team.name)===normalize(car.name));
        if (existing) existing.ids.push(car.roleId);
        else rows.push({name:car.name,ids:[car.roleId]});
        if (car.emojiId) savedEmojis[existing?.name ?? car.name]=car.emojiId;
      }
      return isFormula(game) ? rows : rows.filter(team=>team.ids.length);
    };
    const canonical = name => {
      const label = normalize(name).replace(/ (?:lmu|wec)$/,"").replace(/ (?:hypercar|lmgt3|gt3)$/,"");
      return label==="corvette" || label==="chevrolet corvette" ? "chevrolet" : label;
    };
    const buildClassTeams = (teams) => isLmu ? Object.entries(lmuClasses).flatMap(([className, manufacturers]) =>
      manufacturers.map(name=>{
        const related = teams.filter(team=>{
          const qualifier = / (hypercar|lmgt3|gt3)$/.exec(normalize(team.name))?.[1];
          return canonical(team.name)===canonical(name) &&
            (!qualifier || (qualifier==="hypercar" ? className==="Hypercar" : className==="LMGT3"));
        });
        const ids = related.flatMap(team=>team.ids);
        for (const role of roles) {
          if (config.cars.some(row=>row.roleId===role.id)) continue;
          const label = normalize(role.name);
          if (label==="genesis" && name==="Genesis" ||
              / (?:lmu|wec)$/.test(label) && canonical(label.replace(/ (?:lmu|wec)$/,""))===canonical(name)) {
            ids.push(role.id);
          }
        }
        const key = className+" · "+name;
        const sourceEmoji = Object.keys(savedEmojis).find(key=>canonical(key)===canonical(name) && savedEmojis[key]);
        if (sourceEmoji && !Object.hasOwn(savedEmojis,key)) savedEmojis[key]=savedEmojis[sourceEmoji];
        return {name:key, manufacturer:name, ids:[...new Set(ids)], logo:related[0]?.logo};
      })) : teams;
    const isAcc = game.startsWith("Assetto Corsa");
    const accKey = value => normalize(value.normalize("NFKD").replace(/\p{M}/gu,""))
      .replace(/ acc$/,"").replace(/\bgt3\b/g,"").replaceAll(" ","");
    const buildAccTeams = (teams, scope) => {
      const manufacturers = [...new Set(accModels.map(([,brand])=>brand))];
      const metadata = new Map(accModels.map(([name,brand])=>[accKey(name),{name,brand,ids:[]}]));
      for (const team of teams) {
        const key = accKey(team.name);
        if (manufacturers.some(brand=>accKey(brand)===key)) continue;
        const explicit = config.cars.some(row=>accKey(row.name)===key && team.ids.includes(row.roleId));
        const model = metadata.get(key);
        if (!model && !explicit) continue;
        if (!model) metadata.set(key,{name:team.name,brand:manufacturers.find(brand=>normalize(team.name).startsWith(normalize(brand))) ?? team.name,ids:[]});
        metadata.get(key).ids.push(...team.ids);
        if (savedEmojis[team.name]) savedEmojis["GT3 · "+metadata.get(key).name] ??= savedEmojis[team.name];
      }
      const scoped = scope && config.cars.some(row=>row.lineupRoleId===scope);
      if (!scoped) {
        for (const [roleName,name,brand] of accRoleAliases) {
          const role = roles.find(row=>normalize(row.name)===normalize(roleName));
          if (!role || config.cars.some(row=>row.roleId===role.id)) continue;
          const key = accKey(name);
          if (!metadata.has(key)) metadata.set(key,{name,brand,ids:[]});
          metadata.get(key).ids.push(role.id);
        }
      }
      return [...metadata.values()].map(({name,brand,ids})=>{
        const key = "GT3 · "+name;
        const manufacturerEmoji = Object.keys(savedEmojis).find(label=>accKey(label)===accKey(brand) && savedEmojis[label]);
        const suggested = emojis.find(emoji=>accKey(emoji.name)===accKey(name)) ??
          emojis.find(emoji=>accKey(emoji.name)===accKey(brand));
        if (!Object.hasOwn(savedEmojis,key) && (manufacturerEmoji || suggested)) {
          savedEmojis[key] = manufacturerEmoji ? savedEmojis[manufacturerEmoji] : suggested.id;
        }
        return {name:key,manufacturer:brand,ids:[...new Set(ids)]};
      });
    };
    const buildRaceTeams = (teams, scope) => isAcc ? buildAccTeams(teams, scope) : buildClassTeams(teams);
    const validEmojiIds = values => values && typeof values==="object" && !Array.isArray(values) &&
      Object.values(values).every(id=>id==="" || emojis.some(emoji=>emoji.id===id));
    if (input.action === "emoji_setup" || input.action === "emoji_save") {
      const teams = buildRaceTeams(configuredTeams(""));
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
    if (!channel || (!lineupRoleId && game === "Le Mans Ultimate" && !["WEC","ELMS"].includes(series)) || (!lineupRoleId && game === "F1" && !["T1","T2","T3","T4"].includes(tier)) || !["F1","F2","Le Mans Ultimate","Assetto Corsa","Assetto Corsa Competizione"].includes(game) ||
        typeof track!=="string" || !track.trim() || track.length>100 || typeof notes!=="string" || notes.length>500 ||
        !Number.isSafeInteger(startsAt) || startsAt<=Date.now() || startsAt>8640000000000000 ||
        typeof nonce!=="string" || !/^[a-f0-9]{24}$/.test(nonce)) return reply({error:"Choose a channel, game, track, future race time and an F1 tier where applicable."},400);
    const fullTimeRole = game === "F1" ? tier + " Full Time" :
      game === "Le Mans Ultimate" ? series + " Full Time Driver" : game === "F2" ? "Realistic F2 Full Time" : "ACC Full Time Driver";
    const compactRole = name => normalize(name).replaceAll(" ", "");
    const eligibilityName = compactRole(fullTimeRole);
    const preferred = game === "Le Mans Ultimate" ? roles.filter(role=>compactRole(role.name)===compactRole(series+" Full Time")) : [];
    const customLineup = config.lineups.find(row=>row.roleId===lineupRoleId);
    const fullTimeRoles = lineupRoleId ? roles.filter(role=>customLineup && role.id===customLineup.roleId) :
      preferred.length ? preferred : roles.filter(role=>compactRole(role.name)===eligibilityName);
    if (fullTimeRoles.length !== 1) return reply({error:lineupRoleId ? "The saved lineup role is unavailable. Reload attendance settings." : "Expected one Discord role named " + fullTimeRole + "."},400);
    const teams = configuredTeams(!lineupRoleId && typeof tier==="string" ? tier : "", fullTimeRoles[0].id);
    const classTeams = buildRaceTeams(teams, fullTimeRoles[0].id);
    const mapped = classTeams.filter(team=>team.ids.length);
    if (!mapped.length && (!isAcc || input.action === "post")) {
      if (isAcc) return reply({error:"Map at least one ACC Discord role to a specific GT3 model in League setup."},400);
      const expected = game === "F1" ? "Mercedes or " + tier + " Full Time Mercedes" :
        game === "Le Mans Ultimate" ? "Mercedes LMU" : "Porsche ACC";
      return reply({error:"No Discord team roles matched " + game + ". Expected a role such as " + expected + "."},400);
    }
    if ((!isAcc && mapped.length > 25) || mapped.some(team=>team.ids.join(",").length>950)) {
      return reply({error:"Too many team roles to fit in one Discord check-in."},400);
    }
    if (typeof round!=="string" || round.length>40) return reply({error:"Keep the round label under 40 characters."},400);
    let image;
    let upload;
    if (artworkFile && input.action === "post") {
      const extensions = {"image/png":"png","image/jpeg":"jpg","image/webp":"webp","image/gif":"gif"};
      const extension = Object.hasOwn(extensions,artworkFile.type) && extensions[artworkFile.type];
      if (!extension || typeof artworkFile.data!=="string" || artworkFile.data.length>2796204) return reply({error:"Use a PNG, JPG, WebP or GIF up to 2 MB."},400);
      const bytes = Uint8Array.from(atob(artworkFile.data), value=>value.charCodeAt(0));
      if (!bytes.length || bytes.length>2097152) return reply({error:"Use an image up to 2 MB."},400);
      upload={file:new Blob([bytes],{type:artworkFile.type}),name:"race-artwork."+extension};
      image={url:"attachment://"+upload.name};
    }
    if (!upload && artwork) {
      const imageUrl = typeof artwork === "string" && artwork.length <= 1500 ? URL.parse(artwork) : null;
      if (!imageUrl || imageUrl.protocol !== "https:" || imageUrl.username || imageUrl.password) {
        return reply({error:"Race artwork needs a direct HTTPS image URL."},400);
      }
      image = {url:imageUrl.href};
    }
    if (input.action === "preview") return reply({teams:classTeams,fullTimeRole:fullTimeRoles[0].name,emojis,emojiAvailable:emojiResponse.ok,savedEmojis});
    const emojiIds = input.emojiIds ?? savedEmojis;
    if (!validEmojiIds(emojiIds)) return reply({error:"A selected emoji is no longer available. Preview the check-in again."},400);
    const teamField = (team) => {
      const emoji = emojis.find(emoji=>emoji.id===emojiIds[team.name]);
      const prefix = emoji ? "<"+(emoji.animated?"a":"")+":"+emoji.name+":"+emoji.id+"> " : "";
      return {name:team.name,value:(prefix+team.ids.map(id=>"<@&"+id+">").join(" ")).trim() || "—"};
    };
    const lineupFields = (isFormula(game) || isLmu || isAcc ? classTeams : mapped).map(teamField);
    const time = Math.floor(startsAt/1000);
    const classEmoji = name => classEmojiFor(emojis,name);
    const classIcons = Object.fromEntries(["Hypercar","LMGT3","GT3","Reserve"].map(name=>[name,classEmojiText(classEmoji(name))]));
    const roster = {...rosterEmbed([],lineupFields,isFormula(game),4096,classIcons),image};
    if (!await savePostConfig(guild,nonce,{game,fields:lineupFields,fullTimeId:fullTimeRoles[0].id,classIcons},service)) {
      return reply({error:"Could not save the check-in role mappings."},502);
    }
    const checkInButtons = isLmu ? [
      {type:2,style:2,label:"Check in · Hypercar",emoji:classEmoji("Hypercar"),custom_id:"f7r-team-hyper:"+time+":"+nonce},
      {type:2,style:2,label:"Check in · LMGT3",emoji:classEmoji("LMGT3"),custom_id:"f7r-team-gt3:"+time+":"+nonce}
    ] : [{type:2,style:2,label:isAcc?"Check in · GT3":"Participating",...(isAcc?{emoji:classEmoji("GT3")} : {}),custom_id:"f7r-team-rsvp:"+time+":"+nonce}];
    const payload = {
      content:"**F7R race check-in**\n**Race & round:** " + game + " · " + track.trim() + (round.trim() ? " · "+round.trim() : "") + (customLineup ? " · "+customLineup.name : "") +
        "\n**Date and time:** <t:" + time + ":F>" +
        (notes.trim() ? "\n"+notes.trim() : ""),
      allowed_mentions:{parse:[]}, nonce, enforce_nonce:true,
      embeds:[roster],
      components:[{type:1,components:[...checkInButtons,{type:2,style:4,label:"Check out",custom_id:"f7r-team-out:"+time+":"+nonce}]}]
    };
    let body = JSON.stringify(payload);
    let headers = discordHeaders;
    if (upload) {
      body = new FormData();
      payload.attachments=[{id:0,filename:upload.name}];
      body.append("payload_json",JSON.stringify(payload));
      body.append("files[0]",upload.file,upload.name);
      headers={Authorization:discordHeaders.Authorization};
    }
    const message = await fetch(api+"/channels/"+channel.id+"/messages",{method:"POST",headers,body});
    if (!message.ok) return reply({error:message.status===429?"Discord is rate limiting requests. Try again shortly.":"Could not post. Check the bot's View Channel and Send Messages permissions."},502);
    const posted=await message.json();
    return reply({url:"https://discord.com/channels/"+guild+"/"+channel.id+"/"+posted.id, messageId:posted.id});
  } catch {
    return reply({error:"Discord attendance service is unavailable."},502);
  }
});
