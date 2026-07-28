import * as THREE from "three";

const IDENTITY_POSITION = [ 0, 0, 0 ];
const IDENTITY_ORIENTATION = [ 0, 0, 0, 1 ];
const IDENTITY_SCALE_SHEAR = [ 1, 0, 0, 0, 1, 0, 0, 0, 1 ];

/**
 * `position`/`orientation`/`scaleShear` are individually optional per bone
 * in the GR2 JSON graph (docs/reference/json-graph.md). Missing fields fall
 * back to identity rather than being assumed present.
 */
function boneLocalTransform(bone)
{
    const position = bone.position ?? IDENTITY_POSITION;
    const orientation = bone.orientation ?? IDENTITY_ORIENTATION;
    const scaleShear = bone.scaleShear ?? IDENTITY_SCALE_SHEAR;

    return {
        position: new THREE.Vector3(position[0], position[1], position[2]),
        quaternion: new THREE.Quaternion(orientation[0], orientation[1], orientation[2], orientation[3]),
        // Granny scaleShear is a row-major 3x3 matrix; Three.js bones only
        // support axis-aligned scale, so shear (off-diagonal) terms are
        // dropped rather than approximated.
        scale: new THREE.Vector3(scaleShear[0], scaleShear[4], scaleShear[8])
    };
}

/**
 * Build a `Bone[]`/`THREE.Skeleton` from one GR2 `Skeleton` node, applying
 * each bone's local-to-parent transform (Granny bone transforms are
 * relative to their parent, confirmed against real EVE ship skeletons).
 *
 * @param {object} skeletonJson GR2 JSON `Skeleton` node.
 * @returns {{ bones: THREE.Bone[], roots: THREE.Bone[], skeleton: THREE.Skeleton, boneNameToIndex: Map<string, number> }}
 */
export function buildSkeleton(skeletonJson)
{
    const boneList = skeletonJson.bones;
    const bones = boneList.map((boneJson) =>
    {
        const bone = new THREE.Bone();
        bone.name = boneJson.name;
        const transform = boneLocalTransform(boneJson);
        bone.position.copy(transform.position);
        bone.quaternion.copy(transform.quaternion);
        bone.scale.copy(transform.scale);
        return bone;
    });

    const roots = [];
    boneList.forEach((boneJson, index) =>
    {
        if (boneJson.parentIndex >= 0) bones[boneJson.parentIndex].add(bones[index]);
        else roots.push(bones[index]);
    });

    const skeleton = new THREE.Skeleton(bones);
    const boneNameToIndex = new Map(boneList.map((boneJson, index) => [ boneJson.name, index ]));

    return { bones, roots, skeleton, boneNameToIndex };
}

/**
 * Build a lookup table from a mesh's own bone-binding order to skeleton
 * bone indices. `blendIndice` values index into `mesh.boneBindings`, not
 * directly into `skeleton.bones` — see AGENTS_THREEJS.md, "Bone-binding
 * index remap".
 *
 * @param {object} mesh GR2 JSON `Mesh` node.
 * @param {Map<string, number>} boneNameToIndex From `buildSkeleton`.
 * @returns {number[]} `remapTable[meshLocalBoneIndex] -> skeletonBoneIndex`.
 */
export function buildBoneIndexRemap(mesh, boneNameToIndex)
{
    return mesh.boneBindings.map((binding) =>
    {
        const index = boneNameToIndex.get(binding.name);
        if (index === undefined)
        {
            throw new Error(`Bone binding "${binding.name}" (mesh "${mesh.name}") has no matching skeleton bone`);
        }
        return index;
    });
}

/**
 * Rewrite `blendIndice` values through a bone-binding remap table so they
 * become skeleton-space `skinIndex` values.
 */
export function remapBlendIndices(blendIndice, remapTable)
{
    const out = new Array(blendIndice.length);
    for (let i = 0; i < blendIndice.length; i++)
    {
        const remapped = remapTable[blendIndice[i]];
        if (remapped === undefined)
        {
            throw new Error(`Blend index ${blendIndice[i]} has no matching mesh bone binding`);
        }
        out[i] = remapped;
    }
    return out;
}
