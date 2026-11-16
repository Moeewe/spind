<?php
/**
 * Alarmschleifen: Wer wird bei welcher Alarmierung mitalarmiert (z. B. „Alle“, „Tagschleife“, „Waldbrand“, „TH“, je Zug)?
 * Gepflegt vom Bereich „Alarmschleifen“ (meist das IT-Team): Schleifen anlegen, Mitglieder zuordnen – einzeln, in einer
 * Tabelle wie in Excel oder per Import der bisherigen Liste. Jedes Mitglied sieht im Profil seine Schleifen und kann eine
 * Änderung anfragen; der Bereich entscheidet, angenommene Änderungen werden direkt eingetragen.
 *
 * Wehrwerk/SPIND alarmiert selbst nicht: Die Zuordnung ist die gepflegte Liste, nach der das IT-Team die Alarmierung
 * (z. B. Alamos, Funkmeldeempfänger) einstellt. Jede Änderung steht im Änderungsprotokoll.
 */

defined('ABSPATH') || exit;

function myf_install_loops($c) {
    $p = myf_t(''); // echte oder Demo-Tabellen (Demo-Modus)
    dbDelta("CREATE TABLE {$p}loops (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        name varchar(80) NOT NULL DEFAULT '',
        note varchar(200) NOT NULL DEFAULT '',
        sort int(11) NOT NULL DEFAULT 0,
        active tinyint(1) NOT NULL DEFAULT 1,
        created datetime NOT NULL,
        PRIMARY KEY  (id)
    ) $c;");
    dbDelta("CREATE TABLE {$p}loop_members (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        loop_id bigint(20) unsigned NOT NULL,
        member_id bigint(20) unsigned NOT NULL,
        since datetime NOT NULL,
        by_name varchar(120) NOT NULL DEFAULT '',
        PRIMARY KEY  (id),
        UNIQUE KEY loop_member (loop_id, member_id),
        KEY member_id (member_id)
    ) $c;");
    dbDelta("CREATE TABLE {$p}loop_requests (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        member_id bigint(20) unsigned NOT NULL,
        add_ids varchar(255) NOT NULL DEFAULT '',
        remove_ids varchar(255) NOT NULL DEFAULT '',
        note varchar(500) NOT NULL DEFAULT '',
        status varchar(10) NOT NULL DEFAULT 'open',
        answer varchar(500) NOT NULL DEFAULT '',
        created datetime NOT NULL,
        decided datetime NULL,
        decided_by varchar(120) NOT NULL DEFAULT '',
        PRIMARY KEY  (id),
        KEY member_id (member_id),
        KEY status (status)
    ) $c;");
}

// Vorschläge für den Anfang – neutral; je Zug/Einheit eine Schleife aus den eingetragenen Einheiten
function myf_loop_suggestions() {
    $s = ['Alle', 'Tagschleife', 'Nachtschleife', 'Brand', 'Technische Hilfe (TH)', 'Person eingeklemmt', 'Waldbrand', 'Gefahrgut', 'Führung'];
    foreach ((array) myf_units() as $name) if (is_string($name) && $name !== '') $s[] = 'Zug ' . preg_replace('/^(LZ|Löschzug|Zug)\s+/u', '', $name);
    return array_values(array_unique($s));
}

function myf_loops($activeOnly = false) {
    global $wpdb;
    return $wpdb->get_results('SELECT * FROM ' . myf_t('loops') . ($activeOnly ? ' WHERE active = 1' : '') . ' ORDER BY sort, name');
}
function myf_loop_out($l, $n = null) {
    $o = ['id' => (int) $l->id, 'name' => $l->name, 'note' => $l->note, 'sort' => (int) $l->sort, 'active' => (bool) $l->active];
    if ($n !== null) $o['n'] = (int) $n;
    return $o;
}
function myf_loops_of($mid) {
    global $wpdb;
    return array_map('intval', $wpdb->get_col($wpdb->prepare('SELECT lm.loop_id FROM ' . myf_t('loop_members') . ' lm JOIN ' . myf_t('loops') . ' l ON l.id = lm.loop_id WHERE lm.member_id = %d ORDER BY l.sort, l.name', $mid)));
}
function myf_loop_ids($v) { return array_values(array_unique(array_filter(array_map('intval', is_array($v) ? $v : explode(',', (string) $v))))); }
function myf_loop_names($ids) {
    $byId = []; foreach (myf_loops() as $l) $byId[(int) $l->id] = $l->name;
    return array_values(array_filter(array_map(function ($i) use ($byId) { return $byId[$i] ?? ''; }, $ids)));
}
// Zuordnung setzen; liefert true, wenn sich etwas geändert hat
function myf_loop_set($mid, $lid, $on, $who) {
    global $wpdb;
    $t = myf_t('loop_members');
    $has = (int) $wpdb->get_var($wpdb->prepare("SELECT id FROM $t WHERE loop_id = %d AND member_id = %d", $lid, $mid));
    if ($on && !$has) { $wpdb->insert($t, ['loop_id' => $lid, 'member_id' => $mid, 'since' => current_time('mysql'), 'by_name' => mb_substr($who, 0, 120)]); return true; }
    if (!$on && $has) { $wpdb->delete($t, ['id' => $has]); return true; }
    return false;
}
// Nach Änderungen durch das Team: dem Mitglied kurz Bescheid geben (eine Meldung je Mitglied)
function myf_loop_tell($changed) {
    foreach ($changed as $mid => $c) {
        $parts = [];
        if (!empty($c['on'])) $parts[] = 'neu: ' . implode(', ', myf_loop_names($c['on']));
        if (!empty($c['off'])) $parts[] = 'nicht mehr: ' . implode(', ', myf_loop_names($c['off']));
        if ($parts) myf_notify([$mid], 'loops', 'Deine Alarmschleifen wurden geändert', implode(' · ', $parts), 'loops');
    }
}
function myf_loop_req_out($r, $names = null) {
    $o = ['id' => (int) $r->id, 'member_id' => (int) $r->member_id, 'add' => myf_loop_ids($r->add_ids), 'remove' => myf_loop_ids($r->remove_ids), 'note' => $r->note,
        'status' => $r->status, 'answer' => $r->answer, 'created' => $r->created, 'decided' => $r->decided, 'decided_by' => $r->decided_by];
    if ($names !== null) $o['name'] = (string) ($names[(int) $r->member_id] ?? '');
    return $o;
}

// ---- Mitglied: eigene Schleifen sehen, Änderung anfragen ----------------------------------------------------------
add_filter('myf_me_data', function ($data, $me) {
    global $wpdb;
    if (!$me || !$wpdb->get_var('SELECT COUNT(*) FROM ' . myf_t('loops') . ' WHERE active = 1')) return $data; // erst sichtbar, wenn Schleifen gepflegt werden
    $data['loops_all'] = array_map(function ($l) { return ['id' => (int) $l->id, 'name' => $l->name, 'note' => $l->note]; }, myf_loops(true));
    $data['loops_mine'] = myf_loops_of((int) $me->id);
    $r = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('loop_requests') . " WHERE member_id = %d AND (status = 'open' OR decided >= %s) ORDER BY id DESC LIMIT 1",
        $me->id, date('Y-m-d H:i:s', current_time('timestamp') - 30 * DAY_IN_SECONDS)));
    $data['loop_request'] = $r ? myf_loop_req_out($r) : null;
    return $data;
}, 10, 2);

function myf_api_me_loop_request(WP_REST_Request $req) {
    global $wpdb;
    $me = myf_me(); if (!$me) return myf_err('Kein Mitglied.', 403);
    $t = myf_t('loop_requests');
    if ($req->get_param('withdraw')) {
        $id = (int) $wpdb->get_var($wpdb->prepare("SELECT id FROM $t WHERE member_id = %d AND status = 'open'", $me->id));
        if (!$id) return myf_err('Es gibt keine offene Anfrage.', 404);
        $wpdb->update($t, ['status' => 'withdrawn', 'decided' => current_time('mysql'), 'decided_by' => $me->name], ['id' => $id]);
        return ['id' => $id];
    }
    $active = array_map(function ($l) { return (int) $l->id; }, myf_loops(true));
    $mine = myf_loops_of((int) $me->id);
    $add = array_values(array_intersect(myf_loop_ids($req->get_param('add')), $active));
    $add = array_values(array_diff($add, $mine));
    $remove = array_values(array_intersect(myf_loop_ids($req->get_param('remove')), $mine));
    $note = mb_substr(sanitize_textarea_field((string) $req->get_param('note')), 0, 500);
    if (!$add && !$remove && $note === '') return myf_err('Bitte auswählen, was sich ändern soll, oder kurz beschreiben.');
    $d = ['add_ids' => implode(',', $add), 'remove_ids' => implode(',', $remove), 'note' => $note];
    // Nur eine offene Anfrage je Mitglied: eine neue ersetzt die alte
    $open = (int) $wpdb->get_var($wpdb->prepare("SELECT id FROM $t WHERE member_id = %d AND status = 'open'", $me->id));
    if ($open) $wpdb->update($t, $d + ['created' => current_time('mysql')], ['id' => $open]);
    else { $wpdb->insert($t, $d + ['member_id' => $me->id, 'status' => 'open', 'created' => current_time('mysql')]); $open = (int) $wpdb->insert_id; }
    $parts = [];
    if ($add) $parts[] = 'dazu: ' . implode(', ', myf_loop_names($add));
    if ($remove) $parts[] = 'raus: ' . implode(', ', myf_loop_names($remove));
    if ($note !== '') $parts[] = '„' . mb_substr($note, 0, 120) . '“';
    myf_notify_area('loops', 'loops', $me->name . ' möchte die Alarmschleifen ändern', implode(' · ', $parts), 'admin:loops', 'loopreq:' . $open);
    return ['id' => $open];
}

// ---- Verwaltung ---------------------------------------------------------------------------------------------------
add_filter('myf_admin_state', function ($d) {
    global $wpdb;
    if (!function_exists('myf_has_area') || !myf_has_area('loops')) return $d;
    $cnt = []; foreach ($wpdb->get_results('SELECT loop_id, COUNT(*) n FROM ' . myf_t('loop_members') . ' GROUP BY loop_id') as $r) $cnt[(int) $r->loop_id] = (int) $r->n;
    $d['loops'] = array_map(function ($l) use ($cnt) { return myf_loop_out($l, $cnt[(int) $l->id] ?? 0); }, myf_loops());
    $d['loop_members'] = array_map(function ($r) { return [(int) $r->member_id, (int) $r->loop_id]; }, $wpdb->get_results('SELECT member_id, loop_id FROM ' . myf_t('loop_members')));
    $names = []; foreach ($wpdb->get_results('SELECT id, name FROM ' . myf_t('members')) as $m) $names[(int) $m->id] = $m->name;
    $d['loop_requests'] = array_map(function ($r) use ($names) { return myf_loop_req_out($r, $names); },
        $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . myf_t('loop_requests') . " WHERE status = 'open' OR decided >= %s ORDER BY status = 'open' DESC, created DESC LIMIT 100",
            date('Y-m-d H:i:s', current_time('timestamp') - 60 * DAY_IN_SECONDS))));
    $d['loop_suggest'] = myf_loop_suggestions();
    // Für die Zuordnung reichen Name und Einheit – auch für Bereiche, die sonst keine Mitgliederliste bekommen
    if (empty($d['members'])) $d['members'] = array_map(function ($m) { return ['id' => (int) $m->id, 'name' => $m->name, 'unit' => $m->unit, 'active' => (bool) $m->active]; },
        $wpdb->get_results('SELECT id, name, unit, active FROM ' . myf_t('members') . ' WHERE active = 1 ORDER BY name'));
    return $d;
});

add_action('rest_api_init', function () {
    $ns = 'myf/v1';
    register_rest_route($ns, '/me/loops/request', ['methods' => 'POST', 'callback' => 'myf_api_me_loop_request',
        'permission_callback' => function () { return myf_member_permission(); }]);

    // Schleife anlegen, ändern, löschen; „suggest“ legt die Vorschläge auf einmal an
    register_rest_route($ns, '/admin/loop', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $t = myf_t('loops'); $id = (int) $req->get_param('id');
        if ($req->get_param('suggest')) {
            $have = array_map('mb_strtolower', $wpdb->get_col("SELECT name FROM $t")); $n = 0; $sort = (int) $wpdb->get_var("SELECT MAX(sort) FROM $t");
            foreach ((array) $req->get_param('names') as $name) {
                $name = mb_substr(sanitize_text_field((string) $name), 0, 80);
                if ($name === '' || in_array(mb_strtolower($name), $have, true)) continue;
                $wpdb->insert($t, ['name' => $name, 'sort' => ++$sort, 'active' => 1, 'created' => current_time('mysql')]); $have[] = mb_strtolower($name); $n++;
            }
            return ['added' => $n];
        }
        if ($req->get_param('delete')) {
            if (!$wpdb->get_var($wpdb->prepare("SELECT id FROM $t WHERE id = %d", $id))) return myf_err('Schleife nicht gefunden.', 404);
            $wpdb->delete(myf_t('loop_members'), ['loop_id' => $id]);
            $wpdb->delete($t, ['id' => $id]);
            return ['ok' => true, 'id' => $id];
        }
        $name = mb_substr(sanitize_text_field((string) $req->get_param('name')), 0, 80);
        if ($name === '') return myf_err('Bitte einen Namen eingeben.');
        $dupe = (int) $wpdb->get_var($wpdb->prepare("SELECT id FROM $t WHERE LOWER(name) = %s AND id <> %d", mb_strtolower($name), $id));
        if ($dupe) return myf_err('Diese Schleife gibt es schon.');
        $d = ['name' => $name, 'note' => mb_substr(sanitize_text_field((string) $req->get_param('note')), 0, 200), 'active' => $req->has_param('active') ? ($req->get_param('active') ? 1 : 0) : 1];
        if ($req->has_param('sort')) $d['sort'] = (int) $req->get_param('sort');
        if ($id) { if (!$wpdb->get_var($wpdb->prepare("SELECT id FROM $t WHERE id = %d", $id))) return myf_err('Schleife nicht gefunden.', 404); $wpdb->update($t, $d, ['id' => $id]); }
        else { $d += ['sort' => 1 + (int) $wpdb->get_var("SELECT MAX(sort) FROM $t"), 'created' => current_time('mysql')]; $wpdb->insert($t, $d); $id = (int) $wpdb->insert_id; }
        return ['id' => $id];
    }]);

    // Zuordnung ändern (aus der Tabelle): changes = [{member_id, loop_id, on}]
    register_rest_route($ns, '/admin/loops/assign', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $valid = array_flip(array_map(function ($l) { return (int) $l->id; }, myf_loops()));
        $members = array_flip(array_map('intval', $wpdb->get_col('SELECT id FROM ' . myf_t('members'))));
        $who = myf_actor(); $changed = []; $n = 0;
        foreach ((array) $req->get_param('changes') as $c) {
            $c = (array) $c; $mid = (int) ($c['member_id'] ?? 0); $lid = (int) ($c['loop_id'] ?? 0); $on = !empty($c['on']);
            if (!isset($valid[$lid]) || !isset($members[$mid])) continue;
            if (myf_loop_set($mid, $lid, $on, $who)) { $changed[$mid][$on ? 'on' : 'off'][] = $lid; $n++; }
        }
        if ($req->get_param('tell') !== false) myf_loop_tell($changed);
        return ['changed' => $n];
    }]);

    // Bisherige Excel-Liste übernehmen: header = Schleifennamen, rows = [{name, on: [Schleifennamen]}]. Fehlende Schleifen
    // werden angelegt; je Person gilt danach genau, was in der Liste steht (nur für die Schleifen aus der Kopfzeile).
    register_rest_route($ns, '/admin/loops/import', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $t = myf_t('loops'); $byLoop = []; $sort = (int) $wpdb->get_var("SELECT MAX(sort) FROM $t"); $newLoops = 0;
        foreach (myf_loops() as $l) $byLoop[mb_strtolower($l->name)] = (int) $l->id;
        $head = [];
        foreach ((array) $req->get_param('header') as $h) {
            $h = mb_substr(sanitize_text_field((string) $h), 0, 80); if ($h === '') continue;
            if (!isset($byLoop[mb_strtolower($h)])) { $wpdb->insert($t, ['name' => $h, 'sort' => ++$sort, 'active' => 1, 'created' => current_time('mysql')]); $byLoop[mb_strtolower($h)] = (int) $wpdb->insert_id; $newLoops++; }
            $head[mb_strtolower($h)] = $byLoop[mb_strtolower($h)];
        }
        if (!$head) return myf_err('In der Kopfzeile stehen keine Schleifen.');
        $byName = [];
        foreach ($wpdb->get_results('SELECT id, name FROM ' . myf_t('members')) as $m) {
            $byName[mb_strtolower(trim($m->name))] = (int) $m->id;
            // „Vorname Nachname“ geht auch
            $p = array_map('trim', explode(',', $m->name, 2)); if (count($p) === 2) $byName[mb_strtolower($p[1] . ' ' . $p[0])] = (int) $m->id;
        }
        $who = myf_actor(); $changed = []; $n = 0; $missing = [];
        foreach ((array) $req->get_param('rows') as $r) {
            $r = (array) $r; $nm = trim(preg_replace('/\s+/u', ' ', (string) ($r['name'] ?? '')));
            if ($nm === '') continue;
            $mid = $byName[mb_strtolower($nm)] ?? 0;
            if (!$mid) { $missing[] = $nm; continue; }
            $on = array_map('mb_strtolower', array_map('strval', (array) ($r['on'] ?? [])));
            foreach ($head as $key => $lid) if (myf_loop_set($mid, $lid, in_array($key, $on, true), $who)) { $changed[$mid][in_array($key, $on, true) ? 'on' : 'off'][] = $lid; $n++; }
        }
        return ['changed' => $n, 'loops_added' => $newLoops, 'members' => count($changed), 'missing' => array_slice($missing, 0, 50)];
    }]);

    // Anfrage eines Mitglieds entscheiden: angenommen = Änderung eintragen
    register_rest_route($ns, '/admin/loops/decide', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $t = myf_t('loop_requests'); $id = (int) $req->get_param('id');
        $r = $wpdb->get_row($wpdb->prepare("SELECT * FROM $t WHERE id = %d", $id));
        if (!$r) return myf_err('Anfrage nicht gefunden.', 404);
        if ($r->status !== 'open') return myf_err('Diese Anfrage ist schon erledigt.');
        $accept = (bool) $req->get_param('accept'); $who = myf_actor();
        $answer = mb_substr(sanitize_textarea_field((string) $req->get_param('answer')), 0, 500);
        if (!$accept && $answer === '') return myf_err('Bitte kurz begründen, warum es nicht geht.');
        if ($accept) {
            $active = array_flip(array_map(function ($l) { return (int) $l->id; }, myf_loops(true)));
            foreach (myf_loop_ids($r->add_ids) as $lid) if (isset($active[$lid])) myf_loop_set((int) $r->member_id, $lid, true, $who);
            foreach (myf_loop_ids($r->remove_ids) as $lid) myf_loop_set((int) $r->member_id, $lid, false, $who);
        }
        $wpdb->update($t, ['status' => $accept ? 'done' : 'declined', 'answer' => $answer, 'decided' => current_time('mysql'), 'decided_by' => $who], ['id' => $id]);
        myf_notify([(int) $r->member_id], 'loops', $accept ? 'Deine Alarmschleifen sind geändert' : 'Deine Anfrage zu den Alarmschleifen wurde abgelehnt',
            $answer !== '' ? $answer : ($accept ? 'Wie angefragt eingetragen.' : ''), 'loops');
        return ['id' => $id, 'status' => $accept ? 'done' : 'declined'];
    }]);
});
