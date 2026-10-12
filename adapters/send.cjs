#!/usr/bin/env node
'use strict';

const { sendEvent } = require('./client.cjs');

async function main() {
  const [source, event, ...message] = process.argv.slice(2);
  if (!source || !event) {
    console.error('Usage: node adapters/send.cjs <source> <working|waiting|success|error|idle> [short message]');
    process.exitCode = 1;
    return;
  }
  try {
    await sendEvent({ source, event, message: message.join(' ') });
    console.log('咪咪收到啦。');
  } catch (error) {
    console.error(`未送达：${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();
