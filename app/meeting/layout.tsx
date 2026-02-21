import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default async function MeetingLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }
  return <>{children}</>;
}
