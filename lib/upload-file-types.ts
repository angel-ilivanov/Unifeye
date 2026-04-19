export const MAX_UPLOAD_FILE_SIZE = 15 * 1024 * 1024;

export const SUPPORTED_UPLOAD_EXTENSIONS = [
  ".pdf",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
] as const;

export const SUPPORTED_UPLOAD_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
] as const;

export const UPLOAD_ACCEPT_ATTRIBUTE = [
  ...SUPPORTED_UPLOAD_EXTENSIONS,
  ...SUPPORTED_UPLOAD_MIME_TYPES,
].join(",");

const SUPPORTED_EXTENSION_SET = new Set<string>(SUPPORTED_UPLOAD_EXTENSIONS);
const SUPPORTED_MIME_TYPE_SET = new Set<string>(SUPPORTED_UPLOAD_MIME_TYPES);

function getFileExtension(fileName: string) {
  const lastDotIndex = fileName.lastIndexOf(".");

  if (lastDotIndex === -1) {
    return "";
  }

  return fileName.slice(lastDotIndex).toLowerCase();
}

type UploadLikeFile = {
  name: string;
  size: number;
  type: string;
};

export function getUploadValidationError(file: UploadLikeFile) {
  const extension = getFileExtension(file.name);
  const hasValidMimeType =
    file.type.length > 0 && SUPPORTED_MIME_TYPE_SET.has(file.type);
  const hasValidExtension = SUPPORTED_EXTENSION_SET.has(extension);

  if (!hasValidMimeType && !hasValidExtension) {
    return "Only PDF, Word, and PowerPoint files are supported.";
  }

  if (file.size > MAX_UPLOAD_FILE_SIZE) {
    return "File size must be 15MB or smaller.";
  }

  return null;
}
