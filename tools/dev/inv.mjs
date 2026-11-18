import { spawn } from 'node:child_process';
const CH='/root/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome';
const args=['--headless=new','--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-angle=swiftshader','--use-gl=angle','--window-size=1280,720','--remote-debugging-port=0'];
const p=spawn(CH,args,{stdio:['ignore','ignore','pipe']});
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
const ex=`(()=>{const d=window.__dbg;const out=[];
d.scene.updateMatrixWorld(true);
for(const ch of d.scene.children){ let bb=null;
  try{ const b=new window.__BOX3(); b.setFromObject(ch); if(isFinite(b.min.y)) bb=[+b.min.y.toFixed(2),+b.max.y.toFixed(2),+b.min.x.toFixed(0),+b.max.x.toFixed(0)]; }catch(e){}
  out.push({ n: ch.name||ch.type, vis: ch.visible, kids: ch.children.length, bb }); }
return out;})()`;
const r=await send('Runtime.evaluate',{expression:ex,returnByValue:true,awaitPromise:false},sid);
console.log(JSON.stringify(r.result.result.value,null,1));
p.kill();
