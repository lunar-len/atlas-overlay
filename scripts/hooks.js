const MODULE_ID = "atlas-overlay";

function wrapHook(id, hookID) {
    libWrapper.register(MODULE_ID, id, function (wrapped, ...args) {
        const allowed = Hooks.call(`${MODULE_ID}.pre${hookID ?? id}`, this, ...args);
        if (allowed === false) return;
        const result = wrapped(...args);
        const config = { result };
        Hooks.call(`${MODULE_ID}.${hookID ?? id}`, this, result, config, ...args);
        return config.result;
    }, "WRAPPER");
}

export function addHooks() {
    wrapHook("canvas.controls.handlePing", "handlePing");
}
