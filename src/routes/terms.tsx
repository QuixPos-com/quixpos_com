import { Link } from '../components/Router'
import '../legal.css'

export function TermsRoute() {
  return (
    <div class="legal-page">
      <header class="legal-header">
        <Link class="logo" href="/">
          <span class="logo-mark" aria-hidden="true" />
          QuixPOS
        </Link>
      </header>

      <main class="legal-main">
        <h1>Nutzungsbedingungen</h1>
        <p class="legal-meta">Stand: November 2026</p>

        <h2>1. Anbieter und Geltungsbereich</h2>
        <p>
          Diese Nutzungsbedingungen gelten für die Nutzung dieser Website sowie der darüber
          angebotenen kostenlosen Test-Instanzen des Kassensystems QuixPOS. Anbieter ist:
        </p>
        <p>
          Amygdala AI
          <br />
          E-Mail: quixpos@gmail.com
        </p>

        <h2>2. Leistungsbeschreibung</h2>
        <p>
          Nach der Anmeldung mit einem Google-Konto kannst du eine kostenlose Test-Instanz von
          QuixPOS anlegen. Die Test-Instanz dient ausschließlich dazu, die Funktionen des
          Kassensystems kennenzulernen und auszuprobieren. Die Nutzung ist kostenlos; es
          entstehen keine Zahlungsverpflichtungen und es wird kein Abonnement automatisch
          kostenpflichtig verlängert.
        </p>
        <p>
          Eine Test-Instanz ist zeitlich befristet (derzeit 6 Monate) und kann innerhalb des
          dafür vorgesehenen Zeitraums vor Ablauf verlängert werden. Ein Anspruch auf
          Verlängerung besteht nicht.
        </p>

        <h2>3. Nutzerkonto</h2>
        <p>
          Für die Nutzung ist eine Anmeldung über Google erforderlich. Pro Person ist ein
          Nutzerkonto vorgesehen. Du bist dafür verantwortlich, den Zugang zu deinem
          Google-Konto vor dem Zugriff Dritter zu schützen.
        </p>

        <h2>4. Kein Einsatz im Echtbetrieb</h2>
        <p>
          Die Test-Instanz ist nicht für den produktiven Kassenbetrieb bestimmt. Insbesondere
          ersetzt sie keine nach der Kassensicherungsverordnung (KassenSichV) ordnungsgemäß
          gemeldete und mit einer zertifizierten TSE betriebene Kasse. Für die Erfüllung
          steuerlicher und gesetzlicher Pflichten beim Einsatz eines Kassensystems bist du selbst
          verantwortlich.
        </p>

        <h2>5. Pflichten der Nutzer</h2>
        <p>Bei der Nutzung ist es untersagt,</p>
        <ul>
          <li>Instanznamen zu wählen, die Rechte Dritter (z. B. Marken- oder Namensrechte) verletzen oder anstößig sind,</li>
          <li>rechtswidrige Inhalte zu speichern oder zu verbreiten,</li>
          <li>den Dienst missbräuchlich zu nutzen, zu überlasten oder Sicherheitsmechanismen zu umgehen,</li>
          <li>automatisiert massenhaft Konten oder Instanzen anzulegen.</li>
        </ul>
        <p>
          Bei Verstößen können wir die betroffene Instanz bzw. das Nutzerkonto sperren oder
          löschen.
        </p>

        <h2>6. Verfügbarkeit und Daten</h2>
        <p>
          Wir bemühen uns um einen störungsfreien Betrieb, schulden jedoch keine bestimmte
          Verfügbarkeit. Test-Instanzen können aus technischen Gründen gewartet, zurückgesetzt
          oder eingestellt werden. In einer Test-Instanz gespeicherte Daten werden nicht
          gesichert und können verloren gehen. Speichere dort keine Daten, auf die du angewiesen
          bist.
        </p>
        <p>
          Nach Ablauf der Testphase wird die Instanz einschließlich der darin gespeicherten Daten
          gelöscht.
        </p>

        <h2>7. Haftung</h2>
        <p>
          Da der Dienst unentgeltlich bereitgestellt wird, haften wir nur für Vorsatz und grobe
          Fahrlässigkeit. Die Haftung für Schäden aus der Verletzung des Lebens, des Körpers oder
          der Gesundheit sowie nach dem Produkthaftungsgesetz bleibt unberührt.
        </p>

        <h2>8. Kündigung</h2>
        <p>
          Du kannst die Nutzung jederzeit beenden und die Löschung deines Kontos über die oben
          genannte Kontaktadresse verlangen. Wir können das kostenlose Testangebot mit
          angemessener Frist einstellen.
        </p>

        <h2>9. Datenschutz</h2>
        <p>
          Informationen zur Verarbeitung deiner personenbezogenen Daten findest du in unserer{' '}
          <Link href="/privacypolicy">Datenschutzerklärung</Link>.
        </p>

        <h2>10. Änderungen und Schlussbestimmungen</h2>
        <p>
          Wir können diese Nutzungsbedingungen anpassen; über wesentliche Änderungen informieren
          wir angemeldete Nutzer rechtzeitig. Es gilt das Recht der Bundesrepublik Deutschland
          unter Ausschluss des UN-Kaufrechts. Zwingende Verbraucherschutzvorschriften des Staates,
          in dem du deinen gewöhnlichen Aufenthalt hast, bleiben unberührt. Sollte eine
          Bestimmung unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.
        </p>

        <p>
          <Link href="/privacypolicy">Datenschutzerklärung</Link> · <Link href="/">Zur Startseite</Link>
        </p>
      </main>
    </div>
  )
}

export default TermsRoute

