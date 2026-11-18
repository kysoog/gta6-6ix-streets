// Vice Meridian — boot and main loop. Two modes:
//   normal:   playable game (WASD/arrows, mouse aim, F enter/exit, P pause, R restart)
//   shot:     ?shot=start|play|end&seed=N — staged autopilot; window.__shotReady when the frame
//             is ready for the grader's screenshot. Everything here is the live simulation.
import * as THREE from 'three';
import { STEP, MAX_FRAME, CITY, PLAYER } from './config.js';
import { createRandom } from './rng.js';
import { createRenderer } from './render.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createWorld } from './world.js';
import { buildCity, trafficRoutes, cityBlocks } from './city.js';
import { makeShots } from './shots.js';

const canvas = document.getElementById('game');
const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10);
const isShot = shotName !== null;

const render = createRenderer(canvas, (text) => {
  const el = document.getElementById('status');
  if (el) el.textContent = text;
});
const { renderer, scene, camera, sky, hud, status, updateHUD, drawMinimap, syncPeds, syncShots, syncDrops, syncPlayer, reduced, announce } = render;

const audio = createAudio();
renderer.setAnimationLoop(null);
let audioStarted = false;

const city = buildCity(seed, createRandom(seed));
const traffic = trafficRoutes();
const world = createWorld(city, traffic, audio);

render.setCity(city.group);
render.setCars(world.cars);
render.setAudio(audio);

sky.follow(0, 0);

// Title overlay used by the start/end shots.
const title = document.createElement('div');
title.id = 'title';
title.style.cssText = 'position:absolute;inset:0;z-index:30;pointer-events:none;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#f6f1e6;text-align:center;display:none;';
title.innerHTML = '<div style="font-size:52px;font-weight:900;letter-spacing:0.35em;text-transform:uppercase;color:#f6f1e6;text-shadow:0 4px 18px #000;">VICE MERIDIAN</div><div style="font-size:17px;opacity:0.8;letter-spacing:0.3em;margin-top:12px;text-transform:uppercase;">open-world crime sandbox</div>';
document.body.appendChild(title);

const input = createInput(canvas);
const shots = makeShots(world, input, renderer, scene, camera, sky, announce);
let shotScene = null;
if (isShot) shotScene = shots.run(shotName, seed);

canvas.addEventListener('click', () => {
  if (!audioStarted) { audio.start(); audioStarted = true; }
  canvas.requestPointerLock?.();
});
document.addEventListener('pointerlockchange', () => {
  input.read(); // sync lock state
});

let paused = false;
const pauseMenu = document.createElement('div');
pauseMenu.style.cssText = 'position:absolute;inset:0;z-index:30;pointer-events:auto;display:none;flex-direction:column;align-items:center;justify-content:center;color:#f6f1e6;background:rgba(11,14,24,0.75);text-align:center;';
pauseMenu.innerHTML = '<div style="font-size:40px;font-weight:800;letter-spacing:0.3em;text-transform:uppercase;margin-bottom:14px;">PAUSED</div><div style="font-size:16px;opacity:0.8;margin-bottom:24px;">P — resume   R — restart</div>';
hud.appendChild(pauseMenu);

const wasted = document.createElement('div');
wasted.style.cssText = 'position:absolute;inset:0;z-index:30;pointer-events:none;display:none;flex-direction:column;align-items:center;justify-content:center;color:#ff4d5a;text-align:center;';
wasted.innerHTML = '<div style="font-size:48px;font-weight:900;letter-spacing:0.3em;text-transform:uppercase;text-shadow:0 4px 16px #000;">WASTED</div><div style="font-size:16px;opacity:0.85;margin-top:10px;text-transform:uppercase;">R — restart</div>';
hud.appendChild(wasted);

// ---------- simulation step ----------
let lastTime = performance.now();
let delta = 0;
let dtEma = 0;

function simStep(dt, shotInput) {
  world.tick(dt);
  const pos = world.player.inCar ? world.player.inCar : world.player;
  const curInput = shotInput ? shotInput : { ...input.read(), camYaw: pos.yaw * (180 / Math.PI) };
  world.updatePlayer(dt, curInput);
  world.updatePeds(dt, pos);
  world.updateCars(dt);
  world.updatePolice(dt);
  world.updateCombat(dt);
  world.updateWanted(dt);
  audioFromInput(world, curInput);
}

let shotFrame = 0;
let lastWanted = 0;
let station = 0;

function audioFromInput(world, curInput) {
  if (world.state.wanted > lastWanted) { audio.wantedSiren(); lastWanted = world.state.wanted; }
  else { lastWanted = world.state.wanted; }
  if (curInput.justHorn) audio.horn();
  if (curInput.justRadio) { station = (station + 1) & 1; audio.radioTone(station); }
}

function frame(now) {
  if (!audioStarted) { audio.start(); audioStarted = true; }
  const dt = Math.min(Math.max((now - lastTime) / 1000, 0), MAX_FRAME);
  window.__dtSum = (window.__dtSum || 0) + dt; window.__frames = (window.__frames || 0) + 1;
  window.__trace = window.__trace || []; if (window.__trace.length < 12) window.__trace.push([+dt.toFixed(4), +(world.player.inCar?.x ?? 0).toFixed(1), +(world.player.inCar?.speed ?? 0).toFixed(1)]);
  lastTime = now;
  delta += dt;
  dtEma = dtEma * 0.9 + dt * 0.1;

  const doShot = () => {
    // Deterministic: one fixed step per frame, never scaled by wall-clock. Headless
    // captures run at 2-5 fps, so a dt-scaled sim would jump metres per frame.
    const st = STEP;
    shotScene.step(st);
    shotFrame += 1;
    simStep(st, { ...input.state, camYaw: (world.player.inCar ? world.player.inCar.yaw : world.player.yaw) });
    const pos = world.player.inCar ? world.player.inCar : world.player;
    follow(camera, pos, st);
    syncPeds(world.peds, st);
    world.cars.sync();
    syncShots(world.shots);
    syncDrops(world.drops);
    syncPlayer(world, st);
    updateHUD(world.state, world, st);
    render.setDebug(`dt ${(st * 1000).toFixed(0)}ms  ema ${(dtEma * 1000).toFixed(0)}ms`);
    drawMinimap(world, city);
    renderer.render(scene, camera);
  };

  if (isShot) { doShot(); return; }

  while (delta >= STEP) {
    simStep(STEP);
    delta -= STEP;
  }
  if (paused) {
    renderer.render(scene, camera);
    return;
  }

  const pos = world.player.inCar ? world.player.inCar : world.player;
  follow(camera, pos, STEP);

  syncPeds(world.peds, STEP);
  world.cars.sync();
  syncShots(world.shots);
  syncDrops(world.drops);
  syncPlayer(world, STEP);

  if (world.state.mode === 'dead') {
    wasted.style.display = 'flex';
  } else {
    wasted.style.display = 'none';
  }

  updateHUD(world.state, world, STEP);
  render.setDebug(`dt ${(STEP * 1000).toFixed(0)}ms  ema ${(dtEma * 1000).toFixed(0)}ms`);
  drawMinimap(world, city);
  renderer.render(scene, camera);
}

function follow(camera, target, step) { try { return follow_(camera, target, step); } catch (e) { window.__followErr = String(e && e.stack || e).split('\n').slice(0,3).join(' | '); } }
let camInit = false;
function follow_(camera, target, step) {
  // Forward is (-sin yaw, +cos yaw); the chase cam must sit BEHIND the target,
  // i.e. at the opposite of that vector, or the car ends up outside the frustum.
  const ty = Number.isFinite(target.y) ? target.y : 0.3;
  const ideal = new THREE.Vector3(
    target.x + Math.sin(target.yaw) * 6.8,
    2.45,
    target.z - Math.cos(target.yaw) * 6.8,
  );
  // First frame snaps instead of lerping: the camera starts at the origin, which is
  // underground, so a lerp would spend the opening seconds staring through the road.
  camera.position.lerp(ideal, camInit ? Math.min(step * 9, 1) : 1);
  camInit = true;
  camera.lookAt(target.x - Math.sin(target.yaw) * 8, ty + 0.8, target.z + Math.cos(target.yaw) * 8);
  if (!reduced) camera.position.y += Math.sin(Date.now() * 0.006) * 0.06;
}

function onKeyPause(event) {
  if (event.code === 'KeyP' && event.type === 'keydown') {
    paused = !paused;
    pauseMenu.style.display = paused ? 'flex' : 'none';
    if (paused) input.exitPointerLock();
  }
  if (event.code === 'KeyR' && event.type === 'keydown' && world.state.mode === 'dead') {
    restart();
  }
}
window.addEventListener('keydown', onKeyPause);

function restart() {
  world.player.health = PLAYER.maxHealth;
  world.player.x = -32; world.player.z = -62; world.player.yaw = 0; // centreline of the -32 avenue
  world.player.inCar = null;
  world.state.mode = 'onfoot';
  world.state.wanted = 0;
  world.state.messages = [];
}

window.__dbg = { scene, camera, renderer, world, city, __M4: THREE.Matrix4 };
window.__V3 = THREE.Vector3; window.__M4 = THREE.Matrix4; window.__BOX3 = THREE.Box3; window.__IM = THREE.InstancedMesh; window.__SCENE = THREE.Scene; window.__PCAM = THREE.PerspectiveCamera; window.__REND = THREE.WebGLRenderer; window.__COLOR = THREE.Color; window.__BOX3 = THREE.Box3; window.__RAY = THREE.Raycaster;

renderer.setAnimationLoop(frame);
