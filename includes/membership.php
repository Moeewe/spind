<?php
/**
 * Mitgliedschaft: Verlauf (eingetreten, pausiert, zurückgekehrt, ausgetreten, wieder eingetreten) mit Datum und Bemerkung.
 * Der letzte Eintrag bestimmt den Status (aktiv / pausiert / ausgetreten). Beim Austritt: archivieren (alles bleibt,
 * Anmeldung gesperrt, Wiedereintritt jederzeit) oder anonymisieren (Personendaten weg, Einsätze/Statistik bleiben ohne Namen).
 */

defined('ABSPATH') || exit;

const MYF_MKINDS = ['eintritt' => 'eingetreten', 'pause' => 'pausiert', 'rueckkehr' => 'zurückgekehrt (Pause beendet)', 'austritt' => 'ausgetreten', 'wiedereintritt' => 'wieder eingetreten', 'notiz' => 'Notiz'];

function myf_install_membership($c) {
    $p = myf_t('');
    dbDelta("CREATE TABLE {$p}member_history (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        member_id bigint(20) unsigned NOT NULL,
        date date NOT NULL,
        kind varchar(16) NOT NULL,
        note varchar(255) NOT NULL DEFAULT '',
        by_name varchar(120) NOT NULL DEFAULT '',
        created datetime NOT NULL,
        PRIMARY KEY  (id),
        KEY member_id (member_id)
    ) $c;");
}
function myf_member_history($id) {
    global $wpdb;
    return array_map(function ($h) { return ['id' => (int) $h->id, 'date' => $h->date, 'kind' => $h->kind, 'label' => MYF_MKINDS[$h->kind] ?? $h->kind, 'note' => $h->note, 'by' => $h->by_name]; },
        $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . myf_t('member_history') . ' WHERE member_id = %d ORDER BY date, id', $id)));
}
// Status aus dem Verlauf ableiten und am Mitglied setzen; Anmeldung bei Austritt sperren, bei Wiedereintritt wieder erlauben
function myf_member_status_sync($id) {
    global $wpdb;
    $last = $wpdb->get_row($wpdb->prepare('SELECT kind, date FROM ' . myf_t('member_history') . " WHERE member_id = %d AND kind <> 'notiz' ORDER BY date DESC, id DESC LIMIT 1", $id));
    $first = $wpdb->get_var($wpdb->prepare('SELECT MIN(date) FROM ' . myf_t('member_history') . " WHERE member_id = %d AND kind IN ('eintritt','wiedereintritt')", $id));
    if (!$last) return;
    $st = $last->kind === 'pause' ? 'pausiert' : ($last->kind === 'austritt' ? 'ausgetreten' : 'aktiv');
    $upd = ['mstatus' => $st, 'active' => $st === 'aktiv' ? 1 : 0];
    $m = $wpdb->get_row($wpdb->prepare('SELECT joined, user_id FROM ' . myf_t('members') . ' WHERE id = %d', $id));
    if ($first && (!$m->joined || $first < $m->joined)) $upd['joined'] = $first;
    $wpdb->update(myf_t('members'), $upd, ['id' => $id]);
    if ($m && $m->user_id && ($u = get_userdata((int) $m->user_id)) && myf_is_member_only($u)) {
        if ($st === 'ausgetreten') { update_user_meta($u->ID, 'myf_locked', 1); if (class_exists('WP_Session_Tokens')) WP_Session_Tokens::get_instance($u->ID)->destroy_all(); }
        else delete_user_meta($u->ID, 'myf_locked');
    }
}
// Gesperrte (ausgetretene) Mitglieder können sich nicht mehr anmelden – Daten bleiben archiviert
add_filter('authenticate', function ($user) {
    if ($user instanceof WP_User && get_user_meta($user->ID, 'myf_locked', true)) return new WP_Error('myf_locked', 'Dieses Konto ist nach dem Austritt gesperrt. Bei Wiedereintritt bitte bei der Wehrführung melden.');
    return $user;
}, 99);

add_action('rest_api_init', function () {
    $ns = 'myf/v1';
    register_rest_route($ns, '/admin/member/history', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $id = (int) $req->get_param('id'); $kind = (string) $req->get_param('kind');
        if (!$wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('members') . ' WHERE id = %d', $id))) return myf_err('Mitglied nicht gefunden.', 404);
        if (!isset(MYF_MKINDS[$kind])) return myf_err('Bitte die Art wählen.');
        $date = myf_date_or_null($req->get_param('date')); if (!$date) return myf_err('Bitte ein Datum angeben.');
        $wpdb->insert(myf_t('member_history'), ['member_id' => $id, 'date' => $date, 'kind' => $kind, 'note' => mb_substr(sanitize_text_field((string) $req->get_param('note')), 0, 255), 'by_name' => myf_actor(), 'created' => current_time('mysql')]);
        $hid = (int) $wpdb->insert_id;
        myf_member_status_sync($id);
        return ['id' => $id, 'history_id' => $hid];
    }]);
    register_rest_route($ns, '/admin/member/history/delete', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $hid = (int) $req->get_param('history_id');
        $mid = (int) $wpdb->get_var($wpdb->prepare('SELECT member_id FROM ' . myf_t('member_history') . ' WHERE id = %d', $hid));
        if (!$mid) return myf_err('Eintrag nicht gefunden.', 404);
        $wpdb->delete(myf_t('member_history'), ['id' => $hid]);
        myf_member_status_sync($mid);
        return ['id' => $mid];
    }]);
    // Anonymisieren („alles löschen“): Personendaten weg, Einsatzbeteiligung und Statistik bleiben ohne Namen
    register_rest_route($ns, '/admin/member/anonymize', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $id = (int) $req->get_param('id');
        $m = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('members') . ' WHERE id = %d', $id));
        if (!$m) return myf_err('Mitglied nicht gefunden.', 404);
        if ($req->get_param('confirm') !== 'ANONYMISIEREN') return myf_err('Zur Sicherheit bitte ANONYMISIEREN eintippen.');
        foreach (['needs', 'clothing', 'cloth_stock', 'member_traits', 'briefing_acks', 'drill_absence', 'notifications', 'loans', 'messages', 'board_rsvp', 'duty_assign', 'order_items'] as $t) {
            if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', myf_t($t)))) $wpdb->delete(myf_t($t), ['member_id' => $id]);
        }
        $wpdb->update(myf_t('ideas'), ['member_id' => null], ['member_id' => $id]);
        $wpdb->update(myf_t('defects'), ['member_id' => null], ['member_id' => $id]);
        foreach (['team_tasks', 'devices', 'lockers'] as $t) if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', myf_t($t)))) $wpdb->update(myf_t($t), ['member_id' => null], ['member_id' => $id]);
        $wpdb->update(myf_t('bookings'), ['driver' => ''], ['member_id' => $id]);
        $wpdb->update(myf_t('members'), ['name' => 'Ehemaliges Mitglied #' . $id, 'user_id' => null, 'active' => 0, 'mstatus' => 'ausgetreten', 'sizes' => null, 'note' => '', 'birth_date' => null,
            'birth_place' => '', 'street' => '', 'phone' => '', 'ics_ver' => '', 'can_notice' => 0, 'g26_until' => null], ['id' => $id]);
        $wpdb->update(myf_t('member_history'), ['note' => ''], ['member_id' => $id]);
        $wpdb->insert(myf_t('member_history'), ['member_id' => $id, 'date' => current_time('Y-m-d'), 'kind' => 'notiz', 'note' => 'anonymisiert auf Wunsch', 'by_name' => myf_actor(), 'created' => current_time('mysql')]);
        $u = $m->user_id ? get_userdata((int) $m->user_id) : null;
        if ($u && myf_is_member_only($u)) { require_once ABSPATH . 'wp-admin/includes/user.php'; wp_delete_user($u->ID); }
        return ['id' => $id, 'ok' => true];
    }]);
});
