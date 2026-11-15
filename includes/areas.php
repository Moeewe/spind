<?php
/**
 * Verwaltungsbereiche („Unter-Admins“): Die Verwaltung läuft auch direkt auf der Website. Wer einen Bereich verwalten
 * darf (über Funktionen, z. B. Atemschutzgerätewart → Atemschutz), sieht dort nur diesen Bereich und nur die Daten,
 * die er dafür braucht. Jede Anfrage wird auf dem Server je Bereich geprüft – nicht nur in der Oberfläche.
 */

defined('ABSPATH') || exit;

// Bereiche, die der angemeldete Benutzer verwalten darf (Verwaltung/Administratoren: alle)
function myf_my_areas() {
    static $cache = null;
    if ($cache !== null) return $cache;
    if (myf_can_manage()) return $cache = array_values(array_filter(array_keys(myf_areas()), function ($a) { return $a !== 'agt' || myf_can_agt(); }));
    $me = myf_me();
    if (!$me) return $cache = [];
    $out = [];
    foreach (myf_areas() as $area => $right) if (myf_member_can($right, $me)) $out[] = $area;
    // Wer Karten freigibt, braucht den Bereich dafür
    if (myf_member_can('orders_approve', $me) && !in_array('orders', $out, true)) $out[] = 'orders';
    // Wer die Atemschutzwerkstatt hat, plant auch die Übungsstrecke
    if (in_array('agt', $out, true) && !in_array('strecke', $out, true)) $out[] = 'strecke';
    return $cache = $out;
}
function myf_has_area($area) { return in_array($area, myf_my_areas(), true); }
function myf_is_full_admin() { return myf_can_manage(); }

// Welche Verwaltungs-Route gehört zu welchem Bereich? 'any' = jeder mit mindestens einem Bereich, 'full' = nur Verwaltung
function myf_route_area($route) {
    $p = preg_replace('#^/myf/v1/admin/#', '', $route);
    $map = [
        'state' => 'any', 'profile' => 'any', 'settings' => 'any', 'linkme' => 'any', 'mailtest' => 'members', 'message' => 'any',
        'member' => 'members', 'member/delete' => 'members', 'member/history' => 'members', 'member/history/delete' => 'members', 'member/anonymize' => 'members', 'member/invite' => 'members', 'members/bulk' => 'members', 'member/pwlink' => 'members',
        'member/traits' => 'members', 'trait' => 'members', 'trait/delete' => 'members', 'member/noticeright' => 'screen',
        'member/sizes' => 'clothing', 'stock' => 'clothing', 'stock/delete' => 'clothing', 'clothitem' => 'clothing', 'clothitem/delete' => 'clothing',
        'clothing' => 'clothing', 'clothing/delete' => 'clothing', 'idea' => 'ideas', 'idea/delete' => 'ideas',
        'agt' => 'agt', 'agt/rule' => 'agt', 'agtlog/bulk' => 'agt', 'agtlog/delete' => 'agt',
        'defect' => 'defects', 'defect/delete' => 'defects', 'notice' => 'screen', 'notice/delete' => 'screen',
        'incident' => 'incidents', 'cert/list' => 'incidents', 'cert/handover' => 'incidents', 'incident/report' => 'incidents', 'incident/report/reopen' => 'incidents', 'incident/report/external' => 'incidents', 'incident/part' => 'incidents', 'incident/cert' => 'incidents', 'incident/delete' => 'incidents', 'incident/pub' => 'incidents', 'incident/retention' => 'incidents',
        'audit' => 'full', 'audit/verify' => 'full', 'backup' => 'full', 'restore' => 'full', 'export' => 'any', 'import' => 'any', 'import/ics' => 'incidents', 'alarm' => 'incidents', 'hall' => 'screen', 'demo' => 'demo', 'locate' => 'any', 'setup' => 'full',
        // Diese prüfen den Bereich selbst (Gerät/Liste/Team gehört zu einem Bereich)
        'drills' => 'duties', 'ranks' => 'members', 'promote' => 'members', 'device' => 'any', 'check' => 'any', 'wsrules' => 'any', 'teams' => 'full', 'webreports' => 'incidents',
    ];
    if (isset($map[$p])) return $map[$p];
    foreach (['course', 'courses', 'templates', 'date', 'need', 'qual', 'material'] as $pre) if (strpos($p, $pre) === 0) return 'courses';
    if ($p === 'vehicle/link') return 'incidents'; // Fahrzeugauswahl im Einsatz zuordnen (Einsätze → Einstellungen)
    foreach (['vehicle', 'booking'] as $pre) if (strpos($p, $pre) === 0) return 'vehicles';
    if (strpos($p, 'duty') === 0 || strpos($p, 'team/') === 0) return 'any';
    if (strpos($p, 'board') === 0) return 'board';
    if (strpos($p, 'order/') === 0) return 'orders';
    return 'full';
}

// Berechtigung aller /admin/-Routen
function myf_route_perm(WP_REST_Request $req) {
    if (!is_user_logged_in()) return new WP_Error('myf_auth', 'Bitte neu anmelden.', ['status' => 401]);
    if (myf_can_manage()) return true;
    $area = myf_route_area($req->get_route());
    if ($area === 'demo') return function_exists('myf_demo_can') && myf_demo_can() ? true : new WP_Error('myf_right', 'Dafür fehlt dir das Recht „Demo-Modus“.', ['status' => 403]);
    if ($area === 'full') return new WP_Error('myf_right', 'Nur für die Verwaltung.', ['status' => 403]);
    if ($area === 'any') return myf_my_areas() ? true : new WP_Error('myf_right', 'Dafür fehlt dir die Berechtigung.', ['status' => 403]);
    return myf_has_area($area) ? true : new WP_Error('myf_right', 'Dieser Bereich gehört nicht zu deinen Aufgaben.', ['status' => 403]);
}

// Alle /admin/-Routen auf die Bereichsprüfung umstellen (auch die anderer Dateien)
add_filter('rest_endpoints', function ($endpoints) {
    foreach ($endpoints as $route => &$handlers) {
        if (strpos($route, '/myf/v1/admin/') !== 0) continue;
        foreach ($handlers as $k => &$h) if (is_array($h) && isset($h['permission_callback'])) $h['permission_callback'] = 'myf_route_perm';
    }
    return $endpoints;
}, 99);

// Einstellungen: welcher Schlüssel gehört zu welchem Bereich
function myf_settings_key_area($k) {
    $map = ['year' => 'courses', 'deadline' => 'courses', 'open' => 'courses', 'published' => 'courses', 'intro' => 'courses', 'add_year' => 'courses',
        'clothing_open' => 'clothing', 'clothing_items' => 'clothing', 'ideas_open' => 'ideas', 'defects_open' => 'defects', 'defect_objects' => 'defects',
        'screen_on' => 'screen', 'screen_ical' => 'screen', 'screen_note' => 'screen', 'screen_theme' => 'screen', 'screen_lat' => 'screen', 'screen_lon' => 'screen',
        'new_screen_key' => 'screen', 'screen_ars' => 'screen', 'screen_weather' => 'screen', 'screen_warnings' => 'screen', 'location' => 'screen',
        'brand' => 'full', 'report_form' => 'incidents', 'report_form_reset' => 'incidents', 'incident_vehicles' => 'incidents', 'as_rules' => 'agt', 'retire_age' => 'members', 'report_review' => 'incidents', 'stats_manual' => 'screen', 'screen_reset' => 'screen', 'screen_touch' => 'screen', 'screen_vehicles' => 'screen'];
    return $map[$k] ?? 'full';
}
add_filter('rest_request_before_callbacks', function ($response, $handler, $request) {
    if (is_wp_error($response) || $request->get_route() !== '/myf/v1/admin/settings' || myf_can_manage()) return $response;
    foreach (array_keys((array) $request->get_json_params() + (array) $request->get_body_params()) as $k) {
        $a = myf_settings_key_area($k);
        if ($k === 'lists') {
            foreach (array_keys((array) $request->get_param('lists')) as $l) {
                $need = in_array($l, ['size_keys', 'cloth_cats'], true) ? 'clothing' : 'members';
                if (!myf_has_area($need)) return new WP_Error('myf_right', 'Diese Liste gehört nicht zu deinem Bereich.', ['status' => 403]);
            }
            continue;
        }
        if ($a === 'full' || !myf_has_area($a)) return new WP_Error('myf_right', 'Diese Einstellung gehört nicht zu deinem Bereich.', ['status' => 403]);
    }
    return $response;
}, 6, 3);

// Daten der Verwaltung auf die eigenen Bereiche zuschneiden (Datenschutz zwischen den Bereichen)
add_filter('myf_admin_state', function ($d) {
    $areas = myf_my_areas();
    $d['areas'] = $areas;
    $d['full'] = myf_can_manage();
    $d['area_labels'] = myf_area_labels();
    $d['teams'] = array_map(function ($t) { return ['area' => 'team_' . $t['key'], 'key' => $t['key'], 'name' => $t['name'], 'desc' => (string) ($t['desc'] ?? '')]; }, myf_teams());
    $d['can_agt'] = in_array('agt', $areas, true);
    if ($d['full']) return $d;
    $has = function ($a) use ($areas) { return in_array($a, $areas, true); };
    $drop = function ($keys) use (&$d) { foreach ($keys as $k) unset($d[$k]); };
    if (!$has('courses')) { $d['courses'] = []; $d['dates'] = []; $d['needs'] = []; $d['templates'] = []; $d['upcoming'] = []; $d['to_confirm'] = 0; $d['to_confirm_by_year'] = (object) []; }
    // Übungsstrecke ohne Werkstatt: nur AGT-Kennzeichen und Übungsstrecken-Termine, keine G26-Daten
    if (!$has('agt')) $d['agt_log'] = $has('strecke') ? array_values(array_filter((array) ($d['agt_log'] ?? []), function ($l) { return ($l['kind'] ?? '') === 'strecke'; })) : [];
    if (!$has('clothing')) { $d['clothing'] = []; $d['stock'] = []; }
    if (!$has('ideas')) $d['ideas'] = [];
    if (!$has('defects')) $d['defects'] = [];
    if (!$has('screen')) $d['notices'] = [];
    if (!$has('incidents')) { $d['incidents'] = []; $d['participation'] = []; }
    if (!$has('members')) { $d['member_traits'] = []; unset($d['mail_from'], $d['invite_preview'], $d['rights']); }
    // Mitgliederliste: Namen für alle Bereiche, weitere Angaben nur für den passenden Bereich
    $d['members'] = array_map(function ($m) use ($has) {
        $o = ['id' => $m['id'], 'name' => $m['name'], 'unit' => $m['unit'], 'active' => $m['active'], 'user_id' => $m['user_id'] ? 1 : null, 'can_notice' => $m['can_notice']];
        if ($has('members')) return $m;
        if ($has('agt')) { $o['agt'] = $m['agt']; $o['g26_until'] = $m['g26_until']; }
        elseif ($has('strecke')) $o['agt'] = $m['agt'];
        if ($has('clothing')) $o['sizes'] = $m['sizes'];
        return $o;
    }, $d['members']);
    // Geheimnisse und fremde Einstellungen ausblenden
    $s = $d['settings'];
    if (!$has('screen')) unset($s['screen_url'], $s['screen_ical'], $s['screen_key']);
    $d['settings'] = $s;
    $drop(['can_audit']);
    $d['can_audit'] = false;
    return $d;
}, 99);

// Profil einer Person: nur die Teile der eigenen Bereiche
add_filter('myf_admin_profile', function ($p) {
    if (myf_can_manage()) return $p;
    $has = 'myf_has_area';
    if (!$has('members')) { $m = $p['member']; $p['member'] = array_intersect_key($m, array_flip(['id', 'name', 'unit', 'active', 'user_id', 'agt', 'g26_until', 'sizes'])); $p['member'] += ['email' => '', 'last_login' => '', 'employment' => '', 'day_available' => false, 'note' => '', 'rank' => '', 'can_notice' => false]; }
    if (!$has('members') && !$has('courses')) { $p['needs'] = []; $p['quals'] = []; }
    if (!$has('clothing')) { $p['stock'] = []; $p['clothing'] = []; }
    if (!$has('agt')) { $p['agt_log'] = []; }
    if (!$has('ideas')) $p['ideas'] = [];
    if (!$has('members')) $p['trait_ids'] = [];
    return $p;
}, 99);
