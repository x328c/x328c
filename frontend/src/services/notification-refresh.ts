import { notificationService } from "@/services/notifications";
import { useNotificationStore } from "@/stores/notification-store";
import { useUserStore } from "@/stores/user-store";

let generation = 0;
let pending: {
  token: string;
  userId: string;
  snapshot: ReturnType<typeof useNotificationStore.getState>;
  promise: Promise<void>;
} | undefined;

/** Startup/foreground refresh only. Never overwrite a newer read action or a
 * different account with a late response; concurrent identical refreshes share
 * one request. No persistent cache and no extra retries. */
export function refreshUnreadCount(): Promise<void> {
  const session = useUserStore.getState();
  if (!session.isLoggedIn || !session.accessToken || !session.user) return Promise.resolve();
  const token = session.accessToken;
  const userId = session.user.id;
  const snapshot = useNotificationStore.getState();
  if (pending?.token === token && pending.userId === userId && pending.snapshot === snapshot) return pending.promise;
  const current = ++generation;
  const promise = Promise.resolve().then(() => notificationService.unreadCount()).then(({ count }) => {
    const latest = useUserStore.getState();
    if (current !== generation || !latest.isLoggedIn || latest.user?.id !== userId) return;
    // Normal token refresh preserves the current user object in request.ts.
    // Accept that response, but not a new login with a new user/session object.
    if (latest.accessToken !== token && latest.user !== session.user) return;
    if (useNotificationStore.getState() !== snapshot || !Number.isFinite(count) || count < 0) return;
    snapshot.setUnreadCount(count);
  }).catch(() => undefined).finally(() => {
    if (current === generation) pending = undefined;
  });
  pending = { token, userId, snapshot, promise };
  return promise;
}
