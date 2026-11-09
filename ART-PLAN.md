# Strike Zone: art restyle + maps spec (agreed 2026-11-08)

Goal: restyle every asset from boxy blockout to a stylized, hand-painted look (reference feel: chunky toy-like shooters with painted textures), build full maps for all three missions with a shared city kit, then wire everything into the game in one pass.

## Style rules (all assets)
- Shapes: softer and chunkier. Rounded helmets, padded vests, thick gloves and boots, bevelled weapon edges. Still low-poly (characters ~2-4k tris, weapons ~1-2k, props ~0.3-1.5k).
- Painted textures, not sculpting: faces with eyes and brows, goggles with highlights, seams, stitching, straps, pockets, panel lines, camo where it fits, edge wear on weapons.
- Depth baked into color: lighter top edges, darker undersides and crevices, soft gradients (painted AO).
- Surfaces: painted + grime. Bricks, tiles, panels with soft shading, plus stains, cracks, puddles and original graffiti tags.
- Originality: match the feel of the references, never copy their designs, logos, names or maps (CrazyGames originality rule).
- Palette: Civic Shield operatives keep their unique colors (Rhea navy/blue, Kade olive/orange, Yuna grey/teal, Tomas brown/yellow, Amara purple/lime). All Covenant enemies share one red family.
- Size budget: textures small (256-512 px atlases), total download target well under 20 MB.

## Maps (medium, ~90 x 90 m, multi-level but simple)
Shared city kit, so the three maps read as one city (Halvane). Height via stairs and ramps (ladders count as ramps). Crate-jumping allowed: crates, car roofs, low walls are climbable. Set dressing between rich and moderate.

Skyline landmark on every map: the Civic Shield tower (tall HQ with a blue beacon) in the distance.

### M1 First Signal: noon
- Mixed street + rooftop. Street-level start. Two ways up:
  - Assault route: interior stairwell (more guards, faster).
  - Stealth route: exterior fire escape (fewer guards, longer).
- Rooftop transit hub on top: station roof, AC units, billboards, the Covenant device by the tower base.

### M2 Low Tide: morning
- Harbor-side vault. Docks and stacked shipping containers outside (multi-level via container stacks and ramps), a vault entrance leading down into a flooded server room (shallow water, server racks, catwalks above the water).
- Plant point: the Covenant server inside the vault; hold area around it.

### M3 Dead Air: dusk
- City blackout streets. Three devices spread across one city block. Flickering streetlights, dark windows, cars, storefronts, an alley, a small plaza; some rooftops reachable by stairs/fire escapes.

## Asset list to restyle / build
Characters (rigged, existing rig + clips reused):
1-5. Operatives: Rhea, Kade, Yuna, Tomas, Amara.
6-11. Enemies: guard, heavy, sniper, commander, drone, turret.
Weapons:
12-21. Vex P9, Harrow .45, Bulldog R6, AR-7 Lance, Kestrel, Warden, Grinder, Hailstorm, Longshot, Javelin.
Objective props:
22-23. Covenant device, counter-charge.
Ability props: smoke canister, flash orb, decoy puck, sensor, recon drone (Civic Shield).
City kit: wall modules, windows, doors, stairs, ramps, fire escape, railings, rooftop parts, AC units, vents, pipes, billboards, signs, streetlights, cars, crates, barrels, containers, dock pieces, server racks, catwalks, water plane, storefronts, trees/planters, the Civic Shield tower.
Maps: M1, M2, M3 assembled from the kit, with colliders for gameplay.

## Then: wire into the game in one pass
Rigged enemies with weapons and animations, first-person weapon viewmodel, weapon picker and stats, ability effects driving gameplay, objective props, new maps with colliders and spawn/guard/objective points.

## UI style (chosen 2026-11-08): D. Comic bold
- Panels: yellow #ffd23b, ink/outline #111, 3px solid outline, 4px radius, hard offset shadow 3px 3px 0 #111, skewX(-8deg) with text un-skewed.
- Font: Impact / Arial Black stack for numbers and labels; fall back to bold sans.
- Bars: health red #e63946 on #3a1014, shield blue #1d9bf0; accent on yellow panels is #111, key letters (Q/F) black.
- Crosshair: black center-gap cross with white outline for contrast; hit marker red; headshot marker yellow.
- Applies to: in-game HUD (timer/objective, minimap, kill feed, defuse/plant bar, radio subtitle, health/shield, ability slots, weapon + ammo), briefing, pause, end screens, mission select.
- Layout reference: top-center timer+objective, top-left minimap, top-right kill feed, bottom-left health/shield, bottom-center Q/F slots, bottom-right weapon + ammo, radio subtitle above bottom row.

## Mobile / touch (decided 2026-11-09)
- Targets: phones in landscape (min ~640x360) + tablets. Portrait shows a "rotate your device" card.
- Layout: floating move stick on the left half; drag anywhere on the right half to look.
- Trigger: player chooses in settings: FIRE button (drag on it to aim while shooting) or auto-fire when crosshair is on an enemy.
- Aim assist on touch AND PC (slowdown + light pull near enemies), toggle in settings.
- Buttons kept minimal: FIRE (if chosen), AIM (ADS toggle), JUMP, ability Q/F slots as tap buttons,
  context USE button (DEFUSE/PLANT, hold) only near the objective, tap the weapon panel to swap. Reload is automatic on empty.
- Settings: look sensitivity + button size/opacity sliders (fixed positions).
- Auto quality: on mobile or sustained low FPS, lower resolution, shrink or drop shadows, fewer lights. Target 30+ FPS.
- HUD style D stays; scales down for small screens.
