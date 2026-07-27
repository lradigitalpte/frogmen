import { cn } from "@/lib/utils";

export type KpiTone = "default" | "warning" | "success" | "muted";

const toneConfig: Record<
  KpiTone,
  { icon: string; accent: string; glow: string; ring: string }
> = {
  default: {
    icon: "bg-secondary/12 text-secondary",
    accent: "from-secondary/8 to-transparent",
    glow: "bg-secondary/20",
    ring: "ring-secondary/20",
  },
  warning: {
    icon: "bg-destructive/12 text-destructive",
    accent: "from-destructive/10 to-transparent",
    glow: "bg-destructive/25",
    ring: "ring-destructive/25",
  },
  success: {
    icon: "bg-frogmen-emerald/12 text-frogmen-emerald-dark",
    accent: "from-frogmen-emerald/10 to-transparent",
    glow: "bg-frogmen-emerald/20",
    ring: "ring-frogmen-emerald/20",
  },
  muted: {
    icon: "bg-muted text-muted-foreground",
    accent: "from-muted/60 to-transparent",
    glow: "bg-muted-foreground/10",
    ring: "ring-border",
  },
};

interface KpiCardProps {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  tone?: KpiTone;
  loading?: boolean;
  footer?: React.ReactNode;
}

export function KpiCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
  loading,
  footer,
}: KpiCardProps) {
  const styles = toneConfig[tone];

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border p-3.5",
        /* Light: crisp white cards that pop off the page */
        "border-border/90 bg-white",
        "shadow-[0_1px_2px_rgba(15,23,42,0.06),0_8px_24px_rgba(15,23,42,0.08)]",
        "transition-all duration-200 hover:-translate-y-0.5",
        "hover:shadow-[0_2px_4px_rgba(15,23,42,0.08),0_12px_28px_rgba(15,23,42,0.1)]",
        /* Dark: softer clay surface */
        "dark:border-border/70 dark:bg-card",
        "dark:bg-gradient-to-br dark:from-card dark:via-card dark:to-muted/25",
        "dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),0_4px_12px_rgba(0,0,0,0.25)]",
        "dark:hover:shadow-[0_2px_4px_rgba(0,0,0,0.25),0_8px_20px_rgba(0,0,0,0.3)]",
        tone === "warning" && cn("ring-1", styles.ring),
      )}
    >
      {/* Accent wash   dark mode only so light cards stay pure white */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 hidden bg-gradient-to-br opacity-80 dark:block",
          styles.accent,
        )}
      />

      <div
        className={cn(
          "pointer-events-none absolute -top-6 -right-6 size-24 rounded-full blur-2xl",
          "hidden dark:block",
          styles.glow,
        )}
      />

      <div className="relative flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold tracking-wide text-foreground uppercase">
            {label}
          </p>
          <div
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg",
              "ring-1 ring-black/5 dark:ring-white/10",
              styles.icon,
            )}
          >
            {icon}
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-2xl leading-none font-bold tracking-tight text-foreground">
            {loading ? (
              <span className="inline-block h-8 w-28 animate-pulse rounded-lg bg-muted/80" />
            ) : (
              value
            )}
          </p>

          {footer ? (
            <div className="text-sm font-semibold text-foreground/85">{footer}</div>
          ) : (
            <p
              className={cn(
                "text-sm font-semibold",
                tone === "warning" ? "text-destructive" : "text-foreground/85",
              )}
            >
              {loading ? "Loading…" : hint}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
