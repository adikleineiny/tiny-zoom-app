// Visuals for RC parts crates (mystery boxes), projectiles, hazards and hit effects. Reads sim/weapons state + sim.events each frame.
import * as THREE from './three.module.min.js';
import { CONFIG } from './config.js';

function tex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
const SOFT = tex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
const STAR = tex(64, 64, (g) => { g.fillStyle = '#fff'; g.beginPath(); for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5 - Math.PI / 2, r = k % 2 ? 12 : 30; g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); } g.fill(); });
// v3.3: RC parts crate (orange/black, hazard edge stripes) with an original bolt-in-a-gear emblem
export function drawBoltGear(g, cx, cy, R, col = '#111', bolt = '#ffd23f') {
  const n = 8; g.fillStyle = col; g.beginPath();
  for (let k = 0; k < n * 4; k++) { const a = (k / (n * 4)) * Math.PI * 2, r = (k % 4 < 2) ? R : R * 0.8; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
  g.closePath(); g.fill(); g.fillStyle = '#ff7b00'; g.beginPath(); g.arc(cx, cy, R * 0.6, 0, 7); g.fill();
  const u = R / 50; g.fillStyle = bolt; g.strokeStyle = col; g.lineWidth = 3 * u; g.beginPath();
  g.moveTo(cx + 8 * u, cy - 26 * u); g.lineTo(cx - 14 * u, cy + 4 * u); g.lineTo(cx - 1 * u, cy + 4 * u); g.lineTo(cx - 8 * u, cy + 26 * u); g.lineTo(cx + 14 * u, cy - 4 * u); g.lineTo(cx + 1 * u, cy - 4 * u); g.closePath(); g.fill(); g.stroke();
}
const QBOX = tex(128, 128, (g) => {
  g.fillStyle = '#ff7b00'; g.fillRect(0, 0, 128, 128);
  g.save(); g.beginPath(); g.rect(0, 0, 128, 128); g.rect(14, 14, 100, 100); g.clip('evenodd'); g.fillStyle = '#151515'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#ffb703'; for (let k = -128; k < 256; k += 20) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 10, 0); g.lineTo(k + 10 - 128, 128); g.lineTo(k - 128, 128); g.fill(); } g.restore();
  g.fillStyle = '#e06a00'; g.fillRect(14, 62, 100, 4); // plank seam
  for (const [x, y] of [[20, 20], [108, 20], [20, 108], [108, 108]]) { g.fillStyle = '#888'; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); }
  drawBoltGear(g, 64, 64, 36);
});
const OIL = tex(128, 128, (g) => {
  g.fillStyle = 'rgba(10,10,14,0.92)'; g.beginPath(); for (let k = 0; k < 14; k++) { const a = k / 14 * 6.283, r = 48 + Math.sin(k * 2.7) * 10; g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); } g.fill();
  const gr = g.createRadialGradient(50, 50, 4, 64, 64, 50); gr.addColorStop(0, 'rgba(120,200,255,.45)'); gr.addColorStop(0.5, 'rgba(200,80,255,.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
});
const ADD = THREE.AdditiveBlending, NORM = THREE.NormalBlending;
const rnd = (a, b) => a + Math.random() * (b - a);

export class FX {
  constructor(scene, sim) {
    this.scene = scene; this.sim = sim; this.pool = []; this.live = []; this.objs = new Map(); this.rings = []; this.zaps = []; this.boxMeshes = new Map(); this.att = new Map(); this.t = 0;
    for (let k = 0; k < 320; k++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: SOFT, transparent: true, depthWrite: false })); sp.visible = false; scene.add(sp); this.pool.push(sp); }
    this.boxGeo = new THREE.BoxGeometry(7, 7, 7); this.boxMat = new THREE.MeshLambertMaterial({ map: QBOX, emissive: 0x331400 });
    this.ballMat = new THREE.MeshPhongMaterial({ color: 0xff4fa3, emissive: 0x551133, shininess: 120 });
    this.bombMat = new THREE.MeshPhongMaterial({ color: 0x15151a, shininess: 140, specular: 0x888888 });
  }
  clearAtt() { if (this.sk) { this.sk.g.attributes.position.array.fill(0); this.sk.g.attributes.position.needsUpdate = true; this.sk.last.clear(); } for (const a of this.att.values()) if (a.bomb) this.scene.remove(a.bomb); this.att.clear(); }
  // ---------- particles ----------
  spawn(x, y, z, o = {}) {
    const sp = this.pool.pop() || this.live.shift()?.sp; if (!sp) return;
    const m = sp.material; m.map = o.star ? STAR : SOFT; m.blending = o.add === false ? NORM : ADD; m.color.setHex(o.color ?? 0xffaa33); m.rotation = Math.random() * 6;
    sp.position.set(x, y, z); sp.visible = true;
    this.live.push({ sp, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, life: o.life || 0.6, age: 0, size: o.size || 4, grow: o.grow ?? 1, grav: o.grav || 0, drag: o.drag ?? 1.5, alpha: o.alpha ?? 1 });
  }
  burst(x, y, z, n, sp, o) { for (let k = 0; k < n; k++) { const a = Math.random() * 6.283, e = rnd(-0.2, 1); const v = sp * rnd(0.4, 1); this.spawn(x, y, z, { ...o, vx: Math.cos(a) * v * Math.cos(e), vz: Math.sin(a) * v * Math.cos(e), vy: Math.sin(e) * v + (o.up || 0) }); } }
  ring(x, y, z, R, color, life = 0.45) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 6, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: ADD, depthWrite: false }));
    m.rotation.x = Math.PI / 2; m.position.set(x, y, z); this.scene.add(m); this.rings.push({ m, R, life, age: 0 });
  }
  boom(x, y, z, size = 1, color) {
    this.spawn(x, y + 2, z, { color: 0xfff1c1, size: 26 * size, life: 0.25, grow: 1.5, drag: 0 });
    this.burst(x, y + 2, z, Math.round(22 * size), 120 * size, { color: color ?? 0xff7a1a, size: 6 * size, life: 0.6, grav: -40, up: 30 });
    this.burst(x, y + 2, z, Math.round(10 * size), 50 * size, { color: 0x444444, add: false, alpha: 0.6, size: 9 * size, life: 1.1, grav: -25, up: 20, grow: 2 });
    this.ring(x, y + 1, z, 40 * size, color ?? 0xffb703, 0.4);
  }
  // ---------- per-frame ----------
  update(dt, racers, meshes, camera) {
    this.t += dt; const S = this.sim, W = S.weapons, t = this.t;
    for (const e of S.events) this.onEvent(e); S.events.length = 0;
    // boxes
    if (W) for (const b of W.boxes) {
      let o = this.boxMeshes.get(b.id);
      if (!o) { const m = new THREE.Mesh(this.boxGeo, this.boxMat); const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: SOFT, color: 0xff7b00, transparent: true, blending: ADD, depthWrite: false, opacity: 0.3 })); halo.scale.set(13, 13, 1); m.add(halo); this.scene.add(m); o = { m, halo, s: 1 }; this.boxMeshes.set(b.id, o); }
      o.s += ((b.active ? 1 : 0) - o.s) * Math.min(1, dt * 8); o.m.visible = o.s > 0.03;
      o.m.position.set(b.x, b.y + Math.sin(t * 2 + b.id) * 0.5, b.z); o.m.rotation.set(0, t * 0.8 + b.id, 0); // sturdy crate: slow turn, no tumbling o.m.scale.setScalar(o.s * (1 + 0.06 * Math.sin(t * 6 + b.id)));
      o.halo.material.opacity = 0.2 + 0.1 * Math.sin(t * 4 + b.id);
    }
    // projectiles
    const seen = new Set();
    if (W) for (const p of W.proj) { seen.add(p.id); let o = this.objs.get(p.id); if (!o) { o = this.makeProj(p); this.objs.set(p.id, o); } this.syncProj(o, p, dt); }
    if (W) for (const h of W.haz) { seen.add(h.id); let o = this.objs.get(h.id); if (!o) { o = this.makeHaz(h); this.objs.set(h.id, o); } this.syncHaz(o, h, dt); }
    for (const [id, o] of this.objs) if (!seen.has(id)) { this.scene.remove(o.m); this.objs.delete(id); }
    // racer attachments & status effects
    racers.forEach((r, k) => this.racerFx(r, meshes[k], dt, t));
    // particles
    for (let k = this.live.length - 1; k >= 0; k--) {
      const q = this.live[k]; q.age += dt; const sp = q.sp;
      if (q.age >= q.life) { sp.visible = false; this.live.splice(k, 1); this.pool.push(sp); continue; }
      const dr = Math.exp(-q.drag * dt); q.vx *= dr; q.vz *= dr; q.vy = q.vy * dr - q.grav * dt;
      sp.position.x += q.vx * dt; sp.position.y += q.vy * dt; sp.position.z += q.vz * dt;
      const f = q.age / q.life; sp.material.opacity = q.alpha * (1 - f); sp.scale.setScalar(q.size * (1 + q.grow * f));
    }
    for (let k = this.rings.length - 1; k >= 0; k--) { const g = this.rings[k]; g.age += dt; const f = g.age / g.life; if (f >= 1) { this.scene.remove(g.m); g.m.geometry.dispose(); this.rings.splice(k, 1); continue; } g.m.scale.setScalar(1 + g.R * Math.sqrt(f)); g.m.material.opacity = 0.9 * (1 - f); }
    for (let k = this.zaps.length - 1; k >= 0; k--) {
      const z = this.zaps[k]; z.age += dt; if (z.age > z.life) { this.scene.remove(z.m); z.m.geometry.dispose(); this.zaps.splice(k, 1); continue; }
      const pts = []; const live = z.chain.map(c => c.r ? { x: c.r.x, y: c.r.y + 5, z: c.r.z } : c);
      for (let i = 0; i < live.length - 1; i++) { const a = live[i], b = live[i + 1]; for (let j = 0; j <= 8; j++) { const f = j / 8, jit = j === 0 || j === 8 ? 0 : 3.5; pts.push(a.x + (b.x - a.x) * f + rnd(-jit, jit), a.y + (b.y - a.y) * f + rnd(-jit, jit), a.z + (b.z - a.z) * f + rnd(-jit, jit)); } }
      z.m.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); z.m.material.opacity = 1 - z.age / z.life;
      if ((z.tick = (z.tick || 0) + 1) % 2 === 0) for (let i = 0; i < pts.length; i += 6) this.spawn(pts[i], pts[i + 1], pts[i + 2], { color: i % 12 ? 0x7df9ff : 0xffffff, size: 3.2, life: 0.07, grow: 0, drag: 0 });
      if (Math.random() < 0.7) for (let i = 1; i < live.length; i++) this.spawn(live[i].x + rnd(-3, 3), live[i].y + rnd(-2, 3), live[i].z + rnd(-3, 3), { color: 0x7df9ff, size: 5, life: 0.25 });
    }
  }
  onEvent(e) {
    const r = e.r;
    switch (e.type) {
      case 'launch': this.burst(r.x, r.y + 2, r.z, 12, 60, { color: 0xffd23f, size: 3.5, life: 0.45, star: true }); break;
      case 'jump': this.burst(r.x, r.y + 1, r.z, 6, 30, { color: 0xc8b89a, add: false, alpha: 0.5, size: 4, life: 0.5, grow: 1.5 }); break;
      case 'land': this.burst(r.x, r.y + 1, r.z, 6 + Math.round(10 * e.impact), 40 + 60 * e.impact, { color: 0xc8b89a, add: false, alpha: 0.55, size: 5, life: 0.6, grow: 1.8, up: -10 }); break;
      case 'pickup': this.burst(e.b.x, e.b.y, e.b.z, 18, 70, { color: 0xffd23f, size: 4, life: 0.5, star: true }); break;
      case 'boxSpawn': this.burst(e.b.x, e.b.y, e.b.z, 8, 30, { color: 0xff4fa3, size: 3, life: 0.4 }); break;
      case 'hit': this.burst(r.x, r.y + 6, r.z, 10, 55, { color: e.kind === 'zap' ? 0x7df9ff : e.kind === 'fire' ? 0xff6a00 : 0xffe066, star: e.kind !== 'fire', size: 4, life: 0.6, grav: 60 }); break;
      case 'boom': this.boom(e.x, e.y, e.z, e.size, e.color); break;
      case 'shock': this.ring(e.x, e.y + 2, e.z, e.R, 0x7df9ff, 0.5); this.ring(e.x, e.y + 5, e.z, e.R * 0.7, 0xffffff, 0.35); this.spawn(e.x, e.y + 4, e.z, { color: 0x7df9ff, size: 30, life: 0.3, grow: 2 }); this.burst(e.x, e.y + 2, e.z, 24, 160, { color: 0xbde0fe, size: 4, life: 0.4, drag: 3 }); break;
      case 'zap': { const g = new THREE.BufferGeometry(); const m = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xaaf8ff, transparent: true, blending: ADD, depthWrite: false })); this.scene.add(m); this.zaps.push({ m, chain: e.chain, age: 0, life: 0.5 });
        if (e.chain.length < 2) this.burst(r.x, r.y + 5, r.z, 14, 50, { color: 0x7df9ff, size: 3, life: 0.4 }); break; }
      case 'turboPad': this.burst(r.x, r.y + 2, r.z, 16, 70, { color: 0xffa200, size: 5, life: 0.4 }); this.ring(e.pad.x, e.pad.y + 1, e.pad.z, 22, 0xffb703, 0.35); break;
      case 'turbo': this.burst(r.x, r.y + 3, r.z, 14, 60, { color: 0x4cc9f0, size: 5, life: 0.4 }); break;
      case 'bombStick': case 'bombPass': { const q = e.to || r; this.burst(q.x, q.y + 10, q.z, 10, 40, { color: 0xff2a3a, size: 4, life: 0.4, star: true }); break; }
      case 'bump': this.burst(r.x + Math.cos(r.heading) * 6, r.y + 3, r.z + Math.sin(r.heading) * 6, 5, 50, { color: 0xffffaa, size: 2.5, life: 0.25 }); break;
      case 'ballBounce': this.spawn(e.p.x, e.p.y, e.p.z, { color: 0xff8fc8, size: 6, life: 0.2 }); break;
      case 'respawn': this.burst(r.x, r.y + 5, r.z, 16, 40, { color: 0xffffff, size: 3, life: 0.6, star: true }); break;
    }
  }
  makeProj(p) {
    let m;
    if (p.kind === 'ball') { m = new THREE.Mesh(new THREE.SphereGeometry(CONFIG.weapons.ball.radius, 14, 10), this.ballMat); }
    else if (p.kind === 'rocket') {
      m = new THREE.Group(); const body = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 6, 10).rotateZ(Math.PI / 2), new THREE.MeshPhongMaterial({ color: 0xf1f1f1, shininess: 90 })); m.add(body);
      const nose = new THREE.Mesh(new THREE.ConeGeometry(1, 2.4, 10).rotateZ(-Math.PI / 2), new THREE.MeshPhongMaterial({ color: 0xe63946 })); nose.position.x = 4.2; m.add(nose);
      for (let k = 0; k < 4; k++) { const f = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.15, 2.2), new THREE.MeshPhongMaterial({ color: 0xe63946 })); f.position.x = -2.6; f.rotation.x = k * Math.PI / 2; m.add(f); }
      const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: SOFT, color: 0xffa040, blending: ADD, transparent: true, depthWrite: false })); fl.scale.set(6, 6, 1); fl.position.x = -4; m.add(fl);
    } else { m = this.bombMesh(); }
    this.scene.add(m); return { m };
  }
  bombMesh() {
    const m = new THREE.Group(); m.add(new THREE.Mesh(new THREE.SphereGeometry(2.6, 14, 10), this.bombMat));
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1, 8), new THREE.MeshPhongMaterial({ color: 0x777777 })); cap.position.y = 2.6; m.add(cap);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 })); led.position.set(0, 1.2, 2.3); m.add(led); m.userData.led = led;
    const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: STAR, color: 0xffe066, blending: ADD, transparent: true, depthWrite: false })); spark.scale.set(3, 3, 1); spark.position.y = 3.6; m.add(spark); m.userData.spark = spark;
    return m;
  }
  syncProj(o, p, dt) {
    o.m.position.set(p.x, p.y, p.z);
    if (p.kind === 'rocket') { o.m.rotation.set(0, -Math.atan2(p.vz, p.vx), Math.atan2(p.vy, Math.hypot(p.vx, p.vz))); this.spawn(p.x - p.vx * 0.02, p.y, p.z - p.vz * 0.02, { color: 0x999999, add: false, alpha: 0.5, size: 3, life: 0.6, grow: 2 }); }
    else if (p.kind === 'ball') { o.m.rotation.z -= dt * 12; }
    else { o.m.rotation.x += dt * 8; o.m.userData.spark.material.rotation += dt * 9; }
  }
  makeHaz(h) {
    let m;
    if (h.kind === 'oil') { m = new THREE.Mesh(new THREE.CircleGeometry(h.R, 24), new THREE.MeshBasicMaterial({ map: OIL, transparent: true, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.rotation.z = Math.random() * 6; m.position.set(h.x, h.y + 0.35, h.z); }
    else if (h.kind === 'fire') { m = new THREE.Sprite(new THREE.SpriteMaterial({ map: SOFT, color: 0xff7a1a, blending: ADD, transparent: true, depthWrite: false })); m.position.set(h.x, h.y + 4, h.z); }
    else { m = this.bombMesh(); m.position.set(h.x, h.y + 2.6, h.z); }
    this.scene.add(m); return { m };
  }
  syncHaz(o, h, dt) {
    const f = h.age / h.life;
    if (h.kind === 'oil') { const s = Math.min(1, h.age * 4) * (f > 0.85 ? (1 - f) / 0.15 : 1); o.m.scale.setScalar(Math.max(0.01, s)); }
    else if (h.kind === 'fire') { const s = (h.R * 1.9) * (0.75 + 0.35 * Math.random()) * (f < 0.1 ? f * 10 : 1 - f * 0.6); o.m.scale.set(s, s * 1.3, 1); o.m.material.opacity = 0.9 * (1 - f); o.m.material.color.setHSL(0.05 + 0.06 * Math.random(), 1, 0.55);
      if (Math.random() < 0.25) this.spawn(h.x + rnd(-3, 3), h.y + 4, h.z + rnd(-3, 3), { color: 0xffb703, size: 2.5, vy: rnd(20, 50), life: 0.6, drag: 0.5 }); }
    else { const blink = Math.sin(this.t * (10 + 30 * f)) > 0; o.m.userData.led.visible = blink; o.m.userData.spark.material.rotation += dt * 9; }
  }
  // v3.5 tyre skid marks: one ring-buffer mesh of dark quads laid down by sliding / hard-braking ground vehicles
  skid(r, dt) {
    if (!this.sk) { const N = 900; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 12), 3)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 16), 4));
      const idx = []; for (let k = 0; k < N; k++) idx.push(k * 4, k * 4 + 1, k * 4 + 2, k * 4 + 2, k * 4 + 1, k * 4 + 3); g.setIndex(idx);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); m.frustumCulled = false; m.renderOrder = 1; this.scene.add(m); this.sk = { g, N, i: 0, last: new Map() }; }
    const S = this.sk, c = Math.cos(r.heading), s = Math.sin(r.heading), vL = Math.abs(-r.vx * s + r.vz * c);
    const sliding = r.type === 'car' && r.grounded && r.surface !== 'water' && r.speed > 20 && (r.drifting || vL > 18 || (r.input.thr < -0.3 && r.fwd > 30) || r.spinT > 0);
    const halfT = r.model === 'moto' || r.model === 'scooter' ? [0] : [-3.6, 3.6];
    const prev = S.last.get(r);
    if (!sliding) { S.last.delete(r); return; }
    const cur = halfT.map(o => [r.x - c * 4.5 - s * o, (r.groundY || 0) + 0.15, r.z - s * 4.5 + c * o]);
    if (prev && Math.hypot(cur[0][0] - prev[0][0], cur[0][2] - prev[0][2]) < 1.2) return;
    if (prev) { const P = S.g.attributes.position.array, C = S.g.attributes.color.array, w = 0.9, col = r.surface === 'grass' ? [0.22, 0.32, 0.12] : [0.08, 0.07, 0.07];
      for (let k = 0; k < cur.length; k++) { const a = prev[k], b = cur[k], q = S.i; S.i = (S.i + 1) % S.N;
        const dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz) || 1, nx = -dz / L * w, nz = dx / L * w;
        const v = [a[0] + nx, a[1], a[2] + nz, a[0] - nx, a[1], a[2] - nz, b[0] + nx, b[1], b[2] + nz, b[0] - nx, b[1], b[2] - nz]; P.set(v, q * 12);
        for (let j = 0; j < 4; j++) C.set([...col, 0.55], q * 16 + j * 4); }
      S.g.attributes.position.needsUpdate = true; S.g.attributes.color.needsUpdate = true; }
    S.last.set(r, cur);
  }
  racerFx(r, mesh, dt, t) {
    if (!mesh) return;
    const c = Math.cos(r.heading), s = Math.sin(r.heading);
    this.skid(r, dt);
    // v3.5 sparks when scraping along walls, dust / grass bits kicked up by the rear wheels
    if (r.scrapeT > 0 && r.speed > 25 && Math.random() < 0.9) for (let k = 0; k < 3; k++) this.spawn(r.x + c * 5 + rnd(-3, 3), r.y + 2, r.z + s * 5 + rnd(-3, 3), { color: Math.random() < 0.5 ? 0xffd166 : 0xfff3b0, size: rnd(1.2, 2.2), life: rnd(0.2, 0.4), vx: rnd(-60, 60) - r.vx * 0.3, vz: rnd(-60, 60) - r.vz * 0.3, vy: rnd(20, 70), grav: 260 });
    if (r.type === 'car' && r.grounded && r.speed > 45 && Math.random() < (r.surface === 'grass' ? 0.55 : r.surface === 'tile' ? 0.08 : 0.3)) {
      const grassy = r.surface === 'grass'; this.spawn(r.x - c * 6 + rnd(-2, 2), r.y + 1, r.z - s * 6 + rnd(-2, 2), { color: grassy ? (Math.random() < 0.5 ? 0x5c8f2f : 0x8a6a42) : 0xd8ccb4, add: false, alpha: grassy ? 0.7 : 0.35, size: grassy ? 1.6 : 3, grow: grassy ? 0 : 2.2, life: grassy ? 0.5 : 0.7, vx: -c * 30 + rnd(-10, 10), vz: -s * 30 + rnd(-10, 10), vy: rnd(15, 40), grav: grassy ? 200 : 20, drag: 1 }); }
    let a = this.att.get(mesh); if (!a) { a = {}; this.att.set(mesh, a); }
    // sticky bomb riding on the racer
    if (r.bomb) {
      if (!a.bomb) { a.bomb = this.bombMesh(); this.scene.add(a.bomb); }
      const f = 1 - r.bomb.t / CONFIG.weapons.bomb.fuse; a.bomb.visible = true;
      a.bomb.position.set(r.x, r.y + 13 + Math.sin(t * 8) * 0.5, r.z); a.bomb.scale.setScalar(1 + 0.12 * Math.max(0, Math.sin(t * (8 + 30 * f))));
      a.bomb.userData.led.visible = Math.sin(t * (8 + 40 * f)) > 0; a.bomb.userData.spark.material.rotation += dt * 9;
    } else if (a.bomb) a.bomb.visible = false;
    // spring boxing glove
    if (r.gloveT > 0) {
      if (!a.glove) {
        const g = new THREE.Group(); const spring = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1, 8, 1, true).rotateZ(Math.PI / 2), new THREE.MeshPhongMaterial({ color: 0xc0c0c0, wireframe: true })); g.add(spring);
        const glove = new THREE.Mesh(new THREE.SphereGeometry(2.6, 14, 10), new THREE.MeshPhongMaterial({ color: 0xe63946, shininess: 100 })); glove.scale.set(1.2, 1, 1); g.add(glove);
        const thumb = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 8), glove.material); thumb.position.set(0.4, 0.4, 2.2); glove.add(thumb);
        g.userData = { spring, glove }; mesh.root.add(g); a.glove = g;
      }
      const T = CONFIG.weapons.glove.time, f = 1 - r.gloveT / T, ext = Math.sin(Math.min(1, f) * Math.PI) * CONFIG.weapons.glove.reach * 0.85;
      a.glove.visible = true; a.glove.position.set(7, 5, 0); a.glove.userData.spring.scale.set(ext + 0.1, 1, 1); a.glove.userData.spring.position.x = ext / 2; a.glove.userData.glove.position.x = ext + 2;
    } else if (a.glove) a.glove.visible = false;
    // turbo flames + speed streaks
    if (r.turboT > 0) for (let k = 0; k < 2; k++) {
      const bx = r.x - c * 8 + rnd(-1, 1), bz = r.z - s * 8 + rnd(-1, 1), by = r.y + (r.type === 'drone' ? 3 : 3);
      this.spawn(bx, by, bz, { color: Math.random() < 0.5 ? 0x4cc9f0 : 0xff9e00, vx: -c * 80 + r.vx * 0.5, vz: -s * 80 + r.vz * 0.5, vy: rnd(-5, 10), size: 4.5, life: 0.28, grow: -0.5 });
    }
    // flamethrower
    if (r.fireT > 0) for (let k = 0; k < 3; k++) {
      const sp = rnd(140, 200), a2 = r.heading + rnd(-0.18, 0.18);
      this.spawn(r.x + c * 8, r.y + 4, r.z + s * 8, { color: Math.random() < 0.3 ? 0xffe066 : 0xff5a00, vx: Math.cos(a2) * sp + r.vx, vz: Math.sin(a2) * sp + r.vz, vy: rnd(0, 20), size: 3, grow: 2.5, life: 0.22, drag: 2 });
    }
    // electrified: sparks crawl over the racer
    if (r.stunT > 0 && Math.random() < 0.6) this.spawn(r.x + rnd(-6, 6), r.y + rnd(2, 9), r.z + rnd(-6, 6), { color: 0x7df9ff, size: rnd(2, 4), life: 0.15 });
    // dizzy stars
    if ((r.spinT > 0 || r.tumbleT > 0) && Math.random() < 0.25) { const a3 = t * 8 + Math.random(); this.spawn(r.x + Math.cos(a3) * 5, r.y + 12, r.z + Math.sin(a3) * 5, { color: 0xffe066, star: true, size: 2.5, life: 0.35, vy: 10 }); }
    // splashes in puddles / mud
    if (r.type === 'car' && r.grounded && r.surface === 'water' && r.speed > 25 && Math.random() < 0.8) for (const sd of [-1, 1]) this.spawn(r.x - c * 3 - s * sd * 4, r.y + 1, r.z - s * 3 + c * sd * 4, { color: 0xbfe3ff, add: false, alpha: 0.7, size: 2.2, life: 0.45, vx: -s * sd * 30 - c * 10, vz: c * sd * 30 - s * 10, vy: rnd(30, 60), grav: 200, drag: 0.5 });
    // drift smoke / grass bits
    if (r.type === 'car' && r.grounded && (r.drifting || r.spinT > 0) && Math.random() < 0.7) this.spawn(r.x - c * 5 + rnd(-2, 2), r.y + 1, r.z - s * 5 + rnd(-2, 2), { color: r.surface === 'grass' ? 0x6a9a3a : r.surface === 'water' ? 0x9fc6e0 : 0xdddddd, add: false, alpha: 0.45, size: 3.5, grow: 2, life: 0.6, vy: 8 });
  }
}
