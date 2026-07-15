/**
 * Popup 主逻辑
 * - 数据加载（缓存优先）
 * - 今天/昨天番剧过滤 & 渲染
 * - 隐藏/显示切换
 */

import { fetchCalendar, getAnimeByWeekday, normalizeAnimeItem } from '../utils/api.js';
import {
  getHiddenList,
  toggleHideAnime,
  getCalendarCache,
  setCalendarCache,
  isCacheValid,
} from '../utils/storage.js';
import {
  getTodayWeekdayId,
  getYesterdayWeekdayId,
  getWeekdayLabel,
  formatDateShort,
} from '../utils/date-utils.js';

// --- DOM 引用 ---
const $ = (sel) => document.querySelector(sel);

const elLoading = $('#loading');
const elError = $('#error');
const elErrorText = $('#errorText');
const elContent = $('#content');
const elBtnRefresh = $('#btnRefresh');
const elBtnRetry = $('#btnRetry');

const elTodayLabel = $('#todayLabel');
const elYesterdayLabel = $('#yesterdayLabel');
const elTodayCount = $('#todayCount');
const elYesterdayCount = $('#yesterdayCount');
const elTodayList = $('#todayList');
const elYesterdayList = $('#yesterdayList');
const elTodayEmpty = $('#todayEmpty');
const elYesterdayEmpty = $('#yesterdayEmpty');

const elHiddenSection = $('#hiddenSection');
const elBtnToggleHidden = $('#btnToggleHidden');
const elHiddenList = $('#hiddenList');
const elHiddenCount = $('#hiddenCount');

// --- 状态 ---
let allAnime = {};

// --- 初始化 ---
document.addEventListener('DOMContentLoaded', () => {
  elBtnRefresh.addEventListener('click', async () => {
    elBtnRefresh.classList.add('refreshing');
    await loadData(true);
    elBtnRefresh.classList.remove('refreshing');
  });
  elBtnRetry.addEventListener('click', () => loadData(true));
  elBtnToggleHidden.addEventListener('click', toggleHiddenSection);
  document.getElementById('btnOpenSeason').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('season/season.html') });
  });
  loadData(false);
});

/**
 * 加载数据
 */
async function loadData(forceRefresh = false) {
  showLoading(true);
  showError(false);
  elContent.hidden = true;

  try {
    let calendarData = null;

    if (!forceRefresh) {
      const cache = await getCalendarCache();
      if (cache.data && isCacheValid(cache.timestamp)) {
        calendarData = cache.data;
      }
    }

    if (!calendarData) {
      calendarData = await fetchCalendar();
      await setCalendarCache(calendarData);
    }

    const todayId = getTodayWeekdayId();
    const yesterdayId = getYesterdayWeekdayId();

    const todayRaw = getAnimeByWeekday(calendarData, todayId).map(normalizeAnimeItem);
    const yesterdayRaw = getAnimeByWeekday(calendarData, yesterdayId).map(normalizeAnimeItem);

    const hiddenIds = await getHiddenList();

    allAnime = {
      today: todayRaw.filter(a => !hiddenIds.includes(a.id)),
      yesterday: yesterdayRaw.filter(a => !hiddenIds.includes(a.id)),
      hidden: [
        ...todayRaw.filter(a => hiddenIds.includes(a.id)),
        ...yesterdayRaw.filter(a => hiddenIds.includes(a.id)),
      ],
    };

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    elTodayLabel.textContent = `今天 ${getWeekdayLabel(todayId)} · ${formatDateShort(today)}`;
    elYesterdayLabel.textContent = `昨天 ${getWeekdayLabel(yesterdayId)} · ${formatDateShort(yesterday)}`;

    render();
    elContent.hidden = false;
  } catch (error) {
    showError(true, error.message);
  } finally {
    showLoading(false);
  }
}

// --- 渲染 ---

function render() {
  renderAnimeList(elTodayList, allAnime.today, false);
  renderAnimeList(elYesterdayList, allAnime.yesterday, false);
  renderAnimeList(elHiddenList, allAnime.hidden, true);

  elTodayCount.textContent = allAnime.today.length;
  elYesterdayCount.textContent = allAnime.yesterday.length;
  elHiddenCount.textContent = `${allAnime.hidden.length}`;

  elTodayEmpty.hidden = allAnime.today.length > 0;
  elYesterdayEmpty.hidden = allAnime.yesterday.length > 0;
  elHiddenSection.hidden = allAnime.hidden.length === 0;

  const isOpen = !elHiddenList.hidden;
  elBtnToggleHidden.classList.toggle('hidden-section__toggle--open', isOpen);
}

function renderAnimeList(container, items, isHidden) {
  container.innerHTML = '';
  if (items.length === 0) return;

  const fragment = document.createDocumentFragment();
  items.forEach((anime) => {
    const card = createAnimeCard(anime, isHidden);
    fragment.appendChild(card);
  });
  container.appendChild(fragment);
}

function createAnimeCard(anime, isHidden) {
  const card = document.createElement('div');
  card.className = `anime-card${isHidden ? ' anime-card--hidden' : ''}`;
  card.title = `${anime.nameCn}\n${anime.name}`;

  const coverUrl = anime.images?.small || anime.images?.grid || '';

  const score = anime.rating?.score ?? 0;
  const ratingCount = anime.rating?.total ?? 0;
  const hasRating = score > 0;

  card.innerHTML = `
    <img
      class="anime-card__cover"
      src="${escapeHtml(coverUrl)}"
      alt="${escapeHtml(anime.nameCn)}"
      loading="lazy"
      onerror="this.style.display='none'"
    >
    <div class="anime-card__info">
      <div class="anime-card__name-cn">${escapeHtml(anime.nameCn)}</div>
      ${anime.name !== anime.nameCn ? `<div class="anime-card__name">${escapeHtml(anime.name)}</div>` : ''}
      <div class="anime-card__meta">
        ${hasRating ? `
          <span class="anime-card__rating">
            <svg class="anime-card__rating-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
            ${score.toFixed(1)}
          </span>
          ${ratingCount > 0 ? `<span class="anime-card__rating-count">(${ratingCount})</span>` : ''}
        ` : ''}
      </div>
    </div>
    <button class="anime-card__hide-btn ${isHidden ? 'anime-card__hide-btn--hidden' : ''}"
            data-anime-id="${anime.id}"
            title="${isHidden ? '取消隐藏' : '隐藏此番剧'}">
      <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        ${isHidden ? `
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
          <line x1="1" y1="1" x2="23" y2="23"/>
        ` : `
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        `}
      </svg>
    </button>
  `;

  card.addEventListener('click', (e) => {
    if (e.target.closest('.anime-card__hide-btn')) return;
    chrome.tabs.create({ url: anime.url, active: false });
  });

  const hideBtn = card.querySelector('.anime-card__hide-btn');
  hideBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const nowHidden = await toggleHideAnime(anime.id);
    if (nowHidden) {
      card.style.opacity = '0';
      card.style.transform = 'scale(0.95)';
      card.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
      setTimeout(() => loadData(false), 200);
    } else {
      loadData(false);
    }
  });

  return card;
}

// --- UI 状态 ---

function showLoading(visible) {
  elLoading.hidden = !visible;
}

function showError(visible, message = '') {
  elError.hidden = !visible;
  if (visible) elErrorText.textContent = message;
}

function toggleHiddenSection() {
  const isHidden = elHiddenList.hidden;
  elHiddenList.hidden = !isHidden;
  elBtnToggleHidden.classList.toggle('hidden-section__toggle--open', !isHidden);
}

// --- 工具 ---

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
