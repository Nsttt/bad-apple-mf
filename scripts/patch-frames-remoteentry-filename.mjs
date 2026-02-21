import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const framesRoot = path.join(root, 'apps', 'frames');

const exists = async (p) => {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
};

if (!(await exists(framesRoot))) {
  console.error(`missing: ${framesRoot}`);
  process.exit(1);
}

const entries = await fs.readdir(framesRoot, { withFileTypes: true });
const frameDirs = entries
  .filter((e) => e.isDirectory() && e.name.startsWith('frame-'))
  .map((e) => e.name)
  .sort();

let patched = 0;
let skipped = 0;
let missing = 0;

for (const dir of frameDirs) {
  const cfgPath = path.join(framesRoot, dir, 'rsbuild.config.mjs');
  if (!(await exists(cfgPath))) {
    missing += 1;
    continue;
  }

  const src = await fs.readFile(cfgPath, 'utf8');
  if (src.includes("filename: 'static/js/remoteEntry.js'")) {
    skipped += 1;
    continue;
  }

  const needle = "      name: 'frame_";
  const idx = src.indexOf(needle);
  if (idx === -1) {
    skipped += 1;
    continue;
  }

  // Insert just after the `name: 'frame_XXXX',` line (stable generator shape).
  const lineEnd = src.indexOf('\n', idx);
  if (lineEnd === -1) {
    skipped += 1;
    continue;
  }

  const insert =
    "      // Stable entry filename so the host can skip mf-manifest.json.\n" +
    "      filename: 'static/js/remoteEntry.js',\n";

  const next = src.slice(0, lineEnd + 1) + insert + src.slice(lineEnd + 1);
  await fs.writeFile(cfgPath, next, 'utf8');
  patched += 1;
}

console.log(
  JSON.stringify(
    { patched, skipped, missing, frames: frameDirs.length },
    null,
    2,
  ),
);
