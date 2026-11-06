const appId = "1004676760815796334";
const publicKey = "009733d0f6a808d8c612002338884e15eaf68fd8adaffce335a503681a6e189f";
const bytes = (hex) => Uint8Array.from(hex.match(/../g), (pair) => parseInt(pair, 16));
const key = await crypto.subtle.importKey("raw", bytes(publicKey), "Ed25519", false, ["verify"]);
const encoder = new TextEncoder();
const api = "https://discord.com/api/v10";
const privateReply = (content) => Response.json({type: 4, data: {content, flags: 64, allowed_mentions: {parse: []}}});
const groups = ["Open lineup", "T1 Full Time", "T2 Full Time", "T3 Full Time", "T4 Full Time", "Realistic F1", "F2", "ACC", "LMU"];
const games = ["F1 25", "F1 2026 Season Pack", "F2 2025", "F2 2026", "ACC", "LMU"];

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
  const channel = Deno.env.get("F7R_DISCORD_ATTENDANCE_CHANNEL_ID");
  const token = Deno.env.get("F7R_DISCORD_BOT_TOKEN");
  if (!guild || !channel || !token) return privateReply("The F7R attendance channel still needs to be configured.");
  if (interaction.guild_id !== guild || !(BigInt(interaction.member?.permissions ?? "0") & 32n) &&
      !(BigInt(interaction.member?.permissions ?? "0") & 8n)) {
    return privateReply("This command is reserved for F7R staff with Manage Server permission.");
  }
  if (interaction.type === 2 && interaction.data.name === "start_check_in") {
    const options = Object.fromEntries((interaction.data.options ?? []).map(({name, value}) => [name, value]));
    if (!games.includes(options.game) || !groups.includes(options.lineup)) return privateReply("Choose a game and lineup.");
    const field = (id, label, max, required = true) => ({
      type: 1, components: [{type: 4, custom_id: id, label, style: 1, max_length: max, required}]
    });
    return Response.json({type: 9, data: {
      custom_id: "f7r-checkin:" + games.indexOf(options.game) + ":" + groups.indexOf(options.lineup),
      title: "F7R race check-in",
      components: [field("event", "Race name", 100), field("time", "Start time UTC (YYYY-MM-DD HH:mm)", 16), field("notes", "Optional notes", 500, false)]
    }});
  }
  const match = /^f7r-checkin:(\d):(\d)$/.exec(interaction.data?.custom_id ?? "");
  if (interaction.type !== 5 || !match) return privateReply("Unknown check-in action.");
  const game = games[Number(match[1])];
  const group = groups[Number(match[2])];
  const fields = Object.fromEntries(interaction.data.components.flatMap((row) => row.components ?? []).map(({custom_id, value}) => [custom_id, value.trim()]));
  const time = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(fields.time ?? "") ? Date.parse(fields.time.replace(" ", "T") + ":00Z") : NaN;
  if (!game || !group || !fields.event || !Number.isFinite(time) || time <= Date.now() ||
      new Date(time).toISOString().slice(0, 16).replace("T", " ") !== fields.time) {
    return privateReply("Enter a race name and a valid future start time in UTC. Run /start_check_in to try again.");
  }
  const timestampSeconds = Math.floor(time / 1000);
  const allowed_mentions = {parse: []};
  EdgeRuntime.waitUntil((async () => {
    let content = "Discord could not post the poll. Check the bot's channel permissions.";
    try {
      const response = await fetch(api + "/channels/" + channel + "/messages", {
        method: "POST",
        headers: {Authorization: "Bot " + token, "Content-Type": "application/json"},
        body: JSON.stringify({
          content: "**F7R driver attendance**\n" + fields.event + "\n" + game + " · " + group + "\n<t:" + timestampSeconds + ":F>" + (fields.notes ? "\n" + fields.notes : ""),
          allowed_mentions,
          nonce: interaction.id,
          enforce_nonce: true,
          poll: {
            question: {text: "Can you race?"},
            answers: ["Attending", "Reserve / unsure", "Unavailable"].map((text) => ({poll_media: {text}})),
            duration: 24, allow_multiselect: false, layout_type: 1
          }
        })
      });
      if (response.ok) {
        const {id} = await response.json();
        content = "Check-in posted. https://discord.com/channels/" + guild + "/" + channel + "/" + id;
      }
    } finally {
      await fetch(api + "/webhooks/" + appId + "/" + interaction.token + "/messages/@original", {
        method: "PATCH", headers: {"Content-Type": "application/json"}, body: JSON.stringify({content, allowed_mentions})
      });
    }
  })().catch(() => console.error("Discord check-in delivery failed.")));
  return Response.json({type: 5, data: {flags: 64}});
});
