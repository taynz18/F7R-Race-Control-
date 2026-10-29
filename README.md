# F7R Race Control — combined dashboard

**Start here: [Combined dashboard setup](F7R-DASHBOARD-SETUP.md).**

The home page now combines driver telemetry and live flag viewing. Approved race admins get flag controls within the same login. The existing Windows overlay and standalone admin desk are preserved. Telemetry needs the numbered dashboard SQL files and a game receiver; they are prepared for you to set up.

---

# F7R Race Control

**[Download the Windows driver app](https://github.com/taynz18/F7R-Race-Control-/releases/latest/download/RaceFlags-Windows.zip)** · **[Open the admin portal](https://taynz18.github.io/F7R-Race-Control-/)**

Drivers: download the ZIP, select **Extract All**, open the **RaceFlags** folder and run **RaceFlags.exe**. Keep the `_internal` folder alongside it. The connection to race control is included.

The website and Windows downloads now update automatically when their relevant files change on the main branch.

**Start with [START-HERE.md](START-HERE.md)** for the complete setup using the Supabase and GitHub websites, including the three numbered SQL queries and the driver build button.

The supplied `config.json` is configured for project `uyiafrzsyzrtnuxxjkye`. A read-only live check confirmed the current flag can be fetched and the driver can subscribe to Realtime. Public access to admin membership and history was denied as intended. The first GitHub Windows release passed the source tests and packaged overlay self-test. Admin sign-in and changing flags across devices still need testing with your admin account.

A Windows driver overlay and a browser admin portal. Supabase provides email/password sign-in, persistent flag state and Realtime delivery. GitHub distributes the driver download and can host the static admin portal on GitHub Pages. No separate Python server is needed.

## Start a fresh Supabase project

1. Open https://supabase.com/dashboard and create a project named **Race Flags**. Choose your preferred region and save the database password privately. Wait until the project is ready.
2. Open **SQL Editor**, paste the contents of `supabase/01-setup.sql`, and run it. This creates the tables, access policies, control function and Realtime publication. You can rerun the script without resetting flags or removing admins.
3. Open **Authentication → Users** and create your admin user with your email and a strong password. If available, mark the email confirmed. Keep the password private. Disable public user sign-ups in Authentication settings; driver accounts are not needed.
4. Copy `supabase/02-add-admin.sql` into a new SQL Editor query, replace the email placeholder with the email you just created, and run it. This approves the account to send flags.

5. Open the project's **Connect** dialog and copy its Project URL and **publishable key**. Put them in `config.json`:

   ```json
   {
     "supabase_url": "https://yourproject.supabase.co",
     "supabase_publishable_key": "sb_publishable_your_key_here"
   }
   ```

   These two values can be shared with drivers. Do not put the database password, admin password, secret key or service-role key in these files or on GitHub. The database rules allow drivers to read the current signal; approved admins alone can change it.

6. Run `supabase/03-check-access.sql` in SQL Editor. It checks public read access and verifies that drivers and unapproved users cannot change flags. It rolls back its test transaction.

The admin's email/password belongs to Supabase Auth. It is separate from your Supabase dashboard login and database password. No password is stored in the website source. Browser sessions stay in memory and clear when you reload or close the page.

## Open the admin portal locally

Install Python 3.12 with Tcl/Tk support, open a terminal in this folder, and run:

```powershell
python -m http.server 8080 --bind 127.0.0.1
```

Open http://localhost:8080/admin.html. Sign in with the approved admin account. Select a flag to send it to all connected drivers. **Clear flags** hides the overlays when drivers have transparent mode enabled. The current signal stays saved until an admin changes it, including across app restarts. A sign-in page without valid configuration shows a setup message and disables sign-in.

## Driver download

Download **RaceFlags-Windows.zip** from the latest GitHub Release, extract it, and run **RaceFlags/RaceFlags.exe** on Windows 10/11 x64. Keep the accompanying `_internal` folder beside it. Race control connects automatically using the configuration included in the build.

The compact controls have a Size slider, a Transparent mode switch and a Close Race Flags button. Minimise the controls while driving.

- Drag the centre of a flag to move it.
- Drag any edge or corner to resize it. Width and height can be adjusted separately.
- The Size slider scales the flag while keeping its current proportions.
- Transparent mode hides the overlay when race control clears the flag. Switch it off to show a positioning panel while no flag is active.
- The X on the flag and the Close Race Flags button both exit the entire local app.
- Position, width, height and transparent mode are remembered. A position on a disconnected monitor is recovered automatically.

Flags have smooth rounded corners, matching darker borders, a subtle colour gradient and a bundled Racing Sans One typeface. The font's SIL Open Font License and font information are included with the app.

Supported signals: Yellow, Safety Car, FCY (Full Course Yellow), Red, Green, Blue, White, Black, Chequered and Clear. This version sends one shared signal to all drivers.

An OFFLINE panel replaces the signal when race state cannot be read. Live changes arrive over Supabase Realtime; polling is used as a fallback when needed. Reconnection reloads the saved flag. Connection-loss detection can take roughly ten seconds.

Use a windowed or borderless-windowed game; exclusive fullscreen can cover desktop overlays. Active flags can intercept clicks. Delivery to individual drivers is not confirmed. Validate the app with your race group.

Preferences live under `%LOCALAPPDATA%/RaceFlags/settings.json`. Existing size and position preferences are migrated. No admin password is stored by the driver app.

For a local visual demo, run `RaceFlags.exe --demo`. Demo mode displays a LOCAL PREVIEW label and never connects to a race. A source bundle contains no prebuilt executable; use the latest release download above.

## Publish through GitHub

Create a GitHub repository and upload this folder's **contents**, including the hidden `.github` directory. Keep `driver.py`, `config.json` and `.github` at the repository root. Do not upload Python caches, your environment or the downloads folder; releases supply the executable.

### Admin portal on GitHub Pages

1. Open repository **Settings → Pages** and choose **GitHub Actions** as the source.
2. Open **Actions → Publish admin portal → Run workflow**.
3. Open the URL from the completed deployment, adding `/admin.html`.

This workflow publishes only the five website/configuration files. The sign-in page is public; account authentication and database permissions protect flag controls. The admin page loads a pinned Supabase client from jsDelivr and optional fonts from Google Fonts.

### Windows driver releases

Open **Actions → Windows driver release → Run workflow**, enter a new version such as `v1.0.0`, and run it. Pushing a version tag also starts the build. The release workflow installs the pinned dependencies, runs connection tests, builds a Windows app folder, and attaches `RaceFlags-Windows.zip` to a GitHub Release. Drivers download it from **Releases**. Configuration is bundled at build time. GitHub Actions needs permission to write repository contents. The executable is unsigned; Windows may show an unsigned-app notice.

Manual source run and build:

```powershell
python -m pip install -r requirements.txt
python driver.py
python -m unittest discover -s tests -v
python -m pip install pyinstaller==6.22.3
python -m PyInstaller --onedir --windowed --add-data "config.json;." --add-data "assets;assets" --name RaceFlags driver.py
```

The manual build appears in `dist`. Use the repository's release workflow if your local Python lacks Tcl/Tk files.

## Verification and limits

Automated tests cover configuration validation, rejecting secret keys, revision ordering, offline state, read-only transport and compatibility with the installed Supabase Python SDK. The GitHub Windows build passed its packaged overlay self-test. This source bundle contains no executable; use the release download above. The source driver UI smoke check covers all flags, matching borders, transparent clear, preview, resizing and saved settings. SQL files have been parsed for syntax. Live public reads and a Realtime subscription were verified against the configured project, along with anonymous access being denied for admin membership and history. Admin sign-in, write permissions and delivery across devices still need checking; no project or admin account was created by this download.

After connecting your project, sign in, send Yellow, Safety Car, FCY, Red and Green, then clear flags. Verify a second driver joining late sees the saved flag. Disconnect and reconnect a driver to check the offline indicator and recovery. Run `03-check-access.sql` before sharing the download.

Supabase documentation: [Project setup and Realtime](https://supabase.com/docs/guides/realtime/postgres-changes), [email/password sign-in](https://supabase.com/docs/reference/javascript/auth-signinwithpassword), [publishable versus secret keys](https://supabase.com/docs/guides/getting-started/api-keys).




## Live messages and automatic FCY restart

Existing projects: run `supabase/upgrade-live-messages.sql` once in the Supabase SQL Editor.
New projects: run `supabase/setup.sql`, then the same upgrade, then approve your admin.
The upgrade is transactional and preserves the current flag and history.

In the admin flag desk, type up to 120 characters in Flag message. Choose a flag
to send it with that message, or click Update live message to change the current
message without resetting the live timer or FCY deadline. Blank removes the message.

For a timed restart enter a positive whole number of seconds and click Start FCY
countdown. The server stores a single deadline and a Cron job checks it every
second. At FCY expiry it stays yellow and becomes FCY ACTIVE; Prepare to race expires to GREEN, clears the message,
and records an Automatic restart in history. Delivery can follow by up to one
scheduler tick plus network delay; clients wait for the confirmed GREEN signal.
Closing the admin browser does not cancel the countdown. Choosing any other
flag replaces the deadline; Cancel timer keeps FCY active without a countdown.
Concurrent/stale admin edits are rejected rather than overwriting a newer signal.
Drivers use server clock synchronization and show OFFLINE on lost connections.

Drivers must download the current Windows release for messages/countdowns.
Older driver versions still receive flag changes, including automatic GREEN.
Run `supabase/test-live-messages.sql` for rollback-only verification of messages,
automatic GREEN, cancellation, validation and access controls.



## FCY activation and Prepare to race countdowns
Run `supabase/upgrade-countdown-phases.sql` after the live-messages upgrade on an existing project.
The applied hosted migration is also saved under `supabase/migrations/20261029115307_split_fcy_activation_and_prepare_restart.sql`.

* FCY countdown: yellow FCY and seconds remaining, then yellow FCY ACTIVE. It stays yellow.
* Prepare to race countdown: half yellow, half green with PREPARE TO RACE and seconds remaining, then fully green.
* Both timers run on the server and work with the browser closed. A new flag cancels a pending timer.
* Cancel timer keeps the current signal and removes its deadline. Messages can be edited without restarting a timer.
* Driver colour names are removed. Safety Car, FCY and Prepare to race retain their labels. Custom messages still appear.
* Chequered flags use smaller squares.

All drivers must update their Windows flag overlay to display Prepare to race correctly; older clients cannot display this new signal.
