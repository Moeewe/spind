<?php
/** Mängelmeldungen zu Fahrzeugen, Geräten und Gerätehaus – mit Foto, Dringlichkeit und Bearbeitung. */

defined('ABSPATH') || exit;

const MYF_DEFECT_URGENCY = ['out' => 'Außer Dienst – nicht mehr einsatzbereit', 'soon' => 'Bald beheben', 'info' => 'Hinweis'];
const MYF_DEFECT_STATUS = ['new' => 'Neu', 'progress' => 'In Bearbeitung', 'done' => 'Erledigt', 'rejected' => 'Kein Mangel'];

function myf_install_defects($c) {
    global $wpdb;
    $p = myf_t(''); // echte oder Demo-Tabellen (Demo-Modus)
    dbDelta("CREATE TABLE {$p}defects (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        member_id bigint(20) unsigned NULL,
        object varchar(80) NOT NULL,
        urgency varchar(10) NOT NULL DEFAULT 'soon',
        title varchar(150) NOT NULL DEFAULT '',
        text text NULL,
        photos text NULL,
        status varchar(12) NOT NULL DEFAULT 'new',
        answer text NULL,
        answered datetime NULL,
        created datetime NOT NULL,
        PRIMARY KEY  (id),
        KEY status (status)
    ) $c;");
}

// Auswahlliste: Fahrzeuge aus der Einsatzverwaltung + feste Punkte (in den Einstellungen änderbar)
function myf_defect_objects() {
    global $wpdb;
    // Eigene Fahrzeugliste zuerst (gleiche Namen wie Fahrtenbuch/Buchung), Einsatzverwaltung nur ergänzend – nie im Demo-Bestand
    $list = $wpdb->get_col('SELECT name FROM ' . myf_t('vehicles') . ' WHERE active = 1 ORDER BY name') ?: [];
    if (!myf_demo_ctx() && taxonomy_exists('fahrzeug')) {
        $terms = get_terms(['taxonomy' => 'fahrzeug', 'hide_empty' => false]);
        if (!is_wp_error($terms)) foreach ($terms as $t) if (!myf_vehicle_same($t->name)) $list[] = $t->name;
    }
    $extra = (array) (myf_settings()['defect_objects'] ?? myf_local('defect_objects'));
    return array_values(array_unique(array_merge($list, $extra)));
}

function myf_defect_out($x, $admin = false) {
    $o = ['id' => (int) $x->id, 'object' => $x->object, 'urgency' => $x->urgency, 'title' => $x->title, 'text' => (string) $x->text,
        'photos' => json_decode((string) $x->photos, true) ?: [], 'status' => $x->status, 'answer' => (string) $x->answer,
        'answered' => $x->answered, 'created' => $x->created];
    if ($admin) $o['member_id'] = $x->member_id ? (int) $x->member_id : null;
    return $o;
}

// Fotos liegen im Upload-Ordner unter zufälligen Namen (nicht erratbar, kein Verzeichnislisting)
function myf_defect_dir() {
    $up = wp_upload_dir();
    $dir = trailingslashit($up['basedir']) . 'myfeuerwehr';
    if (!is_dir($dir)) {
        wp_mkdir_p($dir);
        @file_put_contents($dir . '/index.php', "<?php // Silence is golden.\n");
        @file_put_contents($dir . '/.htaccess', "Options -Indexes\n");
    }
    return ['dir' => $dir, 'url' => trailingslashit($up['baseurl']) . 'myfeuerwehr'];
}

function myf_save_photo($dataUrl, $prefix = 'mangel-') {
    if (!preg_match('#^data:image/(jpeg|png|webp);base64,(.+)$#', (string) $dataUrl, $m)) return null;
    $bin = base64_decode($m[2], true);
    if (!$bin || strlen($bin) > 4 * 1024 * 1024) return null;
    $info = @getimagesizefromstring($bin);
    if (!$info || !in_array($info['mime'], ['image/jpeg', 'image/png', 'image/webp'], true)) return null;
    $ext = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'][$info['mime']];
    $loc = myf_defect_dir();
    $name = $prefix . bin2hex(random_bytes(12)) . '.' . $ext;
    if (false === file_put_contents($loc['dir'] . '/' . $name, $bin)) return null;
    return $loc['url'] . '/' . $name;
}

function myf_delete_photos($photos) {
    $loc = myf_defect_dir();
    foreach ((array) $photos as $url) {
        $file = $loc['dir'] . '/' . basename((string) $url);
        if (strpos(basename((string) $url), 'mangel-') === 0 && is_file($file)) @unlink($file);
    }
}

add_filter('myf_me_data', function ($data, $me) {
    global $wpdb;
    $data['defect_objects'] = myf_defect_objects();
    $data['defect_urgency'] = MYF_DEFECT_URGENCY;
    $data['defect_status'] = MYF_DEFECT_STATUS;
    $data['defects'] = array_map('myf_defect_out', $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . myf_t('defects') . ' WHERE member_id = %d ORDER BY created DESC', $me->id)));
    // Was gerade außer Dienst ist, sollen alle wissen (ohne Namen)
    $data['defects_out'] = array_map(function ($x) { return ['object' => $x->object, 'title' => $x->title, 'created' => $x->created]; },
        $wpdb->get_results("SELECT object, title, created FROM " . myf_t('defects') . " WHERE urgency = 'out' AND status IN ('new','progress') ORDER BY created DESC"));
    $data['settings']['defects_open'] = (bool) (myf_settings()['defects_open'] ?? true);
    return $data;
}, 10, 2);

add_filter('myf_admin_state', function ($data) {
    global $wpdb;
    $data['defect_objects'] = myf_defect_objects();
    $data['defect_urgency'] = MYF_DEFECT_URGENCY;
    $data['defect_status'] = MYF_DEFECT_STATUS;
    $data['defects'] = array_map(function ($x) { return myf_defect_out($x, true); }, $wpdb->get_results('SELECT * FROM ' . myf_t('defects') . ' ORDER BY created DESC'));
    return $data;
});

add_action('rest_api_init', function () {
    register_rest_route('myf/v1', '/me/defect', ['methods' => 'POST', 'permission_callback' => 'myf_member_permission', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $me = myf_me();
        if (!(myf_settings()['defects_open'] ?? true)) return myf_err('Mängelmeldungen sind gerade geschlossen.', 403);
        $object = sanitize_text_field((string) $req->get_param('object'));
        $title = sanitize_text_field((string) $req->get_param('title'));
        if ($object === '' || $title === '') return myf_err('Bitte angeben, was betroffen ist und worum es geht.');
        $photos = [];
        foreach (array_slice((array) $req->get_param('photos'), 0, 3) as $p) { $u = myf_save_photo($p); if ($u) $photos[] = $u; }
        $wpdb->insert(myf_t('defects'), [
            'member_id' => $me->id, 'object' => $object,
            'urgency' => isset(MYF_DEFECT_URGENCY[$req->get_param('urgency')]) ? $req->get_param('urgency') : 'soon',
            'title' => $title, 'text' => sanitize_textarea_field((string) $req->get_param('text')),
            'photos' => wp_json_encode($photos), 'status' => 'new', 'created' => current_time('mysql'),
        ]);
        $nid = (int) $wpdb->insert_id;
        $urg = $req->get_param('urgency') === 'out' ? 'AUSSER DIENST: ' : '';
        myf_notify_area('defects', 'defect', $urg . 'Neuer Mangel: ' . $object . ' – ' . $title, 'gemeldet von ' . $me->name, 'admin:defects', 'defect:' . $nid);
        do_action('myf_defect_created', $nid, $object, $title, sanitize_textarea_field((string) $req->get_param('text')), $me);
        return ['id' => $nid, 'photos' => count($photos)];
    }]);

    register_rest_route('myf/v1', '/admin/defect', ['methods' => 'POST', 'permission_callback' => 'myf_can_manage', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $id = (int) $req->get_param('id');
        $d = [];
        if ($req->has_param('status')) $d['status'] = isset(MYF_DEFECT_STATUS[$req->get_param('status')]) ? $req->get_param('status') : 'new';
        if ($req->has_param('urgency')) $d['urgency'] = isset(MYF_DEFECT_URGENCY[$req->get_param('urgency')]) ? $req->get_param('urgency') : 'soon';
        if ($req->has_param('object')) $d['object'] = sanitize_text_field((string) $req->get_param('object'));
        if ($req->has_param('answer')) {
            $d['answer'] = sanitize_textarea_field((string) $req->get_param('answer'));
            $d['answered'] = $d['answer'] !== '' ? current_time('mysql') : null;
        }
        if ($id) {
            $before = $wpdb->get_row($wpdb->prepare('SELECT member_id, object, title, status, answer FROM ' . myf_t('defects') . ' WHERE id = %d', $id));
            $wpdb->update(myf_t('defects'), $d, ['id' => $id]);
            if ($before && $before->member_id && ((isset($d['status']) && $d['status'] !== $before->status) || (isset($d['answer']) && $d['answer'] !== (string) $before->answer && $d['answer'] !== ''))) {
                myf_notify([(int) $before->member_id], 'defect', 'Dein Mangel „' . $before->object . ': ' . $before->title . '“: ' . MYF_DEFECT_STATUS[$d['status'] ?? $before->status], (string) ($d['answer'] ?? ''), 'defects');
            }
        } else {
            // Verwaltung trägt selbst einen Mangel ein (z. B. nach Fahrzeugkontrolle)
            $d += ['object' => '', 'urgency' => 'soon', 'status' => 'new'];
            $d['title'] = sanitize_text_field((string) $req->get_param('title'));
            $d['text'] = sanitize_textarea_field((string) $req->get_param('text'));
            if ($d['object'] === '' || $d['title'] === '') return myf_err('Bitte Objekt und Kurzbeschreibung angeben.');
            $d['created'] = current_time('mysql');
            $d['photos'] = '[]';
            $wpdb->insert(myf_t('defects'), $d);
            $id = $wpdb->insert_id;
        }
        return ['id' => $id];
    }]);

    register_rest_route('myf/v1', '/admin/defect/delete', ['methods' => 'POST', 'permission_callback' => 'myf_can_manage', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $id = (int) $req->get_param('id');
        $row = $wpdb->get_row($wpdb->prepare('SELECT photos FROM ' . myf_t('defects') . ' WHERE id = %d', $id));
        if ($row) myf_delete_photos(json_decode((string) $row->photos, true));
        $wpdb->delete(myf_t('defects'), ['id' => $id]);
        return ['ok' => true];
    }]);
});
