/**
 * 本季动画页 — 全7天展示 + 多选批量隐藏
 */

const BANGUMI_CALENDAR_URL = 'https://api.bgm.tv/calendar';
const WEEKDAY_NAMES = { 1: '周一', 2: '周二', 3: '周三', 4: '周四', 5: '周五', 6: '周六', 7: '周日' };
const WEEKDAY_COLORS = { 1: 'pink', 2: 'orange', 3: 'yellow', 4: 'green', 5: 'blue', 6: 'purple', 7: 'red' };

// --- DOM ---
const elLoading = document.getElementById('loading');
const elContent = document.getElementById('content');
const elSections = document.getElementById('weekdaySections');
const elFab = document.getElementById('fab');
const elFabCount = document.getElementById('fabCount');
const elSelCount = document.getElementById('selectedCount');
const elHiddenSelCount = document.getElementById('hiddenSelectedCount');
const elBtnSelectAll = document.getElementById('btnSelectAll');
const elBtnHide = document.getElementById('btnHideSelected');
const elBtnUnhide = document.getElementById('btnUnhideSelected');
const elFabSelectAll = document.getElementById('fabSelectAll');
const elFabHide = document.getElementById('fabHide');
const elFabUnhide = document.getElementById('fabUnhide');
const elBtnToggleMode = document.getElementById('btnToggleMode');

// --- State ---
let calendarData = [];
let hiddenIds = [];
let selectedIds = new Set();
let selectMode = false; // false = 浏览（点击跳转）, true = 选择（点击选中）

// --- Init ---
document.addEventListener('DOMContentLoaded', init);

async function init() {
  await loadData();
  bindEvents();
}

async function loadData() {
  try {
    // 先读缓存
    const cache = await chrome.storage.local.get(['calendarCache', 'hiddenAnimeIds']);
    hiddenIds = cache.hiddenAnimeIds || [];

    if (cache.calendarCache) {
      calendarData = cache.calendarCache;
    } else {
      // 缓存不可用，拉取
      const resp = await fetch(BANGUMI_CALENDAR_URL, {
        headers: { 'User-Agent': 'DailyAnimation/1.0', 'Accept': 'application/json' },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      calendarData = await resp.json();
    }

    if (!Array.isArray(calendarData) || calendarData.length === 0) {
      throw new Error('无数据');
    }

    render();
  } catch (err) {
    elLoading.innerHTML = `<p style="color:var(--sakura-500)">加载失败: ${err.message}</p><p style="color:var(--text-muted);font-size:12px;">请检查网络后刷新页面</p>`;
  }
}

function bindEvents() {
  // 模式切换
  elBtnToggleMode.addEventListener('click', () => {
    selectMode = !selectMode;
    selectedIds.clear();
    updateModeUI();
  });

  // 全选
  const selectAll = () => {
    const allVisible = getAllVisibleIds();
    if (selectedIds.size === allVisible.length) {
      selectedIds.clear();
    } else {
      allVisible.forEach(id => selectedIds.add(id));
    }
    updateUI();
  };

  elBtnSelectAll.addEventListener('click', selectAll);
  elFabSelectAll.addEventListener('click', selectAll);

  // 批量隐藏
  const hideSelected = async () => {
    const toHide = [...selectedIds].filter(id => !hiddenIds.includes(id));
    if (toHide.length === 0) return;
    hiddenIds = [...new Set([...hiddenIds, ...toHide])];
    await chrome.storage.local.set({ hiddenAnimeIds: hiddenIds });
    selectedIds.clear();
    render();
  };

  elBtnHide.addEventListener('click', hideSelected);
  elFabHide.addEventListener('click', hideSelected);

  // 批量取消隐藏
  const unhideSelected = async () => {
    const toUnhide = [...selectedIds].filter(id => hiddenIds.includes(id));
    if (toUnhide.length === 0) return;
    hiddenIds = hiddenIds.filter(id => !toUnhide.includes(id));
    await chrome.storage.local.set({ hiddenAnimeIds: hiddenIds });
    selectedIds.clear();
    render();
  };

  elBtnUnhide.addEventListener('click', unhideSelected);
  elFabUnhide.addEventListener('click', unhideSelected);

  // 滚动监听 — 浮动栏显隐
  window.addEventListener('scroll', () => {
    elFab.hidden = selectedIds.size === 0;
  });
}

// --- Render ---

function getAllVisibleIds() {
  const ids = [];
  calendarData.forEach(day => {
    (day.items || []).forEach(item => {
      if (!hiddenIds.includes(item.id)) ids.push(item.id);
    });
  });
  return ids;
}

function render() {
  elLoading.hidden = true;
  elContent.hidden = false;

  elSections.innerHTML = '';

  calendarData.forEach(day => {
    const weekday = day.weekday;
    if (!weekday || !day.items || day.items.length === 0) return;

    const visibleItems = day.items.filter(item => !hiddenIds.includes(item.id));
    const hiddenItems = day.items.filter(item => hiddenIds.includes(item.id));
    const allItems = [...visibleItems, ...hiddenItems]; // visible first

    if (allItems.length === 0) return;

    const group = document.createElement('section');
    group.className = 'weekday-group';

    const dotClass = `weekday-group__dot--${weekday.id}`;
    group.innerHTML = `
      <div class="weekday-group__header">
        <span class="weekday-group__dot ${dotClass}"></span>
        <span>${WEEKDAY_NAMES[weekday.id] || weekday.cn || ''}</span>
        <span class="weekday-group__count">${allItems.length} 部</span>
      </div>
      <div class="anime-grid">
        ${allItems.map(item => createCardHTML(item, hiddenIds.includes(item.id))).join('')}
      </div>
    `;

    elSections.appendChild(group);
  });

  // 绑定卡片事件
  document.querySelectorAll('.anime-card').forEach(card => {
    const id = parseInt(card.dataset.animeId);
    const url = card.dataset.animeUrl;

    // 点击卡片 — 根据模式决定行为
    card.addEventListener('click', () => {
      if (selectMode) {
        // 选择模式：切换选中
        if (selectedIds.has(id)) {
          selectedIds.delete(id);
        } else {
          selectedIds.add(id);
        }
        updateUI();
      } else {
        // 浏览模式：打开 Bangumi
        if (url) window.open(url, '_blank');
      }
    });
  });

  updateModeUI();
  updateUI();
}

function createCardHTML(item, isHidden) {
  const coverUrl = (item.images && (item.images.grid || item.images.small)) || '';
  const nameCn = item.name_cn || item.name || '';
  const name = (item.name !== item.name_cn) ? item.name : '';
  const score = item.rating && item.rating.score ? item.rating.score.toFixed(1) : '';
  const url = item.url || `https://bgm.tv/subject/${item.id}`;

  return `
    <div class="anime-card ${isHidden ? 'anime-card--hidden' : ''}"
         data-anime-id="${item.id}"
         data-anime-url="${escapeHtml(url)}">
      <div class="anime-card__check" title="选择"></div>
      <img class="anime-card__cover" src="${escapeHtml(coverUrl)}" alt="${escapeHtml(nameCn)}" loading="lazy" onerror="this.style.display='none'">
      <div class="anime-card__info">
        <div class="anime-card__name-cn">${escapeHtml(nameCn)}</div>
        ${name ? `<div class="anime-card__name">${escapeHtml(name)}</div>` : ''}
        ${score ? `<span class="anime-card__rating">⭐ ${score}</span>` : ''}
      </div>
    </div>
  `;
}

function updateModeUI() {
  // body class 控制复选框显隐
  document.body.classList.toggle('mode-select', selectMode);

  // 按钮显隐
  elBtnSelectAll.hidden = !selectMode;
  elBtnHide.hidden = !selectMode;
  elBtnUnhide.hidden = !selectMode;
  elFab.hidden = !selectMode || selectedIds.size === 0;

  // 切换按钮样式
  elBtnToggleMode.classList.toggle('header__btn--mode--active', selectMode);
  elBtnToggleMode.innerHTML = selectMode
    ? '<svg class="icon icon--sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> 退出选择'
    : '<svg class="icon icon--sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> 选择模式';

  // 退出选择模式时清空选中
  if (!selectMode) {
    selectedIds.clear();
  }
}

function updateUI() {
  const totalCount = selectedIds.size;
  const hiddenCount = [...selectedIds].filter(id => hiddenIds.includes(id)).length;
  const visibleCount = totalCount - hiddenCount;

  elSelCount.textContent = visibleCount;
  elHiddenSelCount.textContent = hiddenCount;
  elFabCount.textContent = totalCount;
  elBtnHide.disabled = visibleCount === 0;
  elBtnUnhide.disabled = hiddenCount === 0;
  elFab.hidden = totalCount === 0;

  // 更新卡片勾选状态
  document.querySelectorAll('.anime-card').forEach(card => {
    const id = parseInt(card.dataset.animeId);
    card.classList.toggle('anime-card--checked', selectedIds.has(id));
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
