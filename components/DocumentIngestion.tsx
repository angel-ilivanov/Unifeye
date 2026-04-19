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
  CircleQuestionMark,
  CloudUpload,
  RefreshCw,
  ScanEye,
} from "lucide-react";

import {
  MAX_UPLOAD_FILE_SIZE,
  UPLOAD_ACCEPT_ATTRIBUTE,
  getUploadValidationError,
} from "@/lib/upload-file-types";

import { UnifeyeMark } from "./unifeye-logo";

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

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateFile(file: File) {
  return getUploadValidationError(file);
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
  const zulipApiKeyHelpId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isZulipApiKeyHelpOpen, setIsZulipApiKeyHelpOpen] = useState(false);
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
      setErrorMessage("Choose a PDF, Word, or PowerPoint file before uploading.");
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
    <form onSubmit={onSubmit} className="space-y-4">
      <label
        htmlFor={inputId}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`block rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface-container)] p-4 transition-colors md:p-5 ${
          isUploading || isDragging
            ? "border-[var(--color-primary)]/45"
            : "hover:border-[var(--color-primary)]/28"
        }`}
      >
        <input
          ref={fileInputRef}
          id={inputId}
          type="file"
          accept={UPLOAD_ACCEPT_ATTRIBUTE}
          className="sr-only"
          disabled={isUploading}
          onChange={handleFileChange}
        />

        <div
          className={`rounded-[16px] border border-dashed px-5 py-10 text-center md:px-8 md:py-14 ${
            isUploading || isDragging
              ? "border-[var(--color-primary)]/38 bg-[rgba(18,25,41,0.88)]"
              : "border-[rgba(120,137,180,0.24)] bg-[rgba(18,24,38,0.58)]"
          }`}
        >
          <div className="mx-auto flex max-w-3xl flex-col items-center">
            <div
              className={`flex h-16 w-16 items-center justify-center rounded-[16px] bg-[var(--color-surface-bright)] ${
                isUploading ? "animate-breathe" : ""
              }`}
            >
              {isUploading ? (
                <ScanEye
                  className="h-8 w-8 text-[var(--color-primary)]"
                  strokeWidth={1.9}
                />
              ) : (
                <UnifeyeMark className="h-8 w-[2.9rem]" />
              )}
            </div>

            {isUploading ? (
              <>
                <h2 className="mt-6 font-display text-2xl font-semibold text-white md:text-[2.25rem]">
                  Scanning workspace
                </h2>
                <p className="mt-3 max-w-2xl font-mono text-sm leading-7 text-[var(--color-on-surface-variant)]">
                  {statusMessage}
                </p>
              </>
            ) : (
              <>
                <h2 className="mt-6 font-display text-2xl font-semibold text-white md:text-[2.25rem]">
                  Drop your first lecture slides here
                </h2>
                <p className="mt-3 max-w-2xl font-mono text-sm leading-7 text-[var(--color-on-surface-variant)]">
                  Or click to browse.
                </p>
              </>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5 font-mono text-[0.68rem] uppercase tracking-[0.18em] text-[var(--color-on-surface-variant)]">
              <span className="rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-bright)] px-3 py-1.5">
                PDF
              </span>
              <span className="rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-bright)] px-3 py-1.5">
                DOC/DOCX
              </span>
              <span className="rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-bright)] px-3 py-1.5">
                PPT/PPTX
              </span>
              <span className="rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-bright)] px-3 py-1.5">
                {Math.round(MAX_UPLOAD_FILE_SIZE / (1024 * 1024))}MB max
              </span>
            </div>
          </div>
        </div>
      </label>

      <div className="rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface-container)] p-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_200px_200px_auto] xl:items-end">
          <div>
            <div className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-[var(--color-on-surface-variant)]">
              Upload Queue
            </div>
            {selectedFile ? (
              <div className="mt-3 flex flex-wrap items-center gap-3 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-bright)] px-4 py-3 text-sm text-white">
                <span className="truncate font-medium">{selectedFile.name}</span>
                <span className="font-mono text-[0.72rem] uppercase tracking-[0.18em] text-[var(--color-on-surface-variant)]">
                  {formatFileSize(selectedFile.size)}
                </span>
              </div>
            ) : (
              <p className="mt-3 text-sm leading-7 text-[var(--color-on-surface-variant)]">
                Click to browse or drag a file into the area above, then run the
                analysis.
              </p>
            )}
          </div>
          <label className="block">
            <span className="mb-2 block font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--color-on-surface-variant)]">
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
              className="w-full rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-bright)] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-[var(--color-primary)]/40"
            />
          </label>

          <div className="relative block">
            <div className="mb-2 flex items-center justify-between gap-3">
              <label
                htmlFor={zulipApiKeyId}
                className="block font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--color-on-surface-variant)]"
              >
                Zulip API key
              </label>
              <button
                type="button"
                aria-expanded={isZulipApiKeyHelpOpen}
                aria-controls={zulipApiKeyHelpId}
                aria-label="Where can I find my Zulip API key?"
                title="Where can I find my Zulip API key?"
                onClick={() =>
                  setIsZulipApiKeyHelpOpen((currentValue) => !currentValue)
                }
                className="inline-flex items-center justify-center text-[var(--color-primary)] transition hover:text-white"
              >
                <CircleQuestionMark className="h-4 w-4" strokeWidth={1.9} />
              </button>
            </div>
            <div
              id={zulipApiKeyHelpId}
              aria-hidden={!isZulipApiKeyHelpOpen}
              className={`pointer-events-none absolute right-0 bottom-full z-20 mb-3 w-80 max-w-[calc(100vw-2rem)] transition-all duration-200 ease-out motion-reduce:transition-none ${
                isZulipApiKeyHelpOpen
                  ? "pointer-events-auto translate-y-0 opacity-100"
                  : "translate-y-2 opacity-0"
              }`}
            >
              <div className="rounded-[14px] border border-[var(--color-primary)]/18 bg-[var(--color-surface-container)] p-3.5 shadow-[0_18px_40px_rgba(3,8,18,0.45)] backdrop-blur-sm">
                <ol className="space-y-3 text-sm leading-6 text-white/92">
                  <li className="grid grid-cols-[1.9rem_minmax(0,1fr)] items-start gap-3">
                    <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-semibold text-[#04101a]">
                      1
                    </span>
                    <span>
                      Click the gear icon in the upper right corner of the web
                      or desktop app.
                    </span>
                  </li>
                  <li className="grid grid-cols-[1.9rem_minmax(0,1fr)] items-start gap-3">
                    <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-semibold text-[#04101a]">
                      2
                    </span>
                    <span>
                      Select <strong>Personal settings</strong>.
                    </span>
                  </li>
                  <li className="grid grid-cols-[1.9rem_minmax(0,1fr)] items-start gap-3">
                    <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-semibold text-[#04101a]">
                      3
                    </span>
                    <span>
                      On the left, click <strong>Account &amp; privacy</strong>.
                    </span>
                  </li>
                  <li className="grid grid-cols-[1.9rem_minmax(0,1fr)] items-start gap-3">
                    <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-semibold text-[#04101a]">
                      4
                    </span>
                    <span>
                      Under <strong>API key</strong>, click{" "}
                      <strong>Manage your API key</strong>.
                    </span>
                  </li>
                  <li className="grid grid-cols-[1.9rem_minmax(0,1fr)] items-start gap-3">
                    <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-semibold text-[#04101a]">
                      5
                    </span>
                    <span>
                      Enter your password and click{" "}
                      <strong>Get API key</strong>. If you do not know your
                      password, reset it and follow the instructions from there.
                    </span>
                  </li>
                  <li className="grid grid-cols-[1.9rem_minmax(0,1fr)] items-start gap-3">
                    <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-semibold text-[#04101a]">
                      6
                    </span>
                    <span>Copy your API key.</span>
                  </li>
                </ol>
                <div className="absolute right-5 top-full h-3 w-3 -translate-y-1/2 rotate-45 border-r border-b border-[var(--color-primary)]/18 bg-[var(--color-surface-container)]" />
              </div>
            </div>
            <input
              id={zulipApiKeyId}
              type="password"
              autoComplete="off"
              value={zulipApiKey}
              disabled={isUploading}
              onChange={(event) => setZulipApiKey(event.target.value)}
              placeholder="Optional"
              className="w-full rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-bright)] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-[var(--color-primary)]/40"
            />
          </div>

          <div className="flex flex-wrap gap-3 xl:justify-end">
            {selectedFile ? (
              <button
                type="button"
                onClick={clearSelectedFile}
                disabled={isUploading}
                className="inline-flex items-center justify-center rounded-[12px] border border-[var(--color-border)] px-4 py-3 text-sm font-semibold text-[var(--color-on-surface-variant)] transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Clear file
              </button>
            ) : null}

            <button
              type="submit"
              disabled={!selectedFile || isUploading}
              className="inline-flex items-center justify-center gap-2 rounded-[12px] border border-[var(--color-primary)] bg-[var(--color-primary)] px-5 py-3 text-sm font-semibold text-[#04101a] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
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
      </div>

      {errorMessage ? (
        <div className="flex items-start gap-3 rounded-[14px] border border-rose-400/18 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      ) : null}
    </form>
  );
}
