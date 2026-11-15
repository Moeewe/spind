<?php
/**
 * Schulungsunterlagen je Lehrgang: Dateien (PDF, Präsentationen, Bilder …) oder Links (Video, Cloud-Ordner).
 * Schlank: Listen enthalten nur Titel/Größe; eine Datei wird erst beim Antippen geladen und dabei vom Server gestreamt
 * (kein Einlesen in den Speicher). Hochladen nur mit dem Recht „Lehrgänge“; ansehen alle angemeldeten Mitglieder.
 */

defined('ABSPATH') || exit;

const MYF_MAT_EXT = ['pdf' => 'application/pdf', 'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'ppt' => 'application/vnd.ms-powerpoint',
    'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'doc' => 'application/msword', 'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'odt' => 'application/vnd.oasis.opendocument.text', 'odp' => 'application/vnd.oasis.opendocument.presentation', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png',
    'webp' => 'image/webp', 'mp4' => 'video/mp4', 'mp3' => 'audio/mpeg', 'txt' => 'text/plain', 'zip' => 'application/zip'];

function myf_install_materials($c) {
    $p = myf_t(''); // echte oder Demo-Tabellen (Demo-Modus)
    dbDelta("CREATE TABLE {$p}materials (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        ckey varchar(80) NOT NULL DEFAULT '',
        course varchar(160) NOT NULL DEFAULT '',
        title varchar(200) NOT NULL DEFAULT '',
        kind varchar(10) NOT NULL DEFAULT 'file',
        path varchar(255) NOT NULL DEFAULT '',
        url varchar(500) NOT NULL DEFAULT '',
        mime varchar(120) NOT NULL DEFAULT '',
        size bigint(20) unsigned NOT NULL DEFAULT 0,
        by_name varchar(120) NOT NULL DEFAULT '',
        created datetime NOT NULL,
        PRIMARY KEY  (id),
        KEY ckey (ckey)
    ) $c;");
}
// Ablageordner: eigener Unterordner in uploads, Verzeichnisliste und direkter Abruf gesperrt (Apache); Dateinamen zufällig
function myf_mat_dir() {
    $dir = trailingslashit(wp_upload_dir()['basedir']) . 'myfeuerwehr-unterlagen';
    if (!is_dir($dir)) {
        wp_mkdir_p($dir);
        @file_put_contents($dir . '/.htaccess', "Require all denied\nDeny from all\n");
        @file_put_contents($dir . '/index.php', "<?php // Stille.\n");
    }
    return $dir;
}
// Lehrgang als Schlüssel über alle Jahre: Kurzname, sonst Bezeichnung (klein, ohne Sonderzeichen)
function myf_mat_key($s) { return mb_substr(preg_replace('/[^a-z0-9äöüß]+/u', '', mb_strtolower((string) $s)), 0, 80); }
function myf_mat_out($m) {
    return ['id' => (int) $m->id, 'ckey' => $m->ckey, 'course' => $m->course, 'title' => $m->title, 'kind' => $m->kind, 'size' => (int) $m->size,
        'ext' => strtolower(pathinfo((string) $m->path, PATHINFO_EXTENSION)), 'url' => $m->kind === 'link' ? $m->url : add_query_arg('myf_unterlage', (int) $m->id, home_url('/')),
        'by' => $m->by_name, 'created' => $m->created];
}
function myf_mat_list() {
    global $wpdb;
    $t = myf_t('materials');
    if (!$wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $t))) return [];
    return array_map('myf_mat_out', $wpdb->get_results("SELECT * FROM `$t` ORDER BY course, title LIMIT 1000"));
}
function myf_mat_max() { return (int) min(wp_max_upload_size(), 100 * MB_IN_BYTES); }

add_action('rest_api_init', function () {
    // Hochladen (Datei als normales Formular-Upload, kein Base64) oder Link speichern
    register_rest_route('myf/v1', '/admin/material', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $course = mb_substr(sanitize_text_field((string) $req->get_param('course')), 0, 160);
        $ckey = myf_mat_key($req->get_param('ckey') ?: $course);
        $title = mb_substr(sanitize_text_field((string) $req->get_param('title')), 0, 200);
        if ($ckey === '') return myf_err('Bitte den Lehrgang wählen.');
        $row = ['ckey' => $ckey, 'course' => $course, 'by_name' => myf_actor(), 'created' => current_time('mysql')];
        $url = esc_url_raw(trim((string) $req->get_param('url')));
        $f = $req->get_file_params()['file'] ?? null;
        if ($url !== '' && !$f) {
            if (!preg_match('#^https?://#i', $url)) return myf_err('Bitte einen vollständigen Link (https://…) angeben.');
            $wpdb->insert(myf_t('materials'), $row + ['title' => $title !== '' ? $title : $url, 'kind' => 'link', 'url' => $url]);
            return ['id' => (int) $wpdb->insert_id];
        }
        if (!$f || !empty($f['error']) || !is_uploaded_file($f['tmp_name'])) return myf_err('Datei nicht angekommen (zu groß? Höchstens ' . size_format(myf_mat_max()) . ').');
        if ((int) $f['size'] > myf_mat_max()) return myf_err('Die Datei ist zu groß (höchstens ' . size_format(myf_mat_max()) . '). Große Videos besser als Link ablegen.');
        $ext = strtolower(pathinfo((string) $f['name'], PATHINFO_EXTENSION));
        if (!isset(MYF_MAT_EXT[$ext])) return myf_err('Dateityp .' . $ext . ' geht nicht. Erlaubt: ' . implode(', ', array_keys(MYF_MAT_EXT)) . '.');
        if (!myf_upload_sniff_ok($f['tmp_name'], $ext)) return myf_err('Die Datei passt nicht zur Endung .' . $ext . ' – bitte die Originaldatei hochladen.');
        $name = wp_generate_password(16, false) . '-' . sanitize_file_name(pathinfo((string) $f['name'], PATHINFO_FILENAME)) . '.' . $ext;
        if (!@move_uploaded_file($f['tmp_name'], myf_mat_dir() . '/' . $name)) return myf_err('Datei konnte nicht gespeichert werden (Schreibrechte im Upload-Ordner?).');
        $wpdb->insert(myf_t('materials'), $row + ['title' => $title !== '' ? $title : pathinfo((string) $f['name'], PATHINFO_FILENAME), 'kind' => 'file', 'path' => $name, 'mime' => MYF_MAT_EXT[$ext], 'size' => (int) $f['size']]);
        return ['id' => (int) $wpdb->insert_id];
    }]);
    register_rest_route('myf/v1', '/admin/material/delete', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $m = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('materials') . ' WHERE id = %d', (int) $req->get_param('id')));
        if (!$m) return myf_err('Nicht gefunden.', 404);
        if ($m->kind === 'file' && $m->path !== '' && strpos($m->path, '/') === false) @unlink(myf_mat_dir() . '/' . $m->path);
        $wpdb->delete(myf_t('materials'), ['id' => $m->id]);
        return ['ok' => true];
    }]);
});

// Abruf einer Datei: nur angemeldet (Mitglied oder Verwaltung), gestreamt, im Browser öffnen
add_action('template_redirect', function () {
    if (!isset($_GET['myf_unterlage'])) return;
    global $wpdb;
    if (!is_user_logged_in() || !(myf_me() || myf_can_manage())) { auth_redirect(); exit; }
    $m = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('materials') . ' WHERE id = %d AND kind = %s', (int) $_GET['myf_unterlage'], 'file'));
    $file = $m && strpos($m->path, '/') === false ? myf_mat_dir() . '/' . $m->path : '';
    if (!$file || !is_readable($file)) { status_header(404); exit('Unterlage nicht gefunden.'); }
    $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
    nocache_headers();
    header('Content-Type: ' . (MYF_MAT_EXT[$ext] ?? 'application/octet-stream'));
    header('Content-Length: ' . filesize($file));
    header('Content-Disposition: ' . (in_array($ext, ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'mp4', 'mp3', 'txt'], true) ? 'inline' : 'attachment') . '; filename="' . sanitize_file_name($m->title) . '.' . $ext . '"');
    header('Cache-Control: private, max-age=3600');
    header('X-Content-Type-Options: nosniff');
    while (ob_get_level()) ob_end_clean();
    readfile($file);
    exit;
});

add_filter('myf_admin_state', function ($d) {
    if (function_exists('myf_has_area') && myf_has_area('courses')) { $d['materials'] = myf_mat_list(); $d['mat_max'] = myf_mat_max(); $d['mat_ext'] = array_keys(MYF_MAT_EXT); }
    return $d;
}, 30);
add_filter('myf_me_data', function ($data) { $data['materials'] = myf_mat_list(); return $data; }, 30);

// G26-Nachweis (Scan/Foto) abrufen: nur Atemschutz-Zuständige, Verwaltung und das Mitglied selbst – Gesundheitsangabe
add_action('template_redirect', function () {
    if (!isset($_GET['myf_agtfile'])) return;
    global $wpdb;
    if (!is_user_logged_in()) { auth_redirect(); exit; }
    $l = $wpdb->get_row($wpdb->prepare('SELECT member_id, file, kind FROM ' . myf_t('agt_log') . ' WHERE id = %d', (int) $_GET['myf_agtfile']));
    $me = myf_me();
    if (!$l || !$l->file || !(myf_can_manage() || myf_has_area('agt') || ($me && (int) $me->id === (int) $l->member_id))) { status_header(403); exit('Keine Berechtigung.'); }
    $file = strpos($l->file, '/') === false ? myf_mat_dir() . '/' . $l->file : '';
    if (!$file || !is_readable($file)) { status_header(404); exit('Nachweis nicht gefunden.'); }
    $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
    $mime = ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp', 'heic' => 'image/heic', 'pdf' => 'application/pdf'][$ext] ?? 'application/octet-stream';
    if (function_exists('myf_audit_write')) { $u = wp_get_current_user(); myf_audit_write($me ? 'member' : 'admin', $me ? (int) $me->id : (int) $u->ID, $me ? $me->name : ($u->display_name ?: $u->user_login), 'view:agt/g26', 'agt_log', (int) $_GET['myf_agtfile'], []); }
    nocache_headers(); header('Content-Type: ' . $mime); header('Content-Length: ' . filesize($file)); header('Content-Disposition: inline; filename="G26-Nachweis.' . $ext . '"'); header('X-Content-Type-Options: nosniff');
    while (ob_get_level()) ob_end_clean();
    readfile($file); exit;
});
