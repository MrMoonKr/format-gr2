import * as THREE from "three";

/**
 * EVE's Trinity material graph never carries a resolvable in-file texture
 * path (it's a Maya-exported shading node tree). Every PBR channel instead
 * resolves by filename convention next to the source model:
 * `{model_stem}_a/_n/_m/_d/_r/_g/_p3.dds` (albedo/normal/material-mask/
 * dirt/roughness/glow/canopy-mask) — verified against the local
 * resource-explorer's `_PBR_TEXTURE_SUFFIXES` and `skinned_mesh.frag.glsl`.
 */
const PBR_TEXTURE_SUFFIXES = Object.freeze({
    baseColor: "_a",
    normal: "_n",
    materialMask: "_m",
    dirt: "_d",
    roughness: "_r",
    glow: "_g",
    paint3: "_p3"
});

/**
 * URL-loaded test asset에서 지정할 수 있는 EVE 텍스처 채널입니다.
 * 누락한 키는 GR2 파일명 기반의 인접 사이드카 경로를 사용합니다.
 *
 * @typedef {Partial<Record<keyof typeof PBR_TEXTURE_SUFFIXES, string>>} EveTextureUrls
 */

/**
 * 로드가 성공한 채널은 Three.js 텍스처이고, 파일이 없는 채널은 null입니다.
 *
 * @typedef {Record<keyof typeof PBR_TEXTURE_SUFFIXES, THREE.Texture | null>} EveTextures
 */

const textureLoader = new THREE.TextureLoader();

/**
 * @param {string} gr2Url
 * @param {string} suffix
 * @returns {string}
 */
function sidecarUrl(gr2Url, suffix)
{
    return gr2Url.replace(/\.gr2$/i, `${suffix}.dds.png`);
}

/**
 * @param {string} url
 * @returns {Promise<THREE.Texture | null>}
 */
function loadTextureOrNull(url)
{
    return new Promise((resolve) =>
    {
        textureLoader.load(
            url,
            (texture) =>
            {
                // The reference GL renderer uploads every PBR channel as
                // plain RGBA (no sRGB decode) and gamma-encodes once at the
                // very end of the shader. Three's default SRGBColorSpace on
                // `.map` would double-decode relative to that; NoColorSpace
                // keeps texel values raw so the shared PBR math matches.
                texture.colorSpace = THREE.NoColorSpace;
                // Ship UVs are not restricted to the [0, 1] atlas square:
                // ac1_t1 reaches 3.65. The reference renderer explicitly
                // uses GL_REPEAT for both axes, while Three defaults to
                // ClampToEdgeWrapping; clamping made repeated UV islands
                // sample only the border texel.
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                // The decoded PNG row order is the one used by the reference
                // OpenGL upload. GR2 texcoord0 is passed through unchanged.
                texture.flipY = false;
                texture.needsUpdate = true;
                resolve(texture);
            },
            undefined,
            () => resolve(null)
        );
    });
}

/**
 * Resolve and load the sidecar PBR texture set next to `gr2Url`. Missing
 * files (most local assets only have some of the seven channels) resolve
 * to `null` rather than rejecting the whole set.
 *
 * @param {string} gr2Url URL the .gr2 itself was fetched from.
 * @param {EveTextureUrls} [textureUrls] Explicit sidecar URLs from the local
 * test-asset catalogue. Omitted channels use the filename convention.
 * @returns {Promise<EveTextures>}
 */
export async function loadEveTextures(gr2Url, textureUrls = {})
{
    const entries = await Promise.all(
        Object.entries(PBR_TEXTURE_SUFFIXES).map(async ([ key, suffix ]) =>
            [ key, await loadTextureOrNull(textureUrls[key] ?? sidecarUrl(gr2Url, suffix)) ]
        )
    );
    return /** @type {EveTextures} */ (Object.fromEntries(entries));
}
