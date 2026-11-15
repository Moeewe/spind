<?php
/** REST-Schnittstelle für Mitglieder (angemeldet mit eigenem Konto; jedes Mitglied sieht nur seine eigenen Daten). */

defined('ABSPATH') || exit;

function myf_member_permission() {
    if (!is_user_logged_in()) return new WP_Error('myf_auth', 'Bitte neu anmelden.', ['status' => 401]);
    return myf_me() ? true : new WP_Error('myf_auth', 'Dein Konto ist keinem Mitglied zugeordnet.', ['status' => 403]);
}

add_action('rest_api_init', function () {
    $ns = 'myf/v1';
    $p = 'myf_member_permission';
    register_rest_route($ns, '/me', ['methods' => 'GET', 'permission_callback' => $p, 'callback' => 'myf_api_me']);
    register_rest_route($ns, '/me/need', ['methods' => 'POST', 'permission_callback' => $p, 'callback' => 'myf_api_me_need']);
    register_rest_route($ns, '/me/clothing', ['methods' => 'POST', 'permission_callback' => $p, 'callback' => 'myf_api_me_clothing']);
    register_rest_route($ns, '/me/clothing/withdraw', ['methods' => 'POST', 'permission_callback' => $p, 'callback' => 'myf_api_me_clothing_withdraw']);
    register_rest_route($ns, '/me/idea', ['methods' => 'POST', 'permission_callback' => $p, 'callback' => 'myf_api_me_idea']);
    register_rest_route($ns, '/me/idea/withdraw', ['methods' => 'POST', 'permission_callback' => $p, 'callback' => 'myf_api_me_idea_withdraw']);
    register_rest_route($ns, '/me/name', ['methods' => 'POST', 'permission_callback' => $p, 'callback' => 'myf_api_me_name']);
    register_rest_route($ns, '/me/traits', ['methods' => 'POST', 'permission_callback' => $p, 'callback' => 'myf_api_me_traits']);
    register_rest_route($ns, '/me/ics/reset', ['methods' => 'POST', 'permission_callback' => $p, 'callback' => 'myf_api_me_ics_reset']);
});

function myf_api_me() {
    global $wpdb;
    $me = myf_me();
    $s = myf_settings();
    $year = (int) $s['year'];
    $cur = myf_year_data($year, false);

    // Alle eigenen Meldungen über alle Jahre (für Verlauf und Ausbildungsnachweis)
    $rows = $wpdb->get_results($wpdb->prepare(
        'SELECT n.*, c.year AS c_year, c.title AS c_title, c.short AS c_short, c.cat AS c_cat, c.prereq AS c_prereq
         FROM ' . myf_t('needs') . ' n JOIN ' . myf_t('courses') . ' c ON c.id = n.course_id WHERE n.member_id = %d ORDER BY c.year DESC, c.sort', $me->id));
    $dateIds = array_filter(array_map(function ($r) { return (int) $r->date_id; }, $rows));
    $myDates = $dateIds ? $wpdb->get_results('SELECT * FROM ' . myf_t('dates') . ' WHERE id IN (' . implode(',', $dateIds) . ')') : [];
    $needs = [];
    foreach ($rows as $r) {
        $o = myf_need_out($r);
        $o += ['year' => (int) $r->c_year, 'title' => $r->c_title, 'short' => $r->c_short, 'cat' => $r->c_cat, 'prereq' => (string) $r->c_prereq];
        // Für das laufende Jahr erst nach Freigabe zeigen, was entschieden wurde
        if ((int) $r->c_year === $year && !$s['published'] && in_array($r->status, ['assigned', 'waiting', 'declined'], true)) {
            $o['status'] = 'open'; $o['date_id'] = null; $o['admin_note'] = '';
        }
        $needs[] = $o;
    }

    $agt = null;
    if ($me->agt) {
        $log = $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . myf_t('agt_log') . ' WHERE member_id = %d ORDER BY date DESC LIMIT 20', $me->id));
        $agt = ['g26_until' => $me->g26_until, 'course' => isset(myf_agt_course_ids()[(int) $me->id]), 'log' => array_map('myf_agt_log_out', $log),
            'doctor' => function_exists('myf_g26_doctor') ? myf_g26_doctor() : null]; // Betriebsarzt für die G26 (Einstellungen)
    }

    // Kalender: alle feststehenden Lehrgangstermine ab heute (laufendes und nächstes Jahr)
    $today = current_time('Y-m-d');
    $cal = $wpdb->get_results($wpdb->prepare(
        'SELECT d.*, c.title, c.short, c.year FROM ' . myf_t('dates') . ' d JOIN ' . myf_t('courses') . ' c ON c.id = d.course_id
         WHERE c.year > 0 AND c.hidden = 0 AND d.start_date IS NOT NULL AND COALESCE(d.end_date, d.start_date) >= %s ORDER BY d.start_date LIMIT 300', $today));

    return apply_filters('myf_me_data', [
        'member' => ['id' => (int) $me->id, 'name' => $me->name, 'unit' => $me->unit, 'agt' => (bool) $me->agt],
        'personal' => ['birth_date' => $me->birth_date, 'birth_place' => (string) $me->birth_place, 'street' => (string) $me->street, 'phone' => (string) $me->phone, 'rank' => (string) $me->dienstgrad,
            'rank_since' => $me->rank_since ?? null, 'joined' => $me->joined ?? null, 'dept' => (string) ($me->dept ?? ''), 'unit_name' => function_exists('myf_units') ? (myf_units()[$me->unit] ?? $me->unit) : $me->unit],
        // Vorname für die Begrüßung: nach dem Komma, sonst aus dem Konto
        'first_name' => strpos($me->name, ',') !== false ? trim(explode(',', $me->name, 2)[1]) : (string) wp_get_current_user()->first_name,
        'settings' => ['year' => $year, 'deadline' => $s['deadline'], 'open' => (bool) $s['open'], 'published' => (bool) $s['published'],
            'intro' => $s['intro'], 'clothing_open' => (bool) $s['clothing_open'], 'ideas_open' => (bool) $s['ideas_open']],
        'cats' => MYF_CATS, 'units' => myf_units(), 'idea_to' => myf_idea_to(), 'agt_kinds' => MYF_AGT_KINDS, 'clothing_kinds' => MYF_CLOTHING_KINDS,
        'clothing_items' => array_values((array) $s['clothing_items']),
        'courses' => $cur['courses'], 'dates' => $cur['dates'],
        'my_dates' => array_map('myf_date_out', $myDates),
        'needs' => $needs,
        'quals' => array_map('myf_qual_out', $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . myf_t('quals') . ' WHERE member_id = %d ORDER BY year DESC, date DESC', $me->id))),
        'calendar' => array_map(function ($d) {
            return myf_date_out($d) + ['title' => $d->title, 'short' => $d->short, 'year' => (int) $d->year];
        }, $cal),
        'clothing' => array_map('myf_clothing_out', $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . myf_t('clothing') . ' WHERE member_id = %d ORDER BY created DESC', $me->id))),
        'ideas' => array_map('myf_idea_out', $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . myf_t('ideas') . ' WHERE owner_hash = %s ORDER BY created DESC', myf_owner_hash($me->id)))),
        'agt' => $agt,
        'ics' => myf_ics_urls($me),
    ], $me);
}

function myf_api_me_need(WP_REST_Request $req) {
    global $wpdb;
    $me = myf_me();
    $s = myf_settings();
    $on = (bool) $req->get_param('on');
    if ($on && !$s['open']) return myf_err('Die Anmeldung der Lehrgangswünsche ist geschlossen.', 403);
    $courseId = (int) $req->get_param('course_id');
    // Melden nur im Abfragejahr; zurücktreten auch von Lehrgängen anderer Jahre (z. B. nach dem Jahreswechsel)
    $course = $on
        ? $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('courses') . ' WHERE id = %d AND year = %d AND hidden = 0', $courseId, $s['year']))
        : $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('courses') . ' WHERE id = %d AND year > 0', $courseId));
    if (!$course) return myf_err('Unbekannter Lehrgang.', 404);
    $currentYear = (int) $course->year === (int) $s['year'];
    $existing = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('needs') . ' WHERE member_id = %d AND course_id = %d', $me->id, $courseId));
    $comment = sanitize_textarea_field((string) $req->get_param('comment'));

    if (!$on) {
        if (!$existing) return ['ok' => true];
        if (in_array($existing->status, ['completed', 'missed', 'withdrawn', 'declined'], true)) return myf_err('Dieser Lehrgang ist schon abgeschlossen.', 409);
        // Lehrgang schon vorbei (egal welches Jahr): nicht mehr zurücktreten – die Verwaltung trägt „absolviert“ oder „nicht teilgenommen“ ein
        if ($existing->date_id) {
            $end = $wpdb->get_var($wpdb->prepare('SELECT COALESCE(end_date, start_date) FROM ' . myf_t('dates') . ' WHERE id = %d', $existing->date_id));
            if ($end && $end < current_time('Y-m-d')) return myf_err('Der Lehrgang ist schon vorbei – ob du teilgenommen hast, trägt die Verwaltung ein. Stimmt etwas nicht, bitte dort melden.', 409);
        }
        // Offen und nichts entschieden: Meldung verschwindet. Sonst bleibt sie als „zurückgetreten“ sichtbar.
        if ($currentYear && $s['open'] && $existing->status === 'open') {
            $wpdb->delete(myf_t('needs'), ['id' => $existing->id]);
            return ['ok' => true];
        }
        $reason = sanitize_text_field((string) $req->get_param('reason'));
        $wpdb->update(myf_t('needs'), ['status' => 'withdrawn', 'date_id' => null,
            'comment' => trim('Zurückgetreten am ' . current_time('d.m.Y') . ($reason ? ': ' . $reason : ''))], ['id' => $existing->id]);
        // War schon ein Platz zugeteilt bzw. auf der Warteliste: die Lehrgangs-Verwaltung muss nachbesetzen
        if (in_array($existing->status, ['assigned', 'waiting'], true)) myf_notify_area('courses', 'course', $me->name . ' tritt vom Lehrgang ' . ($course->short ?: $course->title) . ' zurück',
            ($existing->status === 'assigned' ? 'Der Platz ist frei – ggf. nachbesetzen.' : 'War auf der Warteliste.') . ($reason ? ' Grund: ' . $reason : ''), 'admin:courses');
        return ['ok' => true, 'id' => (int) $existing->id];
    }
    if ($existing && $existing->status === 'withdrawn') {
        $wpdb->update(myf_t('needs'), ['status' => 'open', 'comment' => $comment], ['id' => $existing->id]);
    } elseif ($existing) {
        // Bemerkung nur ändern, wenn sie mitgeschickt wurde (erneutes Antippen löscht sie nicht)
        if ($req->has_param('comment')) $wpdb->update(myf_t('needs'), ['comment' => $comment], ['id' => $existing->id]);
    } else {
        $wpdb->insert(myf_t('needs'), ['member_id' => $me->id, 'course_id' => $courseId, 'comment' => $comment, 'status' => 'open', 'created' => current_time('mysql')]);
    }
    return ['ok' => true, 'id' => (int) $wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('needs') . ' WHERE member_id = %d AND course_id = %d', $me->id, $courseId))];
}

function myf_api_me_clothing(WP_REST_Request $req) {
    global $wpdb;
    $me = myf_me();
    if (!myf_settings()['clothing_open']) return myf_err('Kleidermeldungen sind gerade geschlossen.', 403);
    $item = sanitize_text_field((string) $req->get_param('item'));
    $comment = sanitize_textarea_field((string) $req->get_param('comment'));
    if ($item === '') return myf_err('Bitte ein Kleidungsstück auswählen.');
    if ($item === 'Sonstiges' && $comment === '') return myf_err('Bitte im Kommentar beschreiben, was du brauchst.');
    $wpdb->insert(myf_t('clothing'), [
        'member_id' => $me->id, 'kind' => isset(MYF_CLOTHING_KINDS[$req->get_param('kind')]) ? $req->get_param('kind') : 'ersatz',
        'item' => $item, 'size' => sanitize_text_field((string) $req->get_param('size')),
        'qty' => max(1, min(20, (int) $req->get_param('qty'))), 'reason' => sanitize_text_field((string) $req->get_param('reason')),
        'comment' => $comment, 'status' => 'open', 'created' => current_time('mysql'),
    ]);
    $id = (int) $wpdb->insert_id;
    myf_notify_area('clothing', 'clothing', 'Kleidermeldung von ' . $me->name, $item . ($req->get_param('size') ? ' (' . sanitize_text_field((string) $req->get_param('size')) . ')' : ''), 'admin:clothing', 'cloth:' . $id);
    return ['id' => $id];
}

function myf_api_me_clothing_withdraw(WP_REST_Request $req) {
    global $wpdb;
    $me = myf_me();
    $row = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('clothing') . ' WHERE id = %d AND member_id = %d', (int) $req->get_param('id'), $me->id));
    if (!$row) return myf_err('Nicht gefunden.', 404);
    if ($row->status !== 'open') return myf_err('Das ist schon in Bearbeitung. Bitte direkt bei der Kleiderkammer melden.', 409);
    $wpdb->update(myf_t('clothing'), ['status' => 'withdrawn'], ['id' => $row->id]);
    return ['ok' => true, 'id' => (int) $row->id];
}

function myf_api_me_idea(WP_REST_Request $req) {
    global $wpdb;
    $me = myf_me();
    if (!myf_settings()['ideas_open']) return myf_err('Anregungen sind gerade geschlossen.', 403);
    $text = sanitize_textarea_field((string) $req->get_param('text'));
    if (mb_strlen(trim($text)) < 5) return myf_err('Bitte deine Anregung kurz beschreiben.');
    $anon = (bool) $req->get_param('anonymous');
    $wpdb->insert(myf_t('ideas'), [
        'member_id' => $anon ? null : $me->id, 'owner_hash' => myf_owner_hash($me->id),
        'recipient' => isset(myf_idea_to()[$req->get_param('recipient')]) ? $req->get_param('recipient') : 'wehr',
        'subject' => sanitize_text_field((string) $req->get_param('subject')), 'text' => $text,
        'status' => 'new', 'created' => current_time('mysql'),
    ]);
    $id = (int) $wpdb->insert_id;
    myf_notify_area('ideas', 'idea', 'Neue Anregung' . ($anon ? ' (anonym)' : ' von ' . $me->name), wp_trim_words((string) $req->get_param('subject') ?: $text, 20), 'admin:ideas', 'idea:' . $id);
    return ['id' => $id];
}

// Eigene Anregung zurückziehen – auch anonyme (erkannt über den geheimen Besitz-Schlüssel)
function myf_api_me_idea_withdraw(WP_REST_Request $req) {
    global $wpdb;
    $me = myf_me();
    $i = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('ideas') . ' WHERE id = %d', (int) $req->get_param('id')));
    if (!$i || !hash_equals((string) $i->owner_hash, myf_owner_hash($me->id))) return myf_err('Nicht gefunden.', 404);
    $wpdb->update(myf_t('ideas'), ['status' => 'withdrawn'], ['id' => $i->id]);
    return ['id' => (int) $i->id];
}

function myf_api_me_ics_reset() {
    global $wpdb;
    $me = myf_me();
    $wpdb->update(myf_t('members'), ['ics_ver' => wp_generate_password(8, false)], ['id' => $me->id]);
    return myf_ics_urls(myf_me());
}

// Eigenen Namen ändern (Nachname, Vorname) – auch im Benutzerkonto
// Eigene Angaben selbst aktuell halten: Führerscheine, Beruf & Fachkunde, Sonstiges, Tätigkeit, tagsüber verfügbar.
// Funktionen (Wehrführung, Gerätewart …) und alles, woran Rechte hängen, setzt nur die Verwaltung.
function myf_api_me_traits(WP_REST_Request $req) {
    global $wpdb;
    $me = myf_me();
    $allowed = [];
    foreach (myf_traits() as $t) if (myf_trait_self_ok((int) $t['id'], $t['cat'])) $allowed[] = (int) $t['id'];
    if ($req->has_param('trait_ids')) {
        $want = array_values(array_intersect($allowed, array_map('intval', (array) $req->get_param('trait_ids'))));
        if ($allowed) $wpdb->query($wpdb->prepare('DELETE FROM ' . myf_t('member_traits') . ' WHERE member_id = %d AND trait_id IN (' . implode(',', $allowed) . ')' . ($want ? ' AND trait_id NOT IN (' . implode(',', $want) . ')' : ''), $me->id));
        foreach ($want as $tid) $wpdb->query($wpdb->prepare('INSERT IGNORE INTO ' . myf_t('member_traits') . ' (member_id, trait_id) VALUES (%d, %d)', $me->id, $tid));
    }
    // Fehlender Beruf / Fachkunde / Sonstiges: Mitglied ergänzt die Liste selbst (Verwaltung wird informiert)
    if ($req->has_param('add')) {
        $cat = (string) $req->get_param('add_cat');
        $name = trim(preg_replace('/\s+/u', ' ', sanitize_text_field((string) $req->get_param('add'))));
        if (!in_array($cat, ['fach', 'sonst'], true)) return myf_err('Diese Liste kann nur die Verwaltung erweitern.');
        if (mb_strlen($name) < 2 || mb_strlen($name) > 60 || !preg_match('/\p{L}/u', $name)) return myf_err('Bitte eine kurze Bezeichnung (2–60 Zeichen).');
        $tid = 0;
        foreach (myf_traits() as $t) if ($t['cat'] === $cat && mb_strtolower($t['name']) === mb_strtolower($name)) $tid = (int) $t['id'];
        if (!$tid) {
            $today = (int) $wpdb->get_var($wpdb->prepare('SELECT COUNT(*) FROM ' . myf_t('audit') . " WHERE action = 'me/traits' AND actor_id = %d AND ts >= %s AND data LIKE %s", $me->id, current_time('Y-m-d'), '%"add"%'));
            if ($today >= 10) return myf_err('Für heute reicht es – die Verwaltung kann weitere Einträge anlegen.');
            $wpdb->insert(myf_t('traits'), ['name' => $name, 'cat' => $cat, 'sort' => 900]);
            $tid = (int) $wpdb->insert_id;
            myf_notify_area('members', 'trait', 'Neuer Eintrag „' . $name . '“ (' . (MYF_TRAIT_CATS[$cat] ?? $cat) . ')', 'ergänzt von ' . $me->name . ' – bei Bedarf unter Mitglieder → Merkmale umbenennen oder zusammenlegen', 'admin:members');
        }
        $wpdb->query($wpdb->prepare('INSERT IGNORE INTO ' . myf_t('member_traits') . ' (member_id, trait_id) VALUES (%d, %d)', $me->id, $tid));
        return ['ok' => true, 'id' => $tid];
    }
    $upd = [];
    if ($req->has_param('employment') && isset(myf_list('employment')[$req->get_param('employment')])) $upd['employment'] = $req->get_param('employment');
    if ($req->has_param('day_available')) $upd['day_available'] = max(0, min(3, (int) $req->get_param('day_available')));
    if ($upd) $wpdb->update(myf_t('members'), $upd, ['id' => $me->id]);
    return ['ok' => true];
}

function myf_api_me_name(WP_REST_Request $req) {
    global $wpdb;
    $me = myf_me();
    $last = sanitize_text_field((string) $req->get_param('last'));
    $first = sanitize_text_field((string) $req->get_param('first'));
    if ($last === '') return myf_err('Bitte den Nachnamen eintragen.');
    $name = $last . ($first !== '' ? ', ' . $first : '');
    if ($wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('members') . ' WHERE name = %s AND id <> %d', $name, $me->id))) return myf_err('Diesen Namen gibt es schon – bitte bei der Wehrführung melden.');
    $upd = ['name' => $name];
    // Angaben für die Arbeitgeber-Bescheinigung (sehen nur Einsatzführung und Verwaltung)
    if ($req->has_param('birth_date')) $upd['birth_date'] = myf_date_or_null($req->get_param('birth_date'));
    foreach (['birth_place' => 80, 'street' => 120, 'phone' => 40] as $k => $len) if ($req->has_param($k)) $upd[$k] = mb_substr(sanitize_text_field((string) $req->get_param($k)), 0, $len);
    $wpdb->update(myf_t('members'), $upd, ['id' => $me->id]);
    $u = wp_get_current_user();
    if (!user_can($u, 'edit_posts')) wp_update_user(['ID' => $u->ID, 'first_name' => $first, 'last_name' => $last, 'display_name' => trim($first . ' ' . $last)]);
    return ['id' => (int) $me->id];
}

// Bekannte Lehrgangsbezeichnungen (alle Lehrgangsjahre, Vorlagen, frühere Nachträge und die üblichen Lehrgänge in NRW)
// – für die Suche beim Nachtragen, damit Bezeichnung und Kürzel einheitlich sind (z. B. wird „AGT“ als Atemschutz-Lehrgang erkannt)
function myf_course_titles() {
    global $wpdb;
    $out = [];
    $add = function ($title, $short) use (&$out) {
        $title = trim((string) $title); if ($title === '') return;
        $k = mb_strtolower($title); if (!isset($out[$k]) || ($out[$k]['short'] === '' && $short !== '')) $out[$k] = ['title' => $title, 'short' => trim((string) $short)];
    };
    foreach ([['Truppmann Teil 1', 'TM1'], ['Truppmann Teil 2', 'TM2'], ['Truppführer', 'TF'], ['Atemschutzgeräteträger', 'AGT'], ['Maschinist', 'MA'], ['Sprechfunker', 'SPRF'],
        ['Gruppenführer', 'F III'], ['Zugführer', 'F IV'], ['Verbandsführer', 'F V'], ['Atemschutzgerätewart', 'AGW'], ['ABC-Einsatz', 'ABC I'], ['Technische Hilfeleistung', 'TH'],
        ['Motorsägenführer', 'MS'], ['Sanitätsausbildung', 'San'], ['Erste Hilfe', 'EH'], ['Leiter einer Feuerwehr', 'LdF'], ['Ausbilder in der Feuerwehr', 'AiF'], ['Brandschutzerziehung', 'BSE']] as $x) $add($x[0], $x[1]);
    foreach ($wpdb->get_results('SELECT title, short FROM ' . myf_t('courses') . ' ORDER BY year DESC') as $c) $add($c->title, $c->short);
    foreach ($wpdb->get_results('SELECT DISTINCT title, short FROM ' . myf_t('quals')) as $q) $add($q->title, $q->short);
    $out = array_values($out);
    usort($out, function ($a, $b) { return strcmp(mb_strtolower($a['title']), mb_strtolower($b['title'])); });
    return $out;
}
add_filter('myf_me_data', function ($data) { $data['course_titles'] = myf_course_titles(); return $data; }, 35);
add_filter('myf_admin_state', function ($d) { $d['course_titles'] = myf_course_titles(); return $d; }, 35);
