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
const ex=`(()=>{const d=window.__dbg;const c=d.world.cars;
const t=c.types.map(x=>({vis:x.bodies.visible,count:x.bodies.count,tri:x.bodies.geometry.index?x.bodies.geometry.index.count/3:'noidx',pos:x.bodies.geometry.attributes.position.count}));
const pl=d.world.player; const g0=c.types[0].bodies.geometry; g0.computeBoundingBox(); const bb=g0.boundingBox; const mtx=c.types[0].bodies.instanceMatrix.array.slice(0,16); const car=pl.inCar||pl;
let scr=null, inst=null;
try{ const v=new window.__V3(car.x, 0.9, car.z); const w=v.clone(); v.project(d.camera); scr=[+v.x.toFixed(2),+v.y.toFixed(2),+v.z.toFixed(3), +w.x.toFixed(1), +w.y.toFixed(1), +w.z.toFixed(1)]; }catch(e){ scr=String(e); }
try{ for(const ty of c.types){ for(let i=0;i<ty.bodies.count;i++){ const m=new window.__M4(); ty.bodies.getMatrixAt(i,m); const e=m.elements; if(Math.abs(e[12]-car.x)<1 && Math.abs(e[14]-car.z)<1) inst=[+e[12].toFixed(2),+e[13].toFixed(2),+e[14].toFixed(2)]; } } }catch(e){ inst=String(e); }
const list=d.scene.children.filter(o=>o.isMesh).map((o,i)=>({i,n:o.name||'',y:+o.position.y.toFixed(2),inst:!!o.isInstancedMesh,cnt:o.count??1,mat:o.material&&o.material.type,vis:o.visible}));
return {list, geoBB:[bb.min.x,bb.min.y,bb.min.z,bb.max.x,bb.max.y,bb.max.z].map(v=>+v.toFixed(2)), mtx0:Array.from(mtx).map(v=>+v.toFixed(2)), scr, inst, carPos:[+car.x.toFixed(2), car.y, +car.z.toFixed(2)], playerType: c.cars.find(x=>Math.abs(x.x-car.x)<0.01&&Math.abs(x.z-car.z)<0.01)?.typeIndex ?? 'NF', nCars:c.cars.length, types:t, groupParent: c.group.parent? c.group.parent.type : 'NONE',
 inScene: d.scene.children.includes(c.group), cam:[d.camera.position.x,d.camera.position.y,d.camera.position.z].map(v=>+v.toFixed(1)),
 err: window.__err||null, calls: d.renderer.info.render.calls, tris: d.renderer.info.render.triangles};})()`;
const r=await send('Runtime.evaluate',{expression:ex,returnByValue:true},sid);
console.log(JSON.stringify(r.result.result.value,null,1));
p.kill();
