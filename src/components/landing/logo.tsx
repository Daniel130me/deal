import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("h-7 w-7 shrink-0", className)}
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <path
        d="M9.5 7.5h6.9c5 0 8.4 3.4 8.4 8.5s-3.4 8.5-8.4 8.5H9.5v-17zm4.3 3.7v9.6h2.5c2.8 0 4.6-1.9 4.6-4.8s-1.8-4.8-4.6-4.8h-2.5z"
        className="fill-primary-foreground"
      />
    </svg>
  );
}

export function Logo({
  className,
  wordmarkClassName,
}: {
  className?: string;
  wordmarkClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span
        className={cn(
          "text-xl font-extrabold tracking-tight text-foreground",
          wordmarkClassName
        )}
      >
        DEAL
      </span>
    </span>
  );
}
