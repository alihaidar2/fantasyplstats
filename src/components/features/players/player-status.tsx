import type { Availability } from "@/lib/fpl/transforms";
import { AvailabilityBadge } from "./availability-badge";

export default function PlayerStatus({
  availability,
}: Readonly<{ availability: Availability | null }>) {
  if (!availability) return null;
  return (
    <div className="flex flex-col items-end gap-2 min-w-[140px]">
      <AvailabilityBadge availability={availability} className="text-sm mb-1" />
      {availability.news && (
        <span className="text-gray-400 dark:text-gray-300 text-sm text-right max-w-xs">
          {availability.news}
        </span>
      )}
    </div>
  );
}
