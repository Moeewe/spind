<?php
/** Ausstattung (Kleiderkammer mit Verlauf), Größen, Merkmale & Fähigkeiten der Mitglieder. */

defined('ABSPATH') || exit;

const MYF_SIZE_KEYS = ['jacke' => 'Jacke', 'hose' => 'Hose', 'schuh' => 'Schuhe', 'kopf' => 'Kopfumfang', 'hand' => 'Handschuhe', 'shirt' => 'Shirt / Pullover'];
const MYF_EMPLOYMENT = ['ehrenamt' => 'nein – nur ehrenamtlich', 'hauptamt' => 'ja – Berufs-/Werkfeuerwehr', 'rd' => 'ja – Rettungsdienst', 'sonst' => 'Sonstiges'];
// Tagsüber erreichbar (Tagesalarm) – ein Feld statt „tagsüber verfügbar“ + „Arbeitet in …“
const MYF_DAYTIME = [0 => 'nein / selten', 1 => 'ja – arbeite im Ort', 2 => 'ja – oft im Homeoffice / zu Hause', 3 => 'teilweise (Schicht, Teilzeit)'];
const MYF_STOCK_STATUS = ['in_use' => 'Im Gebrauch', 'returned' => 'Zurückgegeben', 'discarded' => 'Ausgesondert', 'lost' => 'Verloren'];
const MYF_CLOTH_CATS = ['psa_brand' => 'PSA Brandschutz', 'psa_th' => 'PSA Technische Hilfe', 'wetter' => 'Wetterschutz', 'dienst' => 'Dienstkleidung', 'sonst' => 'Sonstiges'];
const MYF_TRAIT_CATS = ['funktion' => 'Funktionen', 'fs' => 'Führerscheine', 'fach' => 'Beruf & Fachkunde', 'sonst' => 'Sonstiges'];

// Auswahllisten, die die Verwaltung selbst anpassen kann (Größenfelder, Kleidungs-Bereiche, Tätigkeiten, Merkmal-Bereiche)
const MYF_LISTS = ['size_keys' => MYF_SIZE_KEYS, 'cloth_cats' => MYF_CLOTH_CATS, 'employment' => MYF_EMPLOYMENT, 'trait_cats' => MYF_TRAIT_CATS];

function myf_list($name) {
    $own = (myf_settings()['lists'] ?? [])[$name] ?? null;
    return is_array($own) && $own ? $own : MYF_LISTS[$name];
}

// Schlüssel, die noch verwendet werden, dürfen nicht aus der Liste verschwinden
function myf_list_used($name) {
    global $wpdb;
    $q = ['size_keys' => 'SELECT DISTINCT size_key FROM ' . myf_t('cloth_items') . " WHERE size_key <> ''",
        'cloth_cats' => 'SELECT DISTINCT cat FROM ' . myf_t('cloth_items'),
        'employment' => 'SELECT DISTINCT employment FROM ' . myf_t('members') . " WHERE employment IS NOT NULL AND employment <> ''",
        'trait_cats' => 'SELECT DISTINCT cat FROM ' . myf_t('traits')][$name];
    return array_map('strval', (array) $wpdb->get_col($q));
}

// Aus [[Schlüssel, Bezeichnung], …] eine saubere Liste machen; neue Einträge bekommen einen Schlüssel aus der Bezeichnung
function myf_clean_list($name, $rows) {
    $old = myf_list($name);
    $max = $name === 'size_keys' ? 10 : 20;
    $out = [];
    foreach ((array) $rows as $r) {
        $label = sanitize_text_field((string) ($r[1] ?? ''));
        if ($label === '') continue;
        $key = preg_replace('/[^a-z0-9_]/', '', strtolower((string) ($r[0] ?? '')));
        if ($key === '') {
            $base = substr(preg_replace('/[^a-z0-9]+/', '', strtolower(remove_accents($label))), 0, $max - 2) ?: 'x';
            $key = $base; $n = 2;
            while (isset($out[$key]) || isset($old[$key])) $key = substr($base, 0, $max - 2) . $n++;
        }
        $out[substr($key, 0, $max)] = mb_substr($label, 0, 60);
    }
    foreach (myf_list_used($name) as $k) if (!isset($out[$k]) && isset($old[$k])) $out[$k] = $old[$k];
    return $out ?: MYF_LISTS[$name];
}

function myf_install_equipment($c) {
    global $wpdb;
    $p = myf_t(''); // echte oder Demo-Tabellen (Demo-Modus)
    dbDelta("CREATE TABLE {$p}cloth_items (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        name varchar(80) NOT NULL,
        cat varchar(20) NOT NULL DEFAULT 'sonst',
        size_key varchar(10) NOT NULL DEFAULT '',
        procurable tinyint(1) NOT NULL DEFAULT 1,
        has_serial tinyint(1) NOT NULL DEFAULT 0,
        active tinyint(1) NOT NULL DEFAULT 1,
        sort int(11) NOT NULL DEFAULT 0,
        PRIMARY KEY  (id)
    ) $c;");
    // Ausgegebene Teile je Mitglied; zurückgegebene/ausgesonderte bleiben als Verlauf erhalten
    dbDelta("CREATE TABLE {$p}cloth_stock (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        member_id bigint(20) unsigned NOT NULL,
        item_id bigint(20) unsigned NULL,
        item_name varchar(80) NOT NULL,
        size varchar(30) NOT NULL DEFAULT '',
        qty smallint(5) unsigned NOT NULL DEFAULT 1,
        issued date NULL,
        status varchar(12) NOT NULL DEFAULT 'in_use',
        status_date date NULL,
        serial varchar(60) NOT NULL DEFAULT '',
        made_year smallint(5) unsigned NULL,
        note varchar(255) NOT NULL DEFAULT '',
        created datetime NOT NULL,
        PRIMARY KEY  (id),
        KEY member_id (member_id),
        KEY item_id (item_id)
    ) $c;");
    dbDelta("CREATE TABLE {$p}traits (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        name varchar(80) NOT NULL,
        cat varchar(20) NOT NULL DEFAULT 'sonst',
        sort int(11) NOT NULL DEFAULT 0,
        PRIMARY KEY  (id)
    ) $c;");
    dbDelta("CREATE TABLE {$p}member_traits (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        member_id bigint(20) unsigned NOT NULL,
        trait_id bigint(20) unsigned NOT NULL,
        note varchar(120) NOT NULL DEFAULT '',
        PRIMARY KEY  (id),
        UNIQUE KEY member_trait (member_id,trait_id),
        KEY trait_id (trait_id)
    ) $c;");

    if (!(int) $wpdb->get_var("SELECT COUNT(*) FROM {$p}cloth_items")) {
        // [Name, Bereich, Größenfeld, beschaffbar, mit Seriennummer]
        $items = [
            ['Feuerwehrhelm', 'psa_brand', 'kopf', 1, 1], ['Helmvisier', 'psa_brand', '', 1, 0], ['Nackenschutz', 'psa_brand', '', 1, 0],
            ['Flammschutzhaube', 'psa_brand', '', 1, 0], ['Einsatzjacke Brandschutz', 'psa_brand', 'jacke', 1, 1],
            ['Einsatzhose Brandschutz', 'psa_brand', 'hose', 1, 1], ['Feuerwehrhandschuhe Brandschutz', 'psa_brand', 'hand', 1, 0],
            ['Feuerwehrstiefel', 'psa_brand', 'schuh', 1, 0],
            ['TH-Jacke', 'psa_th', 'jacke', 1, 0], ['TH-Hose', 'psa_th', 'hose', 1, 0], ['TH-Handschuhe', 'psa_th', 'hand', 1, 0],
            ['Schnittschutzhose', 'psa_th', 'hose', 1, 1],
            ['Wetterschutzjacke', 'wetter', 'jacke', 1, 0], ['Parka', 'wetter', 'jacke', 0, 0], ['Warnweste', 'wetter', '', 1, 0],
            ['Dienstuniform Jacke', 'dienst', 'jacke', 1, 0], ['Dienstuniform Hose', 'dienst', 'hose', 1, 0], ['Diensthemd', 'dienst', 'shirt', 1, 0],
            ['Krawatte', 'dienst', '', 1, 0], ['Schirmmütze', 'dienst', 'kopf', 1, 0], ['Basecap', 'dienst', '', 1, 0], ['Dienst-Halbschuhe', 'dienst', 'schuh', 1, 0],
            ['T-Shirt', 'sonst', 'shirt', 1, 0], ['Poloshirt', 'sonst', 'shirt', 1, 0], ['Sweatshirt', 'sonst', 'shirt', 1, 0],
            ['Softshelljacke', 'sonst', 'jacke', 1, 0], ['Arbeitshose', 'sonst', 'hose', 1, 0], ['Strickmütze', 'sonst', '', 1, 0],
        ];
        foreach ($items as $i => $r) {
            $wpdb->insert("{$p}cloth_items", ['name' => $r[0], 'cat' => $r[1], 'size_key' => $r[2], 'procurable' => $r[3], 'has_serial' => $r[4], 'sort' => ($i + 1) * 10]);
        }
    }
    if (!(int) $wpdb->get_var("SELECT COUNT(*) FROM {$p}traits")) {
        $traits = [
            'funktion' => ['Seelsorge / PSU', 'Notfallsanitäter', 'Rettungssanitäter', 'Sanitäter / Erste-Hilfe-Ausbilder', 'Atemschutzgerätewart',
                'Gerätewart', 'Jugendfeuerwehrwart', 'Brandschutzerzieher', 'Ausbilder', 'Sicherheitsbeauftragter'],
            'fs' => ['Führerschein B', 'Führerschein BE', 'Führerschein C1', 'Führerschein C1E', 'Führerschein C', 'Führerschein CE', 'Feuerwehr-Führerschein'],
            'fach' => ['Elektriker', 'KFZ-Mechaniker', 'Metall / Schlosser', 'Landwirt', 'Bau / Zimmerer', 'Pflege / Medizin', 'IT', 'Drohnenpilot', 'Taucher', 'Fremdsprachen'],
        ];
        $i = 0;
        foreach ($traits as $cat => $names) foreach ($names as $n) $wpdb->insert("{$p}traits", ['name' => $n, 'cat' => $cat, 'sort' => ++$i * 10]);
    }
    // Bisherige Auswahlliste der Kleidermeldungen in den Katalog übernehmen
    foreach ((array) (myf_settings()['clothing_items'] ?? []) as $name) {
        if (!$wpdb->get_var($wpdb->prepare("SELECT id FROM {$p}cloth_items WHERE name = %s", $name))) {
            $wpdb->insert("{$p}cloth_items", ['name' => $name, 'cat' => 'sonst', 'sort' => 900]);
        }
    }
}

// ---------------------------------------------------------------------------
// Ausgabeformate und Hilfen
// ---------------------------------------------------------------------------

function myf_cloth_item_out($i) {
    return ['id' => (int) $i->id, 'name' => $i->name, 'cat' => $i->cat, 'size_key' => $i->size_key, 'procurable' => (bool) $i->procurable,
        'has_serial' => (bool) $i->has_serial, 'active' => (bool) $i->active, 'sort' => (int) $i->sort];
}
function myf_stock_out($s) {
    return ['id' => (int) $s->id, 'member_id' => (int) $s->member_id, 'item_id' => $s->item_id ? (int) $s->item_id : null, 'item_name' => $s->item_name,
        'size' => $s->size, 'qty' => (int) $s->qty, 'issued' => $s->issued, 'status' => $s->status, 'status_date' => $s->status_date,
        'serial' => $s->serial, 'made_year' => $s->made_year ? (int) $s->made_year : null, 'note' => $s->note];
}
function myf_trait_out($t) { return ['id' => (int) $t->id, 'name' => $t->name, 'cat' => $t->cat, 'sort' => (int) $t->sort]; }
function myf_cloth_items() {
    global $wpdb;
    return array_map('myf_cloth_item_out', $wpdb->get_results('SELECT * FROM ' . myf_t('cloth_items') . ' ORDER BY sort, name'));
}
function myf_traits() {
    global $wpdb;
    return array_map('myf_trait_out', $wpdb->get_results('SELECT * FROM ' . myf_t('traits') . ' ORDER BY sort, name'));
}
// Nur mitgeschickte Größen ändern (leer = löschen), andere behalten
function myf_merge_sizes($old, $sizes) {
    $out = json_decode((string) $old, true) ?: [];
    foreach (array_keys(myf_list('size_keys')) as $k) {
        if (!array_key_exists($k, (array) $sizes)) continue;
        $v = sanitize_text_field((string) ((array) $sizes)[$k]);
        if ($v === '') unset($out[$k]); else $out[$k] = mb_substr($v, 0, 20);
    }
    return array_intersect_key($out, myf_list('size_keys'));
}

// Ausgegebenes Teil aus einer Kleidermeldung in die Ausstattung übernehmen
function myf_stock_from_request($reqId) {
    global $wpdb;
    $c = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('clothing') . ' WHERE id = %d', $reqId));
    if (!$c) return 0;
    $item = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('cloth_items') . ' WHERE name = %s', $c->item));
    $wpdb->insert(myf_t('cloth_stock'), ['member_id' => $c->member_id, 'item_id' => $item ? $item->id : null, 'item_name' => $c->item,
        'size' => $c->size, 'qty' => $c->qty, 'issued' => current_time('Y-m-d'), 'status' => 'in_use',
        'note' => 'aus Kleidermeldung vom ' . mysql2date('d.m.Y', $c->created), 'created' => current_time('mysql')]);
    return (int) $wpdb->insert_id;
}

// ---------------------------------------------------------------------------
// Daten für Mitgliederseite, Verwaltung und Profil ergänzen
// ---------------------------------------------------------------------------

add_filter('myf_me_data', function ($data, $me) {
    global $wpdb;
    $data['size_keys'] = myf_list('size_keys');
    $data['sizes'] = (object) (json_decode((string) $me->sizes, true) ?: []);
    $data['employment'] = myf_list('employment')[$me->employment ?: 'ehrenamt'] ?? '';
    $data['day_available'] = (int) $me->day_available;
    $data['daytime_opts'] = MYF_DAYTIME;
    $data['cloth_cats'] = myf_list('cloth_cats');
    $data['stock_status'] = MYF_STOCK_STATUS;
    $data['cloth_catalog'] = array_values(array_filter(myf_cloth_items(), function ($i) { return $i['active']; }));
    $data['stock'] = array_map('myf_stock_out', $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . myf_t('cloth_stock') . ' WHERE member_id = %d ORDER BY status = \'in_use\' DESC, issued DESC', $me->id)));
    $data['traits'] = array_map(function ($r) { return ['id' => (int) $r->id, 'name' => $r->name, 'cat' => $r->cat, 'note' => $r->note]; }, $wpdb->get_results($wpdb->prepare(
        'SELECT t.id, t.name, t.cat, mt.note FROM ' . myf_t('member_traits') . ' mt JOIN ' . myf_t('traits') . ' t ON t.id = mt.trait_id WHERE mt.member_id = %d ORDER BY t.sort', $me->id)));
    $data['trait_cats'] = myf_list('trait_cats');
    // Was man selbst pflegen darf: alles außer Funktionen und Merkmalen, an denen Rechte hängen
    $data['self_traits'] = array_values(array_map(function ($t) { return ['id' => (int) $t['id'], 'name' => $t['name'], 'cat' => $t['cat']]; }, array_filter(myf_traits(), function ($t) { return myf_trait_self_ok((int) $t['id'], $t['cat']); })));
    $data['employment_opts'] = myf_list('employment');
    $data['employment_key'] = $me->employment ?: 'ehrenamt';
    return $data;
}, 10, 2);

// Darf ein Mitglied dieses Merkmal selbst setzen? Nicht bei Funktionen und nicht, wenn ein Recht daran hängt.
function myf_trait_self_ok($id, $cat) {
    if ($cat === 'funktion') return false;
    foreach (myf_rights() as $r) if (in_array((int) $id, (array) $r['traits'], true)) return false;
    return true;
}

// Einmalig: Merkmal „Arbeitet in …“ in das Feld „tagsüber erreichbar“ übernehmen (keine Angabe geht verloren), dann entfernen
add_action('init', function () {
    global $wpdb;
    if (get_option('myf_mig_daytime') || get_option('myf_db_version') === false) return;
    $t = myf_t('traits');
    if ($wpdb->get_var("SHOW TABLES LIKE '$t'") !== $t) return;
    $ids = array_map('intval', $wpdb->get_col("SELECT id FROM $t WHERE cat = 'sonst' AND (name LIKE 'Arbeitet in %' OR name = 'Arbeitet am Ort')"));
    if ($ids) {
        $in = implode(',', $ids);
        $wpdb->query('UPDATE ' . myf_t('members') . ' SET day_available = 1 WHERE day_available = 0 AND id IN (SELECT member_id FROM ' . myf_t('member_traits') . " WHERE trait_id IN ($in))");
        $wpdb->query('DELETE FROM ' . myf_t('member_traits') . " WHERE trait_id IN ($in)");
        $wpdb->query("DELETE FROM $t WHERE id IN ($in)");
    }
    update_option('myf_mig_daytime', 1);
}, 20);

add_filter('myf_admin_state', function ($data) {
    global $wpdb;
    $data += ['size_keys' => myf_list('size_keys'), 'employment_opts' => myf_list('employment'), 'daytime_opts' => MYF_DAYTIME, 'stock_status' => MYF_STOCK_STATUS, 'cloth_cats' => myf_list('cloth_cats'),
        'trait_cats' => myf_list('trait_cats'), 'cloth_items' => myf_cloth_items(), 'traits' => myf_traits(),
        'member_traits' => array_map(function ($r) { return ['member_id' => (int) $r->member_id, 'trait_id' => (int) $r->trait_id, 'note' => $r->note]; },
            $wpdb->get_results('SELECT * FROM ' . myf_t('member_traits'))),
        'stock' => array_map('myf_stock_out', $wpdb->get_results('SELECT * FROM ' . myf_t('cloth_stock') . ' ORDER BY issued DESC, id DESC'))];
    return $data;
});

add_filter('myf_admin_profile', function ($data, $id) {
    global $wpdb;
    $data['stock'] = array_map('myf_stock_out', $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . myf_t('cloth_stock') . ' WHERE member_id = %d ORDER BY status = \'in_use\' DESC, issued DESC, id DESC', $id)));
    $data['trait_ids'] = array_map('intval', $wpdb->get_col($wpdb->prepare('SELECT trait_id FROM ' . myf_t('member_traits') . ' WHERE member_id = %d', $id)));
    return $data;
}, 10, 2);

// ---------------------------------------------------------------------------
// Schnittstellen
// ---------------------------------------------------------------------------

add_action('rest_api_init', function () {
    $ns = 'myf/v1';
    register_rest_route($ns, '/me/sizes', ['methods' => 'POST', 'permission_callback' => 'myf_member_permission', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $me = myf_me();
        $wpdb->update(myf_t('members'), ['sizes' => wp_json_encode(myf_merge_sizes($me->sizes, $req->get_param('sizes')))], ['id' => $me->id]);
        return ['ok' => true, 'id' => (int) $me->id];
    }]);

    $admin = [
        'stock' => 'myf_api_admin_stock', 'stock/delete' => 'myf_api_admin_stock_delete',
        'clothitem' => 'myf_api_admin_clothitem', 'clothitem/delete' => 'myf_api_admin_clothitem_delete',
        'trait' => 'myf_api_admin_trait', 'trait/delete' => 'myf_api_admin_trait_delete',
        'member/traits' => 'myf_api_admin_member_traits', 'member/sizes' => 'myf_api_admin_member_sizes',
    ];
    foreach ($admin as $path => $cb) register_rest_route($ns, '/admin/' . $path, ['methods' => 'POST', 'permission_callback' => 'myf_can_manage', 'callback' => $cb]);
});

function myf_api_admin_stock(WP_REST_Request $req) {
    global $wpdb;
    $id = (int) $req->get_param('id');
    $d = [];
    if ($req->has_param('item_id')) {
        $item = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('cloth_items') . ' WHERE id = %d', (int) $req->get_param('item_id')));
        $d['item_id'] = $item ? (int) $item->id : null;
        if ($item) $d['item_name'] = $item->name;
    }
    if ($req->has_param('item_name') && empty($d['item_name'])) $d['item_name'] = sanitize_text_field((string) $req->get_param('item_name'));
    foreach (['size', 'serial', 'note'] as $k) if ($req->has_param($k)) $d[$k] = sanitize_text_field((string) $req->get_param($k));
    if ($req->has_param('qty')) $d['qty'] = max(1, min(50, (int) $req->get_param('qty')));
    if ($req->has_param('issued')) $d['issued'] = myf_date_or_null($req->get_param('issued'));
    if ($req->has_param('made_year')) { $y = (int) $req->get_param('made_year'); $d['made_year'] = $y > 1950 && $y < 2100 ? $y : null; }
    if ($req->has_param('status')) {
        $d['status'] = isset(MYF_STOCK_STATUS[$req->get_param('status')]) ? $req->get_param('status') : 'in_use';
        $d['status_date'] = $d['status'] === 'in_use' ? null : (myf_date_or_null($req->get_param('status_date')) ?: current_time('Y-m-d'));
    }
    if ($id) {
        $wpdb->update(myf_t('cloth_stock'), $d, ['id' => $id]);
    } else {
        $d['member_id'] = (int) $req->get_param('member_id');
        if (!$d['member_id'] || empty($d['item_name'])) return myf_err('Mitglied oder Teil fehlt.');
        $d += ['status' => 'in_use', 'issued' => current_time('Y-m-d'), 'created' => current_time('mysql')];
        $wpdb->insert(myf_t('cloth_stock'), $d);
        $id = $wpdb->insert_id;
    }
    return ['id' => $id];
}

function myf_api_admin_stock_delete(WP_REST_Request $req) {
    global $wpdb;
    $wpdb->delete(myf_t('cloth_stock'), ['id' => (int) $req->get_param('id')]);
    return ['ok' => true];
}

function myf_api_admin_clothitem(WP_REST_Request $req) {
    global $wpdb;
    $name = sanitize_text_field((string) $req->get_param('name'));
    if ($name === '') return myf_err('Bezeichnung fehlt.');
    $d = ['name' => $name, 'cat' => isset(myf_list('cloth_cats')[$req->get_param('cat')]) ? $req->get_param('cat') : 'sonst',
        'size_key' => isset(myf_list('size_keys')[$req->get_param('size_key')]) ? $req->get_param('size_key') : '',
        'procurable' => $req->get_param('procurable') ? 1 : 0, 'has_serial' => $req->get_param('has_serial') ? 1 : 0,
        'active' => $req->has_param('active') ? ($req->get_param('active') ? 1 : 0) : 1, 'sort' => (int) $req->get_param('sort')];
    $id = (int) $req->get_param('id');
    if ($id) $wpdb->update(myf_t('cloth_items'), $d, ['id' => $id]);
    else { $wpdb->insert(myf_t('cloth_items'), $d); $id = $wpdb->insert_id; }
    if ($id) $wpdb->update(myf_t('cloth_stock'), ['item_name' => $name], ['item_id' => $id]);
    return ['id' => $id];
}

function myf_api_admin_clothitem_delete(WP_REST_Request $req) {
    global $wpdb;
    $id = (int) $req->get_param('id');
    if ((int) $wpdb->get_var($wpdb->prepare('SELECT COUNT(*) FROM ' . myf_t('cloth_stock') . ' WHERE item_id = %d', $id))) {
        return myf_err('Dieses Teil ist in Ausstattungen eingetragen. Statt zu löschen „nicht mehr beschaffbar“ oder „ausblenden“ nutzen.', 409);
    }
    $wpdb->delete(myf_t('cloth_items'), ['id' => $id]);
    return ['ok' => true];
}

function myf_api_admin_trait(WP_REST_Request $req) {
    global $wpdb;
    $name = sanitize_text_field((string) $req->get_param('name'));
    if ($name === '') return myf_err('Bezeichnung fehlt.');
    $d = ['name' => $name, 'cat' => isset(myf_list('trait_cats')[$req->get_param('cat')]) ? $req->get_param('cat') : 'sonst', 'sort' => (int) $req->get_param('sort') ?: 999];
    $id = (int) $req->get_param('id');
    if ($id) $wpdb->update(myf_t('traits'), $d, ['id' => $id]);
    else { $wpdb->insert(myf_t('traits'), $d); $id = $wpdb->insert_id; }
    return ['id' => $id];
}

function myf_api_admin_trait_delete(WP_REST_Request $req) {
    global $wpdb;
    $id = (int) $req->get_param('id');
    $wpdb->delete(myf_t('member_traits'), ['trait_id' => $id]);
    $wpdb->delete(myf_t('traits'), ['id' => $id]);
    return ['ok' => true];
}

function myf_api_admin_member_traits(WP_REST_Request $req) {
    global $wpdb;
    $mid = (int) $req->get_param('id');
    if ($req->has_param('trait_ids')) {
        $ids = array_values(array_unique(array_filter(array_map('intval', (array) $req->get_param('trait_ids')))));
        $wpdb->query($wpdb->prepare('DELETE FROM ' . myf_t('member_traits') . ' WHERE member_id = %d' . ($ids ? ' AND trait_id NOT IN (' . implode(',', $ids) . ')' : ''), $mid));
        foreach ($ids as $tid) $wpdb->query($wpdb->prepare('INSERT IGNORE INTO ' . myf_t('member_traits') . ' (member_id, trait_id) VALUES (%d, %d)', $mid, $tid));
    }
    $d = [];
    if ($req->has_param('employment')) $d['employment'] = isset(myf_list('employment')[$req->get_param('employment')]) ? $req->get_param('employment') : 'ehrenamt';
    if ($req->has_param('day_available')) $d['day_available'] = max(0, min(3, (int) $req->get_param('day_available')));
    if ($req->has_param('note')) $d['note'] = sanitize_textarea_field((string) $req->get_param('note'));
    if ($d) $wpdb->update(myf_t('members'), $d, ['id' => $mid]);
    return ['ok' => true, 'id' => $mid];
}

function myf_api_admin_member_sizes(WP_REST_Request $req) {
    global $wpdb;
    $mid = (int) $req->get_param('id');
    $old = $wpdb->get_var($wpdb->prepare('SELECT sizes FROM ' . myf_t('members') . ' WHERE id = %d', $mid));
    $wpdb->update(myf_t('members'), ['sizes' => wp_json_encode(myf_merge_sizes($old, $req->get_param('sizes')))], ['id' => $mid]);
    return ['ok' => true, 'id' => $mid];
}
