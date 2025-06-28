"use client";

import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const getThemeIcon = (themeValue: string, className = "h-4 w-4") => {
    switch (themeValue) {
      case "light":
        return <Sun className={className} />;
      case "dark":
        return <Moon className={className} />;
      case "system":
        return <Monitor className={className} />;
      default:
        return <Sun className={className} />;
    }
  };

  return (
    <Select value={theme} onValueChange={setTheme}>
      <SelectTrigger className="w-16 h-9 p-0 flex items-center justify-between">
        <SelectValue asChild>
          <span className="flex items-center justify-center w-8">
            {getThemeIcon(theme, "w-8 h-8")}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="w-[90px]">
        <SelectItem value="light">
          <div className="flex items-center gap-2">
            <Sun className="h-4 w-4" />
            <span>Light</span>
          </div>
        </SelectItem>
        <SelectItem value="dark">
          <div className="flex items-center gap-2">
            <Moon className="h-4 w-4" />
            <span className="dark:text-gray-200">Dark</span>
          </div>
        </SelectItem>
        <SelectItem value="system">
          <div className="flex items-center gap-2">
            <Monitor className="h-4 w-4" />
            <span className="dark:text-gray-200">System</span>
          </div>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
