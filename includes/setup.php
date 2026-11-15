<?php
/**
 * Für jede Feuerwehr nutzbar: Ersteinrichtung (Name, Ort, Einheiten, Standort des Gerätehauses, Warnregion),
 * Quellenangaben für externe Daten und Suchmaschinen-Sperre für alle internen Bereiche.
 */

defined('ABSPATH') || exit;

// Kurzer Shortcode-Name zusätzlich zum alten
add_action('init', function () {
    global $shortcode_tags;
    if (isset($shortcode_tags['myfeuerwehr']) && !isset($shortcode_tags['wehrwerk'])) add_shortcode('wehrwerk', $shortcode_tags['myfeuerwehr']);
}, 20);

// Quellen & Lizenzen: alles, was von außen kommt oder mitgeliefert wird
function myf_credits() {
    return [
        ['what' => 'Wetter', 'source' => 'Deutscher Wetterdienst (DWD), abgerufen über Bright Sky', 'license' => 'Datenbasis: Deutscher Wetterdienst', 'url' => 'https://brightsky.dev'],
        ['what' => 'Amtliche Warnungen', 'source' => 'Bundesamt für Bevölkerungsschutz und Katastrophenhilfe (BBK), Warn-App NINA – mit Warnungen u. a. von DWD, MoWaS, KATWARN, BIWAPP, Hochwasserzentralen', 'license' => 'Quelle: BBK / jeweiliger Herausgeber', 'url' => 'https://warnung.bund.de'],
        ['what' => 'Ortssuche (Einrichtung)', 'source' => 'Nominatim / OpenStreetMap', 'license' => '© OpenStreetMap-Mitwirkende, ODbL 1.0', 'url' => 'https://www.openstreetmap.org/copyright'],
        ['what' => 'Schrift', 'source' => 'Barlow / Barlow Condensed von Jeremy Tribby', 'license' => 'SIL Open Font License 1.1', 'url' => 'https://github.com/jpt/barlow'],
        ['what' => 'QR-Codes', 'source' => 'qrcode-generator von Kazuhiko Arase', 'license' => 'MIT-Lizenz', 'url' => 'https://github.com/kazuhikoarase/qrcode-generator'],
        ['what' => 'Einsatzberichte (optional)', 'source' => 'Plugin „Einsatzverwaltung“ von Andreas Brain', 'license' => 'GPL', 'url' => 'https://wordpress.org/plugins/einsatzverwaltung/'],
    ];
}

// Alle Antworten der Wehrwerk-Schnittstelle: nicht indexieren
add_filter('rest_post_dispatch', function ($res, $server, $req) {
    if (strpos($req->get_route(), '/myf/v1') === 0 && $res instanceof WP_HTTP_Response) $res->header('X-Robots-Tag', 'noindex, nofollow');
    return $res;
}, 10, 3);

// Ort suchen → Koordinaten des Gerätehauses + Regionalschlüssel des Kreises (für die NINA-Warnungen)
function myf_locate($q) {
    $q = trim((string) $q);
    if (mb_strlen($q) < 2) return [];
    $ck = 'myf_loc_' . md5($q);
    if (is_array($c = get_transient($ck))) return $c;
    $res = wp_remote_get(add_query_arg(['q' => $q, 'countrycodes' => 'de', 'format' => 'jsonv2', 'extratags' => 1, 'addressdetails' => 1, 'limit' => 5], 'https://nominatim.openstreetmap.org/search'),
        ['timeout' => 10, 'headers' => ['User-Agent' => 'Wehrwerk/' . MYF_VERSION . ' (' . home_url('/') . ')', 'Accept-Language' => 'de']]);
    if (is_wp_error($res) || wp_remote_retrieve_response_code($res) !== 200) return null;
    $out = [];
    foreach ((array) json_decode(wp_remote_retrieve_body($res), true) as $r) {
        $ars = (string) ($r['extratags']['de:regionalschluessel'] ?? '');
        $a = (array) ($r['address'] ?? []);
        $out[] = ['name' => (string) $r['display_name'], 'lat' => round((float) $r['lat'], 4), 'lon' => round((float) $r['lon'], 4),
            'place' => (string) ($a['village'] ?? $a['town'] ?? $a['city'] ?? $a['municipality'] ?? ''), 'zip' => (string) ($a['postcode'] ?? ''),
            'county' => (string) ($a['county'] ?? ''), 'ars' => preg_match('/^\d{5}/', $ars) ? substr($ars, 0, 5) . '0000000' : ''];
    }
    set_transient($ck, $out, DAY_IN_SECONDS);
    return $out;
}

add_action('rest_api_init', function () {
    register_rest_route('myf/v1', '/admin/locate', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
        $r = myf_locate($req->get_param('q'));
        if ($r === null) return myf_err('Die Ortssuche ist gerade nicht erreichbar – Koordinaten bitte von Hand eintragen.', 502);
        return ['results' => $r];
    }]);
    // Ersteinrichtung in einem Schritt (nur Administratoren)
    register_rest_route('myf/v1', '/admin/setup', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
        if (!current_user_can('manage_options')) return myf_err('Die Einrichtung machen Administratoren.', 403);
        $p = $req->get_json_params() ?: [];
        $sub = new WP_REST_Request('POST', '/myf/v1/admin/settings');
        $body = ['brand' => array_intersect_key((array) ($p['brand'] ?? []), array_flip(['app', 'org', 'place', 'zip', 'address', 'line1', 'line2', 'line3', 'website'])) + ['setup' => 1]];
        foreach (['units', 'screen_lat', 'screen_lon', 'screen_ars', 'incident_vehicles', 'defect_objects'] as $k) if (isset($p[$k])) $body[$k] = $p[$k];
        $sub->set_body_params($body);
        foreach ($body as $k => $v) $sub->set_param($k, $v);
        $r = myf_api_admin_settings($sub);
        if (is_wp_error($r)) return $r;
        return ['ok' => true];
    }]);
});

add_filter('myf_admin_state', function ($d) {
    $d['credits'] = myf_credits();
    $d['profile'] = myf_profile();
    $d['setup_needed'] = current_user_can('manage_options') && empty(myf_brand()['setup']);
    $s = myf_settings();
    $d['units_list'] = array_map(function ($k, $l) { return ['key' => $k, 'label' => $l]; }, array_keys(myf_units()), myf_units());
    return $d;
}, 30);
add_filter('myf_me_data', function ($data) {
    $data['credits'] = myf_credits();
    return $data;
}, 30);
