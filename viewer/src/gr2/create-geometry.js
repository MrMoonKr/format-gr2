import * as THREE from "three";

const _normal = new THREE.Vector3();
const _tangent = new THREE.Vector3();
const _binormal = new THREE.Vector3();
const _cross = new THREE.Vector3();

/**
 * Synthesize a Three.js-shaped item-size-4 tangent attribute from the
 * decoder's tangent/binormal channels. Packed tangent frames decoded by the
 * reader are item size 3, while authored tangents can remain item size 4.
 * When a binormal is available, `w` is derived from handedness; otherwise an
 * authored tangent's fourth component is retained.
 */
function buildTangentAttribute(vertex)
{
    const { tangent, normal, binormal } = vertex;
    if (!tangent.length || !normal.length) return null;

    const vertexCount = normal.length / 3;
    const tangentSize = tangent.length / vertexCount;
    const binormalSize = binormal.length / vertexCount;
    if (!Number.isInteger(tangentSize) || (tangentSize !== 3 && tangentSize !== 4)) return null;

    const hasBinormal = Number.isInteger(binormalSize) && binormalSize >= 3;
    const out = new Float32Array(vertexCount * 4);

    for (let i = 0; i < vertexCount; i++)
    {
        const o3 = i * 3;
        const tangentOffset = i * tangentSize;
        const o4 = i * 4;
        out[o4] = tangent[tangentOffset];
        out[o4 + 1] = tangent[tangentOffset + 1];
        out[o4 + 2] = tangent[tangentOffset + 2];

        let w = tangentSize === 4 ? tangent[tangentOffset + 3] : 1;
        if (hasBinormal)
        {
            _normal.fromArray(normal, o3);
            _tangent.fromArray(tangent, tangentOffset);
            _binormal.fromArray(binormal, i * binormalSize);
            _cross.crossVectors(_normal, _tangent);
            w = _cross.dot(_binormal) < 0 ? -1 : 1;
        }
        out[o4 + 3] = w;
    }

    return new THREE.BufferAttribute(out, 4);
}

/**
 * Concatenate every `IndexGroup.faces` in `mesh.indices` into one index
 * buffer, recording a `BufferGeometry` material group per source group.
 * A mesh is not always a single `IndexGroup` (see AGENTS_THREEJS.md,
 * "Multi-group index concatenation").
 */
function buildIndex(mesh)
{
    const groups = mesh.indices;
    const totalFaces = groups.reduce((sum, group) => sum + group.faces.length, 0);
    const vertexCount = mesh.vertex.position.length / 3;
    const ArrayCtor = vertexCount > 65535 ? Uint32Array : Uint16Array;
    const indexArray = new ArrayCtor(totalFaces);

    let offset = 0;
    const ranges = [];
    for (let g = 0; g < groups.length; g++)
    {
        const faces = groups[g].faces;
        indexArray.set(faces, offset);
        ranges.push({ start: offset, count: faces.length, materialIndex: g });
        offset += faces.length;
    }

    return { attribute: new THREE.BufferAttribute(indexArray, 1), ranges };
}

/**
 * Build a `BufferGeometry` for one GR2 `Mesh`.
 *
 * @param {object} mesh GR2 JSON `Mesh` node.
 * @param {object} [options]
 * @param {number[]} [options.blendIndiceOverride] Skeleton-space bone
 *   indices, already remapped through `create-skeleton.js`'s bone-binding
 *   lookup. Required to get correct `skinIndex` values — raw
 *   `mesh.vertex.blendIndice` values are mesh-local `boneBindings` indices,
 *   not skeleton bone indices.
 * @returns {THREE.BufferGeometry}
 */
export function createGeometry(mesh, { blendIndiceOverride } = {})
{
    const geometry = new THREE.BufferGeometry();
    const { position, normal, texcoord0, blendIndice, blendWeight } = mesh.vertex;

    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(position), 3));
    if (normal.length) geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(normal), 3));
    if (texcoord0.length) geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(texcoord0), 2));

    const tangentAttribute = buildTangentAttribute(mesh.vertex);
    if (tangentAttribute) geometry.setAttribute("tangent", tangentAttribute);

    if (blendIndice.length)
    {
        const skinIndexSource = blendIndiceOverride ?? blendIndice;
        geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndexSource, 4));

        if (blendWeight.length)
        {
            geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(blendWeight, 4));
        }
        else
        {
            // Rigid per-vertex skinning: blendIndice assigns exactly one
            // bone per vertex (in its first component) with no blendWeight
            // channel at all. Full weight on that first slot reproduces
            // the intended rigid bind instead of an unweighted (all-zero)
            // skin, which would collapse every vertex to the origin.
            const vertexCount = skinIndexSource.length / 4;
            const weight = new Float32Array(vertexCount * 4);
            for (let i = 0; i < vertexCount; i++) weight[i * 4] = 1;
            geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weight, 4));
        }
    }

    if (mesh.indices.length)
    {
        const { attribute, ranges } = buildIndex(mesh);
        geometry.setIndex(attribute);
        for (const range of ranges) geometry.addGroup(range.start, range.count, range.materialIndex);
    }

    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    return geometry;
}
