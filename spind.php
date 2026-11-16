<?php
/**
 * Plugin Name: SPIND
 * Description: Feuerwehr-Portal: Mitgliederbereich und Verwaltung für Einsätze, Berichte, Lehrgänge, Atemschutz, Fahrzeuge, Dienste und Dashboards.
 * Version: 0.17.0
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * Plugin URI: https://github.com/Moeewe/spind
 * Author: SPIND-Projekt
 * Author URI: https://github.com/Moeewe/spind
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: spind
 */

defined('ABSPATH') || exit;

// Übernahme von der früheren Installation (Ordner „myfeuerwehr“): Solange sie noch aktiv ist, lädt SPIND in dieser Anfrage
// nichts doppelt, schaltet das alte Plugin ab und übernimmt ab dem nächsten Seitenaufruf. Daten und Einstellungen liegen
// in denselben Tabellen und bleiben unverändert; der alte Ordner kann danach gelöscht werden (er löscht dabei keine Daten).
if (defined('MYF_VERSION')) {
    add_action('admin_init', function () {
        if (!current_user_can('activate_plugins')) return;
        $me = plugin_basename(__FILE__); $old = [];
        foreach ((array) get_option('active_plugins', []) as $p) if ($p !== $me && preg_match('#(^|/)myfeuerwehr\.php$#', $p)) $old[] = $p;
        if (!$old) return;
        require_once ABSPATH . 'wp-admin/includes/plugin.php';
        deactivate_plugins($old, true); // still: ohne den Abschalt-Haken des alten Plugins (die Wartungsseite bleibt, wie sie ist)
        update_option('myf_takeover', ['from' => $old, 'at' => current_time('mysql')], false);
        wp_safe_redirect(admin_url('plugins.php')); exit;
    });
    return;
}
add_action('admin_notices', function () {
    $t = get_option('myf_takeover');
    if (!is_array($t) || !current_user_can('activate_plugins')) return;
    if (isset($_GET['spind_ok'])) { delete_option('myf_takeover'); return; }
    echo '<div class="notice notice-success"><p><b>SPIND hat die bisherige Installation übernommen.</b> Alle Daten und Einstellungen sind unverändert. '
        . 'Das frühere Plugin (' . esc_html(implode(', ', (array) $t['from'])) . ') ist abgeschaltet und kann unter „Plugins“ gelöscht werden – dabei gehen keine Daten verloren. '
        . '<a href="' . esc_url(add_query_arg('spind_ok', 1)) . '">Hinweis ausblenden</a></p></div>';
});

define('MYF_VERSION', '0.17.0');
// Beta bis zum produktiven Einsatz (dann 1.0.0); Versionshinweise in releases.json
define('MYF_CHANNEL', 'Beta');
// Version der Dateien (JS/CSS): ändert sich mit jeder neuen Datei – so laden Browser, Fernseher und der Offline-Speicher
// nach einem Update sicher die neuen Dateien, auch wenn die Versionsnummer gleich geblieben ist
define('MYF_ASSET_VER', MYF_VERSION . '.' . max(array_map(function ($f) { return (int) @filemtime($f); }, array_merge([__FILE__], (array) glob(__DIR__ . '/assets/*.js'), (array) glob(__DIR__ . '/assets/*.css')))));
define('MYF_DIR', plugin_dir_path(__FILE__));
define('MYF_DB_VERSION', '51');
define('MYF_URL', plugin_dir_url(__FILE__));
define('MYF_ROLE', 'ffw_mitglied');

const MYF_CATS = [
    'kreis_lg'  => 'Lehrgänge auf Kreisebene',
    'kreis_sem' => 'Seminare auf Kreisebene',
    'idf_lg'    => 'Lehrgänge am IdF / AKNZ',
    'idf_sem'   => 'Seminare am IdF / AKNZ',
];
// Bedarf: offen → zugeteilt/Warteliste/nicht zugeteilt → absolviert/nicht teilgenommen; jederzeit zurückgetreten
// Abteilungen der Freiwilligen Feuerwehr (NRW: Einsatz-, Jugend-, Unterstützungs-, Ehren- und Musikabteilung)
const MYF_DEPTS = ['einsatz' => 'Einsatzabteilung', 'jugend' => 'Jugendfeuerwehr', 'unterstuetzung' => 'Unterstützungsabteilung', 'ehren' => 'Alters- und Ehrenabteilung', 'musik' => 'Musikabteilung'];
const MYF_STATUS = ['open', 'assigned', 'waiting', 'declined', 'withdrawn', 'completed', 'missed'];
const MYF_AGT_KINDS = ['strecke' => 'Übungsstrecke', 'g26' => 'G26-Untersuchung', 'unterweisung' => 'Unterweisung', 'einsatz' => 'Einsatz unter Atemschutz', 'uebung' => 'Übung unter Atemschutz'];
const MYF_CLOTHING_STATUS = ['open', 'ordered', 'issued', 'declined', 'withdrawn'];
const MYF_CLOTHING_KINDS = ['ersatz' => 'Ersatzbeschaffung', 'neu' => 'Neubeschaffung'];
const MYF_CLOTHING_ITEMS = ['Einsatzjacke', 'Einsatzhose', 'Helm', 'Feuerwehrhandschuhe', 'Feuerwehrstiefel', 'Flammschutzhaube',
    'Dienstjacke (Softshell)', 'T-Shirt', 'Poloshirt', 'Sweatshirt', 'Arbeitshose', 'Mütze'];
const MYF_IDEA_STATUS = ['new', 'progress', 'done', 'declined', 'withdrawn'];

// Örtliche Vorgaben einer einzelnen Feuerwehr (Ordner „local/“): nur in deren eigenem Paket, nie im öffentlichen Paket.
// Sie hängen sich über Filter ein (myf_local_defaults, myf_brand_defaults, myf_site_blueprint …); ohne den Ordner startet alles neutral.
foreach ((glob(__DIR__ . '/local/*.php') ?: []) as $myf_local_file) require $myf_local_file;

require __DIR__ . '/includes/core.php';
require __DIR__ . '/includes/accounts.php';
require __DIR__ . '/includes/api-member.php';
require __DIR__ . '/includes/api-admin.php';
require __DIR__ . '/includes/audit.php';
require __DIR__ . '/includes/ics.php';
require __DIR__ . '/includes/equipment.php';
require __DIR__ . '/includes/defects.php';
require __DIR__ . '/includes/screen.php';
require __DIR__ . '/includes/notices.php';
require __DIR__ . '/includes/rights.php';
require __DIR__ . '/includes/incidents.php';
require __DIR__ . '/includes/areas.php';
require __DIR__ . '/includes/brand.php';
require __DIR__ . '/includes/notify.php';
require __DIR__ . '/includes/workshop.php';
require __DIR__ . '/includes/vehicles.php';
require __DIR__ . '/includes/duties.php';
require __DIR__ . '/includes/orders.php';
require __DIR__ . '/includes/cd.php';
require __DIR__ . '/includes/app.php';
require __DIR__ . '/includes/data.php';
require __DIR__ . '/includes/offline.php';
require __DIR__ . '/includes/alarm.php';
require __DIR__ . '/includes/setup.php';
require __DIR__ . '/includes/teamwork.php';
require __DIR__ . '/includes/hall.php';
require __DIR__ . '/includes/demo.php';
require __DIR__ . '/includes/demo-data.php';
require __DIR__ . '/includes/quick.php';
require __DIR__ . '/includes/ranks.php';
require __DIR__ . '/includes/security.php';
require __DIR__ . '/includes/reports.php';
require __DIR__ . '/includes/drills.php';
require __DIR__ . '/includes/events.php';
require __DIR__ . '/includes/loops.php';
require __DIR__ . '/includes/reset.php';
require __DIR__ . '/includes/backup.php';
require __DIR__ . '/includes/twofa.php';
require __DIR__ . '/includes/passkeys.php';
require __DIR__ . '/includes/lockers.php';
require __DIR__ . '/includes/materials.php';
require __DIR__ . '/includes/asu.php';
require __DIR__ . '/includes/site.php';
require __DIR__ . '/includes/instagram.php';
require __DIR__ . '/includes/media.php';
require __DIR__ . '/includes/briefings.php';
require __DIR__ . '/includes/usersync.php';
require __DIR__ . '/includes/membership.php';
require __DIR__ . '/includes/loans.php';
require __DIR__ . '/includes/releases.php';
require __DIR__ . '/includes/maintenance.php';
require __DIR__ . '/includes/mail.php';

register_activation_hook(__FILE__, 'myf_install');
register_deactivation_hook(__FILE__, 'myf_maint_remove');
add_action('plugins_loaded', function () {
    if (get_option('myf_db_version') !== MYF_DB_VERSION) myf_install();
});
