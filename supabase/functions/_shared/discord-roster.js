const api = "https://discord.com/api/v10";
const classEmojiNames = {GT3:["gt3","gt3logo"],Reserve:["reserve"],Hypercar:["hypercar","lmh","hypercarlogo","officialhypercar"],LMGT3:["gt3","lmgt3","gt3logo","lmgt3logo","officiallmgt3"]};
export function classEmojiFor(emojis, className) {
  for (const name of classEmojiNames[className]) {
    const emoji = emojis.find(item=>item.available!==false && !item.roles?.length &&
      item.id && item.name.toLowerCase().replaceAll("_","")===name);
    if (emoji) return {id:emoji.id,name:emoji.name,animated:Boolean(emoji.animated)};
  }
  return {name:className==="Reserve"?"🟨":className==="Hypercar"?"🟥":"🟧"};
}
export function classEmojiText(emoji) {
  return emoji.id ? "<"+(emoji.animated?"a":"")+":"+emoji.name+":"+emoji.id+">" : emoji.name;
}
function buttonClass(component) {
  if (component.custom_id?.startsWith("f7r-team-hyper:")) return "Hypercar";
  if (component.custom_id?.startsWith("f7r-team-gt3:")) return "LMGT3";
  return null;
}
export function rosterEmbed(rows, mapped, isF1, limit, classIcons = {}, openEntry = false) {
  const clean = value => value.replace(/[\r\n]/g, " ").replace(/[\\*_~\x60|<>\[\]@]/g, "\\$&").slice(0, 90);
  const stamp = (value) => {
    const seconds = Math.floor(Date.parse(value) / 1000);
    return Number.isFinite(seconds) ? "<t:" + seconds + ":f>" : "";
  };
  const live = rows.filter(row=>!row.checked_out_at);
  const totals = openEntry ? "**Drivers checked in:** "+live.length : "**Full-time checked in:** "+live.filter(row=>row.placement==="Full-time").length+
    "  ·  **Reserves checked in:** "+live.filter(row=>row.placement==="Reserve").length;
  const reserveIcon = classIcons.Reserve || "🟨";
  const raceClass = team => /^(Hypercar|LMGT3|GT3)(?: · |$)/.exec(team ?? "")?.[1];
  if (mapped.some(field=>raceClass(field.name))) {
    const active = live.filter(row=>row.placement==="Full-time" || row.confirmed_at);
    const waiting = live.filter(row=>row.placement==="Reserve" && !row.confirmed_at);
    const checkedOut = rows.filter(row=>row.checked_out_at);
    if (limit < 512) return {title:"Live check-in lineup",color:0xf21b32,description:totals+"\nFull roster in Race Control."};
    const valueLimit = Math.min(1024, Math.max(1, Math.floor((limit-totals.length-256)/4)));
    const fieldValue = (lines) => {
      if (!lines.length) return "None yet";
      const value = lines.join("\n");
      if (value.length <= valueLimit) return value;
      const note = "More in Race Control.";
      return value.slice(0,Math.max(0,valueLimit-note.length-1)).split("\n").slice(0,-1).concat(note).join("\n");
    };
    const gt3 = mapped.filter(field=>raceClass(field.name)==="GT3");
    const midpoint = Math.ceil(gt3.length/2);
    const groups = gt3.length ? [
      ["GT3",classIcons.GT3 || "🟧",gt3.slice(0,midpoint)],
      ["GT3",classIcons.GT3 || "🟧",gt3.slice(midpoint)]
    ] : [
      ["LMGT3",classIcons.LMGT3 || "🟧",mapped.filter(field=>raceClass(field.name)==="LMGT3")],
      ["Hypercar",classIcons.Hypercar || "🟥",mapped.filter(field=>raceClass(field.name)==="Hypercar")]
    ];
    const fields = groups.map(([className,icon,cars],index)=>{
      const manufacturers = [];
      let count = 0;
      for (const field of cars) {
        const emoji = /^<a?:\w+:\d{17,20}>/.exec(field.value)?.[0];
        const car = clean(field.name.slice(className.length+3).replace(/^Porsche 911 GT3 R \(992\)$/, "Porsche 992"));
        const drivers = active.filter(driver=>driver.team===field.name);
        count += drivers.length;
        manufacturers.push("**"+(emoji ? emoji+" " : "")+car+"**",
          ...drivers.map(driver=>"↳ "+clean(driver.driver_name)+(driver.confirmed_at ? " · Reserve" : "")));
      }
      const label = className+(gt3.length && index===1 ? " · continued" : "");
      return {name:icon+" "+label+" ("+count+")",inline:true,value:fieldValue(manufacturers)};
    });
    if (!openEntry || waiting.length) fields.push({name:reserveIcon+" Reserves ("+waiting.length+")",inline:true,value:fieldValue(waiting.map(driver=>{
      const className = raceClass(driver.team);
      const time = stamp(driver.checked_in_at);
      return clean(driver.driver_name)+(className ? " · "+className : "")+(time ? " · "+time : "");
    }))});
    const changes = [
      ...active.filter(row=>row.confirmed_at).map(row=>clean(row.driver_name)+" → "+clean(row.team)),
      ...checkedOut.map(row=>clean(row.driver_name)+(stamp(row.checked_in_at) ? " · In "+stamp(row.checked_in_at) : "")+" · "+stamp(row.checked_out_at))
    ];
    if (changes.length) fields.push({name:reserveIcon+" Confirmed reserves and not participating",value:fieldValue(changes)});
    return {title:"Live check-in lineup",color:0xf21b32,description:totals,fields};
  }
  const lines = [];
  for (const field of mapped) {
    const drivers = live.filter(row=>(row.placement==="Full-time" || row.confirmed_at) && row.team===field.name);
    const emoji = /^<a?:\w+:\d{17,20}>/.exec(field.value)?.[0];
    lines.push("**"+(emoji ? emoji+" " : "")+clean(field.name)+"**");
    if (isF1) {
      for (const seat of [1,2]) {
        const driver = drivers.find(row=>row.seat===seat) ?? drivers.filter(row=>row.seat==null)[seat-1];
        if (driver) lines.push("↳ "+seat+" · "+clean(driver.driver_name)+(driver.confirmed_at?" · Reserve":""));
      }
    } else {
      for (const driver of drivers) lines.push("↳ "+clean(driver.driver_name));
    }
  }
  lines.push(reserveIcon+" **Reserves**");
  const reserves = live.filter(row=>row.placement==="Reserve" && !row.confirmed_at);
  if (!reserves.length) lines.push("None yet");
  for (const driver of reserves) {
    lines.push("↳ "+clean(driver.driver_name)+(stamp(driver.checked_in_at) ? " · In "+stamp(driver.checked_in_at) : ""));
  }
  const confirmed = live.filter(row=>row.confirmed_at);
  if (confirmed.length) {
    lines.push(reserveIcon+" **Confirmed reserves**");
    for (const driver of confirmed) lines.push("↳ "+clean(driver.driver_name)+" → "+clean(driver.team));
  }
  const departed = rows.filter(row=>row.checked_out_at);
  lines.push("**Not participating**");
  if (!departed.length) lines.push("None yet");
  if (departed.length) {
    for (const driver of departed) {
      const entered = stamp(driver.checked_in_at);
      lines.push("↳ "+clean(driver.driver_name)+(entered ? " · In "+entered : "")+" · "+stamp(driver.checked_out_at));
    }
  }
  let description = [totals,"",...lines].join("\n");
  if (description.length > limit) {
    const note = "\nMore entries in Race Control.";
    description = description.slice(0,limit-note.length).split("\n").slice(0,-1).join("\n")+note;
  }
  return {title:"Live check-in lineup", color:0xf21b32, description};
}

function configHeaders(service) {
  return {apikey:service,Authorization:"Bearer "+service,"Content-Type":"application/json"};
}
function postKey(message) {
  for (const row of message.components ?? []) {
    for (const component of row.components ?? []) {
      const nonce = /^f7r-team-(?:rsvp|out|hyper|gt3):\d{10,13}:([a-f0-9]{24})$/.exec(component.custom_id ?? "")?.[1];
      if (nonce) return nonce;
    }
  }
  return message.id;
}
export async function savePostConfig(guild, key, config, service) {
  const result = await fetch(Deno.env.get("SUPABASE_URL")+"/rest/v1/f7r_discord_post_config",{
    method:"POST",headers:{...configHeaders(service),Prefer:"resolution=ignore-duplicates"},
    body:JSON.stringify({guild_id:guild,post_key:key,config})
  });
  return result.ok;
}
export async function readPostConfig(message, guild, service) {
  const teamEmbed = message.embeds?.find(embed=>embed.title==="Team roles");
  if (teamEmbed) {
    const eligibility = message.embeds.find(embed=>embed.title==="Full-time eligibility");
    const classIcons = Object.fromEntries((message.components ?? []).flatMap(row=>row.components ?? []).flatMap(component=>{
      const className = component.custom_id?.startsWith("f7r-team-hyper:") ? "Hypercar" : component.custom_id?.startsWith("f7r-team-gt3:") ? "LMGT3" : "";
      const emoji = component.emoji;
      return className && emoji?.id ? [[className,"<"+(emoji.animated?"a":"")+":"+emoji.name+":"+emoji.id+">"]] : [];
    }));
    return {game:teamEmbed.footer?.text,fields:teamEmbed.fields ?? [],classIcons,
      fullTimeId:/^<@&(\d{17,20})>$/.exec(eligibility?.description ?? "")?.[1] ?? null, legacy:true};
  }
  const query = new URLSearchParams({select:"config",guild_id:"eq."+guild,post_key:"eq."+postKey(message)});
  const result = await fetch(Deno.env.get("SUPABASE_URL")+"/rest/v1/f7r_discord_post_config?"+query,
    {headers:configHeaders(service),signal:AbortSignal.timeout(1800)});
  if (!result.ok) throw Error("Attendance configuration is unavailable.");
  const config = (await result.json())[0]?.config ?? null;
  if (config?.game?.startsWith("Assetto Corsa") && !config.openEntry) config.fields = config.fields.filter(field=>/<@&\d{17,20}>/.test(field.value));
  return config;
}

export async function refreshDiscordRoster(interaction, guild, service, config) {
  const token = Deno.env.get("F7R_DISCORD_BOT_TOKEN");
  if (!token) return false;
  if (config.legacy && !await savePostConfig(guild,postKey(interaction.message),{...config,legacy:false},service)) return false;
  const limit = 4096;
  const originalComponents = interaction.message.components ?? [];
  const classButtons = originalComponents.flatMap(row=>row.components ?? []).filter(buttonClass);
  let components;
  const classIcons = {...config.classIcons};
  let emojiRequest;
  const loadEmojis = () => emojiRequest ??= fetch(api+"/guilds/"+guild+"/emojis",{
    headers:{Authorization:"Bot "+token},signal:AbortSignal.timeout(2000)
  }).then(response=>response.ok ? response.json() : []).catch(()=>[]);
  if (!classIcons.Reserve?.startsWith("<")) {
    const currentRoster = interaction.message.embeds?.find(embed=>embed.title==="Live check-in lineup");
    const existing = [currentRoster?.description ?? "", ...(currentRoster?.fields ?? []).map(field=>field.name)]
      .join("\n").match(/<a?:reserve:\d{17,20}>/i)?.[0];
    classIcons.Reserve = existing ?? classEmojiText(classEmojiFor(await loadEmojis(),"Reserve"));
  }
  if (config.game==="Le Mans Ultimate" && classButtons.length) {
    if (classButtons.some(button=>button.emoji?.name?.toLowerCase()!==classEmojiNames[buttonClass(button)][0])) {
      try {
        const emojis = await loadEmojis();
        if (emojis.length) {
          components = originalComponents.map(row=>({...row,components:row.components.map(button=>{
            const className = buttonClass(button);
            if (!className) return button;
            const emoji = classEmojiFor(emojis,className);
            return emoji.id ? {...button,emoji} : button;
          })}));
        }
      } catch { /* Keep existing emojis if Discord's emoji endpoint is unavailable. */ }
    }
    for (const row of components ?? originalComponents) {
      for (const button of row.components ?? []) {
        const className = buttonClass(button);
        if (className && button.emoji) classIcons[className] = classEmojiText(button.emoji);
      }
    }
  }
  const checkIn = button => /^f7r-team-(?:rsvp|hyper|gt3):/.test(button.custom_id ?? "");
  if ((components ?? originalComponents).some(row=>row.components?.some(button=>checkIn(button) && button.style!==2))) {
    components = (components ?? originalComponents).map(row=>({...row,components:row.components.map(button=>checkIn(button) ? {...button,style:2} : button)}));
  }
  const isDecline = button => button.custom_id?.startsWith("f7r-team-out:");
  if ((components ?? originalComponents).some(row=>row.components?.some(button=>isDecline(button) && button.label!=="Not participating"))) {
    components = (components ?? originalComponents).map(row=>({...row,components:row.components.map(button=>
      isDecline(button) ? {...button,label:"Not participating"} : button)}));
  }
  const query = new URLSearchParams({select:"driver_name,placement,team,seat,checked_in_at,checked_out_at,confirmed_at",guild_id:"eq."+guild,
    message_id:"eq."+interaction.message.id,order:"checked_in_at.asc.nullslast,driver_id.asc"});
  const load = async () => {
    const response = await fetch(Deno.env.get("SUPABASE_URL")+"/rest/v1/f7r_discord_check_ins?"+query,{headers:{apikey:service,Authorization:"Bearer "+service}});
    if (!response.ok) throw new Error("Roster read failed");
    return response.json();
  };
  let rows = await load();
  for (let attempt=0; attempt<3; attempt++) {
    const roster = rosterEmbed(rows,config.fields,["F1","F2"].includes(config.game),limit,classIcons,config.openEntry);
    const artwork = interaction.message.embeds.find(embed=>embed.title==="Live check-in lineup")?.image?.url;
    const attachment = interaction.message.attachments?.find(item=>item.filename.startsWith("race-artwork."));
    if (attachment || artwork) roster.image = {url:attachment ? "attachment://"+attachment.filename : artwork};
    const updated = await fetch(api+"/channels/"+(interaction.channel_id ?? interaction.channel?.id)+"/messages/"+interaction.message.id,{
      method:"PATCH",headers:{Authorization:"Bot "+token,"Content-Type":"application/json"},
      body:JSON.stringify({embeds:[roster],components,allowed_mentions:{parse:[]},
        ...(config.legacy && typeof interaction.message.content==="string" ? {content:interaction.message.content.split("\n").filter(line=>!line.startsWith("**Full-time role:**")).join("\n")} : {})})
    });
    if (!updated.ok) return false;
    const latest = await load();
    if (JSON.stringify(rows)===JSON.stringify(latest)) return true;
    rows=latest;
  }
  return false;
}

