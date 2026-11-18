// Debug probe: loads the game, reports scene graph, camera, and any exceptions.
import { spawn } from 'node:child_process';
const url = process.argv[2] ?? 'http://127.0.0.1:8099/index.html?shot=play&seed=5';
const chrome = '/root/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome';
const child = spawn(chrome, ['--headless=new','--no-sandbox','--disable-dev-shm-usage','--hide-scrollbars','--mute-audio','--enable-unsafe-swiftshader','--use-angle=swiftshader','--use-gl=angle','--window-size=1280,720','--remote-debugging-port=0',`--user-data-dir=/tmp/dbg-${process.pid}`,'about:blank'], { stdio:['ignore','pipe','pipe'] });
let devPort=null, errText='';
child.stderr.setEncoding('utf8');
child.stderr.on('data',(c)=>{errText+=c;const m=/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//.exec(errText);if(m&&devPort===null)devPort=Number(m[1]);});
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
while(devPort===null) await sleep(40);
let version=null; while(!version){try{version=await(await fetch(`http://127.0.0.1:${devPort}/json/version`)).json();}catch{await sleep(60);}}
const ws=new WebSocket(version.webSocketDebuggerUrl); let id=1; const pending=new Map(); const logs=[];
await new Promise(d=>ws.addEventListener('open',d));
ws.addEventListener('message',(ev)=>{const m=JSON.parse(String(ev.data));if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.fail(new Error(JSON.stringify(m.error))):p.done(m.result);return;}
 if(m.method==='Runtime.consoleAPICalled')logs.push(`${m.params.type}: ${(m.params.args??[]).map(a=>a.value??a.description??a.type).join(' ')}`);
 if(m.method==='Runtime.exceptionThrown')logs.push(`EXC: ${m.params.exceptionDetails?.exception?.description??m.params.exceptionDetails?.text}`);});
const send=(method,params={},sessionId)=>{const mid=id++;const p={id:mid,method,params};if(sessionId)p.sessionId=sessionId;ws.send(JSON.stringify(p));return new Promise((done,fail)=>pending.set(mid,{done,fail}));};
const {targetId}=await send('Target.createTarget',{url:'about:blank'});
const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
await send('Runtime.enable',{},sessionId); await send('Page.enable',{},sessionId);
await send('Page.navigate',{url},sessionId);
await sleep(6000);
const ev=async(expr)=>{const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true},sessionId);return r.result?.value;};
console.log(JSON.stringify({
  ready: await ev('window.__shotReady===true'),
  hasScene: await ev("typeof window.__dbg !== 'undefined'"),
  info: await ev(`(() => {
    const s = window.__dbg;
    if (!s) return 'no __dbg';
    const cam = s.camera, sc = s.scene;
    const kids = sc.children.map(c => c.name || c.type);
    return { camPos: [cam.position.x, cam.position.y, cam.position.z], children: kids.length, names: kids.slice(0,20), bg: sc.background ? sc.background.getHexString?.() : null };
  })()`),
  canvasPx: await ev(`(() => { const c=document.getElementById('game'); return c? [c.width,c.height]:null; })()`),
  logs: logs.slice(0,12),
},null,1));
child.kill('SIGKILL'); process.exit(0);
