"use strict";

require("dotenv").config();

const { app, BrowserWindow, WebContentsView, ipcMain, session } = require("electron");
const fs = require("node:fs");
const https = require("node:https");
const path = require("node:path");

let mainWindow;
let activeTabId = null;
let lastPageBounds = { x: 0, y: 126, width: 1100, height: 700 };
const tabs = new Map();

const MAX_PAGE_CHARS = 12000;
const MAX_COMPARE_CHARS_PER_TAB = 6000;
const START_URL = "about:blank";

function id() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function tabSnapshot(tab) {
  return {
    id: tab.id,
    url: tab.webContents.getURL() || tab.url,
    title: tab.title || "New tab",
    loading: tab.loading,
    canGoBack: tab.webContents.canGoBack(),
    canGoForward: tab.webContents.canGoForward(),
    incognito: tab.incognito
  };
}

function sendTabState(tab) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("aura:tab-state", {
    activeTabId,
    tab: tabSnapshot(tab),
    tabs: [...tabs.values()].map(tabSnapshot)
  });
}

function sendAllTabs() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("aura:tab-state", {
    activeTabId,
    tabs: [...tabs.values()].map(tabSnapshot)
  });
}

function isAllowedUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" || url.protocol === "about:";
  } catch {
    return false;
  }
}

function toNavigableUrl(value) {
  const input = String(value || "").trim();
  if (!input) return START_URL;
  if (/^about:blank$/i.test(input)) return "about:blank";
  if (/^https?:\/\//i.test(input)) return input;
  if (/^[\w.-]+\.[a-z]{2,}(?:[/:?#].*)?$/i.test(input) || /^localhost(?::\d+)?(?:\/.*)?$/i.test(input)) {
    return `https://${input}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(input)}`;
}

function applyViewBounds() {
  const active = tabs.get(activeTabId);
  if (!active || !active.attached || !mainWindow || mainWindow.isDestroyed()) return;
  active.view.setBounds(lastPageBounds);
}

function removeActiveView() {
  const active = tabs.get(activeTabId);
  if (active?.attached && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.contentView.removeChildView(active.view);
    active.attached = false;
  }
}

function attachView(tab) {
  if (!tab || tab.attached || !mainWindow || mainWindow.isDestroyed() || tab.webContents.getURL() === "about:blank") return;
  mainWindow.contentView.addChildView(tab.view);
  tab.attached = true;
  applyViewBounds();
}

function activateTab(tabId) {
  const next = tabs.get(tabId);
  if (!next || tabId === activeTabId) return;
  removeActiveView();
  activeTabId = tabId;
  attachView(next);
  sendAllTabs();
}

function createTab(rawUrl = START_URL, shouldActivate = true, incognito = false) {
  const targetUrl = toNavigableUrl(rawUrl);
  const tabId = id();
  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      partition: incognito ? `temporary:aura-private-${tabId}` : undefined
    }
  });
  const tab = { id: tabId, view, webContents: view.webContents, url: targetUrl, title: incognito ? "Private tab" : "New tab", loading: true, attached: false, incognito };
  tabs.set(tab.id, tab);

  view.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedUrl(url)) createTab(url, true, tab.incognito);
    return { action: "deny" };
  });
  view.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedUrl(url)) event.preventDefault();
  });
  view.webContents.on("did-start-loading", () => {
    tab.loading = true;
    sendTabState(tab);
  });
  view.webContents.on("did-stop-loading", () => {
    tab.loading = false;
    tab.url = view.webContents.getURL() || tab.url;
    sendTabState(tab);
  });
  view.webContents.on("page-title-updated", (event, title) => {
    event.preventDefault();
    tab.title = title || "New tab";
    sendTabState(tab);
  });
  view.webContents.on("did-navigate", (_event, url) => {
    tab.url = url;
    if (url === "about:blank" && tab.id === activeTabId) removeActiveView();
    sendTabState(tab);
  });
  view.webContents.on("did-navigate-in-page", (_event, url) => {
    tab.url = url;
    sendTabState(tab);
  });
  view.webContents.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    tab.loading = false;
    tab.url = url || tab.url;
    tab.title = `Could not load: ${description}`;
    sendTabState(tab);
  });

  if (shouldActivate || activeTabId === null) {
    if (activeTabId) removeActiveView();
    activeTabId = tab.id;
    if (targetUrl !== "about:blank") attachView(tab);
  }
  view.webContents.loadURL(targetUrl).catch(() => undefined);
  sendAllTabs();
  return tab.id;
}

function closeTab(tabId) {
  const tab = tabs.get(tabId);
  if (!tab) return;
  const ids = [...tabs.keys()];
  const closingActive = tabId === activeTabId;
  if (closingActive) mainWindow.contentView.removeChildView(tab.view);
  tabs.delete(tabId);
  tab.webContents.close();

  if (tabs.size === 0) {
    activeTabId = null;
    createTab(START_URL, true);
    return;
  }
  if (closingActive) {
    const nextId = ids[Math.max(0, ids.indexOf(tabId) - 1)] || [...tabs.keys()][0];
    activeTabId = null;
    activateTab(nextId);
  } else {
    sendAllTabs();
  }
}

function bookmarksPath() {
  return path.join(app.getPath("userData"), "aura-bookmarks.json");
}

function loadBookmarks() {
  try {
    const value = JSON.parse(fs.readFileSync(bookmarksPath(), "utf8"));
    return Array.isArray(value) ? value.filter((entry) => entry && isAllowedUrl(entry.url)) : [];
  } catch {
    return [];
  }
}

function saveBookmarks(bookmarks) {
  fs.writeFileSync(bookmarksPath(), JSON.stringify(bookmarks, null, 2), "utf8");
}

function callAnthropic({ system, message }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.AURA_MODEL;
  if (!apiKey || !model || model.startsWith("replace-with")) {
    return Promise.reject(new Error("AI is not configured. Add ANTHROPIC_API_KEY and AURA_MODEL to .env, then restart AU-RA."));
  }
  const body = JSON.stringify({ model, max_tokens: 900, system, messages: [{ role: "user", content: message }] });
  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      timeout: 30000
    }, (response) => {
      let raw = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { raw += chunk; });
      response.on("end", () => {
        try {
          const parsed = JSON.parse(raw);
          if (response.statusCode < 200 || response.statusCode >= 300 || parsed.error) {
            reject(new Error(parsed.error?.message || `AI request failed (${response.statusCode}).`));
            return;
          }
          const answer = (parsed.content || []).filter((block) => block.type === "text").map((block) => block.text).join("\n").trim();
          resolve(answer || "I could not produce an answer from that page.");
        } catch {
          reject(new Error("AU-RA could not read the AI response."));
        }
      });
    });
    request.on("timeout", () => request.destroy(new Error("AI request timed out.")));
    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

async function pageText(tab) {
  if (!tab) return "";
  try {
    const text = await tab.webContents.executeJavaScript("document.body ? document.body.innerText : ''", true);
    return String(text || "");
  } catch {
    return "";
  }
}

function registerIpc() {
  ipcMain.handle("aura:tabs", () => ({ activeTabId, tabs: [...tabs.values()].map(tabSnapshot) }));
  ipcMain.handle("aura:create-tab", (_event, url) => createTab(url));
  ipcMain.handle("aura:create-incognito-tab", () => createTab(START_URL, true, true));
  ipcMain.handle("aura:activate-tab", (_event, tabId) => activateTab(tabId));
  ipcMain.handle("aura:close-tab", (_event, tabId) => closeTab(tabId));
  ipcMain.handle("aura:navigate", (_event, url) => {
    const tab = tabs.get(activeTabId);
    if (!tab) return;
    const target = toNavigableUrl(url);
    if (target !== "about:blank") attachView(tab);
    tab.webContents.loadURL(target).catch(() => undefined);
  });
  ipcMain.handle("aura:back", () => tabs.get(activeTabId)?.webContents.goBack());
  ipcMain.handle("aura:forward", () => tabs.get(activeTabId)?.webContents.goForward());
  ipcMain.handle("aura:reload", () => tabs.get(activeTabId)?.webContents.reload());
  ipcMain.on("aura:layout", (_event, bounds) => {
    if (!bounds || !Number.isFinite(bounds.x) || !Number.isFinite(bounds.y)) return;
    lastPageBounds = { x: Math.max(0, Math.round(bounds.x)), y: Math.max(0, Math.round(bounds.y)), width: Math.max(1, Math.round(bounds.width)), height: Math.max(1, Math.round(bounds.height)) };
    applyViewBounds();
  });

  ipcMain.handle("aura:bookmarks", () => loadBookmarks());
  ipcMain.handle("aura:bookmark-toggle", (_event, { url, title }) => {
    if (tabs.get(activeTabId)?.incognito) return { bookmarks: loadBookmarks(), error: "Bookmarks are unavailable in a private tab." };
    if (!isAllowedUrl(url) || url === "about:blank") return loadBookmarks();
    const existing = loadBookmarks();
    const found = existing.findIndex((entry) => entry.url === url);
    if (found >= 0) existing.splice(found, 1);
    else existing.unshift({ id: id(), url, title: String(title || url).slice(0, 180), createdAt: new Date().toISOString() });
    saveBookmarks(existing);
    return { bookmarks: existing };
  });
  ipcMain.handle("aura:bookmark-remove", (_event, bookmarkId) => {
    const next = loadBookmarks().filter((entry) => entry.id !== bookmarkId);
    saveBookmarks(next);
    return next;
  });

  ipcMain.handle("aura:ask", async (_event, question) => {
    const tab = tabs.get(activeTabId);
    const text = (await pageText(tab)).slice(0, MAX_PAGE_CHARS);
    if (!text.trim()) return { ok: false, error: "This page has no readable text yet." };
    try {
      const answer = await callAnthropic({
        system: "You are AU-RA, a browser assistant. Answer concisely using only the supplied page text. Clearly say when the page does not contain the answer. You cannot take actions in the browser.",
        message: `Page title: ${tab.title}\nPage URL: ${tab.webContents.getURL()}\n\nPage text:\n---\n${text}\n---\n\nRequest: ${String(question || "").slice(0, 2000)}`
      });
      return { ok: true, answer };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
  ipcMain.handle("aura:compare", async (_event, question) => {
    const sourceTabs = [...tabs.values()];
    if (sourceTabs.length < 2) return { ok: false, error: "Open at least two tabs before comparing." };
    const sections = await Promise.all(sourceTabs.map(async (tab, index) => `Tab ${index + 1}: ${tab.title}\n${tab.webContents.getURL()}\n---\n${(await pageText(tab)).slice(0, MAX_COMPARE_CHARS_PER_TAB)}`));
    try {
      const answer = await callAnthropic({
        system: "You are AU-RA, a browser assistant. Compare the supplied tabs using only their page text. State when details are missing. You cannot take actions in the browser.",
        message: `${sections.join("\n\n====\n\n")}\n\nRequest: ${String(question || "Compare these tabs.").slice(0, 2000)}`
      });
      return { ok: true, answer };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 620,
    title: "AU-RA",
    backgroundColor: "#0b1020",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true }
  });
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.on("resize", applyViewBounds);
  mainWindow.webContents.once("did-finish-load", () => createTab(START_URL, true));
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  registerIpc();
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
