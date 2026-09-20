"use strict";

const $ = (selector) => document.querySelector(selector);
const tabsEl = $("#tabs");
const address = $("#address");
const pageStage = $("#page-stage");
const assistantPanel = $("#assistant-panel");
const bookmarkPanel = $("#bookmark-panel");
const chat = $("#chat");
let state = { activeTabId: null, tabs: [] };
let bookmarks = [];
let toastTimer;

function activeTab() { return state.tabs.find((tab) => tab.id === state.activeTabId); }
function escapeHtml(text) { const div = document.createElement("div"); div.textContent = text; return div.innerHTML; }
function showToast(message) { const toast = $("#toast"); toast.textContent = message; toast.classList.add("is-visible"); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2600); }
function layoutPage() { const rect = pageStage.getBoundingClientRect(); const panelOpen = !assistantPanel.classList.contains("is-collapsed"); const width = Math.max(1, rect.width - (panelOpen ? assistantPanel.getBoundingClientRect().width : 0)); window.aura.updateLayout({ x: rect.left, y: rect.top, width, height: rect.height }); }
function syncHome() { const tab = activeTab(); $("#home-page").hidden = Boolean(tab && tab.url !== "about:blank"); }
function renderTabs() {
  tabsEl.replaceChildren();
  state.tabs.forEach((tab) => {
    const item = document.createElement("div");
    item.className = `tab${tab.id === state.activeTabId ? " is-active" : ""}${tab.loading ? " is-loading" : ""}${tab.incognito ? " is-private" : ""}`;
    item.title = tab.title;
    item.innerHTML = `<span class="tab-dot"></span><button class="tab-title" type="button">${escapeHtml(tab.title || "New tab")}</button><button class="tab-close" type="button" aria-label="Close tab">×</button>`;
    item.querySelector(".tab-title").addEventListener("click", () => window.aura.activateTab(tab.id));
    item.querySelector(".tab-close").addEventListener("click", (event) => { event.stopPropagation(); window.aura.closeTab(tab.id); });
    tabsEl.append(item);
  });
  const active = activeTab();
  if (active && document.activeElement !== address) address.value = active.url || "";
  $("#back").disabled = !active?.canGoBack;
  $("#forward").disabled = !active?.canGoForward;
  $("#bookmark").classList.toggle("is-saved", Boolean(active && bookmarks.some((bookmark) => bookmark.url === active.url)));
  syncHome();
}
function renderBookmarks() {
  const list = $("#bookmark-list");
  list.replaceChildren();
  if (!bookmarks.length) { list.innerHTML = `<div class="empty-state">No bookmarks yet. Use the star beside the address bar to save a page locally.</div>`; return; }
  bookmarks.forEach((bookmark) => {
    const row = document.createElement("div"); row.className = "bookmark-row";
    row.innerHTML = `<button class="bookmark-open" type="button"><strong>${escapeHtml(bookmark.title)}</strong><small>${escapeHtml(bookmark.url)}</small></button><button class="bookmark-delete" type="button" aria-label="Remove bookmark">×</button>`;
    row.querySelector(".bookmark-open").addEventListener("click", () => { window.aura.createTab(bookmark.url); bookmarkPanel.classList.add("is-hidden"); });
    row.querySelector(".bookmark-delete").addEventListener("click", async () => { bookmarks = await window.aura.removeBookmark(bookmark.id); renderBookmarks(); renderTabs(); });
    list.append(row);
  });
}
function addMessage(kind, text) { const item = document.createElement("div"); item.className = `message ${kind}`; item.textContent = text; chat.append(item); chat.scrollTop = chat.scrollHeight; return item; }
async function runAsk(question, mode = "ask") {
  const prompt = String(question || "").trim(); if (!prompt) return;
  assistantPanel.classList.remove("is-collapsed"); layoutPage(); addMessage("user", prompt);
  const pending = addMessage("aura", "Thinking…");
  const response = mode === "compare" ? await window.aura.compare(prompt) : await window.aura.ask(prompt);
  pending.remove(); addMessage(response.ok ? "aura" : "error", response.ok ? response.answer : response.error);
}

$("#new-tab").addEventListener("click", () => window.aura.createTab("about:blank"));
$("#private-tab").addEventListener("click", () => window.aura.createIncognitoTab());
$("#back").addEventListener("click", () => window.aura.back());
$("#forward").addEventListener("click", () => window.aura.forward());
$("#reload").addEventListener("click", () => window.aura.reload());
$("#address-form").addEventListener("submit", (event) => { event.preventDefault(); window.aura.navigate(address.value); });
$("#home-search-form").addEventListener("submit", (event) => { event.preventDefault(); const query = $("#home-search").value.trim(); if (query) window.aura.navigate(query); });
document.querySelectorAll("[data-search]").forEach((button) => button.addEventListener("click", () => window.aura.navigate(button.dataset.search)));
document.querySelectorAll(".shortcut[data-action]").forEach((button) => button.addEventListener("click", () => launchApp(button.dataset.action)));
$("#ask-aura").addEventListener("click", () => { assistantPanel.classList.toggle("is-collapsed"); layoutPage(); if (!assistantPanel.classList.contains("is-collapsed")) $("#ask-input").focus(); });
$("#close-assistant").addEventListener("click", () => { assistantPanel.classList.add("is-collapsed"); layoutPage(); });
$("#bookmarks").addEventListener("click", () => bookmarkPanel.classList.toggle("is-hidden"));
$("#close-bookmarks").addEventListener("click", () => bookmarkPanel.classList.add("is-hidden"));
$("#bookmark").addEventListener("click", async () => { const tab = activeTab(); if (!tab || tab.url === "about:blank") return; const result = await window.aura.toggleBookmark(tab.url, tab.title); if (result.error) { showToast(result.error); return; } bookmarks = result.bookmarks; renderBookmarks(); renderTabs(); showToast(bookmarks.some((bookmark) => bookmark.url === tab.url) ? "Saved locally" : "Removed bookmark"); });
$("#apps").addEventListener("click", () => $("#apps-panel").classList.toggle("is-hidden"));
$("#close-apps").addEventListener("click", () => $("#apps-panel").classList.add("is-hidden"));
function openService(kind) { const isMeet = kind === "VMeet"; $("#service-kicker").textContent = isMeet ? "AURA LIVE" : "AURA CONVERSATIONS"; $("#service-title").textContent = isMeet ? "Meet with more presence." : "Keep the conversation close."; $("#service-copy").textContent = isMeet ? "Set up a VMeet room for your next conversation." : "Name a VChat space for the people and ideas that matter."; $("#service-field-wrap").firstChild.textContent = isMeet ? "Room name" : "Conversation name"; $("#service-field").placeholder = isMeet ? "e.g. Design review" : "e.g. Weekend plans"; $("#service-submit").textContent = isMeet ? "Create VMeet room →" : "Create VChat space →"; $("#service-note").textContent = isMeet ? "Preview only: live video needs a VMeet signaling service, authenticated accounts, and TURN infrastructure." : "Preview only: real messages need a VChat service, authenticated accounts, and secure message storage."; $("#service-modal").dataset.service = kind; $("#service-modal").classList.remove("is-hidden"); $("#service-field").focus(); }
function launchApp(action) { $("#apps-panel").classList.add("is-hidden"); if (action === "asearch") { const tab = activeTab(); if (tab?.url === "about:blank") $("#home-search").focus(); else address.focus(); } if (action === "amail") $("#profile-modal").classList.remove("is-hidden"); if (action === "vtrol") window.aura.createTab("https://www.youtube.com/"); if (action === "avision") { assistantPanel.classList.remove("is-collapsed"); layoutPage(); $("#ask-input").focus(); } if (action === "satellite") window.aura.createTab("https://www.google.com/maps"); if (action === "calendar") showToast("AURA Calendar is the next connected service."); if (action === "vmeet") openService("VMeet"); if (action === "vchat") openService("VChat"); }
document.querySelectorAll(".app-launch").forEach((button) => button.addEventListener("click", () => launchApp(button.dataset.action)));
$("#close-profile").addEventListener("click", () => $("#profile-modal").classList.add("is-hidden"));
$("#profile-trigger").addEventListener("click", () => $("#profile-modal").classList.remove("is-hidden"));
$("#profile-form").addEventListener("submit", (event) => { event.preventDefault(); const profile = { name: $("#profile-name").value.trim(), email: $("#profile-email").value.trim() }; localStorage.setItem("aura-profile", JSON.stringify(profile)); $("#profile-trigger").textContent = profile.name.slice(0, 1).toUpperCase() || "A"; $("#profile-modal").classList.add("is-hidden"); showToast(`Welcome, ${profile.name}. Your profile stays on this device.`); });
$("#close-service").addEventListener("click", () => $("#service-modal").classList.add("is-hidden"));
$("#service-submit").addEventListener("click", () => { const label = $("#service-modal").dataset.service; $("#service-modal").classList.add("is-hidden"); showToast(`${label} is designed; connect its secure service backend to launch it.`); });
$("#ask-form").addEventListener("submit", (event) => { event.preventDefault(); const input = $("#ask-input"); const question = input.value; input.value = ""; runAsk(question); });
document.querySelectorAll(".quick-actions button[data-prompt]").forEach((button) => button.addEventListener("click", () => runAsk(button.dataset.prompt)));
$("#compare-tabs").addEventListener("click", () => runAsk("Compare the open tabs: summarize their shared themes, important differences, and any decision-relevant details.", "compare"));
window.addEventListener("resize", layoutPage);
window.aura.onTabState((next) => { state = { activeTabId: next.activeTabId, tabs: next.tabs || state.tabs }; renderTabs(); requestAnimationFrame(layoutPage); });

(async () => { const now = new Date(); $("#home-date").textContent = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }); const savedProfile = JSON.parse(localStorage.getItem("aura-profile") || "null"); if (savedProfile?.name) { $("#profile-name").value = savedProfile.name; $("#profile-email").value = savedProfile.email || ""; $("#profile-trigger").textContent = savedProfile.name.slice(0, 1).toUpperCase(); } state = await window.aura.listTabs(); bookmarks = await window.aura.listBookmarks(); renderTabs(); renderBookmarks(); requestAnimationFrame(layoutPage); })();
