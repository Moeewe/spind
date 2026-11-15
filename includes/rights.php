<?php
/**
 * Rechte im Mitgliederbereich: Wer darf was melden? Je Bereich „alle Mitglieder“ oder nur Mitglieder mit bestimmten
 * Funktionen/Merkmalen (z. B. LZ-Führung, Maschinist, Gerätewart). Die Verwaltung darf immer alles.
 */

defined('ABSPATH') || exit;

const MYF_RIGHTS = [
    'defects' => 'Mängel melden',
    'notices' => 'Hinweise für das Dashboard schreiben',
    'clothing' => 'Kleidung anfordern',
    'ideas' => 'Anregungen an die Führung schreiben',
    'courses' => 'Lehrgangswünsche eintragen',
    'participation' => 'Einsatzbeteiligung eintragen („Warst du dabei?“)',
    'booking' => 'Fahrzeug (Bulli) anfragen',
    'trips' => 'Fahrtenbuch eintragen (km-Stand, Tanken)',
    'duty_signup' => 'Sich selbst in Dienste eintragen',
    'orders' => 'Bei Bestellrunden mitbestellen',
    'orders_start' => 'Bestellrunden starten und Karten vorschlagen',
    'orders_approve' => 'Karten-Vorschläge für Bestellrunden freigeben',
    'cd' => 'Vorlagen und Logos herunterladen',
    'booking_approve' => 'Fahrzeug-Anfragen freigeben (auf der eigenen Startseite)',
    // Verwaltungsbereiche („Unter-Admins“): sehen und bearbeiten nur ihren Bereich
    'area_full' => 'Hauptverwaltung – sieht und darf alles (wie Administrator, ohne WordPress-Zugang)',
    'area_members' => 'Bereich Mitglieder & Konten verwalten',
    'area_courses' => 'Bereich Lehrgänge verwalten',
    'incident_manage' => 'Bereich Einsätze, Einsatzberichte & Bescheinigungen',
    'area_agt' => 'Bereich Atemschutz & Atemschutzwerkstatt (Masken, Flaschen, PA, G26)',
    'area_strecke' => 'Bereich Atemschutz-Übungsstrecke planen (Termine, Einteilung)',
    'area_vehicles' => 'Bereich Gerätewerkstatt & Fahrzeuge (Gerätewarte: Geräteprüfungen, Wartung, Bulli)',
    'area_defects' => 'Bereich Mängel bearbeiten',
    'area_clothing' => 'Bereich Kleiderkammer',
    'area_ideas' => 'Bereich Anregungen lesen & beantworten',
    'area_duties' => 'Bereich Dienstpläne',
    'area_board' => 'Bereich Aushänge & Einladungen',
    'area_screen' => 'Bereich Dashboard (Einstellungen)',
    'area_orders' => 'Bereich Bestellkarten (Karten anlegen und vorschlagen)',
    'demo_manage' => 'Demo-Modus für Vorführungen (Demo-Bestand anlegen, ansehen, Alarmszenarien, beenden)',
];
// Verwaltungsbereich → Recht
const MYF_AREAS = ['members' => 'area_members', 'courses' => 'area_courses', 'incidents' => 'incident_manage', 'agt' => 'area_agt', 'strecke' => 'area_strecke', 'vehicles' => 'area_vehicles',
    'defects' => 'area_defects', 'clothing' => 'area_clothing', 'ideas' => 'area_ideas', 'duties' => 'area_duties', 'board' => 'area_board', 'screen' => 'area_screen', 'orders' => 'area_orders'];
// Voreinstellung: alles für alle – nur Dashboard-Hinweise für Führung, Gerätewarte und Maschinisten
const MYF_RIGHTS_DEFAULT_TRAITS = [
    'notices' => ['Wehrführung', 'LZ-Führung', 'Gerätewart', 'Maschinist'],
    'incident_manage' => ['Wehrführung', 'LZ-Führung', 'Gruppenführer'],
    'booking_approve' => ['Wehrführung', 'LZ-Führung'],
    'orders_approve' => ['Wehrführung', 'LZ-Führung'],
    'area_full' => [],
    'area_members' => [],
    'area_courses' => ['Wehrführung', 'LZ-Führung'],
    'area_agt' => ['Atemschutzgerätewart', 'Wehrführung'],
    'area_strecke' => ['Atemschutzgerätewart'],
    'area_vehicles' => ['Gerätewart', 'Wehrführung', 'LZ-Führung'],
    'area_defects' => ['Gerätewart', 'Wehrführung', 'LZ-Führung'],
    'area_clothing' => ['Wehrführung'],
    'area_ideas' => ['Wehrführung', 'LZ-Führung'],
    'area_duties' => ['Wehrführung', 'LZ-Führung'],
    'area_board' => ['Wehrführung', 'LZ-Führung'],
    'area_screen' => ['Wehrführung', 'LZ-Führung'],
    'area_orders' => ['Wehrführung', 'LZ-Führung', 'Gruppenführer'],
    'demo_manage' => ['Wehrführung', 'LZ-Führung'],
];
const MYF_FUNCTION_TRAITS = ['Wehrführung', 'LZ-Führung', 'Gruppenführer', 'Maschinist'];

// Funktionen einmalig ergänzen (gelöschte kommen bei späteren Updates nicht wieder)
function myf_install_rights() {
    global $wpdb;
    if (get_option('myf_traits_functions')) return;
    $max = (int) $wpdb->get_var('SELECT MAX(sort) FROM ' . myf_t('traits'));
    foreach (MYF_FUNCTION_TRAITS as $i => $n) {
        if (!$wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('traits') . ' WHERE name = %s', $n))) {
            $wpdb->insert(myf_t('traits'), ['name' => $n, 'cat' => 'funktion', 'sort' => $i - 10]);
        }
    }
    update_option('myf_traits_functions', 1);
}
// Vorgabe-Teams einmalig mit ihrer Funktion „Team …“ verknüpfen
function myf_install_teams() {
    if (get_option('myf_teams_seeded')) return;
    $s = get_option('myf_settings', []);
    $s = is_array($s) ? $s : [];
    $teams = myf_teams();
    foreach ($teams as &$t) $t['trait_id'] = myf_team_trait($t);
    unset($t);
    $s['teams'] = $teams;
    update_option('myf_settings', $s);
    update_option('myf_teams_seeded', 1);
}

// Teams (z. B. IT, Medienteam): eigene Bereiche mit Aufgaben, Inventar und Nachrichten – frei anlegbar
function myf_teams() {
    $t = myf_settings()['teams'] ?? null;
    if (!is_array($t)) $t = [['key' => 'it', 'name' => 'IT & Technik', 'desc' => 'Netzwerk, Gebäudetechnik, Tablets, Funk-/Alarmtechnik'],
        ['key' => 'medien', 'name' => 'Medienteam', 'desc' => 'Social Media, Fotos, Website, Presse']];
    return array_values(array_filter($t, function ($x) { return !empty($x['key']) && !empty($x['name']); }));
}
function myf_team($area) {
    foreach (myf_teams() as $t) if ('team_' . $t['key'] === $area) return $t;
    return null;
}
function myf_rights_labels() {
    $r = MYF_RIGHTS;
    foreach (myf_teams() as $t) $r['team_' . $t['key']] = 'Team „' . $t['name'] . '“ (Aufgaben, Inventar, Nachrichten)';
    return $r;
}
function myf_areas() {
    $a = MYF_AREAS;
    foreach (myf_teams() as $t) $a['team_' . $t['key']] = 'team_' . $t['key'];
    return $a;
}
function myf_area_labels() {
    $l = ['members' => 'Mitglieder', 'courses' => 'Lehrgänge', 'incidents' => 'Einsätze', 'agt' => 'Atemschutzwerkstatt', 'strecke' => 'Übungsstrecke', 'vehicles' => 'Gerätewerkstatt & Fahrzeuge',
        'defects' => 'Mängel', 'clothing' => 'Kleiderkammer', 'ideas' => 'Anregungen', 'duties' => 'Dienste', 'board' => 'Aushänge', 'screen' => 'Dashboard', 'orders' => 'Bestellkarten'];
    foreach (myf_teams() as $t) $l['team_' . $t['key']] = $t['name'];
    return $l;
}
// Je Team eine Funktion „Team …“ anlegen (darüber werden Mitglieder dem Team zugeordnet)
function myf_team_trait($t) {
    global $wpdb;
    $name = 'Team ' . $t['name'];
    $id = (int) ($t['trait_id'] ?? 0);
    if ($id && $wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('traits') . ' WHERE id = %d', $id))) { $wpdb->update(myf_t('traits'), ['name' => $name], ['id' => $id]); return $id; }
    $id = (int) $wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('traits') . ' WHERE name = %s', $name));
    if (!$id) { $wpdb->insert(myf_t('traits'), ['name' => $name, 'cat' => 'funktion', 'sort' => 5]); $id = (int) $wpdb->insert_id; }
    return $id;
}

function myf_rights() {
    global $wpdb;
    $own = (array) (myf_settings()['rights'] ?? []);
    // Je Anfrage nur einmal berechnen (wird oft aufgerufen); neu, sobald sich Rechte, Teams oder der Bestand (Demo) ändern
    static $cache = [], $traitIds = [];
    $ck = md5(serialize($own) . serialize(myf_teams()) . myf_t(''));
    if (isset($cache[$ck])) return $cache[$ck];
    if (!isset($traitIds[myf_t('')])) { $traitIds[myf_t('')] = []; foreach ($wpdb->get_results('SELECT id, name FROM ' . myf_t('traits')) as $tr) $traitIds[myf_t('')][$tr->name] = (int) $tr->id; }
    $byName = $traitIds[myf_t('')];
    $out = [];
    foreach (myf_rights_labels() as $k => $label) {
        if (strpos($k, 'team_') === 0 && !(isset($own[$k]) && is_array($own[$k]))) {
            $t = myf_team($k);
            $out[$k] = ['all' => false, 'traits' => !empty($t['trait_id']) ? [(int) $t['trait_id']] : []];
            continue;
        }
        if (isset($own[$k]) && is_array($own[$k])) {
            // Hauptverwaltung nie für „alle Mitglieder“
            $out[$k] = ['all' => $k !== 'area_full' && !empty($own[$k]['all']), 'traits' => array_values(array_map('intval', (array) ($own[$k]['traits'] ?? [])))];
        } elseif (isset(MYF_RIGHTS_DEFAULT_TRAITS[$k])) {
            $ids = [];
            foreach (MYF_RIGHTS_DEFAULT_TRAITS[$k] as $n) if (isset($byName[$n])) $ids[] = $byName[$n];
            $out[$k] = ['all' => false, 'traits' => $ids];
        } else {
            $out[$k] = ['all' => true, 'traits' => []];
        }
    }
    return $cache[$ck] = $out;
}

function myf_member_can($feature, $me = null) {
    global $wpdb;
    if (myf_can_manage()) return true;
    $me = $me ?: myf_me();
    if (!$me) return false;
    $r = myf_rights()[$feature] ?? ['all' => true, 'traits' => []];
    if ($r['all']) return true;
    if ($feature === 'notices' && !empty($me->can_notice)) return true; // einzeln freigegeben
    if (!$r['traits']) return false;
    // Funktionen der Person je Anfrage einmal laden
    static $mt = [];
    $k = myf_t('') . (int) $me->id;
    if (!isset($mt[$k])) $mt[$k] = array_map('intval', $wpdb->get_col($wpdb->prepare('SELECT trait_id FROM ' . myf_t('member_traits') . ' WHERE member_id = %d', $me->id)));
    return (bool) array_intersect($mt[$k], array_map('intval', $r['traits']));
}

// Mitglieder mit einem Recht über Funktionen (nicht „alle“) – z. B. wer Fahrzeug-Anfragen freigibt
function myf_right_members($feature) {
    global $wpdb;
    $r = myf_rights()[$feature] ?? null;
    if (!$r || $r['all'] || !$r['traits']) return [];
    return array_map('intval', $wpdb->get_col('SELECT DISTINCT mt.member_id FROM ' . myf_t('member_traits') . ' mt JOIN ' . myf_t('members') . ' m ON m.id = mt.member_id WHERE m.active = 1 AND mt.trait_id IN (' . implode(',', array_map('intval', $r['traits'])) . ')'));
}

// Wer es stattdessen darf – für den Hinweis im Mitgliederbereich
function myf_right_who($feature) {
    global $wpdb;
    $r = myf_rights()[$feature];
    if ($r['all'] || !$r['traits']) return '';
    static $names = [];
    $k = myf_t('');
    if (!isset($names[$k])) { $names[$k] = []; foreach ($wpdb->get_results('SELECT id, name FROM ' . myf_t('traits') . ' ORDER BY sort') as $t) $names[$k][(int) $t->id] = $t->name; }
    return implode(', ', array_values(array_intersect_key($names[$k], array_flip(array_map('intval', $r['traits'])))));
}

// Durchsetzen auf dem Server (unabhängig davon, was die Oberfläche anzeigt)
add_filter('rest_request_before_callbacks', function ($response, $handler, $request) {
    if (is_wp_error($response) || $request->get_method() !== 'POST') return $response;
    $map = ['/myf/v1/me/defect' => 'defects', '/myf/v1/me/notice' => 'notices', '/myf/v1/me/clothing' => 'clothing', '/myf/v1/me/idea' => 'ideas', '/myf/v1/me/need' => 'courses'];
    $f = $map[$request->get_route()] ?? null;
    if (!$f || ($f === 'courses' && !$request->get_param('on'))) return $response; // Zurücktreten geht immer
    if (!is_user_logged_in() || !myf_me() || myf_member_can($f)) return $response;
    $who = myf_right_who($f);
    return new WP_Error('myf_right', myf_rights_labels()[$f] . ' können bei uns nur' . ($who ? ': ' . $who : ' bestimmte Mitglieder') . '.', ['status' => 403]);
}, 5, 3);

add_filter('myf_me_data', function ($data, $me) {
    $data['rights'] = [];
    $data['rights_who'] = [];
    foreach (myf_rights_labels() as $k => $l) { $data['rights'][$k] = myf_member_can($k, $me); $data['rights_who'][$k] = myf_right_who($k); }
    return $data;
}, 20, 2);

add_filter('myf_admin_state', function ($data) {
    $data['rights'] = myf_rights();
    $data['rights_labels'] = myf_rights_labels();
    return $data;
});

// Berechtigung für REST-Routen: Verwaltung immer, sonst Mitglied mit diesem Recht
function myf_perm($feature) {
    return function () use ($feature) {
        if (!is_user_logged_in()) return new WP_Error('myf_auth', 'Bitte neu anmelden.', ['status' => 401]);
        if (myf_can_manage()) return true;
        return myf_me() && myf_member_can($feature) ? true : new WP_Error('myf_right', 'Dafür fehlt dir die Berechtigung.', ['status' => 403]);
    };
}

// Name für Protokoll/Anzeige: Mitgliedsname, sonst WordPress-Name
function myf_actor() {
    $me = myf_me();
    return $me ? $me->name : (wp_get_current_user()->display_name ?: 'Verwaltung');
}

// „Wer sieht was?“ – für die Hauptverwaltung: je Person die Verwaltungsbereiche, die sie über ihre Funktionen bekommt
add_filter('myf_admin_state', function ($d) {
    global $wpdb;
    if (!myf_can_manage()) return $d;
    $rights = myf_rights();
    $labels = myf_rights_labels();
    $traitsOf = [];
    foreach ($wpdb->get_results('SELECT member_id, trait_id FROM ' . myf_t('member_traits')) as $r) $traitsOf[(int) $r->member_id][] = (int) $r->trait_id;
    $areaRights = array_flip(myf_areas()); // Recht → Bereich
    $rows = [];
    foreach ($wpdb->get_results('SELECT id, name, user_id FROM ' . myf_t('members') . ' WHERE active = 1 ORDER BY name') as $m) {
        $mine = $traitsOf[(int) $m->id] ?? [];
        $full = !empty($rights['area_full']['traits']) && array_intersect($mine, $rights['area_full']['traits']);
        $areas = [];
        foreach ($rights as $k => $r) {
            if (!isset($areaRights[$k]) && $k !== 'booking_approve') continue;
            if ($full || $r['all'] || array_intersect($mine, $r['traits'])) $areas[] = $k;
        }
        if (!$full && !$areas) continue;
        $u = $m->user_id ? get_userdata((int) $m->user_id) : null;
        $rows[] = ['name' => $m->name, 'account' => (bool) $u, 'full' => (bool) $full, 'wp_admin' => $u ? user_can($u, 'manage_options') : false,
            'areas' => array_map(function ($k) use ($labels) { return preg_replace('/^Bereich /', '', preg_replace('/\s*\(.*$/', '', $labels[$k] ?? $k)); }, $areas)];
    }
    // WordPress-Konten mit Vollzugriff ohne Mitgliedsprofil
    foreach (get_users(['fields' => ['ID', 'display_name', 'user_login']]) as $u) {
        if (!user_can($u->ID, 'manage_options') && !user_can($u->ID, 'ffl_manage')) continue;
        if ($wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('members') . ' WHERE user_id = %d', $u->ID))) continue;
        $rows[] = ['name' => $u->display_name ?: $u->user_login, 'account' => true, 'full' => true, 'wp_admin' => user_can($u->ID, 'manage_options'), 'areas' => [], 'wp_only' => true];
    }
    $d['access_map'] = $rows;
    return $d;
}, 50);
