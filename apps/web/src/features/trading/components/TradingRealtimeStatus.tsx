"use client";

import { Badge } from "@/components/ui/Badge";
import { useRealtimeConnectionState } from "@/features/realtime/stores/connection-state-store";

const connectionPresentation = {
  CONNECTED: { label: "Live", variant: "positive" },
  CONNECTING: { label: "Connecting", variant: "info" },
  DISCONNECTED: { label: "Offline", variant: "negative" },
  RECONNECTING: { label: "Reconnecting", variant: "warning" },
} as const;

export function TradingRealtimeStatus() {
  const connectionState = useRealtimeConnectionState();
  const presentation = connectionPresentation[connectionState];

  return (
    <Badge
      aria-label={`Market data status: ${presentation.label}`}
      className="order-2 justify-self-end lg:order-4"
      showDot
      variant={presentation.variant}
    >
      {presentation.label}
    </Badge>
  );
}
