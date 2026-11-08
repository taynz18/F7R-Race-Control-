import { refreshDiscordRoster, readPostConfig } from "../_shared/discord-roster.js";
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
  const button = interaction.type === 3 && /^f7r-team-(rsvp|out|hyper|gt3):(\d{10,13})(?::[a-f0-9]{24})?$/.exec(customId);
  const picker = interaction.type === 5 && /^f7r-(f1|hyper|gt3|acc)-car:(\d{10,13})$/.exec(customId);
  if ((!button && !picker) || interaction.message?.author?.id !== appId || !interaction.member?.user?.id) {
    return privateReply("Open the F7R race check-in and try again.");
  }
  const deadline = button ? button[2] : picker[2];
  if (Date.now() >= Number(deadline) * 1000) return privateReply("Check-in closed when the race started.");
  const checkingOut = button && button[1] === "out";
  const member = interaction.member;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const config = await readPostConfig(interaction.message,guild,service).catch(()=>null);
  if (!config) return privateReply("The check-in settings could not load. Please try again.");
  const isF1 = config.game === "F1";
  const isAcc = config.game?.startsWith("Assetto Corsa") && config.fields.some(field=>field.name.startsWith("GT3 · "));
  const choice = button ? button[1] : picker[1];
  const raceClass = choice==="hyper" ? "Hypercar" : choice==="gt3" ? "LMGT3" : "";
  const mapped = config.fields;
  if (raceClass && (config.game!=="Le Mans Ultimate" || !mapped.some(field=>field.name.startsWith(raceClass+" · ")))) {
    return privateReply("That class is unavailable for this race.");
  }
  const openEntry = config.openEntry === true;
  const matches = mapped.map((field,index)=>({field,index})).filter(({field})=>
    (!raceClass || field.name.startsWith(raceClass+" · ")) && (openEntry || [...field.value.matchAll(/<@&(\d{17,20})>/g)].some(([,id])=>member.roles.includes(id))));
  const eligible = openEntry || !config.fullTimeId || member.roles.includes(config.fullTimeId);
  let team = matches.length === 1 ? matches[0].field.name : null;
  if (picker) {
    const selection = interaction.data.components?.filter(row=>/^car(?:-\d+)?$/.test(row.component?.custom_id ?? "")).flatMap(row=>row.component.values ?? []);
    const chosen = selection?.length === 1 && matches.find(({index})=>String(index)===selection[0]);
    if ((picker[1]==="acc" ? !isAcc : !isF1 && !raceClass) || !eligible || !chosen) return privateReply("That car is no longer available to you for this race. Try check-in again.");
    team = chosen.field.name;
  } else if (!checkingOut && eligible && (openEntry || matches.length > 1)) {
    if (!isF1 && !raceClass && !isAcc) return privateReply("You have two car roles for this lineup. Ask an F7R admin to check them.");
    if (!matches.length) return privateReply("There are no cars to choose for this class.");
    if ((!openEntry && matches.length > 25) || matches.length > 125) return privateReply("Too many car choices are available for this event.");
    const groups = [];
    for (let index=0; index<matches.length; index+=25) groups.push(matches.slice(index,index+25));
    return Response.json({type:9,data:{
      custom_id:"f7r-"+(raceClass ? choice : isAcc ? "acc" : "f1")+"-car:"+deadline,
      title:raceClass ? "Choose your "+raceClass+" car" : isAcc ? "Choose your ACC GT3 model" : "Choose your car for this F1 race",
      components:groups.map((group,index)=>({type:18,
        label:groups.length===1 ? "Which car are you racing in?" : "Car list "+(index+1)+" · choose from one list",
        component:{type:3,custom_id:"car-"+index,placeholder:"Select your car",
          ...(groups.length>1?{required:false,min_values:0}:{}),
          options:group.map(({field,index})=>({label:raceClass ? field.name.slice(raceClass.length+3) : isAcc ? field.name.slice(6) : field.name,value:String(index)}))}
      }))
    }});
  }
  const placement = team && eligible ? "Full-time" : "Reserve";
  EdgeRuntime.waitUntil((async () => {
    let content = "Could not save your check-in. Please try again.";
    try {
      const result = await fetch(Deno.env.get("SUPABASE_URL") + "/rest/v1/rpc/f7r_record_discord_check_in", {
        method:"POST",
        headers:{apikey:service,Authorization:"Bearer "+service,"Content-Type":"application/json"},
        body:JSON.stringify({
          p_guild:guild,p_message:interaction.message.id,p_driver:member.user.id,
          p_name:member.nick || member.user.global_name || member.user.username,p_team:team || raceClass || null,
          p_full_time:checkingOut ? !openEntry && Boolean(config.fullTimeId) && eligible : placement==="Full-time",p_f1:["F1","F2"].includes(config.game),
          p_out:Boolean(checkingOut)
        })
      });
      if (result.ok) {
        const outcome = await result.json();
        content = checkingOut ? outcome + "." : openEntry ? "You\'re checked in · " + team + "." : "You're checked in as **" + outcome + "**" + (placement === "Full-time" && team ? " · " + team : raceClass ? " · " + raceClass : "") + ".";
        if ((raceClass || openEntry) && !checkingOut) {
          const query = new URLSearchParams({select:"team",guild_id:"eq."+guild,
            message_id:"eq."+interaction.message.id,driver_id:"eq."+member.user.id});
          const recorded = await fetch(Deno.env.get("SUPABASE_URL")+"/rest/v1/f7r_discord_check_ins?"+query,
            {headers:{apikey:service,Authorization:"Bearer "+service}});
          const recordedTeam = recorded.ok ? (await recorded.json())[0]?.team : null;
          const recordedClass = /^(Hypercar|LMGT3)(?: · |$)/.exec(recordedTeam ?? "")?.[1];
          if (openEntry && recordedTeam && recordedTeam!==team) content = "You\'re already checked in with "+recordedTeam+". Select Not participating first to change cars.";
          else if (recordedClass && raceClass && recordedClass!==raceClass) content = "You're already checked in for "+recordedClass+". Select Not participating first to change class.";
        }
        if (!await refreshDiscordRoster(interaction,guild,service,config).catch(()=>false)) {
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
