/**
 * State-machine acceptance test for the pet, without a browser.
 *
 * The bundle is a browser script, so this harness supplies the two globals it
 * touches while loading (`window.__ModuleLoader__`) and stubs `react`: the
 * behaviour fold under test uses neither.
 *
 * Run: node tools/test-machine.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const bundle = readFileSync(join(here, '..', 'client.js'), 'utf8');

let exports = null;
globalThis.window = {
  __ModuleLoader__: {
    load({ id, factory }) {
      exports = { id, factory };
    },
  },
};
new Function(bundle)();
assert.ok(exports, 'bundle registered a factory');
assert.equal(exports.id, 'dsh-chibi-pet');

const module = exports.factory(() => ({}));
assert.equal(typeof module.apply, 'function', 'module exposes apply()');
assert.deepEqual(module.inject, ['slots', 'locale', 'sessions']);
const { createMachine, dragPose, DRAG_POSES, STATES, SIZES, NAP_CHOICES, PREF_DEFAULTS } = module.__test;

const results = [];
function check(label, fn) {
  try {
    fn();
    results.push(`  ok   ${label}`);
  } catch (error) {
    results.push(`  FAIL ${label}\n       ${error.message}`);
    process.exitCode = 1;
  }
}

// --- preference table sanity -------------------------------------------------
check('every size is a positive width in ascending order', () => {
  const widths = ['small', 'medium', 'large'].map((id) => SIZES[id]);
  assert.deepEqual(widths, [...widths].sort((a, b) => a - b));
  for (const width of widths) assert.ok(width > 40 && width <= 200, `size ${width}`);
});

check('nap choices are ordered and include "never"', () => {
  assert.equal(NAP_CHOICES[NAP_CHOICES.length - 1], 0);
  assert.ok(NAP_CHOICES.slice(0, -1).every((seconds) => seconds > 0));
});

check('defaults are valid preference values', () => {
  assert.equal(PREF_DEFAULTS.enabled, true);
  assert.ok(Object.hasOwn(SIZES, PREF_DEFAULTS.size));
  assert.ok(NAP_CHOICES.includes(PREF_DEFAULTS.napSeconds));
  assert.equal(typeof PREF_DEFAULTS.follow, 'boolean');
});

// --- sprite table sanity ----------------------------------------------------
assert.equal(Object.keys(STATES).length, 10, 'ten sprite states');
for (const [name, state] of Object.entries(STATES)) {
  assert.ok(state.src.startsWith('data:image/webp;base64,'), `${name} has an atlas`);
  assert.ok(state.sequence.length > 0, `${name} has a timed sequence`);
  for (const [index, duration] of state.sequence) {
    assert.ok(index >= 0 && index < 6, `${name} atlas index in range`);
    assert.ok(duration > 0, `${name} step duration positive`);
  }
  if (!state.loop) {
    const total = state.sequence.reduce((sum, step) => sum + step[1], 0);
    assert.equal(total, state.durationMs, `${name} one-shot duration matches its steps`);
  }
}

// --- scenario harness -------------------------------------------------------
const idleActivity = (over = {}) => ({
  sessionId: 'session-a',
  running: false,
  pendingKey: null,
  thinking: false,
  working: false,
  error: null,
  dragging: false,
  ...over,
});

/** Advance a machine frame by frame, collecting the state names it displayed. */
function run(machine, start, end, activityAt) {
  const seen = [];
  for (let t = start; t <= end; t += 16) {
    const state = machine.step(activityAt(t), t);
    if (seen[seen.length - 1] !== state.name) seen.push(state.name);
  }
  return seen;
}


// 1. Settle, then greet once, then idle.
check('greets once after settling, then idles', () => {
  const machine = createMachine();
  const seen = run(machine, 0, 4000, () => idleActivity());
  assert.deepEqual(seen, ['idle', 'greeting', 'idle']);
});

// 2. A busy page is never greeted over live work.
check('skips the greeting when work is already running', () => {
  const machine = createMachine();
  const seen = run(machine, 0, 1200, () => idleActivity({ running: true }));
  assert.deepEqual(seen, ['idle', 'thinking']);
});

// 3. Thinking vs working come from the Chat facts.
check('separates thinking from tool work', () => {
  const machine = createMachine();
  const seen = run(machine, 0, 1500, (t) => idleActivity({
    running: true,
    thinking: t < 800,
    working: t >= 800,
  }));
  assert.deepEqual(seen.slice(-2), ['thinking', 'working']);
});

// 4. Waiting is deduped by key, holds its final pose, and releases.
check('announces one approval once and holds it until answered', () => {
  const machine = createMachine();
  run(machine, 0, 400, () => idleActivity());
  const waiting = run(machine, 400, 6000, () => idleActivity({ pendingKey: 'approval-1' }));
  assert.deepEqual(waiting, ['waiting'], 'still held well past its 1.6 s duration');
  const released = machine.step(idleActivity(), 6100);
  assert.equal(released.name, 'idle');
});

check('a second approval replays the gesture', () => {
  const machine = createMachine();
  run(machine, 0, 400, () => idleActivity());
  run(machine, 400, 1000, () => idleActivity({ pendingKey: 'a' }));
  run(machine, 1000, 1200, () => idleActivity());
  const second = run(machine, 1200, 1600, () => idleActivity({ pendingKey: 'b' }));
  assert.ok(second.includes('waiting'));
});

// 5. Success only after a turn that actually ran.
check('cheers when a real turn ends', () => {
  const machine = createMachine();
  run(machine, 0, 400, () => idleActivity());
  run(machine, 400, 3400, () => idleActivity({ running: true }));
  const after = run(machine, 3400, 3700, () => idleActivity());
  assert.equal(after[0], 'success');
});

check('does not cheer for a turn that never started', () => {
  const machine = createMachine();
  run(machine, 0, 400, () => idleActivity());
  run(machine, 400, 600, () => idleActivity({ running: true }));
  const after = run(machine, 600, 900, () => idleActivity());
  assert.ok(!after.includes('success'));
});

// 6. A new error startles; the same error never replays.
check('startles on a new error and dedupes repeats', () => {
  const machine = createMachine();
  run(machine, 0, 400, () => idleActivity());
  run(machine, 400, 3400, () => idleActivity({ running: true }));
  const failed = run(machine, 3400, 3700, () => idleActivity({ error: 'boom' }));
  assert.equal(failed[0], 'error');
  run(machine, 3700, 6000, () => idleActivity({ error: 'boom' }));
  const again = run(machine, 6000, 6300, () => idleActivity({ error: 'boom' }));
  assert.ok(!again.includes('error'));
});

// 7. Head pats respect urgency.
check('refuses to head-pat through an approval', () => {
  const machine = createMachine();
  run(machine, 0, 400, () => idleActivity());
  run(machine, 400, 500, () => idleActivity({ pendingKey: 'approval-9' }));
  machine.headPat(520);
  assert.equal(machine.step(idleActivity({ pendingKey: 'approval-9' }), 540).name, 'waiting');
});

check('head-pats a calm pet', () => {
  const machine = createMachine();
  run(machine, 0, 4000, () => idleActivity());
  machine.headPat(4100);
  assert.equal(machine.step(idleActivity(), 4120).name, 'head-pat');
});

// 8. Sleeping needs a quiet, unblocked pet.
check('falls asleep after inactivity and wakes on a head pat', () => {
  const machine = createMachine();
  run(machine, 0, 4000, () => idleActivity());
  const asleep = run(machine, 4000, 100000, () => idleActivity());
  assert.equal(asleep[asleep.length - 1], 'sleep');
  machine.headPat(100100);
  assert.equal(machine.step(idleActivity(), 100120).name, 'head-pat');
});

check('never sleeps while work is pending', () => {
  const machine = createMachine();
  run(machine, 0, 400, () => idleActivity());
  const seen = run(machine, 400, 200000, () => idleActivity({ running: true }));
  assert.ok(!seen.includes('sleep'));
});

// 9. Switching conversations is not a finished turn.
check('never cheers for a session switch', () => {
  const machine = createMachine();
  run(machine, 0, 400, () => idleActivity());
  run(machine, 400, 2400, () => idleActivity({ running: true }));
  const switched = run(machine, 2400, 3000, () => idleActivity({ sessionId: 'session-b' }));
  assert.ok(!switched.includes('success'));
  assert.equal(switched[switched.length - 1], 'idle');
});

check('reports the new session immediately', () => {
  const machine = createMachine();
  run(machine, 0, 2600, () => idleActivity()); // past the one-time greeting
  const switched = run(machine, 2600, 3200, () => idleActivity({ sessionId: 'session-c', running: true, working: true }));
  assert.equal(switched[switched.length - 1], 'working');
});

// 10. Carrying is a pointer gesture, not a stance: the pet keeps the pose its
//     session is in and only the drawn frame mirrors (component-level).
check('carrying never changes the stance', () => {
  const machine = createMachine();
  run(machine, 0, 2600, () => idleActivity()); // past the greeting
  const carried = run(machine, 2600, 3600, () => idleActivity({ dragging: true }));
  assert.deepEqual(carried, ['idle']);
  const busy = createMachine();
  run(busy, 0, 400, () => idleActivity({ running: true, working: true }));
  assert.equal(busy.step(idleActivity({ dragging: true, running: true, working: true }), 500).name, 'working');
});

// 11. The carried pose is graded by how far the pet has been carried.
check('hangs neutral when merely taken hold of', () => {
  assert.equal(dragPose(0, 1), DRAG_POSES.neutral);
  assert.equal(dragPose(0, -1), DRAG_POSES.neutral);
  assert.equal(dragPose(12, 1), DRAG_POSES.neutral);
});

check('leans a little when nudged, fully once carried', () => {
  assert.equal(dragPose(80, 1), DRAG_POSES.soft.right);
  assert.equal(dragPose(80, -1), DRAG_POSES.soft.left);
  assert.equal(dragPose(400, 1), DRAG_POSES.hard.right);
  assert.equal(dragPose(400, -1), DRAG_POSES.hard.left);
});

check('stays bent while a long carry is paused', () => {
  // Distance, not pointer speed: holding a carried pet still must not drop it
  // back to hanging straight down.
  assert.equal(dragPose(400, -1), DRAG_POSES.hard.left);
  assert.equal(dragPose(80, 1), DRAG_POSES.soft.right);
});

check('the three levels are three different drawings', () => {
  const drawn = new Set([
    DRAG_POSES.neutral,
    DRAG_POSES.soft.right, DRAG_POSES.soft.left,
    DRAG_POSES.hard.right, DRAG_POSES.hard.left,
  ]);
  assert.equal(drawn.size, 5);
  for (const index of drawn) assert.ok(index >= 0 && index < 6);
});

console.log(results.join('\n'));
console.log(process.exitCode ? '\nmachine test FAILED' : '\nmachine test passed');
