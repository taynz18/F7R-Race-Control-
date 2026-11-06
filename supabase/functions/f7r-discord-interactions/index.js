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
  const rsvp = /^f7r-team-rsvp:(\d{10,13})$/.exec(interaction.data?.custom_id ?? "");
  if (interaction.type !== 3 || !rsvp || interaction.message?.author?.id !== appId || !interaction.member?.user?.id) {
    return privateReply("Create your race check-in from the Race Control admin dashboard.");
  }
  if (Date.now() >= Number(rsvp[1]) * 1000) return privateReply("Check-in closed when the race started.");
  const member = interaction.member;
  const mapped = interaction.message.embeds?.find(embed=>embed.title==="Team roles")?.fields ?? [];
  const matches = mapped.filter(field => [...field.value.matchAll(/<@&(\d{17,20})>/g)].some(([,id])=>member.roles.includes(id)));
  if (matches.length > 1) return privateReply("You have more than one matching team role. Ask an F7R admin to check your roles.");
  const team = matches[0]?.name ?? null;
  const placement = team ? "Full-time" : "Reserve";
  EdgeRuntime.waitUntil((async () => {
    let content = "Could not save your check-in. Please try again.";
    try {
      const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      const result = await fetch(Deno.env.get("SUPABASE_URL") + "/rest/v1/f7r_discord_check_ins", {
        method:"POST",
        headers:{apikey:service,Authorization:"Bearer "+service,"Content-Type":"application/json",Prefer:"resolution=merge-duplicates"},
        body:JSON.stringify({
          guild_id:guild, message_id:interaction.message.id, driver_id:member.user.id,
          driver_name:member.nick || member.user.global_name || member.user.username, placement, team
        })
      });
      if (result.ok) content = "You're checked in as **" + placement + "**" + (team ? " · " + team : "") + ".";
    } finally {
      await fetch(api+"/webhooks/"+appId+"/"+interaction.token+"/messages/@original", {
        method:"PATCH",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({content,allowed_mentions:{parse:[]}})
      });
    }
  })().catch(()=>console.error("Discord check-in response failed.")));
  return Response.json({type:5,data:{flags:64}});
});
