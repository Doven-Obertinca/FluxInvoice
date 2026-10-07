import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { manifest, issue, terms, type Issue } from './semantic';
import { safeParseXml, XmlSecurityError } from './security';
export interface ValidationResult {
  valid: boolean;
  issues: Issue[];
  sha256: string;
  durationMs: number;
  reportHash: string;
}
export interface Validator {
  validate(xml: Buffer): Promise<ValidationResult>;
}
export const sha256 = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
export const manifestHash = sha256(Buffer.from(JSON.stringify(manifest)));
const ruleMap: Record<string, keyof typeof terms> = {
  'BR-DE-15': 'buyerReference',
  'BR-DE-16': 'sellerTax',
  'BR-DE-5': 'sellerContact',
  'BR-DE-6': 'sellerPhone',
  'BR-DE-7': 'sellerEmail',
  'BR-DE-19': 'iban',
  'BR-CO-25': 'totals',
  'BR-CO-10': 'totals',
  'BR-CO-15': 'totals',
  'BR-CO-16': 'totals',
  'PEPPOL-EN16931-R010': 'buyerEmail',
  'PEPPOL-EN16931-R020': 'sellerEmail',
};
export function parseReport(bytes: Buffer): {
  valid: boolean;
  issues: Issue[];
} {
  const doc = safeParseXml(bytes, 8 * 1024 * 1024);
  const ns = 'http://www.xoev.de/de/validator/varl/1';
  const accepted = doc.getElementsByTagNameNS(ns, 'accept').length > 0;
  const issues: Issue[] = [];
  const seen = new Set<string>();
  for (const element of Array.from(
    doc.getElementsByTagNameNS(
      'http://purl.oclc.org/dsdl/svrl',
      'failed-assert',
    ),
  )) {
    const ruleId = element.getAttribute('id') ?? 'KOSIT-RULE';
    const key = ruleId + ':' + element.getAttribute('location');
    if (seen.has(key)) continue;
    seen.add(key);
    const t = ruleMap[ruleId] ? terms[ruleMap[ruleId]] : undefined;
    const raw = element.textContent ?? '';
    const bt = raw.match(/BT-\d+/)?.[0] ?? '';
    const mapped = t ?? Object.values(terms).find((t) => t.bt === bt);
    const row = issue(
      ruleId,
      mapped?.field ?? '',
      mapped?.message ??
        'Die E-Rechnungsprüfung hat eine Unstimmigkeit gefunden. Öffnen Sie die Details oder prüfen Sie die Angaben.',
      'KOSIT',
      mapped?.bt ?? bt,
      element.getAttribute('location') ?? '',
    );
    row.severity = ['warning', 'information'].includes(
      element.getAttribute('flag') ?? '',
    )
      ? 'WARNING'
      : 'ERROR';
    issues.push(row);
  }
  if (!accepted && !issues.some((i) => i.severity === 'ERROR'))
    issues.push(
      issue(
        'KOSIT-REJECTED',
        '',
        'Die Datei konnte nicht als gültige XRechnung bestätigt werden.',
        'KOSIT',
      ),
    );
  return {
    valid: accepted && !issues.some((i) => i.severity === 'ERROR'),
    issues,
  };
}
export class KositValidator implements Validator {
  private verified: Promise<void> | undefined;
  private active = false;
  constructor(
    private readonly options: {
      home: string;
      java: string;
      timeoutMs?: number;
    },
  ) {}
  private verify() {
    return (this.verified ??= (async () => {
      if (
        sha256(await readFile(resolve(this.options.home, 'validator.jar'))) !==
        manifest.artifacts[0]!.sha256
      )
        throw new Error('VALIDATOR_INTEGRITY');
      for (const [file, hash] of Object.entries(manifest.rules)) {
        if (
          sha256(await readFile(resolve(this.options.home, 'rules', file))) !==
          hash
        )
          throw new Error('RULESET_INTEGRITY');
      }
    })());
  }
  async validate(xml: Buffer): Promise<ValidationResult> {
    const start = performance.now();
    const hash = sha256(xml);
    const failure = (code: string, message: string): ValidationResult => ({
      valid: false,
      issues: [issue(code, '', message, 'SYSTEM')],
      sha256: hash,
      durationMs: Math.round(performance.now() - start),
      reportHash: '',
    });
    try {
      safeParseXml(xml);
    } catch (error) {
      return failure(
        error instanceof XmlSecurityError ? error.code : 'XML_UNSAFE',
        'Die XML-Datei ist beschädigt oder enthält unzulässige Inhalte.',
      );
    }
    if (this.active)
      return failure(
        'VALIDATOR_BUSY',
        'Die Prüfung ist ausgelastet. Bitte erneut versuchen.',
      );
    this.active = true;
    let directory: string | undefined;
    try {
      await this.verify();
      directory = await mkdtemp(join(tmpdir(), 'flux-kosit-'));
      await writeFile(join(directory, 'invoice.xml'), xml, { mode: 0o600 });
      const args = [
        '-Xms32m',
        '-Xmx256m',
        '-XX:ActiveProcessorCount=1',
        '-Djavax.xml.accessExternalDTD=',
        '-Djavax.xml.accessExternalSchema=file',
        '-Djavax.xml.accessExternalStylesheet=file',
        '-jar',
        resolve(this.options.home, 'validator.jar'),
        '-s',
        resolve(this.options.home, 'rules/scenarios.xml'),
        '-r',
        resolve(this.options.home, 'rules'),
        '-o',
        directory,
        '-l',
        'OFF',
        join(directory, 'invoice.xml'),
      ];
      const exit = await new Promise<number>((resolveExit, reject) => {
        const child = spawn(this.options.java, args, {
          cwd: directory,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: {
            NODE_ENV: 'production',
            LANG: 'C.UTF-8',
            TMPDIR: directory!,
            PATH: process.env.PATH ?? '/usr/bin:/bin',
          },
        });
        let size = 0;
        const cap = (chunk: Buffer) => {
          size += chunk.length;
          if (size > 1024 * 1024) {
            child.kill('SIGKILL');
            reject(new Error('VALIDATOR_OUTPUT_LIMIT'));
          }
        };
        child.stdout.on('data', cap);
        child.stderr.on('data', cap);
        const timer = setTimeout(() => {
          child.kill('SIGKILL');
          reject(new Error('VALIDATOR_TIMEOUT'));
        }, this.options.timeoutMs ?? 30000);
        child.on('error', () => {
          clearTimeout(timer);
          reject(new Error('VALIDATOR_UNAVAILABLE'));
        });
        child.on('close', (code) => {
          clearTimeout(timer);
          resolveExit(code ?? -1);
        });
      });
      if (exit < 0 || exit > 1)
        return failure(
          'VALIDATOR_FAILED',
          'Die Prüfung ist vorübergehend nicht verfügbar. Bitte erneut versuchen.',
        );
      const report = await readFile(join(directory, 'invoice-report.xml'));
      const result = parseReport(report);
      return {
        ...result,
        sha256: hash,
        durationMs: Math.round(performance.now() - start),
        reportHash: sha256(report),
      };
    } catch (error) {
      return failure(
        error instanceof Error && error.message.startsWith('VALIDATOR_')
          ? error.message
          : 'VALIDATOR_FAILED',
        'Die Prüfung konnte nicht abgeschlossen werden. Bitte versuchen Sie es erneut.',
      );
    } finally {
      this.active = false;
      if (directory) await rm(directory, { recursive: true, force: true });
    }
  }
}
export function localValidator() {
  const home = resolve(process.env.COMPLIANCE_HOME ?? '.local/compliance');
  return new KositValidator({
    home,
    java: process.env.JAVA_BIN ?? resolve(home, 'java-bin'),
  });
}
