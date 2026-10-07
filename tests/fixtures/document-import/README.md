# Fictional document-reader fixtures

All names, requests, amounts and references are synthetic. No customer document is included.

- `letter.pdf`: one-page text PDF with two explicit mixed-tax net lines.
- `letter.png`: high-resolution printed-text image for real local German OCR.
- `scanned.pdf`: image-only PDF requiring OCR.
- `locked.pdf`: encrypted copy, fixture password `fixture-only-password`, expected rejection.
- `too-many-pages.pdf`: six pages, expected page-limit rejection.
- `generate.py`: reproducible content builder using Pillow, ReportLab and pypdf. Uses Arial on macOS or DejaVu Sans on Linux for the raster fixture. Font rendering/encryption randomness may change binary hashes; these are parsing fixtures, not golden-byte assertions.

QR PNGs and the synthetic camera stream are generated inside the browser test using the development-only `qrcode` package. The application itself only scans; it does not expose a QR-generation feature. Never replace these fixtures with production documents.
