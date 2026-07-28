import * as THREE from "three";
import { createViewer } from "./three/create-viewer.js";
import { createControls } from "./three/controls.js";
import { createSceneHelpers } from "./three/scene-helpers.js";
import { createEveLighting } from "./three/eve-lighting.js";
import { loadEnvironment } from "./three/environment.js";
import { fitCameraToObject } from "./three/fit-camera.js";
import { disposeObject } from "./three/dispose.js";
import { createPlaceholderCube } from "./three/placeholder-cube.js";
import { loadGr2 } from "./gr2/load-gr2.js";
import { gr2ToThree } from "./gr2/gr2-to-three.js";
import { createTempMaterial, createAlbedoPreviewMaterial, createEveMaterial } from "./gr2/create-materials.js";
import { loadEveTextures } from "./gr2/load-eve-textures.js";
import { createViewerState } from "./state/viewer-state.js";
import { createFileDrop } from "./ui/file-drop.js";
import { createSidebar } from "./ui/sidebar.js";
import { createTimeline } from "./ui/timeline.js";
import { createInspector } from "./ui/inspector.js";
import { createStatus } from "./ui/status.js";

function summarizeGr2(gr2)
{
    return {
        meshCount: gr2.meshes.length,
        modelCount: gr2.models.length,
        boneCount: gr2.models.reduce((sum, model) => sum + (model.skeleton ? model.skeleton.bones.length : 0), 0),
        animationCount: gr2.animations.length,
        morphTargetCount: gr2.meshes.reduce((sum, mesh) => sum + mesh.morphTargets.length, 0)
    };
}

const localTestAssets = typeof __VIEWER_TEST_ASSETS__ === "undefined"
    ? []
    : __VIEWER_TEST_ASSETS__;

const envMapUrl = typeof __VIEWER_ENV_MAP_URL__ === "undefined" ? "" : __VIEWER_ENV_MAP_URL__;

/**
 * Wire UI events to loading and scene actions. This is the only module that
 * knows about `three/`, `gr2/`, `ui/`, and `state/` all at once.
 */
export function createApp({ viewportEl, sidebarEl, timelineEl, inspectorEl, statusEl, dropzoneEl })
{
    const state = createViewerState();
    const viewer = createViewer(viewportEl);
    const controls = createControls(viewer.camera, viewer.renderer.domElement);
    createSceneHelpers(viewer.scene);
    const lighting = createEveLighting(viewer.scene);

    if (envMapUrl)
    {
        loadEnvironment(viewer.renderer, envMapUrl)
            .then((envTexture) => { viewer.scene.environment = envTexture; })
            .catch(() => {});
    }

    let currentRoot = null;
    let currentGr2 = null;
    // Only set for URL-loaded test assets. A configured `textures` map takes
    // priority; any missing channel falls back to filename convention. A
    // dropped File has neither a URL nor resolvable sidecar paths.
    let currentGr2Url = null;
    let currentTextureUrls = null;
    let usePbrMaterial = false;
    let useAlbedoPreview = false;
    let mixer = null;
    let currentAction = null;
    let skeletonHelper = null;
    let skeletonVisible = true;

    // Shown until the first GR2 asset loads. It doesn't depend on GR2 data
    // or the adapter pipeline, so it tells apart "the renderer draws
    // nothing" from "the loaded GR2 scene didn't render" when the viewport
    // looks blank.
    const placeholder = createPlaceholderCube();
    viewer.scene.add(placeholder.mesh);

    const status = createStatus(statusEl);
    const inspector = createInspector(inspectorEl);
    const sidebar = createSidebar(sidebarEl, {
        onSelectAsset: (asset) => loadFromUrl(asset.gr2, asset.textures),
        onSelectAnimation: (name) => playAnimation(name),
        onToggleSkeleton: (visible) =>
        {
            skeletonVisible = visible;
            if (skeletonHelper) skeletonHelper.visible = visible;
        },
        onToggleMaterialMode: (usePbr) =>
        {
            usePbrMaterial = usePbr;
            rebuildScene({ fitCamera: false });
        },
        onToggleAlbedoPreview: (enabled) =>
        {
            useAlbedoPreview = enabled;
            rebuildScene({ fitCamera: false });
        },
        onToggleLightHelpers: (visible) =>
        {
            lighting.helpers.visible = visible;
        }
    });
    const fileDrop = createFileDrop(dropzoneEl, (file) => loadFromFile(file));
    const timeline = createTimeline(timelineEl, {
        onSeek: (time) => { if (currentAction) currentAction.time = time; },
        onPlayPause: (playing) => { if (currentAction) currentAction.paused = !playing; }
    });

    state.subscribe((next) =>
    {
        status.render(next);
        inspector.render(next.summary);
        sidebar.setAnimations(next.animations);
    });
    status.render(state.get());

    function updateSkeletonHelper(root)
    {
        if (skeletonHelper)
        {
            viewer.scene.remove(skeletonHelper);
            skeletonHelper.geometry.dispose();
            skeletonHelper.material.dispose();
            skeletonHelper = null;
        }

        let hasBones = false;
        root.traverse((node) => { if (node.isBone) hasBones = true; });
        sidebar.setSkeletonAvailable(hasBones);
        if (!hasBones) return;

        // This three.js version refreshes bone line positions from
        // updateMatrixWorld() every render call; there is no separate
        // update() method to call per frame.
        skeletonHelper = new THREE.SkeletonHelper(root);
        skeletonHelper.visible = skeletonVisible;
        viewer.scene.add(skeletonHelper);
    }

    // Rebuilds the scene from `currentGr2` under the current material mode.
    // Runs both for a genuinely new asset (`fitCamera: true`) and for a
    // material-mode toggle on the already-loaded asset (`fitCamera: false`,
    // so flipping the checkbox doesn't reset the user's camera orbit/zoom).
    async function rebuildScene({ fitCamera })
    {
        if (!currentGr2) return;

        // usePbrMaterial with no resolvable URL (file drop) silently falls
        // back to the wireframe material inside createEveMaterial — there's
        // no sidecar texture path to resolve without one.
        const useTextures = (usePbrMaterial || useAlbedoPreview) && currentGr2Url;
        const textures = useTextures
            ? await loadEveTextures(currentGr2Url, currentTextureUrls ?? {})
            : null;
        // Preview intentionally wins over PBR so the exact same `_a` and UV
        // data can be checked without mask/dirt/light shader effects.
        const material = useAlbedoPreview && textures?.baseColor
            ? createAlbedoPreviewMaterial(textures.baseColor)
            : usePbrMaterial && textures
                ? createEveMaterial(textures)
                : createTempMaterial();

        if (placeholder.mesh.parent)
        {
            viewer.scene.remove(placeholder.mesh);
            placeholder.dispose();
        }

        if (currentRoot)
        {
            viewer.scene.remove(currentRoot);
            disposeObject(currentRoot);
        }
        mixer = null;
        currentAction = null;
        timeline.setClip(null);

        const { root, animations } = gr2ToThree(currentGr2, { material });
        currentRoot = root;
        viewer.scene.add(root);
        updateSkeletonHelper(root);
        if (fitCamera) fitCameraToObject(viewer.camera, controls, root);

        if (animations.length) mixer = new THREE.AnimationMixer(root);

        state.set({
            status: "ready",
            error: null,
            animations,
            summary: summarizeGr2(currentGr2)
        });
    }

    async function loadFromFile(file)
    {
        state.set({ status: "loading", error: null });
        try
        {
            currentGr2 = await loadGr2(file);
            currentGr2Url = null;
            currentTextureUrls = null;
            await rebuildScene({ fitCamera: true });
        }
        catch (error)
        {
            state.set({ status: "error", error });
        }
    }

    /**
     * @param {string} url
     * @param {Record<string, string>} [textureUrls]
     * @returns {Promise<void>}
     */
    async function loadFromUrl(url, textureUrls = {})
    {
        state.set({ status: "loading", error: null });
        try
        {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
            currentGr2 = await loadGr2(await response.arrayBuffer());
            currentGr2Url = url;
            currentTextureUrls = textureUrls;
            await rebuildScene({ fitCamera: true });
        }
        catch (error)
        {
            state.set({ status: "error", error });
        }
    }

    function playAnimation(name)
    {
        if (currentAction)
        {
            currentAction.stop();
            currentAction = null;
        }
        if (!mixer || !name)
        {
            timeline.setClip(null);
            return;
        }

        const clip = state.get().animations.find((c) => c.name === name);
        if (!clip)
        {
            timeline.setClip(null);
            return;
        }

        currentAction = mixer.clipAction(clip);
        currentAction.play();
        timeline.setClip(clip.duration);
    }

    sidebar.setAssets(localTestAssets);

    viewer.start((delta) =>
    {
        controls.update();
        if (placeholder.mesh.parent) placeholder.update(delta);
        if (mixer) mixer.update(delta);
        if (currentAction) timeline.setProgress(currentAction.time);
    });

    function dispose()
    {
        viewer.dispose();
        fileDrop.dispose();
        if (placeholder.mesh.parent) placeholder.dispose();
        if (currentRoot) disposeObject(currentRoot);
        if (skeletonHelper)
        {
            skeletonHelper.geometry.dispose();
            skeletonHelper.material.dispose();
        }
    }

    return { dispose, openFilePicker: fileDrop.openPicker };
}
