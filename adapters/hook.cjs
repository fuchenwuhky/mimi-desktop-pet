#!/usr/bin/env node
'use strict';

const { createHash } = require('node:crypto');
const { sendEvent } = require('./client.cjs');

const SOURCES = new Set(['codex', 'claude-code', 'cursor', 'gemini-cli']);

function normalizeHook(source, name, input = {}) {
  if (!SOURCES.has(source) || !input || typeof input !== 'object') return null;
  const hook = name || input.hook_event_name || input.hookEventName;
  let event;
  if (source === 'cursor') {
    if (['beforeSubmitPrompt', 'postToolUse', 'afterShellExecution', 'afterMCPExecution'].includes(hook)) event = 'working';
    if (hook === 'postToolUseFailure') event = 'error';
    if (hook === 'stop') event = input.status === 'completed' ? 'success' : input.status === 'error' ? 'error' : 'idle';
    if (['sessionStart', 'sessionEnd'].includes(hook)) event = 'idle';
  } else if (source === 'gemini-cli') {
    if (['BeforeAgent', 'BeforeTool', 'AfterTool'].includes(hook)) event = 'working';
    if (hook === 'AfterTool' && input.tool_response?.error) event = 'error';
    if (hook === 'AfterAgent') event = 'success';
    if (hook === 'Notification' && input.notification_type === 'ToolPermission') event = 'waiting';
    if (['SessionStart', 'SessionEnd'].includes(hook)) event = 'idle';
  } else {
    if (['UserPromptSubmit', 'PreToolUse', 'PostToolUse'].includes(hook)) event = 'working';
    if (['PostToolUseFailure', 'StopFailure'].includes(hook)) event = 'error';
    if (hook === 'PermissionRequest') event = 'waiting';
    if (hook === 'Notification' && ['permission_prompt', 'idle_prompt', 'elicitation_dialog'].includes(input.notification_type)) event = 'waiting';
    if (hook === 'Stop') event = 'success';
    if (['SessionStart', 'SessionEnd', 'Interrupt'].includes(hook)) event = 'idle';
  }
  if (!event) return null;
  // Never forward prompts, paths, tool arguments, transcripts, responses, or raw errors.
  const session = input.session_id ?? input.conversation_id;
  const result = { source, event };
  if (typeof session === 'string' && session) {
    result.sessionId = createHash('sha256').update(`${source}:${session}`).digest('hex').slice(0, 24);
  }
  return result;
}

function readInput(stream = process.stdin, timeoutMs = 900) {
  return new Promise(resolve => {
    if (stream.isTTY) return resolve({});
    const chunks = [];
    let bytes = 0;
    let done = false;
    const finish = value => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      stream.removeListener('data', onData);
      stream.removeListener('end', onEnd);
      stream.removeListener('error', onError);
      stream.pause();
      resolve(value);
    };
    const onData = chunk => {
      bytes += chunk.length;
      if (bytes > 1024 * 1024) return finish({});
      chunks.push(chunk);
    };
    const onEnd = () => {
      try { finish(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { finish({}); }
    };
    const onError = () => finish({});
    const timer = setTimeout(() => finish({}), timeoutMs);
    stream.on('data', onData);
    stream.once('end', onEnd);
    stream.once('error', onError);
  });
}

async function main() {
  const [source, hook] = process.argv.slice(2);
  try {
    const input = await readInput();
    const event = normalizeHook(source, hook, input);
    if (event) await sendEvent(event);
  } catch {
    // Pet availability must never decide whether an agent may execute a tool.
  }
  const response = source === 'cursor' && hook === 'beforeSubmitPrompt' ? { continue: true } : {};
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

if (require.main === module) main().catch(() => process.stdout.write('{}\n'));
module.exports = { normalizeHook, readInput };
