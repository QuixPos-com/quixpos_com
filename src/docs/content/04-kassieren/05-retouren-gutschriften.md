---
id: retouren-gutschriften
title: Retouren & Gutschriften
description: Warenrücknahmen erfassen, Belegbezug herstellen und Beträge erstatten.
---
# Retouren & Gutschriften

QuixPOS bietet einen geführten Workflow für Warenrücknahmen und Umtauschvorgänge.

![Retouren-Modus mit Rückgabe-Übersicht](/docs/images/pos-return-overlay.avif)

## Ablauf einer Retoure

1. Klicke in der Kasse auf das Menü und wähle **Retoure erfassen**.
2. Scanne den Barcode des Original-Kassenbelegs oder gib die Belegnummer ein.
3. Wähle die Artikel aus, die der Kunde zurückgibt.
4. QuixPOS erstellt eine negative Position (Gutschrift).
5. Wähle die Erstattungsmethode (Barauszahlung, Rückbuchung oder Verrechnung mit neuen Artikeln).

![Belegdetails einer Retoure](/docs/images/receipt-detail-return.avif)

> [!IMPORTANT]
> Der erzeugte Rückgabebeleg enthält automatisch die Referenz auf die ursprüngliche Belegnummer und TSE-Transaktions-ID.
