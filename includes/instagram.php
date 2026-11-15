<?php
/**
 * Instagram auf der Website: die neuesten Beiträge als Raster ([ww_instagram]).
 * Datenschutz: Der Server holt die Beiträge über die offizielle Instagram-Schnittstelle (Instagram-Login, Profi-Konto) und speichert
 * die Bilder auf der eigenen Website – Besucher laden nichts von Meta, es entstehen keine Cookies. Der Zugangsschlüssel bleibt auf dem
 * Server (nie im Browser, nie im Protokoll) und wird automatisch verlängert. Stories und Highlights bietet die Schnittstelle nicht an –
 * dafür verlinkt der Baustein aufs Profil.
 */

defined('ABSPATH') || exit;

const MYF_IG_API = 'https://graph.instagram.com';

function myf_ig() { $o = get_option('myf_ig', []); return is_array($o) ? $o : []; }
function myf_ig_save($o) { update_option('myf_ig', $o, false); }
// Für die Verwaltung: nur der Zustand, nie der Schlüssel
function myf_ig_status() {
    $o = myf_ig();
    return ['connected' => !empty($o['token']), 'user' => (string) ($o['user'] ?? ''), 'expires' => (string) ($o['expires'] ?? ''), 'fetched' => (string) ($o['fetched'] ?? ''),
        'err' => (string) ($o['err'] ?? ''), 'count' => count((array) ($o['posts'] ?? []))];
}
function myf_ig_get($path, $args) {
    $res = wp_remote_get(add_query_arg($args, MYF_IG_API . $path), ['timeout' => 15]);
    if (is_wp_error($res)) return new WP_Error('myf_ig', 'Instagram ist gerade nicht erreichbar.');
    $j = json_decode(wp_remote_retrieve_body($res), true);
    if (wp_remote_retrieve_response_code($res) !== 200 || !is_array($j)) {
        return new WP_Error('myf_ig', 'Instagram meldet: ' . (is_array($j) && !empty($j['error']['message']) ? mb_substr((string) $j['error']['message'], 0, 160) : 'unbekannter Fehler'));
    }
    return $j;
}
function myf_ig_dir() { $u = wp_upload_dir(); return ['dir' => trailingslashit($u['basedir']) . 'wehrwerk-instagram/', 'url' => trailingslashit($u['baseurl']) . 'wehrwerk-instagram/']; }

// Schlüssel prüfen, verlängern (liefert die echte Laufzeit) und die Beiträge gleich holen
function myf_ig_connect($token) {
    $token = trim((string) $token);
    if (strlen($token) < 20) return myf_err('Bitte den Zugangsschlüssel (Access Token) einfügen.');
    $me = myf_ig_get('/me', ['fields' => 'user_id,username', 'access_token' => $token]);
    if (is_wp_error($me)) return myf_err($me->get_error_message());
    $now = current_time('timestamp');
    $o = ['token' => $token, 'user' => (string) ($me['username'] ?? ''), 'set' => current_time('mysql'), 'refreshed' => current_time('mysql'), 'expires' => date('Y-m-d', $now + 60 * DAY_IN_SECONDS)];
    // Ein frischer Schlüssel lässt sich erst nach 24 Stunden verlängern – dann übernimmt das die nächtliche Prüfung
    $r = myf_ig_get('/refresh_access_token', ['grant_type' => 'ig_refresh_token', 'access_token' => $token]);
    if (!is_wp_error($r) && !empty($r['access_token'])) { $o['token'] = (string) $r['access_token']; $o['expires'] = date('Y-m-d', $now + (int) ($r['expires_in'] ?? 5184000)); }
    myf_ig_save($o);
    myf_ig_fetch(true);
    return ['ok' => true, 'instagram' => myf_ig_status()];
}

// Neueste Beiträge holen; Bilder lokal speichern (nur echte Bilddateien), alte Bilder aufräumen
function myf_ig_fetch($force = false) {
    $o = myf_ig();
    if (empty($o['token'])) return [];
    if (!$force && !empty($o['fetched']) && strtotime($o['fetched']) > current_time('timestamp') - HOUR_IN_SECONDS) return (array) ($o['posts'] ?? []);
    if (get_transient('myf_ig_lock')) return (array) ($o['posts'] ?? []);
    set_transient('myf_ig_lock', 1, 120);
    $j = myf_ig_get('/me/media', ['fields' => 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp', 'limit' => 12, 'access_token' => $o['token']]);
    $o['fetched'] = current_time('mysql');
    if (is_wp_error($j)) { $o['err'] = $j->get_error_message(); myf_ig_save($o); delete_transient('myf_ig_lock'); return (array) ($o['posts'] ?? []); }
    $d = myf_ig_dir();
    wp_mkdir_p($d['dir']);
    if (!file_exists($d['dir'] . 'index.html')) @file_put_contents($d['dir'] . 'index.html', '');
    $posts = []; $keep = ['index.html' => true];
    foreach ((array) ($j['data'] ?? []) as $m) {
        $video = ($m['media_type'] ?? '') === 'VIDEO';
        $src = (string) ($video ? ($m['thumbnail_url'] ?? '') : ($m['media_url'] ?? ''));
        $id = preg_replace('/\D/', '', (string) ($m['id'] ?? ''));
        $link = (string) ($m['permalink'] ?? '');
        if ($src === '' || $id === '' || !preg_match('#^https://(www\.)?instagram\.com/#', $link)) continue;
        $file = $id . '.jpg';
        if (!file_exists($d['dir'] . $file)) {
            $img = wp_remote_get($src, ['timeout' => 20]);
            $body = is_wp_error($img) ? '' : (string) wp_remote_retrieve_body($img);
            $isImg = strncmp($body, "\xFF\xD8\xFF", 3) === 0 || strncmp($body, "\x89PNG", 4) === 0 || substr($body, 8, 4) === 'WEBP';
            if (!$isImg || strlen($body) > 8 * 1048576) continue;
            file_put_contents($d['dir'] . $file, $body);
        }
        $keep[$file] = true;
        $posts[] = ['id' => $id, 'img' => $file, 'link' => $link, 'text' => mb_substr(wp_strip_all_tags((string) ($m['caption'] ?? '')), 0, 600),
            'date' => substr((string) ($m['timestamp'] ?? ''), 0, 10), 'video' => $video];
    }
    foreach ((array) glob($d['dir'] . '*') as $f) if (is_file($f) && !isset($keep[basename($f)])) @unlink($f);
    $o['posts'] = $posts; $o['err'] = '';
    myf_ig_save($o);
    delete_transient('myf_ig_lock');
    return $posts;
}

// Stündlich: neue Beiträge; alle 20 Tage den Schlüssel verlängern (gilt 60 Tage – so läuft er nie ab)
add_action('myf_ig_cron', function () {
    $o = myf_ig();
    if (empty($o['token'])) return;
    if (empty($o['refreshed']) || strtotime($o['refreshed']) < current_time('timestamp') - 20 * DAY_IN_SECONDS) {
        $r = myf_ig_get('/refresh_access_token', ['grant_type' => 'ig_refresh_token', 'access_token' => $o['token']]);
        if (!is_wp_error($r) && !empty($r['access_token'])) {
            $o['token'] = (string) $r['access_token']; $o['refreshed'] = current_time('mysql'); $o['err'] = '';
            $o['expires'] = date('Y-m-d', current_time('timestamp') + (int) ($r['expires_in'] ?? 5184000));
        } else $o['err'] = 'Zugang konnte nicht verlängert werden – bitte unter Einstellungen → Website neu verbinden.';
        myf_ig_save($o);
    }
    myf_ig_fetch(true);
});
add_action('init', function () { if (!empty(myf_ig()['token']) && !wp_next_scheduled('myf_ig_cron')) wp_schedule_event(time() + 300, 'hourly', 'myf_ig_cron'); });

// Verwaltung: verbinden, neu laden, trennen
add_action('rest_api_init', function () {
    register_rest_route('myf/v1', '/admin/site/instagram', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
        if (!myf_can_manage()) return myf_err('Nur für die Verwaltung.', 403);
        $do = (string) $req->get_param('do');
        if ($do === 'off') {
            delete_option('myf_ig'); wp_clear_scheduled_hook('myf_ig_cron');
            $d = myf_ig_dir(); foreach ((array) glob($d['dir'] . '*') as $f) if (is_file($f)) @unlink($f);
            return ['ok' => true, 'instagram' => myf_ig_status()];
        }
        if ($do === 'reload') { myf_ig_fetch(true); return ['ok' => true, 'instagram' => myf_ig_status()]; }
        return myf_ig_connect($req->get_param('token'));
    }]);
});
add_filter('myf_admin_state', function ($d) { if (isset($d['site'])) $d['site']['instagram'] = myf_ig_status(); return $d; }, 20);

// Baustein: Raster der neuesten Beiträge + Link zum Profil (Stories, Highlights)
add_shortcode('ww_instagram', function ($a) {
    $s = function_exists('myf_site') ? myf_site() : [];
    $a = shortcode_atts(['anzahl' => 6, 'titel' => 'Instagram'], $a);
    $o = myf_ig();
    $posts = array_slice((array) ($o['posts'] ?? []), 0, max(1, min(12, (int) $a['anzahl'])));
    $user = (string) ($o['user'] ?? '');
    if ($user === '' && !empty($s['instagram']) && preg_match('#instagram\.com/([A-Za-z0-9._]+)#', $s['instagram'], $m)) $user = $m[1];
    $profile = $user !== '' ? 'https://www.instagram.com/' . rawurlencode($user) . '/' : (string) ($s['instagram'] ?? '');
    if (!$posts && $profile === '') return '';
    $d = myf_ig_dir();
    $h = '<section class="ws-sec"><div class="ws-wrap"><div class="ws-head"><h2 class="ws-h"><span>' . esc_html($a['titel']) . '</span></h2>' .
        ($profile ? '<a class="ws-more" href="' . esc_url($profile) . '" target="_blank" rel="noopener">' . esc_html($user !== '' ? '@' . $user : 'Zum Profil') . ' →</a>' : '') . '</div>';
    if ($posts) {
        $h .= '<div class="ws-ig">' . implode('', array_map(function ($p) use ($d) {
            $t = trim(preg_replace('/\s+/', ' ', (string) $p['text']));
            return '<a class="ws-ig-i" href="' . esc_url($p['link']) . '" target="_blank" rel="noopener"><img src="' . esc_url($d['url'] . $p['img']) . '" alt="' . esc_attr(mb_substr($t, 0, 120)) . '" loading="lazy" decoding="async">' .
                ($p['video'] ? '<i class="ws-ig-v" aria-label="Video">▶</i>' : '') . ($t !== '' ? '<span>' . esc_html(wp_trim_words($t, 16, ' …')) . '</span>' : '') . '</a>';
        }, $posts)) . '</div>';
    }
    if ($profile) $h .= '<div class="ws-ig-cta"><p>Aktuelles, Stories und Highlights aus dem Einsatz- und Vereinsleben – direkt auf Instagram.</p><a class="ws-btn is-red" href="' . esc_url($profile) . '" target="_blank" rel="noopener">Auf Instagram folgen</a></div>';
    return $h . '</div></section>';
});
