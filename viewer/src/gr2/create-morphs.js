import * as THREE from "three";

/**
 * Convert one `MorphTarget` into a full-mesh-vertex-count position delta
 * array. Two source shapes exist (docs/reference/json-graph.md, "Morph
 * targets"):
 *  - native targets: dense (one row per mesh vertex), `dataIsDeltas` may be
 *    true or false; `false` stores absolute positions and must be
 *    subtracted from the base mesh.
 *  - CCP blend-shape targets (Granny vertex annotation sets): always
 *    `dataIsDeltas: true`, optionally sparse via `vertexIndices` mapping
 *    each target row to its mesh vertex.
 */
function toDeltaPositions(target, basePosition)
{
    const values = target.vertex.position;
    if (!values.length) return null;

    const out = new Float32Array(basePosition.length);

    if (target.vertexIndices)
    {
        const { vertexIndices } = target;
        for (let row = 0; row < vertexIndices.length; row++)
        {
            const vertexIndex = vertexIndices[row];
            for (let c = 0; c < 3; c++)
            {
                const value = values[row * 3 + c];
                out[vertexIndex * 3 + c] = target.dataIsDeltas
                    ? value
                    : value - basePosition[vertexIndex * 3 + c];
            }
        }
    }
    else
    {
        for (let i = 0; i < out.length; i++)
        {
            out[i] = target.dataIsDeltas ? values[i] : values[i] - basePosition[i];
        }
    }

    return out;
}

/**
 * Apply a mesh's morph targets to an already-built `BufferGeometry` as
 * relative position deltas, and return the ordered target names so the
 * caller can build `morphTargetDictionary`/`morphTargetInfluences`.
 *
 * @param {THREE.BufferGeometry} geometry Geometry built by create-geometry.js.
 * @param {object} mesh GR2 JSON `Mesh` node.
 * @returns {string[]|null}
 */
export function applyMorphAttributes(geometry, mesh)
{
    const targets = mesh.morphTargets;
    if (!targets.length) return null;

    const positions = [];
    const names = [];
    const basePosition = mesh.vertex.position;

    for (const target of targets)
    {
        const delta = toDeltaPositions(target, basePosition);
        if (!delta) continue;
        positions.push(new THREE.BufferAttribute(delta, 3));
        names.push(target.name);
    }

    if (!positions.length) return null;

    geometry.morphAttributes.position = positions;
    geometry.morphTargetsRelative = true;

    return names;
}
