# Hosting and operations

This runbook describes the Proteus Labs deployment. See the [development guide](development.md) to run an independent local game.

- **Vercel:** `proteus5/crossfire-circuit`, public frontend at https://opencrossfirecircuit.party/ (the original https://crossfire-circuit.vercel.app/ address also works). Domain registration and DNS belong to the Proteus Cloudflare account.
- **Colyseus 0.18:** `crossfire-circuit.service` on a dedicated EC2 instance in **Proteus Labs**. Runs as the unprivileged `crossfire` user, bound to localhost:2567. This game must never share infrastructure with Hive3 or another company. The account and host are recorded in [deploy/production.json](../deploy/production.json).
- **Convex:** production deployment `clever-gerbil-617`. Run project commands from this checkout using `--prod`. Stores completed rounds, fastest completed laps, and the current public server endpoint. Only the game server can write results or register an endpoint, using a server-only secret. Result saves use an idempotent key and a durable disk outbox for retries.
- **Permanent multiplayer transport:** `crossfire-tunnel-connector.service` runs a dedicated named Cloudflare tunnel at https://multiplayer.opencrossfirecircuit.party/. `crossfire-tunnel.service` publishes that origin to Convex only while the game and connector are ready. Discovery accepts only the configured HTTPS origin; temporary tunnel names and other hosts are rejected. Clients use discovery when joining and reconnecting. Connector restarts may still interrupt sockets; reconnection preserves a player's session while the game process remains running.
- Administration uses AWS Systems Manager in the Proteus account. The dedicated security group has zero inbound rules; the SSH service and socket are disabled. Storage is encrypted, IMDSv2 is required, and service hardening blocks game/tunnel access to instance metadata. The instance has the SSM core role, with temporary migration storage permissions removed after transfer.

The server runs physics at 60 Hz and broadcasts snapshots at 20 Hz. Clients send bounded inputs at 30 Hz and interpolate/extrapolate render poses by at most 80 ms. The server owns movement, collisions, checkpoints, role selection, ammo, damage, round timing, and standings. Client-side prediction and lag-compensated hit rewind are future improvements; latency affects steering and aiming responsiveness.

Public beta capacity is four simultaneous circuits, each with up to 26 players. New-lobby requests have a per-network burst allowance of two, replenished over five minutes. Joining and reconnecting use separate, larger budgets so a full group can share Wi-Fi. The request guard runs ahead of Colyseus matchmaking, bounds request bodies, and rate-limits WebSocket handshakes. Set `TRUST_CLOUDFLARE=true` only on the loopback-bound production origin: it uses Cloudflare's client address only from a local connector, ignores other forwarding headers, and groups IPv6 clients by /64. Rate-limit state is in memory and resets on restart; this is basic abuse mitigation, not distributed attack protection.

Waiting lobbies close after five minutes without starting, with a one-minute warning. Results close after two minutes unless the leader returns to the lobby. Inputs, pings, extra joins, and reconnects do not extend the waiting deadline. Active rounds keep the existing 90-second reconnect allowance. Starting another round within the same lobby does not consume a new-lobby request.

Deployment units are in `deploy/`. Install `crossfire-hardening.conf` as a systemd drop-in for both game and tunnel units. Runtime source lives at `/opt/crossfire-circuit/current` on EC2; server-only environment is `/etc/crossfire-circuit.env`; unsaved match results are `/var/lib/crossfire-circuit/outbox`. Runtime source and dependencies must be root-owned and readable by the `crossfire` user; keep the environment file root-owned with mode `600`.

The connector uses systemd `LoadCredential` to read its single-tunnel token from root-owned `/etc/crossfire-circuit/tunnel-token` (mode `600`). The account administration certificate stays off EC2. The connector's readiness listener is bound to localhost:20242. Cloudflare serves only the configured multiplayer hostname, with an explicit 404 fallback. Do not add public EC2 ingress or expose the readiness listener.

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

For private-repository Vercel deployments, use your verified Git author identity associated with the hosting team. Keep repository authentication and deployment authorization in the Proteus hosting team.

`VITE_CONVEX_URL` and `VITE_SERVER_DISCOVERY=true` configure the Vercel production build. The obsolete fixed game-server endpoint has been removed from production settings. `CONVEX_URL` and `GAME_SERVER_SECRET` belong only on EC2/Convex. Do not put the latter in Vite variables. Set `GAME_SERVER_PUBLIC_ORIGIN=https://multiplayer.opencrossfirecircuit.party` in both the EC2 environment and the production Convex environment. Avoid restarting the game service during an active match; in-memory lobbies do not survive server restarts.
