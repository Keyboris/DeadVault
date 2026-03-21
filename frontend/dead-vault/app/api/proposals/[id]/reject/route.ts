import { NextResponse } from 'next/server'
import { getStore } from '../../helpers'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { signerAddress } = await req.json()
  const store = getStore()
  const proposal = store.get(id)
  if (!proposal) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (proposal.status !== 'pending') return NextResponse.json({ error: `Proposal is ${proposal.status}` }, { status: 400 })
  const ok = proposal.createdBy === signerAddress?.toLowerCase() || proposal.signers.some(s => s.address === signerAddress?.toLowerCase())
  if (!ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  proposal.status = 'rejected'
  store.set(id, proposal)
  return NextResponse.json(proposal)
}
