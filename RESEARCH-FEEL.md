# Strike Zone: Gameplay Feel & Retention Research (CrazyGames Target)

This document provides a concise, prioritized roadmap of 25 concrete, implementable gameplay-feel and retention features tailored for **Strike Zone** on **CrazyGames** and mobile web.

Every recommendation is selected to run smoothly on low-end hardware (Intel HD 2500, budget Mali/Adreno mobile GPUs) using vanilla Three.js and zero per-frame allocations in hot loops.

---

## 1. Current Baseline Audit (What Already Exists in `game.js`)
To avoid redundant effort, the following features are already implemented and should be preserved:
- Basic 2D crosshair hitmarker (`hitMarker()`) with head/kill CSS states and simple synth click.
- Viewmodel recoil animation with pitch recovery (`W.recoverP`) and ADS zoom.
- Directional damage arc indicators (`dmgDirs`) and full-screen hurt/flash overlays.
- 12-mission campaign structure, procedural districts, breachable walls, explosive barrels, intel pickups.
- 8 tactical abilities (smoke, flash, dash, sensor, shield, decoy, lockdown, drone).
- Audio system in `game/audio.js` with basic procedural sound effects (shot, hit, kill, hurt, step).
- Basic CrazyGames SDK hooks for `loadingStart`/`loadingStop`, `gameplayStart`/`gameplayStop`, `happytime()`, and rewarded ads for XP double and revive.

---

## 2. Top 25 Prioritized Gameplay-Feel & Retention Features

### Group A: Hit Feedback & Impact Juice

#### 1. Floating Damage Numbers (Combat Text)
- **What**: Pop up small floating numbers (+24 body, +72 critical gold, +15 shield cyan) at the hit point in 3D space, drifting upward and fading over 0.6s.
- **Why It Works**: Instantly communicates weapon damage output, range drop-off, and headshot confirmations (huge dopamine hook in Krunker and Borderlands).
- **Three.js Implementation Hint**: Use a fixed pool of 16 pre-created absolute-positioned `<span>` elements projected via `Vector3.project(camera)` inside a shared `_vec3` scratch variable to eliminate garbage collection.

#### 2. Pitch-Escalating Hit Sound Clinks
- **What**: Each consecutive bullet hit landed within 1.2s plays the hit sound at +1 semitone higher pitch (`playbackRate` or Web Audio `osc.frequency.value *= 1.059`), resetting on miss.
- **Why It Works**: Creates an auditory "drum roll" reward for tracking targets accurately (standard feel anchor in Battlefield and COD).
- **Three.js Implementation Hint**: Maintain a scalar `comboHits` counter and set audio oscillator base frequency to `880 * Math.pow(1.06, Math.min(8, comboHits))`.

#### 3. Shield Crunch & Particle Shatter
- **What**: When bullet damage reduces an enemy's or player's shield to zero, play a high-frequency glass-crunch sound and spawn 6 tiny glowing hex fragments that fling outward.
- **Why It Works**: Provides unambiguous tactical clarity that the target is now vulnerable to base health damage (core feature in Valorant and Apex).
- **Three.js Implementation Hint**: Spawn a static pre-allocated `InstancedMesh` of 12 hex quads initialized with outward velocity vectors and animate alpha to zero over 0.25s.

#### 4. Directional Camera Flinch (Micro-Punch)
- **What**: Taking damage tilts the player's camera by 0.012 radians away from the bullet vector and drops camera Y by 0.02m for 80ms before spring-recovering.
- **Why It Works**: Gives physical weight and threat to enemy incoming fire without disrupting the player's aim reticle permanently.
- **Three.js Implementation Hint**: Add `_camPunch.set(pitchOffset, yawOffset, 0)` into `camera.rotation` during `updateCamera()` decayed by `dt * 18`.

---

### Group B: Kill Satisfaction & Streaks

#### 5. Center-Screen Skull / Elimination Stamp
- **What**: On scoring a kill, display a bold vector skull badge with "ELIMINATED [UNIT]" in center-screen that scales down from 1.5x to 1.0x with a snappy spring, fading out over 1.2s.
- **Why It Works**: Elevates a kill from a routine feed line into a celebratory milestone; critical for streamer appeal and instant gratification.
- **Three.js Implementation Hint**: Trigger CSS keyframe animation (`transform: scale(1)`) on a single static `#killBadge` DOM node with zero Three.js draw call cost.

#### 6. Ragdoll Directional Inertia Impulse on Death
- **What**: When an enemy dies, instead of simply playing a canned death clip in place, transfer bullet momentum into the root position (`pos.addScaledVector(bulletDir, impulse)`) decaying over 0.4s while playing death animation.
- **Why It Works**: Eliminates static "paper cutout" deaths and gives shotguns and snipers visceral stopping power.
- **Three.js Implementation Hint**: Set `enemy._deathVel.copy(hitDir).multiplyScalar(killedByHeavy ? 6.0 : 2.5)` and add `_deathVel * dt` to `enemy.pos` in `Enemy.update()`.

#### 7. Multi-Kill Stinger Musical Progression
- **What**: Rapid kills within 4 seconds trigger an ascending musical triad stinger (Kill 1 = root chord, Kill 2 = Double Kill major 3rd, Kill 3 = Triple Kill 5th, Kill 4+ = octave fanfare).
- **Why It Works**: Drives arcade frenzy and risk-taking behavior as players push aggressively to keep the multi-kill timer alive (proven in Halo and Unreal Tournament).
- **Three.js Implementation Hint**: Use a simple two-oscillator synth chord in `game/audio.js` evaluated on `stats.kills` timestamp delta.

#### 8. Lethal Headshot Micro Hit-Stop
- **What**: On landing a finishing headshot, pause the world clock (`dt = 0.002` for 30ms or 2 frames) while camera micro-shakes, then resume full speed.
- **Why It Works**: Classic fighting-game "hit stop" technique that gives critical sniper and deagle shots immense kinetic impact.
- **Three.js Implementation Hint**: Set a global `hitStopT = 0.035` and multiply game logic `dt` by `0.1` while `hitStopT > 0`.

---

### Group C: Movement Feel & Kinematics

#### 9. Crouch-Slide Mechanic
- **What**: Pressing `C` or `Ctrl` while running triggers a 0.45-second crouch slide with 1.35x initial speed, decaying to walk speed, lowering camera height to 0.95m.
- **Why It Works**: The single most requested movement mechanic in modern browser FPS games (Krunker slide-hopping, Apex Legends, COD Warzone); transforms traversal into an active skill.
- **Three.js Implementation Hint**: In `updatePlayer()`, if sprinting and duck pressed, lock velocity vector `player.vel.copy(forward).multiplyScalar(speedBoost)` and interpolate `CFG.eye` to `0.95` via `MathUtils.lerp`.

#### 10. Dynamic Velocity & Sprint FOV Kick
- **What**: Sprints, slides, and dashes smoothly kick the camera FOV out by +4° (sprint) and +8° (slide/dash), snapping back when stopping.
- **Why It Works**: Creates the illusion of raw speed and momentum without altering base physics values.
- **Three.js Implementation Hint**: Set `camera.fov = baseFov + (player.moving ? (isSliding ? 8 : 4) : 0)` and call `camera.updateProjectionMatrix()` only when delta exceeds 0.1°.

#### 11. Viewmodel Weapon Inertia & Mouse Sway
- **What**: The first-person gun model lags behind rapid mouse turns by 2-3 frames with rotational roll, smoothing back to rest position with a spring.
- **Why It Works**: Removes the robotic "glued to camera" appearance of weapon meshes and conveys weapon weight and ergonomics.
- **Three.js Implementation Hint**: In `vm.update()`, lerp `vm.root.rotation.z += lookD.x * -0.0008` and `vm.root.position.x += lookD.x * -0.0003` with spring decay.

#### 12. Landing Compression Dip & Jump Squat
- **What**: Hitting the ground after falling dips the camera height down by 0.08m and weapon down by 0.04m, rebounding smoothly over 150ms.
- **Why It Works**: Connects the player physically to the environment and makes vertical parkour feel grounded.
- **Three.js Implementation Hint**: On `player.onGround && !wasOnGround`, set `_landDip = Math.min(0.12, Math.abs(player.vel.y) * 0.015)` and subtract from `camera.position.y` while decaying.

---

### Group D: Audio Polish & Audio Juice

#### 13. Low-Health Adrenaline Heartbeat & Tunnel Audio
- **What**: When HP drops below 25%, apply a Web Audio biquad low-pass filter (muffling ambient sounds) and play a heavy, pulsing heartbeat sound at 110 BPM.
- **Why It Works**: Creates high physiological tension, alerts the player subconsciously of danger without cluttering screen UI, and makes clutch survivals memorable.
- **Three.js Implementation Hint**: Route `sfx` gain nodes through an existing `BiquadFilterNode` with `filter.frequency.setTargetAtTime(player.hp < 25 ? 450 : 20000, ctx.currentTime, 0.1)`.

#### 14. Bullet Whiz-By / Near-Miss Supersonic Cracks
- **What**: Enemy bullets passing within 1.5m of the player's head trigger a short snap/whiz sound with stereo panning relative to bullet trajectory.
- **Why It Works**: Informs the player they are being shot at from a flank before they take direct health damage, enabling reactive evasive maneuvers.
- **Three.js Implementation Hint**: In `enemyFired()`, if bullet segment to player head closest distance `< 1.6` and `dmg === 0`, trigger `sfx.whiz(pan)`.

#### 15. Empty Chamber Dry-Fire "Click" on Auto-Trigger
- **What**: Holding LMB with zero ammo plays an immediate metallic hammer click and pulses the crosshair red, preventing confused trigger stalling.
- **Why It Works**: Clear tactile feedback so players don't wonder if the game dropped input or glitched.
- **Three.js Implementation Hint**: Fire `sfx.dryClick()` on mouse down when `mag === 0 && !reloading` with a 200ms debounce.

---

### Group E: Pacing & Mission Tension

#### 16. Final 30-Second Countdown Tension Escalation
- **What**: When the mission clock dips below 30 seconds, the timer pulses neon red, background drone pitch increases by 20%, and bomb/relay LEDs strobe at 4x speed.
- **Why It Works**: Paces mission climax, prevents passive camping, and triggers an adrenaline surge during extraction or final defuses.
- **Three.js Implementation Hint**: Modulate `d.lamp.visible = (clock < 30 ? Math.sin(elapsed * 16) : Math.sin(elapsed * 6)) > 0` directly on existing device meshes.

#### 17. Defusal / Plant Channeling Audio Acceleration
- **What**: While holding `E` to defuse or plant, the interaction beep frequency accelerates logarithmically (1 Hz at 0% -> 8 Hz at 90%), ending on a heavy metal chime.
- **Why It Works**: Mirrors the classic Counter-Strike bomb defusal tension; builds heart-pounding suspense during last-second plays.
- **Three.js Implementation Hint**: Trigger `sfx.beep(progress / targetTime)` where beep oscillator period is set to `Math.max(0.08, (1 - progressRatio) * 0.4)`.

#### 18. Dynamic Stealth-to-Combat Music/Drone Transition
- **What**: Atmospheric low ambient hum seamlessly introduces an energetic percussive pulse whenever `spotted > 0`, cooling off 4 seconds after enemies lose sight.
- **Why It Works**: Subconsciously reinforces player awareness of detection state without forcing them to stare at the minimap.
- **Three.js Implementation Hint**: Use a two-track Web Audio gain fader interpolating track gains over 1.0s depending on `spotted > 0`.

---

### Group F: First 30 Seconds & Frictionless Onboarding

#### 19. Frictionless First-Run Instant Action
- **What**: For first-time visitors (`progress === 0`), bypass the main menu, operative picker, and briefing screens entirely on "PLAY" click, dropping immediately into Mission 1 ("First Signal").
- **Why It Works**: CrazyGames platform data proves 60-70% of player churn occurs before the first gunshot if bogged down in menus or text boxes.
- **Three.js Implementation Hint**: In boot flow, if `progress === 0 && !store.get('sz_played')`, call `startMission(0, { route: 'assault' })` directly on initial canvas click.

#### 20. Diegetic World-Space Movement Hints
- **What**: Render floating faint cyan keys (`[ W, A, S, D ]` and `[ SHIFT: SPRINT ]`) on the pavement 3 meters in front of spawn that fade out permanently once passed.
- **Why It Works**: Zero-text tutorialization that works internationally across non-English speaking browser audiences without intrusive UI dialogs.
- **Three.js Implementation Hint**: Place a single quad mesh with canvas texture on the floor at spawn; set `mesh.visible = player.pos.distanceTo(spawn) < 4.0`.

#### 21. Guaranteed "First Blood" Encounter in Sector 1
- **What**: The very first enemy in Mission 1 is placed 12 meters ahead facing away from the player with a 1.2-second delayed alert reaction.
- **Why It Works**: Guarantees the player scores their first kill within 8 seconds of entering gameplay, cementing the core loop immediately.
- **Three.js Implementation Hint**: In `buildM1()`, set `map.guards[0].yaw = spawnYaw` and apply initial `reactionDelay = 1.2`.

---

### Group G: CrazyGames Monetization, SDK & Retention Loops

#### 22. Gated Mid-Roll Ad Placement on Natural Pauses
- **What**: Request mid-roll ads (`sdk(s => s.ad.requestAd('midroll'))`) strictly during natural gameplay breaks: on player death (before retry) or mission victory (before next briefing), never mid-combat.
- **Why It Works**: Mandatory for CrazyGames certification; prevents accidental ad interruptions during combat while maximizing ad impressions and game revenue.
- **Three.js Implementation Hint**: Wrap mid-roll calls in a 150-second debounce timer (`lastMidrollTime`), invoking `s.game.gameplayStop()` before and `s.game.gameplayStart()` on `adFinished`/`adError`.

#### 23. Instant "One-More-Run" Retry Loop
- **What**: Pressing `Space` or `R` on the Mission Failed screen restarts the level in under 200ms without reloading assets or showing black loading screens.
- **Why It Works**: Eliminates death frustration and taps into the addictive "just one more try" loop seen in Hotline Miami and Superhot.
- **Three.js Implementation Hint**: Listen for `Space` when `$('#end').classList.contains('show')` and immediately invoke `startMission(missionIdx)` without touching DOM overlays.

#### 24. "Next Mission" Preload & Seamless Level Handoff
- **What**: While the end-of-mission victory screen is showing, asynchronously parse and setup the next mission's collision bounds in the background.
- **Why It Works**: Cuts perceived loading time to 0 seconds, keeping player momentum unbroken throughout multi-mission sessions.
- **Three.js Implementation Hint**: Call `world.buildNav(MISSIONS[nextIdx].bounds)` during `showEnd()` so the next stage is hot in memory.

#### 25. High-Impact Post-Mission Reward Popups
- **What**: On completing a mission, show animated coin counters counting up (`+150 ◎`) and a level progress bar filling with a celebratory chime.
- **Why It Works**: Visual and auditory feedback of progression triggers dopamine and primes players to visit the shop to equip newly unlocked charms and weapon skins.
- **Three.js Implementation Hint**: Animate `#endXP` and `#passBar` width using standard CSS transitions triggered immediately upon `awardXP()`.

---

## 3. Implementation Priority Matrix

| Phase | Items | Focus Area | Expected Impact |
|---|---|---|---|
| **Phase 1: Instant Juice (Hours)** | 1, 2, 5, 8, 15 | Hit & Kill Satisfaction | Immediate transformation of shooting feel; makes guns feel crisp and rewarding. |
| **Phase 2: Traversal & Speed (1 Day)** | 9, 10, 11, 12 | Movement Mechanics & Kinematics | Elevates tactical mobility to match Krunker/COD standard with crouch-sliding and sway. |
| **Phase 3: Platform & Retention (1 Day)** | 19, 21, 22, 23, 24 | First 30s & CrazyGames SDK Hooks | Maximizes player acquisition, retention, and monetization without player annoyance. |
| **Phase 4: Immersion & Polish (1 Day)** | 3, 4, 6, 7, 13, 16, 17 | Audio/Visual Dramatic Tension | Delivers AAA-style atmosphere and combat tension during climactic mission moments. |
