// Geometry helpers: three r160's core build has no BufferGeometryUtils, so this merges parts by
// hand. Merging is what keeps the draw count low: forty palms become two instanced meshes, a car
// is one body/trim/lights triple, and a street of lamps is one instanced mesh with a transform list.
import * as THREE from 'three';

const ATTRIBUTES = ['position', 'normal', 'uv', 'color'];

/**
 * Merge geometries into one, each transformed by its matrix and optionally tinted (baked into a
 * vertex colour attribute). Attributes are position/normal/uv/color only, which is all this game
 * uses; every input is converted to non-indexed fan-out when the set is mixed.
 */
export function mergeParts(parts) {
  let total = 0;
  let hasColor = false;
  const prepared = [];
  for (const part of parts) {
    let geometry;
    let matrix = null;
    let color;
    if (part.geometry !== undefined) {
      geometry = part.geometry;
      matrix = part.matrix ? part.matrix.clone() : null;
      color = part.color;
    } else if (part.attributes && part.attributes.position) {
      geometry = part;
    } else {
      throw new Error('mergeParts: part has no geometry');
    }
    geometry = geometry.index !== null ? geometry.toNonIndexed() : geometry.clone();
    if (!geometry.attributes.uv) {
      const count = geometry.attributes.position.count;
      geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    }
    if (color !== undefined) hasColor = true;
    prepared.push({ geometry, matrix, color });
    total += geometry.attributes.position.count;
  }
  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  const vertexColor = hasColor ? new Float32Array(total * 3) : null;
  let offset = 0;
  const normalMatrix = new THREE.Matrix3();
  const vector = new THREE.Vector3();
  for (const part of prepared) {
    const geometry = part.geometry;
    const count = geometry.attributes.position.count;
    const pos = geometry.attributes.position;
    const nor = geometry.attributes.normal;
    const uvs = geometry.attributes.uv;
    if (part.matrix) {
      normalMatrix.getNormalMatrix(part.matrix);
      for (let i = 0; i < count; i += 1) {
        vector.fromBufferAttribute(pos, i).applyMatrix4(part.matrix);
        position[(offset + i) * 3] = vector.x;
        position[(offset + i) * 3 + 1] = vector.y;
        position[(offset + i) * 3 + 2] = vector.z;
        vector.fromBufferAttribute(nor, i).applyMatrix3(normalMatrix).normalize();
        normal[(offset + i) * 3] = vector.x;
        normal[(offset + i) * 3 + 1] = vector.y;
        normal[(offset + i) * 3 + 2] = vector.z;
        uv[(offset + i) * 2] = uvs.getX(i);
        uv[(offset + i) * 2 + 1] = uvs.getY(i);
      }
    } else {
      position.set(pos.array, offset * 3);
      normal.set(nor.array, offset * 3);
      uv.set(uvs.array, offset * 2);
    }
    if (vertexColor) {
      const tint = part.color === undefined ? [1, 1, 1] : part.color;
      for (let i = 0; i < count; i += 1) {
        vertexColor[(offset + i) * 3] = tint[0];
        vertexColor[(offset + i) * 3 + 1] = tint[1];
        vertexColor[(offset + i) * 3 + 2] = tint[2];
      }
    }
    offset += count;
    geometry.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(position, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (vertexColor) merged.setAttribute('color', new THREE.BufferAttribute(vertexColor, 3));
  merged.computeBoundingSphere();
  merged.userData.sources = parts.map((p) => (p.geometry && p.geometry.userData && p.geometry.userData.debugName) || 'raw');
  return merged;
}

export const IDENTITY = new THREE.Matrix4();

/** A transform matrix from position, y-rotation and scale (the only transforms props need). */
export function transformMatrix(x, y, z, rotationY = 0, sx = 1, sy = 1, sz = 1) {
  const matrix = new THREE.Matrix4();
  matrix.compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationY),
    new THREE.Vector3(sx, sy, sz),
  );
  return matrix;
}

/** A geometry shifted/scaled in place, for parts authored at the origin. */
export function placed(geometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const matrix = new THREE.Matrix4();
  const euler = new THREE.Euler(rx, ry, rz);
  matrix.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(euler), new THREE.Vector3(1, 1, 1));
  const clone = geometry.clone();
  clone.applyMatrix4(matrix);
  return clone;
}

/** A box with its base at y=0, centred on x/z, which is how every prop is authored. */
export function box(width, height, depth, x = 0, y = 0, z = 0) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  geometry.translate(x, y + height / 2, z);
  return geometry;
}

/** A cylinder with its base at y=0. */
export function cylinder(radiusTop, radiusBottom, height, segments, x = 0, y = 0, z = 0) {
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments);
  geometry.translate(x, y + height / 2, z);
  return geometry;
}

/** A flat quad on the XZ plane, facing up, with UVs spanning 0..1. */
export function quad(width, depth, x = 0, y = 0, z = 0, rotationY = 0) {
  const geometry = new THREE.PlaneGeometry(width, depth);
  geometry.rotateX(-Math.PI / 2);
  if (rotationY !== 0) geometry.rotateY(rotationY);
  geometry.translate(x, y, z);
  return geometry;
}

/** A vertical quad facing +Z by default, for signs and window cards. */
export function panel(width, height, x = 0, y = 0, z = 0, rotationY = 0) {
  const geometry = new THREE.PlaneGeometry(width, height);
  if (rotationY !== 0) geometry.rotateY(rotationY);
  geometry.translate(x, y + height / 2, z);
  return geometry;
}

/** One instanced mesh from a geometry, material and list of matrices (plus optional colours). */
export function instanced(geometry, material, matrices, colours = null) {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, matrices.length));
  mesh.count = matrices.length;
  for (let i = 0; i < matrices.length; i += 1) mesh.setMatrixAt(i, matrices[i]);
  if (colours) {
    for (let i = 0; i < matrices.length; i += 1) mesh.setColorAt(i, colours[i]);
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * UV-aware solids. A BoxGeometry's per-face 0..1 UVs stretch a facade texture differently on a
 * 6 m wall than on a 30 m one; these build each face's UVs from its own world size divided by a
 * texel tile, so one stucco pattern keeps the same window size on every building in the city.
 * A prism is the same solid with different bottom and top footprints: the art-deco setback.
 */
const FACES = [
  { n: [1, 0, 0], corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { n: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];

export function prism(wBottom, dBottom, wTop, dTop, height, tileU = 8, tileV = 14, yBase = 0) {
  const position = [];
  const normal = [];
  const uv = [];
  const centroid = [wBottom / 2, 0, dBottom / 2];
  for (const face of FACES) {
    const points = face.corners.map(([x, y, z]) => {
      const t = y;
      const w = wBottom + (wTop - wBottom) * t;
      const d = dBottom + (dTop - dBottom) * t;
      return [
        centroid[0] + (x - 0.5) * w,
        yBase + y * height,
        centroid[2] + (z - 0.5) * d,
      ];
    });
    const faceWidth = face.n[1] !== 0
      ? (face.n[1] > 0 ? Math.max(wTop, dTop) : Math.max(wBottom, dBottom))
      : (face.n[0] !== 0 ? (face.n[0] > 0 ? dBottom + (dTop - dBottom) * 0.5 : dBottom) : wBottom);
    const faceHeight = face.n[1] !== 0 ? 1 : height;
    const corners = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (const index of [0, 1, 2, 0, 2, 3]) {
      position.push(points[index][0], points[index][1], points[index][2]);
      normal.push(face.n[0], face.n[1], face.n[2]);
      uv.push(corners[index][0] * (faceWidth / tileU), corners[index][1] * (faceHeight / tileV));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeBoundingSphere();
  geometry.userData.debugName = 'prism';
  return geometry;
}

/** A box with world-scaled UVs, its base at y = 0 (or at yBase). */
export function boxUV(width, height, depth, tileU = 8, tileV = 14, yBase = 0) {
  const g = prism(width, depth, width, depth, height, tileU, tileV, yBase);
  g.userData.debugName = 'box';
  return g;
}

/** A cylinder with its base at y = 0 and UVs running once around its circumference. */
export function cylinderUV(radiusTop, radiusBottom, height, segments, yBase = 0, openEnded = false) {
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments, 1, openEnded);
  geometry.translate(0, height / 2 + yBase, 0);
  geometry.userData.debugName = 'cylinder';
  return geometry;
}

/** A flat XZ quad with UVs scaled to world size, for road and pavement decals. */
export function groundQuad(width, depth, tileU = 8, tileV = 8) {
  const geometry = new THREE.PlaneGeometry(width, depth);
  geometry.rotateX(-Math.PI / 2);
  const uvs = geometry.attributes.uv;
  for (let i = 0; i < uvs.count; i += 1) {
    uvs.setXY(i, uvs.getX(i) * (width / tileU), uvs.getY(i) * (depth / tileV));
  }
  uvs.needsUpdate = true;
  return geometry;
}

