"""Fictional reader fixtures; run with Pillow, reportlab and pypdf installed."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from PIL import Image, ImageDraw, ImageFont
from pypdf import PdfReader, PdfWriter

out = Path(__file__).parent
lines = [
    'Bitte bereiten Sie unsere Rechnung vor.',
    '',
    'Kunde: Kontur Werkstatt GmbH',
    'Kundenreferenz: AUFTRAG-2026-42',
    'Leistungsdatum: 06.10.2026',
    '',
    'Beratung 2 Std. 100,00 EUR netto 19 %',
    'Fachbuch 1 Stk. 50,00 EUR netto 7 %',
    '',
    'Gesamtbetrag: 291,50 EUR',
    '',
    'Fiktive Testdaten - keine echte Rechnung.',
]
c = canvas.Canvas(str(out / 'letter.pdf'), pagesize=A4, invariant=1)
c.setFont('Helvetica', 13)
for i, line in enumerate(lines):
    c.drawString(50, 785 - i * 28, line)
c.save()
font_path = '/System/Library/Fonts/Supplemental/Arial.ttf'
if not Path(font_path).exists():
    font_path = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
font = ImageFont.truetype(font_path, 38)
im = Image.new('RGB', (1600, 1800), 'white')
draw = ImageDraw.Draw(im)
for i, line in enumerate(lines):
    draw.text((90, 90 + i * 90), line, fill='black', font=font)
im.save(out / 'letter.png')
c = canvas.Canvas(str(out / 'scanned.pdf'), pagesize=A4, invariant=1)
c.drawImage(str(out / 'letter.png'), 0, 0, width=A4[0], height=A4[1], preserveAspectRatio=True, anchor='c')
c.save()
c = canvas.Canvas(str(out / 'too-many-pages.pdf'), pagesize=A4, invariant=1)
for i in range(6):
    c.drawString(50, 780, 'Fictional page limit test'); c.showPage()
c.save()
w = PdfWriter()
w.append(PdfReader(out / 'letter.pdf'))
w.encrypt('fixture-only-password')
with open(out / 'locked.pdf', 'wb') as f: w.write(f)
