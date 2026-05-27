import { MapMarkers } from "./markers-on-globe.js";
import { createMap } from "./map.js";
import { addHooks } from "./hooks.js";

const MODULE_ID = "atlas-overlay";

// ── Settings registration ─────────────────────────────────────────────
function registerSettings() {
    game.settings.register(MODULE_ID, "mapTilesUrl", {
        name: "ATLAS.settings.mapTilesUrl.name",
        hint: "ATLAS.settings.mapTilesUrl.hint",
        scope: "world",
        config: true,
        type: String,
        default: `pmtiles:///modules/${MODULE_ID}/lib/pathfinder-wiki-maps/data/golarion.pmtiles`,
        onChange: () => ui.notifications.info("Reload the page to apply the new map URL.")
    });

    game.settings.register(MODULE_ID, "pathStyle", {
        name: "ATLAS.settings.pathStyle.name",
        hint: "ATLAS.settings.pathStyle.hint",
        scope: "world",
        config: true,
        type: String,
        choices: {
            "solid": "ATLAS.settings.pathStyle.solid",
            "dashed": "ATLAS.settings.pathStyle.dashed"
        },
        default: "solid",
        onChange: () => game.modules.get(MODULE_ID)?.mapMarkers?.refreshPathStyle?.()
    });
}

// ── Settings UI: inject a FilePicker button next to the Map Tiles URL field ──
Hooks.on("renderSettingsConfig", (app, html) => {
    const root = (html instanceof HTMLElement) ? html : html[0];
    const input = root.querySelector(`input[name="${MODULE_ID}.mapTilesUrl"]`);
    if (!input || input.dataset.atlasFpWired) return;
    input.dataset.atlasFpWired = "1";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "atlas-fp-btn";
    btn.title = game.i18n.localize("ATLAS.settings.mapTilesUrl.browse");
    btn.innerHTML = `<i class="fa-solid fa-folder-open"></i>`;
    btn.addEventListener("click", (e) => {
        e.preventDefault();
        const FP = foundry.applications?.apps?.FilePicker?.implementation
            ?? foundry.applications?.apps?.FilePicker
            ?? globalThis.FilePicker;
        const raw = (input.value || "").replace(/^pmtiles:\/+/, "");
        new FP({
            type: "any",
            current: raw || `modules/${MODULE_ID}/lib/pathfinder-wiki-maps/data/`,
            callback: (path) => {
                input.value = `pmtiles:///${path.replace(/^\/+/, "")}`;
                input.dispatchEvent(new Event("change", { bubbles: true }));
            }
        }).browse();
    });

    // Wrap input + button so they sit on one row
    const wrap = document.createElement("div");
    wrap.className = "atlas-fp-wrap";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    wrap.appendChild(btn);
});

// ── Foundry hooks ─────────────────────────────────────────────────────
Hooks.once("ready", () => {
    registerSettings();
    addHooks();
});

Hooks.on("getSceneControlButtons", (controls) => {
    if (!canvas?.scene?.getFlag(MODULE_ID, "enabled")) return;

    const mod = game.modules.get(MODULE_ID);
    const drawing = mod?.mapMarkers?.isPathDrawing ?? false;
    const is2D = mod?.mapMarkers?.is2D ?? false;

    // Foundry v13 introduced ApplicationV2-based SceneControls with the modern API:
    // tools as { [name]: tool } and `onChange(event, active)` callback. Both v13
    // and v14 use this same shape, so no version branching is needed.
    const tools = {
        "toggle-projection": {
            name: "toggle-projection",
            order: 1,
            title: "ATLAS.button.toggleProjection",
            icon: "fa-solid fa-map",
            toggle: true,
            visible: true,
            active: is2D,
            onChange: () => { mod?.mapMarkers?.toggleProjection?.(); ui.controls.render(); }
        }
    };

    if (game.user.isGM) {
        tools["draw-path"] = {
            name: "draw-path",
            order: 2,
            title: drawing ? "ATLAS.button.finishPath" : "ATLAS.button.drawPath",
            icon: drawing ? "fa-solid fa-flag-checkered" : "fa-solid fa-route",
            button: true,
            visible: true,
            onChange: () => { mod?.mapMarkers?.togglePathDraw?.(); ui.controls.render(); }
        };
        tools["manage-markers"] = {
            name: "manage-markers",
            order: 3,
            title: "ATLAS.button.manageMarkers",
            icon: "fa-solid fa-list",
            button: true,
            visible: true,
            onChange: () => mod?.mapMarkers?.showMarkerManager?.()
        };
        tools["manage-paths"] = {
            name: "manage-paths",
            order: 4,
            title: "ATLAS.button.managePaths",
            icon: "fa-solid fa-list-ol",
            button: true,
            visible: true,
            onChange: () => mod?.mapMarkers?.showPathManager?.()
        };
    }

    const group = {
        name: "globe-map",
        order: 99,
        title: "ATLAS.controls.globeMap",
        icon: "fa-solid fa-globe",
        layer: "controls",
        tools
    };

    // `controls` is a Map in current Foundry; older builds may pass a plain object.
    if (controls instanceof Map) controls.set("globe-map", group);
    else controls["globe-map"] = group;
});

Hooks.on("canvasTearDown", () => {
    const mod = game.modules.get(MODULE_ID);
    mod.mapMarkers?.destroy();
    mod.mapMarkers = null;

    document.getElementById("maplibre-container")?.remove();
    document.getElementById("globe-context-menu")?.remove();

    ui.controls.render();
});

Hooks.on("canvasReady", (canvas) => {
    if (!canvas.scene.getFlag(MODULE_ID, "enabled")) return;

    const mod = game.modules.get(MODULE_ID);

    // Map container
    const container = document.createElement("div");
    container.id = "maplibre-container";
    document.body.appendChild(container);

    const [map, projection] = createMap();

    Hooks.once(`${MODULE_ID}.style.load`, (_map) => {
        mod.mapMarkers?.destroy();
        mod.mapMarkers = new MapMarkers(_map, canvas.scene, projection);
        ui.controls.render();
    });
});

Hooks.on("renderSceneConfig", (app, html) => {
    const current = foundry.utils.getProperty(app.document, `flags.${MODULE_ID}.enabled`);
    $(html).find("div[data-tab='basics']").append(`
        <div class="form-group">
            <label>${game.i18n.localize("ATLAS.scene.enableGlobe")}</label>
            <input type="checkbox" name="flags.${MODULE_ID}.enabled" ${current ? "checked" : ""} />
        </div>
    `);
});
