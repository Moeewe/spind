<?php
/** Konten der Mitglieder (WordPress-Benutzer mit eigener Rolle), Anmeldung im Portal, Seite und Menü. */

defined('ABSPATH') || exit;

// Wer bin ich? Für den Kopf in Mitglieder- und Verwaltungsansicht: Name, Dienstgrad, Einheit, Funktionen
function myf_who($me = null) {
    global $wpdb;
    $me = $me ?: (function_exists('myf_me') ? myf_me() : null);
    $u = wp_get_current_user();
    $fn = $me ? $wpdb->get_col($wpdb->prepare('SELECT t.name FROM ' . myf_t('member_traits') . ' mt JOIN ' . myf_t('traits') . " t ON t.id = mt.trait_id WHERE mt.member_id = %d AND t.cat = 'funktion' ORDER BY t.sort", $me->id)) : [];
    if (user_can($u, 'manage_options')) $fn[] = 'Webadmin';
    elseif (function_exists('myf_my_areas') && myf_my_areas() && !in_array('Wehrführung', $fn, true)) $fn[] = 'Verwaltung';
    $units = myf_units();
    // Ein Postfach für alles (myf_notes_split ist aus)
    $split = myf_notes_split() ? " AND link NOT LIKE 'admin:%%'" : '';
    $unread = $me ? (int) $wpdb->get_var($wpdb->prepare('SELECT COUNT(*) FROM ' . myf_t('notifications') . " WHERE member_id = %d AND read_at IS NULL AND archived = 0$split", $me->id)) : 0;
    $unreadAdmin = $me && $split ? (int) $wpdb->get_var($wpdb->prepare('SELECT COUNT(*) FROM ' . myf_t('notifications') . " WHERE member_id = %d AND read_at IS NULL AND archived = 0 AND link LIKE 'admin:%%'", $me->id)) : 0;
    return ['unread_admin' => $unreadAdmin, 'name' => $me ? $me->name : ($u->display_name ?: $u->user_login), 'rank' => $me ? (string) $me->dienstgrad : '',
        'unit' => $me && count($units) > 1 ? ($units[$me->unit] ?? '') : '', 'functions' => array_values(array_unique($fn)), 'unread' => $unread, 'linked' => (bool) $me];
}

function myf_is_member_only($user = null) {
    $user = $user ?: wp_get_current_user();
    return $user && $user->ID && in_array(MYF_ROLE, (array) $user->roles, true) && !user_can($user, 'edit_posts');
}

// Mitglieder brauchen keinen WordPress-Adminbereich: dorthin → Portal
add_action('admin_init', function () {
    if (wp_doing_ajax() || !myf_is_member_only()) return;
    wp_safe_redirect(myf_member_page_url());
    exit;
});
// Die schwarze WordPress-Leiste nur für Leute, die an der Website arbeiten (Beiträge/Seiten). Mitglieder und reine
// Wehrwerk-Verwaltung (Führung, Gerätewarte …) sehen sie nicht – Website-Admins nutzen dafür ein zweites Konto.
add_filter('show_admin_bar', function ($show) { return current_user_can('edit_posts') ? $show : false; });
add_filter('login_redirect', function ($to, $requested, $user) {
    if (!($user instanceof WP_User) || !myf_is_member_only($user)) return $to;
    // Ziel innerhalb des Portals behalten (z. B. ?mangel=HLF vom QR-Code)
    $req = $requested && strpos($requested, '/') === 0 ? home_url($requested) : (string) $requested;
    $page = myf_member_page_url();
    return $req && strpos($req, strtok($page, '?')) === 0 ? $req : $page;
}, 10, 3);

// „Angemeldet bleiben“: Mitglieder 180 Tage
add_filter('auth_cookie_expiration', function ($length, $userId, $remember) {
    $u = get_userdata($userId);
    return $remember && $u && in_array(MYF_ROLE, (array) $u->roles, true) ? max($length, 180 * DAY_IN_SECONDS) : $length;
}, 10, 3);

add_action('wp_login', function ($login, $user) {
    update_user_meta($user->ID, 'myf_last_login', current_time('mysql'));
}, 10, 2);

// Einladungs-Mail: verständlich und mit Link zum Portal
add_filter('wp_new_user_notification_email', function ($mail, $user) {
    if (!in_array(MYF_ROLE, (array) $user->roles, true)) return $mail;
    if (!preg_match('#(https?://\S*(?:action=rp|wp-login\.php\?[^\s>]*key=)\S*)#', $mail['message'], $m)) return $mail;
    $mail['subject'] = myf_invite_subject();
    $mail['message'] = myf_invite_text($user->first_name, $user->user_login, rtrim($m[1], '>'));
    return $mail;
}, 10, 2);

function myf_invite_subject() { $b = myf_brand(); return 'Einladung zu ' . $b['app'] . ' – ' . $b['org']; }
function myf_invite_text($first, $login, $link) {
    return "Hallo " . $first . ",\n\n"
        . "für dich wurde ein Zugang zu " . myf_brand()['app'] . " eingerichtet – unserem Mitgliederbereich (" . myf_brand()['org'] . ").\n"
        . "Dort trägst du Lehrgangswünsche ein, siehst deine Termine, meldest Kleiderbedarf und Mängel und kannst Anregungen an die Führung geben.\n\n"
        . "Dein Benutzername: " . $login . " (oder deine E-Mail-Adresse)\n\n"
        . "Lege hier dein Passwort fest (der Link ist einige Tage gültig):\n" . $link . "\n\n"
        . "Danach geht es hier zu " . myf_brand()['app'] . ":\n" . myf_member_page_url() . "\n\n"
        . "Tipp: Beim Anmelden „Angemeldet bleiben“ anhaken, dann musst du dich auf dem Handy lange nicht neu anmelden.\n";
}

// Absender der Mails (so wie WordPress ihn setzt, inkl. SMTP-Plugins)
function myf_mail_from() {
    $host = strtolower((string) wp_parse_url(network_home_url(), PHP_URL_HOST));
    if (strpos($host, 'www.') === 0) $host = substr($host, 4);
    return ['email' => apply_filters('wp_mail_from', 'wordpress@' . $host), 'name' => apply_filters('wp_mail_from_name', 'WordPress')];
}

// Legt für ein Mitglied ein Konto an (oder verknüpft ein vorhandenes mit gleicher E-Mail) und verschickt auf Wunsch die Einladung
function myf_ensure_account($memberId, $email, $invite) {
    global $wpdb;
    $m = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('members') . ' WHERE id = %d', $memberId));
    if (!$m) return myf_err('Mitglied nicht gefunden.', 404);
    $email = sanitize_email($email);
    if ($m->user_id && get_userdata((int) $m->user_id)) {
        $uid = (int) $m->user_id;
        if ($email && $email !== get_userdata($uid)->user_email) {
            if (email_exists($email)) return myf_err('Diese E-Mail-Adresse gehört schon zu einem anderen Konto.');
            wp_update_user(['ID' => $uid, 'user_email' => $email]);
        }
    } else {
        if (!$email || !is_email($email)) return null; // ohne E-Mail kein Konto
        if (myf_demo_ctx()) return myf_err('Im Demo-Modus werden keine echten Konten angelegt.');
        $uid = email_exists($email);
        if (!$uid) {
            $parts = array_map('trim', explode(',', $m->name, 2));
            $first = $parts[1] ?? ''; $last = $parts[0];
            $base = sanitize_user(strtolower(remove_accents(($first ? $first . '.' : '') . $last)), true) ?: 'mitglied';
            $base = preg_replace('/[^a-z0-9._-]/', '', str_replace(' ', '', $base));
            $login = $base; $n = 2;
            while (username_exists($login)) $login = $base . $n++;
            $uid = wp_insert_user([
                'user_login' => $login, 'user_email' => $email, 'user_pass' => wp_generate_password(24),
                'first_name' => $first, 'last_name' => $last, 'display_name' => trim($first . ' ' . $last), 'role' => MYF_ROLE,
            ]);
            if (is_wp_error($uid)) return $uid;
        } elseif ($wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('members') . ' WHERE user_id = %d AND id <> %d', $uid, $memberId))) {
            return myf_err('Dieses Konto ist schon einem anderen Mitglied zugeordnet.');
        }
        $wpdb->update(myf_t('members'), ['user_id' => $uid], ['id' => $memberId]);
    }
    if ($invite) wp_new_user_notification($uid, null, 'user');
    return $uid;
}

// ---------------------------------------------------------------------------
// Portalseite [myfeuerwehr] und Verwaltung im Menü
// ---------------------------------------------------------------------------

// Kopf mit Logo (hell/dunkel) für Portal und Anmeldung
// Kopf im Stil der NRW-Kampagne: weiße Schrift im schrägen roten Feld (das Logo zeigt die Website selbst)
function myf_brand_head($title = 'Mitgliederbereich') {
    return '<div class="ffl-head"><h2 class="ffl-tagline"><span>' . esc_html($title) . '</span></h2></div>';
}

// Verwaltung ohne eigenes Mitglied: sich selbst zuordnen oder neu anlegen
function myf_link_self_box() {
    global $wpdb;
    $members = $wpdb->get_results('SELECT id, name, unit FROM ' . myf_t('members') . ' WHERE active = 1 ORDER BY name');
    $u = wp_get_current_user();
    $opts = '';
    foreach ($members as $m) $opts .= '<option value="' . esc_attr($m->name) . '" data-id="' . (int) $m->id . '"></option>';
    $cfg = wp_json_encode(['api' => esc_url_raw(rest_url('myf/v1/admin/linkme')), 'nonce' => wp_create_nonce('wp_rest'),
        'ids' => array_map(function ($m) { return [$m->name, (int) $m->id]; }, $members)]);
    return '<div id="ffl" class="ffl ffl-member">' . myf_brand_head() .
        '<div class="ffl-panel"><b style="font-size:18px">Hallo ' . esc_html($u->first_name ?: $u->display_name) . ', dein Konto ist noch keinem Mitglied zugeordnet.</b>' .
        '<p class="ffl-mu">Du bist mit deinem Verwaltungskonto angemeldet. Damit du ' . esc_html(myf_brand()['app']) . ' auch selbst nutzen kannst (Lehrgänge, Größen, Kleidung …), ordne dich einmal zu.</p>' .
        '<label class="ffl-fl" for="myf-self">Ich bin …</label><input type="search" id="myf-self" list="myf-self-l" placeholder="Namen tippen, z. B. Mustermann" autocomplete="off"><datalist id="myf-self-l">' . $opts . '</datalist>' .
        '<div class="ffl-row" style="margin-top:10px"><button type="button" class="ffl-p" id="myf-self-go">Das bin ich – zuordnen</button></div>' .
        '<details style="margin-top:14px"><summary class="ffl-mu" style="cursor:pointer">Ich stehe noch nicht in der Liste</summary><div class="ffl-row" style="margin-top:8px">' .
        '<select id="myf-self-unit" style="width:auto"' . (count(myf_units()) < 2 ? ' hidden' : '') . '>' . implode('', array_map(function ($k, $l) { return '<option value="' . esc_attr($k) . '">' . esc_html($l) . '</option>'; }, array_keys(myf_units()), myf_units())) . '</select>' .
        '<button type="button" id="myf-self-new">Mich als neues Mitglied anlegen</button></div></details>' .
        '<p class="ffl-mu" style="margin-top:14px">Oder direkt: <button type="button" class="ffl-sm" onclick="window.MYFAdminOpen&&MYFAdminOpen()">Verwaltung öffnen</button></p><div id="myf-self-msg"></div></div>' . myf_front_admin() .
        '<script>(function(){var C=' . $cfg . ';function go(b){fetch(C.api,{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json","X-WP-Nonce":C.nonce},body:JSON.stringify(b)})' .
        '.then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.message||"Fehler");location.reload();});}).catch(function(e){document.getElementById("myf-self-msg").innerHTML="<div class=\\"ffl-msg err\\">"+e.message+"</div>";});}' .
        'document.getElementById("myf-self-go").onclick=function(){var v=document.getElementById("myf-self").value.trim().toLowerCase();var hit=C.ids.filter(function(x){return x[0].toLowerCase()===v;})[0]||(function(){var h=C.ids.filter(function(x){return v&&x[0].toLowerCase().indexOf(v)>=0;});return h.length===1?h[0]:null;})();' .
        'if(!hit){document.getElementById("myf-self-msg").innerHTML="<div class=\\"ffl-msg err\\">Bitte einen Namen aus den Vorschlägen wählen.</div>";return;}if(confirm("Mit „"+hit[0]+"“ verknüpfen?"))go({member_id:hit[1]});};' .
        'document.getElementById("myf-self-new").onclick=function(){go({create:true,unit:document.getElementById("myf-self-unit").value});};})();</script></div>';
}

// Nach dem Anmelden dorthin zurück, wo der Link hinwollte (QR am Gerät/Fahrzeug, Bericht-Link aus der Mail)
function myf_login_target() {
    $url = get_permalink() ?: myf_member_page_url();
    foreach (['mangel', 'geraet', 'eid', 'r', 'bericht', 'ebericht', 'fahrt', 'fz', 'seite', 'reiter'] as $k) {
        if (isset($_GET[$k]) && $_GET[$k] !== '') $url = add_query_arg($k, rawurlencode(sanitize_text_field(wp_unslash($_GET[$k]))), $url);
    }
    return $url;
}
function myf_login_box($msg = '') {
    $form = wp_login_form([
        'echo' => false, 'form_id' => 'myf-login',
        'redirect' => myf_login_target(),
        'label_username' => 'Benutzername oder E-Mail', 'label_password' => 'Passwort', 'label_remember' => 'Angemeldet bleiben',
        'label_log_in' => 'Anmelden', 'remember' => true, 'value_remember' => true,
    ]);
    return '<div id="ffl" class="ffl ffl-member">' . myf_brand_head('Anmelden') .
        '<div class="ffl-sub">' . ($msg ?: 'Mitgliederbereich · ' . esc_html(myf_brand()['org']) . '. Bitte mit deinem Konto anmelden.') . '</div>' .
        '<div class="ffl-panel">' . $form . '<p class="ffl-mu" style="margin:14px 0 0"><a href="' . esc_url(wp_lostpassword_url(get_permalink())) . '">Passwort vergessen oder noch keins festgelegt?</a></p></div>' .
        '<p class="ffl-mu">Noch kein Zugang? Bitte bei der Wehrführung melden.</p></div>';
}

// Gemeinsame Einstellungen für Mitgliederbereich und Verwaltung (Browser)
function myf_js_config() {
    $b = myf_brand();
    $page = get_permalink() ?: myf_member_page_url();
    return [
        'api' => esc_url_raw(rest_url('myf/v1/')), 'nonce' => wp_create_nonce('wp_rest'),
        'logout' => wp_logout_url($page), 'account' => wp_lostpassword_url($page),
        'logo' => myf_logo_url('light'), 'logoDark' => myf_logo_url('dark'),
        'app' => $b['app'], 'org' => ['name' => $b['org'], 'place' => $b['place'], 'zip' => $b['zip']],
        'admin' => is_user_logged_in() && (myf_can_manage() || myf_my_areas()), 'front' => !is_admin(),
        'sw' => add_query_arg('myf_sw', 1, home_url('/')),
        'course_places' => (object) (array) myf_local('course_places'),
    ];
}

// Verwaltung auf der Website (für alle mit mindestens einem Verwaltungsbereich): als Vollbild-Ebene über dem Mitgliederbereich
function myf_front_admin() {
    if (!is_user_logged_in() || (!myf_can_manage() && !myf_my_areas())) return '';
    wp_enqueue_script('myf-qr', MYF_URL . 'assets/vendor/qrcode.min.js', [], MYF_ASSET_VER, true);
    wp_enqueue_script('myf-names', MYF_URL . 'assets/names.js', [], MYF_ASSET_VER, true);
    wp_enqueue_script('myf-shared', MYF_URL . 'assets/shared.js', [], MYF_ASSET_VER, true);
    wp_enqueue_script('myf-admin', MYF_URL . 'assets/admin.js', ['myf-qr', 'myf-names', 'myf-shared'], MYF_ASSET_VER, true);
    wp_localize_script('myf-shared', 'MYF', myf_js_config());
    return '<div id="ffl-adm-wrap" class="ffl-adm-wrap" hidden>' .
        '<div id="ffl-adm" class="ffl ffl-admin ffl-front"><p class="ffl-mu">Wird geladen …</p></div></div>';
}

add_shortcode('myfeuerwehr', function () {
    wp_enqueue_style('myf', MYF_URL . 'assets/app.css', [], MYF_ASSET_VER);
    if (!is_user_logged_in()) return myf_login_box();
    if (!myf_me()) {
        if (myf_can_manage()) return myf_link_self_box();
        // Pausierte Mitgliedschaft: freundlich erklären statt „nicht zugeordnet“
        global $wpdb;
        $ms = $wpdb->get_var($wpdb->prepare('SELECT mstatus FROM ' . myf_t('members') . ' WHERE user_id = %d', get_current_user_id()));
        if ($ms === 'pausiert') return '<div id="ffl" class="ffl ffl-member">' . myf_brand_head() . '<div class="ffl-msg">Deine Mitgliedschaft ist gerade <b>pausiert</b> – deshalb ist der Mitgliederbereich ausgeblendet. Sobald du zurück bist, schaltet die Wehrführung dich wieder frei.</div></div>';
        return '<div id="ffl" class="ffl ffl-member">' . myf_brand_head() . '<div class="ffl-msg warn">Dein Konto ist noch keinem Mitglied zugeordnet. Bitte bei der Wehrführung melden.</div></div>';
    }
    wp_enqueue_script('myf-shared', MYF_URL . 'assets/shared.js', [], MYF_ASSET_VER, true);
    wp_enqueue_script('myf-qr', MYF_URL . 'assets/vendor/qrcode.min.js', [], MYF_ASSET_VER, true); // QR-Code für die Zwei-Faktor-Einrichtung
    wp_enqueue_script('myf-member', MYF_URL . 'assets/member.js', ['myf-shared', 'myf-qr'], MYF_ASSET_VER, true);
    $admin = myf_front_admin();
    if (!$admin) wp_localize_script('myf-shared', 'MYF', myf_js_config());
    return '<div id="ffl" class="ffl ffl-member"><p class="ffl-mu">Wird geladen …</p></div>' . $admin;
});

// Portalseite: nicht in Suchmaschinen, nicht im Cache
function myf_is_portal_page() {
    if (!is_singular()) return false;
    $c = (string) get_post_field('post_content', get_queried_object_id());
    return has_shortcode($c, 'myfeuerwehr') || has_shortcode($c, 'wehrwerk');
}
function myf_is_private_page() {
    if (!is_singular()) return false;
    $c = (string) get_post_field('post_content', get_queried_object_id());
    foreach (['myfeuerwehr', 'wehrwerk', 'wehrwerk_einsatz', 'ff_einsatz_erfassen'] as $sc) if (has_shortcode($c, $sc)) return true;
    return false;
}
add_filter('wp_robots', function ($robots) {
    if (myf_is_private_page()) { $robots['noindex'] = true; $robots['nofollow'] = true; $robots['noarchive'] = true; }
    return $robots;
});
add_action('template_redirect', function () {
    if (!myf_is_private_page()) return;
    header('X-Robots-Tag: noindex, nofollow, noarchive');
    nocache_headers();
    if (!defined('DONOTCACHEPAGE')) define('DONOTCACHEPAGE', true);
});

add_action('admin_menu', function () {
    $app = myf_brand()['app'];
    $GLOBALS['myf_page_hook'] = add_menu_page($app, $app, 'ffl_manage', 'myf', function () {
        echo '<div class="wrap"><div id="ffl" class="ffl ffl-admin"><p>Wird geladen …</p></div></div>';
    }, 'dashicons-shield', 26);
});

// Einheitliche Body-Klasse für das Styling, egal wie andere Plugins den Seitennamen verändern
add_filter('admin_body_class', function ($c) { return ($_GET['page'] ?? '') === 'myf' && strpos($c, 'toplevel_page_myf ') === false ? $c . ' toplevel_page_myf ' : $c; });
add_action('admin_enqueue_scripts', function ($hook) {
    // Seitenname kann je nach anderen Plugins abweichen (z. B. „toplevel_page_einsatzverwaltungmyf“) – daher über die Seite prüfen
    if ($hook !== ($GLOBALS['myf_page_hook'] ?? 'toplevel_page_myf') && ($_GET['page'] ?? '') !== 'myf') return;
    wp_enqueue_style('myf', MYF_URL . 'assets/app.css', [], MYF_ASSET_VER);
    wp_enqueue_script('myf-qr', MYF_URL . 'assets/vendor/qrcode.min.js', [], MYF_ASSET_VER, true);
    wp_enqueue_script('myf-names', MYF_URL . 'assets/names.js', [], MYF_ASSET_VER, true);
    wp_enqueue_script('myf-shared', MYF_URL . 'assets/shared.js', [], MYF_ASSET_VER, true);
    wp_enqueue_script('myf-admin', MYF_URL . 'assets/admin.js', ['myf-qr', 'myf-names', 'myf-shared'], MYF_ASSET_VER, true);
    wp_localize_script('myf-shared', 'MYF', myf_js_config());
});

// Kopf (Name, Funktionen, Postfach) und Fußzeile in beiden Ansichten
add_filter('myf_me_data', function ($data, $me) {
    $data['who'] = myf_who($me);
    $data['foot'] = ['org' => myf_brand()['org'], 'site' => home_url('/'), 'year' => (int) current_time('Y'), 'ver' => MYF_VERSION, 'channel' => MYF_CHANNEL];
    return $data;
}, 30, 2);
add_filter('myf_admin_state', function ($d) {
    $d['who'] = myf_who();
    $d['foot'] = ['org' => myf_brand()['org'], 'site' => home_url('/'), 'year' => (int) current_time('Y'), 'member' => myf_member_page_url(), 'ver' => MYF_VERSION, 'channel' => MYF_CHANNEL];
    return $d;
}, 30);

// WordPress-Anmeldeseite (z. B. nach dem Abmelden) im gleichen NRW-Look: Logo der Wehr, rotes eckiges Feld, keine WordPress-Optik
add_action('login_head', function () {
    $logo = esc_url(myf_logo_url('light'));
    $f = esc_url(MYF_URL . 'assets/fonts/');
    echo '<style>@font-face{font-family:Barlow;font-weight:400;src:url(' . $f . 'Barlow-Regular.woff2) format("woff2")}@font-face{font-family:Barlow;font-weight:700;src:url(' . $f . 'Barlow-Bold.woff2) format("woff2")}body.login{background:#fff;font-family:Barlow,"Segoe UI",Arial,sans-serif}'
        . '#login h1 a{background:url(' . $logo . ') no-repeat center/contain;width:100%;max-width:316px;height:56px;margin:0 auto 18px}'
        . '#login{padding-top:8vh}.login form{border:1px solid #e3e3e3!important;border-top:4px solid #e30613!important;box-shadow:none;border-radius:0}'
        . '.login form .input,.login input[type=text],.login input[type=password]{border-radius:2px;border-color:#cfcfcf;box-shadow:none}'
        . '.login form .input:focus{border-color:#111;box-shadow:0 0 0 1px #111}'
        . '.login.wp-core-ui .button-primary,.wp-core-ui .button-primary{background:#e30613!important;border-color:#e30613!important;color:#fff!important;border-radius:2px;font-weight:700;text-shadow:none;box-shadow:none}'
        . '.wp-core-ui .button-primary:hover,.wp-core-ui .button-primary:focus{background:#b8050f;border-color:#b8050f}'
        . '.login #nav a,.login #backtoblog a{color:#313131}.login .message,.login .notice,.login .success{border-left-color:#e30613!important;box-shadow:none}'
        . '.login .button.wp-hide-pw .dashicons{color:#111}.language-switcher{display:none}</style>';
}, 99); // nach den WordPress-Stilen
add_filter('login_headerurl', function () { return home_url('/'); });
add_filter('login_headertext', function () { return myf_brand()['org']; });
