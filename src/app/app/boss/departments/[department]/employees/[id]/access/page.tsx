import { notFound, redirect } from "next/navigation";

export default async function HrAccessPage({ params }: { params: Promise<{ department: string; id: string }> }) {
  const { department } = await params;
  if (department !== "hr") notFound();
  redirect("/app/boss/departments/hr?view=people");
}
