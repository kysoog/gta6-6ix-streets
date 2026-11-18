import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const CH='/root/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome';
const p=spawn(CH,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-angle=swiftshader','--use-gl=angle','--window-size=1280,720','--remote-debugging-port=0'],{stdio:['ignore','ignore','pipe']});
const ws=await new Promise(r=>{let b='';p.stderr.on('data',d=>{b+=d;const m=b.match(/ws:\/\/[^\s]+/);if(m)r(m[0]);});});
const { WebSocket } = await import('ws');
const s=new WebSocket(ws); let id=0; const wait=new Map();
await new Promise(r=>s.on('open',r));
s.on('message',m=>{const j=JSON.parse(m); if(j.id&&wait.has(j.id)){wait.get(j.id)(j);wait.delete(j.id);}});
const send=(method,params={},sessionId)=>new Promise(r=>{const i=++id;wait.set(i,r);s.send(JSON.stringify({id:i,method,params,sessionId}));});
const t=await send('Target.createTarget',{url:'about:blank'});
const a=await send('Target.attachToTarget',{targetId:t.result.targetId,flatten:true});
const sid=a.result.sessionId;
await send('Page.enable',{},sid); await send('Runtime.enable',{},sid);
await send('Page.navigate',{url:process.argv[2]},sid);
await new Promise(r=>setTimeout(r,9000));
// hide ground/huge meshes, keep cars + city
const ex=`(()=>{const d=window.__dbg;let hid=0;
for(const ch of d.scene.children){ if(ch.isMesh && !ch.isInstancedMesh){ ch.visible=false; hid++; } }
const c=d.world.cars; const pl=d.world.player; const car=pl.inCar||pl;
c.types.forEach(ty=>{ ty.bodies.visible=true; ty.bodies.count=Math.max(ty.bodies.count,1); });
d.camera.position.set(car.x, 8, car.z-14); d.camera.lookAt(car.x, 0.8, car.z);
d.renderer.render(d.scene, d.camera);
return {hid, car:[+car.x.toFixed(2),+car.z.toFixed(2)], types:c.types.map(x=>[x.bodies.visible,x.bodies.count])};})()`;
const r=await send('Runtime.evaluate',{expression:ex,returnByValue:true},sid);
console.log(JSON.stringify(r.result.result.value));
const shot=await send('Page.captureScreenshot',{format:'jpeg',quality:82},sid);
writeFileSync(process.argv[3], Buffer.from(shot.result.data,'base64'));
p.kill();
