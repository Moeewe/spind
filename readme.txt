=== Wehrwerk ===
Contributors:
Tags: feuerwehr, fire department, mitgliederbereich, einsatz, verein
Requires at least: 6.0
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 0.15.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Mitgliederbereich und Verwaltung für Freiwillige Feuerwehren: Einsätze, Atemschutz, Kleiderkammer, Fahrzeuge, Ausbildung und mehr.

== Description ==

**Von der Freiwilligen Feuerwehr für Freiwillige Feuerwehren.** Wehrwerk macht aus einer WordPress-Website ein Portal für die eigene Wehr. Mitglieder melden sich an und erledigen am Handy, was sonst auf Zetteln, in Tabellen und in Chatgruppen liegt. Die Führung und die Fachwarte verwalten ihre Bereiche in derselben Oberfläche.

Wehrwerk ist kostenlos, quelloffen (GPL) und ehrenamtlich entwickelt. Es ist eine Beta-Version (0.x): Die Funktionen laufen im Alltag einer Feuerwehr, werden aber noch erweitert.

*English summary:* Wehrwerk turns a WordPress site into a member portal and back office for volunteer fire departments (incident attendance and reports, breathing apparatus workshop, clothing store and lockers, vehicles, training courses, duty rosters, dashboards for the station). The interface is currently German only.

= Funktionen =

* **Einsatzverwaltung:** Einsatzbeteiligung („Ich war dabei“), digitaler Einsatzbericht, Schnellerfassung aus Alarmmeldungen, Bescheinigung für den Arbeitgeber (Verdienstausfall), Alarm-Schnittstelle (z. B. Alamos FE2).
* **Atemschutzwerkstatt:** Geräte, Prüfungen und Fristen, Atemschutzüberwachung, Nachweise der Geräteträger (G26, Übungsstrecke, Unterweisung).
* **Kleiderkammer und Spinde:** Größen, Ausgabe, Anfragen der Mitglieder, Spindbelegung, Leihgaben.
* **Fahrzeuge:** Fahrzeugakten, Prüf- und Wartungsfristen, Mängelmeldungen mit Foto, Fahrtenbuch, Fahrzeug-Anfragen.
* **Ausbildung:** Lehrgangswünsche, Meldung an den Kreis, Zuteilung, Warteliste, Übungsdienste und Dienstpläne mit Kalender-Abo.
* **Mitgliederfunktionen:** Profil, Aufgaben, Benachrichtigungen, Anregungen, Aushänge, Vorlagen und Logos im eigenen Erscheinungsbild – bis zur Bestellrunde für den Dienstabend.
* **Dashboards:** Anzeige für Fahrzeughalle und Besprechungsraum mit Alarm, Terminen, Wetter und Warnungen.
* **Website-Bausteine:** Seitenvorlage und Shortcodes für die öffentliche Website der Feuerwehr.
* **Sicherheit und Datenschutz:** Rollen und Rechte je Bereich, Zwei-Faktor-Anmeldung, Passkeys, Änderungsprotokoll, Sicherung, Demo-Modus mit getrennten Beispieldaten.

= Einrichtung =

Nach der Aktivierung führt eine Ersteinrichtung durch Name, Ort, Einheiten und Logo. Wehrwerk bringt keine Daten einer bestimmten Feuerwehr mit. Der Mitgliederbereich erscheint auf einer Seite mit dem Shortcode `[myfeuerwehr]`.

= Mitmachen =

Tester, Ideen und Code sind willkommen: [github.com/Moeewe/wehrwerk](https://github.com/Moeewe/wehrwerk).

== Externe Dienste ==

Wehrwerk ruft externe Dienste nur ab, wenn die jeweilige Funktion eingeschaltet ist. Es werden dabei keine Mitgliederdaten übertragen.

* **Bright Sky (Wetterdaten des Deutschen Wetterdienstes)** – für das Wetter auf dem Dashboard. Übertragen werden die Koordinaten des Gerätehauses. Anbieter: [brightsky.dev](https://brightsky.dev), [Hinweise des Anbieters](https://brightsky.dev/docs/).
* **Warnungen des Bundes (NINA, warnung.bund.de)** – für amtliche Warnungen auf dem Dashboard. Übertragen wird der Amtliche Regionalschlüssel des Kreises. Anbieter: Bundesamt für Bevölkerungsschutz und Katastrophenhilfe, [warnung.bund.de](https://warnung.bund.de), [Datenschutz](https://warnung.bund.de/datenschutz).
* **OpenStreetMap (Kartenkacheln und Ortssuche Nominatim)** – für die kleine Karte zum Einsatzort und die Ortssuche in der Ersteinrichtung. Übertragen werden Kartenausschnitt bzw. Suchbegriff und die IP-Adresse des abrufenden Geräts. Anbieter: OpenStreetMap Foundation, [Nutzungsbedingungen](https://osmfoundation.org/wiki/Terms_of_Use), [Datenschutz](https://osmfoundation.org/wiki/Privacy_Policy).
* **Instagram (Graph API)** – optional, um eigene Beiträge auf der Website zu zeigen. Nur mit selbst eingetragenem Zugangsschlüssel. Anbieter: Meta Platforms, [Nutzungsbedingungen](https://help.instagram.com/581066165581870), [Datenschutz](https://privacycenter.instagram.com/policy).
* **WhatsApp-Links (wa.me)** – es werden nur Links erzeugt; Daten fließen erst, wenn jemand den Link antippt.

== Installation ==

1. Plugin installieren und aktivieren.
2. Im WordPress-Menü „Wehrwerk“ öffnen und der Ersteinrichtung folgen (Name der Feuerwehr, Ort, Einheiten).
3. Eine Seite mit dem Shortcode `[myfeuerwehr]` anlegen – das ist der Mitgliederbereich.
4. Mitglieder anlegen oder importieren und einladen.

Zum Ausprobieren gibt es einen Demo-Modus mit Beispieldaten. Sie liegen in eigenen Tabellen und mischen sich nicht mit echten Daten.

== Frequently Asked Questions ==

= Für wen ist Wehrwerk gedacht? =

Für Freiwillige Feuerwehren im deutschsprachigen Raum. Begriffe, Dienstgrade und Lehrgänge orientieren sich an Nordrhein-Westfalen und lassen sich anpassen.

= Was kostet Wehrwerk? =

Nichts. Wehrwerk ist freie Software unter der GPL und wird ehrenamtlich entwickelt.

= Wo liegen die Daten? =

Ausschließlich in der Datenbank der eigenen WordPress-Website. Es gibt keinen zentralen Server und keine Auswertung durch Dritte.

= Gehen bei einem Update Daten verloren? =

Nein. Updates erweitern die Tabellen, löschen aber keine Daten. Auch beim Deaktivieren und Löschen des Plugins bleiben die Daten in der Datenbank. Eine Sicherung vor Updates ist trotzdem sinnvoll und in Wehrwerk eingebaut.

= Brauche ich das Plugin „Einsatzverwaltung“? =

Nein. Ist es installiert, übernimmt Wehrwerk die dort veröffentlichten Einsätze und kann Berichte dorthin übergeben.

= Gibt es Hosting oder Hilfe bei der Einrichtung? =

Hosting und Einrichtung sind auf Anfrage möglich: [parametricsolutions.de](https://parametricsolutions.de).

= Ist Wehrwerk fertig? =

Wehrwerk ist eine Beta-Version (0.x). Version 1.0.0 erscheint, wenn die ersten Wehren produktiv damit arbeiten und die Tests durch sind. Rückmeldungen helfen dabei.

== Changelog ==

= 0.15.0 =
* Neu: Geräte sicher mit der Wehrwerk-App verbinden – ohne dass die App ein Passwort erfährt.
* Neutraler Kern: Wehrwerk startet ohne Vorgaben einer bestimmten Feuerwehr.
* Neutrales Logo und neutrale Vorlagen; Lehrgangsvorlagen ohne Nummern, Orte und Kosten.
* Lizenztext und Beschreibung für das WordPress-Pluginverzeichnis.

= 0.14.2 =
* Die Regeln für die Schnittstelle /wp-json/ werden dauerhaft geschützt und bei Bedarf sofort ergänzt.

= 0.14.0 =
* Vorlagen und Logos zum Herunterladen, bessere Bedienung auf Handy und Tablet.

Alle Versionen stehen in der Datei CHANGELOG.md.

== Upgrade Notice ==

= 0.15.0 =
Keine Änderung an gespeicherten Daten. Neue Installationen starten neutral.
