/* ------------------------------------------------------------------ */
/*  بوم یادداشت — Background Service Worker                            */
/*  - ساخت منوی راست‌کلیک «افزودن به یادداشت‌ها» روی متن انتخاب‌شده    */
/*  - خواندن متن انتخاب‌شده با حفظ بهتر بندها و خط‌ها                 */
/*  - باز کردن بوم فقط با کلیک روی آیکن افزونه                         */
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

function readSelectedTextFromPage() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return "";

  const parts = [];
  for (let i = 0; i < selection.rangeCount; i += 1) {
    const range = selection.getRangeAt(i);
    const host = document.createElement("div");
    host.style.cssText =
      "position:fixed;left:-100000px;top:0;width:900px;white-space:pre-wrap;pointer-events:none;opacity:0;";
    host.appendChild(range.cloneContents());
    document.body.appendChild(host);
    const text = host.innerText || host.textContent || "";
    host.remove();
    parts.push(text);
  }

  return parts.join("\n").replace(/\r\n/g, "\n");
}

async function getSelectedText(info, tab) {
  if (!tab?.id || !chrome.scripting?.executeScript) return info.selectionText || "";
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: readSelectedTextFromPage,
    });
    return result?.result || info.selectionText || "";
  } catch (e) {
    return info.selectionText || "";
  }
}

chrome.runtime.onInstalled.addListener(() => {
  setupContextMenu();
});

chrome.runtime.onStartup.addListener(setupContextMenu);

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  const text = await getSelectedText(info, tab);
  if (!text.trim()) return;

  try {
    const data = await chrome.storage.local.get(PENDING_KEY);
    const pending = Array.isArray(data[PENDING_KEY]) ? data[PENDING_KEY] : [];
    pending.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      text,
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
