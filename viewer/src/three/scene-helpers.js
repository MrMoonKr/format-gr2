import * as THREE from "three";

/**
 * Reference grid and axes. Independent of material/lighting mode — visible
 * (and correctly unlit) whether the loaded mesh uses the unlit wireframe
 * material or the lit EVE PBR material.
 */
export function createSceneHelpers(scene)
{
    const grid = new THREE.GridHelper(2000, 200, 0x6b7280, 0x384054);
    const axes = new THREE.AxesHelper(200);

    scene.add(grid, axes);

    return { grid, axes };
}
