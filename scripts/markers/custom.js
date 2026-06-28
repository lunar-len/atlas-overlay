import { Marker } from "./marker.js";
import { showContextMenu, scaleFieldHtml, wireScaleSliders, percentToScale, clampScaleValue, escapeHtml, confirmDelete, safeColor } from "../utils.js";
import { MODULE_ID } from "../constants.js";
const FLAG_KEY = "custom-markers";
const DEFAULT_ICON_KEY = "custom-default-circle";
const DEFAULT_COLOR = "#e0b040";
const DEFAULT_TEXT_COLOR = "#ffffff";
const DEFAULT_HALO_COLOR = "#000000";
const MAX_ICON_PX = 48;

/**
 * Persistent user-placed markers on the globe.
 * GMs can right-click empty space to create, right-click markers to edit/delete,
 * and LMB-drag markers to reposition them.
 * Any user can double-click a marker to open its linked journal.
 */
export class CustomMarker extends Marker {
    reset() {
        this.data = [];
        this.features = [];
        this.labelFeatures = [];
        this.hovering = null;
        this.dragging = { id: null, startPoint: null, active: false };
        this._removeLayers();
        this._createLayers();
    }

    destroy() {
        this._removeLayers();
        super.destroy();
    }

    // ── Source / Layer IDs ────────────────────────────────────────────
    get sourceID() { return "custom-source"; }
    get source() { return this.map?.getSource(this.sourceID); }
    // Default-circle markers (SDF, tintable) and uploaded-image markers (raster)
    // MUST live in separate symbol layers: MapLibre cannot mix SDF and non-SDF
    // icons in one layer — it would tint raster images with icon-color and flicker
    // the tint on zoom/pan as the render batching changes.
    get iconSdfLayerID() { return "custom-icon-sdf"; }
    get iconImgLayerID() { return "custom-icon-img"; }
    get labelSourceID() { return "custom-label-source"; }
    get labelSource() { return this.map?.getSource(this.labelSourceID); }
    get labelLayerID() { return "custom-label-layer"; }
    get labelLayer() { return this.map?.getLayer(this.labelLayerID); }
    // Topmost-rendered first, so hit-testing (`_collectFor` → onGrab/onContextMenu)
    // picks the marker the user actually sees on top: the raster image layer is
    // added after — and so renders above — the SDF default-circle layer.
    get layerIDs() { return [this.iconImgLayerID, this.iconSdfLayerID, this.labelLayerID]; }
    get sourceIDs() { return [this.sourceID, this.labelSourceID]; }

    // Zoom-driven icon size with the per-marker manual scale baked into the
    // interpolation OUTPUTS (MapLibre forbids ["zoom"] nested inside arithmetic).
    // ~14px → ~38px on screen for the 48px source.
    _iconSizeExpr() {
        return ["interpolate", ["linear"], ["zoom"],
            0, ["*", 0.3, ["coalesce", ["get", "iconScale"], 1]],
            3, ["*", 0.45, ["coalesce", ["get", "iconScale"], 1]],
            6, ["*", 0.65, ["coalesce", ["get", "iconScale"], 1]],
            9, ["*", 0.85, ["coalesce", ["get", "iconScale"], 1]]
        ];
    }

    _createLayers() {
        if (!this.map) return;
        this._ensureDefaultIcon();
        if (!this.source) {
            this.map.addSource(this.sourceID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        }
        // SDF default circle — tinted by icon-color / halo (markers without an uploaded image).
        if (!this.map.getLayer(this.iconSdfLayerID)) {
            this.map.addLayer({
                id: this.iconSdfLayerID, type: "symbol", source: this.sourceID,
                filter: ["!", ["get", "hasImage"]],
                layout: {
                    "icon-image": DEFAULT_ICON_KEY,
                    "icon-size": this._iconSizeExpr(),
                    "icon-allow-overlap": true,
                    "icon-ignore-placement": true,
                },
                paint: {
                    "icon-color": ["coalesce", ["get", "color"], DEFAULT_COLOR],
                    "icon-halo-color": ["coalesce", ["get", "haloColor"], DEFAULT_HALO_COLOR],
                    "icon-halo-width": 1.5
                }
            });
        }
        // Raster uploaded images — rendered with their own colors, never tinted.
        if (!this.map.getLayer(this.iconImgLayerID)) {
            this.map.addLayer({
                id: this.iconImgLayerID, type: "symbol", source: this.sourceID,
                filter: ["get", "hasImage"],
                layout: {
                    "icon-image": ["get", "imageKey"],
                    "icon-size": this._iconSizeExpr(),
                    "icon-allow-overlap": true,
                    "icon-ignore-placement": true,
                }
            });
        }
        if (!this.labelSource) {
            this.map.addSource(this.labelSourceID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        }
        if (!this.labelLayer) {
            this.map.addLayer({
                id: this.labelLayerID, type: "symbol", source: this.labelSourceID,
                layout: {
                    "text-field": ["get", "label"],
                    // Zoom-driven base size with the per-marker manual label scale baked
                    // into the interpolation outputs (["zoom"] must stay top-level).
                    "text-size": ["interpolate", ["linear"], ["zoom"],
                        0, ["*", 10, ["coalesce", ["get", "labelScale"], 1]],
                        4, ["*", 12, ["coalesce", ["get", "labelScale"], 1]],
                        8, ["*", 14, ["coalesce", ["get", "labelScale"], 1]]
                    ],
                    "text-anchor": "top",
                    "text-offset": [0, 0.8],
                    "text-font": ["NotoSans-Medium"],
                    "text-allow-overlap": true,
                    "text-ignore-placement": true,
                },
                paint: {
                    "text-color": ["coalesce", ["get", "textColor"], DEFAULT_TEXT_COLOR],
                    "text-halo-color": ["coalesce", ["get", "haloColor"], DEFAULT_HALO_COLOR],
                    "text-halo-width": 2
                }
            });
        }
    }

    _removeLayers() {
        if (!this.map) return;
        for (const id of this.layerIDs) if (this.map.getLayer(id)) this.map.removeLayer(id);
        for (const id of this.sourceIDs) if (this.map.getSource(id)) this.map.removeSource(id);
    }

    // ── Default icon (SDF circle for tinting) ─────────────────────────
    _ensureDefaultIcon() {
        if (!this.map || this.map.hasImage(DEFAULT_ICON_KEY)) return;
        const size = MAX_ICON_PX;
        const data = new Uint8ClampedArray(size * size * 4);
        const cx = size / 2, cy = size / 2, r = size / 2 - 2;
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const dx = x - cx, dy = y - cy;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const i = (y * size + x) * 4;
                // SDF expects a single-channel alpha mask. MapLibre reads alpha from
                // R/G/B all-white pixels, alpha = mask. Fully-inside = 255 alpha.
                let alpha = 0;
                if (dist <= r - 1) alpha = 255;
                else if (dist < r) alpha = Math.round((r - dist) * 255);
                data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = alpha;
            }
        }
        this.map.addImage(DEFAULT_ICON_KEY, { width: size, height: size, data }, { sdf: true });
    }

    // ── Persistence ───────────────────────────────────────────────────
    async loadFromScene() {
        this.data = foundry.utils.deepClone(this.scene.getFlag(MODULE_ID, FLAG_KEY) ?? []);
        // Pre-load custom icons; default-circle icon is already registered in _createLayers
        await Promise.all(this.data.map(d => this._loadIcon(d.icon)));
        this._refreshFeatures();
    }

    async _saveToScene() {
        await this.scene.setFlag(MODULE_ID, FLAG_KEY, this.data);
    }

    _refreshFeatures() {
        // Markers with `hideIcon: true` skip the icon source entirely — they
        // render as labels only (text annotations on the map).
        this.features = this.data
            .filter(d => !d.hideIcon)
            .map(d => ({
                type: "Feature",
                geometry: { type: "Point", coordinates: [d.lng, d.lat] },
                properties: {
                    id: d.id,
                    imageKey: this._iconKey(d.icon),
                    hasImage: !!d.icon,   // routes to the raster vs SDF icon layer
                    color: d.color ?? DEFAULT_COLOR,
                    haloColor: d.haloColor ?? DEFAULT_HALO_COLOR,
                    iconScale: clampScaleValue(d.iconScale)
                }
            }));
        this.source?.setData({ type: "FeatureCollection", features: this.features });

        this.labelFeatures = this.data
            .filter(d => d.label && (d.showLabel !== false))
            .map(d => ({
                type: "Feature",
                geometry: { type: "Point", coordinates: [d.lng, d.lat] },
                properties: {
                    id: d.id,
                    label: d.label,
                    textColor: d.textColor ?? DEFAULT_TEXT_COLOR,
                    haloColor: d.haloColor ?? DEFAULT_HALO_COLOR,
                    labelScale: clampScaleValue(d.labelScale)
                }
            }));
        this.labelSource?.setData({ type: "FeatureCollection", features: this.labelFeatures });
    }

    // ── Icon loading ──────────────────────────────────────────────────
    _iconKey(iconPath) {
        if (!iconPath) return null;
        return `custom-icon-${iconPath.replace(/[^a-zA-Z0-9]/g, "_")}`;
    }

    /**
     * Resolve a FilePicker path to a loadable URL.
     * External hosts (Forge `assets.forge-vtt.com`, S3 buckets, the Bazaar, …)
     * come through as absolute or protocol-relative URLs and must be used as-is.
     * Only plain relative paths are resolved against the local Foundry host.
     */
    _resolveIconUrl(iconPath) {
        if (/^(https?:)?\/\//i.test(iconPath) || iconPath.startsWith("data:")) return iconPath;
        return `${location.protocol}//${location.host}/${iconPath.replace(/^\//, "")}`;
    }

    async _loadIcon(iconPath) {
        if (!iconPath) return; // default SDF circle is already registered
        const key = this._iconKey(iconPath);
        if (!key || this.map.hasImage(key)) return;
        try {
            const data = await this._fetchToImageData(iconPath, MAX_ICON_PX);
            if (!this.map.hasImage(key)) this.map.addImage(key, data);
        } catch (e) {
            console.warn(`[${MODULE_ID}] Failed to load icon: ${iconPath}`, e);
            // Don't fail — feature will render with default circle via coalesce expression
        }
    }

    /**
     * Load an image via <img> + canvas (handles SVG/PNG/JPG/WEBP), then resize
     * proportionally so its largest dimension is at most maxSize pixels.
     * Returns ImageData ready for map.addImage().
     */
    async _fetchToImageData(iconPath, maxSize) {
        const url = this._resolveIconUrl(iconPath);
        const img = await new Promise((resolve, reject) => {
            const i = new Image();
            i.crossOrigin = "anonymous";
            i.onload = () => resolve(i);
            i.onerror = () => reject(new Error(`Image load failed: ${url}`));
            i.src = url;
        });
        const naturalW = img.naturalWidth || img.width;
        const naturalH = img.naturalHeight || img.height;
        if (!naturalW || !naturalH) throw new Error(`Image has zero dimensions: ${url}`);
        const scale = Math.min(maxSize / naturalW, maxSize / naturalH, 1);
        const w = Math.max(1, Math.round(naturalW * scale));
        const h = Math.max(1, Math.round(naturalH * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        return ctx.getImageData(0, 0, w, h);
    }

    // ── CRUD ──────────────────────────────────────────────────────────
    showCreateDialog(lngLat) {
        new Dialog({
            title: game.i18n.localize("ATLAS.dialog.newMarker.title"),
            content: this._buildForm(),
            buttons: {
                cancel: { label: game.i18n.localize("ATLAS.dialog.editPath.cancel") },
                ok: {
                    label: game.i18n.localize("ATLAS.dialog.newMarker.create"),
                    callback: async (html) => {
                        const d = this._readForm(html);
                        if (!(await this._confirmIfInvisible(d))) return;
                        d.id = crypto.randomUUID();
                        d.lng = lngLat.lng;
                        d.lat = lngLat.lat;
                        await this._loadIcon(d.icon);
                        this.data.push(d);
                        this._refreshFeatures();
                        await this._saveToScene();
                    }
                }
            },
            default: "ok",
            render: (html) => this._wireDialog(html)
        }).render(true);
    }

    showEditDialog(id) {
        const marker = this.data.find(d => d.id === id);
        if (!marker) return;
        new Dialog({
            title: game.i18n.localize("ATLAS.dialog.editMarker.title"),
            content: this._buildForm(marker),
            buttons: {
                delete: {
                    label: `<span style="color:#ff7070">${game.i18n.localize("ATLAS.dialog.editPath.delete")}</span>`,
                    callback: async () => { await this.deleteMarker(id); /* will prompt for confirm */ }
                },
                cancel: { label: game.i18n.localize("ATLAS.dialog.editPath.cancel") },
                ok: {
                    label: game.i18n.localize("ATLAS.dialog.editMarker.save"),
                    callback: async (html) => {
                        const updates = this._readForm(html);
                        if (!(await this._confirmIfInvisible(updates))) return;
                        Object.assign(marker, updates);
                        await this._loadIcon(marker.icon);
                        this._refreshFeatures();
                        await this._saveToScene();
                    }
                }
            },
            default: "ok",
            render: (html) => this._wireDialog(html)
        }).render(true);
    }

    async deleteMarker(id, { confirm = true } = {}) {
        const marker = this.data.find(d => d.id === id);
        if (!marker) return false;
        if (confirm) {
            const ok = await confirmDelete(marker.label || game.i18n.localize("ATLAS.manager.unnamedMarker"));
            if (!ok) return false;
        }
        this.data = this.data.filter(d => d.id !== id);
        this._refreshFeatures();
        await this._saveToScene();
        return true;
    }

    // ── Manager dialog ────────────────────────────────────────────────
    showManager() {
        const rowsHtml = this.data.length
            ? this.data.map(d => this._renderManagerRow(d)).join("")
            : `<p class="globe-manager-empty">${game.i18n.localize("ATLAS.manager.noMarkers")}</p>`;
        const tableHtml = this.data.length ? `
            <table class="globe-manager-table">
                <thead>
                    <tr>
                        <th>${game.i18n.localize("ATLAS.manager.col.name")}</th>
                        <th>${game.i18n.localize("ATLAS.manager.col.coords")}</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        ` : rowsHtml;
        const content = `<div class="globe-manager">${tableHtml}</div>`;
        const dlg = new Dialog({
            title: game.i18n.localize("ATLAS.manager.markersTitle"),
            content,
            buttons: { close: { label: game.i18n.localize("ATLAS.manager.close") } },
            default: "close",
            render: (html) => this._wireManagerActions(html, dlg)
        }, { width: 520, classes: ["dialog", "globe-manager-dialog"] });
        dlg.render(true);
    }

    _renderManagerRow(d) {
        const name = d.label
            ? escapeHtml(d.label)
            : `<i style="color:#888">${game.i18n.localize("ATLAS.manager.unnamedMarker")}</i>`;
        const coords = `${d.lat.toFixed(1)}°, ${d.lng.toFixed(1)}°`;
        const swatch = d.icon
            ? `<i class="fa-solid fa-image" style="color:#aaa;width:14px;"></i>`
            : `<span class="globe-color-swatch" style="background:${safeColor(d.color, DEFAULT_COLOR)}"></span>`;
        return `
            <tr data-id="${d.id}">
                <td>${swatch} ${name}</td>
                <td class="coords">${coords}</td>
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
            const marker = this.data.find(d => d.id === id);
            if (!marker) return;
            const action = btn.dataset.action;
            if (action === "pan-to") {
                this.map.flyTo({ center: [marker.lng, marker.lat], duration: 800 });
                dlg.close();
            } else if (action === "edit") {
                dlg.close();
                this.showEditDialog(id);
            } else if (action === "delete") {
                const removed = await this.deleteMarker(id);
                if (removed) row.remove();
                if (!this.data.length) {
                    $html.find(".globe-manager").html(`<p class="globe-manager-empty">${game.i18n.localize("ATLAS.manager.noMarkers")}</p>`);
                }
            }
        });
    }

    _wireDialog(html) {
        const $html = html.jquery ? html : $(html);
        wireScaleSliders($html);
        $html.find('[data-action="browse-icon"]').on("click", () => {
            const $input = $html.find('[name="icon"]');
            const FilePickerImpl = foundry.applications?.apps?.FilePicker?.implementation
                ?? foundry.applications?.apps?.FilePicker
                ?? globalThis.FilePicker;
            new FilePickerImpl({
                type: "image",
                current: $input.val() || "icons/",
                callback: (path) => $input.val(path)
            }).browse();
        });
    }

    _buildForm(existing = null) {
        const label = existing?.label ?? "";
        const icon = existing?.icon ?? "";
        const journalId = existing?.journalId ?? "";
        const color = existing?.color ?? DEFAULT_COLOR;
        const textColor = existing?.textColor ?? DEFAULT_TEXT_COLOR;
        const haloColor = existing?.haloColor ?? DEFAULT_HALO_COLOR;
        const showLabel = existing?.showLabel ?? true;
        const hideIcon = existing?.hideIcon ?? false;
        const locked = existing?.locked ?? false;
        const iconScale = existing?.iconScale ?? 1;
        const labelScale = existing?.labelScale ?? 1;
        const browseTitle = game.i18n.localize("ATLAS.dialog.newMarker.browseIcon");
        return `
            <form class="globe-dialog-form">
                <div class="form-group">
                    <label>${game.i18n.localize("ATLAS.dialog.newMarker.label")}</label>
                    <input name="label" type="text" value="${escapeHtml(label)}" placeholder="Marker name" autofocus />
                </div>
                <div class="form-group checkbox-row">
                    <input name="showLabel" type="checkbox" ${showLabel ? "checked" : ""} />
                    <label>${game.i18n.localize("ATLAS.dialog.newMarker.showLabel")}</label>
                </div>
                <div class="form-group checkbox-row">
                    <input name="hideIcon" type="checkbox" ${hideIcon ? "checked" : ""} />
                    <label>${game.i18n.localize("ATLAS.dialog.newMarker.hideIcon")}</label>
                </div>
                <div class="form-group checkbox-row">
                    <input name="locked" type="checkbox" ${locked ? "checked" : ""} />
                    <label>${game.i18n.localize("ATLAS.dialog.newMarker.locked")}</label>
                </div>
                <div class="form-group">
                    <label>${game.i18n.localize("ATLAS.dialog.newMarker.icon")}</label>
                    <div class="globe-filepicker">
                        <input name="icon" type="text" value="${escapeHtml(icon)}" placeholder="Default circle (leave empty)" />
                        <button type="button" data-action="browse-icon" title="${browseTitle}">
                            <i class="fa-solid fa-file-image"></i>
                        </button>
                    </div>
                </div>
                <div class="form-group color-row">
                    <div class="color-field">
                        <label>${game.i18n.localize("ATLAS.dialog.newMarker.color")}</label>
                        <input name="color" type="color" value="${color}" />
                    </div>
                    <div class="color-field">
                        <label>${game.i18n.localize("ATLAS.dialog.newMarker.textColor")}</label>
                        <input name="textColor" type="color" value="${textColor}" />
                    </div>
                    <div class="color-field">
                        <label>${game.i18n.localize("ATLAS.dialog.newMarker.haloColor")}</label>
                        <input name="haloColor" type="color" value="${haloColor}" />
                    </div>
                </div>
                <p class="globe-hint">${game.i18n.localize("ATLAS.dialog.newMarker.colorHint")}</p>
                ${scaleFieldHtml({ labelText: game.i18n.localize("ATLAS.dialog.newMarker.iconScale"), name: "iconScale", value: iconScale })}
                ${scaleFieldHtml({ labelText: game.i18n.localize("ATLAS.dialog.newMarker.labelScale"), name: "labelScale", value: labelScale })}
                <div class="form-group">
                    <label>${game.i18n.localize("ATLAS.dialog.newMarker.journal")}</label>
                    <input name="journalId" type="text" value="${escapeHtml(journalId)}" placeholder="Journal Entry ID" />
                </div>
            </form>
        `;
    }

    _readForm(html) {
        return {
            label: html.find('[name="label"]').val().trim(),
            icon: html.find('[name="icon"]').val().trim() || null,
            color: html.find('[name="color"]').val() || DEFAULT_COLOR,
            textColor: html.find('[name="textColor"]').val() || DEFAULT_TEXT_COLOR,
            haloColor: html.find('[name="haloColor"]').val() || DEFAULT_HALO_COLOR,
            showLabel: html.find('[name="showLabel"]').prop("checked"),
            hideIcon: html.find('[name="hideIcon"]').prop("checked"),
            locked: html.find('[name="locked"]').prop("checked"),
            iconScale: percentToScale(html.find('[name="iconScale"]').val()),
            labelScale: percentToScale(html.find('[name="labelScale"]').val()),
            journalId: html.find('[name="journalId"]').val().trim() || null,
        };
    }

    /**
     * If the user disabled both the label AND the icon, the marker becomes
     * invisible on the map. Confirm before saving in that case.
     * @returns {Promise<boolean>} true to proceed with save, false to abort
     */
    async _confirmIfInvisible(d) {
        if (d.hideIcon && !d.showLabel) {
            const ok = await Dialog.confirm({
                title: game.i18n.localize("ATLAS.dialog.invisibleMarker.title"),
                content: `<p>${game.i18n.localize("ATLAS.dialog.invisibleMarker.body")}</p>`,
                defaultYes: false
            });
            return ok === true;
        }
        return true;
    }

    // ── Journal ───────────────────────────────────────────────────────
    _openJournal(journalId) {
        const journal = game.journal.get(journalId);
        if (journal) journal.sheet?.render(true);
        else ui.notifications.warn("Journal entry not found.");
    }

    // ── Live sync ─────────────────────────────────────────────────────
    addFoundryHooks() {
        // Custom markers live in scene flags. When the GM adds/edits/deletes one,
        // setFlag fires `updateScene` on every client — reload so players (and the
        // GM's other windows) see the change without re-entering the scene.
        this.mapMarkers.addFoundryHook("updateScene", (scene, changes) => {
            if (scene.id !== this.scene.id) return;
            if (!foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.${FLAG_KEY}`)) return;
            this.loadFromScene();
        });
    }

    // ── Event handlers ────────────────────────────────────────────────
    addMapListeners() {
        this.map.on("dblclick", (e) => {
            const feats = this.map.queryRenderedFeatures(e.point, { layers: this.layerIDs });
            if (!feats.length) return;
            e.preventDefault(); // prevent default map zoom
            const id = feats[0].properties.id;
            const marker = this.data.find(d => d.id === id);
            if (marker?.journalId) this._openJournal(marker.journalId);
        });
    }

    onMouseMove(event, markerFeatures) {
        if (this.dragging.id) { this._onDrag(event); return; }
        const hovered = markerFeatures[0]?.properties?.id ?? null;
        if (hovered !== this.hovering) {
            this.hovering = hovered;
            this.map.getCanvas().style.cursor = hovered ? "pointer" : "";
        }
    }

    onLeaveMap() {
        this.hovering = null;
        if (!this.dragging.id) this.map.getCanvas().style.cursor = "";
    }

    onGrab(event, properties = {}) {
        const { id } = properties;
        if (!id || !game.user.isGM || this.dragging.id) return;
        // Respect per-marker drag lock — RMB context menu / dblclick journal
        // open still work; only LMB drag is suppressed.
        const marker = this.data.find(d => d.id === id);
        if (marker?.locked) return;
        this.dragging = { id, startPoint: event.point, active: false };
        this.map.dragPan.disable();
        this.map.getCanvas().style.cursor = "grabbing";
    }

    _onDrag(event) {
        if (!this.dragging.active) {
            const dx = event.point.x - this.dragging.startPoint.x;
            const dy = event.point.y - this.dragging.startPoint.y;
            this.dragging.active = dx * dx + dy * dy > 9;
        }
        if (this.dragging.active) {
            const { lng, lat } = this.map.unproject(event.point);
            const marker = this.data.find(d => d.id === this.dragging.id);
            if (marker) { marker.lng = lng; marker.lat = lat; this._refreshFeatures(); }
        }
    }

    onRelease(event) {
        if (!this.dragging.id) return;
        if (this.dragging.active) this._saveToScene();
        this.dragging = { id: null, startPoint: null, active: false };
        this.map.dragPan.enable();
        this.map.getCanvas().style.cursor = this.hovering ? "pointer" : "";
    }

    onContextMenu(event, features) {
        const markerFeature = this.layerIDs.flatMap(id => features[id] ?? [])[0];

        if (markerFeature) {
            const id = markerFeature.properties.id;
            const marker = this.data.find(d => d.id === id);
            if (!marker) return false;

            const items = [];
            if (marker.journalId) {
                items.push({ label: game.i18n.localize("ATLAS.contextMenu.openJournal"), action: () => this._openJournal(marker.journalId) });
            }
            if (game.user.isGM) {
                items.push({ label: game.i18n.localize("ATLAS.contextMenu.edit"), action: () => this.showEditDialog(id) });
                items.push({ label: game.i18n.localize("ATLAS.contextMenu.delete"), danger: true, action: () => this.deleteMarker(id) });
            }
            if (!items.length) return false;
            showContextMenu(event.originalEvent, items);
            return true;
        }

        if (game.user.isGM) {
            this.showCreateDialog(this.map.unproject(event.point));
            return true;
        }
        return false;
    }
}
