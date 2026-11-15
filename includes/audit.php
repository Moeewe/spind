<?php
/** Änderungsprotokoll (revisionssicher): jede Änderung mit Stand vorher/nachher, nur anhängen, Hash-Kette. */

defined('ABSPATH') || exit;

function myf_audit_entity($path) {
    $map = [
        'me/need' => 'needs', 'me/clothing' => 'clothing', 'me/clothing/withdraw' => 'clothing', 'me/idea' => 'ideas', 'me/ics/reset' => 'members',
        'admin/settings' => 'settings', 'admin/member' => 'members', 'admin/member/delete' => 'members', 'admin/member/invite' => 'members',
        'admin/members/bulk' => 'members', 'admin/agt' => 'members',
        'admin/course' => 'courses', 'admin/course/delete' => 'courses', 'admin/courses/bulk' => 'courses', 'admin/courses/copy' => 'courses',
        'admin/templates/seed' => 'courses',
        'admin/date' => 'dates', 'admin/date/delete' => 'dates', 'admin/date/tpl' => 'dates', 'admin/material' => 'materials', 'admin/material/delete' => 'materials', 'admin/date/complete' => 'dates',
        'admin/need' => 'needs', 'admin/need/delete' => 'needs', 'admin/qual' => 'quals', 'admin/qual/delete' => 'quals',
        'admin/agt/rule' => 'settings', 'admin/agtlog/bulk' => 'agt_log', 'admin/agtlog/delete' => 'agt_log',
        'admin/clothing' => 'clothing', 'admin/clothing/delete' => 'clothing', 'admin/idea' => 'ideas',
        'me/sizes' => 'members', 'me/name' => 'members', 'admin/member/sizes' => 'members', 'admin/member/traits' => 'members', 'me/traits' => 'members', 'me/booking/decide' => 'bookings',
        'admin/stock' => 'cloth_stock', 'admin/stock/delete' => 'cloth_stock',
        'admin/clothitem' => 'cloth_items', 'admin/clothitem/delete' => 'cloth_items',
        'admin/trait' => 'traits', 'admin/trait/delete' => 'traits',
        'me/defect' => 'defects', 'admin/defect' => 'defects', 'admin/defect/delete' => 'defects',
        'me/participation' => 'participation', 'me/incident' => 'incidents', 'me/incident/report' => 'incidents', 'me/incident/report/reopen' => 'incidents', 'admin/incident/report/reopen' => 'incidents', 'me/incident/report/external' => 'incidents', 'admin/incident/report/external' => 'incidents', 'me/incident/part' => 'participation',
        'admin/incident' => 'incidents', 'admin/incident/report' => 'incidents', 'admin/incident/part' => 'participation', 'admin/incident/delete' => 'incidents', 'me/incident/delete' => 'incidents',
        'admin/vehicle' => 'vehicles', 'admin/vehicle/task' => 'vehicle_tasks', 'admin/vehicle/log' => 'vehicle_log', 'admin/vehicle/import' => 'vehicles', 'admin/vehicle/link' => 'vehicles',
        'admin/booking' => 'bookings', 'me/booking' => 'bookings', 'me/order' => 'orders', 'me/order/round' => 'orders', 'me/order/manage' => 'orders', 'me/order/menu' => 'orders', 'admin/order/menu/decide' => 'orders', 'admin/order/menu' => 'orders',
        'admin/duty' => 'duty_lists', 'admin/duty/slots' => 'duty_slots', 'admin/duty/slot' => 'duty_slots', 'admin/duty/assign' => 'duty_assign', 'me/duty' => 'duty_assign',
        'admin/board' => 'board', 'me/rsvp' => 'board_rsvp', 'admin/import' => 'import', 'admin/restore' => 'restore',
        'admin/device' => 'devices', 'admin/check' => 'device_checks', 'me/device/used' => 'devices', 'admin/message' => 'messages', 'me/message' => 'messages',
        'alarm' => 'incidents', 'admin/alarm' => 'settings',
        'admin/setup' => 'settings', 'admin/teams' => 'settings', 'admin/wsrules' => 'settings', 'admin/team/task' => 'team_tasks', 'admin/team/member' => 'members', 'admin/webreports' => 'settings', 'admin/ranks' => 'settings', 'admin/promote' => 'members', 'me/incident/web' => 'incidents', 'admin/incident/pub' => 'incidents', 'admin/drills' => 'drills', 'admin/incident/retention' => 'incidents', 'me/drill/absence' => 'drill_absence',
        'asu' => 'asu', 'asu/reopen' => 'asu', 'asu/file' => 'asu', 'admin/site' => 'settings', 'admin/site/pages' => 'settings', 'admin/site/instagram' => 'settings', 'admin/site/photos' => 'media', 'admin/briefing' => 'briefings', 'admin/briefing/ack' => 'briefings', 'admin/briefing/delete' => 'briefings', 'admin/member/history' => 'members', 'admin/member/history/delete' => 'members', 'admin/member/anonymize' => 'members', 'loan' => 'loans', 'loan/return' => 'loans', 'loan/setup' => 'settings', 'me/briefing' => 'briefings',
        'admin/locker' => 'lockers', 'admin/backup' => 'backup', 'me/2fa' => 'security', 'admin/secret' => 'security',
        'admin/event' => 'events', 'admin/event/delete' => 'events', 'me/notice' => 'notices', 'admin/notice' => 'notices', 'admin/notice/delete' => 'notices', 'admin/member/noticeright' => 'members',
    ];
    return $map[$path] ?? '';
}

// Einstellungen ohne Geheimnisse (Kalender-Link, Display-Schlüssel) protokollieren
function myf_settings_safe() {
    $s = myf_settings();
    $s['screen_ical'] = $s['screen_ical'] ? '(gesetzt)' : '';
    $s['drill_ical'] = !empty($s['drill_ical']) ? '(gesetzt)' : '';
    if (!empty($s['drill_icals'])) $s['drill_icals'] = array_map(function ($c) { return ($c['label'] ?? '') . ' (Link gesetzt)'; }, (array) $s['drill_icals']);
    $s['screen_key'] = $s['screen_key'] ? '(gesetzt, ' . substr(hash('sha256', $s['screen_key']), 0, 8) . ')' : '';
    return myf_audit_mask($s);
}
// Geheimnisse nie ins Protokoll – auch verschachtelt (z. B. Alarm-Schlüssel, Hallen-Schlüssel, Kalender- und Abruf-Links):
// statt des Werts nur „(gesetzt, Prüfsumme)“, damit eine Änderung nachvollziehbar bleibt, ohne den Wert preiszugeben
function myf_audit_mask($v, $k = '') {
    if (is_array($v)) { $o = []; foreach ($v as $kk => $vv) $o[$kk] = myf_audit_mask($vv, is_string($kk) ? $kk : $k); return $o; }
    if (!is_string($v) || $v === '' || strpos($v, '(gesetzt') === 0) return $v;
    // Kurze Kennungen wie „lz1“ oder „jugend“ (Einheiten, Teams) bleiben lesbar – echte Schlüssel sind lang und zufällig
    $secretKey = is_string($k) && (preg_match('/(^|_)(pass|password|secret|ical|ics|pull|webhook)(_|$)/i', $k) || (preg_match('/(^|_)(key|token|hash)(_|$)/i', $k) && strlen($v) >= 16));
    $secretUrl = preg_match('#^(https?|webcal)://#i', $v) && preg_match('/[?&](key|token|t|k|secret|access_token)=|\.ics\b|ical|calsync|private/i', $v);
    return $secretKey || $secretUrl ? '(gesetzt, ' . substr(hash('sha256', $v), 0, 8) . ')' : $v;
}

function myf_audit_row($table, $id) {
    global $wpdb;
    if (!$id || !$table || $table === 'settings' || $table === 'orders') return null;
    $row = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t($table) . ' WHERE id = %d', $id), ARRAY_A);
    if ($row && $table === 'ideas') unset($row['owner_hash']);
    if ($row && $table === 'members') unset($row['ics_ver']);
    return $row ? myf_audit_mask($row) : $row;
}

function myf_audit_target_id($path, WP_REST_Request $req, $me) {
    global $wpdb;
    if ($path === 'me/need' && $me) {
        return (int) $wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('needs') . ' WHERE member_id = %d AND course_id = %d', $me->id, (int) $req->get_param('course_id')));
    }
    if (in_array($path, ['me/ics/reset', 'me/name', 'me/sizes'], true) && $me) return (int) $me->id;
    // Beteiligung: Zeile über Einsatz + Mitglied finden, damit „vorher“ (auch beim Entfernen) im Protokoll steht
    if (in_array($path, ['me/participation', 'me/incident/part', 'admin/incident/part'], true)) {
        $mid = $path === 'me/participation' ? ($me ? (int) $me->id : 0) : (int) $req->get_param('member_id');
        return (int) $wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('participation') . ' WHERE incident_id = %d AND member_id = %d', (int) $req->get_param('incident_id'), $mid));
    }
    return (int) $req->get_param('id');
}

add_filter('rest_request_before_callbacks', function ($response, $handler, $request) {
    if (!preg_match('#^/myf/v1/(.+)$#', $request->get_route(), $m) || $request->get_method() !== 'POST') return $response;
    $path = $m[1];
    $me = strpos($path, 'me/') === 0 ? myf_me() : null;
    $table = myf_audit_entity($path);
    $id = myf_audit_target_id($path, $request, $me);
    $GLOBALS['myf_audit_ctx'] = ['path' => $path, 'table' => $table, 'id' => $id, 'me' => $me,
        'before' => $table === 'settings' ? myf_settings_safe() : myf_audit_row($table, $id)];
    return $response;
}, 10, 3);

add_filter('rest_request_after_callbacks', function ($response, $handler, $request) {
    $ctx = $GLOBALS['myf_audit_ctx'] ?? null;
    if (!$ctx) return $response;
    unset($GLOBALS['myf_audit_ctx']);
    if (is_wp_error($response)) return $response; // abgewiesene Anfragen ändern nichts
    $path = $ctx['path'];
    // Essensbestellungen gehören nicht ins dauerhafte Protokoll: nur Start und Löschen einer Runde, ohne Inhalte
    if ($path === 'me/order' || ($path === 'me/order/manage' && $request->get_param('do') !== 'delete')) return $response;
    $data = $response instanceof WP_REST_Response ? $response->get_data() : (is_array($response) ? $response : []);
    $id = $ctx['id'] ?: (int) ($data['id'] ?? 0);
    if ($path === 'me/need' && !$id && $ctx['me']) $id = myf_audit_target_id($path, $request, $ctx['me']);
    $params = $request->get_params();
    if ($path === 'me/order/round' || $path === 'me/order/manage') $params = array_intersect_key($params, array_flip(['id', 'do']));
    if (isset($params['photos'])) $params['photos'] = count((array) $params['photos']) . ' Foto(s)';
    if (!empty($params['screen_ical'])) $params['screen_ical'] = '(Kalender-Link geändert)';
    if (!empty($params['ical'])) $params['ical'] = '(Kalender-Link geändert)';
    if (isset($params['ical_add']) && is_array($params['ical_add'])) $params['ical_add'] = ['label' => $params['ical_add']['label'] ?? '', 'url' => '(Kalender-Link)'];
    // Dateien, Sicherungen und Massendaten nicht im Klartext protokollieren
    array_walk_recursive($params, function (&$v) { if (is_string($v) && strpos($v, 'data:') === 0) $v = '(Datei, ' . round(strlen($v) / 1365) . ' KB)'; elseif (is_string($v) && strlen($v) > 4000) $v = '(' . strlen($v) . ' Zeichen)'; });
    if (isset($params['backup'])) $params['backup'] = '(Datensicherung)';
    if (isset($params['report']) && is_array($params['report'])) $params['report'] = 'Felder: ' . implode(', ', array_keys(array_filter($params['report'], function ($v) { return $v !== '' && $v !== []; })));
    foreach (['content', 'location'] as $k) if ($path === 'me/incident/web' && isset($params[$k])) $params[$k] = '(' . strlen((string) $params[$k]) . ' Zeichen)';
    if (isset($params['rows']) && is_array($params['rows'])) $params['rows'] = count($params['rows']) . ' Zeilen';

    $u = wp_get_current_user();
    if ($path === 'alarm') {
        // Alarm-Schnittstelle: nur Feldnamen protokollieren, Inhalte stehen im Alarm-Protokoll (14 Tage)
        $actor = ['system', 0, 'Alarm-Schnittstelle'];
        $params = ['felder' => implode(', ', array_keys(myf_alarm_flatten($params)))];
    } elseif (strpos($path, 'admin/') === 0 || strpos($path, 'asu') === 0 || strpos($path, 'loan') === 0) {
        $actor = ['admin', (int) $u->ID, $u->display_name ?: $u->user_login];
    } elseif ($path === 'me/idea' && $request->get_param('anonymous')) {
        $actor = ['anonym', 0, '']; // anonyme Anregung: auch im Protokoll ohne Absender
    } else {
        $actor = ['member', $ctx['me'] ? (int) $ctx['me']->id : 0, $ctx['me'] ? $ctx['me']->name : ''];
    }
    $after = $ctx['table'] === 'settings' ? myf_settings_safe() : (substr($path, -7) === '/delete' ? null : myf_audit_row($ctx['table'], $id));
    // Geheimnisse nie ins Protokoll: Kennwörter, Bestätigungscodes, Notfall-Codes, 2FA-Schlüssel, Sicherungs-Links
    foreach (['pass', 'password', 'code', 'confirm_code', 'key', 'token'] as $k) if (isset($params[$k])) $params[$k] = '••••';
    if ($path === 'me/2fa') $data = ['ok' => !is_wp_error($response) && !($response instanceof WP_Error)];
    if ($path === 'admin/backup') $data = array_intersect_key((array) $data, array_flip(['ok', 'id', 'rows', 'archive_before']));
    unset($data['mine'], $data['all']); // Kalender-Links nicht protokollieren
    if (isset($data['url'])) $data['url'] = '(persönlicher Passwort-Link erzeugt)';
    if (substr($path, -13) === 'incident/cert') $data = ['bescheinigungen' => count($data['items'] ?? [])]; // keine Geburtsdaten ins Protokoll
    if (substr($path, -13) === 'cert/handover') $data = ['uebergeben' => $data['n'] ?? 0, 'an' => $data['office']['name'] ?? '', 'ids' => $params['ids'] ?? []];
    if (in_array($path, ['admin/archive', 'admin/reset', 'admin/restore'], true)) $data = array_intersect_key($data, array_flip(['ok', 'id', 'rows', 'archive_id', 'archive_before', 'reset'])); // keine Archiv-Inhalte ins Protokoll
    if (substr($path, -10) === 'admin/demo') $data = ['ok' => !is_wp_error($response) && !($response instanceof WP_Error)]; // keine Demo-Passwörter ins Protokoll (Aktion steht in params)
    // Anonymisieren: die gelöschten Personendaten dürfen nicht im Protokoll weiterleben – nur, dass es geschah
    if ($path === 'admin/member/anonymize') { $ctx['before'] = ['id' => $id]; $after = ['id' => $id, 'anonymisiert' => true]; }
    myf_audit_write($actor[0], $actor[1], $actor[2], $path, $ctx['table'], $id ?: null,
        myf_audit_mask(['before' => $ctx['before'], 'after' => $after, 'params' => $params, 'result' => $data]));
    return $response;
}, 10, 3);

function myf_audit_hash($prev, $r) {
    return hash('sha256', implode('|', [$prev, $r['ts'], $r['actor_type'], $r['actor_id'], $r['actor_name'], $r['action'], $r['entity'], (string) $r['entity_id'], $r['data']]));
}

function myf_audit_write($actorType, $actorId, $actorName, $action, $entity, $entityId, $data) {
    global $wpdb;
    $t = myf_t('audit');
    // Hash-Kette auch bei vielen gleichzeitigen Einträgen: Sperre (MySQL) und zusätzlich ein eindeutiger Vorgänger je Eintrag –
    // schreibt jemand gleichzeitig, scheitert der zweite Eintrag am Schlüssel und wird mit dem neuen Vorgänger wiederholt
    $wpdb->query("SELECT GET_LOCK('myf_audit', 5)");
    $r = ['ts' => current_time('mysql', true), 'actor_type' => $actorType, 'actor_id' => (int) $actorId, 'actor_name' => (string) $actorName,
        'action' => $action, 'entity' => $entity, 'entity_id' => $entityId, 'data' => wp_json_encode($data, JSON_UNESCAPED_UNICODE)];
    $was = $wpdb->suppress_errors(true);
    for ($try = 0; $try < 12; $try++) {
        $prev = (string) $wpdb->get_var("SELECT hash FROM $t ORDER BY id DESC LIMIT 1");
        $r['prev_hash'] = $prev;
        $r['hash'] = myf_audit_hash($prev, $r);
        if ($wpdb->insert($t, $r)) break;
        usleep(random_int(3000, 25000));
    }
    $wpdb->suppress_errors($was);
    $wpdb->query("SELECT RELEASE_LOCK('myf_audit')");
}

add_action('rest_api_init', function () {
    $perm = function () { return current_user_can('manage_options'); };
    register_rest_route('myf/v1', '/admin/audit', ['methods' => 'GET', 'permission_callback' => $perm, 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $t = myf_t('audit');
        $limit = $req->get_param('all') ? 100000 : max(1, min(500, (int) ($req->get_param('limit') ?: 200)));
        $offset = max(0, (int) $req->get_param('offset'));
        // Suche über Wer, Aktion, Bereich und Inhalt – auch bei Jahren an Einträgen direkt auf dem Server
        $where = '1=1'; $args = [];
        foreach (array_slice(array_filter(preg_split('/\s+/u', trim((string) $req->get_param('q')))), 0, 5) as $w) {
            $like = '%' . $wpdb->esc_like($w) . '%';
            $where .= ' AND (actor_name LIKE %s OR action LIKE %s OR entity LIKE %s OR data LIKE %s)'; array_push($args, $like, $like, $like, $like);
        }
        $count = $args ? (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM $t WHERE $where", $args)) : (int) $wpdb->get_var("SELECT COUNT(*) FROM $t");
        $rows = $wpdb->get_results($wpdb->prepare("SELECT * FROM $t WHERE $where ORDER BY id DESC LIMIT %d OFFSET %d", array_merge($args, [$limit, $offset])));
        return ['total' => (int) $wpdb->get_var("SELECT COUNT(*) FROM $t"), 'found' => $count, 'offset' => $offset, 'limit' => $limit, 'rows' => array_map(function ($r) {
            return ['id' => (int) $r->id, 'ts' => get_date_from_gmt($r->ts), 'actor_type' => $r->actor_type, 'actor_name' => $r->actor_name,
                'action' => $r->action, 'entity' => $r->entity, 'entity_id' => $r->entity_id ? (int) $r->entity_id : null,
                'data' => json_decode((string) $r->data, true), 'hash' => $r->hash];
        }, $rows)];
    }]);
    register_rest_route('myf/v1', '/admin/audit/verify', ['methods' => 'GET', 'permission_callback' => $perm, 'callback' => function () {
        global $wpdb;
        $t = myf_t('audit');
        $prev = ''; $n = 0; $last = 0;
        do {
            $rows = $wpdb->get_results($wpdb->prepare("SELECT * FROM $t WHERE id > %d ORDER BY id LIMIT 1000", $last), ARRAY_A);
            foreach ($rows as $r) {
                if ($r['prev_hash'] !== $prev || myf_audit_hash($prev, $r) !== $r['hash']) return ['ok' => false, 'count' => $n, 'broken_id' => (int) $r['id']];
                $prev = $r['hash']; $last = (int) $r['id']; $n++;
            }
        } while ($rows);
        return ['ok' => true, 'count' => $n, 'last_hash' => $prev];
    }]);
});

// Geheime Links in der Verwaltung: Anzeigen, Kopieren und Öffnen steht im Protokoll (nur welcher Link und was – nie der Link selbst)
add_action('rest_api_init', function () {
    register_rest_route('myf/v1', '/admin/secret', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
        $how = (string) $req->get_param('how');
        if (!in_array($how, ['angezeigt', 'kopiert', 'geöffnet'], true)) return myf_err('Unbekannte Aktion.');
        $req->set_param('what', mb_substr(sanitize_text_field((string) $req->get_param('what')), 0, 80));
        return ['ok' => true];
    }]);
});

