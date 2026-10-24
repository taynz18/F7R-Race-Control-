# Driver sign-up update

Drivers now create their own accounts from the home page and view telemetry without membership approval. Only approved admins/publishers can create races or send telemetry, and only flag_admins can send flags. The receiver account is formula7racing@gmail.com. Public sign-up is enabled in Supabase; anonymous sign-in remains disabled. An initial F7R Live Race is assigned to that receiver. The SQL upgrade is dashboard-06-open-driver-signup.sql; it has been applied to the live project. Earlier membership-approval instructions below apply to privileged receiver/admin roles, not ordinary viewers.

---

# Combined F7R Race Control
The repository now contains one browser app for driver telemetry and live flags,
with admin-only flag controls. Your Windows flag overlay and the standalone
admin.html desk remain available.

## What is ready
- Root index.html is the combined driver/admin dashboard with the F7R logo.
- Drivers sign in once, select Live telemetry or Flags and view shared signals.
- Approved flag admins use the same login to send signals, update messages and
  start/cancel the existing server-owned FCY timer.
- ONLY public.flag_admins authorizes flag controls. A dashboard role named admin
  does not grant flag permissions. Supabase rechecks authority on every flag RPC.
- Existing flag_admins can still sign in to use flags before telemetry is set up.
- The receiver supports F1 25: 2026 Season Pack (24 cars) and 2025 UDP (22 cars).
- The existing public config points to project uyiafrzsyzrtnuxxjkye.
- No live flag was sent during development. No SQL or account setup was applied.

## Run the SQL yourself
Use the SAME existing F7R Race Control Supabase project. Do not run the old
01-setup.sql as a new-project setup. The existing flag system is already installed.

1. Run supabase/dashboard-01-setup.sql ONCE. It creates f7r_members,
   f7r_sessions and f7r_snapshots, RLS, validation and Realtime.
   It also gives existing flag admins approved dashboard membership.
   Existing flag state/history/functions are unchanged.
2. Create driver email/password accounts in Authentication > Users.
3. Run dashboard-02-approve-driver.sql for each driver after replacing email/name.
   Use driver for viewers and publisher for the receiver's account.
   A dashboard admin role controls race metadata, not flag authority.
4. Run dashboard-03-create-race.sql with the receiver's approved email.
   Copy the resulting race UUID for the receiver.
5. Run dashboard-04-check-access.sql and dashboard-05-test-permissions.sql.
   The latter creates temporary test records inside a transaction and rolls back.
6. Run supabase/test-live-messages.sql to verify the existing flag permissions
   and countdown behavior with its rollback-only tests.

These files are separate from your existing flag SQL. If the f7r_ tables already
exist, stop and inspect them before running setup again. A manually created
table named F7R Dashboard is not used or altered by this application.

To grant flag control to another person, create their auth account then use
the EXISTING supabase/02-add-admin.sql. Dashboard approval alone never grants
permission to send flags. Never share an admin login with all drivers.

## Open the combined app
Root index.html is the new home page. GitHub's existing Pages workflow deploys
the combined dashboard plus the legacy flag desk when website files change.
The URL remains https://taynz18.github.io/F7R-Race-Control-/.
The old /admin.html address remains a standalone flag desk with its own login;
normal use of the combined app needs only one login.

The same flag signal is league-wide and shared across all telemetry sessions.
It is not scoped to the currently selected telemetry race.
All approved drivers see the race data. Flags controls are hidden and disabled
for drivers, while the live flag banner and viewing page remain available.
Console drivers can use a phone/tablet/computer; the Windows overlay is optional.
Countdowns never turn GREEN in the browser: the existing server must confirm it.

## Local use
Install Node.js 24 LTS from the official source, then run npm start in this folder.
Open http://127.0.0.1:4173. Demo mode is marked and never connects to live flags
or uploads telemetry. Sign in normally for the real flag system.

## Receiver
Run one receiver computer receiving UDP from a participant in the same game lobby.
Console UDP requires a computer on that console's local network.
Every driver must enable Your Telemetry: Public and Show online ID / gamertags.
Game settings: UDP On, Broadcast Off, Port 20777, Format 2026, IP = receiver PC.

PowerShell:

    $env:F7R_SESSION_ID = 'RACE_UUID_FROM_DASHBOARD_QUERY_03'
    $env:F7R_GAME_IP = '192.168.1.50'
    $env:F7R_RECEIVER_EMAIL = 'formula7racing@gmail.com'
    $credential = Get-Credential -UserName $env:F7R_RECEIVER_EMAIL -Message 'F7R receiver login'
    $env:F7R_RECEIVER_PASSWORD = $credential.GetNetworkCredential().Password
    try { npm run receiver } finally { Remove-Item Env:F7R_RECEIVER_PASSWORD -ErrorAction SilentlyContinue }

F7R_GAME_IP is the game PC/console, not the receiver IP. For a game on the same
computer, use 127.0.0.1 and configure the game's target IP accordingly.
Do not forward UDP to the internet. Restrict local firewall access to the private
network. Receiver tokens/passwords stay out of source. Only publishable API keys
belong in config.json. The account must be the publisher assigned to the race.

Create a new F7R session row and restart the receiver for each in-game session UID,
including qualifying-to-race changes. This prevents merging unrelated grids.
Uploads are about twice per second, with a five-second polling fallback in the
viewer and an eight-second stale warning. This is a starting rate to benchmark.

Names come from game sharing. Where unavailable or generic, query 03 has a
verified per-race slot-name mapping. A website login does not automatically
prove the associated in-game car. Restricted readings show Private; missing
readings show a dash. Genuine zero remains zero.

ERS comes as joules. Set F7R_ERS_CAPACITY_J only after verifying full capacity
for the selected cars/regulations in game; until then the site shows MJ.
Boost mode and 2026 overtake status are separate from remaining battery energy.

## Validation and remaining work
npm test runs decoder/model/UI/controller checks plus the existing flag desk test.
GitHub checks test source automatically; the Windows release workflow is unchanged.
The SQL files still need owner execution and their database permission tests.
A real mixed-platform lobby, driver logins and cross-device flag delivery must be
verified before racing. The published sign-in and demo layouts were visually checked. Real driver/admin
logins and cross-device flag delivery still need owner verification.
No development test sends real flags.

The separate F7R-dashboard repository is an earlier prototype; this combined
repository is now the app to continue developing.

