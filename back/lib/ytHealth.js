// yt-dlp upkeep helpers (pure, unit tested). YouTube changes often enough
// that an old yt-dlp stops working, so the server keeps its own copy current
// and reports what's wrong in plain words.

// Official release asset for this machine, or null where we don't manage it.
export function ytDlpAssetName(platform, arch) {
    if (platform === 'linux' && arch === 'arm64') return 'yt-dlp_linux_aarch64';
    if (platform === 'linux' && arch === 'x64') return 'yt-dlp_linux';
    return null;
}

// What a yt-dlp failure most likely means, from its stderr/message.
export function classifyYtError(text) {
    const t = String(text || '');
    if (/ENOENT|EACCES|not found|No such file/i.test(t) && /yt-dlp/i.test(t)) return 'missing';
    if (/confirm you.?re not a bot|LOGIN_REQUIRED|Sign in to confirm/i.test(t)) return 'bot_check';
    if (/cookies.*(invalid|expired|no longer valid)|cookies are no longer valid/i.test(t)) return 'cookies';
    if (/Video unavailable|Private video|This video is not available/i.test(t)) return 'unavailable';
    if (/Unable to extract|nsig|signature|player.*(response|js)|Requested format is not available|HTTP Error 403|Precondition check failed|Please report this issue|yt-dlp -U/i.test(t)) return 'outdated';
    if (/timed out|ETIMEDOUT|ECONNRESET|EAI_AGAIN/i.test(t)) return 'network';
    return 'other';
}

export const YT_ERROR_ADVICE = {
    missing: 'yt-dlp is not installed or cannot be run on the server.',
    bot_check: 'YouTube is showing its "confirm you\'re not a bot" wall. Re-export fresh cookies to the server.',
    cookies: 'The YouTube cookies have expired. Re-export fresh cookies to the server.',
    unavailable: 'The test video is unavailable (not a server problem).',
    outdated: 'yt-dlp looks out of date for YouTube\'s latest changes. Updating it usually fixes this.',
    network: 'The server could not reach YouTube in time.',
    other: 'yt-dlp failed for an unrecognised reason; see the message.',
};
