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

### COVER Corp. derivative-works terms

The character is a derivative work of a COVER Corp. character, so this project
follows COVER's [Derivative Works Guidelines](https://hololivepro.com/en/terms/)
(English; also
[JP](https://hololivepro.com/terms/) / [ID](https://hololivepro.com/id/terms/)).
Those guidelines say to follow the latest version, so **the published guidelines
are the authority, not this summary**.

What that means concretely here:

- **Fan activity only, and it has to stay that way.** The plugin is free and
  non-commercial: no fee, no sponsorship, no corporate entity behind it. COVER
  prohibits derivative-work activity carried out for business purposes or by a
  corporation. If this project ever needs to be commercial, the artwork has to
  be replaced or separately licensed first.
- **It is not official.** Nothing here is affiliated with, endorsed by, or
  produced by COVER Corp., Hololive Production, or DeepSeek. The plugin is not
  an official product and must never be presented as one.
- **No official assets are used.** There is no official art, logo, voice, music,
  or stream content in this repository. The sprites are an independent,
  AI-generated interpretation. COVER does not treat the use of their content
  as-is, or with changes lacking creative input, as a derivative work; this
  project does not do that.
- **Content limits.** No sexual, violent, hateful, political, or religious
  content, and nothing that damages the reputation of the talents or the
  company. Forks and additions must keep that bar.
- **Removal on request.** If COVER Corp. or the talent asks, the artwork comes
  out of this repository and out of any published package, and a code-only build
  ships instead — the code does not depend on these drawings (below).
- **No guarantees.** COVER keeps its rights and makes no warranty about this
  use. Fan activity is at the creator's own risk, and local law or platform
  terms may add restrictions on top.

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
