import { NextResponse } from 'next/server'
import { getStore, buildMessage, recover } from '../../helpers'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { signerAddress, signature } = await req.json()
  if (!signerAddress || !signature) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const store = getStore()
  const proposal = store.get(id)
  if (!proposal) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (proposal.status !== 'pending') return NextResponse.json({ error: `Proposal is ${proposal.status}` }, { status: 400 })

  const idx = proposal.signers.findIndex(s => s.address === signerAddress.toLowerCase())
  if (idx === -1) return NextResponse.json({ error: 'Not an authorized signer' }, { status: 403 })
  if (proposal.signers[idx].signature) return NextResponse.json({ error: 'Already signed' }, { status: 400 })

  const msg = buildMessage({ type: proposal.type, title: proposal.title, beneficiaries: proposal.beneficiaries, intervalDays: proposal.intervalDays, createdBy: proposal.createdBy })
  let recovered: string
  try { recovered = recover(msg, signature) } catch { return NextResponse.json({ error: 'Invalid signature' }, { status: 400 }) }
  if (recovered.toLowerCase() !== signerAddress.toLowerCase())
    return NextResponse.json({ error: `Signature mismatch: expected ${signerAddress}, got ${recovered}` }, { status: 403 })

  proposal.signers[idx].signature = signature
  proposal.signers[idx].signedAt = Date.now()
  if (proposal.signers.filter(s => s.signature).length >= proposal.threshold) proposal.status = 'approved'
  store.set(id, proposal)
  return NextResponse.json(proposal)
}
