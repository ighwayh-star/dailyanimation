/**
 * Service Worker — 后台预取日历数据
 */

const CALENDAR_URL = 'https://api.bgm.tv/calendar';
const USER_AGENT = 'DailyAnimationExtension/1.0';
const ALARM_NAME = 'calendar-refresh';
const REFRESH_INTERVAL_MINUTES = 30;

async function refreshCalendarCache() {
  try {
    const response = await fetch(CALENDAR_URL, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
      },
      credentials: 'omit',
    });

    if (!response.ok) {
      console.warn(`[每日放送] API 返回非 200: HTTP ${response.status}`);
      return;
    }

    const data = await response.json();

    if (!Array.isArray(data) || data.length !== 7) {
      console.warn('[每日放送] API 返回数据格式异常，跳过缓存更新');
      return;
    }

    await chrome.storage.local.set({
      calendarCache: data,
      cacheTimestamp: Date.now(),
    });

    console.log(`[每日放送] 缓存已更新 (${new Date().toLocaleString()})`);
  } catch (error) {
    console.warn('[每日放送] 后台刷新失败:', error.message);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('[每日放送] 插件已安装/更新，首次拉取数据...');
  refreshCalendarCache();
  chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: REFRESH_INTERVAL_MINUTES,
  });
});

chrome.runtime.onStartup.addListener(async () => {
  const alarm = await chrome.alarms.get(ALARM_NAME);
  if (!alarm) {
    chrome.alarms.create(ALARM_NAME, {
      periodInMinutes: REFRESH_INTERVAL_MINUTES,
    });
  }
  refreshCalendarCache();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    refreshCalendarCache();
  }
});
