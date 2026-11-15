<?php
/**
 * Datensicherung: jede Nacht ein Archiv in der Datenbank (14 Tage + wöchentlich 12 Wochen) und eine VERSCHLÜSSELTE
 * Sicherungsdatei. Die Datei holt ein Rechner im Gerätehaus (Feuerwehr-Server, NAS) über einen geheimen Link ab –
 * so liegt immer eine Kopie außerhalb des Webservers. Verschlüsselt mit einem Sicherungskennwort (libsodium,
 * Argon2id + XSalsa20-Poly1305): ohne Kennwort ist die Datei wertlos, auch wenn Link oder Datei in falsche Hände geraten.
 */

defined('ABSPATH') || exit;

const MYF_BK_MAGIC = 'WWBK1'; // Argon2id
const MYF_BK_MAGIC2 = 'WWBK2'; // PBKDF2-SHA256 (Rückfall, wenn der Server kein Argon2 hat)

// Schlüssel aus Kennwort + Salz: Argon2id, sonst PBKDF2 mit 200 000 Runden – das Verfahren steht in der Datei
function myf_bk_kdf($pass, $salt, $type) {
    if ($type === MYF_BK_MAGIC) return sodium_crypto_pwhash(SODIUM_CRYPTO_SECRETBOX_KEYBYTES, $pass, $salt, SODIUM_CRYPTO_PWHASH_OPSLIMIT_INTERACTIVE, SODIUM_CRYPTO_PWHASH_MEMLIMIT_INTERACTIVE, SODIUM_CRYPTO_PWHASH_ALG_ARGON2ID13);
    return hash_pbkdf2('sha256', $pass, $salt, 200000, SODIUM_CRYPTO_SECRETBOX_KEYBYTES, true);
}
function myf_bk_kdf_best() {
    try { if (function_exists('sodium_crypto_pwhash') && defined('SODIUM_CRYPTO_PWHASH_ALG_ARGON2ID13')) { sodium_crypto_pwhash(32, 'x', str_repeat("\0", 16), SODIUM_CRYPTO_PWHASH_OPSLIMIT_INTERACTIVE, SODIUM_CRYPTO_PWHASH_MEMLIMIT_INTERACTIVE, SODIUM_CRYPTO_PWHASH_ALG_ARGON2ID13); return MYF_BK_MAGIC; } } catch (\Throwable $e) {}
    return MYF_BK_MAGIC2;
}

// Aufbewahrung und Speichergrenze (einstellbar unter Daten & Schnittstellen → Datensicherung)
function myf_bk_conf() {
    $o = myf_bk_opts(); $c = (array) ($o['conf'] ?? []);
    return ['keep_daily' => max(3, min(60, (int) ($c['keep_daily'] ?? 14))), 'keep_weekly' => max(0, min(104, (int) ($c['keep_weekly'] ?? 12))),
        'keep_files' => max(3, min(120, (int) ($c['keep_files'] ?? 14))), 'max_mb' => max(20, min(20000, (int) ($c['max_mb'] ?? 500)))];
}
// Speicher belegt: Archive in der Datenbank und Sicherungsdateien
function myf_bk_usage() {
    global $wpdb;
    $tb = myf_t('archive'); $db = 0; $n = 0;
    if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $tb))) { $r = $wpdb->get_row("SELECT COUNT(*) AS n, COALESCE(SUM(LENGTH(data)), 0) AS b FROM `$tb`"); $db = (int) $r->b; $n = (int) $r->n; }
    $files = 0; foreach (glob(myf_bk_dir() . '/*.wwbk') ?: [] as $f) $files += (int) @filesize($f);
    return ['db' => $db, 'files' => $files, 'archives' => $n];
}
// Aufräumen nach den Einstellungen: tägliche + wöchentliche automatische Archive, Dateien, dann die Speichergrenze.
// Archive von Hand und „Vor dem …“-Archive löscht nur ein Mensch; die drei neuesten automatischen bleiben immer.
function myf_bk_prune() {
    global $wpdb;
    $c = myf_bk_conf(); $tb = myf_t('archive');
    if (!$wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $tb))) return;
    $auto = $wpdb->get_results($wpdb->prepare("SELECT id, created FROM `$tb` WHERE label = %s ORDER BY created DESC", 'Automatische Sicherung'));
    foreach ($auto as $k => $a) {
        $age = (current_time('timestamp') - strtotime($a->created)) / DAY_IN_SECONDS;
        $weekly = (int) date('w', strtotime($a->created)) === 0 && $age <= $c['keep_weekly'] * 7;
        if ($k >= $c['keep_daily'] && !$weekly) $wpdb->delete($tb, ['id' => (int) $a->id]);
    }
    $files = glob(myf_bk_dir() . '/*.wwbk') ?: []; rsort($files);
    foreach (array_slice($files, $c['keep_files']) as $f) @unlink($f);
    // Speichergrenze: älteste automatische Archive zuerst
    $max = $c['max_mb'] * MB_IN_BYTES;
    $u = myf_bk_usage();
    if ($u['db'] + $u['files'] > $max) {
        $left = $wpdb->get_results($wpdb->prepare("SELECT id, LENGTH(data) AS b FROM `$tb` WHERE label = %s ORDER BY created DESC", 'Automatische Sicherung'));
        $total = $u['db'] + $u['files'];
        foreach (array_reverse(array_slice($left, 3)) as $a) { if ($total <= $max) break; $wpdb->delete($tb, ['id' => (int) $a->id]); $total -= (int) $a->b; }
        $files = glob(myf_bk_dir() . '/*.wwbk') ?: []; rsort($files);
        foreach (array_reverse(array_slice($files, 3)) as $f) { if ($total <= $max) break; $total -= (int) @filesize($f); @unlink($f); }
    }
}
function myf_bk_opts() { $o = get_option('myf_backup', []); return is_array($o) ? $o : []; }
function myf_bk_save($o) { update_option('myf_backup', $o, false); }

// Ablage der Sicherungsdateien: eigener Ordner (MYF_BACKUP_DIR in der wp-config.php, am besten außerhalb des Webroots),
// sonst ein gesperrter Ordner im Upload-Bereich
function myf_bk_dir() {
    $dir = defined('MYF_BACKUP_DIR') && MYF_BACKUP_DIR ? untrailingslashit((string) MYF_BACKUP_DIR) : trailingslashit(wp_upload_dir()['basedir']) . 'myfeuerwehr-sicherung';
    if (!is_dir($dir)) {
        wp_mkdir_p($dir);
        @file_put_contents($dir . '/.htaccess', "Require all denied\nDeny from all\n");
        @file_put_contents($dir . '/index.php', "<?php // Stille.\n");
    }
    return $dir;
}

// Schlüssel aus dem Sicherungskennwort (Argon2id). Gespeichert wird nur der abgeleitete Schlüssel – selbst verschlüsselt
// mit dem Datenschlüssel der Website –, nie das Kennwort.
function myf_bk_set_pass($pass) {
    $salt = random_bytes(16); $type = myf_bk_kdf_best();
    $key = myf_bk_kdf($pass, $salt, $type);
    $o = myf_bk_opts();
    $o['salt'] = base64_encode($salt); $o['kdf'] = $type; $o['key'] = myf_enc(base64_encode($key)); $o['pass_set'] = current_time('mysql');
    myf_bk_save($o);
}
function myf_bk_key() { $o = myf_bk_opts(); return empty($o['key']) ? null : base64_decode(myf_dec($o['key'])); }

function myf_bk_encrypt($json) {
    $o = myf_bk_opts(); $key = myf_bk_key();
    if (!$key) return null;
    $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
    return ($o['kdf'] ?? MYF_BK_MAGIC) . base64_decode($o['salt']) . $nonce . sodium_crypto_secretbox(gzcompress($json, 6), $nonce, $key);
}
function myf_bk_decrypt($bin, $pass) {
    $sl = 16; $nl = SODIUM_CRYPTO_SECRETBOX_NONCEBYTES; $ml = strlen(MYF_BK_MAGIC); $type = substr($bin, 0, $ml);
    if (!in_array($type, [MYF_BK_MAGIC, MYF_BK_MAGIC2], true) || strlen($bin) < $ml + $sl + $nl + 16) return null;
    $salt = substr($bin, $ml, $sl); $nonce = substr($bin, $ml + $sl, $nl);
    try { $key = myf_bk_kdf($pass, $salt, $type); } catch (\Throwable $e) { return null; }
    $plain = sodium_crypto_secretbox_open(substr($bin, $ml + $sl + $nl), $nonce, $key);
    if ($plain === false) return null;
    $j = json_decode((string) @gzuncompress($plain), true);
    return is_array($j) ? $j : null;
}

// Eine Sicherung schreiben: Archiv in der Datenbank + (wenn ein Kennwort gesetzt ist) verschlüsselte Datei; alte aufräumen
function myf_bk_run($label = 'Automatische Sicherung') {
    global $wpdb;
    if (myf_demo_ctx()) return null; // Demo-Bestand wird nie gesichert
    $aid = myf_archive_create($label);
    $o = myf_bk_opts(); $o['last'] = current_time('mysql'); $o['last_archive'] = $aid;
    $j = myf_archive_get($aid);
    if ($j && myf_bk_key()) {
        $j['tables'] = array_combine(array_map(function ($k) { return 'ffl_' . $k; }, array_keys($j['tables'])), array_values($j['tables']));
        $bin = myf_bk_encrypt(wp_json_encode($j));
        $name = 'spind-' . current_time('Y-m-d') . '.wwbk';
        if ($bin && @file_put_contents(myf_bk_dir() . '/' . $name, $bin) !== false) { $o['last_file'] = $name; $o['last_size'] = strlen($bin); }
    }
    myf_bk_save($o);
    myf_bk_prune();
    return $aid;
}
add_action('myf_daily', function () { if (!myf_demo_ctx()) myf_bk_run(); }, 40);

add_action('rest_api_init', function () {
    $ns = 'myf/v1';
    register_rest_route($ns, '/admin/backup', ['methods' => 'POST', 'permission_callback' => function () { return myf_can_manage() && !myf_demo_ctx(); }, 'callback' => function (WP_REST_Request $req) {
        $do = (string) $req->get_param('do');
        if ($do === 'pass') {
            $p = (string) $req->get_param('pass');
            if (mb_strlen($p) < 12) return myf_err('Das Sicherungskennwort braucht mindestens 12 Zeichen – am besten ein Satz.');
            myf_bk_set_pass($p);
            return ['ok' => true];
        }
        if ($do === 'pull') {
            // Abruf-Link für den Rechner im Gerätehaus an/aus bzw. neu erzeugen
            $o = myf_bk_opts();
            if ($req->get_param('off')) unset($o['pull']); else $o['pull'] = wp_generate_password(32, false);
            myf_bk_save($o);
            return ['ok' => true];
        }
        if ($do === 'settings') {
            $o = myf_bk_opts(); $c = myf_bk_conf();
            foreach (['keep_daily', 'keep_weekly', 'keep_files', 'max_mb'] as $k) if ($req->has_param($k)) $c[$k] = (int) $req->get_param($k);
            $o['conf'] = $c; myf_bk_save($o); myf_bk_prune();
            return ['ok' => true, 'conf' => myf_bk_conf()];
        }
        if ($do === 'delete_archive') {
            global $wpdb; $aid = (int) $req->get_param('id');
            if (!$wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('archive') . ' WHERE id = %d', $aid))) return myf_err('Archiv nicht gefunden.', 404);
            $wpdb->delete(myf_t('archive'), ['id' => $aid]);
            return ['ok' => true, 'id' => $aid];
        }
        if ($do === 'now') { if (!myf_bk_key()) return myf_err('Bitte zuerst ein Sicherungskennwort festlegen.'); return ['id' => myf_bk_run('Sicherung von Hand')]; }
        if ($do === 'restore') {
            if ($req->get_param('confirm') !== 'WIEDERHERSTELLEN') return myf_err('Bitte zur Bestätigung WIEDERHERSTELLEN eingeben.');
            $f = $req->get_file_params()['file'] ?? null;
            if (!$f || !empty($f['error']) || !is_uploaded_file($f['tmp_name'])) return myf_err('Bitte die Sicherungsdatei (.wwbk) wählen.');
            $j = myf_bk_decrypt((string) file_get_contents($f['tmp_name']), (string) $req->get_param('pass'));
            if (!$j || ($j['plugin'] ?? '') !== 'myfeuerwehr') return myf_err('Datei oder Sicherungskennwort passen nicht.');
            $before = myf_archive_create('Vor dem Einspielen der Sicherung vom ' . substr((string) ($j['created'] ?? ''), 0, 10));
            $n = myf_tables_restore($j['tables'], $j['options'] ?? null);
            return ['rows' => $n, 'archive_before' => $before];
        }
        return myf_err('Unbekannte Aktion.');
    }]);
});

// Verschlüsselte Sicherungsdatei abrufen: für die Verwaltung (angemeldet) oder den Rechner im Gerätehaus (geheimer Link)
add_action('template_redirect', function () {
    if (!isset($_GET['myf_backup'])) return;
    $o = myf_bk_opts(); $k = (string) $_GET['myf_backup'];
    $ok = ($k === 'latest' && is_user_logged_in() && myf_can_manage()) || (!empty($o['pull']) && hash_equals($o['pull'], $k));
    if (!$ok) { status_header(403); exit('Kein Zugriff.'); }
    $rk = 'myf_bk_rate_' . current_time('YmdH');
    if ((int) get_transient($rk) > 30) { status_header(429); exit('Zu viele Abrufe.'); }
    set_transient($rk, (int) get_transient($rk) + 1, 2 * HOUR_IN_SECONDS);
    $file = !empty($o['last_file']) ? myf_bk_dir() . '/' . basename($o['last_file']) : '';
    if (!$file || !is_readable($file)) { status_header(404); exit('Noch keine Sicherungsdatei – Sicherungskennwort festlegen.'); }
    if (function_exists('myf_audit_write')) myf_audit_write('system', 0, $k === 'latest' ? myf_actor() : 'Abruf Sicherung (Gerätehaus)', 'export:backup', 'backup', 0, ['datei' => basename($file)]);
    nocache_headers();
    header('Content-Type: application/octet-stream');
    header('Content-Disposition: attachment; filename="' . basename($file) . '"');
    header('Content-Length: ' . filesize($file));
    header('X-Content-Type-Options: nosniff');
    while (ob_get_level()) ob_end_clean();
    readfile($file); exit;
});

add_filter('myf_admin_state', function ($d) {
    if (!myf_can_manage() || myf_demo_ctx()) return $d;
    $o = myf_bk_opts();
    $d['backup'] = ['pass_set' => $o['pass_set'] ?? '', 'last' => $o['last'] ?? '', 'last_file' => $o['last_file'] ?? '', 'last_size' => (int) ($o['last_size'] ?? 0),
        'download' => add_query_arg('myf_backup', 'latest', home_url('/')), 'pull_url' => !empty($o['pull']) ? add_query_arg('myf_backup', $o['pull'], home_url('/')) : '', 'dir_custom' => defined('MYF_BACKUP_DIR') && MYF_BACKUP_DIR,
        'conf' => myf_bk_conf(), 'usage' => myf_bk_usage(),
        'files' => array_map('basename', array_slice((function () { $f = glob(myf_bk_dir() . '/*.wwbk') ?: []; rsort($f); return $f; })(), 0, 14))];
    return $d;
}, 45);
