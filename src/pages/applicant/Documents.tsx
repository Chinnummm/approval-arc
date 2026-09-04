import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { PageHeader, Section, StatusBadge, EmptyState, Loading, Notice } from "@/components/app/ui";
import { DocumentUploader, ExtractionReview, DocumentChecks, IssuerCheck, readErrorMessage, DocRow } from "@/components/app/docs";
import { verificationMeta, extractionMeta, docStatusMeta, fmtDate, fmtDateTime } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Download, FileText, Hash, Loader2, ShieldCheck, Eye, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { DOCUMENT_TYPES } from "@/convex/lib/config";

export default function DocumentsPage() {
  const { user } = useAuth();
  const docs = useQuery(api.documents.myDocuments);
  const logAccess = useMutation(api.documents.logDocumentAccess);
  const revokeDoc = useMutation(api.documents.revokeDocument);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  if (docs === undefined) return <Loading />;

  const selectedDoc = docs.find((d) => d._id === selectedDocId) as (DocRow & {
    applicationId?: string;
    extractedFields?: { key: string; label: string; value?: string; source: string }[];
    validationChecks?: { check: string; status: string; detail: string }[];
    fieldsConfirmed: boolean;
    organizationId?: string;
  }) | undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Document vault"
        description="Upload, extract, validate and verify documents deterministically. No AI is used in this pipeline."
      >
        <Notice tone="muted" title="Prototype Verification Gateway — Simulation">
          Issuer registry lookups are simulated. Real integrations can be connected behind this layer.
        </Notice>
      </PageHeader>

      <Section title="Upload document" description="Supported: PDF, PNG, JPG, JPEG · max 15 MB.">
        <div className="p-4">
          <DocumentUploader
            organizationId={user?.organizationId as never}
            businessName="GreenHarvest Foods Pvt. Ltd."
            address="Plot 21, MIDC Bhosari, Pune"
            onUploaded={() => setRefreshKey((k) => k + 1)}
          />
        </div>
      </Section>

      <div className="grid items-start gap-6 xl:grid-cols-[1fr_420px]">
        <Section title="All documents" description={`${docs.length} document${docs.length !== 1 ? "s" : ""} in your vault.`}>
          {docs.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No documents yet" description="Upload your first document to start the validation pipeline." />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {docs.map((d) => {
                const selected = d._id === selectedDocId;
                return (
                  <li key={d._id}>
                    <button
                      onClick={() => setSelectedDocId(selected ? null : d._id)}
                      className={cn(
                        "flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors",
                        selected ? "bg-muted/40" : "hover:bg-muted/20",
                      )}
                    >
                      <div className="flex min-w-0 items-start gap-2.5">
                        <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium">{d.fileName}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {(d.documentType && DOCUMENT_TYPES[d.documentType]) || d.documentType || "Unclassified"} · {fmtDateTime(d._creationTime)} · {(d.size / 1024).toFixed(0)} KB
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                            <StatusBadge meta={extractionMeta[d.extractionStatus]} dot={false} />
                            <span className={d.fieldsConfirmed ? "text-emerald-700" : "text-amber-700"}>
                              {d.fieldsConfirmed ? "fields confirmed" : "confirmation pending"}
                            </span>
                            <StatusBadge meta={docStatusMeta[d.validationStatus]} dot={false} />
                            <StatusBadge meta={verificationMeta[d.verificationStatus]} dot={false} />
                          </div>
                        </div>
                      </div>
                      <span className="flex shrink-0 items-center gap-1.5 font-mono text-[10px] text-muted-foreground/60" title="SHA-256">
                        <Hash className="size-3" /> {d.sha256.slice(0, 12)}…
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <div className="space-y-4">
          {!selectedDoc ? (
            <Section title="Document details">
              <div className="p-4">
                <EmptyState title="Select a document" description="Click a document in the list to see its pipeline status, extracted fields and verification results." />
              </div>
            </Section>
          ) : (
            <>
              <Section title={selectedDoc.fileName} actions={
                <div className="flex gap-1.5">
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={async () => {
                    await logAccess({ documentId: selectedDoc._id as never });
                    toast.info("Access logged to the audit trail.");
                  }}>
                    <Eye className="mr-1 size-3" /> View
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={async () => {
                    await logAccess({ documentId: selectedDoc._id as never });
                    toast.info("Download initiated — access logged to the audit trail.");
                  }}>
                    <Download className="mr-1 size-3" /> Download
                  </Button>
                  {selectedDoc.status === "ACTIVE" && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-red-600" onClick={async () => {
                      if (!window.confirm("Revoke this document?")) return;
                      await revokeDoc({ documentId: selectedDoc._id as never, reason: "Revoked by owner" });
                      toast.success("Document revoked.");
                      setSelectedDocId(null);
                    }}>
                      <Trash2 className="mr-1 size-3" /> Revoke
                    </Button>
                  )}
                </div>
              }>
                <div className="space-y-3 p-4">
                  <div className="flex items-center gap-2">
                    <StatusBadge meta={extractionMeta[selectedDoc.extractionStatus]} />
                    <StatusBadge meta={docStatusMeta[selectedDoc.validationStatus]} />
                    <StatusBadge meta={verificationMeta[selectedDoc.verificationStatus]} />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {selectedDoc.documentType && DOCUMENT_TYPES[selectedDoc.documentType]} · SHA-256: <span className="font-mono text-[10px]">{selectedDoc.sha256}</span>
                  </p>
                </div>
              </Section>

              {selectedDoc.extractionStatus === "EXTRACTED" && !selectedDoc.fieldsConfirmed && selectedDoc.extractedFields && (
                <Section title="Extracted fields — confirm or correct">
                  <div className="p-4">
                    <ExtractionReview
                      document={{
                        _id: selectedDoc._id,
                        fileName: selectedDoc.fileName,
                        extractedFields: selectedDoc.extractedFields,
                        extractionStatus: selectedDoc.extractionStatus,
                        fieldsConfirmed: selectedDoc.fieldsConfirmed,
                      }}
                      onDone={() => {
                        setRefreshKey((k) => k + 1);
                        toast.success("Fields confirmed — validation and verification checks ran.");
                      }}
                    />
                  </div>
                </Section>
              )}

              {selectedDoc.validationChecks && selectedDoc.validationChecks.length > 0 && (
                <Section title="Validation checks">
                  <div className="p-4">
                    <DocumentChecks checks={selectedDoc.validationChecks} />
                  </div>
                </Section>
              )}

              <Section title="Issuer verification" description="Prototype Verification Gateway — Simulation">
                <div className="flex items-center gap-2 p-4">
                  <IssuerCheck
                    document={{ ...selectedDoc, fieldsConfirmed: selectedDoc.fieldsConfirmed } as any}
                    onRun={() => setRefreshKey((k) => k + 1)}
                  />
                  {selectedDoc.verificationDetail && (
                    <p className="text-xs text-muted-foreground">{selectedDoc.verificationDetail}</p>
                  )}
                </div>
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
