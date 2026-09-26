const menuId='add-note-selection';
chrome.runtime.onInstalled.addListener(()=>{ chrome.contextMenus.create({id:menuId,title:'افزودن به یادداشت‌ها',contexts:['selection']}); });
chrome.contextMenus.onClicked.addListener((info,tab)=>{ if(info.menuItemId===menuId && info.selectionText){ chrome.storage.local.set({pendingNote:{text:info.selectionText.trim(), source:tab?.url||''}}); chrome.tabs.create({url:chrome.runtime.getURL('newtab.html?add=1')}); }});
chrome.action.onClicked.addListener(()=>chrome.tabs.create({url:chrome.runtime.getURL('newtab.html')}));
