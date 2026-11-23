import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AVAILABILITY_LABELS, type Availability } from "@/lib/fpl/transforms";

// Shared by the players table (every view) and the player page header. Plain
// component with no hooks, so it renders in server and client components.

/** Amber while there's still a chance of playing, red when FPL rules the player out. */
function tone({ status, chance }: Availability): string {
  if (status === "doubtful" || (chance !== null && chance > 0)) {
    return "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200";
  }
  return "bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-200";
}

/** "75%" for a doubtful player, otherwise the status ("Injured"). */
export function availabilityText(a: Availability): string {
  if (a.status === "doubtful" && a.chance !== null) return `${a.chance}%`;
  return AVAILABILITY_LABELS[a.status];
}

/** Full description for tooltips and screen readers. */
export function availabilityDescription(a: Availability): string {
  const chance = a.chance === null ? "" : ` (${a.chance}% chance of playing next round)`;
  const news = a.news ? `: ${a.news}` : "";
  return `${AVAILABILITY_LABELS[a.status]}${chance}${news}`;
}

export function AvailabilityBadge({
  availability,
  className,
}: Readonly<{ availability: Availability | null; className?: string }>) {
  if (!availability) return null;
  const description = availabilityDescription(availability);
  return (
    <Badge
      className={cn("text-xs border-transparent", tone(availability), className)}
      title={description}
      aria-label={description}
    >
      {availabilityText(availability)}
    </Badge>
  );
}
