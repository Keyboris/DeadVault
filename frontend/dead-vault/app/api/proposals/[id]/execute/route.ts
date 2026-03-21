import { NextResponse } from 'next/server'
import { getStore } from '../../helpers'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const store = getStore()
  const proposal = store.get(id)
  if (!proposal) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (proposal.status !== 'approved') return NextResponse.json({ error: `Must be approved, is ${proposal.status}` }, { status: 400 })
  proposal.status = 'executed'
  store.set(id, proposal)
  return NextResponse.json({ proposal, message: 'Executed. In production this deploys the vault on-chain.' })
}
