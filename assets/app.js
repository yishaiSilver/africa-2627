(function () {
  'use strict';

  var REPO = 'yishaiSilver/africa-2627';
  var STORE_KEY = 'africa2627-feedback-v1';
  var TARGET_LOW = 5000, TARGET_HIGH = 6000;

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
      try { return window.marked.parse(s); } catch (e) { /* fall through */ }
    }
    return '<p>' + esc(s).replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br>') + '</p>';
  }
  function mdInline(s) {
    if (window.marked && window.marked.parseInline) {
      try { return window.marked.parseInline(s || ''); } catch (e) { /* fall through */ }
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
  var store = { notes: {}, reacts: {}, general: '', alts: {} };
  try {
    var raw = localStorage.getItem(STORE_KEY);
    if (raw) store = Object.assign(store, JSON.parse(raw));
  } catch (e) { /* storage unavailable */ }
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
  function locStyle(loc) {
    var l = (loc || '').toLowerCase();
    if (/istanbul|turkey/.test(l)) return ['var(--blue)', 'var(--blue-soft)'];
    if (/mara|pejeta|laikipia|amboseli|samburu|conserv|safari/.test(l)) return ['var(--green)', 'var(--green-soft)'];
    if (/flight|air|transit|lax|los angeles/.test(l)) return ['var(--muted)', 'var(--line)'];
    return ['var(--accent)', 'var(--accent-soft)'];
  }

  // ---------- renderers ----------
  var plan, altState = {};

  function renderHero() {
    document.title = plan.title || document.title;
    $('#title').textContent = plan.title || 'Kenya & Istanbul';
    var d = plan.dates || {};
    $('#dates').textContent = fmtDate(d.depart_lax, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' }) +
      '  →  ' + fmtDate(d.return_lax, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });
    var days = (plan.itinerary || []).length;
    var stats = [
      [days, 'days door to door'],
      [d.nights_kenya != null ? d.nights_kenya : '—', 'nights in Kenya'],
      [d.nights_istanbul != null ? d.nights_istanbul : '—', 'nights in Istanbul'],
      [usd(plan.budget_total_per_person_usd), 'planned per person'],
      ['$5–6k', 'target per person']
    ];
    $('#stats').innerHTML = stats.map(function (s) {
      return '<div class="stat"><b>' + esc(s[0]) + '</b><span>' + esc(s[1]) + '</span></div>';
    }).join('');
  }

  function renderItinerary() {
    var list = $('#itinerary-list');
    (plan.itinerary || []).forEach(function (day, i) {
      var c = locStyle(day.location);
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
      return sum + (altState[i] ? (a.cost_delta_per_person_usd || 0) : 0);
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
    var status = total < TARGET_LOW ? 'under target' : total <= TARGET_HIGH ? 'within target' : 'over target';
    var maxCat = Math.max.apply(null, groups.map(function (g) { return g.total; }).concat([1]));

    $('#budget-summary').innerHTML =
      '<div class="total-line"><b>' + usd(total) + '</b> per person — <span>' + status + '</span>' +
        (delta ? ' <span class="hint">(base ' + usd(base) + (delta > 0 ? ' + ' : ' − ') + usd(Math.abs(delta)) + ' in selected options)</span>' : '') +
        ' · about <b style="font-size:1.1rem">' + usd(total * 2) + '</b> for two' +
      '</div>' +
      '<div><div class="meter" role="img" aria-label="Planned total ' + usd(total) + ' against the $5,000 to $6,000 target">' +
        '<div class="meter-fill" style="width:' + pct(total) + '%"></div>' +
        '<div class="meter-band" style="left:' + pct(TARGET_LOW) + '%;width:' + (pct(TARGET_HIGH) - pct(TARGET_LOW)) + '%" title="Target $5k–$6k"></div>' +
      '</div>' +
      '<div class="meter-labels"><span>$0</span><span>Target band $5k–$6k (dashed) · realistic range ' + usd(low) + '–' + usd(high) + '</span><span>' + usd(scaleMax) + '</span></div></div>' +
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
    altState = store.alts || {};
    (plan.alternatives || []).forEach(function (a, i) {
      var d = a.cost_delta_per_person_usd || 0;
      var lab = el('label', { class: 'alt' });
      lab.innerHTML =
        '<input type="checkbox"' + (altState[i] ? ' checked' : '') + '>' +
        '<div><b>' + esc(a.name) + '</b><p>' + mdInline(a.description) + '</p></div>' +
        '<span class="delta ' + (d > 0 ? 'up' : 'down') + '">' + (d > 0 ? '+' : d < 0 ? '−' : '±') + usd(Math.abs(d)) + ' pp</span>';
      lab.querySelector('input').addEventListener('change', function (e) {
        altState[i] = e.target.checked; store.alts = altState;
        store.labels = store.labels || {}; store.labels['alt:' + i] = a.name;
        save(); renderBudgetSummary();
      });
      list.appendChild(lab);
    });
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
    var alts = Object.keys(store.alts || {}).filter(function (k) { return store.alts[k]; })
      .map(function (k) { return '- ' + ((plan.alternatives || [])[k] || {}).name; });
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
        encodeURIComponent('Trip feedback') + '&body=' + encodeURIComponent(body.slice(0, 6000));
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
      store = { notes: {}, reacts: {}, general: '', alts: {} };
      save(); location.reload();
    });
  }


  // ---------- route map + travel timeline ----------
  function addDays(iso, n) {
    var d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function hoursOf(dur) {
    var m = String(dur).match(/([\d.]+)(?:\s*[–-]\s*([\d.]+))?\s*h/);
    if (!m) return [0, 0];
    return [parseFloat(m[1]), parseFloat(m[2] || m[1])];
  }
  function stayClass(code) {
    if (code === 'IST') return 'stay-ist';
    if (code === 'KAR' || code === 'NBO') return 'stay-city';
    return 'stay-k';
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
      L.tileLayer('https://{s}.basemaps.cartocdn.com/' + (dark ? 'dark_all' : 'rastertiles/voyager') + '/{z}/{x}/{y}{r}.png', {
        maxZoom: 12, subdomains: 'abcd',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
      }).addTo(map);
      var css = getComputedStyle(document.documentElement);
      var cFlight = css.getPropertyValue('--blue').trim() || '#2f5d7c';
      var cRoad = css.getPropertyValue('--green').trim() || '#4f6b3a';

      var order = [];
      legs.forEach(function (l) { [l.from, l.to].forEach(function (c) { if (order.indexOf(c) < 0) order.push(c); }); });
      order.forEach(function (code, i) {
        var p = places[code]; if (!p) return;
        var kenya = ['OPC', 'NAI', 'MARA'].indexOf(code) >= 0;
        L.marker([p.lat, p.lng], {
          icon: L.divIcon({ className: '', html: '<div class="stop-pin' + (kenya ? ' k' : '') + '">' + (i + 1) + '</div>', iconSize: [24, 24], iconAnchor: [12, 12] }),
          title: p.name
        }).addTo(map).bindTooltip(p.name, { direction: 'top', offset: [0, -12] });
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
        if (!labelled[pairKey]) {
          labelled[pairKey] = true;
          L.tooltip({ permanent: true, direction: 'center', className: 'dur ' + l.mode })
            .setLatLng(midPt).setContent((flight ? '✈ ' : '🚙 ') + l.duration).addTo(map);
        }
        line.bindPopup('<b>' + esc(places[l.from].name) + ' → ' + esc(places[l.to].name) + '</b><br>' + esc(fmtDate(l.date)) + ' · ' + esc(l.duration) + '<br>' + esc(l.detail || ''));
        legLayers.push(line);
      });

      var allB = L.featureGroup(legLayers).getBounds();
      var keB = L.latLngBounds(['NBO', 'OPC', 'NAI', 'MARA', 'KAR'].filter(function (c) { return places[c]; }).map(function (c) { return [places[c].lat, places[c].lng]; }));
      var views = { all: function () { map.fitBounds(allB, { padding: [30, 30] }); }, kenya: function () { map.fitBounds(keB, { padding: [50, 50] }); } };
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

    legs.forEach(function (l, i) {
      var li = el('li', { tabindex: '0' });
      li.innerHTML = '<div class="leg-top"><span>' + (l.mode === 'flight' ? '✈ ' : '🚙 ') + esc((places[l.from] || {}).name || l.from) + ' → ' + esc((places[l.to] || {}).name || l.to) + '</span><span class="leg-dur">' + esc(l.duration) + '</span></div>' +
        '<div class="leg-sub">' + esc(fmtDate(l.date)) + ' · ' + esc(l.detail || '') + '</div>';
      var go = function () {
        if (!map || !legLayers[i]) return;
        map.fitBounds(legLayers[i].getBounds(), { padding: [60, 60], maxZoom: 9 });
        legLayers[i].openPopup();
        $('#map').scrollIntoView({ behavior: 'smooth', block: 'center' });
      };
      li.addEventListener('click', go);
      li.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
      list.appendChild(li);
    });

    renderTripTimeline();
  }

  function renderTripTimeline() {
    var box = $('#trip-timeline'); if (!box) return;
    var start = plan.dates.depart_lax, end = plan.dates.return_lax;
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

    // travel row
    html += '<div class="tl-rowlab" style="grid-row:5">Travel</div>';
    var fl = [0, 0], rd = [0, 0];
    (plan.legs || []).forEach(function (l) {
      var c = col(l.date); if (c < 1) return;
      var h = hoursOf(l.duration), acc = l.mode === 'flight' ? fl : rd;
      acc[0] += h[0]; acc[1] += h[1];
      html += '<div class="tl-leg ' + esc(l.mode) + '" style="grid-row:6;grid-column:' + c + '" title="' + esc((places[l.from] || {}).name) + ' → ' + esc((places[l.to] || {}).name) + ' · ' + esc(l.duration) + '">' +
        (l.mode === 'flight' ? '✈' : '🚙') + '<span>' + esc(l.duration.replace('~', '')) + '</span></div>';
    });
    box.innerHTML = html;
    var r = function (a) { return a[0] === a[1] ? '~' + a[0] + 'h' : '~' + a[0] + '–' + a[1] + 'h'; };
    $('#tl-totals').textContent = days.length + ' days · flying ' + r(fl) + ' · on the road ' + r(rd) + ' · ' + Object.keys(covered).length + ' nights in beds, ' + (days.length - 1 - Object.keys(covered).length) + ' on planes';
  }

  fetch('data/plan.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      plan = data;
      renderHero(); renderProse(); renderRoute(); renderItinerary(); renderLodging();
      renderAlternatives(); renderBudgetSummary(); renderBudgetTable();
      renderBooking(); renderQuestions(); addSectionTools(); wireFeedback(); refreshFeedback();
      if (location.hash) { var t = document.querySelector(location.hash); if (t) t.scrollIntoView(); }
    })
    .catch(function (e) {
      $('#overview-body').innerHTML = '<p>Could not load <code>data/plan.json</code> (' + esc(e.message) + ').</p>';
    });
})();
