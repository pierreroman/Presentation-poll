import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const script = await readFile(new URL('../public/theme.js', import.meta.url), 'utf8');

test('Ignite is the default theme regardless of OS preference; existing theme links remain supported', () => {
  for (const dark of [false, true]) {
    for (const [search, expected] of [
      ['', 'ignite'],
      ['?scoutTheme=ignite', 'ignite'],
      ['?scoutTheme=light', 'light'],
      ['?scoutTheme=dark', 'dark'],
      ['?scoutTheme=invalid', 'ignite'],
    ]) {
      let actual;
      runInNewContext(script, {
        URLSearchParams,
        window: { location: { search }, matchMedia: () => ({ matches: dark }) },
        document: { documentElement: { setAttribute: (name, value) => {
          assert.equal(name, 'data-theme');
          actual = value;
        } } },
      });
      assert.equal(actual, expected, `${search || 'no parameter'}, OS dark=${dark}`);
    }
  }
});
