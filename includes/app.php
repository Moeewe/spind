<?php
/**
 * Wehrwerk-App (iPhone, iPad, Mac): Geräte sicher mit dem eigenen Konto verbinden – ohne dass die App je ein Passwort sieht.
 *
 * Ablauf (wie „Mit dem Browser anmelden“):
 *  1. Die App öffnet im System-Browser  /?myf_app=link&challenge=…&name=…  – dort meldet man sich ganz normal an
 *     (Passwort, Passkey, Zwei-Faktor) und bestätigt „Dieses Gerät verbinden“.
 *  2. Der Browser gibt einen Einmal-Code (2 Minuten gültig) an die App zurück:  wehrwerk://link?code=…
 *  3. Die App tauscht Code + Nachweis (verifier, passend zur challenge – PKCE) gegen ein Geräte-Kennzeichen (Token).
 *
 * Das Token steht nur auf dem Gerät (Schlüsselbund); in der Datenbank liegt allein seine Prüfsumme. Es gilt nur für die
 * Mitglieder-Schnittstelle (nie für /admin/), lässt sich je Gerät widerrufen und endet mit Austritt oder Sperre des Kontos.
 */

defined('ABSPATH') || exit;

const MYF_APP_SCHEME = 'wehrwerk://link';

// Geräte gehören zum WordPress-Konto, nicht zum Datenbestand: bewusst ohne Demo-Präfix
function myf_app_table() { global $wpdb; return $wpdb->prefix . 'ffl_app_tokens'; }

function myf_install_app($c) {
    dbDelta('CREATE TABLE ' . myf_app_table() . " (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        user_id bigint(20) unsigned NOT NULL,
        name varchar(80) NOT NULL DEFAULT '',
        platform varchar(20) NOT NULL DEFAULT '',
        token_hash char(64) NOT NULL,
        created datetime NOT NULL,
        last_used datetime NULL,
        revoked datetime NULL,
        PRIMARY KEY  (id),
        UNIQUE KEY token_hash (token_hash),
        KEY user_id (user_id)
    ) $c;");
}

function myf_app_b64url($bin) { return rtrim(strtr(base64_encode($bin), '+/', '-_'), '='); }
function myf_app_ip_key($what) { return 'myf_app_' . $what . '_' . substr(hash('sha256', (string) ($_SERVER['REMOTE_ADDR'] ?? '')), 0, 20); }

// ---- 1) Bestätigungsseite im Browser -------------------------------------------------------------------------------
add_action('template_redirect', function () {
    if (($_GET['myf_app'] ?? '') !== 'link') return;
    nocache_headers();
    $challenge = (string) ($_GET['challenge'] ?? '');
    $name = trim(sanitize_text_field(wp_unslash((string) ($_GET['name'] ?? '')))) ?: 'Gerät';
    $name = function_exists('mb_substr') ? mb_substr($name, 0, 60) : substr($name, 0, 60);
    if (!preg_match('/^[A-Za-z0-9_-]{43}$/', $challenge)) myf_app_page('Verbinden nicht möglich', '<p>Der Aufruf ist unvollständig. Bitte in der App erneut auf „Verbinden“ tippen.</p>', 400);
    if (!is_user_logged_in()) { auth_redirect(); exit; }
    $u = wp_get_current_user();
    if (get_user_meta($u->ID, 'myf_locked', true)) myf_app_page('Konto gesperrt', '<p>Dieses Konto ist gesperrt und kann kein Gerät verbinden.</p>', 403);
    // Geräte verbinden sich immer mit dem echten Bestand – nie mit Demo-Konten oder der Demo-Ansicht
    if (function_exists('myf_demo_ctx') && myf_demo_ctx()) myf_app_page('Im Demo-Modus nicht möglich', '<p>Im Demo-Modus lässt sich kein Gerät verbinden. Bitte die Demo-Ansicht verlassen und es erneut versuchen.</p>', 403);
    if (!myf_me()) myf_app_page('Kein Mitglied', '<p>Dein Konto ist keinem Mitglied zugeordnet. Bitte an die Verwaltung wenden.</p>', 403);

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        if (!wp_verify_nonce((string) ($_POST['_myf_app'] ?? ''), 'myf_app_link_' . $challenge)) myf_app_page('Abgelaufen', '<p>Die Bestätigung ist abgelaufen. Bitte in der App erneut auf „Verbinden“ tippen.</p>', 400);
        if (isset($_POST['cancel'])) myf_app_page('Abgebrochen', '<p>Es wurde kein Gerät verbunden. Du kannst dieses Fenster schließen.</p>');
        $code = bin2hex(random_bytes(32));
        set_transient('myf_app_code_' . hash('sha256', $code), ['user' => (int) $u->ID, 'challenge' => $challenge, 'name' => $name], 2 * MINUTE_IN_SECONDS);
        $back = MYF_APP_SCHEME . '?code=' . $code;
        header('Location: ' . $back, true, 302);
        myf_app_page('Zurück zur App', '<p>Fast fertig. Falls die App nicht von selbst aufgeht:</p><p><a class="b" href="' . esc_attr($back) . '">Wehrwerk-App öffnen</a></p>', 302);
    }
    $m = myf_me();
    myf_app_page('Gerät verbinden',
        '<p>Soll <b>' . esc_html($name) . '</b> mit deinem Konto verbunden werden?</p>' .
        '<p class="who">Angemeldet als <b>' . esc_html($m->name) . '</b></p>' .
        '<ul><li>Die App sieht dasselbe wie du im Mitgliederbereich.</li><li>Dein Passwort erfährt die App nicht.</li><li>Unter Profil kannst du das Gerät jederzeit wieder trennen.</li></ul>' .
        '<form method="post">' . wp_nonce_field('myf_app_link_' . $challenge, '_myf_app', true, false) .
        '<button class="b" type="submit" name="ok" value="1">Verbinden</button> <button class="g" type="submit" name="cancel" value="1">Abbrechen</button></form>');
}, 1);

function myf_app_page($title, $html, $status = 200) {
    $b = function_exists('myf_brand') ? myf_brand() : [];
    $color = preg_match('/^#[0-9a-f]{6}$/i', (string) ($b['color'] ?? '')) ? $b['color'] : '#e30613';
    if ($status !== 302) status_header($status);
    header('Content-Type: text/html; charset=utf-8');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: no-referrer');
    echo '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">' .
        '<title>' . esc_html($title) . ' – Wehrwerk</title><style>body{margin:0;font:17px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f3f3f3;color:#111}' .
        'main{max-width:440px;margin:8vh auto;padding:28px 24px;background:#fff;border-top:4px solid ' . esc_attr($color) . '}h1{font-size:26px;line-height:1.1;margin:0 0 14px}' .
        'ul{padding-left:20px;color:#555;font-size:15px}.who{color:#555;font-size:15px}form{margin-top:22px;display:flex;gap:10px;flex-wrap:wrap}' .
        '.b,.g{font:inherit;font-weight:700;padding:13px 22px;border:2px solid #111;background:#fff;color:#111;cursor:pointer;text-decoration:none;display:inline-block}' .
        '.b{background:' . esc_attr($color) . ';border-color:' . esc_attr($color) . ';color:#fff}</style></head><body><main><h1>' . esc_html($title) . '</h1>' . $html . '</main></body></html>';
    exit;
}

// ---- 2) Einmal-Code gegen Geräte-Token tauschen; 3) Geräte verwalten ------------------------------------------------
add_action('rest_api_init', function () {
    register_rest_route('myf/v1', '/app/token', ['methods' => 'POST', 'permission_callback' => '__return_true', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $rk = myf_app_ip_key('try');
        if ((int) get_transient($rk) >= 10) return myf_err('Zu viele Versuche. Bitte in 15 Minuten erneut versuchen.', 429);
        set_transient($rk, (int) get_transient($rk) + 1, 15 * MINUTE_IN_SECONDS);
        $code = (string) $req->get_param('code'); $verifier = (string) $req->get_param('secret'); // Feldname „secret“: wird im Änderungsprotokoll automatisch maskiert
        if (!preg_match('/^[0-9a-f]{64}$/', $code) || !preg_match('/^[A-Za-z0-9._~-]{43,128}$/', $verifier)) return myf_err('Verbindung fehlgeschlagen. Bitte erneut verbinden.', 400);
        $tk = 'myf_app_code_' . hash('sha256', $code);
        $c = get_transient($tk);
        delete_transient($tk); // Einmal-Code: auch ein Fehlversuch verbraucht ihn
        if (!is_array($c) || !hash_equals((string) $c['challenge'], myf_app_b64url(hash('sha256', $verifier, true)))) return myf_err('Der Code ist abgelaufen oder ungültig. Bitte erneut verbinden.', 400);
        $u = get_userdata((int) $c['user']);
        if (!$u || get_user_meta($u->ID, 'myf_locked', true)) return myf_err('Dieses Konto kann kein Gerät verbinden.', 403);
        $token = 'wwk_' . bin2hex(random_bytes(32));
        $platform = preg_replace('/[^a-z]/', '', strtolower((string) $req->get_param('platform')));
        $wpdb->insert(myf_app_table(), ['user_id' => $u->ID, 'name' => (string) $c['name'], 'platform' => substr($platform, 0, 20), 'token_hash' => hash('sha256', $token), 'created' => current_time('mysql')]);
        if (!$wpdb->insert_id) return myf_err('Das Gerät konnte nicht gespeichert werden.', 500);
        delete_transient($rk);
        if (function_exists('myf_audit_write')) myf_audit_write('user', (int) $u->ID, $u->display_name ?: $u->user_login, 'app/link', 'app_devices', (int) $wpdb->insert_id, ['geraet' => (string) $c['name'], 'plattform' => $platform]);
        $b = function_exists('myf_brand') ? myf_brand() : [];
        return ['ok' => true, 'token' => $token, 'device_id' => (int) $wpdb->insert_id, 'user' => $u->display_name, 'org' => (string) ($b['org'] ?? ''), 'version' => MYF_VERSION];
    }]);
    register_rest_route('myf/v1', '/me/app/revoke', ['methods' => 'POST', 'permission_callback' => 'is_user_logged_in', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $id = $req->get_param('current') ? (int) ($GLOBALS['myf_app_device'] ?? 0) : (int) $req->get_param('id');
        $row = $id ? $wpdb->get_row($wpdb->prepare('SELECT id, name FROM ' . myf_app_table() . ' WHERE id = %d AND user_id = %d AND revoked IS NULL', $id, get_current_user_id())) : null;
        if (!$row) return myf_err('Gerät nicht gefunden.', 404);
        $wpdb->update(myf_app_table(), ['revoked' => current_time('mysql')], ['id' => $row->id]);
        $u = wp_get_current_user();
        if (function_exists('myf_audit_write')) myf_audit_write('user', (int) $u->ID, $u->display_name ?: $u->user_login, 'app/revoke', 'app_devices', (int) $row->id, ['geraet' => $row->name]);
        return ['ok' => true, 'id' => (int) $row->id, 'devices' => myf_app_devices(get_current_user_id())];
    }]);
});

function myf_app_devices($uid) {
    global $wpdb;
    $cur = (int) ($GLOBALS['myf_app_device'] ?? 0);
    return array_map(function ($r) use ($cur) {
        return ['id' => (int) $r->id, 'name' => $r->name, 'platform' => $r->platform, 'created' => $r->created, 'last_used' => $r->last_used, 'current' => (int) $r->id === $cur];
    }, $wpdb->get_results($wpdb->prepare('SELECT id, name, platform, created, last_used FROM ' . myf_app_table() . ' WHERE user_id = %d AND revoked IS NULL ORDER BY created DESC', (int) $uid)) ?: []);
}
add_filter('myf_me_data', function ($data) { $data['app_devices'] = myf_app_devices(get_current_user_id()); return $data; }, 46);

// ---- Anmeldung mit dem Geräte-Token: nur Mitglieder-Schnittstelle, nie /admin/ ---------------------------------------
function myf_app_request_path() {
    if (isset($_GET['rest_route'])) return '/' . ltrim((string) wp_unslash($_GET['rest_route']), '/');
    $uri = (string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH);
    $pos = strpos($uri, '/' . rest_get_url_prefix() . '/');
    return $pos === false ? '' : substr($uri, $pos + strlen(rest_get_url_prefix()) + 1);
}
add_filter('determine_current_user', function ($uid) {
    global $wpdb;
    if ($uid) return $uid;
    $t = (string) ($_SERVER['HTTP_X_WEHRWERK_TOKEN'] ?? '');
    if ($t === '' && preg_match('/^Bearer\s+(wwk_[0-9a-f]{64})$/', (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '')), $m)) $t = $m[1];
    if (!preg_match('/^wwk_[0-9a-f]{64}$/', $t)) return $uid;
    $path = myf_app_request_path();
    if (strpos($path, '/myf/v1/') !== 0 || strpos($path, '/myf/v1/admin') === 0) return $uid;
    $row = $wpdb->get_row($wpdb->prepare('SELECT id, user_id, last_used FROM ' . myf_app_table() . ' WHERE token_hash = %s AND revoked IS NULL', hash('sha256', $t)));
    if (!$row || get_user_meta((int) $row->user_id, 'myf_locked', true) || !get_userdata((int) $row->user_id)) return $uid;
    $GLOBALS['myf_app_device'] = (int) $row->id;
    // „Zuletzt benutzt“ höchstens alle 30 Minuten schreiben
    if (!$row->last_used || strtotime($row->last_used) < strtotime(current_time('mysql')) - 30 * MINUTE_IN_SECONDS) $wpdb->update(myf_app_table(), ['last_used' => current_time('mysql')], ['id' => $row->id]);
    return (int) $row->user_id;
}, 30);
// Mit Geräte-Token gibt es keine Verwaltung – auch nicht über Umwege (z. B. ?rest_route=)
add_filter('rest_pre_dispatch', function ($res, $server, $req) {
    if (!empty($GLOBALS['myf_app_device']) && (strpos($req->get_route(), '/myf/v1/') !== 0 || strpos($req->get_route(), '/myf/v1/admin') === 0))
        return new WP_Error('myf_app_scope', 'Mit der App ist nur der Mitgliederbereich erreichbar.', ['status' => 403]);
    return $res;
}, 4, 3);
// Austritt oder Sperre: alle Geräte sofort trennen
add_action('updated_user_meta', 'myf_app_on_lock', 10, 4);
add_action('added_user_meta', 'myf_app_on_lock', 10, 4);
function myf_app_on_lock($mid, $uid, $key, $val) {
    global $wpdb;
    if ($key === 'myf_locked' && $val) $wpdb->query($wpdb->prepare('UPDATE ' . myf_app_table() . ' SET revoked = %s WHERE user_id = %d AND revoked IS NULL', current_time('mysql'), (int) $uid));
}
// Passwort geändert oder zurückgesetzt: vorsichtshalber alle Geräte trennen (wie „überall abmelden“)
add_action('after_password_reset', function ($user) { myf_app_on_lock(0, $user->ID, 'myf_locked', 1); });
add_action('profile_update', function ($uid, $old) { $u = get_userdata($uid); if ($u && $old && $u->user_pass !== $old->user_pass) myf_app_on_lock(0, $uid, 'myf_locked', 1); }, 10, 2);
add_action('deleted_user', function ($uid) { global $wpdb; $wpdb->delete(myf_app_table(), ['user_id' => (int) $uid]); });
