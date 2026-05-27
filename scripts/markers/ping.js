import { Marker } from "./marker.js";

const MODULE_ID = "atlas-overlay";

export class PingMarker extends Marker {
    reset() {
        this._timeout = null;
        this._startPoint = null;
        this._startEvent = null;
        this._pressed = false;
        this._moved = false;
        this._canvas = null;
    }

    destroy() {
        this._clearTimeout();
        this._removeListeners();
        super.destroy();
    }

    addFoundryHooks() {
        this.mapMarkers.addFoundryHook(
            `${MODULE_ID}.handlePing`,
            (_this, result, config, user, position, { pull = false, zoom = 1 } = {}) => {
                if (!canvas.scene?.getFlag(MODULE_ID, "enabled")) return;
                const { x, y } = position;
                const { lng, lat } = this.sceneToLngLat(x, y);
                let screenPoint = this.map.project([lng, lat]);

                if (pull && (user.isGM || user.isSelf)) {
                    zoom = position.zoom ?? this.map.getZoom();
                    this.map.easeTo({ center: [lng, lat], zoom, duration: 1000, easing: t => t * t * t });
                    const c = this.map.getCenter();
                    screenPoint = this.map.project([c.lng, c.lat]);
                }

                const style = config?.style ?? "pulse";
                this._showPing(screenPoint, style, user?.color);
            }
        );
    }

    addMapListeners() {
        this._canvas = this.map.getCanvas();
        this._onPointerDown = this._onPointerDown.bind(this);
        this._onPointerUp = this._onPointerUp.bind(this);
        this._onPointerMove = this._onPointerMove.bind(this);
        this._onPointerLeave = this._onPointerLeave.bind(this);
        this._canvas.addEventListener("pointerdown", this._onPointerDown);
        this._canvas.addEventListener("pointerup", this._onPointerUp);
        this._canvas.addEventListener("pointermove", this._onPointerMove);
        this._canvas.addEventListener("pointerleave", this._onPointerLeave);
    }

    _removeListeners() {
        if (!this._canvas) return;
        this._canvas.removeEventListener("pointerdown", this._onPointerDown);
        this._canvas.removeEventListener("pointerup", this._onPointerUp);
        this._canvas.removeEventListener("pointermove", this._onPointerMove);
        this._canvas.removeEventListener("pointerleave", this._onPointerLeave);
    }

    _onPointerDown(e) {
        if (e.button !== 0 || e.pointerType !== "mouse") return;
        // Don't ping while drawing a path
        if (this.mapMarkers.isPathDrawing) return;
        // Don't ping when long-pressing on a marker — that's drag/dblclick territory
        const grouped = this.mapMarkers._featuresAt({ x: e.offsetX, y: e.offsetY });
        if ((grouped["custom-layer"]?.length || grouped["custom-label-layer"]?.length)) return;

        this._pressed = true;
        this._moved = false;
        this._startPoint = { x: e.clientX, y: e.clientY };
        this._startEvent = e;

        this._timeout = setTimeout(() => {
            if (!this._pressed || this._moved) return;
            const lngLat = this.map.unproject([e.offsetX, e.offsetY]);
            const { x, y } = this.lngLatToScene(lngLat.lng, lngLat.lat);
            canvas.ping({ x, y, zoom: this.map.getZoom() }, {
                nameplate: true, user: game.user,
                type: this._startEvent.altKey ? "alert" : "normal",
                pan: this._startEvent.shiftKey,
            });
            this._pressed = false;
        }, 500);
    }

    _onPointerMove(e) {
        if (!this._pressed || !this._startPoint) return;
        const dx = e.clientX - this._startPoint.x;
        const dy = e.clientY - this._startPoint.y;
        if (dx * dx + dy * dy > 16) { this._moved = true; this._clearTimeout(); }
    }

    _onPointerUp() { this._pressed = false; this._clearTimeout(); }
    _onPointerLeave() { this._pressed = false; this._clearTimeout(); }
    _clearTimeout() { if (this._timeout) { clearTimeout(this._timeout); this._timeout = null; } }

    _showPing(point, style = "pulse", color) {
        if (style === "alert") {
            for (let i = 0; i < 3; i++) {
                const el = document.createElement("div");
                el.className = "globe-ping globe-ping--alert";
                el.style.cssText = `left:${point.x}px;top:${point.y + 6}px;margin-top:-12px;animation-delay:${i * 0.4}s`;
                document.body.appendChild(el);
                setTimeout(() => el.remove(), 1800);
            }
            return;
        }
        const el = document.createElement("div");
        el.className = `globe-ping globe-ping--${style}`;
        el.style.left = `${point.x}px`;
        el.style.top = `${point.y}px`;
        if (color) {
            if (style === "pulse") { el.style.background = color; el.style.border = "2px solid white"; }
            else if (style === "chevron") el.style.borderBottomColor = color;
        }
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 1200);
    }
}
