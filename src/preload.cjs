'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const subscribe = (channel, callback) => { const listener = (_event, value) => callback(value); ipcRenderer.on(channel, listener); return () => ipcRenderer.removeListener(channel, listener); };
contextBridge.exposeInMainWorld('mimi', {
  initial: () => ipcRenderer.invoke('pet:initial'),
  menu: () => ipcRenderer.send('pet:menu'),
  dragStart: point => ipcRenderer.send('pet:drag-start', point),
  drag: point => ipcRenderer.send('pet:drag', point),
  dragEnd: () => ipcRenderer.send('pet:drag-end'),
  hover: interactive => ipcRenderer.send('pet:hover', interactive),
  run: (direction, durationMs) => ipcRenderer.send('pet:run', { direction, durationMs }),
  onState: callback => subscribe('pet:state', callback),
  onAction: callback => subscribe('pet:action', callback),
  onSettings: callback => subscribe('pet:settings', callback),
  onNotice: callback => subscribe('pet:notice', callback),
  onPointer: callback => subscribe('pet:pointer', callback),
  onVisibility: callback => subscribe('pet:visibility', callback)
});
