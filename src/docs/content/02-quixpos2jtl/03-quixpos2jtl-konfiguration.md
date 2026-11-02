---
id: quixpos2jtl-konfiguration
title: Konfiguration & Pairing
description: Die 7 Einstellungs-Tabs in QuixPOS2JTL: Datenbank, Netzwerk, Zertifikate und Kassen-Pairing.
---
# Konfiguration & Kassen-Pairing

Klicke auf das QuixPOS2JTL Tray-Symbol um den Konfigurationsdialog zu öffnen.

### 1. Database (MSSQL)
- **Host / Server**: IP oder Rechnername des Microsoft SQL Servers (z.B. `localhost` oder `192.168.1.50`).
- **Instanz**: Optionaler Instanzname (z.B. `JTLWAWI`).
- **Datenbank**: Name der JTL-Datenbank (Standard: `eazybusiness`).
- **Benutzer & Passwort**: SQL-Benutzerdaten (z.B. `sa` oder dedizierter POS-User).

### 2. Shop & Filiale
- Auswahl der JTL-Filiale und des Mandanten.

### 3. Network & Ports
- **HTTP Port**: Standard: `8087`
- **HTTPS Port**: Standard: `4447` (empfohlen für verschlüsselte POS-Kommunikation)

### 4. Certificate (TLS/SSL)
- Erstellung selbstsignierter SSL-Zertifikate oder Import bestehender Zertifikate.

### 5. Pairing (Kassen-Kopplung)
- **PIN-Generierung**: Erzeuge einen 6-stelligen Pairing-PIN für neue Kassen.
- **Autorisierte Geräte**: Liste aller gekoppelten Kassen

### 6. Service Manager
- Statusanzeige des Hintergrunddienstes (Läuft / Gestoppt).
- Starten, Stoppen, Installieren und Deinstallieren des Windows-Dienstes.

### 7. Live Logs
