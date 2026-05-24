import { Ratio } from "lucide-react";

import { cn } from "@acme/ui";

export function OpenBriefMark({ className }: { className?: string }) {
  return <Ratio className={cn("size-5", className)} aria-hidden="true" />;
}
