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

After a successful GitHub release build, download and extract `RaceFlags-Windows.zip`, then run `RaceFlags/RaceFlags.exe` on Windows 10/11 x64. Keep the accompanying `_internal` folder beside the executable. On first launch, enter your league's Supabase project URL and publishable key, then click **Connect to race control**. This source bundle has no prebuilt Windows executable. A GitHub release built after you edit `config.json` will connect to your league automatically.

Keep the settings window open or minimise it while driving. Close it to exit the overlay.

- Drag the visible overlay anywhere, including onto another monitor. Its position and size are saved.
- Use the size slider to resize the flag.
- Enable **Position / preview mode** to reveal a positioning panel while no flag is active.
- Enable **Transparent when no flag is active** to hide the overlay after Clear flags.
- Use **Bring overlay back to this screen** if a saved position is on a disconnected monitor.
- The settings window reports connection status. An OFFLINE panel replaces the signal if state cannot be read. Normal health checks run every five seconds, with a five-second request timeout. A connection loss can therefore take roughly ten seconds to show.
- Live changes arrive over Supabase Realtime. If WebSockets are unavailable, a two-second polling fallback reads the saved state. Reconnection reloads the current flag.

Supported signals: Yellow, Safety Car, FCY (Full Course Yellow), Red, Green, Blue, White, Black, Chequered and Clear. Each coloured panel has a darker matching border; Chequered uses an actual black/white pattern. One shared race session is supported per Supabase project. All flags, including Black and Blue, go to all drivers.

The app works as an always-on-top Windows overlay. Use windowed or borderless-windowed games; exclusive fullscreen may cover it. Active flags are draggable and can intercept clicks. The app has no delivery acknowledgment, simulator integration or individual-driver targeting. Validate it with your race group before using it during an event.

Settings are stored under `%LOCALAPPDATA%/RaceFlags/settings.json`. They contain the public connection details and overlay preferences, never an admin password. Restart the app to change projects after connecting.

For a local visual demo, run `RaceFlags.exe --demo`. Demo mode displays a LOCAL DEMO label and does not connect to a race.

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
python -m PyInstaller --onedir --windowed --add-data "config.json;." --name RaceFlags driver.py
```

The manual build appears in `dist`. Use the repository's release workflow if your local Python lacks Tcl/Tk files.

## Verification and limits

Automated tests cover configuration validation, rejecting secret keys, revision ordering, offline state, read-only transport and compatibility with the installed Supabase Python SDK. The GitHub Windows build passed its packaged overlay self-test. This source bundle contains no executable; use the release download above. The source driver UI smoke check covers all flags, matching borders, transparent clear, preview, resizing and saved settings. SQL files have been parsed for syntax. Live public reads and a Realtime subscription were verified against the configured project, along with anonymous access being denied for admin membership and history. Admin sign-in, write permissions and delivery across devices still need checking; no project or admin account was created by this download.

After connecting your project, sign in, send Yellow, Safety Car, FCY, Red and Green, then clear flags. Verify a second driver joining late sees the saved flag. Disconnect and reconnect a driver to check the offline indicator and recovery. Run `03-check-access.sql` before sharing the download.

Supabase documentation: [Project setup and Realtime](https://supabase.com/docs/guides/realtime/postgres-changes), [email/password sign-in](https://supabase.com/docs/reference/javascript/auth-signinwithpassword), [publishable versus secret keys](https://supabase.com/docs/guides/getting-started/api-keys).



