<?php
/**
 * Offline & App: Der Mitgliederbereich lässt sich als App auf den Startbildschirm legen (Web-App-Manifest) und zeigt
 * ohne Internet den zuletzt geladenen Stand (Service Worker, nur lesend). Gespeichert wird nur auf dem eigenen Gerät;
 * beim Abmelden wird der Zwischenspeicher gelöscht.
 */

defined('ABSPATH') || exit;

add_action('template_redirect', function () {
    if (isset($_GET['myf_manifest'])) {
        $b = myf_brand(); $page = myf_member_page_url();
        $ic = function ($size, $purpose) { return ['src' => add_query_arg(['myf_icon' => $size, 'png' => 1, 'v' => MYF_VERSION], home_url('/')), 'sizes' => $size . 'x' . $size, 'type' => 'image/png', 'purpose' => $purpose]; };
        // Website-Icon der Seite (WordPress → Customizer → Website-Information), sonst Vereinsfarbe mit Buchstabe
        $icons = has_site_icon() ? [['src' => get_site_icon_url(192), 'sizes' => '192x192', 'purpose' => 'any'], ['src' => get_site_icon_url(512), 'sizes' => '512x512', 'purpose' => 'any']]
            : [$ic(192, 'any'), $ic(512, 'any'), $ic(512, 'maskable'), ['src' => add_query_arg(['myf_icon' => 192, 'v' => MYF_VERSION], home_url('/')), 'sizes' => 'any', 'type' => 'image/svg+xml', 'purpose' => 'any']];
        header('Content-Type: application/manifest+json; charset=utf-8');
        // Installierbar auf Android (PNG 192/512, maskable) und iOS; Kurzbefehle per langem Druck auf das App-Symbol
        echo wp_json_encode(['id' => wp_make_link_relative($page), 'name' => $b['app'] . ' – ' . $b['org'], 'short_name' => $b['app'], 'description' => 'Mitgliederbereich: Einsätze, Dienste, Lehrgänge, Mängel, Fahrtenbuch',
            'start_url' => $page, 'scope' => home_url('/'), 'display' => 'standalone', 'orientation' => 'any', 'background_color' => '#ffffff', 'theme_color' => $b['color'] ?: '#e30620', 'lang' => 'de',
            'icons' => $icons,
            'shortcuts' => [['name' => 'Warst du dabei?', 'url' => add_query_arg('seite', 'dabei', $page)], ['name' => 'Fahrtenbuch', 'url' => add_query_arg('seite', 'fahrtenbuch', $page)],
                ['name' => 'Mangel melden', 'url' => add_query_arg('seite', 'maengel', $page)], ['name' => 'Abfragen', 'url' => add_query_arg('seite', 'abfragen', $page)], ['name' => 'Termine', 'url' => add_query_arg('seite', 'termine', $page)]]], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
    if (isset($_GET['myf_icon'])) {
        $b = myf_brand();
        $l = mb_substr(mb_strtoupper($b['line3'] ?: $b['app']), 0, 1);
        $size = in_array((int) $_GET['myf_icon'], [180, 192, 512], true) ? (int) $_GET['myf_icon'] : 192;
        if (has_site_icon()) { wp_redirect(get_site_icon_url($size), 302); exit; }
        $mask = MYF_DIR . 'assets/icons/' . (['Ä' => 'AE', 'Ö' => 'OE', 'Ü' => 'UE'][$l] ?? (preg_match('/^[A-Z]$/', $l) ? $l : 'W')) . '.png';
        // PNG (iPhone-Homescreen, Android-Installation): Vereinsfarbe + weißer Buchstabe, mit GD; sonst SVG
        if (isset($_GET['png']) && function_exists('imagecreatetruecolor') && function_exists('imagecreatefrompng') && is_readable($mask)) {
            $hex = ltrim($b['color'] ?: '#e30620', '#'); if (strlen($hex) === 3) $hex = $hex[0] . $hex[0] . $hex[1] . $hex[1] . $hex[2] . $hex[2];
            $im = imagecreatetruecolor($size, $size);
            imagefill($im, 0, 0, imagecolorallocate($im, hexdec(substr($hex, 0, 2)), hexdec(substr($hex, 2, 2)), hexdec(substr($hex, 4, 2))));
            $m = imagecreatefrompng($mask); imagealphablending($im, true);
            $t = (int) round($size * .78); $o = (int) round(($size - $t) / 2); // Buchstabe in der sicheren Zone (maskable)
            imagecopyresampled($im, $m, $o, $o, 0, 0, $t, $t, imagesx($m), imagesy($m));
            header('Content-Type: image/png'); header('Cache-Control: public, max-age=604800');
            imagepng($im); imagedestroy($im); imagedestroy($m);
            exit;
        }
        header('Content-Type: image/svg+xml'); header('Cache-Control: public, max-age=604800');
        echo '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" rx="36" fill="' . esc_attr($b['color'] ?: '#e30620') . '"/>'
            . '<text x="96" y="128" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-style="italic" font-size="110" text-anchor="middle" fill="#fff">' . esc_html($l) . '</text></svg>';
        exit;
    }
    if (isset($_GET['myf_sw'])) {
        header('Content-Type: application/javascript; charset=utf-8');
        header('Cache-Control: no-cache');
        header('Service-Worker-Allowed: /');
        $v = MYF_ASSET_VER;
        $api = wp_make_link_relative(rest_url('myf/v1/me'));
        $page = wp_make_link_relative(myf_member_page_url());
        $assets = wp_make_link_relative(MYF_URL);
        echo "/* Offline-Speicher für den Mitgliederbereich: nur lesend, nur dieses Gerät */
const C = 'myf-$v', PAGE = " . wp_json_encode($page) . ", API = " . wp_json_encode($api) . ", ASSETS = " . wp_json_encode($assets) . ";
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('myf-') && k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('message', e => { if (e.data === 'clear') caches.keys().then(ks => ks.forEach(k => k.startsWith('myf-') && caches.delete(k))); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  const isPage = u.pathname === PAGE, isApi = u.pathname === API || u.searchParams.get('rest_route') === '/myf/v1/me', isAsset = u.pathname.startsWith(ASSETS);
  if (!isPage && !isApi && !isAsset) return;
  if (isAsset) { e.respondWith(caches.open(C).then(c => c.match(e.request).then(r => r || fetch(e.request).then(n => { c.put(e.request, n.clone()); return n; })))); return; }
  // Seite und Daten: erst Netz, ohne Netz der letzte Stand
  e.respondWith(fetch(e.request).then(n => { if (n.ok) { const cp = n.clone(); caches.open(C).then(c => c.put(isApi ? API : e.request, cp)); } return n; })
    .catch(() => caches.open(C).then(c => c.match(isApi ? API : e.request)).then(r => r || new Response('Offline – noch kein gespeicherter Stand.', { status: 503 }))));
});";
        exit;
    }
});

add_action('wp_head', function () {
    if (!function_exists('myf_is_portal_page') || !myf_is_portal_page()) return;
    $b = myf_brand();
    $icon = function ($size) { return has_site_icon() ? get_site_icon_url($size) : add_query_arg(['myf_icon' => $size, 'png' => 1, 'v' => MYF_VERSION], home_url('/')); };
    echo '<link rel="manifest" href="' . esc_url(add_query_arg('myf_manifest', 1, home_url('/'))) . '"><meta name="theme-color" content="' . esc_attr($b['color'] ?: '#e30620') . '">'
        . '<link rel="apple-touch-icon" sizes="180x180" href="' . esc_url($icon(180)) . '">'
        . '<link rel="icon" sizes="192x192" href="' . esc_url($icon(192)) . '">'
        . '<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">'
        . '<meta name="apple-mobile-web-app-title" content="' . esc_attr($b['app']) . '"><meta name="apple-mobile-web-app-status-bar-style" content="default">';
});
