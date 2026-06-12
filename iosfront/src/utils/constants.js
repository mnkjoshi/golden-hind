// TMDB Genre mapping
export const genreMap = {
  // Movie genres
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
  99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
  27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance", 
  878: "Science Fiction", 10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western",
  // TV genres
  10759: "Action & Adventure", 10762: "Kids", 10763: "News", 10764: "Reality",
  10765: "Sci-Fi & Fantasy", 10766: "Soap", 10767: "Talk", 10768: "War & Politics"
};

// Helper function to convert genre IDs to names
export const getGenreNames = (genreIds) => {
  if (!genreIds || !Array.isArray(genreIds)) return "Unknown";
  return genreIds.map(id => genreMap[id] || "Unknown").filter(name => name !== "Unknown").join(", ") || "Unknown";
};

// API endpoints
export const API_BASE_URL = 'https://goldenhind.tech';

export const API_ENDPOINTS = {
  LOGIN: `${API_BASE_URL}/login`,
  REGISTER: `${API_BASE_URL}/register`,
  VERIFY: `${API_BASE_URL}/verify`,
  SEARCH: `${API_BASE_URL}/search`,
  HOME_MINI: `${API_BASE_URL}/home-mini`,
  HOME_FAVOURITES: `${API_BASE_URL}/home-favourites`,
  HOME_CONTINUES: `${API_BASE_URL}/home-continues`,
  HOME_TRENDING: `${API_BASE_URL}/home-trending`,
  SIMILAR: `${API_BASE_URL}/similar`,
  ERETRIEVE: `${API_BASE_URL}/eretrieve`,
  MRETRIEVE: `${API_BASE_URL}/mretrieve`,
  SRETRIEVE: `${API_BASE_URL}/sretrieve`,
  FAVOURITE: `${API_BASE_URL}/favourite`,
  UNFAVOURITE: `${API_BASE_URL}/unfavourite`,
  CONTINUE: `${API_BASE_URL}/continue`,
  UNCONTINUE: `${API_BASE_URL}/uncontinue`,
  PROGRESS_UPDATE: `${API_BASE_URL}/progress_update`,
  PROGRESS_RETRIEVE: `${API_BASE_URL}/progress_retrieve`,
  // Parity with web
  LOOKMOVIE: `${API_BASE_URL}/server/lookmovie`,
  POSITION_UPDATE: `${API_BASE_URL}/position/update`,
  POSITION_RETRIEVE: `${API_BASE_URL}/position/retrieve`,
  PARTY_CREATE: `${API_BASE_URL}/party/create`,
  PARTY_INFO: `${API_BASE_URL}/party/info`,
  PARTY_UPDATE: `${API_BASE_URL}/party/update`,
  PARTY_CHAT: `${API_BASE_URL}/party/chat`,
  PARTY_REACT: `${API_BASE_URL}/party/react`,
  PARTY_STREAM: `${API_BASE_URL}/party/stream`,
  NOTIFICATIONS: `${API_BASE_URL}/notifications`,
  NOTIFICATIONS_SEEN: `${API_BASE_URL}/notifications/seen`,
  DOWNLOAD: `${API_BASE_URL}/download/video`,
};

// Video providers — mirrors the web app's numbering.
// 1 = LookMovie (native HLS via hls.js in a WebView; supports AirPlay,
// subtitles, resume, and watch-party sync). 2 = VidLink, 3 = VidSrc (iframes).
export const VIDEO_PROVIDERS = {
  LOOKMOVIE: 1,
  VIDLINK: 2,
  VIDSRC: 3,
};

// iframe URL for the embed providers (2 and 3). Provider 1 is resolved
// server-side and played through the HLS WebView player instead.
export const getVideoUrl = (provider, type, vidID, season = 1, episode = 1, autoPlay = false) => {
  if (provider === VIDEO_PROVIDERS.VIDLINK) {
    if (type === 'movie') {
      return `https://vidlink.pro/${type}/${vidID}/?primaryColor=3FA3FF&secondaryColor=6db8ff&autoplay=false&poster=true`;
    }
    return `https://vidlink.pro/${type}/${vidID}/${season}/${episode}?primaryColor=3FA3FF&secondaryColor=6db8ff&autoplay=${autoPlay ? "true" : "false"}&poster=true${autoPlay ? "&startAt=0" : ""}`;
  } else if (provider === VIDEO_PROVIDERS.VIDSRC) {
    if (type === 'movie') {
      return `https://vidsrc.me/embed/${type}?tmdb=${vidID}`;
    }
    return `https://vidsrc.me/embed/${type}?tmdb=${vidID}&season=${season}&episode=${episode}&autoplay=${autoPlay}`;
  }
  return '';
};

// Build a movie/episode posKey matching the web app's scheme so resume
// positions are shared across web and mobile.
export const buildPosKey = (id, type, season, episode) =>
  type === 'tv' ? `playbackPos_${id}_s${season}_e${episode}` : `playbackPos_${id}`;
