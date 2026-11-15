<?php
/**
 * Erweiterter Demo-Bestand: füllt alle Bereiche, damit sich Wehrwerk vollständig vorführen lässt –
 * mehrere Jahre Einsätze mit Berichten (abgeschlossen, Entwurf, auf Papier), Atemschutz (G26, Strecke, Überwachung, Geräte),
 * Lehrgänge, Unterweisungen, Leihkleidung, Mitgliedschaft, Meldungen und beide Postfächer.
 * Läuft nur im Demo-Kontext (Tabellen …ffl_demo_*) – echte Daten werden nie berührt.
 */

defined('ABSPATH') || exit;

function myf_demo_more($mid, $vid, $e1, $e2, $unit, $now) {
    global $wpdb;
    if (!myf_demo_ctx()) return; // Schutz: niemals in echte Tabellen schreiben
    mt_srand(4711);
    $day = function ($d) use ($now) { return date('Y-m-d', $now + $d * 86400); };
    $at = function ($d, $hm = '18:00') use ($now) { return date('Y-m-d', $now + $d * 86400) . ' ' . $hm . ':00'; };
    $m = function ($n) use ($mid) { return $mid[$n] ?? 0; };
    $names = array_keys($mid);
    $year = (int) date('Y', $now);
    $report = function ($vals) { return myf_enc(wp_json_encode($vals + ['_form' => myf_report_form_keep(myf_report_form())])); };

    // ---- Mitglieder: Eintritt, Geburtsdaten, Atemschutz, Mitgliedschaftsverlauf ----
    $agt = ['Albers, Jan', 'Elsing, Paul', 'Hemsing, Lukas', 'Kemper, Jonas', 'Lammers, Sophie', 'Nienhaus, Felix', 'Schmitz, Tobias', 'Wessels, Max'];
    foreach ($names as $k => $n) {
        $joined = date('Y-m-d', strtotime((2004 + ($k * 7) % 19) . '-' . sprintf('%02d', 1 + $k % 12) . '-01'));
        $upd = ['joined' => $joined, 'mstatus' => 'aktiv', 'birth_date' => (1972 + ($k * 3) % 30) . '-' . sprintf('%02d-%02d', 1 + ($k * 5) % 12, 1 + ($k * 7) % 27),
            'birth_place' => ['Musterstadt', 'Neustadt', 'Altdorf', 'Bergheim', 'Seedorf'][$k % 5], 'street' => ['Am Markt', 'Kirchstraße', 'Bahnhofstraße', 'Dorfstraße'][$k % 4] . ' ' . (3 + $k),
            'phone' => '0170 000' . sprintf('%04d', 1000 + $k * 37)];
        // Größen (helfen Kleiderkammer und Leihkleidung) – bei den meisten eingetragen
        if ($k % 4 !== 3) $upd['sizes'] = wp_json_encode(['jacke' => ['48', '50', '52', '54', '56'][$k % 5], 'hose' => ['48', '50', '52', '54'][$k % 4], 'schuh' => (string) (39 + $k % 8), 'kopf' => (string) (55 + $k % 5), 'hand' => (string) (8 + $k % 4), 'shirt' => ['M', 'L', 'XL'][$k % 3]]);
        if (in_array($n, $agt, true)) {
            $i = array_search($n, $agt, true);
            // G26: zwei bald fällig, eine abgelaufen, der Rest gültig
            $upd['agt'] = 1; $upd['g26_until'] = $i === 0 ? $day(25) : ($i === 1 ? $day(-12) : ($i === 2 ? $day(50) : $day(200 + $i * 60)));
        }
        $wpdb->update(myf_t('members'), $upd, ['id' => $mid[$n]]);
        $wpdb->insert(myf_t('member_history'), ['member_id' => $mid[$n], 'date' => $joined, 'kind' => 'eintritt', 'note' => $k % 3 ? '' : 'aus der Jugendfeuerwehr', 'by_name' => 'Demo', 'created' => current_time('mysql')]);
    }
    if ($m('Brüggemann, Tim')) {
        $wpdb->insert(myf_t('member_history'), ['member_id' => $m('Brüggemann, Tim'), 'date' => ($year - 2) . '-02-01', 'kind' => 'pause', 'note' => 'Studium auswärts', 'by_name' => 'Demo', 'created' => current_time('mysql')]);
        $wpdb->insert(myf_t('member_history'), ['member_id' => $m('Brüggemann, Tim'), 'date' => ($year - 1) . '-09-01', 'kind' => 'rueckkehr', 'note' => '', 'by_name' => 'Demo', 'created' => current_time('mysql')]);
    }
    // Ein ausgetretenes Mitglied (Archiv, nicht gelöscht)
    $wpdb->insert(myf_t('members'), ['name' => 'Hüsing, Clara', 'unit' => $unit, 'active' => 0, 'mstatus' => 'ausgetreten', 'dienstgrad' => 'OFM', 'dept' => 'einsatz', 'joined' => '2012-04-01', 'note' => 'Demo']);
    $ex = (int) $wpdb->insert_id;
    $wpdb->insert(myf_t('member_history'), ['member_id' => $ex, 'date' => '2012-04-01', 'kind' => 'eintritt', 'note' => '', 'by_name' => 'Demo', 'created' => current_time('mysql')]);
    $wpdb->insert(myf_t('member_history'), ['member_id' => $ex, 'date' => ($year - 1) . '-06-30', 'kind' => 'austritt', 'note' => 'Umzug nach Münster – Daten sollen bleiben', 'by_name' => 'Demo', 'created' => current_time('mysql')]);

    // ---- Atemschutz-Nachweise ----
    foreach ($agt as $i => $n) {
        if (!$m($n)) continue;
        $wpdb->insert(myf_t('agt_log'), ['member_id' => $m($n), 'date' => $day(-300 + $i * 20), 'kind' => 'g26', 'note' => 'G26.3 – Betriebsarzt', 'by_name' => 'Demo']);
        // Übungsstrecke: zwei überfällig (> 1 Jahr), Rest im Jahr
        $wpdb->insert(myf_t('agt_log'), ['member_id' => $m($n), 'date' => $i < 2 ? $day(-400 - $i * 10) : $day(-90 - $i * 15), 'kind' => 'strecke', 'note' => 'Übungsstrecke Kreis', 'by_name' => 'Demo']);
        $wpdb->insert(myf_t('agt_log'), ['member_id' => $m($n), 'date' => $day(-60 - $i * 9), 'kind' => 'unterweisung', 'note' => 'Jahresunterweisung Atemschutz', 'by_name' => 'Demo']);
    }

    // ---- Einsätze und Übungen über drei Jahre (Liste, Jahre, Seiten, CSV, Berichte) ----
    $titles = [['brand', 'F1 – Mülltonnenbrand'], ['brand', 'F2 – Kaminbrand'], ['th', 'TH – Ölspur'], ['th', 'TH – Baum auf Straße'], ['vu', 'VU – PKW gegen Baum'],
        ['th', 'TH – Tragehilfe Rettungsdienst'], ['fehl', 'BMA – Fehlalarm Schule'], ['brand', 'F2 – Brand Scheune'], ['th', 'TH – Wasser im Keller'], ['vu', 'VU – zwei PKW, Person klemmt']];
    $places = ['Hauptstraße', 'Neustädter Straße', 'Industriestraße', 'Am Sportplatz', 'Kreisstraße 31', 'Dorfplatz', 'Wiesengrund', 'Schulstraße'];
    $leads = ['Vennemann, Kai', 'Schmitz, Tobias', 'Becker, Lena', 'Overkamp, Mia'];
    $newIds = []; $old = [];
    foreach ([$year - 2 => 22, $year - 1 => 26, $year => 18] as $y => $cnt) {
        for ($k = 1; $k <= $cnt; $k++) {
            $doy = (int) floor(($k - 0.5) * 365 / ($cnt + 1)) + mt_rand(0, 6);
            $ts = strtotime($y . '-01-01') + $doy * 86400 + mt_rand(6, 22) * 3600 + mt_rand(0, 3) * 900;
            if ($ts > $now - 4 * 86400) continue; // jüngste Einsätze kommen aus myf_demo_on (offen, Entwurf)
            $t = $titles[($k + $y) % count($titles)]; $lead = $leads[($k + $y) % count($leads)];
            $row = ['kind' => 'einsatz', 'nr' => $k . '/' . $y, 'unit' => $unit, 'title' => $t[1] . ' (Demo)', 'category' => $t[0], 'start' => date('Y-m-d H:i:s', $ts), 'end' => date('Y-m-d H:i:s', $ts + 5400),
                'place' => $places[$k % count($places)] . ' ' . ($k + 2), 'source' => 'demo', 'part_closed' => date('Y-m-d H:i:s', $ts + 86400), 'part_closed_by' => 'Demo', 'created' => current_time('mysql'), 'created_by' => 'Demo',
                'vehicles' => wp_json_encode([['v' => 'HLF 20', 'out' => date('H:i', $ts + 240), 'at' => date('H:i', $ts + 720), 'in' => date('H:i', $ts + 5000)]])];
            $paper = ($y === $year && $ts > $now - 30 * 86400 && empty($old['paper']));
            if ($paper) { $row += ['report_closed' => date('Y-m-d H:i:s', $ts + 2 * 86400), 'report_closed_by' => 'Demo', 'report_ext' => 'auf Papier, Ordner Einsätze ' . $y,
                'report_log' => wp_json_encode([['at' => date('Y-m-d H:i:s', $ts + 2 * 86400), 'by' => 'Demo', 'what' => 'anderweitig erfasst', 'why' => 'auf Papier, Ordner Einsätze ' . $y]])]; $old['paper'] = 1; }
            else $row += ['report' => $report(['einsatzleiter' => str_replace(', ', ' ', $lead), 'lage' => 'Bei Eintreffen: ' . $t[1] . '. Maßnahmen nach Lage, Einsatzstelle an Polizei übergeben.']),
                'report_by' => $lead, 'report_at' => date('Y-m-d H:i:s', $ts + 7200), 'report_lead' => str_replace(', ', ' ', $lead),
                'report_closed' => date('Y-m-d H:i:s', $ts + 86400), 'report_closed_by' => $lead,
                'report_log' => wp_json_encode([['at' => date('Y-m-d H:i:s', $ts + 86400), 'by' => $lead, 'what' => 'abgeschlossen', 'why' => '']])];
            $wpdb->insert(myf_t('incidents'), $row); $iid = (int) $wpdb->insert_id; $newIds[] = $iid;
            // Beteiligte: Einsatzleiter + 4–8 weitere
            $crew = [$lead]; $pool = $names; shuffle($pool);
            foreach (array_slice($pool, 0, mt_rand(4, 8)) as $n) if (!in_array($n, $crew, true)) $crew[] = $n;
            foreach ($crew as $j => $n) {
                if (!$m($n)) continue;
                $isAgt = $t[0] === 'brand' && in_array($n, $agt, true) && $j > 0 && $j < 4;
                $wpdb->insert(myf_t('participation'), ['incident_id' => $iid, 'member_id' => $m($n), 'vehicle' => $j % 3 === 2 ? 'LF 20' : 'HLF 20', 'role' => $j === 0 ? 'EL' : ($isAgt ? 'AGT' : ($j === 1 ? 'MA' : '')),
                    'confirmed' => 1, 'confirmed_by' => 'Demo', 'source' => 'terminal', 'as_minutes' => $isAgt ? mt_rand(18, 32) : 0, 'created' => current_time('mysql')]);
            }
            if ($t[0] === 'brand') $old['brand'][] = $iid;
        }
        // Übungen / Dienstabende: alle zwei Wochen
        for ($w = 0; $w < 52; $w += 2) {
            $ts = strtotime($y . '-01-08 19:30:00') + $w * 7 * 86400;
            if ($ts > $now - 2 * 86400) break;
            $wpdb->insert(myf_t('incidents'), ['kind' => 'uebung', 'unit' => $unit, 'title' => ['Dienstabend: Löschangriff', 'Dienstabend: Technische Hilfe', 'Atemschutz: Innenangriff', 'Gerätekunde HLF', 'Erste Hilfe'][($w / 2) % 5] . ' (Demo)',
                'category' => 'sonst', 'start' => date('Y-m-d H:i:s', $ts), 'end' => date('Y-m-d H:i:s', $ts + 7200), 'source' => 'demo', 'part_closed' => date('Y-m-d H:i:s', $ts + 86400), 'part_closed_by' => 'Demo', 'created' => current_time('mysql'), 'created_by' => 'Demo']);
            $uid = (int) $wpdb->insert_id; $pool = $names; shuffle($pool);
            foreach (array_slice($pool, 0, mt_rand(8, 13)) as $n) $wpdb->insert(myf_t('participation'), ['incident_id' => $uid, 'member_id' => $m($n), 'vehicle' => 'Gerätehaus (Bereitschaft)', 'role' => '', 'confirmed' => 1, 'confirmed_by' => 'Demo', 'source' => 'app', 'created' => current_time('mysql')]);
        }
    }
    // Bericht von gestern: Entwurf (noch nicht abgeschlossen)
    if ($e2) $wpdb->update(myf_t('incidents'), ['report' => $report(['einsatzleiter' => 'Tobias Schmitz', 'lage' => 'PKW seitlich im Graben, Fahrer leicht verletzt, auslaufende Betriebsstoffe.', 'objekt' => ['Straße']]),
        'report_by' => 'Schmitz, Tobias', 'report_at' => $at(-1, '13:10'), 'report_lead' => 'Tobias Schmitz'], ['id' => $e2]);

    // ---- Atemschutzüberwachung: abgelegte Protokolle für frühere Brände, eines in Arbeit ----
    $trupp = function ($a, $b, $t0) { return [['name' => 'Angriffstrupp', 'task' => 'Innenangriff 1. OG, Menschenrettung', 't_start' => $t0, 'checks' => [['t' => date('H:i', strtotime($t0) + 600), 'p' => 210]], 't_retreat' => date('H:i', strtotime($t0) + 1200), 't_end' => date('H:i', strtotime($t0) + 1560), 'note' => '',
        'members' => [['member_id' => $a, 'name' => '', 'fn' => 'TF', 'pa' => 'PA-03', 'mask' => 'M-11', 'bottle' => 'F-21', 'p_start' => 300, 'p_end' => 120], ['member_id' => $b, 'name' => '', 'fn' => 'TM', 'pa' => 'PA-04', 'mask' => 'M-12', 'bottle' => 'F-22', 'p_start' => 300, 'p_end' => 110]]]]; };
    foreach (array_slice($old['brand'] ?? [], -4) as $k => $iid) {
        $wpdb->insert(myf_t('asu'), ['incident_id' => $iid, 'station' => 'HLF 20', 'supervisor' => 'Becker, Lena', 'data' => wp_json_encode($trupp($m('Albers, Jan'), $m('Elsing, Paul'), '18:20')), 'files' => '[]',
            'status' => $k < 3 ? 'closed' : 'open', 'closed_by' => $k < 3 ? 'Albers, Jan' : '', 'closed_at' => $k < 3 ? current_time('mysql') : null, 'created_by' => 'Albers, Jan', 'created' => current_time('mysql'), 'updated' => current_time('mysql')]);
    }

    // ---- Ausbildung (Nachweise): AGT-Lehrgang bei allen Trägern bis auf einen, dazu Grundausbildung und Führung ----
    foreach ($names as $k => $n) {
        $wpdb->insert(myf_t('quals'), ['member_id' => $mid[$n], 'title' => 'Truppmann Teil 1 + 2', 'short' => 'TM', 'year' => 2006 + $k % 15, 'date' => null, 'note' => '']);
        if (in_array($n, $agt, true) && $n !== 'Wessels, Max') $wpdb->insert(myf_t('quals'), ['member_id' => $mid[$n], 'title' => 'Atemschutzgeräteträger', 'short' => 'AGT', 'year' => 2009 + $k % 12, 'date' => null, 'note' => '']);
        if (in_array($n, ['Becker, Lena', 'Hemsing, Lukas', 'Nienhaus, Felix'], true)) $wpdb->insert(myf_t('quals'), ['member_id' => $mid[$n], 'title' => 'Maschinist', 'short' => 'MA', 'year' => 2015, 'date' => null, 'note' => '']);
        if (in_array($n, ['Schmitz, Tobias', 'Becker, Lena', 'Vennemann, Kai', 'Overkamp, Mia'], true)) $wpdb->insert(myf_t('quals'), ['member_id' => $mid[$n], 'title' => 'Gruppenführer', 'short' => 'F III', 'year' => 2018, 'date' => null, 'note' => '']);
    }

    // ---- Geräte der Atemschutzwerkstatt (Fälligkeiten) ----
    foreach ([['pa', 'PA-', 6, 0], ['maske', 'M-', 8, 10], ['flasche', 'F-', 10, 20]] as $g) {
        for ($k = 1; $k <= $g[2]; $k++) { $wpdb->insert(myf_t('devices'), ['area' => 'agt', 'type' => $g[0], 'nr' => $g[1] . sprintf('%02d', $g[3] + $k), 'serial' => strtoupper(substr(md5($g[1] . $k), 0, 8)), 'maker' => 'Dräger', 'model' => $g[0] === 'pa' ? 'PSS 7000' : ($g[0] === 'maske' ? 'FPS 7000' : '6,8 l 300 bar'),
            'built' => ($year - 2 - $k % 5) . '-03', 'storage' => $k % 2 ? 'mobil' : 'stationaer', 'location' => $k % 2 ? 'HLF 20' : 'Lager', 'test_due' => $day(($k % 4 === 0) ? -5 : 20 + $k * 30), 'status' => $k === 2 && $g[0] === 'maske' ? 'used' : 'ready', 'created' => current_time('mysql')]);
            $dv = (int) $wpdb->insert_id;
            // Prüfungen: meist aktuell, einzelne überfällig – so zeigt „Fälligkeiten“ ein realistisches Bild
            $kinds = $g[0] === 'maske' ? ['rdp' => -40, 'pruef' => $k === 3 ? -760 : -200, 'avs' => -400, 'sprech' => -400] : ($g[0] === 'pa' ? ['rdp' => -40, 'pruef' => $k === 4 ? -200 : -60, 'gue' => -700] : ['fuell' => -20]);
            foreach ($kinds as $kind => $ago) $wpdb->insert(myf_t('device_checks'), ['device_id' => $dv, 'kind' => $kind, 'date' => $day($ago - $k), 'result' => 'ok', 'tester' => 'Albers, Jan', 'values_text' => '', 'note' => '', 'by_member_id' => $m('Albers, Jan') ?: null, 'by_name' => 'Albers, Jan', 'created' => current_time('mysql')]);
        }
    }
    // Gerätewerkstatt (Technik): Leitern, Hebekissen, Rettungsgerät, Motorsäge, Stromerzeuger
    foreach ([['leiter', 'L-01', 'Steckleiter 4-teilig', 'HLF 20', -300], ['leiter', 'L-02', 'Schiebleiter', 'LF 20', -380], ['hebekissen', 'HK-01', 'Hebekissensatz V12/V24', 'HLF 20', -200], ['rettung', 'RS-01', 'Rettungsschere SP 333', 'HLF 20', -100],
        ['saege', 'MS-01', 'Motorsäge MS 462', 'LF 20', -330], ['strom', 'SE-01', 'Stromerzeuger 8 kVA', 'HLF 20', -150]] as $g) {
        $wpdb->insert(myf_t('devices'), ['area' => 'vehicles', 'type' => $g[0], 'nr' => $g[1], 'serial' => strtoupper(substr(md5($g[1]), 0, 8)), 'maker' => '', 'model' => $g[2], 'built' => ($year - 6) . '-05', 'location' => $g[3], 'storage' => 'mobil', 'test_due' => null, 'status' => 'ready', 'created' => current_time('mysql')]);
        $dv = (int) $wpdb->insert_id;
        $wpdb->insert(myf_t('device_checks'), ['device_id' => $dv, 'kind' => 'jahr', 'date' => $day($g[4]), 'result' => 'ok', 'tester' => 'Kemper, Jonas', 'values_text' => '', 'note' => '', 'by_member_id' => $m('Kemper, Jonas') ?: null, 'by_name' => 'Kemper, Jonas', 'created' => current_time('mysql')]);
    }

    // ---- Lehrgänge des aktuellen Abfragejahres mit Terminen und Meldungen ----
    $cy = (int) (myf_settings()['year'] ?? $year);
    $cids = [];
    foreach ([['kreis_lg', 'TM1', 'Truppmann Teil 1', 70], ['kreis_lg', 'AGT', 'Atemschutzgeräteträger', 35], ['kreis_lg', 'MA', 'Maschinist', 35], ['kreis_lg', 'SPRF', 'Sprechfunker', 16], ['kreis_sem', 'CBRN', 'Seminar CBRN-Erkundung', 8], ['idf_lg', 'F III', 'Gruppenführer (IdF)', 70]] as $s => $c) {
        $wpdb->insert(myf_t('courses'), ['year' => $cy, 'cat' => $c[0], 'nr' => '', 'title' => $c[2], 'short' => $c[1], 'days' => '', 'ue' => $c[3], 'locations' => $c[0] === 'idf_lg' ? 'Landesfeuerwehrschule' : 'Kreisausbildung', 'prereq' => '', 'cost' => '', 'note' => '', 'hidden' => 0, 'sort' => $s]);
        $cids[$c[1]] = (int) $wpdb->insert_id;
    }
    $dids = [];
    // Termine liegen im Lehrgangsjahr: ist es das nächste Jahr, ab Januar; sonst in den kommenden Wochen
    $cd = function ($off) use ($cy, $year, $day) { return $cy > $year ? date('Y-m-d', strtotime($cy . '-01-10') + $off * 86400) : $day($off); };
    foreach ([['TM1', 20, 34, 6], ['AGT', 45, 47, 4], ['MA', 75, 82, 3], ['SPRF', 12, 13, 5], ['F III', 120, 131, 1]] as $x) {
        $wpdb->insert(myf_t('dates'), ['course_id' => $cids[$x[0]], 'start_date' => $cd($x[1]), 'end_date' => $cd($x[2]), 'period' => '', 'location' => $x[0] === 'F III' ? 'Landesfeuerwehrschule' : 'Kreisausbildung', 'slots' => $x[3], 'daytime' => '', 'sessions' => '']);
        $dids[$x[0]] = (int) $wpdb->insert_id;
    }
    foreach ([['Rotering, Ben', 'TM1', 'assigned'], ['Feldhaus, Nico', 'TM1', 'assigned'], ['Tenbrink, Lea', 'TM1', 'open'], ['Gerdes, Hannah', 'SPRF', 'assigned'], ['Wessels, Max', 'AGT', 'waiting'],
        ['Nienhaus, Felix', 'MA', 'open'], ['Becker, Lena', 'CBRN', 'open'], ['Schmitz, Tobias', 'F III', 'assigned'], ['Lammers, Sophie', 'AGT', 'assigned']] as $x) {
        if ($m($x[0])) $wpdb->insert(myf_t('needs'), ['member_id' => $m($x[0]), 'course_id' => $cids[$x[1]], 'comment' => '', 'status' => $x[2], 'date_id' => $x[2] === 'open' ? null : ($dids[$x[1]] ?? null), 'admin_note' => '', 'created' => current_time('mysql')]);
    }

    // Lehrgangswünsche: Abfrage läuft, Frist in drei Wochen – so lässt sich das Melden vorführen
    $s0 = get_option('myf_settings', []); $s0 = is_array($s0) ? $s0 : [];
    $s0['open'] = true; $s0['deadline'] = $day(21); $s0['published'] = false; update_option('myf_settings', $s0);

    // ---- Aushänge: Einladung mit Zu-/Absage und ein Hinweis ----
    $wpdb->insert(myf_t('board'), ['title' => 'Generalversammlung am ' . date('d.m.Y', strtotime($day(40))), 'text' => "Einladung zur Generalversammlung im Gerätehaus, 19:00 Uhr.\nTagesordnung: Berichte, Wahlen, Ehrungen.", 'file_url' => '', 'file_name' => '',
        'ends' => $day(40), 'rsvp' => 1, 'rsvp_deadline' => $day(30), 'on_screen' => 1, 'created_by' => 'Vennemann, Kai', 'created' => current_time('mysql')]);
    $bid = (int) $wpdb->insert_id;
    foreach (array_slice($names, 0, 9) as $k => $n) $wpdb->insert(myf_t('board_rsvp'), ['board_id' => $bid, 'member_id' => $mid[$n], 'answer' => $k % 4 === 3 ? 'no' : 'yes', 'persons' => $k % 3 === 0 ? 2 : 1, 'note' => '', 'updated' => current_time('mysql')]);
    $wpdb->insert(myf_t('board'), ['title' => 'Neue Alarm- und Ausrückeordnung', 'text' => 'Gilt ab dem 1. des nächsten Monats. Bitte lesen – Fragen an die Wehrführung.', 'file_url' => '', 'file_name' => '',
        'ends' => $day(60), 'rsvp' => 0, 'rsvp_deadline' => null, 'on_screen' => 0, 'created_by' => 'Vennemann, Kai', 'created' => current_time('mysql')]);

    // ---- Unterweisungen: dieses Jahr (zwei freigegeben, eine als Entwurf), letztes Jahr erledigt ----
    $brief = function ($y, $title, $aud, $active, $due, $ackShare) use ($wpdb, $mid, $agt) {
        $wpdb->insert(myf_t('briefings'), ['year' => $y, 'title' => $title, 'text' => 'Inhalte laut Unterweisungsunterlage – bitte lesen und bestätigen.', 'link' => '', 'audience' => $aud, 'due' => $due, 'held' => null, 'active' => $active, 'created_by' => 'Demo', 'created' => current_time('mysql')]);
        $bid = (int) $wpdb->insert_id; if (!$active) return;
        $who = $aud === 'agt' ? array_intersect_key($mid, array_flip($agt)) : $mid; $k = 0;
        foreach ($who as $n => $id) if ($k++ < count($who) * $ackShare) $wpdb->insert(myf_t('briefing_acks'), ['briefing_id' => $bid, 'member_id' => $id, 'method' => $k % 3 ? 'app' : 'liste', 'by_name' => $k % 3 ? $n : 'Demo', 'ack_at' => current_time('mysql')]);
    };
    $brief($year, 'UVV-Jahresunterweisung', 'all', 1, $day(21), 0.7);
    $brief($year, 'Atemschutz-Jahresunterweisung', 'agt', 1, $day(45), 0.5);
    $brief($year, 'Motorsäge – Sicherheitsunterweisung', 'all', 0, null, 0);
    $brief($year - 1, 'UVV-Jahresunterweisung', 'all', 1, ($year - 1) . '-03-31', 1);

    // ---- Leihkleidung nach dem Brand von heute ----
    foreach ([['Albers, Jan', 'Jogginganzug', 'L', $e1, 0], ['Albers, Jan', 'Schlappen', '44', $e1, 0], ['Elsing, Paul', 'Jogginganzug', 'XL', $e1, 0], ['Kemper, Jonas', 'T-Shirt', 'M', 0, -20]] as $x) {
        if ($m($x[0])) $wpdb->insert(myf_t('loans'), ['member_id' => $m($x[0]), 'item' => $x[1], 'size' => $x[2], 'qty' => 1, 'incident_id' => $x[3] ?: null, 'since' => $day($x[4]), 'by_name' => 'Albers, Jan']);
    }
    $s = get_option('myf_settings', []); $s = is_array($s) ? $s : [];
    $s['loan_stock'] = ['Jogginganzug|M' => 4, 'Jogginganzug|L' => 4, 'Jogginganzug|XL' => 3, 'Schlappen|42' => 3, 'Schlappen|44' => 4, 'Schlappen|46' => 2, 'T-Shirt|M' => 6, 'T-Shirt|L' => 6];
    update_option('myf_settings', $s);

    // ---- Kleiderkammer, Anregungen, Rückfragen, Hinweis fürs Dashboard, Team-Aufgaben ----
    foreach ([['Rotering, Ben', 'ersatz', 'Einsatzjacke HuPF Teil 1', '54', 'Reißverschluss defekt', 'open'], ['Tenbrink, Lea', 'neu', 'Feuerwehrstiefel', '39', 'Neu in der Einsatzabteilung', 'open'], ['Hemsing, Lukas', 'ersatz', 'Handschuhe TH', '10', 'verschlissen', 'issued']] as $x) {
        if ($m($x[0])) $wpdb->insert(myf_t('clothing'), ['member_id' => $m($x[0]), 'kind' => $x[1], 'item' => $x[2], 'size' => $x[3], 'qty' => 1, 'reason' => $x[4], 'comment' => '', 'status' => $x[5], 'admin_note' => $x[5] === 'issued' ? 'ausgegeben' : '', 'created' => current_time('mysql')]);
    }
    $wpdb->insert(myf_t('ideas'), ['member_id' => $m('Gerdes, Hannah'), 'owner_hash' => '', 'recipient' => 'wf', 'subject' => 'Fotowand für den Tag der offenen Tür', 'text' => 'Wir könnten eine Fotowand mit Helm und Jacke für Kinder aufstellen.', 'status' => 'new', 'answer' => '', 'archived' => 0, 'created' => current_time('mysql')]);
    $wpdb->insert(myf_t('ideas'), ['member_id' => null, 'owner_hash' => md5('demo'), 'recipient' => 'wf', 'subject' => 'Dienstabend-Zeiten', 'text' => 'Könnten Dienstabende im Winter um 19:00 beginnen?', 'status' => 'answered', 'answer' => 'Gute Idee – probieren wir ab November.', 'answered' => current_time('mysql'), 'archived' => 0, 'created' => current_time('mysql')]);
    $wpdb->insert(myf_t('messages'), ['member_id' => $m('Lammers, Sophie'), 'area' => 'agt', 'about' => 'Übungsstrecke', 'text' => 'Meine Übungsstrecke vom Frühjahr fehlt im Verlauf.', 'status' => 'open', 'answer' => '', 'answered_by' => '', 'created' => current_time('mysql')]);
    $wpdb->insert(myf_t('notices'), ['text' => 'Fahrzeughalle: Tor 2 klemmt – bitte nur Tor 1 benutzen.', 'level' => 'warn', 'starts' => current_time('mysql'), 'ends' => $at(10, '23:59'), 'author_member_id' => $m('Kemper, Jonas'), 'author_name' => 'Kemper, Jonas', 'created' => current_time('mysql'), 'updated' => current_time('mysql'), 'updated_by' => '', 'signature' => 'Jonas (Gerätewart)']);
    foreach (myf_teams() as $k => $t) $wpdb->insert(myf_t('team_tasks'), ['area' => 'team_' . $t['key'], 'title' => $k ? 'Fotos vom Kreisfeuerwehrtag sortieren' : 'Tablet im ELW aktualisieren', 'text' => '', 'status' => 'open', 'prio' => 0, 'due' => $day(14), 'member_id' => null, 'source' => '', 'created_by' => 'Demo', 'created' => current_time('mysql')]);

    // ---- Spinde: die meisten mit Schlüssel, einer ohne (Lea Tenbrink), einer verloren, einer übertragen ----
    if (function_exists('myf_install_lockers')) {
        $lid = [];
        for ($i = 1; $i <= 24; $i++) { $wpdb->insert(myf_t('lockers'), ['nr' => (string) $i, 'location' => 'Umkleide Gerätehaus']); $lid[$i] = (int) $wpdb->insert_id; }
        $logl = function ($l, $d, $what, $n, $note = '') use ($wpdb, $m, $day) { $wpdb->insert(myf_t('locker_log'), ['locker_id' => $l, 'date' => $day($d), 'what' => $what, 'member_id' => $n ? $m($n) : null, 'note' => $note, 'by_name' => 'Kleiderkammer (Demo)', 'created' => current_time('mysql')]); };
        foreach (array_values($names) as $k => $n) {
            if ($k >= 18 || !$m($n)) continue;
            $key = $n === 'Tenbrink, Lea' ? 'none' : ($n === 'Feldhaus, Nico' ? 'lost' : ($k % 7 === 3 ? 'nolock' : 'issued'));
            $wpdb->update(myf_t('lockers'), ['member_id' => $m($n), 'key_status' => $key, 'key_count' => $key === 'issued' ? 1 : 0, 'since' => $day(-400 + $k * 13)], ['id' => $lid[$k + 1]]);
            $logl($lid[$k + 1], -400 + $k * 13, 'zugewiesen', $n, MYF_LOCKER_KEY[$key === 'lost' ? 'issued' : $key]);
            if ($key === 'lost') $logl($lid[$k + 1], -30, 'Schlüssel verloren', $n, 'Ersatzschlüssel bestellt');
        }
        // Übertragung: Spind 7 vorher bei einem ausgetretenen Mitglied, Schlüssel direkt übergeben
        $logl($lid[7], -800, 'zugewiesen', '', 'Hüsing, Clara – Schlüssel beim Mitglied');
        $logl($lid[7], -420, 'übertragen', array_values($names)[6] ?? '', 'Schlüssel direkt übergeben');
    }

    // ---- Postfächer: Persönliches und Verwaltung ----
    $note = function ($n, $kind, $title, $body, $link, $d) use ($wpdb, $m, $at) { if ($m($n)) $wpdb->insert(myf_t('notifications'), ['member_id' => $m($n), 'kind' => $kind, 'title' => $title, 'body' => $body, 'link' => $link, 'dedupe' => '', 'created' => $at($d, '08:00'), 'archived' => 0]); };
    $note('Albers, Jan', 'reminder', 'G26 läuft in 25 Tagen ab', 'Bitte Termin beim Betriebsarzt machen.', 'agt', 0);
    $note('Tenbrink, Lea', 'briefing', 'Neue Unterweisung: UVV-Jahresunterweisung', 'Bitte lesen und bestätigen.', 'start', -2);
    $note('Vennemann, Kai', 'defect', 'Neuer Mangel: LF 20 – Blaulicht hinten links', 'Gemeldet von Lukas Hemsing', 'admin:defects', 0);
    $note('Vennemann, Kai', 'message', 'Rückfrage von Lammers, Sophie: Übungsstrecke', 'Meine Übungsstrecke vom Frühjahr fehlt im Verlauf.', 'admin:messages', -1);
    $note('Vennemann, Kai', 'booking', 'Fahrzeug-Anfrage: MTF', 'Medienteam: Fotos beim Kreisfeuerwehrtag', 'admin:vehicles', -1);
    $note('Kemper, Jonas', 'defect', 'Neuer Mangel: LF 20 – Blaulicht hinten links', 'Gemeldet von Lukas Hemsing', 'admin:defects', 0);
    $note('Vennemann, Kai', 'reminder', 'Dienstabend am Donnerstag', 'Technische Hilfe: Rettung aus PKW', 'duties', -3);
    // Bestellrunde: fiktive Pizzeria, Runde läuft bis heute Abend
    $items = []; foreach ([['Pizza', 'Margherita', 750], ['Pizza', 'Salami', 850], ['Pizza', 'Funghi', 850], ['Pizza', 'Hawaii', 950], ['Getränke', 'Cola 0,33 l', 250]] as $i) $items[] = ['k' => myf_order_key($i[0], $i[1]), 'cat' => $i[0], 'name' => $i[1], 'cents' => $i[2]];
    $wpdb->insert(myf_t('order_menus'), ['name' => 'Pizzeria Musterstadt (Demo)', 'kind' => 'pizzeria', 'phone' => '01234 0000', 'items' => wp_json_encode($items), 'updated' => current_time('mysql')]);
    $wpdb->insert(myf_t('order_rounds'), ['title' => 'Pizza Dienstabend (Demo)', 'menu_id' => (int) $wpdb->insert_id, 'menu_snapshot' => wp_json_encode(['name' => 'Pizzeria Musterstadt (Demo)', 'phone' => '01234 0000', 'link' => '', 'note' => '', 'items' => $items]), 'free_entry' => 1,
        'deadline' => date('Y-m-d H:i:s', strtotime(current_time('mysql')) + DAY_IN_SECONDS), 'created_by' => 'Vennemann, Kai', 'created_member' => $m('Vennemann, Kai'), 'created' => current_time('mysql')]);
    $rid = (int) $wpdb->insert_id;
    foreach ([['Albers, Jan', 1], ['Tenbrink, Lea', 0], ['Vennemann, Kai', 1]] as $o) if ($m($o[0])) $wpdb->insert(myf_t('order_items'), ['round_id' => $rid, 'member_id' => $m($o[0]), 'item_key' => $items[$o[1]]['k'], 'name' => $items[$o[1]]['name'], 'price_cents' => $items[$o[1]]['cents'], 'qty' => 1, 'created' => current_time('mysql')]);
}
