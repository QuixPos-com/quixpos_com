---
id: einstellungen-tse
title: TSE & Fiskalisierung (KassenSichV)
description: Zertifizierte Technische Sicherheitseinrichtung (USB / SD / Cloud TSE) einrichten.
---
# TSE & KassenSichV Fiskalisierung

QuixPOS erfüllt alle Vorgaben der deutschen **Kassensicherungsverordnung (KassenSichV)** durch Unterstützung zertifizierter TSE-Module (Technische Sicherheitseinrichtung).

![TSE-Einstellungen](/docs/images/settings-tse.avif)

## Konfigurationsparameter

- **TSE-Server Host** (`tseserverhost`): IP-Adresse oder Hostname des TSE-Dienstes (z.B. `127.0.0.1` oder lokales Netzwerk).
- **TSE-Server Port** (`tseserverport`): Kommunikationsport des TSE-Dienstes (Standard: `8000`).
- **TSE Bind PIN** (`tsebindpin`): Sicherheits-PIN zur Koppelung der Kassen-ID mit der TSE.
- **TSE Auth Token** (`tseauthtoken`): Verschlüsselter Authentifizierungsschlüssel.

![TSE Status und Zertifikatsprüfung](/docs/images/dialog-tse-status.avif)

## TSE Status prüfen

Über den Statusdialog kann jederzeit die ordnungsgemäße Funktion der TSE überprüft werden:
- **Seriennummer der TSE**
- **Zertifikatsgültigkeit & Ablaufdatum**
- **Anzahl signierter Transaktionen**
- **Aktueller Selbsttest-Status**

> [!NOTE]
> Jeder Kassenbeleg enthält automatisch den gesetzlich vorgeschriebenen QR-Code mit der kryptografischen Signatur, dem Transaktionszähler und dem Zeitstempel der TSE. Dieser TSE-QR-Code auf dem Beleg kann beispielsweise mit der App [fiskalcheck](https://play.google.com/store/apps/details?id=com.fiskaly.fiskalcheck) verifiziert werden.
