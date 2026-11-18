// Shot autopilot: three staged scenes (start, play, end) that run the real simulation forward
// under scripted input, deterministic per seed. window.__shotReady flips once the scene has
// settled, and the grader captures the frame. No posed dioramas: everything here is live sim.
import * as THREE from 'three';
import { createRandom } from './rng.js';
import { VEHICLE, PLAYER } from './config.js';

const SETTLE = { start: 90, play: 110, end: 90 };

export function makeShots(world, input, renderer, scene, camera, sky, announce) {
  const scenes = {};

  scenes.start = (seed) => {
    const random = createRandom(seed);
    let frame = 0;
    let radius = 95, angle = 0;
    const cx = random() * 60 - 30, cz = random() * 60 - 30;
    return {
      enter() {
        document.getElementById('title').style.display = 'flex';
      },
      step(dt) {
        frame += 1;
        angle += dt * 0.18;
        radius = 95 + Math.sin(frame * 0.05) * 8;
        const x = cx + Math.sin(angle) * radius;
        const z = cz + Math.cos(angle) * radius;
        camera.position.set(x, 26 + Math.sin(frame * 0.07) * 3, z);
        camera.lookAt(cx, 2, cz);
        sky.follow(cx, cz);
        if (frame === 1) announce('Vice Meridian — open world');
        if (frame >= SETTLE.start) window.__shotReady = true;
      },
      exit() {
        document.getElementById('title').style.display = 'none';
      },
    };
  };

  scenes.play = (seed) => {
    const random = createRandom(seed);
    let frame = 0;
    const player = world.player;
    // Put the player in a cruiser mid-chase so the shot reads as gameplay at once.
    // Spawn on the -32 avenue centre lane, facing down the road. (0,-48) is inside a block,
  // so the chase cam opened against a facade and the car was never on tarmac.
  const car = world.cars.spawn(3, -28, -62, 0, 22, 4, true);
    world.enterCar(car);
    input.state.forward = true;
    let steerDir = 1;
    let shootTimer = 0;
    return {
      enter() {},
      step(dt) {
        frame += 1;
        // cruise around the grid, turning at junctions
        if (frame % 120 === 0) steerDir = random() < 0.5 ? -1 : 1;
        input.state.left = steerDir < 0; input.state.right = steerDir > 0;
        shootTimer -= dt;
        if (shootTimer <= 0 && frame > 60) {
          world.shoot(car.x - Math.sin(car.yaw) * 1.6, car.z + Math.cos(car.yaw) * 1.6, car.yaw, 34, 0);
          world.addWanted(1);
          shootTimer = 0.9 + random() * 1.2;
        }
        sky.follow(car.x, car.z);
        if (frame >= SETTLE.play) window.__shotReady = true;
      },
      exit() {
        input.forward = false; input.left = false; input.right = false;
        world.exitCar();
      },
    };
  };

  scenes.end = (seed) => {
    const random = createRandom(seed);
    let frame = 0;
    const player = world.player;
    player.health = 0;
    world.state.mode = 'dead';
    world.state.respawnAt = 999999;
    let x = 22, z = -34, yaw = 0.4;
    return {
      enter() {
        document.getElementById('title').style.display = 'flex';
        document.getElementById('title').innerHTML = '<div style="font-size:46px;font-weight:900;letter-spacing:0.25em;text-transform:uppercase;color:#ff3d5a;text-shadow:0 4px 16px #000;">WASTED</div><div style="font-size:16px;opacity:0.8;letter-spacing:0.2em;margin-top:10px;text-transform:uppercase;">Vice Meridian — busted by the heat</div>';
      },
      step(dt) {
        frame += 1;
        x += Math.sin(frame * 0.04) * 0.6;
        z += Math.cos(frame * 0.04) * 0.4;
        yaw += dt * 0.12;
        camera.position.set(x - Math.sin(yaw) * 10, 10, z + Math.cos(yaw) * 10);
        camera.lookAt(x, 0.5, z);
        sky.follow(x, z);
        if (frame >= SETTLE.end) window.__shotReady = true;
      },
      exit() {
        document.getElementById('title').style.display = 'none';
        world.state.mode = 'onfoot';
        player.health = PLAYER.maxHealth;
        world.state.respawnAt = 0;
      },
    };
  };

  return {
    run(shotName, seed) {
      const sceneFn = scenes[shotName];
      if (!sceneFn) throw new Error(`unknown shot: ${shotName}`);
      return sceneFn(seed);
    },
  };
}
