import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import zlib from 'node:zlib';
import { promisify } from 'node:util';

const port = Number(process.env.PORT || 4173);
const root = path.resolve('apps/frames');
const logRequests = process.env.LOG === '1';
const brotliCompress = promisify(zlib.brotliCompress);
const gzipCompress = promisify(zlib.gzip);

const mime = {
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.map': 'application/json',
  '.wasm': 'application/wasm',
};

const compressibleContentTypes = [
  'application/javascript',
  'application/json',
  'application/wasm',
  'text/css',
  'text/html',
  'text/plain',
];

const isHashedAssetPath = (assetPath) =>
  /(?:^|\/)[^/]+\.[0-9a-f]{8,}\.[a-z0-9]+$/i.test(assetPath);

const getCacheControl = (assetPath) => {
  if (assetPath === 'mf-manifest.json' || assetPath === 'static/js/remoteEntry.js') {
    return 'public, max-age=60, must-revalidate';
  }
  if (isHashedAssetPath(assetPath)) {
    return 'public, max-age=31536000, immutable';
  }
  return 'public, max-age=600';
};

const maybeCompress = async (data, contentType, acceptEncoding) => {
  if (data.length < 1024) return { data, encoding: '' };
  if (!compressibleContentTypes.includes(contentType)) {
    return { data, encoding: '' };
  }

  const ae = (acceptEncoding || '').toLowerCase();
  if (ae.includes('br')) {
    const compressed = await brotliCompress(data, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: 5,
      },
    });
    return { data: compressed, encoding: 'br' };
  }

  if (ae.includes('gzip')) {
    const compressed = await gzipCompress(data, { level: 6 });
    return { data: compressed, encoding: 'gzip' };
  }

  return { data, encoding: '' };
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean);

    if (parts.length === 0) {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('Bad Apple frame server. Use /frame-0001/static/js/remoteEntry.js');
      if (logRequests) console.log(`${req.method} ${url.pathname} 200`);
      return;
    }

    const frameName = parts.shift();
    let rest = parts.join('/');
    if (!rest || rest.endsWith('/')) {
      rest = 'mf-manifest.json';
    }

    const filePath = path.join(root, frameName, 'dist', rest);
    const ext = path.extname(filePath);

    // MF runtime treats mf-manifest.json's `publicPath` as the base for loading
    // remoteEntry + async chunks. If frames are built with relative publicPath
    // (eg "./"), the runtime will try to load from the host origin. Rewrite
    // to the current frame server origin to make local dev "just work".
    if (rest === 'mf-manifest.json') {
      const raw = await fs.readFile(filePath, 'utf8');
      const json = JSON.parse(raw);
      const host = req.headers.host || `localhost:${port}`;
      const origin = `http://${host}`.replace(/\/$/, '');
      json.metaData = json.metaData || {};
      json.metaData.publicPath = `${origin}/${frameName}/`;

      const data = Buffer.from(JSON.stringify(json, null, 2));
      const { data: body, encoding } = await maybeCompress(
        data,
        'application/json',
        req.headers['accept-encoding'],
      );
      const headers = {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
        'cache-control': getCacheControl(rest),
        vary: 'Accept-Encoding',
      };
      if (encoding) headers['content-encoding'] = encoding;
      res.writeHead(200, {
        ...headers,
      });
      res.end(body);
      if (logRequests) console.log(`${req.method} ${url.pathname} 200`);
      return;
    }

    const data = await fs.readFile(filePath);
    const contentType = mime[ext] || 'application/octet-stream';
    const { data: body, encoding } = await maybeCompress(
      data,
      contentType,
      req.headers['accept-encoding'],
    );
    const headers = {
      'content-type': contentType,
      'access-control-allow-origin': '*',
      'cache-control': getCacheControl(rest),
      vary: 'Accept-Encoding',
    };
    if (encoding) headers['content-encoding'] = encoding;
    res.writeHead(200, {
      ...headers,
    });
    res.end(body);
    if (logRequests) console.log(`${req.method} ${url.pathname} 200`);
  } catch (err) {
    res.writeHead(404, {
      'content-type': 'text/plain',
      'access-control-allow-origin': '*',
      'cache-control': 'no-store',
    });
    res.end('Not found');
    try {
      if (logRequests && req?.url) console.log(`${req.method} ${req.url} 404`);
    } catch {}
  }
});

server.listen(port, () => {
  console.log(`Frame server on http://localhost:${port}`);
});
