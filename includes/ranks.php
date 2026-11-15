<?php
/**
 * Dienstgrade & Beförderungen: Katalog mit Voraussetzungen (Vorgabe: NRW, Anlage 1 zur Verordnung über die Laufbahn der
 * ehrenamtlichen Angehörigen der Freiwilligen Feuerwehr), „seit“-Datum je Mitglied und automatische Erinnerung, wenn
 * eine Beförderung möglich ist. Ob befördert wird, entscheidet weiter die Leitung der Feuerwehr.
 */

defined('ABSPATH') || exit;

// name, Kurzform, ab welchem Dienstgrad (Kurzform), wie lange darin (Monate), Lehrgänge (Stichworte, eines je Zeile muss passen), Hinweis
function myf_ranks_default() {
    $r = function ($name, $short, $from, $months, $quals, $note = '') { return compact('name', 'short', 'from', 'months', 'quals', 'note'); };
    return [
        $r('Feuerwehrmann-Anwärter/in', 'FMA', '', 0, [], 'mit dem Eintritt'),
        $r('Feuerwehrmann/-frau', 'FM', 'FMA', 0, ['Truppmann Teil 1|TM 1|TM1|Grundausbildung|Truppmann 1 - Teil 1'], 'oder Übernahme aus der Jugendfeuerwehr'),
        $r('Oberfeuerwehrmann/-frau', 'OFM', 'FM', 24, ['Truppmann Teil 2|TM 2|TM2|Truppmann 1 - Teil 2|TM 1/2']),
        $r('Hauptfeuerwehrmann/-frau', 'HFM', 'OFM', 60, [], 'regelmäßige Teilnahme am aktiven Dienst'),
        $r('Unterbrandmeister/in', 'UBM', 'OFM', 12, ['Truppführer|TF'], 'oder bereits Hauptfeuerwehrmann/-frau'),
        $r('Brandmeister/in', 'BM', 'UBM', 24, ['Gruppenführer|GF|F III|F3']),
        $r('Oberbrandmeister/in', 'OBM', 'BM', 24, [], 'regelmäßige Teilnahme an Dienst und Fortbildungen'),
        $r('Hauptbrandmeister/in', 'HBM', 'OBM', 60, [], 'regelmäßige Teilnahme an Dienst und Fortbildungen'),
        $r('Brandinspektor/in', 'BI', 'OBM', 0, ['Zugführer|ZF|F IV|F4']),
        $r('Brandoberinspektor/in', 'BOI', 'BI', 0, ['Verbandsführer|VF|F V|B V']),
        $r('Gemeinde-/Stadtbrandinspektor/in', 'GBI', 'BOI', 0, ['Leiter einer Feuerwehr|Leiter FF|F VI|Führen im ABC']),
    ];
}
function myf_ranks() {
    $r = myf_settings()['ranks'] ?? null;
    return is_array($r) && $r ? array_values($r) : myf_ranks_default();
}
function myf_rank_index($text, $ranks = null) {
    $ranks = $ranks ?: myf_ranks();
    $t = mb_strtolower(trim((string) $text));
    if ($t === '') return -1;
    foreach ($ranks as $i => $r) if ($t === mb_strtolower($r['short']) || $t === mb_strtolower($r['name'])) return $i;
    // „Oberfeuerwehrmann“ passt zu „Oberfeuerwehrmann/-frau“
    foreach ($ranks as $i => $r) { $base = mb_strtolower(preg_replace('#[/(].*$#u', '', $r['name'])); if ($base !== '' && strpos($t, trim($base)) === 0) return $i; }
    return -1;
}

// Nächste mögliche Beförderung eines Mitglieds
function myf_rank_next($m, $qualTexts, $today = null) {
    $ranks = myf_ranks();
    $today = $today ?: current_time('Y-m-d');
    $cur = myf_rank_index($m->dienstgrad, $ranks);
    if ($cur < 0) return null;
    $short = array_map(function ($r) { return $r['short']; }, $ranks);
    for ($n = $cur + 1; $n < count($ranks); $n++) {
        $r = $ranks[$n];
        $from = array_search($r['from'], $short, true);
        if ($from === false || $from > $cur) continue; // Voraussetzung: mindestens Dienstgrad „from“
        // Mindestzeit gilt im Dienstgrad „from“; wer schon höher ist, hat sie erfüllt
        $since = $m->rank_since ?: null;
        $dueTime = ($from === $cur && (int) $r['months'] > 0) ? ($since ? date('Y-m-d', strtotime($since . ' +' . (int) $r['months'] . ' months')) : null) : $today;
        $quals = [];
        $hay = mb_strtolower(implode(' | ', $qualTexts));
        foreach ((array) $r['quals'] as $q) {
            $ok = false;
            foreach (explode('|', $q) as $alt) if (trim($alt) !== '' && mb_strpos($hay, mb_strtolower(trim($alt))) !== false) $ok = true;
            $quals[] = ['label' => trim(explode('|', $q)[0]), 'ok' => $ok];
        }
        $qualsOk = !array_filter($quals, function ($q) { return !$q['ok']; });
        return ['rank_next' => $r['name'], 'short' => $r['short'], 'from_months' => (int) $r['months'], 'due' => $dueTime, 'time_ok' => $dueTime !== null && $dueTime <= $today,
            'quals' => $quals, 'quals_ok' => $qualsOk, 'note' => (string) ($r['note'] ?? ''), 'ready' => $dueTime !== null && $dueTime <= $today && $qualsOk, 'no_since' => $since === null && $from === $cur && (int) $r['months'] > 0];
    }
    return null;
}
function myf_member_qual_texts($memberId) {
    global $wpdb;
    $t = [];
    foreach ($wpdb->get_results($wpdb->prepare('SELECT title, short FROM ' . myf_t('quals') . ' WHERE member_id = %d', $memberId)) as $q) $t[] = $q->title . ' ' . $q->short;
    foreach ($wpdb->get_results($wpdb->prepare('SELECT c.title, c.short FROM ' . myf_t('needs') . ' n JOIN ' . myf_t('courses') . " c ON c.id = n.course_id WHERE n.member_id = %d AND n.status = 'completed'", $memberId)) as $q) $t[] = $q->title . ' ' . $q->short;
    return $t;
}
function myf_promotions() {
    global $wpdb;
    $out = [];
    foreach ($wpdb->get_results('SELECT * FROM ' . myf_t('members') . " WHERE active = 1 AND dienstgrad <> '' AND (dept = 'einsatz' OR dept = '') ORDER BY name") as $m) {
        $n = myf_rank_next($m, myf_member_qual_texts((int) $m->id));
        if ($n) $out[] = ['member_id' => (int) $m->id, 'name' => $m->name, 'rank' => $m->dienstgrad, 'since' => $m->rank_since] + $n;
    }
    return $out;
}

add_filter('myf_admin_state', function ($d) {
    if (!function_exists('myf_has_area') || !myf_has_area('members')) return $d;
    $d['ranks'] = myf_ranks();
    $d['ranks_custom'] = !empty(myf_settings()['ranks']);
    $d['promotions'] = myf_promotions();
    return $d;
}, 24);

add_action('rest_api_init', function () {
    register_rest_route('myf/v1', '/admin/ranks', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
        $s = myf_settings();
        if ($req->get_param('reset')) { unset($s['ranks']); update_option('myf_settings', $s); return ['ok' => true]; }
        $out = [];
        foreach ((array) $req->get_param('ranks') as $r) {
            $name = mb_substr(sanitize_text_field((string) ($r['name'] ?? '')), 0, 60);
            if ($name === '') continue;
            $out[] = ['name' => $name, 'short' => mb_substr(sanitize_text_field((string) ($r['short'] ?? '')), 0, 10) ?: mb_substr($name, 0, 6),
                'from' => mb_substr(sanitize_text_field((string) ($r['from'] ?? '')), 0, 10), 'months' => max(0, min(240, (int) ($r['months'] ?? 0))),
                'quals' => array_values(array_filter(array_map('sanitize_text_field', (array) ($r['quals'] ?? [])))), 'note' => mb_substr(sanitize_text_field((string) ($r['note'] ?? '')), 0, 160)];
        }
        if (!$out) return myf_err('Bitte mindestens einen Dienstgrad angeben.');
        $s['ranks'] = $out;
        update_option('myf_settings', $s);
        return ['ok' => true];
    }]);
    // Beförderung eintragen (Dienstgrad + seit), auf Wunsch mit Glückwunsch ins Postfach
    register_rest_route('myf/v1', '/admin/promote', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $id = (int) $req->get_param('id');
        $m = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('members') . ' WHERE id = %d', $id));
        if (!$m) return myf_err('Mitglied nicht gefunden.', 404);
        $rank = mb_substr(sanitize_text_field((string) $req->get_param('rank')), 0, 60);
        $date = myf_date_or_null($req->get_param('date')) ?: current_time('Y-m-d');
        if ($rank === '') return myf_err('Bitte den neuen Dienstgrad angeben.');
        $wpdb->update(myf_t('members'), ['dienstgrad' => $rank, 'rank_since' => $date], ['id' => $id]);
        if ($req->get_param('congrats')) myf_notify([$id], 'info', 'Herzlichen Glückwunsch zur Beförderung!', 'Ab ' . date('d.m.Y', strtotime($date)) . ': ' . $rank, '');
        return ['id' => $id];
    }]);
});

// Altersgrenze für die Einsatzabteilung (einstellbar; die Verordnung nennt sie – bitte mit der aktuellen Fassung abgleichen)
function myf_retire_age() { return max(50, min(75, (int) (myf_settings()['retire_age'] ?? 60))); }
// Wer erreicht bald die Altersgrenze? (für den Übergang in die Alters- und Ehrenabteilung)
function myf_retiring($days = 180) {
    global $wpdb;
    $age = myf_retire_age();
    $out = [];
    foreach ($wpdb->get_results('SELECT id, name, birth_date FROM ' . myf_t('members') . " WHERE active = 1 AND (dept = 'einsatz' OR dept = '') AND birth_date IS NOT NULL") as $m) {
        $when = date('Y-m-d', strtotime($m->birth_date . " +$age years"));
        if ($when <= date('Y-m-d', current_time('timestamp') + $days * DAY_IN_SECONDS)) $out[] = ['member_id' => (int) $m->id, 'name' => $m->name, 'date' => $when];
    }
    return $out;
}
add_filter('myf_admin_state', function ($d) {
    if (function_exists('myf_has_area') && myf_has_area('members')) $d['retiring'] = myf_retiring();
    return $d;
}, 24);

// Montags: anstehende Beförderungen an den Bereich Mitglieder (einmal je Person und Dienstgrad)
add_action('myf_daily_more', function ($today) {
    if ((int) date('N', strtotime($today)) !== 1) return;
    foreach (myf_retiring(90) as $r) foreach (myf_area_members('members') as $mid)
        myf_notify([$mid], 'reminder', 'Altersgrenze: ' . $r['name'], 'erreicht am ' . date('d.m.Y', strtotime($r['date'])) . ' die Altersgrenze der Einsatzabteilung – Übergang in die Alters- und Ehrenabteilung vorbereiten.', 'admin:member:' . $r['member_id'], 'retire:' . $r['member_id']);
    $ready = array_filter(myf_promotions(), function ($p) { return $p['ready']; });
    foreach ($ready as $p) {
        foreach (myf_area_members('members') as $mid) myf_notify([$mid], 'reminder', 'Beförderung möglich: ' . $p['name'], $p['rank'] . ' → ' . $p['short'] . ' (' . $p['rank_next'] . ')', 'admin:member:' . $p['member_id'], 'promo:' . $p['member_id'] . ':' . $p['short']);
    }
});
