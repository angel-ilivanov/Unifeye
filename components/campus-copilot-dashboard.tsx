"use client";

import { startTransition, useDeferredValue, useEffect, useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Circle,
  CircleAlert,
  Eye,
  GraduationCap,
  History,
  LayoutDashboard,
  Network,
  RefreshCw,
  ScanEye,
  Search,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import DocumentIngestion from "./DocumentIngestion";

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

type StatCard = {
  label: string;
  value: number;
  delta: string;
  deltaClassName: "delta-up" | "delta-dn" | "delta-flat";
};

type UploadContext = {
  fileName: string;
};

type OverviewPanelsProps = {
  feedEntries: string[];
  nodes: SidebarNode[];
  pendingActionCount: number;
  queuePreview: string[];
  taskName: string;
};

const NAV_ITEMS: NavItem[] = [
  { id: "command", label: "Command Center", icon: LayoutDashboard, active: true },
  { id: "academics", label: "Academics", icon: GraduationCap },
  { id: "nodes", label: "Institutional Nodes", icon: Network },
  { id: "history", label: "History", icon: History },
  { id: "logs", label: "System Logs", icon: BarChart3 },
];

const STATUS_MESSAGES = [
  "[INGESTING] Analyzing uploaded document...",
  "[PARSING] Extracting deadlines and tasks...",
  "[MAPPING] Routing actions into campus systems...",
  "[SYNC] Building the next execution plan...",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isActionPriority(value: string): value is ActionPriority {
  return value === "do_now" || value === "schedule";
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

  return [...zulipItems, ...artemisItems, ...tumCourseItems, ...tumExamItems];
}

function uniqueTitles(items: ActionItem[]) {
  return Array.from(new Set(items.map((item) => item.title)));
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
        badgeLabel: "High",
        badgeClassName: "border-rose-400/20 bg-rose-500/12 text-rose-100",
        railClassName: "bg-rose-400/70",
        summaryLabel: "Execute next",
      }
    : {
        badgeLabel: "Queued",
        badgeClassName:
          "border-[var(--color-primary)]/20 bg-[var(--color-primary)]/10 text-cyan-50",
        railClassName: "bg-[var(--color-primary)]/70",
        summaryLabel: "Queue next",
      };
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

  return {
    zulip_status: toZulipStatus(value.zulip_status ?? value.zulipStatus),
    zulip_channels: toZulipChannels(value.zulip_channels ?? value.zulipChannels),
    artemis_courses: toCourseLinks(value.artemis_courses ?? value.artemisCourses),
    tumonline_courses: toCourseLinks(
      value.tumonline_courses ?? value.tumonlineCourses,
    ),
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

function matchesSearch(item: ActionItem, query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (normalizedQuery.length === 0) {
    return true;
  }

  return `${item.title} ${item.source} ${item.actionType}`
    .toLowerCase()
    .includes(normalizedQuery);
}

function NavButton({ item }: { item: NavItem }) {
  const Icon = item.icon;

  return (
    <button
      type="button"
      className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition ${
        item.active
          ? "bg-[var(--color-primary)]/8 text-[var(--color-primary)]"
          : "text-[var(--color-on-surface-variant)] hover:bg-white/5 hover:text-white"
      }`}
    >
      <Icon className="h-5 w-5" strokeWidth={1.85} />
      <span>{item.label}</span>
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
    <aside className="hidden border-r border-white/6 bg-[rgba(5,7,10,0.86)] lg:flex lg:min-h-screen lg:flex-col">
      <div className="px-8 pb-10 pt-8">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--color-primary)] text-[#03151b] ${
              isUploading ? "animate-breathe glow-cyan-strong" : "glow-cyan"
            }`}
          >
            {isUploading ? (
              <ScanEye className="h-5 w-5" strokeWidth={2} />
            ) : (
              <Eye className="h-5 w-5" strokeWidth={2} />
            )}
          </div>
          <div>
            <div className="font-display text-xl font-bold uppercase tracking-[0.2em] text-white">
              UNIFEYE
            </div>
            <div className="mt-1 text-[10px] font-mono uppercase tracking-[0.22em] text-[var(--color-on-surface-variant)]">
              Autonomous workspace
            </div>
          </div>
        </div>
      </div>

      <nav className="space-y-1 px-4" aria-label="Primary">
        {NAV_ITEMS.map((item) => (
          <NavButton key={item.id} item={item} />
        ))}
      </nav>

      <div className="mx-6 my-6 h-px bg-white/6" />

      <div className="px-6">
        <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--color-on-surface-variant)]">
          Active Courses
        </div>
        <div className="space-y-2">
          {courses.length > 0 ? (
            courses.map((course) => (
              <div
                key={course.name}
                className={`rounded-2xl border px-4 py-3 transition ${
                  course.active
                    ? "border-[var(--color-primary)]/20 bg-[var(--color-primary)]/8"
                    : "border-white/6 bg-white/[0.025]"
                }`}
              >
                <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-[var(--color-primary)]">
                  [{course.code}]
                </div>
                <div className="mt-1 text-sm text-[var(--color-on-surface-variant)]">
                  {course.name}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-white/6 bg-white/[0.025] px-4 py-3 text-sm text-[var(--color-on-surface-variant)]">
              New course actions will appear here after the first upload.
            </div>
          )}
        </div>
      </div>

      <div className="px-6 pt-8">
        <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--color-on-surface-variant)]">
          Institutional Nodes
        </div>
        <div className="space-y-2">
          {nodes.map((node) => (
            <div
              key={node.name}
              className="flex items-center gap-3 rounded-2xl border border-white/6 bg-white/[0.025] px-4 py-3"
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${getToneClasses(node.tone)}`}
              />
              <span className="flex-1 text-sm text-[var(--color-on-surface-variant)]">
                {node.name}
              </span>
              <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--color-on-surface-variant)]">
                {node.badge}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-auto px-6 pb-6 pt-8">
        <div className="glass-panel rounded-[24px] p-4">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.22em] text-[var(--color-on-surface-variant)]">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.45)]" />
            Agent online
          </div>
          <div className="mt-4 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--color-primary)]/12 text-[var(--color-primary)]">
              <Sparkles className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">
                Campus Co-Pilot
              </div>
              <div className="text-[11px] text-[var(--color-on-surface-variant)]">
                {pendingActionCount} open actions in the active plan
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function StatsRow({ stats }: { stats: StatCard[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="glass-panel rounded-[24px] px-5 py-4 shadow-[0_18px_42px_rgba(0,0,0,0.22)]"
        >
          <div className="font-mono text-3xl font-bold text-[var(--color-primary)]">
            {stat.value}
          </div>
          <div className="mt-2 text-sm font-medium text-white">{stat.label}</div>
          <div
            className={`mt-2 text-[10px] font-mono uppercase tracking-[0.22em] ${
              stat.deltaClassName === "delta-up"
                ? "text-emerald-300"
                : stat.deltaClassName === "delta-dn"
                  ? "text-rose-300"
                  : "text-[var(--color-on-surface-variant)]"
            }`}
          >
            {stat.delta}
          </div>
        </div>
      ))}
    </div>
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
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-[28px] border border-dashed border-white/10 bg-white/[0.025] px-6 text-center">
      <BookOpen className="h-8 w-8 text-[var(--color-primary)]/60" strokeWidth={1.7} />
      <h3 className="mt-5 font-display text-xl font-semibold text-white">
        {title}
      </h3>
      <p className="mt-3 max-w-sm text-sm leading-7 text-[var(--color-on-surface-variant)]">
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
  const isSuccess = executionState?.status === "success";
  const needsAttention =
    executionState?.status === "error" ||
    executionState?.status === "manual_action_required";
  const priorityPresentation = getPriorityPresentation(item.priority);

  return (
    <article className="group relative overflow-hidden rounded-[24px] border border-white/8 bg-[rgba(15,17,26,0.9)] p-5 transition hover:border-[var(--color-primary)]/20">
      <div className="absolute inset-x-0 top-0 h-px bg-[var(--color-primary)]/0 transition group-hover:bg-[var(--color-primary)]/28" />
      <div
        className={`absolute inset-y-0 right-0 w-1 ${priorityPresentation.railClassName}`}
      />

      <div className="flex items-start gap-4">
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
          <h3 className="text-base font-semibold text-white">{item.title}</h3>
          <p className="mt-2 text-[11px] font-mono uppercase tracking-[0.22em] text-[var(--color-on-surface-variant)]">
            {item.source} · {priorityPresentation.summaryLabel}
          </p>
          {executionState?.message ? (
            <p className="mt-3 text-sm text-[var(--color-on-surface-variant)]">
              {executionState.message}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <span
          className={`rounded-full border px-3 py-1 text-[10px] font-mono uppercase tracking-[0.22em] ${priorityPresentation.badgeClassName}`}
        >
          {priorityPresentation.badgeLabel}
        </span>
        <span className="text-[11px] text-[var(--color-on-surface-variant)]">
          {isSuccess
            ? "Resolved"
            : needsAttention
              ? "Needs review"
              : "Queued in plan"}
        </span>
      </div>
    </article>
  );
}

function OverviewPanels({
  feedEntries,
  nodes,
  pendingActionCount,
  queuePreview,
  taskName,
}: OverviewPanelsProps) {
  return (
    <section className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
      <div className="glass-panel rounded-[28px] p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-[var(--color-primary)]" />
            <h2 className="font-display text-lg font-semibold text-white">
              Execution Feed
            </h2>
          </div>
          <div className="rounded-full border border-white/8 bg-white/4 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.22em] text-[var(--color-on-surface-variant)]">
            {pendingActionCount} open
          </div>
        </div>
        <p className="mt-4 text-sm leading-7 text-[var(--color-on-surface-variant)]">
          Confirmed actions, joined channels, and live status handoffs settle here
          first.
        </p>
        <div className="mt-5 space-y-3">
          {feedEntries.map((entry) => (
            <div
              key={entry}
              className="flex items-center gap-3 rounded-2xl border border-white/6 bg-white/[0.03] px-4 py-3 text-sm text-white"
            >
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.42)]" />
              <span className="min-w-0 truncate">{entry}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-panel rounded-[28px] p-6">
        <div className="flex items-center gap-3">
          <BookOpen className="h-5 w-5 text-[var(--color-primary)]" />
          <h2 className="font-display text-lg font-semibold text-white">
            Task Focus
          </h2>
        </div>
        <p className="mt-4 text-sm leading-7 text-[var(--color-on-surface-variant)]">
          {taskName}
        </p>
        <div className="mt-5 space-y-3">
          {(queuePreview.length > 0 ? queuePreview : ["Waiting for plan items"]).map(
            (entry) => (
              <div
                key={entry}
                className="rounded-2xl border border-white/6 bg-white/[0.03] px-4 py-3 text-sm text-white"
              >
                {entry}
              </div>
            ),
          )}
        </div>
      </div>

      <div className="glass-panel rounded-[28px] p-6">
        <div className="flex items-center gap-3">
          <Network className="h-5 w-5 text-[var(--color-primary)]" />
          <h2 className="font-display text-lg font-semibold text-white">
            Institutional Nodes
          </h2>
        </div>
        <p className="mt-4 text-sm leading-7 text-[var(--color-on-surface-variant)]">
          Platform health stays visible even when the sidebar collapses on smaller
          screens.
        </p>
        <div className="mt-5 space-y-3">
          {nodes.map((node) => (
            <div
              key={node.name}
              className="flex items-center gap-3 rounded-2xl border border-white/6 bg-white/[0.03] px-4 py-3"
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${getToneClasses(node.tone)}`}
              />
              <span className="flex-1 text-sm text-white">{node.name}</span>
              <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--color-on-surface-variant)]">
                {node.badge}
              </span>
            </div>
          ))}
        </div>
      </div>
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
  const isWorking = executionState?.status === "working";
  const isSuccess = executionState?.status === "success";
  const isManualActionRequired =
    executionState?.status === "manual_action_required";
  const hasError = executionState?.status === "error";
  const openLinkUrl = executionState?.navigationUrl ?? item.searchUrl;
  const priorityPresentation = getPriorityPresentation(item.priority);

  return (
    <article className="group relative overflow-hidden rounded-[24px] border border-white/8 bg-[rgba(15,17,26,0.92)] p-5 transition hover:border-[var(--color-primary)]/20">
      <div className="absolute inset-x-0 top-0 h-px bg-[var(--color-primary)]/0 transition group-hover:bg-[var(--color-primary)]/28" />
      <div
        className={`absolute inset-y-0 right-0 w-1 ${priorityPresentation.railClassName}`}
      />

      <div className="flex items-start gap-4">
        <div
          className={`mt-0.5 shrink-0 ${
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
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-base font-semibold text-white">{item.title}</h3>
            <span
              className={`rounded-full border px-3 py-1 text-[10px] font-mono uppercase tracking-[0.22em] ${priorityPresentation.badgeClassName}`}
            >
              {priorityPresentation.badgeLabel}
            </span>
          </div>

          <p className="mt-2 text-[11px] font-mono uppercase tracking-[0.22em] text-[var(--color-on-surface-variant)]">
            {item.source} · {priorityPresentation.summaryLabel}
          </p>

          {executionState?.message ? (
            <div
              className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
                isSuccess
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

      <div className="mt-5 flex flex-wrap gap-3">
        {!isSuccess ? (
          <button
            type="button"
            disabled={isWorking}
            onClick={() => void onExecute(item)}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-[#02141a] transition hover:-translate-y-0.5 hover:shadow-[0_0_26px_rgba(0,209,255,0.35)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {isWorking ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Agent working
              </>
            ) : hasError ? (
              "Retry action"
            ) : isManualActionRequired ? (
              "Retry handoff"
            ) : (
              "Execute action"
            )}
          </button>
        ) : (
          <div className="inline-flex items-center rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-50">
            Completed
          </div>
        )}

        {openLinkUrl ? (
          <a
            href={openLinkUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-[var(--color-on-surface-variant)] transition hover:border-white/20 hover:bg-white/4 hover:text-white"
          >
            {isManualActionRequired ? "Open manually" : "Open link"}
            <ArrowUpRight className="h-4 w-4" />
          </a>
        ) : null}
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
    <section className="glass-panel rounded-[28px] p-6 md:p-8">
      <div className="flex items-center justify-between gap-3 border-b border-white/6 pb-5">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--color-primary)]">
            {eyebrow}
          </div>
          <h3 className="mt-2 font-display text-2xl font-semibold text-white">
            {title}
          </h3>
        </div>
        <div className="rounded-full border border-white/8 bg-white/4 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.22em] text-[var(--color-on-surface-variant)]">
          {items.length} visible
        </div>
      </div>

      <div className="scrollbar-custom mt-6 space-y-4 lg:max-h-[760px] lg:overflow-y-auto lg:pr-2">
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
            body="Adjust the search filter or upload a fresh document to repopulate this lane."
          />
        )}
      </div>
    </section>
  );
}

function LandingView({
  filteredActionCount,
  onOpenStrategy,
  onUploadComplete,
  onUploadStateChange,
  overviewProps,
  pendingActionCount,
  previewItems,
  executionStates,
  isUploading,
  statusMessage,
}: {
  executionStates: Record<string, ActionExecutionState>;
  filteredActionCount: number;
  isUploading: boolean;
  onOpenStrategy: () => void;
  onUploadComplete: (
    response: unknown,
    context: UploadContext,
  ) => Promise<void> | void;
  onUploadStateChange: (uploading: boolean) => void;
  overviewProps: OverviewPanelsProps;
  pendingActionCount: number;
  previewItems: ActionItem[];
  statusMessage: string;
}) {
  return (
    <div className="space-y-10">
      <DocumentIngestion
        isUploading={isUploading}
        statusMessage={statusMessage}
        onUploadComplete={onUploadComplete}
        onUploadStateChange={onUploadStateChange}
      />

      <section className="glass-panel rounded-[28px] p-6 md:p-8">
        <div className="flex flex-col gap-4 border-b border-white/6 pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-[var(--color-primary)]" />
              <h2 className="font-display text-2xl font-semibold text-white">
                Todo Preview
              </h2>
            </div>
            <p className="mt-3 text-sm leading-7 text-[var(--color-on-surface-variant)]">
              {filteredActionCount > 0
                ? `${filteredActionCount} actions are visible in the current plan. Move into the strategy matrix when you want to execute them.`
                : "No visible actions match the current filter yet."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-full border border-white/8 bg-white/4 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.22em] text-[var(--color-on-surface-variant)]">
              {pendingActionCount} pending
            </div>
            <button
              type="button"
              onClick={onOpenStrategy}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--color-primary)]/20 px-4 py-2 text-sm font-semibold text-[var(--color-primary)] transition hover:bg-[var(--color-primary)]/8"
            >
              Open strategy matrix
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
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
                body="Upload a document or clear the current filter to surface the live plan items."
              />
            </div>
          )}
        </div>
      </section>

      <OverviewPanels {...overviewProps} />
    </div>
  );
}

function DashboardView({
  doNowItems,
  executionStates,
  filteredActionCount,
  onExecute,
  overviewProps,
  scheduledItems,
  searchQuery,
}: {
  doNowItems: ActionItem[];
  executionStates: Record<string, ActionExecutionState>;
  filteredActionCount: number;
  onExecute: (item: ActionItem) => Promise<void>;
  overviewProps: OverviewPanelsProps;
  scheduledItems: ActionItem[];
  searchQuery: string;
}) {
  return (
    <div className="space-y-10">
      <section className="glass-panel rounded-[28px] p-6 md:p-8">
        <div className="border-b border-white/6 pb-6">
          <div className="flex items-center gap-3">
            <LayoutDashboard className="h-5 w-5 text-[var(--color-primary)]" />
            <h2 className="font-display text-2xl font-semibold text-white">
              Strategy Matrix
            </h2>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--color-on-surface-variant)]">
            {searchQuery.trim().length > 0
              ? `${filteredActionCount} actions match the current filter. Urgent and deferred lanes stay separate so the next move is still obvious.`
              : "Urgent and deferred lanes stay separate so the next move is obvious at a glance while the backend logic keeps routing through the same action endpoints."}
          </p>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
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
      </section>

      <OverviewPanels {...overviewProps} />
    </div>
  );
}

function PlanReadyModal({
  actionCount,
  courseLabel,
  fileName,
  onConfirm,
  onDismiss,
  scheduledCount,
  taskName,
  urgentCount,
}: {
  actionCount: number;
  courseLabel: string;
  fileName: string | null;
  onConfirm: () => void;
  onDismiss: () => void;
  scheduledCount: number;
  taskName: string;
  urgentCount: number;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6 backdrop-blur-md">
      <div className="glass-panel w-full max-w-xl rounded-[32px] p-8 shadow-[0_36px_120px_rgba(0,0,0,0.55)]">
        <div className="flex items-center gap-3 text-[var(--color-primary)]">
          <Sparkles className="h-5 w-5" />
          <div className="font-mono text-xs font-semibold uppercase tracking-[0.28em]">
            Strategic Plan Ready
          </div>
        </div>

        <h2 className="mt-5 font-display text-3xl font-semibold text-white">
          The new workspace plan is ready to initiate.
        </h2>

        <p className="mt-4 text-sm leading-7 text-[var(--color-on-surface-variant)]">
          {fileName ? `${fileName} ` : "The latest document "}
          was parsed into a fresh task graph and routed into the command center.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
            <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-[var(--color-on-surface-variant)]">
              Course Signal
            </div>
            <div className="mt-2 text-xl font-semibold text-white">
              {courseLabel}
            </div>
          </div>
          <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
            <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-[var(--color-on-surface-variant)]">
              Open Actions
            </div>
            <div className="mt-2 text-xl font-semibold text-white">
              {actionCount}
            </div>
          </div>
          <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
            <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-[var(--color-on-surface-variant)]">
              Urgent Split
            </div>
            <div className="mt-2 text-xl font-semibold text-white">
              {urgentCount}/{scheduledCount}
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-[24px] border border-[var(--color-primary)]/16 bg-[var(--color-primary)]/8 p-5">
          <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-[var(--color-primary)]">
            Active Brief
          </div>
          <p className="mt-3 text-sm leading-7 text-cyan-50">{taskName}</p>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[var(--color-primary)] px-5 py-3 text-sm font-semibold text-[#02141a] transition hover:-translate-y-0.5 hover:shadow-[0_0_28px_rgba(0,209,255,0.35)]"
          >
            Initiate plan
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex flex-1 items-center justify-center rounded-full border border-white/12 px-5 py-3 text-sm font-semibold text-[var(--color-on-surface-variant)] transition hover:border-white/20 hover:bg-white/4 hover:text-white"
          >
            Add more files
          </button>
        </div>
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
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [statusIndex, setStatusIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [lastUploadFileName, setLastUploadFileName] = useState<string | null>(
    null,
  );

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
  const visibleActionItems =
    deferredSearchQuery.trim().length === 0
      ? actionItems
      : actionItems.filter((item) => matchesSearch(item, deferredSearchQuery));
  const doNowItems = visibleActionItems.filter((item) => item.priority === "do_now");
  const scheduledItems = visibleActionItems.filter(
    (item) => item.priority === "schedule",
  );
  const previewItems = visibleActionItems.slice(0, 4);
  const pendingActionCount = actionItems.filter(
    (item) => executionStates[getActionKey(item)]?.status !== "success",
  ).length;
  const completedActionCount = actionItems.length - pendingActionCount;
  const sidebarCourses = buildSidebarCourses(actionItems);
  const sidebarNodes = buildSidebarNodes(actionItems, executionStates, zulipStatus);
  const queuePreview = uniqueTitles(actionItems).slice(0, 4);
  const completedFeedEntries = actionItems
    .filter((item) => executionStates[getActionKey(item)]?.status === "success")
    .map((item) => `${item.source}: ${item.title}`);
  const feedEntries =
    completedFeedEntries.length > 0
      ? completedFeedEntries.slice(0, 4)
      : zulipStatus.subscribed.length > 0
        ? zulipStatus.subscribed.slice(0, 4)
        : ["Waiting for the first confirmed handoff"];
  const urgentCount = actionItems.filter((item) => item.priority === "do_now").length;
  const scheduledCount = actionItems.filter(
    (item) => item.priority === "schedule",
  ).length;
  const stats: StatCard[] = [
    {
      label: "Open actions",
      value: pendingActionCount,
      delta: `${urgentCount} urgent now`,
      deltaClassName: urgentCount > 0 ? "delta-dn" : "delta-flat",
    },
    {
      label: "Scheduled",
      value: scheduledCount,
      delta: "calendar-ready queue",
      deltaClassName: "delta-flat",
    },
    {
      label: "Zulip channels",
      value: zulipStatus.subscribed.length,
      delta:
        zulipStatus.status === "complete" ? "stream sync complete" : "waiting for sync",
      deltaClassName:
        zulipStatus.status === "complete" ? "delta-up" : "delta-flat",
    },
    {
      label: "Completed",
      value: completedActionCount,
      delta:
        completedActionCount > 0
          ? "autonomous follow-through"
          : "no actions resolved yet",
      deltaClassName: completedActionCount > 0 ? "delta-up" : "delta-flat",
    },
  ];
  const overviewProps: OverviewPanelsProps = {
    feedEntries,
    nodes: sidebarNodes,
    pendingActionCount,
    queuePreview,
    taskName: payload.taskName,
  };

  function handleUploadStateChange(uploading: boolean) {
    setIsUploading(uploading);

    if (!uploading) {
      setStatusIndex(0);
    }
  }

  async function handleUploadComplete(
    response: unknown,
    context: UploadContext,
  ) {
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
      setCurrentView("landing");
      setIsPlanModalOpen(true);
      setLastUploadFileName(context.fileName);
      setSearchQuery("");
    });
  }

  function handleResetSync() {
    startTransition(() => {
      setExecutionStates({});
      setZulipStatus(getInitialZulipStatus(payload.execution_results));
    });
  }

  async function onExecute(item: ActionItem) {
    const actionKey = getActionKey(item);

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
        }),
      });

      const responseJson = (await response.json().catch(() => null)) as
        | ExecuteActionResponse
        | null;

      if (!response.ok || !responseJson) {
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

      setExecutionStates((current) => ({
        ...current,
        [actionKey]: {
          status: "success",
          message: responseJson.message,
          navigationUrl: responseJson.navigationUrl ?? item.searchUrl,
        },
      }));

      if (item.actionType === "zulip") {
        setZulipStatus((current) => ({
          status: "complete",
          subscribed: current.subscribed.includes(item.executionName)
            ? current.subscribed
            : [...current.subscribed, item.executionName],
        }));
      }
    } catch {
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
      <div className="lg:grid lg:min-h-screen lg:grid-cols-[280px_minmax(0,1fr)]">
        <Sidebar
          courses={sidebarCourses}
          isUploading={isUploading}
          nodes={sidebarNodes}
          pendingActionCount={pendingActionCount}
        />

        <main className="relative min-w-0">
          <div
            className={`min-h-screen transition-all duration-700 ${
              isPlanModalOpen ? "scale-[0.985] blur-[8px] opacity-45" : ""
            }`}
          >
            <header className="border-b border-white/6 px-6 pb-6 pt-6 md:px-10 md:pb-8 md:pt-10">
              <div className="mb-6 flex items-center justify-between gap-4 lg:hidden">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--color-primary)] text-[#03151b] ${
                      isUploading ? "animate-breathe glow-cyan-strong" : "glow-cyan"
                    }`}
                  >
                    {isUploading ? (
                      <ScanEye className="h-5 w-5" strokeWidth={2} />
                    ) : (
                      <Eye className="h-5 w-5" strokeWidth={2} />
                    )}
                  </div>
                  <div>
                    <div className="font-display text-lg font-semibold tracking-[0.2em] text-white">
                      UNIFEYE
                    </div>
                    <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-[var(--color-on-surface-variant)]">
                      {pendingActionCount} open actions
                    </div>
                  </div>
                </div>
                <div className="rounded-full border border-white/8 bg-white/4 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.22em] text-[var(--color-on-surface-variant)]">
                  Live
                </div>
              </div>

              <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                <div className="max-w-3xl">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[var(--color-primary)]">
                    Autonomous academic orchestration
                  </div>
                  <h1 className="mt-4 font-display text-4xl font-semibold text-white md:text-5xl">
                    {currentView === "dashboard"
                      ? "Strategy Command"
                      : "Command Center"}
                  </h1>
                  <p className="mt-5 text-sm leading-8 text-[var(--color-on-surface-variant)] md:text-base">
                    {payload.taskName}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setCurrentView((currentViewState) =>
                        currentViewState === "dashboard" ? "landing" : "dashboard",
                      )
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--color-primary)]/20 px-4 py-2 text-sm font-semibold text-[var(--color-primary)] transition hover:bg-[var(--color-primary)]/8"
                  >
                    {currentView === "dashboard"
                      ? "Back to intake"
                      : "Open strategy matrix"}
                    <ChevronRight
                      className={`h-4 w-4 transition ${
                        currentView === "dashboard" ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  <button
                    type="button"
                    onClick={handleResetSync}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-[var(--color-on-surface-variant)] transition hover:border-white/20 hover:bg-white/4 hover:text-white"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Sync all platforms
                  </button>
                </div>
              </div>

              {currentView === "dashboard" ? (
                <div className="mt-8">
                  <StatsRow stats={stats} />
                </div>
              ) : null}
            </header>

            <section className="px-6 pb-44 pt-8 md:px-10">
              {currentView === "landing" ? (
                <LandingView
                  executionStates={executionStates}
                  filteredActionCount={visibleActionItems.length}
                  isUploading={isUploading}
                  onOpenStrategy={() => setCurrentView("dashboard")}
                  onUploadComplete={handleUploadComplete}
                  onUploadStateChange={handleUploadStateChange}
                  overviewProps={overviewProps}
                  pendingActionCount={pendingActionCount}
                  previewItems={previewItems}
                  statusMessage={STATUS_MESSAGES[statusIndex] ?? STATUS_MESSAGES[0]}
                />
              ) : (
                <DashboardView
                  doNowItems={doNowItems}
                  executionStates={executionStates}
                  filteredActionCount={visibleActionItems.length}
                  onExecute={onExecute}
                  overviewProps={overviewProps}
                  scheduledItems={scheduledItems}
                  searchQuery={searchQuery}
                />
              )}
            </section>
          </div>

          <div className="pointer-events-none fixed bottom-5 left-4 right-4 z-40 lg:left-[calc(280px+2.5rem)] lg:right-10">
            <div className="glass-panel pointer-events-auto mx-auto flex max-w-4xl items-center gap-3 rounded-[24px] px-4 py-3 shadow-[0_30px_90px_rgba(0,0,0,0.45)]">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                <Search className="h-5 w-5" strokeWidth={1.8} />
              </div>

              <div className="min-w-0 flex-1">
                <label htmlFor="plan-filter" className="sr-only">
                  Filter tasks
                </label>
                <input
                  id="plan-filter"
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Filter tasks, courses, or platforms..."
                  className="w-full bg-transparent text-sm text-white outline-none placeholder:text-[var(--color-on-surface-variant)]/60 md:text-base"
                />
              </div>

              <div className="hidden rounded-full border border-white/8 bg-white/4 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.22em] text-[var(--color-on-surface-variant)] sm:block">
                {visibleActionItems.length}/{actionItems.length} visible
              </div>

              {searchQuery.trim().length > 0 ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-[var(--color-on-surface-variant)] transition hover:border-white/20 hover:bg-white/4 hover:text-white"
                >
                  Clear
                </button>
              ) : (
                <div className="rounded-full border border-white/8 bg-white/4 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.22em] text-[var(--color-on-surface-variant)]">
                  Live filter
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {isPlanModalOpen ? (
        <PlanReadyModal
          actionCount={actionItems.length}
          courseLabel={sidebarCourses[0]?.code ?? "PLAN"}
          fileName={lastUploadFileName}
          onConfirm={() => {
            setIsPlanModalOpen(false);
            setCurrentView("dashboard");
          }}
          onDismiss={() => setIsPlanModalOpen(false)}
          scheduledCount={scheduledCount}
          taskName={payload.taskName}
          urgentCount={urgentCount}
        />
      ) : null}
    </div>
  );
}

export default CampusCopilotDashboard;
