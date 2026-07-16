// UserScript
// @name        每日动画放送
// @version     1.0.0
// @author      hiway
// @match       https://bgm.tv/*
// @match       https://bangumi.tv/*
// @match       https://chii.in/*
// @description 在Bangumi首页侧边展示每日更新的番剧，支持隐藏、B站搜索、本季全览
// /UserScript

(function () {
  'use strict';

  // ============================================================
  // 常量
  // ============================================================
  const CALENDAR_URL = 'https://api.bgm.tv/calendar';
  const STORAGE_KEY = 'dailyAnimWidget';
  const CACHE_MS = 60 * 60 * 1000; // 缓存1小时
  const WEEKDAY_NAMES = { 1: '周一', 2: '周二', 3: '周三', 4: '周四', 5: '周五', 6: '周六', 7: '周日' };
  const WEEKDAY_COLORS = { 1: 'pink', 2: 'orange', 3: 'yellow', 4: 'green', 5: 'blue', 6: 'purple', 7: 'red' };

  // ============================================================
  // 存储层 (localStorage)
  // ============================================================
  function loadStore() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
  }
  function saveStore(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function getHiddenList() { return loadStore().hiddenIds || []; }
  function setHiddenList(ids) { const s = loadStore(); s.hiddenIds = ids; saveStore(s); }
  function toggleHideAnime(id) {
    const list = getHiddenList();
    const idx = list.indexOf(id);
    idx > -1 ? list.splice(idx, 1) : list.push(id);
    setHiddenList(list);
    return idx === -1;
  }

  function getCalendarCache() {
    const s = loadStore();
    if (!s.cacheData || !s.cacheTime) return null;
    return Date.now() - s.cacheTime < CACHE_MS ? s.cacheData : null;
  }
  function setCalendarCache(data) {
    const s = loadStore();
    s.cacheData = data; s.cacheTime = Date.now();
    saveStore(s);
  }

  // ============================================================
  // 工具函数
  // ============================================================
  function getTodayWeekdayId() { const d = new Date().getDay(); return d === 0 ? 7 : d; }
  function getYesterdayWeekdayId() { const t = getTodayWeekdayId(); return t === 1 ? 7 : t - 1; }
  function formatDateShort(d) { return d.getMonth() + 1 + '月' + d.getDate() + '日'; }
  function escapeHtml(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function normalizeAnime(item) {
    return {
      id: item.id, name: item.name || '', nameCn: item.name_cn || item.name || '',
      images: item.images || {}, rating: item.rating || { score: 0, total: 0 },
      url: item.url || 'https://bgm.tv/subject/' + item.id,
    };
  }

  // ============================================================
  // 数据加载
  // ============================================================
  async function fetchCalendar() {
    const resp = await fetch(CALENDAR_URL, { headers: { 'Accept': 'application/json' } });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    return resp.json();
  }

  function getAnimeByWeekday(data, weekdayId) {
    const day = data.find(d => d.weekday && d.weekday.id === weekdayId);
    return (day && day.items || []).map(normalizeAnime);
  }

  // ============================================================
  // 主体 Widget 类
  // ============================================================
  const DailyWidget = {
    el: null,
    calendarData: null,
    hiddenIds: [],
    tab: 'daily',   // 'daily' | 'season'
    selectMode: false,
    selectedIds: new Set(),

    async init() {
      // 只在首页注入
      if (!/^\/$/.test(location.pathname)) return;

      this.hiddenIds = getHiddenList();
      this.injectDOM();
      this.injectCSS();
      this.bindEvents();
      try { await this.loadData(); } catch {}
    },

    // --- DOM 注入 ---
    injectDOM() {
      const panel = document.createElement('div');
      panel.id = 'daily-anim-widget';
      panel.innerHTML = `
        <div class="dw-header">
          <span class="dw-logo">🌸</span>
          <span class="dw-title">每日放送</span>
          <button class="dw-btn dw-btn-collapse" title="折叠">▾</button>
          <button class="dw-btn dw-btn-refresh" title="刷新">🔄</button>
        </div>
        <div class="dw-tabs">
          <button class="dw-tab dw-tab--active" data-tab="daily">每日</button>
          <button class="dw-tab" data-tab="season">本季</button>
        </div>
        <div class="dw-loading">加载中...</div>
        <div class="dw-content" hidden></div>
      `;

      // 挂载到首页右侧边栏
      const target = document.querySelector('#columnHomeB');
      if (target) {
        target.insertBefore(panel, target.firstChild);
      } else {
        // 回退：挂到主内容区右侧
        const main = document.querySelector('#columnA') || document.body;
        panel.style.cssText = 'position:fixed;right:20px;top:80px;z-index:9999;';
        document.body.appendChild(panel);
      }
      this.el = panel;
    },

    injectCSS() {
      const style = document.createElement('style');
      style.textContent = `
#daily-anim-widget [hidden] { display:none !important; }
#daily-anim-widget {
  width:100%; margin-bottom:20px;
  background:rgba(255,255,255,0.75); backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px);
  border-radius:16px; border:1px solid rgba(232,104,138,0.12);
  box-shadow:0 2px 12px rgba(180,130,150,0.08);
  font-size:16px; color:#3D2C35; overflow:hidden;
  max-height:calc(100vh - 160px); display:flex; flex-direction:column;
  font-family:"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
}
#daily-anim-widget * { box-sizing:border-box; margin:0; padding:0; }
.dw-header { display:flex; align-items:center; gap:8px; padding:12px 14px 10px; border-bottom:1px solid rgba(232,104,138,0.08); }
.dw-logo { font-size:20px; }
.dw-title { font-weight:700; font-size:18px; flex:1; }
.dw-btn { width:32px; height:32px; border:none; border-radius:8px; background:rgba(255,255,255,0.5); cursor:pointer; font-size:16px; display:flex; align-items:center; justify-content:center; transition:all 0.2s; }
.dw-btn:hover { background:rgba(255,240,243,0.7); }
.dw-btn-refresh.refreshing { animation:dw-spin 0.8s linear infinite; }
.dw-btn-collapse { transition:transform 0.3s; }
.dw-btn-collapse.collapsed { transform:rotate(-90deg); }
#daily-anim-widget.collapsed .dw-tabs,
#daily-anim-widget.collapsed .dw-content,
#daily-anim-widget.collapsed .dw-loading { display:none; }
@keyframes dw-spin { to { transform:rotate(360deg); } }
.dw-tabs { display:flex; border-bottom:1px solid rgba(232,104,138,0.08); }
.dw-tab { flex:1; padding:9px 0; border:none; background:transparent; color:#B09AA6; font-size:16px; font-weight:600; cursor:pointer; transition:all 0.2s; position:relative; }
.dw-tab--active { color:#E8688A; }
.dw-tab--active::after { content:''; position:absolute; bottom:0; left:50%; transform:translateX(-50%); width:24px; height:3px; border-radius:3px; background:#E8688A; }
.dw-tab:hover { color:#E8688A; }
.dw-loading { padding:30px; text-align:center; color:#B09AA6; }
.dw-content { padding:8px 10px 12px; flex:1; overflow-y:auto; scrollbar-width:thin; scrollbar-color:#FFC2D1 transparent; }
.dw-content::-webkit-scrollbar { width:4px; }
.dw-content::-webkit-scrollbar-thumb { background:#FFC2D1; border-radius:4px; }
.dw-day { margin-bottom:8px; }
.dw-day__header { display:flex; align-items:center; gap:6px; padding:8px 4px 6px; font-weight:700; font-size:16px; }
.dw-day__dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; }
.dw-day__dot--1{background:#F8829E}.dw-day__dot--2{background:#E8A87C}.dw-day__dot--3{background:#F5C842}.dw-day__dot--4{background:#6BCB77}.dw-day__dot--5{background:#4D96FF}.dw-day__dot--6{background:#9B72F2}.dw-day__dot--7{background:#F07080}
.dw-day__count { font-size:14px; color:#B09AA6; font-weight:500; }
.dw-cards { display:flex; flex-direction:column; gap:4px; }
.dw-card { display:flex; align-items:center; gap:8px; padding:7px 8px; background:rgba(255,255,255,0.5); border-radius:10px; border:1px solid rgba(255,255,255,0.5); cursor:pointer; transition:all 0.2s; }
.dw-card:hover { background:rgba(255,255,255,0.8); border-color:rgba(232,104,138,0.15); box-shadow:0 2px 8px rgba(180,130,150,0.08); transform:translateY(-1px); }
.dw-card--hidden { opacity:0.45; filter:grayscale(0.3); }
.dw-card--checked { border-color:#E8688A; background:rgba(255,240,243,0.5); }
.dw-card__check { width:16px; height:16px; border:2px solid #FFC2D1; border-radius:4px; flex-shrink:0; display:none; align-items:center; justify-content:center; cursor:pointer; }
.dw-card__check::after { content:''; width:7px; height:3px; border-left:2px solid white; border-bottom:2px solid white; transform:rotate(-45deg); opacity:0; }
.dw-card--checked .dw-card__check { background:#E8688A; border-color:#E8688A; }
.dw-card--checked .dw-card__check::after { opacity:1; }
.dw-card__cover { width:36px; height:48px; border-radius:6px; object-fit:cover; background:linear-gradient(135deg,#FFE0E7,#F3EDFA); flex-shrink:0; }
.dw-card__info { flex:1; min-width:0; }
.dw-card__name-cn { font-size:15px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dw-card__name { font-size:13px; color:#B09AA6; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:1px; }
.dw-card__meta { display:flex; align-items:center; gap:4px; margin-top:3px; }
.dw-card__rating { font-size:13px; font-weight:700; color:#F5A623; background:rgba(245,166,35,0.08); padding:1px 5px; border-radius:99px; }
.dw-card__actions { display:flex; flex-direction:column; gap:2px; flex-shrink:0; }
.dw-card__btn { width:28px; height:28px; border:none; border-radius:6px; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:13px; transition:all 0.15s; }
.dw-card__btn--search { background:rgba(35,155,230,0.08); color:rgba(35,155,230,0.6); }
.dw-card__btn--search:hover { background:rgba(35,155,230,0.15); }
.dw-card__btn--hide { background:rgba(255,255,255,0.4); color:#B09AA6; }
.dw-card__btn--hide:hover { background:rgba(255,240,243,0.6); color:#E8688A; }
.dw-card__btn--unhide { background:rgba(255,240,243,0.4); color:#E8688A; }
.dw-card__btn--unhide:hover { background:rgba(255,240,243,0.6); }
.dw-hidden-section { margin-top:8px; border-top:1px solid rgba(232,104,138,0.08); padding-top:6px; }
.dw-hidden-btn { width:100%; padding:6px 4px; border:none; background:rgba(255,255,255,0.3); border-radius:8px; color:#B09AA6; font-size:14px; cursor:pointer; display:flex; align-items:center; gap:4px; }
.dw-hidden-btn:hover { background:rgba(255,255,255,0.5); color:#7A6572; }
.dw-hidden-chevron { transition:transform 0.2s; font-size:8px; }
.dw-hidden-btn--open .dw-hidden-chevron { transform:rotate(90deg); }
.dw-season-bar { display:flex; align-items:center; gap:8px; padding:4px 4px 8px; }
.dw-season-bar__btn { padding:6px 12px; border:1px solid rgba(232,104,138,0.12); border-radius:99px; background:rgba(255,255,255,0.5); color:#3D2C35; font-size:14px; cursor:pointer; transition:all 0.2s; }
.dw-season-bar__btn:hover { background:rgba(255,255,255,0.7); }
.dw-season-bar__btn--active { background:#E8688A; color:#1a1a1a; border-color:#E8688A; }
.dw-season-bar__btn--enter { background:linear-gradient(135deg,#F8829E,#E8688A); color:#1a1a1a; border:none; padding:8px 16px; font-size:15px; font-weight:700; box-shadow:0 2px 8px rgba(232,104,138,0.25); width:100%; justify-content:center; display:flex; }
.dw-season-bar__btn--enter:hover { box-shadow:0 4px 16px rgba(232,104,138,0.35); transform:translateY(-1px); }
.dw-season-bar__btn--hide { color:#C62828; border-color:rgba(198,40,40,0.3); }
.dw-season-bar__btn--unhide { color:#2E7D32; border-color:rgba(46,125,50,0.3); }
.dw-season-bar__btn:disabled { opacity:0.35; cursor:default; }
.dw-footer { padding:4px 10px 10px; text-align:center; font-size:13px; color:#B09AA6; }
.dw-footer a { color:#E8688A; text-decoration:none; }
      `;
      document.head.appendChild(style);
    },

    // --- 事件绑定 ---
    bindEvents() {
      const el = this.el;

      // 折叠按钮
      el.querySelector('.dw-btn-collapse').onclick = () => {
        const w = this.el;
        const btn = w.querySelector('.dw-btn-collapse');
        w.classList.toggle('collapsed');
        btn.classList.toggle('collapsed');
      };

      // 刷新按钮
      el.querySelector('.dw-btn-refresh').onclick = async (e) => {
        const btn = e.currentTarget;
        btn.classList.add('refreshing');
        try { await this.loadData(true); } catch {}
        btn.classList.remove('refreshing');
      };

      // Tab 切换
      el.querySelectorAll('.dw-tab').forEach(tab => {
        tab.onclick = () => {
          this.tab = tab.dataset.tab;
          el.querySelectorAll('.dw-tab').forEach(t => t.classList.toggle('dw-tab--active', t === tab));
          this.selectMode = false;
          this.selectedIds.clear();
          this.render();
        };
      });
    },

    // --- 数据加载 ---
    async loadData(force) {
      const loading = this.el.querySelector('.dw-loading');
      const content = this.el.querySelector('.dw-content');
      if (!loading || !content) return;
      loading.hidden = false; loading.textContent = '加载中...'; content.hidden = true;

      try {
        let data = force ? null : getCalendarCache();
        if (!data) { data = await fetchCalendar(); setCalendarCache(data); }
        if (!data || !Array.isArray(data)) throw new Error('数据格式异常');
        this.calendarData = data;
        this.hiddenIds = getHiddenList();
        this.render();
        loading.hidden = true; content.hidden = false;
      } catch (e) {
        loading.textContent = '加载失败: ' + e.message + '，请重试';
        loading.hidden = false; content.hidden = true;
      }
    },

    // --- 渲染 ---
    render() {
      const content = this.el.querySelector('.dw-content');
      if (this.tab === 'daily') this.renderDaily(content);
      else this.renderSeason(content);
    },

    renderDaily(container) {
      const todayId = getTodayWeekdayId();
      const yesterdayId = getYesterdayWeekdayId();
      const todayRaw = getAnimeByWeekday(this.calendarData, todayId);
      const yesterdayRaw = getAnimeByWeekday(this.calendarData, yesterdayId);

      const todayVis = todayRaw.filter(a => !this.hiddenIds.includes(a.id));
      const yesterdayVis = yesterdayRaw.filter(a => !this.hiddenIds.includes(a.id));
      const todayHid = todayRaw.filter(a => this.hiddenIds.includes(a.id));
      const yesterdayHid = yesterdayRaw.filter(a => this.hiddenIds.includes(a.id));

      const today = new Date();
      const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);

      let html = '';
      html += this.makeDaySection('昨天', '📺', yesterdayId, yesterdayVis, formatDateShort(yesterday), false);
      html += this.makeDaySection('今天', '🌟', todayId, todayVis, formatDateShort(today), true);

      // 已隐藏
      const allHidden = [...todayHid, ...yesterdayHid];
      if (allHidden.length > 0) {
        html += '<div class="dw-hidden-section">';
        html += '<button class="dw-hidden-btn"><span class="dw-hidden-chevron">▶</span> 已隐藏 (' + allHidden.length + ')</button>';
        html += '<div class="dw-cards" hidden style="margin-top:6px">';
        html += allHidden.map(a => this.makeCard(a, true)).join('');
        html += '</div></div>';
      }

      html += '<div class="dw-footer">数据来源 <a href="https://bgm.tv" target="_blank">Bangumi</a></div>';
      container.innerHTML = html;
      this.bindCardEvents(container);

      // 绑定隐藏分区折叠按钮
      const hiddenBtn = container.querySelector('.dw-hidden-btn');
      if (hiddenBtn) hiddenBtn.onclick = () => {
        hiddenBtn.classList.toggle('dw-hidden-btn--open');
        const list = hiddenBtn.nextElementSibling;
        if (list) list.hidden = !list.hidden;
      };
    },

    makeDaySection(title, icon, weekdayId, items, dateStr, isToday) {
      if (items.length === 0) return '';
      const dotClass = 'dw-day__dot--' + weekdayId;
      return '<div class="dw-day">' +
        '<div class="dw-day__header">' +
          '<span class="dw-day__dot ' + dotClass + '"></span>' +
          icon + ' ' + title + ' ' + (WEEKDAY_NAMES[weekdayId] || '') + ' · ' + dateStr +
          (isToday ? ' <span style="font-size:9px;color:#E8688A;background:rgba(232,104,138,0.1);padding:1px 5px;border-radius:99px;">NEW</span>' : '') +
          '<span class="dw-day__count">' + items.length + '部</span>' +
        '</div>' +
        '<div class="dw-cards">' + items.map(a => this.makeCard(a, false)).join('') + '</div>' +
      '</div>';
    },

    makeCard(anime, isHidden) {
      const cover = (anime.images && (anime.images.grid || anime.images.small)) || '';
      const score = anime.rating && anime.rating.score ? anime.rating.score.toFixed(1) : '';
      const cls = isHidden ? ' dw-card--hidden' : '';
      return '<div class="dw-card' + cls + '" data-id="' + anime.id + '" data-url="' + escapeHtml(anime.url) + '">' +
        '<img class="dw-card__cover" src="' + escapeHtml(cover) + '" loading="lazy" onerror="this.style.display=\'none\'">' +
        '<div class="dw-card__info">' +
          '<div class="dw-card__name-cn">' + escapeHtml(anime.nameCn) + '</div>' +
          (anime.name !== anime.nameCn ? '<div class="dw-card__name">' + escapeHtml(anime.name) + '</div>' : '') +
          '<div class="dw-card__meta">' + (score ? '<span class="dw-card__rating">⭐' + score + '</span>' : '') + '</div>' +
        '</div>' +
        '<div class="dw-card__actions">' +
          '<button class="dw-card__btn dw-card__btn--search" data-action="search" title="B站搜索">🔍</button>' +
          '<button class="dw-card__btn ' + (isHidden ? 'dw-card__btn--unhide' : 'dw-card__btn--hide') + '" data-action="hide" title="' + (isHidden ? '取消隐藏' : '隐藏') + '">' + (isHidden ? '👁‍🗨' : '👁') + '</button>' +
        '</div>' +
      '</div>';
    },

    bindCardEvents(container) {
      container.querySelectorAll('.dw-card').forEach(card => {
        const id = parseInt(card.dataset.id);
        const url = card.dataset.url;

        card.onclick = (e) => {
          if (e.target.closest('[data-action]')) return;
          if (this.selectMode) {
            this.selectedIds.has(id) ? this.selectedIds.delete(id) : this.selectedIds.add(id);
            card.classList.toggle('dw-card--checked', this.selectedIds.has(id));
            this.updateSeasonBar();
          } else {
            if (url) window.open(url, '_blank');
          }
        };

        // 搜索按钮
        const searchBtn = card.querySelector('[data-action="search"]');
        if (searchBtn) searchBtn.onclick = (e) => {
          e.stopPropagation();
          const name = card.querySelector('.dw-card__name-cn').textContent;
          window.open('https://search.bilibili.com/all?keyword=' + encodeURIComponent(name), '_blank');
        };

        // 隐藏按钮
        const hideBtn = card.querySelector('[data-action="hide"]');
        if (hideBtn) hideBtn.onclick = async (e) => {
          e.stopPropagation();
          toggleHideAnime(id);
          this.hiddenIds = getHiddenList();
          this.render();
        };
      });
    },

    // --- 本季视图 ---
    renderSeason(container) {
      if (!this.calendarData) return;

      const barHTML = this.selectMode
        ? '<div class="dw-season-bar" style="flex-wrap:wrap">' +
            '<span style="font-size:11px;color:#7A6572;">已选 <b>' + this.selectedIds.size + '</b> 部</span>' +
            '<button class="dw-season-bar__btn" id="dwSelectVisible">选中未隐藏</button>' +
            '<button class="dw-season-bar__btn" id="dwSelectHidden">选中已隐藏</button>' +
            '<button class="dw-season-bar__btn dw-season-bar__btn--hide" id="dwHideSel" disabled onclick="void(0)">隐藏选中</button>' +
            '<button class="dw-season-bar__btn dw-season-bar__btn--unhide" id="dwUnhideSel" disabled onclick="void(0)">取消隐藏</button>' +
            '<button class="dw-season-bar__btn" id="dwExitSelect" onclick="void(0)">退出选择</button>' +
          '</div>'
        : '<div class="dw-season-bar">' +
            '<button class="dw-season-bar__btn dw-season-bar__btn--enter" id="dwEnterSelect">📋 选择模式（批量隐藏）</button>' +
          '</div>';

      let html = barHTML;

      this.calendarData.forEach(day => {
        const wd = day.weekday;
        if (!wd || !day.items || day.items.length === 0) return;
        const vis = day.items.filter(a => !this.hiddenIds.includes(a.id));
        const hid = day.items.filter(a => this.hiddenIds.includes(a.id));
        const all = [...vis, ...hid];
        if (all.length === 0) return;

        html += '<div class="dw-day"><div class="dw-day__header">' +
          '<span class="dw-day__dot dw-day__dot--' + wd.id + '"></span>' +
          (WEEKDAY_NAMES[wd.id] || wd.cn || '') +
          '<span class="dw-day__count">' + all.length + '部</span></div>' +
          '<div class="dw-cards">' + all.map(a => this.makeCard(normalizeAnime(a), this.hiddenIds.includes(a.id))).join('') + '</div></div>';
      });

      html += '<div class="dw-footer">数据来源 <a href="https://bgm.tv" target="_blank">Bangumi</a></div>';
      container.innerHTML = html;
      this.bindCardEvents(container);
      this.bindSeasonEvents(container);
    },

    bindSeasonEvents(container) {
      // 进入选择模式
      const enterBtn = container.querySelector('#dwEnterSelect');
      if (enterBtn) enterBtn.onclick = () => { this.selectMode = true; this.selectedIds.clear(); this.render(); };

      // 退出选择模式
      const exitBtn = container.querySelector('#dwExitSelect');
      if (exitBtn) exitBtn.onclick = () => { this.selectMode = false; this.selectedIds.clear(); this.render(); };

      // 选中所有未隐藏
      const selectVisBtn = container.querySelector('#dwSelectVisible');
      if (selectVisBtn) selectVisBtn.onclick = () => {
        container.querySelectorAll('.dw-card:not(.dw-card--hidden)').forEach(c => this.selectedIds.add(parseInt(c.dataset.id)));
        this.render();
      };

      // 选中所有已隐藏
      const selectHidBtn = container.querySelector('#dwSelectHidden');
      if (selectHidBtn) selectHidBtn.onclick = () => {
        container.querySelectorAll('.dw-card.dw-card--hidden').forEach(c => this.selectedIds.add(parseInt(c.dataset.id)));
        this.render();
      };

      // 隐藏选中
      const hideBtn = container.querySelector('#dwHideSel');
      if (hideBtn) { hideBtn.onclick = () => this.bulkHide(); hideBtn.disabled = true; }

      // 取消隐藏
      const unhideBtn = container.querySelector('#dwUnhideSel');
      if (unhideBtn) { unhideBtn.onclick = () => this.bulkUnhide(); unhideBtn.disabled = true; }

      this.updateSeasonBar();
    },

    updateSeasonBar() {
      const hidCount = [...this.selectedIds].filter(id => this.hiddenIds.includes(id)).length;
      const visCount = this.selectedIds.size - hidCount;
      const bar = this.el.querySelector('.dw-season-bar');
      if (!bar) return;
      bar.querySelector('b').textContent = this.selectedIds.size;

      const hideBtn = bar.querySelector('#dwHideSel');
      const unhideBtn = bar.querySelector('#dwUnhideSel');
      if (hideBtn) hideBtn.disabled = visCount === 0;
      if (unhideBtn) unhideBtn.disabled = hidCount === 0;
    },

    async bulkHide() {
      const toHide = [...this.selectedIds].filter(id => !this.hiddenIds.includes(id));
      if (toHide.length === 0) return;
      this.hiddenIds = [...new Set([...this.hiddenIds, ...toHide])];
      setHiddenList(this.hiddenIds);
      this.selectedIds.clear();
      this.render();
    },

    async bulkUnhide() {
      const toUnhide = [...this.selectedIds].filter(id => this.hiddenIds.includes(id));
      if (toUnhide.length === 0) return;
      this.hiddenIds = this.hiddenIds.filter(id => !toUnhide.includes(id));
      setHiddenList(this.hiddenIds);
      this.selectedIds.clear();
      this.render();
    },
  };

  // ============================================================
  // 启动
  // ============================================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => DailyWidget.init());
  } else {
    DailyWidget.init();
  }
})();
