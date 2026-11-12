# Strike Zone marketing media

Captured from a frozen snapshot of commit 93086b4, made with `git worktree` and served on port 8766. The game ran in system Google Chrome with the GPU on (Intel HD 2500).

- `screenshots/`: 12 shots at 1920x1080 with the HUD. `portrait/` has 4 at 1080x1920. `covers/` has the CrazyGames covers at 1920x1080, 800x1200 and 800x470, each with a title overlay.
- `clips/`: 5 looping clips of 8.5-9.5 s. Each comes as 16:9 1920x1080 H.264 mp4 and 9:16 1080x1920 mp4, plus lightweight VP9 webm versions at 720p and 540x960. The clips have no HUD and no audio.
- `trailer/`: a 58 s trailer in 16:9 and 9:16 with title cards and the game's own procedural music and SFX, recorded live from the AudioContext.
- `raw/`: source captures. This folder is gitignored because it is about 270 MB.

## Re-making it
    # serve a snapshot on :8766, then:
    NODE_PATH=tests/node_modules node tools/capture_media.cjs [only=scene,...]   # writes media/raw
    SHOTS=... PORTRAIT=... CLIPS=... CUTS=... bash tools/capture_media.sh       # ffmpeg edit; see the variables at the top of the script

How the capture works:
- The game is driven through the `?test=1&debug=1` API. An in-page aim bot tracks enemy heads, fires, strafes and uses abilities on a schedule. The player's health is held at 80 or above.
- Clips are rendered offline. Each frame calls `__game.step(1/30)` and then saves the canvas as a JPEG, so the video is a smooth 30 fps even though this GPU drops to about 10 fps in combat at 1080p. Recording in real time with MediaRecorder stuttered, so it was not used for video.
- The audio comes from a separate 75 s real-time run of the boss mission. It is captured by tapping `AudioNode.connect` into a MediaStreamDestination.
- Vertical versions are a centered 608x1080 crop around the crosshair, scaled up. They are not letterboxed.

Editing was done with ffmpeg. OpenMontage (github.com/calesthio/OpenMontage) is an agentic AI video-production framework built on top of ffmpeg, with LLM pipelines and many dependencies. It is not a quick-install editor, so plain ffmpeg was the faster and more predictable choice.
