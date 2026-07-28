import * as THREE from "three";

/**
 * Frame `object` in `camera` and re-target `controls` on its bounds.
 * EVE ship assets range from meter-scale fighters to kilometer-scale
 * titans, so near/far planes are derived from the object size rather
 * than left at fixed defaults.
 */
export function fitCameraToObject(camera, controls, object, { padding = 1.4 } = {})
{
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return;

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxSize = Math.max(size.x, size.y, size.z) || 1;
    const fitDistance = (maxSize * padding) / (2 * Math.tan((camera.fov * Math.PI) / 360));

    const direction = camera.position.clone().sub(controls.target);
    if (direction.lengthSq() < 1e-8) direction.set(0, 0.35, 1);
    direction.normalize();

    camera.near = Math.max(maxSize / 1000, 0.01);
    camera.far = Math.max(maxSize * 100, 1000);
    camera.updateProjectionMatrix();

    controls.target.copy(center);
    camera.position.copy(center).addScaledVector(direction, fitDistance);
    controls.update();
}
