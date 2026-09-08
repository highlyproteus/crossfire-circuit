# Crossfire Circuit

An arcade ATV racing game above the void. Drivers tackle a floating obstacle course while one marksman tries to knock them off from the central tower.

**[Play Crossfire Circuit](https://opencrossfirecircuit.party/)** · [Development](docs/development.md) · [Hosting](docs/hosting.md) · [Asset sources](source-assets/README.md)

## The game

- **Race with friends:** up to 25 drivers and one randomly assigned marksman, with invite links, lobby codes, and live standings.
- **Choose your route:** a 2.76 km circuit with elevated roads, lower decks, shortcuts, boosts, jumps, and obstacles.
- **Cause some chaos:** explosive fuel drums and a tower of rolling barrels react to vehicle impacts and blasts.
- **Keep racing:** recover at checkpoints after falls or takedowns. Completed rounds and fastest laps appear in the results panel.
- **Coordinate over voice:** opt-in lobby voice chat, personal mute, deafen, and leader moderation. Microphones start off.
- **Practice solo:** drive against an AI attacker, disable attacks for practice, or play marksman against AI riders.

Built with TypeScript, Three.js, Rapier, and Colyseus, with Convex for results and server discovery and LiveKit for voice.

## Play with friends

1. Choose **Play with friends** and enter a display name. Leave the lobby code blank to create a room.
2. Share the invite link or lobby code. The leader can start with at least two players.
3. Drive freely during a 30-second warm-up. A five-second countdown follows, then one player becomes the marksman.
4. Race through eight checkpoints. Rounds last up to ten minutes; the first finisher starts a final 60-second window.

Both weapons hold four rounds. Sniper shots and fuel-barrel blasts each deal 25 damage; a barrel chain reaction applies one health hit per driver. Blasts also apply physical knockback, so being launched into the void can still be fatal.

## Controls

| Action | Driver | Marksman |
| --- | --- | --- |
| Move | W / S: accelerate, brake, reverse; A / D: steer | W / A / S / D: walk |
| Aim or look | Right mouse drag | Mouse |
| Primary action | Space: handbrake | Left mouse: fire |
| Aim down sights | — | Shift: toggle; right mouse: hold |
| Recover or reload | R: recover at checkpoint | R: reload |
| Other | E: mount ATV | 1 / 2: weapon; V: camera |
| Menu | Escape | Escape |
| Microphone | M, after joining voice | M, after joining voice |

On touchscreens, drivers use the joystick to steer and hold **GAS** to accelerate. Marksmen use the joystick to move, drag to aim, and tap the weapon controls. Sound and voice have separate volume controls.

## Run locally

Use **Node.js 22** and npm.

```sh
npm ci
npm run dev
```

Open [localhost:5190](http://127.0.0.1:5190/) for solo play. For local multiplayer, also run this in a second terminal:

```sh
npm run server
```

A fresh checkout connects multiplayer to the local server on port 2567. Hosted results and voice are optional; see [configuration and testing](docs/development.md).

```sh
npm run build
npm run test:multiplayer
node --test deploy/aws.test.mjs
```

## Project structure

| Directory | Contents |
| --- | --- |
| [src/](src/) | Game simulation, rendering, controls, UI, and network client |
| [server/](server/) | Authoritative multiplayer rooms, admission, voice, and tests |
| [convex/](convex/) | Persistent results and server discovery |
| [public/](public/) | Optimized models, audio, and site assets used by the game |
| [source-assets/](source-assets/) | Original models, approved concept art, and asset provenance |
| [scripts/](scripts/) | Asset preparation and repeatable browser scenarios |
| [deploy/](deploy/) | Deployment configuration and account guard |
| [docs/](docs/) | Development and hosting guides |

## Beta status

Automated checks cover a 26-player session, reconnects, combat physics, lobby controls, and voice permissions. Physical iOS/Android gameplay, human-to-human voice quality, and larger load tests remain playtest work. The hosted beta is capped at four simultaneous 26-player lobbies.

The server owns gameplay state. Restarting it ends active lobbies; temporary connection drops have a 90-second reconnect allowance. See [hosting and operations](docs/hosting.md) for capacity and deployment details.

## License

Licensed under the [MIT License](LICENSE). Third-party dependencies retain their respective licenses.
