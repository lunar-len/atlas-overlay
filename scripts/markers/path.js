import { Marker } from "./marker.js";
import { showContextMenu } from "../utils.js";
import * as turf from "../../lib/turf/turf-bundle.js";

const MODULE_ID = "atlas-overlay";
const FLAG_KEY = "paths";
const DEFAULT_COLOR = "#e0b040";
const DEFAULT_TEXT_COLOR = "#ffffff";
const DEFAULT_HALO_COLOR = "#000000";

/**
 * Persistent drawn paths on the globe.
 * GMs activate draw mode via the scene controls toolbar, click to place points,
 * and finish by clicking the button again, pressing Escape/Enter, or double-clicking.
 * Right-click a path to edit or delete it.
 */
export class PathMarker extends Marker {
    constructor(mapMarkers) {
        super(mapMarkers);
        this.isDrawingMode = false;
        this._escHandler = (e) => {
            if (!this.isDrawingMode) return;
            if (e.key === "Escape") this._cancelDrawing();
            else if (e.key === "Enter") this.toggleDrawMode();
        };
        document.addEventListener("keydown", this._escHandler);
        this._createLayers();
    }

    reset() {
        this.paths = [];
        this.currentPath = null;
    }

    destroy() {
        document.removeEventListener("keydown", this._escHandler);
        this._removeLayers();
        if (this.isDrawingMode) this.map?.dragPan?.enable();
        super.destroy();
    }

    // ── Source / Layer IDs ────────────────────────────────────────────
    get pathSourceID() { return "path-source"; }
    get pathSource() { return this.map?.getSource(this.pathSourceID); }
    get pathLayerID() { return "path-layer"; }
    get pathLayer() { return this.map?.getLayer(this.pathLayerID); }
    get pathHitLayerID() { return "path-hit-layer"; }
    get pathHitLayer() { return this.map?.getLayer(this.pathHitLayerID); }
    get labelSourceID() { return "path-label-source"; }
    get labelSource() { return this.map?.getSource(this.labelSourceID); }
    get labelLayerID() { return "path-label-layer"; }
    get labelLayer() { return this.map?.getLayer(this.labelLayerID); }
    get previewSourceID() { return "path-preview-source"; }
    get previewSource() { return this.map?.getSource(this.previewSourceID); }
    get previewLayerID() { return "path-preview-layer"; }
    get previewLayer() { return this.map?.getLayer(this.previewLayerID); }
    get sourceIDs() { return [this.pathSourceID, this.labelSourceID, this.previewSourceID]; }
    get layerIDs() { return [this.pathLayerID, this.pathHitLayerID, this.labelLayerID, this.previewLayerID]; }

    _emptyFC() { return { type: "FeatureCollection", features: [] }; }

    _createLayers() {
        if (!this.map) return;
        const style = game.settings?.get(MODULE_ID, "pathStyle") ?? "solid";
        const dashArray = style === "dashed" ? [6, 4] : [1];

        if (!this.pathSource) this.map.addSource(this.pathSourceID, { type: "geojson", data: this._emptyFC() });
        if (!this.pathLayer) this.map.addLayer({
            id: this.pathLayerID, type: "line", source: this.pathSourceID,
            paint: {
                "line-color": ["coalesce", ["get", "color"], DEFAULT_COLOR],
                "line-width": 3,
                "line-dasharray": dashArray
            }
        });

        // Reuse the same source — wide transparent line for easier click detection
        if (!this.pathHitLayer) this.map.addLayer({
            id: this.pathHitLayerID, type: "line", source: this.pathSourceID,
            paint: { "line-color": "#000000", "line-width": 30, "line-opacity": 0.001 }
        });

        if (!this.labelSource) this.map.addSource(this.labelSourceID, { type: "geojson", data: this._emptyFC() });
        if (!this.labelLayer) this.map.addLayer({
            id: this.labelLayerID, type: "symbol", source: this.labelSourceID,
            layout: {
                "text-field": ["get", "label"],
                "text-size": 13,
                "text-anchor": "center",
                "text-font": ["NotoSans-Medium"],
                "text-allow-overlap": false,
                "text-ignore-placement": false,
            },
            paint: {
                "text-color": ["coalesce", ["get", "textColor"], DEFAULT_TEXT_COLOR],
                "text-halo-color": ["coalesce", ["get", "haloColor"], DEFAULT_HALO_COLOR],
                "text-halo-width": 2.5
            }
        });

        if (!this.previewSource) this.map.addSource(this.previewSourceID, { type: "geojson", data: this._emptyFC() });
        if (!this.previewLayer) this.map.addLayer({
            id: this.previewLayerID, type: "line", source: this.previewSourceID,
            paint: { "line-color": "#88aaff", "line-width": 2, "line-dasharray": [4, 3] }
        });
    }

    _removeLayers() {
        if (!this.map) return;
        for (const id of this.layerIDs) if (this.map.getLayer(id)) this.map.removeLayer(id);
        for (const id of this.sourceIDs) if (this.map.getSource(id)) this.map.removeSource(id);
    }

    // ── Map listeners ─────────────────────────────────────────────────
    addMapListeners() {
        this.map.on("dblclick", (e) => {
            if (!this.isDrawingMode) return;
            e.preventDefault();
            this._popLastPoint();
            this.toggleDrawMode();
        });
    }

    // ── Live sync ─────────────────────────────────────────────────────
    addFoundryHooks() {
        // Paths live in scene flags. When the GM finalizes/edits/deletes a path,
        // setFlag fires `updateScene` on every client — reload so players see it
        // without re-entering the scene. Skip while this client is mid-draw.
        this.mapMarkers.addFoundryHook("updateScene", (scene, changes) => {
            if (scene.id !== this.scene.id) return;
            if (!foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.${FLAG_KEY}`)) return;
            if (this.isDrawingMode) return;
            this.loadFromScene();
        });
    }

    // ── Draw mode ─────────────────────────────────────────────────────
    toggleDrawMode() {
        if (!game.user.isGM) return;
        this.isDrawingMode = !this.isDrawingMode;
        if (this.isDrawingMode) {
            this.currentPath = {
                id: crypto.randomUUID(),
                label: null,
                points: [],
                totalDistance: 0,
                color: DEFAULT_COLOR,
                textColor: DEFAULT_TEXT_COLOR,
                haloColor: DEFAULT_HALO_COLOR,
                showDistance: true,
                showLabel: true
            };
            this.map.dragPan.disable();
            ui.notifications?.info(game.i18n?.localize("ATLAS.notification.drawPathActive") ?? "Click on the globe to place waypoints. Double-click or press Enter to finish.");
        } else {
            this._finalizePath();
            this.map.dragPan.enable();
        }
        ui.controls.render();
    }

    _cancelDrawing() {
        this.currentPath = null;
        this.previewSource?.setData(this._emptyFC());
        this.isDrawingMode = false;
        this.map.dragPan.enable();
        ui.controls.render();
    }

    consumesClicks() { return this.isDrawingMode; }

    onConsumedClick(event) {
        const { lng, lat } = this.map.unproject(event.point);
        this._addPoint([lng, lat]);
    }

    _addPoint([lng, lat]) {
        const pts = this.currentPath.points;
        if (pts.length > 0) {
            const last = pts[pts.length - 1];
            this.currentPath.totalDistance += turf.distance(last, [lng, lat], { units: "kilometers" });
        }
        pts.push([lng, lat]);
        this._updatePreview();
    }

    _popLastPoint() {
        if (!this.currentPath?.points?.length) return;
        const pts = this.currentPath.points;
        if (pts.length >= 2) {
            this.currentPath.totalDistance -= turf.distance(pts[pts.length - 2], pts[pts.length - 1], { units: "kilometers" });
        }
        pts.pop();
    }

    _finalizePath() {
        if (this.currentPath?.points?.length >= 2) {
            this.paths.push(this.currentPath);
            this._refreshPaths();
            this._saveToScene();
        }
        this.currentPath = null;
        this.previewSource?.setData(this._emptyFC());
    }

    _updatePreview(mousePos = null) {
        if (!this.currentPath?.points?.length) {
            this.previewSource?.setData(this._emptyFC());
            return;
        }
        const coords = [...this.currentPath.points];
        if (mousePos) coords.push(mousePos);
        this.previewSource?.setData({
            type: "FeatureCollection",
            features: [{
                type: "Feature",
                geometry: { type: "LineString", coordinates: coords },
                properties: {}
            }]
        });
    }

    // ── Render ────────────────────────────────────────────────────────
    _refreshPaths() {
        const lineFeatures = this.paths.map(p => ({
            type: "Feature",
            geometry: { type: "LineString", coordinates: p.points },
            properties: { id: p.id, color: p.color ?? DEFAULT_COLOR }
        }));
        this.pathSource?.setData({ type: "FeatureCollection", features: lineFeatures });

        const labelFeatures = this.paths.map(p => {
            const mid = p.points[Math.floor(p.points.length / 2)];
            const showLabel = p.showLabel ?? true;
            const showDist = p.showDistance ?? true;
            const parts = [
                showLabel ? p.label : null,
                showDist ? this._formatDistance(p.totalDistance) : null
            ].filter(Boolean);
            if (!parts.length) return null;
            return {
                type: "Feature",
                geometry: { type: "Point", coordinates: mid },
                properties: {
                    id: p.id,
                    label: parts.join("\n"),
                    textColor: p.textColor ?? DEFAULT_TEXT_COLOR,
                    haloColor: p.haloColor ?? DEFAULT_HALO_COLOR
                }
            };
        }).filter(Boolean);
        this.labelSource?.setData({ type: "FeatureCollection", features: labelFeatures });
    }

    _formatDistance(km) {
        if (km < 1) return `${(km * 1000).toFixed(0)} m`;
        return `${km.toFixed(1)} km`;
    }

    // ── Persistence ───────────────────────────────────────────────────
    loadFromScene() {
        this.paths = foundry.utils.deepClone(this.scene.getFlag(MODULE_ID, FLAG_KEY) ?? []);
        this._refreshPaths();
    }

    async _saveToScene() {
        await this.scene.setFlag(MODULE_ID, FLAG_KEY, this.paths);
    }

    // ── Path style setting ────────────────────────────────────────────
    refreshPathStyle() {
        const style = game.settings.get(MODULE_ID, "pathStyle");
        if (this.map?.getLayer(this.pathLayerID)) {
            this.map.setPaintProperty(this.pathLayerID, "line-dasharray", style === "dashed" ? [6, 4] : [1]);
        }
    }

    // ── Edit dialog ───────────────────────────────────────────────────
    showEditDialog(id) {
        const path = this.paths.find(p => p.id === id);
        if (!path) return;
        new Dialog({
            title: game.i18n.localize("ATLAS.dialog.editPath.title"),
            content: this._buildEditForm(path),
            buttons: {
                delete: {
                    label: `<span style="color:#ff7070">${game.i18n.localize("ATLAS.dialog.editPath.delete")}</span>`,
                    callback: async () => {
                        await this.deletePath(id);
                    }
                },
                cancel: { label: game.i18n.localize("ATLAS.dialog.editPath.cancel") },
                ok: {
                    label: game.i18n.localize("ATLAS.dialog.editPath.save"),
                    callback: async (html) => {
                        path.label = html.find('[name="label"]').val().trim() || null;
                        path.color = html.find('[name="color"]').val() || DEFAULT_COLOR;
                        path.textColor = html.find('[name="textColor"]').val() || DEFAULT_TEXT_COLOR;
                        path.haloColor = html.find('[name="haloColor"]').val() || DEFAULT_HALO_COLOR;
                        path.showDistance = html.find('[name="showDistance"]').prop("checked");
                        path.showLabel = html.find('[name="showLabel"]').prop("checked");
                        this._refreshPaths();
                        await this._saveToScene();
                    }
                }
            },
            default: "ok"
        }).render(true);
    }

    _buildEditForm(path) {
        const label = path.label ?? "";
        const color = path.color ?? DEFAULT_COLOR;
        const textColor = path.textColor ?? DEFAULT_TEXT_COLOR;
        const haloColor = path.haloColor ?? DEFAULT_HALO_COLOR;
        const showDistance = path.showDistance ?? true;
        const showLabel = path.showLabel ?? true;
        const safeLabel = this._escapeHtml(label);
        return `
            <form class="globe-dialog-form">
                <div class="form-group">
                    <label>${game.i18n.localize("ATLAS.dialog.editPath.label")}</label>
                    <input name="label" type="text" value="${safeLabel}" placeholder="Optional name" autofocus />
                </div>
                <div class="form-group color-row">
                    <div class="color-field">
                        <label>${game.i18n.localize("ATLAS.dialog.editPath.color")}</label>
                        <input name="color" type="color" value="${color}" />
                    </div>
                    <div class="color-field">
                        <label>${game.i18n.localize("ATLAS.dialog.editPath.textColor")}</label>
                        <input name="textColor" type="color" value="${textColor}" />
                    </div>
                    <div class="color-field">
                        <label>${game.i18n.localize("ATLAS.dialog.editPath.haloColor")}</label>
                        <input name="haloColor" type="color" value="${haloColor}" />
                    </div>
                </div>
                <div class="form-group checkbox-row">
                    <input name="showLabel" type="checkbox" ${showLabel ? "checked" : ""} />
                    <label>${game.i18n.localize("ATLAS.dialog.editPath.showLabel")}</label>
                </div>
                <div class="form-group checkbox-row">
                    <input name="showDistance" type="checkbox" ${showDistance ? "checked" : ""} />
                    <label>${game.i18n.localize("ATLAS.dialog.editPath.showDistance")}</label>
                </div>
            </form>
        `;
    }

    async deletePath(id, { confirm = true } = {}) {
        const path = this.paths.find(p => p.id === id);
        if (!path) return false;
        if (confirm) {
            const ok = await this._confirmDelete(path.label || game.i18n.localize("ATLAS.manager.unnamedPath"));
            if (!ok) return false;
        }
        this.paths = this.paths.filter(p => p.id !== id);
        this._refreshPaths();
        await this._saveToScene();
        return true;
    }

    async _confirmDelete(name) {
        return Dialog.confirm({
            title: game.i18n.localize("ATLAS.dialog.confirmDelete.title"),
            content: `<p>${game.i18n.format("ATLAS.dialog.confirmDelete.body", { name })}</p>`,
            defaultYes: false
        });
    }

    // ── Manager dialog ────────────────────────────────────────────────
    showManager() {
        const rowsHtml = this.paths.length
            ? this.paths.map(p => this._renderManagerRow(p)).join("")
            : `<p class="globe-manager-empty">${game.i18n.localize("ATLAS.manager.noPaths")}</p>`;
        const tableHtml = this.paths.length ? `
            <table class="globe-manager-table">
                <thead>
                    <tr>
                        <th>${game.i18n.localize("ATLAS.manager.col.name")}</th>
                        <th>${game.i18n.localize("ATLAS.manager.col.distance")}</th>
                        <th>${game.i18n.localize("ATLAS.manager.col.points")}</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        ` : rowsHtml;
        const content = `<div class="globe-manager">${tableHtml}</div>`;
        const dlg = new Dialog({
            title: game.i18n.localize("ATLAS.manager.pathsTitle"),
            content,
            buttons: { close: { label: game.i18n.localize("ATLAS.manager.close") } },
            default: "close",
            render: (html) => this._wireManagerActions(html, dlg)
        }, { width: 560, classes: ["dialog", "globe-manager-dialog"] });
        dlg.render(true);
    }

    _renderManagerRow(p) {
        const name = p.label
            ? this._escapeHtml(p.label)
            : `<i style="color:#888">${game.i18n.localize("ATLAS.manager.unnamedPath")}</i>`;
        const swatch = `<span class="globe-color-swatch" style="background:${p.color ?? DEFAULT_COLOR}"></span>`;
        const dist = this._formatDistance(p.totalDistance);
        const pts = p.points.length;
        return `
            <tr data-id="${p.id}">
                <td>${swatch} ${name}</td>
                <td class="coords">${dist}</td>
                <td class="coords">${pts}</td>
                <td class="actions">
                    <button type="button" data-action="pan-to" title="${game.i18n.localize("ATLAS.manager.panTo")}"><i class="fa-solid fa-crosshairs"></i></button>
                    <button type="button" data-action="edit" title="${game.i18n.localize("ATLAS.contextMenu.edit")}"><i class="fa-solid fa-pen"></i></button>
                    <button type="button" data-action="delete" title="${game.i18n.localize("ATLAS.contextMenu.delete")}" class="danger"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>
        `;
    }

    _wireManagerActions(html, dlg) {
        const $html = html.jquery ? html : $(html);
        $html.on("click", "button[data-action]", async (e) => {
            e.preventDefault();
            const btn = e.currentTarget;
            const row = btn.closest("tr[data-id]");
            const id = row?.dataset.id;
            if (!id) return;
            const path = this.paths.find(p => p.id === id);
            if (!path) return;
            const action = btn.dataset.action;
            if (action === "pan-to") {
                const mid = path.points[Math.floor(path.points.length / 2)] ?? path.points[0];
                if (mid) this.map.flyTo({ center: mid, duration: 800 });
                dlg.close();
            } else if (action === "edit") {
                dlg.close();
                this.showEditDialog(id);
            } else if (action === "delete") {
                const removed = await this.deletePath(id);
                if (removed) row.remove();
                if (!this.paths.length) {
                    $html.find(".globe-manager").html(`<p class="globe-manager-empty">${game.i18n.localize("ATLAS.manager.noPaths")}</p>`);
                }
            }
        });
    }

    _escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        }[c]));
    }

    // ── Event handlers ────────────────────────────────────────────────
    onMouseMove(event, _markerFeatures) {
        if (!this.isDrawingMode || !this.currentPath?.points?.length) return;
        const { lng, lat } = this.map.unproject(event.point);
        this._updatePreview([lng, lat]);
    }

    onContextMenu(event, features) {
        // RMB during draw mode cancels drawing (UX shortcut equivalent to Escape)
        if (this.isDrawingMode) { this._cancelDrawing(); return true; }

        const hitFeature = (features[this.pathHitLayerID] ?? [])[0]
            ?? (features[this.pathLayerID] ?? [])[0];
        if (!hitFeature || !game.user.isGM) return false;

        const id = hitFeature.properties.id;
        showContextMenu(event.originalEvent, [
            { label: game.i18n.localize("ATLAS.contextMenu.editPath"), action: () => this.showEditDialog(id) },
            { label: game.i18n.localize("ATLAS.contextMenu.delete"), danger: true, action: () => this.deletePath(id) },
        ]);
        return true;
    }
}
