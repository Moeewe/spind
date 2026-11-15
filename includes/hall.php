<?php
/**
 * Fahrzeughalle:
 *  – Terminal (Tablet/Rechner in der Halle, geheimer Gerätelink ?myf_halle=SCHLÜSSEL, kein eigenes Login):
 *    nach dem Einsatz Namen antippen, Fahrzeug wählen – ersetzt die Papierliste. Die Einsatzführung bestätigt wie bisher.
 *    Zeigt nur Namen und Einsatz-Stichwort, nichts Persönliches; jede Eintragung steht im Protokoll.
 *  – Fahrzeugstatus (FMS) über die Alarm-Schnittstelle (z. B. Alamos FE2): POST …/myf/v1/status
 *  – Fahrtenbuch je Fahrzeug, verknüpft mit Einsätzen, Fahrzeug-Anfragen und Werkstatt (km-Stand)
 */

defined('ABSPATH') || exit;

const MYF_FMS = ['1' => 'frei über Funk', '2' => 'frei auf Wache', '3' => 'Einsatz übernommen', '4' => 'am Einsatzort', '5' => 'Sprechwunsch',
    '6' => 'nicht einsatzbereit', '7' => 'Patient aufgenommen', '8' => 'am Transportziel', '9' => 'Sonderstatus'];
// Fahrtzwecke (Schlüssel max. 12 Zeichen); Reihenfolge = Auswahl im Formular
const MYF_TRIP_KINDS = ['einsatz' => 'Einsatz', 'uebung' => 'Übung / Dienst', 'lehrgang' => 'Lehrgang / Ausbildung', 'dienst' => 'Dienstfahrt',
    'besorgung' => 'Einkauf / Besorgung', 'wache' => 'Brandwache / Veranstaltung', 'besuch' => 'Besuch / Partnerfeuerwehr', 'werkstatt' => 'Werkstatt / Prüfung',
    'verein' => 'Vereins-/Jugendfahrt', 'tanken' => 'nur Tanken', 'sonst' => 'Sonstiges'];

function myf_install_hall($c) {
    global $wpdb;
    $p = myf_t(''); // echte oder Demo-Tabellen (Demo-Modus)
    // Fahrtenbuch: Einträge werden nie geändert oder gelöscht – Korrektur per Storno (bleibt sichtbar)
    dbDelta("CREATE TABLE {$p}trips (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        vehicle_id bigint(20) unsigned NOT NULL,
        kind varchar(12) NOT NULL DEFAULT 'dienst',
        start datetime NOT NULL,
        end datetime NULL,
        driver_id bigint(20) unsigned NULL,
        driver varchar(120) NOT NULL DEFAULT '',
        purpose varchar(200) NOT NULL DEFAULT '',
        km_start int(10) unsigned NULL,
        km_end int(10) unsigned NULL,
        fuel_l decimal(7,2) NULL,
        fuel_cost decimal(8,2) NULL,
        incident_id bigint(20) unsigned NULL,
        booking_id bigint(20) unsigned NULL,
        source varchar(10) NOT NULL DEFAULT 'app',
        storno_of bigint(20) unsigned NULL,
        storno_reason varchar(200) NOT NULL DEFAULT '',
        by_name varchar(120) NOT NULL DEFAULT '',
        created datetime NOT NULL,
        PRIMARY KEY  (id),
        KEY vehicle_id (vehicle_id, start),
        KEY incident_id (incident_id),
        KEY driver_id (driver_id)
    ) $c;");
}

function myf_hall() {
    $s = myf_settings();
    return ['on' => !empty($s['hall_on']), 'key' => (string) ($s['hall_key'] ?? ''), 'window' => max(1, min(72, (int) ($s['hall_window'] ?? 6))),
        // Selbst eintragen: '' = Handy und Terminal (bis 60 Tage), 'window' = nur im Zeitfenster, 'terminal' = nur am Terminal in der Halle
        'limit' => in_array($s['hall_limit'] ?? '', ['window', 'terminal'], true) ? $s['hall_limit'] : '',
        'on_screen' => !empty($s['hall_on_screen']),
        // Selbst eintragen am Handy (ohne Halle): bis so viele Tage nach dem Einsatz – oder bis die Einsatzführung die Liste abschließt
        'self_days' => max(1, min(60, (int) ($s['hall_self_days'] ?? 7)))];
}
function myf_hall_key_ok($key) {
    $h = myf_hall();
    return $h['on'] && $h['key'] !== '' && is_string($key) && hash_equals($h['key'], $key);
}
function myf_hall_url() { $h = myf_hall(); return $h['key'] ? add_query_arg('myf_halle', $h['key'], home_url('/')) : ''; }

// Darf ein Mitglied sich am Handy (noch) selbst eintragen?
function myf_hall_self_ok($inc) {
    $h = myf_hall();
    if (!empty($inc->part_closed) || !empty($inc->report_closed)) return false; // Liste oder Bericht abgeschlossen
    if (!$h['on'] || $h['limit'] === '') return strtotime($inc->start) >= current_time('timestamp') - $h['self_days'] * DAY_IN_SECONDS;
    if ($h['limit'] === 'terminal') return false;
    return strtotime($inc->start) >= current_time('timestamp') - $h['window'] * HOUR_IN_SECONDS;
}

// Einsätze/Übungen, für die die Liste in der Halle gerade offen ist
function myf_hall_incidents($force = 0) {
    global $wpdb;
    $h = myf_hall();
    $now = current_time('timestamp');
    $list = $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . myf_t('incidents') . " WHERE source <> 'test' AND part_closed IS NULL AND report_closed IS NULL AND start >= %s AND start <= %s ORDER BY start DESC LIMIT 12",
        date('Y-m-d H:i:s', $now - $h['window'] * HOUR_IN_SECONDS), date('Y-m-d H:i:s', $now + HOUR_IN_SECONDS)));
    // Von Hand geöffnet („Anwesenheit eintragen“: Alarm kam nicht an oder Liste nachtragen): auch außerhalb des Zeitfensters,
    // bis 60 Tage zurück, solange die Einsatzführung die Liste nicht abgeschlossen hat
    if ($force && !in_array((int) $force, array_map(function ($i) { return (int) $i->id; }, $list), true) && myf_hall_incident_ok((int) $force)) {
        $x = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('incidents') . ' WHERE id = %d', (int) $force));
        if ($x) array_unshift($list, $x);
    }
    return $list;
}
// Darf in der Halle für diesen Einsatz eingetragen werden? Im Zeitfenster oder nachträglich geöffnet (60 Tage), Liste nicht abgeschlossen
function myf_hall_incident_ok($iid) {
    global $wpdb;
    $now = current_time('timestamp');
    return (bool) $wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('incidents') . " WHERE id = %d AND source <> 'test' AND part_closed IS NULL AND report_closed IS NULL AND start >= %s AND start <= %s",
        (int) $iid, date('Y-m-d H:i:s', $now - myf_hall_open_days() * DAY_IN_SECONDS), date('Y-m-d H:i:s', $now + HOUR_IN_SECONDS)));
}
// Wie lange nach dem Einsatz in der Halle noch nachgetragen werden darf: so lange wie am Handy (Einstellung „Am Handy längstens“), mindestens 1 Tag
function myf_hall_open_days() { return max(1, (int) (myf_hall()['self_days'] ?? 7));
}

// Namen für die Liste in der Halle; gleiche Namen bekommen die Einheit dazu (zwei „Schmidt, Thomas“)
function myf_hall_members() {
    global $wpdb;
    $rows = $wpdb->get_results('SELECT id, name, unit FROM ' . myf_t('members') . " WHERE active = 1 AND (dept = '' OR dept IN ('einsatz','unterstuetzung','jugend')) AND name NOT LIKE '%(Demo-Ansicht)' ORDER BY name"); // Admin-Ansicht der Demo gehört nicht auf die Liste
    $count = array_count_values(array_map(function ($m) { return $m->name; }, $rows));
    $units = function_exists('myf_units') ? myf_units() : [];
    return array_map(function ($m) use ($count, $units) {
        $o = ['id' => (int) $m->id, 'name' => $m->name, 'unit' => (string) $m->unit];
        if ($count[$m->name] > 1) $o['hint'] = $units[$m->unit] ?? $m->unit;
        return $o;
    }, $rows);
}

// Hallen-Dashboard ohne offene Liste: Einsätze dieses Jahr (Anzahl, die letzten), keine Namen, keine Einsatzorte
function myf_hall_overview() {
    global $wpdb;
    $y = (int) current_time('Y');
    $last = $wpdb->get_results($wpdb->prepare('SELECT kind, nr, title, start FROM ' . myf_t('incidents') . " WHERE source <> 'test' AND start <= %s ORDER BY start DESC LIMIT 8", current_time('mysql')));
    // Gleiche Zählung wie das Dashboard (Gewichtung der Einsatzverwaltung, höchste Einsatznummer)
    $st = function_exists('myf_incident_stats') ? (myf_incident_stats(1)[$y] ?? null) : null;
    return ['year' => $y, 'count' => $st ? (int) $st['total'] : (int) $wpdb->get_var($wpdb->prepare('SELECT COUNT(*) FROM ' . myf_t('incidents') . " WHERE source <> 'test' AND kind = 'einsatz' AND YEAR(start) = %d", $y)),
        'last' => array_map(function ($i) { return ['kind' => $i->kind, 'label' => trim(($i->nr ? $i->nr . ' · ' : '') . $i->title), 'start' => $i->start]; }, $last)];
}
// Kacheln für die ruhige Zeit – gleiche Quellen wie das Dashboard im Besprechungsraum
function myf_hall_calm() {
    global $wpdb;
    $y = (int) current_time('Y');
    $st = function_exists('myf_incident_stats') ? (myf_incident_stats(1)[$y] ?? null) : null;
    $dr = function_exists('myf_drills_upcoming') ? (myf_drills_upcoming(1)[0] ?? null) : null; // wie das Dashboard: Kalender + von Hand
    $notes = function_exists('myf_notices_now') ? myf_notices_now() : [];
    foreach ($wpdb->get_results($wpdb->prepare('SELECT title, ends FROM ' . myf_t('board') . ' WHERE on_screen = 1 AND (ends IS NULL OR ends >= %s) ORDER BY created DESC LIMIT 2', current_time('Y-m-d'))) as $b)
        $notes[] = ['text' => 'Aushang: ' . $b->title, 'level' => 'info', 'ends' => $b->ends ? $b->ends . ' 23:59:00' : null];
    return ['stats' => $st ? ['total' => (int) $st['total'], 'months' => array_values($st['months']), 'est' => array_values($st['est'] ?? array_fill(0, 12, 0)), 'cats' => $st['cats']] : null,
        'next_drill' => $dr ? ['date' => $dr['date'], 'time' => (string) ($dr['time'] ?? ''), 'title' => $dr['title'], 'lead' => (string) ($dr['lead'] ?? '')] : null,
        'notices' => array_map(function ($n) { return ['text' => (string) $n['text'], 'level' => (string) ($n['level'] ?? 'info'), 'signature' => (string) ($n['signature'] ?? '')]; }, $notes),
        'out' => array_map(function ($x) { return ['object' => $x->object, 'title' => $x->title]; },
            $wpdb->get_results("SELECT object, title FROM " . myf_t('defects') . " WHERE urgency = 'out' AND status IN ('new','progress') ORDER BY created DESC LIMIT 4")),
        'defects' => (int) $wpdb->get_var('SELECT COUNT(*) FROM ' . myf_t('defects') . " WHERE status IN ('new','progress')")];
}
// Freigegebene Fahrzeugbuchungen: gerade unterwegs und die nächsten 14 Tage (ohne Namen)
function myf_hall_bookings() {
    global $wpdb;
    $now = current_time('mysql');
    return array_map(function ($b) use ($now) { return ['vehicle' => $b->name, 'start' => $b->start, 'end' => $b->end, 'purpose' => $b->purpose, 'now' => $b->start <= $now]; },
        $wpdb->get_results($wpdb->prepare('SELECT b.start, b.end, b.purpose, v.name FROM ' . myf_t('bookings') . ' b JOIN ' . myf_t('vehicles') . " v ON v.id = b.vehicle_id
            WHERE b.status = 'approved' AND b.end >= %s AND b.start <= %s" . myf_screen_veh_sql('v') . " ORDER BY b.start LIMIT 10", $now, date('Y-m-d H:i:s', current_time('timestamp') + 14 * DAY_IN_SECONDS))));
}

// ---- Fahrzeugstatus -----------------------------------------------------------------
// Dashboards (Besprechungsraum, Fahrzeughalle) gehören zu einer Einheit – z. B. nur Löschzug 1, ohne Fahrzeuge des Löschzugs 2.
// Einstellung „screen_unit“: Schlüssel der Einheit oder 'all'; ohne Einstellung die erste Einheit
function myf_screen_unit() {
    $u = (string) (myf_settings()['screen_unit'] ?? '');
    if ($u === 'all' || count(myf_units()) < 2) return '';
    return isset(myf_units()[$u]) ? $u : myf_unit_default();
}
// SQL-Bedingung für Fahrzeuge der Dashboard-Einheit (Spalte unit, optional mit Tabellen-Kürzel)
function myf_screen_veh_sql($alias = '') {
    global $wpdb;
    $u = myf_screen_unit();
    return $u === '' ? '' : $wpdb->prepare(' AND ' . ($alias ? $alias . '.' : '') . 'unit = %s', $u);
}
// Ruhige Zeit: das Dashboard des Besprechungsraums direkt in der Hallenseite (gleiche Daten, gleiche Darstellung –
// kein eingebetteter Rahmen, der auf Tablets auf Inhaltsgröße wächst). Einstellungen wie auf der Dashboard-Seite.
function myf_hall_screen_cfg() {
    $st = myf_settings();
    if (empty($st['screen_on']) || empty($st['screen_key'])) return null;
    $b = myf_brand();
    return ['api' => esc_url_raw(rest_url('myf/v1/screen')), 'key' => $st['screen_key'], 'theme' => $st['screen_theme'],
        'lat' => $st['screen_lat'] === null ? 51.16 : (float) $st['screen_lat'], 'lon' => $st['screen_lon'] === null ? 10.45 : (float) $st['screen_lon'],
        'qrLabel' => $b['qr_label'], 'ver' => MYF_ASSET_VER, 'inHall' => true, 'logoDark' => myf_logo_url('dark'), 'logoLight' => myf_logo_url('light'), 'app' => $b['app'], 'org' => $b['org']];
}
// Protokoll der Statusmeldungen (letzte 30): zeigt in der Verwaltung, ob die Schnittstelle Daten liefert – ohne Schlüssel oder Rohdaten
function myf_status_log_add($result, $name, $st) {
    $log = get_option('myf_status_log', []); if (!is_array($log)) $log = [];
    array_unshift($log, ['t' => current_time('mysql'), 'r' => (string) $result, 'n' => mb_substr((string) $name, 0, 60), 's' => mb_substr((string) $st, 0, 2)]);
    update_option('myf_status_log', array_slice($log, 0, 30), false);
}
function myf_vstatus() { $v = get_option('myf_vehicle_status', []); return is_array($v) ? $v : []; }
function myf_norm_vname($s) { return preg_replace('/[^a-z0-9]/', '', strtolower(remove_accents((string) $s))); }
// Fahrzeug zu einem Namen/Funkrufnamen aus der Alarmierung finden („HLF20“, „Florian Musterstadt 1-HLF20-1“, „1/46-1“ …)
function myf_vehicle_match($name) {
    global $wpdb;
    $n = myf_norm_vname($name);
    if ($n === '') return null;
    $best = null;
    foreach ($wpdb->get_results('SELECT id, name, callsign FROM ' . myf_t('vehicles') . ' WHERE active = 1') as $v) {
        $a = myf_norm_vname($v->name); $b = myf_norm_vname($v->callsign);
        if ($n === $a || ($b !== '' && $n === $b)) return $v;
        if (!$best && (($b !== '' && (strpos($b, $n) !== false || strpos($n, $b) !== false)) || ($a !== '' && strlen($a) >= 3 && strpos($n, $a) !== false))) $best = $v;
    }
    return $best;
}

// ---- Fahrtenbuch -----------------------------------------------------------------------
function myf_trip_out($t) {
    return ['id' => (int) $t->id, 'vehicle_id' => (int) $t->vehicle_id, 'kind' => $t->kind, 'start' => $t->start, 'end' => $t->end, 'driver' => $t->driver,
        'driver_id' => $t->driver_id ? (int) $t->driver_id : null, 'purpose' => $t->purpose, 'km_start' => $t->km_start === null ? null : (int) $t->km_start,
        'km_end' => $t->km_end === null ? null : (int) $t->km_end, 'fuel_l' => $t->fuel_l === null ? null : (float) $t->fuel_l, 'fuel_cost' => $t->fuel_cost === null ? null : (float) $t->fuel_cost,
        'incident_id' => $t->incident_id ? (int) $t->incident_id : null, 'booking_id' => $t->booking_id ? (int) $t->booking_id : null, 'source' => $t->source,
        'storno_of' => $t->storno_of ? (int) $t->storno_of : null, 'storno_reason' => $t->storno_reason, 'by' => $t->by_name, 'created' => $t->created];
}
// Letzter bekannter km-Stand: Fahrtenbuch und Werkstatt-Verlauf
// km-Stand je Fahrzeug: alle Fahrzeuge mit zwei Abfragen je Anfrage (statt zwei je Fahrzeug); $fresh nach einer neuen Fahrt
function myf_vehicle_km($vid, $fresh = false) {
    global $wpdb;
    static $km = [];
    $k = myf_t('');
    if ($fresh || !isset($km[$k])) {
        $km[$k] = [];
        foreach ($wpdb->get_results('SELECT t.vehicle_id v, MAX(t.km_end) km FROM ' . myf_t('trips') . ' t WHERE t.storno_of IS NULL AND t.id NOT IN (SELECT storno_of FROM ' . myf_t('trips') . ' WHERE storno_of IS NOT NULL) GROUP BY t.vehicle_id') as $r) $km[$k][(int) $r->v] = (int) $r->km;
        foreach ($wpdb->get_results('SELECT vehicle_id v, MAX(km) km FROM ' . myf_t('vehicle_log') . ' GROUP BY vehicle_id') as $r) $km[$k][(int) $r->v] = max($km[$k][(int) $r->v] ?? 0, (int) $r->km);
    }
    return ($km[$k][(int) $vid] ?? 0) ?: null;
}
// Eine Fahrt eintragen (App, Terminal oder Verwaltung) – prüft km plausibel
function myf_trip_add(array $in, $source, $byName) {
    global $wpdb;
    $v = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('vehicles') . ' WHERE id = %d', (int) ($in['vehicle_id'] ?? 0)));
    if (!$v) return myf_err('Fahrzeug nicht gefunden.', 404);
    $kind = isset(MYF_TRIP_KINDS[$in['kind'] ?? '']) ? $in['kind'] : 'dienst';
    $start = myf_dt_param($in['start'] ?? '') ?: current_time('mysql');
    $last = myf_vehicle_km($v->id, true); // immer aktuell prüfen
    $kmEnd = isset($in['km_end']) && $in['km_end'] !== '' && $in['km_end'] !== null ? (int) $in['km_end'] : null;
    $kmStart = isset($in['km_start']) && $in['km_start'] !== '' && $in['km_start'] !== null ? (int) $in['km_start'] : $last;
    if ($kmEnd === null && $kind !== 'tanken') return myf_err('Bitte den km-Stand am Ende der Fahrt eintragen.');
    if ($kmEnd !== null && $kmStart !== null && $kmEnd < $kmStart) return myf_err('Der km-Stand am Ende ist kleiner als am Anfang (' . number_format($kmStart, 0, ',', '.') . ' km) – bitte prüfen.');
    if ($kmEnd !== null && $kmStart !== null && $kmEnd - $kmStart > 2000) return myf_err('Mehr als 2.000 km für eine Fahrt? Bitte den km-Stand prüfen.');
    // Nachtragen älterer Fahrten bleibt möglich, ein ganz anderer Stand ist ein Tippfehler
    if ($kmEnd !== null && $last !== null && $kmEnd < $last - 5000) return myf_err('Der km-Stand liegt weit unter dem letzten Stand (' . number_format($last, 0, ',', '.') . ' km) – bitte prüfen.');
    $driverId = (int) ($in['driver_id'] ?? 0);
    $driver = $driverId ? (string) $wpdb->get_var($wpdb->prepare('SELECT name FROM ' . myf_t('members') . ' WHERE id = %d', $driverId)) : mb_substr(sanitize_text_field((string) ($in['driver'] ?? '')), 0, 120);
    if ($driver === '') return myf_err('Bitte Fahrer/in angeben – im Fahrtenbuch Pflicht.');
    $row = ['vehicle_id' => (int) $v->id, 'kind' => $kind, 'start' => $start, 'end' => myf_dt_param($in['end'] ?? '') ?: null, 'driver_id' => $driverId ?: null, 'driver' => $driver,
        'purpose' => mb_substr(sanitize_text_field((string) ($in['purpose'] ?? '')), 0, 200), 'km_start' => $kmStart, 'km_end' => $kmEnd,
        'fuel_l' => isset($in['fuel_l']) && $in['fuel_l'] !== '' ? round((float) str_replace(',', '.', (string) $in['fuel_l']), 2) : null,
        'fuel_cost' => isset($in['fuel_cost']) && $in['fuel_cost'] !== '' ? round((float) str_replace(',', '.', (string) $in['fuel_cost']), 2) : null,
        'incident_id' => (int) ($in['incident_id'] ?? 0) ?: null, 'booking_id' => (int) ($in['booking_id'] ?? 0) ?: null,
        'source' => $source, 'by_name' => $byName, 'created' => current_time('mysql')];
    $wpdb->insert(myf_t('trips'), $row);
    return ['id' => (int) $wpdb->insert_id, 'km' => $kmEnd];
}
function myf_trip_storno($id, $reason, $byName) {
    global $wpdb;
    $t = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('trips') . ' WHERE id = %d AND storno_of IS NULL', (int) $id));
    if (!$t) return myf_err('Fahrt nicht gefunden.', 404);
    if ($wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('trips') . ' WHERE storno_of = %d', $t->id))) return myf_err('Schon storniert.');
    $reason = mb_substr(sanitize_text_field((string) $reason), 0, 200);
    if ($reason === '') return myf_err('Bitte einen Grund angeben.');
    $wpdb->insert(myf_t('trips'), ['vehicle_id' => $t->vehicle_id, 'kind' => $t->kind, 'start' => $t->start, 'storno_of' => $t->id, 'storno_reason' => $reason,
        'source' => 'verwaltung', 'by_name' => $byName, 'created' => current_time('mysql')]);
    return ['ok' => true];
}
// Offene Fahrten: Einsätze/Übungen (Fahrzeuge mit Zeiten) und beendete Fahrzeug-Anfragen der letzten 30 Tage ohne Fahrtenbuch-Eintrag
function myf_trips_open() {
    global $wpdb;
    $since = date('Y-m-d H:i:s', current_time('timestamp') - 30 * DAY_IN_SECONDS);
    $have = [];
    foreach ($wpdb->get_results($wpdb->prepare('SELECT vehicle_id, incident_id, booking_id FROM ' . myf_t('trips') . ' WHERE storno_of IS NULL AND created >= %s', date('Y-m-d H:i:s', current_time('timestamp') - 60 * DAY_IN_SECONDS))) as $t) {
        if ($t->incident_id) $have['i' . $t->incident_id . '-' . $t->vehicle_id] = 1;
        if ($t->booking_id) $have['b' . $t->booking_id] = 1;
    }
    $open = [];
    foreach ($wpdb->get_results($wpdb->prepare('SELECT id, kind, nr, title, start, vehicles FROM ' . myf_t('incidents') . " WHERE source <> 'test' AND start >= %s ORDER BY start DESC", $since)) as $i) {
        foreach ((json_decode((string) $i->vehicles, true) ?: []) as $vv) {
            $v = myf_vehicle_match($vv['v'] ?? '');
            if (!$v || isset($have['i' . $i->id . '-' . $v->id])) continue;
            $open[] = ['type' => 'incident', 'incident_id' => (int) $i->id, 'vehicle_id' => (int) $v->id, 'vehicle' => $v->name, 'kind' => $i->kind === 'uebung' ? 'uebung' : 'einsatz',
                'label' => trim(($i->nr ? $i->nr . ' ' : '') . $i->title), 'start' => $i->start];
        }
    }
    foreach ($wpdb->get_results($wpdb->prepare('SELECT b.id, b.vehicle_id, b.start, b.end, b.purpose, b.driver, v.name FROM ' . myf_t('bookings') . ' b JOIN ' . myf_t('vehicles') . " v ON v.id = b.vehicle_id
        WHERE b.status = 'approved' AND b.end >= %s AND b.end <= %s ORDER BY b.end DESC", $since, current_time('mysql'))) as $b) {
        if (isset($have['b' . $b->id])) continue;
        $open[] = ['type' => 'booking', 'booking_id' => (int) $b->id, 'vehicle_id' => (int) $b->vehicle_id, 'vehicle' => $b->name, 'kind' => 'verein', 'label' => $b->purpose ?: 'Fahrzeug-Anfrage',
            'start' => $b->start, 'driver' => $b->driver];
    }
    return $open;
}

// ---- Verwaltung: Daten und Routen ----------------------------------------------------
add_filter('myf_admin_state', function ($d) {
    global $wpdb;
    $h = myf_hall();
    if (function_exists('myf_has_area') && (myf_has_area('screen') || myf_has_area('incidents'))) {
        $d['hall'] = ['on' => $h['on'], 'url' => myf_hall_url(), 'window' => $h['window'], 'limit' => $h['limit'], 'on_screen' => $h['on_screen'], 'self_days' => $h['self_days'],
            'status_url' => esc_url_raw(rest_url('myf/v1/status')), 'status_log' => array_values((array) get_option('myf_status_log', []))];
    }
    if (function_exists('myf_has_area') && myf_has_area('vehicles')) {
        $d['trips'] = array_map('myf_trip_out', $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . myf_t('trips') . ' WHERE start >= %s ORDER BY start DESC, id DESC LIMIT 1500',
            date('Y-01-01', strtotime('-1 year', current_time('timestamp'))))));
        $d['trips_open'] = myf_trips_open();
        $d['trip_kinds'] = MYF_TRIP_KINDS;
        $d['vehicle_km'] = [];
        foreach ($wpdb->get_col('SELECT id FROM ' . myf_t('vehicles')) as $vid) $d['vehicle_km'][(int) $vid] = myf_vehicle_km((int) $vid);
    }
    $d['vstatus'] = myf_vstatus();
    $d['fms'] = MYF_FMS;
    return $d;
}, 22);

// Mitglied: offene Fahrten der eigenen Fahrzeug-Anfragen, Fahrzeuge fürs Fahrtenbuch
add_filter('myf_me_data', function ($data, $me) {
    global $wpdb;
    $h = myf_hall();
    $data['hall_limit'] = $h['on'] ? $h['limit'] : '';
    $data['hall_window'] = $h['window'];
    $data['self_days'] = $h['self_days'];
    // Fahrzeugseite (ein QR-Code je Fahrzeug): Status, km, und was man dort tun kann
    $vs = myf_vstatus();
    $data['vehicles_hub'] = array_map(function ($v) use ($vs) {
        $f = $vs[(int) $v->id] ?? null;
        return ['id' => (int) $v->id, 'name' => $v->name, 'bookable' => (bool) $v->bookable, 'ready' => $v->status === 'ready',
            'fms' => $f ? ['s' => (string) $f['s'], 'text' => MYF_FMS[$f['s']] ?? '', 't' => $f['t']] : null, 'km' => myf_vehicle_km((int) $v->id)];
    }, $wpdb->get_results('SELECT id, name, bookable, status FROM ' . myf_t('vehicles') . ' WHERE active = 1 ORDER BY name'));
    if (function_exists('myf_member_can') && myf_member_can('trips')) {
        $data['trip_vehicles'] = array_map(function ($v) { return ['id' => (int) $v->id, 'name' => $v->name, 'km' => myf_vehicle_km((int) $v->id)]; },
            $wpdb->get_results('SELECT id, name FROM ' . myf_t('vehicles') . ' WHERE active = 1 ORDER BY name'));
        $data['trip_kinds'] = MYF_TRIP_KINDS;
        $data['my_trips'] = array_map('myf_trip_out', $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . myf_t('trips') . ' WHERE driver_id = %d AND storno_of IS NULL ORDER BY start DESC LIMIT 10', $me->id)));
        $data['trips_open_mine'] = array_values(array_filter(myf_trips_open(), function ($o) use ($me, $wpdb) {
            return $o['type'] === 'booking' && (int) $wpdb->get_var($wpdb->prepare('SELECT member_id FROM ' . myf_t('bookings') . ' WHERE id = %d', $o['booking_id'])) === (int) $me->id;
        }));
    }
    return $data;
}, 10, 2);

add_action('rest_api_init', function () {
    $ns = 'myf/v1';
    // Einstellungen Terminal (Bereich Einsätze)
    register_rest_route($ns, '/admin/hall', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
        $s = get_option('myf_settings', []);
        if (!is_array($s)) $s = [];
        if ($req->has_param('on')) $s['hall_on'] = (bool) $req->get_param('on');
        if ($req->has_param('window')) $s['hall_window'] = max(1, min(72, (int) $req->get_param('window')));
        if ($req->has_param('limit')) $s['hall_limit'] = in_array($req->get_param('limit'), ['window', 'terminal'], true) ? $req->get_param('limit') : '';
        if ($req->has_param('on_screen')) $s['hall_on_screen'] = (bool) $req->get_param('on_screen');
        if ($req->has_param('self_days')) $s['hall_self_days'] = max(1, min(60, (int) $req->get_param('self_days')));
        if ($req->get_param('new_key') || (!empty($s['hall_on']) && empty($s['hall_key']))) $s['hall_key'] = wp_generate_password(24, false);
        update_option('myf_settings', $s);
        return ['ok' => true, 'url' => myf_hall_url()];
    }]);
    // Fahrtenbuch (Bereich Fahrzeuge)
    register_rest_route($ns, '/admin/vehicle/trip', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
        if ($req->get_param('storno')) return myf_trip_storno($req->get_param('storno'), $req->get_param('reason'), myf_actor());
        return myf_trip_add($req->get_params(), 'verwaltung', myf_actor());
    }]);
    // Fahrzeugstatus manuell setzen (z. B. 6 = nicht einsatzbereit) – Bereich Fahrzeuge
    register_rest_route($ns, '/admin/vehicle/fms', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
        $vid = (int) $req->get_param('id');
        $st = (string) $req->get_param('status');
        $all = myf_vstatus();
        if ($st === '') unset($all[$vid]); elseif (isset(MYF_FMS[$st])) $all[$vid] = ['s' => $st, 't' => current_time('mysql'), 'by' => myf_actor()];
        update_option('myf_vehicle_status', $all, false);
        return ['ok' => true];
    }]);
    // Mitglied: Fahrt eintragen (Recht „Fahrtenbuch“)
    register_rest_route($ns, '/me/trip', ['methods' => 'POST', 'permission_callback' => myf_perm('trips'), 'callback' => function (WP_REST_Request $req) {
        $me = myf_me();
        if (!$me) return myf_err('Dein Konto ist keinem Mitglied zugeordnet.', 403);
        $in = $req->get_params();
        $in['driver_id'] = $me->id;
        if (!empty($in['booking_id'])) {
            global $wpdb;
            $own = (int) $wpdb->get_var($wpdb->prepare('SELECT member_id FROM ' . myf_t('bookings') . ' WHERE id = %d', (int) $in['booking_id']));
            if ($own !== (int) $me->id) $in['booking_id'] = 0;
        }
        unset($in['incident_id']);
        return myf_trip_add($in, 'app', $me->name);
    }]);

    // Fahrzeugstatus von außen (Alamos FE2 o. ä.) – gleicher Schlüssel wie die Alarm-Schnittstelle
    register_rest_route($ns, '/status', ['methods' => ['GET', 'POST'], 'permission_callback' => '__return_true', 'callback' => function (WP_REST_Request $req) {
        $a = function_exists('myf_alarm_settings') ? myf_alarm_settings() : ['on' => false, 'key' => ''];
        $key = (string) ($req->get_param('key') ?: $req->get_header('x-wehrwerk-key'));
        if (!$a['on'] || $a['key'] === '' || !hash_equals($a['key'], $key)) return new WP_Error('myf_status', 'Nicht freigegeben.', ['status' => 403]);
        $rk = 'myf_status_rate_' . current_time('YmdH'); $n = (int) get_transient($rk);
        if ($n > 1200) return new WP_Error('myf_status', 'Zu viele Anfragen.', ['status' => 429]);
        set_transient($rk, $n + 1, 2 * HOUR_IN_SECONDS);
        $p = ($req->get_json_params() ?: []) + $req->get_body_params() + $req->get_query_params();
        $flat = function_exists('myf_alarm_flatten') ? myf_alarm_flatten($p) : $p;
        $pick = function ($keys) use ($flat) { foreach ($flat as $k => $v) { $kk = strtolower(preg_replace('/^.*[.\/]/', '', (string) $k)); if (in_array($kk, $keys, true) && is_scalar($v) && trim((string) $v) !== '') return trim((string) $v); } return ''; };
        $name = $pick(['vehicle', 'fahrzeug', 'callsign', 'funkrufname', 'radioname', 'name', 'unit', 'einheit', 'address', 'adresse', 'kennung']);
        $st = preg_replace('/\D/', '', $pick(['status', 'fms', 'fmsstatus', 'state', 'statuscode']));
        if ($name === '' || !isset(MYF_FMS[$st])) { myf_status_log_add('unvollständig', $name, $st); return new WP_REST_Response(['ok' => false, 'error' => 'Fahrzeug und Status (1–9) angeben, z. B. {"fahrzeug":"HLF 20","status":"3"}.'], 400); }
        $v = myf_vehicle_match($name);
        if (!$v) myf_status_log_add('Fahrzeug unbekannt', $name, $st);
        if (!$v) return new WP_REST_Response(['ok' => false, 'error' => 'Fahrzeug „' . $name . '“ nicht gefunden – Name oder Funkrufname unter Technik → Fahrzeuge eintragen.'], 404);
        $all = myf_vstatus();
        $all[(int) $v->id] = ['s' => $st, 't' => current_time('mysql'), 'by' => 'Schnittstelle'];
        update_option('myf_vehicle_status', $all, false);
        myf_status_log_add('ok', $v->name, $st);
        return ['ok' => true, 'vehicle' => $v->name, 'status' => $st, 'text' => MYF_FMS[$st]];
    }]);

    // ---- Terminal in der Halle (ohne Login, nur mit Gerätelink) ----
    register_rest_route($ns, '/hall', ['methods' => 'GET', 'permission_callback' => '__return_true', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        if (!myf_hall_key_ok((string) $req->get_param('key'))) return myf_err('Dashboard nicht freigegeben.', 403);
        nocache_headers();
        $natural = array_map(function ($i) { return (int) $i->id; }, myf_hall_incidents());
        $force = (int) $req->get_param('inc');
        $incs = myf_hall_incidents($force);
        $ids = array_map(function ($i) { return (int) $i->id; }, $incs);
        $now = current_time('timestamp');
        $parts = $ids ? $wpdb->get_results('SELECT incident_id, member_id, vehicle, role, confirmed, t_start, t_end, as_minutes FROM ' . myf_t('participation') . ' WHERE incident_id IN (' . implode(',', $ids) . ')') : [];
        $vs = myf_vstatus();
        $tripsDone = [];
        if ($ids) foreach ($wpdb->get_results('SELECT incident_id, vehicle_id, km_end FROM ' . myf_t('trips') . ' WHERE storno_of IS NULL AND incident_id IN (' . implode(',', $ids) . ')') as $t) $tripsDone[$t->incident_id . '-' . $t->vehicle_id] = (int) $t->km_end;
        return [
            'now' => current_time('c'), 'window' => myf_hall()['window'], 'demo' => myf_demo_ctx(), 'ver' => MYF_ASSET_VER,
            'forced' => $force && !in_array($force, $natural, true) && in_array($force, $ids, true) ? $force : 0, // von Hand geöffnet (außerhalb des Zeitfensters)
            // Ruhige Zeit (keine Liste offen): Wetter, amtliche Warnungen und QR-Code zum Mitgliederbereich wie im Besprechungsraum
            'weather' => $incs || !function_exists('myf_weather') ? null : myf_weather(), 'warnings' => $incs || !function_exists('myf_warnings') ? [] : myf_warnings(),
            'portal' => add_query_arg('seite', 'profil', myf_member_page_url()), 'qr_label' => myf_brand()['qr_label'],
            'incidents' => array_map(function ($i) use ($wpdb) { return ['id' => (int) $i->id, 'kind' => $i->kind, 'label' => trim(($i->nr ? $i->nr . ' · ' : '') . $i->title), 'start' => $i->start, 'unit' => (string) $i->unit,
                // letzte Änderung an der Liste (für „automatisch zurück zur Ruhe“)
                'last_change' => (string) $wpdb->get_var($wpdb->prepare('SELECT MAX(COALESCE(updated, created)) FROM ' . myf_t('participation') . ' WHERE incident_id = %d', (int) $i->id)),
                'place' => trim((string) explode(',', (string) $i->place)[0]), // Straße zur Unterscheidung gleicher Stichworte (Unwetter)
                // Koordinaten aus der Alarmierung für die kleine Karte (nur die Zahlen, keine Adresse nach draußen)
                'lat' => isset($i->alarm_lat) && $i->alarm_lat !== null ? (float) $i->alarm_lat : null, 'lng' => isset($i->alarm_lng) && $i->alarm_lng !== null ? (float) $i->alarm_lng : null,
                'vehicles' => array_values(array_filter(array_map(function ($v) { return $v['v'] ?? ''; }, json_decode((string) $i->vehicles, true) ?: [])))]; }, $incs),
            // nur Namen (wie auf der Papierliste), keine weiteren Daten
            'members' => myf_hall_members(), 'units' => myf_units(),
            'parts' => array_map(function ($p) { return ['incident_id' => (int) $p->incident_id, 'member_id' => (int) $p->member_id, 'vehicle' => $p->vehicle, 'role' => $p->role, 'confirmed' => (bool) $p->confirmed,
                't_start' => $p->t_start ? substr($p->t_start, 11, 5) : '', 't_end' => $p->t_end ? substr($p->t_end, 11, 5) : '', 'as_minutes' => (int) $p->as_minutes,
                // Bescheinigung nur als Stand (keine Geburtsdaten o. Ä. auf dem Hallen-Bildschirm)
                // Uhrzeit der Arbeitsaufnahme nur, solange die Anfrage offen ist (zum Ändern im eigenen Fenster); danach nur noch der Stand
                'cert' => (string) $p->cert, 'work_resume' => $p->cert === 'requested' && !$p->confirmed ? (string) $p->work_resume : '']; }, $parts),
            'part_vehicles' => array_merge(myf_incident_vehicles(), MYF_PART_EXTRA), 'part_extra' => MYF_PART_EXTRA, 'roles' => MYF_PART_ROLES,
            // Einheit je Fahrzeug: in der Liste nur die Fahrzeuge der Einheit des Einsatzes (z. B. kein LF 10 des Löschzugs 2 beim Löschzug 1)
            'veh_units' => (object) array_column(array_map(function ($v) { return [$v->name, (string) $v->unit]; }, $wpdb->get_results('SELECT name, unit FROM ' . myf_t('vehicles') . ' WHERE active = 1')), 1, 0),
            'overview' => myf_hall_overview(), 'bookings' => myf_hall_bookings(),
            // Ruhige Zeit: dieselben Kacheln wie im Besprechungsraum (Statistik, nächster Dienst, Hinweise, außer Dienst) – ohne Namen
            'calm' => $incs ? null : myf_hall_calm(),
            'vehicles' => array_map(function ($v) use ($vs, $wpdb) {
                $s = $vs[(int) $v->id] ?? null;
                $lt = $wpdb->get_row($wpdb->prepare('SELECT start, km_end FROM ' . myf_t('trips') . ' WHERE vehicle_id = %d AND storno_of IS NULL ORDER BY start DESC LIMIT 1', (int) $v->id));
                return ['id' => (int) $v->id, 'name' => $v->name, 'status' => $v->status, 'fms' => $s ? $s['s'] : '', 'fms_text' => $s ? MYF_FMS[$s['s']] : '', 'fms_at' => $s ? $s['t'] : null, 'km' => myf_vehicle_km((int) $v->id),
                    'last_trip' => $lt ? ['date' => substr($lt->start, 0, 10), 'km' => $lt->km_end !== null ? (int) $lt->km_end : null] : null]; // letzte Fahrt (ohne Namen)
            }, $wpdb->get_results('SELECT id, name, status FROM ' . myf_t('vehicles') . ' WHERE active = 1' . myf_screen_veh_sql() . ' ORDER BY name')),
            'trips_done' => $tripsDone, 'legal' => function_exists('myf_legal_links') ? myf_legal_links() : [],
            // Ziele der letzten Fahrten ohne Einsatz (für die Vorschläge beim Tippen) – ohne die reinen Art-Bezeichnungen
            // „Anwesenheit eintragen“: nur Einsätze, bei denen Eintragen noch geht (Liste und Bericht offen, innerhalb der Frist)
            'recent' => array_map(function ($i) { return ['id' => (int) $i->id, 'kind' => $i->kind, 'label' => trim(($i->nr ? $i->nr . ' · ' : '') . $i->title), 'start' => $i->start, 'closed' => false]; },
                $wpdb->get_results($wpdb->prepare('SELECT id, kind, nr, title, start FROM ' . myf_t('incidents') . " WHERE source <> 'test' AND kind IN ('einsatz','uebung') AND part_closed IS NULL AND report_closed IS NULL AND start >= %s AND start <= %s ORDER BY start DESC LIMIT 12",
                    date('Y-m-d H:i:s', $now - myf_hall_open_days() * DAY_IN_SECONDS), date('Y-m-d H:i:s', $now + HOUR_IN_SECONDS)))),
            'open_days' => myf_hall_open_days(),
            // Fahrersuche: wer zuletzt gefahren ist, steht vorn
            'recent_drivers' => array_map('intval', $wpdb->get_col('SELECT driver_id FROM ' . myf_t('trips') . ' WHERE driver_id IS NOT NULL AND storno_of IS NULL GROUP BY driver_id ORDER BY MAX(id) DESC LIMIT 8')),
            'trip_purposes' => array_values(array_diff($wpdb->get_col('SELECT purpose FROM ' . myf_t('trips') . " WHERE incident_id IS NULL AND storno_of IS NULL AND purpose <> '' GROUP BY purpose ORDER BY MAX(id) DESC LIMIT 30"), MYF_TRIP_KINDS)),
        ];
    }]);
    register_rest_route($ns, '/hall/part', ['methods' => 'POST', 'permission_callback' => '__return_true', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        if (!myf_hall_key_ok((string) $req->get_param('key'))) return myf_err('Dashboard nicht freigegeben.', 403);
        // Schutz vor Missbrauch: je volle Stunde höchstens 1000 Eintragungen (100 Leute × mehrere Änderungen passen locker)
        $rk = 'myf_hall_rate_' . current_time('YmdH'); $n = (int) get_transient($rk);
        if ($n > 1000) return myf_err('Zu viele Eintragungen – bitte kurz warten.', 429);
        set_transient($rk, $n + 1, 2 * HOUR_IN_SECONDS);
        $iid = (int) $req->get_param('incident_id'); $mid = (int) $req->get_param('member_id');
        if (!myf_hall_incident_ok($iid)) return myf_err('Die Liste für diesen Einsatz ist geschlossen – bitte bei der Einsatzführung melden.');
        $m = $wpdb->get_row($wpdb->prepare('SELECT id, name FROM ' . myf_t('members') . ' WHERE id = %d AND active = 1', $mid));
        if (!$m) return myf_err('Mitglied nicht gefunden.', 404);
        $row = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('participation') . ' WHERE incident_id = %d AND member_id = %d', $iid, $mid));
        if ($req->get_param('remove')) {
            if (!$row) return ['ok' => true];
            if ($row->confirmed || in_array($row->cert, ['issued', 'handed'], true)) return myf_err('Schon von der Einsatzführung bestätigt – bitte dort melden.');
            $wpdb->delete(myf_t('participation'), ['id' => $row->id]);
            myf_audit_write('terminal', 0, 'Dashboard Fahrzeughalle', 'remove', 'participation', (int) $row->id, ['incident_id' => $iid, 'member' => $m->name]);
            return ['ok' => true];
        }
        $veh = sanitize_text_field((string) $req->get_param('vehicle'));
        if (!in_array($veh, array_merge(myf_incident_vehicles(), MYF_PART_EXTRA), true)) return myf_err('Bitte ein Fahrzeug wählen.');
        if ($row && $row->confirmed) return myf_err('Schon bestätigt – Änderungen bitte über die Einsatzführung.');
        $role = myf_part_role((string) $req->get_param('role'));
        $upd = ['vehicle' => $veh, 'role' => $role];
        // Wie auf dem Zettel: abweichende Einsatzzeit (nur wenn anders als das Fahrzeug); Atemschutz-Minuten kommen aus der Atemschutzüberwachung
        $istart = (string) $wpdb->get_var($wpdb->prepare('SELECT start FROM ' . myf_t('incidents') . ' WHERE id = %d', $iid));
        $tm = function ($v, $after = null) use ($istart) {
            if (!preg_match('/^([01]?\d|2[0-3]):([0-5]\d)$/', (string) $v, $mm)) return null;
            $day = substr($istart, 0, 10); $dt = $day . ' ' . str_pad($mm[1], 2, '0', STR_PAD_LEFT) . ':' . $mm[2] . ':00';
            if (strtotime($dt) < strtotime($istart) - 6 * HOUR_IN_SECONDS) $dt = date('Y-m-d H:i:s', strtotime($dt) + DAY_IN_SECONDS); // nach Mitternacht
            if ($after && strtotime($dt) < strtotime($after)) $dt = date('Y-m-d H:i:s', strtotime($dt) + DAY_IN_SECONDS);
            return $dt;
        };
        if ($req->has_param('t_start')) $upd['t_start'] = $tm($req->get_param('t_start'));
        if ($req->has_param('t_end')) $upd['t_end'] = $tm($req->get_param('t_end'), $upd['t_start'] ?? ($row->t_start ?? null));
        // Tippfehler abfangen (z. B. 10:20 bis 09:00 = fast 23 Stunden) – landet sonst so auf der Bescheinigung für den Arbeitgeber
        $ts = $upd['t_start'] ?? ($row->t_start ?? null); $te = $upd['t_end'] ?? ($row->t_end ?? null);
        if ($ts && $te && strtotime($te) - strtotime($ts) > 16 * HOUR_IN_SECONDS) return myf_err('Bitte die Zeiten prüfen: von ' . substr($ts, 11, 5) . ' bis ' . substr($te, 11, 5) . ' wären über 16 Stunden.');
        // Verdienstausfall gleich mit anfragen: nur „angefragt“ setzen/zurücknehmen – drucken und unterschreiben macht die Einsatzführung
        $certNew = false;
        if ($req->has_param('cert') && !($row && in_array($row->cert, ['issued', 'handed'], true))) {
            $upd['cert'] = $req->get_param('cert') ? 'requested' : '';
            $w = (string) $req->get_param('work_resume');
            $upd['work_resume'] = $upd['cert'] ? ($w === 'none' ? 'none' : (preg_match('/^\d{1,2}:\d{2}$/', $w) ? $w : '')) : '';
            $certNew = $upd['cert'] === 'requested' && (!$row || $row->cert === '');
        }
        if ($row) $wpdb->update(myf_t('participation'), $upd + ['updated' => current_time('mysql')], ['id' => $row->id]);
        else $wpdb->insert(myf_t('participation'), $upd + ['incident_id' => $iid, 'member_id' => $mid, 'source' => 'terminal', 'created' => current_time('mysql')]);
        myf_audit_write('terminal', 0, 'Dashboard Fahrzeughalle', $row ? 'update' : 'create', 'participation', $row ? (int) $row->id : (int) $wpdb->insert_id, ['incident_id' => $iid, 'member' => $m->name, 'vehicle' => $veh, 'role' => $role] + array_intersect_key($upd, ['t_start' => 1, 't_end' => 1]));
        // erst nach dem Protokoll (das braucht die ID der neuen Beteiligung)
        if ($certNew) {
            $inc = $wpdb->get_row($wpdb->prepare('SELECT id, nr, title, start FROM ' . myf_t('incidents') . ' WHERE id = %d', $iid));
            $certMiss = function_exists('myf_cert_missing') ? myf_cert_missing($wpdb->get_row($wpdb->prepare('SELECT birth_date, birth_place, street FROM ' . myf_t('members') . ' WHERE id = %d', $mid))) : [];
            myf_notify_area('incidents', 'cert', 'Bescheinigung für den Arbeitgeber angefragt', $m->name . ' – ' . trim(($inc->nr ? $inc->nr . ' ' : '') . $inc->title) . ' am ' . date('d.m.Y', strtotime($inc->start)) . ' (in der Halle, Teilnahme noch bestätigen)', 'admin:cert', 'cert:' . $iid . ':' . $mid);
        }
        // Nur die Namen der fehlenden Felder (nie Werte) – das Tablet erinnert ans Profil
        return ['ok' => true, 'cert_missing' => $certNew ? ($certMiss ?? []) : []];
    }]);
    // Einsatz von der Halle anlegen, wenn der Alarm dort nicht angekommen ist: nur Stichwort und Zeit; die Verwaltung sieht
    // „von der Halle angelegt“, der Bericht der Website wird später automatisch verknüpft (gleiche Alarmzeit ±45 Minuten)
    register_rest_route($ns, '/hall/incident', ['methods' => 'POST', 'permission_callback' => '__return_true', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        if (!myf_hall_key_ok((string) $req->get_param('key'))) return myf_err('Dashboard nicht freigegeben.', 403);
        $title = mb_substr(sanitize_text_field((string) $req->get_param('title')), 0, 120);
        if (mb_strlen($title) < 3) return myf_err('Bitte ein Stichwort angeben (z. B. „Hilfe P-Tür“).');
        $start = myf_dt_param((string) $req->get_param('start')) ?: current_time('mysql');
        if (strtotime($start) > current_time('timestamp') + HOUR_IN_SECONDS || strtotime($start) < current_time('timestamp') - 60 * DAY_IN_SECONDS) return myf_err('Die Alarmzeit muss in den letzten 60 Tagen liegen.');
        // Gibt es den Einsatz schon (gleiche Zeit ±45 Minuten)? Dann den nehmen statt einen zweiten anzulegen
        $have = $wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('incidents') . " WHERE kind = 'einsatz' AND source <> 'test' AND start BETWEEN %s AND %s ORDER BY ABS(TIMESTAMPDIFF(SECOND, start, %s)) LIMIT 1",
            date('Y-m-d H:i:s', strtotime($start) - 45 * MINUTE_IN_SECONDS), date('Y-m-d H:i:s', strtotime($start) + 45 * MINUTE_IN_SECONDS), $start));
        if ($have) return ['id' => (int) $have, 'existing' => true];
        $wpdb->insert(myf_t('incidents'), ['kind' => 'einsatz', 'nr' => '', 'title' => $title, 'category' => function_exists('myf_incident_cat') ? myf_incident_cat($title) : 'sonst', 'start' => $start,
            'unit' => function_exists('myf_screen_unit') ? myf_screen_unit() : '', 'source' => 'terminal', 'created' => current_time('mysql'), 'created_by' => 'Dashboard Fahrzeughalle']);
        $id = (int) $wpdb->insert_id;
        myf_audit_write('terminal', 0, 'Dashboard Fahrzeughalle', 'create', 'incident', $id, ['title' => $title, 'start' => $start]);
        delete_transient('myf_inc_sync');
        return ['id' => $id];
    }]);
    // Fahrzeugstatus von Hand aus der Halle („ist zurück“): nur mit Hallen-Schlüssel, protokolliert mit Quelle „Halle“
    register_rest_route($ns, '/hall/fms', ['methods' => 'POST', 'permission_callback' => '__return_true', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        if (!myf_hall_key_ok((string) $req->get_param('key'))) return myf_err('Nicht freigegeben.', 403);
        $id = (int) $req->get_param('id'); $st = (string) $req->get_param('status');
        if (!isset(MYF_FMS[$st]) || !$wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('vehicles') . ' WHERE id = %d AND active = 1', $id))) return myf_err('Fahrzeug oder Status unbekannt.');
        $vs = myf_vstatus(); $vs[$id] = ['s' => $st, 't' => current_time('mysql'), 'by' => 'Halle'];
        update_option('myf_vehicle_status', $vs, false);
        return ['ok' => true];
    }]);
    register_rest_route($ns, '/hall/trip', ['methods' => 'POST', 'permission_callback' => '__return_true', 'callback' => function (WP_REST_Request $req) {
        if (!myf_hall_key_ok((string) $req->get_param('key'))) return myf_err('Dashboard nicht freigegeben.', 403);
        $in = $req->get_params();
        $iid = (int) ($in['incident_id'] ?? 0);
        $inc = null;
        foreach (myf_hall_incidents($iid) as $i) if ((int) $i->id === $iid) $inc = $i;
        $in['incident_id'] = $inc ? $inc->id : 0;
        // Ohne Einsatz (Werkstatt, Tanken, Übung …): Zweck wie am Tablet gewählt
        $in['kind'] = $inc ? ($inc->kind === 'uebung' ? 'uebung' : 'einsatz') : (isset(MYF_TRIP_KINDS[$in['kind'] ?? '']) && ($in['kind'] ?? '') !== 'einsatz' ? $in['kind'] : 'dienst');
        $in['start'] = $inc ? $inc->start : '';
        // Ziel/Anlass wie am Tablet getippt, sonst die gewählte Art (Werkstatt, Tanken …)
        $in['purpose'] = $inc ? trim(($inc->nr ? $inc->nr . ' ' : '') . $inc->title) : (mb_substr(sanitize_text_field((string) ($in['purpose'] ?? '')), 0, 200) ?: MYF_TRIP_KINDS[$in['kind']]);
        $r = myf_trip_add($in, 'terminal', 'Dashboard Fahrzeughalle');
        if (!is_wp_error($r)) myf_audit_write('terminal', 0, 'Dashboard Fahrzeughalle', 'create', 'trip', $r['id'], ['vehicle_id' => (int) $in['vehicle_id'], 'km_end' => $r['km']]);
        return $r;
    }]);
});

// Terminal-Seite (Vollbild, ohne Theme)
add_action('template_redirect', function () {
    if (!isset($_GET['myf_halle'])) return;
    $key = sanitize_text_field(wp_unslash($_GET['myf_halle']));
    nocache_headers();
    header('X-Robots-Tag: noindex, nofollow');
    header('Referrer-Policy: no-referrer');
    if (!myf_hall_key_ok($key)) { status_header(403); echo 'Dashboard nicht freigegeben.'; exit; }
    $b = myf_brand();
    $cfg = wp_json_encode(['api' => esc_url_raw(rest_url('myf/v1/hall')), 'key' => $key, 'ver' => MYF_ASSET_VER, 'org' => $b['org'], 'app' => $b['app'], 'logo' => myf_logo_url('light'), 'logoDark' => myf_logo_url('dark'), 'fms' => MYF_FMS,
        // Tag/Nacht wie das Dashboard im Besprechungsraum: gleiche Einstellung und Standort
        // Ruhige Zeit: das Dashboard des Besprechungsraums (gleiche Daten, gleiche Darstellung) – die Halle legt nur ihre Funktionen darüber
        'screenCfg' => myf_hall_screen_cfg(),
        'tripKinds' => (object) array_merge(...array_map(function ($k) { return [$k => MYF_TRIP_KINDS[$k]]; }, ['dienst', 'werkstatt', 'tanken', 'uebung', 'lehrgang', 'besorgung', 'wache', 'verein', 'sonst'])),
        'theme' => myf_settings()['screen_theme'] ?? 'auto', 'lat' => ($ls = myf_settings())['screen_lat'] === null ? 51.16 : (float) $ls['screen_lat'], 'lon' => $ls['screen_lon'] === null ? 10.45 : (float) $ls['screen_lon']]);
    $v = MYF_ASSET_VER;
    echo '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' .
        '<meta name="robots" content="noindex,nofollow"><meta name="apple-mobile-web-app-capable" content="yes"><title>' . esc_html($b['org']) . ' – Halle</title>' .
        '<link rel="stylesheet" href="' . esc_url(MYF_URL . 'assets/hall.css?v=' . $v) . '">' .
        // Dashboard-Stile nur in der ruhigen Zeit aktiv (hall.js schaltet sie ein und aus)
        (myf_hall_screen_cfg() ? '<link rel="stylesheet" id="h-scrcss" href="' . esc_url(MYF_URL . 'assets/screen.css?v=' . $v) . '" disabled>' : '') . '</head><body>' .
        '<div id="hall"><div class="h-loading">' . esc_html($b['org']) . '</div></div>' .
        '<script>window.MYFH=' . $cfg . ';if(MYFH.screenCfg)window.MYFS=MYFH.screenCfg;</script><script src="' . esc_url(MYF_URL . 'assets/vendor/qrcode.min.js?v=' . $v) . '"></script><script src="' . esc_url(MYF_URL . 'assets/minimap.js?v=' . $v) . '"></script>' .
        (myf_hall_screen_cfg() ? '<script src="' . esc_url(MYF_URL . 'assets/screen.js?v=' . $v) . '"></script>' : '') .
        '<script src="' . esc_url(MYF_URL . 'assets/hall.js?v=' . $v) . '"></script></body></html>';
    exit;
});

// Dashboard: Fahrzeugstatus und (falls gewünscht) Knopf zum Terminal
add_filter('myf_screen_data', function ($out) {
    global $wpdb;
    $vs = myf_vstatus();
    if (function_exists('myf_day_availability')) $out['daytime'] = myf_day_availability(); // tagsüber erreichbare Kräfte (nur Zahlen)
    // Für die Statuszeile immer (auch ohne Fahrzeugkarten): welche Fahrzeuge laut Alarmierung gerade einen Status haben – Status 3/4/7/8 = im Einsatz, 6 = nicht einsatzbereit
    $out['fms_list'] = [];
    foreach ($wpdb->get_results('SELECT id, name FROM ' . myf_t('vehicles') . ' WHERE active = 1' . myf_screen_veh_sql() . ' ORDER BY name') as $v) {
        $s = $vs[(int) $v->id] ?? null;
        if ($s) $out['fms_list'][] = ['id' => (int) $v->id, 'name' => $v->name, 'fms' => (string) $s['s'], 'text' => MYF_FMS[$s['s']] ?? '', 'at' => $s['t']];
    }
    if (($_GET['in'] ?? '') === 'hall') {
        $out['vstatus'] = [];
        $now = current_time('mysql');
        foreach ($wpdb->get_results('SELECT id, name, status FROM ' . myf_t('vehicles') . ' WHERE active = 1' . myf_screen_veh_sql() . ' ORDER BY name') as $v) {
            $s = $vs[(int) $v->id] ?? null;
            // für die Fahrzeugkarte in der Halle: km-Stand, außer Dienst, gerade unterwegs (Buchung)
            $bk = $wpdb->get_row($wpdb->prepare('SELECT end, purpose FROM ' . myf_t('bookings') . " WHERE vehicle_id = %d AND status = 'approved' AND start <= %s AND end > %s ORDER BY end LIMIT 1", $v->id, $now, $now));
            if (!$bk && function_exists('myf_vehicle_ext_now') && ($x = myf_vehicle_ext_now((int) $v->id))) $bk = (object) ['end' => $x['end'], 'purpose' => 'laut Kalender unterwegs'];
            $lt = $wpdb->get_row($wpdb->prepare('SELECT start, km_end FROM ' . myf_t('trips') . ' WHERE vehicle_id = %d AND storno_of IS NULL ORDER BY start DESC LIMIT 1', (int) $v->id));
            $out['vstatus'][] = ['id' => (int) $v->id, 'name' => $v->name, 'fms' => $s ? $s['s'] : '', 'text' => $s ? MYF_FMS[$s['s']] : 'kein Status', 'at' => $s ? $s['t'] : null,
                'km' => myf_vehicle_km((int) $v->id), 'out' => $v->status === 'out', 'limited' => $v->status === 'limited', 'away' => $bk ? ['until' => $bk->end, 'purpose' => (string) $bk->purpose] : null,
                'last_trip' => $lt ? ['date' => substr($lt->start, 0, 10), 'km' => $lt->km_end !== null ? (int) $lt->km_end : null] : null];
        }
        $out['in_hall'] = true;
        return $out;
    }
    if ($vs && !empty(myf_settings()['screen_vehicles'])) { // Besprechungsraum: nur wenn eingeschaltet (Standard aus)
        $out['vstatus'] = [];
        foreach ($wpdb->get_results('SELECT id, name FROM ' . myf_t('vehicles') . ' WHERE active = 1' . myf_screen_veh_sql() . ' ORDER BY name') as $v) {
            if (isset($vs[(int) $v->id])) $out['vstatus'][] = ['name' => $v->name, 'fms' => $vs[(int) $v->id]['s'], 'text' => MYF_FMS[$vs[(int) $v->id]['s']], 'at' => $vs[(int) $v->id]['t']];
        }
    }
    $h = myf_hall();
    if ($h['on'] && $h['on_screen'] && myf_hall_incidents()) $out['hall_url'] = myf_hall_url();
    return $out;
});
