"use client";

import { startTransition, useEffect, useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Circle,
  CircleAlert,
  GraduationCap,
  History,
  LayoutDashboard,
  ListTodo,
  Lock,
  Network,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";

import DocumentIngestion from "./DocumentIngestion";
import UnifeyeLogo, { UnifeyeMark } from "./unifeye-logo";

type PrioritizedCourseLink = {
  course_name: string;
  priority: string;
  search_url: string;
};

type PrioritizedExamLink = {
  exam_name: string;
  priority: string;
  search_url: string;
};

type PrioritizedZulipChannel = {
  name: string;
  priority: string;
};

type ZulipStatus = {
  status: string;
  subscribed: string[];
};

type CampusCopilotExecutionResults = {
  zulip_status?: ZulipStatus;
  zulip_channels?: PrioritizedZulipChannel[];
  artemis_courses?: PrioritizedCourseLink[];
  tumonline_courses?: PrioritizedCourseLink[];
  artemis_link?: { links: PrioritizedCourseLink[] };
  tumonline_course_link?: { links: PrioritizedCourseLink[] };
  tumonline_exam_link?: { links: PrioritizedExamLink[] };
};

export type CampusCopilotPayload = {
  taskName: string;
  execution_results: CampusCopilotExecutionResults;
};

type ActionPriority = "do_now" | "schedule";
type ActionType = "zulip" | "artemis" | "tumonline";
type SidebarNodeTone = "dg" | "dy" | "dr" | "dp";

type ActionItem = {
  title: string;
  executionName: string;
  actionType: ActionType;
  priority: ActionPriority;
  searchUrl?: string;
  source: "Zulip" | "Artemis" | "TUMonline Courses" | "TUMonline Exams";
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
};

type ExecuteActionResponse =
  | ExecuteActionSuccessResponse
  | ExecuteActionFailureResponse;

type ActionExecutionState = {
  status: "idle" | "working" | "success" | "manual_action_required" | "error";
  message?: string;
  navigationUrl?: string;
};

type PrioritizedItem = {
  priority: string;
};

type NavItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  active?: boolean;
};

type SidebarCourse = {
  code: string;
  name: string;
  active?: boolean;
};

type SidebarNode = {
  name: string;
  badge: string;
  tone: SidebarNodeTone;
};

type UploadContext = {
  fileName: string;
};

const NAV_ITEMS: NavItem[] = [
  { id: "command", label: "Command Center", icon: LayoutDashboard, active: true },
  { id: "academics", label: "Academics", icon: GraduationCap },
  { id: "nodes", label: "Institutional Nodes", icon: Network },
  { id: "history", label: "History", icon: History },
  { id: "logs", label: "System Logs", icon: BarChart3 },
];

const STATUS_MESSAGES = [
  "Analyzing uploaded document...",
  "Extracting tasks and deadlines...",
  "Routing actions into campus systems...",
  "Building the updated workspace...",
];

const TUMONLINE_PARENT_COURSE_PATTERN =
  /\b(tutorial|tutorials|ubung|ubungen|uebung|uebungen)\b/;

const COURSE_HINT_STOP_WORDS = new Set([
  "an",
  "and",
  "course",
  "courses",
  "das",
  "der",
  "die",
  "ein",
  "eine",
  "for",
  "fur",
  "group",
  "groups",
  "in",
  "of",
  "register",
  "registration",
  "session",
  "sessions",
  "the",
  "tutorial",
  "tutorials",
  "ubung",
  "ubungen",
  "uebung",
  "uebungen",
  "zu",
  "zum",
  "zur",
]);

type CourseMatchHints = {
  aliases: Set<string>;
  codes: Set<string>;
  keywords: Set<string>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isActionPriority(value: string): value is ActionPriority {
  return value === "do_now" || value === "schedule";
}

function normalizeLookupText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isTutorialLikeTumonlineTitle(title: string) {
  return TUMONLINE_PARENT_COURSE_PATTERN.test(normalizeLookupText(title));
}

function extractCourseMatchHints(title: string): CourseMatchHints {
  const normalizedTitle = normalizeLookupText(title);
  const aliases = new Set<string>();

  for (const match of title.matchAll(/\(([A-Za-z0-9\s-]+)\)/g)) {
    const normalizedMatch = normalizeLookupText(match[1]);

    for (const token of normalizedMatch.split(/[^a-z0-9]+/)) {
      if (token.length >= 2 && !COURSE_HINT_STOP_WORDS.has(token)) {
        aliases.add(token);
      }
    }
  }

  for (const match of title.matchAll(/\b[A-Z]{2,}\d*[A-Z0-9]*\b/g)) {
    aliases.add(normalizeLookupText(match[0]));
  }

  const codes = new Set(
    normalizedTitle.match(/\b[a-z]{2,}\d{3,}[a-z0-9]*\b/g) ?? [],
  );
  const keywords = new Set(
    (normalizedTitle.match(/\b[a-z0-9]{3,}\b/g) ?? []).filter(
      (token) => !COURSE_HINT_STOP_WORDS.has(token),
    ),
  );

  return {
    aliases,
    codes,
    keywords,
  };
}

function countSharedHints(left: Set<string>, right: Set<string>) {
  let count = 0;

  for (const entry of left) {
    if (right.has(entry)) {
      count += 1;
    }
  }

  return count;
}

function scoreTumonlineCourseMatch(
  currentItem: CourseMatchHints,
  candidateItem: CourseMatchHints,
) {
  const sharedCodes = countSharedHints(currentItem.codes, candidateItem.codes);
  const sharedAliases = countSharedHints(
    currentItem.aliases,
    candidateItem.aliases,
  );
  const sharedKeywords = countSharedHints(
    currentItem.keywords,
    candidateItem.keywords,
  );

  return sharedCodes * 100 + sharedAliases * 30 + sharedKeywords * 5;
}

function remapTumonlineChildCourseLinks(items: ActionItem[]) {
  const canonicalCourses = items
    .filter(
      (item) =>
        item.source === "TUMonline Courses" &&
        !isTutorialLikeTumonlineTitle(item.title) &&
        typeof item.searchUrl === "string" &&
        item.searchUrl.trim().length > 0,
    )
    .map((item) => ({
      hints: extractCourseMatchHints(item.title),
      searchUrl: item.searchUrl as string,
    }));

  if (canonicalCourses.length === 0) {
    return items;
  }

  return items.map((item) => {
    if (
      item.source !== "TUMonline Courses" ||
      !isTutorialLikeTumonlineTitle(item.title)
    ) {
      return item;
    }

    const itemHints = extractCourseMatchHints(item.title);
    let bestMatch: { score: number; searchUrl: string } | null = null;

    for (const candidate of canonicalCourses) {
      const score = scoreTumonlineCourseMatch(itemHints, candidate.hints);

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = {
          score,
          searchUrl: candidate.searchUrl,
        };
      }
    }

    if (!bestMatch || bestMatch.score <= 0) {
      return item;
    }

    return {
      ...item,
      searchUrl: bestMatch.searchUrl,
    };
  });
}

function getActionKey(
  item: Pick<ActionItem, "actionType" | "executionName" | "source">,
) {
  return `${item.actionType}:${item.source}:${item.executionName}`;
}

function getInitialZulipStatus(
  executionResults: CampusCopilotExecutionResults,
): ZulipStatus {
  return executionResults.zulip_status ?? {
    status: "pending",
    subscribed: [],
  };
}

function toActionItems<T extends PrioritizedItem>(
  items: T[],
  options: {
    getTitle: (item: T) => string;
    getSearchUrl?: (item: T) => string | undefined;
    source: ActionItem["source"];
    actionType: ActionType;
  },
): ActionItem[] {
  return items.flatMap<ActionItem>((item) => {
    if (!isActionPriority(item.priority)) {
      return [];
    }

    const title = options.getTitle(item);

    return [
      {
        title,
        executionName: title,
        actionType: options.actionType,
        priority: item.priority,
        searchUrl: options.getSearchUrl?.(item),
        source: options.source,
      },
    ];
  });
}

function collectActionItems(
  executionResults: CampusCopilotExecutionResults,
): ActionItem[] {
  const zulipItems = toActionItems(executionResults.zulip_channels ?? [], {
    getTitle: (item) => item.name,
    source: "Zulip",
    actionType: "zulip",
  });

  const artemisItems = toActionItems(
    executionResults.artemis_courses ?? executionResults.artemis_link?.links ?? [],
    {
      getTitle: (item) => item.course_name,
      getSearchUrl: (item) => item.search_url,
      source: "Artemis",
      actionType: "artemis",
    },
  );

  const tumCourseItems = toActionItems(
    executionResults.tumonline_courses ??
      executionResults.tumonline_course_link?.links ??
      [],
    {
      getTitle: (item) => item.course_name,
      getSearchUrl: (item) => item.search_url,
      source: "TUMonline Courses",
      actionType: "tumonline",
    },
  );

  const tumExamItems = toActionItems(
    executionResults.tumonline_exam_link?.links ?? [],
    {
      getTitle: (item) => item.exam_name,
      getSearchUrl: (item) => item.search_url,
      source: "TUMonline Exams",
      actionType: "tumonline",
    },
  );

  return [
    ...zulipItems,
    ...artemisItems,
    ...remapTumonlineChildCourseLinks(tumCourseItems),
    ...tumExamItems,
  ];
}

function extractCourseCode(title: string, priority: ActionPriority) {
  const courseCodeMatch = title.match(/\b[A-Z]{2,}\d{3,}\b/);

  if (courseCodeMatch) {
    return courseCodeMatch[0];
  }

  return priority === "do_now" ? "NOW" : "PLAN";
}

function buildSidebarCourses(actionItems: ActionItem[]) {
  const courseActions = actionItems.filter(
    (item) => item.source !== "Zulip" && item.source !== "TUMonline Exams",
  );

  return courseActions.reduce<SidebarCourse[]>((items, item) => {
    if (items.some((course) => course.name === item.title) || items.length >= 4) {
      return items;
    }

    return [
      ...items,
      {
        code: extractCourseCode(item.title, item.priority),
        name: item.title,
        active: items.length === 0,
      },
    ];
  }, []);
}

function getActionTone(
  items: ActionItem[],
  executionStates: Record<string, ActionExecutionState>,
): SidebarNodeTone {
  if (items.length === 0) {
    return "dp";
  }

  const statuses = items
    .map((item) => executionStates[getActionKey(item)]?.status)
    .filter((status): status is ActionExecutionState["status"] => Boolean(status));

  if (
    statuses.some(
      (status) => status === "error" || status === "manual_action_required",
    )
  ) {
    return "dr";
  }

  if (statuses.some((status) => status === "working")) {
    return "dy";
  }

  if (items.every((item) => executionStates[getActionKey(item)]?.status === "success")) {
    return "dg";
  }

  return "dp";
}

function getActionBadge(
  items: ActionItem[],
  executionStates: Record<string, ActionExecutionState>,
) {
  if (items.length === 0) {
    return "idle";
  }

  const completedCount = items.filter(
    (item) => executionStates[getActionKey(item)]?.status === "success",
  ).length;

  if (completedCount > 0) {
    return `${completedCount}/${items.length} done`;
  }

  if (
    items.some((item) => executionStates[getActionKey(item)]?.status === "working")
  ) {
    return "syncing";
  }

  return `${items.length} queued`;
}

function buildSidebarNodes(
  actionItems: ActionItem[],
  executionStates: Record<string, ActionExecutionState>,
  zulipStatus: ZulipStatus,
): SidebarNode[] {
  const zulipItems = actionItems.filter((item) => item.actionType === "zulip");
  const artemisItems = actionItems.filter((item) => item.actionType === "artemis");
  const tumonlineItems = actionItems.filter(
    (item) => item.actionType === "tumonline",
  );
  const zulipTone: SidebarNodeTone =
    zulipStatus.status === "complete"
      ? "dg"
      : getActionTone(zulipItems, executionStates);

  const zulipBadge =
    zulipStatus.status === "complete"
      ? `${zulipStatus.subscribed.length} joined`
      : getActionBadge(zulipItems, executionStates);

  return [
    {
      name: "Zulip",
      badge: zulipBadge,
      tone: zulipTone,
    },
    {
      name: "Artemis",
      badge: getActionBadge(artemisItems, executionStates),
      tone: getActionTone(artemisItems, executionStates),
    },
    {
      name: "TUMonline",
      badge: getActionBadge(tumonlineItems, executionStates),
      tone: getActionTone(tumonlineItems, executionStates),
    },
  ];
}

function getPriorityPresentation(priority: ActionPriority) {
  return priority === "do_now"
    ? {
        badgeLabel: "Do now",
        badgeClassName: "border-rose-400/18 bg-rose-500/10 text-rose-100",
      }
    : {
        badgeLabel: "Scheduled",
        badgeClassName:
          "border-[var(--color-primary)]/20 bg-[var(--color-primary)]/10 text-cyan-50",
      };
}

function getPlatformPresentation(source: ActionItem["source"]) {
  switch (source) {
    case "Zulip":
      return {
        badgeLabel: "Zulip",
        badgeClassName: "border-cyan-400/20 bg-cyan-400/10 text-cyan-50",
        dotClassName: "bg-cyan-300",
      };
    case "Artemis":
      return {
        badgeLabel: "Artemis",
        badgeClassName:
          "border-violet-400/20 bg-violet-500/10 text-violet-50",
        dotClassName: "bg-violet-300",
      };
    case "TUMonline Courses":
      return {
        badgeLabel: "TUM course",
        badgeClassName:
          "border-indigo-400/20 bg-indigo-500/10 text-indigo-50",
        dotClassName: "bg-indigo-300",
      };
    case "TUMonline Exams":
      return {
        badgeLabel: "TUM exam",
        badgeClassName: "border-amber-400/20 bg-amber-500/10 text-amber-50",
        dotClassName: "bg-amber-300",
      };
    default:
      return {
        badgeLabel: source,
        badgeClassName:
          "border-[var(--color-border)] bg-[var(--color-surface-bright)] text-[var(--color-on-surface)]",
        dotClassName: "bg-[var(--color-on-surface-variant)]",
      };
  }
}

function getOpenLinkLabel(
  item: Pick<ActionItem, "source">,
  isManualActionRequired: boolean,
) {
  switch (item.source) {
    case "Zulip":
      return "Open channel";
    case "Artemis":
      return "Open in Artemis";
    case "TUMonline Courses":
      return "Open course";
    case "TUMonline Exams":
      return "Open exam";
    default:
      return isManualActionRequired ? "Open manually" : "Open link";
  }
}

function PlatformBadge({ source }: { source: ActionItem["source"] }) {
  const platform = getPlatformPresentation(source);

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-[10px] border px-2.5 py-1 font-mono text-[0.64rem] uppercase tracking-[0.18em] ${platform.badgeClassName}`}
    >
      <span className={`h-2 w-2 rounded-full ${platform.dotClassName}`} />
      {platform.badgeLabel}
    </span>
  );
}

function resolveNavigationUrl(searchUrl?: string, fallbackUrl?: string) {
  if (typeof searchUrl === "string") {
    const trimmedSearchUrl = searchUrl.trim();

    if (trimmedSearchUrl.length > 0) {
      return trimmedSearchUrl;
    }
  }

  return fallbackUrl;
}

function openPendingNavigationWindow(actionType: ActionType) {
  if (typeof window === "undefined" || actionType === "zulip") {
    return null;
  }

  const pendingWindow = window.open("", "_blank");

  if (!pendingWindow) {
    return null;
  }

  pendingWindow.document.title = "UNIFEYE";
  pendingWindow.document.body.style.margin = "0";
  pendingWindow.document.body.style.minHeight = "100vh";
  pendingWindow.document.body.style.display = "grid";
  pendingWindow.document.body.style.placeItems = "center";
  pendingWindow.document.body.style.background = "#0b1120";
  pendingWindow.document.body.style.color = "#f8fafc";
  pendingWindow.document.body.style.fontFamily =
    "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  pendingWindow.document.body.textContent = "Opening action...";

  return pendingWindow;
}

function closePendingNavigationWindow(pendingWindow: Window | null) {
  if (!pendingWindow || pendingWindow.closed) {
    return;
  }

  pendingWindow.close();
}

function navigatePendingWindow(
  pendingWindow: Window | null,
  navigationUrl?: string,
) {
  const resolvedNavigationUrl = resolveNavigationUrl(navigationUrl);

  if (!resolvedNavigationUrl || typeof window === "undefined") {
    closePendingNavigationWindow(pendingWindow);
    return;
  }

  if (pendingWindow && !pendingWindow.closed) {
    pendingWindow.location.replace(resolvedNavigationUrl);
    return;
  }

  window.open(resolvedNavigationUrl, "_blank", "noopener,noreferrer");
}

function getSuccessfulZulipItems(
  actionItems: ActionItem[],
  executionStates: Record<string, ActionExecutionState>,
) {
  return actionItems.filter(
    (item) =>
      item.actionType === "zulip" &&
      executionStates[getActionKey(item)]?.status === "success",
  );
}

function getPendingZulipItems(
  actionItems: ActionItem[],
  executionStates: Record<string, ActionExecutionState>,
) {
  return actionItems.filter(
    (item) =>
      item.actionType === "zulip" &&
      executionStates[getActionKey(item)]?.status !== "success",
  );
}

function uniqueActionItems(items: ActionItem[]) {
  const seenKeys = new Set<string>();

  return items.filter((item) => {
    const actionKey = getActionKey(item);

    if (seenKeys.has(actionKey)) {
      return false;
    }

    seenKeys.add(actionKey);
    return true;
  });
}

function buildPreviewItems(
  actionItems: ActionItem[],
  executionStates: Record<string, ActionExecutionState>,
) {
  const joinedZulipItems = getSuccessfulZulipItems(actionItems, executionStates);
  const nonExamItems = actionItems.filter(
    (item) => item.source !== "TUMonline Exams",
  );

  return uniqueActionItems([
    ...joinedZulipItems,
    ...nonExamItems,
    ...actionItems,
  ]).slice(0, 4);
}

function getToneClasses(tone: SidebarNodeTone) {
  switch (tone) {
    case "dg":
      return "bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.42)]";
    case "dy":
      return "bg-amber-400 shadow-[0_0_16px_rgba(251,191,36,0.42)]";
    case "dr":
      return "bg-rose-400 shadow-[0_0_16px_rgba(251,113,133,0.42)]";
    default:
      return "bg-violet-400 shadow-[0_0_16px_rgba(167,139,250,0.42)]";
  }
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => (typeof entry === "string" ? [entry] : []));
}

function toCourseLinks(value: unknown): PrioritizedCourseLink[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const courseName =
      typeof entry.course_name === "string"
        ? entry.course_name
        : typeof entry.courseName === "string"
          ? entry.courseName
          : null;
    const priority = typeof entry.priority === "string" ? entry.priority : null;
    const searchUrl =
      typeof entry.search_url === "string"
        ? entry.search_url
        : typeof entry.searchUrl === "string"
          ? entry.searchUrl
          : "";

    if (!courseName || !priority) {
      return [];
    }

    return [
      {
        course_name: courseName,
        priority,
        search_url: searchUrl,
      },
    ];
  });
}

function toExamLinks(value: unknown): PrioritizedExamLink[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const examName =
      typeof entry.exam_name === "string"
        ? entry.exam_name
        : typeof entry.examName === "string"
          ? entry.examName
          : null;
    const priority = typeof entry.priority === "string" ? entry.priority : null;
    const searchUrl =
      typeof entry.search_url === "string"
        ? entry.search_url
        : typeof entry.searchUrl === "string"
          ? entry.searchUrl
          : "";

    if (!examName || !priority) {
      return [];
    }

    return [
      {
        exam_name: examName,
        priority,
        search_url: searchUrl,
      },
    ];
  });
}

function toZulipChannels(value: unknown): PrioritizedZulipChannel[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const name = typeof entry.name === "string" ? entry.name : null;
    const priority = typeof entry.priority === "string" ? entry.priority : null;

    if (!name || !priority) {
      return [];
    }

    return [{ name, priority }];
  });
}

function toLinkedCourseGroup(value: unknown) {
  if (isRecord(value)) {
    const links = toCourseLinks(value.links);

    if (links.length > 0) {
      return { links };
    }
  }

  const links = toCourseLinks(value);

  return links.length > 0 ? { links } : undefined;
}

function toLinkedExamGroup(value: unknown) {
  if (isRecord(value)) {
    const links = toExamLinks(value.links);

    if (links.length > 0) {
      return { links };
    }
  }

  const links = toExamLinks(value);

  return links.length > 0 ? { links } : undefined;
}

function toZulipStatus(value: unknown): ZulipStatus | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    status: typeof value.status === "string" ? value.status : "pending",
    subscribed: toStringArray(value.subscribed),
  };
}

function coerceExecutionResults(
  value: unknown,
): CampusCopilotExecutionResults | null {
  if (!isRecord(value)) {
    return null;
  }

  const zulipChannels = toZulipChannels(
    value.zulip_channels ?? value.zulipChannels,
  );
  const artemisCourses = toCourseLinks(
    value.artemis_courses ?? value.artemisCourses,
  );
  const tumonlineCourses = toCourseLinks(
    value.tumonline_courses ?? value.tumonlineCourses,
  );

  return {
    zulip_status: toZulipStatus(value.zulip_status ?? value.zulipStatus),
    zulip_channels: zulipChannels.length > 0 ? zulipChannels : undefined,
    artemis_courses: artemisCourses.length > 0 ? artemisCourses : undefined,
    tumonline_courses:
      tumonlineCourses.length > 0 ? tumonlineCourses : undefined,
    artemis_link: toLinkedCourseGroup(value.artemis_link ?? value.artemisLink),
    tumonline_course_link: toLinkedCourseGroup(
      value.tumonline_course_link ?? value.tumonlineCourseLink,
    ),
    tumonline_exam_link: toLinkedExamGroup(
      value.tumonline_exam_link ?? value.tumonlineExamLink,
    ),
  };
}

function coercePayload(value: unknown): CampusCopilotPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  const taskName =
    typeof value.taskName === "string"
      ? value.taskName
      : typeof value.task_name === "string"
        ? value.task_name
        : typeof value.title === "string"
          ? value.title
          : null;
  const executionResults = coerceExecutionResults(
    value.execution_results ?? value.executionResults,
  );

  if (!taskName || !executionResults) {
    return null;
  }

  return {
    taskName,
    execution_results: executionResults,
  };
}

function extractPayloadFromUnknown(value: unknown): CampusCopilotPayload | null {
  const directPayload = coercePayload(value);

  if (directPayload) {
    return directPayload;
  }

  if (typeof value === "string") {
    const trimmedValue = value.trim();

    if (
      trimmedValue.length === 0 ||
      (!trimmedValue.startsWith("{") && !trimmedValue.startsWith("["))
    ) {
      return null;
    }

    try {
      return extractPayloadFromUnknown(JSON.parse(trimmedValue) as unknown);
    } catch {
      return null;
    }
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const nestedPayload = extractPayloadFromUnknown(entry);

      if (nestedPayload) {
        return nestedPayload;
      }
    }

    return null;
  }

  if (!isRecord(value)) {
    return null;
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
    if (key in value) {
      const nestedPayload = extractPayloadFromUnknown(value[key]);

      if (nestedPayload) {
        return nestedPayload;
      }
    }
  }

  for (const nestedValue of Object.values(value)) {
    const nestedPayload = extractPayloadFromUnknown(nestedValue);

    if (nestedPayload) {
      return nestedPayload;
    }
  }

  return null;
}

function NavButton({ item }: { item: NavItem }) {
  const Icon = item.icon;
  const isDisabled = !item.active;

  return (
    <button
      type="button"
      disabled={isDisabled}
      title={isDisabled ? "Feature Roadmap: V2" : undefined}
      className={`flex w-full items-center gap-2.5 rounded-[13px] border px-3.5 py-3 text-left text-[0.95rem] transition ${
        item.active
          ? "border-[rgba(32,203,255,0.28)] bg-[var(--color-surface-bright)] text-white shadow-[inset_2px_0_0_0_var(--color-primary)]"
          : "cursor-not-allowed border-transparent text-[var(--color-on-surface-variant)] opacity-50 grayscale disabled:pointer-events-none"
      }`}
    >
      <Icon className="h-5 w-5 shrink-0" strokeWidth={1.8} />
      <span className="font-medium">{item.label}</span>
    </button>
  );
}

function Sidebar({
  courses,
  isUploading,
  nodes,
  pendingActionCount,
}: {
  courses: SidebarCourse[];
  isUploading: boolean;
  nodes: SidebarNode[];
  pendingActionCount: number;
}) {
  return (
    <aside className="hidden border-r border-[var(--color-border)] bg-[#09101d] lg:flex lg:min-h-full lg:flex-col">
      <div className="border-b border-[var(--color-border)] px-6 py-6">
        <UnifeyeLogo
          subtitle="semester onboarder"
          subtitleClassName="whitespace-nowrap text-[0.56rem] tracking-[0.1em]"
          className={isUploading ? "animate-breathe" : ""}
        />
      </div>

      <nav className="space-y-1.5 px-3 py-5" aria-label="Primary">
        {NAV_ITEMS.map((item) => (
          <NavButton key={item.id} item={item} />
        ))}
      </nav>

      <div className="px-5 pt-3">
        <div className="mb-4 font-mono text-[0.72rem] uppercase tracking-[0.22em] text-[var(--color-on-surface-variant)]">
          Active Courses
        </div>
        <div className="space-y-1.5">
          {courses.length > 0 ? (
            courses.map((course) => (
              <div
                key={course.name}
                className={`rounded-[12px] border px-3.5 py-3 ${
                  course.active
                    ? "border-[rgba(32,203,255,0.24)] bg-[var(--color-surface-bright)]"
                    : "border-[var(--color-border)] bg-[rgba(20,29,48,0.56)]"
                }`}
              >
                <div className="font-mono text-[0.72rem] uppercase tracking-[0.18em] text-[#8ab8ff]">
                  [{course.code}]
                </div>
                <div className="mt-2 text-sm leading-6 text-[var(--color-on-surface)]/90">
                  {course.name}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-[12px] border border-[var(--color-border)] bg-[rgba(20,29,48,0.56)] px-4 py-3 text-sm text-[var(--color-on-surface-variant)]">
              Upload a course document to populate the workspace.
            </div>
          )}
        </div>
      </div>

      <div className="mt-auto px-3 pb-4 pt-5">
        <div className="rounded-[15px] border border-[var(--color-border)] bg-[var(--color-surface-bright)] p-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[#0d1423]">
              <UnifeyeMark className="h-6 w-[2.25rem]" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">Campus Agent</div>
              <div className="text-xs text-[var(--color-on-surface-variant)]">
                {pendingActionCount} open actions in this workspace
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between font-mono text-[0.68rem] uppercase tracking-[0.18em] text-[var(--color-on-surface-variant)]">
          <span>System Status</span>
          <span className="text-[var(--color-primary)]">Active & synced</span>
        </div>

        <div className="mt-3 grid gap-2">
          {nodes.map((node) => (
            <div
              key={node.name}
              className="flex items-center gap-2 rounded-[12px] border border-[var(--color-border)] bg-[rgba(20,29,48,0.56)] px-3 py-2"
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${getToneClasses(node.tone)}`}
              />
              <span className="min-w-0 flex-1 truncate text-xs text-[var(--color-on-surface)]/92">
                {node.name}
              </span>
              <span className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-[var(--color-on-surface-variant)]">
                {node.badge}
              </span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

function EmptyState({
  body,
  title,
}: {
  body: string;
  title: string;
}) {
  return (
    <div className="flex min-h-[190px] flex-col items-center justify-center rounded-[16px] border border-dashed border-[var(--color-border)] bg-[rgba(20,29,48,0.44)] px-5 text-center">
      <BookOpen className="h-8 w-8 text-[var(--color-primary)]/70" strokeWidth={1.7} />
      <h3 className="mt-4 font-display text-lg font-semibold text-white">
        {title}
      </h3>
      <p className="mt-3 max-w-sm text-sm leading-6 text-[var(--color-on-surface-variant)]">
        {body}
      </p>
    </div>
  );
}

function PreviewTaskCard({
  executionState,
  item,
}: {
  executionState?: ActionExecutionState;
  item: ActionItem;
}) {
  const isZulipAction = item.actionType === "zulip";
  const isSuccess = executionState?.status === "success";
  const isZulipJoined = isZulipAction && isSuccess;
  const needsAttention =
    executionState?.status === "error" ||
    executionState?.status === "manual_action_required";

  return (
    <article
      className={`rounded-[12px] border px-3.5 py-3.5 ${
        isZulipJoined
          ? "border-emerald-300/28 bg-[linear-gradient(145deg,rgba(16,185,129,0.18),rgba(11,17,32,0.96))] shadow-[0_0_0_1px_rgba(52,211,153,0.12)]"
          : isZulipAction
            ? "border-cyan-400/20 bg-[linear-gradient(145deg,rgba(34,211,238,0.08),rgba(11,17,32,0.94))]"
            : "border-[var(--color-border)] bg-[var(--color-surface-bright)]"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 shrink-0 ${
            isSuccess
              ? "text-emerald-300"
              : needsAttention
                ? "text-rose-200"
                : "text-[var(--color-on-surface-variant)]"
          }`}
        >
          {isSuccess ? (
            <CheckCircle2 className="h-5 w-5" strokeWidth={1.9} />
          ) : needsAttention ? (
            <CircleAlert className="h-5 w-5" strokeWidth={1.9} />
          ) : (
            <Circle className="h-5 w-5" strokeWidth={1.9} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-white">{item.title}</h3>
            <PlatformBadge source={item.source} />
            {isZulipAction ? (
              <span
                className={`rounded-full border px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] ${
                  isZulipJoined
                    ? "border-emerald-300/28 bg-emerald-400/16 text-emerald-50"
                    : "border-cyan-400/22 bg-cyan-400/12 text-cyan-50"
                }`}
              >
                {isZulipJoined ? "Joined channel" : "Zulip"}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function ZulipMissionStatus({
  actionItems,
  executionStates,
  zulipStatus,
}: {
  actionItems: ActionItem[];
  executionStates: Record<string, ActionExecutionState>;
  zulipStatus: ZulipStatus;
}) {
  const joinedZulipItems = getSuccessfulZulipItems(actionItems, executionStates);
  const pendingZulipItems = getPendingZulipItems(actionItems, executionStates);
  const joinedChannels = Array.from(
    new Set([
      ...zulipStatus.subscribed,
      ...joinedZulipItems.map((item) => item.executionName),
    ]),
  );
  const latestJoinedChannel =
    joinedChannels.length > 0 ? joinedChannels[joinedChannels.length - 1] : null;
  const visibleJoinedChannels = [...joinedChannels].reverse().slice(0, 6);
  const hasJoinedChannels = joinedChannels.length > 0;

  if (!hasJoinedChannels && pendingZulipItems.length === 0) {
    return null;
  }

  return (
    <section
      className={`rounded-[20px] border p-5 md:p-6 ${
        hasJoinedChannels
          ? "border-emerald-300/28 bg-[linear-gradient(140deg,rgba(16,185,129,0.18),rgba(6,78,59,0.12),rgba(11,17,32,0.98))] shadow-[0_0_0_1px_rgba(52,211,153,0.1)]"
          : "border-cyan-400/24 bg-[linear-gradient(140deg,rgba(34,211,238,0.12),rgba(11,17,32,0.98))]"
      }`}
    >
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <div
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[0.66rem] uppercase tracking-[0.2em] ${
              hasJoinedChannels
                ? "border-emerald-300/25 bg-emerald-400/14 text-emerald-50"
                : "border-cyan-400/20 bg-cyan-400/10 text-cyan-50"
            }`}
          >
            {hasJoinedChannels ? (
              <CheckCircle2 className="h-4 w-4" strokeWidth={1.9} />
            ) : (
              <RefreshCw className="h-4 w-4" strokeWidth={1.9} />
            )}
            Zulip handoff
          </div>

          <h2 className="mt-4 font-display text-[1.9rem] font-semibold text-white md:text-[2.2rem]">
            {hasJoinedChannels
              ? joinedChannels.length === 1
                ? "Zulip channel joined"
                : `${joinedChannels.length} Zulip channels joined`
              : "Zulip channels are queued"}
          </h2>

          <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--color-on-surface)]/88">
            {hasJoinedChannels && latestJoinedChannel
              ? `You are now connected to ${latestJoinedChannel}.`
              : pendingZulipItems.length === 1
                ? "A Zulip channel is waiting to be joined. Once it lands, it will stay highlighted here."
                : `${pendingZulipItems.length} Zulip channels are waiting to be joined. Once they land, they will stay highlighted here.`}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[300px]">
          <div className="rounded-[14px] border border-white/10 bg-[rgba(255,255,255,0.05)] p-4">
            <div className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-[var(--color-on-surface-variant)]">
              Joined now
            </div>
            <div className="mt-2 text-[1.7rem] font-semibold text-white">
              {joinedChannels.length}
            </div>
          </div>

          <div className="rounded-[14px] border border-white/10 bg-[rgba(255,255,255,0.05)] p-4">
            <div className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-[var(--color-on-surface-variant)]">
              Still queued
            </div>
            <div className="mt-2 text-[1.7rem] font-semibold text-white">
              {pendingZulipItems.length}
            </div>
          </div>
        </div>
      </div>

      {visibleJoinedChannels.length > 0 ? (
        <div className="mt-5 border-t border-white/10 pt-4">
          <div className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-[var(--color-on-surface-variant)]">
            Joined channels
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {visibleJoinedChannels.map((channelName) => (
              <div
                key={channelName}
                className="inline-flex items-center gap-2 rounded-full border border-emerald-300/22 bg-emerald-400/14 px-3 py-1.5 text-sm font-medium text-emerald-50"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={1.9} />
                <span>{channelName}</span>
              </div>
            ))}

            {joinedChannels.length > visibleJoinedChannels.length ? (
              <div className="inline-flex items-center rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-sm text-[var(--color-on-surface-variant)]">
                +{joinedChannels.length - visibleJoinedChannels.length} more
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ActionCard({
  executionState,
  item,
  onExecute,
}: {
  executionState?: ActionExecutionState;
  item: ActionItem;
  onExecute: (item: ActionItem) => Promise<void>;
}) {
  const isZulipAction = item.actionType === "zulip";
  const isWorking = executionState?.status === "working";
  const isSuccess = executionState?.status === "success";
  const isZulipJoined = isZulipAction && isSuccess;
  const isManualActionRequired =
    executionState?.status === "manual_action_required";
  const hasError = executionState?.status === "error";
  const openLinkUrl = resolveNavigationUrl(
    item.searchUrl,
    executionState?.navigationUrl,
  );
  const priorityPresentation = getPriorityPresentation(item.priority);

  return (
    <article
      className={`rounded-[14px] border p-3.5 ${
        isZulipJoined
          ? "border-emerald-300/30 bg-[linear-gradient(145deg,rgba(16,185,129,0.18),rgba(11,17,32,0.98))] shadow-[0_0_0_1px_rgba(52,211,153,0.1)]"
          : isZulipAction
            ? "border-cyan-400/20 bg-[linear-gradient(145deg,rgba(34,211,238,0.08),rgba(11,17,32,0.94))]"
            : "border-[var(--color-border)] bg-[var(--color-surface-bright)]"
      }`}
    >
      <div className="flex flex-col gap-3.5 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          <div
            className={`mt-1 shrink-0 ${
              isSuccess
                ? "text-emerald-300"
                : isManualActionRequired || hasError
                  ? "text-rose-200"
                  : isWorking
                    ? "text-[var(--color-primary)]"
                    : "text-[var(--color-on-surface-variant)]"
            }`}
          >
            {isWorking ? (
              <RefreshCw className="h-5 w-5 animate-spin" strokeWidth={1.9} />
            ) : isSuccess ? (
              <CheckCircle2 className="h-5 w-5" strokeWidth={1.9} />
            ) : isManualActionRequired || hasError ? (
              <CircleAlert className="h-5 w-5" strokeWidth={1.9} />
            ) : (
              <Circle className="h-5 w-5" strokeWidth={1.9} />
            )}
          </div>

          <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="text-[0.98rem] font-semibold text-white">{item.title}</h3>
            <PlatformBadge source={item.source} />
            {isZulipAction ? (
              <span
                className={`rounded-[10px] border px-2.5 py-1 font-mono text-[0.64rem] uppercase tracking-[0.18em] ${
                    isZulipJoined
                      ? "border-emerald-300/25 bg-emerald-400/14 text-emerald-50"
                      : "border-cyan-400/20 bg-cyan-400/10 text-cyan-50"
                  }`}
                >
                  {isZulipJoined ? "Joined channel" : "Main feature"}
                </span>
              ) : null}
              <span
                className={`rounded-[10px] border px-2.5 py-1 font-mono text-[0.64rem] uppercase tracking-[0.18em] ${priorityPresentation.badgeClassName}`}
              >
                {priorityPresentation.badgeLabel}
              </span>
            </div>
            {executionState?.message ? (
              <div
                className={`mt-3 rounded-[12px] border px-3.5 py-2.5 text-sm ${
                  isZulipJoined
                    ? "border-emerald-300/24 bg-emerald-400/16 text-emerald-50"
                    : isSuccess
                      ? "border-emerald-400/18 bg-emerald-500/10 text-emerald-50"
                      : isManualActionRequired || hasError
                        ? "border-rose-400/18 bg-rose-500/10 text-rose-50"
                        : "border-[var(--color-primary)]/18 bg-[var(--color-primary)]/10 text-cyan-50"
                }`}
              >
                {executionState.message}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2.5 xl:justify-end">
        {!isSuccess ? (
          <button
            type="button"
            disabled={isWorking}
            onClick={() => void onExecute(item)}
            className="inline-flex items-center justify-center gap-2 rounded-[12px] border border-[var(--color-primary)] bg-[var(--color-primary)] px-3.5 py-2.5 text-sm font-semibold text-[#04101a] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isWorking ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                {isZulipAction ? "Joining" : "Working"}
              </>
            ) : hasError ? (
              isZulipAction ? "Retry join" : "Retry"
            ) : isManualActionRequired ? (
              isZulipAction ? "Retry join" : "Retry handoff"
            ) : (
              isZulipAction ? "Join channel" : "Execute action"
            )}
          </button>
        ) : (
          <div className="inline-flex items-center rounded-[12px] border border-emerald-400/18 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-50">
            {isZulipAction ? "Joined channel" : "Completed"}
          </div>
        )}

        {openLinkUrl ? (
          <a
            href={openLinkUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-[12px] border border-[var(--color-border)] px-3.5 py-2.5 text-sm font-semibold text-[var(--color-on-surface-variant)] transition hover:border-white/25 hover:text-white"
          >
            {getOpenLinkLabel(item, isManualActionRequired)}
            <ArrowUpRight className="h-4 w-4" />
          </a>
        ) : null}
      </div>
      </div>
    </article>
  );
}

function MatrixColumn({
  eyebrow,
  executionStates,
  items,
  onExecute,
  title,
}: {
  eyebrow: string;
  executionStates: Record<string, ActionExecutionState>;
  items: ActionItem[];
  onExecute: (item: ActionItem) => Promise<void>;
  title: string;
}) {
  return (
    <section className="rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface-container)] p-4 md:p-5">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] pb-3.5">
        <div>
          <div className="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--color-on-surface-variant)]">
            {eyebrow}
          </div>
          <h3 className="mt-2 font-display text-[1.45rem] font-semibold text-white">
            {title}
          </h3>
        </div>
        <div className="rounded-[10px] bg-[var(--color-surface-bright)] px-3 py-2 font-mono text-[0.68rem] uppercase tracking-[0.18em] text-[var(--color-on-surface-variant)]">
          {items.length} items
        </div>
      </div>

      <div className="scrollbar-custom mt-4 space-y-3 lg:max-h-[720px] lg:overflow-y-auto lg:pr-1">
        {items.length > 0 ? (
          items.map((item) => (
            <ActionCard
              key={getActionKey(item)}
              item={item}
              executionState={executionStates[getActionKey(item)]}
              onExecute={onExecute}
            />
          ))
        ) : (
          <EmptyState
            title="No actions waiting here"
            body="Upload a fresh document to repopulate this lane."
          />
        )}
      </div>
    </section>
  );
}

function LandingView({
  isUploading,
  onOpenStrategy,
  onUploadComplete,
  onUploadStateChange,
  pendingPreviewCount,
  previewItems,
  executionStates,
  statusMessage,
}: {
  executionStates: Record<string, ActionExecutionState>;
  isUploading: boolean;
  onOpenStrategy: () => void;
  onUploadComplete: (
    response: unknown,
    context: UploadContext,
  ) => Promise<void> | void;
  onUploadStateChange: (uploading: boolean) => void;
  pendingPreviewCount: number;
  previewItems: ActionItem[];
  statusMessage: string;
}) {
  return (
    <div className="space-y-5">
      <DocumentIngestion
        isUploading={isUploading}
        statusMessage={statusMessage}
        onUploadComplete={onUploadComplete}
        onUploadStateChange={onUploadStateChange}
      />

      <section className="rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface-container)] p-4 md:p-5">
        <div className="flex flex-col gap-3.5 border-b border-[var(--color-border)] pb-3.5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <ListTodo className="h-5 w-5 text-[var(--color-primary)]" strokeWidth={1.8} />
            <h2 className="font-display text-[1.85rem] font-semibold text-white">TODO</h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onOpenStrategy}
              className="inline-flex items-center justify-center gap-2 rounded-[12px] border border-[var(--color-border)] px-3.5 py-2.5 text-sm font-semibold text-[var(--color-on-surface-variant)] transition hover:border-[var(--color-primary)]/35 hover:text-white"
            >
              Open strategy matrix
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="rounded-[10px] bg-[var(--color-surface-bright)] px-3 py-1.5 font-mono text-[0.68rem] uppercase tracking-[0.18em] text-[var(--color-on-surface-variant)]">
              {pendingPreviewCount} pending
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {previewItems.length > 0 ? (
            previewItems.map((item) => (
              <PreviewTaskCard
                key={getActionKey(item)}
                item={item}
                executionState={executionStates[getActionKey(item)]}
              />
            ))
          ) : (
            <div className="xl:col-span-2">
              <EmptyState
                title="Nothing is queued yet"
                body="Upload a document to surface the live plan items."
              />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function DashboardView({
  actionItems,
  doNowItems,
  executionStates,
  actionCount,
  onExecute,
  scheduledItems,
  zulipStatus,
}: {
  actionItems: ActionItem[];
  doNowItems: ActionItem[];
  executionStates: Record<string, ActionExecutionState>;
  actionCount: number;
  onExecute: (item: ActionItem) => Promise<void>;
  scheduledItems: ActionItem[];
  zulipStatus: ZulipStatus;
}) {
  return (
    <div className="space-y-5">
      <ZulipMissionStatus
        actionItems={actionItems}
        executionStates={executionStates}
        zulipStatus={zulipStatus}
      />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--color-on-surface-variant)]">
            execution_matrix
          </div>
          <p className="mt-2 text-sm leading-7 text-[var(--color-on-surface-variant)]">
            {actionCount > 0
              ? `${actionCount} actions are split into immediate and scheduled lanes.`
              : "Upload a document to create the first execution lanes."}
          </p>
        </div>

        <div className="rounded-[10px] bg-[var(--color-surface-bright)] px-3 py-2 font-mono text-[0.72rem] uppercase tracking-[0.18em] text-[var(--color-on-surface-variant)]">
          {actionCount} open
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <MatrixColumn
          title="Urgent & Important"
          eyebrow="Do now"
          items={doNowItems}
          executionStates={executionStates}
          onExecute={onExecute}
        />
        <MatrixColumn
          title="Queue Next"
          eyebrow="Schedule"
          items={scheduledItems}
          executionStates={executionStates}
          onExecute={onExecute}
        />
      </div>
    </div>
  );
}

export function CampusCopilotDashboard({
  initialPayload,
}: {
  initialPayload: CampusCopilotPayload;
}) {
  const [payload, setPayload] = useState(initialPayload);
  const [executionStates, setExecutionStates] = useState<
    Record<string, ActionExecutionState>
  >({});
  const [zulipStatus, setZulipStatus] = useState<ZulipStatus>(() =>
    getInitialZulipStatus(initialPayload.execution_results),
  );
  const [currentView, setCurrentView] = useState<"landing" | "dashboard">(
    "landing",
  );
  const [isUploading, setIsUploading] = useState(false);
  const [statusIndex, setStatusIndex] = useState(0);

  useEffect(() => {
    if (!isUploading) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setStatusIndex((currentIndex) => (currentIndex + 1) % STATUS_MESSAGES.length);
    }, 850);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isUploading]);

  const actionItems = collectActionItems(payload.execution_results);
  const doNowItems = actionItems.filter((item) => item.priority === "do_now");
  const scheduledItems = actionItems.filter(
    (item) => item.priority === "schedule",
  );
  const previewItems = buildPreviewItems(actionItems, executionStates);
  const pendingActionCount = actionItems.filter(
    (item) => executionStates[getActionKey(item)]?.status !== "success",
  ).length;
  const pendingPreviewCount = previewItems.filter(
    (item) => executionStates[getActionKey(item)]?.status !== "success",
  ).length;
  const sidebarCourses = buildSidebarCourses(actionItems);
  const sidebarNodes = buildSidebarNodes(actionItems, executionStates, zulipStatus);

  function handleUploadStateChange(uploading: boolean) {
    setIsUploading(uploading);

    if (!uploading) {
      setStatusIndex(0);
    }
  }

  async function handleUploadComplete(response: unknown) {
    const nextPayload = extractPayloadFromUnknown(response);

    if (!nextPayload) {
      throw new Error(
        "The upload finished, but the response did not include a usable plan payload.",
      );
    }

    startTransition(() => {
      setPayload(nextPayload);
      setExecutionStates({});
      setZulipStatus(getInitialZulipStatus(nextPayload.execution_results));
      setCurrentView("dashboard");
    });
  }

  async function onExecute(item: ActionItem) {
    const actionKey = getActionKey(item);
    const pendingNavigationWindow = openPendingNavigationWindow(item.actionType);

    setExecutionStates((current) => ({
      ...current,
      [actionKey]: {
        status: "working",
        message: "Agent working...",
      },
    }));

    try {
      const response = await fetch("/api/execute-action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: item.actionType,
          name: item.executionName,
          searchUrl: item.searchUrl,
        }),
      });

      const responseJson = (await response.json().catch(() => null)) as
        | ExecuteActionResponse
        | null;

      if (!response.ok || !responseJson) {
        closePendingNavigationWindow(pendingNavigationWindow);

        setExecutionStates((current) => ({
          ...current,
          [actionKey]: {
            status:
              item.actionType === "zulip" ||
              responseJson?.status === "manual_action_required"
                ? "manual_action_required"
                : "error",
            message:
              item.actionType === "zulip"
                ? "Manual action required"
                : responseJson?.message ?? "Action failed. Please try again.",
          },
        }));
        return;
      }

      if (responseJson.status !== "success") {
        closePendingNavigationWindow(pendingNavigationWindow);

        setExecutionStates((current) => ({
          ...current,
          [actionKey]: {
            status:
              responseJson.status === "manual_action_required"
                ? "manual_action_required"
                : "error",
            message: responseJson.message,
          },
        }));
        return;
      }

      const navigationUrl = resolveNavigationUrl(
        item.searchUrl,
        responseJson.navigationUrl,
      );

      setExecutionStates((current) => ({
        ...current,
        [actionKey]: {
          status: "success",
          message: responseJson.message,
          navigationUrl,
        },
      }));

      window.requestAnimationFrame(() => {
        navigatePendingWindow(pendingNavigationWindow, navigationUrl);
      });

      if (item.actionType === "zulip") {
        setZulipStatus((current) => ({
          status: "complete",
          subscribed: current.subscribed.includes(item.executionName)
            ? current.subscribed
            : [...current.subscribed, item.executionName],
        }));
      }
    } catch {
      closePendingNavigationWindow(pendingNavigationWindow);

      setExecutionStates((current) => ({
        ...current,
        [actionKey]: {
          status:
            item.actionType === "zulip" ? "manual_action_required" : "error",
          message:
            item.actionType === "zulip"
              ? "Manual action required"
              : "Action failed. Please try again.",
        },
      }));
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-surface)] text-[var(--color-on-surface)]">
      <div className="lg:grid lg:min-h-screen lg:grid-cols-[252px_minmax(0,1fr)]">
        <Sidebar
          courses={sidebarCourses}
          isUploading={isUploading}
          nodes={sidebarNodes}
          pendingActionCount={pendingActionCount}
        />

        <main className="relative min-h-screen min-w-0 bg-[#0b1120] lg:min-h-0">
          <div className="min-h-full transition-all duration-500">
            <header className="border-b border-[var(--color-border)] px-5 py-5 md:px-8 md:py-6">
              <div className="mb-5 flex items-center justify-between gap-4 lg:hidden">
                <UnifeyeLogo
                  className={isUploading ? "animate-breathe gap-3" : "gap-3"}
                  subtitle={`${pendingActionCount} open actions`}
                />
                <div className="rounded-[10px] bg-[var(--color-surface-bright)] px-3 py-2 font-mono text-[0.68rem] uppercase tracking-[0.18em] text-[var(--color-on-surface-variant)]">
                  {currentView === "dashboard" ? "matrix" : "dashboard"}
                </div>
              </div>

              <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <h1 className="font-display text-[2.65rem] font-semibold text-white md:text-[3rem]">
                    {currentView === "dashboard" ? "Strategy Matrix" : "Dashboard"}
                  </h1>
                  <div className="mt-1 font-mono text-[0.72rem] uppercase tracking-[0.22em] text-[var(--color-on-surface-variant)]">
                    {currentView === "dashboard"
                      ? "execution_matrix"
                      : "workspace_overview"}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {currentView === "dashboard" ? (
                    <button
                      type="button"
                      onClick={() => setCurrentView("landing")}
                      className="inline-flex items-center justify-center gap-2 rounded-[12px] border border-[var(--color-border)] px-4 py-3 text-sm font-semibold text-[var(--color-on-surface-variant)] transition hover:border-white/25 hover:text-white"
                    >
                      Back to dashboard
                      <ChevronRight className="h-4 w-4 rotate-180" />
                    </button>
                  ) : null}

                  <button
                    type="button"
                    disabled
                    title="Feature Roadmap: V2"
                    className="inline-flex min-w-[216px] cursor-not-allowed items-center justify-center gap-3 rounded-[12px] border border-white/10 bg-white/[0.03] px-4 py-2.5 font-mono text-[0.82rem] font-semibold uppercase tracking-[0.18em] text-[var(--color-on-surface-variant)] opacity-50 grayscale transition shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] disabled:pointer-events-none"
                  >
                    <Lock className="h-4 w-4" strokeWidth={1.9} />
                    Roadmap / V2
                  </button>
                </div>
              </div>
            </header>

            <section className="space-y-5 px-5 pb-8 pt-5 md:px-8">
              {currentView === "landing" ? (
                <LandingView
                  executionStates={executionStates}
                  isUploading={isUploading}
                  onOpenStrategy={() => setCurrentView("dashboard")}
                  onUploadComplete={handleUploadComplete}
                  onUploadStateChange={handleUploadStateChange}
                  pendingPreviewCount={pendingPreviewCount}
                  previewItems={previewItems}
                  statusMessage={STATUS_MESSAGES[statusIndex] ?? STATUS_MESSAGES[0]}
                />
              ) : (
                <DashboardView
                  actionItems={actionItems}
                  doNowItems={doNowItems}
                  executionStates={executionStates}
                  actionCount={actionItems.length}
                  onExecute={onExecute}
                  scheduledItems={scheduledItems}
                  zulipStatus={zulipStatus}
                />
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

export default CampusCopilotDashboard;
