import { Marker } from "./marker.js";

export class WikiLinkMarker extends Marker {
    reset() {
        super.reset();
        this._hovering = false;
    }

    get layerIDs() {
        return [
            "location-icons", "location-labels",
            "symbol_labels", "symbol_line-labels",
            "symbol_province-labels", "symbol_nation-labels",
            "symbol_subregion-labels", "symbol_region-labels",
        ];
    }

    onClick(event, properties) {
        if (game.user.role < 2) return;
        if (!event?.originalEvent?.altKey) return;
        if (!properties?.link) return;
        window.open(properties.link, "_blank");
    }

    onMouseMove(event, markerFeatures) {
        if (game.user.role < 2) return;
        const alt = event?.originalEvent?.altKey;
        const hasLink = markerFeatures.some(f => f.properties.link);
        if (alt && hasLink) this._setHover(true);
        else this._setHover(false);
    }

    onLeaveMap() { this._setHover(false); }

    _setHover(active) {
        if (active === this._hovering) return;
        this._hovering = active;
        this.map.getCanvas().style.cursor = active ? "pointer" : "";
    }
}
