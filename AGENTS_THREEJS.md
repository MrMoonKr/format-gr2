# Three.js Viewer Guide

This document defines the design and local debugging conventions for the
browser viewer. Keep the viewer as a separate single-page application under
`viewer/`; do not mix its browser-only dependencies or UI code into the GR2
decoder library.

## Application layout

```text
viewer/
├─ package.json
├─ webpack.config.cjs
├─ public/
│  └─ index.html
└─ src/
   ├─ main.js                 # application entry point
   ├─ app.js                  # application composition and state wiring
   ├─ styles/main.css
   ├─ three/
   │  ├─ create-viewer.js     # renderer, scene, camera, resize lifecycle
   │  ├─ controls.js          # OrbitControls setup
   │  ├─ scene-helpers.js     # grid and axes helper (mode-independent)
   │  ├─ eve-lighting.js      # sun/key/fill/rim + ambient PBR light rig
   │  ├─ environment.js       # HDRI -> PMREM environment map for IBL
   │  ├─ fit-camera.js        # frame an Object3D using its bounds
   │  └─ dispose.js           # release Three.js GPU resources
   ├─ gr2/
   │  ├─ load-gr2.js          # File/ArrayBuffer -> CjsFormatGr2 output
   │  ├─ load-eve-textures.js # resolve+load the _a/_n/_m/_d/_r/_g/_p3 sidecar set
   │  ├─ gr2-to-three.js      # public GR2 -> Object3D adapter
   │  ├─ create-geometry.js   # mesh vertex/index data -> BufferGeometry
   │  ├─ create-materials.js  # wireframe material + EVE PBR MeshPhysicalMaterial
   │  ├─ create-skeleton.js   # GR2 skeleton -> Bone/Skeleton/SkinnedMesh,
   │  │                       # owns model<->mesh<->skeleton resolution and
   │  │                       # bone-binding index remap (see below)
   │  ├─ create-morphs.js     # GR2 morph targets -> morphAttributes, owns
   │  │                       # delta/absolute and sparse-target normalization
   │  └─ create-animations.js # GR2 transform curves -> AnimationClip
   ├─ ui/
   │  ├─ file-drop.js
   │  ├─ sidebar.js
   │  ├─ timeline.js
   │  ├─ inspector.js
   │  └─ status.js
   └─ state/
      └─ viewer-state.js
```

## Boundaries

- `gr2/` converts decoded data only. It must not manipulate the DOM.
- `three/` owns the renderer, scene graph, render loop, and disposal.
- `ui/` owns DOM controls and must not interpret GR2 geometry.
- `state/` holds selected objects, loading/error state, and animation mixer
  state. Do not use module-global mutable state for those values.
- `app.js` is the only layer that wires UI events to loading and scene actions.

During local development, load the in-repository decoder directly:

```js
import CjsFormatGr2 from "../../../src/index.js";
```

Replace this with `@carbonenginejs/format-gr2` only when testing the published
package. Direct imports keep decoder source breakpoints debuggable.

## GR2 to Three.js mapping

Read files using options appropriate for rendering:

```js
const reader = new CjsFormatGr2({
    unpackTangents: true,
    rebuildMissingNormals: true
});
const gr2 = reader.Read(arrayBuffer);
```

Map the decoded graph as follows:

| GR2 field | Three.js target |
| --- | --- |
| `vertex.position` | `position`, item size 3 |
| `vertex.normal` | `normal`, item size 3 |
| `vertex.texcoord0` | `uv`, item size 2 |
| unpacked `vertex.tangent` + `vertex.binormal` | synthesized `tangent`, item size 4 (see below) |
| `indices[].faces` (per `IndexGroup`) | concatenated index buffer + `BufferGeometry` material groups (see below) |
| remapped `blendIndice` | `skinIndex`, item size 4 (see below) |
| `blendWeight`, or synthesized `[1,0,0,0]` when absent | `skinWeight`, item size 4 (see below) |
| `skeleton.bones` | `Bone[]` and `Skeleton` |
| morph targets | `geometry.morphAttributes` (see below) |
| animation transform tracks | sampled `AnimationClip` tracks |

Start with static geometry, normals, and UVs rendered using a double-sided
yellow wireframe material against a dark blue background — thin wireframe
lines need strong luminance contrast to stay visible against real GPU
antialiasing, which a dark-on-light or low-contrast pairing does not
reliably survive. Add lighting and EVE/Trinity material handling only after
geometry is visually verified.
Implement skinning, morph targets, and animation as independent adapter modules.

The adapter must own any required coordinate-system, UV-axis, quaternion-order,
and bind-pose conversion. Validate each rule against real assets; do not spread
axis flips or transform corrections through UI code.

### LOD selection

`Model.meshBindings` can contain several meshes for the same logical shape at
different levels of detail. The initial viewer must render only the highest
detail mesh in each trailing-name group such as `Shape`, `Shape LOD 640`, and
`Shape LOD 320`; rendering every bound LOD at once creates overlapping
geometry. Add `THREE.LOD` distance switching only when the basic viewer is
otherwise stable.

### Tangent frame reconstruction

For meshes whose packed CCP tangent frames were decoded by `unpackTangents`,
the resulting `normal`, `tangent`, and `binormal` channels each have item size
3. Authored tangent channels may retain their original component count.
Three.js's `tangent` attribute is item size 4, with `w` carrying handedness.
`create-geometry.js` must
synthesize `w` itself, for example
`sign(dot(cross(normal, tangent), binormal))`, rather than assuming a
pass-through 4th component. Skip normal-map-dependent verification until this
sign is confirmed against a real asset; a wrong sign shows up as inverted
normal-map lighting, not a crash.

### Multi-group index concatenation

`Mesh.indices` is an array of `IndexGroup`, one per material subset, all
indexing into the same shared `Mesh.vertex` channels. `create-geometry.js`
must concatenate every group's `faces` into one `BufferGeometry` index
buffer and record `{ start, count, materialIndex }` per group via
`addGroup`. Do not treat a mesh as always having a single `IndexGroup`.

### Bone-binding index remap

`blendIndice` values index into the *mesh's own* `boneBindings` array
(`boneBindings[i].name`), not directly into `skeleton.bones`. A mesh also
does not point at its skeleton directly — resolve it through
`model.meshBindings` (indices into the file's `meshes` array) to find which
`Model`/`Skeleton` owns a given mesh. `create-skeleton.js` must, per mesh:
build a lookup from `boneBindings[i].name` to that skeleton's `bones` index,
then rewrite every `blendIndice` value through that lookup before it becomes
`skinIndex`. Skipping this remap will silently mis-skin any asset whose
mesh-local bone order differs from the skeleton's bone order, which is
common for EVE ship meshes bound to a bone subset. Bone `position`,
`orientation`, and `scaleShear` are individually optional per the GR2 JSON
graph — default missing ones to identity rather than assuming presence.

After adding the rest-pose bone roots to their model group, call
`modelGroup.updateMatrixWorld(true)` before `SkinnedMesh.bind()`. Three.js
derives inverse bind matrices from `bone.matrixWorld`; binding before that
update records identity inverses and makes vertices fly apart as animation
tracks apply.

### Skinned animation bind-pose verification

GR2 transform-track values are local bone transforms. For the Rogue Drone
`NormalLoop` sample, the first decoded position/orientation key matches the
corresponding skeleton rest transform; feed those values directly into the
matching Three.js `Bone` position and quaternion tracks.

The required construction order is:

1. Create the complete `Bone` parent/child hierarchy using the GR2 rest
   transforms.
2. Add every root bone to the model group.
3. Call `modelGroup.updateMatrixWorld(true)`.
4. Create the `SkinnedMesh` and call `mesh.bind(skeleton)`.
5. Create and play `AnimationClip` tracks against those same named bones.

Do not bind before step 3. When that happens, Three.js records identity inverse
bind matrices and animated vertices receive a full bone transform a second
time. The visible symptom is limbs or hull sections stretching far away from
the skeleton helper instead of following it.

Regression check: after loading an animated skinned asset at rest,
`skinnedMesh.applyBoneTransform(vertexIndex, basePosition)` should reproduce
the original base position within a small floating-point tolerance. At least
one non-root `skeleton.boneInverses` matrix must be non-identity.

`vertex.blendWeight` is not a reliable signal for "this mesh is skinned."
Rogue drone assets carry a populated `blendIndice` (one bone per vertex, in
its first component) with an entirely empty `blendWeight` channel — rigid
per-vertex skinning, not smooth blending, but still animated per-bone and
still wrong if treated as a single whole-mesh rigid attachment. Branch on
`blendIndice.length` to decide `SkinnedMesh` vs. whole-mesh attachment, and
synthesize `[1, 0, 0, 0]` weights when `blendWeight` is absent — see
`gr2-to-three.js`'s `attachModelMeshes` for the three shapes this can take.

### Morph target normalization

A `MorphTarget` is not always a ready-to-use delta buffer. `dataIsDeltas:
false` targets store absolute attribute values and must be converted to
deltas by subtracting the mesh's base `vertex` channels. Sparse targets
additionally carry `vertexIndices` and must be expanded to the mesh's full
vertex count (zero-filled elsewhere) before becoming a
`geometry.morphAttributes` entry. `create-morphs.js` owns both conversions;
do not assume every target is already a dense additive delta.

When replacing a loaded scene, call the disposal helper for every geometry,
material, texture, render target, and animation resource no longer in use.

### EVE PBR material

GR2 carries no material definitions at all — every real ship's `.gr2`
material graph is a Maya-exported shading node tree with a null
`Texture.FromFileName`. EVE's Trinity textures resolve by filename
convention next to the model instead: `{model_stem}_a/_n/_m/_d/_r/_g/_p3.dds`
(albedo/normal/material-mask/dirt/roughness/glow/canopy-mask). This
convention and the channel semantics below are ported from the sibling
eve-res-explorer project's `_PBR_TEXTURE_SUFFIXES` and
`shaders/skinned_mesh.frag.glsl`, both verified there against real ship
assets — `load-eve-textures.js` resolves the sidecar URLs, `create-materials.js`'s
`createEveMaterial` builds the `MeshPhysicalMaterial`.

Three's built-in material slots cover four of the seven channels directly,
so most of this needs no custom shader code:

- `_a` (albedo) -> `map`. `alphaTest: 0.1` matches the reference's cutout
  discard.
- `_n` (normal) -> `normalMap`, loaded with `texture.format = THREE.RGFormat`.
  This format decodes with a flat blue channel; setting it tells Three to
  take its built-in packed-normal path (`USE_PACKED_NORMALMAP`), which
  reconstructs Z the same way the reference shader does by hand instead of
  reading a meaningless stored Z. `normalScale.y` is negated for the
  DirectX/OpenGL green-channel convention. Rogue Drone Heavy/Light/Medium
  provide verified local examples: their `_n.dds.png` files have B fixed at 0
  and R/G spanning 0..255, which confirms packed-RG normal encoding. The
  currently catalogued Amarr files do not ship a matching `_n.dds.png`, so
  their configured normal URLs intentionally resolve to `null` until those
  sidecars are available.
- `_r` (roughness) -> `roughnessMap` (Three samples its G channel; the
  source is a flat grayscale PNG so R/G/B already agree).
- `_g` (glow) -> `emissiveMap` with `emissive` white and
  `emissiveIntensity` 1, equivalent to the reference's neutral-tint glow
  defaults.

`_m` (material mask), `_d` (dirt), and `_p3` (canopy/glass mask) have no
built-in slot and are injected via `onBeforeCompile` right after
`metalnessmap_fragment`/`roughnessmap_fragment` run — both already computed
`roughnessFactor`/`metalnessFactor`, and `lights_physical_fragment` (which
reads those plus `diffuseColor` into the lit material) hasn't yet:

- `_m` has four principal tones (0/85/171/255 — read from its R channel).
  The endpoints select dielectric vs. a gold-toned metal slot; the two
  middle tones are authored metal variants that also override roughness.
- `_d` is a low-contrast RGB dirt/soot map. Dirt in each channel attenuates
  the matching albedo channel and pushes roughness toward matte, rather
  than collapsing the whole map to one maximum darkening value.
- `_p3` isolates a small canopy/cockpit-glass region (confirmed in the
  reference project by debug-rendering it alone: it lands exactly on the
  canopy's UV island). Blend toward a dark, low-roughness dielectric via
  alpha so whatever renders behind it shows through, rather than reading as
  flat painted plastic.

Textures load with `colorSpace = THREE.NoColorSpace`: the reference GL
renderer uploads every channel as plain RGBA with no sRGB decode and
gamma-encodes once at the very end of the shader. Three's default
`SRGBColorSpace` on `.map` would decode `_a` a second time and wash out the
result. `renderer.toneMapping = THREE.ReinhardToneMapping` matches that same
shader's manual `x / (x + 1)` operator before its gamma pow. The wireframe
material sets `toneMapped: false` so this doesn't dull its flat debug color.

`eve-lighting.js` reproduces the reference's static sun + key/fill/rim
directional lights and sky-tinted ambient (colors/directions/intensities
copied from `pbr_lighting.glsl` / `gl_renderer.py`'s defaults; that
project's slow light-orbit animation isn't replicated). `environment.js`
PMREM-prefilters an equirectangular HDRI for image-based reflections —
Three's `PMREMGenerator` does the same roughness-selected-mip convolution
the reference's hand-rolled cubemap mip chain approximates. Point
`assets.local.json`'s `envRoot`/`envFile` at a local `.hdr` (also gitignored
— treat these the same as the local model asset catalogue).

**Show light helpers** renders colored `DirectionalLightHelper` outlines for
sun, key, fill, and rim. They are diagnostic-only children of a separate
group, so toggling them never changes the actual light setup. Ambient light
has no position or direction and therefore has no spatial helper.

`DirectionalLight.position` only needs to be a unit-length direction for the
lighting math itself, but `DirectionalLightHelper` draws its plane/line at
that literal position. GR2 ships run from tens (fighters) to thousands
(titans/dreadnoughts) of units across; a unit-magnitude position draws the
helper at essentially the scene origin, buried inside every loaded model and
invisible. `eve-lighting.js` scales each light's position by a fixed
`LIGHT_HELPER_DISTANCE` (not tied to whatever asset is currently loaded) so
the helpers land visibly outside typical ship geometry.

EVE PBR textures only resolve for URL-loaded test assets; a dropped `File`
has no sidecar path to resolve from, and `createEveMaterial` silently falls
back to the wireframe material when no `_a` texture resolved.

Each URL-loaded test asset may also provide a `textures` object keyed by
`baseColor`, `normal`, `materialMask`, `dirt`, `roughness`, `glow`, and
`paint3`. These explicit URLs take precedence; omitted keys still resolve by
the adjacent filename convention. Keep the local test configuration explicit
for repeatable asset coverage.

## Webpack development setup

Viewer development uses a webpack development server and source maps. Configure
the development build with the repository root in its module resolution path so
relative imports to `../../src` are bundled.

```js
module.exports = {
    mode: "development",
    devtool: "eval-source-map",
    devServer: {
        port: 8080,
        hot: true
    }
};
```

`eval-source-map` gives original-source line mappings and fast incremental
rebuilds. Do not enable it in production builds. Emit production assets to
`viewer/dist/`, and keep that generated directory out of version control. The
root `.gitignore` excludes both `viewer/dist/` and the local test-asset
configuration.

## VS Code debugging

Create `.vscode/launch.json` at the repository root. The compound starts the
viewer server and launches Chrome with source-map support.

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Viewer: webpack dev server",
      "type": "node-terminal",
      "request": "launch",
      "command": "npm run dev",
      "cwd": "${workspaceFolder}/viewer"
    },
    {
      "name": "Viewer: Chrome debug",
      "type": "chrome",
      "request": "launch",
      "url": "http://localhost:8080",
      "webRoot": "${workspaceFolder}",
      "sourceMaps": true,
      "skipFiles": [
        "${workspaceFolder}/node_modules/**",
        "<node_internals>/**"
      ]
    }
  ],
  "compounds": [
    {
      "name": "Viewer: debug",
      "configurations": [
        "Viewer: webpack dev server",
        "Viewer: Chrome debug"
      ]
    }
  ]
}
```

Use **Viewer: debug** with F5. Breakpoints should work in both `viewer/src/`
and the repository's `src/` decoder files. If a breakpoint is hollow, verify
that the dev server is running, reload the launched browser, and inspect the
Debug Console for failed source-map resolution.

## Local development test assets

Use the sibling resource-explorer cache's `model/` directory for local
viewer development, with `assetRoot` in `assets.local.json` set to the
shared parent so both subtrees are servable from one static mount:

```text
E:\M-Github-Game\EVE\eve-res-explorer\.cache\dx9\model
├─ ship\amarr        # 7 .gr2 files, rigid whole-mesh bone attachment only
└─ drone\rogue        # 3 .gr2 files, rigid per-vertex skinning (see
                       # "Bone-binding index remap"); good coverage for the
                       # skinning path the Amarr ship hulls never exercise
```

Treat these as local-only validation data.

- Do not copy these source assets into this repository.
- Do not commit them, package them in an npm artifact, or serve them from a
  deployed viewer.
- Keep any local asset catalogue or absolute-path configuration out of Git.
- Use small, self-authored or explicitly redistributable fixtures for committed
  unit tests and CI instead.

For local development, webpack-dev-server may expose the directory under a
development-only URL. Keep the source path in an ignored local config rather
than hard-coding it in the shared webpack configuration. Use JSON, not a
`.js` module, so `webpack.config.cjs` (CommonJS) can `require()` it without an
ESM/CJS interop step:

```json
// viewer/assets.local.json -- gitignored
{
    "assetRoot": "E:/M-Github-Game/EVE/eve-res-explorer/.cache/dx9/model",
    "envRoot": "E:/M-Github-Game/EVE/eve-res-explorer/res",
    "envFile": "rogland_clear_night_4k.hdr",
    "testAssets": [
        {
            "id": "amarr-local-model",
            "label": "Amarr local test model",
            "gr2": "/dev-assets/model/<path-under-assetRoot>.gr2",
            "textures": {}
        }
    ]
}
```

`webpack.config.cjs` reads this file at config-load time and serves
`assetRoot` at `/dev-assets/model/` and `envRoot` (a separate subtree — HDRI
panoramas live under `res/`, not `model/`) at `/dev-assets/env/` via
`devServer.static`. It injects `testAssets` and the env map URL into the
development bundle instead of serving the whole `viewer/` directory merely
to fetch configuration. Viewer code must refer to the resulting URL, not the
filesystem path. `assets.local.example.json` (committed, empty) documents
the shape for new clones to copy from.

Begin validation with one `.gr2` file using the built-in wireframe material.
Once geometry, coordinate conversion, and camera framing are correct, use
**Albedo UV preview** before EVE PBR: it renders only `_a` without mask,
dirt, roughness, lights, or environment effects. This isolates whether a
visible mismatch is genuinely UV-related. Then switch to EVE PBR (see
"EVE PBR material" above) to check the mapped `_a/_n/_m/_d/_r/_g/_p3`
channels against a real asset.

The preview still uses the renderer's display tone mapping. EVE `_a` files
such as `ac1_t1_a` are intentionally near white; bypassing that display step
makes their panel detail clip to white and can falsely look like missing
geometry.

The viewer fixes the proven texture convention rather than exposing flip
controls: decoded PNG rows are uploaded with `texture.flipY = false`, and
GR2 `texcoord0` is passed through unchanged. This matches the sibling
reference renderer. Do not rewrite GR2 UV values unless asset evidence
establishes that the source channel itself is reversed.

Do not assume EVE UVs are contained in the unit atlas square. For example,
`ac1_t1` contains `texcoord0` values through `3.65234375`. Every sidecar
texture must therefore use `THREE.RepeatWrapping` on both axes (matching the
reference renderer's `GL_REPEAT`); Three's default `ClampToEdgeWrapping`
silently turns every UV island beyond 1 into a border-color sample and can
look like only one side of a symmetric hull is mapped.
