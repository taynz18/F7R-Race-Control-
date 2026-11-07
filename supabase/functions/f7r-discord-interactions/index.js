const appId = "1004676760815796334";
const publicKey = "009733d0f6a808d8c612002338884e15eaf68fd8adaffce335a503681a6e189f";
const bytes = (hex) => Uint8Array.from(hex.match(/../g), (pair) => parseInt(pair, 16));
const key = await crypto.subtle.importKey("raw", bytes(publicKey), "Ed25519", false, ["verify"]);
const encoder = new TextEncoder();
const api = "https://discord.com/api/v10";
const privateReply = (content) => Response.json({type: 4, data: {content, flags: 64, allowed_mentions: {parse: []}}});

function rosterEmbed(rows, mapped, isF1, limit) {
  const clean = value => value.replace(/[\r\n]/g, " ").replace(/[\\*_~\x60|<>\[\]@]/g, "\\$&").slice(0, 90);
  const stamp = (value) => {
    const seconds = Math.floor(Date.parse(value) / 1000);
    return Number.isFinite(seconds) ? "<t:" + seconds + ":f>" : "";
  };
  const live = rows.filter(row=>!row.checked_out_at);
  const lines = [];
  for (const field of mapped) {
    const drivers = live.filter(row=>row.placement==="Full-time" && row.team===field.name);
    const emoji = /^<a?:\w+:\d{17,20}>/.exec(field.value)?.[0];
    lines.push("**"+(emoji ? emoji+" " : "")+clean(field.name)+"**");
    if (isF1) {
      for (const seat of [1,2]) {
        const driver = drivers.find(row=>row.seat===seat) ?? drivers.filter(row=>row.seat==null)[seat-1];
        if (driver) lines.push("↳ "+seat+" · "+clean(driver.driver_name));
      }
    } else {
      for (const driver of drivers) lines.push("↳ "+clean(driver.driver_name));
    }
  }
  lines.push("**Reserves**");
  const reserves = live.filter(row=>row.placement==="Reserve");
  if (!reserves.length) lines.push("None yet");
  for (const driver of reserves) {
    const emoji = /^<a?:\w+:\d{17,20}>/.exec(mapped.find(field=>field.name===driver.team)?.value ?? "")?.[0];
    lines.push("↳ "+(emoji ? emoji+" " : "")+clean(driver.driver_name)+(stamp(driver.checked_in_at) ? " · In "+stamp(driver.checked_in_at) : ""));
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
  let description = lines.join("\n");
  if (description.length > limit) {
    const note = "\nMore entries in Race Control.";
    description = description.slice(0,limit-note.length).split("\n").slice(0,-1).join("\n")+note;
  }
  return {title:"Live check-in lineup", color:0xf21b32, description};
}

async function refreshDiscordRoster(interaction, guild, service, mapped) {
  const token = Deno.env.get("F7R_DISCORD_BOT_TOKEN");
  if (!token) return false;
  const base = interaction.message.embeds.filter(embed=>["Team roles","Full-time eligibility"].includes(embed.title))
    .map(({title, description, footer, fields})=>({title, description, footer:footer && {text:footer.text}, fields}));
  const limit = Math.min(4096, 5900 - base.reduce((sum, embed)=>sum+JSON.stringify(embed).length,0));
  if (limit < 80) return false;
  const query = new URLSearchParams({select:"driver_name,placement,team,seat,checked_in_at,checked_out_at",guild_id:"eq."+guild,
    message_id:"eq."+interaction.message.id,order:"checked_in_at.asc.nullslast,driver_id.asc"});
  const load = async () => {
    const response = await fetch(Deno.env.get("SUPABASE_URL")+"/rest/v1/f7r_discord_check_ins?"+query,{headers:{apikey:service,Authorization:"Bearer "+service}});
    if (!response.ok) throw new Error("Roster read failed");
    return response.json();
  };
  let rows = await load();
  for (let attempt=0; attempt<3; attempt++) {
    const roster = rosterEmbed(rows,mapped,base[0]?.footer?.text==="F1",limit);
    const artwork = interaction.message.embeds.find(embed=>embed.title==="Live check-in lineup")?.image?.url;
    if (artwork) roster.image = {url:artwork};
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

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response(null, {status: 405});
  const signature = req.headers.get("x-signature-ed25519") ?? "";
  const timestamp = req.headers.get("x-signature-timestamp") ?? "";
  if (!/^[a-f0-9]{128}$/i.test(signature) || !/^\d{10}$/.test(timestamp) ||
      Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return new Response(null, {status: 401});
  const raw = await req.text();
  if (!await crypto.subtle.verify("Ed25519", key, bytes(signature), encoder.encode(timestamp + raw))) {
    return new Response(null, {status: 401});
  }
  const interaction = JSON.parse(raw);
  if (interaction.type === 1) return Response.json({type: 1});
  if (interaction.application_id !== appId) return new Response(null, {status: 401});

  const guild = Deno.env.get("F7R_DISCORD_SERVER_ID");
  if (!guild || interaction.guild_id !== guild) return privateReply("This check-in is only available in the F7R server.");
  const rsvp = /^f7r-team-(rsvp|out):(\d{10,13})$/.exec(interaction.data?.custom_id ?? "");
  if (interaction.type !== 3 || !rsvp || interaction.message?.author?.id !== appId || !interaction.member?.user?.id) {
    return privateReply("Create your race check-in from the Race Control admin dashboard.");
  }
  if (Date.now() >= Number(rsvp[2]) * 1000) return privateReply("Check-in closed when the race started.");
  const checkingOut = rsvp[1] === "out";
  const member = interaction.member;
  const mapped = interaction.message.embeds?.find(embed=>embed.title==="Team roles")?.fields ?? [];
  const matches = mapped.filter(field => [...field.value.matchAll(/<@&(\d{17,20})>/g)].some(([,id])=>member.roles.includes(id)));
  if (!checkingOut && matches.length > 1) return privateReply("You have more than one matching team role. Ask an F7R admin to check your roles.");
  const team = matches[0]?.name ?? null;
  const eligibility = interaction.message.embeds?.find(embed=>embed.title==="Full-time eligibility");
  const fullTimeId = /^<@&(\d{17,20})>$/.exec(eligibility?.description ?? "")?.[1];
  const placement = team && (!eligibility || member.roles.includes(fullTimeId)) ? "Full-time" : "Reserve";
  EdgeRuntime.waitUntil((async () => {
    let content = "Could not save your check-in. Please try again.";
    try {
      const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      const result = await fetch(Deno.env.get("SUPABASE_URL") + "/rest/v1/rpc/f7r_record_discord_check_in", {
        method:"POST",
        headers:{apikey:service,Authorization:"Bearer "+service,"Content-Type":"application/json"},
        body:JSON.stringify({
          p_guild:guild,p_message:interaction.message.id,p_driver:member.user.id,
          p_name:member.nick || member.user.global_name || member.user.username,p_team:team,
          p_full_time:placement==="Full-time",p_f1:interaction.message.embeds?.some(embed=>embed.title==="Team roles" && embed.footer?.text==="F1") ?? false,
          p_out:checkingOut
        })
      });
      if (result.ok) {
        const outcome = await result.json();
        content = checkingOut ? outcome + "." : "You're checked in as **" + outcome + "**" + (team ? " · " + team : "") + ".";
        if (!await refreshDiscordRoster(interaction,guild,service,mapped).catch(()=>false)) {
          content += " The Discord lineup could not refresh. Your response is saved in Race Control.";
        }
      }
    } finally {
      await fetch(api+"/webhooks/"+appId+"/"+interaction.token+"/messages/@original", {
        method:"PATCH",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({content,allowed_mentions:{parse:[]}})
      });
    }
  })().catch(()=>console.error("Discord check-in response failed.")));
  return Response.json({type:5,data:{flags:64}});
});
