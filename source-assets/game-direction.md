# Crossfire Circuit — working direction

Status: six Codex concept images generated and ready for visual review. No game implementation or 3D asset conversion started. Use ChatGPT/Codex image generation for visual concepts and Meshy only for approved 3D asset generation. The six previously submitted Meshy image jobs finished before this workflow change and are retained separately; their reported costs total 54 credits.

## Fantasy and visual language

Ride a nimble four-wheeler around an exposed floating obstacle circuit while a marksman in the middle tries to knock you into the void. Speed, exposure, and narrow escapes drive the experience. Original industrial science-fiction arena: bone-white structural panels, charcoal frames, orange vehicles, cyan route lights, and red attack warnings against a deep blue void. Bold silhouettes and readable surfaces; restrained wear rather than dense surface noise. Working title only.

## First playable

- Desktop browser, third-person chase camera, keyboard driving and mouse camera. WASD drive/steer, Space handbrake, E mount, R recover at the last checkpoint, Esc pause.
- Spawn on a safe platform beside an ATV, mount it, then traverse one continuous circuit with four sequential checkpoints and a finish gate. Respawn after death already mounted so retries are quick.
- One lap should take roughly 90–150 seconds before mistakes. Unlimited retries; show elapsed time, checkpoint progress, deaths, and best completed time.
- Central AI marksman alternates between sniper fire and rockets. Sniper aim has a visible warning and constrained tracking; rockets have travel time, smoke trails, splash, and knockback. Cover breaks line of sight. Tune attack cadence and aim error rather than using unavoidable hits.
- Falling beneath the course, lethal damage, or vehicle destruction causes a brief death transition and a reset at the last valid checkpoint. Reset vehicle motion and health, orient it down-course, and provide short spawn protection.
- Route sections: onboarding straight; exposed bends; a short jump; staggered cover; a narrow final straight. Most edges have no rails. Checkpoint platforms have enough safe room to restart.
- Add practice mode with the attacker disabled and a small tuning panel for attack rate, knockback, steering, and grip. Make handling enjoyable before increasing course complexity.

## Six proposed concept images

Current review set: six PNG concepts made with the built-in Codex image-generation tool, saved in concepts/. The exact prompts and source paths are recorded in codex-concept-manifest.json. Use concept-review.html to review the set. Meshy will be used for later approved image-to-3D conversion, with a separate cost plan before submission.

1. Arena overview, 16:9: layout, exposed loop, central marksman tower, void, jumps, and checkpoints.
2. ATV, 1:1: isolated three-quarter reference suitable for a later 3D asset.
3. Rider/marksman base character, 3:4: one full-body character in a neutral A-pose; team roles can use different accent colors later.
4. Sniper rifle, 1:1: isolated fictional game prop.
5. Rocket launcher, 1:1: isolated fictional game prop.
6. Modular course kit, 16:9: straight, turn, jump, cover, checkpoint gate, and central tower on one environment design sheet. This sheet is a construction reference, not an input to generate the whole arena as one mesh.

### Shared prompt direction

Original industrial sci-fi arcade vehicle arena game, stylized believable hard-surface game art, large readable shapes, bone-white painted panels and dark graphite chassis, safety-orange accents, restrained cyan lighting, consistent scale, crisp edges, modest material wear, clean functional silhouettes. Original designs; no existing franchise logos or recognizable franchise equipment. No text, no watermarks. Asset references use an even neutral studio background, soft grounded shadows, full uncropped subject, and minimal perspective distortion.

### 01 — Arena

Wide elevated three-quarter concept of an entire floating ATV race arena above a bottomless midnight-blue void. A continuous broad winding track circles a separate raised central marksman platform; clear empty space between the platform and the circuit. Mostly unguarded track edges. Four cyan checkpoint arches, a safe starting apron, banked bends, one short jump with a visible landing, alternating chunky cover walls that interrupt sightlines from the center, and a narrow exposed finish stretch. Orange ATVs provide scale. Track approximately three ATV widths on broad sections, narrowing to one and a half at the final stretch. Central marksman is visible as a small figure. Show traversable continuity and the central firing relationship clearly. Bone-white decking, dark underslung beams, orange hazard markings; dramatic but readable lighting, no terrain or ground beneath the course. No UI or text.

### 02 — ATV

A single original sporty industrial sci-fi four-wheeled ATV, isolated front-left three-quarter studio view. Exactly four chunky rubber tires, exposed independent suspension, short wheelbase, wide stance, orange armored body panels, charcoal frame, compact saddle seat, handlebars, visible footrests, small cyan headlamps. Agile low center of mass, mechanically plausible wheel clearances and seat position. No mounted weapons, no rider, no enclosed cabin, no extra wheels. Entire vehicle visible on a light neutral background. Clean reference for later 3D modeling with separated wheel forms.

### 03 — Character

One original full-body futuristic motorsport arena competitor, neutral symmetrical A-pose with open relaxed hands, front three-quarter view with minimal perspective distortion. Lightweight graphite protective riding suit, bone-white shoulder and shin plates, orange chest harness, compact closed helmet with a narrow cyan visor, padded gloves and articulated boots. Athletic normal human proportions, clear joints, no oversized shoulder armor, no cape, no backpack, no weapons. Visually belongs with the orange industrial ATV. Entire head, hands, and feet visible against a neutral light studio backdrop. Suitable for later rigging and seated riding.

### 04 — Sniper rifle

One original fictional sci-fi precision rifle game prop isolated on a light studio background, near side view with slight three-quarter depth. Long slender barrel shroud, compact rectangular optic with cyan glass, angular bone-white receiver, graphite grip and shoulder stock, small orange identification panel. Readable long-range silhouette clearly distinct from a heavy launcher. Stylized exterior only, no cutaway or internal mechanism diagram, no hands or character, no lettering. Full uncropped prop.

### 05 — Rocket launcher

One original fictional sci-fi shoulder rocket launcher game prop isolated on a light studio background, near side view with slight three-quarter depth. Short broad single launch tube, oversized dark circular opening, bone-white outer shell, orange safety panels, graphite rear housing, side carry handle and compact sight. Clearly heavier and bulkier than the precision rifle, clean readable silhouette, restrained cyan status light. Stylized exterior only, no cutaway or internal mechanism diagram, no hands or character, no lettering. Full uncropped prop.

### 06 — Course kit

An organized isometric environment kit concept sheet on a neutral dark-blue backdrop showing six separated modular components at consistent scale: a broad straight floating deck, a banked quarter-turn, a short takeoff ramp paired with a landing deck, a chunky freestanding cover wall, a checkpoint arch on a safe apron, and a raised central marksman platform with a low parapet. Matching bone-white deck slabs, graphite exposed support beams, orange hazard striping, cyan checkpoint lights. Clean mating edges and mostly open track edges. Large simple collision-friendly shapes. Clearly separated pieces without labels or typography. Buildable game environment design, not a dense cinematic diorama.

## Implementation after visual review

Use TypeScript, Vite, Three.js, and Rapier with a fixed-step physics simulation. Keep game rules, vehicle state, AI, checkpoint progression, damage, and respawns outside the rendering layer. Input is expressed as game actions. Use a DOM HUD with a small timer/checkpoint cluster and temporary warnings.

Start with procedural course geometry and simple collision shapes. Use a chassis with arcade-tuned suspension, steering, and traction; wheel visuals need separate pivots. Meshy can supply selected visual assets after concepts are reviewed. Its generated geometry does not define the driving collision surface. Optimize approved assets to GLB, normalize meters and pivots, and inspect wheels, hands, seating, and transitions in motion.

Multiplayer comes after the solo feel is accepted. Keep entity IDs, roles, inputs, snapshots, and gameplay events explicit so a later authoritative server can own damage, checkpoints, and respawns. Network transport, reconciliation, shared vehicle simulation, and real multi-client testing will still be a separate milestone.

## Acceptance gates

1. Review the six images together for one consistent art direction before generating 3D models.
2. Verify a complete lap with attacks disabled; test steering, braking, jumping, camera recovery, and every checkpoint.
3. Verify sniper line of sight, rocket knockback, cover, lethal damage, void deaths, manual recovery, and clean respawn state.
4. Play full solo rounds with attacks enabled and tune for readable, avoidable threats.
5. Inspect the actual browser experience in motion, including mounting, seated rider contact, wheel rotation, collisions, HUD readability, and performance. Target stable 60 fps on the test machine and report measurements rather than assuming success.

Credit reference: https://docs.meshy.ai/en/api/text-to-image
