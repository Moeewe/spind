<?php
/**
 * Fahrzeugverwaltung: Stammdaten, Prüf- und Wartungsfristen (HU, UVV, Pumpe …), Verlauf mit Wartungen, Reparaturen,
 * Beschaffungen und Kosten, offene Mängel je Fahrzeug. Dazu Fahrzeug-Anfragen (z. B. Bulli/MTF) mit Freigabe.
 */

defined('ABSPATH') || exit;

const MYF_VEHICLE_STATUS = ['ready' => 'einsatzbereit', 'limited' => 'eingeschränkt', 'out' => 'außer Dienst'];
const MYF_VLOG_KINDS = ['wartung' => 'Wartung / Prüfung', 'reparatur' => 'Reparatur', 'beschaffung' => 'Beschaffung', 'schaden' => 'Schaden', 'sonst' => 'Sonstiges'];
const MYF_BOOKING_STATUS = ['requested' => 'angefragt', 'approved' => 'freigegeben', 'declined' => 'abgelehnt', 'cancelled' => 'storniert'];
// Vorschlag beim Anlegen eines Fahrzeugs (änderbar): Fristen in Monaten
const MYF_VEHICLE_TASKS = [['Hauptuntersuchung (HU)', 12], ['UVV-Prüfung (DGUV Vorschrift 70)', 12], ['Feuerlöschkreiselpumpe: Prüfung', 12], ['Inspektion / Wartung (Hersteller)', 12]];

function myf_install_vehicles($c) {
    global $wpdb;
    $p = myf_t(''); // echte oder Demo-Tabellen (Demo-Modus)
    $u0 = esc_sql(myf_unit_default()); // Vorgabe der Spalte „unit“: die erste Einheit
    dbDelta("CREATE TABLE {$p}vehicles (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        name varchar(60) NOT NULL,
        callsign varchar(60) NOT NULL DEFAULT '',
        plate varchar(20) NOT NULL DEFAULT '',
        unit varchar(20) NOT NULL DEFAULT '{$u0}',
        vtype varchar(60) NOT NULL DEFAULT '',
        built varchar(4) NOT NULL DEFAULT '',
        status varchar(10) NOT NULL DEFAULT 'ready',
        bookable tinyint(1) NOT NULL DEFAULT 0,
        in_incidents tinyint(1) NOT NULL DEFAULT 1,
        active tinyint(1) NOT NULL DEFAULT 1,
        note text NULL,
        ical_url varchar(255) NOT NULL DEFAULT '',
        created datetime NOT NULL,
        PRIMARY KEY  (id)
    ) $c;");
    dbDelta("CREATE TABLE {$p}vehicle_tasks (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        vehicle_id bigint(20) unsigned NOT NULL,
        title varchar(120) NOT NULL,
        interval_months smallint(5) unsigned NOT NULL DEFAULT 12,
        last_date date NULL,
        due_date date NULL,
        note varchar(200) NOT NULL DEFAULT '',
        PRIMARY KEY  (id),
        KEY vehicle_id (vehicle_id)
    ) $c;");
    dbDelta("CREATE TABLE {$p}vehicle_log (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        vehicle_id bigint(20) unsigned NULL,
        kind varchar(12) NOT NULL DEFAULT 'wartung',
        date date NOT NULL,
        title varchar(200) NOT NULL,
        cost decimal(10,2) NULL,
        vendor varchar(120) NOT NULL DEFAULT '',
        km int(10) unsigned NULL,
        note text NULL,
        task_id bigint(20) unsigned NULL,
        by_name varchar(120) NOT NULL DEFAULT '',
        created datetime NOT NULL,
        PRIMARY KEY  (id),
        KEY vehicle_id (vehicle_id)
    ) $c;");
    dbDelta("CREATE TABLE {$p}bookings (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        vehicle_id bigint(20) unsigned NOT NULL,
        member_id bigint(20) unsigned NOT NULL,
        start datetime NOT NULL,
        end datetime NOT NULL,
        purpose varchar(200) NOT NULL DEFAULT '',
        persons tinyint(3) unsigned NOT NULL DEFAULT 0,
        driver varchar(120) NOT NULL DEFAULT '',
        status varchar(10) NOT NULL DEFAULT 'requested',
        answer varchar(300) NOT NULL DEFAULT '',
        decided_by varchar(120) NOT NULL DEFAULT '',
        decided_at datetime NULL,
        created datetime NOT NULL,
        PRIMARY KEY  (id),
        KEY vehicle_id (vehicle_id, start),
        KEY member_id (member_id)
    ) $c;");
}

function myf_vehicle_out($v) {
    return ['id' => (int) $v->id, 'name' => $v->name, 'callsign' => $v->callsign, 'plate' => $v->plate, 'unit' => $v->unit, 'vtype' => $v->vtype, 'built' => $v->built,
        'status' => $v->status, 'bookable' => (bool) $v->bookable, 'in_incidents' => !isset($v->in_incidents) || (bool) $v->in_incidents, 'active' => (bool) $v->active, 'note' => (string) $v->note,
        // Fremdkalender (z. B. der MTF-Kalender der Jugendfeuerwehr): wird gelesen und als Belegung gezeigt; ics_url = eigener Kalender zum Abonnieren
        // Fremdkalender-Link nie an den Browser: nur ob gesetzt und der Anbieter
        'ical_set' => !empty($v->ical_url), 'ical_host' => !empty($v->ical_url) ? (string) (wp_parse_url((string) $v->ical_url, PHP_URL_HOST) ?: 'Kalender') : '', 'ics_url' => myf_vehicle_ics_url((int) $v->id)];
}
// Kalender dieses Fahrzeugs zum Abonnieren (freigegebene Buchungen): Geheimlink ohne Anmeldung, nur für die Verwaltung sichtbar
function myf_vehicle_ics_token($vid) { return substr(hash_hmac('sha256', 'vics|' . (int) $vid, wp_salt('logged_in')), 0, 32); }
function myf_vehicle_ics_url($vid) { return add_query_arg(['v' => (int) $vid, 't' => myf_vehicle_ics_token($vid)], rest_url('myf/v1/ics')); }
// Einträge aus dem Fremdkalender eines Fahrzeugs (nächste 60 Tage, 30 Minuten zwischengespeichert): [['start' => 'Y-m-d H:i:s', 'end' => …, 'title' => …]]
function myf_vehicle_ext_events($vid, $url = null) {
    global $wpdb;
    if ($url === null) $url = (string) $wpdb->get_var($wpdb->prepare('SELECT ical_url FROM ' . myf_t('vehicles') . ' WHERE id = %d', (int) $vid));
    if ($url === '' || !function_exists('myf_ical_parse')) return [];
    $ck = 'myf_vical_' . (int) $vid . '_' . md5($url);
    if (is_array($c = get_transient($ck))) return $c;
    $res = wp_remote_get(preg_replace('#^webcal://#i', 'https://', $url), ['timeout' => 8, 'user-agent' => 'Wehrwerk']);
    $out = [];
    if (!is_wp_error($res) && wp_remote_retrieve_response_code($res) === 200) {
        // Alles in Ortszeit als 'Y-m-d H:i:s' (wie die Buchungen in der Datenbank); myf_ical_parse liefert ISO-Zeiten in der WP-Zeitzone, ganztägig = Datum inklusiv
        $from = wp_date('Y-m-d H:i:s', current_time('timestamp', true) - DAY_IN_SECONDS); $to = wp_date('Y-m-d H:i:s', current_time('timestamp', true) + 60 * DAY_IN_SECONDS);
        foreach (myf_ical_parse(wp_remote_retrieve_body($res)) as $e) {
            $s = $e['allday'] ? substr($e['start'], 0, 10) . ' 00:00:00' : wp_date('Y-m-d H:i:s', strtotime($e['start']));
            $en = $e['allday'] ? substr($e['end'], 0, 10) . ' 23:59:59' : wp_date('Y-m-d H:i:s', strtotime($e['end']));
            if ($en < $from || $s > $to) continue;
            $out[] = ['start' => $s, 'end' => $en, 'title' => mb_substr($e['title'] !== '' ? $e['title'] : 'belegt', 0, 80), 'allday' => (bool) $e['allday']];
        }
    }
    set_transient($ck, $out, 30 * MINUTE_IN_SECONDS);
    return $out;
}
// Läuft laut Fremdkalender gerade etwas? (für Dashboards: „unterwegs laut Kalender“)
function myf_vehicle_ext_now($vid) {
    $now = current_time('mysql');
    foreach (myf_vehicle_ext_events($vid) as $e) if ($e['start'] <= $now && $e['end'] > $now) return $e;
    return null;
}
// Fremdbelegung aller aktiven Fahrzeuge mit Kalender (Mitgliederbereich „Belegung“, Dashboards)
function myf_ext_busy_list($days = 30) {
    global $wpdb;
    $out = []; $to = date('Y-m-d H:i:s', current_time('timestamp') + $days * DAY_IN_SECONDS);
    foreach ($wpdb->get_results('SELECT id, name, ical_url FROM ' . myf_t('vehicles') . " WHERE active = 1 AND ical_url <> ''") as $v)
        foreach (myf_vehicle_ext_events((int) $v->id, $v->ical_url) as $e) if ($e['start'] <= $to && $e['end'] >= current_time('mysql'))
            $out[] = ['vehicle_id' => (int) $v->id, 'vehicle' => $v->name, 'start' => $e['start'], 'end' => $e['end'], 'title' => $e['title'], 'allday' => $e['allday']];
    usort($out, function ($a, $b) { return strcmp($a['start'], $b['start']); });
    return $out;
}
function myf_booking_out($b, $names = true) {
    global $wpdb;
    $o = ['id' => (int) $b->id, 'vehicle_id' => (int) $b->vehicle_id, 'member_id' => (int) $b->member_id, 'start' => $b->start, 'end' => $b->end, 'purpose' => $b->purpose,
        'persons' => (int) $b->persons, 'driver' => $b->driver, 'status' => $b->status, 'answer' => $b->answer, 'decided_by' => $b->decided_by, 'created' => $b->created];
    if ($names) $o['member_name'] = (string) $wpdb->get_var($wpdb->prepare('SELECT name FROM ' . myf_t('members') . ' WHERE id = %d', $b->member_id));
    return $o;
}

add_filter('myf_admin_state', function ($d) {
    global $wpdb;
    if (!function_exists('myf_has_area') || !myf_has_area('vehicles')) return $d;
    $d['vehicles'] = array_map('myf_vehicle_out', $wpdb->get_results('SELECT * FROM ' . myf_t('vehicles') . ' ORDER BY active DESC, unit, name'));
    $d['vehicle_tasks'] = array_map(function ($t) { return ['id' => (int) $t->id, 'vehicle_id' => (int) $t->vehicle_id, 'title' => $t->title, 'interval' => (int) $t->interval_months,
        'last' => $t->last_date, 'due' => $t->due_date, 'note' => $t->note]; }, $wpdb->get_results('SELECT * FROM ' . myf_t('vehicle_tasks') . ' ORDER BY due_date IS NULL, due_date'));
    $d['vehicle_log'] = array_map(function ($l) { return ['id' => (int) $l->id, 'vehicle_id' => $l->vehicle_id ? (int) $l->vehicle_id : null, 'kind' => $l->kind, 'date' => $l->date, 'title' => $l->title,
        'cost' => $l->cost === null ? null : (float) $l->cost, 'vendor' => $l->vendor, 'km' => $l->km === null ? null : (int) $l->km, 'note' => (string) $l->note, 'by' => $l->by_name]; },
        $wpdb->get_results('SELECT * FROM ' . myf_t('vehicle_log') . ' ORDER BY date DESC, id DESC'));
    $d['bookings'] = array_map('myf_booking_out', $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . myf_t('bookings') . ' WHERE end >= %s ORDER BY start', date('Y-m-d', current_time('timestamp') - 90 * DAY_IN_SECONDS))));
    $d['vehicle_status'] = MYF_VEHICLE_STATUS; $d['vlog_kinds'] = MYF_VLOG_KINDS; $d['booking_status'] = MYF_BOOKING_STATUS;
    if (!isset($d['defects'])) $d['defects'] = [];
    // Offene Mängel je Fahrzeug brauchen auch Fahrzeug-Verwalter ohne Mängel-Bereich (nur Objekt, Titel, Status)
    if (!myf_has_area('defects')) $d['vehicle_defects'] = array_map(function ($x) { return ['object' => $x->object, 'title' => $x->title, 'urgency' => $x->urgency, 'status' => $x->status, 'created' => $x->created]; },
        $wpdb->get_results('SELECT object, title, urgency, status, created FROM ' . myf_t('defects') . " WHERE status IN ('new','progress')"));
    return $d;
}, 20);

// Ausgeblendete eigene Anfragen je Konto; Demo und echter Bestand getrennt, weil die Nummern sich überschneiden
function myf_bk_hidden_key() { return 'myf_bk_hidden' . (function_exists('myf_demo_ctx') && myf_demo_ctx() ? '_demo' : ''); }
function myf_bk_hidden() { $v = get_user_meta(get_current_user_id(), myf_bk_hidden_key(), true); return is_array($v) ? array_map('intval', $v) : []; }
function myf_bk_hidden_sql() { $h = myf_bk_hidden(); return $h ? ' AND id NOT IN (' . implode(',', $h) . ')' : ''; }
function myf_bk_is_history($b) { return in_array($b->status, ['declined', 'cancelled'], true) || $b->end < current_time('mysql'); }

add_filter('myf_me_data', function ($data, $me) {
    global $wpdb;
    $vs = $wpdb->get_results('SELECT * FROM ' . myf_t('vehicles') . ' WHERE active = 1 AND bookable = 1 ORDER BY name');
    $data['bookable'] = array_map(function ($v) { return ['id' => (int) $v->id, 'name' => $v->name, 'status' => $v->status]; }, $vs);
    if ($vs) {
        // Belegung der nächsten Wochen (freigegeben + angefragt), Namen nur bei eigenen Anfragen
        $rows = $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . myf_t('bookings') . " WHERE end >= %s AND status IN ('requested','approved') ORDER BY start", current_time('mysql')));
        $data['bookings'] = array_map(function ($b) use ($me) { $o = myf_booking_out($b, false); if ((int) $b->member_id !== (int) $me->id) { $o['member_id'] = 0; $o['driver'] = ''; } return $o; }, $rows);
        $data['my_bookings'] = array_map(function ($b) { return myf_booking_out($b, false); }, $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . myf_t('bookings') . ' WHERE member_id = %d' . myf_bk_hidden_sql() . ' ORDER BY start DESC LIMIT 30', $me->id)));
        $data['my_bookings_hidden'] = count(myf_bk_hidden());
        $data['booking_status'] = MYF_BOOKING_STATUS;
        $data['ext_busy'] = myf_ext_busy_list(30); // Belegung laut Fahrzeugkalender (ohne Namen)
    }
    // Wer Anfragen freigeben darf, sieht offene Anfragen auf der eigenen Startseite
    if (myf_member_can('booking_approve', $me)) {
        $data['booking_requests'] = array_map(function ($b) { return ['id' => (int) $b->id, 'vehicle' => $b->vname, 'start' => $b->start, 'end' => $b->end, 'purpose' => $b->purpose,
            'persons' => (int) $b->persons, 'driver' => $b->driver, 'by' => $b->mname]; },
            $wpdb->get_results($wpdb->prepare('SELECT b.*, v.name AS vname, m.name AS mname FROM ' . myf_t('bookings') . ' b JOIN ' . myf_t('vehicles') . ' v ON v.id = b.vehicle_id LEFT JOIN ' . myf_t('members') . " m ON m.id = b.member_id
                WHERE b.status = 'requested' AND b.end >= %s ORDER BY b.start", current_time('mysql'))));
    }
    return $data;
}, 10, 2);

// ---- Verwaltung -----------------------------------------------------------------
function myf_api_vehicle_save(WP_REST_Request $req) {
    global $wpdb;
    $id = (int) $req->get_param('id');
    $act = (string) $req->get_param('do');
    if ($id && in_array($act, ['retire', 'reactivate', 'delete'], true)) {
        $v = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('vehicles') . ' WHERE id = %d', $id));
        if (!$v) return myf_err('Fahrzeug nicht gefunden.', 404);
        $note = mb_substr(sanitize_text_field((string) $req->get_param('note')), 0, 160);
        $date = myf_date_or_null($req->get_param('date')) ?: current_time('Y-m-d');
        $audit = function ($what, $extra = []) use ($v) { if (function_exists('myf_audit_write')) myf_audit_write('admin', get_current_user_id(), myf_actor(), 'fahrzeug:' . $what, 'vehicle', (int) $v->id, ['name' => $v->name] + $extra); };
        // Ausmustern: Fahrzeug verschwindet aus allen Auswahllisten (Halle, Dashboard, Einsatz, Anfragen) – Fahrtenbuch, Fristen,
        // Verlauf und alte Einsätze bleiben vollständig erhalten; nachlesbar unter „Ausgemustert“
        if ($act === 'retire') {
            $wpdb->update(myf_t('vehicles'), ['active' => 0, 'bookable' => 0], ['id' => $id]);
            $wpdb->insert(myf_t('vehicle_log'), ['vehicle_id' => $id, 'kind' => 'sonst', 'date' => $date, 'title' => trim('Ausgemustert / außer Dienst gestellt' . ($note !== '' ? ' – ' . $note : '')), 'vendor' => '', 'note' => '', 'by_name' => myf_actor(), 'created' => current_time('mysql')]);
            $vs = myf_vstatus(); unset($vs[$id]); update_option('myf_vehicle_status', $vs, false);
            $audit('ausgemustert', ['date' => $date, 'note' => $note]);
            return ['id' => $id];
        }
        if ($act === 'reactivate') {
            $wpdb->update(myf_t('vehicles'), ['active' => 1], ['id' => $id]);
            $wpdb->insert(myf_t('vehicle_log'), ['vehicle_id' => $id, 'kind' => 'sonst', 'date' => $date, 'title' => trim('Wieder in Dienst gestellt' . ($note !== '' ? ' – ' . $note : '')), 'vendor' => '', 'note' => '', 'by_name' => myf_actor(), 'created' => current_time('mysql')]);
            $audit('wieder-in-dienst', ['date' => $date]);
            return ['id' => $id];
        }
        // Löschen nur, wenn nichts daran hängt (versehentlich angelegt) – sonst ausmustern, damit nichts verloren geht
        $has = [];
        foreach (['Fahrten' => 'SELECT COUNT(*) FROM ' . myf_t('trips') . ' WHERE vehicle_id = %d', 'Anfragen/Buchungen' => 'SELECT COUNT(*) FROM ' . myf_t('bookings') . ' WHERE vehicle_id = %d',
            'Verlaufseinträge' => 'SELECT COUNT(*) FROM ' . myf_t('vehicle_log') . ' WHERE vehicle_id = %d', 'erledigte Fristen' => 'SELECT COUNT(*) FROM ' . myf_t('vehicle_tasks') . ' WHERE vehicle_id = %d AND last_date IS NOT NULL'] as $label => $sql)
            if ($n = (int) $wpdb->get_var($wpdb->prepare($sql, $id))) $has[] = $n . ' ' . $label;
        foreach (['Einsatzbeteiligungen' => 'SELECT COUNT(*) FROM ' . myf_t('participation') . ' WHERE vehicle = %s', 'Mängel' => 'SELECT COUNT(*) FROM ' . myf_t('defects') . ' WHERE object = %s'] as $label => $sql)
            if ($n = (int) $wpdb->get_var($wpdb->prepare($sql, $v->name))) $has[] = $n . ' ' . $label;
        if ($has) return myf_err('„' . $v->name . '“ kann nicht gelöscht werden – es gibt schon ' . implode(', ', $has) . '. Bitte stattdessen ausmustern: die Daten bleiben erhalten.');
        $wpdb->delete(myf_t('vehicle_tasks'), ['vehicle_id' => $id]);
        $wpdb->delete(myf_t('vehicles'), ['id' => $id]);
        $vs = myf_vstatus(); unset($vs[$id]); update_option('myf_vehicle_status', $vs, false);
        $audit('gelöscht');
        return ['ok' => true, 'deleted' => $id];
    }
    $d = [];
    foreach (['name' => 60, 'callsign' => 60, 'plate' => 20, 'vtype' => 60, 'built' => 4] as $k => $len) if ($req->has_param($k)) $d[$k] = mb_substr(sanitize_text_field((string) $req->get_param($k)), 0, $len);
    if ($req->has_param('unit')) $d['unit'] = myf_unit_ok($req->get_param('unit'));
    if ($req->has_param('status')) $d['status'] = isset(MYF_VEHICLE_STATUS[$req->get_param('status')]) ? $req->get_param('status') : 'ready';
    foreach (['bookable', 'active', 'in_incidents'] as $k) if ($req->has_param($k)) $d[$k] = $req->get_param($k) ? 1 : 0;
    // Ein Fahrzeug gibt es nur einmal: gleicher Name oder Funkrufname (ohne Leerzeichen/Groß-Klein) = schon vorhanden
    if (isset($d['name']) && $d['name'] !== '') {
        foreach ($wpdb->get_results('SELECT id, name, callsign FROM ' . myf_t('vehicles')) as $o) {
            if ((int) $o->id !== $id && myf_norm_vname($o->name) === myf_norm_vname($d['name'])) return myf_err('„' . $o->name . '“ gibt es schon unter Technik → Fahrzeuge.');
        }
    }
    if ($req->has_param('note')) $d['note'] = sanitize_textarea_field((string) $req->get_param('note'));
    if ($req->has_param('ical_url')) {
        $u = trim((string) $req->get_param('ical_url'));
        $d['ical_url'] = $u === '' ? '' : esc_url_raw(preg_replace('#^webcal://#i', 'https://', $u), ['https', 'http']);
        foreach ($wpdb->get_col($wpdb->prepare("SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE %s", '_transient_myf_vical_' . $id . '_%')) as $o) delete_option($o);
    }
    if ($id) {
        $old = (string) $wpdb->get_var($wpdb->prepare('SELECT name FROM ' . myf_t('vehicles') . ' WHERE id = %d', $id));
        $wpdb->update(myf_t('vehicles'), $d, ['id' => $id]);
        // Umbenannt: Offenes zieht mit (Mängel in Arbeit, noch nicht abgeschlossene Einsatzlisten) – Abgeschlossenes behält
        // revisionssicher den damaligen Namen
        if (!empty($d['name']) && $old !== '' && $old !== $d['name']) {
            $wpdb->query($wpdb->prepare('UPDATE ' . myf_t('defects') . " SET object = %s WHERE object = %s AND status IN ('new','progress')", $d['name'], $old));
            $wpdb->query($wpdb->prepare('UPDATE ' . myf_t('participation') . ' SET vehicle = %s WHERE vehicle = %s AND incident_id IN (SELECT id FROM ' . myf_t('incidents') . ' WHERE part_closed IS NULL)', $d['name'], $old));
        }
        return ['id' => $id];
    }
    if (($d['name'] ?? '') === '') return myf_err('Bitte einen Namen angeben (z. B. HLF 20).');
    $wpdb->insert(myf_t('vehicles'), $d + ['created' => current_time('mysql')]);
    $id = (int) $wpdb->insert_id;
    if ($req->get_param('default_tasks')) foreach (MYF_VEHICLE_TASKS as $t) $wpdb->insert(myf_t('vehicle_tasks'), ['vehicle_id' => $id, 'title' => $t[0], 'interval_months' => $t[1]]);
    return ['id' => $id];
}
function myf_api_vehicle_task(WP_REST_Request $req) {
    global $wpdb;
    $id = (int) $req->get_param('id');
    if ($req->get_param('delete')) { $wpdb->delete(myf_t('vehicle_tasks'), ['id' => $id]); return ['ok' => true]; }
    // „erledigt“: Eintrag im Verlauf, nächste Fälligkeit = Datum + Frist
    if ($req->get_param('done')) {
        $t = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('vehicle_tasks') . ' WHERE id = %d', $id));
        if (!$t) return myf_err('Nicht gefunden.', 404);
        $date = myf_date_or_null($req->get_param('date')) ?: current_time('Y-m-d');
        $due = myf_date_or_null($req->get_param('next_due')) ?: ($t->interval_months ? date('Y-m-d', strtotime($date . ' +' . (int) $t->interval_months . ' months')) : null);
        $wpdb->update(myf_t('vehicle_tasks'), ['last_date' => $date, 'due_date' => $due], ['id' => $id]);
        $cost = $req->get_param('cost');
        $wpdb->insert(myf_t('vehicle_log'), ['vehicle_id' => $t->vehicle_id, 'kind' => 'wartung', 'date' => $date, 'title' => $t->title . ' erledigt',
            'cost' => $cost === '' || $cost === null ? null : round((float) str_replace(',', '.', (string) $cost), 2), 'vendor' => sanitize_text_field((string) $req->get_param('vendor')),
            'note' => sanitize_textarea_field((string) $req->get_param('note')), 'task_id' => $id, 'by_name' => myf_actor(), 'created' => current_time('mysql')]);
        return ['id' => $id];
    }
    $d = [];
    if ($req->has_param('title')) $d['title'] = mb_substr(sanitize_text_field((string) $req->get_param('title')), 0, 120);
    if ($req->has_param('interval')) $d['interval_months'] = max(0, min(240, (int) $req->get_param('interval')));
    if ($req->has_param('due')) $d['due_date'] = myf_date_or_null($req->get_param('due'));
    if ($req->has_param('note')) $d['note'] = mb_substr(sanitize_text_field((string) $req->get_param('note')), 0, 200);
    if ($id) { $wpdb->update(myf_t('vehicle_tasks'), $d, ['id' => $id]); return ['id' => $id]; }
    if (empty($d['title'])) return myf_err('Bitte eine Bezeichnung angeben.');
    $wpdb->insert(myf_t('vehicle_tasks'), $d + ['vehicle_id' => (int) $req->get_param('vehicle_id')]);
    return ['id' => (int) $wpdb->insert_id];
}
function myf_api_vehicle_log(WP_REST_Request $req) {
    global $wpdb;
    $id = (int) $req->get_param('id');
    if ($req->get_param('delete')) { $wpdb->delete(myf_t('vehicle_log'), ['id' => $id]); return ['ok' => true]; }
    $title = mb_substr(sanitize_text_field((string) $req->get_param('title')), 0, 200);
    if ($title === '') return myf_err('Bitte beschreiben, was gemacht/beschafft wurde.');
    $cost = $req->get_param('cost');
    $km = $req->get_param('km');
    $d = ['vehicle_id' => (int) $req->get_param('vehicle_id') ?: null, 'kind' => isset(MYF_VLOG_KINDS[$req->get_param('kind')]) ? $req->get_param('kind') : 'sonst',
        'date' => myf_date_or_null($req->get_param('date')) ?: current_time('Y-m-d'), 'title' => $title,
        'cost' => $cost === '' || $cost === null ? null : round((float) str_replace(',', '.', (string) $cost), 2), 'vendor' => mb_substr(sanitize_text_field((string) $req->get_param('vendor')), 0, 120),
        'km' => $km === '' || $km === null ? null : max(0, (int) $km), 'note' => sanitize_textarea_field((string) $req->get_param('note'))];
    if ($id) { $wpdb->update(myf_t('vehicle_log'), $d, ['id' => $id]); return ['id' => $id]; }
    $wpdb->insert(myf_t('vehicle_log'), $d + ['by_name' => myf_actor(), 'created' => current_time('mysql')]);
    return ['id' => (int) $wpdb->insert_id];
}

// Fahrzeug-Anfrage freigeben / ablehnen
function myf_api_booking_decide(WP_REST_Request $req) {
    global $wpdb;
    $b = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('bookings') . ' WHERE id = %d', (int) $req->get_param('id')));
    if (!$b) return myf_err('Nicht gefunden.', 404);
    $status = in_array($req->get_param('status'), ['approved', 'declined', 'cancelled'], true) ? $req->get_param('status') : 'requested';
    if ($status === 'approved' && myf_booking_conflict($b->vehicle_id, $b->start, $b->end, $b->id)) return myf_err('In diesem Zeitraum ist das Fahrzeug schon freigegeben vergeben.', 409);
    $wpdb->update(myf_t('bookings'), ['status' => $status, 'answer' => mb_substr(sanitize_text_field((string) $req->get_param('answer')), 0, 300), 'decided_by' => myf_actor(), 'decided_at' => current_time('mysql')], ['id' => $b->id]);
    $v = $wpdb->get_var($wpdb->prepare('SELECT name FROM ' . myf_t('vehicles') . ' WHERE id = %d', $b->vehicle_id));
    myf_notify([(int) $b->member_id], 'booking', $v . ' am ' . date('d.m.Y H:i', strtotime($b->start)) . ': ' . MYF_BOOKING_STATUS[$status], (string) $req->get_param('answer'), 'vehicle');
    return ['id' => (int) $b->id];
}
function myf_booking_conflict($vid, $start, $end, $except = 0) {
    global $wpdb;
    $n = (int) $wpdb->get_var($wpdb->prepare('SELECT COUNT(*) FROM ' . myf_t('bookings') . " WHERE vehicle_id = %d AND status = 'approved' AND id <> %d AND start < %s AND end > %s", $vid, $except, $end, $start));
    if ($n) return $n;
    // Fremdkalender des Fahrzeugs (z. B. Jugendfeuerwehr-Kalender fürs MTF): belegt ist belegt
    foreach (myf_vehicle_ext_events($vid) as $e) if ($e['start'] < $end && $e['end'] > $start) return 1;
    return 0;
}

add_action('rest_api_init', function () {
    $ns = 'myf/v1';
    foreach (['vehicle' => 'myf_api_vehicle_save', 'vehicle/task' => 'myf_api_vehicle_task', 'vehicle/log' => 'myf_api_vehicle_log', 'booking' => 'myf_api_booking_decide'] as $r => $cb) {
        register_rest_route($ns, '/admin/' . $r, ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => $cb]);
    }
    register_rest_route($ns, '/admin/vehicle/import', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function () {
        global $wpdb;
        $n = 0;
        if (taxonomy_exists('fahrzeug')) foreach ((array) get_terms(['taxonomy' => 'fahrzeug', 'hide_empty' => false]) as $t) {
            if (is_object($t) && !myf_vehicle_same($t->name)) {
                $wpdb->insert(myf_t('vehicles'), ['name' => $t->name, 'unit' => count(myf_units()) > 1 ? myf_unit_guess($t->name) : myf_unit_default(), 'bookable' => preg_match('/mtf|bulli|mtw/i', $t->name) ? 1 : 0, 'created' => current_time('mysql')]);
                $id = (int) $wpdb->insert_id; $n++;
                foreach (MYF_VEHICLE_TASKS as $tk) $wpdb->insert(myf_t('vehicle_tasks'), ['vehicle_id' => $id, 'title' => $tk[0], 'interval_months' => $tk[1]]);
            }
        }
        return ['added' => $n];
    }]);
    // Mitglied: Fahrzeug anfragen / eigene Anfrage stornieren
    register_rest_route($ns, '/me/booking/decide', ['methods' => 'POST', 'permission_callback' => myf_perm('booking_approve'), 'callback' => 'myf_api_booking_decide']);
    register_rest_route($ns, '/me/booking', ['methods' => 'POST', 'permission_callback' => myf_perm('booking'), 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $me = myf_me();
        if (!$me) return myf_err('Dein Konto ist keinem Mitglied zugeordnet.', 403);
        // Eigene Historie aufräumen: nur die eigene Ansicht – der Datensatz bleibt für Fahrzeug-Verwaltung und Protokoll unverändert
        if ($req->get_param('unhide_all')) { delete_user_meta(get_current_user_id(), myf_bk_hidden_key()); return ['ok' => true]; }
        if ($req->get_param('hide')) {
            $ids = array_values(array_unique(array_map('intval', (array) $req->get_param('hide'))));
            $rows = $ids ? $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . myf_t('bookings') . ' WHERE member_id = %d AND id IN (' . implode(',', $ids) . ')', $me->id)) : [];
            $add = [];
            // Noch laufende Anfragen und kommende Fahrten bleiben sichtbar, sonst geraten sie in Vergessenheit
            foreach ($rows as $b) if (myf_bk_is_history($b)) $add[] = (int) $b->id;
            if (!$add) return myf_err('Nur abgelehnte, stornierte oder vergangene Anfragen lassen sich ausblenden.');
            update_user_meta(get_current_user_id(), myf_bk_hidden_key(), array_values(array_unique(array_merge(myf_bk_hidden(), $add))));
            return ['ok' => true, 'hidden' => $add];
        }
        if ($req->get_param('cancel')) {
            $b = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('bookings') . ' WHERE id = %d AND member_id = %d', (int) $req->get_param('cancel'), $me->id));
            if (!$b) return myf_err('Nicht gefunden.', 404);
            $wpdb->update(myf_t('bookings'), ['status' => 'cancelled'], ['id' => $b->id]);
            if ($b->status === 'approved') myf_notify_area('vehicles', 'booking', 'Fahrzeug-Anfrage storniert: ' . date('d.m.Y H:i', strtotime($b->start)), $me->name, 'admin:vehicles');
            return ['id' => (int) $b->id];
        }
        $v = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('vehicles') . ' WHERE id = %d AND active = 1 AND bookable = 1', (int) $req->get_param('vehicle_id')));
        if (!$v) return myf_err('Dieses Fahrzeug kann nicht angefragt werden.');
        $start = myf_dt_param($req->get_param('start')); $end = myf_dt_param($req->get_param('end'));
        if (!$start || !$end || $end <= $start) return myf_err('Bitte Beginn und Ende angeben (Ende nach Beginn).');
        if ($start < current_time('mysql')) return myf_err('Der Beginn liegt in der Vergangenheit.');
        $purpose = mb_substr(sanitize_text_field((string) $req->get_param('purpose')), 0, 200);
        if ($purpose === '') return myf_err('Bitte den Zweck angeben (z. B. Jugendfeuerwehr-Ausflug).');
        if (myf_booking_conflict($v->id, $start, $end)) return myf_err('In diesem Zeitraum ist das Fahrzeug schon vergeben.', 409);
        $wpdb->insert(myf_t('bookings'), ['vehicle_id' => $v->id, 'member_id' => $me->id, 'start' => $start, 'end' => $end, 'purpose' => $purpose,
            'persons' => max(0, min(99, (int) $req->get_param('persons'))), 'driver' => mb_substr(sanitize_text_field((string) $req->get_param('driver')), 0, 120),
            'status' => 'requested', 'created' => current_time('mysql')]);
        $bid = (int) $wpdb->insert_id;
        myf_notify_area('vehicles', 'booking', 'Fahrzeug-Anfrage: ' . $v->name . ' am ' . date('d.m.Y H:i', strtotime($start)), $me->name . ': ' . $purpose, 'admin:vehicles', 'bkreq:' . $bid);
        // Freigabe auch direkt auf der Startseite der Löschzugführung (Recht „Fahrzeug-Anfragen freigeben“)
        myf_notify(array_diff(myf_right_members('booking_approve'), myf_area_members('vehicles')), 'booking', 'Fahrzeug-Anfrage freigeben: ' . $v->name . ' am ' . date('d.m.Y H:i', strtotime($start)), $me->name . ': ' . $purpose, 'start', 'bkreq:' . $bid);
        return ['id' => $bid];
    }]);
});

// Eigene freigegebene Fahrten im persönlichen Kalender
add_filter('myf_ics_events', function ($events, $m) {
    global $wpdb;
    foreach ($wpdb->get_results($wpdb->prepare('SELECT b.*, v.name FROM ' . myf_t('bookings') . ' b JOIN ' . myf_t('vehicles') . " v ON v.id = b.vehicle_id WHERE b.member_id = %d AND b.status = 'approved' AND b.end >= %s", $m->id, date('Y-m-d', current_time('timestamp') - 30 * DAY_IN_SECONDS))) as $b) {
        $events[] = ['uid' => 'b' . $b->id, 'start' => substr($b->start, 0, 10), 'end' => substr($b->end, 0, 10), 'time' => substr($b->start, 11, 5), 'endtime' => substr($b->end, 11, 5),
            'title' => $b->name . ': ' . $b->purpose, 'loc' => ''];
    }
    return $events;
}, 10, 2);

// Täglich: fällige Fahrzeugprüfungen an den Bereich Fahrzeuge
add_action('myf_daily_more', function ($today) {
    global $wpdb;
    $rows = $wpdb->get_results($wpdb->prepare('SELECT t.*, v.name FROM ' . myf_t('vehicle_tasks') . ' t JOIN ' . myf_t('vehicles') . ' v ON v.id = t.vehicle_id WHERE v.active = 1 AND t.due_date IS NOT NULL AND t.due_date <= %s ORDER BY t.due_date', date('Y-m-d', strtotime($today . ' +30 days'))));
    if (!$rows) return;
    $list = array_map(function ($r) { return $r->name . ': ' . $r->title . ' bis ' . date('d.m.Y', strtotime($r->due_date)); }, $rows);
    foreach (myf_area_members('vehicles') as $mid) myf_notify([$mid], 'reminder', count($rows) . ' Fahrzeug-Prüfungen fällig', implode("\n", array_slice($list, 0, 12)), 'admin:vehicledue', 'fahrzeug:' . date('o-W', strtotime($today)));
});

// Gibt es das Fahrzeug schon? Gleicher Name oder Funkrufname, ohne Leerzeichen/Bindestriche/Groß-Klein („HLF20“ = „HLF 20“)
function myf_vehicle_same($name) {
    global $wpdb;
    $n = myf_norm_vname($name);
    if ($n === '') return null;
    foreach ($wpdb->get_results('SELECT id, name, callsign FROM ' . myf_t('vehicles')) as $v) {
        if (myf_norm_vname($v->name) === $n || ($v->callsign !== '' && myf_norm_vname($v->callsign) === $n)) return $v;
    }
    return null;
}

// Einmalig (3.3): Fahrzeugliste der Einsätze und Technik zusammenführen – danach gibt es nur noch Technik → Fahrzeuge.
// Gibt es noch gar keine Fahrzeuge, werden sie aus der bisherigen Einsatz-Liste angelegt. Sonst wird jeder Name dem
// passenden Fahrzeug zugeordnet (gleicher Name/Funkrufname oder eindeutig enthalten); was nicht eindeutig passt, wird NICHT
// angelegt (keine Doppelten), sondern als „nicht verknüpft“ angezeigt und kann mit einem Klick zugeordnet werden.
function myf_vehicle_loose($name) {
    global $wpdb;
    $n = myf_norm_vname($name); $hit = [];
    if (strlen($n) < 2) return null;
    foreach ($wpdb->get_results('SELECT id, name, callsign FROM ' . myf_t('vehicles') . ' WHERE active = 1') as $v) {
        $a = myf_norm_vname($v->name);
        if ($a !== '' && (strpos($a, $n) === 0 || strpos($n, $a) === 0)) $hit[] = $v;
    }
    if (count($hit) > 1) {
        // „LF 20“ passt zu „LF20/16“ und „LF20 KatS“: gleiche Bezeichnung vor dem Schrägstrich gewinnt (LF 20/16 ist das LF 20)
        $base = function ($x) { return myf_norm_vname(preg_replace('#/.*$#', '', (string) $x)); };
        $hit = array_values(array_filter($hit, function ($v) use ($base, $n) { return $base($v->name) === $n; }));
    }
    return count($hit) === 1 ? $hit[0] : null;
}
function myf_incveh_extra() { $x = get_option('myf_incveh_extra', []); return is_array($x) ? array_values($x) : []; }
add_action('init', function () {
    if (get_option('myf_mig_incveh') || !function_exists('myf_settings')) return;
    global $wpdb;
    if ((string) get_option('myf_db_version') !== MYF_DB_VERSION) return; // erst nach dem Tabellen-Update
    update_option('myf_mig_incveh', 1, false);
    $list = myf_settings()['incident_vehicles'] ?? null;
    if (!is_array($list) || !$list) $list = (array) myf_local('incident_vehicles');
    $list = array_values(array_filter(array_map('trim', array_map('strval', $list)), function ($n) { return $n !== '' && strtolower($n) !== 'andere'; }));
    if (!$list) return;
    $empty = !(int) $wpdb->get_var('SELECT COUNT(*) FROM ' . myf_t('vehicles'));
    $keep = []; $extra = [];
    foreach ($list as $name) {
        $v = myf_vehicle_same($name) ?: ($empty ? null : myf_vehicle_loose($name));
        if ($v) { $keep[] = (int) $v->id; continue; }
        if (!$empty) { $extra[] = $name; continue; }
        $unit = count(myf_units()) > 1 && function_exists('myf_unit_guess') ? myf_unit_guess($name) : myf_unit_default();
        $wpdb->insert(myf_t('vehicles'), ['name' => mb_substr($name, 0, 60), 'unit' => $unit, 'bookable' => preg_match('/mtf|bulli|mtw/i', $name) ? 1 : 0, 'in_incidents' => 1, 'active' => 1, 'created' => current_time('mysql')]);
        $keep[] = (int) $wpdb->insert_id;
    }
    if ($keep) $wpdb->query('UPDATE ' . myf_t('vehicles') . ' SET in_incidents = IF(id IN (' . implode(',', array_map('intval', $keep)) . '), 1, 0)');
    update_option('myf_incveh_extra', $extra, false);
}, 30);

// Nicht verknüpften Namen einem Fahrzeug zuordnen, als neues Fahrzeug anlegen oder entfernen (Bereich Einsätze/Fahrzeuge)
add_action('rest_api_init', function () {
    register_rest_route('myf/v1', '/admin/vehicle/link', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $name = (string) $req->get_param('name'); $to = (int) $req->get_param('vehicle_id'); $how = (string) $req->get_param('how');
        $extra = array_values(array_filter(myf_incveh_extra(), function ($n) use ($name) { return $n !== $name; }));
        if ($how === 'create') {
            if (myf_vehicle_same($name)) return myf_err('„' . $name . '“ gibt es schon unter Technik → Fahrzeuge.');
            $wpdb->insert(myf_t('vehicles'), ['name' => mb_substr($name, 0, 60), 'unit' => myf_unit_default(), 'in_incidents' => 1, 'active' => 1, 'created' => current_time('mysql')]);
        } elseif ($how === 'link' && $to) {
            $wpdb->update(myf_t('vehicles'), ['in_incidents' => 1], ['id' => $to]);
        } elseif ($how === 'callsign' && $to) {
            $wpdb->update(myf_t('vehicles'), ['callsign' => mb_substr(sanitize_text_field((string) $req->get_param('callsign')), 0, 60)], ['id' => $to]);
            return ['ok' => true];
        } elseif ($how === 'toggle' && $to) {
            $wpdb->update(myf_t('vehicles'), ['in_incidents' => $req->get_param('on') ? 1 : 0], ['id' => $to]);
            return ['ok' => true];
        }
        update_option('myf_incveh_extra', $extra, false);
        return ['ok' => true];
    }]);
});

// Für Einsätze → Einstellungen: welche Technik-Fahrzeuge im Einsatz auswählbar sind, und Namen ohne Fahrzeug
add_filter('myf_admin_state', function ($s) {
    if (!function_exists('myf_has_area') || !(myf_has_area('incidents') || myf_has_area('vehicles'))) return $s;
    global $wpdb;
    $vs = function_exists('myf_vstatus') ? myf_vstatus() : [];
    $s['incveh'] = ['all' => array_map(function ($v) use ($vs) { $f = $vs[(int) $v->id] ?? null;
            return ['id' => (int) $v->id, 'name' => $v->name, 'unit' => $v->unit, 'on' => (bool) $v->in_incidents, 'callsign' => (string) $v->callsign,
                'fms' => $f ? (string) $f['s'] : '', 'fms_by' => $f ? (string) ($f['by'] ?? '') : '', 'fms_t' => $f ? (string) $f['t'] : '']; },
        $wpdb->get_results('SELECT id, name, unit, in_incidents, callsign FROM ' . myf_t('vehicles') . ' WHERE active = 1 ORDER BY unit, name')), 'extra' => myf_incveh_extra()];
    return $s;
});
