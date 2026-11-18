// Dev screenshot/probe driver: loads any URL in headless chromium, waits for window.__shotReady,
// optionally waits extra frames (for animation), then saves a JPEG and prints window.__diag.
//   node tools/dev/shoot.mjs "http://127.0.0.1:8099/dev/probe.html?time=golden" out.jpg [frames]
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const url = process.argv[2] ?? 'http://127.0.0.1:8099/dev/probe.html';
const out = process.argv[3] ?? 'probe.jpg';
const extraFrames = Number(process.argv[4] ?? 0);
const width = Number(process.env.W ?? 1280);
const height = Number(process.env.H ?? 720);
const chrome = '/root/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome';

const child = spawn(chrome, [
  '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--mute-audio',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--use-gl=angle',
  `--window-size=${width},${height}`, '--force-device-scale-factor=1',
  '--remote-debugging-port=0', `--user-data-dir=${process.env.TMPDIR ?? '/tmp'}/dev-${process.pid}`, 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });

let devPort = null;
let errText = '';
child.stderr.setEncoding('utf8');
child.stderr.on('data', (c) => {
  errText += c;
  const m = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//.exec(errText);
  if (m && devPort === null) devPort = Number(m[1]);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const deadline = Date.now() + 15000;
while (devPort === null && Date.now() < deadline) await sleep(40);
let version = null;
while (version === null) {
  try { version = await (await fetch(`http://127.0.0.1:${devPort}/json/version`)).json(); } catch { await sleep(60); }
}
const ws = new WebSocket(version.webSocketDebuggerUrl);
let id = 1;
const pending = new Map();
const logs = [];
await new Promise((d) => ws.addEventListener('open', d));
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(String(ev.data));
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id); pending.delete(msg.id);
    msg.error ? p.fail(new Error(JSON.stringify(msg.error))) : p.done(msg.result);
    return;
  }
  if (msg.method === 'Runtime.consoleAPICalled') logs.push(`${msg.params.type}: ${(msg.params.args ?? []).map((a) => a.value ?? a.description ?? a.type).join(' ')}`);
  if (msg.method === 'Runtime.exceptionThrown') logs.push(`EXCEPTION: ${(msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text ?? '').split('\n').slice(0,6).join(' | ')}`);
  if (msg.method === 'Log.entryAdded' && msg.params.entry.level !== 'verbose') logs.push(`${msg.params.entry.level}: ${msg.params.entry.text}`);
});
const send = (method, params = {}, sessionId) => {
  const mid = id++;
  const payload = { id: mid, method, params };
  if (sessionId) payload.sessionId = sessionId;
  ws.send(JSON.stringify(payload));
  return new Promise((done, fail) => pending.set(mid, { done, fail }));
};
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Runtime.enable', {}, sessionId);
await send('Log.enable', {}, sessionId);
await send('Page.enable', {}, sessionId);
await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
await send('Page.navigate', { url }, sessionId);
const t0 = Date.now();
let ready = false;
while (Date.now() - t0 < 120000) {
  const p = await send('Runtime.evaluate', { expression: 'window.__shotReady === true', returnByValue: true }, sessionId);
  if (p.result?.value === true) { ready = true; break; }
  await sleep(80);
}
if (extraFrames > 0) {
  await send('Runtime.evaluate', {
    expression: `new Promise((r) => { let n = ${extraFrames}; function tick(){ if (n-- <= 0) return r(); requestAnimationFrame(tick); } requestAnimationFrame(tick); })`,
    awaitPromise: true,
  }, sessionId);
} else {
  await send('Runtime.evaluate', { expression: 'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))', awaitPromise: true }, sessionId);
}
const diag = await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__diag ?? null)', returnByValue: true }, sessionId);
const fps = await send('Runtime.evaluate', {
  expression: `new Promise((done) => { let f = 0; const s = performance.now(); let worst = 0, last = s;
    function tick(now){ f++; worst = Math.max(worst, now - last); last = now;
      if (now - s < 1500) requestAnimationFrame(tick); else done({ fps: +(f / ((now - s) / 1000)).toFixed(1), worstMs: +worst.toFixed(1) }); }
    requestAnimationFrame(tick); })`,
  awaitPromise: true, returnByValue: true,
}, sessionId);
const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 92, fromSurface: true }, sessionId);
writeFileSync(out, Buffer.from(shot.data, 'base64'));
console.log(JSON.stringify({
  ready,
  out,
  resize: `${width}x${height}`,
  diag: diag.result?.value ? JSON.parse(diag.result.value) : null,
  fps: fps.result?.value,
  logs: logs.filter((l) => !/Failed to load resource/.test(l)).slice(0, 30),
}, null, 1));
child.kill('SIGKILL');
process.exit(0);
