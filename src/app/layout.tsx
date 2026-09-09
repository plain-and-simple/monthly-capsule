import type { Metadata } from "next";
import { Geist, Newsreader } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
});

export const metadata: Metadata = {
  title: "Capsule",
  description: "A monthly letter for friends.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geist.variable} ${newsreader.variable} font-sans antialiased`}>
        <div className="mx-auto flex min-h-screen max-w-xl flex-col px-5 py-8">
          <header className="mb-10">
            <Link href="/" className="font-serif text-xl tracking-tight">
              Capsule
            </Link>
          </header>
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
