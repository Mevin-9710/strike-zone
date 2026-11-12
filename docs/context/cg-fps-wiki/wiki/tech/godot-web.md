# Godot 4 web export vs CrazyGames limits

- Godot web exports use WebGL 2 (Compatibility renderer). Engine `.wasm` is ~37-40 MB raw, ~5-12 MB compressed (gzip/Brotli) in the stock template. [C: S13]
- Disabling 3D and unused modules in a custom template can cut size ~15-40%; one devlog reached 16.75 MB raw (4 MB gzipped) for a 2D build. A 3D game cannot disable 3D. [C: S13]
- Godot 4.3+ has a single-threaded web export, which avoids cross-origin-isolation headers and is better for portals. [C: S13]
- CrazyGames supports Godot; community SDK template exists. [S: S7; C: github PlayWithFurcifer/GodotCrazySDKTemplate]

## Tension with CrazyGames numbers [I]
- Limit: initial download ≤50 MB; "top performers" load <10 s and ≤20 MB. [S: S2, S3]
- A stock Godot 3D build is already ~40 MB raw before any art. Whether CrazyGames measures compressed or raw is unclear [?]. If compressed, a 3D Godot FPS fits in 50 MB; it still sits above the 20 MB mobile-homepage and "top performer" marks.
- Chromebooks (4 GB RAM) are a significant audience; Godot 3D + WebGL 2 + a shooter is heavy. [I]
- A Three.js arena shooter is reported to have passed into Basic Launch; Three.js itself is under 1 MB minified (core library). [B: S9; I]

## Measured 2026-11-07: Three.js size [S: measured locally]
Minified `three.module.min.js` + `three.core.min.js` (r-latest in local node_modules) = 720 KB raw, 179 KB gzip, 145 KB brotli. Versus ~40 MB raw / 5-12 MB compressed for stock Godot 3D. Size then depends almost entirely on our own assets (keep models/textures small).
User proposed Three.js + plain HTML on 2026-11-07. Trade-offs: gain size, load speed, Chromebook friendliness, JS shared between client and a Node/WebSocket server; lose Godot editor/scene tooling and built-in physics/netcode (we write collision, netcode). Blender stays usable via glTF (.glb) export. Status: leading candidate, not yet decided.

## To test before committing [?]
1. Export an empty Godot 4.7 3D project (Compatibility, single-threaded) and measure `.wasm` + `.pck` raw and gzipped.
2. Run it in the CrazyGames QA tool (Developer Portal) for load time.
3. Compare to the same scene in Three.js.
