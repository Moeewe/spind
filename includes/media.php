<?php
/**
 * Fotos ordnen: Bildbereiche (Gruppenfoto, Einsatz, Übung, Jugendfeuerwehr …) für die Mediathek, sprechende Titel und Alternativtexte.
 * Geändert werden nur Titel, Alternativtext und Bildbereich – nie Dateiname oder Adresse. Slider, Beiträge und Seiten, die ein Bild
 * über seine Adresse einbinden, funktionieren deshalb unverändert weiter. Baustein [ww_galerie bereich="gruppenfoto"] zeigt einen Bereich.
 */

defined('ABSPATH') || exit;

const MYF_PHOTO_TAX = 'ww_bildbereich';

function myf_photo_cats() {
    return ['gruppenfoto' => 'Gruppenfoto', 'einsatz' => 'Einsatz', 'uebung' => 'Übung', 'jugendfeuerwehr' => 'Jugendfeuerwehr', 'brandschutzerziehung' => 'Brandschutzerziehung',
        'fahrzeuge-technik' => 'Fahrzeuge & Technik', 'geraetehaus' => 'Gerätehaus', 'veranstaltung' => 'Veranstaltung', 'versammlung-ehrung' => 'Versammlung & Ehrung',
        'portraet' => 'Porträt', 'musikzug' => 'Musikzug', 'chor' => 'Chor', 'ehrenabteilung' => 'Ehrenabteilung', 'sport' => 'Sport',
        'symbolbild' => 'Symbolbild', 'historisch' => 'Historisch', 'grafik' => 'Logo & Grafik'];
}

add_action('init', function () {
    register_taxonomy(MYF_PHOTO_TAX, 'attachment', ['labels' => ['name' => 'Bildbereiche', 'singular_name' => 'Bildbereich', 'menu_name' => 'Bildbereiche', 'all_items' => 'Alle Bildbereiche'],
        'public' => false, 'show_ui' => true, 'show_in_menu' => true, 'show_admin_column' => true, 'show_in_rest' => true, 'hierarchical' => true, 'query_var' => MYF_PHOTO_TAX,
        'update_count_callback' => '_update_generic_term_count', 'rewrite' => false]);
    if (get_option('myf_photo_cats_v') !== '1') {
        foreach (myf_photo_cats() as $slug => $name) if (!term_exists($slug, MYF_PHOTO_TAX)) wp_insert_term($name, MYF_PHOTO_TAX, ['slug' => $slug]);
        update_option('myf_photo_cats_v', '1', false);
    }
});
// Mediathek (Listenansicht): nach Bildbereich filtern
add_action('restrict_manage_posts', function ($type) {
    if ($type !== 'attachment') return;
    $cur = isset($_GET[MYF_PHOTO_TAX]) ? sanitize_key(wp_unslash($_GET[MYF_PHOTO_TAX])) : '';
    echo '<select name="' . esc_attr(MYF_PHOTO_TAX) . '"><option value="">Alle Bildbereiche</option>';
    foreach (get_terms(['taxonomy' => MYF_PHOTO_TAX, 'hide_empty' => false]) as $t) echo '<option value="' . esc_attr($t->slug) . '"' . selected($cur, $t->slug, false) . '>' . esc_html(html_entity_decode($t->name, ENT_QUOTES, 'UTF-8')) . ' (' . (int) $t->count . ')</option>';
    echo '</select>';
});

// Titel wie aus der Kamera, vom Handy oder ein Bildschirmfoto: braucht einen sprechenden Namen
function myf_photo_raw_title($t) {
    return (bool) preg_match('/^(img|imgp|dsc|dji|pxl|gopr|photo|whatsapp[ _-]?image|bildschirmfoto|screenshot|image|bild|foto|signal-|[0-9a-f]{8}-[0-9a-f]{4}|[0-9_ -]+$|[0-9a-f]{20,})/i', trim((string) $t));
}
function myf_photo_item($p, $parents) {
    $cats = wp_get_object_terms($p->ID, MYF_PHOTO_TAX, ['fields' => 'slugs']);
    $alt = (string) get_post_meta($p->ID, '_wp_attachment_image_alt', true);
    $parent = $p->post_parent && isset($parents[$p->post_parent]) ? $parents[$p->post_parent] : '';
    $raw = myf_photo_raw_title($p->post_title);
    $th = wp_get_attachment_image_src($p->ID, 'medium');
    return ['id' => $p->ID, 'thumb' => $th ? $th[0] : '', 'full' => (string) wp_get_attachment_url($p->ID), 'date' => substr($p->post_date, 0, 10),
        'title' => $p->post_title, 'alt' => $alt, 'cats' => is_wp_error($cats) ? [] : $cats, 'parent' => $parent, 'raw' => $raw,
        // Vorschlag: Titel des Beitrags, in dem das Bild steckt; Alternativtext = Titel
        'sugg' => $raw && $parent !== '' ? $parent : '', 'open' => $raw || $alt === '' || !$cats];
}

add_action('rest_api_init', function () {
    register_rest_route('myf/v1', '/admin/site/photos', [
        ['methods' => 'GET', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
            if (!current_user_can('upload_files')) return myf_err('Nur für Website-Admins (WordPress-Recht „Dateien hochladen“).', 403);
            $filter = sanitize_key((string) $req->get_param('filter')) ?: 'offen';
            $q = ['post_type' => 'attachment', 'post_status' => 'inherit', 'post_mime_type' => 'image', 'posts_per_page' => -1, 'orderby' => 'date', 'order' => 'DESC'];
            if (!in_array($filter, ['offen', 'alle'], true)) $q['tax_query'] = [['taxonomy' => MYF_PHOTO_TAX, 'field' => 'slug', 'terms' => $filter]];
            $all = get_posts($q);
            $pids = array_unique(array_filter(wp_list_pluck($all, 'post_parent'))); $parents = [];
            foreach ($pids ? get_posts(['post_type' => 'any', 'post_status' => 'any', 'post__in' => $pids, 'posts_per_page' => -1]) : [] as $pp) $parents[$pp->ID] = html_entity_decode(get_the_title($pp), ENT_QUOTES, 'UTF-8');
            $items = array_map(function ($p) use ($parents) { return myf_photo_item($p, $parents); }, $all);
            $open = count(array_filter($items, function ($x) { return $x['open']; }));
            if ($filter === 'offen') $items = array_values(array_filter($items, function ($x) { return $x['open']; }));
            $per = 24; $page = max(1, (int) $req->get_param('page'));
            return ['items' => array_slice($items, ($page - 1) * $per, $per), 'total' => count($items), 'page' => $page, 'per' => $per, 'open' => $open, 'all' => count($all),
                'cats' => array_map(function ($t) { return ['slug' => $t->slug, 'name' => html_entity_decode($t->name, ENT_QUOTES, 'UTF-8'), 'n' => (int) $t->count]; }, get_terms(['taxonomy' => MYF_PHOTO_TAX, 'hide_empty' => false]))];
        }],
        ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
            if (!current_user_can('upload_files')) return myf_err('Nur für Website-Admins (WordPress-Recht „Dateien hochladen“).', 403);
            $valid = array_keys(myf_photo_cats()); foreach (get_terms(['taxonomy' => MYF_PHOTO_TAX, 'hide_empty' => false, 'fields' => 'slugs']) as $s) $valid[] = $s;
            $n = 0;
            foreach (array_slice((array) $req->get_param('items'), 0, 400) as $it) {
                $id = (int) ($it['id'] ?? 0); $p = $id ? get_post($id) : null;
                if (!$p || $p->post_type !== 'attachment' || strpos((string) $p->post_mime_type, 'image/') !== 0 || !current_user_can('edit_post', $id)) continue;
                // Nur Titel, Alternativtext und Bildbereich – Datei und Adresse bleiben, damit Slider und Beiträge weiter funktionieren
                if (isset($it['title'])) { $t = mb_substr(sanitize_text_field((string) $it['title']), 0, 160); if ($t !== '' && $t !== $p->post_title) wp_update_post(['ID' => $id, 'post_title' => $t]); }
                if (isset($it['alt'])) update_post_meta($id, '_wp_attachment_image_alt', mb_substr(sanitize_text_field((string) $it['alt']), 0, 250));
                if (isset($it['cats']) && is_array($it['cats'])) wp_set_object_terms($id, array_values(array_intersect(array_map('sanitize_key', $it['cats']), $valid)), MYF_PHOTO_TAX);
                $n++;
            }
            return ['ok' => true, 'n' => $n];
        }],
    ]);
});

// Baustein: Bilder eines Bildbereichs als Raster, z. B. [ww_galerie bereich="gruppenfoto" anzahl="8" titel="Gemeinsam stark"]
add_shortcode('ww_galerie', function ($a) {
    $a = shortcode_atts(['bereich' => 'gruppenfoto', 'anzahl' => 8, 'titel' => '', 'kicker' => ''], $a);
    $slugs = array_filter(array_map('sanitize_key', explode(',', (string) $a['bereich'])));
    if (!$slugs) return '';
    $imgs = get_posts(['post_type' => 'attachment', 'post_status' => 'inherit', 'post_mime_type' => 'image', 'posts_per_page' => max(1, min(24, (int) $a['anzahl'])), 'orderby' => 'date', 'order' => 'DESC',
        'tax_query' => [['taxonomy' => MYF_PHOTO_TAX, 'field' => 'slug', 'terms' => $slugs]]]);
    if (!$imgs) return '';
    $h = '<section class="ws-sec"><div class="ws-wrap">' . ($a['titel'] !== '' ? ($a['kicker'] !== '' ? '<p class="ws-kicker"><span>' . esc_html($a['kicker']) . '</span></p>' : '') . '<div class="ws-head"><h2 class="ws-h"><span>' . esc_html($a['titel']) . '</span></h2></div>' : '') . '<div class="ws-gal">';
    foreach ($imgs as $p) {
        $alt = (string) get_post_meta($p->ID, '_wp_attachment_image_alt', true) ?: $p->post_title;
        $h .= '<a class="ws-gal-i" href="' . esc_url(wp_get_attachment_url($p->ID)) . '" target="_blank" rel="noopener">' .
            wp_get_attachment_image($p->ID, 'medium_large', false, ['alt' => $alt, 'loading' => 'lazy', 'decoding' => 'async']) . '<span>' . esc_html($p->post_title) . '</span></a>';
    }
    return $h . '</div></div></section>';
});
