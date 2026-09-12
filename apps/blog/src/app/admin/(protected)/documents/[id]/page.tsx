import DocumentDetailClient from "#/app/admin/(protected)/documents/[id]/_components/DocumentDetailClient";

export default async function AdminDocumentDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return <DocumentDetailClient documentVersionId={id} />;
}
