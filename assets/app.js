(function () {
  'use strict';

  // Set from data/trips.json + the selected trip's "config" block (see boot at the bottom).
  var MANIFEST = null, TRIP = null;
  var REPO = '', STORE_KEY = '';
  var TARGET_LOW = null, TARGET_HIGH = null;
  var LEGACY_STORE_KEY = 'africa2627-feedback-v1';

  // ---------- helpers ----------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') n.className = attrs[k]; else n.setAttribute(k, attrs[k]);
    });
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function md(s) {
    s = s || '';
    if (window.marked) {
      try { return window.marked.parse(s.replace(/~/g, '\\~')); } catch (e) { /* fall through */ }
    }
    return '<p>' + esc(s).replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br>') + '</p>';
  }
  function mdInline(s) {
    if (window.marked && window.marked.parseInline) {
      try { return window.marked.parseInline((s || '').replace(/~/g, '\\~')); } catch (e) { /* fall through */ }
    }
    return esc(s);
  }
  function usd(n) { return '$' + Math.round(n || 0).toLocaleString('en-US'); }
  function fmtDate(iso, opts) {
    var d = new Date(iso + 'T12:00:00');
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('en-US', opts || { weekday: 'short', month: 'short', day: 'numeric' });
  }

  // ---------- feedback store ----------
  // One store per trip, so notes and ticked options never leak between trips.
  var store = { notes: {}, reacts: {}, general: '', altsById: {} };
  function initStore(isDefault) {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw && isDefault) raw = localStorage.getItem(LEGACY_STORE_KEY);
      if (raw) store = Object.assign(store, JSON.parse(raw));
    } catch (e) { /* storage unavailable */ }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* ignore */ }
    refreshFeedback();
  }

  function feedbackTools(key, label) {
    var wrap = el('div', { class: 'section-tools' });
    var btn = el('button', { class: 'fb-btn', type: 'button', 'aria-expanded': 'false' }, '💬 Note');
    var react = el('span', { class: 'react' });
    [['👍', 'love'], ['🤔', 'unsure'], ['👎', 'change']].forEach(function (r) {
      var b = el('button', { type: 'button', title: r[1], 'aria-pressed': 'false' }, r[0]);
      if (store.reacts[key] === r[1]) { b.classList.add('on'); b.setAttribute('aria-pressed', 'true'); }
      b.addEventListener('click', function () {
        store.reacts[key] = store.reacts[key] === r[1] ? undefined : r[1];
        if (!store.reacts[key]) delete store.reacts[key];
        Array.prototype.forEach.call(react.children, function (c) { c.classList.remove('on'); c.setAttribute('aria-pressed', 'false'); });
        if (store.reacts[key]) { b.classList.add('on'); b.setAttribute('aria-pressed', 'true'); }
        store.labels = store.labels || {}; store.labels[key] = label;
        save();
      });
      react.appendChild(b);
    });
    var box = el('div', { class: 'fb-box' });
    var ta = el('textarea', { rows: '2', placeholder: 'Your note on ' + label + '…' });
    ta.value = store.notes[key] || '';
    if (ta.value) { btn.classList.add('has-note'); box.classList.add('open'); }
    ta.addEventListener('input', function () {
      if (ta.value.trim()) store.notes[key] = ta.value; else delete store.notes[key];
      store.labels = store.labels || {}; store.labels[key] = label;
      btn.classList.toggle('has-note', !!ta.value.trim());
      save();
    });
    btn.addEventListener('click', function () {
      var open = box.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(open));
      if (open) ta.focus();
    });
    box.appendChild(ta);
    wrap.appendChild(btn); wrap.appendChild(react);
    var frag = document.createDocumentFragment();
    frag.appendChild(wrap); frag.appendChild(box);
    return frag;
  }

  function addSectionTools() {
    document.querySelectorAll('section[data-section]').forEach(function (s) {
      var h = s.querySelector('h2');
      var name = s.getAttribute('data-section');
      h.insertAdjacentElement('afterend', el('div'));
      h.nextSibling.appendChild(feedbackTools('section:' + name, name + ' (section)'));
    });
  }

  // ---------- location colors ----------
  // Colors come from each place's "kind" (home | abroad | city | transit | nature), not its name.
  function kindOf(code) { return ((plan.places || {})[code] || {}).kind || 'city'; }
  function locStyle(date) {
    var k = kindOf(placeForDate(date));
    if (k === 'abroad') return ['var(--blue)', 'var(--blue-soft)'];
    if (k === 'nature') return ['var(--green)', 'var(--green-soft)'];
    if (k === 'home' || k === 'transit') return ['var(--muted)', 'var(--line)'];
    return ['var(--accent)', 'var(--accent-soft)'];
  }
  function tripDates(p) {
    var d = (p || plan).dates || {};
    return { depart: d.depart || d.depart_lax, ret: d['return'] || d.return_lax };
  }
  function cfg(p) { return (p || plan).config || {}; }
  // nights per country, from stays + places[].country
  function nightsByCountry(p) {
    var out = {}, order = [];
    ((p || plan).stays || []).forEach(function (s) {
      var c = (((p || plan).places || {})[s.place] || {}).country || '?';
      if (!(c in out)) { out[c] = 0; order.push(c); }
      out[c] += s.nights;
    });
    return order.map(function (c) { return [c, out[c]]; });
  }
  function kfmt(n) { return '$' + (Math.round(n / 100) / 10).toString().replace(/\.0$/, '') + 'k'; }
  function targetLabel() { return TARGET_LOW == null ? '' : kfmt(TARGET_LOW).replace(/k$/, '') + '–' + kfmt(TARGET_HIGH).slice(1); }

  // ---------- renderers ----------
  // option state is keyed by each alternative's stable id (not its array index)
  var plan, altState = {}, optLayers = {};
  function altId(a, i) { return a.id || 'alt-' + i; }
  function altById(id) { return (plan.alternatives || []).filter(function (a, i) { return altId(a, i) === id; })[0]; }
  function syncOptionLayers() {
    Object.keys(optLayers).forEach(function (id) {
      var on = !!altState[id];
      optLayers[id].forEach(function (lay) {
        if (lay.setStyle) lay.setStyle({ opacity: on ? 1 : .55, color: on ? '#b5542a' : '#8a7f73' });
        var elx = lay.getElement && lay.getElement();
        if (elx) elx.classList.toggle('opt-on', on);
      });
    });
  }

  function renderHero() {
    document.title = plan.title || document.title;
    $('#title').textContent = plan.title || 'Trip';
    var d = tripDates();
    var long = { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' };
    $('#dates').textContent = fmtDate(d.depart, long) + '  →  ' + fmtDate(d.ret, long);
    var days = (plan.itinerary || []).length;
    var stats = [[days, 'days door to door']]
      .concat(nightsByCountry().filter(function (c) { return c[1] > 0; }).map(function (c) { return [c[1], 'nights in ' + c[0]]; }))
      .concat([[usd(plan.budget_total_per_person_usd), 'planned per person'],
               TARGET_LOW != null ? [targetLabel(), 'target per person'] : null]);
    $('#stats').innerHTML = stats.filter(Boolean).map(function (s) {
      return '<div class="stat"><b>' + esc(s[0]) + '</b><span>' + esc(s[1]) + '</span></div>';
    }).join('');
  }

  function renderItinerary() {
    var list = $('#itinerary-list');
    (plan.itinerary || []).forEach(function (day, i) {
      var c = locStyle(day.date);
      var li = el('li', { class: 'day', id: 'day-' + (i + 1) });
      li.style.setProperty('--loc', c[0]); li.style.setProperty('--loc-soft', c[1]);
      var card = el('div', { class: 'day-card' });
      card.innerHTML =
        '<div class="day-head">' +
          '<span class="day-date">' + esc(day.day_label || ('Day ' + (i + 1))) + ' · ' + esc(fmtDate(day.date, { month: 'short', day: 'numeric' })) + '</span>' +
          '<h3 class="day-title">' + esc(day.title) + '</h3>' +
          '<span class="loc-tag">' + esc(day.location) + '</span>' +
        '</div>' +
        '<div class="day-body">' + md(day.details) + '</div>' +
        '<div class="day-meta">' +
          (day.overnight ? '🛏 <b>' + mdInline(day.overnight) + '</b>' : '') +
          (day.meals ? ' &nbsp;·&nbsp; 🍽 ' + esc(day.meals) : '') +
        '</div>';
      (choiceLegsByDate()[day.date] || []).forEach(function (l) {
        card.insertAdjacentHTML('beforeend', '<div class="choice-slot" data-leg="' + (plan.legs || []).indexOf(l) + '">' + choiceHTML(l) + '</div>');
      });
      card.appendChild(feedbackTools('day:' + day.date, fmtDate(day.date) + ' — ' + day.title));
      li.appendChild(card);
      list.appendChild(li);
    });
  }

  function renderLodging() {
    var grid = $('#lodging-grid');
    (plan.lodging || []).forEach(function (l) {
      var card = el('article', { class: 'card' });
      card.innerHTML =
        '<h3>' + (l.url ? '<a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.name) + '</a>' : esc(l.name)) + '</h3>' +
        '<div class="sub">' + esc(l.location) + (l.style ? ' · ' + esc(l.style) : '') + '</div>' +
        '<div class="price">' + usd(l.pppn_usd) + ' <small>pp / night × ' + esc(l.nights) + ' = ' + usd(l.pppn_usd * l.nights) + ' pp</small></div>' +
        '<p><b>Includes:</b> ' + mdInline(l.includes) + '</p>' +
        '<p>' + mdInline(l.why) + '</p>' +
        (l.alternatives ? '<p class="alts-note"><b>Alternatives:</b> ' + mdInline(l.alternatives) + '</p>' : '');
      card.appendChild(feedbackTools('lodging:' + l.name, l.name));
      grid.appendChild(card);
    });
  }

  function groupBudget() {
    var groups = [], idx = {};
    (plan.budget || []).forEach(function (b) {
      if (!(b.category in idx)) { idx[b.category] = groups.length; groups.push({ name: b.category, items: [], total: 0, low: 0, high: 0 }); }
      var g = groups[idx[b.category]];
      g.items.push(b); g.total += b.per_person_usd || 0; g.low += b.low_usd || 0; g.high += b.high_usd || 0;
    });
    return groups;
  }

  function altDelta() {
    return (plan.alternatives || []).reduce(function (sum, a, i) {
      return sum + (altState[altId(a, i)] ? (a.cost_delta_per_person_usd || 0) : 0);
    }, 0);
  }

  function renderBudgetSummary() {
    var groups = groupBudget();
    var base = groups.reduce(function (s, g) { return s + g.total; }, 0);
    var low = groups.reduce(function (s, g) { return s + g.low; }, 0);
    var high = groups.reduce(function (s, g) { return s + g.high; }, 0);
    var delta = altDelta();
    var total = base + delta;
    var scaleMax = Math.max(7000, high, total) * 1.02;
    var pct = function (v) { return Math.min(100, (v / scaleMax) * 100); };
    var hasTarget = TARGET_LOW != null;
    var status = !hasTarget ? 'planned' : total < TARGET_LOW ? 'under target' : total <= TARGET_HIGH ? 'within target' : 'over target';
    var maxCat = Math.max.apply(null, groups.map(function (g) { return g.total; }).concat([1]));

    $('#budget-summary').innerHTML =
      '<div class="total-line"><b>' + usd(total) + '</b> per person — <span>' + status + '</span>' +
        (delta ? ' <span class="hint">(base ' + usd(base) + (delta > 0 ? ' + ' : ' − ') + usd(Math.abs(delta)) + ' in selected options)</span>' : '') +
        ' · about <b style="font-size:1.1rem">' + usd(total * 2) + '</b> for two' +
      '</div>' +
      '<div><div class="meter" role="img" aria-label="Planned total ' + usd(total) + (hasTarget ? ' against the ' + usd(TARGET_LOW) + ' to ' + usd(TARGET_HIGH) + ' target' : '') + '">' +
        '<div class="meter-fill" style="width:' + pct(total) + '%"></div>' +
        (hasTarget ? '<div class="meter-band" style="left:' + pct(TARGET_LOW) + '%;width:' + (pct(TARGET_HIGH) - pct(TARGET_LOW)) + '%" title="Target ' + targetLabel() + '"></div>' : '') +
      '</div>' +
      '<div class="meter-labels"><span>$0</span><span>' + (hasTarget ? 'Target band ' + targetLabel() + ' (dashed) · ' : '') + 'realistic range ' + usd(low) + '–' + usd(high) + '</span><span>' + usd(scaleMax) + '</span></div></div>' +
      '<div class="cat-bars">' + groups.map(function (g) {
        return '<div class="cat-bar"><span>' + esc(g.name) + '</span><div class="bar" style="width:' + Math.max(2, g.total / maxCat * 100) + '%"></div><span class="num">' + usd(g.total) + '</span></div>';
      }).join('') + '</div>';
  }

  function renderBudgetTable() {
    var tbody = $('#budget-table tbody');
    var groups = groupBudget(), rows = '', tot = 0, lo = 0, hi = 0;
    groups.forEach(function (g) {
      rows += '<tr class="cat"><td>' + esc(g.name) + '</td><td class="num">' + usd(g.total) + '</td><td class="num">' + usd(g.low) + '–' + usd(g.high) + '</td><td></td></tr>';
      g.items.forEach(function (b) {
        rows += '<tr><td>' + esc(b.item) + '</td><td class="num">' + usd(b.per_person_usd) + '</td><td class="num">' + usd(b.low_usd) + '–' + usd(b.high_usd) + '</td><td class="notes">' + mdInline(b.notes || '') + '</td></tr>';
      });
      tot += g.total; lo += g.low; hi += g.high;
    });
    rows += '<tr class="total"><td>Total per person</td><td class="num">' + usd(tot) + '</td><td class="num">' + usd(lo) + '–' + usd(hi) + '</td><td class="notes">≈ ' + usd(tot * 2) + ' for two travelers</td></tr>';
    tbody.innerHTML = rows;
  }

  function renderAlternatives() {
    var list = $('#alt-list');
    altState = store.altsById || {};
    (plan.alternatives || []).forEach(function (a, i) {
      var id = altId(a, i);
      var d = a.cost_delta_per_person_usd || 0;
      var lab = el('label', { class: 'alt' });
      lab.innerHTML =
        '<input type="checkbox"' + (altState[id] ? ' checked' : '') + '>' +
        '<div><b>' + esc(a.name) + '</b><p>' + mdInline(a.description) + '</p></div>' +
        '<span class="delta ' + (d > 0 ? 'up' : 'down') + '">' + (d > 0 ? '+' : d < 0 ? '−' : '±') + usd(Math.abs(d)) + ' pp</span>';
      lab.querySelector('input').addEventListener('change', function (e) {
        altState[id] = e.target.checked; store.altsById = altState;
        save(); renderBudgetSummary(); syncOptionLayers(); refreshChoices();
      });
      if (!a.days) { lab.id = 'opt-' + id; list.appendChild(lab); return; }
      var wrap = el('div', { class: 'alt-wrap', id: 'opt-' + id });
      wrap.appendChild(lab);
      var det = el('details', { class: 'alt-days' });
      det.innerHTML = '<summary>Days, travel times &amp; costs</summary>' +
        (a.place && (plan.photos || {})[a.place] ? '<div class="ph ph-alt"><img loading="lazy" alt=""></div>' : '') +
        '<ol>' + a.days.map(function (d) {
          return '<li><b>' + esc(fmtDate(d.date)) + ' — ' + esc(d.title) + '.</b> ' + mdInline(d.details) + '</li>';
        }).join('') + '</ol>' +
        (a.cost_notes ? '<p class="hint">' + mdInline(a.cost_notes) + '</p>' : '');
      wrap.appendChild(det);
      var img = det.querySelector('img');
      if (img) photoFor(a.place).then(function (info) { fillImg(img, info, 640); });
      list.appendChild(wrap);
    });
    syncOptionLayers();
  }

  function renderBooking() {
    $('#booking-list').innerHTML = (plan.booking_timeline || []).map(function (b) {
      return '<li><span class="when">' + esc(b.when) + ':</span> ' + mdInline(b.task) + '</li>';
    }).join('');
  }

  function renderQuestions() {
    var ol = $('#questions-list');
    (plan.open_questions || []).forEach(function (q, i) {
      var li = el('li', null, '<div>' + mdInline(q) + '</div>');
      var ta = el('textarea', { rows: '2', placeholder: 'Your answer…', 'aria-label': 'Answer to question ' + (i + 1) });
      var key = 'q:' + i;
      ta.value = store.notes[key] || '';
      ta.addEventListener('input', function () {
        if (ta.value.trim()) store.notes[key] = ta.value; else delete store.notes[key];
        store.labels = store.labels || {}; store.labels[key] = 'Q' + (i + 1) + ': ' + q;
        save();
      });
      li.appendChild(ta);
      ol.appendChild(li);
    });
  }

  function renderProse() {
    $('#overview-body').innerHTML = md(plan.overview);
    $('#practical-body').innerHTML = md(plan.practical);
    $('#sources-list').innerHTML = (plan.sources || []).map(function (s) {
      var m = String(s).match(/https?:\/\/\S+/);
      return '<li>' + (m ? '<a href="' + esc(m[0]) + '" target="_blank" rel="noopener">' + esc(s) + '</a>' : esc(s)) + '</li>';
    }).join('');
  }

  // ---------- feedback output ----------
  function feedbackText() {
    var labels = store.labels || {}, out = [];
    if (store.general && store.general.trim()) out.push('## General\n' + store.general.trim());
    var reactNames = { love: '👍 love it', unsure: '🤔 unsure', change: '👎 change this' };
    var keys = Object.keys(Object.assign({}, store.notes, store.reacts));
    var items = keys.map(function (k) {
      var line = '- **' + (labels[k] || k) + '**';
      if (store.reacts[k]) line += ' — ' + reactNames[store.reacts[k]];
      if (store.notes[k]) line += '\n  ' + store.notes[k].trim().replace(/\n/g, '\n  ');
      return line;
    });
    if (items.length) out.push('## Notes\n' + items.join('\n'));
    var alts = Object.keys(store.altsById || {}).filter(function (k) { return store.altsById[k] && altById(k); })
      .map(function (k) { return '- ' + altById(k).name; });
    if (alts.length) out.push('## Options I\'m interested in\n' + alts.join('\n'));
    return out.join('\n\n');
  }

  function refreshFeedback() {
    var count = Object.keys(store.notes).length + Object.keys(store.reacts).length + (store.general && store.general.trim() ? 1 : 0);
    $('#fb-count').textContent = count;
    var t = plan ? feedbackText() : '';
    $('#fb-preview').textContent = t || 'No notes yet — use 💬 and 👍/🤔/👎 throughout the page.';
  }

  function wireFeedback() {
    var gen = $('#fb-general');
    gen.value = store.general || '';
    gen.addEventListener('input', function () { store.general = gen.value; save(); });
    $('#fb-issue').addEventListener('click', function () {
      var body = feedbackText() || '(no notes)';
      var url = 'https://github.com/' + REPO + '/issues/new?labels=feedback&title=' +
        encodeURIComponent('Trip feedback: ' + (TRIP ? TRIP.label : plan.title)) + '&body=' + encodeURIComponent(body.slice(0, 6000));
      window.open(url, '_blank', 'noopener');
      $('#fb-status').textContent = body.length > 6000 ? 'Long feedback was truncated in the link — use "Copy as text" and paste the rest.' : 'Opened GitHub — review and press "Submit new issue".';
    });
    $('#fb-copy').addEventListener('click', function () {
      var t = feedbackText();
      (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject())
        .then(function () { $('#fb-status').textContent = 'Copied.'; })
        .catch(function () { $('#fb-status').textContent = 'Copy failed — select the preview text manually.'; });
    });
    $('#fb-clear').addEventListener('click', function () {
      if (!confirm('Clear all your notes on this device?')) return;
      store = { notes: {}, reacts: {}, general: '', altsById: {} };
      save(); location.reload();
    });
  }


  // ---------- route map + travel timeline ----------
  function addDays(iso, n) {
    var d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  // "~4h", "~1.5–2h", "~45m–1h", "~1h10–2h", "~13h45", "~15–30m" → [low, high] hours
  function hoursOf(dur) {
    var parts = String(dur).replace(/[~\s]/g, '').split(/[–-]/);
    var vals = parts.map(function (p) {
      var m = p.match(/^([\d.]+)(h|m)?(\d+)?/);
      if (!m) return null;
      return { n: parseFloat(m[1]), unit: m[2] || null, extra: m[3] ? parseInt(m[3], 10) : 0 };
    }).filter(Boolean);
    if (!vals.length) return [0, 0];
    var lastUnit = vals[vals.length - 1].unit || 'h';
    var hrs = vals.map(function (v) {
      var u = v.unit || lastUnit;
      return u === 'm' ? v.n / 60 : v.n + v.extra / 60;
    });
    return [hrs[0], hrs[hrs.length - 1]];
  }
  function fmtHours(h) {
    if (h < 1) return Math.round(h * 12) * 5 + 'm';
    return (h >= 6 ? Math.round(h) : Math.round(h * 2) / 2) + 'h';
  }
  function fmtRange(a) {
    var lo = fmtHours(a[0]), hi = fmtHours(a[1]);
    if (lo === hi) return '~' + hi;
    return '~' + (/h$/.test(lo) && /h$/.test(hi) ? lo.replace(/h$/, '') : lo) + '–' + hi;
  }
  // "Region" = places in config.region.country (e.g. the safari country); used for the zoomed map view.
  function inRegion(code) {
    var p = (plan.places || {})[code], r = cfg().region;
    if (!p) return false;
    if (r && r.country) return p.country === r.country;
    return p.kind !== 'home' && p.kind !== 'abroad';
  }
  function stayClass(code) {
    var k = kindOf(code);
    if (k === 'abroad') return 'stay-ist';
    if (k === 'nature') return 'stay-k';
    return 'stay-city';
  }

  function arc(a, b) {
    // gentle curve for flights: quadratic bezier bowed north
    var pts = [], mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    var dx = b[1] - a[1], dy = b[0] - a[0];
    var ctrl = [mid[0] + Math.abs(dx) * 0.12, mid[1] - dy * 0.12];
    for (var t = 0; t <= 1.0001; t += 0.05) {
      pts.push([(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * ctrl[0] + t * t * b[0],
                (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * ctrl[1] + t * t * b[1]]);
    }
    return pts;
  }

  function renderRoute() {
    var places = plan.places || {}, legs = plan.legs || [];
    var list = $('#legs-list');
    var legLayers = [];
    var map = null;

    if (window.L && $('#map')) {
      var dark = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
      map = L.map('map', { scrollWheelZoom: false, worldCopyJump: true });
      // Keyless tile sources: OpenStreetMap first, Esri World Street Map if OSM tiles fail.
      var osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 12,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      });
      var esri = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 12,
        attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors'
      });
      var tileErrors = 0;
      osm.on('tileerror', function () {
        if (++tileErrors === 3) { map.removeLayer(osm); esri.addTo(map); }
      });
      osm.addTo(map);
      if (dark) $('#map').classList.add('dark-tiles');
      var css = getComputedStyle(document.documentElement);
      var cFlight = css.getPropertyValue('--blue').trim() || '#2f5d7c';
      var cRoad = css.getPropertyValue('--green').trim() || '#4f6b3a';

      var order = [];
      legs.forEach(function (l) { [l.from, l.to].forEach(function (c) { if (order.indexOf(c) < 0) order.push(c); }); });
      var stops = ['LAX'];
      (plan.stays || []).forEach(function (st) { if (stops.indexOf(st.place) < 0) stops.push(st.place); });
      order.forEach(function (code) {
        var p = places[code]; if (!p) return;
        var n = stops.indexOf(code);
        var kenya = kindOf(code) === 'nature';
        var icon = n >= 0
          ? L.divIcon({ className: '', html: '<div class="stop-pin' + (kenya ? ' k' : '') + '">' + (n + 1) + '</div>', iconSize: [24, 24], iconAnchor: [12, 12] })
          : L.divIcon({ className: '', html: '<div class="via-dot"></div>', iconSize: [10, 10], iconAnchor: [5, 5] });
        L.marker([p.lat, p.lng], { icon: icon, title: p.name, zIndexOffset: n >= 0 ? 100 : 0 })
          .addTo(map).bindTooltip(p.name, { direction: 'top', offset: [0, n >= 0 ? -12 : -5] });
      });

      var labelled = {};
      legs.forEach(function (l) {
        var a = places[l.from], b = places[l.to]; if (!a || !b) return;
        var A = [a.lat, a.lng], B = [b.lat, b.lng];
        var flight = l.mode === 'flight';
        var pts = flight ? arc(A, B) : [A, B];
        var line = L.polyline(pts, { color: flight ? cFlight : cRoad, weight: flight ? 2.5 : 4, dashArray: flight ? '6 7' : null, opacity: .9 }).addTo(map);
        var midPt = pts[Math.floor(pts.length / 2)];
        if (!flight) midPt = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
        var pairKey = [l.from, l.to].sort().join('-');
        if (!labelled[pairKey] && hoursOf(l.duration)[1] >= 1) {
          labelled[pairKey] = true;
          L.tooltip({ permanent: true, direction: 'center', className: 'dur ' + l.mode })
            .setLatLng(midPt).setContent((flight ? '✈ ' : '🚙 ') + l.duration).addTo(map);
        }
        line.bindPopup('<b>' + esc(places[l.from].name) + ' → ' + esc(places[l.to].name) + '</b><br>' + esc(fmtDate(l.date)) + ' · ' + esc(l.duration) + '<br>' + esc(l.detail || ''));
        legLayers.push(line);
      });

      // optional routes (from alternatives with legs): grey dotted, brighter when the option is ticked
      (plan.alternatives || []).forEach(function (alt, ai) {
        if (!alt.legs) return;
        var grp = [];
        if (alt.place && places[alt.place]) {
          var pp = places[alt.place];
          grp.push(L.marker([pp.lat, pp.lng], {
            icon: L.divIcon({ className: '', html: '<div class="stop-pin opt">★</div>', iconSize: [24, 24], iconAnchor: [12, 12] }),
            title: pp.name + ' (option)'
          }).addTo(map).bindTooltip(pp.name + ' · option', { direction: 'top', offset: [0, -12] }));
        }
        alt.legs.forEach(function (l) {
          var a = places[l.from], b = places[l.to]; if (!a || !b) return;
          var A = [a.lat, a.lng], B = [b.lat, b.lng], flight = l.mode === 'flight';
          var pts = flight ? arc(A, B) : [A, B];
          var line = L.polyline(pts, { color: '#8a7f73', weight: 3, dashArray: '2 7', opacity: .8, lineCap: 'round' }).addTo(map)
            .bindPopup('<b>Option: ' + esc(alt.name) + '</b><br>' + esc(a.name) + ' → ' + esc(b.name) + ' · ' + esc(l.duration) + '<br>' + esc(l.detail || ''));
          grp.push(line);
          if (hoursOf(l.duration)[1] >= 1) {
            var mid = flight ? pts[Math.floor(pts.length / 2)] : [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
            grp.push(L.tooltip({ permanent: true, direction: 'center', className: 'dur road opt' })
              .setLatLng(mid).setContent('option ' + (flight ? '✈ ' : '🚙 ') + l.duration).addTo(map));
          }
        });
        optLayers[altId(alt, ai)] = grp;
      });
      syncOptionLayers();

      var allB = L.featureGroup(legLayers).getBounds();
      var regionCodes = Object.keys(places).filter(inRegion);
      var keB = regionCodes.length ? L.latLngBounds(regionCodes.map(function (c) { return [places[c].lat, places[c].lng]; })) : allB;
      var views = { all: function () { map.fitBounds(allB, { padding: [30, 30] }); }, region: function () { map.fitBounds(keB, { padding: [50, 50] }); } };
      var rb = $('.map-tools [data-view=region]');
      if (rb) { rb.textContent = (cfg().region && cfg().region.label) || 'Zoom in'; rb.hidden = !regionCodes.length; }
      views.all();
      var syncZoom = function () { $('#map').classList.toggle('zoomed-out', map.getZoom() < 6); };
      map.on('zoomend', syncZoom); syncZoom();
      document.querySelectorAll('.map-tools .chip').forEach(function (btn) {
        btn.addEventListener('click', function () {
          document.querySelectorAll('.map-tools .chip').forEach(function (b) { b.classList.remove('on'); });
          btn.classList.add('on'); views[btn.getAttribute('data-view')]();
        });
      });
    } else if ($('#map')) {
      $('#map').style.display = 'none';
    }

    var dayGroups = [];
    legs.forEach(function (l, i) {
      var g = dayGroups[dayGroups.length - 1];
      if (!g || g.date !== l.date) { g = { date: l.date, legs: [], idx: [] }; dayGroups.push(g); }
      g.legs.push(l); g.idx.push(i);
    });
    dayGroups.forEach(function (g) {
      var first = g.legs[0], last = g.legs[g.legs.length - 1];
      var tot = g.legs.reduce(function (a, l) { var h = hoursOf(l.duration); return [a[0] + h[0], a[1] + h[1]]; }, [0, 0]);
      var flight = g.legs.some(function (l) { return l.mode === 'flight'; });
      var name = function (c) { return (places[c] || {}).name || c; };
      var segs = g.legs.length > 1
        ? g.legs.map(function (l) { return (l.mode === 'flight' ? '✈ ' : '🚙 ') + name(l.to).replace(/ \(.*\)$/, '') + ' ' + l.duration; }).join(' · ')
        : (first.detail || '');
      var li = el('li', { tabindex: '0' });
      li.innerHTML = '<div class="leg-top"><span>' + (flight ? '✈ ' : '🚙 ') + esc(name(first.from)) + ' → ' + esc(name(last.to)) + '</span><span class="leg-dur">' + esc(fmtRange(tot)) + '</span></div>' +
        '<div class="leg-sub">' + esc(fmtDate(g.date)) + ' · ' + esc(segs) + '</div>';
      var go = function () {
        if (!map) return;
        var grp = L.featureGroup(g.idx.map(function (i) { return legLayers[i]; }).filter(Boolean));
        if (!grp.getLayers().length) return;
        map.fitBounds(grp.getBounds(), { padding: [60, 60], maxZoom: 9 });
        grp.getLayers()[0].openPopup();
        $('#map').scrollIntoView({ behavior: 'smooth', block: 'center' });
      };
      li.addEventListener('click', go);
      li.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
      list.appendChild(li);
    });

    renderTripTimeline();
    if ($('#pace-body') && plan.fatigue_check) { $('#pace-body').innerHTML = md(plan.fatigue_check); $('#pace').hidden = false; }
  }

  function renderTripTimeline() {
    var box = $('#trip-timeline'); if (!box) return;
    var td = tripDates(), start = td.depart, end = td.ret;
    var days = []; for (var d = start; d <= end; d = addDays(d, 1)) days.push(d);
    var col = function (iso) { return days.indexOf(iso) + 1; };
    box.style.setProperty('--cols', days.length);
    var html = '', places = plan.places || {};

    // month labels
    var lastM = null;
    days.forEach(function (iso, i) {
      var m = iso.slice(0, 7);
      if (m !== lastM) {
        var span = days.filter(function (x) { return x.slice(0, 7) === m; }).length;
        html += '<div class="tl-month" style="grid-row:1;grid-column:' + (i + 1) + ' / span ' + span + '">' + esc(fmtDate(iso, { month: 'long', year: 'numeric' })) + '</div>';
        lastM = m;
      }
    });
    // day headers
    days.forEach(function (iso, i) {
      var dt = new Date(iso + 'T12:00:00');
      var we = dt.getDay() === 0 || dt.getDay() === 6;
      html += '<div class="tl-day' + (we ? ' we' : '') + '" style="grid-row:2;grid-column:' + (i + 1) + '"><b>' + dt.getDate() + '</b>' + dt.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2) + '</div>';
    });

    // nights row: stays, with gaps = nights on a plane
    html += '<div class="tl-rowlab" style="grid-row:3">Where you sleep</div>';
    var covered = {};
    (plan.stays || []).forEach(function (s) {
      var c = col(s.from); if (c < 1) return;
      for (var k = 0; k < s.nights; k++) covered[addDays(s.from, k)] = true;
      html += '<div class="tl-block ' + stayClass(s.place) + (s.nights === 1 ? ' one' : '') + '" style="grid-row:4;grid-column:' + c + ' / span ' + s.nights + '" title="' + esc(s.label) + ' · ' + s.nights + ' night' + (s.nights > 1 ? 's' : '') + '">' + esc(s.label) + (s.nights > 1 ? ' · ' + s.nights + 'n' : '') + '</div>';
    });
    days.forEach(function (iso, i) {
      if (covered[iso]) return;
      var last = i === days.length - 1;
      html += '<div class="tl-block air" style="grid-row:4;grid-column:' + (i + 1) + '" title="' + (last ? 'Home' : 'Overnight in flight') + '">' + (last ? '🏠' : '✈') + '</div>';
    });

    // travel row: door-to-door per day, colored by load
    html += '<div class="tl-rowlab" style="grid-row:5">Travel per day (door to door)</div>';
    var fl = [0, 0], rd = [0, 0], perDay = {};
    (plan.legs || []).forEach(function (l) {
      if (col(l.date) < 1) return;
      var h = hoursOf(l.duration), acc = l.mode === 'flight' ? fl : rd;
      acc[0] += h[0]; acc[1] += h[1];
      var d = perDay[l.date] = perDay[l.date] || { h: [0, 0], flight: false, longhaul: false, legs: [] };
      d.h[0] += h[0]; d.h[1] += h[1];
      if (l.mode === 'flight') d.flight = true;
      if (l.mode === 'flight' && h[1] >= 5) d.longhaul = true;
      d.legs.push((places[l.from] || {}).name + ' → ' + (places[l.to] || {}).name + ' ' + l.duration);
    });
    days.forEach(function (iso) {
      var d = perDay[iso], c = col(iso);
      if (!d) {
        html += '<div class="tl-leg rest" style="grid-row:6;grid-column:' + c + '" title="No travel">·<span>rest</span></div>';
        return;
      }
      var load = d.longhaul ? 'longhaul' : d.h[1] > 5 ? 'heavy' : d.h[1] > 4 ? 'medium' : 'light';
      html += '<div class="tl-leg ' + load + '" style="grid-row:6;grid-column:' + c + '" title="' + esc(d.legs.join('\n')) + '">' +
        (d.flight ? '✈' : '🚙') + '<span>' + esc(fmtRange(d.h).replace('~', '')) + '</span></div>';
    });
    box.innerHTML = html;
    var restDays = days.filter(function (iso) { return !perDay[iso]; }).length;
    $('#tl-totals').textContent = days.length + ' days · flying ' + fmtRange(fl) + ' · on the road ' + fmtRange(rd) + ' · ' + restDays + ' no-travel days · ' + Object.keys(covered).length + ' nights in beds, ' + (days.length - 1 - Object.keys(covered).length) + ' on planes'
  }

  // ---------- photos (Wikipedia / Wikimedia Commons, fetched in the browser) ----------
  var wikiCache = {};
  function wiki(title) {
    if (!wikiCache[title]) {
      wikiCache[title] = fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title))
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function (j) {
          if (!j.thumbnail && !j.originalimage) return null;
          return {
            title: j.title, extract: j.extract || '',
            page: (j.content_urls && j.content_urls.desktop && j.content_urls.desktop.page) || ('https://en.wikipedia.org/wiki/' + encodeURIComponent(title)),
            thumb: j.thumbnail, orig: j.originalimage
          };
        })
        .catch(function () { return null; });
    }
    return wikiCache[title];
  }
  function imgUrl(info, width) {
    if (!info) return '';
    var o = info.orig, t = info.thumb;
    if (o && o.width && o.width <= width) return o.source;
    if (t && /\/\d+px-/.test(t.source)) return t.source.replace(/\/\d+px-/, '/' + width + 'px-');
    return (o || t).source;
  }
  function photoFor(code) {
    var ph = (plan.photos || {})[code];
    return ph && ph.wiki && ph.wiki.length ? wiki(ph.wiki[0]) : Promise.resolve(null);
  }
  function markMissing(imgEl) {
    var ph = imgEl.closest('.ph'); if (ph) ph.classList.add('ph-missing');
    var dc = imgEl.closest('.day-card'); if (dc) dc.classList.remove('with-photo');
  }
  function fillImg(imgEl, info, width) {
    if (!info) { markMissing(imgEl); return; }
    imgEl.src = imgUrl(info, width);
    imgEl.alt = info.title;
    imgEl.addEventListener('error', function () { markMissing(imgEl); });
    imgEl.addEventListener('click', function () { openLightbox(info); });
  }
  function openLightbox(info) {
    var lb = $('#lightbox'); if (!lb) return;
    lb.querySelector('img').src = imgUrl(info, 1600);
    lb.querySelector('img').alt = info.title;
    lb.querySelector('figcaption').innerHTML = esc(info.title) + ' · <a href="' + esc(info.page) + '" target="_blank" rel="noopener">source &amp; license</a>';
    lb.hidden = false;
  }
  function wireLightbox() {
    var lb = $('#lightbox'); if (!lb) return;
    var close = function () { lb.hidden = true; lb.querySelector('img').src = ''; };
    lb.addEventListener('click', function (e) { if (e.target === lb || e.target.classList.contains('lb-close')) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !lb.hidden) close(); });
  }
  function placeForDate(iso) {
    var hit = null;
    (plan.stays || []).forEach(function (st) {
      for (var k = 0; k < st.nights; k++) if (addDays(st.from, k) === iso) hit = st.place;
    });
    if (hit) return hit;
    var legs = (plan.legs || []).filter(function (l) { return l.date === iso; });
    return legs.length ? legs[legs.length - 1].to : null;
  }

  function renderPlaces() {
    var grid = $('#places-grid'); if (!grid) return;
    var seen = {};
    (plan.stays || []).forEach(function (st) {
      var ph = (plan.photos || {})[st.place];
      if (!ph || seen[st.place] || kindOf(st.place) === 'transit') { if (seen[st.place]) seen[st.place].nights += st.nights; return; }
      var rec = seen[st.place] = { nights: st.nights };
      var card = el('article', { class: 'place-card' });
      var thumbs = ph.wiki.slice(1, 4).map(function () { return '<div class="ph ph-sm"><img loading="lazy" alt=""></div>'; }).join('');
      card.innerHTML =
        '<div class="ph ph-lg"><img loading="lazy" alt=""></div>' +
        '<div class="ph-row">' + thumbs + '</div>' +
        '<div class="place-body"><h3>' + esc(ph.name) + '</h3>' +
        '<div class="sub">' + esc(fmtDate(st.from, { month: 'short', day: 'numeric' })) + ' · <span class="nights"></span></div>' +
        '<p class="extract"></p></div>';
      grid.appendChild(card);
      var imgs = card.querySelectorAll('img');
      ph.wiki.slice(0, 4).forEach(function (t, i) {
        wiki(t).then(function (info) {
          fillImg(imgs[i], info, i === 0 ? 800 : 320);
          if (i === 0 && info && info.extract) {
            var x = (info.extract.match(/[^.!?]+[.!?]+(\s|$)/g) || [info.extract]).slice(0, 2).join('').trim();
            card.querySelector('.extract').textContent = x.length > 230 ? x.slice(0, 227) + '…' : x;
          }
        });
      });
      // nights filled after all stays are counted
      setTimeout(function () { card.querySelector('.nights').textContent = rec.nights + ' night' + (rec.nights > 1 ? 's' : ''); });
    });
    (plan.alternatives || []).forEach(function (a) {
      var ph = a.place && (plan.photos || {})[a.place];
      if (!ph || seen[a.place]) return;
      seen[a.place] = { nights: 0 };
      var d = a.cost_delta_per_person_usd || 0;
      var card = el('article', { class: 'place-card option' });
      card.innerHTML =
        '<span class="opt-badge">Option · ' + (d >= 0 ? '+' : '−') + usd(Math.abs(d)) + ' pp</span>' +
        '<div class="ph ph-lg"><img loading="lazy" alt=""></div>' +
        '<div class="ph-row">' + ph.wiki.slice(1, 4).map(function () { return '<div class="ph ph-sm"><img loading="lazy" alt=""></div>'; }).join('') + '</div>' +
        '<div class="place-body"><h3>' + esc(ph.name) + '</h3>' +
        '<div class="sub">' + esc(a.name) + ' · <a href="#opt-' + esc(a.id || '') + '">see option</a></div>' +
        '<p class="extract"></p></div>';
      grid.appendChild(card);
      var imgs = card.querySelectorAll('img');
      ph.wiki.slice(0, 4).forEach(function (t, i) {
        wiki(t).then(function (info) {
          fillImg(imgs[i], info, i === 0 ? 800 : 320);
          if (i === 0 && info && info.extract) {
            var x = (info.extract.match(/[^.!?]+[.!?]+(\s|$)/g) || [info.extract]).slice(0, 2).join('').trim();
            card.querySelector('.extract').textContent = x.length > 230 ? x.slice(0, 227) + '…' : x;
          }
        });
      });
    });
  }

  function renderWildlife() {
    var grid = $('#wildlife-grid'); if (!grid) return;
    var list = plan.wildlife || [];
    if (!list.length) { $('#wildlife').hidden = true; return; }
    list.forEach(function (w) {
      var card = el('article', { class: 'wl-card' });
      var odds = String(w.odds || '').toLowerCase().replace(/[^a-z]+/g, '-');
      card.innerHTML = '<div class="ph ph-wl"><img loading="lazy" alt=""></div>' +
        '<div class="wl-body"><b>' + esc(w.name) + '</b>' +
        '<span class="wl-where">' + esc(w.where) + '</span>' +
        '<span class="wl-odds odds-' + esc(odds) + '">' + esc(w.odds) + '</span></div>';
      grid.appendChild(card);
      wiki(w.wiki).then(function (info) { fillImg(card.querySelector('img'), info, 400); });
    });
  }

  function decoratePhotos() {
    // hero
    if (plan.hero_photo) wiki(plan.hero_photo).then(function (info) {
      if (!info) return;
      var hero = $('.hero');
      hero.style.setProperty('--hero-img', 'url("' + imgUrl(info, 1600).replace(/"/g, '%22') + '")');
      hero.classList.add('has-photo');
    });
    // day cards
    (plan.itinerary || []).forEach(function (day, i) {
      var code = placeForDate(day.date), card = $('#day-' + (i + 1) + ' .day-card');
      if (!code || !card || !(plan.photos || {})[code]) return;
      var fig = el('div', { class: 'ph ph-day' }, '<img loading="lazy" alt="">');
      card.insertBefore(fig, card.firstChild);
      card.classList.add('with-photo');
      photoFor(code).then(function (info) { fillImg(fig.querySelector('img'), info, 320); });
    });
    // lodging cards
    document.querySelectorAll('#lodging-grid .card').forEach(function (card, i) {
      var l = (plan.lodging || [])[i]; if (!l || !l.place) return;
      var fig = el('div', { class: 'ph ph-cover' }, '<img loading="lazy" alt="">');
      card.insertBefore(fig, card.firstChild);
      photoFor(l.place).then(function (info) { fillImg(fig.querySelector('img'), info, 640); });
    });
  }

  // ---------- drive vs fly side-by-side ----------
  var _choiceMap = null;
  function choiceLegsByDate() {
    if (!_choiceMap) {
      _choiceMap = {};
      (plan.legs || []).forEach(function (l) { if (l.choice) (_choiceMap[l.date] = _choiceMap[l.date] || []).push(l); });
    }
    return _choiceMap;
  }
  function signedUsd(n) {
    if (n == null) return '—';
    if (n === 0) return 'included';
    return (n > 0 ? '+' : '−') + usd(Math.abs(n)) + ' pp';
  }
  // Each card's "other" cost is that leg's net change; ticking the linked option (choice.alt_id) swaps which side is in the plan.
  function choiceHTML(l) {
    var c = l.choice; if (!c) return '';
    var switched = !!(c.alt_id && altState[c.alt_id]);
    var alt = c.alt_id && altById(c.alt_id);
    var col = function (o, chosen, delta) {
      return '<div class="choice-col' + (chosen ? ' chosen' : '') + '">' +
        '<div class="choice-tag">' + (chosen ? '✓ In plan' : 'Alternative') + '</div>' +
        '<div class="choice-h">' + ({ flight: '✈ ', train: '🚆 ' }[o.mode] || '🚙 ') + esc(o.label) + '</div>' +
        '<div class="choice-n"><span>' + esc(o.door_to_door) + '</span><span>' + esc(signedUsd(delta)) + '</span></div>' +
        '<div class="choice-note">' + mdInline(o.note || '') + '</div></div>';
    };
    var d = c.other.cost_pp;
    var pl = plan.places || {};
    var a = switched ? col(c.chosen, false, d == null ? null : -d) : col(c.chosen, true, 0);
    var b = switched ? col(c.other, true, 0) : col(c.other, false, d);
    return '<div class="choice"><div class="choice-title">' + esc(fmtDate(l.date)) + ': ' + esc((pl[l.from] || {}).name || l.from) + ' → ' + esc((pl[l.to] || {}).name || l.to) + '</div>' +
      '<div class="choice-grid">' + a + b + '</div>' +
      (alt ? '<div class="choice-link"><a href="#opt-' + esc(c.alt_id) + '">Option: ' + esc(alt.name) + ' (' + esc(signedUsd(alt.cost_delta_per_person_usd)) + ' total)</a></div>' : '') +
      '</div>';
  }
  function renderChoices() {
    var box = $('#choices'); if (!box) return;
    var legs = (plan.legs || []).filter(function (l) { return l.choice; });
    if (!legs.length) { box.hidden = true; return; }
    box.querySelector('.choices-list').innerHTML = legs.map(choiceHTML).join('');
  }
  function refreshChoices() {
    renderChoices();
    document.querySelectorAll('.choice-slot').forEach(function (slot) {
      slot.innerHTML = choiceHTML((plan.legs || [])[+slot.getAttribute('data-leg')]);
    });
  }

  // ---------- trips: tabs + side-by-side compare ----------
  function getJSON(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(url + ': ' + r.status); return r.json(); });
  }
  function tripUrl(id) { return '?trip=' + encodeURIComponent(id); }
  function renderTabs(activeId) {
    var bar = $('#trip-tabs'); if (!bar || !MANIFEST) return;
    var links = MANIFEST.trips.map(function (t) {
      return '<a role="tab" href="' + tripUrl(t.id) + '"' + (t.id === activeId ? ' class="on" aria-selected="true"' : '') + ' title="' + esc(t.summary || '') + '">' + esc(t.label) + '</a>';
    });
    if (MANIFEST.trips.length > 1) links.push('<a role="tab" href="?view=compare" class="tab-compare' + (activeId === 'compare' ? ' on' : '') + '">⇆ Compare</a>');
    bar.querySelector('.tabs').innerHTML = links.join('');
  }

  // Numbers that can be lined up across trips. Everything is derived from the trip file.
  function tripMetrics(p) {
    var places = p.places || {}, legs = p.legs || [], td = tripDates(p);
    var perDay = {}, fl = [0, 0], rd = [0, 0];
    legs.forEach(function (l) {
      var h = hoursOf(l.duration);
      var acc = l.mode === 'flight' ? fl : rd;
      acc[0] += h[0]; acc[1] += h[1];
      var d = perDay[l.date] = perDay[l.date] || { road: [0, 0] };
      if (l.mode !== 'flight') { d.road[0] += h[0]; d.road[1] += h[1]; }
    });
    var days = (p.itinerary || []).map(function (d) { return d.date; });
    var longest = Object.keys(perDay).reduce(function (m, k) { return perDay[k].road[1] > m[1] ? perDay[k].road : m; }, [0, 0]);
    var stops = [], seen = {};
    (p.stays || []).forEach(function (s) {
      var k = (places[s.place] || {}).kind;
      if (k === 'transit') return;
      var name = s.label || (places[s.place] || {}).name || s.place;
      if (seen[s.place]) { seen[s.place].n += s.nights; return; }
      seen[s.place] = { name: name, n: s.nights, nature: k === 'nature' };
      stops.push(seen[s.place]);
    });
    var cats = {};
    (p.budget || []).forEach(function (b) { cats[b.category] = (cats[b.category] || 0) + (b.per_person_usd || 0); });
    var bedNights = (p.stays || []).reduce(function (a, s) { return a + s.nights; }, 0);
    return {
      depart: td.depart, ret: td.ret, days: days.length,
      nights: nightsByCountry(p), bedNights: bedNights, planeNights: Math.max(0, days.length - 1 - bedNights),
      stops: stops, parks: stops.filter(function (s) { return s.nature; }).length,
      total: p.budget_total_per_person_usd,
      low: (p.budget || []).reduce(function (a, b) { return a + (b.low_usd || 0); }, 0),
      high: (p.budget || []).reduce(function (a, b) { return a + (b.high_usd || 0); }, 0),
      cats: cats, flying: fl, road: rd, longest: longest,
      restDays: days.filter(function (d) { return !perDay[d]; }).length,
      wildlife: (p.wildlife || []).length, options: (p.alternatives || []).length,
      flightChoices: legs.filter(function (l) { return l.choice; }).length
    };
  }

  function renderCompare() {
    document.body.classList.add('compare-mode');
    document.title = 'Compare trips';
    $('#title').textContent = 'Compare trips';
    $('#dates').textContent = 'Pick trips to line up side by side. Cheapest / easiest values are highlighted.';
    var picked = {};
    try { picked = JSON.parse(localStorage.getItem('trip-compare:' + REPO) || 'null') || {}; } catch (e) { /* ignore */ }
    var all = MANIFEST.trips;
    if (!Object.keys(picked).length) all.forEach(function (t) { picked[t.id] = true; });
    var box = $('#compare');
    box.hidden = false;
    box.querySelector('.cmp-pick').innerHTML = all.map(function (t) {
      return '<label class="chip-check"><input type="checkbox" value="' + esc(t.id) + '"' + (picked[t.id] ? ' checked' : '') + '> ' + esc(t.label) + '</label>';
    }).join('');
    Promise.all(all.map(function (t) { return getJSON(t.file).catch(function () { return null; }); })).then(function (trips) {
      var byId = {};
      trips.forEach(function (p, i) { if (p) byId[all[i].id] = { meta: all[i], plan: p, m: tripMetrics(p) }; });
      var draw = function () {
        var cols = all.filter(function (t) { return picked[t.id] && byId[t.id]; }).map(function (t) { return byId[t.id]; });
        var tbl = box.querySelector('.cmp-table');
        if (!cols.length) { tbl.innerHTML = '<p class="hint">Pick at least one trip.</p>'; return; }
        var catNames = [];
        cols.forEach(function (c) { Object.keys(c.m.cats).forEach(function (k) { if (catNames.indexOf(k) < 0) catNames.push(k); }); });
        // best = lowest (or highest when hi=true) value across the shown columns
        var best = function (vals, hi) {
          var nums = vals.filter(function (v) { return typeof v === 'number'; });
          if (nums.length < 2 || Math.min.apply(null, nums) === Math.max.apply(null, nums)) return null;
          return hi ? Math.max.apply(null, nums) : Math.min.apply(null, nums);
        };
        var row = function (label, vals, fmt, opts) {
          opts = opts || {};
          var b = opts.noBest ? null : best(vals, opts.hi);
          return '<tr' + (opts.cls ? ' class="' + opts.cls + '"' : '') + '><th scope="row">' + label + '</th>' + vals.map(function (v) {
            return '<td' + (b != null && v === b ? ' class="best"' : '') + '>' + (v == null ? '—' : fmt ? fmt(v) : esc(v)) + '</td>';
          }).join('') + '</tr>';
        };
        var short = { weekday: 'short', month: 'short', day: 'numeric' };
        var html = '<table class="cmp"><thead><tr><th></th>' + cols.map(function (c) {
          return '<th scope="col"><a href="' + tripUrl(c.meta.id) + '">' + esc(c.meta.label) + '</a><div class="cmp-sum">' + esc(c.meta.summary || '') + '</div></th>';
        }).join('') + '</tr></thead><tbody>';
        html += '<tr class="grp"><th colspan="' + (cols.length + 1) + '">Shape</th></tr>';
        html += row('Dates', cols.map(function (c) { return fmtDate(c.m.depart, short) + ' → ' + fmtDate(c.m.ret, short); }), null, { noBest: true });
        html += row('Days door to door', cols.map(function (c) { return c.m.days; }), String, { noBest: true });
        html += row('Nights by country', cols.map(function (c) { return c.m.nights.map(function (n) { return n[1] + ' ' + n[0]; }).join(' · '); }), null, { noBest: true });
        html += row('Stops', cols.map(function (c) { return c.m.stops.map(function (s) { return (s.nature ? '🌿 ' : '') + s.name + ' ' + s.n + 'n'; }).join('<br>'); }), function (v) { return v; }, { noBest: true });
        html += row('Wild places (🌿)', cols.map(function (c) { return c.m.parks; }), String, { hi: true });
        html += row('Wildlife checklist', cols.map(function (c) { return c.m.wildlife || null; }), function (v) { return v + ' species'; }, { noBest: true });
        html += '<tr class="grp"><th colspan="' + (cols.length + 1) + '">Cost per person</th></tr>';
        html += row('<b>Planned total</b>', cols.map(function (c) { return c.m.total; }), function (v) { return '<b>' + usd(v) + '</b>'; }, { cls: 'total' });
        html += row('Realistic range', cols.map(function (c) { return usd(c.m.low) + '–' + usd(c.m.high); }), null, { noBest: true });
        html += row('For two', cols.map(function (c) { return c.m.total * 2; }), usd);
        catNames.forEach(function (k) {
          html += row(esc(k), cols.map(function (c) { return k in c.m.cats ? c.m.cats[k] : null; }), usd, { cls: 'sub' });
        });
        html += '<tr class="grp"><th colspan="' + (cols.length + 1) + '">Pace</th></tr>';
        html += row('Flying', cols.map(function (c) { return c.m.flying[1]; }), function (v) { return '~' + Math.round(v) + 'h'; });
        html += row('On the road', cols.map(function (c) { return c.m.road[1]; }), function (v) { return '~' + Math.round(v) + 'h'; });
        html += row('Longest road day', cols.map(function (c) { return c.m.longest[1]; }), function (v) { return fmtRange([v, v]).replace('~', '≤'); });
        html += row('No-travel days', cols.map(function (c) { return c.m.restDays; }), String, { hi: true });
        html += row('Nights on planes', cols.map(function (c) { return c.m.planeNights; }), String);
        html += row('Options to tweak', cols.map(function (c) { return c.m.options; }), String, { noBest: true });
        html += '</tbody></table>';
        tbl.innerHTML = html;
      };
      box.querySelectorAll('.cmp-pick input').forEach(function (inp) {
        inp.addEventListener('change', function () {
          picked[inp.value] = inp.checked;
          try { localStorage.setItem('trip-compare:' + REPO, JSON.stringify(picked)); } catch (e) { /* ignore */ }
          draw();
        });
      });
      draw();
    });
  }

  function renderTrip(meta) {
    return getJSON(meta.file).then(function (data) {
      plan = data;
      var c = cfg();
      if (c.budget_target) { TARGET_LOW = c.budget_target.low; TARGET_HIGH = c.budget_target.high; }
      STORE_KEY = 'trip-feedback:' + REPO + ':' + meta.id;
      initStore(meta.id === MANIFEST['default']);
      renderHero(); renderProse(); renderPlaces(); renderWildlife(); renderRoute(); renderChoices(); renderItinerary(); renderLodging(); decoratePhotos(); wireLightbox();
      renderAlternatives(); renderBudgetSummary(); renderBudgetTable();
      refreshChoices(); renderBooking(); renderQuestions(); addSectionTools(); wireFeedback(); refreshFeedback();
      if (location.hash) { var t = document.querySelector(location.hash); if (t) t.scrollIntoView(); }
    });
  }

  getJSON('data/trips.json')
    .then(function (m) {
      MANIFEST = m;
      REPO = m.repo || '';
      var q = new URLSearchParams(location.search);
      if (q.get('view') === 'compare') { renderTabs('compare'); return renderCompare(); }
      var id = q.get('trip') || m['default'];
      TRIP = m.trips.filter(function (t) { return t.id === id; })[0] || m.trips.filter(function (t) { return t.id === m['default']; })[0] || m.trips[0];
      renderTabs(TRIP.id);
      return renderTrip(TRIP);
    })
    .catch(function (e) {
      $('#overview-body').innerHTML = '<p>Could not load trip data (' + esc(e.message) + ').</p>';
    });
})();
