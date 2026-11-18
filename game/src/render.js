// Renderer: three.js r160, one follow camera, one shadow light, the city, instanced cars and
// pedestrians, tracers and money drops, plus a DOM HUD (wanted stars, money, health, minimap,
// mission, radio ticker). Canvas carries an aria-label; a visually hidden live region announces
// state for screen readers.
import * as THREE from 'three';
import { CITY, PALETTE, WANTED, PLAYER, VEHICLE, PEDS } from './config.js';
import { createSky } from './sky.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';

const TEXT = { canvas: 'Vice Meridian — open-world crime sandbox. WASD or arrows to drive and walk, mouse to aim, left click to shoot, F to enter or exit the nearest vehicle, Shift to run, P to pause, R to restart.' };

export function createRenderer(canvas, onMessage) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.bias = -0.0004;
  renderer.shadowMap.normalBias = 0.02;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, canvas.clientWidth / canvas.clientHeight, 0.4, 900);
  const sky = createSky(scene, renderer, 'golden');

  const hud = document.createElement('div');
  hud.id = 'hud';
  hud.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:10;font-family:ui-sans-serif,system-ui,sans-serif;color:#f6f1e6;text-shadow:0 2px 4px #000;';
  canvas.parentNode.appendChild(hud);

  const status = document.getElementById('status') || (() => {
    const el = document.createElement('p');
    el.id = 'status'; el.role = 'status'; el.ariaLive = 'polite';
    el.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;';
    document.body.appendChild(el);
    return el;
  })();

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- HUD ----------
  const bars = (label, value, max, color) => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;left:16px;bottom:70px;width:220px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.9;';
    const name = document.createElement('div'); name.textContent = label; name.style.marginBottom = '4px';
    const bar = document.createElement('div'); bar.style.cssText = 'height:10px;background:#22262e;border:1px solid #545c6b;border-radius:3px;overflow:hidden;';
    const fill = document.createElement('div'); fill.style.cssText = `height:10px;width:${Math.clamp(value / max, 0, 1) * 100}%;background:${color};`;
    bar.appendChild(fill); wrap.appendChild(name); wrap.appendChild(bar);
    return { wrap, fill, set: (v) => { fill.style.width = `${Math.clamp(v / max, 0, 1) * 100}%`; } };
  };

  const wantedRow = document.createElement('div');
  wantedRow.style.cssText = 'position:absolute;left:16px;top:14px;display:flex;gap:8px;font-size:22px;line-height:1;';
  const stars = [];
  for (let i = 0; i < WANTED.max; i += 1) {
    const s = document.createElement('span'); s.textContent = '\u2606'; s.style.color = 'rgba(246,241,230,0.35)'; s.style.textShadow = '0 0 10px rgba(255,61,90,0)';
    wantedRow.appendChild(s); stars.push(s);
  }

  const money = document.createElement('div');
  money.style.cssText = 'position:absolute;right:18px;top:16px;font-size:20px;font-variant-numeric:tabular-nums;text-shadow:0 2px 4px #000;';
  money.textContent = '$250';

  const mode = document.createElement('div');
  mode.style.cssText = 'position:absolute;right:18px;top:46px;font-size:13px;opacity:0.8;letter-spacing:0.16em;text-transform:uppercase;';
  mode.textContent = 'ON FOOT';

  const mission = document.createElement('div');
  mission.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);top:20px;font-size:15px;letter-spacing:0.2em;text-transform:uppercase;opacity:0;';
  mission.textContent = '';

  const messages = document.createElement('div');
  messages.style.cssText = 'position:absolute;left:16px;bottom:130px;width:300px;font-size:13px;line-height:1.55;opacity:0.95;';
  messages.innerHTML = '';

  // "Shots fired" transient: flashes when a shot lands, fades over ~1.2 s.
  const shotsFired = document.createElement('div');
  shotsFired.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);top:10px;font-size:19px;font-weight:800;letter-spacing:0.25em;text-transform:uppercase;color:#f0c53c;text-shadow:0 0 22px rgba(240,197,60,0.75),0 2px 4px #000;opacity:0;pointer-events:none;';
  shotsFired.textContent = 'SHOTS FIRED';

  const ticker = document.createElement('div');
  ticker.style.cssText = 'position:absolute;left:0;right:0;bottom:22px;font-size:12px;opacity:0.75;white-space:nowrap;padding-left:220px;text-shadow:0 1px 3px #000;';
  ticker.textContent = 'VICE FM   |   "NEON NIGHTS" — THE HAUTE   |   NEXT: TRAFFIC JAM   |   CALL 555-0198';

  const minimapWrap = document.createElement('div');
  minimapWrap.style.cssText = 'position:absolute;right:16px;bottom:70px;width:156px;height:156px;background:rgba(11,14,24,0.55);border:1px solid #4a4658;border-radius:2px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.6);';
  const minimap = document.createElement('canvas');
  minimap.width = 156; minimap.height = 156;
  minimap.style.display = 'block';
  minimapWrap.appendChild(minimap);
  const mmCtx = minimap.getContext('2d');

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:absolute;inset:0;z-index:20;pointer-events:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#f6f1e6;text-align:center;display:none;';
  const big = document.createElement('div');
  big.style.cssText = 'font-size:42px;font-weight:800;letter-spacing:0.3em;text-transform:uppercase;text-shadow:0 4px 12px #000;margin-bottom:10px;';
  const sub = document.createElement('div');
  sub.style.cssText = 'font-size:16px;opacity:0.85;letter-spacing:0.14em;text-transform:uppercase;';
  overlay.appendChild(big); overlay.appendChild(sub);
  hud.appendChild(overlay);

  const debugEl = document.createElement('div');
  debugEl.style.cssText = 'position:absolute;right:10px;bottom:10px;font-size:11px;line-height:1.4;opacity:0.5;text-align:right;text-shadow:0 1px 2px #000;';
  debugEl.textContent = '';
  hud.appendChild(debugEl);

  for (const el of [wantedRow, money, mode, mission, messages, ticker, shotsFired, minimapWrap]) hud.appendChild(el);

  let tickerX = 0;
  let shotsFade = 0;

  function updateHUD(state, world, dt) {
    for (let i = 0; i < WANTED.max; i += 1) {
      const pulse = 1 + Math.sin(Date.now() * 0.008) * 0.14;
      stars[i].textContent = i < state.wanted ? '\u2605' : '\u2606';
      stars[i].style.color = i < state.wanted ? '#f0c53c' : 'rgba(246,241,230,0.35)';
      stars[i].style.textShadow = i < state.wanted ? '0 0 14px #f0c53c, 0 0 28px rgba(240,197,60,0.45)' : '0 0 10px rgba(255,61,90,0)';
      stars[i].style.transform = `scale(${i < state.wanted ? pulse : 1})`;
    }
    money.textContent = `$${Math.floor(state.money)}`;
    mode.textContent = world.player.inCar ? 'DRIVING — CRUISER' : 'ON FOOT — PISTOL';
    mission.style.opacity = state.mission ? '1' : '0';
    mission.textContent = state.mission || '';
    const html = state.messages.map((m, i) => `<div style="margin-bottom:6px;${m.kind === 'danger' ? 'color:#ff4d5a' : ''}">${m.text}</div>`).join('');
    messages.innerHTML = html;
    // age messages
    state.messages.forEach((m) => { m.t += dt; });
    state.messages = state.messages.filter((m) => m.t < 4);

    // "Shots fired" transient: flash, then fade over ~1.2 s.
    if (state.messages.some((m) => m.text === 'Shots fired.')) shotsFade = 1;
    shotsFade = Math.max(0, shotsFade - dt / 1.2);
    shotsFired.style.opacity = String(shotsFade);

    tickerX = (tickerX + 0.5) % 260;
    ticker.style.paddingLeft = `${220 - tickerX}px`;

    status.textContent = state.wanted > 0 ? `Wanted level ${state.wanted} stars, health ${Math.floor(state.health)}, $${Math.floor(state.money)}`
      : `Health ${Math.floor(state.health)}, $${Math.floor(state.money)}, ${world.player.inCar ? 'driving' : 'on foot'}`;
  }

  // ---------- minimap ----------
  const mmScale = 156 / (CITY.bounds * 2 + 80);
  function drawMinimap(world, city) {
    const cx = world.player.inCar ? world.player.inCar.x : world.player.x;
    const cz = world.player.inCar ? world.player.inCar.z : world.player.z;
    const yaw = (world.player.inCar ? world.player.inCar : world.player).yaw;
    const c = mmCtx;
    c.clearRect(0, 0, 156, 156);
    c.fillStyle = '#141824'; c.fillRect(0, 0, 156, 156);
    // roads
    c.strokeStyle = '#3a3b44'; c.lineWidth = 4;
    for (const x of CITY.roads) { c.beginPath(); c.moveTo(mapX(x, cx), mapY(-CITY.bounds - 40, cz)); c.lineTo(mapX(x, cx), mapY(CITY.bounds + 40, cz)); c.stroke(); }
    for (const z of CITY.roads) { c.beginPath(); c.moveTo(mapX(-CITY.bounds - 40, cx), mapY(z, cz)); c.lineTo(mapX(CITY.bounds + 40, cx), mapY(z, cz)); c.stroke(); }
    // beach
    c.fillStyle = '#e8d3ae'; c.fillRect(mapX(CITY.sandStart, cx), mapY(-CITY.bounds - 40, cz), 28 * mmScale, (CITY.bounds * 2 + 80) * mmScale);
    // entities
    c.fillStyle = '#ffd166'; c.beginPath(); c.arc(mapX(cx, cx), mapY(cz, cz), 4, 0, Math.PI * 2); c.fill(); // player
    c.strokeStyle = '#ffd166'; c.lineWidth = 2;
    c.beginPath();
    c.moveTo(mapX(cx, cx), mapY(cz, cz));
    c.lineTo(mapX(cx - Math.sin(yaw) * 12, cx), mapY(cz + Math.cos(yaw) * 12, cz));
    c.stroke();
    for (const car of world.cars.cars) {
      c.fillStyle = car.police ? '#ff3d5a' : '#b9c2d0';
      c.fillRect(mapX(car.x, cx) - 1.5, mapY(car.z, cz) - 1.5, 3, 3);
    }
    for (const ped of world.peds) {
      c.fillStyle = '#6aa84f';
      c.fillRect(mapX(ped.x, cx) - 1, mapY(ped.z, cz) - 1, 2, 2);
    }
  }
  function mapX(x, cx) { return 78 + (x - cx) * mmScale; }
  function mapY(z, cz) { return 78 + (z - cz) * mmScale; }

  // ---------- instanced entities ----------
  const pedBodies = [], pedHeads = [], pedColors = [];
  const pedGeoBody = new THREE.BoxGeometry(0.55, 1.05, 0.34);
  const pedGeoHead = new THREE.SphereGeometry(0.26, 8, 6);
  const pedMatBody = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.05, vertexColors: true });
  const pedMatHead = new THREE.MeshStandardMaterial({ color: 0xe8dcc4, roughness: 0.9, metalness: 0.0 });
  const pedBodiesMesh = new THREE.InstancedMesh(pedGeoBody, pedMatBody, PEDS.count);
  const pedHeadsMesh = new THREE.InstancedMesh(pedGeoHead, pedMatHead, PEDS.count);
  pedBodiesMesh.castShadow = true; pedBodiesMesh.receiveShadow = true;
  pedHeadsMesh.castShadow = true;
  scene.add(pedBodiesMesh, pedHeadsMesh);
  for (let i = 0; i < PEDS.count; i += 1) {
    pedBodiesMesh.setMatrixAt(i, new THREE.Matrix4());
    pedHeadsMesh.setMatrixAt(i, new THREE.Matrix4());
    pedColors.push(new THREE.Color(PALETTE.shirt?.[0] ?? '#e2432f'));
  }

  const shotGeo = new THREE.BoxGeometry(0.08, 0.08, 0.6);
  const shotMat = new THREE.MeshBasicMaterial({ color: 0xffd166, toneMapped: false });
  const shotsMesh = new THREE.InstancedMesh(shotGeo, shotMat, 8);
  shotsMesh.frustumCulled = false;
  scene.add(shotsMesh);
  const shotMatrices = Array(8).fill(new THREE.Matrix4());

  const dropGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
  const dropMat = new THREE.MeshBasicMaterial({ color: 0xf0c53c, toneMapped: false });
  const dropsMesh = new THREE.InstancedMesh(dropGeo, dropMat, 16);
  dropsMesh.frustumCulled = false;
  scene.add(dropsMesh);

  // player on foot: simple rig
  const playerMat = new THREE.MeshStandardMaterial({ color: 0x3b4a8a, roughness: 0.8, metalness: 0.1 });
  const playerHeadMat = new THREE.MeshStandardMaterial({ color: 0xe8dcc4, roughness: 0.9 });
  const playerParts = [];
  const add = (geo, mat, x, y, z, rx, ry, rz) => {
    const g = new THREE.BoxGeometry(geo[0], geo[1], geo[2]);
    g.translate(x, y, z); g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz);
    const m = new THREE.Mesh(g, mat); m.castShadow = true;
    m.userData.offset = new THREE.Vector3(x, y, z);
    m.userData.ry = ry;
    playerParts.push(m); scene.add(m);
  };
  add([0.5, 1.05, 0.3], playerMat, 0, 0.55, 0, 0, 0, 0); // torso
  add([0.3, 0.3, 0.3], playerHeadMat, 0, 1.28, 0, 0, 0, 0); // head
  add([0.16, 0.6, 0.16], playerMat, -0.26, 0.75, 0, 0, 0, 0); // l arm
  add([0.16, 0.6, 0.16], playerMat, 0.26, 0.75, 0, 0, 0, 0); // r arm
  add([0.22, 0.62, 0.22], playerMat, -0.16, 0.12, 0, 0, 0, 0); // l leg
  add([0.22, 0.62, 0.22], playerMat, 0.16, 0.12, 0, 0, 0, 0); // r leg

  const copParts = [];
  const copMat = new THREE.MeshStandardMaterial({ color: 0x2b4da8, roughness: 0.8, metalness: 0.1 });
  const addCop = (geo, x, y, z, rx, ry, rz) => {
    const g = new THREE.BoxGeometry(geo[0], geo[1], geo[2]);
    g.translate(x, y, z); g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz);
    const m = new THREE.Mesh(g, copMat); m.castShadow = true;
    m.userData.offset = new THREE.Vector3(x, y, z);
    m.userData.ry = ry;
    copParts.push(m); scene.add(m);
  };
  addCop([0.5, 1.05, 0.3], 0, 0.55, 0, 0, 0, 0);
  addCop([0.3, 0.3, 0.3], 0, 1.28, 0, 0, 0, 0);
  addCop([0.16, 0.6, 0.16], -0.26, 0.75, 0, 0, 0, 0);
  addCop([0.16, 0.6, 0.16], 0.26, 0.75, 0, 0, 0, 0);
  addCop([0.22, 0.62, 0.22], -0.16, 0.12, 0, 0, 0, 0);
  addCop([0.22, 0.62, 0.22], 0.16, 0.12, 0, 0, 0, 0);

  let pedPhase = 0;

  function syncPeds(peds, step) {
    pedPhase += step * 14;
    const walk = Math.sin(pedPhase);
    for (let i = 0; i < peds.length; i += 1) {
      const ped = peds[i];
      const panic = ped.panic > 0;
      const s = panic ? 2.2 : 1;
      const m = new THREE.Matrix4().makeRotationY(ped.yaw);
      m.setPosition(ped.x, 0.55, ped.z);
      m.scale(s, s, s);
      pedBodiesMesh.setMatrixAt(i, m);
      const h = new THREE.Matrix4().makeRotationY(ped.yaw);
      h.setPosition(ped.x, 1.35, ped.z);
      h.scale(s, s, s);
      pedHeadsMesh.setMatrixAt(i, h);
      const color = pedColors[i];
      color.set(ped.money > 12 ? '#e2432f' : '#6aa84f');
      pedBodiesMesh.setColorAt(i, color);
      pedBodiesMesh.instanceColor.needsUpdate = true;
      pedBodiesMesh.instanceMatrix.needsUpdate = true;
      pedHeadsMesh.instanceMatrix.needsUpdate = true;
    }
    pedBodiesMesh.count = peds.length;
    pedHeadsMesh.count = peds.length;
  }

  function syncShots(shots) {
    let n = 0;
    for (const shot of shots) {
      const m = new THREE.Matrix4().makeRotationY(shot.yaw);
      m.setPosition(shot.x, 0.9, shot.z);
      shotsMesh.setMatrixAt(n, m);
      n += 1;
    }
    shotsMesh.count = n;
    shotsMesh.instanceMatrix.needsUpdate = true;
  }

  function syncDrops(drops) {
    let n = 0;
    for (const drop of drops) {
      const m = new THREE.Matrix4();
      m.setPosition(drop.x, 0.14, drop.z);
      dropsMesh.setMatrixAt(n, m);
      n += 1;
    }
    dropsMesh.count = n;
    dropsMesh.instanceMatrix.needsUpdate = true;
  }

  function syncPlayer(world, step) {
    const p = world.player;
    const onFoot = p.inCar === null && world.state.mode === 'onfoot';
    const busted = world.state.mode === 'arrested';
    const active = busted ? copParts : (onFoot ? playerParts : []);
    for (const m of playerParts) m.visible = false;
    for (const m of copParts) m.visible = false;
    if (!active.length) return;
    const base = onFoot ? p : { x: 0, z: 0, yaw: 0 };
    const now = Date.now() * 0.0015;
    const moving = onFoot && (p.wishSpeed || 0) > 0.1;
    const walk = moving ? Math.sin(now * 14) : 0;
    const mtx = new THREE.Matrix4().makeRotationY(base.yaw);
    mtx.setPosition(base.x, 0, base.z);
    for (const part of active) {
      const local = part.userData.offset;
      const worldPos = new THREE.Vector3().copy(local).applyMatrix4(mtx);
      part.position.copy(worldPos);
      part.rotation.y = base.yaw + (part.userData.ry || 0);
      part.visible = true;
    }
    const torso = active[0], head = active[1], lArm = active[2], rArm = active[3], lLeg = active[4], rLeg = active[5];
    if (moving) {
      torso.position.y = 0.55 + Math.abs(walk) * 0.05;
      lArm.rotation.z = walk * 0.7; rArm.rotation.z = -walk * 0.7;
      lLeg.rotation.x = walk * 1.0; rLeg.rotation.x = -walk * 1.0;
    } else {
      lArm.rotation.z = 0; rArm.rotation.z = 0;
      lLeg.rotation.x = 0; rLeg.rotation.x = 0;
      torso.position.y = 0.55;
    }
    if (!reduced) head.position.y = 1.28 + Math.sin(now * 6) * 0.02;
  }

  let carsRef = null;
  let audioRef = null;

  function setCity(group) {
    if (!group) return;
    scene.add(group);
  }

  function setCars(cars) {
    if (!cars) return;
    carsRef = cars;
    if (cars.group) scene.add(cars.group);
    if (typeof cars.sync === 'function') cars.sync();
  }

  function setAudio(audio) {
    audioRef = audio;
  }

  return {
    renderer, scene, camera, sky, hud, status, updateHUD, drawMinimap,
    syncPeds, syncShots, syncDrops, syncPlayer, playerParts, copParts,
    setCity, setCars, setAudio,
    get cars() { return carsRef; },
    get audio() { return audioRef; },
    followCamera() {}, reduced,
    resize() {
      renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
      camera.aspect = canvas.clientWidth / canvas.clientHeight;
      camera.updateProjectionMatrix();
    },
    announce(text) { status.textContent = text; if (onMessage) onMessage(text); },
    setDebug(text) { debugEl.textContent = text; },
  };
}
