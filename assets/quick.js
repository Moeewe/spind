/* Wehrwerk – Einsatz-Schnellerfassung: Alarm-/WhatsApp-Meldungen erkennen und als Einsatzberichte (Einsatzverwaltung) anlegen.
   Einheiten, Nummern-Kürzel und Fahrzeuge kommen aus den Wehrwerk-Einstellungen. */
(function () {
  'use strict';

  // ---- Konfiguration --------------------------------------------------------
  var CFG = Object.assign({
    api: '/wp-json/',                 // gleiche Domain wie die Seite
    adminUrl: '/wp-admin/',
    ajaxUrl: '/wp-admin/admin-ajax.php',
    // Eigene Fahrzeuge je Einheit (Namen exakt wie in der Einsatzverwaltung) – kommen aus Wehrwerk
    vehicles: {},
    units: [],
    place: '',
    external: ['POL', 'RTW', 'NEF', 'Luftrettung', 'Arbeitsbühne', 'Autokran'],
    types: ['ABC-Einsatz', 'Amtshilfe', 'Ausgelöste Brandmeldeanlage', 'Brandeinsatz', 'Eingeklemmte Person',
      'Feuer', 'Feuer klein', 'Feuer MiG', 'Hausrauchmelder', 'Hilfe klein', 'Kaminbrand', 'Ölspur',
      'Person eingeklemmt', 'Person in Wohnung', 'Sondereinsatz', 'Sturmschaden', 'Technische Hilfeleistung',
      'Tier in Not', 'Tierrettung', 'Umweltschutzeinsatz', 'Verdächtiger Rauch', 'Verkehrsunfall', 'Wasserrettung']
  }, window.EVQ_CONFIG || {});

  // Abkürzungen, die im Titel so geschrieben bleiben
  var ABBR = { bma: 'BMA', vu: 'VU', mig: 'MiG', hrm: 'HRM', abc: 'ABC', bab: 'BAB', rd: 'RD', th: 'TH', lkw: 'LKW',
    pkw: 'PKW', rtw: 'RTW', nef: 'NEF', rth: 'RTH', kats: 'KatS', gsg: 'GSG', cbrn: 'CBRN', bmz: 'BMZ', pol: 'POL',
    lz: 'LZ', dlk: 'DLK', ktw: 'KTW', y: 'Y', p: 'P', b: 'B', h: 'H', f: 'F', tlf: 'TLF', hlf: 'HLF', elw: 'ELW' };
  var LOWER = { klein: 1, mittel: 1, 'groß': 1, gross: 1, auf: 1, in: 1, im: 1, am: 1, an: 1, unter: 1, 'über': 1,
    mit: 1, von: 1, und: 1, der: 1, die: 1, das: 1, dem: 1, den: 1, zur: 1, zum: 1 };
  var WORDS = { strasse: 'Straße', fahrbahn: 'Fahrbahn' };

  // Stichwort -> Einsatzart (erste passende Regel gewinnt; Text ist GROSS und ohne Umlaute)
  var RULES = [
    [/BMA|BMZ|BRANDMELDE/, 'Ausgelöste Brandmeldeanlage'],
    [/HRM|RAUCHMELDER/, 'Hausrauchmelder'],
    [/MIG/, 'Feuer MiG'],
    [/KAMIN/, 'Kaminbrand'],
    [/RAUCH/, 'Verdächtiger Rauch'],
    [/(FEUER|BRAND|^F)[_ ]?KLEIN/, 'Feuer klein'],
    [/^(FEUER|BRAND|F)([_ ]|$)/, 'Feuer'],   // „FEUER_BAUMBRAND“, „FEUER_WASSERSCHADEN“ bleiben Feuer
    [/KLEMMT|EINGEKL/, 'Eingeklemmte Person'],
    [/TUER|WOHNUNG/, 'Person in Wohnung'],
    [/(^|_| )VU($|_| )|VERKEHR|UNFALL/, 'Verkehrsunfall'],
    [/OEL/, 'Ölspur'],
    [/STURM|BAUM|UNWETTER|WASSERSCHADEN/, 'Sturmschaden'],
    [/TIER/, 'Tierrettung'],
    [/WASSER|ERTRINK/, 'Wasserrettung'],
    [/ABC|CBRN|GAS|GEFAHR/, 'ABC-Einsatz'],
    [/UMWELT/, 'Umweltschutzeinsatz'],
    [/AMTSHILFE|POLIZEI/, 'Amtshilfe'],
    [/(HILFE|^H|^TH)[_ ]?KLEIN/, 'Hilfe klein'],
    [/FEUER|BRAND|^F_/, 'Feuer'],
    [/HILFE|^H_|^TH/, 'Technische Hilfeleistung']
  ];

  // Einheiten: die erste zählt ohne Kürzel (38/2026), die zweite mit Kürzel vor der Nummer (z. B. A07/2026)
  var U = CFG.units && CFG.units.length ? CFG.units : [{ key: 'main', name: '', label: '', prefix: '' }];
  var K0 = U[0].key, K1 = U[1] ? U[1].key : '_keine', P1 = U[1] ? (U[1].prefix || '') : '';
  var N0 = U[0].name ? norm(U[0].name) : '\u0000', N1 = U[1] ? norm(U[1].name) : '\u0000';
  // Einheitsname als ganzes Wort („Nord“ steckt nicht in „Nordhausen“)
  function hasUnit(t, n) { return n !== '\u0000' && new RegExp('(^|[^A-Z])' + reEsc(n) + '([^A-Z]|$)').test(t); }
  function reEsc(x) { return String(x).replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&'); }
  var UNIT_ALT = U.filter(function (u) { return u.name; }).map(function (u) { return reEsc(u.name); }).join('|') || 'XXXXXXXX';
  var PFX = P1 ? '(' + reEsc(P1) + '?)' : '()';
  if (!CFG.vehicles[K1]) CFG.vehicles[K1] = [];
  if (!CFG.vehicles[K0]) CFG.vehicles[K0] = [];

  // ---- Speicher -------------------------------------------------------------
  var LS = 'evq.v1.';
  function load(k, d) { try { var v = localStorage.getItem(LS + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) {} }

  var CAN_PUB = !(window.EVQ_WP && EVQ_WP.can_publish === false); // WordPress-Konto darf veröffentlichen?
  var settings = load('settings', { user: '', pass: '', publish: CAN_PUB });
  if (!CAN_PUB && settings.publish) settings.publish = false;
  var queue = load('queue', []);
  var learned = load('learned', { types: {}, vehicles: {} });
  var openId = null;
  var existing = {};   // "38/2026" -> {id, link}

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function norm(s) { return String(s).toUpperCase().replace(/Ä/g, 'AE').replace(/Ö/g, 'OE').replace(/Ü/g, 'UE').replace(/ß/g, 'SS'); }
  function persist() { save('queue', queue); }

  // ---- Erkennen -------------------------------------------------------------
  function stripWhatsApp(line) {
    return line
      .replace(/^‎?\[\d{1,2}\.\d{1,2}\.\d{2,4},? \d{1,2}:\d{2}(?::\d{2})?\]\s*[^:]{1,60}:\s*/, '')   // iOS
      .replace(/^\d{1,2}\.\d{1,2}\.\d{2,4},\s\d{1,2}:\d{2}\s-\s[^:]{1,60}:\s*/, '')                   // Android
      .replace(/[*~]/g, '').replace(/‎/g, '').trim();
  }

  // Nur Einheitennamen („LZ Nord“, „LZ Nord, LZ Süd“) gehören noch zur Nummer – danach kann direkt die nächste Meldung folgen
  var UNIT_TAIL = '((?:[ \\t]*(?:[,+&\\/]|und)?[ \\t]*(?:LZ|LG|Löschzug|Löschgruppe)?[ \\t]*(?:' + UNIT_ALT + '))*)';
  var NUM_RE = new RegExp('Einsatz\\s*(?:Nr\\.?|Nummer)?\\s*:?\\s*' + PFX + '\\s*-?\\s*(\\d{1,4})\\s*\\/\\s*(\\d{2,4})' + UNIT_TAIL, 'gi');
  // Gemeinsamer Einsatz (zwei Nummern, ein Stichwort): "… LZ Nord / 07/2026 LZ Süd", "… LZ Süd - 20/2026 LZ Nord"
  // oder als eigene Zeile direkt darunter: "Einsatz Nr. 15/2026 LZ Nord\nEinsatz Nr. 02/2026 LZ Süd"
  var SECOND_RE = new RegExp('^(?:[ \\t]*(?:[\\/,+&;]|[-–]|und)[ \\t]*|[ \\t]*\\r?\\n[ \\t]*Einsatz[ \\t]*(?:Nr\\.?|Nummer)?[ \\t]*:?[ \\t]*)(?:Nr\\.?[ \\t]*)?' + PFX + '[ \\t]*-?[ \\t]*(\\d{1,4})[ \\t]*\\/[ \\t]*(\\d{2,4})' + UNIT_TAIL, 'i');
  // Datum mit Uhrzeit („20.03.2026 - 16.51 Uhr“) oder ohne (dann 00:00 und Hinweis „Uhrzeit fehlt“)
  var DATE_RE = /(\d{1,2})\.(\d{1,2})\.(\d{2,4})(?![.\d])(?:\s*(?:[-–,]|um)?\s*(\d{1,2})[.:](\d{2}))?/g;

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function parse(text) {
    var clean = text.split(/\r?\n/).map(stripWhatsApp).join('\n');
    var out = [], m, prevEnd = 0;
    NUM_RE.lastIndex = 0;
    while ((m = NUM_RE.exec(clean))) {
      var seg = clean.slice(prevEnd, m.index);
      prevEnd = m.index + m[0].length;

      var all = m[0], m2 = SECOND_RE.exec(clean.slice(prevEnd));
      var partOf = function (x) {
        var t = norm(x[4] || ''), h0 = hasUnit(t, N0), h1 = !!U[1] && hasUnit(t, N1);
        return { num: +x[2], year: x[3].length === 2 ? '20' + x[3] : x[3],
          lz: h1 && !h0 ? K1 : h0 ? K0 : x[1] ? K1 : '', both: h0 && h1 };
      };
      var parts = [partOf(m)], unit = {}, main = parts[0], second = null;
      if (m2 && U[1]) {
        var p2 = partOf(m2), a0 = parts[0].lz || (p2.lz === K0 ? K1 : K0), a1 = p2.lz || (a0 === K0 ? K1 : K0);
        // Zweite Nummer gehört nur dazu, wenn sie zur anderen Einheit gehört – sonst ist es die nächste Meldung
        if (a0 !== a1) { parts[0].lz = a0; p2.lz = a1; parts.push(p2); prevEnd += m2[0].length; NUM_RE.lastIndex = prevEnd; all += m2[0]; }
      }
      unit[K0] = false; unit[K1] = false;
      if (parts.length === 2) {
        main = parts[0].lz === K0 ? parts[0] : parts[1];
        second = main === parts[0] ? parts[1] : parts[0];
        unit[K0] = true; unit[K1] = true;
      } else {
        unit[K0] = main.lz === K0 || main.both || !main.lz;
        unit[K1] = !!U[1] && (main.lz === K1 || main.both);
      }
      // Nummernkreis der (Haupt-)Nummer: zweite Einheit nur, wenn die Nummer ihr gehört (Kürzel oder Einheitsname)
      var seq = main.lz === K1 && !main.both ? K1 : K0;

      // letztes Datum im Abschnitt vor der Nummer
      var d, last = null;
      DATE_RE.lastIndex = 0;
      while ((d = DATE_RE.exec(seg))) last = d;
      var start = '', before = seg, after = '', noTime = false;
      if (last) {
        var y = last[3].length === 2 ? '20' + last[3] : last[3];
        noTime = last[4] === undefined;
        start = y + '-' + pad(+last[2]) + '-' + pad(+last[1]) + 'T' + (noTime ? '00:00' : pad(+last[4]) + ':' + last[5]);
        before = seg.slice(0, last.index); after = seg.slice(last.index + last[0].length).replace(/^\s*Uhr/i, '');
      }
      // Stichwort: letzte Zeile vor dem Datum – steht das Datum zuerst, die erste Zeile danach
      var lines = before.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
      if (!lines.length && after) lines = after.split('\n').map(function (l) { return l.trim(); }).filter(Boolean).slice(0, 1);
      var keyword = (lines[lines.length - 1] || '').replace(/^[^\wÄÖÜäöü]+/, '').trim();

      var raw = seg.split('\n').concat(all).map(function (l) { return l.replace(/^[\s;,]+/, '').trim(); })
        .filter(Boolean).slice(-5).join('\n');
      var item = makeItem(main.num, main.year, unit, keyword, start, raw, second, seq);
      item.noTime = noTime;
      // Gemeinsamer Einsatz: je Einheit eine eigene Karte (eigene Nummer, eigene Fahrzeuge), verknüpft – auf Wunsch zusammenfassbar
      if (second) out.push.apply(out, splitItem(item)); else out.push(item);
    }
    return out;
  }

  function fmtKeyword(kw) {
    var toks = kw.split(/[_\s]+/).filter(Boolean).map(function (t) {
      return t.split('-').map(function (p) {
        var l = p.toLowerCase();
        if (ABBR[l]) return ABBR[l];
        if (LOWER[l]) return l;
        if (WORDS[l]) return WORDS[l];
        return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
      }).join('-');
    });
    var res = [];
    for (var i = 0; i < toks.length; i++) {
      // einzelner Buchstabe (P, Y …) wird mit dem nächsten Wort verbunden: P_Tür -> P-Tür
      if (toks[i].length === 1 && i > 0 && i < toks.length - 1) { res.push(toks[i] + '-' + toks[i + 1]); i++; }
      else res.push(toks[i]);
    }
    return res.join(' ');
  }

  function guessType(kw) {
    var k = norm(kw).trim();
    if (learned.types[k]) return learned.types[k];
    for (var i = 0; i < RULES.length; i++) if (RULES[i][0].test(k)) return RULES[i][1];
    return '';
  }

  // Nummern der Berichte, die für diesen Einsatz angelegt werden (gemeinsamer Einsatz = zwei Berichte)
  // Nummernkreis der Nummer (ältere Einträge ohne Angabe: aus den Einheiten ableiten)
  function seqOf(it) { return it.seq || (it.unit[K1] && !it.unit[K0] ? K1 : K0); }
  function reportNums(it) {
    if (!it.num2) return [(seqOf(it) === K1 ? P1 : '') + pad(it.num) + '/' + it.year];
    var r = [];
    if (it.unit[K0]) r.push(pad(it.num) + '/' + it.year);
    if (it.unit[K1]) r.push(P1 + pad(it.num2) + '/' + it.year2);
    return r;
  }
  function numStr(it) { return reportNums(it)[0]; }
  function allExist(it) { return reportNums(it).every(function (n) { return existing[n] || (it.posts && it.posts[n]); }); }
  function titleFor(it, n) { return it.title.split(numStr(it)).join(n); }
  function autoTitle(it) { return ('Einsatz ' + numStr(it) + ' ' + fmtKeyword(it.keyword)).trim(); }
  function vehKey(it) { return norm(it.keyword) + '|' + (it.unit[K0] ? 'L' : '') + (it.unit[K1] ? 'A' : ''); }

  // Gemeinsamer Einsatz (ein Eintrag, zwei Nummern) ↔ zwei eigenständige Karten, die aufeinander verweisen
  function splitItem(it) {
    var ua = {}, ub = {}; ua[K0] = true; ua[K1] = false; ub[K0] = false; ub[K1] = true;
    var a = makeItem(it.num, it.year, ua, it.keyword, it.start, it.raw, null, K0), b = makeItem(it.num2, it.year2, ub, it.keyword, it.start, it.raw, null, K1);
    [a, b].forEach(function (x) { ['end', 'location', 'content', 'type', 'special', 'hasimages', 'noTime'].forEach(function (k) { x[k] = it[k]; }); x.ext = it.ext.slice(); x.suggested = false; });
    if (it.titleEdited) { a.title = titleFor(it, numStr(a)); b.title = titleFor(it, numStr(b)); a.titleEdited = b.titleEdited = true; }
    a.vehicles = it.vehicles.filter(function (v) { return CFG.vehicles[K1].indexOf(v) < 0; });
    b.vehicles = it.vehicles.filter(function (v) { return CFG.vehicles[K1].indexOf(v) >= 0; });
    if (!b.vehicles.length) b.vehicles = CFG.vehicles[K1].slice();
    a.pair = b.id; b.pair = a.id;
    return [a, b];
  }
  function mergeItems(a, b) { // a = Karte der ersten Einheit, b = der zweiten
    var unit = {}; unit[K0] = true; unit[K1] = true;
    var m = makeItem(a.num, a.year, unit, a.keyword, a.start, a.raw, { num: b.num, year: b.year }, K0);
    ['end', 'location', 'type', 'special', 'hasimages', 'noTime'].forEach(function (k) { m[k] = a[k] || b[k]; });
    // Texte beider Karten behalten; ein von Hand geänderter Titel bleibt
    m.content = a.content && b.content && a.content !== b.content ? a.content + '\n\n' + b.content : (a.content || b.content);
    if (a.titleEdited || b.titleEdited) { var src = a.titleEdited ? a : b; m.title = src.title.split(numStr(src)).join(numStr(m)); m.titleEdited = true; }
    m.suggested = false;
    m.vehicles = a.vehicles.concat(b.vehicles.filter(function (v) { return a.vehicles.indexOf(v) < 0; }));
    m.ext = a.ext.concat(b.ext.filter(function (v) { return a.ext.indexOf(v) < 0; }));
    return m;
  }
  function makeItem(num, year, unit, keyword, start, raw, second, seq) {
    var it = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), num: num, year: year, unit: unit, seq: seq || K0,
      keyword: keyword, start: start, end: '', location: '', content: '', special: false, hasimages: false, raw: raw, status: 'open', titleEdited: false,
      num2: second ? second.num : null, year2: second ? second.year : null, posts: {} };
    it.title = autoTitle(it);
    it.type = guessType(keyword);
    var lv = learned.vehicles[vehKey(it)];
    it.vehicles = lv ? lv.slice() : (unit[K1] ? CFG.vehicles[K1].slice() : []);
    it.ext = [];
    it.suggested = !!lv;
    return it;
  }

  // ---- Zeit -----------------------------------------------------------------
  // "YYYY-MM-DDTHH:MM" (Ortszeit Deutschland) -> RFC 3339 mit korrektem Offset
  function rfc3339(local) {
    var p = local.split(/[-T:]/).map(Number);
    var guess = Date.UTC(p[0], p[1] - 1, p[2], p[3], p[4]);
    var off = berlinOffset(new Date(guess));
    off = berlinOffset(new Date(guess - off * 60000));
    var sign = off >= 0 ? '+' : '-', a = Math.abs(off);
    return local + ':00' + sign + pad(Math.floor(a / 60)) + ':' + pad(a % 60);
  }
  function berlinOffset(date) {
    var s = date.toLocaleString('en-US', { timeZone: CFG.tz || 'Europe/Berlin', hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    var q = s.match(/(\d+)\/(\d+)\/(\d+),\s*(\d+):(\d+)/);
    var asUtc = Date.UTC(+q[3], +q[1] - 1, +q[2], +q[4] % 24, +q[5]);
    return Math.round((asUtc - date.getTime()) / 60000);
  }
  function addMinutes(local, min) {
    var p = local.split(/[-T:]/).map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2], p[3], p[4] + min));
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes());
  }
  function fmtDE(local) {
    if (!local) return '–';
    var p = local.split(/[-T:]/);
    return p[2] + '.' + p[1] + '.' + p[0] + ' ' + p[3] + ':' + p[4];
  }
  function duration(it) {
    if (!it.start || !it.end) return '';
    var a = new Date(it.start + 'Z'), b = new Date(it.end + 'Z'), m = Math.round((b - a) / 60000);
    if (m <= 0) return '';
    return Math.floor(m / 60) + ':' + pad(m % 60) + ' h';
  }

  // ---- API ------------------------------------------------------------------
  // Ist man in WordPress angemeldet, wird diese Anmeldung genutzt (kein Anwendungspasswort nötig)
  var wp = { nonce: (window.EVQ_WP && EVQ_WP.nonce) || null, name: (window.EVQ_WP && EVQ_WP.user) || '' };
  function fetchNonce() {
    return fetch(CFG.ajaxUrl + '?action=rest-nonce', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.text() : ''; })
      .then(function (t) { wp.nonce = /^[a-f0-9]{10}$/.test(t.trim()) ? t.trim() : null; return wp.nonce; })
      .catch(function () { wp.nonce = null; return null; });
  }
  function authOpts(extra) {
    var h = Object.assign({}, extra || {});
    if (wp.nonce) { h['X-WP-Nonce'] = wp.nonce; return { credentials: 'same-origin', headers: h }; }
    h.Authorization = authHeader();
    return { credentials: 'omit', headers: h };
  }

  function authHeader() {
    return 'Basic ' + btoa(unescape(encodeURIComponent(settings.user + ':' + settings.pass.replace(/\s+/g, ''))));
  }

  function loadLists() {
    // aktuelle Listen aus WordPress holen (öffentlich lesbar), Konfiguration dient als Rückfall
    fetch(CFG.api + 'wp/v2/einsatzart?per_page=100&_fields=name').then(function (r) { return r.ok ? r.json() : null; })
      .then(function (l) { if (l && l.length) { CFG.types = l.map(function (t) { return decodeHtml(t.name); }); renderList(); } })
      .catch(function () {});
    fetch(CFG.api + 'wp/v2/exteinsatzmittel?per_page=100&_fields=name').then(function (r) { return r.ok ? r.json() : null; })
      .then(function (l) {
        if (!l || !l.length) return;
        var names = l.map(function (t) { return decodeHtml(t.name); });
        CFG.external = CFG.external.filter(function (n) { return names.indexOf(n) >= 0; })
          .concat(names.filter(function (n) { return CFG.external.indexOf(n) < 0; }));
        renderList();
      }).catch(function () {});
  }
  function decodeHtml(s) { var t = document.createElement('textarea'); t.innerHTML = s; return t.value; }

  // Prüft, welche Einsätze schon auf der Website stehen
  function checkExisting() {
    var years = {};
    queue.forEach(function (it) { years[it.year] = 1; });
    // Alle Berichte des Jahres (seitenweise, auch Entwürfe – die sieht man nur angemeldet)
    function pageAll(y) {
      var base = CFG.api + 'wp/v2/einsatz?per_page=100&_fields=id,title,link&after=' + y + '-01-01T00:00:00&before=' + (+y + 1) + '-01-01T00:00:00' +
        (wp.nonce ? '&status=publish,draft,pending,private,future&context=edit' : '');
      var acc = [];
      function step(pg) {
        return fetch(base + '&page=' + pg, wp.nonce ? authOpts() : {}).then(function (r) {
          if (!r.ok) return acc;
          var total = +r.headers.get('X-WP-TotalPages') || 1;
          return r.json().then(function (l) { acc = acc.concat(l || []); return pg < total && pg < 20 ? step(pg + 1) : acc; });
        });
      }
      return step(1);
    }
    Object.keys(years).forEach(function (y) {
      pageAll(y)
        .then(function (list) {
          list.forEach(function (p) {
            var t = decodeHtml(p.title.rendered), m = t.match(new RegExp('(' + (P1 ? reEsc(P1) + '?' : '') + ')-?(\\d{1,4})\\/(\\d{4})'));
            if (m) existing[m[1] + pad(+m[2]) + '/' + m[3]] = { id: p.id, link: p.link, title: t };
          });
          var changed = false;
          queue.forEach(function (it) {
            if (it.status === 'open' && allExist(it)) {
              it.status = 'exists'; changed = true;
            }
          });
          var cur = openId && byId(openId);
          if (!changed) {
            // Hinweis "gibt es schon" im offenen Einsatz aktualisieren, ohne beim Tippen zu stören
            var el = cur && document.querySelector('#evq .evq-card[data-id="' + cur.id + '"]');
            if (el && !el.contains(document.activeElement)) renderCard(cur);
            return;
          }
          if (cur && cur.status === 'exists') openId = nextOpen(openId);
          persist(); renderList();
        }).catch(function () {});
    });
  }

  // Legt alle noch fehlenden Berichte dieses Einsatzes nacheinander an
  var IMG = {}; // Einsatzbilder je Eintrag (nur bis zum Senden im Speicher)
  // Foto verkleinern (längste Seite 2000 px, JPEG) – schnell hochgeladen, gut genug für die Website
  function readImage(file) {
    return new Promise(function (ok, no) {
      var fr = new FileReader();
      fr.onerror = function () { no(new Error('Foto konnte nicht gelesen werden.')); };
      fr.onload = function () {
        var im = new Image();
        im.onerror = function () { no(new Error('Das ist kein lesbares Foto.')); };
        im.onload = function () {
          var k = Math.min(1, 2000 / Math.max(im.width, im.height)), c = document.createElement('canvas');
          c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
          c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
          ok(c.toDataURL('image/jpeg', 0.85));
        };
        im.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  // Nach dem Anlegen: Besonderer Einsatz, Bilder, Einsatzbild für alle Berichte dieses Einsatzes
  function sendExtra(it) {
    var ids = Object.keys(it.posts || {}).map(function (n) { return it.posts[n]; }).filter(Boolean), img = IMG[it.id], att = null;
    if (!ids.length || (!it.special && !it.hasimages && !img)) return Promise.resolve();
    return ids.reduce(function (p, id) {
      return p.then(function () {
        var body = { post_id: id, special: !!it.special, hasimages: !!(it.hasimages || img) };
        if (img) { if (att) body.attachment_id = att; else body.image = img.data; }
        var opts = authOpts({ 'Content-Type': 'application/json' }); opts.method = 'POST'; opts.body = JSON.stringify(body);
        return fetch(CFG.api + 'myf/v1/quick/extra', opts).then(function (r) { return r.json().then(function (j) {
          if (!r.ok) throw new Error('Bericht angelegt, aber ' + (j.message || 'Bild/Merkmale nicht gespeichert') + '.');
          att = att || j.attachment_id;
        }); });
      });
    }, Promise.resolve()).then(function () { delete IMG[it.id]; });
  }
  function sendAll(it) {
    if (!wp.nonce && (!settings.user || !settings.pass)) {
      showSettings(true);
      return Promise.reject(new Error('Bitte in WordPress anmelden (oder Benutzer und Anwendungspasswort eintragen).'));
    }
    it.posts = it.posts || {};
    return reportNums(it).reduce(function (p, n) {
      return p.then(function () {
        if (it.posts[n] || (existing[n] && !it.force)) return;
        return send(it, titleFor(it, n)).then(function (id) { it.posts[n] = id; persist(); });
      });
    }, Promise.resolve()).then(function () { return sendExtra(it); });
  }

  function send(it, title, retried) {
    var body = { reason: title, date_start: rfc3339(it.start), publish: !!settings.publish };
    if (it.end) body.date_end = rfc3339(it.end);
    if (it.type) body.keyword = it.type;
    if (it.location.trim()) body.location = it.location.trim();
    if (it.content.trim()) body.content = it.content.trim();
    var res = it.vehicles.concat(it.ext);
    if (res.length) body.resources = res.join(', ');
    var opts = authOpts({ 'Content-Type': 'application/json' });
    opts.method = 'POST'; opts.body = JSON.stringify(body);
    return fetch(CFG.api + 'einsatzverwaltung/v1/reports', opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 201 && j.id) return j.id;
        // WordPress-Anmeldung abgelaufen/erneuert: frischen Nonce holen und einmal wiederholen
        if (wp.nonce && j.code === 'rest_cookie_invalid_nonce' && !retried)
          return fetchNonce().then(function () { return send(it, title, true); });
        var msg = j.message || ('Fehler ' + r.status);
        if (r.status === 401) msg = loginError(r, j);
        if (r.status === 403) msg = wp.nonce
          ? 'Dein WordPress-Konto darf keine Einsatzberichte ' + (settings.publish ? 'veröffentlichen.' : 'anlegen.')
          : 'Keine Berechtigung. Hat der Benutzer die Rolle „Einsatzberichte-API“?' + (settings.publish ? ' (Die Rolle „(Entwürfe)“ darf nicht veröffentlichen.)' : '');
        throw new Error(msg);
      });
    });
  }

  // ---- Darstellung ----------------------------------------------------------
  var STATUS = { open: ['Offen', ''], sent: ['Gespeichert', 'ok'], exists: ['Schon online', 'warn'], error: ['Fehler', 'err'] };
  var ICON = {
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
  };

  function toggle(cls, label, on, attrs) {
    return '<button type="button" class="' + cls + '" aria-pressed="' + (on ? 'true' : 'false') + '" ' + attrs + '>' + esc(label) + '</button>';
  }
  function field(label, html, note) {
    return '<div class="evq-fl"><span>' + label + '</span>' + (note ? '<small>' + note + '</small>' : '') + '</div>' + html;
  }
  function kwOf(it) { return it.title.replace(/^Einsatz\s+\S+\s*/i, '') || 'Ohne Stichwort'; }
  function unitLabel(it) { return U.filter(function (u) { return it.unit[u.key]; }).map(function (u) { return u.name || u.label; }).filter(Boolean).join(' + '); }

  function cardHtml(it) {
    var st = STATUS[it.status] || STATUS.open, open = openId === it.id, n = it.vehicles.length + it.ext.length;
    var done = it.status === 'sent' || it.status === 'exists';
    var h = '<div class="evq-card' + (open ? ' is-open' : '') + (done ? ' is-done' : '') + '" data-id="' + it.id + '">' +
      '<button type="button" class="evq-head" data-act="toggle" aria-expanded="' + open + '">' +
      '<span class="evq-num">' + reportNums(it).map(esc).join('<br>') + '</span>' +
      '<span class="evq-t"><span class="evq-kw">' + esc(kwOf(it)) + '</span><span class="evq-meta">' + esc(fmtDE(it.start)) +
      ' · ' + unitLabel(it) + (n ? ' · ' + n + ' Fzg.' : '') + '</span></span>' +
      (st[0] !== 'Offen' ? '<span class="evq-tag ' + st[1] + '">' + st[0] + '</span>' : '') + '</button>';
    if (!open) return h + '</div>';

    var b = '<div class="evq-body">';
    if (it.status === 'sent') {
      b += '<div class="evq-msg ok" style="margin-top:0">' + (settings.publish ? 'Veröffentlicht: ' : 'Als Entwurf gespeichert: ') +
        Object.keys(it.posts || {}).map(function (k) {
          return '<a href="' + CFG.adminUrl + 'post.php?post=' + it.posts[k] + '&action=edit" target="_blank" rel="noopener">' + esc(k) + '</a>';
        }).join(' · ') + '</div>';
      return h + b + '<div class="evq-raw">' + esc(it.raw) + '</div>' +
        '<div class="evq-act"><button type="button" class="evq-grow" data-act="drop">Aus Liste entfernen</button></div></div></div>';
    }
    if (it.status === 'exists') {
      b += '<div class="evq-msg warn" style="margin-top:0">Steht schon auf der Website: ' + reportNums(it).map(function (n) {
          var ex = existing[n];
          return ex && ex.link ? '<a href="' + esc(ex.link) + '" target="_blank" rel="noopener">' + esc(ex.title) + '</a>' : esc(ex ? ex.title : n);
        }).join(', ') + '.</div>';
      return h + b + '<div class="evq-raw">' + esc(it.raw) + '</div>' +
        '<div class="evq-act"><button type="button" data-act="force">Trotzdem anlegen</button>' +
        '<button type="button" class="evq-p evq-grow" data-act="drop">Verwerfen</button></div></div></div>';
    }

    var partner = it.pair ? byId(it.pair) : null;
    if (partner && partner.status !== 'open' && partner.status !== 'error') partner = null; // schon angelegt: nichts mehr zusammenzufassen
    if (partner) b += '<div class="evq-msg">Gemeinsamer Einsatz mit <b>' + esc(reportNums(partner).join(', ')) + '</b> (' + esc(unitLabel(partner)) + ') – wird als eigener Bericht angelegt. ' +
      '<button type="button" class="evq-q" data-act="merge">Zusammenfassen: ein Eintrag, beide Berichte mit gleichem Inhalt</button></div>';
    b += field('Titel', '<input type="text" data-f="title" value="' + esc(it.title) + '">');
    if (U.length > 1) b += field('Einheit', '<div class="evq-segs">' + U.slice(0, 2).map(function (u) {
      return toggle('evq-seg', u.name || u.label, it.unit[u.key], 'data-act="unit" data-v="' + esc(u.key) + '"');
    }).join('') + '</div>');
    var nums = reportNums(it), todo = nums.filter(function (n) { return it.force || !(existing[n] || (it.posts && it.posts[n])); });
    if (nums.length > 1) b += '<div class="evq-msg">Gemeinsamer Einsatz – ' + (todo.length === nums.length ? 'es werden zwei Berichte angelegt: ' :
      esc(nums.filter(function (n) { return todo.indexOf(n) < 0; }).join(', ')) + ' gibt es schon, angelegt wird nur: ') +
      todo.map(function (n) { return '<b>' + esc(titleFor(it, n)) + '</b>'; }).join(' und ') + ' <button type="button" class="evq-q" data-act="split">Getrennt bearbeiten: eine Karte je Einheit</button></div>';

    b += field('Einsatzart', '<select data-f="type"><option value="">– keine –</option>' +
      CFG.types.map(function (t) { return '<option' + (t === it.type ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') +
      (it.type && CFG.types.indexOf(it.type) < 0 ? '<option selected>' + esc(it.type) + '</option>' : '') + '</select>');

    var veh = '';
    U.slice(0, 2).forEach(function (uu) {
      var u = uu.key;
      if (!CFG.vehicles[u].length || (!it.unit[u] && !CFG.vehicles[u].some(function (v) { return it.vehicles.indexOf(v) >= 0; }))) return;
      var all = CFG.vehicles[u].every(function (v) { return it.vehicles.indexOf(v) >= 0; });
      veh += '<div class="evq-unit"><span>' + esc(U.length > 1 ? uu.label : 'Eigene Fahrzeuge') + '</span>' +
        (CFG.vehicles[u].length > 1 ? '<button type="button" class="evq-q" data-act="vehall" data-v="' + u + '">' + (all ? 'Keine' : 'Alle') + '</button>' : '') + '</div>' +
        '<div class="evq-tiles">' + CFG.vehicles[u].map(function (v) {
          return toggle('evq-tile', v, it.vehicles.indexOf(v) >= 0, 'data-act="veh" data-v="' + esc(v) + '"');
        }).join('') + '</div>';
    });
    b += field('Fahrzeuge', veh, it.suggested ? 'Vorschlag vom letzten Mal' : '');
    if (!it.vehicles.length) b += '<div class="evq-msg warn">Ohne Fahrzeug wird keine Einheit eingetragen.</div>';

    b += '<details' + (it.ext.length ? ' open' : '') + '><summary>Externe Kräfte' + (it.ext.length ? ' · ' + it.ext.length : '') + '</summary>' +
      '<div class="evq-tiles sm" style="margin-top:10px">' + CFG.external.map(function (v) {
        return toggle('evq-tile', v, it.ext.indexOf(v) >= 0, 'data-act="ext" data-v="' + esc(v) + '"');
      }).join('') + '</div></details>';

    b += field('Alarmzeit', '<input type="datetime-local" data-f="start" value="' + esc(it.start) + '">' +
      (it.noTime ? '<div class="evq-msg warn">In der Meldung stand keine Uhrzeit – bitte eintragen.</div>' : ''));
    b += field('Einsatzende', '<div class="evq-segs">' + [[30, '30′'], [60, '1 h'], [90, '1,5 h'], [120, '2 h'], [180, '3 h']].map(function (x) {
        return toggle('evq-seg', x[1], it.start && it.end === addMinutes(it.start, x[0]), 'data-act="dur" data-v="' + x[0] + '"');
      }).join('') + '</div>' +
      '<div class="evq-row" style="margin-top:6px"><input class="evq-grow" type="time" data-f="endtime" value="' + esc(it.end ? it.end.slice(11) : '') + '" aria-label="Uhrzeit Einsatzende">' +
      (it.end ? '<button type="button" class="evq-ic" data-act="noend" aria-label="Einsatzende löschen">✕</button>' : '') + '</div>',
      duration(it) ? 'Dauer ' + duration(it) : 'optional');

    // Bericht für die Website: Besonderer Einsatz, Bilder, Text zum Einfügen, Einsatzbild (wird Beitragsbild)
    var img = IMG[it.id];
    b += '<div class="evq-web"><div class="evq-webh">Bericht für die Website</div>' +
      '<div class="evq-segs">' + toggle('evq-seg', '★ Besonderer Einsatz', it.special, 'data-act="flag" data-v="special"') +
        toggle('evq-seg', 'Bericht enthält Bilder', it.hasimages || !!img, 'data-act="flag" data-v="hasimages"' + (img ? ' disabled title="Mit Einsatzbild automatisch an"' : '')) + '</div>' +
      field('Einsatzort', '<input type="text" data-f="location" value="' + esc(it.location) + '" placeholder="z. B. ' + esc(CFG.place ? CFG.place + ', ' : '') + 'Hauptstraße">', 'ohne Hausnummer') +
      field('Einsatzbericht', '<textarea data-f="content" rows="6" placeholder="Bericht hier einfügen – z. B. aus WhatsApp oder Word">' + esc(it.content) + '</textarea>', 'optional') +
      (it.imgLost ? '<div class="evq-msg warn">Das ausgewählte Foto ging beim Neuladen der Seite verloren – bitte erneut auswählen.</div>' : '') +
      field('Einsatzbild', img ? '<div class="evq-img"><img src="' + img.data + '" alt=""><div><b>' + esc(img.name) + '</b><span>wird das Beitragsbild des Berichts</span>' +
          '<button type="button" class="evq-q" data-act="noimg">Bild entfernen</button></div></div>'
        : '<label class="evq-file"><input type="file" accept="image/*" data-img="1"><span>Foto auswählen oder aufnehmen</span></label>', 'optional – wird Beitragsbild') + '</div>';

    b += '<div class="evq-raw">' + esc(it.raw) + '</div>';
    if (it.status === 'error' && it.error) b += '<div class="evq-msg err">' + esc(it.error) + '</div>';
    b += '<div class="evq-act"><button type="button" class="evq-ic" data-act="del" aria-label="Aus Liste entfernen">' + ICON.trash + '</button>' +
      '<button type="button" data-act="skip">Später</button>' +
      '<button type="button" class="evq-go" data-act="send">' + (settings.publish ? 'Veröffentlichen' : 'Entwurf speichern') + ICON.arrow + '</button></div>';
    return h + b + '</div></div>';
  }

  function renderList() {
    var el = $('evq-list');
    var openCount = queue.filter(function (i) { return i.status === 'open' || i.status === 'error'; }).length;
    $('evq-count').textContent = queue.length ? openCount + ' offen · ' + queue.length + ' gesamt' : '';
    var doneCount = queue.filter(function (i) { return i.status === 'sent' || i.status === 'exists'; }).length;
    $('evq-listtools').style.display = queue.length ? '' : 'none';
    $('evq-clear').style.display = doneCount ? '' : 'none';
    $('evq-clear').textContent = 'Erledigte & schon online entfernen (' + doneCount + ')';
    $('evq-clearall').textContent = 'Alle aus der Liste entfernen (' + queue.length + ')';
    var sa = $('evq-sendall'); if (!sa.disabled) { sa.style.display = openCount ? '' : 'none'; sa.textContent = 'Alle anlegen (' + openCount + ')'; }
    el.innerHTML = queue.length ? queue.map(cardHtml).join('') : '<div class="evq-empty">Noch nichts zu tun.</div>';
  }
  function renderCard(it) {
    var el = document.querySelector('#evq .evq-card[data-id="' + it.id + '"]');
    if (el) el.outerHTML = cardHtml(it);
  }
  function nextOpen(afterId) {
    var idx = queue.findIndex(function (i) { return i.id === afterId; });
    var order = queue.slice(idx + 1).concat(queue.slice(0, idx + 1));
    var n = order.find(function (i) { return (i.status === 'open' || i.status === 'error') && i.id !== afterId; });
    return n ? n.id : null;
  }
  function scrollToCard(id) {
    var el = document.querySelector('#evq .evq-card[data-id="' + id + '"]');
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function byId(id) { return queue.find(function (i) { return i.id === id; }); }

  // Einen Eintrag anlegen (ein oder zwei Berichte) und merken, was gelernt wurde (Einsatzart, Fahrzeuge je Stichwort)
  function doSend(it) {
    return sendAll(it).then(function () {
      it.status = Object.keys(it.posts || {}).length ? 'sent' : 'exists'; it.error = ''; // alles schon da → nichts angelegt
      if (it.type) learned.types[norm(it.keyword).trim()] = it.type; else delete learned.types[norm(it.keyword).trim()];
      if (it.vehicles.length) learned.vehicles[vehKey(it)] = it.vehicles.slice();
      save('learned', learned);
      Object.keys(it.posts).forEach(function (n) { existing[n] = existing[n] || { id: it.posts[n], link: '', title: titleFor(it, n) }; });
      persist();
    }).catch(function (err) { it.status = 'error'; it.error = err.message; persist(); throw err; });
  }
  // Alle offenen Einträge nacheinander anlegen – so wie sie dastehen (Fahrzeuge können später im Bericht ergänzt werden)
  $('evq-sendall').addEventListener('click', function () {
    var todo = queue.filter(function (i) { return (i.status === 'open' || i.status === 'error') && i.start && !i.noTime; });
    var noTime = queue.filter(function (i) { return (i.status === 'open' || i.status === 'error') && (!i.start || i.noTime); }).length;
    if (!todo.length) { alert(noTime ? 'Bei allen offenen Einträgen fehlt die Alarmzeit.' : 'Nichts offen.'); return; }
    var noVeh = todo.filter(function (i) { return !i.vehicles.length; }).length;
    if (!confirm(todo.length + ' Einträge jetzt ' + (settings.publish ? 'veröffentlichen' : 'als Entwurf speichern') + '?' +
      (noVeh ? '\n' + noVeh + ' davon ohne Fahrzeugangabe – lässt sich später im Bericht ergänzen.' : '') +
      (noTime ? '\n' + noTime + ' ohne Alarmzeit werden übersprungen.' : ''))) return;
    var btn = $('evq-sendall'), n = 0, failed = 0; btn.disabled = true; openId = null;
    todo.reduce(function (p, it) {
      return p.then(function () { btn.textContent = 'Lege an … ' + (++n) + '/' + todo.length; return doSend(it).catch(function () { failed++; }).then(renderList); });
    }, Promise.resolve()).then(function () {
      btn.disabled = false; renderList();
      $('evq-parsemsg').innerHTML = '<div class="evq-msg ' + (failed ? 'warn' : 'ok') + '">' + (todo.length - failed) + ' angelegt' + (failed ? ', ' + failed + ' mit Fehler (siehe Karte)' : '') + '.</div>';
    });
  });

  // ---- Ereignisse -----------------------------------------------------------
  $('evq-list').addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]'); if (!t) return;
    var card = t.closest('.evq-card'), it = card && byId(card.dataset.id); if (!it) return;
    var act = t.dataset.act, v = t.dataset.v;
    if (act === 'force') { e.preventDefault(); it.status = 'open'; it.force = true; }
    if (act === 'toggle') { openId = openId === it.id ? null : it.id; renderList(); if (openId) scrollToCard(openId); return; }
    if (act === 'unit') {
      it.unit[v] = !it.unit[v];
      if (!it.unit[K0] && !it.unit[K1]) it.unit[v === K0 ? K1 : K0] = true;
      if (it.unit[K1] && !it.vehicles.some(function (x) { return CFG.vehicles[K1].indexOf(x) >= 0; }) && !it.unit[K0])
        it.vehicles = it.vehicles.concat(CFG.vehicles[K1]);
    }
    if (act === 'veh' || act === 'ext') {
      var arr = act === 'veh' ? it.vehicles : it.ext, i = arr.indexOf(v);
      if (i >= 0) arr.splice(i, 1); else arr.push(v);
      it.suggested = false;
    }
    if (act === 'vehall') {
      var list = CFG.vehicles[v], all = list.every(function (x) { return it.vehicles.indexOf(x) >= 0; });
      it.vehicles = it.vehicles.filter(function (x) { return list.indexOf(x) < 0; });
      if (!all) it.vehicles = it.vehicles.concat(list);
      it.suggested = false;
    }
    if (act === 'dur' && it.start) { var end = addMinutes(it.start, +v); it.end = it.end === end ? '' : end; }
    if (act === 'noend') it.end = '';
    if (act === 'flag') { if (t.disabled) return; it[v] = !it[v]; }
    if (act === 'noimg') { delete IMG[it.id]; }
    if (act === 'merge') {
      var pr = byId(it.pair); if (!pr || (pr.status !== 'open' && pr.status !== 'error')) return;
      var first = seqOf(it) === K0 ? it : pr, secondIt = first === it ? pr : it, merged = mergeItems(first, secondIt), at = queue.indexOf(first);
      queue = queue.filter(function (i) { return i !== it && i !== pr; }); queue.splice(Math.max(0, at), 0, merged);
      openId = merged.id; persist(); renderList(); scrollToCard(openId); return;
    }
    if (act === 'split') {
      var two = splitItem(it), pos = queue.indexOf(it);
      queue = queue.filter(function (i) { return i !== it; }); queue.splice(pos, 0, two[0], two[1]);
      openId = two[0].id; persist(); renderList(); scrollToCard(openId); return;
    }
    if (act === 'drop') {
      openId = nextOpen(it.id); queue = queue.filter(function (i) { return i !== it; }); persist(); renderList();
      if (openId) scrollToCard(openId);
      return;
    }
    if (act === 'del') {
      if (!confirm('„' + it.title + '“ aus der Liste entfernen?')) return;
      openId = nextOpen(it.id); queue = queue.filter(function (i) { return i !== it; }); persist(); renderList(); return;
    }
    if (act === 'skip') { openId = nextOpen(it.id); renderList(); if (openId) scrollToCard(openId); return; }
    if (act === 'send') {
      if (!it.start || it.noTime) { alert(it.noTime ? 'In der Meldung stand keine Uhrzeit – bitte die Alarmzeit ergänzen.' : 'Bitte Alarmzeit eintragen.'); return; }
      t.disabled = true; t.textContent = 'Sende …';
      doSend(it).then(function () { openId = nextOpen(it.id); renderList(); if (openId) scrollToCard(openId); }, function () { renderCard(it); });
      return;
    }
    persist(); renderCard(it);
  });

  $('evq-list').addEventListener('input', function (e) {
    var f = e.target.dataset.f; if (!f) return;
    var it = byId(e.target.closest('.evq-card').dataset.id), v = e.target.value;
    if (f === 'title') { it.title = v; it.titleEdited = true; }
    else if (f === 'start') {
      // Einsatzende wandert mit (gleiche Dauer); Ende vor Beginn gibt es nicht
      if (it.end && it.start && v) { var durMin = Math.round((new Date(it.end + 'Z') - new Date(it.start + 'Z')) / 60000); it.end = durMin > 0 ? addMinutes(v, durMin) : ''; }
      it.start = v; it.noTime = false;
    }
    else if (f === 'endtime') {
      if (!v || !it.start) it.end = '';
      else { var e2 = it.start.slice(0, 11) + v; if (e2 <= it.start) e2 = addMinutes(e2, 24 * 60); it.end = e2; }
    } else it[f] = v;
    persist();
  });
  $('evq-list').addEventListener('change', function (e) {
    if (e.target.dataset.img) {
      var ic = byId(e.target.closest('.evq-card').dataset.id), file = e.target.files && e.target.files[0]; if (!file || !ic) return;
      readImage(file).then(function (data) { IMG[ic.id] = { data: data, name: file.name }; ic.hasimages = true; ic.imgAuto = true; persist(); renderCard(ic); }, function (err) { alert(err.message); });
      return;
    }
    var f = e.target.dataset.f; if (!f) return;
    var it = byId(e.target.closest('.evq-card').dataset.id);
    if (f === 'type' || f === 'endtime' || f === 'start') renderCard(it);
  });

  $('evq-parse').addEventListener('click', function () {
    var found = parse($('evq-in').value), added = 0, dup = 0;
    found.forEach(function (n) {
      if (queue.some(function (q) { return numStr(q) === numStr(n); })) { dup++; return; }
      if (allExist(n)) n.status = 'exists';
      queue.push(n); added++;
    });
    queue.sort(function (a, b) { return a.start < b.start ? -1 : 1; });
    var msg = found.length ? added + ' Einsätze erkannt' + (dup ? ', ' + dup + ' waren schon in der Liste' : '') + '.'
      : 'Keine Meldung erkannt. Erwartet wird z. B. „Einsatz Nr. 38/2026' + (U[0].label ? ' ' + U[0].label : '') + '“.';
    $('evq-parsemsg').innerHTML = '<div class="evq-msg ' + (found.length ? 'ok' : 'err') + '">' + esc(msg) + '</div>';
    if (added) { $('evq-in').value = ''; openId = nextOpen(null) || openId; }
    persist(); renderList(); checkExisting();
    if (openId) scrollToCard(openId);
  });

  $('evq-paste').addEventListener('click', function () {
    if (!navigator.clipboard || !navigator.clipboard.readText) { $('evq-in').focus(); return; }
    navigator.clipboard.readText().then(function (t) {
      var ta = $('evq-in'); ta.value = (ta.value ? ta.value + '\n' : '') + t;
    }).catch(function () { $('evq-in').focus(); });
  });

  $('evq-clear').addEventListener('click', function () {
    queue = queue.filter(function (i) { return i.status === 'open' || i.status === 'error'; });
    persist(); renderList();
  });
  // Alles verwerfen (z. B. falsch hineinkopiert) – nur die Liste hier; schon angelegte Berichte bleiben auf der Website
  $('evq-clearall').addEventListener('click', function () {
    var open = queue.filter(function (i) { return i.status === 'open' || i.status === 'error'; }).length;
    if (!confirm('Alle ' + queue.length + ' Einträge aus der Liste entfernen?' + (open ? '\n' + open + ' davon sind noch nicht angelegt.' : '') + '\nSchon veröffentlichte Berichte bleiben auf der Website.')) return;
    queue = []; openId = null; persist(); renderList();
  });

  // ---- Einstellungen --------------------------------------------------------
  function showSettings(on) {
    $('evq-settings').classList.toggle('evq-hide', !on);
    $('evq-user').value = settings.user; $('evq-pass').value = settings.pass; $('evq-pub').checked = !!settings.publish;
    $('evq-pub').disabled = !CAN_PUB; if (!CAN_PUB) $('evq-pub').title = 'Dein Konto darf nur Entwürfe anlegen.';
  }
  function updateMode() {
    var how = settings.publish ? 'veröffentlicht direkt' : 'speichert Entwürfe';
    $('evq-mode').className = 'evq-mode' + (wp.nonce || settings.user ? ' on' : '');
    $('evq-mode').innerHTML = '<i></i>' + (wp.nonce
      ? 'Angemeldet über WordPress' + (wp.name ? ' als ' + esc(wp.name) : '') + ' · ' + how
      : settings.user ? esc(settings.user) + ' · ' + how
      : 'Nicht angemeldet – bitte in WordPress anmelden');
  }
  $('evq-gear').addEventListener('click', function () { showSettings($('evq-settings').classList.contains('evq-hide')); });
  // Anwendungspasswörter haben 24 Zeichen, nur Buchstaben und Ziffern (Leerzeichen sind egal)
  var APP_PASS_HELP = 'Das ist kein Anwendungspasswort. Bitte in WordPress unter Benutzer → (API-Benutzer) → ganz unten ' +
    '„Anwendungspasswörter“ ein neues erstellen. Es hat 24 Zeichen, nur Buchstaben und Ziffern, z. B. „abcd EFGH 1234 ijkl MNOP 5678“. ' +
    'Das normale Login-Passwort funktioniert hier nicht.';
  function isAppPass(p) { return /^[A-Za-z0-9]{24}$/.test(p.replace(/\s+/g, '')); }
  function loginError(r, j) {
    var code = j && j.code;
    if (code === 'incorrect_password') return 'Anwendungspasswort ist falsch oder wurde widerrufen.';
    if (code === 'invalid_username' || code === 'invalid_email') return 'Diesen Benutzernamen gibt es nicht.';
    if (code === 'rest_not_logged_in') return 'Die Zugangsdaten kommen beim Server nicht an (der Webhoster filtert sie vermutlich heraus). Bitte beim Hoster nachfragen, ob der „Authorization“-Header an WordPress weitergegeben wird.';
    if (r.status === 401) return 'Anmeldung fehlgeschlagen – Benutzername oder Anwendungspasswort falsch.';
    return (j && j.message) || 'Fehler ' + r.status;
  }
  function setMsg(cls, text) { $('evq-setmsg').innerHTML = '<div class="evq-msg ' + cls + '">' + esc(text) + '</div>'; }

  $('evq-save').addEventListener('click', function () {
    var pass = $('evq-pass').value;
    if (!wp.nonce || pass.trim()) { if (!isAppPass(pass)) { setMsg('err', APP_PASS_HELP); return; } }
    settings = { user: $('evq-user').value.trim(), pass: $('evq-pass').value.trim(), publish: CAN_PUB && $('evq-pub').checked };
    save('settings', settings); updateMode(); showSettings(false); renderList();
  });
  $('evq-test').addEventListener('click', function () {
    var u = $('evq-user').value.trim(), p = $('evq-pass').value.trim();
    if (!isAppPass(p)) { setMsg('err', APP_PASS_HELP); return; }
    setMsg('', 'Prüfe …');
    fetch(CFG.api + 'wp/v2/users/me?_fields=name', {
      credentials: 'omit', headers: { 'Authorization': 'Basic ' + btoa(unescape(encodeURIComponent(u + ':' + p.replace(/\s+/g, '')))) }
    }).then(function (r) { return r.json().then(function (j) { return [r, j]; }); }).then(function (x) {
      var r = x[0], j = x[1];
      if (!r.ok) throw new Error(loginError(r, j));
      setMsg('ok', 'Verbunden als ' + j.name + '. Jetzt „Speichern“ tippen.');
    }).catch(function (e) { setMsg('err', e.message); });
  });

  // ---- Start ----------------------------------------------------------------
  window.EVQ = { splitItem: splitItem, mergeItems: mergeItems, parse: parse, fmtKeyword: fmtKeyword, guessType: guessType, rfc3339: rfc3339 };
  updateMode();
  (wp.nonce ? Promise.resolve(wp.nonce) : fetchNonce()).then(function (n) {
    if (n) {
      if (!wp.name) fetch(CFG.api + 'wp/v2/users/me?_fields=name', authOpts()).then(function (r) { return r.ok ? r.json() : {}; })
        .then(function (j) { wp.name = j.name || ''; updateMode(); }).catch(function () {});
      $('evq-wpnote').classList.remove('evq-hide');
      $('evq-creds').classList.add('evq-hide');
    } else if (!settings.user) showSettings(true);
    updateMode();
  });
  // Fotos liegen nur im Arbeitsspeicher: nach dem Neuladen ist das Häkchen „enthält Bilder“ ohne Bild falsch
  queue.forEach(function (it) { if (it.imgAuto && !IMG[it.id]) { it.hasimages = false; it.imgAuto = false; it.imgLost = true; } });
  openId = nextOpen(null);
  renderList();
  if (U.length > 2) $('evq-parsemsg').innerHTML = '<div class="evq-msg warn">Die Schnellerfassung unterstützt zwei Einheiten (' + esc(U[0].label) + ', ' + esc(U[1].label) + '); weitere Einheiten werden hier nicht erkannt.</div>';
  loadLists();
  if (queue.length) checkExisting();
})();
