import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Web3Provider } from "./components/Web3Provider";
import Script from "next/script";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DeadVault | The Existential Ledger",
  description: "DeadVault legacy ledger dashboard, profile controls, and system events",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <Script id="crypto-polyfill" strategy="beforeInteractive">
          {`
            if (typeof window !== 'undefined' && window.crypto && !window.crypto.randomUUID) {
              window.crypto.randomUUID = function() {
                return ([1e7]+-1e3+-4e3+-8e3+-11e11).replace(/[018]/g, c =>
                  (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
                );
              };
            }
          `}
        </Script>
        <Web3Provider>{children}</Web3Provider>
      </body>
    </html>
  );
}
