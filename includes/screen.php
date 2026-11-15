<?php
/**
 * Dashboard für den Fernseher im Besprechungsraum: eigene Vollbildseite unter einem geheimen Link
 * (https://…/?myf_screen=SCHLÜSSEL). Zeigt keine persönlichen Daten.
 */

defined('ABSPATH') || exit;

function myf_screen_key_ok($key) {
    $s = myf_settings();
    return $s['screen_on'] && $s['screen_key'] !== '' && is_string($key) && hash_equals($s['screen_key'], $key);
}

// Vollbildseite ohne Theme
add_action('template_redirect', function () {
    if (!isset($_GET['myf_screen'])) return;
    $key = sanitize_text_field(wp_unslash($_GET['myf_screen']));
    nocache_headers();
    header('X-Robots-Tag: noindex, nofollow');
    if (!myf_screen_key_ok($key)) { status_header(403); echo 'Dashboard nicht freigegeben.'; exit; }
    $st = myf_settings();
    $cfg = wp_json_encode(['api' => esc_url_raw(rest_url('myf/v1/screen')), 'key' => $key, 'theme' => $st['screen_theme'],
        'lat' => $st['screen_lat'] === null ? 51.16 : (float) $st['screen_lat'], 'lon' => $st['screen_lon'] === null ? 10.45 : (float) $st['screen_lon'],
        'qrLabel' => myf_brand()['qr_label'], 'ver' => MYF_ASSET_VER, 'inHall' => ($_GET['in'] ?? '') === 'hall',
        'logoDark' => myf_logo_url('dark'), 'logoLight' => myf_logo_url('light'), 'app' => myf_brand()['app'], 'org' => myf_brand()['org']]);
    $v = MYF_ASSET_VER;
    echo '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' .
        '<meta name="robots" content="noindex,nofollow"><title>' . esc_html(myf_brand()['org']) . ' – Dashboard</title>' .
        '<link rel="stylesheet" href="' . esc_url(MYF_URL . 'assets/screen.css?v=' . $v) . '"></head><body>' .
        '<div id="scr"><div class="scr-loading">' . esc_html(myf_brand()['org']) . '</div></div>' .
        '<script>window.MYFS=' . $cfg . ';</script>' .
        '<script src="' . esc_url(MYF_URL . 'assets/vendor/qrcode.min.js?v=' . $v) . '"></script><script src="' . esc_url(MYF_URL . 'assets/minimap.js?v=' . $v) . '"></script>' .
        '<script src="' . esc_url(MYF_URL . 'assets/screen.js?v=' . $v) . '"></script></body></html>';
    exit;
});

// Impressum und Datenschutz der Website für die Fußzeile der Dashboards: Datenschutzseite aus den WordPress-Einstellungen,
// Impressum über den Seitenpfad („impressum“, „imprint“) oder den Titel
function myf_legal_links() {
    global $wpdb;
    $out = [];
    $imp = get_page_by_path('impressum') ?: get_page_by_path('imprint');
    if (!$imp) { $id = (int) $wpdb->get_var("SELECT ID FROM {$wpdb->posts} WHERE post_type = 'page' AND post_status = 'publish' AND post_title LIKE 'Impressum%' ORDER BY ID LIMIT 1"); $imp = $id ? get_post($id) : null; }
    if ($imp && $imp->post_status === 'publish') $out[] = ['label' => 'Impressum', 'url' => get_permalink($imp)];
    $p = get_privacy_policy_url();
    if (!$p) { // keine Datenschutzseite in den WordPress-Einstellungen hinterlegt: über Pfad oder Titel suchen
        $ds = get_page_by_path('datenschutz') ?: get_page_by_path('datenschutzerklaerung');
        if (!$ds) { $id = (int) $wpdb->get_var("SELECT ID FROM {$wpdb->posts} WHERE post_type = 'page' AND post_status = 'publish' AND post_title LIKE 'Datenschutz%' ORDER BY ID LIMIT 1"); $ds = $id ? get_post($id) : null; }
        if ($ds && $ds->post_status === 'publish') $p = get_permalink($ds);
    }
    if ($p) $out[] = ['label' => 'Datenschutz', 'url' => $p];
    return $out;
}

// Text ohne HTML, Entities (&nbsp; &amp; …) und überflüssige Leerzeichen
function myf_plain($html) {
    $t = html_entity_decode(wp_strip_all_tags((string) $html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    return trim(preg_replace('/\s+/u', ' ', str_replace("\xC2\xA0", ' ', $t)));
}

add_action('rest_api_init', function () {
    register_rest_route('myf/v1', '/screen', ['methods' => 'GET', 'permission_callback' => '__return_true', 'callback' => 'myf_api_screen']);
});

// Kalender (iCal) lesen: ganztägige Termine, UTC-Zeiten (…Z) und Zeiten mit TZID
function myf_ical_events() {
    $s = myf_settings();
    if (!$s['screen_ical']) return [];
    if (myf_demo_ctx()) return []; // Demo: kein echter Kalender
    $cached = get_transient('myf_ical_cache');
    if (is_array($cached)) return $cached;
    $url = preg_replace('#^webcal://#', 'https://', $s['screen_ical']);
    $res = wp_remote_get($url, ['timeout' => 10]);
    if (is_wp_error($res) || wp_remote_retrieve_response_code($res) !== 200) { set_transient('myf_ical_cache', [], 5 * MINUTE_IN_SECONDS); return []; }
    $events = myf_ical_parse(wp_remote_retrieve_body($res));
    set_transient('myf_ical_cache', $events, 15 * MINUTE_IN_SECONDS);
    return $events;
}

// iCal-Text in Termine zerlegen (auch für den Kalender-Import).
// Serientermine (RRULE, z. B. „jeden 2. Montag“ für Dienstabende) werden in einzelne Termine aufgelöst – ein Jahr zurück bis ein Jahr voraus;
// gelöschte Einzeltermine (EXDATE) fallen weg, einzeln geänderte (RECURRENCE-ID) ersetzen den Serientermin.
function myf_ical_parse($text) {
    $raw = str_replace(["\r\n ", "\r\n\t", "\n ", "\n\t"], '', (string) $text); // gefaltete Zeilen zusammenfügen
    $tz = wp_timezone();
    $dt = function ($params, $val) use ($tz) {
        $val = trim($val);
        if (strpos($params, 'VALUE=DATE') !== false || preg_match('/^\d{8}$/', $val)) {
            $d = DateTimeImmutable::createFromFormat('!Ymd', substr($val, 0, 8), $tz);
            return $d ? [$d, true] : [null, true];
        }
        try { $zone = substr($val, -1) === 'Z' ? new DateTimeZone('UTC') : (preg_match('/TZID=([^;:]+)/', $params, $t) ? new DateTimeZone(trim($t[1], '"')) : $tz); } catch (Exception $ex) { $zone = $tz; }
        $d = DateTimeImmutable::createFromFormat('Ymd\THis', rtrim($val, 'Z'), $zone);
        return [$d ? $d->setTimezone($tz) : null, false];
    };
    $list = [];
    foreach (preg_split('/BEGIN:VEVENT/', $raw) as $i => $block) {
        if ($i === 0) continue;
        $block = substr($block, 0, (int) strpos($block . 'END:VEVENT', 'END:VEVENT'));
        $e = ['title' => '', 'location' => '', 'start' => null, 'end' => null, 'allday' => false, 'uid' => '', 'desc' => '', 'rrule' => '', 'exdate' => [], 'recid' => '', 'cancel' => false];
        foreach (preg_split('/\r?\n/', $block) as $line) {
            if (!preg_match('/^([A-Z-]+)((?:;[^:]*)?):(.*)$/', $line, $m)) continue;
            [$all, $name, $params, $val] = $m;
            $val = str_replace(['\\,', '\;', '\\n', '\\N', '\\\\'], [',', ';', ' ', ' ', '\\'], $val);
            if ($name === 'SUMMARY') $e['title'] = $val;
            elseif ($name === 'LOCATION') $e['location'] = $val;
            elseif ($name === 'UID') $e['uid'] = $val;
            elseif ($name === 'DESCRIPTION') $e['desc'] = str_replace(['\\n', '\\N', '\\,', '\;'], ["\n", "\n", ',', ';'], $m[3]);
            elseif ($name === 'RRULE') $e['rrule'] = strtoupper(trim($m[3]));
            elseif ($name === 'STATUS') $e['cancel'] = strtoupper(trim($val)) === 'CANCELLED';
            elseif ($name === 'EXDATE') { foreach (explode(',', $m[3]) as $x) { [$xd] = $dt($params, $x); if ($xd) $e['exdate'][$xd->format('Ymd')] = true; } }
            elseif ($name === 'RECURRENCE-ID') { [$rd] = $dt($params, $m[3]); if ($rd) $e['recid'] = $rd->format('Ymd'); }
            elseif ($name === 'DTSTART' || $name === 'DTEND') {
                [$d, $allday] = $dt($params, $val);
                $e[$name === 'DTSTART' ? 'start' : 'end'] = $d;
                if ($allday) $e['allday'] = true;
            }
        }
        if ($e['start']) $list[] = $e;
    }
    // Einzeln geänderte Termine einer Serie merken: sie ersetzen den Serientermin an diesem Tag
    $moved = [];
    foreach ($list as $e) if ($e['recid'] !== '' && $e['uid'] !== '') $moved[$e['uid']][$e['recid']] = true;
    $from = (new DateTimeImmutable('now', $tz))->modify('-400 days'); $to = (new DateTimeImmutable('now', $tz))->modify('+400 days');
    $events = [];
    foreach ($list as $e) {
        if ($e['cancel']) continue;
        $end = $e['end'] ?: $e['start'];
        if ($e['allday'] && $e['end']) $end = $end->modify('-1 day'); // DTEND ist bei ganztägig exklusiv
        $len = $end->getTimestamp() - $e['start']->getTimestamp();
        $starts = $e['rrule'] !== '' && $e['recid'] === '' ? myf_ical_rrule($e['start'], $e['rrule'], $from, $to) : [$e['start']];
        foreach ($starts as $st) {
            $day = $st->format('Ymd');
            if ($e['rrule'] !== '' && $e['recid'] === '' && (isset($e['exdate'][$day]) || isset($moved[$e['uid']][$day]))) continue;
            $en = $st->modify(($len >= 0 ? '+' : '') . $len . ' seconds');
            // Serientermine bekommen je Tag eine eigene Kennung (sonst würden sie beim Zusammenführen als ein Termin gelten)
            $uid = $e['uid'] !== '' && ($e['rrule'] !== '' || $e['recid'] !== '') ? $e['uid'] . '#' . ($e['recid'] !== '' ? $e['recid'] : $day) : $e['uid'];
            $events[] = ['title' => $e['title'], 'location' => $e['location'], 'allday' => $e['allday'], 'uid' => $uid, 'desc' => trim($e['desc']),
                'start' => $st->format('c'), 'end' => $en->format('c'),
                'ts' => $e['allday'] ? $en->setTime(23, 59, 59)->getTimestamp() : $en->getTimestamp()]; // echter Zeitstempel (UTC)
        }
    }
    usort($events, function ($a, $b) { return strcmp($a['start'], $b['start']); });
    return $events;
}
// Serienregel auflösen: FREQ=DAILY/WEEKLY/MONTHLY/YEARLY mit INTERVAL, COUNT, UNTIL, BYDAY (auch „2MO“, „-1FR“), BYMONTHDAY, BYSETPOS, BYMONTH
function myf_ical_rrule(DateTimeImmutable $start, $rule, DateTimeImmutable $from, DateTimeImmutable $to) {
    $r = [];
    foreach (explode(';', $rule) as $part) { $kv = explode('=', $part, 2); if (count($kv) === 2) $r[$kv[0]] = $kv[1]; }
    $freq = $r['FREQ'] ?? ''; $iv = max(1, (int) ($r['INTERVAL'] ?? 1)); $count = isset($r['COUNT']) ? (int) $r['COUNT'] : 0;
    $until = null;
    if (!empty($r['UNTIL'])) {
        $u = $r['UNTIL'];
        $until = preg_match('/^\d{8}$/', $u) ? DateTimeImmutable::createFromFormat('!Ymd', $u, $start->getTimezone())->setTime(23, 59, 59)
            : DateTimeImmutable::createFromFormat('Ymd\THis', rtrim($u, 'Z'), substr($u, -1) === 'Z' ? new DateTimeZone('UTC') : $start->getTimezone());
        if (!$until) $until = null;
    }
    $wd = ['MO' => 1, 'TU' => 2, 'WE' => 3, 'TH' => 4, 'FR' => 5, 'SA' => 6, 'SU' => 7];
    $byday = [];
    foreach (array_filter(explode(',', $r['BYDAY'] ?? '')) as $b) if (preg_match('/^([+-]?\d{0,2})(MO|TU|WE|TH|FR|SA|SU)$/', $b, $m)) $byday[] = [(int) $m[1], $wd[$m[2]]];
    $bymd = array_map('intval', array_filter(explode(',', $r['BYMONTHDAY'] ?? ''), 'strlen'));
    $bymonth = array_map('intval', array_filter(explode(',', $r['BYMONTH'] ?? ''), 'strlen'));
    $setpos = isset($r['BYSETPOS']) ? (int) $r['BYSETPOS'] : 0;
    $H = (int) $start->format('G'); $I = (int) $start->format('i'); $S = (int) $start->format('s');
    $at = function ($y, $mo, $d) use ($start, $H, $I, $S) { return $start->setDate($y, $mo, $d)->setTime($H, $I, $S); };
    // Tage eines Monats nach BYDAY/BYMONTHDAY/BYSETPOS
    $monthDays = function ($y, $mo) use ($byday, $bymd, $setpos, $start, $at) {
        $dim = (int) $at($y, $mo, 1)->format('t'); $out = [];
        if ($bymd) { foreach ($bymd as $d) { $dd = $d < 0 ? $dim + 1 + $d : $d; if ($dd >= 1 && $dd <= $dim) $out[] = $dd; } }
        elseif ($byday) {
            foreach ($byday as [$n, $w]) {
                $all = []; for ($d = 1; $d <= $dim; $d++) if ((int) $at($y, $mo, $d)->format('N') === $w) $all[] = $d;
                if ($n > 0) { if (isset($all[$n - 1])) $out[] = $all[$n - 1]; } elseif ($n < 0) { if (isset($all[count($all) + $n])) $out[] = $all[count($all) + $n]; } else $out = array_merge($out, $all);
            }
        } else { $d = (int) $start->format('j'); if ($d <= $dim) $out[] = $d; }
        sort($out); $out = array_values(array_unique($out));
        if ($setpos) { $pick = $setpos > 0 ? ($out[$setpos - 1] ?? null) : ($out[count($out) + $setpos] ?? null); $out = $pick === null ? [] : [$pick]; }
        return $out;
    };
    $res = []; $n = 0; $guard = 0;
    $y = (int) $start->format('Y'); $mo = (int) $start->format('n');
    $weekStart = $start->modify('-' . ((int) $start->format('N') - 1) . ' days');
    for ($k = 0; $guard < 3000 && $k < 5000; $k++) {
        $cands = [];
        if ($freq === 'DAILY') $cands[] = $start->modify('+' . ($k * $iv) . ' days');
        elseif ($freq === 'WEEKLY') {
            $ws = $weekStart->modify('+' . ($k * $iv * 7) . ' days');
            $days = $byday ? array_map(function ($b) { return $b[1]; }, $byday) : [(int) $start->format('N')];
            sort($days);
            foreach (array_unique($days) as $w) { $c = $ws->modify('+' . ($w - 1) . ' days'); $cands[] = $at((int) $c->format('Y'), (int) $c->format('n'), (int) $c->format('j')); }
        } elseif ($freq === 'MONTHLY') {
            $tot = ($y * 12 + $mo - 1) + $k * $iv; $yy = intdiv($tot, 12); $mm = $tot % 12 + 1;
            foreach ($monthDays($yy, $mm) as $d) $cands[] = $at($yy, $mm, $d);
        } elseif ($freq === 'YEARLY') {
            $yy = $y + $k * $iv;
            foreach ($bymonth ?: [$mo] as $mm) {
                if ($byday || $bymd) { foreach ($monthDays($yy, $mm) as $d) $cands[] = $at($yy, $mm, $d); }
                elseif (checkdate($mm, (int) $start->format('j'), $yy)) $cands[] = $at($yy, $mm, (int) $start->format('j'));
            }
        } else return [$start];
        $stop = false;
        foreach ($cands as $c) {
            $guard++;
            if ($c < $start) continue;
            if ($until && $c > $until) { $stop = true; break; }
            if ($count && $n >= $count) { $stop = true; break; }
            if ($c > $to) { $stop = true; break; }
            $n++;
            if ($c >= $from) $res[] = $c;
        }
        if ($stop) break;
        if (count($res) > 600) break;
    }
    return $res;
}

// Einsatz-Statistik je Jahr aus allen Quellen: Einsatzverwaltung, Wehrwerk-Einsätze (Alarm, von Hand) und von Hand gepflegte Jahreszahlen
function myf_incident_cat($text) {
    return preg_match('/brand|feuer|bma|rauch|kamin/i', $text) ? 'brand' : (preg_match('/vu\b|verkehr|unfall/i', $text) ? 'vu' : (preg_match('/fehl/i', $text) ? 'fehl' : 'th'));
}
// Einsatznummer aus Titel/Nummer lesen: „48/2026“, „A07/2026“ (eigener Nummernkreis, z. B. zweiter Löschzug), „46-48/2026“ (Sammelbericht)
// → ['seq' => '' oder 'A', 'from' => 46, 'to' => 48, 'year' => 2026]
function myf_incident_nr($text) {
    if (!preg_match('#(?<![\p{L}\d])([A-Za-z]{0,2})(\d{1,4})(?:\s*[-–]\s*(\d{1,4}))?\s*/\s*(\d{4})#u', (string) $text, $m)) return null;
    $from = (int) $m[2]; $to = $m[3] !== '' ? (int) $m[3] : $from;
    return ['seq' => strtoupper($m[1]), 'from' => min($from, $to), 'to' => max($from, $to), 'year' => (int) $m[4]];
}
// Einheit der Dashboards ↔ Einheit in der Einsatzverwaltung („LZ Musterstadt“ ↔ „Löschzug Musterstadt“): term_taxonomy_id oder 0 (alle)
function myf_screen_evw_tt() {
    $u = function_exists('myf_screen_unit') ? myf_screen_unit() : '';
    if ($u === '' || !taxonomy_exists('evw_unit')) return 0;
    $want = mb_strtolower(myf_unit_short(myf_units()[$u] ?? $u));
    $terms = get_terms(['taxonomy' => 'evw_unit', 'hide_empty' => false]);
    if (is_wp_error($terms)) return 0;
    foreach ($terms as $t) if (mb_strtolower(myf_unit_short($t->name)) === $want) return (int) $t->term_taxonomy_id;
    return 0;
}
// SQL: nur Berichte dieser Einheit – Berichte ohne Einheits-Angabe zählen für alle
function myf_screen_post_sql($tt, $alias = 'p') {
    global $wpdb;
    if (!$tt) return '';
    return $wpdb->prepare(" AND ($alias.ID IN (SELECT object_id FROM {$wpdb->term_relationships} WHERE term_taxonomy_id = %d)
        OR $alias.ID NOT IN (SELECT tr.object_id FROM {$wpdb->term_relationships} tr JOIN {$wpdb->term_taxonomy} tt ON tt.term_taxonomy_id = tr.term_taxonomy_id WHERE tt.taxonomy = 'evw_unit'))", $tt);
}
function myf_incident_stats($n = 5) {
    global $wpdb;
    $unit = function_exists('myf_screen_unit') ? myf_screen_unit() : '';
    // Schlüssel enthält Anzahl und letzte Nummer der Wehrwerk-Einsätze: neue oder gelöschte Einsätze erscheinen sofort
    $sig = (string) $wpdb->get_var('SELECT CONCAT(COUNT(*), \'-\', IFNULL(MAX(id), 0)) FROM ' . myf_t('incidents') . " WHERE kind = 'einsatz'");
    $ck = 'myf_stats4_' . (int) get_option('myf_stats_ver', 1) . '_' . $n . '_' . $unit . '_' . md5($sig) . (myf_demo_ctx() ? '_demo' : '');
    if (is_array($c = get_transient($ck))) return $c;
    $y0 = (int) current_time('Y');
    $years = [];
    for ($y = $y0; $y > $y0 - $n; $y--) $years[$y] = ['total' => 0, 'months' => array_fill(0, 12, 0), 'cats' => ['brand' => 0, 'th' => 0, 'vu' => 0, 'fehl' => 0, 'sonst' => 0], 'manual' => false, 'missing' => 0, 'est' => array_fill(0, 12, 0)];
    $from = ($y0 - $n + 1) . '-01-01';
    $seen = [];
    // Je Jahr und Nummernkreis: welche Nummern bekannt sind und wann (Datum) – daraus die offizielle Zählung (höchste Nummer)
    // und die zeitliche Schätzung für Nummern ohne Bericht
    $known = []; $anchor = []; $excl = [];
    $noteNr = function ($text, $date, $only = false) use (&$known, &$anchor, &$excl) {
        if (!($x = myf_incident_nr($text))) return;
        $y = $x['year']; $ts = $date !== '' && (int) substr($date, 0, 4) === $y ? strtotime($date) : null;
        if ($only) $excl[$y][$x['seq']] = ($excl[$y][$x['seq']] ?? 0) + 1;
        for ($k = $x['from']; $k <= $x['to'] && $k - $x['from'] < 100; $k++) {
            $known[$y][$x['seq']][$k] = 1;
            if ($ts !== null && (!isset($anchor[$y][$x['seq']][$k]) || $ts < $anchor[$y][$x['seq']][$k])) $anchor[$y][$x['seq']][$k] = $ts;
        }
    };
    if (post_type_exists('einsatz') && !myf_demo_ctx()) { // Demo: keine echten Website-Einsätze
        // Veröffentlichte und nicht öffentliche (private) Berichte; Entwürfe zählen erst, wenn sie fertig sind; nur die Einheit der Dashboards
        $tt = myf_screen_evw_tt();
        foreach ($wpdb->get_results($wpdb->prepare("SELECT p.ID, p.post_title, p.post_date, (SELECT COUNT(*) FROM {$wpdb->term_relationships} tr JOIN {$wpdb->term_taxonomy} tt ON tt.term_taxonomy_id = tr.term_taxonomy_id WHERE tr.object_id = p.ID AND tt.taxonomy = 'evw_unit') AS nunits
            FROM {$wpdb->posts} p WHERE p.post_type = 'einsatz' AND p.post_status IN ('publish','private') AND p.post_date >= %s" . myf_screen_post_sql($tt), $from)) as $p) {
            $noteNr($p->post_title, $p->post_date, $tt && (int) $p->nunits === 1); // Bericht nur dieser Einheit → Stimme für den Nummernkreis
            if (isset($seen[$p->post_date])) continue; // gemeinsamer Einsatz mehrerer Einheiten (26/2026 und A07/2026, gleiche Alarmzeit) zählt einmal
            $seen[$p->post_date] = 1;
            // Einsatzverwaltung: ein Bericht kann für mehrere Einsätze stehen („Gewichtung“, z. B. Unwettertag) – so oft zählen
            $w = max(1, (int) get_post_meta($p->ID, 'einsatz_weight', true));
            $types = taxonomy_exists('einsatzart') ? wp_get_post_terms($p->ID, 'einsatzart', ['fields' => 'names']) : [];
            $y = (int) substr($p->post_date, 0, 4); $m = (int) substr($p->post_date, 5, 2) - 1;
            if (!isset($years[$y])) continue;
            $years[$y]['total'] += $w; $years[$y]['months'][$m] += $w;
            $years[$y]['cats'][myf_incident_cat($p->post_title . ' ' . (is_wp_error($types) ? '' : implode(' ', $types)))] += $w;
        }
    }
    // Einsätze aus Wehrwerk (Alarm, von Hand) – nur die Einheit der Dashboards (ohne Einheit: alle)
    $usql = $unit === '' ? '' : $wpdb->prepare(" AND (unit = %s OR unit = '')", $unit);
    // (übernommene Website-Berichte haben ihre Nummer schon oben beigesteuert)
    foreach ($wpdb->get_results($wpdb->prepare('SELECT nr, start FROM ' . myf_t('incidents') . " WHERE kind = 'einsatz' AND source <> 'test' AND post_id IS NULL AND nr <> '' AND start >= %s$usql", $from)) as $i) $noteNr($i->nr, $i->start);
    foreach ($wpdb->get_results($wpdb->prepare('SELECT start, category FROM ' . myf_t('incidents') . " WHERE kind = 'einsatz' AND source NOT IN ('test','einsatzverwaltung') AND post_id IS NULL AND start >= %s$usql", $from)) as $i) {
        if (isset($seen[$i->start])) continue;
        $y = (int) substr($i->start, 0, 4); $m = (int) substr($i->start, 5, 2) - 1;
        if (!isset($years[$y])) continue;
        $years[$y]['total']++; $years[$y]['months'][$m]++;
        $c = isset($years[$y]['cats'][$i->category]) ? $i->category : 'sonst';
        $years[$y]['cats'][$c]++;
    }
    // Lücken im Nummernkreis: Nummern bis zur höchsten, zu denen kein Bericht da ist (Art unbekannt → „Sonstiges“),
    // zeitlich geschätzt zwischen den Nachbar-Nummern (est)
    foreach ($years as $y => &$row) {
        $seqs = $known[$y] ?? [];
        if (!$seqs) continue;
        // Nummernkreis der Einheit: der, den Berichte nur dieser Einheit verwenden (gemeinsame Einsätze tragen beide Nummern);
        // ohne solche Berichte der mit den meisten bekannten Nummern, bei Gleichstand der ohne Buchstaben
        $votes = $excl[$y] ?? []; $seq = ''; $bn = $votes ? -1 : count($seqs[''] ?? []);
        foreach ($votes ?: array_map('count', $seqs) as $k => $v) if ($v > $bn || ($v === $bn && $k === '')) { $bn = $v; $seq = $k; }
        $max = max(array_keys($seqs[$seq]));
        if ($max > 2000) continue; // Fantasienummer
        $gaps = [];
        for ($k = 1; $k <= $max; $k++) if (!isset($seqs[$seq][$k])) $gaps[] = $k;
        if (!$gaps) continue;
        $row['missing'] = count($gaps); $row['cats']['sonst'] += count($gaps); $row['total'] += count($gaps);
        $row['est'] = myf_stats_estimate($y, $anchor[$y][$seq] ?? [], $max, $gaps);
    }
    unset($row);
    // Von Hand gepflegte Jahreszahlen (z. B. Jahre vor der Nutzung) ersetzen die Zählung
    foreach ((array) (myf_settings()['stats_manual'] ?? []) as $y => $row) {
        if (!isset($years[(int) $y]) || !is_array($row)) continue;
        $years[(int) $y]['total'] = (int) ($row['total'] ?? 0);
        foreach (['brand', 'th', 'vu', 'fehl', 'sonst'] as $k) if (isset($row[$k])) $years[(int) $y]['cats'][$k] = (int) $row[$k];
        $years[(int) $y]['manual'] = true; $years[(int) $y]['missing'] = 0; $years[(int) $y]['est'] = array_fill(0, 12, 0);
    }
    set_transient($ck, $years, 5 * MINUTE_IN_SECONDS);
    return $years;
}
// Monat je fehlender Nummer schätzen: Nummern laufen mit dem Datum. Eine fehlende Nummer liegt zwischen der nächstkleineren und
// der nächstgrößeren bekannten Nummer – zeitlich anteilig (vor der ersten bekannten: ab 1. Januar, nach der letzten: bis heute).
function myf_stats_estimate($y, $anchor, $maxNr, array $gaps) {
    ksort($anchor);
    $nrs = array_keys($anchor);
    $out = array_fill(0, 12, 0);
    $yEnd = min(current_time('timestamp'), strtotime($y . '-12-31 23:59:59'));
    foreach ($gaps as $g) {
        $lo = [0, strtotime($y . '-01-01 00:00:00')]; $hi = [$maxNr + 1, $yEnd];
        foreach ($nrs as $k) { if ($k < $g) $lo = [$k, $anchor[$k]]; elseif ($k > $g) { $hi = [$k, $anchor[$k]]; break; } }
        if ($hi[1] < $lo[1]) $hi[1] = $lo[1];
        $t = $lo[1] + ($hi[1] - $lo[1]) * ($g - $lo[0]) / max(1, $hi[0] - $lo[0]);
        $out[(int) date('n', (int) $t) - 1]++;
    }
    return $out;
}
// Zwischenspeicher verwerfen (Bericht gespeichert, Einstellung geändert): neue Schlüssel-Version statt alle Schlüssel zu kennen
function myf_stats_flush() { update_option('myf_stats_ver', (int) get_option('myf_stats_ver', 1) + 1, false); }
add_action('save_post_einsatz', 'myf_stats_flush');
add_action('myf_incident_changed', 'myf_stats_flush');

function myf_api_screen(WP_REST_Request $req) {
    global $wpdb;
    if (!myf_screen_key_ok((string) $req->get_param('key'))) return myf_err('Nicht freigegeben.', 403);
    $s = myf_settings();
    $now = time();
    $year = (int) current_time('Y');
    $b = myf_brand();
    $out = ['generated' => current_time('c'), 'year' => $year, 'note' => $s['screen_note'], 'portal' => myf_member_page_url(), 'theme' => $s['screen_theme'],
        'qr_label' => $b['qr_label'], 'website' => $b['website'] ?: (string) wp_parse_url(home_url(), PHP_URL_HOST), 'place' => $b['place'], 'stats' => myf_incident_stats(5),
        'legal' => myf_legal_links(), 'credits' => ['Wetter: Deutscher Wetterdienst (über Bright Sky)', 'Warnungen: BBK / Warn-App NINA']];

    // Einsätze dieses Jahr und letzte Einsätze: Website (Einsatzverwaltung) und Wehrwerk (Alarm, von Hand, noch ohne Bericht) zusammen –
    // gemeinsame Einsätze (gleiche Alarmzeit, z. B. 26/2026 und A07/2026) zählen einmal; im Demo-Bestand nur Demo-Einsätze
    $out['incidents'] = (int) ($out['stats'][$year]['total'] ?? 0);
    $out['incidents_by_month'] = $out['stats'][$year]['months'] ?? array_fill(0, 12, 0);
    $li = [];
    if (post_type_exists('einsatz') && !myf_demo_ctx()) {
        // nur die Einheit der Dashboards; bei gemeinsamen Einsätzen (26/2026 und A07/2026) der Bericht mit der Nummer ohne Buchstaben
        foreach ($wpdb->get_results("SELECT p.ID, p.post_title, p.post_date FROM {$wpdb->posts} p WHERE p.post_type = 'einsatz' AND p.post_status = 'publish'" . myf_screen_post_sql(myf_screen_evw_tt()) . ' ORDER BY p.post_date DESC LIMIT 24') as $p) {
            $nr = myf_incident_nr($p->post_title);
            if (isset($li[$p->post_date]) && !($nr && $nr['seq'] === '' && ($li[$p->post_date]['seq'] ?? '') !== '')) continue;
            $types = taxonomy_exists('einsatzart') ? wp_get_post_terms($p->ID, 'einsatzart', ['fields' => 'names']) : [];
            $li[$p->post_date] = ['title' => myf_plain($p->post_title), 'date' => get_post_time('c', false, $p), 'type' => is_wp_error($types) ? '' : implode(', ', $types), 'seq' => $nr ? $nr['seq'] : 'x'];
        }
    }
    foreach ($wpdb->get_results('SELECT nr, title, start FROM ' . myf_t('incidents') . " WHERE kind = 'einsatz' AND source NOT IN ('test','einsatzverwaltung') AND post_id IS NULL ORDER BY start DESC LIMIT 20") as $i) {
        $li[$i->start] = $li[$i->start] ?? ['title' => trim(($i->nr !== '' ? 'Einsatz ' . $i->nr . ' ' : '') . $i->title), 'date' => mysql2date('c', $i->start, false), 'type' => ''];
    }
    krsort($li);
    $out['last_incidents'] = array_map(function ($x) { unset($x['seq']); return $x; }, array_slice(array_values($li), 0, 12));
    if ($out['last_incidents']) $out['last_incident'] = $out['last_incidents'][0];

    // Neuester Beitrag der Website
    $out['news_list'] = array_map(function ($p) {
        return ['title' => myf_plain(get_the_title($p)), 'date' => get_post_time('c', false, $p),
            'excerpt' => wp_trim_words(myf_plain(strip_shortcodes($p->post_excerpt ?: $p->post_content)), 34, ' …'),
            'image' => get_the_post_thumbnail_url($p, 'large') ?: ''];
    }, get_posts(['post_type' => 'post', 'post_status' => 'publish', 'numberposts' => 3]));
    if ($out['news_list']) $out['news'] = $out['news_list'][0];

    // Termine aus dem Kalender (nur Titel, Zeit, Ort – keine Beschreibung)
    // Termine: die letzten 30 Tage (zum Zurückscrollen am Bildschirm) und die nächsten
    $all = array_values(myf_ical_events());
    $past = array_values(array_filter($all, function ($e) use ($now) { return $e['ts'] < $now - 3600 && $e['ts'] >= $now - 30 * DAY_IN_SECONDS; }));
    $next = array_values(array_filter($all, function ($e) use ($now) { return $e['ts'] >= $now - 3600; }));
    $out['events'] = array_merge(array_map(function ($e) { $e['past'] = true; return $e; }, array_slice($past, -8)), array_slice($next, 0, 14));
    foreach ($out['events'] as &$e) unset($e['ts']);
    unset($e);
    $out['touch'] = !isset($s['screen_touch']) || !empty($s['screen_touch']);
    $out['reset_min'] = max(1, min(30, (int) ($s['screen_reset'] ?? 2)));

    // Nächste Lehrgangstermine (Anzahl Teilnehmer, keine Namen)
    $out['courses'] = array_map(function ($d) {
        return ['title' => $d->title, 'short' => $d->short, 'start' => $d->start_date, 'end' => $d->end_date, 'location' => $d->location, 'people' => (int) $d->people];
    }, $wpdb->get_results($wpdb->prepare(
        'SELECT d.*, c.title, c.short, (SELECT COUNT(*) FROM ' . myf_t('needs') . ' n WHERE n.date_id = d.id AND n.status IN (\'assigned\',\'completed\')) AS people
         FROM ' . myf_t('dates') . ' d JOIN ' . myf_t('courses') . ' c ON c.id = d.course_id
         WHERE c.year > 0 AND c.hidden = 0 AND d.start_date IS NOT NULL AND COALESCE(d.end_date, d.start_date) >= %s ORDER BY d.start_date LIMIT 4', current_time('Y-m-d'))));

    $out['warnings'] = myf_warnings();
    $out['weather'] = myf_weather();

    // Fahrzeuge gerade unterwegs (freigegebene Anfragen, ohne Namen)
    $out['bookings_now'] = array_map(function ($b) { return ['vehicle' => $b->name, 'until' => $b->end, 'purpose' => $b->purpose]; },
        $wpdb->get_results($wpdb->prepare('SELECT b.end, b.purpose, v.name FROM ' . myf_t('bookings') . ' b JOIN ' . myf_t('vehicles') . " v ON v.id = b.vehicle_id WHERE b.status = 'approved' AND b.start <= %s AND b.end > %s" . (function_exists('myf_screen_veh_sql') ? myf_screen_veh_sql('v') : ''), current_time('mysql'), current_time('mysql'))));
    // … und laut Fremdkalender (z. B. MTF-Kalender)
    if (function_exists('myf_vehicle_ext_now')) foreach ($wpdb->get_results('SELECT id, name FROM ' . myf_t('vehicles') . " WHERE active = 1 AND ical_url <> ''" . (function_exists('myf_screen_veh_sql') ? myf_screen_veh_sql() : '')) as $v) {
        if ($x = myf_vehicle_ext_now((int) $v->id)) $out['bookings_now'][] = ['vehicle' => $v->name, 'until' => $x['end'], 'purpose' => 'laut Kalender unterwegs'];
    }

    // Hinweise der Gerätewarte / LZ-Führung (ohne Namen)
    $out['notices'] = myf_notices_now();
    foreach ($wpdb->get_results($wpdb->prepare('SELECT title, ends FROM ' . myf_t('board') . ' WHERE on_screen = 1 AND (ends IS NULL OR ends >= %s) ORDER BY created DESC LIMIT 3', current_time('Y-m-d'))) as $b) {
        $out['notices'][] = ['text' => 'Aushang: ' . $b->title, 'level' => 'info', 'ends' => $b->ends ? $b->ends . ' 23:59:00' : null];
    }

    // Was ist außer Dienst / offene Mängel (ohne Namen)
    $out['out_of_service'] = array_map(function ($x) { return ['object' => $x->object, 'title' => $x->title]; },
        $wpdb->get_results("SELECT object, title FROM " . myf_t('defects') . " WHERE urgency = 'out' AND status IN ('new','progress') ORDER BY created DESC"));
    $out['open_defects'] = (int) $wpdb->get_var("SELECT COUNT(*) FROM " . myf_t('defects') . " WHERE status IN ('new','progress')");

    // Nächste Atemschutz-Übungsstrecke (Datum, Anzahl)
    $agt = $wpdb->get_row($wpdb->prepare("SELECT date, COUNT(*) AS n FROM " . myf_t('agt_log') . " WHERE kind = 'strecke' AND date >= %s GROUP BY date ORDER BY date LIMIT 1", current_time('Y-m-d')));
    if ($agt) $out['agt_next'] = ['date' => $agt->date, 'people' => (int) $agt->n];

    $out['ver'] = MYF_ASSET_VER; // neue Version eingespielt → Dashboard lädt sich selbst neu
    return apply_filters('myf_screen_data', $out);
}

// ---- Amtliche Warnungen (NINA-Schnittstelle des BBK, enthält DWD, MoWaS, KATWARN, BIWAPP, Hochwasser) ----
const MYF_SEVERITY = ['Minor' => 1, 'Moderate' => 2, 'Severe' => 3, 'Extreme' => 4];
function myf_warnings() {
    $s = myf_settings();
    if (empty($s['screen_warnings']) || !preg_match('/^\d{12}$/', (string) $s['screen_ars'])) return [];
    $c = get_transient('myf_nina');
    if (is_array($c)) return $c;
    $res = wp_remote_get('https://warnung.bund.de/api31/dashboard/' . rawurlencode($s['screen_ars']) . '.json', ['timeout' => 8]);
    if (is_wp_error($res) || wp_remote_retrieve_response_code($res) !== 200) { set_transient('myf_nina', [], 3 * MINUTE_IN_SECONDS); return []; }
    $now = current_time('timestamp', true);
    $out = [];
    foreach ((array) json_decode(wp_remote_retrieve_body($res), true) as $w) {
        $p = $w['payload']['data'] ?? [];
        if (($p['msgType'] ?? '') === 'Cancel') continue;
        $exp = isset($w['expires']) ? strtotime($w['expires']) : null;
        if ($exp && $exp < $now) continue;
        $head = myf_plain($w['i18nTitle']['de'] ?? ($p['headline'] ?? ''));
        if ($head === '' || stripos($head, 'Entwarnung') !== false) continue;
        $on = isset($w['onset']) ? date('c', strtotime($w['onset'])) : null;
        $out[] = ['headline' => $head, 'provider' => (string) ($p['provider'] ?? ''), 'severity' => MYF_SEVERITY[$p['severity'] ?? ''] ?? 1,
            'onset' => $on, 'expires' => $exp ? date('c', $exp) : null, 'periods' => [['from' => $on, 'to' => $exp ? date('c', $exp) : null]]];
    }
    // Gleiche Warnung in mehreren Zeitfenstern (z. B. „Sturmböen“ 00–02, 02–06 Uhr) zu einer zusammenfassen
    $merged = [];
    foreach ($out as $w) {
        $k = $w['provider'] . '|' . $w['headline'];
        if (!isset($merged[$k])) { $merged[$k] = $w; continue; }
        $merged[$k]['periods'][] = $w['periods'][0];
        if ($w['expires'] && (!$merged[$k]['expires'] || $w['expires'] > $merged[$k]['expires'])) $merged[$k]['expires'] = $w['expires'];
        if ($w['onset'] && (!$merged[$k]['onset'] || $w['onset'] < $merged[$k]['onset'])) $merged[$k]['onset'] = $w['onset'];
        $merged[$k]['severity'] = max($merged[$k]['severity'], $w['severity']);
    }
    $out = array_values($merged);
    foreach ($out as &$w) { usort($w['periods'], function ($a, $b) { return strcmp((string) $a['from'], (string) $b['from']); }); $w['periods'] = array_slice($w['periods'], 0, 6); }
    unset($w);
    usort($out, function ($a, $b) { return $b['severity'] - $a['severity']; });
    $out = array_slice($out, 0, 4);
    set_transient('myf_nina', $out, 5 * MINUTE_IN_SECONDS);
    return $out;
}

// ---- Aktuelles Wetter (DWD-Daten über Bright Sky) ----
function myf_weather() {
    $s = myf_settings();
    if (empty($s['screen_weather']) || $s['screen_lat'] === null || $s['screen_lon'] === null) return null;
    $c = get_transient('myf_weather');
    if (is_array($c)) return $c ?: null;
    $res = wp_remote_get(add_query_arg(['lat' => $s['screen_lat'], 'lon' => $s['screen_lon']], 'https://api.brightsky.dev/current_weather'), ['timeout' => 8]);
    if (is_wp_error($res) || wp_remote_retrieve_response_code($res) !== 200) { set_transient('myf_weather', [], 5 * MINUTE_IN_SECONDS); return null; }
    $w = json_decode(wp_remote_retrieve_body($res), true)['weather'] ?? null;
    if (!$w) return null;
    $o = ['temp' => isset($w['temperature']) ? round((float) $w['temperature']) : null, 'icon' => (string) ($w['icon'] ?? ''), 'condition' => (string) ($w['condition'] ?? ''),
        'wind' => isset($w['wind_speed_10']) ? round((float) $w['wind_speed_10']) : null, 'gust' => isset($w['wind_gust_speed_10']) ? round((float) $w['wind_gust_speed_10']) : null];
    set_transient('myf_weather', $o, 10 * MINUTE_IN_SECONDS);
    return $o;
}
// Amtliche Warnungen gehören auf das Dashboard im Besprechungsraum (im Mitgliederbereich nicht mehr)
