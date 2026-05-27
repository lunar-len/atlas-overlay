export class Marker {
    constructor(mapMarkers) {
        this.mapMarkers = mapMarkers;
        this.reset();
    }

    reset() {}

    destroy() {
        this.mapMarkers = null;
    }

    // ── Getters ──────────────────────────────────────────────────────
    get map() { return this.mapMarkers.map; }
    get scene() { return this.mapMarkers.scene; }
    get sourceIDs() { return []; }
    get layerIDs() { return []; }

    sceneToLngLat(...args) { return this.mapMarkers.sceneToLngLat(...args); }
    lngLatToScene(...args) { return this.mapMarkers.lngLatToScene(...args); }

    // ── Lifecycle hooks ───────────────────────────────────────────────
    addFoundryHooks() {}
    addMapListeners() {}

    // ── Click consumption (for draw-mode markers) ─────────────────────
    consumesClicks() { return false; }
    onConsumedClick(event) {}

    // ── Event handlers ────────────────────────────────────────────────
    onMouseMove(event, markerFeatures) {}
    onLeaveMap(event) {}
    onClick(event, properties) {}
    onGrab(event, properties) {}
    onRelease(event, properties) {}

    /**
     * Called on right-click. Return true if the event was handled
     * (prevents lower-priority markers from handling it).
     * @param {MapMouseEvent} event
     * @param {Object.<string, GeoJSONFeature[]>} features  grouped by layer ID
     */
    onContextMenu(event, features) { return false; }
}
