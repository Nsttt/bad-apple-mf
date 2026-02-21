import fs from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';

const args = new Map();
for (const part of process.argv.slice(2)) {
  const [key, value] = part.split('=');
  if (key?.startsWith('--')) args.set(key.slice(2), value ?? true);
}

const frameCountArg = Number(args.get('frames') || 0);
const startArg = Number(args.get('start') || 1);
const endArg = args.has('end') ? Number(args.get('end')) : 0;
const width = Number(args.get('width') || 320);
const height = Number(args.get('height') || 240);
const pixelSize = Number(args.get('pixel') || 6);
const colsArg = args.get('cols');
const rowsArg = args.get('rows');
const threshold = Number(args.get('threshold') || 140);
const invert = Boolean(args.get('invert'));
const layers = Number(args.get('layers') || 6);
const basePort = Number(args.get('port') || 4100);
const outDir = path.resolve(args.get('out') || 'apps/frames');
const version = '2.0.0-beta.2';
const mfPluginVersion = '^2.0.1';
const zephyrPluginVersion = '^0.1.10';
const enableZephyr = String(args.get('zephyr') || '0') === '1';

const framesDir = args.get('frames-dir')
  ? path.resolve(String(args.get('frames-dir')))
  : null;
const usePngFrames = Boolean(framesDir);
const assetBaseArg = args.get('asset-base');
const assetBase = assetBaseArg
  ? String(assetBaseArg).replace(/\/$/, '')
  : null;

const pad = (value) => String(value).padStart(4, '0');

const exists = async (target) => {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
};

function mulberry32(seed) {
  let t = seed + 0x6d2b79f5;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function buildCss(id) {
  const seed = Number(id);
  const rand = mulberry32(seed);
  const gradients = [];
  for (let i = 0; i < layers; i += 1) {
    const x = Math.round(10 + rand() * 80);
    const y = Math.round(10 + rand() * 80);
    const size = Math.round(12 + rand() * 28);
    gradients.push(
      `radial-gradient(circle at ${x}% ${y}%, #111 0 ${size}%, transparent ${size + 1}%)`,
    );
  }

  return (
    `.frame-root.frame-${id} {\n` +
    `  background-color: #f2f2f2;\n` +
    `  background-image: ${gradients.join(',\n    ')};\n` +
    `  filter: contrast(1.2) grayscale(1);\n` +
    `}\n`
  );
}

function buildCanvasFrameJs(id, bitmapBase64, cols, rows) {
  return (
    `const width = ${cols};\n` +
    `const height = ${rows};\n` +
    `const bitmapBase64 = '${bitmapBase64}';\n` +
    `const dark = 17;\n` +
    `const light = 244;\n` +
    `let bitmapBytes;\n` +
    `let canvas;\n` +
    `let rendered = false;\n` +
    `export const id = '${id}';\n` +
    `const decodeBitmap = () => {\n` +
    `  if (bitmapBytes) return bitmapBytes;\n` +
    `  const binary = atob(bitmapBase64);\n` +
    `  const bytes = new Uint8Array(binary.length);\n` +
    `  for (let i = 0; i < binary.length; i += 1) {\n` +
    `    bytes[i] = binary.charCodeAt(i) & 255;\n` +
    `  }\n` +
    `  bitmapBytes = bytes;\n` +
    `  return bytes;\n` +
    `};\n` +
    `const ensureCanvas = () => {\n` +
    `  if (!canvas) {\n` +
    `    canvas = document.createElement('canvas');\n` +
    `    canvas.width = width;\n` +
    `    canvas.height = height;\n` +
    `    canvas.style.width = '100%';\n` +
    `    canvas.style.height = '100%';\n` +
    `    canvas.style.display = 'block';\n` +
    `    canvas.style.imageRendering = 'pixelated';\n` +
    `  }\n` +
    `  if (rendered) return canvas;\n` +
    `  const ctx = canvas.getContext('2d', { alpha: false });\n` +
    `  if (!ctx) throw new Error('2D context unavailable');\n` +
    `  const image = ctx.createImageData(width, height);\n` +
    `  const out = image.data;\n` +
    `  const bits = decodeBitmap();\n` +
    `  const total = width * height;\n` +
    `  for (let i = 0; i < total; i += 1) {\n` +
    `    const on = (bits[i >> 3] & (1 << (i & 7))) !== 0;\n` +
    `    const v = on ? dark : light;\n` +
    `    const p = i * 4;\n` +
    `    out[p] = v;\n` +
    `    out[p + 1] = v;\n` +
    `    out[p + 2] = v;\n` +
    `    out[p + 3] = 255;\n` +
    `  }\n` +
    `  ctx.putImageData(image, 0, 0);\n` +
    `  rendered = true;\n` +
    `  return canvas;\n` +
    `};\n` +
    `export function mount(target) {\n` +
    `  const root = document.createElement('div');\n` +
    `  root.className = 'frame-root frame-${id}';\n` +
    `  root.style.position = 'relative';\n` +
    `  root.style.width = 'var(--frame-width, ${width}px)';\n` +
    `  root.style.height = 'var(--frame-height, ${height}px)';\n` +
    `  root.style.overflow = 'hidden';\n` +
    `  root.style.background = '#f4f4f4';\n` +
    `  root.appendChild(ensureCanvas());\n` +
    `  target.replaceChildren(root);\n` +
    `}\n` +
    `export function unmount(target) {\n` +
    `  target.replaceChildren();\n` +
    `}\n`
  );
}

function buildFrameJs(id, innerHtml, css) {
  const baseCss =
    `.frame-root {\n` +
    `  position: relative;\n` +
    `  width: var(--frame-width, ${width}px);\n` +
    `  height: var(--frame-height, ${height}px);\n` +
    `  overflow: hidden;\n` +
    `}\n`;

  const cssText = JSON.stringify(`${baseCss}\n${css}`);
  const htmlText = JSON.stringify(
    `<div class=\"frame-root frame-${id}\">${innerHtml}</div>`,
  );

  return (
    `const css = ${cssText};\n` +
    `const html = ${htmlText};\n` +
    `let styleEl;\n` +
    `export const id = '${id}';\n` +
    `export function mount(target) {\n` +
    `  if (!styleEl) {\n` +
    `    styleEl = document.createElement('style');\n` +
    `    styleEl.dataset.frame = '${id}';\n` +
    `    styleEl.textContent = css;\n` +
    `    document.head.appendChild(styleEl);\n` +
    `  }\n` +
    `  target.innerHTML = html;\n` +
    `}\n` +
    `export function unmount(target) {\n` +
    `  target.innerHTML = '';\n` +
    `  if (styleEl) {\n` +
    `    styleEl.remove();\n` +
    `    styleEl = null;\n` +
    `  }\n` +
    `}\n`
  );
}

function buildRsbuildConfig(id, port) {
  const scope = `frame_${id}`;
  const assetPrefix = assetBase ? `${assetBase}/frame-${id}/` : './';
  const zephyrImports = enableZephyr
    ? `import { withZephyr } from 'zephyr-rsbuild-plugin';\n\n`
    : '';
  const zephyrPlugin = enableZephyr ? `    withZephyr(),\n` : '';
  return (
    `import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';\n` +
    `import { defineConfig } from '@rsbuild/core';\n\n` +
    zephyrImports +
    `export default defineConfig({\n` +
    `  output: {\n` +
    `    assetPrefix: '${assetPrefix}',\n` +
    `  },\n` +
    `  server: {\n` +
    `    port: ${port},\n` +
    `  },\n` +
    `  source: {\n` +
    `    entry: {\n` +
    `      index: './src/frame.js',\n` +
    `    },\n` +
    `  },\n` +
    `  plugins: [\n` +
    `    pluginModuleFederation({\n` +
    `      name: '${scope}',\n` +
    `      // Stable entry filename so the host can skip mf-manifest.json.\n` +
    `      filename: 'static/js/remoteEntry.js',\n` +
    `      exposes: {\n` +
    `        './Frame': './src/frame.js',\n` +
    `      },\n` +
    `      shared: {},\n` +
    `      experiments: {\n` +
    `        // Use the host's MF runtime (see host: provideExternalRuntime).\n` +
    `        externalRuntime: true,\n` +
    `      },\n` +
    `    }),\n` +
    zephyrPlugin +
    `  ],\n` +
    `  tools: {\n` +
    `    rspack: {\n` +
    `      output: {\n` +
    `        uniqueName: '${scope}',\n` +
    `      },\n` +
    `    },\n` +
    `  },\n` +
    `});\n`
  );
}

function buildPackageJson(id) {
  const devDeps = {
    '@module-federation/rsbuild-plugin': mfPluginVersion,
    '@rsbuild/core': version,
  };
  if (enableZephyr) devDeps['zephyr-rsbuild-plugin'] = zephyrPluginVersion;

  return JSON.stringify(
    {
      name: `@bad-apple/frame-${id}`,
      private: true,
      version: '0.0.0',
      type: 'module',
      scripts: {
        dev: 'rsbuild dev',
        build: 'rsbuild build',
        preview: 'rsbuild preview',
      },
      devDependencies: devDeps,
    },
    null,
    2,
  );
}

async function readPng(filePath) {
  const buffer = await fs.readFile(filePath);
  return PNG.sync.read(buffer);
}

function sampleFrameBitmap(png, cols, rows) {
  const totalPixels = cols * rows;
  const bits = new Uint8Array(Math.ceil(totalPixels / 8));
  const cellW = png.width / cols;
  const cellH = png.height / rows;
  const data = png.data;

  for (let row = 0; row < rows; row += 1) {
    const yStart = Math.floor(row * cellH);
    const yEnd = Math.max(yStart + 1, Math.floor((row + 1) * cellH));
    for (let col = 0; col < cols; col += 1) {
      const xStart = Math.floor(col * cellW);
      const xEnd = Math.max(xStart + 1, Math.floor((col + 1) * cellW));
      let total = 0;
      let count = 0;
      for (let y = yStart; y < yEnd; y += 1) {
        for (let x = xStart; x < xEnd; x += 1) {
          const idx = (y * png.width + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          total += 0.299 * r + 0.587 * g + 0.114 * b;
          count += 1;
        }
      }
      const avg = total / Math.max(1, count);
      const isDark = invert ? avg > threshold : avg < threshold;
      if (isDark) {
        const bit = row * cols + col;
        bits[bit >> 3] |= 1 << (bit & 7);
      }
    }
  }

  return Buffer.from(bits).toString('base64');
}

async function resolveFramePath(index, frameMap) {
  const fromMap = frameMap.get(index);
  if (fromMap) return fromMap;
  const candidates = [
    `frame${index}.png`,
    `frame${pad(index)}.png`,
    `frame-${pad(index)}.png`,
  ];
  for (const candidate of candidates) {
    const full = path.join(framesDir, candidate);
    if (await exists(full)) return full;
  }
  throw new Error(`Missing frame image for index ${index}`);
}

await fs.mkdir(outDir, { recursive: true });

const startIndex = Math.max(1, Number.isFinite(startArg) ? startArg : 1);
let endIndex = endArg || frameCountArg || 120;
const frameMap = new Map();

if (usePngFrames) {
  const files = await fs.readdir(framesDir);
  for (const file of files) {
    const match = file.match(/^frame[-_]?([0-9]+)\.png$/i);
    if (!match) continue;
    const index = Number(match[1]);
    if (!Number.isNaN(index)) frameMap.set(index, path.join(framesDir, file));
  }
  if (!frameMap.size) {
    throw new Error('No frame*.png files found in frames-dir');
  }
  if (!endArg && !frameCountArg) {
    endIndex = Math.max(...frameMap.keys());
  }
}

if (!Number.isFinite(endIndex) || endIndex < startIndex) {
  throw new Error(`Invalid range: start=${startIndex} end=${endIndex}`);
}

const cols = colsArg ? Number(colsArg) : Math.max(1, Math.floor(width / pixelSize));
const rows = rowsArg ? Number(rowsArg) : Math.max(1, Math.floor(height / pixelSize));

for (let i = startIndex; i <= endIndex; i += 1) {
  const id = pad(i);
  const frameDir = path.join(outDir, `frame-${id}`);
  const srcDir = path.join(frameDir, 'src');

  await fs.mkdir(srcDir, { recursive: true });

  let frameJs = '';
  let css = buildCss(id);

  if (usePngFrames) {
    const framePath = await resolveFramePath(i, frameMap);
    const png = await readPng(framePath);
    const bitmapBase64 = sampleFrameBitmap(png, cols, rows);
    frameJs = buildCanvasFrameJs(id, bitmapBase64, cols, rows);
    css = `.frame-root.frame-${id} {\n  background: #f4f4f4;\n}\n`;
  } else {
    frameJs = buildFrameJs(id, '', css);
  }

  const rsbuildConfig = buildRsbuildConfig(id, basePort + i);
  const pkgJson = buildPackageJson(id);

  await fs.writeFile(path.join(frameDir, 'package.json'), `${pkgJson}\n`);
  await fs.writeFile(path.join(frameDir, 'rsbuild.config.mjs'), rsbuildConfig);
  await fs.writeFile(path.join(srcDir, 'frame.js'), frameJs);
  await fs.writeFile(path.join(srcDir, 'frame.css'), css);
}

console.log(`Generated frames ${pad(startIndex)}..${pad(endIndex)} in ${outDir}`);
