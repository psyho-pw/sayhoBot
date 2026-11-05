import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { StreamProviderAdapter } from '../../../src/discord/infrastructure/voice/stream-provider.adapter';

jest.mock('child_process', () => {
  const actual = jest.requireActual('child_process');
  return {
    ...actual,
    spawn: (cmd: string, args: string[], opts: object) =>
      actual.spawn(cmd, args, { ...opts, env: process.env }),
  };
});

describe('StreamProviderAdapter', () => {
  const originalPath = process.env.PATH;
  let binDir: string;
  let adapter: StreamProviderAdapter;

  const fakeYtDlp = (script: string) => {
    writeFileSync(join(binDir, 'yt-dlp'), `#!/bin/sh\n${script}\n`);
    chmodSync(join(binDir, 'yt-dlp'), 0o755);
  };

  beforeEach(() => {
    binDir = mkdtempSync(join(tmpdir(), 'fake-yt-dlp-'));
    process.env.PATH = `${binDir}:${originalPath}`;
    adapter = new StreamProviderAdapter(
      { appConfig: { PROXY: '' } } as any,
      { error: jest.fn() } as any,
    );
  });

  afterEach(() => {
    process.env.PATH = originalPath;
    rmSync(binDir, { recursive: true, force: true });
  });

  it('resolves with yt-dlp stdout', async () => {
    fakeYtDlp('printf audio-bytes');
    const stream = await adapter.createStream('https://youtu.be/x');
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    expect(Buffer.concat(chunks).toString()).toBe('audio-bytes');
  });

  it('rejects (instead of crashing) when yt-dlp fails', async () => {
    fakeYtDlp('echo "ERROR: Video unavailable" >&2; exit 1');
    await expect(adapter.createStream('https://youtu.be/x')).rejects.toThrow(
      'yt-dlp exited with code 1: ERROR: Video unavailable',
    );
  });

  it('masks proxy credentials in the error message', async () => {
    adapter = new StreamProviderAdapter(
      { appConfig: { PROXY: 'http://user:s%2Fcret@proxy:8080' } } as any,
      { error: jest.fn() } as any,
    );
    fakeYtDlp(
      'echo "ERROR: proxy http://user:s%2Fcret@proxy:8080 refused; auth s/cret rejected" >&2; exit 1',
    );
    const error = await adapter.createStream('https://youtu.be/x').then(
      () => new Error('expected rejection'),
      (e: Error) => e,
    );
    expect(error.message).toContain('yt-dlp exited with code 1');
    expect(error.message).not.toMatch(/s%2Fcret|s\/cret/);
  });

  it('kills yt-dlp and rejects when no audio arrives in time', async () => {
    jest.useFakeTimers();
    fakeYtDlp('sleep 30');
    const promise = adapter.createStream('https://youtu.be/x');
    jest.advanceTimersByTime(60_000);
    await expect(promise).rejects.toThrow('yt-dlp timed out');
    jest.useRealTimers();
  });

  it('rejects when yt-dlp is not installed', async () => {
    process.env.PATH = binDir;
    await expect(adapter.createStream('https://youtu.be/x')).rejects.toThrow('yt-dlp spawn failed');
  });
});
