# Advertising readiness checklist

These changes prepare editorial content, disclosures, and manual placements. They do **not** guarantee Google AdSense approval or legal compliance. Advertising remains disabled and no vendor resources are fetched by default.

## Required before submission or activation

1. Supply a real, monitored operator email. `contact/index.html` currently says the address is awaiting configuration; do not submit this as a complete contact page. Update Privacy and Terms contact references as appropriate.
2. Review the policy pages against your actual operator identity, jurisdiction, hosting logs/retention, and vendors. Obtain suitable legal review where needed.
3. Verify publisher approval and your actual publisher ID. Replace the commented seller line in `ads.txt` using AdSense's exact authorized seller entry. Do not invent IDs.
4. Install a Google-certified CMP in the marked head placeholder where required. Implement regional vendor signals, withdrawal/review controls, US state opt-outs and GPC as applicable. The template is not a CMP.
5. Keep AdSense Auto ads, anchor/sticky ads, popups, interstitials, and vignette ads off. Only the two manual editorial placements are supported. Same-page vendor code can read editor DOM; if confidential processing is a requirement, host monetized editorial content on a separately isolated origin rather than enabling ads on the tool.
6. Configure the disabled inline loader with verified `publisher` and manual `slots` IDs and an adapter `consentAllowed` reading actual CMP state. Return false until applicable vendor signals/choices permit loading. Dispatch `joinjson:consent-change` when choices change. The CMP must handle revocation signals; removing mounted ads cannot undo requests or unload an already executed vendor library.
7. Review CSP for actual CMP and Google script/frame/image/connect origins in production. The default `_headers` deliberately blocks third-party script/frames; this is not a switch-ready advertising integration. Never solve this by disabling CSP or adding global wildcards. Inline script hashes must be regenerated when code changes. Vercel does not automatically interpret `_headers`; configure provider-specific headers separately if needed.
8. Test live behavior in applicable regions, with denied, granted, and withdrawn consent, blocked ads, slow networks, all input errors, and every supported viewport. Verify actual rendered creatives stay at least 120px from every control; the placeholder uses 128px vertical margins, fixed minimum height, no sticky positioning, and responsive width. Vendor creative behavior must be reviewed after activation.

## Implemented behavior

- Original homepage guide exceeds 500 words, with deep-merge examples and five native FAQ accordions.
- Tool UI and merge semantics are preserved.
- Two labeled `.ad-slot` placeholders below the result and before the FAQ reserve at least 280px when eligible.
- Empty inputs, pending validation, invalid JSON, stale results, active imports, and import errors hide both slots. A successful current merge with two valid inputs enables placeholders only.
- Ads are not requested at all with the current disabled configuration. The integration template loads asynchronously only near an eligible slot and after the configured consent check succeeds.
- The app does not upload pasted/file JSON. URL imports contact the source host; this distinction is disclosed.

## Validation

Run `npm test`, `node --test tests/adsense.test.mjs`, `node tests/three-step-browser.mjs`, and `npm run build` with Node 20.6+ (browser checks need Chrome and a runtime with WebSocket support). No paid advertising or live vendor requests are needed for these checks.
