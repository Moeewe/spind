<?php
/**
 * Wartungsseite: WordPress zeigt während Updates „Briefly unavailable for scheduled maintenance“. Wir legen dafür die
 * offizielle Vorlage wp-content/maintenance.php an – auf Deutsch, mit Logo, Notruf 112 und Anschrift des Gerätehauses.
 * Die Datei liegt außerhalb des Plugins und braucht keine Datenbank (sie greift auch, während das Plugin selbst ersetzt wird).
 * Sie lädt sich von selbst neu, sobald die Seite wieder da ist – so kommen auch Dashboards ohne Eingreifen zurück.
 * Eine fremde maintenance.php wird nie überschrieben; beim Deaktivieren des Plugins wird unsere wieder entfernt.
 */

defined('ABSPATH') || exit;

const MYF_MAINT_MARK = 'myfeuerwehr-maintenance';
function myf_maint_path() { return WP_CONTENT_DIR . '/maintenance.php'; }
function myf_maint_exists() { $p = myf_maint_path(); clearstatcache(true, $p); return (int) @filesize($p) > 0; }
function myf_maint_ours() { $p = myf_maint_path(); clearstatcache(true, $p); return !myf_maint_exists() || strpos((string) @file_get_contents($p, false, null, 0, 300), MYF_MAINT_MARK) !== false; }

// Einstellungen (Verwaltung → Einstellungen → Wartungsseite). Name, Logo, Farbe, Anschrift und Website kommen aus „Name & Organisation“.
function myf_maint_cfg() {
    $m = (array) (myf_settings()['maint'] ?? []);
    return [
        'on' => !array_key_exists('on', $m) || !empty($m['on']),
        'title' => trim((string) ($m['title'] ?? '')) !== '' ? (string) $m['title'] : 'Wir sind gleich wieder da',
        'text' => trim((string) ($m['text'] ?? '')) !== '' ? (string) $m['text'] : 'Die Website wird gerade aktualisiert. Das dauert meist nur ein bis zwei Minuten.',
        'sos' => !array_key_exists('sos', $m) || !empty($m['sos']),
        'note' => (string) ($m['note'] ?? ''),
        'members' => !array_key_exists('members', $m) || !empty($m['members']),
    ];
}
function myf_maint_cfg_save($in) {
    $in = (array) $in;
    return ['on' => !empty($in['on']), 'sos' => !empty($in['sos']), 'members' => !empty($in['members']),
        'title' => mb_substr(sanitize_text_field((string) ($in['title'] ?? '')), 0, 120), 'text' => mb_substr(sanitize_textarea_field((string) ($in['text'] ?? '')), 0, 600),
        'note' => mb_substr(sanitize_textarea_field((string) ($in['note'] ?? '')), 0, 400)];
}

function myf_maint_html($preview = false) {
    $b = myf_brand(); $c = myf_maint_cfg();
    $nl = function ($s) use (&$e) { return nl2br($e($s), false); };
    $e = function ($s) { return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8'); };
    $color = preg_match('/^#[0-9a-f]{3,6}$/i', (string) $b['color']) ? $b['color'] : '#e30613';
    $street = rtrim(trim((string) $b['address']), '. ');
    $city = trim($b['zip'] . ' ' . $b['place']);
    $logo = $b['logo_custom'] ? '<img src="' . $e($b['logo_custom']) . '" alt="' . $e($b['org']) . '">' : myf_logo_svg('light');
    $site = $b['website'] ? '<a href="https://' . $e(preg_replace('#^https?://#', '', $b['website'])) . '">' . $e(preg_replace('#^https?://(www\.)?#', '', $b['website'])) . '</a>' : '';
    return '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        . ($preview ? '' : '<meta http-equiv="refresh" content="60">') . '<meta name="robots" content="noindex"><title>Gleich wieder da – ' . $e($b['org']) . '</title><style>'
        . ':root{--r:' . $color . ';--ink:#1a1a1a;--mu:#5c5c5c;--bg:#f4f4f2;--card:#fff;--line:#e3e3e0}'
        . '*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}'
        . 'main{max-width:560px;margin:0 auto;padding:32px 16px 40px}.card{background:var(--card);border-top:6px solid var(--r);border-radius:10px;padding:28px 24px;box-shadow:0 1px 3px rgba(0,0,0,.08)}'
        . '.logo{max-width:300px;margin:0 0 22px}.logo svg,.logo img{display:block;width:100%;height:auto}'
        . 'h1{font-size:26px;line-height:1.2;margin:0 0 8px}p{margin:0 0 12px}.mu{color:var(--mu)}'
        . '.sos{display:flex;gap:16px;align-items:center;margin:22px 0 6px;padding:16px 18px;border-radius:10px;background:var(--r);color:#fff;text-decoration:none}'
        . '.sos b{font-size:44px;line-height:1;font-weight:800;letter-spacing:.02em}.sos span{font-size:16px;line-height:1.35}'
        . '.small{font-size:15px}.row{display:flex;flex-wrap:wrap;gap:6px 18px;margin-top:18px;padding-top:16px;border-top:1px solid var(--line)}'
        . '.dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--r);margin-right:8px;animation:p 1.4s ease-in-out infinite}'
        . '@keyframes p{50%{opacity:.25}}@media (prefers-reduced-motion:reduce){.dot{animation:none}}a{color:inherit}'
        . '</style></head><body><main><div class="card"><div class="logo">' . $logo . '</div>'
        . '<h1>' . $e($c['title']) . '</h1>'
        . '<p>' . $nl($c['text']) . '</p>'
        . '<p class="mu small"><span class="dot"></span><span id="st">Diese Seite lädt sich von selbst neu, sobald alles fertig ist.</span></p>'
        . ($c['sos'] ? '<a class="sos" href="tel:112"><b>112</b><span><strong>Im Notfall immer 112 wählen.</strong><br>Feuerwehr und Rettungsdienst sind rund um die Uhr erreichbar – auch wenn diese Seite gerade pausiert.</span></a>'
        . '<p class="small mu" style="margin-top:10px">Polizei: <a href="tel:110">110</a></p>' : '')
        . ($c['note'] !== '' ? '<p class="small" style="margin-top:14px">' . $nl($c['note']) . '</p>' : '')
        . '<div class="row small"><div><strong>' . $e($b['org']) . '</strong>' . ($street !== '' ? '<br>Gerätehaus: ' . $e($street) : '') . ($city !== '' ? '<br>' . $e($city) : '') . '</div>'
        . ($site ? '<div class="mu">' . $site . '</div>' : '') . '</div>'
        . ($c['members'] ? '<p class="small mu" style="margin-top:16px">Mitglieder: Mitgliederbereich, Halle und Besprechungsraum verbinden sich danach von selbst wieder. In der Halle Eingetragenes bleibt auf dem Gerät und wird nachgeliefert.</p>' : '')
        . '</div></main>' . ($preview ? '</body></html>' : '<script>(function(){var n=0;function c(){fetch(location.href,{cache:"no-store",credentials:"same-origin"}).then(function(r){if(r.ok)location.reload();else s();}).catch(s);}'
        . 'function s(){n++;var e=document.getElementById("st");if(e&&n>8)e.textContent="Dauert etwas länger als sonst – die Seite versucht es weiter von selbst.";setTimeout(c,15000);}setTimeout(c,15000);})();</script></body></html>');
}

// Inhalt der Vorlage: kleine PHP-Weiche (503, für Schnittstellen JSON), dann die feste Seite – ohne Abhängigkeit vom Plugin
function myf_maint_file() {
    $msg = 'Die Website wird gerade aktualisiert – bitte gleich noch einmal versuchen.';
    return "<?php\n// " . MYF_MAINT_MARK . ": Wartungsseite, automatisch von SPIND angelegt (wird beim Deaktivieren des Plugins entfernt)\n"
        . "\$myf_api = strpos((string) (\$_SERVER['REQUEST_URI'] ?? ''), '/wp-json/') !== false || isset(\$_GET['rest_route']) || (defined('DOING_AJAX') && DOING_AJAX);\n"
        . "if (!headers_sent()) {\n    header((\$_SERVER['SERVER_PROTOCOL'] ?? 'HTTP/1.1') . ' 503 Service Unavailable', true, 503);\n    header('Retry-After: 60');\n    header('Cache-Control: no-store');\n"
        . "    header('Content-Type: ' . (\$myf_api ? 'application/json' : 'text/html') . '; charset=utf-8');\n}\n"
        . "if (\$myf_api) { echo " . var_export(json_encode(['code' => 'maintenance', 'message' => $msg, 'data' => ['status' => 503]], JSON_UNESCAPED_UNICODE), true) . "; return; }\n"
        . "?>\n" . myf_maint_html() . "\n";
}

// Anlegen bzw. aktualisieren, wenn sich Version oder Aussehen geändert haben (läuft in der Verwaltung, nicht bei jedem Seitenaufruf)
function myf_maint_sync($force = false) {
    if (!myf_maint_ours()) return false;
    if (!myf_maint_cfg()['on']) { myf_maint_remove(); return true; }
    $hash = md5(MYF_VERSION . wp_json_encode(myf_brand()) . wp_json_encode(myf_maint_cfg()));
    if (!$force && get_option('myf_maint_hash') === $hash && myf_maint_exists()) return true;
    if (!wp_is_writable(WP_CONTENT_DIR) && !(myf_maint_exists() && wp_is_writable(myf_maint_path()))) return false;
    // Erst unter Zwischennamen schreiben, dann umbenennen: nie eine halb geschriebene Seite ausliefern
    $tmp = myf_maint_path() . '.' . wp_generate_password(8, false) . '.tmp';
    $ok = @file_put_contents($tmp, myf_maint_file()) !== false && @rename($tmp, myf_maint_path());
    if (!$ok) @unlink($tmp);
    if ($ok) update_option('myf_maint_hash', $hash, false);
    return $ok;
}
add_action('admin_init', function () { myf_maint_sync(); });

function myf_maint_remove() {
    clearstatcache(true, myf_maint_path());
    if (myf_maint_exists() && myf_maint_ours()) @unlink(myf_maint_path());
    delete_option('myf_maint_hash');
}

// Vorschau für die Verwaltung: …/?myf_maint_preview=1
add_action('template_redirect', function () {
    if (!isset($_GET['myf_maint_preview']) || !current_user_can('manage_options')) return;
    header('Content-Type: text/html; charset=utf-8');
    echo myf_maint_html(true);
    exit;
});

// Stand für die Verwaltung (Einstellungen): an/aus, ob die Datei liegt, ob eine fremde Vorlage im Weg ist
function myf_maint_state() {
    $p = myf_maint_path(); clearstatcache(true, $p);
    return myf_maint_cfg() + ['file' => myf_maint_exists() && myf_maint_ours(), 'foreign' => !myf_maint_ours(),
        'writable' => wp_is_writable(WP_CONTENT_DIR) || (myf_maint_exists() && wp_is_writable($p)), 'preview' => add_query_arg('myf_maint_preview', 1, home_url('/'))];
}
add_filter('myf_admin_state', function ($d) { if (current_user_can('manage_options')) $d['maint'] = myf_maint_state(); return $d; }, 60);
