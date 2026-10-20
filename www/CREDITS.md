# Credits – Tiny Zoom

## Game content
All 3D models (vehicles, house, garden, props), textures, icons, sounds and UI art in Tiny Zoom are **original**:
built procedurally in code (Three.js geometry + HTML canvas–generated textures) for this project.
No third-party models, textures or game assets are used. No real-world brands, logos or car trademarks.

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

Motorcycle, scooter and drone remain original procedural models: no CC0 / CC-BY-4.0 model of sufficient realism was
obtainable from a direct-download source (Sketchfab downloads require an API token; Poly Pizza candidates were CC-BY 3.0
or very low-poly).

Decoder: `vendor/addons/libs/meshopt_decoder.module.js` – meshoptimizer, MIT © Arseny Kapoulkine. GLTFLoader – three.js, MIT.
