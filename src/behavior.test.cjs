'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { AmbientScheduler, INTERVALS, speechHeight, surfaceVisible, canMovePet } = require('./behavior.cjs');
const idle = { event: 'idle' };
function seeded(seed = 735) { return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296); }

test('first action is delayed; each frequency respects its own random interval', () => {
  for (const [frequency, [min, max]] of Object.entries(INTERVALS)) {
    const scheduler = new AmbientScheduler({ random: () => .5, now: 1000 });
    const context = { ...idle, ambientFrequency: frequency };
    assert.equal(scheduler.tick(1000, context), null);
    const deadline = 1000 + (min + max) / 2;
    assert.equal(scheduler.nextAt, deadline);
    assert.equal(scheduler.tick(deadline - 1, context), null);
    assert.ok(scheduler.tick(deadline, context));
    assert.equal(scheduler.tick(deadline + 1, context), null);
  }
});
test('sleep resumes with at most one action and schedules from the present', () => {
  const scheduler = new AmbientScheduler({ random: () => .5 });
  scheduler.tick(0, idle);
  assert.ok(scheduler.tick(3600000, idle));
  assert.equal(scheduler.nextAt, 3645000);
  for (let offset = 1; offset < 100; offset++) assert.equal(scheduler.tick(3600000 + offset, idle), null);
});
test('blocked states, hidden windows, dragging, disabled actions and reduced motion discard overdue work', () => {
  const gates = [{ event: 'waiting' }, { event: 'error' }, { event: 'success' }, { ready: false }, { dragging: true }, { inSequence: true }, { ambientEnabled: false }, { reducedMotion: true }];
  for (const gate of gates) {
    const scheduler = new AmbientScheduler({ random: () => 0 });
    scheduler.tick(0, idle);
    assert.equal(scheduler.tick(30000, { ...idle, ...gate }), null);
    assert.equal(scheduler.nextAt, null);
    assert.equal(scheduler.tick(120000, idle), null);
    assert.equal(scheduler.nextAt, 145000);
    assert.ok(scheduler.tick(145000, idle));
  }
});
test('real interaction restarts the wait instead of triggering an expired deadline', () => {
  const scheduler = new AmbientScheduler({ random: () => 0 });
  scheduler.tick(0, idle); scheduler.reset();
  assert.equal(scheduler.tick(24999, idle), null);
  assert.equal(scheduler.nextAt, 49999);
  assert.equal(scheduler.tick(25000, idle), null);
});
test('idle actions never repeat consecutively and long actions honor their cooldowns', () => {
  const scheduler = new AmbientScheduler({ random: seeded() });
  scheduler.tick(0, idle);
  const counts = {}, lastUsed = { run: 0 }, elapsed = { run: 180000, loaf: 120000 };
  let previous;
  for (let i = 0; i < 1000; i++) {
    const now = scheduler.nextAt;
    const action = scheduler.tick(now, idle);
    assert.notEqual(action.name, previous);
    if (elapsed[action.name] && lastUsed[action.name] !== undefined) assert.ok(now - lastUsed[action.name] >= elapsed[action.name]);
    lastUsed[action.name] = now; previous = action.name;
    counts[action.name] = (counts[action.name] || 0) + 1;
  }
  for (const name of ['peek', 'knead', 'wave', 'loaf', 'run']) assert.ok(counts[name] > 0, `${name} should be reachable`);
  assert.ok(counts.run < counts.loaf && counts.run < counts.peek);
});
test('working allows only infrequent quiet inspection and re-arms when work finishes', () => {
  const scheduler = new AmbientScheduler({ random: seeded() });
  const working = { event: 'working' };
  scheduler.tick(0, working);
  assert.ok(scheduler.nextAt >= 52500 && scheduler.nextAt <= 112500);
  for (let i = 0; i < 20; i++) {
    const action = scheduler.tick(scheduler.nextAt, working);
    assert.equal(action.name, 'peek'); assert.equal(action.speak, false);
  }
  const before = scheduler.nextAt;
  assert.equal(scheduler.tick(before, idle), null);
  assert.ok(scheduler.nextAt > before);
});
test('quiet mode keeps gentle animation but never volunteers speech and makes running rarer', () => {
  const counts = [];
  for (const quiet of [false, true]) {
    const scheduler = new AmbientScheduler({ random: seeded(4254) });
    const context = { ...idle, quiet };
    scheduler.tick(0, context);
    let runs = 0, speech = 0, gentle = 0;
    for (let i = 0; i < 2000; i++) {
      const action = scheduler.tick(scheduler.nextAt, context);
      if (action.name === 'run') runs++; else gentle++;
      if (action.speak) speech++;
    }
    assert.ok(gentle > 0);
    if (quiet) assert.equal(speech, 0); else assert.ok(speech > 0 && speech < 1000);
    counts.push(runs);
  }
  assert.ok(counts[1] < counts[0] / 2);
});
test('speech transitions meet the adjacent posture at both ends and interpolate without overshoot', () => {
  for (const [name, before, after] of [['settle', 'idle', 'loaf'], ['rise', 'loaf', 'idle'], ['standToRun', 'idle', 'runRight'], ['standToRunLeft', 'idle', 'runLeft'], ['runToStand', 'runRight', 'idle'], ['runToStandLeft', 'runLeft', 'idle']]) {
    const start = speechHeight(before), end = speechHeight(after);
    assert.equal(speechHeight(name, 0), start);
    assert.equal(speechHeight(name, 1), end);
    assert.equal(speechHeight(name, .5), (start + end) / 2);
    assert.equal(speechHeight(name, -1), start);
    assert.equal(speechHeight(name, 2), end);
    assert.equal(speechHeight(name, NaN), start);
  }
});
test('native hide blocks autonomous motion even when Electron still reports a visible document', () => {
  const scheduler = new AmbientScheduler({ random: () => 0 });
  const context = { ...idle, ready: surfaceVisible({ windowVisible: true, documentHidden: false }) };
  scheduler.tick(0, context);
  context.ready = surfaceVisible({ windowVisible: false, documentHidden: false });
  assert.equal(context.ready, false);
  assert.equal(scheduler.tick(30000, context), null);
  assert.equal(scheduler.nextAt, null);
  context.ready = surfaceVisible({ windowVisible: true, documentHidden: false });
  assert.equal(scheduler.tick(90000, context), null);
  assert.equal(scheduler.nextAt, 115000);
  assert.ok(scheduler.tick(115000, context));
  assert.equal(surfaceVisible({ preview: true, windowVisible: false, documentHidden: false }), true);
  assert.equal(surfaceVisible({ preview: true, windowVisible: true, documentHidden: true }), false);
  assert.equal(surfaceVisible({ windowVisible: true, documentHidden: true }), false);
});
test('a grabbed pet cannot start translating while its run bridge finishes', () => {
  assert.equal(canMovePet({ visible: true }), true);
  assert.equal(canMovePet({ visible: true, pointerDown: true }), false);
  assert.equal(canMovePet({ visible: true, dragging: true }), false);
  assert.equal(canMovePet({ visible: false }), false);
  assert.equal(canMovePet({ visible: true, reducedMotion: true }), false);
});
