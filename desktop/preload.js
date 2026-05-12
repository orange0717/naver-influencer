'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ninfl', {
  isDesktop: true,
  platform: process.platform,

  notify(payload) {
    const safe = {
      title: typeof payload?.title === 'string' ? payload.title.slice(0, 200) : 'N인플',
      body: typeof payload?.body === 'string' ? payload.body.slice(0, 500) : '',
      silent: !!payload?.silent,
      urgent: !!payload?.urgent,
    };
    return ipcRenderer.invoke('ninfl:notify', safe);
  },

  openExternal(url) {
    if (typeof url !== 'string') return Promise.resolve(false);
    return ipcRenderer.invoke('ninfl:open-external', url);
  },

  getVersion() {
    return ipcRenderer.invoke('ninfl:get-version');
  },

  setBadge(count) {
    return ipcRenderer.invoke('ninfl:set-badge', Number(count) || 0);
  },
});
