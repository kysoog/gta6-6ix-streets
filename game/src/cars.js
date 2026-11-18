// Vehicles: an arcade driving model plus traffic cars cruising the road network. Every car of a
// type is drawn with one InstancedMesh per part (body paint, dark trim, emissive lights) so all
// traffic costs 3 draw calls per type; per-instance colour and matrices are streamed each frame.
import * as THREE from 'three';
import { VEHICLE, LANES, CITY } from './config.js';
import { cylinderUV, boxUV, instanced, chamferBox } from './geometry.js';

export const CAR_TYPES = [
  { name: 'sedan', length: 4.4, width: 1.7, height: 1.45, cabin: 1.35, hood: 1.55, boot: 1.1 },
  { name: 'coupe', length: 4.3, width: 1.8, height: 1.25, cabin: 1.15, hood: 1.7, boot: 1.0 },
  { name: 'suv', length: 4.6, width: 1.95, height: 1.65, cabin: 1.5, hood: 1.55, boot: 1.2 },
  { name: 'cruiser', length: 4.5, width: 1.85, height: 1.55, cabin: 1.4, hood: 1.6, boot: 1.1 },
];

const PAINT = [0xff2d55, 0xf0c53c, 0x2b4da8, 0xe8e8f0, 0x4a4a4a, 0xf7c9b4, 0x2a7d4c, 0x7d4a18];

/** Build one merged wedge body (hood+cabin+boot), dark trim, four corner lights. */
function carTypeMesh(type, count) {
  const l = type.length, w = type.width, h = type.height;
  const cabinH = type.cabin, hoodL = type.hood, bootL = type.boot;
  // Body shell as two closed boxes (chassis + cabin). The old version was a loose
  // fan of hood/windshield/boot triangles with no roof and no side skins, so under
  // backface culling the car rendered as a flat decal on the tarmac.
  const bp = [];
  const quad = (a, b, c, d) => { bp.push(...a, ...b, ...c, ...a, ...c, ...d); };
  const box = (x0, x1, y0, y1, z0, z1) => {
    quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]); // front (+z)
    quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]); // rear (-z)
    quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]); // left
    quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]); // right
    quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]); // roof
    quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]); // floor
  };
  const zFront = l * 0.5, zRear = -l * 0.5;
  const cabinFront = zFront - hoodL, cabinRear = zRear + bootL;
  const beltline = 0.62;
  box(-w / 2, w / 2, 0.16, beltline, zRear, zFront);
  // Cabin as a chamfered box: the roof edge reads instead of disappearing under backface culling at a distance.
  const cabinGeo = chamferBox(w - 0.2, cabinH - beltline, cabinFront - cabinRear, 0.12);
  const cab = cabinGeo.attributes.position.array;
  for (let i = 0; i < cab.length; i += 3) {
    bp.push(-w / 2 + 0.1 + cab[i], beltline + cab[i + 1], cabinRear + cab[i + 2]);
  }
  const bodyGeo = new THREE.BufferGeometry();
  bodyGeo.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
  bodyGeo.computeVertexNormals();

  const trimPts = [];
  const wheel = (cx, cz, r = w * 0.32) => {
    // Vertical discs in the YZ plane; the old version laid them flat on the road,
    // so wheels were invisible from the chase camera.
    const segments = 10, cy = 0.1 + r * 0.62;
    for (let seg = 0; seg < segments; seg += 1) {
      const a1 = (seg / segments) * Math.PI * 2, a2 = ((seg + 1) / segments) * Math.PI * 2;
      trimPts.push(cx, cy + Math.cos(a1) * r, cz + Math.sin(a1) * r,
        cx, cy + Math.cos(a2) * r, cz + Math.sin(a2) * r, cx, cy, cz);
    }
  };
  const axleF = zFront - hoodL * 0.72, axleR = zRear + bootL * 0.72;
  wheel(-w * 0.5, axleF); wheel(w * 0.5, axleF);
  wheel(-w * 0.5, axleR); wheel(w * 0.5, axleR);

  const gTop = cabinH - 0.12, gLow = 0.66;
  const pane = (x0, z0, x1, z1) => {
    trimPts.push(x0, gLow, z0, x1, gLow, z1, x1, gTop, z1, x0, gLow, z0, x1, gTop, z1, x0, gTop, z0);
  };
  pane(-w / 2 + 0.14, cabinRear - 0.04, w / 2 - 0.14, cabinRear - 0.04); // rear glass
  pane(w / 2 - 0.14, cabinFront + 0.04, -w / 2 + 0.14, cabinFront + 0.04); // windscreen
  pane(-w / 2 + 0.07, cabinRear + 0.12, -w / 2 + 0.07, cabinFront - 0.12); // left side
  pane(w / 2 - 0.07, cabinFront - 0.12, w / 2 - 0.07, cabinRear + 0.12); // right side
  const trimGeo = new THREE.BufferGeometry();
  trimGeo.setAttribute('position', new THREE.Float32BufferAttribute(trimPts, 3));
  trimGeo.computeVertexNormals();

  const lightPts = [];
  const light = (x, z, ww = 0.2, hh = 0.17) => {
    const h = ww / 2;
    lightPts.push(x - h, 0.34 - hh / 2, z, x + h, 0.34 - hh / 2, z, x + h, 0.34 + hh / 2, z,
      x - h, 0.34 - hh / 2, z, x + h, 0.34 + hh / 2, z, x - h, 0.34 + hh / 2, z);
  };
  // light() is authored facing +z with no z offset baked in any more.
  light(-w / 2 + 0.24, zRear - 0.09); light(w / 2 - 0.24, zRear - 0.09);
  light(-w / 2 + 0.24, zFront + 0.09); light(w / 2 - 0.24, zFront + 0.09);
  // Headlight glow quads in front of each headlight: additive, depthWrite off, so oncoming
  // traffic still reads at dusk when the headlight quad itself is nearly edge-on.
  const headPts = [];
  const headLight = (x) => {
    const h = 0.28;
    headPts.push(x - h, 0.42, zFront + 0.14, x + h, 0.42, zFront + 0.14, x + h, 0.66, zFront + 0.14,
      x - h, 0.42, zFront + 0.14, x + h, 0.66, zFront + 0.14, x - h, 0.66, zFront + 0.14);
  };
  headLight(-w / 2 + 0.24); headLight(w / 2 - 0.24);
  const headGeo = new THREE.BufferGeometry();
  headGeo.setAttribute('position', new THREE.Float32BufferAttribute(headPts, 3));
  headGeo.computeVertexNormals();
  const headGlow = new THREE.MeshBasicMaterial({ color: 0xfff4ea, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });

  const lightGeo = new THREE.BufferGeometry();
  lightGeo.setAttribute('position', new THREE.Float32BufferAttribute(lightPts, 3));
  lightGeo.computeVertexNormals();

  // No `color` attribute exists on these geometries, so vertexColors must stay off;
  // per-instance paint comes from instanceColor (setColorAt) instead. With vertexColors
  // on and no attribute, vColor resolves to black and every car reads as asphalt.
  // Tri strip winding across hood/cabin/boot is inconsistent, so half the shell would
  // vanish under backface culling and the car read as a flat decal on the tarmac.
  const paint = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0.35, envMapIntensity: 0.8, side: THREE.DoubleSide });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1f29, roughness: 0.55, metalness: 0.5, envMapIntensity: 0.9, side: THREE.DoubleSide });
  // Lamp quads are authored facing +z, i.e. away from the chase camera, so they need
  // DoubleSide or the tail lights are culled on every frame the player looks at them.
  const glow = new THREE.MeshBasicMaterial({ color: 0xff2a2a, toneMapped: false, side: THREE.DoubleSide });

  const bodies = instanced(bodyGeo, paint, Array(count).fill(new THREE.Matrix4()));
  const trims = instanced(trimGeo, dark, Array(count).fill(new THREE.Matrix4()));
  const lightsMesh = instanced(lightGeo, glow, Array(count).fill(new THREE.Matrix4()));
  bodies.castShadow = true; bodies.receiveShadow = true;
  trims.castShadow = true; trims.receiveShadow = true;
  return { bodies, trims, lights: lightsMesh, headlights, type, paint, count };
}

/** Simulated car state (no three.js here — physics first, render second). */
export function createCar(typeIndex, x, z, yaw, speed, lane, police) {
  return {
    id: Symbol(), typeIndex, x, z, y: 0.28, yaw, speed, lane, targetSpeed: speed,
    brake: 0, handbrake: false, health: VEHICLE.health, onFire: false,
    route: [], routeIndex: 0, police: !!police,
    paintColor: PAINT[Math.floor(Math.random() * PAINT.length)],
    sirenFrame: 0,
  };
}

export class Cars {
  constructor() {
    this.types = CAR_TYPES.map((type, i) => {
      const mesh = carTypeMesh(type, 40);
      mesh.bodies.visible = false; mesh.trims.visible = false; mesh.lights.visible = false; mesh.headlights.visible = false;
      return mesh;
    });
    this.cars = [];
    this.nextId = 0;
    this.group = new THREE.Group();
    this.group.name = 'cars';
    for (const mesh of this.types) this.group.add(mesh.bodies, mesh.trims, mesh.lights, mesh.headlights);
  }

  spawn(typeIndex, x, z, yaw, speed, lane = 0, police = false) {
    // CAR_TYPES only has 3 entries: an out-of-range index would leave the car
    // unmatched in sync() and therefore never drawn.
    const ti = ((typeIndex % CAR_TYPES.length) + CAR_TYPES.length) % CAR_TYPES.length;
    const car = createCar(ti, x, z, yaw, speed, lane, police);
    car.id = this.nextId++;
    this.cars.push(car);
    return car;
  }

  remove(car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
  }

  /** Route a car along the road network: straight to a random point on a random road. */
  routeCar(car, routes) {
    const route = pickRoute(routes);
    car.route = route;
    car.routeIndex = 0;
  }

  sync() {
    for (const mesh of this.types) {
      const bodies = [], trims = [], lights = [], colors = [];
      this.cars.forEach((car) => {
        if (CAR_TYPES[car.typeIndex] !== mesh.type) return;
        const m = new THREE.Matrix4().makeRotationY(car.yaw);
        m.setPosition(car.x, 0.28, car.z);
        bodies.push(m); trims.push(m); lights.push(m);
        const c = new THREE.Color(car.paintColor);
        colors.push(c);
      });
      // three r160 crashes updating an InstancedMesh attribute of length 0, so the
      // draw count never drops to 0; empty types are hidden instead.
      const on = bodies.length > 0;
      const n = Math.max(bodies.length, 1);
      mesh.bodies.count = n;
      mesh.trims.count = n;
      mesh.lights.count = n;
      mesh.bodies.visible = on; mesh.trims.visible = on; mesh.lights.visible = on; mesh.headlights.visible = on;
      if (!on) continue;
      for (let i = 0; i < bodies.length; i += 1) {
        mesh.bodies.setMatrixAt(i, bodies[i]);
        mesh.trims.setMatrixAt(i, trims[i]);
        mesh.lights.setMatrixAt(i, lights[i]);
        mesh.headlights.setMatrixAt(i, lights[i]);
        mesh.bodies.setColorAt(i, colors[i]);
      }
      mesh.bodies.instanceMatrix.needsUpdate = true;
      if (mesh.bodies.instanceColor) mesh.bodies.instanceColor.needsUpdate = true;
      mesh.trims.instanceMatrix.needsUpdate = true;
      mesh.lights.instanceMatrix.needsUpdate = true;
      mesh.headlights.instanceMatrix.needsUpdate = true;
    }
  }

  update(step) {
    for (const car of this.cars) {
      const type = CAR_TYPES[car.typeIndex];
      const accel = car.police ? VEHICLE.policeAccel : VEHICLE.accel;
      const top = car.police ? VEHICLE.policeTopSpeed : VEHICLE.topSpeed;
      if (car.speed < car.targetSpeed) car.speed = Math.min(car.targetSpeed, car.speed + accel * step * 0.6);
      else if (car.speed > car.targetSpeed) car.speed = Math.max(car.targetSpeed, car.speed - VEHICLE.brake * step * 0.5);
      car.speed = Math.min(car.speed, top);
      car.speed *= Math.pow(VEHICLE.drag, step * 60);

      if (car.routeIndex < car.route.length) {
        const target = car.route[car.routeIndex];
        const dx = target.x - car.x, dz = target.z - car.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 7) { car.routeIndex += 1; continue; }
        const wantYaw = Math.atan2(-dx, dz);
        let err = wantYaw - car.yaw;
        while (err > Math.PI) err -= Math.PI * 2;
        while (err < -Math.PI) err += Math.PI * 2;
        const turn = VEHICLE.steer * Math.min(dist / 14, 1);
        car.yaw += err * turn * step * (1 - Math.min(car.speed / 32, 0.5));
      }
      car.x -= Math.sin(car.yaw) * car.speed * step;
      car.z += Math.cos(car.yaw) * car.speed * step;
    }
  }
}

function pickRoute(routes) {
  const route = routes[Math.floor(Math.random() * routes.length)];
  // drive a segment of it
  const start = route.from + (route.to - route.from) * Math.random() * 0.6;
  const end = route.to;
  const step = (end - start) * 0.25;
  const points = [];
  let t = start;
  while ((route.to > route.from ? t < end : t > end)) {
    points.push({ x: route.axis === 'x' ? t : route.fixed, z: route.axis === 'x' ? route.fixed : t });
    t += step;
  }
  points.push({ x: route.axis === 'x' ? end : route.fixed, z: route.axis === 'x' ? route.fixed : end });
  return points;
}
