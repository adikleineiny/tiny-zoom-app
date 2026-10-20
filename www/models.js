// v3.6: licensed, locally bundled glTF vehicle models (see CREDITS.md). Procedural models stay as fallback.
import * as THREE from './three.module.min.js';
import { GLTFLoader } from './addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from './addons/libs/meshopt_decoder.module.js';

export const GLB = { racecar: null, racecar_lod: null, heli: null };
export const MODEL_FILES = { racecar: 'models/racecar.glb', heli: 'models/heli.glb', racecar_lod: 'models/racecar_lod.glb' };
let enabled = true;
export function setModelsEnabled(v) { enabled = !!v; }
export const glbFor = m => (enabled && GLB[m]) || null;
export function preloadModels() {
  const L = new GLTFLoader(); L.setMeshoptDecoder(MeshoptDecoder);
  return Promise.all(Object.entries(MODEL_FILES).map(([k, url]) => new Promise(res => L.load(url, g => {
    g.scene.traverse(o => { if (o.isMesh && o.material && o.material.transmission > 0) { // transmission = extra full-scene pass: use cheap tinted glass
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
