# OrbusGameMaster

A local admin console for **your own OrbusVR: Reborn Community Server**. v0.2 is a development preview with a command dashboard, player administration, item catalogue, and Docker monitoring.

## Included in v0.2

- Character account lookup by exact name (the server's `accountfor` command).
- Rename character, assign surname, reset position, restore deleted character, ban/unban account.
- Item catalogue search, type/rarity filters, category fallback icons and favourites for the current tab.
- Item bundles (up to 12 entries) issued sequentially. They stop at the first failed Docker command; **partial changes are possible**, and command success does not guarantee inventory changes.
- Announcement templates and a 160-character server-wide broadcast.
- Docker Compose service status, available CPU/RAM stats, tail of game/API logs and local audit events.
- Restart of game/API containers with explicit confirmation.
- Strict allowlisted admin operations, no shell execution, bearer token in a header, local-only bind to 127.0.0.1, and optional read-only mode.

## Start on Windows

Requires Node.js 20+, Docker Desktop, a running [Community Server](https://github.com/orbusvr-community/reborn-server) installation and access to its server folder.

```powershell
git clone https://github.com/Hor1zonVR/OrbusGameMaster.git
cd OrbusGameMaster
.\Start-GameMaster.ps1 -ServerDir "C:\path\to\reborn-server"
```

Open http://127.0.0.1:4177 and enter the token printed by PowerShell. The launcher opens the page for you. Use `-ReadOnly` to disable state-changing actions:

```powershell
.\Start-GameMaster.ps1 -ServerDir "C:\path\to\reborn-server" -ReadOnly
```

If you already cloned this repository, run `git pull` to update after v0.2 has been merged.

Never expose port 4177 to other machines or share the token. This console can make real changes to accounts and characters. **Back up your server database before testing destructive admin operations.**

## Supported vs planned

Supported server commands were checked against the [community server documentation](https://github.com/orbusvr-community/reborn-server#admin-tools). This dashboard uses Docker Compose to execute commands in the `api` and `game` containers. It does **not** install a custom component in `mods/components`.

This build does **not** yet include an online player list, arbitrary level/XP edits, direct player scaling, teleport controls, boss spawning, or RebornCamera spectator integration. These need verified server data and/or new server-side code. The account lookup response is returned as text, not misrepresented as a complete player profile.

Item icons are lightweight locally generated category symbols, not exported Orbus game assets. Favourites and presets are not synced between sessions. Item bundles have no undo/rollback.

## Developer checks

```powershell
npm test
node --check src/server.mjs
node --check public/app.js
```

The tests mock Docker commands; integration with a live Community Server must be verified by the server owner.

## Security notes

The local dashboard binds to 127.0.0.1 and requires a random access token on every launch unless `GM_TOKEN` is set. Requests are audited to `logs/audit.jsonl` (Git-ignored). The UI does not render arbitrary server content as HTML. Admin actions are validated and composed as fixed Docker argument arrays, not shell command strings.

## Roadmap

- Verify live player visibility from supported server hooks.
- Investigate character level, equipment and inventory retrieval.
- Investigate avatar scale controls, event spawns and GameMaster control from RebornCamera.
- Improve item visuals using permissible original asset art.
