<?php
/**
 * Archiv, Zurücksetzen und „Startklar“:
 * - Archiv: vollständige Kopie aller SPIND-Daten (ohne Protokoll) in der Datenbank – vor jedem Zurücksetzen und vor
 *   jedem Einspielen einer Sicherung automatisch. Archive werden nicht gelöscht, sind herunterladbar und wieder einspielbar.
 * - Zurücksetzen: ausgewählte Bereiche leeren (Neustart), Einstellungen, Aussehen, Funktionen/Rechte, Vorlagen und das
 *   Protokoll bleiben. Jeder Schritt steht im Protokoll.
 * - Startklar: Bestand und Einrichtungs-Checkliste auf einen Blick.
 */

defined('ABSPATH') || exit;

function myf_install_archive($c) {
    $p = myf_t(''); // echte oder Demo-Tabellen (Demo-Modus)
    dbDelta("CREATE TABLE {$p}archive (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        created datetime NOT NULL,
        label varchar(160) NOT NULL DEFAULT '',
        by_name varchar(120) NOT NULL DEFAULT '',
        counts text NULL,
        data longblob NULL,
        PRIMARY KEY  (id)
    ) $c;");
}

// Bereiche, die man einzeln zurücksetzen kann (Tabelle => optionale Bedingung für das Löschen)
const MYF_RESET_GROUPS = [
    'members' => ['Mitglieder, Funktionen-Zuordnung, Ausbildungsnachweise, Unterweisungen, Rückfragen, Zuordnung zu Alarmschleifen', ['members' => '', 'member_traits' => '', 'quals' => '', 'messages' => '', 'briefings' => '', 'briefing_acks' => '', 'loop_members' => '', 'loop_requests' => '']],
    'incidents' => ['Einsätze, Einsatzberichte, Beteiligung, Alarm-Eingänge', ['incidents' => '', 'participation' => '', 'alarm_log' => '', 'asu' => '']],
    'courses' => ['Lehrgänge: Jahre, Wünsche, Termine (Vorlagen bleiben)', ['courses' => 'year <> 0', 'dates' => '', 'needs' => '']],
    'agt' => ['Atemschutz & Werkstätten: Geräte, Prüfungen, Nachweise', ['devices' => '', 'device_checks' => '', 'agt_log' => '']],
    'vehicles' => ['Fahrzeuge, Fristen, Verlauf, Fahrtenbuch, Buchungen, Status', ['vehicles' => '', 'vehicle_tasks' => '', 'vehicle_log' => '', 'trips' => '', 'bookings' => '']],
    'duties' => ['Dienstplan, Veranstaltungen, „Wer hat Zeit?“, Aushänge & Einladungen', ['drills' => '', 'events' => '', 'drill_absence' => '', 'duty_lists' => '', 'duty_slots' => '', 'duty_assign' => '', 'board' => '', 'board_rsvp' => '']],
    'reports' => ['Mängel, Anregungen, Kleiderkammer (Meldungen und Bestand), Hinweise, Team-Aufgaben', ['defects' => '', 'ideas' => '', 'clothing' => '', 'cloth_stock' => '', 'notices' => '', 'team_tasks' => '', 'loans' => '', 'lockers' => '', 'locker_log' => '']],
    'orders' => ['Bestellrunden und Bestellungen (Karten bleiben)', ['order_rounds' => '', 'order_items' => '']],
    'notifications' => ['Benachrichtigungen (Postfach)', ['notifications' => '']],
];

// Alle SPIND-Tabellen dieses Bestands (ohne Protokoll und Archiv)
function myf_data_tables() {
    global $wpdb;
    $pre = myf_t(''); $out = [];
    foreach ((array) $wpdb->get_col($wpdb->prepare('SHOW TABLES LIKE %s', $wpdb->esc_like($pre) . '%')) as $t) {
        $short = substr($t, strlen($pre));
        if ($short === 'audit' || $short === 'archive' || (!myf_demo_ctx() && strpos($short, 'demo_') === 0)) continue;
        $out[$short] = $t;
    }
    return $out;
}
function myf_archive_create($label) {
    global $wpdb;
    $tables = []; $counts = [];
    foreach (myf_data_tables() as $short => $t) { $tables[$short] = $wpdb->get_results("SELECT * FROM `$t`", ARRAY_A); $counts[$short] = count($tables[$short]); }
    $opts = ['myf_settings' => get_option('myf_settings', []), 'myf_vehicle_status' => get_option('myf_vehicle_status', [])];
    $blob = gzcompress(wp_json_encode(['plugin' => 'myfeuerwehr', 'version' => MYF_VERSION, 'created' => current_time('c'), 'tables' => $tables, 'options' => $opts]), 6);
    $by = myf_actor();
    $wpdb->insert(myf_t('archive'), ['created' => current_time('mysql'), 'label' => mb_substr($label, 0, 160), 'by_name' => $by, 'counts' => wp_json_encode($counts), 'data' => $blob]);
    $id = (int) $wpdb->insert_id;
    myf_audit_write('admin', get_current_user_id(), $by, 'archiv', 'archive', $id, ['label' => $label, 'datensätze' => array_sum($counts)]);
    return $id;
}
function myf_archive_get($id) {
    global $wpdb;
    $raw = $wpdb->get_var($wpdb->prepare('SELECT data FROM ' . myf_t('archive') . ' WHERE id = %d', $id));
    $j = $raw ? json_decode((string) @gzuncompress($raw), true) : null;
    return is_array($j) ? $j : null;
}
// Tabellen aus einem Archiv/einer Sicherung einspielen (Protokoll und Archiv bleiben unangetastet)
function myf_tables_restore($tables, $options = null) {
    global $wpdb;
    $have = myf_data_tables(); $n = 0;
    foreach ((array) $tables as $short => $rows) {
        $short = preg_replace('/[^a-z0-9_]/', '', (string) $short);
        $short = preg_replace('/^ffl_/', '', $short); // Sicherungsdateien nennen die Tabellen „ffl_…“
        if (!isset($have[$short])) continue;
        $table = $have[$short];
        $cols = $wpdb->get_col("SHOW COLUMNS FROM `$table`");
        $wpdb->query("DELETE FROM `$table`");
        foreach ((array) $rows as $r) { $wpdb->insert($table, array_intersect_key((array) $r, array_flip($cols))); $n++; }
    }
    if (is_array($options)) foreach (['myf_settings', 'myf_vehicle_status'] as $o) if (isset($options[$o]) && is_array($options[$o])) update_option($o, $options[$o]);
    return $n;
}

function myf_reset_groups($groups) {
    global $wpdb;
    $done = []; $have = myf_data_tables();
    foreach ((array) $groups as $g) {
        if (!isset(MYF_RESET_GROUPS[$g])) continue;
        foreach (MYF_RESET_GROUPS[$g][1] as $short => $where) {
            if (!isset($have[$short])) continue;
            $wpdb->query('DELETE FROM `' . $have[$short] . '`' . ($where ? ' WHERE ' . $where : ''));
        }
        if ($g === 'vehicles') { update_option('myf_vehicle_status', []); update_option('myf_incveh_extra', []); }
        $done[] = $g;
    }
    return $done;
}

// Bestand und Einrichtung auf einen Blick
function myf_inventory() {
    global $wpdb;
    $n = function ($t, $w = '') use ($wpdb) { $tb = myf_t($t); return $wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $tb)) ? (int) $wpdb->get_var("SELECT COUNT(*) FROM `$tb`" . ($w ? " WHERE $w" : '')) : 0; };
    $s = myf_settings(); $a = function_exists('myf_alarm_settings') ? myf_alarm_settings() : ['on' => false];
    $vs = function_exists('myf_vstatus') ? myf_vstatus() : [];
    $fromAlarm = count(array_filter($vs, function ($x) { return ($x['by'] ?? '') === 'Schnittstelle'; }));
    return [
        'members' => $n('members', 'active = 1'), 'members_account' => $n('members', 'active = 1 AND user_id IS NOT NULL'),
        'members_function' => (int) $wpdb->get_var('SELECT COUNT(DISTINCT mt.member_id) FROM ' . myf_t('member_traits') . ' mt JOIN ' . myf_t('traits') . " t ON t.id = mt.trait_id WHERE t.cat = 'funktion'"),
        'members_rank' => $n('members', "active = 1 AND dienstgrad <> ''"),
        'vehicles' => $n('vehicles', 'active = 1'), 'vehicles_callsign' => $n('vehicles', "active = 1 AND callsign <> ''"),
        'devices_agt' => $n('devices', "area = 'agt'"), 'devices_other' => $n('devices', "area <> 'agt'"),
        'cloth_stock' => (int) $wpdb->get_var('SELECT COALESCE(SUM(qty),0) FROM ' . myf_t('cloth_stock')), 'cloth_items' => $n('cloth_items', 'active = 1'),
        'courses' => $n('courses', 'year = ' . (int) $s['year']), 'templates' => $n('courses', 'year = 0'), 'incidents' => $n('incidents', "source <> 'test'"), 'drills' => $n('drills'),
        'alarm' => !empty($a['on']), 'status_from_alarm' => $fromAlarm, 'ical' => !empty($s['screen_ical']), 'screen' => !empty($s['screen_on']),
        'hall' => function_exists('myf_hall') && myf_hall()['on'], 'location' => $s['screen_lat'] !== null && $s['screen_lat'] !== '', 'warn_region' => (bool) preg_match('/^\d{12}$/', (string) $s['screen_ars']),
        'ev_plugin' => post_type_exists('einsatz'),
    ];
}

add_action('rest_api_init', function () {
    $ns = 'myf/v1';
    $full = function () { return myf_can_manage() && current_user_can('manage_options') || (function_exists('myf_route_perm') && myf_can_manage()); };
    register_rest_route($ns, '/admin/reset', ['methods' => 'POST', 'permission_callback' => 'myf_can_manage', 'callback' => function (WP_REST_Request $req) {
        if ($req->get_param('confirm') !== 'ZURÜCKSETZEN') return myf_err('Bitte zur Bestätigung ZURÜCKSETZEN eingeben.');
        $groups = array_values(array_intersect((array) $req->get_param('groups'), array_keys(MYF_RESET_GROUPS)));
        if (!$groups) return myf_err('Bitte mindestens einen Bereich auswählen.');
        $label = trim(sanitize_text_field((string) $req->get_param('label')));
        $aid = myf_archive_create('Vor dem Zurücksetzen' . ($label !== '' ? ': ' . $label : '') . ' (' . implode(', ', array_map(function ($g) { return explode(':', explode(',', MYF_RESET_GROUPS[$g][0])[0])[0]; }, $groups)) . ')');
        $done = myf_reset_groups($groups);
        myf_audit_write('admin', get_current_user_id(), myf_actor(), 'zuruecksetzen', 'archive', $aid, ['bereiche' => $done]);
        return ['ok' => true, 'archive_id' => $aid, 'reset' => $done];
    }]);
    register_rest_route($ns, '/admin/archive', ['methods' => 'POST', 'permission_callback' => 'myf_can_manage', 'callback' => function (WP_REST_Request $req) {
        $id = (int) $req->get_param('id'); $do = (string) $req->get_param('do');
        if ($do === 'create') return ['id' => myf_archive_create(trim(sanitize_text_field((string) $req->get_param('label'))) ?: 'Archiv von Hand')];
        $j = myf_archive_get($id);
        if (!$j) return myf_err('Archiv nicht gefunden.', 404);
        if ($do === 'download') {
            myf_audit_write('admin', get_current_user_id(), myf_actor(), 'archiv herunterladen', 'archive', $id, []);
            return ['plugin' => 'myfeuerwehr', 'version' => $j['version'], 'created' => $j['created'], 'tables' => array_combine(array_map(function ($k) { return 'ffl_' . $k; }, array_keys($j['tables'])), array_values($j['tables']))];
        }
        if ($do === 'restore') {
            if ($req->get_param('confirm') !== 'WIEDERHERSTELLEN') return myf_err('Bitte zur Bestätigung WIEDERHERSTELLEN eingeben.');
            $before = myf_archive_create('Vor dem Wiederherstellen von Archiv #' . $id);
            $n = myf_tables_restore($j['tables'], $j['options'] ?? null);
            myf_audit_write('admin', get_current_user_id(), myf_actor(), 'archiv wiederherstellen', 'archive', $id, ['datensätze' => $n, 'vorher_archiviert' => $before]);
            return ['ok' => true, 'rows' => $n, 'archive_before' => $before];
        }
        return myf_err('Unbekannte Aktion.');
    }]);
});

add_filter('myf_admin_state', function ($d) {
    if (!myf_can_manage()) return $d;
    global $wpdb;
    $tb = myf_t('archive');
    $d['archives'] = $wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $tb)) ? array_map(function ($a) {
        $c = json_decode((string) $a->counts, true) ?: [];
        return ['id' => (int) $a->id, 'created' => $a->created, 'label' => $a->label, 'by' => $a->by_name, 'rows' => array_sum($c), 'members' => (int) ($c['members'] ?? 0), 'incidents' => (int) ($c['incidents'] ?? 0), 'size' => (int) $a->size];
    }, $wpdb->get_results("SELECT id, created, label, by_name, counts, LENGTH(data) AS size FROM `$tb` ORDER BY id DESC LIMIT 50")) : [];
    $d['reset_groups'] = array_map(function ($g) { return $g[0]; }, MYF_RESET_GROUPS);
    $d['inventory'] = myf_inventory();
    return $d;
}, 45);
