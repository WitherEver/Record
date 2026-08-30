'use strict';

function $(sel, root) { return (root || document).querySelector(sel); }
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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

/* ---- 数据 ---- */
const DATA = (window.__DATA__ && window.__DATA__.items) ? window.__DATA__ : null;

/* ---- i18n ---- */
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
$('#site-title').textContent = window.__DATA__.title || '赛博史记';
if (window.__DATA__.subtitle) $('#site-sub').textContent = window.__DATA__.subtitle;

/* ---- 状态 ---- */
const state = { query: '', scope: 'all', year: null, folder: null, sort: 'time' };
const BATCH = 96;
const MAX_TALL_WIDTH = 900;
const SWIPE_MIN = 70, SWIPE_TIME = 600, SWIPE_RATIO = 1.5;
let filtered = [];
let rendered = 0;

/* ---- DOM ---- */
const grid = $('#grid'), sentinel = $('#sentinel'), emptyEl = $('#empty'),
  loadingEl = $('#loading'), statsEl = $('#stats'), chipsEl = $('#chips'),
  searchInput = $('#search'), themeBtn = $('#theme-btn'), langBtn = $('#lang-btn');

/* ---- 语言 ---- */
function applyLang() {
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  langBtn.textContent = currentLang === 'zh' ? 'EN' : '中文';
  document.documentElement.lang = currentLang;
  document.title = (window.__DATA__.title || '赛博史记') + ' ' + t('titleSuffix');
  if (viewerErrorKey) setErrorText(viewerErrorKey);
}
langBtn.addEventListener('click', () => {
  currentLang = currentLang === 'zh' ? 'en' : 'zh';
  localStorage.setItem('lang', currentLang);
  applyLang();
  render();
});

/* ---- 主题 ---- */
function initTheme() {
  const saved = localStorage.getItem('theme');
  const th = (saved === 'light' || saved === 'dark') ? saved
    : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = th;
}
themeBtn.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('theme', next);
});
initTheme();

/* ---- 筛选与排序 chips ---- */
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
  let html = '<span class="chip-group-label">' + t('scopeLabel') + '</span>';
  html += chipHTML('scope', 'all', t('allLabel'), DATA.items.length, state.scope === 'all');
  if (recentCnt > 0) html += chipHTML('scope', 'recent', t('recentLabel'), recentCnt, state.scope === 'recent');
  html += chipHTML('scope', 'featured', t('featuredLabel'), featuredCnt, state.scope === 'featured');
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
  html += '<span class="chip-group-label">' + t('sortLabel') + '</span>';
  html += chipHTML('sort', 'time', t('sortTime'), '', state.sort === 'time');
  html += chipHTML('sort', 'az', t('sortAZ'), '', state.sort === 'az');
  html += chipHTML('sort', 'za', t('sortZA'), '', state.sort === 'za');
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

/* ---- 搜索 ---- */
searchInput.addEventListener('input', debounce(() => { state.query = searchInput.value; render(); }, 150));

/* ---- 筛选、排序与渲染 ---- */
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
  if (xn !== yn) return xn ? -1 : 1;  // 数字开头优先
  return x.localeCompare(y, 'zh-Hans-CN');
}
function sortItems(list) {
  if (state.sort === 'az') return list.slice().sort((a, b) => nameCmp(a.name, b.name));
  if (state.sort === 'za') return list.slice().sort((a, b) => nameCmp(b.name, a.name));
  return list;  // 时间：索引已按修改时间倒序
}
function tileHTML(item, i) {
  const star = item.featured ? '<span class="tile-tag">★</span>' : '';
  const long = item.long ? '<span class="tile-long">' + t('longLabel') + '</span>' : '';
  return '<button class="tile" role="listitem" data-i="' + i + '" type="button">' +
    '<span class="thumb">' + star + long +
    '<img data-src="' + toUrl(item.thumb) + '" alt="" loading="lazy" decoding="async">' +
    '</span><span class="tile-name">' + escapeHtml(item.name) + '</span></button>';
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

/* ---- 查看器 ---- */
const viewer = $('#viewer'), vImg = $('#v-img'), vStage = $('#v-stage'),
  vLoading = $('#v-loading'), vError = $('#v-error'), vErrorText = $('#v-error-text'),
  vName = $('#viewer-name'), vMeta = $('#viewer-meta'), vCounter = $('#v-counter');
let viewerList = [], viewerIndex = 0, zoom = 1, loadToken = 0;
let viewerErrorKey = null;

function setErrorText(key) {
  viewerErrorKey = key;
  vErrorText.textContent = t(key);
}

function openViewer(idx) {
  if (!filtered.length) return;
  viewerList = filtered;
  viewerIndex = clamp(idx, 0, viewerList.length - 1);
  viewer.classList.add('open');
  document.body.style.overflow = 'hidden';
  loadIntoViewer(viewerList[viewerIndex]);
}
function closeViewer() {
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
  vImg.removeAttribute('src');  // 不显示缩略图占位，避免切换闪烁

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
  };
  full.onerror = function () { /* 静默：保持加载中，网络恢复后 onload 自动接管 */ };

  full.src = toUrl(item.file);

  vStage.scrollTop = 0;
  vStage.scrollLeft = 0;
  if (viewerIndex + 1 < viewerList.length) {  // 预取下一张
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
  if (isMobile) {                       // 手机：宽=设备宽
    vw = stageW * zoom;
    vh = vw / ratio;
  } else if (item.height > item.width) { // 桌面竖图：限宽
    vw = Math.min(stageW, MAX_TALL_WIDTH) * zoom;
    vh = vw / ratio;
  } else {                              // 桌面横图：contain
    const wAtFullH = stageH * ratio;
    if (wAtFullH <= stageW) { vh = stageH * zoom; vw = vh * ratio; }
    else { vw = stageW * zoom; vh = vw / ratio; }
  }
  vImg.style.width = vw + 'px';
  vImg.style.height = vh + 'px';
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
vStage.addEventListener('click', e => { if (e.target === vStage) closeViewer(); });
vStage.addEventListener('wheel', e => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  zoomBy(e.deltaY < 0 ? 1.1 : 0.9);
}, { passive: false });

/* 触摸：双指缩放；横滑切换仅在图片无横向滚动需求时启用 */
let pinchDist = 0, swipeX = 0, swipeY = 0, swipeT = 0, swipeActive = false;
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
  if (vImg.offsetWidth > vStage.clientWidth + 1) return;  // 有横向滚动需求时不切换
  if (dx < 0) stepViewer(1); else stepViewer(-1);
}, { passive: true });

window.addEventListener('resize', debounce(() => { if (viewer.classList.contains('open')) applyZoom(); }, 120));

/* ---- 左下角菜单 ---- */
const menuBtn = $('#menu-btn'), menuEl = $('#menu'), aboutModal = $('#about-modal');
function showMenu(show) {
  menuEl.classList.toggle('show', show);
  menuBtn.setAttribute('aria-expanded', show ? 'true' : 'false');
}
menuBtn.addEventListener('click', e => {
  e.stopPropagation();
  showMenu(!menuEl.classList.contains('show'));
});
document.addEventListener('click', e => {
  if (menuEl.classList.contains('show') && !menuEl.contains(e.target) && e.target !== menuBtn) showMenu(false);
});
$('#menu-about').addEventListener('click', () => {
  showMenu(false);
  aboutModal.classList.add('show');
});
$('#about-close').addEventListener('click', () => aboutModal.classList.remove('show'));
aboutModal.addEventListener('click', e => { if (e.target === aboutModal) aboutModal.classList.remove('show'); });

window.addEventListener('scroll', () => {
  const shouldHide = window.scrollY > 8;
  // 同时控制三个元素的 hidden 类
  menuBtn.classList.toggle('hidden', shouldHide);
  menuEl.classList.toggle('hidden', shouldHide);
  aboutModal.classList.toggle('hidden', shouldHide);
}, { passive: true });

/* ---- 启动 ---- */
applyLang();
buildChips();
render();
