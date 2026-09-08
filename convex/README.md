# Results and server discovery

Convex stores completed rounds, fastest laps, and the current multiplayer endpoint. Live gameplay runs in the Colyseus server.

| File | Responsibility |
| --- | --- |
| [schema.ts](schema.ts) | `servers`, `matches`, and `laps` tables and indexes |
| [results.ts](results.ts) | Read recent rounds and fastest laps; record completed rounds |
| [servers.ts](servers.ts) | Read and publish the approved multiplayer origin |
| [_generated/](_generated/) | Convex-generated API bindings and types |

Read queries are public. Result writes and endpoint registration require `GAME_SERVER_SECRET`, configured only in the game-server and Convex environments. Endpoint registration also validates `GAME_SERVER_PUBLIC_ORIGIN`. Match keys make result retries idempotent.

The client uses `VITE_CONVEX_URL` for public queries. The game server uses `CONVEX_URL` and keeps unsaved results in a durable outbox until writes succeed. Local gameplay works without Convex configuration.

See [development](../docs/development.md) for environment variables and [hosting](../docs/hosting.md) for the Proteus production deployment.
