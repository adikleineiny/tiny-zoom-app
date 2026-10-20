# Credits – Tiny Zoom

## Game content
Track, house, garden, props, textures, icons, sounds and UI art in Tiny Zoom are **original**:
built procedurally in code (Three.js geometry + HTML canvas–generated textures) for this project.
The only third-party assets are the five vehicle models listed below (CC0 / public domain / CC BY 4.0).

## Software libraries (code, bundled locally – no CDN)
| Library | Files | License | Source |
|---|---|---|---|
| three.js r160 | `vendor/three.module.min.js` | MIT © 2010-2023 three.js authors | https://github.com/mrdoob/three.js |
| three.js examples (post-processing: EffectComposer, RenderPass, UnrealBloomPass, OutputPass, ShaderPass, MaskPass, Pass, Copy/LuminosityHighPass/Output shaders) | `vendor/addons/` | MIT (same as three.js, see `vendor/addons/LICENSE`) | https://unpkg.com/three@0.160.0/examples/jsm/ |

## v3.6 third-party 3D models

| Asset | Used for | Author / owner | License | Source |
|---|---|---|---|---|
| **Toy Car** (glTF Sample Asset) | Race car | Guido Odendahl (initial model), Eric Chadwick (extensions, scene) | **CC0 1.0** (public domain) | https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/ToyCar |
| **Ingenuity Mars Helicopter** 3D model | Helicopter | NASA / JPL-Caltech | **Public domain** – NASA material is not protected by copyright in the U.S. (NASA media usage guidelines); no NASA insignia used, no endorsement implied | https://science.nasa.gov/resource/mars-ingenuity-helicopter-3d-model/ (file 25043_Ingenuity_v3.glb) |

Modifications (both): converted to game scale/orientation, wheels (car) split into separate pivoted nodes / rotors (heli) re-pivoted
so they can animate, display cloth and cameras removed (car), mesh simplified (car ≈108k → 43.5k tris), textures re-encoded
to WebP ≤1K, meshopt-compressed. Paint is recoloured at runtime per racer.

## v3.7 third-party 3D models (Sketchfab, CC BY 4.0 – attribution required)

| Asset (exact title) | Used for | Author | License | Source |
|---|---|---|---|---|
| **Motorcycle** | Motorcycle | animanyarty | **CC BY 4.0** (https://creativecommons.org/licenses/by/4.0/) | https://sketchfab.com/3d-models/motorcycle-38404e2077ca4b209cd2f1db30541b94 |
| **Electric Scooter (Low-poly, game-ready)** | Scooter | Delandi (delandi) | **CC BY 4.0** (https://creativecommons.org/licenses/by/4.0/) | https://sketchfab.com/3d-models/electric-scooter-low-poly-game-ready-e22bffc784b04a93acc83599fa7a81c0 |
| **Quadcopter drone** | Drone | Annelida | **CC BY 4.0** (https://creativecommons.org/licenses/by/4.0/) | https://sketchfab.com/3d-models/quadcopter-drone-ca8f0f70a1014e77a6777dc248e9bf5a |

Modifications (all three): re-oriented to forward +X, scaled to the existing hitboxes, ground/pivot normalised;
motorcycle & scooter wheels split at runtime onto spinning (front: steering) pivots; drone propellers re-pivoted
to spin about their hubs with blur discs, transmissive plastics made opaque; textures re-encoded to WebP ≤1K;
motorcycle simplified (~98.5k → ~42k tris); meshopt-compressed. Downloaded via the Sketchfab Data API (v3).
These works are licensed under CC BY 4.0 by their authors; no endorsement by the authors is implied.

Decoder: `vendor/addons/libs/meshopt_decoder.module.js` – meshoptimizer, MIT © Arseny Kapoulkine. GLTFLoader – three.js, MIT.
