# Contributing

Thanks for taking a look. This is a small plugin, so the workflow is small too.

## Development

```bash
node --check client.js           # the browser bundle parses
node tools/check-bundle.mjs      # bundle id, atlas count, Loader row
node tools/test-machine.mjs      # behaviour tests, no browser needed
```

`client.js` is **generated** from `src/pet-client.js` by
`tools/build_sprites.py`. Edit the source, never the bundle, and rebuild:

```bash
python3 tools/build_sprites.py --zip /path/to/deepseek-chibi-all-10-animations.zip
```

Requires Python 3 and Pillow. A change that touches the state machine should add
or adjust a check in `tools/test-machine.mjs`; that file drives the real bundle
with a stubbed module loader, so it tests what ships.

## Installing a development copy

Point the Plugin Manager at this directory (Settings → Plugins → install, or
`plugin_manager` with `install_bundle`). It links the folder, so a rebuilt
bundle is picked up by the running page; a changed *module* needs a reload.

## Pull requests

- Keep the diff focused, and describe what a user sees changing.
- Run the three commands above; CI runs them on Node 20 and 22.
- Do not commit a sprite pack, a `node_modules` tree, or a release tarball.
- Artwork changes need the notice in ATTRIBUTION.md kept accurate.
