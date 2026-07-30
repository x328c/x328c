import { create } from 'zustand';
import type { AdminUser } from '../types';

const TOKEN_KEY = 'jiangxing_admin_token';
const ADMIN_KEY = 'jiangxing_admin_user';

interface AuthState {
  token: string | null;
  admin: AdminUser | null;
  hydrate: () => void;
  setSession: (token: string, admin: AdminUser) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  admin: null,
  hydrate: () => {
    const token = localStorage.getItem(TOKEN_KEY);
    const raw = localStorage.getItem(ADMIN_KEY);
    let admin: AdminUser | null = null;
    try { admin = raw ? JSON.parse(raw) as AdminUser : null; } catch { localStorage.removeItem(ADMIN_KEY); }
    set({ token, admin });
  },
  setSession: (token, admin) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(ADMIN_KEY, JSON.stringify(admin));
    set({ token, admin });
  },
  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ADMIN_KEY);
    set({ token: null, admin: null });
  },
}));
