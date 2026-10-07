import type { Worker as OcrWorker } from 'tesseract.js';
import type { PDFDocumentLoadingTask, RenderTask } from 'pdfjs-dist';
import {
  MAX_TEXT,
  inspectSourceFile,
  MAX_FILE_BYTES,
  MAX_IMAGE_PIXELS,
} from '@flux/document-import';

export interface ReadDocument {
  text: string;
  codes: string[];
  previews: string[];
  pages: number;
  usedOcr: boolean;
}

const MAX_PAGES = 5;

const RENDER_EDGE = 1800;
export async function scanCanvas(canvas: HTMLCanvasElement): Promise<string[]> {
  const { default: jsQR } = await import('jsqr');
  const small = document.createElement('canvas');
  const scale = Math.min(1, 1400 / Math.max(canvas.width, canvas.height));
  small.width = Math.max(1, Math.round(canvas.width * scale));
  small.height = Math.max(1, Math.round(canvas.height * scale));
  const ctx = small.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(canvas, 0, 0, small.width, small.height);
  const codes: string[] = [];
  for (let index = 0; index < 4; index++) {
    const image = ctx.getImageData(0, 0, small.width, small.height);
    const code = jsQR(image.data, image.width, image.height, {
      inversionAttempts: 'attemptBoth',
    });
    if (!code) break;
    if (!codes.includes(code.data)) codes.push(code.data);
    const corners = [
      code.location.topLeftCorner,
      code.location.topRightCorner,
      code.location.bottomRightCorner,
      code.location.bottomLeftCorner,
    ];
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(corners[0]!.x, corners[0]!.y);
    for (const point of corners.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.closePath();
    ctx.fill();
  }
  small.width = small.height = 0;
  return codes;
}
function canvasFor(width: number, height: number) {
  if (!Number.isFinite(width * height) || width <= 0 || height <= 0)
    throw new Error('Ungültige Bildabmessungen.');
  const scale = Math.min(2, RENDER_EDGE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(width * scale));
  canvas.height = Math.max(1, Math.floor(height * scale));
  return { canvas, scale };
}
export async function readDocument(
  file: File,
  mode: 'letter' | 'qr',
  signal: AbortSignal,
  progress: (message: string) => void,
): Promise<ReadDocument> {
  if (!file.size || file.size > MAX_FILE_BYTES)
    throw new Error('Die Datei muss zwischen 1 Byte und 10 MB groß sein.');
  signal.throwIfAborted();
  let worker: OcrWorker | undefined;
  let loading: PDFDocumentLoadingTask | undefined;
  let render: RenderTask | undefined;
  let disposed = false;
  const result: ReadDocument = {
    text: '',
    codes: [],
    previews: [],
    pages: 0,
    usedOcr: false,
  };
  const stop = () => {
    disposed = true;
    render?.cancel();
    void worker?.terminate();
    void loading?.destroy().catch(() => {});
  };
  let rejectAbort: (reason: Error) => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const onAbort = () => {
    stop();
    rejectAbort(new Error('Lesen abgebrochen.'));
  };
  signal.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => {
    stop();
    rejectAbort(
      new Error(
        'Das Lesen hat zu lange gedauert. Bitte verwenden Sie ein kleineres oder schärferes Dokument.',
      ),
    );
  }, 90000);
  const ensureActive = () => {
    if (disposed || signal.aborted) throw new Error('Lesen abgebrochen.');
  };
  async function ocr(canvas: HTMLCanvasElement) {
    ensureActive();
    if (!worker) {
      progress('Texterkennung wird lokal geladen …');
      const { createWorker } = await import('tesseract.js');
      ensureActive();
      worker = await createWorker('deu', 1, {
        workerPath: '/reader/ocr/worker.min.js',
        corePath: '/reader/ocr',
        langPath: '/reader/ocr',
        workerBlobURL: false,
        cacheMethod: 'none',
        errorHandler: () => {},
        logger: (message) => {
          if (!disposed && message.status === 'recognizing text')
            progress(
              `Seite ${result.pages}: Text wird gelesen · ${Math.round(message.progress * 100)} %`,
            );
        },
      });
      if (disposed) {
        await worker.terminate();
        ensureActive();
      }
      await worker.setParameters({ preserve_interword_spaces: '1' });
    }
    ensureActive();
    result.usedOcr = true;
    const read = await worker.recognize(canvas);
    ensureActive();
    return read.data.text;
  }
  const addText = (text: string) => {
    if (result.text.length + text.length > MAX_TEXT)
      throw new Error(
        'Zu viel Text. Bitte laden Sie höchstens fünf kurze Seiten hoch.',
      );
    result.text += (result.text ? '\n\n' : '') + text;
  };
  async function inspect(canvas: HTMLCanvasElement, text = '') {
    ensureActive();
    try {
      result.previews.push(canvas.toDataURL('image/jpeg', 0.8));
      const codes = await scanCanvas(canvas);
      ensureActive();
      for (const code of codes)
        if (!result.codes.includes(code)) result.codes.push(code);
      if (mode === 'letter')
        addText(text.trim().length >= 20 ? text : await ocr(canvas));
    } finally {
      canvas.width = canvas.height = 0;
    }
  }
  async function work() {
    const data = new Uint8Array(await file.arrayBuffer());
    ensureActive();
    const source = inspectSourceFile(data);
    if (source.kind === 'image') {
      progress('Bild wird gelesen …');
      const bitmap = await createImageBitmap(file);
      try {
        ensureActive();
        if (bitmap.width * bitmap.height > MAX_IMAGE_PIXELS)
          throw new Error(
            'Das Foto ist zu groß. Bitte auf höchstens 24 Megapixel verkleinern.',
          );
        const { canvas } = canvasFor(bitmap.width, bitmap.height);
        canvas
          .getContext('2d')!
          .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        result.pages = 1;
        await inspect(canvas);
      } finally {
        bitmap.close();
      }
    } else {
      progress('PDF wird geöffnet …');
      const pdf = await import('pdfjs-dist');
      ensureActive();
      pdf.GlobalWorkerOptions.workerSrc = '/reader/pdf/pdf.worker.min.mjs';
      loading = pdf.getDocument({
        data,
        password: '',
        enableXfa: false,
        stopAtErrors: true,
        maxImageSize: MAX_IMAGE_PIXELS,
        canvasMaxAreaInBytes: MAX_IMAGE_PIXELS * 4,
        cMapUrl: '/reader/pdf/cmaps/',
        cMapPacked: true,
        standardFontDataUrl: '/reader/pdf/standard_fonts/',
        wasmUrl: '/reader/pdf/wasm/',
        // The reader does not create a viewer, annotation layer or scripting manager.
        disableAutoFetch: true,
        verbosity: 0,
      });
      const document = await loading.promise;
      ensureActive();
      if (document.numPages > MAX_PAGES)
        throw new Error(
          'Bitte laden Sie höchstens fünf PDF-Seiten auf einmal hoch.',
        );
      for (let number = 1; number <= document.numPages; number++) {
        ensureActive();
        result.pages = number;
        progress(`Seite ${number} von ${document.numPages} wird gelesen …`);
        const page = await document.getPage(number);
        const viewport = page.getViewport({ scale: 1 });
        const { canvas, scale } = canvasFor(viewport.width, viewport.height);
        try {
          render = page.render({
            canvas,
            viewport: page.getViewport({ scale }),
          });
          await render.promise;
          let text = '';
          if (mode === 'letter') {
            const content = await page.getTextContent();
            let lastY: number | undefined;
            for (const item of content.items) {
              if (!('str' in item)) continue;
              const y = item.transform[5] as number;
              if (
                lastY !== undefined &&
                Math.abs(y - lastY) > 3 &&
                !text.endsWith('\n')
              )
                text += '\n';
              text += item.str + (item.hasEOL ? '\n' : ' ');
              lastY = y;
              if (text.length > MAX_TEXT)
                throw new Error('Diese PDF-Seite enthält zu viel Text.');
            }
          }
          await inspect(canvas, text);
        } finally {
          canvas.width = canvas.height = 0;
          page.cleanup();
        }
      }
    }
    ensureActive();
    return result;
  }
  try {
    return await Promise.race([work(), aborted]);
  } catch (error) {
    if (error instanceof Error && error.name === 'PasswordException')
      throw new Error('Passwortgeschützte PDFs bitte zuerst entsperren.');
    if (
      error instanceof Error &&
      ['InvalidPDFException', 'UnknownErrorException'].includes(error.name)
    )
      throw new Error(
        'Die PDF-Datei konnte nicht gelesen werden. Bitte prüfen Sie das Original.',
      );
    throw error;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
    stop();
  }
}
