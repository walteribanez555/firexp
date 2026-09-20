import * as React from 'react';
import { cn } from '@/lib/utils';

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 0–100 */
  value?: number;
  /** Colour of the filled portion. Defaults to the primary (ember) token. */
  indicatorClassName?: string;
}

/**
 * Minimal, dependency-free progress bar with the shadcn API surface
 * (`value` 0–100, `className`). Avoids pulling in @radix-ui/react-progress.
 */
const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, indicatorClassName, ...props }, ref) => {
    const clamped = Math.min(100, Math.max(0, value));
    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped)}
        className={cn('relative h-2 w-full overflow-hidden rounded-full bg-secondary', className)}
        {...props}
      >
        <div
          className={cn('h-full rounded-full bg-primary transition-all duration-300 ease-out', indicatorClassName)}
          style={{ width: `${clamped}%` }}
        />
      </div>
    );
  },
);
Progress.displayName = 'Progress';

export { Progress };
