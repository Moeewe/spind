<?php
/**
 * Unterweisungen (UVV/DGUV, Atemschutz, Fahrer, Motorsäge …): zu Jahresbeginn anlegen, Mitglieder bestätigen per Tipp –
 * oder die Verwaltung hakt nach Unterschriftenliste ab. Wer fehlt, steht in der Übersicht. Bestätigungen sind
 * revisionssicher (Zeitpunkt, Art, wer eingetragen hat; Änderungsprotokoll); Mitglieder können sie nicht zurücknehmen.
 */

defined('ABSPATH') || exit;

const MYF_BRIEF_PRESETS = [
    'uvv' => ['UVV-Unterweisung (allgemein)', 'all', 'Jährliche Unterweisung nach DGUV Vorschrift 49 „Feuerwehren“: Gefahren im Feuerwehrdienst, persönliche Schutzausrüstung, Verhalten an der Einsatzstelle, Unfallmeldung, Verkehrssicherung, Hygiene.'],
    'agt' => ['Unterweisung Atemschutz', 'agt', 'Jährliche Unterweisung für Atemschutzgeräteträger (FwDV 7): Einsatzgrundsätze, Atemschutzüberwachung, Notfallmanagement, Gerätekunde, Einsatzkurzprüfung.'],
    'fahrer' => ['Unterweisung Fahrer & Maschinisten', 'trait:Maschinist', 'Fahren mit Sonder- und Wegerechten, Einweisen, Rückwärtsfahren, Fahrzeugkunde, Beladung, Pumpenbedienung.'],
    'saege' => ['Unterweisung Motorsäge', 'all', 'Sicherer Umgang mit der Motorkettensäge, Schutzausrüstung, Schnitttechniken, Gefahren bei Sturmholz.'],
    'hygiene' => ['Einsatzstellenhygiene', 'all', 'Kontaminationsverschleppung vermeiden: Schwarz-Weiß-Trennung, Reinigung der PSA, Verhalten nach Brandeinsätzen.'],
];

function myf_install_briefings($c) {
    $p = myf_t('');
    dbDelta("CREATE TABLE {$p}briefings (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        year smallint(5) unsigned NOT NULL,
        title varchar(160) NOT NULL,
        text text NULL,
        link varchar(500) NOT NULL DEFAULT '',
        audience varchar(60) NOT NULL DEFAULT 'all',
        due date NULL,
        held date NULL,
        active tinyint(1) NOT NULL DEFAULT 1,
        created_by varchar(120) NOT NULL DEFAULT '',
        created datetime NOT NULL,
        PRIMARY KEY  (id),
        KEY year (year)
    ) $c;");
    dbDelta("CREATE TABLE {$p}briefing_acks (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        briefing_id bigint(20) unsigned NOT NULL,
        member_id bigint(20) unsigned NOT NULL,
        method varchar(10) NOT NULL DEFAULT 'app',
        by_name varchar(120) NOT NULL DEFAULT '',
        ack_at datetime NOT NULL,
        PRIMARY KEY  (id),
        UNIQUE KEY one (briefing_id, member_id),
        KEY member_id (member_id)
    ) $c;");
}

// Wer muss diese Unterweisung haben? alle Aktiven (Einsatzabteilung) / Geräteträger / Mitglieder mit Merkmal
function myf_brief_audience_ids($aud) {
    global $wpdb;
    $m = myf_t('members');
    if ($aud === 'agt') return array_map('intval', $wpdb->get_col("SELECT id FROM $m WHERE active = 1 AND agt = 1"));
    if (strpos($aud, 'trait:') === 0) {
        $tid = (int) substr($aud, 6);
        return array_map('intval', $wpdb->get_col($wpdb->prepare("SELECT m.id FROM $m m JOIN " . myf_t('member_traits') . ' mt ON mt.member_id = m.id WHERE m.active = 1 AND mt.trait_id = %d', $tid)));
    }
    return array_map('intval', $wpdb->get_col("SELECT id FROM $m WHERE active = 1 AND (dept = 'einsatz' OR dept = '' OR dept IS NULL)"));
}
function myf_brief_aud_label($aud) {
    if ($aud === 'agt') return 'Atemschutzgeräteträger';
    if (strpos($aud, 'trait:') === 0) { foreach (myf_traits() as $t) if ($t['id'] === (int) substr($aud, 6)) return 'Merkmal: ' . $t['name']; return 'Merkmal'; }
    return 'alle Aktiven';
}
function myf_brief_out($b, $withPeople = false) {
    global $wpdb;
    $ids = myf_brief_audience_ids($b->audience);
    $acks = [];
    foreach ($wpdb->get_results($wpdb->prepare('SELECT member_id, method, by_name, ack_at FROM ' . myf_t('briefing_acks') . ' WHERE briefing_id = %d', $b->id)) as $a) $acks[(int) $a->member_id] = $a;
    $o = ['id' => (int) $b->id, 'year' => (int) $b->year, 'title' => $b->title, 'text' => (string) $b->text, 'link' => $b->link, 'audience' => $b->audience, 'audience_label' => myf_brief_aud_label($b->audience),
        'due' => $b->due, 'held' => $b->held, 'active' => (int) $b->active, 'total' => count($ids), 'done' => count(array_intersect($ids, array_keys($acks)))];
    if ($withPeople) {
        $o['acks'] = array_map(function ($a, $mid) { return ['member_id' => $mid, 'method' => $a->method, 'by' => $a->by_name, 'at' => $a->ack_at]; }, $acks, array_keys($acks));
        $o['open'] = array_values(array_diff($ids, array_keys($acks)));
        $o['members'] = $ids;
    }
    return $o;
}
function myf_brief_year() { return (int) current_time('Y'); }

// Mitglied: offene und erledigte Unterweisungen des Jahres
add_filter('myf_me_data', function ($data, $me) {
    global $wpdb;
    if (!$me) return $data;
    $t = myf_t('briefings');
    if (!$wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $t))) return $data;
    $out = [];
    foreach ($wpdb->get_results($wpdb->prepare("SELECT * FROM $t WHERE active = 1 AND year >= %d ORDER BY due IS NULL, due, id", myf_brief_year() - 1)) as $b) {
        if (!in_array((int) $me->id, myf_brief_audience_ids($b->audience), true)) continue;
        $a = $wpdb->get_row($wpdb->prepare('SELECT method, ack_at FROM ' . myf_t('briefing_acks') . ' WHERE briefing_id = %d AND member_id = %d', $b->id, $me->id));
        if ((int) $b->year < myf_brief_year() && $a) continue; // erledigte aus dem Vorjahr ausblenden
        $out[] = ['id' => (int) $b->id, 'year' => (int) $b->year, 'title' => $b->title, 'text' => (string) $b->text, 'link' => $b->link, 'due' => $b->due,
            'ack' => $a ? ['method' => $a->method, 'at' => $a->ack_at] : null];
    }
    $data['briefings'] = $out;
    return $data;
}, 10, 2);

// Verwaltung (Bereich Mitglieder): alle Unterweisungen des gewählten Jahres mit Stand
add_filter('myf_admin_state', function ($d) {
    global $wpdb;
    if (!myf_can_manage() && !myf_has_area('members')) return $d;
    $y = myf_brief_year();
    $d['briefings'] = array_map(function ($b) { return myf_brief_out($b, true); }, $wpdb->get_results('SELECT * FROM ' . myf_t('briefings') . ' ORDER BY year DESC, id LIMIT 500')); // alle Jahre (wenige Einträge je Jahr)
    $d['brief_presets'] = array_map(function ($p, $k) { return ['key' => $k, 'title' => $p[0], 'audience' => $p[1], 'text' => $p[2]]; }, MYF_BRIEF_PRESETS, array_keys(MYF_BRIEF_PRESETS));
    return $d;
});

add_action('rest_api_init', function () {
    $ns = 'myf/v1';
    // Anlegen/ändern (auch mehrere Vorlagen auf einmal für das neue Jahr)
    register_rest_route($ns, '/admin/briefing', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $t = myf_t('briefings');
        $aud = function ($a) {
            $a = (string) $a;
            if ($a === 'agt' || $a === 'all') return $a;
            if (preg_match('/^trait:(\d+)$/', $a)) return $a;
            if (preg_match('/^trait:(.+)$/', $a, $m)) { foreach (myf_traits() as $tr) if (mb_strtolower($tr['name']) === mb_strtolower($m[1])) return 'trait:' . $tr['id']; return 'all'; }
            return 'all';
        };
        if ($req->has_param('presets')) {
            $y = (int) $req->get_param('year') ?: myf_brief_year(); $due = myf_date_or_null($req->get_param('due')); $made = [];
            foreach ((array) $req->get_param('presets') as $k) {
                if (!isset(MYF_BRIEF_PRESETS[$k])) continue;
                $p = MYF_BRIEF_PRESETS[$k];
                if ($wpdb->get_var($wpdb->prepare("SELECT id FROM $t WHERE year = %d AND title = %s", $y, $p[0]))) continue;
                // Erst als Entwurf: für Mitglieder unsichtbar, keine Nachricht – „Freigeben“ macht sichtbar und informiert
                $wpdb->insert($t, ['year' => $y, 'title' => $p[0], 'text' => $p[2], 'audience' => $aud($p[1]), 'due' => $due, 'active' => 0, 'created_by' => myf_actor(), 'created' => current_time('mysql')]);
                $made[] = $p[0];
            }
            return ['made' => $made];
        }
        $id = (int) $req->get_param('id');
        if ($id && $req->get_param('publish')) {
            if (!$wpdb->get_var($wpdb->prepare("SELECT id FROM $t WHERE id = %d", $id))) return myf_err('Unterweisung nicht gefunden.', 404);
            $wpdb->update($t, ['active' => 1], ['id' => $id]); myf_brief_notify_one($id);
            return ['id' => $id];
        }
        $row = ['title' => mb_substr(sanitize_text_field((string) $req->get_param('title')), 0, 160), 'text' => sanitize_textarea_field((string) $req->get_param('text')),
            'link' => esc_url_raw((string) $req->get_param('link')), 'audience' => $aud($req->get_param('audience')), 'due' => myf_date_or_null($req->get_param('due')),
            'held' => myf_date_or_null($req->get_param('held')), 'active' => $req->has_param('active') ? ($req->get_param('active') ? 1 : 0) : 1];
        if ($row['title'] === '') return myf_err('Bitte einen Titel eintragen.');
        if ($id) { $wpdb->update($t, $row, ['id' => $id]); if ($row['active']) myf_brief_notify_one($id); return ['id' => $id]; }
        $wpdb->insert($t, $row + ['year' => (int) $req->get_param('year') ?: myf_brief_year(), 'created_by' => myf_actor(), 'created' => current_time('mysql')]);
        $nid = (int) $wpdb->insert_id; if ($row['active']) myf_brief_notify_one($nid);
        return ['id' => $nid];
    }]);
    // Löschen (z. B. versehentlich angelegt): ohne Bestätigungen sofort; mit Bestätigungen nur mit Begründung – alles steht im Protokoll
    register_rest_route($ns, '/admin/briefing/delete', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $id = (int) $req->get_param('id');
        if (!$wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('briefings') . ' WHERE id = %d', $id))) return myf_err('Unterweisung nicht gefunden.', 404);
        $n = (int) $wpdb->get_var($wpdb->prepare('SELECT COUNT(*) FROM ' . myf_t('briefing_acks') . ' WHERE briefing_id = %d', $id));
        if ($n && mb_strlen(trim((string) $req->get_param('reason'))) < 5) return myf_err($n . ' Mitglieder haben schon bestätigt – Löschen nur mit Begründung (steht im Protokoll).');
        $wpdb->delete(myf_t('briefing_acks'), ['briefing_id' => $id]);
        $wpdb->delete(myf_t('briefings'), ['id' => $id]);
        $wpdb->query($wpdb->prepare('DELETE FROM ' . myf_t('notifications') . ' WHERE dedupe = %s', 'brief:' . $id)); // Hinweis in den Postfächern zurückziehen
        return ['ok' => true, 'id' => $id, 'acks_removed' => $n];
    }]);
    // Abhaken durch die Verwaltung (z. B. nach Unterschriftenliste) – oder Haken entfernen (mit Protokoll)
    register_rest_route($ns, '/admin/briefing/ack', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $bid = (int) $req->get_param('id');
        if (!$wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('briefings') . ' WHERE id = %d', $bid))) return myf_err('Unterweisung nicht gefunden.', 404);
        $ids = array_map('intval', (array) $req->get_param('member_ids'));
        $n = 0;
        if ($req->get_param('remove')) {
            foreach ($ids as $mid) $n += (int) $wpdb->delete(myf_t('briefing_acks'), ['briefing_id' => $bid, 'member_id' => $mid]);
            return ['id' => $bid, 'removed' => $n];
        }
        $method = $req->get_param('method') === 'halle' ? 'halle' : 'liste';
        foreach ($ids as $mid) {
            if ($wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('briefing_acks') . ' WHERE briefing_id = %d AND member_id = %d', $bid, $mid))) continue;
            $n += (int) $wpdb->insert(myf_t('briefing_acks'), ['briefing_id' => $bid, 'member_id' => $mid, 'method' => $method, 'by_name' => myf_actor(), 'ack_at' => current_time('mysql')]);
        }
        return ['id' => $bid, 'added' => $n];
    }]);
    // Mitglied bestätigt selbst
    register_rest_route($ns, '/me/briefing', ['methods' => 'POST', 'permission_callback' => 'myf_member_permission', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $me = myf_me(); $bid = (int) $req->get_param('id');
        $b = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('briefings') . ' WHERE id = %d AND active = 1', $bid));
        if (!$b || !in_array((int) $me->id, myf_brief_audience_ids($b->audience), true)) return myf_err('Diese Unterweisung ist nicht für dich.', 404);
        if (!$req->get_param('confirm')) return myf_err('Bitte bestätigen, dass du teilgenommen bzw. die Inhalte gelesen und verstanden hast.');
        if (!$wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('briefing_acks') . ' WHERE briefing_id = %d AND member_id = %d', $bid, $me->id)))
            $wpdb->insert(myf_t('briefing_acks'), ['briefing_id' => $bid, 'member_id' => $me->id, 'method' => 'app', 'by_name' => $me->name, 'ack_at' => current_time('mysql')]);
        return ['id' => $bid];
    }]);
});

// Freigegebene Unterweisung: einmal an alle Betroffenen (Postfach), nicht täglich (doppelt verhindert der Schlüssel brief:ID)
function myf_brief_notify_one($id) {
    global $wpdb;
    $b = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('briefings') . ' WHERE id = %d AND active = 1', $id));
    if (!$b) return;
    $ids = myf_brief_audience_ids($b->audience);
    if ($ids) myf_notify($ids, 'briefing', 'Unterweisung: ' . $b->title, $b->due ? 'Bitte bis ' . date('d.m.Y', strtotime($b->due)) . ' bestätigen.' : 'Bitte im Mitgliederbereich bestätigen.', 'brief:' . (int) $b->id, 'brief:' . $b->id);
}
