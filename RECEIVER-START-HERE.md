# Continuous live feed — receiver 0.1.7 and later

The website automatically follows the active shared feed. There is no race picker. The receiver now follows game session changes, including qualifying to race, without creating fresh F7R race entries. Keep one receiver connected and keep the admin telemetry switch on. New game data replaces the previous live snapshot; this is a live display, not a race archive. Driver and guest viewers remain read-only.

# F7R Windows receiver

For the sign-in window and automatic game detection, download **F7R-Receiver-Windows.zip** from the [F7R Receiver releases](https://github.com/taynz18/F7R-Race-Control-/releases?q=f7r-receiver). Extract the entire ZIP and open **F7R Receiver.exe**. No Node.js installation is needed. Sign in, choose your assigned live race, and click Connect receiver. Then use Start live telemetry in the admin dashboard.

# Start the F7R live receiver on Windows

1. Download this repository using Code > Download ZIP, then extract it.
2. Install Node.js 24 LTS from https://nodejs.org if it is not installed.
3. Connect this laptop to the same local network as the game.
4. Close Racing League Tools before starting F7R: both normally use UDP port 20777.
5. In F1 enable UDP Telemetry, Broadcast Mode, format 2026, port 20777, Public telemetry and player names.
6. Double-click START-F7R-RECEIVER.cmd in the extracted folder.
7. Press Enter for the initial F7R Live Race and automatic game-device detection.
8. Press Enter for the default receiver email, then type your F7R account password in the terminal and press Enter. Password characters stay hidden and are not saved to files.
9. Allow the receiver on your private home network if Windows Firewall asks, then enter a game session.

The window should say "Game feed found" then "Publishing frame" with a driver count. Leave it open while racing. All viewers can open https://taynz18.github.io/F7R-Race-Control-/ and continue as guest.

Automatic detection locks to the first supported packet matching the race format (and existing game session, if present). If another F1 game runs on your network, enter your game's device IP instead. Restart to change device.

If broadcast does not reach the laptop, turn Broadcast Off and set the game's UDP destination to the laptop's displayed IPv4 address. Do not use 127.0.0.1 unless the game and receiver run on the same computer. Guest Wi-Fi isolation or firewall settings can block local traffic.

If Racing League Tools must run too, configure its UDP forwarding to this receiver on a different port and set F7R_UDP_PORT accordingly before launching. Do not assume both apps can share 20777.

A new game session (including qualifying to race) currently requires a new F7R race record and receiver restart. Enter the new race UUID in the launcher. The default race ID is only for the initial F7R Live Race. Real game compatibility still needs a live test.

## Dashboard Start / Stop controls
After launching the receiver and signing in, it waits in paused mode. Open the dashboard, sign in as an approved flag admin, select the live race and click Start live telemetry. Stop live telemetry pauses uploads; leave the receiver window open to start again. Closing the window shows Receiver offline after 20 seconds. Control changes are polled every two seconds; the database also blocks uploads while stopped. Download a fresh ZIP for this receiver version.

## Windows script policy
The main launcher uses Node.js directly, so it does not require PowerShell scripts or a change to Windows execution policy. Download and extract the latest ZIP if you previously saw a launch.ps1 scripts-disabled error. There is no separate Windows sign-in box in this version; enter the password at the hidden terminal prompt.

## Run alongside RLT
Choose **Via RLT forwarding** in F7R (listening port **21777**). Keep RLT listening on **20777**, then add RLT UDP forwarding target **127.0.0.1:21777** if both apps use the same laptop. For a second PC, target the F7R PC's local IP instead. Leave F7R Source IP blank. Keep F1 feeding RLT as before. Connect the receiver and enable telemetry in the dashboard. No router port forwarding is needed.

## Live circuit map
Use a receiver release with motion support (f7r-receiver-0.1.4 or later). The dashboard reads EA world X/Z positions and draws team-coloured driver dots; select a dot for driver details. The outline is learned from on-track position samples ordered by lap distance, up to 192 points. It fills in as cars cover the circuit; unknown sections stay disconnected. Pit-lane samples do not reshape the outline. Stale positions are marked, never extrapolated. Missing motion packets show a waiting message. RLT forwarding must forward motion packets too. Circuit logos are separate from outline geometry; supplied folder contains logos rather than track maps. The design demo uses explicitly labelled simulated geometry.

Circuit names were checked against https://www.formula1.com/en/racing/2026 and telemetry fields against EA's official 2026 Season Pack specification. Unrecognised track IDs retain a neutral ID label; no logo is guessed.
