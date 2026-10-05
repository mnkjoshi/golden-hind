// Square album cover served by our server (the art embedded in the MP3),
// falling back to the YouTube thumbnail for songs the server doesn't hold yet.
// eslint flags React as unused, but JSX here compiles with the classic runtime.
import React, { useState } from 'react';
import { coverUrl } from '../player/musicPlayer.js';

export default function CoverArt({ videoId, className, alt = '' }) {
    const [failed, setFailed] = useState(null);
    const src = failed === videoId
        ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`
        : coverUrl(videoId);
    return <img className={className} src={src} alt={alt} loading="lazy" onError={() => setFailed(videoId)} />;
}
