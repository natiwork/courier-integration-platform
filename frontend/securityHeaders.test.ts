import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The Content-Security-Policy in security-headers.conf allows the one inline script of index.html by its hash.
// If the script changes and the hash doesn't, the browser silently refuses to run it (in the Docker build only),
// so the theme would flash. This keeps the two in step.
describe('security-headers.conf', () => {
  const headers = readFileSync(new URL('./security-headers.conf', import.meta.url), 'utf8');

  it('allows exactly the inline theme script of index.html, by its sha256 hash', () => {
    const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
    const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]!);
    expect(inline).toHaveLength(1);

    const hash = createHash('sha256').update(inline[0]!).digest('base64');
    const allowed = [...headers.matchAll(/'sha256-([^']+)'/g)].map((match) => match[1]);
    expect(allowed).toEqual([hash]);
  });

  it('sends the policy and the other headers on every response, even errors', () => {
    for (const name of ['Content-Security-Policy', 'X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy']) {
      expect(headers).toMatch(new RegExp(`add_header ${name} "[^"]+" always;`));
    }
  });
});
