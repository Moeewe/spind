/* SPIND – gemeinsame Ausdrucke (Mitgliederbereich und Verwaltung):
   Einsatzbericht (Erfassungsbogen), Einsatzbeteiligung und Bescheinigung für den Arbeitgeber. */
(function () {
  'use strict';
  var APP = (window.MYF && MYF.app) || 'SPIND';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function d(v) { if (!v) return ''; var p = v.slice(0, 10).split('-'); return p[2] + '.' + p[1] + '.' + p[0]; }
  function t(v) { return v && v.length >= 16 ? v.slice(11, 16) : ''; }
  function today() { var x = new Date(); return ('0' + x.getDate()).slice(-2) + '.' + ('0' + (x.getMonth() + 1)).slice(-2) + '.' + x.getFullYear(); }
  function box(on) { return '<span class="pr-box">' + (on ? '✕' : '') + '</span>'; }
  var ORG = (window.MYF && MYF.org) || { name: 'Freiwillige Feuerwehr', place: '', zip: '' };

  var PRINT_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="1"/><path d="M6 14h12v7H6z"/></svg>';
  // Direkt drucken (Druckdialog = „Als PDF sichern“ oder Drucker)
  function printDirect(html, portrait) {
    var pr = document.getElementById('myf-printroot');
    if (!pr) { pr = document.createElement('div'); pr.id = 'myf-printroot'; pr.className = 'ffl-print'; document.body.appendChild(pr); }
    pr.innerHTML = '<style>@page { size: A4 ' + (portrait ? 'portrait' : 'landscape') + '; margin: 12mm; }</style>' + html;
    window.print();
    // Ausdruck (ggf. mit vertraulichen Angaben) nicht im Seiteninhalt stehen lassen
    setTimeout(function () { pr.innerHTML = ''; }, 1500);
  }
  // Jeder Ausdruck erst als Vorschau (Blatt A4 wie gedruckt), dann „PDF / Drucken“. o.onPrint: läuft vor dem Druck (z. B. „als ausgestellt
  // vermerken“) und darf ein Promise mit neuem HTML liefern; o.printLabel benennt den Knopf, o.title/o.sub die Kopfzeile.
  function preview(html, portrait, o) {
    o = o || {};
    var old = document.getElementById('myf-preview'); if (old) old.remove();
    var title = o.title || ((/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html) || [])[1] || 'Ausdruck').replace(/<[^>]+>/g, '');
    var box = document.createElement('div'), prev = document.activeElement, oldOv = document.documentElement.style.overflow;
    box.id = 'myf-preview'; box.className = 'ffl ffl-pv' + (document.documentElement.getAttribute('data-myf-theme') === 'dark' ? ' is-dark' : '');
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Vorschau: ' + title);
    box.innerHTML = '<div class="ffl-pv-bar"><div class="ffl-pv-t"><span class="ffl-pv-k">Vorschau</span><b></b>' + (o.sub ? '<span class="ffl-pv-s"></span>' : '') + '</div>' +
      '<div class="ffl-pv-act"><button type="button" class="ffl-pv-close">Schließen</button><button type="button" class="ffl-p ffl-pv-print">' + PRINT_SVG + '<span></span></button></div></div>' +
      (o.note ? '<p class="ffl-pv-note"></p>' : '') + '<div class="ffl-pv-scroll"><div class="ffl-pv-paper ffl-print' + (portrait ? '' : ' is-land') + '"></div></div>';
    box.querySelector('.ffl-pv-t b').textContent = title;
    if (o.sub) box.querySelector('.ffl-pv-s').textContent = o.sub;
    if (o.note) box.querySelector('.ffl-pv-note').textContent = o.note;
    box.querySelector('.ffl-pv-print span').textContent = o.printLabel || 'PDF / Drucken';
    box.querySelector('.ffl-pv-paper').innerHTML = html;
    (document.fullscreenElement || document.body).appendChild(box);
    document.documentElement.style.overflow = 'hidden';
    function close() { box.remove(); document.documentElement.style.overflow = oldOv; document.removeEventListener('keydown', key, true); try { if (prev && prev.focus) prev.focus(); } catch (e) {} if (o.onClose) o.onClose(); }
    function key(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } }
    document.addEventListener('keydown', key, true);
    box.querySelector('.ffl-pv-close').addEventListener('click', close);
    var pb = box.querySelector('.ffl-pv-print');
    pb.addEventListener('click', function () {
      if (pb.disabled) return;
      var run = o.onPrint ? o.onPrint() : null;
      if (!run || !run.then) { printDirect(html, portrait); if (o.closeAfter && run !== null && o.onPrint) close(); return; }
      pb.disabled = true;
      run.then(function (h2) { pb.disabled = false; printDirect(typeof h2 === 'string' ? h2 : html, portrait); if (o.closeAfter) close(); }, function (err) { pb.disabled = false; alert(err && err.message ? err.message : 'Hat nicht geklappt.'); });
    });
    setTimeout(function () { pb.focus(); }, 30);
    return { close: close };
  }
  function printNow(html, portrait, o) { return preview(html, portrait, o); }
  function head(title, right) {
    return '<div class="pr-head"><div style="text-align:left"><b>' + esc(ORG.name) + '</b><h1>' + esc(title) + '</h1></div><div>' + (right || 'Stand: ' + today()) + '</div></div>';
  }

  // Einsatzbericht wie der Papierbogen: links Bezeichnung, rechts Inhalt
  function report(inc, form, opts) {
    opts = opts || {};
    var r = inc.report || {}, rows = '';
    rows += '<tr><th>Einsatz</th><td><b>' + esc((inc.nr ? inc.nr + ' – ' : '') + inc.title) + '</b>' + (inc.kind === 'uebung' ? ' (Übung)' : '') + '</td></tr>';
    rows += '<tr><th>Einsatzzeit</th><td>von ' + d(inc.start) + ' ' + t(inc.start) + ' Uhr &nbsp; bis ' + (inc.end ? d(inc.end) + ' ' + t(inc.end) + ' Uhr' : '______') + '</td></tr>';
    rows += '<tr><th>Einsatzort</th><td>' + esc(ORG.zip + ' ' + ORG.place + (inc.place ? ', ' + inc.place : '')) + '</td></tr>';
    // Mehrere Alarmierungen (Erhöhung, Nachalarmierung) und Einsatznummer der Leitstelle
    if ((inc.alarms || []).length > 1 || inc.ext_nr) rows += '<tr><th>Alarmierungen</th><td>' + (inc.alarms || []).map(function (a) { return esc(String(a.t).slice(11, 16) + ' ' + (a.k === 'Alarm' ? '' : a.k + ': ') + a.kw); }).join(' · ') +
      (inc.ext_nr ? (inc.alarms && inc.alarms.length ? ' · ' : '') + 'Leitstelle Nr. ' + esc(inc.ext_nr) : '') + '</td></tr>';
    form.forEach(function (sec) {
      sec.fields.forEach(function (f) {
        if (opts.hideSensitive && f.sensitive) return;
        var v = r[f.id], cell;
        if (f.type === 'checks') cell = f.options.map(function (o) { return '<span class="pr-opt">' + box((v || []).indexOf(o) >= 0) + ' ' + esc(o) + '</span>'; }).join(' ');
        else if (f.type === 'radio') cell = f.options.map(function (o) { return '<span class="pr-opt">' + box(v === o) + ' ' + esc(o) + '</span>'; }).join(' ');
        else cell = '<span class="pr-pre">' + esc(v || '') + '</span>';
        // Wie auf dem Zettel: leere Anschrift = „wie Einsatzort“ bzw. „wie Geschädigter“ angekreuzt
        if (f.id === 'geschaedigter_anschrift' && !v && r.geschaedigter) cell = box(true) + ' wie Einsatzort';
        if ((f.id === 'kostenpflichtiger' || f.id === 'kostenpflichtiger_anschrift') && !v && r.geschaedigter && (r.kostenpflicht || '').indexOf('ist kostenpflichtig') >= 0) cell = box(true) + ' wie Geschädigter';
        // Rückseite des Bogens beginnt mit „Erläuterung“ – im Ausdruck auf einer neuen Seite
        if (f.id === 'erlaeuterung' && !opts.onePage) rows += '</table><table class="pr-form pr-page2">';
        rows += '<tr><th>' + esc(f.label) + '</th><td>' + cell + '</td></tr>';
      });
    });
    // Werte, die die Formular-Fassung nicht (mehr) kennt, nie verschweigen
    var known = { _form: 1 }; form.forEach(function (sec) { sec.fields.forEach(function (f) { known[f.id] = 1; }); });
    Object.keys(r).filter(function (k) { var v = r[k]; return !known[k] && (Array.isArray(v) ? v.length : String(v || '').trim()); }).forEach(function (k, n) {
      if (!n) rows += '<tr><th colspan="2" style="text-align:left">Weitere Angaben (frühere Formular-Fassung)</th></tr>';
      rows += '<tr><th>' + esc((opts.labels || {})[k] || k) + '</th><td><span class="pr-pre">' + esc(Array.isArray(r[k]) ? r[k].join(', ') : r[k]) + '</span></td></tr>';
    });
    var veh = (inc.vehicles || []).filter(function (x) { return x.v; });
    if (veh.length) rows += '<tr><th>Fahrzeuge / Zeiten</th><td><table class="pr-inner"><tr><th>Fahrzeug</th><th>Ausrücken</th><th>Einsatzstelle an</th><th>Einrücken</th></tr>' +
      veh.map(function (x) { return '<tr><td>' + esc(x.v) + '</td><td>' + esc(x.out) + '</td><td>' + esc(x.at) + '</td><td>' + esc(x.in) + '</td></tr>'; }).join('') + '</table></td></tr>';
    // Revisionssicher: Abschluss und jedes Wieder-Öffnen (mit Begründung) stehen mit auf dem Ausdruck
    var log = (inc.report_log || []).map(function (l) { return esc(d(l.at) + ' ' + t(l.at) + ' · ' + l.by + ': ' + l.what + (l.why ? ' – „' + l.why + '“' : '')); }).join('<br>');
    if (inc.report_closed || log) rows += '<tr><th>Status / Verlauf</th><td>' + (inc.report_closed ? '<b>abgeschlossen</b> von ' + esc(inc.report_closed_by) + ' am ' + d(inc.report_closed) + ' ' + t(inc.report_closed) + ' Uhr' : '<b>Entwurf</b> – noch nicht abgeschlossen') + (log ? '<br><small>' + log + '</small>' : '') + '</td></tr>';
    return '<div class="pr-report">' + head('Erfassungsbogen Einsatzbericht', inc.report_by ? 'erfasst von ' + esc(inc.report_by) + '<br>' + d(inc.report_at) : '') +
      '<table class="pr-form">' + rows + '</table><div class="pr-sign"><div>Unterschrift Einsatzleiter Zug</div><div></div></div></div>';
  }

  // Beteiligtenliste als zweite Seite hinter dem Einsatzbericht (gleicher Ausdruck, Hochformat)
  function participantsPage(inc, parts, members, vehicles) {
    return '<div class="pr-append" style="page-break-before:always">' + participants(inc, parts, members, vehicles || []) + '</div>';
  }
  // Einsatzbeteiligung wie die Papierliste: Name, Kreuz beim Fahrzeug, abweichende Zeiten, Atemschutz-Minuten
  function participants(inc, parts, members, vehicles) {
    var mem = {}; members.forEach(function (m) { mem[m.id] = m; });
    var list = parts.slice().sort(function (a, b) { return (mem[a.member_id] || {}).name > (mem[b.member_id] || {}).name ? 1 : -1; });
    // Wer nicht auf einem der Fahrzeuge war (Gerätehaus, Nachbereitung …): eigene Spalte, nur wenn es das gibt
    var other = list.some(function (p) { return p.vehicle && vehicles.indexOf(p.vehicle) < 0; });
    return head('Einsatzbeteiligung', 'Datum: ' + d(inc.start) + ' · ' + t(inc.start) + ' Uhr') +
      '<p><b>' + esc((inc.nr ? inc.nr + ' – ' : '') + inc.title) + '</b>' + (inc.place ? ' · Einsatzort: ' + esc(inc.place) : '') + '</p>' +
      '<table><thead><tr><th>Nachname</th><th>Vorname</th>' + vehicles.map(function (v) { return '<th class="n">' + esc(v) + '</th>'; }).join('') + (other ? '<th>sonst</th>' : '') +
      '<th>Funktion</th><th>Beginn*</th><th>Ende*</th><th>Atemschutz (Min.)</th><th>bestätigt</th></tr></thead><tbody>' + list.map(function (p) {
        var n = ((mem[p.member_id] || {}).name || '(gelöscht)').split(',');
        return '<tr><td>' + esc(n[0].trim()) + '</td><td>' + esc((n[1] || '').trim()) + '</td>' + vehicles.map(function (v) { return '<td class="n">' + (p.vehicle === v ? 'X' : '') + '</td>'; }).join('') +
          (other ? '<td>' + (vehicles.indexOf(p.vehicle) < 0 ? esc(p.vehicle) : '') + '</td>' : '') + '<td>' + esc(String(p.role || '').split(',').join(' ')) + '</td>' +
          '<td>' + t(p.t_start) + '</td><td>' + t(p.t_end) + '</td><td class="n">' + (p.as_minutes || '') + '</td><td class="n">' + (p.confirmed ? '✓' : '') + '</td></tr>';
      }).join('') + '</tbody></table><div class="pr-foot">* nur wenn abweichend von der Einsatzzeit des Fahrzeugs · ' + list.length + ' Personen</div>';
  }

  // Atemschutzüberwachung (Protokoll) – eigener Ausdruck und Anhang zum Einsatzbericht
  function asuMinutes(x) {
    if (!x.t_start || !x.t_end) return 0;
    var a = +x.t_start.slice(0, 2) * 60 + +x.t_start.slice(3, 5), b = +x.t_end.slice(0, 2) * 60 + +x.t_end.slice(3, 5), m = b - a; if (m < 0) m += 1440;
    return m > 0 && m <= 600 ? m : 0;
  }
  function asu(inc, e) {
    var h = head('Atemschutzüberwachung', 'Datum: ' + d(inc.start) + ' · ' + t(inc.start) + ' Uhr') +
      '<p><b>' + (inc.kind === 'uebung' ? 'Übung' : 'Einsatz') + ' ' + esc((inc.nr ? inc.nr + ' · ' : '') + inc.title) + '</b>' +
      '<br>Überwachungsstelle: ' + esc(e.station || '–') + ' · überwacht von: ' + esc(e.supervisor || '–') +
      (e.status === 'closed' ? '<br>Abgeschlossen: ' + esc(e.closed_by) + ', ' + d(e.closed_at || '') + ' ' + t(e.closed_at || '') + ' Uhr' : '<br><b>Entwurf – noch nicht abgeschlossen</b>') + '</p>';
    (e.trupps || []).forEach(function (x) {
      var min = asuMinutes(x);
      h += '<h2>' + esc(x.name || 'Trupp') + (x.task ? ' – ' + esc(x.task) : '') + '</h2><p>Anschluss ' + esc(x.t_start || '–') + (x.checks || []).map(function (c, i) { return ' · ' + (i + 1) + '. Kontrolle ' + esc(c.t || '–') + (c.p !== '' && c.p != null ? ' (' + esc(c.p) + ' bar)' : ''); }).join('') +
        ' · Rückzug ' + esc(x.t_retreat || '–') + ' · Ende ' + esc(x.t_end || '–') + (min ? ' · <b>' + min + ' min</b>' : '') + '</p><table><thead><tr><th>Name</th><th>TF/TM</th><th>PA</th><th>Maske</th><th>Flasche</th><th>bar Beginn</th><th>bar Ende</th></tr></thead><tbody>' +
        (x.members || []).map(function (m) { return '<tr><td>' + esc(m.name) + '</td><td>' + esc(m.fn) + '</td><td>' + esc(m.pa) + '</td><td>' + esc(m.mask) + '</td><td>' + esc(m.bottle) + '</td><td>' + esc(m.p_start) + '</td><td>' + esc(m.p_end) + '</td></tr>'; }).join('') + '</tbody></table>' +
        (x.note ? '<p>Bemerkung: ' + esc(x.note) + '</p>' : '');
    });
    return h + (e.reopen_note ? '<p style="white-space:pre-line"><b>Wieder geöffnet:</b>\n' + esc(e.reopen_note) + '</p>' : '');
  }
  // Fahrten zum Einsatz aus dem Fahrtenbuch (Fahrzeug, Fahrer/in, km)
  function trips(inc, list, vehName) {
    list = (list || []).filter(function (x) { return !x.storno_of; });
    if (!list.length) return '';
    var km = 0;
    return head('Fahrzeuge & Fahrten', 'Datum: ' + d(inc.start)) + '<p><b>' + esc((inc.nr ? inc.nr + ' – ' : '') + inc.title) + '</b></p>' +
      '<table><thead><tr><th>Fahrzeug</th><th>Fahrer/in</th><th>Ab</th><th>An</th><th class="n">km Beginn</th><th class="n">km Ende</th><th class="n">gefahren</th></tr></thead><tbody>' +
      list.map(function (x) { var k = x.km_start != null && x.km_end != null ? x.km_end - x.km_start : null; if (k > 0) km += k;
        return '<tr><td>' + esc(vehName(x.vehicle_id)) + '</td><td>' + esc(x.driver || '') + '</td><td>' + t(x.start) + '</td><td>' + t(x.end) + '</td><td class="n">' + (x.km_start != null ? x.km_start : '') + '</td><td class="n">' + (x.km_end != null ? x.km_end : '') + '</td><td class="n">' + (k != null ? k : '') + '</td></tr>'; }).join('') +
      '</tbody></table><div class="pr-foot">' + list.length + (list.length === 1 ? ' Fahrt' : ' Fahrten') + (km ? ' · zusammen ' + km + ' km' : '') + '</div>';
  }
  // Einsatzmappe: Bericht, dahinter je eine neue Seite für Beteiligung, Atemschutzüberwachung und Fahrten (was vorhanden ist und gesehen werden darf)
  function dossier(reportHtml, pages) {
    return reportHtml + (pages || []).filter(Boolean).map(function (p) { return '<div class="pr-append" style="page-break-before:always">' + p + '</div>'; }).join('');
  }

  // Bescheinigung über die Teilnahme an einem Einsatz oder einer Übung (für den Arbeitgeber / Verdienstausfall)
  function certificates(items, office) {
    office = office || {};
    var CAT = { brand: 'Brandeinsatz', th: 'Hilfeleistung', vu: 'VU', sonst: 'Sonstiges', fehl: 'Sonstiges' };
    return items.map(function (x, i) {
      var cat = x.kind === 'uebung' ? 'Sonstiges' : (CAT[x.category] || 'Sonstiges');
      var from = t(x.t_start || x.start), to = t(x.t_end || x.end);
      return '<div class="pr-cert"' + (i ? ' style="page-break-before:always"' : '') + '>' +
        '<div class="pr-head"><div style="text-align:left"><b>' + esc(ORG.name) + '</b></div><div>' + esc(ORG.zip + ' ' + ORG.place) + ', ' + today() + '</div></div>' +
        '<h1 style="text-align:center;text-decoration:underline">Bescheinigung</h1><p style="text-align:center"><b>über die Teilnahme an einem Einsatz oder einer Übung</b></p>' +
        '<table class="pr-lines">' +
        '<tr><th>Der/Die</th><td>' + esc(x.rank) + ' ' + esc(x.name) + '<div class="pr-small">(Dienstgrad) (Name, Vorname)</div></td></tr>' +
        '<tr><th>geb. am</th><td>' + d(x.birth_date) + (x.birth_place ? ' &nbsp; in ' + esc(x.birth_place) : '') + '</td></tr>' +
        '<tr><th>wohnhaft in</th><td>' + (/\b\d{5}\b/.test(x.street || '') ? esc(x.street) : esc(ORG.zip + ' ' + ORG.place) + (x.street ? ', ' + esc(x.street) : '')) + '</td></tr>' +
        '<tr><th>ist ' + (x.kind === 'uebung' ? 'bei der Übung' : 'beim Einsatz') + '</th><td>' + ['Brandeinsatz', 'Hilfeleistung', 'VU', 'Sonstiges'].map(function (c) { return '<span class="pr-opt">' + box(c === cat) + ' ' + c + '</span>'; }).join(' ') + '</td></tr>' +
        '<tr><th>am</th><td>' + d(x.t_start || x.start) + '</td></tr>' +
        '<tr><th>in ' + esc(ORG.place) + ',</th><td>' + esc(x.place) + '<div class="pr-small">(Einsatzort)</div></td></tr>' +
        '<tr><th>in der Zeit von</th><td>' + from + ' Uhr &nbsp; bis ' + to + ' Uhr eingesetzt worden.</td></tr>' +
        '<tr><th>Wiederaufnahme der Arbeit</th><td><span class="pr-opt">' + box(/^\d/.test(x.work_resume)) + ' um ' + (/^\d/.test(x.work_resume) ? esc(x.work_resume) : '______') + ' Uhr</span> &nbsp; ' +
        '<span class="pr-opt">' + box(x.work_resume === 'none') + ' erfolgte aufgrund der Länge des Einsatzes am o. g. Tag nicht mehr</span></td></tr></table>' +
        '<div class="pr-sign"><div>(Leiter der Feuerwehr, Löschzugführer, Einsatzleiter)</div><div></div></div>' +
        '<div class="pr-verf"><b><u>Verfügung:</u></b> (wird von der Gemeindeverwaltung ausgefüllt!)<div class="pr-verf-h"><div>' + esc(office.name || 'Gemeinde ' + ORG.place) + (office.dept ? '<br>' + esc(office.dept) : '') + (office.az ? '<br>Az.: ' + esc(office.az) : '') + '</div><div>' + esc(ORG.zip + ' ' + ORG.place) + ', ____________</div></div>' +
        '<p>1. Die sachliche und rechnerische Richtigkeit wurde überprüft und der Erstattungsbetrag auf ____________ EUR festgestellt.</p>' +
        '<p>Im Auftrag: ______________________ (Unterschrift)</p><p>2. FB 1 Mitteilung an den Arbeitgeber &nbsp; 3. FB 2 mit der Bitte um Fertigung der Auszahlungsanordnung &nbsp; 4. z. d. A. beim FB 2</p></div></div>';
    }).join('');
  }

  // Ausgabeliste: welche unterschriebenen Bescheinigungen an die Mitglieder ausgehändigt wurden – jede Person quittiert den Empfang
  function certHandover(r) {
    var o = r.office || {};
    return head('Ausgabe Bescheinigungen Verdienstausfall', 'ausgegeben am ' + d(r.at) + (r.by ? ' von ' + esc(r.by) : '')) +
      '<p>Die Mitglieder geben die Bescheinigung ihrem Arbeitgeber. Der Arbeitgeber beantragt die Erstattung bei <b>' + esc(o.name) + '</b>' + (o.dept ? ' · ' + esc(o.dept) : '') + (o.az ? ' · Az.: ' + esc(o.az) : '') + ' (Selbstständige stellen den Antrag selbst).</p>' +
      '<table><thead><tr><th class="n">Nr.</th><th>Name, Vorname</th><th>Dienstgrad</th><th>Datum</th><th>Einsatz / Übung</th><th>von</th><th>bis</th><th>Arbeit wieder</th><th style="width:22%">erhalten (Unterschrift)</th></tr></thead><tbody>' +
      r.items.map(function (x, n) {
        return '<tr><td class="n">' + (n + 1) + '</td><td>' + esc(x.name) + '</td><td>' + esc(x.rank) + '</td><td>' + d(x.from || x.start) + '</td><td>' + esc((x.kind === 'uebung' ? 'Übung: ' : '') + (x.nr ? x.nr + ' ' : '') + x.title) + '</td>' +
          '<td>' + t(x.from) + '</td><td>' + t(x.to) + '</td><td>' + (x.work_resume === 'none' ? 'nicht mehr' : x.work_resume ? esc(x.work_resume) + ' Uhr' : '–') + '</td><td style="height:26px"></td></tr>';
      }).join('') + '</tbody></table><div class="pr-foot">' + r.items.length + ' Bescheinigung' + (r.items.length === 1 ? '' : 'en') + ' im Original ausgehändigt – Liste bleibt bei der Feuerwehr.</div>' +
      '<div class="pr-sign"><div>ausgegeben (Feuerwehr)</div></div>';
  }
  // Vorlagen & Logos: gleiche Seite für Mitglieder und Verwaltung
  window.MYFCD = {
    html: function (c) {
      var groups = [], by = {};
      c.files.forEach(function (f) { if (!by[f.group]) { by[f.group] = []; groups.push(f.group); } by[f.group].push(f); });
      var h = c.needs_logo ? '<div class="ffl-msg warn" style="margin-top:14px">Das Logo für die Vorlagen wird noch vorbereitet. Dafür muss die Verwaltung einmal „Einstellungen → Vorlagen &amp; Logos“ öffnen.</div>' : '';
      h += '<p class="ffl-mu" style="margin-top:14px">Name, Anschrift, Logo und Farbe von ' + esc(c.org) + ' sind beim Herunterladen schon eingesetzt. Für die richtige Schrift zuerst „Schrift Barlow“ installieren.</p>';
      groups.forEach(function (g) {
        h += '<div class="ffl-sec"><div class="ffl-sh">' + esc(g) + '</div><div class="ffl-todos">' + by[g].map(function (f) {
          return '<div class="ffl-todo"><div class="ffl-day">' + esc(f.ext.toUpperCase()) + '</div><div class="ffl-ct"><b>' + esc(f.title) + '</b><div class="ffl-mu">' + esc(f.desc) + '</div></div>' +
            (c.needs_logo && f.key !== 'schrift' ? '' : '<a class="ffl-sm ffl-btn ffl-cddl" href="' + esc(f.url) + '" download>Herunterladen</a>') + '</div>';
        }).join('') + '</div></div>';
      });
      return h + '<div class="ffl-sec"><div class="ffl-sh">Kurzregeln</div>' + this.rules(c) + '<div class="ffl-row" style="margin-top:12px"><button type="button" class="ffl-sm" data-act="cdprint">Kurzregeln drucken</button></div></div>';
    },
    rules: function (c) {
      var hex = String(c.color).toUpperCase(), n = parseInt(hex.slice(1), 16), rgb = (n >> 16) + ' / ' + ((n >> 8) & 255) + ' / ' + (n & 255);
      var chip = function (col, name, val) { return '<tr><td style="width:44px"><span style="display:block;width:32px;height:32px;background:' + col + ';border:1px solid #999"></span></td><td><b>' + name + '</b></td><td>' + val + '</td></tr>'; };
      return '<table class="ffl-cdrules" style="width:100%;border-collapse:collapse"><tbody>' + chip(esc(hex), 'Feuerwehr-Rot', esc(hex) + ' · RGB ' + rgb) + chip('#111111', 'Schwarz', '#111111 · RGB 17 / 17 / 17') + chip('#FFFFFF', 'Weiß', '#FFFFFF · RGB 255 / 255 / 255') + '</tbody></table>' +
        '<p><b>Schrift:</b> Überschriften in Barlow Condensed ExtraBold, Text in Barlow. Ohne Barlow: Arial.</p>' +
        '<p><b>Logo:</b> Auf hellem Grund das helle Logo, auf dunklem Grund das dunkle. Rundherum mindestens eine Buchstabenhöhe frei lassen. Nicht verzerren, nicht umfärben, nicht auf unruhige Fotos setzen.</p>' +
        '<p><b>Rot:</b> Sparsam und nur für das, was auffallen soll. Das schräge rote Feld aus dem Logo ist das Erkennungszeichen.</p>' +
        '<p><b>Fotos:</b> Nur eigene Bilder. Erkennbare Personen vorher fragen. Keine Kennzeichen, Hausnummern oder Betroffenen zeigen.</p>';
    },
    print: function (c) { MYFPrint.printNow('<h1>Erscheinungsbild ' + esc(c.org) + '</h1><img src="' + esc(c.logo_light) + '" alt="" style="height:50px;margin:8px 0 16px">' + this.rules(c), true); },
    // Logo in die feste Größe der Vorlagen bringen (links ausgerichtet, Rest durchsichtig) und zum Server schicken
    syncLogo: function (c, send) {
      var one = function (url) { return new Promise(function (ok, no) {
        var img = new Image(); img.crossOrigin = 'anonymous';
        img.onload = function () { try {
          var cv = document.createElement('canvas'); cv.width = 2524; cv.height = 400;
          var iw = img.naturalWidth || 2524, ih = img.naturalHeight || 400, r = Math.min(2524 / iw, 400 / ih);
          cv.getContext('2d').drawImage(img, 0, (400 - ih * r) / 2, iw * r, ih * r);
          ok(cv.toDataURL('image/png'));
        } catch (e) { no(e); } };
        img.onerror = no; img.src = url;
      }); };
      return Promise.all([one(c.logo_light), one(c.logo_dark)]).then(function (a) { return send({ light: a[0], dark: a[1] }); });
    }
  };
  window.MYFPrint = { printNow: printNow, preview: preview, printDirect: printDirect, report: report, participants: participants, participantsPage: participantsPage, asu: asu, trips: trips, dossier: dossier, certificates: certificates, certHandover: certHandover, head: head };

  // Übersicht Verdienstausfall (Verwaltung und Einsatzführung): drei Stapel wie auf dem Schreibtisch
  window.MYFCert = {
    // Bescheinigungen: erst Vorschau (ohne Vermerk), „Drucken & als ausgestellt vermerken“ setzt den Status – Ansehen allein ändert nichts.
    // call(body) → Promise der API (…/incident/cert), needMark: mindestens eine ist erst „angefragt“, after(r): neu laden/Meldung
    print: function (call, ids, needMark, after) {
      return call({ ids: ids, mark: false }).then(function (r) {
        var html = certificates(r.items, r.office), n = r.items.length;
        preview(html, true, { title: n === 1 ? 'Bescheinigung für den Arbeitgeber' : n + ' Bescheinigungen für den Arbeitgeber', sub: r.items.map(function (x) { return x.name; }).join(' · '),
          note: (r.skipped && r.skipped.length ? 'Nicht dabei – Teilnahme noch nicht bestätigt: ' + r.skipped.join(', ') + '. ' : '') +
            (r.incomplete && r.incomplete.length ? 'Nicht dabei – es fehlen Angaben: ' + r.incomplete.join('; ') + '. ' : '') +
            (needMark ? 'Beim Drucken vermerkt SPIND die Bescheinigung als „gedruckt – zur Unterschrift“ und gibt dem Mitglied Bescheid. Danach unterschreiben lassen.' : ''),
          printLabel: needMark ? 'Drucken & vermerken' : 'PDF / Drucken',
          onPrint: function () {
            if (!needMark) return null;
            return call({ ids: ids, mark: true }).then(function (r2) { needMark = false; if (after) after(r2); return certificates(r2.items, r2.office); });
          } });
        return r;
      });
    },
    // Aushändigen an die Mitglieder: Vorschau der Ausgabeliste, „Ausgabe vermerken & drucken“ setzt den Status und druckt die echte Liste
    handover: function (call, rows, office, who, after) {
      var html = certHandover({ at: new Date().toISOString().slice(0, 10), by: who || '', office: office, items: rows });
      preview(html, true, { title: rows.length === 1 ? 'Bescheinigung aushändigen: ' + rows[0].name : 'Ausgabeliste – ' + rows.length + ' Bescheinigungen', sub: rows.map(function (x) { return x.name; }).join(' · '),
        note: 'Erst ausführen, wenn die Bescheinigungen unterschrieben sind. SPIND vermerkt die Ausgabe und schreibt den Mitgliedern, dass sie die Bescheinigung ihrem Arbeitgeber geben. Auf der Liste quittiert jede Person den Empfang.',
        printLabel: 'Ausgabe vermerken & drucken', closeAfter: true,
        onPrint: function () { return call({ ids: rows.map(function (x) { return x.id; }) }).then(function (r) { if (after) after(r); return certHandover(r); }); } });
    },
    board: function (r, opts) {
      opts = opts || {};
      var rows = r.rows || [], req = rows.filter(function (x) { return x.cert === 'requested'; }), iss = rows.filter(function (x) { return x.cert === 'issued'; }), hnd = rows.filter(function (x) { return x.cert === 'handed'; });
      var ready = req.filter(function (x) { return x.confirmed && !x.missing.length; });
      function when(x) { return d(x.from || x.start) + (x.from ? ' · ' + (x.to ? t(x.from) + '–' + t(x.to) + ' Uhr' : 'ab ' + t(x.from) + ' Uhr') : ''); }
      function inc(x) { return esc((x.kind === 'uebung' ? 'Übung: ' : '') + (x.nr ? x.nr + ' ' : '') + x.title); }
      function row(x, extra, act) {
        return '<div class="ffl-cvrow"><div class="who"><b>' + esc(x.name) + '</b><span>' + inc(x) + '</span></div><div class="when">' + when(x) +
          (x.work_resume ? '<span>Arbeit wieder: ' + (x.work_resume === 'none' ? 'nicht mehr' : esc(x.work_resume) + ' Uhr') + '</span>' : '') + '</div><div class="st">' + extra + '</div><div class="act">' + (act || '') + '</div></div>';
      }
      var steps = '<ol class="ffl-cvsteps"><li><b>Anfrage</b><span>Mitglied kreuzt beim Eintragen „Bescheinigung“ an</span></li><li><b>Bestätigen & drucken</b><span>Einsatzführung</span></li>' +
        '<li><b>Unterschreiben</b><span>Leiter der Feuerwehr, Löschzugführer oder Einsatzleiter</span></li><li><b>Aushändigen</b><span>an das Mitglied – mit Ausgabeliste</span></li><li><b>Arbeitgeber beantragt</b><span>Erstattung bei ' + esc((r.office || {}).name || 'der Gemeinde') + '</span></li></ol>';
      // Sammel-Aktion als Leiste unter der Überschrift: links was passiert, rechts der Hauptknopf
      function bar(text, btn) { return '<div class="ffl-cvbar"><span>' + text + '</span>' + btn + '</div>'; }
      var h = steps;
      h += '<div class="ffl-sec ffl-cvsec"><div class="ffl-sh">1 · Angefragt<em>' + req.length + '</em></div>' +
        (ready.length ? bar('<b>' + (ready.length === 1 ? '1 Bescheinigung' : ready.length + ' Bescheinigungen') + ' bereit zum Drucken.</b> Beim Drucken wird vermerkt „gedruckt – zur Unterschrift“, das Mitglied bekommt Bescheid.',
          '<button type="button" class="ffl-p" data-act="cvprint" data-v="ready">' + (ready.length === 1 ? 'Drucken' : 'Alle ' + ready.length + ' drucken') + '</button>') : '') +
        (req.length ? req.map(function (x) {
          var st = !x.confirmed ? '<span class="ffl-chip st-warn">Teilnahme noch bestätigen</span>' : x.missing.length ? '<span class="ffl-chip st-bad" title="Im Profil des Mitglieds ergänzen">fehlt: ' + esc(x.missing.join(', ')) + '</span>' : '<span class="ffl-chip st-open">bereit zum Drucken</span>';
          var act = !x.confirmed ? (opts.openInc ? '<button type="button" class="ffl-sm" data-act="' + opts.openInc + '" data-id="' + x.incident_id + '">Zum Einsatz</button>' : '') : x.missing.length ? (opts.openMember ? '<button type="button" class="ffl-sm" data-act="' + opts.openMember + '" data-id="' + x.member_id + '">Profil öffnen</button>' : '') : '<button type="button" class="ffl-sm" data-act="cvprint" data-v="' + x.id + '">Drucken</button>';
          return row(x, st, act);
        }).join('') : '<p class="ffl-mu">Keine offenen Anfragen.</p>') + '</div>';
      h += '<div class="ffl-sec ffl-cvsec"><div class="ffl-sh">2 · Gedruckt – zur Unterschrift<em>' + iss.length + '</em></div>' +
        (iss.length ? bar('<b>Unterschrieben?</b> Dann aushändigen – SPIND druckt eine Ausgabeliste, auf der jede Person den Empfang quittiert.',
          '<button type="button" class="ffl-p" data-act="cvhand">' + (iss.length === 1 ? 'Aushändigen' : 'Alle ' + iss.length + ' aushändigen') + '</button>') +
          iss.map(function (x) { return row(x, '<span class="ffl-chip st-warn">gedruckt ' + d(x.printed) + '</span><span class="ffl-mu">von ' + esc(x.printed_by) + '</span>', '<button type="button" class="ffl-sm" data-act="cvhand1" data-v="' + x.id + '">Aushändigen</button><button type="button" class="ffl-sm" data-act="cvprint" data-v="' + x.id + '">Nochmal drucken</button>'); }).join('')
          : '<p class="ffl-mu">Nichts liegt zur Unterschrift.</p>') + '</div>';
      h += '<details class="ffl-sec ffl-cvsec"' + (opts.openDone ? ' open' : '') + '><summary class="ffl-sh">3 · Ausgehändigt ' + r.year + '<em>' + hnd.length + '</em></summary>' +
        (hnd.length ? hnd.map(function (x) { return row(x, '<span class="ffl-chip st-ok">ausgehändigt ' + d(x.handed) + '</span><span class="ffl-mu">von ' + esc(x.handed_by) + '</span>', '<button type="button" class="ffl-sm" data-act="cvprint" data-v="' + x.id + '" title="Kopie für die eigene Akte">Kopie drucken</button>'); }).join('') : '<p class="ffl-mu">In ' + r.year + ' noch nichts ausgehändigt.</p>') + '</details>';
      if ((r.years || []).length > 1) h += '<div class="ffl-row" style="margin-top:8px"><span class="ffl-mu">Jahr:</span>' + r.years.map(function (y) { return '<button type="button" class="ffl-sm' + (y === r.year ? ' ffl-p' : '') + '" data-act="cvyear" data-v="' + y + '">' + y + '</button>'; }).join('') + '</div>';
      return h;
    }
  };
})();

/* Eingaben schützen: SPIND zeichnet die Seite nach jedem Speichern neu. Was jemand gerade tippt (auch in einem
   anderen Feld) und wo der Cursor steht, bleibt dabei erhalten. Nach „Speichern/Anlegen“ gilt der Kasten als erledigt. */
(function () {
  'use strict';
  var dirty = {};
  var HOST = '[data-id],[data-row],[data-veh],[data-part],[data-rank],[data-rt],[data-rk],[data-team],[data-wu],[data-sy],[data-rtype],[data-rkind],[data-fsec],[data-ffield],[data-webform],[data-incform],[data-alform],[data-dlform],[data-vform],[data-wsform]';
  function attrs(el) { return [].filter.call(el.attributes, function (x) { return /^data-/.test(x.name) && x.name !== 'data-act'; }).map(function (x) { return x.name + '=' + x.value; }).join('&'); }
  function key(el) {
    if (!el || !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.type === 'file' || el.type === 'hidden') return null;
    if (el.id) return '#' + el.id;
    var a = attrs(el) || (el.name ? 'name=' + el.name + (el.type === 'radio' ? '=' + el.value : '') : '');
    if (!a) return null;
    var host = el.parentElement && el.parentElement.closest(HOST);
    return (host ? attrs(host) : '') + '>' + a;
  }
  function remember(e) {
    var k = key(e.target); if (!k) return;
    dirty[k] = e.target.type === 'checkbox' || e.target.type === 'radio' ? { c: e.target.checked } : { v: e.target.value };
  }
  function track(root) {
    root.addEventListener('input', remember, true);
    root.addEventListener('change', remember, true);
    // Aktion ausgelöst (Speichern, Anlegen …): Eingaben in diesem Kasten gelten als abgeschickt
    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act],button[type=submit]'); if (!b) return;
      var box = b.closest('.ffl-pbox,.ffl-pform,form,[data-row],.ffl-task,.ffl-idea,.ffl-fbbox,.ffl-board,tr') || root;
      [].forEach.call(box.querySelectorAll('input,textarea,select'), function (el) { var k = key(el); if (k) delete dirty[k]; });
    }, true);
  }
  function paint(root, html) {
    var act = document.activeElement, ak = act && root.contains(act) ? key(act) : null, sel = null;
    try { if (ak && act.selectionStart != null) sel = [act.selectionStart, act.selectionEnd]; } catch (e) {}
    root.innerHTML = html;
    var keys = Object.keys(dirty);
    if (!keys.length && !ak) return;
    [].forEach.call(root.querySelectorAll('input,textarea,select'), function (el) {
      var k = key(el); if (!k) return;
      var v = dirty[k];
      if (v) { if (v.c != null) el.checked = v.c; else if (el.value !== v.v) el.value = v.v; }
      if (k === ak) {
        try { el.focus({ preventScroll: true }); if (sel && el.setSelectionRange) el.setSelectionRange(sel[0], sel[1]); } catch (e) {}
        ak = null;
      }
    });
  }
  function forget() { dirty = {}; }
  window.MYFForm = { track: track, paint: paint, forget: forget };
})();

/* Gemeinsame Bausteine für Kopf und Fuß – Mitglieder- und Verwaltungsansicht sehen gleich aus */
(function () {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var icons = {
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="miter" aria-hidden="true"><rect x="3" y="5.5" width="18" height="13"/><path d="M3 6.5l9 6.5 9-6.5"/></svg>',
    expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    shrink: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>',
    // Untere Leiste am Handy (Mitgliederbereich)
    n_start: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/></svg>',
    n_incidents: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.2 1-3.6 2-4.6.3 1.6 1 2.6 2 3 0-3.2.4-5.8 1-8.4z"/><path d="M4 21h16"/></svg>',
    n_plan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
    n_courses: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5M22 9v6"/></svg>',
    n_tasks: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 6l2 2 3-3M4 13l2 2 3-3M4 20l2 2 3-3M13 7h7M13 14h7M13 21h7"/></svg>',
    n_report: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 21V4h11l-1.5 4L16 12H5"/></svg>',
    n_agt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="8" y="2.5" width="8" height="19" rx="4"/><path d="M8 8h8M12 2.5V1"/></svg>',
    n_profile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4.2-6.5 8-6.5s7 2 8 6.5"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    admin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="1"/><path d="M9 4V2.8h6V4M8.5 12.5l2.3 2.3 4.7-4.8"/></svg>',
  };
  // Name mit Kürzel-Kreis, darunter Dienstgrad · Einheit · Funktionen (z. B. „Gruppenführer · Team Medienteam“)
  function who(w, act) {
    if (!w) return '';
    var n = String(w.name || ''), parts = n.split(','), ini = ((parts[1] || '').trim().charAt(0) + parts[0].trim().charAt(0)).toUpperCase() || n.charAt(0).toUpperCase();
    var sub = [w.rank, w.unit].filter(Boolean).join(' · '), fn = (w.functions || []).join(' · ');
    return '<button type="button" class="ffl-who"' + (act ? ' data-act="' + act + '"' : ' tabindex="-1"') + ' title="Mein Profil"><span class="ffl-ava" aria-hidden="true">' + esc(ini) + '</span><span class="ffl-whotx"><b>' + esc(n) + '</b>' +
      (sub ? '<small>' + esc(sub) + '</small>' : '') + (fn ? '<small class="ffl-whofn">' + esc(fn) + '</small>' : '') + '</span></button>';
  }
  function foot(f, extra) {
    if (!f) return '';
    return '<footer class="ffl-foot"><span>© ' + f.year + ' ' + esc(f.org) + '</span>' + (extra || '') + '<a href="' + esc(f.site) + '">Zurück zur Website</a>' +
      (f.ver ? '<span class="ffl-ver" title="installierte Version">' + esc((window.MYF && MYF.app) || 'SPIND') + ' ' + esc(f.ver) + (f.channel ? ' · ' + esc(f.channel) : '') + '</span><button type="button" class="ffl-relbtn" data-relnotes="1">Was ist neu?</button>' : '') + '</footer>';
  }
  // Versionshinweise („Was ist neu?“) als Fenster; die Seite setzt MYFUI.release = d.release nach dem Laden. Öffnen gilt als gelesen.
  function relNotes() {
    var r = window.MYFUI.release; if (!r || !r.notes) return;
    var box = document.createElement('div'), prev = document.activeElement;
    box.className = 'ffl ffl-modal ffl-rel';
    box.innerHTML = '<div class="ffl-modal-in" role="dialog" aria-modal="true" aria-label="Was ist neu?"><div class="ffl-sh">Was ist neu?<em>' + esc((window.MYF && MYF.app) || 'SPIND') + ' ' + esc(r.ver) + (r.channel ? ' · ' + esc(r.channel) : '') + '</em></div>' +
      (r.channel === 'Beta' ? '<p class="ffl-mu" style="margin-top:0">Beta: Alles läuft, wird aber noch getestet. Version 1.0.0 kommt mit dem produktiven Einsatz. Fehler oder Wünsche bitte an die Verwaltung.</p>' : '') +
      r.notes.map(function (n, k) {
        return '<section class="ffl-relv' + (k ? '' : ' is-cur') + '"><h4>' + esc(n.version) + (n.date ? ' <small>' + esc(String(n.date).split('-').reverse().join('.')) + '</small>' : '') + (n.version === r.ver ? ' <span class="ffl-chip st-ok">installiert</span>' : '') + '</h4>' +
          (n.title ? '<b>' + esc(n.title) + '</b>' : '') + '<ul>' + (n.items || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></section>';
      }).join('') + '<div class="ffl-row" style="margin-top:12px"><button type="button" class="ffl-p" data-relclose="1">Schließen</button></div></div>';
    (document.fullscreenElement || document.body).appendChild(box);
    function close() { box.remove(); document.removeEventListener('keydown', key, true); try { if (prev && prev.focus) prev.focus(); } catch (e) {} }
    function key(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } }
    document.addEventListener('keydown', key, true);
    box.addEventListener('click', function (e) { if (e.target === box || e.target.closest('[data-relclose]')) close(); });
    setTimeout(function () { var b = box.querySelector('[data-relclose]'); if (b) b.focus(); }, 30);
    if (r.seen !== r.ver) relSeen();
  }
  function relSeen() {
    var r = window.MYFUI.release; if (!r) return;
    r.seen = r.ver;
    var bar = document.querySelector('.ffl-relbar'); if (bar) bar.remove();
    try { fetch(MYF.api + 'me/seenver', { method: 'POST', credentials: 'same-origin', headers: { 'X-WP-Nonce': MYF.nonce } }); } catch (e) {}
  }
  // Hinweis „Neue Version“ (einmal je Konto und Version)
  function relBar() {
    var r = window.MYFUI.release; if (!r || !r.notes || !r.notes.length || r.seen === r.ver) return '';
    return '<div class="ffl-msg ok ffl-relbar"><span><b>Neu: ' + esc((window.MYF && MYF.app) || 'SPIND') + ' ' + esc(r.ver) + (r.channel ? ' (' + esc(r.channel) + ')' : '') + '</b> – ' + esc(r.notes[0].title || '') + '</span>' +
      '<button type="button" class="ffl-sm ffl-p" data-relnotes="1">Was ist neu?</button><button type="button" class="ffl-sm ffl-q" data-relseen="1">Ausblenden</button></div>';
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-relnotes],[data-relseen]'); if (!t) return;
    e.preventDefault(); e.stopPropagation();
    if (t.hasAttribute('data-relnotes')) relNotes(); else relSeen();
  }, true);
  // Hell/Dunkel: ohne eigene Wahl wie das System; Wahl je Gerät gemerkt
  icons.moon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
  icons.sun = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function pref() { try { return localStorage.getItem('myf-theme') || ''; } catch (e) { return ''; } }
  function current() { var p = pref(); return p === 'light' || p === 'dark' ? p : (mq && mq.matches ? 'dark' : 'light'); }
  function applyTheme() { document.documentElement.setAttribute('data-myf-theme', current()); }
  function toggleTheme() { var n = current() === 'dark' ? 'light' : 'dark'; try { localStorage.setItem('myf-theme', n); } catch (e) {} applyTheme(); return n; }
  function themeBtn() { var dark = current() === 'dark'; return '<button type="button" class="ffl-iconbtn" data-theme-toggle="1" aria-label="' + (dark ? 'Hell' : 'Dunkel') + '" title="' + (dark ? 'Heller Modus' : 'Dunkler Modus') + '">' + (dark ? icons.sun : icons.moon) + '</button>'; }
  applyTheme();
  if (mq && mq.addEventListener) mq.addEventListener('change', function () { if (!pref()) applyTheme(); });
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-theme-toggle]'); if (!b) return;
    var dark = toggleTheme() === 'dark';
    [].forEach.call(document.querySelectorAll('[data-theme-toggle]'), function (x) { x.innerHTML = dark ? icons.sun : icons.moon; x.title = dark ? 'Heller Modus' : 'Dunkler Modus'; });
  });
  // Darstellung fest wählen: 'light', 'dark' oder '' (wie das Gerät)
  function setTheme(p) { try { if (p) localStorage.setItem('myf-theme', p); else localStorage.removeItem('myf-theme'); } catch (e) {} applyTheme(); }
  // ---- Listen-Baustein (überall gleich): Suche, Sortierung, Seiten -------------------------------------------------
  // lt(state, 'schluessel', zeilen, { text: fn(zeile)→Suchtext, sorts: [[id, Bezeichnung, fn(zeile)→Wert, Richtung]], per: 25, noun: 'Einsätze', ph: 'Suchen …', extra: html })
  // → { rows: Zeilen der aktuellen Seite, bar: Suchleiste, pager: Seitenleiste, total: Treffer }
  function ltNorm(x) { return String(x == null ? '' : x).toLowerCase().replace(/ß/g, 'ss'); }
  function lt(state, key, rows, o) {
    o = o || {}; state.lt = state.lt || {};
    var s = state.lt[key] = state.lt[key] || { q: '', sort: o.sorts && o.sorts.length ? o.sorts[0][0] : '', page: 0 };
    var list = rows || [];
    if (s.q && o.text) { var w = ltNorm(s.q).split(/\s+/).filter(Boolean); list = list.filter(function (r) { var h = ltNorm(o.text(r)); return w.every(function (x) { return h.indexOf(x) >= 0; }); }); }
    var srt = (o.sorts || []).filter(function (x) { return x[0] === s.sort; })[0];
    if (srt) list = list.slice().sort(function (a, b) { var x = srt[2](a), y = srt[2](b); if (typeof x === 'string') { x = ltNorm(x); y = ltNorm(y); } return (x < y ? -1 : x > y ? 1 : 0) * (srt[3] || 1); });
    var per = o.per || 25, pages = Math.max(1, Math.ceil(list.length / per));
    if (s.page >= pages) s.page = pages - 1; if (s.page < 0) s.page = 0;
    var total = (rows || []).length, shown = list.length;
    var bar = (o.text || (o.sorts && o.sorts.length > 1) || o.extra) ? '<div class="ffl-lt" data-ltbar="' + key + '">' +
      (o.text ? '<input type="search" class="ffl-lt-q" data-lt-q="' + key + '" value="' + esc(s.q) + '" placeholder="' + esc(o.ph || 'Suchen …') + '" autocomplete="off" aria-label="' + esc(o.ph || 'Suchen') + '">' : '') +
      (o.sorts && o.sorts.length > 1 ? '<label class="ffl-lt-sort"><span>Sortieren</span><select data-lt-sort="' + key + '" aria-label="Sortieren">' + o.sorts.map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === s.sort ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') + '</select></label>' : '') +
      '<span class="ffl-lt-n">' + (shown === total ? total : shown + ' von ' + total) + (o.noun ? ' ' + esc(o.noun) : '') + (pages > 1 ? ' · Seite ' + (s.page + 1) + '/' + pages : '') + '</span>' + (o.extra || '') +
      (o.csv && shown ? '<button type="button" class="ffl-sm ffl-lt-csv" data-lt-csv="' + key + '" title="Die angezeigte (gefilterte) Liste als Tabelle für Excel herunterladen">↓ Excel</button>' : '') + '</div>' : '';
    if (o.csv) csvDefs[key] = { list: list, def: o.csv };
    var pager = '';
    if (pages > 1) {
      var nums = [], p = s.page;
      for (var i = 0; i < pages; i++) if (i === 0 || i === pages - 1 || Math.abs(i - p) <= 2) nums.push(i); else if (nums[nums.length - 1] !== '…') nums.push('…');
      pager = '<nav class="ffl-pager" aria-label="Seiten"><button type="button" data-lt-page="' + key + '" data-v="' + (p - 1) + '"' + (p ? '' : ' disabled') + ' aria-label="Vorherige Seite">‹</button>' + nums.map(function (n) {
        return n === '…' ? '<span class="ffl-pager-gap">…</span>' : '<button type="button" data-lt-page="' + key + '" data-v="' + n + '" aria-current="' + (n === p) + '">' + (n + 1) + '</button>';
      }).join('') + '<button type="button" data-lt-page="' + key + '" data-v="' + (p + 1) + '"' + (p < pages - 1 ? '' : ' disabled') + ' aria-label="Nächste Seite">›</button></nav>';
    }
    return { rows: list.slice(s.page * per, s.page * per + per), all: list, bar: bar, pager: pager, total: shown };
  }
  // CSV der aktuell gefilterten Liste (Excel: Semikolon, UTF-8 mit BOM); o.csv = { name: 'Datei', cols: [[Überschrift, fn(zeile)]] }
  var csvDefs = {};
  function ltCsv(key) {
    var c = csvDefs[key]; if (!c) return;
    var cell = function (v) { v = Array.isArray(v) ? v.join('; ') : String(v == null ? '' : v); if (/^[=+\-@]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; };
    var rows = [c.def.cols.map(function (x) { return cell(x[0]); }).join(';')].concat(c.list.map(function (r) { return c.def.cols.map(function (x) { return cell(x[1](r)); }).join(';'); }));
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = (c.def.name || key) + '_' + new Date().toISOString().slice(0, 10) + '.csv'; document.body.appendChild(a); a.click(); a.remove();
  }
  // Einmal je Ansicht verbinden: Tippen (verzögert, Fokus bleibt), Sortierung, Seitenwechsel, CSV
  function ltBind(root, state, render) {
    var tmr = null;
    root.addEventListener('input', function (e) {
      var k = e.target.getAttribute && e.target.getAttribute('data-lt-q'); if (!k) return;
      state.lt[k].q = e.target.value; state.lt[k].page = 0; clearTimeout(tmr);
      tmr = setTimeout(function () { render(); var el = root.querySelector('[data-lt-q="' + k + '"]'); if (el) { el.focus(); var n = el.value.length; try { el.setSelectionRange(n, n); } catch (x) {} } }, 250);
    });
    root.addEventListener('change', function (e) { var k = e.target.getAttribute && e.target.getAttribute('data-lt-sort'); if (!k) return; state.lt[k].sort = e.target.value; state.lt[k].page = 0; render(); });
    root.addEventListener('click', function (e) {
      var cb = e.target.closest && e.target.closest('[data-lt-csv]'); if (cb) { ltCsv(cb.getAttribute('data-lt-csv')); return; }
      var b = e.target.closest && e.target.closest('[data-lt-page]'); if (!b || b.disabled) return;
      var k = b.getAttribute('data-lt-page'); state.lt[k].page = +b.getAttribute('data-v'); render();
      var bar = root.querySelector('[data-ltbar="' + k + '"]') || root; if (bar.scrollIntoView) bar.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }
  // Eingabe-Dialog in der App statt prompt(): prompt beendet das Vollbild und blockiert die Seite.
  // ask({ title, text, value, ph, required, ok }) → Promise mit dem Text oder null (abgebrochen)
  // Plausibilität der Funktionen: ein EL je Einsatz, ein ZF je Zug, je Fahrzeug ein GF und ein MA – nur Hinweise, kein Zwang
  function roleHints(parts, nameOf, extra) {
    var byVeh = {}, zf = [], el = [], out = [], isExtra = function (v) { return (extra || []).indexOf(v) >= 0 || /gerätehaus|nachbereitung|aufräumen|andere/i.test(v || ''); };
    (parts || []).forEach(function (p) {
      var r = String(p.role || '').split(','), nm = nameOf(p);
      if (r.indexOf('ZF') >= 0) zf.push(nm); if (r.indexOf('EL') >= 0) el.push(nm);
      if (p.vehicle && !isExtra(p.vehicle)) { var b = byVeh[p.vehicle] = byVeh[p.vehicle] || { GF: [], MA: [] }; if (r.indexOf('GF') >= 0) b.GF.push(nm); if (r.indexOf('MA') >= 0) b.MA.push(nm); }
    });
    if (el.length > 1) out.push(el.length + ' Einsatzleiter eingetragen (' + el.join(', ') + ') – es gibt nur einen.');
    if (zf.length > 1) out.push(zf.length + ' Zugführer eingetragen (' + zf.join(', ') + ') – normalerweise einer je Zug.');
    Object.keys(byVeh).forEach(function (v) {
      if (byVeh[v].GF.length > 1) out.push(v + ': ' + byVeh[v].GF.length + ' Gruppenführer (' + byVeh[v].GF.join(', ') + ') – einer je Fahrzeug.');
      if (byVeh[v].MA.length > 1) out.push(v + ': ' + byVeh[v].MA.length + ' Maschinisten (' + byVeh[v].MA.join(', ') + ') – einer fährt.');
    });
    return out;
  }
  function ask(o) {
    o = o || {};
    return new Promise(function (resolve) {
      var host = document.fullscreenElement || document.body, box = document.createElement('div'), prev = document.activeElement;
      box.className = 'ffl-modal ffl-ask';
      box.innerHTML = '<form class="ffl-modal-in" role="dialog" aria-modal="true" aria-label="' + esc(o.title || 'Eingabe') + '">' + (o.title ? '<div class="ffl-sh">' + esc(o.title) + '</div>' : '') +
        (o.text ? '<p style="margin:0 0 10px;white-space:pre-line">' + esc(o.text) + '</p>' : '') +
        '<input type="text" name="v" value="' + esc(o.value || '') + '" placeholder="' + esc(o.ph || '') + '" autocomplete="off">' +
        '<p class="ffl-ask-err" role="alert" hidden></p><div class="ffl-row" style="margin-top:12px"><button type="submit" class="ffl-p">' + esc(o.ok || 'OK') + '</button><button type="button" data-ask="cancel">Abbrechen</button></div></form>';
      host.appendChild(box);
      var f = box.querySelector('form'), inp = f.querySelector('input'), err = f.querySelector('.ffl-ask-err');
      function done(v) { box.remove(); document.removeEventListener('keydown', esc_); try { if (prev && prev.focus) prev.focus(); } catch (e) {} resolve(v); }
      function esc_(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); } }
      document.addEventListener('keydown', esc_, true);
      f.addEventListener('submit', function (e) {
        e.preventDefault(); var v = inp.value.trim();
        if (o.required && v.length < (o.min || 3)) { err.hidden = false; err.textContent = o.required === true ? 'Bitte kurz ausfüllen.' : o.required; inp.focus(); return; }
        done(v);
      });
      box.addEventListener('click', function (e) { if (e.target === box || e.target.getAttribute('data-ask') === 'cancel') done(null); });
      setTimeout(function () { inp.focus(); inp.select(); }, 30);
    });
  }
  // Lehrgang suchen: tippen („atem“, „TM“, „gruppen“) → Treffer aus den bekannten Bezeichnungen, Klick übernimmt Titel + Kürzel.
  // Freie Eingabe bleibt möglich (dann ohne Kürzel). Titelliste setzt die Seite mit MYFUI.courseTitles = [...].
  function coursePick(id, ph) {
    return '<div class="ffl-cpick"><input type="text" id="' + id + '" data-cpick="1" autocomplete="off" placeholder="' + esc(ph || 'Lehrgang suchen, z. B. „atem“ oder „TM“') + '">' +
      '<input type="hidden" id="' + id + '-short"><div class="ffl-cpick-res" role="listbox" hidden></div></div>';
  }
  function cpMatch(q) {
    var w = String(q || '').toLowerCase().split(/\s+/).filter(Boolean), list = window.MYFUI.courseTitles || [];
    if (!w.length) return list.slice(0, 8);
    return list.filter(function (c) { var t = (c.title + ' ' + c.short).toLowerCase(); return w.every(function (x) { return t.indexOf(x) >= 0; }); })
      .sort(function (a, b) { var q0 = w[0]; return (a.short.toLowerCase() === q0 ? 0 : 1) - (b.short.toLowerCase() === q0 ? 0 : 1); }).slice(0, 8);
  }
  function cpPaint(inp) {
    var box = inp.parentNode.querySelector('.ffl-cpick-res'), hits = cpMatch(inp.value);
    document.getElementById(inp.id + '-short').value = '';
    box.innerHTML = hits.map(function (c, i) { return '<button type="button" role="option" data-cpi="' + i + '"><b>' + esc(c.short || '–') + '</b><span>' + esc(c.title) + '</span></button>'; }).join('') +
      (inp.value.trim() && !hits.some(function (c) { return c.title.toLowerCase() === inp.value.trim().toLowerCase(); }) ? '<p>Nicht dabei? So übernehmen: „' + esc(inp.value.trim()) + '“</p>' : '');
    box._hits = hits; box.hidden = !box.innerHTML;
  }
  document.addEventListener('input', function (e) { if (e.target.getAttribute && e.target.getAttribute('data-cpick')) cpPaint(e.target); });
  document.addEventListener('focusin', function (e) { if (e.target.getAttribute && e.target.getAttribute('data-cpick')) cpPaint(e.target); });
  document.addEventListener('mousedown', function (e) {
    var b = e.target.closest && e.target.closest('.ffl-cpick-res button');
    document.querySelectorAll('.ffl-cpick-res').forEach(function (r) { if (!r.contains(e.target) && !(r.parentNode.contains(e.target))) r.hidden = true; });
    if (!b) return; e.preventDefault();
    var box = b.parentNode, inp = box.parentNode.querySelector('[data-cpick]'), c = box._hits[+b.getAttribute('data-cpi')];
    inp.value = c.title; document.getElementById(inp.id + '-short').value = c.short; box.hidden = true;
  });
  // Dokumente als Kacheln: Symbol, Name, Stand und klare Aktionen („Ansehen“ öffnet die Vorschau mit PDF / Drucken)
  var DOC_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M8.5 13h7M8.5 17h5"/></svg>';
  // Einheitlich: Symbol, Name, Status-Marke (Systemfarben: warn = Bernstein „zu tun“, ok = Grün „erledigt“, open = Blau „in Arbeit“),
  // eine Zeile Stand, unten die Knöpfe – immer erst die Nebenaktionen, rechts die Hauptaktion (rot)
  function docCards(list) {
    return '<div class="ffl-docs">' + list.filter(Boolean).map(function (x) {
      var tone = x.chip ? x.chip.tone : '', acts = (x.acts || []).filter(Boolean);
      acts = acts.filter(function (a) { return !a.p; }).concat(acts.filter(function (a) { return a.p; }));
      return '<div class="ffl-doc' + (tone === 'warn' ? ' is-warn' : tone === 'ok' ? ' is-ok' : '') + '"><div class="ffl-doc-i">' + DOC_SVG + '</div><div class="ffl-doc-t"><b>' + esc(x.title) + '</b>' +
        (x.chip || x.sub ? '<span class="ffl-doc-s">' + (x.chip ? '<i class="ffl-chip st-' + esc(x.chip.tone) + '">' + esc(x.chip.label) + '</i>' : '') + (x.sub ? '<span>' + esc(x.sub) + '</span>' : '') + '</span>' : '') +
        '</div><div class="ffl-doc-a">' + acts.map(function (a) {
          return '<button type="button" class="ffl-sm' + (a.p ? ' ffl-p' : '') + '" data-act="' + a.act + '"' + (a.id != null ? ' data-id="' + a.id + '"' : '') + (a.v != null ? ' data-v="' + esc(a.v) + '"' : '') + (a.off ? ' disabled' : '') + '>' + esc(a.label) + '</button>';
        }).join('') + '</div></div>';
    }).join('') + '</div>';
  }
  window.MYFUI = { release: null, relBar: relBar, docCards: docCards, roleHints: roleHints, ask: ask, coursePick: coursePick, courseTitles: [], icons: icons, who: who, foot: foot, esc: esc, themeBtn: themeBtn, theme: current, themePref: pref, setTheme: setTheme, lt: lt, ltBind: ltBind };
})();

// Ganze Zeile anklickbar: Ein Klick irgendwo auf eine Listenzeile (Nachbereitung, Benachrichtigung, „Was steht an?“ …) wirkt wie ihr „Öffnen“-Knopf.
// Nur Knöpfe, die etwas öffnen – nie solche, die direkt speichern (z. B. „Ich komme“).
(function () {
  var ROWS = '.ffl-furow, .ffl-note, .ffl-todo, .ffl-fu-row, .ffl-dlitem-row';
  var OPEN = 'a.ffl-btn[href], [data-act="ngo"], [data-act="ango"], [data-act="startinc"], [data-act="startpart"], [data-act="pform"], [data-act="repopen"], [data-act="repview"], [data-act="vopen"], [data-act="wsopen"], [data-act="profile"], [data-go], [data-tab]';
  function main(row) { var c = row.querySelectorAll(OPEN); return c.length === 1 ? c[0] : row.querySelector('[data-rowmain]'); }
  document.addEventListener('click', function (e) {
    var row = e.target.closest && e.target.closest(ROWS); if (!row || !row.closest('.ffl')) return;
    if (e.target.closest('button, a, input, select, textarea, label, summary, details')) return;
    if (window.getSelection && String(window.getSelection()).length > 2) return; // Text markieren bleibt möglich
    var m = main(row); if (m) m.click();
  });
  // Zeiger und Hover nur dort, wo es wirklich etwas zu öffnen gibt
  function mark() { [].forEach.call(document.querySelectorAll(ROWS), function (r) { r.classList.toggle('is-rowlink', !!main(r)); }); }
  new MutationObserver(function () { clearTimeout(mark.t); mark.t = setTimeout(mark, 60); }).observe(document.documentElement, { childList: true, subtree: true });
})();

/* Barrierefreiheit: Eingabefelder ohne Beschriftung bekommen einen Namen für Vorlese-Programme – aus Spaltenüberschrift
   (data-l bzw. <th>), der Beschriftung direkt davor, dem Tooltip oder dem Platzhalter. Läuft nach jedem Neuzeichnen. */
(function () {
  function named(el) {
    if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.closest('label')) return true;
    return !!(el.id && document.querySelector('label[for="' + (window.CSS && CSS.escape ? CSS.escape(el.id) : el.id) + '"]'));
  }
  // Einzelne Felder ohne erkennbaren Zusammenhang: feste Namen
  var NAMES = { 'ffl-dobjects': 'Objekte für Mängelmeldungen', 'ffl-sreset': 'Dashboard: zurück zur Startansicht nach Minuten', 'ffl-impfile': 'Datei zum Importieren',
    'ffl-icsfile': 'Kalenderdatei (.ics)', 'ffl-restfile': 'Sicherungsdatei', 'ffl-logofile': 'Logo-Datei', 'ffl-cqty': 'Anzahl', 'ffl-agtdate': 'Datum' };
  function guess(el) {
    if (NAMES[el.id]) return NAMES[el.id];
    var td = el.closest('td, th'), txt = '';
    if (td && td.getAttribute('data-l')) txt = td.getAttribute('data-l');
    else if (td) { var tr = td.parentElement, table = td.closest('table'), th = table && table.tHead && table.tHead.rows[0] && table.tHead.rows[0].cells[[].indexOf.call(tr.cells, td)]; if (th) txt = th.textContent; }
    if (!txt) { var p = el.previousElementSibling; if (p && /ffl-fl|LABEL/.test(p.className + ' ' + p.tagName)) txt = p.textContent; }
    if (!txt) { var box = el.parentElement, f = box && box.querySelector('.ffl-fl'); if (f && box.querySelectorAll('input, select, textarea').length === 1) txt = f.textContent; }
    // Tabelle ohne Überschrift: Zeilenname + Einheit daneben („Maske – Monate“)
    if (!txt && td && td.parentElement && td.parentElement.cells) { var c0 = td.parentElement.cells[0]; txt = ((c0 && c0 !== td ? c0.textContent.trim() + ' – ' : '') + td.textContent.trim()).replace(/ – $/, ''); }
    // Listen-Editoren (Katalog, Funktionen …) und Abschnittstitel im Formular-Editor: der Inhalt ist die Bezeichnung selbst
    if (!txt && el.closest('.ffl-lrow')) txt = 'Bezeichnung';
    if (!txt && el.getAttribute('data-fs') === 'title') txt = 'Abschnitt-Titel';
    if (!txt && el.getAttribute('data-ff') === 'label') txt = 'Feld-Bezeichnung';
    // Auswahlfeld ohne alles: erste Auswahl nennt meist, worum es geht („alle Gerätearten“, „offen + bestellt“)
    if (!txt && el.tagName === 'SELECT' && el.options.length) txt = 'Auswahl: ' + el.options[0].text;
    return (txt || el.getAttribute('title') || el.getAttribute('placeholder') || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  }
  var t = null;
  function run() {
    t = null;
    [].forEach.call(document.querySelectorAll('.ffl input:not([type=hidden]), .ffl select, .ffl textarea'), function (el) {
      if (named(el)) return; var g = guess(el); if (g) el.setAttribute('aria-label', g);
    });
  }
  new MutationObserver(function () { if (!t) t = setTimeout(run, 120); }).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', run);
})();
