# External compliance artifacts

No official validator binary or extracted standards bundle is vendored in the repository. The installer downloads the exact upstream releases listed in `manifest.json` into ignored local storage and preserves the distribution unchanged, including embedded notices and schema comments.

The KoSIT validator is Apache-2.0, with its bundled dependency notices. The configuration bundle includes independently licensed components: KoSIT configuration/XRechnung rules, CEN validation material (EUPL-1.2), and OASIS/UN/CEFACT schema notices. The manifest's license field is a provenance summary, not a replacement license grant. Retain all original notices and review the upstream releases' terms when redistributing a deployment image or standards material. Do not attribute the entire bundle to the application's license.

Official provenance:

- https://github.com/itplr-kosit/validator/tree/v1.6.3
- https://github.com/itplr-kosit/validator-configuration-xrechnung/tree/v2026-08-31
- https://github.com/ConnectingEurope/eInvoicing-EN16931/tree/validation-1.3.16
- https://docs.oasis-open.org/ubl/os-UBL-2.1/UBL-2.1.html

The developer-only Java installation was downloaded from the official Eclipse Adoptium Temurin 21.0.12.1+1 release and verified against its published checksum. Its original license/notices remain in the ignored runtime directory. CI obtains Java 21 through setup-java; production must independently provision and maintain its approved Java runtime.
