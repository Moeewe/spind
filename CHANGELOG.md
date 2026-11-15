# SPIND – Versionshinweise

Beta (0.x) bis zum produktiven Einsatz. Version 1.0.0 erscheint, wenn SPIND produktiv läuft, auf GitHub veröffentlicht ist und die ersten Tests durch sind.

## 0.16.0 – 15.11.2026

**Neuer Name SPIND, Veranstaltungen für die Website, Atemschutz-Jahresnachweis**

- Neuer Name: Die Software heißt jetzt SPIND (früher Wehrwerk). An euren Daten, Einstellungen und Seiten ändert sich nichts. Die bisherigen Bausteine auf euren Seiten gelten weiter; neu heißen sie [spind], [spind_einsatz] und [spind_einsatzberichte]. Der Name, den eure Mitglieder sehen, bleibt wie unter „Einstellungen → Organisation“ eingetragen.
- Neu unter „Dienste → Veranstaltungen“ (nur für die Verwaltung): Termine für die Öffentlichkeit wie Leistungsnachweis, Tag der Jugendfeuerwehr, Tag der offenen Tür oder Lampionfest – mit Kurztext, Beschreibung, Bild, Ort und Link. Internes gehört weiter in den Dienstplan.
- Jede Veranstaltung beginnt als Entwurf und wird erst mit „Öffentlich“ sichtbar. Vor dem Veröffentlichen fragt SPIND nach.
- Neue Bausteine für die Website: [ww_veranstaltungen] zeigt alle öffentlichen Veranstaltungen als Karten mit Einzelansicht, [ww_veranstaltung] die nächste hervorgehobene, zum Beispiel auf der Startseite. Die Einzelansicht hat einen Knopf „In meinen Kalender“ und Angaben für Suchmaschinen.
- [ww_termine] hebt hervorgehobene Veranstaltungen rot umrandet als „Besonderer Termin“ hervor. Mit veranstaltungen="nein" bleiben sie dort weg.
- Bei den Mitgliedern stehen öffentliche Veranstaltungen ganz normal im Kalender, in der App und im persönlichen Kalender-Abo – ohne besondere Hervorhebung.
- Eine Veranstaltung lässt sich mit einer Abfrage verknüpfen („Wer hilft beim Aufbau?“). Mitglieder sehen dann am Termin einen Knopf zur Abfrage; öffentlich erscheint davon nichts.
- Abgleich mit dem Kalender der Feuerwehr: Ein Termin aus dem verbundenen Kalender lässt sich als Veranstaltung übernehmen. Datum und Uhrzeit kommen weiter aus dem Kalender; der Termin erscheint überall nur einmal. Verschwindet er aus dem Kalender, bleibt die Veranstaltung und die Verwaltung sieht einen Hinweis.
- Öffentliches Kalender-Abo nur mit öffentlichen Veranstaltungen, zum Einbinden in andere Kalender. Abgesagte Veranstaltungen bleiben sichtbar und sind deutlich gekennzeichnet.
- Atemschutz: neuer Reiter „Jahresnachweis“ mit G26, Übungsstrecken, Übungen und Einsätzen unter Atemschutz je Geräteträger, zum Drucken und als CSV. Der Import liest Jahreslisten mit „Strecke 1“, „Strecke 2“ und „Übung“, auch mit mehreren Terminen in einer Zelle.
- Atemschutz: Auf Wunsch gilt „einsatzbereit“ nur mit einem zweiten Nachweis in 12 Monaten (Übung oder Einsatz unter Atemschutz oder eine zweite Übungsstrecke). Die Regel ist zunächst ausgeschaltet und lässt sich unter „Jahresnachweis“ einschalten.
- Anlegen, Ändern und Löschen stehen im Änderungsprotokoll. Bestehende Daten bleiben unverändert; beim Update kommt nur eine neue Tabelle dazu.

## 0.15.0 – 15.11.2026

**App-Anmeldung und neutraler Kern für die Veröffentlichung**

- Neu: Geräte lassen sich sicher mit der SPIND-App (iPhone, iPad, Mac) verbinden. Man meldet sich wie gewohnt im Browser an und bestätigt das Gerät; die App erfährt kein Passwort. Die Verbindung gilt nur für den Mitgliederbereich, nie für die Verwaltung, lässt sich je Gerät trennen und endet bei Austritt, Sperre oder Passwortwechsel.
- SPIND startet auf einer neuen Website jetzt vollständig neutral: ohne Ortsnamen, ohne Koordinaten, ohne Fahrzeug- und Einheitenlisten einer bestimmten Feuerwehr. Alles wird in der Ersteinrichtung eingetragen.
- Örtliche Vorgaben einer Feuerwehr liegen in einem eigenen Ordner und sind nicht Teil des öffentlichen Pakets. Bestehende Installationen arbeiten unverändert weiter, gespeicherte Daten und Einstellungen bleiben, wie sie sind.
- Das mitgelieferte Logo und die Vorlagen (Präsentationen, Briefkopf, Protokoll …) zeigen „Freiwillige Feuerwehr“ ohne Ortszeile. Mit eigenen Angaben unter „Einstellungen → Organisation“ entsteht daraus wie bisher das eigene Logo.
- Die Lehrgangsvorlagen enthalten keine Nummern, Orte und Kosten eines bestimmten Kreises mehr. Diese Angaben lassen sich ergänzen oder aus der Bedarfsabfrage des Kreises übernehmen.
- Neu im Paket: Lizenztext (GPL 2.0 oder neuer) und eine Beschreibung für das WordPress-Pluginverzeichnis.

## 0.14.2 – 14.11.2026

**/wp-json/ kann nicht mehr verschwinden**

- Die Regeln für die Website-Schnittstelle /wp-json/ werden jetzt an drei Stellen geschützt: beim Neuaufbau der Permalinks, beim Speichern in die Datenbank und bei jeder Anfrage. Schreibt ein anderes Plugin die Regeln ohne /wp-json/, ergänzt SPIND sie sofort. Die Website fällt dadurch nicht mehr aus, auch nicht für eine Stunde.
- Jede Reparatur steht im Änderungsprotokoll (Bereich „permalinks“), wenn möglich mit dem Plugin, das sie ausgelöst hat.

## 0.14.1 – 14.11.2026

**Website-Schnittstelle repariert sich selbst**

- Fehlt in WordPress die Permalink-Regel für /wp-json/, antwortet die ganze Schnittstelle mit „Seite nicht gefunden“ (404). Dann klappt das Veröffentlichen von Einsätzen und Beiträgen nicht, SPIND meldet ohne Anmeldung „Seite existiert nicht“ und der Cookie-Banner kann keine Zustimmung speichern.
- SPIND prüft das jetzt höchstens einmal pro Stunde und baut die Regeln bei Bedarf selbst neu auf. Die Reparatur steht im Änderungsprotokoll.

## 0.14.0 – 02.11.2026

**Vorlagen und Logos, besser auf Handy und Tablet**

- Neu: „Vorlagen & Logos“ unter Profil und in den Einstellungen. Zum Herunterladen gibt es drei Präsentationen (allgemein, Unterricht und Dienstabend, Jahresversammlung), Briefkopf, Protokoll, Pressemitteilung, Aushang, Urkunde, das Logo-Paket und die Schrift Barlow.
- Name, Anschrift, Telefon, E-Mail, Website, Farbe und Logo kommen automatisch aus den Einstellungen. So passen die Vorlagen auch für jede andere Feuerwehr. Telefon und E-Mail lassen sich neu unter „Organisation“ eintragen.
- Kurzregeln zum Erscheinungsbild (Farben, Schrift, Logo, Fotos) stehen auf derselben Seite und lassen sich als A4 drucken.
- Handy: Felder haben 16 px Schrift, damit das iPhone beim Antippen nicht hineinzoomt. Lange Knöpfe und Hinweise brechen um, statt abgeschnitten zu werden.
- Tablet: In der Verwaltung stehen Logo und Knöpfe in einer Zeile, das Menü bleibt einzeilig und wischbar, der aktive Reiter bleibt sichtbar.

## 0.13.0 – 31.10.2026

**Bestellrunden wie ein Zettel am Abend**

- Bestellrunden laufen nur noch bei den Mitgliedern unter Termine → Bestellen. Die Verwaltung pflegt nur noch die Karten und gibt Vorschläge frei; dort sind keine Runden, Namen und Beträge mehr zu sehen.
- Wer die Runde startet, bekommt die Bestellliste für den Anruf mit Telefonnummer und Gesamtsumme, „Bezahlt“ zum Abhaken beim Einsammeln, die A4-Druckvorschau und „Für jemanden nachtragen“, auch nach dem Bestellschluss.
- Liste löschen: Nach dem Abend löscht die startende Person die Liste mit allen Namen und Bestellungen. Vergessene Listen verschwinden 3 Tage nach dem Bestellschluss von selbst, auch wenn nicht alles abgehakt ist.
- Start: Keine Erinnerungen mehr an offene Beträge, denn das Geld wird am Abend bar eingesammelt.
- Änderungsprotokoll: Bestellungen, Gerichte, Preise und Runden-Titel werden nicht mehr protokolliert. Es steht nur noch drin, wer eine Runde gestartet oder gelöscht hat.

## 0.12.0 – 31.10.2026

**Bestellrunden von Mitgliedern, Karten mit Freigabe**

- Bestellrunden: Jedes Mitglied kann jetzt selbst eine Runde starten, zum Beispiel nach einem Dienstabend. Die anderen sehen sie auf der Startseite und tragen sich ein. Wer sie startet, sieht Namen und Beträge und rechnet selbst ab.
- Einmalige Liste: Beim Start lässt sich eine Liste nur für diese Runde eintragen, oder die freie Eingabe erlauben. Das braucht keine Freigabe.
- Karten-Vorschläge: Dauerhafte Karten können alle vorschlagen. Sie gelten erst nach Freigabe durch die LZ-Leitung (Voreinstellung: Wehrführung und LZ-Führung) und sind dann für alle wählbar. Bei einer Ablehnung bekommt die Person den Grund.
- Verwaltung: Auf der Übersicht stehen die Kacheln jetzt ganz oben, die Aufgaben darunter.

## 0.11.0 – 30.10.2026

**Bestellrunden für Pizza und Co.**

- Neu: Bestellrunden, zum Beispiel für Pizza am Dienstabend. Mitglieder tippen am Handy Gericht und Menge an, der Name kommt automatisch vom Konto und der Preis von der Karte.
- Karten: Pizzerien und eigene Listen lassen sich hinterlegen und wiederverwenden (eine Zeile je Gericht: Kategorie | Gericht | Preis). Pro Runde lässt sich zusätzlich eine freie Eingabe erlauben. Spätere Preisänderungen ändern laufende Runden nicht.
- Abrechnung: zusammengefasste Liste zum Bestellen, Beträge je Person, „bezahlt“ abhaken und Liste drucken. Jeder zahlt selbst, das Plugin hält nur fest, wer was schuldet.
- Datenschutz: Mitglieder sehen nur die eigene Bestellung. Namen und Beträge aller sieht nur der neue Bereich „Bestellrunden“ (Voreinstellung: Wehrführung, LZ-Führung, Gruppenführer). Vollständig bezahlte Runden werden nach 90 Tagen gelöscht.

## 0.10.4 – 30.10.2026

**Regeln bei Atemschutz-Minuten und Fahrtenbuch geschärft**

- Atemschutz: Wer aus einem Trupp der Atemschutzüberwachung entfernt wird, behält keine Minuten mehr. Der Haken „AGT“ bleibt und wird von der Einsatzführung geklärt.
- Atemschutz: Ein Protokoll mit unmöglichen Trupp-Zeiten lässt sich nicht abschließen.
- Fahrtenbuch: Ein km-Stand weit unter dem letzten Stand wird als Tippfehler abgelehnt. Ältere Fahrten lassen sich weiter nachtragen.

## 0.10.3 – 30.10.2026

**Regeln bei Bescheinigung und Einsatzzeiten geschärft**

- Revisionssicherheit: Ist eine Bescheinigung ausgehändigt, lassen sich die Zeiten und das Fahrzeug der Person sowie Beginn, Ende und Fahrzeugzeiten des Einsatzes nicht mehr ändern. Gedruckt und noch nicht ausgehändigt bleibt eine Korrektur mit Neudruck möglich.
- Einsatz: Ein Ende vor dem Beginn wird abgelehnt.
- Atemschutz: Auch Konten mit Bereich Atemschutz können bei der eigenen Eintragung keine Minuten setzen, die Minuten kommen aus der Atemschutzüberwachung.
- Anregungen: Antwort auf einen nicht vorhandenen Eintrag meldet jetzt einen Fehler.

## 0.10.2 – 30.10.2026

**Fahrzeug-Historie ausblenden**

- Fahrzeug buchen: Abgelehnte, stornierte und vergangene eigene Anfragen lassen sich einzeln oder gesammelt ausblenden und jederzeit wieder einblenden. Das ändert nur die eigene Ansicht, die Fahrzeug-Verwaltung und das Protokoll behalten alles.
- Laufende Anfragen und kommende Fahrten lassen sich nicht ausblenden, damit sie nicht in Vergessenheit geraten.
- Beim Schließen der Verwaltung bleiben keine Verwaltungs-Angaben mehr in der Adresse der Mitgliederseite stehen.

## 0.10.1 – 30.10.2026

**Meine Aufgaben: eine einheitliche Liste**

- Meine Aufgaben einheitlich: Jede Aufgabe ist jetzt eine Zeile im Stil von „Was steht an?“ – links Datum oder Anzahl, rechts ein Knopf mit klarem Verb. Keine Kacheln mehr daneben, auch nicht in der Übersicht der Verwaltung.
- Nur noch zwei Abschnitte: „Wartet auf Antwort“ (jemand wartet auf eine Entscheidung) und „Zu erledigen“ (alles andere).

## 0.10.0 – 30.10.2026

**Meine Aufgaben, ein Postfach, aufgeräumte Einstellungen**

- Neu für alle mit Funktion: „Meine Aufgaben“ im Menü. Eine Liste über alle Bereiche, was auf dich wartet, auch am Handy. Antippen führt direkt an die richtige Stelle. Mitglieder ohne Funktion sehen den Reiter nicht.
- Ein Postfach statt zwei: Alle Benachrichtigungen stehen an einem Ort, die Glocke zeigt überall dieselbe Zahl. Vorhandene Nachrichten bleiben erhalten.
- Einstellungen geordnet: Organisation (mit Rechte, Startklar), Anbindungen (E-Mail, Schnittstellen, Website), Sicherheit (mit Protokoll).
- Verwaltung: Einstellungen eines Bereichs sind jetzt immer der letzte Unterreiter – bei Einsätzen (Bericht-Formular, Einsatz-Fahrzeuge), Atemschutz (Prüffristen), Kleiderkammer (Katalog) und Dashboard (Besprechungsraum, Fahrzeughalle). Alte Links und die Suche funktionieren weiter.
- Klarere Namen: „Einsatz-Fahrzeuge“ statt doppelt „Fahrzeuge“, „Kleidungswünsche“ statt „Meldungen“ in der Kleiderkammer.
- Startseite: Der Hinweis zum Absichern der Anmeldung (Passkey oder Zwei-Faktor) steht direkt unter den Schnellzugriffen und verschwindet, sobald eines davon eingerichtet ist.

## 0.9.14 – 30.10.2026

**Eigener Reiter für den E-Mail-Versand, Fußzeile am Handy**

- Einstellungen: „E-Mail-Versand“ hat einen eigenen Reiter neben „Daten & Schnittstellen“, mit eigener Speichern-Leiste. Die Suche in der Verwaltung findet ihn auch.
- Startseite: Die Schnellzugriffe (Fahrt eintragen, Fahrzeug buchen, Mangel melden, Hinweis) stehen wieder direkt unter dem Menü, „Was steht an?“ folgt danach.
- Handy: Fußzeile aufgeräumt – Copyright, darunter „Zurück zur Website“ und „Was ist neu?“ links und rechts, darunter die Version.

## 0.9.13 – 30.10.2026

**E-Mail-Versand über ein eigenes Postfach**

- Verwaltung → Einstellungen → E-Mail-Versand: Mails können über ein echtes Postfach per SMTP gesendet werden. Das gilt für alle Mails der Website, auch Passwort-Links und das Kontaktformular. So gelten sie beim Empfänger als berechtigt und landen seltener im Spam.
- Neu: „Testmail senden“ zeigt direkt die Antwort des Mailservers.
- Das Passwort wird verschlüsselt gespeichert, nie angezeigt und nicht protokolliert. Einstellen dürfen nur Administratoren. Ohne Eintrag bleibt alles wie bisher.

## 0.9.12 – 29.10.2026

**Bedienung am Handy und Barrierefreiheit**

- Startseite: Gibt es etwas zu tun (Entscheidungen, „Warst du dabei?“, Berichte), steht „Was steht an?“ jetzt ganz oben – am Handy sofort sichtbar. Schnellzugriffe und der Passkey-Tipp kommen danach.
- Handy: Alles Antippbare ist mindestens 40 px hoch – kleine Knöpfe, Auswahlfelder, „Schon erfasst …“, „Was ist neu?“ und die Links in der Fußzeile.
- Verwaltung am Handy: Kopfzeile in einer Zeile (Vollbild-Knopf am Handy ausgeblendet), Suche darunter – mehr Platz für den Inhalt.
- Dunkelmodus: „Was ist neu?“ und rot umrandete Knöpfe in farbigen Hinweisen besser lesbar (Kontrast nach WCAG).
- Barrierefreiheit: Eingabefelder ohne sichtbare Beschriftung bekommen automatisch einen Namen für Vorlese-Programme (aus Spaltenüberschrift, Feldbeschriftung oder Auswahl).
- Halle: Fahrzeuge ohne Funkstatus zeigen ⌂ („in der Halle“) statt eines leeren „–“.
- Profil: „Funktion & Fähigkeiten“ zeigt „tagsüber: …“ statt nur „nein / selten“.

## 0.9.11 – 29.10.2026

**Handy-Menü ohne Lücke, Verdienstausfall übersichtlicher**

- Handy: Das Menü klebt beim Scrollen ganz oben – ohne durchsichtige Lücke darüber (Safari schiebt die Seite unter Status- und Adressleiste).
- Übersicht Verdienstausfall: Die Sammel-Aktionen („Alle drucken“, „Alle aushändigen“) stehen jetzt in einer Leiste direkt unter der Überschrift, mit kurzer Erklärung und rotem Knopf – am Handy über die volle Breite. Je Zeile stehen die Knöpfe einheitlich rechts untereinander.
- Wer früher gegangen ist, bekommt die Bescheinigung schon, während der Einsatz noch läuft: Es zählt die eigene „bis“-Zeit, sonst die Rückkehr des Fahrzeugs, sonst das Einsatzende. Fehlt alles, steht „fehlt: Ende („bis“)“.

## 0.9.10 – 29.10.2026

**Demo-Durchlauf: Zeiten und Bescheinigungen abgesichert**

- Bescheinigung für den Arbeitgeber: Ohne Einsatzende (Einsatz läuft noch, kein „bis“) wird nicht gedruckt – die Übersicht Verdienstausfall zeigt „fehlt: Einsatzende“.
- Einsatzzeiten werden geprüft – in der Halle, im eigenen Formular und in der Tabelle der Einsatzführung: „bis“ vor „von“ oder mehr als 16 Stunden wird mit Hinweis abgelehnt (z. B. Tippfehler 10:20 bis 09:00). Über Mitternacht (23:30 bis 01:15) geht weiter.
- Meldung korrigiert: Bei einer schon ausgehändigten Bescheinigung heißt es jetzt „schon ausgehändigt“ statt „schon gedruckt“.

## 0.9.9 – 29.10.2026

**Einheitliche Begriffe, Ausdrucke an ihrem Platz**

- Verdienstausfall: ein Name je Schritt – „angefragt“, „gedruckt – zur Unterschrift“, „ausgehändigt“ (statt teils „ausgestellt“). Das Dokument heißt überall „Bescheinigung für den Arbeitgeber“.
- Wer Teilnahmen an Einsätzen bestätigt, heißt überall „Einsatzführung“ (Halle, Mitgliederbereich, Meldungen). Bei Übungen und Diensten bleibt es bei „Zugführung“.
- Lehrgänge: „Ausbildung“ statt „Ausbildungsakte“.
- Ausdrucke an ihrem Platz: Die Atemschutz-Übersicht liegt jetzt unter Atemschutz → Atemschutzgeräteträger („Übersicht drucken“), die Bestellliste unter Kleiderkammer → Meldungen („Bestellliste drucken“). Lehrgänge → Ausdrucke enthält nur noch Lehrgangs-Ausdrucke.
- Termin-Ablauf: die gespeicherten Uhrzeiten-Vorlagen heißen jetzt „Ablauf-Muster“ – nicht mehr zu verwechseln mit den Lehrgangs-Vorlagen.
- Halle: Wer dort eine Bescheinigung anfragt und bei wem Geburtsdatum, Geburtsort oder Anschrift fehlen, bekommt gleich den Hinweis, was im Profil noch fehlt (nur die Feldnamen, keine Daten).
- Lehrgänge → Ablauf → „Wünsche sammeln“: neues Feld „Hinweis für die Mitglieder“ – erscheint oben unter „Lehrgänge“ im Mitgliederbereich.

## 0.9.8 – 29.10.2026

**Lehrgänge & Verdienstausfall durchgeprüft**

- Lehrgänge: Mitglieder bekommen jetzt Bescheid – bei der Freigabe der Zuteilung eine Zusammenfassung („zugeteilt am …“, „Warteliste“, „diesmal nicht“), danach bei jeder Änderung, und wenn „absolviert“ oder „nicht teilgenommen“ eingetragen wird.
- Lehrgänge: Nach dem Lehrgang kann man nicht mehr „zurücktreten“ (vorher ging das im laufenden Jahr und die Teilnahme verschwand aus der Bestätigung). Tritt jemand von einem zugeteilten Platz oder der Warteliste zurück, bekommt die Lehrgangs-Verwaltung Bescheid, um nachzubesetzen.
- Verdienstausfall: Fehlen Geburtsdatum, Geburtsort oder Anschrift, wird die Bescheinigung nicht gedruckt und nicht als ausgestellt vermerkt – die Vorschau sagt, wem was fehlt. Vorher konnte eine unvollständige Bescheinigung entstehen, die danach gesperrt war.
- Verdienstausfall: In der Übersicht der Verwaltung steht „Bescheinigung für den Arbeitgeber angefragt“ als Aufgabe. „Teilnahme bestätigen“ und „Zum Einsatz“ aus der Verwaltung führen direkt auf die Einsatzseite der Führung, wo bestätigt wird (vorher landete man in einer Liste ohne diese Möglichkeit).
- Unterlagen: Hinweistext korrigiert – alle Mitglieder sehen die Unterlagen, die eigenen Lehrgänge stehen oben.

## 0.9.7 – 29.10.2026

**Lehrgänge: Teilnahme bestätigen auf einen Blick**

- „Lehrgangsteilnahmen bestätigen“ in der Übersicht führt jetzt direkt zu „Zuteilung & Teilnahme“. Dort steht oben ein Kasten mit jeder Teilnahme, deren Lehrgang vorbei ist – mit den Knöpfen „Absolviert“ und „Nicht teilgenommen“.
- In „Nach Person“ sind solche Einträge nicht mehr grün „Zugeteilt“, sondern bernsteinfarben „Teilnahme bestätigen“ – vorher sah es aus, als sei alles erledigt.
- Offene Bestätigungen aus einem anderen Lehrgangsjahr werden im Kasten genannt, mit Knopf zum Jahr.

## 0.9.6 – 29.10.2026

**Bericht & Ausdrucke einheitlich, Plugin-Name aufgeräumt**

- Einsatzseite, „Bericht & Ausdrucke“: alle Kacheln gleich aufgebaut – Name, eckige Status-Marke in den Systemfarben (Bernstein „zu tun“, Grün „abgeschlossen“, Blau „Entwurf“), eine Zeile Stand, unten die Knöpfe: erst „Ansehen / PDF“, rechts die Hauptaktion in Rot.
- Bescheinigungen Arbeitgeber: statt rundem „1 neu“ jetzt die Marke „1 angefragt“; der Balken ist Bernstein (Achtung) statt Rot (Fehler). „Drucken“ erscheint erst, wenn die Teilnahme bestätigt ist; „Verdienstausfall“ führt zur Übersicht.
- Plugin heißt in WordPress jetzt schlicht „SPIND“ (ohne „vormals MyFeuerwehr“), mit kurzer Beschreibung. Shortcodes und Einstellungen bleiben unverändert.

## 0.9.5 – 29.10.2026

**Website-Bericht vorausgefüllt, Wartungsseite einstellbar**

- Website-Bericht: Titel, Einsatzart, Einsatzort (ohne Hausnummer), Fahrzeuge und ein Textvorschlag werden aus Einsatzdaten und Einsatzbericht übernommen – „Lage bei Eintreffen“, „Bericht“, Einheit, Zahl der Einsatzkräfte, Fahrzeuge und andere Beteiligte. Personenbezogene Felder (🔒) bleiben draußen, Kennzeichen und Hausnummern werden entfernt.
- Ein Website-Bericht mit Text wird nie direkt veröffentlicht: Er wird immer als Entwurf angelegt, damit er vorher gekürzt und geprüft werden kann. Die Einsatzführung bekommt dazu einen Hinweis „Website-Bericht zur Freigabe“. Ohne Text (nur Eckdaten) geht es weiter direkt, wenn das eingestellt ist.
- Wartungsseite einstellbar unter Verwaltung → Einstellungen: an/aus, Überschrift, Text, Notruf-Hinweis, eigener Zusatzhinweis, mit Vorschau. Name, Logo, Farbe, Anschrift und Website kommen automatisch aus den Angaben der Wehr – so kann jede Wehr sie nutzen.
- Einsatzseite: „Mitglieder können sich noch selbst eintragen … Beteiligung abschließen“ und „Bitte prüfen“ stehen jetzt unten im Abschnitt „Beteiligte“ statt darüber.
- Atemschutz-Minuten kommen nur noch aus der Atemschutzüberwachung (Verwaltung → Atemschutz). Mitglieder haken „AGT“ an, Einsatzführung und Halle sehen die Minuten, ändern sie aber nicht.
- Fahrzeuge: Beim Zuordnen von Namen wird „LF 20“ jetzt dem „LF20/16“ zugeordnet statt doppelt angelegt.
- Handy: Das Verwaltungs-Symbol oben ist genauso groß wie die anderen Symbole.

## 0.9.4 – 29.10.2026

**Eigene Wartungsseite, Dashboards kommen von selbst zurück**

- Während Updates zeigt die Website statt „Briefly unavailable for scheduled maintenance“ eine eigene Seite der Feuerwehr: auf Deutsch, mit Logo, groß „Im Notfall immer 112“, Polizei 110 und Anschrift des Gerätehauses. Sie lädt sich von selbst neu, sobald die Seite wieder da ist.
- Die Wartungsseite liegt als WordPress-Vorlage (wp-content/maintenance.php) außerhalb des Plugins und funktioniert deshalb auch, während SPIND selbst aktualisiert wird. Eine schon vorhandene fremde Vorlage wird nicht überschrieben; beim Deaktivieren des Plugins wird unsere entfernt.
- Besprechungsraum und Halle laden nach einem Update nur dann neu, wenn die Seite wieder erreichbar ist – sie bleiben nicht mehr auf einer Wartungs- oder Fehlerseite hängen und müssen nicht von Hand neu geladen werden.
- Halle: Was während einer Wartung oder eines Updates eingetragen wird, bleibt auf dem Tablet und wird danach automatisch übertragen (vorher konnte ein Eintrag in diesem Moment als „abgelehnt“ verloren gehen).
- Einsatzseite: „… möchte ausgetragen werden“ und angefragte Bescheinigungen stehen jetzt oben im Abschnitt „Beteiligte“ – dort, wo die Beteiligung bearbeitet wird.

## 0.9.3 – 29.10.2026

**Benachrichtigungen: erledigt ist erledigt**

- Erledigt einer aus dem Team einen Vorgang, verschwindet die Benachrichtigung bei allen anderen – sie steht dann unter „Erledigt“ mit dem Hinweis „vom Team erledigt“. Das gilt für: „… war doch nicht dabei“, Bescheinigungen für den Arbeitgeber, Fahrzeug-Anfragen, Rückfragen, neue Mängel (sobald in Bearbeitung), Kleidermeldungen und Anregungen.
- „… war doch nicht dabei“: „Entscheiden“ springt auf der Einsatzseite direkt zur Anfrage und hebt sie kurz hervor. Offene Anfragen (Austragen, Bescheinigungen) stehen jetzt oben, über den Fahrzeugzeiten.
- Das Anklicken allein hakt eine Entscheidung nicht mehr ab – sie bleibt offen, bis jemand „Austragen“ oder „Bleibt drin“ gewählt bzw. die Bescheinigung gedruckt hat.
- Ist der Vorgang schon erledigt, sagt SPIND das beim Anklicken, statt eine leere Einsatzseite zu zeigen.
- Fragt dieselbe Person später erneut an, kommt auch wieder eine neue Benachrichtigung.

## 0.9.2 – 29.10.2026

**App-Symbol: das Feuerwehr-Signet der Website**

- Das App-Symbol des Mitgliederbereichs (Startbildschirm auf iPhone und Android, Browser-Tab) ist jetzt das Website-Icon der Seite – bei uns das klassische Feuerwehr-Signet. Ändern lässt es sich in WordPress unter Design → Customizer → Website-Information → Website-Icon. Ohne Website-Icon bleibt es beim Buchstaben auf der Vereinsfarbe.
- Das App-Symbol wird nach einem Update neu geladen, statt bis zu einer Woche aus dem Zwischenspeicher zu kommen. Wer die App schon auf dem Startbildschirm hat, sieht das neue Symbol je nach Handy erst später oder nach erneutem Hinzufügen.

## 0.9.1 – 29.10.2026

**Großer Check: Nachweise und Zwei-Faktor abgesichert**

- Ist eine Bescheinigung für den Arbeitgeber gedruckt oder ausgehändigt, bleibt die Beteiligung fest: Sie kann weder entfernt noch „nicht bestätigt“ werden – weder in der Halle noch vom Mitglied oder der Einsatzführung. Ein Änderungswunsch geht weiterhin an die Zugführung.
- Ein Einsatz mit gedruckten Bescheinigungen lässt sich nicht mehr löschen – er bleibt als Nachweis erhalten.
- Zwei-Faktor: Ist sie schon eingerichtet, kann sie nicht einfach neu eingerichtet werden. Für ein neues Handy erst mit gültigem Code abschalten, dann neu einrichten. So kann niemand mit einer offenen Sitzung den zweiten Faktor austauschen.
- Änderungsprotokoll: Bei Änderungen an der Beteiligung steht jetzt auch der Stand „vorher“ drin, auch beim Entfernen.
- Fahrzeughalle: Die Uhrzeit „Arbeit wieder aufgenommen“ ist nur sichtbar, solange die Anfrage noch offen ist.

## 0.9.0 – 28.10.2026

**Beta: Druckvorschau, Verdienstausfall neu gedacht, Zwei-Faktor im Profil**

- Neues Versionsschema: SPIND ist ab jetzt Beta (0.x). Die 1.0.0 erscheint mit dem produktiven Einsatz und nach den ersten Tests. Frühere interne Stände hießen 3.x.
- Version und „Was ist neu?“ stehen unten in der Fußzeile von Mitgliederbereich und Verwaltung.
- Druckvorschau: Jeder Ausdruck öffnet sich erst als A4-Blatt (Bescheinigungen, Listen, Dienstplan, Fahrtenbuch, Jahresbericht …) – dann „PDF / Drucken“.
- Verdienstausfall: Die Feuerwehr bestätigt, druckt und lässt unterschreiben, dann wird die Bescheinigung dem Mitglied ausgehändigt (Ausgabeliste mit Empfangsquittung). Der Arbeitgeber beantragt die Erstattung bei der Gemeinde.
- Verdienstausfall gleich mit beantragen: im Fenster der Fahrzeughalle beim Eintragen und in der Beteiligungsliste der Einsatzführung („+ beantragen“, nach dem Bestätigen „Drucken“).
- „Ausgestellt“ und „ausgehändigt“ werden erst beim Drucken vermerkt – nur Ansehen ändert nichts.
- Startseite erinnert, wenn für eine angefragte Bescheinigung Geburtsdatum, Geburtsort oder Anschrift fehlen.
- Einsatzseite: eine Speichern-Leiste für Einsatzdaten und Fahrzeugzeiten; Ausdrucke als Kacheln mit Stand.
- Benachrichtigungen führen direkt an die Stelle zum Weitermachen: Profil, Einsatz, Bescheinigung, Team-Aufgaben, Unterweisung, Sicherheits-Check.
- Datums- und Zeitfelder: Wert sitzt senkrecht mittig (auch in Safari).
- Zwei-Faktor-Anmeldung kann jedes Mitglied selbst einrichten: Profil → Darstellung & Konto.
- Demo-Modus für Vorführungen auch für Wehrführung und LZ-Führung (neues Recht „Demo-Modus“).
- Website: Zahlen-Bereich neu – Foto der Fahrzeuge im Hintergrund, klare Kacheln.

## 0.8 – 28.10.2026

**Frühere Beta-Stände (intern 3.21.0–3.21.3)**

- Fotos ordnen: Titel, Bildbeschreibung und Bildbereich (Gruppenfoto, Einsatz, Übung …), Filter in der Mediathek, Baustein [ww_galerie] – Dateien und Adressen bleiben unverändert.
- Geheime Links und Schlüssel (Alarm, Halle, Besprechungsraum, Sicherung, Kalender) verdeckt; Anzeigen, Kopieren und Öffnen werden protokolliert.
- Speichern vereinheitlicht: „Speichern“ statt „Sichern“, eine Speichern-Leiste je Seite statt vieler Knöpfe.
- Kalender umbenannt: „Lehrgänge (MTF)“ und „Dienst- und Übungsabende“.
