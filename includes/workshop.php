<?php
/**
 * Atemschutzwerkstatt: Geräte (Vollmasken, Lungenautomaten, Pressluftatmer, Druckluftflaschen) mit Prüfungen.
 * Fristen nach DGUV Regel 112-190 (Tab. 13/15) als Vorgabe, in der Verwaltung anpassbar; Herstellerangaben gehen vor.
 * Revisionssicher: Prüfungen werden nie geändert oder gelöscht – nur storniert (mit Grund), alles im Protokoll mit Hash-Kette.
 */

defined('ABSPATH') || exit;

// Gerätearten und Prüfarten mit Frist in Monaten (0 = nach jedem Gebrauch)
function myf_as_rules_default() {
    return [
        'maske' => ['label' => 'Vollmaske', 'kinds' => [
            'rdp' => ['Reinigung, Desinfektion, Sicht-, Dicht- und Funktionsprüfung', 0],
            'pruef' => ['Sicht-, Dicht- und Funktionsprüfung (Lagerung)', 24],
            'avs' => ['Wechsel Ausatemventilscheibe', 72],
            'sprech' => ['Wechsel Sprechmembran', 72],
        ]],
        'la' => ['label' => 'Lungenautomat', 'kinds' => [
            'rdp' => ['Reinigung, Desinfektion, Sicht-, Dicht- und Funktionsprüfung', 0],
            'pruef' => ['Sicht-, Dicht- und Funktionsprüfung', 6],
            'membran' => ['Wechsel der Membran', 72],
            'gue' => ['Grundüberholung (inkl. Schlauch)', 72],
        ]],
        'pa' => ['label' => 'Pressluftatmer (Grundgerät)', 'kinds' => [
            'rdp' => ['Reinigung, Sicht-, Dicht- und Funktionsprüfung', 0],
            'pruef' => ['Sicht-, Dicht- und Funktionsprüfung', 6],
            'gue' => ['Grundüberholung luftführende Teile', 72],
        ]],
        'flasche' => ['label' => 'Druckluftflasche', 'kinds' => [
            'fuell' => ['Füllung mit Sichtprüfung', 0],
            'tuev' => ['Wiederkehrende Prüfung (zugelassene Prüfstelle, Frist laut Flasche)', 60],
        ]],
    ];
}
// Gerätewerkstatt der Gerätewarte: Prüfungen nach DGUV Grundsatz 305-002 (Prüfgrundsätze für Ausrüstung und Geräte der Feuerwehr) – Herstellerangaben gehen vor
function myf_geraete_rules_default() {
    $s = ['sicht' => ['Sicht- und Funktionsprüfung nach Gebrauch', 0]];
    $j = ['jahr' => ['Prüfung durch Sachkundigen', 12]];
    $e = ['elektro' => ['Prüfung elektrische Sicherheit (DGUV Vorschrift 3)', 12]];
    return [
        'leiter' => ['label' => 'Tragbare Leiter', 'kinds' => $s + $j],
        'hebekissen' => ['label' => 'Hebekissen / Hebesatz', 'kinds' => $s + $j],
        'rettung' => ['label' => 'Hydraulisches Rettungsgerät', 'kinds' => $s + $j],
        'saege' => ['label' => 'Motorsäge / Trennschleifer', 'kinds' => $s + $j],
        'absturz' => ['label' => 'Absturzsicherung / Feuerwehrleine / Haltegurt', 'kinds' => $s + $j],
        'strom' => ['label' => 'Stromerzeuger', 'kinds' => $s + $j + $e],
        'elektro' => ['label' => 'Elektrisches Betriebsmittel (Leitungsroller, Leuchte, Tauchpumpe)', 'kinds' => $s + $e],
        'sonst' => ['label' => 'Sonstiges Gerät', 'kinds' => $s + $j],
    ];
}
function myf_team_rules_default() {
    return ['geraet' => ['label' => 'Gerät / Inventar', 'kinds' => ['pruef' => ['Prüfung / Wartung', 12]]]];
}
// Alle Werkstätten: Atemschutz, Gerätewarte (Bereich Fahrzeuge) und jedes Team
function myf_ws_areas() {
    $a = ['agt', 'vehicles'];
    foreach (myf_teams() as $t) $a[] = 'team_' . $t['key'];
    return $a;
}
function myf_ws_rules($area) {
    if ($area === 'agt') return myf_as_rules();
    $own = myf_settings()['ws_rules'][$area] ?? null;
    if (is_array($own) && $own) return $own;
    return $area === 'vehicles' ? myf_geraete_rules_default() : myf_team_rules_default();
}

function myf_as_rules() {
    $r = myf_settings()['as_rules'] ?? null;
    return is_array($r) && $r ? $r : myf_as_rules_default();
}
const MYF_DEVICE_STATUS = ['ready' => 'einsatzbereit', 'used' => 'benutzt – Wartung nötig', 'blocked' => 'gesperrt (n. i. O.)', 'retired' => 'ausgesondert'];

function myf_install_workshop($c) {
    global $wpdb;
    $p = myf_t(''); // echte oder Demo-Tabellen (Demo-Modus)
    dbDelta("CREATE TABLE {$p}devices (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        area varchar(30) NOT NULL DEFAULT 'agt',
        type varchar(20) NOT NULL,
        nr varchar(40) NOT NULL DEFAULT '',
        serial varchar(60) NOT NULL DEFAULT '',
        maker varchar(60) NOT NULL DEFAULT '',
        model varchar(60) NOT NULL DEFAULT '',
        built varchar(7) NOT NULL DEFAULT '',
        location varchar(60) NOT NULL DEFAULT '',
        storage varchar(10) NOT NULL DEFAULT 'stationaer',
        test_due date NULL,
        status varchar(10) NOT NULL DEFAULT 'ready',
        member_id bigint(20) unsigned NULL,
        note text NULL,
        created datetime NOT NULL,
        PRIMARY KEY  (id),
        KEY type (type),
        KEY area (area)
    ) $c;");
    dbDelta("CREATE TABLE {$p}device_checks (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        device_id bigint(20) unsigned NOT NULL,
        kind varchar(20) NOT NULL,
        date date NOT NULL,
        result varchar(4) NOT NULL DEFAULT 'ok',
        tester varchar(80) NOT NULL DEFAULT '',
        values_text text NULL,
        note text NULL,
        by_member_id bigint(20) unsigned NULL,
        by_name varchar(120) NOT NULL DEFAULT '',
        storno_of bigint(20) unsigned NULL,
        storno_reason varchar(200) NOT NULL DEFAULT '',
        created datetime NOT NULL,
        PRIMARY KEY  (id),
        KEY device_id (device_id)
    ) $c;");
}

function myf_device_out($x) {
    return ['id' => (int) $x->id, 'area' => (string) ($x->area ?? 'agt'), 'type' => $x->type, 'nr' => $x->nr, 'serial' => $x->serial, 'maker' => $x->maker, 'model' => $x->model, 'built' => $x->built,
        'location' => $x->location, 'storage' => $x->storage, 'test_due' => $x->test_due, 'status' => $x->status, 'member_id' => $x->member_id ? (int) $x->member_id : null, 'note' => (string) $x->note];
}
function myf_check_out($c) {
    return ['id' => (int) $c->id, 'device_id' => (int) $c->device_id, 'kind' => $c->kind, 'date' => $c->date, 'result' => $c->result, 'tester' => $c->tester,
        'values' => (string) $c->values_text, 'note' => (string) $c->note, 'by' => $c->by_name, 'storno_of' => $c->storno_of ? (int) $c->storno_of : null,
        'storno_reason' => $c->storno_reason, 'created' => $c->created];
}

// Fälligkeiten eines Geräts je Prüfart (letzte gültige i.-O.-Prüfung + Frist)
function myf_device_due($dev, $checks, $rules = null) {
    if ($rules === null) $rules = myf_ws_rules($dev['area'] ?? 'agt');
    $stornoed = [];
    foreach ($checks as $c) if ($c['storno_of']) $stornoed[$c['storno_of']] = true;
    $out = [];
    foreach (($rules[$dev['type']]['kinds'] ?? []) as $k => $r) {
        $months = (int) $r[1];
        if ($dev['type'] === 'maske' && $k === 'pruef') $months = $dev['storage'] === 'mobil' ? 6 : $months;
        $last = null;
        foreach ($checks as $c) if ($c['kind'] === $k && $c['result'] === 'ok' && !$c['storno_of'] && empty($stornoed[$c['id']]) && (!$last || $c['date'] > $last)) $last = $c['date'];
        $due = null; $fromBuilt = false;
        if ($months > 0) $due = $last ? date('Y-m-d', strtotime($last . " +$months months")) : null;
        // Lange Wechsel-Fristen (ab 2 Jahre, z. B. 72 Monate) ohne Eintrag: ab Baujahr rechnen statt sofort „fällig“
        if (!$last && $months >= 24 && preg_match('/^(\d{4})(?:-(\d{2}))?$/', (string) ($dev['built'] ?? ''), $bm)) {
            $due = date('Y-m-d', strtotime(sprintf('%04d-%02d-01', $bm[1], $bm[2] ?? 1) . " +$months months")); $fromBuilt = true;
        }
        if ($k === 'tuev' && $dev['test_due']) $due = $dev['test_due'];
        $out[$k] = ['last' => $last, 'due' => $due, 'months' => $months, 'after_use' => $months === 0, 'from_built' => $fromBuilt];
    }
    return $out;
}

add_filter('myf_admin_state', function ($d) {
    global $wpdb;
    if (!function_exists('myf_has_area')) return $d;
    // Werkstätten: Atemschutz, Gerätewarte, Teams – jeder sieht nur die Geräte seiner Bereiche
    $mine = array_values(array_filter(myf_ws_areas(), 'myf_has_area'));
    $d['ws_areas'] = $mine;
    $d['ws_rules'] = [];
    foreach ($mine as $a) $d['ws_rules'][$a] = myf_ws_rules($a);
    $d['device_status'] = MYF_DEVICE_STATUS;
    if (!$mine) { $d['devices'] = []; $d['device_checks'] = []; return $d; }
    $in = "'" . implode("','", array_map('esc_sql', $mine)) . "'";
    $d['devices'] = array_map('myf_device_out', $wpdb->get_results('SELECT * FROM ' . myf_t('devices') . " WHERE area IN ($in) ORDER BY type, nr"));
    $d['device_checks'] = array_map('myf_check_out', $wpdb->get_results('SELECT c.* FROM ' . myf_t('device_checks') . ' c JOIN ' . myf_t('devices') . " d ON d.id = c.device_id WHERE d.area IN ($in) ORDER BY c.date DESC, c.id DESC"));
    if (in_array('agt', $mine, true)) $d['as_rules'] = myf_as_rules();
    return $d;
}, 20);

// Geräte-QR im Mitgliederbereich: Gerät ansehen und „nach Gebrauch melden“
add_filter('myf_me_data', function ($data, $me) {
    global $wpdb;
    $id = isset($_GET['geraet']) ? (int) $_GET['geraet'] : 0;
    if ($id && ($x = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('devices') . ' WHERE id = %d', $id)))) {
        $rules = myf_ws_rules($x->area ?? 'agt');
        $data['device'] = ['id' => (int) $x->id, 'area' => (string) $x->area, 'label' => $rules[$x->type]['label'] ?? $x->type, 'nr' => $x->nr, 'status' => $x->status, 'status_label' => MYF_DEVICE_STATUS[$x->status] ?? $x->status, 'location' => $x->location];
    }
    return $data;
}, 10, 2);

function myf_api_device_save(WP_REST_Request $req) {
    global $wpdb;
    $id = (int) $req->get_param('id');
    $area = $id ? (string) $wpdb->get_var($wpdb->prepare('SELECT area FROM ' . myf_t('devices') . ' WHERE id = %d', $id)) : (string) ($req->get_param('area') ?: 'agt');
    if (!in_array($area, myf_ws_areas(), true) || !myf_has_area($area)) return myf_err('Diese Werkstatt gehört nicht zu deinen Bereichen.', 403);
    $d = $id ? [] : ['area' => $area];
    foreach (['nr' => 40, 'serial' => 60, 'maker' => 60, 'model' => 60, 'location' => 60] as $k => $len) if ($req->has_param($k)) $d[$k] = mb_substr(sanitize_text_field((string) $req->get_param($k)), 0, $len);
    if ($req->has_param('type')) { $t = (string) $req->get_param('type'); if (!isset(myf_ws_rules($area)[$t])) return myf_err('Unbekannte Geräteart.'); $d['type'] = $t; }
    if ($req->has_param('built')) $d['built'] = preg_match('/^\d{4}(-\d{2})?$/', (string) $req->get_param('built')) ? $req->get_param('built') : '';
    if ($req->has_param('storage')) $d['storage'] = $req->get_param('storage') === 'mobil' ? 'mobil' : 'stationaer';
    if ($req->has_param('test_due')) $d['test_due'] = myf_date_or_null($req->get_param('test_due'));
    if ($req->has_param('status')) $d['status'] = isset(MYF_DEVICE_STATUS[$req->get_param('status')]) ? $req->get_param('status') : 'ready';
    if ($req->has_param('member_id')) $d['member_id'] = (int) $req->get_param('member_id') ?: null;
    if ($req->has_param('note')) $d['note'] = sanitize_textarea_field((string) $req->get_param('note'));
    if ($id) $wpdb->update(myf_t('devices'), $d, ['id' => $id]);
    else {
        if (empty($d['type']) || ($d['nr'] ?? '') === '') return myf_err('Bitte Geräteart und Nummer angeben.');
        $wpdb->insert(myf_t('devices'), $d + ['created' => current_time('mysql')]);
        $id = (int) $wpdb->insert_id;
    }
    return ['id' => $id];
}

// Prüfung eintragen (nur anhängen) – oder eine frühere stornieren
function myf_api_check_save(WP_REST_Request $req) {
    global $wpdb;
    $dev = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('devices') . ' WHERE id = %d', (int) $req->get_param('device_id')));
    if (!$dev || !myf_has_area($dev->area)) return myf_err('Gerät nicht gefunden.', 404);
    $me = myf_me();
    if ($req->get_param('storno')) {
        $orig = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('device_checks') . ' WHERE id = %d AND device_id = %d', (int) $req->get_param('storno'), $dev->id));
        $reason = sanitize_text_field((string) $req->get_param('reason'));
        if (!$orig || $orig->storno_of) return myf_err('Prüfung nicht gefunden.', 404);
        if ($reason === '') return myf_err('Bitte einen Grund für die Stornierung angeben.');
        $wpdb->insert(myf_t('device_checks'), ['device_id' => $dev->id, 'kind' => $orig->kind, 'date' => current_time('Y-m-d'), 'result' => $orig->result,
            'storno_of' => $orig->id, 'storno_reason' => mb_substr($reason, 0, 200), 'by_member_id' => $me ? $me->id : null, 'by_name' => myf_actor(), 'created' => current_time('mysql')]);
        return ['id' => (int) $wpdb->insert_id];
    }
    $kind = (string) $req->get_param('kind');
    if (!isset(myf_ws_rules($dev->area)[$dev->type]['kinds'][$kind])) return myf_err('Diese Prüfart gibt es für das Gerät nicht.');
    $date = myf_date_or_null($req->get_param('date')) ?: current_time('Y-m-d');
    if ($date > current_time('Y-m-d')) return myf_err('Prüfungen können nicht in der Zukunft liegen.');
    $result = $req->get_param('result') === 'nok' ? 'nok' : 'ok';
    $wpdb->insert(myf_t('device_checks'), ['device_id' => $dev->id, 'kind' => $kind, 'date' => $date, 'result' => $result,
        'tester' => mb_substr(sanitize_text_field((string) $req->get_param('tester')), 0, 80), 'values_text' => sanitize_textarea_field((string) $req->get_param('values')),
        'note' => sanitize_textarea_field((string) $req->get_param('note')), 'by_member_id' => $me ? $me->id : null, 'by_name' => myf_actor(), 'created' => current_time('mysql')]);
    $cid = (int) $wpdb->insert_id;
    // Status mitführen: n. i. O. sperrt, Reinigung/Prüfung nach Gebrauch gibt wieder frei
    if ($result === 'nok') $wpdb->update(myf_t('devices'), ['status' => 'blocked'], ['id' => $dev->id]);
    elseif (in_array($dev->status, ['used', 'blocked'], true) && $kind !== 'tuev') $wpdb->update(myf_t('devices'), ['status' => 'ready'], ['id' => $dev->id]);
    if ($kind === 'tuev' && $req->get_param('next_due')) $wpdb->update(myf_t('devices'), ['test_due' => myf_date_or_null($req->get_param('next_due'))], ['id' => $dev->id]);
    return ['id' => $cid];
}

add_action('rest_api_init', function () {
    $ns = 'myf/v1';
    register_rest_route($ns, '/admin/device', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => 'myf_api_device_save']);
    register_rest_route($ns, '/admin/check', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => 'myf_api_check_save']);
    // Nach Gebrauch melden (jedes Mitglied, z. B. per QR am Gerät)
    register_rest_route($ns, '/me/device/used', ['methods' => 'POST', 'permission_callback' => 'myf_member_permission', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $dev = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('devices') . ' WHERE id = %d', (int) $req->get_param('id')));
        if (!$dev) return myf_err('Gerät nicht gefunden.', 404);
        if ($dev->status === 'ready') $wpdb->update(myf_t('devices'), ['status' => 'used'], ['id' => $dev->id]);
        $label = myf_ws_rules($dev->area)[$dev->type]['label'] ?? $dev->type;
        myf_notify_area($dev->area, 'device', $label . ' ' . $dev->nr . ' benutzt – bitte prüfen', 'gemeldet von ' . myf_me()->name, 'admin:geraet:' . $dev->id);
        return ['id' => (int) $dev->id];
    }]);
});

// Täglich: Fälligkeiten der Werkstatt an den Bereich Atemschutz (einmal je Gerät und Frist)
add_action('myf_daily_more', function ($today) {
    global $wpdb;
    $checks = array_map('myf_check_out', $wpdb->get_results('SELECT * FROM ' . myf_t('device_checks')));
    $byDev = [];
    foreach ($checks as $c) $byDev[$c['device_id']][] = $c;
    $soon = date('Y-m-d', strtotime($today . ' +30 days'));
    $list = [];
    foreach ($wpdb->get_results('SELECT * FROM ' . myf_t('devices') . " WHERE status <> 'retired'") as $x) {
        $dev = myf_device_out($x);
        $rules = myf_ws_rules($dev['area']);
        foreach (myf_device_due($dev, $byDev[$dev['id']] ?? [], $rules) as $k => $due) {
            if ($due['due'] && $due['due'] <= $soon) $list[$dev['area']][] = ($rules[$dev['type']]['label'] ?? $dev['type']) . ' ' . $dev['nr'] . ': ' . $rules[$dev['type']]['kinds'][$k][0] . ' bis ' . date('d.m.Y', strtotime($due['due']));
        }
    }
    $labels = myf_area_labels();
    foreach ($list as $area => $l) {
        foreach (myf_area_members($area) as $mid) myf_notify([$mid], 'reminder', count($l) . ' Prüfungen fällig: ' . ($labels[$area] ?? $area), implode("\n", array_slice($l, 0, 12)), 'admin:due:' . $area, 'werkstatt:' . $area . ':' . $today);
    }
});
