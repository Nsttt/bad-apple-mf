# Bad Apple MF

Monorepo with one host and many module federation remotes (one per frame). Remotes export HTML + CSS payloads and are loaded at runtime.

![Host screenshot](docs/screenshot.png)

## Quick start

```sh
pnpm install

# 1) Extract PNG frames from the video (requires yt-dlp + ffmpeg)
yt-dlp -o frames/bad-apple.%(ext)s "https://www.youtube.com/watch?v=FtutLA63Cp8"
ffmpeg -i frames/bad-apple.* -vf fps=24 frames/%05d.png

# 2) Generate per-frame remotes from PNGs (code-only, generated output is gitignored)
pnpm frames:generate --frames-dir=./frames --frames=5258 --width=480 --height=360 --pixel=6 --threshold=140

# 3) Build all remotes + serve them
pnpm frames:build:all:rs
pnpm frames:serve

# 4) Run host
pnpm host:dev
```

Open `http://localhost:3000`.

## Audio

Drop an mp3 at `apps/host/public/bad-apple.mp3` (gitignored). Host will auto-load it via `window.__BAD_APPLE__.audioUrl`.

## PNG frames -> CSS (node)

```sh
pnpm frames:generate \
  --frames-dir=./frames \
  --frames=5258 \
  --width=480 \
  --height=360 \
  --pixel=6 \
  --threshold=140
```

Notes:
- `--pixel` controls downscale (bigger = fewer points, lighter CSS).
- Or specify `--cols` / `--rows` directly.
- Keep host `frameWidth`/`frameHeight` aligned with `--width`/`--height`.

## Config

- Host runtime config: `apps/host/public/index.html` (`window.__BAD_APPLE__`)
- Frame generator: `scripts/generate-frames.mjs`
- Frame remotes (generated): `apps/frames/frame-0001` etc (gitignored)

## Notes

- `scripts/serve-frames.mjs` serves `apps/frames/*/dist` with CORS for the host runtime.
- Frame remotes use `mf-manifest.json` via `@module-federation/rsbuild-plugin`.
- Placeholder CSS uses gradients; PNG mode uses box-shadow pixels.
