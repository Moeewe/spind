<?php
/** Kalender-Abo (ICS) für Handy und Outlook. Kalender-Apps können sich nicht anmelden, daher persönlicher Geheim-Link. */

defined('ABSPATH') || exit;

function myf_ics_token($m) {
    return substr(hash_hmac('sha256', 'ics|' . (int) $m->id . '|' . $m->ics_ver, wp_salt('logged_in')), 0, 32);
}

function myf_ics_urls($m) {
    $base = rest_url('myf/v1/ics');
    $q = function ($scope) use ($m, $base) { return add_query_arg(['m' => (int) $m->id, 't' => myf_ics_token($m), 's' => $scope], $base); };
    return ['mine' => $q('mine'), 'all' => $q('all')];
}

add_action('rest_api_init', function () {
    register_rest_route('myf/v1', '/ics', ['methods' => 'GET', 'permission_callback' => '__return_true', 'callback' => 'myf_api_ics']);
});

// Fahrzeugkalender: freigegebene Buchungen eines Fahrzeugs (mit Uhrzeit, Zweck, Fahrer) – zum Abonnieren z. B. im Kalender der Jugendfeuerwehr
function myf_api_vehicle_ics(WP_REST_Request $req) {
    global $wpdb;
    $vid = (int) $req->get_param('v');
    $v = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('vehicles') . ' WHERE id = %d AND active = 1', $vid));
    if (!$v || !function_exists('myf_vehicle_ics_token') || !hash_equals(myf_vehicle_ics_token($vid), (string) $req->get_param('t'))) return myf_err('Ungültiger Kalender-Link.', 403);
    $host = wp_parse_url(home_url(), PHP_URL_HOST); $stamp = gmdate('Ymd\THis\Z');
    $out = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Wehrwerk//Fahrzeugkalender//DE\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n" . 'X-WR-CALNAME:' . myf_ics_text($v->name . ' – Belegung') . "\r\nX-WR-TIMEZONE:Europe/Berlin\r\nREFRESH-INTERVAL;VALUE=DURATION:PT1H\r\n";
    $from = date('Y-m-d', current_time('timestamp') - 180 * DAY_IN_SECONDS);
    foreach ($wpdb->get_results($wpdb->prepare('SELECT b.*, m.name AS mname FROM ' . myf_t('bookings') . ' b LEFT JOIN ' . myf_t('members') . " m ON m.id = b.member_id WHERE b.vehicle_id = %d AND b.status = 'approved' AND b.end >= %s ORDER BY b.start", $vid, $from)) as $b) {
        $out .= "BEGIN:VEVENT\r\nUID:vb" . $b->id . '@' . $host . "\r\nDTSTAMP:$stamp\r\nDTSTART;TZID=Europe/Berlin:" . date('Ymd\THis', strtotime($b->start)) . "\r\nDTEND;TZID=Europe/Berlin:" . date('Ymd\THis', strtotime($b->end)) . "\r\n"
            . 'SUMMARY:' . myf_ics_text($v->name . ': ' . $b->purpose . (!empty($b->driver) ? ' – ' . $b->driver : ($b->mname ? ' – ' . $b->mname : ''))) . "\r\nTRANSP:OPAQUE\r\nEND:VEVENT\r\n";
    }
    $out .= "END:VCALENDAR\r\n";
    nocache_headers(); header('X-Robots-Tag: noindex, nofollow'); header('Content-Type: text/calendar; charset=utf-8'); header('Content-Disposition: inline; filename="fahrzeug-' . $vid . '.ics"');
    echo $out; exit;
}

function myf_ics_text($s) { return str_replace(["\\", ";", ",", "\r\n", "\n"], ["\\\\", "\\;", "\\,", "\\n", "\\n"], (string) $s); }

function myf_api_ics(WP_REST_Request $req) {
    global $wpdb;
    if ($req->get_param('v')) return myf_api_vehicle_ics($req);
    $m = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('members') . ' WHERE id = %d AND active = 1', (int) $req->get_param('m')));
    if (!$m || !hash_equals(myf_ics_token($m), (string) $req->get_param('t'))) return myf_err('Ungültiger Kalender-Link.', 403);
    $all = $req->get_param('s') === 'all';
    $from = (string) ((int) current_time('Y') - 1) . '-01-01';

    // Eigene Termine: zugeteilte bzw. absolvierte Lehrgänge und geplante Übungsstrecken
    $mine = $wpdb->get_results($wpdb->prepare(
        'SELECT d.*, c.title, c.short FROM ' . myf_t('needs') . ' n JOIN ' . myf_t('dates') . ' d ON d.id = n.date_id
         JOIN ' . myf_t('courses') . ' c ON c.id = n.course_id WHERE n.member_id = %d AND n.status IN (\'assigned\',\'completed\') AND d.start_date >= %s', $m->id, $from));
    $mineIds = array_map(function ($d) { return (int) $d->id; }, $mine);
    $events = [];
    foreach ($mine as $d) $events[] = ['uid' => 'd' . $d->id, 'start' => $d->start_date, 'end' => $d->end_date ?: $d->start_date,
        'title' => 'Lehrgang: ' . $d->title . ($d->short ? ' (' . $d->short . ')' : ''), 'loc' => $d->location];
    if ($all) {
        $rows = $wpdb->get_results($wpdb->prepare(
            'SELECT d.*, c.title, c.short FROM ' . myf_t('dates') . ' d JOIN ' . myf_t('courses') . ' c ON c.id = d.course_id
             WHERE c.year > 0 AND c.hidden = 0 AND d.start_date >= %s', $from));
        foreach ($rows as $d) {
            if (in_array((int) $d->id, $mineIds, true)) continue;
            $events[] = ['uid' => 'd' . $d->id, 'start' => $d->start_date, 'end' => $d->end_date ?: $d->start_date,
                'title' => $d->title . ($d->short ? ' (' . $d->short . ')' : ''), 'loc' => $d->location];
        }
    }
    if ($m->agt) {
        foreach ($wpdb->get_results($wpdb->prepare('SELECT * FROM ' . myf_t('agt_log') . ' WHERE member_id = %d AND kind = %s AND date >= %s', $m->id, 'strecke', $from)) as $l) {
            $events[] = ['uid' => 'a' . $l->id, 'start' => $l->date, 'end' => $l->date, 'title' => 'Atemschutz-Übungsstrecke', 'loc' => $l->note];
        }
    }

    // Weitere Termine aus anderen Bereichen (Dienste, Fahrzeug, …); mit Uhrzeit: 'time' => 'HH:MM', 'endtime'
    $events = apply_filters('myf_ics_events', $events, $m, $all);
    $host = wp_parse_url(home_url(), PHP_URL_HOST);
    $out = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Wehrwerk//Feuerwehr-Portal//DE\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n"
        . 'X-WR-CALNAME:' . myf_ics_text($all ? myf_brand()['org'] . ' – Termine' : myf_brand()['app'] . ' – meine Termine') . "\r\n"
        . "X-WR-TIMEZONE:Europe/Berlin\r\nREFRESH-INTERVAL;VALUE=DURATION:PT6H\r\n";
    $stamp = gmdate('Ymd\THis\Z');
    foreach ($events as $e) {
        $end = gmdate('Ymd', strtotime($e['end'] . ' +1 day'));
        $when = !empty($e['time'])
            ? 'DTSTART;TZID=Europe/Berlin:' . str_replace('-', '', $e['start']) . 'T' . str_replace(':', '', $e['time']) . "00\r\nDTEND;TZID=Europe/Berlin:" . str_replace('-', '', $e['end']) . 'T' . str_replace(':', '', $e['endtime'] ?? $e['time']) . "00\r\n"
            : 'DTSTART;VALUE=DATE:' . str_replace('-', '', $e['start']) . "\r\nDTEND;VALUE=DATE:$end\r\n";
        $out .= "BEGIN:VEVENT\r\nUID:" . $e['uid'] . '@' . $host . "\r\nDTSTAMP:$stamp\r\n" . $when
            . 'SUMMARY:' . myf_ics_text($e['title']) . "\r\n" . ($e['loc'] ? 'LOCATION:' . myf_ics_text($e['loc']) . "\r\n" : '')
            . "TRANSP:TRANSPARENT\r\nEND:VEVENT\r\n";
    }
    $out .= "END:VCALENDAR\r\n";

    nocache_headers();
    header('X-Robots-Tag: noindex, nofollow');
    header('Content-Type: text/calendar; charset=utf-8');
    header('Content-Disposition: inline; filename="myfeuerwehr.ics"');
    echo $out;
    exit;
}
