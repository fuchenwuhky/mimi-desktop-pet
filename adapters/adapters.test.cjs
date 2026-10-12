'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { normalizeHook } = require('./hook.cjs');
const { sendEvent } = require('./client.cjs');
const { configurations } = require('./generate-configs.cjs');

test('native hooks cover work, attention, completion, error and interruption', () => {
  for (const [source, hook, input, expected] of [
    ['codex', 'UserPromptSubmit', {}, 'working'],
    ['codex', 'PermissionRequest', {}, 'waiting'],
    ['codex', 'Stop', {}, 'success'],
    ['codex', 'Interrupt', {}, 'idle'],
    ['claude-code', 'StopFailure', {}, 'error'],
    ['claude-code', 'Notification', { notification_type: 'permission_prompt' }, 'waiting'],
    ['cursor', 'stop', { status: 'completed' }, 'success'],
    ['cursor', 'stop', { status: 'aborted' }, 'idle'],
    ['cursor', 'stop', { status: 'error' }, 'error'],
    ['gemini-cli', 'BeforeAgent', {}, 'working'],
    ['gemini-cli', 'Notification', { notification_type: 'ToolPermission' }, 'waiting'],
    ['gemini-cli', 'AfterTool', { tool_response: { error: { message: 'private' } } }, 'error'],
  ]) assert.equal(normalizeHook(source, hook, input).event, expected);
  assert.equal(normalizeHook('codex', 'Unknown', {}), null);
  assert.equal(normalizeHook('unknown', 'Stop', {}), null);
  assert.equal(normalizeHook('gemini-cli', 'Notification', { notification_type: 'other' }), null);
});

test('payload cannot leak prompts, tool inputs, paths or raw session identifiers', () => {
  const event = normalizeHook('codex', 'UserPromptSubmit', {
    session_id: 'secret-session', prompt: 'private-prompt', cwd: '/private/path',
    tool_input: { command: 'private-command' }, last_assistant_message: 'private-answer',
  });
  assert.deepEqual(Object.keys(event).sort(), ['event', 'sessionId', 'source']);
  assert.match(event.sessionId, /^[0-9a-f]{24}$/);
  assert.equal(JSON.stringify(event).includes('private'), false);
  assert.equal(event.sessionId, normalizeHook('codex', 'Stop', { session_id: 'secret-session' }).sessionId);
});

test('local HTTP sender supplies token and preserves state; errors remain observable to manual callers', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mimi-adapter-'));
  const tokenFile = path.join(directory, 'token');
  await fs.writeFile(tokenFile, 'test-token\n');
  let request;
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      request = { method: req.method, url: req.url, token: req.headers['x-mimi-token'], body: JSON.parse(Buffer.concat(chunks)) };
      res.writeHead(request.body.event === 'error' ? 503 : 200);
      res.end('{}');
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    await sendEvent({ source: 'test', event: 'working', message: '咪\n咪' }, { port, tokenFile });
    assert.deepEqual(request, { method: 'POST', url: '/events', token: 'test-token', body: { source: 'test', event: 'working', message: '咪 咪' } });
    await assert.rejects(sendEvent({ source: 'test', event: 'error' }, { port, tokenFile }), /503/);
    await assert.rejects(sendEvent({ source: 'test', event: 'bogus' }, { port, tokenFile }), /Unsupported/);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await fs.unlink(tokenFile);
    await fs.rmdir(directory);
  }
});

function invokeHook(source, name, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, 'hook.cjs'), source, name], {
      env: { ...process.env, MIMI_PET_TOKEN_FILE: path.join(os.tmpdir(), 'mimi-definitely-missing-token') },
    });
    let stdout = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.once('error', reject);
    child.once('close', code => resolve({ code, stdout }));
    child.stdin.end(JSON.stringify(input));
  });
}

test('offline pet never blocks native hooks or injects text into model context', async () => {
  assert.deepEqual(await invokeHook('codex', 'PermissionRequest', {}), { code: 0, stdout: '{}\n' });
  assert.deepEqual(await invokeHook('codex', 'Stop', {}), { code: 0, stdout: '{}\n' });
  assert.deepEqual(await invokeHook('cursor', 'beforeSubmitPrompt', {}), { code: 0, stdout: '{"continue":true}\n' });
  assert.deepEqual(await invokeHook('gemini-cli', 'BeforeAgent', {}), { code: 0, stdout: '{}\n' });
});

test('configuration fragments use host-specific structure and timeout units', () => {
  const configs = configurations('D:\\cat space\\adapters\\hook.cjs', 'win32');
  assert.equal(configs['codex.hooks.json'].hooks.Stop[0].hooks[0].timeout, 3);
  assert.equal(configs['gemini.settings.fragment.json'].hooks.AfterAgent[0].hooks[0].timeout, 2000);
  assert.equal(configs['cursor.hooks.json'].version, 1);
  assert.match(configs['cursor.hooks.json'].hooks.stop[0].command, /"D:\/cat space\/adapters\/hook.cjs" cursor stop/);
  assert.throws(() => configurations('D:\\cat$secret\\hook.cjs', 'win32'));
});

test('Node command wrapper preserves child exit code', () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'run.cjs'), 'test', '--', process.execPath, '-e', 'process.exit(7)'], {
    env: { ...process.env, MIMI_PET_TOKEN_FILE: path.join(os.tmpdir(), 'mimi-definitely-missing-token') },
    encoding: 'utf8',
  });
  assert.equal(result.status, 7, result.stderr);
});

test('PowerShell wrapper preserves argv and child exit code', { skip: process.platform !== 'win32' }, () => {
  const script = `& '${path.join(__dirname, 'run.ps1').replace(/'/g, "''")}' -Source test -Command '${process.execPath.replace(/'/g, "''")}' -CommandArgs @('-e', 'process.exit(6)'); exit $LASTEXITCODE`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
    env: { ...process.env, MIMI_PET_TOKEN_FILE: path.join(os.tmpdir(), 'mimi-definitely-missing-token') },
    encoding: 'utf8',
  });
  assert.equal(result.status, 6, result.stderr);
});
