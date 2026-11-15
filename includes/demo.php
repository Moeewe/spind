<?php
/**
 * Demo-Modus mit eigenem, getrenntem Datenbestand: Tabellen …ffl_demo_* und eigene Einstellungen (siehe myf_demo_ctx()).
 * Echte Daten werden weder angezeigt noch verändert. Demo-Daten sehen nur die Demo-Konten, Administratoren mit
 * „Demo ansehen“ und die Demo-Gerätelinks. „Demo beenden“ löscht den kompletten Demo-Bestand und die Demo-Konten.
 */

defined('ABSPATH') || exit;

// Wer den Demo-Modus bedienen darf: Administratoren, Hauptverwaltung und das Recht „Demo-Modus“ (Vorgabe: Wehrführung, LZ-Führung).
// In der Demo-Ansicht zählt, wer sie über den Knopf geöffnet hat (dort gelten die Funktionen des Demo-Bestands nicht).
function myf_demo_can() {
    if (current_user_can('manage_options') || myf_can_manage()) return true;
    if (myf_demo_ctx()) return (bool) get_user_meta(get_current_user_id(), 'myf_demo_view', true);
    return function_exists('myf_member_can') && myf_member_can('demo_manage');
}
function myf_demo() { $d = get_option('myf_demo'); return is_array($d) ? $d : null; }
function myf_demo_on_v2() { $d = myf_demo(); return $d && !empty($d['v2']); }

// Demo-Bestand (Tabellen, Einstellungen, Konten) vollständig entfernen
function myf_demo_wipe() {
    global $wpdb;
    $like = $wpdb->esc_like($wpdb->prefix . 'ffl_demo_') . '%';
    foreach ((array) $wpdb->get_col($wpdb->prepare('SHOW TABLES LIKE %s', $like)) as $t) $wpdb->query('DROP TABLE IF EXISTS `' . esc_sql($t) . '`');
    foreach ((array) $wpdb->get_col($wpdb->prepare("SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE %s", $wpdb->esc_like('myf_demo__') . '%')) as $o) delete_option($o);
    require_once ABSPATH . 'wp-admin/includes/user.php';
    foreach (get_users(['meta_key' => 'myf_demo_user', 'fields' => 'ID']) as $u) wp_delete_user((int) $u);
    delete_metadata('user', 0, 'myf_demo_view', '', true);
}

function myf_demo_on() {
    global $wpdb;
    if (myf_demo_on_v2()) return myf_err('Der Demo-Modus ist schon an.');
    if (myf_demo()) { myf_demo_off_legacy(); }           // alte Demo-Einträge aus den echten Tabellen entfernen
    $real = myf_settings();                              // Aussehen und Standort wie bei der echten Wehr
    $dm = ['v2' => 1, 'on' => true, 'since' => current_time('mysql'), 'hall_key' => wp_generate_password(24, false), 'screen_key' => wp_generate_password(24, false), 'creds' => []];
    $GLOBALS['myf_demo_force'] = 'demo';
    myf_demo_wipe();
    myf_install();
    $s = get_option('myf_settings', []); $s = is_array($s) ? $s : [];
    foreach (['brand', 'units', 'screen_lat', 'screen_lon', 'screen_ars', 'screen_weather', 'screen_warnings', 'screen_theme', 'defect_objects', 'year', 'report_form', 'ranks'] as $k) if (isset($real[$k])) $s[$k] = $real[$k];
    $s += ['screen_on' => true]; $s['screen_on'] = true; $s['screen_key'] = $dm['screen_key']; $s['screen_ical'] = '';
    $s['hall_on'] = true; $s['hall_key'] = $dm['hall_key']; $s['hall_on_screen'] = false; // Besprechungsraum: Anwesenheits-Knopf und Fahrzeugstatus standardmäßig aus
    update_option('myf_settings', $s);
    update_option('myf_mig_incveh', 1); update_option('myf_mig_daytime', 1);
    $now = current_time('timestamp');
    $at = function ($sec) use ($now) { return date('Y-m-d H:i:s', $now + $sec); };
    $T = ['members' => [], 'users' => [], 'vehicles' => [], 'incidents' => [], 'participation' => [], 'trips' => [], 'bookings' => [], 'defects' => [], 'drills' => [], 'traits' => [], 'duty_lists' => []];
    $unit = array_key_first(myf_units()) ?: 'lz1';

    // Mitglieder (fiktiv)
    $names = ['Albers, Jan', 'Becker, Lena', 'Brüggemann, Tim', 'Elsing, Paul', 'Feldhaus, Nico', 'Gerdes, Hannah', 'Hemsing, Lukas', 'Kemper, Jonas',
        'Lammers, Sophie', 'Nienhaus, Felix', 'Overkamp, Mia', 'Rotering, Ben', 'Schmitz, Tobias', 'Tenbrink, Lea', 'Vennemann, Kai', 'Wessels, Max'];
    $ranks = ['OFM', 'FM', 'HFM', 'UBM', 'FM', 'OFM', 'BM', 'HFM', 'FM', 'OFM', 'FMA', 'HFM', 'OBM', 'FM', 'UBM', 'FM'];
    $mid = [];
    foreach ($names as $k => $n) {
        if ($wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('members') . ' WHERE name = %s', $n))) continue;
        $wpdb->insert(myf_t('members'), ['name' => $n, 'unit' => $unit, 'active' => 1, 'agt' => $k % 3 === 0 ? 1 : 0, 'dienstgrad' => $ranks[$k], 'dept' => 'einsatz',
            'day_available' => $k % 4 === 0 ? 1 : 0, 'note' => 'Demo', 'employment' => 'ehrenamt']);
        $mid[$n] = (int) $wpdb->insert_id; $T['members'][] = $mid[$n];
    }
    // Funktionen für einige (Gruppenführer, Maschinist, Gerätewart, Medienteam)
    $trait = function ($name) use ($wpdb) { return (int) $wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('traits') . ' WHERE name = %s', $name)); };
    foreach (['Schmitz, Tobias' => ['Gruppenführer'], 'Becker, Lena' => ['Gruppenführer', 'Maschinist'], 'Hemsing, Lukas' => ['Maschinist'], 'Kemper, Jonas' => ['Gerätewart'],
        'Albers, Jan' => ['Atemschutzgerätewart'], 'Gerdes, Hannah' => ['Team Medienteam'], 'Vennemann, Kai' => ['Wehrführung'], 'Overkamp, Mia' => ['LZ-Führung']] as $n => $fns) {
        if (empty($mid[$n])) continue;
        foreach ($fns as $f) if ($tid = $trait($f)) { $wpdb->query($wpdb->prepare('INSERT IGNORE INTO ' . myf_t('member_traits') . ' (member_id, trait_id) VALUES (%d, %d)', $mid[$n], $tid)); }
    }
    // Demo-Logins je Rolle – zeigt, wer was sieht
    $creds = myf_demo_logins($mid, $T);

    // Fahrzeuge (nur anlegen, was es noch nicht gibt)
    $vid = [];
    foreach ([['HLF 20', '1-HLF20-1', 0], ['LF 20', '1-LF20-1', 0], ['ELW 1', '1-ELW1-1', 0], ['MTF', '1-MTF-1', 1]] as $v) {
        $ex = (int) $wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('vehicles') . ' WHERE name = %s', $v[0]));
        if ($ex) { $vid[$v[0]] = $ex; continue; }
        $wpdb->insert(myf_t('vehicles'), ['name' => $v[0], 'callsign' => $v[1], 'unit' => $unit, 'status' => 'ready', 'bookable' => $v[2], 'active' => 1, 'created' => current_time('mysql')]);
        $vid[$v[0]] = (int) $wpdb->insert_id; $T['vehicles'][] = $vid[$v[0]];
    }
    $vs = myf_vstatus();
    foreach (['HLF 20' => '2', 'LF 20' => '2', 'ELW 1' => '1', 'MTF' => '2'] as $n => $s) if (in_array($vid[$n], $T['vehicles'], true)) $vs[$vid[$n]] = ['s' => $s, 't' => current_time('mysql'), 'by' => 'Demo'];
    update_option('myf_vehicle_status', $vs, false);

    // Einsätze: eine offene Liste (vor 40 Minuten), ein Einsatz von gestern (bestätigt), eine Übung
    $inc = function ($row) use ($wpdb, &$T) { $wpdb->insert(myf_t('incidents'), $row + ['source' => 'demo', 'created' => current_time('mysql'), 'created_by' => 'Demo']); $id = (int) $wpdb->insert_id; $T['incidents'][] = $id; return $id; };
    $veh = function ($list) { return wp_json_encode(array_map(function ($v) { return ['v' => $v[0], 'out' => $v[1], 'at' => $v[2], 'in' => $v[3]]; }, $list)); };
    $e1 = $inc(['kind' => 'einsatz', 'nr' => 'D3/' . date('Y', $now), 'title' => 'F2 – Brand Wohnhaus (Demo)', 'category' => 'brand', 'start' => $at(-40 * 60), 'place' => 'Musterstraße 1',
        'vehicles' => $veh([['HLF 20', date('H:i', $now - 37 * 60), date('H:i', $now - 31 * 60), ''], ['ELW 1', date('H:i', $now - 38 * 60), date('H:i', $now - 32 * 60), '']])]);
    $e2 = $inc(['kind' => 'einsatz', 'nr' => 'D2/' . date('Y', $now), 'title' => 'TH – VU PKW (Demo)', 'category' => 'vu', 'start' => $at(-26 * 3600), 'end' => $at(-24 * 3600), 'place' => 'Landstraße 12',
        'vehicles' => $veh([['HLF 20', '10:04', '10:12', '11:30'], ['MTF', '10:06', '10:15', '11:20']])]);
    $e3 = $inc(['kind' => 'uebung', 'nr' => '', 'title' => 'Dienstabend: Technische Hilfe (Demo)', 'category' => 'sonst', 'start' => $at(-3 * 86400), 'end' => $at(-3 * 86400 + 7200)]);
    $part = function ($iid, $n, $v, $role, $conf, $src) use ($wpdb, $mid, &$T) {
        if (empty($mid[$n])) return;
        $wpdb->insert(myf_t('participation'), ['incident_id' => $iid, 'member_id' => $mid[$n], 'vehicle' => $v, 'role' => $role, 'confirmed' => $conf ? 1 : 0, 'confirmed_by' => $conf ? 'Demo' : '',
            'source' => $src, 'created' => current_time('mysql')]);
        $T['participation'][] = (int) $wpdb->insert_id;
    };
    foreach ([['Becker, Lena', 'HLF 20', 'MA'], ['Schmitz, Tobias', 'HLF 20', 'GF'], ['Albers, Jan', 'HLF 20', 'AGT'], ['Elsing, Paul', 'HLF 20', 'AGT'], ['Vennemann, Kai', 'ELW 1', 'EL']] as $p) $part($e1, $p[0], $p[1], $p[2], false, 'terminal');
    foreach ([['Schmitz, Tobias', 'HLF 20', 'GF'], ['Hemsing, Lukas', 'HLF 20', 'MA'], ['Kemper, Jonas', 'HLF 20', 'AGT'], ['Lammers, Sophie', 'HLF 20', 'AGT'], ['Rotering, Ben', 'HLF 20', ''],
        ['Nienhaus, Felix', 'MTF', 'MA'], ['Overkamp, Mia', 'MTF', ''], ['Feldhaus, Nico', 'Nachbereitung / Aufräumen', '']] as $p) $part($e2, $p[0], $p[1], $p[2], true, 'terminal');
    foreach (['Albers, Jan', 'Becker, Lena', 'Brüggemann, Tim', 'Gerdes, Hannah', 'Tenbrink, Lea', 'Wessels, Max'] as $n) $part($e3, $n, 'Gerätehaus (Bereitschaft)', '', true, 'app');
    // Verdienstausfall: jede Stufe einmal – zeigt den Ablauf von der Anfrage bis zur Gemeinde
    $cert = function ($iid, $n, $row) use ($wpdb, $mid) { if (!empty($mid[$n])) $wpdb->update(myf_t('participation'), $row, ['incident_id' => $iid, 'member_id' => $mid[$n]]); };
    $cert($e2, 'Hemsing, Lukas', ['cert' => 'requested', 'work_resume' => '12:30']);
    $cert($e2, 'Lammers, Sophie', ['cert' => 'requested', 'work_resume' => 'none']); // Profil unvollständig → „fehlt: Geburtsdatum …“
    $cert($e2, 'Kemper, Jonas', ['cert' => 'issued', 'work_resume' => '13:00', 'cert_printed' => $at(-20 * 3600), 'cert_printed_by' => 'Demo-Wehrführung']);
    $cert($e2, 'Overkamp, Mia', ['cert' => 'handed', 'work_resume' => 'none', 'cert_printed' => $at(-22 * 3600), 'cert_printed_by' => 'Demo-Wehrführung', 'cert_handed' => $at(-2 * 3600), 'cert_handed_by' => 'Demo-Wehrführung']);
    $cert($e1, 'Becker, Lena', ['cert' => 'requested', 'work_resume' => '']); // Teilnahme noch nicht bestätigt

    // Fahrtenbuch: km-Stände, gestern verknüpft mit dem Einsatz
    $trip = function ($row) use ($wpdb, &$T) { $wpdb->insert(myf_t('trips'), $row + ['source' => 'app', 'by_name' => 'Demo', 'created' => current_time('mysql')]); $T['trips'][] = (int) $wpdb->insert_id; };
    if (in_array($vid['HLF 20'], $T['vehicles'], true)) {
        $trip(['vehicle_id' => $vid['HLF 20'], 'kind' => 'werkstatt', 'start' => $at(-12 * 86400), 'purpose' => 'TÜV', 'km_start' => 41020, 'km_end' => 41058]);
        $trip(['vehicle_id' => $vid['HLF 20'], 'kind' => 'einsatz', 'start' => $at(-26 * 3600), 'purpose' => 'D2 VU PKW', 'km_start' => 41058, 'km_end' => 41077, 'incident_id' => $e2, 'driver' => 'Hemsing, Lukas']);
    }
    if (in_array($vid['MTF'], $T['vehicles'], true)) {
        $trip(['vehicle_id' => $vid['MTF'], 'kind' => 'verein', 'start' => $at(-6 * 86400), 'purpose' => 'Jugendfeuerwehr Ausflug', 'km_start' => 88310, 'km_end' => 88412, 'fuel_l' => 38.5, 'fuel_cost' => 64.10]);
        // Buchung in drei Tagen
        $by = $mid['Tenbrink, Lea'] ?? 0;
        if ($by) {
            $wpdb->insert(myf_t('bookings'), ['vehicle_id' => $vid['MTF'], 'member_id' => $by, 'start' => date('Y-m-d 09:00:00', $now + 3 * 86400), 'end' => date('Y-m-d 17:00:00', $now + 3 * 86400),
                'purpose' => 'Jugendfeuerwehr: Zeltlager-Aufbau', 'persons' => 6, 'driver' => 'Lea Tenbrink', 'status' => 'approved', 'decided_by' => 'Demo', 'decided_at' => current_time('mysql'), 'created' => current_time('mysql')]);
            $T['bookings'][] = (int) $wpdb->insert_id;
            // Offene Anfrage – die LZ-Führung gibt sie auf ihrer Startseite frei
            $wpdb->insert(myf_t('bookings'), ['vehicle_id' => $vid['MTF'], 'member_id' => $mid['Gerdes, Hannah'] ?? $by, 'start' => date('Y-m-d 14:00:00', $now + 9 * 86400), 'end' => date('Y-m-d 19:00:00', $now + 9 * 86400),
                'purpose' => 'Medienteam: Fotos beim Kreisfeuerwehrtag', 'persons' => 3, 'driver' => 'Hannah Gerdes', 'status' => 'requested', 'created' => current_time('mysql')]);
            $T['bookings'][] = (int) $wpdb->insert_id;
        }
    }
    // Ein Mangel und drei Dienste
    $wpdb->insert(myf_t('defects'), ['member_id' => $mid['Hemsing, Lukas'] ?? null, 'object' => 'LF 20', 'urgency' => 'soon', 'title' => 'Blaulicht hinten links ohne Funktion', 'text' => 'Demo-Meldung', 'status' => 'new', 'created' => current_time('mysql')]);
    $T['defects'][] = (int) $wpdb->insert_id;
    foreach ([[7, 'Technische Hilfe: Rettung aus PKW', 'Gruppe 1'], [14, 'Atemschutz: Innenangriff', 'Gruppe 2'], [21, 'Maschinistenausbildung Pumpe', 'B. Rotering']] as $x) {
        $wpdb->insert(myf_t('drills'), ['date' => date('Y-m-d', $now + $x[0] * 86400), 'time_from' => '19:30', 'title' => $x[1], 'leader' => $x[2], 'unit' => '', 'note' => 'Demo', 'created' => current_time('mysql')]);
        $T['drills'][] = (int) $wpdb->insert_id;
    }
    // Einteilungen mit Mindestzahl: Grünanlagen (eine Lücke) und Brandsicherheitswache (es fehlen Leute)
    $dlist = function ($title, $note) use ($wpdb, &$T) { $wpdb->insert(myf_t('duty_lists'), ['title' => $title, 'area' => 'duties', 'note' => $note, 'self_signup' => 1, 'active' => 1, 'created' => current_time('mysql')]); $id = (int) $wpdb->insert_id; $T['duty_lists'][] = $id; return $id; };
    $slot = function ($lid, $days, $label, $time, $min, $cap, $who) use ($wpdb, $now, $mid) {
        $wpdb->insert(myf_t('duty_slots'), ['list_id' => $lid, 'date' => date('Y-m-d', $now + $days * 86400), 'label' => $label, 'time_from' => $time, 'capacity' => $cap, 'min_people' => $min]);
        $sid = (int) $wpdb->insert_id;
        foreach ($who as $n) if (!empty($mid[$n])) $wpdb->insert(myf_t('duty_assign'), ['slot_id' => $sid, 'member_id' => $mid[$n], 'by_self' => 1, 'created' => current_time('mysql')]);
    };
    $g = $dlist('Grünanlagen-Pflege (Demo)', 'Freitags 17:00 Uhr am Gerätehaus – Handschuhe mitbringen.');
    $slot($g, 2, 'Rasen & Hecke', '17:00', 3, 5, ['Wessels, Max', 'Rotering, Ben', 'Feldhaus, Nico']);
    $slot($g, 16, 'Rasen & Beete', '17:00', 3, 5, ['Elsing, Paul']);
    $b = $dlist('Brandsicherheitswachen (Demo)', 'Bitte in Dienstkleidung, Treffpunkt 30 Min. vorher am Gerätehaus.');
    $slot($b, 6, 'Volkstrauertag – Ehrenmal', '10:30', 4, 8, ['Becker, Lena', 'Hemsing, Lukas']);
    $slot($b, 12, 'Martinsumzug', '17:30', 4, 6, ['Schmitz, Tobias']);
    // Alle übrigen Bereiche füllen (mehrere Jahre, Berichte, Atemschutz, Lehrgänge, Unterweisungen, Leihkleidung …)
    if (function_exists('myf_demo_more')) myf_demo_more($mid, $vid, $e1, $e2, $unit, $now);
    // Ein Profil absichtlich unvollständig: zeigt beim Verdienstausfall „fehlt: Geburtsort“ (nach den übrigen Demo-Profildaten,
    // aber VOR dem Zurückschalten auf die echten Tabellen – sonst träfe es ein echtes Mitglied)
    if (!empty($mid['Lammers, Sophie'])) $wpdb->update(myf_t('members'), ['birth_place' => ''], ['id' => $mid['Lammers, Sophie']]);
    unset($GLOBALS['myf_demo_force']);
    $dm['creds'] = $creds;
    update_option('myf_demo', $dm, false);
    return ['ok' => true, 'creds' => $creds];
}

// Demo-Logins je Rolle: Gerätewart (Fahrzeuge, Technik, Mängel – kein Atemschutz) und Atemschutzgerätewart (G26, Übungsstrecke,
// Atemschutzgeräte) sind getrennt, so sieht man, dass jeder nur seinen Bereich bekommt. Legt nur an, was noch fehlt.
const MYF_DEMO_LOGINS = [['demo.wf', 'Vennemann, Kai', 'Wehrführung – fast alle Bereiche'], ['demo.lz', 'Overkamp, Mia', 'LZ-Führung – gibt Fahrzeug-Anfragen frei'],
    ['demo.gf', 'Schmitz, Tobias', 'Gruppenführer – Einsatzberichte'], ['demo.gw', 'Kemper, Jonas', 'Gerätewart – Fahrzeuge, Technik & Mängel (kein Atemschutz)'],
    ['demo.agw', 'Albers, Jan', 'Atemschutzgerätewart – G26, Übungsstrecke, Atemschutzgeräte'], ['demo.mitglied', 'Tenbrink, Lea', 'Mitglied – nur Mitgliederbereich']];
function myf_demo_logins(array $mid, array &$T) {
    global $wpdb;
    $creds = [];
    foreach (MYF_DEMO_LOGINS as $u) {
        if (empty($mid[$u[1]]) || username_exists($u[0])) continue;
        $pw = wp_generate_password(14, false);
        $uid = wp_insert_user(['user_login' => $u[0], 'user_pass' => $pw, 'user_email' => $u[0] . '@demo.invalid', 'display_name' => $u[1], 'role' => MYF_ROLE]);
        if (is_wp_error($uid)) continue;
        update_user_meta($uid, 'myf_demo_user', 1); // dieses Konto sieht nur den Demo-Bestand
        $wpdb->update(myf_t('members'), ['user_id' => $uid], ['id' => $mid[$u[1]]]);
        $T['users'][] = (int) $uid; $creds[] = ['login' => $u[0], 'password' => $pw, 'who' => $u[1], 'role' => $u[2]];
    }
    return $creds;
}
// Laufende Demo nach einem Update ergänzen (neue Demo-Logins, z. B. der Atemschutzgerätewart)
function myf_demo_upgrade() {
    global $wpdb;
    $dm = myf_demo();
    if (!$dm || empty($dm['v2'])) return;
    $have = array_column((array) ($dm['creds'] ?? []), 'login');
    if (!array_diff(array_column(MYF_DEMO_LOGINS, 0), $have)) return;
    $GLOBALS['myf_demo_force'] = 'demo';
    $mid = [];
    foreach ($wpdb->get_results('SELECT id, name FROM ' . myf_t('members')) as $m) $mid[$m->name] = (int) $m->id;
    $T = ['users' => []];
    $new = myf_demo_logins($mid, $T);
    unset($GLOBALS['myf_demo_force']);
    // Beschreibungen der vorhandenen Logins auf den aktuellen Stand bringen
    $roles = array_column(MYF_DEMO_LOGINS, 2, 0);
    $creds = array_map(function ($c) use ($roles) { $c['role'] = $roles[$c['login']] ?? $c['role']; return $c; }, (array) ($dm['creds'] ?? []));
    $dm['creds'] = array_merge($creds, $new);
    update_option('myf_demo', $dm, false);
}
add_action('admin_init', 'myf_demo_upgrade');

function myf_demo_off() {
    if (myf_demo() && !myf_demo_on_v2()) myf_demo_off_legacy();
    myf_demo_wipe();
    delete_option('myf_demo');
    return ['ok' => true];
}

// Früherer Demo-Modus (vor 3.3, Demo-Einträge in den echten Tabellen): genau diese Einträge entfernen
function myf_demo_off_legacy() {
    global $wpdb;
    $T = myf_demo();
    if (!$T) return ['ok' => true];
    $in = function ($ids) { return implode(',', array_map('intval', $ids ?: [0])); };
    if ($T['incidents']) {
        $wpdb->query('DELETE FROM ' . myf_t('participation') . ' WHERE incident_id IN (' . $in($T['incidents']) . ')');
        $wpdb->query('DELETE FROM ' . myf_t('trips') . ' WHERE incident_id IN (' . $in($T['incidents']) . ')');
    }
    $wpdb->query('DELETE FROM ' . myf_t('participation') . ' WHERE id IN (' . $in($T['participation']) . ') OR member_id IN (' . $in($T['members']) . ')');
    $wpdb->query('DELETE FROM ' . myf_t('trips') . ' WHERE id IN (' . $in($T['trips']) . ') OR vehicle_id IN (' . $in($T['vehicles']) . ') OR storno_of IN (' . $in($T['trips']) . ')');
    $wpdb->query('DELETE FROM ' . myf_t('bookings') . ' WHERE id IN (' . $in($T['bookings']) . ') OR vehicle_id IN (' . $in($T['vehicles']) . ')');
    $wpdb->query('DELETE FROM ' . myf_t('defects') . ' WHERE id IN (' . $in($T['defects']) . ')');
    $wpdb->query('DELETE FROM ' . myf_t('drills') . ' WHERE id IN (' . $in($T['drills']) . ')');
    if (!empty($T['duty_lists'])) {
        $wpdb->query('DELETE FROM ' . myf_t('duty_assign') . ' WHERE slot_id IN (SELECT id FROM ' . myf_t('duty_slots') . ' WHERE list_id IN (' . $in($T['duty_lists']) . '))');
        $wpdb->query('DELETE FROM ' . myf_t('duty_slots') . ' WHERE list_id IN (' . $in($T['duty_lists']) . ')');
        $wpdb->query('DELETE FROM ' . myf_t('duty_lists') . ' WHERE id IN (' . $in($T['duty_lists']) . ')');
    }
    $wpdb->query('DELETE FROM ' . myf_t('duty_assign') . ' WHERE member_id IN (' . $in($T['members']) . ')');
    $wpdb->query('DELETE FROM ' . myf_t('incidents') . ' WHERE id IN (' . $in($T['incidents']) . ')');
    $wpdb->query('DELETE FROM ' . myf_t('member_traits') . ' WHERE member_id IN (' . $in($T['members']) . ')');
    $wpdb->query('DELETE FROM ' . myf_t('notifications') . ' WHERE member_id IN (' . $in($T['members']) . ')');
    $wpdb->query('DELETE FROM ' . myf_t('members') . ' WHERE id IN (' . $in($T['members']) . ')');
    $wpdb->query('DELETE FROM ' . myf_t('vehicles') . ' WHERE id IN (' . $in($T['vehicles']) . ')');
    $vs = myf_vstatus(); foreach ($T['vehicles'] as $v) unset($vs[$v]); update_option('myf_vehicle_status', $vs, false);
    if ($T['users']) { require_once ABSPATH . 'wp-admin/includes/user.php'; foreach ($T['users'] as $u) wp_delete_user((int) $u); }
    delete_option('myf_demo');
    return ['ok' => true];
}

// Administrator: zwischen echten Daten und Demo-Bestand umschalten (nur für sich selbst)
function myf_demo_view($on) {
    global $wpdb;
    $uid = get_current_user_id();
    if (!$uid || !myf_demo_on_v2()) return myf_err('Der Demo-Modus ist nicht an.');
    if (!$on) { delete_user_meta($uid, 'myf_demo_view'); return ['ok' => true, 'view' => false]; }
    update_user_meta($uid, 'myf_demo_view', 1);
    // Im Demo-Bestand ein eigenes Mitglied, damit auch die Mitgliederansicht funktioniert
    $GLOBALS['myf_demo_force'] = 'demo';
    if (!$wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('members') . ' WHERE user_id = %d', $uid))) {
        $u = wp_get_current_user();
        $wpdb->insert(myf_t('members'), ['name' => trim(($u->last_name ?: $u->display_name) . ($u->first_name ? ', ' . $u->first_name : '')) . ' (Demo-Ansicht)', 'unit' => array_key_first(myf_units()) ?: 'lz1',
            'active' => 1, 'dienstgrad' => 'BM', 'dept' => 'einsatz', 'user_id' => $uid, 'note' => 'Demo']);
        $mid = (int) $wpdb->insert_id;
        $tid = (int) $wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('traits') . ' WHERE name = %s', 'Wehrführung'));
        if ($tid) $wpdb->query($wpdb->prepare('INSERT IGNORE INTO ' . myf_t('member_traits') . ' (member_id, trait_id) VALUES (%d, %d)', $mid, $tid));
    }
    unset($GLOBALS['myf_demo_force']);
    return ['ok' => true, 'view' => true];
}

// Alarmszenario für Vorführungen – nur im Demo-Bestand. Schritte: Alarm (brand/th/vu) → Erhöhung → Nachalarmierung →
// Einsatzende (zurück zur Ruhe) → Zurücksetzen. Dashboards (Besprechungsraum, Halle) reagieren wie bei einem echten Alarm.
const MYF_DEMO_SCENES = [
    'brand' => ['F2 – Brand Wohnhaus', 'Musterstraße 1', 'brand', ['HLF 20', 'LF 20', 'ELW 1'], 'Rauchentwicklung aus dem Dachgeschoss, Personen noch im Haus'],
    'th' => ['H1 – Hilfe P-Tür', 'Kirchplatz 4', 'th', ['HLF 20'], 'Hilflose Person hinter verschlossener Tür, Rettungsdienst vor Ort'],
    'vu' => ['TH – VU PKW, Person eingeklemmt', 'Landstraße 12', 'vu', ['HLF 20', 'LF 20', 'ELW 1'], 'PKW gegen Baum, eine Person eingeklemmt'],
];
function myf_demo_scenario($step) {
    global $wpdb;
    if (!myf_demo_on_v2()) return myf_err('Der Demo-Modus ist nicht an.');
    $GLOBALS['myf_demo_force'] = 'demo';
    try {
        $nowS = current_time('mysql');
        $t = myf_t('incidents');
        // Alarm-Anzeige im Demo-Bestand sicherstellen (Schnittstelle an, Anzeige mindestens 90 Minuten)
        $s = myf_settings(); $a = (array) ($s['alarm'] ?? []);
        if (empty($a['on']) || (int) ($a['screen_minutes'] ?? 0) < 90) { $a['on'] = true; $a['key'] = $a['key'] ?? wp_generate_password(32, false); $a['screen_minutes'] = max(90, (int) ($a['screen_minutes'] ?? 0)); $s['alarm'] = $a; update_option('myf_settings', $s); }
        $vs = myf_vstatus(); $vid = [];
        foreach ($wpdb->get_results('SELECT id, name FROM ' . myf_t('vehicles') . ' WHERE active = 1') as $v) $vid[$v->name] = (int) $v->id;
        $fms = function ($names, $st) use (&$vs, $vid, $nowS) { foreach ($names as $n) if (isset($vid[$n])) $vs[$vid[$n]] = ['s' => $st, 't' => $nowS, 'by' => 'Demo-Szenario']; };
        $cur = $wpdb->get_row("SELECT * FROM $t WHERE created_by = 'Demo-Szenario' AND part_closed IS NULL ORDER BY start DESC LIMIT 1");
        $msg = '';
        if (isset(MYF_DEMO_SCENES[$step]) || $step === 'alarm') {
            $sc = MYF_DEMO_SCENES[$step === 'alarm' ? 'brand' : $step];
            // Erst Ruhe: alle offenen Listen schließen, dann der neue Alarm – so sieht man den Umschlag ruhig → Alarm
            $wpdb->query($wpdb->prepare("UPDATE $t SET part_closed = %s WHERE part_closed IS NULL", $nowS));
            $wpdb->insert($t, ['kind' => 'einsatz', 'nr' => '', 'title' => $sc[0], 'category' => $sc[2], 'start' => $nowS, 'place' => $sc[1],
                'alarms' => wp_json_encode([['t' => $nowS, 'kw' => $sc[0], 'k' => 'Alarm']]), 'alarm_text' => myf_enc('Demo-Alarm: ' . $sc[4]),
                'source' => 'demo', 'created' => $nowS, 'created_by' => 'Demo-Szenario']);
            $fms($sc[3], '3'); // ausgerückt
            $msg = 'Alarm ausgelöst: ' . $sc[0];
        } elseif ($step === 'probe') {
            // Probealarm (z. B. montags 19 Uhr): nur ein Testalarm – lila auf dem Dashboard, kein Einsatz, keine Liste in der Halle
            $wpdb->insert($t, ['kind' => 'einsatz', 'nr' => '', 'title' => 'TESTALARM: Probealarm Sirene', 'category' => 'sonst', 'start' => $nowS, 'place' => '',
                'alarms' => wp_json_encode([['t' => $nowS, 'kw' => 'TESTALARM: Probealarm Sirene', 'k' => 'Alarm']]), 'alarm_text' => myf_enc('Demo: wöchentlicher Probealarm – kein Einsatz'),
                'end' => date('Y-m-d H:i:s', strtotime($nowS) + 20 * MINUTE_IN_SECONDS), 'source' => 'test', 'created' => $nowS, 'created_by' => 'Demo-Szenario']);
            $msg = 'Probealarm ausgelöst – nur als Test sichtbar (lila), kein Einsatz';
        } elseif ($step === 'erhoehung' || $step === 'nachalarm') {
            if (!$cur) return myf_err('Erst einen Alarm auslösen.');
            $hist = json_decode((string) $cur->alarms, true) ?: [];
            $kw = $step === 'erhoehung' ? preg_replace('/^(F|H|TH)\s?(\d)/', '${1}3', $cur->title) . ', Menschenleben in Gefahr' : 'Nachalarmierung: DLK Nachbarwehr, MTF';
            $hist[] = ['t' => $nowS, 'kw' => $kw, 'k' => $step === 'erhoehung' ? 'Erhöhung' : 'Nachalarmierung'];
            $upd = ['alarms' => wp_json_encode($hist)];
            if ($step === 'erhoehung') $upd['title'] = mb_substr($kw, 0, 200); else $fms(['MTF'], '3');
            $wpdb->update($t, $upd, ['id' => $cur->id]);
            $msg = $step === 'erhoehung' ? 'Erhöhung gemeldet' : 'Nachalarmierung gemeldet';
        } elseif ($step === 'ende') {
            $wpdb->query($wpdb->prepare("UPDATE $t SET end = %s WHERE created_by = 'Demo-Szenario' AND end IS NULL", $nowS));
            $wpdb->query($wpdb->prepare("UPDATE $t SET part_closed = %s WHERE part_closed IS NULL", $nowS));
            $fms(['HLF 20', 'LF 20', 'MTF'], '2'); $fms(['ELW 1'], '1');
            $msg = 'Einsatz beendet – Dashboards zeigen wieder die Ruheansicht';
        } elseif ($step === 'reset') {
            $ids = array_map('intval', $wpdb->get_col("SELECT id FROM $t WHERE created_by = 'Demo-Szenario'")) ?: [0];
            $wpdb->query('DELETE FROM ' . myf_t('participation') . ' WHERE incident_id IN (' . implode(',', $ids) . ')');
            $wpdb->query('DELETE FROM ' . myf_t('trips') . ' WHERE incident_id IN (' . implode(',', $ids) . ')');
            $wpdb->query("DELETE FROM $t WHERE created_by = 'Demo-Szenario'");
            $wpdb->query("UPDATE $t SET part_closed = NULL WHERE created_by = 'Demo' AND nr LIKE 'D3/%'"); // Ausgangslage: eine offene Liste
            $fms(['HLF 20', 'LF 20', 'MTF'], '2'); $fms(['ELW 1'], '1');
            $msg = 'Demo zurückgesetzt';
        } else return myf_err('Unbekannter Schritt.');
        update_option('myf_vehicle_status', $vs, false);
        return ['ok' => true, 'step' => $step, 'message' => $msg];
    } finally { unset($GLOBALS['myf_demo_force']); }
}

add_action('rest_api_init', function () {
    // Szenario vom Demo-Hallen-Tablet aus (nur mit dem Demo-Gerätelink)
    register_rest_route('myf/v1', '/hall/demo', ['methods' => 'POST', 'permission_callback' => '__return_true', 'callback' => function (WP_REST_Request $req) {
        if (!myf_demo_ctx() || !function_exists('myf_hall_key_ok') || !myf_hall_key_ok((string) $req->get_param('key'))) return myf_err('Nur im Demo-Bestand.', 403);
        return myf_demo_scenario((string) $req->get_param('step'));
    }]);
    register_rest_route('myf/v1', '/admin/demo', ['methods' => 'POST', 'permission_callback' => function () {
        // Umschalten der eigenen Ansicht: jeder Administrator (auch aus der Demo-Ansicht heraus); an/aus: nur Hauptverwaltung (echte Daten)
        return current_user_can('manage_options') || (!myf_demo_ctx() && myf_route_perm(...func_get_args()));
    }, 'callback' => function (WP_REST_Request $req) {
        $a = (string) $req->get_param('action');
        if ($a === 'view') return myf_demo_view((bool) $req->get_param('on'));
        if ($a === 'scenario') { if (!myf_demo_can()) return myf_err('Dafür fehlt dir das Recht „Demo-Modus“.', 403); return myf_demo_scenario((string) $req->get_param('step')); }
        if (myf_demo_ctx()) return myf_err('Bitte erst zurück zu den echten Daten wechseln.');
        return $a === 'off' ? myf_demo_off() : myf_demo_on();
    }]);
});
// Altbestand (Demo-Einträge in echten Tabellen) beim Update automatisch entfernen
add_action('init', function () { $d = myf_demo(); if ($d && empty($d['v2']) && !myf_demo_ctx()) { myf_demo_off_legacy(); } }, 20);

add_filter('myf_admin_state', function ($d) {
    $T = myf_demo(); $on = $T && !empty($T['v2']); $ctx = myf_demo_ctx();
    $d['demo'] = ['on' => $on, 'ctx' => $ctx, 'can' => myf_demo_can(), 'since' => $on ? $T['since'] : '', 'creds' => $on && myf_demo_can() ? ($T['creds'] ?? []) : [],
        'can_view' => $on && myf_demo_can(),
        'hall_url' => $on && myf_demo_can() ? add_query_arg('myf_halle', $T['hall_key'], home_url('/')) : '',
        'screen_url' => $on && myf_demo_can() ? add_query_arg('myf_screen', $T['screen_key'], home_url('/')) : ''];
    return $d;
}, 40);
add_filter('myf_me_data', function ($data) { $data['demo'] = myf_demo_ctx(); $data['demo_view'] = myf_demo_ctx() && myf_demo_can(); return $data; }, 40);
add_filter('myf_screen_data', function ($out) { $out['demo'] = myf_demo_ctx(); return $out; });
