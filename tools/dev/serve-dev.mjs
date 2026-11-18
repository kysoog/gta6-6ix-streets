// Dev static server: serves the repo's game/ at /, plus tools/dev/ pages under /dev/, with an
// import map injected into dev pages so they can import "three" like the game does. Not shipped.
import { createServer } from 'node:http';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../../game', import.meta.url)));
const devRoot = resolve(fileURLToPath(new URL('./', import.meta.url)));
const port = Number(process.argv[2] ?? 8099);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.wasm': 'application/wasm',
};

createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  let path = decodeURIComponent(url.pathname);
  if (path.startsWith('/dev/')) {
    const file = resolve(join(devRoot, path.slice(5)));
    try {
      let body = readFileSync(file, 'utf8');
      if (extname(file) === '.html' && !body.includes('importmap')) {
        body = body.replace('<head>', '<head>\n<script type="importmap">{"imports":{"three":"/vendor/three.module.min.js"}}</script>');
      }
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch (error) {
      res.writeHead(404).end(String(error));
    }
    return;
  }
  if (path.endsWith('/')) path += 'index.html';
  const file = resolve(join(root, path));
  if (!file.startsWith(root)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  try {
    const body = readFileSync(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`dev server on http://127.0.0.1:${port} (game at /, dev pages at /dev/)`);
  writeFileSync(join(devRoot, 'port.txt'), String(port));
});
