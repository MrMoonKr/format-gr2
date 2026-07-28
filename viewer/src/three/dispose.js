function disposeMaterial(material)
{
    for (const key of Object.keys(material))
    {
        const value = material[key];
        if (value && value.isTexture) value.dispose();
    }
    material.dispose();
}

/**
 * Release every geometry, material, texture, and skeleton resource under
 * `root`. Call this before dropping a reference to a previously loaded
 * scene graph.
 */
export function disposeObject(root)
{
    root.traverse((node) =>
    {
        if (node.geometry) node.geometry.dispose();

        if (node.material)
        {
            const materials = Array.isArray(node.material) ? node.material : [ node.material ];
            for (const material of materials) disposeMaterial(material);
        }

        if (node.isSkinnedMesh && node.skeleton) node.skeleton.dispose();
    });
}
