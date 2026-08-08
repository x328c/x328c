const REDACTED = '[REDACTED]';
const SENSITIVE_KEYS = new Set([
  'authorization',
  'password',
  'secret',
  'apikey',
  'cookie',
  'setcookie',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'token',
  'openid',
  'unionid',
  'phone',
  'mobile',
  'latitude',
  'longitude',
  'lat',
  'lng',
  'address',
  'location',
  'body',
  'content',
  'description',
  'rawtext',
  'richtext',
]);

function normalizeKey(key: string): string {
  return key.replace(/[-_]/g, '').toLowerCase();
}

function sanitizeString(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\b1[3-9]\d{9}\b/g, '[REDACTED_PHONE]')
    .replace(
      /\b(access[_-]?token|refresh[_-]?token|openid|unionid|phone)\s*[:=]\s*[^\s,;]+/gi,
      '$1=[REDACTED]',
    );
}

export function sanitizeLogValue(value: unknown): unknown {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'boolean' ||
    typeof value === 'number'
  )
    return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string') return sanitizeString(value);
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return { name: value.name, message: sanitizeString(value.message) };
  }
  if (Array.isArray(value)) return value.map(sanitizeLogValue);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        SENSITIVE_KEYS.has(normalizeKey(key)) ? REDACTED : sanitizeLogValue(item),
      ]),
    );
  }
  return String(value);
}

export function sanitizeLogMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  return sanitizeLogValue(metadata) as Record<string, unknown>;
}
