<?php
/**
 * E-Mail-Versand: Alle WordPress-Mails (Wehrwerk, Passwort-Links, Kontaktformular) gehen auf Wunsch über ein echtes
 * Postfach per SMTP statt über den Webserver. So gelten sie beim Empfänger als berechtigt (SPF) und landen nicht im Spam.
 * Das Passwort liegt verschlüsselt in einer eigenen Option (nicht in den Einstellungen und damit nicht in Export und
 * Sicherung), wird nie angezeigt und nie protokolliert. Einstellen dürfen nur Administratoren.
 */

defined('ABSPATH') || exit;

const MYF_SMTP_OPTION = 'myf_smtp';

function myf_smtp() {
    $o = get_option(MYF_SMTP_OPTION, []); $o = is_array($o) ? $o : [];
    return wp_parse_args($o, ['on' => false, 'host' => '', 'port' => 465, 'secure' => 'ssl', 'user' => '', 'pass' => '', 'from' => '', 'name' => '', 'tested' => '', 'tested_ok' => false]);
}
// Für die Verwaltung: alles außer dem Passwort
function myf_smtp_out() {
    $o = myf_smtp(); $set = (string) $o['pass'] !== ''; unset($o['pass']);
    return $o + ['pass_set' => $set, 'can_send' => myf_smtp_ready()];
}
function myf_smtp_ready() {
    $o = myf_smtp();
    return !empty($o['on']) && $o['host'] !== '' && $o['user'] !== '' && $o['pass'] !== '' && is_email($o['from']);
}

// Versand über das Postfach. Der Absender muss das Postfach sein (sonst lehnt der Mailserver ab bzw. SPF passt nicht);
// wer eigentlich schreibt (z. B. Kontaktformular), bleibt als Antwort-Adresse erhalten.
add_action('phpmailer_init', function ($m) {
    if (!myf_smtp_ready()) return;
    $o = myf_smtp();
    $orig = (string) $m->From;
    $m->isSMTP();
    $m->Host = $o['host']; $m->Port = (int) $o['port']; $m->SMTPSecure = $o['secure'] === 'tls' ? 'tls' : 'ssl'; $m->SMTPAutoTLS = true;
    $m->SMTPAuth = true; $m->Username = $o['user']; $m->Password = myf_dec($o['pass']); $m->Timeout = 15; $m->SMTPDebug = 0;
    $name = trim((string) $o['name']) !== '' ? $o['name'] : myf_brand()['org'];
    if ($orig !== '' && strcasecmp($orig, $o['from']) !== 0 && strpos($orig, 'wordpress@') !== 0 && is_email($orig) && !$m->getReplyToAddresses()) $m->addReplyTo($orig, (string) $m->FromName);
    $m->setFrom($o['from'], $name, false);
    $m->Sender = $o['from'];
}, 99);

add_action('rest_api_init', function () {
    $admin = function () { return current_user_can('manage_options') && !(function_exists('myf_demo_ctx') && myf_demo_ctx()); };
    register_rest_route('myf/v1', '/admin/smtp', ['methods' => 'POST', 'permission_callback' => $admin, 'callback' => function (WP_REST_Request $req) {
        $o = myf_smtp();
        $host = strtolower(trim(sanitize_text_field((string) $req->get_param('host'))));
        if ($host !== '' && !preg_match('/^[a-z0-9.-]+$/', $host)) return myf_err('Bitte nur den Servernamen angeben, z. B. smtps.udag.de.');
        $port = (int) $req->get_param('port');
        if (!in_array($port, [465, 587, 2525], true)) return myf_err('Bitte Port 465 (SSL) oder 587 (STARTTLS) verwenden.');
        // Unverschlüsselt gibt es nicht: das Passwort ginge sonst im Klartext über das Netz
        $secure = $req->get_param('secure') === 'tls' ? 'tls' : 'ssl';
        $from = sanitize_email((string) $req->get_param('from'));
        if ((string) $req->get_param('from') !== '' && !is_email($from)) return myf_err('Die Absender-Adresse ist ungültig.');
        $on = (bool) $req->get_param('on');
        $new = ['on' => $on, 'host' => $host, 'port' => $port, 'secure' => $secure, 'user' => mb_substr(sanitize_text_field((string) $req->get_param('user')), 0, 190),
            'from' => $from, 'name' => mb_substr(sanitize_text_field((string) $req->get_param('name')), 0, 120)];
        // Passwort: leer = bleibt; ausdrücklich löschen nur mit pass_clear. Nicht bereinigen – Sonderzeichen gehören dazu.
        $pw = (string) $req->get_param('pass');
        $new['pass'] = $req->get_param('pass_clear') ? '' : ($pw !== '' ? myf_enc($pw) : $o['pass']);
        if ($on && ($new['host'] === '' || $new['user'] === '' || $new['pass'] === '' || $new['from'] === '')) return myf_err('Zum Einschalten bitte Server, Benutzername, Passwort und Absender-Adresse eintragen.');
        $changed = false;
        foreach (['on', 'host', 'port', 'secure', 'user', 'from', 'pass'] as $k) if ($new[$k] != $o[$k]) $changed = true;
        $new['tested'] = $changed ? '' : $o['tested']; $new['tested_ok'] = $changed ? false : $o['tested_ok'];
        update_option(MYF_SMTP_OPTION, $new, false);
        if (function_exists('myf_audit_write')) myf_audit_write('admin', get_current_user_id(), myf_actor(), 'einstellung:smtp', 'settings', 0, ['on' => $on, 'host' => $host, 'port' => $port, 'secure' => $secure, 'from' => $from, 'pass_changed' => $pw !== '' || (bool) $req->get_param('pass_clear')]);
        return ['ok' => true, 'smtp' => myf_smtp_out()];
    }]);
    // Testmail an die angegebene oder die eigene Adresse – zeigt die Antwort des Mailservers
    register_rest_route('myf/v1', '/admin/smtp/test', ['methods' => 'POST', 'permission_callback' => $admin, 'callback' => function (WP_REST_Request $req) {
        $to = sanitize_email((string) $req->get_param('to')) ?: (string) wp_get_current_user()->user_email;
        if (!is_email($to)) return myf_err('Bitte eine gültige Empfänger-Adresse angeben.');
        $error = '';
        $catch = function ($e) use (&$error) { $error = $e->get_error_message(); };
        add_action('wp_mail_failed', $catch);
        $b = myf_brand();
        $sent = wp_mail($to, '[' . $b['app'] . '] Testmail', "Diese Testmail kam aus der Verwaltung von " . $b['app'] . ".\n\nWenn sie hier ankommt, funktioniert der E-Mail-Versand.\n\nVersandweg: " . (myf_smtp_ready() ? 'Postfach per SMTP' : 'Webserver (ohne SMTP)'));
        remove_action('wp_mail_failed', $catch);
        $o = get_option(MYF_SMTP_OPTION, []); $o = is_array($o) ? $o : [];
        $o['tested'] = current_time('mysql'); $o['tested_ok'] = (bool) $sent;
        update_option(MYF_SMTP_OPTION, $o, false);
        if (function_exists('myf_audit_write')) myf_audit_write('admin', get_current_user_id(), myf_actor(), 'einstellung:smtp-test', 'settings', 0, ['ok' => (bool) $sent]);
        $via = myf_smtp_ready() ? 'smtp' : 'webserver';
        if (!$sent) return ['ok' => false, 'via' => $via, 'error' => $error !== '' ? $error : 'Der Versand ist fehlgeschlagen (keine genauere Meldung).'];
        return ['ok' => true, 'via' => $via, 'to' => $to];
    }]);
});

add_filter('myf_admin_state', function ($d) { if (current_user_can('manage_options')) $d['smtp'] = myf_smtp_out(); return $d; }, 61);
