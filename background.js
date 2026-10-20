chrome.action.onClicked.addListener(async tab => {
  if (!tab.url?.startsWith('https://sis.ozyegin.edu.tr/')) {
    await chrome.tabs.create({url: chrome.runtime.getURL('panel.html')});
    return;
  }
  await chrome.tabs.create({url: chrome.runtime.getURL('panel.html') + '?tab=' + tab.id});
});
