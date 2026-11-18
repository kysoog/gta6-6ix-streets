// Find the InstancedMesh responsible for "Cannot read properties of undefined (reading 'byteLength')".
import { spawn } from 'node:child_process';
const url = process.argv[2] ?? 'http://127.0.0.1:8099/index.html?shot=play&seed=5';
const chrome = '/root/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome';
const child = spawn(chrome, ['--headless=new','--no-sandbox','--disable-dev-shm-usage','--hide-scrollbars','--mute-audio','--enable-unsafe-swiftshader','--use-angle=swiftshader','--use-gl=angle','--window-size=1280,720','--remote-debugging-port=0',`--user-data-dir=/tmp/inst-${process.pid}`,'about:blank'], { stdio:['ignore','pipe','pipe'] });
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
await send('Log.enable',{},sessionId);
await send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false},sessionId);
await send('Page.navigate',{url},sessionId);
await sleep(6000);

const expr = `(() => {
  const d = window.__dbg; if (!d) return {err:'no dbg'};
  const out = [];
  d.scene.traverse((o) => {
    if (!o.isInstancedMesh) return;
    const geo = o.geometry;
    const attrs = {};
    for (const k of Object.keys(geo?.attributes ?? {})) {
      const a = geo.attributes[k];
      attrs[k] = a ? { hasArray: !!a.array, len: a.array?.length ?? null, itemSize: a.itemSize } : 'MISSING';
    }
    out.push({
      name: o.name || o.type,
      visible: o.visible,
      count: o.count,
      im: o.instanceMatrix ? { hasArray: !!o.instanceMatrix.array, len: o.instanceMatrix.array?.length ?? null } : 'NULL',
      ic: o.instanceColor ? { hasArray: !!o.instanceColor.array, len: o.instanceColor.array?.length ?? null } : 'NULL',
      morph: o.morphTargetInfluences ? { len: o.morphTargetInfluences.length, attrs: Object.keys(o.geometry?.morphAttributes ?? {}) } : 'NULL',
      geoAttrs: attrs,
      idx: !!geo?.index,
    });
  });
  const c = d.world.player.inCar;
  const cams = { cam: [d.camera.position.x,d.camera.position.y,d.camera.position.z].map(v=>+v.toFixed(2)),
    car: c ? [c.x,c.z,+c.yaw.toFixed(2),+c.speed.toFixed(1)] : null,
    carsInScene: (()=>{ const g=d.scene.getObjectByName('cars'); return g?{children:g.children.length, visibleFlags:g.children.map(x=>x.visible), counts:g.children.map(x=>x.count)}:'MISSING'; })(),
    proj: (()=>{ if(!c) return null; const V=window.__V3; const v=new V(c.x, 0.9, c.z); v.project(d.camera);
      return [ +v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2) ]; })(),
    camLook: (()=>{ const t=new window.__V3(); d.camera.getWorldDirection(t); return [ +t.x.toFixed(2), +t.y.toFixed(2), +t.z.toFixed(2) ]; })(),
    followErr: window.__followErr ?? null,
    carMatrices: (()=>{ const g=d.scene.getObjectByName('cars'); if(!g||!c) return null;
      const out=[]; g.children.forEach(ch=>{ if(!ch.isInstancedMesh||!ch.visible||!ch.count) return;
        const m=new d.__M4(); m.fromArray(ch.instanceMatrix.array, 0);
        out.push([+m.elements[12].toFixed(1), +m.elements[13].toFixed(1), +m.elements[14].toFixed(1)]); });
      return out; })() };
  const detail = [];
  d.scene.traverse(o => { if (!o.isInstancedMesh) return; if (o.count > 3) return;
    const g = o.geometry;
    detail.push({ name: o.name||o.type, parent: o.parent?.name ?? null, count: o.count,
      geoCtor: g?.constructor?.name, attrs: Object.keys(g?.attributes ?? {}),
      pos: (() => { const a = g?.attributes?.position; return a ? { ctor: a.constructor?.name, isInterleaved: !!a.isInterleavedBufferAttribute, hasArray: !!a.array, keys: Object.keys(a).slice(0,8) } : null; })(),
      idxType: g?.index ? g.index.constructor.name : null,
      mat: o.material?.type });
  });
  // bisect: hide instanced meshes one by one until render stops throwing
  const list = []; d.scene.traverse(o => { if (o.isInstancedMesh) list.push(o); });
  const tryRender = () => { try { d.renderer.render(d.scene, d.camera); return null; } catch (e) { return String(e && e.message || e); } };
  const results = [];
  for (let i = 0; i < list.length; i++) {
    const o = list[i]; const was = o.visible;
    o.visible = false;
    results.push([i, o.count, was, tryRender() === null]);
    o.visible = was;
  }
  let single = [];
  for (let i = 0; i < list.length; i++) {
    const keep = list.map(o => o.visible); list.forEach((o,j) => { o.visible = (j === i); });
    single.push([i, list[i].count, list[i].geometry?.attributes?.position?.array?.length ?? null, tryRender()]);
    list.forEach((o,j) => { o.visible = keep[j]; });
  }
  const renderErr = tryRender();
  return { cams, meshes: out, renderErr, detail };
})()`;
const r = await send('Runtime.evaluate',{expression:expr,returnByValue:true},sessionId);
console.log(JSON.stringify(r.result?.value ?? r, null, 1));
child.kill('SIGKILL'); process.exit(0);
