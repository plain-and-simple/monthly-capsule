import type { Metadata } from "next";
import { Libre_Franklin, Newsreader } from "next/font/google";
import "./globals.css";

const franklin = Libre_Franklin({
  subsets: ["latin", "latin-ext"],
  variable: "--font-franklin",
});

const newsreader = Newsreader({
  subsets: ["latin", "latin-ext"],
  variable: "--font-newsreader",
});

export const metadata: Metadata = {
  title: {
    default: "Plain and Simple Monthly Capsule",
    template: "%s · Plain and Simple Monthly Capsule",
  },
  description: "Friends write once a month. You get one capsule.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${franklin.variable} ${newsreader.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
