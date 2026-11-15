<?php
/**
 * Vorlagen & Logos: Präsentationen, Briefkopf und weitere Dokumente im Erscheinungsbild der Feuerwehr zum Herunterladen.
 * Die Dateien in assets/cd enthalten Platzhalter ({{ORG}} …). Beim Download setzt der Server Name, Anschrift, Farbe und Logo aus
 * „Einstellungen → Organisation“ ein. So passen sie auch für jede andere Feuerwehr. Die Vorlagen enthalten keine Mitgliederdaten.
 * Bei geändertem Logo erzeugt der Browser der Verwaltung die PNG-Fassung, denn der Server kann SVG nicht in PNG umwandeln.
 */

defined('ABSPATH') || exit;

const MYF_CD_FILES = [
    'praesentation' => ['pptx', 'Präsentation', 'Für alle Anlässe: Titel, Abschnitt, Text, Bild und Abschluss', 'Präsentationen'],
    'unterricht' => ['pptx', 'Unterricht und Dienstabend', 'Lernziele, Lage, Vorgehen, Sicherheit, Merksatz und Wiederholung', 'Präsentationen'],
    'jahresbericht' => ['pptx', 'Jahresversammlung', 'Tagesordnung, Jahreszahlen, Diagramm, Beförderungen und Ehrungen', 'Präsentationen'],
    'briefkopf' => ['docx', 'Briefkopf', 'DIN 5008, passt in den Fensterumschlag', 'Dokumente'],
    'protokoll' => ['docx', 'Protokoll', 'Für Besprechungen, mit Tagesordnung und Beschlüssen', 'Dokumente'],
    'pressemitteilung' => ['docx', 'Pressemitteilung', 'Mit Pressekontakt und Hinweisen zum Datenschutz', 'Dokumente'],
    'aushang' => ['docx', 'Aushang und Einladung', 'A4 für das Schwarze Brett', 'Dokumente'],
    'urkunde' => ['docx', 'Urkunde', 'Für Ehrungen und Jubiläen', 'Dokumente'],
    'logo' => ['zip', 'Logo-Paket', 'PNG und, wenn vorhanden, SVG, für helle und dunkle Hintergründe', 'Logo und Schrift'],
    'schrift' => ['zip', 'Schrift Barlow', 'Zum Installieren, frei nutzbar (Open Font License)', 'Logo und Schrift'],
];

// Eigenes Logo oder andere Texte/Farbe als das mitgelieferte Logo („Freiwillige Feuerwehr“ ohne Ortszeile)?
// Ordner der Vorlagen und Kennung des mitgelieferten Logos sind filterbar (Zusatz mit örtlichen Vorgaben im Ordner local/)
function myf_cd_dir() { return trailingslashit((string) apply_filters('myf_cd_dir', MYF_DIR . 'assets/cd')); }
function myf_cd_logo_hash() {
    $b = myf_brand();
    return md5(implode('|', [mb_strtoupper($b['line1']), mb_strtoupper($b['line2']), mb_strtoupper($b['line3']), strtolower($b['color']), $b['logo_custom']]));
}
function myf_cd_default_logo() { return myf_cd_logo_hash() === (string) apply_filters('myf_cd_default_hash', md5('FREIWILLIGE|FEUERWEHR||#e30613|')); }
function myf_cd_logo_data() {
    if (myf_cd_default_logo()) return null;
    $o = get_option('myf_cd_logo', []);
    return is_array($o) && ($o['hash'] ?? '') === myf_cd_logo_hash() ? $o : null;
}
function myf_cd_needs_logo() { return !myf_cd_default_logo() && !myf_cd_logo_data(); }
function myf_cd_png($v) {
    $o = myf_cd_logo_data();
    return $o ? (string) base64_decode($o[$v]) : (string) file_get_contents(myf_cd_dir() . 'logo-' . ($v === 'dark' ? 'dark' : 'light') . '.png');
}

function myf_cd_tokens() {
    $b = myf_brand();
    $join = function ($a) { return implode(' · ', array_filter(array_map('trim', $a), 'strlen')); };
    $ort = trim($b['zip'] . ' ' . $b['place']);
    $tel = (string) ($b['phone'] ?? ''); $mail = (string) ($b['email'] ?? '');
    return ['ORG' => $b['org'], 'ORT' => $b['place'], 'TELEFON' => $tel, 'EMAIL' => $mail, 'WEB' => $b['website'],
        'ABSENDER_ZEILE' => $join([$b['org'], $b['address'], $ort]),
        'KONTAKT_ZEILE' => $join([$tel, $mail, $b['website']]),
        'FUSSZEILE' => $join([$b['org'], $b['address'], $ort, $tel, $mail, $b['website']])];
}

// Vorlage kopieren und in der Kopie Platzhalter, Farbe und Logo ersetzen. Gibt den Pfad einer Temp-Datei zurück.
function myf_cd_build($key, $ext) {
    $tmp = tempnam(get_temp_dir(), 'myfcd');
    if (!$tmp || !copy(myf_cd_dir() . $key . '.' . $ext, $tmp)) return '';
    $z = new ZipArchive();
    if ($z->open($tmp) !== true) { @unlink($tmp); return ''; }
    $rep = [];
    foreach (myf_cd_tokens() as $k => $v) $rep['{{' . $k . '}}'] = htmlspecialchars((string) $v, ENT_QUOTES | ENT_XML1, 'UTF-8');
    $color = strtoupper(ltrim(myf_brand()['color'], '#'));
    if ($color !== 'E30613') $rep['E30613'] = $color;
    $logo = myf_cd_logo_data();
    $shipped = [md5_file(myf_cd_dir() . 'logo-light.png') => 'light', md5_file(myf_cd_dir() . 'logo-dark.png') => 'dark'];
    $names = [];
    for ($i = 0; $i < $z->numFiles; $i++) $names[] = $z->getNameIndex($i);
    foreach ($names as $n) {
        if (preg_match('/\.(xml|rels)$/', $n)) {
            $x = $z->getFromName($n); $y = strtr($x, $rep);
            if ($y !== $x) $z->addFromString($n, $y);
        } elseif ($logo && preg_match('/\.png$/i', $n)) {
            $md5 = md5((string) $z->getFromName($n));
            if (isset($shipped[$md5])) $z->addFromString($n, myf_cd_png($shipped[$md5]));
        }
    }
    $z->close();
    return $tmp;
}
function myf_cd_build_zip($key) {
    $tmp = tempnam(get_temp_dir(), 'myfcd');
    $z = new ZipArchive();
    if (!$tmp || $z->open($tmp, ZipArchive::OVERWRITE) !== true) return '';
    if ($key === 'schrift') {
        foreach (glob(MYF_DIR . 'assets/cd/fonts/*') as $f) $z->addFile($f, basename($f));
    } else {
        $z->addFromString('logo-fuer-helle-hintergruende.png', myf_cd_png('light'));
        $z->addFromString('logo-fuer-dunkle-hintergruende.png', myf_cd_png('dark'));
        if (!myf_brand()['logo_custom']) {
            $z->addFromString('logo-fuer-helle-hintergruende.svg', myf_logo_svg('light'));
            $z->addFromString('logo-fuer-dunkle-hintergruende.svg', myf_logo_svg('dark'));
        }
    }
    $z->close();
    return $tmp;
}

// Download: nur angemeldet; die Datei entsteht jedes Mal neu aus den aktuellen Angaben
add_action('template_redirect', function () {
    if (!isset($_GET['myf_cd'])) return;
    if (!is_user_logged_in()) { auth_redirect(); exit; }
    if (!(myf_can_manage() || (myf_me() && myf_member_can('cd')))) { status_header(403); exit('Keine Berechtigung.'); }
    $key = sanitize_key((string) $_GET['myf_cd']);
    if (!isset(MYF_CD_FILES[$key])) { status_header(404); exit('Vorlage nicht gefunden.'); }
    if (!class_exists('ZipArchive')) { status_header(500); exit('Auf dem Server fehlt die PHP-Erweiterung ZipArchive.'); }
    if ($key !== 'schrift' && myf_cd_needs_logo()) { status_header(409); exit('Das Logo für die Vorlagen ist noch nicht aktuell. Bitte die Verwaltung, einmal „Einstellungen → Vorlagen & Logos“ zu öffnen.'); }
    $ext = MYF_CD_FILES[$key][0];
    $file = $ext === 'zip' ? myf_cd_build_zip($key) : myf_cd_build($key, $ext);
    if (!$file || !is_readable($file)) { status_header(500); exit('Die Datei konnte nicht erstellt werden.'); }
    $mime = ['pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'zip' => 'application/zip'][$ext];
    nocache_headers();
    header('Content-Type: ' . $mime);
    header('Content-Length: ' . filesize($file));
    header('Content-Disposition: attachment; filename="' . sanitize_file_name(sanitize_title(myf_brand()['org']) . '-' . $key . '.' . $ext) . '"');
    header('X-Content-Type-Options: nosniff');
    while (ob_get_level()) ob_end_clean();
    readfile($file);
    @unlink($file);
    exit;
});

function myf_cd_data() {
    $b = myf_brand();
    $files = [];
    foreach (MYF_CD_FILES as $k => $f) $files[] = ['key' => $k, 'ext' => $f[0], 'title' => $f[1], 'desc' => $f[2], 'group' => $f[3], 'url' => add_query_arg('myf_cd', $k, home_url('/'))];
    return ['files' => $files, 'needs_logo' => myf_cd_needs_logo(), 'can_zip' => class_exists('ZipArchive'), 'color' => $b['color'], 'org' => $b['org'],
        'logo_light' => myf_logo_url('light'), 'logo_dark' => myf_logo_url('dark'), 'missing' => array_values(array_filter(['address' => $b['address'] === '' ? 'Anschrift' : '', 'phone' => ($b['phone'] ?? '') === '' ? 'Telefon' : '', 'email' => ($b['email'] ?? '') === '' ? 'E-Mail' : '']))];
}
add_filter('myf_me_data', function ($data, $me) {
    if ($me && myf_member_can('cd', $me)) $data['cd'] = myf_cd_data();
    return $data;
}, 30, 2);
add_filter('myf_admin_state', function ($d) { $d['cd'] = myf_cd_data(); return $d; }, 56);

add_action('rest_api_init', function () {
    register_rest_route('myf/v1', '/admin/cd/logo', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
        if (function_exists('myf_demo_ctx') && myf_demo_ctx()) return myf_err('Im Demo-Modus nicht möglich.');
        $out = ['hash' => myf_cd_logo_hash()];
        foreach (['light', 'dark'] as $v) {
            $raw = base64_decode(preg_replace('#^data:image/png;base64,#', '', (string) $req->get_param($v)), true);
            $i = $raw && strlen($raw) <= 1500000 ? @getimagesizefromstring($raw) : false;
            if (!$i || $i[2] !== IMAGETYPE_PNG || $i[0] !== 2524 || $i[1] !== 400) return myf_err('Das Logo konnte nicht übernommen werden.');
            $out[$v] = base64_encode($raw);
        }
        update_option('myf_cd_logo', $out, false);
        return ['ok' => true];
    }]);
});
