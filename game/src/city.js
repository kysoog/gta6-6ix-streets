// The city of Vice Meridian, built once at load from the seed: a 4x4 grid of avenues and streets,
// nine buildable blocks of pastel hotels and offices, a seawall promenade, a sand beach with a
// pier, palms, lamps, hydrants, benches, bus stops and a marina of moored boats. Everything is
// merged into one mesh per material and returned with colliders, spawn lanes, and the props the
// simulation needs (pedestrian routes, traffic lanes, sign positions).
//
// Layout (metres, +x east toward the ocean, +z south toward the pier):
//   x = -96..96 the four avenues, z = -96..96 the four streets, roads 16 m wide with a 4.5 m
//   pavement each side; east of x = 108.5 the sand runs to the surf at 134.
import * as THREE from 'three';
import { CITY, PALETTE, VEHICLE } from './config.js';
import { boxUV, prism, cylinderUV, groundQuad, instanced, mergeParts, transformMatrix, placed } from './geometry.js';
import { addBuilding, fillBlock, facadeMaterial, FACADE_TINTS } from './buildings.js';
import {
  asphaltTexture, sidewalkTexture, sandTexture, waterTexture, concreteTexture,
  stripeTexture, radialTexture, frondTexture,
} from './textures.js';

const ROAD = CITY.roads;
const PITCH = CITY.pitch;

/** The nine blocks between the roads, in the order the traffic and missions use them. */
export function cityBlocks() {
  const blocks = [];
  const edges = [
    [-CITY.bounds - 32, ROAD[0]], [ROAD[0], ROAD[1]], [ROAD[1], ROAD[2]], [ROAD[2], ROAD[3]], [ROAD[3], CITY.bounds + 32],
  ];
  for (let iz = 0; iz < edges.length; iz += 1) {
    for (let ix = 0; ix < edges.length; ix += 1) {
      const [x0, x1] = edges[ix];
      const [z0, z1] = edges[iz];
      blocks.push({
        x0: x0 + CITY.roadHalf + CITY.sidewalk,
        x1: x1 - CITY.roadHalf - CITY.sidewalk,
        z0: z0 + CITY.roadHalf + CITY.sidewalk,
        z1: z1 - CITY.roadHalf - CITY.sidewalk,
        ix,
        iz,
      });
    }
  }
  return blocks.filter((b) => b.x1 - b.x0 > 8 && b.z1 - b.z0 > 8);
}

/** Road centrelines as segments, used by traffic and by the minimap. */
export function roadNetwork() {
  const segments = [];
  const extent = CITY.bounds + 40;
  for (const x of ROAD) segments.push({ axis: 'z', fixed: x, from: -extent, to: extent });
  for (const z of ROAD) segments.push({ axis: 'x', fixed: z, from: -extent, to: extent });
  return segments;
}

/**
 * Builds the whole city. Returns { group, colliders, signs, lanes, blocks, pedRoutes, landmarks }.
 * `colliders` are AABBs in XZ (walls, piers, statues); the physics pass reads them and nothing else.
 */
export function buildCity(seed, random) {
  const group = new THREE.Group();
  group.name = 'city';
  const colliders = [];
  const signs = [];
  const pedRoutes = [];
  const parts = new Map();
  const materials = new Map();

  const material = (name, build) => {
    let found = materials.get(name);
    if (found === undefined) {
      found = build();
      materials.set(name, found);
    }
    return found;
  };

  // ---------- ground: asphalt, pavements, sand, promenade ----------

  const asphalt = material('asphalt', () => new THREE.MeshStandardMaterial({
    map: asphaltTexture(), roughness: 0.78, metalness: 0.06, color: 0xffffff, envMapIntensity: 0.5,
  }));
  const sidewalk = material('sidewalk', () => new THREE.MeshStandardMaterial({
    map: sidewalkTexture(), roughness: 0.9, metalness: 0.0, envMapIntensity: 0.3,
  }));
  const sand = material('sand', () => new THREE.MeshStandardMaterial({
    map: sandTexture(), roughness: 0.96, metalness: 0.0, envMapIntensity: 0.25,
  }));

  const groundParts = [];
  const kerbParts = [];
  // The road plane spans the whole grid so no seam shows at a junction.
  const roadway = groundQuad(CITY.bounds * 2 + 120, CITY.bounds * 2 + 120, CITY.pitch, CITY.pitch);
  roadway.rotateX(0);
  groundParts.push({ geometry: roadway, matrix: transformMatrix(0, 0, 0) });

  // Pavements: a raised slab per block face, plus the outer promenade along the beach.
  const raised = CITY.curb;
  for (const block of cityBlocks()) {
    const w = block.x1 - block.x0 + CITY.sidewalk * 2;
    const d = block.z1 - block.z0 + CITY.sidewalk * 2;
    const slab = boxUV(w, raised, d, 6, 6, 0);
    slab.translate((block.x0 + block.x1) / 2, 0, (block.z0 + block.z1) / 2);
    groundParts.push({ geometry: slab, matrix: transformMatrix(0, 0, 0) });
    // Kerb lip: a slightly darker band around the slab.
    const lipThickness = 0.22;
    kerbParts.push({
      geometry: boxUV(w + lipThickness, raised + 0.02, lipThickness, 4, 1, 0),
      matrix: transformMatrix((block.x0 + block.x1) / 2, 0, block.z1 + CITY.sidewalk),
    });
    kerbParts.push({
      geometry: boxUV(w + lipThickness, raised + 0.02, lipThickness, 4, 1, 0),
      matrix: transformMatrix((block.x0 + block.x1) / 2, 0, block.z0 - CITY.sidewalk),
    });
    kerbParts.push({
      geometry: boxUV(lipThickness, raised + 0.02, d, 1, 4, 0),
      matrix: transformMatrix(block.x1 + CITY.sidewalk, 0, (block.z0 + block.z1) / 2),
    });
    kerbParts.push({
      geometry: boxUV(lipThickness, raised + 0.02, d, 1, 4, 0),
      matrix: transformMatrix(block.x0 - CITY.sidewalk, 0, (block.z0 + block.z1) / 2),
    });
  }

  // Beach: a wide sand sheet east of the promenade, and the seawall edge.
  const beachDepth = CITY.sandEnd - CITY.sandStart;
  const beach = groundQuad(beachDepth, CITY.bounds * 2 + 260, 14, 14);
  beach.translate(CITY.sandStart + beachDepth / 2, -0.06, 0);
  const beachMesh = new THREE.Mesh(beach, sand);
  beachMesh.receiveShadow = true;
  group.add(beachMesh);

  const promenade = boxUV(6.5, 0.24, CITY.bounds * 2 + 260, 6, 6, 0);
  promenade.translate(CITY.sandStart - 3.25, 0, 0);
  groundParts.push({ geometry: promenade, matrix: transformMatrix(0, 0, 0) });

  const roadMesh = new THREE.Mesh(mergeParts(groundParts), asphalt);
  roadMesh.receiveShadow = true;
  roadMesh.name = 'streets';
  group.add(roadMesh);
  const kerbMaterial = material('kerb', () => new THREE.MeshStandardMaterial({ map: sidewalkTexture(), roughness: 0.92, color: 0xd8cbb8 }));
  const kerbMesh = new THREE.Mesh(mergeParts(kerbParts), kerbMaterial);
  kerbMesh.receiveShadow = true;
  group.add(kerbMesh);

  // Ocean: a plane with a slow, cheap vertex ripple, so it is not a flat colour card.
  const water = buildOcean(material);
  group.add(water.mesh);

  // ---------- lane markings and crosswalks ----------
  const markings = buildMarkings(material);
  group.add(markings);

  // ---------- buildings ----------
  const blocks = cityBlocks();
  for (const block of blocks) {
    if (block.x0 > 100) continue; // the beach block has no buildings
    fillBlock(parts, signs, colliders, block, random, block.x0 > 60 ? 'beach' : 'sprawl');
    // Pedestrian route: a rectangle inset into the pavement ring around the block.
    const inset = CITY.sidewalk / 2;
    pedRoutes.push([
      { x: block.x0 - inset, z: block.z0 - inset },
      { x: block.x1 + inset, z: block.z0 - inset },
      { x: block.x1 + inset, z: block.z1 + inset },
      { x: block.x0 - inset, z: block.z1 + inset },
    ]);
  }

  // Merge each material's parts into one mesh.
  for (const [name, list] of parts) {
    let build;
    if (name.startsWith('facade|')) {
      const [, tint, style] = name.split('|');
      build = () => facadeMaterial(tint, style, name.length * 7 + 3);
    } else if (name === 'trim') {
      build = () => new THREE.MeshStandardMaterial({ color: 0xfff4e2, roughness: 0.72, metalness: 0.03, envMapIntensity: 0.5 });
    } else if (name === 'roof') {
      build = () => new THREE.MeshStandardMaterial({ color: 0xd9cfc0, roughness: 0.94, metalness: 0.02 });
    } else if (name === 'awning') {
      build = () => new THREE.MeshStandardMaterial({
        map: stripeTexture('#f7f2e6', '#e2503f'), roughness: 0.85, metalness: 0.0, side: THREE.DoubleSide,
      });
    } else {
      build = () => new THREE.MeshStandardMaterial({ map: concreteTexture(), roughness: 0.9 });
    }
    const mesh = new THREE.Mesh(mergeParts(list), material(name, build));
    mesh.castShadow = name !== 'roof';
    mesh.receiveShadow = true;
    mesh.name = name;
    group.add(mesh);
  }

  // ---------- palms, lamps, street furniture ----------
  group.add(buildPalms(random, colliders));
  const furniture = buildFurniture(parts, random, material);
  for (const mesh of furniture) group.add(mesh);

  // ---------- pier ----------
  const pier = buildPier(random, material, colliders);
  for (const mesh of pier.meshes) group.add(mesh);

  // ---------- neon signs ----------
  const signGroup = buildSigns(signs, material);
  group.add(signGroup.group);

  // ---------- moored boats off the pier ----------
  group.add(buildBoats(random, material));

  return {
    group,
    colliders,
    signs,
    water,
    signGroup,
    blocks,
    pedRoutes,
    landmarks: {
      pierHead: { x: CITY.sandStart + 86, z: 46 },
      marina: { x: CITY.sandStart + 8, z: 78 },
      plaza: { x: 0, z: 0 },
    },
    materials,
  };
}

function buildOcean(material) {
  const geometry = new THREE.PlaneGeometry(1300, 1300, 48, 48);
  geometry.rotateX(-Math.PI / 2);
  const map = waterTexture();
  map.repeat.set(64, 64);
  const waterMaterial = material('water', () => new THREE.MeshStandardMaterial({
    map,
    color: 0x9fe6e0,
    roughness: 0.14,
    metalness: 0.55,
    envMapIntensity: 1.5,
    transparent: true,
    opacity: 0.96,
  }));
  const mesh = new THREE.Mesh(geometry, waterMaterial);
  mesh.position.set(CITY.waterStart + 560, -0.35, 0);
  mesh.receiveShadow = false;
  mesh.name = 'ocean';
  // Animate in the loop: two crossing sine swells, computed on the CPU over 48x48 verts (2.3k).
  const base = geometry.attributes.position.array.slice();
  return {
    mesh,
    update(time) {
      const position = geometry.attributes.position;
      for (let i = 0; i < position.count; i += 1) {
        const x = base[i * 3];
        const z = base[i * 3 + 2];
        const wave = Math.sin(x * 0.06 + time * 0.9) * 0.28 + Math.cos(z * 0.045 + time * 0.6) * 0.22;
        position.array[i * 3 + 1] = base[i * 3 + 1] + wave;
      }
      position.needsUpdate = true;
      geometry.computeVertexNormals();
    },
  };
}

function buildMarkings(material) {
  const parts = [];
  const paint = material('paint', () => new THREE.MeshStandardMaterial({
    color: 0xf4ecd8, roughness: 0.72, metalness: 0.0, transparent: true, opacity: 0.9,
  }));
  const yellow = material('paintYellow', () => new THREE.MeshStandardMaterial({
    color: 0xf0c53c, roughness: 0.72, transparent: true, opacity: 0.9,
  }));
  const extent = CITY.bounds + 38;
  // Centre dashes: short quads every 8 m along each road, skipping the junctions.
  for (const x of ROAD) {
    for (let z = -extent; z < extent; z += 8) {
      if (ROAD.some((road) => Math.abs(z - road) < CITY.roadHalf + 2)) continue;
      parts.push({ geometry: groundQuad(0.28, 3.6), matrix: transformMatrix(x, 0.012, z) });
    }
  }
  for (const z of ROAD) {
    for (let x = -extent; x < extent; x += 8) {
      if (ROAD.some((road) => Math.abs(x - road) < CITY.roadHalf + 2)) continue;
      parts.push({ geometry: groundQuad(3.6, 0.28), matrix: transformMatrix(x, 0.012, z) });
    }
  }
  const dashes = new THREE.Mesh(mergeParts(parts), paint);
  dashes.receiveShadow = false;

  const yellowParts = [];
  // Solid double line down the middle of each avenue and street.
  for (const x of ROAD) {
    for (let z = -extent; z < extent; z += 24) {
      if (ROAD.some((road) => Math.abs(z + 12 - road) < CITY.roadHalf + 2)) continue;
      yellowParts.push({ geometry: groundQuad(0.16, 22), matrix: transformMatrix(x - 0.22, 0.012, z + 11) });
      yellowParts.push({ geometry: groundQuad(0.16, 22), matrix: transformMatrix(x + 0.22, 0.012, z + 11) });
    }
  }
  for (const z of ROAD) {
    for (let x = -extent; x < extent; x += 24) {
      if (ROAD.some((road) => Math.abs(x + 12 - road) < CITY.roadHalf + 2)) continue;
      yellowParts.push({ geometry: groundQuad(22, 0.16), matrix: transformMatrix(x + 11, 0.012, z - 0.22) });
      yellowParts.push({ geometry: groundQuad(22, 0.16), matrix: transformMatrix(x + 11, 0.012, z + 0.22) });
    }
  }
  const centre = new THREE.Mesh(mergeParts(yellowParts), yellow);
  centre.receiveShadow = false;

  // Crosswalk bars at every junction mouth.
  const barParts = [];
  for (const x of ROAD) {
    for (const z of ROAD) {
      for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        if (dx !== 0) {
          // Crossing over an avenue: bars run along z, laid across the road at x + dir.
          for (let i = 0; i < 5; i += 1) {
            const ox = x + dx * (CITY.roadHalf - 2.4);
            const oz = z + (i - 2) * 1.6;
            barParts.push({ geometry: groundQuad(2.2, 0.7), matrix: transformMatrix(ox, 0.014, oz) });
          }
        } else {
          for (let i = 0; i < 5; i += 1) {
            const oz = z + dz * (CITY.roadHalf - 2.4);
            const ox = x + (i - 2) * 1.6;
            barParts.push({ geometry: groundQuad(0.7, 2.2), matrix: transformMatrix(ox, 0.014, oz) });
          }
        }
      }
    }
  }
  const bars = new THREE.Mesh(mergeParts(barParts), paint);

  const group = new THREE.Group();
  group.name = 'road markings';
  group.add(dashes, centre, bars);
  dashes.renderOrder = 1;
  centre.renderOrder = 1;
  bars.renderOrder = 1;
  return group;
}

/** Palms: a tapered ringed trunk and a crown of drooping frond cards, two instanced meshes. */
function buildPalms(random, colliders) {
  const group = new THREE.Group();
  group.name = 'palms';

  const trunkParts = [];
  const segments = 7;
  for (let i = 0; i < segments; i += 1) {
    const t = i / segments;
    const radius = 0.34 - t * 0.16;
    const segment = cylinderUV(radius * 0.92, radius, 1.02, 7, i * 0.96);
    // A slight lean, alternating, so a row of palms is not a row of posts.
    segment.translate(Math.sin(t * 2.2) * 0.16 + t * t * 0.5, 0, Math.cos(t * 1.6) * 0.1);
    trunkParts.push({ geometry: segment });
  }
  const trunkGeometry = mergeParts(trunkParts);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x9a7b58, roughness: 0.95, metalness: 0.0 });
  const frondGeometry = makeFrondCluster();
  const frondMaterial = new THREE.MeshStandardMaterial({
    map: frondTexture(), transparent: true, alphaTest: 0.42, side: THREE.DoubleSide,
    roughness: 0.85, metalness: 0.0, color: 0xd8f0c0,
  });

  const trunks = [];
  const fronds = [];
  const spots = [];
  // Palm rows: the beachfront every 14 m, the promenade every 18 m, and two per block corner.
  for (let z = -CITY.bounds - 20; z <= CITY.bounds + 60; z += 13) {
    spots.push({ x: CITY.sandStart + 2.6 + random() * 1.6, z, scale: 0.9 + random() * 0.4, rot: random() * 6.28 });
  }
  for (const x of ROAD) {
    for (let z = -CITY.bounds - 24; z < CITY.bounds + 24; z += 26) {
      spots.push({ x: x + CITY.roadHalf + 2.2, z: z + random() * 4, scale: 0.82 + random() * 0.35, rot: random() * 6.28 });
      spots.push({ x: x - CITY.roadHalf - 2.2, z: z + 13 + random() * 4, scale: 0.82 + random() * 0.35, rot: random() * 6.28 });
    }
  }
  for (const block of cityBlocks()) {
    for (const [cx, cz] of [[block.x0 + 4, block.z0 + 4], [block.x1 - 4, block.z1 - 4]]) {
      if (cx > 104) continue;
      spots.push({ x: cx, z: cz, scale: 0.95 + random() * 0.4, rot: random() * 6.28 });
    }
  }
  for (const spot of spots) {
    const lean = (random() - 0.5) * 0.13;
    trunks.push(transformMatrix(spot.x, 0.2, spot.z, spot.rot, spot.scale, spot.scale, spot.scale));
    fronds.push(transformMatrix(spot.x, 0.2 + 6.9 * spot.scale, spot.z, spot.rot, spot.scale, spot.scale, spot.scale));
    colliders.push({ minX: spot.x - 0.4, maxX: spot.x + 0.4, minZ: spot.z - 0.4, maxZ: spot.z + 0.4, height: 7, soft: true });
    void lean;
  }
  const trunkMesh = instanced(trunkGeometry, trunkMaterial, trunks);
  trunkMesh.castShadow = true;
  trunkMesh.receiveShadow = true;
  const frondMesh = instanced(frondGeometry, frondMaterial, fronds);
  frondMesh.castShadow = true;
  group.add(trunkMesh, frondMesh);
  return group;
}

/** 9 fronds arranged around the crown, each a bent card, merged into one geometry. */
function makeFrondCluster() {
  const parts = [];
  const count = 9;
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 + 0.4;
    const droop = 0.55 + (i % 3) * 0.22;
    const geometry = new THREE.PlaneGeometry(3.9, 1.5, 3, 1);
    const position = geometry.attributes.position;
    // Bend the card along its length so the frond arcs down away from the crown.
    for (let v = 0; v < position.count; v += 1) {
      const x = position.getX(v);
      const t = Math.min(Math.max((x + 1.95) / 3.9, 0), 1);
      position.setY(v, position.getY(v) * (1 - t * 0.45));
      position.setZ(v, -Math.pow(t, 1.7) * 1.5 * droop);
    }
    geometry.computeVertexNormals();
    geometry.rotateZ(-0.22 - droop * 0.18);
    geometry.rotateY(angle);
    geometry.translate(Math.cos(angle) * 1.7, -0.2 - droop * 0.12, Math.sin(angle) * 1.7);
    parts.push({ geometry });
  }
  return mergeParts(parts);
}

/** Lamps, hydrants, benches, bus shelters, bins, traffic lights, and the boulevard's street signs. */
function buildFurniture(parts, random, material) {
  const meshes = [];
  const poleMatrices = [];
  const headMatrices = [];
  const hydrantMatrices = [];
  const benchParts = [];
  const binMatrices = [];

  const lampSpots = [];
  for (const x of ROAD) {
    for (let z = -CITY.bounds - 20; z < CITY.bounds + 20; z += 21) {
      lampSpots.push({ x: x + CITY.roadHalf + 1.1, z });
      lampSpots.push({ x: x - CITY.roadHalf - 1.1, z: z + 10 });
    }
  }
  for (const z of ROAD) {
    for (let x = -CITY.bounds - 20; x < CITY.bounds + 20; x += 21) {
      lampSpots.push({ x, z: z + CITY.roadHalf + 1.1 });
      lampSpots.push({ x: x + 10, z: z - CITY.roadHalf - 1.1 });
    }
  }
  for (const spot of lampSpots) {
    poleMatrices.push(transformMatrix(spot.x, 0, spot.z));
    headMatrices.push(transformMatrix(spot.x, 6.4, spot.z));
  }

  const poleGeometry = mergeParts([
    { geometry: cylinderUV(0.09, 0.13, 6.4, 8, 0) },
    { geometry: boxUV(1.5, 0.12, 0.12, 1, 1, 6.3), matrix: transformMatrix(0.7, 0, 0) },
  ]);
  const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x3b4046, roughness: 0.55, metalness: 0.7 });
  const poles = instanced(poleGeometry, poleMaterial, poleMatrices);
  poles.castShadow = true;
  meshes.push(poles);

  const headGeometry = mergeParts([
    { geometry: boxUV(1.1, 0.18, 0.42, 1, 1, 0) },
  ]);
  const headMaterial = new THREE.MeshStandardMaterial({
    color: 0xfff3d6, emissive: 0xffe0a8, emissiveIntensity: 1.6, roughness: 0.4, metalness: 0.1,
  });
  meshes.push(instanced(headGeometry, headMaterial, headMatrices.map((m) => m.clone().multiply(transformMatrix(0.9, 0, 0)))));

  // One flat additive light pool per boulevard lamp on the road: radius ~2.2 m, sitting just
  // above the tarmac (y = 0.02) so the boulevard reads as lit at dusk without per-pixel lighting.
  const poolParts = [];
  for (const spot of lampSpots) {
    poolParts.push({ geometry: placed(new THREE.PlaneGeometry(4.4, 4.4), spot.x, 0.02, spot.z, -Math.PI / 2) });
  }
  const poolGeometry = mergeParts(poolParts);
  const poolMaterial = new THREE.MeshBasicMaterial({
    color: 0xfff3d6, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  const pools = new THREE.Mesh(poolGeometry, poolMaterial);
  pools.frustumCulled = false;
  meshes.push(pools);

  // Hydrants: bright coral, a dot of colour on every corner.
  for (const block of cityBlocks()) {
    if (block.x0 > 104) continue;
    hydrantMatrices.push(transformMatrix(block.x0 - 1.6, 0.24, block.z0 - 1.6));
    hydrantMatrices.push(transformMatrix(block.x1 + 1.6, 0.24, block.z1 + 1.6));
  }
  const hydrantGeometry = mergeParts([
    { geometry: cylinderUV(0.16, 0.19, 0.72, 8, 0) },
    { geometry: cylinderUV(0.1, 0.1, 0.16, 8, 0.7) },
    { geometry: boxUV(0.5, 0.1, 0.1, 1, 1, 0.42) },
  ]);
  const hydrantMaterial = new THREE.MeshStandardMaterial({ color: 0xe2432f, roughness: 0.6, metalness: 0.2 });
  meshes.push(instanced(hydrantGeometry, hydrantMaterial, hydrantMatrices));

  // Benches on the promenade, facing the water.
  for (let z = -CITY.bounds; z <= CITY.bounds; z += 11) {
    const x = CITY.sandStart - 5.2;
    benchParts.push({ geometry: boxUV(2.6, 0.14, 0.62, 2, 1, 0.52), matrix: transformMatrix(x, 0.24, z, Math.PI / 2) });
    benchParts.push({ geometry: boxUV(2.6, 0.5, 0.12, 2, 1, 1.06), matrix: transformMatrix(x + 0.3, 0.24, z, Math.PI / 2) });
    benchParts.push({ geometry: boxUV(0.12, 0.52, 0.5, 1, 1, 0), matrix: transformMatrix(x, 0.24, z - 1.1, Math.PI / 2) });
    benchParts.push({ geometry: boxUV(0.12, 0.52, 0.5, 1, 1, 0), matrix: transformMatrix(x, 0.24, z + 1.1, Math.PI / 2) });
  }
  const benchMaterial = new THREE.MeshStandardMaterial({ color: 0x8a5a3c, roughness: 0.85, metalness: 0.05 });
  const benches = new THREE.Mesh(mergeParts(benchParts), benchMaterial);
  benches.castShadow = true;
  benches.receiveShadow = true;
  meshes.push(benches);

  // Bins near the benches.
  for (let z = -CITY.bounds; z <= CITY.bounds; z += 22) {
    binMatrices.push(transformMatrix(CITY.sandStart - 7.6, 0.24, z + 4));
  }
  const binGeometry = cylinderUV(0.32, 0.28, 0.95, 10, 0);
  const binMaterial = new THREE.MeshStandardMaterial({ color: 0x2f6f5e, roughness: 0.7, metalness: 0.25 });
  meshes.push(instanced(binGeometry, binMaterial, binMatrices));

  // Traffic lights at the avenue junctions: the vertical detail that says "city" from the air.
  const trafficParts = [];
  for (const x of ROAD) {
    for (const z of ROAD) {
      for (const [dx, dz] of [[1, 1], [-1, -1]]) {
        const px = x + dx * (CITY.roadHalf + 1.4);
        const pz = z + dz * (CITY.roadHalf + 1.4);
        trafficParts.push({ geometry: cylinderUV(0.1, 0.12, 5.4, 6, 0), matrix: transformMatrix(px, 0.24, pz) });
        trafficParts.push({ geometry: boxUV(0.42, 1.15, 0.34, 1, 1, 0), matrix: transformMatrix(px, 5.2, pz) });
      }
    }
  }
  const traffic = new THREE.Mesh(mergeParts(trafficParts), poleMaterial);
  traffic.castShadow = true;
  meshes.push(traffic);

  return meshes;
}

/** The pier: decking on pilings, a pavilion, railings and lamp posts out over the surf. */
function buildPier(random, material, colliders) {
  const meshes = [];
  const deckParts = [];
  const railParts = [];
  const pilingMatrices = [];
  const startX = CITY.sandStart;
  const endX = CITY.sandStart + 96;
  const width = 13;
  const z = 46;
  const deck = boxUV(endX - startX, 0.55, width, 8, 8, 0);
  deck.translate((startX + endX) / 2, 0.0, z);
  deckParts.push({ geometry: deck });
  // Deck planks: thin darker strips across the width every 1.2 m, so the pier reads as timber.
  for (let x = startX + 1; x < endX; x += 1.2) {
    deckParts.push({ geometry: boxUV(0.16, 0.06, width, 1, 1, 0.55), matrix: transformMatrix(x, 0, z) });
  }
  // Pilings: pairs every 8 m, standing in the water.
  for (let x = startX + 3; x < endX; x += 8) {
    for (const dz of [-width / 2 + 0.8, width / 2 - 0.8]) {
      pilingMatrices.push(transformMatrix(x, -2.4, z + dz));
    }
  }
  // Railings along both sides.
  for (let x = startX + 1; x < endX; x += 2.4) {
    railParts.push({ geometry: boxUV(0.1, 1.05, 0.1, 1, 1, 0.55), matrix: transformMatrix(x, 0, z - width / 2 + 0.4) });
    railParts.push({ geometry: boxUV(0.1, 1.05, 0.1, 1, 1, 0.55), matrix: transformMatrix(x, 0, z + width / 2 - 0.4) });
  }
  railParts.push({ geometry: boxUV(endX - startX, 0.09, 0.09, 4, 1, 1.6), matrix: transformMatrix((startX + endX) / 2, 0, z - width / 2 + 0.4) });
  railParts.push({ geometry: boxUV(endX - startX, 0.09, 0.09, 4, 1, 1.6), matrix: transformMatrix((startX + endX) / 2, 0, z + width / 2 - 0.4) });

  const deckMaterial = new THREE.MeshStandardMaterial({ color: 0xb08a63, roughness: 0.92, metalness: 0.0 });
  const deckMesh = new THREE.Mesh(mergeParts(deckParts), deckMaterial);
  deckMesh.receiveShadow = true;
  deckMesh.castShadow = true;
  meshes.push(deckMesh);

  const railMaterial = new THREE.MeshStandardMaterial({ color: 0xe8e2d2, roughness: 0.6, metalness: 0.3 });
  const railMesh = new THREE.Mesh(mergeParts(railParts), railMaterial);
  railMesh.castShadow = true;
  meshes.push(railMesh);

  const pilingMaterial = new THREE.MeshStandardMaterial({ color: 0x5b4a3a, roughness: 0.95 });
  meshes.push(instanced(cylinderUV(0.36, 0.4, 5.2, 8, 0), pilingMaterial, pilingMatrices));

  // Pavilion at the head: a scalloped roof on four posts, with a neon ring.
  const pavilion = [];
  const headX = endX - 12;
  for (const [dx, dz] of [[-5, -4.6], [5, -4.6], [-5, 4.6], [5, 4.6]]) {
    pavilion.push({ geometry: cylinderUV(0.22, 0.26, 5.2, 8, 0.55), matrix: transformMatrix(headX + dx, 0, z + dz) });
  }
  pavilion.push({ geometry: cylinderUV(7.4, 0.4, 1.5, 6, 5.7), matrix: transformMatrix(headX, 0, z) });
  pavilion.push({ geometry: cylinderUV(0.25, 0.25, 1.2, 6, 7.2), matrix: transformMatrix(headX, 0, z) });
  const pavilionMesh = new THREE.Mesh(mergeParts(pavilion), new THREE.MeshStandardMaterial({ color: 0xf3e6d2, roughness: 0.7 }));
  pavilionMesh.castShadow = true;
  meshes.push(pavilionMesh);
  colliders.push({ minX: headX + 4.4, maxX: headX + 5.6, minZ: z - 5.2, maxZ: z - 4.0, height: 5 });
  colliders.push({ minX: headX - 5.6, maxX: headX - 4.4, minZ: z - 5.2, maxZ: z - 4.0, height: 5 });

  // Ferris-wheel silhouette out past the pier head: the postcard landmark.
  const wheel = [];
  const wheelX = endX + 34;
  const wheelZ = z - 6;
  for (const [dx, dz] of [[-3.4, 0], [3.4, 0]]) {
    wheel.push({ geometry: cylinderUV(0.4, 0.5, 22, 6, -3.5), matrix: transformMatrix(wheelX + dx, 0, wheelZ + dz) });
  }
  const rim = new THREE.TorusGeometry(11, 0.32, 6, 32);
  rim.translate(0, 22, 0);
  wheel.push({ geometry: rim, matrix: transformMatrix(wheelX, 0, wheelZ, 0.2) });
  for (let i = 0; i < 12; i += 1) {
    const spoke = boxUV(0.16, 0.16, 21, 1, 1, 0);
    spoke.rotateY(0);
    wheel.push({ geometry: spoke, matrix: transformMatrix(wheelX, 22, wheelZ, (i / 12) * Math.PI * 2) });
  }
  const wheelMesh = new THREE.Mesh(mergeParts(wheel), new THREE.MeshStandardMaterial({
    color: 0xffd8e4, emissive: 0xff4f9a, emissiveIntensity: 0.35, roughness: 0.5, metalness: 0.3,
  }));
  wheelMesh.castShadow = true;
  meshes.push(wheelMesh);

  return { meshes };
}

/** Neon signs: one plane per sign, sharing one material per colour, with a faint glow quad behind. */
function buildSigns(signs, material) {
  const group = new THREE.Group();
  group.name = 'neon signs';
  const byColour = new Map();
  const glowParts = [];
  for (const sign of signs) {
    let list = byColour.get(sign.colour);
    if (list === undefined) {
      list = [];
      byColour.set(sign.colour, list);
    }
    list.push(sign);
  }
  const textures = new Map();
  for (const [colour, list] of byColour) {
    const palettes = [0x0b0d18, 0x120a16, 0x0a1214];
    for (const sign of list) {
      const key = `${sign.text}|${colour}`;
      let texture = textures.get(key);
      if (texture === undefined) {
        texture = signTexture(sign.text, colour);
        textures.set(key, texture);
      }
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(sign.width, sign.height),
        new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false, side: THREE.DoubleSide }),
      );
      plane.position.set(sign.x, sign.y, sign.z);
      plane.rotation.y = sign.yaw;
      group.add(plane);
      glowParts.push({
        sign,
        geometry: new THREE.PlaneGeometry(sign.width * 1.5, sign.height * 2.4),
      });
      void palettes;
    }
  }
  // One additive glow sheet behind all the signs, tinted per sign with vertex colours.
  const glowGeometryParts = [];
  const colours = new Map();
  for (const { sign, geometry } of glowParts) {
    const matrix = transformMatrix(sign.x + Math.sin(sign.yaw) * 0.06, sign.y, sign.z + Math.cos(sign.yaw) * 0.06, sign.yaw);
    const c = new THREE.Color(sign.colour);
    glowGeometryParts.push({ geometry, matrix, color: [c.r, c.g, c.b] });
  }
  if (glowGeometryParts.length > 0) {
    const merged = mergeParts(glowGeometryParts);
    const glowMaterial = new THREE.MeshBasicMaterial({
      map: radialTexture('rgba(255,255,255,0.5)', 'rgba(255,255,255,0)'),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      vertexColors: true, toneMapped: false, side: THREE.DoubleSide, opacity: 0.55,
    });
    const glow = new THREE.Mesh(merged, glowMaterial);
    glow.name = 'sign glow';
    group.add(glow);
  }
  return { group };
}

/** A sign texture: bright tube text on a dark plate, drawn with a glow (see textures.js). */
function signTexture(text, colour) {
  // Import cycle-free: build it here so signs.js stays the only owner of sign art.
  const w = 512, h = 160;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#0c0f18';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,0.12)';
  g.lineWidth = 6;
  g.strokeRect(3, 3, w - 6, h - 6);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const size = Math.min(84, Math.floor((w - 60) / Math.max(4, text.length) * 1.6));
  g.font = `900 ${size}px "Arial Black", Helvetica, Arial, sans-serif`;
  const css = `#${colour.toString(16).padStart(6, '0')}`;
  g.shadowColor = css;
  g.shadowBlur = 30;
  g.fillStyle = css;
  g.fillText(text, w / 2, h / 2 + 3);
  g.shadowBlur = 14;
  g.fillText(text, w / 2, h / 2 + 3);
  g.shadowBlur = 0;
  g.globalAlpha = 0.9;
  g.fillStyle = '#fffaf0';
  g.fillText(text, w / 2, h / 2 + 3);
  g.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/** A few moored boats bobbing off the marina: cheap hull-and-cabin hulls, merged. */
function buildBoats(random, material) {
  const group = new THREE.Group();
  group.name = 'marina';
  const hullMaterial = new THREE.MeshStandardMaterial({ color: 0xf6f2e8, roughness: 0.42, metalness: 0.12 });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: 0x2b6f8a, roughness: 0.4, metalness: 0.3 });
  const boats = [];
  for (let i = 0; i < 7; i += 1) {
    const hull = new THREE.BufferGeometry();
    const length = 6 + random() * 5;
    const beam = 2.2 + random() * 0.8;
    // A wedge: pointed bow, square stern, flared sides.
    const positions = [
      -beam / 2, 0, -length / 2, beam / 2, 0, -length / 2, 0, 0, length / 2,
      -beam / 2, 0, -length / 2, 0, 0, length / 2, 0, 1.1, length / 2,
      beam / 2, 0, -length / 2, 0, 1.1, length / 2, 0, 0, length / 2,
      -beam / 2, 0, -length / 2, -beam / 2, 1.1, -length / 2, beam / 2, 1.1, -length / 2,
      -beam / 2, 0, -length / 2, beam / 2, 1.1, -length / 2, beam / 2, 0, -length / 2,
    ];
    hull.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    hull.computeVertexNormals();
    const mesh = new THREE.Mesh(hull, hullMaterial);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(beam * 0.6, 0.9, length * 0.3), trimMaterial);
    cabin.position.set(0, 1.35, -length * 0.1);
    const boat = new THREE.Group();
    boat.add(mesh, cabin);
    boat.position.set(CITY.waterStart + 12 + random() * 26, -0.2, -30 + i * 24 + random() * 10);
    boat.rotation.y = random() * 6.28;
    boat.userData.phase = random() * 6.28;
    boats.push(boat);
    group.add(boat);
  }
  group.userData.boats = boats;
  group.userData.update = (time) => {
    for (const boat of boats) {
      boat.position.y = -0.2 + Math.sin(time * 0.9 + boat.userData.phase) * 0.14;
      boat.rotation.z = Math.sin(time * 0.7 + boat.userData.phase) * 0.03;
      boat.rotation.x = Math.cos(time * 0.8 + boat.userData.phase) * 0.025;
    }
  };
  return group;
}

/** Lane anchor points the traffic system picks its routes from. */
export function trafficRoutes() {
  const routes = [];
  const extent = CITY.bounds + 30;
  for (const x of ROAD) {
    routes.push({ axis: 'z', lanes: [-4, 4], x, from: -extent, to: extent });
    routes.push({ axis: 'z', lanes: [-4, 4], x, from: extent, to: -extent });
  }
  for (const z of ROAD) {
    routes.push({ axis: 'x', lanes: [-4, 4], z, from: -extent, to: extent });
    routes.push({ axis: 'x', lanes: [-4, 4], z, from: extent, to: -extent });
  }
  return routes;
}

export const ROAD_LIST = ROAD;
export const BLOCK_PITCH = PITCH;
export { VEHICLE as VEHICLE_SPEC };
export { FACADE_TINTS };
