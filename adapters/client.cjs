'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const EVENTS = new Set(['working', 'waiting', 'success', 'error', 'idle']);

function cleanEvent(input) {
  if (!input || !EVENTS.has(input.event)) throw new Error('Unsupported event.');
  if (typeof input.source !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9 ._-]{0,47}$/.test(input.source)) {
    throw new Error('Source must be a short application identifier.');
  }
  const event = { source: input.source, event: input.event };
  if (input.sessionId !== undefined) {
    if (typeof input.sessionId !== 'string' || !/^[a-zA-Z0-9._:-]{1,96}$/.test(input.sessionId)) throw new Error('Invalid session identifier.');
    event.sessionId = input.sessionId;
  }
  if (typeof input.message === 'string' && input.message) event.message = input.message.replace(/[\u0000-\u001f]/g, ' ').slice(0,160);
  return event;
}

async function sendEvent(input, options = {}) {
  const event = cleanEvent(input);
  const port = Number(options.port ?? process.env.MIMI_PET_PORT ?? 47831);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid local port.');
  const tokenPath = options.tokenFile ?? process.env.MIMI_PET_TOKEN_FILE ?? path.join(os.homedir(), '.mimi-pet', 'token');
  const token = (await fs.readFile(tokenPath, 'utf8')).trim();
  if (!token || /[\r\n]/.test(token)) throw new Error('Invalid local token. Start the desktop pet first.');
  const body = JSON.stringify(event);
  const timeout = options.timeout ?? 700;
  await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port, path: '/events', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'X-Mimi-Token': token },
    }, res => {
      res.resume();
      res.once('end', () => res.statusCode >= 200 && res.statusCode < 300
        ? resolve() : reject(new Error(`Local pet returned HTTP ${res.statusCode}.`)));
    });
    const timer = setTimeout(() => req.destroy(new Error('Local pet timed out.')), timeout);
    req.once('close', () => clearTimeout(timer));
    req.once('error', reject);
    req.end(body);
  });
  return event;
}

module.exports = { EVENTS, cleanEvent, sendEvent };
