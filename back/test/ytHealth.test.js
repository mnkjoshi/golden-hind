import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ytDlpAssetName, classifyYtError } from '../lib/ytHealth.js';

test('ytDlpAssetName picks the official build for the server', () => {
    assert.equal(ytDlpAssetName('linux', 'arm64'), 'yt-dlp_linux_aarch64');
    assert.equal(ytDlpAssetName('linux', 'x64'), 'yt-dlp_linux');
    assert.equal(ytDlpAssetName('darwin', 'arm64'), null);
});

test('classifyYtError recognises the usual failures', () => {
    assert.equal(classifyYtError("ERROR: [youtube] abc: Sign in to confirm you're not a bot"), 'bot_check');
    assert.equal(classifyYtError('ERROR: [youtube] abc: Unable to extract nsig function code; please report this issue'), 'outdated');
    assert.equal(classifyYtError('ERROR: unable to download video data: HTTP Error 403: Forbidden'), 'outdated');
    assert.equal(classifyYtError('ERROR: [youtube] abc: Requested format is not available'), 'outdated');
    assert.equal(classifyYtError('WARNING: The provided YouTube account cookies are no longer valid'), 'cookies');
    assert.equal(classifyYtError('spawn yt-dlp ENOENT'), 'missing');
    assert.equal(classifyYtError('ERROR: [youtube] abc: Video unavailable'), 'unavailable');
    assert.equal(classifyYtError('connect ETIMEDOUT'), 'network');
    assert.equal(classifyYtError('something odd'), 'other');
});
