#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validateEvent } = require('../src/state.cjs');

async function sendEvent(payload) {
  const error = validateEvent(payload);
  if (error) throw new Error(error);
  const token = fs.readFileSync(path.join(os.homedir(), '.mimi-pet', 'token'), 'utf8').trim();
  const response = await fetch('http://127.0.0.1:47831/events', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Mimi-Token': token }, body: JSON.stringify(payload), signal: AbortSignal.timeout(2000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  return result;
}
if (require.main === module) {
  const [event, source = 'terminal', message = '', sessionId = 'default'] = process.argv.slice(2);
  if (!event || event === '--help') { console.log('用法：node scripts/event.cjs <working|waiting|success|error|idle> [source] [message] [sessionId]'); process.exit(event ? 0 : 1); }
  sendEvent({ source, event, message, sessionId }).then(result => console.log(JSON.stringify(result))).catch(error => { console.error(`咪咪暂时没有收到：${error.message}`); process.exitCode = 1; });
}
module.exports = { sendEvent };
