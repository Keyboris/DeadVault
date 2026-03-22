import { NextResponse } from "next/server"
import { Resend } from "resend"
import { getAddress, isAddress, createPublicClient, http } from "viem"
import { mainnet } from "viem/chains"

type WillNotificationRequest = {
  walletAddress: string | null
  fallbackEmail?: string | null
  action: "created" | "updated"
  templateType: string
  contractAddress: string
  deploymentTxHash: string
  beneficiariesCount: number
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isValidEmail(value: unknown): value is string {
  return typeof value === "string" && EMAIL_REGEX.test(value.trim())
}

async function resolveEnsEmail(walletAddress: string | null): Promise<string | null> {
  if (!walletAddress || !isAddress(walletAddress)) {
    return null
  }

  const client = createPublicClient({
    chain: mainnet,
    transport: http(process.env.ENS_RPC_URL || "https://ethereum-rpc.publicnode.com"),
  })

  try {
    const normalizedAddress = getAddress(walletAddress)
    const ensName = await client.getEnsName({ address: normalizedAddress })
    if (!ensName) {
      return null
    }

    const textEmail = await client.getEnsText({
      name: ensName,
      key: "email",
    })

    return isValidEmail(textEmail) ? textEmail.trim() : null
  } catch {
    return null
  }
}

function buildSubject(action: "created" | "updated"): string {
  return action === "updated" ? "Your DeadVault will was updated" : "Your DeadVault will was created"
}

function buildHtml(payload: WillNotificationRequest): string {
  return `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
      <h2 style="margin: 0 0 12px;">DeadVault Notification</h2>
      <p style="margin: 0 0 12px;">Your will has been <strong>${payload.action}</strong> successfully.</p>
      <ul style="padding-left: 18px; margin: 0 0 12px;">
        <li>Template: ${payload.templateType}</li>
        <li>Beneficiaries: ${payload.beneficiariesCount}</li>
        <li>Contract: ${payload.contractAddress}</li>
        <li>Deployment Tx: ${payload.deploymentTxHash}</li>
      </ul>
      <p style="margin: 0; color: #4b5563; font-size: 13px;">If you did not perform this action, contact support immediately.</p>
    </div>
  `
}

export async function POST(req: Request) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL || "DeadVault <onboarding@resend.dev>"

  if (!apiKey) {
    return NextResponse.json(
      {
        status: "failed",
        message: "RESEND_API_KEY is not configured.",
        recipientEmail: null,
      },
      { status: 500 },
    )
  }

  let payload: WillNotificationRequest
  try {
    payload = (await req.json()) as WillNotificationRequest
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  if (payload.action !== "created" && payload.action !== "updated") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  }

  if (!payload.contractAddress || !payload.deploymentTxHash || !payload.templateType) {
    return NextResponse.json({ error: "Missing required notification fields" }, { status: 400 })
  }

  const ensEmail = await resolveEnsEmail(payload.walletAddress)
  const fallbackEmail = isValidEmail(payload.fallbackEmail) ? payload.fallbackEmail.trim() : null
  const recipient = ensEmail ?? fallbackEmail

  if (!recipient) {
    return NextResponse.json({
      status: "skipped",
      message: "No email found for connected wallet owner. Add a backup email to receive notifications.",
      recipientEmail: null,
    })
  }

  const resend = new Resend(apiKey)

  try {
    await resend.emails.send({
      from,
      to: recipient,
      subject: buildSubject(payload.action),
      html: buildHtml(payload),
      text:
        `Your will was ${payload.action}. ` +
        `Template: ${payload.templateType}. ` +
        `Beneficiaries: ${payload.beneficiariesCount}. ` +
        `Contract: ${payload.contractAddress}. ` +
        `Deployment Tx: ${payload.deploymentTxHash}`,
    })

    return NextResponse.json({
      status: "sent",
      message: `Notification sent to ${recipient}`,
      recipientEmail: recipient,
    })
  } catch {
    return NextResponse.json(
      {
        status: "failed",
        message: "Will was saved, but email notification failed.",
        recipientEmail: recipient,
      },
      { status: 502 },
    )
  }
}
