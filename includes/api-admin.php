<?php
/** REST-Schnittstelle der Verwaltung (Administratoren und Redakteure; Atemschutz nur mit Berechtigung ffl_agt). */

defined('ABSPATH') || exit;

add_action('rest_api_init', function () {
    $ns = 'myf/v1';
    $routes = [
        'state' => ['GET', 'myf_api_admin_state'],
        'profile' => ['GET', 'myf_api_admin_profile'],
        'settings' => ['POST', 'myf_api_admin_settings'],
        'member' => ['POST', 'myf_api_admin_member'],
        'member/delete' => ['POST', 'myf_api_admin_member_delete'],
        'member/merge' => ['POST', 'myf_api_admin_member_merge'],
        'yearreport' => ['GET', 'myf_api_admin_yearreport'],
        'member/invite' => ['POST', 'myf_api_admin_member_invite'],
        'members/bulk' => ['POST', 'myf_api_admin_members_bulk'],
        'course' => ['POST', 'myf_api_admin_course'],
        'course/delete' => ['POST', 'myf_api_admin_course_delete'],
        'courses/bulk' => ['POST', 'myf_api_admin_courses_bulk'],
        'courses/copy' => ['POST', 'myf_api_admin_courses_copy'],
        'templates/seed' => ['POST', function () { return ['added' => myf_seed_templates()]; }],
        'date' => ['POST', 'myf_api_admin_date'],
        'date/delete' => ['POST', 'myf_api_admin_date_delete'],
        'date/tpl' => ['POST', 'myf_api_admin_date_tpl'],
        'date/complete' => ['POST', 'myf_api_admin_date_complete'],
        'need' => ['POST', 'myf_api_admin_need'],
        'need/delete' => ['POST', 'myf_api_admin_need_delete'],
        'qual' => ['POST', 'myf_api_admin_qual'],
        'qual/delete' => ['POST', 'myf_api_admin_qual_delete'],
        'clothing' => ['POST', 'myf_api_admin_clothing'],
        'clothing/delete' => ['POST', 'myf_api_admin_clothing_delete'],
        'idea' => ['POST', 'myf_api_admin_idea'],
        'idea/delete' => ['POST', function (WP_REST_Request $req) { global $wpdb; $wpdb->delete(myf_t('ideas'), ['id' => (int) $req->get_param('id')]); return ['ok' => true]; }],
        'mailtest' => ['POST', 'myf_api_admin_mailtest'],
        'linkme' => ['POST', 'myf_api_admin_linkme'],
        'member/pwlink' => ['POST', 'myf_api_admin_member_pwlink'],
    ];
    foreach ($routes as $path => $r) {
        register_rest_route($ns, '/admin/' . $path, ['methods' => $r[0], 'permission_callback' => 'myf_can_manage', 'callback' => $r[1]]);
    }
    register_rest_route($ns, '/admin/backup', ['methods' => 'GET', 'callback' => 'myf_api_admin_backup',
        'permission_callback' => function () { return current_user_can('manage_options'); }]);
    foreach (['agt' => 'myf_api_admin_agt', 'agtlog/bulk' => 'myf_api_admin_agtlog_bulk', 'agtlog/delete' => 'myf_api_admin_agtlog_delete'] as $path => $cb) {
        register_rest_route($ns, '/admin/' . $path, ['methods' => 'POST', 'permission_callback' => 'myf_can_agt', 'callback' => $cb]);
    }
    // Regel für „einsatzbereit“: zweiter Nachweis in 12 Monaten nötig (ja/nein) – pflegen die Atemschutz-Zuständigen
    register_rest_route($ns, '/admin/agt/rule', ['methods' => 'POST', 'permission_callback' => 'myf_can_agt', 'callback' => function (WP_REST_Request $req) {
        $s = myf_settings(); $s['agt_second'] = (bool) $req->get_param('second');
        update_option('myf_settings', $s);
        return ['ok' => true, 'second' => $s['agt_second']];
    }]);
});

function myf_settings_admin() {
    $s = myf_settings();
    $s['screen_ical_set'] = $s['screen_ical'] !== '';
    $s['screen_ical'] = $s['screen_ical'] !== '' ? (wp_parse_url($s['screen_ical'], PHP_URL_HOST) ?: 'Kalender') . '/…' : '';
    $s['screen_url'] = $s['screen_key'] ? add_query_arg('myf_screen', $s['screen_key'], home_url('/')) : '';
    unset($s['drill_ical'], $s['drill_icals']); // Dienstplan-Kalender: Links bleiben auf dem Server (Stand steht in drill_cal)
    return $s;
}

function myf_api_admin_state(WP_REST_Request $req) {
    global $wpdb;
    $s = myf_settings();
    $year = $req->get_param('year') !== null && $req->get_param('year') !== '' ? (int) $req->get_param('year') : (int) $s['year'];
    $data = myf_year_data($year, true);
    $needs = $data['ids'] ? $wpdb->get_results('SELECT * FROM ' . myf_t('needs') . ' WHERE course_id IN (' . implode(',', $data['ids']) . ')') : [];
    // Jahre mit Lehrgängen + angelegte (auch leere) Jahre + Abfragejahr
    $years = array_map('intval', $wpdb->get_col('SELECT DISTINCT year FROM ' . myf_t('courses') . ' WHERE year > 0'));
    $years = array_values(array_unique(array_merge($years, array_map('intval', (array) ($s['known_years'] ?? [])), [(int) $s['year']])));
    rsort($years);
    $today = current_time('Y-m-d');
    $upcoming = $wpdb->get_results($wpdb->prepare(
        'SELECT d.*, c.title, c.short, c.year, (SELECT COUNT(*) FROM ' . myf_t('needs') . ' n WHERE n.date_id = d.id AND n.status = \'assigned\') AS assigned
         FROM ' . myf_t('dates') . ' d JOIN ' . myf_t('courses') . ' c ON c.id = d.course_id
         WHERE c.year > 0 AND d.start_date IS NOT NULL AND COALESCE(d.end_date, d.start_date) >= %s ORDER BY d.start_date LIMIT 50', $today));
    // Termine in der Vergangenheit, bei denen noch Teilnehmer auf „zugeteilt“ stehen (→ absolviert eintragen)
    $confirmRows = $wpdb->get_results($wpdb->prepare(
        'SELECT c.year, COUNT(*) AS n FROM ' . myf_t('needs') . ' n JOIN ' . myf_t('dates') . ' d ON d.id = n.date_id
         JOIN ' . myf_t('courses') . ' c ON c.id = n.course_id
         WHERE n.status = \'assigned\' AND COALESCE(d.end_date, d.start_date) < %s GROUP BY c.year ORDER BY c.year', $today));
    $toConfirmByYear = [];
    foreach ($confirmRows as $r) $toConfirmByYear[(int) $r->year] = (int) $r->n;
    $toConfirm = array_sum($toConfirmByYear);

    return apply_filters('myf_admin_state', [
        'year' => $year,
        'session_tpls' => myf_session_tpls(),
        'years' => $years,
        'settings' => myf_settings_admin(),
        'dupes' => myf_member_dupes(), // doppelte Mitglieder (gleicher Name)
        'followup' => function_exists('myf_followup') ? myf_followup() : [], // Nachbereitung je Einsatz
        'daytime' => myf_day_availability(), // tagsüber erreichbare Kräfte
        'link' => myf_member_page_url(),
        'brand' => myf_brand(),
        'mail_from' => myf_mail_from(), 'invite_preview' => ['subject' => myf_invite_subject(), 'text' => myf_invite_text('Max', 'max.mustermann', '[persönlicher Link zum Passwort-Festlegen]')],
        'depts' => MYF_DEPTS, 'retire_age' => myf_retire_age(),
        'cats' => MYF_CATS, 'units' => myf_units(), 'idea_to' => myf_idea_to(), 'agt_kinds' => MYF_AGT_KINDS, 'agt_second' => !empty(myf_settings()['agt_second']), 'clothing_kinds' => MYF_CLOTHING_KINDS,
        'can_agt' => myf_can_agt(),
        'me_member' => ($mm = myf_me()) ? (int) $mm->id : null,
        'can_audit' => current_user_can('manage_options'),
        'members' => array_map('myf_member_out', $wpdb->get_results('SELECT * FROM ' . myf_t('members') . ' ORDER BY name')),
        'courses' => $data['courses'],
        'dates' => $data['dates'],
        'needs' => array_map('myf_need_out', $needs),
        'templates' => $year === 0 ? [] : myf_year_data(0, true)['courses'],
        'upcoming' => array_map(function ($d) { return myf_date_out($d) + ['title' => $d->title, 'short' => $d->short, 'year' => (int) $d->year, 'assigned' => (int) $d->assigned]; }, $upcoming),
        'to_confirm' => $toConfirm,
        'to_confirm_by_year' => (object) $toConfirmByYear,
        'agt_log' => myf_can_agt() || myf_has_area('strecke') ? array_map('myf_agt_log_out', $wpdb->get_results('SELECT * FROM ' . myf_t('agt_log') . ' ORDER BY date DESC, id DESC')) : [],
        'clothing' => array_map('myf_clothing_out', $wpdb->get_results('SELECT * FROM ' . myf_t('clothing') . ' ORDER BY created DESC')),
        'ideas' => array_map(function ($i) { return myf_idea_out($i, true); }, $wpdb->get_results('SELECT * FROM ' . myf_t('ideas') . ' ORDER BY created DESC')),
    ]);
}

// Alles zu einer Person über alle Jahre (Ausbildungsnachweis)
function myf_api_admin_profile(WP_REST_Request $req) {
    global $wpdb;
    $id = (int) $req->get_param('id');
    $m = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('members') . ' WHERE id = %d', $id));
    if (!$m) return myf_err('Mitglied nicht gefunden.', 404);
    $needs = $wpdb->get_results($wpdb->prepare(
        'SELECT n.*, c.year AS c_year, c.title AS c_title, c.short AS c_short, d.start_date, d.end_date, d.period, d.location
         FROM ' . myf_t('needs') . ' n JOIN ' . myf_t('courses') . ' c ON c.id = n.course_id LEFT JOIN ' . myf_t('dates') . ' d ON d.id = n.date_id
         WHERE n.member_id = %d ORDER BY c.year DESC, c.sort', $id));
    return apply_filters('myf_admin_profile', [
        'member' => myf_member_out($m),
        'needs' => array_map(function ($n) {
            return myf_need_out($n) + ['year' => (int) $n->c_year, 'title' => $n->c_title, 'short' => $n->c_short,
                'start' => $n->start_date, 'end' => $n->end_date, 'period' => $n->period, 'location' => $n->location];
        }, $needs),
        'quals' => array_map('myf_qual_out', $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . myf_t('quals') . ' WHERE member_id = %d ORDER BY year DESC, date DESC', $id))),
        'clothing' => array_map('myf_clothing_out', $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . myf_t('clothing') . ' WHERE member_id = %d ORDER BY created DESC', $id))),
        'ideas' => array_map(function ($i) { return myf_idea_out($i, true); }, $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . myf_t('ideas') . ' WHERE member_id = %d ORDER BY created DESC', $id))),
        'agt_log' => myf_can_agt() ? array_map('myf_agt_log_out', $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . myf_t('agt_log') . ' WHERE member_id = %d ORDER BY date DESC', $id))) : [],
        'history' => function_exists('myf_member_history') ? myf_member_history($id) : [],
    ], $id);
}

// Das eigene WordPress-Konto (z. B. Administrator) mit einem Mitglied verknüpfen – oder sich selbst als Mitglied anlegen
function myf_api_admin_linkme(WP_REST_Request $req) {
    global $wpdb;
    $uid = get_current_user_id();
    if (myf_me()) return myf_err('Dein Konto ist schon einem Mitglied zugeordnet.');
    if ($req->get_param('create')) {
        $u = wp_get_current_user();
        $name = trim(($u->last_name ?: $u->display_name) . ($u->first_name && $u->last_name ? ', ' . $u->first_name : ''));
        $wpdb->insert(myf_t('members'), ['name' => $name ?: $u->user_login, 'unit' => myf_unit_ok($req->get_param('unit')), 'active' => 1, 'user_id' => $uid]);
        return ['id' => (int) $wpdb->insert_id];
    }
    $id = (int) $req->get_param('member_id');
    $m = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('members') . ' WHERE id = %d', $id));
    if (!$m) return myf_err('Mitglied nicht gefunden.', 404);
    // Ein vorher angelegtes, nie benutztes Mitgliedskonto bleibt bestehen, ist aber nicht mehr zugeordnet
    $wpdb->update(myf_t('members'), ['user_id' => $uid, 'active' => 1], ['id' => $id]);
    return ['id' => $id, 'replaced_user' => $m->user_id && (int) $m->user_id !== $uid ? (int) $m->user_id : null];
}

// Link zum Passwort-Festlegen erzeugen, ohne E-Mail (z. B. per Messenger weitergeben)
function myf_api_admin_member_pwlink(WP_REST_Request $req) {
    global $wpdb;
    $m = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('members') . ' WHERE id = %d', (int) $req->get_param('id')));
    $u = $m && $m->user_id ? get_userdata((int) $m->user_id) : null;
    if (!$u) return myf_err('Dieses Mitglied hat noch kein Konto. Bitte zuerst eine E-Mail-Adresse eintragen.');
    if ($u->ID === get_current_user_id()) return myf_err('Für dein eigenes Konto bitte „Passwort vergessen“ benutzen.');
    if (user_can($u, 'edit_posts') && !current_user_can('manage_options')) return myf_err('Für Konten mit Redaktionsrechten darf nur ein Administrator einen Link erzeugen.', 403);
    $key = get_password_reset_key($u);
    if (is_wp_error($key)) return $key;
    return ['id' => (int) $m->id, 'login' => $u->user_login,
        'url' => network_site_url('wp-login.php?action=rp&key=' . $key . '&login=' . rawurlencode($u->user_login), 'login')];
}

// Datensicherung: alle SPIND-Tabellen und Einstellungen als JSON (nur Administratoren)
function myf_api_admin_backup() {
    global $wpdb;
    $out = ['plugin' => 'myfeuerwehr', 'version' => MYF_VERSION, 'created' => current_time('c'), 'settings' => myf_settings_safe(), 'tables' => []];
    if (myf_demo_ctx()) return myf_err('Im Demo-Bestand gibt es keine Datensicherung – bitte zurück zu den echten Daten.');
    foreach ($wpdb->get_col($wpdb->prepare('SHOW TABLES LIKE %s', $wpdb->esc_like($wpdb->prefix . 'ffl_') . '%')) as $t) {
        if (strpos($t, $wpdb->prefix . 'ffl_demo_') === 0 || $t === $wpdb->prefix . 'ffl_archive') continue; // Demo-Bestand und Archiv gehören nicht in die Sicherung
        $rows = $wpdb->get_results("SELECT * FROM `$t`", ARRAY_A);
        // Geheimnisse und Anonymität bleiben auch in der Sicherung geschützt
        foreach ($rows as &$r) unset($r['ics_ver'], $r['owner_hash']);
        unset($r);
        $out['tables'][substr($t, strlen($wpdb->prefix))] = $rows;
    }
    myf_audit_write('admin', get_current_user_id(), wp_get_current_user()->display_name, 'admin/backup', '', null, ['tables' => array_map('count', $out['tables'])]);
    return $out;
}

// Probe-Einladung an das eigene Konto: zeigt, ob der Mailversand der Website funktioniert
function myf_api_admin_mailtest() {
    $u = wp_get_current_user();
    $ok = wp_mail($u->user_email, '[Test] ' . myf_invite_subject(), myf_invite_text($u->first_name ?: $u->display_name, $u->user_login, '(hier steht in der echten Einladung der persönliche Link zum Passwort-Festlegen)'));
    return ['ok' => (bool) $ok, 'to' => $u->user_email];
}

function myf_api_admin_settings(WP_REST_Request $req) {
    $s = myf_settings();
    $wasPublished = !empty($s['published']);
    foreach (['year', 'deadline', 'open', 'published', 'intro', 'clothing_open', 'clothing_items', 'ideas_open',
        'defects_open', 'defect_objects', 'screen_on', 'screen_ical', 'screen_note', 'screen_theme', 'screen_lat', 'screen_lon', 'screen_ars', 'screen_weather', 'screen_warnings'] as $k) {
        if ($req->has_param($k)) $s[$k] = $req->get_param($k);
    }
    $s['year'] = max(2000, min(2100, (int) $s['year']));
    $s['deadline'] = myf_date_or_null($s['deadline']) ?: '';
    foreach (['open', 'published', 'clothing_open', 'ideas_open', 'defects_open', 'screen_on'] as $k) $s[$k] = (bool) $s[$k];
    $s['defect_objects'] = array_values(array_filter(array_map('sanitize_text_field', (array) $s['defect_objects'])));
    $s['screen_note'] = sanitize_textarea_field((string) $s['screen_note']);
    $s['screen_theme'] = in_array($s['screen_theme'], ['auto', 'dark', 'light'], true) ? $s['screen_theme'] : 'auto';
    $s['screen_ars'] = preg_match('/^\d{12}$/', (string) $s['screen_ars']) ? $s['screen_ars'] : '';
    foreach (['screen_weather', 'screen_warnings'] as $k) $s[$k] = (bool) $s[$k];
    if ($req->has_param('screen_ars') || $req->has_param('screen_lat')) { delete_transient('myf_nina'); delete_transient('myf_weather'); }
    $s['screen_lat'] = $s['screen_lat'] === null || $s['screen_lat'] === '' ? null : max(-90, min(90, (float) $s['screen_lat']));
    $s['screen_lon'] = $s['screen_lon'] === null || $s['screen_lon'] === '' ? null : max(-180, min(180, (float) $s['screen_lon']));
    // Einheiten (Löschzüge): Schlüssel bleiben stabil, nur Bezeichnungen ändern sich; Einheiten mit Mitgliedern bleiben erhalten
    if (is_array($req->get_param('units'))) {
        global $wpdb;
        $new = [];
        foreach ($req->get_param('units') as $row) {
            $label = mb_substr(sanitize_text_field((string) ($row['label'] ?? '')), 0, 60);
            if ($label === '') continue;
            $key = sanitize_key((string) ($row['key'] ?? '')) ?: (sanitize_title(myf_unit_short($label)) ?: 'einheit');
            $key = substr(str_replace('-', '', $key), 0, 20);
            while (isset($new[$key])) $key .= '2';
            $new[$key] = $label;
        }
        foreach (array_keys(myf_units()) as $old) {
            if (!isset($new[$old]) && (int) $wpdb->get_var($wpdb->prepare('SELECT COUNT(*) FROM ' . myf_t('members') . ' WHERE unit = %s', $old)))
                return myf_err('„' . myf_units()[$old] . '“ hat noch Mitglieder – bitte erst umsetzen oder nur umbenennen.');
        }
        if ($new) $s['units'] = $new;
    }
    $s['screen_ical'] = esc_url_raw(trim((string) $s['screen_ical']), ['https', 'http', 'webcal']);
    if ($req->get_param('new_screen_key') || ($s['screen_on'] && !$s['screen_key'])) $s['screen_key'] = wp_generate_password(24, false);
    if ($req->has_param('screen_ical')) delete_transient('myf_ical_cache');
    $s['intro'] = sanitize_textarea_field((string) $s['intro']);
    $s['clothing_items'] = array_values(array_filter(array_map('sanitize_text_field', (array) $s['clothing_items'])));
    if ($req->has_param('report_review')) $s['report_review'] = max(1, min(30, (int) $req->get_param('report_review')));
    if ($req->has_param('screen_reset')) $s['screen_reset'] = max(1, min(30, (int) $req->get_param('screen_reset')));
    // Für welche Einheit hängen die Dashboards (Fahrzeuge, Fahrtenbuch)? 'all' = alle Einheiten
    if ($req->has_param('screen_unit')) { $su = (string) $req->get_param('screen_unit'); $s['screen_unit'] = $su === 'all' || isset(myf_units()[$su]) ? $su : myf_unit_default(); }
    if ($req->has_param('screen_unit')) myf_stats_flush();
    if ($req->has_param('screen_touch')) $s['screen_touch'] = (bool) $req->get_param('screen_touch');
    if ($req->has_param('screen_vehicles')) $s['screen_vehicles'] = (bool) $req->get_param('screen_vehicles'); // Fahrzeugstatus in der Statuszeile (Standard: aus)
    // Betriebsarzt für die G26 – wird bei G26-Hinweisen und im Atemschutz-Bereich der Mitglieder gezeigt
    if (is_array($req->get_param('g26_doctor'))) {
        $g = $req->get_param('g26_doctor');
        $s['g26_doctor'] = ['name' => mb_substr(sanitize_text_field((string) ($g['name'] ?? '')), 0, 120), 'address' => mb_substr(sanitize_text_field((string) ($g['address'] ?? '')), 0, 200),
            'phone' => mb_substr(sanitize_text_field((string) ($g['phone'] ?? '')), 0, 40), 'url' => ($g['url'] ?? '') !== '' ? esc_url_raw((string) $g['url'], ['http', 'https']) : '', 'note' => mb_substr(sanitize_text_field((string) ($g['note'] ?? '')), 0, 200)];
    }
    // Verdienstausfall: Stelle bei der Gemeinde (erscheint in der Verfügung der Bescheinigung und im Hinweis an Mitglieder/Arbeitgeber)
    if (is_array($req->get_param('cert_office'))) {
        $g = $req->get_param('cert_office');
        $s['cert_office'] = ['name' => mb_substr(sanitize_text_field((string) ($g['name'] ?? '')), 0, 120), 'dept' => mb_substr(sanitize_text_field((string) ($g['dept'] ?? '')), 0, 120),
            'az' => mb_substr(sanitize_text_field((string) ($g['az'] ?? '')), 0, 60), 'note' => mb_substr(sanitize_text_field((string) ($g['note'] ?? '')), 0, 200)];
    }
    foreach (['sec_hide_users', 'sec_xmlrpc_off', 'sec_2fa_admin'] as $k) if ($req->has_param($k)) $s[$k] = (bool) $req->get_param($k);
    if (is_array($req->get_param('stats_manual'))) {
        $s['stats_manual'] = [];
        foreach ($req->get_param('stats_manual') as $y => $row) {
            $y = (int) $y;
            if ($y < 1950 || $y > 2100 || !is_array($row) || ($row['total'] ?? '') === '') continue;
            $s['stats_manual'][$y] = array_map('intval', array_intersect_key($row, array_flip(['total', 'brand', 'th', 'vu', 'fehl', 'sonst'])));
        }
        myf_stats_flush();
    }
    if ($req->has_param('retire_age')) $s['retire_age'] = max(50, min(75, (int) $req->get_param('retire_age')));
    if (is_array($req->get_param('rights'))) {
        foreach ($req->get_param('rights') as $k => $r) {
            if (!isset(myf_rights_labels()[$k])) continue;
            $s['rights'][$k] = ['all' => !empty($r['all']), 'traits' => array_values(array_filter(array_map('intval', (array) ($r['traits'] ?? []))))];
        }
    }
    if (is_array($req->get_param('brand'))) $s['brand'] = myf_brand_save($req->get_param('brand'));
    if (is_array($req->get_param('maint')) && function_exists('myf_maint_cfg_save')) $s['maint'] = myf_maint_cfg_save($req->get_param('maint'));
    if ($req->has_param('as_rules')) {
        $in = $req->get_param('as_rules');
        if (!is_array($in)) $s['as_rules'] = null;
        else {
            $r = myf_as_rules_default();
            foreach ($r as $t => &$def) foreach ($def['kinds'] as $k => &$kd) if (isset($in[$t]['kinds'][$k][1])) $kd[1] = max(0, min(240, (int) $in[$t]['kinds'][$k][1]));
            unset($def, $kd);
            $s['as_rules'] = $r;
        }
    }
    if (is_array($req->get_param('incident_vehicles'))) $s['incident_vehicles'] = array_values(array_filter(array_map('sanitize_text_field', $req->get_param('incident_vehicles'))));
    if (is_array($req->get_param('report_form'))) {
        $form = [];
        foreach ($req->get_param('report_form') as $sec) {
            $fields = [];
            foreach ((array) ($sec['fields'] ?? []) as $f) {
                $label = sanitize_text_field((string) ($f['label'] ?? ''));
                if ($label === '') continue;
                $id = preg_replace('/[^a-z0-9_]/', '', strtolower((string) ($f['id'] ?? ''))) ?: 'f' . substr(md5($label . wp_rand()), 0, 8);
                $fields[] = ['id' => $id, 'label' => $label, 'type' => in_array($f['type'] ?? '', ['checks', 'radio', 'text', 'textarea', 'number'], true) ? $f['type'] : 'text',
                    'options' => array_values(array_filter(array_map('sanitize_text_field', (array) ($f['options'] ?? [])))), 'sensitive' => !empty($f['sensitive'])];
            }
            $title = sanitize_text_field((string) ($sec['title'] ?? ''));
            if ($title !== '' && $fields) $form[] = ['title' => $title, 'fields' => $fields];
        }
        myf_report_form_legacy(); myf_report_form_keep(myf_report_form()); // bisherige Fassung sichern, bevor sie sich ändert
        $s['report_form'] = $form ?: null;
    }
    if ($req->get_param('report_form_reset')) { myf_report_form_legacy(); myf_report_form_keep(myf_report_form()); $s['report_form'] = null; }
    if (is_array($req->get_param('lists'))) {
        foreach ($req->get_param('lists') as $name => $rows) if (isset(MYF_LISTS[$name])) $s['lists'][$name] = myf_clean_list($name, $rows);
    }
    $add = (int) $req->get_param('add_year');
    if ($add > 2000 && $add < 2100) $s['known_years'] = array_values(array_unique(array_merge(array_map('intval', (array) ($s['known_years'] ?? [])), [$add])));
    update_option('myf_settings', $s);
    if (!$wasPublished && !empty($s['published'])) myf_course_notify_publish((int) $s['year']);
    // Wartungsseite gleich mit aktualisieren (Name, Logo, Anschrift oder Texte können sich geändert haben)
    if (function_exists('myf_maint_sync') && ($req->has_param('brand') || $req->has_param('maint'))) myf_maint_sync(true);
    return myf_settings_admin();
}

// Tagsüber erreichbar (werktags): wie viele Kräfte, davon Atemschutz (G26 gültig), Maschinisten, Gruppen-/Zugführer – aus dem Profil-Häkchen „tagsüber erreichbar“
function myf_day_availability() {
    global $wpdb;
    $today = current_time('Y-m-d');
    $ms = $wpdb->get_results('SELECT id, agt, g26_until FROM ' . myf_t('members') . " WHERE active = 1 AND day_available = 1 AND dept = 'einsatz'");
    if (!$ms) return ['total' => 0, 'agt' => 0, 'ma' => 0, 'gf' => 0, 'zf' => 0];
    $ids = array_map(function ($m) { return (int) $m->id; }, $ms);
    $tr = $wpdb->get_results('SELECT mt.member_id, t.name FROM ' . myf_t('member_traits') . ' mt JOIN ' . myf_t('traits') . ' t ON t.id = mt.trait_id WHERE mt.member_id IN (' . implode(',', $ids) . ')');
    $has = function ($re) use ($tr) { $n = []; foreach ($tr as $r) if (preg_match($re, $r->name)) $n[(int) $r->member_id] = 1; return count($n); };
    return ['total' => count($ms), 'agt' => count(array_filter($ms, function ($m) use ($today) { return $m->agt && $m->g26_until && $m->g26_until >= $today; })),
        'ma' => $has('/maschinist/i'), 'gf' => $has('/gruppenf/i'), 'zf' => $has('/zugf|wehrf/i')];
}

// Jahresbericht (Zahlen fürs Jahr, ohne Namen): Einsätze nach Art/Monat/Einheit, Beteiligung, Übungen, Lehrgänge, Mitglieder, Fahrzeuge
function myf_api_admin_yearreport(WP_REST_Request $req) {
    global $wpdb;
    $y = (int) ($req->get_param('year') ?: current_time('Y'));
    $from = "$y-01-01 00:00:00"; $to = "$y-12-31 23:59:59";
    $inc = $wpdb->get_results($wpdb->prepare('SELECT i.id, i.category, i.start, i.end, i.unit, (SELECT COUNT(*) FROM ' . myf_t('participation') . ' p WHERE p.incident_id = i.id) AS parts FROM ' . myf_t('incidents') . " i WHERE i.kind = 'einsatz' AND i.source <> 'test' AND i.start BETWEEN %s AND %s", $from, $to));
    $cats = ['brand' => 0, 'th' => 0, 'vu' => 0, 'fehl' => 0, 'sonst' => 0]; $months = array_fill(1, 12, 0); $units = []; $partsSum = 0; $hours = 0;
    foreach ($inc as $i) { $cats[isset($cats[$i->category]) ? $i->category : 'sonst']++; $months[(int) substr($i->start, 5, 2)]++; $units[$i->unit ?: '–'] = ($units[$i->unit ?: '–'] ?? 0) + 1; $partsSum += (int) $i->parts;
        if ($i->end) $hours += max(0, (strtotime($i->end) - strtotime($i->start)) / 3600); }
    $ueb = $wpdb->get_row($wpdb->prepare('SELECT COUNT(*) n, AVG((SELECT COUNT(*) FROM ' . myf_t('participation') . ' p WHERE p.incident_id = i.id)) a FROM ' . myf_t('incidents') . " i WHERE i.kind = 'uebung' AND i.start BETWEEN %s AND %s", $from, $to));
    // Dienste des Jahres: von Hand + Dienstplan-Kalender (zusammengeführt, ohne abgesagte), nur Übungs-/Dienstabende
    $drills = function_exists('myf_drills_merged') ? count(array_filter(myf_drills_merged($wpdb->get_results($wpdb->prepare('SELECT * FROM ' . myf_t('drills') . ' WHERE date BETWEEN %s AND %s', "$y-01-01", "$y-12-31")),
        array_values(array_filter(myf_drill_cal_events(), function ($c) use ($y) { return substr($c['date'], 0, 4) === (string) $y; }))), function ($x) { return ($x['source'] ?? '') !== 'entfernt' && ($x['cal_kind'] ?? 'dienst') === 'dienst'; }))
        : (int) $wpdb->get_var($wpdb->prepare('SELECT COUNT(*) FROM ' . myf_t('drills') . ' WHERE date BETWEEN %s AND %s', "$y-01-01", "$y-12-31"));
    $quals = $wpdb->get_results($wpdb->prepare('SELECT title, COUNT(*) n FROM ' . myf_t('quals') . ' WHERE year = %d OR YEAR(date) = %d GROUP BY title ORDER BY n DESC, title', $y, $y));
    $mem = $wpdb->get_row($wpdb->prepare('SELECT COUNT(*) total, SUM(dept = \'einsatz\') einsatz, SUM(agt = 1) agt, SUM(agt = 1 AND g26_until >= %s) agt_ok, SUM(YEAR(joined) = %d) joined FROM ' . myf_t('members') . ' WHERE active = 1', current_time('Y-m-d'), $y));
    $veh = $wpdb->get_results($wpdb->prepare('SELECT v.name, COUNT(t.id) trips, MAX(t.km_end) - MIN(COALESCE(t.km_start, t.km_end)) km, SUM(t.fuel_l) fuel, SUM(t.incident_id IS NOT NULL) inc FROM ' . myf_t('vehicles') . ' v LEFT JOIN ' . myf_t('trips') . ' t ON t.vehicle_id = v.id AND t.storno_of IS NULL AND t.start BETWEEN %s AND %s WHERE v.active = 1 GROUP BY v.id, v.name ORDER BY v.name', $from, $to));
    $mw = (int) $wpdb->get_var($wpdb->prepare('SELECT COUNT(*) FROM ' . myf_t('defects') . ' WHERE created BETWEEN %s AND %s', $from, $to));
    return ['year' => $y, 'org' => myf_brand()['org'], 'incidents' => ['total' => count($inc), 'cats' => $cats, 'months' => array_values($months), 'units' => $units, 'parts_sum' => $partsSum,
            'parts_avg' => count($inc) ? round($partsSum / count($inc), 1) : 0, 'hours' => round($hours)],
        'uebungen' => ['n' => (int) $ueb->n, 'avg' => round((float) $ueb->a, 1)], 'drills' => $drills,
        'quals' => array_map(function ($q) { return ['title' => $q->title, 'n' => (int) $q->n]; }, $quals),
        'members' => ['total' => (int) $mem->total, 'einsatz' => (int) $mem->einsatz, 'agt' => (int) $mem->agt, 'agt_ok' => (int) $mem->agt_ok, 'joined' => (int) $mem->joined],
        'vehicles' => array_map(function ($v) { return ['name' => $v->name, 'trips' => (int) $v->trips, 'km' => $v->km !== null ? max(0, (int) $v->km) : null, 'fuel' => $v->fuel !== null ? round((float) $v->fuel) : null, 'inc' => (int) $v->inc]; }, $veh),
        'defects' => $mw, 'units' => myf_units()];
}

// --- Mitglieder ---

// Doppelte Mitglieder (gleicher Name, beide aktiv) – entstehen durch Import + Hand-Anlage; Paare [behalten, auflösen, name]
function myf_member_dupes() {
    global $wpdb;
    $by = [];
    foreach ($wpdb->get_results('SELECT id, name, user_id, joined, birth_date FROM ' . myf_t('members') . ' WHERE active = 1 ORDER BY id') as $m) {
        $k = preg_replace('/[^a-z0-9]/', '', strtolower(remove_accents(str_replace('ß', 'ss', $m->name))));
        if ($k !== '') $by[$k][] = $m;
    }
    $out = [];
    foreach ($by as $rows) if (count($rows) > 1) {
        // Behalten: der mit Konto, sonst der mit mehr Daten, sonst der ältere Eintrag
        usort($rows, function ($a, $b) { $sa = ($a->user_id ? 4 : 0) + ($a->birth_date ? 1 : 0) + ($a->joined ? 1 : 0); $sb = ($b->user_id ? 4 : 0) + ($b->birth_date ? 1 : 0) + ($b->joined ? 1 : 0); return $sb <=> $sa ?: $a->id <=> $b->id; });
        for ($i = 1; $i < count($rows); $i++) $out[] = ['keep' => (int) $rows[0]->id, 'drop' => (int) $rows[$i]->id, 'name' => $rows[0]->name, 'keep_account' => (bool) $rows[0]->user_id, 'drop_account' => (bool) $rows[$i]->user_id];
    }
    return $out;
}
// Zusammenführen: alle Verweise (Beteiligung, Fahrten, Lehrgänge, Kleidung, Dienste …) auf das behaltene Mitglied umhängen,
// leere Felder aus dem Doppelten übernehmen, Doppelten löschen. Protokolliert.
function myf_api_admin_member_merge(WP_REST_Request $req) {
    global $wpdb;
    $keep = (int) $req->get_param('keep'); $drop = (int) $req->get_param('drop');
    $mt = myf_t('members');
    $k = $wpdb->get_row($wpdb->prepare("SELECT * FROM $mt WHERE id = %d", $keep)); $d = $wpdb->get_row($wpdb->prepare("SELECT * FROM $mt WHERE id = %d", $drop));
    if (!$k || !$d || $keep === $drop) return myf_err('Mitglied nicht gefunden.', 404);
    if ($k->user_id && $d->user_id && (int) $k->user_id !== (int) $d->user_id) return myf_err('Beide Einträge haben ein eigenes Konto – bitte zuerst eines der Konten unter „Konto“ entfernen.');
    $pfx = myf_t(''); $moved = [];
    $demoPfx = $wpdb->prefix . 'ffl_demo_';
    foreach ((array) $wpdb->get_col($wpdb->prepare('SHOW TABLES LIKE %s', $wpdb->esc_like($pfx) . '%')) as $t) {
        if ($t === $mt) continue;
        if (strpos($pfx, 'demo_') === false && strpos($t, $demoPfx) === 0) continue; // Demo-Bestand hat eigene Mitglieder-IDs – nie mitanfassen
        $cols = array_map(function ($c) { return $c->Field; }, (array) $wpdb->get_results("SHOW COLUMNS FROM `$t`"));
        foreach (array_intersect($cols, ['member_id', 'driver_id', 'author_member_id', 'by_member_id']) as $c) {
            $n = (int) $wpdb->query($wpdb->prepare("UPDATE IGNORE `$t` SET `$c` = %d WHERE `$c` = %d", $keep, $drop));
            $wpdb->query($wpdb->prepare("DELETE FROM `$t` WHERE `$c` = %d", $drop)); // Rest = schon beim Behaltenen vorhanden (eindeutige Schlüssel)
            if ($n) $moved[str_replace($pfx, '', $t)] = $n;
        }
    }
    // Leere Felder auffüllen, AGT/Tagesverfügbarkeit zusammenziehen, Bemerkungen anhängen
    $upd = [];
    foreach (['user_id', 'g26_until', 'sizes', 'birth_date', 'birth_place', 'street', 'phone', 'rank_since', 'joined', 'dept_since'] as $f) if (empty($k->$f) && !empty($d->$f)) $upd[$f] = $d->$f;
    if ($k->dienstgrad === '' && $d->dienstgrad !== '') $upd['dienstgrad'] = $d->dienstgrad;
    foreach (['agt', 'day_available', 'can_notice'] as $f) if (!$k->$f && $d->$f) $upd[$f] = 1;
    if ((string) $d->note !== '' && strpos((string) $k->note, (string) $d->note) === false) $upd['note'] = trim((string) $k->note . "\n" . $d->note);
    if ($upd) $wpdb->update($mt, $upd, ['id' => $keep]);
    $wpdb->delete($mt, ['id' => $drop]);
    if (function_exists('myf_audit_write')) myf_audit_write('admin', get_current_user_id(), myf_actor(), 'mitglied:zusammengefuehrt', 'member', $keep, ['name' => $k->name, 'aufgeloest' => $drop, 'verschoben' => $moved, 'uebernommen' => array_keys($upd)]);
    return ['ok' => true, 'moved' => $moved];
}

function myf_api_admin_member(WP_REST_Request $req) {
    global $wpdb;
    $name = sanitize_text_field((string) $req->get_param('name'));
    if ($name === '') return myf_err('Name fehlt.');
    $d = ['name' => $name, 'unit' => myf_unit_ok($req->get_param('unit'))];
    if ($req->has_param('active')) $d['active'] = $req->get_param('active') ? 1 : 0;
    if ($req->has_param('birth_date')) $d['birth_date'] = myf_date_or_null($req->get_param('birth_date'));
    if ($req->has_param('rank')) $d['dienstgrad'] = mb_substr(sanitize_text_field((string) $req->get_param('rank')), 0, 60);
    if ($req->has_param('rank_since')) $d['rank_since'] = myf_date_or_null($req->get_param('rank_since'));
    if ($req->has_param('joined')) $d['joined'] = myf_date_or_null($req->get_param('joined'));
    if ($req->has_param('dept') && isset(MYF_DEPTS[$req->get_param('dept')])) {
        $d['dept'] = $req->get_param('dept');
        $id0 = (int) $req->get_param('id');
        $old = $id0 ? $wpdb->get_var($wpdb->prepare('SELECT dept FROM ' . myf_t('members') . ' WHERE id = %d', $id0)) : null;
        if ($old !== $d['dept']) $d['dept_since'] = current_time('Y-m-d');
    }
    foreach (['birth_place' => 80, 'street' => 120, 'phone' => 40] as $k => $len) if ($req->has_param($k)) $d[$k] = mb_substr(sanitize_text_field((string) $req->get_param($k)), 0, $len);
    $id = (int) $req->get_param('id');
    if ($id) {
        $wpdb->update(myf_t('members'), $d, ['id' => $id]);
        $uid = (int) $wpdb->get_var($wpdb->prepare('SELECT user_id FROM ' . myf_t('members') . ' WHERE id = %d', $id));
        if ($uid && ($u = get_userdata($uid)) && !user_can($u, 'edit_posts')) {
            $parts = array_map('trim', explode(',', $name, 2));
            wp_update_user(['ID' => $uid, 'last_name' => $parts[0], 'first_name' => $parts[1] ?? '', 'display_name' => trim(($parts[1] ?? '') . ' ' . $parts[0])]);
        }
    } else { $d['ics_ver'] = wp_generate_password(8, false); $wpdb->insert(myf_t('members'), $d); $id = $wpdb->insert_id; }
    $res = ['id' => $id];
    if ($req->has_param('email')) {
        $acc = myf_ensure_account($id, (string) $req->get_param('email'), (bool) $req->get_param('invite'));
        if (is_wp_error($acc)) return $acc;
        $res['user_id'] = $acc;
    }
    return $res;
}

function myf_api_admin_member_invite(WP_REST_Request $req) {
    global $wpdb;
    $m = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('members') . ' WHERE id = %d', (int) $req->get_param('id')));
    if (!$m || !$m->user_id) return myf_err('Dieses Mitglied hat noch kein Konto. Bitte zuerst eine E-Mail-Adresse eintragen.');
    wp_new_user_notification((int) $m->user_id, null, 'user');
    return ['ok' => true, 'id' => (int) $m->id];
}

function myf_api_admin_members_bulk(WP_REST_Request $req) {
    global $wpdb;
    $existing = array_map('mb_strtolower', $wpdb->get_col('SELECT name FROM ' . myf_t('members')));
    $added = 0; $skipped = 0; $errors = [];
    foreach ((array) $req->get_param('items') as $p) {
        $p = (array) $p;
        $name = sanitize_text_field((string) ($p['name'] ?? ''));
        if ($name === '' || in_array(mb_strtolower($name), $existing, true)) { $skipped++; continue; }
        $wpdb->insert(myf_t('members'), ['name' => $name, 'unit' => myf_unit_ok($p['unit'] ?? ''),
            'active' => 1, 'ics_ver' => wp_generate_password(8, false)]);
        $id = $wpdb->insert_id;
        $existing[] = mb_strtolower($name);
        $added++;
        if (!empty($p['email'])) {
            $acc = myf_ensure_account($id, (string) $p['email'], (bool) $req->get_param('invite'));
            if (is_wp_error($acc)) $errors[] = $name . ': ' . $acc->get_error_message();
        }
    }
    return ['added' => $added, 'skipped' => $skipped, 'errors' => $errors];
}

function myf_api_admin_member_delete(WP_REST_Request $req) {
    global $wpdb;
    $id = (int) $req->get_param('id');
    $m = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('members') . ' WHERE id = %d', $id));
    if (!$m) return ['ok' => true];
    // Mit Einsatz-/Dienstteilnahmen oder Fahrten nicht löschen: Statistik und Einsatzdokumentation bleiben vollständig – dafür gibt es „Anonymisieren“
    if ((int) $wpdb->get_var($wpdb->prepare('SELECT COUNT(*) FROM ' . myf_t('participation') . ' WHERE member_id = %d', $id))
        || (int) $wpdb->get_var($wpdb->prepare('SELECT COUNT(*) FROM ' . myf_t('trips') . ' WHERE driver_id = %d', $id)))
        return myf_err('Dieses Mitglied hat Einsätze, Übungen oder Fahrten. Damit die Dokumentation vollständig bleibt, bitte „Anonymisieren“ statt Löschen.');
    // Alles Persönliche dieses Mitglieds entfernen – keine verwaisten Einträge
    foreach (['needs', 'quals', 'agt_log', 'clothing', 'cloth_stock', 'member_traits', 'briefing_acks', 'drill_absence', 'duty_assign', 'board_rsvp', 'loans', 'member_history', 'notifications', 'messages', 'bookings', 'order_items', 'loop_members', 'loop_requests'] as $t)
        if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', myf_t($t)))) $wpdb->delete(myf_t($t), ['member_id' => $id]);
    foreach (['ideas', 'defects', 'team_tasks', 'devices', 'lockers'] as $t) if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', myf_t($t)))) $wpdb->update(myf_t($t), ['member_id' => null], ['member_id' => $id]);
    if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', myf_t('locker_log')))) $wpdb->update(myf_t('locker_log'), ['member_id' => null], ['member_id' => $id]);
    $wpdb->delete(myf_t('members'), ['id' => $id]);
    // Reines Mitglieder-Konto mit löschen (Konten von Verwaltern bleiben)
    $u = $m->user_id ? get_userdata((int) $m->user_id) : null;
    if ($u && myf_is_member_only($u)) {
        require_once ABSPATH . 'wp-admin/includes/user.php';
        wp_delete_user($u->ID);
    }
    return ['ok' => true];
}

// --- Lehrgänge und Vorlagen ---

function myf_clean_course($p) {
    $cost = isset($p['cost']) && $p['cost'] !== '' && $p['cost'] !== null ? round((float) str_replace(',', '.', (string) $p['cost']), 2) : null;
    return [
        'year' => (int) ($p['year'] ?? myf_settings()['year']),
        'cat' => isset($p['cat']) && isset(MYF_CATS[$p['cat']]) ? $p['cat'] : 'kreis_lg',
        'nr' => sanitize_text_field((string) ($p['nr'] ?? '')), 'title' => sanitize_text_field((string) ($p['title'] ?? '')),
        'short' => sanitize_text_field((string) ($p['short'] ?? '')), 'days' => sanitize_text_field((string) ($p['days'] ?? '')),
        'ue' => sanitize_text_field((string) ($p['ue'] ?? '')), 'locations' => sanitize_text_field((string) ($p['locations'] ?? '')),
        'prereq' => sanitize_textarea_field((string) ($p['prereq'] ?? '')), 'cost' => $cost,
        'note' => sanitize_textarea_field((string) ($p['note'] ?? '')), 'hidden' => empty($p['hidden']) ? 0 : 1, 'sort' => (int) ($p['sort'] ?? 0),
    ];
}

function myf_api_admin_course(WP_REST_Request $req) {
    global $wpdb;
    $d = myf_clean_course($req->get_params());
    if ($d['title'] === '') return myf_err('Bezeichnung fehlt.');
    $id = (int) $req->get_param('id');
    if ($id) $wpdb->update(myf_t('courses'), $d, ['id' => $id]);
    else { $wpdb->insert(myf_t('courses'), $d); $id = $wpdb->insert_id; }
    return ['id' => $id];
}

function myf_api_admin_course_delete(WP_REST_Request $req) {
    global $wpdb;
    $id = (int) $req->get_param('id');
    if ((int) $wpdb->get_var($wpdb->prepare('SELECT COUNT(*) FROM ' . myf_t('needs') . ' WHERE course_id = %d AND status IN (\'completed\',\'missed\')', $id))) {
        return myf_err('Bei diesem Lehrgang sind schon Teilnahmen als absolviert eingetragen. Er bleibt deshalb im Archiv; zum Verstecken „Für Mitglieder ausblenden“ nutzen.', 409);
    }
    $wpdb->delete(myf_t('needs'), ['course_id' => $id]);
    $wpdb->delete(myf_t('dates'), ['course_id' => $id]);
    $wpdb->delete(myf_t('courses'), ['id' => $id]);
    return ['ok' => true];
}

function myf_api_admin_courses_bulk(WP_REST_Request $req) {
    global $wpdb;
    $year = (int) $req->get_param('year');
    $added = 0; $updated = 0;
    foreach ((array) $req->get_param('items') as $p) {
        $p = (array) $p; $p['year'] = $year;
        $d = myf_clean_course($p);
        if ($d['title'] === '') continue;
        $id = $wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('courses') . ' WHERE year = %d AND nr = %s AND title = %s', $year, $d['nr'], $d['title']));
        if ($id) { unset($d['cost'], $d['note'], $d['hidden']); $wpdb->update(myf_t('courses'), $d, ['id' => $id]); $updated++; }
        else { $wpdb->insert(myf_t('courses'), $d); $added++; }
    }
    return ['added' => $added, 'updated' => $updated];
}

// Kopiert ganze Jahre oder einzelne Lehrgänge (ids), auch von/zu den Vorlagen (Jahr 0)
function myf_api_admin_courses_copy(WP_REST_Request $req) {
    global $wpdb;
    $to = (int) $req->get_param('to');
    $ids = array_filter(array_map('intval', (array) $req->get_param('ids')));
    if ($ids) {
        $rows = $wpdb->get_results('SELECT * FROM ' . myf_t('courses') . ' WHERE id IN (' . implode(',', $ids) . ')', ARRAY_A);
    } else {
        $from = (int) $req->get_param('from');
        if ($from === $to) return myf_err('Bitte zwei verschiedene Jahre angeben.');
        $rows = $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . myf_t('courses') . ' WHERE year = %d', $from), ARRAY_A);
    }
    $added = 0; $updated = 0;
    foreach ($rows as $r) {
        if ((int) $r['year'] === $to) continue;
        unset($r['id']); $r['year'] = $to;
        $existing = $wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('courses') . ' WHERE year = %d AND nr = %s AND title = %s', $to, $r['nr'], $r['title']));
        if ($existing) { $wpdb->update(myf_t('courses'), $r, ['id' => $existing]); $updated++; }
        else { $wpdb->insert(myf_t('courses'), $r); $added++; }
    }
    return ['added' => $added, 'updated' => $updated];
}

// --- Termine ---

function myf_api_admin_date(WP_REST_Request $req) {
    global $wpdb;
    $id = (int) $req->get_param('id');
    // Nur ändern, was mitgeschickt wurde (z. B. nur der Ablauf) – der Rest bleibt
    $d = [];
    if (!$id || $req->has_param('start')) $d['start_date'] = myf_date_or_null($req->get_param('start'));
    if (!$id || $req->has_param('end')) $d['end_date'] = myf_date_or_null($req->get_param('end'));
    foreach (['period', 'location'] as $k) if (!$id || $req->has_param($k)) $d[$k] = sanitize_text_field((string) $req->get_param($k));
    if (!$id || $req->has_param('slots')) $d['slots'] = max(0, (int) $req->get_param('slots'));
    if ($req->has_param('daytime')) $d['daytime'] = in_array($req->get_param('daytime'), ['tag', 'abend'], true) ? $req->get_param('daytime') : '';
    if ($req->has_param('sessions')) {
        $ses = myf_sessions_clean($req->get_param('sessions'));
        $d['sessions'] = $ses ? wp_json_encode($ses) : null;
        // Zeitraum folgt dem Ablauf (erster bis letzter Tag)
        if ($ses) { $d['start_date'] = $ses[0]['d']; $d['end_date'] = $ses[count($ses) - 1]['d']; }
    }
    if (!empty($d['start_date']) && !empty($d['end_date']) && $d['end_date'] < $d['start_date']) $d['end_date'] = $d['start_date'];
    if ($id) { $wpdb->update(myf_t('dates'), $d, ['id' => $id]); }
    else { $d['course_id'] = (int) $req->get_param('course_id'); $wpdb->insert(myf_t('dates'), $d); $id = $wpdb->insert_id; }
    return ['id' => $id];
}

// Vorlagen für den Ablauf (z. B. „2 Wochenenden + 3 Abende“): Tage relativ zum ersten Tag, je Feuerwehr gespeichert
function myf_session_tpls() { $t = get_option('myf_session_tpls', []); return is_array($t) ? array_values($t) : []; }
function myf_api_admin_date_tpl(WP_REST_Request $req) {
    $all = myf_session_tpls();
    $name = mb_substr(sanitize_text_field((string) $req->get_param('name')), 0, 60);
    if ($name === '') return myf_err('Bitte einen Namen für die Vorlage angeben.');
    $all = array_values(array_filter($all, function ($t) use ($name) { return $t['name'] !== $name; }));
    if (!$req->get_param('delete')) {
        $items = [];
        foreach ((array) $req->get_param('items') as $x) {
            $x = (array) $x; $o = (int) ($x['o'] ?? -1);
            if ($o < 0 || $o > 120) continue;
            $f = preg_match('/^\d{2}:\d{2}$/', (string) ($x['f'] ?? '')) ? $x['f'] : ''; $t = preg_match('/^\d{2}:\d{2}$/', (string) ($x['t'] ?? '')) ? $x['t'] : '';
            $items[] = ['o' => $o, 'f' => $f, 't' => $t];
        }
        if (!$items) return myf_err('Die Vorlage ist leer – erst Tage eintragen.');
        $all[] = ['name' => $name, 'items' => array_slice($items, 0, 40)];
    }
    update_option('myf_session_tpls', array_slice($all, 0, 30), false);
    return ['ok' => true];
}

function myf_api_admin_date_delete(WP_REST_Request $req) {
    global $wpdb;
    $id = (int) $req->get_param('id');
    if ((int) $wpdb->get_var($wpdb->prepare('SELECT COUNT(*) FROM ' . myf_t('needs') . ' WHERE date_id = %d AND status IN (\'completed\',\'missed\')', $id))) {
        return myf_err('Für diesen Termin sind schon Teilnahmen eingetragen. Er bleibt deshalb im Archiv.', 409);
    }
    $wpdb->query($wpdb->prepare('UPDATE ' . myf_t('needs') . " SET date_id = NULL, status = 'open' WHERE date_id = %d", $id));
    $wpdb->delete(myf_t('dates'), ['id' => $id]);
    return ['ok' => true];
}

// Alle Zugeteilten eines Termins als „absolviert“ eintragen
function myf_api_admin_date_complete(WP_REST_Request $req) {
    global $wpdb;
    $n = $wpdb->query($wpdb->prepare('UPDATE ' . myf_t('needs') . " SET status = 'completed' WHERE date_id = %d AND status = 'assigned'", (int) $req->get_param('id')));
    return ['updated' => (int) $n];
}

// --- Bedarf / Zuteilung / Teilnahme ---

function myf_api_admin_need(WP_REST_Request $req) {
    global $wpdb;
    $id = (int) $req->get_param('id');
    $status = in_array($req->get_param('status'), MYF_STATUS, true) ? $req->get_param('status') : 'open';
    $dateId = (int) $req->get_param('date_id');
    // Termin muss zum Lehrgang der Meldung gehören
    $courseOfNeed = $id ? (int) $wpdb->get_var($wpdb->prepare('SELECT course_id FROM ' . myf_t('needs') . ' WHERE id = %d', $id)) : (int) $req->get_param('course_id');
    if ($dateId && (int) $wpdb->get_var($wpdb->prepare('SELECT course_id FROM ' . myf_t('dates') . ' WHERE id = %d', $dateId)) !== $courseOfNeed) {
        return myf_err('Dieser Termin gehört zu einem anderen Lehrgang.');
    }
    $d = ['status' => $status, 'date_id' => in_array($status, ['assigned', 'completed', 'missed'], true) && $dateId ? $dateId : null,
        'admin_note' => sanitize_text_field((string) $req->get_param('admin_note'))];
    if ($id) {
        // Termin behalten, wenn nur von „zugeteilt“ auf „absolviert“ gewechselt wird
        if (!$dateId && in_array($status, ['completed', 'missed'], true)) unset($d['date_id']);
        $before = $wpdb->get_row($wpdb->prepare('SELECT status, date_id FROM ' . myf_t('needs') . ' WHERE id = %d', $id));
        $wpdb->update(myf_t('needs'), $d, ['id' => $id]);
        // Nach der Freigabe: Mitglied erfährt jede Änderung an seiner Zuteilung direkt
        if ($before && ($before->status !== $status || (int) $before->date_id !== (int) ($d['date_id'] ?? $before->date_id))) myf_course_notify_change($id);
    } else {
        $d['member_id'] = (int) $req->get_param('member_id');
        $d['course_id'] = (int) $req->get_param('course_id');
        $d['comment'] = sanitize_textarea_field((string) $req->get_param('comment'));
        $d['created'] = current_time('mysql');
        if (!$d['member_id'] || !$d['course_id']) return myf_err('Mitglied oder Lehrgang fehlt.');
        if ($wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('needs') . ' WHERE member_id = %d AND course_id = %d', $d['member_id'], $d['course_id']))) {
            return myf_err('Für dieses Mitglied ist der Lehrgang schon eingetragen.', 409);
        }
        $wpdb->insert(myf_t('needs'), $d);
        $id = $wpdb->insert_id;
    }
    return ['id' => $id];
}

// Lehrgangs-Zuteilung an das Mitglied melden – nur wenn die Zuteilung des Jahres freigegeben ist (vorher sieht das Mitglied sie nicht)
function myf_course_need_label($n) {
    global $wpdb;
    $dt = $n->date_id ? $wpdb->get_row($wpdb->prepare('SELECT start_date, end_date FROM ' . myf_t('dates') . ' WHERE id = %d', $n->date_id)) : null;
    $when = $dt && $dt->start_date ? ' am ' . date('d.m.Y', strtotime($dt->start_date)) . ($dt->end_date && $dt->end_date !== $dt->start_date ? '–' . date('d.m.Y', strtotime($dt->end_date)) : '') : '';
    return ['assigned' => 'zugeteilt' . $when, 'waiting' => 'auf der Warteliste', 'declined' => 'diesmal leider nicht zugeteilt',
        'completed' => 'als absolviert eingetragen – steht jetzt in deiner Ausbildung', 'missed' => 'als „nicht teilgenommen“ eingetragen'][$n->status] ?? '';
}
function myf_course_notify_change($needId) {
    global $wpdb;
    $n = $wpdb->get_row($wpdb->prepare('SELECT n.*, c.title, c.short, c.year FROM ' . myf_t('needs') . ' n JOIN ' . myf_t('courses') . ' c ON c.id = n.course_id WHERE n.id = %d', $needId));
    $s = myf_settings();
    if (!$n || ((int) $n->year === (int) $s['year'] && empty($s['published']))) return;
    $l = myf_course_need_label($n);
    if ($l !== '') myf_notify([(int) $n->member_id], 'course', 'Lehrgang ' . ($n->short ?: $n->title) . ': ' . $l, $n->admin_note ? (string) $n->admin_note : '', 'courses');
}
// Freigabe der Zuteilung: jedes betroffene Mitglied bekommt eine Zusammenfassung (einmal je Jahr)
function myf_course_notify_publish($year) {
    global $wpdb;
    $rows = $wpdb->get_results($wpdb->prepare('SELECT n.*, c.title, c.short FROM ' . myf_t('needs') . ' n JOIN ' . myf_t('courses') . " c ON c.id = n.course_id WHERE c.year = %d AND n.status IN ('assigned','waiting','declined') ORDER BY n.member_id", $year));
    $by = [];
    foreach ($rows as $n) $by[(int) $n->member_id][] = ($n->short ?: $n->title) . ': ' . myf_course_need_label($n);
    foreach ($by as $mid => $lines) myf_notify([$mid], 'course', 'Lehrgänge ' . $year . ': Zuteilung ist da', implode("\n", $lines), 'courses', 'cpub:' . $year . ':' . $mid);
}

function myf_api_admin_need_delete(WP_REST_Request $req) {
    global $wpdb;
    $wpdb->delete(myf_t('needs'), ['id' => (int) $req->get_param('id')]);
    return ['ok' => true];
}

function myf_api_admin_qual(WP_REST_Request $req) {
    global $wpdb;
    $title = sanitize_text_field((string) $req->get_param('title'));
    if ($title === '') return myf_err('Bitte den Lehrgang angeben.');
    $year = (int) $req->get_param('year');
    $short = sanitize_text_field((string) $req->get_param('short'));
    // Kürzel aus den bekannten Bezeichnungen ergänzen, wenn nicht mitgegeben
    if ($short === '' && function_exists('myf_course_titles')) foreach (myf_course_titles() as $c) if (mb_strtolower($c['title']) === mb_strtolower($title)) { $short = $c['short']; break; }
    $wpdb->insert(myf_t('quals'), ['member_id' => (int) $req->get_param('member_id'), 'title' => $title,
        'short' => $short, 'year' => $year > 1900 ? $year : null,
        'date' => myf_date_or_null($req->get_param('date')), 'note' => sanitize_text_field((string) $req->get_param('note'))]);
    return ['id' => $wpdb->insert_id];
}

function myf_api_admin_qual_delete(WP_REST_Request $req) {
    global $wpdb;
    $wpdb->delete(myf_t('quals'), ['id' => (int) $req->get_param('id')]);
    return ['ok' => true];
}

// --- Atemschutz ---

function myf_api_admin_agt(WP_REST_Request $req) {
    global $wpdb;
    $d = [];
    if ($req->has_param('agt')) $d['agt'] = $req->get_param('agt') ? 1 : 0;
    $mid = (int) $req->get_param('id');
    if ($req->has_param('g26_until')) {
        // G26 ist eine Gesundheitsangabe: nur bestätigt ändern – mit Nachweis (abgeheftet oder Scan/Foto) und Eintrag im Atemschutz-Verlauf
        $until = myf_date_or_null($req->get_param('g26_until'));
        $proof = (string) $req->get_param('proof');
        if ($until && !in_array($proof, ['filed', 'file'], true)) return myf_err('Bitte bestätigen: Liegt die G26-Bescheinigung vor (abgeheftet) – oder Scan/Foto anhängen.');
        $file = '';
        if ($proof === 'file') {
            $f = $req->get_file_params()['file'] ?? null;
            if (!$f || !empty($f['error']) || !is_uploaded_file($f['tmp_name'])) return myf_err('Bitte Scan oder Foto der Bescheinigung wählen.');
            $ext = strtolower(pathinfo((string) $f['name'], PATHINFO_EXTENSION));
            if (!in_array($ext, ['jpg', 'jpeg', 'png', 'webp', 'heic', 'pdf'], true)) return myf_err('Bitte ein Foto (JPG, PNG, HEIC) oder PDF.');
            if ($f['size'] > 15 * MB_IN_BYTES) return myf_err('Höchstens 15 MB.');
            if (!myf_upload_sniff_ok($f['tmp_name'], $ext)) return myf_err('Die Datei passt nicht zur Endung – bitte das Foto oder PDF direkt hochladen.');
            $file = 'g26-' . wp_generate_password(24, false) . '.' . $ext;
            if (!@move_uploaded_file($f['tmp_name'], myf_mat_dir() . '/' . $file)) return myf_err('Datei konnte nicht gespeichert werden.');
        }
        $d['g26_until'] = $until;
        $done = myf_date_or_null($req->get_param('g26_done')) ?: current_time('Y-m-d');
        $note = ($until ? 'gültig bis ' . date('d.m.Y', strtotime($until)) : 'G26-Datum entfernt') . ($proof === 'filed' ? ' · Bescheinigung abgeheftet' : ($proof === 'file' ? ' · Scan/Foto hinterlegt' : ''));
        $extra = trim(sanitize_text_field((string) $req->get_param('note')));
        $wpdb->insert(myf_t('agt_log'), ['member_id' => $mid, 'date' => $done, 'kind' => 'g26', 'note' => mb_substr($note . ($extra !== '' ? ' · ' . $extra : ''), 0, 255), 'file' => $file, 'by_name' => myf_actor()]);
    }
    if ($d) $wpdb->update(myf_t('members'), $d, ['id' => $mid]);
    return ['ok' => true, 'id' => $mid];
}

function myf_api_admin_agtlog_bulk(WP_REST_Request $req) {
    global $wpdb;
    $date = myf_date_or_null($req->get_param('date'));
    if (!$date) return myf_err('Bitte ein Datum angeben.');
    $kind = isset(MYF_AGT_KINDS[$req->get_param('kind')]) ? $req->get_param('kind') : 'strecke';
    $note = sanitize_text_field((string) $req->get_param('note'));
    $n = 0;
    foreach (array_filter(array_map('intval', (array) $req->get_param('member_ids'))) as $mid) {
        // Derselbe Nachweis am selben Tag nicht doppelt (z. B. zweimal auf „eintragen“ getippt)
        if ($wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('agt_log') . ' WHERE member_id = %d AND kind = %s AND date = %s AND note = %s', $mid, $kind, $date, $note))) continue;
        $wpdb->insert(myf_t('agt_log'), ['member_id' => $mid, 'date' => $date, 'kind' => $kind, 'note' => $note, 'by_name' => myf_actor()]);
        $n++;
    }
    return ['added' => $n];
}

function myf_api_admin_agtlog_delete(WP_REST_Request $req) {
    global $wpdb;
    $wpdb->delete(myf_t('agt_log'), ['id' => (int) $req->get_param('id')]);
    return ['ok' => true];
}

// --- Kleidung ---

function myf_api_admin_clothing(WP_REST_Request $req) {
    global $wpdb;
    $id = (int) $req->get_param('id');
    $d = [];
    foreach (['item', 'size', 'reason', 'admin_note'] as $k) if ($req->has_param($k)) $d[$k] = sanitize_text_field((string) $req->get_param($k));
    if ($req->has_param('comment')) $d['comment'] = sanitize_textarea_field((string) $req->get_param('comment'));
    if ($req->has_param('kind')) $d['kind'] = isset(MYF_CLOTHING_KINDS[$req->get_param('kind')]) ? $req->get_param('kind') : 'ersatz';
    if ($req->has_param('qty')) $d['qty'] = max(1, min(20, (int) $req->get_param('qty')));
    if ($req->has_param('status')) $d['status'] = in_array($req->get_param('status'), MYF_CLOTHING_STATUS, true) ? $req->get_param('status') : 'open';
    if ($id) {
        $before = $wpdb->get_row($wpdb->prepare('SELECT member_id, item, status FROM ' . myf_t('clothing') . ' WHERE id = %d', $id));
        $wpdb->update(myf_t('clothing'), $d, ['id' => $id]);
        if (($d['status'] ?? '') === 'issued' && $req->get_param('add_stock')) myf_stock_from_request($id);
        $lbl = ['ordered' => 'ist bestellt', 'issued' => 'liegt zur Ausgabe bereit / ist ausgegeben', 'declined' => 'wurde abgelehnt'];
        if ($before && isset($d['status']) && $d['status'] !== $before->status && isset($lbl[$d['status']])) {
            myf_notify([(int) $before->member_id], 'clothing', 'Kleidung: ' . $before->item . ' ' . $lbl[$d['status']], (string) ($d['admin_note'] ?? ''), 'clothing');
        }
    } else {
        $d['member_id'] = (int) $req->get_param('member_id');
        if (!$d['member_id'] || empty($d['item'])) return myf_err('Mitglied oder Kleidungsstück fehlt.');
        $d += ['status' => 'open', 'created' => current_time('mysql')];
        $wpdb->insert(myf_t('clothing'), $d);
        $id = $wpdb->insert_id;
    }
    return ['id' => $id];
}

function myf_api_admin_clothing_delete(WP_REST_Request $req) {
    global $wpdb;
    $wpdb->delete(myf_t('clothing'), ['id' => (int) $req->get_param('id')]);
    return ['ok' => true];
}

// --- Anregungen ---

function myf_api_admin_idea(WP_REST_Request $req) {
    global $wpdb;
    $id = (int) $req->get_param('id');
    if (!$wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('ideas') . ' WHERE id = %d', $id))) return myf_err('Anregung nicht gefunden.', 404);
    $d = [];
    if ($req->has_param('status')) $d['status'] = in_array($req->get_param('status'), MYF_IDEA_STATUS, true) ? $req->get_param('status') : 'new';
    if ($req->has_param('answer')) {
        $d['answer'] = sanitize_textarea_field((string) $req->get_param('answer'));
        $d['answered'] = $d['answer'] !== '' ? current_time('mysql') : null;
    }
    if ($req->has_param('recipient') && isset(myf_idea_to()[$req->get_param('recipient')])) $d['recipient'] = $req->get_param('recipient');
    if ($req->has_param('archived')) $d['archived'] = $req->get_param('archived') ? 1 : 0;
    if ($d) $wpdb->update(myf_t('ideas'), $d, ['id' => $id]);
    if (isset($d['answer']) && $d['answer'] !== '') {
        $i = $wpdb->get_row($wpdb->prepare('SELECT member_id, subject FROM ' . myf_t('ideas') . ' WHERE id = %d', $id));
        if ($i && $i->member_id) myf_notify([(int) $i->member_id], 'idea', 'Antwort auf deine Anregung', ($i->subject ?: 'Anregung') . ': ' . wp_trim_words($d['answer'], 30), 'ideas');
    }
    return ['id' => $id];
}
