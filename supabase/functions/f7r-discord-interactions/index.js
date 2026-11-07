import { refreshDiscordRoster } from "../_shared/discord-roster.js";
const appId = "1004676760815796334";
const publicKey = "009733d0f6a808d8c612002338884e15eaf68fd8adaffce335a503681a6e189f";
const bytes = (hex) => Uint8Array.from(hex.match(/../g), (pair) => parseInt(pair, 16));
const key = await crypto.subtle.importKey("raw", bytes(publicKey), "Ed25519", false, ["verify"]);
const encoder = new TextEncoder();
const api = "https://discord.com/api/v10";
const privateReply = (content) => Response.json({type: 4, data: {content, flags: 64, allowed_mentions: {parse: []}}});

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
  const customId = interaction.data?.custom_id ?? "";
  const button = interaction.type === 3 && /^f7r-team-(rsvp|out):(\d{10,13})$/.exec(customId);
  const picker = interaction.type === 5 && /^f7r-f1-car:(\d{10,13})$/.exec(customId);
  if ((!button && !picker) || interaction.message?.author?.id !== appId || !interaction.member?.user?.id) {
    return privateReply("Open the F7R race check-in and try again.");
  }
  const deadline = button ? button[2] : picker[1];
  if (Date.now() >= Number(deadline) * 1000) return privateReply("Check-in closed when the race started.");
  const checkingOut = button && button[1] === "out";
  const member = interaction.member;
  const teamEmbed = interaction.message.embeds?.find(embed=>embed.title==="Team roles");
  const isF1 = teamEmbed?.footer?.text === "F1";
  const mapped = teamEmbed?.fields ?? [];
  const matches = mapped.map((field,index)=>({field,index})).filter(({field})=>
    [...field.value.matchAll(/<@&(\d{17,20})>/g)].some(([,id])=>member.roles.includes(id)));
  const eligibility = interaction.message.embeds?.find(embed=>embed.title==="Full-time eligibility");
  const fullTimeId = /^<@&(\d{17,20})>$/.exec(eligibility?.description ?? "")?.[1];
  const eligible = !eligibility || member.roles.includes(fullTimeId);
  let team = matches.length === 1 ? matches[0].field.name : null;
  if (picker) {
    const selection = interaction.data.components?.find(row=>row.component?.custom_id==="car")?.component.values;
    const chosen = selection?.length === 1 && matches.find(({index})=>String(index)===selection[0]);
    if (!isF1 || !eligible || !chosen) return privateReply("That car is no longer available to you for this race. Try check-in again.");
    team = chosen.field.name;
  } else if (!checkingOut && eligible && matches.length > 1) {
    if (!isF1) return privateReply("You have two car roles for this lineup. Ask an F7R admin to check them.");
    return Response.json({type:9,data:{
      custom_id:"f7r-f1-car:"+deadline, title:"Choose your car for this F1 race",
      components:[{type:18,label:"Which car are you racing in?",component:{
        type:3,custom_id:"car",placeholder:"Select your F1 team",
        options:matches.map(({field,index})=>({label:field.name,value:String(index)}))
      }}]
    }});
  }
  const placement = team && eligible ? "Full-time" : "Reserve";
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
          p_full_time:placement==="Full-time",p_f1:interaction.message.embeds?.some(embed=>embed.title==="Team roles" && ["F1","F2"].includes(embed.footer?.text)) ?? false,
          p_out:Boolean(checkingOut)
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
