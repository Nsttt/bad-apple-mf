import fs from 'node:fs/promises';
import path from 'node:path';

const args = new Map();
for (const part of process.argv.slice(2)) {
  const [key, value] = part.split('=');
  if (key?.startsWith('--')) args.set(key.slice(2), value ?? true);
}

const start = Number(args.get('start') || 1);
const endArg = args.has('end') ? Number(args.get('end')) : 0;
const clean = String(args.get('clean') ?? '1') !== '0';
const framesRoot = path.resolve(String(args.get('frames-root') || 'apps/frames'));
const cdnPublic = path.resolve(
  String(args.get('cdn-public') || 'apps/frames-cdn/public'),
);

const pad = (value) => String(value).padStart(4, '0');

async function listFrameDirs(root) {
  const ents = await fs.readdir(root, { withFileTypes: true });
  const frames = [];
  for (const ent of ents) {
    if (!ent.isDirectory()) continue;
    const m = ent.name.match(/^frame-([0-9]{4})$/);
    if (!m) continue;
    frames.push(Number(m[1]));
  }
  frames.sort((a, b) => a - b);
  return frames;
}

async function rmIfExists(target) {
  try {
    await fs.rm(target, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

await fs.mkdir(cdnPublic, { recursive: true });

const frames = await listFrameDirs(framesRoot);
if (!frames.length) {
  throw new Error(`no frame-XXXX dirs found under ${framesRoot}`);
}

const end = endArg || frames[frames.length - 1];
if (!Number.isFinite(end) || end < start) {
  throw new Error(`invalid range start=${start} end=${end}`);
}

if (clean) {
  // Remove previously packed frames (generated).
  const existing = await listFrameDirs(cdnPublic).catch(() => []);
  await Promise.all(existing.map((n) => rmIfExists(path.join(cdnPublic, `frame-${pad(n)}`))));
}

let copied = 0;
for (let i = start; i <= end; i += 1) {
  const id = pad(i);
  const src = path.join(framesRoot, `frame-${id}`, 'dist');
  const dst = path.join(cdnPublic, `frame-${id}`);

  try {
    await fs.access(src);
  } catch {
    throw new Error(`missing dist for frame-${id}: ${src}`);
  }

  await rmIfExists(dst);
  await fs.mkdir(dst, { recursive: true });
  await fs.cp(src, dst, { recursive: true });
  copied += 1;
  if (copied % 250 === 0) {
    console.log(`packed ${copied}/${end - start + 1}`);
  }
}

console.log(`packed frames ${pad(start)}..${pad(end)} into ${cdnPublic}`);

