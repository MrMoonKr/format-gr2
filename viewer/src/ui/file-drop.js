/**
 * Wire drag-and-drop and a hidden file input onto `container`. DOM-only —
 * does not interpret GR2 geometry, only hands the picked `File` to `onFile`.
 */
export function createFileDrop(container, onFile)
{
    function prevent(event)
    {
        event.preventDefault();
        event.stopPropagation();
    }

    function handleDragOver(event)
    {
        prevent(event);
        container.classList.add("is-dragover");
    }

    function handleDragLeave(event)
    {
        prevent(event);
        container.classList.remove("is-dragover");
    }

    function handleDrop(event)
    {
        prevent(event);
        container.classList.remove("is-dragover");
        const file = event.dataTransfer?.files?.[0];
        if (file) onFile(file);
    }

    container.addEventListener("dragover", handleDragOver);
    container.addEventListener("dragleave", handleDragLeave);
    container.addEventListener("drop", handleDrop);

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".gr2";
    input.hidden = true;

    function handleChange()
    {
        const file = input.files?.[0];
        if (file) onFile(file);
        input.value = "";
    }

    input.addEventListener("change", handleChange);
    container.appendChild(input);

    function openPicker()
    {
        input.click();
    }

    function dispose()
    {
        container.removeEventListener("dragover", handleDragOver);
        container.removeEventListener("dragleave", handleDragLeave);
        container.removeEventListener("drop", handleDrop);
        input.removeEventListener("change", handleChange);
        input.remove();
    }

    return { openPicker, dispose };
}
