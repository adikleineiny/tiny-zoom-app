// Mystery boxes (RC parts crates) + secret weapons (pure game logic, no rendering — runs in the headless sim too).
import { CONFIG } from './config.js';

export const WEAPONS = {
  ball:   { icon: '🔴', name: 'Bouncy Ball',   tip: 'Bounces off walls, bowls racers over' },
  shock:  { icon: '💥', name: 'Shockwave',     tip: 'Pushes everyone nearby away' },
  rocket: { icon: '🚀', name: 'Homing Rocket', tip: 'Chases the racer ahead and flips it' },
  oil:    { icon: '🛢️', name: 'Oil Slick',     tip: 'Dropped behind – racers spin out' },
  zap:    { icon: '⚡', name: 'Electrify',     tip: 'Chain lightning – kills their power' },
  glove:  { icon: '🥊', name: 'Spring Glove',  tip: 'Boing! Punches the racer in front' },
  bomb:   { icon: '💣', name: 'Sticky Bomb',   tip: 'Sticks on, beeps – bump someone to pass it!' },
  turbo:  { icon: '💨', name: 'Nitro Turbo',   tip: 'Flame boost – ram racers aside' },
  fire:   { icon: '🔥', name: 'Fire Trail',    tip: 'Flamethrower + burning trail behind you' },
};
export const WEAPON_KEYS = Object.keys(WEAPONS);
let uid = 1;
const rand = (a, b) => a + Math.random() * (b - a);

export class Weapons {
  constructor(sim, track) { this.sim = sim; this.T = track; sim.weapons = this; this.boxes = []; this.proj = []; this.haz = []; this.layout(); }
  get C() { return CONFIG.weapons; }
  layout() {
    const T = this.T, C = this.C; this.boxes = [];
    for (const f of C.boxRows) {
      let i = Math.round(f * T.N) % T.N;
      for (let k = 0; k < 60; k++) {
        const bad = T.section[i] === 3 || T.gates.some(g => Math.abs(T.wrapS(T.s[i] - g.s)) < 30) || T.pads.some(p => Math.abs(T.wrapS(T.s[i] - p.s)) < 35) || T.gnd[i] > 0.5 || T.featureAt(T.px[i], T.pz[i]) || T.inPuddle(T.px[i], T.pz[i]);
        if (!bad) break; i = (i + 1) % T.N;
      }
      for (const l of C.boxLat) {
        const lat = l * (T.halfW[i] - 10), x = T.px[i] + T.nx[i] * lat, z = T.pz[i] + T.nz[i] * lat;
        if (T.insideSolid(x, 4, z, 7)) continue;
        this.boxes.push({ id: uid++, x, z, y: 6 + T.groundAt(x, z), active: true, t: 0, s: T.s[i] });
      }
    }
  }
  reset() { this.proj = []; this.haz = []; for (const b of this.boxes) { b.active = true; b.t = 0; } }
  pick() {
    const W = this.C.weights; let tot = 0; for (const k of WEAPON_KEYS) tot += W[k] || 0;
    let x = Math.random() * tot; for (const k of WEAPON_KEYS) { x -= W[k] || 0; if (x <= 0) return k; } return 'ball';
  }
  give(r, w) { r.weapon = w; r.rollT = 0; r.holdT = 0; r.aiDelay = rand(...this.C.aiUseDelay); }
  step(dt) {
    const C = this.C, S = this.sim, R = S.racers;
    if (!C.enabled) return;
    for (const b of this.boxes) if (!b.active && (b.t -= dt) <= 0) { b.active = true; S.emit({ type: 'boxSpawn', b }); }
    for (const r of R) {
      if (r.rollT > 0) { r.rollT -= dt; if (r.rollT <= 0) { this.give(r, r.rollPick || this.pick()); r.rollPick = null; S.emit({ type: 'gotWeapon', r, w: r.weapon }); } }
      else if (r.weapon) r.holdT += dt;
      if (S.running && !r.weapon && r.rollT <= 0) {
        const maxY = r.type === 'drone' ? C.droneCollectAlt : 22, rad = C.boxRadius + r.V.radius * 0.4;
        for (const b of this.boxes) if (b.active && r.y - b.y + 6 < maxY && Math.abs(b.x - r.x) < rad && Math.abs(b.z - r.z) < rad && Math.hypot(b.x - r.x, b.z - r.z) < rad) {
          b.active = false; b.t = C.boxRespawn; r.rollT = C.rollTime; r.rollPick = this.pick(); S.emit({ type: 'pickup', r, b }); break;
        }
      }
      if (r.input.fire) { r.input.fire = false; if (S.running) this.use(r); }
      if (r.ai && (!r.isPlayer || r.autopilot) && r.weapon && S.running) this.aiThink(r, dt);
      if (r.fireT > 0) this.fireTick(r, dt);
      if (r.gloveT > 0) r.gloveT -= dt;
      if (r.bomb) {
        r.bomb.t -= dt; r.bomb.passCD -= dt;
        if (r.bomb.t <= 0) { const b = r.bomb; r.bomb = null; r.immuneT = 0; this.explode(r.x, r.y, r.z, b.owner, r); }
      }
    }
    // projectiles
    for (let k = this.proj.length - 1; k >= 0; k--) { const p = this.proj[k]; p.age += dt; if (p.age > p.life || this[p.kind + 'Tick'](p, dt)) { this.proj.splice(k, 1); if (p.age > p.life && p.kind === 'rocket') S.emit({ type: 'boom', x: p.x, y: p.y, z: p.z, size: 0.6 }); } }
    // hazards on the floor
    for (let k = this.haz.length - 1; k >= 0; k--) { const h = this.haz[k]; h.age += dt; if (h.age > h.life || this.hazTick(h, dt)) this.haz.splice(k, 1); }
  }
  others(r) { return this.sim.racers.filter(o => o !== r); }
  front(r, o) { const dx = o.x - r.x, dz = o.z - r.z, d = Math.hypot(dx, dz) || 1e-3; return { d, cos: (dx * Math.cos(r.heading) + dz * Math.sin(r.heading)) / d, dx, dz }; }
  use(r) {
    const w = r.weapon, C = this.C, S = this.sim; if (!w || r.rollT > 0) return false;
    r.weapon = null; r.shots++;
    const c = Math.cos(r.heading), s = Math.sin(r.heading), fwd = Math.max(0, r.fwd);
    const spawn = (kind, o) => { const p = { id: uid++, kind, owner: r, age: 0, x: r.x + c * 10, y: r.y + 4, z: r.z + s * 10, idx: r.idx, ...o }; this.proj.push(p); return p; };
    switch (w) {
      case 'ball': spawn('ball', { vx: c * (C.ball.speed + fwd), vy: 30, vz: s * (C.ball.speed + fwd), life: C.ball.life }); break;
      case 'rocket': {
        let tgt = null, best = 1e9;
        for (const o of this.others(r)) { const dp = o.progress - r.progress; if (dp > 2 && dp < C.rocket.range && dp < best) { best = dp; tgt = o; } }
        if (!tgt) for (const o of this.others(r)) { const f = this.front(r, o); if (f.cos > 0.3 && f.d < C.rocket.range && f.d < best) { best = f.d; tgt = o; } }
        spawn('rocket', { vx: c * C.rocket.speed, vy: 0, vz: s * C.rocket.speed, life: C.rocket.life, target: tgt, y: r.y + 6 }); break;
      }
      case 'bomb': spawn('bomb', { vx: c * (C.bomb.throwSpeed + fwd), vy: C.bomb.throwUp, vz: s * (C.bomb.throwSpeed + fwd), life: 5, y: r.y + 8 }); break;
      case 'shock': {
        const Rr = C.shock.radius;
        for (const o of this.others(r)) {
          const dx = o.x - r.x, dz = o.z - r.z, d = Math.hypot(dx, dz); if (d > Rr || Math.abs(o.y - r.y) > 35) continue;
          const nx = d > 0.1 ? dx / d : c, nz = d > 0.1 ? dz / d : s, k = 0.5 + 0.5 * (1 - d / Rr);
          S.hit(o, { kx: nx * C.shock.knock * k, kz: nz * C.shock.knock * k, up: C.shock.up * k, tumble: d < Rr * 0.5 ? C.shock.tumble : 0, spin: d >= Rr * 0.5 ? 0.5 : 0, slow: C.shock.slow, by: r, kind: 'shock' });
        }
        S.emit({ type: 'shock', x: r.x, y: r.y, z: r.z, R: Rr, r }); break;
      }
      case 'oil': this.haz.push({ id: uid++, kind: 'oil', x: r.x - c * 14, z: r.z - s * 14, y: this.T.groundAt(r.x - c * 14, r.z - s * 14), life: C.oil.life, age: 0, owner: r, R: C.oil.radius }); S.emit({ type: 'drop', r }); break;
      case 'zap': {
        const pts = [r], hitSet = new Set([r]); let cur = r;
        for (let k = 0; k < C.zap.chainMax; k++) {
          let nb = null, bd = k === 0 ? C.zap.range : C.zap.chainRange;
          for (const o of this.sim.racers) { if (hitSet.has(o)) continue; const d = Math.hypot(o.x - cur.x, o.z - cur.z, o.y - cur.y); if (d < bd) { bd = d; nb = o; } }
          if (!nb) break; hitSet.add(nb); pts.push(nb); cur = nb;
          S.hit(nb, { stun: C.zap.stun, slow: C.zap.slow, by: r, kind: 'zap' });
        }
        S.emit({ type: 'zap', chain: pts.map(o => ({ x: o.x, y: o.y + 4, z: o.z, r: o })), r }); break;
      }
      case 'glove': {
        r.gloveT = C.glove.time;
        for (const o of this.others(r)) {
          const f = this.front(r, o); if (f.d > C.glove.reach + o.V.radius || f.cos < C.glove.cone || Math.abs(o.y - r.y) > 14) continue;
          const side = (f.dx * -s + f.dz * c) >= 0 ? 1 : -1;
          S.hit(o, { kx: c * C.glove.knock - s * side * C.glove.knock * 0.4, kz: s * C.glove.knock + c * side * C.glove.knock * 0.4, up: C.glove.up, spin: C.glove.spin, slow: C.glove.slow, by: r, kind: 'glove' });
        }
        S.emit({ type: 'glove', r }); break;
      }
      case 'turbo': r.turboT = C.turbo.time; S.emit({ type: 'turbo', r }); break;
      case 'fire': r.fireT = C.fire.time; r._patchT = 0; S.emit({ type: 'fire', r }); break;
    }
    S.emit({ type: 'use', r, w });
    return true;
  }
  fireTick(r, dt) {
    const F = this.C.fire, S = this.sim; r.fireT -= dt; r._patchT -= dt;
    const c = Math.cos(r.heading), s = Math.sin(r.heading);
    if (r._patchT <= 0) { r._patchT = F.patchEvery; this.haz.push({ id: uid++, kind: 'fire', x: r.x - c * 9, z: r.z - s * 9, y: r.type === 'drone' ? Math.max(this.T.groundAt(r.x - c * 9, r.z - s * 9), r.y - 4) : this.T.groundAt(r.x - c * 9, r.z - s * 9), life: F.patchLife, age: 0, owner: r, R: F.patchRadius }); }
    for (const o of this.others(r)) {
      const f = this.front(r, o); if (f.d > F.coneReach + o.V.radius || f.cos < 0.82 || Math.abs(o.y - r.y) > 16) continue;
      S.hit(o, { kx: c * 120, kz: s * 120, up: o.type === 'drone' ? F.droneHeat : 40, spin: F.spin, slow: F.slow, by: r, kind: 'fire' });
    }
  }
  hazTick(h, dt) {
    const C = this.C, S = this.sim;
    for (const o of S.racers) {
      const d = Math.hypot(o.x - h.x, o.z - h.z), oy = o.y - (o.groundY || 0);
      if (h.kind === 'oil') { if (d < h.R + 2 && oy < C.oil.maxAlt && o.speed > 15) S.hit(o, { spin: C.oil.spin, slow: C.oil.slow, by: h.owner, kind: 'oil' }); }
      else if (h.kind === 'fire') {
        if (o === h.owner || d > h.R + o.V.radius * 0.5) continue;
        if (o.type === 'drone') { if (oy < C.fire.droneMaxAlt) S.hit(o, { up: C.fire.droneHeat / 0.6, spin: 0.35, slow: 0.85, by: h.owner, kind: 'fire' }); }
        else if (oy < 8) S.hit(o, { spin: C.fire.spin, slow: C.fire.slow, up: 50, by: h.owner, kind: 'fire' });
      } else if (h.kind === 'bomb') {
        if (h.age > 0.3 && d < 9 + o.V.radius * 0.5 && oy < 12 && !o.bomb) { o.bomb = { t: C.bomb.fuse * 0.8, passCD: C.bomb.passCooldown, owner: h.owner }; S.emit({ type: 'bombStick', r: o }); return true; }
      }
    }
    if (h.kind === 'bomb' && h.age >= h.life - 0.01) { this.explode(h.x, h.y + 2, h.z, h.owner, null); return true; }
    return false;
  }
  explode(x, y, z, owner, holder) {
    const B = this.C.bomb, S = this.sim;
    for (const o of S.racers) {
      const dx = o.x - x, dz = o.z - z, d = Math.hypot(dx, dz, o.y - y);
      if (o !== holder && d > B.radius) continue;
      const k = o === holder ? 1 : 0.4 + 0.6 * (1 - d / B.radius), a = Math.random() * 6.28;
      const nx = d > 1 ? dx / Math.max(d, 1) : Math.cos(a) * 0.4, nz = d > 1 ? dz / Math.max(d, 1) : Math.sin(a) * 0.4;
      S.hit(o, { kx: nx * B.knock * k, kz: nz * B.knock * k, up: B.up * k, tumble: B.tumble, slow: B.slow, by: owner, kind: 'bomb' });
    }
    S.emit({ type: 'boom', x, y, z, size: 1.4 });
  }
  hitRacer(p, rad) {
    for (const o of this.sim.racers) {
      if (o === p.owner && p.age < 0.5) continue;
      if (Math.abs(o.x - p.x) < rad + o.V.radius && Math.abs(o.z - p.z) < rad + o.V.radius && Math.hypot(o.x - p.x, o.z - p.z) < rad + o.V.radius && p.y > o.y - 3 && p.y < o.y + o.V.height + 6) return o;
    }
    return null;
  }
  move(p, dt, grav) {
    const T = this.T, ox = p.x, oz = p.z;
    p.vy -= grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    let bounced = false;
    if (T.insideSolid(p.x, p.y, p.z, 1)) {
      if (T.insideSolid(p.x, p.y, oz, 1)) { p.vx = -p.vx; p.x = ox; bounced = true; }
      if (T.insideSolid(ox, p.y, p.z, 1)) { p.vz = -p.vz; p.z = oz; bounced = true; }
      if (!bounced) { p.vy = -p.vy * 0.5; p.y = Math.max(p.y, 1); bounced = true; }
    }
    const pr = T.project(p.x, p.z, p.idx); p.idx = pr.idx; const hw = T.halfW[pr.idx] - 2;
    if (Math.abs(pr.lat) > hw && p.y < CONFIG.barrierHeight + 3) {
      const sg = Math.sign(pr.lat), nx = T.nx[pr.idx] * sg, nz = T.nz[pr.idx] * sg, vn = p.vx * nx + p.vz * nz;
      p.x -= nx * (Math.abs(pr.lat) - hw); p.z -= nz * (Math.abs(pr.lat) - hw);
      if (vn > 0) { p.vx -= 2 * vn * nx; p.vz -= 2 * vn * nz; bounced = true; }
    }
    return bounced;
  }
  ballTick(p, dt) {
    const B = this.C.ball, S = this.sim;
    if (this.move(p, dt, CONFIG.gravity * 0.8)) S.emit({ type: 'ballBounce', p });
    const gb = this.T.groundAt(p.x, p.z); if (p.y < gb + B.radius) { p.y = gb + B.radius; if (p.vy < 0) p.vy = Math.max(-p.vy * B.bounce, 90); }
    const o = this.hitRacer(p, B.radius);
    if (o) {
      const v = Math.hypot(p.vx, p.vz) || 1;
      S.hit(o, { kx: p.vx / v * B.knock, kz: p.vz / v * B.knock, up: B.up, spin: B.spin, slow: B.slow, by: p.owner, kind: 'ball' });
      S.emit({ type: 'boom', x: p.x, y: p.y, z: p.z, size: 0.5, color: 0xff4fa3 }); return true;
    }
    return false;
  }
  rocketTick(p, dt) {
    const Rk = this.C.rocket, S = this.sim, t = p.target;
    if (t) {
      const want = Math.atan2(t.z - p.z, t.x - p.x), cur = Math.atan2(p.vz, p.vx);
      let da = want - cur; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      const na = cur + Math.max(-Rk.turn * dt, Math.min(Rk.turn * dt, da));
      p.vx = Math.cos(na) * Rk.speed; p.vz = Math.sin(na) * Rk.speed; p.vy = (t.y + 4 - p.y) * 4;
    } else p.vy = (6 + this.T.groundAt(p.x, p.z) - p.y) * 3;
    const ox = p.x, oz = p.z; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; { const gr = this.T.groundAt(p.x, p.z) + 2; if (p.y < gr) p.y = gr; }
    if (this.T.insideSolid(p.x, p.y, p.z, 0)) { p.x = ox; p.z = oz; S.emit({ type: 'boom', x: p.x, y: p.y, z: p.z, size: 0.7 }); return true; }
    const o = this.hitRacer(p, 3);
    if (o) {
      const v = Math.hypot(p.vx, p.vz) || 1;
      S.hit(o, { kx: p.vx / v * Rk.knock, kz: p.vz / v * Rk.knock, up: Rk.up, tumble: Rk.tumble, slow: Rk.slow, by: p.owner, kind: 'rocket' });
      S.emit({ type: 'boom', x: p.x, y: p.y, z: p.z, size: 1 }); return true;
    }
    return false;
  }
  bombTick(p, dt) {
    const B = this.C.bomb, S = this.sim;
    this.move(p, dt, CONFIG.gravity);
    const o = this.hitRacer(p, 3);
    if (o && !o.bomb) { o.bomb = { t: B.fuse, passCD: B.passCooldown, owner: p.owner }; S.emit({ type: 'bombStick', r: o }); return true; }
    const gm = this.T.groundAt(p.x, p.z); if (p.y <= gm + 2 && p.vy < 0) { this.haz.push({ id: uid++, kind: 'bomb', x: p.x, z: p.z, y: gm, life: B.mineLife, age: 0, owner: p.owner, R: 4 }); return true; }
    return false;
  }
  aiThink(r, dt) {
    const C = this.C, w = r.weapon; r.aiDelay -= dt; if (r.aiDelay > 0) return;
    let go = r.holdT > C.aiMaxHold;
    const os = this.others(r);
    const inFront = (maxD, minCos) => os.some(o => { const f = this.front(r, o); return f.d < maxD && f.cos > minCos && Math.abs(o.y - r.y) < 20; });
    const behind = maxD => os.some(o => { const dp = r.progress - o.progress; return dp > 0 && dp < maxD; });
    const near = maxD => os.some(o => Math.hypot(o.x - r.x, o.z - r.z, o.y - r.y) < maxD);
    switch (w) {
      case 'ball': go ||= inFront(220, 0.93); break;
      case 'rocket': go ||= os.some(o => { const dp = o.progress - r.progress; return dp > 10 && dp < C.rocket.range * 0.7; }); break;
      case 'bomb': go ||= inFront(160, 0.9); break;
      case 'shock': go ||= near(C.shock.radius * 0.75); break;
      case 'zap': go ||= near(C.zap.range * 0.85); break;
      case 'glove': go ||= inFront(C.glove.reach, 0.85); break;
      case 'oil': case 'fire': go ||= behind(90) || inFront(C.fire.coneReach, 0.9); break;
      case 'turbo': go ||= Math.abs(this.T.curv[(r.idx + 8) % this.T.N]) < 0.0025 && (r.type === 'drone' || r.grounded); break;
    }
    if (go) this.use(r);
  }
}
