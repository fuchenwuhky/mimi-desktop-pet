'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { fileURLToPath, pathToFileURL } = require('node:url');
const animation = require('./animation.cjs');
const behavior = require('./behavior.cjs');

// Run the actual renderer and its public DOM/preload callbacks. Only browser
// surfaces, image decoding, the clock and randomness are replaced; scheduler,
// animation transitions and movement decisions remain production code.
async function rendererHarness() {
  let now = 0, nextFrame, resolveReady, rejectReady;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const nodes = new Map(), subscriptions = new Map(), runs = [];
  const drawing = { clearRect() {}, save() {}, translate() {}, scale() {}, drawImage() {}, restore() {} };
  function element(id) {
    if (nodes.has(id)) return nodes.get(id);
    const events = new Map(), classes = new Set();
    const node = {
      hidden: id === 'missing', dataset: {}, textContent: '', width: 192, height: 208,
      style: { setProperty() {} },
      classList: { add: name => classes.add(name), remove: name => classes.delete(name), toggle() {} },
      addEventListener: (name, callback) => events.set(name, callback),
      emit: (name, event) => events.get(name)?.(event),
      getContext: () => drawing,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 192, height: 208 }),
      setPointerCapture() {}, hasPointerCapture: () => false, releasePointerCapture() {}
    };
    nodes.set(id, node);
    return node;
  }
  const document = {
    // Deliberately stays false: Electron may report this while its native
    // window is hidden when backgroundThrottling is disabled.
    hidden: false, getElementById: element, querySelector: element,
    documentElement: element('root'), body: element('body'), addEventListener() {}
  };
  const mimi = {
    initial: async () => ({ visible: true, settings: { quiet: false }, state: { event: 'idle' } }),
    run: (direction, duration) => runs.push({ direction, duration, at: now }),
    dragStart() {}, drag() {}, dragEnd() {}, hover() {}
  };
  for (const name of ['State', 'Action', 'Settings', 'Notice', 'Pointer', 'Visibility']) {
    mimi[`on${name}`] = callback => subscriptions.set(name, callback);
  }
  class ImageStub {
    set src(url) {
      // Use the real PNG dimensions so normal manifest validation still runs.
      const bytes = fs.readFileSync(fileURLToPath(url));
      this.naturalWidth = bytes.readUInt32BE(16);
      this.naturalHeight = bytes.readUInt32BE(20);
      this.onload();
    }
  }
  class DeterministicScheduler extends behavior.AmbientScheduler {
    constructor(options) { super({ ...options, random: () => .999 }); }
  }
  const context = vm.createContext({
    document,
    window: {
      mimi, MimiAnimation: animation,
      MimiBehavior: { ...behavior, AmbientScheduler: DeterministicScheduler },
      location: { href: pathToFileURL(path.join(__dirname, 'index.html')).href },
      matchMedia: () => ({ matches: false }), addEventListener() {}
    },
    performance: { now: () => now }, URL, Image: ImageStub,
    fetch: async () => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/pet/manifest.json'), 'utf8')) }),
    requestAnimationFrame: callback => { nextFrame = callback; resolveReady(); return 1; },
    cancelAnimationFrame() {}, setTimeout: () => 1, clearTimeout() {},
    console: { ...console, error: rejectReady }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'renderer.js'), 'utf8'), context, { filename: 'renderer.js' });
  await ready;
  return {
    cat: element('cat'), canvas: element('sprite'), document, runs,
    at: value => { now = value; },
    advance: value => { now = value; nextFrame(now); },
    nativeVisibility: visible => subscriptions.get('Visibility')(visible)
  };
}

function startRandomRun(harness) {
  harness.advance(0);
  // Jump past the first deadline and the three-minute running cooldown.
  harness.advance(200000);
  assert.equal(harness.canvas.dataset.ambientAction, 'run');
  harness.advance(200700);
  assert.equal(harness.canvas.dataset.animation, 'standToRun');
  assert.equal(harness.runs.length, 0, 'window movement must wait for the running pose');
}

test('renderer drops pending autonomous movement when dragging begins during stand-to-run', { timeout: 2000 }, async () => {
  const harness = await rendererHarness();
  startRandomRun(harness);
  harness.at(200800);
  harness.cat.emit('pointerdown', { button: 0, screenX: 100, screenY: 100, pointerId: 1 });
  harness.cat.emit('pointermove', { screenX: 130, screenY: 100, clientX: 130, clientY: 100 });
  harness.advance(201000);
  assert.equal(harness.canvas.dataset.animation, 'runRight');
  assert.equal(harness.runs.length, 0, 'the running animation must not steal the drag with a movement IPC');
  harness.cat.emit('pointerup', { button: 0, pointerId: 1 });
  harness.advance(201200);
  assert.equal(harness.runs.length, 0, 'releasing the drag must not replay discarded movement');
});

test('renderer honors native hide even if document.hidden is false, and waits again after showing', { timeout: 2000 }, async () => {
  const harness = await rendererHarness();
  startRandomRun(harness);
  harness.at(200800);
  harness.nativeVisibility(false);
  assert.equal(harness.document.hidden, false);
  harness.advance(201000);
  assert.equal(harness.canvas.dataset.animation, 'runRight');
  assert.equal(harness.runs.length, 0, 'hiding during the bridge must discard pending movement');
  for (const time of [204000, 204500, 208000]) harness.advance(time);
  delete harness.canvas.dataset.ambientAction;
  harness.advance(1000000);
  harness.advance(2000000);
  assert.equal(harness.canvas.dataset.ambientAction, undefined, 'hidden windows must not begin new random actions');
  harness.nativeVisibility(true);
  harness.advance(2000000);
  harness.advance(2000001);
  assert.equal(harness.canvas.dataset.ambientAction, undefined, 'showing must not replay a missed deadline');
  harness.advance(2066000);
  assert.ok(harness.canvas.dataset.ambientAction, 'a fresh visible interval should allow random actions again');
  assert.equal(harness.runs.length, 0);
});
