<?php
/**
 * Dienstpläne (z. B. Grünanlagen-Pflege, Hecke schneiden, Brandsicherheitswachen): Listen mit Terminen und Plätzen.
 * Mitglieder sehen „Meine Dienste“, tragen sich – wenn erlaubt – selbst in freie Plätze ein und bekommen am Vortag
 * eine Erinnerung. Dazu Aushänge/Einladungen (PDF oder Bild) mit Zu-/Absage.
 */

defined('ABSPATH') || exit;

function myf_install_duties($c) {
    global $wpdb;
    $p = myf_t(''); // echte oder Demo-Tabellen (Demo-Modus)
    dbDelta("CREATE TABLE {$p}duty_lists (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        title varchar(120) NOT NULL,
        area varchar(30) NOT NULL DEFAULT 'duties',
        note text NULL,
        self_signup tinyint(1) NOT NULL DEFAULT 1,
        active tinyint(1) NOT NULL DEFAULT 1,
        created datetime NOT NULL,
        PRIMARY KEY  (id)
    ) $c;");
    dbDelta("CREATE TABLE {$p}duty_slots (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        list_id bigint(20) unsigned NOT NULL,
        date date NULL,
        label varchar(60) NOT NULL DEFAULT '',
        time_from varchar(5) NOT NULL DEFAULT '',
        capacity tinyint(3) unsigned NOT NULL DEFAULT 3,
        min_people tinyint(3) unsigned NOT NULL DEFAULT 0,
        note varchar(200) NOT NULL DEFAULT '',
        PRIMARY KEY  (id),
        KEY list_id (list_id)
    ) $c;");
    dbDelta("CREATE TABLE {$p}duty_assign (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        slot_id bigint(20) unsigned NOT NULL,
        member_id bigint(20) unsigned NOT NULL,
        by_self tinyint(1) NOT NULL DEFAULT 0,
        attended tinyint(1) NULL,
        created datetime NOT NULL,
        PRIMARY KEY  (id),
        UNIQUE KEY slot_member (slot_id, member_id),
        KEY member_id (member_id)
    ) $c;");
    dbDelta("CREATE TABLE {$p}board (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        title varchar(160) NOT NULL,
        text text NULL,
        file_url varchar(255) NOT NULL DEFAULT '',
        file_name varchar(160) NOT NULL DEFAULT '',
        ends date NULL,
        rsvp tinyint(1) NOT NULL DEFAULT 0,
        rsvp_deadline date NULL,
        on_screen tinyint(1) NOT NULL DEFAULT 0,
        created_by varchar(120) NOT NULL DEFAULT '',
        created datetime NOT NULL,
        PRIMARY KEY  (id)
    ) $c;");
    dbDelta("CREATE TABLE {$p}board_rsvp (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        board_id bigint(20) unsigned NOT NULL,
        member_id bigint(20) unsigned NOT NULL,
        answer varchar(4) NOT NULL DEFAULT 'yes',
        persons tinyint(3) unsigned NOT NULL DEFAULT 1,
        note varchar(200) NOT NULL DEFAULT '',
        updated datetime NOT NULL,
        PRIMARY KEY  (id),
        UNIQUE KEY board_member (board_id, member_id)
    ) $c;");
}

// Dienstpläne gehören einem Bereich: „duties“ (Dienste), „strecke“ (Atemschutz-Übungsstrecke) oder einem Team
function myf_duty_data($areas = null) {
    global $wpdb;
    $where = $areas === null ? '' : ' WHERE area IN (' . ($areas ? "'" . implode("','", array_map('esc_sql', $areas)) . "'" : "''") . ')';
    $lists = $wpdb->get_results('SELECT * FROM ' . myf_t('duty_lists') . $where . ' ORDER BY active DESC, created DESC');
    $ids = array_map(function ($l) { return (int) $l->id; }, $lists) ?: [0];
    $slots = $wpdb->get_results('SELECT * FROM ' . myf_t('duty_slots') . ' WHERE list_id IN (' . implode(',', $ids) . ') ORDER BY date IS NULL, date, id');
    $sids = array_map(function ($s) { return (int) $s->id; }, $slots) ?: [0];
    $assign = $wpdb->get_results('SELECT a.*, m.name FROM ' . myf_t('duty_assign') . ' a JOIN ' . myf_t('members') . ' m ON m.id = a.member_id WHERE a.slot_id IN (' . implode(',', $sids) . ')');
    return [
        'duty_lists' => array_map(function ($l) { return ['id' => (int) $l->id, 'area' => (string) $l->area, 'title' => $l->title, 'note' => (string) $l->note, 'self_signup' => (bool) $l->self_signup, 'active' => (bool) $l->active]; }, $lists),
        'duty_slots' => array_map(function ($s) { return ['id' => (int) $s->id, 'list_id' => (int) $s->list_id, 'date' => $s->date, 'label' => $s->label, 'time' => $s->time_from, 'capacity' => (int) $s->capacity, 'min' => (int) ($s->min_people ?? 0), 'note' => $s->note]; }, $slots),
        'duty_assign' => array_map(function ($a) { return ['slot_id' => (int) $a->slot_id, 'member_id' => (int) $a->member_id, 'name' => $a->name, 'self' => (bool) $a->by_self, 'attended' => $a->attended === null ? null : (bool) $a->attended]; }, $assign),
    ];
}
// Bereich einer Liste / eines Termins – für die Rechteprüfung
function myf_duty_area_of($listId = 0, $slotId = 0) {
    global $wpdb;
    if ($slotId) $listId = (int) $wpdb->get_var($wpdb->prepare('SELECT list_id FROM ' . myf_t('duty_slots') . ' WHERE id = %d', $slotId));
    return (string) $wpdb->get_var($wpdb->prepare('SELECT area FROM ' . myf_t('duty_lists') . ' WHERE id = %d', $listId));
}
function myf_duty_check($area) {
    if ($area === '' || !myf_has_area($area)) return myf_err('Dieser Dienstplan gehört nicht zu deinen Bereichen.', 403);
    return null;
}

function myf_board_out($b, $me = null, $admin = false) {
    global $wpdb;
    $o = ['id' => (int) $b->id, 'title' => $b->title, 'text' => (string) $b->text, 'file_url' => $b->file_url, 'file_name' => $b->file_name, 'ends' => $b->ends,
        'rsvp' => (bool) $b->rsvp, 'rsvp_deadline' => $b->rsvp_deadline, 'on_screen' => (bool) $b->on_screen, 'created' => $b->created, 'created_by' => $b->created_by];
    $rows = $wpdb->get_results($wpdb->prepare('SELECT r.*, m.name FROM ' . myf_t('board_rsvp') . ' r JOIN ' . myf_t('members') . ' m ON m.id = r.member_id WHERE board_id = %d ORDER BY m.name', $b->id));
    $o['yes'] = array_sum(array_map(function ($r) { return $r->answer === 'yes' ? (int) $r->persons : 0; }, $rows));
    $o['no'] = count(array_filter($rows, function ($r) { return $r->answer === 'no'; }));
    if ($me) foreach ($rows as $r) if ((int) $r->member_id === (int) $me->id) $o['mine'] = ['answer' => $r->answer, 'persons' => (int) $r->persons, 'note' => $r->note];
    if ($admin) $o['answers'] = array_map(function ($r) { return ['name' => $r->name, 'answer' => $r->answer, 'persons' => (int) $r->persons, 'note' => $r->note, 'updated' => $r->updated]; }, $rows);
    return $o;
}

add_filter('myf_admin_state', function ($d) {
    global $wpdb;
    if (function_exists('myf_has_area')) {
        $dutyAreas = array_values(array_filter(array_merge(['duties', 'strecke'], myf_team_areas_mine()), 'myf_has_area'));
        if ($dutyAreas) $d += myf_duty_data($dutyAreas) + ['duty_areas' => $dutyAreas];
    }
    if (function_exists('myf_has_area') && myf_has_area('board')) $d['board'] = array_map(function ($b) { return myf_board_out($b, null, true); }, $wpdb->get_results('SELECT * FROM ' . myf_t('board') . ' ORDER BY created DESC LIMIT 100'));
    return $d;
}, 20);

add_filter('myf_me_data', function ($data, $me) {
    global $wpdb;
    $dd = myf_duty_data();
    $active = array_map(function ($l) { return $l['id']; }, array_filter($dd['duty_lists'], function ($l) { return $l['active']; }));
    $since = date('Y-m-d', current_time('timestamp') - 7 * DAY_IN_SECONDS);
    $data['duty_lists'] = array_values(array_filter($dd['duty_lists'], function ($l) { return $l['active']; }));
    $data['duty_slots'] = array_values(array_filter($dd['duty_slots'], function ($s) use ($active, $since) { return in_array($s['list_id'], $active, true) && (!$s['date'] || $s['date'] >= $since); }));
    $private = array_map(function ($l) { return $l['id']; }, array_filter($dd['duty_lists'], function ($l) { return $l['area'] === 'strecke'; }));
    $privSlots = array_map(function ($s) { return $s['id']; }, array_filter($dd['duty_slots'], function ($s) use ($private) { return in_array($s['list_id'], $private, true); }));
    $data['duty_assign'] = array_values(array_filter(array_map(function ($a) { unset($a['self']); return $a; }, $dd['duty_assign']), function ($a) use ($privSlots, $me) {
        return !in_array($a['slot_id'], $privSlots, true) || (int) $a['member_id'] === (int) $me->id;
    }));
    $data['board'] = array_map(function ($b) use ($me) { return myf_board_out($b, $me); },
        $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . myf_t('board') . ' WHERE ends IS NULL OR ends >= %s ORDER BY created DESC LIMIT 40', current_time('Y-m-d'))));
    return $data;
}, 10, 2);

// Datei für Aushänge: PDF oder Bild (max. 8 MB), zufälliger Name
function myf_save_file($dataUrl, $prefix = 'aushang-') {
    if (!preg_match('#^data:(application/pdf|image/jpeg|image/png|image/webp);base64,(.+)$#', (string) $dataUrl, $m)) return null;
    $bin = base64_decode($m[2], true);
    if (!$bin || strlen($bin) > 8 * 1024 * 1024) return null;
    if ($m[1] === 'application/pdf') { if (substr($bin, 0, 5) !== '%PDF-') return null; $ext = 'pdf'; }
    else { $info = @getimagesizefromstring($bin); if (!$info) return null; $ext = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'][$info['mime']] ?? null; if (!$ext) return null; }
    $loc = myf_defect_dir();
    $name = $prefix . bin2hex(random_bytes(12)) . '.' . $ext;
    if (false === file_put_contents($loc['dir'] . '/' . $name, $bin)) return null;
    return $loc['url'] . '/' . $name;
}

add_action('rest_api_init', function () {
    $ns = 'myf/v1';
    // ---- Dienstpläne (Verwaltung) ----
    register_rest_route($ns, '/admin/duty', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $id = (int) $req->get_param('id');
        $area = $id ? myf_duty_area_of($id) : (string) ($req->get_param('area') ?: 'duties');
        if ($e = myf_duty_check($area)) return $e;
        if ($req->get_param('delete')) {
            $sids = $wpdb->get_col($wpdb->prepare('SELECT id FROM ' . myf_t('duty_slots') . ' WHERE list_id = %d', $id));
            if ($sids) $wpdb->query('DELETE FROM ' . myf_t('duty_assign') . ' WHERE slot_id IN (' . implode(',', array_map('intval', $sids)) . ')');
            $wpdb->delete(myf_t('duty_slots'), ['list_id' => $id]); $wpdb->delete(myf_t('duty_lists'), ['id' => $id]);
            return ['ok' => true];
        }
        $d = [];
        if ($req->has_param('title')) $d['title'] = mb_substr(sanitize_text_field((string) $req->get_param('title')), 0, 120);
        if ($req->has_param('note')) $d['note'] = sanitize_textarea_field((string) $req->get_param('note'));
        foreach (['self_signup', 'active'] as $k) if ($req->has_param($k)) $d[$k] = $req->get_param($k) ? 1 : 0;
        if ($id) { $wpdb->update(myf_t('duty_lists'), $d, ['id' => $id]); return ['id' => $id]; }
        if (empty($d['title'])) return myf_err('Bitte einen Titel angeben (z. B. Grünanlagen-Pflege 2027).');
        $wpdb->insert(myf_t('duty_lists'), $d + ['area' => $area, 'created' => current_time('mysql')]);
        return ['id' => (int) $wpdb->insert_id];
    }]);
    // Termine erzeugen: ab Datum, alle N Wochen, Anzahl – oder einzeln
    register_rest_route($ns, '/admin/duty/slots', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $lid = (int) $req->get_param('list_id');
        if ($e = myf_duty_check(myf_duty_area_of($lid))) return $e;
        $start = myf_date_or_null($req->get_param('start'));
        $every = max(0, min(52, (int) $req->get_param('every_weeks')));
        $count = max(1, min(60, (int) $req->get_param('count') ?: 1));
        $cap = max(1, min(50, (int) $req->get_param('capacity') ?: 3));
        $min = max(0, min($cap, (int) $req->get_param('min')));
        $time = preg_match('/^\d{1,2}:\d{2}$/', (string) $req->get_param('time')) ? $req->get_param('time') : '';
        $label = mb_substr(sanitize_text_field((string) $req->get_param('label')), 0, 60);
        if (!$start && $label === '') return myf_err('Bitte ein Startdatum oder eine Bezeichnung angeben.');
        $n = 0;
        for ($i = 0; $i < ($start && $every ? $count : 1); $i++) {
            $date = $start ? date('Y-m-d', strtotime($start . ' +' . ($i * $every) . ' weeks')) : null;
            $wpdb->insert(myf_t('duty_slots'), ['list_id' => $lid, 'date' => $date, 'label' => $label !== '' ? $label : ($date ? 'KW ' . (int) date('W', strtotime($date)) : ''), 'time_from' => $time, 'capacity' => $cap, 'min_people' => $min]);
            $n++;
        }
        return ['added' => $n];
    }]);
    register_rest_route($ns, '/admin/duty/slot', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $id = (int) $req->get_param('id');
        if ($e = myf_duty_check(myf_duty_area_of(0, $id))) return $e;
        if ($req->get_param('delete')) { $wpdb->delete(myf_t('duty_assign'), ['slot_id' => $id]); $wpdb->delete(myf_t('duty_slots'), ['id' => $id]); return ['ok' => true]; }
        $d = [];
        if ($req->has_param('date')) $d['date'] = myf_date_or_null($req->get_param('date'));
        if ($req->has_param('label')) $d['label'] = mb_substr(sanitize_text_field((string) $req->get_param('label')), 0, 60);
        if ($req->has_param('time')) $d['time_from'] = preg_match('/^\d{1,2}:\d{2}$/', (string) $req->get_param('time')) ? $req->get_param('time') : '';
        if ($req->has_param('capacity')) $d['capacity'] = max(1, min(50, (int) $req->get_param('capacity')));
        if ($req->has_param('min')) $d['min_people'] = max(0, min(50, (int) $req->get_param('min')));
        if ($req->has_param('note')) $d['note'] = mb_substr(sanitize_text_field((string) $req->get_param('note')), 0, 200);
        $wpdb->update(myf_t('duty_slots'), $d, ['id' => $id]);
        return ['id' => $id];
    }]);
    register_rest_route($ns, '/admin/duty/assign', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $sid = (int) $req->get_param('slot_id'); $mid = (int) $req->get_param('member_id');
        $area = myf_duty_area_of(0, $sid);
        if ($e = myf_duty_check($area)) return $e;
        // Übungsstrecke: Teilnahme bestätigen → zählt als jährliche Belastungsübung (Atemschutz-Nachweis)
        if ($req->has_param('attended')) {
            $slot = $wpdb->get_row($wpdb->prepare('SELECT s.*, l.title FROM ' . myf_t('duty_slots') . ' s JOIN ' . myf_t('duty_lists') . ' l ON l.id = s.list_id WHERE s.id = %d', $sid));
            $att = $req->get_param('attended');
            $wpdb->update(myf_t('duty_assign'), ['attended' => $att === null || $att === '' ? null : ($att ? 1 : 0)], ['slot_id' => $sid, 'member_id' => $mid]);
            if ($area === 'strecke' && $slot && $slot->date) {
                $tag = '[Einteilung ' . $sid . ']';
                $ex = $wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('agt_log') . " WHERE member_id = %d AND kind = 'strecke' AND note LIKE %s", $mid, '%' . $wpdb->esc_like($tag)));
                if ($att && !$ex) $wpdb->insert(myf_t('agt_log'), ['member_id' => $mid, 'kind' => 'strecke', 'date' => $slot->date, 'note' => $slot->title . ' ' . $tag]);
                if (!$att && $ex) $wpdb->delete(myf_t('agt_log'), ['id' => $ex]);
            }
            return ['ok' => true];
        }
        if ($req->get_param('remove')) { $wpdb->delete(myf_t('duty_assign'), ['slot_id' => $sid, 'member_id' => $mid]); return ['ok' => true]; }
        $slot = $wpdb->get_row($wpdb->prepare('SELECT s.*, l.title FROM ' . myf_t('duty_slots') . ' s JOIN ' . myf_t('duty_lists') . ' l ON l.id = s.list_id WHERE s.id = %d', $sid));
        if (!$slot) return myf_err('Termin nicht gefunden.', 404);
        $wpdb->query($wpdb->prepare('INSERT IGNORE INTO ' . myf_t('duty_assign') . ' (slot_id, member_id, by_self, created) VALUES (%d, %d, 0, %s)', $sid, $mid, current_time('mysql')));
        myf_notify([$mid], 'duty', 'Du bist eingeteilt: ' . $slot->title, ($slot->date ? date('d.m.Y', strtotime($slot->date)) : $slot->label) . ($slot->time_from ? ', ' . $slot->time_from . ' Uhr' : ''), 'duties');
        return ['ok' => true];
    }]);
    // ---- Dienstpläne (Mitglied: selbst eintragen / austragen) ----
    register_rest_route($ns, '/me/duty', ['methods' => 'POST', 'permission_callback' => myf_perm('duty_signup'), 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $me = myf_me();
        if (!$me) return myf_err('Dein Konto ist keinem Mitglied zugeordnet.', 403);
        $sid = (int) $req->get_param('slot_id');
        $slot = $wpdb->get_row($wpdb->prepare('SELECT s.*, l.self_signup, l.active FROM ' . myf_t('duty_slots') . ' s JOIN ' . myf_t('duty_lists') . ' l ON l.id = s.list_id WHERE s.id = %d', $sid));
        if (!$slot || !$slot->active) return myf_err('Termin nicht gefunden.', 404);
        if (!$slot->self_signup) return myf_err('In diese Liste trägt die Führung ein.');
        if ($slot->date && $slot->date < current_time('Y-m-d')) return myf_err('Der Termin ist schon vorbei.');
        if ($req->get_param('on')) {
            $n = (int) $wpdb->get_var($wpdb->prepare('SELECT COUNT(*) FROM ' . myf_t('duty_assign') . ' WHERE slot_id = %d', $sid));
            if ($n >= $slot->capacity) return myf_err('Der Termin ist schon voll.', 409);
            $wpdb->query($wpdb->prepare('INSERT IGNORE INTO ' . myf_t('duty_assign') . ' (slot_id, member_id, by_self, created) VALUES (%d, %d, 1, %s)', $sid, $me->id, current_time('mysql')));
        } else {
            $wpdb->delete(myf_t('duty_assign'), ['slot_id' => $sid, 'member_id' => $me->id]);
        }
        return ['ok' => true];
    }]);
    // ---- Aushänge ----
    register_rest_route($ns, '/admin/board', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $id = (int) $req->get_param('id');
        if ($req->get_param('delete')) { $wpdb->delete(myf_t('board_rsvp'), ['board_id' => $id]); $wpdb->delete(myf_t('board'), ['id' => $id]); return ['ok' => true]; }
        $d = [];
        if ($req->has_param('title')) $d['title'] = mb_substr(sanitize_text_field((string) $req->get_param('title')), 0, 160);
        if ($req->has_param('text')) $d['text'] = sanitize_textarea_field((string) $req->get_param('text'));
        if ($req->has_param('ends')) $d['ends'] = myf_date_or_null($req->get_param('ends'));
        if ($req->has_param('rsvp_deadline')) $d['rsvp_deadline'] = myf_date_or_null($req->get_param('rsvp_deadline'));
        foreach (['rsvp', 'on_screen'] as $k) if ($req->has_param($k)) $d[$k] = $req->get_param($k) ? 1 : 0;
        if ($req->get_param('file')) {
            $u = myf_save_file($req->get_param('file'));
            if (!$u) return myf_err('Datei nicht erkannt – bitte PDF, JPG oder PNG bis 8 MB.');
            $d['file_url'] = $u; $d['file_name'] = mb_substr(sanitize_file_name((string) $req->get_param('file_name')), 0, 160);
        }
        if ($id) { $wpdb->update(myf_t('board'), $d, ['id' => $id]); return ['id' => $id]; }
        if (empty($d['title'])) return myf_err('Bitte einen Titel angeben.');
        $wpdb->insert(myf_t('board'), $d + ['created_by' => myf_actor(), 'created' => current_time('mysql')]);
        $bid = (int) $wpdb->insert_id;
        if ($req->get_param('notify_all')) myf_notify($wpdb->get_col('SELECT id FROM ' . myf_t('members') . ' WHERE active = 1 AND user_id IS NOT NULL'), 'board', 'Neuer Aushang: ' . $d['title'], wp_trim_words((string) ($d['text'] ?? ''), 25), 'board');
        return ['id' => $bid];
    }]);
    register_rest_route($ns, '/me/rsvp', ['methods' => 'POST', 'permission_callback' => 'myf_member_permission', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $me = myf_me();
        $b = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('board') . ' WHERE id = %d AND rsvp = 1', (int) $req->get_param('board_id')));
        if (!$b) return myf_err('Nicht gefunden.', 404);
        if ($b->rsvp_deadline && $b->rsvp_deadline < current_time('Y-m-d')) return myf_err('Die Anmeldefrist ist abgelaufen.');
        $answer = $req->get_param('answer') === 'no' ? 'no' : 'yes';
        $row = ['answer' => $answer, 'persons' => max(1, min(20, (int) $req->get_param('persons') ?: 1)), 'note' => mb_substr(sanitize_text_field((string) $req->get_param('note')), 0, 200), 'updated' => current_time('mysql')];
        $ex = $wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('board_rsvp') . ' WHERE board_id = %d AND member_id = %d', $b->id, $me->id));
        if ($ex) $wpdb->update(myf_t('board_rsvp'), $row, ['id' => $ex]); else $wpdb->insert(myf_t('board_rsvp'), $row + ['board_id' => $b->id, 'member_id' => $me->id]);
        return ['ok' => true];
    }]);
});

// Eigene Dienste im persönlichen Kalender
add_filter('myf_ics_events', function ($events, $m) {
    global $wpdb;
    foreach ($wpdb->get_results($wpdb->prepare('SELECT s.*, l.title FROM ' . myf_t('duty_assign') . ' a JOIN ' . myf_t('duty_slots') . ' s ON s.id = a.slot_id JOIN ' . myf_t('duty_lists') . ' l ON l.id = s.list_id WHERE a.member_id = %d AND s.date IS NOT NULL AND s.date >= %s', $m->id, date('Y-m-d', current_time('timestamp') - 60 * DAY_IN_SECONDS))) as $s) {
        $e = ['uid' => 's' . $s->id, 'start' => $s->date, 'end' => $s->date, 'title' => 'Dienst: ' . $s->title, 'loc' => $s->note];
        if ($s->time_from) { $e['time'] = $s->time_from; $e['endtime'] = date('H:i', strtotime($s->time_from . ' +2 hours')); }
        $events[] = $e;
    }
    return $events;
}, 10, 2);

// Erinnerung am Vortag
add_action('myf_daily_more', function ($today) {
    global $wpdb;
    $tomorrow = date('Y-m-d', strtotime($today . ' +1 day'));
    foreach ($wpdb->get_results($wpdb->prepare('SELECT a.member_id, s.*, l.title FROM ' . myf_t('duty_assign') . ' a JOIN ' . myf_t('duty_slots') . ' s ON s.id = a.slot_id JOIN ' . myf_t('duty_lists') . ' l ON l.id = s.list_id WHERE s.date = %s', $tomorrow)) as $r) {
        myf_notify([(int) $r->member_id], 'reminder', 'Morgen: ' . $r->title . ($r->time_from ? ' um ' . $r->time_from . ' Uhr' : ''), (string) $r->note, 'duties', 'duty:' . $r->id . ':' . $r->member_id);
    }
    // Zu wenig Leute in den nächsten 3 Tagen (Mindestzahl unterschritten): Bereich Dienste warnen – einmal je Termin
    foreach ($wpdb->get_results($wpdb->prepare('SELECT s.*, l.title, l.area, (SELECT COUNT(*) FROM ' . myf_t('duty_assign') . ' a WHERE a.slot_id = s.id) AS n FROM ' . myf_t('duty_slots') . ' s JOIN ' . myf_t('duty_lists') . " l ON l.id = s.list_id
        WHERE l.active = 1 AND s.min_people > 0 AND s.date BETWEEN %s AND %s", $today, date('Y-m-d', strtotime($today . ' +3 days')))) as $s) {
        if ((int) $s->n >= (int) $s->min_people) continue;
        $area = $s->area === 'strecke' ? 'strecke' : (strpos((string) $s->area, 'team_') === 0 ? $s->area : 'duties');
        foreach (myf_area_members($area) as $mid) myf_notify([$mid], 'reminder', 'Zu wenig Leute: ' . $s->title . ' am ' . date('d.m.', strtotime($s->date)), 'Eingeteilt: ' . $s->n . ' von mindestens ' . $s->min_people . '.', 'admin:duties', 'dmin:' . $s->id);
    }
});
