<?php
/**
 * Einsatzberichte für die Website (Plugin „Einsatzverwaltung“): Schnellerfassung aus Alarm-/WhatsApp-Meldungen
 * und Veröffentlichen direkt aus einem Wehrwerk-Einsatz.
 * Seite per Shortcode [wehrwerk_einsatz] (alter Name [ff_einsatz_erfassen] geht weiter).
 */

defined('ABSPATH') || exit;

const MYF_QUICK_CAP = 'edit_einsatzberichte';

function myf_ev_active() { return post_type_exists('einsatz'); }
// Wer darf Berichte für die Website schreiben? Verwaltung mit WordPress-Recht – oder die Einsatzführung (Recht „Einsätze“), je nach Einstellung
function myf_web_mode() {
    $m = myf_settings()['web_reports'] ?? 'draft';
    return in_array($m, ['off', 'draft', 'publish'], true) ? $m : 'draft';
}
// Einsatzführung bekommt die Rechte der Einsatzverwaltung – nur für Einsatzberichte, nur solange sie die Funktion hat
add_filter('user_has_cap', function ($all, $caps, $args) {
    static $busy = false;
    $want = ['edit_einsatzberichte', 'publish_einsatzberichte', 'edit_published_einsatzberichte'];
    if ($busy || !array_intersect($caps, $want) || !empty($all['edit_einsatzberichte'])) return $all;
    if ((int) ($args[1] ?? 0) !== get_current_user_id() || myf_web_mode() === 'off') return $all;
    if (function_exists('myf_demo_ctx') && myf_demo_ctx()) return $all; // Demo-Bestand: keine echten Website-Berichte
    $busy = true;
    $ok = function_exists('myf_member_can') && myf_me() && myf_member_can('incident_manage');
    $busy = false;
    if (!$ok) return $all;
    $all['edit_einsatzberichte'] = true;
    if (myf_web_mode() === 'publish') { $all['publish_einsatzberichte'] = true; $all['edit_published_einsatzberichte'] = true; }
    return $all;
}, 10, 3);

// Wohin gehen öffentliche Einsatzberichte? „einsatzverwaltung“ (Plugin) oder „wehrwerk“ (eigene Berichte-Seite)
function myf_report_target() {
    $t = myf_settings()['report_target'] ?? 'auto';
    if ($t === 'auto') return myf_ev_active() ? 'einsatzverwaltung' : 'wehrwerk';
    return $t === 'wehrwerk' || !myf_ev_active() ? 'wehrwerk' : 'einsatzverwaltung';
}
function myf_web_info() {
    if (myf_report_target() === 'wehrwerk') {
        $mode = myf_web_mode();
        $can = current_user_can('manage_options') || ($mode !== 'off' && function_exists('myf_member_can') && myf_member_can('incident_manage'));
        $ev = myf_ev_active() ? myf_web_info_ev() : [];
        return ['available' => true, 'target' => 'wehrwerk', 'can' => $can, 'publish' => current_user_can('manage_options') || $mode === 'publish',
            'types' => $ev['types'] ?? myf_report_types(), 'vehicles' => $ev['vehicles'] ?? myf_incident_vehicles(), 'external' => [], 'quick_url' => '', 'list_url' => myf_reports_page_url()];
    }
    return myf_web_info_ev() + ['target' => 'einsatzverwaltung'];
}
function myf_report_types() {
    $t = myf_settings()['report_types'] ?? null;
    return is_array($t) && $t ? $t : ['Brandeinsatz', 'Feuer klein', 'Ausgelöste Brandmeldeanlage', 'Hausrauchmelder', 'Technische Hilfeleistung', 'Hilfe klein', 'Verkehrsunfall',
        'Person in Wohnung', 'Eingeklemmte Person', 'Ölspur', 'Sturmschaden', 'Tierrettung', 'Wasserrettung', 'ABC-Einsatz', 'Amtshilfe', 'Brandsicherheitswache', 'Fehlalarm', 'Sonstiges'];
}
function myf_web_info_ev() {
    if (!myf_ev_active()) return ['available' => false];
    $names = function ($tax) {
        if (!taxonomy_exists($tax)) return [];
        $t = get_terms(['taxonomy' => $tax, 'hide_empty' => false]);
        return is_wp_error($t) ? [] : array_values(array_map(function ($x) { return html_entity_decode($x->name, ENT_QUOTES); }, $t));
    };
    return ['available' => true, 'can' => current_user_can('edit_einsatzberichte'), 'publish' => current_user_can('publish_einsatzberichte'),
        'types' => $names('einsatzart'), 'vehicles' => $names('fahrzeug'), 'external' => $names('exteinsatzmittel'), 'quick_url' => myf_quick_page_url()];
}

// Einheiten für die Schnellerfassung: Kurzname, Kürzel vor der Nummer (zweite Einheit), Fahrzeuge
function myf_quick_units() {
    $s = myf_settings();
    $pre = (array) ($s['quick_prefix'] ?? []);
    $veh = (array) ($s['quick_vehicles'] ?? []);
    $ev = myf_ev_active() && taxonomy_exists('fahrzeug') ? get_terms(['taxonomy' => 'fahrzeug', 'hide_empty' => false]) : [];
    $evNames = is_wp_error($ev) ? [] : array_map(function ($x) { return html_entity_decode($x->name, ENT_QUOTES); }, (array) $ev);
    $out = []; $usedPfx = [];
    $i = 0;
    foreach (myf_units() as $k => $l) {
        $short = myf_unit_short($l);
        // Kürzel der weiteren Einheiten: erster Buchstabe, bei Gleichstand die ersten zwei („N“ → „NO“)
        $default = '';
        if ($i > 0) { $default = mb_strtoupper(mb_substr($short, 0, 1)); if (in_array($default, $usedPfx, true)) $default = mb_strtoupper(mb_substr($short, 0, 2)); }
        $usedPfx[] = (string) ($pre[$k] ?? $default);
        $v = isset($veh[$k]) && is_array($veh[$k]) ? $veh[$k] : null;
        if ($v === null) {
            // Vorgabe: Fahrzeuge der Einsatzverwaltung, deren Name die Einheit enthält – sonst alle zur ersten Einheit
            $v = array_values(array_filter($evNames, function ($n) use ($short, $i) { return count(myf_units()) > 1 && $i > 0 ? stripos($n, $short) !== false : true; }));
            if ($i === 0 && count(myf_units()) > 1) $v = array_values(array_filter($v, function ($n) { foreach (array_slice(myf_units(), 1) as $l2) if (stripos($n, myf_unit_short($l2)) !== false) return false; return true; }));
        }
        $out[] = ['key' => $k, 'name' => $short, 'label' => $l, 'prefix' => (string) ($pre[$k] ?? $default), 'vehicles' => array_values($v)];
        $i++;
    }
    return $out;
}

function myf_quick_page_url() {
    global $wpdb;
    $id = $wpdb->get_var("SELECT ID FROM {$wpdb->posts} WHERE post_type = 'page' AND post_status IN ('publish','private') AND (post_content LIKE '%[wehrwerk_einsatz%' OR post_content LIKE '%[ff_einsatz_erfassen%') LIMIT 1");
    return $id ? get_permalink((int) $id) : '';
}

function myf_quick_enqueue() {
    wp_enqueue_style('myf-quick', MYF_URL . 'assets/quick.css', [], MYF_ASSET_VER);
    wp_enqueue_script('myf-quick', MYF_URL . 'assets/quick.js', [], MYF_ASSET_VER, true);
    $units = myf_quick_units();
    $veh = [];
    foreach ($units as $u) $veh[$u['key']] = $u['vehicles'];
    wp_localize_script('myf-quick', 'EVQ_CONFIG', ['api' => esc_url_raw(rest_url()), 'adminUrl' => admin_url(), 'ajaxUrl' => admin_url('admin-ajax.php'),
        'units' => array_map(function ($u) { return array_diff_key($u, ['vehicles' => 1]); }, $units), 'vehicles' => $veh, 'place' => myf_brand()['place'],
        'tz' => wp_timezone_string()]); // Zeitzone der Website (nicht fest Berlin)
    $user = wp_get_current_user();
    // Darf das Konto veröffentlichen? Sonst legt die Seite nur Entwürfe an, statt beim Senden an einer Fehlermeldung zu scheitern
    wp_localize_script('myf-quick', 'EVQ_WP', ['nonce' => wp_create_nonce('wp_rest'), 'user' => $user ? $user->display_name : '', 'can_publish' => current_user_can('publish_einsatzberichte')]);
}
function myf_quick_markup() {
    $u = myf_units();
    return '<div id="evq">' . strtr((string) file_get_contents(__DIR__ . '/quick-markup.html'), ['{{ORG}}' => esc_html(myf_brand()['org']), '{{UNIT}}' => esc_html(' ' . reset($u))]) . '</div>';
}
function myf_quick_shortcode() {
    wp_enqueue_style('myf-quick', MYF_URL . 'assets/quick.css', [], MYF_ASSET_VER);
    $head = '<div class="evq-top"><div><div class="evq-kicker">' . esc_html(myf_brand()['org']) . '</div><h2>Einsatz erfassen</h2></div></div>';
    if (!myf_ev_active()) return '<div id="evq">' . $head . '<div class="evq-msg err">Für die Schnellerfassung wird das kostenlose Plugin „Einsatzverwaltung“ gebraucht (WordPress → Plugins → Installieren).</div></div>';
    if (!is_user_logged_in()) {
        $form = wp_login_form(['echo' => false, 'redirect' => get_permalink() ?: home_url('/'), 'form_id' => 'evq-login', 'label_username' => 'Benutzername oder E-Mail',
            'label_password' => 'Passwort', 'label_remember' => 'Angemeldet bleiben', 'label_log_in' => 'Anmelden', 'remember' => true, 'value_remember' => true]);
        return '<div id="evq">' . $head . '<div class="evq-mode"><i></i>Bitte anmelden. Mit „Angemeldet bleiben“ merkt sich das Handy die Anmeldung zwei Monate lang.</div><div class="evq-panel">' . $form . '</div></div>';
    }
    if (!current_user_can(MYF_QUICK_CAP)) return '<div id="evq">' . $head . '<div class="evq-msg err">Dein Konto darf keine Einsatzberichte anlegen. Das geht für die Einsatzführung – bitte bei der Wehrführung melden.</div></div>';
    myf_quick_enqueue();
    return myf_quick_markup();
}
add_shortcode('wehrwerk_einsatz', 'myf_quick_shortcode');

// Altes Plugin noch aktiv? Dann dessen Shortcode/Menü lassen und auf die Ablösung hinweisen
add_action('plugins_loaded', function () {
    if (function_exists('ffe_markup')) {
        add_action('admin_notices', function () {
            if (!current_user_can('activate_plugins')) return;
            echo '<div class="notice notice-info"><p><b>Wehrwerk:</b> Die Einsatz-Schnellerfassung ist jetzt in Wehrwerk enthalten. Das frühere Plugin „Einsatz-Schnellerfassung“ kann deaktiviert werden – die Seite mit [ff_einsatz_erfassen] funktioniert weiter.</p></div>';
        });
        return;
    }
    add_shortcode('ff_einsatz_erfassen', 'myf_quick_shortcode');
    add_action('admin_menu', function () {
        if (!myf_ev_active()) return;
        $hook = add_submenu_page('edit.php?post_type=einsatz', 'Schnellerfassung', 'Schnellerfassung', MYF_QUICK_CAP, 'myf-schnell', function () { echo '<div class="wrap">' . myf_quick_markup() . '</div>'; });
        add_action('admin_enqueue_scripts', function ($h) use ($hook) { if ($h === $hook) myf_quick_enqueue(); });
    });
    // Wer Einsatzberichte schreiben darf und „Angemeldet bleiben“ wählt, bleibt 60 Tage angemeldet (sonst 14) – nicht für Administratoren
    add_filter('auth_cookie_expiration', function ($length, $user_id, $remember) {
        return $remember && user_can($user_id, MYF_QUICK_CAP) && !user_can($user_id, 'manage_options') ? max($length, 60 * DAY_IN_SECONDS) : $length;
    }, 10, 3);
}, 20);

add_action('template_redirect', function () {
    if (!is_singular()) return;
    $c = (string) get_post_field('post_content', get_queried_object_id());
    if (has_shortcode($c, 'wehrwerk_einsatz') || has_shortcode($c, 'ff_einsatz_erfassen')) { nocache_headers(); if (!defined('DONOTCACHEPAGE')) define('DONOTCACHEPAGE', true); }
});

// Schnellerfassung: nach dem Anlegen eines Berichts (Einsatzverwaltung) „Besonderer Einsatz“, „Bericht enthält Bilder“
// und das Einsatzbild setzen. Das Bild kommt in die Mediathek und wird Beitragsbild. Nur wer den Bericht bearbeiten darf.
function myf_quick_extra(WP_REST_Request $req) {
    $id = (int) $req->get_param('post_id');
    if ($req->has_param('special')) update_post_meta($id, 'einsatz_special', $req->get_param('special') ? '1' : '0');
    $att = (int) $req->get_param('attachment_id');
    $img = (string) $req->get_param('image');
    if (!$att && $img !== '') {
        if (!preg_match('#^data:image/(jpeg|png|webp);base64,#', $img, $m)) return myf_err('Bitte ein Foto (JPG, PNG oder WebP) auswählen.');
        $bin = base64_decode(substr($img, strpos($img, ',') + 1), true);
        if (!$bin || strlen($bin) > 12 * 1024 * 1024) return myf_err('Das Foto ist zu groß (höchstens 12 MB).');
        if (!@getimagesizefromstring($bin)) return myf_err('Die Datei ist kein lesbares Foto.');
        $ext = $m[1] === 'jpeg' ? 'jpg' : $m[1];
        $name = sanitize_file_name('einsatz-' . (get_post_field('post_name', $id) ?: $id) . '.' . $ext);
        $up = wp_upload_bits($name, null, $bin);
        if (!empty($up['error'])) return myf_err('Foto konnte nicht gespeichert werden: ' . $up['error']);
        require_once ABSPATH . 'wp-admin/includes/image.php';
        $att = wp_insert_attachment(['post_mime_type' => 'image/' . $m[1], 'post_title' => get_the_title($id), 'post_status' => 'inherit'], $up['file'], $id);
        if (is_wp_error($att) || !$att) return myf_err('Foto konnte nicht in die Mediathek übernommen werden.');
        wp_update_attachment_metadata($att, wp_generate_attachment_metadata($att, $up['file']));
    }
    if ($att && wp_attachment_is_image($att)) {
        set_post_thumbnail($id, $att);
        update_post_meta($id, 'einsatz_hasimages', '1'); // mit Einsatzbild enthält der Bericht Bilder
    } elseif ($req->has_param('hasimages')) update_post_meta($id, 'einsatz_hasimages', $req->get_param('hasimages') ? '1' : '0');
    return ['ok' => true, 'post_id' => $id, 'attachment_id' => $att ?: null, 'thumbnail' => (int) get_post_thumbnail_id($id),
        'special' => get_post_meta($id, 'einsatz_special', true) === '1', 'hasimages' => get_post_meta($id, 'einsatz_hasimages', true) === '1'];
}


// Vorschlag für den Website-Bericht: aus den Einsatzdaten und dem internen Einsatzbericht – nur öffentliche Angaben.
// Personenbezogene Felder (🔒) bleiben draußen, Kennzeichen und Hausnummern werden entfernt. Ergebnis ist nur ein Vorschlag zum Kürzen.
function myf_web_scrub($t, &$n) {
    $t = preg_replace_callback('/\b[A-ZÄÖÜ]{1,3}[- ][A-Z]{1,2}[- ]?\d{1,4}[EH]?\b/u', function () use (&$n) { $n++; return '[Kennzeichen]'; }, $t);
    $t = preg_replace_callback('/\b([A-ZÄÖÜ][\wäöüß.-]*(?:straße|strasse|str\.|weg|allee|platz|ring|gasse|damm|feld|kamp|hof|esch|berg))\s+\d+[a-zA-Z]?\b/u', function ($m) use (&$n) { $n++; return $m[1]; }, $t);
    return $t;
}
function myf_web_suggest($i) {
    global $wpdb;
    $rep = function_exists('myf_report_get') ? myf_report_get((int) $i->id) : [];
    $sens = [];
    foreach (myf_report_form() as $sec) foreach ($sec['fields'] as $f) if (!empty($f['sensitive'])) $sens[$f['id']] = 1;
    $val = function ($k) use ($rep, $sens) { if (isset($sens[$k])) return ''; $v = $rep[$k] ?? ''; return is_array($v) ? implode(', ', array_filter($v, 'is_string')) : trim((string) $v); };
    $types = myf_web_info()['types'] ?? [];
    // Nur Einsatzarten, die es auf der Website gibt; ohne Liste (noch keine angelegt) den Namen direkt vorschlagen
    $has = function ($t) use ($types) { if (!$types) return $t; foreach ($types as $x) if (mb_strtolower($x) === mb_strtolower($t)) return $x; return ''; };
    // Einsatzart: erst aus dem Bericht, sonst aus der Kategorie des Einsatzes
    $map = ['Kleinfeuer' => 'Feuer klein', 'Mittelbrand' => 'Brandeinsatz', 'Großbrand' => 'Brandeinsatz', 'Ölspur' => 'Ölspur', 'Person klemmt' => 'Eingeklemmte Person',
        'TH: Sonstiges' => 'Technische Hilfeleistung', 'Fehlalarm' => 'Fehlalarm', 'Brandsicherheitswache' => 'Brandsicherheitswache', 'kein Einsatz mehr' => 'Sonstiges'];
    $kw = '';
    foreach ((array) ($rep['einsatzart'] ?? []) as $a) { foreach ($map as $needle => $t) if (stripos((string) $a, $needle) !== false && ($kw = $has($t))) break 2; }
    if ($kw === '') $kw = $has(['brand' => 'Brandeinsatz', 'th' => 'Technische Hilfeleistung', 'vu' => 'Verkehrsunfall', 'fehl' => 'Fehlalarm', 'sonst' => 'Sonstiges'][$i->category] ?? '');
    $n = 0; $parts = [];
    foreach (['lage', 'bericht'] as $k) if (($v = $val($k)) !== '') $parts[] = myf_web_scrub($v, $n);
    // Was vorher erfasst wurde: Einheiten, Kräfte, Fahrzeuge, andere Beteiligte
    $units = $val('loeschzug');
    $strength = (int) $wpdb->get_var($wpdb->prepare('SELECT COUNT(*) FROM ' . myf_t('participation') . ' WHERE incident_id = %d AND confirmed = 1', $i->id));
    $vehs = $wpdb->get_col($wpdb->prepare('SELECT DISTINCT vehicle FROM ' . myf_t('participation') . " WHERE incident_id = %d AND vehicle <> ''", $i->id));
    $vehs = array_values(array_filter($vehs, function ($v) { return !preg_match('/Gerätehaus|Bereitschaft|Nachbereitung|Andere/u', $v); }));
    $facts = trim(($units !== '' ? 'Im Einsatz: ' . $units : 'Im Einsatz') . ($strength ? ' mit ' . ($strength === 1 ? 'einer Einsatzkraft' : $strength . ' Einsatzkräften') : '') . ($vehs ? ' (' . implode(', ', $vehs) . ')' : '') . '.');
    if ($units !== '' || $strength || $vehs) $parts[] = $facts;
    if (($o = $val('beteiligung')) !== '') $parts[] = 'Ebenfalls vor Ort: ' . $o . '.';
    $place = preg_replace('/\s+\d+\s*[a-zA-Z]?(?=\s*(,|$))/u', '', (string) $i->place);
    return ['title' => trim(($i->nr ? 'Einsatz ' . $i->nr . ' ' : '') . $i->title), 'keyword' => $kw, 'location' => trim($place),
        'content' => implode("\n\n", $parts), 'from_report' => (bool) array_filter([$val('lage'), $val('bericht')]), 'scrubbed' => $n];
}

// Bericht für die Website aus einem Wehrwerk-Einsatz anlegen (Einsatzführung)
add_action('rest_api_init', function () {
    register_rest_route('myf/v1', '/me/incident/websuggest', ['methods' => 'POST', 'permission_callback' => myf_perm('incident_manage'), 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $i = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('incidents') . ' WHERE id = %d', (int) $req->get_param('id')));
        return $i ? myf_web_suggest($i) : myf_err('Einsatz nicht gefunden.', 404);
    }]);
    register_rest_route('myf/v1', '/quick/extra', ['methods' => 'POST', 'callback' => 'myf_quick_extra', 'permission_callback' => function (WP_REST_Request $req) {
        $id = (int) $req->get_param('post_id');
        return $id && get_post_type($id) === 'einsatz' && current_user_can('edit_post', $id) && (!$req->get_param('image') || current_user_can('upload_files') || current_user_can('edit_einsatzberichte'));
    }]);
    register_rest_route('myf/v1', '/me/incident/web', ['methods' => 'POST', 'permission_callback' => myf_perm('incident_manage'), 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        if (myf_report_target() === 'wehrwerk') return myf_pub_save($req);
        if (!myf_ev_active()) return myf_err('Das Plugin „Einsatzverwaltung“ ist nicht aktiv.');
        if (!current_user_can('edit_einsatzberichte')) return myf_err('Website-Berichte sind für die Einsatzführung ausgeschaltet (Verwaltung → Einsätze → Website-Berichte).', 403);
        $i = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('incidents') . ' WHERE id = %d', (int) $req->get_param('id')));
        if (!$i) return myf_err('Einsatz nicht gefunden.', 404);
        if ($i->post_id && get_post_status((int) $i->post_id)) return myf_err('Für diesen Einsatz gibt es schon einen Bericht auf der Website.');
        $title = sanitize_text_field((string) $req->get_param('title'));
        if ($title === '') return myf_err('Bitte einen Titel angeben.');
        // Berichtstext wird nie direkt veröffentlicht: er stammt oft aus dem internen Bericht und wird vorher gekürzt/geprüft
        $publish = $req->get_param('publish') && current_user_can('publish_einsatzberichte') && trim((string) $req->get_param('content')) === '';
        $tz = wp_timezone();
        $fmt = function ($dt) use ($tz) { return (new DateTime($dt, $tz))->format(DATE_RFC3339); };
        $body = ['reason' => $title, 'date_start' => $fmt($i->start), 'publish' => $publish];
        if ($i->end) $body['date_end'] = $fmt($i->end);
        foreach (['keyword', 'location', 'content'] as $k) { $v = trim((string) $req->get_param($k)); if ($v !== '') $body[$k] = $k === 'content' ? wp_kses_post($v) : sanitize_text_field($v); }
        $res = array_values(array_filter(array_map('sanitize_text_field', (array) $req->get_param('resources'))));
        if ($res) $body['resources'] = implode(', ', $res);
        $sub = new WP_REST_Request('POST', '/einsatzverwaltung/v1/reports');
        $sub->set_header('content-type', 'application/json');
        $sub->set_body(wp_json_encode($body));
        $r = rest_do_request($sub);
        $data = $r->get_data();
        if ($r->is_error() || empty($data['id'])) return myf_err(is_array($data) && !empty($data['message']) ? $data['message'] : 'Die Einsatzverwaltung hat den Bericht nicht angenommen.');
        $wpdb->update(myf_t('incidents'), ['post_id' => (int) $data['id']], ['id' => $i->id]);
        if (!$publish) myf_notify_area('incidents', 'info', 'Website-Bericht zur Freigabe: ' . $title, 'Entwurf von ' . myf_actor() . ' – in WordPress unter „Einsatzberichte“ prüfen, kürzen und veröffentlichen.', 'admin:incident:' . (int) $i->id);
        return ['ok' => true, 'post_id' => (int) $data['id'], 'status' => get_post_status((int) $data['id']), 'link' => get_permalink((int) $data['id']), 'edit' => get_edit_post_link((int) $data['id'], 'raw')];
    }]);
    // Einstellungen der Website-Berichte (Bereich Einsätze)
    register_rest_route('myf/v1', '/admin/webreports', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
        $s = myf_settings();
        if ($req->has_param('target')) {
            if (!current_user_can('manage_options')) return myf_err('Das legen Administratoren fest.', 403);
            $s['report_target'] = in_array($req->get_param('target'), ['auto', 'einsatzverwaltung', 'wehrwerk'], true) ? $req->get_param('target') : 'auto';
        }
        if ($req->get_param('create_list_page') && !myf_reports_page_url()) {
            if (!current_user_can('publish_pages')) return myf_err('Seiten anlegen dürfen nur Administratoren.', 403);
            wp_insert_post(['post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Einsätze', 'post_name' => 'einsaetze', 'post_content' => '[wehrwerk_einsatzberichte]']);
        }
        if ($req->has_param('mode')) {
            if (!current_user_can('manage_options')) return myf_err('Wer Website-Berichte schreiben darf, legen Administratoren fest.', 403);
            $s['web_reports'] = in_array($req->get_param('mode'), ['off', 'draft', 'publish'], true) ? $req->get_param('mode') : 'draft';
        }
        if (is_array($req->get_param('prefix'))) foreach ($req->get_param('prefix') as $k => $v) if (isset(myf_units()[$k])) $s['quick_prefix'][$k] = mb_substr(preg_replace('/[^A-Za-z]/', '', (string) $v), 0, 3);
        if (is_array($req->get_param('vehicles'))) foreach ($req->get_param('vehicles') as $k => $list) if (isset(myf_units()[$k])) $s['quick_vehicles'][$k] = array_values(array_filter(array_map('sanitize_text_field', (array) $list)));
        update_option('myf_settings', $s);
        // Seite für die Schnellerfassung anlegen (nicht in Suchmaschinen, siehe accounts.php)
        if ($req->get_param('create_page') && !myf_quick_page_url()) {
            if (!current_user_can('publish_pages')) return myf_err('Seiten anlegen dürfen nur Administratoren.', 403);
            wp_insert_post(['post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Einsatz erfassen', 'post_name' => 'einsatz-erfassen', 'post_content' => '[wehrwerk_einsatz]']);
        }
        return ['ok' => true, 'url' => myf_quick_page_url()];
    }]);
});

add_filter('myf_admin_state', function ($d) {
    if (!function_exists('myf_has_area') || !myf_has_area('incidents')) return $d;
    $d['web_reports'] = ['mode' => myf_web_mode(), 'ev' => myf_ev_active(), 'target' => myf_report_target(), 'target_set' => myf_settings()['report_target'] ?? 'auto', 'list_url' => myf_reports_page_url(), 'units' => myf_quick_units(), 'url' => myf_quick_page_url(), 'can_mode' => current_user_can('manage_options'),
        'ev_vehicles' => myf_ev_active() ? (myf_web_info()['vehicles'] ?? []) : []];
    return $d;
}, 26);
