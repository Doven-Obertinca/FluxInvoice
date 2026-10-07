# Read a letter, PDF or QR code

Added at the user's request after Phase 2. Open **Rechnungen → Brief / QR-Code lesen**, or use the link above a new invoice or the command palette.

1. Choose a photo/PDF, or select QR-Code and start the camera. Camera access requires browser permission and HTTPS (localhost also works).
2. Review the original preview, extracted text and proposed values. Select the customer deliberately. Text corrections can be re-evaluated.
3. Confirm that you are preparing your own outgoing invoice, then open the normal invoice editor. Complete or correct every line, date and tax rate, save, run the official E-Rechnung check and finalize through the existing confirmation flow.

Reading a document never saves or finalizes an invoice. Incoming supplier invoices are not booked or turned into an invoice from your business automatically. A source invoice's number and issue date are informational; new invoices use the existing fiscal numbering and current issue date. Company and customer master data are not modified by recognition.

## Supported input

- JPEG, PNG, static WebP and PDF; up to 10 MiB, five PDF pages and 24 megapixels per image. Raster header dimensions are checked before image decoding. HEIC must first be exported as JPEG. Password-protected PDFs must be unlocked by their owner before import.
- PDF text extraction with raster OCR fallback for pages without enough text. German printed-text OCR is local; handwriting and complex table layouts are not guaranteed. A text PDF with incomplete/misleading embedded text still requires comparison with its rendered original.
- Explicit German labels such as `Kunde:`, `Kundenreferenz:`, `Leistungsdatum:` and `Gesamtbetrag:` provide suggestions. Complete lines require an explicit net unit price and supported tax rate. Examples:

  ```text
  Beratung 2 Std. 100,00 EUR netto 19 %
  Position: Fachbuch | Menge: 1 | Einheit: C62 | Nettopreis: 50,00 | USt: 7 %
  ```

  Arbitrary prose is shown for review; the parser does not invent financial lines. Missing lines are completed in the existing editor, whose normal quantity/unit/VAT defaults are explicitly disclosed. Source gross totals are compared with the editor's calculated total when available. Discounts and unsupported tax language generate attention messages; they are not automatically mapped.

- EPC/SEPA QR versions 001/002 with UTF-8 character set 1, plus labelled plain-text invoice details. EPC fields, amount bounds, IBAN checksum, field lengths, payload length and mutually exclusive remittance fields are checked. The implementation is a reader, not a bank's payment-validation or beneficiary-verification service. Other encodings, Swiss QR invoices, payment-app URLs and unknown dialects are explicitly unsupported.
- QR codes can be read from uploaded images, rendered PDF pages or a live camera. Up to four codes per page are detected; the user selects which content to review when multiple codes are present. Dense, blurry or damaged codes may need a closer photo.

Payment QR data describes a beneficiary, gross payment amount and remittance reference. It does **not** establish the invoice customer, net price, VAT or buyer reference. These are never inferred from the payment amount, and QR bank details never replace the issuer's bank account. QR scanning does not initiate a payment or open a link.

## Processing and privacy

Source bytes, rendered previews, OCR text and decoded QR contents stay in browser memory; they are not uploaded, logged, persisted to local storage or archived. Only normal user-reviewed invoice fields are submitted on save. Search terms deliberately entered into customer search use the existing authenticated search action. Leaving/reloading the page discards the unsaved import. There is no retention of the original letter as an invoice attachment in this feature.

PDF.js 6.4.299 handles PDF parsing in its worker and renders inert canvases. The app does not instantiate its viewer, annotation actions, scripting manager or XFA support. Tesseract.js 7.0.0 with pinned German language data runs OCR in a worker; jsQR 1.4.0 decodes bounded rasters. No generative model or external recognition API is used. References: [PDF.js](https://github.com/mozilla/pdf.js/), [Tesseract local installation](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md), [jsQR](https://github.com/cozmo/jsQR), [EPC QR guidelines](https://www.europeanpaymentscouncil.eu/document-library/guidance-documents/quick-response-code-guidelines-enable-data-capture-initiation).

The reader limits text to 60,000 characters, renders at most an 1,800-pixel longest edge, limits QR scan rasters, processes pages serially and allows cancellation. A 90-second deadline ends document reading and terminates active OCR/PDF work. If cancellation occurs while OCR assets initialize, the worker is terminated when initialization resolves and is never given document pixels. Camera sessions have a 30-second deadline and release tracks after recognition, cancellation, page hiding or unmount. Decoder-internal browser memory is not an OS-enforced resource quota. Deployment CSP must accommodate only the required same-origin workers/assets and local raster previews; no broad third-party script permission is needed.

## Reproducible deployment

`npm ci` installs version/lockfile-integrity-pinned dependencies. `npm run reader:prepare` copies their worker, WebAssembly, German language, font and CMap assets into ignored `apps/web/public/reader`, with a SHA-256 manifest and available package licenses. Root `npm run dev` and `npm run build` run this automatically. If invoking workspace scripts directly, run asset preparation first. Ship this public directory with the built app; no runtime CDN download is required. The full asset set is about 57 MiB on disk; browsers load the applicable engine files on demand.

No database migration, cloud credentials or additional server endpoint is needed. The import page requires `invoice:write`; saving uses the unchanged server-authoritative, tenant-scoped invoice service. Permissions-Policy allows same-origin camera requests while continuing to block microphone/geolocation; camera access is requested only by the user's scan action.

## Verification

The unit suite covers explicit/ambiguous extraction, decimal handling, malicious text, EPC bounds/checksums/unsupported variants, link refusal and file-header/resource guards. Browser coverage uses real OCR on a fictional photo and scanned PDF, text-PDF extraction, real generated QR rasters, imported-draft saving and official validation, invalid/encrypted/oversized files, cancellation, camera denial and a synthetic camera stream through the real decoder. The synthetic stream verifies track cleanup without accessing a person's camera. Browser requests are checked for external destinations. Desktop, tablet and mobile screenshots plus both-theme axe checks cover the new screens. Real mobile hardware and every camera/browser combination have not been certified.

Test fixtures are described in [the fixture README](../tests/fixtures/document-import/README.md). Phase 2's report remains historical evidence of the completed fiscal engine; this import feature is a subsequent extension.
