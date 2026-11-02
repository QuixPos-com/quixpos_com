---
id: einstellungen-stammdaten
title: Stammdaten & Filialangaben
description: Kassen-ID, Firmenanschrift, Steuernummern und Bon-Texte konfigurieren.
---
# Stammdaten & Filialangaben

In den Stammdaten werden die grundlegenden Identifikationsdaten der Kassenstation und des Unternehmens hinterlegt.

![Stammdaten-Konfiguration](/docs/images/settings-baseinfo.avif)

## Wichtige Konfigurationsfelder

| Feld | Typ | Beschreibung |
| :--- | :--- | :--- |
| **Kassen-ID** (`cashregisterid`) | Text | Eindeutige Kennung dieser Kasse (z.B. `KASSE-01`). Pflichtfeld für TSE! |
| **Firmenname** | Text | Offizieller Unternehmensname für den Kassenbeleg. |
| **Straße / Hausnummer** | Text | Anschrift des Ladengeschäfts. |
| **PLZ / Ort** | Text | Postleitzahl und Stadt. |
| **Steuernummer / USt-IdNr.** | Text | Steuerliche Identifikationsnummer (gesetzliche Pflichtangabe). |
| **Kopfzeile (Bon)** | Mehrzeilig | Individuelle Begrüßung oder Hinweise auf dem Bon. |
| **Fußzeile (Bon)** | Mehrzeilig | Dankestext, Öffnungszeiten oder Website-Link. |

> [!IMPORTANT]
> Die Kassen-ID muss innerhalb deines Unternehmens eindeutig sein und darf nach der TSE-Initialisierung nicht mehr beliebig geändert werden.
