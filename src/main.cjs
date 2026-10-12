'use strict';

const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, screen, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { StateStore } = require('./state.cjs');
const { createEventServer } = require('./server.cjs');

app.setName('咪咪桌宠');
if (!app.requestSingleInstanceLock()) app.quit();
else {
  let pet; let tray; let server; let tick; let pointerTick; let runTick; let saveTimer; let config; let dragOrigin; let lastState = ''; let lastPointer = ''; let clickThrough = false;
  const stateStore = new StateStore();
  const dataDir = path.join(os.homedir(), '.mimi-pet');
  const configPath = path.join(dataDir, 'settings.json');
  const tokenPath = path.join(dataDir, 'token');
  const assetPath = path.join(__dirname, '..', 'assets', 'pet');
  function save() { clearTimeout(saveTimer); if (process.argv.includes('--smoke-test')) return; fs.writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 }); updateTray(); }
  function notify(message) { if (!pet || pet.isDestroyed()) return; if (pet.webContents.isLoading()) pet.webContents.once('did-finish-load', () => pet.webContents.send('pet:notice', message)); else pet.webContents.send('pet:notice', message); }
  function broadcast(state) { const signature = JSON.stringify(state); if (signature !== lastState && pet && !pet.isDestroyed()) { lastState = signature; pet.webContents.send('pet:state', state); } }
  function reveal() { if (pet) { pet.show(); pet.setAlwaysOnTop(true, 'floating'); } }
  function movePet(x, y) { if (pet && !pet.isDestroyed()) pet.setBounds({ x: Math.round(x), y: Math.round(y), width: 390, height: 490 }); }
  function action(name) { reveal(); pet.webContents.send('pet:action', name); }
  function menu() {
    return Menu.buildFromTemplate([
      { label: '咪咪 · 小声陪着你', enabled: false },
      { type: 'separator' },
      { label: '轻轻摸摸', click: () => action('pet') },
      { label: '叫一声试试', click: () => action('meow') },
      { label: '撒腿就跑', click: () => action('run') },
      { label: '假装没看见她', click: () => action('hide') },
      { type: 'separator' },
      { label: '猫猫大小', submenu: [0.8, 1, 1.25, 1.5].map(scale => ({ label: `${Math.round(scale * 100)}%${scale === 1 ? ' · 原始比例' : ''}`, type: 'radio', checked: config.scale === scale, click: () => { config.scale = scale; save(); pet.webContents.send('pet:settings', config); } })) },
      { label: '自己找点事做', type: 'checkbox', checked: config.ambientEnabled, click: item => { config.ambientEnabled = item.checked; save(); pet.webContents.send('pet:settings', config); } },
      { label: '日常动作频率', submenu: [['calm', '慢悠悠'], ['normal', '刚刚好'], ['lively', '活泼一点']].map(([frequency, label]) => ({ label, type: 'radio', checked: config.ambientFrequency === frequency, click: () => { config.ambientFrequency = frequency; save(); pet.webContents.send('pet:settings', config); } })) },
      { label: '安静模式（减少主动台词）', type: 'checkbox', checked: config.quiet, click: item => { config.quiet = item.checked; save(); pet.webContents.send('pet:settings', config); } },
      { label: '减少动作', type: 'checkbox', checked: config.reducedMotion, click: item => { config.reducedMotion = item.checked; if (config.reducedMotion) clearInterval(runTick); save(); pet.webContents.send('pet:settings', config); } },
      { label: '鼠标穿透（从托盘恢复）', type: 'checkbox', checked: clickThrough, click: item => { clickThrough = item.checked; pet.setIgnoreMouseEvents(clickThrough, { forward: true }); } },
      { type: 'separator' },
      { label: '带她回到屏幕右下角', click: () => { const area = screen.getPrimaryDisplay().workArea; movePet(area.x + area.width - 390, area.y + area.height - 490); reveal(); } },
      { label: '查看接入说明', click: () => shell.openPath(path.join(app.isPackaged ? path.dirname(process.execPath) : app.getAppPath(), 'docs', 'integrations.md')) },
      { label: pet && pet.isVisible() ? '藏起来' : '出来透透气', click: () => pet.isVisible() ? pet.hide() : reveal() },
      { type: 'separator' },
      { label: '退出咪咪', click: () => app.quit() }
    ]);
  }
  function updateTray() { if (tray) tray.setContextMenu(menu()); }
  function createWindow() {
    const area = screen.getPrimaryDisplay().workArea;
    const width = 390, height = 490;
    let position = config.position;
    if (!position || !screen.getAllDisplays().some(display => position.x + width > display.workArea.x && position.x < display.workArea.x + display.workArea.width && position.y + height > display.workArea.y && position.y < display.workArea.y + display.workArea.height)) position = { x: area.x + area.width - width, y: area.y + area.height - height };
    // Keep automated playback checks away from the user's mouse and workspace.
    if (process.argv.includes('--smoke-test')) position = { x: -10000, y: -10000 };
    pet = new BrowserWindow({ width, height, x: position.x, y: position.y, frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false, resizable: false, minimizable: false, maximizable: false, skipTaskbar: true, alwaysOnTop: true, show: false, title: '咪咪桌宠', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
    pet.setAlwaysOnTop(true, 'floating');
    pet.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    pet.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    pet.webContents.on('will-navigate', event => event.preventDefault());
    pet.loadFile(path.join(__dirname, 'index.html'));
    pet.once('ready-to-show', () => {
      if (!process.argv.includes('--smoke-test')) reveal();
      else { pet.showInactive(); setTimeout(async () => {
        try {
          const result = await pet.webContents.executeJavaScript("({title:document.title,missing:!document.getElementById('missing').hidden,canvas:[document.getElementById('sprite').width,document.getElementById('sprite').height],speech:document.getElementById('words').textContent})");
          const screenshot = await pet.webContents.capturePage();
          fs.writeFileSync(path.join(dataDir, 'smoke.png'), screenshot.toPNG());
          fs.writeFileSync(path.join(dataDir, 'smoke.json'), JSON.stringify(result, null, 2));
          if (result.missing) process.exitCode = 1;
          else if (process.argv.includes('--smoke-sequence')) {
            const phases = [];
            for (const phase of ['run', 'working', 'waiting', 'error', 'success', 'idle', 'loaf']) {
              if (phase === 'run') pet.webContents.send('pet:action', 'run');
              else if (phase === 'loaf') pet.webContents.send('pet:action', 'hide');
              else broadcast(stateStore.accept({ source: 'preview', event: phase, sessionId: 'smoke' }));
              await new Promise(resolve => setTimeout(resolve, phase === 'success' ? 950 : 1700));
              const view = await pet.webContents.executeJavaScript("(()=>{const c=document.getElementById('sprite'),b=c.getBoundingClientRect();return {animation:c.dataset.animation,frame:c.dataset.frame,frames:c.dataset.frameCount,sheet:c.dataset.sheet,viewport:[innerWidth,innerHeight],rect:{x:b.x,y:b.y,width:b.width,height:b.height},speech:document.getElementById('words').textContent}})()");
              view.window = pet.getBounds();
              view.content = pet.getContentBounds();
              phases.push({ phase, ...view });
              const shot = await pet.webContents.capturePage();
              fs.writeFileSync(path.join(dataDir, `smoke-${phase}.png`), shot.toPNG());
              if (phase === 'run') await new Promise(resolve => setTimeout(resolve, 5000));
            }
            fs.writeFileSync(path.join(dataDir, 'smoke-sequence.json'), JSON.stringify(phases, null, 2));
          }
          if (!result.missing && process.argv.includes('--smoke-ambient')) {
            await require('./smoke.cjs').observeAmbient({ pet, config, stateStore, broadcast, dataDir, version: app.getVersion() });
          }
        } catch (error) { process.exitCode = 1; console.error('Smoke check:', error.message); }
        finally { app.quit(); }
      }, 2500); }
    });
    pet.on('moved', () => { const [x, y] = pet.getPosition(); config.position = { x, y }; clearTimeout(saveTimer); saveTimer = setTimeout(save, 450); });
    pet.on('show', () => { pet.webContents.send('pet:visibility', true); updateTray(); });
    pet.on('hide', () => { clearInterval(runTick); pet.webContents.send('pet:visibility', false); updateTray(); });
    pet.on('closed', () => { pet = null; });
    let icon = nativeImage.createEmpty();
    try { const manifest = JSON.parse(fs.readFileSync(path.join(assetPath, 'manifest.json'), 'utf8')); icon = nativeImage.createFromPath(path.join(assetPath, manifest.sheet || 'spritesheet.png')).crop({ x: 0, y: 0, width: manifest.cell.width, height: manifest.cell.height }).resize({ width: 32, height: 32 }); } catch { icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='); }
    tray = new Tray(icon); tray.setToolTip('咪咪 · 鼠标右键轻轻叫她'); tray.on('click', reveal); tray.on('right-click', () => tray.popUpContextMenu(menu())); updateTray();
    if (process.argv.includes('--smoke-test')) return;
    pointerTick = setInterval(() => {
      if (!pet || pet.isDestroyed() || !pet.isVisible()) return;
      const cursor = screen.getCursorScreenPoint(), bounds = pet.getBounds();
      const x = cursor.x - bounds.x, y = cursor.y - bounds.y;
      const pointer = `${Math.round(x / 8)},${Math.round(y / 8)}`;
      if (pointer !== lastPointer) { lastPointer = pointer; pet.webContents.send('pet:pointer', { x, y }); }
    }, 80);
  }
  app.whenReady().then(async () => {
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch { config = {}; }
    config = { scale: 1.25, quiet: false, reducedMotion: false, ambientEnabled: true, ambientFrequency: 'normal', ...config };
    if (![0.8, 1, 1.25, 1.5].includes(config.scale)) config.scale = 1;
    config.ambientEnabled = config.ambientEnabled !== false;
    if (!['calm', 'normal', 'lively'].includes(config.ambientFrequency)) config.ambientFrequency = 'normal';
    if (!fs.existsSync(tokenPath)) fs.writeFileSync(tokenPath, crypto.randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' });
    const token = fs.readFileSync(tokenPath, 'utf8').trim();
    ipcMain.handle('pet:initial', () => ({ settings: config, state: stateStore.current(), visible: !!pet && pet.isVisible() }));
    ipcMain.on('pet:menu', () => menu().popup({ window: pet }));
    ipcMain.on('pet:drag-start', (_event, point) => { if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return; clearInterval(runTick); const [x, y] = pet.getPosition(); dragOrigin = { x, y, mouseX: point.x, mouseY: point.y }; });
    ipcMain.on('pet:drag', (_event, point) => { if (!dragOrigin || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return; const x = Math.round(dragOrigin.x + point.x - dragOrigin.mouseX), y = Math.round(dragOrigin.y + point.y - dragOrigin.mouseY); movePet(x, y); });
    ipcMain.on('pet:drag-end', () => { dragOrigin = null; });
    ipcMain.on('pet:hover', (_event, interactive) => { if (!clickThrough && pet) pet.setIgnoreMouseEvents(interactive !== true, { forward: true }); });
    ipcMain.on('pet:run', (_event, request) => {
      const direction = request?.direction;
      if (!pet || !pet.isVisible() || dragOrigin || config.reducedMotion || !['left', 'right'].includes(direction)) return;
      const durationMs = Number.isFinite(request.durationMs) ? Math.max(400, Math.min(5000, request.durationMs)) : 1650;
      clearInterval(runTick);
      const bounds = pet.getBounds(), area = screen.getDisplayMatching(bounds).workArea;
      const travel = direction === 'left' ? -260 : 260;
      const target = Math.max(area.x, Math.min(area.x + area.width - bounds.width, bounds.x + travel));
      const start = Date.now();
      runTick = setInterval(() => { if (!pet || pet.isDestroyed()) { clearInterval(runTick); return; } const progress = Math.min(1, (Date.now() - start) / durationMs); movePet(bounds.x + (target - bounds.x) * progress, bounds.y); if (progress === 1) clearInterval(runTick); }, 16);
    });
    createWindow();
    try { server = await createEventServer({ token, store: stateStore, onState: broadcast }); }
    catch (error) { notify(error.code === 'EADDRINUSE' ? '接入端口被占用，猫猫仍会陪着你。请关闭另一份接入服务后重启。' : '智能体接入暂时未启动。'); console.error('Local event server:', error.message); }
    tick = setInterval(() => broadcast(stateStore.current()), 1000);
  });
  app.on('second-instance', reveal);
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { clearInterval(tick); clearInterval(pointerTick); clearInterval(runTick); if (saveTimer && config) save(); if (server) server.close(); if (tray) { tray.destroy(); tray = null; } });
}
