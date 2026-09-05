import { cookies } from "next/headers";

export async function getUserKey(): Promise<string> {
  const store = await cookies();
  return store.get("nama_uid")?.value ?? "guest";
}
