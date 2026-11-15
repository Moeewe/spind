<?php
/**
 * Teams (z. B. IT & Technik, Medienteam): eigene Bereiche mit Aufgaben, Inventar/Prüfungen (Werkstatt) und Nachrichten.
 * Mitglieder kommen über die Funktion „Team …“ ins Team. Dazu: Prüffristen der Werkstätten und Übungsstrecke (Dienstpläne je Bereich).
 */

defined('ABSPATH') || exit;

const MYF_TASK_STATUS = ['open' => 'offen', 'progress' => 'in Arbeit', 'done' => 'erledigt'];

function myf_install_teamwork($c) {
    global $wpdb;
    $p = myf_t(''); // echte oder Demo-Tabellen (Demo-Modus)
    dbDelta("CREATE TABLE {$p}team_tasks (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        area varchar(30) NOT NULL,
        title varchar(160) NOT NULL,
        text text NULL,
        status varchar(10) NOT NULL DEFAULT 'open',
        prio tinyint(1) NOT NULL DEFAULT 0,
        due date NULL,
        member_id bigint(20) unsigned NULL,
        source varchar(40) NOT NULL DEFAULT '',
        created_by varchar(120) NOT NULL DEFAULT '',
        created datetime NOT NULL,
        done_at datetime NULL,
        PRIMARY KEY  (id),
        KEY area (area)
    ) $c;");
}

function myf_task_out($t) {
    return ['id' => (int) $t->id, 'area' => $t->area, 'title' => $t->title, 'text' => (string) $t->text, 'status' => $t->status, 'prio' => (bool) $t->prio,
        'due' => $t->due, 'member_id' => $t->member_id ? (int) $t->member_id : null, 'source' => $t->source, 'created_by' => $t->created_by, 'created' => $t->created, 'done_at' => $t->done_at];
}
function myf_team_areas_mine() {
    return array_values(array_filter(array_map(function ($t) { return 'team_' . $t['key']; }, myf_teams()), 'myf_has_area'));
}

// Mängel an ein Team weiterleiten (z. B. „IT / Technik“ → Team IT): wird dort automatisch eine Aufgabe
add_action('myf_defect_created', function ($id, $object, $title, $text, $me) {
    global $wpdb;
    $route = (array) (myf_settings()['defect_routes'] ?? []);
    $area = $route[$object] ?? '';
    if (!$area || !myf_team($area)) return;
    $wpdb->insert(myf_t('team_tasks'), ['area' => $area, 'title' => 'Mangel: ' . $object . ' – ' . $title, 'text' => $text, 'status' => 'open', 'prio' => 0,
        'source' => 'defect:' . (int) $id, 'created_by' => $me->name, 'created' => current_time('mysql')]);
    myf_notify_area($area, 'defect', 'Neuer Mangel für ' . myf_team($area)['name'] . ': ' . $title, 'gemeldet von ' . $me->name, 'admin:team:' . $area);
}, 10, 5);

add_filter('myf_admin_state', function ($d) {
    global $wpdb;
    if (!function_exists('myf_has_area')) return $d;
    $mine = myf_team_areas_mine();
    $d['team_areas'] = $mine;
    $d['task_status'] = MYF_TASK_STATUS;
    $d['team_tasks'] = $mine ? array_map('myf_task_out', $wpdb->get_results('SELECT * FROM ' . myf_t('team_tasks') . " WHERE area IN ('" . implode("','", array_map('esc_sql', $mine)) . "') AND (status <> 'done' OR done_at > '" . esc_sql(date('Y-m-d', current_time('timestamp') - 120 * DAY_IN_SECONDS)) . "') ORDER BY status = 'done', prio DESC, due IS NULL, due, id DESC")) : [];
    if (myf_can_manage()) $d['defect_routes'] = (object) (myf_settings()['defect_routes'] ?? []);
    // Wer gehört zu welchem Team (über die Funktion „Team …“) – nur für die eigenen Teams
    $d['team_members'] = new stdClass();
    foreach ($mine as $area) {
        $t = myf_team($area); if (!$t) continue;
        $tid = myf_team_trait($t);
        $d['team_members']->$area = array_map('intval', $wpdb->get_col($wpdb->prepare('SELECT mt.member_id FROM ' . myf_t('member_traits') . ' mt JOIN ' . myf_t('members') . ' m ON m.id = mt.member_id WHERE mt.trait_id = %d AND m.active = 1', $tid)));
    }
    return $d;
}, 22);

// Jugendfeuerwehr als Team ergänzen (einmalig, auch in bestehenden Installationen)
add_action('init', function () {
    if (get_option('myf_team_jf') || !function_exists('myf_teams') || (string) get_option('myf_db_version') !== MYF_DB_VERSION) return;
    update_option('myf_team_jf', 1, false);
    $teams = myf_teams();
    foreach ($teams as $t) if (preg_match('/jugend/i', $t['name'])) return;
    $jf = ['key' => 'jugend', 'name' => 'Jugendfeuerwehr', 'desc' => 'Jugendgruppe, Betreuer, Dienste, Ausflüge'];
    $jf['trait_id'] = myf_team_trait($jf);
    $teams[] = $jf;
    $s = get_option('myf_settings', []); $s = is_array($s) ? $s : []; $s['teams'] = $teams;
    update_option('myf_settings', $s);
}, 40);

function myf_clean_rules($in) {
    $out = [];
    foreach ((array) $in as $t) {
        $label = mb_substr(sanitize_text_field((string) ($t['label'] ?? '')), 0, 80);
        if ($label === '') continue;
        $key = sanitize_key((string) ($t['key'] ?? '')) ?: substr(sanitize_key(remove_accents($label)), 0, 16) ?: 'typ';
        while (isset($out[$key])) $key .= '2';
        $kinds = [];
        foreach ((array) ($t['kinds'] ?? []) as $k) {
            $kl = mb_substr(sanitize_text_field((string) ($k['label'] ?? '')), 0, 120);
            if ($kl === '') continue;
            $kk = sanitize_key((string) ($k['key'] ?? '')) ?: substr(sanitize_key(remove_accents($kl)), 0, 16) ?: 'pruef';
            while (isset($kinds[$kk])) $kk .= '2';
            $kinds[$kk] = [$kl, max(0, min(240, (int) ($k['months'] ?? 0)))];
        }
        if ($kinds) $out[$key] = ['label' => $label, 'kinds' => $kinds];
    }
    return $out;
}

add_action('rest_api_init', function () {
    $ns = 'myf/v1';
    // Aufgaben eines Teams
    // Person einem Team zuordnen oder herausnehmen (setzt die Funktion „Team …“) – Hauptverwaltung oder das Team selbst
    register_rest_route($ns, '/admin/team/member', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $area = (string) $req->get_param('area'); $t = myf_team($area); $mid = (int) $req->get_param('member_id');
        if (!$t || !(myf_can_manage() || myf_has_area($area))) return myf_err('Dieses Team gehört nicht zu deinen Bereichen.', 403);
        if (!$wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('members') . ' WHERE id = %d', $mid))) return myf_err('Mitglied nicht gefunden.', 404);
        $tid = myf_team_trait($t);
        if ($req->get_param('on')) $wpdb->query($wpdb->prepare('INSERT IGNORE INTO ' . myf_t('member_traits') . ' (member_id, trait_id) VALUES (%d, %d)', $mid, $tid));
        else $wpdb->delete(myf_t('member_traits'), ['member_id' => $mid, 'trait_id' => $tid]);
        return ['ok' => true];
    }]);
    register_rest_route($ns, '/admin/team/task', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $id = (int) $req->get_param('id');
        $area = $id ? (string) $wpdb->get_var($wpdb->prepare('SELECT area FROM ' . myf_t('team_tasks') . ' WHERE id = %d', $id)) : (string) $req->get_param('area');
        if (!myf_team($area) || !myf_has_area($area)) return myf_err('Dieses Team gehört nicht zu deinen Bereichen.', 403);
        if ($req->get_param('delete')) { $wpdb->delete(myf_t('team_tasks'), ['id' => $id]); return ['ok' => true]; }
        $d = [];
        if ($req->has_param('title')) $d['title'] = mb_substr(sanitize_text_field((string) $req->get_param('title')), 0, 160);
        if ($req->has_param('text')) $d['text'] = sanitize_textarea_field((string) $req->get_param('text'));
        if ($req->has_param('due')) $d['due'] = myf_date_or_null($req->get_param('due'));
        if ($req->has_param('prio')) $d['prio'] = $req->get_param('prio') ? 1 : 0;
        if ($req->has_param('member_id')) $d['member_id'] = (int) $req->get_param('member_id') ?: null;
        if ($req->has_param('status') && isset(MYF_TASK_STATUS[$req->get_param('status')])) {
            $d['status'] = $req->get_param('status');
            $d['done_at'] = $d['status'] === 'done' ? current_time('mysql') : null;
        }
        if ($id) {
            $old = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('team_tasks') . ' WHERE id = %d', $id));
            $wpdb->update(myf_t('team_tasks'), $d, ['id' => $id]);
            if (!empty($d['member_id']) && (int) $old->member_id !== (int) $d['member_id']) myf_notify([$d['member_id']], 'task', 'Aufgabe für dich: ' . $old->title, myf_team($area)['name'], 'admin:team:' . $area);
            return ['id' => $id];
        }
        if (empty($d['title'])) return myf_err('Bitte einen Titel angeben.');
        $wpdb->insert(myf_t('team_tasks'), $d + ['area' => $area, 'status' => 'open', 'created_by' => myf_actor(), 'created' => current_time('mysql')]);
        $nid = (int) $wpdb->insert_id;
        if (!empty($d['member_id'])) myf_notify([$d['member_id']], 'task', 'Aufgabe für dich: ' . $d['title'], myf_team($area)['name'], 'admin:team:' . $area);
        return ['id' => $nid];
    }]);
    // Teams anlegen/umbenennen (nur Verwaltung)
    register_rest_route($ns, '/admin/teams', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $old = [];
        foreach (myf_teams() as $t) $old[$t['key']] = $t;
        $new = [];
        foreach ((array) $req->get_param('teams') as $t) {
            $name = mb_substr(sanitize_text_field((string) ($t['name'] ?? '')), 0, 60);
            if ($name === '') continue;
            $key = sanitize_key((string) ($t['key'] ?? '')) ?: substr(str_replace('-', '', sanitize_title($name)), 0, 16) ?: 'team';
            if (!isset($old[$key])) while (isset($new[$key]) || isset($old[$key])) $key .= '2';
            $row = ['key' => $key, 'name' => $name, 'desc' => mb_substr(sanitize_text_field((string) ($t['desc'] ?? '')), 0, 160), 'trait_id' => (int) ($old[$key]['trait_id'] ?? 0)];
            $row['trait_id'] = myf_team_trait($row);
            $new[$key] = $row;
        }
        foreach ($old as $k => $t) {
            if (isset($new[$k])) continue;
            $busy = (int) $wpdb->get_var($wpdb->prepare('SELECT COUNT(*) FROM ' . myf_t('team_tasks') . " WHERE area = %s AND status <> 'done'", 'team_' . $k))
                + (int) $wpdb->get_var($wpdb->prepare('SELECT COUNT(*) FROM ' . myf_t('devices') . " WHERE area = %s AND status <> 'retired'", 'team_' . $k));
            if ($busy) return myf_err('„' . $t['name'] . '“ hat noch offene Aufgaben oder Inventar – bitte erst erledigen bzw. aussondern.');
        }
        $s = myf_settings();
        $s['teams'] = array_values($new);
        if (is_array($req->get_param('defect_routes'))) {
            $s['defect_routes'] = [];
            foreach ($req->get_param('defect_routes') as $obj => $area) if ($area && isset($new[preg_replace('/^team_/', '', (string) $area)])) $s['defect_routes'][sanitize_text_field((string) $obj)] = (string) $area;
        }
        update_option('myf_settings', $s);
        return ['ok' => true];
    }]);
    // Prüffristen einer Werkstatt (Gerätewarte, Teams); Atemschutz behält die DGUV-Fristen unter „as_rules“
    register_rest_route($ns, '/admin/wsrules', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $area = (string) $req->get_param('area');
        if (!in_array($area, myf_ws_areas(), true) || !myf_has_area($area)) return myf_err('Diese Werkstatt gehört nicht zu deinen Bereichen.', 403);
        $s = myf_settings();
        // Atemschutz speichert unter „as_rules“ (Vorgabe DGUV Regel 112-190), alle anderen unter ws_rules
        if ($req->get_param('reset')) { if ($area === 'agt') $s['as_rules'] = null; else unset($s['ws_rules'][$area]); update_option('myf_settings', $s); return ['ok' => true]; }
        $rules = myf_clean_rules($req->get_param('rules'));
        if (!$rules) return myf_err('Bitte mindestens eine Geräteart mit einer Prüfung angeben.');
        $used = $wpdb->get_col($wpdb->prepare('SELECT DISTINCT type FROM ' . myf_t('devices') . ' WHERE area = %s', $area));
        foreach ($used as $u) if (!isset($rules[$u])) return myf_err('Die Geräteart „' . (myf_ws_rules($area)[$u]['label'] ?? $u) . '“ hat noch Geräte und kann nicht entfernt werden.');
        if ($area === 'agt') $s['as_rules'] = $rules; else $s['ws_rules'][$area] = $rules;
        update_option('myf_settings', $s);
        return ['ok' => true];
    }]);
});
