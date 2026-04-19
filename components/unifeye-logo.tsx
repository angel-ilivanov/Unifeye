type UnifeyeMarkProps = {
  className?: string;
};

type UnifeyeLogoProps = {
  className?: string;
  subtitle?: string;
  subtitleClassName?: string;
};

export function UnifeyeMark({ className = "h-8 w-[3rem]" }: UnifeyeMarkProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 72 48"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M4 24C10.8 13.3333 21.4667 8 36 8C50.5333 8 61.2 13.3333 68 24C61.2 34.6667 50.5333 40 36 40C21.4667 40 10.8 34.6667 4 24Z"
        fill="#19CBFF"
      />
      <circle cx="36" cy="24" r="10.5" fill="#09101C" />
      <circle cx="36" cy="24" r="3.75" fill="#19CBFF" />
    </svg>
  );
}

export default function UnifeyeLogo({
  className = "",
  subtitle,
  subtitleClassName = "",
}: UnifeyeLogoProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <UnifeyeMark className="h-8 w-[3rem]" />
      <div className="min-w-0">
        <div className="font-display text-[1.75rem] font-bold tracking-[0.08em] text-[#E7EBFB]">
          UNIFEYE
        </div>
        {subtitle ? (
          <div
            className={`font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--color-on-surface-variant)] ${subtitleClassName}`}
          >
            {subtitle}
          </div>
        ) : null}
      </div>
    </div>
  );
}
