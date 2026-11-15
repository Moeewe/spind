/* Wehrwerk – Verwaltung: Übersicht, Lehrgänge (Jahre, Vorlagen, Zuteilung, Teilnahme), Mitglieder, Kleidung, Anregungen, Atemschutz, Protokoll */
(function () {
  'use strict';
  var ORG = ((window.MYF && MYF.org) || {}).name || 'Freiwillige Feuerwehr';
  var APP = (window.MYF && MYF.app) || 'Wehrwerk';

  // Auf der Website läuft die Verwaltung in einer Vollbild-Ebene (#ffl-adm), im WordPress-Menü in #ffl
  var root = document.getElementById('ffl-adm') || document.getElementById('ffl');
  if (!root || !window.MYF) return;
  var FRONT = root.id === 'ffl-adm';
  if (window.MYFForm) MYFForm.track(root);

  var ORTE = (window.MYF && MYF.course_places) || {}; // Ortsnummern der Bedarfsabfrage des Kreises (Nummer → Ort), je Installation
  var STATUS = { open: 'Gemeldet – offen', assigned: 'Zugeteilt', waiting: 'Warteliste', declined: 'Abgelehnt', withdrawn: 'Zurückgetreten',
    completed: 'Absolviert', missed: 'Nicht teilgenommen' };
  var ISTATUS = { 'new': 'Neu', progress: 'In Bearbeitung', done: 'Erledigt', declined: 'Nicht umgesetzt' };
  var CSTATUS = { open: 'Offen', ordered: 'Bestellt', issued: 'Ausgegeben', declined: 'Abgelehnt', withdrawn: 'Zurückgezogen' };
  var REASONS = { ersatz: ['Defekt', 'Verschlissen', 'Passt nicht mehr', 'Verloren', 'Sonstiges'], neu: ['Fehlt bisher', 'Neue Funktion / Aufgabe', 'Sonstiges'] };
  // Welcher Unterreiter-Schlüssel gehört zu welchem Reiter (für die Adresse: &tab=…&sub=…)
  var SUBKEY = { courses: 'sub', vehicles: 'vsub', agt: 'asub', duties: 'dsub', clothing: 'csub', teams: 'team', members: 'msub', incidents: 'isub', screen: 'ssub' };
  var ui = { tab: 'overview', sub: null, profile: null, prof: null, iFilter: 'open', mSearch: '', year: null, open: null, edit: null, importOpen: false, importText: '', importCat: 'auto',
    memberImport: '', print: 'plan', printOnlyNeeds: true, msg: null, tplOpen: false, tplSel: {},
    agtOnly: true, agtSel: {}, agtLogFor: null, cFilter: 'active' };
  function active(n) { return n.status !== 'withdrawn'; }
  var d = null;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  // Geheime Links (Alarm-Schnittstelle, Halle, Fernseher, Abruf, Kalender): verdeckt anzeigen – der Wert steht nicht im Seiteninhalt,
  // nur „Anzeigen“ (für 20 Sekunden), „Kopieren“ und „Öffnen“ holen ihn; jedes davon steht im Protokoll
  var SECRETS = [];
  function secretMask(s) {
    return String(s || '').replace(/=([^&'"\s]{6,})/g, '=••••••').replace(/\/([A-Za-z0-9_%.-]{20,})(?=\/|$|\?|')/g, '/••••••').replace(/[A-Za-z0-9_-]{24,}/g, '••••••');
  }
  function secretId(val, what) {
    for (var i = 0; i < SECRETS.length; i++) if (SECRETS[i].v === val) return i;
    return SECRETS.push({ v: val, what: what || 'Link' }) - 1;
  }
  // opt: what (fürs Protokoll), open (Öffnen-Knopf), href (anderes Ziel fürs Öffnen, z. B. webcal://), extra (weitere Knöpfe), id
  function secretBox(val, opt) {
    opt = opt || {};
    var k = secretId(val, opt.what), ko = opt.open ? secretId(opt.href || val, opt.what) : -1;
    return '<div class="ffl-linkbox ffl-secret"' + (opt.id ? ' id="' + esc(opt.id) + '"' : '') + '><span class="ffl-secret-tx" data-sec="' + k + '" title="Verdeckt – „Anzeigen“ zeigt den Link kurz an">' + esc(secretMask(val)) + '</span>' +
      '<button type="button" class="ffl-sm ffl-q" data-act="secshow" data-v="' + k + '" aria-pressed="false">Anzeigen</button>' +
      '<button type="button" class="ffl-sm" data-act="seccopy" data-v="' + k + '">Kopieren</button>' +
      (opt.open ? '<button type="button" class="ffl-sm" data-act="secopen" data-v="' + ko + '">' + esc(opt.open === true ? 'Öffnen ↗' : opt.open) + '</button>' : '') + (opt.extra || '') + '</div>';
  }
  function secretLog(k, how) { api('POST', 'admin/secret', { what: SECRETS[k].what, how: how }).catch(function () {}); }
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-act^="sec"]'); if (!t) return;
    var act = t.getAttribute('data-act'), k = +t.getAttribute('data-v'), s = SECRETS[k]; if (!s || ['secshow', 'seccopy', 'secopen'].indexOf(act) < 0) return;
    e.preventDefault(); e.stopPropagation();
    if (act === 'secshow') {
      var on = t.getAttribute('aria-pressed') !== 'true';
      [].forEach.call(document.querySelectorAll('[data-sec="' + k + '"]'), function (el) { el.textContent = on ? s.v : secretMask(s.v); el.classList.toggle('is-shown', on); });
      [].forEach.call(document.querySelectorAll('[data-secqr="' + k + '"]'), function (el) { el.innerHTML = on ? qrSvg(s.v, 2) : '<span class="ffl-secret-qr">QR verdeckt</span>'; });
      t.setAttribute('aria-pressed', on ? 'true' : 'false'); t.textContent = on ? 'Verbergen' : 'Anzeigen';
      if (on) { secretLog(k, 'angezeigt'); clearTimeout(t._h); t._h = setTimeout(function () { if (document.contains(t) && t.getAttribute('aria-pressed') === 'true') t.click(); }, 20000); }
    } else if (act === 'seccopy') {
      secretLog(k, 'kopiert');
      (navigator.clipboard ? navigator.clipboard.writeText(s.v) : Promise.reject()).then(function () { flash('ok', 'Kopiert – nur dort einfügen, wo er hingehört.'); }, function () { prompt('Kopieren:', s.v); });
    } else {
      secretLog(k, 'geöffnet');
      if (/^webcal:/i.test(s.v)) location.href = s.v; else window.open(s.v, '_blank', 'noopener');
    }
  }, true);
  function url(path, query) {
    var u = MYF.api + path;
    if (query) u += (u.indexOf('?') >= 0 ? '&' : '?') + query;
    return u;
  }
  function api(method, path, body, query) {
    return fetch(url(path, query), {
      method: method, credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': MYF.nonce },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.message || 'Fehler ' + r.status);
        return j;
      });
    });
  }
  function post(path, body, note) {
    return api('POST', 'admin/' + path, body).then(function (r) { if (note) flash('ok', note); return reload().then(function () { return r; }); })
      .catch(function (e) { flash('err', e.message); throw e; });
  }
  function reload() {
    ui.audit = null; ui.auditCheck = null;
    var want = ui.year;
    // Beim Jahreswechsel sofort „Lade …“ zeigen statt der Daten des vorherigen Jahres
    if (d && want !== null && d.year !== want) render();
    return api('GET', 'admin/state', null, [want !== null ? 'year=' + want : '', ui.iYear ? 'iyear=' + ui.iYear : ''].filter(Boolean).join('&')).then(function (data) {
      if (want !== ui.year) return; // inzwischen anderes Jahr gewählt: veraltete Antwort verwerfen
      d = data; if (ui.year === null) ui.year = data.year; MYFUI.release = data.release || MYFUI.release;
      if (ui.devJump) {
        ui.devJump = false;
        var dj = (d.devices || []).filter(function (x) { return x.id === ui.dev; })[0];
        if (dj && dj.area === 'vehicles') { ui.tab = 'vehicles'; ui.vsub = 'geraete'; ui.wsub = 'devices'; }
        else if (dj && dj.area.indexOf('team_') === 0) { ui.tab = 'teams'; ui.team = dj.area; ui.tsub = 'inv'; ui.wsub = 'devices'; }
      }
      if (ui.profile) return loadProfile(ui.profile);
      render();
    });
  }
  // Jahresbezogene Bereiche beim Wechsel schließen, damit nichts vom vorherigen Jahr offen bleibt
  function resetYearUi() { ui.open = null; ui.edit = null; ui.tplOpen = false; ui.tplSel = {}; ui.importOpen = false; ui.newYear = false; }
  function loadProfile(id) {
    return api('GET', 'admin/profile', null, 'id=' + id).then(function (p) { ui.prof = p; ui.profile = id; render(); });
  }
  function flash(type, text) { ui.msg = { type: type, text: text }; render(); setTimeout(function () { if (ui.msg && ui.msg.text === text) { ui.msg = null; render(); } }, 4000); }

  function fmtDate(iso) { if (!iso) return ''; var p = iso.slice(0, 10).split('-'); return p[2] + '.' + p[1] + '.' + p[0]; }
  // Zeitraum eines Termins: aus Datumsfeldern, sonst Freitext
  function range(x) {
    if (!x) return '';
    if (x.start) {
      var a = x.start.split('-'), b = (x.end || x.start).split('-');
      if (x.start === (x.end || x.start)) return fmtDate(x.start);
      return a[2] + '.' + (a[1] === b[1] ? '' : a[1] + '.') + '–' + b[2] + '.' + b[1] + '.' + b[0];
    }
    return x.period || '';
  }
  function isUsed(n) { return n.status === 'assigned' || n.status === 'completed'; }
  function today() { var t = new Date(); return ('0' + t.getDate()).slice(-2) + '.' + ('0' + (t.getMonth() + 1)).slice(-2) + '.' + t.getFullYear(); }
  function euro(v) { return v == null ? '' : v.toFixed(2).replace('.', ',') + ' €'; }
  // Einheiten (Löschzüge) kommen aus den Einstellungen – bei nur einer Einheit wird keine Auswahl gezeigt
  function unitKeys() { return Object.keys((d && d.units) || {}); }
  function unitName(u) { return ((d && d.units) || {})[u] || u || ''; }
  function unitShort(u) { return unitName(u).replace(/^(LZ|LG|Löschzug|Löschgruppe|Einheit)\s+/i, ''); }
  function unitIdx(u) { var i = unitKeys().indexOf(u); return i < 0 ? 99 : i; }
  function multiUnit() { return unitKeys().length > 1; }
  function unitSel(v, attrs) { return sel(unitKeys().map(function (k) { return [k, unitName(k)]; }), v || unitKeys()[0], attrs); }
  function unitField(v, attrs, label) { return multiUnit() ? '<div><label class="ffl-fl">' + (label || 'Einheit') + '</label>' + unitSel(v, attrs) + '</div>' : ''; }
  // Einheit aus Text (Import): exakter Schlüssel/Kurzname; strict = nur bei eindeutigem Treffer
  function unitGuess(x, strict) {
    var t = String(x || '').toLowerCase().replace(/^(lz|lg|löschzug|löschgruppe)\s*/, '').trim();
    if (!t) return null;
    return unitKeys().filter(function (k) { return k.toLowerCase() === t || unitShort(k).toLowerCase() === t || (!strict && unitName(k).toLowerCase().indexOf(t) >= 0); })[0] || null;
  }
  function by(list, key) { var m = {}; list.forEach(function (x) { m[x[key]] = x; }); return m; }
  function group(list, key) { var m = {}; list.forEach(function (x) { (m[x[key]] = m[x[key]] || []).push(x); }); return m; }
  function sel(options, value, attrs) {
    return '<select ' + (attrs || '') + '>' + options.map(function (o) {
      return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(value) ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
    }).join('') + '</select>';
  }
  function memberName(m) { return m ? m.name : '(gelöscht)'; }
  function splitName(n) { var p = String(n || '').split(','); return { last: p[0].trim(), first: p.slice(1).join(',').trim() }; }
  function joinName(last, first) { last = String(last || '').trim(); first = String(first || '').trim(); return last + (first ? ', ' + first : ''); }

  // Drucken: Inhalt in einen eigenen Bereich direkt unter <body>, damit nichts von der Seite mitgedruckt wird (keine Leerseiten)
  function printNow(html, portrait, o) { return MYFPrint.printNow(html, portrait, o); } // erst Vorschau, dann PDF / Drucken

  // Mitglied per Namen suchen: tippen (Vorschläge) oder aus der Liste wählen
  function memberPicker(id, list, placeholder) {
    return '<input type="search" id="' + id + '" list="' + id + '-l" class="ffl-picker" autocomplete="off" placeholder="' + esc(placeholder || 'Name tippen …') + '">' +
      '<datalist id="' + id + '-l">' + (list || d.members.filter(function (m) { return m.active; })).map(function (m) {
        return '<option value="' + esc(m.name) + '" label="' + esc(unitName(m.unit)) + '"></option>';
      }).join('') + '</datalist>';
  }
  // Vorschläge aus dem, was schon im System steht (häufigste zuerst) – erspart doppeltes Tippen, freie Eingabe bleibt möglich
  function sug(id, vals) {
    var n = {}; (vals || []).forEach(function (v) { v = String(v || '').trim(); if (v) n[v] = (n[v] || 0) + 1; });
    return '<datalist id="' + id + '">' + Object.keys(n).sort(function (a, b) { return n[b] - n[a] || a.localeCompare(b); }).slice(0, 40).map(function (v) { return '<option value="' + esc(v) + '">'; }).join('') + '</datalist>';
  }
  function pickMember(id, list) {
    var el = document.getElementById(id), q = el ? el.value.trim().toLowerCase() : '';
    if (!q) return null;
    list = list || d.members.filter(function (m) { return m.active; });
    var exact = list.filter(function (m) { return m.name.toLowerCase() === q; });
    if (exact.length) return exact[0];
    var hits = list.filter(function (m) { return m.name.toLowerCase().indexOf(q) >= 0; });
    return hits.length === 1 ? hits[0] : null;
  }

  // Auswahllisten bearbeiten (Größenfelder, Bereiche, Tätigkeiten …)
  function listEditor(name, title, hint, placeholder) {
    var cur = { size_keys: d.size_keys, cloth_cats: d.cloth_cats, employment: d.employment_opts, trait_cats: d.trait_cats }[name] || {};
    return '<div class="ffl-pbox"><div class="ffl-sh" style="font-size:17px;margin-bottom:4px">' + esc(title) + '</div>' + (hint ? '<p class="ffl-mu" style="margin:0 0 8px">' + hint + '</p>' : '') +
      '<div class="ffl-lrows" data-list="' + name + '">' + Object.keys(cur).map(function (k) {
        return '<div class="ffl-lrow" data-key="' + esc(k) + '"><input type="text" value="' + esc(cur[k]) + '"><button type="button" class="ffl-q ffl-sm" data-act="lrowdel" title="Entfernen">✕</button></div>';
      }).join('') + '<div class="ffl-lrow" data-key=""><input type="text" placeholder="' + esc(placeholder || 'Neuer Eintrag …') + '"></div></div></div>';
  }
  // Mehrere Auswahllisten nebeneinander: ein gemeinsames Speichern
  function listEditors(html) {
    return '<div class="ffl-lists"><div class="ffl-grid2">' + html + '</div><div class="ffl-row" style="margin-top:8px"><button type="button" class="ffl-p" data-act="savelist">Listen speichern</button>' +
      '<span class="ffl-mu">Einträge, die noch verwendet werden, bleiben erhalten.</span></div></div>';
  }

  // Atemschutz auf einen Blick (nur mit Berechtigung)
  function agtState(m) {
    if (!d.can_agt || !m.agt) return null;
    var i = agtInfo(m), why = [];
    if (i.gstate === 'none') why.push('G26-Datum fehlt'); else if (i.gstate === 'over') why.push('G26 abgelaufen seit ' + fmtDate(i.g26));
    if (!m.agt_course) why.push('Lehrgang Atemschutzgeräteträger nicht nachgewiesen');
    if (i.state === 'none') why.push('Übungsstrecke nie eingetragen'); else if (i.state === 'over') why.push('Übungsstrecke fällig seit ' + fmtDate(i.due));
    var soon = [];
    if (i.gstate === 'soon') soon.push('G26 bis ' + fmtDate(i.g26));
    if (i.state === 'soon') soon.push('Übungsstrecke bis ' + fmtDate(i.due));
    var detail = why.length ? why.join(' · ') : ['G26 bis ' + fmtDate(i.g26), 'Übungsstrecke bis ' + fmtDate(i.due)].join(' · ');
    return { ready: !why.length, soon: !why.length && soon.length > 0, detail: detail, info: i };
  }
  function agtChip(m) {
    var a = agtState(m);
    if (!a) return m.agt ? '<span class="ffl-chip st-open">AGT</span>' : '';
    return '<span class="ffl-chip ' + (!a.ready ? 'st-bad' : a.soon ? 'st-warn' : 'st-ok') + '" title="' + esc(a.detail) + '">' + (a.ready ? '✓ AGT einsatzbereit' + (a.soon ? ' · bald fällig' : '') : '✕ AGT nicht einsatzbereit') + '</span>';
  }

  // ---- Grundgerüst -----------------------------------------------------------
  function render() {
    if (!d) return;
    // Hauptmenü = Gruppen, darunter (eigene Leiste) die Seiten der Gruppe – nur was die Person darf
    var NAV = [
      ['overview', 'Übersicht', [['overview', 'Übersicht']]],
      ['people', 'Mitglieder', [['members', 'Mitglieder'], ['briefings', 'Unterweisungen']]],
      ['ops', 'Einsätze', [['incidents', 'Einsätze']]],
      ['train', 'Lehrgänge', [['courses', 'Lehrgänge']]],
      ['agt', 'Atemschutz', [['agt', 'Atemschutz']]],
      ['tech', 'Technik', [['vehicles', 'Fahrzeuge & Geräte']]],
      ['duty', 'Dienste', [['duties', 'Jahresdienstplan'], ['uebungen', 'Übungen & Teilnahme'], ['board', 'Aushänge & Einladungen']]],
      // Abfragen (Brandsicherheitswache, Grünanlagen, Volkstrauertag …) sind etwas Eigenes – nicht mit Übungen und Dienstabenden mischen
      ['asks', 'Abfragen', [['dutylists', 'Abfragen'], ['orders', 'Bestellkarten']]],
      ['reports', 'Meldungen', [['defects', 'Mängel'], ['ideas', 'Anregungen'], ['messages', 'Rückfragen']]],
      ['cloth', 'Kleiderkammer', [['clothing', 'Kleiderkammer']]],
      ['teams', (d.team_areas || []).length === 1 && !d.full ? (d.area_labels[d.team_areas[0]] || 'Team') : 'Teams', [['teams', 'Teams']]],
      ['dash', 'Dashboard', [['screen', 'Dashboard']]],
      ['settings', 'Einstellungen', [['settings', 'Organisation', 'Organisation'], ['cd', 'Vorlagen & Logos'], ['rights', 'Rechte'], ['start', 'Startklar & Neustart'], ['mail', 'E-Mail-Versand', 'Anbindungen'], ['data', 'Daten & Schnittstellen'], ['site', 'Website'], ['security', 'Sicherheit', 'Sicherheit'], ['audit', 'Protokoll']]]
    ];
    if (ui.tab === 'members' && ui.msub === 'lists' && d.full) { ui.tab = 'rights'; ui.msub = null; }
    ui._nav = NAV;
    NAV = NAV.map(function (g) { return [g[0], g[1], g[2].filter(function (t) { return allowedTab(t[0]); })]; }).filter(function (g) { return g[2].length; });
    var tabs = []; NAV.forEach(function (g) { tabs = tabs.concat(g[2]); });
    if (ui.tab !== 'inbox' && !tabs.some(function (t) { return t[0] === ui.tab; })) ui.tab = 'overview';
    var group = NAV.filter(function (g) { return g[2].some(function (t) { return t[0] === ui.tab; }); })[0] || NAV[0];
    var newIdeas = d.ideas.filter(function (i) { return i.status === 'new'; }).length;
    var openCloth = d.clothing.filter(function (c) { return c.status === 'open'; }).length;
    function badge(t) {
      var n = t === 'screen' ? noticeSplit().act.length : t === 'messages' ? (d.messages || []).filter(function (m) { return m.status === 'open'; }).length : t === 'ideas' ? newIdeas : t === 'clothing' ? openCloth
        : t === 'defects' ? d.defects.filter(function (x) { return x.status === 'new'; }).length : t === 'teams' ? (d.team_tasks || []).filter(function (k) { return k.status === 'open'; }).length : 0;
      return n;
    }

    var h = '<div class="ffl-top ffl-brand"><div><img class="ffl-logo for-light" src="' + esc(MYF.logo) + '" alt="' + esc(ORG) + '" width="316" height="50">' +
      '<img class="ffl-logo for-dark' + (!MYF.logoDark || MYF.logoDark === MYF.logo ? ' is-plate' : '') + '" src="' + esc(MYF.logoDark || MYF.logo) + '" alt="" aria-hidden="true" width="316" height="50"></div>' +
      adminHeadR() + '</div>' + (d.demo && d.demo.ctx ? '<div class="ffl-demostrip">Demo-Bestand – alles hier ist erfunden, echte Daten sind ausgeblendet.' +
        (d.demo.can_view ? ' <button type="button" class="ffl-sm" data-act="demoview" data-v="0">Zurück zu echten Daten</button>' : '') + '</div>' : '');
    h += '<nav class="ffl-nav' + (group[2].length > 1 ? ' has-sub' : '') + '" aria-label="Verwaltung"><div class="ffl-tabs" role="tablist">' + NAV.map(function (g) {
      var n = g[2].reduce(function (a, t) { return a + badge(t[0]); }, 0);
      return '<button type="button" role="tab" data-tab="' + (g === group ? ui.tab : g[2][0][0]) + '" aria-selected="' + (g === group) + '">' + esc(g[1]) + (n ? '<span class="ffl-badge">' + n + '</span>' : '') + '</button>';
    }).join('') + '</div>' +
      (group[2].length > 1 ? '<div class="ffl-subnav" role="tablist">' + group[2].map(function (t) {
        var n = badge(t[0]);
        return (t[2] ? '<span class="ffl-subgroup" role="presentation">' + esc(t[2]) + '</span>' : '') + '<button type="button" role="tab" data-tab="' + t[0] + '" aria-selected="' + (ui.tab === t[0]) + '">' + esc(t[1]) + (n ? '<span class="ffl-badge">' + n + '</span>' : '') + '</button>';
      }).join('') + '</div>' : '') + '</nav>';
    if (ui.msg) h += '<div class="ffl-msg ' + ui.msg.type + '">' + esc(ui.msg.text) + '</div>';
    if (!d.me_member && ui.tab === 'overview') h += '<div class="ffl-msg warn">Dein eigenes Konto ist noch keinem Mitglied zugeordnet – deshalb kannst du ' + APP + ' nicht selbst nutzen. ' +
      'Öffne dein Profil unter <a href="#" data-go="members">Mitglieder</a> und klicke „Das bin ich“, oder lege dich auf der <a href="' + esc(d.link) + '" target="_blank" rel="noopener">Mitgliederseite</a> an.</div>';

    if (ui.tab === 'overview') h += MYFUI.relBar(); // einmal je Version: „Neu: Wehrwerk x.y.z – Was ist neu?“
    // Zwei-Faktor ist Pflicht, aber noch nicht eingerichtet: erst einrichten, dann geht es weiter
    if (d.twofa && d.twofa.required && !d.twofa.on && !ui.twofaCodes) h += '<div class="ffl-msg warn" style="margin-top:14px"><b>Bitte zuerst die Zwei-Faktor-Anmeldung einrichten.</b> Für Verwaltungskonten ist sie Pflicht – das dauert eine Minute.</div>' + twofaBox();
    else if (ui.twofaCodes) h += twofaBox();
    else h += ({ cd: tabCd, mail: tabMail, orders: tabOrders, rights: tabRights, security: tabSecurity, inbox: tabInbox, overview: tabOverview, courses: coursesSection, members: tabMembers, incidents: tabIncidents, clothing: tabClothing, defects: tabDefects, ideas: tabIdeas, agt: tabAgt, site: tabSite, briefings: tabBriefings, screen: tabScreen, audit: tabAudit, teams: tabTeams, messages: tabMessages, settings: tabSettings, start: tabStart, vehicles: tabVehicles, duties: function () { return '<div style="margin-top:12px">' + drillsPanel() + '</div>'; }, dutylists: function () { return tabDuties('duties'); }, uebungen: function () { return incidentList('uebung'); }, board: tabBoard, data: tabData })[ui.tab]();
    h += MYFUI.foot(d.foot);
    MYFForm.paint(root, h);
    [].forEach.call(root.querySelectorAll('.ffl-nav .ffl-tabs, .ffl-nav .ffl-subnav'), function (b) { var c = b.querySelector('[aria-selected=true]'); if (c && b.scrollWidth > b.clientWidth) b.scrollLeft += c.getBoundingClientRect().left - b.getBoundingClientRect().left - (b.clientWidth - c.offsetWidth) / 2; }); // aktiver Reiter bleibt sichtbar
    scalePreviews();
    syncUrl();
  }
  // Adresse = aktueller Reiter (+ Unterreiter, geöffnetes Profil): Neuladen bleibt hier, Links lassen sich weitergeben
  function syncUrl() {
    if (FRONT && document.getElementById('ffl-adm-wrap').hidden) return; // Verwaltung lädt im Hintergrund: Adresse der Mitgliederseite nicht anfassen
    try {
      var u = new URL(location.href);
      u.searchParams.set('page', 'myf'); u.searchParams.set('tab', ui.tab);
      var k = SUBKEY[ui.tab];
      if (k && ui[k]) u.searchParams.set('sub', ui[k]); else u.searchParams.delete('sub');
      if (ui.profile) u.searchParams.set('mitglied', ui.profile); else u.searchParams.delete('mitglied');
      var next = u.pathname + u.search + u.hash;
      if (next !== location.pathname + location.search + location.hash) history.replaceState(null, '', next);
    } catch (e) {}
  }
  (function () {
    // Beim Laden: Reiter/Unterreiter/Profil aus der Adresse übernehmen
    var qp = new URLSearchParams(location.search);
    if (qp.get('tab')) ui.tab = qp.get('tab');
    if (qp.get('sub') && SUBKEY[ui.tab]) ui[SUBKEY[ui.tab]] = qp.get('sub');
    if (+qp.get('mitglied')) ui.profile = +qp.get('mitglied');
  })();

  // ---- Übersicht -------------------------------------------------------------
  // ---- Ersteinrichtung (neue Installation): Name, Ort, Einheiten, Standort ------------
  function locateRow() {
    return '<div class="ffl-row"><input type="search" id="ffl-locq" class="ffl-grow" placeholder="Ort oder Anschrift des Gerätehauses suchen …" value="' + esc(ui.locQ || '') + '">' +
      '<button type="button" class="ffl-sm" data-act="locate">Suchen</button></div>' +
      (ui.locRes ? (ui.locRes.length ? '<div class="ffl-locres" id="ffl-locres">' + ui.locRes.map(function (r, i) {
        return '<button type="button" data-act="locpick" data-i="' + i + '"><b>' + esc(r.place || r.name.split(',')[0]) + '</b><span>' + esc(r.name) + '</span></button>';
      }).join('') + '</div>' : '<p class="ffl-mu">Nichts gefunden – anders schreiben oder Koordinaten von Hand eintragen.</p>') : '') +
      '<p class="ffl-src">Ortssuche: © OpenStreetMap-Mitwirkende (ODbL)</p>';
  }
  function unitsEditor() {
    var u = ui.units || (ui.units = (d.units_list || []).map(function (x) { return { key: x.key, label: x.label }; }));
    return '<div class="ffl-units">' + u.map(function (x, i) {
      return '<div class="ffl-row"><input type="text" data-unit="' + i + '" value="' + esc(x.label) + '" placeholder="z. B. Löschzug Mitte" class="ffl-grow">' +
        (u.length > 1 ? '<button type="button" class="ffl-q ffl-sm" data-act="unitdel" data-i="' + i + '" aria-label="Entfernen">✕</button>' : '') + '</div>';
    }).join('') + '<button type="button" class="ffl-q ffl-sm" data-act="unitadd">+ Einheit hinzufügen</button></div>';
  }
  function readUnits() {
    [].forEach.call(document.querySelectorAll('[data-unit]'), function (el) { ui.units[+el.getAttribute('data-unit')].label = el.value.trim(); });
    return ui.units.filter(function (x) { return x.label; });
  }
  function setupWizard() {
    var b = d.brand || {}, s = d.settings;
    function f(id, label, v, ph, cls) { return '<div' + (cls ? ' class="' + cls + '"' : '') + '><label class="ffl-fl" for="' + id + '">' + label + '</label><input type="text" id="' + id + '" value="' + esc(v || '') + '" placeholder="' + esc(ph || '') + '"></div>'; }
    return '<div class="ffl-setup"><div class="ffl-setup-h"><span>Willkommen bei ' + esc(APP) + '</span><b>Einmal einrichten – dauert zwei Minuten</b>' +
      '<p>Damit Ausdrucke, Dashboard, Wetter und Warnungen zu eurer Feuerwehr passen. Alles lässt sich später unter „Einstellungen“ ändern.</p></div>' +
      '<div class="ffl-setup-b"><div class="ffl-step"><i>1</i><div><div class="ffl-sh">Eure Feuerwehr</div><div class="ffl-form2">' +
      f('su-org', 'Name der Feuerwehr', b.org, 'Freiwillige Feuerwehr Musterstadt', 'span2') + f('su-place', 'Ort', b.place, 'Musterstadt') + f('su-zip', 'PLZ', b.zip, '12345') +
      f('su-address', 'Anschrift Gerätehaus', b.address, 'Feuerwehrstraße 1') + f('su-website', 'Website', b.website, 'feuerwehr-musterstadt.de') + '</div></div></div>' +
      '<div class="ffl-step"><i>2</i><div><div class="ffl-sh">Einheiten<em>Löschzüge / Löschgruppen</em></div>' + unitsEditor() +
      '<p class="ffl-mu">Nur eine Einheit? Dann einfach so lassen – die Auswahl wird dann nirgends angezeigt.</p></div></div>' +
      '<div class="ffl-step"><i>3</i><div><div class="ffl-sh">Standort des Gerätehauses<em>für Wetter, Warnungen, hell/dunkel</em></div>' + locateRow() +
      '<div class="ffl-form4" style="margin-top:8px">' + f('ffl-lat', 'Breite', s.screen_lat, '51.00') + f('ffl-lon', 'Länge', s.screen_lon, '9.00') +
      f('ffl-ars', 'Regionalschlüssel Kreis', s.screen_ars, '12 Ziffern', 'span2') + '</div></div></div></div>' +
      '<div class="ffl-row ffl-setup-f"><button type="button" class="ffl-p" data-act="setupsave">Einrichtung abschließen</button>' +
      '<span class="ffl-mu">Logo, Farben und Rechte: danach unter „Einstellungen“ bzw. „Mitglieder → Funktionen & Rechte“.</span></div></div>';
  }

  // Meine Aufgaben: eine Liste über alle Bereiche – Übersicht der Verwaltung und Mitgliederseite nutzen dieselben Regeln.
  // o.bookings / o.lead: diese Punkte zeigt die Mitgliederseite schon einzeln mit direkter Entscheidung.
  function adminTasks(o) {
    o = o || {};
    var newIdeas = d.ideas.filter(function (i) { return i.status === 'new'; }).length;
    var openCloth = d.clothing.filter(function (c) { return c.status === 'open'; }).length;
    var todo = [], wait = [];
    function td(tab, text, n, extra) { if (n && allowedTab(tab)) todo.push(taskRow(n, text, 'data-tab="' + tab + '"' + (extra || ''))); }
    // Wartet auf Entscheidung: jemand hat etwas angefragt und wartet auf eine Antwort – steht immer ganz oben (systemweit dieselbe Regel: offene Anfragen zuerst)
    function tw(tab, text, n, extra) { if (n && allowedTab(tab)) wait.push(taskRow(n, text, 'data-tab="' + tab + '"' + (extra || ''), true)); }
    if (!o.bookings) tw('vehicles', 'Fahrzeug-Anfragen warten auf Freigabe', (d.bookings || []).filter(function (b) { return b.status === 'requested'; }).length, ' data-vsub="bookings"');
    tw('incidents', 'Website-Berichte warten auf Freigabe', (d.incidents || []).filter(function (i) { return i.web && i.web.native && i.web.status !== 'publish'; }).length);
    tw('messages', 'Rückfragen von Mitgliedern unbeantwortet', (d.messages || []).filter(function (m) { return m.status === 'open'; }).length);
    tw('clothing', 'Kleidungswünsche offen', openCloth);
    tw('defects', 'neue Mängel noch nicht angesehen', d.defects.filter(function (x) { return x.status === 'new'; }).length);
    tw('ideas', 'neue Anregungen unbeantwortet', newIdeas);
    tw('courses', 'Lehrgangsteilnahmen bestätigen', d.to_confirm, ' data-gosub="plan"');
    var nCert = (d.participation || []).filter(function (p) { return p.cert === 'requested'; }).length;
    if (!o.lead) tw('incidents', nCert === 1 ? 'Bescheinigung für den Arbeitgeber angefragt' : 'Bescheinigungen für den Arbeitgeber angefragt', nCert, ' data-isub="cert"');
    td('members', (d.dupes || []).length === 1 ? 'doppeltes Mitglied – zusammenführen' : 'doppelte Mitglieder – zusammenführen', (d.dupes || []).length);
    // Offene Berichte: dieselbe Regel wie im Mitgliederbereich (vom Server: ab dem ersten Bericht im System, höchstens 60 Tage,
    // nicht abgeschlossen bzw. „anderweitig erfasst“, ohne Test-Einsätze) – Entwürfe zählen mit, bis sie abgeschlossen sind
    var noRep = (d.incidents || []).filter(function (i) { return i.report_due; }).sort(function (a, b) { return a.start < b.start ? -1 : 1; });
    var oldDays = noRep.length ? Math.floor((new Date(isoToday() + 'T12:00:00') - new Date(noRep[0].start.slice(0, 10) + 'T12:00:00')) / 864e5) : 0;
    // Berichte füllt man im Mitgliederbereich aus – der Hinweis führt direkt dorthin (wenn das Konto einem Mitglied zugeordnet ist)
    if (o.lead) { /* Berichte stehen auf der Mitgliederseite einzeln */ }
    else if (noRep.length && (d.who || {}).linked) todo.push(taskRow(noRep.length, (noRep.length === 1 ? 'Einsatzbericht offen' : 'Einsatzberichte offen') + (oldDays ? ' (ältester ' + (oldDays === 1 ? 'von gestern' : 'seit ' + oldDays + ' Tagen') + ')' : ''), '', false, esc(portalUrl(noRep.length === 1 ? 'ebericht=' + noRep[0].id : 'reiter=offen'))));
    else td('incidents', noRep.length === 1 ? 'Einsatzbericht offen' + (oldDays ? ' (seit ' + (oldDays === 1 ? 'gestern' : oldDays + ' Tagen') + ')' : ' (von heute)') : 'Einsatzberichte offen' + (oldDays ? ' (ältester ' + (oldDays === 1 ? 'von gestern' : 'seit ' + oldDays + ' Tagen') + ')' : ''), noRep.length);
    if (allowedTab('duties')) {
      var dAsg = group(d.duty_assign || [], 'slot_id'), dAct = {}; (d.duty_lists || []).forEach(function (l) { if (l.active) dAct[l.id] = 1; });
      td('dutylists', 'Abfragen: zu wenig Zusagen (14 Tage)', (d.duty_slots || []).filter(function (x) { return dAct[x.list_id] && x.min && x.date && x.date >= isoToday() && x.date <= addDays(isoToday(), 14) && (dAsg[x.id] || []).length < x.min; }).length);
    }
    td('members', 'Beförderungen möglich', (d.promotions || []).filter(function (p) { return p.ready; }).length);
    td('briefings', 'Unterweisungen ' + new Date().getFullYear() + ' noch nicht bestätigt', (d.briefings || []).filter(function (b) { return b.active && b.year === new Date().getFullYear(); }).reduce(function (n, b) { return n + (b.total - b.done); }, 0));
    td('members', 'erreichen bald die Altersgrenze', (d.retiring || []).length);
    if (d.asu_can) td('agt', (d.asu_missing || []).length === 1 ? 'Atemschutzüberwachung fehlt (Einsatz/Übung mit AGT)' : 'Atemschutzüberwachungen fehlen (Einsätze/Übungen mit AGT)', (d.asu_missing || []).length, ' data-asu-go="1"');
    if (d.can_agt) td('agt', 'Atemschutz: G26 oder Übungsstrecke fällig bzw. bald fällig', d.members.filter(function (m) { var a = m.active && agtState(m); return a && (!a.ready || a.soon); }).length, ' data-agt-go="people"');
    if (d.can_agt) td('agt', 'Prüfungen in der Atemschutzwerkstatt fällig', (d.devices || []).filter(function (x) { return (x.area || 'agt') === 'agt'; }).length ? (function () { ui.wsArea = 'agt'; return wsDueList().filter(function (x) { return x.state === 'over' || x.state === 'none'; }).length; })() : 0, ' data-asub="due"');
    if (allowedTab('orders')) {
      tw('orders', 'Karten-Vorschläge warten auf Freigabe', d.order_can_approve ? (d.order_menus || []).filter(function (m) { return m.status === 'pending'; }).length : 0);
    }
    td('teams', 'offene Team-Aufgaben', (d.team_tasks || []).filter(function (k) { return k.status === 'open'; }).length);
    return { wait: wait, todo: todo };
  }
  // Eine Zeile für jede Aufgabe, wie unter „Was steht an?“: links die Anzahl, in der Mitte was zu tun ist, rechts ein Knopf mit klarem Verb
  var TASK_VERB = [[/Fahrzeug-Anfrage/, 'Entscheiden'], [/Website-Bericht/, 'Prüfen'], [/Rückfrage|Anregung/, 'Antworten'], [/Kleidung/, 'Bearbeiten'], [/Lehrgang/, 'Bestätigen'],
    [/doppelt/, 'Zusammenführen'], [/Karten-Vorschl/, 'Prüfen'], [/Einsatzbericht/, 'Ausfüllen'], [/überwachung/, 'Nachtragen']];
  function taskRow(n, text, attrs, wait, href) {
    var v = (TASK_VERB.filter(function (x) { return x[0].test(text); })[0] || [0, 'Ansehen'])[1];
    return '<div class="ffl-todo' + (wait ? ' is-wait' : '') + '"><div class="ffl-day">' + n + '</div><div class="ffl-ct">' + esc(text) + '</div>' +
      (href ? '<a class="ffl-btn ffl-sm ffl-p" href="' + href + '">' + v + '</a>' : '<button type="button" class="ffl-sm ffl-p" ' + attrs + '>' + v + '</button>') + '</div>';
  }
  function tasksHtml(T) {
    function sec(title, rows) { return rows.length ? '<div class="ffl-sec" style="margin-top:6px"><div class="ffl-sh">' + title + '</div><div class="ffl-todos">' + rows.join('') + '</div></div>' : ''; }
    return sec('Wartet auf Antwort', T.wait) + sec('Zu erledigen', T.todo) + (T.wait.length || T.todo.length ? '' : '<div class="ffl-msg ok" style="margin-top:6px">Nichts Offenes in deinen Bereichen. 👍</div>');
  }
  function tabOverview() {
    var s = d.settings;
    if (ui.iYear) { ui.iYear = 0; reload(); } // Übersicht zählt immer mit den aktuellen 12 Monaten
    if (d.setup_needed) return setupWizard();
    var twoHint = d.twofa && !d.twofa.on && !d.security ? twofaBox() : '';
    var noLogin = d.members.filter(function (m) { return m.active && !m.last_login; }).length;
    var noAcc = d.members.filter(function (m) { return m.active && !m.user_id; }).length;
    var newIdeas = d.ideas.filter(function (i) { return i.status === 'new'; }).length;
    var openCloth = d.clothing.filter(function (c) { return c.status === 'open'; }).length;
    var agtDue = d.can_agt ? d.members.filter(function (m) { return m.active && m.agt && agtInfo(m).state !== 'ok'; }).length : 0;
    // Zu erledigen – über alle Bereiche, die man betreut
    // Reihenfolge: Überblick ganz oben, darunter die Aufgaben
    var h = '<div class="ffl-sec"><div class="ffl-sh">Überblick</div><div class="ffl-cards">';
    function card(go, sub, label, big, text, alert) {
      if (!allowedTab(go)) return '';
      return '<button type="button" class="ffl-card' + (alert ? ' is-alert' : '') + '" data-go="' + go + '"' + (sub ? ' data-gosub="' + sub + '"' : '') + '><span class="ffl-cl">' + label + '</span><span class="ffl-big' + (/^[\d\s/]*$/.test(String(big)) || /^\d/.test(String(big)) ? '' : ' ffl-big-sm') + '">' + big + '</span><span class="ffl-ct">' + text + '</span></button>';
    }
    h += card('courses', 'plan', 'Lehrgänge ' + s.year, s.open ? 'Wünsche laufen' : s.published ? 'Zugeteilt' : 'Planung', s.open ? 'Mitglieder tragen Wünsche ein' + (s.deadline ? ' bis ' + fmtDate(s.deadline) : '') : s.published ? 'Zuteilung für Mitglieder sichtbar' : 'Wünsche gesammelt – Termine und Zuteilung folgen');
    h += card('courses', 'plan', 'Teilnahme bestätigen', d.to_confirm, 'Zugeteilte bei vergangenen Terminen – „absolviert“ eintragen', d.to_confirm > 0);
    var openDef = d.defects.filter(function (x) { return x.status === 'new' || x.status === 'progress'; });
    var outDef = openDef.filter(function (x) { return x.urgency === 'out'; });
    h += card('defects', '', 'Mängel', openDef.length, outDef.length ? 'außer Dienst: ' + outDef.map(function (x) { return x.object; }).filter(function (o, i, a) { return a.indexOf(o) === i; }).join(', ') : 'offen, nichts außer Dienst', outDef.length > 0 || d.defects.some(function (x) { return x.status === 'new'; }));
    h += card('ideas', '', 'Anregungen', newIdeas, 'neu, noch nicht bearbeitet', newIdeas > 0);
    h += card('clothing', '', 'Kleidung', openCloth, 'offene Meldungen', openCloth > 0);
    var dtm = d.daytime || {};
    if (allowedTab('members')) h += card('members', '', 'Tagsüber erreichbar', dtm.total || 0, (dtm.total ? dtm.agt + ' AGT · ' + dtm.ma + ' Maschinist' + (dtm.ma === 1 ? '' : 'en') + ' · ' + (dtm.gf + dtm.zf) + ' Führung' : 'im Profil „tagsüber erreichbar“ ankreuzen lassen'), dtm.total > 0 && (dtm.agt < 4 || dtm.ma < 1));
    if (d.can_agt) {
      var agtsAll = d.members.filter(function (m) { return m.active && m.agt; }), agtReady = agtsAll.filter(function (m) { return agtState(m).ready; }).length;
      h += card('agt', '', 'Atemschutz', agtReady + '<small> / ' + agtsAll.length + '</small>', 'AGT einsatzbereit' + (agtsAll.length - agtReady ? ' · ' + (agtsAll.length - agtReady) + ' nicht (G26 / Übungsstrecke)' : ''), agtReady < agtsAll.length);
    }
    h += card('members', '', 'Mitglieder', d.members.filter(function (m) { return m.active; }).length, noAcc ? noAcc + ' ohne Konto · ' + noLogin + ' noch nie angemeldet' : noLogin + ' noch nie angemeldet', noAcc > 0);
    h += "</div></div>";
    // Keine Kachel erlaubt (z. B. Gruppenführer nur mit Einsätzen): leeren „Überblick“ weglassen
    h = h.replace('<div class="ffl-sec"><div class="ffl-sh">Überblick</div><div class="ffl-cards"></div></div>', '');
    h += tasksHtml(adminTasks()) + followupHtml();

    // Demo-Modus für Wehr- und LZ-Führung (ohne Hauptverwaltung) hier auf der Übersicht – die Hauptverwaltung hat ihn unter „Daten“
    if (!d.full && (d.demo || {}).can) twoHint = demoBox() + twoHint;
    if (!allowedTab('courses')) return h + twoHint;
    h += '<div class="ffl-sec"><div class="ffl-sh">Nächste Lehrgangstermine</div>';
    if (!d.upcoming.length) h += '<p class="ffl-mu">Noch keine Termine mit Datum eingetragen.</p>';
    d.upcoming.slice(0, 12).forEach(function (x) {
      // Klick: direkt zum Lehrgang in „Zuteilung & Teilnahme“ (aufgeklappt) – dort zuteilen, bestätigen, Termin ändern
      h += '<button type="button" class="ffl-ev ffl-ev-go" data-act="gocourse" data-id="' + x.course_id + '" data-v="' + x.year + '"><div class="ffl-day">' + esc(range(x)) + '</div><div style="flex:1"><b>' + esc(x.short ? x.short + ' – ' : '') + esc(x.title) + '</b><div class="ffl-mu">' + esc([x.location, x.slots ? x.assigned + ' von ' + x.slots + ' Plätzen vergeben' : x.assigned + ' zugeteilt'].filter(Boolean).join(' · ')) + '</div></div><i aria-hidden="true">→</i></button>';
    });
    return h + '</div>' + twoHint;
  }

  // ---- Status: gleiche Begriffe und Farben überall ------------------------------
  var STCLS = { open: 'st-open', assigned: 'st-ok', waiting: 'st-warn', declined: 'st-no', withdrawn: 'st-no', completed: 'st-done', missed: 'st-bad' };
  var STLABEL = { open: 'Gemeldet – offen', assigned: 'Zugeteilt', waiting: 'Warteliste', declined: 'Abgelehnt', withdrawn: 'Zurückgetreten',
    completed: 'Absolviert', missed: 'Nicht teilgenommen' };
  function chip(status, text) { return '<span class="ffl-chip ' + (STCLS[status] || 'st-open') + '">' + esc(text || STLABEL[status] || status) + '</span>'; }
  // Auswahl mit Gruppen „vor“ und „nach dem Lehrgang“
  function statusSelect(n, dates) {
    var cur = n.status === 'assigned' ? 'assigned:' + (n.date_id || '') : n.status;
    function o(v, l) { return '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>' + esc(l) + '</option>'; }
    var h = '<select data-f="status" aria-label="Status ändern"><optgroup label="Vor dem Lehrgang">' + o('open', 'Gemeldet – offen');
    dates.forEach(function (x) { h += o('assigned:' + x.id, 'Zugeteilt: ' + range(x) + (x.location ? ' ' + x.location : '')); });
    if (!dates.length || (n.status === 'assigned' && !n.date_id)) h += o('assigned:', 'Zugeteilt (Termin offen)');
    h += o('waiting', 'Warteliste') + o('declined', 'Abgelehnt') + '</optgroup><optgroup label="Nach dem Lehrgang">' +
      o('completed', 'Absolviert ✓') + o('missed', 'Nicht teilgenommen') + '</optgroup><optgroup label="Sonstiges">' + o('withdrawn', 'Zurückgetreten') + '</optgroup></select>';
    return h;
  }

  // ---- Lehrgänge: Jahr wählen, Ablauf, Unterbereiche ---------------------------
  function yearKind(y) { var s = d.settings; return y === s.year ? 'aktuell' : y < s.year ? 'Archiv' : 'Planung'; }

  function coursesSection() {
    var s = d.settings, tpl = ui.year === 0;
    if (tpl && d.year !== 0) return '<p class="ffl-mu" data-loading="1" style="margin-top:18px">Lade Vorlagen …</p>';
    if (tpl) {
      return '<div class="ffl-yearbar"><button type="button" class="ffl-sm" data-year="' + (ui.lastYear || s.year) + '">← zurück zu ' + (ui.lastYear || s.year) + '</button>' +
        '<b style="font-size:18px">Vorlagen</b><span class="ffl-mu">gelten für alle Jahre – daraus baust du jedes Lehrgangsjahr auf.</span></div>' + tabCourses();
    }
    var years = d.years.slice(); [s.year, ui.year].forEach(function (y) { if (y && years.indexOf(y) < 0) years.push(y); });
    years.sort(function (a, b) { return b - a; });
    // Unterbereiche oben wie in den anderen Bereichen – der Ablauf ist einer davon, nicht davor
    var cur = ui.year === s.year, toc = (d.to_confirm_by_year || {})[ui.year] || 0;
    var subs = (cur ? [['steps', 'Ablauf']] : []).concat([['plan', 'Zuteilung & Teilnahme' + (toc ? ' (' + toc + ')' : '')], ['courses', 'Lehrgangsliste'], ['print', 'Ausdrucke & Export'], ['materials', 'Unterlagen (' + (d.materials || []).length + ')']]);
    if (!subs.some(function (x) { return x[0] === ui.sub; })) ui.sub = cur ? 'steps' : 'plan';
    // Erst das Jahr (Zusammenhang), dann die Unterseiten dieses Jahres
    var tabsH = '<div class="ffl-subtabs">' + subs.map(function (x) {
      return '<button type="button" data-sub="' + x[0] + '" aria-selected="' + (ui.sub === x[0]) + '">' + x[1] + '</button>';
    }).join('') + '</div>';
    // Das gewählte Jahr steht groß vorn – alle Unterseiten gehören zu diesem Jahr, darum tragen sie es nicht mehr im Namen
    var h = '<div class="ffl-yearbar"><label class="ffl-yearnow" for="ffl-yearsel"><b>' + ui.year + '</b><span>' + (ui.year === s.year ? 'aktuelles Abfragejahr' : yearKind(ui.year)) + '</span></label>' +
      // Auswahl zeigt nur die anderen Jahre – das gewählte steht schon groß daneben
      (years.length > 1 ? '<select id="ffl-yearsel" aria-label="Lehrgangsjahr wechseln"><option value="" selected disabled>Jahr wechseln …</option>' + years.filter(function (y) { return y !== ui.year; }).map(function (y) {
        return '<option value="' + y + '">' + y + ' – ' + (y === s.year ? 'aktuelles Abfragejahr' : yearKind(y)) + '</option>';
      }).join('') + '</select>' : '') +
      '<button type="button" class="ffl-sm" data-act="newyear">+ Neues Jahr anlegen</button>' +
      '<button type="button" class="ffl-sm ffl-q" data-year="0">Vorlagen verwalten</button></div>' + tabsH;
    if (ui.newYear) h += newYearPanel();
    if (d.year !== ui.year) return h + '<p class="ffl-mu" data-loading="1" style="margin-top:18px">Lade ' + ui.year + ' …</p>';

    // Ein Satz je Unterseite: wofür sie da ist
    var INTRO = { steps: 'Links, was jetzt zu tun ist – rechts der ganze Weg vom Lehrgangswunsch bis zur bestätigten Teilnahme.',
      plan: 'Wer möchte welchen Lehrgang? Lehrgang anklicken, Plätze zuteilen – nach dem Termin hier die Teilnahme bestätigen.',
      courses: 'Alle Lehrgänge und Seminare ' + ui.year + ' mit Terminen, Plätzen und Kosten. Daraus wählen die Mitglieder ihre Wünsche.',
      print: 'Fertige Ausdrucke und Tabellen: Meldung an den Kreis, Teilnehmerlisten, Übersicht für die Kleiderkammer, CSV für Excel.',
      materials: 'Skripte, Videos und Links je Lehrgang – alle Mitglieder sehen sie im Mitgliederbereich unter „Unterlagen“, die eigenen Lehrgänge stehen oben.' };
    if (INTRO[ui.sub]) h += '<p class="ffl-mu ffl-intro">' + INTRO[ui.sub] + '</p>';
    if (cur) { if (ui.sub === 'steps') h += stepsHtml(); }
    else if (ui.year < s.year) h += '<div class="ffl-banner"><b>Archiv ' + ui.year + '</b> – alles bleibt erhalten. Du kannst hier weiter Teilnahmen bestätigen oder korrigieren. Mitglieder melden gerade für ' + s.year + '.</div>';
    else h += '<div class="ffl-banner"><b>Planung ' + ui.year + '</b> – Mitglieder sehen dieses Jahr noch nicht. ' +
      '<button type="button" class="ffl-sm" data-act="makecurrent">' + ui.year + ' zum aktuellen Abfragejahr machen</button></div>';

    return h + (ui.sub === 'steps' ? '' : ui.sub === 'plan' ? tabPlan() : ui.sub === 'print' ? tabPrint() : ui.sub === 'materials' ? tabMaterials() : tabCourses());
  }
  // ---- Schulungsunterlagen: je Lehrgang Dateien oder Links; Dateien erst beim Öffnen geladen ----------------
  function matKey(x) { return String(x || '').toLowerCase().replace(/[^a-z0-9äöüß]+/g, '').slice(0, 80); }
  function sizeTxt(b) { return !b ? '' : b > 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
  function tabMaterials() {
    var ms = d.materials || [], seen = {}, opts = [];
    (d.templates || []).concat(d.courses || []).forEach(function (c) { var k = matKey(c.short || c.title); if (k && !seen[k]) { seen[k] = 1; opts.push([k, (c.short ? c.short + ' – ' : '') + c.title]); } });
    opts.sort(function (a, b) { return a[1].localeCompare(b[1]); });
    var groups = {}; ms.forEach(function (m) { (groups[m.ckey] = groups[m.ckey] || { course: m.course, list: [] }).list.push(m); });
    var h = '<div class="ffl-pbox" style="margin-top:14px"><div class="ffl-sh">Unterlage ablegen</div><div class="ffl-form2">' +
      '<div><label class="ffl-fl">Lehrgang</label>' + sel([['', '– wählen –']].concat(opts), ui.matKey || '', 'id="ffl-matkey"') + '</div>' +
      '<div><label class="ffl-fl">Titel (optional)</label><input type="text" id="ffl-mattitle" placeholder="z. B. Skript Truppmann Teil 1"></div>' +
      '<div><label class="ffl-fl">Datei (höchstens ' + sizeTxt(d.mat_max) + ')</label><input type="file" id="ffl-matfile" accept="' + (d.mat_ext || []).map(function (e) { return '.' + e; }).join(',') + '"></div>' +
      '<div><label class="ffl-fl">… oder Link (Video, Cloud-Ordner)</label><input type="url" id="ffl-maturl" placeholder="https://…"></div></div>' +
      '<div class="ffl-row" style="margin-top:10px"><button type="button" class="ffl-p" data-act="matup">Ablegen</button><span class="ffl-mu" id="ffl-matstate">Große Videos am besten als Link – das schont den Server.</span></div></div>';
    h += Object.keys(groups).sort(function (a, b) { return groups[a].course.localeCompare(groups[b].course); }).map(function (k) {
      var g = groups[k];
      return '<div class="ffl-sec"><div class="ffl-sh">' + esc(g.course) + '<em>' + g.list.length + '</em></div><ul class="ffl-matlist">' + g.list.map(function (m) {
        return '<li><a href="' + esc(m.url) + '" target="_blank" rel="noopener"><span class="ffl-matext">' + esc(m.kind === 'link' ? 'Link' : (m.ext || 'Datei').toUpperCase()) + '</span><b>' + esc(m.title) + '</b></a>' +
          '<span class="ffl-mu">' + esc([sizeTxt(m.size), m.by, fmtDate(m.created)].filter(Boolean).join(' · ')) + '</span><button type="button" class="ffl-q ffl-sm" data-act="matdel" data-id="' + m.id + '" aria-label="Löschen">✕</button></li>';
      }).join('') + '</ul></div>';
    }).join('') || '<p class="ffl-mu" style="margin-top:14px">Noch keine Unterlagen.</p>';
    return h;
  }
  // Schnellzugriff unter dem Ablauf: die drei Arbeitsbereiche direkt als Kacheln
  function shortcuts() {
    var toc = (d.to_confirm_by_year || {})[ui.year] || 0, asg = d.needs.filter(isUsed).length;
    var t = function (sub, title, text, alert) { return '<button type="button" class="ffl-card' + (alert ? ' is-alert' : '') + '" data-sub="' + sub + '"><span class="ffl-cl">' + title + '</span>' + text + '</button>'; };
    return '<div class="ffl-sh" style="margin-top:22px">Direkt zu</div><div class="ffl-cards ffl-coursejump">' +
      t('plan', 'Zuteilung & Teilnahme', asg + ' zugeteilt' + (toc ? ' · ' + toc + ' Teilnahmen bestätigen' : ''), toc > 0) +
      t('courses', 'Lehrgangsliste ' + ui.year, d.courses.length + ' Lehrgänge – anlegen, aus Vorlagen, aus Excel') +
      t('print', 'Ausdrucke & Export', 'Meldung an den Kreis, Teilnehmerlisten, CSV/Excel') + '</div>';
  }

  function newYearPanel() {
    var next = Math.max.apply(null, d.years.concat([d.settings.year])) + 1;
    return '<div class="ffl-panel"><b style="font-size:17px">Neues Lehrgangsjahr anlegen</b>' +
      '<div class="ffl-row" style="margin-top:10px"><label class="ffl-fl" style="margin:0" for="ffl-ny">Jahr</label><input type="number" id="ffl-ny" value="' + next + '" style="width:110px"></div>' +
      '<div class="ffl-fl">Lehrgänge übernehmen aus</div>' +
      '<label class="ffl-row"><input type="radio" name="ffl-nysrc" value="tpl" checked> allen Vorlagen (' + d.templates.filter(function (c) { return !c.hidden; }).length + ' Lehrgänge)</label>' +
      (d.years.length ? '<label class="ffl-row"><input type="radio" name="ffl-nysrc" value="year"> dem Jahr ' + sel(d.years.map(function (y) { return [y, y]; }), d.years[0], 'id="ffl-nyfrom" style="width:auto;min-height:32px"') + ' (ohne Termine und Meldungen)</label>' : '') +
      '<label class="ffl-row"><input type="radio" name="ffl-nysrc" value="none"> keine – Liste leer lassen</label>' +
      '<label class="ffl-row" style="margin-top:10px"><input type="checkbox" id="ffl-nycur"> gleich zum aktuellen Abfragejahr machen (Eintragen der Wünsche bleibt zunächst gesperrt)</label>' +
      '<div class="ffl-row" style="margin-top:12px"><button type="button" class="ffl-p" data-act="createyear">Anlegen</button><button type="button" data-act="newyear">Abbrechen</button></div></div>';
  }

  // Der Ablauf eines Lehrgangsjahres – jeder Schritt mit Stand und passender Aktion
  function stepsHtml() {
    var s = d.settings, act = d.needs.filter(active), assigned = d.needs.filter(isUsed).length;
    var completed = d.needs.filter(function (n) { return n.status === 'completed'; }).length;
    var withDates = d.dates.filter(function (x) { return x.start; }).length;
    var conf = d.to_confirm_by_year || {}, mine = conf[ui.year] || 0;
    var others = Object.keys(conf).filter(function (y) { return +y !== ui.year && conf[y]; });
    var reporters = Object.keys(group(act, 'member_id'));
    var missing = d.members.filter(function (m) { return m.active && m.user_id && reporters.indexOf(String(m.id)) < 0; });
    var phase = !d.courses.length ? 1 : s.open ? 2 : !s.published ? (assigned || withDates ? 4 : 3) : 6;
    var steps = [
      [1, 'Lehrgänge festlegen', d.courses.length + ' Lehrgänge in der Liste', '<button type="button" class="ffl-sm" data-sub="courses">Lehrgangsliste</button>', d.courses.length > 0],
      [2, 'Wünsche sammeln', act.length + (act.length === 1 ? ' Wunsch' : ' Wünsche') + ' von ' + reporters.length + (reporters.length === 1 ? ' Person' : ' Personen'),
        '<label class="ffl-switch" title="Eingeschaltet: Mitglieder sehen die Lehrgangsliste und tragen ihre Wünsche ein. Nach der Frist ausschalten."><input type="checkbox" data-set="open"' + (s.open ? ' checked' : '') + '><span></span>' + (s.open ? 'Mitglieder können Wünsche eintragen' : 'Eintragen beendet') + '</label>' +
        '<span class="ffl-mu" style="font-size:13px">' + (s.open ? 'Nach der Frist ausschalten.' : 'Einschalten, um Wünsche zu sammeln.') + '</span>' +
        '<label class="ffl-due">Frist <input type="date" data-set="deadline" value="' + esc(s.deadline) + '"></label>' +
        // Begrüßungstext: steht für die Mitglieder oben unter „Lehrgänge“ (wird beim Verlassen des Feldes gespeichert)
        '<details style="margin-top:6px"' + (s.intro ? ' open' : '') + '><summary class="ffl-mu" style="cursor:pointer;font-size:13px">Hinweis für die Mitglieder' + (s.intro ? '' : ' (optional)') + '</summary>' +
        '<textarea data-set="intro" rows="3" style="margin-top:6px" placeholder="z. B. Bitte nur Lehrgänge wählen, die du auch sicher besuchen kannst. Fragen an …">' + esc(s.intro || '') + '</textarea></details>' +
        (missing.length && (s.open || act.length) ? '<button type="button" class="ffl-q ffl-sm" style="padding:0;margin-top:4px" data-act="missing">' + missing.length + ' noch ohne Wunsch – ' + (ui.showMissing ? 'ausblenden' : 'anzeigen') + '</button>' : ''), !s.open && act.length > 0],
      [3, 'An den Kreis melden', 'Anzahl + Namen je Lehrgang', '<button type="button" class="ffl-sm" data-act="gokreis">Meldung für den Kreis drucken</button>', phase > 3],
      [4, 'Termine & Zuteilung', withDates + ' Termine · ' + assigned + ' zugeteilt', '<button type="button" class="ffl-sm" data-sub="plan">Zuteilung bearbeiten</button>', s.published],
      [5, 'Zuteilung freigeben', s.published ? 'Mitglieder sehen ihre Zuteilung' : 'noch nicht sichtbar',
        '<label class="ffl-switch"><input type="checkbox" data-set="published"' + (s.published ? ' checked' : '') + '><span></span>für Mitglieder sichtbar</label>', s.published],
      [6, 'Teilnahme bestätigen', mine ? mine + (mine === 1 ? ' Teilnahme offen' : ' Teilnahmen offen') : completed ? completed + ' absolviert' : 'nach den Lehrgängen', mine ? '<button type="button" class="ffl-sm ffl-p" data-sub="plan">Jetzt bestätigen</button>' : '', s.published && !mine && completed > 0]
    ];
    var hint = others.length ? '<div class="ffl-banner" style="border-color:var(--warn);background:var(--tint-warn)">Noch zu bestätigen aus anderen Jahren: ' +
      others.map(function (y) { return '<button type="button" class="ffl-sm" data-year="' + y + '">' + y + ': ' + conf[y] + ' Teilnahmen</button>'; }).join(' ') + '</div>' : '';
    var miss = ui.showMissing && missing.length ? '<div class="ffl-pbox" style="margin-top:10px"><div class="ffl-row" style="justify-content:space-between"><b>' + missing.length + (missing.length === 1 ? ' Mitglied mit Konto hat' : ' Mitglieder mit Konto haben') + ' für ' + ui.year + ' noch keinen Wunsch eingetragen</b>' +
      '<a class="ffl-btn ffl-sm" href="mailto:?bcc=' + encodeURIComponent(missing.map(function (m) { return m.email; }).filter(Boolean).join(',')) + '&subject=' + encodeURIComponent('Lehrgangswünsche ' + ui.year + ' – bitte in ' + APP + ' eintragen') +
      '&body=' + encodeURIComponent('Hallo zusammen,\n\nbitte tragt eure Lehrgangswünsche für ' + ui.year + (s.deadline ? ' bis zum ' + fmtDate(s.deadline) : '') + ' in ' + APP + ' ein:\n' + d.link + '\n\nDanke!') + '">Erinnerung per E-Mail (BCC)</a></div>' +
      '<div class="ffl-chips" style="margin-top:8px">' + missing.map(function (m) { return '<a href="#" class="ffl-chip st-open" data-act="profile" data-id="' + m.id + '">' + esc(m.name) + '</a>'; }).join('') + '</div>' +
      '<p class="ffl-mu" style="margin:8px 0 0">Öffnet dein E-Mail-Programm mit allen Adressen in BCC – nichts wird automatisch verschickt.</p></div>' : '';
    // Cockpit: links der aktuelle Schritt groß (eine Zahl mit Bezug, die Aktion, die Einstellungen genau dieses Schritts),
    // rechts der Weg als schlanke Liste – erledigt, jetzt, danach. Keine sechs leeren Kästen mehr.
    var withAcc = d.members.filter(function (m) { return m.active && m.user_id; }).length;
    var dl = s.deadline ? Math.round((new Date(s.deadline + 'T12:00:00') - new Date(isoToday() + 'T12:00:00')) / 864e5) : null;
    var dlTxt = s.deadline ? 'Frist ' + fmtDate(s.deadline) + (dl === 0 ? ' – heute' : dl > 0 ? ' – in ' + dl + (dl === 1 ? ' Tag' : ' Tagen') : ' – seit ' + (-dl) + (dl === -1 ? ' Tag' : ' Tagen') + ' vorbei') : 'noch keine Frist gesetzt';
    function hero(kicker, title, big, ctx, lead, acts, set) {
      return '<section class="ffl-now"><span class="kicker">' + kicker + '</span><h3>' + title + '</h3>' +
        (big !== null ? '<div class="num"><b>' + big + '</b><span>' + ctx + '</span></div>' : '') + (lead ? '<p>' + lead + '</p>' : '') +
        (acts ? '<div class="acts">' + acts + '</div>' : '') + (set ? '<div class="set">' + set + '</div>' : '') + '</section>';
    }
    var H;
    if (phase === 1) H = hero('Schritt 1 von 6', 'Lehrgangsliste füllen', null, '', 'Für ' + ui.year + ' sind noch keine Lehrgänge in der Liste. Aus den Vorlagen übernehmen, die Bedarfsabfrage des Kreises aus Excel einfügen oder von Hand anlegen – daraus wählen die Mitglieder dann ihre Wünsche.',
      '<button type="button" class="ffl-p" data-sub="courses">Lehrgangsliste ' + ui.year + ' füllen</button>');
    else if (phase === 2) H = hero('Schritt 2 von 6 · läuft', 'Wünsche sammeln', act.length, (act.length === 1 ? 'Wunsch' : 'Wünsche') + ' von ' + reporters.length + ' der ' + withAcc + ' Mitglieder mit Konto · ' + dlTxt,
      'Mitglieder sehen die Lehrgangsliste und tragen ein, was sie ' + ui.year + ' machen möchten. Nach der Frist das Eintragen beenden – dann geht es mit der Meldung an den Kreis weiter.',
      '<button type="button" data-sub="plan">Wünsche ansehen</button>' + (missing.length ? '<button type="button" class="ffl-q" data-act="missing">' + missing.length + ' noch ohne Wunsch – ' + (ui.showMissing ? 'ausblenden' : 'anzeigen') + '</button>' : ''),
      '<label class="ffl-switch" title="Ausschalten, wenn die Frist vorbei ist – dann können Mitglieder nichts mehr eintragen."><input type="checkbox" data-set="open" checked><span></span>Eintragen offen</label>' +
      '<label class="ffl-due">Frist <input type="date" data-set="deadline" value="' + esc(s.deadline) + '"></label>' +
      '<details style="flex-basis:100%;margin-top:6px"' + (s.intro ? ' open' : '') + '><summary class="ffl-mu" style="cursor:pointer">Hinweis für die Mitglieder' + (s.intro ? '' : ' (optional)') + '</summary>' +
      '<textarea data-set="intro" rows="3" style="margin-top:6px" placeholder="z. B. Bitte nur Lehrgänge wählen, die du auch sicher besuchen kannst. Fragen an …">' + esc(s.intro || '') + '</textarea></details>');
    else if (phase === 3) H = hero('Schritt 3 von 6', 'An den Kreis melden', act.length, (act.length === 1 ? 'Wunsch' : 'Wünsche') + ' von ' + reporters.length + (reporters.length === 1 ? ' Person' : ' Personen') + ' – Eintragen ist beendet',
      'Die Meldung zählt je Lehrgang die Anzahl und nennt die Namen. Drucken oder als PDF an den Kreis geben. Sobald die Termine vom Kreis da sind, geht es mit der Zuteilung weiter.',
      '<button type="button" class="ffl-p" data-act="gokreis">Meldung für den Kreis drucken</button><button type="button" data-sub="plan">Zuteilung vorbereiten</button>',
      '<label class="ffl-switch"><input type="checkbox" data-set="open"><span></span>Eintragen wieder öffnen</label><span class="ffl-mu">falls noch Wünsche nachkommen</span>');
    else if (phase === 4) H = hero('Schritt 4 von 6', 'Termine eintragen & Plätze zuteilen', assigned, 'von ' + act.length + ' Wünschen zugeteilt · ' + withDates + (withDates === 1 ? ' Termin' : ' Termine') + ' eingetragen',
      'Je Lehrgang die Termine vom Kreis eintragen und die Plätze verteilen; wer keinen Platz bekommt, kommt auf die Warteliste. Wenn alles verteilt ist, die Zuteilung freigeben – erst dann sehen die Mitglieder, was sie bekommen haben.',
      '<button type="button" class="ffl-p" data-sub="plan">Zuteilung bearbeiten</button>',
      '<label class="ffl-switch"><input type="checkbox" data-set="published"><span></span>Zuteilung für Mitglieder freigeben</label><span class="ffl-mu">Schritt 5 – noch nicht sichtbar</span>');
    else H = hero('Schritt 6 von 6', mine ? 'Teilnahme bestätigen' : 'Lehrgangsjahr ' + ui.year + ' läuft', mine ? mine : completed, mine ? (mine === 1 ? 'Teilnahme offen – Lehrgang ist vorbei' : 'Teilnahmen offen – Lehrgänge sind vorbei') : (completed === 1 ? 'Teilnahme bestätigt' : 'Teilnahmen bestätigt') + ' · ' + assigned + ' zugeteilt',
      mine ? 'Nach jedem Lehrgang hier „absolviert“ oder „nicht teilgenommen“ eintragen – das landet in der Ausbildung des Mitglieds und zählt für Stunden und Jahresbericht.' : 'Die Zuteilung ist freigegeben. Nach jedem Lehrgang die Teilnahme bestätigen – Wehrwerk erinnert hier, sobald ein Termin vorbei ist.',
      (mine ? '<button type="button" class="ffl-p" data-sub="plan">Jetzt bestätigen</button>' : '<button type="button" data-sub="plan">Zuteilung & Teilnahme</button>') +
      (d.years.indexOf(ui.year + 1) < 0 ? '<button type="button" class="ffl-q" data-act="newyear">Nächstes Jahr vorbereiten</button>' : ''),
      '<label class="ffl-switch"><input type="checkbox" data-set="published" checked><span></span>Zuteilung für Mitglieder sichtbar</label>');
    var list = '<ol class="ffl-timeline">' + steps.map(function (x) {
      var done = x[4] && x[0] !== phase, now = x[0] === phase;
      var act2 = now ? '' : x[0] === 1 ? '<button type="button" class="ffl-q ffl-sm" data-sub="courses">Liste</button>' : x[0] === 3 ? '<button type="button" class="ffl-q ffl-sm" data-act="gokreis">Drucken</button>'
        : x[0] === 4 || x[0] === 6 ? '<button type="button" class="ffl-q ffl-sm" data-sub="plan">Öffnen</button>' : '';
      return '<li class="' + (done ? 'is-done' : now ? 'is-now' : 'is-next') + '"><span class="dot"><span>' + (done ? '✓' : x[0]) + '</span></span><span class="t"><b>' + x[1] + '</b><small>' + esc(now ? 'jetzt dran' : x[2]) + '</small></span>' + act2 + '</li>';
    }).join('') + '</ol>';
    return hint + '<div class="ffl-cockpit">' + H + list + '</div>' + miss;
  }

  // ---- Zuteilung & Teilnahme ---------------------------------------------------
  function stats(c, needs, dates) {
    var o = { open: 0, assigned: 0, waiting: 0, declined: 0, withdrawn: 0, completed: 0, missed: 0, slots: 0, all: 0 };
    needs.filter(function (x) { return x.course_id === c.id; }).forEach(function (x) { o[x.status]++; if (active(x)) o.all++; });
    (dates[c.id] || []).forEach(function (x) { o.slots += x.slots; });
    o.used = o.assigned + o.completed;
    return o;
  }

  function tabPlan() {
    if (!d.courses.length) return '<div class="ffl-msg">Für ' + ui.year + ' sind noch keine Lehrgänge in der Liste. <button type="button" class="ffl-sm ffl-p" data-sub="courses">Lehrgangsliste ' + ui.year + ' füllen</button></div>';
    var h = '<div class="ffl-row" style="margin-top:14px"><div class="ffl-pills" style="margin:0">' +
      '<button type="button" data-act="pview" data-v="course" aria-pressed="' + (ui.pview !== 'person') + '">Nach Lehrgang</button>' +
      '<button type="button" data-act="pview" data-v="person" aria-pressed="' + (ui.pview === 'person') + '">Nach Person</button></div>' +
      (ui.pview !== 'person' ? '<label class="ffl-row ffl-mu" style="margin-left:auto"><input type="checkbox" id="ffl-onlyreq"' + (ui.onlyReq !== false ? ' checked' : '') + '> nur Lehrgänge mit Wünschen</label>' : '') + '</div>' +
      // Legende (keine Knöpfe): was die Farben in den Zeilen bedeuten
      '<div class="ffl-legend"><span class="ffl-mu">Farben:</span>' + ['open', 'assigned', 'waiting', 'declined', 'completed', 'missed', 'withdrawn'].map(function (k) { return chip(k); }).join('') + '</div>';
    return h + confirmBox() + (ui.pview === 'person' ? planByPerson() : planByCourse());
  }
  // Zugeteilt und der Termin ist vorbei: Teilnahme bestätigen – oben in jeder Ansicht, mit direkten Knöpfen
  function pastPending(n, dateById) { var dt = n.status === 'assigned' && n.date_id && dateById[n.date_id]; return !!(dt && dt.start && (dt.end || dt.start) < isoToday()); }
  function confirmBox() {
    var courseById = by(d.courses, 'id'), dateById = by(d.dates, 'id'), mem = by(d.members, 'id');
    var list = d.needs.filter(function (n) { return pastPending(n, dateById); });
    var other = Object.keys(d.to_confirm_by_year || {}).filter(function (y) { return +y !== ui.year && d.to_confirm_by_year[y]; });
    if (!list.length && !other.length) return '';
    return '<div class="ffl-msg warn ffl-confirmbox" style="margin-top:12px"><b>' + (list.length === 1 ? '1 Teilnahme bestätigen' : list.length + ' Teilnahmen bestätigen') + '</b>' +
      (list.length ? ' – der Lehrgang ist vorbei. Bitte eintragen, ob teilgenommen wurde (zählt für Ausbildung, Stunden und Jahresbericht).' : '') +
      list.map(function (n) {
        var c = courseById[n.course_id] || {}, m = mem[n.member_id] || { name: '(gelöscht)' };
        return '<div class="ffl-row" style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(0,0,0,.08)"><span style="flex:1 1 220px"><b>' + esc(m.name) + '</b> · ' + esc(c.short || c.title || '') + ' <span class="ffl-mu">' + esc(range(dateById[n.date_id])) + '</span></span>' +
          '<button type="button" class="ffl-sm ffl-p" data-act="needdone" data-v="completed" data-id="' + n.id + '">Absolviert</button><button type="button" class="ffl-sm" data-act="needdone" data-v="missed" data-id="' + n.id + '">Nicht teilgenommen</button></div>';
      }).join('') +
      (other.length ? '<div style="margin-top:8px">Weitere offen in ' + other.map(function (y) { return '<button type="button" class="ffl-sm" data-act="cyear" data-v="' + y + '">' + y + ' (' + d.to_confirm_by_year[y] + ')</button>'; }).join(' ') + '</div>' : '') + '</div>';
  }

  function planByCourse() {
    var dates = group(d.dates, 'course_id'), mem = by(d.members, 'id'), h = '', shown = 0;
    Object.keys(d.cats).forEach(function (cat) {
      var list = d.courses.filter(function (c) { return c.cat === cat && (ui.onlyReq === false || d.needs.some(function (n) { return n.course_id === c.id; }) || (dates[c.id] || []).length || ui.open === c.id); });
      if (!list.length) return;
      h += '<div class="ffl-group">' + esc(d.cats[cat]) + '</div>';
      list.forEach(function (c) {
        var st = stats(c, d.needs, dates), open = ui.open === c.id; shown++;
        var chips = ['open', 'assigned', 'waiting', 'completed', 'missed', 'declined', 'withdrawn'].filter(function (k) { return st[k]; })
          .map(function (k) { return chip(k, st[k] + ' ' + STLABEL[k].replace('Gemeldet – offen', 'offen').toLowerCase()); }).join('');
        h += '<div class="ffl-acard' + (open ? ' is-open' : '') + '"><button type="button" class="ffl-ahead" data-act="opencourse" data-id="' + c.id + '">' +
          '<span class="ffl-short">' + esc(c.short || c.nr) + '</span><span class="ffl-ct"><b>' + esc(c.title) + '</b>' +
          '<span class="ffl-mu">' + esc((dates[c.id] || []).map(function (x) { return range(x) + ' ' + x.location; }).join(' · ') || 'noch kein Termin') + '</span></span>' +
          '<span class="ffl-chips" style="justify-content:flex-end">' + (chips || '<span class="ffl-mu">keine Meldungen</span>') +
          (st.slots ? '<span class="ffl-chip ' + (st.used > st.slots ? 'st-bad' : 'st-open') + '">Plätze ' + st.used + '/' + st.slots + '</span>' : '') + '</span></button>';
        if (open) h += courseBody(c, dates[c.id] || [], mem);
        h += '</div>';
      });
    });
    if (!shown) h += '<p class="ffl-mu" style="margin-top:14px">Noch keine Meldungen. Haken „nur Lehrgänge mit Wünschen“ entfernen, um alle zu sehen.</p>';
    return h;
  }

  function needRow(n, m, dates) {
    return '<div class="ffl-arow" data-row="need" data-id="' + n.id + '">' +
      '<div><a href="#" data-act="profile" data-id="' + n.member_id + '"><b>' + esc(memberName(m)) + '</b></a></div>' +
      '<div>' + (m ? esc(unitShort(m.unit)) : '') + '</div><div class="c">' + esc(n.comment) + '</div>' +
      '<div>' + statusSelect(n, dates) + '</div>' +
      '<div><input type="text" data-f="admin_note" value="' + esc(n.admin_note) + '" placeholder="Hinweis fürs Mitglied"></div>' +
      '<div><button type="button" class="ffl-q ffl-sm" data-act="delneed" data-id="' + n.id + '" title="Meldung löschen">✕</button></div></div>';
  }

  function courseBody(c, dates, mem) {
    var now = isoToday();
    var needs = d.needs.filter(function (n) { return n.course_id === c.id; });
    needs.sort(function (a, b) {
      var A = mem[a.member_id], B = mem[b.member_id];
      return (unitIdx(A && A.unit) - unitIdx(B && B.unit)) || memberName(A).localeCompare(memberName(B));
    });
    var h = '<div class="ffl-abody">';

    // 1. Termine vom Kreis: je Termin eine Karte mit Zeitraum, Ort, Plätzen, Art (Tagesdienst?) und Ablauf (einzelne Tage)
    h += '<div class="ffl-csec"><div class="ffl-csec-h"><span class="n">1</span><b>Termine vom Kreis</b><span class="ffl-mu">Zeitraum, Ort und Plätze – danach den Ablauf mit Uhrzeiten</span></div>';
    h += dates.map(function (x) { return dateCard(c, x); }).join('');
    if (ui.newDate === c.id) h += '<div class="ffl-dcard is-new"><div class="ffl-dcard-top">' +
      '<div><label class="ffl-fl">von</label><input type="date" id="ffl-nd-start"></div><div><label class="ffl-fl">bis</label><input type="date" id="ffl-nd-end"></div>' +
      '<div class="grow"><label class="ffl-fl">Ort</label><input type="text" id="ffl-nd-loc" list="ffl-loc-l" placeholder="z. B. Kreisstadt, FTZ">' + sug('ffl-loc-l', (d.dates || []).map(function (x) { return x.location; }).concat([c.locations])) + '</div>' +
      '<div><label class="ffl-fl">Plätze</label><input type="number" id="ffl-nd-slots" min="0" value="1" style="width:80px"></div></div>' +
      '<div class="ffl-row" style="margin-top:10px"><button type="button" class="ffl-p" data-act="ndsave" data-id="' + c.id + '">Termin speichern</button><button type="button" data-act="ndcancel">Abbrechen</button>' +
      '<span class="ffl-mu">Den Ablauf (welche Tage, welche Uhrzeiten) trägst du danach ein.</span></div></div>';
    else h += '<button type="button" class="ffl-sm" style="margin-top:8px" data-act="adddate" data-id="' + c.id + '">+ Termin vom Kreis eintragen</button>';
    h += '</div>';

    // 2. Wer geht hin? – gruppiert nach Termin und Status
    h += '<div class="ffl-csec"><div class="ffl-csec-h"><span class="n">2</span><b>Wer geht hin?</b><span class="ffl-mu">Bei „Gemeldet – noch offen“ im Auswahlfeld den Termin wählen = zugeteilt</span></div>';
    var placed = {};
    dates.forEach(function (x) {
      var g = needs.filter(function (n) { return n.date_id === x.id && (n.status === 'assigned' || n.status === 'completed' || n.status === 'missed'); });
      g.forEach(function (n) { placed[n.id] = 1; });
      var used = g.filter(isUsed).length, pending = g.filter(function (n) { return n.status === 'assigned'; }).length, past = x.start && (x.end || x.start) < now;
      h += '<div class="ffl-agroup"><div class="h">' + chip('assigned', 'Termin') + '<b>' + esc(range(x) || 'ohne Datum') + (x.location ? ' · ' + esc(x.location) : '') + '</b>' +
        '<span class="ffl-chip ' + (used > x.slots ? 'st-bad' : 'st-open') + '">' + used + ' von ' + x.slots + ' Plätzen</span>' +
        (past && pending ? '<button type="button" class="ffl-sm ffl-p" style="margin-left:auto" data-act="completedate" data-id="' + x.id + '">' + (pending === 1 ? 'Als absolviert eintragen' : 'Alle ' + pending + ' als absolviert eintragen') + '</button>' : '') + '</div>' +
        (g.length ? g.map(function (n) { return needRow(n, mem[n.member_id], dates); }).join('') : '<div class="ffl-arow"><span class="ffl-mu">Noch niemand zugeteilt – unten bei „Gemeldet – offen“ den Termin auswählen.</span></div>') + '</div>';
    });
    [['assigned', 'Zugeteilt, Termin noch offen'], ['open', 'Gemeldet – noch nicht entschieden'], ['waiting', 'Warteliste'],
      ['completed', 'Absolviert (ohne Termin)'], ['missed', 'Nicht teilgenommen (ohne Termin)'], ['declined', 'Abgelehnt'], ['withdrawn', 'Zurückgetreten']].forEach(function (gdef) {
      var g = needs.filter(function (n) { return !placed[n.id] && n.status === gdef[0]; });
      if (!g.length) return;
      h += '<div class="ffl-agroup"><div class="h">' + chip(gdef[0], gdef[1]) + '<span class="ffl-mu">' + g.length + '</span></div>' +
        g.map(function (n) { return needRow(n, mem[n.member_id], dates); }).join('') + '</div>';
    });
    if (!needs.length) h += '<p class="ffl-mu">Noch niemand hat sich diesen Lehrgang gewünscht.</p>';

    var taken = {}; needs.forEach(function (n) { taken[n.member_id] = 1; });
    var free = d.members.filter(function (m) { return m.active && !taken[m.id]; });
    h += '<div class="ffl-row" style="margin-top:12px">' + memberPicker('ffl-addneed-' + c.id, free, 'Mitglied nachtragen – Name tippen …') +
      '<button type="button" class="ffl-sm" data-act="addneed" data-id="' + c.id + '">Hinzufügen</button></div>';
    return h + '</div></div>';
  }

  // ---- Termin eines Lehrgangs: Kopf + Ablauf (einzelne Tage mit Uhrzeit) -----------------
  var WDS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  function dAdd(iso, n) { var t = new Date(iso + 'T12:00:00'); t.setDate(t.getDate() + n); return t.toISOString().slice(0, 10); }
  function wdOf(iso) { return new Date(iso + 'T12:00:00').getDay(); }
  // Tagesdienst = mindestens ein Werktag (Mo–Fr), der vor 16 Uhr beginnt (Freistellung beim Arbeitgeber nötig)
  function dayAuto(ses) { return !ses.length ? '' : ses.some(function (x) { var w = wdOf(x.d); return w >= 1 && w <= 5 && (!x.f || x.f < '16:00'); }) ? 'tag' : 'abend'; }
  var DAYTXT = { tag: 'Tagesdienst', abend: 'abends & Wochenende' };
  function sesLabel(x) { return WDS[wdOf(x.d)] + ' ' + fmtDate(x.d).slice(0, 6) + (x.f ? ' ' + x.f + (x.t ? '–' + x.t : '') : ''); }
  function dateCard(c, x) {
    var ses = x.sessions || [], auto = dayAuto(ses), eff = x.daytime || auto, pick = (ui.sesDate || {})[x.id] || (ses.length ? dAdd(ses[ses.length - 1].d, 1) : x.start || '');
    var tpls = d.session_tpls || [];
    var h = '<div class="ffl-dcard" data-row="date" data-id="' + x.id + '" data-course="' + c.id + '"><div class="ffl-dcard-top">' +
      '<div><label class="ffl-fl">von</label><input type="date" data-f="start" value="' + esc(x.start || '') + '"></div>' +
      '<div><label class="ffl-fl">bis</label><input type="date" data-f="end" value="' + esc(x.end || '') + '"></div>' +
      '<div class="grow"><label class="ffl-fl">Ort</label><input type="text" data-f="location" list="ffl-loc-l2" value="' + esc(x.location) + '" placeholder="z. B. Kreisstadt, FTZ">' + sug('ffl-loc-l2', (d.dates || []).map(function (y) { return y.location; })) + '<input type="hidden" data-f="period" value="' + esc(x.period) + '"></div>' +
      '<div><label class="ffl-fl">Plätze</label><input type="number" min="0" data-f="slots" value="' + x.slots + '" style="width:80px"></div>' +
      '<div><label class="ffl-fl">Art</label><select data-f="daytime" style="width:auto">' +
        '<option value=""' + (!x.daytime ? ' selected' : '') + '>automatisch' + (auto ? ': ' + DAYTXT[auto] : '') + '</option>' +
        '<option value="tag"' + (x.daytime === 'tag' ? ' selected' : '') + '>Tagesdienst</option><option value="abend"' + (x.daytime === 'abend' ? ' selected' : '') + '>abends & Wochenende</option></select></div>' +
      '<button type="button" class="ffl-q ffl-sm ffl-dcard-del" data-act="deldate" data-id="' + x.id + '" title="Termin löschen">✕</button></div>';
    // Ablauf
    h += '<div class="ffl-ses"><div class="ffl-ses-h"><b>Ablauf</b>' + (eff ? '<span class="ffl-chip ' + (eff === 'tag' ? 'st-warn' : 'st-open') + '">' + DAYTXT[eff] + (eff === 'tag' ? ' – Freistellung beim Arbeitgeber' : '') + '</span>' : '') +
      '<span class="ffl-mu">' + (ses.length ? ses.length + (ses.length === 1 ? ' Tag' : ' Tage') : 'noch keine Tage – unten Datum wählen und Uhrzeit antippen') + '</span></div>';
    if (ses.length) h += '<div class="ffl-chips">' + ses.map(function (y, i) {
      return '<span class="ffl-chip st-open ffl-sesch">' + esc(sesLabel(y)) + ' <a href="#" data-act="sesdel" data-id="' + x.id + '" data-v="' + i + '" aria-label="Tag entfernen" style="text-decoration:none">✕</a></span>';
    }).join('') + '</div>';
    h += '<div class="ffl-ses-add"><input type="date" data-sesdate="' + x.id + '" value="' + esc(pick) + '" aria-label="Datum">' + (pick ? '<b class="ffl-mu">' + WDS[wdOf(pick)] + '</b>' : '') +
      [['18:00', '22:00', 'Abend 18–22'], ['08:00', '17:00', 'Ganztag 8–17'], ['08:00', '12:00', '8–12'], ['13:00', '17:00', '13–17']].map(function (p) {
        return '<button type="button" class="ffl-sm" data-act="sesadd" data-id="' + x.id + '" data-v="' + p[0] + '-' + p[1] + '">+ ' + p[2] + '</button>';
      }).join('') +
      '<button type="button" class="ffl-sm" data-act="sesweekend" data-id="' + x.id + '" title="Freitag 18–22 und Samstag 8–17">+ Wochenende (Fr 18–22, Sa 8–17)</button>' +
      '<span class="ffl-ses-own"><input type="time" data-sesf="' + x.id + '" aria-label="von"><span>–</span><input type="time" data-sest="' + x.id + '" aria-label="bis"><button type="button" class="ffl-sm" data-act="sesown" data-id="' + x.id + '">+</button></span></div>' +
      '<div class="ffl-ses-tpl">' + (tpls.length ? sel([['', 'Ablauf-Muster anwenden (ab dem gewählten Datum) …']].concat(tpls.map(function (t, i) { return [i, t.name + ' (' + t.items.length + ' Tage)']; })), '', 'data-sestpl="' + x.id + '" style="width:auto"') : '') +
      (ses.length ? '<button type="button" class="ffl-q ffl-sm" data-act="sessavetpl" data-id="' + x.id + '">Diesen Ablauf als Muster speichern</button>' : '') +
      (ses.length ? '<button type="button" class="ffl-q ffl-sm" data-act="sesclear" data-id="' + x.id + '">alle Tage entfernen</button>' : '') + '</div></div>';
    return h + '</div>';
  }
  function sesSave(id, ses, note) { return post('date', { id: id, sessions: ses }, note || 'Ablauf gespeichert.'); }
  function sesOf(id) { return ((by(d.dates, 'id')[id] || {}).sessions || []).slice(); }
  function sesPick(id) { var el = root.querySelector('[data-sesdate="' + id + '"]'); return el ? el.value : ''; }

  // Alle Meldungen des Jahres je Person
  function planByPerson() {
    var courseById = by(d.courses, 'id'), dateById = by(d.dates, 'id'), byMember = group(d.needs, 'member_id');
    var list = d.members.filter(function (m) { return byMember[m.id]; });
    if (!list.length) return '<p class="ffl-mu" style="margin-top:14px">Noch keine Meldungen für ' + ui.year + '.</p>';
    return '<table class="ffl-table" style="margin-top:12px"><thead><tr><th style="width:220px">Name</th><th style="width:70px">Einheit</th><th>Lehrgänge ' + ui.year + '</th></tr></thead><tbody>' +
      list.map(function (m) {
        return '<tr><td><a href="#" data-act="profile" data-id="' + m.id + '"><b>' + esc(m.name) + '</b></a></td><td>' + esc(unitShort(m.unit)) + '</td><td><div class="ffl-chips">' +
          byMember[m.id].map(function (n) {
            var c = courseById[n.course_id], dt = n.date_id && dateById[n.date_id];
            if (c && pastPending(n, dateById)) return '<span class="ffl-chip st-warn" title="Lehrgang vorbei – oben bestätigen">' + esc((c.short || c.title) + ' · Teilnahme bestätigen ' + range(dt)) + '</span>';
            return c ? chip(n.status, (c.short || c.title) + ' · ' + STLABEL[n.status].replace('Gemeldet – offen', 'offen') + (dt && isUsed(n) ? ' ' + range(dt) : '')) : '';
          }).join('') + '</div></td></tr>';
      }).join('') + '</tbody></table>';
  }

  // ---- Lehrgänge -------------------------------------------------------------
  function tabCourses() {
    var tpl = ui.year === 0;
    var h = '<div class="ffl-row" style="margin-top:14px">' +
      '<button type="button" class="ffl-p" data-act="newcourse">' + (tpl ? '+ Vorlage' : '+ Lehrgang') + '</button>' +
      (tpl ? '' : '<button type="button" data-act="toggletpl"' + (d.templates.length ? '' : ' disabled title="Noch keine Vorlagen gespeichert"') + '>Aus Vorlagen …</button>') +
      '<button type="button" data-act="toggleimport">Aus Excel einfügen</button>';
    var other = d.years.filter(function (y) { return y !== ui.year; });
    if (!tpl && other.length) h += '<span class="ffl-mu" style="margin-left:12px">Aus Jahr</span>' + sel(other.map(function (y) { return [y, y]; }), other[0], 'id="ffl-copyfrom" class="ffl-auto" style="width:auto"') +
      '<button type="button" data-act="copyyear">übernehmen</button>';
    if (!tpl && d.courses.length) h += '<button type="button" class="ffl-q" style="margin-left:auto" data-act="alltotpl">Alle als Vorlagen speichern</button>';
    if (d.courses.length) h += '<button type="button" class="ffl-sm" data-act="cdelsel" id="ffl-cdelsel" disabled' + (tpl ? ' style="margin-left:auto"' : '') + '>Ausgewählte entfernen</button>';
    if (tpl) h += '<button type="button" style="margin-left:auto" data-act="seedtpl">Standard-Vorlagen ergänzen</button>';
    h += '</div>';

    if (ui.tplOpen && !tpl) h += tplPanel();
    if (ui.importOpen) h += importPanel();
    if (ui.edit) h += courseForm(ui.edit);

    if (!d.courses.length) return h + '<div class="ffl-msg">' + (tpl
      ? 'Noch keine Vorlagen. Lege sie hier an oder speichere die Lehrgänge eines Jahres mit „Alle als Vorlagen speichern“.'
      : 'Noch keine Lehrgänge für ' + ui.year + '. Am schnellsten: „Aus Vorlagen …“ oder Zeilen aus der Bedarfsabfrage-Tabelle des Kreises über „Aus Excel einfügen“ übernehmen.') + '</div>';
    Object.keys(d.cats).forEach(function (cat) {
      var list = d.courses.filter(function (c) { return c.cat === cat; });
      if (!list.length) return;
      h += '<div class="ffl-group">' + esc(d.cats[cat]) + '</div><div class="ffl-scroll"><table class="ffl-table"><thead><tr><th class="sel"><input type="checkbox" data-cselall="' + esc(cat) + '" aria-label="alle in dieser Gruppe auswählen"></th><th>Nr.</th><th>Kurz</th><th>Bezeichnung</th><th>Tage</th><th>UE</th><th>Orte</th><th>Voraussetzungen</th><th>Kosten</th><th></th></tr></thead><tbody>';
      list.forEach(function (c) {
        h += '<tr' + (c.hidden ? ' class="is-off"' : '') + '><td class="sel"><input type="checkbox" data-csel="' + c.id + '" data-ccat="' + esc(cat) + '" aria-label="auswählen"></td><td>' + esc(c.nr) + '</td><td style="white-space:nowrap"><b>' + esc(c.short) + '</b></td><td>' + esc(c.title) + (c.hidden ? ' <span class="ffl-tag" title="Steht in der Liste, wird Mitgliedern aber nicht angeboten – z. B. weil der Kreis ihn dieses Jahr nicht anbietet. Unter „Bearbeiten“ wieder einblenden.">für Mitglieder ausgeblendet</span>' : '') + '</td>' +
          '<td>' + esc(c.days) + '</td><td>' + esc(c.ue) + '</td><td>' + esc(c.locations) + '</td><td class="ffl-mu">' + esc(c.prereq) + '</td>' +
          '<td style="white-space:nowrap">' + euro(c.cost) + '</td><td style="white-space:nowrap"><button type="button" class="ffl-sm" data-act="editcourse" data-id="' + c.id + '">Bearbeiten</button>' +
          (tpl ? '' : ' <button type="button" class="ffl-q ffl-sm" data-act="totpl" data-id="' + c.id + '" title="Als Vorlage speichern">→ Vorlage</button>') + '</td></tr>';
      });
      h += '</tbody></table></div>';
    });
    return h;
  }

  // Vorlagen auswählen und ins Jahr übernehmen
  function tplPanel() {
    var have = {}; d.courses.forEach(function (c) { have[c.nr + '|' + c.title] = 1; });
    var n = Object.keys(ui.tplSel).filter(function (k) { return ui.tplSel[k]; }).length;
    var h = '<div class="ffl-msg" style="background:var(--paper);border:1px solid var(--ink);border-left-width:3px">' +
      '<b style="font-size:17px">Vorlagen für ' + ui.year + ' übernehmen</b>' +
      '<p class="ffl-mu">Auswählen, übernehmen, danach im Jahr Orte, Kosten und Termine anpassen. Schon vorhandene Lehrgänge werden mit der Vorlage überschrieben. Die Kosten in den Standard-Vorlagen sind Stand 2026 – bitte prüfen.</p>' +
      '<div class="ffl-row"><button type="button" class="ffl-sm" data-act="tplall">Alle auswählen</button><button type="button" class="ffl-sm ffl-q" data-act="tplnone">Keine</button></div>';
    Object.keys(d.cats).forEach(function (cat) {
      var list = d.templates.filter(function (c) { return c.cat === cat; });
      if (!list.length) return;
      h += '<div class="ffl-group" style="margin-top:14px">' + esc(d.cats[cat]) + '</div>';
      list.forEach(function (c) {
        h += '<label class="ffl-row" style="padding:4px 0"><input type="checkbox" data-tpl="' + c.id + '"' + (ui.tplSel[c.id] ? ' checked' : '') + '> <b>' + esc(c.short) + '</b> ' + esc(c.title) +
          (have[c.nr + '|' + c.title] ? ' <span class="ffl-tag">schon im Jahr</span>' : '') + '</label>';
      });
    });
    return h + '<div class="ffl-row" style="margin-top:12px"><button type="button" class="ffl-p" data-act="tpladd"' + (n ? '' : ' disabled') + '>' + n + ' übernehmen</button>' +
      '<button type="button" data-act="toggletpl">Schließen</button></div></div>';
  }

  // ---- Atemschutz ------------------------------------------------------------
  function isoToday() { var t = new Date(); return t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2); }
  function addDays(iso, n) { var p = iso.split('-'); var t = new Date(Date.UTC(+p[0], p[1] - 1, +p[2] + n)); return t.toISOString().slice(0, 10); }
  function agtInfo(m) {
    var now = isoToday(), log = d.agt_log.filter(function (l) { return l.member_id === m.id; });
    function last(kind) { return log.filter(function (l) { return l.kind === kind && l.date <= now; })[0]; }
    var planned = log.filter(function (l) { return l.kind === 'strecke' && l.date > now; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; })[0];
    var st = last('strecke'), due = st ? addDays(st.date, 365) : null;
    var state = !st ? 'none' : due < now ? 'over' : due < addDays(now, 60) ? 'soon' : 'ok';
    var g = m.g26_until, gstate = !g ? 'none' : g < now ? 'over' : g < addDays(now, 60) ? 'soon' : 'ok';
    return { strecke: st, due: due, state: state, planned: planned, unterweisung: last('unterweisung'), g26: g, gstate: gstate, log: log };
  }
  function dueTag(state, text) {
    return state === 'over' ? '<span class="ffl-tag err">' + text + '</span>' : state === 'soon' ? '<span class="ffl-tag warn">' + text + '</span>'
      : state === 'none' ? '<span class="ffl-mu">–</span>' : '<span>' + text + '</span>';
  }

  // ---- Daten: Export, Import, Kalender, Sicherung --------------------------------------
  // Spalten-Erkennung für Importe (Überschriften wie in Excel, Groß/Klein und Leerzeichen egal)
  var IMPORTS = {
    quals: { title: 'Ausbildung nachtragen (frühere Lehrgänge)', area: 'courses', cols: { last: ['nachname'], first: ['vorname'], name: ['name'], title: ['lehrgang', 'ausbildung', 'titel'], short: ['kurz', 'kürzel'], year: ['jahr'], date: ['datum', 'am', 'bis'], note: ['bemerkung', 'ort'] }, need: ['title'] },
    g26: { title: 'Atemschutz: G26 & letzte Übungsstrecke', area: 'agt', cols: { last: ['nachname'], first: ['vorname'], name: ['name'], g26: ['g26', 'g26gültigbis', 'g26bis', 'untersuchung'], strecke: ['übungsstrecke', 'strecke', 'letzteübungsstrecke'] }, need: [] },
    devices: { title: 'Atemschutzgeräte', area: 'agt', cols: { type: ['art', 'typ', 'geräteart'], nr: ['nr', 'nummer', 'inventarnr', 'inventarnummer'], serial: ['seriennummer', 'seriennr', 'sn'], maker: ['hersteller'], model: ['modell'], built: ['baujahr'], location: ['standort', 'fahrzeug'], test_due: ['prüffrist', 'tüv', 'nächsteprüfung'] }, need: ['type', 'nr'] },
    vehicles: { title: 'Fahrzeuge', area: 'vehicles', cols: { name: ['name', 'fahrzeug', 'bezeichnung'], plate: ['kennzeichen'], callsign: ['funkrufname', 'rufname'], unit: ['löschzug', 'einheit'], built: ['baujahr'] }, need: ['name'] },
    stock: { title: 'Kleidung: Ausstattung je Person', area: 'clothing', cols: { last: ['nachname'], first: ['vorname'], name: ['name'], item: ['teil', 'kleidungsstück', 'artikel'], size: ['größe'], qty: ['anzahl', 'menge'], issued: ['ausgegeben', 'ausgabe', 'datum'], serial: ['nr', 'seriennummer', 'inventarnr'] }, need: ['item'] }
  };
  function parseCsv(text) {
    text = text.replace(/^﻿/, '');
    var first = text.split(/\r?\n/)[0] || '', delim = [';', '\t', ','].sort(function (a, b) { return first.split(b).length - first.split(a).length; })[0];
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; continue; }
      if (c === '"') q = true; else if (c === delim) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return String(x).trim(); }); });
  }
  function mapRows(set, table) {
    var def = IMPORTS[set], head = (table[0] || []).map(function (h) { return String(h).toLowerCase().replace(/[\s.\-_]/g, ''); }), idx = {};
    Object.keys(def.cols).forEach(function (k) { var i = head.findIndex(function (h) { return def.cols[k].indexOf(h) >= 0; }); if (i >= 0) idx[k] = i; });
    return { idx: idx, rows: table.slice(1).map(function (r) { var o = {}; Object.keys(idx).forEach(function (k) { o[k] = (r[idx[k]] || '').trim(); }); return o; }) };
  }
  // Mini-ZIP (ohne Kompression) für „alles exportieren“
  function crc32(bytes) {
    var t = crc32.t || (crc32.t = (function () { var a = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; a[n] = c >>> 0; } return a; })());
    var crc = -1; for (var i = 0; i < bytes.length; i++) crc = (crc >>> 8) ^ t[(crc ^ bytes[i]) & 0xFF]; return (crc ^ -1) >>> 0;
  }
  function zip(files) {
    var enc = new TextEncoder(), parts = [], central = [], off = 0;
    function u16(v) { return [v & 255, (v >>> 8) & 255]; } function u32(v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; }
    files.forEach(function (f) {
      var name = enc.encode(f.name), data = enc.encode(f.text), crc = crc32(data);
      var head = [].concat([0x50, 0x4b, 3, 4], u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0));
      parts.push(new Uint8Array(head), name, data);
      central.push([].concat([0x50, 0x4b, 1, 2], u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(off)), name);
      off += head.length + name.length + data.length;
    });
    var cdSize = 0, cd = [];
    central.forEach(function (c) { cd.push(new Uint8Array(c[0]), c[1]); cdSize += c[0].length + c[1].length; });
    var end = new Uint8Array([].concat([0x50, 0x4b, 5, 6], u16(0), u16(0), u16(files.length), u16(files.length), u32(cdSize), u32(off), u16(0)));
    return new Blob(parts.concat(cd, [end]), { type: 'application/zip' });
  }
  // Datenwege: woher kommt was, wohin geht es – austauschbar, damit andere Werkzeuge andocken können
  function flowsHtml() {
    var w = d.web_reports || {}, al = d.alarm || {};
    var rows = [
      ['Alarm', al.on ? 'aktiv' : 'aus', 'FE2 / aPager → Webhook → Einsatz wird angelegt', 'unten: Alarm-Schnittstelle', 'incidents'],
      ['Dienstplan', (d.drill_cal || {}).set ? ((d.drill_cal.cals || []).length + ((d.drill_cal.cals || []).length === 1 ? ' Kalender' : ' Kalender') + ', live') : 'kein Kalender', 'Kalender (iCal, z. B. Alamos) → Dienstplan, Kalender, Abo, Dashboard', 'Dienste → Jahresdienstplan', 'duties'],
      ['Einsatzberichte', w.target === 'wehrwerk' ? APP : 'Einsatzverwaltung', w.target === 'wehrwerk' ? 'Einsatz → „Für die Website“ → Seite [wehrwerk_einsatzberichte] + /myf/v1/public/incidents' : 'Einsatzverwaltung ⇄ ' + APP + ' (Abgleich alle 5 Min.)', 'Einsätze → Website-Berichte', 'incidents'],
      ['Schnellerfassung', w.ev ? 'verfügbar' : '—', 'WhatsApp-/Alarmtexte → Einsatzverwaltung', 'Seite [wehrwerk_einsatz]', 'incidents'],
      ['Termine', d.settings.screen_ical_set ? 'Kalender verbunden' : 'kein Kalender', 'iCal (z. B. Alamos) → Dashboard und Kalender-Import', 'Dashboard', 'screen'],
      ['Kalender-Abos', 'aktiv', APP + ' → persönliche iCal-Links der Mitglieder (Lehrgänge, Dienste, Übungsstrecke)', 'Mitglieder: Kalender', 'any'],
      ['Tabellen', 'aktiv', 'CSV/Excel ⇄ ' + APP + ' (Export aller Bereiche, Import mit Vorschau)', 'unten', 'any'],
      ['Wetter & Warnungen', d.settings.screen_weather || d.settings.screen_warnings ? 'aktiv' : 'aus', 'DWD (Bright Sky) und BBK/NINA → Dashboard', 'Dashboard', 'screen']
    ].filter(function (r) { return r[4] === 'any' || allowedTab(TAB_AREA[r[4]] ? r[4] : 'full') || (d.areas || []).indexOf(r[4]) >= 0 || d.full; });
    return '<div class="ffl-pbox" style="margin-top:14px"><div class="ffl-sh">Datenwege<em>woher die Daten kommen und wohin sie gehen</em></div><div class="ffl-scroll"><table class="ffl-table"><thead><tr><th>Bereich</th><th>Status</th><th>Weg</th><th>Einstellen unter</th></tr></thead><tbody>' +
      rows.map(function (r) { return '<tr><td><b>' + esc(r[0]) + '</b></td><td>' + esc(r[1]) + '</td><td>' + esc(r[2]) + '</td><td class="ffl-mu">' + esc(r[3]) + '</td></tr>'; }).join('') +
      '</tbody></table></div><p class="ffl-mu">Jede Quelle lässt sich austauschen: Einsätze können aus der Alarmierung, der Einsatzverwaltung, der Schnellerfassung oder von Hand kommen – Auswertungen, Dashboard und Berichte nutzen immer denselben Bestand.</p></div>';
  }
  // Demo-Modus: Beispieldaten für eine Vorführung anlegen und wieder entfernen
  function demoBox() {
    var dm = d.demo || {};
    if (!d.full && !dm.ctx && !dm.can) return '';
    var links = dm.hall_url ? '<div class="ffl-fl">Demo-Geräte (zeigen nur Demo-Daten)</div><div class="ffl-row"><a class="ffl-btn ffl-sm" href="' + esc(dm.screen_url) + '" target="_blank" rel="noopener">Dashboard Besprechungsraum ↗</a>' +
      '<a class="ffl-btn ffl-sm" href="' + esc(dm.hall_url) + '" target="_blank" rel="noopener">Dashboard Fahrzeughalle ↗</a></div>' : '';
    return '<div class="ffl-pbox ffl-demo' + (dm.on ? ' is-on' : '') + '" style="margin-top:14px"><div class="ffl-sh">Demo-Modus' + (dm.on ? '<em><span class="ffl-chip st-warn">läuft seit ' + fmtDate(dm.since) + '</span></em>' : '') + '</div>' +
      (dm.on ? (dm.ctx ? '<p style="margin-top:0"><b>Du siehst gerade den Demo-Bestand.</b> Echte Daten sind ausgeblendet und werden nicht verändert.</p>' +
          '<div class="ffl-row"><button type="button" class="ffl-p" data-act="demoview" data-v="0">Zurück zu echten Daten</button><button type="button" data-act="demooff">Demo beenden und alles löschen</button></div>'
        : '<p style="margin-top:0">Der Demo-Bestand ist <b>komplett getrennt</b> von euren echten Daten: eigene Mitglieder, Fahrzeuge, Einsätze, Einstellungen. ' +
          'Hier in der echten Ansicht taucht nichts davon auf. Ansehen: als Administrator per Knopf – oder mit den Demo-Logins.</p>' +
          '<div class="ffl-row"><button type="button" class="ffl-p" data-act="demoview" data-v="1">Demo ansehen</button></div>') +
        (dm.creds && dm.creds.length ? '<div class="ffl-fl">Demo-Logins (sehen nur den Demo-Bestand)</div><table class="ffl-table"><tbody>' + dm.creds.map(function (c) {
          return '<tr><td><b>' + esc(c.login) + '</b></td><td><code>' + esc(c.password) + '</code></td><td class="ffl-mu">' + esc(c.who) + (c.role ? ' – ' + esc(c.role) : '') + '</td></tr>';
        }).join('') + '</tbody></table>' : '') + links +
        // Alarmszenario für die Vorführung: wirkt nur auf den Demo-Bestand und die Demo-Dashboards
        '<div class="ffl-fl">Alarmszenario auf den Demo-Dashboards</div><div class="ffl-row">' + [['brand', 'Alarm: Brand'], ['th', 'Alarm: Hilfe P-Tür'], ['vu', 'Alarm: VU'], ['erhoehung', 'Erhöhung'], ['nachalarm', 'Nachalarmierung'], ['probe', 'Probealarm (Test)'], ['ende', 'Einsatz beenden'], ['reset', 'Zurücksetzen']].map(function (x) {
          return '<button type="button" class="ffl-sm' + (x[0].length <= 5 && x[0] !== 'ende' && x[0] !== 'reset' ? ' ffl-p' : '') + '" data-act="demoscn" data-v="' + x[0] + '">' + x[1] + '</button>'; }).join('') +
        '<span class="ffl-mu">Dashboard im Besprechungsraum: rotes Alarmband; Halle: Anwesenheitsliste; Fahrzeuge auf Status 3. Echte Daten bleiben unberührt.</span></div>' +
        (dm.ctx ? '' : '<div class="ffl-row" style="margin-top:12px"><button type="button" data-act="demooff">Demo beenden und alles löschen</button><span class="ffl-mu">Löscht den kompletten Demo-Bestand und die Demo-Logins – echte Daten bleiben unberührt.</span></div>')
      : '<p style="margin-top:0">Für eine Vorführung: legt einen <b>eigenen, getrennten</b> Demo-Bestand an – fiktive Mitglieder, Fahrzeuge mit Status, Einsätze mit Beteiligung (eine Liste ist gerade offen), Fahrtenbuch, Buchung, Mangel, Dienste und fünf Demo-Logins je Rolle. ' +
        'Aussehen und Standort werden von euch übernommen, eure echten Daten werden weder angezeigt noch verändert. Im Demo-Bestand gehen keine E-Mails raus.</p>' +
        '<button type="button" class="ffl-p" data-act="demoon">Demo-Bestand anlegen</button>') + '</div>';
  }
  // ---- Startklar: Bestand + Einrichtungs-Checkliste; Archiv; Zurücksetzen (Neustart) -----------------------
  function tabStart() {
    var v = d.inventory || {}, b = d.brand || {};
    var steps = [
      [!!b.org && !!(b.place || b.line3), 'Name, Ort und Logo', (b.org || 'noch nicht eingetragen'), 'settings', ''],
      [v.members > 0, 'Mitglieder eintragen oder aus Excel übernehmen', v.members + ' aktive Mitglieder', 'members', 'add'],
      [v.members > 0 && v.members_account >= v.members * 0.8, 'Mitglieder einladen (Konto für den Mitgliederbereich)', v.members_account + ' von ' + v.members + ' haben ein Konto', 'members', 'add'],
      [v.members_function > 0, 'Funktionen zuordnen (Wehrführung, LZ-Führung, Gruppenführer, Gerätewarte …) – daraus folgen die Rechte', v.members_function + (v.members_function === 1 ? ' Mitglied' : ' Mitglieder') + ' mit Funktion', 'members', 'lists'],
      [v.members > 0 && v.members_rank >= v.members * 0.8, 'Dienstgrade eintragen', v.members_rank + ' von ' + v.members, 'members', 'ranks'],
      [v.vehicles > 0, 'Fahrzeuge anlegen (eine Liste für Einsatz, Halle, Fahrtenbuch, Status)', v.vehicles + ' Fahrzeuge, ' + v.vehicles_callsign + ' mit Funkrufnamen', 'vehicles', ''],
      [v.alarm, 'Alarm-Schnittstelle (Alamos FE2) einrichten – Einsatz sofort bei Alarm, Fahrzeugstatus', v.alarm ? (v.status_from_alarm ? 'an · Status kommt an (' + v.status_from_alarm + ' Fahrzeuge)' : 'an · noch kein Status empfangen') : 'aus', 'data', 'alarm'],
      [v.devices_agt > 0, 'Atemschutzgeräte erfassen (oder aus Excel)', v.devices_agt + ' Geräte', 'agt', ''],
      [v.devices_other > 0, 'Weitere Geräte und Werkzeuge mit Prüffristen', v.devices_other + ' Geräte', 'vehicles', ''],
      [v.cloth_stock > 0, 'Kleiderkammer: Bestand eintragen', v.cloth_stock + ' Teile · ' + v.cloth_items + ' Artikel im Katalog', 'clothing', ''],
      [v.courses > 0 || v.templates > 0, 'Lehrgänge des Abfragejahres festlegen', v.courses + ' Lehrgänge · ' + v.templates + ' Vorlagen', 'courses', ''],
      [v.drills > 0, 'Dienstplan (Übungsdienste) eintragen', v.drills + ' Termine', 'duties', ''],
      [v.location && v.warn_region, 'Standort und Warnregion (Wetter, NINA, hell/dunkel)', (v.location ? 'Standort ✓' : 'Standort fehlt') + ' · ' + (v.warn_region ? 'Warnregion ✓' : 'Warnregion fehlt'), 'screen', ''],
      [v.screen && v.hall, 'Dashboards für Besprechungsraum und Fahrzeughalle', (v.screen ? 'Besprechungsraum ✓' : 'Besprechungsraum aus') + ' · ' + (v.hall ? 'Fahrzeughalle ✓' : 'Fahrzeughalle aus'), 'screen', ''],
      [v.ical, 'Termin-Kalender (iCal) verbinden', v.ical ? 'verbunden' : 'nicht verbunden (optional)', 'screen', '']
    ];
    var done = steps.filter(function (x) { return x[0]; }).length;
    var h = '<div class="ffl-sec"><div class="ffl-sh">Bestand<em>so viel ist in ' + APP + ' eingetragen</em></div><div class="ffl-cards ffl-inv">' +
      [['Mitglieder', v.members, v.members_account + ' mit Konto'], ['Fahrzeuge', v.vehicles, v.vehicles_callsign + ' mit Funkrufname'], ['Atemschutzgeräte', v.devices_agt, ''], ['Weitere Geräte', v.devices_other, 'Werkstatt, Teams'],
        ['Kleidung', v.cloth_stock, 'Teile im Bestand'], ['Einsätze', v.incidents, 'im System'], ['Lehrgänge', v.courses, 'im Abfragejahr'], ['Dienste', v.drills, 'im Dienstplan']].map(function (c) {
        return '<div class="ffl-card"><span class="ffl-cl">' + c[0] + '</span><span class="ffl-big">' + (c[1] || 0) + '</span>' + esc(c[2]) + '</div>';
      }).join('') + '</div></div>';
    h += '<div class="ffl-sec"><div class="ffl-sh">Startklar?<em>' + done + ' von ' + steps.length + ' erledigt</em></div>' +
      '<div class="ffl-askbar" style="max-width:none"><i style="width:' + Math.round(done / steps.length * 100) + '%"></i></div><ol class="ffl-startlist">' + steps.map(function (x, i) {
        return '<li class="' + (x[0] ? 'is-done' : '') + '"><span class="n">' + (x[0] ? '✓' : i + 1) + '</span><span class="t"><b>' + esc(x[1]) + '</b><span class="ffl-mu">' + esc(x[2]) + '</span></span>' +
          '<button type="button" class="ffl-sm' + (x[0] ? ' ffl-q' : '') + '" data-act="gostart" data-v="' + x[3] + '" data-gs="' + x[4] + '">' + (x[0] ? 'ansehen' : 'jetzt einrichten') + ' →</button></li>';
      }).join('') + '</ol><p class="ffl-mu">Viele Daten kommen am schnellsten aus Excel: Mitglieder unter Mitglieder → Hinzufügen, Geräte, Ausbildung und Bestand unter Daten & Schnittstellen → Import.</p></div>';
    // Archiv
    var ar = d.archives || [];
    h += '<div class="ffl-sec"><div class="ffl-sh">Archiv<em>vollständige Kopien – werden nicht gelöscht</em><button type="button" class="ffl-sm" style="margin-left:auto" data-act="arcnow">Jetzt archivieren</button></div>' +
      '<p class="ffl-mu" style="margin-top:0">Vor jedem Zurücksetzen und vor jedem Einspielen einer Sicherung wird automatisch archiviert. Jedes Archiv lässt sich herunterladen oder wieder einspielen (der Stand davor wird dabei ebenfalls archiviert). Das Protokoll bleibt immer vollständig.</p>' +
      (ar.length ? '<div class="ffl-scroll"><table class="ffl-table"><thead><tr><th>Datum</th><th>Anlass</th><th>von</th><th>Inhalt</th><th></th></tr></thead><tbody>' + ar.map(function (a) {
        return '<tr><td style="white-space:nowrap">' + fmtDate(a.created) + ' ' + esc(a.created.slice(11, 16)) + '</td><td>' + esc(a.label) + '</td><td>' + esc(a.by) + '</td><td class="ffl-mu">' + a.members + ' Mitglieder · ' + a.incidents + ' Einsätze · ' + a.rows + ' Datensätze · ' + Math.max(1, Math.round(a.size / 1024)) + ' KB</td>' +
          '<td style="white-space:nowrap"><button type="button" class="ffl-sm" data-act="arcdl" data-id="' + a.id + '">Herunterladen</button> <button type="button" class="ffl-sm ffl-q" data-act="arcrestore" data-id="' + a.id + '">Wiederherstellen</button> <button type="button" class="ffl-sm ffl-q" data-act="arcdel" data-id="' + a.id + '" title="Archiv löschen (steht im Protokoll)">✕</button></td></tr>';
      }).join('') + '</tbody></table></div>' : '<p class="ffl-mu">Noch kein Archiv.</p>') + '</div>';
    // Zurücksetzen
    var rg = d.reset_groups || {};
    h += '<div class="ffl-sec ffl-reset"><div class="ffl-sh">Neustart: Daten zurücksetzen</div>' +
      '<p style="margin-top:0">Zum Ausprobieren oder für einen sauberen Start: ausgewählte Bereiche werden geleert. <b>Vorher wird automatisch alles archiviert</b> – nichts geht verloren, und der Neustart steht im Protokoll. ' +
      'Es bleiben: Einstellungen, Aussehen, Einheiten, Funktionen & Rechte, Lehrgangs-Vorlagen, Kleidungs-Katalog, Konten und das Protokoll.</p>' +
      '<div class="ffl-resetgrid">' + Object.keys(rg).map(function (k) { return '<label class="ffl-check"><input type="checkbox" data-rgrp="' + k + '"> ' + esc(rg[k]) + '</label>'; }).join('') + '</div>' +
      '<p class="ffl-mu">Tipp: Mitglieder nur zusammen mit Einsätzen, Diensten und Mängeln zurücksetzen – sonst stehen dort Einträge ohne Person.</p>' +
      '<div class="ffl-row"><input type="text" id="ffl-rlabel" placeholder="Anlass (optional), z. B. „Testphase beendet“" style="flex:1 1 260px;width:auto">' +
      '<input type="text" id="ffl-rconfirm" placeholder="zur Bestätigung ZURÜCKSETZEN tippen" style="flex:1 1 240px;width:auto" autocomplete="off">' +
      '<button type="button" class="ffl-go" data-act="dosreset">Archivieren und zurücksetzen</button></div></div>';
    return h;
  }
  // Datensicherung: nachts automatisch, verschlüsselt; Abruf durch den Rechner im Gerätehaus; Wiederherstellen aus Datei
  function backupBox() {
    var b = d.backup; if (!b) return '';
    var age = b.last ? Math.floor((Date.now() - Date.parse(b.last.replace(' ', 'T'))) / 864e5) : null;
    var h = '<div class="ffl-sec" style="margin-top:14px"><div class="ffl-sh">Datensicherung<em>' + (b.last ? 'zuletzt ' + fmtDT(b.last) : 'noch keine') + '</em></div>' +
      (!b.pass_set ? '<div class="ffl-msg warn"><b>Noch kein Sicherungskennwort.</b> Jede Nacht wird zwar ein Archiv in der Datenbank angelegt – eine Sicherungsdatei für außerhalb des Servers entsteht erst mit Kennwort.</div>'
        : age !== null && age > 2 ? '<div class="ffl-msg err">Die letzte Sicherung ist ' + age + ' Tage alt – läuft der nächtliche Zeitplan (WP-Cron)?</div>' : '<div class="ffl-msg ok">Jede Nacht gesichert und verschlüsselt' + (b.last_file ? ': ' + esc(b.last_file) + ' (' + Math.round(b.last_size / 1024) + ' KB)' : '') + '.</div>') +
      '<div class="ffl-grid2"><div class="ffl-pbox"><div class="ffl-sh">Sicherungskennwort</div><p class="ffl-mu" style="margin-top:0">Ohne dieses Kennwort lässt sich keine Sicherungsdatei öffnen – auch nicht von uns. ' +
      '<b>Auf Papier im Tresor bzw. bei der Wehrführung hinterlegen.</b> Mindestens 12 Zeichen, am besten ein Satz.</p>' +
      '<div class="ffl-row"><input type="password" id="ffl-bkpass" class="ffl-grow" autocomplete="new-password" placeholder="' + (b.pass_set ? 'gesetzt am ' + fmtDate(b.pass_set) + ' – neues eingeben zum Ändern' : 'Sicherungskennwort') + '"></div>' +
      '<div class="ffl-row" style="margin-top:10px"><button type="button" data-act="bknow">Sicherung jetzt erstellen</button>' + (b.last_file ? '<a class="ffl-btn" href="' + esc(b.download) + '">↓ Letzte Sicherung</a>' : '') + '</div></div>' +
      '<div class="ffl-pbox"><div class="ffl-sh">Kopie im Gerätehaus</div><p class="ffl-mu" style="margin-top:0">Ein Rechner im Gerätehaus (Feuerwehr-Server, NAS) holt jede Nacht die verschlüsselte Datei ab – so liegt immer eine Kopie außerhalb des Webservers.</p>' +
      (b.pull_url ? '<label class="ffl-fl">Abruf-Link (geheim halten)</label>' + secretBox(b.pull_url, { what: 'Abruf-Link Sicherung' }) +
        '<label class="ffl-fl" style="margin-top:10px">Befehl für den Server (täglich, z. B. 3:30 Uhr per Cron)</label>' + secretBox("curl -fsS -o /srv/sicherung/wehrwerk-$(date +%F).wwbk '" + b.pull_url + "'", { what: 'Abruf-Befehl Sicherung' }) +
        '<div class="ffl-row" style="margin-top:8px"><button type="button" class="ffl-sm" data-act="bkpull">Neuen Link erzeugen</button><button type="button" class="ffl-sm ffl-q" data-act="bkpulloff">Abruf ausschalten</button></div>'
        : '<button type="button" data-act="bkpull">Abruf-Link einschalten</button>') + '</div></div>' +
      // Aufbewahrung und Speicherplatz: damit Archive und Sicherungsdateien den Server nicht vollaufen lassen
      (function () {
        var c = b.conf || {}, u = b.usage || {}, used = (u.db || 0) + (u.files || 0), max = (c.max_mb || 500) * 1048576, pct = Math.min(100, Math.round(used / max * 100)), mb = function (x) { return (x / 1048576).toFixed(x < 10485760 ? 1 : 0).replace('.', ','); };
        return '<div class="ffl-pbox" style="margin-top:14px"><div class="ffl-sh">Aufbewahrung & Speicherplatz<em>' + mb(used) + ' von ' + c.max_mb + ' MB belegt</em></div>' +
          '<div class="ffl-bkbar' + (pct >= 80 ? ' is-warn' : '') + '" role="img" aria-label="' + pct + ' Prozent belegt"><i style="width:' + pct + '%"></i></div>' +
          '<p class="ffl-mu" style="margin:6px 0 10px">' + u.archives + ' Archive in der Datenbank (' + mb(u.db || 0) + ' MB) · Sicherungsdateien ' + mb(u.files || 0) + ' MB.' + (pct >= 80 ? ' <b style="color:var(--red-tx)">Fast voll – Grenze erhöhen oder alte Archive von Hand löschen.</b>' : '') + '</p>' +
          '<div class="ffl-form2"><div><label class="ffl-fl" for="ffl-bkd">Tägliche Sicherungen behalten</label><input type="number" id="ffl-bkd" min="3" max="60" value="' + c.keep_daily + '"></div>' +
          '<div><label class="ffl-fl" for="ffl-bkw">Wöchentliche Sicherungen (Wochen)</label><input type="number" id="ffl-bkw" min="0" max="104" value="' + c.keep_weekly + '"></div>' +
          '<div><label class="ffl-fl" for="ffl-bkf">Sicherungsdateien behalten</label><input type="number" id="ffl-bkf" min="3" max="120" value="' + c.keep_files + '"></div>' +
          '<div><label class="ffl-fl" for="ffl-bkm">Speicher-Obergrenze (MB)</label><input type="number" id="ffl-bkm" min="20" max="20000" value="' + c.max_mb + '"></div></div>' +
          '<p class="ffl-mu" style="margin:8px 0 0">Wird die Grenze erreicht, fallen zuerst die ältesten automatischen Sicherungen weg – die drei neuesten bleiben immer. Archive von Hand und „Vor dem …“-Archive löscht Wehrwerk nie selbst (unter Startklar & Neustart → Archiv einzeln löschbar).</p></div>';
      })() +
      '<details class="ffl-pbox" style="margin-top:14px"><summary><b>Sicherung wiederherstellen</b> (z. B. nach einem Serverausfall)</summary><p class="ffl-mu">Der aktuelle Stand wird vorher archiviert. Protokoll bleibt vollständig.</p>' +
      '<div class="ffl-form2"><div><label class="ffl-fl">Sicherungsdatei (.wwbk)</label><input type="file" id="ffl-bkfile" accept=".wwbk"></div><div><label class="ffl-fl">Sicherungskennwort</label><input type="password" id="ffl-bkrpass" autocomplete="off"></div></div>' +
      '<button type="button" class="ffl-q" style="margin-top:10px" data-act="bkrestore">Wiederherstellen …</button>' +
      (d.full ? '<div class="ffl-fl" style="margin-top:18px">Umzug oder Notfall-Server (Gesamtdatei)</div><p class="ffl-mu" style="margin-top:0">Komplette Datei ohne Verschlüsselung – enthält auch Gesundheitsdaten, nur auf sicheren Geräten speichern. Einspielen ersetzt alle Daten (das Protokoll bleibt).</p>' +
        '<div class="ffl-row"><button type="button" class="ffl-sm" data-act="backup">Gesamtdatei herunterladen</button></div>' +
        '<div class="ffl-row" style="margin-top:8px"><input type="file" id="ffl-restfile" accept=".json,application/json"><input type="text" id="ffl-restconf" placeholder="zur Bestätigung WIEDERHERSTELLEN eintippen" style="flex:1 1 220px;width:auto">' +
        '<button type="button" class="ffl-q" style="color:var(--red-tx)" data-act="restore">Einspielen</button></div>' : '') + '</details></div>';
    return h;
  }
  function tabData() {
    var h = backupBox() + flowsHtml();
    // Alarm-Schnittstelle (Alamos FE2 / aPager) gehört zu den Schnittstellen – nicht zwischen die Einsätze
    if (allowedTab('incidents')) h += '<div class="ffl-sec" id="ffl-alarmsec" style="margin-top:18px"><div class="ffl-sh">Alarm-Schnittstelle<em>Alamos FE2 / aPager → Einsatz wird sofort angelegt, Fahrzeugstatus</em></div>' + alarmSetup() + '</div>';
    h += '<div class="ffl-sec" style="margin-top:18px"><div class="ffl-sh">Export & Import</div></div><div class="ffl-grid2" style="margin-top:14px"><div class="ffl-pbox"><div class="ffl-sh">Export</div><p class="ffl-mu" style="margin-top:0">Als CSV-Tabelle (öffnet direkt in Excel). Du siehst nur deine Bereiche.</p>' +
      (ui.exports ? ui.exports.map(function (x) { return '<div class="ffl-row" style="justify-content:space-between;border-top:1px solid var(--line);padding:6px 0"><span>' + esc(x.title) + '</span><button type="button" class="ffl-sm" data-act="exp" data-v="' + x.key + '">CSV</button></div>'; }).join('') +
        '<button type="button" class="ffl-p" style="margin-top:10px" data-act="expall">Alles als ZIP herunterladen</button>' : '<button type="button" data-act="exploaded">Exporte anzeigen</button>') + '</div>';
    var sets = Object.keys(IMPORTS).filter(function (k) { return allowedTab(TAB_AREA[IMPORTS[k].area] ? IMPORTS[k].area : 'full') || (d.areas || []).indexOf(IMPORTS[k].area) >= 0 || d.full; });
    h += '<div class="ffl-pbox"><div class="ffl-sh">Import (CSV aus Excel)</div><p class="ffl-mu" style="margin-top:0">In Excel „Speichern unter → CSV (Trennzeichen-getrennt)“. Die erste Zeile enthält die Überschriften. ' +
      'Personen werden über „Nachname“ + „Vorname“ (oder „Name“ = „Nachname, Vorname“) gefunden. Mitglieder selbst importierst du unter Mitglieder → Hinzufügen.</p>' +
      (sets.length ? '<div class="ffl-row">' + sel(sets.map(function (k) { return [k, IMPORTS[k].title]; }), ui.impSet || sets[0], 'id="ffl-impset" style="width:auto"') + '<input type="file" id="ffl-impfile" accept=".csv,text/csv,text/plain"></div>' +
        '<p class="ffl-mu">Erkannte Spalten: ' + esc(Object.keys(IMPORTS[ui.impSet || sets[0]].cols).map(function (k) { return IMPORTS[ui.impSet || sets[0]].cols[k][0]; }).join(', ')) + '</p>' : '<p class="ffl-mu">Kein Import für deine Bereiche.</p>') +
      (ui.impPrev2 ? '<div class="ffl-msg">' + ui.impPrev2.rows.length + ' Zeilen gelesen, erkannt: ' + esc(Object.keys(ui.impPrev2.idx).join(', ')) + '</div><div class="ffl-scroll"><table class="ffl-table"><tbody>' +
        ui.impPrev2.rows.slice(0, 8).map(function (r) { return '<tr>' + Object.keys(ui.impPrev2.idx).map(function (k) { return '<td>' + esc(r[k]) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>' +
        '<button type="button" class="ffl-p" style="margin-top:8px" data-act="impgo">' + ui.impPrev2.rows.length + ' Zeilen importieren</button>' : '') + '</div>';
    if (allowedTab('incidents')) h += '<div class="ffl-pbox span2"><div class="ffl-sh">Kalender importieren</div><p class="ffl-mu" style="margin-top:0">Termine aus dem Dashboard-Kalender (z. B. Alamos) oder einer ICS-Datei als Übungen/Dienstabende übernehmen – dann können Mitglieder danach eintragen, dass sie dabei waren.</p>' +
      '<div class="ffl-row"><button type="button" class="ffl-sm" data-act="icsload">Aus Dashboard-Kalender laden</button><input type="file" id="ffl-icsfile" accept=".ics,text/calendar"></div>' +
      (ui.icsEv ? '<div class="ffl-row" style="margin-top:8px"><input type="search" id="ffl-icsfilter" value="' + esc(ui.icsFilter || '') + '" placeholder="Filter, z. B. Übungsabend" style="flex:1 1 200px;width:auto">' +
        '<button type="button" class="ffl-sm" data-act="icsall">alle passenden wählen</button></div><div class="ffl-scroll" style="max-height:320px;overflow:auto"><table class="ffl-table"><tbody>' +
        ui.icsEv.map(function (e, i) {
          if (ui.icsFilter && e.title.toLowerCase().indexOf(ui.icsFilter.toLowerCase()) < 0) return '';
          return '<tr><td><input type="checkbox" data-ics="' + i + '"' + (e.sel ? ' checked' : '') + '></td><td>' + dtA(e.start) + '</td><td><b>' + esc(e.title) + '</b></td><td class="ffl-mu">' + esc(e.place) + '</td></tr>';
        }).join('') + '</tbody></table></div><button type="button" class="ffl-p" style="margin-top:8px" data-act="icsimport">Ausgewählte als Übungen übernehmen</button>' : '') + '</div>';
    h += '</div>' + demoBox();
    return h + '<div class="ffl-savebar" id="ffl-databar"' + (ui.dataDirty ? '' : ' hidden') + '><span>Ungespeicherte Änderungen auf dieser Seite</span><button type="button" class="ffl-q" data-act="datadiscard">Verwerfen</button><button type="button" class="ffl-p" data-act="datasave">Speichern</button></div>';
  }
  // ---- Teams (IT, Medien …): Aufgaben, Inventar & Prüfungen ------------------------------
  var TSTAT = { open: ['offen', 'st-open'], progress: ['in Arbeit', 'st-warn'], done: ['erledigt', 'st-ok'] };
  function tabTeams() {
    var subs = (d.team_areas || []).map(function (a) { return [a, (d.area_labels || {})[a] || a]; });
    if (d.full) subs.push(['_manage', 'Teams verwalten']);
    var cur = ui.team && subs.some(function (x) { return x[0] === ui.team; }) ? ui.team : (subs[0] || [])[0];
    var h = subs.length > 1 ? '<div class="ffl-subtabs" style="margin-top:12px">' + subs.map(function (x) {
      var n = (d.team_tasks || []).filter(function (k) { return k.area === x[0] && k.status === 'open'; }).length;
      return '<button type="button" data-act="team" data-v="' + x[0] + '" aria-selected="' + (cur === x[0]) + '">' + esc(x[1]) + (n ? ' (' + n + ')' : '') + '</button>';
    }).join('') + '</div>' : '';
    if (!cur) return h + '<p class="ffl-mu" style="margin-top:14px">Noch keine Teams angelegt.</p>';
    if (cur === '_manage') return h + teamsManage();
    var tm = (d.teams || []).filter(function (x) { return x.area === cur; })[0] || { name: cur, desc: '' };
    var tsub = ui.tsub || 'tasks';
    var open = (d.team_tasks || []).filter(function (k) { return k.area === cur && k.status !== 'done'; }).length;
    h += '<div class="ffl-teamhead"><div><b>' + esc(tm.name) + '</b>' + (tm.desc ? '<span>' + esc(tm.desc) + '</span>' : '') + '</div>' +
      '<div class="ffl-subtabs ffl-subtabs-2" style="margin:0">' + [['tasks', 'Aufgaben' + (open ? ' (' + open + ')' : '')], ['people', 'Personen (' + ((d.team_members || {})[cur] || []).length + ')'], ['inv', 'Inventar & Prüfungen']].map(function (x) {
        return '<button type="button" data-act="tsub" data-v="' + x[0] + '" aria-selected="' + (tsub === x[0]) + '">' + x[1] + '</button>';
      }).join('') + '</div></div>';
    return h + (tsub === 'inv' ? workshopPanel(cur) : tsub === 'people' ? teamPeople(cur) : teamTasks(cur));
  }
  // Personen im Team: direkt hinzufügen/herausnehmen (setzt die Funktion „Team …“ im Profil)
  function teamPeople(area) {
    var ids = (d.team_members || {})[area] || [], mem = by(d.members, 'id');
    var free = d.members.filter(function (m) { return m.active && ids.indexOf(m.id) < 0; });
    return '<div class="ffl-pbox" style="margin-top:12px"><div class="ffl-row">' + memberPicker('ffl-tmadd', free, 'Person hinzufügen – Name tippen …') +
      '<button type="button" class="ffl-p" data-act="tmadd" data-v="' + esc(area) + '">Hinzufügen</button></div>' +
      '<p class="ffl-mu" style="margin:8px 0 0">Wer im Team ist, sieht das Team in der Verwaltung (Aufgaben, Inventar, Nachrichten) und bekommt Team-Aufgaben.</p></div>' +
      (ids.length ? '<div class="ffl-chips" style="margin-top:12px">' + ids.map(function (id) {
        var m = mem[id]; return m ? '<span class="ffl-chip st-open">' + esc(m.name) + ' <a href="#" data-act="tmrm" data-id="' + id + '" data-v="' + esc(area) + '" aria-label="aus dem Team nehmen" style="text-decoration:none;margin-left:4px">✕</a></span>' : '';
      }).join('') + '</div>' : '<p class="ffl-mu" style="margin-top:12px">Noch niemand im Team.</p>');
  }
  function teamTasks(area) {
    var all = (d.team_tasks || []).filter(function (k) { return k.area === area; }), mem = by(d.members, 'id');
    var list = all.filter(function (k) { return ui.tDone ? k.status === 'done' : k.status !== 'done'; });
    var h = '<div class="ffl-pbox ffl-newtask"><div class="ffl-row"><input type="text" id="ffl-tktitle" class="ffl-grow" placeholder="Neue Aufgabe, z. B. „WLAN im Schulungsraum erneuern“">' +
      '<input type="date" id="ffl-tkdue" style="width:auto" title="fällig bis">' + memberPicker('ffl-tkwho', null, 'zuständig (optional)') +
      '<label class="ffl-check"><input type="checkbox" id="ffl-tkprio"> wichtig</label><button type="button" class="ffl-p" data-act="tknew" data-v="' + area + '">Anlegen</button></div>' +
      '<textarea id="ffl-tktext" rows="2" placeholder="Details (optional)" style="margin-top:8px;min-height:56px"></textarea></div>';
    h += '<div class="ffl-bar"><span class="ffl-mu">' + (ui.tDone ? 'Erledigt (letzte 120 Tage)' : 'Offen und in Arbeit') + '</span><span style="flex:1"></span>' +
      '<button type="button" class="ffl-q ffl-sm" data-act="tkdone">' + (ui.tDone ? '← offene Aufgaben' : 'Erledigte anzeigen') + '</button></div>';
    if (!list.length) return h + '<p class="ffl-mu">' + (ui.tDone ? 'Noch nichts erledigt.' : 'Keine offenen Aufgaben. 🎉') + '</p>';
    return h + '<div class="ffl-tasks">' + list.map(function (k) {
      var who = k.member_id && mem[k.member_id], late = k.due && k.due < isoToday() && k.status !== 'done';
      return '<div class="ffl-task' + (k.prio ? ' is-prio' : '') + '"><div class="ffl-task-h"><b>' + esc(k.title) + '</b>' +
        sel(Object.keys(TSTAT).map(function (x) { return [x, TSTAT[x][0]]; }), k.status, 'data-tstat="' + k.id + '" class="ffl-mini ' + TSTAT[k.status][1] + '"') + '</div>' +
        (k.text ? '<div class="ffl-pre-line ffl-mu">' + esc(k.text) + '</div>' : '') +
        '<div class="ffl-task-f"><span' + (late ? ' class="ffl-tag err"' : '') + '>' + (k.due ? 'bis ' + fmtDate(k.due) : 'ohne Frist') + '</span>' +
        '<span>' + (who ? '→ ' + esc(who.name) : 'niemand zugeteilt') + '</span><span class="ffl-mu">' + esc(k.created_by) + ', ' + fmtDate(k.created) + '</span>' +
        '<span style="flex:1"></span>' + memberPicker('ffl-tkas-' + k.id, null, 'zuteilen …') + '<button type="button" class="ffl-sm" data-act="tkassign" data-id="' + k.id + '">OK</button>' +
        '<button type="button" class="ffl-q ffl-sm" data-act="tkdel" data-id="' + k.id + '" aria-label="Löschen">✕</button></div></div>';
    }).join('') + '</div>';
  }
  function teamsManage() {
    var tl = ui.teamsDraft || (ui.teamsDraft = (d.teams || []).map(function (x) { return { key: x.key, name: x.name, desc: x.desc }; }));
    var objs = (d.settings.defect_objects || []), routes = d.defect_routes || {};
    return '<div class="ffl-grid2" style="margin-top:14px"><div class="ffl-pbox"><div class="ffl-sh">Teams</div><p class="ffl-mu" style="margin-top:0">Jedes Team bekommt eine eigene Funktion „Team …“. ' +
      'Wer sie im Mitgliederprofil hat, sieht das Team in der Verwaltung – mit Aufgaben, Inventar und Nachrichten („Bescheid geben“).</p>' +
      tl.map(function (x, i) {
        return '<div class="ffl-form2" data-team="' + i + '" style="margin-bottom:8px"><div><label class="ffl-fl">Name</label><input type="text" data-tn="1" value="' + esc(x.name) + '" placeholder="z. B. IT & Technik"></div>' +
          '<div><label class="ffl-fl">Aufgaben (kurz)</label><div class="ffl-row" style="flex-wrap:nowrap"><input type="text" data-td="1" value="' + esc(x.desc) + '" placeholder="z. B. Netzwerk, Tablets">' +
          '<button type="button" class="ffl-q ffl-sm" data-act="teamdel" data-i="' + i + '" aria-label="Team entfernen">✕</button></div></div></div>';
      }).join('') + '<div class="ffl-row"><button type="button" class="ffl-sm" data-act="teamadd">+ Team</button><span style="flex:1"></span><button type="button" class="ffl-p" data-act="teamsave">Speichern</button></div></div>' +
      '<div class="ffl-pbox"><div class="ffl-sh">Mängel weiterleiten</div><p class="ffl-mu" style="margin-top:0">Meldet jemand einen Mangel an einem dieser Punkte, bekommt das Team automatisch eine Aufgabe.</p>' +
      '<table class="ffl-table"><tbody>' + objs.map(function (o) {
        return '<tr><td>' + esc(o) + '</td><td style="width:50%">' + sel([['', '– nur Gerätewarte / Mängel –']].concat((d.teams || []).map(function (x) { return [x.area, x.name]; })), routes[o] || '', 'data-route="' + esc(o) + '"') + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
  }
  function readTeams() {
    [].forEach.call(document.querySelectorAll('[data-team]'), function (b) { var x = ui.teamsDraft[+b.getAttribute('data-team')]; x.name = b.querySelector('[data-tn]').value; x.desc = b.querySelector('[data-td]').value; });
    return ui.teamsDraft;
  }
  function teamClick(act, t, id) {
    switch (act) {
      case 'team': ui.team = t.getAttribute('data-v'); ui.dev = null; ui.wsub = null; render(); return true;
      case 'tmadd':
        var tmm = pickMember('ffl-tmadd'); if (!tmm) return flash('err', 'Bitte eine Person aus der Liste wählen.'), true;
        post('team/member', { area: t.getAttribute('data-v'), member_id: tmm.id, on: true }, tmm.name + ' ist jetzt im Team.'); return true;
      case 'tmrm':
        var tmx = by(d.members, 'id')[id];
        if (confirm((tmx ? tmx.name : 'Person') + ' aus dem Team nehmen?')) post('team/member', { area: t.getAttribute('data-v'), member_id: id, on: false }, 'Aus dem Team genommen.'); return true;
      case 'tsub': ui.tsub = t.getAttribute('data-v'); ui.dev = null; render(); return true;
      case 'tkdone': ui.tDone = !ui.tDone; render(); return true;
      case 'tknew':
        var tt = val2('ffl-tktitle').trim(); if (!tt) return flash('err', 'Bitte einen Titel eingeben.'), true;
        var who = pickMember('ffl-tkwho');
        post('team/task', { area: t.getAttribute('data-v'), title: tt, text: val2('ffl-tktext'), due: val2('ffl-tkdue'), member_id: who ? who.id : 0, prio: document.getElementById('ffl-tkprio').checked }, 'Aufgabe angelegt.'); return true;
      case 'tkassign':
        var w2 = pickMember('ffl-tkas-' + id); if (!w2) return flash('err', 'Bitte einen Namen aus den Vorschlägen wählen.'), true;
        post('team/task', { id: id, member_id: w2.id }, w2.name + ' zugeteilt.'); return true;
      case 'tkdel': if (confirm('Aufgabe löschen?')) post('team/task', { id: id, 'delete': true }, 'Gelöscht.'); return true;
      case 'dsub': ui.dsub = t.getAttribute('data-v'); render(); return true;
      case 'dradd':
        var rd = val2('ffl-drd'), rt = val2('ffl-drtitle').trim();
        if (!rd || !rt) return flash('err', 'Bitte Datum und Thema angeben.'), true;
        post('drills', { rows: [{ date: rd, time: val2('ffl-drt'), title: rt, lead: val2('ffl-drlead'), unit: val2('ffl-dru') }] }, 'Termin eingetragen.'); return true;
      case 'drpaste':
        var rows = val2('ffl-drpaste').split(/\r?\n/).map(function (l) { var c = l.split(/\t|;/).map(function (x) { return x.trim(); }); return { date: parseDate(c[0]), time: (c[1] || '').replace('.', ':'), title: c[2] || '', lead: c[3] || '' }; })
          .filter(function (r) { return r.date && r.title; });
        if (!rows.length) return flash('err', 'Keine Zeilen erkannt – Spalten: Datum, Uhrzeit, Thema, Verantwortlich.'), true;
        post('drills', { rows: rows }, rows.length + ' Termine übernommen.'); return true;
      case 'drlist':
        // Unterschriftenliste wie bisher – Abmeldungen stehen schon als „entschuldigt“ drin
        var dr = (d.drills || []).filter(function (x) { return x.id === id; })[0], abs = {};
        (d.drill_absence || []).forEach(function (a) { if (a.drill_id === id) abs[a.member_id] = a; });
        var people = d.members.filter(function (m) { return m.active && (m.dept || 'einsatz') === 'einsatz' && (!dr.unit || m.unit === dr.unit); }).sort(function (a, b) { return a.name.localeCompare(b.name); });
        MYFPrint.printNow(MYFPrint.head('Anwesenheit ' + fmtDate(dr.date) + (dr.time ? ', ' + dr.time + ' Uhr' : ''), esc(dr.title)) +
          '<table class="pr-lines"><thead><tr><th style="width:34%">Name</th><th style="width:36%">Unterschrift</th><th>Bemerkung</th></tr></thead><tbody>' + people.map(function (m) {
            var a = abs[m.id];
            return '<tr><td>' + esc(m.name) + '</td><td>' + (a ? '<i>entschuldigt</i>' : '') + '</td><td>' + (a && a.reason ? esc(a.reason) : '') + '</td></tr>';
          }).join('') + '<tr><td>&nbsp;</td><td></td><td></td></tr><tr><td>&nbsp;</td><td></td><td></td></tr></tbody></table>', true);
        return true;
      case 'drdel': if (confirm('Termin löschen?')) post('drills', { 'delete': id }, 'Gelöscht.'); return true;
      case 'drical': var du = t.hasAttribute('data-v') ? t.getAttribute('data-v') : val2('ffl-drical').trim(), dl = du === '=screen' ? 'Dashboard-Kalender' : val2('ffl-drical-l').trim();
        if (!du) { flash('err', 'Bitte den Kalender-Link einfügen.'); return true; }
        api('POST', 'admin/drills', { ical_add: { url: du, label: dl } }).then(function (r) { flash(r.n ? 'ok' : 'err', r.message); return reload(); }, function (e) { flash('err', e.message); }); return true;
      case 'drcaldel': if (!confirm('Diesen Kalender trennen? Schon angelegte Zeilen bleiben, neue Termine aus diesem Kalender kommen nicht mehr.')) return true;
        post('drills', { ical_remove: +t.getAttribute('data-v') }, 'Kalender getrennt.'); return true;
      case 'drreload': api('POST', 'admin/drills', { reload: true }).then(function (r) { flash('ok', r.n + ' Termine aus dem Kalender gelesen.'); return reload(); }, function (e) { flash('err', e.message); }); return true;
      case 'dradopt': post('drills', { adopt: [t.getAttribute('data-v')] }, 'Als Zeile übernommen.'); return true;
      case 'drlink': post('drills', { link: id, cal_uid: t.getAttribute('data-v') }, 'Verknüpft – der Kalender ist jetzt führend.'); return true;
      case 'drfile':
        readFileData(document.getElementById('ffl-drfile')).then(function (data) {
          if (!data) return flash('err', 'Bitte eine Datei wählen.');
          post('drills', { file: data, label: val2('ffl-drflabel') }, 'Hochgeladen.');
        }); return true;
      case 'drfiledel': if (confirm('Datei entfernen?')) post('drills', { file_remove: +t.getAttribute('data-i') }, 'Entfernt.'); return true;
      case 'drprint':
        var k = t.getAttribute('data-v'), rowsP = (d.drills || []).filter(function (r) { return r.date.slice(0, 4) + (r.date.slice(5, 7) <= '06' ? ' · 1. Halbjahr' : ' · 2. Halbjahr') === k; });
        MYFPrint.printNow(MYFPrint.head('Dienstplan ' + k.replace(' · ', ' – ')) + '<table><thead><tr><th>Datum</th><th>Uhrzeit</th><th>Thema</th><th>Verantwortlich</th></tr></thead><tbody>' + rowsP.map(function (r) {
          return '<tr><td>' + fmtDate(r.date) + '</td><td>' + esc(r.time) + '</td><td>' + esc(r.title) + '</td><td>' + esc(r.lead) + '</td></tr>';
        }).join('') + '</tbody></table>', true); return true;
      case 'rankadd': readRanks().push({ name: '', short: '', from: '', months: 0, quals: '', note: '' }); ui.ranksOpen = true; render(); return true;
      case 'rankdel': readRanks().splice(+t.getAttribute('data-i'), 1); ui.ranksOpen = true; render(); return true;
      case 'ranksave':
        post('ranks', { ranks: readRanks().map(function (r) { return { name: r.name, short: r.short, from: r.from, months: +r.months || 0, quals: String(r.quals).split(';').map(function (x) { return x.trim(); }).filter(Boolean), note: r.note }; }) }, 'Dienstgrade gespeichert.')
          .then(function () { ui.ranksDraft = null; ui.ranksOpen = true; render(); }); return true;
      case 'rankreset': if (confirm('NRW-Vorgabe wiederherstellen?')) post('ranks', { reset: true }, 'Vorgabe wiederhergestellt.').then(function () { ui.ranksDraft = null; render(); }); return true;
      case 'promote':
        var pp = (d.promotions || []).filter(function (x) { return x.member_id === id; })[0];
        MYFUI.ask({ title: 'Beförderung', text: 'Neuer Dienstgrad für ' + (pp ? pp.name : '') + ':', value: t.getAttribute('data-v'), required: true, min: 1, ok: 'Weiter' }).then(function (nr) {
          if (!nr) return;
          return MYFUI.ask({ title: 'Beförderung', text: 'Befördert am (TT.MM.JJJJ):', value: today(), required: true, ok: 'Eintragen' }).then(function (pd) {
            var pm = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(String(pd || '').trim());
            if (pd === null) return; if (!pm) return flash('err', 'Datum bitte als TT.MM.JJJJ.');
            post('promote', { id: id, rank: nr, date: pm[3] + '-' + ('0' + pm[2]).slice(-2) + '-' + ('0' + pm[1]).slice(-2), congrats: confirm('Glückwunsch ins Postfach schicken?') }, 'Beförderung eingetragen.');
          });
        }); return true;
      case 'teamadd': readTeams().push({ key: '', name: '', desc: '' }); render(); return true;
      case 'teamdel': readTeams().splice(+t.getAttribute('data-i'), 1); render(); return true;
      case 'teamsave':
        var routes = {}; [].forEach.call(document.querySelectorAll('[data-route]'), function (el) { if (el.value) routes[el.getAttribute('data-route')] = el.value; });
        post('teams', { teams: readTeams().filter(function (x) { return x.name.trim(); }), defect_routes: routes }, 'Teams gespeichert.').then(function () { ui.teamsDraft = null; render(); }, function () {}); return true;
    }
    return false;
  }

  function dataClick(act, t, id) {
    switch (act) {
      case 'exploaded': api('GET', 'admin/export', null, 'set=list').then(function (r) { ui.exports = r; render(); }); return true;
      case 'exp':
        api('GET', 'admin/export', null, 'set=' + t.getAttribute('data-v')).then(function (r) { downloadCsv(t.getAttribute('data-v') + '-' + isoToday() + '.csv', [r.head].concat(r.rows)); }, function (e2) { flash('err', e2.message); });
        return true;
      case 'expall':
        Promise.all(ui.exports.map(function (x) { return api('GET', 'admin/export', null, 'set=' + x.key).then(function (r) { return { name: x.key + '.csv', text: csvText([r.head].concat(r.rows)) }; }); }))
          .then(function (files) {
            var a = document.createElement('a'); a.href = URL.createObjectURL(zip(files)); a.download = 'export-' + isoToday() + '.zip'; document.body.appendChild(a); a.click(); a.remove();
            flash('ok', files.length + ' Tabellen exportiert.');
          }, function (e2) { flash('err', e2.message); });
        return true;
      case 'impgo':
        post('import', { set: ui.impSet || Object.keys(IMPORTS)[0], rows: ui.impPrev2.rows }).then(function (r) {
          ui.impPrev2 = null; flash(r.errors.length ? 'warn' : 'ok', r.added + ' übernommen, ' + r.skipped + ' übersprungen.' + (r.errors.length ? ' ' + r.errors.join(' · ') : ''));
        });
        return true;
      case 'icsload': api('POST', 'admin/import/ics', {}).then(function (r) { ui.icsEv = r; render(); }, function (e2) { flash('err', e2.message); }); return true;
      case 'icsall': ui.icsEv.forEach(function (e) { if (!ui.icsFilter || e.title.toLowerCase().indexOf(ui.icsFilter.toLowerCase()) >= 0) e.sel = true; }); render(); return true;
      case 'icsimport':
        var rows = ui.icsEv.filter(function (e) { return e.sel; }).map(function (e) { return { title: e.title, start: e.start, end: e.end, place: e.place }; });
        if (!rows.length) return flash('err', 'Bitte Termine auswählen.'), true;
        post('import', { set: 'events', rows: rows }).then(function (r) { ui.icsEv = null; flash('ok', r.added + ' Übungen angelegt, ' + r.skipped + ' waren schon da.'); });
        return true;
      case 'restore':
        if (val2('ffl-restconf') !== 'WIEDERHERSTELLEN') return flash('err', 'Bitte WIEDERHERSTELLEN eintippen.'), true;
        var f = document.getElementById('ffl-restfile').files[0]; if (!f) return flash('err', 'Bitte die Sicherungsdatei wählen.'), true;
        f.text().then(function (txt) { return post('restore', { confirm: 'WIEDERHERSTELLEN', backup: JSON.parse(txt) }); }).then(function (r) { flash('ok', r.rows + ' Datensätze wiederhergestellt.'); }, function (e2) { flash('err', e2.message || 'Datei nicht lesbar.'); });
        return true;
    }
    return false;
  }

  // ---- Dienstpläne ------------------------------------------------------------------
  // Dienste: Jahresdienstplan (Übungsdienste) und Einteilungen (Grünanlagen, Wachen …)
  function tabDutiesMain() {
    var subs = [['plan', 'Jahresdienstplan']].concat(d.incidents ? [['ueb', 'Übungen & Teilnahme']] : []), cur = ui.dsub || 'plan';
    return '<div class="ffl-subtabs" style="margin-top:12px">' + subs.map(function (x) {
      return '<button type="button" data-act="dsub" data-v="' + x[0] + '" aria-selected="' + (cur === x[0]) + '">' + x[1] + '</button>';
    }).join('') + '</div>' + (cur === 'plan' ? drillsPanel() : cur === 'ueb' && d.incidents ? incidentList('uebung') : tabDuties('duties'));
  }
  function parseDate(x) {
    x = String(x || '').trim();
    var m = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/.exec(x); if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    return /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : '';
  }
  // Kalender als Grundlage des Dienstplans: Termine kommen aus dem iCal-Link (Thema, Verantwortliche, Zeiten), von Hand bleibt möglich
  function drillCalBox() {
    var c = d.drill_cal || {}, cals = c.cals || [], list = d.drills || [], nCal = list.filter(function (r) { return r.source === 'kalender'; }).length, nBoth = list.filter(function (r) { return r.source === 'beides'; }).length, dupes = list.filter(function (r) { return r.dupe_of; });
    var h = '<div class="ffl-pbox ffl-drcal"><div class="ffl-sh">Kalender als Grundlage<em>' + (cals.length ? (c.ok ? 'laufend abgeglichen' : (function (n) { return n > 1 ? n + ' Kalender gerade nicht erreichbar' : 'ein Kalender gerade nicht erreichbar'; })(cals.filter(function (x) { return x.err; }).length)) + (c.at ? ' · Stand ' + fmtDT(c.at).slice(-5) + ' Uhr' : '') : 'aus') + '</em></div>';
    if (!cals.length) h += '<p class="ffl-mu" style="margin-top:0">Gibt es den Dienstplan schon als Kalender (z. B. in Alamos, mit Thema und Vorbereitern)? Dann hier den <b>öffentlichen iCal-Link</b> eintragen – Wehrwerk liest die Termine, zeigt sie den Mitgliedern, im Kalender-Abo und auf dem Dashboard und erkennt doppelt Eingetragenes. ' +
      'Liegen Dienstabende und Lehrgänge in <b>verschiedenen Kalendern</b>, einfach mehrere verbinden.</p>';
    else h += '<div class="ffl-calconns">' + cals.map(function (k) {
      return '<div class="ffl-calconn"><div><input type="text" value="' + esc(k.label) + '" data-calname="' + k.i + '" aria-label="Bezeichnung" title="Bezeichnung ändern"><span class="ffl-mu">' + esc(k.host) + (k.screen ? ' · wie Dashboard' : '') + '</span></div>' +
        '<span class="ffl-chip ' + (k.err ? 'st-bad' : 'st-ok') + '">' + (k.err ? 'nicht erreichbar seit ' + fmtDT(k.err).slice(-5) + ' – letzter Stand' : k.n + (k.n === 1 ? ' Termin' : ' Termine')) + '</span>' +
        '<button type="button" class="ffl-q ffl-sm" data-act="drcaldel" data-v="' + k.i + '" title="Diesen Kalender trennen – schon angelegte Zeilen bleiben">Trennen</button></div>';
    }).join('') + '</div>' +
      '<div class="ffl-row" style="gap:16px;flex-wrap:wrap;margin-top:8px"><span><b>' + c.n + '</b> Termine aus ' + cals.length + (cals.length === 1 ? ' Kalender' : ' Kalendern') + '</span><span><b>' + nBoth + '</b> davon als eigene Zeile</span>' + (dupes.length ? '<span class="ffl-chip st-warn">' + dupes.length + ' möglicherweise doppelt</span>' : '') +
      '<span style="flex:1"></span><button type="button" class="ffl-sm" data-act="drreload">Jetzt neu laden</button></div>' +
      '<p class="ffl-mu" style="margin:6px 0 0">Neue und geänderte Termine kommen automatisch (spätestens nach 15 Minuten) in den Mitgliederbereich, auf die Website, die Dashboards und ins Kalender-Abo – „Übernehmen“ ist nicht nötig. Abmeldungen und Übungen legen die Zeile selbst an.</p>';
    h += '<div class="ffl-caladd"><div class="ffl-fl">' + (cals.length ? 'Weiteren Kalender verbinden' : 'Kalender verbinden') + '</div><div class="ffl-row"><input type="text" id="ffl-drical-l" placeholder="Bezeichnung, z. B. Dienstabende" style="flex:0 1 220px;width:auto">' +
      '<input type="url" id="ffl-drical" placeholder="https://… oder webcal://…/cal.ics" style="flex:1 1 300px;width:auto"><button type="button" class="ffl-p" data-act="drical">Verbinden</button>' +
      (c.screen_set && !c.screen_used ? '<button type="button" class="ffl-q ffl-sm" data-act="drical" data-v="=screen" title="Denselben Kalender wie das Dashboard im Besprechungsraum verwenden">Dashboard-Kalender nehmen</button>' : '') + '</div></div>';
    h += '<p class="ffl-mu" style="margin:10px 0 0">Die Termine sind <b>dynamisch</b>: Wehrwerk gleicht alle Kalender alle 15 Minuten ab. Ändert sich dort Datum, Uhrzeit, Thema oder wer verantwortlich ist, steht es danach überall so. Wird ein Termin gelöscht, verschwindet er bei den Mitgliedern. ' +
      'Bei Lehrgängen bedeutet „Verantwortlich“ im Kalender: wer dabei ist. Die Links bleiben auf dem Server und erscheinen nirgends im Browser.</p>';
    return h + '</div>';
  }
  function drillsPanel() {
    var list = d.drills || [], now = isoToday();
    var half = {};
    list.forEach(function (r) { var k = r.date.slice(0, 4) + (r.date.slice(5, 7) <= '06' ? ' · 1. Halbjahr' : ' · 2. Halbjahr'); (half[k] = half[k] || []).push(r); });
    var h = drillCalBox() + '<div class="ffl-grid2" style="margin-top:14px"><div class="ffl-pbox"><div class="ffl-sh">Termine eintragen' + ((d.drill_cal || {}).set ? '<em>für alles, was nicht im Kalender steht</em>' : '') + '</div>' +
      '<div class="ffl-form2"><div><label class="ffl-fl">Datum</label><input type="date" id="ffl-drd"></div><div><label class="ffl-fl">Uhrzeit</label><input type="time" id="ffl-drt" value="19:30"></div>' +
      '<div class="span2"><label class="ffl-fl">Thema</label><input type="text" id="ffl-drtitle" placeholder="z. B. Technische Hilfeleistung – VU mit eingeklemmter Person"></div>' +
      '<div class="span2"><label class="ffl-fl">Verantwortlich</label><input type="text" id="ffl-drlead" list="ffl-drlead-l" placeholder="z. B. Gruppe 1 / B. Muster – Name tippen">' +
        sug('ffl-drlead-l', (d.drills || []).map(function (x) { return x.leader; }).concat(['Gruppe 1', 'Gruppe 2', 'Gruppe 3', 'Wehrführung', 'Zugführung']).concat(d.members.filter(function (m) { return m.active; }).map(function (m) { return m.name; }))) + '</div>' +
      (multiUnit() ? '<div class="span2"><label class="ffl-fl">für</label>' + sel([['', 'alle Einheiten']].concat(unitKeys().map(function (k) { return [k, unitName(k)]; })), '', 'id="ffl-dru"') + '</div>' : '') + '</div>' +
      '<div class="ffl-row" style="margin-top:10px"><button type="button" class="ffl-p" data-act="dradd">Termin hinzufügen</button></div>' +
      '<details style="margin-top:12px"><summary class="ffl-mu" style="cursor:pointer">Viele auf einmal: aus Excel einfügen</summary>' +
      '<p class="ffl-mu">Spalten: Datum · Uhrzeit · Thema · Verantwortlich (aus Excel markieren und kopieren).</p><textarea id="ffl-drpaste" rows="5" placeholder="12.01.2027&#9;19:30&#9;Atemschutz – Innenangriff&#9;Zugführung"></textarea>' +
      '<button type="button" class="ffl-sm" style="margin-top:6px" data-act="drpaste">Übernehmen</button></details></div>' +
      '<div class="ffl-pbox"><div class="ffl-sh">Dienstplan als PDF<em>zum Anschauen für alle</em></div>' +
      ((d.drill_files || []).length ? '<ul class="ffl-files">' + d.drill_files.map(function (f, i) {
        return '<li><a href="' + esc(f.url) + '" target="_blank" rel="noopener">📄 ' + esc(f.label) + '</a><span class="ffl-mu">' + fmtDate(f.added) + '</span><button type="button" class="ffl-q ffl-sm" data-act="drfiledel" data-i="' + i + '">✕</button></li>';
      }).join('') + '</ul>' : '<p class="ffl-mu">Noch keine Datei.</p>') +
      '<label class="ffl-fl">Bezeichnung</label><input type="text" id="ffl-drflabel" placeholder="z. B. Dienstplan 1. Halbjahr 2027">' +
      '<label class="ffl-fl">Datei (PDF oder Foto)</label><input type="file" id="ffl-drfile" accept="application/pdf,image/*">' +
      '<div class="ffl-row" style="margin-top:10px"><button type="button" class="ffl-p" data-act="drfile">Hochladen</button></div></div></div>';
    if (!list.length) return h + '<p class="ffl-mu">Noch keine Termine – aus dem Kalender oder von Hand.</p>';
    var calOn = (d.drill_cal || {}).set;
    Object.keys(half).forEach(function (k) {
      h += '<div class="ffl-sec"><div class="ffl-sh">' + esc(k) + '<em>' + half[k].length + ' Termine</em><button type="button" class="ffl-sm" style="margin-left:auto" data-act="drprint" data-v="' + esc(k) + '">Drucken</button></div>' +
        '<div class="ffl-scroll"><table class="ffl-table"><thead><tr><th>Datum</th><th>Thema</th><th>Verantwortlich</th>' + (multiUnit() ? '<th>für</th>' : '') + (calOn ? '<th>Herkunft</th>' : '') + '<th>abgemeldet</th><th></th></tr></thead><tbody>' + half[k].map(function (r) {
          var ab = (d.drill_absence || []).filter(function (a) { return a.drill_id === r.id; }), multi = r.end_date && r.end_date > r.date;
          var src = r.source === 'kalender' ? '<span class="ffl-chip st-no" title="kommt laufend aus dem Kalender – Zeile wird beim ersten Abmelden oder für die Anwesenheitsliste angelegt">' + esc(r.cal_label || 'Kalender') + ' · live</span>' : r.source === 'beides' ? '<span class="ffl-chip st-ok" title="im Kalender und als eigene Zeile – der Kalender bleibt führend">' + esc(r.cal_label || 'Kalender') + ' ✓ live</span>' : r.source === 'entfernt' ? '<span class="ffl-chip st-bad" title="stand im Kalender, ist dort aber gelöscht – Mitglieder sehen ihn nicht mehr">aus dem Kalender entfernt</span>' : '<span class="ffl-chip st-open" title="nur hier eingetragen, nicht im Kalender">von Hand</span>';
          if (r.cal_kind === 'lehrgang') src += ' <span class="ffl-chip st-no">Lehrgang</span>';
          if (r.dupe_of) src += '<div class="ffl-mu" style="font-size:12px;margin-top:4px">möglicherweise doppelt mit „' + esc(r.dupe_title) + '“ <button type="button" class="ffl-q ffl-sm" style="padding:0 4px" data-act="drlink" data-id="' + r.id + '" data-v="' + esc(r.dupe_of) + '">ist derselbe Termin</button></div>';
          return '<tr' + (r.date < now ? ' class="is-off"' : '') + (r.dupe_of ? ' style="background:var(--tint-warn)"' : '') + '><td style="white-space:nowrap"><b>' + fmtDate(r.date) + (multi ? ' – ' + fmtDate(r.end_date) : '') + '</b>' + (r.time ? '<div class="ffl-mu">' + esc(r.time) + (r.time_to && !multi ? '–' + esc(r.time_to) : '') + ' Uhr</div>' : '') + '</td><td>' + esc(r.title) + (r.topic && r.title.toLowerCase().indexOf(r.topic.toLowerCase()) < 0 ? '<div class="ffl-mu">' + esc(r.topic) + '</div>' : '') + (r.note ? '<div class="ffl-mu" style="font-size:12px">' + esc(r.note) + '</div>' : '') + '</td><td>' + (r.cal_kind === 'lehrgang' && r.lead ? '<span class="ffl-mu" style="font-size:12px">dabei:</span> ' : '') + esc(r.lead) + '</td>' +
            (multiUnit() ? '<td>' + (r.unit ? esc(unitShort(r.unit)) : 'alle') + '</td>' : '') + (calOn ? '<td>' + src + '</td>' : '') +
            '<td>' + (ab.length ? '<span title="' + esc(ab.map(function (a) { return a.name + (a.reason ? ' (' + a.reason + ')' : ''); }).join(', ')) + '">' + ab.length + '</span>' : '–') + '</td>' +
            '<td style="white-space:nowrap">' + (r.id ? '<button type="button" class="ffl-sm" data-act="drlist" data-id="' + r.id + '">Anwesenheitsliste</button> <button type="button" class="ffl-q ffl-sm" data-act="drdel" data-id="' + r.id + '" aria-label="Löschen" title="' + (r.source === 'beides' ? 'Nur die Zeile löschen – der Kalendertermin bleibt und taucht wieder auf' : 'Löschen') + '">✕</button>'
              : '<button type="button" class="ffl-sm" data-act="dradopt" data-v="' + esc(r.cal_uid) + '" title="Nur nötig, wenn du den Termin in Wehrwerk ändern möchtest – sonst kommt alles automatisch aus dem Kalender">Bearbeiten</button>') + '</td></tr>';
        }).join('') + '</tbody></table></div></div>';
    });
    return h;
  }
  function tabDuties(area) {
    area = area || 'duties';
    var strecke = area === 'strecke';
    var lists = (d.duty_lists || []).filter(function (l) { return (l.area || 'duties') === area; });
    ui.dlArea = area;
    var asgAll = group(d.duty_assign || [], 'slot_id'), todayIso = isoToday();
    // Je Abfrage: Termine, nächster Termin, wie viele fehlen – daraus Gruppe und Statuszeile
    function info(l) {
      var all = (d.duty_slots || []).filter(function (s) { return s.list_id === l.id; }), fut = all.filter(function (s) { return !(s.date && s.date < todayIso); });
      var miss = fut.reduce(function (n, s) { var k = (asgAll[s.id] || []).length; return n + (s.min && k < s.min ? s.min - k : 0); }, 0);
      var next = fut.map(function (s) { return s.date; }).filter(Boolean).sort()[0] || '', last = all.map(function (s) { return s.date; }).filter(Boolean).sort().pop() || '';
      var grp = !l.active || (all.length && !fut.length) ? 'past' : !all.length ? 'draft' : 'run';
      var line = !l.active ? 'abgeschlossen' : !all.length ? 'noch keine Termine' : !fut.length ? 'vorbei' + (last ? ' seit ' + fmtDate(last).slice(0, 6) : '') :
        (miss ? '<i>' + miss + ' fehlen</i>' : 'besetzt') + (next ? ' · nächster ' + fmtDate(next).slice(0, 6) : '');
      return { grp: grp, line: line, miss: miss, next: next };
    }
    var inf = {}; lists.forEach(function (l) { inf[l.id] = info(l); });
    var run = lists.filter(function (l) { return inf[l.id].grp === 'run'; }).sort(function (x, y) { return (inf[y.id].miss > 0) - (inf[x.id].miss > 0) || (inf[x.id].next < inf[y.id].next ? -1 : 1); });
    var draft = lists.filter(function (l) { return inf[l.id].grp === 'draft'; }), past = lists.filter(function (l) { return inf[l.id].grp === 'past'; });
    var cur = (ui.dlBy || {})[area] || ((run[0] || draft[0] || lists[0]) || {}).id;
    function item(l) { return '<button type="button" class="ffl-dlitem' + (l.id === cur ? ' is-cur' : '') + '" data-act="dlpick" data-id="' + l.id + '" data-q="' + esc(l.title.toLowerCase()) + '"><b>' + esc(l.title) + '</b><span>' + inf[l.id].line + '</span></button>'; }
    var curPast = past.some(function (l) { return l.id === cur; });
    var narrow = window.innerWidth <= 900, curL = lists.filter(function (l) { return l.id === cur; })[0];
    var h = '<div class="ffl-dlwrap"><aside class="ffl-dlside"><button type="button" class="ffl-sm ffl-p ffl-dlnew" data-act="dlnew">' + (strecke ? '+ Termine Übungsstrecke' : '+ Neue Abfrage') + '</button>' +
      // Handy: Liste zugeklappt, oben steht die gewählte Abfrage
      '<details class="ffl-dllist"' + (narrow && curL ? '' : ' open') + '><summary>' + (curL ? 'Abfrage: <b>' + esc(curL.title) + '</b>' : 'Abfragen') + ' <span class="ffl-mu">(' + lists.length + ')</span></summary>' +
      (lists.length > 6 ? '<input type="search" id="ffl-dlq" placeholder="Abfrage suchen …" aria-label="Abfrage suchen">' : '') +
      (run.length ? '<div class="ffl-dlgrp">Laufend</div>' + run.map(item).join('') : '') +
      (draft.length ? '<div class="ffl-dlgrp">Ohne Termine</div>' + draft.map(item).join('') : '') +
      (past.length ? '<details class="ffl-dlpast"' + (curPast ? ' open' : '') + '><summary class="ffl-dlgrp">Vorbei & abgeschlossen (' + past.length + ')</summary>' + past.map(item).join('') + '</details>' : '') +
      (lists.length ? '' : '<p class="ffl-mu">' + (strecke ? 'Noch keine Übungsstrecken-Termine.' : 'Noch keine Abfragen.') + '</p>') +
      '</details></aside><div class="ffl-dlmain">';
    if (strecke) h += streckeTodo(lists);
    if (ui.dlNew) h += '<div class="ffl-pbox"><div class="ffl-row"><input type="text" id="ffl-dltitle" placeholder="' + (strecke ? 'z. B. Übungsstrecke ' + (new Date().getFullYear() + 1) : 'Worum geht es? z. B. Grünanlagen-Pflege 2027, Volkstrauertag, Brandsicherheitswache Schützenfest') + '" style="flex:1 1 260px;width:auto">' +
      '<label class="ffl-check"><input type="checkbox" id="ffl-dlself"' + (strecke ? '' : ' checked') + '> Mitglieder tragen sich selbst ein</label><button type="button" class="ffl-p" data-act="dlcreate">Anlegen</button></div></div>';
    var l = by(lists, 'id')[cur];
    if (!l) return h + '</div></div>';
    var slots = (d.duty_slots || []).filter(function (s) { return s.list_id === l.id; }), asg = group(d.duty_assign || [], 'slot_id');
    if (l.active && inf[l.id].grp === 'past') h += '<div class="ffl-msg" style="margin-top:0">Alle Termine dieser Abfrage sind vorbei. <button type="button" class="ffl-sm" data-act="dlclose">Abfrage abschließen</button> <span class="ffl-mu">– sie verschwindet bei den Mitgliedern und rutscht nach unten.</span></div>';
    var act = d.members.filter(function (m) { return m.active && (!strecke || m.agt); });
    var memById = by(d.members, 'id');
    if (!strecke) h += '<details class="ffl-dlhelp"><summary>So funktioniert’s</summary><p class="ffl-mu">Eine <b>Hauptabfrage</b> (z. B. „Brandsicherheitswache Schützenfest“) mit <b>mehreren Gruppen oder Terminen</b> darunter – jede mit eigener Personenzahl, ' +
      'z. B. Samstag 6 Leute, Sonntag 8 Leute. Mitglieder sehen jede Abfrage unter Termine → Abfragen und bei fehlenden Leuten auf der Startseite („Hilf mit“). Änderungen an Überschrift und Text werden beim Verlassen des Feldes gespeichert. Ist eine Abfrage vorbei, „sichtbar“ ausschalten – sie wandert dann zu „Vorbei & abgeschlossen“.</p></details>';
    h += '<div class="ffl-pbox" data-dlform="' + l.id + '">' + (strecke ? '' : '<label class="ffl-fl" style="margin-top:0">Worum geht es? (Überschrift für alle)</label>') +
      '<input type="text" data-dlf="title" value="' + esc(l.title) + '" style="width:100%;font-weight:700"><div class="ffl-row" style="margin-top:8px">' +
      '<label class="ffl-check"><input type="checkbox" data-dlf="self_signup"' + (l.self_signup ? ' checked' : '') + '> selbst eintragen erlaubt</label>' +
      '<label class="ffl-check"><input type="checkbox" data-dlf="active"' + (l.active ? ' checked' : '') + '> sichtbar</label>' +
      '</div>' +
      (strecke ? '' : '<label class="ffl-fl">Was ist zu tun? Treffpunkt, Kleidung, Dauer …</label>') +
      '<input type="text" data-dlf="note" value="' + esc(l.note) + '" placeholder="z. B. „Hecke schneiden und Rasen mähen – freitags 17:00 Uhr am Gerätehaus, Handschuhe mitbringen“" style="margin-top:' + (strecke ? '8px' : '0') + '"></div>';
    h += '<div class="ffl-pbox"><b>Gruppe / Termin hinzufügen</b><div class="ffl-row ffl-dsrow" style="margin-top:6px"><input type="text" id="ffl-dslabel" placeholder="Bezeichnung, z. B. „Samstag Aufbau“ oder „Wache Sonntag“" style="flex:1 1 220px;width:auto">' +
      '<input type="date" id="ffl-dsdate" style="width:auto"><input type="time" id="ffl-dstime1" style="width:auto"><span class="ffl-dsppl"><span class="ffl-mu">Personen mind.</span><input type="number" id="ffl-dsmin1" value="0" min="0" style="width:64px"><span class="ffl-mu">bis</span><input type="number" id="ffl-dscap1" value="6" min="1" style="width:70px"></span>' +
      '<button type="button" class="ffl-sm ffl-p" data-act="dsone" data-id="' + l.id + '">Hinzufügen</button></div>' +
      '<div class="ffl-mu" style="margin-top:4px">Ohne Datum = Gruppe ohne festen Termin. Mehrere Gruppen für dieselbe Abfrage einfach nacheinander anlegen.</div>' +
      '<details style="margin-top:8px"><summary class="ffl-mu" style="cursor:pointer">Terminserie erzeugen (z. B. alle 3 Wochen)</summary><div class="ffl-row" style="margin-top:6px"><label class="ffl-mu">ab</label><input type="date" id="ffl-dsstart" style="width:auto">' +
      '<label class="ffl-mu">alle</label><input type="number" id="ffl-dsevery" value="3" min="0" style="width:70px"><span class="ffl-mu">Wochen,</span>' +
      '<input type="number" id="ffl-dscount" value="10" min="1" style="width:70px"><span class="ffl-mu">Termine, je</span><span class="ffl-mu">mind.</span><input type="number" id="ffl-dsmin" value="0" min="0" style="width:64px"><span class="ffl-mu">bis</span><input type="number" id="ffl-dscap" value="3" min="1" style="width:70px"><span class="ffl-mu">Personen, Uhrzeit</span>' +
      '<input type="time" id="ffl-dstime" style="width:auto"><button type="button" class="ffl-sm" data-act="dsgen" data-id="' + l.id + '">Erzeugen</button></div></details></div>';
    h += '<div class="ffl-scroll"><table class="ffl-table ffl-stack ffl-slottab"><thead><tr><th>Gruppe / Termin</th><th>Leute (mind.–max.)</th><th>' + (strecke ? 'Eingeteilt' : 'Zugesagt / eingeteilt') + '</th><th></th></tr></thead><tbody>' + slots.map(function (s) {
      var a = asg[s.id] || [], full = a.length >= s.capacity, past = s.date && s.date < isoToday();
      return '<tr' + (past ? ' class="is-off"' : '') + '><td class="name"><b>' + esc(s.label) + '</b>' + (s.date ? '<div class="ffl-mu">' + fmtDate(s.date) + (s.time ? ', ' + esc(s.time) + ' Uhr' : '') + '</div>' : '') + '</td>' +
        '<td data-l="Leute (mind.–max.)" style="white-space:nowrap">' + (s.min && a.length < s.min && !past ? '<span class="ffl-chip st-bad">' + a.length + ' – fehlen ' + (s.min - a.length) + '</span>' : '<span class="ffl-chip ' + (full ? 'st-ok' : 'st-open') + '">' + a.length + ' / ' + s.capacity + '</span>') +
          '<div class="ffl-row ffl-slotminmax" style="margin-top:4px"><input type="number" min="0" data-slotf="min" data-id="' + s.id + '" value="' + (s.min || 0) + '" title="mindestens"><span class="ffl-mu">–</span><input type="number" min="1" data-slotf="capacity" data-id="' + s.id + '" value="' + s.capacity + '" title="höchstens"></div></td><td data-l="Zugesagt / eingeteilt" class="full"><div class="ffl-chips">' + a.map(function (x) {
          if (strecke && s.date && s.date <= isoToday()) {
            // Teilnahme bestätigen: zählt als jährliche Übungsstrecke im Atemschutz-Nachweis
            return '<span class="ffl-chip ' + (x.attended ? 'st-ok' : x.attended === false ? 'st-no' : 'st-open') + '">' + esc(x.name) +
              ' <a href="#" data-act="dsatt" data-v="' + x.member_id + '" data-id="' + s.id + '" data-on="1" title="teilgenommen" style="text-decoration:none">✓</a>' +
              ' <a href="#" data-act="dsatt" data-v="' + x.member_id + '" data-id="' + s.id + '" data-on="0" title="nicht teilgenommen" style="text-decoration:none">✕</a></span>';
          }
          var mi = strecke && memById[x.member_id] ? agtInfo(memById[x.member_id]) : null;
          return '<span class="ffl-chip ' + (x.self ? 'st-ok' : 'st-open') + '"' + (mi && mi.due ? ' title="Übungsstrecke fällig ' + fmtDate(mi.due) + '"' : '') + '>' + esc(x.name) + ' <a href="#" data-act="dsrm" data-v="' + x.member_id + '" data-id="' + s.id + '" style="text-decoration:none">✕</a></span>';
        }).join('') + '</div>' + (!full ? '<div class="ffl-row" style="margin-top:4px">' + memberPicker('ffl-dsadd-' + s.id, act, 'Name tippen …') + '<button type="button" class="ffl-sm" data-act="dsadd" data-id="' + s.id + '">+</button></div>' : '') + '</td>' +
        '<td class="del"><button type="button" class="ffl-q ffl-sm" data-act="dsdel" data-id="' + s.id + '">✕</button></td></tr>';
    }).join('') + (slots.length ? '' : '<tr><td colspan="4" class="ffl-mu">Noch keine Termine.</td></tr>') + '</tbody></table></div>' +
      '<div class="ffl-row" style="margin-top:8px"><button type="button" class="ffl-sm" data-act="dlprint" data-id="' + l.id + '">Drucken (Aushang)</button>' +
      '<button type="button" class="ffl-q ffl-sm" style="color:var(--red-tx);margin-left:auto" data-act="dldel" data-id="' + l.id + '">' + (strecke ? 'Termine löschen' : 'Abfrage löschen') + '</button></div>';
    return h + '</div></div>';
  }
  // Übungsstrecke: wer ist bald fällig und noch nicht eingeteilt?
  function streckeTodo(lists) {
    var ids = lists.map(function (l) { return l.id; }), now = isoToday(), soon = addDays(now, 90);
    var future = {};
    (d.duty_slots || []).forEach(function (s) { if (ids.indexOf(s.list_id) >= 0 && s.date && s.date >= now) (d.duty_assign || []).forEach(function (a) { if (a.slot_id === s.id) future[a.member_id] = s.date; }); });
    var need = d.members.filter(function (m) { if (!m.active || !m.agt || future[m.id]) return false; var i = agtInfo(m); return !i.due || i.due <= soon; });
    need.sort(function (a, b) { return (agtInfo(a).due || '0') < (agtInfo(b).due || '0') ? -1 : 1; });
    return '<div class="ffl-pbox"><div class="ffl-sh" style="font-size:18px">Noch einzuteilen<em>Übungsstrecke fällig in den nächsten 3 Monaten, überfällig oder nie</em></div>' +
      (need.length ? '<div class="ffl-chips">' + need.map(function (m) {
        var i = agtInfo(m);
        return '<span class="ffl-chip ' + (i.state === 'over' || i.state === 'none' ? 'st-bad' : 'st-warn') + '">' + esc(m.name) + ' · ' + (i.due ? 'fällig ' + fmtDate(i.due) : 'noch nie') + '</span>';
      }).join('') + '</div>' : '<p class="ffl-mu" style="margin:0">Alle Atemschutzgeräteträger sind eingeteilt oder noch lange gültig.</p>') +
      '<p class="ffl-mu" style="margin:8px 0 0">Nach dem Termin bei jeder Person ✓ (teilgenommen) klicken – das wird als Übungsstrecke im Atemschutz-Nachweis gespeichert.</p></div>';
  }
  function dutyPrint(l) {
    var slots = (d.duty_slots || []).filter(function (s) { return s.list_id === l.id; }), asg = group(d.duty_assign || [], 'slot_id');
    var max = Math.max.apply(null, slots.map(function (s) { return s.capacity; }).concat([3]));
    var cols = []; for (var i = 0; i < max; i++) cols.push(i);
    return MYFPrint.head(l.title) + '<table><thead><tr><th>Termin</th>' + cols.map(function () { return '<th>Name</th>'; }).join('') + '</tr></thead><tbody>' + slots.map(function (s) {
      var a = asg[s.id] || [];
      return '<tr><td><b>' + esc(s.label) + '</b>' + (s.date ? ' · ' + fmtDate(s.date) : '') + (s.time ? ' · ' + esc(s.time) + ' Uhr' : '') + (s.min ? '<br><small>mind. ' + s.min + ' Personen</small>' : '') + '</td>' + cols.map(function (i) {
        if (i >= s.capacity) return '<td style="background:#eee"></td>';
        if (!a[i] && s.min && i < s.min) return '<td style="border-bottom:2px solid #d6001c"></td>';
        var n = a[i] ? a[i].name.split(',') : null; return '<td>' + (n ? esc((n[1] || '').trim().charAt(0) + '. ' + n[0].trim()) : '') + '</td>';
      }).join('') + '</tr>';
    }).join('') + '</tbody></table>' + (l.note ? '<p>' + esc(l.note) + '</p>' : '');
  }

  // ---- Aushänge & Einladungen --------------------------------------------------------
  function tabBoard() {
    var h = '<div class="ffl-pbox" style="margin-top:14px"><div class="ffl-sh">Neuer Aushang</div><div class="ffl-form2">' +
      '<div><label class="ffl-fl">Titel</label><input type="text" id="ffl-bdtitle" placeholder="z. B. Generalversammlung 06.11.2026"></div>' +
      '<div><label class="ffl-fl">Datei (PDF oder Foto, optional)</label><input type="file" id="ffl-bdfile" accept="application/pdf,image/*"></div></div>' +
      '<label class="ffl-fl">Text</label><textarea id="ffl-bdtext" rows="3" style="min-height:80px"></textarea><div class="ffl-row" style="margin-top:8px">' +
      '<label class="ffl-check"><input type="checkbox" id="ffl-bdrsvp"> mit Zu-/Absage</label><label class="ffl-mu">Anmeldung bis</label><input type="date" id="ffl-bddead" style="width:auto">' +
      '<label class="ffl-mu">anzeigen bis</label><input type="date" id="ffl-bdends" style="width:auto"><label class="ffl-check"><input type="checkbox" id="ffl-bdscreen"> auch auf dem Dashboard</label>' +
      '<label class="ffl-check"><input type="checkbox" id="ffl-bdnotify" checked> alle benachrichtigen</label><button type="button" class="ffl-go" style="margin-left:auto" data-act="bdcreate">Veröffentlichen</button></div></div>';
    (d.board || []).forEach(function (b) {
      var open = ui.bdOpen === b.id;
      h += '<div class="ffl-idea"><div class="ffl-row" style="justify-content:space-between"><b style="font-size:17px">' + esc(b.title) + '</b><span class="ffl-mu">' + fmtDate(b.created) + ' · ' + esc(b.created_by) + (b.ends ? ' · bis ' + fmtDate(b.ends) : '') + '</span></div>' +
        (b.text ? '<div class="ffl-pre-line">' + esc(b.text) + '</div>' : '') + (b.file_url ? '<a href="' + esc(b.file_url) + '" target="_blank" rel="noopener">📄 ' + esc(b.file_name || 'Datei öffnen') + '</a>' : '') +
        (b.rsvp ? '<div class="ffl-row" style="margin-top:8px"><span class="ffl-chip st-ok">' + b.yes + ' Zusagen</span><span class="ffl-chip st-no">' + b.no + ' Absagen</span>' +
          (b.rsvp_deadline ? '<span class="ffl-mu">Anmeldung bis ' + fmtDate(b.rsvp_deadline) + '</span>' : '') + '<button type="button" class="ffl-sm" data-act="bdlist" data-id="' + b.id + '">' + (open ? 'Liste zuklappen' : 'Wer kommt?') + '</button></div>' : '') +
        (open ? '<table class="ffl-table"><tbody>' + b.answers.map(function (r) { return '<tr><td>' + esc(r.name) + '</td><td>' + (r.answer === 'yes' ? '✓ ' + r.persons : '✕') + '</td><td class="ffl-mu">' + esc(r.note) + '</td></tr>'; }).join('') + '</tbody></table>' +
          '<button type="button" class="ffl-sm" data-act="bdcsv" data-id="' + b.id + '">Als CSV</button>' : '') +
        '<div class="ffl-row" style="margin-top:8px"><button type="button" class="ffl-q ffl-sm" style="color:var(--red-tx)" data-act="bddel" data-id="' + b.id + '">Löschen</button></div></div>';
    });
    return h;
  }
  function dutyBoardClick(act, t, id) {
    switch (act) {
      case 'dlnew': ui.dlNew = !ui.dlNew; render(); return true;
      case 'dlcreate': post('duty', { title: val2('ffl-dltitle'), self_signup: document.getElementById('ffl-dlself').checked, area: ui.dlArea || 'duties' }, 'Angelegt.').then(function (r) { ui.dlNew = false; (ui.dlBy = ui.dlBy || {})[ui.dlArea || 'duties'] = r.id; render(); }); return true;
      case 'dsatt': post('duty/assign', { slot_id: id, member_id: +t.getAttribute('data-v'), attended: t.getAttribute('data-on') === '1' }, t.getAttribute('data-on') === '1' ? 'Teilnahme bestätigt – im Atemschutz-Nachweis eingetragen.' : 'Als nicht teilgenommen markiert.'); return true;
      case 'dlpick': (ui.dlBy = ui.dlBy || {})[ui.dlArea || 'duties'] = id; render(); return true;
      case 'dlclose': var dc = document.querySelector('[data-dlf=active]'); if (dc) { dc.checked = false; dc.dispatchEvent(new Event('change', { bubbles: true })); } return true;
      case 'dlsave':
        var b = { id: id }; [].forEach.call(t.closest('[data-dlform]').querySelectorAll('[data-dlf]'), function (el) { b[el.getAttribute('data-dlf')] = el.type === 'checkbox' ? el.checked : el.value; });
        post('duty', b, 'Gespeichert.'); return true;
      case 'dldel': if (confirm('Dienstplan mit allen Terminen löschen?')) post('duty', { id: id, 'delete': true }, 'Gelöscht.').then(function () { if (ui.dlBy) ui.dlBy[ui.dlArea || 'duties'] = null; render(); }); return true;
      case 'dsgen': post('duty/slots', { list_id: id, start: val2('ffl-dsstart'), every_weeks: +val2('ffl-dsevery'), count: +val2('ffl-dscount'), capacity: +val2('ffl-dscap'), min: +val2('ffl-dsmin') || 0, time: val2('ffl-dstime') }).then(function (r) { flash('ok', r.added + ' Termine angelegt.'); }); return true;
      case 'dsone':
        if (!val2('ffl-dslabel') && !val2('ffl-dsdate')) { flash('err', 'Bitte eine Bezeichnung oder ein Datum angeben.'); return true; }
        post('duty/slots', { list_id: id, label: val2('ffl-dslabel'), start: val2('ffl-dsdate'), every_weeks: 0, count: 1, time: val2('ffl-dstime1'), capacity: +val2('ffl-dscap1') || 6, min: +val2('ffl-dsmin1') || 0 }, 'Gruppe/Termin angelegt.'); return true;
      case 'dsdel': if (confirm('Termin löschen?')) post('duty/slot', { id: id, 'delete': true }); return true;
      case 'dsrm': post('duty/assign', { slot_id: id, member_id: +t.getAttribute('data-v'), remove: true }); return true;
      case 'dsadd':
        var mm = pickMember('ffl-dsadd-' + id); if (!mm) return flash('err', 'Bitte einen Namen aus den Vorschlägen wählen.'), true;
        post('duty/assign', { slot_id: id, member_id: mm.id }, mm.name + ' eingeteilt.'); return true;
      case 'dlprint': MYFPrint.printNow(dutyPrint(by(d.duty_lists, 'id')[id]), true); return true;
      case 'bdcreate':
        var title = val2('ffl-bdtitle'); if (!title) return flash('err', 'Bitte einen Titel angeben.'), true;
        var fi = document.getElementById('ffl-bdfile');
        readFileData(fi).then(function (data) {
          return post('board', { title: title, text: val2('ffl-bdtext'), file: data, file_name: fi.files[0] ? fi.files[0].name : '', rsvp: document.getElementById('ffl-bdrsvp').checked,
            rsvp_deadline: val2('ffl-bddead'), ends: val2('ffl-bdends'), on_screen: document.getElementById('ffl-bdscreen').checked, notify_all: document.getElementById('ffl-bdnotify').checked }, 'Veröffentlicht.');
        });
        return true;
      case 'bdlist': ui.bdOpen = ui.bdOpen === id ? null : id; render(); return true;
      case 'bddel': if (confirm('Aushang löschen?')) post('board', { id: id, 'delete': true }, 'Gelöscht.'); return true;
      case 'bdcsv':
        var bd = by(d.board, 'id')[id];
        downloadCsv('zusagen-' + id + '.csv', [['Name', 'Antwort', 'Personen', 'Bemerkung', 'Stand']].concat(bd.answers.map(function (r) { return [r.name, r.answer === 'yes' ? 'Zusage' : 'Absage', r.persons, r.note, r.updated]; })));
        return true;
    }
    return false;
  }
  // CSV (Semikolon, UTF-8 mit BOM – öffnet direkt in Excel)
  function csvText(rows) { return '﻿' + rows.map(function (r) { return r.map(function (c) { c = c == null ? '' : String(c); return /[;"\n\r]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(';'); }).join('\r\n'); }
  function downloadCsv(name, rows) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csvText(rows)], { type: 'text/csv;charset=utf-8' })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  }

  // ---- Fahrzeuge -------------------------------------------------------------------
  var VSTAT = { ready: 'st-ok', limited: 'st-warn', out: 'st-bad' };
  function euro2(v) { return v == null ? '' : v.toFixed(2).replace('.', ',') + ' €'; }
  function dueState(due) { if (!due) return 'none'; var n = isoToday(); return due < n ? 'over' : due <= addDays(n, 30) ? 'soon' : 'ok'; }
  function tabVehicles() {
    var pending = (d.bookings || []).filter(function (b) { return b.status === 'requested'; }).length;
    var subs = [['list', 'Fahrzeuge'], ['geraete', 'Gerätewerkstatt'], ['bookings', 'Fahrzeug-Anfragen' + (pending ? ' (' + pending + ')' : '')], ['trips', 'Fahrtenbuch' + ((d.trips_open || []).length ? ' (' + d.trips_open.length + ')' : '')], ['due', 'Fälligkeiten'], ['log', 'Verlauf & Kosten']];
    var cur = ui.vsub || 'list';
    return '<div class="ffl-subtabs" style="margin-top:12px">' + subs.map(function (x) {
      return '<button type="button" data-act="vsub" data-v="' + x[0] + '" aria-selected="' + (cur === x[0]) + '">' + x[1] + '</button>';
    }).join('') + '</div>' + (cur === 'geraete' ? workshopPanel('vehicles') : cur === 'bookings' ? vBookings() : cur === 'due' ? vDue() : cur === 'trips' ? vTrips() : cur === 'log' ? vLog(null) : ui.veh ? vVehicle() : vList());
  }
  // ---- Fahrtenbuch: je Fahrzeug, verknüpft mit Einsätzen, Fahrzeug-Anfragen und Werkstatt ----
  function fmtKm(n) { return n == null ? '' : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function tripRows(vid) {
    var all = (d.trips || []).filter(function (t) { return t.vehicle_id === vid; }), st = {};
    all.forEach(function (t) { if (t.storno_of) st[t.storno_of] = t; });
    return { list: all.filter(function (t) { return !t.storno_of; }), storno: st };
  }
  function vTrips() {
    // auch ausgemusterte Fahrzeuge, solange sie Fahrten haben (Fahrtenbuch bleibt einsehbar)
    var hasTrip = {}; (d.trips || []).forEach(function (t) { hasTrip[t.vehicle_id] = 1; });
    var vs = (d.vehicles || []).filter(function (v) { return v.active || hasTrip[v.id]; });
    if (!vs.length) return '<p class="ffl-mu">Noch keine Fahrzeuge angelegt.</p>';
    var vid = ui.tripVeh && vs.some(function (v) { return v.id === ui.tripVeh; }) ? ui.tripVeh : vs[0].id, v = by(d.vehicles, 'id')[vid];
    var open = (d.trips_open || []).filter(function (o) { return o.vehicle_id === vid; });
    var mopts = [['', '– Fahrer/in (Pflicht) –']].concat(d.members.filter(function (m) { return m.active; }).map(function (m) { return [String(m.id), m.name]; }));
    var h = '<div class="ffl-pills" role="group" aria-label="Fahrzeug">' + vs.map(function (x) {
      var n = (d.trips_open || []).filter(function (o) { return o.vehicle_id === x.id; }).length;
      return '<button type="button" data-act="tripveh" data-id="' + x.id + '" aria-pressed="' + (x.id === vid) + '">' + esc(x.name) + (n ? ' <span class="ffl-badge">' + n + '</span>' : '') + '</button>';
    }).join('') + '</div>';
    var km = (d.vehicle_km || {})[vid];
    h += '<div class="ffl-row" style="margin:4px 0 12px"><span class="ffl-mu">Letzter km-Stand: <b style="color:var(--ink)">' + (km ? fmtKm(km) + ' km' : 'noch keiner') + '</b> – aus Fahrtenbuch und Werkstatt.</span><span style="flex:1"></span>' +
      '<button type="button" class="ffl-sm" data-act="tripcsv" data-id="' + vid + '" title="Fahrtenbuch als Tabelle für Excel">↓ Excel</button><button type="button" class="ffl-sm" data-act="tripprint" data-id="' + vid + '">Drucken</button></div>';
    if (open.length) h += '<div class="ffl-pbox ffl-tripopen"><div class="ffl-sh">Noch ohne Eintrag<em>' + open.length + '</em></div><p class="ffl-mu" style="margin-top:0">Einsätze/Übungen mit diesem Fahrzeug und beendete Fahrzeug-Anfragen der letzten 30 Tage. km-Stand eintragen – der Rest ist schon ausgefüllt.</p>' +
      open.map(function (o, k) {
        return '<div class="ffl-row" data-tripopen="' + k + '"><span style="flex:1 1 220px"><b>' + esc(o.label) + '</b><br><span class="ffl-mu">' + fmtDate(o.start) + ' ' + esc(String(o.start).slice(11, 16)) + ' · ' + esc((d.trip_kinds || {})[o.kind] || o.kind) + (o.driver ? ' · ' + esc(o.driver) : '') + '</span></span>' +
          sel(mopts, '', 'data-to="driver_id" style="width:auto;flex:0 1 200px"') + '<input type="number" inputmode="numeric" data-to="km_end" placeholder="km am Ende" style="width:140px">' +
          '<button type="button" class="ffl-sm ffl-p" data-act="tripopensave" data-v="' + k + '" data-id="' + vid + '">Eintragen</button></div>';
      }).join('') + '</div>';
    h += '<details class="ffl-pbox" style="margin-top:12px"' + (ui.tripNew ? ' open' : '') + '><summary style="cursor:pointer;font-weight:700">+ Fahrt eintragen</summary><div class="ffl-form4" data-tripform="1" style="margin-top:10px">' +
      '<div><label class="ffl-fl">Beginn</label><input type="datetime-local" data-tf="start" value="' + esc(isoToday()) + 'T' + ('0' + new Date().getHours()).slice(-2) + ':00"></div>' +
      '<div><label class="ffl-fl">Zweck</label>' + sel(Object.keys(d.trip_kinds || {}).map(function (k) { return [k, d.trip_kinds[k]]; }), 'dienst', 'data-tf="kind"') + '</div>' +
      '<div class="span2"><label class="ffl-fl">Anlass / Ziel</label><input type="text" data-tf="purpose" list="ffl-tpurp-l" placeholder="z. B. Werkstatt, Jugendfeuerwehr Zeltlager">' +
        sug('ffl-tpurp-l', (d.trips || []).map(function (x) { return x.purpose; }).concat((d.incidents || []).slice(0, 8).map(function (i) { return (i.nr ? i.nr + ' ' : '') + i.title; }))) + '</div>' +
      '<div><label class="ffl-fl">Fahrer</label>' + sel(mopts, '', 'data-tf="driver_id"') + '</div>' +
      '<div><label class="ffl-fl">km am Beginn</label><input type="number" inputmode="numeric" data-tf="km_start" placeholder="' + esc(km ? fmtKm(km) : '') + '"></div>' +
      '<div><label class="ffl-fl">km am Ende</label><input type="number" inputmode="numeric" data-tf="km_end"></div>' +
      '<div><label class="ffl-fl">Getankt (Liter / €)</label><div class="ffl-row" style="gap:6px;flex-wrap:nowrap"><input type="text" inputmode="decimal" data-tf="fuel_l" placeholder="l"><input type="text" inputmode="decimal" data-tf="fuel_cost" placeholder="€"></div></div></div>' +
      '<button type="button" class="ffl-p" style="margin-top:10px" data-act="tripadd" data-id="' + vid + '">Speichern</button><span class="ffl-mu" style="margin-left:10px">Wird unveränderbar gespeichert – Korrektur per Storno.</span></details>';
    var tr = tripRows(vid), year = new Date().getFullYear(), yl = tr.list.filter(function (t) { return !tr.storno[t.id] && +t.start.slice(0, 4) === year; });
    var kmYear = yl.reduce(function (a, t) { return a + (t.km_end != null && t.km_start != null ? t.km_end - t.km_start : 0); }, 0), lYear = yl.reduce(function (a, t) { return a + (t.fuel_l || 0); }, 0);
    var L = MYFUI.lt(ui, 'trips', tr.list, { noun: 'Fahrten', ph: 'Fahrer, Zweck, Ziel …', per: 25, text: function (t) { return [t.driver, t.purpose, t.note, (d.trip_kinds || {})[t.kind], fmtDate(t.start)].join(' '); },
      csv: { name: 'Fahrtenbuch_' + v.name, cols: [['Datum', function (t) { return fmtDate(t.start) + ' ' + t.start.slice(11, 16); }], ['Zweck', function (t) { return (d.trip_kinds || {})[t.kind] || t.kind; }], ['Anlass/Ziel', function (t) { return t.purpose; }],
        ['Fahrer', function (t) { return t.driver; }], ['km Start', function (t) { return t.km_start; }], ['km Ende', function (t) { return t.km_end; }], ['getankt (l)', function (t) { return t.fuel_l || ''; }], ['storniert', function (t) { return tr.storno[t.id] ? 'ja: ' + tr.storno[t.id].storno_reason : ''; }]] },
      sorts: [['new', 'neueste zuerst', function (t) { return t.start + '|' + t.id; }, -1], ['old', 'älteste zuerst', function (t) { return t.start + '|' + t.id; }, 1], ['km', 'km-Stand', function (t) { return t.km_end || 0; }, -1]] });
    h += '<div class="ffl-sec"><div class="ffl-sh">' + esc(v.name) + '<em>' + year + ': ' + fmtKm(kmYear) + ' km · ' + lYear.toFixed(0) + ' l getankt</em></div>' + L.bar + '<div class="ffl-scroll"><table class="ffl-table ffl-stack ffl-triptable"><thead><tr><th>Datum</th><th>Zweck</th><th>Anlass</th><th>Fahrer</th><th>km</th><th>gefahren</th><th>Tanken</th><th>eingetragen</th><th></th></tr></thead><tbody>' +
      (tr.list.length ? L.rows.map(function (t) {
        var s = tr.storno[t.id];
        return '<tr' + (s ? ' class="is-off"' : '') + '><td data-l="Datum">' + fmtDate(t.start) + ' ' + esc(t.start.slice(11, 16)) + '</td><td data-l="Zweck">' + esc((d.trip_kinds || {})[t.kind] || t.kind) + '</td>' +
          '<td class="full">' + esc(t.purpose) + (s ? '<div class="ffl-mu" style="color:var(--red-tx)">storniert ' + fmtDate(s.created) + ' von ' + esc(s.by) + ': ' + esc(s.storno_reason) + '</div>' : '') + '</td>' +
          '<td data-l="Fahrer">' + esc(t.driver || '–') + '</td><td data-l="km">' + (t.km_start != null ? fmtKm(t.km_start) + ' → ' : '') + fmtKm(t.km_end) + '</td>' +
          '<td data-l="gefahren">' + (t.km_end != null && t.km_start != null ? fmtKm(t.km_end - t.km_start) + ' km' : '') + '</td>' +
          '<td data-l="Tanken">' + (t.fuel_l ? String(t.fuel_l).replace('.', ',') + ' l' + (t.fuel_cost ? ' · ' + euro2(t.fuel_cost) : '') : '') + '</td>' +
          '<td data-l="eingetragen" class="ffl-mu">' + esc(t.source === 'terminal' ? 'Halle' : t.by) + '<br>' + fmtDate(t.created) + '</td>' +
          '<td class="del">' + (s ? '' : '<button type="button" class="ffl-q ffl-sm" data-act="tripstorno" data-id="' + t.id + '">Stornieren</button>') + '</td></tr>';
      }).join('') : '<tr><td colspan="9" class="ffl-mu">Noch keine Fahrten.</td></tr>') + '</tbody></table></div>' + L.pager + '</div>';
    return h;
  }
  function vTasks(id) { return (d.vehicle_tasks || []).filter(function (t) { return t.vehicle_id === id; }); }
  function vDefects(name) { return (d.defects && d.defects.length ? d.defects : d.vehicle_defects || []).filter(function (x) { return x.object === name && (x.status === 'new' || x.status === 'progress'); }); }
  function vList() {
    var h = '<div class="ffl-bar"><span class="ffl-mu">Fahrzeuge mit Fristen, Verlauf und offenen Mängeln.</span><span style="flex:1"></span>' +
      '<button type="button" class="ffl-sm" data-act="vimport">Aus Einsatzverwaltung übernehmen</button><button type="button" class="ffl-sm ffl-p" data-act="vnew">+ Fahrzeug</button></div>';
    if (ui.vNew) h += vForm({ unit: unitKeys()[0], status: 'ready', active: true });
    h += '<div class="ffl-cards">' + (d.vehicles || []).filter(function (v) { return v.active; }).map(function (v) {
      var ts = vTasks(v.id), next = ts.filter(function (t) { return t.due; }).sort(function (a, b) { return a.due < b.due ? -1 : 1; })[0], df = vDefects(v.name);
      var st = next ? dueState(next.due) : 'none';
      return '<button type="button" class="ffl-card' + (v.status === 'out' || st === 'over' ? ' is-alert' : '') + '" data-act="vopen" data-id="' + v.id + '"><span class="ffl-cl">' + esc(unitName(v.unit)) + (v.callsign ? ' · ' + esc(v.callsign) : '') + '</span>' +
        '<span class="ffl-big" style="font-size:28px">' + esc(v.name) + '</span><span class="ffl-chips" style="margin-top:6px"><span class="ffl-chip ' + VSTAT[v.status] + '">' + esc(d.vehicle_status[v.status]) + '</span>' +
        (df.length ? '<span class="ffl-chip st-warn">' + df.length + ' Mängel</span>' : '') + (v.bookable ? '<span class="ffl-chip st-open">anfragbar</span>' : '') + '</span>' +
        '<span class="ffl-mu" style="margin-top:6px">' + (next ? 'nächste Frist: ' + esc(next.title) + ' ' + fmtDate(next.due) : ts.length ? 'Fristen noch ohne Datum' : 'keine Fristen') + '</span></button>';
    }).join('') + '</div>';
    var old = (d.vehicles || []).filter(function (v) { return !v.active; });
    if (old.length) h += '<details style="margin-top:12px"><summary class="ffl-mu" style="cursor:pointer">Ausgemustert (' + old.length + ')</summary>' + old.map(function (v) { return '<button type="button" class="ffl-q ffl-sm" data-act="vopen" data-id="' + v.id + '">' + esc(v.name) + '</button>'; }).join('') + '</details>';
    return h;
  }
  function vForm(v) {
    function f(k, label, ph) { return '<div><label class="ffl-fl">' + label + '</label><input type="text" data-vf2="' + k + '" value="' + esc(v[k] || '') + '" placeholder="' + esc(ph || '') + '"></div>'; }
    return '<div class="ffl-pbox" data-vform="' + (v.id || 0) + '"><div class="ffl-form4">' + f('name', 'Name', 'HLF 20') + f('callsign', 'Funkrufname', 'Florian Musterstadt 1-HLF20-1') + f('plate', 'Kennzeichen', 'BOR-…') +
      f('vtype', 'Typ / Hersteller', 'MAN TGM, Aufbau Rosenbauer') + f('built', 'Baujahr', '2015') +
      unitField(v.unit, 'data-vf2="unit"') +
      '<div><label class="ffl-fl">Status</label>' + sel(Object.keys(d.vehicle_status).map(function (k) { return [k, d.vehicle_status[k]]; }), v.status, 'data-vf2="status"') + '</div>' +
      '<div><label class="ffl-fl">Optionen</label><label class="ffl-check"><input type="checkbox" data-vf2="bookable"' + (v.bookable ? ' checked' : '') + '> kann angefragt werden (Bulli)</label>' +
      '<label class="ffl-check"><input type="checkbox" data-vf2="in_incidents"' + (v.in_incidents !== false ? ' checked' : '') + '> im Einsatz auswählbar (Warst du dabei?, Halle, Bericht)</label></div>' +
      '<div class="span2"><label class="ffl-fl">Bemerkung</label><input type="text" data-vf2="note" value="' + esc(v.note || '') + '"></div>' +
      // Fremdkalender (z. B. der MTF-Kalender der Jugendfeuerwehr): Einträge gelten als Belegung – Anfragen werden dagegen geprüft, Dashboards zeigen „unterwegs“
      '<div class="span2"><label class="ffl-fl">Kalender-Link (iCal/ICS), in dem steht, wann das Fahrzeug weg ist</label><input type="url" data-vical="1" value="" placeholder="' + (v.ical_set ? 'gespeichert: ' + esc(v.ical_host) + '/… – zum Ändern neuen Link einfügen' : 'https://… .ics oder webcal://…') + '" autocomplete="off">' +
        (v.ical_set ? '<label class="ffl-check" style="margin-top:6px"><input type="checkbox" data-vicaloff="1"> Kalender trennen</label>' : '') +
      '<div class="ffl-mu">Einträge aus diesem Kalender zählen als Belegung: Anfragen dafür werden abgelehnt, Dashboards zeigen „unterwegs laut Kalender“. Wird alle 30 Minuten gelesen.</div></div>' +
      (v.id && v.ics_url ? '<div class="span2"><label class="ffl-fl">Umgekehrt: freigegebene Fahrten dieses Fahrzeugs im eigenen Kalender</label>' + secretBox(v.ics_url, { what: 'Fahrzeug-Kalender ' + v.name, open: 'Abonnieren', href: v.ics_url.replace(/^https?:/, 'webcal:') }) +
        '<div class="ffl-mu">Geheimer Link ohne Anmeldung – nur an Zuständige weitergeben (z. B. für den Kalender der Jugendfeuerwehr).</div></div>' : '') + '</div>' +
      (v.id ? '' : '<label class="ffl-check" style="margin-top:8px"><input type="checkbox" data-vf2="default_tasks" checked> übliche Fristen anlegen (HU, UVV, Pumpe, Inspektion)</label>') +
      '<div class="ffl-row" style="margin-top:10px"><button type="button" class="ffl-p" data-act="vsave" data-id="' + (v.id || 0) + '">' + (v.id ? 'Speichern' : 'Anlegen') + '</button>' +
      (v.id ? '' : '<button type="button" data-act="vnewcancel">Abbrechen</button>') + '</div></div>';
  }
  function vVehicle() {
    var v = by(d.vehicles, 'id')[ui.veh];
    if (!v) { ui.veh = null; return vList(); }
    var h = '<button type="button" class="ffl-q" style="padding:0;margin-top:12px" data-act="vback">← alle Fahrzeuge</button>' +
      '<div class="ffl-sec"><div class="ffl-sh">' + esc(v.name) + '<em><span class="ffl-chip ' + VSTAT[v.status] + '">' + esc(d.vehicle_status[v.status]) + '</span>' + (v.active ? '' : '<span class="ffl-chip st-off">ausgemustert</span>') + '</em></div>' +
      (v.active ? '' : '<div class="ffl-msg warn">Ausgemustert: erscheint nirgends mehr zur Auswahl (Halle, Dashboard, Einsatz, Anfragen). Fahrtenbuch, Fristen, Verlauf und alte Einsätze bleiben erhalten.</div>') + '</div>';
    // Status (FMS) und km-Stand – Status kommt sonst aus der Alarmierung
    var fs = (d.vstatus || {})[v.id], km = (d.vehicle_km || {})[v.id];
    h += '<div class="ffl-pbox ffl-vstat"><div><label class="ffl-fl">Status (FMS)</label>' + sel([['', '– kein Status –']].concat(Object.keys(d.fms || {}).map(function (k) { return [k, k + ' – ' + d.fms[k]]; })), fs ? fs.s : '', 'data-fms="' + v.id + '" style="width:auto"') +
      (fs ? '<span class="ffl-mu"> seit ' + fmtDate(fs.t) + ' ' + esc(String(fs.t).slice(11, 16)) + (fs.by ? ' · ' + esc(fs.by) : '') + '</span>' : '') + '</div>' +
      '<div><label class="ffl-fl">km-Stand</label><b style="font-size:20px">' + (km ? fmtKm(km) + ' km' : '–') + '</b></div>' +
      '<button type="button" class="ffl-sm" data-act="tripgo" data-id="' + v.id + '">Fahrtenbuch</button><button type="button" class="ffl-sm" data-act="vqr" data-id="' + v.id + '">QR fürs Fahrzeug drucken</button></div>';
    var df = vDefects(v.name);
    h += '<div class="ffl-sec"><div class="ffl-sh">Offene Mängel<em>' + df.length + '</em></div>' + (df.length ? df.map(function (x) {
      return '<div class="ffl-ev"><div class="ffl-day">' + fmtDate(x.created).slice(0, 6) + '</div><div style="flex:1"><b>' + esc(x.title) + '</b><div class="ffl-mu">' + (x.urgency === 'out' ? 'außer Dienst · ' : '') + esc(x.status === 'new' ? 'neu' : 'in Bearbeitung') + '</div></div></div>';
    }).join('') + (allowedTab('defects') ? '<button type="button" class="ffl-sm" data-go="defects">Zu den Mängeln</button>' : '') : '<p class="ffl-mu">Keine.</p>') + '</div>';
    var ts = vTasks(v.id);
    h += '<div class="ffl-sec"><div class="ffl-sh">Prüf- & Wartungsfristen</div><div class="ffl-scroll"><table class="ffl-table"><thead><tr><th>Bezeichnung</th><th>Frist</th><th>zuletzt</th><th>fällig</th><th>Bemerkung</th><th></th></tr></thead><tbody>' +
      ts.map(function (t) {
        var st = dueState(t.due);
        return '<tr data-vtask="' + t.id + '"><td><input type="text" data-vt="title" value="' + esc(t.title) + '"></td><td><input type="number" data-vt="interval" value="' + t.interval + '" style="width:70px"> Mon.</td>' +
          '<td>' + (t.last ? fmtDate(t.last) : '–') + '</td><td><input type="date" data-vt="due" value="' + esc(t.due || '') + '"' + (st === 'over' ? ' style="border-color:var(--red-tx);color:var(--red-tx)"' : st === 'soon' ? ' style="border-color:var(--warn)"' : '') + '></td>' +
          '<td><input type="text" data-vt="note" value="' + esc(t.note) + '"></td><td style="white-space:nowrap"><button type="button" class="ffl-sm" data-act="vtdone" data-id="' + t.id + '">Erledigt</button>' +
          '<button type="button" class="ffl-q ffl-sm" data-act="vtdel" data-id="' + t.id + '">✕</button></td></tr>' +
          (ui.vtDone === t.id ? '<tr><td colspan="6"><div class="ffl-row"><input type="date" id="ffl-vtdate" value="' + isoToday() + '" style="width:auto"><input type="text" id="ffl-vtvendor" list="ffl-vendor-l2" placeholder="Werkstatt / Prüfer" style="width:auto">' + sug('ffl-vendor-l2', (d.vehicle_log || []).map(function (l) { return l.vendor; })) +
            '<input type="text" id="ffl-vtcost" placeholder="Kosten €" style="width:110px"><input type="text" id="ffl-vtnote" placeholder="Bemerkung" style="flex:1 1 160px;width:auto">' +
            '<button type="button" class="ffl-p ffl-sm" data-act="vtdonesave" data-id="' + t.id + '">Speichern</button></div><p class="ffl-mu" style="margin:4px 0 0">Nächste Fälligkeit wird aus Datum + Frist berechnet.</p></td></tr>' : '');
      }).join('') + '</tbody></table></div><div class="ffl-row" style="margin-top:8px"><input type="text" id="ffl-vtnew" placeholder="Neue Frist, z. B. Feuerlöscher-Prüfung" style="flex:1 1 220px;width:auto">' +
      '<input type="number" id="ffl-vtnewint" value="12" style="width:80px"><span class="ffl-mu">Monate</span><button type="button" class="ffl-sm" data-act="vtadd" data-id="' + v.id + '">Hinzufügen</button></div></div>';
    h += vLog(v.id);
    // Stammdaten (selten geändert) und ganz unten Ausmustern/Löschen (am seltensten gebraucht)
    h += '<div class="ffl-sec"><div class="ffl-sh">Stammdaten</div>' + vForm(v) + '</div>';
    // Ausmustern (Neuanschaffung, Verkauf) bzw. wieder in Dienst; Löschen nur ohne Daten (versehentlich angelegt)
    h += '<div class="ffl-pbox"><div class="ffl-sh" style="margin-top:0">' + (v.active ? 'Außer Dienst stellen' : 'Wieder in Dienst') + '</div><div class="ffl-row">' +
      (v.active ? '<button type="button" class="ffl-sm" data-act="vretire" data-id="' + v.id + '">Ausmustern – außer Dienst stellen</button><span class="ffl-mu">Bei Verkauf oder Neuanschaffung: alle Daten bleiben, das Fahrzeug wird nur ausgeblendet (unter „Ausgemustert“ weiter einsehbar).</span>'
        : '<button type="button" class="ffl-sm ffl-p" data-act="vreact" data-id="' + v.id + '">Wieder in Dienst stellen</button>') +
      '<span style="flex:1"></span><button type="button" class="ffl-q ffl-sm" data-act="vdelete" data-id="' + v.id + '" title="Nur möglich, solange keine Fahrten, Anfragen, Einsätze, Mängel oder Verlaufseinträge dazu existieren">Fahrzeug löschen (versehentlich angelegt)</button></div></div>';
    return h;
  }
  function vLog(vid) {
    var list = (d.vehicle_log || []).filter(function (l) { return vid === null || l.vehicle_id === vid; });
    var year = new Date().getFullYear(), sum = 0;
    list.forEach(function (l) { if (l.cost && +l.date.slice(0, 4) === year) sum += l.cost; });
    var vs = by(d.vehicles || [], 'id');
    var h = '<div class="ffl-sec"><div class="ffl-sh">' + (vid ? 'Verlauf' : 'Verlauf, Beschaffungen & Kosten') + '<em>Kosten ' + year + ': ' + euro2(sum) + '</em></div>' +
      '<div class="ffl-pbox" style="margin-top:0"><div class="ffl-form4">' + (vid ? '' : '<div><label class="ffl-fl">Fahrzeug</label><select id="ffl-vlveh"><option value="">allgemein (kein Fahrzeug)</option>' +
        (d.vehicles || []).map(function (v) { return '<option value="' + v.id + '">' + esc(v.name) + '</option>'; }).join('') + '</select></div>') +
      '<div><label class="ffl-fl">Art</label>' + sel(Object.keys(d.vlog_kinds).map(function (k) { return [k, d.vlog_kinds[k]]; }), 'reparatur', 'id="ffl-vlkind"') + '</div>' +
      '<div><label class="ffl-fl">Datum</label><input type="date" id="ffl-vldate" value="' + isoToday() + '"></div>' +
      '<div class="span2"><label class="ffl-fl">Was?</label><input type="text" id="ffl-vltitle" placeholder="z. B. Bremsen erneuert / neuer Satz Schläuche"></div>' +
      '<div><label class="ffl-fl">Kosten (€)</label><input type="text" id="ffl-vlcost"></div><div><label class="ffl-fl">Firma</label><input type="text" id="ffl-vlvendor" list="ffl-vendor-l">' + sug('ffl-vendor-l', (d.vehicle_log || []).map(function (l) { return l.vendor; })) + '</div>' +
      '<div><label class="ffl-fl">km-Stand</label><input type="number" id="ffl-vlkm"></div></div>' +
      '<button type="button" class="ffl-p ffl-sm" style="margin-top:8px" data-act="vladd" data-id="' + (vid || 0) + '">Eintragen</button></div>' +
      '<div class="ffl-scroll"><table class="ffl-table"><thead><tr><th>Datum</th>' + (vid ? '' : '<th>Fahrzeug</th>') + '<th>Art</th><th>Was</th><th>Kosten</th><th>Firma</th><th>km</th><th>von</th><th></th></tr></thead><tbody>' +
      list.map(function (l) {
        return '<tr><td>' + fmtDate(l.date) + '</td>' + (vid ? '' : '<td>' + esc(l.vehicle_id && vs[l.vehicle_id] ? vs[l.vehicle_id].name : '–') + '</td>') + '<td>' + esc(d.vlog_kinds[l.kind] || l.kind) + '</td>' +
          '<td>' + esc(l.title) + (l.note ? '<div class="ffl-mu">' + esc(l.note) + '</div>' : '') + '</td><td>' + euro2(l.cost) + '</td><td>' + esc(l.vendor) + '</td><td>' + (l.km || '') + '</td><td class="ffl-mu">' + esc(l.by) + '</td>' +
          '<td><button type="button" class="ffl-q ffl-sm" data-act="vldel" data-id="' + l.id + '">✕</button></td></tr>';
      }).join('') + (list.length ? '' : '<tr><td colspan="9" class="ffl-mu">Noch keine Einträge.</td></tr>') + '</tbody></table></div></div>';
    return h;
  }
  function vDue() {
    var vs = by(d.vehicles || [], 'id');
    var list = (d.vehicle_tasks || []).filter(function (t) { return vs[t.vehicle_id] && vs[t.vehicle_id].active && dueState(t.due) !== 'ok'; });
    if (!list.length) return '<div class="ffl-msg ok" style="margin-top:14px">Keine Fristen in den nächsten 30 Tagen.</div>';
    return '<div class="ffl-scroll"><table class="ffl-table" style="margin-top:14px"><thead><tr><th>Fahrzeug</th><th>Frist</th><th>fällig</th><th></th></tr></thead><tbody>' + list.map(function (t) {
      var st = dueState(t.due);
      return '<tr><td><b>' + esc(vs[t.vehicle_id].name) + '</b></td><td>' + esc(t.title) + '</td><td>' + stateChip(st, t.due ? fmtDate(t.due) : 'kein Datum') + '</td>' +
        '<td><button type="button" class="ffl-sm" data-act="vopen" data-id="' + t.vehicle_id + '">Öffnen</button></td></tr>';
    }).join('') + '</tbody></table></div>';
  }
  function vBookings() {
    var vs = by(d.vehicles || [], 'id'), list = (d.bookings || []).slice();
    var h = '<p class="ffl-mu" style="margin-top:14px">Anfragen aus dem Mitgliederbereich. Freigeben prüft Überschneidungen (auch mit dem Fahrzeugkalender); die anfragende Person bekommt eine Benachrichtigung.</p>';
    if (!list.length) return h + '<p class="ffl-mu">Keine Anfragen.</p>';
    // Offene Anfragen immer zuerst (älteste Anfrage oben), dann Freigegebene nach Fahrtbeginn, dann Erledigtes (neueste zuerst)
    var RK = { requested: 0, approved: 1 };
    list.sort(function (a, b) { var x = RK[a.status] != null ? RK[a.status] : 2, y = RK[b.status] != null ? RK[b.status] : 2; if (x !== y) return x - y; return x === 0 ? (a.created < b.created ? -1 : 1) : x === 1 ? (a.start < b.start ? -1 : 1) : (a.start < b.start ? 1 : -1); });
    var nOpen = list.filter(function (b) { return b.status === 'requested'; }).length, lastRk = -1;
    return h + list.map(function (b) {
      var rk = RK[b.status] != null ? RK[b.status] : 2, head = '';
      if (rk !== lastRk) { lastRk = rk; head = '<div class="ffl-sh" style="margin-top:14px">' + (rk === 0 ? 'Wartet auf Freigabe (' + nOpen + ')' : rk === 1 ? 'Freigegeben' : 'Erledigt') + '</div>'; }
      return head + '<div class="ffl-idea' + (rk === 0 ? ' is-wait' : '') + '" data-row="booking" data-id="' + b.id + '"><div class="ffl-row" style="justify-content:space-between"><b>' + esc(vs[b.vehicle_id] ? vs[b.vehicle_id].name : '?') + ' · ' + dtA(b.start) + ' – ' + dtA(b.end) + '</b>' +
        '<span class="ffl-chip ' + ({ requested: 'st-warn', approved: 'st-ok', declined: 'st-no', cancelled: 'st-no' })[b.status] + '">' + esc(d.booking_status[b.status]) + '</span></div>' +
        '<div>' + esc(b.purpose) + (b.persons ? ' · ' + b.persons + ' Personen' : '') + (b.driver ? ' · Fahrer: ' + esc(b.driver) : '') + '</div><div class="ffl-mu">angefragt von ' + esc(b.member_name) + ' am ' + fmtDate(b.created) + (b.decided_by ? ' · entschieden von ' + esc(b.decided_by) : '') + '</div>' +
        (b.status === 'requested' || b.status === 'approved' ? '<div class="ffl-row" style="margin-top:8px"><input type="text" data-f="answer" value="' + esc(b.answer) + '" placeholder="Hinweis (optional), z. B. Schlüssel liegt im Kasten" style="flex:1 1 220px;width:auto">' +
          (b.status === 'requested' ? '<button type="button" class="ffl-go ffl-sm" data-act="bkdo" data-v="approved" data-id="' + b.id + '">Freigeben</button>' : '') +
          '<button type="button" class="ffl-sm" data-act="bkdo" data-v="declined" data-id="' + b.id + '">' + (b.status === 'approved' ? 'Zurückziehen' : 'Ablehnen') + '</button></div>' : (b.answer ? '<div class="ffl-mu">„' + esc(b.answer) + '“</div>' : '')) + '</div>';
    }).join('');
  }
  function vehicleClick(act, t, id) {
    var row, body;
    switch (act) {
      case 'vsub': ui.vsub = t.getAttribute('data-v'); ui.veh = null; render(); return true;
      case 'tripveh': ui.tripVeh = id; render(); return true;
      case 'vqr':
        var qv = by(d.vehicles, 'id')[id];
        // Ein QR-Code je Fahrzeug: führt zur Fahrzeugseite (Fahrt eintragen, Mangel melden, buchen)
        printQrSheet([{ url: portalUrl('fz=' + id), title: qv.name, sub: 'Scannen: Fahrt eintragen · Mangel melden' + (qv.bookable ? ' · Fahrzeug buchen' : '') }]); return true;
      case 'tripgo': ui.vsub = 'trips'; ui.tripVeh = id; ui.veh = null; render(); root.scrollIntoView(); return true;
      case 'tripopensave':
        var tro = (d.trips_open || []).filter(function (o) { return o.vehicle_id === id; })[+t.getAttribute('data-v')], trw = t.closest('[data-tripopen]');
        if (!tro) return true;
        var trb = { vehicle_id: id, kind: tro.kind, start: tro.start, purpose: tro.label, incident_id: tro.incident_id || 0, booking_id: tro.booking_id || 0,
          km_end: trw.querySelector('[data-to="km_end"]').value, driver_id: trw.querySelector('[data-to="driver_id"]').value, driver: tro.driver || '' };
        if (!trb.km_end) { flash('err', 'Bitte den km-Stand eintragen.'); return true; }
        post('vehicle/trip', trb, 'Fahrt eingetragen.'); return true;
      case 'tripadd':
        var tf = {}; [].forEach.call(root.querySelectorAll('[data-tf]'), function (el) { tf[el.getAttribute('data-tf')] = el.value; });
        tf.vehicle_id = id; ui.tripNew = true;
        post('vehicle/trip', tf, 'Fahrt eingetragen.').then(function () { ui.tripNew = false; render(); }); return true;
      case 'tripstorno':
        MYFUI.ask({ title: 'Fahrt stornieren', text: 'Die Fahrt bleibt sichtbar. Grund:', required: true, ok: 'Stornieren' }).then(function (trr) { if (trr) post('vehicle/trip', { storno: id, reason: trr }, 'Storniert.'); }); return true;
      case 'tripcsv': case 'tripprint':
        var tv = by(d.vehicles, 'id')[id], tr2 = tripRows(id), rows = [['Datum', 'Uhrzeit', 'Zweck', 'Anlass', 'Fahrer', 'km Beginn', 'km Ende', 'gefahren', 'Liter', 'Kosten', 'eingetragen von', 'Storno']];
        tr2.list.slice().reverse().forEach(function (x) {
          var so = tr2.storno[x.id];
          rows.push([fmtDate(x.start), x.start.slice(11, 16), (d.trip_kinds || {})[x.kind] || x.kind, x.purpose, x.driver, x.km_start, x.km_end, x.km_end != null && x.km_start != null ? x.km_end - x.km_start : '',
            x.fuel_l == null ? '' : String(x.fuel_l).replace('.', ','), x.fuel_cost == null ? '' : String(x.fuel_cost).replace('.', ','), x.source === 'terminal' ? 'Dashboard Fahrzeughalle' : x.by, so ? 'storniert: ' + so.storno_reason : '']);
        });
        if (act === 'tripcsv') { downloadCsv('fahrtenbuch-' + tv.name.replace(/\W+/g, '-').toLowerCase() + '.csv', rows); return true; }
        printNow('<h1>Fahrtenbuch ' + esc(tv.name) + (tv.plate ? ' (' + esc(tv.plate) + ')' : '') + '</h1><p>Stand ' + fmtDate(isoToday()) + '</p><table><thead><tr>' + rows[0].map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
          rows.slice(1).map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + esc(c == null ? '' : c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>'); return true;
      case 'vnew': ui.vNew = true; render(); return true;
      case 'vnewcancel': ui.vNew = false; render(); return true;
      case 'vopen': ui.vsub = 'list'; ui.veh = id; ui.vtDone = null; render(); root.scrollIntoView(); return true;
      case 'vback': ui.veh = null; render(); return true;
      case 'vretire':
        MYFUI.ask({ title: 'Fahrzeug ausmustern', text: 'Das Fahrzeug verschwindet aus allen Auswahllisten; Fahrtenbuch, Fristen und Verlauf bleiben erhalten.\nGrund (optional, z. B. „verkauft“, „durch neues HLF ersetzt“):', ok: 'Ausmustern' })
          .then(function (nr) { if (nr !== null) post('vehicle', { id: id, 'do': 'retire', note: nr, date: isoToday() }, 'Ausgemustert – Daten bleiben erhalten.'); }); return true;
      case 'vreact': post('vehicle', { id: id, 'do': 'reactivate', date: isoToday() }, 'Wieder in Dienst.'); return true;
      case 'vdelete':
        var dv = by(d.vehicles, 'id')[id] || {};
        MYFUI.ask({ title: 'Fahrzeug löschen', text: 'Nur für versehentlich angelegte Fahrzeuge ohne Daten. Zur Bestätigung den Namen eintippen: ' + dv.name, required: 'Bitte den Namen genau so eintippen.', min: 1, ok: 'Endgültig löschen' })
          .then(function (nm) { if (nm === null) return; if (nm !== dv.name) { flash('err', 'Name stimmt nicht – nichts gelöscht.'); return; }
            post('vehicle', { id: id, 'do': 'delete' }, 'Gelöscht.').then(function (r) { if (r && r.deleted) { ui.veh = null; render(); } }); }); return true;
      case 'vimport': post('vehicle/import', {}).then(function (r) { flash('ok', r.added ? r.added + ' Fahrzeuge übernommen.' : 'Keine neuen Fahrzeuge gefunden.'); }); return true;
      case 'vsave':
        row = t.closest('[data-vform]'); body = { id: id };
        [].forEach.call(row.querySelectorAll('[data-vf2]'), function (el) { body[el.getAttribute('data-vf2')] = el.type === 'checkbox' ? el.checked : el.value; });
        // Kalender-Link: der gespeicherte Link kommt nicht in den Browser – nur ein neu eingefügter wird gesendet, „trennen“ löscht ihn
        var vic = row.querySelector('[data-vical]'), vicOff = row.querySelector('[data-vicaloff]');
        if (vicOff && vicOff.checked) body.ical_url = ''; else if (vic && vic.value.trim()) body.ical_url = vic.value.trim();
        post('vehicle', body, 'Gespeichert.').then(function (r) { ui.vNew = false; if (!id) ui.veh = r.id; render(); }); return true;
      case 'vtdone': ui.vtDone = ui.vtDone === id ? null : id; render(); return true;
      case 'vtdonesave':
        post('vehicle/task', { id: id, done: true, date: val2('ffl-vtdate'), vendor: val2('ffl-vtvendor'), cost: val2('ffl-vtcost'), note: val2('ffl-vtnote') }, 'Erledigt eingetragen.').then(function () { ui.vtDone = null; render(); }); return true;
      case 'vtdel': if (confirm('Frist entfernen?')) post('vehicle/task', { id: id, 'delete': true }, 'Entfernt.'); return true;
      case 'vtadd': if (!val2('ffl-vtnew')) return true; post('vehicle/task', { vehicle_id: id, title: val2('ffl-vtnew'), interval: +val2('ffl-vtnewint') || 12 }, 'Frist angelegt.'); return true;
      case 'vladd':
        post('vehicle/log', { vehicle_id: id || val2('ffl-vlveh'), kind: val2('ffl-vlkind'), date: val2('ffl-vldate'), title: val2('ffl-vltitle'), cost: val2('ffl-vlcost'), vendor: val2('ffl-vlvendor'), km: val2('ffl-vlkm') }, 'Eingetragen.'); return true;
      case 'vldel': if (confirm('Eintrag löschen?')) post('vehicle/log', { id: id, 'delete': true }, 'Gelöscht.'); return true;
      case 'bkdo':
        row = t.closest('[data-row="booking"]');
        post('booking', { id: id, status: t.getAttribute('data-v'), answer: row.querySelector('[data-f=answer]').value }, t.getAttribute('data-v') === 'approved' ? 'Freigegeben.' : 'Gespeichert.'); return true;
    }
    return false;
  }
  function val2(id) { var el = document.getElementById(id); return el ? el.value : ''; }

  // ---- Atemschutz: Personen + Werkstatt -----------------------------------------
  function tabAgt() {
    ui.wsArea = 'agt';
    var subs = d.can_agt ? [['people', 'Atemschutzgeräteträger'], ['strecke', 'Übungsstrecke'], ['devices', 'Werkstatt: Masken, PA, Flaschen'], ['due', 'Fälligkeiten'], ['rules', 'Einstellungen']]
      : (d.areas || []).indexOf('agt') >= 0 || (d.areas || []).indexOf('strecke') >= 0 ? [['strecke', 'Übungsstrecke']] : [];
    if (d.asu_can) subs.unshift(['asu', 'Überwachung' + ((d.asu_missing || []).length ? ' (' + d.asu_missing.length + ')' : '')]);
    // Leihkleidung direkt rechts neben der Werkstatt (gleiche Leute, gleicher Ablauf nach dem Einsatz)
    if (d.loan_can) { var wi = subs.map(function (x) { return x[0]; }).indexOf('devices');
      subs.splice(wi >= 0 ? wi + 1 : subs.length, 0, ['loan', 'Leihkleidung' + ((d.loans || []).length ? ' (' + d.loans.length + ')' : '')]); }
    var cur = ui.asub && subs.some(function (x) { return x[0] === ui.asub; }) ? ui.asub : subs[0][0];
    var nDue = d.can_agt ? wsDueList().filter(function (x) { return x.state !== 'ok'; }).length : 0;
    return '<div class="ffl-subtabs" style="margin-top:12px">' + subs.map(function (x) {
      return '<button type="button" data-act="asub" data-v="' + x[0] + '" aria-selected="' + (cur === x[0]) + '">' + x[1] + (x[0] === 'due' && nDue ? ' (' + nDue + ')' : '') + '</button>';
    }).join('') + '</div>' + (cur === 'loan' ? tabLoans() : cur === 'asu' ? tabAsu() : cur === 'strecke' ? tabDuties('strecke') : cur === 'devices' ? (ui.dev ? wsDevice() : wsDevices()) : cur === 'due' ? wsDue() : cur === 'rules' ? wsRules() : tabAgtPeople());
  }
  // ---- Unterweisungen (UVV & Co.): zu Jahresbeginn anlegen, Stand verfolgen, nach Liste abhaken, Liste drucken ----------
  function briefAud(v) {
    return '<select data-bf="audience"><option value="all"' + (v === 'all' ? ' selected' : '') + '>alle Aktiven</option><option value="agt"' + (v === 'agt' ? ' selected' : '') + '>Atemschutzgeräteträger</option>' +
      (d.traits || []).filter(function (t) { return t.cat !== 'sonst'; }).map(function (t) { return '<option value="trait:' + t.id + '"' + (v === 'trait:' + t.id ? ' selected' : '') + '>Merkmal: ' + esc(t.name) + '</option>'; }).join('') + '</select>';
  }
  function tabBriefings() {
    var y0 = new Date().getFullYear(), y = ui.bfYear || y0, all = d.briefings || [], cur = all.filter(function (b) { return b.year === y; });
    var ys = [y0 - 1, y0, y0 + 1]; all.forEach(function (b) { if (ys.indexOf(b.year) < 0) ys.push(b.year); }); ys.sort(function (a, b) { return b - a; });
    if (ui.brief) { var b0 = all.filter(function (b) { return b.id === ui.brief; })[0]; if (b0) return briefDetail(b0); ui.brief = null; }
    var h = '<div class="ffl-pills" role="group" aria-label="Jahr" style="margin-top:12px">' + ys.map(function (x) { return '<button type="button" data-act="bfyear" data-v="' + x + '" aria-pressed="' + (x === y) + '">' + x + (x === y0 ? ' (aktuell)' : '') + '</button>'; }).join('') + '</div>' +
      '<div class="ffl-sec"><div class="ffl-sh">Unterweisungen ' + y + '</div><p class="ffl-mu" style="margin-top:0">Pflicht-Unterweisungen einmal im Jahr: Mitglieder bestätigen im Mitgliederbereich per Tipp – oder du hakst nach der Unterschriftenliste vom Dienstabend ab. ' +
      'Jede Bestätigung steht mit Zeitpunkt und Art im Änderungsprotokoll.</p>';
    h += cur.length ? '<div class="ffl-plist">' + cur.map(function (b) {
      var pct = b.total ? Math.round(b.done / b.total * 100) : 0;
      return '<button type="button" class="ffl-prow" data-act="bfopen" data-id="' + b.id + '"><span><b>' + esc(b.title) + (b.active ? '' : ' <span class="ffl-chip st-warn">Entwurf – noch nicht sichtbar</span>') + '</b><small>' + esc(b.audience_label) + (b.due ? ' · bis ' + fmtDate(b.due) : '') + '</small>' +
        (b.total ? '<span class="ffl-bfbar" aria-label="' + b.done + ' von ' + b.total + ' bestätigt"><i style="width:' + pct + '%"></i></span><small' + (b.done < b.total ? ' class="is-warn"' : '') + '>' + b.done + ' von ' + b.total + ' bestätigt' + (b.done < b.total ? ' · ' + (b.total - b.done) + ' fehlen' : ' ✓') + '</small>'
        : '<small>betrifft derzeit niemanden</small>') + '</span>' + MYFUI.icons.chev + '</button>';
    }).join('') + '</div>' : '<div class="ffl-msg">Für ' + y + ' sind noch keine Unterweisungen angelegt.</div>';
    var have = {}; cur.forEach(function (b) { have[b.title] = 1; });
    var pre = (d.brief_presets || []).filter(function (p) { return !have[p.title]; });
    if (pre.length) h += '<div class="ffl-pbox" style="margin-top:14px"><div class="ffl-sh">' + (cur.length ? 'Weitere Vorlagen' : 'Unterweisungen ' + y + ' anlegen') + '</div><div class="ffl-chips ffl-bigchips">' + pre.map(function (p) {
        return '<label class="ffl-toggle-chip"><input type="checkbox" data-bfpre="' + p.key + '"' + (cur.length ? '' : (p.key === 'saege' ? '' : ' checked')) + '>' + esc(p.title) + '</label>';
      }).join('') + '</div><div class="ffl-form2" style="margin-top:10px"><div><label class="ffl-fl" for="ffl-bfdue">Bestätigen bis (optional)</label><input type="date" id="ffl-bfdue" value="' + y + '-03-31"></div></div>' +
      '<button type="button" class="ffl-p" style="margin-top:10px" data-act="bfpresets">Als Entwurf anlegen</button><p class="ffl-mu" style="margin:6px 0 0">Entwürfe sehen die Mitglieder noch nicht. Erst „Freigeben“ macht sie sichtbar und schickt die Nachricht.</p></div>';
    h += '<button type="button" class="ffl-sm" style="margin-top:12px" data-act="bfnew">+ Eigene Unterweisung</button>';
    var old = all.filter(function (b) { return b.year < y && ys.indexOf(b.year) < 0; });
    if (old.length) h += '<details style="margin-top:16px"><summary class="ffl-mu">Frühere Jahre (' + old.length + ')</summary><div class="ffl-plist" style="margin-top:8px">' + old.map(function (b) {
      return '<button type="button" class="ffl-prow" data-act="bfopen" data-id="' + b.id + '"><span><b>' + b.year + ' · ' + esc(b.title) + '</b><small>' + b.done + ' von ' + b.total + ' bestätigt</small></span>' + MYFUI.icons.chev + '</button>';
    }).join('') + '</div></details>';
    return h + '</div>';
  }
  function briefDetail(b) {
    var mem = by(d.members, 'id'), ackBy = {}; (b.acks || []).forEach(function (a) { ackBy[a.member_id] = a; });
    var nm = function (id) { return mem[id] ? mem[id].name : '#' + id; };
    var open = (b.open || []).slice().sort(function (x, y2) { return nm(x) < nm(y2) ? -1 : 1; });
    var done = (b.acks || []).filter(function (a) { return b.members.indexOf(a.member_id) >= 0; }).sort(function (x, y2) { return nm(x.member_id) < nm(y2.member_id) ? -1 : 1; });
    var M = { app: 'selbst bestätigt', liste: 'per Liste', halle: 'am Hallen-Tablet' };
    var h = '<div class="ffl-sec"><div class="ffl-psub"><button type="button" class="ffl-back" data-act="bfclose">‹ Unterweisungen</button><div><b>' + esc(b.title) + '</b><div class="ffl-mu">' + b.year + ' · ' + esc(b.audience_label) + ' · ' + b.done + ' von ' + b.total + ' bestätigt</div></div></div>';
    h += '<div class="ffl-grid2"><div class="ffl-pbox"><div class="ffl-sh">Noch offen<em>' + open.length + '</em></div>' + (open.length ? '<div class="ffl-bflist">' + open.map(function (id) {
        return '<label class="ffl-check"><input type="checkbox" data-bfopen="' + id + '"> ' + esc(nm(id)) + '</label>';
      }).join('') + '</div><div class="ffl-row" style="margin-top:10px"><button type="button" class="ffl-sm" data-act="bfall">Alle markieren</button><button type="button" class="ffl-p ffl-sm" data-act="bfack" data-id="' + b.id + '">Markierte abhaken (per Unterschriftenliste)</button></div>'
        : '<p class="ffl-mu">Alle haben bestätigt. 👍</p>') + '</div>' +
      '<div class="ffl-pbox"><div class="ffl-sh">Bestätigt<em>' + done.length + '</em></div>' + (done.length ? '<div class="ffl-bflist">' + done.map(function (a) {
        return '<div class="ffl-bfdone"><span><b>' + esc(nm(a.member_id)) + '</b><small>' + (M[a.method] || a.method) + ' · ' + fmtDT(a.at) + (a.method !== 'app' ? ' · ' + esc(a.by) : '') + '</small></span>' +
          (a.method !== 'app' ? '<button type="button" class="ffl-sm" data-act="bfunack" data-id="' + b.id + '" data-v="' + a.member_id + '" title="Haken entfernen">✕</button>' : '') + '</div>';
      }).join('') + '</div>' : '<p class="ffl-mu">Noch niemand.</p>') + '</div></div>';
    h += '<div class="ffl-row" style="margin-top:12px">' + (b.active ? '' : '<button type="button" class="ffl-p" data-act="bfpublish" data-id="' + b.id + '">Freigeben & Mitglieder informieren</button>') +
      '<button type="button" data-act="bfprint" data-id="' + b.id + '">Unterschriftenliste drucken</button>' +
      '<button type="button" class="ffl-q" style="margin-left:auto;color:var(--red-tx)" data-act="bfdel" data-id="' + b.id + '">Unterweisung löschen</button></div>' +
      (b.active ? '' : '<div class="ffl-msg warn" style="margin-top:10px">Entwurf: Mitglieder sehen diese Unterweisung noch nicht.</div>');
    h += '<div class="ffl-pbox" style="margin-top:14px" data-bfform="' + b.id + '"><div class="ffl-sh">Inhalt & Einstellungen</div><div class="ffl-form2">' +
      '<div class="span2"><label class="ffl-fl">Titel</label><input type="text" data-bf="title" value="' + esc(b.title) + '"></div>' +
      '<div class="span2"><label class="ffl-fl">Inhalt (sehen die Mitglieder beim Bestätigen)</label><textarea data-bf="text" rows="4">' + esc(b.text) + '</textarea></div>' +
      '<div class="span2"><label class="ffl-fl">Link zur Unterlage (optional, z. B. aus „Unterlagen“)</label><input type="url" data-bf="link" value="' + esc(b.link) + '" placeholder="https://…"></div>' +
      '<div><label class="ffl-fl">Für wen</label>' + briefAud(b.audience) + '</div><div><label class="ffl-fl">Bestätigen bis</label><input type="date" data-bf="due" value="' + esc(b.due || '') + '"></div>' +
      '<div><label class="ffl-fl">Durchgeführt am (Dienstabend)</label><input type="date" data-bf="held" value="' + esc(b.held || '') + '"></div>' +
      '<div><label class="ffl-check" style="margin-top:28px"><input type="checkbox" data-bf="active"' + (b.active ? ' checked' : '') + '> für Mitglieder sichtbar</label></div></div>' +
      '<button type="button" class="ffl-p" style="margin-top:10px" data-act="bfsave" data-id="' + b.id + '">Speichern</button></div></div>';
    return h;
  }
  function briefPrint(b) {
    var mem = by(d.members, 'id'), ackBy = {}; (b.acks || []).forEach(function (a) { ackBy[a.member_id] = a; });
    var ids = b.members.slice().sort(function (x, y2) { return (mem[x] || {}).name < (mem[y2] || {}).name ? -1 : 1; });
    printNow('<div class="pr-doc"><h1>' + esc(b.title) + ' ' + b.year + '</h1><p>' + esc(b.text) + '</p><p>Durchgeführt am: ' + (b.held ? fmtDate(b.held) : '____________') + ' &nbsp; Unterweisende Person: ______________________</p>' +
      '<table class="pr-table"><tr><th style="width:38%">Name</th><th style="width:22%">Datum</th><th>Unterschrift</th></tr>' + ids.map(function (id) {
        var a = ackBy[id];
        return '<tr><td>' + esc((mem[id] || {}).name || '') + '</td><td>' + (a ? fmtDate(a.at) : '') + '</td><td>' + (a ? '<small>bestätigt (' + (a.method === 'app' ? 'App' : 'Liste') + ')</small>' : '') + '</td></tr>';
      }).join('') + '</table></div>', true);
  }

  // ---- Website im Wehrwerk-Design: Grunddaten, Seiten als Entwurf anlegen, Vorschau ------------------------------------
  function tabSite() {
    var S = d.site; if (!S) return '<p class="ffl-mu">Nur für die Verwaltung.</p>';
    var st = S.settings, made = S.pages.filter(function (p) { return p.id; }).length;
    function f(k, label, ph, type) { return '<div><label class="ffl-fl" for="ffl-ws-' + k + '">' + label + '</label><input type="' + (type || 'text') + '" id="ffl-ws-' + k + '" data-ws="' + k + '" value="' + esc(st[k] || '') + '" placeholder="' + esc(ph || '') + '"></div>'; }
    var h = '<div class="ffl-sec"><div class="ffl-sh">Website im Wehrwerk-Design</div><p class="ffl-mu" style="margin-top:0">Neue Startseite und Unterseiten im gleichen Design wie die App – mit Live-Einsätzen, Zahlen, Neuigkeiten und Dienstabenden. ' +
      'Die Seiten sind normale WordPress-Seiten mit der Vorlage „Wehrwerk-Website“: Texte und Bilder änderst du im WordPress-Editor (Bausteine wie <code>[ww_hero]</code>, <code>[ww_einsaetze]</code>, <code>[ww_kacheln]</code>).</p>' +
      '<div class="ffl-msg">Angelegt wird alles als <b>Entwurf</b> – auf der Website ändert sich nichts, bis du eine Seite veröffentlichst. Bestehende Seiten werden nie überschrieben.</div>';
    h += '<div class="ffl-plist">' + S.pages.map(function (p) {
      var chip = !p.id ? '<span class="ffl-chip st-no">noch nicht angelegt</span>' : p.status === 'publish' ? '<span class="ffl-chip st-ok">online</span>' : '<span class="ffl-chip st-warn">Entwurf</span>';
      return '<div class="ffl-prow is-static"><span><b>' + esc(p.title) + '</b><small>' + (S.front && S.front === p.id ? 'Startseite der Website · ' : '') + chip + '</small></span><span class="ffl-row" style="gap:6px">' +
        (p.view ? '<a class="ffl-btn ffl-sm" href="' + esc(p.view) + '" target="_blank" rel="noopener">Vorschau</a>' : '') + (p.edit ? '<a class="ffl-btn ffl-sm" href="' + esc(p.edit) + '" target="_blank" rel="noopener">Bearbeiten</a>' : '') + '</span></div>';
    }).join('') + '</div>';
    h += S.can_pages ? '<button type="button" class="ffl-p" data-act="wspages"' + (made === S.pages.length ? ' disabled' : '') + '>' + (made ? 'Fehlende Seiten als Entwurf anlegen' : 'Alle Seiten als Entwurf anlegen') + '</button>' + (S.pages.some(function (p) { return p.status === 'draft'; }) ? ' <button type="button" class="ffl-sm" data-act="wsrefresh" title="Überträgt die aktuellen Vorlagen (Texte, Bilder, Bausteine) auf alle Seiten im Entwurf – veröffentlichte Seiten bleiben unverändert, die alte Fassung bleibt als Revision erhalten">Entwürfe aktualisieren</button>' : '')
      : '<p class="ffl-mu">Seiten anlegen dürfen nur Website-Admins (WordPress-Recht „Seiten bearbeiten“).</p>';
    h += '<p class="ffl-mu" style="margin-top:10px"><b>Online stellen:</b> Seite in der Vorschau prüfen → im Editor „Veröffentlichen“. Die neue Startseite festlegen unter WordPress → Einstellungen → Lesen → „Eine statische Seite“. ' +
      'Das Menü baut sich aus diesen Seiten; eigenes Menü möglich unter Design → Menüs → Position „Wehrwerk-Website: Hauptmenü“.</p></div>';
    h += '<div class="ffl-sec"><div class="ffl-sh">Angaben für Kopf, Fuß und Zahlen</div><div class="ffl-form2">' +
      '<div class="span2"><label class="ffl-fl" for="ffl-ws-claim">Spruch auf der Startseite</label><input type="text" id="ffl-ws-claim" data-ws="claim" value="' + esc(st.claim) + '"></div>' +
      f('street', 'Straße (Gerätehaus)') + '<div class="ffl-form2" style="gap:8px">' + f('zip', 'PLZ') + f('city', 'Ort') + '</div>' + f('phone', 'Telefon', '+49 …', 'tel') + f('mail', 'E-Mail', 'info@…', 'email') +
      f('instagram', 'Instagram (Link)', 'https://instagram.com/…', 'url') + f('facebook', 'Facebook (Link)', 'https://facebook.com/…', 'url') + f('imprint', 'Impressum (Link)', '', 'url') + f('privacy', 'Datenschutz (Link)', '', 'url') +
      f('founded', 'Gegründet (Jahr)', 'z. B. 1900') + f('members', 'Aktive Kräfte (leer = aus Wehrwerk zählen)') + f('vehicles', 'Einsatzfahrzeuge (leer = aus Wehrwerk zählen)') + f('drill_place', 'Ort der Übungsabende', 'z. B. Gerätehaus Musterstadt') +
      '</div><label class="ffl-check" style="margin-top:10px"><input type="checkbox" id="ffl-ws-drills"' + (st.drills_public ? ' checked' : '') + '> Nächste Dienstabende öffentlich zeigen (nur Datum, Uhrzeit, Einheit – keine Namen)</label>' +
      '<button type="button" class="ffl-p" style="margin-top:12px" data-act="wssave">Speichern</button></div>';
    // Instagram: Beiträge holt der Server, Bilder liegen auf der eigenen Website (Besucher laden nichts von Meta); der Schlüssel erscheint nie im Browser
    var ig = S.instagram || {};
    h += '<div class="ffl-sec"><div class="ffl-sh">Instagram auf der Website<em>' + (ig.connected ? 'verbunden' + (ig.user ? ' als @' + esc(ig.user) : '') : 'nicht verbunden') + '</em></div>' +
      '<p class="ffl-mu" style="margin-top:0">Baustein <code>[ww_instagram anzahl="6"]</code> zeigt die neuesten Beiträge und verlinkt aufs Profil (Stories und Highlights gibt Instagram nicht heraus). Ohne Verbindung zeigt er nur den Link zum Profil.</p>' +
      (ig.connected ? '<div class="ffl-msg ' + (ig.err ? 'err' : 'ok') + '">' + (ig.err ? esc(ig.err) : ig.count + ' Beiträge geladen' + (ig.fetched ? ', zuletzt ' + esc(fmtDT(ig.fetched)) : '') + (ig.expires ? ' · Zugang verlängert sich automatisch (gültig bis ' + esc(fmtDate(ig.expires)) + ')' : '')) + '</div>' +
        '<div class="ffl-row"><button type="button" class="ffl-sm" data-act="igreload">Jetzt neu laden</button><button type="button" class="ffl-sm ffl-q" data-act="igoff">Trennen</button></div>'
      : '<ol class="ffl-howto"><li>Instagram-Konto auf <b>Profi-Konto</b> (Business oder Creator) stellen – in der Instagram-App unter Einstellungen → Kontoart.</li>' +
        '<li>Auf developers.facebook.com eine App anlegen, Produkt „Instagram“ → „API mit Instagram-Login“ hinzufügen und das Konto als Tester eintragen.</li>' +
        '<li>Dort „Zugriffsschlüssel generieren“ und den Schlüssel unten einfügen. Er bleibt nur auf dem Server und verlängert sich von selbst.</li></ol>' +
        '<div class="ffl-row"><input type="password" id="ffl-igtoken" class="ffl-grow" autocomplete="off" placeholder="Zugangsschlüssel (Access Token)"><button type="button" class="ffl-p" data-act="igconnect">Verbinden</button></div>') + '</div>';
    return h + photoSec();
  }
  // Fotos ordnen: sprechende Titel, Alternativtext und Bildbereich (Gruppenfoto, Einsatz …) – Datei und Adresse bleiben, Slider laufen weiter
  function photoSec() {
    var P = ui.ph;
    var h = '<div class="ffl-sec" id="ffl-photos"><div class="ffl-sh">Fotos ordnen' + (P ? '<em>' + P.open + ' von ' + P.all + ' noch zu benennen</em>' : '') + '</div>' +
      '<p class="ffl-mu" style="margin-top:0">Fotos mit Namen wie „IMG_4465“ oder „WhatsApp Image …“ bekommen einen sprechenden Titel, einen Alternativtext (für Suchmaschinen und Vorleseprogramme) und einen Bildbereich. ' +
      'So findest du sie in der Mediathek schnell wieder (Filter „Bildbereiche“), und <code>[ww_galerie bereich="gruppenfoto"]</code> zeigt einen Bereich auf der Website. <b>Dateiname und Adresse bleiben</b> – Slider und Beiträge funktionieren weiter.</p>';
    if (!P) return h + '<button type="button" class="ffl-p" data-act="phload">Fotos laden</button></div>';
    var cats = P.cats || [];
    h += '<div class="ffl-row" style="margin-bottom:10px"><div class="ffl-seg" role="group">' + [['offen', 'Noch zu benennen (' + P.open + ')'], ['alle', 'Alle (' + P.all + ')']].map(function (x) {
      return '<button type="button" data-act="phfilter" data-v="' + x[0] + '" aria-pressed="' + (P.filter === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div>' +
      sel([['', 'Bildbereich …']].concat(cats.map(function (c) { return [c.slug, c.name + ' (' + c.n + ')']; })), ['offen', 'alle'].indexOf(P.filter) < 0 ? P.filter : '', 'data-phcat="1" style="width:auto"') + '</div>';
    if (!P.items.length) return h + '<p class="ffl-mu">Keine Fotos in dieser Auswahl.</p></div>';
    h += '<div class="ffl-phlist">' + P.items.map(function (it) {
      var t = P.edit[it.id] || {}, title = t.title != null ? t.title : (it.sugg || (it.raw ? '' : it.title)), alt = t.alt != null ? t.alt : (it.alt || (it.sugg || (it.raw ? '' : it.title))), mine = t.cats || it.cats;
      return '<div class="ffl-phrow" data-ph="' + it.id + '"><a class="ffl-phimg" href="' + esc(it.full) + '" target="_blank" rel="noopener"><img src="' + esc(it.thumb) + '" alt="" loading="lazy"></a><div class="ffl-phf">' +
        '<div class="ffl-mu" style="font-size:12px">' + esc(fmtDate(it.date)) + (it.parent ? ' · in „' + esc(it.parent) + '“' : '') + (it.raw ? ' · bisher „' + esc(it.title) + '“' : '') + '</div>' +
        '<label class="ffl-fl">Titel</label><input type="text" data-phf="title" value="' + esc(title) + '" placeholder="' + esc(it.raw ? 'Neuer Titel statt „' + it.title + '“' : 'z. B. Gruppenfoto Löschzug 2024') + '">' +
        '<label class="ffl-fl">Alternativtext – was ist zu sehen?</label><input type="text" data-phf="alt" value="' + esc(alt) + '" placeholder="z. B. Rund 60 Feuerwehrleute in Uniform vor dem Gerätehaus">' +
        '<div class="ffl-chips" style="margin-top:8px">' + cats.map(function (c) { return '<label class="ffl-toggle-chip"><input type="checkbox" data-phc="' + esc(c.slug) + '"' + (mine.indexOf(c.slug) >= 0 ? ' checked' : '') + '>' + esc(c.name) + '</label>'; }).join('') + '</div></div></div>';
    }).join('') + '</div>';
    var pages = Math.ceil(P.total / P.per);
    if (pages > 1) h += '<div class="ffl-row" style="margin-top:10px"><button type="button" class="ffl-sm" data-act="phpage" data-v="' + (P.page - 1) + '"' + (P.page > 1 ? '' : ' disabled') + '>← Zurück</button><span class="ffl-mu">Seite ' + P.page + ' von ' + pages + '</span>' +
      '<button type="button" class="ffl-sm" data-act="phpage" data-v="' + (P.page + 1) + '"' + (P.page < pages ? '' : ' disabled') + '>Weiter →</button></div>';
    // Vorschläge (Titel aus dem Beitrag) zählen schon als Änderung – ein Klick auf „Speichern“ übernimmt sie
    var n = P.items.filter(function (it) { return P.edit[it.id] || (it.sugg && it.sugg !== it.title) || (!it.alt && !it.raw); }).length;
    return h + '<div class="ffl-savebar" id="ffl-phbar"' + (n ? '' : ' hidden') + '><span>' + (n || '') + ' Fotos geändert</span><button type="button" class="ffl-q" data-act="phdiscard">Verwerfen</button><button type="button" class="ffl-p" data-act="phsave">Speichern</button></div></div>';
  }
  function phLoad(filter, page) {
    return api('GET', 'admin/site/photos', null, 'filter=' + encodeURIComponent(filter || 'offen') + '&page=' + (page || 1)).then(function (r) {
      r.filter = filter || 'offen'; r.edit = {}; ui.ph = r; render();
      var el = document.getElementById('ffl-photos'); if (el && page) el.scrollIntoView({ block: 'start' });
    }, function (e) { flash('err', e.message); });
  }
  // Änderungen je Foto merken (auch die übernommenen Vorschläge zählen erst, wenn man etwas anfasst oder speichert)
  root.addEventListener('input', phTouch); root.addEventListener('change', phTouch);
  function phTouch(e) {
    if (e.target.getAttribute && e.target.getAttribute('data-phcat')) { if (e.type === 'change') phLoad(e.target.value || 'alle', 1); return; }
    var row = e.target.closest && e.target.closest('[data-ph]'); if (!row || !ui.ph) return;
    ui.ph.edit[row.getAttribute('data-ph')] = phRead(row);
    var bar = document.getElementById('ffl-phbar'); if (bar) { bar.hidden = false; bar.querySelector('span').textContent = phChanged().length + ' Fotos geändert'; }
  }
  function phChanged() {
    var by2 = {}; ui.ph.items.forEach(function (it) { by2[it.id] = it; });
    // Leerer Titel = bisherigen behalten (Kamera-Namen werden nicht vorausgefüllt)
    return [].map.call(document.querySelectorAll('#ffl-photos [data-ph]'), function (row) { var x = phRead(row); x.id = +row.getAttribute('data-ph'); if (!x.title && by2[x.id]) x.title = by2[x.id].title; return x; }).filter(function (x) {
      var it = by2[x.id]; return it && (x.title !== it.title || x.alt !== it.alt || x.cats.slice().sort().join() !== it.cats.slice().sort().join());
    });
  }
  function phRead(row) {
    return { title: row.querySelector('[data-phf="title"]').value.trim(), alt: row.querySelector('[data-phf="alt"]').value.trim(),
      cats: [].map.call(row.querySelectorAll('[data-phc]:checked'), function (c) { return c.getAttribute('data-phc'); }) };
  }

  // ---- Leihkleidung (Jogginganzüge, Schlappen …): wer hat was – nur aktueller Stand, dazu Bestand je Größe ----
  function tabLoans() {
    var items = d.loan_items || [], stock = d.loan_stock || {}, loans = d.loans || [];
    var lfor = ui.loanFor ? by(d.members, 'id')[ui.loanFor] : null; ui.loanFor = null; // aus dem Mitgliedsprofil: Name schon eingetragen
    var out = {}; loans.forEach(function (l) { var k = l.item + '|' + l.size; out[k] = (out[k] || 0) + l.qty; });
    var incs = (d.incidents || []).filter(function (i) { return i.start >= addDays(isoToday(), -14); }).slice(0, 10);
    var h = '<div class="ffl-grid2" style="margin-top:12px"><div class="ffl-pbox"><div class="ffl-sh">Ausgeben</div>' +
      '<label class="ffl-fl" style="margin-top:0">An wen</label>' + memberPicker('ffl-lnm', null, 'Name tippen …').replace('autocomplete="off"', 'autocomplete="off" value="' + esc(lfor ? lfor.name : '') + '"') +
      '<div class="ffl-form2"><div><label class="ffl-fl">Teil</label>' + sel(items.map(function (x) { return [x, x]; }), ui.loanItem || items[0] || '', 'id="ffl-litem"') + '</div>' +
      '<div><label class="ffl-fl">Größe</label><input type="text" id="ffl-lsize" list="ffl-lsizes" placeholder="z. B. L, 44"><datalist id="ffl-lsizes">' + Object.keys(stock).filter(function (k) { return k.indexOf((ui.loanItem || items[0]) + '|') === 0; }).map(function (k) { return '<option value="' + esc(k.split('|')[1]) + '">'; }).join('') + '</datalist></div>' +
      '<div><label class="ffl-fl">Anzahl</label><input type="number" id="ffl-lqty" value="1" min="1" max="20"></div>' +
      '<div><label class="ffl-fl">Einsatz (optional)</label>' + sel([['', '–']].concat(incs.map(function (i) { return [String(i.id), (i.nr ? i.nr + ' ' : '') + i.title + ' · ' + fmtDate(i.start)]; })), '', 'id="ffl-linc"') + '</div></div>' +
      '<button type="button" class="ffl-p" style="margin-top:10px" data-act="loanadd">Ausgeben</button><p class="ffl-mu" style="margin:6px 0 0">Das Mitglied sieht im Mitgliederbereich, was es noch zurückgeben muss.</p></div>';
    // Bestand je Teil und Größe: „S:2, M:4, L:4“ – verfügbar = Bestand minus verliehen
    h += '<div class="ffl-pbox"><div class="ffl-sh">Bestand</div><table class="ffl-table"><thead><tr><th>Teil</th><th>Größen & Anzahl</th><th>verfügbar</th></tr></thead><tbody>' + items.map(function (it) {
      var keys = Object.keys(stock).filter(function (k) { return k.indexOf(it + '|') === 0; });
      var txt = keys.map(function (k) { return k.split('|')[1] + ':' + stock[k]; }).join(', ');
      var free = keys.map(function (k) { var f = stock[k] - (out[k] || 0); return '<span class="ffl-chip ' + (f <= 0 ? 'st-bad' : f === 1 ? 'st-warn' : 'st-ok') + '">' + esc(k.split('|')[1]) + ': ' + f + '</span>'; }).join(' ');
      return '<tr><td><b>' + esc(it) + '</b></td><td><input type="text" data-lstock="' + esc(it) + '" value="' + esc(txt) + '" placeholder="S:2, M:4, L:4, XL:2"></td><td>' + (free || '<span class="ffl-mu">–</span>') + '</td></tr>';
    }).join('') + '</tbody></table><label class="ffl-fl">Teile (mit Komma getrennt)</label><input type="text" id="ffl-litems" value="' + esc(items.join(', ')) + '">' +
      '<button type="button" class="ffl-sm" style="margin-top:8px" data-act="loansetup">Bestand speichern</button></div></div>';
    var L = MYFUI.lt(ui, 'loans', loans, { noun: 'ausgeliehen', ph: 'Name, Teil, Größe …', per: 25,
      csv: { name: 'Leihkleidung', cols: [['Name', function (l) { return l.name; }], ['Teil', function (l) { return l.item; }], ['Größe', function (l) { return l.size; }], ['Anzahl', function (l) { return l.qty; }], ['seit', function (l) { return fmtDate(l.since); }], ['Einsatz', function (l) { return l.incident; }]] }, text: function (l) { return [l.name, l.item, l.size, l.incident].join(' '); },
      sorts: [['since', 'zuletzt ausgegeben', function (l) { return l.since + '|' + l.id; }, -1], ['name', 'Name', function (l) { return l.name; }, 1], ['item', 'Teil & Größe', function (l) { return l.item + '|' + l.size; }, 1], ['old', 'am längsten weg', function (l) { return l.since; }, 1]] });
    h += '<div class="ffl-sec"><div class="ffl-sh">Noch nicht zurück<em>' + loans.length + '</em></div>' + L.bar +
      (loans.length ? '<div class="ffl-scroll"><table class="ffl-table"><thead><tr><th style="width:30px"></th><th>Name</th><th>Teil</th><th>Größe</th><th>Anz.</th><th>seit</th><th>Einsatz</th><th></th></tr></thead><tbody>' + L.rows.map(function (l) {
        var old = l.since < addDays(isoToday(), -14);
        return '<tr><td><input type="checkbox" data-lsel="' + l.id + '"></td><td><b>' + esc(l.name || '(gelöscht)') + '</b></td><td>' + esc(l.item) + '</td><td>' + esc(l.size) + '</td><td>' + l.qty + '</td>' +
          '<td' + (old ? ' style="color:var(--red-tx)" title="länger als 2 Wochen"' : '') + '>' + fmtDate(l.since) + '</td><td class="ffl-mu">' + esc(l.incident) + '</td><td><button type="button" class="ffl-sm" data-act="loanret" data-id="' + l.id + '">Zurück</button></td></tr>';
      }).join('') + '</tbody></table></div>' + L.pager + '<button type="button" class="ffl-sm" style="margin-top:8px" data-act="loanretsel">Markierte zurück</button>' : '<p class="ffl-mu">Alles zurück. 👍</p>') + '</div>';
    return h;
  }

  // ---- Atemschutzüberwachung: Zeiten und Drücke der Trupps aus dem Einsatz bzw. der Übung erfassen und ablegen ----------
  function asuNew(inc) {
    var A = d.asu, agt = inc ? inc.agt : [];
    var veh = {}; agt.forEach(function (x) { (veh[x.vehicle || ''] = veh[x.vehicle || ''] || []).push(x); });
    var first = Object.keys(veh)[0] || '';
    var people = (veh[first] || []).slice(0, 3).map(function (x, k) { return { member_id: x.member_id, name: x.name, fn: k ? 'TM' : 'TF', pa: '', mask: '', bottle: '', p_start: '', p_end: '' }; });
    return { id: 0, incident_id: inc ? inc.id : 0, station: first, supervisor: inc && inc.ma ? (inc.ma[first] || '') : '', status: 'open', files: [], reopen_note: '',
      trupps: [{ name: A.trupps[0] + ' 1', task: '', t_start: '', checks: [{ t: '', p: '' }, { t: '', p: '' }], t_retreat: '', t_end: '', note: '', members: people.length ? people : [asuPerson('TF'), asuPerson('TM')] }] };
  }
  function asuPerson(fn) { return { member_id: null, name: '', fn: fn || 'TM', pa: '', mask: '', bottle: '', p_start: '', p_end: '' }; }
  function asuMin(t) {
    if (!t.t_start || !t.t_end) return 0;
    var a = +t.t_start.slice(0, 2) * 60 + +t.t_start.slice(3, 5), b = +t.t_end.slice(0, 2) * 60 + +t.t_end.slice(3, 5), x = b - a; if (x < 0) x += 1440;
    return x > 0 && x <= 600 ? x : 0;
  }
  function asuKind(i) { return i.kind === 'uebung' ? 'Übung' : 'Einsatz'; }
  function tabAsu() {
    var A = d.asu; if (!A) return '';
    if (ui.asuEdit) return asuEditor();
    var h = '<div class="ffl-sec"><p class="ffl-mu" style="margin-top:0">Im Einsatz bzw. bei der Übung schreibt die Atemschutzüberwachung Zeiten und Drücke der Trupps auf. Hier wird der Bogen erfasst und abgelegt – ' +
      'mit Foto oder Scan. Nach „Abschließen“ ist das Protokoll gesperrt; die Minuten stehen dann im Atemschutz-Verlauf der Träger, benutzte Geräte gehen in die Prüfung.</p>';
    var list = A.incidents.filter(function (i) { return i.agt.length || i.protos.length || ui.asuAll; });
    var mById = d.can_agt ? by(d.members, 'id') : {};
    // Suche, Sortierung, Seiten und Zeitraum wie bei allen Listen – auch nach vielen Jahren übersichtlich
    function asuState(i) { var c = i.protos.filter(function (p) { return p.status === 'closed'; }).length; return c && c === i.protos.length ? 2 : i.protos.length ? 1 : 0; }
    var L = MYFUI.lt(ui, 'asu', list, { noun: 'Einsätze/Übungen', ph: 'Nummer, Stichwort, Name, Fahrzeug …', per: 20,
      text: function (i) { return [i.nr, i.title, fmtDate(i.start)].concat(i.agt.map(function (x) { return x.name + ' ' + x.vehicle; })).concat(i.protos.map(function (p) { return p.station; })).join(' '); },
      sorts: [['neu', 'neueste zuerst', function (i) { return i.start; }, -1], ['alt', 'älteste zuerst', function (i) { return i.start; }, 1], ['offen', 'fehlende zuerst', function (i) { return asuState(i) + '|' + (9e12 - Date.parse(i.start.replace(' ', 'T'))); }, 1]],
      extra: yearSel(),
      csv: { name: 'Atemschutzueberwachung', cols: [['Datum', function (i) { return fmtDate(i.start) + ' ' + i.start.slice(11, 16); }], ['Nr', function (i) { return i.nr; }], ['Art', function (i) { return i.kind === 'uebung' ? 'Übung' : 'Einsatz'; }], ['Stichwort', function (i) { return i.title; }],
        ['AGT', function (i) { return i.agt.map(function (x) { return x.name; }).join('; '); }], ['Protokolle', function (i) { return i.protos.map(function (p) { return (p.station || 'Protokoll') + (p.status === 'closed' ? ' (abgelegt)' : ' (in Arbeit)'); }).join('; '); }],
        ['Status', function (i) { return ['fehlt', 'in Arbeit', 'abgelegt'][asuState(i)]; }]] } });
    h += L.bar;
    h += list.length ? '<div class="ffl-asulist">' + L.rows.map(function (i) {
      var closed = i.protos.filter(function (p) { return p.status === 'closed'; }).length, open = i.protos.length - closed;
      var st = closed && !open ? '<span class="ffl-chip st-ok">abgelegt</span>' : open ? '<span class="ffl-chip st-warn">in Arbeit</span>' : '<span class="ffl-chip st-bad">fehlt</span>';
      return '<div class="ffl-asurow"><div class="ffl-day">' + esc(fmtDate(i.start)) + '<small>' + esc(i.start.slice(11, 16)) + '</small></div><div class="ffl-ct"><b>' + esc((i.nr ? i.nr + ' · ' : '') + i.title) + '</b>' +
        '<div class="ffl-mu">' + asuKind(i) + ' · ' + (i.agt.length ? i.agt.length + ' AGT gemeldet: ' + i.agt.map(function (x) {
          // G26 am Einsatztag abgelaufen → markieren (nur für Atemschutz-Berechtigte sichtbar)
          var mm = mById[x.member_id], bad = mm && (!mm.g26_until || mm.g26_until < i.start.slice(0, 10));
          return esc(x.name.split(',')[0]) + (bad ? ' <span class="ffl-chip st-bad" title="G26 am Einsatztag nicht gültig">G26 ✕</span>' : '');
        }).join(', ') : 'keine AGT gemeldet') + '</div>' +
        '<div class="ffl-row" style="margin-top:6px;gap:6px">' + st + i.protos.map(function (p) {
          return '<button type="button" class="ffl-sm" data-asu-act="open" data-id="' + p.id + '" data-inc="' + i.id + '">' + esc(p.station || 'Protokoll') + (p.status === 'closed' ? ' ✓' : ' ✎') + '</button>';
        }).join('') + '<button type="button" class="ffl-sm ffl-p" data-asu-act="new" data-inc="' + i.id + '">+ Bogen erfassen</button></div></div></div>';
    }).join('') + '</div>' + L.pager : '<p class="ffl-mu">Im gewählten Zeitraum hat sich niemand als AGT gemeldet.</p>';
    h += '<button type="button" class="ffl-sm" style="margin-top:10px" data-asu-act="all">' + (ui.asuAll ? 'Nur mit gemeldeten AGT' : 'Auch ohne gemeldete AGT zeigen') + '</button></div>';
    return h;
  }
  function asuEditor() {
    var A = d.asu, e = ui.asuEdit, inc = A.incidents.filter(function (i) { return i.id === e.incident_id; })[0] || { title: '?', start: '', kind: '' };
    var ro = e.status === 'closed', dis = ro ? ' disabled' : '';
    function inp(k, v, attr) { attr = attr || ''; return '<input' + (/type=/.test(attr) ? '' : ' type="text"') + ' data-asu="' + k + '" value="' + esc(v == null ? '' : v) + '"' + attr + dis + '>'; }
    var h = '<div class="ffl-sec"><div class="ffl-psub"><button type="button" class="ffl-back" data-asu-act="close">‹ Übersicht</button><div><b>Atemschutzüberwachung</b><div class="ffl-mu">' +
      asuKind(inc) + ' ' + esc((inc.nr ? inc.nr + ' · ' : '') + inc.title) + ' · ' + esc(fmtDate(inc.start)) + ' ' + esc(inc.start.slice(11, 16)) + '</div></div></div>';
    if (ro) h += '<div class="ffl-msg ok">Abgeschlossen von ' + esc(e.closed_by) + ' am ' + esc(fmtDT(e.closed_at || '')) + ' – nicht mehr änderbar. Zum Korrigieren „Wieder öffnen“ (mit Grund).</div>';
    if (e.reopen_note) h += '<div class="ffl-msg warn" style="white-space:pre-line"><b>Wieder geöffnet:</b>\n' + esc(e.reopen_note) + '</div>';
    h += '<datalist id="ffl-asu-people">' + A.people.map(function (m) { return '<option value="' + esc(m.name) + '">'; }).join('') + '</datalist>' +
      '<datalist id="ffl-asu-pa">' + A.devices.pa.map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist>' +
      '<datalist id="ffl-asu-mask">' + A.devices.mask.map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist>' +
      '<datalist id="ffl-asu-bottle">' + A.devices.bottle.map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist>' +
      '<datalist id="ffl-asu-st">' + A.stations.map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist>' +
      '<datalist id="ffl-asu-tr">' + A.trupps.map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist>';
    h += '<div class="ffl-form2"><div><label class="ffl-fl">Überwachungsstelle / Fahrzeug</label>' + inp('station', e.station, ' list="ffl-asu-st" placeholder="z. B. HLF 20"') + '</div>' +
      '<div><label class="ffl-fl">Überwacht von</label>' + inp('supervisor', e.supervisor, ' list="ffl-asu-people" placeholder="Name (z. B. Maschinist)"') + '</div></div>';
    e.trupps.forEach(function (t, ti) {
      var min = asuMin(t), low = null;
      t.members.forEach(function (m) { if (m.p_start !== '' && m.p_start != null) low = low === null ? +m.p_start : Math.min(low, +m.p_start); });
      h += '<div class="ffl-asutrupp"><div class="ffl-asuth">' + inp('t.' + ti + '.name', t.name, ' list="ffl-asu-tr" class="ffl-asutn" placeholder="Trupp"') +
        (min ? '<span class="ffl-chip st-ok">' + min + ' min</span>' : '') + (ro ? '' : '<button type="button" class="ffl-sm" data-asu-act="deltrupp" data-i="' + ti + '" title="Trupp entfernen">✕</button>') + '</div>' +
        '<label class="ffl-fl">Auftrag</label>' + inp('t.' + ti + '.task', t.task, ' placeholder="z. B. Menschenrettung 1. OG, Brandbekämpfung Keller"') +
        '<div class="ffl-asutimes">' +
        '<div><label class="ffl-fl">Anschluss</label>' + inp('t.' + ti + '.t_start', t.t_start, ' type="time"') + '</div>' +
        t.checks.map(function (c, ci) {
          return '<div><label class="ffl-fl">' + (ci + 1) + '. Kontrolle</label><div class="ffl-asupair">' + inp('t.' + ti + '.c.' + ci + '.t', c.t, ' type="time"') + inp('t.' + ti + '.c.' + ci + '.p', c.p, ' type="number" inputmode="numeric" min="0" max="330" placeholder="bar"') + '</div></div>';
        }).join('') +
        '<div><label class="ffl-fl">Rückzug</label>' + inp('t.' + ti + '.t_retreat', t.t_retreat, ' type="time"') + '</div>' +
        '<div><label class="ffl-fl">Ende (Gerät ab)</label>' + inp('t.' + ti + '.t_end', t.t_end, ' type="time"') + '</div></div>' +
        (low !== null && t.checks.some(function (c) { return c.p !== '' && c.p != null; }) ? '' : '') +
        '<div class="ffl-scroll"><table class="ffl-table ffl-asutab"><thead><tr><th>Name</th><th>TF/TM</th><th>PA-Nr.</th><th>Maske</th><th>Flasche</th><th>bar Beginn</th><th>bar Ende</th><th></th></tr></thead><tbody>' +
        t.members.map(function (m, mi) {
          var k = 't.' + ti + '.m.' + mi + '.';
          return '<tr><td data-l="Name">' + inp(k + 'name', m.name, ' list="ffl-asu-people" placeholder="Nachname, Vorname"') + (m.name && !m.member_id ? '<small class="ffl-mu">nicht in der Mitgliederliste</small>' : '') + '</td>' +
            '<td data-l="TF/TM"><select data-asu="' + k + 'fn"' + dis + '><option' + (m.fn === 'TF' ? ' selected' : '') + '>TF</option><option' + (m.fn === 'TM' ? ' selected' : '') + '>TM</option></select></td>' +
            '<td data-l="PA-Nr.">' + inp(k + 'pa', m.pa, ' list="ffl-asu-pa"') + '</td><td data-l="Maske">' + inp(k + 'mask', m.mask, ' list="ffl-asu-mask"') + '</td><td data-l="Flasche">' + inp(k + 'bottle', m.bottle, ' list="ffl-asu-bottle"') + '</td>' +
            '<td data-l="bar Beginn">' + inp(k + 'p_start', m.p_start, ' type="number" inputmode="numeric" min="0" max="330"') + '</td><td data-l="bar Ende">' + inp(k + 'p_end', m.p_end, ' type="number" inputmode="numeric" min="0" max="330"') + '</td>' +
            '<td>' + (ro ? '' : '<button type="button" class="ffl-sm" data-asu-act="delperson" data-i="' + ti + '" data-j="' + mi + '" title="Person entfernen">✕</button>') + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        (ro ? '' : '<button type="button" class="ffl-sm" data-asu-act="addperson" data-i="' + ti + '">+ Person</button>') +
        '<label class="ffl-fl">Bemerkung</label>' + inp('t.' + ti + '.note', t.note, ' placeholder="z. B. Flasche gewechselt, Ablösung durch Trupp 2"') + '</div>';
    });
    if (!ro) h += '<button type="button" data-asu-act="addtrupp">+ Trupp</button>';
    h += '<div class="ffl-pbox" style="margin-top:14px"><div class="ffl-sh">Papierbogen</div>' + (e.files.length ? '<ul class="ffl-matlist">' + e.files.map(function (f) {
      return '<li><a href="' + esc(f.url) + '" target="_blank" rel="noopener"><span class="ffl-matext">' + esc((f.name.split('.').pop() || '').toUpperCase()) + '</span><b>' + esc(f.name) + '</b></a></li>';
    }).join('') + '</ul>' : '<p class="ffl-mu">Noch kein Foto oder Scan angehängt.</p>') +
      (ro ? '' : e.id ? '<label class="ffl-btn ffl-sm" style="margin-top:8px">Foto oder Scan anhängen<input type="file" accept="image/*,application/pdf" capture="environment" data-asu-file="1" hidden></label><span class="ffl-mu" id="ffl-asufs"></span>'
        : '<p class="ffl-mu">Nach dem ersten Speichern kannst du Foto oder Scan anhängen.</p>') + '</div>';
    h += '<div class="ffl-row" style="margin-top:14px">' + (ro ? '<button type="button" data-asu-act="reopen">Wieder öffnen …</button>'
      : '<button type="button" class="ffl-p" data-asu-act="save">Speichern</button><button type="button" data-asu-act="closeproto">Abschließen & ablegen</button>') +
      '<button type="button" data-asu-act="print">Drucken</button></div></div>';
    return h;
  }
  // Einsatzmappe: Bericht + Beteiligung + Atemschutzüberwachung + Fahrten – jeweils nur, was diese Person ohnehin sehen darf
  function incDossier(i, reportHtml, withParts) {
    var pages = [];
    if (withParts) pages.push(MYFPrint.participants(i, (d.participation || []).filter(function (p) { return p.incident_id === i.id; }), d.members || [], d.incident_vehicles || []));
    if (d.asu) d.asu.incidents.forEach(function (x) { if (x.id === i.id) x.protos.forEach(function (p) { pages.push(MYFPrint.asu(x, p)); }); });
    if (d.trips) { var vn = by(d.vehicles || [], 'id'); pages.push(MYFPrint.trips(i, d.trips.filter(function (x) { return x.incident_id === i.id; }), function (v) { return (vn[v] || {}).name || ''; })); }
    return MYFPrint.dossier(reportHtml, pages);
  }
  function asuPrint() {
    var e = ui.asuEdit, inc = d.asu.incidents.filter(function (i) { return i.id === e.incident_id; })[0] || { title: '', start: '' };
    printNow(MYFPrint.asu(inc, e), true);
  }
  function asuSave(close) {
    var e = ui.asuEdit;
    return api('POST', 'asu', { id: e.id || undefined, incident_id: e.incident_id, station: e.station, supervisor: e.supervisor, trupps: e.trupps, close: close ? 1 : 0 })
      .then(function (r) { ui.asuOpenId = r.id; flash('ok', close ? 'Abgeschlossen und abgelegt – Minuten und Geräte sind verknüpft.' : 'Gespeichert.'); return reload(); })
      .then(function () { asuReopenEdit(); }, function (err) { flash('err', err.message); });
  }
  function asuReopenEdit() {
    if (!ui.asuOpenId || !d.asu) return;
    d.asu.incidents.forEach(function (i) { i.protos.forEach(function (p) { if (p.id === ui.asuOpenId) ui.asuEdit = JSON.parse(JSON.stringify(p)); }); });
    (ui.asuEdit.trupps || []).forEach(function (t) { while (t.checks.length < 2) t.checks.push({ t: '', p: '' }); if (!t.members.length) t.members.push(asuPerson('TF')); });
    render();
  }
  root.addEventListener('click', function (ev) {
    var g = ev.target.closest('[data-asu-go]'); if (g) { ui.tab = 'agt'; ui.asub = 'asu'; ui.asuEdit = null; return render(); }
    var ag = ev.target.closest('[data-agt-go]'); if (ag) { ui.tab = 'agt'; ui.asub = ag.getAttribute('data-agt-go'); ui.asuEdit = null; return render(); }
    var b = ev.target.closest('[data-asu-act]'); if (!b) return;
    var a = b.getAttribute('data-asu-act'), e = ui.asuEdit, i = +b.getAttribute('data-i'), j = +b.getAttribute('data-j');
    if (a === 'new') { var inc = d.asu.incidents.filter(function (x) { return x.id === +b.getAttribute('data-inc'); })[0]; ui.asuEdit = asuNew(inc); ui.asuOpenId = 0; return render(); }
    if (a === 'open') { ui.asuOpenId = +b.getAttribute('data-id'); return asuReopenEdit(); }
    if (a === 'close') { ui.asuEdit = null; ui.asuOpenId = 0; return render(); }
    if (a === 'all') { ui.asuAll = !ui.asuAll; return render(); }
    if (a === 'addtrupp') { e.trupps.push({ name: d.asu.trupps[0] + ' ' + (e.trupps.length + 1), task: '', t_start: '', checks: [{ t: '', p: '' }, { t: '', p: '' }], t_retreat: '', t_end: '', note: '', members: [asuPerson('TF'), asuPerson('TM')] }); return render(); }
    if (a === 'deltrupp') { if (confirm('Trupp entfernen?')) { e.trupps.splice(i, 1); render(); } return; }
    if (a === 'addperson') { e.trupps[i].members.push(asuPerson('TM')); return render(); }
    if (a === 'delperson') { e.trupps[i].members.splice(j, 1); return render(); }
    if (a === 'save') return asuSave(false);
    if (a === 'closeproto') { if (confirm('Protokoll abschließen? Danach ist es gesperrt (Änderungen nur mit Grund).')) asuSave(true); return; }
    if (a === 'print') return asuPrint();
    if (a === 'reopen') {
      return MYFUI.ask({ title: 'Protokoll wieder öffnen', text: 'Warum wird das Protokoll geändert? Der Grund bleibt sichtbar.', required: true, ok: 'Wieder öffnen' }).then(function (why) {
        if (!why) return;
        return api('POST', 'asu/reopen', { id: e.id, reason: why }).then(function () { flash('ok', 'Wieder geöffnet.'); return reload(); }).then(asuReopenEdit, function (err) { flash('err', err.message); });
      });
    }
  });
  function asuField(ev) {
    var el = ev.target, k = el.getAttribute && el.getAttribute('data-asu'); if (!k || !ui.asuEdit) return;
    var p = k.split('.'), e = ui.asuEdit, v = el.value;
    if (p[0] !== 't') { e[p[0]] = v; return; }
    var t = e.trupps[+p[1]];
    if (p[2] === 'c') t.checks[+p[3]][p[4]] = v;
    else if (p[2] === 'm') {
      var m = t.members[+p[3]]; m[p[4]] = v;
      if (p[4] === 'name') { var hit = d.asu.people.filter(function (x) { return x.name.toLowerCase() === v.trim().toLowerCase(); })[0]; m.member_id = hit ? hit.id : null; if (hit) m.name = hit.name; }
    } else t[p[2]] = v;
  }
  root.addEventListener('input', asuField);
  // Altersgrenze: speichert beim Verlassen des Feldes (kein eigener Knopf)
  root.addEventListener('change', function (ev) { if (ev.target.id === 'ffl-retage' && +ev.target.value >= 50) post('settings', { retire_age: +ev.target.value }, 'Altersgrenze gespeichert.'); });
  root.addEventListener('change', function (ev) {
    asuField(ev);
    var f = ev.target.getAttribute && ev.target.getAttribute('data-asu-file') && ev.target.files[0]; if (!f) return;
    if (f.size > d.asu.max) return flash('err', 'Die Datei ist zu groß.');
    var fd = new FormData(); fd.append('id', ui.asuEdit.id); fd.append('file', f);
    var st = document.getElementById('ffl-asufs'); if (st) st.textContent = ' Lade hoch …';
    fetch(url('asu/file'), { method: 'POST', credentials: 'same-origin', headers: { 'X-WP-Nonce': MYF.nonce }, body: fd })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.message || 'Fehler ' + r.status); return j; }); })
      .then(function () { flash('ok', 'Bogen angehängt.'); return reload(); }).then(asuReopenEdit, function (err) { flash('err', err.message); });
  });

  // Werkstatt eines anderen Bereichs (Gerätewarte, Teams): Geräte | Fälligkeiten | Prüffristen
  function workshopPanel(area) {
    ui.wsArea = area;
    var subs = [['devices', 'Geräte'], ['due', 'Fälligkeiten'], ['rules', 'Gerätearten & Prüffristen']];
    var cur = ui.wsub || 'devices';
    var nDue = wsDueList().filter(function (x) { return x.state !== 'ok'; }).length;
    return '<div class="ffl-subtabs ffl-subtabs-2">' + subs.map(function (x) {
      return '<button type="button" data-act="wsub" data-v="' + x[0] + '" aria-selected="' + (cur === x[0]) + '">' + x[1] + (x[0] === 'due' && nDue ? ' (' + nDue + ')' : '') + '</button>';
    }).join('') + '</div>' + (cur === 'due' ? wsDue() : cur === 'rules' ? wsRules() : ui.dev ? wsDevice() : wsDevices());
  }
  function RS(area) { return (d.ws_rules || {})[area || ui.wsArea] || {}; }
  function rulesOf(dev) { return (d.ws_rules || {})[dev.area || 'agt'] || {}; }
  function typeLabel(dev) { var r = rulesOf(dev)[dev.type]; return r ? r.label : dev.type; }
  function wsAreaLabel() { return ui.wsArea === 'agt' ? 'Atemschutzwerkstatt' : ((d.area_labels || {})[ui.wsArea] || ''); }
  var DSTATCLS = { ready: 'st-ok', used: 'st-warn', blocked: 'st-bad', retired: 'st-no' };
  function wsChecks(id) { return (d.device_checks || []).filter(function (c) { return c.device_id === id; }); }
  function addMonths(iso, m) { var p = iso.split('-'); var t = new Date(Date.UTC(+p[0], p[1] - 1 + m, +p[2])); return t.toISOString().slice(0, 10); }
  // wie auf dem Server: letzte gültige i.-O.-Prüfung je Art + Frist
  function wsDue1(dev) {
    var rules = rulesOf(dev)[dev.type] || { kinds: {} }, cs = wsChecks(dev.id), storno = {};
    cs.forEach(function (c) { if (c.storno_of) storno[c.storno_of] = 1; });
    var out = {};
    Object.keys(rules.kinds).forEach(function (k) {
      var m = +rules.kinds[k][1];
      if (dev.type === 'maske' && k === 'pruef' && dev.storage === 'mobil') m = 6;
      var last = null;
      cs.forEach(function (c) { if (c.kind === k && c.result === 'ok' && !c.storno_of && !storno[c.id] && (!last || c.date > last)) last = c.date; });
      var due = m > 0 && last ? addMonths(last, m) : null, bm = /^(\d{4})(?:-(\d{2}))?$/.exec(dev.built || ''), fromBuilt = false;
      // lange Wechsel-Fristen ohne Eintrag: ab Baujahr (wie auf dem Server)
      if (!last && m >= 24 && bm) { due = addMonths(bm[1] + '-' + (bm[2] || '01') + '-01', m); fromBuilt = true; }
      if (k === 'tuev' && dev.test_due) due = dev.test_due;
      var now = isoToday(), soon = addDays(now, 30);
      var state = m === 0 ? (dev.status === 'used' ? 'over' : 'ok') : !due ? 'none' : due < now ? 'over' : due <= soon ? 'soon' : 'ok';
      out[k] = { last: last, due: due, months: m, state: state, fromBuilt: fromBuilt };
    });
    return out;
  }
  function wsDueList() {
    var list = [];
    (d.devices || []).forEach(function (dev) {
      if (dev.status === 'retired' || (dev.area || 'agt') !== ui.wsArea) return;
      var du = wsDue1(dev);
      Object.keys(du).forEach(function (k) { list.push({ dev: dev, kind: k, label: rulesOf(dev)[dev.type].kinds[k][0], due: du[k].due, last: du[k].last, state: du[k].state, after: du[k].months === 0 }); });
    });
    return list;
  }
  function wsNext(dev) {
    var du = wsDue1(dev), worst = null;
    Object.keys(du).forEach(function (k) { var x = du[k]; if (x.months && (!worst || (x.due || '0') < (worst.due || '0'))) worst = x; });
    return worst;
  }
  function stateChip(state, text) { return '<span class="ffl-chip ' + ({ over: 'st-bad', none: 'st-bad', soon: 'st-warn', ok: 'st-ok' })[state] + '">' + text + '</span>'; }

  function wsDevices() {
    var f = ui.wsType || '';
    if (f && !RS()[f]) f = '';
    var list = (d.devices || []).filter(function (x) { return (x.area || 'agt') === ui.wsArea && (!f || x.type === f) && (ui.wsRetired || x.status !== 'retired'); });
    var h = '<div class="ffl-bar">' + sel([['', 'alle Gerätearten']].concat(Object.keys(RS()).map(function (k) { return [k, RS()[k].label]; })), f, 'id="ffl-wstype" style="width:auto"') +
      '<label><input type="checkbox" id="ffl-wsret"' + (ui.wsRetired ? ' checked' : '') + '> auch ausgesonderte</label><span style="flex:1"></span>' +
      '<button type="button" class="ffl-sm" data-act="wsqr">QR-Etiketten drucken</button><button type="button" class="ffl-sm ffl-p" data-act="wsnew">+ Gerät</button></div>';
    if (ui.wsNew) h += wsDeviceForm({ type: f || Object.keys(RS())[0], storage: 'stationaer', status: 'ready', area: ui.wsArea });
    var L = MYFUI.lt(ui, 'dev_' + ui.wsArea, list, { noun: 'Geräte', ph: 'Nummer, Seriennummer, Hersteller, Standort …', per: 30,
      csv: { name: 'Geraete', cols: [['Art', function (x) { return typeLabel(x); }], ['Nr.', function (x) { return x.nr; }], ['Hersteller', function (x) { return x.maker; }], ['Modell', function (x) { return x.model; }], ['Seriennr.', function (x) { return x.serial; }],
        ['Baujahr', function (x) { return x.built; }], ['Standort', function (x) { return x.location; }], ['Status', function (x) { return (d.device_status || {})[x.status] || x.status; }], ['nächste Frist', function (x) { var n = wsNext(x); return n && n.due ? fmtDate(n.due) : ''; }]] },
      text: function (x) { return [x.nr, x.serial, x.maker, x.model, x.location, (rulesOf(x)[x.type] || {}).label].join(' '); },
      sorts: [['nr', 'Nummer', function (x) { return (rulesOf(x)[x.type] || {}).label + '|' + x.nr; }, 1], ['due', 'nächste Frist zuerst', function (x) { var n = wsNext(x); return n && n.due ? n.due : (n ? '0000' : '9999'); }, 1],
        ['loc', 'Standort', function (x) { return (x.location || '~') + '|' + x.nr; }, 1], ['status', 'Status', function (x) { return x.status + '|' + x.nr; }, 1]] });
    h += L.bar + '<div class="ffl-scroll"><table class="ffl-table"><thead><tr><th>Art</th><th>Nr.</th><th>Hersteller / Modell</th><th>Seriennr.</th><th>Standort</th><th>Status</th><th>nächste Frist</th><th></th></tr></thead><tbody>' +
      L.rows.map(function (x) {
        var n = wsNext(x);
        if (!n) n = null;
        return '<tr><td>' + esc(typeLabel(x)) + '</td><td><b>' + esc(x.nr) + '</b></td><td>' + esc([x.maker, x.model].filter(Boolean).join(' ')) + '</td>' +
          '<td>' + esc(x.serial) + '</td><td>' + esc(x.location) + '</td><td><span class="ffl-chip ' + DSTATCLS[x.status] + '">' + esc(d.device_status[x.status]) + '</span></td>' +
          '<td>' + (n ? stateChip(n.state, n.due ? fmtDate(n.due) : 'nie geprüft') : '') + '</td><td><button type="button" class="ffl-sm" data-act="wsopen" data-id="' + x.id + '">Öffnen</button></td></tr>';
      }).join('') + (list.length ? '' : '<tr><td colspan="8" class="ffl-mu">Noch keine Geräte. „+ Gerät“ oder Import über „Daten“.</td></tr>') + '</tbody></table></div>' + L.pager;
    return h;
  }
  function wsDeviceForm(x) {
    function f(k, label, type) { return '<div><label class="ffl-fl">' + label + '</label><input type="' + (type || 'text') + '" data-wf="' + k + '" value="' + esc(x[k] || '') + '"></div>'; }
    return '<div class="ffl-pbox" data-wsform="' + (x.id || 0) + '"><div class="ffl-form4">' +
      '<div><label class="ffl-fl">Geräteart</label>' + sel(Object.keys(RS(x.area)).map(function (k) { return [k, RS(x.area)[k].label]; }), x.type, 'data-wf="type"') + '</div>' +
      f('nr', 'Nummer (Inventar)') + f('serial', 'Seriennummer') + f('maker', 'Hersteller') + f('model', 'Modell') + f('built', 'Baujahr (JJJJ oder JJJJ-MM)') + f('location', 'Standort / Fahrzeug') +
      // Lagerung zählt nur bei Masken, die Prüffrist laut Stempel nur bei Flaschen – Felder je nach Geräteart zeigen
      ((x.area || 'agt') === 'agt' ? '<div data-wsfor="maske"' + (x.type === 'maske' ? '' : ' hidden') + '><label class="ffl-fl">Lagerung</label>' + sel([['stationaer', 'stationär, verpackt (24 Monate)'], ['mobil', 'auf dem Fahrzeug (6 Monate)']], x.storage, 'data-wf="storage"') + '</div>' +
      '<div data-wsfor="flasche"' + (x.type === 'flasche' ? '' : ' hidden') + '><label class="ffl-fl">Prüffrist laut Stempel</label><input type="date" data-wf="test_due" value="' + esc(x.test_due || '') + '"></div>' : '') +
      '<div><label class="ffl-fl">Status</label>' + sel(Object.keys(d.device_status).map(function (k) { return [k, d.device_status[k]]; }), x.status, 'data-wf="status"') + '</div>' +
      '<div class="span2"><label class="ffl-fl">Bemerkung</label><input type="text" data-wf="note" value="' + esc(x.note || '') + '"></div></div>' +
      '<div class="ffl-row" style="margin-top:10px"><button type="button" class="ffl-p" data-act="wssave" data-id="' + (x.id || 0) + '">' + (x.id ? 'Speichern' : 'Anlegen') + '</button>' +
      (x.id ? '' : '<button type="button" data-act="wsnewcancel">Abbrechen</button>') + '</div></div>';
  }
  function wsDevice() {
    var x = by(d.devices, 'id')[ui.dev];
    if (!x) { ui.dev = null; return wsDevices(); }
    var rules = rulesOf(x)[x.type] || { label: x.type, kinds: {} }, du = wsDue1(x), cs = wsChecks(x.id), storno = {};
    cs.forEach(function (c) { if (c.storno_of) storno[c.storno_of] = c; });
    var h = '<button type="button" class="ffl-q" style="padding:0;margin-top:12px" data-act="wsback">← alle Geräte</button>' +
      '<div class="ffl-sec"><div class="ffl-sh">' + esc(rules.label) + ' ' + esc(x.nr) + '<em><span class="ffl-chip ' + DSTATCLS[x.status] + '">' + esc(d.device_status[x.status]) + '</span></em></div>' +
      // Stammdaten eingeklappt: in der Werkstatt trägt man meist nur Prüfungen ein
      '<details class="ffl-devdata"' + (ui.devDataOpen ? ' open' : '') + '><summary><span class="ffl-mu">' + esc([[x.maker, x.model].filter(Boolean).join(' '), x.serial ? 'SN ' + x.serial : '', x.location, x.built ? 'Bj. ' + x.built : ''].filter(Boolean).join(' · ') || 'Noch keine Gerätedaten') + '</span><b>Gerätedaten bearbeiten</b></summary>' + wsDeviceForm(x) + '</details></div>';
    h += '<div class="ffl-sec"><div class="ffl-sh">Prüfungen & Fristen</div><div class="ffl-scroll"><table class="ffl-table ffl-stack"><thead><tr><th>Prüfart</th><th>Frist</th><th>zuletzt i. O.</th><th>fällig</th></tr></thead><tbody>' +
      Object.keys(rules.kinds).map(function (k) {
        var z = du[k];
        return '<tr><td class="full"><b class="ffl-stk">' + esc(rules.kinds[k][0]) + '</b></td><td data-l="Frist">' + (z.months ? z.months + ' Monate' : 'nach Gebrauch') + '</td><td data-l="zuletzt i. O.">' + (z.last ? fmtDate(z.last) : z.fromBuilt ? '<span class="ffl-mu" title="Noch kein Wechsel eingetragen – Frist ab Baujahr gerechnet">ab Baujahr ' + esc(x.built) + '</span>' : '–') + '</td>' +
          '<td data-l="fällig">' + (z.months ? stateChip(z.state, z.due ? fmtDate(z.due) : 'fällig') : (x.status === 'used' ? stateChip('over', 'jetzt (benutzt)') : '')) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    // Prüfung eintragen
    h += '<div class="ffl-pbox" data-ckform="1"><b>Prüfung eintragen</b><div class="ffl-form4" style="margin-top:6px">' +
      '<div class="span2"><label class="ffl-fl">Prüfart</label>' + sel(Object.keys(rules.kinds).map(function (k) { return [k, rules.kinds[k][0]]; }), ui.ckKind && rules.kinds[ui.ckKind] ? ui.ckKind : x.status === 'used' ? Object.keys(rules.kinds)[0] : '', 'data-cf2="kind"') + '</div>' +
      '<div><label class="ffl-fl">Datum</label><input type="date" data-cf2="date" value="' + isoToday() + '" max="' + isoToday() + '"></div>' +
      '<div><label class="ffl-fl">Ergebnis</label>' + sel([['ok', 'in Ordnung'], ['nok', 'nicht in Ordnung (sperren)']], 'ok', 'data-cf2="result"') + '</div>' +
      '<div><label class="ffl-fl">Prüfgerät / Prüfstelle</label><input type="text" data-cf2="tester" list="ffl-tester-l" placeholder="z. B. Dräger Quaestor 7000">' + sug('ffl-tester-l', (d.device_checks || []).map(function (c) { return c.tester; })) + '</div>' +
      '<div><label class="ffl-fl">Messwerte</label><input type="text" data-cf2="values" placeholder="z. B. Unterdruck −10 mbar i. O."></div>' +
      (x.type === 'flasche' ? '<div><label class="ffl-fl">neue Prüffrist (bei TÜV)</label><input type="date" data-cf2="next_due"></div>' : '') +
      '<div class="span2"><label class="ffl-fl">Bemerkung</label><input type="text" data-cf2="note"></div></div>' +
      '<div class="ffl-row" style="margin-top:10px"><button type="button" class="ffl-go" data-act="cksave" data-id="' + x.id + '">Prüfung speichern</button>' +
      '<span class="ffl-mu">Wird mit deinem Namen und Zeitstempel unveränderbar gespeichert.</span></div></div>';
    // Verlauf
    h += '<div class="ffl-fl" style="margin-top:16px">Prüfverlauf (' + cs.filter(function (c) { return !c.storno_of; }).length + ')</div><div class="ffl-scroll"><table class="ffl-table ffl-stack"><thead><tr><th>Datum</th><th>Prüfart</th><th>Ergebnis</th><th>Prüfgerät</th><th>Messwerte / Bemerkung</th><th>eingetragen von</th><th></th></tr></thead><tbody>' +
      cs.filter(function (c) { return !c.storno_of; }).map(function (c) {
        var s = storno[c.id];
        return '<tr' + (s ? ' class="is-off"' : '') + '><td data-l="Datum">' + fmtDate(c.date) + '</td><td class="full" style="order:-1"><b class="ffl-stk">' + esc(rules.kinds[c.kind] ? rules.kinds[c.kind][0] : c.kind) + '</b></td>' +
          '<td data-l="Ergebnis">' + (c.result === 'ok' ? '<span class="ffl-chip st-ok">i. O.</span>' : '<span class="ffl-chip st-bad">n. i. O.</span>') + '</td><td data-l="Prüfgerät">' + esc(c.tester) + '</td>' +
          '<td class="full">' + esc([c.values, c.note].filter(Boolean).join(' · ')) + (s ? '<div class="ffl-mu" style="color:var(--red-tx)">storniert ' + fmtDate(s.created) + ' von ' + esc(s.by) + ': ' + esc(s.storno_reason) + '</div>' : '') + '</td>' +
          '<td class="ffl-mu full">' + esc(c.by) + '<br>' + fmtDate(c.created) + ' ' + esc(c.created.slice(11, 16)) + '</td><td>' + (s ? '' : '<button type="button" class="ffl-q ffl-sm" data-act="ckstorno" data-id="' + c.id + '">Stornieren</button>') + '</td></tr>';
      }).join('') + '</tbody></table></div><div class="ffl-row" style="margin-top:8px"><button type="button" class="ffl-sm" data-act="wscard" data-id="' + x.id + '">Gerätekarte drucken</button></div></div>';
    return h;
  }
  function wsDue() {
    var list = wsDueList().filter(function (x) { return x.state !== 'ok' && !(x.after && x.state === 'ok'); });
    list.sort(function (a, b) { return (a.due || '0') < (b.due || '0') ? -1 : 1; });
    var h = '<p class="ffl-mu" style="margin-top:14px">Überfällige, nie geprüfte und in den nächsten 30 Tagen fällige Prüfungen. Wer diesen Bereich betreut, bekommt täglich eine Benachrichtigung.</p>';
    if (!list.length) return h + '<div class="ffl-msg ok">Alles im grünen Bereich.</div>';
    h += '<div class="ffl-scroll"><table class="ffl-table ffl-stack"><thead><tr><th>Gerät</th><th>Prüfung</th><th>zuletzt</th><th>fällig</th><th></th></tr></thead><tbody>' + list.map(function (x) {
      return '<tr><td class="full"><b>' + esc(typeLabel(x.dev) + ' ' + x.dev.nr) + '</b><div class="ffl-mu">' + esc(x.dev.location) + '</div></td><td class="full">' + esc(x.label) + '</td><td data-l="zuletzt">' + (x.last ? fmtDate(x.last) : '–') + '</td>' +
        '<td data-l="fällig">' + stateChip(x.state, x.after ? 'nach Gebrauch' : x.due ? fmtDate(x.due) : 'nie geprüft') + '</td><td><button type="button" class="ffl-sm" data-act="wsopen" data-id="' + x.dev.id + '" data-kind="' + esc(x.kind) + '">Prüfen</button></td></tr>';
    }).join('') + '</tbody></table></div><button type="button" class="ffl-sm" style="margin-top:8px" data-act="wsdueprint">Liste drucken</button>';
    return h;
  }
  function wsRules() {
    return wsRulesEdit();
    var r = d.as_rules;
    return '<p class="ffl-mu" style="margin-top:14px">Vorgaben nach DGUV Regel 112-190 (Tabellen 13 und 15). <b>Strengere Herstellerangaben gehen vor</b> – dann hier anpassen. ' +
      'Druckluftflaschen: Frist laut Prüfstempel der Flasche (Betriebssicherheitsverordnung), im Gerät eintragen. 0 = nach jedem Gebrauch.</p>' +
      Object.keys(r).map(function (t) {
        return '<div class="ffl-pbox" data-rtype="' + t + '"><div class="ffl-sh" style="font-size:17px">' + esc(r[t].label) + '</div><table class="ffl-table"><tbody>' + Object.keys(r[t].kinds).map(function (k) {
          return '<tr data-rkind="' + k + '"><td>' + esc(r[t].kinds[k][0]) + '</td><td style="width:170px"><input type="number" min="0" max="240" value="' + r[t].kinds[k][1] + '" style="width:90px"> Monate</td></tr>';
        }).join('') + '</tbody></table></div>';
      }).join('') + '<div class="ffl-row" style="margin-top:10px"><button type="button" class="ffl-p" data-act="rulessave">Fristen speichern</button><button type="button" class="ffl-q" data-act="rulesreset">Auf DGUV-Vorgaben zurücksetzen</button></div>';
  }
  // Gerätearten und Prüfungen frei festlegen (Gerätewarte, Teams)
  function wsRulesEdit() {
    var r = ui.rulesDraft && ui.rulesDraft.area === ui.wsArea ? ui.rulesDraft.list : (ui.rulesDraft = { area: ui.wsArea, list: Object.keys(RS()).map(function (k) {
      return { key: k, label: RS()[k].label, kinds: Object.keys(RS()[k].kinds).map(function (kk) { return { key: kk, label: RS()[k].kinds[kk][0], months: RS()[k].kinds[kk][1] }; }) };
    }) }).list;
    return '<p class="ffl-mu" style="margin-top:14px">' + (ui.wsArea === 'vehicles' ? 'Vorgaben angelehnt an den DGUV Grundsatz 305-002 (Prüfgrundsätze für Ausrüstung und Geräte der Feuerwehr). <b>Herstellerangaben gehen vor.</b> ' :
      ui.wsArea === 'agt' ? 'Vorgaben nach DGUV Regel 112-190 (Tabellen 13 und 15). <b>Strengere Herstellerangaben gehen vor.</b> Druckluftflaschen: Prüffrist laut Stempel im Gerät eintragen. Masken auf dem Fahrzeug: Prüfung alle 6 Monate (statt 24). ' : '') +
      'Monate = Abstand zwischen zwei Prüfungen, 0 = nach jedem Gebrauch.</p>' + r.map(function (t, i) {
        return '<div class="ffl-pbox" data-rt="' + i + '"><div class="ffl-row"><input type="text" data-rtl="1" value="' + esc(t.label) + '" placeholder="Geräteart, z. B. ' + (ui.wsArea === 'agt' ? 'Fluchthaube' : 'Tablet') + '" style="flex:1;font-weight:700">' +
          '<button type="button" class="ffl-q ffl-sm" data-act="rtdel" data-i="' + i + '">Geräteart entfernen</button></div><table class="ffl-table"><tbody>' + t.kinds.map(function (k, j) {
            return '<tr data-rk="' + j + '"><td><input type="text" data-rkl="1" value="' + esc(k.label) + '" placeholder="Prüfung, z. B. ' + (ui.wsArea === 'agt' ? 'Sichtprüfung' : 'Updates & Sichtprüfung') + '"></td><td style="width:170px"><input type="number" data-rkm="1" min="0" max="240" value="' + (+k.months || 0) + '" style="width:80px"> Monate</td>' +
              '<td style="width:40px"><button type="button" class="ffl-q ffl-sm" data-act="rkdel" data-i="' + i + '" data-j="' + j + '" aria-label="Prüfung entfernen">✕</button></td></tr>';
          }).join('') + '</tbody></table><button type="button" class="ffl-q ffl-sm" data-act="rkadd" data-i="' + i + '">+ Prüfung</button></div>';
      }).join('') + '<div class="ffl-row" style="margin-top:10px"><button type="button" class="ffl-sm" data-act="rtadd">+ Geräteart</button><span style="flex:1"></span>' +
      '<button type="button" class="ffl-q" data-act="rtreset">Vorgaben wiederherstellen</button><button type="button" class="ffl-p" data-act="rtsave">Speichern</button></div>';
  }
  function readRulesDraft() {
    var r = ui.rulesDraft.list;
    [].forEach.call(document.querySelectorAll('[data-rt]'), function (b) {
      var t = r[+b.getAttribute('data-rt')]; t.label = b.querySelector('[data-rtl]').value;
      [].forEach.call(b.querySelectorAll('[data-rk]'), function (tr) { var k = t.kinds[+tr.getAttribute('data-rk')]; k.label = tr.querySelector('[data-rkl]').value; k.months = +tr.querySelector('[data-rkm]').value || 0; });
    });
    return r;
  }
  function wsCard(x) {
    var rules = rulesOf(x)[x.type], cs = wsChecks(x.id).filter(function (c) { return !c.storno_of; }), st = {};
    wsChecks(x.id).forEach(function (c) { if (c.storno_of) st[c.storno_of] = c; });
    return MYFPrint.head('Gerätekarte ' + rules.label + ' ' + x.nr) +
      '<table class="pr-form"><tr><th>Hersteller / Modell</th><td>' + esc([x.maker, x.model].join(' ')) + '</td></tr><tr><th>Seriennummer</th><td>' + esc(x.serial) + '</td></tr>' +
      '<tr><th>Baujahr</th><td>' + esc(x.built) + '</td></tr><tr><th>Standort</th><td>' + esc(x.location) + '</td></tr><tr><th>Status</th><td>' + esc(d.device_status[x.status]) + '</td></tr></table>' +
      '<h2>Prüfnachweis</h2><table><thead><tr><th>Datum</th><th>Prüfung</th><th>Ergebnis</th><th>Prüfgerät</th><th>Messwerte / Bemerkung</th><th>Prüfer</th></tr></thead><tbody>' +
      cs.map(function (c) {
        return '<tr><td>' + fmtDate(c.date) + '</td><td>' + esc(rules.kinds[c.kind] ? rules.kinds[c.kind][0] : c.kind) + '</td><td>' + (c.result === 'ok' ? 'i. O.' : 'n. i. O.') + '</td><td>' + esc(c.tester) + '</td>' +
          '<td>' + esc([c.values, c.note].filter(Boolean).join(' · ')) + (st[c.id] ? ' <b>STORNIERT: ' + esc(st[c.id].storno_reason) + '</b>' : '') + '</td><td>' + esc(c.by) + '</td></tr>';
      }).join('') + '</tbody></table>';
  }
  function workshopClick(act, t, id) {
    switch (act) {
      case 'asub': ui.asub = t.getAttribute('data-v'); ui.dev = null; render(); return true;
      case 'wsub': ui.wsub = t.getAttribute('data-v'); ui.dev = null; render(); return true;
      case 'rtadd': readRulesDraft().push({ label: '', kinds: [{ label: 'Prüfung / Wartung', months: 12 }] }); render(); return true;
      case 'rtdel': readRulesDraft().splice(+t.getAttribute('data-i'), 1); render(); return true;
      case 'rkadd': readRulesDraft()[+t.getAttribute('data-i')].kinds.push({ label: '', months: 12 }); render(); return true;
      case 'rkdel': readRulesDraft()[+t.getAttribute('data-i')].kinds.splice(+t.getAttribute('data-j'), 1); render(); return true;
      case 'rtsave': post('wsrules', { area: ui.wsArea, rules: readRulesDraft() }, 'Gerätearten gespeichert.').then(function () { ui.rulesDraft = null; render(); }); return true;
      case 'rtreset': if (confirm('Gerätearten und Fristen auf die Vorgaben zurücksetzen?')) post('wsrules', { area: ui.wsArea, reset: true }, 'Zurückgesetzt.').then(function () { ui.rulesDraft = null; render(); }); return true;
      case 'wsnew': ui.wsNew = true; render(); return true;
      case 'wsnewcancel': ui.wsNew = false; render(); return true;
      case 'wsopen':
        if (ui.wsArea === 'agt') ui.asub = 'devices'; else ui.wsub = 'devices';
        ui.dev = id; ui.ckKind = t.getAttribute('data-kind') || null; render(); ui.ckKind = null;
        // Aus „Fälligkeiten → Prüfen“: direkt zum Prüfformular mit vorgewählter Prüfart
        var ckf = t.getAttribute('data-kind') && root.querySelector('[data-ckform]');
        if (ckf) { ckf.scrollIntoView({ block: 'center' }); var tf = ckf.querySelector('[data-cf2="tester"]'); if (tf) tf.focus({ preventScroll: true }); } else root.scrollIntoView();
        return true;
      case 'wsback': ui.dev = null; render(); return true;
      case 'wssave':
        var fb = t.closest('[data-wsform]'), body = { id: id, area: ui.wsArea };
        [].forEach.call(fb.querySelectorAll('[data-wf]'), function (el) { body[el.getAttribute('data-wf')] = el.value; });
        post('device', body, 'Gespeichert.').then(function (r) { ui.wsNew = false; if (!id) ui.dev = r.id; render(); }); return true;
      case 'cksave':
        var cb = { device_id: id };
        [].forEach.call(document.querySelectorAll('[data-cf2]'), function (el) { cb[el.getAttribute('data-cf2')] = el.value; });
        if (cb.result === 'nok' && !confirm('Nicht in Ordnung – das Gerät wird gesperrt. Speichern?')) return true;
        var dv = by(d.devices, 'id')[id];
        post('check', cb, cb.result === 'nok' ? 'Prüfung gespeichert – Gerät ist jetzt gesperrt.' : dv && dv.status !== 'ready' && dv.status !== 'retired' ? 'Prüfung gespeichert – Gerät ist wieder einsatzbereit.' : 'Prüfung gespeichert.'); return true;
      case 'ckstorno':
        MYFUI.ask({ title: 'Prüfung stornieren', text: 'Die Prüfung bleibt sichtbar. Grund:', required: true, ok: 'Stornieren' }).then(function (reason) {
        if (reason) post('check', { device_id: ui.dev, storno: id, reason: reason }, by(d.devices, 'id')[ui.dev] && by(d.devices, 'id')[ui.dev].status === 'blocked' ? 'Storniert. Das Gerät bleibt gesperrt, bis eine Prüfung „in Ordnung“ eingetragen oder der Status geändert wird.' : 'Storniert.');
        });
        return true;
      case 'wscard': MYFPrint.printNow(wsCard(by(d.devices, 'id')[id]), true); return true;
      case 'wsqr':
        printQrSheet((d.devices || []).filter(function (x) { return (x.area || 'agt') === ui.wsArea && x.status !== 'retired' && (!ui.wsType || x.type === ui.wsType); }).map(function (x) {
          return { url: portalUrl('geraet=' + x.id), title: typeLabel(x) + ' ' + x.nr, sub: 'Scannen: nach Gebrauch melden / Prüfung eintragen' };
        })); return true;
      case 'wsdueprint':
        var tb = root.querySelector('.ffl-table'); MYFPrint.printNow(MYFPrint.head(wsAreaLabel() + ' – fällige Prüfungen') + (tb ? tb.outerHTML : '')); return true;
      case 'rulessave':
        var rules = JSON.parse(JSON.stringify(d.as_rules));
        [].forEach.call(document.querySelectorAll('[data-rtype]'), function (b) {
          var tt = b.getAttribute('data-rtype');
          [].forEach.call(b.querySelectorAll('[data-rkind]'), function (tr) { rules[tt].kinds[tr.getAttribute('data-rkind')][1] = Math.max(0, +tr.querySelector('input').value || 0); });
        });
        post('settings', { as_rules: rules }, 'Fristen gespeichert.'); return true;
      case 'rulesreset': if (confirm('Auf die DGUV-Vorgaben zurücksetzen?')) post('settings', { as_rules: null }, 'Zurückgesetzt.'); return true;
    }
    return false;
  }

  function tabAgtPeople() {
    var list = d.members.filter(function (m) { return m.active && (!ui.agtOnly || m.agt); });
    var agts = d.members.filter(function (m) { return m.active && m.agt; });
    var over = agts.filter(function (m) { var i = agtInfo(m); return i.state !== 'ok' && i.state !== 'soon'; }).length;
    var nSel = Object.keys(ui.agtSel).filter(function (k) { return ui.agtSel[k]; }).length;
    var h = '<div class="ffl-row" style="margin-top:12px"><p class="ffl-mu" style="margin:0;flex:1 1 220px">' + agts.length + ' Atemschutzgeräteträger · ' +
      (over ? '<b style="color:var(--red-tx)">' + over + ' Übungsstrecke fällig oder nie eingetragen</b>' : 'alle Übungsstrecken aktuell') + '</p>' +
      '<button type="button" class="ffl-sm" data-act="areaprint" data-v="agt">Übersicht drucken</button></div>';

    h += '<div class="ffl-msg" style="background:var(--paper);border:1px solid var(--ink);border-left-width:3px"><b style="font-size:17px">Termin eintragen</b>' +
      '<div class="ffl-row" style="margin-top:8px"><input type="date" id="ffl-agtdate" value="' + isoToday() + '" style="width:auto">' +
      sel(Object.keys(d.agt_kinds).map(function (k) { return [k, d.agt_kinds[k]]; }), 'strecke', 'id="ffl-agtkind" style="width:auto"') +
      '<input type="text" class="ffl-grow" id="ffl-agtnote" list="ffl-agtnote-l" placeholder="Notiz, z. B. Übungsstrecke des Kreises">' + sug('ffl-agtnote-l', (d.agt_log || []).map(function (x) { return x.note; })) + '</div>' +
      '<div class="ffl-row" style="margin-top:8px"><span class="ffl-mu">Teilnehmer unten ankreuzen:</span>' +
      '<button type="button" class="ffl-sm" data-act="agtdue">Alle fälligen</button><button type="button" class="ffl-sm" data-act="agtallsel">Alle AGT</button>' +
      '<button type="button" class="ffl-sm ffl-q" data-act="agtclear">Keine</button>' +
      '<button type="button" class="ffl-p" style="margin-left:auto" data-act="agtsave"' + (nSel ? '' : ' disabled') + '>Für ' + nSel + ' eintragen</button></div>' +
      '<p class="ffl-mu" style="margin:6px 0 0">Ein Datum in der Zukunft wird als „geplant“ angezeigt.</p></div>';

    // Einsatzbereit nur mit Lehrgang + G26 + Übungsstrecke: fehlender Lehrgangs-Nachweis (z. B. vor Wehrwerk) mit einem Klick
    var noCourse = d.members.filter(function (m) { return m.active && m.agt && !m.agt_course; });
    if (noCourse.length) h += '<div class="ffl-msg warn" style="margin-top:12px"><b>Einsatzbereit gilt nur mit Lehrgang, gültiger G26 und Übungsstrecke (12 Monate).</b> ' +
      'Bei ' + noCourse.length + (noCourse.length === 1 ? ' Geräteträger' : ' Geräteträgern') + ' fehlt in ' + APP + ' der Nachweis des Lehrgangs: ' + esc(noCourse.slice(0, 8).map(function (m) { return m.name; }).join(', ')) + (noCourse.length > 8 ? ' …' : '') + '.' +
      '<div class="ffl-row" style="margin-top:8px"><button type="button" class="ffl-sm ffl-p" data-act="agtcourseall">Lehrgang für diese ' + noCourse.length + ' als vorhanden eintragen</button>' +
      '<span class="ffl-mu">nur wenn sie ihn wirklich haben (z. B. vor ' + APP + ' gemacht) – einzeln geht es im Profil unter Ausbildung.</span></div></div>';
    h += '<label class="ffl-row ffl-mu" style="margin-top:12px"><input type="checkbox" id="ffl-agtonly"' + (ui.agtOnly ? ' checked' : '') + '> nur Atemschutzgeräteträger zeigen</label>';
    var L = MYFUI.lt(ui, 'agtp', list, { noun: 'Personen', ph: 'Name suchen …', per: 30, text: function (m) { return m.name + ' ' + unitShort(m.unit); },
      csv: { name: 'Atemschutzgeraetetraeger', cols: [['Name', function (m) { return m.name; }], ['Einheit', function (m) { return unitShort(m.unit); }], ['AGT', function (m) { return m.agt ? 'ja' : ''; }],
        ['Status', function (m) { var x = agtState(m); return x ? (x.ready ? 'einsatzbereit' : 'nicht einsatzbereit') : ''; }], ['G26 gültig bis', function (m) { return m.g26_until ? fmtDate(m.g26_until) : ''; }],
        ['Übungsstrecke zuletzt', function (m) { var i = agtInfo(m); return i.strecke ? fmtDate(i.strecke) : ''; }], ['Strecke fällig', function (m) { var i = agtInfo(m); return i.due ? fmtDate(i.due) : ''; }]] },
      sorts: [['due', 'fällig zuerst', function (m) { var i = agtInfo(m); return (m.agt ? 0 : 1) + '|' + [(i.due || '9999'), (i.g26 || '9999')].sort()[0]; }, 1], ['name', 'Name A–Z', function (m) { return m.name; }, 1],
        ['g26', 'G26 läuft zuerst ab', function (m) { return m.g26_until || '9999'; }, 1], ['unit', 'Einheit', function (m) { return unitShort(m.unit) + '|' + m.name; }, 1]] });
    h += L.bar + '<div class="ffl-scroll"><table class="ffl-table"><thead><tr><th style="width:30px"></th><th>Name</th><th>Einheit</th><th>AGT</th><th>Status</th><th style="width:160px">G26 gültig bis</th><th>Übungsstrecke zuletzt</th><th>fällig</th><th>Unterweisung</th><th></th></tr></thead><tbody>';
    L.rows.forEach(function (m) {
      var i = agtInfo(m);
      h += '<tr><td>' + (m.agt ? '<input type="checkbox" data-agtsel="' + m.id + '"' + (ui.agtSel[m.id] ? ' checked' : '') + '>' : '') + '</td>' +
        '<td><a href="#" data-act="profile" data-id="' + m.id + '"><b>' + esc(m.name) + '</b></a></td><td>' + esc(unitShort(m.unit)) + '</td>' +
        '<td><input type="checkbox" data-agt="' + m.id + '"' + (m.agt ? ' checked' : '') + '></td><td>' + (m.agt ? agtChip(m).replace(/AGT (nicht )?einsatzbereit/, function (x, n) { return n ? 'nicht bereit' : 'bereit'; }) : '') + '</td>' +
        '<td>' + (m.agt ? '<input type="date" data-g26="' + m.id + '" value="' + esc(m.g26_until || '') + '"' + (i.gstate === 'over' ? ' style="border-color:var(--red-tx);color:var(--red-tx)"' : i.gstate === 'soon' ? ' style="border-color:var(--warn)"' : '') + '>' : '') + '</td>' +
        '<td>' + (m.agt ? (i.strecke ? fmtDate(i.strecke.date) : '<span class="ffl-mu">nie</span>') + (i.planned ? ' <span class="ffl-tag">geplant ' + fmtDate(i.planned.date) + '</span>' : '') : '') + '</td>' +
        '<td>' + (m.agt ? (i.due ? dueTag(i.state, fmtDate(i.due)) : '<span class="ffl-tag err">fällig</span>') : '') + '</td>' +
        '<td>' + (i.unterweisung ? fmtDate(i.unterweisung.date) : '') + '</td>' +
        '<td>' + (i.log.length ? '<button type="button" class="ffl-q ffl-sm" data-act="agthist" data-id="' + m.id + '">Verlauf (' + i.log.length + ')</button>' : '') + '</td></tr>';
      if (ui.agtLogFor === m.id) {
        h += '<tr><td></td><td colspan="9"><table class="ffl-table" style="margin:0">' + i.log.map(function (l) {
          return '<tr><td style="width:110px">' + fmtDate(l.date) + '</td><td style="width:170px">' + esc(d.agt_kinds[l.kind] || l.kind) + '</td><td>' + esc(l.note) + (l.by ? ' <span class="ffl-mu">· ' + esc(l.by) + '</span>' : '') + (l.file ? ' <a href="' + esc(l.file) + '" target="_blank" rel="noopener">📎 Nachweis</a>' : '') + '</td>' +
            '<td style="width:40px"><button type="button" class="ffl-q ffl-sm" data-act="delagtlog" data-id="' + l.id + '">✕</button></td></tr>';
        }).join('') + '</table></td></tr>';
      }
    });
    return h + '</tbody></table></div>' + L.pager;
  }

  // ---- Kleidung --------------------------------------------------------------
  function tabClothing() {
    var subs = [['req', 'Kleidungswünsche'], ['stock', 'Wer hat was']].concat(d.lockers ? [['lockers', 'Spinde']] : []).concat([['cat', 'Einstellungen']]);
    var h = '<div class="ffl-subtabs" style="margin-top:12px">' + subs.map(function (x) {
      return '<button type="button" data-csub="' + x[0] + '" aria-selected="' + ((ui.csub || 'req') === x[0]) + '">' + x[1] + '</button>';
    }).join('') + '</div>';
    if ((ui.csub || 'req') === 'req') h += '<div class="ffl-row" style="margin-top:10px;justify-content:flex-end"><button type="button" class="ffl-sm" data-act="areaprint" data-v="clothing">Bestellliste drucken</button></div>';
    return h + (ui.csub === 'lockers' ? tabLockers() : ui.csub === 'stock' ? clothStock() : ui.csub === 'cat' ? clothCatalog() : clothRequests());
  }

  // ---- Spinde und Spindschlüssel: wer hat welchen Spind, Schlüssel ausgegeben?, Verlauf jeder Übergabe ----------
  var LKCLS = { none: 'st-warn', issued: 'st-ok', box: 'st-open', nolock: 'st-no', lost: 'st-bad' };
  function lockerChip(l) { return l.member_id || l.key !== 'none' ? '<span class="ffl-chip ' + (LKCLS[l.key] || 'st-open') + '">' + esc(d.locker_keys[l.key] || l.key) + (l.keys > 1 ? ' (' + l.keys + ')' : '') + '</span>' : ''; }
  function tabLockers() {
    var all = d.lockers || [], f = ui.lkF || 'all';
    var cnt = { free: all.filter(function (l) { return !l.member_id; }).length, nokey: all.filter(function (l) { return l.member_id && l.key === 'none'; }).length, lost: all.filter(function (l) { return l.key === 'lost'; }).length };
    var list = all.filter(function (l) { return f === 'all' || (f === 'free' ? !l.member_id : f === 'nokey' ? l.member_id && l.key === 'none' : l.key === 'lost'); });
    var h = '<p class="ffl-mu ffl-intro">Welcher Spind wem gehört und ob ein Schlüssel ausgegeben ist – jede Zuweisung, Übergabe und Schlüsselausgabe steht im Verlauf. Mitglieder sehen ihren Spind im Profil.</p>' +
      '<div class="ffl-pills" style="margin-top:10px">' + [['all', 'alle (' + all.length + ')'], ['free', 'frei (' + cnt.free + ')'], ['nokey', 'vergeben, kein Schlüssel (' + cnt.nokey + ')'], ['lost', 'Schlüssel verloren (' + cnt.lost + ')']].map(function (x) {
        return '<button type="button" data-act="lkf" data-v="' + x[0] + '" aria-pressed="' + (f === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div>';
    var L = MYFUI.lt(ui, 'lockers', list, { noun: 'Spinde', ph: 'Nummer, Name, Ort …', per: 30, text: function (l) { return [l.nr, l.name, l.location, l.note].join(' '); },
      sorts: [['nr', 'Nummer', function (l) { return l.location + '|' + ('000000' + l.nr).slice(-6); }, 1], ['name', 'Name', function (l) { return l.name || '~'; }, 1]],
      csv: { name: 'Spinde', cols: [['Ort', function (l) { return l.location; }], ['Nr', function (l) { return l.nr; }], ['Mitglied', function (l) { return l.name; }], ['Schlüssel', function (l) { return d.locker_keys[l.key]; }], ['Anzahl', function (l) { return l.keys; }], ['seit', function (l) { return fmtDate(l.since); }], ['Notiz', function (l) { return l.note; }]] } });
    h += L.bar + (all.length ? '<div class="ffl-lklist">' + L.rows.map(function (l) {
      var open = ui.lkEdit === l.id;
      return '<div class="ffl-lkrow' + (open ? ' is-open' : '') + '"><button type="button" class="ffl-lkhead" data-act="lkopen" data-id="' + l.id + '"><b class="ffl-lknr">' + esc(l.nr) + '</b><span><b>' + (l.name ? esc(l.name) : '<span class="ffl-mu">frei</span>') + '</b><small>' + esc([l.location, l.since ? 'seit ' + fmtDate(l.since) : '', l.note].filter(Boolean).join(' · ')) + '</small></span>' + lockerChip(l) + '</button>' +
        (open ? '<div class="ffl-lkedit"><div class="ffl-form2"><div><label class="ffl-fl">' + (l.member_id ? 'Übertragen an' : 'Zuweisen an') + '</label>' + memberPicker('ffl-lkm') + '</div>' +
          '<div><label class="ffl-fl">Schlüssel</label>' + sel(Object.keys(d.locker_keys).map(function (k) { return [k, d.locker_keys[k]]; }), l.key, 'id="ffl-lkkey"') + '</div>' +
          '<div><label class="ffl-fl">Anzahl Schlüssel</label><input type="number" id="ffl-lkn" min="1" max="5" value="' + Math.max(1, l.keys) + '"></div>' +
          '<div><label class="ffl-fl">Notiz (optional)</label><input type="text" id="ffl-lknote" placeholder="z. B. Schloss getauscht"></div></div>' +
          '<div class="ffl-row" style="margin-top:10px"><button type="button" class="ffl-p" data-act="lksave" data-id="' + l.id + '">Speichern</button>' + (l.member_id ? '<button type="button" data-act="lkfree" data-id="' + l.id + '">Freigeben</button>' : '<button type="button" class="ffl-q" data-act="lkdel" data-id="' + l.id + '">Spind löschen</button>') + '</div>' +
          (l.log.length ? '<div class="ffl-fl" style="margin-top:12px">Verlauf</div><ul class="ffl-lklog">' + l.log.map(function (g) { return '<li><b>' + fmtDate(g.date) + '</b> ' + esc(g.what) + (g.name ? ' – ' + esc(g.name) : '') + (g.note ? ' <span class="ffl-mu">(' + esc(g.note) + ')</span>' : '') + ' <span class="ffl-mu">· ' + esc(g.by) + '</span></li>'; }).join('') + '</ul>' : '') + '</div>' : '') + '</div>';
    }).join('') + '</div>' + L.pager : '<p class="ffl-mu">Noch keine Spinde angelegt.</p>');
    h += '<details class="ffl-pbox" style="margin-top:14px"' + (all.length ? '' : ' open') + '><summary><b>Spinde anlegen</b></summary><div class="ffl-form2" style="margin-top:8px"><div><label class="ffl-fl">Ort</label><input type="text" id="ffl-lkloc" placeholder="z. B. Umkleide Gerätehaus"></div>' +
      '<div><label class="ffl-fl">Nummern</label><input type="text" id="ffl-lkbulk" placeholder="z. B. 1-40 oder 1-20, A1-A6"></div></div><button type="button" class="ffl-p" style="margin-top:10px" data-act="lkbulk">Anlegen</button></details>';
    return h;
  }

  function catalogOptions(onlyProcurable, value) {
    var h = '';
    Object.keys(d.cloth_cats).forEach(function (cat) {
      var items = d.cloth_items.filter(function (i) { return i.cat === cat && i.active && (!onlyProcurable || i.procurable); });
      if (!items.length) return;
      h += '<optgroup label="' + esc(d.cloth_cats[cat]) + '">' + items.map(function (i) {
        return '<option value="' + i.id + '"' + (String(i.id) === String(value) ? ' selected' : '') + '>' + esc(i.name) + (i.procurable ? '' : ' (nicht mehr beschaffbar)') + '</option>';
      }).join('') + '</optgroup>';
    });
    return h;
  }

  // Wer hat was: alle ausgegebenen Teile, filterbar nach Teil
  function clothStock() {
    var mem = by(d.members, 'id'), items = by(d.cloth_items, 'id'), year = new Date().getFullYear();
    var list = d.stock.filter(function (x) { return (ui.stockAll || x.status === 'in_use') && (!ui.stockItem || String(x.item_id) === String(ui.stockItem)); });
    list.sort(function (a, b) { return a.item_name.localeCompare(b.item_name) || String(a.size).localeCompare(String(b.size)) || memberName(mem[a.member_id]).localeCompare(memberName(mem[b.member_id])); });
    var h = '<div class="ffl-row" style="margin-top:14px"><select id="ffl-stockitem" style="width:auto;min-width:260px"><option value="">Alle Teile</option>' + catalogOptions(false, ui.stockItem) + '</select>' +
      '<label class="ffl-row ffl-mu"><input type="checkbox" id="ffl-stockall"' + (ui.stockAll ? ' checked' : '') + '> auch zurückgegebene/ausgesonderte</label>' +
      '<button type="button" class="ffl-sm" style="margin-left:auto" data-act="printstock">Drucken</button></div>';
    // Zusammenfassung nach Größe
    var sum = {};
    list.filter(function (x) { return x.status === 'in_use'; }).forEach(function (x) { var k = x.item_name + ' · ' + (x.size || 'ohne Größe'); sum[k] = (sum[k] || 0) + x.qty; });
    if (ui.stockItem) h += '<div class="ffl-chips" style="margin-top:10px">' + Object.keys(sum).sort().map(function (k) { return '<span class="ffl-chip st-open">' + esc(k) + ': ' + sum[k] + '</span>'; }).join('') + '</div>';
    if (!list.length) return h + '<p class="ffl-mu" style="margin-top:14px">Noch nichts eingetragen. Ausstattung trägst du im Profil des Mitglieds ein (Mitglieder → Profil → Ausstattung).</p>';
    var L = MYFUI.lt(ui, 'stock', list, { noun: 'Teile', ph: 'Teil, Größe, Mitglied, Nummer …', per: 30,
      csv: { name: 'Kleiderkammer_Bestand', cols: [['Teil', function (x) { return x.item_name; }], ['Größe', function (x) { return x.size; }], ['Anzahl', function (x) { return x.qty; }], ['Mitglied', function (x) { return memberName(mem[x.member_id]); }],
        ['ausgegeben', function (x) { return fmtDate(x.issued); }], ['Nr.', function (x) { return x.serial; }], ['Status', function (x) { return (d.stock_status || {})[x.status] || x.status; }]] }, text: function (x) { return [x.item_name, x.size, memberName(mem[x.member_id]), x.serial].join(' '); },
      sorts: [['item', 'nach Teil', function (x) { return x.item_name + '|' + x.size; }, 1], ['member', 'nach Mitglied', function (x) { return memberName(mem[x.member_id]) + '|' + x.item_name; }, 1], ['issued', 'zuletzt ausgegeben', function (x) { return x.issued || ''; }, -1]] });
    h += L.bar + '<table class="ffl-table" id="ffl-stocktable" style="margin-top:12px"><thead><tr><th>Teil</th><th>Größe</th><th>Anz.</th><th>Mitglied</th><th>Einheit</th><th>ausgegeben</th><th>Nr.</th><th>Baujahr</th><th>Status</th></tr></thead><tbody>' +
      L.rows.map(function (x) {
        var m = mem[x.member_id], it = items[x.item_id], old = x.made_year && it && (it.cat === 'psa_brand' || it.cat === 'psa_th') && year - x.made_year >= 10;
        return '<tr' + (x.status === 'in_use' ? '' : ' class="is-off"') + '><td><b>' + esc(x.item_name) + '</b>' + (it && !it.procurable ? ' <span class="ffl-chip st-no">nicht mehr beschaffbar</span>' : '') + '</td>' +
          '<td>' + esc(x.size) + '</td><td>' + x.qty + '</td><td><a href="#" data-act="profile" data-id="' + x.member_id + '">' + esc(memberName(m)) + '</a></td><td>' + (m ? esc(unitShort(m.unit)) : '') + '</td>' +
          '<td>' + fmtDate(x.issued) + '</td><td>' + esc(x.serial) + '</td><td' + (old ? ' style="color:var(--red-tx);font-weight:600" title="10 Jahre oder älter – Aussonderung prüfen"' : '') + '>' + (x.made_year || '') + '</td>' +
          '<td>' + esc(d.stock_status[x.status]) + (x.status_date ? ' ' + fmtDate(x.status_date) : '') + '</td></tr>';
      }).join('') + '</tbody></table>' + L.pager + '<p class="ffl-mu">Rot: PSA mit Baujahr 10 Jahre oder älter – Aussonderung prüfen (Herstellerangaben beachten).</p>';
    return h;
  }

  function clothCatalog() {
    var h = '<p class="ffl-mu" style="margin-top:14px">Diese Liste steuert, was Mitglieder bestellen können und was in der Ausstattung eingetragen wird. ' +
      '„Beschaffbar“ abwählen, wenn es ein Teil nicht mehr gibt (z. B. alter Parka) – es bleibt in den Ausstattungen sichtbar, kann aber nicht mehr bestellt werden.</p>' +
      '<table class="ffl-table"><thead><tr><th>Bezeichnung</th><th>Bereich</th><th>Größe nach</th><th>beschaffbar</th><th>mit Nr.</th><th>sichtbar</th><th style="width:90px" title="Kleinere Zahl steht weiter oben">Reihenfolge</th><th></th></tr></thead><tbody>';
    d.cloth_items.forEach(function (i) {
      h += '<tr data-row="clothitem" data-id="' + i.id + '"' + (i.active ? '' : ' class="is-off"') + '><td><input type="text" data-f="name" value="' + esc(i.name) + '"></td>' +
        '<td>' + sel(Object.keys(d.cloth_cats).map(function (k) { return [k, d.cloth_cats[k]]; }), i.cat, 'data-f="cat"') + '</td>' +
        '<td>' + sel([['', '–']].concat(Object.keys(d.size_keys).map(function (k) { return [k, d.size_keys[k]]; })), i.size_key, 'data-f="size_key"') + '</td>' +
        '<td><input type="checkbox" data-f="procurable"' + (i.procurable ? ' checked' : '') + '></td><td><input type="checkbox" data-f="has_serial"' + (i.has_serial ? ' checked' : '') + '></td>' +
        '<td><input type="checkbox" data-f="active"' + (i.active ? ' checked' : '') + '></td><td><input type="number" data-f="sort" value="' + i.sort + '"></td>' +
        '<td><button type="button" class="ffl-q ffl-sm" data-act="delclothitem" data-id="' + i.id + '">✕</button></td></tr>';
    });
    return h + '</tbody></table><div class="ffl-row" style="margin-top:8px"><input type="text" id="ffl-newitem" class="ffl-grow" placeholder="Neues Teil, z. B. Atemschutzmaske">' +
      sel(Object.keys(d.cloth_cats).map(function (k) { return [k, d.cloth_cats[k]]; }), 'sonst', 'id="ffl-newitemcat" style="width:auto"') +
      '<button type="button" class="ffl-p" data-act="addclothitem">Hinzufügen</button></div>' +
      '<div style="margin-top:22px">' + listEditors(
      listEditor('cloth_cats', 'Bereiche', 'Gruppen im Katalog und in der Bestell-Auswahl.', 'Neuer Bereich, z. B. Jugendfeuerwehr') +
      listEditor('size_keys', 'Größenfelder', 'Felder im Profil („Größen“); ein Teil im Katalog schlägt beim Ausgeben die passende Größe vor.', 'Neues Größenfeld, z. B. Helm')) + '</div>';
  }

  function clothRequests() {
    var s = d.settings, mem = by(d.members, 'id');
    var list = d.clothing.filter(function (c) {
      return (ui.cFilter === 'all' || (ui.cFilter === 'active' ? c.status === 'open' || c.status === 'ordered' : c.status === ui.cFilter)) &&
        (!ui.cKind || c.kind === ui.cKind);
    });
    var h = '<div class="ffl-bar" style="margin-top:6px"><label><input type="checkbox" data-set="clothing_open"' + (s.clothing_open ? ' checked' : '') + '> Kleidermeldungen für Mitglieder offen</label>' +
      '<span style="flex:1"></span><span class="ffl-mu">Anzeigen</span>' +
      sel([['', 'Ersatz + Neu'], ['ersatz', 'nur Ersatzbeschaffung'], ['neu', 'nur Neubeschaffung']], ui.cKind || '', 'id="ffl-ckindf" style="width:auto"') +
      sel([['active', 'offen + bestellt'], ['open', 'nur offen'], ['ordered', 'bestellt'], ['issued', 'ausgegeben'], ['all', 'alle']], ui.cFilter, 'id="ffl-cfilter"') + '</div>';

    h += '<div class="ffl-fl" style="margin-top:18px">Für ein Mitglied eintragen</div><div class="ffl-row">' +
      memberPicker('ffl-cmember') +
      sel([['ersatz', 'Ersatz'], ['neu', 'Neu']], 'ersatz', 'id="ffl-ckind" style="width:auto"') +
      '<select id="ffl-citem" style="width:auto">' + catalogOptions(true).replace(/value="(\d+)"/g, function (m0, id) { return 'value="' + esc(by(d.cloth_items, 'id')[id].name) + '"'; }) + '<option value="Sonstiges">Sonstiges</option></select>' +
      '<input type="text" id="ffl-csize" placeholder="Größe" style="width:100px"><input type="number" id="ffl-cqty" value="1" min="1" style="width:80px">' +
      sel(REASONS.ersatz.concat(REASONS.neu).filter(function (x, i, a) { return a.indexOf(x) === i; }).map(function (x) { return [x, x]; }), 'Defekt', 'id="ffl-creason" style="width:auto"') + '</div>' +
      '<div class="ffl-row" style="margin-top:6px"><input type="text" class="ffl-grow" id="ffl-ccomment" placeholder="Kommentar (optional)">' +
      '<button type="button" class="ffl-p" data-act="addclothing">Eintragen</button></div>';

    if (!list.length) return h + '<p class="ffl-mu" style="margin-top:16px">Keine Meldungen in dieser Ansicht.</p>';
    h += '<div class="ffl-scroll"><table class="ffl-table ffl-wide" style="margin-top:16px"><thead><tr><th>Datum</th><th>Name</th><th>Einheit</th><th>Art</th><th>Kleidungsstück</th><th>Größe</th><th>Anz.</th><th>Grund</th><th>Kommentar</th><th style="width:150px">Status</th><th>Hinweis fürs Mitglied</th><th></th></tr></thead><tbody>';
    list.forEach(function (c) {
      var m = mem[c.member_id];
      h += '<tr data-row="clothing" data-id="' + c.id + '"' + (c.status === 'withdrawn' || c.status === 'declined' ? ' class="is-off"' : '') + '>' +
        '<td>' + fmtDate(c.created.slice(0, 10)) + '</td><td>' + (m ? '<a href="#" data-act="profile" data-id="' + m.id + '"><b>' + esc(m.name) + '</b></a>' : '<b>(gelöscht)</b>') + '</td><td>' + (m ? esc(unitShort(m.unit)) : '') + '</td>' +
        '<td>' + (c.kind === 'neu' ? 'Neu' : 'Ersatz') + '</td><td>' + esc(c.item) + '</td><td>' + esc(c.size) + '</td><td>' + c.qty + '</td><td>' + esc(c.reason) + '</td><td style="white-space:pre-line;max-width:260px">' + esc(c.comment) + '</td>' +
        '<td>' + sel(Object.keys(CSTATUS).map(function (k) { return [k, CSTATUS[k]]; }), c.status, 'data-f="status"') + '</td>' +
        '<td><input type="text" data-f="admin_note" value="' + esc(c.admin_note) + '" placeholder="z. B. abholbar ab …"></td>' +
        '<td><button type="button" class="ffl-q ffl-sm" data-act="delclothing" data-id="' + c.id + '">✕</button></td></tr>';
    });
    return h + '</tbody></table></div>';
  }

  function courseForm(c) {
    function f(label, key, attrs) {
      return '<div class="ffl-grow"><label class="ffl-fl">' + label + '</label><input type="text" data-cf="' + key + '" value="' + esc(c[key] == null ? '' : c[key]) + '" ' + (attrs || '') + '></div>';
    }
    return '<div class="ffl-msg" style="background:var(--paper);border:1px solid var(--ink);border-left-width:3px">' +
      '<b style="font-size:17px">' + (c.id ? 'Lehrgang bearbeiten' : 'Neuer Lehrgang') + '</b>' +
      '<div class="ffl-row">' + '<div class="ffl-grow"><label class="ffl-fl">Bereich</label>' + sel(Object.keys(d.cats).map(function (k) { return [k, d.cats[k]]; }), c.cat, 'data-cf="cat"') + '</div>' +
      f('Nr. (Kreis)', 'nr') + f('Kurzbezeichnung', 'short') + '</div>' +
      '<div class="ffl-row">' + f('Bezeichnung', 'title') + '</div>' +
      '<div class="ffl-row">' + f('Tage', 'days') + f('UE', 'ue') + f('Orte', 'locations', 'placeholder="Ort 1, Ort 2"') + f('Kosten pro Person (€)', 'cost', 'inputmode="decimal"') + f('Sortierung', 'sort', 'inputmode="numeric"') + '</div>' +
      '<div class="ffl-row">' + f('Voraussetzungen', 'prereq') + '</div>' +
      '<div class="ffl-row">' + f('Hinweis für Mitglieder', 'note') + '</div>' +
      '<label class="ffl-row" style="margin-top:12px"><input type="checkbox" data-cf="hidden"' + (c.hidden ? ' checked' : '') + '> Für Mitglieder ausblenden</label>' +
      '<div class="ffl-row" style="margin-top:14px"><button type="button" class="ffl-p" data-act="savecourse">Speichern</button><button type="button" data-act="canceledit">Abbrechen</button>' +
      (c.id ? '<button type="button" class="ffl-q" style="margin-left:auto;color:var(--red-tx)" data-act="delcourse" data-id="' + c.id + '">Lehrgang löschen</button>' : '') + '</div></div>';
  }

  // Zeilen aus der Kreis-Tabelle: ID | Bezeichnung | Kurzbez. | Tage | UE | Ort | Voraussetzungen
  function parseTsv(text) {
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
      else if (ch === '"' && cell === '') q = true;
      else if (ch === '\t') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  function guessCat(title) { return /seminar|fortbildung|planspiel|workshop|^S\s/i.test(title) ? 'kreis_sem' : 'kreis_lg'; }
  function parseImport() {
    var out = [];
    parseTsv(ui.importText).forEach(function (r) {
      var start = -1;
      for (var i = 0; i < r.length; i++) { if (/^\s*\d{1,3}\s*$/.test(r[i]) && (r[i + 1] || '').trim()) { start = i; break; } }
      if (start < 0) return;
      var c = r.slice(start).map(function (x) { return (x || '').replace(/\s+/g, ' ').trim(); });
      if (/zusätzliche wünsche/i.test(c[1])) return;
      var orte = (c[5] || '').replace(/\d/g, function (n) { return ORTE[n] || n; }).replace(/\s*\/\s*/g, ', ').replace(/^,\s*|,\s*$/g, '');
      out.push({ nr: ('00' + c[0]).slice(-3), title: c[1], short: c[2] || '', days: c[3] || '', ue: c[4] || '', locations: orte, prereq: c[6] || '',
        cat: ui.importCat === 'auto' ? guessCat(c[1]) : ui.importCat });
    });
    return out;
  }
  function importPanel() {
    var items = parseImport();
    var h = '<div class="ffl-msg" style="background:var(--paper);border:1px solid var(--ink);border-left-width:3px">' +
      '<b style="font-size:17px">Lehrgänge aus Excel übernehmen</b>' +
      '<p class="ffl-mu">In der Bedarfsabfrage-Tabelle des Kreises die Zeilen ab der Spalte „Lehrgangs-ID“ markieren (ID bis Voraussetzungen), kopieren und hier einfügen. Ortsnummern werden, wenn hinterlegt, in Ortsnamen umgewandelt. Bereits vorhandene Lehrgänge (gleiche Nr. und Bezeichnung) werden aktualisiert.</p>' +
      '<textarea id="ffl-importtext" placeholder="001&#9;Truppmann 1 - Teil 1&#9;TM 1/1&#9;6&#9;35&#9;1 / 2 / 3 / 4&#9;allgemeine Voraussetzungen">' + esc(ui.importText) + '</textarea>' +
      '<div class="ffl-row" style="margin-top:8px"><span class="ffl-mu">Bereich</span>' +
      sel([['auto', 'automatisch (Seminar/Fortbildung erkennen)']].concat(Object.keys(d.cats).map(function (k) { return [k, d.cats[k]]; })), ui.importCat, 'id="ffl-importcat" style="width:auto"') + '</div>';
    if (items.length) {
      h += '<table class="ffl-table"><thead><tr><th>Nr.</th><th>Kurz</th><th>Bezeichnung</th><th>Tage</th><th>UE</th><th>Orte</th><th>Bereich</th></tr></thead><tbody>' +
        items.map(function (x) {
          return '<tr><td>' + esc(x.nr) + '</td><td>' + esc(x.short) + '</td><td>' + esc(x.title) + '</td><td>' + esc(x.days) + '</td><td>' + esc(x.ue) + '</td><td>' + esc(x.locations) + '</td><td>' + esc(d.cats[x.cat]) + '</td></tr>';
        }).join('') + '</tbody></table>';
    } else if (ui.importText.trim()) h += '<div class="ffl-msg warn">Keine Lehrgangszeilen erkannt. Die erste Spalte muss die Lehrgangs-ID (z. B. 001) sein.</div>';
    h += '<div class="ffl-row" style="margin-top:12px"><button type="button" class="ffl-p" data-act="doimport"' + (items.length ? '' : ' disabled') + '>' + items.length + ' Lehrgänge für ' + ui.year + ' übernehmen</button>' +
      '<button type="button" data-act="toggleimport">Schließen</button></div></div>';
    return h;
  }

  // ---- Mitglieder ------------------------------------------------------------
  function tabMembers() {
    if (ui.profile && ui.prof) return memberProfile();
    var nPromo = (d.promotions || []).filter(function (p) { return p.ready; }).length;
    var subs = [['list', 'Mitglieder (' + d.members.filter(function (m) { return m.active; }).length + ')'], ['add', 'Hinzufügen & Einladen'], ['ranks', 'Dienstgrade' + (nPromo ? ' (' + nPromo + ')' : '')]].concat(d.full ? [] : [['lists', 'Funktionen & Rechte']]);
    var cur = ui.msub || 'list';
    var h = '<div class="ffl-subtabs" style="margin-top:12px">' + subs.map(function (x) {
      return '<button type="button" data-act="msub" data-v="' + x[0] + '" aria-selected="' + (cur === x[0]) + '">' + x[1] + '</button>';
    }).join('') + '</div>';
    return h + (cur === 'add' ? membersAdd() : cur === 'lists' ? membersLists() : cur === 'ranks' ? membersRanks() : membersList());
  }

  // ---- Dienstgrade & Beförderungen ------------------------------------------------
  // Fehlende Angabe direkt in der Tabelle ergänzen: „seit“ = Datum der letzten Beförderung, ? Lehrgang = Nachweis
  function rkFixBox(p) {
    var f = ui.rkFix;
    if (!f || f.id !== p.member_id) return '';
    if (f.kind === 'since') return '<div class="ffl-rkfix"><label class="ffl-fl">' + esc(p.rank) + ' seit (Datum der letzten Beförderung)</label><div class="ffl-row"><input type="date" id="ffl-rkfix-date" style="width:auto">' +
      '<button type="button" class="ffl-sm ffl-p" data-act="rkfixsave" data-id="' + p.member_id + '">Speichern</button><button type="button" class="ffl-q ffl-sm" data-act="rkfixno">Abbrechen</button></div></div>';
    return '<div class="ffl-rkfix"><label class="ffl-fl">Nachweis „' + esc(f.label) + '“ – wann absolviert?</label><div class="ffl-row"><input type="number" id="ffl-rkfix-year" placeholder="Jahr, z. B. 2019" min="1960" max="' + new Date().getFullYear() + '" style="width:130px">' +
      '<button type="button" class="ffl-sm ffl-p" data-act="rkfixsave" data-id="' + p.member_id + '">Nachweis eintragen</button><button type="button" class="ffl-q ffl-sm" data-act="rkfixno">Abbrechen</button>' +
      '<a href="#" class="ffl-mu" data-act="profile" data-id="' + p.member_id + '">oder im Profil unter Ausbildung</a></div></div>';
  }
  function membersRanks() {
    var pr = d.promotions || [], ready = pr.filter(function (p) { return p.ready; }), soon = pr.filter(function (p) { return !p.ready && p.time_ok === false && p.due && p.due <= addDays(isoToday(), 365); });
    var missing = pr.filter(function (p) { return !p.ready && (p.no_since || (p.time_ok && !p.quals_ok)); });
    var noRank = d.members.filter(function (m) { return m.active && !m.rank; });
    function row(p, btn) {
      return '<tr><td><a href="#" data-act="profile" data-id="' + p.member_id + '"><b>' + esc(p.name) + '</b></a></td><td>' + esc(p.rank) + (p.since ? '<div class="ffl-mu">seit ' + fmtDate(p.since) + '</div>' : '') + '</td>' +
        '<td><b>' + esc(p.short) + '</b> <span class="ffl-mu">' + esc(p.rank_next) + '</span></td>' +
        '<td>' + (p.no_since ? '<button type="button" class="ffl-chip st-warn ffl-fixchip" data-act="rkfix" data-id="' + p.member_id + '" data-v="since" title="Antippen und Datum eintragen">„seit“ fehlt – ergänzen</button>'
          : p.time_ok ? '<span class="ffl-chip st-ok">✓ Zeit</span>' : 'ab ' + fmtDate(p.due)) + ' ' +
        p.quals.map(function (q) { return q.ok ? '<span class="ffl-chip st-ok">✓ ' + esc(q.label) + '</span>'
          : '<button type="button" class="ffl-chip st-warn ffl-fixchip" data-act="rkfix" data-id="' + p.member_id + '" data-v="qual" data-l="' + esc(q.label) + '" title="Antippen und Nachweis eintragen">? ' + esc(q.label) + '</button>'; }).join(' ') +
        rkFixBox(p) + (p.note ? '<div class="ffl-mu">' + esc(p.note) + '</div>' : '') + '</td>' +
        '<td>' + (btn ? '<button type="button" class="ffl-sm ffl-p" data-act="promote" data-id="' + p.member_id + '" data-v="' + esc(p.short) + '">Befördert …</button>' : '') + '</td></tr>';
    }
    var head = '<div class="ffl-scroll"><table class="ffl-table"><thead><tr><th>Name</th><th>jetzt</th><th>nächster Dienstgrad</th><th>Voraussetzungen</th><th></th></tr></thead><tbody>';
    var h = '<div class="ffl-sec"><div class="ffl-sh">Beförderung möglich<em>' + ready.length + '</em></div>' +
      (ready.length ? head + ready.map(function (p) { return row(p, true); }).join('') + '</tbody></table></div>' : '<p class="ffl-mu">Gerade niemand – die Erinnerung kommt automatisch (montags) ins Postfach aller, die den Bereich Mitglieder betreuen.</p>') + '</div>';
    if (missing.length) h += '<div class="ffl-sec"><div class="ffl-sh">Angaben fehlen<em>' + missing.length + '</em></div>' +
      '<p class="ffl-mu" style="margin-top:0">Gelbe Felder antippen und direkt ergänzen: <b>„seit“</b> = seit wann jemand den jetzigen Dienstgrad hat (daraus berechnet Wehrwerk die Wartezeit), ' +
      '<b>? Lehrgang</b> = der Nachweis fehlt in Wehrwerk (z. B. vor Wehrwerk absolviert) – Jahr eintragen genügt.</p>' + head + missing.map(function (p) { return row(p, true); }).join('') + '</tbody></table></div>' +
      '<p class="ffl-mu">Lehrgänge werden aus „Ausbildung“ im Profil und absolvierten Lehrgängen erkannt. Fehlt nur der Nachweis, trotzdem befördern geht immer.</p></div>';
    if (soon.length) h += '<div class="ffl-sec"><div class="ffl-sh">In den nächsten 12 Monaten</div>' + head + soon.map(function (p) { return row(p, false); }).join('') + '</tbody></table></div></div>';
    var ret = d.retiring || [];
    h += '<div class="ffl-sec"><div class="ffl-sh">Altersgrenze Einsatzabteilung<em>' + esc(d.retire_age) + ' Jahre · nächste 6 Monate</em></div>' +
      (ret.length ? '<div class="ffl-chips">' + ret.map(function (r) { return '<a href="#" class="ffl-chip st-warn" data-act="profile" data-id="' + r.member_id + '">' + esc(r.name) + ' · ' + fmtDate(r.date) + '</a>'; }).join('') + '</div>' +
        '<p class="ffl-mu">Im Profil die Abteilung auf „Alters- und Ehrenabteilung“ stellen, wenn es so weit ist.</p>' : '<p class="ffl-mu">Niemand (nur Mitglieder mit Geburtsdatum).</p>') +
      '<div class="ffl-row"><label class="ffl-mu">Altersgrenze</label><input type="number" id="ffl-retage" value="' + esc(d.retire_age) + '" min="50" max="75" style="width:80px">' +
      '<span class="ffl-mu">Wird beim Verlassen des Feldes gespeichert. Bitte mit der aktuellen Landesregelung abgleichen.</span></div></div>';
    if (noRank.length) h += '<p class="ffl-mu">' + noRank.length + ' aktive Mitglieder ohne Dienstgrad (im Profil eintragen): ' + noRank.slice(0, 12).map(function (m) { return '<a href="#" data-act="profile" data-id="' + m.id + '">' + esc(m.name) + '</a>'; }).join(', ') + (noRank.length > 12 ? ' …' : '') + '</p>';
    // Katalog
    var R = ui.ranksDraft || (ui.ranksDraft = (d.ranks || []).map(function (r) { return { name: r.name, short: r.short, from: r.from, months: r.months, quals: (r.quals || []).join('; '), note: r.note || '' }; }));
    h += '<details class="ffl-pbox" style="margin-top:18px"' + (ui.ranksOpen ? ' open' : '') + '><summary class="ffl-sh" style="cursor:pointer;margin:0">Dienstgrade & Voraussetzungen' + (d.ranks_custom ? '' : '<em>Vorgabe NRW</em>') + '</summary>' +
      '<p class="ffl-mu">Vorgabe nach Anlage 1 der NRW-Verordnung über die Laufbahn der ehrenamtlichen Angehörigen der Freiwilligen Feuerwehr – bitte mit eurer aktuellen Fassung und Satzung abgleichen. ' +
      '„ab“ = mindestens dieser Dienstgrad, „Monate“ = Mindestzeit darin. Lehrgänge: Stichworte mit | (eines reicht), mehrere Lehrgänge mit ; trennen.</p>' +
      '<div class="ffl-scroll"><table class="ffl-table" id="ffl-ranktable"><thead><tr><th>Dienstgrad</th><th>Kurz</th><th>ab</th><th>Monate</th><th>Lehrgänge</th><th>Hinweis</th><th></th></tr></thead><tbody>' + R.map(function (r, i) {
        return '<tr data-rank="' + i + '"><td><input type="text" data-rf="name" value="' + esc(r.name) + '"></td><td><input type="text" data-rf="short" value="' + esc(r.short) + '" style="width:70px"></td>' +
          '<td><input type="text" data-rf="from" value="' + esc(r.from) + '" style="width:70px"></td><td><input type="number" data-rf="months" min="0" value="' + (+r.months || 0) + '" style="width:80px"></td>' +
          '<td><input type="text" data-rf="quals" value="' + esc(r.quals) + '"></td><td><input type="text" data-rf="note" value="' + esc(r.note) + '"></td>' +
          '<td><button type="button" class="ffl-q ffl-sm" data-act="rankdel" data-i="' + i + '" aria-label="Entfernen">✕</button></td></tr>';
      }).join('') + '</tbody></table></div><div class="ffl-row" style="margin-top:8px"><button type="button" class="ffl-sm" data-act="rankadd">+ Dienstgrad</button><span style="flex:1"></span>' +
      (d.ranks_custom ? '<button type="button" class="ffl-q" data-act="rankreset">NRW-Vorgabe wiederherstellen</button>' : '') + '<button type="button" class="ffl-p" data-act="ranksave">Speichern</button></div></details>';
    return h;
  }
  function readRanks() {
    [].forEach.call(document.querySelectorAll('[data-rank]'), function (tr) {
      var r = ui.ranksDraft[+tr.getAttribute('data-rank')];
      [].forEach.call(tr.querySelectorAll('[data-rf]'), function (el) { r[el.getAttribute('data-rf')] = el.value; });
    });
    return ui.ranksDraft;
  }

  // Nachbereitung: eine Zeile je Einsatz der letzten 60 Tage – rot, was noch fehlt (Bericht, Bestätigung, Fahrtenbuch, Atemschutzüberwachung, Leihkleidung)
  function followupHtml() {
    var fu = (d.followup || []), open = fu.filter(function (x) { return x.open; });
    if (!allowedTab('incidents')) return '';
    var yr = new Date().getFullYear(), yrs = (d.incident_years || []).slice(); if (yrs.indexOf(yr) < 0) yrs.unshift(yr); yrs.sort(function (a, b) { return b - a; });
    var head = '<div class="ffl-sec"><div class="ffl-sh">Nachbereitung<em>' + (open.length ? open.length + ' von ' + fu.length + ' Einsätzen der letzten 60 Tage mit offenen Punkten' : fu.length ? 'alle ' + fu.length + ' Einsätze der letzten 60 Tage vollständig' : 'keine Einsätze in den letzten 60 Tagen') + '</em></div>';
    var foot = '';
    if (!open.length) return head + foot + '</div>';
    // Je Punkt ein Zustand: done (grün) · wip (gelb: begonnen/wartet) · miss (rot: fehlt) · na (grau: trifft nicht zu)
    function steps(x) {
      var parts = !x.parts ? ['miss', 'niemand eingetragen'] : x.unconfirmed || x.change_req ? ['wip', (x.unconfirmed ? x.unconfirmed + ' unbestätigt' : '') + (x.change_req ? (x.unconfirmed ? ', ' : '') + x.change_req + ' Austragen angefragt' : '')] : ['done', x.parts + ' bestätigt'];
      return [['Bericht', x.report === 'closed' ? 'done' : x.report === 'open' ? 'wip' : 'miss', x.report === 'closed' ? 'abgeschlossen' : x.report === 'open' ? 'Bericht begonnen' : 'Bericht fehlt'],
        ['Beteiligte', parts[0], parts[1]],
        ['Fahrtenbuch', !x.vehicles.length ? 'na' : x.trips_missing.length ? 'wip' : 'done', !x.vehicles.length ? 'kein Fahrzeug eingetragen' : x.trips_missing.length ? 'Fahrtenbuch: ' + x.trips_missing.join(', ') : 'Fahrtenbuch vollständig'],
        ['Atemschutz', x.asu_missing ? 'miss' : 'na', x.asu_missing ? 'Atemschutzüberwachung fehlt' : 'keine Überwachung nötig'],
        ['Leihkleidung', x.loans_open ? 'wip' : 'na', x.loans_open ? x.loans_open + ' Leihkleidung offen' : 'keine Leihkleidung']];
    }
    // Je Einsatz nur die offenen Punkte, in Worten: rot = fehlt, gelb = läuft/wartet; dahinter, was schon erledigt ist (grau, klein)
    return head + '<div class="ffl-fulist">' + open.map(function (x) {
      var st = steps(x), todo = st.filter(function (s) { return s[1] === 'miss' || s[1] === 'wip'; }), done = st.filter(function (s) { return s[1] === 'done'; });
      return '<div class="ffl-furow"><div class="ffl-fu-inc"><b>' + esc((x.nr ? x.nr + ' · ' : '') + x.title) + '</b><div class="ffl-mu">' + fmtDate(x.start) + '</div></div>' +
        '<div class="ffl-fu-todo">' + todo.map(function (s) { return '<span class="ffl-chip ' + (s[1] === 'miss' ? 'st-bad' : 'st-warn') + '">' + esc(s[2]) + '</span>'; }).join(' ') +
        (done.length ? '<span class="ffl-fu-done">✓ ' + esc(done.map(function (s) { return s[0]; }).join(', ')) + '</span>' : '') + '</div>' +
        '<a class="ffl-sm ffl-btn" href="' + esc(portalUrl('ebericht=' + x.id)) + '">Öffnen</a></div>';
    }).join('') + '</div>' + foot + '</div>';
  }
  // Jahresbericht als Druckseite (A4 hoch): Zahlen ohne Namen – für Versammlung und Gemeinde
  function yearReportHtml(r) {
    var MONS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'], CATS = { brand: 'Brand', th: 'Techn. Hilfe', vu: 'Verkehrsunfall', fehl: 'Fehlalarm', sonst: 'Sonstiges' };
    function tbl(rows, head) { return '<table class="yr-t">' + (head ? '<thead><tr>' + head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead>' : '') + '<tbody>' + rows.map(function (r) { return '<tr>' + r.map(function (c, i) { return '<td' + (i ? ' class="n"' : '') + '>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>'; }
    var inc = r.incidents, h = '<style>.yr{font-family:"Barlow",Arial,sans-serif;font-size:11pt;color:#111}.yr h1{font-family:"Barlow Condensed",Arial,sans-serif;font-size:26pt;margin:0;border-bottom:3px solid #e30613;padding-bottom:4px}.yr h2{font-family:"Barlow Condensed",Arial,sans-serif;font-size:16pt;margin:16pt 0 6pt;border-left:4px solid #e30613;padding-left:8px}.yr .sub{color:#666;margin:2pt 0 8pt}.yr-t{border-collapse:collapse;width:100%;margin:4pt 0}.yr-t th,.yr-t td{border-bottom:1px solid #ddd;padding:4pt 6pt;text-align:left;vertical-align:top}.yr-t th{font-size:9pt;text-transform:uppercase;letter-spacing:.04em;color:#555}.yr-t td.n{text-align:right;font-variant-numeric:tabular-nums}.yr .big{display:flex;gap:18pt;flex-wrap:wrap;margin:6pt 0}.yr .big div{min-width:90pt}.yr .big b{display:block;font-family:"Barlow Condensed",Arial,sans-serif;font-size:24pt;line-height:1}.yr .big span{font-size:9pt;color:#555}.yr .cols{display:grid;grid-template-columns:1fr 1fr;gap:14pt}.yr .foot{margin-top:18pt;font-size:9pt;color:#777}</style>' +
      '<div class="yr"><h1>Jahresbericht ' + r.year + '</h1><div class="sub">' + esc(r.org) + ' · erstellt am ' + fmtDate(isoToday()) + ' aus ' + esc(APP) + '</div>';
    h += '<h2>Einsätze</h2><div class="big"><div><b>' + inc.total + '</b><span>Einsätze</span></div><div><b>' + inc.parts_avg + '</b><span>Kräfte je Einsatz (Ø)</span></div><div><b>' + inc.parts_sum + '</b><span>Einsatzkräfte gesamt</span></div>' + (inc.hours ? '<div><b>' + inc.hours + '</b><span>Einsatzstunden (Einsatzdauer)</span></div>' : '') + '</div>';
    h += '<div class="cols"><div>' + tbl(Object.keys(CATS).map(function (k) { return [CATS[k], inc.cats[k] || 0]; }), ['Art', 'Anzahl']) + '</div><div>' + tbl(inc.months.map(function (n, i) { return [MONS[i], n]; }), ['Monat', 'Anzahl']) + '</div></div>';
    if (Object.keys(inc.units).length > 1) h += tbl(Object.keys(inc.units).map(function (u) { return [esc((r.units || {})[u] || u), inc.units[u]]; }), ['Einheit', 'Einsätze']);
    h += '<h2>Übungen & Dienste</h2><div class="big"><div><b>' + r.drills + '</b><span>Dienste im Dienstplan</span></div><div><b>' + r.uebungen.n + '</b><span>Übungen mit Teilnahmeliste</span></div>' + (r.uebungen.n ? '<div><b>' + r.uebungen.avg + '</b><span>Teilnehmende je Übung (Ø)</span></div>' : '') + '</div>';
    h += '<h2>Aus- und Fortbildung</h2>' + (r.quals.length ? tbl(r.quals.map(function (q) { return [esc(q.title), q.n]; }), ['Lehrgang / Nachweis', 'Abschlüsse']) : '<p class="sub">Keine Abschlüsse in ' + r.year + ' eingetragen.</p>');
    var m = r.members;
    h += '<h2>Mitglieder</h2><div class="big"><div><b>' + m.total + '</b><span>aktive Mitglieder</span></div><div><b>' + m.einsatz + '</b><span>Einsatzabteilung</span></div><div><b>' + m.agt_ok + ' / ' + m.agt + '</b><span>Atemschutz einsatzbereit / gesamt</span></div><div><b>' + m.joined + '</b><span>Eintritte ' + r.year + '</span></div></div>';
    h += '<h2>Fahrzeuge</h2>' + tbl(r.vehicles.map(function (v) { return [esc(v.name), v.trips, v.inc, v.km != null && v.trips ? kmFmtA(v.km) : '–', v.fuel ? v.fuel + ' l' : '–']; }), ['Fahrzeug', 'Fahrten', 'davon Einsatz', 'km', 'getankt']) +
      '<p class="sub">' + r.defects + ' Mängelmeldungen im Jahr.</p>';
    h += '<div class="foot">Zahlen aus ' + esc(APP) + ' – Einsätze nach Alarmdatum, Beteiligung nach bestätigten und unbestätigten Einträgen, Fahrzeug-km aus dem Fahrtenbuch (ohne stornierte Fahrten).</div></div>';
    return h;
  }
  function kmFmtA(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  // Doppelte Einträge (gleicher Name): Hinweis mit Zusammenführen – Beteiligungen, Fahrten, Lehrgänge wandern mit
  function dupesBox() {
    var dp = d.dupes || []; if (!dp.length) return '';
    var mem = by(d.members, 'id');
    return '<div class="ffl-msg warn" style="margin-top:12px"><b>' + (dp.length === 1 ? 'Ein Mitglied ist doppelt angelegt' : dp.length + ' Mitglieder sind doppelt angelegt') + '</b> – z. B. aus Import und Hand-Anlage. Zusammenführen hängt Beteiligungen, Fahrten, Lehrgänge, Kleidung und Dienste an den behaltenen Eintrag und übernimmt fehlende Angaben.' +
      dp.map(function (p) { var k = mem[p.keep] || {}, x = mem[p.drop] || {};
        function who(m) { return (m.user_id ? (m.last_login ? 'Konto, zuletzt angemeldet ' + fmtDate(m.last_login) : 'Konto, noch nie angemeldet') : 'ohne Konto') + (m.joined ? ' · Eintritt ' + fmtDate(m.joined) : '') + (m.birth_date ? ' · mit Geburtsdatum' : ''); }
        return '<div class="ffl-dupe"><b>' + esc(p.name) + '</b><div class="ffl-mu"><span class="ffl-chip st-ok">behalten</span> ' + esc(who(k)) + '</div><div class="ffl-mu"><span class="ffl-chip st-no">auflösen</span> ' + esc(who(x)) + '</div>' +
          '<div class="ffl-row" style="gap:6px;margin-top:6px"><button type="button" class="ffl-sm ffl-p" data-act="mmerge" data-id="' + p.keep + '" data-v="' + p.drop + '">Zusammenführen</button><button type="button" class="ffl-sm" data-act="vprofile" data-id="' + p.drop + '">Eintrag „auflösen“ ansehen</button><button type="button" class="ffl-sm ffl-q" data-act="vprofile" data-id="' + p.keep + '">Eintrag „behalten“ ansehen</button></div></div>'; }).join('') + '</div>';
  }
  function membersList() {
    var q = ui.mSearch.toLowerCase();
    var traitsOf = group(d.member_traits, 'member_id'), traitById = by(d.traits, 'id');
    var list = d.members.filter(function (m) {
      var a = agtState(m);
      return (!q || m.name.toLowerCase().indexOf(q) >= 0 || (m.email || '').toLowerCase().indexOf(q) >= 0) &&
        (!ui.mTrait || (traitsOf[m.id] || []).some(function (t) { return String(t.trait_id) === String(ui.mTrait); })) &&
        (!ui.mDay || m.day_available) && (!ui.mEmp || m.employment === ui.mEmp) &&
        (!ui.mAgt || (ui.mAgt === 'agt' ? m.agt : ui.mAgt === 'ready' ? a && a.ready : a && !a.ready)) &&
        (ui.mInactive || m.active) && (!ui.mDept || (m.dept || 'einsatz') === ui.mDept);
    });
    var acc = d.members.filter(function (m) { return m.user_id; }).length, logged = d.members.filter(function (m) { return m.last_login; }).length;
    var filtered = ui.mTrait || ui.mDay || ui.mEmp || ui.mAgt || ui.mDept || q;
    var h = dupesBox() + nameCheck() + '<div class="ffl-filters">' +
      '<input type="search" id="ffl-msearch" value="' + esc(ui.mSearch) + '" placeholder="Name oder E-Mail suchen …">' +
      // Auf dem Handy: weitere Filter eingeklappt
      // Handy: weitere Filter einklappbar; sonst alles in einem Raster mit der Suche
      (window.innerWidth > 600 ? '<div class="ffl-filters-in">' : '<details class="ffl-morefilters"' + (ui.mTrait || ui.mEmp || ui.mDept || ui.mAgt || ui.mDay || ui.mInactive ? ' open' : '') + '><summary>Filter</summary><div class="ffl-filters-in">') +
      '<select id="ffl-mtrait"><option value="">alle Merkmale</option>' + Object.keys(d.trait_cats).map(function (cat) {
        return '<optgroup label="' + esc(d.trait_cats[cat]) + '">' + d.traits.filter(function (t) { return t.cat === cat; }).map(function (t) {
          return '<option value="' + t.id + '"' + (String(t.id) === String(ui.mTrait) ? ' selected' : '') + '>' + esc(t.name) + '</option>'; }).join('') + '</optgroup>';
      }).join('') + '</select>' +
      sel([['', 'hauptberuflich: alle']].concat(Object.keys(d.employment_opts).map(function (k) { return [k, d.employment_opts[k]]; })), ui.mEmp || '', 'id="ffl-memp"') +
      sel([['', 'alle Abteilungen']].concat(Object.keys(d.depts || {}).map(function (k) { return [k, d.depts[k]]; })), ui.mDept || '', 'id="ffl-mdept"') +
      (d.can_agt ? sel([['', 'Atemschutz: alle'], ['agt', 'nur AGT'], ['ready', 'AGT einsatzbereit'], ['notready', 'AGT nicht einsatzbereit']], ui.mAgt || '', 'id="ffl-magt"') : '') +
      '<div class="ffl-row" style="gap:14px"><label class="ffl-check"><input type="checkbox" id="ffl-mday"' + (ui.mDay ? ' checked' : '') + '> tagsüber verfügbar</label>' +
      '<label class="ffl-check"><input type="checkbox" id="ffl-minactive"' + (ui.mInactive ? ' checked' : '') + '> auch inaktive</label></div></div>' + (window.innerWidth > 600 ? '' : '</details>') + '</div>' +
      '<p class="ffl-mu" style="margin:8px 0 0">' + (filtered ? '<b style="color:var(--ink)">' + list.length + ' Treffer</b> · ' : '') + d.members.length + ' Mitglieder · ' + acc + ' mit Konto · ' + logged + ' schon angemeldet</p>';
    var L = MYFUI.lt(ui, 'members', list, { noun: 'angezeigt', per: 30,
      csv: { name: 'Mitglieder', cols: [['Name', function (m) { return m.name; }], ['Einheit', function (m) { return unitShort(m.unit); }], ['Dienstgrad', function (m) { return m.rank; }], ['Status', function (m) { return m.mstatus || (m.active ? 'aktiv' : 'inaktiv'); }],
        ['Mitglied seit', function (m) { return m.joined ? fmtDate(m.joined) : ''; }], ['Merkmale', function (m) { return (traitsOf[m.id] || []).map(function (t) { return (traitById[t.trait_id] || {}).name; }).filter(Boolean); }],
        ['Konto', function (m) { return m.user_id ? (m.last_login ? 'zuletzt ' + fmtDate(m.last_login) : 'noch nie angemeldet') : 'kein Konto'; }]] }, sorts: [['name', 'Name A–Z', function (m) { return m.name; }, 1], ['name_d', 'Name Z–A', function (m) { return m.name; }, -1],
      ['unit', 'Einheit', function (m) { return unitShort(m.unit) + '|' + m.name; }, 1], ['login', 'zuletzt angemeldet', function (m) { return m.last_login || ''; }, -1], ['nologin', 'noch nie angemeldet zuerst', function (m) { return (m.last_login ? '1' : '0') + m.name; }, 1]] });
    h += L.bar + '<div class="ffl-scroll"><table class="ffl-table ffl-mtable ffl-stack"><thead><tr><th>Name</th><th>Einheit</th><th>Merkmale</th><th>Konto</th><th></th></tr></thead><tbody>';
    if (!list.length) h += '<tr><td colspan="5" class="ffl-mu">Niemand gefunden.</td></tr>';
    L.rows.forEach(function (m) {
      h += '<tr' + (m.active ? '' : ' class="is-off"') + '><td class="name"><a href="#" data-act="profile" data-id="' + m.id + '"><b>' + esc(m.name) + '</b></a>' + (m.mstatus === 'pausiert' ? ' <span class="ffl-chip st-warn">pausiert</span>' : m.mstatus === 'ausgetreten' ? ' <span class="ffl-chip st-no">ausgetreten</span>' : m.active ? '' : ' <span class="ffl-chip st-no">inaktiv</span>') + (m.dept && m.dept !== 'einsatz' ? ' <span class="ffl-chip st-done">' + esc((d.depts || {})[m.dept] || m.dept) + '</span>' : '') +
        '<div class="ffl-chips" style="margin-top:3px">' + agtChip(m) + '</div></td>' +
        '<td data-l="Einheit">' + esc(unitShort(m.unit)) + '</td><td class="full"><div class="ffl-chips">' + (+m.day_available ? '<span class="ffl-chip st-ok">' + ['', 'tagsüber', 'tagsüber · Homeoffice', 'tagsüber teilweise'][+m.day_available] + '</span>' : '') +
        (m.employment && m.employment !== 'ehrenamt' && d.employment_opts[m.employment] ? '<span class="ffl-chip st-done">' + esc(d.employment_opts[m.employment]) + '</span>' : '') +
        (traitsOf[m.id] || []).filter(function (t) { return traitById[t.trait_id]; }).sort(function (a, b) { return (traitById[a.trait_id].cat === 'funktion' ? 0 : 1) - (traitById[b.trait_id].cat === 'funktion' ? 0 : 1); })
          .map(function (t) { var tr = traitById[t.trait_id]; return '<span class="ffl-chip ' + (tr.cat === 'funktion' ? 'st-fn' : 'st-open') + '">' + esc(tr.name) + '</span>'; }).join('') + '</div></td>' +
        '<td data-l="Konto" class="span2">' + (m.user_id ? '<span class="ffl-mu">' + (m.last_login ? 'zuletzt ' + fmtDate(m.last_login) : 'noch nie angemeldet') + '</span>' : '<span class="ffl-chip st-warn">kein Konto</span>') +
        (m.user_id && !m.last_login ? '<br><button type="button" class="ffl-q ffl-sm" style="padding:0" data-act="invite" data-id="' + m.id + '">Einladung erneut senden</button>' : '') + '</td>' +
        '<td class="del" style="text-align:right"><button type="button" class="ffl-sm" data-act="profile" data-id="' + m.id + '">Profil</button></td></tr>';
    });
    return h + '</tbody></table></div>' + L.pager;
  }

  function membersAdd() {
    var mf = d.mail_from || {}, pv = d.invite_preview || {};
    var h = '<div class="ffl-grid2" style="margin-top:14px"><div class="ffl-pbox"><div class="ffl-sh" style="font-size:17px">Ein Mitglied hinzufügen</div>' +
      '<div class="ffl-form2"><div><label class="ffl-fl" for="ffl-newlast">Nachname</label><input type="text" id="ffl-newlast" autocomplete="off"></div>' +
      '<div><label class="ffl-fl" for="ffl-newfirst">Vorname</label><input type="text" id="ffl-newfirst" autocomplete="off"></div>' +
      (multiUnit() ? '<div><label class="ffl-fl" for="ffl-newunit">Einheit</label>' + unitSel(unitKeys()[0], 'id="ffl-newunit"') + '</div>' : '<input type="hidden" id="ffl-newunit" value="' + esc(unitKeys()[0]) + '">') +
      '<div><label class="ffl-fl" for="ffl-newmail">E-Mail (für das Konto)</label><input type="text" id="ffl-newmail" inputmode="email" autocomplete="off"></div></div>' +
      '<p class="ffl-mu" id="ffl-newhint" style="margin:6px 0 0">Tipp: Den ganzen Namen ins Feld „Nachname“ tippen genügt – er wird automatisch aufgeteilt.</p>' +
      '<label class="ffl-check" style="margin-top:12px"><input type="checkbox" id="ffl-newinvite" checked> Einladung sofort per E-Mail schicken</label>' +
      '<div class="ffl-row" style="margin-top:12px"><button type="button" class="ffl-p" data-act="addmember">Hinzufügen</button></div>' +
      '<p class="ffl-mu">Ohne E-Mail wird nur der Eintrag angelegt (ohne Konto) – Daten pflegst du dann hier in der Verwaltung.</p></div>';

    h += '<div class="ffl-pbox"><div class="ffl-sh" style="font-size:17px">So kommt die Einladung an</div>' +
      '<ol class="ffl-howto"><li>Mit „Hinzufügen“ wird ein Konto angelegt (Benutzername aus dem Namen, z. B. <i>max.mustermann</i>).</li>' +
      '<li>WordPress verschickt eine E-Mail mit einem <b>persönlichen Link</b>, über den das Mitglied sein Passwort selbst festlegt (einige Tage gültig).</li>' +
      '<li>Danach meldet es sich auf der ' + APP + '-Seite mit E-Mail oder Benutzername an – „Angemeldet bleiben“ hält 180 Tage.</li></ol>' +
      '<p class="ffl-mu" style="margin:6px 0">Absender: <b style="color:var(--ink)">' + esc(mf.name || 'WordPress') + ' &lt;' + esc(mf.email || '') + '&gt;</b> – verschickt über den Mailversand der Website. ' +
      'Landen Mails im Spam oder kommen nicht an: ein SMTP-Plugin (z. B. „WP Mail SMTP“) mit eurem Feuerwehr-Postfach einrichten.</p>' +
      '<details><summary class="ffl-mu" style="cursor:pointer">Text der Einladung ansehen</summary><div class="ffl-mailprev"><b>Betreff: ' + esc(pv.subject) + '</b>\n\n' + esc(pv.text) + '</div></details>' +
      '<div class="ffl-row" style="margin-top:10px"><button type="button" class="ffl-sm" data-act="mailtest">Probe-Einladung an mich senden</button></div></div></div>';

    h += '<div class="ffl-pbox" style="margin-top:14px"><div class="ffl-sh" style="font-size:17px">Viele auf einmal (aus Excel)</div>' +
      '<p class="ffl-mu" style="margin-top:0">Eine Zeile pro Person, Spalten aus Excel kopieren (Tab) oder mit Semikolon trennen. Möglich sind<br>' +
      '<b>Nachname · Vorname · Löschzug · E-Mail</b> &nbsp;oder&nbsp; <b>„Nachname, Vorname“ · Löschzug · E-Mail</b>. Doppelte Namen werden übersprungen.</p>' +
      '<textarea id="ffl-memberimport" placeholder="Mustermann&#9;Max&#9;max@example.de&#10;Musterfrau&#9;Erika&#9;erika@example.de">' + esc(ui.memberImport) + '</textarea>' +
      '<div class="ffl-row" style="margin-top:8px"><button type="button" class="ffl-p" style="margin-left:auto" data-act="importmembers">Prüfen</button></div>' + importPreview() + '</div>';
    return h;
  }

  // Vorschau des Imports: erkannter Nach-/Vorname je Zeile, unsichere markiert, mit Tausch-Knopf
  function importPreview() {
    var p = ui.impPrev;
    if (!p) return '';
    var unsure = p.filter(function (x) { return !x.sure; }).length;
    return '<div class="ffl-fl" style="margin-top:16px">Vorschau – ' + p.length + ' Personen' + (unsure ? ', <span style="color:var(--warn)">' + unsure + ' bitte prüfen</span>' : ', alles eindeutig') + '</div>' +
      '<div class="ffl-scroll"><table class="ffl-table"><thead><tr><th>Nachname</th><th></th><th>Vorname</th><th>Einheit</th><th>E-Mail</th><th>erkannt über</th></tr></thead><tbody>' + p.map(function (x, i) {
        return '<tr' + (x.sure ? '' : ' class="is-unsure"') + ' data-imp="' + i + '"><td><input type="text" data-impf="last" value="' + esc(x.last) + '"></td>' +
          '<td><button type="button" class="ffl-q ffl-sm" data-act="impswap" data-id="' + i + '" title="Vor- und Nachname tauschen">⇄</button></td>' +
          '<td><input type="text" data-impf="first" value="' + esc(x.first) + '"></td><td>' + esc(unitShort(x.unit)) + '</td><td class="ffl-mu">' + esc(x.email) + '</td>' +
          '<td>' + (x.sure ? '<span class="ffl-mu">' + esc(x.why) + '</span>' : '<span class="ffl-chip st-warn">' + esc(x.why) + '</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="ffl-row" style="margin-top:10px"><label class="ffl-check"><input type="checkbox" id="ffl-bulkinvite"> Einladungen sofort verschicken</label>' +
      '<button type="button" data-act="impcancel" style="margin-left:auto">Verwerfen</button><button type="button" class="ffl-p" data-act="impconfirm">' + p.length + ' übernehmen</button></div>';
  }

  // Bestehende Namen ohne Trennung (kein Komma) prüfen und korrigieren
  function nameCheck() {
    var list = d.members.filter(function (m) { return m.name.indexOf(',') < 0; });
    if (!list.length) return '';
    if (!ui.nameCheck) return '<div class="ffl-msg warn">' + list.length + (list.length === 1 ? ' Name ist' : ' Namen sind') + ' nicht in Nach- und Vorname getrennt. ' +
      '<button type="button" class="ffl-q ffl-sm" style="padding:0" data-act="namecheck">Jetzt prüfen</button></div>';
    return '<div class="ffl-pbox"><div class="ffl-sh">Namen trennen<em>Vorschlag prüfen, bei Bedarf ⇄ tauschen</em></div><div class="ffl-scroll"><table class="ffl-table"><thead><tr><th>bisher</th><th>Nachname</th><th></th><th>Vorname</th><th>erkannt über</th></tr></thead><tbody>' +
      list.map(function (m) {
        var g = ui.nameFix[m.id] || (ui.nameFix[m.id] = MYFNames.split(m.name, m.email));
        return '<tr data-nfix="' + m.id + '"' + (g.sure ? '' : ' class="is-unsure"') + '><td>' + esc(m.name) + '</td><td><input type="text" data-nf="last" value="' + esc(g.last) + '"></td>' +
          '<td><button type="button" class="ffl-q ffl-sm" data-act="nfswap" data-id="' + m.id + '" title="tauschen">⇄</button></td><td><input type="text" data-nf="first" value="' + esc(g.first) + '"></td>' +
          '<td>' + (g.sure ? '<span class="ffl-mu">' + esc(g.why) + '</span>' : '<span class="ffl-chip st-warn">' + esc(g.why) + '</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div><div class="ffl-row" style="margin-top:10px"><button type="button" data-act="namecheck" style="margin-left:auto">Schließen</button>' +
      '<button type="button" class="ffl-p" data-act="nfapply">Alle übernehmen</button></div></div>';
  }

  // Wer Hinweise schreiben darf – die Rechte-Tabelle bekommt nur die Hauptverwaltung, Teil-Admins sehen den Hinweis darauf
  function noticeRight() {
    var r = d.rights && d.rights.notices;
    if (!r) return 'laut „Funktionen & Rechte“';
    return (r.all ? ['alle Mitglieder'] : d.traits.filter(function (t) { return r.traits.indexOf(t.id) >= 0; }).map(function (t) { return t.name; })).join(', ') || '–';
  }
  // Wer darf was? Je Bereich alle Mitglieder oder nur bestimmte Funktionen
  function rightsEditor() {
    if (!d.rights) return '';
    var traitsOf = group(d.member_traits, 'member_id');
    var cats = Object.keys(d.trait_cats);
    var h = '<div class="ffl-pbox" style="margin-top:14px"><div class="ffl-sh">Wer darf was?</div>' +
      '<p class="ffl-mu" style="margin-top:0">Je Bereich: alle Mitglieder – oder nur Mitglieder mit bestimmten Funktionen. Die Funktionen trägst du im Profil ein ' +
      '(Merkmale & Fähigkeiten). Die Verwaltung darf immer alles; Zurücktreten von Lehrgängen geht immer.</p>';
    Object.keys(d.rights_labels).forEach(function (k) {
      var r = d.rights[k], sel = {}; r.traits.forEach(function (id) { sel[id] = 1; });
      var n = d.members.filter(function (m) {
        return m.active && (r.all || (k === 'notices' && m.can_notice) || (traitsOf[m.id] || []).some(function (t) { return sel[t.trait_id]; }));
      }).length;
      h += '<div class="ffl-right" data-right="' + k + '"><div class="ffl-row" style="justify-content:space-between"><b>' + esc(d.rights_labels[k]) + '</b>' +
        '<span class="ffl-mu">' + (n === 1 ? '1 Mitglied darf das' : n + ' Mitglieder dürfen das') + '</span></div>' +
        (k === 'area_full' ? '<p class="ffl-mu" style="margin:6px 0 0">Nur ausgewählte Funktionen (z. B. Wehrführung) – nie alle Mitglieder.</p>' :
        '<div class="ffl-row" style="margin-top:6px"><label class="ffl-switch"><input type="checkbox" data-rall="' + k + '"' + (r.all ? ' checked' : '') + '><span></span>alle Mitglieder</label></div>') +
        (r.all ? '' : '<div class="ffl-chips" style="margin-top:8px">' + cats.map(function (c) {
          return d.traits.filter(function (t) { return t.cat === c && (c === 'funktion' || sel[t.id]); }).map(function (t) {
            return '<label class="ffl-toggle-chip' + (sel[t.id] ? ' on' : '') + '"><input type="checkbox" data-rtrait="' + t.id + '"' + (sel[t.id] ? ' checked' : '') + '>' + esc(t.name) + '</label>';
          }).join('');
        }).join('') + '</div>' + (k === 'notices' ? '<p class="ffl-mu" style="margin:6px 0 0">Zusätzlich einzeln freigegebene Personen: ' + APP + ' → Dashboard → Hinweise.</p>' : '') +
        (!r.traits.length && !(k === 'notices') ? '<p class="ffl-mu" style="margin:6px 0 0;color:var(--red-tx)">Keine Funktion gewählt – dann darf das nur die Verwaltung.</p>' : '')) + '</div>';
    });
    return h + '</div>';
  }

  // Wer sieht was? Je Person: Hauptverwaltung oder die einzelnen Bereiche
  function accessMap() {
    var A = d.access_map; if (!A) return '';
    return '<div class="ffl-pbox" style="margin-top:14px"><div class="ffl-sh">Wer sieht was?<em>' + A.length + ' Personen mit Verwaltungszugang</em></div>' +
      '<p class="ffl-mu" style="margin-top:0">Ergibt sich aus den Funktionen unten. Mitglieder ohne Eintrag hier sehen nur den Mitgliederbereich.</p>' +
      '<div class="ffl-scroll"><table class="ffl-table ffl-stack"><thead><tr><th>Person</th><th>Zugang</th></tr></thead><tbody>' + A.map(function (x) {
        return '<tr><td class="name"><b>' + esc(x.name) + '</b>' + (x.account ? '' : ' <span class="ffl-chip st-warn">kein Konto</span>') + '</td><td class="full"><div class="ffl-chips">' +
          (x.full ? '<span class="ffl-chip st-bad">' + (x.wp_only ? (x.wp_admin ? 'WordPress-Administrator' : 'Verwaltung (Konto)') : 'Hauptverwaltung') + ' – alles</span>' : x.areas.map(function (a) { return '<span class="ffl-chip st-open">' + esc(a) + '</span>'; }).join('')) +
          '</div></td></tr>';
      }).join('') + '</tbody></table></div></div>';
  }
  function membersLists() {
    var h = accessMap() + rightsEditor() + '<div class="ffl-pbox" style="margin-top:14px"><div class="ffl-sh" style="font-size:17px;margin-bottom:4px">Merkmale & Fähigkeiten</div>' +
      '<p class="ffl-mu" style="margin:0 0 8px">Erscheinen im Profil zum Anhaken und als Filter in der Mitgliederliste. Änderungen werden sofort gespeichert.</p>' +
      '<div class="ffl-scroll"><table class="ffl-table"><thead><tr><th>Bezeichnung</th><th>Bereich</th><th style="width:100px" title="Kleinere Zahl steht weiter oben">Reihenfolge</th><th style="width:40px"></th></tr></thead><tbody>' +
      d.traits.map(function (t) {
        var n = d.member_traits.filter(function (x) { return x.trait_id === t.id; }).length;
        return '<tr data-row="trait" data-id="' + t.id + '"><td><input type="text" data-f="name" value="' + esc(t.name) + '"></td><td>' +
          sel(Object.keys(d.trait_cats).map(function (k) { return [k, d.trait_cats[k]]; }), t.cat, 'data-f="cat"') + '</td><td><input type="number" data-f="sort" value="' + t.sort + '"></td>' +
          '<td><button type="button" class="ffl-q ffl-sm" data-act="deltrait" data-id="' + t.id + '" title="' + n + ' Mitglieder haben dieses Merkmal">✕</button></td></tr>';
      }).join('') + '</tbody></table></div><div class="ffl-row" style="margin-top:8px"><input type="text" id="ffl-newtrait" class="ffl-grow" placeholder="Neues Merkmal, z. B. Motorsägenführer">' +
      sel(Object.keys(d.trait_cats).map(function (k) { return [k, d.trait_cats[k]]; }), Object.keys(d.trait_cats)[0], 'id="ffl-newtraitcat" style="width:auto"') +
      '<button type="button" class="ffl-p" data-act="addtrait">Hinzufügen</button></div></div>';
    h += '<div style="margin-top:14px">' + listEditors(
      listEditor('employment', 'Tätigkeiten', 'Auswahl „Tätigkeit“ im Profil (z. B. ehrenamtlich / hauptamtlich) und Filter in der Liste.', 'Neue Tätigkeit, z. B. Werkfeuerwehr') +
      listEditor('trait_cats', 'Bereiche der Merkmale', 'Überschriften, unter denen die Merkmale gruppiert sind.', 'Neuer Bereich, z. B. Sprachen')) + '</div>';
    return h;
  }

  // Profil: alles zu einer Person über alle Jahre
  // Mitgliedschaft: Verlauf mit Datum, daraus Status; beim Austritt archivieren oder anonymisieren
  function membershipBox(p, m) {
    var hist = p.history || [], KIND = { eintritt: 'eingetreten', pause: 'pausiert', rueckkehr: 'zurückgekehrt', austritt: 'ausgetreten', wiedereintritt: 'wieder eingetreten', notiz: 'Notiz' };
    var years = m.joined ? Math.floor((Date.now() - new Date(m.joined + 'T12:00:00')) / 31557600000) : null;
    var h = '<div class="ffl-pbox"><div class="ffl-sh">Mitgliedschaft<em>' + (m.joined ? 'seit ' + fmtDate(m.joined) + (years != null ? ' · ' + years + (years === 1 ? ' Jahr' : ' Jahre') : '') : 'Eintritt noch nicht eingetragen') + '</em></div>' +
      (hist.length ? '<ul class="ffl-mhist">' + hist.map(function (x) {
        return '<li class="k-' + esc(x.kind) + '"><b>' + fmtDate(x.date) + '</b> ' + esc(KIND[x.kind] || x.label) + (x.note ? ' – ' + esc(x.note) : '') + ' <span class="ffl-mu">(' + esc(x.by) + ')</span>' +
          ' <button type="button" class="ffl-q ffl-sm" data-act="mhdel" data-v="' + x.id + '" title="Eintrag entfernen (Fehleingabe)">✕</button></li>';
      }).join('') + '</ul>' : '<p class="ffl-mu" style="margin:0 0 8px">Noch kein Verlauf. Tipp: Eintritt mit Datum eintragen – dann stimmt „Mitglied seit“ auch für Ehrungen.</p>') +
      '<div class="ffl-row" data-mhform="' + m.id + '"><select data-mh="kind" style="width:auto">' + Object.keys(KIND).map(function (k) { return '<option value="' + k + '">' + KIND[k] + '</option>'; }).join('') + '</select>' +
      '<input type="date" data-mh="date" value="' + isoToday() + '" style="width:auto"><input type="text" data-mh="note" placeholder="Bemerkung (optional), z. B. Elternzeit, Umzug" style="flex:1;min-width:180px">' +
      '<button type="button" class="ffl-sm ffl-p" data-act="mhadd" data-id="' + m.id + '">Eintragen</button></div>' +
      '<p class="ffl-mu" style="margin:6px 0 0"><b>Pausiert</b> oder <b>ausgetreten</b> = nicht mehr aktiv (keine Einteilung, keine Alarm-Listen). Beim Austritt bleiben alle Daten <b>archiviert</b> und die Anmeldung ist gesperrt – ein Wiedereintritt geht jederzeit. ' +
      'Möchte jemand, dass seine Daten gelöscht werden: <a href="#" data-act="manon" data-id="' + m.id + '">anonymisieren</a> (Name und persönliche Angaben weg, Einsätze bleiben ohne Namen in der Statistik).</p></div>';
    return h;
  }
  function memberProfile() {
    var p = ui.prof, m = p.member, nm = splitName(m.name), a = agtState(m);
    var h = '<button type="button" class="ffl-q" style="margin-top:12px;padding:0" data-act="closeprofile">← ' + (ui.backTab && ui.backTab !== 'members' ? 'zurück' : 'alle Mitglieder') + '</button>';
    h += '<div class="ffl-phead"><div class="ffl-row" style="justify-content:space-between;align-items:flex-start"><div><h3>' + esc(nm.first ? nm.first + ' ' + nm.last : nm.last) + '</h3>' +
      '<div class="ffl-chips" style="margin-top:6px">' + (multiUnit() ? '<span class="ffl-chip st-open">' + esc(unitName(m.unit)) + '</span>' : '') + '' + ({ pausiert: '<span class="ffl-chip st-warn">pausiert</span>', ausgetreten: '<span class="ffl-chip st-no">ausgetreten</span>' }[m.mstatus] || (m.active ? '' : '<span class="ffl-chip st-no">inaktiv</span>')) +
      (m.joined ? '<span class="ffl-chip st-open">Mitglied seit ' + fmtDate(m.joined) + '</span>' : '') +
      (m.user_id ? (m.last_login ? '<span class="ffl-chip st-ok">Konto · zuletzt ' + fmtDate(m.last_login) + '</span>' : '<span class="ffl-chip st-warn">Konto · noch nie angemeldet</span>') : '<span class="ffl-chip st-warn">kein Konto</span>') +
      (m.employment && d.employment_opts[m.employment] ? '<span class="ffl-chip st-done">' + esc(d.employment_opts[m.employment]) + '</span>' : '') + '</div></div>' +
      '<div class="ffl-row"><button type="button" class="ffl-sm" data-act="clothfor" data-id="' + m.id + '">Kleidung eintragen</button>' +
      '<button type="button" class="ffl-sm" data-act="printprofile">Ausbildungsnachweis drucken</button></div></div>';
    if (a) h += '<div class="ffl-agtbar ' + (!a.ready ? 'bad' : a.soon ? 'warn' : 'ok') + '"><b>' + (a.ready ? '✓ Atemschutz einsatzbereit' : '✕ Atemschutz nicht einsatzbereit') + '</b><span>' + esc(a.detail) + '</span>' +
      '<a href="#" data-act="agtjump">zum Atemschutz</a></div>';
    h += '<div class="ffl-form4" data-row="profile" data-id="' + m.id + '">' +
      '<div><label class="ffl-fl">Nachname</label><input type="text" data-f="last" value="' + esc(nm.last) + '"></div>' +
      '<div><label class="ffl-fl">Vorname</label><input type="text" data-f="first" value="' + esc(nm.first) + '"></div>' +
      (multiUnit() ? '<div><label class="ffl-fl">Einheit</label>' + unitSel(m.unit, 'data-f="unit"') + '</div>' : '') +
      '<div class="span2"><label class="ffl-fl">E-Mail (Konto)</label><input type="text" data-f="email" value="' + esc(m.email) + '" placeholder="für Einladung und Passwort"></div>' +
      '<div><label class="ffl-fl">Status</label><label class="ffl-check" style="min-height:44px"><input type="checkbox" data-f="active"' + (m.active ? ' checked' : '') + '> aktiv (nicht ausgetreten)</label></div>' +
      '<div><label class="ffl-fl">Abteilung' + (m.dept_since ? ' <span class="ffl-mu">seit ' + fmtDate(m.dept_since) + '</span>' : '') + '</label>' + sel(Object.keys(d.depts || {}).map(function (k) { return [k, d.depts[k]]; }), m.dept || 'einsatz', 'data-f="dept"') + '</div>' +
      '<div><label class="ffl-fl">Dienstgrad</label><input type="text" data-f="rank" list="ffl-ranklist" value="' + esc(m.rank) + '" placeholder="z. B. OFM, UBM">' +
        '<datalist id="ffl-ranklist">' + (d.ranks || []).map(function (r) { return '<option value="' + esc(r.short) + '" label="' + esc(r.name) + '">'; }).join('') + '</datalist></div>' +
      '<div><label class="ffl-fl">Dienstgrad seit</label><input type="date" data-f="rank_since" value="' + esc(m.rank_since || '') + '"></div>' +
      '<div><label class="ffl-fl">Eintritt Feuerwehr</label><input type="date" data-f="joined" value="' + esc(m.joined || '') + '"></div>' +
      '<div><label class="ffl-fl">Geburtsdatum</label><input type="date" data-f="birth_date" value="' + esc(m.birth_date || '') + '"></div>' +
      '<div><label class="ffl-fl">Geburtsort</label><input type="text" data-f="birth_place" value="' + esc(m.birth_place) + '"></div>' +
      '<div><label class="ffl-fl">Straße</label><input type="text" data-f="street" value="' + esc(m.street) + '"></div>' +
      '<div><label class="ffl-fl">Handy</label><input type="text" data-f="phone" value="' + esc(m.phone) + '"></div></div>' +
      '<div class="ffl-row" style="margin-top:10px">' + (m.user_id && m.id !== d.me_member ? '<button type="button" class="ffl-sm" data-act="invite" data-id="' + m.id + '">Einladung erneut per E-Mail</button>' +
        '<button type="button" class="ffl-sm" data-act="pwlink" data-id="' + m.id + '">Passwort-Link ohne E-Mail erzeugen</button>' : '') +
        (!d.me_member ? '<button type="button" class="ffl-sm ffl-p" data-act="linkme" data-id="' + m.id + '">Das bin ich – mit meinem Konto verknüpfen</button>' : '') +
        (m.id === d.me_member ? '<span class="ffl-chip st-ok">Das bist du</span>' : '') +
        '<label class="ffl-switch" style="margin-left:auto"><input type="checkbox" data-nright="' + m.id + '"' + (m.can_notice ? ' checked' : '') + '><span></span>darf Dashboard-Hinweise schreiben</label></div>' +
      (ui.pwlink && ui.pwlink.id === m.id ? '<div class="ffl-msg ok"><b>Persönlicher Link für ' + esc(m.name) + ' (Benutzername: ' + esc(ui.pwlink.login) + ')</b>' + secretBox(ui.pwlink.url, { what: 'Passwort-Link ' + m.name, open: 'Per WhatsApp teilen', href: 'https://wa.me/?text=' + encodeURIComponent('Hallo! Hier kannst du dein Passwort für ' + APP + ' festlegen: ' + ui.pwlink.url + '\nDanach anmelden unter: ' + d.link) }) +
        '<span class="ffl-mu">Nur an diese Person schicken – der Link ist einige Tage gültig und funktioniert einmal.</span></div>' : '') +
      '<p class="ffl-mu" style="margin:8px 0 0">' + (m.user_id ? '' : 'Noch kein Konto – E-Mail eintragen, dann wird es angelegt und die Einladung verschickt. ') + 'Änderungen werden beim Verlassen eines Feldes gespeichert.</p></div>';

    // Merkmale & Fähigkeiten
    h += membershipBox(p, m);
    // Spind des Mitglieds (Schlüssel ausgegeben?) – Bearbeiten in der Kleiderkammer
    if (d.lockers) { var mlk = d.lockers.filter(function (l) { return l.member_id === m.id; });
      h += '<div class="ffl-pbox"><div class="ffl-sh">Spind<em><a href="#" data-act="golockers" data-id="' + (mlk[0] ? mlk[0].id : 0) + '">' + (mlk.length ? 'bearbeiten' : 'zuweisen') + '</a></em></div>' +
        (mlk.length ? mlk.map(function (l) { return '<div class="ffl-row" style="gap:10px"><b>' + esc(l.location ? l.location + ' · ' : '') + 'Nr. ' + esc(l.nr) + '</b>' + lockerChip(l) + '<span class="ffl-mu">seit ' + fmtDate(l.since) + '</span></div>'; }).join('') : '<p class="ffl-mu" style="margin:0">Kein Spind zugewiesen.</p>') + '</div>'; }
    // Was das Mitglied noch ausgeliehen hat (Leihkleidung, Geräte …) – direkt hier zurücknehmen
    if (d.loan_can) { var ml = (d.loans || []).filter(function (l) { return l.member_id === m.id; });
      h += '<div class="ffl-pbox"><div class="ffl-sh">Ausgeliehen<em><a href="#" data-act="loanjump" data-id="' + m.id + '">' + (ml.length ? 'Liste' : '+ ausgeben') + '</a></em></div>' +
        (ml.length ? ml.map(function (l) { return '<div class="ffl-row" style="justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line)"><span>' + (l.qty > 1 ? l.qty + '× ' : '') + esc(l.item) + (l.size ? ' (' + esc(l.size) + ')' : '') + ' <span class="ffl-mu">seit ' + fmtDate(l.since) + '</span></span><button type="button" class="ffl-sm" data-act="loanret" data-id="' + l.id + '">Zurück</button></div>'; }).join('')
          : '<p class="ffl-mu" style="margin:0">Nichts ausgeliehen.</p>') + '</div>'; }
    var has = {}; (p.trait_ids || []).forEach(function (id) { has[id] = 1; });
    h += '<div class="ffl-pbox"><div class="ffl-sh">Merkmale & Fähigkeiten<em><a href="#" data-act="golists">Listen bearbeiten</a></em></div><div data-row="mtraits" data-id="' + m.id + '">' +
      '<div class="ffl-form2"><div><label class="ffl-fl">Tagsüber erreichbar (Tagesalarm)</label>' + sel(Object.keys(d.daytime_opts || {}).map(function (k) { return [k, d.daytime_opts[k]]; }), String(+m.day_available || 0), 'data-f="day_available"') + '</div>' +
      '<div><label class="ffl-fl">Hauptberuflich bei Feuerwehr/RD?</label>' + sel(Object.keys(d.employment_opts).map(function (k) { return [k, d.employment_opts[k]]; }), m.employment, 'data-f="employment"') + '</div></div>' +
      Object.keys(d.trait_cats).map(function (cat) {
        var ts = d.traits.filter(function (t) { return t.cat === cat; });
        return ts.length ? '<div class="ffl-fl">' + esc(d.trait_cats[cat]) + '</div><div class="ffl-chips">' + ts.map(function (t) {
          return '<label class="ffl-toggle-chip' + (has[t.id] ? ' on' : '') + '"><input type="checkbox" data-trait="' + t.id + '"' + (has[t.id] ? ' checked' : '') + '>' + esc(t.name) + '</label>';
        }).join('') + '</div>' : '';
      }).join('') +
      '<div class="ffl-fl">Notiz (intern)</div><textarea data-f="note" rows="2" style="min-height:60px" placeholder="z. B. Schichtdienst, nur abends verfügbar">' + esc(m.note) + '</textarea></div></div>';

    // Atemschutz (bearbeitbar direkt im Profil)
    if (d.can_agt) {
      var i = agtInfo(m);
      h += '<div class="ffl-pbox"><div class="ffl-sh">Atemschutz<em><a href="#" data-act="agtjump">Übersicht aller AGT</a></em></div><div class="ffl-row">' +
        '<label class="ffl-check"><input type="checkbox" data-agt="' + m.id + '"' + (m.agt ? ' checked' : '') + '> Atemschutzgeräteträger</label>' +
        (m.agt ? '<div><label class="ffl-fl" style="margin-top:0">G26 gültig bis</label><input type="date" data-g26="' + m.id + '" value="' + esc(m.g26_until || '') + '" style="width:auto"></div>' +
          '<div class="ffl-mu">Übungsstrecke zuletzt: <b style="color:var(--ink)">' + (i.strecke ? fmtDate(i.strecke.date) : 'nie') + '</b>' + (i.due ? ' · fällig ' + fmtDate(i.due) : '') + (i.planned ? ' · geplant ' + fmtDate(i.planned.date) : '') + '</div>' : '') + '</div>' +
        (p.agt_log.length ? '<details style="margin-top:8px"><summary class="ffl-mu" style="cursor:pointer">Verlauf (' + p.agt_log.length + ')</summary>' + p.agt_log.map(function (l) {
          return '<div class="ffl-mu">' + fmtDate(l.date) + ' · ' + esc(d.agt_kinds[l.kind]) + (l.note ? ' · ' + esc(l.note) : '') + '</div>'; }).join('') + '</details>' : '') + '</div>';
    }

    // Größen
    h += '<div class="ffl-pbox"><div class="ffl-sh">Größen <em>pflegt das Mitglied auch selbst · <a href="#" data-act="gocatalog">Felder bearbeiten</a></em></div><div class="ffl-sizes" data-row="msizes" data-id="' + m.id + '">' +
      Object.keys(d.size_keys).map(function (k) {
        return '<div><label class="ffl-fl">' + esc(d.size_keys[k]) + '</label><input type="text" data-size="' + k + '" value="' + esc(m.sizes[k] || '') + '"></div>';
      }).join('') + '</div></div>';

    // Ausbildung
    var done = p.needs.filter(function (n) { return n.status === 'completed'; });
    h += '<div class="ffl-pbox"><div class="ffl-sh">Ausbildung<em>' + (done.length + p.quals.length) + ((done.length + p.quals.length) === 1 ? ' Lehrgang' : ' Lehrgänge') + '</em></div><div class="ffl-scroll"><table class="ffl-table"><thead><tr><th>Jahr</th><th>Lehrgang</th><th>Termin / Datum</th><th>Quelle</th><th></th></tr></thead><tbody>';
    done.forEach(function (n) { h += '<tr><td>' + n.year + '</td><td><b>' + esc(n.short) + '</b> ' + esc(n.title) + '</td><td>' + esc(range(n)) + (n.location ? ' · ' + esc(n.location) : '') + '</td><td class="ffl-mu">' + APP + '</td><td></td></tr>'; });
    p.quals.forEach(function (q) { h += '<tr><td>' + (q.year || '–') + '</td><td><b>' + esc(q.short) + '</b> ' + esc(q.title) + '</td><td>' + esc(q.date ? fmtDate(q.date) : '') + (q.note ? ' · ' + esc(q.note) : '') + '</td><td class="ffl-mu">nachgetragen</td>' +
      '<td><button type="button" class="ffl-q ffl-sm" data-act="delqual" data-id="' + q.id + '">✕</button></td></tr>'; });
    if (!done.length && !p.quals.length) h += '<tr><td colspan="5" class="ffl-mu">Noch nichts eingetragen.</td></tr>';
    h += '</tbody></table></div>';
    // Früheren Lehrgang nachtragen: aus den bekannten Bezeichnungen suchen – Titel und Kürzel einheitlich (z. B. zählt „AGT“ für den Atemschutz)
    MYFUI.courseTitles = d.course_titles || [];
    h += '<div class="ffl-row" style="margin-top:8px">' + MYFUI.coursePick('ffl-qtitle', 'Früheren Lehrgang nachtragen – suchen, z. B. „atem“ oder „TM“') +
      '<input type="number" id="ffl-qyear" placeholder="Jahr" style="width:100px"><input type="date" id="ffl-qdate" style="width:auto">' +
      '<button type="button" class="ffl-p" data-act="addqual" data-id="' + m.id + '">Nachtragen</button></div>';
    var other = p.needs.filter(function (n) { return n.status !== 'completed'; });
    if (other.length) h += '<div class="ffl-fl">Lehrgangsmeldungen</div><div class="ffl-scroll"><table class="ffl-table"><tbody>' + other.map(function (n) {
      return '<tr><td style="width:60px">' + n.year + '</td><td><b>' + esc(n.short) + '</b> ' + esc(n.title) + '</td><td>' + chip(n.status) + '</td><td class="ffl-mu">' + esc(n.comment) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
    h += '</div>';

    // Ausstattung (aktuell + Verlauf)
    var items = by(d.cloth_items, 'id'), cur = p.stock.filter(function (x) { return x.status === 'in_use'; }), hist = p.stock.filter(function (x) { return x.status !== 'in_use'; });
    function stockRow(x) {
      var it = items[x.item_id];
      return '<tr data-row="stock" data-id="' + x.id + '"' + (x.status === 'in_use' ? '' : ' class="is-off"') + '><td><b>' + esc(x.item_name) + '</b>' + (it && !it.procurable ? '<br><span class="ffl-chip st-no">nicht mehr beschaffbar</span>' : '') + '</td>' +
        '<td><input type="text" data-f="size" value="' + esc(x.size) + '" style="width:80px"></td><td><input type="number" data-f="qty" value="' + x.qty + '" style="width:60px"></td>' +
        '<td><input type="date" data-f="issued" value="' + esc(x.issued || '') + '"></td><td><input type="text" data-f="serial" value="' + esc(x.serial) + '" placeholder="Nr." style="width:110px"></td>' +
        '<td><input type="number" data-f="made_year" value="' + (x.made_year || '') + '" placeholder="Jahr" style="width:80px"></td>' +
        '<td>' + sel(Object.keys(d.stock_status).map(function (k) { return [k, d.stock_status[k]]; }), x.status, 'data-f="status"') + (x.status_date ? '<div class="ffl-mu" style="font-size:13px">seit ' + fmtDate(x.status_date) + '</div>' : '') + '</td>' +
        '<td><input type="text" data-f="note" value="' + esc(x.note) + '" placeholder="Notiz"></td>' +
        '<td><button type="button" class="ffl-q ffl-sm" data-act="delstock" data-id="' + x.id + '" title="Eintrag löschen (nur bei Fehleingabe)">✕</button></td></tr>';
    }
    h += '<div class="ffl-pbox"><div class="ffl-sh">Ausstattung<em>' + cur.length + ' Teile im Gebrauch</em></div>' +
      '<div class="ffl-scroll"><table class="ffl-table ffl-wide"><thead><tr><th>Teil</th><th>Größe</th><th>Anz.</th><th>ausgegeben</th><th>Inventar-/Serien-Nr.</th><th>Baujahr</th><th>Status</th><th>Notiz</th><th></th></tr></thead><tbody>' +
      (cur.length ? cur.map(stockRow).join('') : '<tr><td colspan="9" class="ffl-mu">Noch nichts eingetragen.</td></tr>') + '</tbody></table></div>' +
      (hist.length ? '<details style="margin-top:8px"><summary class="ffl-mu" style="cursor:pointer">Verlauf: ' + hist.length + ' zurückgegebene / ausgesonderte Teile</summary><div class="ffl-scroll"><table class="ffl-table ffl-wide"><tbody>' + hist.map(stockRow).join('') + '</tbody></table></div></details>' : '') +
      '<div class="ffl-row" style="margin-top:10px"><select id="ffl-stitem" style="width:auto;min-width:240px"><option value="">Teil ausgeben / nachtragen …</option>' + catalogOptions(false) + '</select>' +
      '<input type="text" id="ffl-ssize" placeholder="Größe" style="width:90px"><input type="number" id="ffl-sqty" value="1" min="1" style="width:70px">' +
      '<input type="date" id="ffl-sissued" value="' + isoToday() + '" style="width:auto"><input type="text" id="ffl-sserial" placeholder="Nr. (optional)" style="width:120px">' +
      '<input type="number" id="ffl-smade" placeholder="Baujahr" style="width:90px">' +
      '<button type="button" class="ffl-p" data-act="addstock" data-id="' + m.id + '">Eintragen</button></div>' +
      '<p class="ffl-mu">Beim Auswählen eines Teils wird die Größe aus den Größen des Mitglieds vorgeschlagen. Ältere Teile mit dem damaligen Ausgabedatum nachtragen.</p>';
    if (p.clothing.length) h += '<div class="ffl-fl">Kleidermeldungen</div><div class="ffl-scroll"><table class="ffl-table"><tbody>' + p.clothing.map(function (c) {
      return '<tr><td style="width:100px">' + fmtDate(c.created) + '</td><td>' + esc(d.clothing_kinds[c.kind] || '') + '</td><td><b>' + esc(c.item) + '</b> ' + esc(c.size) + (c.qty > 1 ? ' × ' + c.qty : '') + '</td><td>' + CSTATUS[c.status] + '</td></tr>';
    }).join('') + '</tbody></table></div>';
    h += '</div>';

    // Mängel und Anregungen dieser Person
    var defs = d.defects.filter(function (x) { return x.member_id === m.id; });
    h += '<div class="ffl-grid2"><div class="ffl-pbox"><div class="ffl-sh">Gemeldete Mängel</div>' + (defs.length ? defs.map(function (x) {
      return '<div class="ffl-ev"><div class="ffl-day">' + fmtDate(x.created).slice(0, 6) + '</div><div style="flex:1"><b>' + esc(x.object) + ': ' + esc(x.title) + '</b><div class="ffl-mu">' + esc(d.defect_status[x.status]) + '</div></div></div>';
    }).join('') : '<p class="ffl-mu">Keine.</p>') + '</div>';
    h += '<div class="ffl-pbox"><div class="ffl-sh">Anregungen mit Namen</div>' + (p.ideas.length ? p.ideas.map(function (i) {
      return '<div class="ffl-ev"><div class="ffl-day">' + fmtDate(i.created).slice(0, 6) + '</div><div style="flex:1"><b>' + esc(i.subject || 'Anregung') + '</b><div class="ffl-mu">' + ISTATUS[i.status] + '</div></div></div>';
    }).join('') : '<p class="ffl-mu">Keine. (Anonyme Anregungen werden keiner Person zugeordnet.)</p>') + '</div></div>';

    h += '<div class="ffl-sec" style="border-top:1px solid var(--line);padding-top:14px"><button type="button" class="ffl-q" style="color:var(--red-tx);padding:0" data-act="delmember" data-id="' + m.id + '">Mitglied endgültig löschen</button>' +
      '<span class="ffl-mu"> – besser „aktiv“ abwählen, dann bleibt der Ausbildungsnachweis erhalten.</span></div>';
    return h;
  }

  // Ausbildungsnachweis: kompakt auf eine Seite (A4 hoch)
  function profilePrint() {
    var p = ui.prof, m = p.member, nm = splitName(m.name);
    var rows = p.needs.filter(function (n) { return n.status === 'completed'; }).map(function (n) { return [n.year, n.short, n.title, range(n), n.location]; })
      .concat(p.quals.map(function (q) { return [q.year || '', q.short, q.title, q.date ? fmtDate(q.date) : '', q.note]; }))
      .sort(function (a, b) { return (b[0] || 0) - (a[0] || 0); });
    var has = {}; (p.trait_ids || []).forEach(function (id) { has[id] = 1; });
    var tr = Object.keys(d.trait_cats).map(function (cat) {
      var n = d.traits.filter(function (t) { return t.cat === cat && has[t.id]; }).map(function (t) { return t.name; });
      return n.length ? '<tr><th style="width:28%">' + esc(d.trait_cats[cat]) + '</th><td>' + esc(n.join(', ')) + '</td></tr>' : '';
    }).join('');
    return '<div class="pr-nachweis">' + printHead('Ausbildungsnachweis') +
      '<table class="pr-kv"><tr><th style="width:28%">Name</th><td><b>' + esc(nm.last + (nm.first ? ', ' + nm.first : '')) + '</b></td></tr>' +
      '<tr><th>Einheit</th><td>' + esc(unitName(m.unit)) + '</td></tr>' + tr + '</table>' +
      '<h2>Lehrgänge und Ausbildungen (' + rows.length + ')</h2>' +
      (rows.length ? '<table><thead><tr><th style="width:9%">Jahr</th><th style="width:13%">Kurz</th><th>Lehrgang</th><th style="width:20%">Termin</th><th style="width:18%">Ort / Bemerkung</th></tr></thead><tbody>' +
        rows.map(function (r) { return '<tr>' + r.map(function (x, i) { return '<td>' + (i === 2 ? '<b>' + esc(x) + '</b>' : esc(x)) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>' : '<p>Noch keine Lehrgänge eingetragen.</p>') +
      '<div class="pr-sign"><div>Ort, Datum</div><div>Unterschrift Wehrführung / Zugführung</div></div>' +
      '<div class="pr-foot">Erstellt mit ' + APP + ' am ' + today() + '</div></div>';
  }

  // ---- Bereiche: welche Reiter darf wer sehen ------------------------------------
  var TAB_AREA = { briefings: 'members', site: 'full', overview: 'any', courses: 'courses', members: 'members', incidents: 'incidents', clothing: 'clothing', defects: 'defects', ideas: 'ideas',
    agt: 'agt', screen: 'screen', vehicles: 'vehicles', duties: 'duties', dutylists: 'duties', uebungen: 'incidents', board: 'board', orders: 'orders', messages: 'any', data: 'any', settings: 'full', rights: 'full', security: 'full', start: 'full', audit: 'full' };
  function allowedTab(t) {
    if (t === 'mail') return !!d.smtp; // nur Administratoren (Server schickt die Daten sonst gar nicht)
    var a = TAB_AREA[t] || 'full';
    if (t === 'teams') return d.full || (d.team_areas || []).length > 0;
    if (t === 'agt' && !d.full) return (d.areas || []).indexOf('agt') >= 0 || (d.areas || []).indexOf('strecke') >= 0 || !!d.asu_can || !!d.loan_can;
    if (d.full) return a !== 'agt' || d.can_agt || !!d.asu_can || !!d.loan_can;
    if (a === 'any') return true;
    if (a === 'full') return false;
    return (d.areas || []).indexOf(a) >= 0;
  }

  // ---- Nachrichten („Bescheid geben“ aus dem Mitgliederbereich) -----------------
  var MSTAT = { open: ['offen', 'st-warn'], done: ['erledigt', 'st-ok'], archived: ['archiviert', 'st-no'] };
  function tabMessages() {
    var mem = by(d.members, 'id'), f = ui.mFilter || 'open';
    var list = (d.messages || []).filter(function (m) { return f === 'all' || m.status === f; });
    var h = '<div class="ffl-bar"><span class="ffl-mu">Rückfragen und Korrekturen, die Mitglieder per „Bescheid geben“ an deine Bereiche geschickt haben.</span><span style="flex:1"></span>' +
      sel([['open', 'offen'], ['done', 'erledigt'], ['archived', 'archiviert'], ['all', 'alle']], f, 'id="ffl-mfilter" style="width:auto"') + '</div>';
    if (!list.length) h += '<p class="ffl-mu" style="margin-top:14px">Keine Nachrichten in dieser Ansicht.</p>';
    var L = MYFUI.lt(ui, 'msgs', list, { noun: 'Rückfragen', ph: 'Name, Thema, Text …', per: 15,
      text: function (m) { var w = mem[m.member_id]; return [w ? w.name : '', m.about, m.text, (d.area_labels || {})[m.area] || m.area].join(' '); },
      sorts: [['offen', 'offene zuerst', function (m) { return (m.status === 'open' ? '0' : '1') + '|' + (9e12 - Date.parse(String(m.created).replace(' ', 'T'))); }, 1], ['new', 'neueste zuerst', function (m) { return m.created; }, -1], ['old', 'älteste zuerst', function (m) { return m.created; }, 1]] });
    if (list.length > 5) h += L.bar;
    L.rows.forEach(function (m) {
      var who = mem[m.member_id];
      h += '<div class="ffl-idea" data-row="message" data-id="' + m.id + '"><div class="ffl-row" style="justify-content:space-between"><div class="ffl-chips">' +
        '<span class="ffl-chip st-done">' + esc((d.area_labels || {})[m.area] || m.area) + '</span><span class="ffl-chip ' + MSTAT[m.status][1] + '">' + MSTAT[m.status][0] + '</span></div>' +
        '<span class="ffl-mu">' + fmtDate(m.created) + ' · ' + (who ? '<a href="#" data-act="profile" data-id="' + who.id + '">' + esc(who.name) + '</a>' : '–') + '</span></div>' +
        (m.about ? '<b style="display:block;margin-top:6px">' + esc(m.about) + '</b>' : '') + '<div class="ffl-pre-line" style="margin-top:4px">' + esc(m.text) + '</div>' +
        // „Ausbildung nachtragen“ aus dem Mitgliederbereich: mit einem Klick in die Ausbildung übernehmen
        (/^Ausbildung nachtragen: /.test(m.about || '') && m.status === 'open' && allowedTab('courses') ? '<div class="ffl-row" style="margin-top:8px"><button type="button" class="ffl-sm ffl-p" data-act="msgqual" data-id="' + m.id + '">In Ausbildung eintragen</button><span class="ffl-mu">trägt den Lehrgang im Profil ein und beantwortet die Anfrage</span></div>' : '') +
        '<label class="ffl-fl">Antwort (geht als Benachrichtigung an ' + esc(who ? who.name.split(',')[1] || who.name : 'die Person') + ')</label><textarea data-f="answer" rows="2" style="min-height:60px">' + esc(m.answer) + '</textarea>' +
        '<div class="ffl-row" style="margin-top:6px"><button type="button" class="ffl-p ffl-sm" data-act="msgsave" data-id="' + m.id + '">Antworten & erledigt</button>' +
        (m.status !== 'archived' ? '<button type="button" class="ffl-sm" data-act="msgstat" data-v="archived" data-id="' + m.id + '">Archivieren</button>' : '<button type="button" class="ffl-sm" data-act="msgstat" data-v="open" data-id="' + m.id + '">Wieder öffnen</button>') +
        '<button type="button" class="ffl-q ffl-sm" style="color:var(--red-tx);margin-left:auto" data-act="msgdel" data-id="' + m.id + '">Löschen</button></div>' +
        (m.answered_by ? '<p class="ffl-mu" style="margin:6px 0 0">Beantwortet von ' + esc(m.answered_by) + ' am ' + fmtDate(m.answered) + '</p>' : '') + '</div>';
    });
    h += L.pager;
    return h;
  }

  // ---- Einstellungen (nur Verwaltung): Name, Logo, Organisation ------------------
  function tabSettings() {
    var b = d.brand || {};
    function f(k, label, ph) { return '<div><label class="ffl-fl">' + label + '</label><input type="text" data-brand="' + k + '" value="' + esc(b[k] || '') + '" placeholder="' + esc(ph || '') + '"></div>'; }
    return '<div class="ffl-grid2" style="margin-top:14px"><div class="ffl-pbox"><div class="ffl-sh">Name & Organisation</div><div class="ffl-form2">' +
      f('app', 'Name der App', 'Wehrwerk') + f('org', 'Organisation', 'Freiwillige Feuerwehr Musterstadt') + f('zip', 'PLZ', '12345') + f('place', 'Ort', 'Musterstadt') + '</div>' +
      '<div class="ffl-form2">' + f('address', 'Anschrift Gerätehaus', 'Musterstraße 1') + f('phone', 'Telefon (für Briefkopf und Vorlagen)', '') + f('email', 'E-Mail (für Briefkopf und Vorlagen)', '') + f('website', 'Website (für „Neu auf …“)', 'feuerwehr-musterstadt.de') + f('qr_label', 'Beschriftung an QR-Codes', 'Meine Feuerwehr') + '</div>' +
      '<p class="ffl-mu">Der Name erscheint in Menü, E-Mails, Kalender und Ausdrucken. Organisation, PLZ und Ort stehen z. B. auf der Arbeitgeber-Bescheinigung.</p></div>' +
      '<div class="ffl-pbox"><div class="ffl-sh">Logo</div><div class="ffl-form2">' + f('line1', 'Zeile 1 (klein – leer lassen: Zeile 2 und Ort groß nebeneinander)', 'FREIWILLIGE') + f('line2', 'Zeile 2 (groß)', 'FEUERWEHR') +
      f('line3', 'Rotes Feld rechts', 'MUSTERSTADT') + '<div><label class="ffl-fl">Farbe des Feldes</label><input type="color" data-brand="color" value="' + esc(b.color || '#e30620') + '" style="height:44px;padding:2px"></div></div>' +
      '<div class="ffl-logoprev"><div><img src="' + esc(MYF.logo) + '" alt=""></div><div class="dark"><img src="' + esc(MYF.logoDark || MYF.logo) + '" alt=""></div></div>' +
      '<p class="ffl-mu">Vorschau nach dem Speichern. Statt des Text-Logos geht auch ein eigenes Bild (PNG/JPG, wird für hell und dunkel genutzt):</p>' +
      '<div class="ffl-row"><input type="file" id="ffl-logofile" accept="image/png,image/jpeg,image/webp">' + (b.logo_custom ? '<button type="button" class="ffl-q ffl-sm" data-act="logoreset">Eigenes Logo entfernen</button>' : '') + '</div></div></div>' +
      // Kontakte, die Mitglieder und Ausdrucke brauchen: Betriebsarzt (G26) und Stelle bei der Gemeinde (Verdienstausfall)
      (function () {
        var g = (d.settings || {}).g26_doctor || {}, o = (d.settings || {}).cert_office || {};
        function gf(k, label, ph, span) { return '<div' + (span ? ' class="span2"' : '') + '><label class="ffl-fl">' + label + '</label><input type="text" data-g26d="' + k + '" value="' + esc(g[k] || '') + '" placeholder="' + esc(ph || '') + '"></div>'; }
        function of(k, label, ph, span) { return '<div' + (span ? ' class="span2"' : '') + '><label class="ffl-fl">' + label + '</label><input type="text" data-cvo="' + k + '" value="' + esc(o[k] || '') + '" placeholder="' + esc(ph || '') + '"></div>'; }
        return '<div class="ffl-grid2" style="margin-top:14px"><div class="ffl-pbox"><div class="ffl-sh">Betriebsarzt<em>G26-Untersuchung</em></div><div class="ffl-form2">' + gf('name', 'Praxis / Arzt', 'z. B. Arbeitsmedizin Musterpraxis') + gf('phone', 'Telefon', '02565 …') +
          gf('address', 'Anschrift', 'Straße 1, 12345 Ort') + gf('url', 'Website', 'https://…') + gf('note', 'Hinweis für Mitglieder', 'z. B. Termin über die Atemschutz-Verwaltung', true) + '</div>' +
          '<p class="ffl-mu">Erscheint bei „G26 läuft ab“ (Startseite, Benachrichtigung) und unter Atemschutz – mit Telefon und Website zum Antippen.</p></div>' +
          '<div class="ffl-pbox"><div class="ffl-sh">Gemeinde<em>Verdienstausfall</em></div><div class="ffl-form2">' + of('name', 'Gemeinde / Stelle', 'z. B. Gemeinde Musterstadt') + of('dept', 'Fachbereich', 'z. B. Bürgerservice und Soziales') +
          of('az', 'Aktenzeichen', 'z. B. 1/131.242') + of('note', 'Hinweis (intern)', 'z. B. Abgabe im Rathaus, Zimmer 12') + '</div>' +
          '<p class="ffl-mu">Steht in der „Verfügung“ jeder Bescheinigung (Vordruck der Gemeinde) und im Hinweis an Mitglieder und Arbeitgeber, wo die Erstattung beantragt wird.</p></div></div>';
      })() +
      maintBox() +
      '<div class="ffl-grid2" style="margin-top:14px"><div class="ffl-pbox"><div class="ffl-sh">Einheiten<em>Löschzüge / Löschgruppen</em></div>' + unitsEditor() +
      '<p class="ffl-mu">Umbenennen geht jederzeit. Eine Einheit mit Mitgliedern kann erst entfernt werden, wenn die Mitglieder umgesetzt sind.</p></div>' +
      '<div class="ffl-pbox"><div class="ffl-sh">Quellen & Lizenzen</div>' + creditsHtml() + '</div></div>' +
      '<div class="ffl-savebar" id="ffl-setbar"' + (ui.setDirty ? '' : ' hidden') + '><span>Ungespeicherte Änderungen auf dieser Seite</span><button type="button" class="ffl-q" data-act="setdiscard">Verwerfen</button><button type="button" class="ffl-p" data-act="setsave">Speichern</button></div>';
  }
  // Wartungsseite bei Updates (wp-content/maintenance.php): Texte hier, Name/Logo/Anschrift/Website aus „Name & Organisation“
  // E-Mail-Versand: Postfach per SMTP (Passwort wird nie angezeigt), Testmail zeigt die Antwort des Mailservers
  function tabMail() {
    return smtpBox() + '<div class="ffl-savebar" id="ffl-mailbar"' + (ui.mailDirty ? '' : ' hidden') + '><span>Ungespeicherte Änderungen</span><button type="button" class="ffl-q" data-act="smtpdiscard">Verwerfen</button><button type="button" class="ffl-p" data-act="smtpsave">Speichern</button></div>';
  }
  function mailTouched(e) {
    if (!e.target.hasAttribute || !e.target.hasAttribute('data-smtp')) return;
    ui.mailDirty = true; var bar = document.getElementById('ffl-mailbar'); if (bar) bar.hidden = false;
  }
  root.addEventListener('input', mailTouched); root.addEventListener('change', mailTouched);
  function smtpBox() {
    var m = d.smtp; if (!m) return '';
    function f(k, label, type, ph, extra) { return '<div><label class="ffl-fl" for="ffl-smtp-' + k + '">' + label + '</label><input type="' + type + '" id="ffl-smtp-' + k + '" data-smtp="' + k + '" value="' + esc(m[k] == null ? '' : m[k]) + '" placeholder="' + esc(ph || '') + '"' + (extra || '') + '></div>'; }
    var state = m.can_send ? (m.tested ? (m.tested_ok ? '<div class="ffl-msg ok">✓ Versand über das Postfach aktiv – letzte Testmail am ' + esc(fmtDT(m.tested)) + ' vom Mailserver angenommen.</div>' : '<div class="ffl-msg err">Letzte Testmail am ' + esc(fmtDT(m.tested)) + ' fehlgeschlagen.</div>') : '<div class="ffl-msg warn">Versand über das Postfach ist an, aber noch nicht getestet. Bitte Testmail senden.</div>')
      : '<div class="ffl-msg warn">Mails gehen über den Webserver und können beim Empfänger im Spam landen oder abgelehnt werden. Zuverlässiger: unten ein Postfach eintragen.</div>';
    return '<div class="ffl-pbox" style="margin-top:14px"><div class="ffl-sh">E-Mail-Versand<em>gilt für alle Mails der Website</em></div>' + state +
      '<label class="ffl-check" style="margin:10px 0"><input type="checkbox" data-smtp="on"' + (m.on ? ' checked' : '') + '> Mails über dieses Postfach senden (SMTP)</label>' +
      '<div class="ffl-form2">' + f('host', 'Server', 'text', 'z. B. smtps.udag.de', ' autocomplete="off"') +
      '<div><label class="ffl-fl" for="ffl-smtp-mode">Verschlüsselung und Port</label><select id="ffl-smtp-mode" data-smtp="mode"><option value="ssl:465"' + (m.secure !== 'tls' ? ' selected' : '') + '>SSL – Port 465</option><option value="tls:587"' + (m.secure === 'tls' ? ' selected' : '') + '>STARTTLS – Port 587</option></select></div>' +
      f('user', 'Benutzername', 'text', 'meist die E-Mail-Adresse', ' autocomplete="off"') +
      '<div><label class="ffl-fl" for="ffl-smtp-pass">Passwort</label><input type="password" id="ffl-smtp-pass" data-smtp="pass" autocomplete="new-password" placeholder="' + (m.pass_set ? 'gespeichert – leer lassen zum Behalten' : 'Passwort des Postfachs') + '"></div>' +
      f('from', 'Absender-Adresse', 'email', 'das Postfach selbst, z. B. wehrwerk@feuerwehr-musterstadt.example') + f('name', 'Absender-Name', 'text', (d.brand || {}).org || '') + '</div>' +
      '<p class="ffl-mu">Das Passwort wird verschlüsselt gespeichert, nie angezeigt und nicht protokolliert. Es gehört nicht in Sicherungen oder Exporte.</p>' +
      '<div class="ffl-row"><input type="email" id="ffl-smtp-to" aria-label="Empfänger der Testmail" placeholder="' + esc((d.who && d.who.email) || 'Empfänger der Testmail') + '" style="flex:1 1 220px;width:auto"><button type="button" data-act="smtptest">Testmail senden</button></div>' +
      '<p class="ffl-mu" style="margin:6px 0 0">Erst speichern, dann testen. Ohne Eingabe geht die Testmail an dein eigenes Konto.</p><div id="ffl-smtp-res">' + (ui.smtpRes || '') + '</div></div>';
  }
  function maintBox() {
    var m = d.maint; if (!m) return '';
    function ck(k, label) { return '<label class="ffl-check"><input type="checkbox" data-mnt="' + k + '"' + (m[k] ? ' checked' : '') + '> ' + label + '</label>'; }
    var stx = m.foreign ? '<div class="ffl-msg warn">In wp-content liegt schon eine andere maintenance.php (z. B. von einem anderen Plugin) – die wird nicht überschrieben.</div>'
      : !m.writable ? '<div class="ffl-msg warn">Der Ordner wp-content ist nicht beschreibbar – die Wartungsseite kann nicht angelegt werden (beim Hoster Schreibrechte prüfen).</div>'
      : '<p class="ffl-mu" style="margin:0">' + (m.on ? (m.file ? '✓ Aktiv – erscheint automatisch, während WordPress, Plugins oder Wehrwerk aktualisiert werden.' : 'Wird beim Speichern angelegt.') : 'Aus – bei Updates erscheint die englische Standardmeldung von WordPress.') + '</p>';
    return '<div class="ffl-pbox" style="margin-top:14px"><div class="ffl-sh">Wartungsseite<em>während Updates</em></div>' + stx +
      '<div class="ffl-row" style="margin:10px 0">' + ck('on', 'Eigene Wartungsseite verwenden') + ck('sos', 'Notruf 112 / Polizei 110 groß anzeigen') + ck('members', 'Hinweis für Mitglieder (Halle, Dashboards)') + '</div>' +
      '<div class="ffl-form2"><div class="span2"><label class="ffl-fl">Überschrift</label><input type="text" data-mnt="title" value="' + esc(m.title) + '"></div>' +
      '<div class="span2"><label class="ffl-fl">Text</label><textarea data-mnt="text" rows="2">' + esc(m.text) + '</textarea></div>' +
      '<div class="span2"><label class="ffl-fl">Zusätzlicher Hinweis (optional)</label><textarea data-mnt="note" rows="2" placeholder="z. B. Bürgertelefon der Gemeinde, Hinweis auf Social Media …">' + esc(m.note) + '</textarea></div></div>' +
      '<p class="ffl-mu">Name, Logo, Farbe, Anschrift des Gerätehauses und Website kommen automatisch aus „Name & Organisation“ und „Logo“. Die Seite lädt sich selbst neu, sobald die Website wieder da ist. ' +
      '<a href="' + esc(m.preview) + '" target="_blank" rel="noopener">Vorschau öffnen ↗</a></p></div>';
  }
  function tabRights() { return '<p class="ffl-mu" style="margin-top:14px">Wer welche Funktion hat und was daraus an Rechten und Verwaltungsbereichen folgt.</p>' + membersLists(); }
  function tabSecurity() { return securityBox(); }
  function securityBox() {
    var sc = d.security;
    if (!sc) return twofaBox();
    var bad = sc.checks.filter(function (c) { return !c.ok; }).length;
    return '<div class="ffl-pbox" id="ffl-seccheck" style="margin-top:14px"><div class="ffl-sh">Sicherheits-Check<em>' + (bad ? bad + ' Empfehlungen offen' : 'alles erledigt') + '</em></div>' +
      '<div class="ffl-checks">' + sc.checks.map(function (c) {
        return '<div class="ffl-checkrow ' + (c.ok ? 'ok' : 'todo') + '"><i>' + (c.ok ? '✓' : '!') + '</i><div><b>' + esc(c.title) + '</b>' + (c.ok ? '' : '<span>' + esc(c.fix) + '</span>') + '</div></div>';
      }).join('') + '</div><div class="ffl-row" style="margin-top:10px">' +
      '<label class="ffl-switch"><input type="checkbox" data-sec="sec_hide_users"' + (sc.hide_users ? ' checked' : '') + '><span></span>Benutzernamen nicht öffentlich abrufbar</label>' +
      '<label class="ffl-switch"><input type="checkbox" data-sec="sec_xmlrpc_off"' + (sc.xmlrpc_off ? ' checked' : '') + '><span></span>XML-RPC abschalten</label>' +
      '<label class="ffl-switch"><input type="checkbox" data-sec="sec_2fa_admin"' + (sc.twofa_admin ? ' checked' : '') + '><span></span>Zwei-Faktor Pflicht für Verwaltungskonten</label></div>' +
      '<p class="ffl-mu">Immer aktiv: Sperre nach Fehlversuchen (je Konto, je Anschluss), Sicherheits-Header, Suchmaschinen-Sperre für alle internen Seiten, Bereichs-Rechte auf dem Server, App-Passwörter nur für Administratoren. ' +
      'Notausgang bei verlorenem Handy ohne Notfall-Code: in der wp-config.php <code>define(\'MYF_2FA_OFF\', true);</code></p></div>' + twofaBox();
  }
  // Zwei-Faktor-Anmeldung für das eigene Konto einrichten (Code-App, QR-Code, Notfall-Codes)
  function twofaBox() {
    var t = d.twofa || {}, h = '<div class="ffl-pbox" style="margin-top:14px" id="ffl-2fa"><div class="ffl-sh">Anmeldung absichern<em>' + (t.on ? 'Zwei-Faktor aktiv · ' + t.left + ' Notfall-Codes übrig' : 'Zwei-Faktor aus') + '</em></div>';
    if (ui.twofaCodes) return h + '<div class="ffl-msg ok"><b>Eingerichtet.</b> Diese Notfall-Codes ausdrucken oder sicher notieren – jeder gilt einmal, falls das Handy fehlt:</div><pre class="ffl-codes">' + ui.twofaCodes.map(esc).join('\n') + '</pre><button type="button" data-act="2fadone">Erledigt</button></div>';
    if (ui.twofa) return h + '<p class="ffl-mu" style="margin-top:0">1. Code-App öffnen (z. B. Google oder Microsoft Authenticator, 1Password) und den QR-Code scannen.<br>2. Den angezeigten 6-stelligen Code hier eingeben.</p>' +
      '<div class="ffl-row" style="align-items:flex-start"><div class="ffl-qrbox">' + qrSvg(ui.twofa.uri, 4) + '</div><div style="flex:1;min-width:200px"><div class="ffl-mu">Oder Schlüssel abtippen:</div><code style="font-size:15px">' + esc(ui.twofa.secret) + '</code>' +
      '<div class="ffl-row" style="margin-top:12px"><input type="text" id="ffl-2facode" inputmode="numeric" autocomplete="one-time-code" placeholder="6-stelliger Code" style="width:160px"><button type="button" class="ffl-p" data-act="2faconfirm">Bestätigen</button><button type="button" data-act="2facancel">Abbrechen</button></div></div></div></div>';
    return h + '<p class="ffl-mu" style="margin-top:0">Zusätzlich zum Passwort ein Code aus einer App am Handy – selbst ein erratenes Passwort reicht dann nicht.' + (t.required && !t.on ? ' <b>Für Verwaltungskonten Pflicht.</b>' : '') + '</p>' +
      (t.on ? '<div class="ffl-row"><input type="text" id="ffl-2facode" inputmode="numeric" placeholder="aktueller Code" style="width:160px"><button type="button" data-act="2farec">Neue Notfall-Codes</button>' + (t.required ? '' : '<button type="button" class="ffl-q" data-act="2faoff">Abschalten</button>') + '</div>'
        : '<button type="button" class="ffl-p" data-act="2fastart">Zwei-Faktor einrichten</button>') + '</div>' + adminPasskeys();
  }
  // Passkeys fürs eigene Konto (Face ID / Touch ID / Windows Hello): zählt mit Gerätebestätigung als Zwei-Faktor
  function adminPasskeys() {
    var pk = d.passkeys || [], can = window.MYFPasskey && MYFPasskey.ok(), t = d.twofa || {};
    return '<div class="ffl-pbox" style="margin-top:14px"><div class="ffl-sh">Passkeys<em>' + (pk.length ? pk.length + ' eingerichtet' : 'keine') + (t.passkey ? ' · diese Sitzung per Passkey' : '') + '</em></div>' +
      '<p class="ffl-mu" style="margin-top:0">Anmelden ohne Passwort – mit Gesicht, Fingerabdruck oder Geräte-PIN. Mit Gerätebestätigung gilt das als Zwei-Faktor-Anmeldung, auch für Verwaltungskonten.</p>' +
      pk.map(function (p) { return '<div class="ffl-row" style="justify-content:space-between;padding:6px 0;border-top:1px solid var(--line)"><span><b>' + esc(p.name) + '</b> <span class="ffl-mu">seit ' + fmtDate(p.created) + (p.last_used ? ' · zuletzt ' + fmtDate(p.last_used) : '') + '</span></span><button type="button" class="ffl-sm ffl-q" data-act="pkdel" data-id="' + p.id + '">Entfernen</button></div>'; }).join('') +
      (can ? '<div class="ffl-row" style="margin-top:10px"><button type="button" class="ffl-p" data-act="pkadd">' + (pk.length ? '+ Passkey auf diesem Gerät' : 'Passkey einrichten') + '</button></div>' : '<p class="ffl-mu">Auf diesem Gerät/Browser nicht verfügbar (braucht https).</p>') + '</div>';
  }
  function creditsHtml() {
    return '<ul class="ffl-credits">' + (d.credits || []).map(function (c) {
      return '<li><b>' + esc(c.what) + '</b><span>' + esc(c.source) + ' · ' + esc(c.license) + ' · <a href="' + esc(c.url) + '" target="_blank" rel="noopener">' + esc(c.url.replace(/^https?:\/\//, '')) + '</a></span></li>';
    }).join('') + '</ul>';
  }
  function readFileData(input) {
    return new Promise(function (res) {
      var f = input && input.files && input.files[0];
      if (!f) return res('');
      var r = new FileReader(); r.onload = function () { res(r.result); }; r.readAsDataURL(f);
    });
  }

  function coreAdminClick(act, t, id) {
    switch (act) {
      case 'ideaarch': post('idea', { id: id, archived: t.getAttribute('data-v') === '1' }, t.getAttribute('data-v') === '1' ? 'Archiviert.' : 'Zurückgeholt.'); return true;
      case 'ideadel': if (confirm('Anregung endgültig löschen? (Archivieren behält sie.)')) post('idea/delete', { id: id }, 'Gelöscht.'); return true;
      case 'msgsave':
        var box = t.closest('[data-row="message"]');
        post('message', { id: id, answer: box.querySelector('[data-f=answer]').value, status: 'done' }, 'Antwort verschickt.'); return true;
      case 'msgqual':
        var mq = (d.messages || []).filter(function (x) { return x.id === id; })[0]; if (!mq) return true;
        var pm = /^Ausbildung nachtragen: (.+?)(?: \[(.+?)\])?(?: \((.+)\))?$/.exec(mq.about) || [], when = pm[3] || '';
        var dm = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(when), ym = /(19|20)\d{2}/.exec(when);
        api('POST', 'admin/qual', { member_id: mq.member_id, title: pm[1] || '', short: pm[2] || '', year: ym ? +ym[0] : null, date: dm ? dm[3] + '-' + ('0' + dm[2]).slice(-2) + '-' + ('0' + dm[1]).slice(-2) : '', note: mq.text && mq.text !== 'Bitte in meiner Ausbildung nachtragen.' ? mq.text.slice(0, 200) : '' })
          .then(function () { return post('message', { id: id, answer: 'Eingetragen: ' + (pm[1] || '') + (when ? ' (' + when + ')' : '') + '.', status: 'done' }, 'In der Ausbildung eingetragen und beantwortet.'); }, function (err) { flash('err', err.message); });
        return true;
      case 'msgstat': post('message', { id: id, status: t.getAttribute('data-v') }, 'Gespeichert.'); return true;
      case 'msgdel': if (confirm('Nachricht löschen?')) post('message', { id: id, 'delete': true }, 'Gelöscht.'); return true;
      case 'setsave':
        // Alles auf „Allgemein“ in einem Rutsch: Name & Logo, Betriebsarzt, Gemeinde, Einheiten
        var brand = {}, g26d = {}, cvo = {}, mnt = null, logoChanged = !!(document.getElementById('ffl-logofile') || {}).value;
        [].forEach.call(document.querySelectorAll('[data-brand]'), function (el) { brand[el.getAttribute('data-brand')] = el.value; });
        [].forEach.call(document.querySelectorAll('[data-g26d]'), function (el) { g26d[el.getAttribute('data-g26d')] = el.value; });
        [].forEach.call(document.querySelectorAll('[data-cvo]'), function (el) { cvo[el.getAttribute('data-cvo')] = el.value; });
        [].forEach.call(document.querySelectorAll('[data-mnt]'), function (el) { mnt = mnt || {}; mnt[el.getAttribute('data-mnt')] = el.type === 'checkbox' ? el.checked : el.value; });
        var brandChanged = ui.setDirtyBrand || logoChanged;
        readFileData(document.getElementById('ffl-logofile')).then(function (data) {
          if (data) brand.logo_upload = data;
          var body = { brand: brand, g26_doctor: g26d, cert_office: cvo, units: readUnits() }; if (mnt) body.maint = mnt;
          return post('settings', body, 'Gespeichert.');
        }).then(function () { ui.setDirty = ui.setDirtyBrand = false; ui.units = null; ui.cv = null; if (brandChanged) location.reload(); else render(); });
        return true;
      case 'setdiscard': ui.setDirty = ui.setDirtyBrand = false; ui.units = null; render(); return true;
      case 'logoreset': post('settings', { brand: { logo_custom: '' } }, 'Eigenes Logo entfernt.').then(function () { location.reload(); }); return true;
    }
    return false;
  }

  // ---- Einsätze & Übungen (Verwaltung) ------------------------------------------
  function dtA(v) { return v ? fmtDate(v) + (v.length >= 16 ? ' ' + v.slice(11, 16) : '') : ''; }
  // Einstellungen eines Bereichs: immer der letzte Unterreiter; mehrere Themen darin als Auswahl
  function setPills(act, cur, items) {
    return '<div class="ffl-pills" role="group" aria-label="Einstellungen">' + items.map(function (x) {
      return '<button type="button" data-act="' + act + '" data-v="' + x[0] + '" aria-pressed="' + (cur === x[0]) + '">' + x[1] + '</button>';
    }).join('') + '</div>';
  }
  // ---- Bestellkarten: Pizzerien und eigene Listen. Die Runden selbst laufen nur bei den Mitgliedern. ----------
  function eur(c) { return (c / 100).toFixed(2).replace('.', ',') + ' €'; }
  // Vorlagen & Logos: Ist das Logo geändert, erzeugt dieser Browser die PNG-Fassung für die Vorlagen
  function tabCd() {
    var c = d.cd;
    if (c.needs_logo && !ui.cdSync) {
      ui.cdSync = true;
      MYFCD.syncLogo(c, function (b) { return post('cd/logo', b, 'Logo für die Vorlagen übernommen.'); }).catch(function () { ui.cdErr = true; render(); });
    }
    return (ui.cdErr ? '<div class="ffl-msg err" style="margin-top:14px">Das Logo konnte in diesem Browser nicht umgewandelt werden. Bitte ein anderes Logo hochladen oder einen anderen Browser nehmen.</div>' : '') +
      (c.can_zip ? '' : '<div class="ffl-msg err" style="margin-top:14px">Auf dem Server fehlt die PHP-Erweiterung ZipArchive. Bitte beim Hoster einschalten lassen.</div>') +
      (c.missing.length ? '<div class="ffl-msg warn" style="margin-top:14px">Für den Briefkopf fehlt noch: ' + esc(c.missing.join(', ')) + '. Einzutragen unter „Organisation“.</div>' : '') + MYFCD.html(c);
  }
  function tabOrders() {
    var props = (d.order_menus || []).filter(function (m) { return m.status === 'pending'; });
    return (props.length ? '<div class="ffl-sec"><div class="ffl-sh">Karten-Vorschläge' + (d.order_can_approve ? '<em>erst nach Freigabe für alle sichtbar</em>' : '<em>warten auf die LZ-Leitung</em>') + '</div><div class="ffl-todos">' + props.map(function (m) {
      return '<div class="ffl-todo is-wait"><div class="ffl-day">' + m.items.length + '</div><div class="ffl-ct"><b>' + esc(m.name) + '</b>' + (m.phone ? ' · ' + esc(m.phone) : '') + '<div class="ffl-mu">' + m.items.slice(0, 40).map(function (x) { return esc(x.name) + ' ' + eur(x.cents); }).join(', ') + '</div></div>' +
        (d.order_can_approve ? '<div class="ffl-row" style="gap:6px"><button type="button" class="ffl-sm ffl-p" data-act="omok" data-id="' + m.id + '">Freigeben</button><button type="button" class="ffl-sm" data-act="omno" data-id="' + m.id + '">Ablehnen</button></div>' : '') + '</div>';
    }).join('') + '</div></div>' : '') + orderMenus();
  }
  function orderMenus() {
    var ms = (d.order_menus || []).filter(function (m) { return m.status === 'approved'; }), ed = ui.orEdit;
    var cur = ed === 'new' ? { id: 0, name: '', kind: 'pizzeria', phone: '', link: '', note: '', items: [] } : ms.filter(function (m) { return m.id === ed; })[0];
    var h = '<p class="ffl-mu" style="margin-top:14px">Hinterlegte Pizzerien und eigene Listen. Mitglieder wählen sie beim Start einer Bestellrunde unter Termine → Bestellen. Spätere Preisänderungen ändern laufende Runden nicht.</p>' +
      '<div class="ffl-row"><button type="button" class="ffl-p" data-act="orme" data-v="new">' + (d.order_can_approve ? 'Neue Karte' : 'Karte vorschlagen') + '</button></div>';
    if (cur) {
      var lines = cur.items.map(function (x) { return (x.cat ? x.cat + ' | ' : '') + x.name + ' | ' + (x.cents / 100).toFixed(2).replace('.', ','); }).join('\n');
      h += '<div class="ffl-pbox" style="margin-top:14px"><div class="ffl-sh">' + (cur.id ? esc(cur.name) : 'Neue Karte') + '</div><div class="ffl-form2">' +
        '<div><label class="ffl-fl" for="ffl-om-name">Name</label><input type="text" id="ffl-om-name" value="' + esc(cur.name) + '"></div>' +
        '<div><label class="ffl-fl" for="ffl-om-kind">Art</label><select id="ffl-om-kind"><option value="pizzeria"' + (cur.kind === 'pizzeria' ? ' selected' : '') + '>Pizzeria / Lieferdienst</option><option value="liste"' + (cur.kind === 'liste' ? ' selected' : '') + '>Eigene Liste</option></select></div>' +
        '<div><label class="ffl-fl" for="ffl-om-phone">Telefon</label><input type="text" id="ffl-om-phone" value="' + esc(cur.phone) + '"></div>' +
        '<div><label class="ffl-fl" for="ffl-om-link">Link zur Karte</label><input type="url" id="ffl-om-link" value="' + esc(cur.link) + '"></div></div>' +
        '<label class="ffl-fl" for="ffl-om-items">Gerichte: eine Zeile je Gericht, Kategorie | Gericht | Preis</label><textarea id="ffl-om-items" rows="10" placeholder="Pizza | Salami klein | 7,50\nPizza | Salami groß | 9,50\nGetränke | Cola 0,33 l | 2,50">' + esc(lines) + '</textarea>' +
        '<div class="ffl-row" style="margin-top:10px"><button type="button" class="ffl-p" data-act="omsave" data-id="' + cur.id + '">Speichern</button><button type="button" class="ffl-q" data-act="orme" data-v="">Abbrechen</button>' +
        (cur.id ? '<button type="button" class="ffl-q" style="margin-left:auto" data-act="omdel" data-id="' + cur.id + '">Löschen</button>' : '') + '</div></div>';
    }
    if (!ms.length) return h + '<p class="ffl-mu">Noch keine Karten.</p>';
    return h + '<div class="ffl-todos" style="margin-top:14px">' + ms.map(function (m) { return '<div class="ffl-todo"><div class="ffl-day">' + m.items.length + '</div><div class="ffl-ct"><b>' + esc(m.name) + '</b><div class="ffl-mu">' + (m.kind === 'liste' ? 'Eigene Liste' : 'Pizzeria') + (m.phone ? ' · ' + esc(m.phone) : '') + '</div></div>' + (d.order_can_approve ? '<button type="button" class="ffl-sm" data-act="orme" data-v="' + m.id + '">Bearbeiten</button>' : '') + '</div>'; }).join('') + '</div>';
  }
  function tabIncidents() {
    var nRev = (d.review_due || []).length;
    var nCv = (d.participation || []).filter(function (p) { return p.cert === 'requested' || p.cert === 'issued'; }).length;
    var subs = [['list', 'Einsätze & Beteiligung'], ['cert', 'Verdienstausfall' + (nCv ? ' (' + nCv + ')' : '')], ['web', 'Website-Berichte'], ['archive', 'Aufbewahrung' + (nRev ? ' (' + nRev + ')' : '')], ['form', 'Einstellungen']];
    var cur = ui.isub || 'list', isSet = cur === 'form' || cur === 'vehicles';
    var h = '<div class="ffl-subtabs" style="margin-top:12px">' + subs.map(function (x) {
      return '<button type="button" data-act="isub" data-v="' + x[0] + '" aria-selected="' + (x[0] === 'form' ? isSet : cur === x[0]) + '">' + x[1] + '</button>';
    }).join('') + '</div>' + (isSet ? setPills('isub', cur, [['form', 'Bericht-Formular'], ['vehicles', 'Einsatz-Fahrzeuge']]) : '');
    return h + (cur === 'form' ? reportFormEditor() : cur === 'vehicles' ? incidentSetup() : cur === 'web' ? webSetup() : cur === 'cert' ? certBoard() : cur === 'archive' ? reviewPanel() : incidentList('einsatz'));
  }

  // Einsätze (Reiter Einsätze) bzw. Übungen (Reiter Dienste) – getrennt geführt
  // Zeitraum der Einsatzliste: letzte 12 Monate oder ein Jahr – alle Jahre bleiben erreichbar
  function yearSel() {
    var ys = d.incident_years || [];
    return '<select id="ffl-iyear" style="width:auto" aria-label="Zeitraum"><option value="">letzte 12 Monate</option>' + ys.map(function (y) { return '<option value="' + y + '"' + (+ui.iYear === y ? ' selected' : '') + '>' + y + '</option>'; }).join('') + '</select>';
  }
  // Versehentlich angelegten Einsatz löschen: mit Begründung, geht nur ohne Bericht und ohne abgeschlossene Liste;
  // wer, wann, warum und der gelöschte Stand stehen im Protokoll (Einstellungen → Protokoll)
  function incDelete(id) {
    var i = by(d.incidents, 'id')[id] || {}, ps = (d.participation || []).filter(function (p) { return p.incident_id === id; }).length;
    MYFUI.ask({ title: 'Einsatz löschen', text: (i.nr ? i.nr + ' · ' : '') + (i.title || '') + (i.start ? ' (' + fmtDT(i.start) + ')' : '') + (ps ? '\n' + ps + ' Beteiligung' + (ps > 1 ? 'en werden' : ' wird') + ' mit entfernt.' : '') + (i.has_report ? '\nDer begonnene Bericht wird mit gelöscht (sein Stand bleibt im Protokoll).' : '') +
      '\nNur für versehentlich Angelegtes (Testalarm, doppelt). Warum? Die Begründung steht im Änderungsprotokoll.', ph: 'z. B. Testalarm vom Montag', required: 'Bitte kurz begründen (mindestens 5 Zeichen).', min: 5, ok: 'Löschen' })
      .then(function (why) { if (why) post('incident/delete', { id: id, reason: why }, 'Einsatz gelöscht – mit Begründung im Protokoll.'); });
  }
  // Verdienstausfall: alle Bescheinigungen eines Jahres in drei Stapeln – Daten werden beim Öffnen geladen
  function certBoard() {
    if (!ui.cv || ui.cv.year !== (ui.cvYear || new Date().getFullYear())) {
      api('GET', 'admin/cert/list', null, 'year=' + (ui.cvYear || new Date().getFullYear())).then(function (r) { ui.cv = r; render(); }, function (e) { flash('err', e.message); });
      return '<p class="ffl-mu" style="margin-top:14px">Lade …</p>';
    }
    var o = (d.settings || {}).cert_office || {};
    return MYFCert.board(ui.cv, { openInc: 'cvinc', openMember: 'profile' }) +
      '<p class="ffl-mu" style="margin-top:14px">Erstattung beantragt der Arbeitgeber bei: <b>' + esc(o.name || 'Gemeinde – noch nicht eingetragen') + '</b>' + (o.dept ? ' · ' + esc(o.dept) : '') + (o.az ? ' · Az. ' + esc(o.az) : '') +
        ' · <a href="#" data-tab="settings">ändern unter Einstellungen → Organisation</a></p>';
  }
  function incidentList(kind) {
    var ueb = kind === 'uebung', mem = by(d.members, 'id');
    var rows = d.incidents.filter(function (i) { return ueb ? i.kind === 'uebung' : i.kind !== 'uebung'; });
    var hintOff = false; try { hintOff = localStorage.getItem('myf-inchint-' + kind) === '1'; } catch (e) {}
    var h = hintOff ? '' : '<div class="ffl-msg ffl-dismiss" style="margin-top:14px"><span>' + (ueb ? 'Teilnahme an Übungen und Dienstabenden eintragen und bestätigen geht im Mitgliederbereich (Termine → Dienste) – für die Einsatzführung und die Verwaltung. Übungen zählen nicht als Einsätze. Hier: Überblick, Ausdrucke.'
      : 'Beteiligung und Berichte bearbeitet man im Mitgliederbereich (Reiter „Einsätze“) – „Details“ führt direkt zum Einsatz. Hier: Überblick, Ausdrucke, Export.') + '</span><button type="button" class="ffl-q ffl-sm" data-act="inchint" data-v="' + kind + '" aria-label="Hinweis ausblenden">Ausblenden</button></div>';
    var yr = new Date().getFullYear(), kk = ueb ? 'uebung' : 'einsatz';
    var L = MYFUI.lt(ui, 'inc_' + kk, rows, { noun: ueb ? 'Übungen' : 'Einsätze', ph: 'Nummer, Stichwort, Ort, Einsatzleiter …', per: 25,
      text: function (i) { return [i.nr, i.title, i.place, i.lead, fmtDate(i.start)].join(' '); },
      sorts: [['neu', 'neueste zuerst', function (i) { return i.start; }, -1], ['alt', 'älteste zuerst', function (i) { return i.start; }, 1],
        ['offen', 'Bericht offen zuerst', function (i) { return (i.report_closed ? 2 : i.has_report ? 1 : 0) + '|' + i.start; }, 1], ['el', 'Einsatzleiter', function (i) { return i.lead || '~'; }, 1]],
      // Ein Export-Knopf für den gewählten Zeitraum (bei „letzte 12 Monate“: laufendes Jahr)
      extra: yearSel() + '<button type="button" class="ffl-sm ffl-xls" data-act="ainccsv" data-k="' + kk + '" data-v="' + (ui.iYear || yr) + '" title="Alle Einsätze ' + (ui.iYear || yr) + ' als Tabelle für Excel herunterladen">↓ Excel ' + (ui.iYear || yr) + '</button>' +
        // Jahresbericht gehört zum Jahr, das hier gewählt ist – gleiche Stelle wie der Excel-Export
        (ueb ? '' : '<button type="button" class="ffl-sm" data-act="yearreport" data-v="' + (ui.iYear || yr) + '" title="Zahlen fürs Jahr ohne Namen – für Versammlung und Gemeinde (A4)">Jahresbericht ' + (ui.iYear || yr) + '</button>') +
        (!ueb ? '<label class="ffl-check" title="Geschädigter, Kennzeichen, Kostenpflichtiger – nur wenn nötig"><input type="checkbox" id="ffl-csvsens"> mit personenbezogenen Feldern</label>' : '') });
    h += L.bar;
    h += '<div class="ffl-scroll"><table class="ffl-table"><thead><tr><th>Datum</th><th>' + (ueb ? 'Übung' : 'Einsatz') + '</th><th>Einsatzleiter</th><th>Beteiligte</th><th>Bericht</th><th>Website</th><th></th></tr></thead><tbody>' +
      L.rows.map(function (i) {
        var web = i.web ? (i.web.status === 'publish' ? '<a class="ffl-chip st-ok" href="' + esc(i.web.link || '#') + '" target="_blank" rel="noopener">online</a>' : '<span class="ffl-chip st-warn">Entwurf</span>') : '–';
        var ps = d.participation.filter(function (p) { return p.incident_id === i.id; });
        var open = ui.incOpen === i.id;
        var row = '<tr><td style="white-space:nowrap">' + dtA(i.start) + '</td><td><b>' + esc((i.nr ? i.nr + ' · ' : '') + i.title) + '</b>' + (i.source === 'test' ? ' <span class="ffl-chip st-no" title="Probe-/Testalarm – zählt nicht als Einsatz">Test</span>' : '') + '</td>' +
          '<td>' + esc(i.lead || '–') + (i.place ? '<div class="ffl-mu" style="font-size:13px">' + esc(i.place) + '</div>' : '') + '</td><td>' + ps.length + '</td><td>' + (i.report_ext ? '<span class="ffl-chip st-ok" title="' + esc(i.report_ext + ' – ' + i.report_closed_by) + '">auf Papier</span>' : i.report_closed ? '<span class="ffl-chip st-ok" title="abgeschlossen von ' + esc(i.report_closed_by) + '">🔒 abgeschlossen</span>' : i.has_report ? '<span class="ffl-chip st-open">Entwurf</span>' : '–') + '</td><td>' + web + '</td>' +
          '<td style="white-space:nowrap"><button type="button" class="ffl-sm" data-act="incrow" data-id="' + i.id + '">' + (open ? 'Zuklappen' : 'Details') + '</button></td></tr>';
        if (open && i.pub) row += '<tr><td></td><td colspan="6"><div class="ffl-pbox" style="margin:0 0 8px"><b>Website: ' + esc(i.pub.title) + '</b><div class="ffl-mu">' + esc([i.pub.type, i.pub.place, (i.pub.res || []).join(', ')].filter(Boolean).join(' · ')) + '</div>' +
          (i.pub.text ? '<div class="ffl-pre-line" style="margin-top:6px">' + esc(i.pub.text) + '</div>' : '') + '<div class="ffl-row" style="margin-top:8px">' +
          (i.web && i.web.status !== 'publish' ? '<button type="button" class="ffl-sm ffl-p" data-act="webpubset" data-v="publish" data-id="' + i.id + '">Freigeben & veröffentlichen</button>' : '<button type="button" class="ffl-sm" data-act="webpubset" data-v="draft" data-id="' + i.id + '">Offline nehmen</button>') +
          '<span class="ffl-mu">geschrieben von ' + esc(i.pub.by) + '</span></div></div></td></tr>';
        if (open) row += '<tr><td></td><td colspan="6"><div class="ffl-chips">' + (ps.length ? ps.map(function (p) {
          var m = mem[p.member_id];
          return '<span class="ffl-chip ' + (p.confirmed ? 'st-ok' : 'st-open') + '">' + esc(m ? m.name : '(gelöscht)') + ' · ' + esc(p.vehicle || '–') + (p.as_minutes ? ' · AS ' + p.as_minutes + ' min' : '') + (p.cert ? ' · 📄' : '') + '</span>';
        }).join('') : '<span class="ffl-mu">Noch niemand eingetragen.</span>') + '</div>' +
          (function () { var hh = MYFUI.roleHints(ps, function (p) { return (mem[p.member_id] || { name: '?' }).name; }, (d.incveh || {}).extra); return hh.length ? '<div class="ffl-msg warn" style="margin-top:8px"><b>Bitte prüfen:</b> ' + hh.map(esc).join('<br>') + '</div>' : ''; })() +
          (i.report_closed ? '<div class="ffl-mu" style="margin-top:6px">🔒 Bericht abgeschlossen – Beteiligung festgeschrieben, Änderungen nur nach „Wieder öffnen“.</div>' : '') +
          ((i.report_log || []).length ? '<div class="ffl-mu" style="margin-top:8px;font-size:13px">' + i.report_log.map(function (l) { return esc(fmtDT(l.at) + ' · ' + l.by + ': ' + l.what + (l.why ? ' – „' + l.why + '“' : '')); }).join('<br>') + '</div>' : '') +
          '<div class="ffl-row" style="margin-top:8px">' + (!ueb && !i.report_closed ? ((d.who || {}).linked ? '<a class="ffl-btn ffl-sm ffl-p" href="' + esc(portalUrl('ebericht=' + i.id)) + '">' + (i.has_report ? 'Bericht weiter ausfüllen' : 'Bericht ausfüllen') + '</a>'
            : '<span class="ffl-mu" title="Berichte werden im Mitgliederbereich ausgefüllt">Bericht ausfüllen: Konto erst einem Mitglied zuordnen</span>') : '') +
          (i.has_report ? '<button type="button" class="ffl-sm" data-act="aincrep" data-id="' + i.id + '" title="Bericht mit Beteiligung, Atemschutzüberwachung und Fahrten – erst Vorschau, dann PDF / Drucken">Einsatzmappe ansehen</button>' : '') +
          (i.report_closed ? '<button type="button" class="ffl-sm" data-act="aincreopen" data-id="' + i.id + '">' + (i.report_ext ? 'Doch hier ausfüllen …' : 'Bericht wieder öffnen …') + '</button>' : '') +
          (!ueb && !i.report_closed && !i.has_report ? '<button type="button" class="ffl-sm ffl-q" data-act="aincext" data-id="' + i.id + '" title="Bericht liegt schon auf Papier oder ist Altbestand">Schon erfasst …</button>' : '') +
          '<button type="button" class="ffl-sm" data-act="aincpart" data-id="' + i.id + '">Beteiligungsliste ansehen</button>' +
          (ps.some(function (p) { return p.cert; }) ? '<button type="button" class="ffl-sm" data-act="ainccert" data-id="' + i.id + '">Bescheinigungen ansehen</button>' : '') +
          // Löschen: immer an derselben Stelle – geht es nicht, steht hier warum (revisionssicher)
          (!i.report_closed && !i.part_closed ? '<button type="button" class="ffl-q ffl-sm" style="color:var(--red-tx);margin-left:auto" data-act="aincdel" data-id="' + i.id + '" title="Nur für versehentlich Angelegtes (Testalarm, doppelt) – mit Begründung, steht im Protokoll">Einsatz löschen …</button>'
            : '<span class="ffl-mu" style="margin-left:auto;font-size:13px" title="Abgeschlossene Berichte und Listen bleiben revisionssicher erhalten">Löschen nicht möglich – ' + (i.report_closed ? 'Bericht abgeschlossen' : 'Liste abgeschlossen') + '</span>') + '</div></td></tr>';
        return row;
      }).join('') + (rows.length ? (L.total ? '' : '<tr><td colspan="7" class="ffl-mu">Nichts gefunden.</td></tr>') : ueb ? '<tr><td colspan="7" class="ffl-mu">Noch keine Übungen.</td></tr>' : '<tr><td colspan="7" class="ffl-mu">Noch keine Einsätze. Sie kommen automatisch aus der Einsatzverwaltung oder werden im Mitgliederbereich angelegt.</td></tr>') +
      '</tbody></table></div>' + L.pager;
    h += qrBox();
    // Auswertung: Einsätze je Person im laufenden Jahr
    var year = new Date().getFullYear(), cnt = {}, asm = {};
    d.participation.forEach(function (p) {
      var i = d.incidents.filter(function (x) { return x.id === p.incident_id; })[0];
      if (!i || +i.start.slice(0, 4) !== year) return;
      cnt[p.member_id] = (cnt[p.member_id] || 0) + 1; asm[p.member_id] = (asm[p.member_id] || 0) + (p.as_minutes || 0);
    });
    var ids = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; });
    if (ids.length) h += '<details style="margin-top:16px"><summary class="ffl-mu" style="cursor:pointer">Auswertung ' + year + ': Einsätze/Übungen je Person</summary><table class="ffl-table"><thead><tr><th>Name</th><th>Anzahl</th><th>Atemschutz-Minuten</th></tr></thead><tbody>' +
      ids.map(function (id) { var m = mem[id]; return '<tr><td>' + esc(m ? m.name : '(gelöscht)') + '</td><td>' + cnt[id] + '</td><td>' + (asm[id] || '') + '</td></tr>'; }).join('') + '</tbody></table></details>';
    return h;
  }

  // Formular des Einsatzberichts bearbeiten (Abschnitte, Felder, Auswahlmöglichkeiten)
  var FTYPES = [['checks', 'Mehrfachauswahl'], ['radio', 'Einfachauswahl'], ['text', 'Textzeile'], ['textarea', 'Textfeld (mehrzeilig)'], ['number', 'Zahl']];
  function reportFormEditor() {
    var form = ui.formDraft || (ui.formDraft = JSON.parse(JSON.stringify(d.report_form)));
    var h = '<div class="ffl-pbox ffl-secure"><div class="ffl-sh">🔒 Schutz der Berichte</div><ul class="ffl-ticks">' +
      '<li>Berichte und Alarmtexte werden <b>verschlüsselt</b> gespeichert – eine gestohlene Datenbank allein ist unlesbar.</li>' +
      '<li>Ein Bericht wird nur geladen, wenn ihn jemand aus der Einsatzführung öffnet – <b>jeder Abruf steht im Protokoll</b>.</li>' +
      '<li>Ins Protokoll kommen nur die Namen der geänderten Felder, nie die Inhalte. Ausdrucke verschwinden nach dem Drucken wieder aus der Seite.</li>' +
      '<li>Öffentliche Website-Berichte entstehen getrennt davon – nur aus Titel, Art, Ort ohne Hausnummer, Fahrzeugen und freiem Text.</li></ul>' +
      '<p class="ffl-mu" style="margin:0">Aufbewahrung: Nichts wird automatisch gelöscht – ältere Berichte legt ' + esc(APP) + ' unter „Aufbewahrung“ zur Prüfung vor.</p></div>' +
      '<p class="ffl-mu" style="margin-top:14px">So sieht der digitale Erfassungsbogen aus. Auswahlmöglichkeiten: eine pro Zeile. 🔒 = personenbezogen (Geschädigte, Kennzeichen …), ' +
      'wird nur der Einsatzführung gezeigt. Gespeicherte Berichte behalten ihre Werte; entfernte Felder erscheinen dort nicht mehr.</p><div id="ffl-formed">';
    form.forEach(function (sec, si) {
      h += '<div class="ffl-pbox" data-fsec="' + si + '"><div class="ffl-row"><input type="text" data-fs="title" value="' + esc(sec.title) + '" style="font-weight:700;flex:1 1 200px;width:auto">' +
        '<button type="button" class="ffl-q ffl-sm" data-act="fsecdel" data-id="' + si + '">Abschnitt entfernen</button></div>';
      sec.fields.forEach(function (f, fi) {
        h += '<div class="ffl-frow" data-ffield="' + fi + '" data-fid="' + esc(f.id) + '"><input type="text" data-ff="label" value="' + esc(f.label) + '" placeholder="Bezeichnung">' +
          sel(FTYPES, f.type, 'data-ff="type"') + '<label class="ffl-check"><input type="checkbox" data-ff="sensitive"' + (f.sensitive ? ' checked' : '') + '> 🔒</label>' +
          '<button type="button" class="ffl-q ffl-sm" data-act="ffielddel" data-id="' + si + ':' + fi + '">✕</button>' +
          (f.type === 'checks' || f.type === 'radio' ? '<textarea data-ff="options" rows="3" placeholder="eine Möglichkeit pro Zeile">' + esc((f.options || []).join('\n')) + '</textarea>' : '') + '</div>';
      });
      h += '<button type="button" class="ffl-sm" style="margin-top:8px" data-act="ffieldadd" data-id="' + si + '">+ Feld</button></div>';
    });
    return h + '</div><div class="ffl-row" style="margin-top:12px"><button type="button" class="ffl-sm" data-act="fsecadd">+ Abschnitt</button><span style="flex:1"></span>' +
      '<button type="button" class="ffl-q" data-act="freset">Auf Papierbogen zurücksetzen</button><button type="button" class="ffl-p" data-act="fsave">Formular speichern</button></div>';
  }
  function formFromDom() {
    return [].map.call(document.querySelectorAll('[data-fsec]'), function (sb) {
      return { title: sb.querySelector('[data-fs=title]').value, fields: [].map.call(sb.querySelectorAll('[data-ffield]'), function (fr) {
        var o = fr.querySelector('[data-ff=options]');
        return { id: fr.getAttribute('data-fid'), label: fr.querySelector('[data-ff=label]').value, type: fr.querySelector('[data-ff=type]').value,
          sensitive: fr.querySelector('[data-ff=sensitive]').checked, options: o ? o.value.split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean) : [] };
      }) };
    });
  }

  // Fahrzeuge im Einsatz: kommen aus Technik → Fahrzeuge (eine Liste für Halle, Bericht, Status, Fahrtenbuch) – hier nur an/aus
  function incidentSetup() {
    var iv = d.incveh || { all: [], extra: [] };
    var h = '<div class="ffl-ivwrap"><div class="ffl-pbox"><div class="ffl-sh">Fahrzeuge zur Auswahl</div>' +
      (iv.all.length ? '<table class="ffl-table ffl-ivtable"><thead><tr><th>im Einsatz</th><th>Fahrzeug</th><th>Funkrufname (für Alamos)</th><th>Status</th></tr></thead><tbody>' + iv.all.map(function (v) {
        return '<tr><td><label class="ffl-switch"><input type="checkbox" data-incveh="' + v.id + '"' + (v.on ? ' checked' : '') + '><span></span></label></td>' +
          '<td><b>' + esc(v.name) + '</b>' + (multiUnit() ? ' <span class="ffl-mu">' + esc(unitShort(v.unit)) + '</span>' : '') + '</td>' +
          '<td>' + (v.callsign ? esc(v.callsign) : '<button type="button" class="ffl-chip st-warn ffl-fixchip" data-act="ivcall" data-id="' + v.id + '">fehlt – eintragen</button>') + '</td>' +
          '<td>' + (v.fms ? '<span class="ffl-fmschip f' + esc(v.fms) + '"><i>' + esc(v.fms) + '</i></span> <span class="ffl-mu">' + esc(v.fms_by === 'Schnittstelle' ? 'aus Alamos' : 'von Hand') + '</span>' : '<span class="ffl-mu">–</span>') + '</td></tr>';
      }).join('') + '</tbody></table><p class="ffl-mu" style="margin:6px 0 0">„Andere“ steht immer zusätzlich zur Auswahl.</p>' : '<p class="ffl-mu">Noch keine Fahrzeuge angelegt – unter Technik → Fahrzeuge anlegen (oder aus der Einsatzverwaltung übernehmen).</p>') +
      (iv.extra.length ? '<div class="ffl-msg warn" style="margin-top:12px"><b>Noch nicht mit einem Fahrzeug verknüpft</b>' + iv.extra.map(function (n) {
        return '<div class="ffl-row" style="margin-top:6px"><b style="min-width:120px">' + esc(n) + '</b>' +
          (iv.all.length ? sel([['', 'gehört zu …']].concat(iv.all.map(function (v) { return [v.id, v.name]; })), '', 'data-ivlink="' + esc(n) + '" style="width:auto"') : '') +
          '<button type="button" class="ffl-sm" data-act="ivcreate" data-v="' + esc(n) + '">als neues Fahrzeug anlegen</button>' +
          '<button type="button" class="ffl-q ffl-sm" data-act="ivdrop" data-v="' + esc(n) + '">entfernen</button></div>';
      }).join('') + '</div>' : '') + '</div>' +
      '<div class="ffl-pbox"><div class="ffl-sh">Eine Fahrzeugliste für alles</div><p style="margin-top:0">Die Fahrzeuge kommen aus <b>Technik → Fahrzeuge</b> – dort anlegen oder umbenennen. ' +
      'Dieselben Fahrzeuge stehen bei „Warst du dabei?“, in der Fahrzeughalle, im Einsatzbericht, im Fahrtenbuch und beim Status (1–9). So gibt es kein Fahrzeug doppelt.</p>' +
      '<p class="ffl-mu">Hier nur an- oder abwählen, was im Einsatz auswählbar ist (z. B. Anhänger abwählen). „Andere“ ist für Privat-Pkw oder Fahrzeuge anderer Einheiten. ' +
      'Damit der Status aus Alamos FE2 passt, unter Technik beim Fahrzeug den <b>Funkrufnamen</b> eintragen.</p></div></div>';
    return h;
  }
  // Aushang mit QR-Code „Ich war dabei“ (im Gerätehaus und in den Fahrzeugen)
  function qrBox() {
    return '<div class="ffl-pbox ffl-posterbox" style="margin-top:18px"><div class="ffl-qrprev">' + qrSvg(portalUrl('bericht=1'), 3) + '</div><div><div class="ffl-sh">Aushang „Warst du dabei?“</div>' +
      '<p class="ffl-mu" style="margin-top:0">QR-Code zum Aufhängen im Gerätehaus oder Aufkleben in den Fahrzeugen. Scannen öffnet ' + APP + ' bei den Einsätzen – ' +
      'Mitglieder tragen sich ein, die Einsatzführung landet beim neuesten Einsatz.</p><button type="button" class="ffl-sm" data-act="incqr">Aushang drucken (A4)</button></div></div>';
  }
  // Aufbewahrung: Berichte nach der Prüffrist – weiter aufbewahren oder Personenangaben schwärzen (nichts geschieht automatisch)
  function reviewPanel() {
    var due = d.review_due || [];
    var h = '<div class="ffl-pbox" style="margin-top:14px"><div class="ffl-sh">Aufbewahrung der Einsatzberichte</div>' +
      '<p style="margin-top:0">' + esc(APP) + ' löscht nichts von selbst. Berichte, die älter als die Prüffrist sind und noch Personenangaben (🔒-Felder) oder Alarmtexte enthalten, erscheinen hier. ' +
      'Für jeden Bericht entscheidet ihr: <b>weiter aufbewahren</b> (bis zu einem Datum, mit Grund – z. B. Kostenersatz oder Verfahren offen) oder <b>Personenangaben schwärzen</b>. ' +
      'Beim Schwärzen bleiben Datum, Einsatzart, Beteiligung, Fahrzeugzeiten und alle übrigen Angaben erhalten; jede Entscheidung steht im Protokoll.</p>' +
      '<div class="ffl-row"><span class="ffl-mu">Zur Prüfung vorlegen nach</span>' + sel([['3', '3'], ['5', '5'], ['6', '6'], ['10', '10'], ['15', '15'], ['30', '30']], String(d.report_review || 10), 'id="ffl-review" style="width:auto"') +
      '<span class="ffl-mu">Jahren</span></div></div>';
    if (!due.length) return h + '<div class="ffl-msg ok" style="margin-top:12px">Gerade steht kein Bericht zur Prüfung an.</div>';
    h += '<div class="ffl-bulk" style="margin-top:14px"><label class="ffl-check"><input type="checkbox" id="ffl-revall"> alle auswählen</label>' +
      '<button type="button" class="ffl-sm" data-act="revkeep">Ausgewählte weiter aufbewahren …</button><button type="button" class="ffl-sm ffl-p" data-act="revredact">Personenangaben schwärzen …</button></div>' +
      '<div class="ffl-scroll"><table class="ffl-table"><thead><tr><th style="width:34px"></th><th>Datum</th><th>Einsatz</th><th>enthält</th><th>bisher</th></tr></thead><tbody>' + due.map(function (x) {
        return '<tr><td><input type="checkbox" data-rev="' + x.id + '"></td><td style="white-space:nowrap">' + dtA(x.start) + '</td><td><b>' + esc((x.nr ? x.nr + ' · ' : '') + x.title) + '</b></td>' +
          '<td>' + esc(x.fields.concat(x.alarm_text ? ['Alarmtext'] : []).join(', ')) + '</td><td class="ffl-mu">' + (x.retain_until ? 'aufbewahrt bis ' + fmtDate(x.retain_until) + (x.retain_reason ? ' (' + esc(x.retain_reason) + ')' : '') : '–') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    return h;
  }
  function listEditorPlain(name, title, items) {
    return '<div class="ffl-pbox"><div class="ffl-sh">' + esc(title) + '</div><div class="ffl-lrows" data-plist="' + name + '">' + items.map(function (v) {
      return '<div class="ffl-lrow"><input type="text" value="' + esc(v) + '"><button type="button" class="ffl-q ffl-sm" data-act="lrowdel">✕</button></div>';
    }).join('') + '<div class="ffl-lrow" data-key=""><input type="text" placeholder="Neuer Eintrag …"></div></div>' +
      '<button type="button" class="ffl-p ffl-sm" style="margin-top:8px" data-act="saveplist" data-list="' + name + '">Speichern</button></div>';
  }

  // Website-Berichte (Plugin „Einsatzverwaltung“): wer darf, Schnellerfassung, Fahrzeuge je Einheit
  function webSetup() {
    var w = d.web_reports || {};
    var tg = '<div class="ffl-pbox" style="margin-top:14px"><div class="ffl-sh">Wo erscheinen die Berichte?</div><div class="ffl-seg" role="group">' +
      [['einsatzverwaltung', 'Plugin „Einsatzverwaltung“' + (w.ev ? '' : ' (nicht installiert)')], ['wehrwerk', 'Direkt aus ' + esc(APP)]].map(function (x) {
        return '<button type="button" data-act="webtarget" data-v="' + x[0] + '" aria-pressed="' + (w.target === x[0]) + '"' + (w.can_mode && (x[0] !== 'einsatzverwaltung' || w.ev) ? '' : ' disabled') + '>' + x[1] + '</button>';
      }).join('') + '</div><p class="ffl-mu">Beide Wege nutzen dieselben Einsätze (Alarm, Schnellerfassung, von Hand). Bei „Direkt aus ' + esc(APP) + '“ zeigt die Seite mit ' +
      '<code>[wehrwerk_einsatzberichte]</code> Jahre, Statistik und Einzelberichte – öffentlich nur Titel, Art, Ort ohne Hausnummer, Fahrzeuge, Zeiten, Zahl der Kräfte und euer Text. ' +
      'Andere Werkzeuge können dieselben Angaben über <code>/wp-json/myf/v1/public/incidents?year=…</code> abholen.</p>' +
      (w.target === 'wehrwerk' ? (w.list_url ? '<div class="ffl-linkbox"><span style="flex:1">' + esc(w.list_url) + '</span><a class="ffl-sm ffl-btn" href="' + esc(w.list_url) + '" target="_blank" rel="noopener">Öffnen ↗</a></div>'
        : '<button type="button" class="ffl-p" data-act="weblistpage">Seite „Einsätze“ anlegen</button>') : '') + '</div>';
    if (!w.ev) return tg + webModes(w);
    return tg + webModes(w) + webQuick(w);
  }
  function webModes(w) {
    var modes = [['off', 'Nur Administratoren'], ['draft', 'Einsatzführung als Entwurf'], ['publish', 'Einsatzführung darf veröffentlichen']];
    return '<div class="ffl-pbox" style="margin-top:14px"><div class="ffl-sh">Wer schreibt Website-Berichte?</div>' +
      '<div class="ffl-seg" role="group">' + modes.map(function (m) {
        return '<button type="button" data-act="webmode" data-v="' + m[0] + '" aria-pressed="' + (w.mode === m[0]) + '"' + (w.can_mode ? '' : ' disabled') + '>' + m[1] + '</button>';
      }).join('') + '</div>' +
      '<p class="ffl-mu">„Einsatzführung“ = alle mit dem Recht „Einsätze, Einsatzberichte & Bescheinigungen“. Sie können im Mitgliederbereich beim Einsatz „Für die Website“ ausfüllen ' +
      'oder die Schnellerfassung nutzen. Entwürfe gibt danach die Verwaltung frei (Liste der Einsätze).</p></div>';
  }
  function webQuick(w) {
    var h = '<div class="ffl-grid2" style="margin-top:14px"><div class="ffl-pbox"><div class="ffl-sh">Schnellerfassung</div><p class="ffl-mu" style="margin-top:0">Alarm- oder WhatsApp-Meldungen einfügen, ' + esc(APP) + ' erkennt Nummer, Datum und Stichwort ' +
      'und legt die Berichte nacheinander an – ideal zum Nachtragen am Handy.</p>' +
      (w.url ? '<div class="ffl-linkbox"><span style="flex:1">' + esc(w.url) + '</span><a class="ffl-sm ffl-btn" href="' + esc(w.url) + '" target="_blank" rel="noopener">Öffnen ↗</a></div>'
        : '<button type="button" class="ffl-p" data-act="webpage">Seite „Einsatz erfassen“ anlegen</button><p class="ffl-mu">Oder auf einer beliebigen Seite den Shortcode <code>[wehrwerk_einsatz]</code> einfügen.</p>') +
      '<p class="ffl-mu">Die Seite ist nur nach Anmeldung nutzbar und für Suchmaschinen gesperrt.</p></div>';
    h += '<div class="ffl-pbox"><div class="ffl-sh">Fahrzeuge je Einheit</div><p class="ffl-mu" style="margin-top:0">Für die Schnellerfassung – Namen wie in der Einsatzverwaltung, mit Komma getrennt.</p><div>' + (w.units || []).map(function (u, i) {
      return '<div data-wu="' + esc(u.key) + '"><label class="ffl-fl">' + esc(u.label) + (i > 0 ? ' · Kürzel vor der Nummer <input type="text" data-wpre="1" value="' + esc(u.prefix) + '" style="width:60px;display:inline-block;margin-left:6px">' : '') + '</label>' +
        '<input type="text" data-wveh="1" value="' + esc(u.vehicles.join(', ')) + '" placeholder="z. B. HLF 20, LF 10"></div>';
    }).join('') + '</div>' + ((w.ev_vehicles || []).length ? '<p class="ffl-mu">In der Einsatzverwaltung angelegt: ' + esc(w.ev_vehicles.join(', ')) + '</p>' : '') +
      '<button type="button" class="ffl-p" style="margin-top:8px" data-act="webveh">Speichern</button></div></div>';
    return h;
  }

  // Alarm-Schnittstelle: FE2 (oder ein anderes System) schickt bei Alarm eine Web-Anfrage → Einsatz wird sofort angelegt
  // Terminal in der Fahrzeughalle: Anwesenheit ohne eigenes Login, Fahrzeugstatus, km-Stand
  function hallSetup() {
    var hl = d.hall || {}, a = d.alarm || {};
    var stUrl = a.on && a.url ? a.url.replace('/myf/v1/alarm', '/myf/v1/status').replace('%2Fmyf%2Fv1%2Falarm', '%2Fmyf%2Fv1%2Fstatus') : '';
    var h = '<div class="ffl-grid2" style="margin-top:14px"><div class="ffl-pbox"><div class="ffl-sh">Halle: Dashboard mit Anwesenheitsliste</div>' +
      '<p class="ffl-mu" style="margin-top:0">Ein Tablet oder Touch-Bildschirm in der Fahrzeughalle – ohne eigenes Login. Zeigt nur Einsatzbezogenes: Fahrzeugstatus, Einsätze, Fahrzeugbuchungen. ' +
      'Nach jedem Alarm wird es zur <b>Anwesenheitsliste wie auf Papier</b>: Namen antippen, Fahrzeug antippen – oder einer trägt „nach Fahrzeug“ die ganze Besatzung ein, mit Funktion (EL, ZF, GF, MA, AGT). ' +
      'Danach km-Stand je Fahrzeug. Die Einsatzführung bestätigt wie gewohnt.</p>' +
      '<label class="ffl-switch"><input type="checkbox" data-hall="on"' + (hl.on ? ' checked' : '') + '><span></span>Halle eingeschaltet</label>' +
      (hl.on && hl.url ? '<div class="ffl-fl" style="margin-top:12px">Link für das Gerät in der Halle (geheim halten!) – Tipps fürs iPad unter „QR-Codes & Links“</div>' + secretBox(hl.url, { what: 'Link Fahrzeughalle', open: true }) + devPreview(hl.url, 1180, 820, 'Vorschau Dashboard Fahrzeughalle') +
        '<button type="button" class="ffl-q ffl-sm" style="padding:0;margin-top:6px" data-act="hallnewkey">Neuen Link erzeugen (altes Gerät verliert den Zugang)</button>' : '') +
      '<div class="ffl-form2" style="margin-top:14px"><div><label class="ffl-fl">Liste offen nach dem Alarm</label>' +
      sel([2, 3, 4, 6, 8, 12, 24].map(function (n) { return [String(n), n + ' Stunden']; }), String(hl.window || 6), 'data-hall="window"') + '</div>' +
      '<div><label class="ffl-fl">Selbst eintragen</label>' + sel([['', 'am Handy und in der Halle'], ['window', 'nur in dieser Zeit (Handy und Halle)'], ['terminal', 'nur in der Halle (vor Ort)']], hl.limit || '', 'data-hall="limit"') + '</div>' +
      '<div><label class="ffl-fl">Am Handy längstens</label>' + sel([1, 2, 3, 7, 14, 30].map(function (n) { return [String(n), n === 1 ? '1 Tag nach dem Einsatz' : n + ' Tage nach dem Einsatz']; }), String(hl.self_days || 7), 'data-hall="self_days"') + '</div></div>' +
      '<p class="ffl-mu" style="margin:6px 0 0">Oder früher: Die Einsatzführung schließt die Liste im Einsatz mit „Beteiligung abschließen“.</p>' +
      '<label class="ffl-check" style="margin-top:10px"><input type="checkbox" data-hall="on_screen"' + (hl.on_screen ? ' checked' : '') + '> Auf dem Dashboard im Besprechungsraum einen Knopf „Anwesenheit eintragen“ zeigen, solange eine Liste offen ist</label>' +
      '<p class="ffl-mu">Nach Ablauf der Zeit schließt die Liste von selbst – danach trägt die Einsatzführung nach. Am Handy kann man sich je nach Einstellung weiter selbst eintragen; „Doch nicht dabei?“ geht nach der Bestätigung als Bitte an die Einsatzführung.</p></div>';
    h += '<div class="ffl-pbox"><div class="ffl-sh">Datenschutz</div><ul class="ffl-howto">' +
      '<li>Die Halle zeigt nur <b>Namen</b> der aktiven Mitglieder (wie die Papierliste) und das Einsatz-Stichwort – keinen Einsatzort, keine Kontaktdaten, keine Berichte.</li>' +
      '<li>Eintragen und Austragen geht nur für Einsätze im Zeitfenster; bestätigte Einträge ändert nur die Einsatzführung.</li>' +
      '<li>Jede Eintragung steht mit „Dashboard Fahrzeughalle“ im Protokoll (Einstellungen → Protokoll).</li>' +
      '<li>Der Link ist der Schlüssel: nur auf dem Hallen-Gerät öffnen, bei Verlust „Neuen Link erzeugen“. Suchmaschinen sind ausgesperrt.</li></ul></div></div>';
    h += '<div class="ffl-pbox" style="margin-top:14px"><div class="ffl-sh">Fahrzeugstatus aus der Alarmierung</div>' +
      '<p class="ffl-mu" style="margin-top:0">Status 1–9 (FMS) erscheint in der Halle und auf dem Fernseher. Gleicher Schlüssel wie die Alarm-Schnittstelle' + (a.on ? '' : ' – die ist noch aus (Einstellungen → Daten & Schnittstellen)') + '.</p>' +
      (stUrl ? '<div class="ffl-fl">Adresse für Statusmeldungen (geheim halten!)</div>' + secretBox(stUrl, { what: 'Adresse Statusmeldungen' }) : '') +
      '<ol class="ffl-howto"><li>In FE2 für <b>Statusänderungen</b> eine HTTP-/Webhook-Ausgabe anlegen, Methode <b>POST</b>, Adresse wie oben.</li>' +
      '<li>Inhalt z. B. <code>{"fahrzeug":"{Fahrzeugname}","status":"{Status}"}</code> – Wehrwerk erkennt auch <code>vehicle</code>, <code>callsign</code>, <code>address</code>, <code>fms</code>, <code>state</code>. Die genaue Platzhalter-Schreibweise zeigt die FE2-Vorschau.</li>' +
      '<li>Der Name wird mit Name oder Funkrufname unter Technik → Fahrzeuge abgeglichen (Leerzeichen und Bindestriche egal).</li></ol>' +
      '<p class="ffl-mu">Status von Hand setzen (z. B. 6 = außer Dienst): Technik → Fahrzeuge → Fahrzeug öffnen.</p>' +
      // Empfangene Statusmeldungen: zeigt, ob FE2 wirklich liefert
      (function () { var sl = hl.status_log || [];
        return '<div class="ffl-fl" style="margin-top:12px">Zuletzt empfangen</div>' + (sl.length ? '<div class="ffl-scroll"><table class="ffl-table"><thead><tr><th>Zeit</th><th>Fahrzeug</th><th>Status</th><th>Ergebnis</th></tr></thead><tbody>' +
          sl.slice(0, 10).map(function (x) { return '<tr><td>' + esc(String(x.t).slice(8, 10) + '.' + String(x.t).slice(5, 7) + '. ' + String(x.t).slice(11, 16)) + '</td><td>' + esc(x.n || '–') + '</td><td>' + esc(x.s || '–') + '</td><td>' + (x.r === 'ok' ? '<span class="ffl-chip st-ok">übernommen</span>' : '<span class="ffl-chip st-no">' + esc(x.r) + '</span>') + '</td></tr>'; }).join('') + '</tbody></table></div>'
          : '<p class="ffl-mu" style="margin:4px 0 0">Noch keine Statusmeldung empfangen (seit Version 3.20.3). Solange nichts ankommt, zeigt die Halle einen grünen Punkt statt der Statusziffer.</p>'); })() + '</div>';
    return h;
  }
  function alarmSetup() {
    var a = d.alarm || {}, m = a.map || {};
    var h = '<div class="ffl-grid2" style="margin-top:14px"><div class="ffl-pbox"><div class="ffl-sh">Anbindung</div>' +
      (a.can_key ? '<label class="ffl-switch"><input type="checkbox" id="ffl-alon"' + (a.on ? ' checked' : '') + '><span></span>Alarm-Schnittstelle eingeschaltet</label>' : '<p class="ffl-mu">Ein- und ausschalten können nur Administratoren.</p>') +
      (a.on && a.url ? '<div class="ffl-fl">Adresse für FE2 / aPager (geheim halten!)</div>' + (a.can_key ? secretBox(a.url, { what: 'Adresse Alarm-Schnittstelle' }) : '<div class="ffl-linkbox ffl-secret"><span class="ffl-secret-tx">' + esc(secretMask(a.url)) + '</span></div>') +
        (a.can_key ? '<button type="button" class="ffl-q ffl-sm" style="padding:0;margin-top:6px" data-act="alnewkey">Neuen Schlüssel erzeugen (alte Adresse wird ungültig)</button>' : '') : '') +
      '<div class="ffl-row" style="margin-top:12px"><button type="button" class="ffl-p" data-act="altest"' + (a.on ? '' : ' disabled') + '>Testalarm auslösen</button><span class="ffl-mu">legt einen Einsatz „TESTALARM: …“ an – ihn wieder löschen: Einsätze → Details → „Einsatz löschen …“ (mit Begründung)</span></div></div>';
    h += '<div class="ffl-pbox"><div class="ffl-sh">So richtest du FE2 ein</div><ol class="ffl-howto">' +
      '<li>In FE2 eine <b>HTTP-/Webhook-Ausgabe</b> für die Alarme eurer Einheit anlegen (je nach FE2-Version „Plugin HTTP“, „Webhook“ oder „Ausgang HTTP“).</li>' +
      '<li>Methode <b>POST</b>, Adresse = der Link links. Inhalt als <b>JSON</b> oder Formular mit den Alarm-Parametern – z. B. <code>keyword</code>, <code>keyword_description</code>, <code>address</code> (oder <code>street</code>, <code>house</code>, <code>city</code>), <code>message</code>, <code>timestamp</code>, <code>lat</code>, <code>lng</code>, <code>units</code>.</li>' +
      '<li>Alternativ <b>GET</b> mit Platzhaltern in der Adresse, z. B. <code>…&amp;keyword={keyword}&amp;address={address}</code> – die genaue Platzhalter-Schreibweise steht in der FE2-Vorschau.</li>' +
      '<li><b>aPager PRO</b> (auch von Alamos): unter „Webhook“ dieselbe Adresse eintragen – Titel und Text der Alarmierung werden als Stichwort und Meldung übernommen.</li>' +
      '<li>Einen Probealarm in FE2 auslösen und unten im <b>Alarm-Protokoll</b> nachsehen, welche Felder angekommen sind. Heißen sie anders, unten bei „Feldnamen“ eintragen.</li></ol>' +
      '<p class="ffl-mu">Wehrwerk alarmiert nicht selbst – die Alarmierung bleibt bei FE2/Meldeempfänger. Mehrfach gesendete Alarme (z. B. Nachalarm) innerhalb von 15 Minuten werden zu einem Einsatz zusammengefasst; ' +
      'der spätere Einsatzbericht aus der Einsatzverwaltung wird automatisch zugeordnet.</p></div></div>';
    h += '<div class="ffl-pbox" style="margin-top:14px"><div class="ffl-sh">Optionen</div><div class="ffl-form4" data-alform="1">' +
      '<div><label class="ffl-fl">Alarm auf dem Dashboard (Minuten)</label><input type="number" data-al="screen_minutes" value="' + esc(a.screen_minutes) + '" min="0" max="600"></div>' +
      '<div><label class="ffl-fl">Einsatzort auf dem Dashboard</label>' + sel([['1', 'anzeigen'], ['0', 'nicht anzeigen']], a.screen_address ? '1' : '0', 'data-al="screen_address"') + '</div>' +
      '<div><label class="ffl-fl">„Warst du dabei?“ fragen</label>' + sel([['1', 'ja (nur Postfach)'], ['0', 'nein']], a.ask ? '1' : '0', 'data-al="ask"') + '</div>' +
      '<div><label class="ffl-fl">… nach (Minuten)</label><input type="number" data-al="ask_after" value="' + esc(a.ask_after) + '" min="15" max="1440"></div>' +
      '<div class="span2"><label class="ffl-fl">Nur Alarme für diese Einheiten (Komma, leer = alle)</label><input type="text" data-al="only_units" value="' + esc(a.only_units) + '" placeholder="z. B. LZ Musterstadt, Florian Musterstadt"></div>' +
      // Probealarm-Zeiten: Alarme in diesem Fenster werden nur als Test angelegt (kein Einsatz, keine Nachfrage, keine Hallenliste)
      '<div class="span2"><label class="ffl-fl">Probealarm-Zeiten – Alarme dann nur als Test</label><input type="text" data-al="test_rules" value="' + esc(a.test_rules || '') + '" placeholder="z. B. Mo 19:00 ±20 – mehrere mit Komma">' +
      '<div class="ffl-mu">Automatisch als Test gelten außerdem: Stichwort/Text mit „Probealarm“, „Testalarm“, „Warntag“ u. ä., die Warntage (2. Donnerstag im März und September gegen 11 Uhr) und Webhook-Aufrufe mit <code>test=1</code>. Testalarme erscheinen lila auf dem Dashboard, legen keinen Einsatz an und öffnen keine Anwesenheitsliste.</div></div></div>' +
      '<div class="ffl-fl">Eigene Feldnamen (nur nötig, wenn die automatische Erkennung nicht passt)</div><div class="ffl-form4">' +
      [['keyword', 'Stichwort'], ['address', 'Einsatzort'], ['text', 'Meldungstext'], ['time', 'Alarmzeit']].map(function (f) {
        return '<div><label class="ffl-fl">' + f[1] + '</label><input type="text" data-almap="' + f[0] + '" value="' + esc(m[f[0]] || '') + '" placeholder="automatisch"></div>';
      }).join('') + '</div></div>';
    var log = d.alarm_log || [];
    h += '<div class="ffl-pbox" style="margin-top:14px"><div class="ffl-sh">Alarm-Protokoll<em>letzte 14 Tage</em></div>' + (log.length ? '<div class="ffl-scroll"><table class="ffl-table"><thead><tr><th>Empfangen</th><th>Ergebnis</th><th>Stichwort</th><th>Ort</th><th>Felder</th></tr></thead><tbody>' +
      log.map(function (l, i) {
        return '<tr><td style="white-space:nowrap">' + dtA(l.received) + '</td><td><span class="ffl-chip ' + (/angelegt|ergänzt|Test/.test(l.result) ? 'st-ok' : 'st-warn') + '">' + esc(l.result) + '</span></td>' +
          '<td>' + esc(l.keyword) + '</td><td>' + esc(l.address) + '</td><td><details><summary class="ffl-mu" style="cursor:pointer">' + Object.keys(l.fields).length + ' Felder</summary><table class="ffl-table">' +
          Object.keys(l.fields).map(function (k) { return '<tr><td><code>' + esc(k) + '</code></td><td>' + esc(l.fields[k]) + '</td></tr>'; }).join('') + '</table></details></td></tr>';
      }).join('') + '</tbody></table></div>' : '<p class="ffl-mu">Noch keine Alarme empfangen.</p>') + '</div>';
    return h;
  }

  function incidentAdminClick(act, t, id) {
    var i;
    switch (act) {
      case 'isub': ui.isub = t.getAttribute('data-v'); ui.formDraft = null; render(); return true;
      case 'ivcall':
        MYFUI.ask({ title: 'Funkrufname', text: 'So wie er in Alamos FE2 steht (z. B. „Florian Musterstadt 1-HLF20-1“ oder „1-HLF20-1“):', required: true, min: 2, ok: 'Speichern' }).then(function (cs) { if (cs) post('vehicle/link', { vehicle_id: id, how: 'callsign', callsign: cs }, 'Funkrufname gespeichert – Status aus Alamos wird diesem Fahrzeug zugeordnet.'); });
        return true;
      case 'ivcreate': post('vehicle/link', { name: t.getAttribute('data-v'), how: 'create' }, 'Fahrzeug angelegt – Details unter Technik → Fahrzeuge.'); return true;
      case 'ivdrop': if (confirm('„' + t.getAttribute('data-v') + '“ aus der Auswahl entfernen? Frühere Einträge bleiben.')) post('vehicle/link', { name: t.getAttribute('data-v'), how: 'drop' }, 'Entfernt.'); return true;
      case 'revkeep': case 'revredact':
        var ids = [].map.call(document.querySelectorAll('[data-rev]:checked'), function (el) { return +el.getAttribute('data-rev'); });
        if (!ids.length) return flash('err', 'Bitte zuerst Berichte auswählen.'), true;
        if (act === 'revkeep') {
          MYFUI.ask({ title: 'Weiter aufbewahren', text: 'Bis wann (TT.MM.JJJJ)?', value: '31.12.' + (new Date().getFullYear() + 3), required: true, ok: 'Weiter' }).then(function (until) {
            var um = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(String(until || '').trim()); if (!um) return;
            return MYFUI.ask({ title: 'Weiter aufbewahren', text: 'Grund (wird mit gespeichert), z. B. „Kostenersatz noch offen“:', required: true, ok: 'Speichern' }).then(function (why) {
              if (why) post('incident/retention', { ids: ids, action: 'keep', until: um[3] + '-' + ('0' + um[2]).slice(-2) + '-' + ('0' + um[1]).slice(-2), reason: why }, ids.length + ' Berichte bleiben aufbewahrt.');
            });
          });
        } else {
          if (!confirm(ids.length + ' Berichte: Personenangaben (🔒-Felder) und Alarmtexte endgültig schwärzen? Alles andere bleibt erhalten.')) return true;
          MYFUI.ask({ title: 'Schwärzen', text: 'Vermerk für das Protokoll (optional):', value: 'Prüffrist erreicht', ok: 'Schwärzen' }).then(function (why2) { if (why2 !== null) post('incident/retention', { ids: ids, action: 'redact', reason: why2 }, 'Personenangaben geschwärzt.'); });
        }
        return true;
      case 'webtarget': post('webreports', { target: t.getAttribute('data-v') }, 'Gespeichert.'); return true;
      case 'weblistpage': post('webreports', { create_list_page: true }, 'Seite angelegt.'); return true;
      case 'webpubset': post('incident/pub', { id: id, status: t.getAttribute('data-v') }, t.getAttribute('data-v') === 'publish' ? 'Veröffentlicht.' : 'Gespeichert.'); return true;
      case 'webmode': post('webreports', { mode: t.getAttribute('data-v') }, 'Gespeichert.'); return true;
      case 'webpage': post('webreports', { create_page: true }, 'Seite angelegt.'); return true;
      case 'webveh':
        var pre = {}, veh = {};
        [].forEach.call(document.querySelectorAll('[data-wu]'), function (b) {
          var k = b.getAttribute('data-wu'), pi = b.querySelector('[data-wpre]');
          if (pi) pre[k] = pi.value;
          veh[k] = b.querySelector('[data-wveh]').value.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
        });
        post('webreports', { prefix: pre, vehicles: veh }, 'Gespeichert.'); return true;
      case 'lnkcopy':
        var lu = ui.links[+t.getAttribute('data-v')].url;
        (navigator.clipboard ? navigator.clipboard.writeText(lu) : Promise.reject()).then(function () { flash('ok', 'Link kopiert.'); }, function () { prompt('Link kopieren:', lu); }); return true;
      case 'lnkprint': var li = ui.links[+t.getAttribute('data-v')]; printQrSheet([{ url: li.url, title: li.title, sub: li.sub }]); return true;
      case 'lnkprintveh': printQrSheet(ui.links.filter(function (x) { return x.group === 'Im Fahrzeug aufkleben'; }).map(function (x) { return { url: x.url, title: x.title, sub: x.sub }; })); return true;
      case 'lnkprintsel':
        var ls = [].map.call(root.querySelectorAll('[data-lnk]:checked'), function (c) { var x = ui.links[+c.getAttribute('data-lnk')]; return { url: x.url, title: x.title, sub: x.sub }; });
        if (!ls.length) { flash('err', 'Bitte mindestens einen Code ankreuzen.'); return true; }
        printQrSheet(ls); return true;
      case 'afull':
        if (document.fullscreenElement) document.exitFullscreen(); else (root.closest('#wpcontent') || document.documentElement).requestFullscreen().catch(function () {});
        setTimeout(render, 300); return true;
      case 'demoon': if (confirm('Getrennten Demo-Bestand anlegen? Eure echten Daten bleiben unberührt.')) post('demo', { action: 'on' }, 'Demo-Bestand angelegt – „Demo ansehen“ oder Demo-Logins nutzen.'); return true;
      case 'demooff':
        if (!confirm('Demo beenden und den kompletten Demo-Bestand löschen? Echte Daten bleiben.')) return true;
        // Aus der Demo-Ansicht heraus: erst zurück zu den echten Daten, dann löschen – danach neu laden, damit nichts „Demo“ hängen bleibt
        ((d.demo || {}).ctx ? api('POST', 'admin/demo', { action: 'view', on: false }) : Promise.resolve()).then(function () { return api('POST', 'admin/demo', { action: 'off' }); }).then(function () { location.reload(); }, function (e2) { flash('err', e2.message); });
        return true;
      case 'demoscn': post('demo', { action: 'scenario', step: v }, 'Szenario ausgeführt – die Demo-Dashboards zeigen es innerhalb von Sekunden.'); return true;
      case 'demoview': api('POST', 'admin/demo', { action: 'view', on: t.getAttribute('data-v') === '1' }).then(function () { location.reload(); }, function (e2) { flash('err', e2.message); }); return true;
      case 'hallnewkey': if (confirm('Neuen Link erzeugen? Das Gerät in der Halle braucht danach den neuen Link.')) post('hall', { new_key: true }, 'Neuer Link erzeugt.'); return true;
      case 'alnewkey': if (confirm('Neuen Schlüssel erzeugen? FE2 muss danach die neue Adresse bekommen.')) post('alarm', { new_key: true }, 'Neuer Schlüssel erzeugt.'); return true;
      case 'altest': post('alarm', { test: true }).then(function (r) { flash(r.ok ? 'ok' : 'err', r.message + ' Sichtbar im Mitgliederbereich und auf dem Dashboard.'); }); return true;
      case 'alsave':
        var ab = {}; [].forEach.call(document.querySelectorAll('[data-al]'), function (el) { ab[el.getAttribute('data-al')] = el.tagName === 'SELECT' ? el.value === '1' : el.value; });
        ab.screen_minutes = +ab.screen_minutes; ab.ask_after = +ab.ask_after; ab.map = {};
        [].forEach.call(document.querySelectorAll('[data-almap]'), function (el) { ab.map[el.getAttribute('data-almap')] = el.value; });
        post('alarm', ab, 'Gespeichert.'); return true;
      case 'auditpage': loadAudit(+t.getAttribute('data-v')); return true;
      case 'incrow': ui.incOpen = ui.incOpen === id ? null : id; render(); return true;
      case 'inchint': try { localStorage.setItem('myf-inchint-' + t.getAttribute('data-v'), '1'); } catch (e) {} render(); return true;
      case 'aincpage': ui.incPage = +t.getAttribute('data-v') || 0; render(); return true;
      case 'aincext':
        MYFUI.ask({ title: 'Bericht schon erfasst', text: 'Wo ist der Bericht? z. B. „auf Papier, Ordner Einsätze 2025“ oder „Altbestand vor Wehrwerk“. Der Einsatz zählt dann nicht mehr als offen – rückgängig machen geht jederzeit.', value: 'auf Papier ausgefüllt', required: 'Bitte kurz vermerken, wo der Bericht ist.', ok: 'Vermerken' }).then(function (ex) {
          if (ex) post('incident/report/external', { id: id, note: ex }, 'Vermerkt: Bericht anderweitig erfasst.');
        }); return true;
      case 'aincreopen':
        MYFUI.ask({ title: 'Bericht wieder öffnen', text: 'Warum wird der abgeschlossene Bericht geändert? Steht im Protokoll und am Bericht.', ph: 'z. B. Uhrzeit falsch übertragen', required: 'Bitte einen Grund angeben (mindestens 10 Zeichen).', min: 10, ok: 'Wieder öffnen' }).then(function (rw) {
          if (rw) post('incident/report/reopen', { id: id, reason: rw }, 'Wieder geöffnet – Begründung ist protokolliert.');
        }); return true;
      case 'ainccsv':
        var sens = document.getElementById('ffl-csvsens');
        api('GET', 'incident/export', null, 'year=' + t.getAttribute('data-v') + '&kind=' + t.getAttribute('data-k') + (sens && sens.checked ? '&sensitive=1' : '')).then(function (r) {
          var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([r.csv], { type: 'text/csv;charset=utf-8' })); a.download = r.filename; document.body.appendChild(a); a.click(); a.remove();
          flash('ok', r.rows + ' Zeilen exportiert' + (sens && sens.checked ? ' (mit personenbezogenen Feldern – steht im Protokoll).' : '.'));
        }, function (e2) { flash('err', e2.message); });
        return true;
      case 'aincrep':
        i = by(d.incidents, 'id')[id];
        var withParts = !document.getElementById('ffl-repwith') || document.getElementById('ffl-repwith').checked;
        api('GET', 'admin/incident/report', null, 'id=' + id + '&print=1').then(function (r) {
          MYFPrint.printNow(incDossier(i, MYFPrint.report(Object.assign({}, i, { report: r.report }), r.form || d.report_form, { labels: r.labels }), withParts), true);
        }, function (e) { flash('err', e.message); });
        return true;
      case 'aincpart': i = by(d.incidents, 'id')[id];
        MYFPrint.printNow(MYFPrint.participants(i, d.participation.filter(function (p) { return p.incident_id === id; }), d.members, d.incident_vehicles)); return true;
      case 'ainccert':
        var acp = d.participation.filter(function (p) { return p.incident_id === id && p.cert; });
        MYFCert.print(function (b) { return api('POST', 'admin/incident/cert', b); }, acp.map(function (p) { return p.id; }), acp.some(function (p) { return p.cert === 'requested' && p.confirmed; }), function () { reload(); })
          .catch(function (e2) { flash('err', e2.message); });
        return true;
      case 'aincdel': incDelete(id); return true;
      case 'cvyear': ui.cvYear = +t.getAttribute('data-v'); ui.cv = null; render(); return true;
      case 'cvinc': toLead(id); return true; // Teilnahme bestätigen geht nur auf der Einsatzseite der Führung (Mitgliederbereich)
      case 'cvprint':
        var cvv = t.getAttribute('data-v'), cvids = cvv === 'ready' ? ui.cv.rows.filter(function (x) { return x.cert === 'requested' && x.confirmed && !x.missing.length; }).map(function (x) { return x.id; }) : [+cvv];
        MYFCert.print(function (b) { return api('POST', 'admin/incident/cert', b); }, cvids, ui.cv.rows.some(function (x) { return cvids.indexOf(x.id) >= 0 && x.cert === 'requested'; }),
          function () { ui.cv = null; reload(); }).catch(function (e) { flash('err', e.message); }); return true;
      case 'cvhand':
        var cvh = ui.cv.rows.filter(function (x) { return x.cert === 'issued'; });
        MYFCert.handover(function (b) { return api('POST', 'admin/cert/handover', b); }, cvh, ui.cv.office, (d.who || {}).name, function (r) { flash('ok', r.n + ' ausgehändigt – Ausgabeliste gedruckt.'); ui.cv = null; reload(); }); return true;
      case 'cvhand1':
        var c1 = ui.cv.rows.filter(function (x) { return x.id === +t.getAttribute('data-v'); });
        MYFCert.handover(function (b) { return api('POST', 'admin/cert/handover', b); }, c1, ui.cv.office, (d.who || {}).name, function () { flash('ok', 'Ausgehändigt – Ausgabeliste gedruckt.'); ui.cv = null; reload(); }); return true;
      case 'fsecadd': ui.formDraft = formFromDom(); ui.formDraft.push({ title: 'Neuer Abschnitt', fields: [{ id: '', label: 'Neues Feld', type: 'text', options: [] }] }); render(); return true;
      case 'fsecdel': ui.formDraft = formFromDom(); ui.formDraft.splice(id, 1); render(); return true;
      case 'ffieldadd': ui.formDraft = formFromDom(); ui.formDraft[id].fields.push({ id: '', label: '', type: 'text', options: [] }); render(); return true;
      case 'ffielddel': var sf = t.getAttribute('data-id').split(':'); ui.formDraft = formFromDom(); ui.formDraft[+sf[0]].fields.splice(+sf[1], 1); render(); return true;
      case 'fsave': post('settings', { report_form: formFromDom() }, 'Formular gespeichert.').then(function () { ui.formDraft = null; render(); }); return true;
      case 'freset': if (confirm('Formular auf den Papierbogen zurücksetzen?')) post('settings', { report_form_reset: true }, 'Zurückgesetzt.').then(function () { ui.formDraft = null; render(); }); return true;
      case 'incqr': printQrSheet([{ url: portalUrl('bericht=1'), kicker: 'Nach dem Einsatz', title: 'Warst du dabei?', sub: 'Einmal scannen – du landest direkt beim neuesten Einsatz. Das ersetzt die Papierliste.',
        steps: ['QR-Code mit dem Handy scannen und anmelden (beim ersten Mal mit deinem Konto).', '„Ja, war dabei“ antippen: Fahrzeug und Funktion wählen, bei Bedarf Bescheinigung für den Arbeitgeber.', 'Einsatzführung: Beteiligung bestätigen und den Einsatzbericht ausfüllen.'] }]); return true;
      case 'saveplist':
        var ln = t.getAttribute('data-list'), body = {};
        body[ln] = [].map.call(document.querySelectorAll('[data-plist="' + ln + '"] input'), function (x) { return x.value.trim(); }).filter(Boolean);
        post('settings', body, 'Gespeichert.'); return true;
    }
    return false;
  }

  // ---- Mängel ----------------------------------------------------------------
  var DURG = { out: ['Außer Dienst', 'st-bad'], soon: ['Bald beheben', 'st-warn'], info: ['Hinweis', 'st-open'] };
  var DSTAT = { 'new': 'st-open', progress: 'st-warn', done: 'st-ok', rejected: 'st-no' };
  function tabDefects() {
    var s = d.settings, mem = by(d.members, 'id');
    var list = d.defects.filter(function (x) {
      return (ui.dFilter === 'all' || (ui.dFilter === 'done' ? x.status === 'done' || x.status === 'rejected' : x.status === 'new' || x.status === 'progress')) &&
        (!ui.dObj || x.object === ui.dObj);
    });
    var out = d.defects.filter(function (x) { return x.urgency === 'out' && (x.status === 'new' || x.status === 'progress'); });
    var h = '<div class="ffl-bar"><label><input type="checkbox" data-set="defects_open"' + (s.defects_open !== false ? ' checked' : '') + '> Mängelmeldungen für Mitglieder offen</label>' +
      '<span style="flex:1"></span>' + sel([['', 'alle Fahrzeuge/Bereiche']].concat(d.defect_objects.map(function (o) { return [o, o]; })), ui.dObj || '', 'id="ffl-dobj" style="width:auto"') +
      sel([['open', 'offen'], ['done', 'erledigt'], ['all', 'alle']], ui.dFilter || 'open', 'id="ffl-dfilter" style="width:auto"') +
      '<button type="button" class="ffl-sm" data-act="qrsheet">QR-Codes zum Aufkleben</button></div>';
    if (out.length) h += '<div class="ffl-msg err"><b>Außer Dienst:</b> ' + out.map(function (x) { return esc(x.object) + ' – ' + esc(x.title); }).join(' · ') + '<br><span class="ffl-mu">Steht so auch im ' + APP + '-Start und auf dem Dashboard.</span></div>';

    if (!list.length) h += '<p class="ffl-mu" style="margin-top:16px">Keine Mängel in dieser Ansicht.</p>';
    var UR = { out: 0, soon: 1, info: 2 };
    var L = MYFUI.lt(ui, 'defects', list, { noun: 'Meldungen', ph: 'Fahrzeug, Titel, Text …', per: 20, text: function (x) { return [x.object, x.title, x.text, x.answer].join(' '); },
      csv: { name: 'Maengel', cols: [['Datum', function (x) { return fmtDate(x.created); }], ['Fahrzeug/Bereich', function (x) { return x.object; }], ['Dringlichkeit', function (x) { return x.urgency; }], ['Titel', function (x) { return x.title; }],
        ['Beschreibung', function (x) { return x.text; }], ['Status', function (x) { return x.status; }], ['Antwort', function (x) { return x.answer; }]] },
      sorts: [['offen', 'unbearbeitete zuerst', function (x) { return ({ new: '0', progress: '1' })[x.status] || '2'; }, 1], ['new', 'neueste zuerst', function (x) { return x.created; }, -1], ['urg', 'dringend zuerst', function (x) { return (UR[x.urgency] != null ? UR[x.urgency] : 3) + '|' + x.created; }, 1], ['obj', 'nach Fahrzeug/Bereich', function (x) { return x.object + '|' + x.created; }, 1], ['old', 'älteste zuerst', function (x) { return x.created; }, 1]] });
    h += L.bar;
    L.rows.forEach(function (x) {
      var m = x.member_id ? mem[x.member_id] : null;
      h += '<div class="ffl-idea" data-row="defect" data-id="' + x.id + '"' + (x.urgency === 'out' && x.status !== 'done' && x.status !== 'rejected' ? ' style="border-left:4px solid var(--red)"' : '') + '>' +
        '<div class="ffl-row" style="justify-content:space-between"><div class="ffl-chips"><span class="ffl-chip st-done">' + esc(x.object) + '</span><span class="ffl-chip ' + DURG[x.urgency][1] + '">' + DURG[x.urgency][0] + '</span>' +
        '<span class="ffl-chip ' + DSTAT[x.status] + '">' + esc(d.defect_status[x.status]) + '</span></div>' +
        '<span class="ffl-mu">' + fmtDate(x.created) + ' · ' + (m ? '<a href="#" data-act="profile" data-id="' + m.id + '">' + esc(m.name) + '</a>' : 'Verwaltung') + '</span></div>' +
        '<b style="font-size:17px;display:block;margin-top:8px">' + esc(x.title) + '</b>' + (x.text ? '<div class="ffl-pre-line">' + esc(x.text) + '</div>' : '') +
        (x.photos.length ? '<div class="ffl-row" style="margin-top:8px">' + x.photos.map(function (p) { return '<a href="' + esc(p) + '" target="_blank" rel="noopener"><img src="' + esc(p) + '" alt="Foto" style="width:110px;height:110px;object-fit:cover;border-radius:4px"></a>'; }).join('') + '</div>' : '') +
        '<div class="ffl-row" style="margin-top:10px"><div><label class="ffl-fl">Status</label>' + sel(Object.keys(d.defect_status).map(function (k) { return [k, d.defect_status[k]]; }), x.status, 'data-f="status" style="width:auto"') + '</div>' +
        '<div><label class="ffl-fl">Dringlichkeit</label>' + sel(Object.keys(DURG).map(function (k) { return [k, DURG[k][0]]; }), x.urgency, 'data-f="urgency" style="width:auto"') + '</div></div>' +
        '<label class="ffl-fl">Rückmeldung (sieht der Melder)</label><textarea data-f="answer" rows="2" style="min-height:64px" placeholder="z. B. Ersatzteil bestellt, Werkstatt am Montag">' + esc(x.answer) + '</textarea>' +
        '<div class="ffl-row" style="margin-top:6px"><button type="button" class="ffl-q ffl-sm" style="color:var(--red-tx)" data-act="deldefect" data-id="' + x.id + '">Löschen</button>' +
        '<button type="button" class="ffl-p ffl-sm" style="margin-left:auto" data-act="savedefect" data-id="' + x.id + '">Speichern</button></div></div>';
    });

    h += '<details style="margin-top:22px"><summary class="ffl-mu" style="cursor:pointer">Mangel selbst eintragen (z. B. nach Fahrzeugkontrolle)</summary><div class="ffl-row" style="margin-top:8px">' +
      sel(d.defect_objects.map(function (o) { return [o, o]; }), '', 'id="ffl-ndobj" style="width:auto"') +
      sel(Object.keys(DURG).map(function (k) { return [k, DURG[k][0]]; }), 'soon', 'id="ffl-ndurg" style="width:auto"') +
      '<input type="text" class="ffl-grow" id="ffl-ndtitle" placeholder="Kurzbeschreibung"></div>' +
      '<textarea id="ffl-ndtext" rows="2" style="margin-top:6px;min-height:60px" placeholder="Details (optional)"></textarea>' +
      '<button type="button" class="ffl-p" style="margin-top:6px" data-act="adddefect">Eintragen</button></details>';
    h += '<details style="margin-top:12px"><summary class="ffl-mu" style="cursor:pointer">Auswahlliste bearbeiten (Fahrzeuge kommen automatisch aus der Einsatzverwaltung)</summary>' +
      '<textarea id="ffl-dobjects" style="margin-top:8px">' + esc((s.defect_objects || []).join('\n')) + '</textarea>' +
      '<button type="button" style="margin-top:8px" data-act="savedobjects">Liste speichern</button></details>';
    return h + L.pager + '<div id="ffl-print" class="ffl-print" style="display:none"></div>';
  }

  function qrSvg(text, size) {
    try { var q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: size || 4, margin: 2, scalable: true }); } catch (e) { return ''; }
  }
  function portalUrl(extra) { return d.link + (extra ? (d.link.indexOf('?') >= 0 ? '&' : '?') + extra : ''); }
  // Aushänge mit QR-Code: ein Eintrag = A4-Plakat im Feuerwehr-Stil (Logo, roter Strich, große Überschrift, Schritte);
  // mehrere = Aufkleberbogen, jede Karte mit rotem Kopfstrich
  function printQrSheet(items) {
    var org = (d.brand || {}).org || '', logo = MYF.logo ? '<img class="qr-logo" src="' + esc(MYF.logo) + '" alt="">' : '<b class="qr-org">' + esc(org) + '</b>';
    if (items.length === 1) {
      var it = items[0], host = String(it.url).replace(/^https?:\/\//, '').split('?')[0].replace(/\/$/, '');
      return printNow('<div class="qr-poster"><div class="qr-p-head">' + logo + '</div>' +
        (it.kicker ? '<div class="qr-p-kicker">' + esc(it.kicker) + '</div>' : '') + '<h1>' + esc(it.title) + '</h1>' + (it.sub ? '<p class="qr-p-sub">' + esc(it.sub) + '</p>' : '') +
        '<div class="qr-p-code">' + qrSvg(it.url, 8) + '</div>' +
        ((it.steps || []).length ? '<ol class="qr-p-steps">' + it.steps.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>' : '') +
        '<div class="qr-p-foot"><span>' + esc(org) + '</span><span>' + esc(host) + '</span></div></div>', true);
    }
    printNow('<div class="qr-sheet">' + items.map(function (it) {
      return '<div class="qr-card"><div class="qr-c-bar"></div>' + qrSvg(it.url, 6) + '<b>' + esc(it.title) + '</b><span>' + esc(it.sub) + '</span></div>';
    }).join('') + '</div>', true);
  }

  // Zur Einsatzseite der Führung im Mitgliederbereich (dort werden Teilnahmen bestätigt) – ohne neu zu laden, wenn möglich
  function toLead(incId) {
    var q = 'eid=' + incId + '&reiter=fuehrung';
    if (window.MYFPortalGo && window.MYFAdminClose && d.link) { window.MYFAdminClose(); window.MYFPortalGo(q); } else if (d.link) location.href = d.link + (d.link.indexOf('?') < 0 ? '?' : '&') + q;
  }
  // ---- Benachrichtigungen der Verwaltung (Mängel, Rückfragen, Anfragen …) – getrennt vom persönlichen Postfach ----
  function tabInbox() {
    var ns = d.admin_notes || [], nNew = ns.filter(function (n) { return !n.read; }).length;
    var h = '<div class="ffl-sec" style="margin-top:14px"><div class="ffl-sh">Postfach<em>' + (nNew ? nNew + ' neu' : 'alles gelesen') + '</em></div>' +
            (nNew ? '<button type="button" class="ffl-sm" data-act="anread">Alle als gelesen markieren</button>' : '');
    if (!ns.length) return h + '<p class="ffl-mu">Keine Benachrichtigungen.</p></div>';
    var L = MYFUI.lt(ui, 'anotes', ns, { noun: 'Nachrichten', ph: 'In Nachrichten suchen …', per: 20, text: function (n) { return n.title + ' ' + (n.body || ''); },
      sorts: [['new', 'neueste zuerst', function (n) { return n.created; }, -1], ['unread', 'ungelesene zuerst', function (n) { return (n.read ? '1' : '0') + (9e12 - Date.parse(String(n.created).replace(' ', 'T'))); }, 1]] });
    return h + L.bar + L.rows.map(function (n) {
      return '<div class="ffl-note' + (n.read ? '' : ' is-new') + '"><div style="flex:1"><b>' + esc(n.title) + '</b>' + (n.body ? '<div class="ffl-mu">' + esc(n.body) + '</div>' : '') +
        '<div class="ffl-mu" style="font-size:13px">' + esc(fmtDT(n.created)) + (String(n.key || '').indexOf('done~') === 0 ? ' · vom Team erledigt' : '') + '</div></div><div class="ffl-row" style="flex:0 0 auto">' +
        // Bescheinigung: Teilnahme bestätigt → direkt drucken (wird als ausgestellt vermerkt)
        (function () { var cm = /^cert:(\d+):(\d+)$/.exec(String(n.key || '')); if (!cm || n.read) return '';
          var cp = (d.participation || []).filter(function (p) { return p.incident_id === +cm[1] && p.member_id === +cm[2]; })[0];
          if (cp && !cp.confirmed) return '<button type="button" class="ffl-sm ffl-p" data-act="cvinc" data-id="' + cp.incident_id + '">Teilnahme bestätigen</button>';
          return cp && cp.cert === 'requested' ? '<button type="button" class="ffl-sm ffl-p" data-act="ancert" data-id="' + n.id + '" data-pid="' + cp.id + '">Ansehen & drucken</button>' : ''; })() +
        // Fahrzeug-Anfrage direkt hier freigeben/ablehnen; sonst Knopf mit Verb, der genau an die Stelle führt
        (!n.read && String(n.key || '').indexOf('bkreq:') === 0 ? '<button type="button" class="ffl-sm ffl-p" data-act="anbk" data-v="approved" data-id="' + n.id + '" data-bk="' + esc(String(n.key).slice(6)) + '">Freigeben</button><button type="button" class="ffl-sm" data-act="anbk" data-v="declined" data-id="' + n.id + '" data-bk="' + esc(String(n.key).slice(6)) + '">Ablehnen</button>' : '') +
        '<button type="button" class="ffl-sm" data-act="ango" data-id="' + n.id + '" data-v="' + esc(/^admin:/.test(n.link || '') ? n.link.slice(6) : '~') + '">' + ({ defect: 'Mangel ansehen', message: 'Antworten', idea: 'Ansehen', clothing: 'Bearbeiten', cert: 'Zur Bescheinigung', booking: 'Ansehen', member: 'Profil prüfen', device: 'Gerät prüfen', task: 'Aufgabe ansehen' }[n.kind] || 'Öffnen') + '</button>' +
        '<button type="button" class="ffl-q ffl-sm" data-act="anarch" data-id="' + n.id + '" title="Erledigt – ausblenden">✓</button></div></div>';
    }).join('') + L.pager + '</div>';
  }
  function noteAct(action, ids) { if (!ids.length) return Promise.resolve(); return api('POST', 'me/notifications', { action: action, ids: ids }).then(function () { (d.admin_notes || []).forEach(function (n) { if (!ids.length || ids.indexOf(n.id) >= 0) { n.read = true; if (action === 'archive') n.gone = true; } }); d.admin_notes = (d.admin_notes || []).filter(function (n) { return !n.gone; }); render(); }); }

  // Kopf rechts – wie in der Mitgliederansicht: Postfach, Vollbild, Mitgliederseite, Name mit Funktionen
  function adminHeadR() {
    var w = d.who || {}, I = MYFUI.icons;
    // Glocke: ein Postfach für alles – dasselbe wie auf der Mitgliederseite
    var nAdm = (d.admin_notes || []).filter(function (n) { return !n.read; }).length;
    var bell = w.linked ? '<button type="button" class="ffl-iconbtn ffl-bell" data-act="ainbox" aria-label="Postfach" title="Postfach"' + (ui.tab === 'inbox' ? ' aria-pressed="true"' : '') + '>' +
      I.bell + (nAdm ? '<span>' + nAdm + '</span>' : '') + '</button>' : '';
    var full = FRONT ? '<button type="button" class="ffl-iconbtn" data-adm="full" aria-label="Vollbild" title="Vollbild">' + I.expand + '</button>'
      : '<button type="button" class="ffl-iconbtn" data-act="afull" aria-label="Vollbild" title="Vollbild">' + (document.fullscreenElement ? I.shrink : I.expand) + '</button>';
    var mem = FRONT ? '<button type="button" class="ffl-btn ffl-sm" data-adm="close">← Mitgliederseite</button>' : '<a class="ffl-btn ffl-sm" href="' + esc(d.link) + '" target="_blank" rel="noopener">Mitgliederseite ↗</a>';
    return '<div class="ffl-headr">' + gsBox() + bell + MYFUI.themeBtn() + full + mem + MYFUI.who(w) + '</div>';
  }

  // ---- Suche oben: Bereiche, Mitglieder, Einsätze/Übungen, Fahrzeuge, Geräte, Lehrgänge – nur was man sehen darf, alles im Browser ----
  function gsBox() {
    return '<div class="ffl-gs" role="search"><input type="search" id="ffl-gs" placeholder="Suchen …" title="Tastenkürzel: Strg+K" autocomplete="off" spellcheck="false" aria-label="In der Verwaltung suchen" aria-controls="ffl-gsres" aria-expanded="false">' +
      '<div class="ffl-gsres" id="ffl-gsres" role="listbox" hidden></div></div>';
  }
  var GS_EXTRA = [
    ['Alarm-Schnittstelle (Alamos)', 'data', {}, 'fe2 apager alamos alarm webhook testalarm'], ['Bericht-Formular', 'incidents', { isub: 'form' }, 'einsatzbericht formular vorlage'],
    ['Website-Berichte', 'incidents', { isub: 'web' }, 'homepage veröffentlichen'], ['Aufbewahrung Einsatzberichte', 'incidents', { isub: 'archive' }, 'löschen frist datenschutz'],
    ['Einsatz-Fahrzeuge', 'incidents', { isub: 'vehicles' }, 'fahrzeuge für einsätze verknüpfen einstellungen'], ['Prüffristen Atemschutz', 'agt', { asub: 'rules' }, 'dguv einstellungen'], ['Fahrzeughalle einstellen', 'screen', { ssub: 'hall' }, 'tablet halle einstellungen'], ['Besprechungsraum einstellen', 'screen', { ssub: 'settings' }, 'fernseher einstellungen'], ['Sicherheit', 'security', {}, 'zwei-faktor 2fa xml-rpc check'], ['Atemschutzüberwachung', 'agt', { asub: 'asu' }, 'asü überwachung trupp'],
    ['Atemschutzgeräteträger', 'agt', { asub: 'people' }, 'agt g26 tauglich'], ['Übungsstrecke', 'agt', { asub: 'strecke' }, 'strecke belastung'],
    ['Atemschutzwerkstatt: Geräte', 'agt', { asub: 'devices' }, 'maske pa flasche werkstatt'], ['Fälligkeiten Atemschutz', 'agt', { asub: 'due' }, 'prüfung fällig'],
    ['Fahrtenbuch', 'vehicles', { vsub: 'trips' }, 'km fahrten'], ['Fahrzeug-Anfragen & Buchungen', 'vehicles', { vsub: 'bookings' }, 'bulli mtf buchen'],
    ['Kleider-Katalog & Größen', 'clothing', { csub: 'cat' }, 'größen katalog'], ['Unterweisungen (UVV)', 'briefings', {}, 'uvv dguv unterweisung'],
    ['Website', 'site', {}, 'homepage startseite seiten'], ['Startklar & Neustart', 'start', {}, 'zurücksetzen archiv reset bestand'],
    ['Daten & Schnittstellen', 'data', {}, 'export import csv sicherung backup ical'], ['E-Mail-Versand', 'mail', {}, 'email mail smtp postfach testmail passwort-link spam'], ['Dienstplan-Kalender (iCal)', 'duties', { dsub: 'plan' }, 'dienstplan kalender ical alamos übungsdienste'], ['Protokoll (Änderungen)', 'audit', {}, 'audit änderungsprotokoll revision'],
    ['Rechte: Wer sieht was', 'rights', {}, 'rechte berechtigung hauptadmin funktionen'], ['Dashboard & QR-Codes', 'screen', {}, 'fernseher halle qr tablet']
  ];
  function gsNorm(x) { return String(x || '').toLowerCase().replace(/ß/g, 'ss').replace(/[^a-z0-9äöü/ ]+/g, ' '); }
  function gsMatch(hay, words) { hay = gsNorm(hay); return words.every(function (w) { return hay.indexOf(w) >= 0; }); }
  function gsResults(q) {
    var words = gsNorm(q).split(/\s+/).filter(Boolean); if (!words.length) return [];
    var out = [], add = function (grp, label, sub, go) { out.push({ grp: grp, label: label, sub: sub || '', go: go }); };
    var seen = {};
    (ui._nav || []).forEach(function (g) { g[2].forEach(function (t) {
      if (!allowedTab(t[0]) || seen[t[0]]) return; seen[t[0]] = 1;
      if (gsMatch(t[1] + ' ' + g[1], words)) add('Bereiche', t[1], g[1] !== t[1] ? g[1] : '', { tab: t[0] });
    }); });
    GS_EXTRA.forEach(function (x) { if (allowedTab(x[1]) && gsMatch(x[0] + ' ' + x[3], words)) add('Bereiche', x[0], '', Object.assign({ tab: x[1] }, x[2])); });
    if (allowedTab('members')) d.members.filter(function (m) { return gsMatch(m.name + ' ' + (m.dienstgrad || ''), words); }).slice(0, 8).forEach(function (m) {
      add('Mitglieder', m.name, [m.dienstgrad, (d.units || {})[m.unit], m.active ? '' : 'inaktiv'].filter(Boolean).join(' · '), { member: m.id });
    });
    (d.incidents || []).filter(function (i) { return gsMatch([i.nr, i.title, i.place, (i.start || '').slice(0, 10), fmtDate(i.start)].join(' '), words); }).slice(0, 8).forEach(function (i) {
      var t = i.kind === 'uebung' ? 'uebungen' : 'incidents'; if (!allowedTab(t)) return;
      add(i.kind === 'uebung' ? 'Übungen' : 'Einsätze', (i.nr ? i.nr + ' · ' : '') + i.title, fmtDate(i.start) + (i.place ? ' · ' + i.place : ''), { tab: t, incOpen: i.id, isub: 'list' });
    });
    if (allowedTab('vehicles')) (d.vehicles || []).filter(function (v) { return gsMatch(v.name + ' ' + (v.callsign || ''), words); }).slice(0, 6).forEach(function (v) {
      add('Fahrzeuge', v.name, v.callsign || '', { tab: 'vehicles', vsub: 'list', veh: v.id });
    });
    (d.devices || []).filter(function (x) { return gsMatch([x.nr, x.serial, (rulesOf(x)[x.type] || {}).label, x.maker, x.model].join(' '), words); }).slice(0, 8).forEach(function (x) {
      add('Geräte', ((rulesOf(x)[x.type] || {}).label || x.type) + ' ' + x.nr, [x.maker, x.model, x.location].filter(Boolean).join(' · '), { dev: x.id });
    });
    if (allowedTab('courses')) (d.courses || []).filter(function (c) { return gsMatch((c.short || '') + ' ' + c.title, words); }).slice(0, 6).forEach(function (c) {
      add('Lehrgänge', (c.short ? c.short + ' – ' : '') + c.title, 'Lehrgangsjahr ' + (ui.year || ''), { tab: 'courses', sub: 'courses', open: c.id });
    });
    return out.slice(0, 30);
  }
  function gsPaint(q) {
    var box = document.getElementById('ffl-gsres'), inp = document.getElementById('ffl-gs'); if (!box) return;
    var res = gsResults(q); ui._gs = res; ui._gsi = 0;
    if (!q.trim()) { box.hidden = true; box.innerHTML = ''; inp.setAttribute('aria-expanded', 'false'); return; }
    var last = '', k = 0;
    box.innerHTML = res.length ? res.map(function (r) {
      var h = (r.grp !== last ? '<div class="ffl-gsgrp">' + esc(r.grp) + '</div>' : ''); last = r.grp;
      return h + '<button type="button" role="option" class="ffl-gsitem" data-gsi="' + (k++) + '"' + (k === 1 ? ' aria-selected="true"' : '') + '><b>' + esc(r.label) + '</b>' + (r.sub ? '<small>' + esc(r.sub) + '</small>' : '') + '</button>';
    }).join('') : '<div class="ffl-gsnone">Nichts gefunden.</div>';
    box.hidden = false; inp.setAttribute('aria-expanded', 'true');
  }
  function gsGo(r) {
    if (!r) return;
    var g = r.go;
    ui.profile = null; ui.prof = null;
    if (g.member) { ui.tab = 'members'; loadProfile(g.member); }
    else if (g.dev) {
      var dv = (d.devices || []).filter(function (x) { return x.id === g.dev; })[0];
      ui.dev = g.dev;
      if (!dv || dv.area === 'agt') { ui.tab = 'agt'; ui.asub = 'devices'; ui.wsArea = 'agt'; }
      else if (dv.area === 'vehicles') { ui.tab = 'vehicles'; ui.vsub = 'geraete'; ui.wsub = 'devices'; }
      else { ui.tab = 'teams'; ui.team = dv.area; ui.tsub = 'inv'; ui.wsub = 'devices'; }
    } else {
      ui.tab = g.tab;
      ['isub', 'asub', 'vsub', 'csub', 'ssub', 'sub'].forEach(function (k) { if (g[k]) ui[k] = g[k]; });
      if (g.incOpen) ui.incOpen = g.incOpen;
      if (g.veh) ui.veh = g.veh;
      if (g.open) ui.open = g.open;
      if (g.asub) { ui.dev = null; ui.asuEdit = null; }
    }
    var inp = document.getElementById('ffl-gs'); if (inp) inp.value = '';
    render(); window.scrollTo(0, Math.max(0, root.getBoundingClientRect().top + window.pageYOffset - 10));
  }
  root.addEventListener('input', function (e) { if (e.target.id === 'ffl-gs') gsPaint(e.target.value); });
  function setTouched(e) {
    var el = e.target; if (!el.hasAttribute || !(el.hasAttribute('data-brand') || el.hasAttribute('data-g26d') || el.hasAttribute('data-cvo') || el.hasAttribute('data-mnt') || el.hasAttribute('data-unit') || el.id === 'ffl-logofile')) return;
    ui.setDirty = true; if (el.hasAttribute('data-brand')) ui.setDirtyBrand = true;
    if (el.hasAttribute('data-unit') && ui.units) ui.units[+el.getAttribute('data-unit')].label = el.value;
    var bar = document.getElementById('ffl-setbar'); if (bar) bar.hidden = false;
  }
  function scrTouched(e) {
    var el = e.target, sk = el.hasAttribute && el.hasAttribute('data-sk');
    if (!sk && ['ffl-ical', 'ffl-lat', 'ffl-lon', 'ffl-ars', 'ffl-sreset', 'ffl-snote'].indexOf(el.id) < 0) return;
    ui.scrDirty = true; var bar = document.getElementById('ffl-scrbar'); if (bar) bar.hidden = false;
  }
  root.addEventListener('input', scrTouched);
  root.addEventListener('input', function (e) { if (e.target.id !== 'ffl-dlq') return; var q = e.target.value.trim().toLowerCase(); [].forEach.call(root.querySelectorAll('.ffl-dlitem'), function (b) { b.hidden = q && b.getAttribute('data-q').indexOf(q) < 0; }); if (q) [].forEach.call(root.querySelectorAll('.ffl-dlpast'), function (x) { x.open = true; }); });
  root.addEventListener('input', setTouched); root.addEventListener('change', setTouched);
  // Daten & Schnittstellen: Sicherungskennwort, Aufbewahrung und Alarm-Optionen speichert eine Leiste gemeinsam
  function dataTouched(e) {
    var el = e.target; if (!el.hasAttribute) return;
    var k = el.id === 'ffl-bkpass' ? 'bk' : /^ffl-bk[dwfm]$/.test(el.id) ? 'conf' : el.hasAttribute('data-al') || el.hasAttribute('data-almap') ? 'al' : '';
    if (!k) return;
    ui.dataDirty = ui.dataDirty || {}; ui.dataDirty[k] = true;
    var bar = document.getElementById('ffl-databar'); if (bar) bar.hidden = false;
  }
  root.addEventListener('input', dataTouched); root.addEventListener('change', dataTouched);
  root.addEventListener('keydown', function (e) {
    if (e.target.id !== 'ffl-gs') return;
    var items = root.querySelectorAll('.ffl-gsitem'); if (e.key === 'Escape') { e.target.value = ''; gsPaint(''); e.target.blur(); return; }
    if (!items.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); ui._gsi = (ui._gsi + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      [].forEach.call(items, function (b, i) { b.setAttribute('aria-selected', i === ui._gsi ? 'true' : 'false'); if (i === ui._gsi) b.scrollIntoView({ block: 'nearest' }); });
    }
    if (e.key === 'Enter') { e.preventDefault(); gsGo(ui._gs[ui._gsi]); }
  });
  root.addEventListener('click', function (e) {
    var b = e.target.closest('[data-gsi]'); if (b) { gsGo(ui._gs[+b.getAttribute('data-gsi')]); return; }
    if (!e.target.closest('.ffl-gs')) { var box = document.getElementById('ffl-gsres'); if (box && !box.hidden) box.hidden = true; }
  });
  root.addEventListener('focusin', function (e) { if (e.target.id === 'ffl-gs' && e.target.value) gsPaint(e.target.value); });
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { var i = document.getElementById('ffl-gs'); if (i) { e.preventDefault(); i.focus(); i.select(); } }
  });

  // ---- Dashboard ------------------------------------------------------------
  function tabScreen() {
    var subs = [['notices', 'Hinweise (' + noticeSplit().act.length + ')'], ['links', 'QR-Codes & Links'], ['settings', 'Einstellungen']];
    var cur = ui.ssub || 'notices', isSet = cur === 'settings' || cur === 'hall';
    return '<div class="ffl-subtabs" style="margin-top:12px">' + subs.map(function (x) {
      return '<button type="button" data-act="ssub" data-v="' + x[0] + '" aria-selected="' + (x[0] === 'settings' ? isSet : cur === x[0]) + '">' + x[1] + '</button>';
    }).join('') + '</div>' + (isSet ? setPills('ssub', cur, [['settings', 'Besprechungsraum'], ['hall', 'Fahrzeughalle']]) : '') + (cur === 'notices' ? noticesPanel() : cur === 'hall' ? hallSetup() : cur === 'links' ? linksPanel() : tabScreenSettings());
  }
  // Alle QR-Codes und Links an einer Stelle: drucken, kopieren, aufs iPad legen
  function linksPanel() {
    var L = ui.links = [];
    function add(group, title, sub, url, secret) { L.push({ group: group, title: title, sub: sub, url: url, secret: !!secret }); }
    add('Für alle Mitglieder', 'Mitgliederbereich', 'Start – alles auf einen Blick', portalUrl(''));
    add('Für alle Mitglieder', 'Warst du dabei? / Einsatzbericht', 'Nach dem Einsatz scannen – Einsatzführung landet im Bericht', portalUrl('bericht=1'));
    add('Für alle Mitglieder', 'Fahrtenbuch', 'km-Stand und Tanken eintragen', portalUrl('seite=fahrtenbuch'));
    add('Für alle Mitglieder', 'Fahrzeug buchen', 'Bulli & Co. anfragen', portalUrl('seite=buchen'));
    add('Für alle Mitglieder', 'Mangel melden', 'Etwas kaputt oder fehlt?', portalUrl('seite=maengel'));
    add('Für alle Mitglieder', 'Dienstplan', 'Übungsdienste und Dienstabende', portalUrl('seite=dienstplan'));
    add('Für alle Mitglieder', 'Abfragen', 'Wer hat Zeit? – Brandsicherheitswache, Grünanlagen …', portalUrl('seite=abfragen'));
    add('Für alle Mitglieder', 'Lehrgänge', 'Wünsche eintragen, Zuteilung ansehen', portalUrl('seite=lehrgaenge'));
    (d.vehicles || []).filter(function (v) { return v.active; }).forEach(function (v) {
      add('Im Fahrzeug aufkleben', v.name, 'Ein Code für alles: Fahrt eintragen · Mangel melden' + (v.bookable ? ' · buchen' : ''), portalUrl('fz=' + v.id));
    });
    if (d.settings && d.settings.screen_url) add('Geräte (geheim – nicht aushängen)', 'Dashboard Besprechungsraum', 'Auf dem Fernseher im Besprechungsraum öffnen', d.settings.screen_url, true);
    if (d.hall && d.hall.on && d.hall.url) add('Geräte (geheim – nicht aushängen)', 'Dashboard Fahrzeughalle', 'Tablet/Bildschirm in der Fahrzeughalle', d.hall.url, true);
    var groups = []; L.forEach(function (x) { if (groups.indexOf(x.group) < 0) groups.push(x.group); });
    var h = '<div class="ffl-row" style="margin:14px 0 6px"><span class="ffl-mu" style="flex:1 1 300px">Links für Aushänge, Fahrzeuge und Geräte. Ankreuzen und als Aushang drucken, oder einzeln kopieren und z. B. per Messenger schicken.</span>' +
      '<button type="button" class="ffl-sm ffl-p" data-act="lnkprintsel">Ausgewählte drucken</button></div>';
    h += groups.map(function (g) {
      return '<div class="ffl-sec"><div class="ffl-sh">' + esc(g) + '</div><div class="ffl-links">' + L.map(function (x, k) {
        if (x.group !== g) return '';
        return '<div class="ffl-link' + (x.secret ? ' is-secret' : '') + '"><label class="ffl-check">' + (x.secret ? '' : '<input type="checkbox" data-lnk="' + k + '"' + (/Fahrtenbuch|Mangel|dabei/.test(x.title) && g !== 'Im Fahrzeug aufkleben' ? ' checked' : '') + '>') + '</label>' +
          (x.secret ? (function (sk) { return '<div class="ffl-linkqr" data-secqr="' + sk + '"><span class="ffl-secret-qr">QR verdeckt</span></div><div class="ffl-linktx"><b>' + esc(x.title) + '</b><span class="ffl-mu">' + esc(x.sub) + '</span><code data-sec="' + sk + '">' + esc(secretMask(x.url)) + '</code></div>' +
            '<div class="ffl-linkbtns"><button type="button" class="ffl-sm ffl-q" data-act="secshow" data-v="' + sk + '" aria-pressed="false">Anzeigen</button><button type="button" class="ffl-sm" data-act="seccopy" data-v="' + sk + '">Kopieren</button><button type="button" class="ffl-sm" data-act="secopen" data-v="' + sk + '">Öffnen ↗</button>'; })(secretId(x.url, x.title)) :
          '<div class="ffl-linkqr">' + qrSvg(x.url, 2) + '</div><div class="ffl-linktx"><b>' + esc(x.title) + '</b><span class="ffl-mu">' + esc(x.sub) + '</span><code>' + esc(x.url) + '</code></div>' +
          '<div class="ffl-linkbtns"><button type="button" class="ffl-sm" data-act="lnkcopy" data-v="' + k + '">Kopieren</button><a class="ffl-btn ffl-sm" href="' + esc(x.url) + '" target="_blank" rel="noopener">Öffnen ↗</a>') +
          (x.secret ? '' : '<button type="button" class="ffl-sm" data-act="lnkprint" data-v="' + k + '">Drucken</button>') + '</div></div>';
      }).join('') + '</div>' + (g === 'Im Fahrzeug aufkleben' ? '<button type="button" class="ffl-sm" style="margin-top:8px" data-act="lnkprintveh">Alle Fahrzeug-Codes drucken</button>' : '') + '</div>';
    }).join('');
    h += '<div class="ffl-pbox" style="margin-top:14px"><div class="ffl-sh">Aufs iPad oder Handy legen (wie eine App)</div><ol class="ffl-howto">' +
      '<li><b>iPad/iPhone:</b> Link in Safari öffnen → Teilen-Symbol → „Zum Home-Bildschirm“.</li>' +
      '<li><b>Android:</b> Link in Chrome öffnen → Menü ⋮ → „Zum Startbildschirm hinzufügen“.</li>' +
      '<li><b>Hallen-Tablet:</b> den Halle-Link so ablegen, dann Einstellungen → Bedienungshilfen → „Geführter Zugriff“ einschalten und die App damit sperren; Auto-Sperre auf „Nie“, Ladekabel dran.</li></ol>' +
      '<p class="ffl-mu">Die beiden Geräte-Links sind wie ein Schlüssel – nicht aushängen oder weiterschicken. Bei Verlust unter „Besprechungsraum“ bzw. „Fahrzeughalle“ einen neuen erzeugen.</p></div>';
    return h;
  }

  var NLV = { info: ['Info', 'st-open'], warn: ['Wichtig', 'st-warn'], alert: ['Achtung', 'st-bad'] };
  function nowLocal() { var t = new Date(); return t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2) + ' ' + ('0' + t.getHours()).slice(-2) + ':' + ('0' + t.getMinutes()).slice(-2) + ':' + ('0' + t.getSeconds()).slice(-2); }
  function fmtDT(v) { return v ? fmtDate(v) + (v.slice(11, 16) !== '00:00' ? ' ' + v.slice(11, 16) : '') : ''; }
  function noticeSplit() {
    var now = nowLocal(), l = d.notices || [];
    return { act: l.filter(function (x) { return (!x.ends || x.ends > now) && (!x.starts || x.starts <= now); }),
      plan: l.filter(function (x) { return x.starts && x.starts > now && (!x.ends || x.ends > now); }),
      past: l.filter(function (x) { return x.ends && x.ends <= now; }) };
  }
  function untilPreset(k) {
    var t = new Date(); t.setSeconds(0, 0);
    if (k === 'today') t.setHours(23, 59);
    else if (k === 'tomorrow') { t.setDate(t.getDate() + 1); t.setHours(23, 59); }
    else if (k === 'sunday') { t.setDate(t.getDate() + ((7 - t.getDay()) % 7)); t.setHours(23, 59); }
    else if (k === 'week') { t.setDate(t.getDate() + 7); t.setHours(23, 59); }
    else return '';
    return t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2) + 'T' + ('0' + t.getHours()).slice(-2) + ':' + ('0' + t.getMinutes()).slice(-2);
  }
  function noticesPanel() {
    var e = ui.nedit ? (d.notices.filter(function (x) { return x.id === ui.nedit; })[0] || {}) : (ui.ncopy || {}), lv = ui.nlevel || e.level || 'info', sp = noticeSplit();
    var writers = d.members.filter(function (m) { return m.active && m.can_notice; });
    var h = '<div class="ffl-grid2" style="margin-top:14px"><div class="ffl-pbox"><div class="ffl-sh">' + (ui.nedit ? 'Hinweis bearbeiten' : 'Neuer Hinweis') + '</div>' +
      '<p class="ffl-mu" style="margin-top:0">Steht auf dem Dashboard und auf der ' + APP + '-Startseite. Mehrere gleichzeitig möglich; „Achtung“ erscheint rot und zuerst.</p>' +
      '<textarea id="ffl-ntext" maxlength="300" rows="3" style="min-height:80px" placeholder="z. B. Achtung: Alarmordnung am Wochenende geändert – bitte Mails lesen">' + esc(e.text || '') + '</textarea>' +
      '<div class="ffl-fl">Wie wichtig?</div><div class="ffl-seg3">' + ['info', 'warn', 'alert'].map(function (k) {
        return '<button type="button" data-act="nlevel" data-v="' + k + '" aria-pressed="' + (lv === k) + '" class="lv-' + k + '">' + NLV[k][0] + '</button>';
      }).join('') + '</div>' +
      '<div class="ffl-fl">Anzeigen bis</div><div class="ffl-pills" style="margin-top:0">' + [['', 'bis beendet'], ['today', 'heute'], ['tomorrow', 'morgen'], ['sunday', 'Sonntag'], ['week', '1 Woche']].map(function (p) {
        return '<button type="button" data-act="nuntil" data-v="' + p[0] + '">' + p[1] + '</button>';
      }).join('') + '</div><input type="datetime-local" id="ffl-nends" aria-label="Anzeigen bis" value="' + esc(e.ends ? e.ends.slice(0, 16).replace(' ', 'T') : '') + '" style="margin-top:8px;width:auto">' +
      '<div class="ffl-fl">Ab (optional)</div><input type="datetime-local" id="ffl-nstarts" aria-label="Anzeigen ab" value="' + esc(e.starts ? e.starts.slice(0, 16).replace(' ', 'T') : '') + '" style="width:auto">' +
      '<div class="ffl-fl">Unterschrift (optional, z. B. Funktion)</div><input type="text" id="ffl-nsig" value="' + esc(e.signature || '') + '" placeholder="z. B. Gerätewart, LZ-Führung" style="width:auto;min-width:240px">' +
      '<div class="ffl-row" style="margin-top:12px"><button type="button" class="ffl-go" data-act="nsave">' + (ui.nedit ? 'Speichern' : 'Veröffentlichen') + '</button>' +
      (ui.nedit || ui.ncopy ? '<button type="button" data-act="ncancel">Abbrechen</button>' : '') + '</div></div>';
    var nr = d.rights && d.rights.notices;
    h += '<div class="ffl-pbox"><div class="ffl-sh">Wer darf Hinweise schreiben?</div>' +
      '<p class="ffl-mu" style="margin-top:0">Verwaltung immer – dazu <b>Gruppen</b> (Funktionen, Teams, Merkmale) und einzeln freigegebene <b>Personen</b>. Sie finden im Mitgliederbereich (auch am Handy) die Kachel „Hinweis fürs Dashboard“.</p>' +
      (nr ? '<div class="ffl-fl">Gruppen</div><div data-right="notices"><label class="ffl-check"><input type="checkbox" data-rall="1"' + (nr.all ? ' checked' : '') + '> alle Mitglieder</label>' +
        (nr.all ? '' : '<div class="ffl-chips" style="margin-top:6px">' + d.traits.filter(function (t) { return t.cat === 'funktion' || nr.traits.indexOf(t.id) >= 0; }).map(function (t) {
          return '<label class="ffl-toggle-chip' + (nr.traits.indexOf(t.id) >= 0 ? ' on' : '') + '"><input type="checkbox" data-rtrait="' + t.id + '"' + (nr.traits.indexOf(t.id) >= 0 ? ' checked' : '') + '>' + esc(t.name) + '</label>';
        }).join('') + '</div><p class="ffl-mu" style="margin:6px 0 0">Weitere Merkmale (z. B. Teams) unter <a href="#" data-act="golists">Funktionen & Rechte</a>.</p>') + '</div>'
        : '<p class="ffl-mu">Gruppen: ' + esc(noticeRight()) + '</p>') +
      '<div class="ffl-fl">Einzelne Personen</div>' +
      '<div class="ffl-chips">' + (writers.length ? writers.map(function (m) {
        return '<span class="ffl-chip st-ok">' + esc(m.name) + ' <a href="#" data-act="nright" data-id="' + m.id + '" data-v="0" title="Recht entziehen" style="text-decoration:none;margin-left:4px">✕</a></span>';
      }).join('') : '<span class="ffl-mu">Noch niemand.</span>') + '</div>' +
      '<div class="ffl-row" style="margin-top:10px">' + memberPicker('ffl-nwriter', d.members.filter(function (m) { return m.active && !m.can_notice; }), 'Name tippen, z. B. Gerätewart …') +
      '<button type="button" class="ffl-sm" data-act="naddwriter">Recht geben</button></div>' +
      '<p class="ffl-mu">Das Mitglied braucht ein Konto (E-Mail). Das Recht lässt sich auch im Profil setzen.</p></div></div>';
    function row(x, kind) {
      return '<div class="ffl-notice lv-' + x.level + (kind === 'past' ? ' is-past' : '') + '"><b>' + NLV[x.level][0] + '</b><span>' + esc(x.text) +
        '<small>' + esc([x.starts ? 'ab ' + fmtDT(x.starts) : '', x.ends ? (kind === 'past' ? 'beendet ' : 'bis ') + fmtDT(x.ends) : 'ohne Ende', 'von ' + x.author + (x.updated_by && x.updated_by !== x.author ? ', geändert von ' + x.updated_by : '')].filter(Boolean).join(' · ')) + '</small></span>' +
        '<div class="ffl-row" style="flex:0 0 auto">' + (kind === 'past' ? '<button type="button" class="ffl-sm" data-act="ncopy" data-id="' + x.id + '">Wieder verwenden</button><button type="button" class="ffl-q ffl-sm" data-act="ndel" data-id="' + x.id + '">Löschen</button>'
          : '<button type="button" class="ffl-sm" data-act="nedit" data-id="' + x.id + '">Bearbeiten</button><button type="button" class="ffl-sm" data-act="nend" data-id="' + x.id + '">Beenden</button>') + '</div></div>';
    }
    h += '<div class="ffl-pbox"><div class="ffl-sh">Gerade auf dem Dashboard<em>' + sp.act.length + '</em></div>' + (sp.act.length ? sp.act.map(function (x) { return row(x, 'now'); }).join('') : '<p class="ffl-mu">Keine Hinweise.</p>') +
      (sp.plan.length ? '<div class="ffl-fl">Geplant</div>' + sp.plan.map(function (x) { return row(x, 'plan'); }).join('') : '') +
      (sp.past.length ? '<details style="margin-top:10px"><summary class="ffl-mu" style="cursor:pointer">Beendet (letzte 30 Tage): ' + sp.past.length + '</summary>' + sp.past.map(function (x) { return row(x, 'past'); }).join('') + '</details>' : '') + '</div>';
    return h;
  }
  function keepNoticeForm() { ui.nkeep = { text: (document.getElementById('ffl-ntext') || {}).value, ends: (document.getElementById('ffl-nends') || {}).value, starts: (document.getElementById('ffl-nstarts') || {}).value }; }
  function restoreNoticeForm() {
    if (!ui.nkeep) return;
    ['text', 'ends', 'starts'].forEach(function (k) { var el = document.getElementById('ffl-n' + k); if (el && ui.nkeep[k] != null) el.value = ui.nkeep[k]; });
    ui.nkeep = null;
  }

  function tabScreenSettings() {
    var s = d.settings;
    var h = '<div class="ffl-bar"><label><input type="checkbox" data-set="screen_on"' + (s.screen_on ? ' checked' : '') + '> Dashboard eingeschaltet</label></div>';
    if (!s.screen_on) return h + '<p class="ffl-mu" style="margin-top:14px">Das Dashboard ist eine Seite für den Fernseher im Besprechungsraum: Einsätze dieses Jahr, letzter Einsatz, nächste Termine aus eurem Kalender, Lehrgänge, ' +
      'neuester Website-Beitrag, was außer Dienst ist – und ein QR-Code zu ' + APP + '. Keine persönlichen Daten. Zum Starten oben einschalten.</p>';
    h += '<div class="ffl-fl" style="margin-top:18px">Link für den Fernseher im Besprechungsraum</div>' + secretBox(s.screen_url, { what: 'Link Besprechungsraum', open: true }) +
      '<p class="ffl-mu">Am Fernseher (Smart-TV-Browser, Fire-TV-Stick mit Browser oder Raspberry Pi) diesen Link im Vollbild öffnen. Die Seite aktualisiert sich selbst. ' +
      'Der Link ist geheim – <button type="button" class="ffl-q ffl-sm" style="padding:0" data-act="newscreenkey">neuen Link erzeugen</button>, falls er weitergegeben wurde.</p>' + devPreview(s.screen_url, 1920, 1080, 'Vorschau Dashboard Besprechungsraum');
    h += '<div class="ffl-fl" style="margin-top:18px">Kalender (iCal-Link, z. B. aus Alamos)</div><div class="ffl-row"><input type="text" class="ffl-grow" id="ffl-ical" placeholder="' +
      (s.screen_ical_set ? 'gespeichert: ' + esc(s.screen_ical) + ' – zum Ändern neuen Link einfügen' : 'https://…/cal.ics') + '">' +
      '' + (s.screen_ical_set ? '<button type="button" class="ffl-q" data-act="delical">Entfernen</button>' : '') + '</div>' +
      '<p class="ffl-mu">Der Link wird nur auf dem Server gespeichert und erscheint nie auf dem Bildschirm. Angezeigt werden nur Titel, Zeit und Ort der Termine.</p>';
    var sun = sunTimes(new Date(), s.screen_lat || 51.16, s.screen_lon || 10.45), hhmm = function (x) { return ('0' + x.getHours()).slice(-2) + ':' + ('0' + x.getMinutes()).slice(-2); };
    h += '<div class="ffl-fl" style="margin-top:18px">Wetter & amtliche Warnungen</div>' + locateRow() + '<div class="ffl-row" style="margin-top:8px">' +
      '<label class="ffl-check"><input type="checkbox" data-set="screen_weather"' + (s.screen_weather ? ' checked' : '') + '> aktuelles Wetter (DWD-Daten)</label>' +
      '<label class="ffl-check"><input type="checkbox" data-set="screen_warnings"' + (s.screen_warnings ? ' checked' : '') + '> Warnungen (NINA: DWD, MoWaS, KATWARN …)</label></div>' +
      '<div class="ffl-row" style="margin-top:8px"><label class="ffl-mu">Standort Gerätehaus: Breite</label><input type="text" id="ffl-lat" value="' + esc(s.screen_lat) + '" style="width:110px">' +
      '<label class="ffl-mu">Länge</label><input type="text" id="ffl-lon" value="' + esc(s.screen_lon) + '" style="width:110px">' +
      '<label class="ffl-mu">Regionalschlüssel (Kreis)</label><input type="text" id="ffl-ars" value="' + esc(s.screen_ars) + '" style="width:150px" title="12 Ziffern: Kreisschlüssel + 0000000 – wird bei der Ortssuche automatisch eingetragen">' +
      '</div>' +
      '<p class="ffl-mu">Ort suchen und übernehmen – oder Koordinaten von Hand (z. B. Rechtsklick auf das Gerätehaus in einer Karte). Gelten auch für Sonnenauf-/-untergang. Warnungen kommen für den ganzen Kreis.</p>';
    h += '<div class="ffl-fl" style="margin-top:18px">Bedienung am Bildschirm (Touch oder Maus)</div><div class="ffl-row">' +
      '<label class="ffl-check"><input type="checkbox" data-set="screen_touch"' + (s.screen_touch === false ? '' : ' checked') + '> erlauben: „Einsätze …“ antippen blättert durch die Jahre, Termine und letzte Einsätze lassen sich wischen</label></div>' +
      '<div class="ffl-fl" style="margin-top:14px">Statuszeile unten</div><div class="ffl-row">' +
      '<label class="ffl-check"><input type="checkbox" data-set="screen_vehicles"' + (s.screen_vehicles ? ' checked' : '') + '> Fahrzeugstatus (Funkstatus 1–9 aus der Alarmierung) in der Statuszeile zeigen</label>' +
      '<span class="ffl-mu">Den Knopf „Anwesenheit eintragen“ für den Bildschirm schaltet ihr unter Dashboard → Einstellungen → Fahrzeughalle ein. Beides ist standardmäßig aus – die Statuszeile bleibt dann eine ruhige Zeile.</span></div>' +
      '<div class="ffl-row" style="margin-top:6px"><span class="ffl-mu">Zurück zur Startansicht nach</span><input type="number" id="ffl-sreset" min="1" max="30" value="' + esc(s.screen_reset || 2) + '"><span class="ffl-mu">Minuten ohne Berührung</span>' +
      '</div>';
    if (unitKeys().length > 1) h += '<div class="ffl-fl" style="margin-top:18px">Einheit</div><div class="ffl-row">' +
      sel([['', 'erste Einheit (' + unitName(unitKeys()[0]) + ')']].concat(unitKeys().map(function (u) { return [u, 'nur ' + unitName(u)]; })).concat([['all', 'alle Einheiten']]), s.screen_unit || '', 'data-set="screen_unit" style="width:auto"') +
      '<span class="ffl-mu">Welche Fahrzeuge die Dashboards im Besprechungsraum und in der Fahrzeughalle zeigen – auch für „Fahrt eintragen“.</span></div>';
    h += '<div class="ffl-fl" style="margin-top:18px">Farbschema</div><div class="ffl-row">' +
      sel([['auto', 'Automatisch: tagsüber hell, nachts dunkel'], ['dark', 'Immer dunkel'], ['light', 'Immer hell']], s.screen_theme || 'auto', 'data-set="screen_theme" style="width:auto"') +
      '<span class="ffl-mu">Heute am Gerätehaus: Sonnenaufgang ' + hhmm(sun.rise) + ' Uhr, Sonnenuntergang ' + hhmm(sun.set) + ' Uhr.</span></div>';
    // Einsatzzahlen von Hand: für Jahre, in denen es keine Berichte im System gibt (z. B. vor der Einführung)
    var sm = s.stats_manual || {}, y0 = new Date().getFullYear(), yrs = [y0, y0 - 1, y0 - 2, y0 - 3, y0 - 4];
    h += '<div class="ffl-fl" style="margin-top:18px">Einsatzzahlen von Hand <span class="ffl-mu">(nur für Jahre ohne Einsatzberichte im System – leer lassen = automatisch zählen)</span></div>' +
      '<div class="ffl-scroll"><table class="ffl-table" id="ffl-statsman"><thead><tr><th>Jahr</th><th>gesamt</th><th>Brand</th><th>Hilfeleistung</th><th>Verkehrsunfall</th><th>Fehlalarm</th><th>Sonstiges</th></tr></thead><tbody>' +
      yrs.map(function (y) { var r = sm[y] || {}; return '<tr data-sy="' + y + '"><td><b>' + y + '</b></td>' + ['total', 'brand', 'th', 'vu', 'fehl', 'sonst'].map(function (k) {
        return '<td><input type="number" min="0" data-sk="' + k + '" value="' + (r[k] != null ? r[k] : '') + '" style="width:90px"></td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table></div>';
    h += '<div class="ffl-fl" style="margin-top:18px">Hinweistext unten (wenn nichts außer Dienst ist)</div><div class="ffl-row"><input type="text" class="ffl-grow" id="ffl-snote" value="' + esc(s.screen_note) + '" placeholder="z. B. Dienstabend jeden 2. Dienstag, 19:30 Uhr">' +
      '</div>';
    h += '<div class="ffl-row" style="margin-top:16px"><button type="button" data-act="qrposter">Aushang mit QR-Code zu ' + APP + ' drucken</button></div>';
    h += '<p class="ffl-mu">Schalter und Auswahlfelder gelten sofort. Textfelder speichert die Leiste unten in einem Schritt.</p>' +
      '<div class="ffl-savebar" id="ffl-scrbar"' + (ui.scrDirty ? '' : ' hidden') + '><span>Ungespeicherte Änderungen auf dieser Seite</span><button type="button" class="ffl-q" data-act="scrdiscard">Verwerfen</button><button type="button" class="ffl-p" data-act="scrsave">Speichern</button></div>';
    return h + '<div id="ffl-print" class="ffl-print" style="display:none"></div>';
  }
  // Sonnenauf- und -untergang (wie auf dem Dashboard; Verfahren nach „SunCalc“, BSD)
  function sunTimes(date, lat, lng) {
    var rad = Math.PI / 180, dayMs = 864e5, J1970 = 2440588, J2000 = 2451545, e = rad * 23.4397;
    var lw = rad * -lng, phi = rad * lat, dd = date.valueOf() / dayMs - 0.5 + J1970 - J2000;
    var n = Math.round(dd - 0.0009 - lw / (2 * Math.PI)), ds = 0.0009 + lw / (2 * Math.PI) + n;
    var M = rad * (357.5291 + 0.98560028 * ds);
    var L = M + rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) + rad * 102.9372 + Math.PI;
    var dec = Math.asin(Math.sin(L) * Math.sin(e));
    var Jnoon = J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
    var w = Math.acos((Math.sin(rad * -0.833) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)));
    var Jset = J2000 + 0.0009 + (w + lw) / (2 * Math.PI) + n + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
    function fromJ(j) { return new Date((j + 0.5 - J1970) * dayMs); }
    return { rise: fromJ(Jnoon - (Jset - Jnoon)), set: fromJ(Jset) };
  }
  // Vorschau eines Dashboards (Besprechungsraum, Fahrzeughalle): Seite in Originalgröße laden und auf die Breite verkleinern.
  // Relativer Link, damit www/ohne www oder http/https die Einbettung nicht blockiert; nur ansehen – Tippen geht nicht durch.
  function devPreview(url, w, hgt, title) {
    if (!url) return '';
    var rel = url; try { var u = new URL(url, location.href); rel = u.pathname + u.search; } catch (e) {}
    return '<div class="ffl-fl" style="margin-top:18px">Vorschau <button type="button" class="ffl-sm" style="margin-left:8px" data-act="secopen" data-v="' + secretId(url, title) + '">Öffnen ↗</button></div>' +
      '<div class="ffl-devprev" data-w="' + w + '" style="aspect-ratio:' + w + '/' + hgt + '"><iframe src="' + esc(rel) + '" title="' + esc(title) + '" tabindex="-1" style="width:' + w + 'px;height:' + hgt + 'px"></iframe></div>';
  }
  function scalePreviews() {
    Array.prototype.forEach.call(document.querySelectorAll('.ffl-devprev'), function (box) {
      var f = box.querySelector('iframe'), w = box.clientWidth;
      if (f && w) f.style.transform = 'scale(' + (w / +box.getAttribute('data-w')) + ')';
      if (window.ResizeObserver && !box._ro) { box._ro = new ResizeObserver(scalePreviews); box._ro.observe(box); }
    });
  }
  window.addEventListener('resize', scalePreviews);
  // Nach jedem Neuzeichnen (die Seite wird ohne resize neu aufgebaut)
  if (window.MutationObserver) new MutationObserver(function () { if (document.querySelector('.ffl-devprev')) scalePreviews(); }).observe(root, { childList: true, subtree: true });

  // ---- Anregungen ------------------------------------------------------------
  function tabIdeas() {
    var s = d.settings, mem = by(d.members, 'id');
    var list = d.ideas.filter(function (i) {
      if (ui.iFilter === 'archived') return i.archived;
      if (i.archived) return false;
      return ui.iFilter === 'all' || (ui.iFilter === 'open' ? i.status === 'new' || i.status === 'progress' : i.status === ui.iFilter);
    });
    var h = '<div class="ffl-bar"><label><input type="checkbox" data-set="ideas_open"' + (s.ideas_open ? ' checked' : '') + '> Anregungen für Mitglieder offen</label>' +
      '<span style="flex:1"></span><span class="ffl-mu">Anzeigen</span>' +
      sel([['open', 'neu + in Bearbeitung'], ['new', 'nur neu'], ['done', 'erledigt'], ['declined', 'nicht umgesetzt'], ['withdrawn', 'zurückgezogen'], ['all', 'alle (ohne Archiv)'], ['archived', 'Archiv']], ui.iFilter, 'id="ffl-ifilter"') + '</div>';
    if (!list.length) return h + '<p class="ffl-mu" style="margin-top:16px">Keine Anregungen in dieser Ansicht.</p>';
    var L = MYFUI.lt(ui, 'ideas', list, { noun: 'Anregungen', ph: 'Titel, Text, Antwort …', per: 15, text: function (i) { return [i.subject, i.text, i.answer].join(' '); },
      sorts: [['offen', 'unbeantwortete zuerst', function (i) { return ({ new: '0', progress: '1' })[i.status] || '2'; }, 1], ['new', 'neueste zuerst', function (i) { return i.created; }, -1], ['old', 'älteste zuerst', function (i) { return i.created; }, 1], ['st', 'nach Status', function (i) { return i.status + '|' + i.created; }, 1]] });
    h += L.bar;
    L.rows.forEach(function (i) {
      var m = i.member_id ? mem[i.member_id] : null;
      h += '<div class="ffl-idea" data-row="idea" data-id="' + i.id + '"><div class="ffl-row" style="justify-content:space-between"><b style="font-size:17px">' + esc(i.subject || 'Anregung') + '</b>' +
        sel(Object.keys(ISTATUS).map(function (k) { return [k, ISTATUS[k]]; }), i.status, 'data-f="status" style="width:auto"') + '</div>' +
        '<div class="ffl-mu">' + fmtDate(i.created) + ' · an ' + esc(d.idea_to[i.recipient]) + ' · von ' + (i.anonymous ? '<i>anonym</i>' : esc(memberName(m))) + '</div>' +
        '<div class="ffl-pre-line" style="margin-top:8px">' + esc(i.text) + '</div>' +
        '<label class="ffl-fl">Antwort (sieht das Mitglied)</label><textarea data-f="answer" rows="3" style="min-height:80px">' + esc(i.answer) + '</textarea>' +
        '<div class="ffl-row" style="margin-top:6px"><span class="ffl-mu">' + (i.answered ? 'beantwortet am ' + fmtDate(i.answered) : '') + '</span>' +
        '<button type="button" class="ffl-sm" style="margin-left:auto" data-act="ideaarch" data-v="' + (i.archived ? 0 : 1) + '" data-id="' + i.id + '">' + (i.archived ? 'Aus dem Archiv holen' : 'Archivieren') + '</button>' +
        '<button type="button" class="ffl-q ffl-sm" style="color:var(--red-tx)" data-act="ideadel" data-id="' + i.id + '">Löschen</button>' +
        '<button type="button" class="ffl-p ffl-sm" data-act="saveidea" data-id="' + i.id + '">Antwort speichern</button></div>' +
        (i.status === 'withdrawn' ? '<p class="ffl-mu" style="margin:6px 0 0">Vom Absender zurückgezogen.</p>' : '') + '</div>';
    });
    return h + L.pager;
  }

  // ---- Protokoll -------------------------------------------------------------
  var ACTIONS = {
    'me/need': 'Lehrgangswunsch', 'me/clothing': 'Kleidung gemeldet', 'me/clothing/withdraw': 'Kleidung zurückgezogen', 'me/idea': 'Anregung abgegeben',
    'me/ics/reset': 'Kalender-Link erneuert',
    'admin/settings': 'Einstellungen', 'admin/member': 'Mitglied gespeichert', 'admin/member/delete': 'Mitglied gelöscht',
    'admin/member/invite': 'Einladung verschickt', 'admin/members/bulk': 'Mitglieder importiert',
    'admin/course': 'Lehrgang gespeichert', 'admin/course/delete': 'Lehrgang gelöscht', 'admin/courses/bulk': 'Lehrgänge importiert',
    'admin/courses/copy': 'Lehrgänge kopiert', 'admin/templates/seed': 'Standard-Vorlagen ergänzt',
    'admin/date': 'Termin gespeichert', 'admin/date/delete': 'Termin gelöscht', 'admin/date/complete': 'Teilnahme bestätigt',
    'admin/need': 'Bedarf/Zuteilung geändert', 'admin/need/delete': 'Bedarf gelöscht',
    'admin/qual': 'Lehrgang nachgetragen', 'admin/qual/delete': 'Nachtrag gelöscht', 'admin/agt': 'Atemschutzdaten geändert',
    'admin/agtlog/bulk': 'Atemschutz-Termin eingetragen', 'admin/agtlog/delete': 'Atemschutz-Eintrag gelöscht',
    'admin/clothing': 'Kleidung bearbeitet', 'admin/clothing/delete': 'Kleidung gelöscht', 'admin/idea': 'Anregung bearbeitet',
    'me/sizes': 'Eigene Größen geändert', 'me/name': 'Eigene Angaben geändert', 'admin/member/sizes': 'Größen geändert', 'admin/member/traits': 'Funktionen/Merkmale geändert',
    'admin/stock': 'Ausstattung eingetragen', 'admin/stock/delete': 'Ausstattung entfernt', 'admin/clothitem': 'Katalog geändert', 'admin/clothitem/delete': 'Katalogeintrag gelöscht',
    'admin/trait': 'Merkmal geändert', 'admin/trait/delete': 'Merkmal gelöscht', 'me/defect': 'Mangel gemeldet', 'admin/defect': 'Mangel bearbeitet', 'admin/defect/delete': 'Mangel gelöscht',
    'me/participation': 'Eigene Einsatzbeteiligung', 'me/incident': 'Einsatz angelegt/geändert', 'me/incident/report': 'Einsatzbericht gespeichert', 'me/incident/part': 'Beteiligung gepflegt',
    'admin/incident': 'Einsatz angelegt/geändert', 'admin/incident/report': 'Einsatzbericht gespeichert', 'admin/incident/part': 'Beteiligung gepflegt', 'admin/incident/delete': 'Einsatz gelöscht (mit Begründung)', 'me/incident/delete': 'Einsatz gelöscht (Einsatzführung, mit Begründung)',
    'me/incident/web': 'Website-Bericht erstellt', 'admin/incident/pub': 'Website-Bericht freigegeben/zurückgezogen', 'view:incident/report': 'Einsatzbericht angesehen/gedruckt',
    'retention:incident/report': 'Vertrauliche Felder geleert (alte Löschfrist)', 'admin/incident/retention': 'Aufbewahrung entschieden (weiter aufbewahren / geschwärzt)', 'alarm': 'Alarm empfangen', 'admin/alarm': 'Alarm-Schnittstelle eingestellt',
    'admin/vehicle': 'Fahrzeug geändert', 'admin/vehicle/task': 'Fahrzeug-Frist geändert', 'admin/vehicle/log': 'Fahrzeug-Verlauf eingetragen', 'admin/booking': 'Fahrzeug-Anfrage entschieden', 'me/booking': 'Fahrzeug angefragt',
    'admin/duty': 'Dienstplan geändert', 'admin/duty/slots': 'Dienst-Termine angelegt', 'admin/duty/slot': 'Dienst-Termin geändert', 'admin/duty/assign': 'Dienst-Einteilung geändert', 'me/duty': 'Selbst in Dienst eingetragen',
    'admin/drills': 'Jahresdienstplan geändert', 'admin/board': 'Aushang geändert', 'me/rsvp': 'Zu-/Absage', 'admin/device': 'Gerät geändert', 'admin/check': 'Geräteprüfung eingetragen', 'me/device/used': 'Gerät als benutzt gemeldet',
    'admin/message': 'Rückfrage beantwortet', 'me/message': 'Rückfrage gesendet', 'me/notice': 'Dashboard-Hinweis', 'admin/notice': 'Dashboard-Hinweis', 'admin/notice/delete': 'Dashboard-Hinweis gelöscht',
    'admin/member/noticeright': 'Hinweis-Recht geändert', 'admin/setup': 'Ersteinrichtung', 'admin/teams': 'Teams geändert', 'admin/wsrules': 'Prüffristen geändert', 'admin/team/task': 'Team-Aufgabe',
    'admin/webreports': 'Website-Berichte eingestellt', 'admin/ranks': 'Dienstgrad-Katalog geändert', 'admin/promote': 'Beförderung eingetragen', 'admin/import': 'Import', 'admin/restore': 'Wiederherstellung'
  };
  function changes(row) {
    var b = row.data && row.data.before, a = row.data && row.data.after, out = [];
    if (b && a) Object.keys(a).forEach(function (k) { if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.push(k + ': ' + fmtVal(b[k]) + ' → ' + fmtVal(a[k])); });
    else if (a && !b) out.push('neu: ' + summary(a));
    else if (b && !a) out.push('gelöscht: ' + summary(b));
    else if (row.data && row.data.params) out.push(summary(row.data.params));
    if (row.action === 'login_failed' && row.data) out.push(String(row.data.result || ''));
    return out.join(' · ');
  }
  function fmtVal(v) { return v == null || v === '' ? '–' : typeof v === 'object' ? JSON.stringify(v) : String(v); }
  function summary(o) {
    return Object.keys(o).filter(function (k) { return ['id', 'created', 'items'].indexOf(k) < 0 && o[k] !== '' && o[k] != null; })
      .map(function (k) { return k + '=' + fmtVal(o[k]); }).join(', ').slice(0, 300) + (o.items ? ' (' + o.items.length + ' Einträge)' : '');
  }
  function tabAudit() {
    if (!ui.audit) { loadAudit(); return '<p class="ffl-mu" style="margin-top:14px">Protokoll wird geladen …</p>'; }
    var h = '<div class="ffl-row" style="margin-top:14px"><span class="ffl-mu">' + ui.audit.total + ' Einträge – das Protokoll kann in der Verwaltung weder geändert noch gelöscht werden.</span>' +
      '<span style="flex:1"></span><button type="button" data-act="auditverify">Unverändertheit prüfen</button><button type="button" data-act="auditcsv">Komplett exportieren (CSV)</button>' +
      '<button type="button" data-act="backup" title="Alle ' + APP + '-Daten als Datei">Datensicherung herunterladen</button></div>';
    if (ui.auditCheck) h += '<div class="ffl-msg ' + (ui.auditCheck.ok ? 'ok' : 'err') + '">' + (ui.auditCheck.ok
      ? 'Geprüft: alle ' + ui.auditCheck.count + ' Einträge sind lückenlos und unverändert (Hash-Kette in Ordnung).'
      : 'ACHTUNG: Die Kette ist ab Eintrag #' + ui.auditCheck.broken_id + ' unterbrochen – das Protokoll wurde außerhalb der Verwaltung verändert.') + '</div>';
    var A = ui.audit, pages = Math.max(1, Math.ceil((A.found != null ? A.found : A.total) / 50)), pg = Math.floor((A.offset || 0) / 50);
    h += '<div class="ffl-lt"><input type="search" class="ffl-lt-q" id="ffl-auditq" value="' + esc(ui.auditQ || '') + '" placeholder="Suchen: Name, Aktion, Bereich, Inhalt …"><span class="ffl-lt-n">' +
      (ui.auditQ ? (A.found || 0) + ' Treffer' : A.total + ' Einträge') + (pages > 1 ? ' · Seite ' + (pg + 1) + '/' + pages : '') + '</span></div>';
    var pager = pages > 1 ? '<nav class="ffl-pager"><button type="button" data-act="auditpage" data-v="' + (pg - 1) + '"' + (pg ? '' : ' disabled') + '>‹</button>' +
      [0, pg - 2, pg - 1, pg, pg + 1, pg + 2, pages - 1].filter(function (n, i, a) { return n >= 0 && n < pages && a.indexOf(n) === i; }).sort(function (a, b) { return a - b; }).map(function (n) {
        return '<button type="button" data-act="auditpage" data-v="' + n + '" aria-current="' + (n === pg) + '">' + (n + 1) + '</button>'; }).join('') +
      '<button type="button" data-act="auditpage" data-v="' + (pg + 1) + '"' + (pg < pages - 1 ? '' : ' disabled') + '>›</button></nav>' : '';
    h += '<table class="ffl-table"><thead><tr><th>#</th><th>Zeitpunkt</th><th>Wer</th><th>Aktion</th><th>Änderung</th></tr></thead><tbody>' +
      ui.audit.rows.map(function (r) {
        return '<tr><td class="ffl-mu">' + r.id + '</td><td style="white-space:nowrap">' + esc(fmtDate(r.ts.slice(0, 10)) + ' ' + r.ts.slice(11, 16)) + '</td>' +
          '<td>' + esc(r.actor_name || '–') + ' <span class="ffl-mu">(' + (r.actor_type === 'admin' ? 'Verwaltung' : r.actor_type === 'anonym' ? 'anonym' : 'Mitglied') + ')</span></td>' +
          '<td' + (r.action === 'login_failed' ? ' style="color:var(--red-tx)"' : '') + '>' + esc(ACTIONS[r.action] || r.action) + '</td>' +
          '<td class="ffl-mu" style="font-size:13px;word-break:break-word">' + esc(changes(r)) + '</td></tr>';
      }).join('') + (ui.audit.rows.length ? '' : '<tr><td colspan="5" class="ffl-mu">Nichts gefunden.</td></tr>') + '</tbody></table>' + pager;
    return h;
  }
  function loadAudit(page) {
    api('GET', 'admin/audit', null, 'limit=50&offset=' + ((page || 0) * 50) + (ui.auditQ ? '&q=' + encodeURIComponent(ui.auditQ) : '')).then(function (r) {
      ui.audit = r; render();
      var q = document.getElementById('ffl-auditq'); if (q && ui._auditTyping) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); ui._auditTyping = false; }
    }).catch(function (e) { flash('err', e.message); });
  }
  root.addEventListener('input', function (e) { if (e.target.id !== 'ffl-auditq') return; ui.auditQ = e.target.value; clearTimeout(ui._auditT); ui._auditT = setTimeout(function () { ui._auditTyping = true; loadAudit(0); }, 350); });
  function auditCsv() {
    api('GET', 'admin/audit', null, 'all=1').then(function (r) {
      var rows = [['Nr', 'Zeitpunkt', 'Art', 'Wer', 'Aktion', 'Bereich', 'Datensatz', 'Änderung', 'Daten (JSON)', 'Hash']];
      r.rows.slice().reverse().forEach(function (x) {
        rows.push([x.id, x.ts, x.actor_type, x.actor_name, ACTIONS[x.action] || x.action, x.entity, x.entity_id || '', changes(x), JSON.stringify(x.data), x.hash]);
      });
      var text = '\ufeff' + rows.map(function (row) { return row.map(function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }).join(';'); }).join('\r\n');
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
      a.download = 'Protokoll_' + isoToday() + '.csv';
      document.body.appendChild(a); a.click(); a.remove();
    }).catch(function (e) { flash('err', e.message); });
  }

  // ---- Drucken & Export ------------------------------------------------------
  function tabPrint() {
    // Nur Lehrgangs-Ausdrucke – Atemschutz-Übersicht und Kleidungs-Bestellliste liegen in ihren Bereichen
    var views = [['plan', 'Lehrgangsplanung (wie bisher)'], ['kreis', 'Meldung an den Kreis'], ['people', 'Wer hat was (pro Person)']];
    if (ui.print === 'agt' || ui.print === 'clothing') ui.print = 'plan';
    var h = '<div class="ffl-pills" role="group" aria-label="Ansicht">' + views.map(function (v) {
      return '<button type="button" data-act="printview" data-v="' + v[0] + '" aria-pressed="' + (ui.print === v[0]) + '">' + v[1] + '</button>';
    }).join('') + '</div><div class="ffl-row" style="margin-top:10px"><label class="ffl-row ffl-mu"><input type="checkbox" id="ffl-onlyneeds"' + (ui.printOnlyNeeds ? ' checked' : '') + '> nur Lehrgänge mit Wünschen</label>' +
      '<span style="flex:1"></span><button type="button" data-act="csv" title="Tabelle für Excel herunterladen">↓ Excel</button><button type="button" class="ffl-go" data-act="print">Drucken</button></div>';
    return h + '<div id="ffl-print" class="ffl-print" style="margin-top:16px;border:1px solid var(--line);padding:16px">' + printHtml() + '</div>';
  }

  function printHead(title) {
    return '<div class="pr-head"><div style="text-align:left"><b>' + esc(ORG) + '</b><h1>' + esc(title) + '</h1></div><div>Stand: ' + today() + '</div></div>';
  }

  function printHtml() {
    var mem = by(d.members, 'id'), dates = group(d.dates, 'course_id'), dateById = by(d.dates, 'id');
    var needsBy = group(d.needs.filter(active), 'course_id');

    if (ui.print === 'agt') {
      var ha = printHead('Atemschutzgeräteträger – Übersicht');
      ha += '<table><thead><tr><th>Name</th>' + (multiUnit() ? '<th>Einheit</th>' : '') + '<th>G26 gültig bis</th><th>Übungsstrecke zuletzt</th><th>nächste fällig</th><th>geplant</th><th>Unterweisung zuletzt</th></tr></thead><tbody>';
      d.members.filter(function (m) { return m.active && m.agt; }).forEach(function (m) {
        var i = agtInfo(m), red = ' style="color:#c00;font-weight:bold"';
        ha += '<tr><td><b>' + esc(m.name) + '</b></td>' + (multiUnit() ? '<td>' + esc(unitShort(m.unit)) + '</td>' : '') +
          '<td' + (i.gstate === 'over' ? red : '') + '>' + (i.g26 ? fmtDate(i.g26) : '–') + '</td>' +
          '<td>' + (i.strecke ? fmtDate(i.strecke.date) : 'nie') + '</td>' +
          '<td' + (i.state === 'over' || i.state === 'none' ? red : '') + '>' + (i.due ? fmtDate(i.due) : 'sofort') + '</td>' +
          '<td>' + (i.planned ? fmtDate(i.planned.date) : '') + '</td><td>' + (i.unterweisung ? fmtDate(i.unterweisung.date) : '') + '</td></tr>';
      });
      return ha + '</tbody></table><div class="pr-foot">Übungsstrecke: jährlich · rot = fällig bzw. abgelaufen</div>';
    }

    if (ui.print === 'clothing') {
      var hc = printHead('Kleidung – Bestellliste'), open = d.clothing.filter(function (c) { return c.status === 'open' || c.status === 'ordered'; });
      var sum = {};
      open.forEach(function (c) { var k = c.item + '|' + c.size; (sum[k] = sum[k] || { item: c.item, size: c.size, qty: 0, who: [] }); sum[k].qty += c.qty; sum[k].who.push(memberName(mem[c.member_id]) + (c.qty > 1 ? ' (' + c.qty + ')' : '') + (c.status === 'ordered' ? ' – bestellt' : '') + (c.comment ? ' („' + c.comment + '“)' : '')); });
      hc += '<table><thead><tr><th>Kleidungsstück</th><th>Größe</th><th>Anzahl</th><th>Für</th></tr></thead><tbody>' +
        Object.keys(sum).sort().map(function (k) { var x = sum[k]; return '<tr><td><b>' + esc(x.item) + '</b></td><td>' + esc(x.size) + '</td><td class="n">' + x.qty + '</td><td>' + x.who.map(esc).join('<br>') + '</td></tr>'; }).join('') +
        '</tbody></table>';
      return hc + '<div class="pr-foot">offene und bestellte Meldungen · ' + open.length + ' Positionen</div>';
    }
    var courses = d.courses.filter(function (c) { return !ui.printOnlyNeeds || (needsBy[c.id] || []).length; });
    function names(list, unit, assignedOnly) {
      return list.filter(function (n) { var m = mem[n.member_id]; return m && m.unit === unit && (!assignedOnly || n.status === 'assigned'); })
        .map(function (n) { return esc(memberName(mem[n.member_id])) + (assignedOnly && n.date_id && (dates[n.course_id] || []).length > 1 ? ' <small>(' + esc(range(dateById[n.date_id])) + ')</small>' : ''); }).join('<br>');
    }

    if (ui.print === 'kreis') {
      var h = printHead('Bedarfsmeldung Kreisausbildung ' + ui.year);
      h += '<table><thead><tr><th>Nr.</th><th>Bezeichnung</th><th>Kurzbez.</th><th>Bedarf</th><th>Namentliche Meldung</th><th>Bemerkungen</th></tr></thead><tbody>';
      courses.forEach(function (c) {
        var n = needsBy[c.id] || [];
        h += '<tr><td>' + esc(c.nr) + '</td><td>' + esc(c.title) + '</td><td>' + esc(c.short) + '</td><td class="n">' + (n.length || '') + '</td>' +
          '<td>' + n.map(function (x) { var m = mem[x.member_id]; return esc(memberName(m)) + (m && multiUnit() && unitIdx(m.unit) > 0 ? ' (' + esc(unitShort(m.unit).charAt(0)) + ')' : ''); }).join('<br>') + '</td>' +
          '<td>' + n.filter(function (x) { return x.comment; }).map(function (x) { return esc(memberName(mem[x.member_id]).split(',')[0] + ': ' + x.comment); }).join('<br>') + '</td></tr>';
      });
      return h + '</tbody></table><div class="pr-foot">' + esc(ORG) + (multiUnit() ? ' · ' + unitKeys().slice(1).map(function (k) { return '(' + esc(unitShort(k).charAt(0)) + ') = ' + esc(unitName(k)); }).join(' · ') : '') + ' · ' + d.needs.filter(active).length + (d.needs.filter(active).length === 1 ? ' Meldung' : ' Meldungen') + ' (ohne Zurückgetretene)</div>';
    }

    if (ui.print === 'people') {
      var h2 = printHead('Lehrgänge ' + ui.year + ' – Wer hat was'), byMember = group(d.needs, 'member_id'), courseById = by(d.courses, 'id');
      var list = d.members.filter(function (m) { return byMember[m.id]; });
      h2 += '<table><thead><tr><th style="width:18%">Name</th><th style="width:6%">LZ</th><th>Lehrgang</th><th style="width:12%">Status</th><th style="width:14%">Termin</th><th style="width:10%">Ort</th><th>Voraussetzungen / Hinweis</th></tr></thead><tbody>';
      list.forEach(function (m) {
        var ns = byMember[m.id].slice().sort(function (a, b) { return ({ assigned: 0, waiting: 1, open: 2, declined: 3 })[a.status] - ({ assigned: 0, waiting: 1, open: 2, declined: 3 })[b.status]; });
        ns.forEach(function (n, i) {
          var c = courseById[n.course_id], dt = n.date_id && dateById[n.date_id];
          if (!c) return;
          h2 += '<tr>' + (i === 0 ? '<td rowspan="' + ns.length + '"><b>' + esc(m.name) + '</b></td><td rowspan="' + ns.length + '">' + esc(unitShort(m.unit)) + '</td>' : '') +
            '<td><b>' + esc(c.short) + '</b> ' + esc(c.title) + '</td><td' + (n.status === 'assigned' ? ' style="font-weight:bold"' : '') + '>' + STATUS[n.status] + '</td>' +
            '<td>' + esc(dt ? range(dt) : '') + '</td><td>' + esc(dt ? dt.location : '') + '</td>' +
            '<td>' + (n.status === 'assigned' && c.prereq ? esc(c.prereq) : '') + (n.admin_note ? (c.prereq && n.status === 'assigned' ? '<br>' : '') + '<b>' + esc(n.admin_note) + '</b>' : '') + '</td></tr>';
        });
      });
      return h2 + '</tbody></table>';
    }

    // Lehrgangsplanung im Aufbau der bisherigen Tabelle
    var h3 = printHead('Lehrgangsplanung ' + ui.year), total = 0;
    Object.keys(d.cats).forEach(function (cat) {
      var list = courses.filter(function (c) { return c.cat === cat; });
      if (!list.length) return;
      h3 += '<h2>' + esc(d.cats[cat]) + '</h2><table><thead><tr><th style="width:15%">Lehrgang</th><th style="width:9%">Zeitraum</th><th style="width:7%">Ort</th>' +
        '<th style="width:4%">gem.</th><th style="width:4%">zuget.</th>' + unitKeys().map(function (k, i) { var c = i % 2 ? 'a' : 'l', u = esc(unitName(k)); return '<th class="' + c + '">Namentl. Bedarf ' + u + '</th><th class="' + c + '" style="width:4%">zuget.</th><th class="' + c + '">Namentl. Zuteilung ' + u + '</th>'; }).join('') + '</tr></thead><tbody>';
      list.forEach(function (c) {
        var n = needsBy[c.id] || [], ds = dates[c.id] || [];
        var aU = unitKeys().map(function (k) { return n.filter(function (x) { var m = mem[x.member_id]; return x.status === 'assigned' && m && m.unit === k; }).length; });
        var aAll = n.filter(function (x) { return x.status === 'assigned'; }).length;
        var slots = ds.reduce(function (s, x) { return s + x.slots; }, 0);
        if (c.cost != null) total += c.cost * aAll;
        h3 += '<tr><td><b>' + esc(c.title) + '</b><br><span style="color:#c00;font-weight:bold">' + esc(c.short) + '</span>' + (c.cost != null ? '<br><span style="background:#ff0;font-weight:bold">' + euro(c.cost) + '</span>' : '') + '</td>' +
          '<td>' + ds.map(function (x) { return esc(range(x)); }).join('<br>') + '</td><td>' + ds.map(function (x) { return esc(x.location); }).join('<br>') + '</td>' +
          '<td class="n">' + n.length + '</td><td class="n r">' + slots + '</td>' +
          unitKeys().map(function (k, i) { return '<td>' + names(n, k) + '</td><td class="n r">' + (aU[i] || '') + '</td><td>' + names(n, k, true) + '</td>'; }).join('') + '</tr>';
      });
      h3 += '</tbody></table>';
    });
    return h3 + '<div class="pr-foot">Kosten der Zuteilungen: <b>' + euro(total) + '</b> · gem. = gemeldeter Bedarf · zuget. = vom Kreis zugeteilte Plätze</div>';
  }

  function csv() {
    var mem = by(d.members, 'id'), courseById = by(d.courses, 'id'), dateById = by(d.dates, 'id');
    var rows = [['Name', 'Löschzug', 'Bereich', 'Nr', 'Kurz', 'Lehrgang', 'Status', 'Termin', 'Ort', 'Bemerkung Mitglied', 'Hinweis', 'Kosten']];
    d.needs.forEach(function (n) {
      var m = mem[n.member_id], c = courseById[n.course_id], dt = n.date_id && dateById[n.date_id];
      if (!c) return;
      rows.push([memberName(m), m ? unitName(m.unit) : '', d.cats[c.cat], c.nr, c.short, c.title, STATUS[n.status], dt ? range(dt) : '', dt ? dt.location : '', n.comment, n.admin_note, c.cost == null ? '' : String(c.cost).replace('.', ',')]);
    });
    var text = '﻿' + rows.map(function (r) { return r.map(function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }).join(';'); }).join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    a.download = 'Lehrgaenge_' + ui.year + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
  }

  // ---- Ereignisse ------------------------------------------------------------
  function rowData(tr) {
    var o = { id: +tr.getAttribute('data-id') };
    tr.querySelectorAll('[data-f]').forEach(function (el) { o[el.getAttribute('data-f')] = el.type === 'checkbox' ? el.checked : el.value; });
    return o;
  }

  root.addEventListener('toggle', function (e) { if (e.target.classList && e.target.classList.contains('ffl-devdata')) ui.devDataOpen = e.target.open; }, true);
  root.addEventListener('change', function (e) {
    var t = e.target;
    // Lehrgangs-Ablauf: gewähltes Datum merken, Vorlage ab diesem Datum anwenden
    if (t.hasAttribute('data-sesdate')) { ui.sesDate = ui.sesDate || {}; ui.sesDate[+t.getAttribute('data-sesdate')] = t.value; var wl = t.nextElementSibling; if (wl && wl.tagName === 'B') wl.textContent = t.value ? WDS[wdOf(t.value)] : ''; return; }
    if (t.hasAttribute('data-sesf') || t.hasAttribute('data-sest')) return;
    if (t.hasAttribute('data-sestpl')) {
      var tid = +t.getAttribute('data-sestpl'), tp = (d.session_tpls || [])[+t.value], base = sesPick(tid) || ((by(d.dates, 'id')[tid] || {}).start);
      if (!tp) return;
      if (!base) { t.value = ''; return flash('err', 'Bitte erst das Datum des ersten Tages wählen.'); }
      var tsx = sesOf(tid).concat(tp.items.map(function (y) { return { d: dAdd(base, y.o), f: y.f, t: y.t }; }));
      return sesSave(tid, tsx, 'Vorlage „' + tp.name + '“ ab ' + fmtDate(base) + ' eingetragen.');
    }
    // Fahrzeuge im Einsatz: an/aus und nicht verknüpfte Namen zuordnen
    if (t.hasAttribute('data-incveh')) { post('vehicle/link', { vehicle_id: +t.getAttribute('data-incveh'), how: 'toggle', on: t.checked }, 'Gespeichert.'); return; }
    if (t.hasAttribute('data-ivlink') && t.value) { post('vehicle/link', { name: t.getAttribute('data-ivlink'), vehicle_id: +t.value, how: 'link' }, 'Verknüpft.'); return; }
    // Lehrgangsliste: mehrere auswählen und gemeinsam entfernen
    if (t.hasAttribute('data-cselall')) [].forEach.call(root.querySelectorAll('[data-ccat="' + t.getAttribute('data-cselall') + '"]'), function (x) { x.checked = t.checked; });
    if (t.hasAttribute('data-cselall') || t.hasAttribute('data-csel')) {
      var nSel = root.querySelectorAll('[data-csel]:checked').length, bd = document.getElementById('ffl-cdelsel');
      if (bd) { bd.disabled = !nSel; bd.textContent = nSel ? nSel + ' ausgewählte entfernen' : 'Ausgewählte entfernen'; bd.classList.toggle('ffl-p', nSel > 0); }
      return;
    }
    if (t.id === 'ffl-ifilter') { ui.iFilter = t.value; return render(); }
    if (t.id === 'ffl-mfilter') { ui.mFilter = t.value; return render(); }
    if (t.id === 'ffl-wstype') { ui.wsType = t.value; return render(); }
    if (t.hasAttribute('data-slotf')) { var sb = { id: +t.getAttribute('data-id') }; sb[t.getAttribute('data-slotf')] = +t.value || 0; return post('duty/slot', sb, 'Gespeichert.'); }
    if (t.hasAttribute('data-fms')) return post('vehicle/fms', { id: +t.getAttribute('data-fms'), status: t.value }, 'Status gesetzt.');
    if (t.hasAttribute('data-hall')) {
      var hk = t.getAttribute('data-hall'), hb = {}; hb[hk] = t.type === 'checkbox' ? t.checked : t.value;
      return post('hall', hb, hk === 'on' ? (t.checked ? 'Halle eingeschaltet – Link auf dem Gerät in der Halle öffnen.' : 'Halle ausgeschaltet.') : 'Gespeichert.');
    }
    if (t.getAttribute('data-wf') === 'type') { [].forEach.call(t.closest('[data-wsform]').querySelectorAll('[data-wsfor]'), function (el) { el.hidden = el.getAttribute('data-wsfor') !== t.value; }); return; }
    if (t.hasAttribute('data-tstat')) return post('team/task', { id: +t.getAttribute('data-tstat'), status: t.value }, t.value === 'done' ? 'Erledigt.' : 'Gespeichert.');
    if (t.id === 'ffl-dlsel') { (ui.dlBy = ui.dlBy || {})[ui.dlArea || 'duties'] = +t.value; return render(); }
    if (t.hasAttribute('data-calname')) return post('drills', { ical_label: { i: +t.getAttribute('data-calname'), label: t.value } }, 'Bezeichnung gespeichert.');
    if (t.hasAttribute('data-dlf')) { var fm = t.closest('[data-dlform]'), dlb = { id: +fm.getAttribute('data-dlform') }; [].forEach.call(fm.querySelectorAll('[data-dlf]'), function (el) { dlb[el.getAttribute('data-dlf')] = el.type === 'checkbox' ? el.checked : el.value; }); return post('duty', dlb, 'Gespeichert.'); }
    if (t.id === 'ffl-alon') return post('alarm', { on: t.checked }, t.checked ? 'Alarm-Schnittstelle eingeschaltet.' : 'Ausgeschaltet.');
    if (t.id === 'ffl-impset') { ui.impSet = t.value; ui.impPrev2 = null; return render(); }
    if (t.id === 'ffl-impfile' && t.files[0]) {
      t.files[0].text().then(function (txt) { ui.impPrev2 = mapRows(ui.impSet || document.getElementById('ffl-impset').value, parseCsv(txt)); ui.impSet = document.getElementById('ffl-impset').value; render(); });
      return;
    }
    if (t.id === 'ffl-icsfile' && t.files[0]) { t.files[0].text().then(function (txt) { return api('POST', 'admin/import/ics', { text: txt }); }).then(function (r) { ui.icsEv = r; render(); }, function (e2) { flash('err', e2.message); }); return; }
    if (t.hasAttribute('data-ics')) { ui.icsEv[+t.getAttribute('data-ics')].sel = t.checked; return; }
    if (t.id === 'ffl-wsret') { ui.wsRetired = t.checked; return render(); }
    if (t.id === 'ffl-dfilter') { ui.dFilter = t.value; return render(); }
    if (t.id === 'ffl-dobj') { ui.dObj = t.value; return render(); }
    if (t.id === 'ffl-yearsel') { if (!t.value) return; ui.year = +t.value; resetYearUi(); return reload(); }
    if (t.id === 'ffl-onlyreq') { ui.onlyReq = t.checked; return render(); }
    if (t.id === 'ffl-ckindf') { ui.cKind = t.value; return render(); }
    if (t.hasAttribute('data-set')) {
      var k = t.getAttribute('data-set'), body = {};
      body[k] = t.type === 'checkbox' ? t.checked : t.value;
      return post('settings', body, k === 'open' ? (t.checked ? 'Mitglieder können jetzt Lehrgangswünsche eintragen.' : 'Eintragen beendet – jetzt an den Kreis melden.') : k === 'published' ? (t.checked ? 'Zuteilung ist für Mitglieder sichtbar.' : 'Zuteilung ausgeblendet.') : 'Gespeichert.');
    }
    if (t.id === 'ffl-importcat') { ui.importCat = t.value; return render(); }
    if (t.id === 'ffl-onlyneeds') { ui.printOnlyNeeds = t.checked; return render(); }
    if (t.id === 'ffl-agtonly') { ui.agtOnly = t.checked; return render(); }
    if (t.id === 'ffl-cfilter') { ui.cFilter = t.value; return render(); }
    // Beim Ankreuzen nur den Zähler auf dem Knopf aktualisieren (Liste und Scroll-Position bleiben)
    if (t.hasAttribute('data-tpl')) { ui.tplSel[t.getAttribute('data-tpl')] = t.checked; return countBtn('tpladd', ui.tplSel, ' übernehmen', ''); }
    if (t.hasAttribute('data-agtsel')) { ui.agtSel[t.getAttribute('data-agtsel')] = t.checked; return countBtn('agtsave', ui.agtSel, ' eintragen', 'Für '); }
    if (t.hasAttribute('data-agt')) return post('agt', { id: +t.getAttribute('data-agt'), agt: t.checked }, t.checked ? 'Als AGT markiert.' : 'AGT entfernt.');
    if (t.hasAttribute('data-g26')) return g26Dialog(+t.getAttribute('data-g26'), t);
    if (t.id === 'ffl-mtrait') { ui.mTrait = t.value; return render(); }
    if (t.id === 'ffl-memp') { ui.mEmp = t.value; return render(); }
    if (t.id === 'ffl-mday') { ui.mDay = t.checked; return render(); }
    if (t.id === 'ffl-magt') { ui.mAgt = t.value; return render(); }
    if (t.id === 'ffl-mdept') { ui.mDept = t.value; return render(); }
    if (t.id === 'ffl-litem') { ui.loanItem = t.value; return render(); }
    if (t.id === 'ffl-iyear') { ui.iYear = +t.value || 0; if (ui.lt) { ['inc_einsatz', 'inc_uebung', 'asu'].forEach(function (k) { if (ui.lt[k]) ui.lt[k].page = 0; }); } return reload(); }
    if (t.id === 'ffl-review') return post('settings', { report_review: +t.value }, 'Prüffrist gespeichert.');
    if (t.id === 'ffl-revall') { [].forEach.call(document.querySelectorAll('[data-rev]'), function (el) { el.checked = t.checked; }); return; }
    if (t.hasAttribute('data-sec')) { var sb = {}; sb[t.getAttribute('data-sec')] = t.checked; return post('settings', sb, 'Gespeichert.'); }
    if (t.hasAttribute('data-rall') || t.hasAttribute('data-rtrait')) {
      var rb = t.closest('[data-right]'), rk = rb.getAttribute('data-right'), rights = {};
      var ids = [].map.call(rb.querySelectorAll('[data-rtrait]:checked'), function (x) { return +x.getAttribute('data-rtrait'); });
      // Beim Umschalten auf „nur bestimmte“ die bisherige Auswahl behalten
      if (t.hasAttribute('data-rall') && !t.checked && !ids.length) ids = d.rights[rk].traits;
      rights[rk] = { all: rb.querySelector('[data-rall]').checked, traits: ids };
      return post('settings', { rights: rights }, 'Rechte gespeichert.');
    }
    if ((t.id === 'ffl-newlast' || t.id === 'ffl-newmail') && /\S\s+\S|,/.test(document.getElementById('ffl-newlast').value) && !document.getElementById('ffl-newfirst').value.trim()) {
      var sg = MYFNames.split(document.getElementById('ffl-newlast').value, document.getElementById('ffl-newmail').value);
      document.getElementById('ffl-newlast').value = sg.last; document.getElementById('ffl-newfirst').value = sg.first;
      var hint = document.getElementById('ffl-newhint');
      if (hint) hint.innerHTML = 'Aufgeteilt in Nachname „' + esc(sg.last) + '“ und Vorname „' + esc(sg.first) + '“' + (sg.sure ? ' (' + esc(sg.why) + ').' : ' – <b style="color:var(--warn)">bitte prüfen</b>, ggf. tauschen.');
      return;
    }
    if (t.hasAttribute('data-nright')) return post('member/noticeright', { id: +t.getAttribute('data-nright'), on: t.checked }, t.checked ? 'Darf jetzt Hinweise schreiben.' : 'Recht entzogen.');
    if (t.id === 'ffl-minactive') { ui.mInactive = t.checked; return render(); }
    if (t.id === 'ffl-stockitem') { ui.stockItem = t.value; return render(); }
    if (t.id === 'ffl-stockall') { ui.stockAll = t.checked; return render(); }
    // Kleiderkammer „Für ein Mitglied eintragen“: Größe aus dem Profil des Mitglieds übernehmen (nicht neu erfragen)
    if (t.id === 'ffl-citem' || t.id === 'ffl-cmember') {
      var cm = pickMember('ffl-cmember'), ci = (d.cloth_items || []).filter(function (x) { return x.name === (document.getElementById('ffl-citem') || {}).value; })[0];
      var cz = cm && ci && ci.size_key && cm.sizes ? (cm.sizes[ci.size_key] || '') : '', cs = document.getElementById('ffl-csize');
      if (cs && cz) { cs.value = cz; cs.title = 'aus dem Profil'; }
      return;
    }
    if (t.id === 'ffl-stitem') {
      // Größe aus den Größen des Mitglieds vorschlagen
      var it = by(d.cloth_items, 'id')[t.value], sz = it && it.size_key && ui.prof ? (ui.prof.member.sizes[it.size_key] || '') : '';
      var si = document.getElementById('ffl-ssize'); if (si && sz && !si.value) si.value = sz;
      return;
    }
    if (t.hasAttribute('data-trait')) {
      var box = t.closest('[data-row="mtraits"]');
      var ids = [].map.call(box.querySelectorAll('[data-trait]:checked'), function (x) { return +x.getAttribute('data-trait'); });
      return post('member/traits', { id: +box.getAttribute('data-id'), trait_ids: ids }, 'Merkmale gespeichert.');
    }
    if (t.hasAttribute('data-size')) {
      var srow = t.closest('[data-row="msizes"]'), sizes = {};
      [].forEach.call(srow.querySelectorAll('[data-size]'), function (x) { sizes[x.getAttribute('data-size')] = x.value; });
      return post('member/sizes', { id: +srow.getAttribute('data-id'), sizes: sizes }, 'Größen gespeichert.');
    }
    var tr = t.closest('[data-row]');
    if (!tr) return;
    var r = rowData(tr), type = tr.getAttribute('data-row');
    if (type === 'mtraits') return post('member/traits', { id: r.id, employment: r.employment, day_available: r.day_available, note: r.note }, 'Gespeichert.');
    if (type === 'stock') return post('stock', r, 'Ausstattung gespeichert.');
    if (type === 'clothitem') return post('clothitem', r, 'Katalog gespeichert.');
    if (type === 'trait') return post('trait', r, 'Merkmal gespeichert.');
    if (type === 'date') { r.course_id = +tr.getAttribute('data-course'); return post('date', r, 'Termin gespeichert.'); }
    if (type === 'profile') {
      var hadAcc = !!ui.prof.member.user_id;
      if (!String(r.last).trim()) return flash('err', 'Der Nachname darf nicht leer sein.');
      return post('member', { id: r.id, name: joinName(r.last, r.first), rank: r.rank, birth_date: r.birth_date, birth_place: r.birth_place, street: r.street, phone: r.phone, unit: r.unit, active: r.active, email: r.email, invite: !hadAcc && !!r.email },
        !hadAcc && r.email ? 'Konto angelegt, Einladung verschickt.' : 'Gespeichert.');
    }
    if (type === 'defect') return; // wird mit „Speichern“ übernommen
    if (type === 'idea') { if (t.getAttribute('data-f') === 'status') return post('idea', { id: r.id, status: r.status }, 'Status gespeichert.'); return; }
    if (type === 'clothing') {
      var addStock = r.status === 'issued' && confirm('Ausgegeben – das Teil auch in die Ausstattung des Mitglieds übernehmen?');
      return post('clothing', { id: r.id, status: r.status, admin_note: r.admin_note, add_stock: addStock }, addStock ? 'Ausgegeben und in die Ausstattung übernommen.' : 'Gespeichert.');
    }
    if (type === 'need') {
      var st = r.status.split(':');
      return post('need', { id: r.id, status: st[0], date_id: st[1] ? +st[1] : null, admin_note: r.admin_note });
    }
  });

  // G26 ändern nur bestätigt: Untersuchung am, gültig bis, Nachweis (abgeheftet oder Scan/Foto) – landet im Atemschutz-Verlauf
  function g26Dialog(mid, inp) {
    var m = by(d.members, 'id')[mid] || {}, old = m.g26_until || '', val = inp.value;
    if (!val) { if (old && confirm('G26-Datum bei ' + m.name + ' entfernen? (wird protokolliert)')) post('agt', { id: mid, g26_until: '' }, 'G26-Datum entfernt.'); else inp.value = old; return; }
    var box = document.createElement('div'); box.className = 'ffl-modal';
    box.innerHTML = '<div class="ffl-modal-in" role="dialog" aria-modal="true" aria-label="G26 bestätigen"><div class="ffl-sh">G26 bestätigen</div><p style="margin:0 0 10px"><b>' + esc(m.name) + '</b>' + (old ? ' · bisher gültig bis ' + fmtDate(old) : '') + '</p>' +
      '<div class="ffl-form2"><div><label class="ffl-fl">Untersuchung am</label><input type="date" id="ffl-g26done" value="' + new Date().toISOString().slice(0, 10) + '"></div><div><label class="ffl-fl">Gültig bis</label><input type="date" id="ffl-g26until" value="' + esc(val) + '"></div></div>' +
      '<div class="ffl-fl">Nachweis</div><label class="ffl-check"><input type="radio" name="ffl-g26p" value="filed" checked> Bescheinigung liegt vor und ist abgeheftet</label>' +
      '<label class="ffl-check"><input type="radio" name="ffl-g26p" value="file"> Scan oder Foto hinterlegen</label><input type="file" id="ffl-g26file" accept="image/*,application/pdf" capture="environment" hidden>' +
      '<label class="ffl-fl">Bemerkung (optional)</label><input type="text" id="ffl-g26note" placeholder="z. B. Betriebsarzt Dr. …, Einschränkung Brillenträger">' +
      '<p class="ffl-mu" style="margin:8px 0 0">Gesundheitsangabe: Den Nachweis sehen nur Atemschutz-Zuständige, die Verwaltung und das Mitglied selbst. Die Änderung steht im Atemschutz-Verlauf und im Protokoll.</p>' +
      '<div class="ffl-row" style="margin-top:12px"><button type="button" class="ffl-p" data-g26ok="1">Bestätigen & speichern</button><button type="button" data-g26no="1">Abbrechen</button></div></div>';
    document.body.appendChild(box);
    var fileIn = box.querySelector('#ffl-g26file');
    box.addEventListener('change', function (e) { if (e.target.name === 'ffl-g26p') fileIn.hidden = e.target.value !== 'file'; });
    var close = function () { box.remove(); };
    box.addEventListener('click', function (e) {
      if (e.target === box || e.target.hasAttribute('data-g26no')) { inp.value = old; return close(); }
      if (!e.target.hasAttribute('data-g26ok')) return;
      var proof = box.querySelector('[name=ffl-g26p]:checked').value, fd = new FormData();
      if (proof === 'file' && !fileIn.files[0]) return alert('Bitte Scan oder Foto auswählen.');
      fd.append('id', mid); fd.append('g26_until', box.querySelector('#ffl-g26until').value); fd.append('g26_done', box.querySelector('#ffl-g26done').value);
      fd.append('proof', proof); fd.append('note', box.querySelector('#ffl-g26note').value); if (proof === 'file') fd.append('file', fileIn.files[0]);
      e.target.disabled = true;
      fetch(url('admin/agt'), { method: 'POST', credentials: 'same-origin', headers: { 'X-WP-Nonce': MYF.nonce }, body: fd })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.message || 'Fehler ' + r.status); return j; }); })
        .then(function () { close(); flash('ok', 'G26 gespeichert – steht im Atemschutz-Verlauf.'); return reload(); }, function (err) { e.target.disabled = false; alert(err.message); });
    });
  }
  function countBtn(act, selMap, suffix, prefix) {
    var n = Object.keys(selMap).filter(function (k) { return selMap[k]; }).length, b = root.querySelector('[data-act="' + act + '"]');
    if (b) { b.textContent = prefix + n + suffix; b.disabled = !n; }
  }

  root.addEventListener('input', function (e) {
    if (e.target.id === 'ffl-importtext') {
      ui.importText = e.target.value;
      clearTimeout(ui.t); ui.t = setTimeout(function () {
        render(); var ta = document.getElementById('ffl-importtext'); if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
      }, 400);
    }
    if (e.target.id === 'ffl-icsfilter') {
      ui.icsFilter = e.target.value;
      clearTimeout(ui.icsT); ui.icsT = setTimeout(function () { render(); var el = document.getElementById('ffl-icsfilter'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 300);
    }
    if (e.target.id === 'ffl-memberimport') { ui.memberImport = e.target.value; ui.impPrev = null; }
    if (e.target.id === 'ffl-msearch') {
      ui.mSearch = e.target.value;
      clearTimeout(ui.ms); ui.ms = setTimeout(function () {
        render(); var el = document.getElementById('ffl-msearch'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
      }, 250);
    }
    if (e.target.hasAttribute && e.target.hasAttribute('data-cf')) {
      var k = e.target.getAttribute('data-cf');
      ui.edit[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    }
  });

  root.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act],[data-tab],[data-sub],[data-csub],[data-year],[data-go]');
    if (!t) return;
    if (t.hasAttribute('data-go')) { ui.tab = t.getAttribute('data-go'); if (t.getAttribute('data-gosub')) ui.sub = t.getAttribute('data-gosub'); ui.profile = null; return render(); }
    if (t.hasAttribute('data-tab')) { ui.tab = t.getAttribute('data-tab'); if (t.getAttribute('data-asub')) { ui.asub = t.getAttribute('data-asub'); ui.dev = null; } if (t.getAttribute('data-vsub')) { ui.vsub = t.getAttribute('data-vsub'); ui.veh = null; } if (t.getAttribute('data-gosub')) ui.sub = t.getAttribute('data-gosub'); if (t.getAttribute('data-isub')) { ui.isub = t.getAttribute('data-isub'); ui.cv = null; } ui.profile = null; return render(); }
    if (t.hasAttribute('data-sub')) { ui.sub = t.getAttribute('data-sub'); return render(); }
    if (t.hasAttribute('data-csub')) { ui.csub = t.getAttribute('data-csub'); return render(); }
    if (t.hasAttribute('data-year')) {
      var yv = t.getAttribute('data-year');
      if (yv === 'new') {
        return MYFUI.ask({ title: 'Neues Lehrgangsjahr', text: 'Welches Jahr anlegen?', value: String(Math.max.apply(null, d.years.concat([d.settings.year])) + 1), ok: 'Anlegen' }).then(function (yt) {
          var y = parseInt(yt, 10); if (!(y > 2000 && y < 2100)) return;
          ui.year = y; ui.sub = 'courses'; resetYearUi(); return reload();
        });
      } else {
        if (+yv === 0 && ui.year) ui.lastYear = ui.year;
        ui.year = +yv;
      }
      resetYearUi(); return reload();
    }
    var act = t.getAttribute('data-act'), id = +t.getAttribute('data-id');
    if (incidentAdminClick(act, t, id) || coreAdminClick(act, t, id) || workshopClick(act, t, id) || vehicleClick(act, t, id) || dutyBoardClick(act, t, id) || dataClick(act, t, id) || teamClick(act, t, id)) return;
    switch (act) {
      case 'makecurrent':
        if (!confirm(ui.year + ' zum Abfragejahr machen? Mitglieder melden dann Bedarf für ' + ui.year + '. Die Daten von ' + d.settings.year + ' bleiben im Archiv.')) return;
        return post('settings', { year: ui.year, open: false, published: false }, ui.year + ' ist jetzt das Abfragejahr.');
      case 'opencourse': ui.open = ui.open === id ? null : id; return render();
      case 'gocourse':
        var gy = +t.getAttribute('data-v') || ui.year, jump = function () { setTimeout(function () { var c = root.querySelector('.ffl-acard.is-open'); if (c) c.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 60); };
        ui.tab = 'courses'; ui.sub = 'plan'; ui.profile = null;
        if (gy !== ui.year) { ui.year = gy; resetYearUi(); ui.open = id; reload().then(jump); return true; }
        ui.open = id; render(); jump(); return true;
      case 'adddate': ui.newDate = id; render(); var f0 = document.getElementById('ffl-nd-start'); if (f0) f0.focus(); return true;
      case 'ndcancel': ui.newDate = null; render(); return true;
      case 'ndsave':
        var nds = val2('ffl-nd-start');
        if (!nds && !val2('ffl-nd-loc')) return flash('err', 'Bitte mindestens den Zeitraum oder den Ort eintragen.'), true;
        post('date', { course_id: id, start: nds, end: val2('ffl-nd-end') || nds, location: val2('ffl-nd-loc'), slots: +val2('ffl-nd-slots') || 0, period: '' }, 'Termin gespeichert – jetzt den Ablauf eintragen.')
          .then(function (r) { ui.newDate = null; ui.sesDate = ui.sesDate || {}; if (nds) ui.sesDate[r.id] = nds; render(); });
        return true;
      case 'sesadd': case 'sesown':
        var sd = sesPick(id); if (!sd) return flash('err', 'Bitte erst ein Datum wählen.'), true;
        var tm = act === 'sesadd' ? t.getAttribute('data-v').split('-') : [(root.querySelector('[data-sesf="' + id + '"]') || {}).value || '', (root.querySelector('[data-sest="' + id + '"]') || {}).value || ''];
        var ss = sesOf(id); ss.push({ d: sd, f: tm[0], t: tm[1] });
        ui.sesDate = ui.sesDate || {}; ui.sesDate[id] = dAdd(sd, 1); // nächster Tag gleich vorgeschlagen
        sesSave(id, ss); return true;
      case 'sesweekend':
        var sw = sesPick(id); if (!sw) return flash('err', 'Bitte erst ein Datum wählen (Freitag oder Samstag).'), true;
        var fri = wdOf(sw) === 6 ? dAdd(sw, -1) : sw;
        if (wdOf(fri) !== 5 && !confirm('Das gewählte Datum ist kein Freitag. Trotzdem ' + fmtDate(fri) + ' 18–22 und den Tag danach 8–17 eintragen?')) return true;
        var sw2 = sesOf(id); sw2.push({ d: fri, f: '18:00', t: '22:00' }, { d: dAdd(fri, 1), f: '08:00', t: '17:00' });
        ui.sesDate = ui.sesDate || {}; ui.sesDate[id] = dAdd(fri, 7);
        sesSave(id, sw2, 'Wochenende eingetragen.'); return true;
      case 'sesdel': e.preventDefault(); var sx = sesOf(id); sx.splice(+t.getAttribute('data-v'), 1); sesSave(id, sx, 'Tag entfernt.'); return true;
      case 'sesclear': if (confirm('Alle Tage dieses Termins entfernen?')) sesSave(id, [], 'Ablauf geleert.'); return true;
      case 'sessavetpl':
        var sv = sesOf(id); if (!sv.length) return true;
        MYFUI.ask({ title: 'Ablauf-Muster speichern', text: 'Name des Musters, z. B. „Truppmann: 2 Wochenenden + 3 Abende“', required: true, ok: 'Speichern' }).then(function (tn) {
          if (!tn) return;
        post('date/tpl', { name: tn, items: sv.map(function (y) { return { o: Math.round((new Date(y.d + 'T12:00:00') - new Date(sv[0].d + 'T12:00:00')) / 864e5), f: y.f, t: y.t }; }) }, 'Ablauf-Muster gespeichert – bei jedem Termin unter „Ablauf-Muster anwenden“.');
        });
        return true;
      case 'addstock':
        var sit = document.getElementById('ffl-stitem').value;
        if (!sit) return flash('err', 'Bitte ein Teil auswählen.');
        return post('stock', { member_id: id, item_id: +sit, size: document.getElementById('ffl-ssize').value, qty: +document.getElementById('ffl-sqty').value || 1,
          issued: document.getElementById('ffl-sissued').value, serial: document.getElementById('ffl-sserial').value, made_year: document.getElementById('ffl-smade').value }, 'Eingetragen.');
      case 'delstock': if (confirm('Diesen Eintrag endgültig löschen? (Nur bei Fehleingabe – sonst Status „Zurückgegeben“ oder „Ausgesondert“ setzen, dann bleibt der Verlauf erhalten.)')) post('stock/delete', { id: id }); return;
      case 'addclothitem':
        var nin = document.getElementById('ffl-newitem').value.trim();
        if (!nin) return;
        return post('clothitem', { name: nin, cat: document.getElementById('ffl-newitemcat').value, procurable: true, active: true, sort: 999 }, nin + ' hinzugefügt.');
      case 'delclothitem': if (confirm('Teil aus dem Katalog löschen?')) post('clothitem/delete', { id: id }, 'Gelöscht.'); return;
      case 'addtrait':
        var ntr = document.getElementById('ffl-newtrait').value.trim();
        if (!ntr) return;
        return post('trait', { name: ntr, cat: document.getElementById('ffl-newtraitcat').value }, ntr + ' hinzugefügt.');
      case 'deltrait': if (confirm('Merkmal löschen? Es wird auch bei allen Mitgliedern entfernt.')) post('trait/delete', { id: id }, 'Gelöscht.'); return;
      case 'printstock':
        var tbl = document.getElementById('ffl-stocktable');
        if (!tbl) return;
        var sel2 = document.getElementById('ffl-stockitem');
        return printNow(printHead('Ausstattung – ' + (sel2.value ? sel2.options[sel2.selectedIndex].text : 'Wer hat was')) + tbl.outerHTML);
      case 'savedefect':
        var dbox = t.closest('[data-row="defect"]'), dv = rowData(dbox);
        return post('defect', { id: id, status: dv.status, urgency: dv.urgency, answer: dv.answer }, 'Gespeichert – der Melder sieht den Stand.');
      case 'deldefect': if (confirm('Mangel samt Fotos endgültig löschen? (Besser: Status „Erledigt“ oder „Kein Mangel“.)')) post('defect/delete', { id: id }, 'Gelöscht.'); return;
      case 'adddefect':
        var ndt = document.getElementById('ffl-ndtitle').value.trim();
        if (!ndt) return flash('err', 'Bitte eine Kurzbeschreibung eintragen.');
        return post('defect', { object: document.getElementById('ffl-ndobj').value, urgency: document.getElementById('ffl-ndurg').value, title: ndt, text: document.getElementById('ffl-ndtext').value }, 'Eingetragen.');
      case 'savedobjects':
        return post('settings', { defect_objects: document.getElementById('ffl-dobjects').value.split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean) }, 'Liste gespeichert.');
      case 'qrsheet':
        return printQrSheet(d.defect_objects.map(function (o) { return { url: portalUrl('mangel=' + encodeURIComponent(o)), title: 'Mangel melden: ' + o, sub: 'Scannen – ' + APP + ' öffnet sich mit „' + o + '“' }; }));
      case 'qrposter':
        return printQrSheet([{ url: d.link, title: '' + APP + '', sub: 'Lehrgänge · Kalender · Kleidung · Mängel melden · Anregungen – scannen und mit deinem Konto anmelden' }]);
      case 'newscreenkey': if (confirm('Neuen Link erzeugen? Der Fernseher braucht dann den neuen Link.')) post('settings', { new_screen_key: true }, 'Neuer Link erzeugt.'); return;
      case 'scrsave':
        // Dashboard: alle Textfelder in einem Schritt (Kalender nur, wenn ein neuer Link eingefügt wurde)
        var ic = ((document.getElementById('ffl-ical') || {}).value || '').trim(), sb = { screen_lat: val2('ffl-lat').replace(',', '.'), screen_lon: val2('ffl-lon').replace(',', '.'), screen_ars: val2('ffl-ars'), screen_reset: +val2('ffl-sreset') || 2, screen_note: val2('ffl-snote') };
        if (ic) { if (!/^(https?|webcal):\/\//.test(ic)) return flash('err', 'Bitte einen gültigen Kalender-Link (https://… oder webcal://…) einfügen.'); sb.screen_ical = ic; }
        var smb = {}; [].forEach.call(document.querySelectorAll('#ffl-statsman [data-sy]'), function (tr) {
          var row = {}; [].forEach.call(tr.querySelectorAll('[data-sk]'), function (el) { if (el.value !== '') row[el.getAttribute('data-sk')] = +el.value; });
          if (row.total != null) smb[tr.getAttribute('data-sy')] = row;
        }); sb.stats_manual = smb;
        return post('settings', sb, 'Gespeichert.').then(function () { ui.scrDirty = false; render(); });
      case 'scrdiscard': ui.scrDirty = false; render(); return true;
      case 'delical': if (confirm('Kalender-Link entfernen?')) post('settings', { screen_ical: '' }, 'Kalender entfernt.'); return;
      case 'locate':
        ui.locQ = val2('ffl-locq');
        return api('POST', 'admin/locate', { q: ui.locQ }).then(function (r) { ui.locRes = r.results || []; render(); }, function (e) { flash('err', e.message); });
      case 'locpick':
        var lr = ui.locRes[+t.getAttribute('data-i')], setv = function (i, v) { var el = document.getElementById(i); if (el && v !== '' && v != null && (i.indexOf('su-') !== 0 || !el.value)) el.value = v; };
        setv('ffl-lat', lr.lat); setv('ffl-lon', lr.lon); setv('ffl-ars', lr.ars); setv('su-place', lr.place); setv('su-zip', lr.zip);
        if (document.getElementById('ffl-scrbar')) { ui.scrDirty = true; document.getElementById('ffl-scrbar').hidden = false; }
        var box = document.getElementById('ffl-locres'); if (box) box.innerHTML = '<p class="ffl-mu">Übernommen: ' + esc(lr.name) + (lr.county ? ' · Warnungen für ' + esc(lr.county) : '') + '</p>';
        ui.locRes = null; return;
      case 'unitadd': ui.setDirty = true; readUnits(); ui.units.push({ key: '', label: '' }); return render();
      case 'unitdel': ui.setDirty = true; readUnits(); ui.units.splice(+t.getAttribute('data-i'), 1); return render();
      case 'setupsave':
        var org = val2('su-org').trim();
        if (!org) return flash('err', 'Bitte den Namen der Feuerwehr eintragen.');
        var place = val2('su-place').trim();
        return api('POST', 'admin/setup', {
          brand: { org: org, place: place, zip: val2('su-zip'), address: val2('su-address'), website: val2('su-website'), line3: place.toUpperCase() },
          units: readUnits(), screen_lat: val2('ffl-lat').replace(',', '.'), screen_lon: val2('ffl-lon').replace(',', '.'), screen_ars: val2('ffl-ars')
        }).then(function () { location.reload(); }, function (e) { flash('err', e.message); });
      case 'newyear': ui.newYear = !ui.newYear; return render();
      case 'missing': ui.showMissing = !ui.showMissing; return render();
      case 'createyear':
        var ny = +document.getElementById('ffl-ny').value, src = (root.querySelector('input[name="ffl-nysrc"]:checked') || {}).value;
        if (!(ny > 2000 && ny < 2100)) return flash('err', 'Bitte ein gültiges Jahr eintragen.');
        if (d.years.indexOf(ny) >= 0 && !confirm('Für ' + ny + ' gibt es schon Lehrgänge. Trotzdem ergänzen?')) return;
        var makeCur = document.getElementById('ffl-nycur').checked;
        var job = src === 'tpl' ? api('POST', 'admin/courses/copy', { ids: d.templates.filter(function (c) { return !c.hidden; }).map(function (c) { return c.id; }), to: ny })
          : src === 'year' ? api('POST', 'admin/courses/copy', { from: +document.getElementById('ffl-nyfrom').value, to: ny }) : Promise.resolve({ added: 0 });
        return job.then(function (r) {
          var setts = makeCur ? { year: ny, open: false, published: false, add_year: ny } : { add_year: ny };
          return api('POST', 'admin/settings', setts).then(function () {
            ui.newYear = false; ui.year = ny; ui.sub = 'courses';
            return reload().then(function () { flash('ok', ny + ' angelegt' + (r.added ? ' mit ' + r.added + ' Lehrgängen' : '') + (makeCur ? ' und als Abfragejahr gesetzt.' : '.')); });
          });
        }).catch(function (e2) { flash('err', e2.message); });
      case 'gokreis': ui.sub = 'print'; ui.print = 'kreis'; return render();
      case 'pview': ui.pview = t.getAttribute('data-v'); return render();
      case 'cyear': ui.year = +t.getAttribute('data-v'); resetYearUi(); return reload();
      case 'needdone':
        var nd = d.needs.filter(function (x) { return x.id === id; })[0]; if (!nd) return;
        return post('need', { id: nd.id, status: t.getAttribute('data-v'), date_id: nd.date_id, admin_note: nd.admin_note || '' }, t.getAttribute('data-v') === 'completed' ? 'Als absolviert eingetragen.' : 'Als „nicht teilgenommen“ eingetragen.');
      case 'completedate':
        if (!confirm('Alle Zugeteilten dieses Termins als „absolviert“ eintragen? (Wer nicht teilgenommen hat, danach einzeln ändern.)')) return;
        return post('date/complete', { id: id }).then(function (r) { flash('ok', r.updated + ' als absolviert eingetragen.'); });
      case 'deldate': if (confirm('Termin löschen? Zuteilungen zu diesem Termin werden auf „Offen“ gesetzt.')) post('date/delete', { id: id }); return;
      case 'addneed':
        var anm = pickMember('ffl-addneed-' + id);
        if (!anm) return flash('err', 'Mitglied nicht eindeutig gefunden – bitte den Namen aus den Vorschlägen wählen.');
        return post('need', { member_id: anm.id, course_id: id, status: 'open' }, 'Bedarf für ' + anm.name + ' nachgetragen.');
      case 'delneed': if (confirm('Diesen Bedarf löschen?')) post('need/delete', { id: id }); return;
      case 'newcourse': ui.edit = { cat: 'kreis_lg', year: ui.year }; ui.importOpen = false; return render();
      case 'editcourse': ui.edit = Object.assign({}, d.courses.filter(function (c) { return c.id === id; })[0]); ui.importOpen = false; render(); return root.scrollIntoView();
      case 'canceledit': ui.edit = null; return render();
      case 'savecourse':
        var c = Object.assign({}, ui.edit, { year: ui.year });
        root.querySelectorAll('[data-cf]').forEach(function (el) { c[el.getAttribute('data-cf')] = el.type === 'checkbox' ? el.checked : el.value; });
        if (!String(c.title || '').trim()) return flash('err', 'Bitte eine Bezeichnung eintragen.');
        return post('course', c, 'Lehrgang gespeichert.').then(function () { ui.edit = null; render(); });
      case 'rkfix': ui.rkFix = { id: id, kind: t.getAttribute('data-v'), label: t.getAttribute('data-l') || '' }; render(); var rf = document.getElementById(ui.rkFix.kind === 'since' ? 'ffl-rkfix-date' : 'ffl-rkfix-year'); if (rf) rf.focus(); return true;
      case 'rkfixno': ui.rkFix = null; render(); return true;
      case 'rkfixsave':
        var rm = by(d.members, 'id')[id], rfx = ui.rkFix || {};
        if (rfx.kind === 'since') {
          var rsd = val2('ffl-rkfix-date'); if (!rsd) return flash('err', 'Bitte ein Datum wählen.'), true;
          post('member', { id: id, name: rm.name, unit: rm.unit, rank_since: rsd }, 'Gespeichert – Wartezeit wird jetzt berechnet.').then(function () { ui.rkFix = null; render(); });
        } else {
          var ry = +val2('ffl-rkfix-year'); if (!ry) return flash('err', 'Bitte das Jahr eintragen.'), true;
          post('qual', { member_id: id, title: rfx.label, year: ry }, 'Nachweis eingetragen.').then(function () { ui.rkFix = null; render(); });
        }
        return true;
      case 'agtcourseall':
        var nc = d.members.filter(function (m) { return m.active && m.agt && !m.agt_course; });
        if (!confirm('Für ' + nc.length + ' Geräteträger den Lehrgang „Atemschutzgeräteträger“ als vorhanden eintragen? Bitte nur, wenn er wirklich gemacht wurde.')) return true;
        nc.reduce(function (pr, m) { return pr.then(function () { return api('POST', 'admin/qual', { member_id: m.id, title: 'Atemschutzgeräteträger', note: 'vor ' + APP + ' – nachgetragen' }); }); }, Promise.resolve())
          .then(function () { flash('ok', 'Lehrgang nachgetragen.'); return reload(); }, function (e2) { flash('err', e2.message); reload(); });
        return true;
      case 'matup':
        var mk = document.getElementById('ffl-matkey'), mf = document.getElementById('ffl-matfile').files[0], mu = val2('ffl-maturl').trim();
        if (!mk.value) return flash('err', 'Bitte den Lehrgang wählen.'), true;
        if (!mf && !mu) return flash('err', 'Bitte eine Datei wählen oder einen Link eintragen.'), true;
        if (mf && d.mat_max && mf.size > d.mat_max) return flash('err', 'Die Datei ist zu groß (höchstens ' + sizeTxt(d.mat_max) + '). Große Videos besser als Link.'), true;
        var fd = new FormData(); fd.append('ckey', mk.value); fd.append('course', mk.options[mk.selectedIndex].text); fd.append('title', val2('ffl-mattitle')); if (mf) fd.append('file', mf); else fd.append('url', mu);
        ui.matKey = mk.value; t.disabled = true; document.getElementById('ffl-matstate').textContent = mf ? 'Lade hoch … ' + sizeTxt(mf.size) : 'Speichere …';
        fetch(url('admin/material'), { method: 'POST', credentials: 'same-origin', headers: { 'X-WP-Nonce': MYF.nonce }, body: fd })
          .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.message || 'Fehler ' + r.status); return j; }); })
          .then(function () { flash('ok', 'Unterlage abgelegt.'); return reload(); }, function (e2) { t.disabled = false; flash('err', e2.message); });
        return true;
      case 'phload': phLoad('offen', 1); return true;
      case 'phfilter': phLoad(t.getAttribute('data-v'), 1); return true;
      case 'phpage':
        if (ui.ph && Object.keys(ui.ph.edit).length && !confirm('Geänderte Fotos auf dieser Seite sind noch nicht gespeichert. Trotzdem weiterblättern?')) return true;
        phLoad(ui.ph.filter, +t.getAttribute('data-v')); return true;
      case 'phdiscard': phLoad(ui.ph.filter, ui.ph.page); return true;
      case 'phsave':
        var phItems = phChanged();
        if (!phItems.length) return flash('ok', 'Nichts geändert.');
        if (phItems.some(function (x) { return !x.title; })) return flash('err', 'Bitte jedem geänderten Foto einen Titel geben.');
        api('POST', 'admin/site/photos', { items: phItems }).then(function (r) { flash('ok', r.n + ' Fotos gespeichert.'); phLoad(ui.ph.filter, ui.ph.page); }, function (e2) { flash('err', e2.message); });
        return true;
      case 'wsrefresh':
        if (!confirm('Alle Seiten im Entwurf mit den aktuellen Vorlagen neu füllen? Eigene Änderungen an Entwürfen gehen dabei verloren (sie bleiben als Revision abrufbar). Veröffentlichte Seiten bleiben unverändert.')) return true;
        post('site/pages', { refresh: 1 }, 'Entwürfe aktualisiert.'); return true;
      case 'wspages':
        if (!confirm('Alle fehlenden Seiten als Entwurf anlegen? Auf der Website ändert sich dadurch nichts.')) return true;
        post('site/pages', {}, 'Seiten als Entwurf angelegt – Vorschau über die Knöpfe.'); return true;
      case 'igconnect': case 'igreload': case 'igoff':
        var igb = act === 'igconnect' ? { token: val2('ffl-igtoken') } : { do: act === 'igoff' ? 'off' : 'reload' };
        if (act === 'igoff' && !confirm('Instagram trennen? Die gespeicherten Bilder werden gelöscht, auf der Website bleibt nur der Link zum Profil.')) return true;
        post('site/instagram', igb, act === 'igconnect' ? 'Verbunden – Beiträge werden geladen.' : act === 'igoff' ? 'Getrennt.' : 'Neu geladen.'); return true;
      case 'wssave':
        var wsb = { drills_public: document.getElementById('ffl-ws-drills').checked ? 1 : 0 };
        [].forEach.call(root.querySelectorAll('[data-ws]'), function (x) { wsb[x.getAttribute('data-ws')] = x.value; });
        post('site', wsb, 'Gespeichert.'); return true;
      case 'bfopen': ui.brief = id; render(); window.scrollTo(0, 0); return true;
      case 'bfclose': ui.brief = null; render(); return true;
      case 'bfnew': post('briefing', { title: 'Neue Unterweisung', audience: 'all', year: ui.bfYear || new Date().getFullYear(), active: 0 }, 'Angelegt – Inhalt eintragen und sichtbar schalten.').then(function (r) { ui.brief = r.id; render(); }); return true;
      case 'bfpresets':
        var pk = [].map.call(root.querySelectorAll('[data-bfpre]:checked'), function (x) { return x.getAttribute('data-bfpre'); });
        if (!pk.length) return flash('err', 'Bitte mindestens eine Vorlage wählen.'), true;
        post('briefing', { presets: pk, year: ui.bfYear || new Date().getFullYear(), due: val2('ffl-bfdue') }, 'Als Entwurf angelegt – erst „Freigeben“ macht sie sichtbar.'); return true;
      case 'bfyear': ui.bfYear = +t.getAttribute('data-v'); ui.brief = null; render(); return true;
      case 'bfall': [].forEach.call(root.querySelectorAll('[data-bfopen]'), function (x) { x.checked = true; }); return true;
      case 'bfack':
        var mids = [].map.call(root.querySelectorAll('[data-bfopen]:checked'), function (x) { return +x.getAttribute('data-bfopen'); });
        if (!mids.length) return flash('err', 'Bitte erst Namen markieren.'), true;
        if (!confirm(mids.length + ' Person(en) als unterwiesen abhaken? (Vermerk: per Unterschriftenliste, mit deinem Namen)')) return true;
        post('briefing/ack', { id: id, member_ids: mids, method: 'liste' }, 'Abgehakt.'); return true;
      case 'bfunack': if (confirm('Haken entfernen? Das wird protokolliert.')) post('briefing/ack', { id: id, member_ids: [+t.getAttribute('data-v')], remove: 1 }, 'Haken entfernt.'); return true;
      case 'bfprint': briefPrint((d.briefings || []).filter(function (b) { return b.id === id; })[0]); return true;
      case 'bfpublish':
        if (!confirm('Freigeben? Alle Betroffenen sehen die Unterweisung und bekommen eine Nachricht.')) return true;
        post('briefing', { id: id, publish: 1 }, 'Freigegeben – die Mitglieder sind informiert.'); return true;
      case 'bfdel':
        var bd = (d.briefings || []).filter(function (b) { return b.id === id; })[0] || {}, nd = (bd.acks || []).length, why = '';
        if (!nd && !confirm('Unterweisung „' + (bd.title || '') + '“ löschen? Hinweise in den Postfächern werden zurückgezogen.')) return true;
        (nd ? MYFUI.ask({ title: 'Unterweisung löschen', text: nd + ' Mitglieder haben schon bestätigt. Warum wird die Unterweisung gelöscht? (steht im Protokoll)', required: true, ok: 'Löschen' }) : Promise.resolve('')).then(function (why) {
          if (why === null) return;
          post('briefing/delete', { id: id, reason: why }, 'Gelöscht.').then(function () { ui.brief = null; render(); });
        }); return true;
      case 'bfsave':
        var bf = root.querySelector('[data-bfform="' + id + '"]'), bb = { id: id };
        [].forEach.call(bf.querySelectorAll('[data-bf]'), function (x) { bb[x.getAttribute('data-bf')] = x.type === 'checkbox' ? (x.checked ? 1 : 0) : x.value; });
        post('briefing', bb, 'Gespeichert.'); return true;
      case 'loanadd':
        var lm = pickMember('ffl-lnm'); if (!lm) return flash('err', 'Mitglied nicht eindeutig – bitte aus den Vorschlägen wählen.'), true;
        ui.loanItem = val2('ffl-litem');
        api('POST', 'loan', { member_id: lm.id, item: ui.loanItem, size: val2('ffl-lsize'), qty: +val2('ffl-lqty') || 1, incident_id: +val2('ffl-linc') || 0 })
          .then(function () { flash('ok', 'Ausgegeben an ' + lm.name + '.'); return reload(); }, function (e2) { flash('err', e2.message); }); return true;
      case 'loanret': api('POST', 'loan/return', { id: id }).then(function () { flash('ok', 'Zurück – aus der Liste genommen.'); return reload(); }, function (e2) { flash('err', e2.message); }); return true;
      case 'loanretsel':
        var lids = [].map.call(root.querySelectorAll('[data-lsel]:checked'), function (x) { return +x.getAttribute('data-lsel'); });
        if (!lids.length) return flash('err', 'Bitte erst Zeilen markieren.'), true;
        api('POST', 'loan/return', { ids: lids }).then(function (r) { flash('ok', r.returned + ' zurück.'); return reload(); }, function (e2) { flash('err', e2.message); }); return true;
      case 'loansetup':
        var stk = {};
        [].forEach.call(root.querySelectorAll('[data-lstock]'), function (x) {
          x.value.split(',').forEach(function (pp) { var m2 = pp.split(':'); if (m2.length === 2 && m2[0].trim() && +m2[1] > 0) stk[x.getAttribute('data-lstock') + '|' + m2[0].trim()] = +m2[1]; });
        });
        api('POST', 'loan/setup', { items: val2('ffl-litems').split(',').map(function (x) { return x.trim(); }).filter(Boolean), stock: stk })
          .then(function () { flash('ok', 'Bestand gespeichert.'); return reload(); }, function (e2) { flash('err', e2.message); }); return true;
      case 'matdel': if (confirm('Unterlage löschen?')) post('material/delete', { id: id }, 'Gelöscht.'); return true;
      case 'cdelsel':
        var cids = [].map.call(root.querySelectorAll('[data-csel]:checked'), function (x) { return +x.getAttribute('data-csel'); });
        if (!cids.length) return true;
        var withW = d.needs.filter(function (n) { return cids.indexOf(n.course_id) >= 0 && n.status !== 'withdrawn'; }).length;
        if (!confirm(cids.length + (cids.length === 1 ? ' Lehrgang' : ' Lehrgänge') + ' entfernen?' + (withW ? '\n\nAchtung: daran hängen ' + withW + ' Wünsche/Zuteilungen von Mitgliedern – die werden mit gelöscht.' : ''))) return true;
        cids.reduce(function (pr, cid) { return pr.then(function () { return api('POST', 'admin/course/delete', { id: cid }); }); }, Promise.resolve())
          .then(function () { flash('ok', cids.length + (cids.length === 1 ? ' Lehrgang' : ' Lehrgänge') + ' entfernt.'); return reload(); }, function (e2) { flash('err', e2.message); reload(); });
        return true;
      case 'delcourse':
        if (confirm('Lehrgang samt gemeldetem Bedarf und Terminen löschen?')) post('course/delete', { id: id }, 'Gelöscht.').then(function () { ui.edit = null; render(); });
        return;
      case 'toggleimport': ui.importOpen = !ui.importOpen; ui.edit = null; return render();
      case 'doimport':
        return post('courses/bulk', { year: ui.year, items: parseImport() }).then(function (r) {
          ui.importOpen = false; ui.importText = ''; flash('ok', r.added + ' Lehrgänge neu, ' + r.updated + ' aktualisiert.');
        });
      case 'toggletpl': ui.tplOpen = !ui.tplOpen; ui.importOpen = false; ui.edit = null; return render();
      case 'tplall': d.templates.forEach(function (c) { ui.tplSel[c.id] = true; }); return render();
      case 'tplnone': ui.tplSel = {}; return render();
      case 'tpladd':
        var ids = Object.keys(ui.tplSel).filter(function (k) { return ui.tplSel[k]; }).map(Number);
        return post('courses/copy', { ids: ids, to: ui.year }).then(function (r) { ui.tplOpen = false; ui.tplSel = {}; flash('ok', ([r.added ? r.added + (r.added === 1 ? ' Lehrgang' : ' Lehrgänge') + ' übernommen' : '', r.updated ? r.updated + (r.updated === 1 ? ' Lehrgang' : ' Lehrgänge') + ' aktualisiert' : ''].filter(Boolean).join(', ') || 'Nichts geändert') + '.'); });
      case 'totpl':
        return post('courses/copy', { ids: [id], to: 0 }).then(function (r) { flash('ok', r.added ? 'Als Vorlage gespeichert.' : 'Vorlage aktualisiert.'); });
      case 'alltotpl':
        if (!confirm('Alle ' + d.courses.length + ' Lehrgänge als Vorlagen speichern? Gleichnamige Vorlagen werden aktualisiert.')) return;
        return post('courses/copy', { ids: d.courses.map(function (c) { return c.id; }), to: 0 }).then(function (r) { flash('ok', r.added + ' Vorlagen neu, ' + r.updated + ' aktualisiert.'); });
      case 'agtdue':
        d.members.forEach(function (m) { if (m.active && m.agt) { var i = agtInfo(m); if (i.state !== 'ok') ui.agtSel[m.id] = true; } }); return render();
      case 'agtallsel': d.members.forEach(function (m) { if (m.active && m.agt) ui.agtSel[m.id] = true; }); return render();
      case 'agtclear': ui.agtSel = {}; return render();
      case 'agtsave':
        var mids = Object.keys(ui.agtSel).filter(function (k) { return ui.agtSel[k]; }).map(Number);
        return post('agtlog/bulk', { date: document.getElementById('ffl-agtdate').value, kind: document.getElementById('ffl-agtkind').value, note: document.getElementById('ffl-agtnote').value, member_ids: mids })
          .then(function (r) { ui.agtSel = {}; flash('ok', 'Für ' + r.added + ' Personen eingetragen.'); });
      case 'agthist': ui.agtLogFor = ui.agtLogFor === id ? null : id; return render();
      case 'delagtlog': if (confirm('Eintrag löschen?')) post('agtlog/delete', { id: id }); return;
      case 'saveitems':
        return post('settings', { clothing_items: document.getElementById('ffl-citems').value.split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean) }, 'Liste gespeichert.');
      case 'addclothing':
        var cmm = pickMember('ffl-cmember');
        if (!cmm) return flash('err', 'Mitglied nicht eindeutig gefunden – bitte den Namen aus den Vorschlägen wählen.');
        return post('clothing', { member_id: cmm.id, kind: document.getElementById('ffl-ckind').value, item: document.getElementById('ffl-citem').value, size: document.getElementById('ffl-csize').value,
          qty: +document.getElementById('ffl-cqty').value || 1, reason: document.getElementById('ffl-creason').value,
          comment: document.getElementById('ffl-ccomment').value }, 'Eingetragen.');
      case 'delclothing': if (confirm('Meldung löschen?')) post('clothing/delete', { id: id }); return;
      case 'seedtpl':
        return post('templates/seed', {}).then(function (r) { flash('ok', r.added ? r.added + ' Standard-Vorlagen ergänzt.' : 'Alle Standard-Vorlagen sind schon vorhanden.'); });
      case 'auditverify':
        return api('GET', 'admin/audit/verify').then(function (r) { ui.auditCheck = r; render(); }).catch(function (e) { flash('err', e.message); });
      case 'auditcsv': return auditCsv();
      case 'copyyear':
        var from = +document.getElementById('ffl-copyfrom').value;
        if (confirm('Alle Lehrgänge aus ' + from + ' nach ' + ui.year + ' kopieren (ohne Termine und Bedarf)?')) post('courses/copy', { from: from, to: ui.year }).then(function (r) { flash('ok', r.added + ' Lehrgänge übernommen.'); });
        return;
      case 'addmember':
        var name = joinName(document.getElementById('ffl-newlast').value, document.getElementById('ffl-newfirst').value), mail = document.getElementById('ffl-newmail').value.trim();
        if (!document.getElementById('ffl-newlast').value.trim()) return flash('err', 'Bitte mindestens den Nachnamen eintragen.');
        var inv = document.getElementById('ffl-newinvite').checked && !!mail;
        return post('member', { name: name, unit: document.getElementById('ffl-newunit').value, active: true, email: mail, invite: inv },
          name + ' hinzugefügt' + (inv ? ', Einladung verschickt.' : mail ? ' (Konto angelegt, noch keine Einladung).' : ' (ohne Konto).'));
      case 'invite':
        if (!confirm('Einladung (Link zum Passwort-Festlegen) erneut per E-Mail senden?')) return;
        return post('member/invite', { id: id }, 'Einladung verschickt.');
      case 'profile':
        e.preventDefault();
        if (!ui.profile) ui.backTab = ui.tab;
        ui.tab = 'members';
        return loadProfile(id).then(function () { root.scrollIntoView(); });
      case 'closeprofile': ui.pwlink = null; ui.profile = null; ui.prof = null; ui.tab = ui.backTab || 'members'; ui.backTab = null; return render();
      case 'msub': ui.msub = t.getAttribute('data-v'); return render();
      case 'yearreport':
        api('GET', 'admin/yearreport', null, 'year=' + (t.getAttribute('data-v') || new Date().getFullYear())).then(function (r) { printNow(yearReportHtml(r), true); }, function (e) { flash('err', e.message); }); return true;
      case 'mmerge':
        var mv = t.getAttribute('data-v');
        if (!confirm('Mitglied #' + mv + ' in #' + id + ' zusammenführen? Alle Einträge wandern mit, der doppelte Eintrag wird gelöscht. Das lässt sich nicht rückgängig machen.')) return true;
        post('member/merge', { keep: id, drop: +mv }, 'Zusammengeführt.'); return true;
      case 'vprofile': loadProfile(id); return true;
      case 'ssub': ui.ssub = t.getAttribute('data-v'); return render();
      case 'nlevel': keepNoticeForm(); ui.nlevel = t.getAttribute('data-v'); render(); return restoreNoticeForm();
      case 'nuntil': document.getElementById('ffl-nends').value = untilPreset(t.getAttribute('data-v')); return;
      case 'nedit': ui.nedit = id; ui.ncopy = null; ui.nlevel = null; render(); return document.getElementById('ffl-ntext').focus();
      case 'ncopy': var nc = d.notices.filter(function (x) { return x.id === id; })[0]; ui.ncopy = { text: nc.text, level: nc.level }; ui.nedit = null; ui.nlevel = null; return render();
      case 'ncancel': ui.nedit = null; ui.ncopy = null; ui.nlevel = null; return render();
      case 'nend': if (confirm('Hinweis jetzt beenden? Er verschwindet vom Dashboard.')) post('notice', { id: id, end: true }, 'Hinweis beendet.'); return;
      case 'ndel': if (confirm('Hinweis endgültig löschen?')) post('notice/delete', { id: id }, 'Gelöscht.'); return;
      case 'nsave':
        var ntx = document.getElementById('ffl-ntext').value.trim();
        if (!ntx) return flash('err', 'Bitte einen Text eingeben.');
        var nlv = ui.nlevel || (ui.nedit ? (d.notices.filter(function (x) { return x.id === ui.nedit; })[0] || {}).level : (ui.ncopy || {}).level) || 'info';
        var wasEdit = ui.nedit;
        return post('notice', { id: ui.nedit || 0, text: ntx, level: nlv, ends: document.getElementById('ffl-nends').value, starts: document.getElementById('ffl-nstarts').value, sig: 'custom', sig_text: document.getElementById('ffl-nsig').value })
          .then(function () { ui.nedit = null; ui.ncopy = null; ui.nlevel = null; flash('ok', wasEdit ? 'Hinweis geändert.' : 'Hinweis ist jetzt auf dem Dashboard.'); });
      case 'nright': e.preventDefault(); return post('member/noticeright', { id: id, on: t.getAttribute('data-v') === '1' }, t.getAttribute('data-v') === '1' ? 'Recht vergeben.' : 'Recht entzogen.');
      case 'naddwriter':
        var nw = pickMember('ffl-nwriter', d.members.filter(function (m) { return m.active && !m.can_notice; }));
        if (!nw) return flash('err', 'Mitglied nicht eindeutig gefunden – bitte den Namen aus den Vorschlägen wählen.');
        return post('member/noticeright', { id: nw.id, on: true }, nw.name + ' darf jetzt Hinweise schreiben' + (nw.user_id ? '.' : ' – braucht aber noch ein Konto (E-Mail im Profil eintragen).'));
      case 'linkme':
        if (!confirm('Dein WordPress-Konto mit „' + ui.prof.member.name + '“ verknüpfen? Danach nutzt du ' + APP + ' mit deinem jetzigen Login.')) return;
        return post('linkme', { member_id: id }, 'Verknüpft – du kannst ' + APP + ' jetzt mit deinem Konto nutzen.');
      case 'pwlink':
        return api('POST', 'admin/member/pwlink', { id: id }).then(function (r) { ui.pwlink = r; render(); }, function (err) { flash('err', err.message); });
      case 'gostart': ui.tab = t.getAttribute('data-v'); var gs = t.getAttribute('data-gs'); if (gs && ui.tab === 'data') { render(); var se = document.getElementById('ffl-alarmsec'); if (se) se.scrollIntoView({ behavior: 'smooth', block: 'start' }); return true; } if (gs) { if (ui.tab === 'incidents') ui.isub = gs; else ui.msub = gs; } ui.profile = null; return render();
      case 'pkadd':
        MYFPasskey.register(MYF.api, MYF.nonce, MYFPasskey.deviceName()).then(function () { flash('ok', 'Passkey eingerichtet.'); return reload(); }).catch(function (e) { flash('err', e.message); }); return true;
      case 'pkdel': if (confirm('Diesen Passkey entfernen?')) api('POST', 'me/passkey', { do: 'delete', id: id }).then(function () { flash('ok', 'Entfernt.'); return reload(); }, function (e) { flash('err', e.message); }); return true;
      case '2fastart': return api('POST', 'me/2fa', { do: 'start' }).then(function (r) { ui.twofa = r; render(); }, function (e2) { flash('err', e2.message); });
      case '2facancel': ui.twofa = null; return render();
      case '2fadone': ui.twofaCodes = null; return reload();
      case '2faconfirm': return api('POST', 'me/2fa', { do: 'confirm', code: val2('ffl-2facode') }).then(function (r) { ui.twofa = null; ui.twofaCodes = r.recovery; return reload(); }, function (e2) { flash('err', e2.message); });
      case '2farec': return api('POST', 'me/2fa', { do: 'recovery', code: val2('ffl-2facode') }).then(function (r) { ui.twofaCodes = r.recovery; render(); }, function (e2) { flash('err', e2.message); });
      case '2faoff': return api('POST', 'me/2fa', { do: 'off', code: val2('ffl-2facode') }).then(function () { flash('ok', 'Zwei-Faktor abgeschaltet.'); return reload(); }, function (e2) { flash('err', e2.message); });
      case 'lkf': ui.lkF = t.getAttribute('data-v'); if (ui.lt && ui.lt.lockers) ui.lt.lockers.page = 0; return render();
      case 'lkopen': ui.lkEdit = ui.lkEdit === id ? null : id; return render();
      case 'lkbulk': return post('locker', { bulk: val2('ffl-lkbulk'), location: val2('ffl-lkloc') }, 'Spinde angelegt.');
      case 'lkfree': return MYFUI.ask({ title: 'Spind freigeben', text: 'Ist der Schlüssel zurück? Kurze Notiz (optional):', ok: 'Freigeben' }).then(function (n) { if (n !== null) post('locker', { id: id, do: 'free', note: n }, 'Freigegeben.'); });
      case 'lkdel': if (confirm('Spind löschen?')) post('locker', { id: id, do: 'delete' }, 'Gelöscht.'); return;
      case 'lksave':
        var lk = (d.lockers || []).filter(function (x) { return x.id === id; })[0], lm = pickMember('ffl-lkm'), lkey = val2('ffl-lkkey'), ln = +val2('ffl-lkn') || 1, lnote = val2('ffl-lknote');
        if (lm && lm.id !== lk.member_id) return post('locker', { id: id, do: 'assign', member_id: lm.id, key: lkey, keys: ln, note: lnote }, lk.member_id ? 'Übertragen – steht im Verlauf.' : 'Zugewiesen.');
        if (lkey !== lk.key || (lkey === 'issued' && ln !== lk.keys)) return post('locker', { id: id, do: 'key', key: lkey, keys: ln, note: lnote }, 'Schlüssel vermerkt.');
        if (lnote) return post('locker', { id: id, do: 'edit', nr: lk.nr, location: lk.location, note: lnote }, 'Notiz gespeichert.');
        return flash('err', 'Nichts geändert – Mitglied wählen oder Schlüssel-Stand ändern.');
      case 'datasave':
        var dd = ui.dataDirty || {}, bp2 = dd.bk ? val2('ffl-bkpass') : '', jobs = [];
        if (dd.bk && bp2 && bp2.length < 12) return flash('err', 'Sicherungskennwort: mindestens 12 Zeichen.');
        if (dd.bk && bp2) jobs.push(function () { return api('POST', 'admin/backup', { do: 'pass', pass: bp2 }).then(function () { return api('POST', 'admin/backup', { do: 'now' }); }); });
        if (dd.conf) jobs.push(function () { return api('POST', 'admin/backup', { do: 'settings', keep_daily: +val2('ffl-bkd'), keep_weekly: +val2('ffl-bkw'), keep_files: +val2('ffl-bkf'), max_mb: +val2('ffl-bkm') }); });
        if (dd.al && document.querySelector('[data-al]')) {
          var ab2 = {}; [].forEach.call(document.querySelectorAll('[data-al]'), function (el) { ab2[el.getAttribute('data-al')] = el.tagName === 'SELECT' ? el.value === '1' : el.value; });
          ab2.screen_minutes = +ab2.screen_minutes; ab2.ask_after = +ab2.ask_after; ab2.map = {};
          [].forEach.call(document.querySelectorAll('[data-almap]'), function (el) { ab2.map[el.getAttribute('data-almap')] = el.value; });
          jobs.push(function () { return api('POST', 'admin/alarm', ab2); });
        }
        return jobs.reduce(function (p, f) { return p.then(f); }, Promise.resolve()).then(function () {
          ui.dataDirty = null; flash('ok', dd.bk && bp2 ? 'Gespeichert – Sicherungskennwort bitte sicher hinterlegen.' : 'Gespeichert.'); return reload();
        }, function (e2) { flash('err', e2.message); });
      case 'datadiscard': ui.dataDirty = null; render(); return true;
      case 'bkpass':
        var bp = val2('ffl-bkpass'); if (bp.length < 12) return flash('err', 'Mindestens 12 Zeichen.');
        return api('POST', 'admin/backup', { do: 'pass', pass: bp }).then(function () { flash('ok', 'Sicherungskennwort gespeichert – bitte sicher hinterlegen.'); return api('POST', 'admin/backup', { do: 'now' }); }).then(reload, function (e2) { flash('err', e2.message); });
      case 'bknow': return api('POST', 'admin/backup', { do: 'now' }).then(function () { flash('ok', 'Sicherung erstellt.'); return reload(); }, function (e2) { flash('err', e2.message); });
      case 'bkconf': return api('POST', 'admin/backup', { do: 'settings', keep_daily: +val2('ffl-bkd'), keep_weekly: +val2('ffl-bkw'), keep_files: +val2('ffl-bkf'), max_mb: +val2('ffl-bkm') }).then(function () { flash('ok', 'Gespeichert – ältere Sicherungen wurden nach den neuen Regeln aufgeräumt.'); return reload(); }, function (e2) { flash('err', e2.message); });
      case 'arcdel': return MYFUI.ask({ title: 'Archiv löschen', text: 'Archiv #' + id + ' endgültig löschen? Das steht im Protokoll. Zur Bestätigung LÖSCHEN eingeben:', ok: 'Löschen' }).then(function (x) { if (x !== 'LÖSCHEN') return; return api('POST', 'admin/backup', { do: 'delete_archive', id: id }).then(function () { flash('ok', 'Archiv gelöscht.'); return reload(); }, function (e2) { flash('err', e2.message); }); });
      case 'bkpull': return api('POST', 'admin/backup', { do: 'pull' }).then(reload, function (e2) { flash('err', e2.message); });
      case 'bkpulloff': return api('POST', 'admin/backup', { do: 'pull', off: 1 }).then(reload, function (e2) { flash('err', e2.message); });
      case 'bkrestore':
        var bf = document.getElementById('ffl-bkfile').files[0]; if (!bf) return flash('err', 'Bitte die Sicherungsdatei wählen.');
        return MYFUI.ask({ title: 'Sicherung einspielen', text: 'Der aktuelle Stand wird vorher archiviert. Zur Bestätigung WIEDERHERSTELLEN eingeben:', ok: 'Einspielen' }).then(function (cf) {
          if (cf !== 'WIEDERHERSTELLEN') return;
          var fd = new FormData(); fd.append('do', 'restore'); fd.append('confirm', cf); fd.append('pass', val2('ffl-bkrpass')); fd.append('file', bf);
          return fetch(url('admin/backup'), { method: 'POST', credentials: 'same-origin', headers: { 'X-WP-Nonce': MYF.nonce }, body: fd })
            .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.message || 'Fehler ' + r.status); return j; }); })
            .then(function (j) { flash('ok', j.rows + ' Datensätze wiederhergestellt – der Stand davor liegt im Archiv.'); return reload(); }, function (e2) { flash('err', e2.message); });
        });
      case 'arcnow':
        return MYFUI.ask({ title: 'Jetzt archivieren', text: 'Anlass für das Archiv (optional):', ok: 'Archivieren' }).then(function (al) { if (al === null) return; return api('POST', 'admin/archive', { do: 'create', label: al }).then(function () { flash('ok', 'Archiviert.'); return reload(); }, function (e2) { flash('err', e2.message); }); });
      case 'arcdl':
        return api('POST', 'admin/archive', { do: 'download', id: id }).then(function (r) {
          var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(r, null, 1)], { type: 'application/json' }));
          a.download = 'myfeuerwehr-archiv-' + id + '-' + String(r.created || '').slice(0, 10) + '.json'; document.body.appendChild(a); a.click(); a.remove();
          flash('ok', 'Archiv heruntergeladen – bitte sicher aufbewahren (personenbezogene Daten).');
        }, function (e2) { flash('err', e2.message); });
      case 'arcrestore':
        return MYFUI.ask({ title: 'Archiv #' + id + ' wiederherstellen', text: 'Der aktuelle Stand wird vorher archiviert. Zur Bestätigung WIEDERHERSTELLEN eingeben:', ok: 'Wiederherstellen' }).then(function (ac) {
          if (!ac) return;
          return api('POST', 'admin/archive', { do: 'restore', id: id, confirm: ac.trim() }).then(function (r) { flash('ok', r.rows + ' Datensätze wiederhergestellt – der Stand davor liegt im Archiv.'); return reload(); }, function (e2) { flash('err', e2.message); });
        });
      case 'dosreset':
        var grp = [].map.call(root.querySelectorAll('[data-rgrp]:checked'), function (x) { return x.getAttribute('data-rgrp'); });
        if (!grp.length) return flash('err', 'Bitte mindestens einen Bereich auswählen.');
        if (val2('ffl-rconfirm').trim() !== 'ZURÜCKSETZEN') return flash('err', 'Bitte zur Bestätigung ZURÜCKSETZEN eintippen.');
        return api('POST', 'admin/reset', { groups: grp, label: val2('ffl-rlabel'), confirm: 'ZURÜCKSETZEN' }).then(function (r) { flash('ok', 'Zurückgesetzt. Der vorherige Stand liegt im Archiv (#' + r.archive_id + ').'); return reload(); }, function (e2) { flash('err', e2.message); });
      case 'backup':
        return api('GET', 'admin/backup').then(function (r) {
          var a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([JSON.stringify(r, null, 1)], { type: 'application/json' }));
          a.download = 'myfeuerwehr-sicherung-' + new Date().toISOString().slice(0, 10) + '.json';
          document.body.appendChild(a); a.click(); a.remove();
          flash('ok', 'Sicherung heruntergeladen – bitte sicher aufbewahren (enthält personenbezogene Daten).');
        }, function (err) { flash('err', err.message); });
      case 'ainbox': if (FRONT && window.MYFOpenInbox) { window.MYFAdminClose(); window.MYFOpenInbox(); return; } ui.tab = ui.tab === 'inbox' ? 'overview' : 'inbox'; ui.profile = null; ui.prof = null; render(); window.scrollTo(0, root.offsetTop - 20); return;
      case 'anread': noteAct('read', (d.admin_notes || []).filter(function (n) { return !n.read; }).map(function (n) { return n.id; })); return;
      case 'anarch': noteAct('archive', [id]); return;
      case 'ancert':
        noteAct('read', [id]);
        MYFCert.print(function (b) { return api('POST', 'admin/incident/cert', b); }, [+t.getAttribute('data-pid')], true, function () { reload(); flash('ok', 'Bescheinigung gedruckt – jetzt unterschreiben lassen, dann aushändigen.'); })
          .catch(function (e2) { flash('err', e2.message); });
        return true;
      case 'anbk':
        var bkSt = t.getAttribute('data-v'), bkId = +t.getAttribute('data-bk');
        return (bkSt === 'declined' ? MYFUI.ask({ title: 'Anfrage ablehnen', text: 'Kurze Begründung für die anfragende Person:', ok: 'Ablehnen' }) : Promise.resolve('')).then(function (ans) {
          if (ans === null) return;
          noteAct('read', [id]);
          return post('booking', { id: bkId, status: bkSt, answer: ans }, bkSt === 'approved' ? 'Freigegeben – die Person bekommt Bescheid.' : 'Abgelehnt – die Person bekommt Bescheid.');
        });
      case 'ango': noteAct('read', [id]); if (t.getAttribute('data-v') === '~') { location.href = d.link; return; } goAdmin(t.getAttribute('data-v')); if (ui.tab === 'inbox') ui.tab = 'overview'; render(); jumpTo(); return;
      case 'golists': e.preventDefault(); ui.profile = null; ui.prof = null; if (d.full) ui.tab = 'rights'; else { ui.tab = 'members'; ui.msub = 'lists'; } return render();
      case 'gocatalog': e.preventDefault(); ui.profile = null; ui.prof = null; ui.tab = 'clothing'; ui.csub = 'cat'; return render();
      case 'golockers': e.preventDefault(); ui.profile = null; ui.prof = null; ui.tab = 'clothing'; ui.csub = 'lockers'; ui.lkEdit = id || null; ui.lkF = id ? 'all' : 'free'; return render();
      case 'loanjump': e.preventDefault(); ui.loanFor = +t.getAttribute('data-id'); ui.profile = null; ui.prof = null; ui.tab = 'agt'; ui.asub = 'loan'; return render();
      case 'agtjump': e.preventDefault(); ui.profile = null; ui.prof = null; ui.tab = 'agt'; return render();
      case 'clothfor':
        var cfn = ui.prof.member.name;
        ui.profile = null; ui.prof = null; ui.tab = 'clothing'; ui.csub = 'req'; render();
        var cfi = document.getElementById('ffl-cmember'); if (cfi) { cfi.value = cfn; cfi.scrollIntoView({ block: 'center' }); document.getElementById('ffl-citem').focus(); }
        return;
      case 'lrowdel': t.closest('.ffl-lrow').remove(); return;
      case 'savelist':
        var lists = {};
        [].forEach.call((t.closest('.ffl-lists') || document).querySelectorAll('.ffl-lrows[data-list]'), function (box) {
          lists[box.getAttribute('data-list')] = [].map.call(box.querySelectorAll('.ffl-lrow'), function (r) { return [r.getAttribute('data-key'), r.querySelector('input').value.trim()]; })
            .filter(function (x) { return x[1]; });
        });
        return post('settings', { lists: lists }, 'Gespeichert.');
      case 'mailtest':
        return api('POST', 'admin/mailtest', {}).then(function (r) {
          flash(r.ok ? 'ok' : 'err', r.ok ? 'Probe-Einladung an ' + r.to + ' verschickt. Nicht angekommen (auch im Spam nachsehen)? Dann ein SMTP-Plugin einrichten.'
            : 'Die Website konnte keine E-Mail verschicken. Bitte ein SMTP-Plugin (z. B. „WP Mail SMTP“) einrichten.');
        }, function (err) { flash('err', err.message); });
      case 'addqual':
        var qt = document.getElementById('ffl-qtitle').value.trim();
        if (!qt) return flash('err', 'Bitte den Lehrgang angeben.');
        var qs = (document.getElementById('ffl-qtitle-short') || {}).value || '';
        return post('qual', { member_id: id, title: qt, short: qs, year: +document.getElementById('ffl-qyear').value || null, date: document.getElementById('ffl-qdate').value }, 'Nachgetragen.');
      case 'delqual': if (confirm('Eintrag löschen?')) post('qual/delete', { id: id }); return;
      case 'printprofile':
        return printNow(profilePrint(), true);
      case 'saveidea':
        var box = t.closest('[data-row="idea"]');
        return post('idea', { id: id, answer: box.querySelector('[data-f="answer"]').value, status: box.querySelector('[data-f="status"]').value === 'new' ? 'progress' : box.querySelector('[data-f="status"]').value }, 'Antwort gespeichert – das Mitglied sieht sie jetzt.');
      case 'importmembers':
        var items = ui.memberImport.split(/\r?\n/).map(function (l) {
          var parts = l.split(/\t|;/).map(function (x) { return x.trim(); }).filter(Boolean);
          if (!parts.length || /^(name|nachname)$/i.test(parts[0])) return null;
          var mailPart = parts.filter(function (x) { return /@/.test(x); })[0] || '';
          var unitPart = parts.filter(function (x) { return unitGuess(x, true); })[0] || '';
          var names = parts.filter(function (x) { return x !== mailPart && x !== unitPart; });
          if (!names.length) return null;
          // Zwei Namensspalten = Nachname | Vorname (wie in der Vorlage), sonst erkennen
          var g = names.length >= 2 && names[0].indexOf(',') < 0 && names[0].indexOf(' ') < 0 && names[1].indexOf(' ') < 0
            ? (MYFNames.isFirst(names[0]) && !MYFNames.isFirst(names[1]) ? { last: names[1], first: names[0], sure: true, why: 'Spalten getauscht (Vorname zuerst)' } : { last: names[0], first: names[1], sure: true, why: 'Spalten' })
            : MYFNames.split(names.join(' '), mailPart);
          return { last: g.last, first: g.first, sure: g.sure, why: g.why, unit: unitGuess(unitPart) || unitKeys()[0], email: mailPart };
        }).filter(Boolean);
        if (!items.length) return flash('err', 'Keine Namen erkannt.');
        ui.impPrev = items; return render();
      case 'impswap': var ip = ui.impPrev[id], tmp = ip.last; ip.last = ip.first; ip.first = tmp; ip.sure = true; ip.why = 'von Hand getauscht'; return render();
      case 'impcancel': ui.impPrev = null; return render();
      case 'impconfirm':
        [].forEach.call(document.querySelectorAll('[data-imp]'), function (tr) {
          var x = ui.impPrev[+tr.getAttribute('data-imp')];
          x.last = tr.querySelector('[data-impf=last]').value; x.first = tr.querySelector('[data-impf=first]').value;
        });
        var bulkInv = document.getElementById('ffl-bulkinvite').checked;
        return post('members/bulk', { invite: bulkInv, items: ui.impPrev.filter(function (x) { return x.last.trim(); }).map(function (x) { return { name: joinName(x.last, x.first), unit: x.unit, email: x.email }; }) }).then(function (r) {
          ui.memberImport = ''; ui.impPrev = null;
          flash(r.errors.length ? 'warn' : 'ok', r.added + ' Mitglieder übernommen' + (r.skipped ? ', ' + r.skipped + ' übersprungen (schon vorhanden)' : '') + (bulkInv ? ', Einladungen verschickt' : '') + '.' + (r.errors.length ? ' Probleme: ' + r.errors.join(' · ') : ''));
        });
      case 'namecheck': ui.nameCheck = !ui.nameCheck; ui.nameFix = ui.nameFix || {}; return render();
      case 'nfswap':
        var nf = ui.nameFix[id], tmp2 = nf.last; nf.last = nf.first; nf.first = tmp2; nf.sure = true; nf.why = 'von Hand getauscht'; return render();
      case 'nfapply':
        var jobs = [].map.call(document.querySelectorAll('[data-nfix]'), function (tr) {
          var m = by(d.members, 'id')[+tr.getAttribute('data-nfix')];
          return { id: m.id, name: joinName(tr.querySelector('[data-nf=last]').value, tr.querySelector('[data-nf=first]').value), unit: m.unit, active: m.active };
        }).filter(function (x) { return x.name.indexOf(',') > 0; });
        return jobs.reduce(function (pr, x) { return pr.then(function () { return api('POST', 'admin/member', x); }); }, Promise.resolve())
          .then(function () { ui.nameCheck = false; ui.nameFix = {}; return reload(); }).then(function () { flash('ok', jobs.length + ' Namen getrennt gespeichert.'); }, function (err) { flash('err', err.message); });
      case 'mhadd':
        var mf = root.querySelector('[data-mhform="' + id + '"]'), mb = { id: id };
        [].forEach.call(mf.querySelectorAll('[data-mh]'), function (x) { mb[x.getAttribute('data-mh')] = x.value; });
        if (mb.kind === 'austritt' && !confirm('Austritt eintragen? Das Mitglied ist dann nicht mehr aktiv, die Anmeldung wird gesperrt. Alle Daten bleiben archiviert.')) return;
        api('POST', 'admin/member/history', mb).then(function () { flash('ok', 'Eingetragen.'); return Promise.all([reload(), loadProfile(id)]); }, function (e2) { flash('err', e2.message); }); return;
      case 'mhdel':
        if (!confirm('Eintrag entfernen? (Fehleingabe – wird protokolliert)')) return;
        api('POST', 'admin/member/history/delete', { history_id: +t.getAttribute('data-v') }).then(function (r) { return Promise.all([reload(), loadProfile(r.id)]); }, function (e2) { flash('err', e2.message); }); return;
      case 'manon':
        e.preventDefault();
        MYFUI.ask({ title: 'Anonymisieren', text: 'Anonymisieren löscht Name, Geburtsdaten, Anschrift, Telefon, Größen, Merkmale, Kleidung, Wünsche und das Konto. Einsätze und Statistik bleiben als „Ehemaliges Mitglied“.\n\nZum Bestätigen ANONYMISIEREN eintippen:', ok: 'Anonymisieren' }).then(function (cw) {
          if (cw !== 'ANONYMISIEREN') return;
        api('POST', 'admin/member/anonymize', { id: id, confirm: cw }).then(function () { ui.profile = null; ui.prof = null; flash('ok', 'Anonymisiert.'); return reload(); }, function (e2) { flash('err', e2.message); });
        }); return;
      case 'delmember':
        if (!confirm('Mitglied endgültig löschen – mit Ausbildungsnachweis, Meldungen und Konto? Besser: „aktiv“ abwählen.')) return;
        ui.profile = null; ui.prof = null; post('member/delete', { id: id }, 'Gelöscht.'); return;
      case 'printview': ui.print = t.getAttribute('data-v'); return render();
      case 'print': return printNow(document.getElementById('ffl-print').innerHTML);
      // Bereichs-Ausdrucke (Atemschutz-Übersicht, Kleidungs-Bestellliste): gleiche Vorlage, Vorschau mit PDF / Drucken
      case 'smtpdiscard': ui.mailDirty = false; return render();
      case 'smtpsave':
        // Eigene Schnittstelle: das Passwort läuft nicht durch die allgemeinen Einstellungen (Protokoll)
        var smtp = {};
        [].forEach.call(document.querySelectorAll('[data-smtp]'), function (el) { smtp[el.getAttribute('data-smtp')] = el.type === 'checkbox' ? el.checked : el.value; });
        var sm = String(smtp.mode || 'ssl:465').split(':'); smtp.secure = sm[0]; smtp.port = +sm[1]; delete smtp.mode;
        return post('smtp', smtp, 'Gespeichert.').then(function () { ui.mailDirty = false; ui.smtpRes = ''; var pw = document.getElementById('ffl-smtp-pass'); if (pw) pw.value = ''; render(); });
      case 'smtptest':
        if (ui.mailDirty) { flash('err', 'Bitte erst speichern, dann testen.'); return; }
        t.disabled = true; document.getElementById('ffl-smtp-res').innerHTML = '<p class="ffl-mu">Sende … (kann bis zu 15 Sekunden dauern)</p>';
        // Ergebnis merken und neu laden: Statuszeile aktualisiert sich, die Antwort bleibt beim Neuzeichnen stehen
        api('POST', 'admin/smtp/test', { to: val2('ffl-smtp-to') }).then(function (r) {
          ui.smtpRes = r.ok ? '<div class="ffl-msg ok" style="margin-top:8px">✓ Vom Mailserver angenommen (' + (r.via === 'smtp' ? 'über das Postfach' : 'über den Webserver') + ') – bitte prüfen, ob sie bei ' + esc(r.to) + ' ankommt, auch im Spam-Ordner.</div>' : '<div class="ffl-msg err" style="margin-top:8px"><b>Nicht gesendet.</b> Antwort: ' + esc(r.error) + '</div>';
        }, function (e) { ui.smtpRes = '<div class="ffl-msg err" style="margin-top:8px">' + esc(e.message) + '</div>'; }).then(reload);
        return;
      case 'orme': var ov = t.getAttribute('data-v'); ui.orEdit = ov === 'new' ? 'new' : ov ? +ov : null; return render();
      case 'cdprint': return MYFCD.print(d.cd);
      case 'omsave': post('order/menu', { id: id, name: document.getElementById('ffl-om-name').value, kind: document.getElementById('ffl-om-kind').value, phone: document.getElementById('ffl-om-phone').value, link: document.getElementById('ffl-om-link').value, items: document.getElementById('ffl-om-items').value }, 'Karte gespeichert.').then(function () { ui.orEdit = null; render(); }, function () {}); return;
      case 'omok': post('order/menu/decide', { id: id, approve: true }, 'Karte freigegeben – gilt jetzt für alle.').catch(function () {}); return;
      case 'omno': MYFUI.ask({ title: 'Vorschlag ablehnen', text: 'Kurz der Grund (die Person bekommt ihn zu lesen):', value: '', ok: 'Ablehnen' }).then(function (v3) { if (v3) post('order/menu/decide', { id: id, approve: false, note: v3 }, 'Abgelehnt.').catch(function () {}); }); return;
      case 'omdel': if (confirm('Diese Karte löschen? Laufende Runden behalten ihre Kopie.')) post('order/menu', { id: id, delete: true }, 'Karte gelöscht.').then(function () { ui.orEdit = null; render(); }, function () {}); return;
      case 'areaprint': var pv = ui.print; ui.print = t.getAttribute('data-v'); var ph = printHtml(); ui.print = pv; return printNow(ph);
      case 'csv': return csv();
    }
  });

  // Ziel einer Benachrichtigung „admin:…“ in der Verwaltung öffnen: 'geraet:ID', 'due:agt', 'inbox' oder ein Bereich
  // Nach dem Sprung aus einer Benachrichtigung: genau zur Stelle scrollen (Einsatzzeile, Sicherheits-Check), sonst nach oben
  function jumpTo() {
    var el = ui.incJump ? root.querySelector('[data-act="incrow"][data-id="' + ui.incJump + '"]') : ui.secJump ? document.getElementById('ffl-seccheck') : null;
    ui.incJump = null; ui.secJump = false;
    window.scrollTo(0, Math.max(0, (el ? el.getBoundingClientRect().top + window.pageYOffset : root.offsetTop) - 80));
  }
  function goAdmin(go) {
  if (go === 'inbox') { ui.tab = 'inbox'; ui.profile = null; return; }
    var gm = /^geraet:(\d+)$/.exec(go || ''), gx = /^(member|incident):(\d+)$/.exec(go || '');
    // Genau der Datensatz: Mitglied (Profil) oder Einsatz (aufgeklappt in der Liste)
    if (gx && gx[1] === 'member') { ui.tab = 'members'; ui.profile = null; loadProfile(+gx[2]); }
    else if (gx) { ui.tab = 'incidents'; ui.isub = 'list'; ui.incOpen = +gx[2]; ui.profile = null; ui.incJump = +gx[2]; }
    else if (go === 'security') { ui.tab = 'security'; ui.profile = null; ui.secJump = true; }
    else if (go === 'archive' || go === 'web') { ui.tab = 'incidents'; ui.isub = go; ui.profile = null; }
    else if (go === 'start') { ui.tab = 'overview'; ui.profile = null; }
    else if (/^team:/.test(go || '')) { ui.tab = 'teams'; ui.team = go.slice(5); ui.tsub = 'tasks'; ui.profile = null; }
    else if (gm) { ui.tab = 'agt'; ui.asub = 'devices'; ui.dev = +gm[1]; ui.devJump = true; ui.profile = null; }
    else if (go === 'cert') { ui.tab = 'incidents'; ui.isub = 'cert'; ui.cv = null; ui.profile = null; }
    else if (go === 'due:agt') { ui.tab = 'agt'; ui.asub = 'due'; ui.dev = null; ui.profile = null; }
    else if (/^due:/.test(go || '')) {
      // Fälligkeiten der Gerätewerkstatt (Fahrzeuge) oder eines Teams
      var da = go.slice(4); ui.dev = null; ui.profile = null; ui.wsub = 'due';
      if (da.indexOf('team_') === 0) { ui.tab = 'teams'; ui.team = da; ui.tsub = 'inv'; } else { ui.tab = 'vehicles'; ui.vsub = 'geraete'; }
    }
    else if (go) {
      // Benachrichtigung „admin:bereich“ → direkt in den passenden Bereich
      var GO = { orders: 'orders', clothing: 'clothing', defects: 'defects', duties: 'duties', incidents: 'incidents', members: 'members', messages: 'messages', teams: 'teams', vehicles: 'vehicles', ideas: 'ideas', courses: 'courses', agt: 'agt' };
      if (go === 'vehicledue') { ui.tab = 'vehicles'; ui.vsub = 'due'; ui.profile = null; }
      else if (GO[go]) { ui.tab = GO[go]; ui.profile = null; if (go === 'vehicles') ui.vsub = 'bookings'; }
    }
  }

  // Direkt zu einem Gerät der Werkstatt (QR-Code)
  var qpa = new URLSearchParams(location.search);
  // Bereich des Geräts erst nach dem Laden bekannt (Atemschutz, Gerätewerkstatt oder Team)
  if (qpa.get('geraet')) { ui.tab = 'agt'; ui.asub = 'devices'; ui.dev = +qpa.get('geraet'); ui.devJump = true; }
  MYFUI.ltBind(root, ui, function () { render(); });
  function start() { reload().catch(function (e) { root.innerHTML = '<div class="ffl-msg err">' + esc(e.message) + '</div>'; }); }
  if (!FRONT) start();
  else {
    // Website: Verwaltung erst beim Öffnen laden; Vollbild auf Wunsch
    var wrap = document.getElementById('ffl-adm-wrap'), started = false;
    // go: 'geraet:ID' (Gerät öffnen), 'due:agt' (Fälligkeiten), sonst Startseite der Verwaltung
    window.MYFAdminOpen = function (go) {
      goAdmin(go);
      wrap.hidden = false; document.body.classList.add('myf-adm-open');
      if (d) render(); // sofort die richtige Stelle zeigen, Daten kommen gleich nach
      started = true; reload().then(jumpTo, function (e) { root.innerHTML = '<div class="ffl-msg err">' + esc(e.message) + '</div>'; });
      try { history.replaceState(null, '', location.pathname + location.search + '#verwaltung'); } catch (e) {}
    };

    function closeAdm() {
      tasksAt = 0; if (window.MYFTasksChanged) window.MYFTasksChanged();
      wrap.hidden = true; document.body.classList.remove('myf-adm-open');
      if (document.fullscreenElement) document.exitFullscreen();
      try { var cu = new URL(location.href); ['page', 'tab', 'sub', 'mitglied'].forEach(function (k) { cu.searchParams.delete(k); }); history.replaceState(null, '', cu.pathname + cu.search); } catch (e) {}
    }
    window.MYFAdminClose = function () { closeAdm(); };
    // Meine Aufgaben auf der Mitgliederseite: gleiche Daten und Rechte wie die Verwaltung (der Server liefert nur die eigenen Bereiche)
    var tasksAt = 0;
    window.MYFAdminTasks = function (o) {
      var ready = d && Date.now() - tasksAt < 30000 ? Promise.resolve() : reload().then(function () { tasksAt = Date.now(); });
      return ready.then(function () { if (!d) return { n: 0, wait: [], todo: [] }; var T = adminTasks(o); return { n: T.wait.length + T.todo.length, wait: T.wait, todo: T.todo }; });
    };
    window.MYFAdminTaskGo = function (t) {
      function a(k) { return t.getAttribute(k); }
      ui.profile = null; ui.prof = null; ui.tab = a('data-tab');
      if (a('data-asub')) { ui.asub = a('data-asub'); ui.dev = null; }
      if (a('data-asu-go')) { ui.asub = 'asu'; ui.asuEdit = null; }
      if (a('data-agt-go')) { ui.asub = a('data-agt-go'); ui.asuEdit = null; }
      if (a('data-vsub')) { ui.vsub = a('data-vsub'); ui.veh = null; }
      if (a('data-gosub')) ui.sub = a('data-gosub');
      if (a('data-isub')) ui.isub = a('data-isub');
      window.MYFAdminOpen();
    };
    wrap.addEventListener('click', function (e) {
      // Links in den Mitgliederbereich derselben Seite: Verwaltung schließen und direkt dorthin – ohne Neuladen
      var ln = e.target.closest('a[href]');
      if (ln && window.MYFPortalGo && d && d.link && ln.href.indexOf(d.link.split('?')[0]) === 0 && !ln.target && /[?&](einsatz|reiter|seite)=/.test(ln.href)) {
        e.preventDefault(); closeAdm(); window.MYFPortalGo(ln.href.split('?')[1] || ''); return;
      }
      var b = e.target.closest('[data-adm]'); if (!b) return;
      if (b.getAttribute('data-adm') === 'close') return closeAdm();
      if (b.getAttribute('data-adm') === 'inbox') { closeAdm(); if (window.MYFOpenInbox) window.MYFOpenInbox(); return; }
      if (document.fullscreenElement) document.exitFullscreen(); else if (wrap.requestFullscreen) wrap.requestFullscreen();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !wrap.hidden && !document.fullscreenElement) closeAdm(); });
    if (location.hash === '#verwaltung') window.MYFAdminOpen();
  }
})();
