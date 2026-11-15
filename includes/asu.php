<?php
/**
 * Atemschutzüberwachung (ASÜ): Im Einsatz bzw. bei der Übung schreibt jemand die Zeiten und Drücke der Trupps auf.
 * Hier wird das Protokoll erfasst, mit Foto/Scan des Papierbogens abgelegt und nach dem Abschließen gesperrt.
 * Verknüpft: Teilnahme (Rolle AGT, Minuten), Atemschutz-Verlauf des Mitglieds, Werkstatt (benutzte Geräte).
 * Jede Fassung steht vollständig im Änderungsprotokoll (Hash-Kette).
 */

defined('ABSPATH') || exit;

const MYF_ASU_EXT = ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp', 'heic' => 'image/heic', 'pdf' => 'application/pdf'];
const MYF_ASU_TRUPPS = ['Angriffstrupp', 'Wassertrupp', 'Schlauchtrupp', 'Sicherheitstrupp', 'Rettungstrupp'];

function myf_install_asu($c) {
    $p = myf_t('');
    dbDelta("CREATE TABLE {$p}asu (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        incident_id bigint(20) unsigned NOT NULL,
        station varchar(60) NOT NULL DEFAULT '',
        supervisor varchar(120) NOT NULL DEFAULT '',
        data longtext NULL,
        files text NULL,
        status varchar(10) NOT NULL DEFAULT 'open',
        closed_by varchar(120) NOT NULL DEFAULT '',
        closed_at datetime NULL,
        reopen_note text NULL,
        created_by varchar(120) NOT NULL DEFAULT '',
        created datetime NOT NULL,
        updated datetime NULL,
        PRIMARY KEY  (id),
        KEY incident_id (incident_id)
    ) $c;");
}

// Wer darf? Atemschutz(werkstatt), Gerätewarte (Fahrzeuge/Technik), Einsatzführung – und die Verwaltung
function myf_asu_can() {
    if (!is_user_logged_in()) return false;
    if (myf_can_manage()) return true;
    foreach (['agt', 'vehicles', 'incidents'] as $a) if (myf_has_area($a)) return true;
    return false;
}
function myf_asu_perm() { return myf_asu_can() ? true : new WP_Error('myf_right', 'Die Atemschutzüberwachung erfassen Atemschutzwerkstatt, Gerätewarte und Einsatzführung.', ['status' => 403]); }

function myf_asu_time($v) { return preg_match('/^([01]?\d|2[0-3]):[0-5]\d$/', (string) $v) ? str_pad((string) $v, 5, '0', STR_PAD_LEFT) : ''; }
function myf_asu_bar($v) { return $v === '' || $v === null ? '' : max(0, min(330, (int) $v)); }

// Eingabe bereinigen: Trupps mit Zeiten, Kontrollen und Personen (Gerät, Maske, Druck)
function myf_asu_clean($trupps) {
    $out = [];
    foreach (array_slice((array) $trupps, 0, 12) as $t) {
        if (!is_array($t)) continue;
        $m = [];
        foreach (array_slice((array) ($t['members'] ?? []), 0, 4) as $x) {
            if (!is_array($x)) continue;
            $row = ['member_id' => (int) ($x['member_id'] ?? 0) ?: null, 'name' => mb_substr(sanitize_text_field((string) ($x['name'] ?? '')), 0, 80),
                'fn' => in_array($x['fn'] ?? '', ['TF', 'TM'], true) ? $x['fn'] : '', 'pa' => mb_substr(sanitize_text_field((string) ($x['pa'] ?? '')), 0, 30),
                'mask' => mb_substr(sanitize_text_field((string) ($x['mask'] ?? '')), 0, 30), 'bottle' => mb_substr(sanitize_text_field((string) ($x['bottle'] ?? '')), 0, 30),
                'p_start' => myf_asu_bar($x['p_start'] ?? ''), 'p_end' => myf_asu_bar($x['p_end'] ?? '')];
            if ($row['member_id'] || $row['name'] !== '') $m[] = $row;
        }
        $checks = [];
        foreach (array_slice((array) ($t['checks'] ?? []), 0, 6) as $c) {
            if (!is_array($c)) continue;
            $ct = myf_asu_time($c['t'] ?? ''); $cp = myf_asu_bar($c['p'] ?? '');
            if ($ct !== '' || $cp !== '') $checks[] = ['t' => $ct, 'p' => $cp];
        }
        $row = ['name' => mb_substr(sanitize_text_field((string) ($t['name'] ?? '')), 0, 40), 'task' => mb_substr(sanitize_text_field((string) ($t['task'] ?? '')), 0, 160),
            't_start' => myf_asu_time($t['t_start'] ?? ''), 'checks' => $checks, 't_retreat' => myf_asu_time($t['t_retreat'] ?? ''), 't_end' => myf_asu_time($t['t_end'] ?? ''),
            'note' => mb_substr(sanitize_textarea_field((string) ($t['note'] ?? '')), 0, 400), 'members' => $m];
        if ($m || $row['name'] !== '' || $row['t_start'] !== '') $out[] = $row;
    }
    return $out;
}

// Minuten unter Atemschutz: Anschluss bis Ende (über Mitternacht möglich)
function myf_asu_minutes($t) {
    if (empty($t['t_start']) || empty($t['t_end'])) return 0;
    $a = (int) substr($t['t_start'], 0, 2) * 60 + (int) substr($t['t_start'], 3, 2);
    $b = (int) substr($t['t_end'], 0, 2) * 60 + (int) substr($t['t_end'], 3, 2);
    $d = $b - $a; if ($d < 0) $d += 1440;
    return $d > 0 && $d <= 600 ? $d : 0;
}

function myf_asu_out($r) {
    return ['id' => (int) $r->id, 'incident_id' => (int) $r->incident_id, 'station' => $r->station, 'supervisor' => $r->supervisor,
        'trupps' => json_decode((string) $r->data, true) ?: [], 'files' => array_map(function ($f, $i) use ($r) {
            return ['name' => $f['name'], 'mime' => $f['mime'], 'size' => (int) $f['size'], 'url' => add_query_arg(['myf_asu' => (int) $r->id, 'f' => $i], home_url('/'))];
        }, json_decode((string) $r->files, true) ?: [], array_keys(json_decode((string) $r->files, true) ?: [])),
        'status' => $r->status, 'closed_by' => $r->closed_by, 'closed_at' => $r->closed_at, 'reopen_note' => (string) $r->reopen_note,
        'created_by' => $r->created_by, 'created' => $r->created, 'updated' => $r->updated];
}

// Verknüpfen: Teilnahme (Rolle AGT + Minuten), Atemschutz-Verlauf (erst beim Abschließen), Werkstatt (benutzte Geräte)
function myf_asu_sync($id) {
    global $wpdb;
    $r = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('asu') . ' WHERE id = %d', $id));
    if (!$r) return;
    $inc = $wpdb->get_row($wpdb->prepare('SELECT id, kind, nr, title, start FROM ' . myf_t('incidents') . ' WHERE id = %d', $r->incident_id));
    if (!$inc) return;
    $tag = 'ASÜ E' . (int) $inc->id;
    $mins = [];
    foreach (json_decode((string) $r->data, true) ?: [] as $t) {
        $min = myf_asu_minutes($t);
        foreach ($t['members'] as $m) {
            if (empty($m['member_id'])) continue;
            $mins[$m['member_id']] = max($mins[$m['member_id']] ?? 0, $min);
            // Benutzte Geräte gehen in die Prüfung der Atemschutzwerkstatt
            foreach (['pa', 'mask', 'bottle'] as $k) {
                if (($m[$k] ?? '') === '') continue;
                $dev = $wpdb->get_row($wpdb->prepare('SELECT id, type, nr, status FROM ' . myf_t('devices') . " WHERE area = 'agt' AND nr = %s LIMIT 1", $m[$k]));
                if ($dev && $dev->status === 'ready') {
                    $wpdb->update(myf_t('devices'), ['status' => 'used'], ['id' => $dev->id]);
                    $label = myf_ws_rules('agt')[$dev->type]['label'] ?? $dev->type;
                    myf_notify_area('agt', 'device', $label . ' ' . $dev->nr . ' benutzt – bitte prüfen', trim(($inc->nr ? $inc->nr . ' ' : '') . $inc->title) . ' (Atemschutzüberwachung)', 'admin:geraet:' . $dev->id);
                }
            }
        }
    }
    foreach ($mins as $mid => $min) {
        $p = $wpdb->get_row($wpdb->prepare('SELECT id, role, as_minutes FROM ' . myf_t('participation') . ' WHERE incident_id = %d AND member_id = %d', $inc->id, $mid));
        $role = myf_part_role(($p ? $p->role . ',' : '') . 'AGT');
        if ($p) $wpdb->update(myf_t('participation'), ['role' => $role, 'as_minutes' => $min ?: (int) $p->as_minutes, 'updated' => current_time('mysql')], ['id' => $p->id]);
        else $wpdb->insert(myf_t('participation'), ['incident_id' => $inc->id, 'member_id' => $mid, 'vehicle' => mb_substr($r->station, 0, 40), 'role' => $role, 'as_minutes' => $min,
            'source' => 'asu', 'created' => current_time('mysql')]);
    }
    // Aus dem Trupp entfernt: Minuten kommen nur aus dem Protokoll, also keine Minuten mehr (Haken „AGT“ bleibt, das klärt die Einsatzführung)
    if ($mins) foreach ($wpdb->get_results($wpdb->prepare('SELECT id, member_id FROM ' . myf_t('participation') . ' WHERE incident_id = %d AND as_minutes > 0', $inc->id)) as $x) {
        if (isset($mins[(int) $x->member_id])) continue;
        $wpdb->update(myf_t('participation'), ['as_minutes' => 0, 'updated' => current_time('mysql')], ['id' => $x->id]);
        myf_part_agt_sync((int) $x->id);
    }
    // Atemschutz-Verlauf: nur abgeschlossene Protokolle zählen (geprüft); ersetzt den Eintrag aus der Teilnahme
    $wpdb->query($wpdb->prepare('DELETE FROM ' . myf_t('agt_log') . ' WHERE note LIKE %s', '%· ' . $wpdb->esc_like($tag) . ' #' . (int) $r->id));
    if ($r->status !== 'closed') {
        // Offen: wieder der Stand aus der Teilnahme (bestätigte Minuten)
        foreach (array_keys($mins) as $mid) { $pid = (int) $wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('participation') . ' WHERE incident_id = %d AND member_id = %d', $inc->id, $mid)); if ($pid) myf_part_agt_sync($pid); }
        return;
    }
    $kind = $inc->kind === 'uebung' ? 'uebung' : 'einsatz';
    foreach ($mins as $mid => $min) {
        $pid = (int) $wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('participation') . ' WHERE incident_id = %d AND member_id = %d', $inc->id, $mid));
        if ($pid) $wpdb->query($wpdb->prepare('DELETE FROM ' . myf_t('agt_log') . ' WHERE member_id = %d AND note LIKE %s', $mid, '%' . $wpdb->esc_like('Beteiligung #' . $pid)));
        $wpdb->insert(myf_t('agt_log'), ['member_id' => $mid, 'kind' => $kind, 'date' => substr($inc->start, 0, 10),
            'note' => trim(($inc->nr ? $inc->nr . ' ' : '') . $inc->title) . ($min ? ' – ' . $min . ' min unter Atemschutz' : ' – unter Atemschutz') . ' · ' . $tag . ' #' . (int) $r->id]);
    }
}

// Übersicht für die Verwaltung: Einsätze und Übungen mit gemeldeten AGT und Protokollen – letzte 12 Monate oder ein ganzes Jahr (?iyear=)
function myf_asu_state() {
    global $wpdb;
    $iy = isset($_GET['iyear']) ? (int) $_GET['iyear'] : 0;
    if ($iy >= 1990 && $iy <= 2200) $incs = $wpdb->get_results($wpdb->prepare('SELECT id, kind, nr, title, start, unit FROM ' . myf_t('incidents') . " WHERE start >= %s AND start < %s AND source <> 'test' ORDER BY start DESC LIMIT 1000", $iy . '-01-01', ($iy + 1) . '-01-01'));
    else $incs = $wpdb->get_results($wpdb->prepare('SELECT id, kind, nr, title, start, unit FROM ' . myf_t('incidents') . " WHERE start >= %s AND source <> 'test' ORDER BY start DESC LIMIT 1000", date('Y-m-d', current_time('timestamp') - 365 * DAY_IN_SECONDS)));
    $ids = array_map(function ($i) { return (int) $i->id; }, $incs) ?: [0];
    $in = implode(',', $ids);
    $agt = [];
    foreach ($wpdb->get_results('SELECT p.incident_id, p.member_id, p.vehicle, p.as_minutes, m.name FROM ' . myf_t('participation') . ' p JOIN ' . myf_t('members') . " m ON m.id = p.member_id WHERE p.incident_id IN ($in) AND (p.role = 'AGT' OR p.role LIKE 'AGT,%' OR p.role LIKE '%,AGT' OR p.role LIKE '%,AGT,%')") as $p) {
        $agt[(int) $p->incident_id][] = ['member_id' => (int) $p->member_id, 'name' => $p->name, 'vehicle' => $p->vehicle, 'minutes' => (int) $p->as_minutes];
    }
    // Maschinist je Fahrzeug – überwacht meist die Trupps seines Fahrzeugs (Vorschlag für „Überwacht von“)
    $ma = [];
    foreach ($wpdb->get_results('SELECT p.incident_id, p.vehicle, m.name FROM ' . myf_t('participation') . ' p JOIN ' . myf_t('members') . " m ON m.id = p.member_id WHERE p.incident_id IN ($in) AND (p.role = 'MA' OR p.role LIKE 'MA,%' OR p.role LIKE '%,MA' OR p.role LIKE '%,MA,%')") as $p)
        $ma[(int) $p->incident_id][(string) $p->vehicle] = $p->name;
    $protos = [];
    foreach ($wpdb->get_results('SELECT * FROM ' . myf_t('asu') . " WHERE incident_id IN ($in) ORDER BY id") as $r) $protos[(int) $r->incident_id][] = myf_asu_out($r);
    $devs = [];
    foreach ($wpdb->get_results('SELECT type, nr FROM ' . myf_t('devices') . " WHERE area = 'agt' AND nr <> '' ORDER BY nr") as $x) $devs[$x->type][] = $x->nr;
    return [
        'incidents' => array_map(function ($i) use ($agt, $protos, $ma) {
            return ['id' => (int) $i->id, 'kind' => $i->kind, 'nr' => $i->nr, 'title' => $i->title, 'start' => $i->start, 'unit' => $i->unit,
                'agt' => $agt[(int) $i->id] ?? [], 'protos' => $protos[(int) $i->id] ?? [], 'ma' => (object) ($ma[(int) $i->id] ?? [])];
        }, $incs),
        'people' => array_map(function ($m) { return ['id' => (int) $m->id, 'name' => $m->name]; }, $wpdb->get_results('SELECT id, name FROM ' . myf_t('members') . ' WHERE active = 1 ORDER BY name')),
        'devices' => ['pa' => $devs['pa'] ?? [], 'mask' => $devs['maske'] ?? [], 'bottle' => $devs['flasche'] ?? []],
        'stations' => function_exists('myf_incident_vehicles') ? array_values(array_filter(myf_incident_vehicles(), function ($v) { return $v !== 'Andere'; })) : [],
        'trupps' => MYF_ASU_TRUPPS, 'ext' => array_keys(MYF_ASU_EXT), 'max' => (int) min(wp_max_upload_size(), 20 * MB_IN_BYTES),
    ];
}
add_filter('myf_admin_state', function ($d) {
    if (myf_asu_can()) {
        $d['asu'] = myf_asu_state(); $d['asu_can'] = true;
        $d['asu_missing'] = array_map(function ($i) { return ['id' => (int) $i->id, 'nr' => $i->nr, 'title' => $i->title, 'start' => $i->start, 'kind' => $i->kind]; }, myf_asu_missing());
    }
    return $d;
});

// Offene Punkte: Einsätze/Übungen der letzten 30 Tage mit AGT, aber ohne abgeschlossenes Protokoll
function myf_asu_missing() {
    global $wpdb;
    $since = date('Y-m-d', strtotime(current_time('Y-m-d')) - 30 * DAY_IN_SECONDS);
    return $wpdb->get_results($wpdb->prepare('SELECT DISTINCT i.id, i.nr, i.title, i.start, i.kind FROM ' . myf_t('incidents') . ' i JOIN ' . myf_t('participation') . " p ON p.incident_id = i.id AND (p.role = 'AGT' OR p.role LIKE 'AGT,%' OR p.role LIKE '%,AGT' OR p.role LIKE '%,AGT,%')
        WHERE i.start >= %s AND i.source <> 'test' AND NOT EXISTS (SELECT 1 FROM " . myf_t('asu') . " a WHERE a.incident_id = i.id AND a.status = 'closed') ORDER BY i.start DESC LIMIT 20", $since));
}

add_action('rest_api_init', function () {
    $ns = 'myf/v1';
    // Speichern (neu oder ändern) – abgeschlossene Protokolle nur nach „Wieder öffnen“ mit Grund
    register_rest_route($ns, '/asu', ['methods' => 'POST', 'permission_callback' => 'myf_asu_perm', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $id = (int) $req->get_param('id');
        $row = $id ? $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('asu') . ' WHERE id = %d', $id)) : null;
        if ($id && !$row) return myf_err('Protokoll nicht gefunden.', 404);
        if ($row && $row->status === 'closed') return myf_err('Das Protokoll ist abgeschlossen. Zum Ändern erst „Wieder öffnen“ (mit Grund).');
        $iid = $row ? (int) $row->incident_id : (int) $req->get_param('incident_id');
        if (!$wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('incidents') . ' WHERE id = %d', $iid))) return myf_err('Einsatz bzw. Übung nicht gefunden.', 404);
        $d = ['station' => mb_substr(sanitize_text_field((string) $req->get_param('station')), 0, 60), 'supervisor' => mb_substr(sanitize_text_field((string) $req->get_param('supervisor')), 0, 120),
            'data' => wp_json_encode(myf_asu_clean($req->get_param('trupps'))), 'updated' => current_time('mysql')];
        if ($row) $wpdb->update(myf_t('asu'), $d, ['id' => $row->id]);
        else { $wpdb->insert(myf_t('asu'), $d + ['incident_id' => $iid, 'files' => '[]', 'created_by' => myf_actor(), 'created' => current_time('mysql')]); $id = (int) $wpdb->insert_id; }
        if ($req->get_param('close')) {
            $chk = json_decode($d['data'], true);
            if (!$chk) return myf_err('Zum Abschließen mindestens einen Trupp mit Personen eintragen.');
            foreach ($chk as $t) if (!empty($t['t_start']) && !empty($t['t_end']) && !myf_asu_minutes($t)) return myf_err('Bitte die Zeiten von „' . ($t['name'] ?? 'Trupp') . '“ prüfen: mehr als 10 Stunden unter Atemschutz gibt es nicht.');
            $wpdb->update(myf_t('asu'), ['status' => 'closed', 'closed_by' => myf_actor(), 'closed_at' => current_time('mysql')], ['id' => $id]);
        }
        myf_asu_sync($id);
        return ['id' => $id];
    }]);
    // Wieder öffnen: nur mit Grund, der Grund bleibt am Protokoll sichtbar
    register_rest_route($ns, '/asu/reopen', ['methods' => 'POST', 'permission_callback' => 'myf_asu_perm', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $id = (int) $req->get_param('id'); $why = trim(sanitize_text_field((string) $req->get_param('reason')));
        $row = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('asu') . ' WHERE id = %d', $id));
        if (!$row) return myf_err('Protokoll nicht gefunden.', 404);
        if (mb_strlen($why) < 4) return myf_err('Bitte kurz den Grund angeben (bleibt im Protokoll).');
        $note = trim((string) $row->reopen_note . "\n" . current_time('d.m.Y H:i') . ' ' . myf_actor() . ': ' . $why);
        $wpdb->update(myf_t('asu'), ['status' => 'open', 'reopen_note' => $note, 'updated' => current_time('mysql')], ['id' => $id]);
        myf_asu_sync($id);
        return ['id' => $id];
    }]);
    // Foto/Scan des Papierbogens anhängen (geschützt abgelegt, Abruf nur angemeldet und berechtigt)
    register_rest_route($ns, '/asu/file', ['methods' => 'POST', 'permission_callback' => 'myf_asu_perm', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $id = (int) $req->get_param('id');
        $row = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('asu') . ' WHERE id = %d', $id));
        if (!$row) return myf_err('Erst das Protokoll speichern, dann den Bogen anhängen.', 404);
        if ($row->status === 'closed') return myf_err('Das Protokoll ist abgeschlossen.');
        $files = json_decode((string) $row->files, true) ?: [];
        if (count($files) >= 10) return myf_err('Höchstens 10 Anhänge.');
        $f = $req->get_file_params()['file'] ?? null;
        if (!$f || !empty($f['error']) || !is_uploaded_file($f['tmp_name'])) return myf_err('Datei fehlt oder ist zu groß.');
        $ext = strtolower(pathinfo((string) $f['name'], PATHINFO_EXTENSION));
        if (!isset(MYF_ASU_EXT[$ext])) return myf_err('Bitte ein Foto (JPG, PNG, WebP, HEIC) oder PDF.');
        if ($f['size'] > 20 * MB_IN_BYTES) return myf_err('Höchstens 20 MB.');
        if (!myf_upload_sniff_ok($f['tmp_name'], $ext)) return myf_err('Die Datei passt nicht zur Endung – bitte das Foto oder PDF direkt hochladen.');
        $name = 'asu-' . wp_generate_password(20, false) . '.' . $ext;
        if (!@move_uploaded_file($f['tmp_name'], myf_mat_dir() . '/' . $name)) return myf_err('Datei konnte nicht gespeichert werden.');
        $files[] = ['name' => mb_substr(sanitize_file_name((string) $f['name']), 0, 120), 'path' => $name, 'mime' => MYF_ASU_EXT[$ext], 'size' => (int) $f['size'], 'by' => myf_actor(), 'at' => current_time('mysql')];
        $wpdb->update(myf_t('asu'), ['files' => wp_json_encode($files), 'updated' => current_time('mysql')], ['id' => $id]);
        return ['id' => $id];
    }]);
});

// Anhang abrufen: nur angemeldet und berechtigt; Datei liegt außerhalb des öffentlichen Zugriffs
add_action('template_redirect', function () {
    if (!isset($_GET['myf_asu'])) return;
    global $wpdb;
    if (!is_user_logged_in()) { auth_redirect(); exit; }
    if (!myf_asu_can()) { status_header(403); exit('Keine Berechtigung.'); }
    $row = $wpdb->get_row($wpdb->prepare('SELECT files FROM ' . myf_t('asu') . ' WHERE id = %d', (int) $_GET['myf_asu']));
    $files = $row ? (json_decode((string) $row->files, true) ?: []) : [];
    $f = $files[(int) ($_GET['f'] ?? 0)] ?? null;
    $file = $f && strpos($f['path'], '/') === false ? myf_mat_dir() . '/' . $f['path'] : '';
    if (!$file || !is_readable($file)) { status_header(404); exit('Anhang nicht gefunden.'); }
    nocache_headers();
    header('Content-Type: ' . $f['mime']);
    header('Content-Length: ' . filesize($file));
    header('Content-Disposition: inline; filename="' . sanitize_file_name($f['name']) . '"');
    header('X-Content-Type-Options: nosniff');
    while (ob_get_level()) ob_end_clean();
    readfile($file);
    exit;
});
