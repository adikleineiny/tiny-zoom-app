import * as THREE from './three.module.min.js';
import { CONFIG } from './config.js';
import { TUNNEL, KENNEL } from './track.js';

// Merges many small solid-colour parts into ONE vertex-coloured mesh (1 draw call; keeps mobile fast).
class Batch {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.uv = null; }
  add(geo, color, mtx) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone(); if (mtx) g.applyMatrix4(mtx);
    if (!g.attributes.normal) g.computeVertexNormals();
    const P = g.attributes.position.array, Nn = g.attributes.normal.array, c = new THREE.Color(color);
    const C = g.attributes.color ? g.attributes.color.array : null;
    for (let k = 0; k < P.length; k++) { this.pos.push(P[k]); this.nor.push(Nn[k]); }
    for (let k = 0; k < P.length / 3; k++) C ? this.col.push(C[k * 3], C[k * 3 + 1], C[k * 3 + 2]) : this.col.push(c.r, c.g, c.b);
    g.dispose();
  }
  mesh(mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere(); return new THREE.Mesh(g, mat);
  }
}
const M4 = (x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(sx, sy, sz));
// merge plain geometries sharing one material (non-indexed, keeps uv)
function mergeGeos(list) {
  const pos = [], nor = [], uv = [], col = [];
  for (const g0 of list) { const g = g0.index ? g0.toNonIndexed() : g0; pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); if (g.attributes.color) col.push(...g.attributes.color.array); if (g.attributes.uv) uv.push(...g.attributes.uv.array); else for (let k = 0; k < g.attributes.position.count; k++) uv.push(0, 0); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); if (col.length === pos.length) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeBoundingSphere(); return g;
}
const prism = (r, len) => new THREE.CylinderGeometry(r, r, len, 3).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2); // roof prism, ridge along X, apex up

const lam = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });

let ANISO = 1;
const HALO = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = ANISO;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
function rnd(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

export function makeLabelTexture(text, bg = '#ffd23f', fg = '#222', w = 256, h = 96) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 22); g.fill();
    g.lineWidth = 6; g.strokeStyle = '#222'; g.stroke();
    g.fillStyle = fg; g.font = `bold ${Math.floor(h * 0.55)}px Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.direction = 'ltr'; g.fillText(text, w / 2, h / 2 + 3);
  });
}

export function buildWorld(scene, track, renderer) {
  const solids = track.solids;
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy()); ANISO = aniso;
  const B = new Batch(), GLOW = new Batch();
  const plain = mat => mat.isMeshLambertMaterial && !mat.map && !mat.transparent && mat.side === THREE.FrontSide;
  const box = (x0, x1, y0, y1, z0, z1, mat, opt = {}) => {
    const geo = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); let m = null;
    if (plain(mat) && !opt.parent) B.add(geo, mat.color.getHex(), M4((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
    else { m = new THREE.Mesh(geo, mat); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); (opt.parent || scene).add(m); }
    if (opt.solid !== false) solids.push({ x0, x1, y0, y1, z0, z1, minor: !!opt.minor });
    return m;
  };
  const cyl = (x, z, r, y0, y1, mat, seg = 16, solid = true, minor = false) => {
    const geo = new THREE.CylinderGeometry(r, r, y1 - y0, seg); let m = null;
    if (plain(mat)) B.add(geo, mat.color.getHex(), M4(x, (y0 + y1) / 2, z)); else { m = new THREE.Mesh(geo, mat); m.position.set(x, (y0 + y1) / 2, z); scene.add(m); }
    if (solid) solids.push({ x0: x - r * 0.85, x1: x + r * 0.85, z0: z - r * 0.85, z1: z + r * 0.85, y0, y1, minor });
    return m;
  };
  const part = (geo, color, x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) => B.add(geo, color, M4(x, y, z, ry, sx, sy, sz));

  let startLights = [];
  // ---------- lights / sky ----------
  scene.background = new THREE.Color(0x9fd3f5);
  scene.fog = new THREE.Fog(0x9fd3f5, 1400, 3800);
  // v3.5: sky/ground hemisphere + warm sun with soft PCF shadows that follow the camera target
  scene.add(new THREE.HemisphereLight(0xeaf6ff, 0x9a7a58, 1.0));
  const sun = new THREE.DirectionalLight(0xfff0d8, 1.55); sun.position.set(300, 500, 200); scene.add(sun); scene.add(sun.target);
  { const RC = CONFIG.render, S = sun.shadow, b = RC.shadowBox; sun.castShadow = true; S.mapSize.set(RC.shadowMap, RC.shadowMap); S.camera.left = -b; S.camera.right = b; S.camera.top = b; S.camera.bottom = -b; S.camera.near = 10; S.camera.far = 700; S.bias = -0.0008; S.normalBias = 0.4; S.radius = 3; }
  const SUN_OFF = new THREE.Vector3(120, 260, 90);
  scene.add(new THREE.AmbientLight(0xffffff, 0.12));
  // environment reflections for glossy vehicle paint: PMREM of a small generated room (bright window panels + warm floor)
  { const env = new THREE.Scene(); const room = new THREE.Mesh(new THREE.BoxGeometry(100, 60, 100), new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true }));
    const cols = [], pc = room.geometry.attributes.position; for (let k = 0; k < pc.count; k++) { const y = pc.getY(k); const c = new THREE.Color(y > 0 ? 0xcfe8ff : 0x7a5a3a); cols.push(c.r, c.g, c.b); } room.geometry.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); env.add(room);
    const panel = (x, y, z, w, h, ry, c, i = 1) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(i), side: THREE.DoubleSide })); m.position.set(x, y, z); m.rotation.y = ry; env.add(m); };
    panel(0, 10, -49, 60, 30, 0, 0xffffff, 3); panel(49, 8, 0, 40, 26, Math.PI / 2, 0xfff1d6, 2.2); panel(-49, 5, 20, 30, 16, Math.PI / 2, 0x9fd3f5, 1.4);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(2.5) })); top.rotation.x = Math.PI / 2; top.position.y = 29; env.add(top);
    const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(env, 0.02).texture; pm.dispose(); }

  // ---------- floors ----------
  const tileTex = canvasTex(512, 512, (g, w, h) => { // v3.5: 512px glazed terracotta/cream tiles with speckle, edge shading, grout
    const r = rnd(7), T = 256;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      const dark = (i + j) % 2 === 1; const v = (r() - 0.5) * 12, x0 = i * T, y0 = j * T;
      const gr = g.createLinearGradient(x0, y0, x0 + T, y0 + T);
      if (dark) { gr.addColorStop(0, `rgb(${206 + v},${104 + v},${70 + v})`); gr.addColorStop(1, `rgb(${178 + v},${84 + v},${56 + v})`); }
      else { gr.addColorStop(0, `rgb(${248 + v / 3},${240 + v / 3},${222 + v / 3})`); gr.addColorStop(1, `rgb(${228 + v / 3},${218 + v / 3},${198 + v / 3})`); }
      g.fillStyle = gr; g.fillRect(x0, y0, T, T);
      for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(${dark ? '90,40,20' : '120,100,80'},${0.05 + r() * 0.08})`; g.fillRect(x0 + r() * T, y0 + r() * T, 1 + r() * 2, 1 + r() * 2); }
      g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(x0 + 18, y0 + 18, T * 0.45, 10); g.fillRect(x0 + 18, y0 + 18, 10, T * 0.3); // glaze highlight
      g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(x0 + T - 14, y0 + 6, 8, T - 12); g.fillRect(x0 + 6, y0 + T - 14, T - 12, 8);  // bevel shade
    }
    g.strokeStyle = '#8f8270'; g.lineWidth = 7; for (let k = 0; k <= 2; k++) { g.beginPath(); g.moveTo(k * T, 0); g.lineTo(k * T, h); g.stroke(); g.beginPath(); g.moveTo(0, k * T); g.lineTo(w, k * T); g.stroke(); }
  }, [1400 / 60, 900 / 60]);
  tileTex.anisotropy = aniso;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1400, 900), lam(0xffffff, { map: tileTex }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(700, 0, 450); scene.add(floor);

  const grassTex = canvasTex(512, 512, (g, w, h) => { // v3.5: denser blades, colour patches
    g.fillStyle = '#5aa636'; g.fillRect(0, 0, w, h); const r = rnd(3);
    for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(${r() < 0.5 ? '40,110,30' : '140,190,70'},0.18)`; g.beginPath(); g.arc(r() * w, r() * h, 20 + r() * 60, 0, 7); g.fill(); }
    for (let k = 0; k < 9000; k++) { const v = r(); g.fillStyle = v < 0.45 ? '#4a9630' : v < 0.8 ? '#79c24c' : v < 0.95 ? '#3a7f25' : '#a6d86a'; const x = r() * w, y = r() * h; g.save(); g.translate(x, y); g.rotate((r() - 0.5) * 0.6); g.fillRect(0, 0, 1.6, 5 + r() * 9); g.restore(); }
  }, [3600 / 120, 2120 / 120]);
  grassTex.anisotropy = aniso;
  const grassM = lam(0xffffff, { map: grassTex });
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(3600, 2120), grassM);
  grass.rotation.x = -Math.PI / 2; grass.position.set(1000, -0.05, 1940); scene.add(grass);
  // patio stones path
  const stoneM = lam(0xc9c1b4);
  for (let k = 0; k < 6; k++) part(new THREE.CylinderGeometry(22, 24, 1.2, 10), 0xc9c1b4, 1000 + k * 50, 0.6, 975 + (k % 2) * 18);

  // ---------- walls ----------
  const wallM = lam(0xf3ead8), wallOut = lam(0xe8d6b5), baseM = lam(0xffffff);
  const H = 260, T0 = 894, T1 = 906;
  box(-12, 1412, 0, H, -12, 0, wallM); box(-12, 0, 0, H, 0, 900, wallM); box(1400, 1412, 0, H, 0, 900, wallM);
  // south wall with sliding door (x 60..200) and back door (340..460) holding the pet door
  box(-12, 60, 0, H, T0, T1, wallOut); box(60, 200, 215, H, T0, T1, wallOut); box(200, 340, 0, H, T0, T1, wallOut);
  box(340, 460, 205, H, T0, T1, wallOut); box(460, 1412, 0, H, T0, T1, wallOut);
  const doorM = lam(0x8a5a3b);
  box(340, 386, 0, 205, 898, 902, doorM, { solid: false }); box(414, 460, 0, 205, 898, 902, doorM, { solid: false }); box(386, 414, 26, 205, 898, 902, doorM, { solid: false });
  // door collision: the pet-door opening hitbox is a bit wider than the visible hole (hidden under the white frame) so nothing
  // can wedge on the frame edges; the lateral track limit at the door (halfWidth 15) then always fits inside it.
  solids.push({ x0: 340, x1: 384.5, y0: 0, y1: 205, z0: 898, z1: 902, petDoor: true }, { x0: 415.5, x1: 460, y0: 0, y1: 205, z0: 898, z1: 902, petDoor: true },
    { x0: 384.5, x1: 415.5, y0: 26, y1: 205, z0: 898, z1: 902, petDoor: true });
  box(440, 446, 95, 100, 902, 905, lam(0xd4af37), { solid: false }); // door handle
  // pet door frame (white plastic)
  const petM = lam(0xf5f5f5);
  box(382, 386, 0, 30, 896, 904, petM, { solid: false }); box(414, 418, 0, 30, 896, 904, petM, { solid: false }); box(382, 418, 26, 30, 896, 904, petM, { solid: false });
  const flapPivot = new THREE.Group(); flapPivot.position.set(400, 26, 900); scene.add(flapPivot);
  const flap = new THREE.Mesh(new THREE.BoxGeometry(27, 25, 0.6), new THREE.MeshLambertMaterial({ color: 0x7fa6b8, transparent: true, opacity: 0.55 }));
  flap.position.y = -12.6; flapPivot.add(flap);
  // baseboards
  box(0, 1400, 0, 8, 0, 1.5, baseM, { solid: false }); box(0, 1.5, 0, 8, 0, 894, baseM, { solid: false }); box(1398.5, 1400, 0, 8, 0, 894, baseM, { solid: false });
  // window on west wall
  const win = new THREE.Mesh(new THREE.PlaneGeometry(200, 110), new THREE.MeshBasicMaterial({ color: 0xcdeeff })); win.rotation.y = Math.PI / 2; win.position.set(0.6, 150, 400); scene.add(win);
  // ceiling
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(1400, 900), lam(0xfaf7f0, { side: THREE.DoubleSide })); ceil.rotation.x = Math.PI / 2; ceil.position.set(700, H, 450); scene.add(ceil);
  // sliding glass door (slid open, behind wall section)
  const alu = lam(0xb8bcc2);
  box(200, 336, 0, 212, 884, 888, new THREE.MeshLambertMaterial({ color: 0xaad8ee, transparent: true, opacity: 0.35 }));
  box(196, 200, 0, 212, 882, 890, alu, { solid: false }); box(56, 60, 0, 215, T0, T1, alu, { solid: false }); box(200, 204, 0, 215, T0, T1, alu, { solid: false });
  box(60, 200, 0, 1.2, T0, T1, alu, { solid: false });

  // ---------- kitchen furniture ----------
  const cabM = lam(0x6fa8a0), topM = lam(0xe9e4dc), kickM = lam(0x3d4a48), handleM = lam(0xcccccc);
  box(200, 1150, 0, 10, 0, 55, kickM); box(200, 1150, 10, 86, 0, 60, cabM, { solid: false }); box(198, 1152, 86, 90, 0, 63, topM, { solid: false });
  for (let x = 200; x <= 1150; x += 60) box(x - 0.6, x + 0.6, 12, 84, 60, 60.8, kickM, { solid: false });
  for (let x = 230; x < 1150; x += 60) box(x - 6, x + 6, 74, 76, 60, 62, handleM, { solid: false });
  box(700, 760, 20, 70, 60, 61, lam(0x222222), { solid: false }); // oven glass
  box(200, 1150, 145, 215, 0, 35, cabM, { solid: false });
  // fridge
  box(1290, 1395, 0, 200, 0, 72, lam(0xdfe3e6)); box(1292, 1296, 90, 170, 72, 75, handleM, { solid: false });
  const magnetC = [0xff595e, 0xffca3a, 0x8ac926, 0x1982c4]; magnetC.forEach((c, k) => box(1320 + k * 15, 1328 + k * 15, 120 + (k % 2) * 15, 128 + (k % 2) * 15, 72, 73, lam(c), { solid: false }));
  // island
  box(575, 825, 0, 8, 280, 380, kickM); box(570, 830, 8, 86, 275, 385, cabM, { solid: false }); box(560, 840, 86, 92, 268, 392, topM, { solid: false });
  // fake contact shadows
  const shadowM = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false });
  const fshadow = (x0, x1, z0, z1, op = 0.22) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), op === 0.22 ? shadowM : new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: op, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, 0.12, (z0 + z1) / 2); scene.add(m); };
  fshadow(565, 835, 270, 390); fshadow(195, 1155, 0, 70);

  // dining table + chairs (section 2)
  const woodTex = canvasTex(512, 128, (g, w, h) => { g.fillStyle = '#b07a46'; g.fillRect(0, 0, w, h); const r = rnd(11); for (let k = 0; k < 4; k++) { g.fillStyle = `rgba(${r() < 0.5 ? '70,40,15' : '210,160,100'},0.12)`; g.fillRect(0, k * 32, w, 32); g.fillStyle = 'rgba(40,20,5,0.35)'; g.fillRect(0, k * 32, w, 1.5); } for (let k = 0; k < 6; k++) { g.strokeStyle = 'rgba(80,40,15,0.35)'; g.lineWidth = 1.5; g.beginPath(); g.ellipse(r() * w, r() * h, 6 + r() * 10, 2 + r() * 3, 0, 0, 7); g.stroke(); } for (let k = 0; k < 90; k++) { g.strokeStyle = `rgba(90,50,20,${0.15 + r() * 0.2})`; g.lineWidth = 1 + r() * 2; g.beginPath(); const y = r() * h; g.moveTo(0, y); g.bezierCurveTo(w / 3, y + r() * 8 - 4, 2 * w / 3, y + r() * 8 - 4, w, y); g.stroke(); } });
  const woodM = lam(0xffffff, { map: woodTex }), legM = lam(0x8c5a30);
  box(596, 904, 70, 75, 586, 694, woodM);
  box(606, 894, 62, 70, 592, 595, legM); box(606, 894, 62, 70, 685, 688, legM);
  for (const [x, z] of [[600, 590], [894, 590], [600, 684], [894, 684]]) box(x, x + 6, 0, 70, z, z + 6, legM);
  fshadow(596, 904, 586, 694, 0.3);
  const chairM = lam(0xd9534f), chairLeg = lam(0x5a3a22);
  const chair = (cx, cz, back) => { // back: 'n','s','e','w' side where the backrest is
    const o = 16.5, lw = 1.75;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const lx = cx + sx * o, lz = cz + sz * o;
      const isBack = (back === 'n' && sz < 0) || (back === 's' && sz > 0) || (back === 'e' && sx > 0) || (back === 'w' && sx < 0);
      box(lx - lw, lx + lw, 0, isBack ? 95 : 42, lz - lw, lz + lw, chairLeg);
    }
    box(cx - 20, cx + 20, 42, 45, cz - 20, cz + 20, chairM);
    if (back === 'n') box(cx - 18, cx + 18, 72, 92, cz - 18, cz - 15.5, chairM);
    if (back === 's') box(cx - 18, cx + 18, 72, 92, cz + 15.5, cz + 18, chairM);
    if (back === 'e') box(cx + 15.5, cx + 18, 72, 92, cz - 18, cz + 18, chairM);
    if (back === 'w') box(cx - 18, cx - 15.5, 72, 92, cz - 18, cz + 18, chairM);
    fshadow(cx - 21, cx + 21, cz - 21, cz + 21, 0.14);
  };
  chair(660, 600, 'n'); chair(750, 585, 'n'); chair(840, 605, 'n'); chair(705, 690, 's'); chair(800, 680, 's'); chair(945, 640, 'e'); chair(565, 645, 'w');
  // pendant lamp
  cyl(750, 640, 0.6, 140, H, lam(0x333333), 6, false); const shade = new THREE.Mesh(new THREE.ConeGeometry(28, 26, 20, 1, true), lam(0xffd23f, { side: THREE.DoubleSide })); shade.position.set(750, 128, 640); scene.add(shade);

  // decor (off-track)
  cyl(330, 870, 10, 0, 5, lam(0x1982c4), 20); // pet bowl
  const food = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 1, 16), lam(0x8b5a2b)); food.position.set(330, 4.8, 870); scene.add(food);
  box(355, 445, 0, 0.6, 820, 886, lam(0x7a8f5a), { solid: false }); // door mat
  box(880, 900, 0, 30, 300, 307, lam(0xffca3a)); // cereal box by the island
  box(881, 899, 10, 22, 307, 307.3, lam(0xff595e), { solid: false });
  box(1000, 1030, 0, 2, 300, 304, lam(0xc0c0c0), { solid: false }); // dropped spoon

  // ---------- minor obstacles on track (cars must avoid, drones fly over) ----------
  box(900, 930, 0, 4, 118, 140, lam(0x2e86de), { minor: true }); box(901, 929, 4, 4.4, 119, 139, lam(0xffffff), { solid: false });
  box(1262, 1276, 0, 5, 372, 390, lam(0xffe066), { minor: true }); box(1262, 1276, 5, 6.5, 372, 390, lam(0x3aa655), { solid: false });
  box(118, 130, 0, 12, 500, 512, lam(0xff595e), { minor: true });
  box(740, 744, 0, 3, 1035, 1080, lam(0x2f9e44), { minor: true }); // garden hose piece

  // ---------- backyard ----------
  // house roof over the kitchen (seen from the garden)
  part(prism(560, 1450), 0xb5523b, 700, 260 + 140, 447, 0, 1, 0.5, 1);
  const potM = lam(0xc0623b), leafM = lam(0x3f8f3a);
  for (const [x, z, r] of [[760, 1260, 22], [890, 1350, 16], [-60, 1100, 20], [1150, 1260, 18], [2250, 1500, 24], [1600, 1900, 20]]) { cyl(x, z, r, 0, r * 1.6, potM, 14); part(new THREE.SphereGeometry(r * 1.3, 10, 8), 0x3f8f3a, x, r * 2.4, z); }
  cyl(820, 1300, 16, 0, 220, lam(0x7a5230), 10); part(new THREE.SphereGeometry(120, 14, 10), 0x4c9a3f, 820, 290, 1300);
  cyl(1500, 1750, 22, 0, 260, lam(0x7a5230), 10); part(new THREE.SphereGeometry(150, 14, 10), 0x5aa848, 1500, 340, 1750);
  cyl(2350, 2300, 20, 0, 240, lam(0x7a5230), 10); part(new THREE.SphereGeometry(130, 14, 10), 0x4c9a3f, 2350, 320, 2300);
  // v3.5: weathered wooden garden fence – planks in a few wood tones + two rails
  const fenceMs = [0xa06a3a, 0x94602f, 0xab7443, 0x8a5a2c].map(c => lam(c)), railM = lam(0x7a4c24); let fk = 0;
  const fm = () => fenceMs[(fk = (fk * 7 + 3) % 4)];
  for (let x = -600; x <= 2600; x += 18) box(x, x + 16, 0, 150 + (x % 36 ? 0 : 6), 2880, 2886, fm(), { solid: false });
  for (let z = 900; z <= 2880; z += 18) { box(-606, -600, 0, 150, z, z + 16, fm(), { solid: false }); box(2620, 2626, 0, 150, z, z + 16, fm(), { solid: false }); }
  for (const y of [35, 115]) { box(-600, 2620, y, y + 8, 2876, 2880, railM, { solid: false }); box(-600, -596, y, y + 8, 900, 2880, railM, { solid: false }); box(2616, 2620, y, y + 8, 900, 2880, railM, { solid: false }); }
  const r2 = rnd(5); const flowerC = [0xff595e, 0xffca3a, 0xffffff, 0xc77dff];
  const offTrack = (x, z, m) => { const pr = track.project(x, z, null); return Math.abs(pr.lat) > track.halfW[pr.idx] + m; };
  for (let k = 0, n = 0; k < 400 && n < 90; k++) { const x = -500 + r2() * 3000, z = 960 + r2() * 1880; if (!offTrack(x, z, 20) || (x > 1270 && x < 1670 && z > 970 && z < 1290)) continue; n++;
    part(new THREE.CylinderGeometry(0.6, 0.6, 14, 4), 0x3f8f3a, x, 7, z); part(new THREE.SphereGeometry(4, 6, 5), flowerC[k % 4], x, 14, z); }

  // ---------- sandbox with a drain-pipe tunnel through the sand hill ----------
  const TU = TUNNEL, plankC = 0xb07a46;
  for (const [x0, x1, z0, z1] of [[1270, 1670, 970, 982], [1270, 1670, 1278, 1290], [1270, 1282, 970, 1085], [1270, 1282, 1175, 1290], [1658, 1670, 970, 1085], [1658, 1670, 1175, 1290]]) box(x0, x1, 0, 12, z0, z1, lam(plankC), { solid: false });
  part(new THREE.BoxGeometry(376, 0.4, 296), 0xead7a4, 1470, 0.15, 1130);
  const mound = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), lam(0xe3c88a)); mound.scale.set(168, 78, 140); mound.position.set(1470, 0, 1130); scene.add(mound);
  const pipeTex = canvasTex(64, 64, (g) => { g.fillStyle = '#9aa0a6'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#7d838a'; for (let k = 0; k < 64; k += 16) g.fillRect(0, k, 64, 6); }, [8, 22]);
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(TU.r, TU.r, TU.x1 - TU.x0, 22, 1, true).rotateZ(Math.PI / 2), lam(0xffffff, { map: pipeTex, side: THREE.DoubleSide }));
  pipe.position.set((TU.x0 + TU.x1) / 2, TU.ceil + 2 - TU.r, TU.zc); scene.add(pipe);
  for (const x of [TU.x0, TU.x1]) part(new THREE.TorusGeometry(TU.r + 1.5, 2.2, 6, 24).rotateY(Math.PI / 2), 0x80868c, x, TU.ceil + 2 - TU.r, TU.zc);
  box(TU.x0 - 2, TU.x1 + 2, 0, 0.5, TU.zc - 31, TU.zc + 31, lam(0x8d939a), { solid: false }); // pipe floor
  solids.push({ x0: TU.solidX0, x1: TU.solidX1, z0: TU.zc - 42, z1: TU.zc + 42, y0: TU.ceil, y1: 82, tunnel: true }); // the hill above: no flying over
  for (let x = TU.x0 + 30; x < TU.x1 - 10; x += 45) GLOW.add(new THREE.BoxGeometry(10, 0.6, 2.4), 0xfff3a0, M4(x, TU.ceil + 1.2, TU.zc)); // tunnel lights
  // toy bucket & spade on the hill
  part(new THREE.CylinderGeometry(14, 10, 22, 14), 0xff595e, 1440, 82, 1180); part(new THREE.BoxGeometry(4, 44, 1.5), 0x1982c4, 1520, 90, 1090, 0.4);
  part(new THREE.ConeGeometry(16, 26, 4), 0xffca3a, 1560, 70, 1185); // sand-castle tower
  part(new THREE.CylinderGeometry(14, 14, 30, 8), 0xe8cf95, 1390, 60, 1080);

  // ---------- terrain: rolling hills (one merged mesh on the grass) ----------
  const hillGeos = [];
  for (const f of track.hfeat) if (f.kind === 'bump') {
    const L = f.len + 6, W = f.w + 90, g = new THREE.PlaneGeometry(L, W, Math.ceil(L / 5), Math.ceil(W / 10)); g.rotateX(-Math.PI / 2);
    const P = g.attributes.position, UV = g.attributes.uv;
    const cols = [], lo = new THREE.Color(0x6f9a52), hi = new THREE.Color(0xfff8c8), tmpc = new THREE.Color();
    for (let k = 0; k < P.count; k++) { const u = P.getX(k), v = P.getZ(k); const x = f.x + f.c * u - f.sn * v, z = f.z + f.sn * u + f.c * v; const y = track.groundAt(x, z); P.setXYZ(k, x, y + 0.06, z); UV.setXY(k, x / 120, z / 120); tmpc.copy(lo).lerp(hi, Math.min(1, y / 18)); cols.push(tmpc.r, tmpc.g, tmpc.b); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); g.computeVertexNormals(); hillGeos.push(g);
  }
  if (hillGeos.length) { const gt = grassTex.clone(); gt.repeat.set(1, 1); gt.needsUpdate = true; scene.add(new THREE.Mesh(mergeGeos(hillGeos), lam(0xffffff, { map: gt, vertexColors: true }))); }
  // ramps: wedges (all in the vertex-colour batch) with chevrons
  const rampCols = [0xff7b00, 0xffd23f, 0x3a86ff, 0xe63946];
  track.hfeat.filter(f => f.kind === 'ramp').forEach((f, k) => {
    const g = new THREE.BoxGeometry(f.len, 1, f.w); const P = g.attributes.position;
    for (let j = 0; j < P.count; j++) { const u = P.getX(j); P.setY(j, P.getY(j) > 0 ? f.h * (u + f.len / 2) / f.len + 0.05 : 0); }
    g.computeVertexNormals(); B.add(g, f.big ? 0xe63946 : rampCols[k % 4], M4(f.x, 0, f.z, -f.ang));
    for (let c = 0; c < 3; c++) { const u = -f.len / 2 + f.len * (0.25 + c * 0.25), y = f.h * (u + f.len / 2) / f.len + 0.25; const slope = Math.atan2(f.h, f.len);
      const ch = new THREE.BoxGeometry(3, 0.3, Math.min(f.w * 0.6, 40)).rotateZ(slope); GLOW.add(ch, 0xffffff, M4(f.x + f.c * u, y, f.z + f.sn * u, -f.ang)); }
    if (f.big) { const sign = new THREE.Mesh(new THREE.PlaneGeometry(40, 13), new THREE.MeshBasicMaterial({ map: makeLabelTexture('BIG JUMP!', '#e63946', '#fff', 320, 96), transparent: true, side: THREE.DoubleSide }));
      const px = f.x - f.c * (f.len / 2 + 30), pz = f.z - f.sn * (f.len / 2 + 30); sign.position.set(px - f.sn * (f.w / 2 + 14), 30, pz + f.c * (f.w / 2 + 14)); sign.rotation.y = -f.ang - Math.PI / 2; scene.add(sign);
      part(new THREE.BoxGeometry(2, 30, 2), 0x555555, px - f.sn * (f.w / 2 + 14), 15, pz + f.c * (f.w / 2 + 14)); }
  });
  // toy garage (rooftop shortcut lane) — a solid you can drive on
  if (track.garage) { const G = track.garage; box(G.x0, G.x1, 0, G.y1, G.z0, G.z1, lam(0x8ecae6)); box(G.x0, G.x1, G.y1, G.y1 + 0.3, G.z0 + 1, G.z1 - 1, lam(0x6c757d), { solid: false });
    for (let x = G.x0 + 20; x < G.x1 - 10; x += 40) box(x, x + 22, 2, 11, G.z1, G.z1 + 0.4, lam(0xffffff), { solid: false }); }
  // puddle / mud patches
  for (const f of track.puddles) { const g = new THREE.CircleGeometry(1, 28); g.rotateX(-Math.PI / 2); const m = new THREE.Mesh(g, new THREE.MeshPhongMaterial({ color: f.mud ? 0x6b4a2b : 0x3d8fd6, shininess: 120, specular: 0x99bbdd, transparent: true, opacity: f.mud ? 0.92 : 0.8, depthWrite: false }));
    m.scale.set(f.len / 2 * 1.08, 1, f.w / 2 * 1.08); m.rotation.y = -f.ang; m.position.set(f.x, 0.28, f.z); scene.add(m); }

  // ---------- toy town: play-mat road, houses on both sides ----------
  { const idx = []; for (let i = 0; i < track.N; i++) if (track.section[i] === 7) idx.push(i);
    const i0 = idx[0], i1 = idx[idx.length - 1]; const pos = [], uv = [], nor = [], walk = new Batch(); const roadTex = canvasTex(64, 128, (g) => { g.fillStyle = '#4a4e57'; g.fillRect(0, 0, 64, 128); g.fillStyle = '#f1f1f1'; g.fillRect(30, 10, 4, 54); g.fillStyle = '#ffd23f'; g.fillRect(2, 0, 3, 128); g.fillRect(59, 0, 3, 128); });
    roadTex.wrapT = THREE.RepeatWrapping;
    for (let k = i0 - 6; k <= i1 + 2; k++) { const i = (k + track.N) % track.N, j = (i + 1) % track.N; const w0 = track.halfW[i] + 3, w1 = track.halfW[j] + 3;
      const q = (ii, l) => [track.px[ii] + track.nx[ii] * l, 0.14, track.pz[ii] + track.nz[ii] * l];
      const A = q(i, -w0), Bq = q(i, w0), C = q(j, -w1), D = q(j, w1); const v0 = track.s[i] / 60, v1 = v0 + track.ds / 60;
      pos.push(...A, ...C, ...Bq, ...Bq, ...C, ...D); uv.push(0, v0, 0, v1, 1, v0, 1, v0, 0, v1, 1, v1); for (let n = 0; n < 6; n++) nor.push(0, 1, 0);
      for (const sd of [-1, 1]) { const a0 = q(i, sd * w0), a1 = q(i, sd * (w0 + 22)), b0 = q(j, sd * w1), b1 = q(j, sd * (w1 + 22)); [a0, a1, b0, b1].forEach(p => p[1] = 0.1);
        const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(sd > 0 ? [...a0, ...b0, ...a1, ...a1, ...b0, ...b1] : [...a0, ...a1, ...b0, ...a1, ...b1, ...b0], 3)); gg.computeVertexNormals(); walk.add(gg, 0xcfcac0); }
    }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); rg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); rg.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    scene.add(new THREE.Mesh(rg, lam(0xffffff, { map: roadTex }))); B.pos.push(...walk.pos); B.nor.push(...walk.nor); B.col.push(...walk.col);
    // houses
    const wallC = [0xffd6a5, 0xcaffbf, 0x9bf6ff, 0xffadad, 0xfdffb6, 0xbdb2ff, 0xffc6ff], roofC = [0xc1121f, 0x264653, 0x6d597a, 0xe76f51, 0x2a9d8f];
    const hr = rnd(21); let hk = 0;
    for (let s = track.s[i0] + 90; s < track.s[i1] - 40; s += 125) for (const sd of [-1, 1]) {
      const i = Math.round(s / track.ds) % track.N, tx = track.tx[i], tz = track.tz[i], nx = track.nx[i] * sd, nz = track.nz[i] * sd;
      const w = 80 + hr() * 30, d = 64 + hr() * 24, h = 62 + hr() * 50, off = track.halfW[i] + 30 + d / 2;
      const cx = track.px[i] + nx * off, cz = track.pz[i] + nz * off;
      let ok = true; for (const [a, b] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2], [0, 0]]) if (!offTrack(cx + tx * a + nx * b, cz + tz * a + nz * b, 12)) ok = false;
      if (!ok) continue; const ry = -Math.atan2(tz, tx), wc = wallC[hk % wallC.length], rc = roofC[hk % roofC.length]; hk++;
      const at = (u, v, y) => [cx + tx * u + nx * v, y, cz + tz * u + nz * v];
      part(new THREE.BoxGeometry(w, h, d), wc, ...at(0, 0, h / 2), ry);
      const rr = (d + 10) / 1.732; part(prism(rr, w + 8), rc, ...at(0, 0, h + rr / 2 * 0.8), ry, 1, 0.8, 1);
      part(new THREE.BoxGeometry(9, 26, 9), 0x8d6e63, ...at(w * 0.25, d * 0.15, h + 20), ry);
      part(new THREE.BoxGeometry(16, 28, 1.2), 0x7a4b2a, ...at(-w * 0.18, -d / 2 - 0.4, 14), ry);
      for (const u of [w * 0.12, w * 0.34]) part(new THREE.BoxGeometry(13, 13, 1.2), 0xbfe9ff, ...at(u, -d / 2 - 0.4, h * 0.42), ry);
      if (h > 80) for (const u of [-w * 0.3, -w * 0.05, w * 0.2]) part(new THREE.BoxGeometry(12, 12, 1.2), 0xbfe9ff, ...at(u, -d / 2 - 0.4, h * 0.78), ry);
      solids.push({ x0: cx - Math.max(w, d) / 2 * 0.8, x1: cx + Math.max(w, d) / 2 * 0.8, z0: cz - Math.max(w, d) / 2 * 0.8, z1: cz + Math.max(w, d) / 2 * 0.8, y0: 0, y1: h, house: true });
      // street lamp
      const lx = track.px[i] + nx * (track.halfW[i] + 14), lz = track.pz[i] + nz * (track.halfW[i] + 14);
      part(new THREE.CylinderGeometry(1, 1.4, 46, 6), 0x2b2d42, lx, 23, lz); GLOW.add(new THREE.SphereGeometry(3.4, 8, 6), 0xfff1a8, M4(lx, 48, lz));
    }
  }

  // ---------- gnome garden + doghouse tunnel ----------
  { const K = KENNEL, c = 0xa0522d;
    box(K.xc - K.half - 10, K.xc - K.half + 1, 0, K.ceil, K.z0, K.z1, lam(c)); box(K.xc + K.half - 1, K.xc + K.half + 10, 0, K.ceil, K.z0, K.z1, lam(c));
    box(K.xc - K.half - 10, K.xc + K.half + 10, K.ceil, K.ceil + 5, K.z0, K.z1, lam(0x8b4513));
    part(new THREE.CylinderGeometry(K.half + 22, K.half + 22, K.z1 - K.z0 + 14, 3).rotateX(-Math.PI / 2), 0xc1121f, K.xc, K.ceil + 5 + (K.half + 22) / 2 * 0.7, (K.z0 + K.z1) / 2, 0, 1, 0.7, 1);
    for (const z of [K.z0, K.z1]) for (const sd of [-1, 1]) box(K.xc + sd * (K.half - 4) - 4, K.xc + sd * (K.half - 4) + 4, 0, K.ceil, z - 2, z + 2, lam(0xfff1e6), { solid: false });
    const bowl = new THREE.CylinderGeometry(9, 7, 6, 14); part(bowl, 0xe63946, K.xc + K.half + 30, 3, K.z1 + 10);
    part(new THREE.CylinderGeometry(3, 3, 22, 8).rotateZ(Math.PI / 2), 0xfff1e6, K.xc - K.half - 34, 3, K.z0 + 30); // chew bone
    for (const sd of [-1, 1]) part(new THREE.SphereGeometry(4.5, 8, 6), 0xfff1e6, K.xc - K.half - 34 + sd * 12, 3, K.z0 + 30);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(26, 9), new THREE.MeshBasicMaterial({ map: makeLabelTexture('WOOF', '#ffffff', '#c1121f', 256, 90), transparent: true, side: THREE.DoubleSide }));
    plate.position.set(K.xc, K.ceil + 14, K.z1 + 8); scene.add(plate);
    const gr = rnd(9), hatC = [0xe63946, 0x1982c4, 0x8ac926, 0xff7b00];
    for (let k = 0, n = 0; k < 200 && n < 16; k++) { const x = -40 + gr() * 680, z = 1300 + gr() * 800; if (!offTrack(x, z, 22) || (Math.abs(x - K.xc) < 90 && z > K.z0 - 30 && z < K.z1 + 30)) continue; n++;
      const sc = 0.8 + gr() * 0.6; part(new THREE.CylinderGeometry(4 * sc, 6 * sc, 12 * sc, 8), hatC[(n + 1) % 4], x, 6 * sc, z); part(new THREE.SphereGeometry(3.6 * sc, 8, 6), 0xf1c27d, x, 15 * sc, z);
      part(new THREE.ConeGeometry(3.4 * sc, 7 * sc, 8), 0xffffff, x + 2.5 * sc, 11.5 * sc, z, 0, 1, 1, 0.8); part(new THREE.ConeGeometry(4 * sc, 12 * sc, 8), hatC[n % 4], x, 22 * sc, z);
      if (n % 3 === 0) { part(new THREE.CylinderGeometry(6, 7, 16, 10), 0xfff1e6, x + 24, 8, z + 10); part(new THREE.SphereGeometry(14, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xe63946, x + 24, 15, z + 10); for (let d = 0; d < 4; d++) part(new THREE.SphereGeometry(2.2, 6, 4), 0xffffff, x + 24 + Math.cos(d * 1.6) * 9, 24, z + 10 + Math.sin(d * 1.6) * 9); }
    }
  }

  // ---------- track furniture: barriers, gates, start line, pads ----------
  const N = track.N; const step = Math.max(1, Math.round(10 / track.ds));
  const bpos = [];
  for (let i = 0; i < N; i += step) for (const side of [-1, 1]) {
    const off = side * (track.halfW[i] + 1.5);
    const x = track.px[i] + track.nx[i] * off, z = track.pz[i] + track.nz[i] * off;
    if (track.insideSolid(x, 2, z, 2)) continue;
    if (Math.abs(z - 900) < 12) continue;
    if (x > TUNNEL.x0 - 4 && x < TUNNEL.x1 + 4 && Math.abs(z - TUNNEL.zc) < 45) continue;
    if (Math.abs(x - KENNEL.xc) < KENNEL.half + 12 && z > KENNEL.z0 - 2 && z < KENNEL.z1 + 2) continue;
    bpos.push([x, z, Math.atan2(track.tz[i], track.tx[i]), track.groundAt(x, z)]);
  }
  const bh = CONFIG.barrierHeight;
  const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(9.2, bh, 3), lam(0xffffff), bpos.length);
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  bpos.forEach(([x, z, a, gy], k) => { q.setFromAxisAngle(up, -a); mtx.compose(new THREE.Vector3(x, gy + bh / 2, z), q, sc); inst.setMatrixAt(k, mtx); inst.setColorAt(k, col.set((k >> 1) % 2 ? 0xffffff : 0xe63946)); });
  scene.add(inst);

  const gateM = lam(0xffd23f), gateM2 = lam(0x1d3557);
  const noFlyTex = canvasTex(64, 64, (g) => { g.fillStyle = 'rgba(230,57,70,0.35)'; g.fillRect(0, 0, 64, 64); g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 8; for (let k = -64; k < 128; k += 24) { g.beginPath(); g.moveTo(k, 64); g.lineTo(k + 64, 0); g.stroke(); } }, [4, 1]);
  const noFlyM = new THREE.MeshBasicMaterial({ map: noFlyTex, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
  const panels = [];
  track.gates.forEach((g, gi) => {
    const i = g.i, gx = track.px[i], gz = track.pz[i], ry = -Math.atan2(track.tz[i], track.tx[i]), nx = track.nx[i], nz = track.nz[i];
    const w = g.hw + 3; const ceilG = track.ceilingAt(gx, gz), col = gi === 0 ? 0x1d3557 : g.arch ? 0xff4fa3 : 0xffd23f;
    if (!g.door && !g.tunnel && !g.kennel) {
      for (const sd of [-1, 1]) part(new THREE.BoxGeometry(3, g.h, 3), col, gx + nx * sd * w, g.h / 2, gz + nz * sd * w, ry);
      part(new THREE.BoxGeometry(3, 3, 2 * w + 3), col, gx, g.h + 1.5, gz, ry);
      if (g.arch) { part(new THREE.BoxGeometry(5, 5, 2 * w + 16), 0x7b2ff7, gx, g.h + 22, gz, ry); for (const sd of [-1, 1]) part(new THREE.BoxGeometry(6, g.h + 24, 6), 0x7b2ff7, gx + nx * sd * (w + 5), (g.h + 24) / 2, gz + nz * sd * (w + 5), ry); }
      const top = Math.min(ceilG - 1, g.h + 45);
      if (top > g.h + 5) { const pg = new THREE.PlaneGeometry(2 * w, top - g.h - 3); pg.rotateY(Math.PI / 2 + ry); pg.translate(gx, (g.h + 3 + top) / 2, gz); panels.push(pg); }
    }
    const big = g.arch || g.tunnel, lw = big ? 34 : 16, lh = big ? 10 : 6;
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(lw, lh), new THREE.MeshBasicMaterial({ map: makeLabelTexture(g.label || String(gi), gi === 0 ? '#ffffff' : g.arch ? '#ff4fa3' : '#ffd23f', g.arch ? '#fff' : '#222', big ? 320 : 256, 96), transparent: true, side: THREE.DoubleSide }));
    const ly = g.door ? 33 : g.tunnel ? TUNNEL.ceil + 14 : g.kennel ? KENNEL.ceil + 26 : g.arch ? g.h + 22 : g.h + 7;
    const back = g.tunnel ? -18 : g.door ? -3 : 0;
    lbl.rotation.y = ry - Math.PI / 2; lbl.position.set(gx + track.tx[i] * back, ly, gz + track.tz[i] * back); scene.add(lbl);
  });
  if (panels.length) scene.add(new THREE.Mesh(mergeGeos(panels), noFlyM));
  // v3.5 track markings: crisp white edge lines along both sides of the whole racing line (follow ramps / hills)
  { const pos = [], idx = [], N = track.N, w = 0.55;
    for (const sd of [-1, 1]) { const base = pos.length / 3;
      for (let i = 0; i <= N; i++) { const k = i % N, l = sd * (track.halfW[k] - 1.8), cx = track.px[k] + track.nx[k] * l, cz = track.pz[k] + track.nz[k] * l;
        for (const e of [-w, w]) { const x = cx + track.nx[k] * e, z = cz + track.nz[k] * e; pos.push(x, track.groundAt(x, z) + 0.18, z); } }
      for (let i = 0; i < N; i++) { const a = base + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xf4f4f0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })); m.name = 'edgeLines'; scene.add(m); }
  // start line
  { const i = track.gates[0].i; const chk = canvasTex(128, 16, (g) => { for (let a = 0; a < 16; a++) for (let b = 0; b < 2; b++) { g.fillStyle = (a + b) % 2 ? '#111' : '#fff'; g.fillRect(a * 8, b * 8, 8, 8); } });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2 * track.halfW[i], 8), new THREE.MeshBasicMaterial({ map: chk })); m.rotation.x = -Math.PI / 2; m.rotation.z = -Math.atan2(track.tz[i], track.tx[i]) + Math.PI / 2; m.position.set(track.px[i], 0.2, track.pz[i]); scene.add(m);
    // v3.5 start-line gantry: two striped posts, a banner with an original toy-car emblem + 'START', and 4 start lights
    const hw = track.halfW[i] + 6, dir = Math.atan2(track.tz[i], track.tx[i]), nx = track.nx[i], nz = track.nz[i], H = Math.min(44, track.ceilingAt(track.px[i], track.pz[i]) - 6);
    const postTex = canvasTex(32, 128, (g) => { for (let k = 0; k < 8; k++) { g.fillStyle = k % 2 ? '#e63946' : '#ffffff'; g.fillRect(0, k * 16, 32, 16); } }, [1, 2]);
    const postM = new THREE.MeshLambertMaterial({ map: postTex });
    for (const sd of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.9, H, 12), postM); p.position.set(track.px[i] + nx * hw * sd, H / 2, track.pz[i] + nz * hw * sd); scene.add(p); }
    const banTex = canvasTex(1024, 128, (g, w, h) => {
      for (let a = 0; a < 64; a++) for (let b = 0; b < 2; b++) { g.fillStyle = (a + b) % 2 ? '#111' : '#fff'; g.fillRect(a * 16, b * 16, 16, 16); g.fillRect(a * 16, h - 32 + b * 16, 16, 16); }
      g.fillStyle = '#e63946'; g.fillRect(0, 32, w, h - 64);
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(w / 2 - 190, h / 2, 26, 0, 7); g.fill(); g.fillStyle = '#111'; g.fillRect(w / 2 - 210, h / 2 - 6, 40, 12); g.beginPath(); g.arc(w / 2 - 202, h / 2 + 10, 6, 0, 7); g.arc(w / 2 - 178, h / 2 + 10, 6, 0, 7); g.fill();
      g.font = "900 54px 'Arial Black', Arial, sans-serif"; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 8; g.strokeStyle = '#7a0d12'; g.strokeText('START', w / 2 + 40, h / 2 + 2); g.fillStyle = '#ffe14d'; g.fillText('START', w / 2 + 40, h / 2 + 2);
    });
    const ban = new THREE.Mesh(new THREE.BoxGeometry(2 * hw, 9, 1.2), [0, 0, 0, 0, 1, 1].map(k => k ? new THREE.MeshLambertMaterial({ map: banTex }) : new THREE.MeshLambertMaterial({ color: 0xb02a33 })));
    ban.position.set(track.px[i], H - 4, track.pz[i]); ban.rotation.y = -dir - Math.PI / 2; scene.add(ban);
    const lights = []; for (let k = 0; k < 4; k++) { const o = (k - 1.5) * 5; const l = new THREE.Mesh(new THREE.SphereGeometry(1.5, 12, 8), new THREE.MeshBasicMaterial({ color: 0x331111 })); l.position.set(track.px[i] + nx * o - track.tx[i] * 1, H - 10.5, track.pz[i] + nz * o - track.tz[i] * 1); scene.add(l); lights.push(l); }
    const housing = new THREE.Mesh(new THREE.BoxGeometry(23, 4.5, 2), new THREE.MeshLambertMaterial({ color: 0x1b1b1b })); housing.position.set(track.px[i], H - 10.5, track.pz[i]); housing.rotation.y = -dir - Math.PI / 2; scene.add(housing);
    startLights = lights; }
  // grid boxes
  // v3.3 turbo boost pads: orange plate with glowing chevrons pointing along the track + pulsing glow frame
  const TPC = CONFIG.turboPads, padL = TPC.radius * 2.2, padW = TPC.radius * 1.7;
  const padTex = canvasTex(128, 160, (g) => {
    g.fillStyle = '#2a1200'; g.fillRect(0, 0, 128, 160); g.strokeStyle = '#ffb703'; g.lineWidth = 8; g.strokeRect(4, 4, 120, 152);
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (let k = 0; k < 3; k++) { const y = 125 - k * 42; g.strokeStyle = k === 2 ? '#fff3b0' : '#ff7b00'; g.lineWidth = 16; g.beginPath(); g.moveTo(22, y + 18); g.lineTo(64, y - 18); g.lineTo(106, y + 18); g.stroke(); }
  });
  const padRings = [], padGlowM = new THREE.MeshBasicMaterial({ color: 0xffa200, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
  track.pads.forEach(p => {
    const grp = new THREE.Group(); grp.position.set(p.x, p.y + 0.3, p.z); grp.rotation.y = -p.dir + Math.PI / 2; // local -z = travel direction
    const m = new THREE.Mesh(new THREE.PlaneGeometry(padW, padL), new THREE.MeshBasicMaterial({ map: padTex })); m.rotation.x = -Math.PI / 2; grp.add(m);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(padW * 1.35, padL * 1.25), padGlowM); glow.rotation.x = -Math.PI / 2; glow.position.y = 0.1; grp.add(glow);
    grp.userData.glow = glow; grp.name = 'turboPad'; scene.add(grp); padRings.push(grp);
  });

  scene.add(B.mesh(lam(0xffffff, { vertexColors: true })));
  scene.add(GLOW.mesh(new THREE.MeshBasicMaterial({ vertexColors: true })));

  // v3.4 floating turbo rings (drone + helicopter): orange ring with a cyan inner glow ring, see-through cyan
  // shimmer disc and 4 chevron fins pointing along the track. Built on first update (track.rings exist after finalize()).
  // v3.5 wind-gust zones for flyers (over every grass / mud / puddle slow zone): translucent swirling vortex columns at
  // flying height + drifting leaves / dust (original look). Purely visual – the slow factor lives in track.gust.
  const gusts = [];
  { const swirl = canvasTex(128, 128, (g) => { g.clearRect(0, 0, 128, 128); for (let k = 0; k < 7; k++) { g.strokeStyle = `rgba(255,255,255,${0.25 + 0.1 * (k % 3)})`; g.lineWidth = 3 + (k % 2) * 3; g.beginPath(); for (let y = 0; y <= 128; y += 4) { const x = (k * 18 + y * 0.9) % 128; y === 0 ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke(); } });
    swirl.wrapS = swirl.wrapT = THREE.RepeatWrapping;
    const leafTex = canvasTex(32, 32, (g) => { g.fillStyle = '#fff'; g.beginPath(); g.ellipse(16, 16, 13, 6, 0.6, 0, 7); g.fill(); });
    for (const z of track.zones || []) {
      const water = z.surface === 'water', n = Math.max(1, Math.round(z.len / 170));
      const vm = new THREE.MeshBasicMaterial({ map: swirl, color: water ? 0x9fd8ff : 0xd8f0c0, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const cols = [], pts = [], seeds = [];
      for (let k = 0; k < n; k++) { const i = Math.round(z.i0 + (k + 0.5) / n * (z.i1 - z.i0)), sd = (k % 2 ? 1 : -1) * track.halfW[i] * 0.45, x = track.px[i] + track.nx[i] * sd, zz = track.pz[i] + track.nz[i] * sd;
        const gy = track.groundAt(x, zz), top = Math.min(48, track.ceilingAt(x, zz) - gy - 4);
        if (top < 18) continue;
        const c = new THREE.Mesh(new THREE.CylinderGeometry(9, 4, top, 18, 1, true), vm); c.position.set(x, gy + top / 2 + 1, zz); c.name = 'gustVortex'; scene.add(c); cols.push(c);
        for (let q = 0; q < 14; q++) { pts.push(x, gy + 5, zz); seeds.push({ cx: x, cz: zz, gy, top, a: Math.random() * 6.28, r: 2 + Math.random() * 8, h: Math.random(), sp: 2 + Math.random() * 2 }); } }
      const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const pm = new THREE.PointsMaterial({ map: leafTex, color: water ? 0xb9d7e8 : 0x9bbf4a, size: 2.4, transparent: true, depthWrite: false, alphaTest: 0.2 });
      const P = new THREE.Points(pg, pm); P.frustumCulled = false; scene.add(P);
      gusts.push({ zone: z, cols, P, seeds });
    } }
  // v3.5: all opaque world surfaces receive the sun's soft shadows (vehicles cast them)
  scene.traverse(o => { if (o.isMesh && !(o.material.transparent)) o.receiveShadow = true; });
  let flyRings = null;
  const buildRings = () => {
    flyRings = []; const R = TPC.ringR;
    const orange = new THREE.MeshBasicMaterial({ color: 0xff8a00 }), cyan = new THREE.MeshBasicMaterial({ color: 0x3ff6ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const p of track.rings || []) {
      const grp = new THREE.Group(); grp.position.set(p.x, p.ry, p.z); grp.rotation.y = Math.PI / 2 - p.dir;
      grp.add(new THREE.Mesh(new THREE.TorusGeometry(R, 1.5, 10, 40), orange));
      const inner = new THREE.Mesh(new THREE.TorusGeometry(R - 2.2, 0.6, 8, 40), cyan); grp.add(inner);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(R - 2.6, 32), new THREE.MeshBasicMaterial({ color: 0x3ff6ff, transparent: true, opacity: 0.12, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })); grp.add(disc);
      for (let k = 0; k < 4; k++) { const f = new THREE.Mesh(new THREE.ConeGeometry(1.4, 3.5, 4), orange); const a = k * Math.PI / 2 + Math.PI / 4; f.position.set(Math.cos(a) * (R + 2.2), Math.sin(a) * (R + 2.2), 0); f.rotation.x = Math.PI / 2; grp.add(f); }
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: HALO, color: 0xffa040, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })); halo.scale.set(R * 3.4, R * 3.4, 1); grp.add(halo); // soft glow (cheap bloom)
      grp.userData = { inner, disc }; grp.name = 'turboRing'; scene.add(grp); flyRings.push(grp);
    }
  };

  return {
    rings: () => flyRings, gusts,
    sun,
    followSun(r) { if (!r) return; sun.position.set(r.x + SUN_OFF.x, r.y + SUN_OFF.y, r.z + SUN_OFF.z); sun.target.position.set(r.x, r.y, r.z); },
    setStartLights(n) { startLights.forEach((l, k) => l.material.color.setHex(n >= 4 ? 0x2bff5a : k < n ? 0xff2a2a : 0x331111)); },
    update(t, racers) {
      if (!flyRings && track.rings) buildRings();
      for (const G of gusts) { G.cols.forEach((c, k) => { c.rotation.y = t * (2.2 + k * 0.1); c.material.map.offset.y = -t * 0.4; });
        const a = G.P.geometry.attributes.position; G.seeds.forEach((d, k) => { d.a += d.sp * 0.016; d.h = (d.h + 0.004 * d.sp) % 1; a.setXYZ(k, d.cx + Math.cos(d.a) * d.r * (0.6 + d.h), d.gy + 3 + d.h * d.top, d.cz + Math.sin(d.a) * d.r * (0.6 + d.h)); }); a.needsUpdate = true; }
      if (flyRings) flyRings.forEach((g, k) => { const q = 0.5 + 0.5 * Math.sin(t * 7 + k); g.userData.inner.scale.setScalar(0.96 + 0.06 * q); g.userData.disc.material.opacity = 0.08 + 0.14 * q; g.userData.inner.rotation.z = t * 1.5; });
      let near = 0;
      for (const r of racers) { const d = Math.hypot(r.x - 400, r.z - 900); if (d < 22 && Math.abs(r.x - 400) < 16) near = Math.max(near, (1 - d / 22)) * Math.sign(r.vz || 1); }
      const target = -near * 1.3; flapPivot.rotation.x += (target - flapPivot.rotation.x) * 0.25;
      padRings.forEach((g, k) => { const s = 1 + 0.08 * Math.sin(t * 8 + k); g.userData.glow.scale.set(s, 1, s); g.userData.glow.material.opacity = 0.35 + 0.25 * (0.5 + 0.5 * Math.sin(t * 8 + k)); });
    }
  };
}
