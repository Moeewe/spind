<?php
/**
 * Veranstaltungen: besondere Termine (Tag der offenen Tür, Osterfeuer, Jubiläum, Jahreshauptversammlung …), die
 * hervorgehoben, öffentlich gezeigt und in Kalender übernommen werden. Verwaltung nur durch die Verwaltung.
 *
 * Zusammenspiel mit dem normalen Kalender der Feuerwehr (Dienstplan-Kalender, z. B. Alamos):
 *  - Ein Kalendertermin lässt sich als Veranstaltung „hervorheben“. Datum und Uhrzeit kommen dann weiter aus dem
 *    Kalender (der Kalender ist führend), SPIND ergänzt Beschreibung, Bild, Link und Sichtbarkeit.
 *  - Von Hand angelegte Veranstaltungen erscheinen im Kalender-Abo der Mitglieder und in einem öffentlichen Kalender-
 *    Abo (nur öffentliche Veranstaltungen), das sich in jeden Kalender einbinden lässt.
 *
 * Gedacht für das, was die Öffentlichkeit sehen soll (Leistungsnachweis, Tag der Jugendfeuerwehr, Tag der offenen Tür,
 * Lampionfest …) – Internes braucht keine Veranstaltung, das steht im Dienstplan. Jede Veranstaltung beginnt als Entwurf
 * und wird erst mit „Öffentlich“ sichtbar: auf der Website, im öffentlichen Kalender-Abo und – ganz normal, ohne
 * Hervorhebung – im Kalender der Mitglieder. Optional verknüpft mit einer Abfrage („Wer hilft?“) für die Mitglieder.
 * Einbinden auf Seiten: [ww_veranstaltungen], [ww_veranstaltung id="…"] und hervorgehoben in [ww_termine].
 */

defined('ABSPATH') || exit;

const MYF_EVENT_VIS = ['draft' => 'Entwurf – nur Verwaltung', 'members' => 'Mitglieder', 'public' => 'Öffentlich'];

function myf_install_events($c) {
    $p = myf_t(''); // echte oder Demo-Tabellen (Demo-Modus)
    dbDelta("CREATE TABLE {$p}events (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        title varchar(200) NOT NULL DEFAULT '',
        date date NOT NULL,
        end_date date NULL,
        time_from varchar(5) NOT NULL DEFAULT '',
        time_to varchar(5) NOT NULL DEFAULT '',
        place varchar(200) NOT NULL DEFAULT '',
        teaser varchar(300) NOT NULL DEFAULT '',
        body text NULL,
        image varchar(255) NOT NULL DEFAULT '',
        link varchar(255) NOT NULL DEFAULT '',
        link_label varchar(60) NOT NULL DEFAULT '',
        visibility varchar(10) NOT NULL DEFAULT 'draft',
        featured tinyint(1) NOT NULL DEFAULT 0,
        cancelled tinyint(1) NOT NULL DEFAULT 0,
        cal_uid varchar(120) NOT NULL DEFAULT '',
        duty_list_id bigint(20) unsigned NULL,
        created datetime NOT NULL,
        updated datetime NULL,
        updated_by varchar(120) NOT NULL DEFAULT '',
        PRIMARY KEY  (id),
        KEY date (date),
        KEY cal_uid (cal_uid)
    ) $c;");
}

/** Seite, auf der [ww_veranstaltungen] steht – Ziel der Links „Mehr erfahren“ (einmal je Stunde gesucht). */
function myf_events_page_url() {
    global $wpdb;
    $id = get_transient('myf_events_page');
    if ($id === false) {
        $id = (int) $wpdb->get_var("SELECT ID FROM {$wpdb->posts} WHERE post_status = 'publish' AND post_type IN ('page','post') AND post_content LIKE '%[ww_veranstaltungen%' ORDER BY post_type = 'page' DESC, ID LIMIT 1");
        set_transient('myf_events_page', $id, HOUR_IN_SECONDS);
    }
    return $id ? (string) get_permalink($id) : '';
}
add_action('save_post', function () { delete_transient('myf_events_page'); });

function myf_event_url($id) { $p = myf_events_page_url(); return $p ? add_query_arg('veranstaltung', (int) $id, $p) : ''; }
function myf_events_ics_url($id = 0) { $u = rest_url('myf/v1/events/ics'); return $id ? add_query_arg('id', (int) $id, $u) : $u; }

/** Kalendertermine nach Kennung (im Demo-Bestand leer – echte Kalender gehören nicht in die Demo). */
function myf_events_cal() {
    static $c = null;
    if ($c === null) { $c = []; if (function_exists('myf_drill_cal_events')) foreach (myf_drill_cal_events() as $e) $c[$e['cal_uid']] = $e; }
    return $c;
}

/** Zeile → Ausgabe; ist ein Kalendertermin verknüpft, kommen Datum und Uhrzeit von dort. */
function myf_event_out($r) {
    $o = ['id' => (int) $r->id, 'title' => $r->title, 'date' => $r->date, 'end_date' => $r->end_date ?: $r->date, 'time' => $r->time_from, 'time_to' => $r->time_to,
        'place' => $r->place, 'teaser' => $r->teaser, 'body' => (string) $r->body, 'image' => $r->image, 'link' => $r->link, 'link_label' => $r->link_label,
        'visibility' => isset(MYF_EVENT_VIS[$r->visibility]) ? $r->visibility : 'draft', 'featured' => (bool) $r->featured, 'cancelled' => (bool) $r->cancelled,
        'cal_uid' => $r->cal_uid, 'cal' => '', 'ask_id' => !empty($r->duty_list_id) ? (int) $r->duty_list_id : 0, 'updated' => $r->updated ?: $r->created, 'updated_by' => $r->updated_by];
    if ($r->cal_uid !== '') {
        $cal = myf_events_cal();
        if (isset($cal[$r->cal_uid])) {
            $c = $cal[$r->cal_uid]; $o['cal'] = 'live';
            $o['date'] = $c['date']; $o['end_date'] = $c['end_date'] ?: $c['date']; $o['time'] = (string) $c['time']; $o['time_to'] = (string) $c['time_to'];
            if ($o['title'] === '') $o['title'] = (string) $c['title'];
            if ($o['place'] === '') $o['place'] = (string) ($c['place'] ?? '');
        } elseif ($cal) $o['cal'] = 'gone'; // stand im Kalender, ist dort nicht mehr – die gespeicherten Angaben gelten weiter
    }
    $o['url'] = $o['visibility'] === 'public' ? myf_event_url($o['id']) : '';
    return $o;
}

/**
 * Veranstaltungen für einen Kreis: 'public' (Website), 'members' (Mitgliederbereich und App), 'admin' (alles).
 * $past: auch Vergangenes der letzten $past Tage.
 */
function myf_events($scope = 'public', $past = 0) {
    global $wpdb;
    $vis = $scope === 'admin' ? "1=1" : ($scope === 'members' ? "visibility IN ('public','members')" : "visibility = 'public'");
    // großzügig laden (verknüpfte Termine können im Kalender verschoben sein), danach mit dem echten Datum filtern
    $rows = $wpdb->get_results('SELECT * FROM ' . myf_t('events') . " WHERE $vis ORDER BY date, time_from LIMIT 500");
    $from = date('Y-m-d', current_time('timestamp') - $past * DAY_IN_SECONDS);
    $out = [];
    foreach ($rows as $r) { $o = myf_event_out($r); if ($o['end_date'] >= $from) $out[] = $o; }
    usort($out, function ($a, $b) { return strcmp($a['date'] . $a['time'], $b['date'] . $b['time']); });
    return $out;
}
/** Öffentliche Felder (keine internen Kennungen, kein Bearbeiter). */
function myf_event_public($o) {
    return array_intersect_key($o, array_flip(['id', 'title', 'date', 'end_date', 'time', 'time_to', 'place', 'teaser', 'body', 'image', 'link', 'link_label', 'featured', 'cancelled', 'url'])) + ['ics' => myf_events_ics_url($o['id'])];
}

/** „Sa., 12. Juni 2027, 11–17 Uhr“ */
function myf_event_when($o, $long = true) {
    $a = strtotime($o['date']); $b = strtotime($o['end_date']);
    $d = $o['end_date'] > $o['date'] ? date_i18n($long ? 'D, j. F' : 'j.n.', $a) . ' – ' . date_i18n($long ? 'D, j. F Y' : 'j.n.Y', $b) : date_i18n($long ? 'l, j. F Y' : 'j.n.Y', $a);
    if ($o['time'] !== '') $d .= ', ' . ($o['time_to'] !== '' && $o['time_to'] !== '23:59' && $o['end_date'] === $o['date'] ? $o['time'] . '–' . $o['time_to'] : 'ab ' . $o['time']) . ' Uhr';
    return $d;
}

// ---- Verwaltung ------------------------------------------------------------------------------------------------
function myf_event_save(WP_REST_Request $req) {
    global $wpdb;
    $t = myf_t('events'); $id = (int) $req->get_param('id');
    $old = $id ? $wpdb->get_row($wpdb->prepare("SELECT * FROM $t WHERE id = %d", $id)) : null;
    if ($id && !$old) return myf_err('Veranstaltung nicht gefunden.', 404);
    $txt = function ($k, $max) use ($req) { return mb_substr(sanitize_text_field((string) $req->get_param($k)), 0, $max); };
    $time = function ($k) use ($req) { $v = trim((string) $req->get_param($k)); return preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $v) ? $v : ''; };
    $d = ['title' => $txt('title', 200), 'date' => myf_date_or_null($req->get_param('date')), 'end_date' => myf_date_or_null($req->get_param('end_date')),
        'time_from' => $time('time'), 'time_to' => $time('time_to'), 'place' => $txt('place', 200), 'teaser' => $txt('teaser', 300),
        'body' => mb_substr(sanitize_textarea_field((string) $req->get_param('body')), 0, 8000), 'link_label' => $txt('link_label', 60),
        'visibility' => isset(MYF_EVENT_VIS[$req->get_param('visibility')]) ? $req->get_param('visibility') : ($old ? $old->visibility : 'draft'),
        'featured' => $req->get_param('featured') ? 1 : 0, 'cancelled' => $req->get_param('cancelled') ? 1 : 0];
    $link = trim((string) $req->get_param('link'));
    if ($link !== '' && !preg_match('#^https?://#i', $link)) $link = 'https://' . $link;
    $d['link'] = $link === '' ? '' : mb_substr(esc_url_raw($link, ['http', 'https']), 0, 255);
    if ($link !== '' && $d['link'] === '') return myf_err('Der Link ist keine gültige Adresse.');
    // Mit Kalendertermin verknüpft: Datum und Uhrzeit von dort übernehmen (bleiben als letzter Stand gespeichert)
    $uid = $req->has_param('cal_uid') ? mb_substr((string) $req->get_param('cal_uid'), 0, 120) : ($old ? $old->cal_uid : '');
    if ($uid !== '') {
        $cal = myf_events_cal();
        if (isset($cal[$uid])) {
            $c = $cal[$uid];
            $d['date'] = $c['date']; $d['end_date'] = $c['end_date'] ?: null; $d['time_from'] = (string) $c['time']; $d['time_to'] = (string) $c['time_to'];
            if ($d['title'] === '') $d['title'] = mb_substr((string) $c['title'], 0, 200);
            if ($d['place'] === '' && !$old) $d['place'] = mb_substr((string) ($c['place'] ?? ''), 0, 200);
        } elseif (!$old || $old->cal_uid !== $uid) return myf_err('Dieser Kalendertermin ist nicht mehr im Kalender.');
        $dupe = (int) $wpdb->get_var($wpdb->prepare("SELECT id FROM $t WHERE cal_uid = %s AND id <> %d", $uid, $id));
        if ($dupe) return myf_err('Dieser Kalendertermin ist schon eine Veranstaltung.');
    }
    $d['cal_uid'] = $uid;
    // Abfrage für die Mitglieder („Wer hilft?“): nur vorhandene Abfragen aus „Abfragen“
    if ($req->has_param('ask_id')) {
        $ask = (int) $req->get_param('ask_id');
        if ($ask && !$wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('duty_lists') . " WHERE id = %d AND area = 'duties'", $ask))) return myf_err('Diese Abfrage gibt es nicht (mehr).');
        $d['duty_list_id'] = $ask ?: null;
    }
    if ($d['title'] === '') return myf_err('Bitte einen Titel eingeben.');
    if (!$d['date']) return myf_err('Bitte ein Datum wählen.');
    if ($d['end_date'] && $d['end_date'] < $d['date']) return myf_err('Das Ende liegt vor dem Beginn.');
    if ($d['end_date'] === $d['date']) $d['end_date'] = null;
    if ($d['time_from'] === '') $d['time_to'] = '';
    if (!$d['end_date'] && $d['time_to'] !== '' && $d['time_to'] <= $d['time_from']) return myf_err('Die Endzeit liegt vor dem Beginn.');
    if ($req->get_param('image')) {
        if (strpos((string) $req->get_param('image'), 'data:image/') !== 0) return myf_err('Bitte ein Bild wählen (JPG, PNG oder WebP).');
        $u = myf_save_file($req->get_param('image'), 'veranstaltung-');
        if (!$u) return myf_err('Bild nicht erkannt – bitte JPG, PNG oder WebP bis 8 MB.');
        $d['image'] = $u;
    } elseif ($req->get_param('image_remove')) $d['image'] = '';
    $who = wp_get_current_user()->display_name;
    if ($old) $wpdb->update($t, $d + ['updated' => current_time('mysql'), 'updated_by' => $who], ['id' => $id]);
    else { $wpdb->insert($t, $d + ['created' => current_time('mysql'), 'updated_by' => $who]); $id = (int) $wpdb->insert_id; }
    return ['id' => $id];
}

add_action('rest_api_init', function () {
    $ns = 'myf/v1';
    // Nur die Verwaltung (myf_route_area kennt die Route nicht → „full“)
    register_rest_route($ns, '/admin/event', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => 'myf_event_save']);
    register_rest_route($ns, '/admin/event/delete', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $id = (int) $req->get_param('id');
        if (!$wpdb->delete(myf_t('events'), ['id' => $id])) return myf_err('Veranstaltung nicht gefunden.', 404);
        return ['ok' => true, 'id' => $id];
    }]);
    // Öffentlich: nur was ausdrücklich als öffentlich freigegeben ist (für Website-Bausteine und andere Apps)
    register_rest_route($ns, '/events', ['methods' => 'GET', 'permission_callback' => '__return_true', 'callback' => function () {
        if (myf_demo_ctx()) return ['events' => []];
        return ['events' => array_map('myf_event_public', myf_events('public'))];
    }]);
    register_rest_route($ns, '/events/ics', ['methods' => 'GET', 'permission_callback' => '__return_true', 'callback' => 'myf_api_events_ics']);
});

/** Öffentliches Kalender-Abo (alle öffentlichen Veranstaltungen) bzw. eine einzelne Veranstaltung zum Speichern. */
function myf_api_events_ics(WP_REST_Request $req) {
    $one = (int) $req->get_param('id');
    $list = myf_demo_ctx() ? [] : myf_events('public', 60);
    if ($one) { $list = array_values(array_filter($list, function ($o) use ($one) { return $o['id'] === $one; })); if (!$list) return myf_err('Veranstaltung nicht gefunden.', 404); }
    $out = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//SPIND//Veranstaltungen//DE\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n"
        . 'X-WR-CALNAME:' . myf_ics_text(myf_brand()['org'] . ' – Veranstaltungen') . "\r\nX-WR-TIMEZONE:" . wp_timezone_string() . "\r\nREFRESH-INTERVAL;VALUE=DURATION:PT6H\r\n";
    foreach ($list as $o) $out .= myf_event_vevent($o);
    $out .= "END:VCALENDAR\r\n";
    header('X-Robots-Tag: noindex, nofollow'); header('Cache-Control: public, max-age=900');
    header('Content-Type: text/calendar; charset=utf-8'); header('Content-Disposition: ' . ($one ? 'attachment' : 'inline') . '; filename="veranstaltung' . ($one ? '-' . $one : 'en') . '.ics"');
    echo $out; exit;
}
function myf_event_vevent($o) {
    $host = wp_parse_url(home_url(), PHP_URL_HOST); $tz = wp_timezone_string();
    $ymd = function ($d) { return str_replace('-', '', $d); };
    if ($o['time'] !== '') {
        $endT = $o['time_to'] !== '' ? $o['time_to'] : date('H:i', strtotime($o['time'] . ' +2 hours'));
        $endD = $o['end_date'];
        if ($endD === $o['date'] && $endT <= $o['time']) $endD = date('Y-m-d', strtotime($o['date'] . ' +1 day')); // über Mitternacht
        $when = "DTSTART;TZID=$tz:" . $ymd($o['date']) . 'T' . str_replace(':', '', $o['time']) . "00\r\nDTEND;TZID=$tz:" . $ymd($endD) . 'T' . str_replace(':', '', $endT) . "00\r\n";
    } else $when = 'DTSTART;VALUE=DATE:' . $ymd($o['date']) . "\r\nDTEND;VALUE=DATE:" . gmdate('Ymd', strtotime($o['end_date'] . ' +1 day')) . "\r\n";
    $desc = trim($o['teaser'] . ($o['body'] !== '' ? "\n\n" . $o['body'] : ''));
    return "BEGIN:VEVENT\r\nUID:ev" . $o['id'] . '@' . $host . "\r\nDTSTAMP:" . gmdate('Ymd\THis\Z', strtotime(get_gmt_from_date($o['updated'] ?: current_time('mysql')))) . "\r\n" . $when
        . 'SUMMARY:' . myf_ics_text(($o['cancelled'] ? 'Abgesagt: ' : '') . $o['title']) . "\r\n" . ($o['place'] !== '' ? 'LOCATION:' . myf_ics_text($o['place']) . "\r\n" : '')
        . ($desc !== '' ? 'DESCRIPTION:' . myf_ics_text(mb_substr($desc, 0, 1500)) . "\r\n" : '') . (!empty($o['url']) ? 'URL:' . esc_url_raw($o['url']) . "\r\n" : '')
        . ($o['cancelled'] ? "STATUS:CANCELLED\r\n" : '') . "TRANSP:TRANSPARENT\r\nEND:VEVENT\r\n";
}

// Kalender-Abo der Mitglieder: Veranstaltungen ergänzen; ist ein Kalendertermin verknüpft, ersetzt die Veranstaltung ihn (kein Doppel)
add_filter('myf_ics_events', function ($events, $m) {
    global $wpdb;
    $list = myf_events('members', 60);
    if (!$list) return $events;
    $drop = [];
    foreach ($list as $o) if ($o['cal_uid'] !== '') {
        $drop['c' . $o['cal_uid']] = true;
        $rid = (int) $wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('drills') . ' WHERE cal_uid = %s', $o['cal_uid']));
        if ($rid) $drop['u' . $rid] = true;
    }
    $events = array_values(array_filter($events, function ($e) use ($drop) { return !isset($drop[$e['uid']]); }));
    foreach ($list as $o) {
        $e = ['uid' => 'ev' . $o['id'], 'start' => $o['date'], 'end' => $o['end_date'], 'title' => ($o['cancelled'] ? 'Abgesagt: ' : '') . $o['title'], 'loc' => $o['place']];
        if ($o['time'] !== '') {
            $e['time'] = $o['time']; $e['endtime'] = $o['time_to'] !== '' ? $o['time_to'] : date('H:i', strtotime($o['time'] . ' +2 hours'));
            if ($e['end'] === $e['start'] && $e['endtime'] <= $e['time']) $e['endtime'] = '23:59';
        }
        $events[] = $e;
    }
    return $events;
}, 30, 2);

// Mitgliederbereich und App
add_filter('myf_me_data', function ($data, $me) {
    $all = myf_events('members');
    // Verknüpfte Kalendertermine im Dienstplan kennzeichnen: im Kalender zeigt der Mitgliederbereich dann nur die Veranstaltung
    $byUid = []; foreach ($all as $o) if ($o['cal_uid'] !== '') $byUid[$o['cal_uid']] = $o['id'];
    if ($byUid && !empty($data['drills'])) foreach ($data['drills'] as $i => $r) if (!empty($r['cal_uid']) && isset($byUid[$r['cal_uid']])) $data['drills'][$i]['event_id'] = $byUid[$r['cal_uid']];
    $asks = array_column((array) ($data['duty_lists'] ?? []), 'id'); // nur Abfragen, die das Mitglied sehen darf
    $data['events'] = array_map(function ($o) use ($asks) { unset($o['cal_uid'], $o['updated_by'], $o['updated'], $o['cal']); if (!in_array($o['ask_id'], $asks, true)) $o['ask_id'] = 0; return $o + ['ics' => $o['visibility'] === 'public' ? myf_events_ics_url($o['id']) : '']; }, array_slice($all, 0, 40));
    return $data;
}, 30, 2);

add_filter('myf_admin_state', function ($d) {
    if (!myf_can_manage()) return $d;
    $all = myf_events('admin', 400);
    $d['events'] = $all;
    $d['event_vis'] = MYF_EVENT_VIS;
    // Kalendertermine, die noch keine Veranstaltung sind (kommende, ohne Dienstabende und Lehrgänge zuerst)
    $used = array_flip(array_filter(array_column($all, 'cal_uid')));
    $today = current_time('Y-m-d'); $cand = [];
    foreach (myf_events_cal() as $c) {
        if (($c['end_date'] ?: $c['date']) < $today || isset($used[$c['cal_uid']])) continue;
        $cand[] = ['uid' => $c['cal_uid'], 'title' => $c['title'], 'date' => $c['date'], 'time' => (string) $c['time'], 'place' => (string) ($c['place'] ?? ''), 'kind' => (string) ($c['cal_kind'] ?? '')];
    }
    usort($cand, function ($a, $b) { return [$a['kind'] !== 'termin', $a['date']] <=> [$b['kind'] !== 'termin', $b['date']]; });
    $d['event_cal'] = array_slice($cand, 0, 60);
    $d['event_info'] = ['page' => myf_events_page_url(), 'ics' => myf_events_ics_url(), 'api' => rest_url('myf/v1/events')];
    return $d;
});

// ---- Website: Bausteine ------------------------------------------------------------------------------------------
function myf_events_css() {
    static $done = false; if ($done) return ''; $done = true;
    return '<style>.ww-ev{margin:12px 0 28px}.ww-ev h2.ww-ev-h{margin:0 0 16px}.ww-ev-grid{display:grid;gap:18px;grid-template-columns:repeat(auto-fill,minmax(min(100%,290px),1fr))}'
        . '.ww-ev-card{display:flex;flex-direction:column;border:1px solid rgba(127,127,127,.3);background:rgba(127,127,127,.04);color:inherit;text-decoration:none;position:relative}'
        . 'a.ww-ev-card:hover,a.ww-ev-card:focus-visible{border-color:#e30613;outline:0}.ww-ev-card.is-top{border:2px solid #e30613}'
        . '.ww-ev-img{aspect-ratio:16/9;background:#1a1a1a center/cover no-repeat;display:block}.ww-ev-img.is-none{background:#e30613;display:grid;place-items:center;color:#fff;font-weight:800;font-size:44px;line-height:1}'
        . '.ww-ev-img.is-none small{display:block;font-size:15px;text-transform:uppercase;letter-spacing:.06em;text-align:center}'
        . '.ww-ev-tx{padding:14px 16px 16px;display:flex;flex-direction:column;gap:6px;flex:1}.ww-ev-tx b{font-size:19px;line-height:1.25;font-weight:800}.ww-ev-when{font-weight:700;color:#e30613}'
        . '.ww-ev-mu{opacity:.78;font-size:.95em}.ww-ev-tag{position:absolute;top:12px;left:10px;transform:rotate(-2.2deg);transform-origin:left bottom;background:#e30613;color:#fff;font-weight:800;font-size:12px;text-transform:uppercase;letter-spacing:.06em;padding:4px 8px}'
        . '.ww-ev-tag.is-off{background:#111}.ww-ev-img.is-none+.ww-ev-tag{background:#111}.ww-ev-more{margin-top:auto;padding-top:8px;font-weight:700}.is-off .ww-ev-tx b{text-decoration:line-through}'
        . '.ww-ev-list{display:grid;gap:10px}.ww-ev-row{display:grid;grid-template-columns:64px minmax(0,1fr);gap:14px;align-items:center;padding:12px;border:1px solid rgba(127,127,127,.3);color:inherit;text-decoration:none}'
        . '.ww-ev-row.is-top{border:2px solid #e30613}.ww-ev-row time{background:#e30613;color:#fff;text-align:center;padding:8px 4px;line-height:1}.ww-ev-row time b{display:block;font-size:28px;font-weight:800}'
        . '.ww-ev-row time small{display:block;font-weight:700;text-transform:uppercase;font-size:13px;margin-top:3px}.ww-ev-row span b{display:block;font-size:17px;line-height:1.25;font-weight:800}.ww-ev-row span small{display:block;opacity:.78;margin-top:2px}'
        . '.ww-ev-one{display:grid;gap:18px;grid-template-columns:minmax(0,1fr)}.ww-ev-one img{width:100%;max-height:440px;object-fit:cover;display:block}.ww-ev-one h2{margin:0 0 6px}.ww-ev-facts{display:grid;gap:4px;margin:10px 0 16px;padding:12px 14px;border-left:4px solid #e30613;background:rgba(127,127,127,.08)}'
        . '.ww-ev-btns{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}.ww-ev-btn{display:inline-block;padding:10px 16px;font-weight:700;text-decoration:none;border:2px solid #e30613;color:#e30613;background:transparent}'
        . '.ww-ev-btn.is-main{background:#e30613;color:#fff}.ww-ev-note{padding:10px 14px;background:#111;color:#fff;font-weight:700;margin-bottom:14px}'
        . '</style>';
}
function myf_event_card($o, $more = true) {
    $ts = strtotime($o['date']);
    $img = $o['image'] !== '' ? '<span class="ww-ev-img" style="background-image:url(\'' . esc_url($o['image']) . '\')" role="img" aria-label=""></span>'
        : '<span class="ww-ev-img is-none"><span>' . date_i18n('j', $ts) . '<small>' . date_i18n('M Y', $ts) . '</small></span></span>';
    $tag = $o['cancelled'] ? '<span class="ww-ev-tag is-off">Abgesagt</span>' : ($o['featured'] ? '<span class="ww-ev-tag">Besonderer Termin</span>' : '');
    $in = $img . $tag . '<span class="ww-ev-tx"><span class="ww-ev-when">' . esc_html(myf_event_when($o)) . '</span><b>' . esc_html($o['title']) . '</b>'
        . ($o['place'] !== '' ? '<span class="ww-ev-mu">' . esc_html($o['place']) . '</span>' : '') . ($o['teaser'] !== '' ? '<span>' . esc_html($o['teaser']) . '</span>' : '')
        . ($more && $o['url'] ? '<span class="ww-ev-more">Mehr erfahren →</span>' : '') . '</span>';
    $cls = 'ww-ev-card' . ($o['featured'] ? ' is-top' : '') . ($o['cancelled'] ? ' is-off' : '');
    return $more && $o['url'] ? '<a class="' . $cls . '" href="' . esc_url($o['url']) . '">' . $in . '</a>' : '<div class="' . $cls . '">' . $in . '</div>';
}
/** Einzelansicht mit Beschreibung, „In meinen Kalender“ und Angaben für Suchmaschinen (schema.org/Event). */
function myf_event_detail($o, $back = '') {
    $h = '<article class="ww-ev-one' . ($o['image'] !== '' ? ' has-img' : '') . '">' . ($o['image'] !== '' ? '<img src="' . esc_url($o['image']) . '" alt="" loading="lazy">' : '') . '<div>'
        . ($o['cancelled'] ? '<div class="ww-ev-note">Diese Veranstaltung ist abgesagt.</div>' : '')
        . '<h2>' . esc_html($o['title']) . '</h2>' . ($o['teaser'] !== '' ? '<p><b>' . esc_html($o['teaser']) . '</b></p>' : '')
        . '<div class="ww-ev-facts"><span><b>Wann:</b> ' . esc_html(myf_event_when($o)) . '</span>' . ($o['place'] !== '' ? '<span><b>Wo:</b> ' . esc_html($o['place']) . '</span>' : '') . '</div>'
        . ($o['body'] !== '' ? wpautop(make_clickable(esc_html($o['body']))) : '')
        . '<div class="ww-ev-btns">' . ($o['link'] !== '' ? '<a class="ww-ev-btn is-main" href="' . esc_url($o['link']) . '" rel="noopener">' . esc_html($o['link_label'] !== '' ? $o['link_label'] : 'Mehr dazu') . '</a>' : '')
        . ($o['cancelled'] ? '' : '<a class="ww-ev-btn' . ($o['link'] === '' ? ' is-main' : '') . '" href="' . esc_url(myf_events_ics_url($o['id'])) . '">In meinen Kalender</a>')
        . ($back ? '<a class="ww-ev-btn" href="' . esc_url($back) . '">← Alle Veranstaltungen</a>' : '') . '</div></div></article>';
    $tz = wp_timezone(); $iso = function ($d, $t) use ($tz) { return $t !== '' ? (new DateTime($d . ' ' . $t, $tz))->format('c') : $d; };
    $ld = ['@context' => 'https://schema.org', '@type' => 'Event', 'name' => $o['title'], 'startDate' => $iso($o['date'], $o['time']),
        'endDate' => $iso($o['end_date'], $o['time'] !== '' ? ($o['time_to'] !== '' ? $o['time_to'] : $o['time']) : ''),
        'eventStatus' => 'https://schema.org/' . ($o['cancelled'] ? 'EventCancelled' : 'EventScheduled'), 'eventAttendanceMode' => 'https://schema.org/OfflineEventAttendanceMode',
        'organizer' => ['@type' => 'Organization', 'name' => myf_brand()['org'], 'url' => home_url('/')]];
    if ($o['place'] !== '') $ld['location'] = ['@type' => 'Place', 'name' => $o['place'], 'address' => $o['place']];
    if ($o['teaser'] !== '' || $o['body'] !== '') $ld['description'] = mb_substr(trim($o['teaser'] . ' ' . $o['body']), 0, 500);
    if ($o['image'] !== '') $ld['image'] = [$o['image']];
    return $h . '<script type="application/ld+json">' . wp_json_encode($ld, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG) . '</script>';
}
function myf_events_wrap($inner, $title) {
    $own = function_exists('myf_site_is') && myf_site_is();
    $head = $title !== '' ? '<h2 class="ws-h ww-ev-h"><span>' . esc_html($title) . '</span></h2>' : '';
    return myf_events_css() . ($own ? '<section class="ws-sec"><div class="ws-wrap">' : '') . '<div class="ww-ev">' . $head . $inner . '</div>' . ($own ? '</div></section>' : '');
}

// Liste: [ww_veranstaltungen anzahl="6" titel="Veranstaltungen" nur="alle|hervorgehoben" ansicht="karten|liste" abo="ja" leer="…"]
// Auf derselben Seite zeigt „…?veranstaltung=12“ die Einzelansicht.
add_shortcode('ww_veranstaltungen', function ($a) {
    $a = shortcode_atts(['anzahl' => 6, 'titel' => 'Veranstaltungen', 'nur' => 'alle', 'ansicht' => 'karten', 'abo' => 'ja', 'leer' => 'Zurzeit sind keine Veranstaltungen angekündigt.'], $a);
    if (myf_demo_ctx()) return '';
    $one = isset($_GET['veranstaltung']) ? (int) $_GET['veranstaltung'] : 0;
    if ($one) {
        foreach (myf_events('public', 60) as $o) if ($o['id'] === $one) return myf_events_wrap(myf_event_detail($o, remove_query_arg('veranstaltung')), '');
        return myf_events_wrap('<p class="ww-ev-mu">Diese Veranstaltung gibt es nicht (mehr). <a href="' . esc_url(remove_query_arg('veranstaltung')) . '">Alle Veranstaltungen</a></p>', '');
    }
    $list = myf_events('public');
    if ($a['nur'] === 'hervorgehoben') $list = array_values(array_filter($list, function ($o) { return $o['featured']; }));
    $list = array_slice($list, 0, max(1, min(48, (int) $a['anzahl'])));
    if (!$list) return myf_events_wrap('<p class="ww-ev-mu">' . esc_html($a['leer']) . '</p>', $a['titel']);
    if ($a['ansicht'] === 'liste') $h = '<div class="ww-ev-list">' . implode('', array_map('myf_event_row', $list)) . '</div>';
    else $h = '<div class="ww-ev-grid">' . implode('', array_map('myf_event_card', $list)) . '</div>';
    if ($a['abo'] !== 'nein') $h .= '<p class="ww-ev-mu" style="margin-top:14px"><a href="' . esc_url(preg_replace('#^https?:#', 'webcal:', myf_events_ics_url())) . '">Veranstaltungen im eigenen Kalender abonnieren</a></p>';
    return myf_events_wrap($h, $a['titel']);
});
function myf_event_row($o) {
    $ts = strtotime($o['date']);
    $in = '<time datetime="' . esc_attr($o['date']) . '"><b>' . date_i18n('d', $ts) . '</b><small>' . date_i18n('M', $ts) . '</small></time><span><b>' . ($o['cancelled'] ? 'Abgesagt: ' : '') . esc_html($o['title']) . '</b><small>'
        . esc_html(date_i18n('l', $ts) . ($o['time'] !== '' ? ', ' . ($o['time_to'] !== '' && $o['time_to'] !== '23:59' ? $o['time'] . '–' . $o['time_to'] : 'ab ' . $o['time']) . ' Uhr' : '') . ($o['place'] !== '' ? ' · ' . $o['place'] : '')) . '</small></span>';
    $cls = 'ww-ev-row' . ($o['featured'] ? ' is-top' : '');
    return $o['url'] ? '<a class="' . $cls . '" href="' . esc_url($o['url']) . '">' . $in . '</a>' : '<div class="' . $cls . '">' . $in . '</div>';
}
// Eine Veranstaltung hervorheben: [ww_veranstaltung id="12"] oder [ww_veranstaltung] = die nächste hervorgehobene; ansicht="karte|voll"
add_shortcode('ww_veranstaltung', function ($a) {
    $a = shortcode_atts(['id' => 0, 'ansicht' => 'karte', 'titel' => ''], $a);
    if (myf_demo_ctx()) return '';
    $list = myf_events('public', (int) $a['id'] ? 60 : 0); $hit = null;
    foreach ($list as $o) if ((int) $a['id'] ? $o['id'] === (int) $a['id'] : $o['featured']) { $hit = $o; break; }
    if (!$hit) return ''; // nichts anzukündigen: der Baustein verschwindet von selbst
    return myf_events_wrap($a['ansicht'] === 'voll' ? myf_event_detail($hit) : '<div class="ww-ev-grid" style="grid-template-columns:minmax(0,560px)">' . myf_event_card($hit) . '</div>', $a['titel']);
});
