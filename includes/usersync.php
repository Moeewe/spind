<?php
/**
 * WordPress-Benutzer mit der Rolle „Feuerwehr-Mitglied“ ↔ Wehrwerk-Mitglied.
 * Wer in WordPress (Benutzer → Neu hinzufügen oder Rolle ändern) die Rolle bekommt, wird mit einem Mitglied ohne Konto
 * gleichen Namens verknüpft – sonst als neues Mitglied angelegt. Die Verwaltung bekommt eine Nachricht.
 * Erst am Ende der Anfrage, damit Einladungen aus Wehrwerk (die das Konto selbst zuordnen) kein doppeltes Mitglied erzeugen.
 */

defined('ABSPATH') || exit;

function myf_usersync_queue($uid) { $GLOBALS['myf_usersync'][(int) $uid] = 1; }
add_action('user_register', 'myf_usersync_queue', 20);
add_action('set_user_role', function ($uid, $role) { if ($role === MYF_ROLE) myf_usersync_queue($uid); }, 20, 2);
add_action('add_user_role', function ($uid, $role) { if ($role === MYF_ROLE) myf_usersync_queue($uid); }, 20, 2);
add_action('shutdown', function () {
    foreach (array_keys((array) ($GLOBALS['myf_usersync'] ?? [])) as $uid) myf_usersync_one($uid);
}, 1);

// Name aus dem Benutzerkonto: „Nachname, Vorname“ (sonst Anzeigename, letztes Wort als Nachname)
function myf_usersync_name(WP_User $u) {
    $first = trim((string) $u->first_name); $last = trim((string) $u->last_name);
    if ($last !== '') return $last . ($first !== '' ? ', ' . $first : '');
    $dn = trim((string) $u->display_name); if ($dn === '' || $dn === $u->user_login) return '';
    $p = preg_split('/\s+/u', $dn); if (count($p) < 2) return $dn;
    $l = array_pop($p); return $l . ', ' . implode(' ', $p);
}

function myf_usersync_one($uid) {
    global $wpdb;
    if (function_exists('myf_demo_ctx') && myf_demo_ctx()) return; // Demo-Bestand nie mit echten Konten mischen
    $u = get_userdata((int) $uid);
    if (!$u || !in_array(MYF_ROLE, (array) $u->roles, true) || get_user_meta($u->ID, 'myf_demo_user', true)) return;
    $t = myf_t('members');
    if ($wpdb->get_var($wpdb->prepare("SELECT id FROM $t WHERE user_id = %d", $u->ID))) return; // schon verknüpft
    $name = myf_usersync_name($u);
    if ($name === '') $name = $u->user_login;
    // Vorhandenes Mitglied ohne Konto mit gleichem Namen übernehmen (Groß/Klein egal)
    $hit = $wpdb->get_row($wpdb->prepare("SELECT id, name FROM $t WHERE user_id IS NULL AND LOWER(name) = LOWER(%s) LIMIT 1", $name));
    if ($hit) {
        $wpdb->update($t, ['user_id' => $u->ID, 'active' => 1], ['id' => $hit->id]);
        myf_notify_area('members', 'member', 'Konto verknüpft: ' . $hit->name, 'WordPress-Benutzer „' . $u->user_login . '“ ist jetzt mit dem Mitglied verbunden.', 'admin:member:' . (int) $hit->id);
        return;
    }
    $wpdb->insert($t, ['user_id' => $u->ID, 'name' => mb_substr($name, 0, 120), 'unit' => myf_unit_default(), 'active' => 1, 'dept' => 'einsatz', 'note' => 'aus WordPress angelegt']);
    $newId = (int) $wpdb->insert_id;
    myf_notify_area('members', 'member', 'Neues Mitglied aus WordPress: ' . $name, 'Angelegt über Benutzer „' . $u->user_login . '“ – bitte Einheit, Dienstgrad und Funktionen ergänzen.', 'admin:member:' . $newId);
    if (function_exists('myf_audit_write')) myf_audit_write('system', 0, 'WordPress-Benutzer', 'wp/user', 'members', $newId, ['after' => ['name' => $name, 'user_id' => $u->ID]]);
}

// Bestehende Benutzer mit der Rolle, die noch kein Mitglied haben: vor dem Laden der Verwaltung nachziehen (höchstens alle 10 Minuten)
function myf_usersync_scan() {
    global $wpdb;
    if ((function_exists('myf_demo_ctx') && myf_demo_ctx()) || get_transient('myf_usersync_scan')) return;
    set_transient('myf_usersync_scan', 1, 10 * MINUTE_IN_SECONDS);
    $linked = array_map('intval', $wpdb->get_col('SELECT user_id FROM ' . myf_t('members') . ' WHERE user_id IS NOT NULL'));
    foreach (get_users(['role' => MYF_ROLE, 'fields' => 'ID', 'number' => 500]) as $uid) if (!in_array((int) $uid, $linked, true)) myf_usersync_one((int) $uid);
}
add_filter('rest_pre_dispatch', function ($r, $server, $req) {
    if ($req->get_route() === '/myf/v1/admin/state' && is_user_logged_in()) myf_usersync_scan();
    return $r;
}, 10, 3);
