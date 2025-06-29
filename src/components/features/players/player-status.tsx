import { Badge } from "@/components/ui/badge";

export default function PlayerStatus({
  status,
  news,
}: Readonly<{
  status: string;
  news?: string;
}>) {
  if (status === "a") return null;
  let label = "Unknown";
  if (status === "i") label = "Injured";
  else if (status === "s") label = "Suspended";
  else if (status === "u") label = "Unavailable";

  return (
    <div className="flex flex-col items-end gap-2 min-w-[140px]">
      <Badge variant="destructive" className="mb-1">
        {label}
      </Badge>
      {news && (
        <span className="text-gray-400 dark:text-gray-300 text-sm text-right max-w-xs">
          {news}
        </span>
      )}
    </div>
  );
}
