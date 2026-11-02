---
id: einstellungen-drucker
title: Bon-Drucker & Druckvorlagen
description: ESC/POS Netzwerk- und USB-Drucker anbinden und Bon-Layouts gestalten.
---
# Bon-Drucker & Druckvorlagen

QuixPOS steuert handelsübliche Thermobondrucker über das standardisierte **ESC/POS-Protokoll** an (z.B. Epson TM-T88, TM-m30, Star Micronics, Munbyn).

![Drucker-Einstellungen](/docs/images/settings-printer.avif)

## Drucker-Konfiguration

- **Drucker-IP** (`printerip`): IP-Adresse des Netzwerk- oder WLAN-Bondruckers im lokalen Netzwerk (z.B. `192.168.1.150`).
- **Port**: Standardmäßig Port `9100` (RAW Print Port).
- **Automatischer Bon-Schnitt**: Papier nach Belegabschluss automatisch schneiden.
- **Kassenschublade öffnen**: Impuls zum Öffnen der Kassenschublade bei Barzahlung senden.

![Vorschau der Kassenbon-Druckvorlage](/docs/images/dialog-receipt-template-preview.avif)

## Vorlagen-Anpassung

Die Vorlagen für **Kassenbelege**, **Stornobelege** und den **Tagesabschluss (Z-Bon)** können flexibel angepasst und in der Live-Vorschau kontrolliert werden.
