<?php
/** Installation, Tabellen, Einstellungen und gemeinsame Hilfsfunktionen. */

defined('ABSPATH') || exit;

function myf_t($name) { global $wpdb; return $wpdb->prefix . (myf_demo_ctx() ? 'ffl_demo_' : 'ffl_') . $name; }

/*
 * Demo-Modus: eigener, vollständig getrennter Datenbestand (Tabellen …ffl_demo_*, eigene Einstellungen).
 * Demo-Daten sehen nur Demo-Konten und Administratoren, die bewusst „Demo ansehen“ gewählt haben – und die Demo-Geräte-
 * links. Alle anderen (auch Alarm-Schnittstelle, echte Geräte, Cron, E-Mails) arbeiten immer mit den echten Daten.
 */
function myf_demo_ctx() {
    if (!empty($GLOBALS['myf_demo_force'])) return $GLOBALS['myf_demo_force'] === 'demo';
    static $c = null;
    if ($c !== null) return $c;
    $dm = get_option('myf_demo');
    if (!is_array($dm) || empty($dm['v2'])) return did_action('init') ? ($c = false) : false;
    // Geräte (Halle/Dashboard) mit Demo-Schlüssel
    $keys = array_filter([(string) ($dm['hall_key'] ?? ''), (string) ($dm['screen_key'] ?? '')]);
    $cand = [];
    foreach (['myf_halle', 'myf_screen', 'key'] as $k) { if (isset($_GET[$k])) $cand[] = (string) $_GET[$k]; if (isset($_POST[$k])) $cand[] = (string) $_POST[$k]; }
    if (!empty($_SERVER['HTTP_X_WEHRWERK_KEY'])) $cand[] = (string) $_SERVER['HTTP_X_WEHRWERK_KEY'];
    if (stripos((string) ($_SERVER['CONTENT_TYPE'] ?? ''), 'json') !== false && (int) ($_SERVER['CONTENT_LENGTH'] ?? 0) < 20000) {
        $j = json_decode((string) file_get_contents('php://input'), true);
        if (is_array($j) && isset($j['key']) && is_string($j['key'])) $cand[] = $j['key'];
    }
    foreach ($cand as $v) foreach ($keys as $k) if ($v !== '' && hash_equals($k, $v)) return $c = true;
    if (!did_action('init')) return false; // Benutzer steht noch nicht fest – nicht merken
    $uid = get_current_user_id();
    return $c = $uid && (get_user_meta($uid, 'myf_demo_user', true) || get_user_meta($uid, 'myf_demo_view', true));
}
// Einstellungen/Merker, die es im Demo-Bestand getrennt gibt (Wert = Vorgabe, wenn im Demo noch nichts gespeichert ist)
const MYF_DEMO_OPTS = ['myf_settings' => [], 'myf_vehicle_status' => [], 'myf_incveh_extra' => [], 'myf_session_tpls' => [], 'myf_db_version' => '',
    'myf_traits_functions' => '0', 'myf_teams_seeded' => '0', 'myf_mig_daytime' => '1', 'myf_mig_incveh' => '1', 'myf_enc_done' => '0', 'myf_agt_auto' => [], 'myf_team_jf' => '1'];
foreach (MYF_DEMO_OPTS as $myf_o => $myf_def) {
    add_filter('pre_option_' . $myf_o, function ($pre, $opt) use ($myf_def) {
        if (!myf_demo_ctx()) return $pre;
        $v = get_option('myf_demo__' . $opt, null);
        return $v === null || $v === false ? $myf_def : $v; // nie false zurückgeben – sonst läse WordPress den echten Wert
    }, 10, 2);
    add_filter('pre_update_option_' . $myf_o, function ($value, $old, $opt) {
        if (!myf_demo_ctx()) return $value;
        update_option('myf_demo__' . $opt, $value, false);
        return $old; // echter Wert bleibt unverändert
    }, 10, 3);
}
// Im Demo-Bestand gehen keine E-Mails raus
add_filter('pre_wp_mail', function ($r) { return myf_demo_ctx() ? true : $r; });
// Demo-Tabellen bei einem Update ebenfalls auf den neuen Stand bringen (sobald jemand die Demo öffnet)
add_action('init', function () { if (myf_demo_ctx() && get_option('myf_db_version') !== MYF_DB_VERSION) myf_install(); }, 1);

function myf_install() {
    global $wpdb;
    // Profil festhalten: neue Installationen starten neutral; ein Zusatz mit örtlichen Vorgaben (Ordner local/) kann sein Profil setzen
    if (!get_option('myf_profile')) update_option('myf_profile', sanitize_key((string) apply_filters('myf_profile_initial', 'generic')) ?: 'generic');
    $u0 = esc_sql(myf_unit_default()); // Vorgabe der Spalte „unit“: die erste Einheit
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    $c = $wpdb->get_charset_collate();
    $p = myf_t(''); // echte oder Demo-Tabellen (Demo-Modus)

    dbDelta("CREATE TABLE {$p}members (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        user_id bigint(20) unsigned NULL,
        name varchar(120) NOT NULL,
        unit varchar(20) NOT NULL DEFAULT '{$u0}',
        active tinyint(1) NOT NULL DEFAULT 1,
        agt tinyint(1) NOT NULL DEFAULT 0,
        g26_until date NULL,
        ics_ver varchar(16) NOT NULL DEFAULT '',
        sizes text NULL,
        employment varchar(20) NOT NULL DEFAULT 'ehrenamt',
        day_available tinyint(1) NOT NULL DEFAULT 0,
        note text NULL,
        can_notice tinyint(1) NOT NULL DEFAULT 0,
        dienstgrad varchar(60) NOT NULL DEFAULT '',
        rank_since date NULL,
        joined date NULL,
        dept varchar(16) NOT NULL DEFAULT 'einsatz',
        dept_since date NULL,
        birth_date date NULL,
        birth_place varchar(80) NOT NULL DEFAULT '',
        street varchar(120) NOT NULL DEFAULT '',
        phone varchar(40) NOT NULL DEFAULT '',
        mstatus varchar(12) NOT NULL DEFAULT 'aktiv',
        PRIMARY KEY  (id),
        KEY user_id (user_id)
    ) $c;");

    dbDelta("CREATE TABLE {$p}courses (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        year smallint(5) unsigned NOT NULL,
        cat varchar(20) NOT NULL DEFAULT 'kreis_lg',
        nr varchar(20) NOT NULL DEFAULT '',
        title varchar(200) NOT NULL,
        short varchar(60) NOT NULL DEFAULT '',
        days varchar(10) NOT NULL DEFAULT '',
        ue varchar(10) NOT NULL DEFAULT '',
        locations varchar(120) NOT NULL DEFAULT '',
        prereq text NULL,
        cost decimal(8,2) NULL,
        note text NULL,
        hidden tinyint(1) NOT NULL DEFAULT 0,
        sort int(11) NOT NULL DEFAULT 0,
        PRIMARY KEY  (id),
        KEY year (year)
    ) $c;");

    dbDelta("CREATE TABLE {$p}dates (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        course_id bigint(20) unsigned NOT NULL,
        start_date date NULL,
        end_date date NULL,
        period varchar(80) NOT NULL DEFAULT '',
        location varchar(80) NOT NULL DEFAULT '',
        slots smallint(5) unsigned NOT NULL DEFAULT 0,
        daytime varchar(5) NOT NULL DEFAULT '',
        sessions text NULL,
        PRIMARY KEY  (id),
        KEY course_id (course_id),
        KEY start_date (start_date)
    ) $c;");

    dbDelta("CREATE TABLE {$p}needs (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        member_id bigint(20) unsigned NOT NULL,
        course_id bigint(20) unsigned NOT NULL,
        comment text NULL,
        status varchar(12) NOT NULL DEFAULT 'open',
        date_id bigint(20) unsigned NULL,
        admin_note varchar(255) NOT NULL DEFAULT '',
        created datetime NOT NULL,
        PRIMARY KEY  (id),
        UNIQUE KEY member_course (member_id,course_id),
        KEY course_id (course_id),
        KEY date_id (date_id)
    ) $c;");

    // Lehrgänge, die nicht über das Portal liefen (z. B. aus früheren Jahren nachgetragen)
    dbDelta("CREATE TABLE {$p}quals (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        member_id bigint(20) unsigned NOT NULL,
        title varchar(200) NOT NULL,
        short varchar(60) NOT NULL DEFAULT '',
        year smallint(5) unsigned NULL,
        date date NULL,
        note varchar(255) NOT NULL DEFAULT '',
        PRIMARY KEY  (id),
        KEY member_id (member_id)
    ) $c;");

    dbDelta("CREATE TABLE {$p}agt_log (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        member_id bigint(20) unsigned NOT NULL,
        date date NOT NULL,
        kind varchar(20) NOT NULL DEFAULT 'strecke',
        note varchar(255) NOT NULL DEFAULT '',
        file varchar(255) NOT NULL DEFAULT '',
        by_name varchar(120) NOT NULL DEFAULT '',
        PRIMARY KEY  (id),
        KEY member_id (member_id)
    ) $c;");

    dbDelta("CREATE TABLE {$p}clothing (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        member_id bigint(20) unsigned NOT NULL,
        kind varchar(10) NOT NULL DEFAULT 'ersatz',
        item varchar(80) NOT NULL,
        size varchar(30) NOT NULL DEFAULT '',
        qty smallint(5) unsigned NOT NULL DEFAULT 1,
        reason varchar(40) NOT NULL DEFAULT '',
        comment text NULL,
        status varchar(12) NOT NULL DEFAULT 'open',
        admin_note varchar(255) NOT NULL DEFAULT '',
        created datetime NOT NULL,
        PRIMARY KEY  (id),
        KEY member_id (member_id)
    ) $c;");

    // Anregungen: bei anonymen Anregungen wird kein Mitglied gespeichert, nur ein nicht umkehrbarer Besitzer-Schlüssel
    dbDelta("CREATE TABLE {$p}ideas (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        member_id bigint(20) unsigned NULL,
        owner_hash char(64) NOT NULL,
        recipient varchar(10) NOT NULL DEFAULT 'wehr',
        subject varchar(150) NOT NULL DEFAULT '',
        text text NOT NULL,
        status varchar(12) NOT NULL DEFAULT 'new',
        answer text NULL,
        answered datetime NULL,
        archived tinyint(1) NOT NULL DEFAULT 0,
        created datetime NOT NULL,
        PRIMARY KEY  (id),
        KEY owner_hash (owner_hash)
    ) $c;");

    // Änderungsprotokoll: wird nur ergänzt, nie geändert (Hash-Kette)
    dbDelta("CREATE TABLE {$p}audit (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        ts datetime NOT NULL,
        actor_type varchar(10) NOT NULL,
        actor_id bigint(20) unsigned NOT NULL DEFAULT 0,
        actor_name varchar(120) NOT NULL DEFAULT '',
        action varchar(60) NOT NULL,
        entity varchar(30) NOT NULL DEFAULT '',
        entity_id bigint(20) unsigned NULL,
        data longtext NULL,
        prev_hash char(64) NOT NULL DEFAULT '',
        hash char(64) NOT NULL,
        PRIMARY KEY  (id),
        UNIQUE KEY prev_hash (prev_hash),
        KEY entity (entity,entity_id)
    ) $c;");

    if (!get_option('myf_settings')) {
        add_option('myf_settings', [
            'year' => (int) current_time('Y') + 1, 'deadline' => '', 'open' => false, 'published' => false, 'intro' => '',
            'clothing_open' => true, 'clothing_items' => MYF_CLOTHING_ITEMS, 'ideas_open' => true,
        ]);
    }

    // Rolle für Mitglieder: darf nur das Portal nutzen
    if (!get_role(MYF_ROLE)) add_role(MYF_ROLE, 'Feuerwehr-Mitglied', ['read' => true]);
    foreach (['administrator', 'editor'] as $r) {
        $role = get_role($r);
        if ($role) $role->add_cap('ffl_manage');
    }
    // Atemschutz/G26: standardmäßig nur Administratoren
    $admin = get_role('administrator');
    if ($admin) $admin->add_cap('ffl_agt');

    if (!(int) $wpdb->get_var('SELECT COUNT(*) FROM ' . myf_t('courses') . ' WHERE year = 0')) myf_seed_templates();
    myf_install_equipment($c);
    myf_install_defects($c);
    myf_install_notices($c);
    myf_install_incidents($c);
    myf_install_notify($c);
    myf_install_workshop($c);
    myf_install_vehicles($c);
    myf_install_duties($c);
    myf_install_alarm($c);
    myf_install_rights();
    myf_install_teams();
    myf_install_teamwork($c);
    myf_install_security();
    myf_install_drills($c);
    myf_install_hall($c);
    if (function_exists('myf_install_passkeys')) myf_install_passkeys($c);
    myf_install_archive($c);
    myf_install_materials($c);
    myf_install_asu($c);
    myf_install_orders($c);
    if (function_exists('myf_install_app')) myf_install_app($c);
    myf_install_briefings($c);
    myf_install_membership($c);
    myf_install_loans($c);
    if (function_exists('myf_install_lockers')) myf_install_lockers($c);
    update_option('myf_db_version', MYF_DB_VERSION);
}

// Legt fehlende Standard-Vorlagen an (vorhandene mit gleicher Bezeichnung bleiben unverändert)
function myf_seed_templates() {
    global $wpdb;
    $added = 0;
    // Mitgeliefert sind neutrale Vorlagen (ohne Nummern, Orte und Kosten); ein Zusatz mit örtlichen Vorgaben kann die Liste ersetzen
    foreach ((array) apply_filters('myf_course_templates', (array) include __DIR__ . '/templates.php') as $i => $r) {
        if ($wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('courses') . ' WHERE year = 0 AND title = %s', $r[2]))) continue;
        $wpdb->insert(myf_t('courses'), [
            'year' => 0, 'cat' => $r[0], 'nr' => $r[1], 'title' => $r[2], 'short' => $r[3], 'days' => $r[4], 'ue' => $r[5],
            'locations' => $r[6], 'prereq' => $r[7], 'cost' => $r[8], 'note' => $r[9], 'hidden' => (int) ($r[10] ?? 0), 'sort' => ($i + 1) * 10,
        ]);
        $added++;
    }
    return $added;
}

// Vorgaben je Installation: neutral (Ersteinrichtung in der Verwaltung). Ein Zusatz mit örtlichen Vorgaben (Ordner local/, nicht im
// öffentlichen Paket) hängt sich über die Filter „myf_local_defaults“, „myf_brand_defaults“ … ein und bringt sein eigenes Profil mit.
function myf_profile() { return sanitize_key((string) get_option('myf_profile', 'generic')) ?: 'generic'; }
function myf_local($key) {
    $d = (array) apply_filters('myf_local_defaults', [
        'units' => ['lz1' => 'Löschzug 1'],
        'lat' => null, 'lon' => null, 'ars' => '',
        'defect_objects' => ['Gerätehaus', 'Atemschutz', 'Funk / Meldeempfänger', 'Werkzeug / Geräte', 'IT / Technik', 'Sonstiges'],
        'vehicles' => ['HLF 20', 'LF 20', 'TLF', 'ELW 1', 'MTF', 'Andere'],
        'alarm_via' => ['Leitstelle', 'Polizei', 'Geschädigter', 'Passant'],
        // Fahrzeuge, die beim ersten Update aus der früheren Einsatz-Auswahl in die Fahrzeugliste übernommen werden
        'incident_vehicles' => [],
        // Ortsnummern einer Bedarfsabfrage des Kreises (Import der Lehrgänge): Nummer → Ort
        'course_places' => [],
    ], myf_profile());
    return $d[$key] ?? null;
}
// Einheiten (Löschzüge/Löschgruppen): in der Verwaltung einstellbar
function myf_units() {
    $u = myf_settings()['units'] ?? null;
    return is_array($u) && $u ? $u : myf_local('units');
}
function myf_unit_default() { $u = myf_units(); reset($u); return (string) key($u); }
function myf_unit_ok($u) { return isset(myf_units()[(string) $u]) ? (string) $u : myf_unit_default(); }
// Kurzname ohne „LZ“/„Löschzug“/„LG“ – z. B. für Importe und Ausdrucke
function myf_unit_short($label) { return trim(preg_replace('/^(LZ|LG|Löschzug|Löschgruppe|Einheit)\s+/iu', '', (string) $label)); }
// Einheit aus freiem Text erkennen (Import): Schlüssel oder Kurzname, sonst die erste Einheit
function myf_unit_guess($text) {
    $t = mb_strtolower((string) $text);
    if ($t !== '') foreach (myf_units() as $k => $l) if (strpos($t, mb_strtolower($k)) !== false || ($s = mb_strtolower(myf_unit_short($l))) !== '' && strpos($t, $s) !== false) return $k;
    return myf_unit_default();
}
// Empfänger für Anregungen: Führung je Einheit + Wehrführung
function myf_idea_to() {
    $o = [];
    if (count(myf_units()) > 1) foreach (myf_units() as $k => $l) $o[$k] = preg_match('/^LZ\s/u', $l) ? 'LZ-Führung ' . myf_unit_short($l) : 'Führung ' . $l;
    $o['wehr'] = 'Wehrführung';
    return $o;
}

function myf_settings() {
    $s = get_option('myf_settings', []);
    return wp_parse_args(is_array($s) ? $s : [], [
        'year' => (int) current_time('Y') + 1, 'deadline' => '', 'open' => false, 'published' => false, 'intro' => '',
        'clothing_open' => true, 'clothing_items' => MYF_CLOTHING_ITEMS, 'ideas_open' => true,
        'defects_open' => true, 'defect_objects' => myf_local('defect_objects'),
        'screen_on' => false, 'screen_key' => '', 'screen_ical' => '', 'drill_ical' => '', 'drill_icals' => [], 'screen_note' => '',
        // Farbschema des Dashboards: auto = hell zwischen Sonnenauf- und -untergang am Gerätehaus
        'screen_theme' => 'auto', 'screen_lat' => myf_local('lat'), 'screen_lon' => myf_local('lon'),
        // Warnungen (NINA: DWD, MoWaS, KATWARN …) für den Kreis – Amtlicher Regionalschlüssel, letzte 7 Stellen 0
        'screen_ars' => myf_local('ars'), 'screen_weather' => true, 'screen_warnings' => true,
    ]);
}

function myf_err($msg, $status = 400) { return new WP_Error('myf_error', $msg, ['status' => $status]); }

function myf_date_or_null($v) { return preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $v) ? $v : null; }

function myf_can_manage() {
    if (current_user_can('ffl_manage') || current_user_can('manage_options')) return true;
    // Hauptverwaltung (Recht „area_full“ über Funktionen): sieht und darf alles – ohne WordPress-Admin zu sein.
    // Nie „alle Mitglieder“, immer nur ausgewählte Funktionen.
    static $cache = [], $busy = false;
    $uid = get_current_user_id();
    if (!$uid || $busy || !function_exists('myf_rights')) return false;
    if (isset($cache[$uid])) return $cache[$uid];
    $busy = true;
    global $wpdb;
    $me = myf_me();
    $traits = $me ? (array) (myf_rights()['area_full']['traits'] ?? []) : [];
    $cache[$uid] = $traits && (bool) $wpdb->get_var($wpdb->prepare('SELECT COUNT(*) FROM ' . myf_t('member_traits') . ' WHERE member_id = %d AND trait_id IN (' . implode(',', array_map('intval', $traits)) . ')', $me->id));
    $busy = false;
    return $cache[$uid];
}
// Atemschutzdaten (G26, Übungsstrecken): Administratoren, Konten mit ffl_agt und Mitglieder mit dem Bereich Atemschutz
function myf_can_agt() {
    if (current_user_can('ffl_agt') || current_user_can('manage_options')) return true;
    return function_exists('myf_member_can') && !myf_can_manage() && myf_me() && myf_member_can('area_agt');
}

// Das Mitglied zum angemeldeten WordPress-Konto
function myf_me($fresh = false) {
    global $wpdb;
    static $cache = [];
    $uid = get_current_user_id();
    if (!$uid) return null;
    $k = myf_t('') . $uid;
    if ($fresh || !array_key_exists($k, $cache)) $cache[$k] = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('members') . ' WHERE user_id = %d AND active = 1', $uid));
    return $cache[$k];
}

// Fester, nicht umkehrbarer Schlüssel je Mitglied (für anonyme Anregungen)
function myf_owner_hash($memberId) {
    return hash_hmac('sha256', 'idea|' . (int) $memberId, wp_salt('secure_auth'));
}

function myf_member_page_url() {
    global $wpdb;
    static $url = null;
    if ($url !== null) return $url;
    // Seite mit dem Mitgliederbereich: Shortcode [myfeuerwehr] oder [wehrwerk] – nicht verwechseln mit [wehrwerk_einsatz], [wehrwerk_einsatzberichte] …
    $rows = $wpdb->get_results("SELECT ID, post_content, post_status FROM {$wpdb->posts} WHERE post_status IN ('publish','private') AND post_type = 'page' AND (post_content LIKE '%[myfeuerwehr%' OR post_content LIKE '%[wehrwerk%') ORDER BY post_status = 'publish' DESC, ID");
    foreach ($rows as $r) if (preg_match('/\[(myfeuerwehr|wehrwerk)[\s\]\/]/', $r->post_content)) return $url = get_permalink($r->ID);
    return $url = home_url('/');
}

// ---------------------------------------------------------------------------
// Ausgabeformate
// ---------------------------------------------------------------------------

function myf_course_out($c) {
    return [
        'id' => (int) $c->id, 'year' => (int) $c->year, 'cat' => $c->cat, 'nr' => $c->nr, 'title' => $c->title,
        'short' => $c->short, 'days' => $c->days, 'ue' => $c->ue, 'locations' => $c->locations,
        'prereq' => (string) $c->prereq, 'cost' => $c->cost === null ? null : (float) $c->cost,
        'note' => (string) $c->note, 'hidden' => (bool) $c->hidden, 'sort' => (int) $c->sort,
    ];
}

function myf_date_out($d) {
    $ses = json_decode((string) ($d->sessions ?? ''), true);
    return ['id' => (int) $d->id, 'course_id' => (int) $d->course_id, 'start' => $d->start_date, 'end' => $d->end_date,
        'period' => $d->period, 'location' => $d->location, 'slots' => (int) $d->slots,
        // Ablauf: einzelne Tage mit Uhrzeit; daytime: '' = automatisch, 'tag' = Tagesdienst, 'abend' = abends/Wochenende
        'sessions' => is_array($ses) ? $ses : [], 'daytime' => (string) ($d->daytime ?? '')];
}
// Einzelne Lehrgangstage prüfen und sortieren: [{d: 2026-11-06, f: 18:00, t: 22:00}]
function myf_sessions_clean($in) {
    $out = [];
    foreach ((array) $in as $x) {
        $x = (array) $x; $dd = myf_date_or_null($x['d'] ?? '');
        $f = preg_match('/^\d{1,2}:\d{2}$/', (string) ($x['f'] ?? '')) ? str_pad($x['f'], 5, '0', STR_PAD_LEFT) : '';
        $t = preg_match('/^\d{1,2}:\d{2}$/', (string) ($x['t'] ?? '')) ? str_pad($x['t'], 5, '0', STR_PAD_LEFT) : '';
        if ($dd) $out[$dd . $f] = ['d' => $dd, 'f' => $f, 't' => $t];
        if (count($out) >= 40) break;
    }
    ksort($out);
    return array_values($out);
}

function myf_need_out($n, $admin = false) {
    $o = ['id' => (int) $n->id, 'member_id' => (int) $n->member_id, 'course_id' => (int) $n->course_id,
        'comment' => (string) $n->comment, 'status' => $n->status, 'date_id' => $n->date_id ? (int) $n->date_id : null,
        'created' => $n->created, 'admin_note' => $n->admin_note];
    return $o;
}

function myf_qual_out($q) {
    return ['id' => (int) $q->id, 'member_id' => (int) $q->member_id, 'title' => $q->title, 'short' => $q->short,
        'year' => $q->year ? (int) $q->year : null, 'date' => $q->date, 'note' => $q->note];
}

function myf_agt_log_out($l) {
    return ['id' => (int) $l->id, 'member_id' => (int) $l->member_id, 'date' => $l->date, 'kind' => $l->kind, 'note' => $l->note, 'by' => (string) ($l->by_name ?? ''),
        'file' => !empty($l->file) ? add_query_arg('myf_agtfile', (int) $l->id, home_url('/')) : ''];
}

function myf_clothing_out($c) {
    return ['id' => (int) $c->id, 'member_id' => (int) $c->member_id, 'kind' => $c->kind, 'item' => $c->item, 'size' => $c->size,
        'qty' => (int) $c->qty, 'reason' => $c->reason, 'comment' => (string) $c->comment, 'status' => $c->status,
        'admin_note' => $c->admin_note, 'created' => $c->created];
}

function myf_idea_out($i, $admin = false) {
    $o = ['id' => (int) $i->id, 'anonymous' => $i->member_id === null, 'recipient' => $i->recipient, 'subject' => $i->subject,
        'text' => $i->text, 'status' => $i->status, 'answer' => (string) $i->answer, 'answered' => $i->answered, 'created' => $i->created, 'archived' => !empty($i->archived)];
    if ($admin) $o['member_id'] = $i->member_id === null ? null : (int) $i->member_id;
    return $o;
}

function myf_member_out($m) {
    $u = $m->user_id ? get_userdata((int) $m->user_id) : null;
    return [
        'id' => (int) $m->id, 'name' => $m->name, 'unit' => $m->unit, 'active' => (bool) $m->active,
        'user_id' => $m->user_id ? (int) $m->user_id : null,
        'email' => $u ? $u->user_email : '',
        'last_login' => $u ? (string) get_user_meta($u->ID, 'myf_last_login', true) : '',
        'agt' => myf_can_agt() ? (bool) $m->agt : false,
        'sizes' => (object) (json_decode((string) $m->sizes, true) ?: []),
        'employment' => $m->employment ?: 'ehrenamt',
        'day_available' => (int) $m->day_available,
        'note' => (string) $m->note,
        'g26_until' => myf_can_agt() ? $m->g26_until : null,
        'agt_course' => myf_can_agt() ? isset(myf_agt_course_ids()[(int) $m->id]) : false,
        'can_notice' => !empty($m->can_notice),
        'rank' => (string) ($m->dienstgrad ?? ''), 'rank_since' => $m->rank_since ?? null, 'joined' => $m->joined ?? null,
        'dept' => (string) ($m->dept ?? 'einsatz') ?: 'einsatz', 'dept_since' => $m->dept_since ?? null,
        'birth_date' => $m->birth_date ?? null, 'birth_place' => (string) ($m->birth_place ?? ''), 'street' => (string) ($m->street ?? ''), 'phone' => (string) ($m->phone ?? ''),
        'mstatus' => (string) ($m->mstatus ?? 'aktiv') ?: 'aktiv',
    ];
}

// Lehrgänge und Termine eines Jahres
function myf_year_data($year, $withHidden) {
    global $wpdb;
    $courses = $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . myf_t('courses') . ' WHERE year = %d ORDER BY sort, nr, title', $year));
    if (!$withHidden) $courses = array_values(array_filter($courses, function ($c) { return !$c->hidden; }));
    $ids = array_map(function ($c) { return (int) $c->id; }, $courses);
    $dates = $ids ? $wpdb->get_results('SELECT * FROM ' . myf_t('dates') . ' WHERE course_id IN (' . implode(',', $ids) . ') ORDER BY start_date, id') : [];
    return ['courses' => array_map('myf_course_out', $courses), 'dates' => array_map('myf_date_out', $dates), 'ids' => $ids];
}

// Atemschutz: Lehrgang „Atemschutzgeräteträger“ (AGT) absolviert? – aus Ausbildung (quals) oder absolvierten Lehrgängen
function myf_agt_course_match($title, $short = '') {
    $t = $title . ' ' . $short;
    return (bool) preg_match('/atemschutzger(ä|ae)tetr(ä|ae)ger|atemschutz\b|\bagt\b/iu', $t) && !preg_match('/wart|\bagw\b|strecke|unterweisung/iu', $t);
}
function myf_agt_course_ids($fresh = false) {
    static $ids = null;
    if ($ids !== null && !$fresh) return $ids;
    global $wpdb; $ids = [];
    foreach ($wpdb->get_results('SELECT member_id, title, short FROM ' . myf_t('quals')) as $q) if (myf_agt_course_match($q->title, $q->short)) $ids[(int) $q->member_id] = 1;
    foreach ($wpdb->get_results('SELECT n.member_id, c.title, c.short FROM ' . myf_t('needs') . ' n JOIN ' . myf_t('courses') . " c ON c.id = n.course_id WHERE n.status = 'completed'") as $q)
        if (myf_agt_course_match($q->title, $q->short)) $ids[(int) $q->member_id] = 1;
    return $ids;
}
// Wer den AGT-Lehrgang neu hat, wird einmalig als Geräteträger geführt (einsatzbereit erst mit G26 und Übungsstrecke)
function myf_agt_sync_courses() {
    global $wpdb;
    $done = get_option('myf_agt_auto', []); $done = is_array($done) ? $done : [];
    $new = [];
    foreach (array_keys(myf_agt_course_ids(true)) as $mid) {
        if (in_array($mid, $done, true)) continue;
        $done[] = $mid;
        $m = $wpdb->get_row($wpdb->prepare('SELECT id, name, agt FROM ' . myf_t('members') . ' WHERE id = %d AND active = 1', $mid));
        if (!$m || $m->agt) continue;
        $wpdb->update(myf_t('members'), ['agt' => 1], ['id' => $mid]);
        $new[] = $m->name;
    }
    update_option('myf_agt_auto', $done, false);
    if ($new && function_exists('myf_notify_area')) myf_notify_area('agt', 'agt', (count($new) === 1 ? $new[0] . ' ist' : implode(', ', $new) . ' sind') . ' jetzt als Atemschutzgeräteträger geführt',
        'Lehrgang absolviert. Einsatzbereit erst mit gültiger G26 und Übungsstrecke – bitte eintragen.', 'admin:agt');
    return $new;
}
add_filter('rest_request_after_callbacks', function ($response, $handler, $request) {
    if (!is_wp_error($response) && preg_match('#^/myf/v1/admin/(need|date/complete|qual|import)$#', $request->get_route())) myf_agt_sync_courses();
    return $response;
}, 20, 3);

// Hochgeladene Datei: passt der Inhalt (Signatur) zur Endung? Verhindert z. B. umbenannte Skripte oder HTML als „.pdf“.
function myf_upload_sniff_ok($tmp, $ext) {
    $h = @file_get_contents($tmp, false, null, 0, 16);
    if ($h === false || $h === '') return false;
    $zip = strncmp($h, "PK\x03\x04", 4) === 0; $ole = strncmp($h, "\xD0\xCF\x11\xE0", 4) === 0;
    switch (strtolower($ext)) {
        case 'jpg': case 'jpeg': return strncmp($h, "\xFF\xD8\xFF", 3) === 0;
        case 'png': return strncmp($h, "\x89PNG", 4) === 0;
        case 'webp': return strncmp($h, 'RIFF', 4) === 0 && substr($h, 8, 4) === 'WEBP';
        case 'heic': return substr($h, 4, 4) === 'ftyp' && in_array(substr($h, 8, 4), ['heic', 'heix', 'hevc', 'mif1', 'msf1', 'heif'], true);
        case 'mp4': return substr($h, 4, 4) === 'ftyp';
        case 'pdf': return strncmp($h, '%PDF', 4) === 0;
        case 'docx': case 'xlsx': case 'pptx': case 'odt': case 'odp': case 'zip': return $zip;
        case 'doc': case 'ppt': return $ole;
        case 'mp3': return strncmp($h, 'ID3', 3) === 0 || (ord($h[0]) === 0xFF && (ord($h[1]) & 0xE0) === 0xE0);
        case 'txt': return strpos($h, "\0") === false && stripos($h, '<?php') === false;
    }
    return false;
}

// ---- REST-Schnittstelle /wp-json/ absichern ----------------------------------------------------------------------
// Fehlen in den Permalink-Regeln die Einträge für /wp-json/, antwortet die ganze REST-Schnittstelle mit 404:
// Block-Editor (Veröffentlichen), Cookie-Banner und Wehrwerk fallen aus. Das passiert, wenn ein anderes Plugin die
// Regeln zu früh neu schreibt (vor „init“, wenn WordPress die REST-Regeln noch nicht angemeldet hat).
// Drei Sperren: beim Erzeugen, beim Speichern und beim Auswerten jeder Anfrage – die Regeln können nicht mehr ohne sie bestehen.
function myf_rest_rules() {
    global $wp_rewrite;
    $p = rest_get_url_prefix(); $idx = $wp_rewrite && $wp_rewrite->index ? $wp_rewrite->index : 'index.php';
    return ['^' . $p . '/?$' => 'index.php?rest_route=/', '^' . $p . '/(.*)?' => 'index.php?rest_route=/$matches[1]',
        '^' . $idx . '/' . $p . '/?$' => 'index.php?rest_route=/', '^' . $idx . '/' . $p . '/(.*)?' => 'index.php?rest_route=/$matches[1]'];
}
function myf_rest_rules_missing($rules) {
    if (!is_array($rules) || !$rules) return false; // leer: WordPress baut ohnehin komplett neu auf
    foreach (array_keys(myf_rest_rules()) as $k) if (!isset($rules[$k])) return true;
    return false;
}
function myf_rest_rules_fix($rules) {
    if (!myf_rest_rules_missing($rules)) return $rules;
    return myf_rest_rules() + $rules; // REST-Regeln nach vorn, wie bei WordPress selbst („top“)
}
// 1) Beim Erzeugen der Regeln (flush_rewrite_rules von wem auch immer)
add_filter('rewrite_rules_array', 'myf_rest_rules_fix', 9999);
// 2) Beim Speichern in die Datenbank (auch wenn ein Plugin die Option direkt schreibt)
add_filter('pre_update_option_rewrite_rules', function ($new) {
    if (myf_rest_rules_missing($new)) { $new = myf_rest_rules_fix($new); myf_rest_rules_note(); }
    return $new;
}, 9999);
// 3) Bei jeder Anfrage vor der Auswertung der Adresse (falls die Regeln z. B. per Datenbank-Import ohne sie kamen)
add_action('wp_loaded', function () {
    if (!get_option('permalink_structure')) return;
    if (myf_rest_rules_missing(get_option('rewrite_rules'))) { flush_rewrite_rules(false); myf_rest_rules_note(); }
});
// Reparatur protokollieren – höchstens einmal pro Stunde, damit ein Plugin im Dauerfehler das Protokoll nicht flutet
function myf_rest_rules_note() {
    if (get_transient('myf_rest_rules_note') || !function_exists('myf_audit_write')) return;
    set_transient('myf_rest_rules_note', 1, HOUR_IN_SECONDS);
    $who = '';
    foreach (debug_backtrace(DEBUG_BACKTRACE_IGNORE_ARGS) as $f) {
        if (!empty($f['file']) && preg_match('#/(plugins|themes)/([^/]+)/#', str_replace('\\', '/', $f['file']), $m) && $m[2] !== 'myfeuerwehr') { $who = $m[1] . '/' . $m[2]; break; }
    }
    myf_audit_write('system', 0, 'System', 'repair', 'permalinks', 0, ['grund' => 'REST-Schnittstelle /wp-json/ fehlte in den Permalink-Regeln, ergänzt', 'ausgeloest_von' => $who ?: 'unbekannt']);
}
