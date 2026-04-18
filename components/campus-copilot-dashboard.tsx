"use client";

import type { SVGProps } from "react";

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

type ZulipStatus = {
  status: string;
  subscribed: string[];
};

export type CampusCopilotPayload = {
  taskName: string;
  execution_results: {
    zulip_status: ZulipStatus;
    artemis_link: { links: PrioritizedCourseLink[] };
    tumonline_course_link: { links: PrioritizedCourseLink[] };
    tumonline_exam_link: { links: PrioritizedExamLink[] };
  };
};

type ActionPriority = "do_now" | "schedule";

type ActionItem = {
  title: string;
  priority: ActionPriority;
  searchUrl: string;
  source: "Artemis" | "TUMonline Courses" | "TUMonline Exams";
  ctaLabel: "Execute" | "Enroll";
};

type IconProps = SVGProps<SVGSVGElement>;

const NAV_ITEMS = [
  "Command Center",
  "Academics",
  "Institutional Nodes",
  "History",
  "System Logs",
];

function isActionPriority(value: string): value is ActionPriority {
  return value === "do_now" || value === "schedule";
}

function collectActionItems(
  executionResults: CampusCopilotPayload["execution_results"],
): ActionItem[] {
  const artemisItems = executionResults.artemis_link.links
    .filter((item) => isActionPriority(item.priority))
    .map<ActionItem>((item) => ({
      title: item.course_name,
      priority: item.priority,
      searchUrl: item.search_url,
      source: "Artemis",
      ctaLabel: "Execute",
    }));

  const tumCourseItems = executionResults.tumonline_course_link.links
    .filter((item) => isActionPriority(item.priority))
    .map<ActionItem>((item) => ({
      title: item.course_name,
      priority: item.priority,
      searchUrl: item.search_url,
      source: "TUMonline Courses",
      ctaLabel: "Enroll",
    }));

  const tumExamItems = executionResults.tumonline_exam_link.links
    .filter((item) => isActionPriority(item.priority))
    .map<ActionItem>((item) => ({
      title: item.exam_name,
      priority: item.priority,
      searchUrl: item.search_url,
      source: "TUMonline Exams",
      ctaLabel: "Execute",
    }));

  return [...artemisItems, ...tumCourseItems, ...tumExamItems];
}

function uniqueTitles(items: ActionItem[]) {
  return Array.from(new Set(items.map((item) => item.title)));
}

function BrandMarkIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
      <path
        d="M16 7.5C8.8 7.5 3.74 12.12 2 16c1.74 3.88 6.8 8.5 14 8.5S28.26 19.88 30 16c-1.74-3.88-6.8-8.5-14-8.5Z"
        className="fill-current"
      />
      <circle cx="16" cy="16" r="5.2" className="fill-slate-950" />
      <circle cx="16" cy="16" r="2.4" className="fill-current" />
    </svg>
  );
}

function ArrowUpRightIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path
        d="M6.25 13.75 13.75 6.25M8 6.25h5.75V12"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function RefreshIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path
        d="M15.83 8.33A6 6 0 0 0 5.15 5.8M4.17 11.67a6 6 0 0 0 10.68 2.54M14.58 4.58v3.75h-3.75M5.42 15.42v-3.75h3.75"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function SuccessIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <circle cx="10" cy="10" r="8" className="fill-current opacity-15" />
      <path
        d="m6.7 10.2 2.16 2.24 4.44-4.9"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function DotIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 8 8" fill="none" aria-hidden="true" {...props}>
      <circle cx="4" cy="4" r="4" className="fill-current" />
    </svg>
  );
}

function ActionCard({ item }: { item: ActionItem }) {
  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex rounded-full border border-sky-100 bg-sky-50 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-sky-700">
            {item.source}
          </span>
          <span className="inline-flex rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-gray-600">
            {item.priority === "do_now" ? "Do now" : "Schedule"}
          </span>
        </div>

        <div>
          <h3 className="text-base font-semibold tracking-[-0.02em] text-slate-950 sm:text-lg">
            {item.title}
          </h3>
          <p className="mt-1 font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.2em] text-slate-500">
            Ready for autonomous follow-through
          </p>
        </div>

        <a
          href={item.searchUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          {item.ctaLabel}
          <ArrowUpRightIcon className="h-4 w-4" />
        </a>
      </div>
    </article>
  );
}

function EmptyQuadrantState({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 px-5 py-8 text-center">
      <p className="text-sm font-medium text-slate-200">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-400">{body}</p>
    </div>
  );
}

function MatrixQuadrant({
  title,
  eyebrow,
  items,
  placeholder,
}: {
  title: string;
  eyebrow: string;
  items: ActionItem[];
  placeholder?: boolean;
}) {
  return (
    <section className="rounded-[24px] border border-white/10 bg-slate-950/60 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.28em] text-slate-500">
            {eyebrow}
          </p>
          <h3 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-white">
            {title}
          </h3>
        </div>
        <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-300">
          {placeholder ? "MVP placeholder" : `${items.length} items`}
        </span>
      </div>

      <div className="mt-5 space-y-3">
        {placeholder ? (
          <EmptyQuadrantState
            title="Reserved for the next iteration"
            body="This quadrant stays intentionally empty in the MVP while the autonomous agent focuses on urgent and scheduled academic actions."
          />
        ) : items.length > 0 ? (
          items.map((item) => (
            <ActionCard key={`${item.source}-${item.searchUrl}`} item={item} />
          ))
        ) : (
          <EmptyQuadrantState
            title="No actions waiting here"
            body="When the payload marks an item as relevant for this quadrant, it will appear here with a direct execution link."
          />
        )}
      </div>
    </section>
  );
}

function AgentActionLog({
  zulipStatus,
  taskName,
  actionCount,
}: {
  zulipStatus: ZulipStatus;
  taskName: string;
  actionCount: number;
}) {
  const hasJoinedChannels =
    zulipStatus.status === "complete" && zulipStatus.subscribed.length > 0;

  return (
    <aside className="rounded-[28px] border border-white/5 bg-slate-900/70 p-5 shadow-2xl shadow-slate-950/20 lg:sticky lg:top-8">
      <div className="border-b border-white/5 pb-5">
        <p className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.28em] text-slate-500">
          Agent Action Log
        </p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.04em] text-white">
              Execution feed
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              Real-time outcome summary for {taskName}.
            </p>
          </div>
          <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-300">
            {actionCount} open
          </span>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {hasJoinedChannels ? (
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-emerald-100 p-2 text-emerald-600">
                <SuccessIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-emerald-700">Success</p>
                <p className="mt-1 text-sm leading-6 text-emerald-900">
                  Your Campus Co-Pilot autonomously joined the following Zulip
                  channels:
                </p>
                <ul className="mt-4 space-y-2">
                  {zulipStatus.subscribed.map((channel) => (
                    <li
                      key={channel}
                      className="flex items-center gap-2 text-sm text-emerald-700"
                    >
                      <DotIcon className="h-2 w-2 text-emerald-500" />
                      <span>{channel}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-slate-900">
              Zulip synchronization pending
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              A success notification will appear here once the autonomous join
              flow completes.
            </p>
          </div>
        )}

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.22em] text-slate-500">
            Task focus
          </p>
          <p className="mt-3 text-base font-semibold tracking-[-0.02em] text-slate-950">
            {taskName}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            The matrix is populated directly from Artemis and TUMonline action
            links in the execution payload.
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.22em] text-slate-500">
            Pipeline summary
          </p>
          <div className="mt-4 space-y-3 text-sm text-slate-700">
            <div className="flex items-center justify-between gap-3">
              <span>Autonomous actions discovered</span>
              <span className="font-semibold text-slate-950">{actionCount}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Zulip status</span>
              <span
                className={`font-semibold ${
                  zulipStatus.status === "complete"
                    ? "text-emerald-600"
                    : "text-slate-500"
                }`}
              >
                {zulipStatus.status}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Subscribed channels</span>
              <span className="font-semibold text-slate-950">
                {zulipStatus.subscribed.length}
              </span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function CampusCopilotDashboard({
  payload,
}: {
  payload: CampusCopilotPayload;
}) {
  const actionItems = collectActionItems(payload.execution_results);
  const doNowItems = actionItems.filter((item) => item.priority === "do_now");
  const scheduledItems = actionItems.filter(
    (item) => item.priority === "schedule",
  );
  const highlights = uniqueTitles(actionItems).slice(0, 4);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="grid min-h-screen lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="flex flex-col border-r border-white/5 bg-slate-950/95">
          <div className="border-b border-white/5 px-8 py-7">
            <div className="flex items-center gap-4">
              <BrandMarkIcon className="h-10 w-10 text-sky-400" />
              <div>
                <p className="text-2xl font-semibold tracking-[0.16em] text-white">
                  UNIFEYE
                </p>
                <p className="mt-1 font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.24em] text-slate-500">
                  Campus co-pilot
                </p>
              </div>
            </div>
          </div>

          <nav className="px-4 py-6">
            <ul className="space-y-2">
              {NAV_ITEMS.map((item, index) => {
                const isActive = index === 0;

                return (
                  <li key={item}>
                    <div
                      className={`flex items-center gap-3 rounded-r-2xl border px-5 py-4 transition ${
                        isActive
                          ? "border-sky-400/30 bg-slate-900 text-sky-300 shadow-lg shadow-sky-500/10"
                          : "border-transparent bg-transparent text-slate-400 hover:border-white/5 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <span className="h-2.5 w-2.5 rounded-full bg-current" />
                      <span className="text-lg tracking-[-0.02em]">{item}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="px-8 pt-6">
            <p className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.28em] text-slate-500">
              Active queue
            </p>
            <div className="mt-4 space-y-2">
              {highlights.length > 0 ? (
                highlights.map((title) => (
                  <div
                    key={title}
                    className="rounded-2xl border border-white/5 bg-slate-900/70 px-4 py-3"
                  >
                    <p className="text-sm font-medium leading-6 text-slate-200">
                      {title}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 bg-slate-900/40 px-4 py-6">
                  <p className="text-sm leading-6 text-slate-400">
                    No course or exam actions have been discovered yet.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="mt-auto border-t border-white/5 bg-black/20 p-7">
            <div className="rounded-3xl border border-white/5 bg-slate-900/80 p-4">
              <p className="text-lg font-semibold tracking-[-0.02em] text-white">
                Campus Co-Pilot
              </p>
              <p className="mt-1 text-sm text-slate-400">
                Autonomous orchestration layer
              </p>
              <div className="mt-6 flex items-center justify-between gap-3 text-sm">
                <span className="font-[family-name:var(--font-mono)] uppercase tracking-[0.18em] text-slate-500">
                  System status
                </span>
                <span className="text-sky-300">Active &amp; synced</span>
              </div>
            </div>
          </div>
        </aside>

        <main className="flex min-h-screen flex-col">
          <header className="border-b border-white/5 px-6 py-6 sm:px-8">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <h1 className="text-4xl font-semibold tracking-[-0.05em] text-white sm:text-5xl">
                  Dashboard
                </h1>
                <p className="mt-2 font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.28em] text-slate-500">
                  Workspace. Overview
                </p>
                <p className="mt-6 max-w-2xl text-lg text-slate-300">
                  {payload.taskName}
                </p>
              </div>

              <button
                type="button"
                className="inline-flex items-center justify-center gap-3 rounded-2xl border border-sky-400/80 px-6 py-4 text-sm font-medium uppercase tracking-[0.24em] text-sky-300 transition hover:bg-sky-400/10"
              >
                <RefreshIcon className="h-5 w-5" />
                Sync all platforms
              </button>
            </div>
          </header>

          <div className="flex-1 px-6 py-8 sm:px-8">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(320px,3fr)]">
              <section className="rounded-[28px] border border-white/5 bg-slate-900/70 p-5 shadow-2xl shadow-slate-950/20 sm:p-6">
                <div className="border-b border-white/5 pb-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.28em] text-slate-500">
                        Command center
                      </p>
                      <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">
                        Eisenhower Matrix
                      </h2>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                        Autonomous outputs from Artemis and TUMonline are
                        routed into the active quadrants so the next action is
                        obvious at a glance.
                      </p>
                    </div>
                    <span className="inline-flex h-fit rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-300">
                      {actionItems.length} pending
                    </span>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 xl:grid-cols-2">
                  <MatrixQuadrant
                    title="Urgent & Important"
                    eyebrow="Do now"
                    items={doNowItems}
                  />
                  <MatrixQuadrant
                    title="Not Urgent but Important"
                    eyebrow="Schedule"
                    items={scheduledItems}
                  />
                  <MatrixQuadrant
                    title="Urgent but Not Important"
                    eyebrow="Delegate"
                    items={[]}
                    placeholder
                  />
                  <MatrixQuadrant
                    title="Not Urgent & Not Important"
                    eyebrow="Eliminate"
                    items={[]}
                    placeholder
                  />
                </div>
              </section>

              <AgentActionLog
                zulipStatus={payload.execution_results.zulip_status}
                taskName={payload.taskName}
                actionCount={actionItems.length}
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default CampusCopilotDashboard;
