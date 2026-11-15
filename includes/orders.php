<?php
/**
 * Bestellrunden (Pizza am Dienstabend, Grillen, Getränke): Karten je Pizzeria oder eigene Listen, Mitglieder bestellen am Handy.
 * Der Name kommt immer vom angemeldeten Konto, der Preis von der Karte (und bleibt für die Runde fest, auch wenn die Karte sich ändert).
 * Das Geld wird am selben Abend eingesammelt: Die Liste ist nur ein Zettel, kein Beleg. Wer die Runde gestartet hat, sieht Namen und Beträge dieser Runde und löscht sie danach; sonst verschwindet sie von selbst.
 * Runden gibt es nur bei den Mitgliedern. Die Verwaltung pflegt die Karten; dauerhafte Karten gelten erst nach Freigabe durch die LZ-Leitung.
 */

defined('ABSPATH') || exit;

const MYF_ORDER_KEEP_DAYS = 3; // Tage nach dem Bestellschluss; danach wird die Liste gelöscht, auch wenn nicht alles abgehakt ist

function myf_install_orders($c) {
    $p = myf_t('');
    dbDelta("CREATE TABLE {$p}order_menus (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        name varchar(120) NOT NULL DEFAULT '',
        kind varchar(10) NOT NULL DEFAULT 'pizzeria',
        phone varchar(40) NOT NULL DEFAULT '',
        link varchar(250) NOT NULL DEFAULT '',
        note varchar(250) NOT NULL DEFAULT '',
        items longtext NULL,
        status varchar(10) NOT NULL DEFAULT 'approved',
        proposed_by bigint(20) unsigned NULL,
        decided_by varchar(120) NOT NULL DEFAULT '',
        decide_note varchar(250) NOT NULL DEFAULT '',
        updated datetime NULL,
        PRIMARY KEY  (id)
    ) $c;");
    dbDelta("CREATE TABLE {$p}order_rounds (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        title varchar(160) NOT NULL DEFAULT '',
        menu_id bigint(20) unsigned NULL,
        menu_snapshot longtext NULL,
        free_entry tinyint(1) NOT NULL DEFAULT 0,
        deadline datetime NOT NULL,
        closed_at datetime NULL,
        ordered_at datetime NULL,
        ordered_by varchar(120) NOT NULL DEFAULT '',
        created_by varchar(120) NOT NULL DEFAULT '',
        created_member bigint(20) unsigned NULL,
        created datetime NOT NULL,
        PRIMARY KEY  (id),
        KEY deadline (deadline)
    ) $c;");
    dbDelta("CREATE TABLE {$p}order_items (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        round_id bigint(20) unsigned NOT NULL,
        member_id bigint(20) unsigned NOT NULL,
        item_key varchar(16) NOT NULL DEFAULT '',
        name varchar(160) NOT NULL DEFAULT '',
        price_cents int(11) NOT NULL DEFAULT 0,
        qty smallint(5) unsigned NOT NULL DEFAULT 1,
        note varchar(200) NOT NULL DEFAULT '',
        paid_at datetime NULL,
        paid_by varchar(120) NOT NULL DEFAULT '',
        created datetime NOT NULL,
        PRIMARY KEY  (id),
        KEY round_id (round_id),
        KEY member_id (member_id)
    ) $c;");
}

// „7,50“, „7.50“, „7,50 €“ → 750; ungültig → null
function myf_order_cents($v) {
    $s = trim(str_replace(['€', ' '], '', (string) $v));
    if (!preg_match('/^\d{1,3}(?:[.,]\d{1,2})?$/', $s)) return null;
    return (int) round(((float) str_replace(',', '.', $s)) * 100);
}
function myf_order_key($cat, $name) { return substr(md5(mb_strtolower($cat . '|' . $name)), 0, 12); }
// Eine Zeile je Gericht: „Pizza | Salami groß | 9,50“ (Kategorie darf fehlen)
function myf_order_parse($text) {
    $items = []; $errors = [];
    foreach (preg_split('/\r\n|\r|\n/', (string) $text) as $i => $line) {
        if (trim($line) === '') continue;
        $parts = array_map('trim', explode('|', $line));
        if (count($parts) === 2) array_unshift($parts, '');
        $cents = count($parts) === 3 ? myf_order_cents($parts[2]) : null;
        if ($cents === null || $parts[1] === '') { $errors[] = 'Zeile ' . ($i + 1) . ': ' . mb_substr($line, 0, 40); continue; }
        $cat = mb_substr(sanitize_text_field($parts[0]), 0, 60); $name = mb_substr(sanitize_text_field($parts[1]), 0, 120);
        $items[myf_order_key($cat, $name)] = ['k' => myf_order_key($cat, $name), 'cat' => $cat, 'name' => $name, 'cents' => $cents];
    }
    return [array_values($items), $errors];
}
function myf_order_open($r) { return !$r->closed_at && $r->deadline > current_time('mysql'); }
function myf_order_menu_of($r) { $m = json_decode((string) $r->menu_snapshot, true); return is_array($m) ? $m : ['name' => '', 'phone' => '', 'link' => '', 'note' => '', 'items' => []]; }
function myf_order_item_out($x) {
    return ['id' => (int) $x->id, 'round_id' => (int) $x->round_id, 'member_id' => (int) $x->member_id, 'key' => $x->item_key, 'name' => $x->name, 'cents' => (int) $x->price_cents, 'qty' => (int) $x->qty, 'note' => $x->note, 'paid' => (bool) $x->paid_at, 'paid_by' => $x->paid_by];
}
function myf_notes_done_key($key) {
    global $wpdb;
    $wpdb->query($wpdb->prepare('UPDATE ' . myf_t('notifications') . ' SET read_at = %s WHERE dedupe = %s AND read_at IS NULL', current_time('mysql'), $key));
}
function myf_order_notes_done($id) { myf_notes_done_key('order:' . (int) $id); }

function myf_order_can_approve() { return myf_can_manage() || (myf_me() && myf_member_can('orders_approve')); }
function myf_order_menu_row($req) {
    $name = mb_substr(sanitize_text_field((string) $req->get_param('name')), 0, 120);
    if ($name === '') return myf_err('Bitte einen Namen eintragen.');
    list($items, $errors) = myf_order_parse($req->get_param('items'));
    if ($errors) return myf_err('Bitte prüfen (Kategorie | Gericht | Preis): ' . implode(' · ', array_slice($errors, 0, 3)));
    if (!$items) return myf_err('Bitte mindestens ein Gericht mit Preis eintragen.');
    return ['name' => $name, 'kind' => $req->get_param('kind') === 'liste' ? 'liste' : 'pizzeria', 'phone' => mb_substr(sanitize_text_field((string) $req->get_param('phone')), 0, 40),
        'link' => mb_substr(esc_url_raw((string) $req->get_param('link')), 0, 250), 'items' => wp_json_encode($items), 'updated' => current_time('mysql')];
}
// Vorschlag an die LZ-Leitung melden; die Karte gilt erst nach der Freigabe
function myf_order_propose($row, $memberId) {
    global $wpdb;
    $wpdb->insert(myf_t('order_menus'), $row + ['status' => 'pending', 'proposed_by' => $memberId ?: null]);
    $id = (int) $wpdb->insert_id;
    $who = [];
    foreach ($wpdb->get_results('SELECT * FROM ' . myf_t('members') . ' WHERE active = 1 AND user_id IS NOT NULL') as $m) if (myf_member_can('orders_approve', $m)) $who[] = (int) $m->id;
    if ($who) myf_notify($who, 'order', 'Karten-Vorschlag prüfen: ' . $row['name'], 'Gilt erst nach der Freigabe.', 'admin:orders', 'ordermenu:' . $id);
    return $id;
}
// Runde starten: Karte nur freigegeben; sonst einmalige Liste oder freie Eingabe.
function myf_order_round_create($req, $member) {
    global $wpdb;
    $t = myf_t('order_rounds');
    $title = mb_substr(sanitize_text_field((string) $req->get_param('title')), 0, 160);
    $dl = myf_dt_param($req->get_param('deadline'));
    $free = (bool) $req->get_param('free');
    if ($title === '') return myf_err('Bitte einen Titel eintragen, z. B. Pizza nach dem Dienstabend.');
    if (!$dl || $dl <= current_time('mysql')) return myf_err('Der Bestellschluss muss in der Zukunft liegen.');
    if ((int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM $t WHERE created_member = %d AND closed_at IS NULL AND deadline > %s", $member->id, current_time('mysql'))) >= 3) return myf_err('Du hast schon 3 laufende Runden – bitte erst eine abschließen.');
    $mid = (int) $req->get_param('menu_id'); $snap = ['name' => '', 'phone' => '', 'link' => '', 'note' => '', 'items' => []];
    if ($mid) {
        $m = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('order_menus') . " WHERE id = %d AND status = 'approved'", $mid));
        if (!$m) return myf_err('Diese Karte gibt es nicht oder sie ist noch nicht freigegeben.', 404);
        $snap = ['name' => $m->name, 'phone' => $m->phone, 'link' => $m->link, 'note' => $m->note, 'items' => json_decode((string) $m->items, true) ?: []];
    } elseif (trim((string) $req->get_param('once_items')) !== '') {
        list($items, $errors) = myf_order_parse($req->get_param('once_items'));
        if ($errors) return myf_err('Bitte prüfen (Kategorie | Gericht | Preis): ' . implode(' · ', array_slice($errors, 0, 3)));
        $snap = ['name' => mb_substr(sanitize_text_field((string) $req->get_param('once_name')), 0, 120), 'phone' => '', 'link' => '', 'note' => '', 'items' => $items];
    }
    if (!$snap['items'] && !$free) return myf_err('Bitte eine Karte wählen, eine einmalige Liste eintragen oder die freie Eingabe erlauben.');
    $wpdb->insert($t, ['title' => $title, 'menu_id' => $mid ?: null, 'menu_snapshot' => wp_json_encode($snap), 'free_entry' => $free ? 1 : 0, 'deadline' => $dl, 'created_by' => myf_actor(), 'created_member' => $member->id, 'created' => current_time('mysql')]);
    return (int) $wpdb->insert_id;
}
// Runde steuern: wer sie gestartet hat
function myf_order_round_action($r, $req) {
    global $wpdb;
    $t = myf_t('order_rounds'); $id = (int) $r->id; $do = (string) $req->get_param('do');
    if ($do === 'close') { $wpdb->update($t, ['closed_at' => current_time('mysql')], ['id' => $id]); myf_order_notes_done($id); return ['ok' => true]; }
    if ($do === 'reopen') {
        $dl = myf_dt_param($req->get_param('deadline'));
        if (!$dl || $dl <= current_time('mysql')) return myf_err('Zum Wiederöffnen bitte einen neuen Bestellschluss in der Zukunft angeben.');
        $wpdb->update($t, ['closed_at' => null, 'deadline' => $dl, 'ordered_at' => null, 'ordered_by' => ''], ['id' => $id]); return ['ok' => true];
    }
    if ($do === 'ordered') { if (myf_order_open($r)) $wpdb->update($t, ['closed_at' => current_time('mysql')], ['id' => $id]); $wpdb->update($t, ['ordered_at' => current_time('mysql'), 'ordered_by' => myf_actor()], ['id' => $id]); myf_order_notes_done($id); return ['ok' => true]; }
    if ($do === 'delete') { $wpdb->delete(myf_t('order_items'), ['round_id' => $id]); $wpdb->delete($t, ['id' => $id]); myf_order_notes_done($id); return ['ok' => true]; }
    return myf_err('Unbekannte Aktion.');
}

// Mitglied: offene Runden mit Karte, eigene Bestellungen und die selbst gestarteten Runden
add_filter('myf_me_data', function ($data, $me) {
    global $wpdb;
    $data['orders'] = []; $data['order_cards'] = []; $data['my_card_props'] = [];
    if (!$me || !myf_member_can('orders', $me)) return $data;
    foreach ($wpdb->get_results('SELECT id, name, kind, items FROM ' . myf_t('order_menus') . " WHERE status = 'approved' ORDER BY name") as $m) $data['order_cards'][] = ['id' => (int) $m->id, 'name' => $m->name, 'kind' => $m->kind, 'n' => count(json_decode((string) $m->items, true) ?: [])];
    foreach ($wpdb->get_results($wpdb->prepare('SELECT id, name, status, decide_note FROM ' . myf_t('order_menus') . " WHERE proposed_by = %d AND status <> 'approved' ORDER BY id DESC LIMIT 10", $me->id)) as $m) $data['my_card_props'][] = ['id' => (int) $m->id, 'name' => $m->name, 'status' => $m->status, 'note' => $m->decide_note];
    $rows = $wpdb->get_results('SELECT * FROM ' . myf_t('order_rounds') . ' ORDER BY deadline DESC LIMIT 20');
    foreach ($rows as $r) {
        $mine = array_map('myf_order_item_out', $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . myf_t('order_items') . ' WHERE round_id = %d AND member_id = %d ORDER BY id', $r->id, $me->id)));
        $open = myf_order_open($r);
        $owner = (int) $r->created_member === (int) $me->id;
        if (!$open && !$mine && !$owner) continue;
        $menu = myf_order_menu_of($r);
        $row = ['id' => (int) $r->id, 'title' => $r->title, 'deadline' => $r->deadline, 'open' => $open, 'free' => (bool) $r->free_entry, 'ordered' => (bool) $r->ordered_at,
            'menu' => $open || $owner ? $menu : ['name' => $menu['name'] ?? '', 'items' => []], 'mine' => $mine, 'by' => $r->created_by, 'owner' => $owner];
        // Nur für die eigene Runde kommen Namen und Beträge mit, dazu die Namen fürs Nachtragen
        if ($owner) {
            $names = []; $row['people'] = [];
            foreach ($wpdb->get_results('SELECT id, name, active FROM ' . myf_t('members') . ' ORDER BY name') as $n) { $names[(int) $n->id] = $n->name; if ($n->active) $row['people'][] = ['id' => (int) $n->id, 'name' => $n->name]; }
            $row['items'] = array_map(function ($x) use ($names) { $o = myf_order_item_out($x); $o['member'] = $names[$o['member_id']] ?? '(nicht mehr vorhanden)'; return $o; }, $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . myf_t('order_items') . ' WHERE round_id = %d ORDER BY id', $r->id)));
        }
        $data['orders'][] = $row;
    }
    return $data;
}, 30, 2);

// Verwaltung: nur die Karten. Runden, Namen und Beträge kommen hier nicht an.
add_filter('myf_admin_state', function ($d) {
    global $wpdb;
    if (!myf_has_area('orders')) return $d;
    $d['order_menus'] = array_map(function ($m) {
        return ['id' => (int) $m->id, 'name' => $m->name, 'kind' => $m->kind, 'phone' => $m->phone, 'link' => $m->link, 'note' => $m->note, 'items' => json_decode((string) $m->items, true) ?: [], 'status' => $m->status, 'proposed_by' => (int) $m->proposed_by];
    }, $wpdb->get_results('SELECT * FROM ' . myf_t('order_menus') . " WHERE status <> 'declined' ORDER BY name"));
    $d['order_can_approve'] = myf_order_can_approve();
    return $d;
}, 55);

add_action('rest_api_init', function () {
    $ns = 'myf/v1';
    register_rest_route($ns, '/me/order', ['methods' => 'POST', 'permission_callback' => myf_perm('orders'), 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $me = myf_me();
        if (!$me) return myf_err('Dein Konto ist keinem Mitglied zugeordnet.', 403);
        $t = myf_t('order_items');
        // Eigene Zeile ändern
        if ($id = (int) $req->get_param('id')) {
            $x = $wpdb->get_row($wpdb->prepare("SELECT * FROM $t WHERE id = %d AND member_id = %d", $id, $me->id));
            if (!$x) return myf_err('Nicht gefunden.', 404);
            $r = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('order_rounds') . ' WHERE id = %d', $x->round_id));
            if (!$r || !myf_order_open($r)) return myf_err('Der Bestellschluss ist vorbei – bitte bei der Person melden, die die Runde betreut.');
            if ($req->has_param('qty')) {
                $q = (int) $req->get_param('qty');
                if ($q < 0 || $q > 50) return myf_err('Bitte eine Menge bis 50 angeben.');
                if ($q === 0) { $wpdb->delete($t, ['id' => $id]); return ['id' => $id, 'removed' => true]; }
                $wpdb->update($t, ['qty' => $q], ['id' => $id]);
            }
            if ($req->has_param('note')) $wpdb->update($t, ['note' => mb_substr(sanitize_text_field((string) $req->get_param('note')), 0, 200)], ['id' => $id]);
            return ['id' => $id];
        }
        $r = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('order_rounds') . ' WHERE id = %d', (int) $req->get_param('round_id')));
        if (!$r) return myf_err('Diese Bestellrunde gibt es nicht.', 404);
        if (!myf_order_open($r)) return myf_err('Der Bestellschluss ist vorbei – bitte bei der Person melden, die die Runde betreut.');
        $qty = max(1, (int) ($req->get_param('qty') ?: 1));
        if ($qty > 50) return myf_err('Bitte eine Menge bis 50 angeben.');
        $key = (string) $req->get_param('item');
        if ($key !== '') {
            // Preis und Name kommen vom Server, nicht aus der Anfrage
            $it = null; foreach (myf_order_menu_of($r)['items'] ?? [] as $m) if (($m['k'] ?? '') === $key) $it = $m;
            if (!$it) return myf_err('Dieses Gericht steht nicht auf der Karte.', 404);
            $same = $wpdb->get_row($wpdb->prepare("SELECT * FROM $t WHERE round_id = %d AND member_id = %d AND item_key = %s AND note = '' LIMIT 1", $r->id, $me->id, $key));
            if ($same) { if ($same->qty + $qty > 50) return myf_err('Bitte eine Menge bis 50 angeben.'); $wpdb->update($t, ['qty' => $same->qty + $qty], ['id' => $same->id]); return ['id' => (int) $same->id]; }
            $wpdb->insert($t, ['round_id' => $r->id, 'member_id' => $me->id, 'item_key' => $key, 'name' => $it['name'], 'price_cents' => (int) $it['cents'], 'qty' => $qty, 'created' => current_time('mysql')]);
            return ['id' => (int) $wpdb->insert_id];
        }
        if (!$r->free_entry) return myf_err('Bei dieser Runde bitte von der Karte wählen.');
        $name = mb_substr(sanitize_text_field((string) $req->get_param('name')), 0, 160);
        $cents = myf_order_cents($req->get_param('price'));
        if ($name === '') return myf_err('Bitte eintragen, was du möchtest.');
        if ($cents === null || $cents <= 0 || $cents > 20000) return myf_err('Bitte einen Preis bis 200 € angeben, z. B. 9,50.');
        $wpdb->insert($t, ['round_id' => $r->id, 'member_id' => $me->id, 'name' => $name, 'price_cents' => $cents, 'qty' => $qty, 'note' => mb_substr(sanitize_text_field((string) $req->get_param('note')), 0, 200), 'created' => current_time('mysql')]);
        return ['id' => (int) $wpdb->insert_id];
    }]);

    // Mitglieder: Runde starten und selbst einsammeln, Karte vorschlagen (gilt erst nach Freigabe)
    register_rest_route($ns, '/me/order/round', ['methods' => 'POST', 'permission_callback' => myf_perm('orders_start'), 'callback' => function (WP_REST_Request $req) {
        $me = myf_me();
        if (!$me) return myf_err('Dein Konto ist keinem Mitglied zugeordnet.', 403);
        $id = myf_order_round_create($req, $me);
        if (is_wp_error($id)) return $id;
        // Einmalige Liste auf Wunsch zusätzlich als Karte vorschlagen
        $prop = 0;
        if ($req->get_param('propose') && trim((string) $req->get_param('once_items')) !== '' && trim((string) $req->get_param('once_name')) !== '') {
            $req2 = new WP_REST_Request('POST'); $req2->set_param('name', $req->get_param('once_name')); $req2->set_param('items', $req->get_param('once_items'));
            $row = myf_order_menu_row($req2);
            if (!is_wp_error($row)) $prop = myf_order_propose($row, (int) $me->id);
        }
        return ['ok' => true, 'id' => $id, 'proposal' => $prop];
    }]);
    register_rest_route($ns, '/me/order/manage', ['methods' => 'POST', 'permission_callback' => myf_perm('orders_start'), 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $me = myf_me();
        $r = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . myf_t('order_rounds') . ' WHERE id = %d', (int) $req->get_param('id')));
        if (!$r || !$me || (int) $r->created_member !== (int) $me->id) return myf_err('Nur wer die Runde gestartet hat, kann sie steuern.', 403);
        if ($req->get_param('do') === 'paid') {
            $ids = array_values(array_filter(array_map('intval', (array) $req->get_param('ids'))));
            if (!$ids) return myf_err('Nichts ausgewählt.');
            $paid = (bool) $req->get_param('paid');
            $wpdb->query($wpdb->prepare('UPDATE ' . myf_t('order_items') . ' SET paid_at = ' . ($paid ? $wpdb->prepare('%s', current_time('mysql')) : 'NULL') . ', paid_by = %s WHERE round_id = %d AND id IN (' . implode(',', $ids) . ')', $paid ? myf_actor() : '', $r->id));
            return ['ok' => true];
        }
        // Für jemanden nachtragen, auch nach dem Bestellschluss. Preis von der Karte, sonst Gericht und Preis von Hand.
        if ($req->get_param('do') === 'add') {
            $mid = (int) $req->get_param('member_id');
            if (!$wpdb->get_var($wpdb->prepare('SELECT id FROM ' . myf_t('members') . ' WHERE id = %d AND active = 1', $mid))) return myf_err('Dieses Mitglied gibt es nicht.', 404);
            $q = max(1, (int) $req->get_param('qty'));
            $key = (string) $req->get_param('item');
            if ($key !== '') {
                $it = null; foreach (myf_order_menu_of($r)['items'] ?? [] as $m) if (($m['k'] ?? '') === $key) $it = $m;
                if (!$it) return myf_err('Dieses Gericht steht nicht auf der Karte.', 404);
                $name = $it['name']; $cents = (int) $it['cents'];
            } else {
                $name = mb_substr(sanitize_text_field((string) $req->get_param('name')), 0, 160); $cents = myf_order_cents($req->get_param('price'));
            }
            if ($name === '' || $cents === null || $cents <= 0 || $cents > 20000 || $q > 50) return myf_err('Bitte Gericht, Preis bis 200 € und Menge bis 50 angeben.');
            $wpdb->insert(myf_t('order_items'), ['round_id' => $r->id, 'member_id' => $mid, 'item_key' => $key, 'name' => $name, 'price_cents' => $cents, 'qty' => $q, 'created' => current_time('mysql')]);
            return ['ok' => true];
        }
        return myf_order_round_action($r, $req);
    }]);
    register_rest_route($ns, '/me/order/menu', ['methods' => 'POST', 'permission_callback' => myf_perm('orders_start'), 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $me = myf_me();
        if (!$me) return myf_err('Dein Konto ist keinem Mitglied zugeordnet.', 403);
        if ($del = (int) $req->get_param('withdraw')) {
            $n = $wpdb->query($wpdb->prepare('DELETE FROM ' . myf_t('order_menus') . " WHERE id = %d AND proposed_by = %d AND status <> 'approved'", $del, $me->id));
            if (!$n) return myf_err('Nicht gefunden.', 404);
            myf_notes_done_key('ordermenu:' . $del);
            return ['ok' => true];
        }
        if ((int) $wpdb->get_var($wpdb->prepare('SELECT COUNT(*) FROM ' . myf_t('order_menus') . " WHERE proposed_by = %d AND status = 'pending'", $me->id)) >= 5) return myf_err('Du hast schon 5 offene Vorschläge – bitte die Entscheidung abwarten.');
        $row = myf_order_menu_row($req);
        if (is_wp_error($row)) return $row;
        return ['ok' => true, 'id' => myf_order_propose($row, (int) $me->id)];
    }]);
    // Freigabe durch die LZ-Leitung
    register_rest_route($ns, '/admin/order/menu/decide', ['methods' => 'POST', 'permission_callback' => myf_perm('orders_approve'), 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $t = myf_t('order_menus'); $id = (int) $req->get_param('id');
        $m = $wpdb->get_row($wpdb->prepare("SELECT * FROM $t WHERE id = %d AND status = 'pending'", $id));
        if (!$m) return myf_err('Dieser Vorschlag ist schon entschieden oder nicht vorhanden.', 404);
        $ok = (bool) $req->get_param('approve');
        $note = mb_substr(sanitize_text_field((string) $req->get_param('note')), 0, 250);
        if (!$ok && $note === '') return myf_err('Bitte kurz den Grund angeben.');
        $wpdb->update($t, ['status' => $ok ? 'approved' : 'declined', 'decided_by' => myf_actor(), 'decide_note' => $note], ['id' => $id]);
        myf_notes_done_key('ordermenu:' . $id);
        if ($m->proposed_by) myf_notify([(int) $m->proposed_by], 'order', 'Karte „' . $m->name . '“ ' . ($ok ? 'freigegeben' : 'abgelehnt'), $note, 'orders');
        return ['ok' => true];
    }]);

    // Karten: Pizzerien und eigene Listen
    register_rest_route($ns, '/admin/order/menu', ['methods' => 'POST', 'permission_callback' => 'myf_route_perm', 'callback' => function (WP_REST_Request $req) {
        global $wpdb;
        $t = myf_t('order_menus'); $id = (int) $req->get_param('id');
        $can = myf_order_can_approve();
        $old = $id ? $wpdb->get_row($wpdb->prepare("SELECT * FROM $t WHERE id = %d", $id)) : null;
        if ($old && !$can) return myf_err('Karten ändern darf nur die LZ-Leitung.', 403);
        if ($req->get_param('delete')) { $wpdb->delete($t, ['id' => $id]); myf_notes_done_key('ordermenu:' . $id); return ['ok' => true]; } // Laufende Runden behalten ihre Kopie der Karte
        $row = myf_order_menu_row($req);
        if (is_wp_error($row)) return $row;
        if ($id) { $wpdb->update($t, $row, ['id' => $id]); return ['ok' => true, 'id' => $id, 'n' => count(json_decode($row['items'], true))]; }
        if (!$can) { $me = myf_me(); return ['ok' => true, 'id' => myf_order_propose($row, $me ? (int) $me->id : 0), 'pending' => true, 'n' => count(json_decode($row['items'], true))]; }
        $wpdb->insert($t, $row + ['status' => 'approved', 'decided_by' => myf_actor()]);
        return ['ok' => true, 'id' => (int) $wpdb->insert_id, 'n' => count(json_decode($row['items'], true))];
    }]);
});

// Die Liste wird nach dem Abend nicht mehr gebraucht: einige Tage nach dem Bestellschluss weg, auch wenn nicht alles abgehakt ist
add_action('myf_daily', function () {
    global $wpdb;
    $cut = date('Y-m-d H:i:s', strtotime(current_time('mysql')) - MYF_ORDER_KEEP_DAYS * DAY_IN_SECONDS);
    foreach ($wpdb->get_col($wpdb->prepare('SELECT id FROM ' . myf_t('order_rounds') . ' WHERE COALESCE(closed_at, deadline) < %s', $cut)) as $id) {
        $wpdb->delete(myf_t('order_items'), ['round_id' => $id]); $wpdb->delete(myf_t('order_rounds'), ['id' => $id]); myf_order_notes_done($id);
    }
}, 45);
