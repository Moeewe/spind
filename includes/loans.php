<?php
/**
 * Leihkleidung nach dem Einsatz (Jogginganzüge, Schlappen …): Atemschutz-/Gerätewarte tragen ein, wer was hat.
 * Nur der aktuelle Stand – „zurück“ nimmt den Eintrag heraus (das Änderungsprotokoll hält es trotzdem fest).
 * Bestand je Teil und Größe, daraus „verfügbar“. Mitglieder sehen auf der Startseite, was sie noch zurückgeben müssen.
 */

defined('ABSPATH') || exit;

function myf_install_loans($c) {
    $p = myf_t('');
    dbDelta("CREATE TABLE {$p}loans (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        member_id bigint(20) unsigned NOT NULL,
        item varchar(60) NOT NULL,
        size varchar(20) NOT NULL DEFAULT '',
        qty smallint(5) unsigned NOT NULL DEFAULT 1,
        incident_id bigint(20) unsigned NULL,
        since date NOT NULL,
        by_name varchar(120) NOT NULL DEFAULT '',
        PRIMARY KEY  (id),
        KEY member_id (member_id)
    ) $c;");
}
function myf_loan_items() { $l = myf_settings()['loan_items'] ?? null; return is_array($l) && $l ? array_values($l) : ['Jogginganzug', 'Schlappen', 'T-Shirt', 'Socken']; }
function myf_loan_stock() { $s = myf_settings()['loan_stock'] ?? []; return is_array($s) ? $s : []; }
function myf_loan_can() { return myf_can_manage() || myf_has_area('agt') || myf_has_area('vehicles') || myf_has_area('clothing'); }
function myf_loans_out($where = '1=1', $args = []) {
    global $wpdb;
    $sql = 'SELECT l.*, m.name, i.nr, i.title FROM ' . myf_t('loans') . ' l LEFT JOIN ' . myf_t('members') . ' m ON m.id = l.member_id LEFT JOIN ' . myf_t('incidents') . " i ON i.id = l.incident_id WHERE $where ORDER BY l.since DESC, l.id DESC";
    return array_map(function ($l) { return ['id' => (int) $l->id, 'member_id' => (int) $l->member_id, 'name' => (string) $l->name, 'item' => $l->item, 'size' => $l->size, 'qty' => (int) $l->qty,
        'since' => $l->since, 'incident' => $l->incident_id ? trim(($l->nr ? $l->nr . ' ' : '') . $l->title) : '', 'by' => $l->by_name]; }, $args ? $wpdb->get_results($wpdb->prepare($sql, $args)) : $wpdb->get_results($sql));
}
add_filter('myf_admin_state', function ($d) {
    if (!myf_loan_can()) return $d;
    $d['loans'] = myf_loans_out(); $d['loan_items'] = myf_loan_items(); $d['loan_stock'] = (object) myf_loan_stock(); $d['loan_can'] = true;
    return $d;
});
add_filter('myf_me_data', function ($data, $me) {
    if ($me) $data['my_loans'] = myf_loans_out('l.member_id = %d', [(int) $me->id]);
    return $data;
}, 10, 2);
add_action('rest_api_init', function () {
    $perm = function () { return myf_loan_can() ? true : new WP_Error('myf_right', 'Leihkleidung verwalten Atemschutz-/Gerätewarte und Kleiderkammer.', ['status' => 403]); };
    register_rest_route('myf/v1', '/loan', ['methods' => 'POST', 'permission_callback' => $perm, 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $mid = (int) $req->get_param('member_id'); $item = mb_substr(sanitize_text_field((string) $req->get_param('item')), 0, 60);
        if (!$wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('members') . ' WHERE id = %d', $mid))) return myf_err('Bitte ein Mitglied auswählen.');
        if ($item === '') return myf_err('Bitte das Teil wählen.');
        $wpdb->insert(myf_t('loans'), ['member_id' => $mid, 'item' => $item, 'size' => mb_substr(sanitize_text_field((string) $req->get_param('size')), 0, 20), 'qty' => max(1, min(20, (int) $req->get_param('qty') ?: 1)),
            'incident_id' => (int) $req->get_param('incident_id') ?: null, 'since' => myf_date_or_null($req->get_param('since')) ?: current_time('Y-m-d'), 'by_name' => myf_actor()]);
        $id = (int) $wpdb->insert_id;
        myf_notify([$mid], 'loan', 'Ausgeliehen: ' . $item . ($req->get_param('size') ? ' Gr. ' . sanitize_text_field((string) $req->get_param('size')) : ''), 'Bitte gewaschen zurückgeben.', 'start', 'loan:' . $id);
        return ['id' => $id];
    }]);
    register_rest_route('myf/v1', '/loan/return', ['methods' => 'POST', 'permission_callback' => $perm, 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $ids = array_filter(array_map('intval', (array) ($req->get_param('ids') ?: [$req->get_param('id')])));
        $n = 0; foreach ($ids as $id) { $n += (int) $wpdb->delete(myf_t('loans'), ['id' => $id]); $wpdb->delete(myf_t('notifications'), ['dedupe' => 'loan:' . $id]); }
        return ['returned' => $n];
    }]);
    register_rest_route('myf/v1', '/loan/setup', ['methods' => 'POST', 'permission_callback' => $perm, 'callback' => function (WP_REST_Request $req) {
        $s = myf_settings();
        if (is_array($req->get_param('items'))) $s['loan_items'] = array_values(array_unique(array_filter(array_map(function ($x) { return mb_substr(sanitize_text_field((string) $x), 0, 60); }, $req->get_param('items')))));
        if (is_array($req->get_param('stock'))) { $st = []; foreach ($req->get_param('stock') as $k => $v) { $k = mb_substr(sanitize_text_field((string) $k), 0, 90); if ($k !== '' && (int) $v > 0) $st[$k] = min(999, (int) $v); } $s['loan_stock'] = $st; }
        update_option('myf_settings', $s);
        return ['ok' => true];
    }]);
});
