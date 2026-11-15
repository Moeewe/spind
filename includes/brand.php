<?php
/**
 * Name & Erscheinungsbild (nur Administratoren): App-Name, Organisation, Logo-Zeilen. Das Logo wird aus dem Text
 * erzeugt (Schrift eingebettet) – oder ein eigenes Logo hochladen.
 */

defined('ABSPATH') || exit;

require_once __DIR__ . '/logo-metrics.php';

function myf_brand() {
    $b = (array) (myf_settings()['brand'] ?? []);
    if (($b['color'] ?? '') === '#e30620') $b['color'] = '#e30613'; // früheres Standard-Rot → Rot der NRW-Kampagne
    // Neutrale Vorgaben; ein Zusatz mit örtlichen Vorgaben (Ordner local/) kann sie über den Filter ersetzen
    return wp_parse_args($b, (array) apply_filters('myf_brand_defaults', [
        'app' => 'Wehrwerk', 'org' => 'Freiwillige Feuerwehr', 'place' => '', 'zip' => '', 'address' => '', 'phone' => '', 'email' => '',
        'line1' => 'FREIWILLIGE', 'line2' => 'FEUERWEHR', 'line3' => '', 'color' => '#e30613', 'logo_custom' => '',
        // Beschriftung neben QR-Codes (Dashboard, Aushänge) – für alle verständlich, unabhängig vom App-Namen
        'qr_label' => 'Meine Feuerwehr', 'website' => '', 'setup' => 0,
    ], myf_profile()));
}
function myf_brand_hash() { return substr(md5(wp_json_encode(myf_brand()) . MYF_VERSION), 0, 10); }
function myf_logo_url($variant = 'light') {
    $b = myf_brand();
    if ($b['logo_custom']) return $b['logo_custom'];
    return add_query_arg(['myf_logo' => $variant === 'dark' ? 'dark' : 'light', 'v' => myf_brand_hash()], home_url('/'));
}

function myf_logo_width($text, $size) {
    $w = 0;
    foreach (preg_split('//u', $text, -1, PREG_SPLIT_NO_EMPTY) as $ch) $w += MYF_LOGO_FONT['w'][mb_ord($ch)] ?? 500;
    return $w * $size / MYF_LOGO_FONT['upm'];
}

// Logo wie gestaltet: Zeile 1 klein, Zeile 2 groß, Zeile 3 groß im schrägen roten Feld rechts
function myf_logo_svg($variant) {
    $b = myf_brand();
    $fg = $variant === 'dark' ? '#ffffff' : '#111111';
    $F = MYF_LOGO_FONT; $cap = $F['cap'] / $F['upm']; $sl = $F['slant'];
    $l1 = mb_strtoupper($b['line1']); $l2 = mb_strtoupper($b['line2']); $l3 = mb_strtoupper($b['line3']);
    $S1 = 64; $S2 = 150; $gap = 14;
    $base1 = $S1 * $cap; $base2 = $base1 + $gap + $S2 * $cap;
    $x1 = ($base2 - $base1) * $sl + 3;
    $left = max($x1 + myf_logo_width($l1, $S1), myf_logo_width($l2, $S2));
    $pad = 16;
    // Ohne Zeile 1 (z. B. nur „Feuerwehr“ + Ort): beide Wörter gleich groß direkt nebeneinander, Ort im roten Feld
    if ($l1 === '') { $base2 = $S2 * $cap; $pad = round(0.22 * $S2 * $cap); }
    $ytop = -$pad; $ybot = $base2 + $pad; $h = $ybot - $ytop;
    $out = '';
    if ($l3 !== '') {
        $S3 = $l1 === '' ? $S2 : 0.60 * $h / $cap; $base3 = $ytop + ($h + $S3 * $cap) / 2;
        $xL = $left + 26; $w3 = myf_logo_width($l3, $S3); $padX = 30; $xR = $xL + $padX * 2 + $w3 + 6; $o = $h * $sl;
        $tx = $xL + ($ybot - $base3) * $sl + $padX;
        $out .= sprintf('<path fill="%s" d="M%.1f %.1fH%.1fL%.1f %.1fH%.1fZ"/>', esc_attr($b['color']), $xL + $o, $ytop, $xR + $o, $xR, $ybot, $xL);
        $out .= sprintf('<text x="%.1f" y="%.1f" font-size="%.1f" fill="#ffffff">%s</text>', $tx, $base3, $S3, esc_html($l3));
        $maxx = $xR + $h * $sl + 4;
    } else $maxx = $left + 8;
    $txt = ($l1 !== '' ? sprintf('<text x="%.1f" y="%.1f" font-size="%d" fill="%s">%s</text>', $x1, $base1, $S1, $fg, esc_html($l1)) : '')
        . sprintf('<text x="0" y="%.1f" font-size="%d" fill="%s">%s</text>', $base2, $S2, $fg, esc_html($l2));
    $font = base64_encode((string) file_get_contents(MYF_DIR . 'assets/fonts/BarlowCondensed-BlackItalic.woff2'));
    $vb = sprintf('-6 %.0f %.0f %.0f', $ytop - 2, $maxx + 6, $h + 4);
    $dim = sprintf('width="%.0f" height="%.0f" ', $maxx + 6, $h + 4); // feste Größe, damit jeder Browser das Logo für die Vorlagen umwandeln kann
    return '<svg xmlns="http://www.w3.org/2000/svg" ' . $dim . 'viewBox="' . $vb . '" role="img" aria-label="' . esc_attr($b['org']) . '"><title>' . esc_html($b['org']) . '</title>'
        . '<style>@font-face{font-family:L;src:url(data:font/woff2;base64,' . $font . ') format("woff2");font-weight:900;font-style:italic}text{font-family:L,"Arial Narrow",sans-serif;font-weight:900;font-style:italic}</style>'
        . $txt . $out . '</svg>';
}

add_action('template_redirect', function () {
    if (!isset($_GET['myf_logo'])) return;
    header('Content-Type: image/svg+xml; charset=utf-8');
    header('Cache-Control: public, max-age=31536000, immutable');
    header('X-Content-Type-Options: nosniff');
    echo myf_logo_svg($_GET['myf_logo'] === 'dark' ? 'dark' : 'light');
    exit;
});

// Speichern (nur Administratoren, siehe Bereichsprüfung 'full')
function myf_brand_save($in) {
    $b = myf_brand();
    foreach (['app' => 40, 'org' => 120, 'place' => 60, 'zip' => 10, 'address' => 160, 'phone' => 40, 'email' => 120, 'line1' => 30, 'line2' => 30, 'line3' => 30, 'qr_label' => 40, 'website' => 80] as $k => $len) {
        if (array_key_exists($k, $in)) $b[$k] = mb_substr(sanitize_text_field((string) $in[$k]), 0, $len);
    }
    if (isset($in['color']) && preg_match('/^#[0-9a-f]{6}$/i', $in['color'])) $b['color'] = $in['color'];
    if (array_key_exists('logo_custom', $in) && $in['logo_custom'] === '') $b['logo_custom'] = '';
    if (!empty($in['logo_upload'])) { $u = myf_save_photo($in['logo_upload'], 'logo-'); if ($u) $b['logo_custom'] = $u; }
    if ($b['app'] === '') $b['app'] = 'Wehrwerk';
    if ($b['qr_label'] === '') $b['qr_label'] = 'Meine Feuerwehr';
    $b['website'] = preg_replace('#^https?://|/$#', '', $b['website']);
    if (!empty($in['setup'])) $b['setup'] = 1;
    return $b;
}
