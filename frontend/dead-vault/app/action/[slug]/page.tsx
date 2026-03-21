import Link from "next/link";

const pageContent: Record<string, { title: string; summary: string }> = {
  "manage-vault": {
    title: "Manage Vault",
    summary: "Review current holdings, schedule distributions, and control access policies.",
  },
  "withdraw-assets": {
    title: "Withdraw Assets",
    summary: "Choose destination wallets and execute a secure withdrawal workflow.",
  },
  "create-vault-item": {
    title: "Create Vault Item",
    summary: "Register a new asset, metadata note, or beneficiary instruction.",
  },
  "execute-permanence": {
    title: "Execute Permanence",
    summary: "Finalize smart contract execution and publish irreversible transfer rules.",
  },
  "voice-contract-input": {
    title: "Voice Contract Input",
    summary: "Capture voice instructions and convert them into a contract-ready prompt.",
  },
  "voice-legacy-input": {
    title: "Voice Legacy Input",
    summary: "Record legacy directives to prefill governance clauses.",
  },
  "change-wallet": {
    title: "Change Wallet",
    summary: "Switch connected wallet and verify ownership through signature challenge.",
  },
  "add-backup-email": {
    title: "Add Backup Email",
    summary: "Register a recovery email to receive alerts and account recovery links.",
  },
  "edit-account": {
    title: "Edit Account",
    summary: "Update profile identity fields and security profile metadata.",
  },
  "manage-identity": {
    title: "Manage Identity",
    summary: "Review biometric trust status, linked devices, and verification levels.",
  },
};

const staticSlugs = Object.keys(pageContent);

export function generateStaticParams() {
  return staticSlugs.map((slug) => ({ slug }));
}

export const dynamicParams = false;

function formatTitleFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default async function ActionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const content = pageContent[slug] ?? {
    title: formatTitleFromSlug(slug),
    summary: "This action page is ready for implementation with backend integration.",
  };

  return (
    <main className="dv-main dv-screen">
      <section className="dv-mobile-stack" style={{ maxWidth: "880px", margin: "0 auto" }}>
        <p className="dv-label">ACTION PAGE</p>
        <h1 className="dv-hero-title" style={{ maxWidth: "14ch" }}>{content.title}</h1>
        <div className="dv-profile-card">
          <p className="dv-subcopy" style={{ fontSize: "1.1rem" }}>{content.summary}</p>
        </div>
        <div className="dv-profile-card">
          <div className="dv-profile-row">
            <Link href="/" className="dv-btn-light" style={{ textAlign: "center", textDecoration: "none" }}>
              Back Home
            </Link>
            <Link href="/settings" className="dv-btn-primary" style={{ textAlign: "center", textDecoration: "none" }}>
              Open Settings
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
