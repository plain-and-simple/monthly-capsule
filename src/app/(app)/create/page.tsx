import { CreateForm } from "@/components/create-form";
import { getAccount } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function CreatePage() {
  const account = await getAccount();
  return <CreateForm signedInAs={account?.preferred_name ?? null} />;
}
