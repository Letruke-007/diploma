import { useCallback, useRef } from "react";

export function useThrottle<T extends (...args: any[]) => unknown>(fn: T, delay: number): T {
  const lastCall = useRef(0);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  return useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now();
      const elapsed = now - lastCall.current;

      if (elapsed >= delay) {
        fn(...(args as unknown as Parameters<T>));
        lastCall.current = now;
        return;
      }

      if (!timeout.current) {
        timeout.current = setTimeout(() => {
          fn(...(args as unknown as Parameters<T>));
          lastCall.current = Date.now();
          timeout.current = null;
        }, delay - elapsed);
      }
    },
    [fn, delay],
  ) as unknown as T;
}
