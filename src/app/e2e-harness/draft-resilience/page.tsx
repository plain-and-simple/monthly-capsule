import { notFound } from "next/navigation";
import { DraftResilienceHarness } from "./harness";

export const dynamic = "force-dynamic";

export default function DraftResiliencePage() {
  if (process.env.E2E_HARNESS !== "1") {
    notFound();
  }
  return (
    <main className="main">
      <div className="wrap">
        <DraftResilienceHarness />
      </div>
    </main>
  );
}
