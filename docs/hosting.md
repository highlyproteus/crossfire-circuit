# Hosting and operations

Crossfire Circuit uses a static Vercel frontend, a long-running Colyseus server on EC2, Convex for results and discovery, a named Cloudflare tunnel, and LiveKit for optional lobby voice. See [development](development.md) for local setup and environment variables.

## Deployment configuration

[`deploy/production.example.json`](../deploy/production.example.json) documents the configuration fields without real account or resource IDs. Each operator keeps a populated `deploy/production.json` locally. This file and `deploy/*.local.md` are ignored by Git and excluded from Vercel uploads. Do not overwrite an existing verified configuration with the example.

The maintained deployment belongs to Proteus Labs. Its verified account and host remain in the local configuration; Vercel, Convex, and provider project details remain in `deploy/operations.local.md`. Follow [AGENTS.md](../AGENTS.md) when operating this installation. An independent installation needs its own resources and credentials.

Use `node deploy/aws.mjs` for AWS operations. It requires valid local configuration, verifies the signed-in account before running the requested command, removes ambient AWS credential overrides, and rejects profile, region, endpoint, and unsigned-request overrides. A missing configuration or account mismatch stops the operation. Renew the configured AWS profile through normal browser sign-in when necessary.

```sh
node deploy/aws.mjs sts get-caller-identity
node deploy/aws.mjs ssm describe-instance-information
node --test deploy/aws.test.mjs
```

The wrapper tests use fictional account settings and a mock CLI; they do not contact AWS or need private operator configuration.

## Services and network

The systemd definitions are in [`deploy/`](../deploy/). The game runs as the unprivileged `crossfire` user, bound to `127.0.0.1:2567`. A named Cloudflare tunnel provides the public HTTPS/WebSocket origin. Discovery publishes the approved origin to Convex only while the game and connector are ready; client joins and reconnects use that origin.

The maintained EC2 deployment uses Systems Manager for administration, zero public inbound security-group rules, disabled SSH, encrypted storage, and required IMDSv2. Service hardening blocks instance-metadata access. Keep the game and readiness listeners bound to loopback; do not expose them directly to the internet.

Install `crossfire-hardening.conf` as a systemd drop-in for the game and tunnel units. Runtime source lives at `/opt/crossfire-circuit/current`; unsaved results are stored in `/var/lib/crossfire-circuit/outbox`. Runtime source and dependencies must be root-owned and readable by `crossfire`.

## Secrets and provider setup

Store server-only environment variables in `/etc/crossfire-circuit.env`, root-owned with mode `600`. The game and Convex deployments share `GAME_SERVER_SECRET` and the approved `GAME_SERVER_PUBLIC_ORIGIN`. Result writes are authenticated, idempotent, and retried from the durable outbox. Only the public Convex URL and discovery flag belong in `VITE_` variables.

The connector reads its single-tunnel token through systemd `LoadCredential` from `/etc/crossfire-circuit/tunnel-token`, root-owned with mode `600`. The Cloudflare account administration certificate stays off EC2. The connector's readiness listener uses `127.0.0.1:20242`; configure the multiplayer hostname with an explicit 404 fallback for other requests.

LiveKit's API key and secret belong only in the game-server environment. Missing voice configuration disables voice without disabling gameplay. Never commit environment files, provider tokens, private keys, or populated operator configuration.

Use a verified Git identity authorized for your Vercel team. Confirm the linked Vercel and Convex projects before deployment. Set `VITE_CONVEX_URL` and `VITE_SERVER_DISCOVERY=true` for the hosted frontend; do not bake server credentials into the browser build.

## Capacity and recovery

Public beta capacity is four simultaneous circuits of up to 26 players. New-lobby requests have a per-network burst allowance of two, replenished over five minutes. Joining and reconnecting have separate budgets. Admission checks bound request bodies and rate-limit WebSocket handshakes.

Set `TRUST_CLOUDFLARE=true` only for the loopback-bound origin: it accepts Cloudflare's client address only from a local connector, ignores other forwarding headers, and groups IPv6 clients by /64. Rate-limit state is in memory and resets on restart; this is basic abuse mitigation.

Waiting lobbies expire after five minutes without starting, with a one-minute warning. Results close after two minutes unless the leader returns to the lobby. Inputs, pings, extra joins, and reconnects do not extend the waiting deadline. Disconnected players retain a 90-second reconnect allowance.

The server runs physics at 60 Hz and broadcasts at 20 Hz. Clients send inputs at 30 Hz and interpolate render poses. Client-side prediction and hit rewind are future improvements, so latency affects steering and aiming.

## Release checks

Before changing a live service, verify account and host ownership, check active lobbies, and archive the deployed source and protected configuration. Restarting the game process ends in-memory lobbies; connector restarts can interrupt sockets. Preserve unrelated services and avoid restarts during matches.

Run the build, multiplayer tests, and account-guard tests before release. After deployment, verify the website, the multiplayer `/health` endpoint, Convex discovery, and a real connection through the public hostname. Synthetic connection/media tests do not replace physical-device or human voice testing.
