import { ItemMarker } from "./item.js";

export class NoteMarker extends ItemMarker {
    get type() { return "note"; }
    get sceneItems() { return new Set(this.scene.notes.map(n => n.id)); }

    getItem(id) { return this.scene.notes.get(id); }
    getSize(id) { return (this.getItem(id)?.iconSize ?? 40) / 40; }
    getScalable(id) { return (this.getItem(id)?.elevation ?? 0) === 0; }
    getName(id) { return this.getItem(id)?.label ?? null; }
    _hasPermission(data, permission = "OWNER") {
        const item = data.item ?? this.getItem(data.id);
        return item?.entry?.testUserPermission(game.user, permission);
    }

    addFoundryHooks() {
        this.mapMarkers.addFoundryHook("createNote", (note) => {
            this.createMarker({ item: note, id: note.id });
        });
        this.mapMarkers.addFoundryHook("updateNote", (note, upd) => {
            this.updateMarker({ item: note, id: note.id, updateImage: "texture" in upd });
        });
        this.mapMarkers.addFoundryHook("refreshNote", (note) => {
            this.updateMarker({ item: note.document, id: note.document.id });
        });
        this.mapMarkers.addFoundryHook("deleteNote", (note) => {
            this.deleteMarker({ item: note, id: note.id });
        });
        this.mapMarkers.addFoundryHook("updateScene", () => this.updateAll());
    }

    onClick(event, properties = {}) {
        const { id } = properties;
        if (!id || this.dragging?.id) return;
        const item = this.getItem(id);
        if (!this._hasPermission({ item }, "LIMITED")) return;
        item?.entry?.sheet?.render?.(true);
    }
}
