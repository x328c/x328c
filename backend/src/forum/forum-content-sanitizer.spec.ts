import { ForumContentSanitizer } from './forum-content-sanitizer';

describe('ForumContentSanitizer', () => {
  const sanitizer = new ForumContentSanitizer();

  it('keeps normalized Chinese plain text and strips harmless markup', () => {
    expect(sanitizer.sanitize('  骑行前检查<br>胎压  ')).toBe('骑行前检查胎压');
  });

  it.each([
    '<script>alert(1)</script>',
    '<img src="https://evil.example/x" onerror="alert(1)">',
    '<iframe src="https://evil.example"></iframe>',
    '<a href="javascript:alert(1)">点击</a>',
    'data:text/html,<script>alert(1)</script>',
  ])('rejects dangerous content: %s', (value) => {
    expect(() => sanitizer.sanitize(value)).toThrow('危险协议');
  });
});
