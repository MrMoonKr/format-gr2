import * as THREE from "three";

/**
 * Sun + key/fill/rim direct lights and a sky-tinted ambient term, matching
 * `pbr_lighting.glsl` / `gl_renderer.py`'s defaults in the sibling
 * eve-res-explorer project (static — that project's slow light-orbit
 * animation isn't replicated here). `Object3D.position` doubles as "the
 * direction toward the light" for a directional light aimed at the origin,
 * which is the same vector the reference shader's `u_*_direction` uniforms
 * hold.
 */
// Directional-light lighting math only cares about direction, so the unit
// vectors above would work as `.position` unchanged — but `DirectionalLightHelper`
// draws its plane/line at the literal `.position`, and GR2 ships run from
// tens (fighters) to thousands (titans/dreadnoughts) of units across. At
// magnitude ~1 the helpers render essentially at the scene origin, buried
// inside every loaded model. This distance is a fixed debug-visualization
// scale (not tied to whatever asset is currently loaded), sized for the
// mid/large ships in the local test catalogue.
const LIGHT_HELPER_DISTANCE = 1200;
const LIGHT_HELPER_SIZE = 200;

export function createEveLighting(scene)
{
    const sun = new THREE.DirectionalLight(new THREE.Color(1.15, 1.08, 0.92), 1);
    sun.position.set(0.38631, 0.77262, 0.50789).multiplyScalar(LIGHT_HELPER_DISTANCE);

    const key = new THREE.DirectionalLight(new THREE.Color(0.72, 0.68, 0.60), 1);
    key.position.set(0.45, 0.58, 0.68).multiplyScalar(LIGHT_HELPER_DISTANCE);

    const fill = new THREE.DirectionalLight(new THREE.Color(0.34, 0.40, 0.56), 1);
    fill.position.set(-0.62, 0.30, -0.50).multiplyScalar(LIGHT_HELPER_DISTANCE);

    const rim = new THREE.DirectionalLight(new THREE.Color(0.48, 0.50, 0.58), 1);
    rim.position.set(-0.20, 0.72, 0.66).multiplyScalar(LIGHT_HELPER_DISTANCE);

    const ambient = new THREE.AmbientLight(new THREE.Color(0.18, 0.22, 0.30), 0.25);

    scene.add(sun, key, fill, rim, ambient);

    // DirectionalLightHelper renders the light position, aim line, and
    // target plane. Keep the helpers in one group so UI code can toggle
    // them without changing the actual lighting setup. Ambient light has no
    // position or direction, so it deliberately has no spatial helper.
    const helpers = new THREE.Group();
    helpers.name = "EVE light helpers";
    helpers.add(
        new THREE.DirectionalLightHelper(sun, LIGHT_HELPER_SIZE, 0xffdc85),
        new THREE.DirectionalLightHelper(key, LIGHT_HELPER_SIZE, 0xffd6a0),
        new THREE.DirectionalLightHelper(fill, LIGHT_HELPER_SIZE, 0x79a8ff),
        new THREE.DirectionalLightHelper(rim, LIGHT_HELPER_SIZE, 0xc4ccff)
    );
    for (const helper of helpers.children) helper.update();
    scene.add(helpers);

    return { sun, key, fill, rim, ambient, helpers };
}
