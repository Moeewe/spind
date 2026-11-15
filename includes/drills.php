<?php
/**
 * Jahresdienstplan (Übungsdienste): Termine mit Thema und Verantwortlichen, je Halbjahr – wie der Papier-/PDF-Dienstplan.
 * Eingabe einzeln oder per Einfügen aus Excel, Original-PDF anhängbar. Mitglieder sehen ihn unter „Dienste“, im Kalender
 * (auch im Abo) und auf dem Dashboard. Getrennt davon: Einteilungen wie Grünanlagen-Pflege (duties.php).
 */

defined('ABSPATH') || exit;

function myf_install_drills($c) {
    global $wpdb;
    $p = myf_t(''); // echte oder Demo-Tabellen (Demo-Modus)
    dbDelta("CREATE TABLE {$p}drills (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        date date NOT NULL,
        time_from varchar(5) NOT NULL DEFAULT '',
        title varchar(200) NOT NULL DEFAULT '',
        leader varchar(160) NOT NULL DEFAULT '',
        unit varchar(20) NOT NULL DEFAULT '',
        note varchar(255) NOT NULL DEFAULT '',
        cal_uid varchar(120) NOT NULL DEFAULT '',
        created datetime NOT NULL,
        PRIMARY KEY  (id),
        KEY date (date)
    ) $c;");
    // Abmeldungen vom Dienst („kann nicht“) – ersetzt nicht die Unterschriftenliste, steht aber schon drauf
    dbDelta("CREATE TABLE {$p}drill_absence (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        drill_id bigint(20) unsigned NOT NULL,
        member_id bigint(20) unsigned NOT NULL,
        reason varchar(120) NOT NULL DEFAULT '',
        created datetime NOT NULL,
        PRIMARY KEY  (id),
        UNIQUE KEY drill_member (drill_id, member_id)
    ) $c;");
}
function myf_drill_out($r) {
    return ['id' => (int) $r->id, 'date' => $r->date, 'time' => $r->time_from, 'title' => $r->title, 'lead' => $r->leader, 'unit' => $r->unit, 'note' => $r->note];
}
function myf_drill_files() { return array_values((array) (myf_settings()['drill_files'] ?? [])); }

// ---- Dienstplan-Kalender (iCal, z. B. Alamos-Kalender): Termine mit Thema und Verantwortlichen kommen von dort,
// ohne dass jemand sie in Wehrwerk abtippt. Von Hand Eingetragenes bleibt; gleiche Termine werden erkannt und zusammengeführt.
// Mehrere Kalender für den Dienstplan (z. B. „Dienstabende“ und „Lehrgänge“ aus verschiedenen Alamos-Kalendern)
function myf_drill_icals() {
    $s = myf_settings();
    $list = array_values(array_filter((array) ($s['drill_icals'] ?? []), function ($c) { return is_array($c) && !empty($c['url']); }));
    if (!$list && !empty($s['drill_ical'])) $list = [['url' => (string) $s['drill_ical'], 'label' => 'Dienstplan']]; // bisheriger Einzel-Link
    return $list;
}
function myf_drill_icals_save($list) {
    $s = myf_settings();
    $s['drill_icals'] = array_values(array_map(function ($c) { return ['url' => mb_substr((string) $c['url'], 0, 500), 'label' => mb_substr((string) ($c['label'] ?? ''), 0, 60)]; }, $list));
    $s['drill_ical'] = ''; // Einzel-Link nicht mehr nötig
    update_option('myf_settings', $s);
    delete_transient('myf_drill_ical');
}
function myf_drill_ical_url() { $l = myf_drill_icals(); return $l ? (string) $l[0]['url'] : ''; }
function myf_drill_cal_status() { return (array) get_option('myf_drill_ical_st', []); }
// Beschreibung zeilenweise: „Thema: …“, „Verantwortlich: …“ (auch Vorbereitung/Leitung), alles andere bleibt als Hinweis
function myf_drill_cal_desc($desc) {
    $t = ''; $l = ''; $rest = [];
    foreach (preg_split('/\r?\n/', (string) $desc) as $line) {
        $line = trim($line); if ($line === '') continue;
        if (preg_match('/^(this is an event reminder|dies ist eine (termin)?erinnerung)\.?$/iu', $line)) continue; // Standardtext aus Alamos
        if (preg_match('/^Thema\s*:\s*(.*)$/iu', $line, $m)) $t = trim($m[1]);
        elseif (preg_match('/^(?:Verantwortlich|Vorbereitung|Vorbereiter|Leitung)\s*:\s*(.*)$/iu', $line, $m)) $l = trim($m[1]);
        else $rest[] = $line;
    }
    return ['topic' => $t, 'lead' => $l, 'rest' => implode(' · ', $rest)];
}
// Art des Termins aus dem Titel: Dienstabend/Übungsabend, Lehrgang/Seminar (dort heißt „Verantwortlich“ = wer dabei ist), sonst besonderer Termin
function myf_drill_cal_kind($title) {
    if (preg_match('/lehrgang|seminar|ausbildung\s+kreis|modul/iu', $title)) return 'lehrgang';
    if (preg_match('/dienst|übung|uebung|übungsabend|dienstabend|ausbildung/iu', $title)) return 'dienst';
    return 'termin';
}
// Ein Kalender: alle 15 Minuten neu (beim Abruf), letzter guter Stand bleibt, wenn er kurz nicht erreichbar ist
function myf_drill_cal_fetch($cal, $force = false) {
    $h = md5((string) $cal['url']); $key = 'myf_drill_ical_' . $h;
    $cached = $force ? false : get_transient($key);
    if (is_array($cached)) return $cached;
    $st = myf_drill_cal_status();
    $res = wp_remote_get(preg_replace('#^webcal://#', 'https://', (string) $cal['url']), ['timeout' => 10]);
    if (is_wp_error($res) || wp_remote_retrieve_response_code($res) !== 200) {
        $last = get_option('myf_drill_ical_last_' . $h, []);
        $st[$h] = ['at' => $st[$h]['at'] ?? '', 'err' => current_time('mysql'), 'n' => is_array($last) ? count($last) : 0];
        update_option('myf_drill_ical_st', $st, false);
        set_transient($key, is_array($last) ? $last : [], 5 * MINUTE_IN_SECONDS);
        return is_array($last) ? $last : [];
    }
    $out = [];
    $from = date('Y-m-d', current_time('timestamp') - 400 * DAY_IN_SECONDS);
    foreach (myf_ical_parse(wp_remote_retrieve_body($res)) as $e) {
        $date = substr($e['start'], 0, 10);
        if ($date < $from || $e['title'] === '') continue;
        $d = myf_drill_cal_desc($e['desc']);
        $out[] = ['id' => 0, 'cal_uid' => $e['uid'] ?: md5($e['title'] . $e['start']), 'date' => $date, 'end_date' => substr($e['end'], 0, 10),
            'time' => $e['allday'] ? '' : substr($e['start'], 11, 5), 'time_to' => $e['allday'] ? '' : substr($e['end'], 11, 5),
            'title' => $e['title'], 'lead' => $d['lead'], 'topic' => $d['topic'], 'cal_kind' => myf_drill_cal_kind($e['title']), 'unit' => '',
            'note' => trim(($e['location'] ? $e['location'] : '') . ($d['rest'] ? ' · ' . $d['rest'] : ''), ' ·'), 'place' => (string) $e['location'], 'source' => 'kalender'];
    }
    set_transient($key, $out, 15 * MINUTE_IN_SECONDS);
    update_option('myf_drill_ical_last_' . $h, $out, false);
    $st[$h] = ['at' => current_time('mysql'), 'err' => '', 'n' => count($out)];
    update_option('myf_drill_ical_st', $st, false);
    return $out;
}
// Alle Kalender zusammen: jeder Termin weiß, aus welchem Kalender er kommt; gleiche Kennung in zwei Kalendern bleibt getrennt
function myf_drill_cal_events($force = false) {
    if (myf_demo_ctx()) return [];
    $all = []; $seen = []; $same = [];
    foreach (myf_drill_icals() as $c) {
        foreach (myf_drill_cal_fetch($c, $force) as $e) {
            // Gleicher Termin in zwei Kalendern (gleicher Tag, Uhrzeit, Titel) nur einmal
            $sk = $e['date'] . '|' . $e['time'] . '|' . myf_drill_norm($e['title']);
            if (isset($same[$sk])) continue;
            $same[$sk] = true;
            if (isset($seen[$e['cal_uid']])) $e['cal_uid'] .= '@' . substr(md5((string) $c['url']), 0, 6);
            $seen[$e['cal_uid']] = true;
            $e['cal_label'] = (string) ($c['label'] ?? '');
            $all[] = $e;
        }
    }
    usort($all, function ($a, $b) { return strcmp($a['date'] . $a['time'], $b['date'] . $b['time']); });
    return $all;
}

function myf_drill_norm($s) { return preg_replace('/[^a-z0-9]+/', '', mb_strtolower(remove_accents((string) $s))); }
// Von Hand Eingetragenes und Kalendertermine zu einer Liste: gleicher Termin = verknüpft (cal_uid) oder gleicher Tag + gleiches Thema;
// gleicher Tag mit anderem Thema = „möglicherweise doppelt“ (nur Hinweis, die Verwaltung entscheidet)
function myf_drills_merged($rows, $cal) {
    $list = []; $used = []; $hitOf = [];
    $byUid = []; foreach ($cal as $c) $byUid[$c['cal_uid']] = $c;
    foreach ($rows as $r) if ($r->cal_uid !== '' && isset($byUid[$r->cal_uid]) && empty($used[$r->cal_uid])) { $hitOf[$r->id] = $byUid[$r->cal_uid]; $used[$r->cal_uid] = true; }
    foreach ($rows as $r) {
        if (isset($hitOf[$r->id])) continue;
        foreach ($cal as $c) if (empty($used[$c['cal_uid']]) && $c['date'] === $r->date && (myf_drill_norm($c['title']) === myf_drill_norm($r->title) || ($c['time'] !== '' && $c['time'] === $r->time_from))) { $hitOf[$r->id] = $c; $used[$c['cal_uid']] = true; break; }
    }
    foreach ($rows as $r) {
        $o = myf_drill_out($r); $o['source'] = 'manuell'; $o['topic'] = ''; $o['end_date'] = $r->date; $o['time_to'] = '';
        if (isset($hitOf[$r->id])) {
            $hit = $hitOf[$r->id]; $o['source'] = 'beides'; $o['cal_uid'] = $hit['cal_uid'];
            // Der Kalender ist führend: Thema, Verantwortliche, Zeiten und Ort kommen von dort
            foreach (['date', 'title', 'lead', 'topic', 'time', 'time_to', 'end_date', 'note', 'place', 'cal_kind', 'cal_label'] as $k) if (!empty($hit[$k])) $o[$k] = $hit[$k];
        } elseif ($r->cal_uid !== '' && $cal) {
            $o['source'] = 'entfernt'; $o['cal_uid'] = $r->cal_uid; // stand im Kalender, ist dort aber nicht mehr (abgesagt oder gelöscht)
        } else {
            foreach ($cal as $c) if ($c['date'] === $r->date) { $o['dupe_of'] = $c['cal_uid']; $o['dupe_title'] = $c['title']; break; }
        }
        $list[] = $o;
    }
    foreach ($cal as $c) if (empty($used[$c['cal_uid']])) $list[] = $c;
    usort($list, function ($a, $b) { return strcmp($a['date'] . $a['time'], $b['date'] . $b['time']); });
    return $list;
}
// Kommende Dienste aus allen Quellen (von Hand + Dienstplan-Kalender, automatisch zusammengeführt) – für Website, Halle und Dashboard.
// $kinds: z. B. ['dienst'] = nur Übungs-/Dienstabende (von Hand Eingetragenes zählt als Dienst); null = alles
function myf_drills_upcoming($limit = 5, $kinds = null) {
    global $wpdb;
    $today = current_time('Y-m-d');
    $rows = $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . myf_t('drills') . ' WHERE date >= %s ORDER BY date, time_from LIMIT 200', $today));
    $cal = array_filter(myf_drill_cal_events(), function ($c) use ($today) { return ($c['end_date'] ?: $c['date']) >= $today; });
    $out = [];
    foreach (myf_drills_merged($rows, array_values($cal)) as $x) {
        if (($x['source'] ?? '') === 'entfernt' || ($x['end_date'] ?? $x['date']) < $today) continue;
        if ($kinds && !in_array($x['cal_kind'] ?? 'dienst', $kinds, true)) continue;
        $out[] = $x;
        if (count($out) >= $limit) break;
    }
    return $out;
}
// Kalendertermin als eigene Zeile anlegen (für Abmeldungen, Anwesenheitsliste, Übung daraus machen)
function myf_drill_adopt($c) {
    global $wpdb;
    $id = (int) $wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('drills') . ' WHERE cal_uid = %s', $c['cal_uid']));
    if ($id) return $id;
    $wpdb->insert(myf_t('drills'), ['date' => $c['date'], 'time_from' => $c['time'], 'title' => mb_substr($c['title'], 0, 200), 'leader' => mb_substr($c['lead'], 0, 160), 'unit' => '',
        'note' => mb_substr($c['note'], 0, 255), 'cal_uid' => $c['cal_uid'], 'created' => current_time('mysql')]);
    return (int) $wpdb->insert_id;
}

add_filter('myf_admin_state', function ($d) {
    global $wpdb;
    if (!function_exists('myf_has_area') || !myf_has_area('duties')) return $d;
    $cal = myf_drill_cal_events();
    $d['drills'] = myf_drills_merged($wpdb->get_results($wpdb->prepare('SELECT * FROM ' . myf_t('drills') . ' WHERE date >= %s ORDER BY date, time_from', date('Y-01-01', strtotime('-1 year', current_time('timestamp'))))), $cal);
    $icals = myf_demo_ctx() ? [] : myf_drill_icals(); $st = myf_drill_cal_status(); $cals = []; $ok = true; $at = '';
    foreach ($icals as $i => $c) {
        $x = $st[md5((string) $c['url'])] ?? ['at' => '', 'err' => '', 'n' => 0];
        $cals[] = ['i' => $i, 'label' => (string) ($c['label'] ?? ''), 'host' => wp_parse_url(preg_replace('#^webcal://#', 'https://', (string) $c['url']), PHP_URL_HOST) ?: 'Kalender',
            'n' => (int) ($x['n'] ?? 0), 'at' => (string) ($x['at'] ?? ''), 'err' => (string) ($x['err'] ?? ''), 'screen' => (string) $c['url'] === (string) myf_settings()['screen_ical']]; // kein Link an den Browser
        if (!empty($x['err'])) $ok = false;
        if (($x['at'] ?? '') > $at) $at = (string) $x['at'];
    }
    $d['drill_cal'] = ['set' => (bool) $cals, 'cals' => $cals, 'n' => count($cal), 'ok' => $ok, 'at' => $at, 'host' => $cals ? $cals[0]['host'] : '',
        'screen_set' => (string) myf_settings()['screen_ical'] !== '', 'screen_used' => (bool) array_filter($cals, function ($c) { return $c['screen']; })];
    $d['drill_files'] = myf_drill_files();
    $d['drill_absence'] = array_map(function ($a) { return ['drill_id' => (int) $a->drill_id, 'member_id' => (int) $a->member_id, 'name' => $a->name, 'reason' => $a->reason]; },
        $wpdb->get_results('SELECT a.*, m.name FROM ' . myf_t('drill_absence') . ' a JOIN ' . myf_t('members') . ' m ON m.id = a.member_id ORDER BY m.name'));
    return $d;
}, 21);
add_filter('myf_me_data', function ($data, $me) {
    global $wpdb;
    $mine = array_map('intval', $wpdb->get_col($wpdb->prepare('SELECT drill_id FROM ' . myf_t('drill_absence') . ' WHERE member_id = %d', $me->id)));
    $data['drill_absent'] = $mine;
    $today = current_time('Y-m-d');
    $data['drills'] = array_values(array_filter(myf_drills_merged($wpdb->get_results($wpdb->prepare('SELECT * FROM ' . myf_t('drills') . ' WHERE date >= %s AND (unit = %s OR unit = \'\') ORDER BY date, time_from LIMIT 60', $today, $me->unit)), myf_drill_cal_events()),
        function ($x) use ($today) { return ($x['end_date'] ?? $x['date']) >= $today && ($x['source'] ?? '') !== 'entfernt'; }));
    $data['drills'] = array_slice($data['drills'], 0, 60);
    $data['drill_cal_at'] = myf_drill_icals() && !myf_demo_ctx() ? (string) array_reduce(myf_drill_cal_status(), function ($m, $x) { return max($m, (string) ($x['at'] ?? '')); }, '') : '';
    // Einsatzführung: Dienste der letzten 3 Wochen, um eine Übung daraus anzulegen (Teilnahme erfassen)
    if (function_exists('myf_member_can') && myf_member_can('incident_manage', $me)) $data['drills_recent'] = array_values(array_filter(myf_drills_merged($wpdb->get_results($wpdb->prepare('SELECT * FROM ' . myf_t('drills') . ' WHERE date >= %s AND date < %s ORDER BY date DESC LIMIT 20', date('Y-m-d', current_time('timestamp') - 21 * DAY_IN_SECONDS), $today)), myf_drill_cal_events()),
        function ($x) use ($today) { return $x['date'] < $today && $x['date'] >= date('Y-m-d', current_time('timestamp') - 21 * DAY_IN_SECONDS); }));
    $data['drill_files'] = myf_drill_files();
    return $data;
}, 10, 2);
// Kalender-Abo: Übungsdienste
add_filter('myf_ics_events', function ($events, $m) {
    global $wpdb;
    foreach ($wpdb->get_results($wpdb->prepare('SELECT * FROM ' . myf_t('drills') . ' WHERE date >= %s AND (unit = %s OR unit = \'\')', date('Y-m-d', current_time('timestamp') - 60 * DAY_IN_SECONDS), $m->unit)) as $r) {
        $e = ['uid' => 'u' . $r->id, 'start' => $r->date, 'end' => $r->date, 'title' => 'Dienst: ' . $r->title, 'loc' => $r->leader ? 'Verantwortlich: ' . $r->leader : ''];
        if ($r->time_from) { $e['time'] = $r->time_from; $e['endtime'] = date('H:i', strtotime($r->time_from . ' +2 hours')); }
        $events[] = $e;
    }
    $have = array_flip(array_filter($wpdb->get_col('SELECT cal_uid FROM ' . myf_t('drills') . " WHERE cal_uid <> ''")));
    foreach (myf_drill_cal_events() as $c) {
        if (isset($have[$c['cal_uid']])) continue;
        $e = ['uid' => 'c' . $c['cal_uid'], 'start' => $c['date'], 'end' => $c['end_date'], 'title' => 'Dienst: ' . $c['title'], 'loc' => $c['lead'] ? 'Verantwortlich: ' . $c['lead'] : ''];
        if ($c['time'] !== '') { $e['time'] = $c['time']; $e['endtime'] = $c['time_to'] ?: date('H:i', strtotime($c['time'] . ' +2 hours')); }
        $events[] = $e;
    }
    return $events;
}, 10, 2);
// Dashboard: nächster Übungsdienst
add_filter('myf_screen_data', function ($out) {
    global $wpdb;
    $today = current_time('Y-m-d');
    $all = array_values(array_filter(myf_drills_merged($wpdb->get_results($wpdb->prepare('SELECT * FROM ' . myf_t('drills') . ' WHERE date >= %s ORDER BY date, time_from LIMIT 5', $today)), array_filter(myf_drill_cal_events(), function ($c) use ($today) { return $c['date'] >= $today; })), function ($x) { return ($x['source'] ?? '') !== 'entfernt'; }));
    $r = $all ? $all[0] : null;
    $out['next_drill'] = $r ? ['date' => $r['date'], 'time' => $r['time'], 'title' => $r['title'], 'lead' => $r['lead']] : null;
    return $out;
});

add_action('rest_api_init', function () {
    // Mitglied: vom Dienst abmelden / wieder anmelden
    register_rest_route('myf/v1', '/me/drill/absence', ['methods' => 'POST', 'permission_callback' => 'myf_member_permission', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $me = myf_me();
        $id = (int) $req->get_param('id');
        if (!$id && $req->get_param('cal_uid')) {
            foreach (myf_drill_cal_events() as $c) if ($c['cal_uid'] === (string) $req->get_param('cal_uid')) { $id = myf_drill_adopt($c); break; }
        }
        $r = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('drills') . ' WHERE id = %d', $id));
        if (!$r) return myf_err('Termin nicht gefunden.', 404);
        if ($r->date < current_time('Y-m-d')) return myf_err('Der Termin ist schon vorbei.');
        $wpdb->delete(myf_t('drill_absence'), ['drill_id' => $r->id, 'member_id' => $me->id]);
        if ($req->get_param('absent')) $wpdb->insert(myf_t('drill_absence'), ['drill_id' => $r->id, 'member_id' => $me->id, 'reason' => mb_substr(sanitize_text_field((string) $req->get_param('reason')), 0, 120), 'created' => current_time('mysql')]);
        return ['ok' => true];
    }]);
    register_rest_route('myf/v1', '/admin/drills', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        if ($req->get_param('delete')) { $wpdb->delete(myf_t('drills'), ['id' => (int) $req->get_param('delete')]); return ['ok' => true]; }
        // Kalender-Link setzen ('' = aus, '=screen' = denselben wie das Dashboard), neu laden, Termine übernehmen, Doppelte verknüpfen
        if (is_array($req->get_param('ical_add')) || $req->has_param('ical')) {
            // Kalender hinzufügen (mit Bezeichnung); „ical“ = alter Aufruf: '' trennt alle
            $add = (array) ($req->get_param('ical_add') ?: ['url' => (string) $req->get_param('ical'), 'label' => '']);
            $u = trim((string) ($add['url'] ?? '')); $label = trim(sanitize_text_field((string) ($add['label'] ?? '')));
            if ($u === '' && $req->has_param('ical')) { myf_drill_icals_save([]); return ['ok' => true, 'n' => 0, 'message' => 'Alle Kalender getrennt.']; }
            if ($u === '=screen') $u = (string) myf_settings()['screen_ical'];
            if (!preg_match('#^(https?|webcal)://#i', $u)) return myf_err('Bitte einen Kalender-Link (https://… oder webcal://…) eintragen.');
            $list = myf_drill_icals();
            foreach ($list as $c) if ($c['url'] === $u) return myf_err('Dieser Kalender ist schon verbunden.');
            if (count($list) >= 8) return myf_err('Höchstens 8 Kalender.');
            $list[] = ['url' => $u, 'label' => $label !== '' ? $label : 'Kalender ' . (count($list) + 1)];
            myf_drill_icals_save($list);
            $n = count(myf_drill_cal_fetch(end($list), true));
            return ['ok' => true, 'n' => $n, 'message' => $n ? $n . ' Termine aus „' . end($list)['label'] . '“ gelesen.' : 'Kalender erreichbar, aber keine Termine gefunden – ist es ein öffentlicher iCal-Link?'];
        }
        if ($req->has_param('ical_remove')) {
            $list = myf_drill_icals(); $i = (int) $req->get_param('ical_remove');
            if (!isset($list[$i])) return myf_err('Kalender nicht gefunden.', 404);
            $h = md5((string) $list[$i]['url']); delete_transient('myf_drill_ical_' . $h); delete_option('myf_drill_ical_last_' . $h);
            $st = myf_drill_cal_status(); unset($st[$h]); update_option('myf_drill_ical_st', $st, false);
            array_splice($list, $i, 1); myf_drill_icals_save($list);
            return ['ok' => true];
        }
        if (is_array($req->get_param('ical_label'))) {
            $list = myf_drill_icals(); $x = $req->get_param('ical_label'); $i = (int) ($x['i'] ?? -1);
            if (!isset($list[$i])) return myf_err('Kalender nicht gefunden.', 404);
            $list[$i]['label'] = mb_substr(trim(sanitize_text_field((string) ($x['label'] ?? ''))), 0, 60) ?: $list[$i]['label'];
            myf_drill_icals_save($list); return ['ok' => true];
        }
        if ($req->get_param('reload')) { return ['ok' => true, 'n' => count(myf_drill_cal_events(true))]; }
        if ($req->get_param('adopt')) {
            $want = (array) $req->get_param('adopt'); $n = 0;
            $merged = myf_drills_merged($wpdb->get_results($wpdb->prepare('SELECT * FROM ' . myf_t('drills') . ' WHERE date >= %s', date('Y-m-d', current_time('timestamp') - 400 * DAY_IN_SECONDS))), myf_drill_cal_events());
            foreach ($merged as $c) if (($c['source'] ?? '') === 'kalender' && (in_array('all', $want, true) || in_array($c['cal_uid'], $want, true))) { myf_drill_adopt($c); $n++; }
            return ['ok' => true, 'n' => $n];
        }
        if ($req->get_param('link') && $req->get_param('cal_uid')) {
            // Von Hand eingetragener Termin ist derselbe wie im Kalender: verknüpfen, Kalenderfassung übernehmen
            foreach (myf_drill_cal_events() as $c) if ($c['cal_uid'] === (string) $req->get_param('cal_uid')) {
                $mine = (int) $req->get_param('link');
                // Gibt es schon eine Zeile zu diesem Kalendertermin, wandern Abmeldungen dorthin und die doppelte Zeile verschwindet
                $other = (int) $wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('drills') . ' WHERE cal_uid = %s AND id <> %d', $c['cal_uid'], $mine));
                if ($other) {
                    $wpdb->query($wpdb->prepare('UPDATE IGNORE ' . myf_t('drill_absence') . ' SET drill_id = %d WHERE drill_id = %d', $other, $mine));
                    $wpdb->delete(myf_t('drill_absence'), ['drill_id' => $mine]);
                    $wpdb->delete(myf_t('drills'), ['id' => $mine]);
                    return ['ok' => true, 'merged' => $other];
                }
                $upd = ['cal_uid' => $c['cal_uid'], 'title' => mb_substr($c['title'], 0, 200), 'time_from' => $c['time']];
                if ($c['lead'] !== '') $upd['leader'] = mb_substr($c['lead'], 0, 160);
                $wpdb->update(myf_t('drills'), $upd, ['id' => (int) $req->get_param('link')]);
                return ['ok' => true];
            }
            return myf_err('Kalendertermin nicht mehr gefunden.', 404);
        }
        // Datei (PDF) anhängen / entfernen
        if ($req->get_param('file')) {
            $u = myf_save_file($req->get_param('file'), 'dienstplan-');
            if (!$u) return myf_err('Datei nicht erkannt – bitte PDF, JPG oder PNG bis 8 MB.');
            $s = myf_settings();
            $s['drill_files'][] = ['label' => mb_substr(sanitize_text_field((string) $req->get_param('label')) ?: 'Dienstplan', 0, 80), 'url' => $u, 'added' => current_time('Y-m-d')];
            update_option('myf_settings', $s);
            return ['ok' => true];
        }
        if ($req->has_param('file_remove')) {
            $s = myf_settings();
            array_splice($s['drill_files'], (int) $req->get_param('file_remove'), 1);
            update_option('myf_settings', $s);
            return ['ok' => true];
        }
        $n = 0;
        foreach ((array) $req->get_param('rows') as $r) {
            $date = myf_date_or_null($r['date'] ?? '');
            $title = mb_substr(sanitize_text_field((string) ($r['title'] ?? '')), 0, 200);
            if (!$date || $title === '') continue;
            $row = ['date' => $date, 'time_from' => preg_match('/^\d{1,2}:\d{2}$/', (string) ($r['time'] ?? '')) ? $r['time'] : '', 'title' => $title,
                'leader' => mb_substr(sanitize_text_field((string) ($r['lead'] ?? '')), 0, 160), 'unit' => isset(myf_units()[$r['unit'] ?? '']) ? $r['unit'] : '',
                'note' => mb_substr(sanitize_text_field((string) ($r['note'] ?? '')), 0, 255)];
            if (!empty($r['id'])) $wpdb->update(myf_t('drills'), $row, ['id' => (int) $r['id']]);
            else $wpdb->insert(myf_t('drills'), $row + ['created' => current_time('mysql')]);
            $n++;
        }
        return ['saved' => $n];
    }]);
});
