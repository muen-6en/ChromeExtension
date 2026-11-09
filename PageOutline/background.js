"use strict";

const DEFAULT_ENABLED = true;

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get("enabled");
  if (typeof current.enabled !== "boolean") {
    await chrome.storage.local.set({ enabled: DEFAULT_ENABLED });
  }
});

chrome.runtime.onStartup.addListener(async () => {
  const current = await chrome.storage.local.get("enabled");
  if (typeof current.enabled !== "boolean") {
    await chrome.storage.local.set({ enabled: DEFAULT_ENABLED });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "toggle-state") {
    toggleForAllTabs();
    return false;
  }

  if (message?.type === "get-state") {
    chrome.storage.local.get({ enabled: DEFAULT_ENABLED }).then((state) => {
      sendResponse({ enabled: state.enabled === true });
    });
    return true;
  }

  return false;
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-page-outline") {
    toggleForAllTabs();
  }
});

chrome.action.onClicked.addListener(() => {
  toggleForAllTabs();
});

async function toggleForAllTabs() {
  const state = await chrome.storage.local.get({ enabled: DEFAULT_ENABLED });
  const enabled = !state.enabled;
  await chrome.storage.local.set({ enabled });

  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs.map(async (tab) => {
      if (typeof tab.id !== "number") {
        return;
      }

      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: "set-enabled",
          enabled
        });
      } catch {
        // Chrome内部ページなど、Content Scriptを実行できないタブは無視する。
      }
    })
  );
}
