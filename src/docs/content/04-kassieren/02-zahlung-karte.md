---
id: zahlung-karte
title: Kartenzahlung & SumUp Terminals
description: Kartenzahlung mit SumUp Air, Solo oder stationären O.P.I.-Terminals.
---
# Kartenzahlung & Terminals

QuixPOS unterstützt die nahtlose Integration moderner Kartenterminals wie **SumUp** (Air, Solo, Lite) sowie standardisierte **O.P.I.-Zahlungsterminals**.

![Kartenzahlungs-Dialog im POS](/docs/images/dialog-payment-terminal.avif)

## Ablauf einer Kartenzahlung

1. Im Kassenbeleg auf **Karte** tippen.
2. Der Dialog sendet den exakten Zahlungsbetrag an das gekoppelte Terminal.
3. Der Kunde hält die Girokarte, Kreditkarte oder das Smartphone (Apple Pay / Google Pay) an das Terminal.
4. Nach erfolgreicher PIN- oder Kontaktlos-Autorisierung meldet das Terminal die Bestätigung an QuixPOS zurück.
5. Der Beleg wird automatisch abgeschlossen und signiert.

> [!IMPORTANT]
> Sollte eine Kartenzahlung vom Kunden abgebrochen werden oder das Terminal nicht erreichbar sein, kann der Vorgang über **Abbrechen** sicher gestoppt werden, ohne den aktuellen Warenkorb zu verlieren.
