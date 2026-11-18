// Procedural buildings: hotels with balconies, offices with ribbon glass, and art-deco corners,
// each a merged set of prisms sharing a handful of stucco materials. Nothing is modelled by hand:
// a footprint, a floor count and a style become a massing with parapets, cornices, shopfronts,
// striped awnings, roof plant and a neon sign, and every solid's UVs come from its world size so
// window rows stay the same height on a 5-storey hotel and a 14-storey tower.
//
// The generator returns plain data (parts keyed by material, a collider, sign specs) and city.js
// merges all of it into one mesh per material: 40 buildings, ~14 draw calls.
import * as THREE from 'three';
import { PALETTE } from './config.js';
import { boxUV, prism, cylinderUV, IDENTITY } from './geometry.js';
import { facadeTexture } from './textures.js';

export const FACADE_TINTS = [
  '#f7dccb', '#efe7cd', '#cfe8df', '#e6cfe3', '#f2dfba', '#d6e2f2', '#f8c9b6', '#e2eedb',
];

const STYLES = ['hotel', 'office', 'deco'];
const FLOOR_HEIGHT = 3.4;

/** Material key for a tint+style pair, so buildings that share a look share one draw call. */
function key(tint, style) {
  return `facade|${tint}|${style}`;
}

export function facadeMaterial(tint, style, seed) {
  const map = facadeTexture(tint, style, seed);
  return new THREE.MeshStandardMaterial({
    map,
    roughness: 0.82,
    metalness: 0.04,
    envMapIntensity: 0.45,
  });
}

/**
 * One building. `spec`: { x, z, w, d, floors, tint, style, facing } where facing is the street
 * side the shopfront, awnings and sign look at (0 = +z, 1 = +x, 2 = -z, 3 = -x).
 * Pushes geometry into `parts` (a Map of material key -> geometry list) so city.js can merge.
 */
export function addBuilding(parts, signs, colliders, spec, random) {
  const { x, z, w, d, tint, style, facing } = spec;
  const floors = spec.floors;
  const height = 3.2 + floors * FLOOR_HEIGHT;
  const halfW = w / 2;
  const halfD = d / 2;
  const material = key(tint, style);
  const push = (geometry) => {
    let list = parts.get(material);
    if (list === undefined) {
      list = [];
      parts.set(material, list);
    }
    list.push(geometry);
  };

  // Yaw the whole building so its represented street side faces the road.
  const yaw = facing === 0 ? 0 : facing === 1 ? -Math.PI / 2 : facing === 2 ? Math.PI : Math.PI / 2;
  const rotate = new THREE.Matrix4().makeRotationY(yaw);
  const place = new THREE.Matrix4().makeTranslation(x, 0, z);
  const world = new THREE.Matrix4().multiplyMatrices(place, rotate);
  const pushWorld = (geometry) => {
    geometry.applyMatrix4(world);
    push(geometry);
  };

  // Ground floor: a recessed shopfront band, darker and glazed, so a street wall has a base.
  pushWorld(boxUV(w, 3.2, d, 6, 3.6));
  // Main mass above it.
  const upper = height - 3.2;
  pushWorld(prism(w, d, w, d, upper, 6, FLOOR_HEIGHT * 2.0, 3.2));
  // Setback tower on tall buildings: a second, narrower block, and a cap.
  if (floors >= 6) {
    const inset = Math.min(3.2, w * 0.16);
    const towerFloors = Math.max(2, Math.floor(floors * 0.35));
    const towerH = towerFloors * FLOOR_HEIGHT;
    pushWorld(prism(w - inset * 2, d - inset * 2, w - inset * 2, d - inset * 2, towerH, 6, FLOOR_HEIGHT * 2.0, height));
    if (floors >= 10) {
      pushWorld(prism(w * 0.42, d * 0.42, w * 0.3, d * 0.3, FLOOR_HEIGHT * 2.2, 6, FLOOR_HEIGHT, height + towerH));
    }
  }

  // Parapet: a lip around the roof, the detail that stops a box reading as a box.
  const trim = 'trim';
  const addTrim = (geometry, matrix) => {
    let list = parts.get(trim);
    if (list === undefined) {
      list = [];
      parts.set(trim, list);
    }
    list.push({ geometry, matrix: matrix ?? IDENTITY });
  };
  const parapetH = 0.85;
  const topY = height;
  // Four lip boxes around the roof edge: two running along x, two along z.
  for (const [lw, ld, lx, lz] of [
    [w + 0.5, 0.5, 0, halfD],
    [w + 0.5, 0.5, 0, -halfD],
    [0.5, d + 0.5, halfW, 0],
    [0.5, d + 0.5, -halfW, 0],
  ]) {
    const g = boxUV(lw, parapetH, ld, 4, 4, 0);
    g.translate(lx, topY, lz);
    g.applyMatrix4(world);
    addTrim(g);
  }
  // Cornice band at the shopfront line.
  const cornice = boxUV(w + 0.35, 0.35, d + 0.35, 4, 4, 3.2);
  cornice.applyMatrix4(world);
  addTrim(cornice);

  // Balconies: a slab and a rail per floor on the street face (hotel) or a ribbon ledge (deco).
  if (style === 'hotel' && floors >= 3) {
    for (let floor = 1; floor < floors; floor += 1) {
      const y = 3.2 + floor * FLOOR_HEIGHT - 0.35;
      const slab = boxUV(w * 0.94, 0.22, 1.35, 3, 3, 0);
      slab.translate(0, y, halfD + 0.62);
      slab.applyMatrix4(world);
      addTrim(slab);
      const rail = boxUV(w * 0.94, 0.92, 0.1, 3, 3, 0);
      rail.translate(0, y + 0.22, halfD + 1.24);
      rail.applyMatrix4(world);
      addTrim(rail);
    }
  } else if (style === 'deco') {
    for (let floor = 2; floor < floors; floor += 2) {
      const y = 3.2 + floor * FLOOR_HEIGHT - 0.3;
      const ledge = boxUV(w + 0.3, 0.28, 0.7, 4, 4, 0);
      ledge.translate(0, y, halfD + 0.3);
      ledge.applyMatrix4(world);
      addTrim(ledge);
    }
  } else if (style === 'office') {
    // A continuous white ribbon per floor: the 1960s curtain-wall look.
    for (let floor = 1; floor < floors; floor += 1) {
      const y = 3.2 + floor * FLOOR_HEIGHT - 0.16;
      const band = boxUV(w + 0.22, 0.26, d + 0.22, 4, 4, 0);
      band.translate(0, y, 0);
      band.applyMatrix4(world);
      addTrim(band);
      break;
    }
  }

  // Roof plant: AC boxes, a stair housing and a water tank, so roofs read from the air.
  const roofParts = parts.get('roof');
  const addRoof = (geometry) => {
    if (roofParts === undefined) {
      parts.set('roof', [{ geometry, matrix: IDENTITY }]);
    } else {
      roofParts.push({ geometry, matrix: IDENTITY });
    }
  };
  const clutter = 2 + Math.floor(random() * 3);
  for (let i = 0; i < clutter; i += 1) {
    const bw = 1.6 + random() * 2.4;
    const bd = 1.4 + random() * 2;
    const bh = 0.7 + random() * 1.1;
    const bx = (random() - 0.5) * Math.max(1, w - bw - 2);
    const bz = (random() - 0.5) * Math.max(1, d - bd - 2);
    const g = boxUV(bw, bh, bd, 3, 3, topY + parapetH * 0.2);
    g.translate(bx, 0, bz);
    g.applyMatrix4(world);
    addRoof(g);
  }

  // AC bank: two condensing units on a plinth — the detail that makes a roof read as plant.
  if (random() < 0.75) {
    const acW = 1.4 + random() * 1.0, acD = 1.1 + random() * 0.9;
    const bx = (random() - 0.5) * Math.max(1, w - acW - 3);
    const bz = (random() - 0.5) * Math.max(1, d - acD - 3);
    const plinth = boxUV(acW + 0.4, 0.22, acD + 0.4, 2, 2, topY + parapetH * 0.2 + 0.02);
    plinth.translate(bx, 0, bz); plinth.applyMatrix4(world); addRoof(plinth);
    const unit = boxUV(acW * 0.5, 0.95, acD * 0.5, 2, 2, topY + parapetH * 0.2 + 0.24);
    unit.translate(bx, 0, bz); unit.applyMatrix4(world); addRoof(unit);
    // Vent stack beside it.
    const vent = boxUV(0.6, 1.4, 0.6, 2, 2, topY + parapetH * 0.2 + 1.3);
    vent.translate(bx + acW * 0.45, 0, bz); vent.applyMatrix4(world); addRoof(vent);
  }

  if (floors >= 4) {
    const tank = cylinderUV(1.5, 1.5, 2.6, 12, topY + 1.4);
    tank.translate((random() - 0.5) * (w * 0.4), 0, (random() - 0.5) * (d * 0.4));
    tank.applyMatrix4(world);
    addRoof(tank);
    const legs = cylinderUV(0.12, 0.12, 1.5, 6, topY);
    legs.translate((random() - 0.5) * (w * 0.4), 0, (random() - 0.5) * (d * 0.4));
    legs.applyMatrix4(world);
    addRoof(legs);
  }

  // Awning over the shopfront on the street face: striped, sloped, with a valance.
  const awningPart = parts.get('awning');
  const awningGeometry = (() => {
    const geo = new THREE.BufferGeometry();
    const width = Math.min(w * 0.8, 9);
    const rows = [
      [-width / 2, 3.05, 0.0], [width / 2, 3.05, 0.0],
      [width / 2, 2.55, 1.9], [-width / 2, 2.55, 1.9],
    ];
    const positions = [];
    const uvs = [];
    const normals = [];
    const push = (i) => {
      positions.push(rows[i][0], rows[i][1], rows[i][2]);
      normals.push(0, 0.86, 0.5);
    };
    const uv = [[0, 0], [2, 0], [2, 1], [0, 1]];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      push(i);
      uvs.push(uv[i][0], uv[i][1]);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.translate(0, 0, halfD);
    geo.applyMatrix4(world);
    return geo;
  })();
  if (awningPart === undefined) parts.set('awning', [awningGeometry]);
  else awningPart.push(awningGeometry);
  {
    const valance = boxUV(Math.min(w * 0.8, 9), 0.42, 0.08, 3, 1, 2.12);
    valance.translate(0, 0, halfD + 1.86);
    valance.applyMatrix4(world);
    parts.get('awning').push(valance);
  }

  // A neon sign on the street face, high enough to be read down the block, plus roof signs on
  // the tallest buildings: the dusk scene's light.
  const colour = PALETTE.neon[Math.floor(random() * PALETTE.neon.length)];
  if (random() < 0.78) {
    const signW = Math.min(w * 0.7, 8.5);
    const signH = signW * 0.28;
    const signY = 3.9 + (floors > 3 ? FLOOR_HEIGHT * 1.1 : 0.2);
    const offset = new THREE.Vector3(0, signY, halfD + 0.28).applyMatrix4(rotate);
    signs.push({
      x: x + offset.x,
      y: offset.y,
      z: z + offset.z,
      yaw: yaw,
      width: signW,
      height: signH,
      colour,
      text: spec.signText,
    });
  }
  if (floors >= 7 && random() < 0.5) {
    const roofW = Math.min(w * 0.62, 10);
    const roofH = roofW * 0.22;
    signs.push({
      x,
      y: topY + 2.4,
      z,
      yaw: yaw,
      width: roofW,
      height: roofH,
      colour: PALETTE.neon[Math.floor(random() * PALETTE.neon.length)],
      text: spec.roofText ?? spec.signText,
      rooftop: true,
    });
  }

  colliders.push({
    minX: x - halfW - 0.35,
    maxX: x + halfW + 0.35,
    minZ: z - halfD - 0.35,
    maxZ: z + halfD + 0.35,
    height,
  });
  return { height, yaw };
}

/**
 * Fills one city block with buildings: two or three masses along the street frontages, always
 * leaving a gap for a courtyard, and never crossing the block's insets.
 */
export function fillBlock(parts, signs, colliders, block, random, district) {
  const { x0, z0, x1, z1 } = block;
  const width = x1 - x0;
  const depth = z1 - z0;
  const centreX = (x0 + x1) / 2;
  const centreZ = (z0 + z1) / 2;
  const templates = [
    // One hotel across the block, tall, facing the avenue.
    { count: 1, floors: 5 + Math.floor(random() * 5) },
    { count: 2, floors: 3 + Math.floor(random() * 4) },
    { count: 3, floors: 2 + Math.floor(random() * 3) },
  ];
  const density = distanceFrom(distanceToWater(centreX, centreZ)) > 60 ? 0 : district === 'sprawl' ? 1 : random() < 0.5 ? 1 : 2;
  const template = templates[Math.min(templates.length - 1, density)];
  // One cohesive facade palette per block so the block reads as a single development:
  // every building draws its tint from this block-level pick, with occasional offset.
  const blockTint = PALETTE.wall[(block.ix * 7 + block.iz * 13 + Math.floor(random() * 3)) % PALETTE.wall.length];
  const facing = Math.abs(centreX) < Math.abs(centreZ) || centreX < 0 ? (centreZ > 0 ? 2 : 0) : centreX > 0 ? 3 : 1;

  if (template.count === 1) {
    const style = pickStyle(random, centreX, centreZ);
    const w = Math.min(width - 2, 26 + random() * 8);
    const d = Math.min(depth - 2, 22 + random() * 6);
    addBuilding(parts, signs, colliders, {
      x: centreX,
      z: centreZ,
      w,
      d,
      floors: template.floors,
      tint: blockTint,
      style,
      facing,
      signText: signName(random, style),
      roofText: signName(random, style),
    }, random);
    return;
  }

  const along = width >= depth ? 'x' : 'z';
  const span = along === 'x' ? width : depth;
  const slice = span / template.count;
  for (let i = 0; i < template.count; i += 1) {
    const offset = -span / 2 + slice * (i + 0.5);
    const bw = along === 'x' ? slice - 2.2 : Math.min(slice - 2.2, depth - 2);
    const bd = along === 'x' ? Math.min(slice - 2.2, depth - 2) : slice - 2.2;
    const style = pickStyle(random, centreX, centreZ);
    addBuilding(parts, signs, colliders, {
      x: along === 'x' ? centreX + offset : centreX,
      z: along === 'x' ? centreZ : centreZ + offset,
      w: along === 'x' ? bw : Math.min(width - 2, bw),
      d: along === 'x' ? Math.min(depth - 2, bd) : bd,
      floors: Math.max(2, template.floors + Math.floor(random() * 3) - 1),
      tint: i % 3 === 0 ? blockTint : PALETTE.wall[(PALETTE.wall.indexOf(blockTint) + 1 + Math.floor(random() * (PALETTE.wall.length - 1))) % PALETTE.wall.length],
      style,
      facing,
      signText: signName(random, style),
    }, random);
  }
}

function pickStyle(random, x, z) {
  // The beachfront is hotels; the inland blocks are offices and deco apartments.
  if (x > 40) return random() < 0.75 ? 'hotel' : 'deco';
  if (x < -40) return random() < 0.45 ? 'office' : 'deco';
  return STYLES[Math.floor(random() * STYLES.length)];
}

const HOTEL_NAMES = ['SANDALWOOD', 'CORAL SANDS', 'MERIDIAN', 'PALMETTO', 'SEA BREEZE', 'AZURE', 'MARABOU', 'TIDEWATER'];
const OFFICE_NAMES = ['NEON MILE', 'BISCAYNE', 'MERIDIAN TRUST', 'COBALT', 'SOUTHERN CROSS', 'ATLAS', 'HARBOR'];
const SHOP_NAMES = ['CAFE', 'TACOS', 'SURF', 'LIQUOR', 'PAWN', 'MOTEL', 'DINER', 'RADIO', 'BODEGA'];

function signName(random, style) {
  const list = style === 'office' ? OFFICE_NAMES : style === 'hotel' ? HOTEL_NAMES : SHOP_NAMES;
  return list[Math.floor(random() * list.length)];
}

function distanceToWater(x, z) {
  return Math.max(0, x - 40);
}

function distanceFrom(value) {
  return value;
}

function distance(a, b) {
  return Math.abs(a - b);
}
