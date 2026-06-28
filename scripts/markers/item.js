import { Marker } from "./marker.js";
import { showContextMenu, scaleFieldHtml, wireScaleSliders, percentToScale, clampScaleValue } from "../utils.js";

import { MODULE_ID } from "../constants.js";
/**
 * Base class for Foundry document markers (tokens, notes).
 * Handles GeoJSON source/layer management, drag, hover, and image loading.
 */
export class ItemMarker extends Marker {
    constructor(mapMarkers) {
        super(mapMarkers);
    }

    reset() {
        super.reset();
        this.ids = new Set();
        this.features = [];
        this.scalableFeatures = [];
        this.labels = [];
        this.scalableLabels = [];
        this.hovering = new Set();
        this.dragging = { id: null, point: null, active: false };
        this._deleteSourceLayers();
        this._createSourceLayers();
        this.updateAll();
    }

    destroy() {
        this._deleteSourceLayers();
        super.destroy();
    }

    // ── Document sync ─────────────────────────────────────────────────
    createMarker(data = {}) {
        const { id } = data;
        if (!id || this.ids.has(id) || !this._itemVisible(data)) return;
        this.ids.add(id);
        this._createImage(data);
        this._createFeature(data);
    }

    updateMarker(data = {}) {
        const { id } = data;
        if (!this._itemVisible(data)) { this.deleteMarker(data); return; }
        if (!this.ids.has(id)) { this.createMarker(data); return; }
        if (data.updateImage) this._updateImage(data);
        this._updateFeature(data);
    }

    deleteMarker(data = {}) {
        const { id } = data;
        if (!id || !this.ids.has(id)) return;
        this.ids.delete(id);
        this._deleteFeature(data);
    }

    updateAll() {
        const newIDs = this.sceneItems;
        newIDs.difference(this.ids).forEach(id => this.createMarker({ item: this.getItem(id), id }));
        this.ids.intersection(newIDs).forEach(id => this.updateMarker({ item: this.getItem(id), id }));
        this.ids.difference(newIDs).forEach(id => this.deleteMarker({ item: this.getItem(id), id }));
    }

    // ── Layer management ──────────────────────────────────────────────
    _createSourceLayers() {
        if (!this.source) this.map.addSource(this.sourceID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        if (!this.layer) this.map.addLayer({
            id: this.layerID, type: "symbol", source: this.sourceID,
            layout: { "icon-image": ["get", "imageID"], "icon-size": this._zoomScaledSize(0.25), "icon-allow-overlap": true }
        });
        if (!this.scalableSource) this.map.addSource(this.scalableSourceID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        if (!this.scalableLayer) this.map.addLayer({
            id: this.scalableLayerID, type: "symbol", source: this.scalableSourceID,
            layout: {
                "icon-image": ["get", "imageID"],
                "icon-size": this._zoomScaledSize(0.25),
                "icon-allow-overlap": true, "icon-ignore-placement": true
            }
        });
        if (!this.labelSource) this.map.addSource(this.labelSourceID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        if (!this.labelLayer) this.map.addLayer({
            id: this.labelLayerID, type: "symbol", source: this.labelSourceID,
            layout: {
                "text-field": ["get", "label"],
                "text-size": this._zoomScaledSize(24),
                "text-anchor": "top", "text-offset": [0, 1],
                "text-font": ["NotoSans-Medium"],
                "text-allow-overlap": true, "text-ignore-placement": true
            },
            paint: { "text-color": "#ffffff", "text-halo-color": "#000000", "text-halo-width": 1 }
        });
        if (!this.scalableLabelSource) this.map.addSource(this.scalableLabelSourceID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        if (!this.scalableLabelLayer) this.map.addLayer({
            id: this.scalableLabelLayerID, type: "symbol", source: this.scalableLabelSourceID,
            layout: {
                "text-field": ["get", "label"],
                "text-size": this._zoomScaledSize(24),
                "text-anchor": "top", "text-offset": [0, 1],
                "text-font": ["NotoSans-Medium"],
                "text-allow-overlap": true, "text-ignore-placement": true
            },
            paint: { "text-color": "#ffffff", "text-halo-color": "#000000", "text-halo-width": 1 }
        });
    }

    /**
     * Linear zoom-driven size (small when zoomed out, capped at `maxSize` when
     * zoomed in) with the per-feature manual scale baked into each output stop.
     *
     * MapLibre requires `["zoom"]` to be the direct input of a top-level
     * interpolate/step — it cannot be nested inside arithmetic. So the manual
     * scale multiplier is applied to the interpolation OUTPUTS rather than
     * wrapping the whole expression in `["*", …]` (which silently invalidates
     * the layer and makes the icon/label disappear).
     */
    _zoomScaledSize(maxSize) {
        const scale = ["coalesce", ["get", "scale"], 1];
        return ["interpolate", ["linear"], ["zoom"],
            0, ["*", maxSize * 0.3, scale],
            6, ["*", maxSize * 0.7, scale],
            9, ["*", maxSize, scale]];
    }

    _deleteSourceLayers() {
        for (const id of this.layerIDs) if (this.map?.getLayer(id)) this.map.removeLayer(id);
        for (const id of this.sourceIDs) if (this.map?.getSource(id)) this.map.removeSource(id);
    }

    async _createImage(data = {}) {
        const { item, id } = data;
        if (!id || !item) return;
        const imageURL = this.getImageURL(item);
        const imageID = this._imageID(id);
        if (this.map.hasImage(imageID)) return;
        const image = await this.map.loadImage(imageURL);
        const normalized = await this._normalizeImage(image, 64 * this.getSize(id));
        this.map.addImage(imageID, normalized);
    }

    async _updateImage(data = {}) {
        const { item, id } = data;
        if (!id || !item) return;
        const imageID = this._imageID(id);
        const image = await this.map.loadImage(this.getImageURL(item));
        const normalized = await this._normalizeImage(image, 64 * this.getSize(id));
        if (this.map.hasImage(imageID)) this.map.removeImage(imageID);
        this.map.addImage(imageID, normalized);
    }

    _createFeature(data = {}) {
        let { id, item, lng, lat } = data;
        if (!id) return;
        if (lng == null || lat == null) {
            if (!item) return;
            ({ lng, lat } = this.sceneToLngLat(item.x, item.y));
        }
        const imageID = this._imageID(id);
        const scalable = this.getScalable(id);
        const features = scalable ? this.scalableFeatures : this.features;
        const source = scalable ? this.scalableSource : this.source;
        features.push({ type: "Feature", geometry: { type: "Point", coordinates: [lng, lat] }, properties: { id, imageID, scale: this.getIconScale(id) } });
        source?.setData({ type: "FeatureCollection", features });

        const label = this.getName(id);
        if (label) {
            const labels = scalable ? this.scalableLabels : this.labels;
            const labelSource = scalable ? this.scalableLabelSource : this.labelSource;
            labels.push({ type: "Feature", geometry: { type: "Point", coordinates: [lng, lat] }, properties: { id, label, scale: this.getLabelScale(id) } });
            labelSource?.setData({ type: "FeatureCollection", features: labels });
        }
    }

    _updateFeature(data = {}) {
        let { id, item, lng, lat } = data;
        if (!id) return;
        if (lng == null || lat == null) {
            if (!item) return;
            ({ lng, lat } = this.sceneToLngLat(item.x, item.y));
        }
        const f1 = this.features.find(f => f.properties.id === id);
        const f2 = this.scalableFeatures.find(f => f.properties.id === id);
        // Recreate (rather than just move) when the feature must move between the
        // fixed/scalable source, or when the manual scale changed (rebuilds props).
        if (data.updateScale || !!f1 === !!f2 || (data.updateScalable && ((this.getScalable(id) && f1) || (!this.getScalable(id) && f2)))) {
            this._deleteFeature(data);
            this._createFeature(data);
            return;
        }
        const source = f1 ? this.source : this.scalableSource;
        const features = f1 ? this.features : this.scalableFeatures;
        const feature = f1 || f2;
        if (feature) { feature.geometry.coordinates = [lng, lat]; source?.setData({ type: "FeatureCollection", features }); }

        const l1 = this.labels.find(l => l.properties.id === id);
        const l2 = this.scalableLabels.find(l => l.properties.id === id);
        const labelSource = l1 ? this.labelSource : this.scalableLabelSource;
        const labels = l1 ? this.labels : this.scalableLabels;
        const label = l1 || l2;
        if (label) { label.geometry.coordinates = [lng, lat]; labelSource?.setData({ type: "FeatureCollection", features: labels }); }
    }

    _deleteFeature(data = {}) {
        const { id } = data;
        if (!id) return;
        const del = (arr, source) => {
            const idx = arr.findIndex(f => f.properties.id === id);
            if (idx !== -1) { arr.splice(idx, 1); source?.setData({ type: "FeatureCollection", features: arr }); }
        };
        del(this.features, this.source);
        del(this.scalableFeatures, this.scalableSource);
        del(this.labels, this.labelSource);
        del(this.scalableLabels, this.scalableLabelSource);
    }

    // ── Getters ───────────────────────────────────────────────────────
    get type() { throw new Error(`${this.constructor.name}.type must be implemented`); }
    get sceneItems() { throw new Error(`${this.constructor.name}.sceneItems must be implemented`); }
    get sourceID() { return `${this.type}-source`; }
    get source() { return this.map.getSource(this.sourceID); }
    get layerID() { return `${this.type}-layer`; }
    get layer() { return this.map.getLayer(this.layerID); }
    get scalableSourceID() { return `${this.type}-scalable-source`; }
    get scalableSource() { return this.map.getSource(this.scalableSourceID); }
    get scalableLayerID() { return `${this.type}-scalable-layer`; }
    get scalableLayer() { return this.map.getLayer(this.scalableLayerID); }
    get labelSourceID() { return `${this.type}-label-source`; }
    get labelSource() { return this.map.getSource(this.labelSourceID); }
    get labelLayerID() { return `${this.type}-label-layer`; }
    get labelLayer() { return this.map.getLayer(this.labelLayerID); }
    get scalableLabelSourceID() { return `${this.type}-scalable-label-source`; }
    get scalableLabelSource() { return this.map.getSource(this.scalableLabelSourceID); }
    get scalableLabelLayerID() { return `${this.type}-scalable-label-layer`; }
    get scalableLabelLayer() { return this.map.getLayer(this.scalableLabelLayerID); }
    get sourceIDs() { return [this.sourceID, this.scalableSourceID, this.labelSourceID, this.scalableLabelSourceID]; }
    get layerIDs() { return [this.layerID, this.scalableLayerID, this.labelLayerID, this.scalableLabelLayerID]; }

    // ── Utilities ─────────────────────────────────────────────────────
    getItem(id) { throw new Error(`${this.constructor.name}.getItem() must be implemented`); }
    getImageURL(item) { return item.texture.src; }
    _imageID(id) { return `${this.type}-img-${id}`; }
    getSize(_id) { return 1; }
    getName(_id) { return null; }
    getScalable(_id) { throw new Error(`${this.constructor.name}.getScalable() must be implemented`); }
    /** Per-item manual scale multipliers stored as Atlas Overlay document flags. */
    getIconScale(id) { return clampScaleValue(this.getItem(id)?.getFlag?.(MODULE_ID, "iconScale")); }
    getLabelScale(id) { return clampScaleValue(this.getItem(id)?.getFlag?.(MODULE_ID, "labelScale")); }
    _itemVisible(data) {
        const item = data.item ?? this.getItem(data.id);
        return item && (!item.hidden || game.user.isGM);
    }
    _hasPermission(data, permission = "OWNER") {
        const item = data.item ?? this.getItem(data.id);
        return item?.testUserPermission(game.user, permission);
    }
    async _normalizeImage(image, size = 64) {
        if (image.data.width === size && image.data.height === size) return image.data;
        const canvas = document.createElement("canvas");
        canvas.width = size; canvas.height = size;
        canvas.getContext("2d").drawImage(image.data, 0, 0, size, size);
        return createImageBitmap(canvas);
    }

    // ── Events ────────────────────────────────────────────────────────
    onMouseMove(event, markerFeatures) {
        if (this.dragging.id) { this._onDrag(event); return; }

        const newIDs = new Set(markerFeatures.map(f => f.properties.id));
        this.hovering.difference(newIDs).forEach(id => this._setHover(id, false));
        newIDs.difference(this.hovering).forEach(id => this._setHover(id, true));
    }

    onLeaveMap() {
        for (const id of [...this.hovering]) this._setHover(id, false);
    }

    _setHover(id, entering) {
        if (entering) {
            this.hovering.add(id);
            this.map.getCanvas().style.cursor = "pointer";
        } else {
            this.hovering.delete(id);
            if (!this.hovering.size && !this.dragging.id) this.map.getCanvas().style.cursor = "";
        }
    }

    onClick(event, properties = {}) {
        const { id } = properties;
        if (!id || this.dragging.id) return;
        this.getItem(id)?.object?.control?.({ releaseOthers: true });
    }

    onGrab(event, properties = {}) {
        const { id } = properties;
        if (!id || !this._hasPermission({ id }) || this.dragging.id) return;
        for (const hid of [...this.hovering]) this._setHover(hid, false);
        this.dragging = { id, point: event.point, active: false };
        this.map.dragPan.disable();
        this.map.getCanvas().style.cursor = "grabbing";
    }

    _onDrag(event) {
        if (!this.dragging.active) {
            const dx = event.point.x - this.dragging.point.x;
            const dy = event.point.y - this.dragging.point.y;
            this.dragging.active = dx * dx + dy * dy > 9;
        }
        if (this.dragging.active) {
            const { lng, lat } = this.map.unproject(event.point);
            this._updateFeature({ id: this.dragging.id, lng, lat });
        }
    }

    onRelease(event) {
        if (this.dragging.active) {
            const { lng, lat } = this.map.unproject(event.point);
            const { x, y } = this.lngLatToScene(lng, lat);
            this.getItem(this.dragging.id)?.update({ x, y }, { animation: { duration: 1000 } });
        }
        this.dragging = { id: null, point: null, active: false };
        this.map.dragPan.enable();
        this.map.getCanvas().style.cursor = "";
    }

    // Custom markers and paths are added to the map after token/note layers, so
    // they render ABOVE them. The event dispatch visits token/note markers first,
    // so when an editable marker/path overlaps a token we must yield to it —
    // otherwise a GM right-clicking the visibly-top marker only gets the scale
    // dialog and can't reach edit/delete. These are the higher-z layers to defer to.
    static OVERLAY_LAYER_IDS = ["custom-icon-sdf", "custom-icon-img", "custom-label-layer", "path-layer", "path-hit-layer"];

    onContextMenu(event, features) {
        if (!game.user.isGM) return false;
        const id = this.layerIDs.flatMap(lid => features[lid] ?? [])[0]?.properties?.id;
        if (!id) return false;
        // Defer to a custom marker / path rendered above this token or note.
        if (ItemMarker.OVERLAY_LAYER_IDS.some(lid => (features[lid] ?? []).length)) return false;
        showContextMenu(event.originalEvent, [
            { label: game.i18n.localize("ATLAS.contextMenu.adjustScale"), action: () => this.showScaleDialog(id) }
        ]);
        return true;
    }

    showScaleDialog(id) {
        const item = this.getItem(id);
        if (!item) return;
        const iconScale = item.getFlag(MODULE_ID, "iconScale") ?? 1;
        const labelScale = item.getFlag(MODULE_ID, "labelScale") ?? 1;
        const content = `
            <form class="globe-dialog-form">
                ${scaleFieldHtml({ labelText: game.i18n.localize("ATLAS.dialog.scale.iconScale"), name: "iconScale", value: iconScale })}
                ${scaleFieldHtml({ labelText: game.i18n.localize("ATLAS.dialog.scale.labelScale"), name: "labelScale", value: labelScale })}
            </form>
        `;
        new Dialog({
            title: game.i18n.localize("ATLAS.dialog.scale.title"),
            content,
            buttons: {
                reset: {
                    label: game.i18n.localize("ATLAS.dialog.scale.reset"),
                    callback: async () => {
                        await item.unsetFlag(MODULE_ID, "iconScale");
                        await item.unsetFlag(MODULE_ID, "labelScale");
                    }
                },
                cancel: { label: game.i18n.localize("ATLAS.dialog.editPath.cancel") },
                ok: {
                    label: game.i18n.localize("ATLAS.dialog.editPath.save"),
                    callback: async (html) => {
                        await item.setFlag(MODULE_ID, "iconScale", percentToScale(html.find('[name="iconScale"]').val()));
                        await item.setFlag(MODULE_ID, "labelScale", percentToScale(html.find('[name="labelScale"]').val()));
                    }
                }
            },
            default: "ok",
            render: (html) => wireScaleSliders(html)
        }).render(true);
    }
}
