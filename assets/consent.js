/* Integration placeholder, NOT a Google-certified CMP. No vendor script is loaded. */
(function (root) {
  'use strict';
  const config = Object.freeze({enabled:false, publisher:'[PUB-ID or "not yet approved"]', cmp:'[CMP CHOICE]', usPrivacy:'[US STATE OPT-OUT / RESTRICTED DATA PROCESSING CONFIGURATION]'});
  let state = 'undecided';
  // A production certified CMP must own consent, TCF signals, withdrawal, and regions.
  // There is deliberately no synthetic TCF API and no public grant-consent shortcut.
  root.JMConsent = Object.freeze({config, allowed:() => false, state:() => state});
  const status = document.getElementById('consent-status');
  document.getElementById('consent-decline').addEventListener('click', () => { state='declined'; status.textContent='Optional services declined for this page. No advertising or analytics scripts are loaded.'; });
  document.getElementById('consent-review').addEventListener('click', () => {
    status.textContent='Advertising is disabled. UNVERIFIED: [CMP CHOICE] is not configured or certified for this deployment. No consent is granted and no optional scripts are loaded.';
  });
}(window));
