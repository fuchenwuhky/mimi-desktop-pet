#!/usr/bin/env node
'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');

function quoteScript(filename, platform) {
  if (platform === 'win32') {
    // Generated strings may be evaluated by cmd or PowerShell, depending on host.
    if (/["`$%!\r\n]/.test(filename)) throw new Error('Move the pet to a path without shell special characters before generating hooks.');
    return `"${filename.replace(/\\/g, '/')}"`;
  }
  return `'${filename.replace(/'/g, "'\\''")}'`;
}

function configurations(script = path.join(__dirname, 'hook.cjs'), platform = process.platform) {
  const command = (source, event) => `node ${quoteScript(script, platform)} ${source} ${event}`;
  const nested = (source, names, timeout) => ({
    hooks: Object.fromEntries(names.map(name => [name, [{ hooks: [{ type: 'command', command: command(source, name), timeout }] }]])),
  });
  const codex = nested('codex', ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PermissionRequest', 'Stop', 'Interrupt', 'SessionEnd'], 3);
  const claude = nested('claude-code', ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PermissionRequest', 'Stop', 'StopFailure', 'PostToolUseFailure', 'SessionEnd'], 3);
  claude.hooks.Notification = [{ matcher: 'permission_prompt|idle_prompt|elicitation_dialog', hooks: [{ type: 'command', command: command('claude-code', 'Notification'), timeout: 3 }] }];
  const gemini = nested('gemini-cli', ['SessionStart', 'BeforeAgent', 'BeforeTool', 'AfterTool', 'AfterAgent', 'SessionEnd'], 2000);
  gemini.hooks.Notification = [{ matcher: 'ToolPermission', hooks: [{ type: 'command', command: command('gemini-cli', 'Notification'), timeout: 2000 }] }];
  const cursor = { version: 1, hooks: Object.fromEntries(['sessionStart', 'beforeSubmitPrompt', 'postToolUse', 'postToolUseFailure', 'stop', 'sessionEnd'].map(name => [name, [{ command: command('cursor', name) }]])) };
  return { 'codex.hooks.json': codex, 'claude.settings.fragment.json': claude, 'cursor.hooks.json': cursor, 'gemini.settings.fragment.json': gemini };
}

async function main() {
  const destination = path.resolve(__dirname, 'generated');
  await fs.mkdir(destination, { recursive: true });
  for (const [filename, config] of Object.entries(configurations())) {
    await fs.writeFile(path.join(destination, filename), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  }
  console.log(`已生成到 ${destination}。现有智能体设置没有改动。`);
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { configurations };
