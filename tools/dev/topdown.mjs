// Render the scene from a forced top-down camera and dump a PNG, to check world layout.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const url = process.argv[2] ?? 'http://127.0.0.1:8099/index.html?shot=play&seed=5';
const out = process.argv[3] ?? '/root/makefun/topdown.png';
const camPos = (process.argv[4] ?? '120,160,120').split(',').map(Number);
const lookAt = (process.argv[5] ?? '0,0,-40').split(',').map(Number);
const chrome = '/root/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome';
const child = spawn(chrome, ['--headless=new','--no-sandbox','--disable-dev-shm-usage','--hide-scrollbars','--mute-audio','--enable-unsafe-swiftshader','--use-angle=swiftshader','--use-gl=angle','--window-size=1280,720','--remote-debugging-port=0',`--user-data-dir=/tmp/td-${process.pid}`,'about:blank'], { stdio:['ignore','pipe','pipe'] });
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
await send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false},sessionId);
await send('Page.navigate',{url},sessionId);
await sleep(9000);
await send('Runtime.evaluate',{expression:`(() => {
  const d = window.__dbg; if (!d) return 'no dbg';
  d.camera.position.set(${camPos[0]}, ${camPos[1]}, ${camPos[2]});
  d.camera.lookAt(${lookAt[0]}, ${lookAt[1]}, ${lookAt[2]});
  d.camera.updateProjectionMatrix();
  d.scene.fog = null;
  d.renderer.render(d.scene, d.camera);
  return 'ok';
})()`,returnByValue:true},sessionId);
await sleep(1200);
const shot = await send('Page.captureScreenshot',{format:'png'},sessionId);
writeFileSync(out, Buffer.from(shot.data,'base64'));
console.log(JSON.stringify({out, bytes: Buffer.from(shot.data,'base64').length}));
child.kill('SIGKILL'); process.exit(0);
