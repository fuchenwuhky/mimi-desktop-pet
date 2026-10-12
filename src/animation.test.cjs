'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { frameAt, sourceRect, lookDirection, fitsSheet, ClipPlayer } = require('./animation.cjs');
test('all animation and look frames keep exactly the same source dimensions', () => {
  const manifest = { cell: { width: 192, height: 208 }, columns: 8 };
  for (let row = 0; row < 9; row++) for (let frame = 0; frame < 8; frame++) {
    const rect = sourceRect(manifest, { row }, frame);
    assert.equal(rect.width, 192); assert.equal(rect.height, 208); assert.equal(rect.y, row * 208);
  }
  assert.deepEqual(sourceRect(manifest, { row: 9 }, 15), { x: 1344, y: 2080, width: 192, height: 208 });
});
test('independent 12/16-frame sheets cross rows and reverse without resizing', () => {
  const manifest = { cell: { width: 192, height: 208 }, columns: 8 };
  assert.deepEqual(sourceRect(manifest, { sheet: 'run.png', row: 0, frames: 16 }, 8), { x: 0, y: 208, width: 192, height: 208 });
  assert.deepEqual(sourceRect(manifest, { sheet: 'jump.png', row: 0, frames: 12 }, 11), { x: 576, y: 208, width: 192, height: 208 });
  assert.deepEqual(sourceRect(manifest, { sheet: 'run.png', row: 0, frames: 16, reverse: true }, 0), { x: 1344, y: 208, width: 192, height: 208 });
  assert.deepEqual(sourceRect(manifest, { sheet: 'run.png', row: 0, frames: 16, reverse: true }, 15), { x: 0, y: 0, width: 192, height: 208 });
  assert.equal(fitsSheet(manifest, { row: 0, frames: 16 }, 1536, 416), true);
  assert.equal(fitsSheet(manifest, { row: 0, frames: 16 }, 1536, 208), false);
  assert.equal(fitsSheet(manifest, { row: 0, frames: 6 }, 1152, 208), true);
});
test('playback uses elapsed time, respects one-shot clips, and freezes reduced motion', () => {
  assert.equal(frameAt({ frames: 6, fps: 6 }, 1250), 1);
  assert.equal(frameAt({ frames: 5, fps: 8, loop: false }, 4000), 4);
  assert.equal(frameAt({ frames: 6, fps: 6 }, 500, true), 0);
  assert.equal(frameAt({ frames: 6, fps: 6 }, -200), 0);
});
test('v2 look atlas is clockwise from up, with correct four cardinal directions', () => {
  assert.equal(lookDirection(0, -100), 0);
  assert.equal(lookDirection(100, 0), 4);
  assert.equal(lookDirection(0, 100), 8);
  assert.equal(lookDirection(-100, 0), 12);
  assert.equal(lookDirection(100, -100), 2);
  assert.equal(lookDirection(-100, -100), 14);
});
const clips = { idle: { frames: 6, fps: 6, loop: true }, running: { frames: 6, fps: 6, loop: true }, waiting: { frames: 6, fps: 6, loop: true }, jumping: { frames: 5, fps: 8, loop: false }, waving: { frames: 4, fps: 4, loop: false }, settle: { frames: 6, fps: 10, loop: false }, loaf: { frames: 1, fps: 1, loop: true }, rise: { frames: 6, fps: 10, loop: false }, standToRun: { frames: 3, fps: 10, loop: false }, runLeft: { frames: 8, fps: 12, loop: true }, runToStand: { frames: 3, fps: 10, loop: false } };
test('ordinary state changes wait for a cycle boundary with a 700ms cap', () => {
  const player = new ClipPlayer(clips);
  player.setState('running', 100);
  assert.equal(player.tick(799).name, 'idle');
  assert.equal(player.tick(800).name, 'running');
  player.setState('waiting', 1700);
  assert.equal(player.tick(1799).name, 'running');
  assert.equal(player.tick(1800).name, 'waiting');
});
test('a one-shot finishes before the next status and does not jump back on heartbeat', () => {
  const player = new ClipPlayer(clips);
  player.play([{ name: 'jumping' }], 0, true);
  assert.equal(player.tick(0).name, 'jumping');
  player.setState('waiting', 100);
  assert.equal(player.tick(624).name, 'jumping');
  player.tick(625);
  assert.equal(player.tick(626).name, 'waiting');
  const started = player.startedAt;
  player.setState('waiting', 1000);
  assert.equal(player.tick(1001).startedAt, started);
});
test('rest transitions preserve the sit-to-loaf and reverse lifecycle', () => {
  const player = new ClipPlayer(clips, 0, { 'idle:loaf': 'settle', 'loaf:waiting': 'rise' });
  player.setState('loaf', 0);
  assert.equal(player.tick(700).name, 'settle');
  player.tick(1300);
  assert.equal(player.tick(1301).name, 'loaf');
  player.setState('waiting', 1500);
  assert.equal(player.tick(2200).name, 'rise');
  player.tick(2800);
  assert.equal(player.tick(2801).name, 'waiting');
});
test('startle sequence completes jump, stand, running, sit, then resumes agent state', () => {
  const player = new ClipPlayer(clips);
  player.play([{ name: 'jumping' }, { name: 'standToRun' }, { name: 'runLeft', cycles: 2 }, { name: 'runToStand' }], 0, true);
  assert.equal(player.tick(0).name, 'jumping');
  player.setState('running', 50);
  assert.equal(player.tick(625).name, 'standToRun');
  assert.equal(player.tick(925).name, 'runLeft');
  assert.equal(player.tick(2259).name, 'runToStand');
  player.tick(2559);
  assert.equal(player.tick(2560).name, 'running');
});
test('an agent event cancels an autonomous action that has not started', () => {
  const player = new ClipPlayer(clips);
  player.play([{ name: 'settle' }, { name: 'loaf', holdMs: 15000 }, { name: 'rise' }], 50, false, { interruptible: true });
  player.setState('waiting', 100);
  assert.equal(player.inSequence, false);
  assert.equal(player.tick(800).name, 'waiting');
});
test('work shortens autonomous loaf at a full cycle and still plays the entire rise', () => {
  const player = new ClipPlayer(clips);
  player.play([{ name: 'settle' }, { name: 'loaf', holdMs: 15000 }, { name: 'rise' }], 0, true, { interruptible: true });
  assert.equal(player.tick(0).name, 'settle');
  assert.equal(player.tick(600).name, 'loaf');
  player.setState('running', 800);
  assert.equal(player.actionUntil, 1600);
  assert.equal(player.tick(1599).name, 'loaf');
  assert.equal(player.tick(1600).name, 'rise');
  player.tick(2200);
  assert.equal(player.tick(2201).name, 'running');
});
test('a status during settling preserves both transition directions without waiting through the loaf hold', () => {
  const player = new ClipPlayer(clips);
  player.play([{ name: 'settle' }, { name: 'loaf', holdMs: 15000 }, { name: 'rise' }], 0, true, { interruptible: true });
  player.tick(0); player.setState('waiting', 200);
  assert.equal(player.tick(599).name, 'settle');
  assert.equal(player.tick(600).name, 'rise');
  player.tick(1200); assert.equal(player.tick(1201).name, 'waiting');
});
test('autonomous running retains its run and landing bridges when agent state changes', () => {
  const player = new ClipPlayer(clips);
  player.play([{ name: 'standToRun' }, { name: 'runLeft', cycles: 2 }, { name: 'runToStand' }], 0, true, { interruptible: true });
  player.tick(0); player.setState('waiting', 100);
  assert.equal(player.tick(300).name, 'runLeft');
  assert.equal(player.tick(1634).name, 'runToStand');
  player.tick(1934); assert.equal(player.tick(1935).name, 'waiting');
});
test('manual loaf is allowed to finish instead of being silently shortened', () => {
  const player = new ClipPlayer(clips);
  player.play([{ name: 'loaf', holdMs: 15000 }, { name: 'rise' }], 0, true);
  player.tick(0); player.setState('waiting', 100);
  assert.equal(player.actionUntil, 15000);
});
