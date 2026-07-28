// Local development: load the in-repository decoder directly so source
// breakpoints resolve. Replace with `@carbonenginejs/format-gr2` only when
// testing the published package (see AGENTS_THREEJS.md).
import CjsFormatGr2 from "../../../src/index.js";

const READ_OPTIONS = {
    unpackTangents: true,
    rebuildMissingNormals: true,
    decompressCurves: true
};

/**
 * Decode a .gr2 file into the reader's default JSON graph.
 *
 * @param {File|Blob|ArrayBuffer} source File/Blob picked by the user, or an
 *   already-fetched ArrayBuffer.
 * @returns {Promise<object>} GR2 JSON graph (see docs/reference/json-graph.md).
 */
export async function loadGr2(source)
{
    const buffer = source instanceof ArrayBuffer ? source : await source.arrayBuffer();
    const reader = new CjsFormatGr2(READ_OPTIONS);
    return reader.Read(buffer);
}
