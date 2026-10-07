import { DOMParser } from '@xmldom/xmldom';
export class XmlSecurityError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
export function safeParseXml(bytes: Uint8Array, maxBytes = 2 * 1024 * 1024) {
  if (bytes.byteLength > maxBytes) throw new XmlSecurityError('XML_TOO_LARGE');
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new XmlSecurityError('XML_ENCODING');
  }
  if (
    /<!\s*(DOCTYPE|ENTITY)|<\?xml-stylesheet|<\s*(?:\w+:)?include\b/i.test(text)
  )
    throw new XmlSecurityError('XML_UNSAFE');
  let depth = 0,
    nodes = 0;
  for (const token of text.matchAll(/<\/?[A-Za-z_][^>]*>/g)) {
    if (++nodes > 50000) throw new XmlSecurityError('XML_COMPLEXITY');
    if (token[0].startsWith('</')) depth--;
    else if (!token[0].endsWith('/>')) depth++;
    if (depth > 64) throw new XmlSecurityError('XML_DEPTH');
  }
  try {
    const document = new DOMParser({
      onError: () => {
        throw new XmlSecurityError('XML_MALFORMED');
      },
    }).parseFromString(text, 'application/xml');
    const stack = [{ node: document.documentElement, depth: 1 }];
    let count = 0;
    while (stack.length) {
      const current = stack.pop()!;
      if (++count > 50000) throw new XmlSecurityError('XML_COMPLEXITY');
      if (current.depth > 64) throw new XmlSecurityError('XML_DEPTH');
      for (const child of Array.from(current.node?.childNodes ?? []))
        if (child.nodeType === 1)
          stack.push({
            node: child as typeof document.documentElement,
            depth: current.depth + 1,
          });
    }
    return document;
  } catch (error) {
    if (error instanceof XmlSecurityError) throw error;
    throw new XmlSecurityError('XML_MALFORMED');
  }
}
