/**
 * Selected objects, loading/error state, and animation summary live here so
 * `three/`, `gr2/`, and `ui/` stay free of module-global mutable state.
 * `app.js` owns the single instance and passes it to whichever modules need
 * to read or write it.
 */
export function createViewerState()
{
    const state = {
        status: "idle", // idle | loading | ready | error
        error: null,
        animations: [],
        summary: null
    };

    const listeners = new Set();

    function get()
    {
        return state;
    }

    function set(patch)
    {
        Object.assign(state, typeof patch === "function" ? patch(state) : patch);
        for (const listener of listeners) listener(state);
    }

    function subscribe(listener)
    {
        listeners.add(listener);
        return () => listeners.delete(listener);
    }

    return { get, set, subscribe };
}
