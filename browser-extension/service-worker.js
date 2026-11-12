async function sendActiveDomain() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.url) return;
    const parsed = new URL(tab.url);
    const allowedProtocols = ['http:', 'https:'];
    const domain = allowedProtocols.includes(parsed.protocol) ? parsed.hostname.replace(/^www\./i, '') : '';
    await fetch('http://127.0.0.1:8765/active-tab', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain })
    });
  } catch (_) {
    // Agent may be stopped; next alarm retries automatically.
  }
}
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('activitytrack-domain', { periodInMinutes: 0.5 });
  sendActiveDomain();
});
chrome.runtime.onStartup.addListener(sendActiveDomain);
chrome.alarms.onAlarm.addListener(sendActiveDomain);
chrome.tabs.onActivated.addListener(sendActiveDomain);
chrome.tabs.onUpdated.addListener((_id, changeInfo) => { if (changeInfo.url || changeInfo.status === 'complete') sendActiveDomain(); });
chrome.windows.onFocusChanged.addListener(sendActiveDomain);
