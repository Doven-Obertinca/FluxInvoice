from pathlib import Path
from reportlab.pdfgen import canvas
from pypdf import PdfReader, PdfWriter
from io import BytesIO
out=Path(__file__).parent
buffer=BytesIO()
c=canvas.Canvas(buffer,pagesize=(595,842),invariant=1)
c.setFont('Helvetica',18);c.drawString(48,785,'Fictional incoming invoice fixture')
c.setFont('Helvetica',11)
for i,line in enumerate(['Embedded XML is used for invoice semantics.','This is an attachment-extraction fixture, not certified PDF/A-3.','No real supplier or payable claim.','Invoice values: inspect the embedded xrechnung.xml.']):
 c.drawString(48,745-i*22,line)
c.save()
w=PdfWriter();w.append(PdfReader(buffer))
w.add_attachment('xrechnung.xml',Path('packages/einvoice/fixtures/golden/3.0.2/standard19.xml').read_bytes())
w.write(out/'hybrid.pdf')
