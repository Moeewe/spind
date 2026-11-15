<?php
/**
 * Alarm-Schnittstelle (z. B. Alamos FE2): Bei einem Alarm schickt FE2 eine Web-Anfrage an Wehrwerk, der Einsatz wird
 * sofort angelegt – mit Stichwort, Einsatzort und Alarmzeit. Danach: „Ich war dabei“, Dashboard zeigt den Alarm.
 * Geschützt über einen geheimen Schlüssel in der Adresse. Nimmt GET und POST, JSON und Formulardaten an und erkennt die
 * üblichen Feldnamen; eigene Feldnamen lassen sich in der Verwaltung festlegen. Jede Anfrage steht im Alarm-Protokoll.
 */

defined('ABSPATH') || exit;

function myf_install_alarm($c) {
    global $wpdb;
    $p = myf_t(''); // echte oder Demo-Tabellen (Demo-Modus)
    dbDelta("CREATE TABLE {$p}alarm_log (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        received datetime NOT NULL,
        result varchar(20) NOT NULL DEFAULT '',
        incident_id bigint(20) unsigned NULL,
        keyword varchar(200) NOT NULL DEFAULT '',
        address varchar(250) NOT NULL DEFAULT '',
        fields text NULL,
        ip varchar(64) NOT NULL DEFAULT '',
        PRIMARY KEY  (id),
        KEY received (received)
    ) $c;");
}

function myf_alarm_settings() {
    $s = myf_settings();
    return wp_parse_args((array) ($s['alarm'] ?? []), [
        'on' => false, 'key' => '', 'screen_minutes' => 60, 'screen_address' => true, 'ask' => true, 'ask_after' => 120,
        'map' => ['keyword' => '', 'address' => '', 'text' => '', 'time' => ''], 'only_units' => '',
        'test_rules' => '', // Probealarm-Zeiten, z. B. „Mo 19:00 ±20“ – Alarme in diesem Fenster werden nur als Test angelegt
    ]);
}
// Probe-/Testalarm erkennen: Stichwort/Text („Probealarm“, „Testalarm“, „Warntag“ …), feste Probezeiten (z. B. montags 19 Uhr)
// und die Warntage (bundesweit 2. Donnerstag im September, NRW 2. Donnerstag im März, jeweils gegen 11 Uhr). Liefert den Grund oder ''.
function myf_alarm_is_test($data, $a) {
    $hay = $data['keyword'] . ' ' . $data['text'];
    if (preg_match('/probe\s*-?\s*alarm|test\s*-?\s*alarm|alarm\s*-?\s*(probe|test)|funktionsprobe|sirenenprobe|probealarmierung|warntag|testmeldung|testdurchlauf|\btest\b|\bprobe\b/iu', $hay)) return 'Probe-/Testalarm laut Stichwort';
    $ts = strtotime($data['start']); // Ortszeit als Text – nur Datums-/Uhrzeitteile werden verglichen
    $dow = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][(int) date('w', $ts)]; $min = (int) date('G', $ts) * 60 + (int) date('i', $ts);
    foreach (preg_split('/[\n,;]+/', (string) ($a['test_rules'] ?? '')) as $r) {
        if (!preg_match('/^\s*(mo|di|mi|do|fr|sa|so)\.?\s+(\d{1,2})[:.](\d{2})(?:\s*(?:±|\+\/?-|\+-)?\s*(\d{1,3}))?\s*$/iu', $r, $m)) continue;
        if (strcasecmp($m[1], $dow) !== 0) continue;
        $tol = isset($m[4]) && $m[4] !== '' ? (int) $m[4] : 20;
        if (abs($min - ((int) $m[2] * 60 + (int) $m[3])) <= $tol) return 'Probealarm-Zeit (' . trim($r) . ')';
    }
    $y = date('Y', $ts);
    foreach (['September' => 'bundesweiter Warntag', 'March' => 'Warntag NRW'] as $mon => $lbl) {
        if (date('Y-m-d', strtotime("second thursday of $mon $y")) === date('Y-m-d', $ts) && abs($min - 660) <= 75) return $lbl;
    }
    return '';
}
function myf_alarm_url() {
    $a = myf_alarm_settings();
    return $a['key'] ? add_query_arg('key', $a['key'], rest_url('myf/v1/alarm')) : '';
}

// Felder aus beliebigem JSON/Formular flach machen: {"data":{"keyword":"x"}} → data.keyword = x
function myf_alarm_flatten($v, $prefix = '', &$out = []) {
    if (is_array($v) || is_object($v)) {
        foreach ((array) $v as $k => $x) myf_alarm_flatten($x, $prefix === '' ? (string) $k : $prefix . '.' . $k, $out);
    } elseif ($v !== null && $v !== '') {
        $out[$prefix] = is_bool($v) ? ($v ? 'true' : 'false') : (string) $v;
    }
    return $out;
}

// Wert anhand möglicher Feldnamen finden (ohne Groß/Klein, Punkte, Unterstriche – auch verschachtelt: data.keyword)
function myf_alarm_pick($flat, $names) {
    $norm = function ($s) { return preg_replace('/[^a-z0-9]/', '', strtolower($s)); };
    $idx = [];
    foreach ($flat as $k => $v) { $idx[$norm($k)] = $v; $parts = explode('.', $k); $idx[$norm(end($parts))] = $idx[$norm(end($parts))] ?? $v; }
    foreach ((array) $names as $n) { $n = $norm($n); if ($n !== '' && isset($idx[$n]) && trim($idx[$n]) !== '') return trim($idx[$n]); }
    return '';
}

function myf_alarm_parse($flat) {
    $a = myf_alarm_settings();
    $m = $a['map'];
    $kw = myf_alarm_pick($flat, array_filter([$m['keyword'], 'keyword', 'stichwort', 'einsatzstichwort', 'keyword_description', 'alarmkeyword', 'title', 'subject', 'betreff']));
    $kwDesc = myf_alarm_pick($flat, ['keyword_description', 'keyworddescription', 'stichwortbeschreibung', 'meldebild', 'description']);
    if ($kwDesc !== '' && stripos($kw, $kwDesc) === false && $kwDesc !== $kw) $kw = trim($kw . ' – ' . $kwDesc, ' –');
    $addr = myf_alarm_pick($flat, array_filter([$m['address'], 'address', 'adresse', 'einsatzort', 'location', 'ort', 'location_dest', 'objekt']));
    if ($addr === '') {
        $street = myf_alarm_pick($flat, ['street', 'strasse', 'straße']); $house = myf_alarm_pick($flat, ['house', 'housenumber', 'hausnummer', 'hnr']);
        $city = myf_alarm_pick($flat, ['city', 'stadt', 'gemeinde', 'ortsteil']);
        $addr = trim(trim($street . ' ' . $house) . ($city ? ', ' . $city : ''), ', ');
    }
    $text = myf_alarm_pick($flat, array_filter([$m['text'], 'message', 'text', 'meldung', 'alarmtext', 'body', 'remark', 'bemerkung', 'info']));
    $time = myf_alarm_pick($flat, array_filter([$m['time'], 'timestamp', 'alarmdate', 'alarm_date', 'date', 'time', 'zeit', 'alarmzeit', 'datetime']));
    $units = myf_alarm_pick($flat, ['units', 'unit', 'einheiten', 'alarmierteeinheiten', 'rics', 'ric', 'vehicles', 'fahrzeuge']);
    $lat = myf_alarm_pick($flat, ['lat', 'latitude', 'breite']); $lng = myf_alarm_pick($flat, ['lng', 'lon', 'longitude', 'laenge', 'länge']);
    $nr = myf_alarm_pick($flat, ['einsatznummer', 'incidentnumber', 'externalid', 'number', 'nr']);
    // Alarmzeit: Unix-Zeit (Sekunden/Millisekunden) oder Datumstext; sonst „jetzt“
    $ts = null;
    if (preg_match('/^\d{12,13}$/', $time)) $ts = (int) floor((int) $time / 1000);
    elseif (preg_match('/^\d{9,10}$/', $time)) $ts = (int) $time;
    elseif ($time !== '' && ($t = strtotime($time))) $ts = $t;
    if (!$ts || abs($ts - time()) > 2 * DAY_IN_SECONDS) $ts = time();
    return ['keyword' => mb_substr($kw, 0, 200), 'address' => mb_substr($addr, 0, 250), 'text' => mb_substr($text, 0, 2000), 'units' => mb_substr($units, 0, 300),
        'lat' => is_numeric($lat) ? (float) $lat : null, 'lng' => is_numeric($lng) ? (float) $lng : null, 'nr' => mb_substr($nr, 0, 30),
        'start' => wp_date('Y-m-d H:i:s', $ts)];
}

function myf_alarm_log($result, $data, $flat, $incidentId = null) {
    global $wpdb;
    $wpdb->insert(myf_t('alarm_log'), ['received' => current_time('mysql'), 'result' => $result, 'incident_id' => $incidentId,
        'keyword' => (string) ($data['keyword'] ?? ''), 'address' => (string) ($data['address'] ?? ''),
        // Felder mit Inhalt kürzen; Protokoll wird nach 14 Tagen gelöscht
        'fields' => wp_json_encode(array_map(function ($v) { return mb_substr($v, 0, 160); }, array_slice($flat, 0, 60, true))),
        'ip' => substr((string) ($_SERVER['REMOTE_ADDR'] ?? ''), 0, 64)]);
    $wpdb->query($wpdb->prepare('DELETE FROM ' . myf_t('alarm_log') . ' WHERE received < %s', date('Y-m-d H:i:s', current_time('timestamp') - 14 * DAY_IN_SECONDS)));
}

// Alarm verarbeiten: Einsatz anlegen (oder einem gerade angelegten zuordnen), Dashboard, Nachfrage „Warst du dabei?“
function myf_alarm_receive($flat, $test = false) {
    global $wpdb;
    $a = myf_alarm_settings();
    $data = myf_alarm_parse($flat);
    if ($data['keyword'] === '' && $data['address'] === '' && $data['text'] === '') { myf_alarm_log('leer', $data, $flat); return ['ok' => false, 'message' => 'Keine Alarmdaten erkannt (Stichwort/Ort/Text).']; }
    if ($a['only_units'] !== '' && $data['units'] !== '') {
        $hit = false;
        foreach (array_filter(array_map('trim', explode(',', $a['only_units']))) as $u) if (stripos($data['units'], $u) !== false) $hit = true;
        if (!$hit) { myf_alarm_log('andere Einheit', $data, $flat); return ['ok' => true, 'message' => 'Alarm betrifft andere Einheiten – ignoriert.']; }
    }
    $title = $data['keyword'] !== '' ? $data['keyword'] : wp_trim_words($data['text'], 6, '…');
    // Probealarm (montags 19 Uhr, Warntag, „Testalarm“ im Stichwort …): nur als Test anlegen – kein echter Einsatz, keine Nachfrage, keine Hallenliste
    $why = '';
    if (!$test && ($why = myf_alarm_is_test($data, $a)) !== '') $test = true;
    if ($test) $title = 'TESTALARM: ' . $title;
    // Gehört der Alarm zu einem Einsatz, den es schon gibt? (Folgealarm, Erhöhung, Nachalarmierung, selbst angelegt)
    $match = myf_alarm_match($data, $title, $test);
    if ($match) {
        $dup = $match['incident'];
        $prevKw = $dup->title;
        $hist = json_decode((string) $dup->alarms, true) ?: [];
        $kind = myf_alarm_kind($hist ? end($hist)['kw'] : $prevKw, $title, $hist || in_array($dup->source, ['alamos', 'test'], true));
        if (!$hist && in_array($dup->source, ['alamos', 'test'], true)) $hist[] = ['t' => $dup->start, 'kw' => $prevKw, 'k' => 'Alarm']; // ältere Einsätze ohne Historie
        $hist[] = ['t' => $data['start'], 'kw' => $title, 'k' => $kind];
        $upd = ['alarms' => wp_json_encode(array_slice($hist, -20))];
        if ($dup->place === '' && $data['address'] !== '') $upd['place'] = $data['address'];
        // Koordinaten für die Karte nachtragen, wenn der Einsatz noch keine hat (z. B. von Hand angelegt, dann kam der Alarm)
        if (($dup->alarm_lat ?? null) === null && $data['lat'] !== null && $data['lng'] !== null) { $upd['alarm_lat'] = $data['lat']; $upd['alarm_lng'] = $data['lng']; }
        if (($dup->ext_nr ?? '') === '' && $data['nr'] !== '') $upd['ext_nr'] = $data['nr'];
        // Erhöhung: neues Stichwort übernehmen (die Historie behält das alte)
        if ($kind === 'Erhöhung') $upd['title'] = mb_substr($title, 0, 200);
        $prev = myf_dec((string) $dup->alarm_text);
        $line = '[' . substr($data['start'], 11, 5) . ' ' . $kind . '] ' . $title . ($data['text'] !== '' ? ' – ' . $data['text'] : '');
        if (strpos($prev, $data['text'] !== '' ? $data['text'] : $line) === false) $upd['alarm_text'] = myf_enc(trim($prev . "\n" . $line));
        $wpdb->update(myf_t('incidents'), $upd, ['id' => $dup->id]);
        myf_alarm_log($kind, $data, $flat, (int) $dup->id);
        if (in_array($kind, ['Erhöhung', 'Nachalarmierung'], true) && !$test)
            myf_notify(myf_area_members('incidents'), 'alarm', $kind . ': ' . ($kind === 'Erhöhung' ? $prevKw . ' → ' : '') . $title, $data['address'], 'einsatz:' . $dup->id, 'alarm:' . $dup->id . ':' . count($hist));
        return ['ok' => true, 'incident_id' => (int) $dup->id, 'message' => 'Alarm dem Einsatz zugeordnet (' . $kind . ', ' . $match['why'] . ').'];
    }
    $cat = preg_match('/^(B|F)\s?\d|brand|feuer|bma|rauch/i', $title) ? 'brand' : (preg_match('/vu\b|verkehr|unfall/i', $title) ? 'vu' : (preg_match('/^(H|TH)\s?\d|hilfe|öl|tür|tier|person|wasser|sturm|baum/i', $title) ? 'th' : 'sonst'));
    $wpdb->insert(myf_t('incidents'), ['kind' => 'einsatz', 'nr' => '', 'ext_nr' => $data['nr'], 'alarms' => wp_json_encode([['t' => $data['start'], 'kw' => $title, 'k' => 'Alarm']]), 'title' => mb_substr($title, 0, 200), 'category' => $cat, 'start' => $data['start'],
        'place' => $data['address'], 'alarm_text' => myf_enc($data['text']), 'alarm_lat' => $data['lat'], 'alarm_lng' => $data['lng'], 'source' => $test ? 'test' : 'alamos',
        'created' => current_time('mysql'), 'created_by' => 'Alarm-Schnittstelle']);
    $id = (int) $wpdb->insert_id;
    myf_alarm_log($test ? (strpos($why, 'Stichwort') !== false ? 'Test: Stichwort' : (strpos($why, 'Zeit') !== false ? 'Test: Probezeit' : (strpos($why, 'Warntag') !== false ? 'Test: Warntag' : 'Test'))) : 'angelegt', $data, $flat, $id);
    delete_transient('myf_inc_sync');
    // Später alle fragen: „Warst du dabei?“ (nur im Postfach, keine E-Mail-Flut)
    if ($a['ask'] && !$test) wp_schedule_single_event(time() + max(15, (int) $a['ask_after']) * MINUTE_IN_SECONDS, 'myf_alarm_ask', [$id]);
    // Einsatzführung kurz informieren (Postfach)
    myf_notify(myf_area_members('incidents'), 'alarm', ($test ? 'Testalarm' : 'Alarm') . ': ' . $title, $data['address'], 'einsatz:' . $id, 'alarm:' . $id);
    return ['ok' => true, 'incident_id' => $id, 'message' => $test ? 'Als Testalarm angelegt' . ($why !== '' ? ' (' . $why . ')' : '') . '.' : 'Einsatz angelegt.'];
}

// Passenden Einsatz für einen Alarm finden – in dieser Reihenfolge:
// 1. gleiche Einsatznummer der Leitstelle, 2. gleiche Straße innerhalb von 3 Stunden (Erhöhung/Nachalarmierung),
// 3. selbst angelegter Einsatz ohne Alarm kurz davor (bis 2 Stunden), 4. gleiches Stichwort innerhalb von 15 Minuten
function myf_alarm_match($data, $title, $test) {
    global $wpdb;
    $t = strtotime($data['start']);
    $rows = $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . myf_t('incidents') . " WHERE kind = 'einsatz' AND source " . ($test ? "= 'test'" : "<> 'test'") . ' AND start BETWEEN %s AND %s ORDER BY start DESC',
        date('Y-m-d H:i:s', $t - 3 * HOUR_IN_SECONDS), date('Y-m-d H:i:s', $t + 20 * MINUTE_IN_SECONDS)));
    if (!$rows) return null;
    if ($data['nr'] !== '') foreach ($rows as $r) if (($r->ext_nr ?? '') !== '' && $r->ext_nr === $data['nr']) return ['incident' => $r, 'why' => 'gleiche Einsatznummer'];
    $street = myf_alarm_street($data['address']);
    if ($street !== '') foreach ($rows as $r) if (myf_alarm_street($r->place) === $street) return ['incident' => $r, 'why' => 'gleicher Einsatzort'];
    foreach ($rows as $r) if ($r->source === 'manuell' && !json_decode((string) $r->alarms, true) && strtotime($r->start) >= $t - 2 * HOUR_IN_SECONDS
        && ($r->place === '' || $street === '' || myf_alarm_street($r->place) === $street)) return ['incident' => $r, 'why' => 'selbst angelegter Einsatz'];
    // Gleiches Stichwort kurz hintereinander zählt nur als Folgealarm, wenn keine zweite, andere Adresse dagegen spricht
    // (Unwetter: „Baum auf Straße“ an fünf Orten in zehn Minuten sind fünf Einsätze)
    foreach ($rows as $r) if (abs(strtotime($r->start) - $t) <= 15 * MINUTE_IN_SECONDS && ($street === '' || myf_alarm_street($r->place) === '' || myf_alarm_street($r->place) === $street) && ($r->title === $title || $data['keyword'] === '' || stripos($r->title, $data['keyword']) !== false || ($data['keyword'] !== '' && stripos($data['keyword'], $r->title) !== false)))
        return ['incident' => $r, 'why' => 'gleiches Stichwort'];
    return null;
}
// Straße ohne Hausnummer, klein, ohne Sonderzeichen: „Hauptstraße 12, Musterstadt“ → „hauptstrasse“
function myf_alarm_street($addr) {
    $a = str_replace('ß', 'ss', mb_strtolower(trim(explode(',', (string) $addr)[0])));
    $a = strtolower(remove_accents($a));
    $a = preg_replace('/\s*\d+\s*[a-z]?\s*$/', '', $a);          // Hausnummer weg
    $a = preg_replace('/stra(ss|s)e\b|str\.?(?=\s|$)/', 'str', $a); // Straße/Strasse/Str. gleich behandeln
    return preg_replace('/[^a-z0-9]/', '', $a);
}
// Art der weiteren Alarmierung: höhere Stufe (F2 → F3, TH1 → TH2) = Erhöhung; gleiches Stichwort = Folgealarm; sonst Nachalarmierung
function myf_alarm_kind($old, $new, $hadAlarm) {
    if (!$hadAlarm) return 'Alarm';
    $st = function ($k) { return preg_match('/\b(B|F|TH|H|ABC|RD|VU)\s?(\d)\b/i', $k, $m) ? [strtoupper($m[1]) === 'B' ? 'F' : strtoupper($m[1]), (int) $m[2]] : null; };
    $a = $st($old); $b = $st($new);
    if ($a && $b && $a[0] === $b[0] && $b[1] > $a[1]) return 'Erhöhung';
    return trim(mb_strtolower($old)) === trim(mb_strtolower($new)) ? 'Folgealarm' : 'Nachalarmierung';
}

add_action('myf_alarm_ask', function ($id) {
    global $wpdb;
    $i = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('incidents') . ' WHERE id = %d', (int) $id));
    if (!$i) return;
    $already = array_map('intval', $wpdb->get_col($wpdb->prepare('SELECT member_id FROM ' . myf_t('participation') . ' WHERE incident_id = %d', $i->id)));
    $ids = array_diff(array_map('intval', $wpdb->get_col('SELECT id FROM ' . myf_t('members') . ' WHERE active = 1 AND user_id IS NOT NULL')), $already);
    $GLOBALS['myf_no_mail'] = true;
    myf_notify($ids, 'ask', 'Warst du dabei? ' . $i->title, 'Bitte unter „Einsätze“ kurz eintragen, auf welchem Fahrzeug du warst.', 'einsatz:' . $i->id, 'ask:' . $i->id);
    // Einsatzführung: Erinnerung an Bericht und Bestätigung
    if (empty($i->report)) myf_notify(myf_area_members('incidents'), 'reminder', 'Einsatzbericht ausfüllen: ' . $i->title, 'Beteiligung bestätigen und den Bericht direkt am Handy ausfüllen – dauert 3 Minuten.', 'bericht:' . $i->id, 'rep:' . $i->id);
    unset($GLOBALS['myf_no_mail']);
});

add_action('rest_api_init', function () {
    register_rest_route('myf/v1', '/alarm', ['methods' => ['GET', 'POST'], 'permission_callback' => '__return_true', 'callback' => function (WP_REST_Request $req) {
        $a = myf_alarm_settings();
        $key = (string) ($req->get_param('key') ?: $req->get_header('x-wehrwerk-key'));
        if (!$a['on'] || $a['key'] === '' || !hash_equals($a['key'], $key)) return new WP_Error('myf_alarm', 'Nicht freigegeben.', ['status' => 403]);
        // Schutz vor Endlosschleifen / Missbrauch: höchstens 60 Anfragen pro Stunde
        // Missbrauchsschutz je voller Stunde – großzügig, damit an Unwettertagen (viele Alarme, Folgealarme) nichts verloren geht
        $rk = 'myf_alarm_rate_' . current_time('YmdH'); $n = (int) get_transient($rk);
        if ($n > 500) return new WP_Error('myf_alarm', 'Zu viele Anfragen.', ['status' => 429]);
        set_transient($rk, $n + 1, 2 * HOUR_IN_SECONDS);
        $params = $req->get_json_params() ?: [];
        $params += $req->get_body_params() + $req->get_query_params();
        $raw = trim((string) $req->get_body());
        if (!$params && $raw !== '' && !in_array($raw[0], ['{', '['], true)) $params = ['text' => $raw]; // reiner Text (z. B. SMS-/E-Mail-Weiterleitung)
        // Zum Ausprobieren des Webhooks: test=1 (oder Header X-Wehrwerk-Test) legt nur einen Testalarm an, keinen echten Einsatz
        $isTest = !empty($params['test']) || (string) $req->get_header('x-wehrwerk-test') !== '';
        unset($params['key'], $params['test']);
        $flat = myf_alarm_flatten($params);
        $GLOBALS['myf_alarm_request'] = true;
        $r = myf_alarm_receive($flat, $isTest);
        return new WP_REST_Response($r, $r['ok'] ? 200 : 400);
    }]);
    register_rest_route('myf/v1', '/admin/alarm', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
        $s = myf_settings();
        $a = myf_alarm_settings();
        if (!$req->get_param('test') && !current_user_can('manage_options')) return myf_err('Die Alarm-Schnittstelle stellen nur Administratoren ein.', 403);
        if ($req->get_param('test')) {
            if (!$a['on']) return myf_err('Bitte die Schnittstelle zuerst einschalten.');
            return myf_alarm_receive(myf_alarm_flatten(['keyword' => 'H1 Hilfeleistung', 'keyword_description' => 'Ölspur', 'address' => 'Hauptstraße 1, ' . myf_brand()['zip'] . ' ' . myf_brand()['place'], 'message' => 'Testalarm aus der Verwaltung']), true);
        }
        if ($req->has_param('on')) $a['on'] = (bool) $req->get_param('on');
        if ($req->get_param('new_key') || ($a['on'] && !$a['key'])) $a['key'] = wp_generate_password(32, false);
        foreach (['screen_minutes' => [0, 600], 'ask_after' => [15, 1440]] as $k => $r) if ($req->has_param($k)) $a[$k] = max($r[0], min($r[1], (int) $req->get_param($k)));
        foreach (['screen_address', 'ask'] as $k) if ($req->has_param($k)) $a[$k] = (bool) $req->get_param($k);
        if ($req->has_param('only_units')) $a['only_units'] = mb_substr(sanitize_text_field((string) $req->get_param('only_units')), 0, 200);
        if ($req->has_param('test_rules')) $a['test_rules'] = mb_substr(sanitize_text_field((string) $req->get_param('test_rules')), 0, 300);
        if (is_array($req->get_param('map'))) foreach (['keyword', 'address', 'text', 'time'] as $k) $a['map'][$k] = mb_substr(sanitize_text_field((string) ($req->get_param('map')[$k] ?? '')), 0, 60);
        $s['alarm'] = $a;
        update_option('myf_settings', $s);
        return ['ok' => true];
    }]);
});

add_filter('myf_admin_state', function ($d) {
    global $wpdb;
    if (!function_exists('myf_has_area') || !myf_has_area('incidents')) return $d;
    $a = myf_alarm_settings();
    // Schlüssel nur für Administratoren sichtbar (wer ihn hat, kann Einsätze anlegen)
    $d['alarm'] = ['on' => $a['on'], 'url' => current_user_can('manage_options') ? myf_alarm_url() : ($a['key'] ? '(nur für Administratoren sichtbar)' : ''), 'screen_minutes' => $a['screen_minutes'],
        'screen_address' => $a['screen_address'], 'ask' => $a['ask'], 'ask_after' => $a['ask_after'], 'only_units' => $a['only_units'], 'test_rules' => (string) ($a['test_rules'] ?? ''), 'map' => $a['map'], 'can_key' => current_user_can('manage_options')];
    $d['alarm_log'] = array_map(function ($l) { return ['received' => $l->received, 'result' => $l->result, 'incident_id' => $l->incident_id ? (int) $l->incident_id : null,
        'keyword' => $l->keyword, 'address' => $l->address, 'fields' => json_decode((string) $l->fields, true) ?: (object) []]; },
        $wpdb->get_results('SELECT * FROM ' . myf_t('alarm_log') . ' ORDER BY id DESC LIMIT 25'));
    return $d;
}, 25);

// Dashboard: laufender Alarm (Stichwort, auf Wunsch Ort) für die eingestellte Zeit
add_filter('myf_screen_data', function ($out) {
    global $wpdb;
    $a = myf_alarm_settings();
    if (!$a['on'] || !$a['screen_minutes']) return $out;
    // Mehrere Einsätze gleichzeitig (Unwetter, Paralleleinsätze): alle laufenden, der neueste zuerst
    $rows = $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . myf_t('incidents') . " WHERE (source IN ('alamos','test') OR (alarms IS NOT NULL AND alarms <> '' AND alarms <> '[]')) AND (end IS NULL OR end > %s) AND start >= %s ORDER BY start DESC LIMIT 12",
        current_time('mysql'), date('Y-m-d H:i:s', current_time('timestamp') - $a['screen_minutes'] * MINUTE_IN_SECONDS)));
    $out['alarms'] = array_map(function ($i) use ($a) {
        $al = json_decode((string) ($i->alarms ?? ''), true) ?: []; $last = $al ? end($al) : null;
        return ['id' => (int) $i->id, 'title' => $i->title, 'place' => $a['screen_address'] ? $i->place : '', 'start' => mysql2date('c', $i->start), 'test' => $i->source === 'test',
            'lat' => $a['screen_address'] && isset($i->alarm_lat) && $i->alarm_lat !== null ? (float) $i->alarm_lat : null, 'lng' => $a['screen_address'] && isset($i->alarm_lng) && $i->alarm_lng !== null ? (float) $i->alarm_lng : null,
            // letzte Erhöhung/Nachalarmierung fürs Dashboard (nur Stichwort und Uhrzeit)
            'update' => $last && $last['k'] !== 'Alarm' && $last['k'] !== 'Folgealarm' ? ['k' => $last['k'], 't' => substr($last['t'], 11, 5)] : null];
    }, $rows);
    if ($out['alarms']) $out['alarm'] = $out['alarms'][0];
    return $out;
});
