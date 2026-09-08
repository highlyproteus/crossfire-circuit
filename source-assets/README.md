# Asset sources

This directory contains the original artwork used to develop Crossfire Circuit. These are source assets, not gameplay screenshots or test output.

- `concepts/`: the six approved concepts generated with ChatGPT/Codex image generation.
- `concept-review.html`: a local gallery of those concepts.
- `meshy-assets.json`: the source-model manifest consumed by the asset build scripts.
- `meshy_output/`: original Meshy models, the rigged rider, previews, and generation receipts.
- Other manifests and `game-direction.md`: historical concept prompts and production notes. Some receipts contain paths from the original generation workspace; the asset build uses the relative paths in `meshy-assets.json`.

The ATV, rider, sniper rifle, and launcher runtime models are in [`public/models/`](../public/models/). Rebuild them with `npm run assets:build`. The course uses procedural geometry and collision shapes. Music and effects in [`public/audio/`](../public/audio/) were generated with ElevenLabs; generation prompts are in [`scripts/generate-audio.py`](../scripts/generate-audio.py).

Source art and generation receipts are excluded from Vercel uploads. Intermediate files and new generation reports belong in ignored `work/` directories. See [development](../docs/development.md) for details.
