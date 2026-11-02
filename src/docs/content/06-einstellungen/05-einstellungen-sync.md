---
id: einstellungen-sync
title: Synchronisation & JTL-Anbindung
description: Automatische Synchronisation mit der Warenwirtschaft (JTL-Wawi / Cloud-Backend).
---
# Synchronisation & Backend-Anbindung

QuixPOS synchronisiert Artikel, Bestände, Preise und abgeschlossene Verkäufe automatisch mit deiner Warenwirtschaft oder dem QuixPOS Cloud-Backend.

![Synchronisations-Einstellungen](/docs/images/settings-sync.avif)

## Verbindungsparameter

- **Sync Host** (`synchost`): Serveradresse oder Domain des Sync-Dienstes.
- **Sync Port** (`syncport`): Port für die gesicherte Datenübertragung (HTTPS / WSS).
- **Sync PIN / Auth-Token** (`syncpin`, `syncauthtoken`): Autorisierungsdaten der Kassenstation.
- **SSL-Zertifikat**: Verschlüsselte TLS-Zertifikate zur Absicherung der Kommunikation.

![Sync-Status im POS](/docs/images/dialog-sync-status.avif)

## Offline-Fähigkeit

> [!IMPORTANT]
> Sollte die Internetverbindung unterbrochen sein, bleibt QuixPOS **voll einsatzbereit**. Alle Verkäufe und TSE-Signaturen werden lokal zwischengespeichert und automatisch synchronisiert, sobald die Verbindung wiederhergestellt ist.
