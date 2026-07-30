import { create } from "zustand";

interface RideInteractionState {
  joinedRideIds: Record<string, boolean>;
  setJoined: (rideId: string, joined: boolean) => void;
}

export const useRideInteractionStore = create<RideInteractionState>((set) => ({
  joinedRideIds: {},
  setJoined: (rideId, joined) =>
    set((state) => ({
      joinedRideIds: { ...state.joinedRideIds, [rideId]: joined },
    })),
}));
