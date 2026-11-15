<?php
/**
 * Anmeldung absichern: Zwei-Faktor-Anmeldung (TOTP, RFC 6238 – Code-App wie Google/Microsoft Authenticator, 1Password),
 * Notfall-Codes, Pflicht für Verwaltungskonten (abschaltbar), zusätzliche Sperren gegen Passwort-Raten über viele
 * IP-Adressen bzw. viele Konten, App-Passwörter nur für Administratoren.
 * Notausgang: define('MYF_2FA_OFF', true); in der wp-config.php schaltet die Abfrage ab (z. B. Handy verloren, kein Notfall-Code).
 */

defined('ABSPATH') || exit;

// ---- TOTP ----------------------------------------------------------------------------------------------------
function myf_b32_enc($bin) {
    $a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; $bits = ''; $out = '';
    foreach (str_split($bin) as $c) $bits .= str_pad(decbin(ord($c)), 8, '0', STR_PAD_LEFT);
    foreach (str_split($bits, 5) as $chunk) $out .= $a[bindec(str_pad($chunk, 5, '0'))];
    return $out;
}
function myf_b32_dec($s) {
    $a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; $bits = ''; $out = '';
    foreach (str_split(strtoupper(preg_replace('/[^A-Za-z2-7]/', '', $s))) as $c) $bits .= str_pad(decbin(strpos($a, $c)), 5, '0', STR_PAD_LEFT);
    foreach (str_split($bits, 8) as $byte) if (strlen($byte) === 8) $out .= chr(bindec($byte));
    return $out;
}
function myf_totp($secret, $step) {
    $h = hash_hmac('sha1', pack('N*', 0) . pack('N*', $step), myf_b32_dec($secret), true);
    $o = ord($h[19]) & 0xf;
    $n = ((ord($h[$o]) & 0x7f) << 24) | (ord($h[$o + 1]) << 16) | (ord($h[$o + 2]) << 8) | ord($h[$o + 3]);
    return str_pad((string) ($n % 1000000), 6, '0', STR_PAD_LEFT);
}
// Code prüfen (±30 s Uhrabweichung); derselbe Code gilt nur einmal
function myf_totp_check($uid, $secret, $code) {
    $code = preg_replace('/\D/', '', (string) $code);
    if (strlen($code) !== 6) return false;
    $now = (int) floor(time() / 30); $last = (int) get_user_meta($uid, 'myf_2fa_last', true);
    for ($i = -1; $i <= 1; $i++) {
        $s = $now + $i;
        if ($s > $last && hash_equals(myf_totp($secret, $s), $code)) { update_user_meta($uid, 'myf_2fa_last', $s); return true; }
    }
    return false;
}
function myf_2fa_secret($uid) { $s = (string) get_user_meta($uid, 'myf_2fa', true); return $s === '' ? '' : myf_dec($s); }
function myf_2fa_on($uid) { return myf_2fa_secret($uid) !== ''; }
// Notfall-Codes: 8 Stück, je einmal nutzbar, nur als Hash gespeichert
function myf_2fa_recovery_new($uid) {
    $codes = []; $hashes = [];
    for ($i = 0; $i < 8; $i++) { $c = strtolower(substr(myf_b32_enc(random_bytes(6)), 0, 4) . '-' . substr(myf_b32_enc(random_bytes(6)), 0, 4)); $codes[] = $c; $hashes[] = wp_hash_password($c); }
    update_user_meta($uid, 'myf_2fa_rec', $hashes);
    return $codes;
}
function myf_2fa_recovery_use($uid, $code) {
    $code = strtolower(trim((string) $code)); $h = (array) get_user_meta($uid, 'myf_2fa_rec', true);
    foreach ($h as $k => $x) if ($x && wp_check_password($code, $x)) { unset($h[$k]); update_user_meta($uid, 'myf_2fa_rec', array_values($h)); return true; }
    return false;
}
// Pflicht? Für alle mit Verwaltungsbereichen, wenn in den Einstellungen eingeschaltet
function myf_2fa_required($user) {
    if (defined('MYF_2FA_OFF') && MYF_2FA_OFF) return false;
    if (empty(myf_settings()['sec_2fa_admin'])) return false;
    return user_can($user, 'manage_options') || ((int) $user->ID === get_current_user_id() && function_exists('myf_my_areas') && myf_my_areas());
}

// ---- Anmeldung: Code abfragen ----------------------------------------------------------------------------------
$myf_otp_field = '<p class="myf-otp"><label for="myf_otp">Bestätigungscode <span style="font-weight:400">(nur wenn Zwei-Faktor eingerichtet)</span></label>' .
    '<input type="text" name="myf_otp" id="myf_otp" class="input" inputmode="numeric" autocomplete="one-time-code" placeholder="6 Ziffern oder Notfall-Code" size="20"></p>';
add_action('login_form', function () use ($myf_otp_field) { echo $myf_otp_field; });
add_filter('login_form_middle', function ($html) use ($myf_otp_field) { return $html . $myf_otp_field; });

add_filter('authenticate', function ($user) {
    if (!($user instanceof WP_User) || (defined('MYF_2FA_OFF') && MYF_2FA_OFF)) return $user;
    if (defined('REST_REQUEST') || (defined('XMLRPC_REQUEST') && XMLRPC_REQUEST)) return $user; // App-Passwörter: siehe unten
    $sec = myf_2fa_secret($user->ID);
    if ($sec === '') return $user;
    $code = (string) ($_POST['myf_otp'] ?? '');
    if ($code === '') return new WP_Error('myf_2fa', 'Bitte zusätzlich den 6-stelligen Bestätigungscode aus der Code-App eingeben.');
    if (myf_totp_check($user->ID, $sec, $code) || myf_2fa_recovery_use($user->ID, $code)) return $user;
    do_action('wp_login_failed', $user->user_login); // zählt als Fehlversuch
    return new WP_Error('myf_2fa', 'Der Bestätigungscode stimmt nicht (Uhrzeit am Handy prüfen) – oder einen Notfall-Code verwenden.');
}, 60);

// ---- Mehr Schutz gegen Passwort-Raten: je Konto (egal von welcher IP) und je IP (egal welches Konto) ---------------
function myf_lf_bucket($k) { return 'myf_lfx_' . md5($k); }
add_action('wp_login_failed', function ($username) {
    foreach (['u|' . strtolower((string) $username), 'ip|' . ($_SERVER['REMOTE_ADDR'] ?? '')] as $k) { $b = myf_lf_bucket($k); set_transient($b, (int) get_transient($b) + 1, HOUR_IN_SECONDS); }
}, 20);
add_filter('authenticate', function ($user, $username) {
    if ($username === '' || $username === null) return $user;
    if ((int) get_transient(myf_lf_bucket('u|' . strtolower((string) $username))) >= 20)
        return new WP_Error('myf_locked', 'Dieses Konto ist wegen vieler Fehlversuche für eine Stunde gesperrt. „Passwort vergessen“ geht trotzdem.');
    if ((int) get_transient(myf_lf_bucket('ip|' . ($_SERVER['REMOTE_ADDR'] ?? ''))) >= 40)
        return new WP_Error('myf_locked', 'Zu viele Fehlversuche von diesem Anschluss. Bitte in einer Stunde erneut versuchen.');
    return $user;
}, 31, 2);

// App-Passwörter (Anmeldung an Programmen vorbei, ohne zweiten Faktor) nur für Administratoren
add_filter('wp_is_application_passwords_available_for_user', function ($ok, $user) { return $ok && user_can($user, 'manage_options'); }, 10, 2);

// ---- Einrichten im eigenen Profil -------------------------------------------------------------------------------
add_action('rest_api_init', function () {
    register_rest_route('myf/v1', '/me/2fa', ['methods' => 'POST', 'permission_callback' => 'is_user_logged_in', 'callback' => function (WP_REST_Request $req) {
        $uid = get_current_user_id(); $u = wp_get_current_user(); $do = (string) $req->get_param('do');
        // Schon eingerichtet: kein Neueinrichten an der App vorbei (sonst könnte eine fremde Sitzung den Faktor austauschen)
        if (($do === 'start' || $do === 'confirm') && myf_2fa_on($uid)) return myf_err('Zwei-Faktor ist schon eingerichtet. Für ein neues Gerät erst mit einem gültigen Code abschalten, dann neu einrichten.');
        if ($do === 'start') {
            $sec = myf_b32_enc(random_bytes(20));
            update_user_meta($uid, 'myf_2fa_pending', myf_enc($sec));
            $label = rawurlencode(myf_brand()['app'] . ':' . $u->user_login);
            return ['secret' => trim(chunk_split($sec, 4, ' ')), 'uri' => 'otpauth://totp/' . $label . '?secret=' . $sec . '&issuer=' . rawurlencode(myf_brand()['app'] . ' ' . myf_brand()['org']) . '&digits=6&period=30'];
        }
        if ($do === 'confirm') {
            $sec = myf_dec((string) get_user_meta($uid, 'myf_2fa_pending', true));
            if ($sec === '' || !myf_totp_check($uid, $sec, $req->get_param('code'))) return myf_err('Der Code stimmt nicht – bitte den aktuellen Code aus der App eingeben.');
            update_user_meta($uid, 'myf_2fa', myf_enc($sec)); delete_user_meta($uid, 'myf_2fa_pending');
            if (function_exists('myf_audit_write')) myf_audit_write('member', $uid, myf_actor(), 'sicherheit:2fa-ein', 'user', $uid, []);
            return ['ok' => true, 'recovery' => myf_2fa_recovery_new($uid)];
        }
        if ($do === 'off') {
            if (myf_2fa_required($u)) return myf_err('Für Verwaltungskonten ist die Zwei-Faktor-Anmeldung Pflicht.');
            $sec = myf_2fa_secret($uid);
            if ($sec !== '' && !myf_totp_check($uid, $sec, $req->get_param('code')) && !myf_2fa_recovery_use($uid, (string) $req->get_param('code'))) return myf_err('Zum Abschalten bitte einen gültigen Code eingeben.');
            delete_user_meta($uid, 'myf_2fa'); delete_user_meta($uid, 'myf_2fa_rec');
            if (function_exists('myf_audit_write')) myf_audit_write('member', $uid, myf_actor(), 'sicherheit:2fa-aus', 'user', $uid, []);
            return ['ok' => true];
        }
        if ($do === 'recovery') {
            if (!myf_2fa_on($uid) || !myf_totp_check($uid, myf_2fa_secret($uid), $req->get_param('code'))) return myf_err('Bitte einen gültigen Code eingeben.');
            return ['recovery' => myf_2fa_recovery_new($uid)];
        }
        return myf_err('Unbekannte Aktion.');
    }]);
});
// Status für Mitgliederbereich und Verwaltung
function myf_2fa_state() {
    $u = wp_get_current_user();
    return ['on' => myf_2fa_on($u->ID), 'required' => myf_2fa_required($u), 'left' => count(array_filter((array) get_user_meta($u->ID, 'myf_2fa_rec', true))),
        'passkey' => function_exists('myf_pk_authed') && myf_pk_authed()]; // in dieser Sitzung per Passkey (mit Gerätebestätigung) angemeldet
}
add_filter('myf_me_data', function ($data) { $data['twofa'] = myf_2fa_state(); return $data; }, 45);
add_filter('myf_admin_state', function ($d) { $d['twofa'] = myf_2fa_state(); $d['sec_2fa_admin'] = !empty(myf_settings()['sec_2fa_admin']); return $d; }, 45);

// Pflicht, aber noch nicht eingerichtet: Verwaltung nur zum Einrichten nutzbar
add_filter('rest_pre_dispatch', function ($res, $server, $req) {
    $r = $req->get_route();
    if (strpos($r, '/myf/v1/admin/') !== 0 || !is_user_logged_in()) return $res;
    $u = wp_get_current_user();
    if (myf_2fa_required($u) && !myf_2fa_on($u->ID) && !(function_exists('myf_pk_authed') && myf_pk_authed()) && $r !== '/myf/v1/admin/state')
        return new WP_Error('myf_2fa_setup', 'Bitte zuerst die Zwei-Faktor-Anmeldung einrichten (Pflicht für Verwaltungskonten).', ['status' => 403]);
    return $res;
}, 5, 3);
