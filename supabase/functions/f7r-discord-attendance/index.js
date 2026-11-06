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
    if (!["check", "post", "register"].includes(input?.action)) return reply({error: "Invalid action."}, 400);
    const token = Deno.env.get("F7R_DISCORD_BOT_TOKEN");
    const guild = Deno.env.get("F7R_DISCORD_SERVER_ID");
    const channel = Deno.env.get("F7R_DISCORD_ATTENDANCE_CHANNEL_ID");
    if (!token || !snowflake(guild) || !snowflake(channel)) {
      return reply({error: "Set the bot token, server ID and attendance channel ID in Supabase."}, 503);
    }
    const channelUrl = "https://discord.com/api/v10/channels/" + channel;
    const discordHeaders = {Authorization: "Bot " + token, "Content-Type": "application/json"};
    const targetResponse = await fetch(channelUrl, {headers: discordHeaders});
    if (!targetResponse.ok) return reply({error: "Discord could not open the configured channel. Check the bot token and channel access."}, 502);
    const target = await targetResponse.json();
    if (target.guild_id !== guild || target.type !== 0) {
      return reply({error: "Choose a text channel in the configured F7R server."}, 400);
    }
    if (input.action === "check") return reply({channel: target.name});
    if (input.action === "register") {
      const choices = (name, description, labels) => ({
        type: 3, name, description, required: true,
        choices: labels.map((label) => ({name: label, value: label}))
      });
      const command = await fetch("https://discord.com/api/v10/applications/1004676760815796334/guilds/" + guild + "/commands", {
        method: "POST", headers: discordHeaders,
        body: JSON.stringify({
          name: "start_check_in", description: "Set up an F7R race attendance poll",
          type: 1, default_member_permissions: "32",
          options: [
            choices("game", "Choose a game", ["F1 25", "F1 2026 Season Pack", "F2 2025", "F2 2026", "ACC", "LMU"]),
            choices("lineup", "Choose a driver lineup or tier", ["Open lineup", "T1 Full Time", "T2 Full Time", "T3 Full Time", "T4 Full Time", "Realistic F1", "F2", "ACC", "LMU"])
          ]
        })
      });
      if (!command.ok) return reply({error: "Discord rejected registration. Check that the F7R app is installed in this server."}, 502);
      return reply({registered: true});
    }
    const {title, startsAt, hours, notes} = input;
    if (typeof title !== "string" || !title.trim() || title.length > 100 ||
        !Number.isSafeInteger(startsAt) || startsAt <= Date.now() || startsAt > 8640000000000000 ||
        !Number.isInteger(hours) || hours < 1 || hours > 168 ||
        typeof notes !== "string" || notes.length > 500) {
      return reply({error: "Enter an event name, future race time and a voting window from 1 to 168 hours."}, 400);
    }
    const timestamp = Math.floor(startsAt / 1000);
    const message = await fetch(channelUrl + "/messages", {
      method: "POST",
      headers: discordHeaders,
      body: JSON.stringify({
        content: "**F7R driver attendance**\n" + title.trim() + "\n<t:" + timestamp + ":F> (<t:" + timestamp + ":R>)" + (notes.trim() ? "\n" + notes.trim() : ""),
        allowed_mentions: {parse: []},
        poll: {
          question: {text: "Can you race?"},
          answers: ["Attending", "Reserve / unsure", "Unavailable"].map((text) => ({poll_media: {text}})),
          duration: hours,
          allow_multiselect: false,
          layout_type: 1
        }
      })
    });
    if (!message.ok) {
      const reason = message.status === 429 ? "Discord is rate limiting requests. Try again shortly." : "Discord rejected the poll. Check Send Messages and Create Polls permissions.";
      return reply({error: reason}, 502);
    }
    const posted = await message.json();
    return reply({url: "https://discord.com/channels/" + guild + "/" + channel + "/" + posted.id});
  } catch {
    return reply({error: "Discord attendance service is unavailable."}, 502);
  }
});
