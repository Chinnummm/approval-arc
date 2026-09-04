import { ChangeEvent, ReactNode, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { DOCUMENT_TYPES } from "@/convex/lib/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { extractPdfText, sha256Hex, generateSamplePdf } from "@/lib/pdf";
import { extractStructuredFields, fieldLabel } from "@/lib/fields";
import { normalize } from "@/convex/lib/config";
import { EmptyState, Section, StatusBadge } from "./ui";
import { docStatusMeta, extractionMeta, verificationMeta, fmtDate, fmtDateTime } from "@/lib/format";
import {
  Download,
  FileUp,
  Hash,
  Loader2,
  RefreshCcw,
  ShieldCheck,
  Trash2,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ACCEPT = ".pdf,.png,.jpg,.jpeg";

export type UploadOutcome = {
  documentId: Id<"documents">;
  extractionStatus: string;
  fieldCount: number;
};

// The mutation references are deliberately widened (via unknown) so the
// shared pipeline stays decoupled from Convex's generated arg types.
type UploadFn = (args: Record<string, unknown>) => Promise<unknown>;

export const asUploadFn = <T,>(fn: T): UploadFn => fn as unknown as UploadFn;

async function uploadFile(opts: {
  file: File;
  documentType: string;
  organizationId: Id<"organizations">;
  applicationId?: Id<"applications">;
  businessName?: string;
  address?: string;
  generateUploadUrl: (args: Record<string, unknown>) => Promise<string>;
  recordDocument: UploadFn;
}): Promise<UploadOutcome> {
  const { file, documentType, organizationId, applicationId, businessName, address } = opts;
  // client-side file checks (server re-validates)
  if (file.size > 15 * 1024 * 1024) throw new Error("File is larger than the 15 MB limit.");
  const mime = file.type.toLowerCase() || inferMime(file.name);
  if (!["application/pdf", "image/png", "image/jpeg"].includes(mime))
    throw new Error("Unsupported file type. Accepted: PDF, PNG, JPG, JPEG.");

  const buf = await file.arrayBuffer();
  const sha256 = await sha256Hex(buf);

  let extractionStatus = "PENDING";
  let text: string | null = null;
  if (mime === "application/pdf") {
    text = await extractPdfText(buf);
    extractionStatus = text ? "EXTRACTED" : "EXTRACTION_FAILED";
  } else {
    extractionStatus = "NO_OCR"; // no OCR engine configured — honest state
  }
  const fields =
    text && text.trim().length > 0
      ? extractStructuredFields(text, { businessName, address })
      : [];

  const uploadUrl = (await opts.generateUploadUrl({})) as string;
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mime },
    body: file,
  });
  if (!putRes.ok) throw new Error("Upload failed. Please try again.");
  const { storageId } = (await putRes.json()) as { storageId: string };

  const res = (await opts.recordDocument({
    applicationId,
    organizationId,
    fileName: file.name,
    mimeType: mime,
    size: file.size,
    storageId,
    sha256,
    extractionStatus,
    extractedText: text ?? undefined,
    extractedFields: fields,
    documentType,
  } as Record<string, unknown>)) as { documentId: string };

  return { documentId: res.documentId as Id<"documents">, extractionStatus, fieldCount: fields.length };
}

function inferMime(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  return "application/octet-stream";
}

export function readErrorMessage(e: unknown): string {
  const err = e as { message?: string; data?: { message?: string } };
  if (err?.data?.message) return err.data.message;
  return err?.message ?? "Something went wrong. Please try again.";
}

export function DocumentUploader({
  organizationId,
  applicationId,
  defaultType,
  businessName,
  address,
  onUploaded,
  types,
}: {
  organizationId?: Id<"organizations">;
  applicationId?: Id<"applications">;
  defaultType?: string;
  businessName?: string;
  address?: string;
  onUploaded?: (outcome: UploadOutcome) => void;
  types?: string[];
}) {
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const recordDocument = useMutation(api.documents.recordDocument);
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState(defaultType ?? "");
  const [stage, setStage] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    if (!organizationId) {
      toast.error("Complete your business profile before uploading documents.");
      return;
    }
    if (!type) {
      toast.error("Select a document type first.");
      return;
    }
    setBusy(true);
    setStage("Hashing + extracting…");
    try {
      const outcome = await uploadFile({
        file,
        documentType: type,
        organizationId,
        applicationId,
        businessName,
        address,
        generateUploadUrl: generateUploadUrl as unknown as (a: Record<string, unknown>) => Promise<string>,
        recordDocument: asUploadFn(recordDocument),
      });
      toast.success("Document uploaded and recorded.");
      onUploaded?.(outcome);
    } catch (e) {
      toast.error(readErrorMessage(e));
    } finally {
      setBusy(false);
      setStage(null);
    }
  };

  const typeOptions = types ?? Object.keys(DOCUMENT_TYPES);
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <div>
          <Label htmlFor="doc-type" className="mb-1 block text-xs text-muted-foreground">
            Document type
          </Label>
          <select
            id="doc-type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-2.5 text-[13px] outline-none focus:border-neutral-400"
          >
            <option value="">Select type…</option>
            {typeOptions.map((t) => (
              <option key={t} value={t}>
                {DOCUMENT_TYPES[t] ?? t}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <Button
            variant="outline"
            type="button"
            disabled={busy}
            onClick={() => {
              const f = document.createElement("input");
              f.type = "file";
              f.accept = ACCEPT;
              f.onchange = () => {
                const file = f.files?.[0];
                if (file) void handleFile(file);
              };
              f.click();
            }}
          >
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileUp className="mr-2 size-4" />}
            {busy ? (stage ?? "Uploading…") : "Upload document"}
          </Button>
        </div>
      </div>
      <p className="text-[11px] leading-4 text-muted-foreground">
        Accepted formats: PDF, PNG, JPG, JPEG · max 15 MB. Uploads are hashed (SHA-256), checked for duplicates,
        and digitally extracted when possible — no AI is used in this pipeline.
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          type="button"
          size="sm"
          className="h-7 text-xs text-muted-foreground"
          disabled={busy}
          onClick={async () => {
            // Generate a clearly-labelled sample digital PDF so the full
            // pipeline (hash → extraction → fields → confirm) can be demoed.
            const blob = generateSamplePdf({
              heading: "Consent to Establish — ACKNOWLEDGEMENT",
              documentNumber: `CTE-${new Date().getFullYear()}-DEMO-${String(Math.floor(Math.random() * 9000) + 1000)}`,
              businessName: businessName ?? "GreenHarvest Foods Pvt. Ltd.",
              address: address ?? "Plot 21, MIDC Bhosari, Pune",
              authority: "Maharashtra Pollution Control Board",
              issueDate: new Date().toISOString().slice(0, 10),
              body: [
                "This is a sample acknowledgement document for demonstration.",
                `Business Name: ${businessName ?? "GreenHarvest Foods Pvt. Ltd."}`,
                "Reference No: (see above)",
              ],
            });
            const file = new File([blob], "sample-consent-acknowledgement.pdf", { type: "application/pdf" });
            await handleFile(file);
          }}
        >
          <FileText className="mr-1.5 size-3.5" />
          Generate sample PDF (demo)
        </Button>
      </div>
    </div>
  );
}

export function ExtractionReview({
  document,
  onDone,
}: {
  document: {
    _id: Id<"documents">;
    fileName: string;
    extractedFields: { key: string; label: string; value?: string; source: string }[];
    extractionStatus: string;
    fieldsConfirmed: boolean;
    extractedText?: string;
  };
  onDone?: () => void;
}) {
  const confirmFields = useMutation(api.documents.confirmDocumentFields);
  const [fields, setFields] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of document.extractedFields) if (f.value) init[f.key] = f.value;
    return init;
  });
  const [busy, setBusy] = useState(false);

  const known = Array.from(new Set([...document.extractedFields.map((f) => f.key), "businessName", "documentNumber", "issueDate", "expiryDate", "authority", "certificateType", "registrationNumber"]));
  const rows = known.map((k) => ({
    key: k,
    value: fields[k] ?? document.extractedFields.find((f) => f.key === k)?.value ?? "",
  }));

  const submit = async (corrections: Record<string, string>) => {
    setBusy(true);
    try {
      await confirmFields({
        documentId: document._id,
        fields: rows
          .filter((r) => corrections[r.key] !== undefined)
          .map((r) => ({ key: r.key, label: fieldLabel(r.key), value: corrections[r.key] || undefined })),
      });
      toast.success("Fields confirmed — validation and verification checks ran.");
      onDone?.();
    } catch (e) {
      toast.error(readErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium">{document.fileName}</p>
        <StatusBadge meta={extractionMeta[document.extractionStatus] ?? extractionMeta.PENDING} />
      </div>
      <NoticeInline text="Never silently accept extracted information — review and confirm every field below." />
      <div className="grid gap-2.5 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.key} className="space-y-1">
            <Label htmlFor={`f-${r.key}`} className="text-[11px] text-muted-foreground">
              {fieldLabel(r.key)}
            </Label>
            <Input
              id={`f-${r.key}`}
              value={r.value}
              onChange={(e) => setFields((p) => ({ ...p, [r.key]: e.target.value }))}
              className="h-8 text-[13px]"
            />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Button disabled={busy} onClick={() => submit(fields)}>
          {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
          Confirm & validate
        </Button>
      </div>
    </div>
  );
}

function NoticeInline({ text }: { text: string }) {
  return (
    <p className="rounded-sm border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] leading-4 text-amber-800">
      {text}
    </p>
  );
}

export type DocRow = {
  _id: Id<"documents">;
  fileName: string;
  documentType?: string;
  mimeType: string;
  size: number;
  sha256: string;
  extractionStatus: string;
  fieldsConfirmed: boolean;
  validationStatus: string;
  verificationStatus: string;
  verificationDetail?: string;
  status: string;
  _creationTime: number;
};

export function DocumentTable({ docs }: { docs: DocRow[] }) {
  const getUrl = useQuery;
  void getUrl;
  return (
    <div className="space-y-2">
      {docs.length === 0 && <EmptyState title="No documents yet" description="Upload your first document to start the validation pipeline." />}
      {docs.map((d) => (
        <DocumentRow key={d._id} doc={d} />
      ))}
    </div>
  );
}

function DocumentRow({ doc }: { doc: DocRow }) {
  const getDocumentUrl = useMutation(api.documents.logDocumentAccess);
  const revokeDocument = useMutation(api.documents.revokeDocument);
  const [url, setUrl] = useState<string | null>(null);

  return (
    <div className="rounded-md border px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <FileText className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium">{doc.fileName}</p>
            <p className="text-[11px] text-muted-foreground">
              {(doc.documentType && DOCUMENT_TYPES[doc.documentType]) || doc.documentType || "Unclassified"} ·{" "}
              {fmtDateTime(doc._creationTime)} · {(doc.size / 1024).toFixed(0)} KB
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px]">
          <StatusBadge meta={extractionMeta[doc.extractionStatus]} />
          <span
            className={cn(
              "inline-flex items-center gap-1",
              doc.fieldsConfirmed ? "text-emerald-700" : "text-amber-700",
            )}
          >
            {doc.fieldsConfirmed ? "Confirmed" : "Awaiting confirmation"}
          </span>
          <StatusBadge meta={docStatusMeta[doc.validationStatus]} />
          <StatusBadge meta={verificationMeta[doc.verificationStatus]} />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1 font-mono" title="SHA-256">
          <Hash className="size-3" /> {doc.sha256.slice(0, 16)}…
        </span>
        {doc.verificationDetail && <span className="max-w-md truncate">{doc.verificationDetail}</span>}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={async () => {
            await getDocumentUrl({ documentId: doc._id }).catch(() => undefined);
            toast.info("Access logged to the audit trail.", { description: doc.fileName });
          }}
        >
          View
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => {
            void getDocumentUrl({ documentId: doc._id }).then(() => undefined);
            toast.info("Demo: open the application detail to view/download.", { description: doc.fileName });
          }}
        >
          <Download className="mr-1 size-3" /> Download
        </Button>
        {doc.status === "ACTIVE" && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground hover:text-red-600"
            onClick={async () => {
              if (!window.confirm("Revoke this document? It will no longer be usable in applications.")) return;
              await revokeDocument({ documentId: doc._id, reason: "Revoked by owner" });
              toast.success("Document revoked.");
            }}
          >
            <Trash2 className="mr-1 size-3" /> Revoke
          </Button>
        )}
      </div>
      {url && null}
    </div>
  );
}

export function DocumentChecks({ checks }: { checks: { check: string; status: string; detail: string }[] }) {
  return (
    <ul className="divide-y divide-border rounded-md border text-xs">
      {checks.map((c, i) => (
        <li key={i} className="flex items-start justify-between gap-3 px-3 py-2">
          <span className="font-medium">{c.check}</span>
          <span className="flex items-center gap-2 text-right">
            <StatusBadge
              meta={{
                label: c.status,
                tone:
                  c.status === "PASSED"
                    ? "success"
                    : c.status === "FAILED"
                      ? "danger"
                      : c.status === "WARNING"
                        ? "warning"
                        : "muted",
              }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function IssuerCheck({ document, onRun }: { document: DocRow & { fieldsConfirmed: boolean }; onRun?: () => void }) {
  const verify = useMutation(api.documents.verifyViaIssuerRegistry);
  const [busy, setBusy] = useState(false);
  void RefreshCcw;
  void ShieldCheck;
  void fmtDate;
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 text-xs"
      disabled={!document.fieldsConfirmed || busy}
      title="Prototype Verification Gateway — Simulation"
      onClick={async () => {
        setBusy(true);
        try {
          const r = await verify({ documentId: document._id });
          toast.success("Issuer lookup completed.", { description: (r as { verificationDetail?: string }).verificationDetail });
          onRun?.();
        } catch (e) {
          toast.error(readErrorMessage(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="mr-1 size-3 animate-spin" /> : <ShieldCheck className="mr-1 size-3" />}
      Check issuer registry
    </Button>
  );
}

export { useQuery, useMutation, Textarea as TAlias };