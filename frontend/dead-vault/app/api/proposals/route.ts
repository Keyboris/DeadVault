import { NextResponse } from 'next/server'
import { getStore, buildMessage, recover, type StoredSigner } from './helpers'

export async function GET() {
  const proposals = Array.from(getStore().values()).sort((a, b) => b.createdAt - a.createdAt)
  return NextResponse.json(proposals)
}

export async function POST(req: Request) {
  const body = await req.json()
  const { type, title, description, beneficiaries, intervalDays, createdBy, signers, threshold, signature } = body

  if (!type || !title || !beneficiaries || !createdBy || !signers || !signature)
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const msg = buildMessage({ type, title, beneficiaries, intervalDays, createdBy })
  let recovered: string
  try { recovered = recover(msg, signature) } catch { return NextResponse.json({ error: 'Invalid signature' }, { status: 400 }) }

  if (recovered.toLowerCase() !== createdBy.toLowerCase())
    return NextResponse.json({ error: `Signature mismatch: expected ${createdBy}, got ${recovered}` }, { status: 403 })

  const id = `prop-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const proposal = {
    id, type, title, description: description || '', beneficiaries, intervalDays: intervalDays || 90,
    createdAt: Date.now(), createdBy: createdBy.toLowerCase(), threshold,
    signers: signers.map((s: StoredSigner) => ({
      address: s.address.toLowerCase(), label: s.label || s.address.slice(0, 10),
      signature: s.address.toLowerCase() === createdBy.toLowerCase() ? signature : null,
      signedAt: s.address.toLowerCase() === createdBy.toLowerCase() ? Date.now() : null,
    })),
    status: 'pending' as const,
  }

  getStore().set(id, proposal)
  return NextResponse.json(proposal, { status: 201 })
}
