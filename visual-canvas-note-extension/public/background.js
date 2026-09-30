/* ------------------------------------------------------------------ */
/*  بوم یادداشت — Background Service Worker                            */
/*  - ساخت منوی راست‌کلیک «افزودن به یادداشت‌ها» روی متن انتخاب‌شده    */
/*  - خواندن متن انتخاب‌شده با حفظ HTML، بندها و استایل‌های نوشتاری    */
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

function readSelectedRichContentFromPage() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return { text: "", html: "" };

  const STYLE_PROPS = [
    "background-color",
    "color",
    "direction",
    "font-family",
    "font-size",
    "font-style",
    "font-weight",
    "letter-spacing",
    "line-height",
    "list-style-position",
    "list-style-type",
    "margin-bottom",
    "margin-left",
    "margin-right",
    "margin-top",
    "padding-left",
    "padding-right",
    "text-align",
    "text-decoration-color",
    "text-decoration-line",
    "text-decoration-style",
    "text-indent",
    "white-space",
    "word-break",
  ];

  const inlineComputedStyles = (root) => {
    const elements = root.querySelectorAll("*");
    for (const el of elements) {
      const tag = el.tagName.toLowerCase();
      if (["script", "style", "iframe", "object", "embed", "svg", "canvas", "img", "video", "audio"].includes(tag)) {
        el.remove();
        continue;
      }
      const computed = window.getComputedStyle(el);
      const styles = [];
      for (const prop of STYLE_PROPS) {
        const value = computed.getPropertyValue(prop);
        if (!value) continue;
        const lower = value.toLowerCase();
        if (lower.includes("url(") || lower.includes("expression(")) continue;
        styles.push(`${prop}: ${value}`);
      }
      if (styles.length) el.setAttribute("style", styles.join("; "));
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        if (name === "style" || name === "href" || name === "start" || name === "type" || name === "colspan" || name === "rowspan") continue;
        el.removeAttribute(attr.name);
      }
    }
  };

  const hosts = [];
  const htmlParts = [];
  const textParts = [];

  try {
    for (let i = 0; i < selection.rangeCount; i += 1) {
      const range = selection.getRangeAt(i);
      const host = document.createElement("div");
      host.style.cssText = "position:fixed;left:-100000px;top:0;width:900px;pointer-events:none;opacity:0;";
      host.appendChild(range.cloneContents());
      document.body.appendChild(host);
      hosts.push(host);
      inlineComputedStyles(host);
      const text = host.innerText || host.textContent || "";
      const html = host.innerHTML || "";
      if (text.trim()) textParts.push(text);
      if (html.trim()) htmlParts.push(html);
    }
  } finally {
    for (const host of hosts) host.remove();
  }

  return {
    text: textParts.join("\n").replace(/\r\n/g, "\n"),
    html: htmlParts.join("<hr>").trim(),
  };
}

async function getSelectedRichContent(info, tab) {
  const fallbackText = info.selectionText || "";
  if (!tab?.id || !chrome.scripting?.executeScript) return { text: fallbackText, html: "" };
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: readSelectedRichContentFromPage,
    });
    const rich = result?.result || {};
    return {
      text: rich.text || fallbackText,
      html: rich.html || "",
    };
  } catch (e) {
    return { text: fallbackText, html: "" };
  }
}

chrome.runtime.onInstalled.addListener(() => {
  setupContextMenu();
});

chrome.runtime.onStartup.addListener(setupContextMenu);

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  const rich = await getSelectedRichContent(info, tab);
  const text = (rich.text || "").replace(/\r\n/g, "\n");
  const html = rich.html || "";
  if (!text.trim() && !html.trim()) return;

  try {
    const data = await chrome.storage.local.get(PENDING_KEY);
    const pending = Array.isArray(data[PENDING_KEY]) ? data[PENDING_KEY] : [];
    pending.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      text,
      html,
      createdAt: Date.now(),
    });
    await chrome.storage.local.set({ [PENDING_KEY]: pending });

    // اعلان کوچک موفقیت؛ آدرس/عنوان سایت به متن یادداشت اضافه نمی‌شود.
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
