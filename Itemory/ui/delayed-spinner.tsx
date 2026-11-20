import { ProgressView, VStack, useEffect, useState } from "scripting";

/**
 * Native centered loading indicator for a first read. It appears only after
 * delayMs, so fast reads go straight to content without a flash.
 */
export function DelayedSpinner({ delayMs = 300 }: { delayMs?: number }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);
  return visible ? (
    <ProgressView progressViewStyle="circular" controlSize="large" />
  ) : (
    <VStack />
  );
}
