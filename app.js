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

const DATA = (window.__DATA__ && window.__DATA__.items) ? window.__DATA__ : null;

/* ------------------------------------------------------------------------------------------------------------------i18n--------------- */
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

/* --------------------------------------------------------------------------------------------------------------语言-------------------- */
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
}
langBtn.addEventListener('click', () => {
  currentLang = currentLang === 'zh' ? 'en' : 'zh';
  localStorage.setItem('lang', currentLang);
  applyLang();
  render();
});

/* ----------------------------------------------------------------------------------------------------------------亮暗主题------------ */
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
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></g><polygon data-shape="star" points="397.63,-127.17 479.82,39.36 663.59,66.07 530.61,195.69 562.00,378.73 397.63,292.31 233.25,378.73 264.65,195.69 131.67,66.07 315.44,39.36" stroke-linejoin="round" fill="#ffff00" stroke="#00ff00" stroke-width="2" opacity="1" class=""/>
    </svg>
  </span>
` : '';
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

/* ------------------------------------------------------------------------------------------------------------原图查看器---------- */
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
  history.pushState({ viewer: true }, '');
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
    const fileName = item.file.toLowerCase();
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

/* ------------------------------------------------------------------------------------------------------------触摸缩放---------- */
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
  if (vImg.offsetWidth > vStage.clientWidth + 1) return;
  if (dx < 0) stepViewer(1); else stepViewer(-1);
}, { passive: true });

window.addEventListener('resize', debounce(() => { if (viewer.classList.contains('open')) applyZoom(); }, 120));

/* ------------------------------------------------------------------------------------------------------------左下菜单---------- */
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
  const scrollY = window.scrollY;
  const windowHeight = window.innerHeight;
  const documentHeight = document.documentElement.scrollHeight;
  const atTop = scrollY <= 8;
  const atBottom = scrollY + windowHeight >= documentHeight - 8;
  const shouldHide = !(atTop || atBottom);
  menuBtn.classList.toggle('hidden', shouldHide);
  if (shouldHide) {
    menuEl.classList.remove('show');
    aboutModal.classList.remove('show');
  }

}, { passive: true });
window.addEventListener('popstate', function (e) {
  if (viewer.classList.contains('open')) {
    closeViewer();
  }
});

/* ------------------------------------------------------------------------------------------------------------河豚、搜索---------- */
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

/* ----------------------------------------------------------------------------------------------------------键盘事件------------------- */
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

  const fragment = document.createDocumentFragment();
  const src = './hetun.png';
  const keyframes = ['fly1', 'fly2', 'fly3', 'fly4', 'fly5', 'fly6', 'fly7', 'fly8', 'fly9', 'fly10', 'fly11', 'fly12', 'fly13', 'fly14', 'fly15', 'fly16', 'fly17', 'fly18', 'fly19', 'fly20'];
  const maxCount = Math.min(count, 500);

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
