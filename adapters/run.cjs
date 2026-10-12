#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { sendEvent } = require('./client.cjs');

async function run(source, command, args = []) {
  const sessionId = randomUUID();
  const signalPet = event => sendEvent({ source, event, sessionId }).catch(() => {});
  await signalPet('working');
  return new Promise(resolve => {
    // Explicit argv and shell:false preserve arguments and avoid shell interpolation.
    // On Windows use run.ps1 for npm .cmd shims.
    const child = spawn(command, args, { stdio: 'inherit', shell: false, windowsHide: false });
    let settled = false;
    const heartbeat = setInterval(() => { void signalPet('working'); }, 30_000);
    const onInterrupt = () => child.kill('SIGINT');
    const onTerminate = () => child.kill('SIGTERM');
    process.on('SIGINT', onInterrupt);
    process.on('SIGTERM', onTerminate);
    const finish = async (code, signal) => {
      if (settled) return;
      settled = true;
      clearInterval(heartbeat);
      process.removeListener('SIGINT', onInterrupt);
      process.removeListener('SIGTERM', onTerminate);
      await signalPet(signal ? 'idle' : code === 0 ? 'success' : 'error');
      resolve(signal ? 130 : code ?? 1);
    };
    child.once('error', error => {
      console.error(`无法启动命令：${error.message}`);
      if (process.platform === 'win32') console.error('Windows 的 .cmd 命令请使用 adapters/run.ps1。');
      void finish(1);
    });
    child.once('close', finish);
  });
}

async function main() {
  const [source, separator, command, ...args] = process.argv.slice(2);
  if (!source || separator !== '--' || !command) {
    console.error('Usage: node adapters/run.cjs <source> -- <executable> [arguments...]');
    process.exitCode = 1;
    return;
  }
  process.exitCode = await run(source, command, args);
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { run };
