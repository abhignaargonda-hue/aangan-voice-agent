import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Aangan Calls",
  description: "Aangan Studio voice agent: call log, designer handoffs and running costs.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="top">
          <div className="in">
            <div className="brand">Aangan Studio <span>· Calls</span></div>
            <nav>
              <Link href="/">Dashboard</Link>
              <Link href="/simulate">Test a call</Link>
              <Link href="/setup">Setup</Link>
            </nav>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
