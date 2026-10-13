# Compliance boundary — Phase 2

ERechno issues a deliberately narrow German domestic EUR invoice subset as XRechnung UBL. It does not determine the correct tax treatment of a transaction, guarantee recipient acceptance, or claim comprehensive tax/GoBD certification. A visual preview is not the authoritative electronic invoice. The original archived XML is.

## Verified production baseline

Research performed 6 October 2026; production status and retention source rechecked 7 October 2026.

| Item                    | Pinned value                        |
| ----------------------- | ----------------------------------- |
| Normative family        | XRechnung 3.0, effective 2024-02-01 |
| Editorial specification | 3.0.2                               |
| Technical configuration | 2026-08-31, published 2026-09-02    |
| Syntax                  | UBL 2.1 Invoice, type 380           |
| KoSIT validator         | 1.6.3, released 2026-08-20          |
| CEN validation          | 1.3.16                              |
| XRechnung Schematron    | 2.6.0                               |
| Profile identity        | `xrechnung-ubl-3.0.2-2026-08-31`    |

Sources: [XStandards Einkauf production specification](https://xeinkauf.de/xrechnung/), [3.0.2 specification](https://xeinkauf.de/app/uploads/2024/07/302-XRechnung-2024-06-20.pdf), [official configuration release](https://github.com/itplr-kosit/validator-configuration-xrechnung/releases/tag/v2026-08-31), [KoSIT 1.6.3](https://github.com/itplr-kosit/validator/releases/tag/v1.6.3), [CEN 1.3.16](https://github.com/ConnectingEurope/eInvoicing-EN16931/releases/tag/validation-1.3.16). Preliminary XRechnung 4.0 is excluded. KoSIT 1.6.3 includes the URI-resolution security correction; older 1.6.2 is not used.

The machine-readable [manifest](packages/einvoice/compliance/manifest.json) records dates, sources, versions, syntax identifiers, download SHA-256 values and every unpacked rule-file hash. `npm run compliance:install` installs only these immutable URLs and verifies their hashes. The runtime independently verifies the JAR and extracted files. Historical validation rows and documents retain their original versions and manifest hash; downloads never regenerate documents under a new profile.

## Implemented scope

German seller and buyer, EUR, ordinary positive invoice lines, standard VAT category S at 19% and 7% including mixed invoices; pieces, hours and days; fractional quantities/prices; line and document allowances/charges; delivery/service date; due date; bank transfer code 58 with German IBAN; contact details; email electronic endpoints (scheme EM); buyer reference including a supplied B2G routing reference. The application does not discover or verify a recipient's assigned Leitweg-ID or transmit to a procurement portal.

Reverse charge, exemptions, intra-community supply, foreign currencies/countries, credit notes, self-billing, prepayments, invoice chains and special schemes are unsupported. There is no Peppol transmission, ZUGFeRD/Factur-X, PDF/A-3, generative-AI extraction, DATEV, SAP or Lexware integration. A process identifier containing `peppol` is required profile metadata, not a transmission implementation.

## Validation and evidence

Strict input schemas and the existing decimal domain engine feed frozen relational party/line snapshots. The normalized semantic model is independent of UBL and web/auth code. [Business-term mapping](packages/einvoice/src/mapping.ts) documents supported field → semantic property → EN 16931 term → UBL location. XMLBuilder2 serializes ordered UTF-8 elements with escaping. Official KoSIT validation performs XSD and supplied Schematron checks; TypeScript does not attempt to reproduce the complete official rule set.

Readiness and issuance are distinct append-only runs. The final numbered XML must pass issuance validation; its SHA-256 must equal both the validated candidate and the verified stored object. A failed validator, timeout, semantic error or archive failure never creates successful finalization. `FLUX_DRAFT/1` historical runs remain domain checks and do not establish E-Rechnung readiness.

The fixture corpus is fictional, authored for this project, and versioned alongside committed golden UBL files. Official validation is the authority; golden stability and safe round-trip assertions supplement it. Customer/master changes do not alter an issued invoice or downloaded bytes.

## Archival and retention

Production/staging refuse the local adapter. The S3 adapter requires enabled versioning, Object Lock, KMS encryption, COMPLIANCE retention, a concrete version ID, matching size/hash metadata, and a successful exact-byte readback. The local adapter is useful for development and integrity testing; its read-only files are **not** regulatory WORM storage.

Policy `DE-INVOICE-8Y-CALENDAR-1` retains until the beginning of the ninth year after the later of issue year and actual processing year. It implements a minimum based on the eight-year calendar-year-end rule in [§ 14b UStG](https://www.gesetze-im-internet.de/ustg_1980/__14b.html). The statute preserves other retention obligations. There is no automatic deletion or retention-shortening API. Operators must address extended retention, legal holds, storage location, audit access, backup retention and applicable individual obligations; the default timestamp is not a universal permission to delete.

Production object-lock behavior must be verified against the actual deployment bucket and IAM/KMS policies. Contract tests are not a live AWS certification. The system has not been deployed to a production archive in this task.

## Document-reading extension

A subsequent user-requested extension reads local photos, PDFs and QR codes to suggest editable draft data. Recognition is not compliance validation. It neither creates a fiscal artifact nor determines tax treatment; the existing official validation and finalization protocol still applies. Payment QR data cannot establish net prices, VAT, buyer identity or entitlement to issue an invoice. See [document import](docs/DOCUMENT-IMPORT.md) for supported formats and review requirements.
