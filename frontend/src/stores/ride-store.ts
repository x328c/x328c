import { create } from "zustand";
import type { Pagination, RideSummary } from "@/types/api";

interface RideListState {
  rides: RideSummary[];
  pagination: Pagination;
  loading: boolean;
  replace: (rides: RideSummary[], pagination: Pagination) => void;
  append: (rides: RideSummary[], pagination: Pagination) => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

const initialPagination: Pagination = { page: 1, pageSize: 20, total: 0 };

export const useRideListStore = create<RideListState>((set) => ({
  rides: [],
  pagination: initialPagination,
  loading: false,
  replace: (rides, pagination) => set({ rides, pagination }),
  append: (rides, pagination) =>
    set((state) => ({
      rides: [...state.rides, ...rides],
      pagination,
    })),
  setLoading: (loading) => set({ loading }),
  reset: () => set({ rides: [], pagination: initialPagination, loading: false }),
}));
