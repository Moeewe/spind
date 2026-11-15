<?php
/**
 * Website im SPIND-Design: eigene Seitenvorlage (Kopf, Menü, Fuß) und Bausteine als Shortcodes.
 * Die Seiten sind normale WordPress-Seiten – Texte und Bilder bleiben im Editor änderbar. Live-Daten (Einsätze, Zahlen,
 * Neuigkeiten, Dienstabende) kommen aus Einsatzverwaltung, Beiträgen und SPIND. Öffentlich wird nur, was ohnehin
 * öffentlich ist: Einsatztitel/-art/Fahrzeuge der Website, Beiträge, Anzahlen, Dienstabend-Termine (ohne Namen).
 * „Seiten als Entwurf anlegen“ (Verwaltung → Einstellungen → Website) baut alle Seiten mit den bisherigen Texten auf – nichts wird überschrieben.
 */

defined('ABSPATH') || exit;

const MYF_SITE_TPL = 'wehrwerk-website';

function myf_site() {
    $s = (array) (myf_settings()['site'] ?? []);
    $b = myf_brand();
    return wp_parse_args($s, (array) apply_filters('myf_site_defaults', [
        'claim' => 'Wir brennen für den Einsatz. Alles andere können wir löschen.',
        'street' => '', 'zip' => $b['zip'] ?: '', 'city' => $b['place'] ?: '', 'phone' => '', 'mail' => '',
        'instagram' => '', 'facebook' => '', 'imprint' => '', 'privacy' => '', 'founded' => '', 'members' => '', 'vehicles' => '',
        'drills_public' => 1, 'drill_place' => '',
    ], myf_profile()));
}
function myf_site_pages() { return (array) get_option('myf_site_pages', []); }
function myf_site_link($key, $fallback = '') {
    $p = myf_site_pages();
    if (!empty($p[$key]) && get_post_status($p[$key])) return get_permalink($p[$key]);
    return $fallback;
}
function myf_site_is() { return is_singular('page') && get_page_template_slug() === MYF_SITE_TPL; }

// Vorlage im Seiten-Editor anbieten und ausliefern
add_filter('theme_page_templates', function ($t) { $t[MYF_SITE_TPL] = 'SPIND-Website'; return $t; });
add_filter('template_include', function ($tpl) { return myf_site_is() ? MYF_DIR . 'includes/site-template.php' : $tpl; }, 99);
// Auf diesen Seiten nur eigene Gestaltung: Theme-, Elementor- und Slider-Styles weglassen (Cookie-Banner & Co. bleiben)
add_action('wp_enqueue_scripts', function () {
    if (!myf_site_is()) return;
    wp_enqueue_style('myf-site', MYF_URL . 'assets/site.css', [], MYF_ASSET_VER);
    wp_enqueue_script('myf-site', MYF_URL . 'assets/site.js', [], MYF_ASSET_VER, true);
}, 20);
add_action('wp_print_styles', function () {
    if (!myf_site_is()) return;
    global $wp_styles;
    foreach ((array) $wp_styles->queue as $h) {
        $src = (string) ($wp_styles->registered[$h]->src ?? '');
        if (preg_match('#/themes/|elementor|revslider|razzi|wp-block-library|global-styles|classic-theme#i', $src . ' ' . $h)) wp_dequeue_style($h);
    }
}, 100);
add_action('after_setup_theme', function () { register_nav_menus(['myf_site' => 'SPIND-Website: Hauptmenü']); }, 20);

// Menü: eigenes WordPress-Menü (Design → Menüs → „SPIND-Website: Hauptmenü“), sonst aus den angelegten Seiten
function myf_site_nav() {
    $loc = get_nav_menu_locations();
    if (!empty($loc['myf_site']) && ($items = wp_get_nav_menu_items($loc['myf_site']))) {
        $tree = [];
        foreach ($items as $i) if (!$i->menu_item_parent) $tree[$i->ID] = ['t' => $i->title, 'u' => $i->url, 'c' => []];
        foreach ($items as $i) if ($i->menu_item_parent && isset($tree[$i->menu_item_parent])) $tree[$i->menu_item_parent]['c'][] = ['t' => $i->title, 'u' => $i->url];
        return array_values($tree);
    }
    $home = home_url('/');
    return [
        ['t' => 'Start', 'u' => myf_site_link('start', $home), 'c' => []],
        ['t' => 'Einsätze', 'u' => myf_site_link('einsaetze', home_url('/einsaetze/')), 'c' => []],
        ['t' => 'Neuigkeiten', 'u' => myf_site_link('neuigkeiten', home_url('/neuigkeiten/')), 'c' => []],
        // Unterpunkte: nur Seiten, die es gibt; ein Zusatz mit örtlichen Vorgaben kann weitere Einheiten ergänzen
        ['t' => 'Einheiten', 'u' => myf_site_link('einheiten', home_url('/einheiten/')), 'c' => array_values(array_filter((array) apply_filters('myf_site_nav_units', [
            ['t' => 'Leitung der Feuerwehr', 'u' => myf_site_link('leitung')],
            ['t' => 'Jugendfeuerwehr', 'u' => myf_site_link('jugend')],
            ['t' => 'Ehrenabteilung', 'u' => myf_site_link('ehren')],
            ['t' => 'Brandschutzerziehung', 'u' => myf_site_link('bse')],
            ['t' => 'Feuerwehrchor', 'u' => myf_site_link('chor')],
        ]), function ($x) { return $x['u'] !== ''; }))],
        ['t' => 'Termine', 'u' => myf_site_link('termine', home_url('/termine/')), 'c' => []],
        ['t' => 'Kontakt', 'u' => myf_site_link('kontakt', home_url('/kontakt/')), 'c' => []],
    ];
}

// ---- Bausteine -------------------------------------------------------------------------------------------------------
// WordPress macht im Seiteninhalt aus „1024x681“ ein „1024×681“ (wptexturize) – in Adressen wieder zurückdrehen
function myf_site_url($u) { return preg_replace('/(\d)\s*[×]\s*(\d)/u', '$1x$2', html_entity_decode((string) $u, ENT_QUOTES, 'UTF-8')); }
function myf_site_img($url, $alt = '', $cls = '') {
    $url = myf_site_url($url);
    return $url ? '<img src="' . esc_url($url) . '" alt="' . esc_attr($alt) . '" loading="lazy" decoding="async"' . ($cls ? ' class="' . esc_attr($cls) . '"' : '') . '>' : '';
}
function myf_site_sc_content($c) { return do_shortcode(shortcode_unautop(wpautop(trim((string) $c)))); }

// Großes Titelbild mit Spruch und zwei Knöpfen
add_shortcode('ww_hero', function ($a) {
    $s = myf_site();
    $a = shortcode_atts(['bild' => '', 'spruch' => $s['claim'], 'kicker' => myf_brand()['org'], 'knopf' => 'Mitglied werden', 'link' => myf_site_link('mitmachen', home_url('/feuerwehrmann-werden/')),
        'knopf2' => 'Aktuelle Einsätze', 'link2' => myf_site_link('einsaetze', home_url('/einsaetze/')), 'klein' => '', 'video' => ''], $a);
    // Spruch wie die NRW-Kampagne: »Erster Satz rot hinterlegt. Rest weiß.« – nur im großen Kopfbereich
    $sp = esc_html($a['spruch']);
    if (!$a['klein'] && preg_match('/^(.+?[.!?])\s+(.+)$/u', $a['spruch'], $m)) $sp = '<span class="ws-q">»</span><span class="ws-hl">' . esc_html($m[1]) . '</span> ' . esc_html(rtrim($m[2])) . '<span class="ws-q">«</span>';
    // Video nur als Zusatz: Standbild bleibt darunter (Handy, Datensparen, „weniger Bewegung“ zeigen nur das Bild)
    $vid = $a['video'] && !$a['klein'] ? '<video class="ws-hero-img ws-hero-vid" muted playsinline loop preload="none" aria-hidden="true" data-src="' . esc_url(myf_site_url($a['video'])) . '"' . ($a['bild'] ? ' poster="' . esc_url(myf_site_url($a['bild'])) . '"' : '') . '></video>' : '';
    return '<section class="ws-hero' . ($a['klein'] ? ' is-small' : '') . '">' . ($a['bild'] ? myf_site_img($a['bild'], '', 'ws-hero-img') : '') . $vid . '<div class="ws-hero-in"><p class="ws-kicker"><span>' . esc_html($a['kicker']) . '</span></p>' .
        '<h1>' . $sp . '</h1>' . ($a['klein'] ? '' : '<div class="ws-btns">' . ($a['knopf'] ? '<a class="ws-btn is-red" href="' . esc_url($a['link']) . '">' . esc_html($a['knopf']) . '</a>' : '') .
        ($a['knopf2'] ? '<a class="ws-btn is-ghost" href="' . esc_url($a['link2']) . '">' . esc_html($a['knopf2']) . '</a>' : '') . '</div><p class="ws-112"><b>Notruf 112</b> – Feuer, Unfall, Menschen in Gefahr</p>') . '</div></section>';
});

// Abschnitt mit roter Überschrift (wie in der App)
add_shortcode('ww_abschnitt', function ($a, $c = '') {
    $a = shortcode_atts(['titel' => '', 'kicker' => '', 'grau' => '', 'bild' => '', 'id' => ''], $a);
    return '<section class="ws-sec' . ($a['grau'] ? ' is-soft' : '') . ($a['bild'] ? ' has-img' : '') . '"' . ($a['id'] ? ' id="' . esc_attr($a['id']) . '"' : '') . '><div class="ws-wrap">' .
        ($a['bild'] ? '<div class="ws-split"><div>' : '') . ($a['kicker'] ? '<p class="ws-kick">' . esc_html($a['kicker']) . '</p>' : '') . ($a['titel'] ? '<h2 class="ws-h"><span>' . esc_html($a['titel']) . '</span></h2>' : '') .
        '<div class="ws-text">' . myf_site_sc_content($c) . '</div>' . ($a['bild'] ? '</div><figure class="ws-fig">' . myf_site_img($a['bild']) . '</figure></div>' : '') . '</div></section>';
});

// Zahlen: aktive Kräfte, Einsätze dieses Jahr (live), Fahrzeuge, Jahre – auf Wunsch über einem Foto (z. B. Fahrzeuge vor dem Gerätehaus)
add_shortcode('ww_zahlen', function ($a) {
    global $wpdb;
    $a = shortcode_atts(['bild' => '', 'titel' => 'Im Einsatz für unsere Gemeinde', 'kicker' => 'In Zahlen'], $a);
    $s = myf_site(); $y = (int) current_time('Y');
    $st = function_exists('myf_incident_stats') ? myf_incident_stats(2) : [];
    $inc = (int) ($st[$y]['total'] ?? 0); $prev = (int) ($st[$y - 1]['total'] ?? 0);
    $mem = $s['members'] !== '' ? $s['members'] : (string) $wpdb->get_var('SELECT COUNT(*) FROM ' . myf_t('members') . " WHERE active = 1 AND dept = 'einsatz'");
    $veh = $s['vehicles'] !== '' ? $s['vehicles'] : (string) $wpdb->get_var('SELECT COUNT(*) FROM ' . myf_t('vehicles') . ' WHERE active = 1 AND in_incidents = 1');
    $units = function_exists('myf_units') ? implode(' & ', array_map('myf_unit_short', array_values(myf_units()))) : '';
    $tiles = [[$mem ?: '', 'Aktive Kräfte', 'Ehrenamtlich in ' . ($units ?: 'unseren Einheiten') . ' – dazu Jugendfeuerwehr und Ehrenabteilung.'],
        [$inc, 'Einsätze ' . $y, $prev ? 'Im Vorjahr waren es ' . $prev . ' – Brände, Unfälle, Unwetter und Hilfeleistungen.' : 'Live aus unserer Einsatzverwaltung.'],
        [$veh ?: '', 'Einsatzfahrzeuge', 'Moderner Fuhrpark – für jede Lage das passende Fahrzeug.'],
        [$s['founded'] ? ($y - (int) $s['founded']) : '', 'Jahre Feuerwehr', $s['founded'] ? 'Seit ' . $s['founded'] . ' für Sie da – rund um die Uhr.' : '']];
    $img = $a['bild'] !== '' ? myf_site_url($a['bild']) : '';
    return '<section class="ws-sec ws-facts' . ($img ? ' has-bg' : '') . '">' . ($img ? '<img class="ws-facts-bg" src="' . esc_url($img) . '" alt="" loading="lazy" decoding="async">' : '') . '<div class="ws-wrap">' .
        ($a['kicker'] !== '' ? '<p class="ws-kicker"><span>' . esc_html($a['kicker']) . '</span></p>' : '') . ($a['titel'] !== '' ? '<h2 class="ws-h"><span>' . esc_html($a['titel']) . '</span></h2>' : '') .
        '<div class="ws-nums">' . implode('', array_map(function ($t) {
            return $t[0] === '' ? '' : '<div><b>' . esc_html($t[0]) . '</b><span>' . esc_html($t[1]) . '</span><small>' . esc_html($t[2]) . '</small></div>';
        }, $tiles)) . '</div></div></section>';
});

// Einsätze aus der Einsatzverwaltung (sonst aus SPIND): kurze Liste oder ganzes Jahr nach Monaten
function myf_site_incidents($year, $limit) {
    $out = [];
    if (post_type_exists('einsatz')) {
        $q = ['post_type' => 'einsatz', 'post_status' => 'publish', 'numberposts' => $limit ?: -1, 'orderby' => 'date', 'order' => 'DESC'];
        if ($year) $q['date_query'] = [['year' => (int) $year]];
        foreach (get_posts($q) as $p) {
            $types = taxonomy_exists('einsatzart') ? wp_get_post_terms($p->ID, 'einsatzart', ['fields' => 'names']) : [];
            $veh = taxonomy_exists('fahrzeug') ? wp_get_post_terms($p->ID, 'fahrzeug', ['fields' => 'names']) : [];
            $title = myf_plain(get_the_title($p));
            $out[] = ['title' => $title, 'date' => $p->post_date, 'url' => get_permalink($p), 'type' => is_wp_error($types) ? '' : implode(', ', $types),
                'veh' => is_wp_error($veh) ? [] : $veh, 'cat' => myf_incident_cat($title . ' ' . (is_wp_error($types) ? '' : implode(' ', $types))), 'text' => trim($p->post_content) !== ''];
        }
    } elseif (function_exists('myf_pub_list')) {
        $base = myf_reports_page_url();
        foreach (myf_pub_list($year ?: (int) current_time('Y')) as $i) {
            $res = json_decode((string) $i->pub_res, true) ?: [];
            $out[] = ['title' => ($i->nr ? 'Einsatz ' . $i->nr . ' ' : '') . $i->pub_title, 'date' => $i->start, 'url' => $base ? add_query_arg('eb', (int) $i->id, $base) : '', 'type' => $i->pub_type,
                'veh' => array_values(array_filter(array_map(function ($r) { return is_array($r) ? ($r['name'] ?? '') : (string) $r; }, $res))), 'cat' => $i->category ?: 'th', 'text' => true];
        }
        if ($limit) $out = array_slice($out, 0, $limit);
    }
    return $out;
}
function myf_site_inc_row($i) {
    $ts = strtotime($i['date']);
    return '<a class="ws-inc c-' . esc_attr($i['cat']) . '" href="' . esc_url($i['url'] ?: '#') . '"><time datetime="' . esc_attr(date('c', $ts)) . '"><b>' . date_i18n('d.m.', $ts) . '</b><small>' . date_i18n('H:i', $ts) . ' Uhr</small></time>' .
        '<span class="ws-inc-t"><b>' . esc_html(preg_replace('#^Einsatz\s+#', '', $i['title'])) . '</b>' . ($i['veh'] ? '<small>' . esc_html(implode(' · ', $i['veh'])) . '</small>' : '') . '</span><i aria-hidden="true">›</i></a>';
}
add_shortcode('ww_einsaetze', function ($a) {
    $a = shortcode_atts(['anzahl' => 5, 'jahr' => '', 'titel' => 'Letzte Einsätze', 'alle' => ''], $a);
    if ($a['alle']) {
        $years = []; global $wpdb;
        if (post_type_exists('einsatz')) $years = array_map('intval', $wpdb->get_col("SELECT DISTINCT YEAR(post_date) y FROM {$wpdb->posts} WHERE post_type = 'einsatz' AND post_status = 'publish' ORDER BY y DESC"));
        $y = isset($_GET['jahr']) && in_array((int) $_GET['jahr'], $years, true) ? (int) $_GET['jahr'] : ($years[0] ?? (int) current_time('Y'));
        $list = myf_site_incidents($y, 0); $by = [];
        foreach ($list as $i) $by[date_i18n('F', strtotime($i['date']))][] = $i;
        $cats = ['brand' => 0, 'th' => 0, 'vu' => 0, 'fehl' => 0]; foreach ($list as $i) if (isset($cats[$i['cat']])) $cats[$i['cat']]++;
        $h = '<section class="ws-sec"><div class="ws-wrap">' . ($years ? '<nav class="ws-years" aria-label="Jahr">' . implode('', array_map(function ($x) use ($y) { return '<a href="' . esc_url(add_query_arg('jahr', $x)) . '"' . ($x === $y ? ' aria-current="page"' : '') . '>' . $x . '</a>'; }, array_slice($years, 0, 8))) . '</nav>' : '') .
            '<div class="ws-nums is-light"><div><b>' . count($list) . '</b><span>Einsätze ' . $y . '</span></div><div><b>' . $cats['brand'] . '</b><span>Brand</span></div><div><b>' . ($cats['th'] + $cats['vu']) . '</b><span>Technische Hilfe</span></div><div><b>' . $cats['fehl'] . '</b><span>Fehlalarm</span></div></div>';
        foreach ($by as $m => $items) $h .= '<h3 class="ws-month">' . esc_html($m) . '</h3><div class="ws-incs">' . implode('', array_map('myf_site_inc_row', $items)) . '</div>';
        return $h . ($list ? '' : '<p class="ws-mu">Für ' . $y . ' sind noch keine Einsätze eingetragen.</p>') . '</div></section>';
    }
    $list = myf_site_incidents($a['jahr'], max(1, min(20, (int) $a['anzahl'])));
    return '<section class="ws-sec"><div class="ws-wrap"><div class="ws-head"><h2 class="ws-h"><span>' . esc_html($a['titel']) . '</span></h2><a class="ws-more" href="' . esc_url(myf_site_link('einsaetze', home_url('/einsaetze/'))) . '">Alle Einsätze →</a></div>' .
        ($list ? '<div class="ws-incs">' . implode('', array_map('myf_site_inc_row', $list)) . '</div>' : '<p class="ws-mu">Noch keine Einsätze eingetragen.</p>') . '</div></section>';
});

// Neuigkeiten: Beiträge als Karten (Bild, Datum, Titel, Anriss)
add_shortcode('ww_neuigkeiten', function ($a) {
    $a = shortcode_atts(['anzahl' => 3, 'titel' => 'Neuigkeiten', 'einsaetze' => '1', 'seiten' => ''], $a);
    $n = max(1, min(24, (int) $a['anzahl'])); $paged = $a['seiten'] ? max(1, (int) ($_GET['seite'] ?? 1)) : 1;
    // Beiträge und Einsatzberichte mit Text (reine Einsatzmeldungen ohne Bericht gehören in die Einsatzliste)
    $types = ['post']; if ($a['einsaetze'] && post_type_exists('einsatz')) $types[] = 'einsatz';
    // Weit genug zurück holen: viele Einsatzmeldungen haben keinen Text und fallen unten heraus
    $all = array_values(array_filter(get_posts(['post_type' => $types, 'post_status' => 'publish', 'numberposts' => $a['seiten'] ? 300 : max(60, $n * 10), 'orderby' => 'date', 'order' => 'DESC']), function ($p) {
        return $p->post_type !== 'einsatz' || trim(wp_strip_all_tags($p->post_content)) !== '';
    }));
    $pagesTotal = max(1, (int) ceil(count($all) / $n));
    $q = (object) ['posts' => array_slice($all, ($paged - 1) * $n, $n), 'max_num_pages' => $pagesTotal];
    $h = '<section class="ws-sec is-soft"><div class="ws-wrap"><div class="ws-head"><h2 class="ws-h"><span>' . esc_html($a['titel']) . '</span></h2>' .
        ($a['seiten'] ? '' : '<a class="ws-more" href="' . esc_url(myf_site_link('neuigkeiten', home_url('/neuigkeiten/'))) . '">Alle Neuigkeiten →</a>') . '</div><div class="ws-cards">';
    foreach ($q->posts as $p) {
        $img = get_the_post_thumbnail_url($p, 'medium_large');
        $h .= '<a class="ws-card" href="' . esc_url(get_permalink($p)) . '">' . ($img ? '<span class="ws-card-img">' . myf_site_img($img) . '</span>' : '') .
            '<span class="ws-card-b"><small>' . ($p->post_type === 'einsatz' ? '<em>Einsatz</em> · ' : '') . esc_html(get_the_date('j. F Y', $p)) . '</small><b>' . esc_html(myf_plain(get_the_title($p))) . '</b>' .
            '<span>' . esc_html(wp_trim_words(myf_plain(strip_shortcodes($p->post_excerpt ?: $p->post_content)), 22, ' …')) . '</span></span></a>';
    }
    $h .= '</div>';
    if ($a['seiten'] && $q->max_num_pages > 1) {
        $h .= '<nav class="ws-pages" aria-label="Seiten">';
        for ($i = 1; $i <= min(20, $q->max_num_pages); $i++) $h .= '<a href="' . esc_url(add_query_arg('seite', $i)) . '"' . ($i === $paged ? ' aria-current="page"' : '') . '>' . $i . '</a>';
        $h .= '</nav>';
    }
    return $h . ($q->posts ? '' : '<p class="ws-mu">Noch keine Beiträge.</p>') . '</div></section>';
});

// Kacheln: Einheiten/Abteilungen (Inhalt: eine Zeile je Kachel „Titel | Text | Bild-URL | Link“)
add_shortcode('ww_kacheln', function ($a, $c = '') {
    $a = shortcode_atts(['titel' => '', 'kicker' => ''], $a);
    $rows = array_filter(array_map('trim', preg_split('/\r?\n/', html_entity_decode(wp_strip_all_tags(str_replace(['<br>', '<br />', '</p>'], "\n", (string) $c)), ENT_QUOTES | ENT_HTML5, 'UTF-8'))));
    $h = '<section class="ws-sec"><div class="ws-wrap">' . ($a['kicker'] ? '<p class="ws-kick">' . esc_html($a['kicker']) . '</p>' : '') . ($a['titel'] ? '<h2 class="ws-h"><span>' . esc_html($a['titel']) . '</span></h2>' : '') . '<div class="ws-tiles">';
    foreach ($rows as $r) {
        $p = array_map('trim', explode('|', $r)); if (!$p[0]) continue;
        $tag = !empty($p[3]) ? 'a href="' . esc_url(myf_site_url($p[3])) . '"' : 'div';
        $h .= '<' . $tag . ' class="ws-tile">' . (!empty($p[2]) ? '<span class="ws-tile-img">' . myf_site_img($p[2], $p[0]) . '</span>' : '<span class="ws-tile-img is-empty" aria-hidden="true"><i>' . esc_html($p[0]) . '</i></span>') . '<span class="ws-tile-b"><b>' . esc_html($p[0]) . '</b>' .
            (!empty($p[1]) ? '<span>' . esc_html($p[1]) . '</span>' : '') . (!empty($p[3]) ? '<em>Mehr erfahren →</em>' : '') . '</span></' . (!empty($p[3]) ? 'a' : 'div') . '>';
    }
    return $h . '</div></div></section>';
});

// Personen: „Funktion | Name | Bild-URL | E-Mail“ je Zeile
add_shortcode('ww_personen', function ($a, $c = '') {
    $a = shortcode_atts(['titel' => ''], $a);
    $rows = array_filter(array_map('trim', preg_split('/\r?\n/', html_entity_decode(wp_strip_all_tags(str_replace(['<br>', '<br />', '</p>'], "\n", (string) $c)), ENT_QUOTES | ENT_HTML5, 'UTF-8'))));
    $h = '<section class="ws-sec"><div class="ws-wrap">' . ($a['titel'] ? '<h2 class="ws-h"><span>' . esc_html($a['titel']) . '</span></h2>' : '') . '<div class="ws-people">';
    foreach ($rows as $r) {
        $p = array_map('trim', explode('|', $r)); if (count($p) < 2) continue;
        $ini = implode('', array_map(function ($w) { return mb_substr($w, 0, 1); }, array_slice(preg_split('/\s+/', $p[1]), 0, 2)));
        $h .= '<div class="ws-person">' . (!empty($p[2]) ? '<span class="ws-ph">' . myf_site_img($p[2], $p[1]) . '</span>' : '<span class="ws-ph is-ini">' . esc_html(mb_strtoupper($ini)) . '</span>') .
            '<small>' . esc_html($p[0]) . '</small><b>' . esc_html($p[1]) . '</b>' . (!empty($p[3]) ? '<a href="mailto:' . esc_attr(antispambot($p[3])) . '">' . esc_html(antispambot($p[3])) . '</a>' : '') . '</div>';
    }
    return $h . '</div></div></section>';
});

// Nächste Dienstabende (aus dem SPIND-Dienstplan; öffentlich nur Datum, Uhrzeit, Einheit, Ort – Thema nur, wenn eingestellt)
add_shortcode('ww_termine', function ($a) {
    // art: „dienst“ (nur Dienst-/Übungsabende) oder „alle“ (dazu besondere Termine wie Versammlung, Volkstrauertag – Lehrgänge bleiben intern)
    // titel="" lässt die Überschrift weg, hinweis="nein" den Satz „Interessiert? …“ – praktisch auf vorhandenen Theme-Seiten
    // ohne="Begriff, Begriff": weitere Termine nicht öffentlich zeigen (zusätzlich zu den internen Standardbegriffen und allem mit „intern“ im Kalender)
    $a = shortcode_atts(['anzahl' => 4, 'titel' => 'Nächste Dienstabende', 'thema' => '', 'art' => 'dienst', 'hinweis' => 'ja', 'ohne' => '', 'veranstaltungen' => 'ja'], $a);
    $ohne = array_filter(array_map(function ($w) { return preg_quote(trim($w), '/'); }, explode(',', (string) $a['ohne'])), 'strlen');
    $internRe = '/intern|fortbildung|stabsarbeit|atemschutz|besprechung|sitzung|weihnachtsfeier|kameradschaft|grillabend|familienabend|helferfest|ausflug|jahresabschluss' . ($ohne ? '|' . implode('|', $ohne) : '') . '/iu';
    $kinds = $a['art'] === 'alle' ? ['dienst', 'termin'] : ['dienst'];
    $s = myf_site(); $units = myf_units();
    // Dienstabende kommen automatisch aus dem Dienstplan-Kalender (und von Hand Eingetragenem) – kein „Übernehmen“ nötig; Lehrgänge und interne Termine bleiben intern
    $rows = $s['drills_public'] && function_exists('myf_drills_upcoming') ? array_map(function ($x) use ($s) {
            // Ort: nur das Ortsfeld aus dem Kalender (nie die Beschreibung – die kann Internes enthalten), sonst der eingestellte Treffpunkt
            $place = trim((string) ($x['place'] ?? ''));
            return (object) ['date' => $x['date'], 'time_from' => (string) ($x['time'] ?? ''), 'time_to' => (string) ($x['time_to'] ?? ''), 'title' => (string) $x['title'], 'unit' => (string) ($x['unit'] ?? ''), 'place' => $place !== '' ? $place : (string) $s['drill_place'], 'cal_uid' => (string) ($x['cal_uid'] ?? '')];
        },
        array_slice(array_values(array_filter(myf_drills_upcoming(60, $kinds), function ($x) use ($internRe) {
            // Öffentlich nur echte Übungs-/Dienstabende (keine Übungsstrecke, Fortbildung o. Ä.); bei „alle“ zusätzlich besondere Termine
            if (preg_match('/\bintern\b/iu', (string) ($x['note'] ?? ''))) return false; // im Kalender als „intern“ markiert
            return ($x['cal_kind'] ?? 'dienst') === 'termin' ? !preg_match($internRe, $x['title'])
                : (empty($x['cal_kind']) || preg_match('/übungsabend|uebungsabend|dienstabend|übungsdienst|^dienst\b|^übung\b/iu', $x['title']));
        })), 0, 60)) : [];
    // Veranstaltungen: hervorgehobene immer, weitere öffentliche bei art="alle"; ein verknüpfter Kalendertermin erscheint nur einmal
    if ($a['veranstaltungen'] !== 'nein' && function_exists('myf_events') && !myf_demo_ctx()) {
        $evs = array_values(array_filter(myf_events('public'), function ($o) use ($a) { return $o['featured'] || $a['art'] === 'alle'; }));
        $linked = array_flip(array_filter(array_column(myf_events('members'), 'cal_uid')));
        $rows = array_values(array_filter($rows, function ($r) use ($linked) { return $r->cal_uid === '' || !isset($linked[$r->cal_uid]); }));
        foreach ($evs as $o) $rows[] = (object) ['date' => $o['date'], 'time_from' => $o['time'], 'time_to' => $o['time_to'], 'title' => ($o['cancelled'] ? 'Abgesagt: ' : '') . $o['title'], 'unit' => '', 'place' => $o['place'], 'cal_uid' => '', 'event' => $o];
        usort($rows, function ($x, $y) { return strcmp($x->date . $x->time_from, $y->date . $y->time_from); });
    }
    $rows = array_slice($rows, 0, max(1, min(24, (int) $a['anzahl'])));
    $own = function_exists('myf_site_is') && myf_site_is();
    $h = ($own ? '<section class="ws-sec"><div class="ws-wrap">' : myf_ww_termine_css() . '<div class="ww-termine">') . ($a['titel'] !== '' ? '<h2 class="ws-h"><span>' . esc_html($a['titel']) . '</span></h2>' : '');
    if ($rows) {
        $h .= '<div class="ws-dates">' . implode('', array_map(function ($r) use ($a, $units) {
            $ts = strtotime($r->date);
            $ev = $r->event ?? null; $top = $ev && $ev['featured']; $tag = $ev && $ev['url'] ? 'a' : 'div';
            return '<' . $tag . ' class="ws-date' . ($top ? ' is-top' : '') . '"' . ($tag === 'a' ? ' href="' . esc_url($ev['url']) . '"' : '') . '><time datetime="' . esc_attr($r->date) . '"><b>' . date_i18n('d', $ts) . '</b><small>' . date_i18n('M', $ts) . '</small></time><span>' . ($top ? '<em class="ws-date-tag">Besonderer Termin</em>' : '') . '<b>' . esc_html($ev || $a['thema'] || $a['art'] === 'alle' ? $r->title : 'Übungsabend' . ($r->unit && isset($units[$r->unit]) ? ' ' . $units[$r->unit] : '')) . '</b>' .
                '<small>' . date_i18n('l', $ts) . ($r->time_from ? ', ' . (substr($r->time_to, 0, 5) === '23:59' || $r->time_to === '' ? 'ab ' . esc_html(substr($r->time_from, 0, 5)) : esc_html(substr($r->time_from, 0, 5)) . '–' . esc_html(substr($r->time_to, 0, 5))) . ' Uhr' : '') . ($r->place !== '' ? ' · ' . esc_html($r->place) : '') . '</small></span></' . $tag . '>';
        }, $rows)) . '</div>';
    } else $h .= '<p class="ws-mu">Die nächsten Termine stehen bald hier.</p>';
    if ($a['hinweis'] !== 'nein') $h .= '<p class="ws-mu" style="margin-top:14px">Interessiert? Komm einfach zu einem Übungsabend – gern ein paar Minuten früher.</p>';
    return $h . ($own ? '</div></section>' : '</div>');
});
// Gestaltung der Terminliste auf normalen Theme-Seiten (dort ist site.css nicht geladen) – einmal je Seite, an die Theme-Schrift angepasst
function myf_ww_termine_css() {
    static $done = false; if ($done) return ''; $done = true;
    return '<style>.ww-termine{margin:12px 0 24px}.ww-termine .ws-h{margin:0 0 14px}.ww-termine .ws-dates{display:grid;gap:10px}'
        . '.ww-termine .ws-date{display:grid;grid-template-columns:64px minmax(0,1fr);gap:14px;align-items:center;padding:12px;border:1px solid rgba(127,127,127,.3)}'
        . '.ww-termine .ws-date time{background:#e30613;color:#fff;text-align:center;padding:8px 4px;line-height:1}.ww-termine .ws-date time b{display:block;font-size:28px;font-weight:800}'
        . '.ww-termine .ws-date time small{display:block;font-weight:700;text-transform:uppercase;font-size:13px;margin-top:3px}.ww-termine .ws-date span b{display:block;font-size:17px;line-height:1.25;font-weight:800}'
        . '.ww-termine .ws-date span small{display:block;opacity:.75;margin-top:2px}.ww-termine .ws-mu{opacity:.75}'
        . '.ww-termine a.ws-date{color:inherit;text-decoration:none}.ww-termine .ws-date.is-top{border:2px solid #e30613}.ww-termine .ws-date-tag{display:block;font-style:normal;font-weight:800;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#e30613}</style>';
}

// Rotes Band zum Mitmachen
add_shortcode('ww_mitmachen', function ($a) {
    $a = shortcode_atts(['titel' => 'Helm sucht Kopf.', 'text' => 'Ehrenamtlich, ohne Beitrag, mit Ausbildung und Ausrüstung – komm zu einem Übungsabend und lern uns kennen.', 'knopf' => 'Jetzt mitmachen',
        'link' => myf_site_link('mitmachen', home_url('/feuerwehrmann-werden/'))], $a);
    return '<section class="ws-band"><div class="ws-wrap"><div><h2>' . esc_html($a['titel']) . '</h2><p>' . esc_html($a['text']) . '</p></div><a class="ws-btn is-white" href="' . esc_url($a['link']) . '">' . esc_html($a['knopf']) . '</a></div></section>';
});

// Kontakt: Kästen mit Überschrift; Inhalt je Kasten „Überschrift | Zeile 1 ; Zeile 2 ; …“
add_shortcode('ww_kontakt', function ($a, $c = '') {
    $a = shortcode_atts(['titel' => 'Kontakt'], $a);
    $s = myf_site();
    $rows = array_filter(array_map('trim', preg_split('/\r?\n/', html_entity_decode(wp_strip_all_tags(str_replace(['<br>', '<br />', '</p>'], "\n", (string) $c)), ENT_QUOTES | ENT_HTML5, 'UTF-8'))));
    $h = '<section class="ws-sec"><div class="ws-wrap"><div class="ws-note"><b>Notfall? Sofort 112 wählen.</b> Über diese Kontakte können keine Notfälle gemeldet werden – das Gerätehaus ist nicht dauerhaft besetzt.</div>' .
        ($a['titel'] ? '<h2 class="ws-h"><span>' . esc_html($a['titel']) . '</span></h2>' : '') . '<div class="ws-contacts">';
    foreach ($rows as $r) {
        $p = array_map('trim', explode('|', $r, 2)); if (count($p) < 2) continue;
        $lines = array_map(function ($l) { $l = trim($l); return is_email($l) ? '<a href="mailto:' . esc_attr(antispambot($l)) . '">' . esc_html(antispambot($l)) . '</a>' : (preg_match('/^\+?[\d\s\/()-]{6,}$/', $l) ? '<a href="tel:' . esc_attr(preg_replace('/[^\d+]/', '', $l)) . '">' . esc_html($l) . '</a>' : esc_html($l)); }, explode(';', $p[1]));
        $h .= '<div class="ws-contact"><small>' . esc_html($p[0]) . '</small><p>' . implode('<br>', $lines) . '</p></div>';
    }
    return $h . '</div></div></section>';
});

// ---- Seiten als Entwurf anlegen (Verwaltung) ---------------------------------------------------------------------------
function myf_site_blueprint() {
    $sc = function ($s) { return "<!-- wp:shortcode -->\n" . $s . "\n<!-- /wp:shortcode -->\n\n"; };
    $b = myf_brand(); $org = $b['org'];
    // Neutrale Grundseiten, Texte und Bilder im Editor anpassen; ein Zusatz mit örtlichen Vorgaben kann eigene Seiten liefern
    return (array) apply_filters('myf_site_blueprint', [
        'start' => ['Start', $sc('[ww_hero]') . $sc('[ww_zahlen]') . $sc('[ww_einsaetze anzahl="5"]') . $sc('[ww_neuigkeiten anzahl="3"]') .
            $sc("[ww_kacheln titel=\"Unsere Einheiten\"]\nEinsatzabteilung | Rund um die Uhr ehrenamtlich im Einsatz. | | {einheiten}\nJugendfeuerwehr | Feuerwehrtechnik, Spaß und Gemeinschaft für Jugendliche. | |\n[/ww_kacheln]") . $sc('[ww_termine anzahl="3"]') . $sc('[ww_mitmachen]')],
        'einsaetze' => ['Einsätze', $sc('[ww_hero klein="1" spruch="Einsätze" kicker="' . $org . '"]') . $sc('[ww_einsaetze alle="1"]')],
        'neuigkeiten' => ['Neuigkeiten', $sc('[ww_hero klein="1" spruch="Neuigkeiten" kicker="' . $org . '"]') . $sc('[ww_neuigkeiten anzahl="12" seiten="1" titel="Alle Beiträge"]')],
        'einheiten' => ['Einheiten', $sc('[ww_hero klein="1" spruch="Einheiten" kicker="' . $org . '"]') . $sc("[ww_abschnitt titel=\"Wer wir sind\"]\nHier stellt sich die Feuerwehr vor – Text im Editor anpassen.\n[/ww_abschnitt]") . $sc('[ww_mitmachen]')],
        'termine' => ['Termine', $sc('[ww_hero klein="1" spruch="Termine" kicker="' . $org . '"]') . $sc('[ww_termine anzahl="10"]') . $sc('[ww_mitmachen]')],
        'kontakt' => ['Kontakt', $sc('[ww_hero klein="1" spruch="Kontakt" kicker="' . $org . '"]') . $sc("[ww_kontakt]\nAllgemeine Anfragen | Wehrführung ; E-Mail-Adresse eintragen\n[/ww_kontakt]")],
        'mitmachen' => ['Mitglied werden', $sc('[ww_hero klein="1" spruch="Helm sucht Kopf." kicker="Mitglied werden"]') . $sc("[ww_abschnitt titel=\"So geht's los\"]\nKomm zu einem Übungsabend, lern uns kennen und stell deine Fragen. Die Mitgliedschaft ist ehrenamtlich, Ausrüstung und Ausbildung bekommst du gestellt.\n[/ww_abschnitt]") . $sc('[ww_termine anzahl="3" titel="Nächste Übungsabende"]')],
    ], myf_profile());
}

add_action('rest_api_init', function () {
    register_rest_route('myf/v1', '/admin/site/pages', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
        if (!current_user_can('edit_pages')) return myf_err('Seiten anlegen dürfen nur Website-Admins (WordPress-Recht „Seiten bearbeiten“).', 403);
        $bp = myf_site_blueprint(); $pages = myf_site_pages(); $made = [];
        if ($req->get_param('refresh')) {
            $n = 0;
            foreach ($bp as $k => $x) {
                if (empty($pages[$k]) || get_post_status($pages[$k]) !== 'draft') continue;
                $content = preg_replace_callback('/\{([a-z_]+)\}/', function ($m) use ($pages) { return !empty($pages[$m[1]]) ? get_permalink($pages[$m[1]]) : ''; }, $x[1]);
                wp_update_post(['ID' => $pages[$k], 'post_content' => $content]); $n++;
            }
            return ['refreshed' => $n, 'pages' => myf_site_state()['pages']];
        }
        foreach ($bp as $k => $x) {
            if (!empty($pages[$k]) && get_post_status($pages[$k]) && get_post_status($pages[$k]) !== 'trash') continue; // nichts überschreiben
            $id = wp_insert_post(['post_type' => 'page', 'post_status' => 'draft', 'post_title' => $x[0], 'post_content' => '', 'meta_input' => ['_wp_page_template' => MYF_SITE_TPL]], true);
            if (is_wp_error($id)) return myf_err('Seite „' . $x[0] . '“ konnte nicht angelegt werden: ' . $id->get_error_message());
            $pages[$k] = (int) $id; $made[] = $x[0];
        }
        update_option('myf_site_pages', $pages, false);
        // Platzhalter {schlüssel} durch die Links der neuen Seiten ersetzen
        foreach ($bp as $k => $x) {
            if (!in_array($x[0], $made, true)) continue;
            $content = preg_replace_callback('/\{([a-z_]+)\}/', function ($m) use ($pages) { return !empty($pages[$m[1]]) ? get_permalink($pages[$m[1]]) : ''; }, $x[1]);
            wp_update_post(['ID' => $pages[$k], 'post_content' => $content]);
        }
        return ['made' => $made, 'pages' => myf_site_state()['pages']];
    }]);
    register_rest_route('myf/v1', '/admin/site', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
        $s = myf_settings(); $site = myf_site();
        foreach (['claim', 'street', 'zip', 'city', 'phone', 'mail', 'founded', 'members', 'vehicles', 'drill_place'] as $k) if ($req->has_param($k)) $site[$k] = sanitize_text_field((string) $req->get_param($k));
        foreach (['instagram', 'facebook', 'imprint', 'privacy'] as $k) if ($req->has_param($k)) $site[$k] = esc_url_raw((string) $req->get_param($k));
        if ($req->has_param('drills_public')) $site['drills_public'] = $req->get_param('drills_public') ? 1 : 0;
        $s['site'] = $site; update_option('myf_settings', $s);
        return ['ok' => true];
    }]);
});
function myf_site_state() {
    $out = [];
    foreach (myf_site_blueprint() as $k => $x) {
        $id = (int) (myf_site_pages()[$k] ?? 0); $st = $id ? get_post_status($id) : '';
        $out[] = ['key' => $k, 'title' => $x[0], 'id' => $st && $st !== 'trash' ? $id : 0, 'status' => $st, 'view' => $id ? (get_post_status($id) === 'publish' ? get_permalink($id) : get_preview_post_link($id)) : '', 'edit' => $id ? get_edit_post_link($id, 'raw') : ''];
    }
    return ['pages' => $out, 'settings' => myf_site(), 'can_pages' => current_user_can('edit_pages'), 'front' => (int) get_option('page_on_front')];
}
add_filter('myf_admin_state', function ($d) { if (myf_can_manage()) $d['site'] = myf_site_state(); return $d; });
