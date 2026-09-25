/* AM2050 — Modern Civic Tech Wordmark: High-impact, minimalist, memorable typographic identity like J-CONNECT. */
import { LogoMark } from "@/components/brand/LogoMark";

type WordmarkLogoProps = {
  theme?: "light" | "dark" | "auto";
  variant?: "horizontal" | "compact" | "stacked" | "mark-only" | "text-only";
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  showSubtitle?: boolean;
  className?: string;
  badgeTheme?: "emerald" | "navy";
  showDot?: boolean;
  subtitleText?: string;
  showTagline?: boolean;
  taglineText?: string;
};

const sizes = {
  xs: { badge: 28, text: "text-sm", sub: "text-[0.52rem]", dot: "size-1", gap: "gap-2" },
  sm: { badge: 34, text: "text-base", sub: "text-[0.58rem]", dot: "size-1.5", gap: "gap-2.5" },
  md: { badge: 40, text: "text-xl", sub: "text-[0.62rem]", dot: "size-1.5", gap: "gap-3" },
  lg: { badge: 48, text: "text-2xl", sub: "text-[0.68rem]", dot: "size-2", gap: "gap-3.5" },
  xl: { badge: 60, text: "text-3xl", sub: "text-[0.78rem]", dot: "size-2.5", gap: "gap-4" },
};

export function WordmarkLogo({
  theme = "auto",
  variant = "horizontal",
  size = "md",
  showSubtitle = true,
  className = "",
  badgeTheme = "emerald",
  showDot = true,
  subtitleText = "AREWA MISSION 2050",
  showTagline = false,
  taglineText = "ZERO OUT-OF-SCHOOL CHILDREN IN AREWA BY 2050",
}: WordmarkLogoProps) {
  const s = sizes[size] || sizes.md;

  const isDark = theme === "dark";
  const primaryTextColor = isDark ? "text-white" : "text-[#123148]";
  const accentTextColor = isDark ? "text-[#34d399]" : "text-[#167a4c]";
  const subtitleColor = isDark ? "text-[#9cc8ae]" : "text-[#167a4c]";

  // Mark Only
  if (variant === "mark-only") {
    return <LogoMark size={s.badge} theme={badgeTheme} showDot={showDot} className={className} />;
  }

  // Pure Text Wordmark (without badge)
  if (variant === "text-only") {
    return (
      <div className={`inline-flex flex-col leading-none ${className}`}>
        <div className="flex items-baseline tracking-tight font-display">
          <span className={`font-extrabold ${primaryTextColor} ${s.text}`}>AM</span>
          <span className={`font-black ml-0.5 ${accentTextColor} ${s.text}`}>2050</span>
          {showDot && <span className={`ml-1.5 ${s.dot} rounded-full bg-[#f59e0b] self-center shrink-0`}></span>}
        </div>
        {showSubtitle && (
          <span className={`mt-1 font-bold uppercase tracking-[0.2em] font-mono ${subtitleColor} ${s.sub}`}>
            {subtitleText}
          </span>
        )}
        {showTagline && (
          <span className={`mt-1.5 font-bold uppercase tracking-[0.12em] font-mono ${isDark ? "text-[#34d399]" : "text-[#167a4c]"} text-[0.55rem] sm:text-[0.6rem]`}>
            {taglineText}
          </span>
        )}
      </div>
    );
  }

  // Compact Single-Line
  if (variant === "compact") {
    return (
      <div className={`inline-flex items-center ${s.gap} ${className}`}>
        <LogoMark size={s.badge} theme={badgeTheme} showDot={showDot} />
        <span className="flex items-baseline font-display leading-none tracking-tight">
          <span className={`font-extrabold ${primaryTextColor} ${s.text}`}>AM</span>
          <span className={`font-black ml-0.5 ${accentTextColor} ${s.text}`}>2050</span>
          {showDot && <span className={`ml-1 ${s.dot} rounded-full bg-[#f59e0b] self-center shrink-0`}></span>}
        </span>
      </div>
    );
  }

  // Stacked Layout (large centered badge above wordmark)
  if (variant === "stacked") {
    return (
      <div className={`inline-flex flex-col items-center text-center gap-3 ${className}`}>
        <LogoMark size={s.badge} theme={badgeTheme} showDot={showDot} />
        <div className="flex flex-col items-center leading-none">
          <div className="flex items-baseline tracking-tight font-display">
            <span className={`font-extrabold ${primaryTextColor} ${s.text}`}>AM</span>
            <span className={`font-black ml-0.5 ${accentTextColor} ${s.text}`}>2050</span>
            {showDot && <span className={`ml-1.5 ${s.dot} rounded-full bg-[#f59e0b] self-center shrink-0`}></span>}
          </div>
          {showSubtitle && (
            <span className={`mt-1.5 font-bold uppercase tracking-[0.24em] font-mono ${subtitleColor} ${s.sub}`}>
              {subtitleText}
            </span>
          )}
          {showTagline && (
            <span className={`mt-2 font-bold uppercase tracking-[0.14em] font-mono ${isDark ? "text-[#34d399]" : "text-[#167a4c]"} text-[0.58rem] sm:text-[0.64rem]`}>
              {taglineText}
            </span>
          )}
        </div>
      </div>
    );
  }

  // Horizontal Full Lockup (Default, matching J-CONNECT navbar & header style)
  return (
    <div className={`inline-flex items-center ${s.gap} ${className}`}>
      <LogoMark size={s.badge} theme={badgeTheme} showDot={showDot} />
      <div className="flex flex-col justify-center leading-none">
        <div className="flex items-baseline tracking-tight font-display">
          <span className={`font-extrabold ${primaryTextColor} ${s.text}`}>AM</span>
          <span className={`font-black ml-0.5 ${accentTextColor} ${s.text}`}>2050</span>
          {showDot && <span className={`ml-1.5 ${s.dot} rounded-full bg-[#f59e0b] self-center shrink-0`}></span>}
        </div>
        {showSubtitle && (
          <span className={`mt-1 font-bold uppercase tracking-[0.2em] font-mono ${subtitleColor} ${s.sub}`}>
            {subtitleText}
          </span>
        )}
        {showTagline && (
          <span className={`mt-1.5 font-bold uppercase tracking-[0.12em] font-mono ${isDark ? "text-[#34d399]" : "text-[#167a4c]"} text-[0.55rem] sm:text-[0.6rem]`}>
            {taglineText}
          </span>
        )}
      </div>
    </div>
  );
}
