import { verifyMessage } from 'ethers'

export interface StoredBeneficiary { wallet: string; basisPoints: number; label: string }
export interface StoredSigner { address: string; label: string; signature: string | null; signedAt: number | null }
export interface StoredProposal {
  id: string; type: string; title: string; description: string
  beneficiaries: StoredBeneficiary[]; intervalDays: number
  createdAt: number; createdBy: string; signers: StoredSigner[]
  threshold: number; status: 'pending' | 'approved' | 'executed' | 'rejected'
}

const g = globalThis as typeof globalThis & { _proposals?: Map<string, StoredProposal> }
if (!g._proposals) g._proposals = new Map()
export function getStore() { return g._proposals! }

export function buildMessage(p: { type: string; title: string; beneficiaries: StoredBeneficiary[]; intervalDays: number; createdBy: string }): string {
  const list = p.beneficiaries.map(b => `  - ${b.label}: ${b.wallet} (${(b.basisPoints / 100).toFixed(1)}%)`).join('\n')
  return `DeadVault Proposal Approval\n\nAction: ${p.type}\nTitle: ${p.title}\nCheck-in interval: ${p.intervalDays} days\n\nBeneficiaries:\n${list}\n\nCreated by: ${p.createdBy}\n\nBy signing this message, I approve this proposal.`
}

export function recover(message: string, signature: string): string {
  return verifyMessage(message, signature)
}
