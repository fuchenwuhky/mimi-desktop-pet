'use strict';

// One deadline, checked by the animation loop. Missed deadlines are never queued.
const INTERVALS = Object.freeze({ calm: [45000, 95000], normal: [25000, 65000], lively: [15000, 40000] });
const COOLDOWNS = Object.freeze({ loaf: 120000, run: 180000 });
class AmbientScheduler {
  constructor({ random = Math.random, now = 0 } = {}) {
    this.random = random; this.nextAt = null; this.mode = null; this.lastAction = null;
    this.lastUsed = { run: now, loaf: -Infinity };
  }
  reset() { this.nextAt = null; this.mode = null; }
  interval(event, frequency) {
    const [min, max] = INTERVALS[frequency] || INTERVALS.normal;
    const delay = min + this.random() * (max - min);
    return event === 'working' ? delay * 1.5 + 15000 : delay;
  }
  tick(now, context) {
    const { event = 'idle', ready = true, inSequence = false, dragging = false, quiet = false, reducedMotion = false, ambientEnabled = true, ambientFrequency = 'normal' } = context;
    if (!ready || !ambientEnabled || reducedMotion || inSequence || dragging || !['idle', 'working'].includes(event)) {
      this.reset(); return null;
    }
    const mode = `${event}:${ambientFrequency}:${quiet}`;
    if (this.nextAt === null || this.mode !== mode) {
      this.mode = mode; this.nextAt = now + this.interval(event, ambientFrequency); return null;
    }
    if (now < this.nextAt) return null;
    // Schedule from *now*, even after sleep or a suspended renderer.
    this.nextAt = now + this.interval(event, ambientFrequency);
    let name = 'peek';
    if (event === 'idle') {
      const options = [{ name: 'peek', weight: 34 }, { name: 'knead', weight: 29 }, { name: 'wave', weight: 20 }, { name: 'loaf', weight: 14 }, { name: 'run', weight: quiet ? .35 : 3 }]
        .filter(action => action.name !== this.lastAction && (!COOLDOWNS[action.name] || now - this.lastUsed[action.name] >= COOLDOWNS[action.name]));
      let choice = this.random() * options.reduce((sum, action) => sum + action.weight, 0);
      name = options[options.length - 1].name;
      for (const action of options) { choice -= action.weight; if (choice < 0) { name = action.name; break; } }
    }
    this.lastAction = name; this.lastUsed[name] = now;
    return { name, direction: name === 'run' && this.random() < .5 ? 'left' : 'right', holdMs: name === 'loaf' ? 7000 + this.random() * 5000 : 0, speak: event === 'idle' && !quiet && this.random() < .35 };
  }
}

function surfaceVisible({ preview = false, windowVisible = false, documentHidden = false }) {
  // Native BrowserWindow visibility remains authoritative when background
  // throttling is disabled and the document still reports itself as visible.
  return !documentHidden && (preview || windowVisible === true);
}
function canMovePet({ visible, dragging = false, pointerDown = false, reducedMotion = false }) {
  return visible === true && !dragging && !pointerDown && !reducedMotion;
}
function speechHeight(name, progress = 0) {
  const amount = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  if (name === 'settle') return 148 - 58 * amount;
  if (name === 'rise') return 90 + 58 * amount;
  if (['standToRun', 'standToRunLeft'].includes(name)) return 148 - 28 * amount;
  if (['runToStand', 'runToStandLeft'].includes(name)) return 120 + 28 * amount;
  if (name === 'loaf') return 90;
  if (['runLeft', 'runRight'].includes(name)) return 120;
  if (name === 'jumping') return 190;
  return 148;
}
if (typeof module !== 'undefined') module.exports = { AmbientScheduler, INTERVALS, COOLDOWNS, speechHeight, surfaceVisible, canMovePet };
else window.MimiBehavior = { AmbientScheduler, speechHeight, surfaceVisible, canMovePet };
