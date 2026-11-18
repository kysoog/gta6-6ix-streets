// Screenshot capture for the entry: serves game/ over plain HTTP on loopback, drives the vendored
// Chromium through the DevTools protocol (Node's own WebSocket, no dependencies), waits for the
// page's window.__shotReady flag on every scene in shots.json, and writes each frame to
// screenshots/. main.ts calls it only when asked to re-shoot (--shoot or MAKEFUN_SHOOT=1); the
// committed screenshots are what a normal run hands in, so the run stays byte-stable and fast.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.wasm': 'application/wasm',
};

const CHROME_CANDIDATES = [
  process.env.MAKEFUN_CHROME,
  '/root/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome',
  '/root/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
].filter(Boolean);

function findChrome() {
  for (const path of CHROME_CANDIDATES) if (existsSync(path)) return path;
  return null;
}

function serve(root) {
  return new Promise((done) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      let path = decodeURIComponent(url.pathname);
      if (path.endsWith('/')) path += 'index.html';
      const file = resolve(join(root, path));
      if (!file.startsWith(resolve(root))) {
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
    });
    server.listen(0, '127.0.0.1', () => done({ server, port: server.address().port }));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDevtools(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return await response.json();
    } catch {
      // not listening yet
    }
    await sleep(60);
  }
  throw new Error('chromium devtools did not come up');
}

/** A CDP session over one page target: enough of the protocol to load a page and shoot it. */
function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  const listeners = [];
  const ready = new Promise((done, fail) => {
    socket.addEventListener('open', () => done());
    socket.addEventListener('error', () => fail(new Error('devtools socket failed')));
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data));
    if (message.id !== undefined) {
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      if (message.error) waiter.fail(new Error(message.error.message));
      else waiter.done(message.result ?? {});
      return;
    }
    for (const listener of listeners) listener(message);
  });
  return {
    ready,
    on(listener) {
      listeners.push(listener);
    },
    send(method, params = {}, sessionId) {
      const id = nextId++;
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      socket.send(JSON.stringify(payload));
      return new Promise((done, fail) => pending.set(id, { done, fail }));
    },
    close() {
      try {
        socket.close();
      } catch {
        // already gone
      }
    },
  };
}

/**
 * Capture every scene of shots.json into `outDir`. Returns the per-scene diagnostics the page
 * publishes on window.__diag (draw calls, triangles, simulated frames), so a run can assert on
 * what was actually rendered instead of guessing from the pixels.
 */
export async function captureScreenshots({ gameDir, outDir, shotsPath, width = 1280, height = 800, verbose = true }) {
  const chrome = findChrome();
  if (!chrome) throw new Error('no chromium binary found for --shoot');
  const shots = JSON.parse(readFileSync(shotsPath, 'utf8'));
  mkdirSync(outDir, { recursive: true });
  const { server, port } = await serve(gameDir);

  const userDataDir = join(process.env.TMPDIR ?? '/tmp', `makefun-shot-${process.pid}`);
  const child = spawn(chrome, [
    '--headless=new',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
    '--mute-audio',
    '--no-first-run',
    '--disable-extensions',
    '--enable-unsafe-swiftshader',
    '--use-angle=swiftshader',
    '--use-gl=angle',
    `--window-size=${width},${height}`,
    '--force-device-scale-factor=1',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let devtoolsPort = null;
  const stderrText = [];
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderrText.push(chunk);
    const match = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//.exec(stderrText.join(''));
    if (match && devtoolsPort === null) devtoolsPort = Number(match[1]);
  });

  const cleanExit = () => {
    try {
      child.kill('SIGKILL');
    } catch {
      // gone
    }
  };

  try {
    const deadline = Date.now() + 20000;
    while (devtoolsPort === null && Date.now() < deadline) await sleep(40);
    if (devtoolsPort === null) throw new Error(`chromium gave no devtools port: ${stderrText.join('').slice(-400)}`);

    const version = await waitForDevtools(devtoolsPort);
    const cdp = connect(version.webSocketDebuggerUrl);
    await cdp.ready;
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const logs = [];
    cdp.on((message) => {
      if (message.sessionId !== sessionId) return;
      if (message.method === 'Runtime.consoleAPICalled') {
        const text = (message.params.args ?? []).map((a) => a.value ?? a.description ?? a.type).join(' ');
        logs.push(`${message.params.type}: ${text}`);
      } else if (message.method === 'Runtime.exceptionThrown') {
        logs.push(`exception: ${message.params.exceptionDetails?.exception?.description ?? message.params.exceptionDetails?.text}`);
      } else if (message.method === 'Log.entryAdded') {
        const entry = message.params.entry;
        if (entry.level === 'error' || entry.level === 'warning') logs.push(`log ${entry.level}: ${entry.text}`);
      }
    });
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Log.enable', {}, sessionId);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);

    const results = [];
    for (const shot of shots) {
      logs.length = 0;
      const url = `http://127.0.0.1:${port}/${shot.query ?? ''}`;
      await cdp.send('Page.navigate', { url }, sessionId);
      const started = Date.now();
      let ready = false;
      while (Date.now() - started < 120000) {
        const probe = await cdp.send(
          'Runtime.evaluate',
          { expression: 'window.__shotReady === true', returnByValue: true },
          sessionId,
        );
        if (probe.result?.value === true) {
          ready = true;
          break;
        }
        await sleep(80);
      }
      if (!ready) throw new Error(`scene ${shot.name} never signalled __shotReady (${logs.slice(-6).join(' | ')})`);
      // Let two animation frames land so the last pose is composited.
      await cdp.send(
        'Runtime.evaluate',
        { expression: 'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))', awaitPromise: true },
        sessionId,
      );
      const diag = await cdp.send(
        'Runtime.evaluate',
        { expression: 'JSON.stringify(window.__diag ?? null)', returnByValue: true },
        sessionId,
      );
      const capture = await cdp.send(
        'Page.captureScreenshot',
        { format: 'jpeg', quality: 92, captureBeyondViewport: false, fromSurface: true },
        sessionId,
      );
      const bytes = Buffer.from(capture.data, 'base64');
      const path = join(outDir, shot.name);
      writeFileSync(path, bytes);
      results.push({ name: shot.name, bytes: bytes.length, ready, diagnostics: JSON.parse(diag.result?.value ?? 'null'), errors: logs.filter((l) => /exception|error/i.test(l)) });
      if (verbose) console.log(`shot ${shot.name}: ${bytes.length} bytes`);
    }
    cdp.close();
    return results;
  } finally {
    cleanExit();
    server.close();
  }
}
