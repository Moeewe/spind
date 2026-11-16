<?php
/**
 * Benachrichtigungen: persönliches Postfach im Mitgliederbereich (Glocke), auf Wunsch zusätzlich per E-Mail.
 * Neue Mängel gehen an den Bereich Mängel (z. B. Gerätewarte), Anregungen an die Führung, fällige Übungsstrecke/G26 an
 * die Person selbst usw. „Bescheid geben“: Rückfrage/Korrektur zu eigenen Daten an den zuständigen Bereich.
 */

defined('ABSPATH') || exit;

function myf_install_notify($c) {
    global $wpdb;
    $p = myf_t(''); // echte oder Demo-Tabellen (Demo-Modus)
    dbDelta("CREATE TABLE {$p}notifications (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        member_id bigint(20) unsigned NOT NULL,
        kind varchar(20) NOT NULL DEFAULT '',
        title varchar(200) NOT NULL DEFAULT '',
        body text NULL,
        link varchar(60) NOT NULL DEFAULT '',
        dedupe varchar(80) NOT NULL DEFAULT '',
        created datetime NOT NULL,
        read_at datetime NULL,
        archived tinyint(1) NOT NULL DEFAULT 0,
        PRIMARY KEY  (id),
        KEY member_id (member_id, read_at)
    ) $c;");
    dbDelta("CREATE TABLE {$p}messages (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        member_id bigint(20) unsigned NOT NULL,
        area varchar(20) NOT NULL,
        about varchar(150) NOT NULL DEFAULT '',
        text text NOT NULL,
        status varchar(10) NOT NULL DEFAULT 'open',
        answer text NULL,
        answered_by varchar(120) NOT NULL DEFAULT '',
        answered datetime NULL,
        created datetime NOT NULL,
        PRIMARY KEY  (id),
        KEY area (area, status),
        KEY member_id (member_id)
    ) $c;");
}

// Hat ein Mitglied (unabhängig vom gerade angemeldeten Benutzer) ein Recht?
function myf_member_has_right_static($m, $right) {
    global $wpdb;
    if ($m->user_id && ($u = get_userdata((int) $m->user_id)) && (user_can($u, 'ffl_manage') || user_can($u, 'manage_options'))) return true;
    $r = myf_rights()[$right] ?? ['all' => true, 'traits' => []];
    if ($r['all']) return true;
    if (!$r['traits']) return false;
    return (bool) $wpdb->get_var($wpdb->prepare('SELECT COUNT(*) FROM ' . myf_t('member_traits') . ' WHERE member_id = %d AND trait_id IN (' . implode(',', array_map('intval', $r['traits'])) . ')', $m->id));
}

// Mitglieder eines Verwaltungsbereichs (für Benachrichtigungen)
function myf_area_members($area) {
    global $wpdb;
    $right = myf_areas()[$area] ?? null;
    if (!$right) return [];
    $r = myf_rights()[$right];
    $out = [];
    foreach ($wpdb->get_results('SELECT * FROM ' . myf_t('members') . ' WHERE active = 1 AND user_id IS NOT NULL') as $m) {
        // „alle Mitglieder“ ist für Bereiche nicht sinnvoll – dann nur Verwaltung benachrichtigen
        if ($r['all'] && !($m->user_id && ($u = get_userdata((int) $m->user_id)) && (user_can($u, 'ffl_manage') || user_can($u, 'manage_options')))) continue;
        if (myf_member_has_right_static($m, $right)) $out[] = (int) $m->id;
    }
    return $out;
}

function myf_notify($memberIds, $kind, $title, $body = '', $link = '', $dedupe = '') {
    global $wpdb;
    $memberIds = array_unique(array_filter(array_map('intval', (array) $memberIds)));
    $me = function_exists('myf_me') ? myf_me() : null;
    $mails = [];
    foreach ($memberIds as $mid) {
        if ($me && (int) $me->id === $mid && $kind !== 'reminder') continue; // eigene Aktionen nicht an sich selbst melden
        if ($dedupe && $wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('notifications') . ' WHERE member_id = %d AND dedupe = %s', $mid, $dedupe))) continue;
        $wpdb->insert(myf_t('notifications'), ['member_id' => $mid, 'kind' => $kind, 'title' => mb_substr($title, 0, 200), 'body' => $body, 'link' => $link,
            'dedupe' => $dedupe, 'created' => current_time('mysql')]);
        // E-Mails verlassen den Server: bei Alarmen keine Einsatzadresse/Details mitschicken
        if (empty($GLOBALS['myf_no_mail'])) $mails[] = [$mid, $title, $kind === 'alarm' ? 'Details im Mitgliederbereich.' : $body, $link];
    }
    // Wenige E-Mails gleich, viele im Hintergrund (Warteschlange) – sonst dauert z. B. „an alle“ oder ein Alarm zu lange
    if (empty($mails) || (function_exists('myf_demo_ctx') && myf_demo_ctx())) return;
    if (count($mails) <= 3) { foreach ($mails as $x) myf_notify_mail($x[0], $x[1], $x[2], $x[3]); return; }
    add_option('myf_mailq_' . str_replace('.', '', uniqid('', true)), $mails, '', 'no');
    if (!wp_next_scheduled('myf_mail_run')) wp_schedule_single_event(time(), 'myf_mail_run');
}
// Warteschlange abarbeiten: je Durchlauf höchstens 40 E-Mails, dann neu einplanen
add_action('myf_mail_run', function () {
    global $wpdb;
    $sent = 0;
    foreach ($wpdb->get_col($wpdb->prepare("SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE %s ORDER BY option_id LIMIT 20", $wpdb->esc_like('myf_mailq_') . '%')) as $o) {
        $q = get_option($o); delete_option($o);
        foreach ((array) $q as $i => $x) {
            if ($sent >= 40) { add_option($o . 'r', array_slice((array) $q, $i), '', 'no'); break 2; }
            myf_notify_mail($x[0], $x[1], $x[2], $x[3]); $sent++;
        }
    }
    if ($wpdb->get_var($wpdb->prepare("SELECT 1 FROM {$wpdb->options} WHERE option_name LIKE %s LIMIT 1", $wpdb->esc_like('myf_mailq_') . '%')) && !wp_next_scheduled('myf_mail_run'))
        wp_schedule_single_event(time() + 60, 'myf_mail_run');
});
function myf_notify_area($area, $kind, $title, $body = '', $link = '', $dedupe = '') { myf_notify(myf_area_members($area), $kind, $title, $body, $link, $dedupe); }

// Erledigt ist erledigt: Meldungen zu einem Vorgang (Schlüssel z. B. „partreq:12“) gelten bei allen als erledigt, sobald jemand ihn bearbeitet hat
const MYF_NOTE_KEYS = ['partreq', 'cert', 'bkreq', 'msg', 'defect', 'cloth', 'idea', 'loopreq'];
function myf_note_open($key) {
    global $wpdb;
    if (!preg_match('/^([a-z]+):(\d+)(?::(\d+))?$/', $key, $k)) return true;
    $q = [
        'partreq' => ['SELECT 1 FROM ' . myf_t('participation') . " WHERE id = %d AND change_req <> ''", [(int) $k[2]]],
        'cert' => ['SELECT 1 FROM ' . myf_t('participation') . " WHERE incident_id = %d AND member_id = %d AND cert = 'requested'", [(int) $k[2], (int) ($k[3] ?? 0)]],
        'bkreq' => ['SELECT 1 FROM ' . myf_t('bookings') . " WHERE id = %d AND status = 'requested'", [(int) $k[2]]],
        'msg' => ['SELECT 1 FROM ' . myf_t('messages') . " WHERE id = %d AND status = 'open'", [(int) $k[2]]],
        'defect' => ['SELECT 1 FROM ' . myf_t('defects') . " WHERE id = %d AND status = 'new'", [(int) $k[2]]],
        'cloth' => ['SELECT 1 FROM ' . myf_t('clothing') . " WHERE id = %d AND status = 'open'", [(int) $k[2]]],
        'idea' => ['SELECT 1 FROM ' . myf_t('ideas') . " WHERE id = %d AND status = 'new'", [(int) $k[2]]],
        'loopreq' => ['SELECT 1 FROM ' . myf_t('loop_requests') . " WHERE id = %d AND status = 'open'", [(int) $k[2]]],
    ][$k[1]] ?? null;
    return !$q || (bool) $wpdb->get_var($wpdb->prepare($q[0], ...$q[1]));
}
// Läuft beim Laden von Mitgliederbereich und Verwaltung: erledigte Vorgänge als gelesen („Erledigt“) markieren, bei allen Empfängern.
// Der Schlüssel bekommt „done~“ davor – kommt derselbe Vorgang später wieder (z. B. neue Anfrage), wird wieder benachrichtigt.
function myf_notes_sweep() {
    global $wpdb;
    static $done = false; if ($done) return; $done = true;
    $t = myf_t('notifications'); $now = current_time('mysql');
    $like = implode(' OR ', array_map(function ($p) use ($wpdb) { return $wpdb->prepare('dedupe LIKE %s', $p . ':%'); }, MYF_NOTE_KEYS));
    $since = date('Y-m-d H:i:s', current_time('timestamp') - 120 * DAY_IN_SECONDS);
    foreach ($wpdb->get_col($wpdb->prepare("SELECT DISTINCT dedupe FROM $t WHERE created >= %s AND ($like)", $since)) as $key)
        if (!myf_note_open($key)) $wpdb->query($wpdb->prepare("UPDATE $t SET read_at = COALESCE(read_at, %s), dedupe = %s WHERE dedupe = %s", $now, mb_substr('done~' . $key, 0, 80), $key));
    // Ältere Meldungen „… war doch nicht dabei“ ohne Schlüssel: erledigt, wenn in dem Einsatz niemand mehr ausgetragen werden möchte
    foreach ($wpdb->get_col("SELECT DISTINCT link FROM $t WHERE read_at IS NULL AND kind = 'part' AND dedupe = '' AND link LIKE 'einsatz:%'") as $link)
        if (!$wpdb->get_var($wpdb->prepare('SELECT 1 FROM ' . myf_t('participation') . " WHERE incident_id = %d AND change_req <> ''", (int) substr($link, 8))))
            $wpdb->query($wpdb->prepare("UPDATE $t SET read_at = %s WHERE read_at IS NULL AND kind = 'part' AND dedupe = '' AND link = %s", $now, $link));
}

// E-Mail zusätzlich (abschaltbar im Profil)
function myf_notify_mail($mid, $title, $body, $link = '') {
    global $wpdb;
    $m = $wpdb->get_row($wpdb->prepare('SELECT user_id FROM ' . myf_t('members') . ' WHERE id = %d', $mid));
    if (!$m || !$m->user_id || get_user_meta((int) $m->user_id, 'myf_no_mail', true)) return;
    $u = get_userdata((int) $m->user_id);
    if (!$u || !$u->user_email) return;
    $app = myf_brand()['app'];
    wp_mail($u->user_email, '[' . $app . '] ' . $title, ($body ? $body . "\n\n" : '') . 'Öffnen: ' . (preg_match('/^(einsatz|bericht):(\d+)$/', (string) $link, $lm) ? add_query_arg(array_filter(['eid' => (int) $lm[2], 'r' => $lm[1] === 'bericht' ? 1 : 0]), myf_member_page_url()) : (preg_match('/^admin:geraet:(\d+)$/', (string) $link, $lm) ? add_query_arg('geraet', (int) $lm[1], myf_member_page_url()) : myf_member_page_url())) . "\n\n— Diese Nachricht kannst du im Profil unter „Benachrichtigungen per E-Mail“ abschalten.");
}

// Wer Verwaltungsbereiche hat, bekommt zwei Postfächer: Verwaltung (Links „admin:…“) und persönlich. Ohne Bereiche bleibt alles im Mitgliederbereich.
// Früher zwei Postfächer (Verwaltung/persönlich) – seit 0.10 eines für alles
function myf_notes_split() { return false; }
function myf_note_out($n) {
    // key: Kennung des Vorgangs (z. B. „bkreq:12“) – damit kann man direkt in der Benachrichtigung entscheiden
    return ['id' => (int) $n->id, 'kind' => $n->kind, 'title' => $n->title, 'body' => (string) $n->body, 'link' => $n->link, 'created' => $n->created, 'read' => (bool) $n->read_at, 'key' => (string) $n->dedupe];
}

add_filter('myf_me_data', function ($data, $me) {
    global $wpdb;
    myf_notes_sweep();
    $split = myf_notes_split();
    // Ungelesene immer; Gelesene („Erledigt“) noch einen Tag als Verlauf, danach verschwinden sie von selbst
    $data['notifications'] = array_map('myf_note_out', $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . myf_t('notifications') . ' WHERE member_id = %d AND archived = 0 AND (read_at IS NULL OR read_at >= %s)' . ($split ? " AND link NOT LIKE 'admin:%%'" : '') . ' ORDER BY created DESC LIMIT 60', $me->id, date('Y-m-d H:i:s', current_time('timestamp') - DAY_IN_SECONDS))));
    $data['admin_notes_unread'] = $split ? (int) $wpdb->get_var($wpdb->prepare('SELECT COUNT(*) FROM ' . myf_t('notifications') . " WHERE member_id = %d AND read_at IS NULL AND archived = 0 AND link LIKE 'admin:%%'", $me->id)) : 0;
    $data['notify_mail'] = !get_user_meta(get_current_user_id(), 'myf_no_mail', true);
    $data['my_messages'] = array_map('myf_message_out', $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . myf_t('messages') . ' WHERE member_id = %d ORDER BY created DESC LIMIT 30', $me->id)));
    $data['message_areas'] = ['agt' => 'Atemschutz', 'strecke' => 'Übungsstrecke', 'courses' => 'Lehrgänge', 'clothing' => 'Kleiderkammer', 'members' => 'Mitgliederdaten', 'incidents' => 'Einsätze', 'vehicles' => 'Gerätewarte & Fahrzeuge', 'duties' => 'Dienste'];
    $data['teams'] = [];
    foreach (myf_teams() as $t) { $data['message_areas']['team_' . $t['key']] = $t['name']; $data['teams'][] = ['area' => 'team_' . $t['key'], 'name' => $t['name'], 'desc' => (string) ($t['desc'] ?? '')]; }
    return $data;
}, 30, 2);

function myf_message_out($m, $admin = false) {
    $o = ['id' => (int) $m->id, 'area' => $m->area, 'about' => $m->about, 'text' => $m->text, 'status' => $m->status, 'answer' => (string) $m->answer,
        'answered_by' => $m->answered_by, 'answered' => $m->answered, 'created' => $m->created];
    if ($admin) $o['member_id'] = (int) $m->member_id;
    return $o;
}

// Verwaltung: Nachrichten nur der eigenen Bereiche; dazu das Postfach der angemeldeten Person
add_filter('myf_admin_state', function ($d) {
    global $wpdb;
    myf_notes_sweep();
    $me = function_exists('myf_me') ? myf_me() : null;
    $d['admin_notes'] = $me ? array_map('myf_note_out', $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . myf_t('notifications') . " WHERE member_id = %d AND archived = 0 ORDER BY created DESC LIMIT 200", $me->id))) : [];
    $areas = function_exists('myf_my_areas') ? myf_my_areas() : [];
    $d['messages'] = $areas ? array_map(function ($m) { return myf_message_out($m, true); }, $wpdb->get_results('SELECT * FROM ' . myf_t('messages') . " WHERE area IN ('" . implode("','", array_map('esc_sql', $areas)) . "') ORDER BY status = 'open' DESC, created DESC LIMIT 300")) : [];
    return $d;
}, 50);

// Betriebsarzt für die G26 (Einstellungen → Allgemein): Name, Anschrift, Telefon, Website, Hinweis – leer = nicht hinterlegt
function myf_g26_doctor() {
    $g = (array) (myf_settings()['g26_doctor'] ?? []);
    if (trim((string) ($g['name'] ?? '')) === '') return null;
    return ['name' => (string) $g['name'], 'address' => (string) ($g['address'] ?? ''), 'phone' => (string) ($g['phone'] ?? ''), 'url' => (string) ($g['url'] ?? ''), 'note' => (string) ($g['note'] ?? '')];
}

add_action('rest_api_init', function () {
    $ns = 'myf/v1';
    $p = 'myf_member_permission';
    register_rest_route($ns, '/me/notifications', ['methods' => 'POST', 'permission_callback' => $p, 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $me = myf_me();
        $t = myf_t('notifications');
        $ids = array_filter(array_map('intval', (array) $req->get_param('ids')));
        $where = $ids ? ' AND id IN (' . implode(',', $ids) . ')' : '';
        $act = (string) $req->get_param('action');
        if ($act === 'read') $wpdb->query($wpdb->prepare("UPDATE $t SET read_at = %s WHERE member_id = %d AND read_at IS NULL$where", current_time('mysql'), $me->id));
        if ($act === 'archive') $wpdb->query($wpdb->prepare("UPDATE $t SET archived = 1, read_at = COALESCE(read_at, %s) WHERE member_id = %d$where", current_time('mysql'), $me->id));
        if ($act === 'unread' && $ids) $wpdb->query($wpdb->prepare("UPDATE $t SET read_at = NULL WHERE member_id = %d$where", $me->id));
        if ($act === 'delete' && $ids) $wpdb->query($wpdb->prepare("DELETE FROM $t WHERE member_id = %d$where", $me->id)); // eigenes Postfach, endgültig
        if ($act === 'mail') { if ($req->get_param('on')) delete_user_meta(get_current_user_id(), 'myf_no_mail'); else update_user_meta(get_current_user_id(), 'myf_no_mail', 1); }
        return ['ok' => true];
    }]);
    // „Bescheid geben“: Rückfrage / Korrektur an den zuständigen Bereich
    register_rest_route($ns, '/me/message', ['methods' => 'POST', 'permission_callback' => $p, 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $me = myf_me();
        $area = (string) $req->get_param('area');
        if (!isset(myf_areas()[$area])) return myf_err('Unbekannter Bereich.');
        $text = sanitize_textarea_field((string) $req->get_param('text'));
        if (mb_strlen(trim($text)) < 3) return myf_err('Bitte kurz beschreiben, was nicht stimmt.');
        $about = mb_substr(sanitize_text_field((string) $req->get_param('about')), 0, 150);
        $wpdb->insert(myf_t('messages'), ['member_id' => $me->id, 'area' => $area, 'about' => $about, 'text' => $text, 'status' => 'open', 'created' => current_time('mysql')]);
        $id = (int) $wpdb->insert_id;
        myf_notify_area($area, 'message', 'Rückfrage von ' . $me->name . ($about ? ': ' . $about : ''), wp_trim_words($text, 30), 'admin:messages', 'msg:' . $id);
        return ['id' => $id];
    }]);
    register_rest_route($ns, '/admin/message', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $m = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('messages') . ' WHERE id = %d', (int) $req->get_param('id')));
        if (!$m || !myf_has_area($m->area)) return myf_err('Nicht gefunden.', 404);
        if ($req->get_param('delete')) { $wpdb->delete(myf_t('messages'), ['id' => $m->id]); return ['ok' => true]; }
        $d = [];
        if ($req->has_param('status')) $d['status'] = in_array($req->get_param('status'), ['open', 'done', 'archived'], true) ? $req->get_param('status') : 'open';
        if ($req->has_param('answer')) { $d['answer'] = sanitize_textarea_field((string) $req->get_param('answer')); $d['answered_by'] = myf_actor(); $d['answered'] = current_time('mysql'); }
        if ($d) $wpdb->update(myf_t('messages'), $d, ['id' => $m->id]);
        if (!empty($d['answer'])) myf_notify([(int) $m->member_id], 'message', 'Antwort auf deine Rückfrage' . ($m->about ? ': ' . $m->about : ''), wp_trim_words($d['answer'], 30), 'messages');
        return ['id' => (int) $m->id];
    }]);
});

// Täglich: Erinnerungen an fällige Übungsstrecke / G26 an die Person selbst
add_action('myf_daily', 'myf_daily_reminders');
add_action('init', function () { if (!wp_next_scheduled('myf_daily')) wp_schedule_event(strtotime('tomorrow 07:00', current_time('timestamp')) - (int) (get_option('gmt_offset') * HOUR_IN_SECONDS), 'daily', 'myf_daily'); });
function myf_daily_reminders() {
    global $wpdb;
    $today = current_time('Y-m-d');
    foreach ($wpdb->get_results('SELECT * FROM ' . myf_t('members') . ' WHERE active = 1 AND agt = 1') as $m) {
        $last = $wpdb->get_var($wpdb->prepare('SELECT MAX(date) FROM ' . myf_t('agt_log') . " WHERE member_id = %d AND kind = 'strecke' AND date <= %s", $m->id, $today));
        $due = $last ? date('Y-m-d', strtotime($last . ' +1 year')) : null;
        if (!$due || $due <= date('Y-m-d', strtotime($today . ' +30 days'))) {
            myf_notify([(int) $m->id], 'reminder', $due && $due >= $today ? 'Atemschutz-Übungsstrecke bis ' . date('d.m.Y', strtotime($due)) . ' fällig' : 'Atemschutz-Übungsstrecke ist fällig',
                'Bitte einen Termin für die Übungsstrecke einplanen.', 'agt', 'strecke:' . ($due ?: 'nie'));
        }
        if ($m->g26_until && $m->g26_until <= date('Y-m-d', strtotime($today . ' +60 days'))) {
            myf_notify([(int) $m->id], 'reminder', 'G26-Untersuchung ' . ($m->g26_until < $today ? 'abgelaufen' : 'läuft am ' . date('d.m.Y', strtotime($m->g26_until)) . ' ab'),
                'Bitte rechtzeitig einen Termin beim Arzt machen und das neue Datum der Atemschutz-Verwaltung melden.' . (($dr = myf_g26_doctor()) ? ' Betriebsarzt: ' . $dr['name'] . ($dr['phone'] ? ', Tel. ' . $dr['phone'] : '') . '.' : ''), 'agt', 'g26:' . $m->g26_until);
        }
    }
    do_action('myf_daily_more', $today);
}

// Aufräumen (täglich): gelesene Benachrichtigungen nach 6 Monaten, alle nach 1 Jahr – hält das Postfach und die Datenbank schlank
add_action('myf_daily', function () {
    global $wpdb;
    $t = myf_t('notifications');
    $wpdb->query($wpdb->prepare("DELETE FROM `$t` WHERE (read_at IS NOT NULL AND created < %s) OR created < %s LIMIT 20000",
        date('Y-m-d H:i:s', current_time('timestamp') - 182 * DAY_IN_SECONDS), date('Y-m-d H:i:s', current_time('timestamp') - 365 * DAY_IN_SECONDS)));
}, 20);
