export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 24_000_000;
export type SourceFile =
  { kind: 'pdf' } | { kind: 'image'; width: number; height: number };
// Read dimensions before decoding so a small compressed file cannot request an
// unbounded raster. Browser decoders still own their internal memory allocation.
export function inspectSourceFile(bytes: Uint8Array): SourceFile {
  if (!bytes.length || bytes.length > MAX_FILE_BYTES)
    throw new Error('Die Datei muss zwischen 1 Byte und 10 MB groß sein.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (from: number, count: number) =>
    String.fromCharCode(...bytes.slice(from, from + count));
  const dimensions = (width: number, height: number): SourceFile => {
    if (
      !width ||
      !height ||
      width > 32768 ||
      height > 32768 ||
      width * height > MAX_IMAGE_PIXELS
    )
      throw new Error(
        'Das Foto ist zu groß oder beschädigt. Bitte auf höchstens 24 Megapixel verkleinern.',
      );
    return { kind: 'image', width, height };
  };
  if (ascii(0, 5) === '%PDF-') return { kind: 'pdf' };
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    ascii(1, 7) === 'PNG\r\n\x1a\n' &&
    ascii(12, 4) === 'IHDR'
  )
    return dimensions(view.getUint32(16), view.getUint32(20));
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 0xff) break;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === undefined || marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if (
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf,
        ].includes(marker) &&
        length >= 8
      )
        return dimensions(
          view.getUint16(offset + 5),
          view.getUint16(offset + 3),
        );
      offset += length;
    }
  }
  if (bytes.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    const format = ascii(12, 4);
    if (format === 'VP8X') {
      if ((bytes[20]! & 2) !== 0)
        throw new Error(
          'Bitte ein einzelnes Foto statt einer WebP-Animation auswählen.',
        );
      const uint24 = (offset: number) =>
        bytes[offset]! + bytes[offset + 1]! * 256 + bytes[offset + 2]! * 65536;
      return dimensions(uint24(24) + 1, uint24(27) + 1);
    }
    if (
      format === 'VP8 ' &&
      bytes[23] === 0x9d &&
      bytes[24] === 0x01 &&
      bytes[25] === 0x2a
    )
      return dimensions(
        view.getUint16(26, true) & 0x3fff,
        view.getUint16(28, true) & 0x3fff,
      );
    if (format === 'VP8L' && bytes[20] === 0x2f) {
      const packed = view.getUint32(21, true);
      return dimensions((packed & 0x3fff) + 1, ((packed >>> 14) & 0x3fff) + 1);
    }
  }
  throw new Error(
    'Bitte wählen Sie eine echte PDF-, JPEG-, PNG- oder WebP-Datei. HEIC bitte zuerst als JPEG exportieren.',
  );
}
