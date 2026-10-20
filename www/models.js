// v3.6/v3.7: licensed, locally bundled glTF vehicle models (see CREDITS.md). Procedural models stay as fallback.
import * as THREE from './three.module.min.js';
import { GLTFLoader } from './addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from './addons/libs/meshopt_decoder.module.js';

export const GLB = { racecar: null, racecar_lod: null, heli: null, moto: null, scooter: null, drone: null };
export const MODEL_FILES = { racecar: 'models/racecar.glb', heli: 'models/heli.glb', racecar_lod: 'models/racecar_lod.glb',
  moto: 'models/moto.glb', scooter: 'models/scooter.glb', drone: 'models/drone.glb' }; // v3.7 Sketchfab CC-BY models
let enabled = true;
export function setModelsEnabled(v) { enabled = !!v; }
export const glbFor = m => (enabled && GLB[m]) || null;
export function preloadModels() {
  const L = new GLTFLoader(); L.setMeshoptDecoder(MeshoptDecoder);
  return Promise.all(Object.entries(MODEL_FILES).map(([k, url]) => new Promise(res => L.load(url, g => {
    g.scene.traverse(o => { if (o.isMesh && o.material && o.material.transmission > 0 && !/glass/i.test(o.material.name) && (k === 'moto' || k === 'scooter' || k === 'drone')) { o.material.transmission = 0; } // v3.7: opaque transmissive plastics
    if (o.isMesh && o.material && o.material.transmission > 0) { // transmission = extra full-scene pass: use cheap tinted glass
      const m = o.material; m.transmission = 0; m.transparent = true; m.opacity = 0.38; m.depthWrite = false; m.color.setHex(0x223344); m.roughness = 0.05; m.metalness = 0.3; }
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    GLB[k] = g.scene; res(true);
  }, undefined, e => { console.warn('model fallback (procedural):', k, e?.message || e); res(false); }))));
}

// Repaint: shifts the hue of the saturated green paint to the racer colour (keeps flames, chrome, tyres, glass).
function paintShift(mat, color) {
  const m = mat.clone(); m.envMapIntensity = 0.55; if (m.clearcoat !== undefined) m.clearcoatRoughness = Math.max(0.08, m.clearcoatRoughness || 0); const c = new THREE.Color(color); const hsl = {}; c.getHSL(hsl);
  m.userData.hue = hsl.h;
  m.onBeforeCompile = sh => {
    sh.uniforms.uHue = { value: hsl.h }; sh.uniforms.uLight = { value: hsl.l };
    sh.fragmentShader = 'uniform float uHue; uniform float uLight;\n' +
      'vec3 tzRgb2hsv(vec3 c){vec4 K=vec4(0.,-1./3.,2./3.,-1.);vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g));vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r));float d=q.x-min(q.w,q.y);float e=1.0e-10;return vec3(abs(q.z+(q.w-q.y)/(6.*d+e)),d/(q.x+e),q.x);}\n' +
      'vec3 tzHsv2rgb(vec3 c){vec4 K=vec4(1.,2./3.,1./3.,3.);vec3 p=abs(fract(c.xxx+K.xyz)*6.-K.www);return c.z*mix(K.xxx,clamp(p-K.xxx,0.,1.),c.y);}\n' +
      sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      { vec3 hsv = tzRgb2hsv(diffuseColor.rgb);
        float green = smoothstep(0.17, 0.24, hsv.x) * (1.0 - smoothstep(0.50, 0.56, hsv.x)) * smoothstep(0.12, 0.3, hsv.y);
        vec3 tgt = tzHsv2rgb(vec3(uHue, min(1.0, hsv.y * 1.05), clamp(hsv.z * (0.8 + uLight * 0.5), 0.0, 1.0)));
        diffuseColor.rgb = mix(diffuseColor.rgb, tgt, green); }`);
  };
  m.customProgramCacheKey = () => 'tzpaint';
  return m;
}

// Build the GLB racecar into the vehicle parts (forward +X, ground y=0, wheel pivots replace procedural wheels).
export function buildGlbCar(parts, color, lod) {
  const src = (lod && GLB.racecar_lod) || GLB.racecar; const mats = new Map();
  const body = src.getObjectByName('body').clone(true);
  body.traverse(o => { if (o.isMesh && !o.material.transparent && o.material.name !== 'Glass') { if (!mats.has(o.material)) mats.set(o.material, paintShift(o.material, color)); o.material = mats.get(o.material); } if (o.isMesh && o.material.name === 'Glass') { o.castShadow = false; } });
  parts.tilt.add(body);
  const names = { FL: [1, 1], FR: [1, -1], RL: [-1, 1], RR: [-1, -1] };
  for (const [n] of Object.entries(names)) {
    const w0 = src.getObjectByName('wheel_' + n); const w = w0.clone(true); const piv = new THREE.Group();
    piv.position.copy(w0.position); w.position.set(0, 0, 0); piv.add(w);
    parts.flip.add(piv); parts.wheels.push(w); parts.pivots.push(piv); if (w0.position.x > 0) parts.frontPivots.push(piv);
  }
  parts.G = { ...parts.G, wr: parts.pivots[0].position.y, wx: Math.abs(parts.pivots[0].position.x), wz: Math.abs(parts.pivots[0].position.z) };
  parts.glb = true;
}

// Coaxial NASA Ingenuity-style helicopter: scaled to the old rotor span, rotors re-pivoted to spin about +Y.
export function buildGlbHeli(parts, color) {
  const o = GLB.heli.clone(true); o.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(o), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const k = 19 / Math.max(size.x, size.z);
  const holder = new THREE.Group(); holder.scale.setScalar(k); holder.position.set(-c.x * k, -box.min.y * k + 0.2, -c.z * k); holder.add(o);
  parts.tilt.add(holder); holder.updateMatrixWorld(true);
  const tint = new THREE.Color(color);
  o.traverse(m => { if (m.isMesh && m.material && /foil|gold/i.test(m.material.name)) { m.material = m.material.clone(); m.material.color.copy(tint).lerp(new THREE.Color(0xffffff), 0.15); m.material.metalness = 0.55; m.material.roughness = 0.35; } });
  for (const nm of ['rotors_01', 'rotors_02']) {
    const r = o.getObjectByName(nm); if (!r) continue;
    const rb = new THREE.Box3().setFromObject(r), rc = rb.getCenter(new THREE.Vector3());
    const piv = new THREE.Group(); parts.tilt.worldToLocal(rc); piv.position.copy(rc); parts.tilt.add(piv); piv.updateMatrixWorld(true);
    piv.attach(r);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(7.6, 7.6, 0.05, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, depthWrite: false })); piv.add(disc);
    parts.rotors.push(piv);
  }
  parts.mainRotor = parts.rotors[0]; parts.glb = true;
}

// v3.7: Sketchfab two-wheelers (moto / kick scooter). Orientation is normalised to forward +X, ground y=0, axles centred
// on x=0 and scaled so the wheelbase matches the old hitbox (2·G.wx). Tyres are auto-detected (ground-touching, round
// in side view, one per end); every mesh inside a tyre's bounds moves onto a spinning wheel group under the pivot.
const TWO_CFG = { moto: { rotY: Math.PI / 2 }, scooter: { rotY: Math.PI, maxH: 9.6 } }; // scooter: keep handlebar at the old 9.4-unit height
export function buildGlbTwo(parts, model, color) {
  const cfg = TWO_CFG[model], G = parts.G, o = GLB[model].clone(true);
  const holder = new THREE.Group(); holder.rotation.y = cfg.rotY; holder.add(o); parts.flip.add(holder); holder.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(parts.flip.matrixWorld).invert();
  const boxOf = m => new THREE.Box3().setFromObject(m, true).applyMatrix4(inv);
  const all = new THREE.Box3().setFromObject(holder, true).applyMatrix4(inv), H = all.max.y - all.min.y;
  const meshes = []; o.traverse(m => { if (m.isMesh) meshes.push([m, boxOf(m)]); });
  const midX = (all.min.x + all.max.x) / 2, tyres = [null, null];
  for (const [m, b] of meshes) { const sx = b.max.x - b.min.x, sy = b.max.y - b.min.y;
    if (b.min.y - all.min.y > 0.06 * H || sy < 0.1 * H || sy > 0.6 * H || sx / sy < 0.8 || sx / sy > 1.25) continue;
    const end = (b.min.x + b.max.x) / 2 > midX ? 0 : 1; if (!tyres[end] || sy > tyres[end][1].max.y - tyres[end][1].min.y) tyres[end] = [m, b]; }
  const cF = tyres[0][1].getCenter(new THREE.Vector3()), cR = tyres[1][1].getCenter(new THREE.Vector3());
  const k = Math.min((2 * G.wx) / (cF.x - cR.x), (cfg.maxH || 99) / H), mid = (cF.x + cR.x) / 2;
  holder.scale.setScalar(k); holder.position.set(-mid * k, -all.min.y * k, -all.min.z * k - (all.max.z - all.min.z) * k / 2);
  holder.updateMatrixWorld(true);
  const radii = [];
  tyres.forEach(([tm, tb0], idx) => {
    const tb = boxOf(tm), c = tb.getCenter(new THREE.Vector3()), R = (tb.max.y - tb.min.y) / 2, pad = R * 0.06; radii.push(R);
    const lim = tb.clone().expandByVector(new THREE.Vector3(pad, pad, pad));
    const piv = new THREE.Group(); piv.position.copy(c); piv.userData.baseY = c.y; parts.flip.add(piv);
    const w = new THREE.Group(); piv.add(w); piv.updateMatrixWorld(true);
    for (const [m] of meshes) { const b = boxOf(m); if (lim.containsBox(b)) w.attach(m); }
    parts.wheels.push(w); parts.pivots.push(piv); if (idx === 0) parts.frontPivots.push(piv);
  });
  parts.G = { ...G, wr: (radii[0] + radii[1]) / 2 };
  o.traverse(m => { if (m.isMesh) { m.castShadow = true; if (m.material) m.material.envMapIntensity = 0.8; } });
  parts.glb = true;
}

// v3.7: Sketchfab quadcopter, forward +X, ~15 units across (old drone frame), four propellers re-pivoted to spin about +Y.
export function buildGlbDrone(parts, color) {
  const o = GLB.drone.clone(true); const holder = new THREE.Group(); holder.rotation.y = Math.PI / 2; holder.add(o); parts.tilt.add(holder); holder.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(parts.tilt.matrixWorld).invert();
  const box = new THREE.Box3().setFromObject(holder, true).applyMatrix4(inv), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const k = 15 / Math.max(size.x, size.z);
  holder.scale.setScalar(k); holder.position.set(-c.x * k, -box.min.y * k + 0.25, -c.z * k); holder.updateMatrixWorld(true);
  const props = []; o.traverse(m => { if (m.isMesh && /propeller\d/i.test(m.name + ' ' + (m.parent?.name || ''))) props.push(m); });
  for (const r of props) {
    const rb = new THREE.Box3().setFromObject(r, true).applyMatrix4(inv), rc = rb.getCenter(new THREE.Vector3()), rs = rb.getSize(new THREE.Vector3());
    const piv = new THREE.Group(); piv.position.copy(rc); parts.tilt.add(piv); piv.updateMatrixWorld(true); piv.attach(r);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(rs.x, rs.z) / 2, Math.max(rs.x, rs.z) / 2, 0.05, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, depthWrite: false })); piv.add(disc);
    parts.rotors.push(piv);
  }
  const dm = new Map(); o.traverse(m => { if (m.isMesh) { m.castShadow = true; if (!dm.has(m.material)) { const c = m.material.clone(); c.color.multiplyScalar(0.8); c.envMapIntensity = 0.6; dm.set(m.material, c); } m.material = dm.get(m.material); } }); // tame white-plastic bloom
  // racer-colour accent strip on top + nav LEDs (front green / rear red)
  const acc = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.25, 0.9), new THREE.MeshStandardMaterial({ color, roughness: 0.4 })); acc.position.set(-0.4, size.y * k * 0.62 + 0.25, 0);
  parts.tilt.add(acc);
  parts.glb = true;
}
