import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

import type { RealtimeClient, RealtimeConnectionState } from "../../../lib/realtime/RealtimeClient";

export type ConnectionStateStore = Readonly<{
  connectionState: RealtimeConnectionState;
  setConnectionState(connectionState: RealtimeConnectionState): void;
}>;

export type RealtimeConnectionStateSource = Pick<
  RealtimeClient,
  "connectionState" | "onConnectionState"
>;

export const connectionStateStore = createStore<ConnectionStateStore>((set) => ({
  connectionState: "DISCONNECTED",
  setConnectionState: (connectionState) => {
    set((currentState) => {
      if (currentState.connectionState === connectionState) return currentState;

      return { connectionState };
    });
  },
}));

export const selectConnectionState = (state: ConnectionStateStore): RealtimeConnectionState =>
  state.connectionState;

export function useRealtimeConnectionState(): RealtimeConnectionState {
  return useStore(connectionStateStore, selectConnectionState);
}

export function bindConnectionStateStore(source: RealtimeConnectionStateSource): () => void {
  const updateConnectionState = connectionStateStore.getState().setConnectionState;
  updateConnectionState(source.connectionState);

  return source.onConnectionState(updateConnectionState);
}
