// Walk the scene graph and report any geometry containing NaN/non-finite positions.
import { spawn } from 'node:child_process';
const url = process.argv[2] ?? 'http://127.0.0.1:8099/index.html?shot=play&seed=5';
const chrome = '/root/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome';
const child = spawn(chrome, ['--headless=new','--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-angle=swiftshader','--use-gl=angle','--window-size=1280,720','--remote-debugging-port=0',`--user-data-dir=/tmp/nan-${process.pid}`,'about:blank'], { stdio:['ignore','pipe','pipe'] });
let devPort=null, errText='';
child.stderr.setEncoding('utf8');
child.stderr.on('data',(c)=>{errText+=c;const m=/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//.exec(errText);if(m&&devPort===null)devPort=Number(m[1]);});
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
while(devPort===null) await sleep(40);
let v=null; while(!v){try{v=await(await fetch(`http://127.0.0.1:${devPort}/json/version`)).json();}catch{await sleep(60);}}
const ws=new WebSocket(v.webSocketDebuggerUrl); let id=1; const pending=new Map();
await new Promise(d=>ws.addEventListener('open',d));
ws.addEventListener('message',(ev)=>{const m=JSON.parse(String(ev.data));if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.fail(new Error(JSON.stringify(m.error))):p.done(m.result);}});
const send=(method,params={},sessionId)=>{const mid=id++;const p={id:mid,method,params};if(sessionId)p.sessionId=sessionId;ws.send(JSON.stringify(p));return new Promise((done,fail)=>pending.set(mid,{done,fail}));};
const {targetId}=await send('Target.createTarget',{url:'about:blank'});
const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
await send('Runtime.enable',{},sessionId);
await send('Page.navigate',{url},sessionId);
await sleep(5000);
const trace = await send('Runtime.evaluate',{expression:`(() => { const w=window.__dbg?.world; const c=w?.player?.inCar; if(!c) return 'no car';
 const out=[]; for(let i=0;i<5;i++) out.push([+c.x.toFixed(1), +c.z.toFixed(1), +c.speed.toFixed(1), +c.targetSpeed.toFixed(1), c.routeIndex, c.route?.length]); return out; })()`,returnByValue:true},sessionId);
console.log('TRACE', JSON.stringify(trace.result?.value));
const stats = await send('Runtime.evaluate',{expression:'[window.__frames, +window.__dtSum.toFixed(2), window.__trace]',returnByValue:true},sessionId);
console.log('STATS frames,dtSum,now', JSON.stringify(stats.result?.value));
const r = await send('Runtime.evaluate',{expression:`(() => {
  const out = [];
  const sc = window.__dbg?.scene;
  if (!sc) return ['no scene'];
  sc.traverse((o) => {
    const g = o.geometry;
    if (!g || !g.attributes || !g.attributes.position) return;
    const at = g.attributes.position;
    if (at.isInterleavedBufferAttribute) return;
    const a = at.array;
    if (!a) return;
    let bad = 0;
    for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) bad++;
    if (bad) { const chain=[]; let q=o; while(q){chain.push(q.type+':'+(q.name||'-'));q=q.parent;} const idx=[]; for(let i=0;i<a.length;i++) if(!Number.isFinite(a[i])) idx.push(i); out.push({ type:o.type, verts:a.length/3, bad, first:idx.slice(0,10), chain:chain.join(' < ') }); }
  });
  const cam = window.__dbg?.camera;
  const w = window.__dbg?.world;
  const r = window.__dbg?.renderer;
  const car = w?.player?.inCar;
  return { nanMeshes: out, camPos: cam ? [cam.position.x, cam.position.y, cam.position.z] : null,
    camNear: cam?.near, camFar: cam?.far, fov: cam?.fov,
    visibleMeshes: sc.children.filter(c=>c.visible && c.isMesh).length,
    car: car ? { x:car.x, z:car.z, yaw:car.yaw, speed:car.speed } : null,
    player: w ? { x:w.player.x, z:w.player.z, yaw:w.player.yaw } : null,
    calls: r?.info.render.calls, tris: r?.info.render.triangles,
    carCount: w?.cars?.cars?.length,
    carPos: (() => { const c=w?.player?.inCar; return c?[+c.x.toFixed(1),+c.z.toFixed(1),+c.yaw.toFixed(2)]:null; })(),
    road: (() => { let o=null; window.__dbg?.scene.traverse(n=>{ if(n.name==='streets') o=n; }); return o?{vis:o.visible, y:o.position.y, box:o.geometry.boundingBox? [o.geometry.boundingBox.min.y,o.geometry.boundingBox.max.y]:null}:null; })(),
    spheres: (() => { const out=[]; window.__dbg?.scene.traverse(o=>{ if(!o.geometry) return; const g=o.geometry; if(!g.boundingSphere) g.computeBoundingSphere(); const bs=g.boundingSphere; out.push([o.name||o.type, bs?+bs.radius.toFixed(1):null, bs?[+bs.center.x.toFixed(0),+bs.center.y.toFixed(0),+bs.center.z.toFixed(0)]:null]); }); return out.filter(x=>x[1]===null||!isFinite(x[1])||x[1]>400); })(),
    camQ: (()=>{const c=window.__dbg?.camera;return c?[+c.quaternion.x.toFixed(3),+c.quaternion.y.toFixed(3),+c.quaternion.z.toFixed(3),+c.quaternion.w.toFixed(3)]:null;})(),
    carY: w?.player?.inCar ? w.player.inCar.y : 'UNDEFINED',
    roadProbe: (()=>{const c=window.__dbg?.camera; if(!c) return null; const THREE=window.__THREE; return 'n/a';})(),
    fog: window.__dbg?.scene.fog ? {near:window.__dbg.scene.fog.near, far:window.__dbg.scene.fog.far, color:window.__dbg.scene.fog.color.getHexString()} : null };
})()`, returnByValue:true}, sessionId);
console.log(JSON.stringify(r.result?.value ?? r,null,1));
child.kill('SIGKILL'); process.exit(0);
