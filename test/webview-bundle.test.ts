import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const projectRoot = new URL('../', import.meta.url).pathname;
const bundlePath = new URL('../media/main.js', import.meta.url);

describe('webview browser bundle', () => {
  it('should define the ELK require probe before the production bundle executes', async () => {
    const build = Bun.spawn(['bun', 'run', 'build:webview'], {
      cwd: projectRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const exitCode = await build.exited;
    if (exitCode !== 0) {
      const stderr = await new Response(build.stderr).text();
      throw new Error(`Webview build failed: ${stderr}`);
    }

    assert.equal(readFileSync(bundlePath, 'utf8').startsWith('var __require;'), true);
  });
});
