export const REGULATION_STATUS = {
  DRAFT: 0,
  PENDING_REVIEW: 1,
  EFFECTIVE: 2,
  EXPIRED: 3,
  REPLACED: 4,
  OFFLINE: 5,
} as const;

export const REVISION_STATUS = {
  DRAFT: 0,
  PENDING_REVIEW: 1,
  APPROVED: 2,
  PUBLISHED: 3,
} as const;

export const REGULATION_SCOPES = ['NATIONAL', 'REGIONAL'] as const;
export const REGULATION_CATEGORIES = ['city_policy', 'license', 'vehicle', 'traffic'] as const;
export const AUTHORITY_LEVELS = ['law', 'administrative', 'departmental', 'local'] as const;
export const FEEDBACK_TYPES = ['content_error', 'expired', 'link_broken'] as const;

export const IMPORT_STATUS = {
  PREVIEW: 0,
  IMPORTED: 1,
  REJECTED: 2,
} as const;

export const REGULATION_LIMITS = {
  searchCandidates: 1000,
  pageSize: 20,
  maxPageSize: 50,
  csvBytes: 2 * 1024 * 1024,
  csvRows: 500,
  tags: 12,
  regions: 20,
  content: 100_000,
} as const;

export const SEARCH_SUGGESTIONS = [
  '尝试缩短关键词',
  '浏览驾驶证、车辆管理或交通规则分类',
  '确认城市筛选是否正确',
  '仍未找到时可提交纠错需求',
];
