'use strict';

// Opt-in desktop verification. It uses real renderer time and saves no settings.
const fs = require('node:fs');
const path = require('node:path');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function observeAmbient({ pet, config, stateStore, broadcast, dataDir, version }) {
  const read = () => pet.webContents.executeJavaScript("(()=>{const c=document.getElementById('sprite'),b=c.getBoundingClientRect();return {animation:c.dataset.animation,ambient:c.dataset.ambientAction||null,serial:Number(c.dataset.ambientSerial||0),frame:Number(c.dataset.frame),missing:!document.getElementById('missing').hidden,rect:{x:b.x,y:b.y,width:b.width,height:b.height}}})()");
  const observations = [];
  const collect = async (phase, duration) => {
    const before = await read(), start = Date.now();
    const changes = []; let previous = '';
    while (Date.now() - start < duration) {
      const value = await read();
      const signature = `${value.animation}:${value.serial}`;
      if (signature !== previous) { changes.push({ elapsedMs: Date.now() - start, ...value }); previous = signature; }
      if (value.missing || value.rect.width !== 192 * config.scale || value.rect.height !== 208 * config.scale) throw new Error(`Invalid sprite stage during ${phase}`);
      await pause(200);
    }
    const after = await read();
    const record = { phase, elapsedMs: Date.now() - start, visible: pet.isVisible(), autonomousActions: after.serial - before.serial, changes };
    observations.push(record);
    console.log(JSON.stringify({ phase, autonomousActions: record.autonomousActions, visible: record.visible }));
    fs.writeFileSync(path.join(dataDir, 'smoke-ambient.json'), JSON.stringify({ version, complete: false, observations }, null, 2));
    return record;
  };
  pet.webContents.send('pet:settings', { ...config, ambientEnabled: true, ambientFrequency: 'lively', reducedMotion: false, quiet: false });
  const idle = await collect('visible-idle', 45000);
  broadcast(stateStore.accept({ source: 'smoke', event: 'waiting', sessionId: 'ambient' }));
  const waiting = await collect('waiting-for-user', 42000);
  broadcast(stateStore.accept({ source: 'smoke', event: 'idle', sessionId: 'ambient' }));
  pet.hide();
  const hidden = await collect('hidden-window', 45000);
  pet.showInactive();
  const restored = await collect('just-restored', 2500);
  const ok = idle.autonomousActions >= 1 && waiting.autonomousActions === 0 && hidden.autonomousActions === 0 && restored.autonomousActions === 0;
  fs.writeFileSync(path.join(dataDir, 'smoke-ambient.json'), JSON.stringify({ version, complete: true, ok, observations }, null, 2));
  fs.writeFileSync(path.join(dataDir, 'smoke-ambient.png'), (await pet.webContents.capturePage()).toPNG());
  if (!ok) throw new Error('Autonomous action gates failed; see smoke-ambient.json');
}
module.exports = { observeAmbient };
