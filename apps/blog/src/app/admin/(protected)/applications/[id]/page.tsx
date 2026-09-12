import ApplicationDetailClient from "#/app/admin/(protected)/applications/[id]/_components/ApplicationDetailClient";

export default async function ApplicationDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return <ApplicationDetailClient applicationId={id} />;
}
