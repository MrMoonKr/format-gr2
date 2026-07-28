import * as THREE from "three";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";

const rgbeLoader = new RGBELoader();

/**
 * Load an equirectangular HDRI and PMREM-prefilter it for image-based
 * lighting/reflections. Mirrors the sibling eve-res-explorer project's
 * roughness-selected-mip approach (`ibl_environment.py`); Three's
 * `PMREMGenerator` does the equivalent convolution instead of a hand-rolled
 * box-filtered cubemap mip chain.
 *
 * @param {THREE.WebGLRenderer} renderer
 * @param {string} url .hdr equirectangular panorama URL.
 * @returns {Promise<THREE.Texture>} PMREM environment texture for
 *   `scene.environment` / `material.envMap`.
 */
export function loadEnvironment(renderer, url)
{
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    return new Promise((resolve, reject) =>
    {
        rgbeLoader.load(
            url,
            (hdrTexture) =>
            {
                const renderTarget = pmremGenerator.fromEquirectangular(hdrTexture);
                hdrTexture.dispose();
                pmremGenerator.dispose();
                resolve(renderTarget.texture);
            },
            undefined,
            (error) =>
            {
                pmremGenerator.dispose();
                reject(error);
            }
        );
    });
}
