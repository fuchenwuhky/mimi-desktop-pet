'use strict';
const { spawn } = require('node:child_process');
const child = spawn(process.execPath, [require.resolve('electron-builder/out/cli/cli.js'), '--win', 'portable', 'zip', '--x64'], {
  stdio: 'inherit',
  // Moderate compression avoids prolonged high-memory packaging for a small desktop companion.
  env: { ...process.env, ELECTRON_BUILDER_COMPRESSION_LEVEL: '5' }
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code === null ? 1 : code; });
