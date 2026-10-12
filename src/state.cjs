'use strict';

const TTL = { working: 600_000, waiting: 300_000, success: 9_000, error: 25_000, idle: 1_000 };
const PRIORITY = { waiting: 5, error: 4, working: 3, success: 2, idle: 0 };
const EVENTS = Object.freeze(Object.keys(TTL));

function validateEvent(input) {
  if (!input || Array.isArray(input) || typeof input !== 'object') return '需要 JSON 对象';
  if (typeof input.source !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9 ._-]{0,47}$/.test(input.source)) return 'source 需要 1–48 个字母、数字、空格或 ._-';
  if (!EVENTS.includes(input.event)) return '不支持的 event';
  if (input.message !== undefined && (typeof input.message !== 'string' || input.message.length > 160 || /[\x00-\x08\x0b-\x1f]/.test(input.message))) return 'message 最多 160 字，不允许控制字符';
  if (input.sessionId !== undefined && (typeof input.sessionId !== 'string' || !/^[a-zA-Z0-9._:-]{1,96}$/.test(input.sessionId))) return 'sessionId 格式不正确';
  return null;
}

class StateStore {
  constructor(now = Date.now) { this.now = now; this.sessions = new Map(); this.sequence = 0; this.selectedKey = null; }
  accept(input) {
    const error = validateEvent(input);
    if (error) throw new Error(error);
    const key = `${input.source}:${input.sessionId || 'default'}`;
    if (input.event === 'idle') this.sessions.delete(key);
    else {
      if (!this.sessions.has(key) && this.sessions.size >= 100) {
        const oldest = [...this.sessions].sort((a, b) => a[1].updatedAt - b[1].updatedAt)[0];
        this.sessions.delete(oldest[0]);
      }
      this.sessions.set(key, { source: input.source, event: input.event, message: input.message || '', sessionId: input.sessionId || 'default', updatedAt: this.now(), expiresAt: this.now() + TTL[input.event], sequence: ++this.sequence });
    }
    return this.current();
  }
  current() {
    const now = this.now();
    for (const [key, session] of this.sessions) if (session.expiresAt <= now) this.sessions.delete(key);
    const active = [...this.sessions.values()].sort((a, b) => PRIORITY[b.event] - PRIORITY[a.event] || b.sequence - a.sequence);
    let top = active[0];
    const selected = this.sessions.get(this.selectedKey);
    if (selected && top && PRIORITY[selected.event] === PRIORITY[top.event]) top = selected;
    this.selectedKey = top ? `${top.source}:${top.sessionId}` : null;
    return top ? { ...top, activeCount: active.length } : { source: '', event: 'idle', message: '', sessionId: '', sequence: 0, activeCount: 0 };
  }
}

module.exports = { StateStore, validateEvent, EVENTS, TTL };
