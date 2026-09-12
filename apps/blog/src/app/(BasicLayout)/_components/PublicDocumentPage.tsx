import type { DocumentType } from "@workspace/contracts";

import PublicDocumentViewer from "#/app/(BasicLayout)/_components/PublicDocumentViewer";

interface PublicDocumentPageProps {
  description: string;
  documentType: DocumentType;
  title: string;
}

export default function PublicDocumentPage({
  description,
  documentType,
  title,
}: PublicDocumentPageProps) {
  return (
    <section className="mx-auto my-8 max-w-7xl px-4 xl:px-0">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="text-muted-foreground mt-3 max-w-2xl">{description}</p>
      </div>
      <PublicDocumentViewer documentType={documentType} title={title} />
    </section>
  );
}
