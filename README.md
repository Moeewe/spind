# SPIND

**Von der Freiwilligen Feuerwehr für Freiwillige Feuerwehren.**

SPIND ist ein WordPress-Plugin. Es macht aus der Website einer Feuerwehr ein Portal für die eigene Wehr: Mitglieder erledigen am Handy, was sonst auf Zetteln, in Tabellen und in Chatgruppen liegt. Führung und Fachwarte verwalten ihre Bereiche in derselben Oberfläche.

SPIND ist kostenlos, quelloffen (GPL 2.0 oder neuer) und wird ehrenamtlich entwickelt.

Das Projekt hieß bis Version 0.15.0 „Wehrwerk“. Daten, Einstellungen und Seiten bleiben beim Wechsel unverändert.

> **Stand: Beta (0.x).** Die Funktionen laufen im Alltag einer Feuerwehr, werden aber noch erweitert. Version 1.0.0 erscheint, wenn die ersten Wehren produktiv damit arbeiten und die Tests durch sind.

## Funktionen

| Bereich | Was SPIND kann |
|---|---|
| **Einsatzverwaltung** | Einsatzbeteiligung („Ich war dabei“), digitaler Einsatzbericht, Schnellerfassung aus Alarmmeldungen, Bescheinigung für den Arbeitgeber (Verdienstausfall), Alarm-Schnittstelle (z. B. Alamos FE2) |
| **Atemschutzwerkstatt** | Geräte, Prüfungen und Fristen, Atemschutzüberwachung, Nachweise der Geräteträger (G26, Übungsstrecke, Unterweisung) |
| **Kleiderkammer und Spinde** | Größen, Ausgabe, Anfragen der Mitglieder, Spindbelegung, Leihgaben |
| **Fahrzeuge** | Fahrzeugakten, Prüf- und Wartungsfristen, Mängelmeldungen mit Foto, Fahrtenbuch, Fahrzeug-Anfragen |
| **Ausbildung** | Lehrgangswünsche, Meldung an den Kreis, Zuteilung und Warteliste, Übungsdienste, Dienstpläne mit Kalender-Abo |
| **Mitgliederfunktionen** | Profil, Aufgaben, Benachrichtigungen, Anregungen, Aushänge, Vorlagen und Logos im eigenen Erscheinungsbild – bis zur Bestellrunde für den Dienstabend |
| **Dashboards** | Anzeige für Fahrzeughalle und Besprechungsraum: Alarm, Termine, Wetter, Warnungen |
| **Website** | Seitenvorlage und Bausteine (Shortcodes) für die öffentliche Website der Feuerwehr, Veranstaltungen mit Kalender-Abo |
| **Sicherheit und Datenschutz** | Rechte je Bereich, Zwei-Faktor-Anmeldung, Passkeys, Änderungsprotokoll, Sicherung, Demo-Modus mit getrennten Beispieldaten |

## Installation

1. Die ZIP-Datei der [aktuellen Version](https://github.com/Moeewe/spind/releases/latest) herunterladen.
2. In WordPress unter „Plugins → Neues Plugin hinzufügen → Plugin hochladen“ installieren und aktivieren.
3. Im WordPress-Menü „SPIND“ öffnen und der Ersteinrichtung folgen (Name der Feuerwehr, Ort, Einheiten).
4. Eine Seite mit dem Shortcode `[spind]` anlegen. Das ist der Mitgliederbereich.

Voraussetzungen: WordPress 6.0 oder neuer, PHP 7.4 oder neuer. Bald auch im WordPress-Pluginverzeichnis.

Zum Ausprobieren gibt es einen Demo-Modus mit Beispieldaten. Sie liegen in eigenen Tabellen und mischen sich nicht mit echten Daten.

## Datenschutz

- Alle Daten liegen in der Datenbank der eigenen WordPress-Website. Es gibt keinen zentralen Server.
- SPIND bringt keine Daten einer bestimmten Feuerwehr mit. Eine neue Installation startet leer und neutral.
- Externe Dienste (Wetter, amtliche Warnungen, Karte, Instagram) werden nur abgerufen, wenn die Funktion eingeschaltet ist. Mitgliederdaten werden dabei nicht übertragen. Einzelheiten stehen in der Datei `readme.txt`.
- Updates löschen keine Daten.

## Mitmachen

SPIND lebt davon, dass Feuerwehren es ausprobieren und sagen, was fehlt.

- **Testen:** SPIND auf einer Testseite installieren, den Demo-Modus einschalten und ausprobieren. Was unklar ist oder nicht funktioniert, bitte als [Issue](https://github.com/Moeewe/spind/issues) melden.
- **Ideen:** Wünsche und Abläufe aus der eigenen Wehr sind willkommen, ebenfalls als Issue. Bitte den Ablauf beschreiben, nicht nur die Funktion.
- **Code:** Pull Requests sind willkommen. Bei größeren Änderungen bitte vorher ein Issue anlegen, damit nichts doppelt entsteht.

Bitte in Issues und Pull Requests **keine echten Personendaten** verwenden: keine Namen, Fotos, Adressen oder Einsatzdetails. Beispiele bitte mit „Musterstadt“ und „Max Mustermann“.

## Hosting und Einrichtung

Wer SPIND nicht selbst betreiben möchte: Hosting und Einrichtung sind auf Anfrage möglich über [parametricsolutions.de](https://parametricsolutions.de).

## English summary

SPIND is a WordPress plugin for volunteer fire departments, built by volunteer firefighters. It adds a member portal and back office to a department's website: incident attendance and reports, breathing apparatus workshop, clothing store and lockers, vehicles, training courses, duty rosters, station dashboards and more. All data stays in the site's own database. The interface is currently German only. Testers, ideas and code contributions are welcome. Free software under GPL 2.0 or later.

## Lizenz

GPL 2.0 oder neuer, siehe [LICENSE](LICENSE). Mitgelieferte Fremdbestandteile und Datenquellen stehen in [CREDITS.txt](CREDITS.txt).
