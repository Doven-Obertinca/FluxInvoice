import type { Permission } from '@flux/auth';
export type Safety =
  | 'READ_ONLY'
  | 'REVERSIBLE'
  | 'EXTERNAL_COMMUNICATION'
  | 'FINANCIAL'
  | 'LEGAL_OR_TAX'
  | 'IRREVERSIBLE';
type Operation = {
  safety: Safety;
  permission: Permission;
  confirmation: boolean;
  automatic: boolean;
};
// Closed execution allowlist. Future external/tax/irreversible operations are denied
// by default; they must supply their own authorization architecture before inclusion.
export const FINANCIAL_OPERATIONS = {
  inspect: {
    safety: 'READ_ONLY',
    permission: 'read',
    confirmation: false,
    automatic: false,
  },
  respond: {
    safety: 'REVERSIBLE',
    permission: 'autopilot:respond',
    confirmation: false,
    automatic: false,
  },
  checklist: {
    safety: 'REVERSIBLE',
    permission: 'autopilot:respond',
    confirmation: false,
    automatic: true,
  },
  policy: {
    safety: 'REVERSIBLE',
    permission: 'autopilot:configure',
    confirmation: false,
    automatic: false,
  },
  terms: {
    safety: 'REVERSIBLE',
    permission: 'incoming:approve',
    confirmation: false,
    automatic: false,
  },
  duplicate: {
    safety: 'FINANCIAL',
    permission: 'incoming:approve',
    confirmation: true,
    automatic: false,
  },
  payment: {
    safety: 'FINANCIAL',
    permission: 'payment:record',
    confirmation: true,
    automatic: false,
  },
} as const satisfies Record<string, Operation>;
