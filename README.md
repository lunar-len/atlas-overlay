# Atlas Overlay

An interactive 3D globe / 2D map overlay for **Foundry Virtual Tabletop (v13 & v14)**.
Drape a vector world map over any scene, drop persistent markers, draw measured
paths, and ping locations for the whole party to see.

Ships with the Pathfinder Wiki Golarion tileset by default; any other PMTiles
file can be configured per-world.

> ⚠️ **Pre-release (v0.1.0).** Schema and behavior may change between versions.
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
| Right-click | Empty space (GM) | New marker dialog |
| Right-click | On a marker (GM) | Edit / Delete / Open Journal |
| Right-click | On a path (GM) | Edit Path / Delete |
| Double-click | Marker with Journal | Open the linked Journal Entry |
| Left-click + drag | Marker (GM) | Move marker; release auto-saves |
| Escape / right-click | While drawing a path | Cancel without saving |
| Double-click / Enter | While drawing a path | Finish and save the path |

### Marker editor

- Label + show/hide label toggle
- Icon (FilePicker; auto-resizes any image to 48 px maximum dimension)
- Pin color, text color, outline/halo color
- Journal Entry ID (optional)

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
curl -L https://map.pathfinderwiki.com/data/golarion.pmtiles -o lib/pathfinder-wiki-maps/data/golarion.pmtiles
```

---

## Development

The `.pmtiles` map data (~235 MB) is **not** stored in the git repository — it
ships only inside the release ZIP. To set up a local dev environment after
cloning (commands shown for bash / Git Bash; PowerShell equivalents noted
inline):

```bash
git clone https://github.com/lunar-len/atlas-overlay.git
cd atlas-overlay

# Install Node dependencies and copy bundled libs into lib/
npm install

# Make sure the data directory exists
# bash:        mkdir -p lib/pathfinder-wiki-maps/data
# PowerShell:  New-Item -ItemType Directory -Force lib/pathfinder-wiki-maps/data | Out-Null

# Fetch the Golarion PMTiles map (~235 MB) — one line:
curl -L https://map.pathfinderwiki.com/data/golarion.pmtiles -o lib/pathfinder-wiki-maps/data/golarion.pmtiles

# Symlink the project into your Foundry Data folder
npm run link
```

`npm run link` prompts for your `<FoundryUserData>/Data` path and creates
`Data/modules/atlas-overlay → <this repo>`.

### Project layout

```
atlas-overlay/
├── scripts/
│   ├── module.js              # Entry: Foundry hooks, settings, toolbar
│   ├── map.js                 # MapLibre init + PMTiles protocol
│   ├── hooks.js               # libWrapper hooks (canvas.ping passthrough)
│   ├── markers-on-globe.js    # Event dispatcher across marker subclasses
│   ├── utils.js               # Shared helpers (context menu, etc.)
│   └── markers/
│       ├── marker.js          # Base class
│       ├── custom.js          # User-placed markers
│       ├── path.js            # Drawn measured paths
│       ├── ping.js            # Long-press pings (canvas.ping bridge)
│       ├── token.js, note.js, wiki.js, item.js  # Foundry document markers
│       └── index.js
├── styles/module.css
├── languages/en.json
├── lib/                       # Bundled deps (MapLibre, PMTiles, Turf, map data)
└── module.json
```

---

## Releasing

The bundled Golarion `.pmtiles` (~235 MB) exceeds GitHub's 100 MB per-file
Git limit, and we don't use Git LFS to stay within the free-tier quotas.
Instead, the map data lives only inside the release ZIP attached to each
GitHub Release. Foundry's manifest URL points at the latest release asset,
so end users always get a self-contained download.

Packaging is automated by [`.github/workflows/release.yml`](.github/workflows/release.yml),
which runs on the GitHub Actions runner — no local upload bandwidth is needed.

### Recommended flow (GitHub Actions)

1. **Bump versions** in `module.json` and `package.json`, commit, push to `main`.
2. **Create a release in the GitHub web UI:**
   *Releases → Draft a new release → pick or create the `vX.Y.Z` tag → title
   → notes → Publish.*
3. The workflow triggers on the `published` event. It downloads the canonical
   Golarion PMTiles from `map.pathfinderwiki.com`, zips the module, and
   attaches `module.json` + `module.zip` to the release. Typical runtime:
   2–3 minutes.

The `manifest` and `download` URLs inside `module.json` use the
`/releases/latest/download/...` path, so each new release automatically
becomes the one Foundry users get when installing.

### Manual fallback (no Actions / local-only)

If you need to build the ZIP yourself:

```bash
# Make sure lib/pathfinder-wiki-maps/data/golarion.pmtiles is present first
# (see the curl command in the Development section).

tar -a -cf module.zip module.json scripts styles languages lib LICENSE NOTICE.md README.md
```

Then attach `module.json` and `module.zip` to the release manually via web UI,
or with `gh`:

```bash
gh release create v0.1.0 module.json module.zip --title "v0.1.0" --notes "Initial pre-release."
```

In PowerShell, run each command on a single line or split with a backtick
`` ` `` (not `\`). The `gh` CLI uploads from your local machine, so a
~235 MB release ZIP can take several minutes on a consumer uplink.

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
