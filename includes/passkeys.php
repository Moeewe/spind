<?php
/**
 * Passkeys (WebAuthn): Anmelden mit Face ID, Touch ID, Windows Hello oder Sicherheitsschlüssel – ohne Passwort.
 * Ein Passkey ist an dieses Gerät/Konto gebunden, lässt sich nicht erraten und nicht phishen (Browser prüft die Adresse).
 * Umsetzung ohne Fremdbibliothek: CBOR/COSE-Schlüssel werden hier geparst, Signaturen mit OpenSSL geprüft (ES256, RS256).
 * Passkeys gelten je WordPress-Konto (nicht je Demo-Bestand). Mit Nutzerprüfung (Fingerabdruck/Gesicht/PIN) zählt die
 * Anmeldung als Zwei-Faktor – ein Verwaltungskonto braucht dann keinen Code zusätzlich.
 */

defined('ABSPATH') || exit;

function myf_pk_table() { global $wpdb; return $wpdb->prefix . 'ffl_passkeys'; }
function myf_install_passkeys($c) {
    $t = myf_pk_table();
    dbDelta("CREATE TABLE $t (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        user_id bigint(20) unsigned NOT NULL,
        cred_id varchar(500) NOT NULL,
        public_key text NOT NULL,
        alg smallint(6) NOT NULL DEFAULT -7,
        sign_count int(10) unsigned NOT NULL DEFAULT 0,
        name varchar(80) NOT NULL DEFAULT '',
        transports varchar(120) NOT NULL DEFAULT '',
        created datetime NOT NULL,
        last_used datetime NULL,
        PRIMARY KEY  (id),
        KEY user_id (user_id),
        KEY cred (cred_id(191))
    ) $c;");
}

function myf_b64u_enc($bin) { return rtrim(strtr(base64_encode($bin), '+/', '-_'), '='); }
function myf_b64u_dec($s) { $s = strtr((string) $s, '-_', '+/'); return (string) base64_decode($s . str_repeat('=', (4 - strlen($s) % 4) % 4), true); }
// Relying-Party-ID = Hostname der Website (ohne Port); Origin = Schema + Host (+ Port)
function myf_pk_rpid() { return strtolower((string) wp_parse_url(home_url(), PHP_URL_HOST)); }
function myf_pk_origin() { $u = wp_parse_url(home_url()); return strtolower($u['scheme'] . '://' . $u['host'] . (isset($u['port']) ? ':' . $u['port'] : '')); }

// ---- CBOR (nur was WebAuthn braucht) ------------------------------------------------------------------------------
function myf_cbor_item($bin, &$pos) {
    if ($pos >= strlen($bin)) throw new Exception('CBOR: unerwartetes Ende');
    $b = ord($bin[$pos++]); $mt = $b >> 5; $ai = $b & 31; $len = $ai;
    if ($ai === 24) { $len = ord($bin[$pos++]); }
    elseif ($ai === 25) { $len = unpack('n', substr($bin, $pos, 2))[1]; $pos += 2; }
    elseif ($ai === 26) { $len = unpack('N', substr($bin, $pos, 4))[1]; $pos += 4; }
    elseif ($ai === 27) { $len = unpack('J', substr($bin, $pos, 8))[1]; $pos += 8; }
    elseif ($ai > 27) throw new Exception('CBOR: nicht unterstützt');
    switch ($mt) {
        case 0: return $len;
        case 1: return -1 - $len;
        case 2: case 3: $v = substr($bin, $pos, $len); $pos += $len; return $v;
        case 4: $a = []; for ($i = 0; $i < $len; $i++) $a[] = myf_cbor_item($bin, $pos); return $a;
        case 5: $m = []; for ($i = 0; $i < $len; $i++) { $k = myf_cbor_item($bin, $pos); $m[is_int($k) ? $k : (string) $k] = myf_cbor_item($bin, $pos); } return $m;
        case 6: return myf_cbor_item($bin, $pos); // Tag überspringen
        default: return $ai === 21 ? true : ($ai === 20 ? false : null);
    }
}
function myf_cbor($bin) { $p = 0; return myf_cbor_item($bin, $p); }

// ---- COSE-Schlüssel → PEM (für openssl_verify) -------------------------------------------------------------------
function myf_der_len($n) { if ($n < 128) return chr($n); $b = ltrim(pack('N', $n), "\0"); return chr(0x80 | strlen($b)) . $b; }
function myf_der($tag, $data) { return chr($tag) . myf_der_len(strlen($data)) . $data; }
function myf_der_int($bin) { $bin = ltrim($bin, "\0"); if ($bin === '' || ord($bin[0]) & 0x80) $bin = "\0" . $bin; return myf_der(0x02, $bin); }
function myf_cose_to_pem($k) {
    if (!is_array($k)) return [null, 0];
    $kty = $k[1] ?? 0; $alg = (int) ($k[3] ?? 0);
    if ($kty === 2 && ($k[-1] ?? 0) === 1 && isset($k[-2], $k[-3])) { // EC2, P-256
        $x = str_pad($k[-2], 32, "\0", STR_PAD_LEFT); $y = str_pad($k[-3], 32, "\0", STR_PAD_LEFT);
        $der = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200') . "\x04" . $x . $y;
        return ["-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END PUBLIC KEY-----\n", $alg ?: -7];
    }
    if ($kty === 3 && isset($k[-1], $k[-2])) { // RSA
        $rsa = myf_der(0x30, myf_der_int($k[-1]) . myf_der_int($k[-2]));
        $spki = myf_der(0x30, myf_der(0x30, hex2bin('06092a864886f70d010101') . "\x05\x00") . myf_der(0x03, "\0" . $rsa));
        return ["-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($spki), 64, "\n") . "-----END PUBLIC KEY-----\n", $alg ?: -257];
    }
    return [null, 0];
}
// authData zerlegen: rpIdHash, Flags, Zähler, ggf. Credential + Schlüssel
function myf_pk_authdata($ad) {
    if (strlen($ad) < 37) throw new Exception('Authenticator-Daten zu kurz');
    $o = ['rpIdHash' => substr($ad, 0, 32), 'flags' => ord($ad[32]), 'counter' => unpack('N', substr($ad, 33, 4))[1], 'credId' => null, 'key' => null];
    $o['up'] = (bool) ($o['flags'] & 1); $o['uv'] = (bool) ($o['flags'] & 4);
    if ($o['flags'] & 64) { // attested credential data
        $len = unpack('n', substr($ad, 53, 2))[1];
        $o['credId'] = substr($ad, 55, $len);
        $p = 55 + $len; $o['key'] = myf_cbor_item($ad, $p);
    }
    return $o;
}
function myf_pk_client($json, $type, $challenge) {
    $c = json_decode($json, true);
    if (!is_array($c) || ($c['type'] ?? '') !== $type) throw new Exception('Falscher Anfragetyp');
    if (!hash_equals($challenge, (string) ($c['challenge'] ?? ''))) throw new Exception('Anfrage abgelaufen – bitte erneut versuchen');
    if (strtolower((string) ($c['origin'] ?? '')) !== myf_pk_origin()) throw new Exception('Anmeldung von einer anderen Adresse abgelehnt');
    return $c;
}
function myf_pk_list($uid) {
    global $wpdb;
    return array_map(function ($r) { return ['id' => (int) $r->id, 'name' => $r->name, 'created' => $r->created, 'last_used' => $r->last_used]; },
        $wpdb->get_results($wpdb->prepare('SELECT id, name, created, last_used FROM ' . myf_pk_table() . ' WHERE user_id = %d ORDER BY created', $uid)));
}
// Passkey-Anmeldung mit Nutzerprüfung in dieser Sitzung? (zählt als Zwei-Faktor)
function myf_pk_authed() {
    if (!is_user_logged_in()) return false;
    $tok = wp_get_session_token(); if (!$tok) return false;
    return hash_equals((string) get_user_meta(get_current_user_id(), 'myf_pk_sess', true), hash('sha256', $tok));
}

add_action('rest_api_init', function () {
    // Eigene Passkeys: anlegen, umbenennen, entfernen (angemeldet)
    register_rest_route('myf/v1', '/me/passkey', ['methods' => 'POST', 'permission_callback' => 'is_user_logged_in', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $uid = get_current_user_id(); $u = wp_get_current_user(); $do = (string) $req->get_param('do'); $t = myf_pk_table();
        if ($do === 'options') {
            $ch = myf_b64u_enc(random_bytes(32));
            set_transient('myf_pkr_' . $uid, $ch, 5 * MINUTE_IN_SECONDS);
            $b = myf_brand();
            $excl = array_map(function ($r) { return ['type' => 'public-key', 'id' => $r->cred_id]; }, $wpdb->get_results($wpdb->prepare("SELECT cred_id FROM $t WHERE user_id = %d", $uid)));
            return ['challenge' => $ch, 'rp' => ['id' => myf_pk_rpid(), 'name' => $b['app'] . ' – ' . $b['org']],
                'user' => ['id' => myf_b64u_enc(hash('sha256', 'myf-user|' . $uid . '|' . wp_salt('auth'), true)), 'name' => $u->user_login, 'displayName' => $u->display_name ?: $u->user_login],
                'pubKeyCredParams' => [['type' => 'public-key', 'alg' => -7], ['type' => 'public-key', 'alg' => -257]],
                'authenticatorSelection' => ['residentKey' => 'preferred', 'userVerification' => 'preferred'], 'attestation' => 'none', 'timeout' => 120000, 'excludeCredentials' => $excl];
        }
        if ($do === 'register') {
            try {
                $ch = (string) get_transient('myf_pkr_' . $uid); delete_transient('myf_pkr_' . $uid);
                if ($ch === '') throw new Exception('Anfrage abgelaufen – bitte erneut versuchen');
                myf_pk_client(myf_b64u_dec($req->get_param('clientDataJSON')), 'webauthn.create', $ch);
                $att = myf_cbor(myf_b64u_dec($req->get_param('attestationObject')));
                $ad = myf_pk_authdata((string) ($att['authData'] ?? ''));
                if (!hash_equals(hash('sha256', myf_pk_rpid(), true), $ad['rpIdHash'])) throw new Exception('Passkey gehört zu einer anderen Website');
                if (!$ad['up'] || !$ad['credId']) throw new Exception('Keine Bestätigung am Gerät');
                [$pem, $alg] = myf_cose_to_pem($ad['key']);
                if (!$pem || !in_array($alg, [-7, -257], true)) throw new Exception('Schlüsseltyp wird nicht unterstützt');
                $cid = myf_b64u_enc($ad['credId']);
                if ($wpdb->get_var($wpdb->prepare("SELECT id FROM $t WHERE cred_id = %s", $cid))) throw new Exception('Dieser Passkey ist schon eingetragen');
                $name = mb_substr(sanitize_text_field((string) $req->get_param('name')), 0, 80) ?: 'Passkey';
                $tr = implode(',', array_slice(array_map('sanitize_key', (array) $req->get_param('transports')), 0, 6));
                $wpdb->insert($t, ['user_id' => $uid, 'cred_id' => $cid, 'public_key' => $pem, 'alg' => $alg, 'sign_count' => (int) $ad['counter'], 'name' => $name, 'transports' => $tr, 'created' => current_time('mysql')]);
                if (function_exists('myf_audit_write')) myf_audit_write('member', $uid, myf_actor(), 'sicherheit:passkey-neu', 'user', $uid, ['name' => $name]);
                return ['ok' => true, 'passkeys' => myf_pk_list($uid)];
            } catch (Exception $e) { return myf_err('Passkey konnte nicht angelegt werden: ' . $e->getMessage()); }
        }
        if ($do === 'delete' || $do === 'rename') {
            $id = (int) $req->get_param('id');
            if (!$wpdb->get_var($wpdb->prepare("SELECT id FROM $t WHERE id = %d AND user_id = %d", $id, $uid))) return myf_err('Nicht gefunden.', 404);
            if ($do === 'delete') { $wpdb->delete($t, ['id' => $id, 'user_id' => $uid]); if (function_exists('myf_audit_write')) myf_audit_write('member', $uid, myf_actor(), 'sicherheit:passkey-weg', 'user', $uid, ['id' => $id]); }
            else $wpdb->update($t, ['name' => mb_substr(sanitize_text_field((string) $req->get_param('name')), 0, 80) ?: 'Passkey'], ['id' => $id]);
            return ['ok' => true, 'passkeys' => myf_pk_list($uid)];
        }
        return myf_err('Unbekannte Aktion.');
    }]);
    // Anmeldung (öffentlich): erst Herausforderung holen, dann signierte Antwort einreichen
    register_rest_route('myf/v1', '/passkey/options', ['methods' => 'POST', 'permission_callback' => '__return_true', 'callback' => function () {
        $tok = bin2hex(random_bytes(16)); $ch = myf_b64u_enc(random_bytes(32));
        set_transient('myf_pka_' . $tok, $ch, 5 * MINUTE_IN_SECONDS);
        return ['token' => $tok, 'publicKey' => ['challenge' => $ch, 'rpId' => myf_pk_rpid(), 'userVerification' => 'preferred', 'timeout' => 120000, 'allowCredentials' => []]];
    }]);
    register_rest_route('myf/v1', '/passkey/login', ['methods' => 'POST', 'permission_callback' => '__return_true', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
        // Missbrauchsschutz: höchstens 30 Versuche je Anschluss und Stunde; gesperrte Anschlüsse (Fehlversuche) bleiben gesperrt
        $rk = 'myf_pk_rate_' . md5($ip); $n = (int) get_transient($rk); set_transient($rk, $n + 1, HOUR_IN_SECONDS);
        if ($n >= 30 || (function_exists('myf_lf_bucket') && (int) get_transient(myf_lf_bucket('ip|' . $ip)) >= 40)) return myf_err('Zu viele Versuche – bitte später erneut.', 429);
        try {
            $tok = preg_replace('/[^a-f0-9]/', '', (string) $req->get_param('token'));
            $ch = (string) get_transient('myf_pka_' . $tok); delete_transient('myf_pka_' . $tok);
            if ($ch === '') throw new Exception('Anfrage abgelaufen – bitte erneut versuchen');
            $cid = (string) $req->get_param('id');
            $row = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_pk_table() . ' WHERE cred_id = %s', $cid));
            if (!$row) throw new Exception('Dieser Passkey ist hier nicht (mehr) eingetragen – bitte mit Passwort anmelden und den Passkey neu einrichten');
            $cdj = myf_b64u_dec($req->get_param('clientDataJSON'));
            myf_pk_client($cdj, 'webauthn.get', $ch);
            $adRaw = myf_b64u_dec($req->get_param('authenticatorData')); $ad = myf_pk_authdata($adRaw);
            if (!hash_equals(hash('sha256', myf_pk_rpid(), true), $ad['rpIdHash']) || !$ad['up']) throw new Exception('Antwort passt nicht zu dieser Website');
            $sig = myf_b64u_dec($req->get_param('signature'));
            $ok = openssl_verify($adRaw . hash('sha256', $cdj, true), $sig, $row->public_key, OPENSSL_ALGO_SHA256);
            if ($ok !== 1) { do_action('wp_login_failed', 'passkey'); throw new Exception('Signatur ungültig'); }
            if ((int) $row->sign_count > 0 && (int) $ad['counter'] > 0 && (int) $ad['counter'] <= (int) $row->sign_count) throw new Exception('Passkey-Zähler stimmt nicht (geklonter Schlüssel?) – bitte den Passkey neu einrichten');
            $user = get_user_by('id', (int) $row->user_id);
            if (!$user) throw new Exception('Konto nicht gefunden');
            $wpdb->update(myf_pk_table(), ['sign_count' => (int) $ad['counter'], 'last_used' => current_time('mysql')], ['id' => $row->id]);
            wp_set_current_user($user->ID);
            // Sitzung selbst anlegen, damit wir das Token kennen (steht in diesem Request noch nicht im Cookie)
            $sess = WP_Session_Tokens::get_instance($user->ID)->create(time() + 14 * DAY_IN_SECONDS);
            wp_set_auth_cookie($user->ID, true, is_ssl(), $sess);
            // Mit Nutzerprüfung (Fingerabdruck/Gesicht/PIN) zählt die Anmeldung als Zwei-Faktor
            if ($ad['uv']) update_user_meta($user->ID, 'myf_pk_sess', hash('sha256', $sess));
            do_action('wp_login', $user->user_login, $user);
            if (function_exists('myf_audit_write')) myf_audit_write('member', $user->ID, $user->display_name, 'sicherheit:passkey-login', 'user', $user->ID, ['uv' => $ad['uv']]);
            $to = (string) $req->get_param('redirect');
            $home = wp_parse_url(home_url(), PHP_URL_HOST);
            if ($to === '' || wp_parse_url($to, PHP_URL_HOST) !== $home) $to = function_exists('myf_member_page_url') ? myf_member_page_url() : home_url('/');
            return ['ok' => true, 'redirect' => $to];
        } catch (Exception $e) { return myf_err($e->getMessage(), 403); }
    }]);
});

// Liste im eigenen Profil (Mitgliederbereich und Verwaltung)
add_filter('myf_me_data', function ($data) { $data['passkeys'] = myf_pk_list(get_current_user_id()); return $data; }, 46);
add_filter('myf_admin_state', function ($d) { $d['passkeys'] = myf_pk_list(get_current_user_id()); return $d; }, 46);

// Anmeldeseite (Mitgliederbereich und wp-login.php): Knopf „Mit Passkey anmelden“ + Autofill-Vorschlag
function myf_pk_login_html() {
    static $done = false; if ($done) return ''; $done = true;
    $cfg = ['api' => esc_url_raw(rest_url('myf/v1/')), 'redirect' => function_exists('myf_login_target') && !is_admin() ? myf_login_target() : admin_url()];
    return '<div id="myf-pk-login" class="myf-pk"></div><script>window.MYFPK=' . wp_json_encode($cfg) . ';</script><script src="' . esc_url(MYF_URL . 'assets/passkey.js?v=' . MYF_ASSET_VER) . '"></script>';
}
add_filter('login_form_middle', function ($html) { return $html . myf_pk_login_html(); }, 20);
add_action('login_form', function () { echo myf_pk_login_html(); }, 20);
add_action('login_enqueue_scripts', function () { echo '<style>.myf-pk{margin:14px 0 4px}.myf-pk-btn{width:100%;min-height:44px;border:1px solid #111;background:#fff;color:#111;font-weight:700;font-size:15px;cursor:pointer;border-radius:2px}.myf-pk-msg{font-size:13px;color:#8a1c1c;margin-top:6px}</style>'; });
// Passkey-Verwaltung im Profil braucht das Skript ebenfalls
add_action('wp_enqueue_scripts', function () { if (function_exists('myf_is_portal_page') && myf_is_portal_page() && is_user_logged_in()) wp_enqueue_script('myf-passkey', MYF_URL . 'assets/passkey.js', [], MYF_ASSET_VER, true); });
add_action('admin_enqueue_scripts', function () { if (($_GET['page'] ?? '') === 'myf') wp_enqueue_script('myf-passkey', MYF_URL . 'assets/passkey.js', [], MYF_ASSET_VER, true); });
