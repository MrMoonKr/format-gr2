import * as THREE from "three";
import { createGeometry } from "./create-geometry.js";
import { createTempMaterial } from "./create-materials.js";
import { buildSkeleton, buildBoneIndexRemap, remapBlendIndices } from "./create-skeleton.js";
import { applyMorphAttributes } from "./create-morphs.js";
import { createAnimationClips } from "./create-animations.js";

function applyMorphs(object, geometry, mesh)
{
    const names = applyMorphAttributes(geometry, mesh);
    if (!names) return;
    object.morphTargetDictionary = Object.fromEntries(names.map((name, index) => [ name, index ]));
    object.morphTargetInfluences = new Array(names.length).fill(0);
}

function buildStaticMesh(mesh, material)
{
    const geometry = createGeometry(mesh);
    const object = new THREE.Mesh(geometry, material);
    object.name = mesh.name;
    applyMorphs(object, geometry, mesh);
    return object;
}

function buildSkinnedMesh(mesh, material, skeletonInfo)
{
    const remapTable = buildBoneIndexRemap(mesh, skeletonInfo.boneNameToIndex);
    const blendIndiceOverride = remapBlendIndices(mesh.vertex.blendIndice, remapTable);
    const geometry = createGeometry(mesh, { blendIndiceOverride });
    const object = new THREE.SkinnedMesh(geometry, material);
    object.name = mesh.name;
    object.bind(skeletonInfo.skeleton);
    applyMorphs(object, geometry, mesh);
    return object;
}

function lodBaseName(mesh)
{
    return mesh.name.replace(/\s+LOD\s+\d+$/i, "");
}

function vertexCount(mesh)
{
    return (mesh.vertex.position?.length ?? 0) / 3;
}

/**
 * A model can bind every level of detail for one logical shape. Render only
 * the highest-detail member of each name group until explicit THREE.LOD
 * switching is implemented.
 */
function selectModelMeshIndices(model, meshes)
{
    const selected = new Map();

    for (const meshIndex of model.meshBindings)
    {
        const mesh = meshes[meshIndex];
        if (!mesh) continue;

        const key = lodBaseName(mesh);
        const currentIndex = selected.get(key);
        if (currentIndex === undefined || vertexCount(mesh) > vertexCount(meshes[currentIndex]))
        {
            selected.set(key, meshIndex);
        }
    }

    return new Set(selected.values());
}

/**
 * Convert one GR2 model's bound meshes to Three.js objects, attaching each
 * to the model's skeleton.
 *
 * Real EVE assets carry three different skinning shapes on `mesh.vertex`,
 * distinguished purely by which channels are populated:
 *  - Smooth-skinned: `blendIndice` + `blendWeight` both present. Built as a
 *    `SkinnedMesh` with the decoded weights (multiple ships/drones have
 *    none of these — this shape hasn't been observed on hull geometry yet).
 *  - Rigid per-vertex skinning: `blendIndice` present, `blendWeight` empty.
 *    Every vertex names exactly one bone with implicit full weight (seen on
 *    rogue drone limbs, which move independently per animated bone).
 *    `create-geometry.js` synthesizes the [1,0,0,0] weight. Still a
 *    `SkinnedMesh` — the only difference from smooth skinning is the
 *    absence of real per-vertex blend weights.
 *  - Whole-mesh rigid attachment: no `blendIndice` at all, exactly one
 *    `boneBindings` entry (turret hardpoints, hatch panels on ship hulls).
 *    Parented directly to that one bone instead of built as a `SkinnedMesh`.
 */
function attachModelMeshes(modelGroup, model, meshes, skeletonInfo, material)
{
    for (const meshIndex of selectModelMeshIndices(model, meshes))
    {
        const mesh = meshes[meshIndex];
        if (!mesh) continue;

        const hasBoneIndices = mesh.vertex.blendIndice.length > 0;

        if (skeletonInfo && hasBoneIndices)
        {
            modelGroup.add(buildSkinnedMesh(mesh, material, skeletonInfo));
            continue;
        }

        const object = buildStaticMesh(mesh, material);

        if (skeletonInfo && mesh.boneBindings.length === 1)
        {
            const boneIndex = skeletonInfo.boneNameToIndex.get(mesh.boneBindings[0].name);
            const parentBone = boneIndex !== undefined ? skeletonInfo.bones[boneIndex] : null;
            (parentBone || modelGroup).add(object);
        }
        else
        {
            modelGroup.add(object);
        }
    }
}

/**
 * Public GR2 JSON graph -> Three.js `Object3D` adapter.
 *
 * @param {object} gr2 Output of `loadGr2` / `CjsFormatGr2.Read`.
 * @param {object} [options]
 * @param {THREE.Material} [options.material] Shared material for all
 *   meshes. Defaults to a neutral `MeshStandardMaterial`.
 * @returns {{ root: THREE.Group, animations: THREE.AnimationClip[] }}
 */
export function gr2ToThree(gr2, { material = createTempMaterial() } = {})
{
    const root = new THREE.Group();
    root.name = "gr2-root";
    const clips = [];

    for (const model of gr2.models)
    {
        const modelGroup = new THREE.Group();
        modelGroup.name = model.name || "model";

        const skeletonInfo = model.skeleton ? buildSkeleton(model.skeleton) : null;
        if (skeletonInfo)
        {
            for (const bone of skeletonInfo.roots) modelGroup.add(bone);
            // SkinnedMesh.bind() derives inverse bind matrices from each
            // bone's matrixWorld. The hierarchy must be updated at its GR2
            // rest pose before binding, otherwise the inverses are identity
            // and animated vertices are transformed by full bone matrices.
            modelGroup.updateMatrixWorld(true);
            clips.push(...createAnimationClips(gr2.animations, (name) => skeletonInfo.boneNameToIndex.has(name)));
        }

        attachModelMeshes(modelGroup, model, gr2.meshes, skeletonInfo, material);
        root.add(modelGroup);
    }

    // `Model.meshBindings` is authoritative for what a model renders,
    // including which LOD variant. Real assets leave unrelated LOD/scratch
    // meshes in the raw `meshes` array without binding them to any model
    // (observed on rogue drone files) — rendering those unconditionally
    // would duplicate geometry at the origin. Only fall back to drawing
    // every raw mesh when the file has no model to bind anything at all.
    if (gr2.models.length === 0)
    {
        for (const mesh of gr2.meshes) root.add(buildStaticMesh(mesh, material));
    }

    return { root, animations: clips };
}
