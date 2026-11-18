import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const CH='/root/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome';
const p=spawn(CH,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-angle=swiftshader','--use-gl=angle','--window-size=900,600','--remote-debugging-port=0'],{stdio:['ignore','ignore','pipe']});
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
const errors=[]; await send('Log.enable',{},sid).catch(()=>{});
await send('Page.navigate',{url:process.argv[2]},sid);
await new Promise(r=>setTimeout(r,8000));
const ex=`(()=>{const d=window.__dbg; const T=window.__THREE||null;
// fresh minimal scene: one car mesh only, copied geometry+material, double side toggle
const src=d.world.cars.types[0].bodies;
const g=src.geometry.clone(); const m=src.material.clone();
m.side=2; m.color.set(0xff0000); // DoubleSide, red
const mesh=new window.__IM(g,m,4);
for(let i=0;i<4;i++){const M=new window.__M4().makeRotationY(i*1.2); M.setPosition((i-1.5)*3.2, 0.3, 0); mesh.setMatrixAt(i,M);}
mesh.count=4; mesh.frustumCulled=false;
const sc=new window.__SCENE(); sc.background=new window.__COLOR(0x223344);
sc.add(mesh);
const cam=new window.__PCAM(50,1.5,0.1,200); cam.position.set(0,4,10); cam.lookAt(0,0.8,0);
const r=d.renderer;
d.scene.visible=false; r.setClearColor(0x223344,1); r.render(sc,cam); return {ok:true, verts:g.attributes.position.count, hasNorm:!!g.attributes.normal, idx:g.index?g.index.count:0};})()`;
const r=await send('Runtime.evaluate',{expression:ex,returnByValue:true},sid);
console.log(JSON.stringify(r.result.result.value ?? r.result));
const shot=await send('Page.captureScreenshot',{format:'jpeg',quality:85},sid);
writeFileSync(process.argv[3], Buffer.from(shot.result.data,'base64'));
p.kill();
