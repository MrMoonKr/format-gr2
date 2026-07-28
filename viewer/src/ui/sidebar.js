/**
 * Local test-asset list and animation-clip selector. DOM-only — asset and
 * animation objects are opaque to this module.
 */
export function createSidebar(container, {
    onSelectAsset,
    onSelectAnimation,
    onToggleSkeleton,
    onToggleMaterialMode,
    onToggleAlbedoPreview,
    onToggleLightHelpers
} = {})
{
    const assetList = document.createElement("ul");
    assetList.className = "asset-list";

    const animationSelect = document.createElement("select");
    animationSelect.className = "animation-select";
    animationSelect.disabled = true;

    const skeletonToggleLabel = document.createElement("label");
    skeletonToggleLabel.className = "skeleton-toggle";
    const skeletonToggle = document.createElement("input");
    skeletonToggle.type = "checkbox";
    skeletonToggle.checked = true;
    skeletonToggle.disabled = true;
    skeletonToggleLabel.appendChild(skeletonToggle);
    skeletonToggleLabel.appendChild(document.createTextNode(" Show skeleton"));

    const materialToggleLabel = document.createElement("label");
    materialToggleLabel.className = "skeleton-toggle";
    const materialToggle = document.createElement("input");
    materialToggle.type = "checkbox";
    materialToggle.checked = false;
    materialToggleLabel.appendChild(materialToggle);
    materialToggleLabel.appendChild(document.createTextNode(" EVE PBR material"));

    const albedoPreviewToggleLabel = document.createElement("label");
    albedoPreviewToggleLabel.className = "skeleton-toggle";
    const albedoPreviewToggle = document.createElement("input");
    albedoPreviewToggle.type = "checkbox";
    albedoPreviewToggle.checked = false;
    albedoPreviewToggleLabel.appendChild(albedoPreviewToggle);
    albedoPreviewToggleLabel.appendChild(document.createTextNode(" Albedo UV preview"));

    const lightHelpersToggleLabel = document.createElement("label");
    lightHelpersToggleLabel.className = "skeleton-toggle";
    const lightHelpersToggle = document.createElement("input");
    lightHelpersToggle.type = "checkbox";
    lightHelpersToggle.checked = true;
    lightHelpersToggleLabel.appendChild(lightHelpersToggle);
    lightHelpersToggleLabel.appendChild(document.createTextNode(" Show light helpers"));

    container.appendChild(assetList);
    container.appendChild(animationSelect);
    container.appendChild(skeletonToggleLabel);
    container.appendChild(materialToggleLabel);
    container.appendChild(albedoPreviewToggleLabel);
    container.appendChild(lightHelpersToggleLabel);

    function setAssets(assets)
    {
        assetList.textContent = "";
        for (const asset of assets)
        {
            const item = document.createElement("li");
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = asset.label;
            button.addEventListener("click", () => onSelectAsset?.(asset));
            item.appendChild(button);
            assetList.appendChild(item);
        }
    }

    function setAnimations(clips)
    {
        animationSelect.textContent = "";

        const none = document.createElement("option");
        none.value = "";
        none.textContent = clips.length ? "(no animation)" : "(no animations in file)";
        animationSelect.appendChild(none);

        for (const clip of clips)
        {
            const option = document.createElement("option");
            option.value = clip.name;
            option.textContent = clip.name;
            animationSelect.appendChild(option);
        }

        animationSelect.disabled = clips.length === 0;
    }

    animationSelect.addEventListener("change", () =>
    {
        onSelectAnimation?.(animationSelect.value || null);
    });

    function setSkeletonAvailable(available)
    {
        skeletonToggle.disabled = !available;
        skeletonToggle.checked = available;
    }

    skeletonToggle.addEventListener("change", () =>
    {
        onToggleSkeleton?.(skeletonToggle.checked);
    });

    materialToggle.addEventListener("change", () =>
    {
        onToggleMaterialMode?.(materialToggle.checked);
    });

    albedoPreviewToggle.addEventListener("change", () =>
    {
        onToggleAlbedoPreview?.(albedoPreviewToggle.checked);
    });

    lightHelpersToggle.addEventListener("change", () =>
    {
        onToggleLightHelpers?.(lightHelpersToggle.checked);
    });

    return { setAssets, setAnimations, setSkeletonAvailable };
}
