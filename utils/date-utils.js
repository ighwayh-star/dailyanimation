/**
 * 日期/星期转换工具
 *
 * Bangumi weekday ID 映射:
 *   1 = 周一 (Monday)
 *   2 = 周二 (Tuesday)
 *   3 = 周三 (Wednesday)
 *   4 = 周四 (Thursday)
 *   5 = 周五 (Friday)
 *   6 = 周六 (Saturday)
 *   7 = 周日 (Sunday)
 *
 * JS Date.getDay():
 *   0 = 周日, 1 = 周一, ..., 6 = 周六
 */

const WEEKDAY_NAMES = {
  1: '周一', 2: '周二', 3: '周三', 4: '周四',
  5: '周五', 6: '周六', 7: '周日',
};

const WEEKDAY_NAMES_FULL = {
  1: '星期一', 2: '星期二', 3: '星期三', 4: '星期四',
  5: '星期五', 6: '星期六', 7: '星期日',
};

/**
 * JS Date.getDay() → Bangumi weekday ID
 * @param {number} jsDay - Date.getDay() 结果 (0-6)
 * @returns {number} Bangumi weekday ID (1-7)
 */
function jsDayToBangumi(jsDay) {
  return jsDay === 0 ? 7 : jsDay;
}

/**
 * 获取今天的 Bangumi weekday ID
 * @returns {number} 1-7
 */
export function getTodayWeekdayId() {
  return jsDayToBangumi(new Date().getDay());
}

/**
 * 获取昨天的 Bangumi weekday ID
 * @returns {number} 1-7
 */
export function getYesterdayWeekdayId() {
  const today = getTodayWeekdayId();
  return today === 1 ? 7 : today - 1;
}

/**
 * 获取 weekday 简称
 * @param {number} weekdayId - Bangumi weekday ID (1-7)
 * @returns {string} 如 "周一"
 */
export function getWeekdayLabel(weekdayId) {
  return WEEKDAY_NAMES[weekdayId] ?? '未知';
}

/**
 * 获取 weekday 全称
 * @param {number} weekdayId - Bangumi weekday ID (1-7)
 * @returns {string} 如 "星期一"
 */
export function getWeekdayFullLabel(weekdayId) {
  return WEEKDAY_NAMES_FULL[weekdayId] ?? '未知';
}

/**
 * 格式化日期为简短的中文日期字符串
 * @param {Date} date
 * @returns {string} 如 "7月15日"
 */
export function formatDateShort(date) {
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}
