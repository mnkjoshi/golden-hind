import React, { useEffect, useRef } from 'react';
import Topbar from "../components/topbar"

// ─────────────────────────────────────────────
//  VIDEO CONFIG — edit these two lines to test
// ─────────────────────────────────────────────
const VIDEO_URL  = "https://srv313.cudged.store/s4/0/8ce95815dbdd0a3c89853f0901db61e220cefeabb30f78f5ca50e04da309693c/Ppt7sS-Btoo-0fxiUobLjg/1775977779/storage6/movies/1741200918-33552770-the-oscars-2025/8bf50e7626e749221b53a9336be4d7bb.mp4/index.m3u8"   // paste any direct video URL or embed URL here
const VIDEO_TYPE = "iframe"   // "video" for direct mp4/hls, "iframe" for embed iframes
// ─────────────────────────────────────────────

export default function Test() {
    const playerRef = useRef(null);

    useEffect(() => {
        document.body.classList.add('test-page');
        document.documentElement.classList.add('test-page');
        return () => {
            document.body.classList.remove('test-page');
            document.documentElement.classList.remove('test-page');
        };
    }, []);

    return (
        <div className="test-main">
            <Topbar/>
            <div className="test-holder">
                <div className="test-system">
                    <div className="test-player">
                        ?<video className="test-player-file" webkit-playsinline="true" playsinline="playsinline" x-webkit-airplay="allow" id="video_player_html5_api" tabindex="-1" role="application" preload="none" autoplay="" src="blob:https://www.lookmovie2.to/52439668-07ae-4e56-97c7-374484b1a230"></video>
                        {VIDEO_TYPE === "video" ? (
                            <video
                                ref={playerRef}
                                className="test-player-file"
                                src={VIDEO_URL}
                                controls
                                autoPlay
                                playsInline
                                webkit-playsinline="true"
                                x-webkit-airplay="allow"
                            />
                        ) : (
                            <iframe
                                className="test-player-file"
                                src={VIDEO_URL}
                                allowFullScreen
                                allow="autoplay; fullscreen"
                            />
                        )}
                    </div>
                    <div className="test-options">
                        <div className="test-left">
                            <span className="test-url-label">
                                {VIDEO_TYPE === "video" ? "▶ video" : "⬚ iframe"} — {VIDEO_URL}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
