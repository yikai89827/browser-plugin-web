chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: "my-action",
      title: "打开fbspider",
      contexts: ["action", "page"]    // 只在点击扩展图标打开的 popup 里右键时出现
    });
    chrome.contextMenus.create({
      id: "my-action1",
      title: "打开veryfb",
      contexts: ["action", "page"]    // 只在点击扩展图标打开的 popup 里右键时出现
    });
  });
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "my-action") {
      // 处理逻辑
      window.open('https://fbspider.com', '_blank')
    }
    if (info.menuItemId === "my-action1") {
        // 处理逻辑
        window.open('https://veryfb.com', '_blank')
      }
  });