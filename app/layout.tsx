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
          <nav className="navbar">
            <Link href="/candidates" className="navbar-link">
              Post 대표 이미지 선택
            </Link>
            <Link href="/post-images" className="navbar-link">
              Public posts 중복 점검
            </Link>
            <Link href="/post-spots" className="navbar-link">
              Spots / Solutions
            </Link>
            <Link href="/review" className="navbar-link">
              Instagram Account 검증
            </Link>
            <Link href="/brands" className="navbar-link">
              Brands
            </Link>
            <Link href="/artists" className="navbar-link">
              Artists
            </Link>
            <Link href="/group-members" className="navbar-link">
              Group Members
            </Link>
          </nav>
          {children}
        </main>
      </body>
    </html>
  );
}
