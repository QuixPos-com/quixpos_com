---
id: tagesabschluss-zbon
title: Tagesabschluss & Kassensturz (Z-Bon)
description: Tagesabschluss durchführen, Bargeldbestand zählen und Z-Bon drucken.
---
# Tagesabschluss & Kassensturz (Z-Bon)

Am Ende jedes Verkaufstags wird der gesetzlich vorgeschriebene **Tagesabschluss (Z-Bon)** durchgeführt.

![Kassensturz und Zählprotokoll-Dialog](/docs/images/dialog-reconciliation.avif)

## Ablauf des Tagesabschlusses

1. Klicke im Hauptmenü auf **Tagesabschluss / Kassensturz**.
2. **Bargeld zählen**: Trage die gezählten Münzen und Scheine im Zählprotokoll ein.
3. QuixPOS berechnet automatisch:
   - **Soll-Bargeldbestand** (Anfangsbestand + Bareinnahmen - Barausgaben)
   - **Ist-Bargeldbestand** (Gezähltes Bargeld)
   - **Differenz** (Kassendifferenz in €)
4. Prüfe die Umsätze aufgeteilt nach Steuersätzen (19 %, 7 %, 0 %) und Zahlungsarten (Bar, Karte).
5. Klicke auf **Tagesabschluss durchführen**.

![Z-Bon Abschlussbericht](/docs/images/dialog-reconciliation-report.avif)

> [!IMPORTANT]
> Der Z-Bon wird mit einer speziellen Abschluss-Signatur der TSE versehen und im Fiskalspeicher unveränderbar archiviert. Der Z-Zähler wird um 1 erhöht.
