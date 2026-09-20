"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aura", {
  listTabs: () => ipcRenderer.invoke("aura:tabs"),
  createTab: (url) => ipcRenderer.invoke("aura:create-tab", url),
  createIncognitoTab: () => ipcRenderer.invoke("aura:create-incognito-tab"),
  activateTab: (id) => ipcRenderer.invoke("aura:activate-tab", id),
  closeTab: (id) => ipcRenderer.invoke("aura:close-tab", id),
  navigate: (url) => ipcRenderer.invoke("aura:navigate", url),
  back: () => ipcRenderer.invoke("aura:back"),
  forward: () => ipcRenderer.invoke("aura:forward"),
  reload: () => ipcRenderer.invoke("aura:reload"),
  updateLayout: (bounds) => ipcRenderer.send("aura:layout", bounds),
  listBookmarks: () => ipcRenderer.invoke("aura:bookmarks"),
  toggleBookmark: (url, title) => ipcRenderer.invoke("aura:bookmark-toggle", { url, title }),
  removeBookmark: (id) => ipcRenderer.invoke("aura:bookmark-remove", id),
  ask: (question) => ipcRenderer.invoke("aura:ask", question),
  compare: (question) => ipcRenderer.invoke("aura:compare", question),
  onTabState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("aura:tab-state", listener);
    return () => ipcRenderer.removeListener("aura:tab-state", listener);
  }
});
