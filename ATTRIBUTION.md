# Attribution and artwork notice

## Code

The plugin — `index.js`, `src/pet-client.js`, `tools/*`, the manifest, the locale
files and this repository's documentation — is MIT licensed (see LICENSE).

## Sprite artwork

The ten animations (60 poses) embedded in the generated `client.js` come from
the **DeepSeek Chibi** sprite pack supplied to this project by its author. The
pack describes itself as follows, and this repository carries that description
forward unchanged:

> Sprite assets, not a Live2D/Cubism model or installed plugin. Minor generated
> drawing drift remains. Newly generated Gawr Gura-inspired artwork; not official
> Hololive or DeepSeek assets and no affiliation/character clearance claimed.

Concretely, for anyone reusing this repository:

- The character is **fan artwork, generated with AI**, inspired by Gawr Gura.
- It is **not** affiliated with, endorsed by, or licensed from Hololive
  Production, Cover Corp., or DeepSeek.
- No character clearance is claimed. If you fork this project, that notice
  travels with the artwork — keep this file.
- The artwork is not covered by the MIT licence above. Treat it as
  all-rights-reserved fan art that you may use at your own risk, or replace it.

### Replacing the artwork

Nothing in the code depends on these specific drawings. Supply your own sprite
pack in the same shape (`<state>/frames/<state>-NN.png`, six poses per state,
`<state>/animation.json`) and rebuild:

```bash
python3 tools/build_sprites.py --pack /path/to/your-pack
```

The builder writes `client.js`; commit the result. If you would rather keep a
replacement private, publish the code and let users build locally — the
generated bundle is a build artifact, not a source file.
