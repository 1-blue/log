import AnalysisWorkspaceClient from "#/app/admin/(protected)/applications/[id]/analyses/[analysisJobId]/_components/AnalysisWorkspace/AnalysisWorkspaceClient";

export default async function AnalysisWorkspacePage({
  params,
}: Readonly<{
  params: Promise<{ analysisJobId: string; id: string }>;
}>) {
  const { analysisJobId, id } = await params;
  return (
    <AnalysisWorkspaceClient analysisJobId={analysisJobId} applicationId={id} />
  );
}
