import "./styles/main.css";
import { createApp } from "./app.js";

const app = createApp({
    viewportEl: document.getElementById("viewport"),
    sidebarEl: document.getElementById("sidebar-panel"),
    timelineEl: document.getElementById("timeline"),
    inspectorEl: document.getElementById("inspector"),
    statusEl: document.getElementById("status"),
    dropzoneEl: document.getElementById("dropzone")
});

document.getElementById("browse")?.addEventListener("click", () => app.openFilePicker());
