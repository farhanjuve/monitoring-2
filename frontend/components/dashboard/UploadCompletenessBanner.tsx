"use client";

import { AlertTriangle, CheckCircle2, Clock3 } from "lucide-react";
import { formatJakartaDateTime } from "@/lib/time";

interface UploadFileStatus {
  uploaded: boolean;
  latest_upload_at: string | null;
  filename: string | null;
  rows: number;
}

export interface UploadCompletenessStatus {
  tanggal: string;
  complete: boolean;
  mb52: UploadFileStatus;
  zsd_sodo: UploadFileStatus;
  missing: string[];
  message: string;
}

function statusTone(status: UploadCompletenessStatus) {
  if (status.complete) {
    return {
      icon: CheckCircle2,
      wrapper: "border-emerald-200 bg-emerald-50 text-emerald-900",
      iconColor: "text-emerald-600",
      badge: "bg-emerald-100 text-emerald-800 border-emerald-200",
      label: "Lengkap",
    };
  }

  if (status.missing.length >= 2) {
    return {
      icon: Clock3,
      wrapper: "border-gray-200 bg-gray-50 text-gray-800",
      iconColor: "text-gray-500",
      badge: "bg-gray-100 text-gray-700 border-gray-200",
      label: "Belum ada upload",
    };
  }

  return {
    icon: AlertTriangle,
    wrapper: "border-amber-200 bg-amber-50 text-amber-900",
    iconColor: "text-amber-600",
    badge: "bg-amber-100 text-amber-800 border-amber-200",
    label: `Kurang ${status.missing.join(", ")}`,
  };
}

function FilePill({ label, file }: { label: string; file: UploadFileStatus }) {
  return (
    <div className="rounded-md border border-white/70 bg-white/60 px-3 py-2 text-xs">
      <div className="flex items-center gap-2 font-semibold">
        <span>{label}</span>
        <span className={file.uploaded ? "text-emerald-700" : "text-gray-500"}>
          {file.uploaded ? "Sudah upload" : "Belum upload"}
        </span>
      </div>
      {file.uploaded && (
        <p className="mt-1 text-[11px] opacity-80">
          {file.filename || "-"} | {file.rows.toLocaleString("id-ID")} baris | {formatJakartaDateTime(file.latest_upload_at)}
        </p>
      )}
    </div>
  );
}

export function UploadCompletenessBadge({ status }: { status: UploadCompletenessStatus | null }) {
  if (!status) {
    return (
      <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-500">
        Cek upload...
      </span>
    );
  }

  const tone = statusTone(status);
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${tone.badge}`}>
      {tone.label}
    </span>
  );
}

export function UploadCompletenessBanner({
  status,
  compact = false,
}: {
  status: UploadCompletenessStatus | null;
  compact?: boolean;
}) {
  if (!status) return null;

  const tone = statusTone(status);
  const Icon = tone.icon;

  return (
    <div className={`rounded-lg border p-4 ${tone.wrapper} ${compact ? "text-sm" : ""}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex gap-3">
          <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${tone.iconColor}`} />
          <div>
            <p className="font-semibold">{status.message}</p>
            {!status.complete && (
              <p className="mt-1 text-xs opacity-80">
                Angka dashboard tetap tampil jika ada data, tetapi belum final sampai MB52 dan ZSD_SODO lengkap.
              </p>
            )}
          </div>
        </div>
        <UploadCompletenessBadge status={status} />
      </div>

      {!compact && (
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
          <FilePill label="MB52" file={status.mb52} />
          <FilePill label="ZSD_SODO" file={status.zsd_sodo} />
        </div>
      )}
    </div>
  );
}
