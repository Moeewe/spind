<?php
/**
 * Einsätze & Übungen: Einsatzbeteiligung („Ich war dabei“), digitaler Einsatzbericht (Erfassungsbogen, per QR-Code
 * erreichbar, Formular in der Verwaltung anpassbar) und Bescheinigung für den Arbeitgeber (Verdienstausfall).
 * Einsätze aus der Einsatzverwaltung werden automatisch übernommen; Übungen und weitere Einsätze lassen sich anlegen.
 */

defined('ABSPATH') || exit;

const MYF_INCIDENT_CATS = ['brand' => 'Brandeinsatz', 'th' => 'Hilfeleistung', 'vu' => 'Verkehrsunfall', 'sonst' => 'Sonstiges', 'fehl' => 'Fehlalarm'];

function myf_install_incidents($c) {
    global $wpdb;
    $p = myf_t(''); // echte oder Demo-Tabellen (Demo-Modus)
    dbDelta("CREATE TABLE {$p}incidents (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        post_id bigint(20) unsigned NULL,
        kind varchar(10) NOT NULL DEFAULT 'einsatz',
        nr varchar(30) NOT NULL DEFAULT '',
        ext_nr varchar(40) NOT NULL DEFAULT '',
        unit varchar(20) NOT NULL DEFAULT '',
        alarms text NULL,
        part_closed datetime NULL,
        part_closed_by varchar(120) NOT NULL DEFAULT '',
        title varchar(200) NOT NULL DEFAULT '',
        category varchar(10) NOT NULL DEFAULT 'sonst',
        start datetime NOT NULL,
        end datetime NULL,
        place varchar(200) NOT NULL DEFAULT '',
        vehicles text NULL,
        report longtext NULL,
        report_by varchar(120) NOT NULL DEFAULT '',
        report_at datetime NULL,
        report_lead varchar(120) NOT NULL DEFAULT '',
        report_closed datetime NULL,
        report_closed_by varchar(120) NOT NULL DEFAULT '',
        report_ext varchar(200) NOT NULL DEFAULT '',
        report_log text NULL,
        source varchar(20) NOT NULL DEFAULT '',
        alarm_text text NULL,
        alarm_lat decimal(9,6) NULL,
        alarm_lng decimal(9,6) NULL,
        pub_status varchar(10) NOT NULL DEFAULT '',
        pub_title varchar(200) NOT NULL DEFAULT '',
        pub_type varchar(80) NOT NULL DEFAULT '',
        pub_place varchar(200) NOT NULL DEFAULT '',
        pub_text text NULL,
        pub_res text NULL,
        pub_at datetime NULL,
        pub_by varchar(120) NOT NULL DEFAULT '',
        retain_until date NULL,
        retain_reason varchar(160) NOT NULL DEFAULT '',
        redacted_at datetime NULL,
        redacted_by varchar(120) NOT NULL DEFAULT '',
        created datetime NOT NULL,
        created_by varchar(120) NOT NULL DEFAULT '',
        PRIMARY KEY  (id),
        KEY start (start),
        KEY post_id (post_id),
        KEY kind_start (kind,start)
    ) $c;");
    dbDelta("CREATE TABLE {$p}participation (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        incident_id bigint(20) unsigned NOT NULL,
        member_id bigint(20) unsigned NOT NULL,
        vehicle varchar(40) NOT NULL DEFAULT '',
        t_start datetime NULL,
        t_end datetime NULL,
        as_minutes smallint(5) unsigned NOT NULL DEFAULT 0,
        cert varchar(10) NOT NULL DEFAULT '',
        cert_printed datetime NULL,
        cert_printed_by varchar(120) NOT NULL DEFAULT '',
        cert_handed datetime NULL,
        cert_handed_by varchar(120) NOT NULL DEFAULT '',
        work_resume varchar(10) NOT NULL DEFAULT '',
        confirmed tinyint(1) NOT NULL DEFAULT 0,
        confirmed_by varchar(120) NOT NULL DEFAULT '',
        source varchar(10) NOT NULL DEFAULT 'app',
        role varchar(30) NOT NULL DEFAULT '',
        change_req varchar(200) NOT NULL DEFAULT '',
        created datetime NOT NULL,
        updated datetime NULL,
        PRIMARY KEY  (id),
        UNIQUE KEY inc_member (incident_id, member_id),
        KEY member_id (member_id)
    ) $c;");
}

// Standard-Erfassungsbogen (nach einem üblichen Papierbogen); in der Verwaltung anpassbar
function myf_report_form_default() {
    $f = function ($id, $label, $type, $options = [], $sensitive = false) { return compact('id', 'label', 'type', 'options', 'sensitive'); };
    return [
        ['title' => 'Alarmierung', 'fields' => [
            $f('alarmart', 'Alarmierungsart', 'checks', ['Meldeempfänger', 'Meldeempfänger + Sirene', 'Sirene', 'Telefon', 'Funk', 'persönlich']),
            $f('alarm_ueber', 'Alarmierung über', 'checks', myf_local('alarm_via')),
        ]],
        ['title' => 'Einsatz', 'fields' => [
            $f('loeschzug', 'Einheit', 'checks', array_map(function ($l) { return preg_replace('/^LZ\s/u', 'Löschzug ', $l); }, array_values(myf_units()))),
            $f('objekt', 'Einsatzobjekt', 'checks', ['Wohnhaus', 'landw. Anwesen', 'Gewerbeobjekt', 'Industrieobjekt', 'KFZ', 'Straße', 'Freigelände', 'andere']),
            $f('objekt_text', 'Einsatzobjekt: anderes', 'text'),
            $f('einsatzart', 'Einsatzart', 'checks', ['Brand: Kleinfeuer a', 'Brand: Kleinfeuer b', 'Brand: Mittelbrand', 'Brand: Großbrand',
                'TH: Ölspur klein', 'TH: Ölspur groß', 'TH: Person klemmt', 'TH: Sonstiges', 'Fehlalarm in guter Absicht', 'Fehlalarm in böswilliger Absicht',
                'Brandsicherheitswache', 'kein Einsatz mehr erforderlich']),
            $f('einsatzart_text', 'Einsatzart: Sonstiges / weitere', 'text'),
            $f('beteiligung', 'Beteiligung anderer Einheiten', 'checks', array_merge(count(myf_units()) > 1 ? array_map(function ($l) { return preg_replace('/^LZ\s/u', 'Löschzug ', $l); }, array_values(myf_units())) : [], ['nachbarliche Löschhilfe'])),
            $f('beteiligung_text', 'Löschhilfe für / weitere', 'text'),
            $f('kennzeichen', 'bei KFZ: Kennzeichen', 'text', [], true),
        ]],
        ['title' => 'Personen', 'fields' => [
            $f('geschaedigter', 'Geschädigter: Name', 'text', [], true),
            $f('geschaedigter_anschrift', 'Geschädigter: Anschrift (leer = wie Einsatzort)', 'text', [], true),
            $f('einsatzleiter', 'Einsatzleiter', 'text'),
        ]],
        ['title' => 'Lage & Bericht', 'fields' => [
            $f('lage', 'Lage bei Eintreffen', 'textarea'),
            $f('bericht', 'Bericht (durchgeführte Maßnahmen)', 'textarea'),
            $f('erlaeuterung', 'Erläuterung (weitere Anmerkungen)', 'textarea'),
        ]],
        ['title' => 'Ursache & Schaden', 'fields' => [
            $f('ursache', 'Ursache', 'checks', ['Selbstentzündung', 'technischer Defekt', 'fahrlässige Brandstiftung', 'unbekannt', 'vorsätzliche Brandstiftung', 'andere']),
            $f('verletzte', 'Verletzte Personen', 'number'),
            $f('getoetete', 'Getötete Personen', 'number'),
            $f('sachschaden', 'Sachschaden (EUR)', 'number'),
        ]],
        ['title' => 'Kosten', 'fields' => [
            $f('kostenpflicht', 'Kostenpflicht', 'radio', ['Einsatz ist nicht kostenpflichtig', 'Einsatz ist kostenpflichtig']),
            $f('kostengrund', 'Grund', 'checks', ['Verursacher (vorsätzlich)', 'Fahrzeughalter (beim Betrieb des KFZ)', 'andere verpflichtete Behörde (z. B. Straßenbaulastträger)',
                'Betreiber einer Anlage (§ 29 BHKG)', 'Transportunternehmer (gefährl. Güter)', 'Eigentümer/Besitzer (gefährl. Güter, nicht Transport)',
                'Eigentümer Brandmeldeanlage (missbräuchlich/nicht bestimmungsgemäß)', 'Sicherheitsdienst (Weitergabe ohne Prüfung)', 'vorsätzliche grundlose Alarmierung', 'Auftraggeber (freiwillige Leistung, BSW)']),
            $f('kostenpflichtiger', 'Kostenpflichtiger: Name (leer = wie Geschädigter)', 'text', [], true),
            $f('kostenpflichtiger_anschrift', 'Kostenpflichtiger: Anschrift', 'text', [], true),
        ]],
        ['title' => 'Geräte & Material', 'fields' => [
            $f('geraete', 'Geräte', 'textarea'),
            $f('oelbinder', 'Ölbindemittel (kg/Sack)', 'number'),
            $f('material', 'weiteres Material', 'text'),
        ]],
        ['title' => 'Sonstiges', 'fields' => [
            $f('sonstiges', 'Sonstiges / Ergänzungen', 'textarea'),
        ]],
    ];
}
function myf_report_form() {
    $f = myf_settings()['report_form'] ?? null;
    return is_array($f) && $f ? $f : myf_report_form_default();
}
// Formular-Fassungen (revisionssicher): jeder Bericht merkt sich die Fassung, mit der er erfasst wurde (Schlüssel „_form“).
// Anzeige und PDF eines alten Berichts nutzen genau diese Fassung – auch wenn das Formular später geändert wird.
function myf_report_form_ver($form) { return substr(md5(wp_json_encode($form)), 0, 10); }
function myf_report_forms() { $h = get_option('myf_report_forms', []); return is_array($h) ? $h : []; }
function myf_report_form_keep($form) {
    $v = myf_report_form_ver($form); $h = myf_report_forms();
    if (!isset($h[$v])) { $h[$v] = ['form' => $form, 'since' => current_time('mysql')]; update_option('myf_report_forms', $h, false); }
    return $v;
}
// Berichte von vor der Versionierung: die damals gültige Fassung (eigenes Formular oder das bisherige Standardformular)
function myf_report_form_legacy() {
    $l = get_option('myf_report_form_legacy');
    if (is_array($l) && $l) return $l;
    $own = myf_settings()['report_form'] ?? null;
    $l = is_array($own) && $own ? $own : array_map(function ($sec) {
        $sec['fields'] = array_values(array_filter($sec['fields'], function ($f) { return !in_array($f['id'], ['objekt_text', 'einsatzart_text'], true); }));
        return $sec;
    }, myf_report_form_default());
    update_option('myf_report_form_legacy', $l, false);
    return $l;
}
// Bezeichnungen aller Felder aus allen Fassungen – damit Werte aus früheren Fassungen lesbar bleiben
function myf_report_labels() {
    $out = [];
    foreach (array_merge([myf_report_form_legacy(), myf_report_form_default(), myf_report_form()], array_column(myf_report_forms(), 'form')) as $form)
        foreach ((array) $form as $sec) foreach ((array) ($sec['fields'] ?? []) as $f) if (!isset($out[$f['id']])) $out[$f['id']] = $f['label'];
    return $out;
}
function myf_report_form_for($values) {
    if (!is_array($values) || !$values) return myf_report_form(); // noch nichts erfasst: aktuelle Fassung
    $v = (string) ($values['_form'] ?? '');
    if ($v === '') return myf_report_form_legacy(); // vor der Versionierung gespeichert
    $h = myf_report_forms();
    return $h[$v]['form'] ?? myf_report_form();
}
add_action('init', function () { if (!get_option('myf_report_form_legacy')) myf_report_form_legacy(); }, 20);
// Fahrzeuge zur Auswahl im Einsatz (Warst du dabei?, Halle, Fahrzeugzeiten): kommen aus Technik → Fahrzeuge
// („im Einsatz auswählbar“) – eine Liste für alles, Status und Fahrtenbuch hängen am selben Fahrzeug.
function myf_incident_vehicles() {
    global $wpdb;
    $rows = $wpdb->get_col('SELECT name FROM ' . myf_t('vehicles') . ' WHERE active = 1 AND in_incidents = 1 ORDER BY unit, name');
    if ($rows) return array_values(array_unique(array_merge($rows, function_exists('myf_incveh_extra') ? myf_incveh_extra() : [], ['Andere'])));
    $v = myf_settings()['incident_vehicles'] ?? null;
    return is_array($v) && $v ? array_values($v) : myf_local('vehicles');
}

// Einsätze aus der Einsatzverwaltung übernehmen (gemeinsame Einsätze mit gleicher Alarmzeit nur einmal)
function myf_incidents_sync() {
    global $wpdb;
    if (!post_type_exists('einsatz') || myf_demo_ctx()) return; // Demo: keine echten Einsätze übernehmen
    // Einmalig: Nummern schon übernommener Berichte mit Buchstaben-Nummernkreis („A09/2026“ statt „09/2026“) berichtigen
    if (!get_option('myf_nr_fix2')) {
        foreach ($wpdb->get_results('SELECT i.id, i.nr, i.unit, p.ID pid, p.post_title FROM ' . myf_t('incidents') . " i JOIN {$wpdb->posts} p ON p.ID = i.post_id WHERE i.source = 'einsatzverwaltung'") as $r) {
            $nr = myf_incident_nr_text(html_entity_decode($r->post_title, ENT_QUOTES)); $u = $r->unit !== '' ? $r->unit : myf_evw_unit_key((int) $r->pid);
            if ($nr !== $r->nr || $u !== $r->unit) $wpdb->update(myf_t('incidents'), ['nr' => $nr, 'unit' => $u], ['id' => $r->id]);
        }
        update_option('myf_nr_fix2', 1, false);
    }
    if (get_transient('myf_inc_sync')) return;
    set_transient('myf_inc_sync', 1, 5 * MINUTE_IN_SECONDS);
    // Auch nachgetragene Berichte des Vorjahres übernehmen (Schnellerfassung trägt gern ganze Listen nach)
    $since = (date('Y', current_time('timestamp')) - 1) . '-01-01 00:00:00';
    $posts = $wpdb->get_results($wpdb->prepare("SELECT ID, post_title, post_date FROM {$wpdb->posts} WHERE post_type = 'einsatz' AND post_status = 'publish' AND post_date >= %s ORDER BY post_date", $since));
    foreach ($posts as $p) {
        $title = html_entity_decode($p->post_title, ENT_QUOTES);
        $nr = myf_incident_nr_text($title); // mit Nummernkreis-Buchstaben („A09/2026“ = zweiter Löschzug)
        if ($have = $wpdb->get_row($wpdb->prepare('SELECT id, nr, post_id FROM ' . myf_t('incidents') . ' WHERE post_id = %d OR (kind = \'einsatz\' AND start = %s)', $p->ID, $p->post_date))) {
            // Gemeinsamer Einsatz zweier Einheiten (26/2026 und A07/2026, gleiche Alarmzeit): der Bericht mit der Nummer ohne Buchstaben führt
            if ((int) $have->post_id !== (int) $p->ID && $nr !== '' && ctype_digit($nr[0]) && $have->nr !== '' && !ctype_digit($have->nr[0]))
                $wpdb->update(myf_t('incidents'), ['post_id' => $p->ID, 'nr' => $nr, 'unit' => myf_evw_unit_key($p->ID)], ['id' => $have->id]);
            continue;
        }
        // Gibt es den Einsatz schon – gleiche Nummer, oder ein Alarm bzw. selbst angelegter Einsatz zur gleichen Zeit? Dann verknüpfen
        $alarm = $nr !== '' ? $wpdb->get_row($wpdb->prepare('SELECT id, start FROM ' . myf_t('incidents') . " WHERE nr = %s AND post_id IS NULL AND kind = 'einsatz' LIMIT 1", $nr)) : null;
        if ($alarm) { $wpdb->update(myf_t('incidents'), ['post_id' => $p->ID], ['id' => $alarm->id]); continue; }
        foreach ($wpdb->get_results($wpdb->prepare('SELECT id, start FROM ' . myf_t('incidents') . " WHERE source IN ('alamos','manuell','terminal') AND post_id IS NULL AND kind = 'einsatz' AND start BETWEEN %s AND %s",
            date('Y-m-d H:i:s', strtotime($p->post_date) - 45 * MINUTE_IN_SECONDS), date('Y-m-d H:i:s', strtotime($p->post_date) + 45 * MINUTE_IN_SECONDS))) as $c) {
            if (!$alarm || abs(strtotime($c->start) - strtotime($p->post_date)) < abs(strtotime($alarm->start) - strtotime($p->post_date))) $alarm = $c;
        }
        if ($alarm) { $u = ['post_id' => $p->ID]; if ($nr !== '' && !$wpdb->get_var($wpdb->prepare('SELECT nr FROM ' . myf_t('incidents') . ' WHERE id = %d', $alarm->id))) $u['nr'] = $nr; $wpdb->update(myf_t('incidents'), $u, ['id' => $alarm->id]); continue; }
        $types = taxonomy_exists('einsatzart') ? wp_get_post_terms($p->ID, 'einsatzart', ['fields' => 'names']) : [];
        $type = is_wp_error($types) ? '' : implode(' ', $types);
        $cat = preg_match('/brand|feuer|bma/i', $title . ' ' . $type) ? 'brand' : (preg_match('/vu|verkehr|unfall/i', $title . ' ' . $type) ? 'vu' : (preg_match('/fehl/i', $title . ' ' . $type) ? 'fehl' : 'th'));
        $end = get_post_meta($p->ID, 'einsatz_einsatzende', true);
        $wpdb->insert(myf_t('incidents'), ['post_id' => $p->ID, 'kind' => 'einsatz', 'nr' => $nr, 'unit' => myf_evw_unit_key($p->ID), 'title' => trim(preg_replace('#^Einsatz\s+[A-Za-z]{0,2}\d{1,4}(?:\s*[-–]\s*\d{1,4})?/\d{4}\s*#u', '', $title)) ?: $title,
            'category' => $cat, 'start' => $p->post_date, 'end' => preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/', (string) $end) ? $end : null,
            'place' => (string) get_post_meta($p->ID, 'einsatz_einsatzort', true), 'source' => 'einsatzverwaltung', 'created' => current_time('mysql'), 'created_by' => 'Einsatzverwaltung']);
    }
}

// Einsatznummer als Text, wie sie im Titel steht („48/2026“, „A09/2026“, „46-48/2026“)
function myf_incident_nr_text($title) {
    return preg_match('#(?<![\p{L}\d])([A-Za-z]{0,2}\d{1,4}(?:\s*[-–]\s*\d{1,4})?/\d{4})#u', (string) $title, $m) ? strtoupper(substr($m[1], 0, 2)) . substr($m[1], 2) : '';
}
// Einheit eines Berichts der Einsatzverwaltung (evw_unit „Löschzug Nord“ ↔ Einheit „LZ Nord“); mehrere oder keine → '' (gemeinsam)
function myf_evw_unit_key($post_id) {
    if (!taxonomy_exists('evw_unit') || count(myf_units()) < 2) return '';
    $terms = wp_get_post_terms($post_id, 'evw_unit', ['fields' => 'names']);
    if (is_wp_error($terms) || count($terms) !== 1) return '';
    $want = mb_strtolower(myf_unit_short($terms[0]));
    foreach (myf_units() as $k => $label) if (mb_strtolower(myf_unit_short($label)) === $want) return (string) $k;
    return '';
}
// Neuer oder geänderter Einsatzbericht in der Einsatzverwaltung: beim nächsten Aufruf sofort übernehmen
add_action('save_post_einsatz', function () { delete_transient('myf_inc_sync'); });

// Einsatzleiter für Listen: aus dem Bericht, sonst aus der Teilnahme (EL, dann ZF, dann GF) – je Anfrage zwischengespeichert
function myf_incident_lead($i) {
    global $wpdb;
    if (!empty($i->report_lead)) return $i->report_lead;
    static $cache = null;
    if ($cache === null) {
        $cache = [];
        foreach ($wpdb->get_results('SELECT p.incident_id, p.role, m.name FROM ' . myf_t('participation') . ' p JOIN ' . myf_t('members') . " m ON m.id = p.member_id WHERE p.role LIKE '%EL%' OR p.role LIKE '%ZF%' OR p.role LIKE '%GF%'") as $r) {
            $rank = 9; foreach (['EL' => 1, 'ZF' => 2, 'GF' => 3] as $k => $n) if (in_array($k, explode(',', (string) $r->role), true)) $rank = min($rank, $n);
            if ($rank < 9 && (!isset($cache[$r->incident_id]) || $rank < $cache[$r->incident_id][0])) { $x = explode(',', $r->name, 2); $cache[$r->incident_id] = [$rank, trim((isset($x[1]) ? trim($x[1]) . ' ' : '') . $x[0])]; }
        }
    }
    return $cache[$i->id][1] ?? '';
}
// „Bericht offen“ – eine Regel für Verwaltung, Mitgliederbereich und Startseite: Einsatz (kein Test), nicht abgeschlossen
// (auch nicht „anderweitig erfasst“), ab dem ersten Bericht im System, höchstens 60 Tage zurück; ohne jeden Bericht nur die letzten 3 Tage.
// So tauchen Altbestände aus der Zeit vor SPIND nicht als offen auf.
// Nachbereitung: je Einsatz der letzten 60 Tage, was noch fehlt – Bericht, Bestätigung der Beteiligten, Fahrtenbuch je eingesetztem Fahrzeug,
// Atemschutzüberwachung (wenn AGT dabei), Leihkleidung zurück. Eine Zeile pro Einsatz, nur Einsätze mit offenen Punkten.
function myf_followup() {
    global $wpdb;
    $since = date('Y-m-d', current_time('timestamp') - 60 * DAY_IN_SECONDS);
    $rows = $wpdb->get_results($wpdb->prepare('SELECT id, nr, title, start, vehicles, report, report_closed, part_closed FROM ' . myf_t('incidents') . " WHERE kind = 'einsatz' AND source <> 'test' AND start >= %s ORDER BY start DESC LIMIT 40", $since));
    if (!$rows) return [];
    $vname = []; foreach ($wpdb->get_results('SELECT id, name FROM ' . myf_t('vehicles')) as $v) $vname[(int) $v->id] = $v->name;
    $asuMiss = function_exists('myf_asu_missing') ? array_map(function ($x) { return (int) $x->id; }, myf_asu_missing()) : [];
    $out = [];
    foreach ($rows as $i) {
        $p = $wpdb->get_row($wpdb->prepare('SELECT COUNT(*) n, SUM(confirmed = 0) u, SUM(change_req <> \'\') c FROM ' . myf_t('participation') . ' WHERE incident_id = %d', $i->id));
        $used = array_values(array_unique(array_filter(array_map(function ($v) { return is_array($v) ? (string) ($v['v'] ?? '') : (string) $v; }, json_decode((string) $i->vehicles, true) ?: []))));
        $driven = array_map(function ($id) use ($vname) { return $vname[(int) $id] ?? ''; }, $wpdb->get_col($wpdb->prepare('SELECT DISTINCT vehicle_id FROM ' . myf_t('trips') . ' WHERE incident_id = %d AND storno_of IS NULL', $i->id)));
        $tripsMissing = array_values(array_diff($used, $driven));
        $loans = (int) $wpdb->get_var($wpdb->prepare('SELECT COUNT(*) FROM ' . myf_t('loans') . ' WHERE incident_id = %d', $i->id));
        $report = $i->report_closed ? 'closed' : (!empty($i->report) ? 'open' : 'none');
        $open = $report !== 'closed' || (int) $p->u > 0 || (int) $p->c > 0 || $tripsMissing || in_array((int) $i->id, $asuMiss, true) || $loans;
        $out[] = ['id' => (int) $i->id, 'nr' => $i->nr, 'title' => $i->title, 'start' => $i->start, 'report' => $report, 'parts' => (int) $p->n, 'unconfirmed' => (int) $p->u, 'change_req' => (int) $p->c,
            'vehicles' => $used, 'trips_missing' => $tripsMissing, 'asu_missing' => in_array((int) $i->id, $asuMiss, true), 'loans_open' => $loans, 'open' => (bool) $open, 'list_open' => !$i->part_closed];
    }
    return $out;
}
function myf_report_due_since() {
    global $wpdb;
    static $since = null;
    if ($since !== null) return $since;
    $first = $wpdb->get_var('SELECT MIN(start) FROM ' . myf_t('incidents') . " WHERE kind = 'einsatz' AND ((report IS NOT NULL AND report <> '') OR report_closed IS NOT NULL)");
    $min60 = date('Y-m-d', current_time('timestamp') - 60 * DAY_IN_SECONDS);
    return $since = $first ? max(substr($first, 0, 10), $min60) : date('Y-m-d', current_time('timestamp') - 3 * DAY_IN_SECONDS);
}
function myf_report_due($i) {
    return ($i->kind ?? '') === 'einsatz' && ($i->source ?? '') !== 'test' && empty($i->report_closed) && substr((string) $i->start, 0, 10) >= myf_report_due_since();
}

function myf_incident_out($i, $full = false) {
    $o = ['id' => (int) $i->id, 'kind' => $i->kind, 'nr' => $i->nr, 'title' => $i->title, 'category' => $i->category, 'start' => $i->start, 'end' => $i->end,
        'place' => $i->place, 'has_report' => !empty($i->report), 'report_due' => myf_report_due($i), 'report_by' => $i->report_by, 'report_at' => $i->report_at,
        'lead' => myf_incident_lead($i), 'report_closed' => $i->report_closed ?? null, 'report_closed_by' => (string) ($i->report_closed_by ?? ''), 'report_ext' => (string) ($i->report_ext ?? ''),
        'report_log' => json_decode((string) ($i->report_log ?? ''), true) ?: [],
        'source' => (string) $i->source, 'alarm_text' => $full ? myf_dec((string) ($i->alarm_text ?? '')) : '',
        // Alarmierungen (Erstalarm, Erhöhung, Nachalarmierung) und Einsatznummer der Leitstelle
        'ext_nr' => (string) ($i->ext_nr ?? ''), 'alarms' => json_decode((string) ($i->alarms ?? ''), true) ?: [],
        'unit' => (string) ($i->unit ?? ''), 'part_closed' => $i->part_closed ?? null, 'part_closed_by' => (string) ($i->part_closed_by ?? ''), 'self_ok' => function_exists('myf_hall_self_ok') ? myf_hall_self_ok($i) : true,
        'web' => myf_incident_web($i)];
    if ($full && !empty($i->pub_status)) $o['pub'] = ['title' => $i->pub_title, 'type' => $i->pub_type, 'place' => $i->pub_place, 'text' => (string) $i->pub_text, 'res' => json_decode((string) $i->pub_res, true) ?: [], 'by' => $i->pub_by, 'at' => $i->pub_at];
    // Bericht selbst nur auf Abruf (GET …/incident/report) – nicht in jeder Liste
    if ($full) { $o['vehicles'] = json_decode((string) $i->vehicles, true) ?: []; }
    return $o;
}
function myf_part_out($p, $withCert = true) {
    $o = ['id' => (int) $p->id, 'incident_id' => (int) $p->incident_id, 'member_id' => (int) $p->member_id, 'vehicle' => $p->vehicle, 't_start' => $p->t_start,
        't_end' => $p->t_end, 'as_minutes' => (int) $p->as_minutes, 'confirmed' => (bool) $p->confirmed, 'source' => $p->source ?? 'app', 'role' => $p->role ?? '', 'change_req' => $p->change_req ?? '',
        'cert_printed' => $p->cert_printed ?? null, 'cert_handed' => $p->cert_handed ?? null];
    if ($withCert) { $o['cert'] = $p->cert; $o['work_resume'] = $p->work_resume; }
    return $o;
}

// Daten für die Verwaltung / Einsatzführung (alle Einsätze der letzten 12 Monate mit Beteiligung)
function myf_incidents_manage_data() {
    global $wpdb;
    myf_incidents_sync();
    // Zeitraum: letzte 12 Monate (Standard) oder ein ganzes Jahr (?iyear=2024) – so bleiben alle Jahre erreichbar
    $iy = isset($_GET['iyear']) ? (int) $_GET['iyear'] : 0;
    if ($iy >= 1990 && $iy <= 2200) $inc = $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . myf_t('incidents') . ' WHERE start >= %s AND start < %s ORDER BY start DESC', $iy . '-01-01', ($iy + 1) . '-01-01'));
    else { $iy = 0; $inc = $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . myf_t('incidents') . ' WHERE start >= %s ORDER BY start DESC', date('Y-m-d', current_time('timestamp') - 365 * DAY_IN_SECONDS))); }
    $ids = array_map(function ($i) { return (int) $i->id; }, $inc);
    $parts = $ids ? $wpdb->get_results('SELECT * FROM ' . myf_t('participation') . ' WHERE incident_id IN (' . implode(',', $ids) . ')') : [];
    return ['incidents' => array_map(function ($i) { return myf_incident_out($i, true); }, $inc), 'participation' => array_map('myf_part_out', $parts),
        'incident_year' => $iy, 'incident_years' => array_map('intval', $wpdb->get_col('SELECT DISTINCT YEAR(start) y FROM ' . myf_t('incidents') . ' ORDER BY y DESC')),
        'next_nr' => myf_next_incident_nr('einsatz', ($me = myf_me()) && $me->unit ? $me->unit : ''), 'next_nrs' => myf_next_nrs(),
        'units' => array_map(function ($k, $l) { return ['key' => $k, 'label' => $l]; }, array_keys(myf_units()), array_values(myf_units())), 'report_form' => myf_report_form(), 'incident_vehicles' => myf_incident_vehicles(), 'part_extra' => MYF_PART_EXTRA, 'part_roles' => MYF_PART_ROLES, 'incident_cats' => MYF_INCIDENT_CATS, 'web' => myf_web_info()];
}

add_filter('myf_me_data', function ($data, $me) {
    global $wpdb;
    myf_incidents_sync();
    $since = date('Y-m-d', current_time('timestamp') - 30 * DAY_IN_SECONDS);
    $data['incidents'] = array_map('myf_incident_out', $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . myf_t('incidents') . ' WHERE start >= %s AND start <= %s ORDER BY start DESC', $since, current_time('mysql'))));
    $data['my_participation'] = array_map('myf_part_out', $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . myf_t('participation') . ' WHERE member_id = %d ORDER BY id DESC LIMIT 200', $me->id)));
    // Einsätze, die schon älter sind, aber bei denen ich dabei war (für Zähler und Verlauf)
    $mine = array_map(function ($p) { return (int) $p->incident_id; }, $wpdb->get_results($wpdb->prepare('SELECT incident_id FROM ' . myf_t('participation') . ' WHERE member_id = %d', $me->id)));
    $have = array_map(function ($i) { return $i['id']; }, $data['incidents']);
    $missing = array_diff($mine, $have);
    if ($missing) foreach ($wpdb->get_results('SELECT * FROM ' . myf_t('incidents') . ' WHERE id IN (' . implode(',', array_map('intval', $missing)) . ') ORDER BY start DESC') as $i) $data['incidents_old'][] = myf_incident_out($i);
    $data['incident_vehicles'] = myf_incident_vehicles();
    $data['part_extra'] = MYF_PART_EXTRA;
    $data['part_roles'] = MYF_PART_ROLES;
    $data['incident_cats'] = MYF_INCIDENT_CATS;
    $data['incident_manage'] = myf_member_can('incident_manage', $me);
    // EL/ZF/GF eines Einsatzes ohne Einsatzführungs-Recht: nur „ihre“ Einsätze zum Berichtschreiben
    if (!$data['incident_manage'] && ($rids = myf_report_incidents_for($me))) {
        $in = implode(',', array_map('intval', $rids));
        $data['report_access'] = ['report_form' => myf_report_form(), 'incident_vehicles' => myf_incident_vehicles(), 'part_roles' => MYF_PART_ROLES,
            'incidents' => array_map(function ($i) { return myf_incident_out($i, true); }, $wpdb->get_results('SELECT * FROM ' . myf_t('incidents') . " WHERE id IN ($in) ORDER BY start DESC")),
            'participation' => array_map(function ($p) { return myf_part_out($p, false); }, $wpdb->get_results('SELECT * FROM ' . myf_t('participation') . " WHERE incident_id IN ($in)"))];
    }
    if ($data['incident_manage']) {
        $data['manage'] = myf_incidents_manage_data();
        $data['manage']['members'] = array_map(function ($m) { return ['id' => (int) $m->id, 'name' => $m->name, 'unit' => $m->unit]; },
            $wpdb->get_results('SELECT id, name, unit FROM ' . myf_t('members') . ' WHERE active = 1 ORDER BY name'));
    }
    return $data;
}, 10, 2);

add_filter('myf_admin_state', function ($data) {
    return $data + myf_incidents_manage_data();
});

// ---- Speichern ----------------------------------------------------------------

function myf_dt_param($v) {
    $v = str_replace('T', ' ', trim((string) $v));
    if (preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/', $v)) $v .= ':00';
    return preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', $v) ? $v : null;
}

// Eigene Beteiligung eintragen / ändern / entfernen
function myf_api_me_participation(WP_REST_Request $req) {
    global $wpdb;
    $me = myf_me();
    $iid = (int) $req->get_param('incident_id');
    $inc = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('incidents') . ' WHERE id = %d', $iid));
    if (!$inc) return myf_err('Einsatz nicht gefunden.', 404);
    if (strtotime($inc->start) < current_time('timestamp') - 60 * DAY_IN_SECONDS) return myf_err('Für so alte Einsätze bitte bei der Einsatzführung melden.');
    if (!empty($inc->report_closed)) return myf_err('Der Einsatzbericht ist abgeschlossen – Änderungen an der Beteiligung bitte über die Einsatzführung.');
    $row = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('participation') . ' WHERE incident_id = %d AND member_id = %d', $iid, $me->id));
    if ($req->get_param('remove')) {
        // Schon bestätigt: nicht selbst löschen, sondern die Einsatzführung bitten (bleibt bis dahin drin)
        if ($row && ($row->confirmed || in_array($row->cert, ['issued', 'handed'], true))) {
            $why = mb_substr(sanitize_text_field((string) $req->get_param('reason')), 0, 160);
            $wpdb->update(myf_t('participation'), ['change_req' => 'raus' . ($why !== '' ? ': ' . $why : ''), 'updated' => current_time('mysql')], ['id' => $row->id]);
            myf_notify_area('incidents', 'part', $me->name . ' war doch nicht dabei', trim(($inc->nr ? $inc->nr . ' ' : '') . $inc->title) . ' am ' . date('d.m.Y', strtotime($inc->start)) . ($why !== '' ? ' – ' . $why : ''), 'einsatz:' . $inc->id, 'partreq:' . $row->id);
            return ['id' => (int) $row->id, 'requested' => true];
        }
        if ($row) $wpdb->delete(myf_t('participation'), ['id' => $row->id]);
        return ['id' => $row ? (int) $row->id : 0];
    }
    if ($req->get_param('cancel_req')) { if ($row) $wpdb->update(myf_t('participation'), ['change_req' => ''], ['id' => $row->id]); return ['id' => $row ? (int) $row->id : 0]; }
    $d = myf_part_fields($req);
    unset($d['as_minutes']); // Eigene Eintragung: nur „AGT“ anhaken, Minuten kommen aus der Atemschutzüberwachung (auch für Konten mit Bereich Atemschutz)
    if ($e = myf_part_times_err($d, $row)) return $e;
    // Neu eintragen oder Fahrzeug ändern: ggf. nur im Zeitfenster bzw. nur am Terminal in der Halle
    if ((!$row || isset($d['vehicle'])) && function_exists('myf_hall_self_ok') && !myf_hall_self_ok($inc) && !($row && $row->confirmed)) {
        return myf_err(!empty($inc->part_closed) ? 'Die Einsatzführung hat die Liste abgeschlossen – bitte bei der Einsatzführung melden.' : (myf_hall()['limit'] === 'terminal' ? 'Eintragen geht in der Fahrzeughalle (Dashboard Fahrzeughalle) – oder bei der Einsatzführung.' : 'Die Liste für diesen Einsatz ist geschlossen – bitte bei der Einsatzführung melden.'));
    }
    if ($row && $row->confirmed) { unset($d['vehicle'], $d['t_start'], $d['t_end'], $d['as_minutes']); } // bestätigt: nur Bescheinigung/Arbeitsbeginn änderbar
    // „ausgestellt“ setzt nur die Einsatzführung beim Drucken – eine ausgestellte Bescheinigung bleibt unverändert (revisionssicher)
    if (isset($d['cert']) && $d['cert'] === 'issued') $d['cert'] = 'requested';
    if ($row && in_array($row->cert, ['issued', 'handed'], true)) unset($d['cert'], $d['work_resume']);
    if (isset($d['cert']) && $d['cert'] === 'handed') $d['cert'] = 'requested';
    if (($d['cert'] ?? '') === 'requested' && (!$row || $row->cert === '')) {
        myf_notify_area('incidents', 'cert', 'Bescheinigung für den Arbeitgeber angefragt', $me->name . ' – ' . trim(($inc->nr ? $inc->nr . ' ' : '') . $inc->title) . ' am ' . date('d.m.Y', strtotime($inc->start)) .
            ($row && $row->confirmed ? '' : ' (Teilnahme noch bestätigen)'), 'admin:cert', 'cert:' . $inc->id . ':' . $me->id);
    }
    // Fehlende Angaben für die Bescheinigung gleich zurückmelden
    $missing = [];
    if (($d['cert'] ?? ($row->cert ?? '')) === 'requested') {
        if (empty($me->birth_date)) $missing[] = 'Geburtsdatum';
        if (trim((string) ($me->birth_place ?? '')) === '') $missing[] = 'Geburtsort';
        if (trim((string) ($me->street ?? '')) === '') $missing[] = 'Anschrift';
    }
    if ($row) { $wpdb->update(myf_t('participation'), $d + ['updated' => current_time('mysql')], ['id' => $row->id]); return ['id' => (int) $row->id, 'cert_missing' => $missing]; }
    $wpdb->insert(myf_t('participation'), $d + ['incident_id' => $iid, 'member_id' => $me->id, 'created' => current_time('mysql')]);
    return ['id' => (int) $wpdb->insert_id, 'cert_missing' => $missing];
}

// Einsatzbericht: Einsatzführung (Recht) – oder wer bei genau diesem Einsatz als EL, ZF oder GF eingetragen ist
function myf_report_incidents_for($me) {
    global $wpdb;
    if (!$me) return [];
    $ids = [];
    foreach ($wpdb->get_results($wpdb->prepare('SELECT p.incident_id, p.role FROM ' . myf_t('participation') . ' p JOIN ' . myf_t('incidents') . " i ON i.id = p.incident_id
        WHERE p.member_id = %d AND p.role <> '' AND i.start >= %s", $me->id, date('Y-m-d', current_time('timestamp') - 60 * DAY_IN_SECONDS))) as $r) {
        if (array_intersect(['EL', 'ZF', 'GF'], explode(',', $r->role))) $ids[] = (int) $r->incident_id;
    }
    return $ids;
}
function myf_can_report($incidentId) {
    if (!is_user_logged_in()) return false;
    if (myf_can_manage()) return true;
    $me = myf_me();
    if (!$me) return false;
    if (myf_member_can('incident_manage', $me)) return true;
    return in_array((int) $incidentId, myf_report_incidents_for($me), true);
}
function myf_report_perm(WP_REST_Request $req) {
    if (!is_user_logged_in()) return new WP_Error('myf_auth', 'Bitte neu anmelden.', ['status' => 401]);
    return myf_can_report((int) $req->get_param('id')) ? true : new WP_Error('myf_right', 'Den Bericht schreibt die Einsatzführung bzw. EL/ZF/GF dieses Einsatzes.', ['status' => 403]);
}

// Funktion im Einsatz (mehrere möglich): Einsatzleiter, Zugführer, Gruppenführer, Maschinist, Atemschutz
const MYF_PART_ROLES = ['EL' => 'Einsatzleiter', 'ZF' => 'Zugführer', 'GF' => 'Gruppenführer', 'MA' => 'Maschinist', 'AGT' => 'Atemschutz'];
// Dabei, aber nicht auf einem Fahrzeug (zu spät gekommen, Bereitschaft im Gerätehaus, Aufräumen)
const MYF_PART_EXTRA = ['Gerätehaus (Bereitschaft)', 'Nachbereitung / Aufräumen'];
function myf_part_role($r) {
    $out = array_values(array_intersect(array_keys(MYF_PART_ROLES), array_map('trim', explode(',', strtoupper($r)))));
    return implode(',', $out);
}
// Zeiten plausibel? (Ende nach Beginn, höchstens 16 Stunden) – sie stehen auf der Bescheinigung für den Arbeitgeber
function myf_part_times_err($d, $row) {
    $ts = array_key_exists('t_start', $d) ? $d['t_start'] : ($row->t_start ?? null);
    $te = array_key_exists('t_end', $d) ? $d['t_end'] : ($row->t_end ?? null);
    if (!$ts || !$te) return null;
    $diff = strtotime($te) - strtotime($ts);
    if ($diff <= 0) return myf_err('Bitte die Zeiten prüfen: „bis“ liegt vor „von“.');
    if ($diff > 16 * HOUR_IN_SECONDS) return myf_err('Bitte die Zeiten prüfen: das wären über 16 Stunden.');
    return null;
}
function myf_part_fields(WP_REST_Request $req) {
    $d = [];
    if ($req->has_param('vehicle')) $d['vehicle'] = mb_substr(sanitize_text_field((string) $req->get_param('vehicle')), 0, 40);
    if ($req->has_param('t_start')) $d['t_start'] = myf_dt_param($req->get_param('t_start'));
    if ($req->has_param('t_end')) $d['t_end'] = myf_dt_param($req->get_param('t_end'));
    // Atemschutz-Minuten pflegt nur die Atemschutzüberwachung (Bereich Atemschutz) – Mitglied, Einsatzführung und Halle haken nur „AGT“ an
    if ($req->has_param('as_minutes') && function_exists('myf_has_area') && myf_has_area('agt')) $d['as_minutes'] = max(0, min(600, (int) $req->get_param('as_minutes')));
    if ($req->has_param('role')) $d['role'] = myf_part_role((string) $req->get_param('role'));
    if ($req->has_param('cert')) $d['cert'] = $req->get_param('cert') === 'issued' ? 'issued' : ($req->get_param('cert') ? 'requested' : '');
    if ($req->has_param('work_resume')) {
        $w = (string) $req->get_param('work_resume');
        $d['work_resume'] = $w === 'none' ? 'none' : (preg_match('/^\d{1,2}:\d{2}$/', $w) ? $w : '');
    }
    return $d;
}

// Fortlaufende Nummern je Art und Einheit, im Format der Schnellerfassung: „07/2026“, zweite Einheit „A07/2026“,
// Übungen eigene Reihe mit „Ü“ („Ü03/2026“, „ÜA03/2026“). Gezählt aus SPIND und (bei Einsätzen) der Einsatzverwaltung.
function myf_nr_prefix($kind, $unit) {
    $p = '';
    if (function_exists('myf_quick_units')) foreach (myf_quick_units() as $u) if ($u['key'] === $unit) $p = (string) $u['prefix'];
    return ($kind === 'uebung' ? 'Ü' : '') . $p;
}
function myf_next_incident_nr($kind = 'einsatz', $unit = '', $year = null) {
    global $wpdb;
    $year = $year ?: (int) current_time('Y'); $max = 0;
    if ($unit === '') $unit = function_exists('myf_unit_default') ? myf_unit_default() : '';
    $pre = myf_nr_prefix($kind, $unit);
    $re = '#(?<![A-Za-zÄÖÜ])' . preg_quote($pre, '#') . '-?0*(\d{1,4})/' . $year . '(?!\d)#u';
    foreach ($wpdb->get_col($wpdb->prepare('SELECT nr FROM ' . myf_t('incidents') . ' WHERE kind = %s AND nr LIKE %s', $kind === 'uebung' ? 'uebung' : 'einsatz', '%/' . $year)) as $n)
        if (preg_match($re, trim($n), $m) && ($pre !== '' || !preg_match('#^[A-Za-zÄÖÜ]#u', trim($n)))) $max = max($max, (int) $m[1]);
    if ($kind !== 'uebung' && post_type_exists('einsatz') && !myf_demo_ctx())
        foreach ($wpdb->get_col($wpdb->prepare("SELECT post_title FROM {$wpdb->posts} WHERE post_type = 'einsatz' AND post_status IN ('publish','draft','future','private') AND post_title LIKE %s", '%/' . $year . '%')) as $t)
            if (preg_match($re, $t, $m)) $max = max($max, (int) $m[1]);
    $n = $max + 1;
    return $pre . ($n < 10 ? '0' : '') . $n . '/' . $year;
}
// Alle nächsten Nummern fürs Formular: [einsatz|uebung][einheit] => Nummer
function myf_next_nrs() {
    $out = ['einsatz' => [], 'uebung' => []];
    foreach (array_keys(myf_units()) as $u) foreach (['einsatz', 'uebung'] as $k) $out[$k][$u] = myf_next_incident_nr($k, $u);
    return $out;
}

// Einsatz / Übung anlegen oder ändern (Einsatzführung, Verwaltung)
function myf_api_incident_save(WP_REST_Request $req) {
    global $wpdb;
    $id = (int) $req->get_param('id');
    $d = [];
    foreach (['title' => 200, 'place' => 200, 'nr' => 30] as $k => $len) if ($req->has_param($k)) $d[$k] = mb_substr(sanitize_text_field((string) $req->get_param($k)), 0, $len);
    if ($req->has_param('unit')) $d['unit'] = myf_unit_ok($req->get_param('unit'));
    if ($req->has_param('kind')) $d['kind'] = $req->get_param('kind') === 'uebung' ? 'uebung' : 'einsatz';
    if ($req->has_param('category')) $d['category'] = isset(MYF_INCIDENT_CATS[$req->get_param('category')]) ? $req->get_param('category') : 'sonst';
    if ($req->has_param('start')) { $d['start'] = myf_dt_param($req->get_param('start')); if (!$d['start']) return myf_err('Bitte Datum und Uhrzeit für den Beginn angeben.'); }
    if ($req->has_param('end')) $d['end'] = myf_dt_param($req->get_param('end'));
    // Ende vor Beginn gibt es nicht; ausgehändigte Bescheinigungen hängen an Zeiten und Fahrzeugzeiten des Einsatzes
    $old = $id ? $wpdb->get_row($wpdb->prepare('SELECT start, end, vehicles FROM ' . myf_t('incidents') . ' WHERE id = %d', $id)) : null;
    $nStart = $d['start'] ?? ($old->start ?? null); $nEnd = array_key_exists('end', $d) ? $d['end'] : ($old->end ?? null);
    if ($nStart && $nEnd && strtotime($nEnd) <= strtotime($nStart)) return myf_err('Bitte die Zeiten prüfen: das Ende liegt vor dem Beginn.');
    // Beteiligung abschließen: danach trägt sich niemand mehr selbst ein (Korrekturen über die Einsatzführung)
    if ($req->has_param('part_closed')) { $d['part_closed'] = $req->get_param('part_closed') ? current_time('mysql') : null; $d['part_closed_by'] = $req->get_param('part_closed') ? myf_actor() : ''; }
    if (is_array($req->get_param('vehicles'))) {
        $d['vehicles'] = wp_json_encode(array_values(array_map(function ($v) {
            return ['v' => sanitize_text_field((string) ($v['v'] ?? '')), 'out' => preg_match('/^\d{1,2}:\d{2}$/', (string) ($v['out'] ?? '')) ? $v['out'] : '',
                'at' => preg_match('/^\d{1,2}:\d{2}$/', (string) ($v['at'] ?? '')) ? $v['at'] : '', 'in' => preg_match('/^\d{1,2}:\d{2}$/', (string) ($v['in'] ?? '')) ? $v['in'] : ''];
        }, array_filter((array) $req->get_param('vehicles'), function ($v) { return !empty($v['v']); }))));
    }
    if ($old && (strtotime((string) $nStart) !== strtotime((string) $old->start) || (string) ($nEnd ? strtotime($nEnd) : '') !== (string) ($old->end ? strtotime($old->end) : '') || (isset($d['vehicles']) && $d['vehicles'] !== (string) $old->vehicles))
        && $wpdb->get_var($wpdb->prepare('SELECT COUNT(*) FROM ' . myf_t('participation') . " WHERE incident_id = %d AND cert = 'handed'", $id)))
        return myf_err('Für diesen Einsatz ist schon eine Bescheinigung ausgehändigt – Beginn, Ende und Fahrzeugzeiten können nicht mehr geändert werden.');
    // Eine Einsatznummer gibt es nur einmal
    if (!empty($d['nr']) && ($dupe = $wpdb->get_row($wpdb->prepare('SELECT id, title FROM ' . myf_t('incidents') . ' WHERE nr = %s AND id <> %d', $d['nr'], $id))))
        return myf_err('Die Nummer ' . $d['nr'] . ' hat schon „' . $dupe->title . '“. Nächste freie: ' . myf_next_incident_nr() . '.');
    if ($id) {
    // Revisionssicher: abgeschlossener Bericht = Einsatzdaten fest (Titel, Zeiten, Ort, Fahrzeugzeiten); Ändern nur nach „Wieder öffnen“ mit Begründung
    if ($id && array_diff_key($d, ['part_closed' => 1, 'part_closed_by' => 1]) && $wpdb->get_var($wpdb->prepare('SELECT report_closed FROM ' . myf_t('incidents') . ' WHERE id = %d', $id)))
        return myf_err('Der Einsatzbericht ist abgeschlossen – Einsatzdaten ändern geht nur nach „Bericht wieder öffnen“ (mit Begründung im Protokoll).');
        $wpdb->update(myf_t('incidents'), $d, ['id' => $id]);
    } else {
        if (empty($d['start'])) return myf_err('Bitte Datum und Uhrzeit für den Beginn angeben.');
        if (($d['title'] ?? '') === '') return myf_err('Bitte ein Stichwort / einen Titel angeben.');
        // Ohne Nummer: nächste freie der Reihe (Einsatz/Übung, Einheit) vergeben
        if (empty($d['unit'])) { $me = myf_me(); $d['unit'] = $me && $me->unit ? $me->unit : myf_unit_default(); }
        if (($d['nr'] ?? '') === '') $d['nr'] = myf_next_incident_nr($d['kind'] ?? 'einsatz', $d['unit']);
        $wpdb->insert(myf_t('incidents'), $d + ['source' => 'manuell', 'created' => current_time('mysql'), 'created_by' => myf_actor()]);
        $id = (int) $wpdb->insert_id;
    }
    return ['id' => $id];
}

// Einsatzbericht speichern (nur Felder des Formulars)
function myf_api_incident_report(WP_REST_Request $req) {
    global $wpdb;
    $id = (int) $req->get_param('id');
    $inc = $wpdb->get_row($wpdb->prepare('SELECT id, report_closed FROM ' . myf_t('incidents') . ' WHERE id = %d', $id));
    if (!$inc) return myf_err('Einsatz nicht gefunden.', 404);
    // Abgeschlossen = gesperrt (Rechtssicherheit). Ändern nur nach „Wieder öffnen“ mit Begründung.
    if ($inc->report_closed) return myf_err('Der Bericht ist abgeschlossen. Zum Ändern erst „Wieder öffnen“ – mit Begründung, die im Protokoll steht.');
    $in = (array) $req->get_param('report');
    $out = [];
    foreach (myf_report_form() as $sec) foreach ($sec['fields'] as $f) {
        if (!array_key_exists($f['id'], $in)) continue;
        $v = $in[$f['id']];
        if ($f['type'] === 'checks') $out[$f['id']] = array_values(array_intersect((array) $v, $f['options']));
        elseif ($f['type'] === 'radio') $out[$f['id']] = in_array($v, $f['options'], true) ? $v : '';
        elseif ($f['type'] === 'number') $out[$f['id']] = $v === '' || $v === null ? '' : (string) round((float) str_replace(',', '.', (string) $v), 2);
        elseif ($f['type'] === 'textarea') $out[$f['id']] = sanitize_textarea_field((string) $v);
        else $out[$f['id']] = sanitize_text_field((string) $v);
    }
    // Bestehende Werte behalten, die das Formular nicht mehr kennt; gespeichert wird verschlüsselt – mit der Formular-Fassung
    $out += array_diff_key(myf_report_get($id), $out);
    $out['_form'] = myf_report_form_keep(myf_report_form());
    $upd = ['report' => myf_enc(wp_json_encode($out)), 'report_by' => myf_actor(), 'report_at' => current_time('mysql'), 'report_lead' => mb_substr(sanitize_text_field((string) ($out['einsatzleiter'] ?? '')), 0, 120)];
    if ($req->get_param('close')) { $upd['report_closed'] = current_time('mysql'); $upd['report_closed_by'] = myf_actor(); myf_report_log_add($id, 'abgeschlossen', ''); }
    $wpdb->update(myf_t('incidents'), $upd, ['id' => $id]);
    return ['id' => $id];
}

// Beteiligung beliebiger Mitglieder pflegen und bestätigen (Einsatzführung, Verwaltung)
function myf_api_incident_part(WP_REST_Request $req) {
    global $wpdb;
    $iid = (int) $req->get_param('incident_id');
    $mid = (int) $req->get_param('member_id');
    $inc = $wpdb->get_row($wpdb->prepare('SELECT id, report_closed FROM ' . myf_t('incidents') . ' WHERE id = %d', $iid));
    if (!$inc) return myf_err('Einsatz nicht gefunden.', 404);
    // Abgeschlossener Bericht: die Beteiligung gehört dazu und ist eingefroren – Änderungen nur nach „Wieder öffnen“ (mit Begründung im Protokoll)
    if ($inc->report_closed) return myf_err('Der Einsatzbericht ist abgeschlossen – die Beteiligung ist damit festgeschrieben. Zum Ändern den Bericht erst „Wieder öffnen“ (mit Begründung).');
    $row = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('participation') . ' WHERE incident_id = %d AND member_id = %d', $iid, $mid));
    // Bescheinigung schon gedruckt/ausgehändigt: Beteiligung bleibt bestehen und bestätigt (Nachweis gegenüber Arbeitgeber und Gemeinde)
    $locked = $row && in_array($row->cert, ['issued', 'handed'], true);
    if ($req->get_param('remove')) {
        if ($locked) return myf_err('Für diese Beteiligung ist die Bescheinigung schon ' . ($row->cert === 'handed' ? 'ausgehändigt' : 'gedruckt') . ' – sie kann nicht mehr entfernt werden.');
        if ($row) $wpdb->delete(myf_t('participation'), ['id' => $row->id]); return ['id' => $row ? (int) $row->id : 0];
    }
    if ($req->get_param('keep')) { if ($row) $wpdb->update(myf_t('participation'), ['change_req' => ''], ['id' => $row->id]); return ['id' => $row ? (int) $row->id : 0]; }
    $d = myf_part_fields($req);
    if ($e = myf_part_times_err($d, $row)) return $e;
    // Ausgehändigte Bescheinigung: Zeiten und Fahrzeug stehen beim Arbeitgeber auf dem Papier – nicht mehr änderbar (gedruckt, noch nicht ausgehändigt: Korrektur und Neudruck möglich)
    if ($row && $row->cert === 'handed') foreach (['t_start', 't_end', 'vehicle'] as $k) {
        if (array_key_exists($k, $d) && (string) $d[$k] !== (string) $row->$k && !($k !== 'vehicle' && $d[$k] && $row->$k && strtotime($d[$k]) === strtotime($row->$k))) return myf_err('Die Bescheinigung ist schon ausgehändigt – Zeiten und Fahrzeug können nicht mehr geändert werden.');
    }
    // Bescheinigung: Führung kann für jemanden anfragen; „ausgestellt“/„ausgehändigt“ setzt nur der Druck bzw. die Ausgabe (revisionssicher)
    if (isset($d['cert']) && $d['cert'] === 'issued') $d['cert'] = 'requested';
    if ($row && in_array($row->cert, ['issued', 'handed'], true)) unset($d['cert'], $d['work_resume']);
    if (!$row) $d['source'] = 'fuehrung';
    if ($locked && $req->has_param('confirmed') && !$req->get_param('confirmed')) return myf_err('Für diese Beteiligung ist die Bescheinigung schon ' . ($row->cert === 'handed' ? 'ausgehändigt' : 'gedruckt') . ' – die Bestätigung kann nicht zurückgenommen werden.');
    if ($req->has_param('confirmed')) { $d['confirmed'] = $req->get_param('confirmed') ? 1 : 0; $d['confirmed_by'] = $d['confirmed'] ? myf_actor() : ''; }
    if ($row) { $wpdb->update(myf_t('participation'), $d + ['updated' => current_time('mysql')], ['id' => $row->id]); $pid = (int) $row->id; }
    else {
        if (!$wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('members') . ' WHERE id = %d', $mid))) return myf_err('Mitglied nicht gefunden.', 404);
        $wpdb->insert(myf_t('participation'), $d + ['incident_id' => $iid, 'member_id' => $mid, 'created' => current_time('mysql')]);
        $pid = (int) $wpdb->insert_id;
    }
    myf_part_agt_sync($pid);
    return ['id' => $pid];
}

// Bestätigte Atemschutz-Minuten im Atemschutz-Verlauf des Mitglieds festhalten
function myf_part_agt_sync($pid) {
    global $wpdb;
    $p = $wpdb->get_row($wpdb->prepare('SELECT p.*, i.start, i.nr, i.title FROM ' . myf_t('participation') . ' p JOIN ' . myf_t('incidents') . ' i ON i.id = p.incident_id WHERE p.id = %d', $pid));
    if (!$p) return;
    $tag = 'Beteiligung #' . $pid;
    $existing = $wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('agt_log') . " WHERE member_id = %d AND kind = 'einsatz' AND note LIKE %s", $p->member_id, '%' . $wpdb->esc_like($tag)));
    // Ist der Einsatz über die Atemschutzüberwachung abgeschlossen erfasst, gilt deren Eintrag (kein doppelter Verlauf)
    $asu = $wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('agt_log') . ' WHERE member_id = %d AND note LIKE %s LIMIT 1', $p->member_id, '%· ASÜ E' . (int) $p->incident_id . ' #%'));
    if ($asu) { if ($existing) $wpdb->delete(myf_t('agt_log'), ['id' => $existing]); return; }
    if ($p->confirmed && $p->as_minutes > 0) {
        $note = trim(($p->nr ? $p->nr . ' ' : '') . $p->title) . ' – ' . $p->as_minutes . ' min unter Atemschutz · ' . $tag;
        if ($existing) $wpdb->update(myf_t('agt_log'), ['date' => substr($p->start, 0, 10), 'note' => $note], ['id' => $existing]);
        else $wpdb->insert(myf_t('agt_log'), ['member_id' => $p->member_id, 'kind' => 'einsatz', 'date' => substr($p->start, 0, 10), 'note' => $note]);
    } elseif ($existing) {
        $wpdb->delete(myf_t('agt_log'), ['id' => $existing]);
    }
}

// Daten für die Bescheinigung (Arbeitgeber) – nur Einsatzführung/Verwaltung
function myf_api_incident_cert(WP_REST_Request $req) {
    global $wpdb;
    $ids = array_filter(array_map('intval', (array) $req->get_param('ids')));
    if (!$ids) return myf_err('Keine Beteiligung gewählt.');
    $all = $wpdb->get_results('SELECT p.*, m.name, m.dienstgrad, m.birth_date, m.birth_place, m.street, i.kind, i.category, i.start, i.end, i.place, i.title, i.nr, i.vehicles
        FROM ' . myf_t('participation') . ' p JOIN ' . myf_t('members') . ' m ON m.id = p.member_id JOIN ' . myf_t('incidents') . " i ON i.id = p.incident_id
        WHERE p.cert <> '' AND p.id IN (" . implode(',', $ids) . ')');
    // Bescheinigt wird nur, was die Einsatzführung als Teilnahme bestätigt hat
    $rows = array_values(array_filter($all, function ($r) { return (int) $r->confirmed === 1; }));
    $skipped = array_values(array_map(function ($r) { return $r->name; }, array_filter($all, function ($r) { return (int) $r->confirmed !== 1; })));
    // Ohne Geburtsdatum, Geburtsort und Anschrift ist die Bescheinigung unvollständig – nicht drucken (ausgestellte sind gesperrt)
    // … und ohne Ende ebenfalls nicht: zählt die eigene „bis“-Zeit (wer früher gegangen ist), sonst Rückkehr des Fahrzeugs, sonst Einsatzende
    $miss = function ($r) { $tt = myf_cert_times($r); return array_keys(array_filter(['Geburtsdatum' => !$r->birth_date, 'Geburtsort' => trim((string) $r->birth_place) === '', 'Anschrift' => trim((string) $r->street) === '', 'Ende („bis“)' => empty($tt[1])])); };
    $incomplete = [];
    $rows = array_values(array_filter($rows, function ($r) use ($miss, &$incomplete) { if (($m = $miss($r)) && $r->cert === 'requested') { $incomplete[] = $r->name . ' (' . implode(', ', $m) . ')'; return false; } return true; }));
    if (!$rows) return myf_err($incomplete ? 'Es fehlen noch Angaben für die Bescheinigung: ' . implode('; ', $incomplete) . '. Persönliche Angaben trägt das Mitglied unter „Profil“ ein. Fehlt das Ende: wer früher gegangen ist, bekommt in der Beteiligung eine eigene „bis“-Zeit – sonst das Einsatzende eintragen.' : ($skipped ? 'Erst die Teilnahme bestätigen: ' . implode(', ', $skipped) . '.' : 'Keine angefragte Bescheinigung gewählt.'));
    if ($req->get_param('mark')) {
        $me = myf_me(); $by = $me ? $me->name : wp_get_current_user()->display_name;
        foreach ($rows as $r) {
            if ($r->cert !== 'requested') continue;
            $wpdb->update(myf_t('participation'), ['cert' => 'issued', 'cert_printed' => current_time('mysql'), 'cert_printed_by' => mb_substr($by, 0, 120), 'updated' => current_time('mysql')], ['id' => $r->id]);
            myf_notify([(int) $r->member_id], 'cert', 'Deine Bescheinigung ist gedruckt – zur Unterschrift', trim(($r->nr ? $r->nr . ' ' : '') . $r->title) . ' am ' . date('d.m.Y', strtotime($r->start)) .
                ' – ausgedruckt von ' . $by . ', liegt zur Unterschrift. Danach bekommst du sie ausgehändigt und gibst sie deinem Arbeitgeber.', 'einsatz:' . $r->incident_id);
        }
    }
    return ['skipped' => $skipped, 'incomplete' => $incomplete, 'office' => myf_cert_office(), 'items' => array_map(function ($r) {
        $tt = myf_cert_times($r);
        return ['id' => (int) $r->id, 'name' => $r->name, 'rank' => (string) $r->dienstgrad, 'birth_date' => $r->birth_date, 'birth_place' => (string) $r->birth_place,
            'street' => (string) $r->street, 'kind' => $r->kind, 'category' => $r->category, 'start' => $r->start, 'end' => $r->end, 'place' => $r->place,
            'title' => $r->title, 'nr' => $r->nr, 't_start' => $tt[0], 't_end' => $tt[1], 'work_resume' => $r->work_resume];
    }, $rows)];
}

// ---- Verdienstausfall: Bescheinigung für den Arbeitgeber ---------------------------------------------------
// Ablauf: Mitglied fragt an (mit Arbeitsbeginn) → Einsatzführung bestätigt die Teilnahme und druckt → Unterschrift
// (Leiter der Feuerwehr, Löschzugführer, Einsatzleiter) → Aushändigen an das Mitglied (Ausgabeliste mit Empfangsquittung) → Mitglied gibt sie
// dem Arbeitgeber → Arbeitgeber beantragt die Erstattung bei der Gemeinde (Selbstständige selbst). Status „handed“ = ausgehändigt.
// Jeder Schritt mit Datum und Name; Mitglieder werden bei „gedruckt“ und „ausgehändigt“ benachrichtigt.
function myf_cert_office() {
    $o = (array) (myf_settings()['cert_office'] ?? []);
    $b = function_exists('myf_brand') ? myf_brand() : ['place' => ''];
    return ['name' => (string) ($o['name'] ?? '') ?: 'Gemeinde ' . ($b['place'] ?? ''), 'dept' => (string) ($o['dept'] ?? ''), 'az' => (string) ($o['az'] ?? ''), 'note' => (string) ($o['note'] ?? '')];
}
// Zeiten der Person: eigene abweichende Zeit, sonst Ausrücken/Einrücken ihres Fahrzeugs, sonst Einsatzbeginn/-ende
function myf_cert_times($r) {
    $from = $r->t_start; $to = $r->t_end;
    if ((!$from || !$to) && !empty($r->vehicles) && $r->vehicle !== '') {
        foreach ((array) json_decode((string) $r->vehicles, true) as $v) {
            if (($v['v'] ?? '') !== $r->vehicle) continue;
            $day = substr((string) $r->start, 0, 10);
            if (!$from && !empty($v['out'])) $from = $day . ' ' . $v['out'] . ':00';
            if (!$to && !empty($v['in'])) { $to = $day . ' ' . $v['in'] . ':00'; if ($from && $to < $from) $to = date('Y-m-d H:i:s', strtotime($to . ' +1 day')); }
        }
    }
    return [$from ?: $r->start, $to ?: $r->end];
}
function myf_cert_missing($m) {
    $miss = [];
    if (empty($m->birth_date)) $miss[] = 'Geburtsdatum';
    if (trim((string) ($m->birth_place ?? '')) === '') $miss[] = 'Geburtsort';
    if (trim((string) ($m->street ?? '')) === '') $miss[] = 'Anschrift';
    return $miss;
}
function myf_api_cert_list(WP_REST_Request $req) {
    global $wpdb;
    $year = (int) ($req->get_param('year') ?: current_time('Y'));
    $rows = $wpdb->get_results($wpdb->prepare('SELECT p.id, p.member_id, p.incident_id, p.vehicle, p.t_start, p.t_end, p.cert, p.cert_printed, p.cert_printed_by, p.cert_handed, p.cert_handed_by, p.work_resume, p.confirmed,
        m.name, m.dienstgrad, m.birth_date, m.birth_place, m.street, i.nr, i.title, i.kind, i.start, i.end, i.vehicles
        FROM ' . myf_t('participation') . ' p JOIN ' . myf_t('members') . ' m ON m.id = p.member_id JOIN ' . myf_t('incidents') . " i ON i.id = p.incident_id
        WHERE p.cert <> '' AND (i.start >= %s AND i.start < %s OR p.cert IN ('requested','issued')) ORDER BY i.start DESC, m.name", $year . '-01-01', ($year + 1) . '-01-01'));
    $years = array_map('intval', $wpdb->get_col('SELECT DISTINCT YEAR(i.start) FROM ' . myf_t('participation') . ' p JOIN ' . myf_t('incidents') . " i ON i.id = p.incident_id WHERE p.cert <> '' ORDER BY 1 DESC"));
    return ['year' => $year, 'years' => $years, 'office' => myf_cert_office(), 'rows' => array_map(function ($r) {
        $tt = myf_cert_times($r);
        // Keine Geburtsdaten in der Übersicht – nur, ob etwas fehlt
        return ['id' => (int) $r->id, 'member_id' => (int) $r->member_id, 'incident_id' => (int) $r->incident_id, 'name' => $r->name, 'rank' => (string) $r->dienstgrad,
            'nr' => $r->nr, 'title' => $r->title, 'kind' => $r->kind, 'start' => $r->start, 'from' => $tt[0], 'to' => $tt[1], 'work_resume' => $r->work_resume,
            'confirmed' => (bool) $r->confirmed, 'cert' => $r->cert, 'printed' => $r->cert_printed, 'printed_by' => $r->cert_printed_by, 'handed' => $r->cert_handed, 'handed_by' => $r->cert_handed_by,
            'missing' => array_merge(myf_cert_missing($r), empty($tt[1]) ? ['Ende („bis“)'] : [])];
    }, $rows)];
}
// Unterschriebene Bescheinigungen an die Mitglieder aushändigen: Status setzen, Ausgabeliste zurückgeben, Mitglieder benachrichtigen
function myf_api_cert_handover(WP_REST_Request $req) {
    global $wpdb;
    $ids = array_filter(array_map('intval', (array) $req->get_param('ids')));
    if (!$ids) return myf_err('Keine Bescheinigung gewählt.');
    $rows = $wpdb->get_results('SELECT p.*, m.name, m.dienstgrad, i.nr, i.title, i.kind, i.start, i.end, i.vehicles FROM ' . myf_t('participation') . ' p JOIN ' . myf_t('members') . ' m ON m.id = p.member_id JOIN ' . myf_t('incidents') . " i ON i.id = p.incident_id
        WHERE p.cert = 'issued' AND p.id IN (" . implode(',', $ids) . ') ORDER BY i.start, m.name');
    if (!$rows) return myf_err('Nur gedruckte Bescheinigungen lassen sich übergeben.');
    $me = myf_me(); $by = $me ? $me->name : wp_get_current_user()->display_name; $now = current_time('mysql');
    foreach ($rows as $r) {
        $wpdb->update(myf_t('participation'), ['cert' => 'handed', 'cert_handed' => $now, 'cert_handed_by' => mb_substr($by, 0, 120), 'updated' => $now], ['id' => $r->id]);
        myf_notify([(int) $r->member_id], 'cert', 'Deine Bescheinigung ist fertig – bitte an den Arbeitgeber', trim(($r->nr ? $r->nr . ' ' : '') . $r->title) . ' am ' . date('d.m.Y', strtotime($r->start)) .
            ' – unterschrieben und dir am ' . date('d.m.Y', strtotime($now)) . ' ausgehändigt. Gib sie deinem Arbeitgeber: Er beantragt die Erstattung des Verdienstausfalls bei ' . myf_cert_office()['name'] . '. Selbstständig? Dann stellst du den Antrag selbst.', 'einsatz:' . $r->incident_id);
    }
    return ['ok' => true, 'n' => count($rows), 'by' => $by, 'at' => $now, 'office' => myf_cert_office(), 'items' => array_map(function ($r) {
        $tt = myf_cert_times($r);
        return ['name' => $r->name, 'rank' => (string) $r->dienstgrad, 'nr' => $r->nr, 'title' => $r->title, 'kind' => $r->kind, 'start' => $r->start, 'from' => $tt[0], 'to' => $tt[1], 'work_resume' => $r->work_resume];
    }, $rows)];
}

add_action('rest_api_init', function () {
    $ns = 'myf/v1';
    register_rest_route($ns, '/me/participation', ['methods' => 'POST', 'permission_callback' => myf_perm('participation'), 'callback' => function ($req) {
        return myf_me() ? myf_api_me_participation($req) : myf_err('Dein Konto ist keinem Mitglied zugeordnet.', 403);
    }]);
    foreach (['me', 'admin'] as $pre) {
        $perm = $pre === 'admin' ? 'myf_can_manage' : myf_perm('incident_manage');
        register_rest_route($ns, "/$pre/incident", ['methods' => 'POST', 'permission_callback' => $perm, 'callback' => 'myf_api_incident_save']);
        register_rest_route($ns, "/$pre/incident/report", ['methods' => 'POST', 'permission_callback' => $pre === 'admin' ? $perm : 'myf_report_perm', 'callback' => 'myf_api_incident_report']);
        // Abgeschlossenen Bericht wieder öffnen: nur mit Begründung; steht am Bericht und im Änderungsprotokoll
        register_rest_route($ns, "/$pre/incident/report/reopen", ['methods' => 'POST', 'permission_callback' => $pre === 'admin' ? $perm : 'myf_report_perm', 'callback' => function (WP_REST_Request $req) {
            global $wpdb;
            $id = (int) $req->get_param('id'); $why = trim(sanitize_text_field((string) $req->get_param('reason')));
            if (!$wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('incidents') . ' WHERE id = %d AND report_closed IS NOT NULL', $id))) return myf_err('Der Bericht ist nicht abgeschlossen.');
            if (mb_strlen($why) < 5) return myf_err('Bitte begründen, warum der abgeschlossene Bericht geändert wird (steht im Protokoll).');
            myf_report_log_add($id, 'wieder geöffnet', $why);
            $wpdb->update(myf_t('incidents'), ['report_closed' => null, 'report_closed_by' => '', 'report_ext' => ''], ['id' => $id]);
            return ['id' => $id];
        }]);
        // Kein Bericht in SPIND nötig (auf Papier ausgefüllt, Altbestand …): mit Vermerk abschließen – zählt nicht mehr als offen
        register_rest_route($ns, "/$pre/incident/report/external", ['methods' => 'POST', 'permission_callback' => $pre === 'admin' ? $perm : 'myf_report_perm', 'callback' => function (WP_REST_Request $req) {
            global $wpdb;
            $id = (int) $req->get_param('id'); $note = trim(sanitize_text_field((string) $req->get_param('note')));
            $row = $wpdb->get_row($wpdb->prepare('SELECT id, report_closed FROM ' . myf_t('incidents') . ' WHERE id = %d', $id));
            if (!$row) return myf_err('Einsatz nicht gefunden.', 404);
            if ($row->report_closed) return myf_err('Der Bericht ist schon abgeschlossen.');
            if (mb_strlen($note) < 3) return myf_err('Bitte kurz vermerken, wo der Bericht ist (z. B. „auf Papier, Ordner 2025“).');
            myf_report_log_add($id, 'anderweitig erfasst', $note);
            $wpdb->update(myf_t('incidents'), ['report_closed' => current_time('mysql'), 'report_closed_by' => myf_actor(), 'report_ext' => mb_substr($note, 0, 200)], ['id' => $id]);
            return ['id' => $id];
        }]);
        register_rest_route($ns, "/$pre/incident/part", ['methods' => 'POST', 'permission_callback' => $perm, 'callback' => 'myf_api_incident_part']);
        register_rest_route($ns, "/$pre/incident/cert", ['methods' => 'POST', 'permission_callback' => $perm, 'callback' => 'myf_api_incident_cert']);
        register_rest_route($ns, "/$pre/cert/list", ['methods' => 'GET', 'permission_callback' => $perm, 'callback' => 'myf_api_cert_list']);
        register_rest_route($ns, "/$pre/cert/handover", ['methods' => 'POST', 'permission_callback' => $perm, 'callback' => 'myf_api_cert_handover']);
    }
    // Versehentlich angelegten Einsatz löschen (Testalarm, Doppelung): nur mit Begründung, nur ohne Bericht/abgeschlossene Liste –
    // Verwaltung und Einsatzführung; wer, wann, warum und der gelöschte Stand stehen im Änderungsprotokoll
    foreach (['me' => myf_perm('incident_manage'), 'admin' => 'myf_can_manage'] as $pre => $perm) register_rest_route($ns, "/$pre/incident/delete", ['methods' => 'POST', 'permission_callback' => $perm, 'callback' => 'myf_api_incident_delete']);
});

function myf_api_incident_delete(WP_REST_Request $req) {
    global $wpdb;
    $id = (int) $req->get_param('id'); $why = trim(sanitize_text_field((string) $req->get_param('reason')));
    $i = $wpdb->get_row($wpdb->prepare('SELECT id, nr, title, start, source, report, report_closed, part_closed FROM ' . myf_t('incidents') . ' WHERE id = %d', $id));
    if (!$i) return myf_err('Einsatz nicht gefunden – vielleicht schon gelöscht.', 404);
    if (mb_strlen($why) < 5) return myf_err('Bitte kurz begründen, warum der Einsatz gelöscht wird (z. B. „Testalarm“, „doppelt angelegt“) – steht im Protokoll.');
    // Revisionssicher: abgeschlossener Bericht, abgeschlossene Liste oder Atemschutz-Protokoll → nicht löschbar.
    // Ein begonnener Entwurf darf mit weg (Testalarm, bei dem schon getippt wurde) – der Stand steht im Änderungsprotokoll.
    if ($i->report_closed || $i->part_closed) return myf_err('Dieser Einsatz hat einen abgeschlossenen Bericht oder eine abgeschlossene Liste und bleibt revisionssicher erhalten.');
    if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', myf_t('asu'))) && (int) $wpdb->get_var($wpdb->prepare('SELECT COUNT(*) FROM ' . myf_t('asu') . ' WHERE incident_id = %d', $id)))
        return myf_err('Zu diesem Einsatz gibt es ein Atemschutz-Protokoll – er bleibt erhalten.');
    if ((int) $wpdb->get_var($wpdb->prepare('SELECT COUNT(*) FROM ' . myf_t('participation') . " WHERE incident_id = %d AND cert IN ('issued','handed')", $id)))
        return myf_err('Für diesen Einsatz sind schon Bescheinigungen für den Arbeitgeber gedruckt – er bleibt als Nachweis erhalten.');
    $parts = (int) $wpdb->get_var($wpdb->prepare('SELECT COUNT(*) FROM ' . myf_t('participation') . ' WHERE incident_id = %d', $id));
    $wpdb->delete(myf_t('participation'), ['incident_id' => $id]);
    // Verweise lösen statt verwaist lassen; im Alarm-Protokoll bleibt sichtbar, dass der Alarm zu einem gelöschten Einsatz gehörte
    $wpdb->update(myf_t('trips'), ['incident_id' => null], ['incident_id' => $id]);
    if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', myf_t('loans')))) $wpdb->update(myf_t('loans'), ['incident_id' => null], ['incident_id' => $id]);
    if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', myf_t('alarm_log')))) $wpdb->update(myf_t('alarm_log'), ['result' => 'gelöscht'], ['incident_id' => $id]);
    $wpdb->delete(myf_t('incidents'), ['id' => $id]);
    delete_transient('myf_inc_sync');
    return ['ok' => true, 'id' => $id, 'deleted' => ['einsatz' => trim(($i->nr ? $i->nr . ' · ' : '') . $i->title), 'start' => $i->start, 'quelle' => $i->source, 'beteiligungen' => $parts, 'bericht_entwurf' => !empty($i->report)], 'reason' => $why];
}

// Export als CSV (Excel: Semikolon, UTF-8 mit BOM): Einsätze bzw. Übungen eines Jahres mit Beteiligung und Berichtsfeldern.
// Personenbezogene Felder (Geschädigter, Kennzeichen, Kostenpflichtiger) nur auf ausdrücklichen Wunsch; jeder Export steht im Protokoll.
function myf_incident_export_perm() {
    if (!is_user_logged_in()) return new WP_Error('myf_auth', 'Bitte neu anmelden.', ['status' => 401]);
    if (myf_can_manage() || myf_has_area('incidents')) return true;
    $me = myf_me();
    return $me && myf_member_can('incident_manage', $me) ? true : new WP_Error('myf_right', 'Den Export hat die Einsatzführung.', ['status' => 403]);
}
add_action('rest_api_init', function () {
    register_rest_route('myf/v1', '/incident/export', ['methods' => 'GET', 'permission_callback' => 'myf_incident_export_perm', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $year = (int) $req->get_param('year') ?: (int) current_time('Y');
        $kind = $req->get_param('kind') === 'uebung' ? 'uebung' : 'einsatz';
        $sens = (bool) $req->get_param('sensitive');
        $rows = $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . myf_t('incidents') . " WHERE kind = %s AND source <> 'test' AND start >= %s AND start < %s ORDER BY start", $kind, $year . '-01-01', ($year + 1) . '-01-01'));
        $fields = [];
        foreach (myf_report_form() as $sec) foreach ($sec['fields'] as $f) if ($sens || empty($f['sensitive'])) $fields[$f['id']] = $f['label'];
        $units = myf_units();
        $head = array_merge(['Nummer', 'Einheit', 'Stichwort / Titel', 'Kategorie', 'Beginn', 'Ende', 'Einsatzort', 'Beteiligte', 'davon bestätigt', 'Atemschutz', 'Fahrzeuge', 'Bericht von', 'Bericht am'], $kind === 'einsatz' ? array_values($fields) : []);
        $cell = function ($v) { $v = is_array($v) ? implode('; ', $v) : (string) $v; $v = preg_replace("/\r\n|\r/", "\n", $v); if (preg_match('/^[=+\-@]/', $v)) $v = "'" . $v; return '"' . str_replace('"', '""', $v) . '"'; };
        $out = [implode(';', array_map($cell, $head))];
        foreach ($rows as $i) {
            $ps = $wpdb->get_results($wpdb->prepare('SELECT vehicle, role, confirmed FROM ' . myf_t('participation') . ' WHERE incident_id = %d', $i->id));
            $veh = array_values(array_unique(array_filter(array_map(function ($p) { return $p->vehicle; }, $ps))));
            $agt = count(array_filter($ps, function ($p) { return in_array('AGT', explode(',', (string) $p->role), true); }));
            $line = [$i->nr, $units[$i->unit] ?? $i->unit, $i->title, (MYF_INCIDENT_CATS[$i->category] ?? $i->category), $i->start ? date('d.m.Y H:i', strtotime($i->start)) : '', $i->end ? date('d.m.Y H:i', strtotime($i->end)) : '',
                $i->place, count($ps), count(array_filter($ps, function ($p) { return $p->confirmed; })), $agt, $veh, $i->report_by, $i->report_at ? date('d.m.Y H:i', strtotime($i->report_at)) : ''];
            if ($kind === 'einsatz') { $r = $i->report ? myf_report_get((int) $i->id) : []; foreach (array_keys($fields) as $k) $line[] = $r[$k] ?? ''; }
            $out[] = implode(';', array_map($cell, $line));
        }
        $u = wp_get_current_user(); $me = myf_me();
        myf_audit_write($me ? 'member' : 'admin', $me ? (int) $me->id : (int) $u->ID, $me ? $me->name : ($u->display_name ?: $u->user_login), 'export:incidents', 'incidents', null,
            ['params' => ['jahr' => $year, 'art' => $kind, 'personenbezogen' => $sens ? 'ja' : 'nein', 'zeilen' => count($rows)]]);
        return ['filename' => ($kind === 'uebung' ? 'Uebungen-' : 'Einsaetze-') . $year . '.csv', 'csv' => "\xEF\xBB\xBF" . implode("\r\n", $out) . "\r\n", 'rows' => count($rows)];
    }]);
});

// Vorschläge für einen (noch) leeren Bericht aus dem, was schon da ist: Alarm (Alamos/FE2), Einheit, Teilnahme.
// Nur für leere Felder; die Oberfläche markiert sie als „vorgeschlagen – bitte prüfen“. Nichts wird ohne Speichern übernommen.
function myf_report_suggest($id, $vals, $form) {
    global $wpdb;
    $i = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('incidents') . ' WHERE id = %d', $id));
    if (!$i) return [];
    $opts = []; foreach ($form as $sec) foreach ($sec['fields'] as $f) $opts[$f['id']] = $f;
    $empty = function ($k) use ($vals, $opts) { if (!isset($opts[$k])) return false; $v = $vals[$k] ?? ''; return is_array($v) ? !$v : trim((string) $v) === ''; };
    $pick = function ($k, $cands) use ($opts) { return array_values(array_intersect($opts[$k]['options'] ?? [], $cands)); };
    $s = [];
    $atext = myf_dec((string) $i->alarm_text); $text = mb_strtolower($i->title . ' ' . $atext);
    $units = myf_units();
    if ($empty('loeschzug') && isset($units[$i->unit])) { $p = $pick('loeschzug', [preg_replace('/^LZ\s/u', 'Löschzug ', $units[$i->unit])]); if ($p) $s['loeschzug'] = $p; }
    if ($i->source === 'alamos') {
        if ($empty('alarmart')) { $p = $pick('alarmart', ['Meldeempfänger']); if ($p) $s['alarmart'] = $p; }
        if ($empty('alarm_ueber')) { $p = array_values(array_filter($opts['alarm_ueber']['options'] ?? [], function ($o) { return stripos($o, 'Leitstelle') === 0; })); if ($p) $s['alarm_ueber'] = [$p[0]]; }
    }
    // Andere Einheiten: Kräfte aus anderen Löschzügen in der Teilnahme
    $others = $wpdb->get_col($wpdb->prepare('SELECT DISTINCT m.unit FROM ' . myf_t('participation') . ' p JOIN ' . myf_t('members') . ' m ON m.id = p.member_id WHERE p.incident_id = %d', $id));
    if ($empty('beteiligung')) { $p = $pick('beteiligung', array_map(function ($u) use ($units) { return preg_replace('/^LZ\s/u', 'Löschzug ', $units[$u] ?? ''); }, array_diff($others, [$i->unit]))); if ($p) $s['beteiligung'] = $p; }
    // Einsatzleiter: Teilnehmer mit Funktion EL, sonst ZF, sonst GF
    if ($empty('einsatzleiter')) foreach (['EL', 'ZF', 'GF'] as $r) {
        $n = $wpdb->get_var($wpdb->prepare('SELECT m.name FROM ' . myf_t('participation') . ' p JOIN ' . myf_t('members') . " m ON m.id = p.member_id WHERE p.incident_id = %d AND (p.role = %s OR p.role LIKE %s OR p.role LIKE %s) LIMIT 1", $id, $r, $r . ',%', '%,' . $r . '%'));
        if ($n) { $x = explode(',', $n, 2); $s['einsatzleiter'] = trim((isset($x[1]) ? trim($x[1]) . ' ' : '') . $x[0]); break; }
    }
    // Objekt und Einsatzart nur, wenn das Stichwort es eindeutig hergibt
    $map = [['/ölspur/u', 'objekt', 'Straße', 'einsatzart', 'TH: Ölspur klein'], ['/\bvu\b|verkehrsunfall|pkw|lkw|kfz/u', 'objekt', 'KFZ', '', ''], ['/klemmt/u', '', '', 'einsatzart', 'TH: Person klemmt'],
        ['/wohnhaus|wohnung|\bmig\b/u', 'objekt', 'Wohnhaus', '', ''], ['/fläche|feld|wald|flächenbrand/u', 'objekt', 'Freigelände', '', ''], ['/baum auf straße|baum\b/u', 'objekt', 'Straße', '', ''],
        ['/brandsicherheitswache|\bbsw\b/u', '', '', 'einsatzart', 'Brandsicherheitswache']];
    foreach ($map as $m) if (preg_match($m[0], $text)) {
        if ($m[1] && $empty($m[1])) { $p = $pick($m[1], [$m[2]]); if ($p) $s[$m[1]] = array_values(array_unique(array_merge($s[$m[1]] ?? [], $p))); }
        if ($m[3] && $empty($m[3])) { $p = $pick($m[3], [$m[4]]); if ($p) $s[$m[3]] = array_values(array_unique(array_merge($s[$m[3]] ?? [], $p))); }
    }
    if ($empty('lage') && trim($atext) !== '') $s['lage'] = 'Laut Alarmierung: ' . trim(preg_replace('/\s+/u', ' ', $atext));
    return $s;
}

// Verlauf am Bericht (sichtbar in Ansicht und Ausdruck): abgeschlossen / wieder geöffnet mit Begründung
function myf_report_log_add($id, $what, $why) {
    global $wpdb;
    $log = json_decode((string) $wpdb->get_var($wpdb->prepare('SELECT report_log FROM ' . myf_t('incidents') . ' WHERE id = %d', $id)), true) ?: [];
    $log[] = ['at' => current_time('mysql'), 'by' => myf_actor(), 'what' => $what, 'why' => $why];
    $wpdb->update(myf_t('incidents'), ['report_log' => wp_json_encode($log)], ['id' => $id]);
}
