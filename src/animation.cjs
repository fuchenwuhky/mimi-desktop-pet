'use strict';

function frameAt(animation, elapsedMs, reducedMotion = false) {
  if (reducedMotion) return 0;
  const count = Math.max(1, Math.floor(animation.frames || 1));
  const index = Math.floor(Math.max(0, elapsedMs) * (animation.fps || 6) / 1000);
  return animation.loop === false ? Math.min(index, count - 1) : index % count;
}
function sourceRect(manifest, animation, frame) {
  const width = manifest.cell.width, height = manifest.cell.height;
  const index = animation.reverse ? animation.frames - 1 - frame : frame;
  const absolute = animation.row * manifest.columns + (animation.startColumn || 0) + index;
  return { x: (absolute % manifest.columns) * width, y: Math.floor(absolute / manifest.columns) * height, width, height };
}
function lookDirection(dx, dy) {
  if (dx === 0 && dy === 0) return 0;
  const angle = (Math.atan2(dy, dx) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
  return Math.round(angle / (Math.PI * 2) * 16) % 16;
}
function fitsSheet(manifest, animation, imageWidth, imageHeight) {
  for (let index = 0; index < animation.frames; index++) {
    const rect = sourceRect(manifest, animation, index);
    if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > imageWidth || rect.y + rect.height > imageHeight) return false;
  }
  return true;
}

class ClipPlayer {
  constructor(animations, now = 0, bridges = {}) {
    this.animations = animations; this.bridges = bridges; this.current = 'idle'; this.startedAt = now;
    this.desired = 'idle'; this.pending = null; this.steps = []; this.actionUntil = null; this.inSequence = false; this.serial = 0; this.interruptible = false;
  }
  duration(name) { const clip = this.animations[name]; return clip.frames * 1000 / clip.fps; }
  isOneShot(name) { return this.animations[name].loop === false || ['jumping', 'waving'].includes(name); }
  boundary(now, urgent = false) {
    const duration = this.duration(this.current), elapsed = Math.max(0, now - this.startedAt);
    if (this.isOneShot(this.current)) return Math.max(now, this.startedAt + duration);
    return urgent ? now : now + Math.min(700, duration - elapsed % duration);
  }
  setState(name, now) {
    if (!this.animations[name]) name = 'idle';
    this.desired = name;
    if (this.inSequence && this.interruptible) this.finishAmbient(now);
    if (this.inSequence) return;
    if (name === this.current) { this.pending = null; return; }
    if (this.pending?.name === name) return;
    const bridge = this.bridges[`${this.current}:${name}`];
    if (bridge && this.animations[bridge]) this.play([{ name: bridge }], now);
    else this.pending = { name, at: this.boundary(now) };
  }
  play(steps, now, urgent = false, options = {}) {
    this.steps = steps.filter(step => this.animations[step.name]).map(step => ({ ...step }));
    if (!this.steps.length) return;
    this.inSequence = true; this.actionUntil = null; this.interruptible = options.interruptible === true;
    const step = this.steps.shift();
    this.pending = { name: step.name, at: this.boundary(now, urgent), step };
  }
  finishAmbient(now) {
    if (!this.inSequence || !this.interruptible) return;
    this.interruptible = false;
    // A queued action has not changed the pose yet, so it can simply be cancelled.
    if (this.actionUntil === null) { this.pending = null; this.steps = []; this.inSequence = false; return; }
    if (['standToRun', 'standToRunLeft', 'runLeft', 'runRight', 'runToStand', 'runToStandLeft'].includes(this.current)) return;
    this.steps = ['settle', 'loaf'].includes(this.current) && this.animations.rise ? [{ name: 'rise' }] : [];
    if (!this.isOneShot(this.current)) {
      const duration = this.duration(this.current), elapsed = Math.max(0, now - this.startedAt);
      const boundary = now + (duration - elapsed % duration);
      this.actionUntil = Math.min(this.actionUntil, boundary);
    }
  }
  start(name, now, step) {
    this.current = name; this.startedAt = now; this.serial++; this.pending = null;
    this.actionUntil = step ? now + this.duration(name) * Math.max(step.cycles || 1, Math.ceil((step.holdMs || 0) / this.duration(name))) : null;
  }
  tick(now) {
    if (this.pending && now >= this.pending.at) this.start(this.pending.name, now, this.pending.step);
    if (this.inSequence && this.actionUntil !== null && now >= this.actionUntil) {
      if (this.steps.length) { const step = this.steps.shift(); this.start(step.name, now, step); }
      else { this.inSequence = false; this.actionUntil = null; this.interruptible = false; this.setState(this.desired, now); }
    }
    return { name: this.current, startedAt: this.startedAt, serial: this.serial, inSequence: this.inSequence };
  }
}
if (typeof module !== 'undefined') module.exports = { frameAt, sourceRect, lookDirection, fitsSheet, ClipPlayer };
else window.MimiAnimation = { frameAt, sourceRect, lookDirection, fitsSheet, ClipPlayer };
