import { create } from "zustand";
import type { ActivitySummary, Pagination } from "@/types/api";
interface ActivityState { items: ActivitySummary[]; pagination: Pagination; set: (items: ActivitySummary[], pagination: Pagination) => void; }
export const useActivityStore = create<ActivityState>((set) => ({ items: [], pagination: { page: 1, pageSize: 20, total: 0 }, set: (items, pagination) => set({ items, pagination }) }));
