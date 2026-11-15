<?php
/**
 * Spinde und Spindschlüssel: welcher Spind wem gehört, ob (und wie viele) Schlüssel ausgegeben sind – mit Verlauf jeder
 * Zuweisung, Übergabe, Schlüsselausgabe und -rückgabe. Verwaltet von der Kleiderkammer; das Mitglied sieht „Mein Spind“.
 */

defined('ABSPATH') || exit;

const MYF_LOCKER_KEY = ['none' => 'kein Schlüssel ausgegeben', 'issued' => 'Schlüssel beim Mitglied', 'box' => 'Schlüssel im Schlüsselkasten', 'nolock' => 'ohne Schloss', 'lost' => 'Schlüssel verloren'];

function myf_install_lockers($c) {
    $p = myf_t('');
    dbDelta("CREATE TABLE {$p}lockers (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        nr varchar(20) NOT NULL,
        location varchar(60) NOT NULL DEFAULT '',
        member_id bigint(20) unsigned NULL,
        key_status varchar(10) NOT NULL DEFAULT 'none',
        key_count tinyint(3) unsigned NOT NULL DEFAULT 0,
        since date NULL,
        note varchar(255) NOT NULL DEFAULT '',
        PRIMARY KEY  (id),
        KEY member_id (member_id)
    ) $c;");
    dbDelta("CREATE TABLE {$p}locker_log (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        locker_id bigint(20) unsigned NOT NULL,
        date date NOT NULL,
        what varchar(40) NOT NULL,
        member_id bigint(20) unsigned NULL,
        note varchar(255) NOT NULL DEFAULT '',
        by_name varchar(120) NOT NULL DEFAULT '',
        created datetime NOT NULL,
        PRIMARY KEY  (id),
        KEY locker_id (locker_id)
    ) $c;");
}
function myf_locker_can() { return myf_can_manage() || myf_has_area('clothing') || myf_has_area('members'); }
function myf_locker_log($lid, $what, $mid, $note = '') {
    global $wpdb;
    $wpdb->insert(myf_t('locker_log'), ['locker_id' => $lid, 'date' => current_time('Y-m-d'), 'what' => mb_substr($what, 0, 40), 'member_id' => $mid ?: null, 'note' => mb_substr((string) $note, 0, 255), 'by_name' => myf_actor(), 'created' => current_time('mysql')]);
}
function myf_lockers_out($where = '1=1', $args = []) {
    global $wpdb;
    $sql = 'SELECT l.*, m.name FROM ' . myf_t('lockers') . ' l LEFT JOIN ' . myf_t('members') . " m ON m.id = l.member_id WHERE $where ORDER BY l.location, LENGTH(l.nr), l.nr";
    $rows = $args ? $wpdb->get_results($wpdb->prepare($sql, $args)) : $wpdb->get_results($sql);
    $ids = array_map(function ($r) { return (int) $r->id; }, $rows) ?: [0];
    $log = [];
    foreach ($wpdb->get_results('SELECT g.*, m.name FROM ' . myf_t('locker_log') . ' g LEFT JOIN ' . myf_t('members') . ' m ON m.id = g.member_id WHERE g.locker_id IN (' . implode(',', $ids) . ') ORDER BY g.created DESC, g.id DESC') as $g)
        $log[(int) $g->locker_id][] = ['date' => $g->date, 'what' => $g->what, 'name' => (string) $g->name, 'note' => $g->note, 'by' => $g->by_name];
    return array_map(function ($r) use ($log) {
        return ['id' => (int) $r->id, 'nr' => $r->nr, 'location' => $r->location, 'member_id' => $r->member_id ? (int) $r->member_id : null, 'name' => (string) $r->name,
            'key' => $r->key_status, 'keys' => (int) $r->key_count, 'since' => $r->since, 'note' => $r->note, 'log' => array_slice($log[(int) $r->id] ?? [], 0, 20)];
    }, $rows);
}
add_filter('myf_admin_state', function ($d) {
    if (!myf_locker_can()) return $d;
    $d['lockers'] = myf_lockers_out(); $d['locker_keys'] = MYF_LOCKER_KEY;
    return $d;
}, 46);
add_filter('myf_me_data', function ($data, $me) {
    if ($me) $data['my_locker'] = array_map(function ($l) { unset($l['log']); return $l; }, myf_lockers_out('l.member_id = %d', [(int) $me->id]));
    $data['locker_keys'] = MYF_LOCKER_KEY;
    return $data;
}, 46, 2);

add_action('rest_api_init', function () {
    register_rest_route('myf/v1', '/admin/locker', ['methods' => 'POST', 'permission_callback' => function () { return is_user_logged_in() && myf_locker_can(); }, 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $t = myf_t('lockers');
        // Viele auf einmal anlegen: „1-40“ oder „1-20, A1-A6“
        if ($req->get_param('bulk') !== null) {
            $loc = mb_substr(sanitize_text_field((string) $req->get_param('location')), 0, 60); $n = 0;
            foreach (preg_split('/\s*[,;]\s*/', (string) $req->get_param('bulk')) as $part) {
                if (preg_match('/^([A-Za-z]*)(\d+)\s*-\s*\1?(\d+)$/', trim($part), $m)) { for ($i = (int) $m[2]; $i <= min((int) $m[3], (int) $m[2] + 300); $i++) $nrs[] = $m[1] . $i; }
                elseif (trim($part) !== '') $nrs[] = mb_substr(trim($part), 0, 20);
            }
            foreach ($nrs ?? [] as $nr) {
                if ($wpdb->get_var($wpdb->prepare("SELECT id FROM $t WHERE nr = %s AND location = %s", $nr, $loc))) continue;
                $wpdb->insert($t, ['nr' => $nr, 'location' => $loc]); $n++;
            }
            return ['created' => $n];
        }
        $id = (int) $req->get_param('id');
        $l = $wpdb->get_row($wpdb->prepare("SELECT * FROM $t WHERE id = %d", $id));
        if (!$l) return myf_err('Spind nicht gefunden.', 404);
        $note = mb_substr(sanitize_text_field((string) $req->get_param('note')), 0, 255);
        $act = (string) $req->get_param('do');
        if ($act === 'delete') {
            if ($l->member_id) return myf_err('Der Spind ist noch vergeben – erst freigeben.');
            $wpdb->delete($t, ['id' => $id]); $wpdb->delete(myf_t('locker_log'), ['locker_id' => $id]);
            return ['ok' => true];
        }
        if ($act === 'assign') {
            // Zuweisen bzw. übertragen: der bisherige Inhaber wird im Verlauf vermerkt, Schlüssel gehen mit oder nicht
            $mid = (int) $req->get_param('member_id');
            if (!$mid || !$wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('members') . ' WHERE id = %d', $mid))) return myf_err('Bitte ein Mitglied auswählen.');
            if ($other = $wpdb->get_var($wpdb->prepare("SELECT nr FROM $t WHERE member_id = %d AND id <> %d", $mid, $id))) $note = trim($note . ' · hat außerdem Spind ' . $other, ' ·');
            $keyWith = (string) $req->get_param('key');
            $key = isset(MYF_LOCKER_KEY[$keyWith]) ? $keyWith : ($l->key_status === 'issued' ? 'none' : $l->key_status);
            if ($l->member_id && (int) $l->member_id !== $mid) myf_locker_log($id, 'abgegeben', (int) $l->member_id, $l->key_status === 'issued' ? ($key === 'issued' ? 'Schlüssel direkt übergeben' : 'Schlüssel zurück?') : '');
            $wpdb->update($t, ['member_id' => $mid, 'key_status' => $key, 'key_count' => $key === 'issued' ? max(1, (int) $req->get_param('keys') ?: (int) $l->key_count ?: 1) : 0, 'since' => current_time('Y-m-d')], ['id' => $id]);
            myf_locker_log($id, $l->member_id && (int) $l->member_id !== $mid ? 'übertragen' : 'zugewiesen', $mid, trim(MYF_LOCKER_KEY[$key] . ($note ? ' · ' . $note : '')));
            return ['id' => $id];
        }
        if ($act === 'key') {
            $key = (string) $req->get_param('key');
            if (!isset(MYF_LOCKER_KEY[$key])) return myf_err('Unbekannter Schlüssel-Stand.');
            $keys = $key === 'issued' ? max(1, min(5, (int) $req->get_param('keys') ?: 1)) : 0;
            $wpdb->update($t, ['key_status' => $key, 'key_count' => $keys], ['id' => $id]);
            myf_locker_log($id, ['issued' => 'Schlüssel ausgegeben', 'none' => 'Schlüssel zurück', 'box' => 'Schlüssel in den Kasten', 'nolock' => 'ohne Schloss', 'lost' => 'Schlüssel verloren'][$key] . ($keys > 1 ? ' (' . $keys . ')' : ''), $l->member_id ? (int) $l->member_id : 0, $note);
            return ['id' => $id];
        }
        if ($act === 'free') {
            myf_locker_log($id, 'freigegeben', $l->member_id ? (int) $l->member_id : 0, ($l->key_status === 'issued' ? 'Schlüssel noch beim Mitglied! ' : '') . $note);
            $wpdb->update($t, ['member_id' => null, 'since' => null, 'key_status' => $l->key_status === 'issued' ? 'lost' : $l->key_status, 'key_count' => 0], ['id' => $id]);
            return ['id' => $id];
        }
        if ($act === 'edit') {
            $wpdb->update($t, ['nr' => mb_substr(sanitize_text_field((string) $req->get_param('nr')), 0, 20) ?: $l->nr, 'location' => mb_substr(sanitize_text_field((string) $req->get_param('location')), 0, 60), 'note' => $note], ['id' => $id]);
            return ['id' => $id];
        }
        return myf_err('Unbekannte Aktion.');
    }]);
});
