# Development

Return to the [project overview](../README.md) for gameplay and quick-start instructions.

## Local setup

Use Node.js 22 and run `npm ci` from the repository root. `npm run dev` serves the client on port 5190; `npm run server` starts the multiplayer server on port 2567. Solo play needs only the client. Built models and audio are included, so no asset-generation accounts are needed to play or build.

A fresh checkout uses local multiplayer without any environment configuration. If your existing `.env.local` enables hosted discovery, set `VITE_SERVER_DISCOVERY=false` and `VITE_GAME_SERVER=http://127.0.0.1:2567` for local development, then restart Vite. Keep local tests pointed at your own server.

## Optional services

| Variable | Where it belongs | Purpose |
| --- | --- | --- |
| `VITE_GAME_SERVER` | Vite client configuration | Direct local or self-hosted game origin when discovery is off |
| `VITE_SERVER_DISCOVERY` | Vite client configuration | Set to `true` to discover the game server through Convex |
| `VITE_CONVEX_URL` | Vite client configuration | Public Convex URL for results and discovery |
| `CONVEX_URL` | Game-server environment | Convex deployment for saving results and publishing discovery |
| `GAME_SERVER_SECRET` | Game-server and Convex environments | Shared server-only credential for writes |
| `GAME_SERVER_PUBLIC_ORIGIN` | Game-server and Convex environments | Approved HTTPS multiplayer origin |
| `RESULTS_DIR` | Game-server environment | Durable result outbox; defaults to `work/result-outbox` |
| `LIVEKIT_URL` | Game-server environment | LiveKit project endpoint |
| `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Game-server environment | Voice token signing and participant management |

Vite reads local environment files. Export server variables into the shell running `npm run server`; the server does not automatically load Vite's `.env.local`. Values prefixed with `VITE_` are public browser configuration. Never use that prefix for credentials. Missing Convex or LiveKit configuration leaves local gameplay available without persistent results or voice, respectively.

See the [Convex functions guide](../convex/README.md) for the data model and the [hosting runbook](hosting.md) for production configuration.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local client |
| `npm run server` | Start local multiplayer |
| `npm run check` | Check TypeScript |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the built client locally |
| `npm run test:multiplayer` | Run server, physics, admission, and voice tests |
| `node --test deploy/aws.test.mjs` | Check the AWS account guard without deploying |
| `npm run assets:build` | Prepare and optimize existing source models locally |

The production bundle includes Rapier WASM and currently triggers Vite's large-chunk warning.

## Simulation and rendering

`src/simulation.ts` owns vehicle physics, barrels, weapons, damage, and respawns. `src/course.ts` defines the circuit and checkpoint geometry. `src/view.ts` renders the world, and `src/assets.ts` loads and poses models. Model meshes are separate from gameplay collision geometry.

Online players share one authoritative Rapier world in `server/arena-room.ts`. The server runs physics at 60 Hz and sends snapshots at 20 Hz. Clients send inputs at 30 Hz and interpolate rendering. Solo AI drivers use separate physics worlds. Client-side prediction, hit rewind, and rider ragdolls are not implemented.

## Testing

Server tests cover shared simulation, 26-player capacity, round transitions, leader transfer, reconnects, admission limits, damage and knockback, and voice authorization. The files under `scripts/qa-*.js` are browser scenario functions that accept a Playwright `page`; they are not standalone Node programs. Open the local game with `?qa=1` to expose their simulation hooks. Some scenarios capture screenshots.

The TypeScript load scenarios under `scripts/` open real multiplayer connections. Set `GAME_ENDPOINT` to a local or dedicated test server when using them. Public load tests can create lobbies and match results, so do not run them as an unattended build step.

Store new screenshots, recordings, traces, and reports under ignored `output/` or `work/` directories. Legacy root screenshot and `qa-*.json` / `qa-*.txt` outputs are also ignored. Keep test code in Git; generated evidence is local-only.

Visual checks should cover driving, rider poses, first-person arms, reloads, course routes, and touch controls. Automated voice checks use a synthetic microphone. Real phone input, audio quality, and a full human lobby still need manual playtesting.

## Assets and audio

See [asset sources](../source-assets/README.md). `npm run assets:build` reads the checked-in source manifest, prepares ATV wheel meshes in `work/prepared/`, and writes optimized GLBs to `public/models/`. Its report goes to `work/reports/asset-build.json`. This command does not call generation APIs.

`scripts/generate-audio.py` reads `ELEVENLABS_API_KEY` from the environment, skips existing MP3s, and writes its receipt to `work/reports/audio-generation.json`. Generating missing or replacement audio consumes provider credits. The game plays existing files locally through Web Audio with independent music, effects, and voice levels.

The development-only model viewer is available at `/asset-lab.html` while Vite is running.

## Voice behavior

Players explicitly join voice, initially listen-only. Turning the mic on requires a separate action and browser permission. Self-mute releases capture. Personal mute affects the listener; leader mute changes the participant's provider permissions. Allowing a mic never turns it on automatically. Leaving or reconnecting resets the mic to off.

Voice tokens are short-lived and scoped to the authenticated game connection and lobby. Camera, screen sharing, data publishing, and administrative grants are disabled. Recording and transcription are not enabled. Provider errors leave gameplay available.
