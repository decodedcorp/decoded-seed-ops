import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "decoded-seed-ops",
  description: "Seed operations dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main>
          <nav className="row" style={{ marginBottom: 20 }}>
            <Link href="/candidates">Candidates</Link>
          </nav>
          {children}
        </main>
      </body>
    </html>
  );
}
