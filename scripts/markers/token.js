import { ItemMarker } from "./item.js";

import { MODULE_ID } from "../constants.js";
export class TokenMarker extends ItemMarker {
    get type() { return "token"; }
    get sceneItems() { return new Set(this.scene.tokens.map(t => t.id)); }

    getItem(id) { return this.scene.tokens.get(id); }
    getSize(id) { return this.getItem(id)?.width ?? 1; }
    getScalable(id) { return (this.getItem(id)?.elevation ?? 0) === 0; }
    getName(id) { return this.getItem(id)?.name ?? null; }

    addFoundryHooks() {
        this.mapMarkers.addFoundryHook("createToken", (token) => {
            this.createMarker({ item: token, id: token.id });
        });
        this.mapMarkers.addFoundryHook("updateToken", (token, upd) => {
            this.updateMarker({
                item: token, id: token.id,
                updateImage: "texture" in upd || "width" in upd,
                updateScalable: "altitude" in upd,
                updateScale: foundry.utils.hasProperty(upd, `flags.${MODULE_ID}`)
            });
        });
        this.mapMarkers.addFoundryHook("refreshToken", (token) => {
            this.updateMarker({ item: token.document, id: token.document.id });
        });
        this.mapMarkers.addFoundryHook("deleteToken", (token) => {
            this.deleteMarker({ item: token, id: token.id });
        });
        this.mapMarkers.addFoundryHook("updateScene", () => this.updateAll());
    }
}
