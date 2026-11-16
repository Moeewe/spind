/* SPIND – Mitgliederseite (angemeldet mit eigenem Konto) */
(function () {
  'use strict';
  var ORG = ((window.MYF && MYF.org) || {}).name || 'Freiwillige Feuerwehr';
  var APP = (window.MYF && MYF.app) || 'SPIND';

  var root = document.getElementById('ffl');
  if (root && window.MYFForm) MYFForm.track(root);
  if (!root || !window.MYF) return;

  // Gleiche Begriffe und Farben wie in der Verwaltung
  var NEED = { open: ['Gemeldet', 'open'], assigned: ['Zugeteilt', 'ok'], waiting: ['Warteliste', 'warn'], declined: ['Abgelehnt', 'no'],
    withdrawn: ['Zurückgetreten', 'no'], completed: ['Absolviert', 'done'], missed: ['Nicht teilgenommen', 'bad'] };
  var CLOTH = { open: ['Gemeldet', 'open'], ordered: ['Bestellt', 'warn'], issued: ['Ausgegeben', 'ok'], declined: ['Abgelehnt', 'no'], withdrawn: ['Zurückgezogen', 'no'] };
  var IDEA = { 'new': ['Neu', 'open'], progress: ['In Bearbeitung', 'warn'], done: ['Erledigt', 'ok'], declined: ['Nicht umgesetzt', 'no'], withdrawn: ['Zurückgezogen', 'no'] };
  var REASONS = { ersatz: ['Defekt', 'Verschlissen', 'Passt nicht mehr', 'Verloren', 'Sonstiges'], neu: ['Fehlt bisher', 'Neue Funktion / Aufgabe', 'Sonstiges'] };
  var MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  var WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

  var LS = 'myf.';
  function load(k) { try { return localStorage.getItem(LS + k) || ''; } catch (e) { return ''; } }
  function save(k, v) { try { localStorage.setItem(LS + k, v); } catch (e) {} }

  var d = null;
  // Nach dem Anmelden immer „Start“ – die zuletzt offene Seite gilt nur beim Neuladen (steht dann in der Adresse: ?seite=…)
  var st = { tab: 'start', msg: null, calMine: load('calMine') !== '0', ckind: 'ersatz', busy: false, durg: 'soon', photos: [] };
  // QR-Code am Fahrzeug: …/myfeuerwehr/?mangel=HLF20 öffnet direkt die Mängelmeldung
  var qp = new URLSearchParams(location.search);
  if (qp.get('geraet')) st.tab = 'start'; // QR am Gerät: Gerätekarte steht auf Start
  if (qp.get('fahrt')) { st.tab = 'trips'; st.tripVeh = +qp.get('fahrt'); } // QR im Fahrzeug (alt): Fahrtenbuch mit diesem Fahrzeug
  if (qp.get('fz')) { st.tab = 'car'; st.carId = +qp.get('fz'); } // ein QR-Code je Fahrzeug: Fahrt eintragen, Mangel melden, buchen
  // Direktlinks auf Seiten (QR-Aushänge, Home-Bildschirm): ?seite=fahrtenbuch, buchen, maengel, dabei, dienste, lehrgaenge
  var SEITE = { vorlagen: 'cd', bestellen: 'orders', start: 'start', postfach: 'inbox', profil: 'profile', fahrtenbuch: 'trips', buchen: 'vehicle', maengel: 'defects', dabei: 'incidents', einsaetze: 'incidents', dienste: 'duties', dienstplan: 'duties', abfragen: 'asks',
    aushaenge: 'board', lehrgaenge: 'courses', unterlagen: 'materials', termine: 'calendar', kleidung: 'clothing', anregungen: 'ideas', hinweise: 'notices', atemschutz: 'agt' };
  // Umgekehrt: Reiter → Wort in der Adresse (jede Seite hat einen festen Link, Neuladen bleibt auf dem Reiter, Links lassen sich weitergeben)
  var SEITE_OF = {}; Object.keys(SEITE).forEach(function (k) { if (!SEITE_OF[SEITE[k]]) SEITE_OF[SEITE[k]] = k; });
  var REITER = { open: 'offen', lead: 'fuehrung', self: 'meine' }, REITER_OF = { offen: 'open', fuehrung: 'lead', meine: 'self' };
  if (SEITE[qp.get('seite')]) st.tab = SEITE[qp.get('seite')];
  if (qp.get('mangel') !== null) { st.tab = 'defects'; st.defObj = qp.get('mangel'); }
  // QR-Code „Einsatzbericht“: …/myfeuerwehr/?bericht=1 öffnet die Einsätze (Einsatzführung: neuester Einsatz)
  if (qp.get('bericht') !== null) { st.tab = 'incidents'; st.wantReport = true; }
  // Aus der Verwaltung: …?einsatz=ID öffnet genau diesen Bericht, …?reiter=fuehrung den Reiter „Einsatzführung & Berichte“
  if (+(qp.get('ebericht') || qp.get('einsatz'))) { st.tab = 'incidents'; st.isub = 'lead'; st.openRepId = +(qp.get('ebericht') || qp.get('einsatz')); st.wantReport = false; }
  if (REITER_OF[qp.get('reiter')]) { st.tab = 'incidents'; st.isub = REITER_OF[qp.get('reiter')]; }
  // Direkt zu einem Einsatz (Link aus der Alarm-Benachrichtigung): Einsatzführung → Bearbeitung, sonst „Ich war dabei“
  if (load('full') === '1') { st.full = true; root.classList.add('ffl-full'); document.documentElement.classList.add('ffl-noscroll'); }
  if (qp.get('eid')) { st.tab = 'incidents'; st.wantInc = +qp.get('eid'); st.wantRep = qp.get('r') === '1'; }
  // Aus der Verwaltung auf derselben Seite (ohne neu zu laden): gleiche Ziele wie die Direktlinks oben
  // Menü klebt oben (Handy): Fläche darüber füllen, damit beim Scrollen nichts durchscheint
  function navStuck() { var n = root.querySelector('.ffl-nav'); if (n) n.classList.toggle('is-stuck', window.scrollY > 0 && n.getBoundingClientRect().top <= 0.5); }
  window.addEventListener('scroll', navStuck, { passive: true }); window.addEventListener('resize', navStuck);
  new MutationObserver(function () { navStuck(); }).observe(root, { childList: true });
  window.MYFPortalGo = function (q) {
    var p = new URLSearchParams(q); st.inc = null; st.report = null; st.repView = null; st.pform = null;
    if (+(p.get('ebericht') || p.get('einsatz'))) { st.tab = 'incidents'; st.isub = 'lead'; st.openRepId = +(p.get('ebericht') || p.get('einsatz')); }
    else if (+p.get('eid')) { st.tab = 'incidents'; st.isub = 'lead'; st.wantInc = +p.get('eid'); } // Einsatzseite der Führung (z. B. Teilnahme bestätigen)
    else if (p.get('reiter')) { st.tab = 'incidents'; st.isub = p.get('reiter') === 'offen' ? 'open' : 'lead'; }
    else if (SEITE[p.get('seite')]) st.tab = SEITE[p.get('seite')];
    save('tab', st.tab); window.scrollTo(0, root.offsetTop - 20); return reload();
  };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function api(method, path, body) {
    return fetch(MYF.api + path, {
      method: method, credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': MYF.nonce },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401 || (j.code === 'rest_cookie_invalid_nonce')) { location.reload(); throw new Error('Bitte neu anmelden.'); }
        if (!r.ok) throw new Error(j.message || 'Fehler ' + r.status);
        return j;
      });
    });
  }
  function reload() {
    var qs = [qp.get('geraet') ? 'geraet=' + encodeURIComponent(qp.get('geraet')) : '', st.iYear ? 'iyear=' + st.iYear : ''].filter(Boolean).join('&');
    return api('GET', 'me' + (qs ? '?' + qs : '')).then(function (j) {
      d = j; st.offline = !!j._offline; MYFUI.release = j.release || MYFUI.release;
      // Ohne zugeordnetes Mitglied (oder alter Offline-Stand): nie an d.member scheitern
      if (!d.member) d.member = { id: 0, name: (d.who && d.who.name) || '', unit: '' };
      if (st.openRepId) { var rid = st.openRepId; st.openRepId = 0; setTimeout(function () { incidentClick('repopen', root, rid); }, 0); }
      if (st.wantReport) {
        // QR „Ich war dabei / Bericht“: Einsatzführung landet im neuesten Einsatz ohne Bericht (7 Tage) – direkt im Formular
        st.wantReport = false;
        if (d.incident_manage) {
          // Neuester Einsatz bleibt Ziel, solange noch kein Bericht da ist oder ich selbst daran schreibe (QR später erneut gescannt);
          // hat ihn jemand anderes schon geschrieben, der neueste Einsatz ohne Bericht
          var recent = d.manage.incidents.filter(function (x) { return x.kind === 'einsatz' && x.source !== 'test' && x.start >= addDays(today(), -7); });
          var open = recent[0] && (!recent[0].has_report || recent[0].report_by === d.member.name) ? recent[0] : recent.filter(function (x) { return !x.has_report && !x.report_closed; })[0];
          if (open) { st.wantInc = open.id; st.wantRep = true; } else if (d.manage.incidents.length) st.inc = d.manage.incidents[0].id;
        }
      }
      if (st.wantInc) {
        var wi = st.wantInc; st.wantInc = null;
        if (d.incident_manage && d.manage.incidents.some(function (x) { return x.id === wi; })) {
          st.inc = wi;
          if (st.wantRep) { st.wantRep = false; api('GET', 'me/incident/report?id=' + wi).then(function (rr) {
            st.reportData = rr.report || {}; st.report = wi; render();
            // Direktlink (QR, Mail): Website-Kopf überspringen, gleich das Formular zeigen
            var rh = root.querySelector('.ffl-rephead'); if (rh) window.scrollTo(0, Math.max(0, rh.getBoundingClientRect().top + window.pageYOffset - 70));
          }); }
        }
        else if ((d.incidents || []).some(function (x) { return x.id === wi && selfOk(x); }) && !myPart(wi)) st.pform = wi;
      }
      render();
    });
  }
  function note(type, text) { st.msg = { type: type, text: text }; render(); setTimeout(function () { if (st.msg && st.msg.text === text) { st.msg = null; render(); } }, 4500); }

  function addDaysIso(iso, n) { var p = iso.split('-'); return new Date(Date.UTC(+p[0], p[1] - 1, +p[2] + n)).toISOString().slice(0, 10); }
  function today() { var t = new Date(); return t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2); }
  // Kurzes Datum: „24.10.“ im laufenden Jahr, sonst mit Jahr „12.01.27“
  function dShort(iso) { if (!iso) return ''; var p = String(iso).slice(0, 10).split('-'); return p[2] + '.' + p[1] + '.' + (+p[0] !== new Date().getFullYear() ? p[0].slice(2) : ''); }
  function fmtDate(iso) { if (!iso) return ''; var p = iso.slice(0, 10).split('-'); return p[2] + '.' + p[1] + '.' + p[0]; }
  // Ablauf eines Lehrgangstermins: einzelne Tage mit Uhrzeit, Hinweis Tagesdienst (Arbeitgeber)
  function sesDay(x) { return !x.length ? '' : x.some(function (y) { var w = new Date(y.d + 'T12:00:00').getDay(); return w >= 1 && w <= 5 && (!y.f || y.f < '16:00'); }) ? 'tag' : 'abend'; }
  function sesHtml(dt) {
    var ses = dt.sessions || [], k = dt.daytime || sesDay(ses);
    if (!ses.length && !k) return '';
    return (k ? '<div style="margin-top:6px"><span class="ffl-chip ' + (k === 'tag' ? 'st-warn' : 'st-open') + '">' + (k === 'tag' ? 'Tagesdienst – bitte beim Arbeitgeber freistellen lassen' : 'abends & am Wochenende') + '</span></div>' : '') +
      (ses.length ? '<ul class="ffl-seslist">' + ses.map(function (y) { return '<li><b>' + WD[new Date(y.d + 'T12:00:00').getDay()] + ' ' + dShort(y.d) + '</b> ' + esc(y.f ? y.f + (y.t ? '–' + y.t : '') + ' Uhr' : '') + '</li>'; }).join('') + '</ul>' : '');
  }
  function range(x) {
    if (!x) return '';
    if (x.start) {
      var a = x.start.split('-'), b = (x.end || x.start).split('-');
      if (x.start === (x.end || x.start)) return fmtDate(x.start);
      return a[2] + '.' + (a[1] === b[1] ? '' : a[1] + '.') + '–' + b[2] + '.' + b[1] + '.' + b[0];
    }
    return x.period || '';
  }
  function tag(map, s) { var t = map[s] || [s, 'open']; return '<span class="ffl-chip st-' + t[1] + '">' + t[0] + '</span>'; }
  function firstName() { var n = String((d.member && d.member.name) || ''); return d.first_name || (n.split(',')[1] || n).trim().split(' ')[0]; }
  function addDays(iso, n) { var p = iso.split('-'); return new Date(Date.UTC(+p[0], p[1] - 1, +p[2] + n)).toISOString().slice(0, 10); }
  function dateById(id) { return d.my_dates.concat(d.dates).filter(function (x) { return x.id === id; })[0]; }
  function curNeeds() { return d.needs.filter(function (n) { return n.year === d.settings.year; }); }

  // ---- Grundgerüst -----------------------------------------------------------
  var ICONS = MYFUI.icons;
  // Vollbild: Mitgliederbereich als eigene Ebene über der Website (wie eine App)
  function setFull(on) {
    st.full = on;
    root.classList.toggle('ffl-full', on);
    document.documentElement.classList.toggle('ffl-noscroll', on);
    try { if (on && document.documentElement.requestFullscreen && window.innerWidth > 700) document.documentElement.requestFullscreen().catch(function () {}); else if (!on && document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
    save('full', on ? '1' : '0');
    render();
  }
  document.addEventListener('fullscreenchange', function () { if (!document.fullscreenElement && st.full && window.innerWidth > 700) { st.full = false; root.classList.remove('ffl-full'); document.documentElement.classList.remove('ffl-noscroll'); save('full', '0'); render(); } });
  // Hauptmenü (Gruppen) und Untermenü – wenige, klare Punkte; auf dem Handy wischbar
  function nav() {
    var g = [['start', 'Start', [['start', 'Start']]], ['incidents', 'Einsätze', [['incidents', 'Einsätze']]],
      ['plan', 'Termine', [['calendar', 'Kalender'], ['duties', 'Dienstplan'], ['asks', 'Abfragen'], ['board', 'Aushänge']].concat(can('orders') ? [['orders', 'Bestellen']] : []).concat((d.bookable || []).length ? [['vehicle', 'Fahrzeug buchen']] : [])],
      ['courses', 'Lehrgänge', [['courses', 'Lehrgänge']].concat((d.materials || []).length ? [['materials', 'Unterlagen']] : [])],
      ['report', 'Melden', [['defects', 'Mängel'], ['ideas', 'Anregungen'], ['clothing', 'Kleidung']].concat(d.trip_vehicles ? [['trips', 'Fahrtenbuch']] : []).concat(d.can_notice ? [['notices', 'Hinweise']] : [])]];
    if (d.agt) g.push(['agt', 'Atemschutz', [['agt', 'Atemschutz']]]);
    if (hasTasks()) g.splice(1, 0, ['tasks', 'Aufgaben', [['tasks', 'Meine Aufgaben']]]);
    g.push(['profile', 'Profil', [['profile', 'Profil']].concat(d.cd ? [['cd', 'Vorlagen & Logos']] : [])]);
    return g;
  }
  function tabs() { var t = []; nav().forEach(function (g) { t = t.concat(g[2]); }); return t; }
  function render() {
    if (!d) return;
    if (st.tab !== 'inbox' && st.tab !== 'car' && !tabs().some(function (t) { return t[0] === st.tab; })) st.tab = 'start';
    var N = nav(), grp = N.filter(function (g) { return g[2].some(function (t) { return t[0] === st.tab; }); })[0];
    var title = st.tab === 'start' ? 'Moin ' + esc(firstName()) + '!' : st.tab === 'inbox' ? 'Postfach' : st.tab === 'car' ? 'Fahrzeug' : esc((tabs().filter(function (t) { return t[0] === st.tab; })[0] || [0, APP])[1]);
    var h = '<div class="ffl-head"><h2 class="ffl-tagline"><span>' + title + '</span></h2>' +
      '<div class="ffl-headr"><button type="button" class="ffl-iconbtn ffl-bell" data-act="inbox" aria-label="Postfach" title="Postfach">' + ICONS.bell + (unread() ? '<span>' + unread() + '</span>' : '') + '</button>' +
      MYFUI.themeBtn().replace('class="ffl-iconbtn"', 'class="ffl-iconbtn ffl-hdopt"') + '<button type="button" class="ffl-iconbtn ffl-hdopt" data-act="fullscreen" aria-label="Vollbild" title="' + (st.full ? 'Vollbild beenden' : 'Vollbild') + '">' + (st.full ? ICONS.shrink : ICONS.expand) + '</button>' +
      (MYF.admin ? '<button type="button" class="ffl-btn ffl-sm ffl-adminbtn" data-act="openadmin" aria-label="Verwaltung" title="Verwaltung">' + ICONS.admin + '<span>Verwaltung</span></button>' : '') +
      MYFUI.who(d.who || { name: d.member.name }, 'myprofile') + '</div></div>' + (d.demo ? '<div class="ffl-demostrip">Demo-Bestand – alle Namen, Einsätze und Fahrten sind erfunden' + (d.demo_view ? ' <button type="button" class="ffl-sm" data-act="demoview">Zurück zu echten Daten</button> <button type="button" class="ffl-sm" data-act="demooff">Demo beenden &amp; alles löschen</button>' : '') + '</div>' : '');
    h += '<nav class="ffl-nav' + (grp && grp[2].length > 1 ? ' has-sub' : '') + '" aria-label="Bereiche"><div class="ffl-tabs" role="tablist">' + N.map(function (g) {
      return '<button type="button" role="tab" class="is-' + g[0] + '" data-tab="' + (g === grp ? st.tab : g[2][0][0]) + '" aria-selected="' + (g === grp) + '"><i class="ffl-ni">' + (ICONS['n_' + g[0]] || ICONS.n_report) + '</i><span' + (g[0] === 'agt' ? ' data-s="AGT"' : '') + '>' + esc(g[1]) + '</span>' + (g[0] === 'tasks' && (st.taskN || 0) + leadItems(function () {}) ? '<em class="ffl-navn">' + ((st.taskN || 0) + leadItems(function () {})) + '</em>' : '') + '</button>';
    }).join('') + '</div>' + (grp && grp[2].length > 1 ? '<div class="ffl-subnav" role="tablist">' + grp[2].map(function (t) {
      return '<button type="button" role="tab" data-tab="' + t[0] + '" aria-selected="' + (st.tab === t[0]) + '">' + esc(t[1]) + '</button>';
    }).join('') + '</div>' : '') + '</nav>';
    if (st.msg) h += '<div class="ffl-msg ' + st.msg.type + '">' + esc(st.msg.text) + '</div>';
    if (st.fb) h += feedbackBox();
    if (!navigator.onLine) h += '<div class="ffl-msg warn">Kein Internet – du siehst den zuletzt geladenen Stand. Ändern geht erst wieder online.</div>';
    h += ({ cd: function () { return MYFCD.html(d.cd); }, start: vStart, tasks: vTasks, orders: vOrders, asks: vAsks, courses: vCourses, calendar: vCalendar, clothing: vClothing, defects: vDefects, incidents: vIncidents, ideas: vIdeas, inbox: vInbox, vehicle: vVehicle, car: vCar, materials: vMaterials, trips: vTrips, duties: vDuties, board: vBoard, agt: vAgt, notices: vNotices, profile: vProfile })[st.tab]();
    h += MYFUI.foot(d.foot);
    if (st.dutyOpen) h += dutySheet();
    MYFForm.paint(root, h);
    root.classList.add('has-bnav');
    // Aktiven Menüpunkt sichtbar halten (waagerecht scrollbare Leisten auf dem Handy)
    [].forEach.call(root.querySelectorAll('.ffl-nav .ffl-tabs, .ffl-nav .ffl-subnav'), function (bar) {
      var on = bar.querySelector('[aria-selected=true]');
      if (on && (on.offsetLeft + on.offsetWidth > bar.scrollLeft + bar.clientWidth - 30 || on.offsetLeft < bar.scrollLeft)) bar.scrollLeft = on.offsetLeft - 20;
    });
    syncUrl();
  }
  // Adresse an den aktuellen Reiter anpassen (ohne Neuladen, ohne Verlaufseinträge): Neuladen und Lesezeichen landen wieder hier
  function syncUrl() {
    try {
      var u = new URL(location.href), keep = ['geraet', 'mangel', 'eid', 'r'];
      [].slice.call(u.searchParams.keys()).forEach(function (k) { if (keep.indexOf(k) < 0) u.searchParams.delete(k); });
      if (st.tab === 'car' && st.carId) u.searchParams.set('fz', st.carId);
      else if (st.tab !== 'start' && SEITE_OF[st.tab]) u.searchParams.set('seite', SEITE_OF[st.tab]);
      if (st.tab === 'incidents' && st.isub && REITER[st.isub]) u.searchParams.set('reiter', REITER[st.isub]);
      var next = u.pathname + (u.search || '') + u.hash;
      if (next !== location.pathname + location.search + location.hash) history.replaceState(null, '', next);
    } catch (e) {}
  }

  // ---- Start -----------------------------------------------------------------
  function agtState() {
    if (!d.agt) return null;
    var now = today(), last = d.agt.log.filter(function (l) { return l.kind === 'strecke' && l.date <= now; })[0];
    var due = last ? addDays(last.date, 365) : null;
    // Zweiter Nachweis (wenn die Wehr es so eingestellt hat): Übung oder Einsatz unter Atemschutz oder eine zweite
    // Übungsstrecke in den letzten 12 Monaten – dieselbe Regel wie in der Verwaltung und in der App
    var past = d.agt.log.filter(function (l) { return l.date <= now; }), strs = past.filter(function (l) { return l.kind === 'strecke'; });
    var prax = past.filter(function (l) { return l.kind === 'uebung' || l.kind === 'einsatz'; })[0];
    var sec = [prax ? prax.date : '', strs[1] ? strs[1].date : ''].sort().pop(), due2 = sec ? addDays(sec, 365) : null, need = !!d.agt.second;
    return { last: last, due: due, over: !due || due < now, soon: due && due >= now && due < addDays(now, 60),
      need: need, sec: sec, due2: due2, over2: need && (!due2 || due2 < now), soon2: need && !!due2 && due2 >= now && due2 < addDays(now, 60) };
  }
  // Einsatzbereit unter Atemschutz: Lehrgang, gültige G26, Übungsstrecke – und ggf. der zweite Nachweis
  function agtReady(s) { var a = d.agt; return !!a && a.course !== false && !!a.g26_until && a.g26_until >= today() && !!s.last && !s.over && !s.over2; }
  // Bestellrunden: Der Name kommt vom Konto, der Preis von der Karte; das Geld wird am Abend eingesammelt
  function eur(c) { return (c / 100).toFixed(2).replace('.', ',') + ' €'; }
  function vOrders() {
    var rs = d.orders || [];
    return orderForms() + (rs.length ? '' : '<p class="ffl-mu" style="margin-top:14px">Gerade läuft keine Bestellrunde.</p>') + rs.map(function (r) {
      var sum = r.mine.reduce(function (a, x) { return a + x.cents * x.qty; }, 0);
      var h = '<div class="ffl-sec"><div class="ffl-sh">' + esc(r.title) + '<em>' + (r.open ? 'bis ' + dt(r.deadline) : r.ordered ? 'bestellt' : 'Bestellschluss vorbei') + '</em></div>' + (r.owner ? '' : '<p class="ffl-mu" style="margin:0 0 4px">gestartet von ' + esc(r.by) + '</p>') +
        (r.menu.name ? '<p class="ffl-mu" style="margin-top:0">' + esc(r.menu.name) + (r.menu.link ? ' · <a href="' + esc(r.menu.link) + '" target="_blank" rel="noopener">Karte ansehen ↗</a>' : '') + '</p>' : '');
      h += '<div class="ffl-fl">Meine Bestellung</div>' + (r.mine.length ? '<div class="ffl-todos">' + r.mine.map(function (x) {
        return '<div class="ffl-todo"><div class="ffl-day">' + eur(x.cents * x.qty) + '</div><div class="ffl-ct"><b>' + x.qty + ' × ' + esc(x.name) + '</b>' + (x.note ? '<div class="ffl-mu">' + esc(x.note) + '</div>' : '') + (x.paid ? '<div class="ffl-mu">bezahlt</div>' : '') + '</div>' +
          (r.open ? '<div class="ffl-row" style="gap:6px"><button type="button" class="ffl-sm" data-act="omqty" data-id="' + x.id + '" data-v="' + (x.qty - 1) + '" aria-label="Eins weniger">−</button><button type="button" class="ffl-sm" data-act="omqty" data-id="' + x.id + '" data-v="' + (x.qty + 1) + '" aria-label="Eins mehr">+</button><button type="button" class="ffl-sm ffl-q" data-act="omnote" data-id="' + x.id + '">Notiz</button></div>' : '') + '</div>';
      }).join('') + '</div><p style="margin:8px 0 0"><b>Summe ' + eur(sum) + '</b></p>' : '<p class="ffl-mu" style="margin-top:0">Noch nichts bestellt.</p>');
      if (r.owner) h += orderOwner(r);
      if (!r.open) return h + '</div>';
      var cats = {}, order = [];
      (r.menu.items || []).forEach(function (x) { var c = x.cat || ''; if (!cats[c]) { cats[c] = []; order.push(c); } cats[c].push(x); });
      order.forEach(function (c) {
        h += (c ? '<div class="ffl-fl" style="margin-top:14px">' + esc(c) + '</div>' : '') + '<div class="ffl-todos">' + cats[c].map(function (x) {
          return '<div class="ffl-todo"><div class="ffl-day">' + eur(x.cents) + '</div><div class="ffl-ct">' + esc(x.name) + '</div><button type="button" class="ffl-sm ffl-p" data-act="omadd" data-id="' + r.id + '" data-v="' + esc(x.k) + '">Hinzufügen</button></div>';
        }).join('') + '</div>';
      });
      if (r.free) h += '<div class="ffl-fl" style="margin-top:14px">Etwas anderes</div><div class="ffl-row"><input type="text" class="ffl-grow" id="myf-of-n' + r.id + '" aria-label="Was möchtest du?" placeholder="Was möchtest du?"><input type="text" id="myf-of-p' + r.id + '" aria-label="Preis" placeholder="9,50" style="width:90px"><input type="number" id="myf-of-q' + r.id + '" aria-label="Menge" value="1" min="1" max="50" style="width:70px"><button type="button" class="ffl-sm ffl-p" data-act="omfree" data-id="' + r.id + '">Hinzufügen</button></div>';
      return h + '</div>';
    }).join('');
  }
  // Runde starten oder Karte vorschlagen. Einmalige Liste gilt nur für diese Runde, dauerhafte Karten erst nach Freigabe durch die LZ-Leitung.
  function orderForms() {
    if (!can('orders_start')) return '';
    var props = (d.my_card_props || []).map(function (m) { return '<div class="ffl-todo"><div class="ffl-day ffl-dot"></div><div class="ffl-ct"><b>' + esc(m.name) + '</b><div class="ffl-mu">' + (m.status === 'pending' ? 'wartet auf die Freigabe durch die LZ-Leitung' : 'abgelehnt' + (m.note ? ': ' + esc(m.note) : '')) + '</div></div><button type="button" class="ffl-sm ffl-q" data-act="omwd" data-id="' + m.id + '">' + (m.status === 'pending' ? 'Zurückziehen' : 'Entfernen') + '</button></div>'; }).join('');
    var h = '<div class="ffl-row" style="margin-top:14px"><button type="button" class="ffl-sm' + (st.orForm === 'round' ? '' : ' ffl-p') + '" data-act="oform" data-v="round">Runde starten</button><button type="button" class="ffl-sm" data-act="oform" data-v="card">Karte vorschlagen</button></div>';
    if (st.orForm === 'round') {
      var dr = (d.drills || []).filter(function (x) { return x.title; }).slice(0, 6);
      h += '<div class="ffl-pbox" style="margin-top:12px"><div class="ffl-form2"><div><label class="ffl-fl" for="myf-on-t">Titel</label><input type="text" id="myf-on-t" list="myf-on-tl" placeholder="z. B. Pizza nach dem Dienstabend"><datalist id="myf-on-tl">' + dr.map(function (x) { return '<option value="Pizza: ' + esc(x.title) + '">'; }).join('') + '</datalist></div>' +
        '<div><label class="ffl-fl" for="myf-on-d">Bestellschluss</label><input type="datetime-local" id="myf-on-d"></div>' +
        '<div class="span2"><label class="ffl-fl" for="myf-on-m">Karte</label><select id="myf-on-m"><option value="">Einmalige Liste oder freie Eingabe</option>' + (d.order_cards || []).map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + ' (' + c.n + ')</option>'; }).join('') + '</select></div></div>' +
        '<details style="margin-top:10px"><summary class="ffl-mu">Einmalige Liste eintragen</summary><label class="ffl-fl" for="myf-on-n">Name der Pizzeria oder Liste</label><input type="text" id="myf-on-n"><label class="ffl-fl" for="myf-on-i">Eine Zeile je Gericht: Kategorie | Gericht | Preis</label><textarea id="myf-on-i" rows="5" placeholder="Pizza | Salami | 8,50"></textarea>' +
        '<label class="ffl-check" style="margin-top:6px"><input type="checkbox" id="myf-on-p"> zusätzlich als dauerhafte Karte vorschlagen</label></details>' +
        '<label class="ffl-check" style="margin-top:10px"><input type="checkbox" id="myf-on-f"> freie Eingabe erlauben (jeder trägt Gericht und Preis selbst ein)</label>' +
        '<p class="ffl-mu">Die Runde erscheint bei allen auf der Startseite. Du siehst Namen und Beträge und sammelst das Geld ein. Danach löschst du die Liste, sonst verschwindet sie 3 Tage nach dem Bestellschluss von selbst.</p>' +
        '<div class="ffl-row"><button type="button" class="ffl-p" data-act="onew">Runde starten</button><button type="button" class="ffl-q" data-act="oform" data-v="">Abbrechen</button></div></div>';
    }
    if (st.orForm === 'card') h += '<div class="ffl-pbox" style="margin-top:12px"><p class="ffl-mu" style="margin-top:0">Die LZ-Leitung prüft den Vorschlag. Danach steht die Karte allen zur Verfügung.</p><div class="ffl-form2"><div><label class="ffl-fl" for="myf-oc-n">Name</label><input type="text" id="myf-oc-n"></div><div><label class="ffl-fl" for="myf-oc-p">Telefon</label><input type="text" id="myf-oc-p"></div></div>' +
      '<label class="ffl-fl" for="myf-oc-i">Eine Zeile je Gericht: Kategorie | Gericht | Preis</label><textarea id="myf-oc-i" rows="7" placeholder="Pizza | Salami | 8,50"></textarea><div class="ffl-row" style="margin-top:10px"><button type="button" class="ffl-p" data-act="ocsave">Vorschlagen</button><button type="button" class="ffl-q" data-act="oform" data-v="">Abbrechen</button></div></div>';
    if (props) h += '<div class="ffl-sec"><div class="ffl-sh">Meine Karten-Vorschläge</div><div class="ffl-todos">' + props + '</div></div>';
    return h;
  }
  // Eigene Runde: bestellen, abrechnen, Bestellschluss
  function orderOwner(r) {
    var items = r.items || [], by = {}, ppl = [], gr = {}, grp = [];
    items.forEach(function (x) {
      if (!by[x.member_id]) { by[x.member_id] = { name: x.member, items: [], sum: 0, open: false }; ppl.push(by[x.member_id]); } var p = by[x.member_id]; p.items.push(x); p.sum += x.cents * x.qty; if (!x.paid) p.open = true;
      var k = x.name + '|' + x.cents; if (!gr[k]) { gr[k] = { name: x.name, qty: 0, notes: [] }; grp.push(gr[k]); } gr[k].qty += x.qty; if (x.note) gr[k].notes.push(x.qty + ' × ' + x.note);
    });
    var total = items.reduce(function (a, x) { return a + x.cents * x.qty; }, 0);
    var h = '<div class="ffl-fl" style="margin-top:14px">Meine Runde: Bestellung für den Lieferdienst</div>' + (r.menu.phone ? '<p style="margin:0 0 6px"><a href="tel:' + esc(r.menu.phone.replace(/[^+\d]/g, '')) + '">' + esc(r.menu.phone) + '</a></p>' : '') + (grp.length ? '<div class="ffl-todos">' + grp.map(function (g) { return '<div class="ffl-todo"><div class="ffl-day">' + g.qty + ' ×</div><div class="ffl-ct"><b>' + esc(g.name) + '</b>' + (g.notes.length ? '<div class="ffl-mu">' + esc(g.notes.join(' · ')) + '</div>' : '') + '</div></div>'; }).join('') + '</div><p style="margin:8px 0 0"><b>Gesamt ' + eur(total) + '</b></p>' : '<p class="ffl-mu" style="margin-top:0">Noch niemand eingetragen.</p>');
    if (ppl.length) h += '<div class="ffl-fl" style="margin-top:14px">Einsammeln</div><div class="ffl-todos">' + ppl.map(function (p) { return '<div class="ffl-todo' + (p.open ? '' : ' is-done') + '"><div class="ffl-day">' + eur(p.sum) + '</div><div class="ffl-ct"><b>' + esc(p.name) + '</b><div class="ffl-mu">' + p.items.map(function (x) { return x.qty + ' × ' + esc(x.name); }).join(', ') + '</div></div><button type="button" class="ffl-sm' + (p.open ? ' ffl-p' : '') + '" data-act="ompaid" data-id="' + r.id + '" data-v="' + (p.open ? 1 : 0) + '" data-ids="' + p.items.map(function (x) { return x.id; }).join(',') + '">' + (p.open ? 'Bezahlt' : 'Zurücknehmen') + '</button></div>'; }).join('') + '</div>';
    h += '<details style="margin-top:10px"><summary class="ffl-mu">Für jemanden nachtragen</summary><div class="ffl-form2" style="margin-top:8px"><div><label class="ffl-fl" for="myf-ol-m' + r.id + '">Mitglied</label><select id="myf-ol-m' + r.id + '">' + (r.people || []).map(function (p) { return '<option value="' + p.id + '">' + esc(p.name) + '</option>'; }).join('') + '</select></div>' +
      ((r.menu.items || []).length ? '<div><label class="ffl-fl" for="myf-ol-k' + r.id + '">Von der Karte</label><select id="myf-ol-k' + r.id + '"><option value="">Etwas anderes</option>' + r.menu.items.map(function (x) { return '<option value="' + esc(x.k) + '">' + esc(x.name) + ' (' + eur(x.cents) + ')</option>'; }).join('') + '</select></div>' : '') +
      '<div><label class="ffl-fl" for="myf-ol-n' + r.id + '">Etwas anderes: Gericht</label><input type="text" id="myf-ol-n' + r.id + '"></div><div><label class="ffl-fl" for="myf-ol-p' + r.id + '">Preis</label><input type="text" id="myf-ol-p' + r.id + '" placeholder="9,50"></div><div><label class="ffl-fl" for="myf-ol-q' + r.id + '">Menge</label><input type="number" id="myf-ol-q' + r.id + '" value="1" min="1" max="50"></div></div><div class="ffl-row" style="margin-top:8px"><button type="button" class="ffl-sm" data-act="omlate" data-id="' + r.id + '">Eintragen</button></div></details>';
    return h + '<div class="ffl-row" style="margin-top:10px">' + (r.open ? '<button type="button" class="ffl-sm" data-act="omrd" data-id="' + r.id + '" data-v="close">Bestellschluss jetzt</button>' : '') + (!r.ordered && items.length ? '<button type="button" class="ffl-sm' + (r.open ? '' : ' ffl-p') + '" data-act="omrd" data-id="' + r.id + '" data-v="ordered">Als bestellt vermerken</button>' : '') + (!r.open ? '<button type="button" class="ffl-sm" data-act="omro" data-id="' + r.id + '">Wieder öffnen</button>' : '') + (items.length ? '<button type="button" class="ffl-sm" data-act="omprint" data-id="' + r.id + '">Liste drucken</button>' : '') + '<button type="button" class="ffl-sm ffl-q" data-act="omrd" data-id="' + r.id + '" data-v="delete" style="margin-left:auto">Liste löschen</button></div>';
  }
  function orderPrint(r) {
    var items = r.items || [], gr = {}, grp = [], by = {}, ppl = [], total = 0, row = function (a, b, c) { return '<tr><td>' + a + '</td><td>' + b + '</td><td style="text-align:right">' + c + '</td></tr>'; };
    items.forEach(function (x) {
      total += x.cents * x.qty;
      var k = x.name + '|' + x.cents; if (!gr[k]) { gr[k] = { name: x.name, cents: x.cents, qty: 0, notes: [] }; grp.push(gr[k]); } gr[k].qty += x.qty; if (x.note) gr[k].notes.push(x.qty + ' × ' + x.note);
      if (!by[x.member_id]) { by[x.member_id] = { name: x.member, items: [], sum: 0, open: false }; ppl.push(by[x.member_id]); } var p = by[x.member_id]; p.items.push(x); p.sum += x.cents * x.qty; if (!x.paid) p.open = true;
    });
    return '<h1>' + esc(r.title) + '</h1><p>' + (r.menu.name ? esc(r.menu.name) + ' · ' : '') + (r.menu.phone ? esc(r.menu.phone) + ' · ' : '') + 'Gesamt ' + eur(total) + '</p>' +
      '<h2>Bestellung</h2><table><tbody>' + grp.map(function (g) { return row(g.qty + ' ×', esc(g.name) + (g.notes.length ? '<br><small>' + esc(g.notes.join(' · ')) + '</small>' : ''), eur(g.cents * g.qty)); }).join('') + '</tbody></table>' +
      '<h2>Einsammeln</h2><table><tbody>' + ppl.map(function (p) { return row(esc(p.name), p.items.map(function (x) { return x.qty + ' × ' + esc(x.name); }).join(', '), eur(p.sum) + (p.open ? '' : ' ✓')); }).join('') + '</tbody></table>';
  }
  // Meine Aufgaben: was Funktionsträger für andere erledigen (bestätigen, freigeben, beantworten) – Persönliches bleibt unter „Was steht an?“
  function hasTasks() { return !!(MYF.admin || d.incident_manage || (d.booking_requests || []).length || (d.report_access && d.report_access.incidents.some(function (i) { return i.report_due; }))); }
  function leadItems(item) {
    var n = 0, inner = item; item = function (a, b, c, e) { n++; inner(a, b, c, e); };
    var now = today();
    // Wartet auf meine Entscheidung – immer ganz oben, weil jemand auf die Antwort wartet (dieselbe Regel wie in der Verwaltung)
    (d.booking_requests || []).forEach(function (b) {
      item(dShort(b.start), '<b>Fahrzeug-Anfrage wartet auf Freigabe:</b> ' + esc(b.vehicle) + ' · ' + esc(b.start.slice(11, 16)) + '–' + (b.end.slice(0, 10) !== b.start.slice(0, 10) ? dShort(b.end) + ' ' : '') + esc(b.end.slice(11, 16)) + ' Uhr<div class="ffl-mu">' + esc(b.purpose) + ' · ' + esc(b.by || '') + (b.persons ? ' · ' + b.persons + ' Pers.' : '') + (b.driver ? ' · Fahrer: ' + esc(b.driver) : '') + '</div>',
        '<div class="ffl-row" style="gap:6px"><button type="button" class="ffl-sm ffl-p" data-act="bkok" data-id="' + b.id + '">Freigeben</button><button type="button" class="ffl-sm" data-act="bkno" data-id="' + b.id + '">Ablehnen</button></div>', true);
    });
    if (d.incident_manage && d.manage) {
      var incById = {}; (d.manage.incidents || []).forEach(function (i) { incById[i.id] = i; });
      var preq = (d.manage.participation || []).filter(function (p) { return p.change_req && incById[p.incident_id]; }), pcert = (d.manage.participation || []).filter(function (p) { return p.cert === 'requested' && incById[p.incident_id]; });
      [[preq, 'Austragen angefragt'], [pcert, 'Bescheinigung angefragt']].forEach(function (x) {
        var byInc = {}; x[0].forEach(function (p) { byInc[p.incident_id] = (byInc[p.incident_id] || 0) + 1; });
        Object.keys(byInc).forEach(function (iid) { var i = incById[iid]; item(dShort(i.start.slice(0, 10)), '<b>' + x[1] + ' (' + byInc[iid] + '):</b> ' + esc(incLabel(i)),
          x[1] === 'Bescheinigung angefragt' ? '<button type="button" class="ffl-sm ffl-p" data-act="startcert">Ansehen</button>' : '<button type="button" class="ffl-sm ffl-p" data-act="startinc" data-id="' + i.id + '">Entscheiden</button>', true); });
      });
    }
    if (d.incident_manage) (d.manage.incidents || []).filter(function (i) { return i.report_due; }).forEach(function (i) {
      item(dShort(i.start.slice(0, 10)), '<b>Einsatzbericht offen:</b> ' + esc(incLabel(i)), '<button type="button" class="ffl-sm ffl-p" data-act="startinc" data-id="' + i.id + '">Ausfüllen</button>');
    });
    else if (d.report_access) d.report_access.incidents.filter(function (i) { return i.report_due; }).forEach(function (i) {
      item(dShort(i.start.slice(0, 10)), '<b>Einsatzbericht offen:</b> ' + esc(incLabel(i)), '<button type="button" class="ffl-sm ffl-p" data-act="repopen" data-id="' + i.id + '">Ausfüllen</button>');
    });
    return n;
  }
  function taskOpts() { return { bookings: (d.booking_requests || []).length > 0, lead: !!d.incident_manage }; }
  var taskAt = 0;
  function tasksPoll(force) {
    if (!MYF.admin || (!force && Date.now() - taskAt < 30000)) return;
    taskAt = Date.now();
    setTimeout(function () {
      if (!window.MYFAdminTasks) return;
      window.MYFAdminTasks(taskOpts()).then(function (r) {
        var changed = r.n !== st.taskN; st.taskN = r.n; st.taskRows = r; tasksPaint();
        var a = document.activeElement;
        if (changed && (st.tab === 'start' || st.tab === 'tasks') && !(a && /INPUT|TEXTAREA|SELECT/.test(a.tagName))) render();
      }, function () {});
    }, 200);
  }
  window.MYFTasksChanged = function () { tasksPoll(true); };
  // Zwei Abschnitte, eine Zeilenform: Was jemand anderes beantwortet haben möchte, und was sonst zu erledigen ist
  function tasksBody() {
    var wait = [], todo = [], R = st.taskRows || { wait: [], todo: [] };
    leadItems(function (when, text, btn, w) { (w ? wait : todo).push('<div class="ffl-todo' + (w ? ' is-wait' : '') + '">' + (when ? '<div class="ffl-day">' + when + '</div>' : '<div class="ffl-day ffl-dot"></div>') + '<div class="ffl-ct">' + text + '</div>' + (btn || '') + '</div>'); });
    wait = wait.concat(R.wait); todo = todo.concat(R.todo);
    function sec(title, rows) { return rows.length ? '<div class="ffl-sec"><div class="ffl-sh">' + title + '</div><div class="ffl-todos">' + rows.join('') + '</div></div>' : ''; }
    if (!wait.length && !todo.length) return MYF.admin && !st.taskRows ? '<p class="ffl-mu" style="margin-top:14px">Lade …</p>' : '<p class="ffl-mu" style="margin-top:14px">Gerade nichts offen. 👍</p>';
    return sec('Wartet auf Antwort', wait) + sec('Zu erledigen', todo);
  }
  function tasksPaint() {
    var el = document.getElementById('myf-tasks-area'); if (!el) return;
    el.innerHTML = tasksBody();
    if (!el.hasAttribute('data-bound')) { el.setAttribute('data-bound', '1'); el.addEventListener('click', function (e) {
      var t = e.target.closest('[data-tab]'); if (!t || !window.MYFAdminTaskGo) return;
      e.stopPropagation(); window.MYFAdminTaskGo(t);
    }); }
  }
  function vTasks() {
    tasksPoll(); setTimeout(tasksPaint, 0);
    return '<div id="myf-tasks-area">' + tasksBody() + '</div>';
  }
  // Anmeldung absichern: direkt unter den Schnellaktionen, bis Passkey oder Zwei-Faktor eingerichtet ist (Später = auf diesem Gerät ausblenden; Pflicht bleibt stehen)
  function loginTip() {
    var t = d.twofa || {}, pk = (d.passkeys || []).length, can = window.MYFPasskey && MYFPasskey.ok();
    if (pk || t.on) return '';
    if (!t.required && load('pktip') === '1') return '';
    var how = /iPhone|iPad|Mac/.test(navigator.userAgent) ? 'Face ID oder Touch ID' : /Android/.test(navigator.userAgent) ? 'Fingerabdruck oder Entsperrcode' : 'Windows Hello oder die Geräte-PIN';
    return '<div class="ffl-pktip"><div><b>' + (t.required ? 'Bitte Anmeldung absichern' : can ? 'Nächstes Mal ohne Passwort anmelden?' : 'Anmeldung absichern?') + '</b><span>' +
      (can ? 'Mit einem Passkey reicht ' + esc(how) + '. Sicherer als jedes Passwort. Oder Zwei-Faktor mit einer Code-App.' : 'Mit Zwei-Faktor und einer Code-App kommt niemand allein mit deinem Passwort in dein Konto.') + '</span></div>' +
      '<div class="ffl-row" style="gap:8px">' + (can ? '<button type="button" class="ffl-go ffl-sm" data-act="pkadd">Passkey einrichten</button>' : '') +
      '<button type="button" class="' + (can ? '' : 'ffl-go ') + 'ffl-sm" data-act="start2fa">Zwei-Faktor einrichten</button>' +
      (t.required ? '' : '<button type="button" class="ffl-q ffl-sm" data-act="pktipoff">Später</button>') + '</div></div>';
  }
  function vStart() {
    var s = d.settings, now = today();
    var mine = d.needs.filter(function (n) { return n.status === 'assigned' && n.date_id; })
      .map(function (n) { return { n: n, dt: dateById(n.date_id) }; })
      .filter(function (x) { return x.dt && (x.dt.end || x.dt.start || '9') >= now; })
      .sort(function (a, b) { return (a.dt.start || '9') < (b.dt.start || '9') ? -1 : 1; });
    var cur = curNeeds().filter(function (n) { return n.status !== 'withdrawn'; });
    var agt = agtState();
    tasksPoll();
    var h = deviceCard() + outOfService() + noticesNow() + briefBox() + quickActions() + loginTip();

    // Was steht an? – nur Dinge, bei denen man selbst etwas tun kann oder hingehen muss
    var todo = [];
    function item(when, text, btn, wait) { todo.push('<div class="ffl-todo' + (wait ? ' is-wait' : '') + '">' + (when ? '<div class="ffl-day">' + when + '</div>' : '<div class="ffl-day ffl-dot"></div>') + '<div class="ffl-ct">' + text + '</div>' + (btn || '') + '</div>'); }
    var nTasks = leadItems(function () {}) + (st.taskN || 0);
    if (nTasks) item('', '<b>Meine Aufgaben:</b> ' + nTasks + (nTasks === 1 ? ' Punkt wartet' : ' Punkte warten') + ' auf dich', '<button type="button" class="ffl-sm ffl-p" data-go="tasks">Ansehen</button>', true);
    (d.incidents || []).filter(function (i) { return !myPart(i.id) && i.start >= addDays(now, -10) && i.kind === 'einsatz' && i.source !== 'test'; }).slice(0, 3).forEach(function (i) {
      if (can('participation') && selfOk(i)) item(dShort(i.start.slice(0, 10)), '<b>Warst du dabei?</b> ' + esc(incLabel(i)), '<button type="button" class="ffl-sm ffl-p" data-act="startpart" data-id="' + i.id + '">Ja, war dabei</button>');
    });
    // Bescheinigung angefragt, aber Angaben fehlen: sonst kann die Einsatzführung nicht drucken
    var PP = d.personal || {}, cmiss = [[PP.birth_date, 'Geburtsdatum'], [PP.birth_place, 'Geburtsort'], [PP.street, 'Anschrift']].filter(function (x) { return !x[0]; }).map(function (x) { return x[1]; });
    if (cmiss.length && (d.my_participation || []).some(function (p) { return p.cert === 'requested'; }))
      item('', '<b>Für deine Bescheinigung fehlt noch:</b> ' + esc(cmiss.join(', ')) + '<div class="ffl-mu">Ohne diese Angaben kann die Einsatzführung sie nicht drucken.</div>',
        '<button type="button" class="ffl-sm ffl-p" data-act="startpdata">Jetzt ergänzen</button>');
    // Leihkleidung, die ich noch zurückgeben muss
    (d.my_loans || []).forEach(function (l) {
      item(dShort(l.since), '<b>Bitte zurückgeben:</b> ' + esc(l.item) + (l.size ? ' Gr. ' + esc(l.size) : '') + (l.qty > 1 ? ' (' + l.qty + ')' : '') + '<div class="ffl-mu">gewaschen an die Atemschutz-/Gerätewarte' + (l.incident ? ' · ' + esc(l.incident) : '') + '</div>', '');
    });
    // Unterweisungen, die ich noch bestätigen muss
    (d.briefings || []).filter(function (b) { return !b.ack; }).forEach(function (b) {
      item(b.due ? dShort(b.due) : '', '<b>Unterweisung:</b> ' + esc(b.title) + (b.due ? (b.due < today() ? '<div class="ffl-mu" style="color:var(--red-tx)">überfällig seit ' + fmtDate(b.due) + ' – bitte jetzt bestätigen</div>' : '<div class="ffl-mu">bitte bis ' + fmtDate(b.due) + ' bestätigen</div>') : ''),
        '<button type="button" class="ffl-sm ffl-p" data-act="brief" data-id="' + b.id + '">Ansehen</button>');
    });
    // Hilf mit: Dienste, bei denen Leute fehlen (Mindestzahl), in den nächsten 3 Wochen – mit einem Tipp eintragen
    var dl = {}; (d.duty_lists || []).forEach(function (l) { if (l.self_signup) dl[l.id] = l; });
    // Höchstens zwei direkt auf der Startseite – bei vielen Abfragen bleibt der Start übersichtlich, der Rest steht unter „Abfragen“
    var helpN = 0, helpMore = 0;
    (d.duty_slots || []).filter(function (x) { return dl[x.list_id] && x.min && x.date && x.date >= now && x.date <= addDays(now, 21); }).forEach(function (x) {
      var a = (d.duty_assign || []).filter(function (y) { return y.slot_id === x.id; });
      if (a.length >= x.min || a.some(function (y) { return y.member_id === d.member.id; })) return;
      if (++helpN > 2) { helpMore++; return; }
      item(dShort(x.date), '<button type="button" class="ffl-textbtn" data-act="dutyopen" data-id="' + x.id + '" title="Wer ist dabei?"><b>Hilf mit:</b> ' + esc(dl[x.list_id].title) + (x.label && !/^KW /.test(x.label) ? ' – ' + esc(x.label) : '') + (x.time ? ', ' + esc(x.time) + ' Uhr' : '') + '<div class="ffl-mu">noch ' + (x.min - a.length) + ' gesucht · ' + a.length + ' von mind. ' + x.min + ' dabei · <u>wer ist dabei?</u></div></button>',
        '<button type="button" class="ffl-sm ffl-p" data-act="duty" data-id="' + x.id + '" data-v="1">Ich komme</button>');
    });
    if (helpMore) item('', '<b>Hilf mit:</b> ' + helpMore + (helpMore === 1 ? ' weiterer Termin sucht' : ' weitere Termine suchen') + ' noch Leute', '<button type="button" class="ffl-sm" data-go="asks">Alle Abfragen</button>');
    (d.board || []).filter(function (b) { return b.rsvp && !b.mine && (!b.rsvp_deadline || b.rsvp_deadline >= now); }).slice(0, 2).forEach(function (b) {
      item(b.rsvp_deadline ? 'bis ' + dShort(b.rsvp_deadline) : '', '<b>Zu- oder Absage:</b> ' + esc(b.title), '<button type="button" class="ffl-sm" data-go="board">Antworten</button>');
    });
    myDuties().slice(0, 2).forEach(function (x) { item(x.date ? dShort(x.date) : '', '<b>Eingeteilt:</b> ' + esc(((d.duty_lists || []).filter(function (l) { return l.id === x.list_id; })[0] || {}).title || x.label)); });
    mine.slice(0, 2).forEach(function (x) {
      item(esc(range(x.dt)).slice(0, 6), '<b>Lehrgang ' + esc(x.n.short || x.n.title) + '</b>' + (x.dt.location ? ' in ' + esc(x.dt.location) : '') + (x.n.prereq ? '<div class="ffl-mu">Voraussetzungen: ' + esc(x.n.prereq) + '</div>' : '') +
        (x.n.admin_note ? '<div class="ffl-mu">' + esc(x.n.admin_note) + '</div>' : ''));
    });
    if (s.open && can('courses') && !cur.length) item(s.deadline ? 'bis ' + dShort(s.deadline) : '', 'Lehrgangswünsche für ' + s.year + ' eintragen', '<button type="button" class="ffl-sm" data-go="courses">Lehrgänge ansehen</button>');
    if (agt && (agt.over || agt.soon)) item(agt.due ? dShort(agt.due) : '', 'Atemschutz-Übungsstrecke ' + (agt.over ? '<b style="color:var(--red-tx)">ist fällig</b>' : 'wird fällig'), '<button type="button" class="ffl-sm" data-go="agt">Details</button>');
    if (agt && !agt.over && (agt.over2 || agt.soon2)) item(agt.due2 ? dShort(agt.due2) : '', 'Atemschutz: Übung oder Einsatz unter Atemschutz oder zweite Übungsstrecke ' + (agt.over2 ? '<b style="color:var(--red-tx)">' + (agt.sec ? 'ist fällig' : 'fehlt') + '</b>' : 'wird fällig'), '<button type="button" class="ffl-sm" data-go="agt">Details</button>');
    (d.orders || []).forEach(function (r) {
      if (r.open) item(dShort(r.deadline.slice(0, 10)), '<b>' + esc(r.title) + ':</b> ' + (r.mine.length ? 'bestellt, ändern bis ' : 'bestellen bis ') + esc(r.deadline.slice(11, 16)) + ' Uhr', '<button type="button" class="ffl-sm ffl-p" data-go="orders">' + (r.mine.length ? 'Ansehen' : 'Bestellen') + '</button>');
      if (r.owner && !r.open && !r.ordered && (r.items || []).length) item('', '<b>' + esc(r.title) + ':</b> Bestellung aufgeben', '<button type="button" class="ffl-sm ffl-p" data-go="orders">Ansehen</button>', true);
    });
    // G26 abgelaufen = nicht atemschutztauglich: deutlich sagen, was das heißt
    var drTxt = d.agt && d.agt.doctor ? '<div class="ffl-mu">Termin: ' + esc(d.agt.doctor.name) + (d.agt.doctor.phone ? ' · <a href="tel:' + esc(telHref(d.agt.doctor.phone)) + '">' + esc(telTxt(d.agt.doctor.phone)) + '</a>' : '') + '</div>' : '';
    if (agt && d.agt.g26_until && d.agt.g26_until < now) item(dShort(d.agt.g26_until), '<b style="color:var(--red-tx)">G26 abgelaufen – du bist zurzeit nicht atemschutztauglich.</b><div class="ffl-mu">Bis zur neuen Untersuchung kein Einsatz und keine Übung unter Atemschutz. Termin beim Betriebsarzt machen.</div>' + drTxt, '<button type="button" class="ffl-sm" data-go="agt">Details</button>');
    else if (agt && d.agt.g26_until && d.agt.g26_until < addDays(now, 60)) item(dShort(d.agt.g26_until), 'G26-Untersuchung läuft ab – rechtzeitig Termin beim Betriebsarzt machen' + drTxt, '<button type="button" class="ffl-sm" data-go="agt">Details</button>');
    d.ideas.filter(function (i) { return i.answer && i.answered && i.answered.slice(0, 10) >= addDays(now, -30); }).forEach(function (i) {
      item('', 'Antwort auf deine Anregung „' + esc(i.subject || i.text.slice(0, 40)) + '“', '<button type="button" class="ffl-sm" data-go="ideas">Lesen</button>');
    });
    var dr = (d.drills || [])[0];
    var todoBox = '<div class="ffl-sec"><div class="ffl-sh">Was steht an?</div>' + (todo.length ? '<div class="ffl-todos">' + todo.join('') + '</div>' : '<p class="ffl-mu">Gerade nichts zu tun. 👍</p>') + '</div>';
    h += todoBox;


    // Kacheln: nächster Dienst, eigene Einsätze, Lehrgänge, Atemschutz, Melden
    var year = new Date().getFullYear(), myYear = d.my_participation.filter(function (p) {
      var i = (d.incidents || []).concat(d.incidents_old || []).filter(function (x) { return x.id === p.incident_id; })[0]; return i && i.kind !== 'uebung' && +i.start.slice(0, 4) === year; // nur Einsätze
    }).length;
    h += '<div class="ffl-sec"><div class="ffl-cards">';
    h += card('duties', 'Nächster Dienst', dr ? '<span class="ffl-big ffl-big-sm">' + dShort(dr.date) + (dr.time ? ' · ' + esc(dr.time) : '') + '</span>' + esc(dr.title) : '<span class="ffl-mu">noch kein Dienstplan</span>');
    h += card('incidents', 'Meine Einsätze ' + year, '<span class="ffl-big">' + myYear + '</span>' + (myYear === 1 ? 'Einsatz' : 'Einsätze') + ' (ohne Übungen)');
    h += card('courses', 'Lehrgänge', mine.length ? '<span class="ffl-big ffl-big-sm">' + esc(range(mine[0].dt)) + '</span>' + esc(mine[0].n.short || mine[0].n.title) : '<span class="ffl-big">' + cur.length + '</span>' + (s.open ? 'Wünsche ' + s.year + ' – jetzt eintragen' : 'Wünsche ' + s.year + ' · ' + (s.published ? 'Zuteilung ist da' : 'Eintragen beendet')), s.open && !cur.length ? 'is-alert' : '');
    // Kachel zeigt, was zuerst fällig wird: G26 oder Übungsstrecke
    if (agt) { var g26u = d.agt.g26_until || '', g26x = g26u && g26u < today(), g26f = g26u && !g26x && (!agt.due || g26u < agt.due) && !agt.over, o2 = agt.over2 && !agt.over && !g26x;
      h += card('agt', 'Atemschutz', '<span class="ffl-big ffl-big-sm"' + (agt.over || g26x || o2 ? ' style="color:var(--red-tx)"' : '') + '>' + (g26x ? 'abgelaufen' : agt.over || o2 ? 'fällig' : g26f ? 'bis ' + fmtDate(g26u) : agt.due ? 'bis ' + fmtDate(agt.due) : '–') + '</span>' + (g26x || g26f ? 'G26-Untersuchung' : o2 ? 'Übung oder 2. Strecke' : 'Übungsstrecke'), agt.over || g26x || o2 ? 'is-alert' : ''); }
    var myDef = (d.defects || []).filter(function (x) { return x.status === 'new' || x.status === 'progress'; }).length;
    h += card('defects', 'Etwas melden', '<span class="ffl-big ffl-big-sm">Mangel · Idee</span>' + (myDef ? myDef + ' deiner Meldungen offen' : 'kaputt, fehlt, Vorschlag'));
    return h + '</div></div>';
  }
  function card(go, label, body, cls) {
    return '<button type="button" class="ffl-card ' + (cls || '') + '" data-go="' + go + '"><span class="ffl-cl">' + label + '</span>' + body + '</button>';
  }

  // ---- Lehrgänge -------------------------------------------------------------
  function vCourses() {
    var s = Object.assign({}, d.settings, { open: d.settings.open && can('courses') }), h = '';
    if (d.settings.open && !can('courses')) h += noRight('courses');
    var cur = {}; curNeeds().forEach(function (n) { cur[n.course_id] = n; });
    var dates = {}; d.dates.forEach(function (x) { (dates[x.course_id] = dates[x.course_id] || []).push(x); });

    if (s.open) h += '<div class="ffl-msg ok">Lehrgangswünsche für ' + s.year + ' kannst du jetzt eintragen' + (s.deadline ? ' – bis <b>' + fmtDate(s.deadline) + '</b>' : '') + '. Tippe bei jedem Lehrgang, den du machen möchtest, auf „Möchte ich“ – wird sofort gespeichert. Die Führung meldet die Wünsche an den Kreis.</div>';
    else h += '<div class="ffl-msg">Das Eintragen der Lehrgangswünsche für ' + s.year + ' ist beendet – die Wehrführung meldet jetzt an den Kreis. Zurückziehen geht weiterhin.</div>';
    if (s.intro) h += '<div class="ffl-msg ffl-pre-line">' + esc(s.intro) + '</div>';

    // Zuteilung des laufenden Jahres
    var decided = curNeeds().filter(function (n) { return n.status !== 'open'; });
    if (s.published && decided.length) {
      h += '<div class="ffl-sec"><div class="ffl-sh">Deine Zuteilung ' + s.year + '</div>';
      decided.forEach(function (n) {
        var dt = n.date_id && dateById(n.date_id);
        h += '<div class="ffl-mine"><div class="ffl-row" style="justify-content:space-between"><b>' + esc(n.short || n.title) + '</b>' + tag(NEED, n.status) + '</div>' +
          '<div>' + esc(n.title) + '</div>' + (dt ? '<div style="margin-top:6px"><b>' + esc(range(dt)) + '</b>' + (dt.location ? ' · ' + esc(dt.location) : '') + '</div>' + sesHtml(dt) : '') +
          (n.status === 'assigned' && n.prereq ? '<div class="ffl-mu">Voraussetzungen: ' + esc(n.prereq) + '</div>' : '') +
          (n.admin_note ? '<div class="ffl-msg">' + esc(n.admin_note) + '</div>' : '') +
          (n.status === 'assigned' || n.status === 'waiting' ? '<button type="button" class="ffl-q ffl-sm" style="padding:0;margin-top:8px" data-act="withdraw" data-id="' + n.course_id + '">Vom Lehrgang zurücktreten</button>' : '') + '</div>';
      });
      h += '</div>';
    }

    // Bedarf melden
    h += '<div class="ffl-sec"><div class="ffl-sh">Meine Lehrgangswünsche ' + s.year + '<em>' + (function (n) { return n === 1 ? '1 Wunsch' : n + ' Wünsche'; })(curNeeds().filter(function (n) { return n.status !== 'withdrawn'; }).length) + '</em></div>';
    Object.keys(d.cats).forEach(function (cat) {
      var list = d.courses.filter(function (c) { return c.cat === cat; });
      if (!list.length) return;
      h += '<div class="ffl-group">' + esc(d.cats[cat]) + '</div>';
      list.forEach(function (c) {
        var n = cur[c.id], on = n && n.status !== 'withdrawn', meta = [], btn;
        if (c.days) meta.push(c.days + ' Tage'); if (c.ue) meta.push(c.ue + ' UE'); if (c.locations) meta.push(c.locations);
        var dl = (dates[c.id] || []).map(function (x) { return range(x) + (x.location ? ' ' + x.location : ''); });
        if (n && ['completed', 'missed'].indexOf(n.status) >= 0) btn = tag(NEED, n.status);
        else if (on && !(s.open && n.status === 'open')) btn = '<button type="button" class="ffl-toggle" aria-pressed="true" data-act="withdraw" data-id="' + c.id + '">' + (n.status === 'assigned' ? 'Vom Lehrgang zurücktreten' : 'Gemeldet ✓ · zurückziehen') + '</button>';
        else if (n && !on) btn = '<button type="button" class="ffl-toggle" data-act="need" data-id="' + c.id + '" data-on="1"' + (s.open ? '' : ' disabled') + '>' + (s.open ? 'Wieder melden' : 'Zurückgetreten') + '</button>';
        else btn = '<button type="button" class="ffl-toggle" data-act="need" data-id="' + c.id + '" data-on="' + (on ? '0' : '1') + '" aria-pressed="' + !!on + '"' + (s.open ? '' : ' disabled') + '>' + (on ? 'Gemeldet ✓' : 'Möchte ich') + '</button>';
        h += '<div class="ffl-course"><div class="ffl-ct"><b>' + esc(c.short ? c.short + ' – ' : '') + esc(c.title) + '</b>' +
          (meta.length ? '<div class="ffl-meta">' + esc(meta.join(' · ')) + '</div>' : '') +
          (dl.length ? '<div class="ffl-meta">Termine: ' + esc(dl.join(', ')) + '</div>' : '') +
          (c.prereq ? '<div class="ffl-pre">Voraussetzungen: ' + esc(c.prereq) + '</div>' : '') +
          (c.note ? '<div class="ffl-pre">' + esc(c.note) + '</div>' : '') +
          (n && !on ? '<div class="ffl-pre">' + esc(n.comment) + '</div>' : '') +
          (on && s.open && n.status === 'open' ? '<div class="ffl-cm"><input type="text" data-comment="' + c.id + '" value="' + esc(n.comment) + '" placeholder="Bemerkung (optional), z. B. Wunschtermin"><span class="ffl-mu ffl-cmstate" data-cmstate="' + c.id + '">' + (n.comment ? '✓ gespeichert' : '') + '</span></div>' : '') +
          '</div>' + btn + '</div>';
      });
    });
    if (!d.courses.length) h += '<p class="ffl-mu">Für ' + s.year + ' sind noch keine Lehrgänge eingetragen.</p>';
    h += '</div>';

    // Ausbildungsnachweis über alle Jahre (gleiche Ansicht wie im Profil)
    h += trainingHtml();

    // Frühere Meldungen
    var other = d.needs.filter(function (n) { return n.year !== s.year && n.status !== 'completed'; });
    if (other.length) h += '<div class="ffl-sec"><div class="ffl-sh">Andere Jahre</div>' + other.map(function (n) {
      var dt = n.date_id && dateById(n.date_id), upcoming = !dt || (dt.end || dt.start || '9') >= today();
      var canWithdraw = (n.status === 'assigned' || n.status === 'waiting') && upcoming;
      return '<div class="ffl-ev"><div class="ffl-day">' + n.year + '</div><div style="flex:1"><b>' + esc(n.short ? n.short + ' – ' : '') + esc(n.title) + '</b>' +
        (dt ? '<div class="ffl-mu">' + esc(range(dt)) + (dt.location ? ' · ' + esc(dt.location) : '') + '</div>' : '') +
        (canWithdraw ? '<button type="button" class="ffl-q ffl-sm" style="padding:0" data-act="withdraw" data-id="' + n.course_id + '">Zurücktreten</button>' : '') +
        '</div>' + tag(NEED, n.status) + '</div>';
    }).join('') + '</div>';
    return h;
  }

  // ---- Kalender --------------------------------------------------------------
  // Gemeinsame Terminzeile (Kalender, Dienstplan): Monat als Überschrift, Datum mit Wochentag, Art, Titel, Zeilen darunter, Aktion rechts
  var DKIND = { dienst: 'Übungsabend', lehrgang: 'Lehrgang', termin: 'Termin' };
  function drillEv(r) {
    var multi = r.end_date && r.end_date > r.date, topic = r.topic && r.title.toLowerCase().indexOf(r.topic.toLowerCase()) < 0 ? r.topic : '';
    return { start: r.date, end: multi ? r.end_date : r.date, time: r.time, time_to: multi ? '' : r.time_to, title: r.title, tag: DKIND[r.cal_kind] || 'Dienst',
      lines: [topic, r.lead ? (r.cal_kind === 'lehrgang' ? 'Dabei: ' : 'Verantwortlich: ') + r.lead : '', r.note].filter(Boolean), drill: r };
  }
  // Veranstaltung als Kalendereintrag: Kurztext sofort, Beschreibung und Links zum Aufklappen
  function eventEv(x) {
    var more = (x.body ? '<p style="white-space:pre-line;margin:6px 0">' + esc(x.body) + '</p>' : '') +
      '<div class="ffl-row" style="gap:8px;flex-wrap:wrap">' + (x.link ? '<a class="ffl-btn ffl-sm" href="' + esc(x.link) + '" target="_blank" rel="noopener">' + esc(x.link_label || 'Mehr dazu') + '</a>' : '') +
      (x.url ? '<a class="ffl-btn ffl-sm" href="' + esc(x.url) + '" target="_blank" rel="noopener">Auf der Website</a>' : '') + '</div>';
    var ask = x.ask_id && !x.cancelled ? (d.duty_lists || []).filter(function (l) { return l.id === x.ask_id; })[0] : null;
    // Knopf nur, wenn in der Abfrage auch etwas offen ist (sonst führt er ins Leere)
    if (ask && !(d.duty_slots || []).some(function (s) { return s.list_id === ask.id && (!s.date || s.date >= today()); })) ask = null;
    return { start: x.date, end: x.end_date || x.date, time: x.time, time_to: x.end_date > x.date ? '' : x.time_to, title: (x.cancelled ? 'Abgesagt: ' : '') + x.title, tag: 'Veranstaltung',
      lines: [x.place, x.teaser].filter(Boolean), forAll: true,
      html: (ask ? '<div style="margin-top:6px"><button type="button" class="ffl-sm ffl-p" data-tab="asks">Wer hilft? Zur Abfrage „' + esc(ask.title) + '“</button></div>' : '') +
        (x.body || x.link || x.url ? '<details class="ffl-evmore"><summary>Mehr dazu</summary>' + more + '</details>' : '') };
  }
  function evList(ev, opt) {
    opt = opt || {}; var month = opt.noMonth ? 'x' : '', h = '';
    ev.forEach(function (e) {
      var p = e.start.split('-'), m = MONTHS[+p[1] - 1] + ' ' + p[0];
      if (!opt.noMonth && m !== month) { h += '<div class="ffl-month">' + m + '</div>'; month = m; }
      var wd = WD[new Date(e.start + 'T12:00:00').getDay()], multi = e.end && e.end !== e.start;
      var off = e.drill && e.drill.id && (d.drill_absent || []).indexOf(e.drill.id) >= 0;
      var act = opt.absence && e.drill ? '<button type="button" class="ffl-sm' + (off ? '' : ' ffl-q') + '" data-act="drabs" data-id="' + (e.drill.id || 0) + '" data-uid="' + esc(e.drill.cal_uid || '') + '" data-v="' + (off ? '0' : '1') + '">' + (off ? 'Doch dabei' : 'Kann nicht') + '</button>' : '';
      h += '<div class="ffl-ev' + (e.mine ? ' is-mine' : '') + (off ? ' is-off' : '') + (e.go && !act ? ' is-link' : '') + '"' + (e.go && !act ? ' data-tab="' + e.go + '" role="link" tabindex="0"' : '') + '>' +
        '<div class="ffl-day">' + p[2] + '.' + p[1] + '.<small>' + wd + (multi ? ' – ' + dShort(e.end) : '') + '</small>' + (e.time ? '<small>' + esc(e.time) + (e.time_to ? '–' + esc(e.time_to) : '') + ' Uhr</small>' : '') + '</div>' +
        '<div class="ffl-evbody">' + (e.tag ? '<span class="ffl-evtag">' + esc(e.tag) + '</span>' : '') + '<b>' + esc(e.title) + (e.short ? ' (' + esc(e.short) + ')' : '') + '</b>' +
        (e.lines || []).map(function (l) { return '<div class="ffl-mu">' + esc(l) + '</div>'; }).join('') +
        (e.html || '') + (e.mine && e.dabei ? '<div class="ffl-evme">du bist dabei</div>' : '') + (off ? '<span class="ffl-chip st-no">abgemeldet</span>' : '') + '</div>' +
        (act || (e.go ? '<span class="ffl-evgo" aria-hidden="true">›</span>' : '')) + '</div>';
    });
    return h;
  }
  function vCalendar() {
    var mineIds = {}; d.needs.forEach(function (n) { if ((n.status === 'assigned' || n.status === 'completed') && n.date_id) mineIds[n.date_id] = n; });
    // go: Antippen führt dorthin, wo man sich an- oder abmeldet bzw. Details sieht
    var ev = [];
    d.calendar.forEach(function (x) {
      // eigener Lehrgang mit Ablauf: jeder Tag einzeln mit Uhrzeit
      if (mineIds[x.id] && (x.sessions || []).length) x.sessions.forEach(function (y) { ev.push({ start: y.d, end: y.d, time: y.f || '', time_to: y.t || '', title: x.title, short: x.short, tag: 'Lehrgang', lines: [x.location].filter(Boolean), mine: true, dabei: true, go: 'courses' }); });
      else ev.push({ start: x.start, end: x.end, title: x.title, short: x.short, tag: 'Lehrgang', lines: [x.location].filter(Boolean), mine: !!mineIds[x.id], dabei: !!mineIds[x.id], go: 'courses' });
    });
    if (d.agt) d.agt.log.forEach(function (l) { if (l.kind === 'strecke' && l.date >= today()) ev.push({ start: l.date, end: l.date, title: 'Atemschutz-Übungsstrecke', tag: 'Atemschutz', lines: [l.note].filter(Boolean), mine: true, dabei: true, go: 'agt' }); });
    // Dienstplan (gilt für alle): erscheint auch unter „Meine Termine“, aber ohne gelbe Hervorhebung
    (d.drills || []).forEach(function (r) { if (r.event_id) return; var e = drillEv(r); e.go = 'duties'; e.forAll = true; e.drill = null; if ((d.drill_absent || []).indexOf(r.id) < 0) ev.push(e); });
    // Veranstaltungen: stehen ganz normal im Kalender (hervorgehoben werden sie nur auf der öffentlichen Website)
    (d.events || []).forEach(function (x) { ev.push(eventEv(x)); });
    myDuties().forEach(function (x) { if (x.date) ev.push({ start: x.date, end: x.date, time: x.time || '', title: (((d.duty_lists || []).filter(function (l) { return l.id === x.list_id; })[0] || {}).title || x.label), tag: 'Zugesagt', lines: [x.note].filter(Boolean), mine: true, dabei: true, go: 'duties' }); });
    if (st.calMine) ev = ev.filter(function (e) { return e.mine || e.forAll; });
    ev.sort(function (a, b) { return a.start < b.start ? -1 : 1; });

    var h = '<div class="ffl-pills"><button type="button" data-act="calmine" data-v="1" aria-pressed="' + st.calMine + '">Meine Termine</button>' +
      '<button type="button" data-act="calmine" data-v="0" aria-pressed="' + !st.calMine + '">Alle Termine</button></div>';
    h += '<p class="ffl-mu ffl-calintro">Alles, was für dich ansteht: Übungsabende und Termine aus dem Dienstplan, deine Lehrgänge, Zusagen und die Übungsstrecke. Gelb = du persönlich bist dabei. Abmelden vom Dienst unter „Dienstplan“.</p>';
    if (!ev.length) h += '<p class="ffl-mu" style="margin-top:16px">' + (st.calMine ? 'Keine eigenen Termine.' : 'Noch keine Termine festgelegt.') + '</p>';
    h += evList(ev);

    h += '<div class="ffl-sec"><div class="ffl-sh">Im Handy-Kalender</div><p class="ffl-mu">Einmal abonnieren – neue und geänderte Termine kommen dann automatisch in deinen Kalender (iPhone, Android, Outlook).</p>' +
      '<div class="ffl-row"><a class="ffl-btn ffl-grow" href="' + esc(d.ics.mine.replace(/^https?:/, 'webcal:')) + '">Meine Termine abonnieren</a>' +
      '<a class="ffl-btn ffl-grow" href="' + esc(d.ics.all.replace(/^https?:/, 'webcal:')) + '">Alle Lehrgangstermine abonnieren</a></div>' +
      '<p class="ffl-mu" style="margin-top:10px">Klappt das Antippen nicht (z. B. Google Kalender am PC)? <button type="button" class="ffl-q ffl-sm" style="padding:0" data-act="copyics" data-v="mine">Link für meine Termine kopieren</button> und im Kalender unter „Per URL hinzufügen“ einfügen.' +
      ' Der Link ist persönlich – nicht weitergeben.</p><button type="button" class="ffl-sm" data-act="resetics">Link erneuern</button></div>';
    return h;
  }

  // ---- Kleidung --------------------------------------------------------------
  function catalogSelect() {
    var cats = d.cloth_cats || {}, list = (d.cloth_catalog || []).filter(function (i) { return i.procurable; });
    if (!list.length) return (d.clothing_items || []).map(function (x) { return '<option>' + esc(x) + '</option>'; }).join('');
    return Object.keys(cats).map(function (cat) {
      var items = list.filter(function (i) { return i.cat === cat; });
      return items.length ? '<optgroup label="' + esc(cats[cat]) + '">' + items.map(function (i) { return '<option value="' + esc(i.name) + '" data-size="' + esc(i.size_key) + '">' + esc(i.name) + '</option>'; }).join('') + '</optgroup>' : '';
    }).join('');
  }
  function stockList(rows) {
    return rows.map(function (x) {
      var cat = (d.cloth_catalog || []).filter(function (i) { return i.id === x.item_id; })[0];
      return '<div class="ffl-ev"><div style="flex:1"><b>' + esc(x.item_name) + (x.qty > 1 ? ' × ' + x.qty : '') + '</b>' +
        '<div class="ffl-mu">' + esc([x.size ? 'Größe ' + x.size : '', x.issued ? 'seit ' + fmtDate(x.issued) : '', x.serial ? 'Nr. ' + x.serial : '',
          x.status !== 'in_use' ? d.stock_status[x.status] + (x.status_date ? ' am ' + fmtDate(x.status_date) : '') : ''].filter(Boolean).join(' · ')) + '</div>' +
        (cat && !cat.procurable && x.status === 'in_use' ? '<div class="ffl-mu">Gibt es nicht mehr neu – bitte gut pflegen.</div>' : '') + '</div></div>';
    }).join('');
  }
  function vClothing() {
    var h = '';
    var cur = (d.stock || []).filter(function (x) { return x.status === 'in_use'; }), hist = (d.stock || []).filter(function (x) { return x.status !== 'in_use'; });
    h += '<div class="ffl-sec"><div class="ffl-sh">Meine Ausstattung<em>' + cur.length + (cur.length === 1 ? ' Teil' : ' Teile') + '</em></div>' +
      (cur.length ? stockList(cur) : '<p class="ffl-mu">Noch nichts eingetragen. Die Kleiderkammer trägt nach und nach ein, was du hast.</p>') +
      (hist.length ? '<details style="margin-top:8px"><summary class="ffl-mu" style="cursor:pointer">Früher ausgegeben (' + hist.length + ')</summary>' + stockList(hist) + '</details>' : '') +
      '<p class="ffl-mu" style="margin-top:8px">Deine Größen pflegst du unter „Profil“.</p>' + fbBtn('clothing', 'Kleidung: meine Ausstattung') + '</div>';
    if (d.settings.clothing_open && !can('clothing')) h += noRight('clothing');
    else if (d.settings.clothing_open) {
      var k = st.ckind;
      h += '<div class="ffl-sec"><div class="ffl-sh">Neu melden</div><form id="myf-cform">' +
        '<div class="ffl-seg2"><button type="button" data-act="ckind" data-v="ersatz" aria-pressed="' + (k === 'ersatz') + '">Ersatz<span style="font-weight:400">hab ich, ist hin</span></button>' +
        '<button type="button" data-act="ckind" data-v="neu" aria-pressed="' + (k === 'neu') + '">Neu<span style="font-weight:400">hab ich noch nicht</span></button></div>' +
        '<label class="ffl-fl" for="myf-ci">Was brauchst du?</label><select id="myf-ci"><option value="">bitte wählen …</option>' + catalogSelect() +
        '<option value="Sonstiges">Sonstiges (bitte im Kommentar beschreiben)</option></select>' +
        '<div class="ffl-row"><div class="ffl-grow"><label class="ffl-fl" for="myf-cs">Größe</label><input type="text" id="myf-cs" placeholder="z. B. 52 oder L"></div>' +
        '<div style="width:100px"><label class="ffl-fl" for="myf-cq">Anzahl</label><input type="number" id="myf-cq" value="1" min="1" max="20"></div></div>' +
        '<label class="ffl-fl" for="myf-cr">Grund</label><select id="myf-cr">' + REASONS[k].map(function (x) { return '<option>' + esc(x) + '</option>'; }).join('') + '</select>' +
        '<label class="ffl-fl" for="myf-cc">Kommentar</label><textarea id="myf-cc" rows="3" style="min-height:84px" placeholder="z. B. Modell, Farbe, was genau kaputt ist, wann du es brauchst"></textarea>' +
        '<button type="submit" class="ffl-go" style="width:100%;margin-top:14px">Melden</button></form></div>';
    } else h += '<div class="ffl-msg">Kleidermeldungen sind gerade geschlossen.</div>';
    h += '<div class="ffl-sec"><div class="ffl-sh">Deine Meldungen</div>';
    if (!d.clothing.length) h += '<p class="ffl-mu">Noch nichts gemeldet.</p>';
    d.clothing.forEach(function (c) {
      h += '<div class="ffl-mine"><div class="ffl-row" style="justify-content:space-between"><b>' + esc(c.item) + (c.qty > 1 ? ' × ' + c.qty : '') + '</b>' + tag(CLOTH, c.status) + '</div>' +
        '<div class="ffl-mu">' + esc([d.clothing_kinds[c.kind], c.size ? 'Größe ' + c.size : '', c.reason, 'gemeldet am ' + fmtDate(c.created)].filter(Boolean).join(' · ')) + '</div>' +
        (c.comment ? '<div class="ffl-pre-line" style="margin-top:4px">' + esc(c.comment) + '</div>' : '') +
        (c.admin_note ? '<div class="ffl-msg">' + esc(c.admin_note) + '</div>' : '') +
        (c.status === 'open' ? '<button type="button" class="ffl-q ffl-sm" style="padding:0;margin-top:8px" data-act="cwithdraw" data-id="' + c.id + '">Zurückziehen</button>' : '') + '</div>';
    });
    return h + '</div>';
  }

  // ---- Mängel ----------------------------------------------------------------
  var DSTAT = { 'new': ['Neu', 'open'], progress: ['In Bearbeitung', 'warn'], done: ['Erledigt', 'ok'], rejected: ['Kein Mangel', 'no'] };
  // ---- Einsätze & Übungen ---------------------------------------------------------
  function dt(v) { return v ? fmtDate(v) + (v.length >= 16 ? ' ' + v.slice(11, 16) : '') : ''; }
  function dtLocal(v) { return v ? v.slice(0, 16).replace(' ', 'T') : ''; }
  function incLabel(i) { return (i.nr ? i.nr + ' · ' : '') + i.title; }
  function myPart(id) { return d.my_participation.filter(function (p) { return p.incident_id === id; })[0]; }

  // Eine Zeile „Warst du dabei?“ (Einsatz oder Übung): eigener Eintrag, Formular, Bericht-Hinweis
  function incRow(i) {
    var h = '';      var p = myPart(i.id), open = st.pform === i.id;
    h += '<div class="ffl-inc' + (p ? ' is-mine' : '') + '"><div class="ffl-inc-h"><div><b>' + esc(incLabel(i)) + '</b>' +
      '<div class="ffl-mu">' + dt(i.start) + ' Uhr' + (i.place ? ' · ' + esc(i.place) : '') + '</div></div>' +
      (p ? '<div class="ffl-row ffl-partrow"><span class="ffl-chip ' + (p.change_req ? 'st-warn' : p.confirmed ? 'st-ok' : 'st-open') + '">' + (p.change_req ? 'Austragen angefragt' : (p.confirmed ? '✓ ' : '') + 'dabei: ' + esc(p.vehicle || '–') + (p.role ? ' · ' + esc(p.role.split(',').join(' ')) : '') + (p.confirmed ? ' · bestätigt' : '')) + '</span>' +
        (!open && !p.confirmed ? '<button type="button" class="ffl-sm" data-act="pform" data-id="' + i.id + '">Ändern</button><button type="button" class="ffl-q ffl-sm" data-act="premove" data-id="' + i.id + '">Doch nicht dabei</button>' : '') +
        (!open && p.confirmed && !p.change_req ? '<button type="button" class="ffl-sm" data-act="pform" data-id="' + i.id + '">Bescheinigung</button><button type="button" class="ffl-q ffl-sm" data-act="premove" data-id="' + i.id + '">Doch nicht dabei?</button>' : '') +
        (p.change_req ? '<button type="button" class="ffl-q ffl-sm" data-act="pcancelreq" data-id="' + i.id + '">Anfrage zurückziehen</button>' : '') + '</div>'
        : (can('participation') && !open ? (selfOk(i) ? '<button type="button" class="ffl-go ffl-sm" data-act="pform" data-id="' + i.id + '">Ja, war dabei</button>' :
          '<span class="ffl-mu ffl-partclosed">' + (i.report_closed ? 'Bericht abgeschlossen – Korrektur über die Einsatzführung' : i.part_closed ? 'Liste abgeschlossen – Korrektur über die Einsatzführung' : d.hall_limit === 'terminal' ? 'in der Halle eintragen' : 'Eintragen vorbei – bei der Einsatzführung melden') + '</span>') : '')) + '</div>';
    if (!d.manage && d.report_access && d.report_access.incidents.some(function (x) { return x.id === i.id; }) && !open)
      h += '<div class="ffl-repcta" style="margin-top:10px"><div><b>Du warst ' + esc((p && p.role || '').split(',').filter(function (r) { return ['EL', 'ZF', 'GF'].indexOf(r) >= 0; }).join('/')) + ' – Einsatzbericht</b><span class="ffl-mu">' +
        (i.has_report ? 'zuletzt von ' + esc(i.report_by) : 'dauert ca. 3 Minuten – wird automatisch gespeichert') + '</span></div><button type="button" class="ffl-go" data-act="repopen" data-id="' + i.id + '">' + (i.has_report ? 'Bericht bearbeiten' : 'Bericht ausfüllen') + '</button></div>';
    if (open && (p || selfOk(i)) && !i.report_closed) h += partForm(i, p);
    h += '</div>';
    return h;
  }
  function kindOf(id) { var x = (d.incidents || []).concat(d.manage ? d.manage.incidents : []).filter(function (y) { return y.id === id; })[0]; return x ? x.kind : ''; }
  function vIncidents() {
    // Übungen gehören zu Termine → Dienste
    if ([st.inc, st.report, st.pform].some(function (x) { return x && kindOf(x) === 'uebung'; })) { st.tab = 'duties'; return vDuties(); }
    if (st.repView) return repViewHtml();
    if (st.report) return vReport();
    if (st.inc) return vIncidentManage();
    // Zwei Reiter: „Warst du dabei?“ (ich selbst) und „Einsatzführung“ (alle Beteiligten, Berichte) – nur wer darf, sieht den zweiten
    var leadAll = d.incident_manage ? d.manage.incidents : (d.report_access ? d.report_access.incidents : []);
    var openRep = leadAll.filter(function (i) { return i.report_due; }); // gleiche Regel wie in der Verwaltung (Server)
    var canLead = !!(d.incident_manage || (d.report_access && d.report_access.incidents.length));
    // Drei Reiter: Meine Einsätze (ich selbst) · Offene Berichte (was noch zu tun ist) · Führung (alle Einsätze, Beteiligung, Export)
    var cur = canLead ? (st.isub || (openRep.some(function (i) { return !i.has_report; }) ? 'open' : 'self')) : 'self';
    var nCv = d.incident_manage ? (d.manage.participation || []).filter(function (p) { return p.cert === 'requested' || (p.cert === 'issued'); }).length : 0;
    function itab(k, label) { return '<button type="button" role="tab" data-act="isub" data-v="' + k + '" aria-selected="' + (cur === k) + '">' + label + '</button>'; }
    var h = canLead ? '<div class="ffl-subtabs ffl-inctabs" role="tablist">' + itab('self', 'Meine Einsätze') +
      itab('open', 'Offene Berichte' + (openRep.length ? ' <span class="ffl-badge">' + openRep.length + '</span>' : '')) + itab('lead', 'Führung') + (d.incident_manage ? itab('cert', 'Verdienstausfall' + (nCv ? ' <span class="ffl-badge">' + nCv + '</span>' : '')) : '') + '</div>' : '';
    if (cur === 'open') return h + openReports(openRep);
    if (cur === 'lead') return h + leadOverview();
    if (cur === 'cert' && d.incident_manage) {
      if (!st.cv || st.cv.year !== (st.cvYear || new Date().getFullYear())) {
        api('GET', 'me/cert/list?year=' + (st.cvYear || new Date().getFullYear())).then(function (r) { st.cv = r; render(); }, function (e) { note('err', e.message); });
        return h + '<p class="ffl-mu" style="margin-top:14px">Lade …</p>';
      }
      return h + MYFCert.board(st.cv, { openInc: 'cvinc' });
    }
    var all = d.incidents || [], list = all.filter(function (x) { return x.kind !== 'uebung'; }), drills = all.filter(function (x) { return x.kind === 'uebung'; });
    var year = new Date().getFullYear();
    function mineIn(kind) { return d.my_participation.filter(function (p) {
      var i = all.concat(d.incidents_old || []).filter(function (x) { return x.id === p.incident_id; })[0];
      return i && +i.start.slice(0, 4) === year && (kind === 'uebung' ? i.kind === 'uebung' : i.kind !== 'uebung');
    }).length; }
    var nE = mineIn('einsatz'), nU = mineIn('uebung');
    // „Warst du dabei?“ = DU trägst dich selbst ein. Einsatzführung (weiter unten) = Beteiligung aller prüfen, Bericht, Zeiten.
    h += '<div class="ffl-sec"><div class="ffl-sh">Warst du dabei?<em>' + nE + (nE === 1 ? ' Einsatz ' : ' Einsätze ') + year + '</em></div>' +
      '<p class="ffl-mu" style="margin-top:0">' + (d.hall_limit === 'terminal' ? 'Eintragen nach dem Einsatz in der Fahrzeughalle (Dashboard Fahrzeughalle) – hier siehst du deine Einträge.' :
        'Hier trägst <b>du dich selbst</b> ein: Fahrzeug, Funktion, Atemschutz, Bescheinigung' + (d.hall_limit === 'window' ? ' – bis ' + d.hall_window + ' Stunden nach dem Alarm' : ' – bis die Einsatzführung die Liste abschließt, längstens ' + (d.self_days || 7) + ' Tage') + '. Das ersetzt die Papierliste; die Einsatzführung bestätigt.') + '</p>';
    if (!list.length) h += '<p class="ffl-mu">In den letzten 30 Tagen gab es keine Einsätze.</p>';
    list.forEach(function (i) { h += incRow(i); });
    h += '</div>';
    if (drills.length) h += '<p class="ffl-mu">Übungen und Dienstabende findest du unter <a href="#" data-tab="duties">Termine → Dienste</a>.</p>';
    if (!can('participation')) h += noRight('participation');
    return h;
  }
  // Offene Berichte der letzten 30 Tage als große Knöpfe (Ausfüllen oder „Schon erfasst …“)
  function openReports(openRep) {
    if (!openRep.length) return '<div class="ffl-sec"><div class="ffl-sh">Offene Berichte</div><p class="ffl-mu">Alles erledigt 👍 – keine offenen Einsatzberichte. Ältere Einsätze unter „Führung“.</p></div>';
    return '<div class="ffl-sec"><div class="ffl-sh">Offene Berichte<em>' + openRep.length + '</em></div><div class="ffl-repopen">' + openRep.map(function (i) {
      return '<div class="ffl-repcta"><div><b>' + esc(incLabel(i)) + '</b><span>' + dt(i.start) + ' Uhr' + (i.lead ? ' · EL: ' + esc(i.lead) : '') + ' · ' + (i.has_report ? 'Entwurf von ' + esc(i.report_by) + ' – noch nicht abgeschlossen' : 'noch nicht begonnen') + '</span></div>' +
        '<div class="ffl-row">' + (i.has_report ? '' : '<button type="button" class="ffl-q ffl-sm" data-act="repext" data-id="' + i.id + '" title="Bericht liegt schon auf Papier oder ist Altbestand">Schon erfasst …</button>') +
        '<button type="button" class="ffl-go" data-act="repopen" data-id="' + i.id + '">' + (i.has_report ? 'Weiter ausfüllen' : 'Bericht ausfüllen') + '</button></div></div>';
    }).join('') + '</div></div>';
  }
  // Führung: alle Einsätze (mit Einsatzleiter, Suche, Seiten, Export)
  function leadOverview() {
    var h = '';
    if (d.incident_manage) return h + vIncidentList();
    // Gruppenführer ohne Einsatzführungsrecht: nur die eigenen Einsätze (EL/ZF/GF)
    return h + '<div class="ffl-sec"><div class="ffl-sh">Meine Einsätze als Führungskraft</div><div class="ffl-inclist">' + d.report_access.incidents.map(function (i) {
      return '<div class="ffl-incrow ffl-incrow-s"><span class="when">' + dt(i.start).slice(0, 6) + '<small>' + dt(i.start).slice(11, 16) + '</small></span><span class="what"><b>' + esc(incLabel(i)) + '</b><span class="ffl-mu">' + (i.lead ? 'EL: ' + esc(i.lead) : '') + '</span></span>' +
        '<span class="ffl-row" style="gap:6px">' + (i.has_report ? '<button type="button" class="ffl-sm" data-act="repview" data-id="' + i.id + '">Ansehen</button>' : '') + (i.report_closed ? '' : '<button type="button" class="ffl-sm ffl-p" data-act="repopen" data-id="' + i.id + '">' + (i.has_report ? 'Bearbeiten' : 'Ausfüllen') + '</button>') + '</span></div>';
    }).join('') + '</div></div>';
  }
  // Einsatzmappe für die Einsatzführung: Bericht + Beteiligung (+ Atemschutzüberwachung und Fahrten, wenn diese Daten geladen sind)
  function repDossier(i, reportHtml, withParts) {
    var M = d.manage, pages = [];
    if (withParts && M) pages.push(MYFPrint.participants(i, (M.participation || []).filter(function (p) { return p.incident_id === i.id; }), M.members || [], M.incident_vehicles || []));
    if (M && M.asu) (M.asu.incidents || []).forEach(function (x) { if (x.id === i.id) (x.protos || []).forEach(function (p) { pages.push(MYFPrint.asu(x, p)); }); });
    return MYFPrint.dossier(reportHtml, pages);
  }
  // Schnellansicht eines Berichts: wie der Ausdruck, ohne Ausfüllstrecke; PDF mit einem Tipp
  function repViewHtml() {
    var i = incById(st.repView.id) || {};
    var log = (i.report_log || []).map(function (l) { return '<li>' + esc(dt(l.at)) + ' · ' + esc(l.by) + ': ' + esc(l.what) + (l.why ? ' – „' + esc(l.why) + '“' : '') + '</li>'; }).join('');
    return '<button type="button" class="ffl-q" style="padding:0;margin-top:12px" data-act="repviewclose">← zurück</button>' +
      '<div class="ffl-repview-bar"><div><b>' + esc(incLabel(i)) + '</b><span class="ffl-mu">' + (i.report_closed ? '🔒 abgeschlossen von ' + esc(i.report_closed_by) + ', ' + dt(i.report_closed) : 'Entwurf – zuletzt ' + (i.report_by || '') + ', ' + dt(i.report_at || '')) + '</span></div>' +
      '<div class="ffl-row"><button type="button" class="ffl-p" data-act="repviewprint">PDF / Drucken</button>' +
      (i.report_closed ? '<button type="button" data-act="repreopen" data-id="' + i.id + '">Wieder öffnen …</button>' : '<button type="button" data-act="repopen" data-id="' + i.id + '">Bearbeiten</button>') + '</div></div>' +
      (log ? '<div class="ffl-pbox"><div class="ffl-fl" style="margin-top:0">Verlauf</div><ul class="ffl-replog">' + log + '</ul></div>' : '') +
      '<div class="ffl-repview">' + st.repView.html + '</div>';
  }

  // Darf ich mich hier (noch) selbst eintragen? Je nach Einstellung nur im Zeitfenster oder nur am Terminal in der Halle
  function selfOk(i) {
    if (i.self_ok === false || i.part_closed || i.report_closed) return false; // Server entscheidet (Liste/Bericht abgeschlossen, Frist vorbei)
    if (d.hall_limit === 'terminal') return false;
    if (d.hall_limit === 'window') return new Date(i.start.replace(' ', 'T')).getTime() >= Date.now() - (d.hall_window || 6) * 3600000;
    return true;
  }
  // Formular „Warst du dabei?“: Fahrzeug, abweichende Zeiten, Atemschutz, Bescheinigung für den Arbeitgeber
  // Stand der Bescheinigung als kleiner Weg: angefragt → gedruckt (zur Unterschrift) → ausgehändigt (an den Arbeitgeber geben)
  function certTrack(p) {
    var n = p.cert === 'handed' ? 3 : p.cert === 'issued' ? 2 : 1;
    var steps = [['angefragt', p.confirmed ? 'Teilnahme bestätigt' : 'Einsatzführung bestätigt deine Teilnahme'], ['gedruckt', p.cert_printed ? 'am ' + dShort(p.cert_printed) + ' – liegt zur Unterschrift' : 'Einsatzführung druckt und unterschreibt'], ['ausgehändigt', p.cert_handed ? 'am ' + dShort(p.cert_handed) + ' – gib sie deinem Arbeitgeber, er beantragt die Erstattung bei der Gemeinde' : 'du bekommst sie unterschrieben und gibst sie deinem Arbeitgeber']];
    return '<ol class="ffl-certtrack">' + steps.map(function (s, k) { return '<li class="' + (k < n ? 'is-done' : '') + (k === n - 1 ? ' is-now' : '') + '"><b>' + s[0] + '</b><span>' + esc(s[1]) + '</span></li>'; }).join('') + '</ol>';
  }
  function partForm(i, p) {
    p = p || {};
    var veh = st.pveh || p.vehicle || '';
    var locked = p.confirmed;
    return '<div class="ffl-pform">' + (locked ? '<p class="ffl-mu">Von der Einsatzführung bestätigt – Fahrzeug und Zeiten ändert nur noch sie.</p>' :
      '<div class="ffl-fl">Auf welchem Fahrzeug?</div><div class="ffl-chips">' + d.incident_vehicles.concat(d.part_extra || []).map(function (v) {
        return '<button type="button" class="ffl-toggle-chip' + (veh === v ? ' on' : '') + ((d.part_extra || []).indexOf(v) >= 0 ? ' is-extra' : '') + '" data-act="pveh" data-v="' + esc(v) + '">' + esc(v) + '</button>';
      }).join('') + '</div>' +
      '<div class="ffl-fl">Meine Funktion (optional)</div><div class="ffl-chips ffl-roles">' + Object.keys(d.part_roles || {}).map(function (k) {
        var on = (st.prole || (p.role || '').split(',')).indexOf(k) >= 0;
        return '<button type="button" class="ffl-toggle-chip' + (on ? ' on' : '') + '" data-act="prole" data-v="' + k + '" title="' + esc(d.part_roles[k]) + '">' + k + '</button>';
      }).join('') + '</div>' +
      '<details style="margin-top:10px"' + (p.t_start || p.t_end ? ' open' : '') + '><summary class="ffl-mu" style="cursor:pointer">Meine Zeit weicht von der des Fahrzeugs ab</summary><div class="ffl-form2" style="margin-top:6px">' +
      '<div><label class="ffl-fl">von</label><input type="datetime-local" id="myf-pstart" value="' + esc(dtLocal(p.t_start)) + '"></div>' +
      '<div><label class="ffl-fl">bis</label><input type="datetime-local" id="myf-pend" value="' + esc(dtLocal(p.t_end)) + '"></div></div></details>' +
      // Atemschutz: selbst nur „AGT“ antippen – die Minuten kommen aus der Atemschutzüberwachung (Verwaltung → Atemschutz)
      (d.agt ? '<p class="ffl-mu" style="margin:8px 0 0">Unter Atemschutz? Oben „AGT“ antippen. ' + (p.as_minutes ? 'Laut Atemschutzüberwachung: <b>' + p.as_minutes + ' min</b>.' : 'Die Minuten trägt die Atemschutzüberwachung ein.') + '</p>' : '')) +
      '<label class="ffl-check" style="margin-top:12px"><input type="checkbox" id="myf-pcert"' + (p.cert ? ' checked' : '') + (p.cert === 'issued' || p.cert === 'handed' ? ' disabled' : '') + '> Bescheinigung für meinen Arbeitgeber (Verdienstausfall)</label>' +
      (p.cert ? certTrack(p) : '') +
      '<div id="myf-pwork" style="margin-top:6px' + (p.cert ? '' : ';display:none') + '"><div class="ffl-fl">Arbeit wieder aufgenommen</div><div class="ffl-row">' +
      '<label class="ffl-check"><input type="radio" name="myf-pw" value="time"' + (/^\d/.test(p.work_resume || '') ? ' checked' : '') + '> um</label><input type="time" id="myf-pwt" value="' + esc(/^\d/.test(p.work_resume || '') ? p.work_resume : '') + '" style="width:auto">' +
      '<label class="ffl-check"><input type="radio" name="myf-pw" value="none"' + (p.work_resume === 'none' ? ' checked' : '') + '> an dem Tag nicht mehr</label></div>' +
      '<p class="ffl-mu" style="margin:4px 0 0">Für die Bescheinigung brauchen wir Geburtsdatum, -ort und Anschrift – unter „Profil“ eintragen.</p></div>' +
      '<div class="ffl-row" style="margin-top:12px"><button type="button" class="ffl-p" data-act="psave" data-id="' + i.id + '">Speichern</button>' +
      '<button type="button" data-act="pcancel">Abbrechen</button>' + (p.id && !locked ? '<button type="button" class="ffl-q" style="margin-left:auto" data-act="premove" data-id="' + i.id + '">Doch nicht dabei</button>' : '') + '</div></div>';
  }

  // ---- Einsatzführung: Liste, Detail, Bericht --------------------------------------
  function vIncidentList() {
    var M = d.manage, parts = M.participation;
    // Tipp für die Einsatzführung: SPIND als App auf den Startbildschirm (einmal, wegklickbar)
    var tip = load('hometip') !== '1' && !(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ? '<div class="ffl-msg ffl-hometip"><b>Tipp:</b> ' +
      (/iPhone|iPad/.test(navigator.userAgent) ? 'In Safari „Teilen“ → „Zum Home-Bildschirm“ – dann ist der Einsatzbericht nach jedem Einsatz nur einen Tipp entfernt.' : 'Im Browser-Menü „Zum Startbildschirm hinzufügen“ – dann ist der Einsatzbericht nach jedem Einsatz nur einen Tipp entfernt.') +
      ' <button type="button" class="ffl-q ffl-sm" data-act="hometip">Ausblenden</button></div>' : '';
    var mk = st.tab === 'duties' ? 'uebung' : 'einsatz';
    var h = '<div class="ffl-sec"><div class="ffl-sh ffl-sh-act">' + (mk === 'uebung' ? 'Übungen verwalten' : 'Einsatzführung') +
      '<button type="button" class="ffl-addbtn" data-act="incnew" data-v="' + mk + '">' + '<b aria-hidden="true">+</b><span>' + (mk === 'uebung' ? 'Übung' : 'Einsatz') + '</span></button></div>' + (mk === 'uebung' ? '' : tip) +
      '<p class="ffl-mu ffl-lead-intro">' + (mk === 'uebung' ? 'Teilnahme prüfen, bestätigen und die Liste abschließen.' : 'Beteiligung bestätigen, Bericht schreiben, Liste abschließen.') + '</p>';
    // Neuer Einsatz: nächste freie Nummer schon eingetragen (oder eigene, abweichende); kommt später der Alarm oder der
    // Website-Bericht, wird beides automatisch mit diesem Einsatz verknüpft
    if (st.incNew && st.incNew !== mk) st.incNew = null;
    if (st.incNew) { var nu = d.member.unit || ((M.units || [])[0] || {}).key || '';
      h += incHeadForm({ kind: st.incNew, unit: nu, start: st.incNew === 'einsatz' ? nowLocal() : '', title: '', place: '', category: st.incNew === 'uebung' ? 'sonst' : 'th', nr: nextNr(st.incNew, nu) }); }
    var all = M.incidents.filter(function (i) { return mk === 'uebung' ? i.kind === 'uebung' : i.kind !== 'uebung'; }), yr = new Date().getFullYear();
    var L = MYFUI.lt(st, 'lead_' + mk, all, { noun: mk === 'uebung' ? 'Übungen' : 'Einsätze', ph: 'Nummer, Stichwort, Ort, Einsatzleiter …', per: 15,
      text: function (i) { return [i.nr, i.title, i.place, i.lead, dt(i.start)].join(' '); },
      sorts: [['neu', 'neueste zuerst', function (i) { return i.start; }, -1], ['alt', 'älteste zuerst', function (i) { return i.start; }, 1], ['offen', 'Bericht offen zuerst', function (i) { return (i.report_closed ? 2 : i.has_report ? 1 : 0) + '|' + (9e12 - Date.parse(i.start.replace(' ', 'T'))); }, 1]],
      // Ein Export-Knopf für den gewählten Zeitraum (bei „letzte 12 Monate“: laufendes Jahr) – egal wie viele Jahre es gibt
      extra: '<select id="myf-iyear" style="width:auto" aria-label="Zeitraum"><option value="">letzte 12 Monate</option>' + (M.incident_years || []).map(function (y) { return '<option value="' + y + '"' + (+st.iYear === y ? ' selected' : '') + '>' + y + '</option>'; }).join('') + '</select>' +
        '<button type="button" class="ffl-sm ffl-xls" data-act="inccsv" data-k="' + mk + '" data-v="' + (st.iYear || yr) + '" title="Alle Einsätze ' + (st.iYear || yr) + ' als Tabelle für Excel herunterladen (ohne personenbezogene Felder)">↓ Excel ' + (st.iYear || yr) + '</button>' });
    h += L.bar + '<div class="ffl-inclist">' + L.rows.map(function (i) {
      var ps = parts.filter(function (p) { return p.incident_id === i.id; }), unconf = ps.filter(function (p) { return !p.confirmed; }).length, cert = ps.filter(function (p) { return p.cert === 'requested'; }).length;
      return '<button type="button" class="ffl-incrow" data-act="incopen" data-id="' + i.id + '"><span class="when">' + dt(i.start).slice(0, 6) + '<small>' + dt(i.start).slice(11, 16) + '</small></span>' +
        '<span class="what"><b>' + esc(incLabel(i)) + '</b>' + (i.lead ? '<small class="ffl-lead">Einsatzleiter: ' + esc(i.lead) + '</small>' : '') + '<span class="ffl-chips">' + (i.part_closed ? '<span class="ffl-chip st-ok">Liste abgeschlossen</span>' : '') + ((i.alarms || []).some(function (a) { return a.k === 'Erhöhung'; }) ? '<span class="ffl-chip st-bad">Erhöhung</span>' : '') + (i.source === 'test' ? '<span class="ffl-chip st-no">Test</span>' : '') +
        '<span class="ffl-chip ' + (unconf ? 'st-warn' : ps.length ? 'st-ok' : 'st-open') + '">' + ps.length + ' dabei' + (unconf ? ' · ' + unconf + ' offen' : '') + '</span>' +
        (i.kind === 'einsatz' ? '<span class="ffl-chip ' + (i.report_closed ? 'st-ok' : i.has_report ? 'st-open' : 'st-warn') + '"' + (i.report_ext ? ' title="' + esc(i.report_ext) + '"' : '') + '>' + (i.report_ext ? 'Bericht auf Papier' : i.report_closed ? 'Bericht 🔒' : i.has_report ? 'Bericht Entwurf' : 'Bericht offen') + '</span>' : '') +
        (cert ? '<span class="ffl-chip st-warn">' + cert + ' Bescheinigung' + (cert > 1 ? 'en' : '') + '</span>' : '') + '</span></span><i>›</i></button>';
    }).join('') + (M.incidents.length ? '' : '<p class="ffl-mu">Noch keine Einsätze.</p>') + '</div>' +
      L.pager + '</div>';
    return h;
  }

  // Alarmierungen eines Einsatzes: Erstalarm, Erhöhung, Nachalarmierung – mit Uhrzeit
  function alarmsHtml(i) {
    var a = i.alarms || [];
    if (!a.length && !i.ext_nr) return '';
    return '<div class="ffl-alarms"><span class="ffl-fl" style="margin:0">Alarmierungen' + (i.ext_nr ? ' · Leitstelle Nr. ' + esc(i.ext_nr) : '') + '</span>' + a.map(function (x) {
      return '<span class="ffl-chip ' + (x.k === 'Erhöhung' ? 'st-bad' : x.k === 'Nachalarmierung' ? 'st-warn' : 'st-open') + '">' + esc(String(x.t).slice(11, 16)) + ' ' + esc(x.k === 'Alarm' ? '' : x.k + ': ') + esc(x.kw) + '</span>';
    }).join('') + '</div>';
  }
  // Nächste freie Nummer je Art (Einsatz/Übung) und Einheit – immer vorausgefüllt, überschreibbar
  function nextNr(kind, unit) { var n = (d.manage && d.manage.next_nrs) || {}; return ((n[kind === 'uebung' ? 'uebung' : 'einsatz'] || {})[unit] || (kind === 'uebung' ? '' : d.manage && d.manage.next_nr) || ''); }
  function nowLocal() { var t = new Date(Date.now() - new Date().getTimezoneOffset() * 60000); return t.toISOString().slice(0, 16).replace('T', ' ') + ':00'; }
  function incHeadForm(i) {
    var dpl = !i.id && i.kind === 'uebung' ? (d.drills_recent || []).concat(d.drills || []).filter(function (r) { return r.date >= addDaysIso(today(), -21) && r.date <= addDaysIso(today(), 7); }) : [];
    return '<div class="ffl-pform" data-incform="' + (i.id || 0) + '">' +
      (dpl.length ? '<label class="ffl-fl" style="margin-top:0">Aus dem Dienstplan übernehmen</label><select id="myf-drillpick"><option value="">– Termin wählen –</option>' + dpl.map(function (r, n) {
        return '<option value="' + n + '" data-title="' + esc(r.title) + '" data-start="' + esc(r.date + 'T' + (r.time || '19:30')) + '">' + esc(dShort(r.date) + ' ' + (r.time || '') + ' · ' + r.title) + '</option>'; }).join('') + '</select>' : '') +
      '<div class="ffl-form4">' +
      '<div><label class="ffl-fl">Art</label><select data-if="kind"><option value="einsatz"' + (i.kind === 'einsatz' ? ' selected' : '') + '>Einsatz</option><option value="uebung"' + (i.kind === 'uebung' ? ' selected' : '') + '>Übung / Dienst</option></select></div>' +
      ((d.manage.units || []).length > 1 ? '<div><label class="ffl-fl">Einheit</label><select data-if="unit">' + d.manage.units.map(function (u) { return '<option value="' + esc(u.key) + '"' + (i.unit === u.key ? ' selected' : '') + '>' + esc(u.label) + '</option>'; }).join('') + '</select></div>' : '') +
      '<div><label class="ffl-fl">Nummer' + (!i.id ? ' <span class="ffl-mu" style="font-weight:400">(nächste freie)</span>' : '') + '</label><input type="text" data-if="nr" value="' + esc(i.nr) + '"' + (!i.id ? ' data-auto="1"' : '') + ' placeholder="z. B. 07/2026 oder eigene"></div>' +
      '<div class="span2"><label class="ffl-fl">Stichwort / Titel</label><input type="text" data-if="title" value="' + esc(i.title) + '" placeholder="z. B. Hilfe P-Tür"></div>' +
      '<div><label class="ffl-fl">Kategorie</label><select data-if="category">' + Object.keys(d.incident_cats).map(function (k) { return '<option value="' + k + '"' + (i.category === k ? ' selected' : '') + '>' + esc(d.incident_cats[k]) + '</option>'; }).join('') + '</select></div>' +
      '<div><label class="ffl-fl">Beginn (Alarm)</label><input type="datetime-local" data-if="start" value="' + esc(dtLocal(i.start)) + '"></div>' +
      '<div><label class="ffl-fl">Ende</label><input type="datetime-local" data-if="end" value="' + esc(dtLocal(i.end)) + '"></div>' +
      '<div class="span2"><label class="ffl-fl">Einsatzort</label><input type="text" data-if="place" value="' + esc(i.place) + '" placeholder="Straße, Hausnummer"></div></div>' +
      (!i.id && i.kind === 'einsatz' ? '<p class="ffl-mu" style="margin:8px 0 0">Für Einsätze, die noch nicht im System sind (z. B. auf dem Weg von der Leitstelle eröffnet). Kommt später der Alarm aus Alamos oder der Bericht aus der Einsatzverwaltung, wird beides automatisch mit diesem Einsatz verknüpft – Beteiligung, Bericht, Halle und Fahrtenbuch bleiben zusammen.</p>' : '') +
      (i.id ? '' : '<div class="ffl-row" style="margin-top:10px"><button type="button" class="ffl-p" data-act="incsave" data-id="0">Anlegen</button><button type="button" data-act="incnewcancel">Abbrechen</button></div>') + '</div>';
  }

  // Fahrzeuge & Zeiten: Fahrzeuge mit eingetragener Besatzung sind schon angehakt; Zeiten mit einem Tipp für alle übernehmen
  function vehTimes(i, parts, M) {
    var vt = {}; (i.vehicles || []).forEach(function (x) { vt[x.v] = x; });
    var hasSaved = (i.vehicles || []).length > 0;
    return '<div class="ffl-sec"><div class="ffl-sh">Fahrzeuge & Zeiten</div><div class="ffl-scroll"><table class="ffl-table ffl-stack" data-vehtable="1"><thead><tr><th>Fahrzeug</th><th>Ausrücken</th><th>Einsatzstelle an</th><th>Einrücken</th></tr></thead><tbody>' +
      M.incident_vehicles.slice().sort(function (a, b) {
        var w = function (v) { return vt[v] ? 2 : parts.some(function (p) { return p.vehicle === v; }) ? 1 : 0; }; return w(b) - w(a);
      }).map(function (v) {
        var x = vt[v] || {}, crew = parts.filter(function (p) { return p.vehicle === v; }).length, on = vt[v] || (!hasSaved && crew);
        return '<tr data-veh="' + esc(v) + '"' + (on ? '' : ' class="is-off"') + '><td class="full"><label class="ffl-check"><input type="checkbox" data-vf="on"' + (on ? ' checked' : '') + '> ' + esc(v) + (crew ? ' <small class="ffl-mu">(' + crew + ' Pers.)</small>' : '') + '</label></td>' +
          '<td data-l="Ausrücken"><input type="time" data-vf="out" value="' + esc(x.out || '') + '"></td><td data-l="an Einsatzstelle"><input type="time" data-vf="at" value="' + esc(x.at || '') + '"></td><td data-l="Einrücken"><input type="time" data-vf="in" value="' + esc(x.in || '') + '"></td></tr>';
      }).join('') + '</tbody></table></div><div class="ffl-row" style="margin-top:8px"><button type="button" class="ffl-sm" data-act="vtalarm" data-id="' + i.id + '">Alarmzeit als Ausrücken</button>' +
      '<button type="button" class="ffl-sm" data-act="vtcopy">Zeiten der ersten Zeile für alle übernehmen</button></div>' +
      '<p class="ffl-mu" style="margin:6px 0 0">Die Zeiten stehen im Einsatzbericht (Ausdruck/PDF) – einmal eintragen reicht.</p></div>';
  }
  // Bescheinigung je Person direkt in der Beteiligung: beantragen (auch für jemanden), nach dem Bestätigen gleich ansehen & drucken
  function partCertCell(p) {
    if (p.cert === 'handed') return '<span class="ffl-chip st-ok">ausgehändigt</span>';
    if (p.cert === 'issued') return '<span class="ffl-chip st-ok">gedruckt – zur Unterschrift</span> <button type="button" class="ffl-q ffl-sm" data-act="startcert" title="In der Übersicht Verdienstausfall aushändigen">Aushändigen …</button>';
    if (p.cert === 'requested') return p.confirmed ? '<button type="button" class="ffl-sm ffl-p" data-act="partcertprint" data-id="' + p.id + '">Drucken</button>' : '<span class="ffl-chip st-warn" title="Erst die Teilnahme bestätigen, dann drucken">angefragt</span>';
    return '<button type="button" class="ffl-q ffl-sm" data-act="partcertreq" data-id="' + p.member_id + '">+ beantragen</button>';
  }
  // Versehentlich angelegt (Testalarm, doppelt): löschen mit Begründung – nur solange Bericht und Liste nicht abgeschlossen sind
  function incDelRow(i) {
    return d.incident_manage && !i.report_closed && !i.part_closed ? '<div class="ffl-danger"><div><b>Versehentlich angelegt?</b><span>Testalarm, doppelt erfasst – nur mit Begründung, steht im Änderungsprotokoll. Abgeschlossene Berichte lassen sich nicht löschen.</span></div>' +
      '<button type="button" class="ffl-sm ffl-danger-btn" data-act="incdel" data-id="' + i.id + '">Einsatz löschen …</button></div>' : '';
  }
  function vIncidentManage() {
    var M = d.manage, i = M.incidents.filter(function (x) { return x.id === st.inc; })[0];
    if (!i) { st.inc = null; return vIncidents(); }
    var parts = M.participation.filter(function (p) { return p.incident_id === i.id; });
    var mem = {}; M.members.forEach(function (m) { mem[m.id] = m; });
    parts.sort(function (a, b) { return ((mem[a.member_id] || {}).name || '') > ((mem[b.member_id] || {}).name || '') ? 1 : -1; });
    var h = '<button type="button" class="ffl-q" style="padding:0;margin-top:12px" data-act="incback">' + (i.kind === 'uebung' ? '← Dienste & Übungen' : '← alle Einsätze') + '</button>';
    if (i.kind === 'einsatz' && i.report_ext) h += '<div class="ffl-repcta ffl-repext"><div><b>Bericht anderweitig erfasst</b><span>„' + esc(i.report_ext) + '“ – ' + esc(i.report_closed_by) + ', ' + dt(i.report_closed) + '</span></div><div class="ffl-row">' +
      '<button type="button" data-act="repreopen" data-id="' + i.id + '">Doch hier ausfüllen …</button></div></div>';
    else if (i.kind === 'einsatz') h += '<div class="ffl-repcta"><div><b>' + (i.report_closed ? '🔒 Einsatzbericht abgeschlossen' : i.has_report ? 'Einsatzbericht – Entwurf' : 'Einsatzbericht noch offen') + '</b><span>' +
      (i.report_closed ? 'von ' + esc(i.report_closed_by) + ', ' + dt(i.report_closed) : i.has_report ? 'zuletzt von ' + esc(i.report_by) + ', ' + dt(i.report_at) : 'dauert ca. 3 Minuten – wird automatisch gespeichert') + (i.lead ? ' · EL: ' + esc(i.lead) : '') + '</span></div><div class="ffl-row">' +
      (i.has_report ? '<button type="button" data-act="repview" data-id="' + i.id + '">Ansehen / PDF</button>' : '') +
      (i.report_closed || i.has_report ? '' : '<button type="button" class="ffl-q" data-act="repext" data-id="' + i.id + '" title="Bericht liegt schon auf Papier oder ist Altbestand">Schon erfasst …</button>') +
      (i.report_closed ? '' : '<button type="button" class="ffl-go" data-act="repopen" data-id="' + i.id + '">' + (i.has_report ? 'Weiter ausfüllen' : 'Bericht ausfüllen') + '</button>') + '</div></div>';
    h += '<div class="ffl-sec"><div class="ffl-sh">' + esc(incLabel(i)) + '<em>' + dt(i.start) + ' Uhr</em></div>' +
      alarmsHtml(i) +
      (i.alarm_text ? '<div class="ffl-pbox" style="margin-bottom:12px"><div class="ffl-fl">Alarmtext (FE2)</div><div style="white-space:pre-wrap">' + esc(i.alarm_text) + '</div></div>' : '') +
      (i.report_closed ? '<div class="ffl-msg ok">🔒 Bericht abgeschlossen – Einsatzdaten, Fahrzeugzeiten und Beteiligung sind festgeschrieben. Ändern nur über „Bericht wieder öffnen“ (mit Begründung).</div>' +
        '<dl class="ffl-incro"><dt>Art</dt><dd>' + esc((d.incident_cats || {})[i.category] || '') + '</dd><dt>Beginn</dt><dd>' + dt(i.start) + ' Uhr</dd>' + (i.end ? '<dt>Ende</dt><dd>' + dt(i.end) + ' Uhr</dd>' : '') + (i.place ? '<dt>Einsatzort</dt><dd>' + esc(i.place) + '</dd>' : '') + '</dl>' : incHeadForm(i)) +
      // Versehentlich angelegt (Testalarm, doppelt): löschen mit Begründung – nur solange kein Bericht und keine abgeschlossene Liste
      '</div>';
    // Offene Anfragen (Austragen, Bescheinigungen) stehen oben im Abschnitt „Beteiligte“ – dorthin springt auch die Benachrichtigung
    var partBoxes = '';
    var openCert = parts.filter(function (p) { return p.cert === 'requested'; });
    // Wer sich nach der Bestätigung wieder austragen möchte: die Einsatzführung entscheidet
    var reqs = parts.filter(function (p) { return p.change_req; });
    if (reqs.length) partBoxes += '<div class="ffl-msg warn ffl-partreq"><b>' + (reqs.length === 1 ? '1 Person möchte' : reqs.length + ' Personen möchten') + ' ausgetragen werden</b>' + reqs.map(function (p) {
      var m = mem[p.member_id] || { name: '(gelöscht)' };
      return '<div class="ffl-row"><span class="ffl-partreq-who"><b>' + esc(m.name) + '</b><span class="ffl-mu">' + esc(p.change_req.replace(/^raus:?\s*/, '') || 'ohne Grund') + '</span></span>' +
        '<button type="button" class="ffl-sm ffl-p" data-act="partreqok" data-id="' + p.member_id + '">Austragen</button><button type="button" class="ffl-sm" data-act="partreqno" data-id="' + p.member_id + '">Bleibt drin</button></div>';
    }).join('') + '</div>';
    // Bescheinigungen für den Arbeitgeber: wer, was fehlt, wie geht's weiter
    if (openCert.length) partBoxes += '<div class="ffl-msg warn ffl-certbox"><b>' + (openCert.length === 1 ? '1 Bescheinigung' : openCert.length + ' Bescheinigungen') + ' für den Arbeitgeber angefragt</b>' +
      '<div>' + openCert.map(function (p) { var m = mem[p.member_id] || { name: '(gelöscht)' }; return esc(m.name) + (p.confirmed ? '' : ' <span class="ffl-chip st-open">Teilnahme noch bestätigen</span>'); }).join(' · ') + '</div>' +
      '<div class="ffl-mu">So geht\'s: Teilnahme bestätigen → unten bei „Bescheinigungen für den Arbeitgeber“ ansehen & drucken → unterschreiben (Leiter der Feuerwehr, Löschzugführer oder Einsatzleiter) → in der Übersicht Verdienstausfall aushändigen. Das Mitglied gibt sie seinem Arbeitgeber, der die Erstattung bei der Gemeinde beantragt.</div></div>';
    if (!i.report_closed) h += vehTimes(i, parts, M);
    // Liste abschließen und Plausibilität gehören zur Beteiligung – stehen unten im Abschnitt „Beteiligte“
    var closeRow = i.report_closed ? '' : '<div class="ffl-msg ' + (i.part_closed ? 'ok' : '') + ' ffl-row" style="justify-content:space-between;margin-top:12px">' + (i.part_closed ? '<span><b>Liste abgeschlossen</b> ' + esc(dt(i.part_closed)) + (i.part_closed_by ? ' von ' + esc(i.part_closed_by) : '') + ' – Mitglieder tragen sich nicht mehr selbst ein.</span><button type="button" class="ffl-sm" data-act="partclose" data-v="0" data-id="' + i.id + '">Wieder öffnen</button>'
      : '<span>Mitglieder können sich noch selbst eintragen (längstens ' + (d.self_days || 7) + ' Tage). Wenn alles stimmt:</span><button type="button" class="ffl-sm ffl-p" data-act="partclose" data-v="1" data-id="' + i.id + '">Beteiligung abschließen</button>') + '</div>';
    // Plausibilität: ein EL, ein ZF je Zug, je Fahrzeug ein GF und ein MA – als Hinweis, die Einsatzführung entscheidet
    var hints = MYFUI.roleHints(parts, function (p) { return (mem[p.member_id] || { name: '?' }).name; }, d.part_extra);
    var hintsBox = hints.length ? '<div class="ffl-msg warn ffl-rolehints"><b>Bitte prüfen:</b> ' + hints.map(esc).join('<br>') + '</div>' : '';
    if (i.report_closed) h += '<div class="ffl-msg ok">🔒 Bericht abgeschlossen – die Beteiligung ist festgeschrieben und wird hier nur noch angezeigt. Ändern nur über „Wieder öffnen“ beim Bericht (mit Begründung im Protokoll).</div>';
    // Du selbst: war ich dabei? Eintragen führt zum eigenen Formular (Fahrzeug, Zeiten, Atemschutz, Bescheinigung) und wieder zurück
    var mp = myPart(i.id), selfRow = '';
    if (mp) selfRow = '<div class="ffl-selfrow"><span class="ffl-chip ' + (mp.confirmed ? 'st-ok' : 'st-open') + '">Du: dabei' + (mp.vehicle ? ' · ' + esc(mp.vehicle) : '') + (mp.confirmed ? ' · bestätigt' : '') + '</span>' +
      (mp.confirmed ? '' : '<button type="button" class="ffl-q ffl-sm" data-act="selfpart" data-id="' + i.id + '">Ändern</button>') + '</div>';
    else if (can('participation') && selfOk(i)) selfRow = '<div class="ffl-selfrow"><span class="ffl-mu">Du selbst bist noch nicht eingetragen.</span>' + (st.pform === i.id ? '' : '<button type="button" class="ffl-sm ffl-go" data-act="selfpart" data-id="' + i.id + '">Ich war dabei</button>') + '</div>';
    if (st.pform === i.id && (mp || selfOk(i)) && !i.report_closed) selfRow += '<div class="ffl-selfform">' + partForm(i, mp) + '</div>';
    h += '<div class="ffl-sec' + (i.report_closed ? ' ffl-partlocked' : '') + '"><div class="ffl-sh">Beteiligte<em>' + parts.length + (parts.length === 1 ? ' Person · ' : ' Personen · ') + parts.filter(function (p) { return p.confirmed; }).length + ' bestätigt</em></div>' +
      partBoxes + selfRow + (parts.length ? (parts.some(function (p) { return !p.confirmed; }) ? '<div class="ffl-bulk"><span>' + parts.filter(function (p) { return !p.confirmed; }).length + ' noch unbestätigt – stimmt die Liste?</span><button type="button" class="ffl-sm ffl-p" data-act="pokall" data-id="' + i.id + '">Alle bestätigen</button></div>' : '') : '<p class="ffl-mu">Noch niemand eingetragen – Mitglieder tragen sich selbst ein oder du trägst unten nach.</p>') +
      (parts.length ? '<div class="ffl-scroll"><table class="ffl-table ffl-stack"><thead><tr><th>Name</th><th>Fahrzeug</th><th>Funktion</th><th>von*</th><th>bis*</th><th>Atemschutz (Min.)</th><th>Bescheinigung</th><th>bestätigt</th><th></th></tr></thead><tbody>' +
      parts.map(function (p) {
        var m = mem[p.member_id] || { name: '(gelöscht)' };
        return '<tr data-part="' + p.member_id + '"><td class="name"><b>' + esc(m.name) + '</b>' + (p.source === 'terminal' ? ' <span class="ffl-chip st-open" title="am Terminal in der Halle eingetragen">Halle</span>' : '') + (p.change_req ? ' <span class="ffl-chip st-warn">will raus</span>' : '') + '</td><td data-l="Fahrzeug"><select data-pf="vehicle"><option value="">–</option>' + M.incident_vehicles.concat(M.part_extra || []).map(function (v) { return '<option' + (p.vehicle === v ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join('') + '</select></td>' +
          '<td data-l="Funktion" class="ffl-rolecell">' + Object.keys(M.part_roles || {}).map(function (k) { var on = (p.role || '').split(',').indexOf(k) >= 0;
            return '<button type="button" class="ffl-rolechip' + (on ? ' on' : '') + '" data-act="partrole" data-id="' + p.member_id + '" data-v="' + k + '" title="' + esc(M.part_roles[k]) + '" aria-pressed="' + on + '">' + k + '</button>'; }).join('') + '</td>' +
          '<td data-l="von*"><input type="time" data-pf="ts" value="' + esc(p.t_start ? p.t_start.slice(11, 16) : '') + '"></td><td data-l="bis*"><input type="time" data-pf="te" value="' + esc(p.t_end ? p.t_end.slice(11, 16) : '') + '"></td>' +
          // Minuten nur anzeigen: Quelle ist die Atemschutzüberwachung (Verwaltung → Atemschutz)
          '<td data-l="Atemschutz min" title="aus der Atemschutzüberwachung – ändern unter Verwaltung → Atemschutz">' + (p.as_minutes ? p.as_minutes + ' min' : (p.role || '').split(',').indexOf('AGT') >= 0 ? '<span class="ffl-mu">AGT · Zeit folgt</span>' : '–') + '</td>' +
          '<td data-l="Bescheinigung">' + partCertCell(p) + '</td>' +
          '<td data-l="bestätigt"><input type="checkbox" data-pf="ok"' + (p.confirmed ? ' checked' : '') + '></td><td class="del"><button type="button" class="ffl-q ffl-sm" data-act="partdel" data-id="' + p.member_id + '" title="entfernen">✕</button></td></tr>';
      }).join('') + '</tbody></table></div>' : '') +
      // Nachtragen: Suche über alle Mitglieder (Vor- oder Nachname, Teil reicht), Treffer antippen = eingetragen
      (i.report_closed ? '' : '<div class="ffl-padd"><div class="ffl-fl">Person nachtragen</div><div class="ffl-row"><select id="myf-paddveh" style="width:auto" aria-label="Fahrzeug">' +
      M.incident_vehicles.concat(M.part_extra || []).map(function (v) { return '<option>' + esc(v) + '</option>'; }).join('') + '</select>' +
      '<input type="search" id="myf-paddname" data-inc="' + i.id + '" autocomplete="off" placeholder="Name tippen, z. B. „Schm“ …" style="flex:1 1 220px;width:auto"></div>' +
      '<div class="ffl-chips ffl-padd-res" id="myf-paddres"></div></div>') +
      '<p class="ffl-mu">* nur wenn abweichend von der Fahrzeugzeit. Änderungen in der Tabelle werden sofort gespeichert. Atemschutz-Minuten kommen aus der Atemschutzüberwachung (Verwaltung → Atemschutz).</p>' +
      hintsBox + closeRow + '</div>';
    // Ausdrucke als Kacheln: „Ansehen“ öffnet jeweils die Vorschau mit PDF / Drucken
    var certAll = parts.filter(function (p) { return p.cert; }), nIss = certAll.filter(function (p) { return p.cert === 'issued'; }).length, nHand = certAll.filter(function (p) { return p.cert === 'handed'; }).length;
    var nUnconf = parts.filter(function (p) { return !p.confirmed; }).length, certReady = openCert.some(function (p) { return p.confirmed; });
    h += '<div class="ffl-sec"><div class="ffl-sh">Bericht & Ausdrucke</div>' + MYFUI.docCards([
      i.kind === 'einsatz' || i.has_report ? { title: i.kind === 'uebung' ? 'Übungsbericht' : 'Einsatzbericht',
        chip: i.report_closed ? { tone: 'ok', label: 'Abgeschlossen' } : i.has_report ? { tone: 'open', label: 'Entwurf' } : { tone: 'warn', label: 'Noch offen' },
        sub: i.report_closed ? dShort(i.report_closed) + ' · mit Beteiligung als Seite 2' : i.has_report ? 'zuletzt ' + (i.report_by || '') : 'dauert ca. 3 Minuten',
        acts: [i.has_report ? { act: 'repview', id: i.id, label: 'Ansehen / PDF' } : null, i.report_closed ? null : { act: 'repopen', id: i.id, label: i.has_report ? 'Bearbeiten' : 'Ausfüllen', p: true }] } : null,
      { title: 'Beteiligungsliste',
        chip: nUnconf ? { tone: 'warn', label: nUnconf + ' unbestätigt' } : parts.length && i.part_closed ? { tone: 'ok', label: 'Abgeschlossen' } : null,
        sub: parts.length + (parts.length === 1 ? ' Person' : ' Personen') + ' · ' + (parts.length - nUnconf) + ' bestätigt',
        acts: [{ act: 'partprint', id: i.id, label: 'Ansehen / PDF', off: !parts.length }] },
      { title: 'Bescheinigungen für den Arbeitgeber',
        chip: openCert.length ? { tone: 'warn', label: openCert.length + ' angefragt' } : certAll.length ? { tone: 'ok', label: 'Erledigt' } : null,
        sub: certAll.length ? [nIss ? nIss + ' gedruckt – zur Unterschrift' : '', nHand ? nHand + ' ausgehändigt' : '', openCert.length && !certReady ? 'erst Teilnahme bestätigen' : ''].filter(Boolean).join(' · ') : 'keine angefragt',
        acts: [{ act: 'certprint', id: i.id, label: certReady ? 'Drucken' : 'Ansehen / PDF', p: certReady, off: !certAll.length }, { act: 'startcert', label: 'Verdienstausfall' }] }
    ]) + '</div>';
    return h + webBox(i, M) + incDelRow(i) + incBar(i);
  }
  // Eine Speichern-Leiste für Einsatzdaten und Fahrzeugzeiten – erscheint, sobald dort etwas geändert wurde (Beteiligte speichern sofort)
  function incBar(i) {
    return i.report_closed ? '' : '<div class="ffl-savebar" id="myf-ibar"' + (st.idirty === i.id ? '' : ' hidden') + '><span>Ungespeicherte Änderungen</span><button type="button" class="ffl-q" data-act="incdiscard">Verwerfen</button><button type="button" class="ffl-p" data-act="incsaveall" data-id="' + i.id + '">Speichern</button></div>';
  }
  function incDirty() { st.idirty = st.inc; var bar = document.getElementById('myf-ibar'); if (bar) bar.hidden = false; }
  // Bericht für die Website (Plugin „Einsatzverwaltung“): nur öffentliche Angaben – keine Namen, Kennzeichen, Hausnummern
  function webBox(i, M) {
    var w = M.web || {};
    if (!w.available) return '';
    var h = '<div class="ffl-sec"><div class="ffl-sh">Für die Website</div>';
    if (i.web) return h + '<div class="ffl-msg ok">' + (i.web.status === 'publish' ? 'Veröffentlicht' : 'Als Entwurf angelegt – wird von der Verwaltung freigegeben') +
      (i.web.link ? ' · <a href="' + esc(i.web.link) + '" target="_blank" rel="noopener">ansehen ↗</a>' : '') + '</div></div>';
    if (!w.can) return h + '<p class="ffl-mu">Website-Berichte schreibt bei euch die Verwaltung.</p></div>';
    var used = (i.vehicles || []).map(function (x) { return x.v; });
    // Vorschlag aus Einsatzdaten und internem Einsatzbericht (vom Server: ohne 🔒-Felder, Kennzeichen/Hausnummern entfernt)
    var sg = (st.webSug || {})[i.id];
    if (!sg && st.webSugBusy !== i.id) {
      st.webSugBusy = i.id;
      api('POST', 'me/incident/websuggest', { id: i.id }).then(function (r) { st.webSug = st.webSug || {}; st.webSug[i.id] = r; st.webSugBusy = null; if (st.inc === i.id) render(); }, function () { st.webSugBusy = null; });
    }
    sg = sg || {};
    var place = sg.location != null ? sg.location : String(i.place || '').replace(/\s+\d+\s*[a-zA-Z]?(?=\s*(,|$))/, '');
    return h + '<div class="ffl-pbox" data-webform="' + i.id + '"><div class="ffl-form2">' +
      '<div class="span2"><label class="ffl-fl">Titel</label><input type="text" data-wf="title" value="' + esc(sg.title || (i.nr ? 'Einsatz ' + i.nr + ' ' : '') + i.title) + '"></div>' +
      '<div><label class="ffl-fl">Einsatzart</label><select data-wf="keyword"><option value="">– keine –</option>' + (w.types || []).concat(sg.keyword && (w.types || []).indexOf(sg.keyword) < 0 ? [sg.keyword] : []).map(function (t) { return '<option' + (t === sg.keyword ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select></div>' +
      '<div><label class="ffl-fl">Einsatzort (ohne Hausnummer)</label><input type="text" data-wf="location" value="' + esc(place) + '"></div></div>' +
      ((w.vehicles || []).length ? '<label class="ffl-fl">Fahrzeuge</label><div class="ffl-chips">' + w.vehicles.map(function (v) {
        var on = used.some(function (u) { return u.replace(/\s/g, '').toLowerCase() === v.replace(/\s/g, '').toLowerCase(); });
        return '<label class="ffl-chipcheck"><input type="checkbox" data-wveh="' + esc(v) + '"' + (on ? ' checked' : '') + '><span>' + esc(v) + '</span></label>';
      }).join('') + '</div>' : '') +
      '<label class="ffl-fl">Text' + (sg.content ? ' <em class="ffl-sug">vorgeschlagen</em>' : ' (optional)') + '</label><textarea data-wf="content" rows="' + (sg.content ? 7 : 3) + '" placeholder="Kurz, was passiert ist – ohne Namen, Kennzeichen oder Gesundheitsangaben.">' + esc(sg.content || '') + '</textarea>' +
      (sg.content ? '<p class="ffl-mu" style="margin:4px 0 0">Vorgeschlagen aus ' + (sg.from_report ? 'dem Einsatzbericht und ' : '') + 'den Einsatzdaten' + (sg.scrubbed ? ' (' + sg.scrubbed + '× Kennzeichen/Hausnummer entfernt)' : '') + ' – bitte kürzen und auf Namen, Kennzeichen und Gesundheitsangaben prüfen.</p>' : '') +
      // Mit Text immer Entwurf: der Text wird vor dem Veröffentlichen geprüft und ggf. gekürzt (die Verwaltung gibt frei)
      '<div class="ffl-row" style="margin-top:10px">' + (w.publish ? '<label class="ffl-check" title="Nur ohne Text – mit Text wird immer ein Entwurf zur Freigabe angelegt"><input type="checkbox" data-wf="publish"> direkt veröffentlichen (nur ohne Text)</label>' : '') +
      '<span class="ffl-mu">Mit Text wird immer ein Entwurf angelegt – erst prüfen, dann veröffentlichen.</span>' +
      '<button type="button" class="ffl-p" style="margin-left:auto" data-act="webpub" data-id="' + i.id + '">Entwurf anlegen</button></div></div></div>';
  }

  // Digitaler Einsatzbericht (Formular aus der Verwaltung)
  // Einsatzführung – oder EL/ZF/GF des Einsatzes (nur ihre Einsätze, nur zum Berichtschreiben)
  function RM() { return d.manage || d.report_access || { incidents: [], participation: [], report_form: [] }; }
  function vReport() {
    var M = RM(), i = M.incidents.filter(function (x) { return x.id === st.report; })[0];
    if (!i) { st.report = null; return vIncidents(); }
    var r = st.reportData || {}, sug = st.repSug || {};
    var parts = M.participation.filter(function (p) { return p.incident_id === i.id; });
    var vehs = (i.vehicles || []).map(function (x) { return x.v; });
    function filled(sec) { return sec.fields.some(function (f) { var v = r[f.id]; return Array.isArray(v) ? v.length : v; }); }
    var done = M.report_form.filter(filled).length, total = M.report_form.length;
    var h = '<button type="button" class="ffl-q" style="padding:0;margin-top:12px" data-act="repback">← zurück zum Einsatz</button>' +
      '<div class="ffl-rephead"><div><b>' + esc(incLabel(i)) + '</b><span>' + dt(i.start) + ' Uhr' + (i.place ? ' · ' + esc(i.place) : '') + '</span>' +
      '<span>' + parts.length + ' Kräfte' + (vehs.length ? ' · ' + esc(vehs.join(', ')) : '') + '</span></div>' +
      '<div class="ffl-repprog" title="Abschnitte mit Angaben"><i style="width:' + Math.round(done / Math.max(1, total) * 100) + '%"></i><span id="myf-repprog">' + done + ' von ' + total + '</span></div></div>' + ((i.alarms || []).length > 1 || i.ext_nr ? '<div style="margin-top:10px">' + alarmsHtml(i) + '</div>' : '') +
      '<p class="ffl-mu" style="margin:8px 0 0">Wird beim Tippen automatisch gespeichert (verschlüsselt). 🔒 = personenbezogen, nur für die Einsatzführung.' +
      (Object.keys(sug).length ? ' <span class="ffl-sugnote">Gelb = vorausgefüllt aus Alarm/Teilnahme – bitte prüfen.</span>' : '') + '</p>' + vehTimes(i, parts, M) + '<form id="myf-report" class="ffl-repform">';
    M.report_form.forEach(function (sec, n) {
      h += '<details class="ffl-repsec"' + (n === 0 || !filled(sec) && n === done ? ' open' : '') + '><summary><i>' + (n + 1) + '</i><b>' + esc(sec.title) + '</b>' + (filled(sec) ? '<em>✓</em>' : '') + '</summary><div class="ffl-repbody">';
      sec.fields.forEach(function (f) {
        var v = r[f.id], lab = '<label class="ffl-fl' + (sug[f.id] ? ' is-sug' : '') + '">' + esc(f.label) + (f.sensitive ? ' 🔒' : '') + (sug[f.id] ? ' <em class="ffl-sug">vorgeschlagen</em>' : '') + '</label>';
        if (f.type === 'checks' || f.type === 'radio') h += lab + '<div class="ffl-chips ffl-bigchips">' + f.options.map(function (o) {
          var on = f.type === 'checks' ? (v || []).indexOf(o) >= 0 : v === o;
          return '<label class="ffl-toggle-chip' + (on ? ' on' : '') + '"><input type="' + (f.type === 'checks' ? 'checkbox' : 'radio') + '" name="' + esc(f.id) + '" value="' + esc(o) + '"' + (on ? ' checked' : '') + '>' + esc(o) + '</label>';
        }).join('') + '</div>';
        else if (f.type === 'textarea') h += lab + '<textarea name="' + esc(f.id) + '" rows="3">' + esc(v || '') + '</textarea>';
        else h += lab + '<input type="' + (f.type === 'number' ? 'number' : 'text') + '" name="' + esc(f.id) + '" value="' + esc(v || '') + '"' + (f.type === 'number' ? ' step="any" inputmode="decimal"' : '') + '>';
      });
      // Weiter zum nächsten Abschnitt – am Handy kein Suchen und Scrollen
      h += (n < M.report_form.length - 1 ? '<button type="button" class="ffl-repnext" data-act="repnext" data-v="' + n + '">Weiter: ' + esc(M.report_form[n + 1].title) + ' →</button>' : '') + '</div></details>';
    });
    return h + '</form>' + incDelRow(i) + '<div class="ffl-repbar"><span class="ffl-mu" id="myf-repstate">' + (i.report_by ? 'zuletzt gespeichert ' + dt(i.report_at) + ' Uhr' : 'noch nicht gespeichert') + '</span>' +
      (i.has_report ? '<button type="button" class="ffl-q ffl-sm ffl-rep-print" data-act="repprint" data-id="' + i.id + '" title="PDF / Drucken">PDF</button>' : '') +
      '<button type="button" class="ffl-p" data-act="repsave" data-id="' + i.id + '">Speichern & zurück</button><button type="button" class="ffl-go" data-act="repclose" data-id="' + i.id + '">Abschließen</button></div>';
  }
  // Automatisch speichern: 3 Sekunden nach der letzten Eingabe (verschlüsselt auf dem Server, nichts bleibt auf dem Gerät)
  var repTimer = null;
  // Fortschritt und Häkchen je Abschnitt sofort nachführen (ohne neu zu zeichnen – Eingaben bleiben, wo sie sind)
  function repProgress() {
    var fm = document.getElementById('myf-report'); if (!fm || !d.manage) return;
    var vals = reportValues(), secs = fm.querySelectorAll('details.ffl-repsec'), done = 0;
    RM().report_form.forEach(function (sec, n) {
      var ok = sec.fields.some(function (f) { var v = vals[f.id]; return Array.isArray(v) ? v.length : v; });
      if (ok) done++;
      var sm = secs[n] && secs[n].querySelector('summary'), em = sm && sm.querySelector('em');
      if (sm && ok && !em) sm.insertAdjacentHTML('beforeend', '<em>✓</em>'); else if (em && !ok) em.remove();
    });
    var pr = document.getElementById('myf-repprog'), total = RM().report_form.length;
    if (pr) { pr.textContent = done + ' von ' + total; if (pr.previousElementSibling) pr.previousElementSibling.style.width = Math.round(done / Math.max(1, total) * 100) + '%'; }
  }
  function repAutosave() {
    clearTimeout(repTimer); repProgress();
    var el = document.getElementById('myf-repstate'); if (el) el.textContent = 'wird gespeichert …';
    repTimer = setTimeout(function () {
      if (!st.report || !document.getElementById('myf-report')) return;
      var vals = reportValues(); st.reportData = vals;
      api('POST', 'me/incident/report', { id: st.report, report: vals }).then(function () {
        var e2 = document.getElementById('myf-repstate'); if (e2) e2.textContent = '✓ gespeichert ' + new Date().toTimeString().slice(0, 5) + ' Uhr';
      }, function (err) { var e3 = document.getElementById('myf-repstate'); if (e3) e3.textContent = 'Nicht gespeichert: ' + err.message; });
    }, 3000);
  }
  function reportValues() {
    var out = {}, fm = document.getElementById('myf-report');
    RM().report_form.forEach(function (sec) {
      sec.fields.forEach(function (f) {
        if (f.type === 'checks') out[f.id] = [].map.call(fm.querySelectorAll('input[name="' + f.id + '"]:checked'), function (x) { return x.value; });
        else if (f.type === 'radio') { var c = fm.querySelector('input[name="' + f.id + '"]:checked'); out[f.id] = c ? c.value : ''; }
        else { var el = fm.querySelector('[name="' + f.id + '"]'); out[f.id] = el ? el.value : ''; }
      });
    });
    return out;
  }
  function incById(id) { return RM().incidents.filter(function (x) { return x.id === id; })[0]; }
  function anyInc(id) { return (d.incidents || []).concat(RM().incidents).filter(function (x) { return x.id === id; })[0]; }
  function incHeadValues(box) {
    var o = {}; [].forEach.call(box.querySelectorAll('[data-if]'), function (el) { o[el.getAttribute('data-if')] = el.value; }); return o;
  }
  function withDate(i, hm) { return hm ? i.start.slice(0, 10) + ' ' + hm + ':00' : ''; }

  function incidentClick(act, t, id) {
    var i, box, row;
    switch (act) {
      case 'pform': st.pform = id; st.pveh = null; st.prole = null; render(); return true;
      case 'prole':
        var cur = st.prole || ((myPart(st.pform) || {}).role || '').split(',').filter(Boolean), rv = t.getAttribute('data-v');
        st.prole = cur.indexOf(rv) >= 0 ? cur.filter(function (x) { return x !== rv; }) : cur.concat(rv);
        t.classList.toggle('on', st.prole.indexOf(rv) >= 0); return true;
      case 'partrole':
        var prw = parts0(id), rl = (prw.role || '').split(',').filter(Boolean), rk = t.getAttribute('data-v');
        rl = rl.indexOf(rk) >= 0 ? rl.filter(function (x) { return x !== rk; }) : rl.concat(rk);
        api('POST', 'me/incident/part', { incident_id: st.inc, member_id: id, role: rl.join(',') }).then(reload).catch(function (err) { note('err', err.message); });
        return true;
      case 'pcancel': st.pform = null; render(); return true;
      case 'pveh':
        // nochmal tippen = Fahrzeug wieder abwählen
        st.pveh = st.pveh === t.getAttribute('data-v') || (!st.pveh && t.classList.contains('on')) ? '' : t.getAttribute('data-v');
        [].forEach.call(t.parentNode.children, function (b) { b.classList.toggle('on', b.getAttribute('data-v') === st.pveh); }); return true;
      case 'psave':
        var p = myPart(id) || {}, body = { incident_id: id };
        if (!p.confirmed) {
          body.vehicle = st.pveh || p.vehicle || '';
          if (!body.vehicle) { note('err', 'Bitte das Fahrzeug antippen.'); return true; }
          body.t_start = val('myf-pstart'); body.t_end = val('myf-pend');
          if (st.prole) body.role = st.prole.join(',');
        }
        body.cert = document.getElementById('myf-pcert').checked;
        var pw = document.querySelector('input[name="myf-pw"]:checked');
        body.work_resume = !body.cert || !pw ? '' : pw.value === 'none' ? 'none' : val('myf-pwt');
        api('POST', 'me/participation', body).then(function (r) { st.pform = null; if (st.backInc) { st.inc = st.backInc; st.backInc = null; } return reload().then(function () { return r; }); }).then(function (r) {
          var miss = (r && r.cert_missing) || [];
          if (miss.length) note('err', 'Eingetragen. Für die Bescheinigung fehlt noch: ' + miss.join(', ') + ' – bitte unter „Profil“ ergänzen.');
          else note('ok', body.cert ? 'Danke – eingetragen. Die Einsatzführung prüft und stellt die Bescheinigung aus.' : 'Danke – eingetragen.');
        }, function (err) { note('err', err.message); });
        return true;
      case 'premove':
        var pr = myPart(id) || {};
        if (pr.confirmed) {
          // Schon bestätigt: die Einsatzführung entscheidet – kurz sagen, warum
          MYFUI.ask({ title: 'Doch nicht dabei', text: 'Die Einsatzführung hat dich schon bestätigt. Sie bekommt Bescheid und trägt dich aus. Kurz der Grund (optional):', ok: 'Austragen lassen' }).then(function (why) {
            if (why === null) return;
            api('POST', 'me/participation', { incident_id: id, remove: true, reason: why }).then(function () { st.pform = null; return reload(); }).then(function () { note('ok', 'Die Zugführung ist informiert.'); }, function (err) { note('err', err.message); });
          });
          return true;
        }
        if (!confirm('Doch nicht dabei – Eintrag entfernen?')) return true;
        api('POST', 'me/participation', { incident_id: id, remove: true }).then(function () { st.pform = null; return reload(); }).then(function () { note('ok', 'Entfernt.'); }, function (err) { note('err', err.message); });
        return true;
      case 'pcancelreq':
        api('POST', 'me/participation', { incident_id: id, cancel_req: true }).then(reload).catch(function (err) { note('err', err.message); });
        return true;
      case 'incnew': st.incNew = t.getAttribute('data-v'); render(); return true;
      case 'incnewcancel': st.incNew = null; render(); return true;
      case 'incopen': st.inc = id; render(); window.scrollTo(0, root.offsetTop - 20); return true;
      case 'incback':
        if (st.idirty && !confirm('Ungespeicherte Änderungen verwerfen?')) return true;
        st.idirty = null; st.inc = null; render(); return true;
      case 'cvyear': st.cvYear = +t.getAttribute('data-v'); st.cv = null; render(); return true;
      case 'cvinc': st.isub = 'lead'; st.inc = id; render(); return true;
      case 'cvprint':
        var cvv = t.getAttribute('data-v'), cvids = cvv === 'ready' ? st.cv.rows.filter(function (x) { return x.cert === 'requested' && x.confirmed && !x.missing.length; }).map(function (x) { return x.id; }) : [+cvv];
        MYFCert.print(function (b) { return api('POST', 'me/incident/cert', b); }, cvids, st.cv.rows.some(function (x) { return cvids.indexOf(x.id) >= 0 && x.cert === 'requested'; }),
          function () { st.cv = null; reload(); }).catch(function (e) { note('err', e.message); }); return true;
      case 'cvhand':
        var cvh = st.cv.rows.filter(function (x) { return x.cert === 'issued'; });
        MYFCert.handover(function (b) { return api('POST', 'me/cert/handover', b); }, cvh, st.cv.office, (d.member || {}).name, function (r) { note('ok', r.n + ' ausgehändigt – Ausgabeliste gedruckt.'); st.cv = null; reload(); }); return true;
      case 'cvhand1':
        var c1 = st.cv.rows.filter(function (x) { return x.id === +t.getAttribute('data-v'); });
        MYFCert.handover(function (b) { return api('POST', 'me/cert/handover', b); }, c1, st.cv.office, (d.member || {}).name, function () { note('ok', 'Ausgehändigt – Ausgabeliste gedruckt.'); st.cv = null; reload(); }); return true;
      case 'selfpart': st.pform = id; st.pveh = null; st.prole = null; render(); var sp = root.querySelector('.ffl-pform'); if (sp) window.scrollTo(0, Math.max(0, sp.getBoundingClientRect().top + window.pageYOffset - 80)); return true;
      case 'incdel':
        var di = (d.manage.incidents || []).filter(function (x) { return x.id === id; })[0] || {}, dp = (d.manage.participation || []).filter(function (p) { return p.incident_id === id; }).length;
        MYFUI.ask({ title: 'Einsatz löschen', text: incLabel(di) + (dp ? '\n' + dp + ' Beteiligung' + (dp > 1 ? 'en werden' : ' wird') + ' mit entfernt.' : '') + (di.has_report ? '\nDer begonnene Bericht wird mit gelöscht (sein Stand bleibt im Protokoll).' : '') + '\nNur für versehentlich Angelegtes. Warum? Die Begründung steht im Änderungsprotokoll.',
          ph: 'z. B. Testalarm vom Montag', required: 'Bitte kurz begründen (mindestens 5 Zeichen).', min: 5, ok: 'Löschen' }).then(function (why) {
          if (!why) return;
          api('POST', 'me/incident/delete', { id: id, reason: why }).then(function () { st.inc = null; st.report = null; st.reportData = null; return reload(); }).then(function () { note('ok', 'Einsatz gelöscht – mit Begründung im Protokoll.'); }, function (err) { note('err', err.message); });
        });
        return true;
      case 'incsave':
        box = t.closest('[data-incform]');
        var hv = incHeadValues(box); if (id) hv.id = id;
        api('POST', 'me/incident', hv).then(function (r) { st.incNew = null; st.inc = r.id; return reload(); }).then(function () { note('ok', 'Gespeichert.'); }, function (err) { note('err', err.message); });
        return true;
      case 'partcertreq':
        var cm = (d.manage.members || []).filter(function (x) { return x.id === id; })[0] || { name: '' };
        MYFUI.ask({ title: 'Bescheinigung für den Arbeitgeber', text: 'Für ' + cm.name + '. Wann ging die Arbeit wieder los? Uhrzeit wie 15:30 – leer lassen = an dem Tag nicht mehr.', ph: 'z. B. 15:30', ok: 'Beantragen' }).then(function (w) {
          if (w === null) return;
          w = w.replace('.', ':'); var wr = /^\d{1,2}:\d{2}$/.test(w) ? w : 'none';
          api('POST', 'me/incident/part', { incident_id: st.inc, member_id: id, cert: 1, work_resume: wr }).then(reload).then(function () { note('ok', 'Bescheinigung beantragt – nach dem Bestätigen der Teilnahme direkt drucken.'); }, function (err) { note('err', err.message); });
        });
        return true;
      case 'partcertprint':
        MYFCert.print(function (b) { return api('POST', 'me/incident/cert', b); }, [id], true, function () { reload(); }).catch(function (err) { note('err', err.message); });
        return true;
      case 'incsaveall':
        var hb = root.querySelector('[data-incform="' + id + '"]'), body = hb ? incHeadValues(hb) : {};
        body.id = id;
        if (root.querySelector('[data-vehtable]')) body.vehicles = [].map.call(root.querySelectorAll('[data-veh]'), function (tr) {
          return { v: tr.querySelector('[data-vf=on]').checked ? tr.getAttribute('data-veh') : '', out: tr.querySelector('[data-vf=out]').value, at: tr.querySelector('[data-vf=at]').value, 'in': tr.querySelector('[data-vf=in]').value };
        }).filter(function (x) { return x.v; });
        api('POST', 'me/incident', body).then(function () { st.idirty = null; return reload(); }).then(function () { note('ok', 'Gespeichert.'); }, function (err) { note('err', err.message); });
        return true;
      case 'incdiscard': st.idirty = null; render(); return true;
      case 'pokall':
        // Alle noch unbestätigten Beteiligten auf einmal bestätigen – einzelne entfernt man mit dem ✕ in der Zeile
        var sel = d.manage.participation.filter(function (p) { return p.incident_id === id && !p.confirmed; }).map(function (p) { return p.member_id; });
        if (!sel.length) { note('ok', 'Schon alle bestätigt.'); return true; }
        sel.reduce(function (pr, mid) { return pr.then(function () { return api('POST', 'me/incident/part', { incident_id: id, member_id: mid, confirmed: true }); }); }, Promise.resolve())
          .then(reload).then(function () { note('ok', sel.length + ' bestätigt.'); }, function (err) { note('err', err.message); });
        return true;
      case 'partreqok':
        api('POST', 'me/incident/part', { incident_id: st.inc, member_id: id, remove: true }).then(reload).then(function () { note('ok', 'Ausgetragen.'); }, function (err) { note('err', err.message); });
        return true;
      case 'partreqno':
        api('POST', 'me/incident/part', { incident_id: st.inc, member_id: id, keep: true }).then(reload).then(function () { note('ok', 'Bleibt eingetragen.'); }, function (err) { note('err', err.message); });
        return true;
      case 'partdel':
        if (!confirm('Person aus diesem Einsatz entfernen?')) return true;
        api('POST', 'me/incident/part', { incident_id: st.inc, member_id: id, remove: true }).then(reload).catch(function (err) { note('err', err.message); });
        return true;
      case 'partadd':
        var pm = +t.getAttribute('data-v'), pmn = (d.manage.members.filter(function (m) { return m.id === pm; })[0] || {}).name || '';
        t.disabled = true;
        api('POST', 'me/incident/part', { incident_id: id, member_id: pm, vehicle: val('myf-paddveh'), confirmed: true }).then(reload)
          .then(function () { note('ok', pmn + ' nachgetragen.'); var f = document.getElementById('myf-paddname'); if (f) f.focus(); }, function (err) { note('err', err.message); });
        return true;
      case 'partall':
        var todo = d.manage.participation.filter(function (p) { return p.incident_id === id && !p.confirmed; });
        todo.reduce(function (pr, p) { return pr.then(function () { return api('POST', 'me/incident/part', { incident_id: id, member_id: p.member_id, confirmed: true }); }); }, Promise.resolve())
          .then(reload).then(function () { note('ok', todo.length + ' bestätigt.'); }, function (err) { note('err', err.message); });
        return true;
      case 'webpub':
        var wb = t.closest('[data-webform]'), wbody = { id: id, resources: [] };
        [].forEach.call(wb.querySelectorAll('[data-wf]'), function (el) { wbody[el.getAttribute('data-wf')] = el.type === 'checkbox' ? el.checked : el.value; });
        [].forEach.call(wb.querySelectorAll('[data-wveh]'), function (el) { if (el.checked) wbody.resources.push(el.getAttribute('data-wveh')); });
        t.disabled = true;
        api('POST', 'me/incident/web', wbody).then(function (r) { return reload().then(function () { note('ok', r && r.status === 'publish' ? 'Auf der Website veröffentlicht.' : 'Als Entwurf angelegt – wird vor dem Veröffentlichen geprüft und freigegeben.'); }); }, function (err) { t.disabled = false; note('err', err.message); });
        return true;
      case 'repclose':
        if (!confirm('Bericht abschließen? Danach ist er gesperrt – Änderungen nur noch mit Begründung (Protokoll).')) return true;
        clearTimeout(repTimer);
        api('POST', 'me/incident/report', { id: id, report: reportValues(), close: 1 }).then(function () { st.report = null; st.reportData = null; return reload(); })
          .then(function () { note('ok', 'Einsatzbericht abgeschlossen und gesperrt.'); return incidentClick('repview', t, id); }, function (err) { note('err', err.message); });
        return true;
      case 'repext':
        MYFUI.ask({ title: 'Bericht schon erfasst', text: 'Wo ist der Bericht? z. B. „auf Papier, Ordner Einsätze 2025“ oder „Altbestand vor SPIND“. Der Einsatz zählt dann nicht mehr als offen – rückgängig machen geht jederzeit.', value: 'auf Papier ausgefüllt', required: 'Bitte kurz vermerken, wo der Bericht ist.', ok: 'Vermerken' }).then(function (en) {
          if (!en) return;
          api('POST', 'me/incident/report/external', { id: id, note: en }).then(function () { return reload(); }).then(function () { note('ok', 'Vermerkt: Bericht anderweitig erfasst.'); }, function (err) { note('err', err.message); });
        });
        return true;
      case 'repreopen':
        MYFUI.ask({ title: 'Bericht wieder öffnen', text: 'Warum wird der abgeschlossene Bericht geändert? Steht im Protokoll und am Bericht.', ph: 'z. B. Uhrzeit falsch übertragen', required: 'Bitte einen Grund angeben (mindestens 10 Zeichen).', min: 10, ok: 'Wieder öffnen' }).then(function (why) {
          if (!why) return;
          api('POST', 'me/incident/report/reopen', { id: id, reason: why }).then(function () { st.repView = null; return reload(); }).then(function () { note('ok', 'Wieder geöffnet – Begründung ist protokolliert.'); return incidentClick('repopen', t, id); }, function (err) { note('err', err.message); });
        });
        return true;
      case 'repopen':
        if ((incById(id) || {}).report_closed) return incidentClick('repview', t, id);
        // Bericht erst beim Öffnen laden (vertraulich, jeder Abruf wird protokolliert)
        api('GET', 'me/incident/report?id=' + id).then(function (r) {
          st.reportData = r.report || {}; st.repSug = {};
          Object.keys(r.suggest || {}).forEach(function (k) { st.reportData[k] = r.suggest[k]; st.repSug[k] = 1; });
          st.repView = null; st.report = id; render(); window.scrollTo(0, root.offsetTop - 20);
        }, function (err) { note('err', err.message); });
        return true;
      case 'repback': st.report = null; st.reportData = null; render(); return true;
      case 'repview':
        // Schnellansicht: nur lesen, wie der Ausdruck – ohne die Ausfüllstrecke; Einsatzführung sieht dahinter die Beteiligung
        api('GET', 'me/incident/report?id=' + id + '&print=1').then(function (r) { st.report = null; st.repView = { id: id, html: repDossier(incById(id), MYFPrint.report(Object.assign({}, incById(id), { report: r.report }), r.form || RM().report_form, { labels: r.labels }), true) }; render(); window.scrollTo(0, root.offsetTop - 20); }, function (err) { note('err', err.message); });
        return true;
      case 'repviewclose': st.repView = null; render(); return true;
      case 'repviewprint': if (st.repView) MYFPrint.printDirect(st.repView.html, true); return true;
      case 'incpage': st.incPage = +t.getAttribute('data-v') || 0; render(); var lst = document.querySelector('.ffl-inclist'); if (lst) lst.scrollIntoView({ block: 'start' }); return true;
      case 'isub': st.isub = t.getAttribute('data-v'); st.incPage = 0; render(); return true;
      case 'inccsv':
        api('GET', 'incident/export?year=' + (t.getAttribute('data-v') || new Date().getFullYear()) + '&kind=' + (t.getAttribute('data-k') || 'einsatz')).then(function (r) {
          var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([r.csv], { type: 'text/csv;charset=utf-8' })); a.download = r.filename; document.body.appendChild(a); a.click(); a.remove();
          note('ok', r.rows + ' Zeilen exportiert (ohne personenbezogene Felder).');
        }, function (err) { note('err', err.message); });
        return true;
      case 'vtcopy':
        // Zeiten der ersten angehakten Zeile in alle anderen angehakten Zeilen übernehmen (nur leere Felder)
        var trs = [].filter.call(document.querySelectorAll('[data-veh]'), function (tr) { return tr.querySelector('[data-vf=on]').checked; });
        if (trs.length < 2) { note('err', 'Erst mindestens zwei Fahrzeuge anhaken.'); return true; }
        ['out', 'at', 'in'].forEach(function (k) { var v = trs[0].querySelector('[data-vf=' + k + ']').value; if (v) trs.slice(1).forEach(function (tr) { var f = tr.querySelector('[data-vf=' + k + ']'); if (!f.value) f.value = v; }); });
        incDirty(); note('ok', 'Zeiten übernommen – bitte prüfen und speichern.'); return true;
      case 'vtalarm':
        var ai = incById(id), hm = ai && ai.start ? ai.start.slice(11, 16) : '';
        [].forEach.call(document.querySelectorAll('[data-veh]'), function (tr) { if (tr.querySelector('[data-vf=on]').checked) { var f = tr.querySelector('[data-vf=out]'); if (!f.value) f.value = hm; } });
        incDirty(); note('ok', 'Alarmzeit ' + hm + ' als Ausrücken eingetragen, wo noch leer.'); return true;
      case 'repsave':
        clearTimeout(repTimer);
        st.reportData = reportValues();
        api('POST', 'me/incident/report', { id: id, report: reportValues() }).then(function () { st.report = null; st.reportData = null; if (d.manage) st.inc = id; return reload(); })
          .then(function () { note('ok', 'Einsatzbericht gespeichert.'); window.scrollTo(0, root.offsetTop - 20); }, function (err) { note('err', err.message); });
        return true;
      case 'repprint':
        i = incById(id);
        var withParts = !document.getElementById('myf-repwith') || document.getElementById('myf-repwith').checked;
        api('GET', 'me/incident/report?id=' + id + '&print=1').then(function (r) {
          MYFPrint.printNow(repDossier(i, MYFPrint.report(Object.assign({}, i, { report: r.report }), r.form || RM().report_form, { labels: r.labels }), withParts), true);
        }, function (err) { note('err', err.message); });
        return true;
      case 'partprint':
        i = incById(id);
        MYFPrint.printNow(MYFPrint.participants(i, d.manage.participation.filter(function (p) { return p.incident_id === id; }), d.manage.members, d.manage.incident_vehicles));
        return true;
      case 'certprint':
        var cps = d.manage.participation.filter(function (p) { return p.incident_id === id && p.cert; });
        MYFCert.print(function (b) { return api('POST', 'me/incident/cert', b); }, cps.map(function (p) { return p.id; }), cps.some(function (p) { return p.cert === 'requested' && p.confirmed; }), function () { reload(); })
          .catch(function (err) { note('err', err.message); });
        return true;
    }
    return false;
  }
  function parts0(mid) { return d.manage.participation.filter(function (p) { return p.incident_id === st.inc && p.member_id === mid; })[0] || {}; }
  // Änderungen in der Beteiligten-Tabelle sofort speichern
  function incidentChange(t) {
    if (t.id === 'myf-pcert') { var w = document.getElementById('myf-pwork'); if (w) w.style.display = t.checked ? '' : 'none'; return true; }
    var tr = t.closest('[data-part]');
    if (!tr || !t.hasAttribute('data-pf')) return false;
    var i = incById(st.inc), f = t.getAttribute('data-pf'), body = { incident_id: st.inc, member_id: +tr.getAttribute('data-part') };
    if (f === 'vehicle') body.vehicle = t.value;
    if (f === 'ts') body.t_start = withDate(i, t.value);
    if (f === 'te') body.t_end = withDate(i, t.value);
    if (f === 'ok') body.confirmed = t.checked;
    api('POST', 'me/incident/part', body).then(reload).catch(function (err) { note('err', err.message); });
    return true;
  }

  // ---- Dienste (Dienstpläne) -----------------------------------------------------
  function myDuties() {
    var mine = {}; (d.duty_assign || []).forEach(function (a) { if (a.member_id === d.member.id) mine[a.slot_id] = 1; });
    return (d.duty_slots || []).filter(function (s) { return mine[s.slot_id || s.id] && (!s.date || s.date >= today()); });
  }
  // Dienste: Meine Zusagen, Dienstplan, Übungen (warst du dabei? / verwalten), Wer hat Zeit?
  function vDuties() {
    if (st.report && kindOf(st.report) === 'uebung') return vReport();
    if (st.inc && kindOf(st.inc) === 'uebung') return vIncidentManage();
    var h = vDutiesBase('duties');
    if (d.incident_manage) h += vIncidentList();
    return h;
  }
  // Abfragen („Wer hat Zeit?“: Brandsicherheitswache, Grünanlagen, Volkstrauertag …) – eigener Reiter, nichts mit Übungen/Dienstabenden zu tun
  function vAsks() { return vDutiesBase('asks'); }
  function uebungenHtml() {
    var ub = (d.incidents || []).filter(function (x) { return x.kind === 'uebung'; });
    if (!ub.length) return '';
    var year = new Date().getFullYear(), n = d.my_participation.filter(function (p) { var i = ub.concat(d.incidents_old || []).filter(function (x) { return x.id === p.incident_id && x.kind === 'uebung'; })[0]; return i && +i.start.slice(0, 4) === year; }).length;
    return '<div class="ffl-sec"><div class="ffl-sh">Übungen & Dienstabende – warst du dabei?<em>' + n + ' in ' + year + '</em></div>' +
      '<p class="ffl-mu" style="margin-top:0">Teilnahme an Übungen und Dienstabenden – getrennt von den Einsätzen. Die Zugführung bestätigt.</p>' + ub.map(incRow).join('') + '</div>';
  }
  // Schnellübersicht zu einem Termin: wer ist dabei, wie viele fehlen – mit Zu-/Absage direkt im Fenster
  function dutySheet() {
    var s = (d.duty_slots || []).filter(function (x) { return x.id === st.dutyOpen; })[0]; if (!s) return '';
    var l = (d.duty_lists || []).filter(function (x) { return x.id === s.list_id; })[0] || {};
    var a = (d.duty_assign || []).filter(function (x) { return x.slot_id === s.id; }).sort(function (x, y) { return x.name.localeCompare(y.name); });
    var me = a.some(function (x) { return x.member_id === d.member.id; }), n = a.length, cap = s.capacity || 0, free = cap ? cap - n : 1;
    var need = s.min && n < s.min ? s.min - n : 0, goal = s.min || cap || 1, pct = Math.min(100, Math.round(n / goal * 100));
    var wd = s.date ? WD[new Date(s.date + 'T12:00:00').getDay()] : '', past = s.date && s.date < today();
    var canDo = l.self_signup && can('duty_signup') && !past;
    return '<div class="ffl-modal ffl-dutysheet" data-act="dutyclose"><div class="ffl-modal-in" role="dialog" aria-modal="true" aria-label="Wer ist dabei?">' +
      '<div class="ffl-sh" style="margin-top:0">' + esc(l.title || 'Dienst') + '<em><button type="button" class="ffl-iconbtn ffl-x" data-act="dutyclose" aria-label="Schließen">✕</button></em></div>' +
      '<div class="ffl-dsdate">' + (s.date ? '<b>' + wd + ' ' + fmtDate(s.date) + '</b>' + (s.time ? ' · ' + esc(s.time) + ' Uhr' : '') : '') + (s.label ? '<div>' + esc(s.label) + '</div>' : '') + '</div>' +
      (l.note ? '<p class="ffl-mu" style="margin:6px 0 0">' + esc(l.note) + '</p>' : '') + (s.note ? '<p class="ffl-mu" style="margin:4px 0 0">' + esc(s.note) + '</p>' : '') +
      '<div class="ffl-askbar" aria-hidden="true" style="margin-top:12px"><i style="width:' + pct + '%"></i></div>' +
      '<div class="ffl-askcount">' + (need ? '<b class="need">noch ' + need + ' gesucht</b> · ' : (s.min ? '<b style="color:var(--ok)">Mindestzahl erreicht</b> · ' : '')) + n + (s.min ? ' von mind. ' + s.min : '') + (cap ? ' · max. ' + cap : '') + ' dabei</div>' +
      '<div class="ffl-dsnames">' + (n ? a.map(function (x) { var mine = x.member_id === d.member.id; return '<span class="ffl-chip ' + (mine ? 'st-ok' : 'st-open') + '">' + esc(x.name) + (mine ? ' (du)' : '') + '</span>'; }).join('') : '<span class="ffl-mu">Noch niemand eingetragen – mach den Anfang.</span>') + '</div>' +
      '<div class="ffl-row" style="margin-top:14px;gap:8px;flex-wrap:wrap">' +
      (canDo ? (me ? '<button type="button" class="ffl-q" data-act="duty" data-v="0" data-id="' + s.id + '">Doch keine Zeit – austragen</button>' : free > 0 ? '<button type="button" class="' + (need ? 'ffl-go' : 'ffl-p') + '" data-act="duty" data-v="1" data-id="' + s.id + '">Ich habe Zeit</button>' : '<span class="ffl-chip st-no">voll</span>') : (me ? '<span class="ffl-chip st-ok">✓ eingeteilt</span>' : '')) +
      '<span style="flex:1"></span><button type="button" data-act="dutyclose">Schließen</button></div></div></div>';
  }
  function vDutiesBase(which) {
    var lists = (d.duty_lists || []).filter(function (l) { return l.area !== 'strecke'; }), asg = {}; (d.duty_assign || []).forEach(function (a) { (asg[a.slot_id] = asg[a.slot_id] || []).push(a); });
    var mine = myDuties(), lname = {}; lists.forEach(function (l) { lname[l.id] = l.title; });
    var h = '';
    if (which === 'asks') {
      h += '<p class="ffl-mu ffl-calintro">Brandsicherheitswachen, Grünanlagen-Pflege, Volkstrauertag & Co.: Hier steht, wo noch Leute gebraucht werden. Antippen, wenn du Zeit hast – die Zugführung teilt ein und du bekommst Bescheid.</p>';
      if (mine.length) h += '<div class="ffl-sec"><div class="ffl-sh">Meine Zusagen<em>' + mine.length + '</em></div>' + evList(mine.filter(function (x) { return x.date; }).map(function (x) {
        return { start: x.date, end: x.date, time: x.time || '', title: lname[x.list_id] || x.label, tag: 'Zugesagt', lines: [x.label, x.note].filter(Boolean), mine: true };
      }), { noMonth: true }) + mine.filter(function (x) { return !x.date; }).map(function (x) { return '<div class="ffl-ev is-mine"><div class="ffl-day">offen</div><div class="ffl-evbody"><span class="ffl-evtag">Zugesagt</span><b>' + esc(lname[x.list_id] || '') + '</b><div class="ffl-mu">' + esc(x.label) + '</div></div></div>'; }).join('') + '</div>';
    }
    // Jahresdienstplan (Übungsdienste)
    var dr = d.drills || [], files = d.drill_files || [];
    if (which !== 'asks' && (dr.length || files.length)) h += '<div class="ffl-sec"><div class="ffl-sh">Dienstplan<em>' + (d.drill_cal_at ? 'live aus dem Kalender · Stand ' + esc(String(d.drill_cal_at).slice(11, 16)) + ' Uhr' : 'Übungsabende und Termine') + '</em></div>' +
      '<p class="ffl-mu ffl-calintro">Übungsabende, Lehrgänge und besondere Termine der Wehr. Kannst du nicht? Hier abmelden – die Zugführung sieht es vorher.</p>' +
      (files.length ? '<div class="ffl-row" style="margin-bottom:8px">' + files.map(function (f) { return '<a class="ffl-btn ffl-sm" href="' + esc(f.url) + '" target="_blank" rel="noopener">📄 ' + esc(f.label) + '</a>'; }).join('') + '</div>' : '') +
      evList(dr.slice(0, st.drAll ? 60 : 8).map(drillEv), { absence: true }) + '<p class="ffl-mu" style="margin:6px 0 0">„Kann nicht“ ersetzt nicht die Unterschrift – die Zugführung sieht es aber vorher und du stehst als entschuldigt auf der Liste.</p>' + (dr.length > 8 && !st.drAll ? '<button type="button" class="ffl-q ffl-sm" data-act="drall">alle ' + dr.length + ' Termine</button>' : '') + '</div>';
    if (which !== 'asks') return h + uebungenHtml() || '<p class="ffl-mu">Noch kein Dienstplan hinterlegt.</p>';
    // Abfragen „Wer hat Zeit?“: je Abfrage ein Abschnitt, je Termin eine Zeile – Datum links, Füllstand in der Mitte, Aktion rechts
    var anyOpen = false, needH = '', fullH = '', nFull = 0;
    // Viele Abfragen: wo Leute fehlen zuerst (nach nächstem Termin), voll besetzte eingeklappt
    var withSlots = lists.map(function (l) {
      var sl = (d.duty_slots || []).filter(function (s) { return s.list_id === l.id && !(s.date && s.date < today()); });
      return { l: l, open: sl.filter(function (s) { return s.min && (asg[s.id] || []).length < s.min; }).length, next: sl.map(function (s) { return s.date || '9999'; }).sort()[0] || '9999', n: sl.length };
    }).filter(function (x) { return x.n; }).sort(function (a, b) { return (b.open > 0) - (a.open > 0) || (a.next < b.next ? -1 : 1); });
    var collapse = withSlots.length > 3;
    withSlots.forEach(function (w) {
      var l = w.l, h0 = '';
      var slots = (d.duty_slots || []).filter(function (s) { return s.list_id === l.id && !(s.date && s.date < today()); });
      anyOpen = true;
      var open = w.open;
      h0 += '<div class="ffl-sec ffl-asksec"><div class="ffl-sh">' + esc(l.title) + '<em>' + (open ? '<span class="ffl-asksec-need">' + open + (open === 1 ? ' Termin braucht' : ' Termine brauchen') + ' noch Leute</span>' : slots.length + (slots.length === 1 ? ' Termin' : ' Termine') + ' · alles besetzt') + '</em></div>' +
        (l.note ? '<p class="ffl-asknote">' + esc(l.note) + '</p>' : '') +
        slots.map(function (s) {
          var a = asg[s.id] || [], me = a.some(function (x) { return x.member_id === d.member.id; }), n = a.length, cap = s.capacity || 0, free = cap - n;
          var need = s.min && n < s.min ? s.min - n : 0, goal = Math.max(s.min || 0, 1), pct = Math.min(100, Math.round(n / (cap || goal) * 100)), minPct = cap && s.min ? Math.min(100, Math.round(s.min / cap * 100)) : 0;
          var names = n ? a.map(function (x) { var nn = x.name.split(','); return esc(((nn[1] || '').trim().charAt(0) ? (nn[1] || '').trim().charAt(0) + '. ' : '') + nn[0].trim()); }).join(', ') : '';
          var day = s.date ? s.date.slice(8, 10) + '.' + s.date.slice(5, 7) + '.<small>' + WD[new Date(s.date + 'T12:00:00').getDay()] + '</small>' + (s.time ? '<small>' + esc(s.time) + ' Uhr</small>' : '') : '<small>ohne festen Termin</small>';
          var act = !(l.self_signup && can('duty_signup')) ? (me ? '<span class="ffl-chip st-ok">✓ eingeteilt</span>' : '')
            : me ? '<span class="ffl-chip st-ok">✓ Du bist dabei</span><button type="button" class="ffl-q ffl-sm" data-act="duty" data-v="0" data-id="' + s.id + '">Doch keine Zeit</button>'
            : free > 0 ? '<button type="button" class="ffl-sm ' + (need ? 'ffl-go' : '') + '" data-act="duty" data-v="1" data-id="' + s.id + '">Ich habe Zeit</button>' : '<span class="ffl-chip st-no">voll</span>';
          return '<div class="ffl-ev ffl-askev' + (me ? ' is-mine' : '') + (need ? ' is-need' : '') + '"><div class="ffl-day">' + day + '</div>' +
            '<div class="ffl-evbody"><b>' + esc(s.label) + '</b>' +
              '<div class="ffl-askfill" aria-hidden="true"><i style="width:' + pct + '%"></i>' + (minPct && minPct < 100 ? '<u style="left:' + minPct + '%" title="mindestens ' + s.min + '"></u>' : '') + '</div>' +
              '<div class="ffl-askcount">' + (need ? '<b>noch ' + need + ' gesucht</b> · ' : '') + n + (cap ? ' von ' + cap : '') + ' Plätzen' + (s.min ? ' · mind. ' + s.min : '') + '</div>' +
              (n ? '<div class="ffl-askwho">Dabei: <button type="button" class="ffl-textbtn" data-act="dutyopen" data-id="' + s.id + '">' + names + '</button></div>' : '') + '</div>' +
            '<div class="ffl-askact">' + act + '</div></div>';
        }).join('') + '</div>';
      if (collapse && !open && !slots.some(function (s) { return (asg[s.id] || []).some(function (x) { return x.member_id === d.member.id; }); })) { fullH += h0; nFull++; } else needH += h0;
    });
    h += needH + (nFull ? '<details class="ffl-askfull"><summary>Alles besetzt (' + nFull + ')</summary>' + fullH + '</details>' : '');
    if (!anyOpen) h += '<p class="ffl-mu" style="margin-top:16px">Zurzeit keine offenen Abfragen.</p>';
    return h;
  }

  // ---- Aushänge & Einladungen -----------------------------------------------------
  function vBoard() {
    var list = d.board || [];
    if (!list.length) return '<p class="ffl-mu" style="margin-top:16px">Gerade keine Aushänge.</p>';
    return list.map(function (b) {
      var m = b.mine, closed = b.rsvp_deadline && b.rsvp_deadline < today();
      return '<div class="ffl-pbox ffl-board"><div class="ffl-board-h"><b>' + esc(b.title) + '</b><span class="ffl-mu">' + fmtDate(b.created) + (b.created_by ? ' · ' + esc(b.created_by) : '') + '</span></div>' + (b.text ? '<div class="ffl-pre-line">' + esc(b.text) + '</div>' : '') +
        (b.file_url ? (/\.pdf$/i.test(b.file_url) ? '<a class="ffl-btn ffl-sm" href="' + esc(b.file_url) + '" target="_blank" rel="noopener">📄 ' + esc(b.file_name || 'PDF öffnen') + '</a>'
          : '<a href="' + esc(b.file_url) + '" target="_blank" rel="noopener"><img src="' + esc(b.file_url) + '" alt="" style="max-width:100%;max-height:420px;display:block;margin-top:8px"></a>') : '') +
        (b.rsvp ? '<div class="ffl-rsvp"><div class="ffl-rsvp-s">' + (m ? '<span class="ffl-chip ' + (m.answer === 'yes' ? 'st-ok' : 'st-no') + '">' + (m.answer === 'yes' ? '✓ Du hast zugesagt' + (m.persons > 1 ? ' (' + m.persons + ' Personen)' : '') : 'Du hast abgesagt') + '</span>' : '<b>Bist du dabei?</b>') +
          '<span class="ffl-mu">' + b.yes + ' Zusagen' + (b.rsvp_deadline ? ' · Antwort bis ' + fmtDate(b.rsvp_deadline) : '') + '</span></div>' +
          (closed ? '<span class="ffl-mu">Anmeldung geschlossen</span>' : '<div class="ffl-rsvp-a"><label class="ffl-mu">Personen <input type="number" id="myf-rp-' + b.id + '" min="1" max="20" value="' + (m ? m.persons : 1) + '"></label>' +
            '<button type="button" class="ffl-p" data-act="rsvp" data-v="yes" data-id="' + b.id + '">' + (m && m.answer === 'yes' ? 'Ändern' : 'Zusagen') + '</button><button type="button" data-act="rsvp" data-v="no" data-id="' + b.id + '">Absagen</button></div>') + '</div>' : '') + '</div>';
    }).join('');
  }

  // ---- Fahrzeug (z. B. Bulli) anfragen -------------------------------------------
  var BKCLS = { requested: 'st-warn', approved: 'st-ok', declined: 'st-no', cancelled: 'st-no' };
  // Fahrzeugseite hinter dem QR-Code im Fahrzeug: alles, was man am Fahrzeug braucht, an einer Stelle
  function vCar() {
    var v = (d.vehicles_hub || []).filter(function (x) { return x.id === st.carId; })[0];
    if (!v) return '<p class="ffl-mu" style="margin-top:16px">Dieses Fahrzeug gibt es nicht (mehr). <button type="button" class="ffl-q ffl-sm" data-tab="start">Zur Startseite</button></p>';
    var f = v.fms, canTrip = (d.trip_vehicles || []).some(function (x) { return x.id === v.id; }), canBook = v.bookable && (d.bookable || []).some(function (x) { return x.id === v.id; });
    var h = '<div class="ffl-car"><div class="ffl-car-h"><b>' + esc(v.name) + '</b>' +
      (f ? '<span class="ffl-fmschip f' + esc(f.s) + '"><i>' + esc(f.s) + '</i>' + esc(f.text) + '</span>' : (v.ready ? '' : '<span class="ffl-chip st-bad">nicht einsatzbereit</span>')) +
      (v.km ? '<span class="ffl-mu">km-Stand ' + kmFmt(v.km) + '</span>' : '') + '</div>' +
      '<div class="ffl-quick ffl-car-acts">' +
      (canTrip ? '<button type="button" data-act="cartrip" data-id="' + v.id + '"><b>Fahrt eintragen</b><span>km-Stand, Tanken – nach jeder Fahrt</span></button>' : '') +
      '<button type="button" data-act="cardefect" data-id="' + v.id + '"><b>Mangel melden</b><span>Etwas kaputt oder fehlt? Am besten mit Foto</span></button>' +
      (canBook ? '<button type="button" data-act="carbook" data-id="' + v.id + '"><b>Fahrzeug buchen</b><span>Für Ausflug, Lehrgang, Besorgung anfragen</span></button>' : '') +
      '</div></div>';
    return h;
  }
  function vVehicle() {
    var vs = {}; d.bookable.forEach(function (v) { vs[v.id] = v; });
    var h = '';
    // Wer freigeben darf, sieht offene Anfragen zuerst – nicht erst auf der Startseite suchen
    if ((d.booking_requests || []).length) h += '<div class="ffl-sec ffl-wait"><div class="ffl-sh">Wartet auf Freigabe (' + d.booking_requests.length + ')</div>' + d.booking_requests.map(function (b) {
      return '<div class="ffl-idea is-wait"><div class="ffl-row" style="justify-content:space-between"><b>' + esc(b.vehicle) + ' · ' + dt(b.start) + ' – ' + (b.end.slice(0, 10) !== b.start.slice(0, 10) ? dt(b.end) : b.end.slice(11, 16)) + '</b></div>' +
        '<div class="ffl-mu">' + esc(b.purpose) + ' · ' + esc(b.by || '') + (b.persons ? ' · ' + b.persons + ' Pers.' : '') + (b.driver ? ' · Fahrer: ' + esc(b.driver) : '') + '</div>' +
        '<div class="ffl-row" style="gap:6px;margin-top:6px"><button type="button" class="ffl-sm ffl-p" data-act="bkok" data-id="' + b.id + '">Freigeben</button><button type="button" class="ffl-sm" data-act="bkno" data-id="' + b.id + '">Ablehnen</button></div></div>';
    }).join('') + '</div>';
    if (can('booking')) {
      h += '<div class="ffl-sec"><div class="ffl-sh">Fahrzeug anfragen</div><div class="ffl-form2">' +
        '<div><label class="ffl-fl">Fahrzeug</label><select id="myf-bveh">' + d.bookable.map(function (v) { return '<option value="' + v.id + '"' + (st.bookVeh === v.id ? ' selected' : '') + '>' + esc(v.name) + (v.status !== 'ready' ? ' (derzeit nicht einsatzbereit)' : '') + '</option>'; }).join('') + '</select></div>' +
        '<div><label class="ffl-fl">Personen</label><input type="number" id="myf-bpers" min="1" max="9" value="1"></div>' +
        '<div><label class="ffl-fl">von</label><input type="datetime-local" id="myf-bstart"></div><div><label class="ffl-fl">bis</label><input type="datetime-local" id="myf-bend"></div>' +
        '<div><label class="ffl-fl">Wofür?</label><input type="text" id="myf-bpurp" placeholder="z. B. Jugendfeuerwehr-Ausflug, Lehrgangsfahrt"></div>' +
        '<div><label class="ffl-fl">Fahrer/in (Führerschein!)</label><input type="text" id="myf-bdrv" placeholder="Name" value="' + esc((firstName() + ' ' + String((d.member && d.member.name) || '').split(',')[0]).trim()) + '"></div></div>' +
        '<button type="button" class="ffl-go" style="margin-top:12px" data-act="bksend">Anfrage senden</button>' +
        '<p class="ffl-mu">Die Zuständigen bekommen Bescheid und geben frei – du erhältst eine Benachrichtigung.</p></div>';
    } else h += noRight('booking');
    // Auf einen Blick: die nächsten 14 Tage je Fahrzeug – frei, angefragt, gebucht oder laut Fahrzeugkalender weg; Tag antippen füllt das Formular vor
    if (d.bookable.length) {
      var days = []; for (var di = 0; di < 14; di++) days.push(addDays(today(), di));
      function cellState(v, day) {
        var s = '', t = '';
        (d.bookings || []).forEach(function (b) { if (b.vehicle_id === v.id && b.start.slice(0, 10) <= day && b.end.slice(0, 10) >= day && (b.status === 'approved' || b.status === 'requested')) { if (b.status === 'approved' || !s) { s = b.status; t = b.purpose; } } });
        (d.ext_busy || []).forEach(function (e) { if (e.vehicle_id === v.id && e.start.slice(0, 10) <= day && e.end.slice(0, 10) >= day && !s) { s = 'ext'; t = e.title; } });
        return { s: s, t: t };
      }
      h += '<div class="ffl-sec"><div class="ffl-sh">Nächste 14 Tage<em>antippen = Tag ins Formular</em></div><div class="ffl-scroll"><table class="ffl-avail"><thead><tr><th></th>' +
        days.map(function (dy) { var dt0 = new Date(dy + 'T12:00:00'); return '<th' + (dt0.getDay() === 0 || dt0.getDay() === 6 ? ' class="we"' : '') + '><small>' + WD[dt0.getDay()] + '</small>' + dt0.getDate() + '.</th>'; }).join('') + '</tr></thead><tbody>' +
        d.bookable.map(function (v) {
          return '<tr><th>' + esc(v.name) + '</th>' + days.map(function (dy) { var c = cellState(v, dy);
            return '<td><button type="button" class="av ' + (c.s || 'free') + '" data-act="bkday" data-id="' + v.id + '" data-v="' + dy + '" title="' + esc(v.name + ' ' + dShort(dy) + ': ' + (c.s === 'approved' ? 'gebucht – ' + c.t : c.s === 'requested' ? 'angefragt – ' + c.t : c.s === 'ext' ? 'laut Kalender – ' + c.t : 'frei')) + '">' + (c.s === 'ext' ? 'K' : '') + '</button></td>'; }).join('') + '</tr>';
        }).join('') + '</tbody></table></div>' +
        '<div class="ffl-avail-legend"><span class="free"></span>frei <span class="requested"></span>angefragt <span class="approved"></span>gebucht <span class="ext">K</span>laut Fahrzeugkalender</div></div>';
    }
    // Belegung: eigene Anfragen plus Einträge aus dem Fahrzeugkalender (z. B. MTF-Kalender), zeitlich sortiert
    var busy = (d.bookings || []).map(function (b) { return { b: b, start: b.start }; }).concat((d.ext_busy || []).map(function (e) { return { x: e, start: e.start }; }));
    busy.sort(function (a, b) { return a.start < b.start ? -1 : 1; });
    h += '<div class="ffl-sec"><div class="ffl-sh">Belegung</div>' + (busy.length ? busy.map(function (r) {
      if (r.x) return '<div class="ffl-ev"><div class="ffl-day">' + dShort(r.x.start) + (r.x.allday ? '' : '<small>' + r.x.start.slice(11, 16) + '</small>') + '</div><div style="flex:1"><b>' + esc(r.x.vehicle) + '</b> ' + (r.x.allday ? 'bis ' + dShort(r.x.end) : 'bis ' + dt(r.x.end)) +
        '<div class="ffl-mu">' + esc(r.x.title) + '</div></div><span class="ffl-chip st-open" title="Eintrag aus dem Fahrzeugkalender">Kalender</span></div>';
      var b = r.b;
      return '<div class="ffl-ev"><div class="ffl-day">' + dShort(b.start) + '<small>' + b.start.slice(11, 16) + '</small></div><div style="flex:1"><b>' + esc((vs[b.vehicle_id] || {}).name || '') + '</b> bis ' + dt(b.end) +
        '<div class="ffl-mu">' + esc(b.purpose) + '</div></div><span class="ffl-chip ' + BKCLS[b.status] + '">' + esc(d.booking_status[b.status]) + '</span></div>';
    }).join('') : '<p class="ffl-mu">Keine Fahrten geplant.</p>') + '</div>';
    // Meine Anfragen: Offenes und Aktuelles sichtbar, Erledigtes älter als 14 Tage eingeklappt (verschwindet so von selbst aus dem Blick)
    var mine = d.my_bookings || [], cut = addDays(today(), -14);
    function bkDone(b) { return b.status === 'declined' || b.status === 'cancelled' || b.end.slice(0, 16) < new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16); }
    var nDone = mine.filter(bkDone).length, nHid = d.my_bookings_hidden || 0;
    var recent = mine.filter(function (b) { return b.status === 'requested' || b.end.slice(0, 10) >= cut; }), older = mine.filter(function (b) { return recent.indexOf(b) < 0; });
    function bkRow(b) {
      return '<div class="ffl-idea"><div class="ffl-row" style="justify-content:space-between"><b>' + esc((vs[b.vehicle_id] || {}).name || 'Fahrzeug') + ' · ' + dt(b.start) + '</b><span class="ffl-chip ' + BKCLS[b.status] + '">' + esc(d.booking_status[b.status]) + '</span></div>' +
        '<div class="ffl-mu">' + esc(b.purpose) + (b.answer ? ' · „' + esc(b.answer) + '“' : '') + '</div>' +
        ((b.status === 'requested' || b.status === 'approved') && b.end > new Date().toISOString().slice(0, 10) ? '<button type="button" class="ffl-q ffl-sm" style="padding:0" data-act="bkcancel" data-id="' + b.id + '">Stornieren</button>' : '') +
        (bkDone(b) ? '<button type="button" class="ffl-q ffl-sm" style="padding:0" data-act="bkhide" data-id="' + b.id + '">Ausblenden</button>' : '') + '</div>';
    }
    if (mine.length) h += '<div class="ffl-sec"><div class="ffl-sh">Meine Anfragen' + (recent.length ? '' : '<em>nichts Aktuelles</em>') + '</div>' + recent.map(bkRow).join('') +
      (older.length ? '<details class="ffl-older"><summary class="ffl-mu">Ältere Anfragen (' + older.length + ')</summary>' + older.map(bkRow).join('') + '</details>' : '') +
      (nDone > 1 ? '<button type="button" class="ffl-q ffl-sm" data-act="bkhideall">Alle erledigten ausblenden (' + nDone + ')</button>' : '') + '</div>';
    if (nHid) h += '<p class="ffl-mu">' + nHid + (nHid === 1 ? ' Anfrage ausgeblendet' : ' Anfragen ausgeblendet') + ' · <button type="button" class="ffl-q ffl-sm" data-act="bkunhide">Wieder einblenden</button></p>';
    return h;
  }

  // Fahrtenbuch: Fahrt mit km-Stand eintragen (z. B. per QR im Fahrzeug), offene Fahrten der eigenen Anfragen
  function kmFmt(n) { return n == null ? '' : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function vTrips() {
    var vs = d.trip_vehicles || [], kinds = d.trip_kinds || {}, vid = st.tripVeh && vs.some(function (v) { return v.id === st.tripVeh; }) ? st.tripVeh : (vs[0] || {}).id;
    var v = vs.filter(function (x) { return x.id === vid; })[0] || {};
    var h = '';
    (d.trips_open_mine || []).forEach(function (o) {
      h += '<div class="ffl-repcta"><div><b>' + esc(o.vehicle) + ': km-Stand fehlt noch</b><span class="ffl-mu">' + esc(o.label) + ' · ' + dt(o.start) + '</span></div>' +
        '<button type="button" class="ffl-go" data-act="tripfrom" data-id="' + o.vehicle_id + '" data-v="' + o.booking_id + '">Jetzt eintragen</button></div>';
    });
    h += '<div class="ffl-sec"><div class="ffl-sh">Fahrt eintragen</div><p class="ffl-mu" style="margin-top:0">Nach jeder Fahrt kurz den km-Stand – ersetzt das Heft im Fahrzeug. Wird unveränderbar gespeichert.</p>' +
      '<div class="ffl-chips ffl-bigchips">' + vs.map(function (x) { return '<button type="button" class="ffl-toggle-chip' + (x.id === vid ? ' on' : '') + '" data-act="tripveh" data-id="' + x.id + '">' + esc(x.name) + '</button>'; }).join('') + '</div>' +
      '<p class="ffl-mu" style="margin:6px 0 12px">' + esc(v.name || '') + ': ' + (v.km ? 'zuletzt <b style="color:var(--ink)">' + kmFmt(v.km) + ' km</b>' : 'noch kein km-Stand bekannt') + '</p>' +
      '<div class="ffl-form2"><div><label class="ffl-fl">Zweck</label><select id="myf-tkind">' + Object.keys(kinds).map(function (k) { return '<option value="' + k + '"' + (k === (st.tripKind || 'dienst') ? ' selected' : '') + '>' + esc(kinds[k]) + '</option>'; }).join('') + '</select></div>' +
      '<div><label class="ffl-fl">Anlass / Ziel</label><input type="text" id="myf-tpurp" list="myf-tpurp-l" placeholder="z. B. Werkstatt, Lehrgang" value="' + esc(st.tripPurp || '') + '">' +
        // Vorschläge: Einsätze der letzten Tage und übliche Ziele – nicht alles neu tippen
        '<datalist id="myf-tpurp-l">' + (d.incidents || []).slice(0, 6).map(function (i) { return '<option value="' + esc((i.nr ? i.nr + ' ' : '') + i.title) + '">'; }).join('') +
        ['Werkstatt', 'Tanken', 'Lehrgang', 'Übungsdienst', 'Jugendfeuerwehr'].map(function (x) { return '<option value="' + x + '">'; }).join('') + '</datalist></div>' +
      '<div><label class="ffl-fl">km-Stand am Ende</label><input type="number" id="myf-tkm" inputmode="numeric" placeholder="' + (v.km ? 'zuletzt ' + kmFmt(v.km) : 'km') + '"></div>' +
      '<div><label class="ffl-fl">Getankt (Liter, optional)</label><input type="text" id="myf-tfuel" inputmode="decimal" placeholder="l"></div></div>' +
      '<button type="button" class="ffl-go" style="margin-top:12px" data-act="tripsave" data-id="' + vid + '"' + (st.tripBooking ? ' data-v="' + st.tripBooking + '"' : '') + '>Fahrt speichern</button></div>';
    var mine = d.my_trips || [];
    h += '<div class="ffl-sec"><div class="ffl-sh">Meine letzten Fahrten</div>' + (mine.length ? mine.map(function (t) {
      var vv = vs.filter(function (x) { return x.id === t.vehicle_id; })[0] || {};
      return '<div class="ffl-ev"><div class="ffl-day">' + dShort(t.start) + '</div><div style="flex:1"><b>' + esc(vv.name || '') + '</b><div class="ffl-mu">' + esc(kinds[t.kind] || t.kind) + (t.purpose ? ' · ' + esc(t.purpose) : '') + '</div>' +
        '<div class="ffl-mu">' + (t.km_start != null ? kmFmt(t.km_start) + ' – ' : '') + kmFmt(t.km_end) + ' km' + (t.km_start != null && t.km_end != null ? ' (' + kmFmt(t.km_end - t.km_start) + ' km)' : '') + (t.fuel_l ? ' · ' + String(t.fuel_l).replace('.', ',') + ' l getankt' : '') + '</div></div></div>';
    }).join('') : '<p class="ffl-mu">Noch keine.</p>') + fbBtn('vehicle', 'Fahrtenbuch') + '</div>';
    return h;
  }

  // Schnellzugriff auf der Startseite: das, was man im Gerätehaus/unterwegs oft braucht
  function quickActions() {
    var q = [];
    if (d.trip_vehicles && d.trip_vehicles.length) q.push(['trips', 'Fahrt eintragen', 'km-Stand, Tanken']);
    if ((d.bookable || []).length && can('booking')) q.push(['vehicle', 'Fahrzeug buchen', 'Bulli & Co. anfragen']);
    if (can('defects')) q.push(['defects', 'Mangel melden', 'kaputt oder fehlt']);
    if (d.can_notice) q.push(['notices', 'Hinweis', 'fürs Dashboard']);
    if (!q.length) return '';
    return '<div class="ffl-quick">' + q.map(function (x) { return '<button type="button" data-go="' + x[0] + '"><b>' + x[1] + '</b><span>' + x[2] + '</span></button>'; }).join('') + '</div>';
  }

  // Gerät aus der Atemschutzwerkstatt (QR-Code am Gerät)
  function deviceCard() {
    var x = d.device;
    if (!x) return '';
    return '<div class="ffl-fbbox"><b>' + esc(x.label + ' ' + x.nr) + '</b> <span class="ffl-chip ' + (x.status === 'ready' ? 'st-ok' : x.status === 'used' ? 'st-warn' : 'st-bad') + '">' + esc(x.status_label) + '</span>' +
      (x.location ? '<div class="ffl-mu">' + esc(x.location) + '</div>' : '') +
      (x.status === 'ready' ? '<p class="ffl-mu" style="margin:8px 0 0">Im Einsatz oder bei der Übung benutzt? Kurz melden – die Werkstatt reinigt und prüft das Gerät, bis dahin gilt es als benutzt.</p>' :
        x.status === 'used' ? '<p class="ffl-mu" style="margin:8px 0 0">Ist schon als benutzt gemeldet – die Werkstatt kümmert sich.</p>' :
        x.status === 'blocked' ? '<p class="ffl-mu" style="margin:8px 0 0"><b>Nicht benutzen</b> – das Gerät ist gesperrt.</p>' : '') +
      '<div class="ffl-row" style="margin-top:10px">' +
      (x.status === 'ready' ? '<button type="button" class="ffl-go" data-act="devused" data-id="' + x.id + '">Nach Gebrauch melden</button>' : '') +
      (MYF.admin ? '<button type="button" data-act="openadmin" data-v="geraet:' + x.id + '">Prüfung eintragen (Werkstatt)</button>' : '') + '</div></div>';
  }

  // ---- Benachrichtigungen & „Bescheid geben“ ------------------------------------
  window.MYFOpenInbox = function () { st.tab = 'inbox'; render(); window.scrollTo(0, root.offsetTop - 20); };
  function unread() { return (d.notifications || []).filter(function (n) { return !n.read; }).length; }
  var NTAB = { orders: 'orders', start: 'start', defects: 'defects', ideas: 'ideas', agt: 'agt', clothing: 'clothing', courses: 'courses', incidents: 'incidents', messages: 'inbox', notices: 'notices', duties: 'duties', board: 'board', vehicle: 'vehicle', bookings: 'vehicle', loops: 'loops' };
  function vInbox() {
    var ns = d.notifications || [];
    var h = '<div class="ffl-sec"><div class="ffl-sh">Benachrichtigungen<em>' + (unread() ? unread() + ' neu' : 'alles gelesen') + '</em></div>' +
      '<div class="ffl-row">' + (unread() ? '<button type="button" class="ffl-sm" data-act="nread">Alle als gelesen markieren</button>' : '') +
      '<label class="ffl-check" style="margin-left:auto"><input type="checkbox" id="myf-nmail"' + (d.notify_mail ? ' checked' : '') + '> zusätzlich per E-Mail</label></div>';
    if (!ns.length) h += '<p class="ffl-mu">Keine Benachrichtigungen.</p>';
    // Offen (ungelesen) und Erledigt (gelesen, noch einen Tag sichtbar) getrennt – wie ein Verlauf
    var open = ns.filter(function (n) { return !n.read; }), done = ns.filter(function (n) { return n.read; });
    // Direkt handeln, wo eine Entscheidung ohne weitere Angaben reicht; sonst ein Knopf mit klarem Verb, der genau dorthin führt
    function noteMain(n, tab) {
      var k = String(n.key || ''), bk = !n.read && k.indexOf('bkreq:') === 0 && can('booking_approve') ? +k.slice(6) : 0;
      if (bk) return '<button type="button" class="ffl-sm ffl-p" data-act="bkok" data-id="' + bk + '" data-nid="' + n.id + '">Freigeben</button><button type="button" class="ffl-sm" data-act="bkno" data-id="' + bk + '" data-nid="' + n.id + '">Ablehnen</button>';
      if (!tab) return '';
      var verb = n.kind === 'ask' && !n.read ? 'Ja, war dabei' : tab.indexOf('bericht:') === 0 ? 'Bericht ausfüllen' : n.kind === 'briefing' ? 'Lesen & bestätigen' : n.kind === 'duty' ? 'Ansehen' :
        String(n.key || '').indexOf('done~') === 0 ? 'Ansehen' : n.kind === 'part' ? 'Entscheiden' : n.kind === 'cert' ? (tab.indexOf('admin:') === 0 ? 'Bearbeiten' : 'Stand ansehen') : 'Öffnen';
      return '<button type="button" class="ffl-sm' + (n.read ? '' : ' ffl-p') + '" data-act="ngo" data-v="' + tab + '" data-k="' + esc(n.kind || '') + '" data-id="' + n.id + '">' + verb + '</button>' +
        (n.kind === 'ask' && !n.read ? '<button type="button" class="ffl-sm" data-act="nread1" data-id="' + n.id + '" title="Nicht dabei gewesen – Hinweis erledigt">Nein</button>' : '');
    }
    function noteRow(n) {
      var sv = String(n.key || '').indexOf('done~') === 0; // jemand anderes hat den Vorgang schon bearbeitet
      var tab = n.link && /^(admin|einsatz|bericht|brief):/.test(n.link) ? n.link : NTAB[n.link] || '';
      return '<div class="ffl-note' + (n.read ? ' is-done' : ' is-new') + '"><div style="flex:1"><b>' + esc(n.title) + '</b>' + (n.body ? '<div class="ffl-mu">' + esc(n.body) + '</div>' : '') +
        '<div class="ffl-mu" style="font-size:13px">' + dt(n.created) + (sv ? ' · vom Team erledigt' : n.read ? ' · erledigt' : '') + '</div></div><div class="ffl-nacts">' +
        noteMain(n, tab) +
        (sv ? '' : n.read ? '<button type="button" class="ffl-sm ffl-q" data-act="nunread" data-id="' + n.id + '" title="Wieder als ungelesen markieren">↺ Ungelesen</button><button type="button" class="ffl-sm ffl-q ffl-ndel" data-act="ndel" data-id="' + n.id + '" title="Endgültig löschen">Löschen</button>'
          : '<button type="button" class="ffl-sm ffl-ndone" data-act="nread1" data-id="' + n.id + '" title="Als erledigt markieren – wandert in den Verlauf"><i>✓</i> Erledigt</button>') + '</div></div>';
    }
    var LN = MYFUI.lt(st, 'inbox', open, { noun: 'Nachrichten', ph: 'In Nachrichten suchen …', per: 15, text: function (n) { return n.title + ' ' + (n.body || ''); },
      sorts: [['new', 'neueste zuerst', function (n) { return n.created; }, -1], ['old', 'älteste zuerst', function (n) { return n.created; }, 1]] });
    if (open.length > 8) h += LN.bar;
    LN.rows.forEach(function (n) { h += noteRow(n); });
    if (!open.length && ns.length) h += '<p class="ffl-mu">Nichts Offenes – alles erledigt. 👍</p>';
    h += LN.pager + '</div>';
    if (done.length) h += '<div class="ffl-sec ffl-ndone-sec"><div class="ffl-sh">Erledigt<em>verschwindet nach einem Tag · ' + done.length + '</em></div>' + done.map(noteRow).join('') +
      '<div class="ffl-row" style="margin-top:8px"><button type="button" class="ffl-sm ffl-q" data-act="ndelall">Verlauf jetzt leeren</button></div></div>';
    var ms = d.my_messages || [];
    if (ms.length) h += '<div class="ffl-sec"><div class="ffl-sh">Meine Rückfragen</div>' + ms.map(function (m) {
      return '<div class="ffl-idea"><div class="ffl-row" style="justify-content:space-between"><b>' + esc(m.about || d.message_areas[m.area] || m.area) + '</b>' +
        '<span class="ffl-chip ' + (m.status === 'open' ? 'st-warn' : 'st-ok') + '">' + (m.status === 'open' ? 'offen' : 'erledigt') + '</span></div><div class="ffl-pre-line">' + esc(m.text) + '</div>' +
        (m.answer ? '<div class="ffl-answer"><b style="display:block;font-size:13px;color:var(--mu)">Antwort von ' + esc(m.answered_by) + '</b>' + esc(m.answer) + '</div>' : '') + '</div>';
    }).join('') + '</div>';
    return h;
  }
  // Passkeys im Konto: Face ID / Touch ID / Windows Hello statt Passwort
  function passkeyRows() {
    var pk = d.passkeys || [], can = window.MYFPasskey && MYFPasskey.ok();
    var h = '<div class="ffl-prow is-static"><span><b>Passkeys</b><small>' + (pk.length ? 'Anmelden ohne Passwort – mit Gesicht, Fingerabdruck oder Geräte-PIN' : 'Einmal einrichten, dann ohne Passwort anmelden (Face ID, Touch ID, Windows Hello)') + '</small></span>' +
      (can ? '<button type="button" class="ffl-sm ffl-p" data-act="pkadd">' + (pk.length ? '+ Passkey' : 'Einrichten') + '</button>' : '<small class="ffl-mu">auf diesem Gerät nicht verfügbar</small>') + '</div>';
    pk.forEach(function (p) {
      h += '<div class="ffl-prow is-static ffl-pkrow"><span><b>' + esc(p.name) + '</b><small>seit ' + fmtDate(p.created) + (p.last_used ? ' · zuletzt ' + dt(p.last_used) : ' · noch nicht benutzt') + '</small></span><button type="button" class="ffl-sm ffl-q" data-act="pkdel" data-id="' + p.id + '">Entfernen</button></div>';
    });
    return h;
  }
  // Zwei-Faktor fürs eigene Konto: Code-App (QR scannen oder Schlüssel abtippen), Notfall-Codes. Wer per Passkey (mit Gerätebestätigung)
  // anmeldet, braucht sie nicht – sie schützt die Anmeldung mit Passwort.
  function twofaRows() {
    var t = d.twofa || {}, pk = (d.passkeys || []).length;
    var h = '<div class="ffl-prow is-static"><span><b>Zwei-Faktor-Anmeldung</b><small>' + (t.on ? 'aktiv – beim Anmelden mit Passwort fragt ' + esc(MYF.app || 'SPIND') + ' zusätzlich einen Code aus der App · ' + t.left + ' Notfall-Codes übrig'
      : pk ? 'Mit Passkey brauchst du sie nicht. Nur wenn du dich auch mit Passwort anmeldest, schützt ein Code aus einer App zusätzlich.' : 'Zusätzlich zum Passwort ein Code aus einer App am Handy – ein erratenes Passwort reicht dann nicht.' + (t.required ? ' Für dein Konto Pflicht.' : '')) + '</small></span>' +
      (st.twofa || st.twofaCodes ? '' : t.on ? '<button type="button" class="ffl-sm" data-act="m2faman">Verwalten</button>' : '<button type="button" class="ffl-sm' + (pk ? '' : ' ffl-p') + '" data-act="m2fastart">Einrichten</button>') + '</div>';
    if (st.twofaCodes) return h + '<div class="ffl-pbox ffl-2fabox"><div class="ffl-msg ok"><b>Eingerichtet.</b> Diese Notfall-Codes ausdrucken oder sicher notieren – jeder gilt einmal, falls das Handy fehlt:</div>' +
      '<pre class="ffl-codes">' + esc(st.twofaCodes.join('\n')) + '</pre><button type="button" class="ffl-p" data-act="m2fadone">Notiert – fertig</button></div>';
    if (st.twofa && st.twofa.uri) {
      var qr = ''; try { var q = qrcode(0, 'M'); q.addData(st.twofa.uri); q.make(); qr = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); } catch (e) {}
      return h + '<div class="ffl-pbox ffl-2fabox"><p class="ffl-mu" style="margin-top:0">1. Code-App öffnen (z. B. Google oder Microsoft Authenticator, 1Password) und den QR-Code scannen – am Handy reicht „In Code-App öffnen“.<br>2. Den angezeigten 6-stelligen Code hier eingeben.</p>' +
        '<div class="ffl-row" style="align-items:flex-start">' + (qr ? '<div class="ffl-qrbox">' + qr + '</div>' : '') + '<div style="flex:1;min-width:200px"><a class="ffl-btn ffl-sm" href="' + esc(st.twofa.uri) + '">In Code-App öffnen</a>' +
        '<div class="ffl-mu" style="margin-top:10px">Oder Schlüssel abtippen:</div><code class="ffl-2fakey">' + esc(st.twofa.secret) + '</code></div></div>' +
        '<div class="ffl-row" style="margin-top:12px"><input type="text" id="myf-2facode" inputmode="numeric" autocomplete="one-time-code" placeholder="6-stelliger Code" style="width:170px;flex:0 0 auto"><button type="button" class="ffl-p" data-act="m2faconfirm">Bestätigen</button><button type="button" class="ffl-q" data-act="m2facancel">Abbrechen</button></div></div>';
    }
    if (st.twofa === 'manage') return h + '<div class="ffl-pbox ffl-2fabox"><p class="ffl-mu" style="margin-top:0">Für beides den aktuellen Code aus der App (oder einen Notfall-Code) eingeben.</p><div class="ffl-row"><input type="text" id="myf-2facode" inputmode="numeric" autocomplete="one-time-code" placeholder="Code" style="width:150px;flex:0 0 auto">' +
      '<button type="button" data-act="m2farec">Neue Notfall-Codes</button>' + (t.required ? '' : '<button type="button" class="ffl-q" style="color:var(--red-tx)" data-act="m2faoff">Abschalten</button>') + '<button type="button" class="ffl-q" data-act="m2facancel">Schließen</button></div></div>';
    return h;
  }
  // Betriebsarzt für die G26 (aus den Einstellungen) – Anschrift, Telefon, Website zum Antippen
  // Telefonnummern: unsichtbare Richtungszeichen (Copy-Paste) entfernen; „+49 (0) 2565“ wählt ohne die (0)
  function telTxt(p) { return String(p || '').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim(); }
  function telHref(p) { var t = telTxt(p); if (t.charAt(0) === '+') t = t.replace(/\(\s*0\s*\)/, ''); return t.replace(/[^\d+]/g, ''); }
  function doctorCard(dr) {
    if (!dr || !dr.name) return '';
    return '<div class="ffl-pbox ffl-doctor"><div class="ffl-fl" style="margin-top:0">Betriebsarzt · G26-Untersuchung</div><b>' + esc(dr.name) + '</b>' +
      (dr.address ? '<div class="ffl-mu">' + esc(dr.address) + '</div>' : '') +
      '<div class="ffl-row" style="margin-top:8px;gap:6px">' + (dr.phone ? '<a class="ffl-btn ffl-sm" href="tel:' + esc(telHref(dr.phone)) + '">☎ ' + esc(telTxt(dr.phone)) + '</a>' : '') +
      (dr.url ? '<a class="ffl-btn ffl-sm" href="' + esc(dr.url) + '" target="_blank" rel="noopener">Website ↗</a>' : '') + '</div>' +
      (dr.note ? '<div class="ffl-mu" style="margin-top:6px">' + esc(dr.note) + '</div>' : '') + '</div>';
  }
  // Kleiner Knopf unter Daten: öffnet „Bescheid geben“ an den zuständigen Bereich
  function fbBtn(area, about) {
    return '<button type="button" class="ffl-q ffl-sm ffl-fbbtn" data-act="fb" data-v="' + esc(area) + '" data-about="' + esc(about) + '">Stimmt etwas nicht? Bescheid geben</button>';
  }
  function feedbackBox() {
    return '<div class="ffl-fbbox"><b>Bescheid geben: ' + esc(st.fb.about || d.message_areas[st.fb.area] || '') + '</b>' +
      '<p class="ffl-mu" style="margin:4px 0 8px">Geht an die Zuständigen für „' + esc(d.message_areas[st.fb.area] || st.fb.area) + '“ – du bekommst die Antwort hier als Benachrichtigung.</p>' +
      '<textarea id="myf-fbtext" rows="3" style="min-height:80px" placeholder="Was stimmt nicht? z. B. „Übungsstrecke am 12.03. fehlt“"></textarea>' +
      '<div class="ffl-row" style="margin-top:8px"><button type="button" class="ffl-p" data-act="fbsend">Senden</button><button type="button" data-act="fbcancel">Abbrechen</button></div></div>';
  }

  // ---- Hinweise (Dashboard) --------------------------------------------------
  var NLV = { info: ['Info', 'st-open'], warn: ['Wichtig', 'st-warn'], alert: ['Achtung', 'st-bad'] };
  function fmtDT(v) { return v ? fmtDate(v) + (v.slice(11, 16) !== '00:00' ? ' ' + v.slice(11, 16) : '') : ''; }
  // Amtliche Warnungen (NINA/DWD) für den Kreis
  function warningsBox() {
    return (d.warnings || []).map(function (w) {
      var until = w.expires ? w.expires.slice(0, 16).replace('T', ' ') : '';
      return '<div class="ffl-notice lv-' + (w.severity >= 3 ? 'alert' : 'warn') + '"><b>' + esc(w.provider || 'Warnung') + '</b><span>' + esc(w.headline) + (until ? '<small>bis ' + dt(until) + ' Uhr</small>' : '') + '</span></div>';
    }).join('');
  }
  function noticesNow() {
    var n = d.notices_now || [];
    return n.map(function (x) {
      return '<div class="ffl-notice lv-' + x.level + '"><b>' + NLV[x.level][0] + '</b><span>' + esc(x.text) + (x.signature ? '<small>— ' + esc(x.signature) + '</small>' : '') + '</span></div>';
    }).join('');
  }
  function isoLocal(dt) { return dt.getFullYear() + '-' + ('0' + (dt.getMonth() + 1)).slice(-2) + '-' + ('0' + dt.getDate()).slice(-2) + 'T' + ('0' + dt.getHours()).slice(-2) + ':' + ('0' + dt.getMinutes()).slice(-2); }
  function untilPreset(k) {
    var t = new Date(); t.setSeconds(0, 0);
    if (k === 'today') { t.setHours(23, 59); }
    else if (k === 'tomorrow') { t.setDate(t.getDate() + 1); t.setHours(23, 59); }
    else if (k === 'sunday') { t.setDate(t.getDate() + ((7 - t.getDay()) % 7)); t.setHours(23, 59); }
    else if (k === 'week') { t.setDate(t.getDate() + 7); t.setHours(23, 59); }
    else return '';
    return isoLocal(t);
  }
  function vNotices() {
    var e = st.nedit ? (d.notices.filter(function (x) { return x.id === st.nedit; })[0] || {}) : (st.ncopy || {}), now = isoLocal(new Date()).replace('T', ' ') + ':' + ('0' + new Date().getSeconds()).slice(-2);
    var lv = st.nlevel || e.level || 'info';
    var h = '<div class="ffl-sec"><div class="ffl-sh">' + (st.nedit ? 'Hinweis bearbeiten' : 'Neuer Hinweis für das Dashboard') + '</div>' +
      '<p class="ffl-mu" style="margin-top:0">Erscheint auf dem Fernseher im Besprechungsraum und für alle auf der ' + APP + '-Startseite – z. B. „HLF in der Werkstatt“ oder „Erste-Hilfe-Tasche liegt im LF in G3“.</p>' +
      '<textarea id="myf-ntext" aria-label="Text des Hinweises" maxlength="300" rows="3" style="min-height:90px" placeholder="Was sollen alle wissen?">' + esc(e.text || '') + '</textarea>' +
      '<div class="ffl-fl">Wie wichtig?</div><div class="ffl-seg3">' + ['info', 'warn', 'alert'].map(function (k) {
        return '<button type="button" data-act="nlevel" data-v="' + k + '" aria-pressed="' + (lv === k) + '" class="lv-' + k + '">' + NLV[k][0] + '</button>';
      }).join('') + '</div>' +
      '<div class="ffl-fl">Anzeigen bis</div><div class="ffl-pills" style="margin-top:0">' + [['', 'bis ich es beende'], ['today', 'heute'], ['tomorrow', 'morgen'], ['sunday', 'Sonntag'], ['week', '1 Woche']].map(function (p) {
        return '<button type="button" data-act="nuntil" data-v="' + p[0] + '">' + p[1] + '</button>';
      }).join('') + '</div>' +
      '<input type="datetime-local" id="myf-nends" aria-label="Anzeigen bis" value="' + esc(e.ends ? e.ends.slice(0, 16).replace(' ', 'T') : '') + '" style="margin-top:8px">' +
      '<div class="ffl-fl">Unterschrift</div>' + '<select id="myf-nsig" aria-label="Unterschrift" style="width:auto"><option value="">keine</option>' + (d.my_role ? '<option value="role"' + (e.signature && e.signature === d.my_role ? ' selected' : '') + '>meine Funktion: ' + esc(d.my_role) + '</option>' : '') +
      '<option value="name"' + (e.signature && e.signature === d.member.name ? ' selected' : '') + '>mein Name</option></select>' +
      '<details style="margin-top:10px"' + (e.starts ? ' open' : '') + '><summary class="ffl-mu" style="cursor:pointer">Erst später anzeigen (z. B. ab Freitag)</summary>' +
      '<input type="datetime-local" id="myf-nstarts" aria-label="Anzeigen ab" value="' + esc(e.starts ? e.starts.slice(0, 16).replace(' ', 'T') : '') + '" style="margin-top:8px"></details>' +
      '<div class="ffl-row" style="margin-top:12px"><button type="button" class="ffl-go" data-act="nsave">' + (st.nedit ? 'Speichern' : 'Veröffentlichen') + '</button>' +
      (st.nedit || st.ncopy ? '<button type="button" data-act="ncancel">Abbrechen</button>' : '') + '</div></div>';
    var list = d.notices || [];
    var act = list.filter(function (x) { return (!x.ends || x.ends > now) && (!x.starts || x.starts <= now); });
    var plan = list.filter(function (x) { return x.starts && x.starts > now && (!x.ends || x.ends > now); });
    var past = list.filter(function (x) { return x.ends && x.ends <= now; });
    function row(x, kind) {
      return '<div class="ffl-notice lv-' + x.level + (kind === 'past' ? ' is-past' : '') + '"><b>' + NLV[x.level][0] + '</b><span>' + esc(x.text) +
        '<small>' + esc([x.starts ? 'ab ' + fmtDT(x.starts) : '', x.ends ? (kind === 'past' ? 'beendet ' : 'bis ') + fmtDT(x.ends) : 'ohne Ende', 'von ' + x.author + (x.updated_by && x.updated_by !== x.author ? ', geändert von ' + x.updated_by : '')].filter(Boolean).join(' · ')) + '</small></span>' +
        '<div class="ffl-row" style="flex:0 0 auto">' + (kind === 'past' ? '<button type="button" class="ffl-sm" data-act="ncopy" data-id="' + x.id + '">Wieder verwenden</button>'
          : '<button type="button" class="ffl-sm" data-act="nedit" data-id="' + x.id + '">Bearbeiten</button><button type="button" class="ffl-sm" data-act="nend" data-id="' + x.id + '">Beenden</button>') + '</div></div>';
    }
    h += '<div class="ffl-sec"><div class="ffl-sh">Gerade auf dem Dashboard<em>' + act.length + '</em></div>' + (act.length ? act.map(function (x) { return row(x, 'now'); }).join('') : '<p class="ffl-mu">Keine Hinweise.</p>') + '</div>';
    if (plan.length) h += '<div class="ffl-sec"><div class="ffl-sh">Geplant</div>' + plan.map(function (x) { return row(x, 'plan'); }).join('') + '</div>';
    if (past.length) h += '<details class="ffl-sec"><summary class="ffl-mu" style="cursor:pointer">Beendet (letzte 30 Tage): ' + past.length + '</summary>' + past.map(function (x) { return row(x, 'past'); }).join('') + '</details>';
    return h;
  }
  function keepNoticeForm() { st.nkeep = { text: val('myf-ntext'), ends: val('myf-nends'), starts: val('myf-nstarts') }; }
  function restoreNoticeForm() {
    if (!st.nkeep) return;
    ['text', 'ends', 'starts'].forEach(function (k) { var el = document.getElementById('myf-n' + k); if (el) el.value = st.nkeep[k]; });
    st.nkeep = null;
  }

  function outOfService() {
    var o = d.defects_out || [];
    return o.length ? '<div class="ffl-msg err" style="margin-top:12px"><b>Außer Dienst:</b> ' + o.map(function (x) { return esc(x.object) + (x.title ? ' – ' + esc(x.title) : ''); }).join(' · ') + '</div>' : '';
  }
  // Rechte: wer darf was melden (legt die Verwaltung fest)
  var RLABEL = { defects: 'Mängel melden', clothing: 'Kleidung anfordern', ideas: 'Anregungen schreiben', courses: 'Lehrgangswünsche eintragen', notices: 'Hinweise schreiben' };
  function can(k) { return !d.rights || d.rights[k] !== false; }
  function noRight(k) {
    var who = (d.rights_who || {})[k];
    return '<div class="ffl-msg">' + RLABEL[k] + (who ? ' können bei uns nur: <b>' + esc(who) + '</b>.' : ' können bei uns nur bestimmte Mitglieder.') + ' Sprich sie bitte direkt an.</div>';
  }
  function vDefects() {
    var h = outOfService();
    if (d.settings.defects_open && !can('defects')) h += noRight('defects');
    else if (d.settings.defects_open) {
      var objs = d.defect_objects.slice(), pre = st.defObj || '';
      if (pre && objs.indexOf(pre) < 0) objs.unshift(pre);
      h += '<div class="ffl-sec"><div class="ffl-sh">Mangel melden</div><p class="ffl-mu">Am Fahrzeug, Gerät oder im Gerätehaus ist etwas kaputt oder fehlt? Kurz melden – am besten mit Foto.</p><form id="myf-dform">' +
        '<label class="ffl-fl" for="myf-dobj">Was ist betroffen?</label><select id="myf-dobj"><option value="">bitte wählen …</option>' +
        objs.map(function (o) { return '<option' + (o === pre ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>' +
        '<div class="ffl-fl">Wie dringend?</div><div class="ffl-seg2" style="grid-template-columns:1fr 1fr 1fr">' +
        [['out', 'Außer Dienst', 'nicht einsatzbereit'], ['soon', 'Bald beheben', 'geht noch'], ['info', 'Hinweis', 'Kleinigkeit']].map(function (u) {
          return '<button type="button" data-act="durg" data-v="' + u[0] + '" aria-pressed="' + (st.durg === u[0]) + '"' + (u[0] === 'out' && st.durg === 'out' ? ' style="background:var(--red);border-color:var(--red-tx)"' : '') + '>' + u[1] + '<span style="font-weight:400">' + u[2] + '</span></button>';
        }).join('') + '</div>' +
        '<label class="ffl-fl" for="myf-dtitle">Kurz: was ist los?</label><input type="text" id="myf-dtitle" maxlength="150" placeholder="z. B. Blaulicht vorne links defekt">' +
        '<label class="ffl-fl" for="myf-dtext">Details</label><textarea id="myf-dtext" rows="3" style="min-height:84px" placeholder="Wo genau, seit wann, was hast du schon versucht?"></textarea>' +
        '<label class="ffl-fl" for="myf-dphoto">Fotos (bis zu 3)</label><input type="file" id="myf-dphoto" accept="image/*" capture="environment" multiple>' +
        '<div class="ffl-row" id="myf-dprev" style="margin-top:8px">' + st.photos.map(function (p, i) { return '<img src="' + p + '" alt="" style="width:84px;height:84px;object-fit:cover;border-radius:4px" data-act="dphotodel" data-v="' + i + '" title="Antippen zum Entfernen">'; }).join('') + '</div>' +
        '<button type="submit" class="ffl-go" style="width:100%;margin-top:14px"' + (st.busy ? ' disabled' : '') + '>' + (st.busy ? 'Wird gesendet …' : 'Mangel melden') + '</button></form></div>';
    } else h += '<div class="ffl-msg">Mängelmeldungen sind gerade geschlossen. Bitte direkt beim Gerätewart melden.</div>';
    h += '<div class="ffl-sec"><div class="ffl-sh">Deine Meldungen</div>';
    if (!d.defects.length) h += '<p class="ffl-mu">Noch keine.</p>';
    d.defects.forEach(function (x) {
      h += '<div class="ffl-idea"><div class="ffl-row" style="justify-content:space-between"><b>' + esc(x.object) + ': ' + esc(x.title) + '</b>' + tag(DSTAT, x.status) + '</div>' +
        '<div class="ffl-mu">' + fmtDate(x.created) + ' · ' + esc(d.defect_urgency[x.urgency].split(' – ')[0]) + '</div>' +
        (x.text ? '<div class="ffl-pre-line" style="margin-top:6px">' + esc(x.text) + '</div>' : '') +
        (x.photos.length ? '<div class="ffl-row" style="margin-top:8px">' + x.photos.map(function (p) { return '<a href="' + esc(p) + '" target="_blank" rel="noopener"><img src="' + esc(p) + '" alt="Foto" style="width:72px;height:72px;object-fit:cover;border-radius:4px"></a>'; }).join('') + '</div>' : '') +
        (x.answer ? '<div class="ffl-answer"><b style="display:block;font-size:13px;color:var(--mu)">Antwort vom ' + fmtDate(x.answered) + '</b>' + esc(x.answer) + '</div>' : '') + '</div>';
    });
    return h + '</div>';
  }

  // Foto im Browser verkleinern (max. 1600 px, JPEG) – spart Datenvolumen und entfernt Standortdaten
  function shrink(file) {
    return new Promise(function (resolve) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var s = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  // ---- Anregungen ------------------------------------------------------------
  function vIdeas() {
    var h = '';
    if (d.settings.ideas_open && !can('ideas')) h += noRight('ideas');
    else if (d.settings.ideas_open) {
      var def = d.member.unit;
      h += '<div class="ffl-sec"><div class="ffl-sh">Anregung oder Hinweis</div><p class="ffl-mu">Was läuft gut, was könnte besser werden? Ideen, Hinweise, Kritik – direkt an die Führung.</p><form id="myf-iform">' +
        '<label class="ffl-fl" for="myf-ito">An</label><select id="myf-ito">' + Object.keys(d.idea_to).map(function (k) { return '<option value="' + k + '"' + (k === def ? ' selected' : '') + '>' + esc(d.idea_to[k]) + '</option>'; }).join('') + '</select>' +
        '<label class="ffl-fl" for="myf-isub">Betreff</label><input type="text" id="myf-isub" maxlength="150" placeholder="kurz, worum es geht">' +
        '<label class="ffl-fl" for="myf-itext">Deine Anregung</label><textarea id="myf-itext" rows="5" style="min-height:130px"></textarea>' +
        '<label class="ffl-row" style="margin-top:14px;align-items:flex-start;gap:10px"><input type="checkbox" id="myf-ianon" style="margin-top:3px"> <span><b style="font-weight:600">Anonym senden</b><br><span class="ffl-mu">Die Führung sieht dann nicht, von wem die Anregung ist. Eine Antwort siehst du trotzdem hier – Rückfragen sind aber nicht möglich.</span></span></label>' +
        '<button type="submit" class="ffl-go" style="width:100%;margin-top:14px">Absenden</button></form></div>';
    } else h += '<div class="ffl-msg">Anregungen sind gerade geschlossen.</div>';
    h += '<div class="ffl-sec"><div class="ffl-sh">Deine Anregungen</div>';
    if (!d.ideas.length) h += '<p class="ffl-mu">Noch keine.</p>';
    d.ideas.forEach(function (i) {
      h += '<div class="ffl-idea"><div class="ffl-row" style="justify-content:space-between"><b>' + esc(i.subject || 'Anregung') + '</b>' + tag(IDEA, i.status) + '</div>' +
        '<div class="ffl-mu">an ' + esc(d.idea_to[i.recipient]) + ' · ' + fmtDate(i.created) + (i.anonymous ? ' · anonym' : '') + '</div>' +
        '<div class="ffl-pre-line" style="margin-top:6px">' + esc(i.text) + '</div>' +
        (i.answer ? '<div class="ffl-answer"><b style="display:block;font-size:13px;color:var(--mu)">Antwort vom ' + fmtDate(i.answered) + '</b>' + esc(i.answer) + '</div>' : '') +
        (i.status === 'new' || i.status === 'progress' ? '<div class="ffl-row" style="margin-top:6px"><button type="button" class="ffl-q ffl-sm" style="padding:0" data-act="iwithdraw" data-id="' + i.id + '">Zurückziehen</button></div>' : '') + '</div>';
    });
    return h + '</div>';
  }

  // ---- Atemschutz ------------------------------------------------------------
  function vAgt() {
    var a = d.agt, now = today(), s = agtState();
    var planned = a.log.filter(function (l) { return l.date > now && l.kind === 'strecke'; });
    var past = a.log.filter(function (l) { return l.date <= now; });
    // Zusammenfassung oben: einsatzbereit oder was fehlt; eingeteilte Übungsstrecke aus dem Plan
    var g26ok = a.g26_until && a.g26_until >= now, ready = agtReady(s); // Lehrgang + G26 + Übungsstrecke (+ zweiter Nachweis, falls eingestellt)
    var myStr = myDuties().filter(function (x) { return ((d.duty_lists || []).filter(function (l) { return l.id === x.list_id; })[0] || {}).area === 'strecke'; })[0];
    var h = '<div class="ffl-agtbar ' + (ready ? (s.soon || s.soon2 ? 'warn' : 'ok') : 'bad') + '" style="margin-top:6px"><b>' + (ready ? '✓ Atemschutz einsatzbereit' : '✕ Atemschutz nicht einsatzbereit') + '</b><span>' +
      esc([a.course === false ? 'Lehrgang Atemschutzgeräteträger nicht nachgewiesen' : '', !g26ok ? (a.g26_until ? 'G26 abgelaufen seit ' + fmtDate(a.g26_until) + ' – nicht atemschutztauglich, kein Einsatz unter Atemschutz bis zur neuen Untersuchung' : 'G26 fehlt – ohne gültige G26 kein Einsatz unter Atemschutz') : '', !s.last ? 'noch keine Übungsstrecke' : s.over ? 'Übungsstrecke fällig' : s.soon ? 'Übungsstrecke bald fällig' : '',
        s.over2 ? (s.sec ? 'Übung oder Einsatz unter Atemschutz oder zweite Übungsstrecke fällig seit ' + fmtDate(s.due2) : 'Übung oder Einsatz unter Atemschutz oder zweite Übungsstrecke fehlt') : s.soon2 ? 'Übung oder zweite Übungsstrecke bis ' + fmtDate(s.due2) : ''].filter(Boolean).join(' · ')) + '</span></div>';
    // G26 abgelaufen oder bald fällig: der Betriebsarzt steht direkt hier – mit Telefon und Website zum Antippen
    var g26soon = !g26ok || (a.g26_until && a.g26_until < addDays(now, 60)), docShown = false;
    if (g26soon && a.doctor) { h += doctorCard(a.doctor); docShown = true; }
    else if (g26soon) h += '<div class="ffl-msg"><b>G26-Untersuchung:</b> Termin beim Betriebsarzt vereinbaren und das neue Datum der Atemschutz-Verwaltung melden.</div>';
    // Übungsstrecke: hier an- und abmelden (dahin führt auch der Termin im Kalender)
    var sLists = (d.duty_lists || []).filter(function (l) { return l.area === 'strecke'; }), sById = {}; sLists.forEach(function (l) { sById[l.id] = l; });
    if (myStr) {
      var myL = sById[myStr.list_id] || {}, when = fmtDate(myStr.date) + (myStr.time ? ', ' + myStr.time + ' Uhr' : '');
      h += '<div class="ffl-msg ok ffl-row" style="justify-content:space-between"><span>Du bist für die Übungsstrecke eingeteilt: <b>' + esc(when) + '</b></span>' +
        (myL.self_signup ? '<button type="button" class="ffl-sm" data-act="duty" data-v="0" data-id="' + myStr.id + '">Abmelden</button>'
          : '<button type="button" class="ffl-sm" data-act="fb" data-v="strecke" data-about="' + esc('Übungsstrecke ' + when + ' – ich kann nicht') + '">Kann nicht – Bescheid geben</button>') + '</div>';
    } else {
      var cnt = {}; (d.duty_assign || []).forEach(function (x) { cnt[x.slot_id] = (cnt[x.slot_id] || 0) + 1; });
      var freeS = (d.duty_slots || []).filter(function (x) { var l = sById[x.list_id]; return l && l.self_signup && x.date && x.date >= now && (cnt[x.id] || 0) < x.capacity; });
      if (freeS.length) h += '<div class="ffl-sec"><div class="ffl-sh">Übungsstrecke: freie Termine</div>' + freeS.map(function (x) {
        return '<div class="ffl-ev"><div class="ffl-day">' + dShort(x.date) + (x.time ? '<small>' + esc(x.time) + ' Uhr</small>' : '') + '</div><div style="flex:1"><b>' + esc(x.label || 'Übungsstrecke') + '</b><div class="ffl-mu">' +
          (x.capacity - (cnt[x.id] || 0)) + ' Plätze frei</div></div><button type="button" class="ffl-sm ffl-p" data-act="duty" data-v="1" data-id="' + x.id + '">Anmelden</button></div>';
      }).join('') + '</div>';
      else if (s.over || s.soon) h += '<div class="ffl-msg warn ffl-row" style="justify-content:space-between"><span><b>Übungsstrecke ' + (s.over ? 'fällig' : 'bald fällig') + '</b> – zurzeit ist kein Termin zum Eintragen offen. Die Atemschutz-Verwaltung plant die Termine.</span>' +
        '<button type="button" class="ffl-sm" data-act="fb" data-v="strecke" data-about="Übungsstrecke: bitte Termin einplanen">Termin anfragen</button></div>';
    }
    h += '<div class="ffl-sec"><div class="ffl-mine"><div class="ffl-mu">Übungsstrecke zuletzt</div><b>' + (s.last ? fmtDate(s.last.date) : 'noch nicht eingetragen') + '</b>' +
      (s.due ? '<div style="margin-top:4px' + (s.over ? ';color:var(--red-tx);font-weight:700' : '') + '">' + (s.over ? 'Fällig seit ' : 'Nächste fällig bis ') + fmtDate(s.due) + '</div>' : '') +
      (planned.length ? '<div class="ffl-msg">Geplant: ' + planned.map(function (l) { return fmtDate(l.date) + (l.note ? ' (' + esc(l.note) + ')' : ''); }).join(', ') + '</div>' : '') + '</div>';
    h += '<div class="ffl-mine"><div class="ffl-mu">G26 gültig bis</div><b' + (a.g26_until && a.g26_until < now ? ' style="color:var(--red-tx)"' : '') + '>' + (a.g26_until ? fmtDate(a.g26_until) : 'nicht eingetragen') + '</b></div>';
    if (!docShown) h += doctorCard(a.doctor);
    if (past.length) h += '<div class="ffl-fl" style="margin-top:22px">Verlauf</div>' + past.map(function (l) {
      return '<div class="ffl-ev"><div class="ffl-day">' + dShort(l.date) + '<small>' + l.date.slice(0, 4) + '</small></div><div style="flex:1"><b>' + esc(d.agt_kinds[l.kind] || l.kind) + '</b><div class="ffl-mu">' + esc(l.note) + (l.file ? ' · <a href="' + esc(l.file) + '" target="_blank" rel="noopener">📎 Nachweis</a>' : '') + '</div></div></div>';
    }).join('');
    return h + '<p class="ffl-mu" style="margin-top:14px">Die Daten pflegt die Atemschutz-Verwaltung.</p>' + fbBtn('agt', 'Atemschutz: Übungsstrecke / G26') + '</div>';
  }

  // ---- Profil ----------------------------------------------------------------
  // Schulungsunterlagen: nur Liste – die Datei lädt erst beim Antippen; eigene Lehrgänge (gewünscht/zugeteilt/absolviert) zuerst
  function vMaterials() {
    var ms = d.materials || [], q = (st.matQ || '').toLowerCase(), mine = {};
    function key(x) { return String(x || '').toLowerCase().replace(/[^a-z0-9äöüß]+/g, '').slice(0, 80); }
    d.needs.forEach(function (n) { if (n.status !== 'withdrawn' && n.status !== 'declined') { mine[key(n.short || n.title)] = 1; mine[key(n.title)] = 1; } });
    d.quals.forEach(function (x) { mine[key(x.short || x.title)] = 1; mine[key(x.title)] = 1; });
    var groups = {}; ms.forEach(function (m) { if (q && (m.title + ' ' + m.course).toLowerCase().indexOf(q) < 0) return; (groups[m.ckey] = groups[m.ckey] || { course: m.course, list: [] }).list.push(m); });
    var keys = Object.keys(groups).sort(function (a, b) { return (mine[b] ? 1 : 0) - (mine[a] ? 1 : 0) || groups[a].course.localeCompare(groups[b].course); });
    var sz = function (b) { return !b ? '' : b > 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; };
    return '<div class="ffl-sec"><input type="search" id="myf-matq" value="' + esc(st.matQ || '') + '" placeholder="Unterlage oder Lehrgang suchen …" autocomplete="off"></div>' +
      (keys.length ? keys.map(function (k) {
        var g = groups[k];
        return '<div class="ffl-sec"><div class="ffl-sh">' + esc(g.course) + (mine[k] ? '<em><span class="ffl-chip st-ok">dein Lehrgang</span></em>' : '') + '</div><ul class="ffl-matlist">' + g.list.map(function (m) {
          return '<li><a href="' + esc(m.url) + '" target="_blank" rel="noopener"><span class="ffl-matext">' + esc(m.kind === 'link' ? 'Link' : (m.ext || 'Datei').toUpperCase()) + '</span><b>' + esc(m.title) + '</b></a><span class="ffl-mu">' + esc(sz(m.size)) + '</span></li>';
        }).join('') + '</ul></div>';
      }).join('') : '<p class="ffl-mu">Nichts gefunden.</p>');
  }
  // Meine Ausbildung: absolvierte Lehrgänge (SPIND) und Nachweise (Ausbildung). Mitglieder tragen nicht selbst ein,
  // sondern bitten um Nachtrag – die Lehrgangsverwaltung prüft und trägt ein.
  function myTraining() {
    return d.needs.filter(function (n) { return n.status === 'completed'; }).map(function (n) {
      var dt = n.date_id && dateById(n.date_id);
      return { year: dt && dt.start ? +dt.start.slice(0, 4) : n.year, title: n.title, short: n.short, when: dt ? range(dt) : String(n.year), where: dt ? dt.location : '' };
    }).concat(d.quals.map(function (q) { return { year: q.year || 0, title: q.title, short: q.short, when: q.date ? fmtDate(q.date) : (q.year || ''), where: q.note }; }))
      .sort(function (a, b) { return b.year - a.year; });
  }
  function trainingHtml() {
    var done = myTraining();
    var h = '<div class="ffl-sec" id="myf-training"><div class="ffl-sh">Meine Ausbildung<em>' + done.length + (done.length === 1 ? ' Lehrgang' : ' Lehrgänge') + '</em></div>';
    h += done.length ? done.map(function (x) {
      return '<div class="ffl-ev"><div class="ffl-day">' + esc(x.year || '–') + '</div><div style="flex:1"><b>' + esc(x.short ? x.short + ' – ' : '') + esc(x.title) + '</b><div class="ffl-mu">' + esc([x.when, x.where].filter(Boolean).join(' · ')) + '</div></div></div>';
    }).join('') : '<p class="ffl-mu">Noch nichts eingetragen.</p>';
    MYFUI.courseTitles = d.course_titles || [];
    if (st.trq) h += '<div class="ffl-fbbox"><b>Lehrgang nachtragen lassen</b><p class="ffl-mu" style="margin:4px 0 8px">Die Lehrgangsverwaltung prüft und trägt ein – z. B. Lehrgänge aus der Zeit vor ' + APP + ' oder von einer anderen Wehr.</p>' +
      '<div class="ffl-form2"><div><label class="ffl-fl" for="myf-trq-title">Lehrgang</label>' + MYFUI.coursePick('myf-trq-title', 'suchen, z. B. „truppf“, „MA“, „funk“') + '</div>' +
      '<div><label class="ffl-fl">Wann (Jahr oder Datum)</label><input type="text" id="myf-trq-when" placeholder="z. B. 2019"></div>' +
      '<div class="span2"><label class="ffl-fl">Bemerkung (optional)</label><input type="text" id="myf-trq-note" placeholder="z. B. Nachweis liegt im Ordner"></div></div>' +
      '<div class="ffl-row" style="margin-top:8px"><button type="button" class="ffl-p" data-act="trqsend">Anfrage senden</button><button type="button" data-act="trq" data-v="0">Abbrechen</button></div></div>';
    else h += '<button type="button" class="ffl-sm" style="margin-top:8px" data-act="trq" data-v="1">Fehlt etwas? Nachtragen lassen</button>';
    return h + '</div>';
  }
  // Profil oben: alles Wichtige über mich auf einen Blick
  function profileOverview() {
    var P = d.personal || {}, year = new Date().getFullYear(), all = (d.incidents || []).concat(d.incidents_old || []);
    var cnt = function (k) { return d.my_participation.filter(function (p) { var i = all.filter(function (x) { return x.id === p.incident_id; })[0]; return i && +i.start.slice(0, 4) === year && (k === 'uebung' ? i.kind === 'uebung' : i.kind !== 'uebung'); }).length; };
    var fns = ((d.who || {}).functions || []).filter(function (f) { return f !== 'Webadmin' && f !== 'Verwaltung'; });
    var agt = d.agt ? agtState() : null, g26 = d.agt && d.agt.g26_until && d.agt.g26_until >= today();
    var agtTxt = !d.agt ? '' : agtReady(agt) ? '✓ bereit' : 'nicht bereit';
    var c = function (label, big, sub, tab) { return '<button type="button" class="ffl-card"' + (tab ? ' data-tab="' + tab + '"' : ' disabled') + '><span class="ffl-cl">' + label + '</span><span class="ffl-big ffl-big-sm">' + big + '</span>' + (sub ? esc(sub) : '') + '</button>'; };
    return '<div class="ffl-cards ffl-profcards ffl-pstats">' +
      c('Einsätze ' + year, String(cnt('einsatz')), cnt('uebung') + (cnt('uebung') === 1 ? ' Übung' : ' Übungen'), 'incidents') +
      c('Ausbildung', String(myTraining().length), 'Lehrgänge', 'courses') +
      (d.agt ? c('Atemschutz', agtTxt, d.agt.g26_until ? (g26 ? 'G26 bis ' + fmtDate(d.agt.g26_until) : 'G26 abgelaufen – nicht tauglich') : 'G26 fehlt', 'agt') : '') + '</div>';
  }
  // Profil wie in einer App: oben die Karte mit allem Wichtigen, darunter Bereiche zum Öffnen (statt einer langen Formularseite)
  // Breiter Bildschirm (Tablet quer, Desktop): alle Bereiche aufgeklappt statt einzeln öffnen
  function profWide() { return window.matchMedia && window.matchMedia('(min-width: 900px)').matches; }
  function vProfile() {
    var sec = st.psec, P = d.personal || {}, wide = profWide();
    if (sec && PSEC[sec] && !wide) return '<div class="ffl-psub"><button type="button" class="ffl-back" data-act="psec" data-v="">' + ICONS.back + '<span>Profil</span></button><h3>' + esc(PSEC[sec]) + '</h3></div>' + profileParts()[sec] + (['data', 'skills', 'sizes'].indexOf(sec) >= 0 ? profBar() : '');
    var w = d.who || { name: d.member.name }, nm = String(w.name || '').split(',');
    var ini = (((nm[1] || '').trim().charAt(0)) + nm[0].trim().charAt(0)).toUpperCase();
    var fns = (w.functions || []).filter(function (f) { return f !== 'Webadmin' && f !== 'Verwaltung'; });
    var filled = Object.keys(d.size_keys || {}).filter(function (k) { return d.sizes[k]; }).length, nSizes = Object.keys(d.size_keys || {}).length;
    var nAddr = [P.birth_date, P.birth_place, P.street].filter(Boolean).length;
    var day = (d.daytime_opts || {})[d.day_available];
    var nTr = (d.traits || []).filter(function (t) { return t.cat !== 'funktion'; }).length;
    var pref = MYFUI.themePref ? MYFUI.themePref() : '';
    function row(k, title, sub, warn) {
      return '<button type="button" class="ffl-prow" data-act="psec" data-v="' + k + '"><span><b>' + esc(title) + '</b><small' + (warn ? ' class="is-warn"' : '') + '>' + esc(sub) + '</small></span>' + ICONS.chev + '</button>';
    }
    var h = '<div class="ffl-phero"><span class="ffl-pava" aria-hidden="true">' + esc(ini || '?') + '</span><div class="ffl-phtx"><b>' + esc(((nm[1] || '').trim() + ' ' + nm[0].trim()).trim()) + '</b>' +
      '<small>' + esc([P.rank, P.unit_name].filter(Boolean).join(' · ')) + '</small>' +
      ((P.rank_since || P.joined) ? '<small class="ffl-mu">' + esc([P.rank_since ? (P.rank || 'Dienstgrad') + ' seit ' + fmtDate(P.rank_since) : '', P.joined ? 'dabei seit ' + fmtDate(P.joined) : ''].filter(Boolean).join(' · ')) + '</small>' : '') +
      (fns.length ? '<div class="ffl-chips">' + fns.map(function (f) { return '<span class="ffl-chip st-fn">' + esc(f) + '</span>'; }).join('') + '</div>' : '') + '</div></div>';
    h += profileOverview();
    var acc = '<div class="ffl-plist"><div class="ffl-prow is-static"><span><b>Darstellung</b><small>Gilt für dieses Gerät</small></span><div class="ffl-seg ffl-themeseg" role="group" aria-label="Darstellung">' +
      [['', 'Auto'], ['light', 'Hell'], ['dark', 'Dunkel']].map(function (o) { return '<button type="button" data-act="ptheme" data-v="' + o[0] + '" aria-pressed="' + (pref === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div></div>' +
      passkeyRows() + twofaRows() +
      '<a class="ffl-prow" href="' + esc(MYF.account) + '"><span><b>Passwort ändern</b><small>Über die Anmeldeseite</small></span>' + ICONS.chev + '</a>' +
      '<a class="ffl-prow is-danger" href="' + esc(MYF.logout) + '"><span><b>Abmelden</b><small>Nur auf fremden Geräten nötig – sonst bleibst du bis zu 180 Tage angemeldet</small></span>' + ICONS.chev + '</a></div>';
    if (wide) {
      var parts = profileParts(), card = function (k, title, sub, warn) {
        return '<section class="ffl-pcard" id="myf-p-' + k + '"><div class="ffl-sh">' + esc(title) + (sub ? '<em' + (warn ? ' class="is-warn"' : '') + '>' + esc(sub) + '</em>' : '') + '</div>' + parts[k] + '</section>';
      };
      h += '<nav class="ffl-pjump" aria-label="Bereiche">' + [['data', 'Angaben'], ['skills', 'Fähigkeiten'], ['sizes', 'Spind & Größen'], ['training', 'Ausbildung']].concat((d.briefings || []).length ? [['brief', 'Unterweisungen']] : []).concat([['konto', 'Konto']])
        .map(function (x) { return '<a href="#myf-p-' + x[0] + '">' + x[1] + '</a>'; }).join('') + '</nav>';
      return h + '<div class="ffl-pgrid">' +
        card('data', 'Meine Angaben', nAddr === 3 ? 'vollständig' : 'für Bescheinigungen fehlt noch etwas', nAddr < 3) +
        card('skills', 'Funktion & Fähigkeiten', '') +
        card('sizes', 'Spind & Größen', lockerSummary() + ' · ' + (filled ? filled + ' von ' + nSizes + ' Größen' : 'noch keine Größen'), !filled) +
        (d.loops_all ? card('loops', 'Alarmschleifen', (d.loops_mine || []).length ? (d.loops_mine.length === 1 ? '1 Schleife' : d.loops_mine.length + ' Schleifen') : 'keine Schleife', !(d.loops_mine || []).length) : '') +
        card('training', 'Meine Ausbildung', '') +
        ((d.briefings || []).length ? card('brief', 'Meine Unterweisungen', '') : '') +
        '<section class="ffl-pcard" id="myf-p-konto"><div class="ffl-sh">Darstellung & Konto</div>' + acc + '</section></div>' + profBar();
    }
    h += '<div class="ffl-plist">' +
      row('data', 'Meine Angaben', nAddr === 3 ? 'Name, Anschrift, Handy – vollständig' : 'Für Bescheinigungen fehlt noch etwas', nAddr < 3) +
      row('skills', 'Funktion & Fähigkeiten', [day ? 'tagsüber: ' + day : '', nTr ? nTr + (nTr === 1 ? ' Merkmal' : ' Merkmale') : 'Führerscheine, Beruf …'].filter(Boolean).join(' · ')) +
      row('sizes', 'Spind & Größen', lockerSummary() + ' · ' + (filled ? filled + ' von ' + nSizes + ' Größen' : 'Größen fehlen noch'), !filled) +
      (d.loops_all ? row('loops', 'Alarmschleifen', loopSummary() + (d.loop_request && d.loop_request.status === 'open' ? ' · Anfrage offen' : ''), !(d.loops_mine || []).length) : '') +
      ((d.briefings || []).length ? row('brief', 'Meine Unterweisungen', (function () { var o = d.briefings.filter(function (b) { return !b.ack; }).length; return o ? o + ' noch zu bestätigen' : 'alle bestätigt ✓'; })(), d.briefings.some(function (b) { return !b.ack; })) : '') +
      row('training', 'Meine Ausbildung', myTraining().length + (myTraining().length === 1 ? ' Lehrgang' : ' Lehrgänge') + ' · nachtragen lassen') + '</div>';
    return h + acc;
  }
  // Ein Speichern für das ganze Profil (Angaben, Fähigkeiten, Größen): erscheint, sobald sich etwas ändert, und speichert alles zusammen
  function profBar() {
    var n = Object.keys(st.pdirty || {}).length;
    return '<div class="ffl-savebar" id="myf-pbar"' + (n ? '' : ' hidden') + '><span>Ungespeicherte Änderungen</span><button type="button" class="ffl-q" data-act="pdiscard">Verwerfen</button><button type="button" class="ffl-p" data-act="profsave">Speichern</button></div>';
  }
  var PFORMS = ['myf-nameform', 'myf-traitform', 'myf-sform'];
  function profSave() {
    var dirty = st.pdirty || {}, jobs = [];
    if (dirty['myf-nameform'] && document.getElementById('myf-nameform')) jobs.push(function () { return api('POST', 'me/name', { last: val('myf-last'), first: val('myf-first'), birth_date: val('myf-bdate'), birth_place: val('myf-bplace'), street: val('myf-street'), phone: val('myf-phone') }); });
    if (dirty['myf-traitform'] && document.getElementById('myf-traitform')) {
      var ids = [].map.call(root.querySelectorAll('[data-mytrait]:checked'), function (c) { return +c.getAttribute('data-mytrait'); }), emp = val('myf-emp'), day = +val('myf-day');
      jobs.push(function () { return api('POST', 'me/traits', { trait_ids: ids, employment: emp, day_available: day }); });
    }
    var sf = document.getElementById('myf-sform');
    if (dirty['myf-sform'] && sf) {
      var sizes = {}; [].forEach.call(sf.querySelectorAll('[data-size]'), function (x) { sizes[x.getAttribute('data-size')] = x.value.trim(); });
      jobs.push(function () { return api('POST', 'me/sizes', { sizes: sizes }); });
    }
    if (!jobs.length) { st.pdirty = {}; return render(); }
    return jobs.reduce(function (p, j) { return p.then(j); }, Promise.resolve()).then(function () { st.pdirty = {}; return reload(); })
      .then(function () { note('ok', 'Gespeichert.'); }, function (err) { note('err', err.message); });
  }
  var PSEC = { data: 'Meine Angaben', skills: 'Funktion & Fähigkeiten', sizes: 'Spind & Größen', loops: 'Alarmschleifen', training: 'Meine Ausbildung', brief: 'Meine Unterweisungen' };
  // Mein Spind (die Klamotten liegen ja darin): Nummer, Ort, Schlüssel-Stand, seit wann – stimmt etwas nicht, direkt der Kleiderkammer Bescheid geben
  function lockerSummary() {
    var lk = d.my_locker || [];
    if (!lk.length) return 'kein Spind zugeteilt';
    return lk.map(function (l) { return 'Spind ' + l.nr; }).join(', ') + ' · ' + ((d.locker_keys || {})[lk[0].key] || '');
  }
  function lockerHtml() {
    var lk = d.my_locker || [], K = { none: 'st-warn', issued: 'st-ok', box: 'st-open', nolock: 'st-no', lost: 'st-bad' };
    var h = '<div class="ffl-mylocker">';
    if (!lk.length) h += '<div class="ffl-row" style="gap:10px;flex-wrap:wrap"><b>Mein Spind</b><span class="ffl-mu">noch keiner zugeteilt – die Kleiderkammer vergibt die Spinde</span></div>';
    else h += lk.map(function (l) {
      return '<div class="ffl-row" style="gap:10px;flex-wrap:wrap;align-items:baseline"><b>Spind Nr. ' + esc(l.nr) + (l.location ? ' <span class="ffl-mu" style="font-weight:500">' + esc(l.location) + '</span>' : '') + '</b>' +
        '<span class="ffl-chip ' + (K[l.key] || 'st-open') + '">' + esc((d.locker_keys || {})[l.key] || l.key) + (l.key === 'issued' && l.keys > 1 ? ' (' + l.keys + ')' : '') + '</span>' +
        (l.since ? '<span class="ffl-mu">seit ' + fmtDate(l.since) + '</span>' : '') + '</div>' +
        (l.note ? '<p class="ffl-mu" style="margin:4px 0 0">' + esc(l.note) + '</p>' : '') +
        (l.key === 'none' ? '<p class="ffl-mu" style="margin:6px 0 0">Noch keinen Schlüssel bekommen? Kurz der Kleiderkammer Bescheid geben – sie trägt die Ausgabe ein.</p>' : l.key === 'lost' ? '<p class="ffl-mu" style="margin:6px 0 0">Schlüssel als verloren vermerkt – bitte bei der Kleiderkammer melden, sobald er wieder da ist.</p>' : '');
    }).join('');
    return h + fbBtn('clothing', lk.length ? 'Spind ' + lk.map(function (l) { return l.nr; }).join(', ') : 'Spind') + (st.fb && st.fb.area === 'clothing' ? feedbackBox() : '') + '</div>';
  }
  // Unterweisung ansehen und bestätigen (oben auf der Startseite bzw. im Profil)
  function briefBox() {
    var b = (d.briefings || []).filter(function (x) { return x.id === st.briefOpen; })[0]; if (!b) return '';
    return '<div class="ffl-fbbox ffl-briefbox"><b>Unterweisung: ' + esc(b.title) + '</b>' + (b.text ? '<p style="white-space:pre-line;margin:6px 0 8px">' + esc(b.text) + '</p>' : '') +
      (b.link ? '<p style="margin:0 0 10px"><a class="ffl-btn ffl-sm" href="' + esc(b.link) + '" target="_blank" rel="noopener">Unterlage öffnen</a></p>' : '') +
      (b.ack ? '<div class="ffl-msg ok">Bestätigt am ' + fmtDT(b.ack.at) + (b.ack.method !== 'app' ? ' (per Unterschriftenliste)' : '') + '.</div><button type="button" class="ffl-sm" data-act="brief" data-id="0">Schließen</button>'
        : '<label class="ffl-check"><input type="checkbox" id="myf-briefok"> Ich habe an der Unterweisung teilgenommen bzw. die Inhalte gelesen und verstanden.</label>' +
          '<div class="ffl-row" style="margin-top:10px"><button type="button" class="ffl-p" data-act="briefack" data-id="' + b.id + '">Bestätigen</button><button type="button" data-act="brief" data-id="0">Später</button></div>') + '</div>';
  }
  function profileParts() {
    var h = '', out = {};
    out.brief = briefBox() + '<div class="ffl-plist">' + (d.briefings || []).map(function (b) {
      return '<button type="button" class="ffl-prow" data-act="brief" data-id="' + b.id + '"><span><b>' + esc(b.title) + ' ' + b.year + '</b><small' + (b.ack ? '' : ' class="is-warn"') + '>' +
        (b.ack ? 'bestätigt am ' + fmtDate(b.ack.at.slice(0, 10)) : 'noch zu bestätigen' + (b.due ? (b.due < today() ? ' – überfällig seit ' : ' – bis ') + fmtDate(b.due) : '')) + '</small></span>' + ICONS.chev + '</button>';
    }).join('') + '</div>';
    out.training = trainingHtml().replace('<div class="ffl-sh">Meine Ausbildung', '<div class="ffl-sh ffl-sh-sub">Lehrgänge');
    var nm = d.member.name.split(',');
    h = '<div class="ffl-sec"><form id="myf-nameform" class="ffl-form2">' +
      '<div><label class="ffl-fl" for="myf-first">Vorname</label><input type="text" id="myf-first" value="' + esc((nm[1] || '').trim()) + '" autocomplete="given-name" autocapitalize="words" enterkeyhint="next"></div>' +
      '<div><label class="ffl-fl" for="myf-last">Nachname</label><input type="text" id="myf-last" value="' + esc(nm[0].trim()) + '" autocomplete="family-name" autocapitalize="words" enterkeyhint="next"></div>' +
      '<div><label class="ffl-fl" for="myf-bdate">Geburtsdatum</label><input type="date" id="myf-bdate" value="' + esc(d.personal.birth_date || '') + '"></div>' +
      '<div><label class="ffl-fl" for="myf-bplace">Geburtsort</label><input type="text" id="myf-bplace" value="' + esc(d.personal.birth_place) + '" autocapitalize="words" enterkeyhint="next"></div>' +
      '<div><label class="ffl-fl" for="myf-street">Straße, Hausnummer</label><input type="text" id="myf-street" value="' + esc(d.personal.street) + '" autocomplete="street-address" autocapitalize="words" enterkeyhint="next" placeholder="z. B. Hauptstr. 1"></div>' +
      '<div><label class="ffl-fl" for="myf-phone">Handy (optional)</label><input type="tel" id="myf-phone" value="' + esc(d.personal.phone) + '" autocomplete="tel" inputmode="tel" enterkeyhint="done" placeholder="z. B. 0171 1234567"></div>' +
      '</form><p class="ffl-mu">Geburtsdatum, -ort und Anschrift brauchen wir nur für die Bescheinigung an deinen Arbeitgeber (anderer Wohnort: Anschrift mit PLZ und Ort). Sehen kann sie nur die Einsatzführung und die Verwaltung.' + (d.review_years ? ' Einsatzberichte mit persönlichen Angaben legt SPIND nach ' + d.review_years + ' Jahren der Einsatzführung zur Prüfung vor – weiter aufbewahren oder Personenangaben schwärzen; nichts wird stillschweigend gelöscht.' : '') + '</p></div>';
    out.data = h;
    // Merkmale & Fähigkeiten: selbst aktuell halten. Funktionen (und alles, woran Rechte hängen) setzt die Verwaltung.
    var mine = {}; (d.traits || []).forEach(function (t) { mine[t.id] = 1; });
    var fnList = (d.traits || []).filter(function (t) { return t.cat === 'funktion'; });
    var selfIds = {}; (d.self_traits || []).forEach(function (t) { selfIds[t.id] = 1; });
    var fixed = (d.traits || []).filter(function (t) { return t.cat !== 'funktion' && !selfIds[t.id]; });
    h = '<div class="ffl-sec">' +
      '<div class="ffl-fl">Funktionen <span class="ffl-mu" style="font-weight:400">– trägt die Wehrführung ein</span></div><div class="ffl-chips">' +
      (fnList.length ? fnList.map(function (t) { return '<span class="ffl-chip st-fn">' + esc(t.name) + '</span>'; }).join('') : '<span class="ffl-mu">keine</span>') +
      fixed.map(function (t) { return '<span class="ffl-chip st-open" title="hängt an Rechten – ändert die Verwaltung">' + esc(t.name) + '</span>'; }).join('') + '</div>' +
      '<form id="myf-traitform"><div class="ffl-form2" style="margin-top:12px"><div><label class="ffl-fl" for="myf-day">Tagsüber erreichbar (Tagesalarm)</label><select id="myf-day">' +
      Object.keys(d.daytime_opts || {}).map(function (k) { return '<option value="' + k + '"' + (+k === +d.day_available ? ' selected' : '') + '>' + esc(d.daytime_opts[k]) + '</option>'; }).join('') + '</select></div>' +
      '<div><label class="ffl-fl" for="myf-emp">Hauptberuflich bei Feuerwehr/RD?</label><select id="myf-emp">' +
      Object.keys(d.employment_opts || {}).map(function (k) { return '<option value="' + k + '"' + (k === d.employment_key ? ' selected' : '') + '>' + esc(d.employment_opts[k]) + '</option>'; }).join('') + '</select></div></div>' +
      Object.keys(d.trait_cats).filter(function (c) { return c !== 'funktion'; }).map(function (cat) {
        var list = (d.self_traits || []).filter(function (t) { return t.cat === cat; }), open = cat === 'fach' || cat === 'sonst';
        return list.length || open ? '<div class="ffl-fl">' + esc(d.trait_cats[cat]) + '</div><div class="ffl-chips">' + list.map(function (t) {
          return '<label class="ffl-toggle-chip"><input type="checkbox" data-mytrait="' + t.id + '"' + (mine[t.id] ? ' checked' : '') + '>' + esc(t.name) + '</label>';
        }).join('') + '</div>' + (open ? '<div class="ffl-addtrait"><input type="text" id="myf-addtr-' + cat + '" maxlength="60" autocapitalize="words" enterkeyhint="done" placeholder="' + (cat === 'fach' ? 'Fehlt dein Beruf? z. B. Mechatroniker' : 'Fehlt etwas? z. B. Motorsägenschein') + '">' +
          '<button type="button" class="ffl-sm" data-act="addtrait" data-v="' + cat + '">Hinzufügen</button></div>' : '') : '';
      }).join('') +
      '<p class="ffl-mu" style="margin-top:10px">Hilft bei der Planung (z. B. wer tagsüber kann, wer welchen Führerschein hat). Sehen kann das nur die Verwaltung.</p>' +
      '</form></div>';
    out.skills = h;
    var hSizes = '<div class="ffl-sec">' + lockerHtml() + '<div class="ffl-fl" style="margin-top:14px">Meine Größen</div><p class="ffl-mu" style="margin-top:4px">Hilft der Kleiderkammer beim Bestellen – und beim Melden ist die Größe dann schon eingetragen.</p><form id="myf-sform"><div class="ffl-sizes">' +
      Object.keys(d.size_keys).map(function (k) {
        return '<div><label class="ffl-fl" for="myf-sz-' + k + '">' + esc(d.size_keys[k]) + '</label><input type="text" id="myf-sz-' + k + '" data-size="' + k + '" value="' + esc(d.sizes[k] || '') + '" autocapitalize="characters" enterkeyhint="next"></div>';
      }).join('') + '</div></form></div>';
    out.sizes = hSizes;
    if (d.loops_all) out.loops = loopsHtml();
    return out;
  }
  // Alarmschleifen: welche habe ich, Änderung beim IT-Team anfragen (das Team entscheidet und trägt ein)
  function loopSummary() { var n = (d.loops_mine || []).length; return n ? n + (n === 1 ? ' Schleife' : ' Schleifen') + ': ' + loopNames(d.loops_mine).join(', ') : 'keine Schleife'; }
  function loopNames(ids) { var by = {}; (d.loops_all || []).forEach(function (l) { by[l.id] = l.name; }); return (ids || []).map(function (i) { return by[i]; }).filter(Boolean); }
  function loopsHtml() {
    var mine = d.loops_mine || [], r = d.loop_request, all = d.loops_all || [];
    var h = '<div class="ffl-sec"><p class="ffl-mu" style="margin-top:0">Bei diesen Alarmierungen wirst du mitalarmiert. Gepflegt wird die Liste vom IT-Team.</p>' +
      (mine.length ? '<div class="ffl-chips">' + loopNames(mine).map(function (n) { return '<span class="ffl-chip st-fn">' + esc(n) + '</span>'; }).join('') + '</div>' : '<p><b>Du bist zurzeit in keiner Schleife.</b></p>');
    if (r && r.status === 'open') {
      h += '<div class="ffl-msg" style="margin-top:12px"><b>Deine Anfrage liegt beim IT-Team</b> (' + dt(r.created) + ')' +
        (r.add.length ? '<div>dazu: ' + esc(loopNames(r.add).join(', ')) + '</div>' : '') + (r.remove.length ? '<div>raus: ' + esc(loopNames(r.remove).join(', ')) + '</div>' : '') +
        (r.note ? '<div class="ffl-mu">„' + esc(r.note) + '“</div>' : '') + '<div class="ffl-row" style="margin-top:8px"><button type="button" class="ffl-sm" data-act="lpreq">Anfrage ändern</button><button type="button" class="ffl-q ffl-sm" data-act="lpwithdraw">Zurückziehen</button></div></div>';
    } else if (r && (r.status === 'done' || r.status === 'declined')) {
      h += '<div class="ffl-msg ' + (r.status === 'done' ? 'ok' : 'warn') + '" style="margin-top:12px">' + (r.status === 'done' ? 'Deine Anfrage wurde eingetragen.' : 'Deine Anfrage wurde abgelehnt.') + (r.answer ? ' „' + esc(r.answer) + '“' : '') + '</div>';
    }
    if (st.lpForm) {
      var want = st.lpWant || mine.slice();
      h += '<div class="ffl-pbox" style="margin-top:12px"><div class="ffl-fl">In welchen Schleifen möchtest du sein?</div><div class="ffl-lpw">' + all.map(function (l) {
        var on = want.indexOf(l.id) >= 0, was = mine.indexOf(l.id) >= 0;
        return '<label class="ffl-check"><input type="checkbox" data-lpw="' + l.id + '"' + (on ? ' checked' : '') + '> ' + esc(l.name) + (l.note ? ' <span class="ffl-mu">– ' + esc(l.note) + '</span>' : '') +
          (on !== was ? ' <span class="ffl-chip ' + (on ? 'st-ok">dazu' : 'st-bad">raus') + '</span>' : '') + '</label>';
      }).join('') + '</div><label class="ffl-fl" for="myf-lpnote" style="margin-top:10px">Bemerkung (optional)</label><textarea id="myf-lpnote" rows="2" maxlength="500" placeholder="z. B. Ab Januar Schichtdienst – bitte aus der Tagschleife nehmen">' + esc(st.lpNote || '') + '</textarea>' +
        '<div class="ffl-row" style="margin-top:10px"><button type="button" class="ffl-p" data-act="lpsend"' + (navigator.onLine ? '' : ' disabled') + '>Anfrage senden</button><button type="button" class="ffl-q" data-act="lpcancel">Abbrechen</button></div></div>';
    } else if (!(r && r.status === 'open')) h += '<div class="ffl-row" style="margin-top:12px"><button type="button" class="ffl-sm" data-act="lpreq">Änderung anfragen</button></div>';
    return h + '</div>';
  }

  // ---- Ereignisse ------------------------------------------------------------
  function val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }

  root.addEventListener('click', function (e) {
    var go = e.target.closest('[data-go]');
    if (go) { e.preventDefault(); st.tab = go.getAttribute('data-go'); save('tab', st.tab); st.msg = null; render(); return window.scrollTo(0, root.offsetTop - 20); }
    var tb = e.target.closest('[data-tab]');
    if (tb) { st.tab = tb.getAttribute('data-tab'); save('tab', st.tab); st.msg = null; st.more = false; st.inc = null; st.report = null; st.psec = null; render(); return window.scrollTo(0, Math.max(0, root.getBoundingClientRect().top + window.pageYOffset - 20)); }
    var t = e.target.closest('[data-act]'); if (!t) return;
    var act = t.getAttribute('data-act'), id = +t.getAttribute('data-id'), v = t.getAttribute('data-v');
    if (incidentClick(act, t, id)) return;
    if (act === 'fullscreen') { setFull(!st.full); return; }
    if (act === 'brief') { st.briefOpen = id || null; render(); if (id) { var bx = document.querySelector('.ffl-briefbox'); if (bx) bx.scrollIntoView({ block: 'center', behavior: 'smooth' }); } return; }
    if (act === 'briefack') {
      if (!document.getElementById('myf-briefok').checked) return note('err', 'Bitte erst das Häkchen setzen.');
      return api('POST', 'me/briefing', { id: id, confirm: 1 }).then(function () { st.briefOpen = null; return reload(); }).then(function () { note('ok', 'Danke – Unterweisung bestätigt.'); }, function (err) { note('err', err.message); });
    }
    if (act === 'addtrait') {
      var nt = val('myf-addtr-' + v); if (!nt) return note('err', 'Bitte erst eintragen, was fehlt.');
      return api('POST', 'me/traits', { add: nt, add_cat: v }).then(function () { return reload(); }).then(function () { note('ok', '„' + nt + '“ ist ergänzt und bei dir angehakt.'); }, function (err) { note('err', err.message); });
    }
    if (act === 'profsave') return profSave();
    if (act === 'pdiscard') { st.pdirty = {}; return render(); }
    if (act === 'psec') { st.psec = v || null; st.msg = null; render(); return window.scrollTo(0, Math.max(0, root.getBoundingClientRect().top + window.pageYOffset - 20)); }
    if (act === 'ptheme') { MYFUI.setTheme(v); return render(); }
    if (act === 'lpreq') { var orq = d.loop_request && d.loop_request.status === 'open' ? d.loop_request : null; st.lpForm = true; st.lpNote = orq ? orq.note : '';
      st.lpWant = (d.loops_mine || []).filter(function (x) { return !orq || orq.remove.indexOf(x) < 0; }).concat(orq ? orq.add : []); return render(); }
    if (act === 'lpcancel') { st.lpForm = false; st.lpWant = null; return render(); }
    if (act === 'lpsend') {
      var want = st.lpWant || [], mine = d.loops_mine || [];
      var body = { add: want.filter(function (x) { return mine.indexOf(x) < 0; }), remove: mine.filter(function (x) { return want.indexOf(x) < 0; }), note: (document.getElementById('myf-lpnote') || {}).value || '' };
      return api('POST', 'me/loops/request', body).then(function () { st.lpForm = false; st.lpWant = null; st.lpNote = ''; st.msg = { type: 'ok', text: 'Anfrage gesendet – das IT-Team meldet sich.' }; return reload(); }, function (e) { alert(e.message); });
    }
    if (act === 'lpwithdraw') { if (!confirm('Anfrage zurückziehen?')) return; return api('POST', 'me/loops/request', { withdraw: true }).then(reload, function (e) { alert(e.message); }); }
    // Tag im Belegungsraster angetippt: Fahrzeug und Zeitraum ins Formular (8–18 Uhr als Vorschlag), zum Formular scrollen
    if (act === 'bkday') {
      var vsel = document.getElementById('myf-bveh'), bs = document.getElementById('myf-bstart'), be = document.getElementById('myf-bend');
      if (!vsel) return;
      vsel.value = String(id); bs.value = v + 'T08:00'; be.value = v + 'T18:00'; st.bookVeh = id;
      vsel.closest('.ffl-sec').scrollIntoView({ behavior: 'smooth', block: 'start' }); document.getElementById('myf-bpurp').focus(); return;
    }
    if (act === 'pkadd') {
      // Kein Dialog vorher: der Browser fragt nur nach Face ID / Fingerabdruck / PIN, der Name ist das Gerät (später im Konto änderbar)
      t.disabled = true;
      return MYFPasskey.register(MYF.api, MYF.nonce, MYFPasskey.deviceName()).then(function () { save('pktip', '1'); st.msg = { type: 'ok', text: 'Passkey eingerichtet. Beim nächsten Anmelden einfach „Mit Passkey anmelden“ tippen – oder den Vorschlag im Namensfeld.' }; return reload(); })
        .catch(function (e) { t.disabled = false; st.msg = { type: 'err', text: e.message }; render(); });
    }
    if (act === 'pktipoff') { save('pktip', '1'); return render(); }
    if (act === 'pkdel') { if (!confirm('Diesen Passkey entfernen? Anmelden geht dann nur noch mit Passwort (oder einem anderen Passkey).')) return; return api('POST', 'me/passkey', { do: 'delete', id: id }).then(reload); }
    if (act === 'myprofile') { st.tab = 'profile'; st.psec = null; save('tab', 'profile'); render(); return window.scrollTo(0, root.offsetTop - 20); }
    if (act === 'inbox') { st.tab = 'inbox'; render(); var nn = (d.notifications || []).filter(function (n) { return !n.read; }).map(function (n) { return n.id; }); return; }
    if (act === 'openadmin') { if (window.MYFAdminOpen) window.MYFAdminOpen(v || ''); return; }
    if (act === 'dutyopen') { st.dutyOpen = id; render(); return; }
    if (act === 'dutyclose') { if (t.classList.contains('ffl-modal') && e.target !== t) return; st.dutyOpen = null; render(); return; }
    if (act === 'duty') return api('POST', 'me/duty', { slot_id: id, on: v === '1' }).then(reload).then(function () { note('ok', v === '1' ? 'Eingetragen – danke!' : 'Ausgetragen.'); }, function (err) { note('err', err.message); });
    if (act === 'rsvp') {
      var pe = document.getElementById('myf-rp-' + id);
      return api('POST', 'me/rsvp', { board_id: id, answer: v, persons: pe ? +pe.value || 1 : 1 }).then(reload).then(function () { note('ok', v === 'yes' ? 'Zugesagt.' : 'Abgesagt.'); }, function (err) { note('err', err.message); });
    }
    if (act === 'bksend') {
      return api('POST', 'me/booking', { vehicle_id: +val('myf-bveh'), start: val('myf-bstart'), end: val('myf-bend'), purpose: val('myf-bpurp'), persons: +val('myf-bpers') || 1, driver: val('myf-bdrv') })
        .then(reload).then(function () { note('ok', 'Anfrage gesendet.'); }, function (err) { note('err', err.message); });
    }
    if (act === 'oform') { st.orForm = v || null; return render(); }
    if (act === 'onew') return api('POST', 'me/order/round', { title: document.getElementById('myf-on-t').value, deadline: document.getElementById('myf-on-d').value, menu_id: +document.getElementById('myf-on-m').value || 0, free: document.getElementById('myf-on-f').checked, once_name: document.getElementById('myf-on-n').value, once_items: document.getElementById('myf-on-i').value, propose: document.getElementById('myf-on-p').checked }).then(function () { st.orForm = null; return reload(); }).catch(function (err) { note('err', err.message); });
    if (act === 'ocsave') return api('POST', 'me/order/menu', { name: document.getElementById('myf-oc-n').value, phone: document.getElementById('myf-oc-p').value, items: document.getElementById('myf-oc-i').value }).then(function () { st.orForm = null; return reload(); }).then(function () { note('ok', 'Vorgeschlagen – die LZ-Leitung bekommt Bescheid.'); }).catch(function (err) { note('err', err.message); });
    if (act === 'omwd') return api('POST', 'me/order/menu', { withdraw: id }).then(reload).catch(function (err) { note('err', err.message); });
    if (act === 'ompaid') return api('POST', 'me/order/manage', { id: id, do: 'paid', paid: v === '1', ids: t.getAttribute('data-ids').split(',').map(Number) }).then(reload).catch(function (err) { note('err', err.message); });
    if (act === 'omrd') { if (v === 'delete' && !confirm('Diese Liste mit allen Namen und Bestellungen endgültig löschen?')) return; return api('POST', 'me/order/manage', { id: id, do: v }).then(reload).catch(function (err) { note('err', err.message); }); }
    if (act === 'omro') return MYFUI.ask({ title: 'Wieder öffnen', text: 'Neuer Bestellschluss, z. B. ' + today() + ' 19:00', value: today() + ' 19:00', ok: 'Öffnen' }).then(function (n) { if (!n) return; return api('POST', 'me/order/manage', { id: id, do: 'reopen', deadline: n }).then(reload); }).catch(function (err) { note('err', err.message); });
    if (act === 'cdprint') return MYFCD.print(d.cd);
    if (act === 'omprint') return MYFPrint.printNow(orderPrint((d.orders || []).filter(function (x) { return x.id === id; })[0]));
    if (act === 'omlate') { var oKey = document.getElementById('myf-ol-k' + id); return api('POST', 'me/order/manage', { id: id, do: 'add', member_id: +document.getElementById('myf-ol-m' + id).value, item: oKey ? oKey.value : '', name: document.getElementById('myf-ol-n' + id).value, price: document.getElementById('myf-ol-p' + id).value, qty: +document.getElementById('myf-ol-q' + id).value }).then(reload).catch(function (err) { note('err', err.message); }); }
    if (act === 'omadd') return api('POST', 'me/order', { round_id: id, item: v }).then(reload).catch(function (err) { note('err', err.message); });
    if (act === 'omqty') return api('POST', 'me/order', { id: id, qty: +v }).then(reload).catch(function (err) { note('err', err.message); });
    if (act === 'omnote') return MYFUI.ask({ title: 'Notiz', text: 'z. B. ohne Zwiebeln', value: ((d.orders || []).reduce(function (a, r) { return a.concat(r.mine); }, []).filter(function (x) { return x.id === id; })[0] || {}).note || '', ok: 'Speichern' }).then(function (n) { if (n === null || n === undefined) return; return api('POST', 'me/order', { id: id, note: n }).then(reload); }).catch(function (err) { note('err', err.message); });
    if (act === 'omfree') return api('POST', 'me/order', { round_id: id, name: document.getElementById('myf-of-n' + id).value, price: document.getElementById('myf-of-p' + id).value, qty: +document.getElementById('myf-of-q' + id).value }).then(reload).catch(function (err) { note('err', err.message); });
    if (act === 'bkhide') return api('POST', 'me/booking', { hide: [id] }).then(reload).catch(function (err) { note('err', err.message); });
    if (act === 'bkhideall') { var nowL = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16); return api('POST', 'me/booking', { hide: (d.my_bookings || []).filter(function (b) { return b.status === 'declined' || b.status === 'cancelled' || b.end.slice(0, 16) < nowL; }).map(function (b) { return b.id; }) }).then(reload).catch(function (err) { note('err', err.message); }); }
    if (act === 'bkunhide') return api('POST', 'me/booking', { unhide_all: 1 }).then(reload).catch(function (err) { note('err', err.message); });
    if (act === 'bkcancel') { if (!confirm('Anfrage stornieren?')) return; return api('POST', 'me/booking', { cancel: id }).then(reload).catch(function (err) { note('err', err.message); }); }
    if (act === 'devused') return api('POST', 'me/device/used', { id: id }).then(reload).then(function () { note('ok', 'Gemeldet – die ' + (d.device && d.device.area !== 'agt' ? 'Werkstatt' : 'Atemschutzwerkstatt') + ' kümmert sich.'); }, function (err) { note('err', err.message); });
    // nur die Nachrichten dieses Postfachs (Verwaltungs-Nachrichten bleiben ungelesen in der Verwaltung)
    if (act === 'nread') { var nids = (d.notifications || []).filter(function (n) { return !n.read; }).map(function (n) { return n.id; }); return nids.length ? api('POST', 'me/notifications', { action: 'read', ids: nids }).then(reload) : undefined; }
    if (act === 'narch') return api('POST', 'me/notifications', { action: 'archive', ids: [id] }).then(reload);
    if (act === 'nread1') return api('POST', 'me/notifications', { action: 'read', ids: [id] }).then(reload);
    if (act === 'nunread') return api('POST', 'me/notifications', { action: 'unread', ids: [id] }).then(reload);
    if (act === 'ndel') return api('POST', 'me/notifications', { action: 'delete', ids: [id] }).then(reload);
    if (act === 'ndelall') { var dids = (d.notifications || []).filter(function (n) { return n.read; }).map(function (n) { return n.id; }); return dids.length && confirm('Alle erledigten Benachrichtigungen endgültig löschen?') ? api('POST', 'me/notifications', { action: 'delete', ids: dids }).then(reload) : undefined; }
    if (act === 'drall') { st.drAll = true; return render(); }
    if (act === 'hometip') { save('hometip', '1'); return render(); }
    if (act === 'drabs') {
      return (v === '1' ? MYFUI.ask({ title: 'Abmelden', text: 'Kurz der Grund (optional, z. B. Schicht, Urlaub):', ok: 'Abmelden' }) : Promise.resolve('')).then(function (why) {
        if (why === null) return;
        return api('POST', 'me/drill/absence', { id: id, cal_uid: t.getAttribute('data-uid') || '', absent: v === '1', reason: why }).then(reload).then(function () { note('ok', v === '1' ? 'Abgemeldet – danke für die Info.' : 'Wieder angemeldet.'); }, function (err) { note('err', err.message); });
      });
    }
    if (act === 'bkok' || act === 'bkno') {
      return (act === 'bkno' ? MYFUI.ask({ title: 'Anfrage ablehnen', text: 'Kurze Begründung für die anfragende Person:', ok: 'Ablehnen' }) : Promise.resolve('')).then(function (ans) {
      if (ans === null) return;
      var nid = +t.getAttribute('data-nid'); if (nid) api('POST', 'me/notifications', { action: 'read', ids: [nid] });
      return api('POST', 'me/booking/decide', { id: id, status: act === 'bkok' ? 'approved' : 'declined', answer: ans }).then(reload).then(function () { note('ok', act === 'bkok' ? 'Freigegeben – die Person bekommt Bescheid.' : 'Abgelehnt – die Person bekommt Bescheid.'); }, function (err) { note('err', err.message); });
      });
    }
    if (act === 'tripveh') { st.tripVeh = id; st.tripBooking = null; return render(); }
    if (act === 'tripfrom') { st.tripVeh = id; st.tripBooking = +v; st.tripKind = 'verein'; return render(); }
    if (act === 'tripsave') {
      var tb = { vehicle_id: id, kind: val('myf-tkind'), purpose: val('myf-tpurp'), km_end: val('myf-tkm'), fuel_l: val('myf-tfuel'), booking_id: +(v || 0) };
      if (!tb.km_end) { note('err', 'Bitte den km-Stand am Ende eintragen.'); return; }
      return api('POST', 'me/trip', tb).then(function () { st.tripBooking = null; st.tripPurp = ''; return reload(); }).then(function () { note('ok', 'Fahrt gespeichert – danke!'); }, function (err) { note('err', err.message); });
    }
    if (act === 'repnext') {
      var rs = root.querySelectorAll('#myf-report details.ffl-repsec'), cur = rs[+v], nx = rs[+v + 1];
      if (cur) cur.open = false; if (nx) { nx.open = true; window.scrollTo(0, Math.max(0, nx.getBoundingClientRect().top + window.pageYOffset - 70)); }
      return;
    }
    if (act === 'start2fa') return api('POST', 'me/2fa', { do: 'start' }).then(function (r) { st.twofa = r; st.tab = 'profile'; st.psec = null; save('tab', 'profile'); render(); var bx = document.querySelector('.ffl-2fabox'); if (bx) bx.scrollIntoView({ block: 'center' }); }, function (e) { note('err', e.message); });
    if (act === 'm2fastart') return api('POST', 'me/2fa', { do: 'start' }).then(function (r) { st.twofa = r; render(); }, function (e) { note('err', e.message); });
    if (act === 'm2faman') { st.twofa = 'manage'; return render(); }
    if (act === 'm2facancel') { st.twofa = null; return render(); }
    if (act === 'm2fadone') { st.twofaCodes = null; return reload(); }
    if (act === 'm2faconfirm') return api('POST', 'me/2fa', { do: 'confirm', code: val('myf-2facode') }).then(function (r) { st.twofa = null; st.twofaCodes = r.recovery; return reload(); }, function (e) { note('err', e.message); });
    if (act === 'm2farec') return api('POST', 'me/2fa', { do: 'recovery', code: val('myf-2facode') }).then(function (r) { st.twofa = null; st.twofaCodes = r.recovery; render(); }, function (e) { note('err', e.message); });
    if (act === 'm2faoff') { if (!confirm('Zwei-Faktor-Anmeldung abschalten?')) return; return api('POST', 'me/2fa', { do: 'off', code: val('myf-2facode') }).then(function () { st.twofa = null; return reload(); }).then(function () { note('ok', 'Zwei-Faktor abgeschaltet.'); }, function (e) { note('err', e.message); }); }
    if (act === 'startpdata') { st.tab = 'profile'; st.psec = 'data'; save('tab', 'profile'); render(); return window.scrollTo(0, root.offsetTop - 20); }
    if (act === 'startcert') { st.tab = 'incidents'; st.isub = 'cert'; st.inc = null; st.report = null; st.cv = null; return render(); }
    if (act === 'startpart') {
      st.tab = 'incidents'; st.report = null; st.pform = myPart(id) || (anyInc(id) && selfOk(anyInc(id))) ? id : null;
      if (d.incident_manage && (d.manage.incidents || []).some(function (x) { return x.id === id; })) { st.isub = 'lead'; st.inc = id; } else { st.isub = 'self'; st.inc = null; }
      render(); var sr = root.querySelector('.ffl-selfrow') || root.querySelector('.ffl-pform'); if (sr) window.scrollTo(0, Math.max(0, sr.getBoundingClientRect().top + window.pageYOffset - 80)); return true;
    }
    if (act === 'trq') { st.trq = t.getAttribute('data-v') === '1'; render(); var tq = document.getElementById('myf-trq-title'); if (tq) tq.focus(); return true; }
    if (act === 'trqsend') {
      var tt = val('myf-trq-title').trim(); if (!tt) { note('err', 'Bitte den Lehrgang eintragen.'); return true; }
      // Kürzel in eckigen Klammern: die Lehrgangsverwaltung übernimmt den Eintrag dann mit einem Klick
      var tsh = val('myf-trq-title-short').trim();
      api('POST', 'me/message', { area: 'courses', about: 'Ausbildung nachtragen: ' + tt + (tsh ? ' [' + tsh + ']' : '') + (val('myf-trq-when').trim() ? ' (' + val('myf-trq-when').trim() + ')' : ''), text: val('myf-trq-note') || 'Bitte in meiner Ausbildung nachtragen.' })
        .then(function () { st.trq = false; return reload(); }).then(function () { note('ok', 'Anfrage gesendet – die Lehrgangsverwaltung trägt nach und meldet sich.'); }, function (err) { note('err', err.message); });
      return true;
    }
    if (act === 'mkind') { st.mkind = t.getAttribute('data-v'); st.incNew = null; return render(); }
    if (act === 'partclose') { api('POST', 'me/incident', { id: id, part_closed: t.getAttribute('data-v') === '1' }).then(reload).then(function () { note('ok', t.getAttribute('data-v') === '1' ? 'Liste abgeschlossen – niemand trägt sich mehr selbst ein.' : 'Liste wieder geöffnet.'); }, function (err) { note('err', err.message); }); return true; }
    if (act === 'demoview') { api('POST', 'admin/demo', { action: 'view', on: false }).then(function () { location.reload(); }); return true; }
    // Demo komplett beenden: Ansicht zurück auf echte Daten, dann den Demo-Bestand löschen (zwei Schritte, weil Löschen nur aus der echten Ansicht erlaubt ist)
    if (act === 'demooff') {
      if (!confirm('Demo beenden und den kompletten Demo-Bestand löschen? Echte Daten bleiben unberührt.')) return true;
      api('POST', 'admin/demo', { action: 'view', on: false }).then(function () { return api('POST', 'admin/demo', { action: 'off' }); }).then(function () { location.reload(); }, function (e) { alert(e.message || 'Fehler'); });
      return true;
    }
    // Fahrzeugseite: weiter zur passenden Seite, Fahrzeug schon ausgewählt
    if (act === 'cartrip') { st.tab = 'trips'; st.tripVeh = id; return render(); }
    if (act === 'cardefect') { st.tab = 'defects'; st.defObj = ((d.vehicles_hub || []).filter(function (x) { return x.id === id; })[0] || {}).name || ''; return render(); }
    if (act === 'carbook') { st.tab = 'vehicle'; st.bookVeh = id; return render(); }
    if (act === 'startinc') { st.tab = 'incidents'; st.inc = id; return render(); }
    if (act === 'ngo') {
      var nk = t.getAttribute('data-k') || '', jump = '';
      // Entscheidungen der Führung (Austragen, Bescheinigung) bleiben offen, bis jemand sie erledigt hat – dann verschwinden sie bei allen
      var nn = (d.notifications || []).filter(function (x) { return x.id === id; })[0], nkey = String((nn && nn.key) || '');
      if (!(d.incident_manage && nn && (/^(partreq|cert):/.test(nkey) || (nk === 'part' && !nkey)))) api('POST', 'me/notifications', { action: 'read', ids: [id] });
      // Einsatzführung arbeitet im Mitgliederbereich: Bescheinigungen und Einsätze hier öffnen statt in der Verwaltung
      if (v === 'admin:cert' && d.incident_manage) { st.tab = 'incidents'; st.isub = 'cert'; st.inc = null; st.report = null; st.cv = null; save('tab', 'incidents'); return reload(); }
      if (/^admin:incident:\d+$/.test(v) && d.incident_manage) v = 'einsatz:' + v.slice(15);
      if (v.indexOf('admin') === 0) { if (window.MYFAdminOpen) window.MYFAdminOpen(v.slice(6)); return; }
      if (v === 'loops') { st.tab = 'profile'; st.psec = 'loops'; save('tab', 'profile'); return reload(); }
      if (v.indexOf('brief:') === 0) { st.tab = 'start'; st.briefOpen = +v.slice(6); save('tab', 'start'); return reload().then(function () { var bx = document.querySelector('.ffl-briefbox'); if (bx) bx.scrollIntoView({ block: 'center' }); }); }
      if (v.indexOf('einsatz:') === 0) {
        st.wantInc = +v.slice(8); var wx = anyInc(st.wantInc), mine = wx && myPart(wx.id);
        // Wer etwas entscheiden muss (Austragen, Bescheinigung, Bericht zur Freigabe), landet auf der Einsatzseite der Führung;
        // Alarm/„Warst du dabei?“ und der eigene Bescheinigungs-Stand öffnen das eigene Formular
        var lead = d.incident_manage && (nk === 'part' || nk === 'info' || (nk === 'cert' && !mine));
        st.isub = lead || (d.incident_manage && !mine && nk !== 'ask' && nk !== 'alarm') ? 'lead' : 'self';
        st.pform = !lead && wx && (mine || selfOk(wx)) ? st.wantInc : null; v = 'incidents';
        if (lead) jump = nk === 'part' ? '.ffl-partreq' : nk === 'cert' ? '.ffl-certbox' : '';
      }
      if (v.indexOf('bericht:') === 0) { st.wantInc = +v.slice(8); st.wantRep = true; v = 'incidents'; }
      // Direkt zur Stelle springen; ist der Vorgang schon erledigt, kurz Bescheid geben
      st.tab = v; save('tab', v); return reload().then(function () {
        if (!jump) return;
        var bx = document.querySelector(jump);
        if (bx) { bx.scrollIntoView({ block: 'center' }); bx.classList.add('ffl-flash'); }
        else alert(nk === 'part' ? 'Schon erledigt – hier möchte niemand mehr ausgetragen werden.' : 'Schon erledigt – hier ist keine Bescheinigung mehr offen.');
      });
    }
    if (act === 'fb') { st.fb = { area: v, about: t.getAttribute('data-about') }; render(); window.scrollTo(0, root.offsetTop - 20); var ta = document.getElementById('myf-fbtext'); if (ta) ta.focus(); return; }
    if (act === 'fbcancel') { st.fb = null; return render(); }
    if (act === 'fbsend') {
      return api('POST', 'me/message', { area: st.fb.area, about: st.fb.about, text: val('myf-fbtext') }).then(function () { st.fb = null; return reload(); })
        .then(function () { note('ok', 'Danke – ist bei den Zuständigen angekommen.'); }, function (err) { note('err', err.message); });
    }
    if (act === 'iwithdraw') {
      if (!confirm('Anregung zurückziehen? Die Führung sieht dann „zurückgezogen“.')) return;
      return api('POST', 'me/idea/withdraw', { id: id }).then(reload).then(function () { note('ok', 'Zurückgezogen.'); }, function (err) { note('err', err.message); });
    }
    if (act === 'need') {
      t.disabled = true;
      // „Möchte ich“ (data-on=1) bzw. wieder abwählen (data-on=0)
      return api('POST', 'me/need', { course_id: id, on: t.getAttribute('data-on') === '1' }).then(reload).catch(function (err) { t.disabled = false; note('err', err.message); });
    }
    if (act === 'withdraw') {
      return MYFUI.ask({ title: 'Vom Lehrgang zurücktreten?', text: 'Grund (optional):', ok: 'Zurücktreten' }).then(function (reason) {
        if (reason === null) return;
        return api('POST', 'me/need', { course_id: id, on: false, reason: reason }).then(reload)
          .then(function () { note('ok', 'Du bist zurückgetreten. Die Führung sieht das sofort.'); }).catch(function (err) { note('err', err.message); });
      });
    }
    if (act === 'cwithdraw') {
      if (!confirm('Meldung zurückziehen?')) return;
      return api('POST', 'me/clothing/withdraw', { id: id }).then(reload).catch(function (err) { note('err', err.message); });
    }
    if (act === 'ckind') { st.ckind = v; return render(); }
    if (act === 'nlevel') { keepNoticeForm(); st.nlevel = v; render(); return restoreNoticeForm(); }
    if (act === 'nuntil') { document.getElementById('myf-nends').value = untilPreset(v); return; }
    if (act === 'nedit') { st.nedit = id; st.ncopy = null; st.nlevel = null; render(); return document.getElementById('myf-ntext').focus(); }
    if (act === 'ncopy') { var nc = d.notices.filter(function (x) { return x.id === id; })[0]; st.ncopy = { text: nc.text, level: nc.level }; st.nedit = null; st.nlevel = null; render(); return window.scrollTo(0, root.offsetTop - 20); }
    if (act === 'ncancel') { st.nedit = null; st.ncopy = null; st.nlevel = null; return render(); }
    if (act === 'nend') {
      if (!confirm('Diesen Hinweis jetzt beenden? Er verschwindet vom Dashboard.')) return;
      return api('POST', 'me/notice', { id: id, end: true }).then(reload).then(function () { note('ok', 'Hinweis beendet.'); }).catch(function (err) { note('err', err.message); });
    }
    if (act === 'nsave') {
      var nt = val('myf-ntext').trim();
      if (!nt) return note('err', 'Bitte einen Text eingeben.');
      var nlv = st.nlevel || (st.nedit ? (d.notices.filter(function (x) { return x.id === st.nedit; })[0] || {}).level : (st.ncopy || {}).level) || 'info';
      t.disabled = true;
      return api('POST', 'me/notice', { id: st.nedit || 0, text: nt, level: nlv, ends: val('myf-nends'), starts: val('myf-nstarts'), sig: val('myf-nsig') }).then(function () {
        var was = st.nedit; st.nedit = null; st.ncopy = null; st.nlevel = null;
        return reload().then(function () { note('ok', was ? 'Hinweis geändert.' : 'Hinweis ist jetzt auf dem Dashboard.'); });
      }).catch(function (err) { t.disabled = false; note('err', err.message); });
    }
    if (act === 'durg') { keepDefectForm(); st.durg = v; render(); return restoreDefectForm(); }
    if (act === 'dphotodel') { keepDefectForm(); st.photos.splice(+v, 1); render(); return restoreDefectForm(); }
    if (act === 'calmine') { st.calMine = v === '1'; save('calMine', v); return render(); }
    if (act === 'copyics') {
      var link = d.ics[v];
      (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(function () { note('ok', 'Link kopiert.'); }, function () { prompt('Link kopieren:', link); });
      return;
    }
    if (act === 'resetics') {
      if (!confirm('Kalender-Link erneuern? Bereits eingerichtete Abos funktionieren dann nicht mehr und müssen neu eingerichtet werden.')) return;
      return api('POST', 'me/ics/reset').then(reload).then(function () { note('ok', 'Neuer Link erzeugt. Bitte das Abo neu einrichten.'); });
    }
  });

  // Eingaben beim Neuzeichnen behalten
  function keepDefectForm() { st.dkeep = { obj: val('myf-dobj'), title: val('myf-dtitle'), text: val('myf-dtext') }; }
  function restoreDefectForm() {
    if (!st.dkeep) return;
    var o = document.getElementById('myf-dobj'); if (o && st.dkeep.obj) o.value = st.dkeep.obj;
    var t = document.getElementById('myf-dtitle'); if (t) t.value = st.dkeep.title;
    var x = document.getElementById('myf-dtext'); if (x) x.value = st.dkeep.text;
  }

  root.addEventListener('input', function (e) { if (e.target.closest && e.target.closest('#myf-report')) repAutosave(); });
  root.addEventListener('change', function (e) { if (e.target.id === 'myf-iyear') { st.iYear = +e.target.value || 0; if (st.lt) Object.keys(st.lt).forEach(function (k) { if (k.indexOf('lead_') === 0) st.lt[k].page = 0; }); reload(); } });
  // Fahrzeug an-/abhaken: Zeitfelder ein-/ausblenden
  // Alarmschleifen-Anfrage: Auswahl merken, ohne das Formular neu aufzubauen
  root.addEventListener('change', function (e) { var lw = e.target.getAttribute && e.target.getAttribute('data-lpw'); if (!lw) return;
    var nt = document.getElementById('myf-lpnote'); if (nt) st.lpNote = nt.value;
    st.lpWant = (st.lpWant || (d.loops_mine || []).slice()).filter(function (x) { return x !== +lw; }); if (e.target.checked) st.lpWant.push(+lw); render(); });
  root.addEventListener('change', function (e) { if (e.target.getAttribute && e.target.getAttribute('data-vf') === 'on') { var tr = e.target.closest('tr'); if (tr) tr.classList.toggle('is-off', !e.target.checked); } });
  root.addEventListener('change', function (e) {
    if (e.target.closest && e.target.closest('#myf-report')) {
      if (e.target.type === 'checkbox' || e.target.type === 'radio') [].forEach.call(document.querySelectorAll('#myf-report input[name="' + e.target.name + '"]'), function (x) { x.closest('label').classList.toggle('on', x.checked); });
      repAutosave(); return;
    }
    if (e.target.id === 'myf-psel-all') { [].forEach.call(root.querySelectorAll('[data-psel]'), function (el) { el.checked = e.target.checked; }); return; }
    if (e.target.hasAttribute && e.target.hasAttribute('data-psel')) return;
    if (e.target.id === 'myf-nmail') { api('POST', 'me/notifications', { action: 'mail', on: e.target.checked }); return; }
    if (incidentChange(e.target)) return;
    if (e.target.id === 'myf-dphoto') {
      var files = [].slice.call(e.target.files || [], 0, 3 - st.photos.length);
      keepDefectForm();
      return Promise.all(files.map(shrink)).then(function (list) {
        st.photos = st.photos.concat(list.filter(Boolean)).slice(0, 3); render(); restoreDefectForm();
      });
    }
    if (e.target.id === 'myf-ci') {
      // Größe aus „Meine Größen“ vorschlagen
      var opt = e.target.options[e.target.selectedIndex], key = opt && opt.getAttribute('data-size'), sz = document.getElementById('myf-cs');
      if (key && sz && d.sizes[key]) sz.value = d.sizes[key];
      return;
    }
    var id = e.target.getAttribute('data-comment');
    if (id) saveComment(e.target);
  });
  // Bemerkung zum Lehrgangswunsch: beim Tippen speichern (kurz verzögert), nicht erst beim Verlassen des Feldes
  var cmTimer = {};
  function saveComment(el) {
    var id = el.getAttribute('data-comment'), stEl = root.querySelector('[data-cmstate="' + id + '"]');
    clearTimeout(cmTimer[id]);
    if (stEl) stEl.textContent = 'wird gespeichert …';
    cmTimer[id] = setTimeout(function () {
      api('POST', 'me/need', { course_id: +id, on: true, comment: el.value }).then(function () {
        var n = curNeeds().filter(function (x) { return x.course_id === +id; })[0]; if (n) n.comment = el.value;
        var s2 = root.querySelector('[data-cmstate="' + id + '"]'); if (s2) s2.textContent = '✓ gespeichert';
      }).catch(function (err) { note('err', err.message); });
    }, 900);
  }
  root.addEventListener('input', function (e) { if (e.target.getAttribute && e.target.getAttribute('data-comment')) saveComment(e.target); });
  // Person nachtragen: Treffer live unter dem Suchfeld (alle Mitglieder, die noch nicht eingetragen sind)
  function paddSearch(inp) {
    var box = document.getElementById('myf-paddres'); if (!box) return;
    var iid = +inp.getAttribute('data-inc'), q = norm(inp.value), words = q.split(' ').filter(Boolean);
    var taken = {}; d.manage.participation.forEach(function (p) { if (p.incident_id === iid) taken[p.member_id] = 1; });
    var hits = !words.length ? [] : d.manage.members.filter(function (m) { var n = norm(m.name); return !taken[m.id] && words.every(function (w) { return n.indexOf(w) >= 0; }); }).slice(0, 8);
    box.innerHTML = !words.length ? '' : hits.length ? hits.map(function (m) {
      return '<button type="button" class="ffl-toggle-chip" data-act="partadd" data-id="' + iid + '" data-v="' + m.id + '">+ ' + esc(m.name) + '</button>';
    }).join('') : '<span class="ffl-mu">Niemand gefunden (schon eingetragen oder anders geschrieben?)</span>';
  }
  function norm(x) { return String(x || '').toLowerCase().replace(/[,.]/g, ' ').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/\s+/g, ' ').trim(); }
  root.addEventListener('input', function (e) { if (e.target.id === 'myf-paddname') paddSearch(e.target); });
  root.addEventListener('input', function (e) { if (e.target.id !== 'myf-matq') return; st.matQ = e.target.value; var pos = e.target.selectionStart; render(); var q = document.getElementById('myf-matq'); if (q) { q.focus(); try { q.setSelectionRange(pos, pos); } catch (x) {} } });
  // Neuer Einsatz/Übung: Art oder Einheit gewechselt → nächste freie Nummer dieser Reihe (solange nicht selbst geändert)
  root.addEventListener('change', function (e) {
    var f = e.target.closest && e.target.closest('[data-incform="0"]'); if (!f) return;
    var a = e.target.getAttribute('data-if'); if (a !== 'kind' && a !== 'unit') return;
    var nr = f.querySelector('[data-if=nr]'), k = f.querySelector('[data-if=kind]'), u = f.querySelector('[data-if=unit]');
    if (nr && nr.getAttribute('data-auto')) nr.value = nextNr(k ? k.value : 'einsatz', u ? u.value : (d.member.unit || ''));
  });
  root.addEventListener('input', function (e) { if (e.target.getAttribute && e.target.getAttribute('data-if') === 'nr') e.target.removeAttribute('data-auto'); });
  // Übung aus dem Dienstplan: Titel und Beginn übernehmen
  root.addEventListener('change', function (e) {
    if (e.target.id !== 'myf-drillpick' || !e.target.value) return;
    var o = e.target.options[e.target.selectedIndex], f = e.target.closest('[data-incform]');
    f.querySelector('[data-if=title]').value = o.getAttribute('data-title'); f.querySelector('[data-if=start]').value = o.getAttribute('data-start');
  });
  root.addEventListener('keydown', function (e) {
    if (e.target.id !== 'myf-paddname' || e.key !== 'Enter') return;
    var b = document.querySelectorAll('#myf-paddres [data-act=partadd]'); if (b.length === 1) { e.preventDefault(); b[0].click(); }
  });

  function profDirty(e) {
    var f = e.target.closest && e.target.closest('form'); if (!f || PFORMS.indexOf(f.id) < 0 || e.target.id.indexOf('myf-addtr-') === 0) return;
    st.pdirty = st.pdirty || {}; st.pdirty[f.id] = 1; var bar = document.getElementById('myf-pbar'); if (bar) bar.hidden = false;
  }
  root.addEventListener('input', profDirty); root.addEventListener('change', profDirty);
  function incEdit(e) { if (e.target.closest && st.inc && (e.target.closest('[data-vehtable]') || e.target.closest('[data-incform]:not([data-incform="0"])'))) incDirty(); }
  root.addEventListener('input', incEdit); root.addEventListener('change', incEdit);
  root.addEventListener('submit', function (e) {
    if (PFORMS.indexOf(e.target.id) >= 0) { e.preventDefault(); profDirty(e); return profSave(); }
    e.preventDefault();
    if (e.target.id === 'myf-dform') {
      var dd = { object: val('myf-dobj'), urgency: st.durg, title: val('myf-dtitle'), text: val('myf-dtext'), photos: st.photos };
      if (!dd.object || !dd.title) return note('err', 'Bitte auswählen, was betroffen ist, und kurz beschreiben, was los ist.');
      st.busy = true; keepDefectForm(); render(); restoreDefectForm();
      return api('POST', 'me/defect', dd).then(function () {
        st.busy = false; st.photos = []; st.dkeep = null; st.durg = 'soon'; st.defObj = '';
        try { history.replaceState(null, '', location.pathname); } catch (x) {}
        return reload().then(function () { note('ok', 'Danke! Dein Mangel ist gemeldet' + (dd.urgency === 'out' ? ' – „außer Dienst“ ist jetzt für alle sichtbar.' : '.')); });
      }).catch(function (err) { st.busy = false; render(); restoreDefectForm(); note('err', err.message); });
    }
    if (e.target.id === 'myf-cform') {
      var c = { kind: st.ckind, item: val('myf-ci'), size: val('myf-cs'), qty: +val('myf-cq') || 1, reason: val('myf-cr'), comment: val('myf-cc') };
      if (!c.item) return note('err', 'Bitte auswählen, was du brauchst.');
      if (c.item === 'Sonstiges' && !c.comment) return note('err', 'Bitte im Kommentar beschreiben, was du brauchst.');
      return api('POST', 'me/clothing', c).then(reload).then(function () { note('ok', c.item + ' gemeldet.'); }).catch(function (err) { note('err', err.message); });
    }
    if (e.target.id === 'myf-iform') {
      var i = { recipient: val('myf-ito'), subject: val('myf-isub'), text: val('myf-itext'), anonymous: document.getElementById('myf-ianon').checked };
      return api('POST', 'me/idea', i).then(reload).then(function () { note('ok', 'Danke! Deine Anregung ist angekommen' + (i.anonymous ? ' (anonym).' : '.')); })
        .catch(function (err) { note('err', err.message); });
    }
  });

  reload().catch(function (e) { root.innerHTML = '<div class="ffl-msg err">' + esc(e.message) + '</div>'; });
  // App & Offline: Service Worker registrieren; beim Abmelden Zwischenspeicher löschen
  if ('serviceWorker' in navigator && MYF.sw) {
    navigator.serviceWorker.register(MYF.sw, { scope: '/' }).catch(function () {});
    root.addEventListener('click', function (e) {
      var a = e.target.closest('a'); if (a && a.href === MYF.logout && navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage('clear');
    }, true);
  }
  MYFUI.ltBind(root, st, function () { render(); });
  window.addEventListener('online', function () { reload(); });
  var wasWide = profWide();
  window.addEventListener('resize', function () { var w = profWide(); if (w !== wasWide) { wasWide = w; if (st.tab === 'profile' && d) render(); } });
  window.addEventListener('offline', function () { render(); });
})();
