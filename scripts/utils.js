// Manual scale is shown in the UI as an integer percent (1%–200%, default 100%)
// but stored/used as a decimal multiplier (0.01–2.0, default 1.0) so the MapLibre
// size expressions can multiply by it directly.
export const SCALE_PCT_MIN = 1;
export const SCALE_PCT_MAX = 200;
export const SCALE_PCT_STEP = 1;
export const SCALE_PCT_DEFAULT = 100;
export const SCALE_DEFAULT = 1;

/** Stored decimal multiplier → integer percent for display, clamped to [1, 200]. */
export function scaleToPercent(scale) {
    const n = Number.isFinite(scale) ? scale : SCALE_DEFAULT;
    return Math.min(SCALE_PCT_MAX, Math.max(SCALE_PCT_MIN, Math.round(n * 100)));
}

/** Percent field value → stored decimal multiplier, clamped to [0.01, 2.0]. */
export function percentToScale(pctValue) {
    const pct = parseInt(pctValue, 10);
    if (!Number.isFinite(pct)) return SCALE_DEFAULT;
    return Math.min(SCALE_PCT_MAX, Math.max(SCALE_PCT_MIN, pct)) / 100;
}

/**
 * Clamp a stored decimal multiplier into the valid [0.01, 2.0] range at read
 * time. Guards against legacy data saved under earlier, wider bounds (which
 * would otherwise feed an oversized multiplier straight into MapLibre and blow
 * the icon up until the item is re-saved). Missing/invalid → default 1.0.
 */
export function clampScaleValue(scale) {
    const n = Number.isFinite(scale) ? scale : SCALE_DEFAULT;
    return Math.min(SCALE_PCT_MAX / 100, Math.max(SCALE_PCT_MIN / 100, n));
}

/**
 * HTML for a scale control: a label above a range slider paired with a number
 * box (shown as integer percent) and a "%" suffix. The number box carries `name`
 * so form-reading code can find it; the slider is linked by `data-scale`.
 * `value` is the stored decimal multiplier. Call wireScaleSliders() after render.
 */
export function scaleFieldHtml({ labelText, name, value }) {
    const pct = scaleToPercent(value);
    return `
        <div class="form-group scale-field">
            <label>${labelText}</label>
            <div class="scale-control">
                <input type="range" data-scale="${name}" min="${SCALE_PCT_MIN}" max="${SCALE_PCT_MAX}" step="${SCALE_PCT_STEP}" value="${pct}" />
                <input type="number" name="${name}" min="${SCALE_PCT_MIN}" max="${SCALE_PCT_MAX}" step="${SCALE_PCT_STEP}" value="${pct}" />
                <span class="scale-suffix">%</span>
            </div>
        </div>
    `;
}

/**
 * Wire two-way sync between each range slider and its paired percent number box.
 * Dragging the slider updates the number live; typing moves the slider live and
 * is clamped to an integer in [1, 200] on blur.
 * @param {JQuery|HTMLElement} html
 */
export function wireScaleSliders(html) {
    const $html = html.jquery ? html : $(html);
    const clampPct = (v) => Math.min(SCALE_PCT_MAX, Math.max(SCALE_PCT_MIN, Math.round(v)));
    $html.find('input[type="range"][data-scale]').each((_, range) => {
        const key = range.dataset.scale;
        const $num = $html.find(`input[name="${key}"]`);
        if (!$num.length) return;
        $(range).on("input", () => { $num.val(range.value); });
        $num.on("input", () => {
            const n = parseInt($num.val(), 10);
            if (Number.isFinite(n)) range.value = clampPct(n);
        });
        $num.on("change", () => {
            const n = parseInt($num.val(), 10);
            const pct = Number.isFinite(n) ? clampPct(n) : SCALE_PCT_DEFAULT;
            $num.val(pct);
            range.value = pct;
        });
    });
}

/** Escape a string for safe interpolation into HTML text or attribute values. */
export function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
}

/** Return a CSS-safe hex color (#rgb … #rrggbbaa), or `fallback` for invalid input. */
export function safeColor(c, fallback = "#000000") {
    return /^#[0-9a-fA-F]{3,8}$/.test(c ?? "") ? c : fallback;
}

/**
 * Confirmation dialog for a destructive action, defaulting to "no".
 * @param {string} name  Human-readable name of the thing being deleted.
 * @returns {Promise<boolean>}
 */
export function confirmDelete(name) {
    return Dialog.confirm({
        title: game.i18n.localize("ATLAS.dialog.confirmDelete.title"),
        content: `<p>${game.i18n.format("ATLAS.dialog.confirmDelete.body", { name })}</p>`,
        defaultYes: false
    });
}

/**
 * Display a floating context menu at the given native mouse event position.
 * Each item: { label: string, action: () => void, danger?: boolean }
 */
export function showContextMenu(nativeEvent, items) {
    document.getElementById("globe-context-menu")?.remove();
    if (!items.length) return;

    const menu = document.createElement("div");
    menu.id = "globe-context-menu";

    for (const item of items) {
        const btn = document.createElement("button");
        btn.className = `menu-item${item.danger ? " danger" : ""}`;
        btn.textContent = item.label;
        btn.addEventListener("click", () => {
            menu.remove();
            item.action();
        });
        menu.appendChild(btn);
    }

    document.body.appendChild(menu);

    // Initial position
    menu.style.left = `${nativeEvent.clientX}px`;
    menu.style.top = `${nativeEvent.clientY}px`;

    // Clamp to viewport after layout
    requestAnimationFrame(() => {
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            menu.style.left = `${nativeEvent.clientX - rect.width}px`;
        }
        if (rect.bottom > window.innerHeight) {
            menu.style.top = `${nativeEvent.clientY - rect.height}px`;
        }
    });

    // Close on any outside interaction
    setTimeout(() => {
        document.addEventListener("click", () => menu.remove(), { once: true });
        document.addEventListener("contextmenu", () => menu.remove(), { once: true });
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") menu.remove();
        }, { once: true });
    }, 0);
}
