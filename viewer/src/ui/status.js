const MESSAGES = {
    idle: "Drop a .gr2 file here or browse",
    loading: "Loading...",
    ready: "Ready",
    error: "Load failed"
};

/**
 * Render `state.status`/`state.error` as a single status line.
 */
export function createStatus(container)
{
    function render(state)
    {
        container.dataset.status = state.status;
        container.textContent = state.status === "error" && state.error
            ? state.error.message
            : MESSAGES[state.status] ?? "";
    }

    return { render };
}
