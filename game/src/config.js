// Every tuning number, colour and world measurement in one place. The simulation runs in metres
// and seconds; the renderer matches those units, so a lane is 4 m wide because LANES is [-4, 4].
// Change a number here and the whole city, traffic and wanted system retune with it.
//
// The city is a 4x4 grid of avenues and streets 64 m apart, with a beach and ocean on its east
// side: 9 buildable blocks, one pier, ~250 m from the west seawall to the surf.

export const STEP = 1 / 60;
// Longest single simulation frame the fixed-step integrator will swallow. Headless captures run
// at 2-5 fps, so without this clamp a dt-scaled sim would jump metres per frame.
export const MAX_FRAME = 0.12;

/** One grid: avenues run north-south (constant x), streets east-west (constant z). */
export const CITY = {
  pitch: 64,              // metres between adjacent avenues / streets
  roads: [-96, -32, 32, 96],
  roadHalf: 8,            // half-width of a road, metres; pavements sit outside this
  sidewalk: 4.5,          // pavement width either side of a road
  curb: 0.18,             // kerb lip height, metres
  blockInset: 12.5,
  /** East of this the paving ends and the sand begins. */
  sandStart: 108.5,
  sandEnd: 134,           // where the surf starts
  waterStart: 134,
  bounds: 112,            // city half-extent; roads run a little past it
  streetNames: {
    ns: ['Sabal Ave', 'Meridian Ave', 'Flamingo Ave', 'Marina Ave'],
    ew: ['Banyan St', 'Palmetto St', 'Tidewater St', 'Pier St'],
  },
};

export const DISTRICTS = [
  { name: 'Sabal Heights', x0: -140, x1: -32, z0: -140, z1: 140 },
  { name: 'Neon Mile', x0: -32, x1: 32, z0: -140, z1: 140 },
  { name: 'The Strand', x0: 32, x1: 108.5, z0: -140, z1: 140 },
  { name: 'Sunset Pier', x0: 60, x1: 160, z0: 96, z1: 160 },
];

export const PLAYER = {
  radius: 0.42,
  height: 1.78,
  walk: 3.6,              // metres/s on foot
  run: 6.6,               // metres/s with Shift held
  turnRate: 9,
  health: 100,
  armor: 0,
  maxHealth: 100,
  /** Health lost per second while nothing has hurt you, once safe: slow, GTA-like recovery. */
  regen: 1.6,
  regenDelay: 9,          // seconds without damage before regen starts
  respawnSeconds: 3.2,
  weapon: { name: 'Pistol', damage: 34, range: 90, cooldown: 0.34, spread: 0.012, ammo: 60, magSize: 12, reload: 1.3 },
};

export const VEHICLE = {
  /** Arcade car: forward acceleration, metres/s^2. */
  accel: 12,
  reverseAccel: 7,
  /** Civilian top speed, metres/s. */
  topSpeed: 34,
  brake: 26,
  drag: 0.9,              // per-second speed retention (re-applied every step via pow)
  steer: 1.9,             // yaw-rate scale; stronger at low speed
  grip: 7.5,
  handbrakeGrip: 1.5,
  wheelBase: 2.72,
  width: 2.0,
  length: 4.6,
  height: 1.35,
  mass: 1400,
  health: 220,
  /** Cops' cruisers: faster and harder to shake than civilian traffic. */
  policeTopSpeed: 39,
  policeAccel: 15,
};

/** Lane centres, as offsets from a road's centreline: right-hand traffic, two lanes each way. */
export const LANES = [-4, 4];

export const TRAFFIC = {
  carCount: 26,
  minSpeed: 8,
  maxSpeed: 14,
  gap: 11,                // metres between spawned cars on a route
  despawn: 260,           // metres past the route end before a car is removed
  /** Probability a car turns at each intersection it reaches. */
  turnChance: 0.34,
};

export const PEDS = {
  count: 44,              // budget: one instanced draw call draws every ped
  walk: 1.35,
  run: 4.4,
  /** How far a pedestrian runs when it panics, and how long it stays scared. */
  panicSeconds: 9,
  panicRadius: 26,
};

export const POLICE = {
  maxUnits: 6,
  spawnInterval: 3.2,     // seconds between cop spawn attempts while wanted
  copHealth: 90,
  copDamage: 9,
  copFireDelay: 0.9,
  arrestRadius: 2.6,
  sirenColours: [0xff2b45, 0x2b6bff],
};

export const WANTED = {
  max: 5,
  /** Stars added per crime. */
  shot: 1,
  kill: 1,
  copKill: 2,
  carTheft: 0,
  hitCop: 2,
  explosion: 1,
  /** Seconds out of cop sight before one star decays (base; scales with held stars). */
  decayBase: 7,
  /** Extra decay seconds per held star: heat at 5 stars lasts much longer than at 1. */
  decayPerStar: 0.25,
  /** Metres: the wanted level only decays while every cop is outside this radius. */
  sightRange: 40,
};

export const MONEY = {
  start: 250,
  pedDrop: 15,
  missionBase: 800,
  stash: 120,
};

/** Golden hour, dusk and night: the three looks the scenes use, as light and fog values. */
export const TIME_OF_DAY = {
  golden: {
    sunDir: [-0.62, 0.26, 0.74],
    sunColor: 0xffd2a1,
    sunIntensity: 3.1,
    sky: { top: 0x2e8fd4, horizon: 0xffd0a6, haze: 0xffb27a, sun: 0xfff0d0 },
    fogColor: 0xffc79b,
    fogNear: 70,
    fogFar: 430,
    ambient: 0x8fb6e0,
    ground: 0xffb478,
    ambientIntensity: 0.85,
    nightAmount: 0.12,
    exposure: 1.0,
  },
  dusk: {
    sunDir: [-0.86, 0.1, 0.5],
    sunColor: 0xff9a6a,
    sunIntensity: 1.9,
    sky: { top: 0x1b3f7a, horizon: 0xff9e7a, haze: 0xd9718e, sun: 0xffd2a0 },
    fogColor: 0xc27a86,
    fogNear: 55,
    fogFar: 380,
    ambient: 0x6b6bb0,
    ground: 0xd06a5a,
    ambientIntensity: 0.7,
    nightAmount: 0.55,
    exposure: 1.05,
  },
  night: {
    sunDir: [0.4, 0.34, -0.85],
    sunColor: 0x9fb4ff,
    sunIntensity: 0.5,
    sky: { top: 0x050b1f, horizon: 0x2b2a5e, haze: 0x503a72, sun: 0xbfd0ff },
    fogColor: 0x14122e,
    fogNear: 45,
    fogFar: 320,
    ambient: 0x2a2c5c,
    ground: 0x1a1a34,
    ambientIntensity: 0.55,
    nightAmount: 1,
    exposure: 1.1,
  },
};

export const PALETTE = {
  asphalt: '#3a3b44',
  asphaltDark: '#2c2d35',
  sidewalk: '#d9cbb4',
  curb: '#c2b6a2',
  sand: '#e8d3ae',
  wall: ['#f6d9c9', '#e9e2c8', '#cfe6dd', '#e8cfe0', '#f3e3bd', '#d5dff0', '#f7c9b4', '#ddeedd'],
  neon: ['#ff4f9a', '#33e6ff', '#ffd166', '#a6ff4f', '#ff7a45', '#c77dff'],
  hudInk: '#f6f1e6',
  hudDim: 'rgba(246,241,230,0.62)',
  hudAccent: '#ffd166',
  hudDanger: '#ff3d5a',
  hudPanel: 'rgba(11,14,24,0.46)',
  minimapRoads: '#3f3a46',
  minimapBlocks: '#5a5f74',
  minimapWater: '#1f6f8b',
  minimapSand: '#cbb387',
};
