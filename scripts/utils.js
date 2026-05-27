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
