# RLT League Archive and automatic sync

## Stored data
The shared League Archive reads all imported seasons from `public.f7r_league_archive`. Permanent signed-in drivers and admins can read it; visitors, anonymous accounts and browser writes are denied. Local review files remain separate.

Each gzip/base64 snapshot contains RLT season details, standings (history, deep ratings and teammates requested), lineups and every event (deep ratings requested). Original source points and missing records are preserved. Season IDs prevent duplicate imports. No RLT source records are changed or deleted.

## Automatic updates
Supabase Cron invokes `f7r-rlt-sync` every two minutes. The worker reads the RLT change feed, discovers new seasons and queues affected seasons. League-wide driver/team edits or a change-feed gap queue all available seasons. A complete season is fetched and compressed before replacing its saved snapshot. It processes one season per run, so a burst of changes takes multiple runs.

The queue persists across failures. A global expiring lease prevents overlapping imports. Failed seasons wait five minutes; API 503 responses have bounded short retries and 429 responses back off. Existing data stays available. As a fallback, current seasons are refreshed after six hours and archives after seven days.

The archive page checks status and saved data every minute while visible, adds new seasons to its selector and reloads the selected season when its saved version changes. It preserves the selected event/session where possible.

## Credentials and access
The RLT API key and scheduler token are encrypted in Supabase Vault. They are never sent to browsers or committed to GitHub. The scheduler sends its private token to the worker; the worker checks a SHA-256 digest before using any database access. The service-only RPC checks the service JWT role and has no driver or anonymous EXECUTE grant. Internal queue/state tables are in an unexposed private schema.

The one-time setup RPC was dropped and setup/upload endpoints retired after configuration. Rotating the RLT key requires securely updating the Vault entry `f7r_rlt_api_key`; do not revoke the active key unless replacing it.

## Operations
`supabase/rlt-sync.sql` defines the internal queue, state and protected RPCs. `supabase/rlt-sync-schedule.sql` installs the schedule. `tests/rlt-sync.test.mjs` covers targeted/global changes, complete snapshot writes, failures, overlap protection and unauthorized requests.

To pause: `select cron.alter_job((select jobid from cron.job where jobname='f7r-rlt-archive-sync'),active:=false);`

To resume: use the same command with `active:=true`.

This sync follows results uploaded to RLT Cloud. Live game UDP telemetry continues through the F7R receiver.
