const ROWS = [
    [ "meshCount", "Meshes" ],
    [ "modelCount", "Models" ],
    [ "boneCount", "Bones" ],
    [ "animationCount", "Animations" ],
    [ "morphTargetCount", "Morph targets" ]
];

/**
 * Render the loaded GR2 graph's summary counts. `summary` is a plain object
 * built by `app.js` from the decoded JSON, not GR2 geometry itself.
 */
export function createInspector(container)
{
    function render(summary)
    {
        container.textContent = "";
        if (!summary) return;

        const dl = document.createElement("dl");
        for (const [ key, label ] of ROWS)
        {
            const dt = document.createElement("dt");
            dt.textContent = label;
            const dd = document.createElement("dd");
            dd.textContent = String(summary[key] ?? 0);
            dl.appendChild(dt);
            dl.appendChild(dd);
        }
        container.appendChild(dl);
    }

    return { render };
}
