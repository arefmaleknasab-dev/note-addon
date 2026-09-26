/* ------------------------------------------------------------------ */
/*  بوم یادداشت — Background Service Worker                            */
/*  - ساخت منوی راست‌کلیک «افزودن به یادداشت‌ها» روی متن انتخاب‌شده    */
/*  - فرستادن متن به صف یادداشت‌ها (chrome.storage.local)              */
/*  - باز کردن بوم با کلیک روی آیکن افزونه                            */
/* ------------------------------------------------------------------ */

const MENU_ID = "boom-add-to-notes";
const PENDING_KEY = "boom-yaddasht-pending-v1";
const PAGE_URL = "index.html";

function setupContextMenu() {
  try {
    chrome.contextMenus.remove(MENU_ID, () => {
      void chrome.runtime.lastError; // نادیده گرفتن خطای «وجود ندارد»
      chrome.contextMenus.create({
        id: MENU_ID,
        title: "افزودن به یادداشت‌ها",
        contexts: ["selection"],
      });
    });
  } catch (e) {
    /* ignore */
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  setupContextMenu();
  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL(PAGE_URL) });
  }
});

chrome.runtime.onStartup.addListener(setupContextMenu);

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  const text = (info.selectionText || "").trim();
  if (!text) return;

  try {
    const data = await chrome.storage.local.get(PENDING_KEY);
    const pending = Array.isArray(data[PENDING_KEY]) ? data[PENDING_KEY] : [];
    pending.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      text,
      url: info.pageUrl || (tab && tab.url) || "",
      pageTitle: (tab && tab.title) || "",
      createdAt: Date.now(),
    });
    await chrome.storage.local.set({ [PENDING_KEY]: pending });

    // اعلان کوچک موفقیت
    try {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: "به یادداشت‌ها اضافه شد",
        message: text.length > 90 ? text.slice(0, 90) + "…" : text,
        priority: 0,
      });
    } catch (e) {
      /* اعلان اختیاری است */
    }
  } catch (e) {
    /* ignore */
  }
});

// کلیک روی آیکن افزونه → باز کردن بوم در تب تازه
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL(PAGE_URL) });
});
