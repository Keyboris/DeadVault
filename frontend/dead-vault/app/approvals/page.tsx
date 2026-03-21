"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { FaLock, FaCheck, FaClock, FaXmark, FaPen } from "react-icons/fa6";

type Signer = { address: string; label: string; signature: string | null; signedAt: number | null };
type Beneficiary = { wallet: string; basisPoints: number; label: string };
type Proposal = {
  id: string; type: string; title: string; description: string;
  beneficiaries: Beneficiary[]; intervalDays: number;
  createdAt: number; createdBy: string; signers: Signer[];
  threshold: number; status: "pending" | "approved" | "executed" | "rejected";
};

type EthProvider = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };

function getEth(): EthProvider | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { ethereum?: EthProvider }).ethereum;
}

function short(a: string) { return a.length > 10 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a; }

function buildMessage(p: { type: string; title: string; beneficiaries: Beneficiary[]; intervalDays: number; createdBy: string }): string {
  const list = p.beneficiaries.map(b => `  - ${b.label}: ${b.wallet} (${(b.basisPoints / 100).toFixed(1)}%)`).join("\n");
  return `DeadVault Proposal Approval\n\nAction: ${p.type}\nTitle: ${p.title}\nCheck-in interval: ${p.intervalDays} days\n\nBeneficiaries:\n${list}\n\nCreated by: ${p.createdBy}\n\nBy signing this message, I approve this proposal.`;
}

export default function ApprovalsPage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [wallet, setWallet] = useState<string | null>(null);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");

  const fetchProposals = useCallback(async () => {
    try {
      const res = await fetch("/api/proposals");
      if (res.ok) setProposals(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchProposals(); const i = setInterval(fetchProposals, 5000); return () => clearInterval(i); }, [fetchProposals]);

  useEffect(() => {
    const eth = getEth();
    if (!eth) return;
    eth.request({ method: "eth_accounts" }).then((accs) => {
      const a = (accs as string[])[0];
      if (a) setWallet(a.toLowerCase());
    }).catch(() => {});
  }, []);

  const connect = async () => {
    const eth = getEth();
    if (!eth) { setError("Install MetaMask or Coinbase Wallet"); return; }
    try {
      const accs = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      if (accs[0]) setWallet(accs[0].toLowerCase());
    } catch { setError("Wallet connection failed"); }
  };

  const sign = async (proposalId: string) => {
    if (!wallet) { setError("Connect wallet first"); return; }
    const eth = getEth();
    if (!eth) return;
    const proposal = proposals.find(p => p.id === proposalId);
    if (!proposal) return;

    setLoading(proposalId);
    setError("");
    try {
      const msg = buildMessage({ type: proposal.type, title: proposal.title, beneficiaries: proposal.beneficiaries, intervalDays: proposal.intervalDays, createdBy: proposal.createdBy });
      const sig = (await eth.request({ method: "personal_sign", params: [msg, wallet] })) as string;
      const res = await fetch(`/api/proposals/${proposalId}/sign`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signerAddress: wallet, signature: sig }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      await fetchProposals();
    } catch (e) { setError(e instanceof Error ? e.message : "Sign failed"); }
    finally { setLoading(""); }
  };

  const execute = async (proposalId: string) => {
    setLoading(proposalId);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/execute`, { method: "POST" });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      await fetchProposals();
    } catch (e) { setError(e instanceof Error ? e.message : "Execute failed"); }
    finally { setLoading(""); }
  };

  const reject = async (proposalId: string) => {
    try {
      await fetch(`/api/proposals/${proposalId}/reject`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signerAddress: wallet }),
      });
      await fetchProposals();
    } catch { /* ignore */ }
  };

  const pending = proposals.filter(p => p.status === "pending" || p.status === "approved");

  return (
    <div className="dv-root">
      <header className="dv-topbar">
        <div className="dv-brand-wrap">
          <FaLock className="dv-icon-inline dv-blue" />
          <span className="dv-brand">DeadVault</span>
        </div>
        <Link href="/" style={{ textDecoration: "none", color: "var(--outline)", fontSize: "0.85rem" }}>Back</Link>
      </header>

      <main className="dv-main dv-screen">
        <section className="dv-mobile-stack" style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p className="dv-label">MULTI-SIGNATURE</p>
              <h1 className="dv-hero-title" style={{ maxWidth: "14ch" }}>APPROVALS</h1>
            </div>
            {wallet ? (
              <div style={{ textAlign: "right" }}>
                <p style={{ fontSize: "0.7rem", color: "var(--outline)", letterSpacing: "0.1em" }}>CONNECTED</p>
                <p style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>{short(wallet)}</p>
              </div>
            ) : (
              <button type="button" className="dv-btn-primary" onClick={connect} style={{ padding: "0.7rem 1.2rem", fontSize: "0.8rem" }}>
                Connect wallet
              </button>
            )}
          </div>

          <p className="dv-subcopy">
            Sensitive vault changes require 2 of 3 keyholders to sign with their own wallet. Signatures are verified cryptographically.
          </p>

          {error && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "1rem", padding: "1rem", color: "#991b1b", fontSize: "0.85rem" }}>
              {error}
              <button type="button" onClick={() => setError("")} style={{ float: "right", border: 0, background: "transparent", cursor: "pointer", color: "#991b1b" }}>
                <FaXmark />
              </button>
            </div>
          )}

          {pending.length > 0 && (
            <div style={{ background: "var(--secondary-container)", color: "#fff", borderRadius: "1.5rem", padding: "1rem 1.5rem", fontSize: "0.85rem", fontWeight: 700, letterSpacing: "0.05em" }}>
              {pending.length} proposal{pending.length > 1 ? "s" : ""} awaiting action
            </div>
          )}

          {proposals.length === 0 ? (
            <div className="dv-profile-card" style={{ textAlign: "center", padding: "3rem" }}>
              <p style={{ color: "var(--outline)", fontSize: "1rem" }}>No proposals yet</p>
              <p style={{ color: "var(--text-soft)", fontSize: "0.85rem", marginTop: "0.5rem" }}>
                Create a vault from the home page to start
              </p>
            </div>
          ) : (
            proposals.map(proposal => {
              const signedCount = proposal.signers.filter(s => s.signature).length;
              const isSigner = wallet ? proposal.signers.some(s => s.address === wallet) : false;
              const hasSigned = wallet ? proposal.signers.some(s => s.address === wallet && s.signature) : false;
              const isLoading = loading === proposal.id;

              const statusStyle: Record<string, { bg: string; color: string }> = {
                pending: { bg: "#fef3c7", color: "#92400e" },
                approved: { bg: "#d1fae5", color: "#065f46" },
                executed: { bg: "#dbeafe", color: "#1e40af" },
                rejected: { bg: "#fee2e2", color: "#991b1b" },
              };
              const st = statusStyle[proposal.status] || statusStyle.pending;

              return (
                <div key={proposal.id} className="dv-profile-card" style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
                  {/* Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "1.15rem", fontWeight: 700 }}>{proposal.title}</h3>
                      <p style={{ fontSize: "0.75rem", color: "var(--outline)", marginTop: "0.25rem" }}>
                        {new Date(proposal.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <span style={{ background: st.bg, color: st.color, padding: "0.3rem 0.8rem", borderRadius: 999, fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      {proposal.status}
                    </span>
                  </div>

                  {proposal.description && <p style={{ color: "var(--text-soft)", fontSize: "0.9rem", lineHeight: 1.4 }}>{proposal.description}</p>}

                  {/* Beneficiaries */}
                  <div style={{ background: "var(--surface-low)", borderRadius: "1rem", padding: "1rem" }}>
                    <p style={{ fontSize: "0.65rem", letterSpacing: "0.15em", color: "var(--outline)", fontWeight: 700, textTransform: "uppercase", marginBottom: "0.6rem" }}>Beneficiaries</p>
                    {proposal.beneficiaries.map((b, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "0.25rem 0" }}>
                        <span style={{ fontSize: "0.85rem" }}>{b.label}</span>
                        <span style={{ color: "var(--secondary-container)", fontWeight: 700, fontSize: "0.85rem" }}>{(b.basisPoints / 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>

                  {/* Signers */}
                  <div style={{ background: "var(--surface-low)", borderRadius: "1rem", padding: "1rem" }}>
                    <p style={{ fontSize: "0.65rem", letterSpacing: "0.15em", color: "var(--outline)", fontWeight: 700, textTransform: "uppercase", marginBottom: "0.6rem" }}>
                      Signatures: {signedCount} of {proposal.threshold} required
                    </p>
                    {proposal.signers.map((signer, i) => {
                      const isMe = wallet === signer.address;
                      return (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 0", borderTop: i > 0 ? "1px solid var(--surface-high)" : "none" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: signer.signature ? "#16a34a" : "#d4d4d8" }} />
                            <div>
                              <p style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                                {signer.label} {isMe && <span style={{ color: "var(--secondary-container)" }}>(you)</span>}
                              </p>
                              <p style={{ fontFamily: "monospace", fontSize: "0.72rem", color: "var(--outline)" }}>{short(signer.address)}</p>
                            </div>
                          </div>
                          {signer.signature ? (
                            <span style={{ display: "flex", alignItems: "center", gap: 4, color: "#16a34a", fontSize: "0.75rem", fontWeight: 700 }}>
                              <FaCheck /> Signed
                            </span>
                          ) : proposal.status === "pending" && isMe ? (
                            <button type="button" className="dv-btn-primary" onClick={() => sign(proposal.id)} disabled={isLoading}
                              style={{ padding: "0.5rem 1rem", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: 4 }}>
                              {isLoading ? <FaClock /> : <FaPen />} Sign
                            </button>
                          ) : (
                            <span style={{ fontSize: "0.72rem", color: "var(--outline)" }}>
                              <FaClock style={{ marginRight: 4 }} /> Awaiting
                            </span>
                          )}
                        </div>
                      );
                    })}

                    {proposal.status === "pending" && wallet && !isSigner && (
                      <p style={{ marginTop: "0.8rem", fontSize: "0.8rem", color: "#92400e", background: "#fef3c7", padding: "0.6rem", borderRadius: "0.5rem" }}>
                        Your wallet ({short(wallet)}) is not a keyholder. Switch wallet in MetaMask.
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  {proposal.status === "approved" && (
                    <button type="button" onClick={() => execute(proposal.id)} disabled={isLoading}
                      style={{ border: 0, borderRadius: 999, padding: "1rem", background: "#16a34a", color: "#fff", fontWeight: 700, fontSize: "0.9rem", cursor: "pointer", letterSpacing: "0.05em" }}>
                      {isLoading ? "Executing..." : `Execute — ${signedCount}/${proposal.threshold} signatures collected`}
                    </button>
                  )}

                  {proposal.status === "pending" && wallet === proposal.createdBy && (
                    <button type="button" onClick={() => reject(proposal.id)}
                      style={{ border: "1px solid #fecaca", borderRadius: 999, padding: "0.6rem", background: "transparent", color: "#991b1b", fontSize: "0.75rem", cursor: "pointer" }}>
                      Reject proposal
                    </button>
                  )}

                  {proposal.status === "executed" && (
                    <div style={{ background: "#d1fae5", borderRadius: "1rem", padding: "0.8rem 1rem", color: "#065f46", fontSize: "0.85rem" }}>
                      <FaCheck style={{ marginRight: 6 }} /> Vault deployed on-chain.
                    </div>
                  )}
                </div>
              );
            })
          )}
        </section>
      </main>
    </div>
  );
}
