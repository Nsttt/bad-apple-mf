import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('apps/frames');

const exists = async (p) => {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
};

function stripZephyrFromRsbuildConfig(src) {
  // Remove `import { withZephyr } ...` line (and adjacent blank line).
  src = src.replace(
    /\nimport\s+\{\s*withZephyr\s*\}\s+from\s+['"]zephyr-rsbuild-plugin['"];\n/g,
    '\n',
  );

  // Remove `withZephyr(),` from plugins list.
  src = src.replace(/\n\s*withZephyr\(\),\s*\n/g, '\n');
  src = src.replace(/\n\s*withZephyr\(\)\s*\n/g, '\n');

  return src;
}

async function stripZephyrFromPackageJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  const json = JSON.parse(raw);
  if (json?.devDependencies?.['zephyr-rsbuild-plugin']) {
    delete json.devDependencies['zephyr-rsbuild-plugin'];
    await fs.writeFile(filePath, JSON.stringify(json, null, 2) + '\n', 'utf8');
    return true;
  }
  return false;
}

async function main() {
  if (!(await exists(root))) {
    console.log(`no frames dir at ${root} (nothing to strip)`);
    return;
  }

  const entries = await fs.readdir(root, { withFileTypes: true });
  const frames = entries
    .filter((e) => e.isDirectory() && /^frame-[0-9]{4}$/.test(e.name))
    .map((e) => e.name)
    .sort();

  let cfgPatched = 0;
  let pkgPatched = 0;

  for (const frameDir of frames) {
    const cfgPath = path.join(root, frameDir, 'rsbuild.config.mjs');
    const pkgPath = path.join(root, frameDir, 'package.json');

    if (await exists(cfgPath)) {
      const before = await fs.readFile(cfgPath, 'utf8');
      const after = stripZephyrFromRsbuildConfig(before);
      if (after !== before) {
        await fs.writeFile(cfgPath, after, 'utf8');
        cfgPatched += 1;
      }
    }

    if (await exists(pkgPath)) {
      const changed = await stripZephyrFromPackageJson(pkgPath);
      if (changed) pkgPatched += 1;
    }
  }

  console.log(
    `strip-zephyr complete: frames=${frames.length} rsbuildPatched=${cfgPatched} packagePatched=${pkgPatched}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

