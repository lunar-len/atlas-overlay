# Changelog

All notable changes to Atlas Overlay are documented here.

## 0.2.1

Bug-fix and reliability release.

### Fixed
- **Map tiles failures are now surfaced** with a one-time warning notification
  instead of a silent blank globe, covering incompatible, missing, or
  unreachable PMTiles sources (HTTP errors, decode errors, etc.).
- **Duplicate "Enable Globe Map" checkbox** no longer appears in Scene
  Configuration when the sheet re-renders.
- Quick custom-marker drags are no longer dropped (the new mousemove
  throttling now flushes the pending move before a drag release).
- Hardened scene teardown so it can't throw on an already-released map.

### Performance
- Globe hover/drag feature queries are coalesced to one per animation frame,
  reducing work on complex maps with many features.

### Internal / release pipeline
- The release workflow now validates the bundled tileset (PMTiles magic,
  version, MVT tile type, and size) and fails the build on an incompatible or
  truncated download — preventing a broken map from shipping. The tileset
  source URL is also pinnable via a repository variable.
- Centralized the module id, deduplicated dialog helpers, decoupled the ping
  marker from internals, and sanitized colors used in manager dialogs.

### Known issues
- Long-pressing to ping while fully zoomed out on the globe may not register;
  zooming in first works. Under investigation.

## 0.2.0

Feature release.

### Added
- **Text-only labels** — render a marker as a pure text annotation (hide icon).
- **Lock position** toggle to prevent accidentally dragging a placed marker.
- **Manual scale** for marker/label and token/note size (1%–200%), with a
  slider + percent input.
- **Zoom-scaled token & note markers** — icons and labels shrink when zoomed
  out so the map stays uncluttered.

### Fixed
- Live sync: players now see markers and paths the GM adds without switching
  scenes and back.
- Token icons/labels no longer disappear on some tilesets (invalid MapLibre
  size expression).
- Custom marker icons load correctly when hosted on The Forge (absolute CDN
  URLs are no longer host-prefixed).
- Right-clicking a marker/path that overlaps a token reaches the correct
  edit/delete menu.
