"use client";

import { useSyncExternalStore } from "react";

// The fund trades US equities, so the floor keeps New York time whatever the viewer's zone.
const FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function subscribe(onTick: () => void): () => void {
  const id = setInterval(onTick, 1000);
  return () => clearInterval(id);
}

const now = () => FORMAT.format(new Date());

/** Wall-clock time in ET. The server renders a placeholder so hydration never mismatches. */
export function Clock() {
  const time = useSyncExternalStore(subscribe, now, () => "--:--");
  return <span>{time} ET</span>;
}
