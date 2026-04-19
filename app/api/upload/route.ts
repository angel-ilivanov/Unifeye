import type { NextRequest } from "next/server";

import {
  readFirstDefinedServerEnv,
  readOptionalServerEnv,
} from "@/lib/server-env";
import { getUploadValidationError } from "@/lib/upload-file-types";

type ParsedBody = {
  isJson: boolean;
  value: unknown;
};

type JsonRecord = Record<string, unknown>;

type DifyInputDefinition = {
  kind: string;
  variable: string;
  required: boolean;
  defaultValue?: string;
  allowedFileTypes: string[];
};

type DifyUploadedFile = {
  id: string;
};

type DifyWorkflowData = {
  status?: unknown;
  outputs?: unknown;
  error?: unknown;
};

type WorkflowApplicationError = {
  message: string;
  code?: string;
  details?: unknown;
};

class UploadRouteError extends Error {
  statusCode: number;
  details?: unknown;
  upstreamStatus?: number;

  constructor(
    message: string,
    statusCode: number,
    options?: {
      details?: unknown;
      upstreamStatus?: number;
    },
  ) {
    super(message);
    this.name = "UploadRouteError";
    this.statusCode = statusCode;
    this.details = options?.details;
    this.upstreamStatus = options?.upstreamStatus;
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

function tryParseJsonString(value: string) {
  const trimmedValue = value.trim();

  if (
    trimmedValue.length === 0 ||
    (!trimmedValue.startsWith("{") && !trimmedValue.startsWith("["))
  ) {
    return null;
  }

  try {
    return JSON.parse(trimmedValue) as unknown;
  } catch {
    return null;
  }
}

function hasCampusCopilotPayload(value: unknown): boolean {
  if (typeof value === "string") {
    const parsedValue = tryParseJsonString(value);
    return parsedValue !== null ? hasCampusCopilotPayload(parsedValue) : false;
  }

  if (Array.isArray(value)) {
    return value.some((entry) => hasCampusCopilotPayload(entry));
  }

  if (!isRecord(value)) {
    return false;
  }

  const hasTaskName =
    typeof value.taskName === "string" ||
    typeof value.task_name === "string" ||
    typeof value.title === "string";
  const executionResults = value.execution_results ?? value.executionResults;

  if (hasTaskName && isRecord(executionResults)) {
    return true;
  }

  for (const key of [
    "data",
    "outputs",
    "output",
    "result",
    "answer",
    "response",
    "payload",
  ]) {
    if (key in value && hasCampusCopilotPayload(value[key])) {
      return true;
    }
  }

  return Object.values(value).some((entry) => hasCampusCopilotPayload(entry));
}

function getWorkflowErrorMessage(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmedValue = value.trim();
    return trimmedValue.length > 0 ? trimmedValue : null;
  }

  if (Array.isArray(value)) {
    const messages = value
      .map((entry) => getWorkflowErrorMessage(entry))
      .filter((entry): entry is string => Boolean(entry));

    return messages.length > 0 ? messages.join("; ") : null;
  }

  if (!isRecord(value)) {
    return null;
  }

  for (const entry of [
    value.message,
    value.error,
    value.detail,
    value.details,
  ]) {
    const message = getWorkflowErrorMessage(entry);

    if (message) {
      return message;
    }
  }

  return null;
}

function extractWorkflowApplicationError(
  value: unknown,
): WorkflowApplicationError | null {
  if (typeof value === "string") {
    const parsedValue = tryParseJsonString(value);
    return parsedValue !== null
      ? extractWorkflowApplicationError(parsedValue)
      : null;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const nestedError = extractWorkflowApplicationError(entry);

      if (nestedError) {
        return nestedError;
      }
    }

    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.code === "string" &&
    typeof value.message === "string" &&
    value.message.trim().length > 0
  ) {
    return {
      message: value.message,
      code: value.code,
      details: value.details,
    };
  }

  if (typeof value.error === "string" && value.error.trim().length > 0) {
    return {
      message: value.error,
      details: value.details,
    };
  }

  if (isRecord(value.error)) {
    const message = getWorkflowErrorMessage(value.error);

    if (message) {
      return {
        message,
        code: typeof value.error.code === "string" ? value.error.code : undefined,
        details: value.error.details ?? value.details ?? value.error,
      };
    }
  }

  if (
    value.success === false ||
    value.status === "error" ||
    value.status === "failed"
  ) {
    const message = getWorkflowErrorMessage(
      value.message ?? value.error ?? value.detail ?? value.details,
    );

    if (message) {
      return {
        message,
        code: typeof value.code === "string" ? value.code : undefined,
        details: value.details ?? value.error ?? value,
      };
    }
  }

  for (const key of [
    "data",
    "outputs",
    "output",
    "result",
    "answer",
    "response",
    "payload",
    "details",
  ]) {
    if (!(key in value)) {
      continue;
    }

    const nestedError = extractWorkflowApplicationError(value[key]);

    if (nestedError) {
      return nestedError;
    }
  }

  for (const nestedValue of Object.values(value)) {
    const nestedError = extractWorkflowApplicationError(nestedValue);

    if (nestedError) {
      return nestedError;
    }
  }

  return null;
}

async function parseResponseBody(response: Response): Promise<ParsedBody> {
  const bodyText = await response.text();

  if (!bodyText) {
    return { isJson: false, value: null };
  }

  try {
    return {
      isJson: true,
      value: JSON.parse(bodyText) as unknown,
    };
  } catch {
    return {
      isJson: false,
      value: bodyText,
    };
  }
}

function deriveDifyEndpoint(apiUrl: string, suffix: string) {
  const url = new URL(apiUrl);

  if (!/\/workflows\/run\/?$/.test(url.pathname)) {
    throw new UploadRouteError(
      "DIFY_API_URL must point to the Dify /workflows/run endpoint.",
      500,
    );
  }

  url.pathname = url.pathname.replace(/\/workflows\/run\/?$/, suffix);
  return url.toString();
}

function normalizeVariableName(value: string) {
  return value
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

function toInputDefinitions(value: unknown): DifyInputDefinition[] {
  if (!isRecord(value) || !Array.isArray(value.user_input_form)) {
    return [];
  }

  const definitions: DifyInputDefinition[] = [];

  for (const entry of value.user_input_form) {
    if (!isRecord(entry)) {
      continue;
    }

    const firstEntry = Object.entries(entry)[0];

    if (!firstEntry) {
      continue;
    }

    const [kind, config] = firstEntry;

    if (!isRecord(config) || typeof config.variable !== "string") {
      continue;
    }

    const allowedFileTypes = Array.isArray(config.allowed_file_types)
      ? config.allowed_file_types.filter(
          (item): item is string => typeof item === "string",
        )
      : [];

    definitions.push({
      kind,
      variable: config.variable,
      required: config.required === true,
      defaultValue:
        typeof config.default === "string" && config.default.length > 0
          ? config.default
          : undefined,
      allowedFileTypes: allowedFileTypes.map((item) => item.toLowerCase()),
    });
  }

  return definitions;
}

function getFileKind(): "document" {
  return "document";
}

function formatAllowedFileTypes(allowedFileTypes: string[]) {
  if (allowedFileTypes.length === 0) {
    return "the published workflow";
  }

  if (allowedFileTypes.length === 1) {
    return `${allowedFileTypes[0]} uploads`;
  }

  return `${allowedFileTypes.slice(0, -1).join(", ")} or ${allowedFileTypes.at(-1)} uploads`;
}

function getProvidedFormValue(formData: FormData, variable: string) {
  const value = formData.get(variable);
  return typeof value === "string" ? value : null;
}

function getRequiredWorkflowInputs(
  inputDefinitions: DifyInputDefinition[],
  formData: FormData,
) {
  const fileDefinitions = inputDefinitions.filter(
    (definition) =>
      definition.kind === "file" || definition.kind === "file-list",
  );
  const requiredFileDefinitions = fileDefinitions.filter(
    (definition) => definition.required,
  );

  if (requiredFileDefinitions.length > 1) {
    throw new UploadRouteError(
      "The published Dify workflow expects multiple required file inputs, but this app currently supports uploading a single file.",
      500,
    );
  }

  const fileDefinition = requiredFileDefinitions[0] ?? fileDefinitions[0];

  if (!fileDefinition) {
    throw new UploadRouteError(
      "The published Dify workflow does not expose a file input variable.",
      500,
    );
  }

  const fileKind = getFileKind();

  if (
    fileDefinition.allowedFileTypes.length > 0 &&
    !fileDefinition.allowedFileTypes.includes(fileKind)
  ) {
    throw new UploadRouteError(
      `This Dify workflow currently accepts ${formatAllowedFileTypes(fileDefinition.allowedFileTypes)}, not ${fileKind} uploads.`,
      400,
    );
  }

  const inputs: JsonRecord = {};
  const missingInputs: string[] = [];

  for (const definition of inputDefinitions) {
    if (definition.variable === fileDefinition.variable) {
      continue;
    }

    if (definition.kind === "file" || definition.kind === "file-list") {
      if (definition.required) {
        missingInputs.push(
          `\`${definition.variable}\` is an additional required file input`,
        );
      }

      continue;
    }

    const normalizedVariable = normalizeVariableName(definition.variable);
    const providedFormValue = getProvidedFormValue(formData, definition.variable);

    if (providedFormValue !== null) {
      inputs[definition.variable] = providedFormValue;
      continue;
    }

    const envValue = readFirstDefinedServerEnv(
      `DIFY_INPUT_${normalizedVariable}`,
      normalizedVariable,
    );

    if (typeof envValue === "string" && envValue.length > 0) {
      inputs[definition.variable] = envValue;
      continue;
    }

    if (definition.defaultValue) {
      inputs[definition.variable] = definition.defaultValue;
      continue;
    }

    if (definition.required) {
      missingInputs.push(
        `\`${definition.variable}\` via \`DIFY_INPUT_${normalizedVariable}\` or \`${normalizedVariable}\``,
      );
    }
  }

  if (missingInputs.length > 0) {
    throw new UploadRouteError("Dify workflow setup is incomplete.", 500, {
      details: {
        missingInputs,
      },
    });
  }

  return {
    fileDefinition,
    fileKind,
    inputs,
  };
}

async function fetchDifyJson(
  url: string,
  init: RequestInit,
  errorMessage: string,
): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
  });
  const responseBody = await parseResponseBody(response);

  if (!response.ok) {
    throw new UploadRouteError(errorMessage, 502, {
      details: responseBody.value,
      upstreamStatus: response.status,
    });
  }

  if (!responseBody.isJson) {
    throw new UploadRouteError("Dify API returned a non-JSON response.", 502, {
      upstreamStatus: response.status,
    });
  }

  return responseBody.value;
}

async function fetchWorkflowInputDefinitions(
  difyApiKey: string,
  difyApiUrl: string,
) {
  const parametersUrl = deriveDifyEndpoint(difyApiUrl, "/parameters");
  const parameters = await fetchDifyJson(
    parametersUrl,
    {
      headers: {
        Authorization: `Bearer ${difyApiKey}`,
      },
    },
    "Failed to fetch Dify workflow parameters.",
  );

  return toInputDefinitions(parameters);
}

async function uploadWorkflowFile(
  difyApiKey: string,
  difyApiUrl: string,
  user: string,
  file: File,
) {
  const uploadUrl = deriveDifyEndpoint(difyApiUrl, "/files/upload");
  const uploadFormData = new FormData();
  uploadFormData.append("file", file);
  uploadFormData.append("user", user);

  const uploadResponse = await fetchDifyJson(
    uploadUrl,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${difyApiKey}`,
      },
      body: uploadFormData,
    },
    "Failed to upload the file to Dify.",
  );

  if (!isRecord(uploadResponse) || typeof uploadResponse.id !== "string") {
    throw new UploadRouteError("Dify file upload response was missing an id.", 502, {
      details: uploadResponse,
    });
  }

  return uploadResponse as DifyUploadedFile;
}

function getWorkflowData(value: unknown): DifyWorkflowData | null {
  if (!isRecord(value) || !isRecord(value.data)) {
    return null;
  }

  return value.data as DifyWorkflowData;
}

export async function POST(request: NextRequest) {
  const difyApiKey = readOptionalServerEnv("DIFY_API_KEY");
  const difyApiUrl = readOptionalServerEnv("DIFY_API_URL");
  const difyUserId =
    readOptionalServerEnv("DIFY_USER_ID") ?? "unifeye-web-client";

  if (!difyApiKey || !difyApiUrl) {
    return Response.json(
      { error: "Dify API credentials are not configured." },
      { status: 500 },
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) {
      return Response.json(
        { error: "A file upload is required in the 'file' field." },
        { status: 400 },
      );
    }

    const uploadValidationError = getUploadValidationError(file);

    if (uploadValidationError) {
      return Response.json({ error: uploadValidationError }, { status: 400 });
    }

    const inputDefinitions = await fetchWorkflowInputDefinitions(
      difyApiKey,
      difyApiUrl,
    );
    const { fileDefinition, fileKind, inputs } = getRequiredWorkflowInputs(
      inputDefinitions,
      formData,
    );
    const uploadedFile = await uploadWorkflowFile(
      difyApiKey,
      difyApiUrl,
      difyUserId,
      file,
    );

    inputs[fileDefinition.variable] = [
      {
        type: fileKind,
        transfer_method: "local_file",
        upload_file_id: uploadedFile.id,
      },
    ];

    const workflowResponse = await fetchDifyJson(
      difyApiUrl,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${difyApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs,
          user: difyUserId,
          response_mode: "blocking",
        }),
      },
      "Failed to run the Dify workflow.",
    );
    const workflowData = getWorkflowData(workflowResponse);

    if (
      workflowData &&
      workflowData.status !== undefined &&
      workflowData.status !== "succeeded"
    ) {
      throw new UploadRouteError("The Dify workflow did not complete successfully.", 502, {
        details: workflowData.error ?? workflowResponse,
      });
    }

    const workflowOutput = workflowData?.outputs ?? workflowResponse;

    if (hasCampusCopilotPayload(workflowOutput)) {
      return Response.json(workflowOutput);
    }

    const workflowApplicationError =
      extractWorkflowApplicationError(workflowOutput);

    if (workflowApplicationError) {
      throw new UploadRouteError(
        "The Dify workflow returned an application error.",
        502,
        {
          details: workflowApplicationError,
        },
      );
    }

    throw new UploadRouteError(
      "The Dify workflow returned an unexpected payload.",
      502,
      {
        details: workflowOutput,
      },
    );
  } catch (error) {
    if (error instanceof UploadRouteError) {
      return Response.json(
        {
          error: error.message,
          details: error.details,
          upstreamStatus: error.upstreamStatus,
        },
        { status: error.statusCode },
      );
    }

    return Response.json(
      {
        error: "Failed to process the upload request.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
