<?php
/**
 * Version und Versionshinweise („Was ist neu?“): Daten aus releases.json im Plugin-Ordner (neueste zuerst).
 * Beta (0.x) bis zum produktiven Einsatz – dann 1.0.0. Wer eine neue Version noch nicht gesehen hat, bekommt in der Verwaltung einen Hinweis.
 */

defined('ABSPATH') || exit;

function myf_releases() {
    static $r = null;
    if ($r !== null) return $r;
    $j = json_decode((string) @file_get_contents(dirname(__DIR__) . '/releases.json'), true);
    return $r = is_array($j) ? array_slice($j, 0, 12) : [];
}
function myf_release_state() {
    return ['ver' => MYF_VERSION, 'channel' => MYF_CHANNEL, 'notes' => myf_releases(), 'seen' => (string) get_user_meta(get_current_user_id(), 'myf_seen_ver', true)];
}
add_filter('myf_me_data', function ($data) { $data['release'] = myf_release_state(); return $data; }, 47);
add_filter('myf_admin_state', function ($d) { $d['release'] = myf_release_state(); return $d; }, 47);
add_action('rest_api_init', function () {
    // „Gelesen“: Hinweis auf die neue Version ausblenden (je Konto)
    register_rest_route('myf/v1', '/me/seenver', ['methods' => 'POST', 'permission_callback' => 'is_user_logged_in', 'callback' => function () {
        update_user_meta(get_current_user_id(), 'myf_seen_ver', MYF_VERSION);
        return ['ok' => true];
    }]);
});
