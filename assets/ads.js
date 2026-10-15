/* Manual editorial placements only. No AdSense library or request exists here. */
(function (root) {
  'use strict';
  const consent = root.JMConsent;
  const article = document.querySelector('main[data-ads="editorial"]');
  if (!consent || !consent.config.enabled || !article) return;
  // Flipping the single flag reveals reserved placeholders only, never real ads.
  // Approval, publisher validation, certified CMP and privacy isolation remain blockers.
  article.querySelectorAll('[data-ad-placeholder]').forEach(slot => { slot.hidden = false; });
  // Real advertising is intentionally not implemented. Never load third-party scripts
  // on the tool origin: they could inspect JSON in DOM or memory. See README.
}(window));
