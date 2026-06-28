import * as Marker from "./markers/index.js";

export class MapMarkers {
    constructor(map, scene, projection) {
        this.map = map;
        this.scene = scene;
        this.projection = projection;
        this.is2D = false;
        this.hooks = new Set();
        this._moveRAF = null;
        this._pendingMove = null;

        // The globe HTML overlay covers the whole viewport, but Foundry's PIXI
        // canvas underneath still receives pointer events — so e.g. shift+click
        // on the globe also fires Foundry's own shift-modified click handlers,
        // which can pan the underlying scene around. Disable pointer events on
        // the Foundry canvas while the overlay is shown; restored on destroy.
        this._foundryCanvasEl = canvas?.app?.view ?? document.getElementById("board");
        if (this._foundryCanvasEl) {
            this._foundryCanvasOriginalPE = this._foundryCanvasEl.style.pointerEvents;
            this._foundryCanvasEl.style.pointerEvents = "none";
        }

        // Order matters for event dispatch — first marker whose onContextMenu returns true wins.
        // Path must come before Custom: CustomMarker's RMB falls through to a "create marker"
        // dialog on empty space, which would otherwise eat all right-clicks on paths.
        this.markers = [
            new Marker.Token(this),
            new Marker.Note(this),
            new Marker.Ping(this),
            new Marker.Wiki(this),
            new Marker.Path(this),
            new Marker.Custom(this),
        ];

        this._addMapListeners();
        this._addFoundryHooks();
        this._setInitialView();
        this._loadPersisted();
    }

    destroy() {
        if (this._moveRAF != null) { cancelAnimationFrame(this._moveRAF); this._moveRAF = null; }
        if (this._foundryCanvasEl) {
            this._foundryCanvasEl.style.pointerEvents = this._foundryCanvasOriginalPE ?? "";
            this._foundryCanvasEl = null;
        }
        for (const m of this.markers) m.destroy?.();
        this._clearFoundryHooks();
        this.map?.remove();
        this.map = null;
    }

    // ── Getters ───────────────────────────────────────────────────────
    get padding() { return this.scene.padding; }
    get width() { return this.scene.width * (1 + 2 * this.padding) - this.scene.grid.sizeX; }
    get height() { return this.scene.height * (1 + 2 * this.padding); }

    get isPathDrawing() {
        return this.markers.find(m => m instanceof Marker.Path)?.isDrawingMode ?? false;
    }

    // ── Coordinate helpers ────────────────────────────────────────────
    sceneToLngLat(x, y) {
        return {
            lng: Math.clamp((x / this.width) * 360 - 180, -180, 180),
            lat: Math.clamp(90 - (y / this.height) * 180, -90, 90),
        };
    }
    lngLatToScene(lng, lat) {
        return {
            x: Math.clamp(((lng + 180) / 360) * this.width, 0, this.width),
            y: Math.clamp(((90 - lat) / 180) * this.height, 0, this.height),
        };
    }

    // ── Globe controls ────────────────────────────────────────────────
    toggleProjection() {
        this.is2D = !this.is2D;
        this.map.setProjection({ type: this.is2D ? "mercator" : this.projection });
    }

    togglePathDraw() {
        this.markers.find(m => m instanceof Marker.Path)?.toggleDrawMode?.();
    }

    showMarkerManager() {
        this.markers.find(m => m instanceof Marker.Custom)?.showManager?.();
    }

    showPathManager() {
        this.markers.find(m => m instanceof Marker.Path)?.showManager?.();
    }

    // ── Foundry hooks ─────────────────────────────────────────────────
    addFoundryHook(hook, fn) {
        const id = Hooks.on(hook, fn);
        this.hooks.add([hook, id]);
    }
    _addFoundryHooks() {
        for (const m of this.markers) m.addFoundryHooks?.();
    }
    _clearFoundryHooks() {
        for (const [name, id] of this.hooks) Hooks.off(name, id);
        this.hooks.clear();
    }

    // ── Map listeners ─────────────────────────────────────────────────
    _addMapListeners() {
        this.map.on("click", (e) => this._onMapClick(e));
        this.map.on("mousemove", (e) => this._onMouseMove(e));
        this.map.on("mousedown", (e) => this._onMouseDown(e));
        this.map.on("mouseup", (e) => this._onMouseUp(e));
        this.map.on("contextmenu", (e) => this._onContextMenu(e));
        this.map.getCanvas().addEventListener("mouseleave", (e) => this._onMouseLeave(e));

        for (const m of this.markers) m.addMapListeners?.();
    }

    // ── Primary event dispatch ────────────────────────────────────────
    _onMapClick(event) {
        // Let a marker consume all clicks (e.g. PathMarker in draw mode)
        for (const m of this.markers) {
            if (m.consumesClicks?.()) { m.onConsumedClick?.(event); return; }
        }
        const grouped = this._featuresAt(event.point);
        for (const m of this.markers) {
            const feats = this._collectFor(m, grouped);
            if (feats.length) feats.forEach(f => m.onClick?.(event, f.properties));
            else m.onClick?.(event);
        }
    }

    _onMouseMove(event) {
        // MapLibre fires mousemove very frequently; coalesce to one feature query
        // per animation frame so hover/drag stay smooth without querying every move.
        this._pendingMove = event;
        if (this._moveRAF == null) this._moveRAF = requestAnimationFrame(() => this._flushMove());
    }

    /**
     * Process the latest pending mousemove immediately, cancelling the scheduled
     * frame. Called synchronously before mousedown/mouseup so a drag's final
     * position is applied (and its threshold flag set) before onGrab/onRelease —
     * otherwise a quick drag could release with stale or unset drag state.
     */
    _flushMove() {
        if (this._moveRAF != null) { cancelAnimationFrame(this._moveRAF); this._moveRAF = null; }
        const event = this._pendingMove;
        this._pendingMove = null;
        if (!event || !this.map) return;
        const grouped = this._featuresAt(event.point);
        for (const m of this.markers) {
            const feats = this._collectFor(m, grouped);
            m.onMouseMove?.(event, feats);
        }
    }

    _onMouseDown(event) {
        this._flushMove();
        const grouped = this._featuresAt(event.point);
        for (const m of this.markers) {
            const feats = this._collectFor(m, grouped);
            if (feats.length) feats.forEach(f => m.onGrab?.(event, f.properties));
            else m.onGrab?.(event);
        }
    }

    _onMouseUp(event) {
        this._flushMove();
        const grouped = this._featuresAt(event.point);
        for (const m of this.markers) {
            const feats = this._collectFor(m, grouped);
            if (feats.length) feats.forEach(f => m.onRelease?.(event, f.properties));
            else m.onRelease?.(event);
        }
    }

    _onMouseLeave(event) {
        for (const m of this.markers) m.onLeaveMap?.(event);
    }

    _onContextMenu(event) {
        event.originalEvent.preventDefault();
        // While drawing a path, RMB cancels — let the PathMarker intercept first
        // (it's last in the priority list otherwise).
        if (this.isPathDrawing) {
            const path = this.markers.find(m => m instanceof Marker.Path);
            if (path?.onContextMenu?.(event, {})) return;
        }
        const grouped = this._featuresAt(event.point);
        for (const m of this.markers) {
            if (m.onContextMenu?.(event, grouped)) break;
        }
    }

    // ── Feature query ─────────────────────────────────────────────────
    _featuresAt(point, layers) {
        if (!layers) layers = this.markers.flatMap(m => m.layerIDs ?? []).filter(Boolean);
        const raw = this.map.queryRenderedFeatures(point, { layers });
        const grouped = Object.fromEntries(layers.map(id => [id, []]));
        for (const f of raw) if (grouped[f.layer.id]) grouped[f.layer.id].push(f);
        return grouped;
    }

    _collectFor(marker, grouped) {
        if (!marker.layerIDs?.length) return [];
        return marker.layerIDs.flatMap(id => grouped[id] ?? []);
    }

    /** True if a custom-marker icon or label is rendered under the given screen point. */
    isOverCustomMarker(point) {
        const custom = this.markers.find(m => m instanceof Marker.Custom);
        const ids = (custom?.layerIDs ?? []).filter(id => this.map.getLayer(id));
        if (!ids.length) return false;
        return this.map.queryRenderedFeatures(point, { layers: ids }).length > 0;
    }

    // ── Initial view ──────────────────────────────────────────────────
    _setInitialView() {
        const { x, y, scale } = this.scene.initial ?? {};
        if (x != null && y != null) this.map.setCenter(this.sceneToLngLat(x, y));
        if (scale) this.map.setZoom(scale);
    }

    // ── Load persisted data ───────────────────────────────────────────
    async _loadPersisted() {
        const custom = this.markers.find(m => m instanceof Marker.Custom);
        const path = this.markers.find(m => m instanceof Marker.Path);
        await custom?.loadFromScene?.();
        path?.loadFromScene?.();
    }

    // ── Exposed API ───────────────────────────────────────────────────
    refreshPathStyle() {
        for (const m of this.markers) m.refreshPathStyle?.();
    }
}
