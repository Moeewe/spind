<?php
/**
 * Schutz sensibler Daten: interne Einsatzberichte und Alarmtexte verschlüsselt speichern (Schlüssel liegt in der
 * wp-config.php, nicht in der Datenbank), Berichte nur auf Abruf laden (mit Protokolleintrag), vertrauliche Felder
 * nach einer Frist automatisch leeren. Dazu Härtung: Anmeldeversuche begrenzen, keine Benutzer-Auflistung,
 * Sicherheits-Header, Sicherheits-Check für Administratoren.
 */

defined('ABSPATH') || exit;

// ---- Verschlüsselung (libsodium, in WordPress immer verfügbar) ----------------------------
function myf_crypt_key() {
    // Eigener Schlüssel in der wp-config.php: define('MYF_DATA_KEY', '…'); sonst aus den WordPress-Schlüsseln abgeleitet
    $base = defined('MYF_DATA_KEY') && MYF_DATA_KEY ? (string) MYF_DATA_KEY : wp_salt('auth') . wp_salt('secure_auth');
    return hash('sha256', 'wehrwerk-daten|' . $base, true);
}
function myf_enc($plain) {
    $plain = (string) $plain;
    if ($plain === '' || strpos($plain, 'enc1:') === 0) return $plain;
    $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
    return 'enc1:' . base64_encode($nonce . sodium_crypto_secretbox($plain, $nonce, myf_crypt_key()));
}
function myf_dec($stored) {
    $stored = (string) $stored;
    if (strpos($stored, 'enc1:') !== 0) return $stored; // ältere, noch unverschlüsselte Einträge
    $raw = base64_decode(substr($stored, 5), true);
    if ($raw === false || strlen($raw) <= SODIUM_CRYPTO_SECRETBOX_NONCEBYTES) return '';
    $p = sodium_crypto_secretbox_open(substr($raw, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES), substr($raw, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES), myf_crypt_key());
    return $p === false ? '' : $p;
}

// Vorhandene Berichte/Alarmtexte einmalig verschlüsseln
function myf_install_security() {
    global $wpdb;
    if (get_option('myf_enc_done')) return;
    foreach ($wpdb->get_results('SELECT id, report, alarm_text FROM ' . myf_t('incidents') . " WHERE (report IS NOT NULL AND report <> '' AND report NOT LIKE 'enc1:%') OR (alarm_text IS NOT NULL AND alarm_text <> '' AND alarm_text NOT LIKE 'enc1:%')") as $r) {
        $wpdb->update(myf_t('incidents'), ['report' => $r->report ? myf_enc($r->report) : $r->report, 'alarm_text' => $r->alarm_text ? myf_enc($r->alarm_text) : $r->alarm_text], ['id' => $r->id]);
    }
    update_option('myf_enc_done', 1);
}

// Bericht eines Einsatzes lesen (entschlüsselt)
function myf_report_get($incidentId) {
    global $wpdb;
    $raw = $wpdb->get_var($wpdb->prepare('SELECT report FROM ' . myf_t('incidents') . ' WHERE id = %d', $incidentId));
    return json_decode(myf_dec($raw), true) ?: [];
}

// Abruf eines Berichts: nur Einsatzführung/Verwaltung, jeder Abruf landet im Protokoll
add_action('rest_api_init', function () {
    $get = function (WP_REST_Request $req) {
        global $wpdb;
        $id = (int) $req->get_param('id');
        $i = $wpdb->get_row($wpdb->prepare('SELECT id, title, nr FROM ' . myf_t('incidents') . ' WHERE id = %d', $id));
        if (!$i) return myf_err('Einsatz nicht gefunden.', 404);
        $u = wp_get_current_user();
        $me = myf_me();
        myf_audit_write($me ? 'member' : 'admin', $me ? (int) $me->id : (int) $u->ID, $me ? $me->name : ($u->display_name ?: $u->user_login), 'view:incident/report', 'incidents', $id,
            ['params' => ['zweck' => $req->get_param('print') ? 'Ausdruck' : 'Ansicht']]);
        $vals = myf_report_get($id);
        return ['id' => $id, 'report' => (object) $vals, 'form' => myf_report_form_for($vals), 'labels' => (object) myf_report_labels(), 'suggest' => (object) ($req->get_param('print') ? [] : myf_report_suggest($id, $vals, myf_report_form())), 'form_current' => empty($vals['_form']) || $vals['_form'] === myf_report_form_ver(myf_report_form())];
    };
    register_rest_route('myf/v1', '/me/incident/report', ['methods' => 'GET', 'permission_callback' => 'myf_report_perm', 'callback' => $get]);
    register_rest_route('myf/v1', '/admin/incident/report', ['methods' => 'GET', 'permission_callback' => 'myf_route_perm', 'callback' => $get]);
});

// Aufbewahrung: nichts wird automatisch gelöscht. Nach der Prüffrist (Jahre) legt SPIND die Berichte zur Prüfung vor;
// die Einsatzführung entscheidet je Bericht: weiter aufbewahren (bis, mit Grund) oder Personenangaben schwärzen.
function myf_report_review_years() { return max(1, min(30, (int) (myf_settings()['report_review'] ?? 10))); }
function myf_sensitive_fields() {
    $o = [];
    foreach (myf_report_form() as $sec) foreach ($sec['fields'] as $f) if (!empty($f['sensitive'])) $o[$f['id']] = $f['label'];
    return $o;
}
function myf_review_due() {
    global $wpdb;
    $before = date('Y-m-d', strtotime(current_time('Y-m-d') . ' -' . myf_report_review_years() . ' years'));
    $sens = myf_sensitive_fields();
    $out = [];
    foreach ($wpdb->get_results($wpdb->prepare('SELECT id, nr, title, start, report, alarm_text, retain_until, retain_reason FROM ' . myf_t('incidents') .
        " WHERE start < %s AND redacted_at IS NULL AND (retain_until IS NULL OR retain_until < %s) AND ((report IS NOT NULL AND report <> '') OR (alarm_text IS NOT NULL AND alarm_text <> '')) ORDER BY start", $before, current_time('Y-m-d'))) as $r) {
        $rep = json_decode(myf_dec($r->report), true) ?: [];
        $filled = array_values(array_intersect_key($sens, array_filter($rep, function ($v) { return $v !== '' && $v !== []; })));
        if (!$filled && !$r->alarm_text) continue;
        $out[] = ['id' => (int) $r->id, 'nr' => $r->nr, 'title' => $r->title, 'start' => $r->start, 'fields' => $filled, 'alarm_text' => (bool) $r->alarm_text,
            'retain_until' => $r->retain_until, 'retain_reason' => $r->retain_reason];
    }
    return $out;
}
// Monatlich (am 1.): Administratoren bekommen ins Postfach, was im Sicherheits-Check rot ist (Updates, 2FA-Pflicht, Backup, Aufbewahrung …)
add_action('myf_daily_more', function ($today) {
    global $wpdb;
    if (substr($today, 8, 2) !== '01') return;
    wp_update_plugins(); wp_version_check();
    $bad = array_filter(myf_security_check(), function ($c) { return !$c['ok'] && strpos($c['title'], 'dein Konto') === false; });
    if (!$bad) return;
    $ids = [];
    foreach ($wpdb->get_results('SELECT id, user_id FROM ' . myf_t('members') . ' WHERE active = 1 AND user_id IS NOT NULL') as $m)
        if (($u = get_userdata((int) $m->user_id)) && user_can($u, 'manage_options')) $ids[] = (int) $m->id;
    if ($ids) myf_notify($ids, 'reminder', count($bad) . ' Punkte im Sicherheits-Check offen', implode(' · ', array_map(function ($c) { return $c['title']; }, array_slice(array_values($bad), 0, 6))), 'admin:security', 'seccheck:' . substr($today, 0, 7));
});
// Mitglieder sehen im Profil, wie lange persönliche Angaben in Berichten bleiben (nichts wird stillschweigend gelöscht)
add_filter('myf_me_data', function ($data) { $data['review_years'] = myf_report_review_years(); return $data; }, 36);
// Einmal im Monat: Hinweis an die Einsatzführung, wenn Berichte zur Prüfung anstehen
add_action('myf_daily_more', function ($today) {
    if (substr($today, 8, 2) !== '01') return;
    $n = count(myf_review_due());
    if ($n) myf_notify(myf_area_members('incidents'), 'reminder', $n . ' Einsatzberichte zur Prüfung (Aufbewahrung)', 'Weiter aufbewahren oder Personenangaben schwärzen – nichts wird automatisch gelöscht.', 'admin:archive', 'review:' . substr($today, 0, 7));
});
add_action('rest_api_init', function () {
    register_rest_route('myf/v1', '/admin/incident/retention', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $ids = array_filter(array_map('intval', (array) ($req->get_param('ids') ?: [$req->get_param('id')])));
        $reason = mb_substr(sanitize_text_field((string) $req->get_param('reason')), 0, 160);
        if (!$ids) return myf_err('Keine Berichte ausgewählt.');
        if ($req->get_param('action') === 'keep') {
            $until = myf_date_or_null($req->get_param('until'));
            if (!$until || $until <= current_time('Y-m-d')) return myf_err('Bitte ein Datum in der Zukunft angeben.');
            if ($reason === '') return myf_err('Bitte kurz begründen, warum weiter aufbewahrt wird (z. B. Kostenersatz offen).');
            foreach ($ids as $id) $wpdb->update(myf_t('incidents'), ['retain_until' => $until, 'retain_reason' => $reason], ['id' => $id]);
            return ['ok' => true, 'count' => count($ids)];
        }
        if ($req->get_param('action') === 'redact') {
            $sens = array_keys(myf_sensitive_fields());
            foreach ($ids as $id) {
                $rep = myf_report_get($id);
                foreach ($sens as $k) if (isset($rep[$k])) $rep[$k] = is_array($rep[$k]) ? [] : '';
                $wpdb->update(myf_t('incidents'), ['report' => $rep ? myf_enc(wp_json_encode($rep)) : null, 'alarm_text' => null, 'redacted_at' => current_time('mysql'),
                    'redacted_by' => myf_actor(), 'retain_reason' => $reason], ['id' => $id]);
            }
            return ['ok' => true, 'count' => count($ids)];
        }
        return myf_err('Unbekannte Aktion.');
    }]);
});

// ---- Anmeldeversuche begrenzen: 6 Fehlversuche je Konto/IP in 15 Minuten → 15 Minuten Pause --------------------
function myf_login_key($user) { return 'myf_lf_' . md5(strtolower((string) $user) . '|' . ($_SERVER['REMOTE_ADDR'] ?? '')); }
add_filter('authenticate', function ($user, $username) {
    if ($username !== '' && $username !== null && (int) get_transient(myf_login_key($username)) >= 6)
        return new WP_Error('myf_locked', 'Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen oder „Passwort vergessen“ nutzen.');
    return $user;
}, 30, 2);
add_action('wp_login_failed', function ($username) {
    $k = myf_login_key($username);
    set_transient($k, (int) get_transient($k) + 1, 15 * MINUTE_IN_SECONDS);
});
add_action('wp_login', function ($login) { delete_transient(myf_login_key($login)); });

// ---- Keine Auflistung der Benutzer (Benutzernamen sind die halbe Anmeldung) ----------------------------------
add_filter('rest_endpoints', function ($e) {
    if (is_user_logged_in() || empty(myf_settings()['sec_hide_users'] ?? true)) return $e;
    foreach (array_keys($e) as $r) if (preg_match('#^/wp/v2/users#', $r)) unset($e[$r]);
    return $e;
});
add_action('template_redirect', function () {
    if (!is_user_logged_in() && isset($_GET['author']) && !empty(myf_settings()['sec_hide_users'] ?? true)) { wp_safe_redirect(home_url('/'), 301); exit; }
});
// XML-RPC: alte Schnittstelle, beliebt für Passwort-Raten – abschaltbar
add_filter('xmlrpc_enabled', function ($on) { return empty(myf_settings()['sec_xmlrpc_off'] ?? true) ? $on : false; });

// ---- Sicherheits-Header auf allen SPIND-Seiten und -Antworten ----------------------------------------------
function myf_sec_headers() {
    if (headers_sent()) return;
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: SAMEORIGIN');
    header('Referrer-Policy: same-origin');
    header('Permissions-Policy: geolocation=(), microphone=(), camera=(self)');
}
add_action('template_redirect', function () {
    if (isset($_GET['myf_screen']) || (function_exists('myf_is_private_page') && myf_is_private_page())) myf_sec_headers();
}, 1);
add_filter('rest_post_dispatch', function ($res, $server, $req) {
    if (strpos($req->get_route(), '/myf/v1') === 0 && $res instanceof WP_HTTP_Response) {
        $res->header('X-Content-Type-Options', 'nosniff');
        $res->header('Cache-Control', 'no-store, private');
    }
    return $res;
}, 11, 3);

// ---- Sicherheits-Check (nur Administratoren) ----------------------------------------------------------------
function myf_security_check() {
    global $wpdb;
    $c = [];
    $add = function ($ok, $title, $fix) use (&$c) { $c[] = ['ok' => (bool) $ok, 'title' => $title, 'fix' => $fix]; };
    $add(is_ssl() || strpos(home_url(), 'https://') === 0, 'Verbindung verschlüsselt (https)', 'Beim Hoster ein SSL-Zertifikat (z. B. Let’s Encrypt) aktivieren und die Website-Adresse auf https umstellen.');
    $add(defined('AUTH_KEY') && AUTH_KEY && strpos(AUTH_KEY, 'put your unique') === false, 'Geheime Schlüssel in der wp-config.php', 'Neue Schlüssel unter https://api.wordpress.org/secret-key/1.1/salt/ erzeugen und in die wp-config.php eintragen.');
    $add(defined('MYF_DATA_KEY'), 'Eigener SPIND-Datenschlüssel', 'Optional, aber empfohlen: in der wp-config.php define(\'MYF_DATA_KEY\', \'…langer Zufallstext…\'); – vor dem Eintragen eine Sicherung machen. Berichte werden schon jetzt verschlüsselt (mit den WordPress-Schlüsseln).');
    $add(defined('DISALLOW_FILE_EDIT') && DISALLOW_FILE_EDIT, 'Datei-Editor im WordPress-Menü aus', 'In der wp-config.php: define(\'DISALLOW_FILE_EDIT\', true);');
    $add(!(defined('WP_DEBUG_DISPLAY') ? WP_DEBUG_DISPLAY : (defined('WP_DEBUG') && WP_DEBUG)), 'Keine Fehlermeldungen auf der Website', 'In der wp-config.php WP_DEBUG auf false setzen.');
    $twofa = false;
    foreach ((array) get_option('active_plugins', []) as $p) if (preg_match('#two-factor|wp-2fa|wordfence|two-factor-authentication|miniorange-2-factor|google-authenticator#i', $p)) $twofa = true;
    $add($twofa, 'Zwei-Faktor-Anmeldung für Administratoren', 'Plugin „Two Factor“ (vom WordPress-Team) installieren und für alle Administratoren und die Einsatzführung einschalten.');
    $add(!get_user_by('login', 'admin'), 'Kein Konto mit dem Namen „admin“', 'Ein neues Administratorkonto mit eigenem Namen anlegen und „admin“ löschen (Inhalte übertragen).');
    $admins = count(get_users(['role' => 'administrator', 'fields' => 'ID']));
    $add($admins <= 3, 'Wenige Administratoren (' . $admins . ')', 'Nur so viele Administratoren wie nötig – Unter-Admins bekommen in SPIND nur ihren Bereich.');
    $core = get_site_transient('update_core');
    $upd = $core && !empty($core->updates) && ($core->updates[0]->response ?? '') === 'upgrade';
    $add(!$upd, 'WordPress aktuell', 'WordPress unter „Dashboard → Aktualisierungen“ auf den neuesten Stand bringen (vorher sichern).');
    $plugins = get_site_transient('update_plugins');
    $n = $plugins && !empty($plugins->response) ? count($plugins->response) : 0;
    $add($n === 0, $n ? $n . ' Plugins mit Aktualisierung' : 'Plugins aktuell', 'Plugins aktualisieren – veraltete Plugins sind der häufigste Einfallsweg.');
    $add(!empty(myf_settings()['sec_hide_users'] ?? true), 'Benutzernamen nicht öffentlich abrufbar', 'In SPIND eingeschaltet lassen.');
    $add(!empty(myf_settings()['sec_xmlrpc_off'] ?? true), 'XML-RPC (Passwort-Raten) abgeschaltet', 'Einschalten, wenn keine App/kein Dienst XML-RPC braucht.');
    $add((function_exists('myf_2fa_on') && myf_2fa_on(get_current_user_id())) || (function_exists('myf_pk_authed') && myf_pk_authed()), 'Zwei-Faktor-Anmeldung für dein Konto (Code-App oder Passkey)', 'Oben bei deinem Namen → „Anmeldung absichern“ einrichten (Code-App am Handy).');
    $add(!empty(myf_settings()['sec_2fa_admin']), 'Zwei-Faktor Pflicht für Verwaltungskonten', 'Einschalten, sobald alle Verwalter sie eingerichtet haben.');
    $add(function_exists('myf_bk_key') && myf_bk_key(), 'Verschlüsselte Datensicherung eingerichtet', 'Unter „Daten & Schnittstellen → Datensicherung“ ein Sicherungskennwort festlegen und den Abruf im Gerätehaus einrichten.');
    $add(is_ssl(), 'Verschlüsselte Verbindung (HTTPS)', 'Beim Hoster ein SSL-Zertifikat (Let’s Encrypt) aktivieren.');
    $add(count(myf_review_due()) === 0, 'Aufbewahrung der Einsatzberichte geprüft', 'Unter „Einsätze → Aufbewahrung“ stehen Berichte zur Prüfung (weiter aufbewahren oder Personenangaben schwärzen).');
    return $c;
}
add_filter('myf_admin_state', function ($d) {
    if (current_user_can('manage_options')) $d['security'] = ['checks' => myf_security_check(), 'hide_users' => !empty(myf_settings()['sec_hide_users'] ?? true), 'xmlrpc_off' => !empty(myf_settings()['sec_xmlrpc_off'] ?? true), 'twofa_admin' => !empty(myf_settings()['sec_2fa_admin'])];
    if (function_exists('myf_has_area') && myf_has_area('incidents')) { $d['report_review'] = myf_report_review_years(); $d['review_due'] = myf_review_due(); }
    return $d;
}, 40);
