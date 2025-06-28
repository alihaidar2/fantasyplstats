import { Loader } from "lucide-react";

export function Spinner({
  className = "",
  colorClass = "text-green-500 dark:text-green-400",
  size = "h-8 w-8",
}: {
  className?: string;
  colorClass?: string;
  size?: string;
}) {
  return (
    <div className={`flex justify-center items-center h-24 ${className}`}>
      <Loader className={`${size} animate-spin ${colorClass}`} />
    </div>
  );
}
