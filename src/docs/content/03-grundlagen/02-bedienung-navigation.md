---
id: bedienung-navigation
title: Tastatur, Scanner & Touch
description: Effizientes Arbeiten an der Kasse per Tastatureingabe, Barcodescanner und Touchscreen.
---
# Tastatur, Scanner & Bedienung

QuixPOS ist so konzipiert, dass Kassiervorgänge blitzschnell per Tastatur, Barcode-Handscanner oder Touchscreen durchgeführt werden können – ohne zeitraubendes Klicken oder manuelles Fokussieren von Eingabefeldern.

## Tastatureingabe & Artikelsuche

Beim Arbeiten mit der Tastatur muss das Suchfeld nicht erst mit der Maus angeklickt werden:

- **Automatische Sucheingabe (Type-to-Search)**: Sobald Zahlen oder Buchstaben auf der Tastatur eingetippt werden, landen diese automatisch im Artikelsuchfeld.
- **[kbd:Enter] – Artikel übernehmen & Text markieren**: Liefert die Suche genau **ein** eindeutiges Ergebnis, fügt ein Druck auf [kbd:Enter] diesen Artikel direkt zum Kassenbeleg hinzu. Gleichzeitig markiert [kbd:Enter] den gesamten Text im Suchfeld vollständig. Jeder darauffolgende Tastendruck überschreibt den bisherigen Inhalt sofort und beginnt einen neuen Suchbegriff, ohne dass das Feld manuell gelöscht werden muss.
- **[kbd:ESC] – Sucheingabe schließen**: Durch Drücken der Taste [kbd:ESC] wird die Sucheingabe beendet und das Suchfeld geschlossen bzw. geleert.

| Taste / Eingabe | Funktion | Beschreibung |
| :--- | :--- | :--- |
| [kbd:A]–[kbd:Z] / [kbd:0]–[kbd:9] | **Automatische Suche** | Eingaben werden ohne vorheriges Anklicken sofort in das Artikelsuchfeld übernommen |
| [kbd:Enter] | **Übernehmen & Text markieren** | Übernimmt den Artikel bei eindeutigem Treffer und markiert das Textfeld vollständig für die nächste Sucheingabe |
| [kbd:ESC] | **Suche schließen** | Schließt das Sucheingabefeld und setzt die Suche zurück |

## Barcodescanner

Über USB oder Bluetooth angebundene Barcodescanner fügen sich nahtlos in diesen Ablauf ein:

- **Direkte Erfassung**: Auch der Barcodescanner füllt direkt das Artikelsuchfeld mit dem erfassten Code.
- **Automatisches Bonieren**: Ist der gescannte Code eindeutig, wird der zugehörige Artikel sofort automatisch auf den Beleg gebucht (Handscanner senden nach dem Barcode standardmäßig ein [kbd:Enter]-Signal).
- **Unterbrechungsfreier Scanablauf**: Weil [kbd:Enter] den Suchfeldtext automatisch vollständig markiert, überschreibt jeder nachfolgende Barcodescan (oder Tastendruck) den vorherigen Code unmittelbar.

> [!TIP]
> Dadurch lassen sich mehrere Artikel mit Barcode hintereinander in Sekundenschnelle erfassen, ohne dass der Bildschirm oder die Maus berührt werden müssen, dennoch bleibt der gescannte Barcode im Textfeld sichtbar.

## Touchscreen- & Mausbedienung

Alternativ oder ergänzend zur Tastatur und zum Scanner lässt sich QuixPOS vollständig per Touch bedienen.
