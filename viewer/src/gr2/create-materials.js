import * as THREE from "three";

/**
 * Wireframe material for geometry/skinning/morph/animation verification.
 * It intentionally avoids EVE/Trinity texture and lighting concerns until
 * positions, indices, LOD selection, and camera framing are verified.
 */
export function createTempMaterial()
{
    return new THREE.MeshBasicMaterial({
        color: 0xffff00,
        wireframe: true,
        // GR2 assets are authored for DirectX conventions. Keep both sides
        // visible until the viewer's coordinate/winding conversion is fixed.
        side: THREE.DoubleSide,
        // Renderer tonemapping is tuned for the EVE PBR material; this flat
        // debug color should stay exactly the yellow it's set to.
        toneMapped: false
    });
}

/**
 * Unlit `_a` preview used to verify UV orientation independently of the
 * Trinity mask, dirt, roughness, lighting, and environment channels.
 */
export function createAlbedoPreviewMaterial(texture)
{
    return new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.DoubleSide,
        alphaTest: 0.1
    });
}

// A referenced-but-unused sampler in dead runtime-`if` GLSL branches still
// needs a bound texture unit on some WebGL implementations even though the
// branch never executes; this stands in for a missing optional channel.
const FALLBACK_TEXTURE = new THREE.DataTexture(new Uint8Array([ 0, 0, 0, 255 ]), 1, 1);
FALLBACK_TEXTURE.needsUpdate = true;

// `_m`/`_d`/`_p3` have no built-in MeshPhysicalMaterial slot, so they're
// injected right after `metalnessmap_fragment`/`roughnessmap_fragment` —
// both already ran, and `lights_physical_fragment` (which reads
// `diffuseColor`/`roughnessFactor`/`metalnessFactor` into the lit material)
// hasn't yet. Ported from `skinned_mesh.frag.glsl` in the sibling
// eve-res-explorer project, verified there against real ship assets.
const EVE_MATERIAL_UNIFORM_DECLARATIONS = `
uniform sampler2D tMaterialMask;
uniform bool uUseMaterialMask;
uniform sampler2D tDirt;
uniform bool uUseDirt;
uniform sampler2D tPaint3;
uniform bool uUsePaint3;
void main() {`;

const EVE_MATERIAL_MASK_LOGIC = `
	// \`_m\` has four principal tones (0, 85, 171, 255): dielectric/metal
	// endpoints plus two authored metal variants, each overriding roughness.
	if ( uUseMaterialMask ) {
		float eveMaskValue = texture2D( tMaterialMask, vMapUv ).r;
		if ( eveMaskValue < 0.166 ) {
			metalnessFactor = 0.0;
			diffuseColor.rgb = vec3( 1.0, 1.0, 1.0 );
		} else if ( eveMaskValue < 0.500 ) {
			metalnessFactor = 0.80;
			diffuseColor.rgb = vec3( 0.31, 0.31, 0.31 );
			roughnessFactor = 0.25;
		} else if ( eveMaskValue < 0.834 ) {
			metalnessFactor = 0.85;
			diffuseColor.rgb = vec3( 0.10, 0.10, 0.10 );
			roughnessFactor = 0.28;
		} else {
			metalnessFactor = 1.0;
			diffuseColor.rgb = vec3( 0.83, 0.60, 0.18 );
			roughnessFactor = 0.14;
		}
	}
	// \`_d\` is a low-contrast RGB dirt/soot map. Preserve the authored
	// channel values: dirt attenuates the matching albedo channel instead
	// of collapsing the map to one maximum value.
	if ( uUseDirt ) {
		vec3 eveDirtTexel = texture2D( tDirt, vMapUv ).rgb;
		vec3 eveDirtAmount = smoothstep( vec3( 0.02 ), vec3( 0.45 ), eveDirtTexel );
		diffuseColor.rgb *= mix( vec3( 1.0 ), vec3( 0.28 ), eveDirtAmount );
		float eveDirtRoughness = dot( eveDirtAmount, vec3( 0.2126, 0.7152, 0.0722 ) );
		roughnessFactor = mix( roughnessFactor, 0.92, eveDirtRoughness );
	}
	// \`_p3\` isolates a small canopy/cockpit-glass region. A dark,
	// low-roughness dielectric blended via alpha reads as glass rather
	// than painted plastic.
	if ( uUsePaint3 ) {
		float eveCanopy = texture2D( tPaint3, vMapUv ).r;
		float eveCanopyAmount = smoothstep( 0.10, 0.40, eveCanopy );
		diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.05, 0.14, 0.12 ), eveCanopyAmount );
		diffuseColor.a = mix( diffuseColor.a, 0.3, eveCanopyAmount );
		metalnessFactor = mix( metalnessFactor, 0.0, eveCanopyAmount );
		roughnessFactor = mix( roughnessFactor, 0.08, eveCanopyAmount );
	}
`;

/**
 * Build a MeshPhysicalMaterial for one GR2 mesh from its resolved EVE PBR
 * texture set (see load-eve-textures.js). Falls back to the wireframe
 * material when no base color texture resolved — there's nothing to
 * texture-map without it.
 *
 * Channel handling:
 *  - `baseColor` (_a) -> `map`; `alphaTest` matches the reference's cutout.
 *  - `normal` (_n) -> `normalMap`, loaded as `RGFormat` so Three's built-in
 *    packed-normal path reconstructs Z the same way the reference shader
 *    does by hand (confirmed necessary there: this format's blue channel
 *    decodes flat, and using it as Z inverts every normal). `normalScale.y`
 *    is negated for the DirectX/OpenGL green-channel convention. Rogue Drone
 *    Heavy/Light/Medium have local packed-RG examples: B is uniformly zero
 *    while R/G span 0..255.
 *  - `roughness` (_r) -> `roughnessMap` (Three samples its G channel; the
 *    source is a flat grayscale PNG so R/G/B already agree).
 *  - `glow` (_g) -> `emissiveMap` with `emissive` white and
 *    `emissiveIntensity` 1 — equivalent to the reference's neutral-tint
 *    glow defaults.
 *  - `materialMask` (_m), `dirt` (_d), `paint3` (_p3): see
 *    `EVE_MATERIAL_MASK_LOGIC` above.
 *
 * @param {Record<string, THREE.Texture|null>} textures From `loadEveTextures`.
 * @returns {THREE.Material}
 */
export function createEveMaterial(textures)
{
    if (!textures.baseColor) return createTempMaterial();

    const material = new THREE.MeshPhysicalMaterial({
        map: textures.baseColor,
        alphaTest: 0.1,
        side: THREE.DoubleSide
    });

    if (textures.normal)
    {
        textures.normal.format = THREE.RGFormat;
        material.normalMap = textures.normal;
        material.normalScale = new THREE.Vector2(1, -1);
    }

    if (textures.roughness) material.roughnessMap = textures.roughness;

    if (textures.glow)
    {
        material.emissiveMap = textures.glow;
        material.emissive = new THREE.Color(1, 1, 1);
        material.emissiveIntensity = 1;
    }

    if (textures.paint3) material.transparent = true;

    // Not read by Three's renderer — `dispose.js` discovers and disposes
    // every `.isTexture` property on a material generically, and these
    // three channels are otherwise only reachable from inside the
    // `onBeforeCompile` closure below.
    if (textures.materialMask) material.eveMaterialMask = textures.materialMask;
    if (textures.dirt) material.eveDirt = textures.dirt;
    if (textures.paint3) material.evePaint3 = textures.paint3;

    material.onBeforeCompile = (shader) =>
    {
        shader.uniforms.tMaterialMask = { value: textures.materialMask ?? FALLBACK_TEXTURE };
        shader.uniforms.uUseMaterialMask = { value: !!textures.materialMask };
        shader.uniforms.tDirt = { value: textures.dirt ?? FALLBACK_TEXTURE };
        shader.uniforms.uUseDirt = { value: !!textures.dirt };
        shader.uniforms.tPaint3 = { value: textures.paint3 ?? FALLBACK_TEXTURE };
        shader.uniforms.uUsePaint3 = { value: !!textures.paint3 };

        shader.fragmentShader = shader.fragmentShader
            .replace("void main() {", EVE_MATERIAL_UNIFORM_DECLARATIONS)
            .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\n" + EVE_MATERIAL_MASK_LOGIC);
    };

    return material;
}
