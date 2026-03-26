import { useState, useCallback } from "react";
import * as Popover from "@radix-ui/react-popover";
import { HelpCircle } from "lucide-react";
import { metricExplanations, type MetricKey } from "@/lib/metric-explanations";
import { Button } from "@/components/ui/button";

export function MetricInfo({ metricKey }: { metricKey: MetricKey }) {
  const [isHovered, setIsHovered] = useState(false);
  const [isPinned, setIsPinned] = useState(false);

  const explanation = metricExplanations[metricKey];
  const isOpen = isHovered || isPinned;

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsPinned((prev) => !prev);
    },
    [],
  );

  const handleInteractOutside = useCallback(() => {
    setIsPinned(false);
  }, []);

  return (
    <Popover.Root open={isOpen}>
      <Popover.Trigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-6 text-muted-foreground"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onClick={handleClick}
          aria-label="Show calculation info"
        >
          <HelpCircle className="size-3.5" />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={4}
          className="z-50 max-w-[250px] rounded-md bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
          onInteractOutside={handleInteractOutside}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <p className="font-medium">{explanation.calculation}</p>
          {"description" in explanation && explanation.description && (
            <>
              <hr className="my-1.5 border-border" />
              <p className="text-muted-foreground">{explanation.description}</p>
            </>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
