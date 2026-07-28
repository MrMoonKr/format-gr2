import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export function createControls(camera, domElement)
{
    const controls = new OrbitControls(camera, domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.8;
    controls.screenSpacePanning = true;
    controls.minDistance = 0.01;
    controls.maxDistance = 50000;
    return controls;
}
