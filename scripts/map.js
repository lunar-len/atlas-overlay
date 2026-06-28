import layers from "../lib/pathfinder-wiki-maps/src/layers.js";
import * as pmtiles from "../lib/pmtiles/pmtiles-bundle.js";

const MODULE_ID = "atlas-overlay";

// The pmtiles protocol is global to MapLibre; register it once and reuse the
// Protocol instance (it also caches opened archives) across scene reloads.
let pmtilesProtocol = null;

export function createMap() {
    const root = `${location.protocol}//${location.host}/`;
    if (!pmtilesProtocol) {
        pmtilesProtocol = new pmtiles.Protocol();
        maplibregl.addProtocol("pmtiles", pmtilesProtocol.tilev4);
    }

    const tilesUrl = game.settings.get(MODULE_ID, "mapTilesUrl");

    const map = new maplibregl.Map({
        container: "maplibre-container",
        hash: "location",   // remembers position in URL hash on reload
        center: [20, 20],   // default center (Inner Sea region of Golarion)
        zoom: 3,            // default zoom — shows continent level detail
        attributionControl: false,
        pitchWithRotate: false,
        style: {
            version: 8,
            sources: {
                golarion: {
                    type: "vector",
                    attribution:
                        '<a href="https://paizo.com/licenses/communityuse">Paizo CUP</a>, ' +
                        '<a href="https://github.com/pf-wikis/mapping#acknowledgments">Acknowledgments</a>',
                    url: tilesUrl
                }
            },
            sprite: `${root}modules/${MODULE_ID}/lib/pathfinder-wiki-maps/data/sprites`,
            glyphs: `modules/${MODULE_ID}/lib/pathfinder-wiki-maps/data/fonts/{fontstack}/{range}.pbf`,
            layers: layers(),
            transition: { duration: 300, delay: 0 },
            sky: { "atmosphere-blend": 0.5 }
        }
    });

    const projection = [
        "interpolate", ["linear"], ["zoom"],
        4, "vertical-perspective",
        5, "mercator"
    ];

    map.on("style.load", () => {
        map.setProjection({ type: projection });
        Hooks.call(`${MODULE_ID}.style.load`, map);
    });

    // Surface tile/source failures (e.g. an incompatible or unreachable PMTiles
    // source) to the user once, instead of leaving a silent blank globe.
    let mapErrorNotified = false;
    map.on("error", (e) => {
        const msg = e?.error?.message ?? "";
        console.warn(`[${MODULE_ID}] MapLibre error:`, e?.error ?? e);
        if (!mapErrorNotified && /tile|pmtiles|source|parse/i.test(msg)) {
            mapErrorNotified = true;
            ui.notifications?.warn(game.i18n.localize("ATLAS.notification.mapLoadError"));
        }
    });

    map.keyboard.disable();
    map.dragRotate.disable();

    return [map, projection];
}
