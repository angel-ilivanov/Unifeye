"use client";

import type {
  ChangeEvent,
  DragEvent,
  FormEvent,
  MouseEvent,
} from "react";
import { useId, useRef, useState } from "react";
import {
  CircleAlert,
  CloudUpload,
  Eye,
  RefreshCw,
  ScanEye,
} from "lucide-react";

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const ACCEPT_ATTRIBUTE =
  ".pdf,.png,.jpg,application/pdf,image/png,image/jpeg";
const ACCEPTED_EXTENSIONS = new Set([".pdf", ".png", ".jpg"]);
const ACCEPTED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
]);

type UploadContext = {
  fileName: string;
};

type DocumentIngestionProps = {
  isUploading: boolean;
  statusMessage: string;
  onUploadComplete: (
    response: unknown,
    context: UploadContext,
  ) => Promise<void> | void;
  onUploadStateChange: (uploading: boolean) => void;
};

function getErrorDetailMessage(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmedValue = value.trim();
    return trimmedValue.length > 0 ? trimmedValue : null;
  }

  if (Array.isArray(value)) {
    const messages = value
      .map((entry) => getErrorDetailMessage(entry))
      .filter((entry): entry is string => Boolean(entry));

    return messages.length > 0 ? messages.join("; ") : null;
  }

  if (typeof value !== "object" || value === null) {
    return null;
  }

  const candidate = value as {
    message?: unknown;
    error?: unknown;
    detail?: unknown;
    missingInputs?: unknown;
  };

  for (const entry of [
    candidate.message,
    candidate.error,
    candidate.detail,
    candidate.missingInputs,
  ]) {
    const message = getErrorDetailMessage(entry);

    if (message) {
      return message;
    }
  }

  return null;
}

function formatUploadError(responseJson: Record<string, unknown> | null) {
  const error =
    typeof responseJson?.error === "string"
      ? responseJson.error
      : "Document analysis failed. Please try again.";
  const detailMessage = getErrorDetailMessage(responseJson?.details);
  const upstreamStatus =
    typeof responseJson?.upstreamStatus === "number"
      ? ` (upstream ${responseJson.upstreamStatus})`
      : "";

  if (!detailMessage) {
    return `${error}${upstreamStatus}`;
  }

  return `${error}${upstreamStatus}: ${detailMessage}`;
}

function getFileExtension(fileName: string) {
  const lastDotIndex = fileName.lastIndexOf(".");

  if (lastDotIndex === -1) {
    return "";
  }

  return fileName.slice(lastDotIndex).toLowerCase();
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateFile(file: File) {
  const extension = getFileExtension(file.name);
  const hasValidMimeType =
    file.type.length > 0 && ACCEPTED_MIME_TYPES.has(file.type);
  const hasValidExtension = ACCEPTED_EXTENSIONS.has(extension);

  if (!hasValidMimeType && !hasValidExtension) {
    return "Only PDF, PNG, and JPG files are supported.";
  }

  if (file.size > MAX_FILE_SIZE) {
    return "File size must be 15MB or smaller.";
  }

  return null;
}

export default function DocumentIngestion({
  isUploading,
  statusMessage,
  onUploadComplete,
  onUploadStateChange,
}: DocumentIngestionProps) {
  const inputId = useId();
  const zulipEmailId = useId();
  const zulipApiKeyId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [zulipEmail, setZulipEmail] = useState("");
  const [zulipApiKey, setZulipApiKey] = useState("");

  function resetInputValue() {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function selectFile(file: File | null) {
    if (!file) {
      return;
    }

    const validationError = validateFile(file);

    if (validationError) {
      setSelectedFile(null);
      setErrorMessage(validationError);
      resetInputValue();
      return;
    }

    setSelectedFile(file);
    setErrorMessage(null);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    selectFile(event.target.files?.[0] ?? null);
  }

  function handleDragEnter(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();

    if (!isUploading) {
      setIsDragging(true);
    }
  }

  function handleDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";

    if (!isUploading) {
      setIsDragging(true);
    }
  }

  function handleDragLeave(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();

    if (event.currentTarget === event.target) {
      setIsDragging(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);

    if (isUploading) {
      return;
    }

    selectFile(event.dataTransfer.files?.[0] ?? null);
  }

  function clearSelectedFile(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    setSelectedFile(null);
    setErrorMessage(null);
    resetInputValue();
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedFile) {
      setErrorMessage("Choose a PDF, PNG, or JPG file before uploading.");
      return;
    }

    const validationError = validateFile(selectedFile);

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("zulip_email", zulipEmail.trim());
    formData.append("zulip_api_key", zulipApiKey.trim());

    onUploadStateChange(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const responseJson = (await response.json().catch(() => null)) as
        | Record<string, unknown>
        | null;

      if (!response.ok) {
        throw new Error(formatUploadError(responseJson));
      }

      await onUploadComplete(responseJson, {
        fileName: selectedFile.name,
      });

      setSelectedFile(null);
      resetInputValue();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "An unexpected error occurred while uploading the document.",
      );
    } finally {
      onUploadStateChange(false);
      setIsDragging(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="glass-panel rounded-[32px] p-4 shadow-[0_30px_90px_rgba(0,0,0,0.45)] md:p-6"
    >
      <div className="mb-5 flex flex-col gap-3 border-b border-white/6 pb-5 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-[var(--color-primary)]">
            <CloudUpload className="h-4 w-4" strokeWidth={1.8} />
            Document Intake
          </div>
          <h2 className="font-display text-xl font-semibold text-white md:text-2xl">
            Initialize a new study plan from your real course material.
          </h2>
        </div>
        <div className="rounded-full border border-white/8 bg-white/4 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.22em] text-[var(--color-on-surface-variant)]">
          Secure upload proxy
        </div>
      </div>

      <label
        htmlFor={inputId}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative block overflow-hidden rounded-[28px] border-2 border-dashed px-6 py-14 text-center transition-all duration-500 md:px-10 md:py-20 ${
          isUploading
            ? "border-[var(--color-primary)]/30 bg-[rgba(10,13,20,0.82)]"
            : isDragging
              ? "border-[var(--color-primary)]/40 bg-[rgba(10,13,20,0.82)]"
              : "border-white/8 bg-[rgba(10,13,20,0.6)] hover:border-[var(--color-primary)]/24 hover:bg-[rgba(10,13,20,0.8)]"
        }`}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,209,255,0.12),transparent_55%)] opacity-70" />
        <input
          ref={fileInputRef}
          id={inputId}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          className="sr-only"
          disabled={isUploading}
          onChange={handleFileChange}
        />

        <div className="relative z-10 mx-auto flex max-w-2xl flex-col items-center">
          <div
            className={`mb-6 flex h-18 w-18 items-center justify-center rounded-2xl border border-white/10 bg-[rgba(18,24,38,0.88)] transition-all duration-500 ${
              isUploading ? "animate-breathe glow-cyan-strong" : "glow-cyan"
            }`}
          >
            {isUploading ? (
              <ScanEye
                className="h-8 w-8 text-[var(--color-primary)]"
                strokeWidth={1.9}
              />
            ) : selectedFile ? (
              <Eye
                className="h-8 w-8 text-[var(--color-primary)]"
                strokeWidth={1.9}
              />
            ) : (
              <CloudUpload
                className="h-8 w-8 text-[var(--color-primary)]"
                strokeWidth={1.9}
              />
            )}
          </div>

          {isUploading ? (
            <>
              <div className="font-mono text-sm font-semibold uppercase tracking-[0.28em] text-[var(--color-primary)] text-glow">
                System scanning
              </div>
              <div className="mt-4 rounded-xl border border-[var(--color-primary)]/16 bg-black/30 px-4 py-3 font-mono text-xs text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:text-sm">
                {statusMessage}
              </div>
            </>
          ) : (
            <>
              <h3 className="font-display text-2xl font-semibold uppercase tracking-[0.12em] text-white md:text-3xl">
                Drop files here to initialize
              </h3>
              <p className="mt-4 max-w-xl text-sm leading-7 text-[var(--color-on-surface-variant)] md:text-base">
                Upload course documents or screenshots, then route the extracted
                tasks into the command center with the new strategy view.
              </p>
            </>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-[11px] font-mono uppercase tracking-[0.24em] text-[var(--color-on-surface-variant)]">
            <span className="rounded-full border border-white/8 bg-white/4 px-3 py-1">
              PDF
            </span>
            <span className="rounded-full border border-white/8 bg-white/4 px-3 py-1">
              PNG
            </span>
            <span className="rounded-full border border-white/8 bg-white/4 px-3 py-1">
              JPG
            </span>
            <span className="rounded-full border border-white/8 bg-white/4 px-3 py-1">
              15MB Max
            </span>
          </div>
        </div>
      </label>

      <div className="mt-5 rounded-[24px] border border-white/8 bg-[rgba(10,13,20,0.62)] p-4 md:p-5">
        <div className="mb-4">
          <div className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-[var(--color-primary)]">
            Optional Zulip Access
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-[var(--color-on-surface-variant)]">
            Leave these blank if you only want document analysis. Add them when
            you want the workflow to personalize or validate Zulip actions with
            your own account details.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-[11px] font-mono uppercase tracking-[0.22em] text-[var(--color-on-surface-variant)]">
              Zulip email
            </span>
            <input
              id={zulipEmailId}
              type="text"
              autoComplete="email"
              value={zulipEmail}
              disabled={isUploading}
              onChange={(event) => setZulipEmail(event.target.value)}
              placeholder="you@tum.de"
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-[var(--color-primary)]/45 focus:bg-black/40"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-[11px] font-mono uppercase tracking-[0.22em] text-[var(--color-on-surface-variant)]">
              Zulip API key
            </span>
            <input
              id={zulipApiKeyId}
              type="text"
              autoComplete="off"
              value={zulipApiKey}
              disabled={isUploading}
              onChange={(event) => setZulipApiKey(event.target.value)}
              placeholder="Optional"
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-[var(--color-primary)]/45 focus:bg-black/40"
            />
          </label>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-h-10">
          {selectedFile ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/4 px-3 py-2 text-sm text-white">
              <Eye className="h-4 w-4 text-[var(--color-primary)]" />
              <span className="max-w-[220px] truncate md:max-w-[320px]">
                {selectedFile.name}
              </span>
              <span className="text-xs text-[var(--color-on-surface-variant)]">
                {formatFileSize(selectedFile.size)}
              </span>
            </div>
          ) : (
            <div className="text-sm text-[var(--color-on-surface-variant)]">
              Select a file to replace the placeholder plan with a live upload.
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          {selectedFile ? (
            <button
              type="button"
              onClick={clearSelectedFile}
              disabled={isUploading}
              className="inline-flex items-center justify-center rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-[var(--color-on-surface-variant)] transition hover:border-white/20 hover:bg-white/4 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Clear file
            </button>
          ) : null}

          <button
            type="submit"
            disabled={!selectedFile || isUploading}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-[#02141a] transition hover:-translate-y-0.5 hover:shadow-[0_0_28px_rgba(0,209,255,0.35)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {isUploading ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Analyzing
              </>
            ) : (
              <>
                <CloudUpload className="h-4 w-4" />
                Analyze document
              </>
            )}
          </button>
        </div>
      </div>

      {errorMessage ? (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-rose-400/16 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      ) : null}
    </form>
  );
}
