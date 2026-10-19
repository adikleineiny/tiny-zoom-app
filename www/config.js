// ===== Tiny Zoom — tunable game config =====
// Units: 1 unit = 1 cm, speeds in cm/s, times in seconds, battery in %.
// Override at runtime with ?cfg={"vehicles":{"drone":{"thrust":120}}} (URL-encoded JSON, deep-merged).
export const CONFIG = {
  laps: 3,
  physicsHz: 120,
  maxAltitude: 110,          // "radio range" ceiling for flyers
  barrierHeight: 6,          // foam track barriers; flyers above this can cut over them
  droneShortcutMargin: 55,   // extra lateral room (cm) a flying drone gets beyond the barriers (0 near gates / tight sections)
  gravity: 640,              // cm/s² for jumping / knocked-up ground vehicles (toy-scale, a bit floaty on purpose)
  // flyers get extra lateral room in these sections (×droneShortcutMargin); 0 = must stay between the barriers
  sectionFlyMargin: { 2: 0, 3: 0, 5: 0, 7: 0, 6: 1.6 },

  // ===== Never stuck: Lakitu-style rescue + soft track boundaries (player AND AI, all vehicles) =====
  rescue: {
    enabled: true,
    stuckTime: 1.6,        // s not moving (< moveDist) while trying to move (throttle / pitch) → rescue
    idleTime: 4,           // s not moving at all while touching a wall / prop → rescue
    noProgressTime: 5,     // s without forward track progress while trying to move (circling, jittering on a gate) → rescue
    wrongWayTime: 3.5,     // s driving the wrong way → rescue
    offTrack: 25,          // cm beyond the allowed lateral limit → rescue
    fallDepth: 25,         // cm below the ground (fell through / in a hole) → rescue
    embedTime: 0.3,        // s with the centre inside a solid → rescue
    moveDist: 6,           // cm: "moved" threshold for the stuck detectors
    progressStep: 15,      // cm of track progress that counts as making progress
    animTime: 0.7,         // s: lift + fade out, then drop in on the track
    backDist: 30,          // cm behind the stuck point (along the track) where you are put back
    skipAhead: 45,         // 3rd rescue in a row at the same spot: put ahead of the obstacle instead (always finishes)
    repeatWindow: 8, repeatProgress: 60,
    immune: 1.6,           // s of invulnerability after a rescue
    boost: 0.45,           // × top speed: little push when dropped back in
    softBand: 7,           // cm inside the lateral limit where the invisible boundary starts to push back
    softPush: 6,           // how strongly outward lateral speed is damped in the band (1/s)
    softSteer: 2.2,        // rad/s: cars heading out of the track get their nose gently turned back
  },

  // ===== Terrain: ramps, hills, puddles =====
  terrain: {
    rampKick: 1.0,         // global multiplier on every ramp/hill's take-off pop (per-feature `kick` in track.js FEATURES)
    hillKick: 1.7,         // take-off pop over hill crests
    airGravityMul: 0.62,   // gravity multiplier while flying off a ramp/hill (floaty arcade air)
    slopeAccel: 0.55,      // how much slopes slow you uphill / speed you up downhill (× gravity × slope)
    maxStep: 3.2,          // terrain edges higher than this (cm) act like a wall (e.g. the side of a ramp)
  },

  // ===== Flyer handling assist (drone + helicopter) =====
  // level 0 = raw simulation (hard), 1 = maximum help. Override e.g. ?cfg={"flyerAssist":{"level":0.3}}
  flyerAssist: {
    level: 0.85,
    autoAltitude: true,    // stick centred → hold a safe altitude that follows the terrain and drops under the next gate / ceiling
    cruiseAlt: 22,         // auto-altitude height above the terrain (cm)
    ceilingGuard: true,    // climbing is softly limited so you don't bonk gate bars / tunnel & table ceilings
    headingAssist: 1.8,    // rad/s-ish pull of the nose toward the track direction when you are not steering
    yawExpo: 0.45,         // softer yaw around stick centre (precise small corrections)
    extraLateralDamp: 3.5, // kills sideways sliding
    brakeDrag: 1.6,        // extra air-brake when the forward stick is released (stops drifting on)
    tiltBoost: 1.6,        // helicopter: rotor-disc tilt follows the stick this much faster
    wobbleCut: 0.8,        // helicopter: hover wobble reduced by this fraction
  },

  vehicles: {
    car: {
      label: 'RC Car',
      topSpeed: 118,       // on tile floor
      accel: 210,
      brakeDecel: 330,
      reverseTop: 45,
      coastDecel: 45,
      steerRate: 2.9,      // rad/s at full lock
      steerSpeedRef: 30,   // below this speed steering fades out
      highSpeedSteerLoss: 0.35,
      grip: 9,             // lateral slip damping (higher = less drift)
      halfWidth: 5, radius: 6.5, height: 7,
      batteryDrainBase: 0.10, batteryDrainThrottle: 0.15,   // %/s
      // arcade feel
      launchBoost: 0.9,    // extra accel at low speed (×(1+launchBoost) from standstill, fades to ×1 at top speed)
      driftGrip: 0.42,     // grip multiplier while drifting (hard steer at speed)
      driftThreshold: 0.65, driftMinSpeed: 0.55, // |steer| above this and speed above this × topSpeed = drift
      driftSteerBoost: 1.25,
      airSteer: 1.4,       // rad/s of yaw control while airborne
      jumpV: 140,          // jump take-off speed (cm/s) → peak ≈ jumpV²/(2·gravity)
      jumpCooldown: 0.35,
      stepUp: 1.5,         // auto-climb ledges up to this height (cm)
      wallBounce: 0.35,    // velocity kept (reflected) when hitting a wall head-on
      wallSlide: 0.99,     // tangential speed kept when scraping a wall
      mass: 1,
    },
    drone: {
      label: 'Drone',
      thrust: 150,         // horizontal accel at full pitch; top speed ≈ thrust/drag
      drag: 1.25,          // low drag = more inertia (slow to start AND slow to stop)
      lateralDamp: 2.0,    // how quickly sideways drift dies out
      tiltResponse: 0,     // >0: thrust follows a lagging rotor-disc tilt (helicopter feel); 0 = instant (drone)
      hoverWobble: 0,      // cm/s of random altitude drift when not climbing
      yawRate: 2.5,
      climbRate: 42,
      climbResponse: 3.5,
      spoolTime: 1.0,      // rotor spin-up before full thrust (slow take-off)
      takeoffAltitude: 3,  // below this the drone is "on the ground" and can't thrust properly
      groundFriction: 6,
      halfWidth: 6.5, radius: 6.5, height: 5,
      batteryDrainBase: 0.8, batteryDrainThrust: 0.7, batteryDrainClimb: 0.4, // %/s
      hopV: 70,            // JUMP button on a drone = quick upward hop
      mass: 0.8,
    },
  },

  // ===== The 5 RC vehicles =====
  // `class` picks the physics (car = ground, drone = flyer); every other key overrides vehicles[class].
  // `grass` replaces the grass surface multipliers for that model. `stats` = menu bars only (0-100).
  models: {
    racecar: { class: 'car', label: 'RC Race Car', icon: '🏎️', note: 'Grippy all-rounder',
      topSpeed: 142, accel: 275, grip: 10.5, steerRate: 2.9, jumpV: 140, mass: 1,
      grass: { speed: 0.62, accel: 0.6, grip: 0.72 }, stats: { Speed: 82, Accel: 78, Handling: 80, Jump: 65 } },
    moto: { class: 'car', label: 'RC Motorcycle', icon: '🏍️', note: 'Fastest top speed, leans & wheelies – twitchy, light',
      topSpeed: 140, accel: 270, grip: 6.6, steerRate: 3.0, highSpeedSteerLoss: 0.3, driftGrip: 0.5, jumpV: 150, mass: 0.7,
      radius: 5, halfWidth: 3.5, height: 7, grass: { speed: 0.66, accel: 0.62, grip: 0.6 }, stats: { Speed: 95, Accel: 82, Handling: 55, Jump: 75 } },
    scooter: { class: 'car', label: 'RC Kick-Scooter', icon: '🛴', note: 'Super agile, best launch, very light',
      topSpeed: 131, accel: 310, grip: 12, steerRate: 3.8, steerSpeedRef: 18, highSpeedSteerLoss: 0.15, jumpV: 160, mass: 0.55,
      radius: 4.5, halfWidth: 3, height: 8, grass: { speed: 0.7, accel: 0.7, grip: 0.8 }, stats: { Speed: 70, Accel: 95, Handling: 98, Jump: 90 } },
    drone: { class: 'drone', label: 'RC Drone', icon: '🛸', note: 'Hovers & flies over obstacles – needs charging ⚡',
      stats: { Speed: 68, Accel: 50, Handling: 85, Jump: 0 } },
    heli: { class: 'drone', label: 'RC Helicopter', icon: '🚁', note: 'Fast forward flight, heavy momentum, wobbly hover ⚡',
      thrust: 148, drag: 1.05, lateralDamp: 1.1, yawRate: 2.0, climbRate: 36, climbResponse: 1.7, tiltResponse: 2.6, hoverWobble: 5,
      radius: 7.5, halfWidth: 7, height: 6, mass: 1.1, batteryDrainBase: 0.95, batteryDrainThrust: 0.75,
      stats: { Speed: 88, Accel: 40, Handling: 45, Jump: 0 } },
  },

  // Surface multipliers per vehicle type
  surfaces: {
    tile:  { label: 'Tiles', car: { speed: 1.0, accel: 1.0, grip: 1.0 }, drone: { speed: 1.0, accel: 1.0 } },
    grass: { label: 'Grass',    car: { speed: 0.64, accel: 0.6, grip: 0.7 }, drone: { speed: 1.0, accel: 1.0 } },
    road:  { label: 'Play-mat road', car: { speed: 1.0, accel: 1.0, grip: 1.0 }, drone: { speed: 1.0, accel: 1.0 } },
    water: { label: 'Puddle / mud', car: { speed: 0.42, accel: 0.45, grip: 0.5 }, drone: { speed: 1.0, accel: 1.0 } },
  },

  battery: {
    lowThreshold: 25,     // below this %, speed is reduced
    minSpeedFactor: 0.55, // speed factor at 0%
    padChargeRate: 55,    // %/s while on a pad
    padRadius: 20,
    padMaxAltitude: 9,    // drone must be this low (cm) over the pad to charge
  },

  ai: {
    lookahead: 28, lookaheadSpeedK: 0.32,
    cruiseAltitude: 30,
    rechargeBelow: 42, rechargeUntil: 90,
    latAcc: { car: 330, drone: 225, heli: 190 },
    brake: { car: 280, drone: 112, heli: 90 },
    sectionCap: { car: { 2: 112, 3: 92 }, drone: { 2: 92, 3: 74, 5: 92 }, heli: { 2: 82, 3: 62, 5: 84 } },
    skill: [0.985, 0.965, 0.95],
    hopMaxHeight: 12,       // AI cars jump obstacles up to this height
    randomJumpRate: 0.06,   // random "for fun" jumps per second on straights
  },

  // ===== Secret weapons =====
  weapons: {
    enabled: true,
    boxRows: [0.05, 0.15, 0.24, 0.33, 0.43, 0.52, 0.61, 0.70, 0.79, 0.89, 0.96], // where '?' box rows sit (fraction of lap)
    boxLat: [-0.55, 0, 0.55],  // lateral positions (fraction of half width)
    boxRespawn: 4, boxRadius: 10, droneCollectAlt: 34,
    rollTime: 1.3,             // slot-machine roll before you get the weapon
    aiUseDelay: [0.5, 2.0], aiMaxHold: 7,
    weights: { ball: 1, shock: 1, rocket: 0.8, oil: 1, zap: 1, glove: 1, bomb: 1, turbo: 1.1, fire: 1 },
    hit: { immune: 1.4, spinRate: 10 },   // invulnerability after any hit (no stun-lock)
    ball:   { speed: 250, life: 4, radius: 3.2, bounce: 0.72, knock: 170, up: 90, spin: 0.6, slow: 0.5 },
    rocket: { speed: 245, turn: 4.5, life: 4.5, range: 800, up: 230, knock: 60, tumble: 1.0, slow: 0.3 },
    shock:  { radius: 70, knock: 240, up: 90, tumble: 0.6, slow: 0.55 },
    oil:    { radius: 13, life: 12, spin: 0.9, slow: 0.6, maxAlt: 10 },  // drones skimming below maxAlt slip too
    zap:    { range: 150, chainRange: 100, chainMax: 3, stun: 0.9, slow: 0.4, droneDrop: 60 },
    glove:  { reach: 50, cone: 0.75, knock: 300, up: 110, spin: 0.6, slow: 0.5, time: 0.42 },
    bomb:   { fuse: 3.2, throwSpeed: 170, throwUp: 85, radius: 42, up: 240, knock: 170, tumble: 1.1, slow: 0.35, passCooldown: 0.6, mineLife: 6 },
    turbo:  { time: 1.7, speedMul: 1.55, accelMul: 2.6, ramKnock: 230, ramUp: 100, droneThrustMul: 1.7 },
    fire:   { time: 1.6, patchEvery: 0.06, patchLife: 2.6, patchRadius: 8, coneReach: 32, spin: 0.7, slow: 0.65, droneHeat: 110, droneMaxAlt: 45 },
  },

  camera: {
    fov: 70,
    car:   { dist: 32, height: 11, lookAhead: 22, lookUp: 3 },
    speedFov: 10,          // extra FOV at top speed (feels faster)
    turboFov: 14,          // extra FOV kick while turbo is on
    drone: { dist: 38, height: 12, lookAhead: 22, lookUp: 2 },
  },
  render: { maxPixelRatio: 1.5 },
};

function deepMerge(t, s) {
  for (const k of Object.keys(s)) {
    if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k]) && t[k] && typeof t[k] === 'object') deepMerge(t[k], s[k]);
    else t[k] = s[k];
  }
}
try {
  const p = new URLSearchParams(location.search);
  if (p.get('cfg')) deepMerge(CONFIG, JSON.parse(p.get('cfg')));
  if (p.get('laps')) CONFIG.laps = Math.max(1, parseInt(p.get('laps')));
} catch (e) { console.warn('bad cfg param', e); }
if (typeof window !== 'undefined') window.RC_CONFIG = CONFIG;
