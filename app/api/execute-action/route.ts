import type { NextRequest } from "next/server";

import {
  readFirstDefinedServerEnv,
  readOptionalServerEnv,
} from "@/lib/server-env";

const ACTION_TYPES = ["zulip", "artemis", "tumonline"] as const;

type ActionType = (typeof ACTION_TYPES)[number];

type ExecuteActionRequest = {
  type: ActionType;
  name: string;
  searchUrl?: string;
};

type ExecuteActionSuccessResponse = {
  status: "success";
  actionType: ActionType;
  name: string;
  message: string;
  navigationUrl?: string;
};

type ExecuteActionFailureResponse = {
  status: "manual_action_required" | "error";
  actionType: ActionType;
  name: string;
  message: string;
  details?: unknown;
};

class ZulipExecutionError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(message: string, statusCode: number, details?: unknown) {
    super(message);
    this.name = "ZulipExecutionError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

function isActionType(value: unknown): value is ActionType {
  return (
    typeof value === "string" &&
    ACTION_TYPES.includes(value as ActionType)
  );
}

function isExecuteActionRequest(value: unknown): value is ExecuteActionRequest {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as {
    type?: unknown;
    name?: unknown;
    searchUrl?: unknown;
  };

  return (
    isActionType(candidate.type) &&
    typeof candidate.name === "string" &&
    (candidate.searchUrl === undefined || typeof candidate.searchUrl === "string")
  );
}

function resolveNavigationUrl(searchUrl: string | undefined, fallbackUrl: string) {
  if (typeof searchUrl !== "string") {
    return fallbackUrl;
  }

  const trimmedSearchUrl = searchUrl.trim();

  return trimmedSearchUrl.length > 0 ? trimmedSearchUrl : fallbackUrl;
}

function slugifyName(name: string) {
  return name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

function buildArtemisNavigationUrl(name: string) {
  const nameSlug = slugifyName(name) || "course";
  return `https://artemis.ase.in.tum.de/courses/${nameSlug}`;
}

function buildTumonlineNavigationUrl(name: string) {
  return `https://campus.tum.de/tumonline/ee/ui/ca2/app/desktop/#/slc.tm.cp/student/courses?$ctx=design=ca2;header=max&filter=stterm=24S;search=${encodeURIComponent(name)}`;
}

function resolveZulipSubscriptionsUrl() {
  const subscriptionsUrl = readOptionalServerEnv("ZULIP_SUBSCRIPTIONS_URL");

  if (subscriptionsUrl) {
    return subscriptionsUrl;
  }

  const realmUrl = readOptionalServerEnv("ZULIP_REALM_URL");

  if (realmUrl) {
    return `${realmUrl.replace(/\/+$/, "")}/api/v1/users/me/subscriptions`;
  }

  return null;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const bodyText = await response.text();

  if (!bodyText) {
    return null;
  }

  try {
    return JSON.parse(bodyText) as unknown;
  } catch {
    return bodyText;
  }
}

async function executeZulipAction(
  name: string,
): Promise<ExecuteActionSuccessResponse> {
  const apiKey = readFirstDefinedServerEnv(
    "ZULIP_API_KEY",
    "DIFY_INPUT_ZULIP_API_KEY",
  );
  const zulipEmail = readFirstDefinedServerEnv(
    "ZULIP_EMAIL",
    "DIFY_INPUT_ZULIP_EMAIL",
  );
  const subscriptionsUrl = resolveZulipSubscriptionsUrl();

  if (!apiKey || !zulipEmail || !subscriptionsUrl) {
    throw new ZulipExecutionError("Manual Action Required", 500);
  }

  const authorization = Buffer.from(`${zulipEmail}:${apiKey}`).toString(
    "base64",
  );
  const body = new URLSearchParams({
    subscriptions: JSON.stringify([{ name }]),
  });

  const response = await fetch(subscriptionsUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${authorization}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    cache: "no-store",
  });

  const responseBody = await parseResponseBody(response);
  const parsedResponse =
    typeof responseBody === "object" && responseBody !== null
      ? (responseBody as { msg?: unknown; result?: unknown })
      : null;

  if (!response.ok || parsedResponse?.result === "error") {
    throw new ZulipExecutionError(
      "Manual Action Required",
      response.ok ? 502 : response.status,
      responseBody,
    );
  }

  return {
    status: "success",
    actionType: "zulip",
    name,
    message:
      typeof parsedResponse?.msg === "string" && parsedResponse.msg.length > 0
        ? parsedResponse.msg
        : `Subscribed to ${name}.`,
  };
}

function executeArtemisAction(
  name: string,
  searchUrl?: string,
): ExecuteActionSuccessResponse {
  return {
    status: "success",
    actionType: "artemis",
    name,
    message: `Artemis navigation prepared for ${name}.`,
    navigationUrl: resolveNavigationUrl(
      searchUrl,
      buildArtemisNavigationUrl(name),
    ),
  };
}

function executeTumonlineAction(
  name: string,
  searchUrl?: string,
): ExecuteActionSuccessResponse {
  return {
    status: "success",
    actionType: "tumonline",
    name,
    message: `TUMonline search is ready for ${name}.`,
    navigationUrl: resolveNavigationUrl(
      searchUrl,
      buildTumonlineNavigationUrl(name),
    ),
  };
}

export async function POST(request: NextRequest) {
  let requestBody: unknown;

  try {
    requestBody = await request.json();
  } catch {
    return Response.json(
      {
        status: "error",
        actionType: "artemis",
        name: "",
        message: "Invalid JSON payload.",
      } satisfies ExecuteActionFailureResponse,
      { status: 400 },
    );
  }

  if (!isExecuteActionRequest(requestBody)) {
    return Response.json(
      {
        status: "error",
        actionType: "artemis",
        name: "",
        message: "Request body must include a valid action type and name.",
      } satisfies ExecuteActionFailureResponse,
      { status: 400 },
    );
  }

  const name = requestBody.name.trim();

  if (!name) {
    return Response.json(
      {
        status: "error",
        actionType: requestBody.type,
        name: "",
        message: "Action name is required.",
      } satisfies ExecuteActionFailureResponse,
      { status: 400 },
    );
  }

  try {
    switch (requestBody.type) {
      case "zulip":
        return Response.json(await executeZulipAction(name));
      case "artemis":
        return Response.json(executeArtemisAction(name, requestBody.searchUrl));
      case "tumonline":
        return Response.json(
          executeTumonlineAction(name, requestBody.searchUrl),
        );
      default:
        return Response.json(
          {
            status: "error",
            actionType: requestBody.type,
            name,
            message: "Unsupported action type.",
          } satisfies ExecuteActionFailureResponse,
          { status: 400 },
        );
    }
  } catch (error) {
    if (error instanceof ZulipExecutionError) {
      return Response.json(
        {
          status: "manual_action_required",
          actionType: "zulip",
          name,
          message: "Manual Action Required",
          details: error.details,
        } satisfies ExecuteActionFailureResponse,
        { status: error.statusCode >= 400 ? error.statusCode : 502 },
      );
    }

    return Response.json(
      {
        status: "error",
        actionType: requestBody.type,
        name,
        message:
          error instanceof Error
            ? error.message
            : "Failed to execute the requested action.",
      } satisfies ExecuteActionFailureResponse,
      { status: 500 },
    );
  }
}
