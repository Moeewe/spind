<?php
/**
 * Hinweise für das Dashboard (z. B. „HLF in der Werkstatt“, „Erste-Hilfe-Tasche liegt im LF in G3“).
 * Schreiben dürfen die Verwaltung und Mitglieder mit dem Recht „Hinweise schreiben“ (z. B. Gerätewarte, LZ-Führung).
 */

defined('ABSPATH') || exit;

const MYF_NOTICE_LEVELS = ['info' => 'Info', 'warn' => 'Wichtig', 'alert' => 'Achtung'];

function myf_install_notices($c) {
    global $wpdb;
    $p = myf_t(''); // echte oder Demo-Tabellen (Demo-Modus)
    dbDelta("CREATE TABLE {$p}notices (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        text varchar(300) NOT NULL,
        level varchar(10) NOT NULL DEFAULT 'info',
        starts datetime NULL,
        ends datetime NULL,
        author_member_id bigint(20) unsigned NULL,
        author_name varchar(120) NOT NULL DEFAULT '',
        created datetime NOT NULL,
        updated datetime NULL,
        updated_by varchar(120) NOT NULL DEFAULT '',
        signature varchar(120) NOT NULL DEFAULT '',
        PRIMARY KEY  (id),
        KEY ends (ends)
    ) $c;");
}

function myf_notice_out($n) {
    return ['id' => (int) $n->id, 'text' => $n->text, 'level' => $n->level, 'starts' => $n->starts, 'ends' => $n->ends,
        'author' => $n->author_name, 'created' => $n->created, 'updated' => $n->updated, 'updated_by' => $n->updated_by, 'signature' => (string) ($n->signature ?? '')];
}

// Aktuelle und geplante Hinweise (abgelaufene nur die letzten 30 Tage, zum Wiederverwenden)
function myf_notices($withPast = false) {
    global $wpdb;
    $now = current_time('mysql');
    $where = $withPast ? $wpdb->prepare('ends IS NULL OR ends > %s', date('Y-m-d H:i:s', strtotime($now) - 30 * DAY_IN_SECONDS)) : $wpdb->prepare('ends IS NULL OR ends > %s', $now);
    return array_map('myf_notice_out', $wpdb->get_results('SELECT * FROM ' . myf_t('notices') . " WHERE $where ORDER BY FIELD(level, 'alert', 'warn', 'info'), created DESC"));
}

// Für das Dashboard: nur was jetzt gilt, ohne Namen
function myf_notices_now() {
    $now = current_time('mysql');
    return array_values(array_map(function ($n) { return ['text' => $n['text'], 'level' => $n['level'], 'ends' => $n['ends'], 'signature' => $n['signature']]; },
        array_filter(myf_notices(), function ($n) use ($now) { return !$n['starts'] || $n['starts'] <= $now; })));
}

function myf_can_write_notices() {
    return myf_can_manage() || (myf_me() && myf_member_can('notices'));
}

function myf_dt_or_null($v) {
    $v = str_replace('T', ' ', trim((string) $v));
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $v)) $v .= ' 00:00:00';
    if (preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/', $v)) $v .= ':00';
    return preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', $v) ? $v : null;
}

// Anlegen / ändern / beenden – gemeinsam für Mitglieder mit Recht und Verwaltung
function myf_notice_save(WP_REST_Request $req) {
    global $wpdb;
    $me = myf_me();
    $who = $me ? $me->name : wp_get_current_user()->display_name;
    $id = (int) $req->get_param('id');
    if ($req->get_param('end')) {
        $wpdb->update(myf_t('notices'), ['ends' => current_time('mysql'), 'updated' => current_time('mysql'), 'updated_by' => $who], ['id' => $id]);
        return ['id' => $id];
    }
    $text = sanitize_text_field((string) $req->get_param('text'));
    if ($text === '') return myf_err('Bitte einen Hinweistext eingeben.');
    $d = ['text' => mb_substr($text, 0, 300), 'level' => isset(MYF_NOTICE_LEVELS[$req->get_param('level')]) ? $req->get_param('level') : 'info',
        'starts' => myf_dt_or_null($req->get_param('starts')), 'ends' => myf_dt_or_null($req->get_param('ends'))];
    if ($d['ends'] && $d['starts'] && $d['ends'] <= $d['starts']) return myf_err('„Bis“ muss nach „Ab“ liegen.');
    // Absender sichtbar machen: keiner, Name oder Funktion (z. B. „Gerätewart“)
    $sig = (string) $req->get_param('sig');
    if ($req->has_param('sig')) $d['signature'] = $sig === 'name' ? $who : ($sig === 'role' ? myf_my_role($me) : ($sig === 'custom' ? mb_substr(sanitize_text_field((string) $req->get_param('sig_text')), 0, 120) : ''));
    if ($id) {
        if (!$wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('notices') . ' WHERE id = %d', $id))) return myf_err('Hinweis nicht gefunden.', 404);
        $wpdb->update(myf_t('notices'), $d + ['updated' => current_time('mysql'), 'updated_by' => $who], ['id' => $id]);
    } else {
        $wpdb->insert(myf_t('notices'), $d + ['author_member_id' => $me ? $me->id : null, 'author_name' => $who, 'created' => current_time('mysql')]);
        $id = (int) $wpdb->insert_id;
    }
    return ['id' => $id];
}

add_filter('myf_me_data', function ($data, $me) {
    $data['notices_now'] = myf_notices_now();
    $data['can_notice'] = myf_can_write_notices();
    if ($data['can_notice']) { $data['notices'] = myf_notices(true); $data['notice_levels'] = MYF_NOTICE_LEVELS; }
    return $data;
}, 10, 2);

add_filter('myf_admin_state', function ($data) {
    $data['notices'] = myf_notices(true);
    $data['notice_levels'] = MYF_NOTICE_LEVELS;
    return $data;
});

add_action('rest_api_init', function () {
    $ns = 'myf/v1';
    register_rest_route($ns, '/me/notice', ['methods' => 'POST', 'callback' => 'myf_notice_save',
        'permission_callback' => function () { return myf_member_permission() === true && myf_can_write_notices(); }]);
    register_rest_route($ns, '/admin/notice', ['methods' => 'POST', 'permission_callback' => 'myf_can_manage', 'callback' => 'myf_notice_save']);
    register_rest_route($ns, '/admin/notice/delete', ['methods' => 'POST', 'permission_callback' => 'myf_can_manage', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $wpdb->delete(myf_t('notices'), ['id' => (int) $req->get_param('id')]);
        return ['ok' => true];
    }]);
    // Recht „Hinweise schreiben“ für ein Mitglied
    register_rest_route($ns, '/admin/member/noticeright', ['methods' => 'POST', 'permission_callback' => 'myf_can_manage', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $id = (int) $req->get_param('id');
        $wpdb->update(myf_t('members'), ['can_notice' => $req->get_param('on') ? 1 : 0], ['id' => $id]);
        return ['id' => $id];
    }]);
});

// Funktion des angemeldeten Mitglieds (erste Funktion, z. B. „Gerätewart“) – für die Unterschrift unter Hinweisen
function myf_my_role($me) {
    global $wpdb;
    if (!$me) return myf_can_manage() ? 'Wehrführung' : '';
    $r = $wpdb->get_var($wpdb->prepare('SELECT t.name FROM ' . myf_t('member_traits') . ' mt JOIN ' . myf_t('traits') . " t ON t.id = mt.trait_id WHERE mt.member_id = %d AND t.cat = 'funktion' ORDER BY t.sort LIMIT 1", $me->id));
    return (string) $r;
}
add_filter('myf_me_data', function ($data, $me) { $data['my_role'] = myf_my_role($me); return $data; }, 10, 2);
