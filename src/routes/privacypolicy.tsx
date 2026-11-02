import { Link } from '../components/Router'
import '../legal.css'

export function PrivacyPolicyRoute() {
  return (
    <div class="legal-page">
      <header class="legal-header">
        <Link class="logo" href="/">
          <span class="logo-mark" aria-hidden="true" />
          QuixPOS
        </Link>
      </header>

      <main class="legal-main">
        <h1>Datenschutzerklärung</h1>
        <p class="legal-meta">Stand: November 2026</p>

        <h2>1. Verantwortlicher</h2>
        <p>
          Verantwortlich für die Datenverarbeitung auf dieser Website im Sinne der
          Datenschutz-Grundverordnung (DSGVO) ist:
        </p>
        <p>
          Amygdala AI
          <br />
          E-Mail: quixpos@gmail.com
        </p>

        <h2>2. Überblick</h2>
        <p>
          Über diese Website kannst du das Kassensystem QuixPOS kostenlos testen. Dafür meldest
          du dich mit deinem Google-Konto an („Google Single Sign-On“) und kannst anschließend
          eine eigene Test-Instanz anlegen. Wir verarbeiten dabei nur die Daten, die für diesen
          Zweck erforderlich sind.
        </p>

        <h2>3. Server-Logfiles</h2>
        <p>
          Beim Aufruf dieser Website werden durch den Webserver automatisch technische Daten
          erfasst (IP-Adresse, Datum und Uhrzeit des Zugriffs, aufgerufene Seite, Browsertyp,
          Betriebssystem, Referrer). Diese Daten sind erforderlich, um die Website auszuliefern
          und ihre Sicherheit zu gewährleisten. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO
          (berechtigtes Interesse am sicheren und stabilen Betrieb). Die Logfiles werden nach
          spätestens 14 Tagen gelöscht, sofern sie nicht zur Aufklärung eines Sicherheitsvorfalls
          benötigt werden.
        </p>

        <h2>4. Anmeldung mit Google</h2>
        <p>
          Für die Anmeldung nutzen wir den Dienst „Sign in with Google“ der Google Ireland
          Limited, Gordon House, Barrow Street, Dublin 4, Irland („Google“). Wenn du dich
          anmeldest, wird ein Skript von Google (accounts.google.com) geladen und du wirst
          gebeten, der Weitergabe deiner Daten an uns zuzustimmen.
        </p>
        <p>Von Google erhalten wir dabei ausschließlich:</p>
        <ul>
          <li>deine E-Mail-Adresse,</li>
          <li>dein Profilbild (sofern vorhanden),</li>
          <li>eine eindeutige Google-Konto-Kennung.</li>
        </ul>
        <p>
          Wir erhalten keinen Zugriff auf dein Passwort, deine E-Mails, Kontakte oder sonstige
          Inhalte deines Google-Kontos. Diese Daten nutzen wir ausschließlich, um dein
          Nutzerkonto anzulegen, dich zu identifizieren und dir deine Test-Instanz zuzuordnen.
          Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Erfüllung des Nutzungsverhältnisses).
        </p>
        <p>
          Google kann dabei Daten auch in die USA übermitteln. Google ist unter dem
          EU-US Data Privacy Framework zertifiziert. Weitere Informationen findest du in der{' '}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
            Datenschutzerklärung von Google
          </a>
          .
        </p>

        <h2>5. Nutzerkonto und Test-Instanz</h2>
        <p>
          Wenn du eine kostenlose Test-Instanz buchst, speichern wir zusätzlich den von dir
          gewählten Instanznamen, den gebuchten Tarif und den Gültigkeitszeitraum. Für die
          Instanz wird eine Subdomain eingerichtet und ein TLS-Zertifikat ausgestellt; der
          Instanzname ist dadurch öffentlich als Teil der Webadresse sichtbar. Daten, die du
          innerhalb deiner Test-Instanz erfasst (z. B. Artikel oder Testbelege), werden
          ausschließlich zum Betrieb dieser Instanz gespeichert.
        </p>
        <p>
          Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO. Die Daten werden gespeichert, solange
          dein Nutzerkonto besteht. Nach Ablauf der Testphase oder auf deinen Wunsch hin werden
          das Konto und die zugehörige Instanz gelöscht, soweit keine gesetzlichen
          Aufbewahrungspflichten entgegenstehen.
        </p>

        <h2>6. Cookies</h2>
        <p>
          Nach der Anmeldung setzen wir ein technisch notwendiges Sitzungs-Cookie, damit du
          angemeldet bleibst. Es enthält keine Tracking-Informationen. Rechtsgrundlage ist
          § 25 Abs. 2 Nr. 2 TDDDG sowie Art. 6 Abs. 1 lit. b DSGVO. Wir setzen keine Analyse-
          oder Werbe-Cookies ein.
        </p>

        <h2>7. Empfänger der Daten</h2>
        <p>
          Wir geben deine Daten nicht an Dritte weiter, verkaufen sie nicht und nutzen sie nicht
          für Werbung. Empfänger sind lediglich unser Hosting-Dienstleister im Rahmen einer
          Auftragsverarbeitung (Art. 28 DSGVO) sowie Google im Rahmen der Anmeldung.
        </p>

        <h2>8. Deine Rechte</h2>
        <p>Du hast jederzeit das Recht auf:</p>
        <ul>
          <li>Auskunft über deine gespeicherten Daten (Art. 15 DSGVO),</li>
          <li>Berichtigung unrichtiger Daten (Art. 16 DSGVO),</li>
          <li>Löschung deiner Daten (Art. 17 DSGVO),</li>
          <li>Einschränkung der Verarbeitung (Art. 18 DSGVO),</li>
          <li>Datenübertragbarkeit (Art. 20 DSGVO),</li>
          <li>Widerspruch gegen die Verarbeitung (Art. 21 DSGVO).</li>
        </ul>
        <p>
          Wende dich dazu einfach an die oben genannte Kontaktadresse. Außerdem hast du das Recht,
          dich bei einer Datenschutz-Aufsichtsbehörde zu beschweren.
        </p>
        <p>
          Du kannst den Zugriff dieser Anwendung auf dein Google-Konto jederzeit unter{' '}
          <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">
            myaccount.google.com/permissions
          </a>{' '}
          widerrufen.
        </p>

        <h2>9. Änderungen</h2>
        <p>
          Wir passen diese Datenschutzerklärung an, wenn sich die Website oder die rechtlichen
          Anforderungen ändern. Es gilt die jeweils hier veröffentlichte Fassung.
        </p>

        <p>
          <Link href="/terms">Nutzungsbedingungen</Link> · <Link href="/">Zur Startseite</Link>
        </p>
      </main>
    </div>
  )
}

export default PrivacyPolicyRoute

