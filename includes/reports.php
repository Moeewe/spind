<?php
/**
 * Öffentliche Einsatzberichte direkt aus Wehrwerk (wie das Plugin „Einsatzverwaltung“): Liste je Jahr mit Statistik,
 * Einzelbericht, Schnittstelle /myf/v1/public/incidents. Öffentlich sind NUR die eigens freigegebenen Angaben
 * (Titel, Art, Ort ohne Hausnummer, Fahrzeuge, Text, Zeiten, Zahl der Kräfte) – nie der interne Bericht.
 * Shortcode [wehrwerk_einsatzberichte]. Woher die Einsätze kommen (Alarm, Einsatzverwaltung, Schnellerfassung, von Hand) ist egal.
 */

defined('ABSPATH') || exit;

function myf_reports_page_url() {
    global $wpdb;
    $id = $wpdb->get_var("SELECT ID FROM {$wpdb->posts} WHERE post_type = 'page' AND post_status = 'publish' AND post_content LIKE '%[wehrwerk_einsatzberichte%' LIMIT 1");
    return $id ? get_permalink((int) $id) : '';
}

// Website-Status eines Einsatzes: eigener Bericht (Wehrwerk) oder Beitrag der Einsatzverwaltung
function myf_incident_web($i) {
    if (!empty($i->pub_status)) {
        $u = myf_reports_page_url();
        return ['id' => (int) $i->id, 'status' => $i->pub_status === 'publish' ? 'publish' : 'draft', 'link' => $u && $i->pub_status === 'publish' ? add_query_arg('eb', (int) $i->id, $u) : '', 'native' => true];
    }
    if ($i->post_id && get_post_status((int) $i->post_id)) return ['id' => (int) $i->post_id, 'status' => get_post_status((int) $i->post_id), 'link' => get_permalink((int) $i->post_id), 'native' => false];
    return null;
}

function myf_pub_save(WP_REST_Request $req) {
    global $wpdb;
    $info = myf_web_info();
    if (empty($info['can'])) return myf_err('Website-Berichte schreibt bei euch die Verwaltung.', 403);
    $i = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('incidents') . ' WHERE id = %d', (int) $req->get_param('id')));
    if (!$i) return myf_err('Einsatz nicht gefunden.', 404);
    $title = mb_substr(sanitize_text_field((string) $req->get_param('title')), 0, 200);
    if ($title === '') return myf_err('Bitte einen Titel angeben.');
    // Berichtstext nie direkt veröffentlichen – erst prüfen und kürzen (Freigabe in der Verwaltung)
    $publish = $req->get_param('publish') && !empty($info['publish']) && trim((string) $req->get_param('content')) === '';
    $wpdb->update(myf_t('incidents'), [
        'pub_status' => $publish ? 'publish' : 'draft', 'pub_title' => $title,
        'pub_type' => mb_substr(sanitize_text_field((string) $req->get_param('keyword')), 0, 80),
        'pub_place' => mb_substr(sanitize_text_field((string) $req->get_param('location')), 0, 200),
        'pub_text' => sanitize_textarea_field((string) $req->get_param('content')),
        'pub_res' => wp_json_encode(array_values(array_filter(array_map('sanitize_text_field', (array) $req->get_param('resources'))))),
        'pub_at' => current_time('mysql'), 'pub_by' => myf_actor(),
    ], ['id' => $i->id]);
    if (!$publish) myf_notify_area('incidents', 'info', 'Website-Bericht zur Freigabe: ' . $title, 'von ' . myf_actor(), 'admin:incident:' . (int) $i->id);
    $u = myf_reports_page_url();
    return ['ok' => true, 'status' => $publish ? 'publish' : 'draft', 'link' => $publish && $u ? add_query_arg('eb', (int) $i->id, $u) : ''];
}

// Öffentliche Daten eines Einsatzes (nur freigegebene Felder)
function myf_pub_out($i, $detail = false) {
    global $wpdb;
    $o = ['id' => (int) $i->id, 'nr' => $i->nr, 'title' => $i->pub_title, 'type' => $i->pub_type, 'category' => $i->category, 'start' => $i->start, 'end' => $i->end, 'place' => $i->pub_place];
    if ($detail) {
        $o['text'] = (string) $i->pub_text;
        $o['resources'] = json_decode((string) $i->pub_res, true) ?: [];
        $o['strength'] = (int) $wpdb->get_var($wpdb->prepare('SELECT COUNT(*) FROM ' . myf_t('participation') . ' WHERE incident_id = %d AND confirmed = 1', $i->id));
    }
    return $o;
}
function myf_pub_years() {
    global $wpdb;
    return array_map('intval', $wpdb->get_col('SELECT DISTINCT YEAR(start) y FROM ' . myf_t('incidents') . " WHERE pub_status = 'publish' ORDER BY y DESC"));
}
function myf_pub_list($year) {
    global $wpdb;
    return $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . myf_t('incidents') . " WHERE pub_status = 'publish' AND start >= %s AND start < %s ORDER BY start DESC", $year . '-01-01', ($year + 1) . '-01-01'));
}

add_action('rest_api_init', function () {
    // Offene Schnittstelle für andere Werkzeuge (z. B. Website-Baukasten, App): nur veröffentlichte, öffentliche Angaben
    register_rest_route('myf/v1', '/public/incidents', ['methods' => 'GET', 'permission_callback' => '__return_true', 'callback' => function (WP_REST_Request $req) {
        $year = (int) $req->get_param('year') ?: (int) current_time('Y');
        return ['year' => $year, 'years' => myf_pub_years(), 'incidents' => array_map(function ($i) { return myf_pub_out($i, true); }, myf_pub_list($year))];
    }]);
    // Freigabe durch die Verwaltung / Einsatzführung mit Veröffentlichungsrecht
    register_rest_route('myf/v1', '/admin/incident/pub', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $st = (string) $req->get_param('status');
        if (!in_array($st, ['publish', 'draft', ''], true)) return myf_err('Unbekannter Status.');
        if ($st === 'publish' && !current_user_can('manage_options') && myf_web_mode() !== 'publish') return myf_err('Veröffentlichen dürfen bei euch nur Administratoren.', 403);
        $wpdb->update(myf_t('incidents'), ['pub_status' => $st], ['id' => (int) $req->get_param('id')]);
        return ['id' => (int) $req->get_param('id')];
    }]);
});

add_shortcode('wehrwerk_einsatzberichte', function ($atts) {
    wp_enqueue_style('myf-public', MYF_URL . 'assets/public.css', [], MYF_ASSET_VER);
    global $wpdb;
    $cats = MYF_INCIDENT_CATS;
    $base = get_permalink() ?: home_url('/');
    $id = isset($_GET['eb']) ? (int) $_GET['eb'] : 0;
    if ($id) {
        $i = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('incidents') . " WHERE id = %d AND pub_status = 'publish'", $id));
        if (!$i) return '<div class="wwp"><p>Dieser Einsatzbericht ist nicht (mehr) veröffentlicht.</p><a class="wwp-back" href="' . esc_url($base) . '">← alle Einsätze</a></div>';
        $o = myf_pub_out($i, true);
        $dur = $o['end'] ? max(0, round((strtotime($o['end']) - strtotime($o['start'])) / 60)) : 0;
        $row = function ($k, $v) { return $v === '' || $v === null ? '' : '<div><dt>' . esc_html($k) . '</dt><dd>' . $v . '</dd></div>'; };
        return '<article class="wwp wwp-one"><a class="wwp-back" href="' . esc_url(add_query_arg('jahr', substr($o['start'], 0, 4), $base)) . '">← alle Einsätze ' . esc_html(substr($o['start'], 0, 4)) . '</a>' .
            '<div class="wwp-kicker">' . esc_html(($o['nr'] ? 'Einsatz ' . $o['nr'] . ' · ' : '') . ($cats[$o['category']] ?? '')) . '</div><h2>' . esc_html($o['title']) . '</h2><dl class="wwp-facts">' .
            $row('Alarmierung', esc_html(date_i18n('l, d.m.Y · H:i', strtotime($o['start']))) . ' Uhr') .
            $row('Dauer', $dur ? esc_html(floor($dur / 60) . ':' . str_pad((string) ($dur % 60), 2, '0', STR_PAD_LEFT) . ' Std.') : '') .
            $row('Einsatzart', esc_html($o['type'])) . $row('Einsatzort', esc_html($o['place'])) .
            $row('Fahrzeuge', $o['resources'] ? esc_html(implode(', ', $o['resources'])) : '') . $row('Einsatzkräfte', $o['strength'] ? (string) $o['strength'] : '') . '</dl>' .
            ($o['text'] !== '' ? '<div class="wwp-text">' . wpautop(esc_html($o['text'])) . '</div>' : '') . '</article>';
    }
    $years = myf_pub_years();
    $year = isset($_GET['jahr']) ? (int) $_GET['jahr'] : ($years[0] ?? (int) current_time('Y'));
    $list = myf_pub_list($year);
    $count = [];
    foreach ($list as $i) $count[$i->category] = ($count[$i->category] ?? 0) + 1;
    $h = '<div class="wwp"><nav class="wwp-years">' . implode('', array_map(function ($y) use ($year, $base) {
        return '<a href="' . esc_url(add_query_arg('jahr', $y, $base)) . '"' . ($y === $year ? ' aria-current="page"' : '') . '>' . $y . '</a>';
    }, $years ?: [$year])) . '</nav>';
    $h .= '<div class="wwp-stats"><div><b>' . count($list) . '</b><span>Einsätze ' . $year . '</span></div>' . implode('', array_map(function ($k) use ($count, $cats) {
        return '<div class="c-' . esc_attr($k) . '"><b>' . (int) $count[$k] . '</b><span>' . esc_html($cats[$k] ?? $k) . '</span></div>';
    }, array_keys($count))) . '</div>';
    if (!$list) return $h . '<p>Für ' . $year . ' sind noch keine Einsatzberichte veröffentlicht.</p></div>';
    $h .= '<ol class="wwp-list">' . implode('', array_map(function ($i) use ($base, $cats) {
        return '<li><a href="' . esc_url(add_query_arg('eb', (int) $i->id, $base)) . '"><time>' . esc_html(date_i18n('d.m.', strtotime($i->start))) . '<small>' . esc_html(date_i18n('H:i', strtotime($i->start))) . '</small></time>' .
            '<span class="t"><b>' . esc_html($i->pub_title) . '</b><small>' . esc_html(implode(' · ', array_filter([$i->nr ? 'Nr. ' . $i->nr : '', $i->pub_type ?: ($cats[$i->category] ?? ''), $i->pub_place]))) . '</small></span><i class="c-' . esc_attr($i->category) . '"></i></a></li>';
    }, $list)) . '</ol></div>';
    return $h;
});
