import { create } from "zustand";
import type { SafetyAgreement } from "@/types/api";

export const FULL_AGREEMENT_STORAGE_KEY = "v21:active-safety-agreement";

interface PendingSafetyAgreement {
  agreement: SafetyAgreement;
  target: string;
  resolve: (confirmed: boolean) => void;
}

interface SafetyAgreementState {
  pending?: PendingSafetyAgreement;
  open: (agreement: SafetyAgreement, target: string) => Promise<boolean>;
  confirm: () => void;
  cancel: () => void;
}

export const useSafetyAgreementStore = create<SafetyAgreementState>((set, get) => ({
  pending: undefined,
  open: (agreement, target) => new Promise<boolean>((resolve) => {
    const current = get().pending;
    if (current) current.resolve(false);
    set({ pending: { agreement, target, resolve } });
  }),
  confirm: () => {
    const current = get().pending;
    if (!current) return;
    set({ pending: undefined });
    current.resolve(true);
  },
  cancel: () => {
    const current = get().pending;
    if (!current) return;
    set({ pending: undefined });
    current.resolve(false);
  },
}));
