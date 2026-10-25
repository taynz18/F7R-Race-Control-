# Start the F7R live receiver on Windows

1. Download this repository using Code > Download ZIP, then extract it.
2. Install Node.js 24 LTS from https://nodejs.org if it is not installed.
3. Connect this laptop to the same local network as the game.
4. Close Racing League Tools before starting F7R: both normally use UDP port 20777.
5. In F1 enable UDP Telemetry, Broadcast Mode, format 2026, port 20777, Public telemetry and player names.
6. Double-click START-F7R-RECEIVER.cmd in the extracted folder.
7. Press Enter for the initial F7R Live Race and automatic game-device detection.
8. Sign in with the assigned receiver account. Passwords are not saved to files.
9. Allow the receiver on your private home network if Windows Firewall asks, then enter a game session.

The window should say "Game feed found" then "Publishing frame" with a driver count. Leave it open while racing. All viewers can open https://taynz18.github.io/F7R-Race-Control-/ and continue as guest.

Automatic detection locks to the first supported packet matching the race format (and existing game session, if present). If another F1 game runs on your network, enter your game's device IP instead. Restart to change device.

If broadcast does not reach the laptop, turn Broadcast Off and set the game's UDP destination to the laptop's displayed IPv4 address. Do not use 127.0.0.1 unless the game and receiver run on the same computer. Guest Wi-Fi isolation or firewall settings can block local traffic.

If Racing League Tools must run too, configure its UDP forwarding to this receiver on a different port and set F7R_UDP_PORT accordingly before launching. Do not assume both apps can share 20777.

A new game session (including qualifying to race) currently requires a new F7R race record and receiver restart. Enter the new race UUID in the launcher. The default race ID is only for the initial F7R Live Race. Real game compatibility still needs a live test.

## Dashboard Start / Stop controls
After launching the receiver and signing in, it waits in paused mode. Open the dashboard, sign in as an approved flag admin, select the live race and click Start live telemetry. Stop live telemetry pauses uploads; leave the receiver window open to start again. Closing the window shows Receiver offline after 20 seconds. Control changes are polled every two seconds; the database also blocks uploads while stopped. Download a fresh ZIP for this receiver version.
