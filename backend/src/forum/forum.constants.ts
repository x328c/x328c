export const FORUM_BOARD_STATUS = { DISABLED: 0, ACTIVE: 1 } as const;
export const FORUM_CONTENT_STATUS = { ACTIVE: 1, OFFLINE: 2 } as const;
export const FORUM_MODERATION_STATUS = { PENDING: 0, APPROVED: 1, REJECTED: 2 } as const;
export const FORUM_RESTRICTION_TYPE = 'forum_mute';
export const FORUM_LIKE_TARGET = 'post';
export const FORUM_MAX_IMAGES = 9;
export const FORUM_MAX_MODERATION_ATTEMPTS = 3;
export const FORUM_MODERATION_BACKOFF_SECONDS = [60, 300, 1800] as const;

export const FORUM_ERROR = {
  NOT_FOUND: 53001,
  PENDING: 53002,
  REJECTED: 53003,
  OFFLINE: 53004,
  BOARD_CLOSED: 53005,
  MUTED: 53006,
  READ_ONLY: 53007,
  NOT_INVITED: 53008,
  INVALID_CONTENT: 53009,
  INVALID_IMAGE: 53010,
  INVALID_CURSOR: 53011,
  INVALID_STATE: 53012,
  FORBIDDEN: 53013,
  INVALID_ID: 53014,
} as const;

export type ForumContentType = 'post' | 'reply';
export type ForumModerationQueue = 'pending' | 'errors';
