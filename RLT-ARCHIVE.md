# RLT League Archive

The shared League Archive reads imported RLT season snapshots from `public.f7r_league_archive`. Permanent signed-in driver and admin accounts can read; visitors, anonymous accounts and browser writes are denied.

Each payload is the complete JSON received for season details, standings (history, deep ratings and teammates requested), lineups and every event (deep ratings requested). It is stored as gzip/base64 and decompressed only when a season is selected. Original source points and missing records are preserved. This is a snapshot import, not automatic ongoing synchronisation.

`scripts/import-rlt.mjs` retrieves a resumable local backup with `RLT_API_KEY` set in the process environment. It never prints or writes the key. Never commit keys or source data to the public repository. The one-off upload endpoint is retired after import. Local review files on the archive page remain separate from the shared source records.

The API key should be revoked after a one-off import if it was shared in a chat. A future refresh should use a new securely supplied key. Season IDs are stable keys for repeat imports; an import must fully fetch a season before replacing its shared snapshot.
