// The simulation: player on foot and in cars, pedestrians, traffic, wanted level, hitscan
// combat, money drops and XZ collision against the city colliders. Fixed 60 Hz step from main.js;
import { PLAYER, VEHICLE, POLICE, PEDS, WANTED, LANES } from './config.js';
import { clamp, rdist2 } from './rng.js';
import { Cars, CAR_TYPES } from './cars.js';

export const TEAM = { PLAYER: 0, PED: 1, COP: 2 };

export function createWorld(city, trafficRoutes) {
  const colliders = city.colliders.slice();
  const pedRoutes = city.pedRoutes.slice();
  const cars = new Cars();
  const peds = [];
  const cops = [];
  const shots = [];
  const drops = [];
  let time = 0;

  const state = {
    wanted: 0,
    wantedDecayAt: 0,
    health: PLAYER.maxHealth,
    mode: 'onfoot', // onfoot | driving | arrested | dead | respawn
    respawnAt: 0,
    money: 250,
    messages: [],
  };

  // Spawn on the centreline of the -32 avenue, not at x=16 which is mid-block: from
  // there the chase camera starts inside a facade and the opening frame is a wall.
  const player = {
    x: -28, z: -62, yaw: 0,
    health: PLAYER.maxHealth, radius: PLAYER.radius, height: PLAYER.height,
    inCar: null,
    shootCooldown: 0, hurtFlash: 0,
  };

  function message(text) {
    state.messages.push({ text, t: 0 });
    if (state.messages.length > 8) state.messages.shift();
  }

  function circleRect(cx, cz, r, box) {
    const closestX = clamp(cx, box.minX, box.maxX);
    const closestZ = clamp(cz, box.minZ, box.maxZ);
    const dx = cx - closestX, dz = cz - closestZ;
    return dx * dx + dz * dz <= r * r;
  }

  function collidesCircle(cx, cz, r, ignore) {
    for (const box of colliders) {
      if (box === ignore || box.soft) continue;
      if (circleRect(cx, cz, r, box)) return box;
    }
    return null;
  }

  // Desired circle movement against colliders: full move, or slide along one axis.
  function moveCircle(cx, cz, r, dx, dz) {
    let x = cx, z = cz;
    if (!collidesCircle(x + dx, z + dz, r)) return { x: x + dx, z: z + dz, blocked: false };
    let slid = false;
    if (!collidesCircle(x + dx, z, r)) { x += dx; slid = true; }
    else if (!collidesCircle(x, z + dz, r)) { z += dz; slid = true; }
    return { x, z, blocked: !slid };
  }

  // ---------- pedestrians ----------
  function spawnPed() {
    const route = pedRoutes[Math.floor(Math.random() * pedRoutes.length)];
    const start = route[Math.floor(Math.random() * route.length)];
    peds.push({
      x: start.x, z: start.z, yaw: Math.random() * Math.PI * 2, speed: PEDS.walk,
      route, routeIndex: Math.floor(Math.random() * route.length),
      state: 'walk', panic: 0, health: 40, team: TEAM.PED, radius: 0.34,
      money: Math.floor(15 * (0.7 + Math.random() * 0.9)),
    });
  }
  for (let i = 0; i < PEDS.count; i += 1) spawnPed();

  function updatePeds(step, playerPos) {
    for (const ped of peds) {
      const dx = playerPos.x - ped.x, dz = playerPos.z - ped.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < PEDS.panicRadius * PEDS.panicRadius) ped.panic = PEDS.panicSeconds;
      if (ped.panic > 0) {
        ped.panic -= step;
        const awayYaw = Math.atan2(-dx, -dz);
        ped.yaw = awayYaw;
        const move = PEDS.run * step;
        const res = moveCircle(ped.x, ped.z, ped.radius, -Math.sin(awayYaw) * move, Math.cos(awayYaw) * move);
        ped.x = res.x; ped.z = res.z;
        continue;
      }
      const target = ped.route[ped.routeIndex];
      const tdx = target.x - ped.x, tdz = target.z - ped.z;
      const tdist = Math.hypot(tdx, tdz);
      if (tdist < 3) { ped.routeIndex = (ped.routeIndex + 1) % ped.route.length; continue; }
      const wantYaw = Math.atan2(-tdx, tdz);
      let err = wantYaw - ped.yaw;
      while (err > Math.PI) err -= Math.PI * 2;
      while (err < -Math.PI) err += Math.PI * 2;
      ped.yaw += err * 2.5 * step;
      const move = PEDS.walk * step;
      const res = moveCircle(ped.x, ped.z, ped.radius, -Math.sin(ped.yaw) * move, Math.cos(ped.yaw) * move);
      ped.x = res.x; ped.z = res.z;
    }
  }

  // ---------- traffic ----------
  function spawnTraffic() {
    const routes = trafficRoutes;
    for (let i = 0; i < 16; i += 1) {
      const route = routes[Math.floor(Math.random() * routes.length)];
      const lane = route.lanes[Math.floor(Math.random() * route.lanes.length)];
      const forward = route.to > route.from;
      const start = {
        x: route.axis === 'x' ? route.from : route.x + lane,
        z: route.axis === 'x' ? route.z + lane : route.from,
      };
      const yaw = forward ? 0 : Math.PI;
      const typeIndex = Math.floor(Math.random() * 3);
      const car = cars.spawn(typeIndex, start.x, start.z, yaw, 10, lane);
      car.route = routePoints(route);
      car.routeIndex = 0;
    }
  }
  spawnTraffic();

  function routePoints(route) {
    const points = [];
    const steps = Math.abs(route.to - route.from) / 6;
    const forward = route.to > route.from;
    for (let s = 0; s <= steps; s += 1) {
      const t = forward ? s / steps : 1 - s / steps;
      const v = route.from + (route.to - route.from) * t;
      points.push({
        x: route.axis === 'x' ? v : route.fixed ?? route.x,
        z: route.axis === 'x' ? route.fixed ?? route.z : v,
      });
    }
    return points;
  }

  function updateCars(step) {
    for (const car of cars.cars) {
      const halfL = CAR_TYPES?.[0].length / 2 + 0.8;
      const halfW = CAR_TYPES?.[0].width / 2 + 0.8;
      const front = { x: car.x - Math.sin(car.yaw) * halfL, z: car.z + Math.cos(car.yaw) * halfL };
      const hit = collidesCircle(front.x, front.z, halfW);
      car.targetSpeed = hit ? Math.min(car.targetSpeed, 4) : 10 + Math.random() * 4;
      if (hit) car.yaw += (Math.random() - 0.5) * 1.5 * step;
      if (car.routeIndex < car.route.length) {
        const target = car.route[car.routeIndex];
        const dx = target.x - car.x, dz = target.z - car.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 7) car.routeIndex += 1;
        else {
          const wantYaw = Math.atan2(-dx, dz);
          let err = wantYaw - car.yaw;
          while (err > Math.PI) err -= Math.PI * 2;
          while (err < -Math.PI) err += Math.PI * 2;
          car.yaw += err * VEHICLE.steer * Math.min(dist / 14, 1) * step * 0.5;
        }
      }
      const accel = car.police ? VEHICLE.policeAccel : VEHICLE.accel;
      const top = car.police ? VEHICLE.policeTopSpeed : VEHICLE.topSpeed;
      if (car.speed < car.targetSpeed) car.speed = Math.min(car.targetSpeed, car.speed + accel * step * 0.6);
      else if (car.speed > car.targetSpeed) car.speed = Math.max(car.targetSpeed, car.speed - VEHICLE.brake * step * 0.5);
      car.speed = Math.min(car.speed, top);
      car.speed *= Math.pow(VEHICLE.drag, step * 60);
      car.x -= Math.sin(car.yaw) * car.speed * step;
      car.z += Math.cos(car.yaw) * car.speed * step;
    }
    cars.sync();
  }

  // ---------- police ----------
  function spawnCop() {
    // trafficRoutes entries are {axis,from,to,...} descriptors, not point arrays:
    // expand them to a point list first, then aim the cruiser at the next point.
    const desc = trafficRoutes[Math.floor(Math.random() * trafficRoutes.length)];
    const route = Array.isArray(desc) ? desc : routePoints(desc);
    const start = route[0] ?? { x: 0, z: 0 };
    const car = cars.spawn(3, start.x, start.z, 0, 0, 0, true);
    if (route[1]) {
      const dx = route[1].x - start.x, dz = route[1].z - start.z;
      car.yaw = Math.atan2(-dx, dz);
    }
    car.route = route; car.routeIndex = 0;
    cops.push(car);
    return car;
  }

  function updatePolice(step) {
    if (state.wanted <= 0) return;
    if (cops.length < POLICE.maxUnits && Math.random() < 0.015) spawnCop();
    const target = player.inCar ? player.inCar : player;
    for (const cop of cops) {
      const dx = target.x - cop.x, dz = target.z - cop.z;
      const dist = Math.hypot(dx, dz);
      cop.route = [{ x: target.x, z: target.z }];
      cop.routeIndex = 0;
      cop.targetSpeed = dist < 25 ? 6 : 22;
    }
    cops.forEach((cop) => {
      const dx = target.x - cop.x, dz = target.z - cop.z;
      const dist = Math.hypot(dx, dz);
      if (dist < POLICE.arrestRadius && player.inCar === null) arrest();
    });
  }

  function arrest() {
    state.mode = 'arrested';
    state.wanted = 0;
    message('Busted.');
  }

  // ---------- combat ----------
  function shoot(x, z, yaw, damage, team) {
    if (time - state.lastShotAt < 0.28) return;
    state.lastShotAt = time;
    shots.push({ x, z, yaw, life: 1.0, damage, team });
    if (team === TEAM.PLAYER) {
      addWanted(WANTED.shot);
      message('Shots fired.');
    }
  }

  function updateCombat(step) {
    for (let i = shots.length - 1; i >= 0; i -= 1) {
      const shot = shots[i];
      shot.life -= step * 40;
      const move = 70 * step;
      shot.x -= Math.sin(shot.yaw) * move;
      shot.z += Math.cos(shot.yaw) * move;
      if (shot.life <= 0) { shots.splice(i, 1); continue; }
      const hit = hitTest(shot.x, shot.z, 0.35);
      if (hit) {
        applyDamage(hit.target, shot.damage, shot.team);
        shots.splice(i, 1);
      }
    }
  }

  function hitTest(x, z, radius) {
    if (player.inCar === null && rdist2({ x, z }, player) < (player.radius + radius) ** 2) return { target: player, team: TEAM.PLAYER };
    for (const cop of cops) {
      const target = cop;
      if (rdist2({ x, z }, target) < (1.2 + radius) ** 2) return { target, team: TEAM.COP };
    }
    for (const ped of peds) {
      if (rdist2({ x, z }, ped) < (ped.radius + radius) ** 2) return { target: ped, team: TEAM.PED };
    }
    for (const car of cars.cars) {
      if (rdist2({ x, z }, car) < (1.6 + radius) ** 2) return { target: car, team: TEAM.PED };
    }
    return null;
  }

  function applyDamage(target, damage, fromTeam) {
    if (target === player) {
      player.health = Math.max(0, player.health - damage);
      player.hurtFlash = 0.6;
      if (player.health <= 0) { state.mode = 'dead'; state.respawnAt = time + PLAYER.respawnSeconds; message('Wasted.'); }
      return;
    }
    target.health = Math.max(0, target.health - damage);
    if (target.health <= 0) {
      if (fromTeam === TEAM.PLAYER) {
        if (target.team === TEAM.PED) addWanted(WANTED.kill);
        if (target.team === TEAM.COP) addWanted(WANTED.copKill);
        player.money += target.money || 0;
      }
      if (target.team === TEAM.PED) { const i = peds.indexOf(target); if (i >= 0) peds.splice(i, 1); drops.push({ x: target.x, z: target.z, value: target.money || 0, t: 0 }); }
      else { const i = cops.indexOf(target); if (i >= 0) cops.splice(i, 1); cars.remove(target); }
    }
  }

  // ---------- wanted ----------
  function addWanted(amount) {
    const before = state.wanted;
    state.wanted = clamp(state.wanted + amount, 0, WANTED.max);
    if (state.wanted > before) {
      message(`Wanted level ${state.wanted}\u2605`);
      if (state.wanted === 1) state.wantedDecayAt = time + WANTED.evadeBase;
    }
  }

  function updateWanted(step) {
    if (state.wanted <= 0) return;
    const target = player.inCar ? player.inCar : player;
    const inSight = cops.some((cop) => {
      const dx = cop.x - target.x, dz = cop.z - target.z;
      return Math.hypot(dx, dz) < 45;
    });
    if (!inSight && time > state.wantedDecayAt) {
      state.wantedDecayAt = time + WANTED.evadeBase * (1 + state.wanted * 0.3);
      state.wanted = Math.max(0, state.wanted - 1);
      if (state.wanted === 0) message('Lost the heat.');
    }
  }

  // ---------- money drops ----------
  function collectDrops(px, pz) {
    for (let i = drops.length - 1; i >= 0; i -= 1) {
      if (rdist2({ x: px, z: pz }, drops[i]) < (player.radius + 0.5) ** 2) {
        player.money += drops[i].value;
        message(`+$${drops[i].value}`);
        drops.splice(i, 1);
      }
    }
  }

  // ---------- vehicle enter/exit ----------
  function nearestCar(maxDist = 5) {
    let best = null, bestD = maxDist;
    for (const car of cars.cars) {
      const d = Math.hypot(car.x - player.x, car.z - player.z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function enterCar(car) {
    player.inCar = car;
    state.mode = 'driving';
  }

  function exitCar() {
    const car = player.inCar;
    if (!car) return;
    const res = moveCircle(player.x, player.z, player.radius, -Math.sin(car.yaw) * 3, Math.cos(car.yaw) * 3);
    player.x = res.x; player.z = res.z;
    player.inCar = null;
    state.mode = 'onfoot';
  }

  // ---------- player ----------
  function updatePlayer(step, input) {
    if (state.mode === 'dead') {
      if (time > state.respawnAt) {
        player.health = PLAYER.maxHealth;
        player.x = 16; player.z = -40; player.yaw = 0;
        state.mode = 'onfoot'; state.wanted = 0;
        message('Back on the street.');
      }
      return;
    }
    if (state.mode === 'arrested') return;
    if (player.shootCooldown > 0) player.shootCooldown -= step;
    if (player.hurtFlash > 0) player.hurtFlash -= step;
    if (player.inCar) {
      const car = player.inCar;
      if (input.forward) car.speed += VEHICLE.accel * step;
      if (input.back) car.speed -= VEHICLE.reverseAccel * step;
      car.speed *= Math.pow(VEHICLE.drag, step * 60);
      const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      if (Math.abs(car.speed) > 1.2) {
        const turn = VEHICLE.steer * steer * step * (1 - Math.min(Math.abs(car.speed) / VEHICLE.topSpeed, 0.6));
        car.yaw += turn;
      }
      car.x -= Math.sin(car.yaw) * car.speed * step;
      car.z += Math.cos(car.yaw) * car.speed * step;
      const hit = collidesCircle(car.x, car.z, 2.2);
      if (hit) { car.speed *= 0.3; car.yaw += Math.PI * 0.4; }
      if (input.exit && player.shootCooldown <= 0) { exitCar(); player.shootCooldown = 0.4; }
      if (input.shoot && player.shootCooldown <= 0) {
        player.shootCooldown = 0.34;
        shoot(car.x - Math.sin(car.yaw) * 1.6, car.z + Math.cos(car.yaw) * 1.6, car.yaw, PLAYER.damage, TEAM.PLAYER);
      }
    } else {
      const wishX = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      const wishZ = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
      const wishLen = Math.hypot(wishX, wishZ);
      if (wishLen > 0) {
        const camYaw = input.camYaw ?? 0;
        const moveYaw = camYaw + Math.atan2(wishX, wishZ);
        const speed = input.run ? PLAYER.run : PLAYER.walk;
        player.wishSpeed = speed;
        const move = speed * step;
        const res = moveCircle(player.x, player.z, player.radius, -Math.sin(moveYaw) * move, Math.cos(moveYaw) * move);
        player.x = res.x; player.z = res.z;
        player.yaw = moveYaw;
      }
      if (input.shoot && player.shootCooldown <= 0) {
        player.shootCooldown = 0.34;
        const gx = -Math.sin(player.yaw) * 1.1, gz = Math.cos(player.yaw) * 1.1;
        shoot(player.x + gx, player.z + gz, player.yaw, PLAYER.damage, TEAM.PLAYER);
      }
      const car = nearestCar(4.5);
      if (input.enter && car) enterCar(car);
    }
    collectDrops(player.x, player.z);
  }

  return {
    state, player, cars, peds, cops, shots, drops,
    updatePeds, updateCars, updatePolice, updateCombat, updateWanted,
    collectDrops, nearestCar, enterCar, exitCar, updatePlayer, shoot, addWanted,
    message, time: () => time, tick: (dt) => { time += dt; },
    colliders,
  };
}
