'use strict';

function $(sel, root) { return (root || document).querySelector(sel); }
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
/* -------------------------------------------------------------------------mini-markdown-------------------*/
function renderMiniMarkdown(text) {
  if (!text) return '';
  const lines = String(text).split('\n');
  let html = '';
  let buffer = [];

  function inline(s) {
    return s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }
  function flushP() {
    if (buffer.length) {
      html += '<p>' + buffer.join('<br>') + '</p>';
      buffer = [];
    }
  }

  for (const raw of lines) {
    const line = escapeHtml(raw);
    let m;
    if (!line.trim()) { flushP(); continue; }

    if ((m = line.match(/^###\s+(.*)$/))) { flushP(); html += '<h5>' + inline(m[1]) + '</h5>'; }
    else if ((m = line.match(/^##\s+(.*)$/))) { flushP(); html += '<h4>' + inline(m[1]) + '</h4>'; }
    else if ((m = line.match(/^#\s+(.*)$/))) { flushP(); html += '<h3>' + inline(m[1]) + '</h3>'; }
    else buffer.push(inline(line));
  }
  flushP();
  return html;
}

function toUrl(p) { return String(p).split('/').map(encodeURIComponent).join('/'); }
function debounce(fn, ms) { let t; return function () { clearTimeout(t); t = setTimeout(() => fn.apply(this, arguments), ms); }; }
function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
function formatSize(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(2) + ' MB';
}
function touchDist(a) { const dx = a[0].clientX - a[1].clientX, dy = a[0].clientY - a[1].clientY; return Math.sqrt(dx * dx + dy * dy); }

const DATA = (window.__DATA__ && window.__DATA__.items) ? window.__DATA__ : null;

/*---------------------------------------------------------------------------------------------------0922--------大标转转转-------------*/
const title = document.querySelector('.brand h1');
const TITLE_HETUN_WINDOW = 1000;
const TITLE_HETUN_HITS = 6;
const TITLE_HETUN_TIME = 9000;

let titleClickTimes = [];
let titleHetunTimer = 0;

title.addEventListener('click', () => {
  const now = Date.now();
  titleClickTimes = titleClickTimes.filter(ts => now - ts < TITLE_HETUN_WINDOW);
  titleClickTimes.push(now);

  /* ---持续转转转--- */
  if (titleClickTimes.length >= TITLE_HETUN_HITS) {
    titleClickTimes = [];
    title.classList.remove('spin-once');
    void title.offsetWidth;
    title.classList.add('spin-Hetun');
    clearTimeout(titleHetunTimer);
    titleHetunTimer = setTimeout(() => {
      title.classList.remove('spin-Hetun');
    }, TITLE_HETUN_TIME);
    return;
  }

  /* ---单次转转转--- */
  title.classList.remove('spin-once');
  void title.offsetWidth;
  title.classList.add('spin-once');
  title.addEventListener('animationend', () => {
    title.classList.remove('spin-once');
  }, { once: true });
});
/*------------------------------------------------------------------------i18n-i18n-i18n-------------*/
const LANG = (window.__LANG__ && window.__LANG__.zh) ? window.__LANG__ : { zh: {}, en: {} };
const LANGS = ['zh', 'en'];
let currentLang = (function () {
  const saved = localStorage.getItem('lang');
  if (LANGS.indexOf(saved) !== -1) return saved;
  return (navigator.language || 'zh').toLowerCase().indexOf('zh') === 0 ? 'zh' : 'en';
})();
function t(key) {
  const d = LANG[currentLang] || {};
  return d[key] != null ? d[key] : (LANG.zh[key] != null ? LANG.zh[key] : key);
}

if (!DATA) {
  document.body.innerHTML = '<div style="padding:3em;text-align:center"><p>' + t('dataMissing') + '</p></div>';
  throw new Error('index data missing');
}
document.title = (window.__DATA__.title || '赛博史记') + ' ' + t('titleSuffix');
$('#site-title').textContent = (window.__DATA__.title || '赛博史记') + ' ' + t('titleSuffix');
if (window.__DATA__.subtitle) $('#site-sub').textContent = window.__DATA__.subtitle;

const state = { query: '', scope: 'all', year: null, folder: null, sort: 'time' };
const BATCH = 96;
const MAX_TALL_WIDTH = 900;
const SWIPE_MIN = 70, SWIPE_TIME = 600, SWIPE_RATIO = 1.5;
let filtered = [];
let rendered = 0;
let commandMode = false;
let commandBuffer = '';

const grid = $('#grid'), sentinel = $('#sentinel'), emptyEl = $('#empty'),
  loadingEl = $('#loading'), statsEl = $('#stats'), chipsEl = $('#chips'),
  searchInput = $('#search'), themeBtn = $('#theme-btn'), langBtn = $('#lang-btn');

/*-------------------------------------------------------------------------语言---------------------------------------*/
function applyLang() {
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  langBtn.textContent = currentLang === 'zh' ? 'EN' : (currentLang === 'ht' ? 'HT' : 'CN');
  document.documentElement.lang = currentLang;
  document.title = (window.__DATA__.title || '赛博史记') + ' ' + t('titleSuffix');
  $('#site-title').textContent = (window.__DATA__.title || '赛博史记') + ' ' + t('titleSuffix');
  if (viewerErrorKey) setErrorText(viewerErrorKey);
  const footerA = document.getElementById('footerA');
  if (footerA) {
    footerA.textContent = t('footerA');
  }
  const footerB = document.getElementById('footerB');
  if (footerB) {
    footerB.textContent = t('footerB');
  }
  const footerC = document.getElementById('footerC');
  if (footerC) {
    footerC.textContent = t('footerC');
  }
  const buildTimeEl = document.getElementById('build-time');
  if (buildTimeEl && window.__DATA__ && window.__DATA__.generated) {
    buildTimeEl.textContent = t('BuildTime') + ' ' + window.__DATA__.generated;
  }
  /*--------0923-------日志按钮------*/
  /*
  const logBtn = document.getElementById('log-btn');
  function openLogModal() {
    renderLogs();
    logModal.classList.add('show');
    document.body.style.overflow = 'hidden';
  }
  function closeLogModal() {
    logModal.classList.remove('show');
    document.body.style.overflow = '';
  }
  if (logBtn) logBtn.addEventListener('click', openLogModal);
  document.getElementById('log-close').addEventListener('click', closeLogModal);
  logModal.addEventListener('click', e => {
    if (e.target === logModal) closeLogModal();
  });*/
  /*-------------无logs键时隐藏日志按钮------------0925-2--------------*/
  const logBtnEl = document.getElementById('log-btn');
  if (logBtnEl) {
    const LOGS = window.__LOGS__ || {};
    logBtnEl.hidden = !LOGS[currentLang];
  }
}

langBtn.addEventListener('click', () => {
  currentLang = currentLang === 'zh' ? 'en' : 'zh';
  localStorage.setItem('lang', currentLang);
  applyLang();
  render();
});

/*-----------------------------------------------亮暗主题-------------------------------*/
function initTheme() {
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
}
const darkModeMedia = window.matchMedia('(prefers-color-scheme: dark)');
darkModeMedia.addEventListener('change', (e) => {
  document.documentElement.dataset.theme = e.matches ? 'dark' : 'light';
  localStorage.setItem('theme', e.matches ? 'dark' : 'light');
});
themeBtn.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('theme', next);
});
initTheme();

/* -------------------------------------------------------------------------------------------------------------------------------------- */
function buildChips() {
  const years = [], folders = [];
  for (const it of DATA.items) {
    if (it.year && !years.includes(it.year)) years.push(it.year);
    if (it.folder && !folders.includes(it.folder)) folders.push(it.folder);
  }
  years.sort().reverse();
  folders.sort();
  const featuredCnt = DATA.items.filter(i => i.featured).length;
  const recentCnt = DATA.items.filter(i => i.recent).length;
  let html = '';
  html += chipHTML('scope', 'all', t('allLabel'), DATA.items.length, state.scope === 'all');
  if (recentCnt > 0) html += chipHTML('scope', 'recent', t('recentLabel'), recentCnt, state.scope === 'recent');
  html += chipHTML('scope', 'featured', t('featuredLabel'), featuredCnt, state.scope === 'featured');
  html += '<span class="chip-group-label">' + t('sortLabel') + '</span>';
  html += chipHTML('sort', 'time', t('sortTime'), '', state.sort === 'time');
  html += chipHTML('sort', 'az', t('sortAZ'), '', state.sort === 'az');
  html += chipHTML('sort', 'za', t('sortZA'), '', state.sort === 'za');
  if (years.length > 1) {
    html += '<span class="chip-group-label">' + t('yearLabel') + '</span>';
    for (const y of years) {
      const cnt = DATA.items.filter(i => i.year === y).length;
      html += chipHTML('year', y, y, cnt, state.year === y);
    }
  }
  if (folders.length > 1) {
    html += '<span class="chip-group-label">' + t('folderLabel') + '</span>';
    for (const f of folders) {
      const cnt = DATA.items.filter(i => i.folder === f).length;
      html += chipHTML('folder', f, f, cnt, state.folder === f);
    }
  }
  chipsEl.innerHTML = html;
}
function chipHTML(group, value, label, cnt, active) {
  return '<button class="chip' + (active ? ' active' : '') + '" data-group="' + group +
    '" data-value="' + value + '" type="button"><span>' + escapeHtml(label) +
    (cnt !== '' ? '<span class="cnt">' + cnt + '</span>' : '') + '</button>';
}
chipsEl.addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  const group = chip.dataset.group, value = chip.dataset.value;
  if (group === 'sort') {
    state.sort = value;
  } else if (group === 'scope' && value === 'all') {
    state.scope = 'all'; state.year = null; state.folder = null;
  } else if (state[group] === value) {
    state[group] = group === 'scope' ? 'all' : null;
  } else {
    state[group] = value;
  }
  render();
});

/* -------------------------------------------------------------------------------------------------------------------------------------- */
function computeFiltered() {
  const q = state.query.trim().toLowerCase();
  let list = DATA.items;
  if (state.scope === 'recent') list = list.filter(it => it.recent);
  if (state.scope === 'featured') list = list.filter(it => it.featured);
  if (state.year) list = list.filter(it => it.year === state.year);
  if (state.folder) list = list.filter(it => it.folder === state.folder);
  if (q) {
    list = list.filter(it => (it.name + ' ' + (it.tags || []).join(' ') + ' ' +
      (it.people || []).join(' ') + ' ' + it.file).toLowerCase().indexOf(q) !== -1);
  }
  return sortItems(list);
}
function nameCmp(x, y) {
  const xn = /^[0-9]/.test(x), yn = /^[0-9]/.test(y);
  if (xn !== yn) return xn ? -1 : 1;
  return x.localeCompare(y, 'zh-Hans-CN');
}
function sortItems(list) {
  if (state.sort === 'az') return list.slice().sort((a, b) => nameCmp(a.name, b.name));
  if (state.sort === 'za') return list.slice().sort((a, b) => nameCmp(b.name, a.name));
  return list;
}
function tileHTML(item, i) {
  const star = item.featured ? `
  <span class="tile-tag">
    <svg viewBox="0 0 24 24" width="24" height="24" fill="#ffde4d" stroke="none">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/> 
    </svg>
  </span>
` : '';  /*---图库右上角的精选SVG图标---0925---*/
  const long = item.long ? '<span class="tile-long">' + t('longLabel') + '</span>' : '';
  let displayName = item.name;
  if (currentLang === 'ht') {
    displayName = `🐡 ${displayName.split('').reverse().join('')} 🐡`;
  }
  return '<button class="tile" role="listitem" data-i="' + i + '" type="button">' +
    '<span class="thumb">' + star + long +
    '<img data-src="' + toUrl(item.thumb) + '" alt="' + escapeHtml(item.name) + '" loading="lazy" decoding="async">' +
    '</span><span class="tile-name">' + escapeHtml(displayName) + '</span></button>';
}
const io = new IntersectionObserver(entries => {
  for (const en of entries) {
    const el = en.target;
    if (el === sentinel) { if (en.isIntersecting) loadMore(); continue; }
    if (en.isIntersecting && el.dataset.src && !el.src) { el.src = el.dataset.src; io.unobserve(el); }
  }
}, { rootMargin: '240px 0px' });
function observeImgs() {
  const imgs = grid.querySelectorAll('img[data-src]');
  for (const img of imgs) io.observe(img);
  io.observe(sentinel);
}
function render() {
  buildChips();
  filtered = computeFiltered();
  grid.innerHTML = '';
  rendered = 0;
  loadMore();
}
/*-----0925---滚动条显隐--------*/
(function () {
  const KEY = 'showScrollbar';
  const sw = document.getElementById('scrollbar-switch');
  const row = document.getElementById('scrollbar-switch-row');
  if (!sw) return;

  function syncScrollbarWidth() {
    const w = window.innerWidth - document.documentElement.clientWidth;
    document.documentElement.style.setProperty('--sbw', w + 'px');
  }

  function apply() {
    const on = localStorage.getItem(KEY) === '1';
    document.documentElement.classList.toggle('show-scrollbar', on);
    sw.setAttribute('aria-checked', on ? 'true' : 'false');
    requestAnimationFrame(syncScrollbarWidth);
  }

  apply();

  function toggle(e) {
    e.stopPropagation();
    const on = sw.getAttribute('aria-checked') === 'true';
    localStorage.setItem(KEY, on ? '0' : '1');
    apply();
  }
  sw.addEventListener('click', toggle);
  if (row) row.addEventListener('click', e => {
    if (sw.contains(e.target)) return;
    toggle(e);
  });
})();
function loadMore() {
  const end = Math.min(rendered + BATCH, filtered.length);
  let html = '';
  for (let i = rendered; i < end; i++) html += tileHTML(filtered[i], i);
  grid.insertAdjacentHTML('beforeend', html);
  rendered = end;
  emptyEl.hidden = filtered.length > 0;
  loadingEl.hidden = rendered >= filtered.length;
  statsEl.textContent = t('stats').replace('{total}', DATA.items.length).replace('{shown}', filtered.length);
  observeImgs();
}
grid.addEventListener('click', e => {
  const tile = e.target.closest('.tile');
  if (tile) openViewer(parseInt(tile.dataset.i, 10));
});
grid.addEventListener('load', e => {
  if (e.target.tagName === 'IMG' && e.target.closest('.thumb')) e.target.classList.add('loaded');
}, true);
grid.addEventListener('error', e => {
  if (e.target.tagName === 'IMG' && e.target.closest('.thumb')) {
    e.target.remove();
    e.target.closest('.thumb').classList.add('failed');
  }
}, true);

/*-----------------------------------------原图查看器------------------------------------------ */
const viewer = $('#viewer'), vImg = $('#v-img'), vStage = $('#v-stage'),
  vLoading = $('#v-loading'), vError = $('#v-error'), vErrorText = $('#v-error-text'),
  vName = $('#viewer-name'), vMeta = $('#viewer-meta'), vCounter = $('#v-counter');
let viewerList = [], viewerIndex = 0, zoom = 1, loadToken = 0;
let viewerErrorKey = null;
let viewerOpenedAt = 0;
let viewerHistoryPushed = false;

function setErrorText(key) {
  viewerErrorKey = key;
  vErrorText.textContent = t(key);
}

function openViewer(idx) {
  if (!filtered.length) return;
  viewerList = filtered;
  viewerIndex = clamp(idx, 0, viewerList.length - 1);
  viewerOpenedAt = performance.now();
  viewer.classList.add('open');
  document.body.style.overflow = 'hidden';
  loadIntoViewer(viewerList[viewerIndex]);
  history.pushState({ viewer: true }, '');
  viewerHistoryPushed = true;
}
function closeViewer(fromPopstate) {
  if (!fromPopstate && viewerHistoryPushed) {
    viewerHistoryPushed = false;
    history.back();
    return;
  }
  viewerHistoryPushed = false;
  viewer.classList.remove('open');
  document.body.style.overflow = '';
  vImg.removeAttribute('src');
  zoom = 1;
}
function loadIntoViewer(item) {
  const token = ++loadToken;
  vError.classList.remove('show');
  vLoading.classList.add('show');
  vName.textContent = item.name;
  vMeta.textContent = (item.width && item.height ? item.width + '×' + item.height + ' · ' : '') +
    (item.size ? formatSize(item.size) + ' · ' : '') + item.file;
  vCounter.textContent = (viewerIndex + 1) + ' / ' + viewerList.length;

  vImg.className = (item.height > item.width) ? 'tall' : 'wide';
  zoom = 1;
  vImg.removeAttribute('src');

  if (navigator.onLine === false) {
    vLoading.classList.remove('show');
    setErrorText('noNetwork');
    vError.classList.add('show');
    return;
  }

  const full = new Image();
  full.onload = function () {
    if (token !== loadToken) return;
    vImg.src = full.src;
    vLoading.classList.remove('show');
    applyZoom();
    const fileName = item.file.toLowerCase();/*------------------河豚瞎几把乱飞彩蛋--触发几率2.5%---------------------*/
    if (fileName.includes('河豚') && Math.random() < 0.025) {
      const now = Date.now();
      if (!window._pufferEggCooldown || now - window._pufferEggCooldown > 10000) {
        window._pufferEggCooldown = now;
        triggerBakaEgg(100);
      }
    }
  };
  full.onerror = function () { };

  full.src = toUrl(item.file);

  vStage.scrollTop = 0;
  const prevBtn = document.getElementById('v-prev');
  const nextBtn = document.getElementById('v-next');
  if (prevBtn && nextBtn) {
    prevBtn.classList.remove('dim');
    nextBtn.classList.remove('dim');
    void prevBtn.offsetWidth;
    clearTimeout(loadIntoViewer._dimTimer);
    loadIntoViewer._dimTimer = setTimeout(() => {
      prevBtn.classList.add('dim');
      nextBtn.classList.add('dim');
    }, 1500);
  }
  vStage.scrollLeft = 0;
  if (viewerIndex + 1 < viewerList.length) {
    const nxt = new Image();
    nxt.src = toUrl(viewerList[viewerIndex + 1].file);
  }
}

function applyZoom() {
  const item = viewerList[viewerIndex];
  if (!item || !item.width || !item.height) return;
  const stageW = vStage.clientWidth, stageH = vStage.clientHeight;
  const ratio = item.width / item.height;
  const isMobile = window.matchMedia('(max-width: 640px)').matches;
  let vw, vh;
  if (isMobile) {
    vw = stageW * zoom;
    vh = vw / ratio;
  } else if (item.height > item.width) {
    vw = Math.min(stageW, MAX_TALL_WIDTH) * zoom;
    vh = vw / ratio;
  } else {
    const wAtFullH = stageH * ratio;
    if (wAtFullH <= stageW) { vh = stageH * zoom; vw = vh * ratio; }
    else { vw = stageW * zoom; vh = vw / ratio; }
  }
  vImg.style.width = vw + 'px';
  vImg.style.height = vh + 'px';
  vStage.classList.toggle('draggable', vw > stageW + 1);
}
function zoomBy(f) { zoom = clamp(zoom * f, 0.2, 10); applyZoom(); }
function stepViewer(d) {
  const i = viewerIndex + d;
  if (i >= 0 && i < viewerList.length) { viewerIndex = i; loadIntoViewer(viewerList[i]); }
}

$('#v-close').addEventListener('click', closeViewer);
$('#v-prev').addEventListener('click', () => stepViewer(-1));
$('#v-next').addEventListener('click', () => stepViewer(1));
$('#v-zoom-in').addEventListener('click', () => zoomBy(1.25));
$('#v-zoom-out').addEventListener('click', () => zoomBy(0.8));
$('#v-zoom-reset').addEventListener('click', () => { zoom = 1; applyZoom(); });
$('#v-retry').addEventListener('click', () => { if (viewerList.length) loadIntoViewer(viewerList[viewerIndex]); });

document.addEventListener('keydown', e => {
  if (!viewer.classList.contains('open')) return;
  if (e.key === 'Escape') closeViewer();
  else if (e.key === 'ArrowLeft') stepViewer(-1);
  else if (e.key === 'ArrowRight') stepViewer(1);
});
/*--------单--------*/
const isTouchEnv = window.matchMedia('(hover: none)').matches;

let vDownX = 0, vDownY = 0;
let stageClickTimer = 0;

vStage.addEventListener('pointerdown', e => {
  vDownX = e.clientX;
  vDownY = e.clientY;
});

vStage.addEventListener('click', e => {
  if (e.target !== vStage) return;
  if (e.detail > 1) {
    clearTimeout(stageClickTimer);
    return;
  }
  const dx = e.clientX - vDownX;
  const dy = e.clientY - vDownY;
  if (dx * dx + dy * dy > 25) return;
  stageClickTimer = setTimeout(closeViewer, 50);/*---------空白处-原图关闭延迟-------092*----*/
});

/*--------双--------*/
vStage.addEventListener('dblclick', e => {
  if (isTouchEnv) return;
  if (e.target !== vImg) return;
  e.preventDefault();
  if (performance.now() - viewerOpenedAt < 500) return; /*-------------在原图查看器打开的500ms内忽略点击---------*/
  clearTimeout(stageClickTimer);

  const sel = window.getSelection();
  if (sel) sel.removeAllRanges();

  if (zoom > 1.8) {
    zoom = 1;
    applyZoom();
    return;
  }

  const rect = vStage.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  const oldZoom = zoom;
  zoom = clamp(zoom * 2, 0.2, 10);
  const k = zoom / oldZoom;

  const oldSx = vStage.scrollLeft;
  const oldSy = vStage.scrollTop;
  applyZoom();
  vStage.scrollLeft = (oldSx + px) * k - px;
  vStage.scrollTop = (oldSy + py) * k - py;
});
vStage.addEventListener('wheel', e => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  zoomBy(e.deltaY < 0 ? 1.1 : 0.9);
}, { passive: false });

/*----------------------------------图片缩放--------------------------------------*/
let pinchDist = 0, swipeX = 0, swipeY = 0, swipeT = 0, swipeActive = false;
let dragging = false;
let dragPointerId = null;
let dragStartX = 0, dragStartY = 0;
let dragStartScrollLeft = 0, dragStartScrollTop = 0;
let lastMoveX = 0, lastMoveY = 0, lastMoveT = 0;
let velocityX = 0, velocityY = 0;
let inertiaRAF = 0;

vStage.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'mouse') return;
  if (e.button !== 0) return;
  dragging = false;
  dragPointerId = e.pointerId;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  dragStartScrollLeft = vStage.scrollLeft;
  dragStartScrollTop = vStage.scrollTop;
  lastMoveX = e.clientX;
  lastMoveY = e.clientY;
  lastMoveT = performance.now();
  velocityX = 0;
  velocityY = 0;
  cancelAnimationFrame(inertiaRAF);
});

vStage.addEventListener('pointermove', e => {
  if (e.pointerId !== dragPointerId) return;

  if (!dragging) {
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    if (dx * dx + dy * dy < 25) return;
    dragging = true;
    vStage.setPointerCapture(e.pointerId);
    vStage.classList.add('dragging');
  }

  const now = performance.now();
  const dt = Math.max(1, now - lastMoveT);
  velocityX = (e.clientX - lastMoveX) / dt * 16;
  velocityY = (e.clientY - lastMoveY) / dt * 16;
  lastMoveX = e.clientX;
  lastMoveY = e.clientY;
  lastMoveT = now;

  vStage.scrollLeft = dragStartScrollLeft - (e.clientX - dragStartX);
  vStage.scrollTop = dragStartScrollTop - (e.clientY - dragStartY);
  e.preventDefault();
});

function endDrag(e) {
  if (e.pointerId !== dragPointerId) return;
  dragPointerId = null;
  if (!dragging) return;
  dragging = false;
  vStage.classList.remove('dragging');
  /*
  vStage._suppressClick = true;
  clearTimeout(vStage._suppressClickTimer);
  vStage._suppressClickTimer = setTimeout(() => {
    vStage._suppressClick = false;
  }, 120);
*/
  let vx = velocityX, vy = velocityY;
  function tick() {
    vx *= 0.92;
    vy *= 0.92;
    if (Math.abs(vx) < 0.5 && Math.abs(vy) < 0.5) return;
    vStage.scrollLeft -= vx;
    vStage.scrollTop -= vy;
    inertiaRAF = requestAnimationFrame(tick);
  }
  inertiaRAF = requestAnimationFrame(tick);
}

vStage.addEventListener('pointerup', endDrag);
vStage.addEventListener('pointercancel', endDrag);
vStage.addEventListener('touchstart', e => {
  if (e.touches.length === 2) { pinchDist = touchDist(e.touches); swipeActive = false; return; }
  if (e.touches.length === 1) {
    swipeX = e.touches[0].clientX;
    swipeY = e.touches[0].clientY;
    swipeT = Date.now();
    swipeActive = true;
  }
}, { passive: true });
vStage.addEventListener('touchmove', e => {
  if (e.touches.length === 2) {
    const d = touchDist(e.touches);
    if (pinchDist > 0) zoomBy(d / pinchDist);
    pinchDist = d;
  }
}, { passive: true });
vStage.addEventListener('touchend', e => {
  pinchDist = 0;
  if (!swipeActive || e.changedTouches.length !== 1) return;
  const dx = e.changedTouches[0].clientX - swipeX;
  const dy = e.changedTouches[0].clientY - swipeY;
  const dt = Date.now() - swipeT;
  swipeActive = false;
  if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO || dt > SWIPE_TIME) return;
  if (vImg.offsetWidth > vStage.clientWidth + 1) return;
  if (dx < 0) stepViewer(1); else stepViewer(-1);
}, { passive: true });

window.addEventListener('resize', debounce(() => { if (viewer.classList.contains('open')) applyZoom(); }, 120));

/*--------------------------左下菜单----------------------------*/
const menuBtn = $('#menu-btn'), menuEl = $('#menu'), aboutModal = $('#about-modal');
function showMenu(show) {
  menuEl.classList.toggle('show', show);
  menuBtn.setAttribute('aria-expanded', show ? 'true' : 'false');
  if (show) clearTimeout(menuHideTimer);
}
menuBtn.addEventListener('click', e => {
  e.stopPropagation();
  showMenu(!menuEl.classList.contains('show'));
});
let menuHideTimer = 0;

function scheduleHideMenu() {
  clearTimeout(menuHideTimer);
  menuHideTimer = setTimeout(() => showMenu(false), 1000);
}
function cancelHideMenu() {
  clearTimeout(menuHideTimer);
}
/*--------------------0924------------离开焦点延迟1秒收回----------*/
menuBtn.addEventListener('mouseenter', cancelHideMenu);
menuEl.addEventListener('mouseenter', cancelHideMenu);
menuBtn.addEventListener('mouseleave', scheduleHideMenu);
menuEl.addEventListener('mouseleave', scheduleHideMenu);

document.addEventListener('focusin', e => {
  if (menuBtn.contains(e.target) || menuEl.contains(e.target)) cancelHideMenu();
});
document.addEventListener('focusout', e => {
  if (!menuEl.classList.contains('show')) return;
  const to = e.relatedTarget;
  if (to && (menuBtn.contains(to) || menuEl.contains(to))) return;
  scheduleHideMenu();
});
document.addEventListener('click', e => {
  if (menuEl.classList.contains('show') && !menuEl.contains(e.target) && e.target !== menuBtn) showMenu(false);
});
$('#menu-about').addEventListener('click', () => {
  showMenu(false);
  aboutModal.classList.add('show');
  history.pushState({ aboutModal: true }, '');
});
$('#about-close').addEventListener('click', () => aboutModal.classList.remove('show'));
aboutModal.addEventListener('click', e => { if (e.target === aboutModal) aboutModal.classList.remove('show'); });

window.addEventListener('scroll', () => {
  const scrollY = window.scrollY;
  const windowHeight = window.innerHeight;
  const documentHeight = document.documentElement.scrollHeight;
  const atTop = scrollY <= 200;
  const atBottom = scrollY + windowHeight >= documentHeight - 200;
  const shouldHide = !(atTop || atBottom);
  menuBtn.classList.toggle('hidden', shouldHide);
  if (shouldHide) {
    menuEl.classList.remove('show');
    aboutModal.classList.remove('show');
    const lm = document.getElementById('log-modal');
    if (lm && lm.classList.contains('show')) {
      lm.classList.remove('show');
      document.body.style.overflow = '';
    }
  }

}, { passive: true });
/*-----------------0925------------------*/
window.addEventListener('popstate', function (e) {
  const lm = document.getElementById('log-modal');
  /*----------日志窗口回退-------*/
  if (lm && lm.classList.contains('show')) {
    closeLogModal(true);
    return;
  }
  if (aboutModal.classList.contains('show')) {
    aboutModal.classList.remove('show');
    return;
  }
  if (viewer.classList.contains('open')) {
    closeViewer(true);
  }
});
/*--------0923-----日志弹窗--------*/
const logModal = document.getElementById('log-modal');
const logBody = document.getElementById('log-body');
const logBtn = document.getElementById('log-btn');

function renderLogs() {
  const LOGS = window.__LOGS__ || {};/*------------------独立logs----0925---*/
  const data = LOGS[currentLang] || '';
  logBody.innerHTML = renderMiniMarkdown(data);
}

let logHistoryPushed = false;

function openLogModal() {
  renderLogs();
  logModal.classList.add('show');
  document.body.style.overflow = 'hidden';
  history.pushState({ logModal: true }, '');
  logHistoryPushed = true;
}

function closeLogModal(fromPopstate) {
  if (!fromPopstate && logHistoryPushed) {
    logHistoryPushed = false;
    history.back();
    return;
  }
  logHistoryPushed = false;
  logModal.classList.remove('show');
  document.body.style.overflow = '';
}
/*---河豚干的
function closeLogModal() {
  logModal.classList.remove('show');
  document.body.style.overflow = '';
}
*/
if (logBtn) {
  logBtn.addEventListener('click', openLogModal);
}
document.getElementById('log-close').addEventListener('click', closeLogModal);
logModal.addEventListener('click', e => {
  if (e.target === logModal) closeLogModal();
});

/*------------------河豚--搜索--指令--------*/
searchInput.addEventListener('input', function (e) {
  const val = this.value;
  if (val.startsWith('/')) {
    commandMode = true;
    commandBuffer = val.slice(1);
    return;
  }
  if (commandMode) {
    commandMode = false;
    commandBuffer = '';
    if (val.trim()) {
      state.query = val;
      render();
    } else {
      state.query = '';
      render();
    }
    return;
  }
  state.query = val;
  render();
});

/*---------------------键盘事件-------------------*/
searchInput.addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && commandMode) {
    const fullCmd = '/' + commandBuffer;
    const match = fullCmd.match(/^\/hetun\s*(\d*)$/);
    if (match) {
      const count = match[1] ? parseInt(match[1]) : 100;
      if (count > 0) {
        triggerBakaEgg(count);
      }
      this.value = '';
    } else {
      this.value = '';
    }
    commandMode = false;
    commandBuffer = '';
    state.query = '';
    render();
    e.preventDefault();
  } else if (e.key === 'Escape' && commandMode) {
    this.value = '';
    commandMode = false;
    commandBuffer = '';
    state.query = '';
    render();
    e.preventDefault();
  }
});

searchInput.addEventListener('blur', function () {
  if (commandMode) {
    this.value = '';
    commandMode = false;
    commandBuffer = '';
    state.query = '';
    render();
  }
});

/* -----------------------------------------------------------------------------------------河豚|图标------------------------------------ */
let bakaContainer = null;
let bakaTimer = null;

function triggerBakaEgg(count) {
  if (currentLang === 'ht') return;
  currentLang = 'ht';
  applyLang();
  render()

  if (bakaContainer) {
    bakaContainer.remove();
    bakaContainer = null;
  }
  if (bakaTimer) {
    clearTimeout(bakaTimer);
    bakaTimer = null;
  }

  const container = document.createElement('div');
  container.className = 'baka-container';
  document.body.appendChild(container);
  bakaContainer = container;
  document.body.classList.add('baka-gold');
  setTimeout(() => document.body.classList.remove('baka-gold'), 6500);/*-------0922---顶栏底部线条动效--------*/

  const fragment = document.createDocumentFragment();
  const src = './hetun.png';
  const keyframes = ['fly1', 'fly2', 'fly3', 'fly4', 'fly5', 'fly6', 'fly7', 'fly8', 'fly9', 'fly10', 'fly11', 'fly12', 'fly13', 'fly14', 'fly15', 'fly16', 'fly17', 'fly18', 'fly19', 'fly20'];
  const isMobile = window.matchMedia('(max-width: 640px)').matches;
  const maxCount = Math.min(count, isMobile ? 30 : 200);

  for (let i = 0; i < maxCount; i++) {
    const img = document.createElement('img');
    img.src = src;
    img.className = 'baka-fish';
    const animName = keyframes[Math.floor(Math.random() * keyframes.length)];
    const duration = 2 + Math.random() * 3;
    const delay = Math.random() * 1.5;
    const side = Math.floor(Math.random() * 4);
    const w = window.innerWidth, h = window.innerHeight;
    let x, y;
    switch (side) {
      case 0: x = -80 - Math.random() * 200; y = Math.random() * h; break;
      case 1: x = w + 80 + Math.random() * 200; y = Math.random() * h; break;
      case 2: x = Math.random() * w; y = -80 - Math.random() * 200; break;
      case 3: x = Math.random() * w; y = h + 80 + Math.random() * 200; break;
    }
    img.style.left = x + 'px';
    img.style.top = y + 'px';
    img.style.animation = `${animName} ${duration}s linear ${delay}s forwards`;
    const size = 30 + Math.random() * 50;
    img.style.width = size + 'px';
    img.style.transform = `rotate(${Math.random() * 360}deg)`;
    fragment.appendChild(img);
  }
  container.appendChild(fragment);

  const maxDuration = 5 + 3;
  bakaTimer = setTimeout(() => {
    if (bakaContainer) {
      bakaContainer.remove();
      bakaContainer = null;
    }
    bakaTimer = null;
  }, maxDuration * 2000);
};

applyLang();
buildChips();
render();

/*
(function () {
  const puffer = document.getElementById('scroll-puffer');
  if (!puffer) return;

  const TRACK_TOP_PCT = 0.15;
  const TRACK_BOTTOM_PCT = 0.85;
  let raf = 0;

  function update() {
    raf = 0;
    const vh = window.innerHeight;
    const maxScroll = document.documentElement.scrollHeight - vh;
    const progress = maxScroll > 0 ? window.scrollY / maxScroll : 0;

    const trackTop = vh * TRACK_TOP_PCT;
    const trackBottom = vh * TRACK_BOTTOM_PCT;
    const iconH = puffer.offsetHeight || 24;
    const usable = trackBottom - trackTop - iconH;
    const y = trackTop + progress * Math.max(0, usable);

    puffer.style.transform = `translateY(${y}px)`;
  }

  function schedule() {
    if (!raf) raf = requestAnimationFrame(update);
  }

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  update();
})();
*/