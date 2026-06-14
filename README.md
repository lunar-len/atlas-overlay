# Atlas Overlay

An interactive 3D globe / 2D map overlay for **Foundry Virtual Tabletop (v13 & v14)**.
Drape a vector world map over any scene, drop persistent markers, draw measured
paths, and ping locations for the whole party to see.

Ships with the Pathfinder Wiki Golarion tileset by default; any other PMTiles
file can be configured per-world.

> ⚠️ **Pre-release (v0.2.0).** Schema and behavior may change between versions.
> Custom scenes should be backed up before upgrading.

---

## Features

- **3D globe / 2D mercator toggle** — switch projection from the toolbar.
- **Per-scene activation** — enable the overlay only on scenes you choose.
- **Custom markers** with FilePicker-selected images, per-marker text color,
  outline, toggleable labels. Drag to reposition (GM), double-click to open
  a linked Journal Entry.
- **Measured paths** — click to lay waypoints, double-click / Enter to finish,
  Escape / right-click to cancel. Edit line color, label color, halo, and
  show/hide name and distance independently.
- **Pings** — long-press the globe (500 ms) to ping for the entire table;
  Alt = alert ping, Shift = pull camera (GM).
- **Manager dialogs** — list, pan to, edit, or delete every marker / path
  on the current scene from a single GM-only panel.
- **Wiki-links** — Alt-click any built-in point of interest (city, region,
  nation, geographic feature, …) to open its PathfinderWiki article in a
  new tab. Available to Trusted Players and above; the cursor turns into
  a pointer on Alt-hover to signal which features are clickable.
- **Scene token & note mirroring** — every token placed on the underlying
  Foundry scene, and every journal pin (note), is automatically reflected
  as a marker on the globe and stays in sync with the source (create,
  move, update, delete). Clicking a mirrored note opens the linked Journal
  Entry if the user has at least Limited permission on it.

---

## Installation

### Manifest URL (recommended)

In Foundry: **Add-on Modules → Install Module → Manifest URL**

```
https://github.com/lunar-len/atlas-overlay/releases/latest/download/module.json
```

### Manual

1. Download the latest `module.zip` from the
   [Releases page](https://github.com/lunar-len/atlas-overlay/releases).
2. Extract into `<FoundryUserData>/Data/modules/atlas-overlay/`.
3. Enable the module in your world.

### Dependencies

- **[libWrapper](https://foundryvtt.com/packages/lib-wrapper)** (required) —
  Foundry will prompt you to install it on first activation.

---

## Getting Started

1. Enable the module in your world.
2. Open a scene's **Scene Configuration** dialog and tick **Enable Globe Map**
   under Basic settings.
3. Reload the canvas. A **Globe Map** group appears in the left toolbar.

### Toolbar

| Tool | Visibility | Action |
|---|---|---|
| Toggle 2D / 3D | All players | Switch between globe and mercator projection |
| Draw Path | GM | Enter path-drawing mode (icon swaps to a flag while drawing) |
| Manage Markers | GM | Open the markers manager dialog |
| Manage Paths | GM | Open the paths manager dialog |

### Interactions

| Input | Context | Effect |
|---|---|---|
| Left-click + drag | Empty space | Pan the globe |
| Long-press 500 ms | Empty space | Ping (broadcast to all players) |
| Long-press + Alt | Empty space | Alert ping |
| Long-press + Shift | Empty space | Pull camera (GM) |
| Alt + click | On a bundled PathfinderWiki POI | Open the wiki page in a new tab (Trusted Player+) |
| Right-click | Empty space (GM) | New marker dialog |
| Right-click | On a custom marker (GM) | Edit / Delete / Open Journal |
| Right-click | On a path (GM) | Edit Path / Delete |
| Right-click | On a mirrored token / note (GM) | Adjust globe icon & label scale |
| Double-click | Custom marker with Journal | Open the linked Journal Entry |
| Left-click | On a mirrored scene note | Open the linked Journal Entry (if permitted) |
| Left-click + drag | Custom marker (GM) | Move marker; release auto-saves. Suppressed when the marker is locked. |
| Escape / right-click | While drawing a path | Cancel without saving |
| Double-click / Enter | While drawing a path | Finish and save the path |

### Marker editor

- Label + show/hide label toggle
- **Render label only (hide icon)** — turn a marker into a text-only annotation
- **Lock position (prevent drag)** — guard against accidentally moving a placed marker
- Icon (FilePicker; auto-resizes any image to 48 px maximum dimension)
- Pin color, text color, outline/halo color
- **Icon scale / Label scale** — manual size, 1%–200% (default 100%)
- Journal Entry ID (optional)

> Saving a marker with both *Show label* off **and** *Render label only* on
> will make it invisible on the map. A confirmation dialog warns you before
> committing this combination.

### Token & note markers

Tokens and journal pins mirrored from the scene shrink as the globe zooms out
so they don't clutter the map, capping at a fixed on-screen size when zoomed
in. **Right-click a mirrored token or note (GM)** to adjust its icon and label
scale individually; the values persist as document flags. Use *Reset* in that
dialog to return to the defaults.

### Path editor

- Label + show/hide label toggle
- Line color, text color, outline/halo color
- Show/hide distance label

> Pin color and outline apply to the **default circle marker only**. Custom
> uploaded images render with their original colors.

---

## Map Tiles

By default Atlas Overlay loads the Golarion tileset from
`modules/atlas-overlay/lib/pathfinder-wiki-maps/data/golarion.pmtiles`. To use
a different map, go to **Module Settings → Atlas Overlay → Map Tiles File** and
either:

- Click the file-picker button next to the field to browse for a `.pmtiles`
  file inside your Foundry Data folder, or
- Paste a path manually in the form
  `pmtiles:///modules/your-module/path/to/file.pmtiles`.

### Updating the bundled Golarion map

The shipped `.pmtiles` file is a snapshot of the
[PathfinderWiki mapping project](https://github.com/pf-wikis/mapping). To pull
a fresher build, download the canonical version into the same path (one line):

```bash
curl -L https://map.pathfinderwiki.com/golarion.pmtiles -o lib/pathfinder-wiki-maps/data/golarion.pmtiles
```

---

## Acknowledgments

- The [PathfinderWiki mapping project](https://github.com/pf-wikis/mapping)
  for the Golarion tileset and the rendering layer definitions.
- [Ikaguia/fvtt-globe-map](https://github.com/Ikaguia/fvtt-globe-map) — the
  original Foundry-VTT-on-a-globe concept that inspired this module.
- [MapLibre](https://maplibre.org),
  [Protomaps PMTiles](https://protomaps.com), and
  [Turf.js](https://turfjs.org) for the rendering and geo stack.
- Paizo Inc. for the Pathfinder setting, used here under the
  [Community Use Policy](https://paizo.com/community/communityuse).

### Note on AI assistance

Substantial portions of this module were drafted with the help of an
AI coding assistant. All output was reviewed, tested, and committed by
a human.

---

## License

Source code: **MIT** — see [LICENSE](./LICENSE).

Third-party libraries retain their own licenses; see
[NOTICE.md](./NOTICE.md) for the full list.

Pathfinder, Golarion, and related place names are trademarks of Paizo Inc.
This module is not affiliated with, endorsed, sponsored, or specifically
approved by Paizo Inc.
