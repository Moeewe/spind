/* Wehrwerk – Hallen-Dashboard (Tablet/Bildschirm mit Touch in der Fahrzeughalle).
   Nach dem Einsatz: die Anwesenheitsliste – so schnell wie der Zettel: alle Namen auf einen Blick, antippen, Fahrzeug, fertig.
   Zwei Wege: „Nach Person“ (jeder trägt sich selbst ein) oder „Nach Fahrzeug“ (einer trägt die ganze Besatzung ein).
   Funktion (EL, ZF, GF, MA, AGT) optional mit einem Tipp. Sonst: Fahrzeugstatus, Einsätze, Fahrzeugbuchungen – keine Termine.
   Kein Login: der Gerätelink ist der Schlüssel. Es werden nur Namen und Einsatz-Stichworte gezeigt. */
(function () {
  'use strict';
  var C = window.MYFH, root = document.getElementById('hall');
  var d = null, st = { inc: null, mode: 'sheet', unitF: '', veh: null, q: '', sheet: null, roles: [], km: '', driver: null, busy: false }, idle = null, toastT = null;
  // Vom Dashboard im Besprechungsraum aufgerufen: Knopf zurück und nach 90 s ohne Bedienung von selbst zurück
  var fromScreen = /[?&]von=dashboard/.test(location.search), backT = null;
  function backLater() { if (!fromScreen) return; clearTimeout(backT); backT = setTimeout(function () { history.back(); }, 90000); }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9äöüß]/g, ''); }
  function hm(iso) { return iso ? String(iso).replace(' ', 'T').slice(11, 16) : ''; }
  function dmy(iso) { var p = String(iso || '').slice(0, 10).split('-'); return p.length === 3 ? p[2] + '.' + p[1] + '.' : ''; }
  function fmtKm(n) { return n == null ? '–' : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function roleList(r) { return String(r || '').split(',').filter(Boolean); }

  function api(path, body) {
    // REST-URL kann „/wp-json/…“ oder „?rest_route=/…“ sein
    var base = /rest_route=/.test(C.api) ? C.api.replace(/(rest_route=[^&]*)/, '$1' + path) : C.api + path;
    var url = base + (body ? '' : (base.indexOf('?') < 0 ? '?' : '&') + 'key=' + encodeURIComponent(C.key) + (st.force ? '&inc=' + st.force : '') + '&_=' + Date.now());
    return fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ key: C.key }, body)) } : { cache: 'no-store' })
      .catch(function (e) { var x = new Error('Keine Verbindung'); x.net = true; throw x; })
      .then(function (r) { return r.json().then(function (j) {
        // Wartung/Update (503, Schnittstelle kurz weg): wie „kein Netz“ – der Eintrag bleibt auf dem Gerät und wird nachgeliefert
        if (!r.ok && (r.status >= 502 || j.code === 'maintenance' || j.code === 'rest_no_route')) { var y = new Error('Website wird gerade aktualisiert'); y.net = true; throw y; }
        if (!r.ok) throw new Error(j.message || 'Fehler ' + r.status); return j; }, function () { var x = new Error('Keine Verbindung'); x.net = true; throw x; }); });
  }
  // Warteschlange: ohne Netz (Internet weg, WLAN hängt) bleibt der Eintrag auf dem Gerät und wird nachgeliefert –
  // in der Reihenfolge, in der getippt wurde. Nichts geht verloren, die Liste zeigt ihn sofort.
  function qGet() { try { return JSON.parse(localStorage.getItem('myf-hall-q') || '[]'); } catch (e) { return []; } }
  function qSet(q) { try { localStorage.setItem('myf-hall-q', JSON.stringify(q)); } catch (e) {} }
  function post(path, body) {
    if (qGet().length) { var q0 = qGet(); q0.push({ path: path, body: body, at: Date.now() }); qSet(q0); return Promise.resolve({ queued: true }); }
    return api(path, body).catch(function (e) {
      if (!e.net) throw e;
      var q = qGet(); q.push({ path: path, body: body, at: Date.now() }); qSet(q); st.offline = true;
      return { queued: true };
    });
  }
  var flushing = false;
  function flush() {
    var q = qGet(); if (!q.length || flushing) return;
    flushing = true;
    api(q[0].path, q[0].body).then(function () { q.shift(); qSet(q); flushing = false; if (q.length) flush(); else { toast('ok', '✓ Alle gespeicherten Einträge übertragen'); load(); } },
      function (e) { flushing = false; if (!e.net) { q.shift(); qSet(q); toast('err', 'Ein Eintrag wurde abgelehnt: ' + e.message); if (q.length) flush(); } });
  }
  setInterval(flush, 15000); window.addEventListener('online', flush);
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
  // Tag/Nacht: wie im Besprechungsraum – „auto“ = hell zwischen Sonnenauf- und -untergang am Gerätehaus
  function applyTheme() {
    var mode = C.theme || 'auto', now = new Date(), s = sunTimes(now, C.lat || 51.16, C.lon || 10.45);
    var light = mode === 'light' || (mode === 'auto' && now >= s.rise && now < s.set);
    document.documentElement.classList.toggle('theme-dark', !light);
  }
  applyTheme(); setInterval(applyTheme, 5 * 60000);
  // Bildschirm des Hallen-Tablets nicht abschalten (Wake Lock), nach dem Zurückholen erneut anfordern
  var wl = null;
  function wake() { try { if (navigator.wakeLock && document.visibilityState === 'visible' && !wl) navigator.wakeLock.request('screen').then(function (l) { wl = l; l.addEventListener('release', function () { wl = null; }); }).catch(function () {}); } catch (e) {} }
  document.addEventListener('visibilitychange', wake);
  document.addEventListener('fullscreenchange', function () { if (d && !st.sheet) render(); }); document.addEventListener('click', wake, { once: true }); wake();
  // Alle 6 Stunden frisch laden (lange Laufzeit am Tablet) – aber nie mitten im Eintragen
  setTimeout(function re() { if (st.sheet || st.q) return setTimeout(re, 60000); safeReload(); }, 6 * 3600 * 1000);
  // Neu laden nur, wenn die Seite gerade erreichbar ist (nicht mitten in Wartung/Update) – sonst in einer Minute wieder versuchen,
  // damit ein Dashboard nie auf einer Fehler- oder Wartungsseite stehen bleibt
  var reloading = false;
  function safeReload() {
    if (reloading) return; reloading = true;
    var later = function () { setTimeout(function () { reloading = false; safeReload(); }, 60000); };
    fetch(location.href, { cache: 'no-store', credentials: 'same-origin' }).then(function (r) { if (r.ok) location.reload(); else later(); }, later);
  }
  function load() {
    return api('').then(function (j) {
      if (j.ver && C.ver && j.ver !== C.ver && !st.sheet) { safeReload(); return; } // Update eingespielt → neu laden
      d = j; st.offline = false; try { localStorage.setItem('myf-hall', JSON.stringify(j)); } catch (e) {}
      qGet().forEach(function (x) { if (x.path !== '/part') return; var b = x.body; d.parts = d.parts.filter(function (p) { return !(p.incident_id === b.incident_id && p.member_id === b.member_id); });
        if (!b.remove) d.parts.push({ incident_id: b.incident_id, member_id: b.member_id, vehicle: b.vehicle, role: b.role || '', confirmed: false, t_start: b.t_start || '', t_end: b.t_end || '', as_minutes: 0 }); });
      if (qGet().length) setTimeout(flush, 500);
      if (!d.incidents.some(function (i) { return i.id === st.inc; })) { st.inc = d.incidents.length ? d.incidents[0].id : null; st.veh = null; }
      if (!st.sheet) render();
    }).catch(function (e) {
      // Ohne Netz: letzten Stand zeigen (wie im Besprechungsraum), mit Hinweis
      st.offline = true;
      if (!d) { try { d = JSON.parse(localStorage.getItem('myf-hall') || 'null'); } catch (x) { d = null; } }
      if (d) { if (!st.sheet) render(); } else root.innerHTML = '<div class="h-loading">' + esc(e.message) + '</div>';
    });
  }
  function toast(type, text) {
    var t = document.querySelector('.h-toast'); if (t) t.remove();
    document.body.insertAdjacentHTML('beforeend', '<div class="h-toast ' + type + '" role="status">' + esc(text) + '</div>');
    clearTimeout(toastT); toastT = setTimeout(function () { var x = document.querySelector('.h-toast'); if (x) x.remove(); }, 3200);
  }
  // Nach 60 Sekunden ohne Bedienung: zurück zur Liste „Nach Person“ (nächste Person fängt sauber an)
  var forceT = null;
  function poke() {
    clearTimeout(idle); idle = setTimeout(function () { st.q = ''; st.sheet = null; st.mode = 'sheet'; st.veh = null; render(); }, 60000);
    clearTimeout(forceT); if (st.force) forceT = setTimeout(function () { st.force = null; st.inc = null; load(); }, 15 * 60000);
  }

  function inc() { return d.incidents.filter(function (i) { return i.id === st.inc; })[0]; }
  // Plausibilität der Funktionen (ein EL, ein ZF, je Fahrzeug ein GF und ein MA) – Hinweis, kein Zwang
  function roleHints() {
    var byVeh = {}, zf = [], el = [], out = [], extra = d.part_extra || [];
    d.parts.filter(function (p) { return p.incident_id === st.inc; }).forEach(function (p) {
      var r = roleList(p.role), nm = (member(p.member_id) || { name: '?' }).name;
      if (r.indexOf('ZF') >= 0) zf.push(nm); if (r.indexOf('EL') >= 0) el.push(nm);
      if (p.vehicle && extra.indexOf(p.vehicle) < 0) { var b = byVeh[p.vehicle] = byVeh[p.vehicle] || { GF: [], MA: [] }; if (r.indexOf('GF') >= 0) b.GF.push(nm); if (r.indexOf('MA') >= 0) b.MA.push(nm); }
    });
    if (el.length > 1) out.push(el.length + ' Einsatzleiter (' + el.join(', ') + ') – es gibt nur einen');
    if (zf.length > 1) out.push(zf.length + ' Zugführer (' + zf.join(', ') + ') – einer je Zug');
    Object.keys(byVeh).forEach(function (v) {
      if (byVeh[v].GF.length > 1) out.push(v + ': ' + byVeh[v].GF.length + ' Gruppenführer (' + byVeh[v].GF.join(', ') + ')');
      if (byVeh[v].MA.length > 1) out.push(v + ': ' + byVeh[v].MA.length + ' Maschinisten (' + byVeh[v].MA.join(', ') + ')');
    });
    return out;
  }
  function partOf(mid) { return d.parts.filter(function (p) { return p.incident_id === st.inc && p.member_id === mid; })[0]; }
  function member(mid) { return d.members.filter(function (m) { return m.id === mid; })[0]; }
  function vehicleUsed(vname, i) {
    if (!i) return false;
    var n = norm(vname);
    return i.vehicles.some(function (x) { return norm(x) === n; }) || d.parts.some(function (p) { return p.incident_id === i.id && norm(p.vehicle) === n; });
  }
  // Fahrzeuge zuerst die schon im Einsatz waren, danach „ohne Fahrzeug“-Einträge (Gerätehaus, Nachbereitung)
  function places(i) { return d.part_vehicles.slice().sort(function (a, b) { return (vehicleUsed(b, i) ? 1 : 0) - (vehicleUsed(a, i) ? 1 : 0); }); }

  // Speichern: eintragen/umtragen mit Funktion – sofort zeigen, dann neu laden
  // Zusatzangaben aus dem Fenster (abweichende Zeit, Atemschutz-Minuten) – nur mitschicken, was im Fenster steht
  function sheetExtra() {
    var a = document.getElementById('h-ts'), b = document.getElementById('h-te'), c = document.getElementById('h-cert');
    if (!a && !b) return null;
    var o = { t_start: a ? a.value : '', t_end: b ? b.value : '' };
    // Verdienstausfall gleich mit anfragen (nur solange noch nichts gedruckt ist)
    if (c) { var wn = document.getElementById('h-wnone'), wt = document.getElementById('h-wt'); o.cert = c.checked ? 1 : 0; o.work_resume = c.checked ? (wn && wn.checked ? 'none' : (wt ? wt.value : '')) : ''; }
    return o;
  }
  function restoreExtra(o) {
    if (!o) return;
    var a = document.getElementById('h-ts'), b = document.getElementById('h-te'), c = document.getElementById('h-cert');
    if (a) a.value = o.t_start; if (b) b.value = o.t_end;
    if (c && o.cert != null) { c.checked = !!o.cert; var wn = document.getElementById('h-wnone'), wt = document.getElementById('h-wt'); if (wn) wn.checked = o.work_resume === 'none'; if (wt && o.work_resume !== 'none') wt.value = o.work_resume || ''; certToggle(); }
  }
  function certToggle() { var c = document.getElementById('h-cert'), w = document.getElementById('h-wbox'); if (c && w) w.hidden = !c.checked; }
  // Bescheinigung für den Arbeitgeber: ankreuzen + wann die Arbeit weiterging. Gedruckt wird nicht hier (keine persönlichen Daten an der Halle),
  // sondern von der Einsatzführung nach dem Bestätigen – das Mitglied bekommt sie unterschrieben ausgehändigt.
  function certBlock(p) {
    if (p && (p.cert === 'issued' || p.cert === 'handed')) return '<div class="h-cert"><b>Bescheinigung für den Arbeitgeber:</b> ' + (p.cert === 'handed' ? 'ausgehändigt' : 'gedruckt – liegt zur Unterschrift') + '</div>';
    var on = !!(p && p.cert === 'requested'), w = p ? p.work_resume || '' : '';
    return '<div class="h-cert"><label class="h-check"><input type="checkbox" id="h-cert"' + (on ? ' checked' : '') + '> Bescheinigung für den Arbeitgeber (Verdienstausfall)</label>' +
      '<div id="h-wbox"' + (on ? '' : ' hidden') + '><div class="h-lbl">Arbeit wieder aufgenommen um</div><div class="h-times"><input type="time" id="h-wt" value="' + esc(w !== 'none' ? w : '') + '" aria-label="Arbeit wieder um">' +
      '<label class="h-check"><input type="checkbox" id="h-wnone"' + (w === 'none' ? ' checked' : '') + '> an dem Tag nicht mehr</label></div>' +
      '<p class="h-mu">Die Einsatzführung bestätigt und druckt sie; du bekommst sie unterschrieben für deinen Arbeitgeber.</p></div></div>';
  }
  function savePart(mid, veh, roles, msg, extra) {
    if (st.busy) return Promise.resolve();
    st.busy = true;
    var m = member(mid), body = { incident_id: st.inc, member_id: mid, vehicle: veh, role: roles.join(',') };
    if (extra) { body.t_start = extra.t_start; body.t_end = extra.t_end; if (extra.cert != null) { body.cert = extra.cert; body.work_resume = extra.work_resume; } }
    return post('/part', body).then(function (res) {
      var ex = partOf(mid);
      if (ex) { ex.vehicle = veh; ex.role = roles.join(','); } else d.parts.push(ex = { incident_id: st.inc, member_id: mid, vehicle: veh, role: roles.join(','), confirmed: false, t_start: '', t_end: '', as_minutes: 0 });
      if (extra) { ex.t_start = extra.t_start; ex.t_end = extra.t_end; if (extra.cert != null && ex.cert !== 'issued' && ex.cert !== 'handed') { ex.cert = extra.cert ? 'requested' : ''; ex.work_resume = extra.work_resume; } }
      if (res && res.queued) { toast('ok', '✓ ' + m.name + ' gespeichert – wird übertragen, sobald das Netz wieder da ist'); render(); return; }
      var hh = roles.length ? roleHints() : [];
      if (hh.length) toast('warn', '⚠ ' + hh.join(' · ') + ' – bitte prüfen');
      else if (res && res.cert_missing && res.cert_missing.length) toast('warn', '✓ ' + m.name + ' – Bescheinigung angefragt. Für den Druck fehlt noch: ' + res.cert_missing.join(', ') + ' – bitte im Mitgliederbereich unter „Profil“ eintragen.');
      else if (msg !== false) toast('ok', '✓ ' + m.name + ' – ' + veh + (roles.length ? ' (' + roles.join(', ') + ')' : '') + (extra && extra.cert ? ' · Bescheinigung angefragt' : ''));
      render(); return load();
    }).catch(function (err) { toast('err', err.message); }).then(function () { st.busy = false; });
  }
  function removePart(mid) {
    if (st.busy) return Promise.resolve();
    st.busy = true;
    return post('/part', { incident_id: st.inc, member_id: mid, remove: true }).then(function (res) {
      d.parts = d.parts.filter(function (p) { return !(p.incident_id === st.inc && p.member_id === mid); }); render(); return res && res.queued ? null : load();
    }).catch(function (err) { toast('err', err.message); }).then(function () { st.busy = false; });
  }

  // Wetter und amtliche Warnungen (wie im Besprechungsraum) – nur wenn keine Anwesenheitsliste offen ist
  var SV = function (p) { return '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; };
  var CLOUD = '<path d="M14 36h20a8 8 0 0 0 0-16 11 11 0 0 0-21-2A9 9 0 0 0 14 36z"/>';
  var WICON = {
    'clear-day': SV('<circle cx="24" cy="24" r="8"/><path d="M24 6v5M24 37v5M6 24h5M37 24h5M11 11l3.5 3.5M33.5 33.5L37 37M11 37l3.5-3.5M33.5 14.5L37 11"/>'),
    'clear-night': SV('<path d="M32 30A13 13 0 0 1 20 12a13 13 0 1 0 12 18z"/>'), cloudy: SV(CLOUD), 'partly-cloudy-day': SV('<path d="M17 13a8 8 0 0 1 12 4M17 6v3M8 13h3M10 7l2 2"/>' + CLOUD), 'partly-cloudy-night': SV(CLOUD),
    fog: SV('<path d="M8 18h32M6 26h36M10 34h28"/>'), wind: SV('<path d="M6 18h24a5 5 0 1 0-5-5M6 26h32a5 5 0 1 1-5 5M6 34h14"/>'),
    rain: SV(CLOUD + '<path d="M17 40l-2 4M25 40l-2 4M33 40l-2 4"/>'), sleet: SV(CLOUD), snow: SV(CLOUD), hail: SV(CLOUD), thunderstorm: SV(CLOUD + '<path d="M25 30l-4 7h6l-4 7"/>')
  };
  var WCOND = { dry: 'trocken', fog: 'Nebel', rain: 'Regen', sleet: 'Schneeregen', snow: 'Schnee', hail: 'Hagel', thunderstorm: 'Gewitter' };
  function weather() {
    var w = d && d.weather; if (!w || w.temp == null) return '';
    // Gleicher Aufbau wie im Besprechungsraum: Symbol · große Temperatur · Wetterlage und Wind, Trennlinie zur Uhr
    return '<div class="h-wx"><span class="ic">' + (WICON[w.icon] || WICON.cloudy) + '</span><b>' + w.temp + '°</b><span class="txt"><span>' + esc(WCOND[w.condition] || 'Wetter') + '</span>' +
      (w.wind != null ? '<span' + (w.gust >= 60 ? ' class="strong"' : '') + '>Wind ' + w.wind + (w.gust ? ', Böen ' + w.gust : '') + ' km/h</span>' : '') + '</span></div>';
  }
  function warnings() {
    var ws = (d && d.warnings) || []; if (!ws.length) return '';
    return '<div class="h-warns">' + ws.slice(0, 3).map(function (w) {
      return '<div class="h-warn sev' + (w.severity || 1) + '"><b>' + esc(w.provider === 'DWD' ? 'Wetter' : (w.provider || 'Warnung')) + '</b><span>' + esc(String(w.headline || '').replace(/^Amtliche\s+/i, '')) +
        (w.expires ? '<small>bis ' + dmy(w.expires) + ' ' + hm(w.expires) + ' Uhr</small>' : '') + '</span></div>';
    }).join('') + '</div>';
  }
  // Leiste: aktuelle und letzte Einsätze
  function incBar() {
    var o = d.overview || {}, l = (o.last || []).slice(0, 6); if (!l.length) return '';
    return '<div class="h-incbar"><span class="h-incbar-h">Letzte Einsätze<b>' + (o.count || 0) + ' in ' + o.year + '</b></span>' + l.map(function (x) {
      return '<span class="h-incbar-i"><em>' + dmy(x.start) + ' ' + hm(x.start) + '</em>' + esc(x.label) + (x.kind === 'uebung' ? ' <i>Übung</i>' : '') + '</span>';
    }).join('') + '</div>';
  }
  function qrCard() {
    if (!d.portal || typeof qrcode === 'undefined') return '';
    var svg = ''; try { var q = qrcode(0, 'M'); q.addData(d.portal); q.make(); svg = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); } catch (e) { return ''; }
    return '<section class="h-card h-qr"><div class="h-qr-c">' + svg + '</div><div><h2>' + esc(d.qr_label || 'Meine Feuerwehr') + '</h2><p class="h-sub">Scannen: dein Profil, Einsätze, Dienste, Lehrgänge, Mängel melden.</p></div></section>';
  }
  function head() {
    var now = new Date();
    return '<header class="h-head">' + (C.logo ? '<img class="h-logo for-light" src="' + esc(C.logo) + '" alt="' + esc(C.org) + '"><img class="h-logo for-dark" src="' + esc(C.logoDark || C.logo) + '" alt="" aria-hidden="true">' : '<b class="cond" style="font-size:28px">' + esc(C.org) + '</b>') +
      (qGet().length ? '<span class="h-off">' + qGet().length + (qGet().length === 1 ? ' Eintrag wartet' : ' Einträge warten') + ' auf Netz</span>' : st.offline ? '<span class="h-off">offline – letzter Stand</span>' : '') +
      (fromScreen || (d && d.incidents.length && d.forced) ? '<button type="button" class="h-back" data-act="' + (d && d.forced ? 'unforce' : 'back') + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>Dashboard</button>' : '') +
      (d && !d.incidents.length ? '<button type="button" class="h-back h-pickbtn" data-act="pick">Anwesenheit eintragen</button>' : '') + (d && d.demo ? '<button type="button" class="h-demo" data-act="demo" title="Alarmszenario für die Vorführung">Demo · Szenario</button>' : '') +
      (d && !d.incidents.length ? weather() : '') + '<div class="h-clockbox"><b class="h-clock" id="h-clock">' + ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2) + '</b>' +
      '<span class="h-date">' + now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + '</span></div>' +
      (document.fullscreenEnabled && !document.fullscreenElement ? '<button type="button" class="h-fs" data-act="fs" aria-label="Vollbild" title="Vollbild"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>' : '') + '</header>';
  }
  function roleChips(sel, act, extra) {
    return '<div class="h-roles">' + Object.keys(d.roles).map(function (k) {
      return '<button type="button" data-act="' + act + '" data-v="' + k + '"' + (extra || '') + ' aria-pressed="' + (sel.indexOf(k) >= 0) + '" title="' + esc(d.roles[k]) + '">' + k + '</button>';
    }).join('') + '</div>';
  }

  // ---- Anwesenheit -----------------------------------------------------------------
  // Rotes Band über der Liste (wie im Besprechungsraum): Stichwort, Ort, Alarmzeit, Fahrzeuge im Einsatz – auf dem Fernseher sofort lesbar
  function alarmBand() {
    var i = inc(); if (!i) return '';
    var mins = Math.max(0, Math.round((Date.now() - new Date(i.start.replace(' ', 'T')).getTime()) / 60000));
    var ago = mins >= 90 ? 'vor ' + Math.floor(mins / 60) + ' Std ' + (mins % 60) + ' Min' : mins < 1 ? 'gerade eben' : 'vor ' + mins + ' Min';
    var until = new Date(new Date(i.start.replace(' ', 'T')).getTime() + d.window * 3600000);
    // Karte zur Einsatzstelle, wenn die Alarmierung Koordinaten mitliefert
    var mapH = i.lat != null && i.lng != null && window.MYFMap ? MYFMap(i.lat, i.lng, { z: 15, station: { lat: C.lat, lon: C.lon }, size: 'clamp(180px, 15vw, 300px)' }) : '';
    return '<div class="h-alarm' + (mapH ? ' has-map' : '') + (i.kind === 'uebung' ? ' is-drill' : '') + '"><div class="lbl">' + (i.kind === 'uebung' ? 'Übungsdienst' : d.incidents.length > 1 ? 'Einsatz ' + (d.incidents.indexOf(i) + 1) + ' von ' + d.incidents.length : 'Laufender Einsatz') +
      '<small>Alarm ' + hm(i.start) + ' Uhr · ' + ago + '</small></div><div class="kw">' + esc(i.label) + (i.place ? '<span class="pl">' + esc(i.place) + '</span>' : '') + '</div>' +
      (mapH ? '<div class="map">' + mapH + '</div>' : '') +
      '<div class="vs"><small>Liste offen bis ' + ('0' + until.getHours()).slice(-2) + ':' + ('0' + until.getMinutes()).slice(-2) + ' Uhr · danach bestätigt die Einsatzführung</small></div></div>' + vehStrip(i);
  }
  // Fahrzeugleiste im Einsatz: alle Fahrzeuge mit Status auf einen Blick – im Einsatz, in der Halle, außer Dienst, unterwegs
  function vehStrip(i) {
    if (!d.vehicles.length) return '';
    return '<div class="h-vstrip">' + d.vehicles.map(function (v) {
      var f = String(v.fms || ''), used = vehicleUsed(v.name, i), bk = d.bookings.filter(function (b) { return b.vehicle === v.name && b.now; })[0], cls, txt, stale = fmsStale(v);
      if (v.status === 'out') { cls = 'is-out'; txt = 'außer Dienst'; }
      else if (stale && !used) { cls = 'is-stale'; txt = 'Status unklar seit ' + hm(v.fms_at); f = '?'; }
      // Rot nur, solange das Fahrzeug wirklich unterwegs ist: Status 3/4/7/8 – oder Besatzung eingetragen und seit dem Alarm noch kein „frei“ (1/2)
      else if (['3', '4', '7', '8'].indexOf(f) >= 0 || (used && !(['1', '2'].indexOf(f) >= 0 && v.fms_at && v.fms_at >= i.start))) { cls = 'is-busy'; txt = f ? esc(v.fms_text) : 'im Einsatz'; }
      else if (used) { cls = 'is-home'; txt = 'zurück · ' + esc(v.fms_text); }
      else if (f === '6') { cls = 'is-out'; txt = 'nicht einsatzbereit'; }
      else if (bk) { cls = 'is-away'; txt = 'unterwegs bis ' + hm(bk.end); }
      else { cls = 'is-home'; txt = f ? esc(v.fms_text) : 'in der Halle'; }
      var done = d.trips_done[i.id + '-' + v.id] != null;
      return '<div class="h-vchip ' + cls + ' f' + (f || 'x') + '"><b' + (!f && cls === 'is-home' ? ' title="kein Funkstatus – in der Halle"' : '') + '>' + (f || (cls === 'is-home' ? '⌂' : '–')) + '</b><span><strong>' + esc(v.name) + '</strong><small>' + txt + (f && f !== '?' && v.fms_at ? ' · ' + hm(v.fms_at) : '') + '</small></span>' +
        (used ? '<button type="button" class="h-km' + (done ? ' is-done' : '') + '" data-act="km" data-id="' + v.id + '">' + (done ? '✓ km' : 'km') + '</button>' : stale ? '<button type="button" class="h-km" data-act="vehback" data-id="' + v.id + '">ist zurück</button>' : '') + '</div>';
    }).join('') + '</div>';
  }
  function attendance() {
    var i = inc(), n = d.parts.filter(function (p) { return p.incident_id === st.inc; }).length;
    var until = new Date(new Date(i.start.replace(' ', 'T')).getTime() + d.window * 3600000);
    var h = '<section class="h-card h-list"><div class="h-listhead"><h2>Warst du dabei?</h2><span class="h-count">' + n + ' eingetragen</span>' +
      '<div class="h-mode" role="group" aria-label="Eintragen"><button type="button" data-act="mode" data-v="sheet" aria-pressed="' + (st.mode === 'sheet') + '">Liste</button>' +
      '<button type="button" data-act="mode" data-v="person" aria-pressed="' + (st.mode === 'person') + '">Nach Person</button>' +
      '<button type="button" data-act="mode" data-v="veh" aria-pressed="' + (st.mode === 'veh') + '">Nach Fahrzeug</button></div></div>';
    // Mehrere Einsätze (Unwetter, Paralleleinsätze): ein Reiter je Einsatz mit Zahl der Eingetragenen; Besatzung lässt sich übernehmen
    // Reiter nur bei mehreren Einsätzen – bei einem steht alles im roten Band
    h += '<div class="h-incs' + (d.incidents.length > 1 || (d.incidents.length > 1 && !n) ? '' : ' is-one') + '">' + d.incidents.map(function (x) {
      var cnt = d.parts.filter(function (p) { return p.incident_id === x.id; }).length;
      return '<button type="button" data-act="inc" data-id="' + x.id + '" aria-pressed="' + (x.id === st.inc) + '"><b>' + esc(x.label) + (x.place ? ' <small>' + esc(x.place) + '</small>' : '') + '</b><span>' + dmy(x.start) + ' ' + hm(x.start) + ' Uhr' + (x.kind === 'uebung' ? ' · Übung' : '') + (cnt ? ' · ' + cnt + ' eingetragen' : '') + '</span></button>';
    }).join('') + '<span class="h-until">Liste offen bis ' + ('0' + until.getHours()).slice(-2) + ':' + ('0' + until.getMinutes()).slice(-2) + ' Uhr · Einsatzführung bestätigt</span>' +
      (d.incidents.length > 1 && !n && d.parts.some(function (p) { return p.incident_id !== st.inc; }) ? '<button type="button" class="h-btn h-copy" data-act="copycrew">Besatzung von anderem Einsatz übernehmen</button>' : '') + '</div>';
    var rh = roleHints();
    if (rh.length) h += '<div class="h-rolehint">⚠ Bitte prüfen: ' + rh.map(esc).join(' · ') + '</div>';
    if (st.mode === 'veh') return h + byVehicle(i) + '</section>';
    h += findBar();
    var list = filtered();
    if (st.mode === 'sheet') return h + paperSheet(i, list) + '</section>';
    h += '<div class="h-names">' + list.map(function (m) {
      var p = partOf(m.id), r = p ? roleList(p.role) : [];
      return '<button type="button" class="h-name' + (p ? ' is-in' : '') + '" data-act="who" data-id="' + m.id + '"><b>' + esc(m.name) + '</b>' + (m.hint ? '<small class="h-hint">' + esc(m.hint) + '</small>' : '') +
        (p ? '<small>' + esc(p.vehicle) + (r.length ? ' · ' + r.join(' ') : '') + (p.confirmed ? ' ✓' : '') + '</small>' : '') + '</button>';
    }).join('') + '</div>' + (list.length ? '' : '<div class="h-empty">Kein Name gefunden.</div>');
    return h + '<p class="h-foot">Name antippen → Fahrzeug antippen. Funktion (GF, MA, AGT …) kann man im selben Fenster dazu tippen.</p></section>';
  }
  // Suche (immer sichtbar), Einheit, A–Z – damit man bei 80+ Namen sofort bei sich ist
  function filtered() {
    var q = norm(st.q);
    return d.members.filter(function (m) { return (!q || norm(m.name).indexOf(q) >= 0 || norm(m.name.split(',').reverse().join('')).indexOf(q) >= 0) && (!st.unitF || m.unit === st.unitF); });
  }
  function findBar() {
    var units = {}; d.members.forEach(function (m) { if (m.unit) units[m.unit] = (d.units || {})[m.unit] || m.unit; });
    var uk = Object.keys(units);
    return '<div class="h-find"><input type="search" id="h-q" placeholder="Name suchen – z. B. „hül“ oder „lars“" value="' + esc(st.q) + '" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="search">' +
      (st.q ? '<button type="button" class="h-btn h-qx" data-act="qclear" aria-label="Suche leeren">✕</button>' : '') +
      (uk.length > 1 ? '<div class="h-units"><button type="button" data-act="unitf" data-v="" aria-pressed="' + !st.unitF + '">Alle</button>' + uk.map(function (k) {
        return '<button type="button" data-act="unitf" data-v="' + esc(k) + '" aria-pressed="' + (st.unitF === k) + '">' + esc(units[k]) + '</button>';
      }).join('') + '</div>' : '') + '</div>';
  }
  // Wie der Zettel: Zeilen = Namen (A–Z), Spalten = Fahrzeuge; Feld antippen = Kreuz; Name/Kreuz antippen = Funktion, Zeit, Atemschutz
  // Kurze Spaltenköpfe: „Gerätehaus (Bereitschaft)“ → „Gerätehaus“, „Nachbereitung / Aufräumen“ → „Aufräumen“
  // Spaltenkopf: „LF 10 (Nord)“ → „LF 10“, „Nachbereitung / Aufräumen“ → „Aufräumen“ – „LF20/16“ bleibt (Schrägstrich ohne Leerzeichen)
  function shortV(v) { return String(v).replace(/\s*\(.*\)\s*/, '').replace(/^.*\s\/\s*/, '').trim() || v; }
  function paperSheet(i, list) {
    // Spalten: Fahrzeuge der Einheit dieses Einsatzes (+ alles, worauf schon jemand steht) und die Sonderspalten
    var vu = d.veh_units || {}, cols = d.part_vehicles.filter(function (v) {
      return (d.part_extra || []).indexOf(v) >= 0 || !i.unit || !vu[v] || vu[v] === i.unit || vehicleUsed(v, i) || d.parts.some(function (p) { return p.incident_id === st.inc && p.vehicle === v; });
    }), letters = {};
    list.forEach(function (m) { var c = (m.name.charAt(0) || '').toUpperCase(); if (!letters[c]) letters[c] = m.id; });
    var h = '<div class="h-az">' + Object.keys(letters).map(function (c) { return '<button type="button" data-act="az" data-id="' + letters[c] + '">' + esc(c) + '</button>'; }).join('') + '</div>';
    h += '<div class="h-paper" id="h-paper"><table><thead><tr><th class="h-pn">Name</th>' + cols.map(function (v) {
      var n = d.parts.filter(function (p) { return p.incident_id === st.inc && p.vehicle === v; }).length;
      return '<th class="' + (vehicleUsed(v, i) ? 'is-used' : '') + '" title="' + esc(v) + '">' + esc(shortV(v)) + (n ? '<small>' + n + '</small>' : '') + '</th>';
    }).join('') + '</tr></thead><tbody>' + list.map(function (m) {
      var p = partOf(m.id), r = p ? roleList(p.role) : [], nm = m.name.split(',');
      return '<tr id="h-r' + m.id + '" class="' + (p ? 'is-in' : '') + '"><th class="h-pn"><button type="button" data-act="who" data-id="' + m.id + '"><b>' + esc(nm[0].trim()) + '</b> ' + esc((nm[1] || '').trim()) +
        (m.hint ? ' <small class="h-hint">' + esc(m.hint) + '</small>' : '') + '</button></th>' +
        cols.map(function (v) {
          var on = p && p.vehicle === v;
          // Statt Kreuz die Funktion (GF, AGT …) – ein Blick genügt
          return '<td><button type="button" class="h-x' + (on ? ' is-on' : '') + (on && r.length ? ' is-role' : '') + (p && p.confirmed ? ' is-ok' : '') + '" data-act="' + (on ? 'who' : 'cross') + '" data-id="' + m.id + '" data-v="' + esc(v) + '" aria-label="' + esc(m.name + ' – ' + v) + '">' +
            (on ? (r.length ? esc(r.join('·')) : '✕') + (p.t_start || p.t_end ? '<small>' + esc((p.t_start || '') + '–' + (p.t_end || '')) + '</small>' : '') : '') + '</button></td>';
        }).join('') + '</tr>';
    }).join('') + '</tbody></table></div>' + (list.length ? '' : '<div class="h-empty">Kein Name gefunden.</div>');
    return h + '<p class="h-foot">Feld beim Fahrzeug antippen = eingetragen (Kreuz). Name oder Feld antippen = Funktion (EL, ZF, GF, MA, AGT), abweichende Zeit oder austragen – die Funktion steht dann im Feld.</p>';
  }
  // Einer trägt die ganze Besatzung ein: Fahrzeug wählen, dann Namen antippen (an/aus), Funktion je Person
  function byVehicle(i) {
    var h = '<div class="h-lbl">1. Fahrzeug</div><div class="h-vbtns h-vrow">' + places(i).map(function (v) {
      var n = d.parts.filter(function (p) { return p.incident_id === st.inc && p.vehicle === v; }).length;
      return '<button type="button" class="' + (vehicleUsed(v, i) ? 'is-used ' : '') + (/\s\/\s|Bereitschaft/.test(v) ? 'is-extra' : '') + '" data-act="pickveh" data-v="' + esc(v) + '" aria-pressed="' + (st.veh === v) + '"' + (shortV(v) !== v ? ' title="' + esc(v) + '"' : '') + '>' + esc(shortV(v)) + (n ? '<small>' + n + '</small>' : '') + '</button>';
    }).join('') + '</div>';
    if (!st.veh) return h + '<div class="h-empty">Fahrzeug antippen – dann alle, die drauf waren.</div>';
    var crew = d.parts.filter(function (p) { return p.incident_id === st.inc && p.vehicle === st.veh; });
    h += '<div class="h-crewgrid"><div><div class="h-lbl">2. Wer war auf ' + esc(st.veh) + '? Antippen = an/aus</div><div class="h-names">' + d.members.map(function (m) {
      var p = partOf(m.id), on = p && p.vehicle === st.veh, other = p && !on;
      return '<button type="button" class="h-name' + (on ? ' is-in' : other ? ' is-other' : '') + '" data-act="crew" data-id="' + m.id + '"><b>' + esc(m.name) + '</b>' + (m.hint ? '<small class="h-hint">' + esc(m.hint) + '</small>' : '') +
        (other ? '<small>schon: ' + esc(p.vehicle) + '</small>' : '') + '</button>';
    }).join('') + '</div></div>';
    h += '<aside class="h-crew"><div class="h-lbl">Besatzung ' + esc(st.veh) + ' (' + crew.length + ')</div>' + (crew.length ? crew.map(function (p) {
      var m = member(p.member_id) || { name: '?' };
      return '<div class="h-crewrow"><b>' + esc(m.name) + '</b>' + (p.confirmed ? '<span class="h-ok">bestätigt</span>' : roleChips(roleList(p.role), 'crewrole', ' data-id="' + p.member_id + '"')) + '</div>';
    }).join('') : '<p class="h-sub">Noch niemand.</p>') + '</aside></div>';
    return h;
  }

  // ---- Fahrzeuge, Einsätze, Buchungen ------------------------------------------------
  // Status 3/4/7/8 ohne neuen Status seit 6 Stunden: nicht mehr blind „im Einsatz“ zeigen, sondern „Status unklar“ (Funk vergessen)
  function fmsStale(v) { return ['3', '4', '7', '8'].indexOf(String(v.fms)) >= 0 && v.fms_at && (Date.now() - new Date(String(v.fms_at).replace(' ', 'T')).getTime()) > 6 * 3600000; }
  function lastTripTxt(v) { return v.last_trip ? 'letzte Fahrt ' + dmy(v.last_trip.date) + (v.last_trip.km != null ? ' · ' + fmtKm(v.last_trip.km) + ' km' : '') : 'km ' + fmtKm(v.km); }
  function vehicles(big) {
    var i = d.incidents.length ? inc() : null;
    var h = '<section class="h-card' + (big ? ' h-vbig' : '') + '"><h2>Fahrzeuge</h2><div class="h-veh">';
    h += d.vehicles.map(function (v) {
      var used = i && vehicleUsed(v.name, i), done = i && d.trips_done[i.id + '-' + v.id] != null, out = d.bookings.filter(function (b) { return b.vehicle === v.name && b.now; })[0];
      var stale = fmsStale(v);
      return '<div class="h-v' + (stale ? ' is-stale' : '') + '"><span class="h-fms ' + (v.fms && !stale ? 'f' + v.fms : 'fx') + '" title="' + esc(v.fms_text || 'kein Status') + '">' + (stale ? '?' : v.fms || '–') + '</span>' +
        '<div><b>' + esc(v.name) + '</b><span>' + (v.status === 'out' ? 'außer Dienst' : stale ? 'Status unklar · seit ' + hm(v.fms_at) + ' Status ' + esc(v.fms) : v.fms ? esc(v.fms_text) + ' · ' + hm(v.fms_at) : out ? 'unterwegs bis ' + hm(out.end) : lastTripTxt(v)) + '</span></div>' +
        (stale && !used ? '<button type="button" class="h-km" data-act="vehback" data-id="' + v.id + '">ist zurück</button>' : '') +
        (used ? '<button type="button" class="h-km' + (done ? ' is-done' : '') + '" data-act="km" data-id="' + v.id + '">' + (done ? '✓ ' + fmtKm(d.trips_done[i.id + '-' + v.id]) : 'km eintragen') + '</button>' : '<span></span>') + '</div>';
    }).join('') || '<p class="h-sub">Noch keine Fahrzeuge angelegt.</p>';
    return h + '</div></section>';
  }
  // Ruhige Zeit: Aufbau wie das Dashboard im Besprechungsraum – Einsatz-Statistik, letzte Einsätze, nächster Dienst,
  // Fahrzeuge, Hinweise, außer Dienst, Buchungen, QR-Code. Alles ohne Namen.
  var MON = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'], CATS = { brand: 'Brand', th: 'Hilfeleistung', vu: 'Verkehrsunfall', fehl: 'Fehlalarm', sonst: 'Sonstiges' };
  var WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  function dayLbl(iso) { var t = new Date(String(iso).slice(0, 10) + 'T12:00:00'), n = new Date(); n.setHours(12, 0, 0, 0); var diff = Math.round((t - n) / 864e5);
    return diff === 0 ? 'heute' : diff === 1 ? 'morgen' : WD[t.getDay()] + ' ' + dmy(iso); }
  function calm() {
    var c = d.calm || {}, o = d.overview || {}, stt = c.stats, nowM = new Date().getMonth(), h = '<div class="h-col">';
    // Einsätze dieses Jahr
    if (stt) {
      var max = Math.max.apply(null, stt.months.map(function (n, m) { return n + ((stt.est || [])[m] || 0); }).concat([1]));
      h += '<section class="h-card"><h2>Einsätze ' + o.year + '</h2><div class="hc-kpi"><b class="hc-big">' + stt.total + '</b><span>bisher in ' + o.year + '</span></div>' +
        '<div class="hc-cats">' + Object.keys(CATS).filter(function (k) { return stt.cats[k]; }).map(function (k) { return '<span><b>' + stt.cats[k] + '</b> ' + CATS[k] + '</span>'; }).join('') + '</div>' +
        '<div class="hc-bars">' + stt.months.map(function (n, m) { n += (stt.est || [])[m] || 0; return '<div class="b' + (m === nowM ? ' now' : m > nowM ? ' future' : '') + '"><span>' + (m <= nowM && n ? n : '') + '</span><i style="height:' + Math.round(n / max * 100) + '%"></i><em>' + MON[m] + '</em></div>'; }).join('') + '</div></section>';
    }
    var last = (o.last || []).filter(function (x) { return x.kind !== 'uebung'; }).slice(0, 4);
    if (last.length) h += '<section class="h-card"><h2>Letzte Einsätze</h2><div class="hc-list">' + last.map(function (x) {
      return '<div class="hc-item"><div class="hc-when">' + dmy(x.start) + '<small>' + hm(x.start) + ' Uhr</small></div><div class="hc-what">' + esc(x.label) + '</div></div>'; }).join('') + '</div></section>';
    h += '</div><div class="h-col">';
    if (c.next_drill) h += '<section class="h-card"><h2>Nächster Dienst</h2><div class="hc-item"><div class="hc-when">' + dayLbl(c.next_drill.date) + (c.next_drill.time ? '<small>' + esc(c.next_drill.time) + ' Uhr</small>' : '') + '</div>' +
      '<div class="hc-what">' + esc(c.next_drill.title) + (c.next_drill.lead ? '<small>' + esc(c.next_drill.lead) + '</small>' : '') + '</div></div></section>';
    h += vehicles(true);
    h += '</div><div class="h-col">';
    (c.notices || []).forEach(function (n) { h += '<section class="h-card hc-note lv-' + esc(n.level) + '"><h2>' + (n.level === 'alert' ? 'Achtung' : n.level === 'warn' ? 'Wichtig' : 'Hinweis') + '</h2><p>' + esc(n.text) + (n.signature ? ' <small>— ' + esc(n.signature) + '</small>' : '') + '</p></section>'; });
    if ((c.out || []).length) h += '<section class="h-card hc-note lv-alert"><h2>Außer Dienst</h2><p>' + c.out.map(function (x) { return esc(x.object) + (x.title ? ' – ' + esc(x.title) : ''); }).join('<br>') + '</p></section>';
    h += '<section class="h-card"><h2>Fahrzeugbuchungen</h2>' + (d.bookings.length ? '<div class="hc-list">' + d.bookings.slice(0, 4).map(function (b) {
      return '<div class="hc-item"><div class="hc-when">' + dmy(b.start) + '<small>' + hm(b.start) + ' Uhr</small></div><div class="hc-what">' + esc(b.vehicle) + '<small>' + (b.now ? 'unterwegs · ' : '') + 'bis ' + dmy(b.end) + ' ' + hm(b.end) + (b.purpose ? ' · ' + esc(b.purpose) : '') + '</small></div></div>';
    }).join('') + '</div>' : '<p class="h-sub">In den nächsten 14 Tagen keine.</p>') + '</section>';
    h += qrCard() + '<p class="hc-foot">Nach dem nächsten Alarm erscheint hier die Anwesenheitsliste – ' + d.window + (d.window == 1 ? ' Stunde' : ' Stunden') + ' lang.' +
      (d.legal || []).map(function (l) { return ' · <a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label) + '</a>'; }).join('') + '</p></div>';
    return h;
  }
  function overview() {
    var o = d.overview || {};
    var h = '<section class="h-card"><h2>Einsätze ' + o.year + '<span class="h-count">' + (o.count || 0) + ' bisher</span></h2>' +
      (o.last && o.last.length ? '' : '<p class="h-sub">Noch keine Einsätze in diesem Jahr.</p>') +
      '<p class="h-foot">Nach dem nächsten Alarm erscheint hier die Anwesenheitsliste – ' + d.window + ' Stunden lang.</p></section>';
    h += '<section class="h-card"><h2>Fahrzeugbuchungen</h2>' + (d.bookings.length ? '<div class="h-inclist">' + d.bookings.map(function (b) {
      return '<div><span class="h-d">' + dmy(b.start) + '<small>' + hm(b.start) + '</small></span><b>' + esc(b.vehicle) + '</b><span class="h-sub" style="margin:0">' + (b.now ? 'unterwegs · ' : '') + 'bis ' + dmy(b.end) + ' ' + hm(b.end) + (b.purpose ? ' · ' + esc(b.purpose) : '') + '</span></div>';
    }).join('') + '</div>' : '<p class="h-sub">In den nächsten 14 Tagen keine.</p>') + '</section>';
    return h;
  }

  // Fahrer/in: ohne Eingabe die letzten Fahrer, sonst Namenssuche wie in der Anwesenheitsliste („hül“, „lars“)
  function drvChips() {
    var q = norm(st.drvq || ''), list;
    if (q) list = d.members.filter(function (m) { return norm(m.name).indexOf(q) >= 0 || norm(m.name.split(',').reverse().join(' ')).indexOf(q) >= 0; }).slice(0, 12);
    else list = (d.recent_drivers || []).map(member).filter(Boolean).slice(0, 8);
    var sel = st.drv ? member(st.drv) : null;
    if (sel && !list.some(function (m) { return m.id === sel.id; })) list.unshift(sel);
    if (!list.length) return q ? '<span class="h-mu">Niemand gefunden.</span>' : '';
    return list.map(function (m) { return '<button type="button" data-act="drvpick" data-id="' + m.id + '" aria-pressed="' + (st.drv === m.id) + '">' + esc(m.name) + (m.hint ? ' <small>' + esc(m.hint) + '</small>' : '') + '</button>'; }).join('');
  }
  function nowLocal() { var n = new Date(); return n.getFullYear() + '-' + ('0' + (n.getMonth() + 1)).slice(-2) + '-' + ('0' + n.getDate()).slice(-2) + 'T' + ('0' + n.getHours()).slice(-2) + ':' + ('0' + n.getMinutes()).slice(-2); }

  // ---- Fenster: Person → Fahrzeug, km-Stand ---------------------------------------------
  function sheet() {
    var s = st.sheet; if (!s) return '';
    var i = inc();
    if (s.type === 'demo') {
      var sc = [['brand', 'Alarm: Brand Wohnhaus'], ['th', 'Alarm: Hilfe P-Tür'], ['vu', 'Alarm: VU, Person eingeklemmt'], ['erhoehung', 'Erhöhung (F3, Menschenleben in Gefahr)'], ['nachalarm', 'Nachalarmierung (DLK, MTF)'], ['probe', 'Probealarm – nur Test, kein Einsatz'], ['ende', 'Einsatz beenden – zurück zur Ruhe'], ['reset', 'Demo zurücksetzen']];
      return '<div class="h-dim" data-act="close"><div class="h-sheet" role="dialog" aria-modal="true"><h3>Demo · Alarmszenario</h3><p class="h-sub">Nur im Demo-Bestand. Beide Dashboards reagieren wie bei einem echten Alarm: rotes Band im Besprechungsraum, Anwesenheitsliste hier, Fahrzeuge auf Status 3.</p>' +
        '<div class="h-picklist">' + sc.map(function (x) { return '<button type="button" data-act="demostep" data-v="' + x[0] + '"' + (x[0] === 'reset' ? ' class="h-mu"' : '') + '><b>' + esc(x[1]) + '</b></button>'; }).join('') + '</div>' +
        '<div class="h-row"><button type="button" class="h-btn" data-act="close">Schließen</button></div></div></div>';
    }
    if (s.type === 'copy') {
      // Unwetter: dieselbe Besatzung fährt den nächsten Einsatz – Einträge eines anderen offenen Einsatzes übernehmen (unbestätigt)
      var others = d.incidents.filter(function (x) { return x.id !== st.inc && d.parts.some(function (p) { return p.incident_id === x.id; }); });
      return '<div class="h-dim" data-act="close"><div class="h-sheet" role="dialog" aria-modal="true"><h3>Besatzung übernehmen</h3><p class="h-sub">Alle Einträge (Person, Fahrzeug, Funktion) eines anderen Einsatzes in „' + esc(i.label) + '“ übernehmen. Einzelne lassen sich danach austragen.</p>' +
        '<div class="h-picklist">' + others.map(function (x) { var c = d.parts.filter(function (p) { return p.incident_id === x.id; }).length;
          return '<button type="button" data-act="copyfrom" data-id="' + x.id + '"><span class="h-d">' + hm(x.start) + '</span><b>' + esc(x.label) + '</b><span class="h-mu">' + c + ' Personen</span></button>'; }).join('') + '</div>' +
        '<div class="h-row"><button type="button" class="h-btn" data-act="close">Abbrechen</button></div></div></div>';
    }
    if (s.type === 'pick') {
      // Anwesenheit eintragen ohne Alarm in der Halle: Einsatz der letzten 14 Tage wählen oder neu anlegen
      var rec = d.recent || [];
      return '<div class="h-dim" data-act="close"><div class="h-sheet" role="dialog" aria-modal="true"><h3>Anwesenheit eintragen</h3><p class="h-sub">Welcher Einsatz? Alle, bei denen Eintragen noch geht (bis ' + (d.open_days || 7) + ' Tage danach) – oder ein neuer, falls der Alarm hier nicht angekommen ist.</p>' +
        (rec.length ? '<div class="h-picklist">' + rec.map(function (r) {
          return '<button type="button" data-act="pickinc" data-id="' + r.id + '"' + (r.closed ? ' disabled' : '') + '><span class="h-d">' + dmy(r.start) + '<small>' + hm(r.start) + '</small></span><b>' + esc(r.label) + '</b>' +
            (r.closed ? '<span class="h-mu">Liste abgeschlossen</span>' : r.kind === 'uebung' ? '<span class="h-mu">Übung</span>' : '') + '</button>'; }).join('') + '</div>' : '<p class="h-sub">Keine Einsätze in den letzten 14 Tagen.</p>') +
        '<div class="h-lbl">Neuer Einsatz – Alarm kam hier nicht an</div><div class="h-new"><input type="text" id="h-nt" placeholder="Stichwort, z. B. Hilfe P-Tür" maxlength="120" value="' + esc(st.nt || '') + '" autocomplete="off">' +
        '<input type="datetime-local" id="h-ntime" value="' + esc(st.ntime || nowLocal()) + '"><button type="button" class="h-btn h-p" data-act="newinc">Anlegen & Liste öffnen</button></div>' +
        '<p class="h-mu">Erscheint in der Verwaltung als „von der Halle angelegt“; der Bericht der Website wird später automatisch dazugehängt.</p>' +
        '<div class="h-row"><button type="button" class="h-btn" data-act="close">Abbrechen</button></div></div></div>';
    }
    if (s.type === 'who') {
      var m = member(s.id), p = partOf(s.id);
      return '<div class="h-dim" data-act="close"><div class="h-sheet" role="dialog" aria-modal="true"><h3>' + esc(m.name) + '</h3><p class="h-sub">' + esc(i.label) + ' · ' + hm(i.start) + ' Uhr</p>' +
        (p && p.confirmed ? '<p>Schon von der Einsatzführung bestätigt (' + esc(p.vehicle) + '). Änderungen bitte über die Einsatzführung.</p><div class="h-row"><button type="button" class="h-btn" data-act="close">Schließen</button></div>' :
        '<div class="h-lbl">Funktion (optional)</div>' + roleChips(st.roles, 'role') +
        '<div class="h-extra"><div><div class="h-lbl">Einsatzzeit – nur wenn abweichend vom Fahrzeug</div><div class="h-times"><input type="time" id="h-ts" value="' + esc(p ? p.t_start : '') + '" aria-label="Beginn"><span>–</span><input type="time" id="h-te" value="' + esc(p ? p.t_end : '') + '" aria-label="Ende"></div></div>' +
        '</div>' + certBlock(p) +
        '<div class="h-lbl">Auf welchem Fahrzeug? – antippen = eingetragen</div><div class="h-vbtns">' + places(i).map(function (v) {
          var extra = (d.part_extra || []).indexOf(v) >= 0;
          return '<button type="button" class="' + (vehicleUsed(v, i) ? 'is-used' : '') + (extra ? ' is-extra' : '') + '" data-act="veh" data-v="' + esc(v) + '" aria-pressed="' + (!!p && p.vehicle === v) + '">' + esc(v) + '</button>';
        }).join('') + '</div><div class="h-row">' + (p ? '<button type="button" class="h-btn h-save" data-act="sheetsave">Speichern</button>' : '') + '<button type="button" class="h-btn" data-act="close">Abbrechen</button>' +
        (p ? '<button type="button" class="h-btn h-q" style="margin-left:auto" data-act="out" data-id="' + s.id + '">Doch nicht dabei – austragen</button>' : '<span class="h-mu" style="margin-left:auto">Fahrzeug antippen = gespeichert</span>') + '</div>') + '</div></div>';
    }
    if (s.type === 'trip') {
      // Fahrt ohne Einsatz: Werkstatt, Tanken, Übung, Dienstfahrt … – Fahrzeug, Zweck, km-Stand, optional Liter und Fahrer
      if (!s.vid) return '<div class="h-dim" data-act="close"><div class="h-sheet" role="dialog" aria-modal="true"><h3>Fahrt eintragen</h3><p class="h-sub">Welches Fahrzeug?</p><div class="h-vbtns">' +
        d.vehicles.map(function (x) { return '<button type="button" data-act="tripveh" data-id="' + x.id + '">' + esc(x.name) + '</button>'; }).join('') + '</div><div class="h-row"><button type="button" class="h-btn" data-act="close">Abbrechen</button></div></div></div>';
      var tv = d.vehicles.filter(function (x) { return x.id === s.vid; })[0] || {}, tkm = st.km, tbad = tkm !== '' && tv.km != null && +tkm < tv.km, tank = st.tkind === 'tanken';
      return '<div class="h-dim" data-act="close"><div class="h-sheet h-wide" role="dialog" aria-modal="true"><h3>' + esc(tv.name) + ': Fahrt eintragen</h3><p class="h-sub">' + (tv.km != null ? 'zuletzt ' + fmtKm(tv.km) + ' km' : 'noch kein km-Stand bekannt') + '</p>' +
        // Breite Bildschirme: links Zweck/Ziel/Fahrer, rechts km-Block – schmale: untereinander
        '<div class="h-tcols"><div class="h-tc h-tca"><div class="h-lbl">Wofür?</div><div class="h-vbtns h-kinds">' + Object.keys(C.tripKinds || { dienst: 'Dienstfahrt' }).map(function (k) { return '<button type="button" data-act="tkind" data-v="' + k + '" aria-pressed="' + (st.tkind === k) + '">' + esc(C.tripKinds[k]) + '</button>'; }).join('') + '</div>' +
        '<div class="h-lbl">Ziel / Anlass (optional)</div><input type="text" id="h-dest" class="h-dest" list="h-destl" value="' + esc(st.dest || '') + '" placeholder="z. B. Werkstatt, Tankstelle, Kreisfeuerwehrzentrale" autocomplete="off" maxlength="200">' +
        '<datalist id="h-destl">' + (d.trip_purposes || []).map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist>' +
        '</div><div class="h-tc h-tcb"><div class="h-lbl">km-Stand am Ende' + (tank ? ' (optional)' : '') + '</div><input class="h-kmin" id="h-kmin" inputmode="numeric" value="' + (tkm === '' ? '' : esc(fmtKm(+tkm))) + '" placeholder="km-Stand" readonly>' +
        (tbad ? '<p style="color:var(--red);font-weight:700;margin:6px 0 0">Kleiner als der letzte Stand – bitte prüfen.</p>' : '') +
        '<div class="h-pad">' + ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map(function (k) { return '<button type="button" data-act="key" data-v="' + k + '">' + k + '</button>'; }).join('') + '</div>' +
        // Fahrer/in ist im Fahrtenbuch Pflicht: Suche wie in der Anwesenheitsliste, zuletzt Gefahrene als Vorschlag
        '</div><div class="h-tc h-tcc"><div class="h-lbl">Fahrer/in</div><input type="text" id="h-drvq" class="h-dest" placeholder="Name tippen" value="' + esc(st.drvq || '') + '" autocomplete="off"><div class="h-drv" id="h-drvl">' + drvChips() + '</div>' +
        '<div class="h-lbl">Getankt (Liter' + (tank ? '' : ', optional') + ')</div><input type="text" id="h-fuel" class="h-dest" style="max-width:220px" inputmode="decimal" value="' + esc(st.fuel || '') + '" placeholder="z. B. 62,5">' +
        '</div></div>' +
        (function () { var miss = []; if (!st.drv) miss.push('Fahrer/in'); if (tkm === '' && !tank) miss.push('km-Stand'); if (tbad) miss.push('km-Stand prüfen');
          return '<div class="h-row"><button type="button" class="h-btn" data-act="close">Abbrechen</button><span class="h-mu" style="margin-left:auto">' + (miss.length ? 'Fehlt: ' + miss.join(', ') : '') + '</span>' +
            '<button type="button" class="h-btn h-p" data-act="tripsave"' + (miss.length ? ' disabled' : '') + '>Speichern</button></div></div></div>'; })();
    }
    if (s.type === 'km') {
      var v = d.vehicles.filter(function (x) { return x.id === s.id; })[0];
      var drivers = d.parts.filter(function (p) { return p.incident_id === st.inc && norm(p.vehicle) === norm(v.name); });
      var km = st.km, bad = km !== '' && v.km != null && +km < v.km;
      return '<div class="h-dim" data-act="close"><div class="h-sheet" role="dialog" aria-modal="true"><h3>' + esc(v.name) + ': km-Stand</h3><p class="h-sub">' + esc(i.label) + ' · ' + (v.km != null ? 'zuletzt ' + fmtKm(v.km) + ' km' : 'noch kein km-Stand bekannt') + '</p>' +
        '<input class="h-kmin" id="h-kmin" inputmode="numeric" value="' + (km === '' ? '' : esc(fmtKm(+km))) + '" placeholder="km-Stand" readonly>' +
        (bad ? '<p style="color:var(--red);font-weight:700;margin:6px 0 0">Kleiner als der letzte Stand – bitte prüfen.</p>' : '') +
        '<div class="h-pad">' + ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map(function (k) { return '<button type="button" data-act="key" data-v="' + k + '">' + k + '</button>'; }).join('') + '</div>' +
        // Wer ist gefahren? Pflicht – erst die Besatzung des Fahrzeugs, sonst Namenssuche
        '<div class="h-lbl">Wer ist gefahren?</div>' + (drivers.length ? '<div class="h-vbtns">' + drivers.map(function (p) {
          var mm = member(p.member_id);
          return mm ? '<button type="button" style="font-size:18px" data-act="driver" data-id="' + mm.id + '" aria-pressed="' + (st.driver === mm.id) + '">' + esc(mm.name) + (roleList(p.role).indexOf('MA') >= 0 ? ' (MA)' : '') + '</button>' : '';
        }).join('') + '</div>' : '') +
        '<input type="text" id="h-drvq" class="h-dest" placeholder="' + (drivers.length ? 'oder anderen Namen tippen' : 'Name tippen') + '" value="' + esc(st.drvq || '') + '" autocomplete="off"><div class="h-drv" id="h-drvl">' + drvChips() + '</div>' +
        (function () { var miss = []; if (!st.driver && !st.drv) miss.push('Fahrer/in'); if (km === '') miss.push('km-Stand'); if (bad) miss.push('km-Stand prüfen');
          return '<div class="h-row"><button type="button" class="h-btn" data-act="close">Abbrechen</button><span class="h-mu" style="margin-left:auto">' + (miss.length ? 'Fehlt: ' + miss.join(', ') : '') + '</span>' +
            '<button type="button" class="h-btn h-p" data-act="kmsave"' + (miss.length ? ' disabled' : '') + '>Speichern</button></div></div></div>'; })();
    }
    return '';
  }

  function render() {
    if (!d) return;
    var q = document.getElementById('h-q'), focus = q && document.activeElement === q, pos = focus ? q.selectionStart : 0;
    // Automatisch zurück zur Ruhe: Einsatz mindestens 1 Stunde her, seit 30 Minuten nichts mehr eingetragen, kein Fahrzeug mehr auf Status 3/4/7/8 –
    // dann wieder das normale Dashboard; die Liste bleibt per Knopf erreichbar, bis das Zeitfenster endet
    var now = Date.now(), ageMin = function (iso) { return iso ? (now - new Date(String(iso).replace(' ', 'T')).getTime()) / 60000 : 1e9; };
    var busyV = d.vehicles.some(function (v) { return ['3', '4', '7', '8'].indexOf(String(v.fms)) >= 0 && !fmsStale(v); });
    var autoCalm = d.incidents.length > 0 && !st.force && !busyV && d.vehicles.some(function (v) { return v.fms; }) &&
      d.incidents.every(function (i) { return ageMin(i.start) >= 60 && ageMin(i.last_change || i.start) >= 30; });
    var open = d.incidents.length > 0 && !autoCalm;
    var css = document.getElementById('h-scrcss');
    if (!open && C.screenCfg && window.MYFScreen) {
      // Dashboard des Besprechungsraums direkt in der Seite (gleiche Daten, gleiche Darstellung); nur neu einsetzen, wenn es noch nicht da ist (kein Flackern)
      if (css) css.disabled = false;
      document.documentElement.classList.add('h-screen');
      if (!document.getElementById('h-scr')) { root.innerHTML = '<div id="h-scr"><div id="scr"></div></div><div id="h-over"></div>'; MYFScreen.mount(); }
      var qn = qGet().length;
      // Knöpfe (Liste, Demo, Netz-Hinweis) bekommen unten einen eigenen Streifen – sie verdecken nichts vom Dashboard
      document.documentElement.classList.toggle('h-hasfloat', !!(autoCalm || d.demo || qn || st.offline));
      document.getElementById('h-over').innerHTML = '<div class="h-float">' + (autoCalm ? d.incidents.slice(0, 2).map(function (x) { return '<button type="button" class="h-pick h-list-btn" data-act="pickinc" data-id="' + x.id + '">Liste: ' + esc(x.label) + ' <b>→</b></button>'; }).join('') : '') + (d.demo ? '<button type="button" class="h-pick h-demo-btn" data-act="demo">Demo · Szenario</button>' : '') + (qn ? '<span class="h-off">' + qn + (qn === 1 ? ' Eintrag wartet' : ' Einträge warten') + ' auf Netz</span>' : st.offline ? '<span class="h-off">offline</span>' : '') +
        (document.fullscreenEnabled && !document.fullscreenElement ? '<button type="button" class="h-fs" data-act="fs" aria-label="Vollbild" title="Vollbild"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>' : '') + '</div>' + sheet();
      return;
    }
    if (css) css.disabled = true;
    document.documentElement.classList.remove('h-screen', 'h-hasfloat');
    root.innerHTML = head() + (open ? '' : warnings()) + '<main class="h-main' + (open ? (st.mode === 'sheet' ? ' is-sheet' : '') : ' is-calm h-calm') + '">' +
      (open ? alarmBand() + attendance() + vehicles(false) : calm()) + '</main>' + sheet();
    var q2 = document.getElementById('h-q');
    if (q2 && focus) { q2.focus(); try { q2.setSelectionRange(pos, pos); } catch (e) {} }
  }

  root.addEventListener('input', function (e) { if (e.target.id === 'h-q') { st.q = e.target.value; poke(); render(); } if (e.target.id === 'h-fuel') st.fuel = e.target.value; if (e.target.id === 'h-dest') st.dest = e.target.value; if (e.target.id === 'h-nt') st.nt = e.target.value; if (e.target.id === 'h-ntime') st.ntime = e.target.value;
    if (e.target.id === 'h-drvq') { st.drvq = e.target.value; var dl = document.getElementById('h-drvl'); if (dl) dl.innerHTML = drvChips(); } });
  root.addEventListener('change', function (e) { if (e.target.id === 'h-drv') st.drv = +e.target.value || null; if (e.target.id === 'h-cert') certToggle(); });
  // Das Dashboard meldet: Fahrzeug angetippt bzw. „Fahrt eintragen“
  document.addEventListener('myf:pick', function () { if (!d) return; st.sheet = { type: 'pick' }; st.nt = ''; st.ntime = ''; poke(); render(); });
  document.addEventListener('myf:trip', function (e) {
    if (!d) return;
    st.sheet = { type: 'trip', vid: (e.detail && e.detail.vid) || null }; st.km = ''; st.fuel = ''; st.drv = null; st.drvq = ''; st.dest = ''; st.tkind = 'dienst'; poke(); render();
  });
  root.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]'); if (!t) return;
    var act = t.getAttribute('data-act'), id = +t.getAttribute('data-id'), v = t.getAttribute('data-v');
    // Klick auf den abgedunkelten Rand schließt, Klicks im Fenster nicht
    if (act === 'close' && t.classList.contains('h-dim') && e.target !== t) return;
    poke(); backLater();
    if (act === 'back') { history.back(); return; }
    if (act === 'fs') { var de = document.documentElement; if (de.requestFullscreen) de.requestFullscreen().catch(function () {}); return; }
    if (act === 'inc') { st.inc = id; st.veh = null; render(); return; }
    if (act === 'mode') { st.mode = v; st.veh = null; st.q = ''; render(); return; }
    if (act === 'who') { var pp = partOf(id); st.roles = pp ? roleList(pp.role) : []; st.sheet = { type: 'who', id: id }; render(); return; }
    if (act === 'close') { st.sheet = null; render(); return; }
    if (act === 'role') { var keep = sheetExtra(); st.roles = st.roles.indexOf(v) >= 0 ? st.roles.filter(function (r) { return r !== v; }) : st.roles.concat(v); render(); restoreExtra(keep); return; }
    if (act === 'veh') { var mid = st.sheet.id, ex = sheetExtra(); st.sheet = null; savePart(mid, v, st.roles, undefined, ex); return; }
    if (act === 'sheetsave') { var sp = partOf(st.sheet.id); if (!sp) return; var sx = sheetExtra(), smid = st.sheet.id; st.sheet = null; savePart(smid, sp.vehicle, st.roles, undefined, sx); return; }
    if (act === 'cross') {
      var xp = partOf(id);
      if (xp && xp.confirmed) { toast('err', 'Schon bestätigt – Änderungen über die Einsatzführung.'); return; }
      savePart(id, v, xp ? roleList(xp.role) : [], false); return;
    }
    if (act === 'qclear') { st.q = ''; render(); var qq = document.getElementById('h-q'); if (qq) qq.focus(); return; }
    if (act === 'unitf') { st.unitF = v || ''; render(); return; }
    if (act === 'az') { var row = document.getElementById('h-r' + id), box = document.getElementById('h-paper'); if (row && box) box.scrollTo({ top: row.offsetTop - 44, behavior: 'smooth' }); return; }
    if (act === 'out') { st.sheet = null; removePart(id).then(function () { toast('ok', 'Ausgetragen.'); }); return; }
    if (act === 'pickveh') { st.veh = st.veh === v ? null : v; render(); return; }
    if (act === 'crew') {
      var cp = partOf(id);
      if (cp && cp.confirmed) { toast('err', 'Schon bestätigt – Änderungen über die Einsatzführung.'); return; }
      if (cp && cp.vehicle === st.veh) { removePart(id); return; }
      savePart(id, st.veh, cp ? roleList(cp.role) : [], false); return;
    }
    if (act === 'crewrole') {
      var rp = partOf(id); if (!rp) return;
      var rs = roleList(rp.role); rs = rs.indexOf(v) >= 0 ? rs.filter(function (r) { return r !== v; }) : rs.concat(v);
      savePart(id, rp.vehicle, rs, false); return;
    }
    if (act === 'km') { st.sheet = { type: 'km', id: id }; st.km = ''; st.driver = null; st.drv = null; st.drvq = ''; render(); return; }
    // „ist zurück“: Status 2 von Hand setzen (Funkstatus vergessen)
    if (act === 'vehback') { if (!confirm('Fahrzeug ist zurück in der Halle – Status auf 2 setzen?')) return; api('/fms', { id: id, status: '2' }).then(function () { return load(); }).catch(function (e) { alert(e.message); }); return; }
    if (act === 'key') {
      if (v === 'C') st.km = ''; else if (v === '⌫') st.km = st.km.slice(0, -1); else if (st.km.length < 7) st.km = (st.km + v).replace(/^0+/, '');
      render(); return;
    }
    if (act === 'driver') { st.driver = st.driver === id ? null : id; st.drv = null; render(); return; }
    if (act === 'drvpick') { st.drv = st.drv === id ? null : id; st.driver = null; render(); return; }
    if (act === 'pick') { st.sheet = { type: 'pick' }; st.nt = ''; st.ntime = ''; render(); return; }
    if (act === 'copycrew') { st.sheet = { type: 'copy' }; render(); return; }
    if (act === 'copyfrom' && !st.busy) {
      var src = d.parts.filter(function (p) { return p.incident_id === id; }), target = st.inc;
      var have = {}; d.parts.forEach(function (p) { if (p.incident_id === target) have[p.member_id] = 1; });
      var todo = src.filter(function (p) { return !have[p.member_id]; });
      st.busy = true; st.sheet = null; render();
      todo.reduce(function (pr, p) { return pr.then(function () { return post('/part', { incident_id: target, member_id: p.member_id, vehicle: p.vehicle, role: p.role || '' }).catch(function () {}); }); }, Promise.resolve())
        .then(function () { st.busy = false; toast('ok', '✓ ' + todo.length + ' übernommen – bitte prüfen, wer wirklich mit war'); return load(); });
      return;
    }
    if (act === 'demo') { st.sheet = { type: 'demo' }; render(); return; }
    if (act === 'demostep' && !st.busy) {
      st.busy = true; st.force = null;
      api('/demo', { step: v }).then(function (r) { st.sheet = null; st.inc = null; toast('ok', '✓ ' + (r.message || 'Erledigt')); if (window.MYFScreen && MYFScreen.refresh) MYFScreen.refresh(); return load(); })
        .catch(function (err) { toast('err', err.message); }).then(function () { st.busy = false; });
      return;
    }
    if (act === 'pickinc') { st.force = id; st.inc = id; st.sheet = null; st.mode = 'sheet'; load().then(function () { if (d && !d.incidents.some(function (x) { return x.id === id; })) { st.force = null; toast('err', 'Für diesen Einsatz ist die Liste geschlossen – bitte bei der Einsatzführung melden.'); } render(); }); return; }
    if (act === 'unforce') { st.force = null; st.inc = null; st.sheet = null; if (fromScreen) { history.back(); return; } load(); return; }
    if (act === 'newinc' && !st.busy) {
      var nt = String(st.nt || '').trim(); if (nt.length < 3) { toast('err', 'Bitte ein Stichwort eingeben.'); return; }
      st.busy = true;
      api('/incident', { title: nt, start: st.ntime || nowLocal() }).then(function (r) {
        st.force = r.id; st.inc = r.id; st.sheet = null; st.mode = 'sheet'; toast('ok', r.existing ? 'Diesen Einsatz gibt es schon – Liste geöffnet.' : '✓ Einsatz angelegt – jetzt eintragen'); return load();
      }).catch(function (err) { toast('err', err.message); }).then(function () { st.busy = false; });
      return;
    }
    if (act === 'tripveh') { st.sheet = { type: 'trip', vid: id }; st.km = ''; st.fuel = ''; st.drv = null; st.dest = ''; st.tkind = st.tkind || 'dienst'; render(); return; }
    if (act === 'tkind') { st.tkind = v; render(); return; }
    if (act === 'tripsave' && !st.busy) {
      st.busy = true;
      var tvid = st.sheet.vid, tk = st.tkind || 'dienst', tkmv = st.km;
      post('/trip', { vehicle_id: tvid, kind: tk, purpose: String(st.dest || '').trim() || (C.tripKinds || {})[tk] || '', km_end: tkmv === '' ? null : +tkmv, fuel_l: String(st.fuel || '').replace(',', '.'), driver_id: st.drv || 0 }).then(function (res) {
        var veh = d.vehicles.filter(function (x) { return x.id === tvid; })[0]; if (veh && tkmv !== '') veh.km = +tkmv;
        st.sheet = null; st.km = ''; st.fuel = ''; st.drv = null; st.dest = ''; render();
        toast('ok', res && res.queued ? '✓ Fahrt gespeichert – wird übertragen, sobald das Netz wieder da ist' : '✓ Fahrt im Fahrtenbuch eingetragen');
      }).catch(function (err) { toast('err', err.message); }).then(function () { st.busy = false; });
      return;
    }
    if (act === 'kmsave' && !st.busy) {
      st.busy = true;
      var vid = st.sheet.id;
      post('/trip', { vehicle_id: vid, incident_id: st.inc, km_end: +st.km, driver_id: st.driver || st.drv || 0 }).then(function () {
        d.trips_done[st.inc + '-' + vid] = +st.km; st.sheet = null; render(); toast('ok', '✓ km-Stand gespeichert'); return load();
      }).catch(function (err) { toast('err', err.message); }).then(function () { st.busy = false; });
    }
  });

  // Uhr jede Sekunde, Daten alle 20 Sekunden (nicht während jemand gerade auswählt oder tippt)
  setInterval(function () { var c = document.getElementById('h-clock'), n = new Date(); if (c) c.textContent = ('0' + n.getHours()).slice(-2) + ':' + ('0' + n.getMinutes()).slice(-2); }, 1000);
  setInterval(function () { if (!st.sheet && !st.busy && !(document.activeElement && document.activeElement.id === 'h-q')) load(); }, 20000);
  backLater();
  load();
})();
