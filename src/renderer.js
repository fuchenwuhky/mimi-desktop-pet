'use strict';

(() => {
  const cat = document.getElementById('cat');
  const canvas = document.getElementById('sprite');
  const context = canvas.getContext('2d', { alpha: true });
  const speech = document.getElementById('speech');
  const words = document.getElementById('words');
  const source = document.getElementById('source');
  const preview = !window.mimi;
  const reducedPreference = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let settings = { scale: 1.25, quiet: false, reducedMotion: reducedPreference, ambientEnabled: true, ambientFrequency: 'normal' };
  let manifest, sheet, player, speechTimer, lastFrameKey = '', lastPointerAt = 0, lookFrame = null, raf = null, pointerSample = null, startledAt = -60000, pendingRun = null, queuedInteraction = null;
  const sheets = new Map();
  let state = { event: 'idle', source: '', sequence: 0, activeCount: 0 };
  let pointerDown = null, isDragging = false, clickTimer;
  let windowVisible = preview;
  let previewOffset = { x: 0, y: 0 };
  const ambient = new window.MimiBehavior.AmbientScheduler({ now: performance.now() });

  const lines = {
    idle: ['我只是路过这里……第三次。', '你忙。我在这儿，偷偷的。', '这一堆毛里，确实有一只猫。', '这里……可以趴一小会儿吗。', '我没有偷看。\n只是眼睛刚好在这里。', '毛很多，胆子只有一点点。', '我占的位置很小。\n毛占的不算。'],
    working: ['我盯着呢。没有偷看。', '爪子很轻，进度很认真。', '你认真忙。\n我认真假装路过。', '我帮你盯着……\n隔这么远也算盯着。', '正在偷偷努力。\n别突然叫我。'],
    waiting: ['咪……这一步，要你点头。', '我伸爪了。你看见了吗？', '那个……\n好像轮到你啦。', '不催你。\n我只是站得有一点认真。'],
    success: ['咪。做完啦。\n（勇气已用完）', '好了。我先假装不是我。', '做完啦。\n我高兴得尾巴先知道了。', '可以夸一下下。\n太大声会跑。'],
    error: ['被吓了一下。我们慢慢来。', '没关系，我陪你再试一次。', '卡住了……\n我陪你再看一眼。', '有点不对。\n我从桌角探头看看。'],
    pet: ['嗯……可以。\n再轻一点点。', '我才没有主动靠过来。', '手先放这里。\n我自己蹭。'],
    meow: ['咪。今天的大声发言结束。', '咪。\n（今天的勇气用完了）', '……咪。\n听见就好，不用转头。'],
    run: ['被发现了！', '先跑两步，再想理由。', '我、我先走一步！', '没有偷东西！\n只是跑得快！'],
    hide: ['不是变胖，是毛摊开了。', '勇气充电中……', '现在是一堆毛。\n猫不在这里。', '看不见我。\n看不见我。'],
    peek: ['只是偷偷确认一下，\n你还在这里。', '我没有探头。\n是毛先过去的。'],
    knead: ['这里踩两下……\n没有留下脚印吧。', '爪子借这里放一下。\n就一下。'],
    wave: ['那个……咪。\n没有别的事。', '伸爪只是伸懒腰。\n也可以当作打招呼。']
  };
  const stateAnimations = { idle: 'idle', working: 'running', waiting: 'waiting', success: 'jumping', error: 'failed' };
  const choose = values => values[Math.floor(Math.random() * values.length)];
  const isSurfaceVisible = () => window.MimiBehavior.surfaceVisible({ preview, windowVisible, documentHidden: document.hidden });
  function refreshVisibility() {
    ambient.reset();
    if (!isSurfaceVisible()) {
      player?.finishAmbient(performance.now());
      pendingRun = null;
      pointerSample = null;
    }
  }
  function say(text, label = '', duration = 5500) {
    clearTimeout(speechTimer);
    words.textContent = text.length > 72 ? `${text.slice(0, 71)}…` : text;
    source.textContent = label;
    speech.classList.add('visible');
    speechTimer = setTimeout(() => speech.classList.remove('visible'), duration);
  }
  function animate(name, duration = 0) {
    if (!manifest || !player) return;
    const next = manifest.animations[name] ? name : 'idle';
    if (duration) player.play([{ name: next, holdMs: duration }], performance.now());
    else player.setState(next, performance.now());
    lookFrame = null;
  }
  function setState(next) {
    const previous = state;
    state = next;
    if (!manifest || !player) return;
    // Heartbeats refresh state, but do not repeatedly restart a clip or repeat a bubble.
    const changed = previous.event !== next.event || previous.source !== next.source || (next.message && next.message !== previous.message);
    if (changed) {
      ambient.reset();
      if (next.event === 'success') {
        player.setState('idle', performance.now());
        if (player.inSequence) queuedInteraction = 'celebrate';
        else player.play([{ name: 'jumping' }], performance.now());
      } else { if (queuedInteraction === 'celebrate') queuedInteraction = null; animate(stateAnimations[next.event] || 'idle'); }
      if (next.event !== 'idle' || !settings.quiet) {
        const label = next.source ? `${next.source}${next.activeCount > 1 ? ` · ${next.activeCount} 个会话` : ''}` : '';
        say(next.message || choose(lines[next.event] || lines.idle), label);
      }
    }
  }
  function applySettings(next) {
    settings = { ...settings, ...next };
    document.documentElement.style.setProperty('--scale', settings.scale);
    document.documentElement.classList.toggle('reduced-motion', settings.reducedMotion);
    ambient.reset();
    if (!settings.ambientEnabled || settings.reducedMotion) player?.finishAmbient(performance.now());
    lastFrameKey = '';
  }
  function noteInteraction() {
    ambient.reset();
    player?.finishAmbient(performance.now());
  }
  function interact(action) {
    if (!manifest || !player) return;
    noteInteraction();
    if (player.inSequence) { queuedInteraction = action; return; }
    if (lines[action]) say(choose(lines[action]));
    switch (action) {
      case 'pet': player.play([...(player.current === 'loaf' ? [{ name: 'rise' }] : []), { name: 'waving' }], performance.now()); break;
      case 'meow': player.play([...(player.current === 'loaf' ? [{ name: 'rise' }] : []), { name: 'waving' }], performance.now()); break;
      case 'celebrate': player.play([{ name: 'jumping' }], performance.now()); break;
      case 'run': {
        runSequence('left', false);
        break;
      }
      case 'hide': player.play([{ name: 'settle' }, { name: 'loaf', holdMs: 5000 }, { name: 'rise' }], performance.now()); break;
      default: animate(action, 8000);
    }
  }
  function runSequence(direction, startled, autonomous = false) {
    const steps = [];
    if (player.current === 'loaf') steps.push({ name: 'rise' });
    if (startled) steps.push({ name: 'jumping' });
    steps.push({ name: direction === 'left' ? 'standToRunLeft' : 'standToRun' }, { name: direction === 'left' ? 'runLeft' : 'runRight', holdMs: 1650 }, { name: direction === 'left' ? 'runToStandLeft' : 'runToStand' }, { name: 'idle' });
    pendingRun = direction;
    player.play(steps, performance.now(), startled, { interruptible: autonomous });
  }
  function ambientAction(action, now) {
    lookFrame = null;
    canvas.dataset.ambientAction = action.name;
    canvas.dataset.ambientSerial = String(Number(canvas.dataset.ambientSerial || 0) + 1);
    const sequences = {
      peek: [{ name: 'review', cycles: state.event === 'working' ? 1 : 2 }],
      knead: [{ name: 'running', cycles: 2 }],
      wave: [{ name: 'waving' }],
      loaf: [{ name: 'settle' }, { name: 'loaf', holdMs: action.holdMs }, { name: 'rise' }]
    };
    if (action.name === 'run') runSequence(action.direction, false, true);
    else player.play(sequences[action.name], now, false, { interruptible: true });
    if (action.speak) say(choose(lines[action.name === 'loaf' ? 'hide' : action.name] || lines.idle));
  }
  function trackPointer(point) {
    const now = performance.now(), previousPointer = pointerSample;
    pointerSample = { ...point, time: now };
    if (!manifest || !player || !isSurfaceVisible() || isDragging || state.event !== 'idle' || player.inSequence || settings.reducedMotion) return;
    const bounds = cat.getBoundingClientRect();
    const dx = point.x - (bounds.left + bounds.width / 2), dy = point.y - (bounds.top + bounds.height * .42);
    const distance = Math.hypot(dx, dy);
    if (settings.ambientEnabled && previousPointer && now - previousPointer.time > 0 && now - previousPointer.time < 250 && distance < 135 && now - startledAt > 45000) {
      const speed = Math.hypot(point.x - previousPointer.x, point.y - previousPointer.y) * 1000 / (now - previousPointer.time);
      const previousDistance = Math.hypot(previousPointer.x - (bounds.left + bounds.width / 2), previousPointer.y - (bounds.top + bounds.height * .42));
      if (speed > 950 && previousDistance > 160) { startledAt = now; noteInteraction(); if (!settings.quiet) say('呀。\n我先躲一下下。'); runSequence(dx > 0 ? 'left' : 'right', true); return; }
    }
    if (distance > 35 && distance < 1100 && manifest.look) {
      // V2 look directions start UP and advance clockwise in sixteen steps.
      lookFrame = window.MimiAnimation.lookDirection(dx, dy);
      lastPointerAt = performance.now();
    }
  }
  function draw(now) {
    if (!manifest || !sheet) return;
    const clip = player.tick(now);
    if (!clip.inSequence && queuedInteraction) { const action = queuedInteraction; queuedInteraction = null; interact(action); }
    const visible = isSurfaceVisible();
    const action = ambient.tick(now, { ...settings, event: state.event, ready: visible && !queuedInteraction, inSequence: player.inSequence, dragging: isDragging || !!pointerDown });
    if (action) ambientAction(action, now);
    const movable = window.MimiBehavior.canMovePet({ visible, dragging: isDragging, pointerDown: !!pointerDown, reducedMotion: settings.reducedMotion });
    if (!player.inSequence || !movable) pendingRun = null;
    if (pendingRun && ['runLeft', 'runRight'].includes(clip.name)) { window.mimi?.run(pendingRun, Math.round(player.actionUntil - now)); pendingRun = null; }
    const useLook = lookFrame !== null && now - lastPointerAt < 1600 && state.event === 'idle' && clip.name === 'idle' && !clip.inSequence;
    const animation = useLook ? { row: manifest.look.startRow, frames: 16 } : manifest.animations[clip.name];
    const index = useLook ? lookFrame : window.MimiAnimation.frameAt(animation, now - clip.startedAt, settings.reducedMotion);
    const key = `${useLook ? 'look' : clip.name}:${index}`;
    if (key !== lastFrameKey) {
      const progress = animation.frames > 1 ? index / (animation.frames - 1) : 0;
      document.documentElement.style.setProperty('--speech-height', `${window.MimiBehavior.speechHeight(clip.name, progress)}px`);
      canvas.dataset.animation = useLook ? 'look' : clip.name;
      canvas.dataset.frame = String(index);
      canvas.dataset.frameCount = String(animation.frames);
      canvas.dataset.sheet = animation.sheet || manifest.sheet;
      const rect = window.MimiAnimation.sourceRect(manifest, animation, index);
      context.clearRect(0, 0, canvas.width, canvas.height);
      // Deliberately no trim, resize-to-content, per-frame scale, or per-frame centering.
      context.save();
      if (animation.flipX) { context.translate(manifest.cell.width, 0); context.scale(-1, 1); }
      context.drawImage(animation.sheet ? sheets.get(animation.sheet) : sheet, rect.x, rect.y, rect.width, rect.height, 0, 0, manifest.cell.width, manifest.cell.height);
      context.restore();
      lastFrameKey = key;
    }
    raf = requestAnimationFrame(draw);
  }
  function validManifest(value) {
    if (!value || !value.cell || !Number.isInteger(value.cell.width) || !Number.isInteger(value.cell.height) || value.cell.width < 1 || value.cell.height < 1 || !Number.isInteger(value.columns) || value.columns < 1 || !value.animations?.idle) throw new Error('动画配置不完整');
    if (typeof value.sheet !== 'string' || !/^[a-zA-Z0-9._-]+\.png$/.test(value.sheet)) throw new Error('图片路径无效');
    for (const animation of Object.values(value.animations)) if (!Number.isInteger(animation.row) || animation.row < 0 || !Number.isInteger(animation.frames) || animation.frames < 1 || animation.frames > 64 || !(animation.fps > 0 && animation.fps <= 60)) throw new Error('动画画格无效');
    return value;
  }
  async function init() {
    if (preview) {
      applySettings(settings);
      document.body.classList.add('preview');
      document.getElementById('preview-controls').hidden = false;
      const buttons = [['轻轻摸摸', 'pet'], ['咪一声', 'meow'], ['撒腿就跑', 'run'], ['一堆猫', 'hide'], ['偷偷工作', 'working'], ['偷偷检查', 'review'], ['等你一下', 'waiting'], ['做好啦', 'success'], ['缩一小团', 'error'], ['安静坐着', 'idle'], ['连续状态切换', 'sequence']];
      for (const [label, action] of buttons) {
        const button = document.createElement('button'); button.textContent = label;
        button.addEventListener('click', () => {
          if (action === 'sequence') {
            ['idle', 'working', 'waiting', 'success', 'working', 'error', 'idle'].forEach((event, index) => setTimeout(() => setState({ event, source: event === 'idle' ? '' : '衔接练习', sequence: index, activeCount: event === 'idle' ? 0 : 1 }), index * 3000));
          } else if (stateAnimations[action]) setState({ event: action, source: action === 'idle' ? '' : '动作练习', sequence: Date.now(), activeCount: action === 'idle' ? 0 : 1 });
          else interact(action);
        });
        document.getElementById('action-controls').appendChild(button);
      }
    } else {
      window.mimi.onState(setState);
      window.mimi.onAction(interact);
      window.mimi.onSettings(applySettings);
      window.mimi.onNotice(message => say(message, '接入提示', 12000));
      window.mimi.onPointer(trackPointer);
      window.mimi.onVisibility(visible => { windowVisible = visible === true; refreshVisibility(); });
      const initial = await window.mimi.initial(); applySettings(initial.settings); state = initial.state; windowVisible = initial.visible === true; refreshVisibility();
    }
    try {
      const manifestUrl = new URL('../assets/pet/manifest.json', window.location.href);
      const response = await fetch(manifestUrl);
      if (!response.ok) throw new Error('没有找到动画配置');
      manifest = validManifest(await response.json());
      if (manifest.animations.standToRun && !manifest.animations.standToRunLeft) manifest.animations.standToRunLeft = { ...manifest.animations.standToRun, flipX: true };
      if (manifest.animations.runToStand && !manifest.animations.runToStandLeft) manifest.animations.runToStandLeft = { ...manifest.animations.runToStand, flipX: true };
      sheet = new Image();
      await new Promise((resolve, reject) => { sheet.onload = resolve; sheet.onerror = () => reject(new Error('没有找到动画图')); sheet.src = new URL(manifest.sheet, manifestUrl).href; });
      if (sheet.naturalWidth !== manifest.cell.width * manifest.columns || sheet.naturalHeight % manifest.cell.height !== 0) throw new Error('动画尺寸与配置不符');
      for (const filename of new Set(Object.values(manifest.animations).map(animation => animation.sheet).filter(Boolean))) {
        if (!/^[a-zA-Z0-9._-]+\.png$/.test(filename)) throw new Error('过渡图片路径无效');
        const image = new Image();
        await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('过渡动画加载失败')); image.src = new URL(filename, manifestUrl).href; });
        sheets.set(filename, image);
      }
      for (const [name, animation] of Object.entries(manifest.animations)) {
        const image = animation.sheet ? sheets.get(animation.sheet) : sheet;
        if (!window.MimiAnimation.fitsSheet(manifest, animation, image.naturalWidth, image.naturalHeight)) throw new Error(`动画 ${name} 的画格超出了素材范围`);
      }
      const bridges = {};
      for (const pose of ['idle', 'waving', 'jumping', 'failed', 'waiting', 'review', 'running']) { bridges[`${pose}:loaf`] = 'settle'; bridges[`loaf:${pose}`] = 'rise'; bridges[`settle:${pose}`] = 'rise'; }
      bridges['rise:loaf'] = 'settle';
      player = new window.MimiAnimation.ClipPlayer(manifest.animations, performance.now(), { ...bridges, ...manifest.bridges });
      canvas.width = manifest.cell.width; canvas.height = manifest.cell.height;
      cat.style.width = `${manifest.cell.width}px`; cat.style.height = `${manifest.cell.height}px`;
      animate(stateAnimations[state.event] || 'idle');
      if (!settings.quiet) say('我就在这里。\n轻一点叫我哦。', '', 6500);
      raf = requestAnimationFrame(draw);
    } catch (error) {
      document.getElementById('missing').hidden = false;
      document.querySelector('#missing p').textContent = `${error.message}。请检查 assets/pet 中的素材后重新打开。`;
      cat.hidden = true;
      console.error(error);
    }
  }
  cat.addEventListener('contextmenu', event => { event.preventDefault(); noteInteraction(); window.mimi?.menu(); });
  cat.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    noteInteraction();
    pointerDown = { x: event.screenX, y: event.screenY, offset: { ...previewOffset } }; isDragging = false;
    cat.setPointerCapture(event.pointerId);
    window.mimi?.dragStart({ x: event.screenX, y: event.screenY });
  });
  cat.addEventListener('pointermove', event => {
    if (preview) trackPointer({ x: event.clientX, y: event.clientY });
    if (!pointerDown) return;
    const dx = event.screenX - pointerDown.x, dy = event.screenY - pointerDown.y;
    if (Math.hypot(dx, dy) > 5) isDragging = true;
    if (isDragging) {
      window.mimi?.drag({ x: event.screenX, y: event.screenY });
      if (preview) { previewOffset = { x: pointerDown.offset.x + dx, y: pointerDown.offset.y + dy }; cat.style.marginLeft = `${previewOffset.x}px`; cat.style.marginBottom = `${-previewOffset.y}px`; }
    }
  });
  cat.addEventListener('pointerup', event => {
    if (event.button !== 0 || !pointerDown) return;
    noteInteraction();
    window.mimi?.dragEnd();
    if (!isDragging) { clearTimeout(clickTimer); clickTimer = setTimeout(() => interact('pet'), 220); }
    pointerDown = null; isDragging = false;
    if (cat.hasPointerCapture(event.pointerId)) cat.releasePointerCapture(event.pointerId);
  });
  cat.addEventListener('pointercancel', () => { noteInteraction(); window.mimi?.dragEnd(); pointerDown = null; isDragging = false; });
  cat.addEventListener('dblclick', () => { clearTimeout(clickTimer); interact('meow'); });
  cat.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); interact('pet'); } });
  document.addEventListener('mousemove', event => {
    const bounds = cat.getBoundingClientRect();
    const interactive = !cat.hidden && event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
    window.mimi?.hover(interactive || isDragging);
    if (preview) trackPointer({ x: event.clientX, y: event.clientY });
  });
  document.addEventListener('visibilitychange', refreshVisibility);
  window.addEventListener('unload', () => { cancelAnimationFrame(raf); clearTimeout(speechTimer); });
  init();
})();
