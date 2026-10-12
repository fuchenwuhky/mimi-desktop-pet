'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { StateStore, validateEvent, TTL } = require('./state.cjs');

test('multiple agents: waiting wins; ending one session does not erase another', () => {
  let now = 0; const store = new StateStore(() => now);
  store.accept({ source: 'Codex', event: 'working', sessionId: 'a' });
  store.accept({ source: 'Claude', event: 'waiting', sessionId: 'b' });
  assert.equal(store.current().source, 'Claude');
  store.accept({ source: 'Codex', event: 'success', sessionId: 'a' });
  assert.equal(store.current().event, 'waiting');
  store.accept({ source: 'Claude', event: 'idle', sessionId: 'b' });
  assert.equal(store.current().event, 'success');
  now += TTL.success;
  assert.equal(store.current().event, 'idle');
});
test('working heartbeat extends TTL and abandoned sessions return to idle', () => {
  let now = 0; const store = new StateStore(() => now);
  store.accept({ source: 'Cursor', event: 'working' });
  now = TTL.working - 1;
  assert.equal(store.current().event, 'working');
  store.accept({ source: 'Cursor', event: 'working' });
  now += TTL.working - 1;
  assert.equal(store.current().event, 'working');
  now += 1;
  assert.equal(store.current().event, 'idle');
});
test('event validation blocks unexpected types and excessive content', () => {
  for (const input of [null, [], { source: '<script>', event: 'working' }, { source: 'a', event: 'unknown' }, { source: 'a', event: 'working', message: 'a'.repeat(161) }, { source: 'a', event: 'working', sessionId: '../file' }]) assert.ok(validateEvent(input));
  assert.equal(validateEvent({ source: 'OpenCode', event: 'error', message: '卡住了……', sessionId: 'task:12' }), null);
});
test('session storage is bounded', () => {
  const store = new StateStore(() => 0);
  for (let index = 0; index < 150; index++) store.accept({ source: 'agent', event: 'working', sessionId: String(index) });
  assert.equal(store.sessions.size, 100);
});
test('equal-priority heartbeats keep a stable focused session', () => {
  const store = new StateStore();
  store.accept({ source: 'Codex', event: 'working', sessionId: 'one' });
  store.accept({ source: 'Claude', event: 'working', sessionId: 'two' });
  assert.equal(store.current().source, 'Codex');
  store.accept({ source: 'Claude', event: 'waiting', sessionId: 'two' });
  assert.equal(store.current().source, 'Claude');
});
