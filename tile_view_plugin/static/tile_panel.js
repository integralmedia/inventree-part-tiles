/**
 * InvenTree Tile View Panel
 * Features: search, filters, sort, infinite scroll, lazy images, persistent display options
 */

const TV_PREFS_KEY = 'inventree_tileview_prefs';
const TV_PAGE_SIZE = 48;
const TV_DEBOUNCE_MS = 350;

// ── Preferences (localStorage) ────────────────────────────────────────────────

function tvDefaultPrefs() {
  return { fields: ['name', 'IPN', 'in_stock'], tileWidth: 180, groupVariants: false, groupByCategory: false, paramTemplates: [] };
}

function tvLoadPrefs() {
  try {
    const raw = localStorage.getItem(TV_PREFS_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      const merged = { ...tvDefaultPrefs(), ...saved };
      // Ensure fields is always a non-empty array
      if (!Array.isArray(merged.fields) || merged.fields.length === 0) {
        merged.fields = tvDefaultPrefs().fields;
      }
      if (!Array.isArray(merged.paramTemplates)) merged.paramTemplates = [];
      return merged;
    }
  } catch (_) {}
  return tvDefaultPrefs();
}

function tvSavePrefs(p) {
  try { localStorage.setItem(TV_PREFS_KEY, JSON.stringify(p)); } catch (_) {}
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function tvNavigateTo(path) {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
}

function tvEsc(val) {
  if (val == null) return '';
  return String(val)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function tvDebounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// Transparent 1×1 SVG placeholder for lazy-loaded images
const TV_BLANK = 'data:image/svg+xml,%3Csvg xmlns%3D%22http%3A//www.w3.org/2000/svg%22 width%3D%221%22 height%3D%221%22/%3E';

// ── Card builder ──────────────────────────────────────────────────────────────

function tvMakeCard(part, fields, extras = {}) {
  const url = `/web/part/${part.pk}/details`;
  // Use full-resolution image for tiles wider than 160 px to avoid pixelation
  const imgSrc = (extras.tileWidth > 160 && part.image)
    ? part.image
    : (part.thumbnail || part.image || '/static/img/blank_image.png');

  const card = document.createElement('div');
  card.className = 'tv-card';
  card._partData = part;  // stored for popover

  const imgWrap = document.createElement('a');
  imgWrap.href = url;
  imgWrap.className = 'tv-img-wrap';
  imgWrap.addEventListener('click', e => { e.preventDefault(); tvNavigateTo(url); });

  const img = document.createElement('img');
  img.src = TV_BLANK;
  img.dataset.src = imgSrc;
  img.className = 'tv-img';
  img.alt = tvEsc(part.name || '');
  imgWrap.appendChild(img);

  // Group-head overlay icon — shown on template cards that have grouped variants
  if (extras.isGroupHead) {
    const ov = document.createElement('div');
    ov.className = 'tv-group-overlay';
    ov.title = 'Template with variants';
    // Stacked-layers icon
    ov.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zm0 7.27L5.24 6 12 2.73 18.76 6 12 9.27zm0 2.46L2 9l10 5 10-5-10-5zm0 7.27L5.24 13 12 9.73 18.76 13 12 16zm0 1.54L2 12l10 5 10-5-10-5z"/></svg>';
    imgWrap.appendChild(ov);
  }

  card.appendChild(imgWrap);
  card.appendChild(tvMakeBody(part, fields, url, extras));
  return { card, img };
}

function tvMakeBody(part, fields, url, extras = {}) {
  const body = document.createElement('div');
  body.className = 'tv-body';

  if (fields.includes('name')) {
    const a = document.createElement('a');
    a.href = url;
    a.className = 'tv-name';
    a.textContent = part.full_name || part.name || '(no name)';
    a.addEventListener('click', e => { e.preventDefault(); tvNavigateTo(url); });
    body.appendChild(a);
  }

  if (fields.includes('IPN') && part.IPN) {
    body.appendChild(tvField('IPN:', tvEsc(part.IPN)));
  }

  if (fields.includes('description') && part.description) {
    const d = document.createElement('div');
    d.className = 'tv-field tv-desc';
    d.textContent = part.description;
    body.appendChild(d);
  }

  if (fields.includes('in_stock')) {
    // Templates hold no stock directly — total_in_stock rolls up all variant stock.
    const raw     = part.is_template ? (part.total_in_stock ?? part.in_stock) : (part.in_stock ?? part.total_in_stock);
    const qty     = parseFloat(raw) || 0;
    const label   = part.is_template ? 'Total:' : 'Stock:';
    const unitStr = part.units ? ` ${part.units}` : '';
    const row     = tvField(label, tvEsc(String(qty) + unitStr));
    row.classList.add(qty > 0 ? 'tv-stock-ok' : 'tv-stock-none');
    body.appendChild(row);
  }

  // Show type badge; suppress Template badge in group mode (overlay icon used instead)
  if (part.is_template && !extras.suppressTemplateBadge) {
    const badge = document.createElement('span');
    badge.className = 'tv-badge tv-badge-tmpl';
    badge.textContent = 'Template';
    body.appendChild(badge);
  } else if (part.variant_of != null) {
    const badge = document.createElement('span');
    badge.className = 'tv-badge tv-badge-variant';
    badge.textContent = 'Variant';
    body.appendChild(badge);
  }

  if (fields.includes('category') && part.category_detail?.name) {
    body.appendChild(tvField('Cat:', tvEsc(part.category_detail.name)));
  }

  if (fields.includes('revision') && part.revision) {
    body.appendChild(tvField('Rev:', tvEsc(part.revision)));
  }

  if (fields.includes('active')) {
    const badge = document.createElement('span');
    badge.className = 'tv-badge ' + (part.active ? 'tv-badge-active' : 'tv-badge-inactive');
    badge.textContent = part.active ? 'Active' : 'Inactive';
    body.appendChild(badge);
  }

  // ── Custom parameters ──
  const { paramTemplates = [], paramData, paramMeta } = extras;
  if (paramTemplates.length > 0 && paramData && paramMeta) {
    let firstParam = true;
    paramTemplates.forEach(pk => {
      const val = paramData.get(pk)?.get(part.pk);
      if (val == null || val === '') return;
      if (firstParam) {
        const sep = document.createElement('div');
        sep.className = 'tv-param-sep';
        body.appendChild(sep);
        firstParam = false;
      }
      const meta  = paramMeta.get(pk);
      const label = meta
        ? (meta.units ? `${meta.name} (${meta.units}):` : `${meta.name}:`)
        : `Param ${pk}:`;
      body.appendChild(tvField(label, tvEsc(val)));
    });
  }

  return body;
}

function tvField(labelText, valueHtml) {
  const div = document.createElement('div');
  div.className = 'tv-field';
  div.innerHTML = `<span class="tv-label">${labelText}</span> ${valueHtml}`;
  return div;
}

// ── Grouped card (template + its variants) ────────────────────────────────────

function tvMakeGroupedCard(template, variants, fields, extras = {}) {
  // When variants exist, show overlay icon and hide the Template badge (overlay serves that purpose)
  const headExtras = variants.length > 0
    ? { ...extras, isGroupHead: true, suppressTemplateBadge: true }
    : extras;
  const { card, img } = tvMakeCard(template, fields, headExtras);
  if (variants.length === 0) return { card, img };

  const varList = document.createElement('div');
  varList.className = 'tv-var-list';

  const hdr = document.createElement('div');
  hdr.className = 'tv-var-hdr';
  hdr.textContent = `${variants.length} variant${variants.length !== 1 ? 's' : ''}`;
  varList.appendChild(hdr);

  variants.forEach(v => {
    const url = `/web/part/${v.pk}/details`;
    const row = document.createElement('div');
    row.className = 'tv-var-row';

    const nameEl = document.createElement('a');
    nameEl.href = url;
    nameEl.className = 'tv-var-name';
    nameEl.textContent = v.full_name || v.name || '(no name)';
    nameEl.addEventListener('click', e => { e.preventDefault(); tvNavigateTo(url); });
    row.appendChild(nameEl);

    if (fields.includes('in_stock')) {
      const qty     = parseFloat(v.in_stock ?? v.total_in_stock) || 0;
      const unitStr = (v.units || template.units) ? ` ${v.units || template.units}` : '';
      const stockEl = document.createElement('span');
      stockEl.className = 'tv-var-stock ' + (qty > 0 ? 'tv-stock-ok' : 'tv-stock-none');
      stockEl.textContent = String(qty) + unitStr;
      row.appendChild(stockEl);
    }

    if (extras.onVariantHover) extras.onVariantHover(row, v);
    varList.appendChild(row);
  });

  card.appendChild(varList);
  return { card, img };
}

// ── Main controller ───────────────────────────────────────────────────────────

class TileView {
  constructor(root, categoryId) {
    this.root       = root;
    this.categoryId = categoryId;
    this.prefs      = tvLoadPrefs();
    this.state      = {
      search: '', ordering: 'name', filters: {},
      offset: 0, total: 0, loading: false, done: false,
      categoryFilters: [],
    };
    this.parts              = [];          // cached for instant display-prefs redraws
    this.paramData          = new Map();   // templatePk -> Map<modelId, data>
    this.paramTemplatesMeta = new Map();  // templatePk -> template object
    this.stockCache         = new Map();  // partPk -> stock items array
    this.categoriesCache    = null;       // flat list of all categories
    this.categoryTreeRoots  = null;       // built tree structure
    this.catSearchTerm      = '';
    this.catPanel           = null;
    this.catBtn             = null;
    this.catTreeEl          = null;
    this.lazyObs   = null;
    this.scrollObs = null;
  }

  init() {
    // Clean up floating panels / popover from any previous render
    [this.filterPanel, this.dispPanel, this.popover, this.catPanel].forEach(el => {
      if (el && el.parentElement === document.body) document.body.removeChild(el);
    });
    // Clear any previous render (React may call renderPanel more than once on the same target)
    this.root.innerHTML = '';

    this.injectStyles();
    this.buildToolbar();
    this.buildFilterPanel();
    this.buildDispPanel();

    this.statusEl = this.el('div', 'tv-status');
    this.root.appendChild(this.statusEl);

    this.grid = this.el('div', 'tv-grid');
    this.grid.style.gridTemplateColumns =
      `repeat(auto-fill, minmax(${this.prefs.tileWidth}px, 1fr))`;
    this.root.appendChild(this.grid);

    this.sentinel  = this.el('div', 'tv-sentinel');
    this.root.appendChild(this.sentinel);

    this.loadingEl = this.el('div', 'tv-loading-bar', 'Loading\u2026');
    this.loadingEl.hidden = true;
    this.root.appendChild(this.loadingEl);

    this.initObservers();
    this.initPopover();
    this.loadPage();
    this.loadParamTemplates(); // non-blocking; populates Display panel param pills
  }

  el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls)  e.className   = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // ── Toolbar ────────────────────────────────────────────────────────────────

  buildToolbar() {
    const bar = this.el('div', 'tv-toolbar');

    // Search
    this.searchInput = document.createElement('input');
    this.searchInput.type        = 'search';
    this.searchInput.placeholder = 'Search parts\u2026';
    this.searchInput.className   = 'tv-input tv-search';
    const doSearch = tvDebounce(v => { this.state.search = v; this.reset(); }, TV_DEBOUNCE_MS);
    this.searchInput.addEventListener('input', e => doSearch(e.target.value));
    bar.appendChild(this.searchInput);

    // Sort
    const sortSel = document.createElement('select');
    sortSel.className = 'tv-input tv-select';
    [
      ['name',           'Name A\u2192Z'],
      ['-name',          'Name Z\u2192A'],
      ['IPN',            'IPN A\u2192Z'],
      ['-IPN',           'IPN Z\u2192A'],
      ['-in_stock',      'Stock \u2193'],
      ['in_stock',       'Stock \u2191'],
      ['-creation_date', 'Newest'],
      ['creation_date',  'Oldest'],
    ].forEach(([val, label]) => {
      const opt = document.createElement('option');
      opt.value = val; opt.textContent = label;
      if (val === this.state.ordering) opt.selected = true;
      sortSel.appendChild(opt);
    });
    sortSel.addEventListener('change', e => { this.state.ordering = e.target.value; this.reset(); });
    bar.appendChild(sortSel);

    // Filters toggle
    const filterBtn = this.el('button', 'tv-btn', 'Filters');
    filterBtn.addEventListener('click', () => this.toggleDropdown(this.filterPanel, filterBtn));
    bar.appendChild(filterBtn);

    // Category filter
    this.catBtn = this.el('button', 'tv-btn', 'Categories');
    this.catBtn.addEventListener('click', () => this.openCategoryPopover(this.catBtn));
    bar.appendChild(this.catBtn);

    // Display options toggle
    const dispBtn = this.el('button', 'tv-btn', 'Display');
    dispBtn.addEventListener('click', () => this.toggleDropdown(this.dispPanel, dispBtn));
    bar.appendChild(dispBtn);

    // Tile size slider
    const sizeWrap = this.el('div', 'tv-size-wrap');
    sizeWrap.appendChild(this.el('span', 'tv-size-label', 'Size'));
    const slider = document.createElement('input');
    slider.type  = 'range';
    slider.min   = 120; slider.max = 340; slider.step = 20;
    slider.value = this.prefs.tileWidth;
    slider.className = 'tv-slider';
    slider.addEventListener('input', e => {
      this.prefs.tileWidth = Number(e.target.value);
      tvSavePrefs(this.prefs);
      this.grid.style.gridTemplateColumns =
        `repeat(auto-fill, minmax(${this.prefs.tileWidth}px, 1fr))`;
    });
    sizeWrap.appendChild(slider);
    bar.appendChild(sizeWrap);

    this.root.appendChild(bar);
  }

  // ── Panel helpers ─────────────────────────────────────────────────────────

  tvOptRow(label, checked, onChange, description) {
    const row = this.el('div', 'tv-opt-row');
    const cb  = document.createElement('input');
    cb.type      = 'checkbox';
    cb.className = 'tv-opt-check';
    cb.checked   = checked;
    cb.addEventListener('change', () => onChange(cb.checked, cb));
    const lbl = this.el('label', 'tv-opt-label');
    lbl.textContent = label;
    lbl.addEventListener('click', () => { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); });
    row.appendChild(cb);
    row.appendChild(lbl);
    if (description) {
      const desc = this.el('span', 'tv-opt-desc', description);
      row.appendChild(desc);
    }
    return { row, cb };
  }

  tvOptSection(parent, title) {
    const hdr = this.el('div', 'tv-opt-section-hdr', title);
    parent.appendChild(hdr);
  }

  // ── Filter panel ───────────────────────────────────────────────────────────

  buildFilterPanel() {
    this.filterPanel = this.el('div', 'tv-sub-panel tv-sub-panel-v');
    this.filterPanel.hidden = true;

    const filterDefs = [
      { section: 'Part type' },
      { key: 'active',      label: 'Active' },
      { key: 'is_template', label: 'Template' },
      { key: 'virtual',     label: 'Virtual' },
      { section: 'BOM role' },
      { key: 'assembly',    label: 'Assembly' },
      { key: 'component',   label: 'Component' },
      { section: 'Commerce' },
      { key: 'purchaseable', label: 'Purchaseable' },
      { key: 'salable',     label: 'Salable' },
      { key: 'trackable',   label: 'Trackable' },
      { section: 'Inventory' },
      { key: 'has_stock',   label: 'Has stock' },
    ];

    filterDefs.forEach(def => {
      if (def.section) { this.tvOptSection(this.filterPanel, def.section); return; }
      const { key, label } = def;
      const row  = this.el('div', 'tv-opt-row tv-filter-row');
      const lbl  = this.el('span', 'tv-opt-label', label);
      const sel  = document.createElement('select');
      sel.className = 'tv-opt-select';
      const opts = [['', 'Any'], ['true', 'Yes'], ['false', 'No']];
      opts.forEach(([val, txt]) => {
        const opt = document.createElement('option');
        opt.value = val; opt.textContent = txt;
        if (val === '' && !(key in this.state.filters)) opt.selected = true;
        if (val === 'true'  && this.state.filters[key] === true)  opt.selected = true;
        if (val === 'false' && this.state.filters[key] === false) opt.selected = true;
        sel.appendChild(opt);
      });
      const applySelect = () => {
        if (sel.value === '') delete this.state.filters[key];
        else this.state.filters[key] = (sel.value === 'true');
        this.reset();
      };
      sel.addEventListener('change', applySelect);
      // Clicking the row (but not directly on the <select>) cycles through options
      row.addEventListener('click', e => {
        if (e.target === sel) return;
        sel.selectedIndex = (sel.selectedIndex + 1) % sel.options.length;
        applySelect();
      });
      row.appendChild(lbl);
      row.appendChild(sel);
      this.filterPanel.appendChild(row);
    });
    // filterPanel is a floating dropdown — NOT appended to root
  }

  // ── Display options panel ──────────────────────────────────────────────────

  buildDispPanel() {
    this.dispPanel = this.el('div', 'tv-sub-panel tv-sub-panel-v');
    this.dispPanel.hidden = true;

    // ── Show on tiles ──
    this.tvOptSection(this.dispPanel, 'Show on tiles');
    [
      ['name',        'Name'],
      ['IPN',         'IPN'],
      ['description', 'Description'],
      ['in_stock',    'Stock quantity'],
      ['category',    'Category'],
      ['revision',    'Revision'],
      ['active',      'Active badge'],
    ].forEach(([key, label]) => {
      const { row, cb } = this.tvOptRow(label, this.prefs.fields.includes(key), (checked) => {
        const idx = this.prefs.fields.indexOf(key);
        if (checked && idx < 0) this.prefs.fields.push(key);
        if (!checked && idx >= 0) this.prefs.fields.splice(idx, 1);
        tvSavePrefs(this.prefs);
        this.redrawExisting();
      });
      this.dispPanel.appendChild(row);
    });

    // ── Layout ──
    this.tvOptSection(this.dispPanel, 'Layout');
    const { row: gvRow } = this.tvOptRow(
      'Group variants', this.prefs.groupVariants,
      (checked) => {
        this.prefs.groupVariants = checked;
        tvSavePrefs(this.prefs);
        this.reset();
      },
      'Collapse variants under template tile'
    );
    this.dispPanel.appendChild(gvRow);

    const { row: gcRow } = this.tvOptRow(
      'Group by category', this.prefs.groupByCategory,
      (checked) => {
        this.prefs.groupByCategory = checked;
        tvSavePrefs(this.prefs);
        this.reset();
      },
      'Show a heading for each category'
    );
    this.dispPanel.appendChild(gcRow);

    // ── Parameters ── (populated later by loadParamTemplates)
    this.dispParamSection = null; // sentinel; built by buildParamPills
    // dispPanel is a floating dropdown — NOT appended to root
  }

  // ── Parameter template loading ─────────────────────────────────────────────

  async loadParamTemplates() {
    try {
      const resp = await fetch(
        '/api/parameter/template/?for_model=part&enabled=true&limit=500',
        { credentials: 'include' }
      );
      if (!resp.ok) return;
      const json = await resp.json();
      const templates = Array.isArray(json) ? json : (json.results ?? []);
      this.paramTemplatesMeta = new Map(templates.map(t => [t.pk, t]));
      this.buildParamPills(templates);
      // If the user had templates selected, fetch their data and re-render
      if (this.prefs.paramTemplates.length > 0) {
        await this.loadParamDataForTemplates(this.prefs.paramTemplates);
        if (this.parts.length > 0) this.redrawExisting();
      }
    } catch (_) {}
  }

  buildParamPills(templates) {
    if (templates.length === 0) return;
    this.tvOptSection(this.dispPanel, 'Parameters');
    templates.forEach(tmpl => {
      const label = tmpl.units ? `${tmpl.name} (${tmpl.units})` : tmpl.name;
      const { row, cb } = this.tvOptRow(label, this.prefs.paramTemplates.includes(tmpl.pk), async (checked, checkboxEl) => {
        const idx = this.prefs.paramTemplates.indexOf(tmpl.pk);
        if (checked) {
          if (idx < 0) this.prefs.paramTemplates.push(tmpl.pk);
          checkboxEl.disabled = true;
          await this.loadParamDataForTemplates([tmpl.pk]);
          checkboxEl.disabled = false;
        } else {
          if (idx >= 0) this.prefs.paramTemplates.splice(idx, 1);
        }
        tvSavePrefs(this.prefs);
        this.redrawExisting();
      });
      this.dispPanel.appendChild(row);
    });
  }

  async loadParamDataForTemplates(pks) {
    const toFetch = pks.filter(pk => !this.paramData.has(pk));
    if (toFetch.length === 0) return;
    await Promise.all(toFetch.map(async pk => {
      try {
        const resp = await fetch(
          `/api/parameter/?model_type=part&template=${pk}&limit=2000`,
          { credentials: 'include' }
        );
        if (!resp.ok) return;
        const json  = await resp.json();
        const items = Array.isArray(json) ? json : (json.results ?? []);
        this.paramData.set(pk, new Map(items.map(item => [item.model_id, item.data])));
      } catch (_) {}
    }));
  }

  // Returns the extras object passed to card builders
  tvExtras() {
    return {
      paramTemplates: this.prefs.paramTemplates,
      paramData:      this.paramData,
      paramMeta:      this.paramTemplatesMeta,
      tileWidth:      this.prefs.tileWidth,
    };
  }

  // ── Dropdown panel management ──────────────────────────────────────────────

  _cleanupPrev() {
    [this.filterPanel, this.dispPanel, this.popover, this.catPanel].forEach(el => {
      if (el && el.parentElement === document.body) document.body.removeChild(el);
    });
  }

  toggleDropdown(panel, btn) {
    const isOpen = panel.parentElement === document.body && !panel.hidden;
    [this.filterPanel, this.dispPanel, this.catPanel].forEach(p => {
      if (p !== panel && p && p.parentElement === document.body) document.body.removeChild(p);
    });
    if (isOpen) { if (panel.parentElement === document.body) document.body.removeChild(panel); return; }

    const rect    = btn.getBoundingClientRect();
    const margin  = 8;
    const panelW  = 280;
    // Horizontal: clamp so panel never overflows right edge
    let left = rect.left;
    if (left + panelW > window.innerWidth - margin) left = Math.max(margin, window.innerWidth - panelW - margin);
    // Vertical: prefer below button; flip above if not enough room below
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const maxH       = Math.min(480, Math.max(spaceBelow, spaceAbove) - 4);
    let   top;
    if (spaceBelow >= Math.min(200, maxH) || spaceBelow >= spaceAbove) {
      top = rect.bottom + 4;
    } else {
      // Place above — we'll set bottom instead, achieved by computing top from maxH
      top = rect.top - 4 - Math.min(maxH, spaceAbove);
    }
    panel.style.cssText =
      `position:fixed;top:${top}px;left:${left}px;` +
      `z-index:99999;width:${panelW}px;max-height:${maxH}px;overflow-y:auto;`;
    panel.hidden = false;
    document.body.appendChild(panel);
    const close = (e) => {
      if (!panel.contains(e.target) && e.target !== btn) {
        if (panel.parentElement === document.body) document.body.removeChild(panel);
        panel.hidden = true;
        document.removeEventListener('pointerdown', close, true);
      }
    };
    setTimeout(() => document.addEventListener('pointerdown', close, true), 10);
  }

  // ── Category filter popover ────────────────────────────────────────────────

  updateCatBtn() {
    if (!this.catBtn) return;
    const count = this.state.categoryFilters.length;
    this.catBtn.textContent = count > 0 ? `Categories (${count})` : 'Categories';
    this.catBtn.classList.toggle('tv-btn-active', count > 0);
  }

  async openCategoryPopover(btn) {
    // Toggle: close if already open
    if (this.catPanel && this.catPanel.parentElement === document.body) {
      document.body.removeChild(this.catPanel);
      return;
    }
    // Close other floating panels
    [this.filterPanel, this.dispPanel].forEach(p => {
      if (p && p.parentElement === document.body) document.body.removeChild(p);
    });

    this.catPanel = this.buildCatPanel();
    const rect   = btn.getBoundingClientRect();
    const panelW = 300;
    let   left   = rect.left;
    if (left + panelW > window.innerWidth - 8) left = Math.max(8, window.innerWidth - panelW - 8);
    const maxH = Math.max(180, Math.min(440, window.innerHeight - rect.bottom - 20));
    this.catPanel.style.cssText =
      `position:fixed;top:${rect.bottom + 4}px;left:${left}px;` +
      `z-index:99999;width:${panelW}px;max-height:${maxH}px;`;
    document.body.appendChild(this.catPanel);
    this.catPanel.querySelector('.tv-cat-search')?.focus();

    const close = (e) => {
      if (this.catPanel && !this.catPanel.contains(e.target) && e.target !== btn) {
        if (this.catPanel.parentElement === document.body) document.body.removeChild(this.catPanel);
        document.removeEventListener('pointerdown', close, true);
      }
    };
    setTimeout(() => document.addEventListener('pointerdown', close, true), 10);

    if (!this.categoriesCache) {
      if (this.catTreeEl) this.catTreeEl.innerHTML = '<div class="tv-cat-loading">Loading\u2026</div>';
      await this.loadCategories();
      this.renderCatTreeInPanel();
    }
  }

  async loadCategories() {
    try {
      const resp = await fetch('/api/part/category/?limit=2000', { credentials: 'include' });
      if (!resp.ok) return;
      const json = await resp.json();
      const cats = Array.isArray(json) ? json : (json.results ?? []);
      this.categoriesCache   = cats;
      this.categoryTreeRoots = this.buildCategoryTree(cats);
    } catch (_) {
      this.categoriesCache   = [];
      this.categoryTreeRoots = [];
    }
  }

  buildCategoryTree(categories) {
    const map   = new Map(categories.map(c => [c.pk, { ...c, children: [] }]));
    const roots = [];
    map.forEach(cat => {
      if (cat.parent == null) {
        roots.push(cat);
      } else {
        const parent = map.get(cat.parent);
        if (parent) parent.children.push(cat);
        else roots.push(cat); // orphaned → treat as root
      }
    });
    const sort = nodes => {
      nodes.sort((a, b) => a.name.localeCompare(b.name));
      nodes.forEach(n => sort(n.children));
    };
    sort(roots);
    return roots;
  }

  buildCatPanel() {
    const panel  = this.el('div', 'tv-cat-panel');
    const header = this.el('div', 'tv-cat-header');

    const search = document.createElement('input');
    search.type        = 'search';
    search.placeholder = 'Search categories\u2026';
    search.className   = 'tv-cat-search tv-input';
    header.appendChild(search);

    const clearBtn = this.el('button', 'tv-btn tv-cat-clear-btn', 'Clear');
    clearBtn.title = 'Clear selected categories';
    clearBtn.addEventListener('click', () => {
      this.state.categoryFilters = [];
      this.updateCatBtn();
      this.renderCatTreeInPanel();
      this.reset();
    });
    header.appendChild(clearBtn);
    panel.appendChild(header);

    const treeEl = this.el('div', 'tv-cat-tree');
    this.catTreeEl = treeEl;
    panel.appendChild(treeEl);

    if (this.categoriesCache) this.renderCatTreeInPanel();

    search.addEventListener('input', tvDebounce(e => {
      this.catSearchTerm = e.target.value.trim().toLowerCase();
      this.renderCatTreeInPanel();
    }, 200));

    return panel;
  }

  renderCatTreeInPanel() {
    if (!this.catTreeEl) return;
    if (!this.categoryTreeRoots || this.categoryTreeRoots.length === 0) {
      this.catTreeEl.innerHTML = '<div class="tv-cat-loading">No categories found.</div>';
      return;
    }
    this.catTreeEl.innerHTML = '';
    const frag = document.createDocumentFragment();
    this.categoryTreeRoots.forEach(node => {
      const el = this.renderCatNode(node, 0);
      if (el) frag.appendChild(el);
    });
    this.catTreeEl.appendChild(frag);
    if (this.catTreeEl.children.length === 0) {
      this.catTreeEl.innerHTML = '<div class="tv-cat-loading">No matching categories.</div>';
    }
  }

  _catHasMatch(node, term) {
    if (!term) return false;
    return node.children.some(c =>
      c.name.toLowerCase().includes(term) || this._catHasMatch(c, term)
    );
  }

  _catSelectedDescendantCount(node) {
    let count = 0;
    node.children.forEach(c => {
      if (this.state.categoryFilters.includes(c.pk)) count++;
      count += this._catSelectedDescendantCount(c);
    });
    return count;
  }

  renderCatNode(node, depth) {
    const term       = this.catSearchTerm;
    const selfMatch  = !term || node.name.toLowerCase().includes(term);
    const childMatch = this._catHasMatch(node, term);
    if (!selfMatch && !childMatch) return null;

    const hasChildren = node.children.length > 0;
    const wrapper     = document.createElement('div');
    const row         = this.el('div', 'tv-cat-row');
    row.style.paddingLeft = `${8 + depth * 16}px`;

    // Expand / collapse button (or spacer for leaves)
    let childContainer = null;
    if (hasChildren) {
      childContainer = document.createElement('div');
      childContainer.className = 'tv-cat-children';
      const autoExpand = !!term && childMatch;
      childContainer.style.display = autoExpand ? '' : 'none';
      if (autoExpand) {
        node.children.forEach(c => {
          const el = this.renderCatNode(c, depth + 1);
          if (el) childContainer.appendChild(el);
        });
      }
      const expandBtn = this.el('button', 'tv-cat-expand-btn');
      expandBtn.textContent = autoExpand ? '\u25bc' : '\u25b6';
      expandBtn.title = 'Expand / collapse';
      expandBtn.addEventListener('click', e => {
        e.stopPropagation();
        const nowOpen = childContainer.style.display === 'none';
        childContainer.style.display = nowOpen ? '' : 'none';
        expandBtn.textContent = nowOpen ? '\u25bc' : '\u25b6';
        // Hide/show the descendant badge based on collapsed state
        if (descBadge) descBadge.style.display = nowOpen ? 'none' : '';
        if (nowOpen && childContainer.children.length === 0) {
          node.children.forEach(c => {
            const el = this.renderCatNode(c, depth + 1);
            if (el) childContainer.appendChild(el);
          });
        }
      });
      row.appendChild(expandBtn);

      // Badge ref declared with var so the expand handler closure above can reference it
      var descBadge = null;
    } else {
      row.appendChild(this.el('span', 'tv-cat-indent'));
    }

    // Checkbox
    const checkbox = document.createElement('input');
    checkbox.type      = 'checkbox';
    checkbox.className = 'tv-cat-check';
    checkbox.checked   = this.state.categoryFilters.includes(node.pk);
    const onToggle = () => {
      if (checkbox.checked) {
        if (!this.state.categoryFilters.includes(node.pk)) this.state.categoryFilters.push(node.pk);
      } else {
        this.state.categoryFilters = this.state.categoryFilters.filter(pk => pk !== node.pk);
      }
      this.updateCatBtn();
      this.renderCatTreeInPanel(); // refresh badges on ancestor nodes
      this.reset();
    };
    checkbox.addEventListener('change', onToggle);
    row.appendChild(checkbox);

    // Name label (clicking also toggles checkbox)
    const nameEl = this.el('span', 'tv-cat-name');
    if (selfMatch && term) {
      const idx = node.name.toLowerCase().indexOf(term);
      if (idx >= 0) {
        nameEl.innerHTML =
          tvEsc(node.name.slice(0, idx)) +
          `<mark class="tv-cat-highlight">${tvEsc(node.name.slice(idx, idx + term.length))}</mark>` +
          tvEsc(node.name.slice(idx + term.length));
      } else {
        nameEl.textContent = node.name;
      }
    } else {
      nameEl.textContent = node.name;
    }
    nameEl.addEventListener('click', () => { checkbox.checked = !checkbox.checked; onToggle(); });
    row.appendChild(nameEl);

    // Badge + row highlight: appended after name so alignment is preserved
    if (hasChildren) {
      const descCount = this._catSelectedDescendantCount(node);
      const isClosed  = childContainer && childContainer.style.display === 'none';
      if (descCount > 0) {
        row.classList.add('tv-cat-row-has-sel');
        descBadge = (() => {
          const b = this.el('span', 'tv-cat-desc-badge', String(descCount));
          b.title = `${descCount} selected sub-categor${descCount === 1 ? 'y' : 'ies'} hidden below`;
          b.style.display = isClosed ? '' : 'none';
          return b;
        })();
        row.appendChild(descBadge);
      }
    }

    wrapper.appendChild(row);
    if (childContainer) wrapper.appendChild(childContainer);
    return wrapper;
  }

  // Parallel fetch for each selected category; results are merged & deduplicated
  async loadMultiCategoryPage() {
    this.state.loading    = true;
    this.loadingEl.hidden = false;
    const grouped = this.prefs.groupVariants || this.prefs.groupByCategory;
    try {
      const fetchCat = async (catPk) => {
        const p = new URLSearchParams({ limit: 500, cascade: 'true', category: catPk });
        if (this.state.search) p.set('search', this.state.search);
        p.set('ordering', this.state.ordering);
        Object.entries(this.state.filters).forEach(([k, v]) => p.set(k, v ? 'true' : 'false'));
        const resp = await fetch(`/api/part/?${p}`, { credentials: 'include' });
        if (!resp.ok) return [];
        const json = await resp.json();
        return Array.isArray(json) ? json : (json.results ?? []);
      };
      const batches = await Promise.all(this.state.categoryFilters.map(fetchCat));
      const seen    = new Set();
      const merged  = [];
      batches.flat().forEach(part => {
        if (!seen.has(part.pk)) { seen.add(part.pk); merged.push(part); }
      });
      this.parts        = merged;
      this.state.total  = merged.length;
      this.state.offset = merged.length;
      this.state.done   = true;
      if (this.prefs.groupByCategory && !this.categoriesCache) await this.loadCategories();
      await this.loadParamDataForTemplates(this.prefs.paramTemplates);
      if (grouped) this.renderGrouped(); else this.appendCards(merged);
      this.updateStatus();
    } catch (err) {
      this.grid.appendChild(this.el('div', 'tv-error', `Failed to load parts: ${err.message}`));
      this.state.done = true;
    } finally {
      this.state.loading    = false;
      this.loadingEl.hidden = true;
    }
  }

  // ── Group-mode client-side sort ────────────────────────────────────────────

  sortForGroup(parts) {
    const desc  = this.state.ordering.startsWith('-');
    const field = desc ? this.state.ordering.slice(1) : this.state.ordering;
    const getVal = (p) => {
      if (field === 'in_stock') {
        return parseFloat(p.is_template ? (p.total_in_stock ?? p.in_stock) : (p.in_stock ?? 0)) || 0;
      }
      const v = p[field];
      return v == null ? '' : v;
    };
    return [...parts].sort((a, b) => {
      const av = getVal(a), bv = getVal(b);
      const cmp = (typeof av === 'number' && typeof bv === 'number')
        ? av - bv
        : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
      return desc ? -cmp : cmp;
    });
  }

  // ── Hover popover ──────────────────────────────────────────────────────────

  initPopover() {
    this.popover = document.createElement('div');
    this.popover.className = 'tv-popover';
    this.popover.hidden = true;
    document.body.appendChild(this.popover);
    this.popover.addEventListener('mouseenter', () => clearTimeout(this._popHideTimer));
    this.popover.addEventListener('mouseleave', () => this.hidePopover());
    this._popCurrentPk = null;
  }

  attachHoverEvents(card, part) {
    card.addEventListener('mouseenter', () => {
      clearTimeout(this._popHideTimer);
      clearTimeout(this._popShowTimer);
      this._popShowTimer = setTimeout(() => this.showPopover(card, part), 320);
    });
    card.addEventListener('mouseleave', (e) => {
      clearTimeout(this._popShowTimer);
      if (!this.popover || !this.popover.contains(e.relatedTarget)) this.hidePopover();
    });
  }

  showPopover(card, part) {
    if (!this.popover) return;
    this._popCurrentPk = part.pk;
    const rect = card.getBoundingClientRect();
    const popW = 270;
    let   left = rect.right + 10;
    if (left + popW > window.innerWidth - 8) left = rect.left - popW - 10;
    const top = Math.max(8, Math.min(rect.top, window.innerHeight - 340));
    this.popover.style.cssText =
      `position:fixed;top:${top}px;left:${Math.max(8, left)}px;z-index:99998;width:${popW}px;`;
    this.popover.hidden = false;
    this.renderPopoverContent(part, null);
    this.loadStockForPopover(part);
  }

  hidePopover() {
    this._popHideTimer = setTimeout(() => {
      if (this.popover) this.popover.hidden = true;
      this._popCurrentPk = null;
    }, 120);
  }

  renderPopoverContent(part, stockItems) {
    const url     = `/web/part/${part.pk}/details`;
    const unitStr = part.units ? ` ${part.units}` : '';
    const raw     = part.is_template ? (part.total_in_stock ?? part.in_stock) : (part.in_stock ?? 0);
    const qty     = parseFloat(raw) || 0;

    let html = `<div class="tv-pop-header">`;
    html += `<a class="tv-pop-name" data-href="${tvEsc(url)}">${tvEsc(part.full_name || part.name)}</a>`;
    html += `</div>`;
    if (part.IPN) html += `<div class="tv-pop-ipn">${tvEsc(part.IPN)}</div>`;
    if (part.description) html += `<div class="tv-pop-desc">${tvEsc(part.description)}</div>`;

    html += `<div class="tv-pop-divider"></div><div class="tv-pop-rows">`;
    if (part.category_detail?.name) {
      html += `<div class="tv-pop-row"><span class="tv-pop-lbl">Category</span><span>${tvEsc(part.category_detail.name)}</span></div>`;
    }
    html += `<div class="tv-pop-row"><span class="tv-pop-lbl">${part.is_template ? 'Total stock' : 'Stock'}</span>`;
    html += `<span class="${qty > 0 ? 'tv-stock-ok' : 'tv-stock-none'}">${tvEsc(String(qty) + unitStr)}</span></div>`;
    if (part.units) {
      html += `<div class="tv-pop-row"><span class="tv-pop-lbl">Units</span><span>${tvEsc(part.units)}</span></div>`;
    }
    const defLoc = part.default_location_detail;
    if (defLoc) {
      html += `<div class="tv-pop-row"><span class="tv-pop-lbl">Default location</span><span class="tv-pop-loc-val">${tvEsc(defLoc.name)}</span></div>`;
    }
    html += `</div>`;

    html += `<div class="tv-pop-divider"></div>`;
    if (stockItems === null) {
      html += `<div class="tv-pop-sec-hdr">Stock locations <span class="tv-pop-loading">(loading\u2026)</span></div>`;
    } else if (stockItems.length === 0) {
      html += `<div class="tv-pop-sec-hdr">No stock entries</div>`;
    } else {
      html += `<div class="tv-pop-sec-hdr">Stock locations</div><div class="tv-pop-locs">`;
      stockItems.forEach(item => {
        const locName = item.location_detail?.name || 'No location';
        const q = parseFloat(item.quantity) || 0;
        html += `<div class="tv-pop-loc-row">`;
        html += `<span class="tv-pop-loc-name">${tvEsc(locName)}</span>`;
        html += `<span class="${q > 0 ? 'tv-stock-ok' : 'tv-stock-none'}">${tvEsc(String(q) + unitStr)}</span>`;
        html += `</div>`;
      });
      html += `</div>`;
    }

    this.popover.innerHTML = html;
    this.popover.querySelectorAll('[data-href]').forEach(el => {
      el.addEventListener('click', e => { e.preventDefault(); tvNavigateTo(el.dataset.href); });
    });
  }

  async loadStockForPopover(part) {
    const pk = part.pk;
    if (this.stockCache.has(pk)) {
      if (this._popCurrentPk === pk && this.popover && !this.popover.hidden) {
        this.renderPopoverContent(part, this.stockCache.get(pk));
      }
      return;
    }
    try {
      const resp = await fetch(
        `/api/stock/?part=${pk}&location_detail=true&limit=100`,
        { credentials: 'include' }
      );
      if (!resp.ok) throw new Error();
      const json  = await resp.json();
      const items = Array.isArray(json) ? json : (json.results ?? []);
      this.stockCache.set(pk, items);
      if (this._popCurrentPk === pk && this.popover && !this.popover.hidden) {
        this.renderPopoverContent(part, items);
      }
    } catch (_) {
      this.stockCache.set(pk, []);
    }
  }

  // ── Observers ──────────────────────────────────────────────────────────────

  initObservers() {
    // Lazy-load images when they scroll into view
    this.lazyObs = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const img = entry.target;
        if (img.dataset.src) {
          img.src    = img.dataset.src;
          img.onload  = () => { img.style.opacity = '1'; };
          img.onerror = () => { img.src = '/static/img/blank_image.png'; img.style.opacity = '0.4'; };
          delete img.dataset.src;
        }
        this.lazyObs.unobserve(img);
      });
    }, { rootMargin: '400px' });

    // Infinite scroll — load next page when sentinel enters viewport
    this.scrollObs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !this.state.loading && !this.state.done) {
        this.loadPage();
      }
    }, { rootMargin: '600px' });
    this.scrollObs.observe(this.sentinel);
  }

  // ── API ────────────────────────────────────────────────────────────────────

  buildUrl(grouped = false) {
    const limit = grouped ? 500 : TV_PAGE_SIZE;
    const p = new URLSearchParams({ limit, offset: this.state.offset });
    // Category: use categoryFilters if set, otherwise fall back to context categoryId
    if (this.state.categoryFilters.length === 1) {
      p.set('category', this.state.categoryFilters[0]);
    } else if (this.state.categoryFilters.length === 0 && this.categoryId) {
      p.set('category', this.categoryId);
    }
    // length > 1 is handled by loadMultiCategoryPage()
    p.set('cascade', 'true');
    if (this.state.search) p.set('search', this.state.search);
    p.set('ordering', this.state.ordering);
    Object.entries(this.state.filters).forEach(([k, v]) => p.set(k, v ? 'true' : 'false'));
    return `/api/part/?${p}`;
  }

  async loadPage() {
    if (this.state.loading || this.state.done) return;
    // Delegate multi-category fetches to a dedicated loader
    if (this.state.categoryFilters.length > 1) { await this.loadMultiCategoryPage(); return; }
    this.state.loading    = true;
    this.loadingEl.hidden = false;

    const grouped = this.prefs.groupVariants || this.prefs.groupByCategory;

    try {
      const resp = await fetch(this.buildUrl(grouped), { credentials: 'include' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();

      const results = Array.isArray(json) ? json : (json.results ?? []);
      const total   = json.count ?? results.length;

      this.state.total   = total;
      this.state.offset += results.length;
      this.parts.push(...results);

      if (grouped) {
        this.state.done = true;  // one-shot fetch — no infinite scroll in group mode
        if (this.prefs.groupByCategory && !this.categoriesCache) await this.loadCategories();
        await this.loadParamDataForTemplates(this.prefs.paramTemplates);
        this.renderGrouped();
      } else {
        if (results.length === 0 || this.state.offset >= total) this.state.done = true;
        await this.loadParamDataForTemplates(this.prefs.paramTemplates);
        this.appendCards(results);
      }
      this.updateStatus();
    } catch (err) {
      this.grid.appendChild(this.el('div', 'tv-error', `Failed to load parts: ${err.message}`));
      this.state.done = true;
    } finally {
      this.state.loading    = false;
      this.loadingEl.hidden = true;
    }
  }

  updateStatus() {
    const shown = Math.min(this.state.offset, this.state.total);
    this.statusEl.textContent = this.state.total === 0
      ? 'No parts found'
      : `Showing ${shown} of ${this.state.total} part${this.state.total !== 1 ? 's' : ''}`;
  }

  appendCards(results) {
    const extras = this.tvExtras();
    const frag   = document.createDocumentFragment();
    results.forEach(part => {
      const { card, img } = tvMakeCard(part, this.prefs.fields, extras);
      this.lazyObs.observe(img);
      this.attachHoverEvents(card, part);
      frag.appendChild(card);
    });
    this.grid.appendChild(frag);
  }

  renderGrouped() {
    this.lazyObs.disconnect();
    this.grid.innerHTML = '';

    // Sort client-side: stock ordering uses total_in_stock for templates (rollup)
    const sorted = this.sortForGroup(this.parts);

    // Build template → variants map (only when groupVariants is on)
    const variantMap  = new Map();
    const absorbedPks = new Set();

    if (this.prefs.groupVariants) {
      const templatePks = new Set(sorted.filter(p => p.is_template).map(p => p.pk));
      sorted.forEach(p => {
        if (p.variant_of != null && templatePks.has(p.variant_of)) {
          if (!variantMap.has(p.variant_of)) variantMap.set(p.variant_of, []);
          variantMap.get(p.variant_of).push(p);
          absorbedPks.add(p.pk);
        }
      });
    }

    const displayParts = sorted.filter(p => !absorbedPks.has(p.pk));
    const frag = document.createDocumentFragment();
    const ex   = { ...this.tvExtras(), onVariantHover: (el, v) => this.attachHoverEvents(el, v) };

    const renderPart = (part) => {
      const variants = variantMap.get(part.pk) ?? [];
      const { card, img } = variants.length > 0
        ? tvMakeGroupedCard(part, variants, this.prefs.fields, ex)
        : tvMakeCard(part, this.prefs.fields, ex);
      this.lazyObs.observe(img);
      this.attachHoverEvents(card, part);
      return card;
    };

    if (this.prefs.groupByCategory) {
      // Build a pk→name lookup from the categories cache (part.category is a plain integer pk)
      const catNameMap = new Map(
        (this.categoriesCache ?? []).map(c => [c.pk, c.name])
      );
      // Collect category groups, preserving internal sort order
      const catOrder  = [];
      const catGroups = new Map();
      displayParts.forEach(part => {
        const catPk   = part.category ?? part.category_detail?.pk ?? '__none__';
        const catName = catNameMap.get(catPk) ?? part.category_detail?.name ?? 'Uncategorized';
        if (!catGroups.has(catPk)) {
          catOrder.push(catPk);
          catGroups.set(catPk, { name: catName, parts: [] });
        }
        catGroups.get(catPk).parts.push(part);
      });
      // Sort category groups alphabetically; uncategorized last
      catOrder.sort((a, b) => {
        if (a === '__none__') return 1;
        if (b === '__none__') return -1;
        return catGroups.get(a).name.localeCompare(catGroups.get(b).name);
      });
      catOrder.forEach(catPk => {
        const { name, parts } = catGroups.get(catPk);
        const hdr = document.createElement('div');
        hdr.className = 'tv-cat-group-hdr';
        const nameSpan = document.createElement('span');
        nameSpan.textContent = name;
        const cntSpan = document.createElement('span');
        cntSpan.className = 'tv-cat-group-count';
        cntSpan.textContent = `${parts.length} part${parts.length !== 1 ? 's' : ''}`;
        hdr.appendChild(nameSpan);
        hdr.appendChild(cntSpan);
        frag.appendChild(hdr);
        parts.forEach(part => frag.appendChild(renderPart(part)));
      });
    } else {
      displayParts.forEach(part => frag.appendChild(renderPart(part)));
    }

    this.grid.appendChild(frag);
  }

  // Full reset — re-fetch (search / filter / sort changed)
  reset() {
    this.parts         = [];
    this.state.offset  = 0;
    this.state.total   = 0;
    this.state.loading = false;
    this.state.done    = false;
    this.lazyObs.disconnect();
    this.grid.innerHTML      = '';
    this.statusEl.textContent = '';
    this.loadPage();
  }

  // Re-render cards from cached data — no API call (display prefs changed)
  redrawExisting() {
    if (this.prefs.groupVariants || this.prefs.groupByCategory) {
      this.renderGrouped();
      return;
    }
    this.lazyObs.disconnect();
    this.grid.innerHTML = '';
    const frag = document.createDocumentFragment();
    this.parts.forEach(part => {
      const { card, img } = tvMakeCard(part, this.prefs.fields, this.tvExtras());
      this.lazyObs.observe(img);
      this.attachHoverEvents(card, part);
      frag.appendChild(card);
    });
    this.grid.appendChild(frag);
  }

  // ── Styles ─────────────────────────────────────────────────────────────────

  injectStyles() {
    // Remove stale versions to pick up CSS changes
    ['tv-plugin-styles', 'tv-plugin-styles-v2'].forEach(old => document.getElementById(old)?.remove());
    const id = 'tv-plugin-styles-v3';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      /* ── Toolbar ── */
      .tv-toolbar {
        display: flex; flex-wrap: wrap; gap: 8px;
        padding: 10px 12px; align-items: center;
        border-bottom: 1px solid var(--mantine-color-default-border);
        background: var(--mantine-color-body);
        box-shadow: 0 2px 8px rgba(0,0,0,.08);
        z-index: 10;
      }
      .tv-search { flex: 1; min-width: 160px; }
      .tv-input {
        padding: 6px 10px;
        border: 1px solid var(--mantine-color-default-border);
        border-radius: 6px;
        background: var(--mantine-color-default);
        color: var(--mantine-color-text);
        font-size: 0.84rem; font-family: inherit;
        outline: none; box-sizing: border-box;
      }
      .tv-input:focus { border-color: var(--mantine-color-blue-filled); }
      .tv-select { min-width: 130px; cursor: pointer; }
      .tv-btn {
        padding: 6px 14px;
        border: 1px solid var(--mantine-color-default-border);
        border-radius: 6px;
        background: var(--mantine-color-default);
        color: var(--mantine-color-text);
        font-size: 0.84rem; font-family: inherit;
        cursor: pointer; white-space: nowrap;
      }
      .tv-btn:hover { background: var(--mantine-color-default-hover); }
      .tv-size-wrap { display: flex; align-items: center; gap: 6px; }
      .tv-size-label { font-size: 0.78rem; color: var(--mantine-color-dimmed); white-space: nowrap; }
      .tv-slider { width: 90px; cursor: pointer; accent-color: var(--mantine-color-blue-filled); }

      /* ── Sub-panels — floating dropdowns ── */
      .tv-sub-panel {
        border: 1px solid var(--mantine-color-default-border);
        border-radius: 8px;
        background: var(--mantine-color-body);
        box-shadow: 0 6px 20px rgba(0,0,0,.18);
        overflow: hidden; /* clipped by border-radius; scrolling set inline */
      }
      .tv-sub-panel-v {
        display: flex; flex-direction: column;
        min-width: 220px; max-width: 300px;
        /* overflow-y applied inline by toggleDropdown so section headers stay sticky */
      }
      .tv-opt-section-hdr {
        padding: 7px 14px 5px;
        font-size: 0.70rem; font-weight: 700; letter-spacing: 0.06em;
        text-transform: uppercase; color: var(--mantine-color-dimmed);
        background: var(--mantine-color-default-hover);
        border-bottom: 1px solid var(--mantine-color-default-border);
      }
      .tv-opt-row {
        display: flex; align-items: center; gap: 8px;
        padding: 6px 14px;
        border-bottom: 1px solid var(--mantine-color-default-border);
      }
      .tv-opt-row:last-child { border-bottom: none; }
      .tv-opt-row:hover { background: var(--mantine-color-default-hover); }
      .tv-opt-check {
        flex-shrink: 0; cursor: pointer; width: 15px; height: 15px;
        accent-color: var(--mantine-color-blue-filled);
      }
      .tv-opt-label {
        font-size: 0.83rem; color: var(--mantine-color-text);
        cursor: pointer; flex: 1;
      }
      .tv-opt-desc {
        font-size: 0.72rem; color: var(--mantine-color-dimmed);
        display: block; margin-top: 1px;
      }
      .tv-filter-row { justify-content: space-between; }
      .tv-filter-row .tv-opt-label { flex: 1; }
      .tv-opt-select {
        flex-shrink: 0; padding: 3px 6px;
        border: 1px solid var(--mantine-color-default-border);
        border-radius: 5px;
        background: var(--mantine-color-default);
        color: var(--mantine-color-text);
        font-size: 0.78rem; font-family: inherit; cursor: pointer;
      }

      /* ── Status bar ── */
      .tv-status { padding: 4px 12px; font-size: 0.76rem; color: var(--mantine-color-dimmed); }

      /* ── Grid ── */
      .tv-grid { display: grid; gap: 12px; padding: 12px; }
      .tv-card {
        border: 1px solid var(--mantine-color-default-border);
        border-radius: 8px; overflow: hidden;
        background: var(--mantine-color-body);
        display: flex; flex-direction: column;
        transition: box-shadow 0.2s, transform 0.15s;
      }
      .tv-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,.15); transform: translateY(-2px); }

      /* ── Card image ── */
      .tv-img-wrap { display: block; position: relative; }
      .tv-group-overlay {
        position: absolute; top: 6px; right: 6px;
        background: var(--mantine-color-blue-filled);
        color: #fff; border-radius: 4px; padding: 3px 5px;
        display: flex; align-items: center; justify-content: center;
        pointer-events: none; line-height: 1;
      }
      .tv-img {
        width: 100%; aspect-ratio: 1;
        object-fit: contain; padding: 8px; display: block;
        border-bottom: 1px solid var(--mantine-color-default-border);
        box-sizing: border-box;
        background: var(--mantine-color-default-hover);
        opacity: 0.25; transition: opacity 0.3s;
      }

      /* ── Card body ── */
      .tv-body { padding: 8px; display: flex; flex-direction: column; gap: 3px; flex: 1; }
      .tv-name {
        font-weight: 600; font-size: 0.83rem;
        color: var(--mantine-color-text); text-decoration: none;
        display: block; word-break: break-word; line-height: 1.3;
      }
      .tv-name:hover { color: var(--mantine-color-anchor); text-decoration: underline; }
      .tv-field { font-size: 0.75rem; color: var(--mantine-color-dimmed); }
      .tv-desc {
        overflow: hidden; display: -webkit-box;
        -webkit-line-clamp: 2; -webkit-box-orient: vertical;
      }
      .tv-label    { font-weight: 600; color: var(--mantine-color-text); }
      .tv-stock-ok   { color: var(--mantine-color-green-text); }
      .tv-stock-none { color: var(--mantine-color-red-text); }
      .tv-badge {
        display: inline-block; font-size: 0.68rem;
        padding: 1px 8px; border-radius: 100px; margin-top: 3px;
      }
      .tv-badge-active   { background: var(--mantine-color-green-light); color: var(--mantine-color-green-text); }
      .tv-badge-inactive { background: var(--mantine-color-red-light);   color: var(--mantine-color-red-text); }
      .tv-badge-tmpl    { background: var(--mantine-color-blue-filled);  color: #fff; }
      .tv-badge-variant { background: var(--mantine-color-default-hover); color: var(--mantine-color-dimmed); border: 1px solid var(--mantine-color-default-border); }

      /* ── Parameter values ── */
      .tv-param-sep {
        border-top: 1px dashed var(--mantine-color-default-border);
        margin: 5px 0 3px;
      }

      /* ── Loading / error ── */
      .tv-sentinel    { height: 40px; }
      .tv-loading-bar { padding: 20px; text-align: center; color: var(--mantine-color-dimmed); font-size: 0.85rem; }
      .tv-error       { padding: 12px; color: var(--mantine-color-error); font-size: 0.85rem; }

      /* ── Variant list (group mode) ── */
      .tv-var-list {
        border-top: 1px solid var(--mantine-color-default-border);
        padding: 6px 8px;
        display: flex; flex-direction: column; gap: 1px;
      }
      .tv-var-hdr {
        font-size: 0.68rem; font-weight: 600; letter-spacing: 0.04em;
        color: var(--mantine-color-dimmed); text-transform: uppercase;
        padding-bottom: 4px;
      }
      .tv-var-row {
        display: flex; justify-content: space-between; align-items: center;
        padding: 3px 0;
        border-bottom: 1px solid var(--mantine-color-default-border);
      }
      .tv-var-row:last-child { border-bottom: none; }
      .tv-var-name {
        font-size: 0.77rem; color: var(--mantine-color-text);
        text-decoration: none; flex: 1; min-width: 0;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .tv-var-name:hover { color: var(--mantine-color-anchor); text-decoration: underline; }
      .tv-var-stock {
        font-size: 0.77rem; font-weight: 600;
        margin-left: 8px; flex-shrink: 0;
      }
      /* Separator — kept for compatibility, no longer used in panels */
      .tv-sub-sep {
        width: 1px; height: 18px; margin: 0 4px;
        background: var(--mantine-color-default-border);
        display: inline-block; align-self: center;
      }

      /* ── Hover popover ── */
      .tv-popover {
        background: var(--mantine-color-body);
        border: 1px solid var(--mantine-color-default-border);
        border-radius: 10px;
        box-shadow: 0 8px 32px rgba(0,0,0,.25);
        font-family: inherit; font-size: 0.82rem;
        overflow: hidden; max-height: 440px; overflow-y: auto;
      }
      .tv-pop-header { padding: 10px 12px 4px; }
      .tv-pop-name {
        font-weight: 700; font-size: 0.88rem;
        color: var(--mantine-color-text); text-decoration: none;
        display: block; line-height: 1.3; cursor: pointer;
      }
      .tv-pop-name:hover { color: var(--mantine-color-anchor); text-decoration: underline; }
      .tv-pop-ipn  { padding: 0 12px 4px; font-size: 0.74rem; color: var(--mantine-color-dimmed); }
      .tv-pop-desc { padding: 0 12px 8px; font-size: 0.78rem; color: var(--mantine-color-dimmed);
                     display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
      .tv-pop-divider { border-top: 1px solid var(--mantine-color-default-border); margin: 2px 0; }
      .tv-pop-rows { padding: 6px 12px; display: flex; flex-direction: column; gap: 4px; }
      .tv-pop-row  { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 0.80rem; }
      .tv-pop-lbl  { color: var(--mantine-color-dimmed); font-size: 0.73rem; flex-shrink: 0; }
      .tv-pop-loc-val { color: var(--mantine-color-text); text-align: right; font-size: 0.78rem; }
      .tv-pop-sec-hdr { padding: 6px 12px 3px; font-size: 0.72rem; font-weight: 700;
                        color: var(--mantine-color-dimmed); text-transform: uppercase; letter-spacing: 0.05em; }
      .tv-pop-loading { font-weight: 400; opacity: 0.65; }
      .tv-pop-locs { padding: 2px 12px 10px; display: flex; flex-direction: column; gap: 3px; }
      .tv-pop-loc-row { display: flex; justify-content: space-between; align-items: center; gap: 8px;
                        padding: 3px 0; border-bottom: 1px solid var(--mantine-color-default-border);
                        font-size: 0.78rem; }
      .tv-pop-loc-row:last-child { border-bottom: none; }
      .tv-pop-loc-name { color: var(--mantine-color-text); min-width: 0; flex: 1;
                         white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

      /* ── Category filter popover ── */
      .tv-cat-panel {
        background: var(--mantine-color-body);
        border: 1px solid var(--mantine-color-default-border);
        border-radius: 8px;
        box-shadow: 0 6px 20px rgba(0,0,0,.18);
        display: flex; flex-direction: column;
        overflow: hidden; font-family: inherit; font-size: 0.83rem;
      }
      .tv-cat-header {
        display: flex; gap: 6px; align-items: center;
        padding: 8px 10px;
        border-bottom: 1px solid var(--mantine-color-default-border);
        flex-shrink: 0;
      }
      .tv-cat-search { flex: 1; min-width: 0; }
      .tv-cat-clear-btn { flex-shrink: 0; padding: 4px 10px !important; font-size: 0.78rem !important; }
      .tv-cat-tree { overflow-y: auto; flex: 1; padding: 4px 0; min-height: 60px; }
      .tv-cat-loading {
        padding: 12px; font-size: 0.82rem;
        color: var(--mantine-color-dimmed); text-align: center;
      }
      .tv-cat-row {
        display: flex; align-items: center; gap: 5px;
        padding: 3px 8px; border-radius: 4px; cursor: default; min-height: 26px;
      }
      .tv-cat-row:hover { background: var(--mantine-color-default-hover); }
      .tv-cat-expand-btn {
        flex-shrink: 0; width: 18px; height: 18px; padding: 0;
        border: none; background: transparent; cursor: pointer;
        color: var(--mantine-color-dimmed); font-size: 0.6rem;
        display: flex; align-items: center; justify-content: center;
        border-radius: 3px;
      }
      .tv-cat-expand-btn:hover { background: var(--mantine-color-default-hover); color: var(--mantine-color-text); }
      .tv-cat-indent { display: inline-block; width: 18px; flex-shrink: 0; }
      .tv-cat-check { flex-shrink: 0; cursor: pointer; accent-color: var(--mantine-color-blue-filled); }
      .tv-cat-name {
        font-size: 0.82rem; color: var(--mantine-color-text);
        cursor: pointer; flex: 1; min-width: 0;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .tv-cat-name:hover { color: var(--mantine-color-anchor); }
      .tv-cat-row-has-sel {
        background: var(--mantine-color-blue-light, rgba(51,154,240,0.08));
        border-left: 2px solid var(--mantine-color-blue-filled);
      }
      .tv-cat-row-has-sel:hover {
        background: var(--mantine-color-blue-light, rgba(51,154,240,0.14));
      }
      .tv-cat-desc-badge {
        flex-shrink: 0; margin-left: 6px;
        background: var(--mantine-color-blue-filled);
        color: #fff; font-size: 0.68rem; font-weight: 700;
        padding: 1px 6px; border-radius: 100px; line-height: 1.6;
        pointer-events: none;
      }
      .tv-cat-highlight {
        background: var(--mantine-color-yellow-light, rgba(255,220,0,0.3));
        color: inherit; border-radius: 2px; padding: 0 1px;
      }
      .tv-btn-active {
        background: var(--mantine-color-blue-filled) !important;
        color: #fff !important;
        border-color: var(--mantine-color-blue-filled) !important;
      }

      /* ── Category group header (group by category) ── */
      .tv-cat-group-hdr {
        grid-column: 1 / -1;
        display: flex; align-items: center; justify-content: space-between;
        padding: 10px 12px 9px; margin-top: 18px;
        font-weight: 800; font-size: 1rem;
        color: var(--mantine-color-text);
        background: var(--mantine-color-blue-light, rgba(51,154,240,0.08));
        border-left: 4px solid var(--mantine-color-blue-filled);
        border-bottom: 1px solid var(--mantine-color-blue-filled);
        border-radius: 4px 4px 0 0;
        letter-spacing: 0.02em;
        text-transform: uppercase;
      }
      .tv-cat-group-hdr:first-child { margin-top: 0; }
      .tv-cat-group-count {
        font-weight: 500; font-size: 0.78rem; text-transform: none; letter-spacing: 0;
        color: var(--mantine-color-dimmed); white-space: nowrap;
        background: var(--mantine-color-default-hover);
        padding: 2px 8px; border-radius: 100px;
      }
    `;
    document.head.appendChild(style);
  }
}

// ── Panel entry point ─────────────────────────────────────────────────────────

export async function renderPanel(target, data) {
  if (!target) return;
  try {
    new TileView(target, data?.id).init();
  } catch (err) {
    target.innerHTML = `
      <div style="padding:24px;text-align:center;color:var(--mantine-color-dimmed,#888);font-family:inherit;">
        <div style="font-size:2rem;margin-bottom:8px;">⚠️</div>
        <div style="font-weight:600;margin-bottom:6px;color:var(--mantine-color-text,inherit);">Tile View failed to load</div>
        <div style="font-size:0.85rem;margin-bottom:12px;">${err && err.message ? err.message : 'An unexpected error occurred.'}</div>
        <div style="font-size:0.78rem;">
          If static files are missing, run:<br>
          <code style="background:var(--mantine-color-default,#f0f0f0);padding:2px 6px;border-radius:4px;">
            docker exec inventree-server invoke static
          </code>
          <br>then reload the page.
        </div>
      </div>`;
    console.error('[TileView] renderPanel error:', err);
  }
}
