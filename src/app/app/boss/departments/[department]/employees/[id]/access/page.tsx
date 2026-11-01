import { notFound, redirect } from "next/navigation";

export default async function HrAccessPage({ params }: { params: Promise<{ department: string; id: string }> }) {
  const { department, id } = await params;
  if (department !== "hr") notFound();
  redirect(`/app/boss/departments/hr/employees/${encodeURIComponent(id)}?tab=access`);
}
