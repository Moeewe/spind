<?php
/**
 * Standard-Vorlagen für Lehrgänge (Bezeichnungen nach FwDV 2 und üblichen Angeboten auf Kreis- und Landesebene).
 * Spalten: Bereich, Nr., Bezeichnung, Kürzel, Tage, Unterrichtseinheiten, Orte, Voraussetzungen, Kosten, Hinweis, ausgeblendet.
 * Nummern, Orte und Kosten sind je Kreis verschieden und bleiben leer – in der Verwaltung ergänzen oder aus der
 * Bedarfsabfrage des Kreises importieren.
 */

defined('ABSPATH') || exit;

return [
    // --- Lehrgänge auf Kreisebene ---
    ['kreis_lg', '', 'Truppmann 1 - Teil 1', 'TM 1/1', '6', '35', '', 'allgemeine Voraussetzungen', null, ''],
    ['kreis_lg', '', 'Truppmann 1 - Teil 2', 'TM 1/2', '6', '35', '', 'TM 1/1', null, ''],
    ['kreis_lg', '', 'Truppmann 1 - Teil 1 im Tagesdienst', 'TM 1/1 TD', '', '', '', 'allgemeine Voraussetzungen', null, ''],
    ['kreis_lg', '', 'Truppmann 1 - Teil 2 im Tagesdienst', 'TM 1/2 TD', '', '', '', 'TM 1/1', null, ''],
    ['kreis_lg', '', 'Truppmann 2 (Ergänzung)', 'TM 2 Erg', '7', '40', '', 'TM 1', null, ''],
    ['kreis_lg', '', 'Sprechfunker', 'SprFu', '3', '12', '', 'TM 1-Ausbildung wünschenswert', null, ''],
    ['kreis_lg', '', 'Atemschutzgeräteträger', 'AGT', '5', '25', '', 'TM 1 (Teil 1 + 2), G 26, Sprechfunker', null, ''],
    ['kreis_lg', '', 'Truppführer', 'TF', '6', '60', '', 'TM-Ausbildung, G 26, 4 Jahre aktive Dienstzeit', null, ''],
    ['kreis_lg', '', 'Truppführer im Tagesdienst', 'TF TD', '6', '60', '', 'TM-Ausbildung, G 26, 4 Jahre aktive Dienstzeit', null, ''],
    ['kreis_lg', '', 'Maschinist für Löschfahrzeuge', 'Ma', '6', '35', '', 'TM-Ausbildung, passende Fahrerlaubnis wünschenswert', null, ''],
    ['kreis_lg', '', 'Technische Hilfeleistung', 'TH', '6', '35', '', 'TM-Ausbildung', null, ''],
    ['kreis_lg', '', 'TH Wald nach Modul A', 'TH-W A', '3', '24', '', 'TM-Ausbildung', null, ''],
    ['kreis_lg', '', 'TH Wald nach Modul B', 'TH-W B', '3', '24', '', 'TH-W Modul A', null, ''],
    ['kreis_lg', '', 'Absturzsicherung', 'AbstuSi', '4', '24', '', 'TM-Ausbildung', null, ''],
    ['kreis_lg', '', 'Absturzsicherung im Tagesdienst', 'AbstuSi TD', '3', '24', '', 'TM-Ausbildung', null, ''],
    ['kreis_lg', '', 'ABC-Einsatz – kompakte Form', 'ABC kompakt', '13', '70', '', 'TM-Ausbildung, AGT', null, ''],
    ['kreis_lg', '', 'ABC-Einsatz – Modul AB im Tagesdienst', 'ABC AB TD', '5', '40', '', 'TM-Ausbildung, AGT', null, ''],
    ['kreis_lg', '', 'ABC-Einsatz – Modul AB', 'ABC AB', '', '', '', 'TM-Ausbildung, AGT', null, ''],
    ['kreis_lg', '', 'ABC-Einsatz – Modul C', 'ABC C', '6', '36', '', 'TM-Ausbildung, AGT', null, ''],
    ['kreis_lg', '', 'PSU-Helfer', 'PSU-H', '', '', '', '', null, '', 1],
    ['kreis_lg', '', 'Messzug', '', '', '', '', '', null, '', 1],

    // --- Seminare auf Kreisebene ---
    ['kreis_sem', '', 'Maschinisten-Fortbildung', 'MaF', '1', '8', '', 'Maschinisten-Ausbildung', null, ''],
    ['kreis_sem', '', 'Technische Hilfeleistung – Fortbildung', 'TH-F', '2', '12', '', 'TH-Ausbildung', null, ''],
    ['kreis_sem', '', 'Führungsgehilfe ELW 1', 'Fügh-ELW', '3', '12', '', 'TM-Ausbildung', null, ''],
    ['kreis_sem', '', 'ABC-Fortbildung', 'ABC-F', '1', '8', '', 'ABC-Ausbildung, gültige G 26', null, ''],
    ['kreis_sem', '', 'Fortbildung für Gruppenführer – Planspiele', 'SemGF', '1', '4', '', 'Gruppenführer', null, ''],
    ['kreis_sem', '', 'Fortbildung für Zugführer – Planspiele', 'SemZF', '1', '4', '', 'Zugführer', null, ''],
    ['kreis_sem', '', 'Fortbildung für Wehrführer', 'SemWF', '', '', '', 'Wehrführer', null, ''],
    ['kreis_sem', '', 'Truppführer-Fortbildung (Ma/ABC)', 'TF-F', '', '', '', 'Truppführer', null, ''],
    ['kreis_sem', '', 'Fortbildung Erste Hilfe', 'EH-F', '1', '', '', 'TM-Ausbildung', null, ''],
    ['kreis_sem', '', 'Vorbereitungsseminar Gruppenführer-Basis', 'F III-V', '4', '', '', 'gemäß FwDV 2', null, ''],
    ['kreis_sem', '', 'Planspiel MANV für Zugführer und OrgL', 'PL-MANV', '2', '', '', 'Zugführer / OrgL', null, ''],
    ['kreis_sem', '', 'Seminar Brandschutzerziehung/-aufklärung', 'Sem. BE/BA', '1', '8', '', 'Brandschutzerzieher', null, ''],
    ['kreis_sem', '', 'Workshop Brandschutzerziehung/-aufklärung', 'W-shop BE/BA', '1', '8', '', 'Brandschutzerzieher', null, ''],
    ['kreis_sem', '', 'Seminar Vegetationsbrandbekämpfung', 'S Vegetation', '1', '11', '', 'Truppführer-Ausbildung', null, ''],
    ['kreis_sem', '', 'Seminar Brandmeldetechnik und Digitalisierung', 'S-BMA/D', '1', '8', '', '', null, ''],

    // --- Lehrgänge am IdF / AKNZ ---
    ['idf_lg', '', 'Einheitsleiter', 'S Einheitsleiter', '', '', '', '', null, ''],
    ['idf_lg', '', 'Einheitsführer-Basis', 'EF-Basis', '', '', '', '', null, ''],
    ['idf_lg', '', 'Gruppenführer-Basis', 'F III', '', '', '', 'Truppführer, Vorbereitungsseminar F III', null, ''],
    ['idf_lg', '', 'Brandschutztechniker', 'F/B BST', '', '', '', '', null, ''],
    ['idf_lg', '', 'Zugführer', 'F IV', '', '', '', 'Gruppenführer', null, ''],
    ['idf_lg', '', 'Zugführer Aufbau', 'F IV Aufbau', '', '', '', 'Zugführer', null, ''],
    ['idf_lg', '', 'Verbandsführer', 'F B V-1', '', '', '', 'Zugführer', null, ''],
    ['idf_lg', '', 'Stabsarbeit', 'F B V-2', '', '', '', '', null, ''],
    ['idf_lg', '', 'Leiter der Feuerwehr', 'F VI', '', '', '', '', null, ''],
    ['idf_lg', '', 'Atemschutzgerätewart', 'F/B Agw (N)', '', '', '', 'AGT', null, ''],
    ['idf_lg', '', 'Führen im ABC-Einsatz (Basis)', 'ABC Fü Basis', '', '', '', '', null, ''],

    // --- Seminare am IdF / AKNZ ---
    ['idf_sem', '', 'Seminar Anlagentechnik I', 'S Anlagentechnik I', '', '', '', '', null, ''],
    ['idf_sem', '', 'Seminar Wasserrettung der Feuerwehren', 'S Wasserrettung', '', '', '', '', null, ''],
    ['idf_sem', '', 'Seminar Patientengerechte Unfallrettung', 'S Unfallrettung', '', '', '', '', null, ''],
    ['idf_sem', '', 'Seminar Gebäudeschäden / Einsturz', 'S Einsturz', '', '', '', '', null, ''],
    ['idf_sem', '', 'Seminar Umgang mit Tieren im Feuerwehreinsatz', 'S Tiere', '', '', '', '', null, ''],
    ['idf_sem', '', 'Seminar Anwendung des Digitalfunks BOS', 'S Digitalfunk', '', '', '', '', null, ''],
    ['idf_sem', '', 'Seminar Ausbilder (F)', 'S Ausbilder', '', '', '', '', null, ''],
    ['idf_sem', '', 'Ausbilderschulung Funk', 'Ausb. Funk', '', '', '', '', null, ''],
    ['idf_sem', '', 'Gerätewarte-Fortbildung', 'GW-Fobi', '', '', '', '', null, ''],
];
