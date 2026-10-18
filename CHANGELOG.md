# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] — 2026-10-19

### Fixed

- The sidebar pet chip no longer takes the whole sidebar-foot row.
  `sidebar.footer.action` is a row of intrinsically sized chips shared with
  other plugins — the DeepSeek credit monitor registers there too — and the pet
  claimed the full width, squeezing the credit chip out. It is now the same
  shape as its neighbour, with the attention dot moved to a corner so it costs
  no width.

## [1.0.0] — 2026-10-19

First public release.

### Added

- A floating chibi pet in the Harness Web GUI, bound to one session, driven by
  that session's real state (thinking, using tools, waiting for an approval,
  finished, failed, idle, asleep).
- A chat input on the pet: type a request and it is queued into the bound
  session exactly as the composer would send it.
- A sidebar-foot switch, a Settings → General row and a keyboard command, all
  toggling the pet through one shared preference store.
- Preferences for size (small / medium / large) and nap time, plus follow mode
  (the pet re-homes onto whatever conversation you are viewing).
- An attention badge when the bound session finishes or needs an approval while
  you are looking elsewhere.
- Direction-aware dragging: hold it and it hangs straight down, carry it and it
  leans further the further it travels, using the two opposite swing drawings.
- `tools/build_sprites.py` to build the browser bundle from a sprite pack, and
  behaviour tests (`tools/test-machine.mjs`) plus a bundle guard
  (`tools/check-bundle.mjs`) for CI.

### Notes

- The sprite artwork is third-party fan art; see ATTRIBUTION.md.
