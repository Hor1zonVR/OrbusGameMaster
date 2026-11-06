# OrbusGameMaster

Local Game Master dashboard for **your own OrbusVR: Reborn Community Server**.

## v0.1 development features

- See Docker Compose game/API service status and serverinfo.
- Search the actual local item catalogue.
- Give a character one existing item via the official updateinventory admin route.
- Broadcast a message to everyone online via the game REPL.
- Token-protected local-only browser UI, confirmation prompts, command validation and audit logging.

Ordinary players **do not need client-side mods** for item gifting or announcements.

## Install and run on Windows

Requirements: **Node.js 20+**, **Docker Desktop**, and a running [OrbusVR Community Server](https://github.com/orbusvr-community/reborn-server) installation.

Clone this repository:

    git clone https://github.com/Hor1zonVR/OrbusGameMaster.git
    cd OrbusGameMaster

Run it in PowerShell, replacing the path with the actual folder that contains your Orbus server's docker-compose.yml:

    .\Start-GameMaster.ps1 -ServerDir "C:\path\to\reborn-server"

Open http://127.0.0.1:4177 (the launcher normally opens this automatically). Copy the access token from the PowerShell window into the browser and click **Connect**.

You can also use a read-only session:

    .\Start-GameMaster.ps1 -ServerDir "C:\path\to\reborn-server" -ReadOnly

To stop GameMaster, press Ctrl+C in PowerShell.

## How it works

GameMaster runs on the **host PC**, calls Docker Compose from the Orbus server folder, and executes the official commands inside the appropriate containers.

- Server status: docker compose ps --format json
- Server info: docker compose exec -T api curl http://localhost:3000/serverinfo
- Item grant: docker compose exec -T api curl http://localhost:3000/admin/updateinventory/CHARACTER/ITEM_ID
- Announcement: docker compose exec -T game node orbus-server.js repl broadcast MESSAGE

These commands are documented by the Community Server project. Their success does not guarantee the requested in-game change occurred: verify grants and broadcasts in-game.

The official item catalogue currently identifies **Giant Growth Potion as item 103**. Giving a player the potion is not the same thing as directly setting their scale.

## Security

The dashboard binds only to **127.0.0.1** and requires a random token printed in PowerShell at each launch (unless GM_TOKEN is manually set). It rejects unsafe input and invokes Docker without a shell. Activity is recorded in logs/audit.jsonl, which is ignored by Git.

**Never expose port 4177 to the internet** or share your access token. Use the dashboard only for a server you administer.

## Tests

    npm test

These run locally using Node's built-in test runner. They do not require Docker.

## Future roadmap

- Verify online-player visibility through supported server data.
- Add more player administration tools, such as renamed characters and resetting stuck positions.
- Investigate server-supported level/XP changes, avatar scaling and event spawning without relying on unverified APIs.
- Add richer server and game world monitoring.
- Investigate permission-controlled access to GameMaster from RebornCamera spectator controls.

The current dashboard is a **local controller**, not a component copied into mods/components. Additional server-side scripting may be necessary for future game-world controls.

Source: [OrbusVR Community Server Admin Tools](https://github.com/orbusvr-community/reborn-server#admin-tools)
