/**
 * Bangumi API 封装
 * 文档: https://bangumi.github.io/api/
 */

const BANGUMI_CALENDAR_URL = 'https://api.bgm.tv/calendar';
const REQUEST_TIMEOUT_MS = 10000;
const USER_AGENT = 'DailyAnimationExtension/1.0.0';

/**
 * 获取每周放送日历
 * @returns {Promise<Array>} 一周 7 天的放送数据
 * @throws {Error} 网络错误或超时
 */
export async function fetchCalendar() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(BANGUMI_CALENDAR_URL, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
      },
      signal: controller.signal,
      // 浏览器插件环境默认不带 credentials，显式声明
      credentials: 'omit',
    });

    if (!response.ok) {
      throw new Error(`Bangumi API 返回错误: HTTP ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (!Array.isArray(data) || data.length !== 7) {
      throw new Error('Bangumi API 返回数据格式异常');
    }

    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('请求超时，请检查网络连接后重试');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 从日历数据中提取指定 weekday 的番剧列表
 * @param {Array} calendarData - fetchCalendar 返回的完整日历数据
 * @param {number} weekdayId - Bangumi weekday ID (1=周一, 7=周日)
 * @returns {Array} 该天的番剧列表，找不到返回空数组
 */
export function getAnimeByWeekday(calendarData, weekdayId) {
  const dayData = calendarData.find(d => d.weekday?.id === weekdayId);
  return dayData?.items ?? [];
}

/**
 * 规范化番剧条目，补全缺失字段
 * @param {Object} item - API 返回的原始条目
 * @returns {Object} 规范化后的条目
 */
export function normalizeAnimeItem(item) {
  return {
    id: item.id,
    name: item.name || '',
    nameCn: item.name_cn || item.name || '',
    images: item.images || {},
    rating: item.rating || { score: 0, total: 0 },
    url: item.url || `https://bgm.tv/subject/${item.id}`,
    airWeekday: item.air_weekday ?? null,
    summary: item.summary || '',
  };
}
