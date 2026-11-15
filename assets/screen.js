/* Wehrwerk – Dashboard im Besprechungsraum: lädt jede Minute neu, Uhr läuft sekundengenau, Beiträge wechseln, Seite lädt alle 6 Stunden komplett neu. */
(function () {
  'use strict';
  var APP = (window.MYFS && MYFS.app) || 'Wehrwerk';
  var ORG = (window.MYFS && MYFS.org) || 'Freiwillige Feuerwehr';
  var root = document.getElementById('scr');
  // In der Fahrzeughalle wird das Dashboard in die Hallenseite eingesetzt und bei einem Alarm wieder entfernt: Ziel-Element jedes Mal neu suchen
  function R() { if (!root || !root.isConnected) root = document.getElementById('scr'); return root; }
  var WD = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  var WDS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  var MON = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  var MONS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  var fastPoll = false;
  var data = null, failed = false, newsIdx = 0, noticePage = 0, statYear = null, statTouched = 0;
  var CATS = { brand: 'Brand', th: 'Hilfeleistung', vu: 'Verkehrsunfall', fehl: 'Fehlalarm', sonst: 'Sonstiges' };
  function ackd(id) { try { return localStorage.getItem('myf-ack-' + id) === '1'; } catch (e) { return false; } }
  var NLV = { info: 'Info', warn: 'Wichtig', alert: 'Achtung' };

  // Sonnenauf- und -untergang (Verfahren nach „SunCalc“, V. Agafonkin, BSD) – am Gerätehaus, Höhe −0,833°
  function sunTimes(date, lat, lng) {
    var rad = Math.PI / 180, dayMs = 864e5, J1970 = 2440588, J2000 = 2451545, e = rad * 23.4397;
    var lw = rad * -lng, phi = rad * lat, d = date.valueOf() / dayMs - 0.5 + J1970 - J2000;
    var n = Math.round(d - 0.0009 - lw / (2 * Math.PI)), ds = 0.0009 + lw / (2 * Math.PI) + n;
    var M = rad * (357.5291 + 0.98560028 * ds);
    var L = M + rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) + rad * 102.9372 + Math.PI;
    var dec = Math.asin(Math.sin(L) * Math.sin(e));
    var Jnoon = J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
    var w = Math.acos((Math.sin(rad * -0.833) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)));
    var Jset = J2000 + 0.0009 + (w + lw) / (2 * Math.PI) + n + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
    function fromJ(j) { return new Date((j + 0.5 - J1970) * dayMs); }
    return { rise: fromJ(Jnoon - (Jset - Jnoon)), set: fromJ(Jset) };
  }
  var sun = null;
  function applyTheme() {
    var mode = (data && data.theme) || MYFS.theme || 'auto', now = new Date();
    sun = sunTimes(now, MYFS.lat || 51.16, MYFS.lon || 10.45);
    var light = mode === 'light' || (mode === 'auto' && now >= sun.rise && now < sun.set);
    var cl = document.documentElement.classList; cl.remove('theme-light', 'theme-dark'); cl.add(light ? 'theme-light' : 'theme-dark'); // andere Klassen (Halle) bleiben
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function d(iso) { return new Date(iso.length === 10 ? iso + 'T12:00:00' : iso); }
  function dm(x) { return pad(x.getDate()) + '.' + pad(x.getMonth() + 1) + '.'; }
  function hm(x) { return pad(x.getHours()) + ':' + pad(x.getMinutes()); }
  function sameDay(a, b) { return a.toDateString() === b.toDateString(); }
  function dayLabel(x) {
    var now = new Date(), tom = new Date(now.getTime() + 864e5);
    return sameDay(x, now) ? 'Heute' : sameDay(x, tom) ? 'Morgen' : WDS[x.getDay()] + ' ' + dm(x);
  }
  function ago(x) {
    var days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(x).setHours(0, 0, 0, 0)) / 864e5);
    return days <= 0 ? 'heute' : days === 1 ? 'gestern' : 'vor ' + days + ' Tagen';
  }
  // „Einsatz 40/2026 Hilfe P-Tür“ → Nummer und Stichwort getrennt
  function splitTitle(t) {
    var m = /^(?:Einsatz\s+)?([A-Z]?\d{1,3}\/\d{4})\s*[-–:]?\s*(.*)$/.exec(t || '');
    return m ? { nr: m[1], text: m[2] || t } : { nr: '', text: t };
  }

  function qr(text) {
    try { var q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); }
    catch (e) { return ''; }
  }

  // Monatsbalken; est = geschätzte Einsätze ohne Datum (nur die Nummer ist bekannt) – oben schraffiert auf dem Balken
  function bars(by, current, est) {
    est = est || [];
    var now = current ? new Date().getMonth() : 12, tot = by.map(function (n, i) { return n + (est[i] || 0); }), max = Math.max.apply(null, tot.concat([1]));
    return '<div class="scr-bars">' + tot.map(function (n, i) {
      var cls = i === now ? ' now' : i > now ? ' future' : '', e = est[i] || 0;
      return '<div class="b' + cls + '"' + (e ? ' title="' + by[i] + ' mit Datum, ca. ' + e + ' geschätzt"' : '') + '><span>' + ((i <= now || !current) && n ? n : '') + '</span>' +
        '<i style="height:' + (n ? Math.max(6, n / max * 100) : 0) + '%">' + (e ? '<u style="height:' + Math.round(e / n * 100) + '%"></u>' : '') + '</i><em>' + MONS[i] + '</em></div>';
    }).join('') + '</div>' + (est.some(function (e) { return e > 0; }) ? '<div class="scr-est"><u></u>geschätzt – Einsätze, von denen nur die Nummer bekannt ist</div>' : '');
  }

  // Einsätze je Jahr. Verstecktes Bedienelement: „Einsätze 2026“ antippen → Jahre blättern (setzt sich nach X Minuten zurück)
  var touched = 0, yearMode = false;
  function statsHtml() {
    var st = data.stats || {}, ys = Object.keys(st).map(Number).sort(function (a, b) { return b - a; });
    if (!ys.length) return '';
    var y = statYear && st[statYear] ? statYear : ys[0], x = st[y], cur = y === ys[0], now = new Date();
    var months = cur ? now.getMonth() + 1 - (now.getDate() < 15 ? 0.5 : 0) : 12;
    var avg = x.total ? (x.total / Math.max(1, months)).toFixed(1).replace('.', ',') : '0';
    var last = cur && (data.last_incidents || [])[0] ? ago(new Date(data.last_incidents[0].date)) : '';
    var cats = Object.keys(CATS).filter(function (k) { return x.cats[k]; });
    var nav = yearMode && data.touch ? '<span class="scr-ynav"><button type="button" data-y="' + (y - 1) + '"' + (st[y - 1] ? '' : ' disabled') + ' aria-label="Vorjahr">‹ ' + (y - 1) + '</button>' +
      '<button type="button" data-y="' + (y + 1) + '"' + (st[y + 1] ? '' : ' disabled') + ' aria-label="Folgejahr">' + (y + 1) + ' ›</button></span>' : '';
    return '<div class="scr-card scr-stats' + (yearMode ? ' is-open' : '') + '"><div class="scr-label scr-yr"><button type="button" class="scr-ylabel" data-ytoggle="1">Einsätze ' + y + '</button>' + nav + '</div>' +
      '<div class="scr-kpi"><div class="scr-big">' + x.total + '</div><div class="scr-kpis"><b>' + (cur ? 'bisher in ' + y : 'im Jahr ' + y) + '</b>' +
      '<span>Ø ' + avg + ' pro Monat' + (last ? ' · zuletzt ' + last : '') + '</span>' + (x.manual ? '<span>von Hand nachgetragen</span>' : '') + '</div></div>' +
      // Einsätze ohne bekannte Art (nur die Nummer ist bekannt) stecken in „Sonstiges“; in den Monatsbalken geschätzt
      (cats.length ? '<div class="scr-cats">' + cats.map(function (k) { return '<span class="c-' + k + '"' + (k === 'sonst' && x.missing ? ' title="enthält ' + x.missing + ' Einsätze ohne nähere Angaben"' : '') + '><b>' + x.cats[k] + '</b>' + CATS[k] + '</span>'; }).join('') + '</div>' : '') +
      (x.manual ? '' : bars(x.months, cur, x.est)) + '</div>';
  }
  function poke() { touched = Date.now(); }
  document.addEventListener('click', function (e) {
    if (!data) return;
    var ackRow = e.target.closest('[data-ack]'), al = e.target.closest('.scr-alarm');
    if (ackRow) { try { localStorage.setItem('myf-ack-' + ackRow.getAttribute('data-ack'), '1'); } catch (x) {} render(); return; }
    if (al) { try { localStorage.setItem('myf-ack-' + al.getAttribute('data-id'), '1'); } catch (x) {} render(); return; }
    if (!data.touch) return;
    poke();
    if (e.target.closest('[data-ytoggle]')) { yearMode = !yearMode; if (!yearMode) statYear = null; render(); return; }
    var b = e.target.closest('[data-y]');
    if (b && !b.disabled) { statYear = +b.getAttribute('data-y'); render(); }
  });
  ['touchstart', 'wheel', 'pointerdown'].forEach(function (ev) { document.addEventListener(ev, poke, { passive: true }); });
  // Nach der eingestellten Zeit ohne Berührung: alles zurück auf den Ausgangszustand
  function resetView() {
    statYear = null; yearMode = false;
    render();
    var inc = document.getElementById('scr-inc'); if (inc) inc.scrollTop = 0;
  }
  setInterval(function () { if (data && touched && Date.now() - touched > (data.reset_min || 2) * 60000) { touched = 0; resetView(); } }, 10000);
  // Vollbild: kleiner Knopf, erscheint nur bei Mausbewegung (Fernbedienung/Maus), sonst unsichtbar
  var fsT = null;
  document.addEventListener('mousemove', function () {
    var b = document.querySelector('.scr-fs'); if (!b || document.fullscreenElement) return;
    b.classList.add('show'); clearTimeout(fsT); fsT = setTimeout(function () { b.classList.remove('show'); }, 2500);
  });
  document.addEventListener('click', function (e) {
    var tb = e.target.closest && e.target.closest('[data-trip]');
    if (tb && MYFS.inHall) { document.dispatchEvent(new CustomEvent('myf:trip', { detail: { vid: +tb.getAttribute('data-trip') } })); return; }
    if (MYFS.inHall && e.target.closest && e.target.closest('[data-pick]')) { document.dispatchEvent(new CustomEvent('myf:pick')); return; }
    if (!e.target.closest('.scr-fs')) return;
    var de = document.documentElement; if (document.fullscreenElement) document.exitFullscreen(); else if (de.requestFullscreen) de.requestFullscreen().catch(function () {});
  });
  document.addEventListener('fullscreenchange', function () { document.body.classList.toggle('is-fs', !!document.fullscreenElement); });

  function kmTxt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' km'; }
  function vehCardHtml() {
    var vs = data.vstatus || [];
    // Ohne FMS-Anbindung kein leeres „–“, sondern ein Statuspunkt (grün bereit, gelb unterwegs/eingeschränkt, rot außer Dienst)
    var noF = !vs.some(function (v) { return v.fms; });
    return '<div class="scr-card grow scr-vcard"><div class="scr-label scr-vlabel">Fahrzeuge</div><div class="scr-vlist scr-scroll' + (noF ? ' no-fms' : '') + '">' + (vs.length ? vs.map(function (v) {
      var st = v.out ? '<em class="bad">außer Dienst</em>' : v.away ? '<em class="away">unterwegs bis ' + hm(d(String(v.away.until).replace(' ', 'T'))) + ' Uhr' + (v.away.purpose ? ' · ' + esc(v.away.purpose) : '') + '</em>' :
        v.fms ? esc(v.text) + (v.at ? ' · seit ' + hm(d(String(v.at).replace(' ', 'T'))) + ' Uhr' : '') : v.limited ? '<em class="away">eingeschränkt einsatzbereit</em>' : 'einsatzbereit';
      return '<button type="button" class="scr-veh f' + esc(v.fms || 'x') + (v.out ? ' is-out' : v.away || v.limited ? ' is-away' : '') + '" data-trip="' + v.id + '"><b class="fms"' + (noF ? ' aria-hidden="true">' : '>' + esc(v.fms || '–')) + '</b>' +
        '<span class="nm">' + esc(v.name) + '<small>' + st + (v.last_trip && !v.fms && !v.out && !v.away ? ' · letzte Fahrt ' + dm(d(v.last_trip.date)) : '') + '</small></span>' + (v.km != null ? '<span class="km">' + kmTxt(v.km) + '</span>' : '') + '</button>';
    }).join('') : '<div class="scr-empty">Keine Fahrzeuge angelegt.</div>') + '</div></div>';
  }

  function newsHtml() {
    var list = data.news_list || (data.news ? [data.news] : []);
    if (!list.length) return '<div class="scr-empty">Noch keine Beiträge.</div>';
    var n = list[newsIdx % list.length], nd = d(n.date);
    return '<div class="scr-newsbody">' + (n.image ? '<img src="' + esc(n.image) + '" alt="">' : '') +
      '<div class="txt"><div class="scr-h">' + esc(n.title) + '</div><div class="scr-sub">' + dm(nd) + nd.getFullYear() + '</div>' +
      (n.excerpt ? '<p>' + esc(n.excerpt) + '</p>' : '') + '</div></div>' +
      (list.length > 1 ? '<div class="scr-dots">' + list.map(function (x, i) { return '<i' + (i === newsIdx % list.length ? ' class="on"' : '') + '></i>'; }).join('') + '</div>' : '');
  }

  // Wetter (Symbol + Temperatur + Wind) zwischen Logo und Uhr
  // Wetter-Symbole als schlichte Linien (passen zu hell/dunkel, keine bunten Emojis)
  var SV = function (p) { return '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; };
  var CLOUD = '<path d="M14 36h20a8 8 0 0 0 0-16 11 11 0 0 0-21-2A9 9 0 0 0 14 36z"/>';
  var WICON = {
    'clear-day': SV('<circle cx="24" cy="24" r="8"/><path d="M24 6v5M24 37v5M6 24h5M37 24h5M11 11l3.5 3.5M33.5 33.5L37 37M11 37l3.5-3.5M33.5 14.5L37 11"/>'),
    'clear-night': SV('<path d="M32 30A13 13 0 0 1 20 12a13 13 0 1 0 12 18z"/>'),
    'partly-cloudy-day': SV('<path d="M17 13a8 8 0 0 1 12 4M17 6v3M8 13h3M10 7l2 2"/>' + CLOUD), 'partly-cloudy-night': SV(CLOUD), cloudy: SV(CLOUD),
    fog: SV('<path d="M8 18h32M6 26h36M10 34h28"/>'), wind: SV('<path d="M6 18h24a5 5 0 1 0-5-5M6 26h32a5 5 0 1 1-5 5M6 34h14"/>'),
    rain: SV(CLOUD.replace('36h20', '30h20').replace('0 0 14 36z', '0 0 14 30z') + '<path d="M17 36l-2 5M25 36l-2 5M33 36l-2 5"/>'),
    sleet: SV(CLOUD + '<path d="M18 41h.01M26 41h.01M34 41h.01"/>'), snow: SV(CLOUD + '<path d="M18 41h.01M26 41h.01M34 41h.01"/>'), hail: SV(CLOUD + '<path d="M18 41h.01M26 41h.01"/>'),
    thunderstorm: SV(CLOUD + '<path d="M25 30l-4 7h6l-4 7"/>')
  };
  var WCOND = { dry: 'trocken', fog: 'Nebel', rain: 'Regen', sleet: 'Schneeregen', snow: 'Schnee', hail: 'Hagel', thunderstorm: 'Gewitter' };
  function weatherHtml() {
    var w = data.weather;
    if (!w || w.temp == null) return '';
    var strong = w.gust && w.gust >= 60;
    return '<div class="scr-weather"><span class="ic">' + (WICON[w.icon] || WICON.cloudy) + '</span><b>' + w.temp + '°</b><span class="txt"><span>' + esc(WCOND[w.condition] || 'Wetter') + '</span>' +
      (w.wind != null ? '<span' + (strong ? ' class="strong"' : '') + '>Wind ' + w.wind + (w.gust ? ', Böen ' + w.gust : '') + ' km/h</span>' : '') + '</span></div>';
  }
  var SEV = { 1: 'sev1', 2: 'sev2', 3: 'sev3', 4: 'sev4' };
  function warningsHtml() {
    var ws = data.warnings || [];
    return ws.map(function (w) {
      var per = (w.periods && w.periods.length ? w.periods : [{ from: w.onset, to: w.expires }]).filter(function (p) { return p.to; });
      var times = per.map(function (p) { var f = p.from ? new Date(p.from) : null, t = new Date(p.to); return (f && f > new Date() ? dayLabel(f) + ' ' + hm(f) + '–' : 'bis ') + (f && sameDay(f, t) ? '' : dayLabel(t) + ' ') + hm(t); });
      return '<div class="scr-notice scr-warn ' + SEV[w.severity] + '"><b>' + esc(w.provider === 'DWD' ? 'Wetter' : (w.provider || 'Warnung')) + '</b><span>' + esc(w.headline.replace(/^Amtliche\s+/i, '')) +
        (times.length ? '<small>' + esc(times.slice(0, 4).join(' · ')) + (times.length > 4 ? ' …' : '') + ' Uhr</small>' : '') + '</span></div>';
    }).join('');
  }
  function noticesHtml() {
    var n = data.notices || [];
    var ws = warningsHtml();
    if (ws) return '<div class="scr-notices n' + Math.min(3, (data.warnings || []).length + Math.min(n.length, 3 - Math.min(3, (data.warnings || []).length))) + '">' + ws +
      n.slice(0, Math.max(0, 3 - (data.warnings || []).length)).map(function (x) { return '<div class="scr-notice lv-' + x.level + '"><b>' + NLV[x.level] + '</b><span>' + esc(x.text) + (x.signature ? '<em class="sig">— ' + esc(x.signature) + '</em>' : '') + '</span></div>'; }).join('') + '</div>';
    if (!n.length) return '';
    var pages = Math.ceil(n.length / 3), p = noticePage % pages, part = n.slice(p * 3, p * 3 + 3);
    return '<div class="scr-notices n' + part.length + '">' + part.map(function (x) {
      var until = x.ends ? d(x.ends.replace(' ', 'T')) : null;
      return '<div class="scr-notice lv-' + x.level + '"><b>' + NLV[x.level] + '</b><span>' + esc(x.text) + (x.signature ? '<em class="sig">— ' + esc(x.signature) + '</em>' : '') +
        (until ? '<small>bis ' + dayLabel(until) + (hm(until) !== '23:59' && hm(until) !== '00:00' ? ', ' + hm(until) + ' Uhr' : '') + '</small>' : '') + '</span></div>';
    }).join('') + (pages > 1 ? '<div class="scr-npage">' + (p + 1) + '/' + pages + '</div>' : '') + '</div>';
  }

  function render() {
    if (!data) return;
    // Während jemand am Bildschirm scrollt: Position beim Neuladen behalten
    var keepScroll = {};
    ['scr-events', 'scr-inc'].forEach(function (id) { var el = document.getElementById(id); if (el && touched) keepScroll[id] = el.scrollTop; });
    if (!R()) return;
    var now = new Date(), h = '';
    h += '<div class="scr-head"><div class="scr-brand"><img class="scr-logo for-dark" src="' + esc(MYFS.logoDark) + '" alt="' + esc(ORG) + '">' +
      '<img class="scr-logo for-light" src="' + esc(MYFS.logoLight) + '" alt="' + esc(ORG) + '"></div>' +
      '<div class="scr-headr">' + weatherHtml() + '<div class="scr-clock"><b id="scr-time">' + hm(now) + '</b><span id="scr-date">' + WD[now.getDay()] + ', ' + now.getDate() + '. ' + MON[now.getMonth()] + ' ' + now.getFullYear() + '</span></div></div></div>' +
      (MYFS.inHall ? '' : '<button type="button" class="scr-fs" aria-label="Vollbild">Vollbild</button>');

    // Laufender Einsatz: rotes Band über allem – blinkt, bis jemand darauf tippt
    // Mehrere gleichzeitig (Unwetter, Paralleleinsätze): der neueste groß, die anderen als Zeilen darunter – jeder einzeln „gesehen“
    var als = data.alarms || (data.alarm ? [data.alarm] : []), al = als[0], alH = '';
    if (al) {
      var at = new Date(al.start), mins = Math.max(0, Math.round((now - at) / 60000)), seen = ackd(al.id), rest = als.slice(1), multi = rest.length > 0;
      var nReal = als.filter(function (x) { return !x.test; }).length, nTest = als.length - nReal;
      var lbl = !nReal ? (nTest > 1 ? nTest + ' Testalarme' : 'Testalarm') : multi ? (nReal === 1 ? '1 laufender Einsatz' : nReal + ' laufende Einsätze') + (nTest ? ' · ' + nTest + ' Test' : '') : 'Laufender Einsatz';
      // Karte zur Einsatzstelle, wenn die Alarmierung Koordinaten mitliefert (statt des früheren QR-Codes)
      var mapH = al.lat != null && al.lng != null && window.MYFMap ? MYFMap(al.lat, al.lng, { z: 15, station: { lat: MYFS.lat, lon: MYFS.lon }, size: 'clamp(220px, 17vw, 380px)' }) : '';
      alH = '<div class="scr-alarm' + (al.test ? ' test' : '') + (seen ? ' seen' : '') + (multi ? ' multi' : '') + '" data-id="' + al.id + '" role="button" title="Antippen: gesehen">' +
        '<div class="lbl">' + lbl + '<small>' + (seen ? 'Alarm ' + hm(at) + ' Uhr · vor ' + mins + ' Min.' : 'antippen, wenn gesehen') + '</small></div>' +
        '<div class="kw">' + esc(al.title.replace(/^TESTALARM:\s*/, '')) + '</div>' + (al.update ? '<div class="up">' + esc(al.update.k) + ' ' + esc(al.update.t) + ' Uhr</div>' : '') + (al.place ? '<div class="pl">' + esc(al.place) + '</div>' : '') +
        (mapH ? '<div class="map">' + mapH + '</div>' : '');
      if (multi) {
        var show = rest.slice(0, 4);
        alH += '<div class="scr-alist">' + show.map(function (x) {
          var xt = new Date(x.start), xm = Math.max(0, Math.round((now - xt) / 60000)), xs = ackd(x.id);
          return '<div class="row' + (xs ? '' : ' is-new') + '" data-ack="' + x.id + '" title="Antippen: gesehen"><span class="t">' + hm(xt) + '</span><span class="k">' + (x.test ? '<i class="tst">TEST</i> ' : '') + esc(x.title.replace(/^TESTALARM:\s*/, '')) +
            (x.update ? ' <em>' + esc(x.update.k) + ' ' + esc(x.update.t) + '</em>' : '') + (x.place ? '<small>' + esc(x.place) + '</small>' : '') + '</span><span class="m">' + (xs ? 'vor ' + xm + ' Min.' : 'neu') + '</span></div>';
        }).join('') + (rest.length > 4 ? '<div class="row more">und ' + (rest.length - 4) + ' weitere</div>' : '') + '</div>';
      }
      alH += '</div>';
    }

    var ev = data.events || [], cs = data.courses || [], dr = data.next_drill;
    h += '<div class="scr-main' + (alH ? ' has-alarm' : '') + '">' + alH + '<div class="scr-cols"><div class="scr-col">' + statsHtml();
    var li = data.last_incidents || [];
    if (li.length) {
      h += '<div class="scr-card grow"><div class="scr-label">Letzte Einsätze</div><div class="scr-list scr-scroll" id="scr-inc">' + li.map(function (x, i) {
        var t = splitTitle(x.title), xd = d(x.date);
        return '<div class="scr-item' + (i === 0 ? ' first' : '') + '"><div class="scr-when">' + dm(xd) + '<small>' + hm(xd) + ' Uhr</small></div>' +
          '<div class="scr-what">' + (t.nr ? '<span class="nr">' + esc(t.nr) + '</span>' : '') + esc(t.text) +
          '<small>' + esc([x.type, i === 0 ? ago(xd) : ''].filter(Boolean).join(' · ')) + '</small></div></div>';
      }).join('') + '</div></div>';
    }
    h += '</div><div class="scr-col">';
    // In der Fahrzeughalle statt Terminen: die Fahrzeuge der Einheit – Status, km-Stand, antippen = Fahrt eintragen
    if (MYFS.inHall) h += vehCardHtml();
    // Nächster Dienst (Dienstplan) + Termine + Lehrgänge
    else {
    if (dr) {
      var dd = d(dr.date);
      h += '<div class="scr-card scr-drill"><div class="scr-label">Nächster Dienst</div><div class="scr-item today-ish"><div class="scr-when">' + dayLabel(dd) + (dr.time ? '<small>' + esc(dr.time) + ' Uhr</small>' : '') + '</div>' +
        '<div class="scr-what"><b>' + esc(dr.title) + '</b>' + (dr.lead ? '<small>' + esc(dr.lead) + '</small>' : '') + '</div></div></div>';
    }
    if (data.agt_next && !ev.some(function (e) { return /strecke/i.test(e.title) && sameDay(d(e.start), d(data.agt_next.date)); })) {
      ev = ev.concat([{ start: data.agt_next.date, end: data.agt_next.date, allday: true, title: 'Atemschutz-Übungsstrecke', location: data.agt_next.people + ' AGT eingeteilt' }])
        .sort(function (a, b) { return a.start < b.start ? -1 : 1; });
    }
    if (ev.length) {
      h += '<div class="scr-card grow"><div class="scr-label">Nächste Termine</div><div class="scr-list scr-scroll" id="scr-events">';
      ev.forEach(function (e) {
        var s0 = d(e.start), en = d(e.end), today = sameDay(s0, now);
        var when = e.allday ? (sameDay(s0, en) ? 'ganztägig' : 'bis ' + dm(en)) : hm(s0) + (sameDay(s0, en) && hm(en) !== hm(s0) ? '–' + hm(en) : ' Uhr');
        h += '<div class="scr-item' + (today ? ' today' : '') + (e.past ? ' past' : '') + '"><div class="scr-when">' + (today ? '<span class="scr-today">' + dayLabel(s0) + '</span>' : dayLabel(s0)) + '<small>' + when + '</small></div><div class="scr-what">' + esc(e.title) +
          (e.location ? '<small>' + esc(e.location) + '</small>' : '') + '</div></div>';
      });
      h += '</div></div>';
    }
    if (cs.length) {
      h += '<div class="scr-card' + (ev.length ? '' : ' grow') + '"><div class="scr-label">Nächste Lehrgänge</div><div class="scr-list">' + cs.map(function (c) {
        var s0 = d(c.start), e = d(c.end || c.start);
        return '<div class="scr-item"><div class="scr-when">' + dm(s0) + (sameDay(s0, e) ? '' : '<small>bis ' + dm(e) + '</small>') + '</div>' +
          '<div class="scr-what">' + esc(c.title) + '<small>' + esc([c.location, c.people ? c.people + (c.people === 1 ? ' Teilnehmer/in' : ' Teilnehmende') : ''].filter(Boolean).join(' · ')) + '</small></div></div>';
      }).join('') + '</div></div>';
    }
    if (!dr && !ev.length && !cs.length) h += '<div class="scr-card grow"><div class="scr-label">Termine</div><div class="scr-empty">Keine Termine eingetragen.</div></div>';
    }
    h += '</div>';
    // Neues von der Website (wechselt)
    h += '<div class="scr-col"><div class="scr-card grow scr-news"><div class="scr-label">Neu auf ' + esc(data.website || 'der Website') + '</div><div id="scr-news">' + newsHtml() + '</div></div></div></div></div>';

    // Hinweise + amtliche Warnungen
    // Unten: links Hinweise, Statuszeile, Fahrzeuge – rechts daneben der QR-Code über die ganze Höhe
    h += '<div class="scr-bottom"><div class="scr-foot"><div class="scr-fl"><div id="scr-notices">' + noticesHtml() + '</div>';
    // Halle: beide Tätigkeiten nebeneinander in der Statuszeile – Anwesenheit (Alarm kam nicht an / nachtragen) und Fahrt
    var oos = data.out_of_service || [], trip = MYFS.inHall ? '<span class="scr-acts"><button type="button" class="scr-tripbtn is-pick" data-pick="1">Anwesenheit eintragen <b>→</b></button>' +
      '<button type="button" class="scr-tripbtn" data-trip="0">Fahrt eintragen <b>→</b></button></span>' : '';
    // Besprechungsraum (optional, Einstellungen): Fahrzeugstatus aus der Alarmierung und der Weg zur Anwesenheitsliste – in derselben Zeile
    if (!MYFS.inHall) {
      var fmsIn = (data.vstatus || []).map(function (v) { return '<span class="f' + esc(v.fms) + '" title="' + esc(v.text) + '"><b>' + esc(v.fms) + '</b>' + esc(v.name) + '</span>'; }).join('');
      var hallBtn = data.hall_url && data.touch ? '<a class="scr-tripbtn is-pick" href="' + esc(data.hall_url + '&von=dashboard') + '">Anwesenheit eintragen <b>→</b></a>' : '';
      if (fmsIn || hallBtn) trip = '<span class="scr-acts">' + (fmsIn ? '<span class="scr-fmsin">' + fmsIn + '</span>' : '') + hallBtn + '</span>';
    }
    // Fahrzeuge mit Status 6 (nicht einsatzbereit) aus der Alarmierung zählen wie „außer Dienst“ – sonst stünde „Alle einsatzbereit“ daneben
    var fmsAll = data.fms_list || data.vstatus || [];
    var s6 = fmsAll.filter(function (v) { return v.fms === '6' && !oos.some(function (o) { return o.object === v.name; }); });
    // Status 3/4/7/8 aus der Alarmierung: Fahrzeug ist im Einsatz – also gerade nicht einsatzbereit
    // Status 3/4 seit über 6 Stunden ohne neuen Status = unklar, zählt nicht als „im Einsatz“
    var staleV = fmsAll.filter(function (v) { return ['3', '4', '7', '8'].indexOf(String(v.fms)) >= 0 && v.at && (now - new Date(String(v.at).replace(' ', 'T'))) > 6 * 3600000; });
    var busyV = fmsAll.filter(function (v) { return ['3', '4', '7', '8'].indexOf(String(v.fms)) >= 0 && staleV.indexOf(v) < 0; });
    if (!oos.length && !s6.length && busyV.length) {
      h += '<div class="scr-alert is-busy"><b>' + busyV.length + (busyV.length === 1 ? ' Fahrzeug im Einsatz' : ' Fahrzeuge im Einsatz') + '</b><span>' + busyV.map(function (v) { return esc(v.name) + ' (Status ' + esc(v.fms) + ')'; }).join(' · ') +
        (busyV.length < fmsAll.length ? ' &nbsp;·&nbsp; übrige einsatzbereit' : '') + '</span>' + trip + '</div>';
    } else if (oos.length || s6.length) {
      if (!oos.length) h += '<div class="scr-alert is-red"><b>Nicht einsatzbereit</b><span>' + s6.map(function (v) { return esc(v.name) + ' (Status 6)'; }).join(' · ') + '</span>' + trip + '</div>';
      else h += '<div class="scr-alert is-red"><b>Außer Dienst</b><span>' + oos.map(function (o) { return esc(o.object) + (o.title ? ' – ' + esc(o.title) : ''); }).concat(s6.map(function (v) { return esc(v.name) + ' (Status 6)'; })).join(' · ') + '</span>' + trip + '</div>';
    } else {
      var parts = [];
      if (data.open_defects) parts.push(data.open_defects + (data.open_defects === 1 ? ' Mangel' : ' Mängel') + ' in Bearbeitung');
      (data.bookings_now || []).forEach(function (b) { parts.push(esc(b.vehicle) + ' unterwegs'); });
      if (data.note) parts.push(esc(data.note));
      // „tagsüber erreichbar“ steht bewusst nicht mehr auf dem Bildschirm (nur in der Verwaltung)
      staleV.forEach(function (v) { parts.push(esc(v.name) + ': Status unklar (seit ' + hm(d(String(v.at).replace(' ', 'T'))) + ' Uhr Status ' + esc(v.fms) + ')'); });
      h += '<div class="scr-alert is-ok"><b><i></i>Alle Fahrzeuge einsatzbereit</b>' + (parts.length ? '<span>' + parts.join(' &nbsp;·&nbsp; ') + '</span>' : '') + trip + '</div>';
    }
    // Fahrzeugstatus aus der Alarmierung (FMS) und – nach einem Einsatz – der Weg zur Anwesenheitsliste
    // In der Fahrzeughalle: Fahrzeuge antippen → Fahrt ins Fahrtenbuch (die Halle öffnet das Formular)
    // (Fahrzeugstatus und Anwesenheits-Knopf stehen in der Statuszeile, siehe oben)
    h += '</div><div class="scr-qr"><div class="code">' + qr(data.portal) + '</div><div><b>' + esc(data.qr_label || MYFS.qrLabel || 'Meine Feuerwehr') + '</b><span>Scannen: Einsätze, Dienste,<br>Lehrgänge, Mängel melden</span></div></div></div>' +
      '<div class="scr-credits">' + esc((data.credits || []).join(' · ')) + (data.legal || []).map(function (l) { return ' · <a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label) + '</a>'; }).join('') + '</div></div>';
    h += '<div class="scr-stale' + (failed ? ' on' : '') + '" title="Keine Verbindung – zeige letzte Daten"></div>';
    root.innerHTML = h;
    fitLists();
    Object.keys(keepScroll).forEach(function (id) { var el = document.getElementById(id); if (el) el.scrollTop = keepScroll[id]; });
  }

  // Einträge, die nicht mehr ganz in ihre Karte passen, ausblenden statt abzuschneiden
  function fitLists() {
    var evs = document.getElementById('scr-events');
    if (evs) { var first = evs.querySelector('.scr-item:not(.past)'); if (first && !touched) evs.scrollTop = first.offsetTop - evs.offsetTop; }
    [].forEach.call(document.querySelectorAll('.scr-card.grow .scr-list:not(.scr-scroll)'), function (l) {
      var items = l.querySelectorAll('.scr-item');
      [].forEach.call(items, function (i) { i.style.display = ''; });
      var c = l.closest('.scr-card'), max = c.getBoundingClientRect().bottom - parseFloat(getComputedStyle(c).paddingBottom) + 1;
      [].forEach.call(items, function (i, n) { if (n > 0 && i.getBoundingClientRect().bottom > max) i.style.display = 'none'; });
    });
  }
  window.addEventListener('resize', fitLists);

  // Neu laden nur, wenn die Seite gerade erreichbar ist (nicht mitten in Wartung/Update) – sonst in einer Minute wieder versuchen,
  // damit ein Dashboard nie auf einer Fehler- oder Wartungsseite stehen bleibt
  var reloading = false;
  function safeReload() {
    if (reloading) return; reloading = true;
    var later = function () { setTimeout(function () { reloading = false; safeReload(); }, 60000); };
    fetch(location.href, { cache: 'no-store', credentials: 'same-origin' }).then(function (r) { if (r.ok) location.reload(); else later(); }, later);
  }
  function load() {
    fetch(MYFS.api + '?key=' + encodeURIComponent(MYFS.key) + (MYFS.inHall ? '&in=hall' : ''), { credentials: 'omit', cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) { if (j.ver && MYFS.ver && j.ver !== MYFS.ver) { safeReload(); return; } data = j; failed = false;
        /* Demo: Szenario-Schritte zügig zeigen */ if (j.demo && !fastPoll) { fastPoll = true; setInterval(load, 15000); } try { localStorage.setItem('myf-screen', JSON.stringify(j)); } catch (e) {} applyTheme(); render(); })
      .catch(function () {
        failed = true;
        if (!data) { try { data = JSON.parse(localStorage.getItem('myf-screen') || 'null'); } catch (e) { data = null; } }
        if (data) { applyTheme(); render(); } else if (R()) root.innerHTML = '<div class="scr-loading">Dashboard nicht erreichbar</div>';
      });
  }

  // Uhr jede Sekunde, ohne alles neu zu zeichnen
  setInterval(function () {
    var t = document.getElementById('scr-time'), now = new Date();
    if (t) t.textContent = hm(now);
    var dt = document.getElementById('scr-date');
    if (dt) dt.textContent = WD[now.getDay()] + ', ' + now.getDate() + '. ' + MON[now.getMonth()] + ' ' + now.getFullYear();
  }, 1000);
  // Beiträge alle 20 Sekunden wechseln (sanft überblenden)
  setInterval(function () {
    var box = document.getElementById('scr-news');
    if (!data || !box || (data.news_list || []).length < 2) return;
    box.classList.add('out');
    setTimeout(function () { newsIdx++; box.innerHTML = newsHtml(); box.classList.remove('out'); }, 600);
  }, 20000);
  setInterval(applyTheme, 60 * 1000);
  // Mehr als 3 Hinweise: alle 12 Sekunden weiterblättern
  setInterval(function () {
    var box = document.getElementById('scr-notices');
    if (!data || !box || (data.notices || []).length <= 3) return;
    noticePage++; box.innerHTML = noticesHtml();
  }, 12000);
  setInterval(load, 60 * 1000); // jede Minute – damit ein Alarm schnell erscheint
  setTimeout(safeReload, 6 * 3600 * 1000);
  // Halle: erst starten, wenn die Hallenseite das Dashboard einsetzt (und nach jedem Alarm wieder)
  window.MYFScreen = { mount: function () { root = document.getElementById('scr'); if (!root) return; applyTheme(); if (data) render(); else load(); }, refresh: load };
  if (!MYFS.inHall || R()) { applyTheme(); load(); }
})();
