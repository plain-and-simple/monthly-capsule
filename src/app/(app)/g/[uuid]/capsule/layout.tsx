import { Cormorant_Garamond, Fraunces } from "next/font/google";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-cormorant",
});

export default function CapsuleLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${fraunces.variable} ${cormorant.variable}`}>{children}</div>;
}
