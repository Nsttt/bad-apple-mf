# Bad Apple MF

Monorepo with one host and many module federation remotes (one per frame). Remotes export HTML + CSS payloads and are loaded at runtime.

“Bad Apple!!” is a well-known Touhou Project fan PV (shadow art) set to the song “Bad Apple!!”.

Video: `https://www.youtube.com/watch?v=FtutLA63Cp8`

![Host screenshot](docs/screenshot-host.png)

## Quick start

1. Install

```sh
pnpm install
```

1. Extract PNG frames (requires `yt-dlp` + `ffmpeg`)

```sh
yt-dlp -o frames/bad-apple.%(ext)s "https://www.youtube.com/watch?v=FtutLA63Cp8"
ffmpeg -i frames/bad-apple.* -vf fps=24 frames/frame%04d.png
```

1. Generate per-frame remotes from PNGs (generated output is gitignored)

```sh
pnpm frames:generate --frames-dir=./frames --frames=5258 --width=480 --height=360 --pixel=4 --threshold=140
```

1. Patch existing generated frames (safe to run; output is gitignored)

```sh
pnpm frames:patch:origin-pixel
pnpm frames:patch:external-runtime
```

1. Build all remotes + serve them

```sh
pnpm frames:build:all:rs
pnpm frames:serve
```

1. Run host

```sh
pnpm host:dev
```

Open `http://localhost:3000`.

## Audio

Drop an mp3 at `apps/host/public/bad-apple.mp3` (gitignored). Host loads it via `apps/host/public/index.html` (`window.__BAD_APPLE__.audioUrl`).

## PNG frames -> CSS (node)

```sh
pnpm frames:generate \
  --frames-dir=./frames \
  --frames=5258 \
  --width=480 \
  --height=360 \
  --pixel=4 \
  --threshold=140
```

Notes:
- `--pixel` controls downscale (bigger = fewer points, lighter CSS).
- Or specify `--cols` / `--rows` directly.
- Keep host `frameWidth`/`frameHeight` aligned with `--width`/`--height`.

## MF Runtime (External Runtime)

Frame remotes are built with `experiments.externalRuntime: true`, so they do not bundle their own MF runtime.
Host is built with `experiments.provideExternalRuntime: true` and supplies the runtime.

Files:
- Host: `apps/host/rsbuild.config.ts`
- Frame generator: `scripts/generate-frames.mjs`
- Patch existing frames: `pnpm frames:patch:external-runtime`

## Config

- Host runtime config: `apps/host/public/index.html` (`window.__BAD_APPLE__`)
- Frame generator: `scripts/generate-frames.mjs`
- Frame remotes (generated): `apps/frames/frame-0001` etc (gitignored)

## Notes

- `scripts/serve-frames.mjs` serves `apps/frames/*/dist` with CORS for the host runtime.
- It also rewrites each `mf-manifest.json` `publicPath` so MF loads the frame assets from `http://localhost:4173/frame-XXXX/` (avoids `RUNTIME-008`).
- Frame remotes use `mf-manifest.json` via `@module-federation/rsbuild-plugin`.
- Placeholder mode uses gradients; PNG mode now renders compact bitmap data via `<canvas>`.
- Frame server now applies cache headers by asset type and serves Brotli/gzip when supported.

## Optimization: Remote Entry First (Default)

The host defaults to `remoteEntry` mode (skips one `mf-manifest.json` fetch per frame).

If you need manifest-based features (prefetch metadata, manifest indirection), switch back to `manifest` mode:

1. Patch frame configs (generated, gitignored) to emit a stable remote entry filename:

```sh
pnpm frames:patch:remoteentry
```

2. Ensure each frame builds with an absolute `assetPrefix` (needed so `remoteEntry.js` can fetch its async chunks from the frame server, not the host origin):

```sh
pnpm frames:patch:assetprefix:force
```

3. Rebuild frames, then set host config:
`apps/host/public/index.html`:

```js
window.__BAD_APPLE__ = {
  // ...
  remoteMode: 'manifest',
};
```

## CDN / Edge

- Put frame assets behind a CDN and preserve origin response headers.
- Recommended behavior in `scripts/serve-frames.mjs`:
  - Hashed assets (`*.hash.js/css`): `public, max-age=31536000, immutable`
  - `static/js/remoteEntry.js` and `mf-manifest.json`: `public, max-age=60, must-revalidate`
- Compression: Brotli preferred, gzip fallback (`Accept-Encoding` aware).
