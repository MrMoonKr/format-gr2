import * as THREE from "three";

/**
 * Own the renderer, scene, camera, resize handling, and render loop for one
 * viewport element. `gr2/` and `ui/` never touch these directly.
 */
export function createViewer(container)
{
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1a33);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100000);
    camera.position.set(4, 3, 6);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Matches the sibling eve-res-explorer shader's manual `x / (x + 1)`
    // tonemap before its gamma pow — Reinhard is that same operator, kept
    // here so EVE-textured PBR materials read the same as the reference.
    renderer.toneMapping = THREE.ReinhardToneMapping;
    container.appendChild(renderer.domElement);

    const timer = new THREE.Timer();
    timer.connect(document);
    let frameId = null;
    let resizeFrameId = null;
    let onTick = null;
    let lastWidth = 0;
    let lastHeight = 0;

    function resize()
    {
        const width = container.clientWidth || 1;
        const height = container.clientHeight || 1;
        if (width === lastWidth && height === lastHeight) return;

        lastWidth = width;
        lastHeight = height;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        // updateStyle must stay true (the default): it sets canvas.style
        // width/height to the CSS pixel size. Without it, an unstyled
        // canvas falls back to its width/height *attributes* for layout,
        // which are devicePixelRatio times larger than the container on
        // any non-100%-scaled display — the canvas then overflows the
        // whole page instead of filling #viewport.
        renderer.setSize(width, height);
    }

    function scheduleResize()
    {
        if (resizeFrameId !== null) return;

        resizeFrameId = requestAnimationFrame(() =>
        {
            resizeFrameId = null;
            resize();
        });
    }

    // Changing the renderer's drawing-buffer size can affect layout. Deferring
    // that work out of the ResizeObserver delivery cycle avoids loop warnings.
    const resizeObserver = new ResizeObserver(scheduleResize);
    resizeObserver.observe(container);
    resize();

    function loop()
    {
        frameId = requestAnimationFrame(loop);
        timer.update();
        if (onTick) onTick(timer.getDelta());
        renderer.render(scene, camera);
    }

    function start(tick)
    {
        onTick = tick || null;
        if (frameId === null) loop();
    }

    function stop()
    {
        if (frameId !== null) cancelAnimationFrame(frameId);
        frameId = null;
    }

    function dispose()
    {
        stop();
        resizeObserver.disconnect();
        if (resizeFrameId !== null) cancelAnimationFrame(resizeFrameId);
        timer.disconnect();
        renderer.dispose();
        renderer.domElement.remove();
    }

    return { scene, camera, renderer, start, stop, resize, dispose };
}
