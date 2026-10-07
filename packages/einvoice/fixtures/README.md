# Fixture provenance and scope

All invoice identities, parties, amounts, bank/reference examples and text are fictional project-authored test material. They are not real customer records or a copied official example corpus. The IBAN is a public-format test example and must never be used to send money.

`corpus.ts` defines 19%, 7%, mixed VAT/multiple lines, and line/document allowance/charge cases. The base includes fractional quantity, umlauts, Unicode, XML special characters, email endpoints, bank transfer and a supplied B2G-style buyer reference. `golden/3.0.2` contains committed deterministic UBL bytes. Regeneration is an intentional review operation: `node --import tsx scripts/generate-goldens.ts`; never regenerate merely to hide a failing comparison.

`tests/einvoice.test.ts` checks goldens against official pinned KoSIT artifacts and safely inspects round-trip totals. Negative cases include omitted seller/buyer/reference, wrong payable/VAT breakdown, invalid date, malformed XML, invalid UTF-8, DTD/XXE, XInclude, size/depth limits and unavailable/timed-out Java. Core schema tests reject unsupported tax/currency/unit scenarios; lifecycle tests prove invalid input cannot reserve a number or finalize, exact-byte archival, database rollback recovery, duplication, immutability, authorization and historical snapshot behavior.

Validator artifacts have their own provenance and licenses in `../compliance/manifest.json`; project fixtures do not replace those authoritative rules.
