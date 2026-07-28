import * as THREE from "three";

/**
 * Rotating cube shown before any GR2 asset is loaded. It has no dependency
 * on GR2 data or the adapter pipeline, so it isolates "the renderer isn't
 * drawing anything" from "the GR2 scene graph didn't render" when the
 * viewport appears blank.
 */
export function createPlaceholderCube()
{
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const material = new THREE.MeshNormalMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "placeholder-cube";

    function update(delta)
    {
        mesh.rotation.x += delta * 0.6;
        mesh.rotation.y += delta * 0.9;
    }

    function dispose()
    {
        geometry.dispose();
        material.dispose();
    }

    return { mesh, update, dispose };
}
