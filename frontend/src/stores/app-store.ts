import { create } from "zustand";

interface AppState {
  isLaunched: boolean;
  markLaunched: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  isLaunched: false,
  markLaunched: () => set({ isLaunched: true }),
}));
