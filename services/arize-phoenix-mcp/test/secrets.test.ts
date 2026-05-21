import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const serviceRoot = fileURLToPath(new URL('..', import.meta.url));

describe('secret hygiene', () => {
  it('does not commit Phoenix API key literals in deployable service files', async () => {
    const files = ['package.json', 'Dockerfile', 'src/official-client.ts', 'src/server.ts'];
    for (const file of files) {
      const text = await readFile(join(serviceRoot, file), 'utf8');
      expect(text).not.toMatch(/px_(?:sys|usr)_[A-Za-z0-9_-]{8,}/);
      expect(text).not.toMatch(/PHOENIX_API_KEY\s*=\s*["'][^"']+["']/);
    }
  });
});
