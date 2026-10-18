/**
 * Bundle consistency guard for CI.
 *
 * The browser module id must equal the package name (the Host's client-module
 * graph resolves one by the other), and the committed bundle must still carry
 * every sprite atlas — a bundle built without the pack would otherwise pass
 * every other check and ship a pet that cannot draw.
 *
 * Run: node tools/check-bundle.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const bundle = readFileSync(join(root, 'client.js'), 'utf8');
const source = readFileSync(join(root, 'src', 'pet-client.js'), 'utf8');

const identity = bundle.match(/id:\s*\/\*@__MODULE_ID@\*\/\s*"([^"]+)"/);
assert.ok(identity, 'client.js carries a stamped module id');
assert.equal(identity[1], pkg.name, 'bundle id equals the package name');

assert.ok(
  source.includes('/*@__SPRITES@*/ null'),
  'src/pet-client.js keeps the sprite marker, so it stays rebuildable',
);
assert.ok(
  !bundle.includes('/*@__SPRITES@*/ null'),
  'client.js was built: the sprite marker is replaced by the atlas table',
);

const atlases = bundle.match(/src: "data:image\/webp;base64,/g) ?? [];
assert.equal(atlases.length, 10, 'ten sprite atlases are embedded');

const states = [...bundle.matchAll(/"([a-z-]+)": \{ src: "data:image\/webp/g)].map((match) => match[1]);
for (const state of ['idle', 'thinking', 'working', 'waiting', 'success', 'error', 'head-pat', 'drag', 'sleep', 'greeting']) {
  assert.ok(states.includes(state), `atlas present: ${state}`);
}

const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8');
assert.ok(patch.includes(`name: '${pkg.name}'`), 'the Loader row installs this package name');

console.log(`bundle ok: ${pkg.name}@${pkg.version}, ${atlases.length} atlases, ${(bundle.length / 1024 / 1024).toFixed(2)} MiB`);
