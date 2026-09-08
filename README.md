# Crossfire Circuit

An ATV racing and marksman game built with TypeScript, Three.js, Rapier, Vite, and Colyseus. Multiplayer runs on one authoritative physics world; solo runs remain available.

## Play

Open **https://crossfire-circuit.vercel.app/** to play online.

1. Choose **Play with friends**, enter a name, and leave the lobby code blank to create a room.
2. Copy the invite link to friends, or have them enter the lobby code. Names appear above drivers and in the live standings.
3. The lobby leader can start once at least two players have joined. Capacity is 26 total: up to 25 drivers and one marksman.
4. Everyone drives freely for 30 seconds. A five-second countdown resets the grid, then the server randomly selects one connected player as marksman and moves them to the tower.
5. Drivers race through eight checkpoints. The round lasts up to ten minutes; the first finish starts a final 60-second window. The leader can return everyone to the lobby afterward.

Brief disconnects have a 20-second rejoin window. The leader transfers to another connected player. A marksman who fails to reconnect ends the round. Mid-race joining is locked; names are display names rather than authenticated accounts.

For local development run `npm install`, `npm run server`, and `npm run dev` in separate terminals; open http://127.0.0.1:5190/. Online physics continue while a player opens settings; their controls stop until they return.

Choose **Ride the circuit** or **Play as marksman**. Practice disables the AI attacker while driving. Escape pauses; **Choose another role** returns to the menu. Music and sound start with your first role selection; use the sound button to mute, or the pause-menu sliders to adjust music and effects separately.

| Driver | Action |
|---|---|
| W / S | Accelerate / brake and reverse |
| A / D | Steer |
| Space | Handbrake / drift |
| E | Mount the ATV |
| R | Recover at the last checkpoint |
| Right mouse drag | Look around |

| Marksman | Action |
|---|---|
| W / A / S / D | Walk around the overlook |
| Mouse | Aim |
| Left click | Fire; hold for repeated shots |
| Shift | Toggle aim down sights (ADS) |
| Hold right mouse | Temporary ADS |
| R | Reload |
| 1 / 2 | Sniper rifle / rocket launcher |
| V | First-person / third-person camera |
| Escape | Pause and release cursor |

Touch buttons support driving, marksman movement, drag aiming, ADS, firing, and reload. Desktop is the primary playtest target; browser touch emulation does not establish physical-phone readiness.

## The playground

- **2.76 km main lap**, eight ordered checkpoints, longer straights, S-bends, western dogleg, and southern switchbacks.
- Main lanes remain **17 m wide**, with sections opening to **22 m** and a **12.5 m** staircase challenge. Online lobbies allow 25 drivers plus one marksman. Automated connection/load testing is distinct from a 26-person device and gameplay session.
- **Four alternate roads with vertical choices:** the purple 10 m Upper Deck climbs 14 m above the main road, while the blue 10 m Lower Deck descends 10 m below it. The cyan 12 m Service Loop bypasses the first jump at road level. The green 9 m Skyway climbs 20 m and remains hidden from the minimap. Graded entrances and exits reconnect to the main course; alternate-road progress counts toward ordered checkpoints.
- **Four cyan Overdrive pads** boost the ATV for 2.2 seconds, reaching about 129 km/h. Brake before the next bend.
- **72 dynamic barrels**: 24 red fuel drums detonate on ATV contact or a rifle hit; ten scattered blue drums tumble, and a four-layer tower of 38 lightweight blue drums spans the western straight. The tower stays stacked until drivers smash a path through it. Scattered positions vary per restart; the tower has a stable layout. Explosions can trigger nearby fuel drums. Destroyed or fallen barrels return on a new round.
- Twelve staggered barriers and additional cover walls break up the straights.
- Two jumps span **26.5 m and 27 m**. Keep full throttle and a straight approach at 95+ km/h. Slower attempts fall short.
- Slippery tire grip, steering lag, and yaw inertia preserve sideways momentum. Handling and attacker pressure use fixed game rules. Player settings expose sound enable/mute, music volume, and sound-effect volume, alongside the control guide and menu actions.
- Void falls and lethal damage respawn the driver at the previous checkpoint, with health restored and three seconds of protection.

Personal bests are stored separately for this layout.

## Solo marksman mode

The marksman uses the same approved rider model as the drivers. A larger circular overlook provides room to move, with cover blocks and a constrained perimeter. Rapier's character controller handles walking and cover collisions. ADS slows walking; V exposes the character and procedural walking pose in third person.

Three AI riders navigate the course with the vehicle simulation, recover at checkpoints, and restart after finishing. Takedowns and escaped riders are counted separately. Every sniper hit deals 25 damage, including helmet hits and the solo AI sniper: four hits destroy a full-health ATV. Cover blocks shots. Rockets travel through the scene and apply mass-scaled radial and upward impulses. Nearby rocket and fuel-barrel blasts can launch a surviving driver clear off the course; direct hits can be lethal. Suspension and grounded handling briefly release during the launch so they do not cancel the blast. Fixed cover and spawn protection still apply. Dynamic barrels do not block explosion rays, including the drum that just detonated. Shooting a red barrel can also take out a nearby rider; damage followed by a fall within six seconds earns a takedown.

The rifle and launcher each hold four rounds, with unlimited reserve ammunition. R reloads, and empty weapons reload automatically after their firing cooldown. Reloads take 1.8 / 2.4 seconds and block firing and weapon changes. First-person arms use the approved rider mesh and textures, with hand IK following the weapon. The weapon tilts during reload, the support hand moves toward the magazine, and generated mechanical audio accompanies the motion.

## Custom assets and audio

The approved Codex concepts became the ATV, rider, rifle, and launcher GLBs in `public/models/`. Their optimized total is about 2.79 MB. The rider is 2.35 units tall with a 24-bone rig, posed on the controls and footrests. Four separate wheel meshes steer and spin. This pass reuses the earlier approved 125-credit Meshy batch; no new Meshy generation was needed.

`public/audio/` contains a new **60-second instrumental racing soundtrack** and **eight ElevenLabs effects**: engine, rifle, rocket, explosion, boost, reload, barrel clang, and checkpoint. The generation receipt is `audio-generation.json`; measured durations and codecs are in `audio-validation.json`. The observed account usage increased by 928 credits during generation. No key is included in the browser bundle or saved audio artifacts.

Audio is decoded locally through Web Audio, with a limiter, independent mix levels, an engine loop whose pitch follows speed, and capped simultaneous effects. Music and engine sound fade while paused. Generation used the official [music API](https://elevenlabs.io/docs/api-reference/music/compose) and [sound-effects API](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert).

The generation script reads `ELEVENLABS_API_KEY` from the environment and skips existing MP3s. Running it after removing files will generate replacements and consume credits. `npm run assets:build` only prepares existing 3D models, without API calls.

## Verification and limits

`npm run build` checks TypeScript and builds the game. The existing large-bundle warning is primarily Rapier WASM.

`qa-v4.json` records the current checks: all four alternate roads driven with checkpoint credit, upper and lower deck heights, four-shot magazines and reloads, rocket/barrel launches through void death, actual rocket projectile knockback with takedown credit, combat/cover/pause regressions, full main-course completion, and jump speed thresholds. First-person arms and vertical roads were also visually inspected. Repeatable scenarios are in `scripts/qa-v4-*.js`; the main-course scenario is `scripts/qa-v2-course.js`.

The preceding `qa-v3.json` records feature tests: marksman movement and perimeter, reload blocking/pause/refill, barrel impacts and shooting, boost speed, driving all three alternate roads with checkpoint credit, jump speed thresholds, course completion, AI traffic, combat, actual keyboard ADS and reload interaction, and audio loading. Earlier `qa-v2*.json` records describe the preceding layout. Browser hooks are exposed only with `?qa=1`; repeatable scenarios are in `scripts/qa-v3-*.js`.

Current screenshots include `arms-rifle.png`, `arms-reload.png`, `arms-rockets.png`, `upper-deck.png`, `lower-deck.png`, and `vertical-routes.png`. Procedural poses and weapon animation are prototype animations; mounting and rider ragdolls are not implemented. Solo AI riders use separate physics worlds, with barrel contacts queried against the actual shapes across worlds and scripted impact impulses. Online players instead share a single authoritative Rapier world, including ATV collisions and common barrels.

`qa-multiplayer.json` records the public 26-client load test, three-browser lobby/warmup/countdown/role assignment, driving, marksman movement, Shift ADS, rifle damage, and reload checks. Server tests also cover capacity, reconnection, leader transfer, authoritative physics, and magazine limits. Completed results were verified in production Convex. These are automated checks; a full human lobby remains the next playtest.

## Mobile controls and connection recovery

Phones and tablets use a left joystick. Drivers steer horizontally and hold GAS to accelerate, with separate brake, reverse, and recovery buttons. Marksmen move with both joystick axes, drag the scene to aim, and use FIRE, ADS, RELOAD, and the two weapon buttons. Each finger keeps independent ownership of its control, so movement and actions work together. Native touch end/cancel events reset controls even when pointer-release events are lost. Rotation, hiding controls, loss of focus, and page suspension clear held input. The driver joystick moves horizontally; the marksman joystick uses both axes. Portrait and landscape layouts include safe-area spacing, scrolling menus, compact standings, and lower-cost mobile rendering.

The client detects stalled sockets, retries against freshly discovered server endpoints for up to 75 seconds, and stores the newly issued reconnect token. The server reserves disconnected players for 90 seconds. Refreshing after recovery retains the player session. Inputs stop while disconnected or backgrounded, and expiry presents a return-to-lobby action. Server restarts still end in-memory lobbies. Socket disconnect and reconnect events are logged without names or tokens.

`qa-joystick.json` records the missed-release regression, independent finger releases, cancellation, rotation, and simulated visibility/lifecycle resets. `qa-mobile.json` records touch driving/combat, responsive layouts, an actual 25-second offline interruption, token rotation, and reload after recovery. Browser mobile emulation does not replace physical iOS/Android testing.

## Multiplayer hosting and operation

- **Vercel:** `proteus5/crossfire-circuit`, public frontend at https://crossfire-circuit.vercel.app/.
- **Colyseus 0.18:** `crossfire-circuit.service` on a dedicated EC2 instance in **Proteus Labs**. Runs as the unprivileged `crossfire` user, bound to localhost:2567. This game must never share infrastructure with Hive3 or another company. The account and host are recorded in `deploy/production.json`.
- **Convex:** `highlyproteus/crossfire-circuit`, production `clever-gerbil-617`. Stores completed rounds, fastest completed laps, and the current public server endpoint. Only the game server can write results or register an endpoint, using a server-only secret. Result saves use an idempotent key and a durable disk outbox for retries.
- **Public playtest transport:** `crossfire-tunnel.service` runs Cloudflare Quick Tunnel and refreshes endpoint discovery in Convex. The frontend discovers the current endpoint on join, so the Vercel invite URL stays stable when the tunnel hostname changes. This is a testing transport, not a production SLA or a permanent named tunnel. A tunnel restart disconnects active sockets; a fresh join obtains the new endpoint.
- Administration uses AWS Systems Manager in the Proteus account. The dedicated security group has zero inbound rules; the SSH service and socket are disabled. Storage is encrypted, IMDSv2 is required, and service hardening blocks game/tunnel access to instance metadata. The instance has the SSM core role, with temporary migration storage permissions removed after transfer.

The server runs physics at 60 Hz and broadcasts snapshots at 20 Hz. Clients send bounded inputs at 30 Hz and interpolate/extrapolate render poses by at most 80 ms. The server owns movement, collisions, checkpoints, role selection, ammo, damage, round timing, and standings. Client-side prediction and lag-compensated hit rewind are future improvements; latency affects steering and aiming responsiveness.

Deployment units are in `deploy/`. Install `crossfire-hardening.conf` as a systemd drop-in for both game and tunnel units. Runtime source lives at `/opt/crossfire-circuit/current` on EC2; server-only environment is `/etc/crossfire-circuit.env`; unsaved match results are `/var/lib/crossfire-circuit/outbox`. Runtime source and dependencies must be root-owned and readable by the `crossfire` user; keep the environment file root-owned with mode `600`.

The AWS wrapper verifies the Proteus account before issuing a command and rejects profile/region overrides. Renew the `crossfire-proteus` profile through normal browser sign-in when needed. Useful commands:

```sh
node deploy/aws.mjs sts get-caller-identity
node deploy/aws.mjs ec2 describe-instances --filters Name=tag:Project,Values=crossfire-circuit
node deploy/aws.mjs ssm describe-instance-information
npx convex run --prod servers:current '{}'
npx convex run --prod results:recent '{}'
npm run test:multiplayer
node --test deploy/aws.test.mjs
```

For private-repository Vercel deployments, use your verified Git author identity associated with the hosting team. This project's local Git settings use the authenticated `highlyproteus` repository owner; global Git settings and existing commit history are unchanged.

`VITE_CONVEX_URL` and `VITE_SERVER_DISCOVERY=true` configure the Vercel production build. The obsolete fixed game-server endpoint has been removed from production settings. `CONVEX_URL` and `GAME_SERVER_SECRET` belong only on EC2/Convex. Do not put the latter in Vite variables. Avoid restarting the game service during an active match; in-memory lobbies do not survive server restarts.

The September 8 migration preserved the deployed game build, verified all seven server test groups and a two-client internet test, rotated the game-server secret, and moved endpoint discovery to Proteus. Game services, credentials, runtime directories, service account, and old upload archives were removed from the previous shared host after recovery archives were verified. Its unrelated production relay retained the same process, configuration checksum, and restart count.

## Source

- `src/course.ts`: main route, alternate roads, ramps, checkpoints, hazards, and road geometry.
- `src/simulation.ts`: vehicle physics, character controller, barrels, boosts, weapons, reloads, scoring, and respawns.
- `src/driver-ai.ts`: navigation and speed planning.
- `src/assets.ts`: model loading, cloning, proportions, and poses.
- `src/view.ts`: scene, cameras, animations, weapon and course rendering.
- `src/audio.ts`: generated audio loading and playback.
- `src/main.ts`: menus, HUD, input, audio controls, and frame scheduling.

- `server/arena-room.ts`: authoritative Colyseus rooms and round lifecycle.
- `src/network.ts` and `src/network-types.ts`: client connection, inputs, and rendering snapshots.
- `server/results.ts`: durable result outbox and Convex writes.
- `server/tunnel.ts`: playtest endpoint discovery.
- `src/touch-controls.ts`: simultaneous touch joystick and action input.
- `convex/`: schemas, results, and server discovery.

## Barrel and sniper balance update

`server/combat-physics.test.ts` covers four-hit body/helmet damage, solo sniper damage, reloads, real fuel impacts (slow, fast, sideways and tipped drums), rifle-triggered chains, blast launch and cover, ten-second tower stability and driving through it, and solo marksman AI barrel impacts. `npm run test:multiplayer` also verifies the lobby, reconnection, shared world and 26-player capacity. The blue tower is on the western straight after the first jump/bypass rejoins.

## Local project location

The project lives at `/Users/xtox/Projects/crossfire-circuit`. Run `npm run dev` for the browser client, `npm run server` for local multiplayer, and `npm run build` to validate a production build. Environment files and Vercel project linking moved with the project.

`source-assets/` contains the source models, concept art and generation receipts. `npm run assets:build` reads its local manifest and writes intermediate models to `work/prepared/`; it does not need the original Codex output directory. Source assets and intermediate files are excluded from Vercel uploads. Original receipts elsewhere in this workspace remain available as historical records.
