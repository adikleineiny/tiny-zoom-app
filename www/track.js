import * as THREE from './three.module.min.js';
import { CONFIG } from './config.js';

export const SECTION_NAMES = { 1: 'Kitchen Floor', 2: 'Under the Table', 3: 'Pet Door', 4: 'The Lawn', 5: 'Sandbox Tunnel', 6: 'Rolling Hills', 7: 'Toy Town', 8: 'Gnome Garden & Home' };
export const SECTION_TIPS = { 1: 'Smooth tiles – floor it!', 2: 'Low ceiling – fly low!', 3: 'Narrow low gate!', 4: 'Grass slows cars – hit the kicker ramp!', 5: 'Drain pipe – no flying over the hill!', 6: 'Bumps ahead – catch some air!', 7: 'Fast road – garage-roof shortcut & BIG jump!', 8: 'Through the doghouse and back inside' };

// Centerline control points: [x, z, halfWidth, section]. Kitchen: x 0..1400, z 0..900; wall z=900; garden/backyard z>900.
const CP = [
  [350,150,55,1],[600,145,55,1],[850,150,55,1],[1080,170,55,1],[1240,240,55,1],[1300,380,55,1],[1250,520,55,1],[1120,600,52,1],
  [1030,635,48,2],[965,640,40,2],[905,642,44,2],[845,652,44,2],[790,630,44,2],[720,652,44,2],[650,640,44,2],[600,645,40,2],[560,645,36,2],
  [490,690,48,3],[440,770,40,3],[405,850,24,3],[400,900,15,3],[400,950,24,3],
  // 4: lawn heading east
  [440,1030,50,4],[560,1075,58,4],[760,1100,60,4],[960,1115,60,4],[1120,1128,50,4],
  // 5: straight drain-pipe tunnel through the sandbox hill (x 1310..1630)
  [1230,1130,36,5],[1330,1130,30,5],[1470,1130,30,5],[1610,1130,30,5],[1700,1132,40,5],
  // 6: rolling hills heading south
  [1810,1170,55,6],[1930,1275,60,6],[2000,1450,60,6],[2020,1650,60,6],[2010,1850,60,6],[1990,2050,60,6],[1945,2240,60,6],[1850,2365,58,6],
  // 7: toy town street heading west
  [1690,2425,55,7],[1490,2440,55,7],[1290,2440,55,7],[1090,2432,55,7],[890,2420,55,7],[710,2385,55,7],[590,2290,55,7],[540,2150,55,7],
  // 8: gnome garden, doghouse (x 300, z 1520..1640), back through the sliding door, up the west wall
  [480,2000,50,8],[340,1900,48,8],[300,1760,45,8],[300,1620,45,8],[300,1480,45,8],[265,1340,55,8],[170,1220,55,8],[120,1080,55,8],
  [130,960,55,8],[130,900,55,8],[130,800,55,8],[135,600,55,8],[145,400,55,8],[170,250,55,8],[240,170,55,8],
];

const GATES = [
  { x: 350, z: 150, h: 55, label: 'Start' },
  { x: 1080, z: 170, h: 55 },
  { x: 1250, z: 520, h: 55 },
  { x: 1030, z: 635, h: 32 },
  { x: 720, z: 652, h: 32 },
  { x: 400, z: 900, h: 26, door: true },
  { x: 860, z: 1108, h: 55 },
  { x: 1322, z: 1130, h: 22, tunnel: true, label: 'Tunnel' },
  { x: 1618, z: 1130, h: 22, tunnel: true },
  { x: 2010, z: 1850, h: 55 },
  { x: 1660, z: 2427, h: 40, arch: true, label: 'Toy Town' },
  { x: 710, z: 2385, h: 50 },
  { x: 300, z: 1650, h: 36, kennel: true },
  { x: 130, z: 900, h: 55 },
  { x: 145, z: 400, h: 55 },
];
// v3.3 turbo boost pads (replaced the old charging pads): before jumps/ramps/tunnels and on the straights
const PADS = [
  { x: 600, z: 145, lat: 0, why: 'kitchen straight' }, { x: 1000, z: 158, lat: 0, why: 'kitchen straight 2' },
  { x: 845, z: 652, lat: 0, why: 'under the table' }, { x: 920, z: 1112, lat: 0, why: 'before the lawn kicker' },
  { x: 1240, z: 1130, lat: 0, why: 'before the tunnel' }, { x: 1950, z: 1330, lat: 0, why: 'before the rolling hills' },
  { x: 2015, z: 1860, lat: 0, why: 'hills straight' }, { x: 1630, z: 2432, lat: 0, why: 'before the Toy Town kicker' },
  { x: 1110, z: 2434, lat: 0, why: 'before the BIG JUMP' }, { x: 300, z: 1790, lat: 0, why: 'garden straight' },
  { x: 136, z: 620, lat: 0, why: 'west wall straight' },
];

// Height features, placed in track space (at = nearest centerline point, lat = lateral offset, len along the track).
//  ramp:   wedge rising along the travel direction, sharp lip at the end → launches (kick = extra take-off pop)
//  bump:   rolling hill with a rounded crest (fast cars catch air over the top)
//  puddle: water/mud patch (slows ground vehicles), flat
export const FEATURES = [
  { kind: 'ramp', at: [1010, 1119], len: 34, h: 12, kick: 1.9, name: 'Lawn kicker' },
  { kind: 'bump', at: [2003, 1480], len: 110, h: 14 },
  { kind: 'bump', at: [2016, 1610], len: 100, h: 17 },
  { kind: 'bump', at: [2018, 1735], len: 110, h: 13 },
  { kind: 'bump', at: [2000, 1985], len: 120, h: 19 },
  { kind: 'bump', at: [1975, 2120], len: 100, h: 12 },
  { kind: 'ramp', at: [1575, 2434], len: 36, h: 13, kick: 1.9, name: 'Toy Town kicker' },
  { kind: 'ramp', at: [1395, 2440], lat: 33, len: 50, w: 34, h: 14, kick: 1, garage: 175, name: 'Garage-roof ramp' },
  { kind: 'puddle', at: [1290, 2440], lat: -20, len: 190, w: 74, mud: true },
  { kind: 'ramp', at: [985, 2427], len: 60, h: 20, kick: 2.3, big: true, name: 'BIG JUMP' },
  { kind: 'puddle', at: [893, 2420], len: 78, w: 'full' },
];
export const TUNNEL = { x0: 1300, x1: 1640, zc: 1130, ceil: 22, r: 34, solidX0: 1310, solidX1: 1630 };
export const KENNEL = { xc: 300, z0: 1520, z1: 1640, half: 50, ceil: 40 };

const wrapA = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
export { wrapA };

function blur(arr, rad, passes = 1) {
  const N = arr.length; let a = Float32Array.from(arr);
  for (let p = 0; p < passes; p++) {
    const out = new Float32Array(N); let sum = 0;
    for (let j = -rad; j <= rad; j++) sum += a[(j + N) % N];
    for (let i = 0; i < N; i++) {
      out[i] = sum / (2 * rad + 1);
      sum += a[(i + rad + 1) % N] - a[(i - rad + N) % N];
    }
    a = out;
  }
  return a;
}

export class Track {
  constructor() {
    const pts = CP.map(c => new THREE.Vector3(c[0], 0, c[1]));
    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    this.curve = curve;
    const L = curve.getLength();
    const N = Math.round(L / 6);
    this.L = L; this.N = N; this.ds = L / N;
    const F = () => new Float32Array(N);
    Object.assign(this, { px: F(), pz: F(), tx: F(), tz: F(), nx: F(), nz: F(), s: F(), halfW: F(), curv: F(), marginF: F(), lineF: F(), ceil: F() });
    this.section = new Uint8Array(N); this.surface = new Array(N);
    const n = CP.length;
    for (let i = 0; i < N; i++) {
      const u = i / N; const p = curve.getPointAt(u); const t = curve.getTangentAt(u);
      const tl = Math.hypot(t.x, t.z) || 1;
      this.px[i] = p.x; this.pz[i] = p.z; this.tx[i] = t.x / tl; this.tz[i] = t.z / tl;
      this.nx[i] = -this.tz[i]; this.nz[i] = this.tx[i];
      this.s[i] = i * this.ds;
      const f = curve.getUtoTmapping(u) * n; const k = Math.floor(f) % n; const fr = f - Math.floor(f);
      const a = CP[k], b = CP[(k + 1) % n]; const sm = fr * fr * (3 - 2 * fr);
      this.halfW[i] = a[2] + (b[2] - a[2]) * sm;
      this.section[i] = a[3];
      
    }
    // curvature (positive = right turn)
    const ang = i => Math.atan2(this.tz[(i + N) % N], this.tx[(i + N) % N]);
    const raw = new Float32Array(N);
    for (let i = 0; i < N; i++) raw[i] = wrapA(ang(i + 4) - ang(i - 4)) / (8 * this.ds);
    this.curv = blur(raw, 6, 2);
    // gates & pads
    this.gates = GATES.map((g, gi) => { const i = this.nearestIdx(g.x, g.z); return { ...g, i, s: this.s[i], hw: this.halfW[i], index: gi }; });
    this.pads = PADS.map(pd => { const i = this.nearestIdx(pd.x, pd.z); return { i, s: this.s[i], x: this.px[i] + this.nx[i] * pd.lat, z: this.pz[i] + this.nz[i] * pd.lat, dir: Math.atan2(this.tz[i], this.tx[i]), why: pd.why, y: 0 }; });
    this.buildFeatures();
    for (const p of this.pads) p.y = this.groundAt(p.x, p.z);
    for (let i = 0; i < N; i++) this.surface[i] = this.surfaceAt(this.px[i], this.pz[i], i);
    // lateral margin a flying drone gets (0 near gates & in tight sections: table, pet door, tunnel, toy-town alleys)
    const SM = CONFIG.sectionFlyMargin || {};
    for (let i = 0; i < N; i++) {
      let dg = 1e9; for (const g of this.gates) dg = Math.min(dg, Math.abs(this.wrapS(this.s[i] - g.s)));
      let m = Math.min(1, Math.max(0, (dg - 50) / 80));
      const sec = this.section[i]; m *= SM[sec] ?? 1;
      this.marginF[i] = m;
      this.lineF[i] = sec === 2 ? 0.2 : sec === 3 || sec === 5 ? 0.3 : 1;
    }
    this.marginF = blur(this.marginF, 8, 1);
    for (let i = 0; i < N; i++) { const sec = this.section[i]; if ((SM[sec] ?? 1) === 0) this.marginF[i] = 0; }
    this.lineF = blur(this.lineF, 10, 2);
    this.solids = [];
  }
  wrapS(d) { const L = this.L; d %= L; if (d > L / 2) d -= L; if (d < -L / 2) d += L; return d; }
  nearestIdx(x, z) {
    let best = 0, bd = 1e18;
    for (let i = 0; i < this.N; i++) { const dx = x - this.px[i], dz = z - this.pz[i]; const d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } }
    return best;
  }
  // Project a point onto the centerline. hint = previous sample index (local search) or null for global.
  project(x, z, hint, out) {
    const N = this.N; let lo, hi;
    if (hint == null) { const i = this.nearestIdx(x, z); lo = i - 3; hi = i + 3; } else { lo = hint - 26; hi = hint + 26; }
    let bd = 1e18, bi = 0, bt = 0;
    for (let k = lo; k <= hi; k++) {
      const i = (k + N) % N, j = (i + 1) % N;
      const ax = this.px[i], az = this.pz[i], ex = this.px[j] - ax, ez = this.pz[j] - az;
      let t = ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez); t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + ex * t - x, qz = az + ez * t - z; const d = qx * qx + qz * qz;
      if (d < bd) { bd = d; bi = i; bt = t; }
    }
    out = out || {};
    out.idx = bi; out.s = (this.s[bi] + bt * this.ds) % this.L;
    out.lat = (x - this.px[bi]) * this.nx[bi] + (z - this.pz[bi]) * this.nz[bi];
    return out;
  }
  // ---------- terrain (ramps, hills, puddles) ----------
  buildFeatures() {
    this.hfeat = []; this.puddles = []; this.garage = null;
    for (const F of FEATURES) {
      const i = this.nearestIdx(F.at[0], F.at[1]); const lat = F.lat || 0;
      const w = F.w === 'full' || F.w == null ? 2 * this.halfW[i] + 14 : F.w;
      const f = { ...F, i, s: this.s[i], x: this.px[i] + this.nx[i] * lat, z: this.pz[i] + this.nz[i] * lat, c: this.tx[i], sn: this.tz[i], w, ang: Math.atan2(this.tz[i], this.tx[i]) };
      const ext = F.kind === 'bump' ? w / 2 + 40 : w / 2; f.R2 = (F.len / 2 + 4) ** 2 + ext * ext;
      if (F.kind === 'puddle') this.puddles.push(f); else this.hfeat.push(f);
      if (F.garage) { // flat toy-garage roof (a solid) continuing from the top of the ramp
        const u0 = F.len / 2, u1 = F.len / 2 + F.garage, pts = [];
        for (const u of [u0, u1]) for (const v of [-w / 2, w / 2]) pts.push([f.x + f.c * u - f.sn * v, f.z + f.sn * u + f.c * v]);
        this.garage = { x0: Math.min(...pts.map(p => p[0])), x1: Math.max(...pts.map(p => p[0])), z0: Math.min(...pts.map(p => p[1])), z1: Math.max(...pts.map(p => p[1])), y0: 0, y1: F.h, sStart: f.s - F.len / 2, sEnd: f.s + u1, lat };
      }
    }
  }
  // terrain height (cm) at a world point
  groundAt(x, z) {
    let h = 0;
    for (const f of this.hfeat) {
      const dx = x - f.x, dz = z - f.z; if (dx * dx + dz * dz > f.R2) continue;
      const u = dx * f.c + dz * f.sn, v = -dx * f.sn + dz * f.c, L2 = f.len / 2;
      let hh = 0;
      if (f.kind === 'ramp') { if (Math.abs(v) < f.w / 2 && u > -L2 && u < L2) hh = f.h * (u + L2) / f.len; }
      else { // bump: concave flanks + small rounded crest (sharp enough to launch fast cars)
        const a = Math.sqrt(u * u + 9) - 3; if (a < L2) { const t = 1 - a / L2; const av = Math.abs(v) - f.w / 2; const e = av <= 0 ? 1 : av >= 40 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * av / 40); hh = f.h * Math.pow(t, 1.6) * e; }
      }
      if (hh > h) h = hh;
    }
    return h;
  }
  featureAt(x, z) {
    for (const f of this.hfeat) { const dx = x - f.x, dz = z - f.z; if (dx * dx + dz * dz < f.R2) return f; }
    return null;
  }
  inPuddle(x, z) {
    for (const f of this.puddles) { const dx = x - f.x, dz = z - f.z; const u = (dx * f.c + dz * f.sn) / (f.len / 2), v = (-dx * f.sn + dz * f.c) / (f.w / 2); if (u * u * u * u + v * v * v * v < 1) return f; }
    return null;
  }
  surfaceAt(x, z, idx) {
    if (this.inPuddle(x, z)) return 'water';
    if (z < 903) return 'tile';
    const sec = this.section[idx ?? this.nearestIdx(x, z)];
    if (sec === 7 || (sec === 5 && x > TUNNEL.x0 && x < TUNNEL.x1)) return 'road';
    return 'grass';
  }
  // lowest solid bottom above y=8 covering the point
  ceilingAt(x, z) {
    let c = CONFIG.maxAltitude;
    for (const s of this.solids) if (s.y0 > 8 && x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1) c = Math.min(c, s.y0);
    return c;
  }
  insideSolid(x, y, z, pad = 0) {
    for (const s of this.solids) if (x > s.x0 - pad && x < s.x1 + pad && z > s.z0 - pad && z < s.z1 + pad && y > s.y0 - pad && y < s.y1 + pad) return true;
    return false;
  }
  // Called after world solids are registered: AI racing lines, speed profiles, safe altitudes.
  finalize() {
    const N = this.N, ds = this.ds, A = CONFIG.ai, V = CONFIG.vehicles;
    for (let i = 0; i < N; i++) this.ceil[i] = this.ceilingAt(this.px[i], this.pz[i]);
    for (const g of this.gates) for (let k = -2; k <= 2; k++) { const i = (g.i + k + N) % N; this.ceil[i] = Math.min(this.ceil[i], g.h); }
    // v3.4 floating turbo rings for flyers: one above each pad, at flyer cruise height (kept under low ceilings / gates)
    const TP = CONFIG.turboPads;
    this.rings = this.pads.map(p => ({ i: p.i, s: p.s, x: p.x, z: p.z, dir: p.dir, why: p.why, gy: p.y,
      ry: Math.max(p.y + TP.ringR * 0.8, Math.min(p.y + TP.ringHeight, this.ceil[p.i] - TP.ringR - 3)) }));
    // safe drone altitude: look ahead ~3m
    const eff = new Float32Array(N);
    for (let i = 0; i < N; i++) eff[i] = this.ceil[i] - V.drone.height - 8;
    this.droneSafeAlt = new Float32Array(N);
    for (let i = 0; i < N; i++) { let m = 1e9; for (let k = -4; k <= 50; k++) m = Math.min(m, eff[(i + k + N) % N]); this.droneSafeAlt[i] = Math.max(4, m); }
    // highest terrain across the track at each sample, and looking ~2.5 m ahead (flyer cruise height follows the hills)
    this.gnd = new Float32Array(N); this.gndAhead = new Float32Array(N);
    for (let i = 0; i < N; i++) { let m = 0; for (let v = -1; v <= 1.001; v += 0.25) { const l = v * this.halfW[i]; m = Math.max(m, this.groundAt(this.px[i] + this.nx[i] * l, this.pz[i] + this.nz[i] * l)); } this.gnd[i] = m; }
    for (let i = 0; i < N; i++) { let m = 0; for (let k = -3; k <= 42; k++) m = Math.max(m, this.gnd[(i + k + N) % N]); this.gndAhead[i] = m; }
    // racing lines: bias toward the inside of corners
    const mk = (type) => {
      const hw = V[type].halfWidth; const arr = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        let maxOff = this.halfW[i] - hw - 4;
        if (type === 'drone') maxOff += CONFIG.droneShortcutMargin * this.marginF[i] * 0.85;
        const k = Math.max(-1, Math.min(1, this.curv[i] * 150));
        arr[i] = k * maxOff * this.lineF[i];
      }
      return blur(arr, 20, 2);
    };
    this.carLine = mk('car'); this.droneLine = mk('drone');
    // narrow openings (pet door, drain pipe, doghouse): everyone lines up dead centre
    for (const g of this.gates) if (g.door || g.tunnel || g.kennel) for (let k = -32; k <= 32; k++) {
      const i = (g.i + k + N) % N, w = Math.abs(k) <= 12 ? 1 : 0.5 + 0.5 * Math.cos(Math.PI * (Math.abs(k) - 12) / 20);
      this.carLine[i] *= 1 - w; this.droneLine[i] *= 1 - w;
    }
    // AI ground racers take the garage-roof shortcut (keeps them out of the mud)
    if (this.garage) {
      const G = this.garage, s0 = G.sStart - 140, s1 = G.sEnd - 10;
      for (let i = 0; i < N; i++) { const d0 = this.wrapS(this.s[i] - s0), d1 = this.wrapS(this.s[i] - s1); if (d0 < 0 || d1 > 0) continue; const w = Math.min(1, d0 / 110); this.carLine[i] = this.carLine[i] * (1 - w) + G.lat * w; }
    }
    // car obstacle avoidance on its line
    const hwc = V.car.halfWidth;
    for (const o of this.solids) {
      if (!o.minor) continue;
      const cx = (o.x0 + o.x1) / 2, cz = (o.z0 + o.z1) / 2; const pr = this.project(cx, cz, null);
      const ext = Math.max(o.x1 - o.x0, o.z1 - o.z0) / 2 + 2;
      if (Math.abs(pr.lat) > this.halfW[pr.idx] + ext) continue;
      const span = Math.round((ext + 90) / ds);
      for (let k = -span; k <= span; k++) {
        const i = (pr.idx + k + N) % N; const w = 0.5 + 0.5 * Math.cos(Math.PI * k / span);
        const lim = this.halfW[i] - hwc - 3;
        const right = pr.lat + ext + hwc + 6, left = pr.lat - ext - hwc - 6;
        const target = (lim - right) >= (left + lim) ? Math.min(right, lim) : Math.max(left, -lim);
        if (Math.abs(this.carLine[i] - pr.lat) < ext + hwc + 6 || w > 0.6) this.carLine[i] = this.carLine[i] * (1 - w) + target * w;
      }
    }
    // speed profiles
    const prof = (type) => {
      const VD = type === 'heli' ? { ...V.drone, ...CONFIG.models.heli } : V.drone;
      const top = type === 'car' ? 1e4 : VD.thrust / VD.drag; // cars: curvature-limited only, each model caps its own top speed
      const v = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const sf = type === 'car' ? 1 : CONFIG.surfaces[this.surface[i]].drone.speed;
        let m = Math.min(top * sf * 0.98, Math.sqrt(A.latAcc[type] / Math.max(Math.abs(this.curv[i]), 1e-5)));
        if (type === 'car') m = Math.min(m, V.car.steerRate * 0.8 / Math.max(Math.abs(this.curv[i]), 1e-5));
        const cap = A.sectionCap[type][this.section[i]]; if (cap) m = Math.min(m, cap);
        v[i] = m;
      }
      const b = A.brake[type];
      for (let pass = 0; pass < 2; pass++) for (let i = N - 1; i >= 0; i--) { const j = (i + 1) % N; v[i] = Math.min(v[i], Math.sqrt(v[j] * v[j] + 2 * b * ds)); }
      return v;
    };
    this.minorSolids = this.solids.filter(o => o.minor);
    this.carSpeed = prof('car'); this.droneSpeed = prof('drone'); this.heliSpeed = prof('heli');
  }
}
