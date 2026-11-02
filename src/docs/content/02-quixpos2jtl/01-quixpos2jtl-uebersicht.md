---
id: quixpos2jtl-uebersicht
title: Überblick
description: Wie QuixPOS2JTL die Kasse mit der JTL-Warenwirtschaft verbindet.
---
# QuixPOS2JTL - Überblick

**QuixPOS2JTL** ist das Verbindungsglied zwischen deinem [QuixPOS](https://quixpos.com) Kassensystem und der **JTL-Wawi** Datenbank.

![QuixPOS2JTL Einstellungen - Datenbankverbindung](/docs/images/quixpos-settings-database.avif)

Nach dem auswählen der Datenbank müssen JTL-Mandant, Verkaufskanal und Benutzer ausgewählt werden.

![QuixPOS2JTL Einstellungen - Shop](/docs/images/quixpos-settings-shop.avif)

**QuixPOS2JTL** kann als Windows Service installiert werden.

## Funktionen

- kompatibel zu JTL-POS
- **Automatische Synchronisation**:
  - Artikeldaten, Preise, Barcodes und Kategorieen direkt aus MSSQL.
  - Produktbilder werden on-the-fly skaliert.
  - Kassenbelege werden sofort in JTL verbucht.
  - Bestände werden in Echtzeit abgeglichen.
- **Flexible Betriebsmodi**:
  - **System Tray App**: Schlanker Betrieb im Hintergrund der Windows-Taskleiste.
  - **Windows-Hintergrunddienst (LocalSystem)**: Dauerhafter Systemdienst für den Produktivbetrieb vor dem Login.
  - **Linux / Docker CLI**: Headless-Betrieb auf POS-Servern für automatisierte Umgebungen.
