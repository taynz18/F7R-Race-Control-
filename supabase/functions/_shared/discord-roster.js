const api = "https://discord.com/api/v10";
export function rosterEmbed(rows, mapped, isF1, limit) {
  const clean = value => value.replace(/[\r\n]/g, " ").replace(/[\\*_~\x60|<>\[\]@]/g, "\\$&").slice(0, 90);
  const stamp = (value) => {
    const seconds = Math.floor(Date.parse(value) / 1000);
    return Number.isFinite(seconds) ? "<t:" + seconds + ":f>" : "";
  };
  const live = rows.filter(row=>!row.checked_out_at);
  const totals = "**Full-time checked in:** "+live.filter(row=>row.placement==="Full-time").length+
    "  ·  **Reserves checked in:** "+live.filter(row=>row.placement==="Reserve").length;
  const raceClass = team => /^(Hypercar|LMGT3)(?: · |$)/.exec(team ?? "")?.[1];
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
    const fields = [["LMGT3","🟧"],["Hypercar","🟥"]].map(([className, icon])=>{
      const drivers = active.filter(row=>raceClass(row.team)===className);
      return {name:icon+" "+className+" ("+drivers.length+")",inline:true,value:fieldValue(drivers.map(driver=>{
        const team = mapped.find(field=>field.name===driver.team);
        const emoji = /^<a?:\w+:\d{17,20}>/.exec(team?.value ?? "")?.[0];
        const car = clean(driver.team.slice(className.length+3));
        return clean(driver.driver_name)+(emoji ? " · "+emoji : car ? " · "+car : "")+
          (driver.confirmed_at ? " · Reserve" : "");
      }))};
    });
    fields.push({name:"🟨 Reserves ("+waiting.length+")",inline:true,value:fieldValue(waiting.map(driver=>{
      const className = raceClass(driver.team);
      const time = stamp(driver.checked_in_at);
      return clean(driver.driver_name)+(className ? " · "+className : "")+(time ? " · "+time : "");
    }))});
    const changes = [
      ...active.filter(row=>row.confirmed_at).map(row=>clean(row.driver_name)+" → "+clean(row.team)),
      ...checkedOut.map(row=>clean(row.driver_name)+(stamp(row.checked_in_at) ? " · In "+stamp(row.checked_in_at) : "")+" · Out "+stamp(row.checked_out_at))
    ];
    if (changes.length) fields.push({name:"Confirmed reserves and check-outs",value:fieldValue(changes)});
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
  lines.push("**Reserves**");
  const reserves = live.filter(row=>row.placement==="Reserve" && !row.confirmed_at);
  if (!reserves.length) lines.push("None yet");
  for (const driver of reserves) {
    lines.push("↳ "+clean(driver.driver_name)+(stamp(driver.checked_in_at) ? " · In "+stamp(driver.checked_in_at) : ""));
  }
  const confirmed = live.filter(row=>row.confirmed_at);
  if (confirmed.length) {
    lines.push("**Confirmed reserves**");
    for (const driver of confirmed) lines.push("↳ "+clean(driver.driver_name)+" → "+clean(driver.team));
  }
  const departed = rows.filter(row=>row.checked_out_at);
  lines.push("**Checked out**");
  if (!departed.length) lines.push("None yet");
  if (departed.length) {
    for (const driver of departed) {
      const entered = stamp(driver.checked_in_at);
      lines.push("↳ "+clean(driver.driver_name)+(entered ? " · In "+entered : "")+" · Out "+stamp(driver.checked_out_at));
    }
  }
  let description = [totals,"",...lines].join("\n");
  if (description.length > limit) {
    const note = "\nMore entries in Race Control.";
    description = description.slice(0,limit-note.length).split("\n").slice(0,-1).join("\n")+note;
  }
  return {title:"Live check-in lineup", color:0xf21b32, description};
}

export async function refreshDiscordRoster(interaction, guild, service, mapped) {
  const token = Deno.env.get("F7R_DISCORD_BOT_TOKEN");
  if (!token) return false;
  const base = interaction.message.embeds.filter(embed=>["Team roles","Full-time eligibility"].includes(embed.title))
    .map(({title, description, footer, fields})=>({title, description, footer:footer && {text:footer.text}, fields}));
  const limit = Math.min(4096, 5900 - base.reduce((sum, embed)=>sum+JSON.stringify(embed).length,0));
  if (limit < 80) return false;
  const query = new URLSearchParams({select:"driver_name,placement,team,seat,checked_in_at,checked_out_at,confirmed_at",guild_id:"eq."+guild,
    message_id:"eq."+interaction.message.id,order:"checked_in_at.asc.nullslast,driver_id.asc"});
  const load = async () => {
    const response = await fetch(Deno.env.get("SUPABASE_URL")+"/rest/v1/f7r_discord_check_ins?"+query,{headers:{apikey:service,Authorization:"Bearer "+service}});
    if (!response.ok) throw new Error("Roster read failed");
    return response.json();
  };
  let rows = await load();
  for (let attempt=0; attempt<3; attempt++) {
    const roster = rosterEmbed(rows,mapped,["F1","F2"].includes(base[0]?.footer?.text),limit);
    const artwork = interaction.message.embeds.find(embed=>embed.title==="Live check-in lineup")?.image?.url;
    const attachment = interaction.message.attachments?.find(item=>item.filename.startsWith("race-artwork."));
    if (attachment || artwork) roster.image = {url:attachment ? "attachment://"+attachment.filename : artwork};
    const updated = await fetch(api+"/channels/"+(interaction.channel_id ?? interaction.channel?.id)+"/messages/"+interaction.message.id,{
      method:"PATCH",headers:{Authorization:"Bot "+token,"Content-Type":"application/json"},
      body:JSON.stringify({embeds:[roster,...base],allowed_mentions:{parse:[]}})
    });
    if (!updated.ok) return false;
    const latest = await load();
    if (JSON.stringify(rows)===JSON.stringify(latest)) return true;
    rows=latest;
  }
  return false;
}

