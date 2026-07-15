/**
 * chrome.storage 读写封装
 */

const STORAGE_KEYS = {
  HIDDEN_LIST: 'hiddenAnimeIds',
  CALENDAR_CACHE: 'calendarCache',
  CACHE_TIMESTAMP: 'cacheTimestamp',
  HIDE_ENABLED: 'hideEnabled',
};

/**
 * 获取用户隐藏的番剧 ID 列表
 * @returns {Promise<number[]>}
 */
export async function getHiddenList() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.HIDDEN_LIST);
  return result[STORAGE_KEYS.HIDDEN_LIST] ?? [];
}

/**
 * 保存隐藏列表
 * @param {number[]} idList
 */
export async function setHiddenList(idList) {
  await chrome.storage.local.set({ [STORAGE_KEYS.HIDDEN_LIST]: idList });
}

/**
 * 切换某个番剧的隐藏状态
 * @param {number} animeId
 * @returns {Promise<boolean>} 操作后是否处于隐藏状态
 */
export async function toggleHideAnime(animeId) {
  const list = await getHiddenList();
  const index = list.indexOf(animeId);
  if (index > -1) {
    list.splice(index, 1);
  } else {
    list.push(animeId);
  }
  await setHiddenList(list);
  return index === -1; // 返回 true 表示现在被隐藏了
}

/**
 * 获取缓存的日历数据
 * @returns {Promise<{data: Array|null, timestamp: number|null}>}
 */
export async function getCalendarCache() {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.CALENDAR_CACHE,
    STORAGE_KEYS.CACHE_TIMESTAMP,
  ]);
  return {
    data: result[STORAGE_KEYS.CALENDAR_CACHE] ?? null,
    timestamp: result[STORAGE_KEYS.CACHE_TIMESTAMP] ?? null,
  };
}

/**
 * 更新日历缓存
 * @param {Array} data
 */
export async function setCalendarCache(data) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.CALENDAR_CACHE]: data,
    [STORAGE_KEYS.CACHE_TIMESTAMP]: Date.now(),
  });
}

/**
 * 检查缓存是否有效（默认 60 分钟内）
 * @param {number|null} timestamp
 * @param {number} maxAgeMs 最大缓存时间（毫秒）
 * @returns {boolean}
 */
export function isCacheValid(timestamp, maxAgeMs = 60 * 60 * 1000) {
  if (!timestamp) return false;
  return Date.now() - timestamp < maxAgeMs;
}

/**
 * 获取隐藏功能是否启用
 * @returns {Promise<boolean>}
 */
export async function getHideEnabled() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.HIDE_ENABLED);
  return result[STORAGE_KEYS.HIDE_ENABLED] ?? true;
}
