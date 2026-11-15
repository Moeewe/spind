<?php
/**
 * Offene Schnittstellen: Export jedes Bereichs als Tabelle (CSV/Excel), Import von Listen (CSV aus Excel),
 * Kalender-Import (ICS) als Übungen/Dienste und Wiederherstellen einer Datensicherung (z. B. auf einem Notfall-Server).
 * Export/Import nur für die eigenen Verwaltungsbereiche.
 */

defined('ABSPATH') || exit;

// Datensätze: Bereich => [Titel, Funktion die [Kopfzeile, Zeilen] liefert]
function myf_export_sets() {
    global $wpdb;
    $T = 'myf_t';
    $mem = function () use ($wpdb) { $o = []; foreach ($wpdb->get_results('SELECT id, name FROM ' . myf_t('members')) as $m) $o[(int) $m->id] = $m->name; return $o; };
    $split = function ($n) { $p = array_map('trim', explode(',', (string) $n, 2)); return [$p[0], $p[1] ?? '']; };
    return [
        'members' => ['members', 'Mitglieder', function () use ($wpdb, $split) {
            $rows = [];
            foreach ($wpdb->get_results('SELECT * FROM ' . myf_t('members') . ' ORDER BY name') as $m) {
                $u = $m->user_id ? get_userdata((int) $m->user_id) : null;
                [$l, $f] = $split($m->name);
                $traits = implode(', ', $wpdb->get_col($wpdb->prepare('SELECT t.name FROM ' . myf_t('member_traits') . ' mt JOIN ' . myf_t('traits') . ' t ON t.id = mt.trait_id WHERE mt.member_id = %d ORDER BY t.sort', $m->id)));
                $rows[] = [$l, $f, myf_units()[$m->unit] ?? $m->unit, $u ? $u->user_email : '', $m->active ? 'ja' : 'nein', $m->dienstgrad, $m->birth_date, $m->birth_place, $m->street, $m->phone, $traits, $m->employment, $m->day_available ? 'ja' : ''];
            }
            return [['Nachname', 'Vorname', 'Löschzug', 'E-Mail', 'aktiv', 'Dienstgrad', 'Geburtsdatum', 'Geburtsort', 'Straße', 'Handy', 'Funktionen & Merkmale', 'Tätigkeit', 'tagsüber verfügbar'], $rows];
        }],
        'training' => ['courses', 'Ausbildung (alle Lehrgänge je Person)', function () use ($wpdb, $mem, $split) {
            $m = $mem(); $rows = [];
            foreach ($wpdb->get_results('SELECT n.member_id, c.year, c.title, c.short, d.start_date, d.end_date, d.location FROM ' . myf_t('needs') . ' n JOIN ' . myf_t('courses') . ' c ON c.id = n.course_id LEFT JOIN ' . myf_t('dates') . " d ON d.id = n.date_id WHERE n.status = 'completed'") as $r) {
                [$l, $f] = $split($m[(int) $r->member_id] ?? ''); $rows[] = [$l, $f, $r->title, $r->short, $r->year, $r->start_date, $r->end_date, $r->location, 'SPIND'];
            }
            foreach ($wpdb->get_results('SELECT * FROM ' . myf_t('quals')) as $q) { [$l, $f] = $split($m[(int) $q->member_id] ?? ''); $rows[] = [$l, $f, $q->title, $q->short, $q->year, $q->date, '', $q->note, 'nachgetragen']; }
            return [['Nachname', 'Vorname', 'Lehrgang', 'Kurz', 'Jahr', 'von', 'bis', 'Ort / Bemerkung', 'Quelle'], $rows];
        }],
        'needs' => ['courses', 'Lehrgangsmeldungen (alle Jahre)', function () use ($wpdb, $mem) {
            $m = $mem(); $rows = [];
            foreach ($wpdb->get_results('SELECT n.*, c.year, c.title FROM ' . myf_t('needs') . ' n JOIN ' . myf_t('courses') . ' c ON c.id = n.course_id ORDER BY c.year DESC, c.title') as $r) $rows[] = [$r->year, $r->title, $m[(int) $r->member_id] ?? '', $r->status, $r->comment, $r->admin_note];
            return [['Jahr', 'Lehrgang', 'Name', 'Status', 'Bemerkung', 'Hinweis Verwaltung'], $rows];
        }],
        'incidents' => ['incidents', 'Einsätze & Übungen mit Beteiligung', function () use ($wpdb, $mem) {
            $m = $mem(); $rows = [];
            foreach ($wpdb->get_results('SELECT i.*, p.member_id, p.vehicle, p.t_start, p.t_end, p.as_minutes, p.confirmed FROM ' . myf_t('incidents') . ' i LEFT JOIN ' . myf_t('participation') . ' p ON p.incident_id = i.id ORDER BY i.start DESC') as $r)
                $rows[] = [$r->start, $r->end, $r->kind === 'uebung' ? 'Übung' : 'Einsatz', $r->nr, $r->title, $r->place, $r->member_id ? ($m[(int) $r->member_id] ?? '') : '', $r->vehicle, $r->t_start, $r->t_end, $r->as_minutes ?: '', $r->confirmed ? 'ja' : ''];
            return [['Beginn', 'Ende', 'Art', 'Nummer', 'Stichwort', 'Ort', 'Name', 'Fahrzeug', 'von', 'bis', 'AS-Minuten', 'bestätigt'], $rows];
        }],
        'agt' => ['agt', 'Atemschutz: Geräteträger & Nachweise', function () use ($wpdb, $mem) {
            $m = $mem(); $rows = [];
            foreach ($wpdb->get_results('SELECT * FROM ' . myf_t('agt_log') . ' ORDER BY date DESC') as $l) $rows[] = [$m[(int) $l->member_id] ?? '', $l->date, MYF_AGT_KINDS[$l->kind] ?? $l->kind, $l->note];
            foreach ($wpdb->get_results('SELECT name, g26_until FROM ' . myf_t('members') . ' WHERE agt = 1') as $x) $rows[] = [$x->name, $x->g26_until, 'G26 gültig bis', ''];
            return [['Name', 'Datum', 'Art', 'Bemerkung'], $rows];
        }],
        'devices' => ['agt', 'Atemschutzwerkstatt: Geräte & Prüfungen', function () use ($wpdb) {
            $rules = myf_as_rules(); $rows = [];
            foreach ($wpdb->get_results('SELECT d.*, c.kind, c.date AS cdate, c.result, c.tester, c.values_text, c.by_name, c.storno_of FROM ' . myf_t('devices') . ' d LEFT JOIN ' . myf_t('device_checks') . ' c ON c.device_id = d.id ORDER BY d.type, d.nr, c.date') as $r)
                $rows[] = [$rules[$r->type]['label'] ?? $r->type, $r->nr, $r->serial, $r->maker, $r->model, $r->built, $r->location, MYF_DEVICE_STATUS[$r->status] ?? $r->status, $r->cdate,
                    $r->kind ? ($rules[$r->type]['kinds'][$r->kind][0] ?? $r->kind) : '', $r->result === 'nok' ? 'n. i. O.' : ($r->kind ? 'i. O.' : ''), $r->tester, $r->values_text, $r->by_name, $r->storno_of ? 'Storno' : ''];
            return [['Art', 'Nr', 'Seriennummer', 'Hersteller', 'Modell', 'Baujahr', 'Standort', 'Status', 'Prüfdatum', 'Prüfung', 'Ergebnis', 'Prüfgerät', 'Messwerte', 'Prüfer', 'Storno'], $rows];
        }],
        'vehicles' => ['vehicles', 'Fahrzeuge, Fristen & Verlauf', function () use ($wpdb) {
            $rows = [];
            foreach ($wpdb->get_results('SELECT v.name, v.plate, v.callsign, t.title, t.interval_months, t.last_date, t.due_date FROM ' . myf_t('vehicles') . ' v LEFT JOIN ' . myf_t('vehicle_tasks') . ' t ON t.vehicle_id = v.id ORDER BY v.name') as $r)
                $rows[] = [$r->name, $r->plate, $r->callsign, 'Frist', $r->title, $r->interval_months, $r->last_date, $r->due_date, '', ''];
            foreach ($wpdb->get_results('SELECT l.*, v.name FROM ' . myf_t('vehicle_log') . ' l LEFT JOIN ' . myf_t('vehicles') . ' v ON v.id = l.vehicle_id ORDER BY l.date DESC') as $r)
                $rows[] = [$r->name ?: 'allgemein', '', '', MYF_VLOG_KINDS[$r->kind] ?? $r->kind, $r->title, '', $r->date, '', $r->cost, $r->vendor];
            return [['Fahrzeug', 'Kennzeichen', 'Funkrufname', 'Art', 'Bezeichnung', 'Frist (Monate)', 'Datum / zuletzt', 'fällig', 'Kosten', 'Firma'], $rows];
        }],
        'stock' => ['clothing', 'Kleidung: Ausstattung je Person', function () use ($wpdb, $mem) {
            $m = $mem(); $rows = [];
            foreach ($wpdb->get_results('SELECT * FROM ' . myf_t('cloth_stock') . ' ORDER BY item_name') as $s) $rows[] = [$m[(int) $s->member_id] ?? '', $s->item_name, $s->size, $s->qty, $s->issued, $s->serial, $s->made_year, $s->status, $s->note];
            return [['Name', 'Teil', 'Größe', 'Anzahl', 'ausgegeben', 'Nr', 'Baujahr', 'Status', 'Notiz'], $rows];
        }],
        'defects' => ['defects', 'Mängel', function () use ($wpdb) {
            $rows = [];
            foreach ($wpdb->get_results('SELECT * FROM ' . myf_t('defects') . ' ORDER BY created DESC') as $x) $rows[] = [$x->created, $x->object, $x->urgency, $x->title, $x->text, $x->status, $x->answer];
            return [['gemeldet', 'Fahrzeug / Bereich', 'Dringlichkeit', 'Titel', 'Beschreibung', 'Status', 'Rückmeldung'], $rows];
        }],
        'duties' => ['duties', 'Dienstpläne', function () use ($wpdb) {
            $rows = [];
            foreach ($wpdb->get_results('SELECT l.title, s.date, s.label, s.time_from, m.name FROM ' . myf_t('duty_slots') . ' s JOIN ' . myf_t('duty_lists') . ' l ON l.id = s.list_id LEFT JOIN ' . myf_t('duty_assign') . ' a ON a.slot_id = s.id LEFT JOIN ' . myf_t('members') . ' m ON m.id = a.member_id ORDER BY l.title, s.date') as $r)
                $rows[] = [$r->title, $r->date, $r->label, $r->time_from, $r->name];
            return [['Dienstplan', 'Datum', 'Termin', 'Uhrzeit', 'Name'], $rows];
        }],
        'ideas' => ['ideas', 'Anregungen (ohne Absender bei anonymen)', function () use ($wpdb, $mem) {
            $m = $mem(); $rows = [];
            foreach ($wpdb->get_results('SELECT * FROM ' . myf_t('ideas') . ' ORDER BY created DESC') as $i) $rows[] = [$i->created, $i->member_id ? ($m[(int) $i->member_id] ?? '') : 'anonym', $i->recipient, $i->subject, $i->text, $i->status, $i->answer];
            return [['Datum', 'von', 'an', 'Betreff', 'Text', 'Status', 'Antwort'], $rows];
        }],
    ];
}

add_action('rest_api_init', function () {
    $ns = 'myf/v1';
    register_rest_route($ns, '/admin/export', ['methods' => 'GET', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
        $sets = myf_export_sets();
        $want = (string) $req->get_param('set');
        if ($want === 'list') return array_values(array_map(function ($k) use ($sets) { return ['key' => $k, 'title' => $sets[$k][1]]; },
            array_filter(array_keys($sets), function ($k) use ($sets) { return myf_has_area($sets[$k][0]); })));
        if (!isset($sets[$want]) || !myf_has_area($sets[$want][0])) return myf_err('Dieser Export gehört nicht zu deinem Bereich.', 403);
        [$head, $rows] = $sets[$want][2]();
        myf_audit_write('admin', get_current_user_id(), myf_actor(), 'admin/export', '', null, ['set' => $want, 'rows' => count($rows)]);
        return ['title' => $sets[$want][1], 'head' => $head, 'rows' => $rows];
    }]);

    // Import: Zeilen aus CSV/Excel (vom Browser gelesen) – je Art eigene Prüfung
    register_rest_route($ns, '/admin/import', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => 'myf_api_import']);

    // Kalender-Import: Termine aus dem Dashboard-Kalender (Alamos) oder aus einer ICS-Datei als Vorschau
    register_rest_route($ns, '/admin/import/ics', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
        if ($req->get_param('text')) $ev = myf_ical_parse((string) $req->get_param('text'));
        else { delete_transient('myf_ical_cache'); $ev = myf_ical_events(); }
        $from = date('c', current_time('timestamp') - 60 * DAY_IN_SECONDS);
        return array_values(array_map(function ($e) { return ['title' => $e['title'], 'place' => $e['location'], 'start' => substr(str_replace('T', ' ', $e['start']), 0, 16), 'end' => substr(str_replace('T', ' ', $e['end']), 0, 16), 'allday' => $e['allday']]; },
            array_filter($ev, function ($e) use ($from) { return $e['start'] >= $from; })));
    }]);

    // Wiederherstellen einer Datensicherung (nur Administratoren) – ersetzt alle Daten dieses Systems
    register_rest_route($ns, '/admin/restore', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        if ($req->get_param('confirm') !== 'WIEDERHERSTELLEN') return myf_err('Bitte zur Bestätigung WIEDERHERSTELLEN eingeben.');
        if (myf_demo_ctx()) return myf_err('Im Demo-Bestand nicht möglich – bitte zurück zu den echten Daten.');
        $b = $req->get_param('backup');
        if (!is_array($b) || ($b['plugin'] ?? '') !== 'myfeuerwehr' || !is_array($b['tables'] ?? null)) return myf_err('Das ist keine gültige Datensicherung.');
        // Vorher den aktuellen Stand archivieren – nichts geht verloren; Protokoll und Archiv bleiben unangetastet
        $before = myf_archive_create('Vor dem Einspielen einer Sicherung vom ' . substr((string) ($b['created'] ?? ''), 0, 10));
        $tables = [];
        foreach ($b['tables'] as $short => $rows) { $short = preg_replace('/[^a-z0-9_]/', '', (string) $short); if (strpos($short, 'ffl_') === 0 && strpos($short, 'ffl_demo_') !== 0) $tables[$short] = $rows; }
        $n = myf_tables_restore($tables);
        return ['rows' => $n, 'archive_before' => $before];
    }]);
});

function myf_api_import(WP_REST_Request $req) {
    global $wpdb;
    $set = (string) $req->get_param('set');
    $rows = (array) $req->get_param('rows');
    $need = ['quals' => 'courses', 'devices' => 'agt', 'vehicles' => 'vehicles', 'stock' => 'clothing', 'events' => 'incidents', 'g26' => 'agt'][$set] ?? null;
    if (!$need || !myf_has_area($need)) return myf_err('Dieser Import gehört nicht zu deinem Bereich.', 403);
    $byName = [];
    foreach ($wpdb->get_results('SELECT id, name FROM ' . myf_t('members')) as $m) $byName[mb_strtolower(trim($m->name))] = (int) $m->id;
    $findMember = function ($r) use ($byName) {
        $n = isset($r['name']) && $r['name'] !== '' ? $r['name'] : trim(($r['last'] ?? '') . (($r['first'] ?? '') !== '' ? ', ' . $r['first'] : ''));
        return $byName[mb_strtolower(trim($n))] ?? null;
    };
    $added = 0; $skipped = 0; $errors = [];
    foreach ($rows as $i => $r) {
        $r = array_map(function ($v) { return is_string($v) ? trim($v) : $v; }, (array) $r);
        $line = 'Zeile ' . ($i + 2);
        if ($set === 'quals') {
            $mid = $findMember($r); if (!$mid) { $errors[] = "$line: Person nicht gefunden"; continue; }
            $title = sanitize_text_field((string) ($r['title'] ?? '')); if ($title === '') { $skipped++; continue; }
            $year = (int) ($r['year'] ?? 0); $date = myf_date_or_null(myf_de_date($r['date'] ?? ''));
            if ($wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('quals') . ' WHERE member_id = %d AND title = %s AND COALESCE(year,0) = %d', $mid, $title, $year))) { $skipped++; continue; }
            $wpdb->insert(myf_t('quals'), ['member_id' => $mid, 'title' => $title, 'short' => sanitize_text_field((string) ($r['short'] ?? '')), 'year' => $year > 1900 ? $year : null, 'date' => $date, 'note' => sanitize_text_field((string) ($r['note'] ?? 'importiert'))]);
            $added++;
        } elseif ($set === 'devices') {
            $types = []; foreach (myf_as_rules() as $k => $t) { $types[mb_strtolower($t['label'])] = $k; $types[$k] = $k; }
            $type = $types[mb_strtolower((string) ($r['type'] ?? ''))] ?? (preg_match('/mask/i', (string) ($r['type'] ?? '')) ? 'maske' : (preg_match('/lunge|la\b/i', (string) ($r['type'] ?? '')) ? 'la' : (preg_match('/flasch/i', (string) ($r['type'] ?? '')) ? 'flasche' : (preg_match('/press|pa\b/i', (string) ($r['type'] ?? '')) ? 'pa' : null))));
            $nr = sanitize_text_field((string) ($r['nr'] ?? ''));
            if (!$type || $nr === '') { $errors[] = "$line: Art oder Nummer fehlt"; continue; }
            if ($wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('devices') . ' WHERE type = %s AND nr = %s', $type, $nr))) { $skipped++; continue; }
            $wpdb->insert(myf_t('devices'), ['type' => $type, 'nr' => $nr, 'serial' => sanitize_text_field((string) ($r['serial'] ?? '')), 'maker' => sanitize_text_field((string) ($r['maker'] ?? '')),
                'model' => sanitize_text_field((string) ($r['model'] ?? '')), 'built' => substr(sanitize_text_field((string) ($r['built'] ?? '')), 0, 7), 'location' => sanitize_text_field((string) ($r['location'] ?? '')),
                'test_due' => myf_date_or_null(myf_de_date($r['test_due'] ?? '')), 'status' => 'ready', 'created' => current_time('mysql')]);
            $added++;
        } elseif ($set === 'vehicles') {
            $name = sanitize_text_field((string) ($r['name'] ?? '')); if ($name === '') { $skipped++; continue; }
            if ($wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('vehicles') . ' WHERE name = %s', $name))) { $skipped++; continue; }
            $wpdb->insert(myf_t('vehicles'), ['name' => $name, 'plate' => sanitize_text_field((string) ($r['plate'] ?? '')), 'callsign' => sanitize_text_field((string) ($r['callsign'] ?? '')),
                'unit' => myf_unit_guess($r['unit'] ?? ''), 'built' => substr((string) ($r['built'] ?? ''), 0, 4), 'created' => current_time('mysql')]);
            $vid = (int) $wpdb->insert_id; foreach (MYF_VEHICLE_TASKS as $t) $wpdb->insert(myf_t('vehicle_tasks'), ['vehicle_id' => $vid, 'title' => $t[0], 'interval_months' => $t[1]]);
            $added++;
        } elseif ($set === 'stock') {
            $mid = $findMember($r); if (!$mid) { $errors[] = "$line: Person nicht gefunden"; continue; }
            $item = sanitize_text_field((string) ($r['item'] ?? '')); if ($item === '') { $skipped++; continue; }
            $iid = $wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('cloth_items') . ' WHERE name = %s', $item));
            $wpdb->insert(myf_t('cloth_stock'), ['member_id' => $mid, 'item_id' => $iid ?: null, 'item_name' => $item, 'size' => sanitize_text_field((string) ($r['size'] ?? '')),
                'qty' => max(1, (int) ($r['qty'] ?? 1)), 'issued' => myf_date_or_null(myf_de_date($r['issued'] ?? '')), 'serial' => sanitize_text_field((string) ($r['serial'] ?? '')),
                'status' => 'in_use', 'note' => 'importiert', 'created' => current_time('mysql')]);
            $added++;
        } elseif ($set === 'g26') {
            $mid = $findMember($r); if (!$mid) { $errors[] = "$line: Person nicht gefunden"; continue; }
            $d = myf_date_or_null(myf_de_date($r['g26'] ?? ''));
            $wpdb->update(myf_t('members'), ['agt' => 1] + ($d ? ['g26_until' => $d] : []), ['id' => $mid]);
            if ($d) $wpdb->insert(myf_t('agt_log'), ['member_id' => $mid, 'date' => current_time('Y-m-d'), 'kind' => 'g26', 'note' => 'gültig bis ' . date('d.m.Y', strtotime($d)) . ' · per Import (Liste)', 'by_name' => myf_actor()]);
            // Nachweise aus der Jahresliste: Übungsstrecke (auch „Strecke 1“/„Strecke 2“) und Übung/Einsatz unter Atemschutz.
            // Eine Zelle darf mehrere Termine enthalten („07.04.2026, 11.04.2026“); ein Zusatz wie „25min“ wird Notiz. Vorhandenes bleibt.
            foreach (['strecke' => 'strecke', 'strecke1' => 'strecke', 'strecke2' => 'strecke', 'uebung' => 'uebung'] as $col => $kind) {
                $cell = (string) ($r[$col] ?? '');
                if (!preg_match_all('/\b(\d{1,2}\.\d{1,2}\.\d{2,4})\b/', $cell, $mm)) continue;
                $rest = trim(preg_replace('/\s+/', ' ', str_replace($mm[1], '', $cell)), " ,;/+");
                foreach ($mm[1] as $raw) {
                    $day = myf_date_or_null(myf_de_date($raw));
                    if (!$day || !checkdate((int) substr($day, 5, 2), (int) substr($day, 8, 2), (int) substr($day, 0, 4))) continue;
                    if ($wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('agt_log') . ' WHERE member_id = %d AND kind = %s AND date = %s', $mid, $kind, $day))) continue;
                    $wpdb->insert(myf_t('agt_log'), ['member_id' => $mid, 'kind' => $kind, 'date' => $day, 'note' => mb_substr('importiert' . ($rest !== '' ? ' · ' . sanitize_text_field($rest) : ''), 0, 255), 'by_name' => myf_actor()]);
                }
            }
            $added++;
        } elseif ($set === 'events') {
            // Kalendertermine (ICS) als Übungen/Dienste übernehmen – damit danach „Ich war dabei“ geht
            $start = myf_dt_param($r['start'] ?? ''); $title = sanitize_text_field((string) ($r['title'] ?? ''));
            if (!$start || $title === '') { $skipped++; continue; }
            if ($wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('incidents') . ' WHERE start = %s AND title = %s', $start, $title))) { $skipped++; continue; }
            $wpdb->insert(myf_t('incidents'), ['kind' => 'uebung', 'title' => $title, 'category' => 'sonst', 'start' => $start, 'end' => myf_dt_param($r['end'] ?? ''),
                'place' => sanitize_text_field((string) ($r['place'] ?? '')), 'source' => 'kalender', 'created' => current_time('mysql'), 'created_by' => myf_actor()]);
            $added++;
        }
    }
    return ['added' => $added, 'skipped' => $skipped, 'errors' => array_slice($errors, 0, 20)];
}

// 31.12.2026 / 2026-12-31 → 2026-12-31
function myf_de_date($v) {
    $v = trim((string) $v);
    if (preg_match('/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/', $v, $m)) return sprintf('%04d-%02d-%02d', strlen($m[3]) === 2 ? 2000 + (int) $m[3] : (int) $m[3], $m[2], $m[1]);
    return $v;
}
