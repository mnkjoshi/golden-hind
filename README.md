# The Golden Hind
<p align="center">
  <img src="https://github.com/mnkjoshi/golden-hind/blob/main/front/src/assets/HindEntry.png" alt="The Golden Hind Logo">
</p>

<p align="center">
  The Golden Hind is a comprehensive media management application designed to help users discover and keep track of their favorite TV shows, movies, and series. The application provides a robust backend with various endpoints for retrieving media details, adding and removing favorites, and managing user authentication. The frontend is built using modern web technologies and offers a seamless user experience for browsing and managing media content. It features a Netflix-style home page, multi-source video playback, smart recommendations, social reviews, and rich account management — all built on a Node.js/Express backend with a React + Vite frontend backed by Firebase.
</p>
---

## Key Features

### Home Page
- **Hero banner** — rotating spotlight of trending titles with TMDB logo images, truncated descriptions, Watch and Trailer buttons
- **Continue Watching** — resumes at the exact last position; shows season/episode and relative last-watched time (e.g. "2h ago"); supports removing items
- **My List / Favourites** — bookmark any title; empty-state prompt when the list is empty
- **Trending** — top 20 TMDB trending titles enriched with logos; filterable by genre pills (Action, Comedy, Drama, etc.)
- **Trailer modal** — YouTube embed fetched live from TMDB, opened inline without leaving the page

### Watch / Player
- **Four video providers** — embeds for providers 1–3, plus native HLS playback via HLS.js + Plyr
- **Resume playback** — position saved every 5 seconds per movie or per season/episode for TV; restores on re-open
- **Volume & speed persistence** — stored in `localStorage`, restored across sessions
- **Up-next countdown** — 5-second overlay before auto-advancing to the next episode; cancellable
- **Auto-next episode** — fires automatically on video end for provider 4; also handles postMessage from embed providers
- **Continue Watching threshold** — only logs a title after 30 seconds of watch time
- **HLS error recovery** — automatic `startLoad` on network errors, `recoverMediaError` on media errors
- **Provider fallback toast** — silent notification when LookMovie is unavailable and playback switches to Server 1
- **10-second skip buttons** — back/forward overlays on the Plyr player, subtle by default, visible on hover
- **Subtitle offset control** — fine-tune subtitle timing in real time
- **Season/episode selector** — inline grid below the player
- **Reviews** — star-rated text reviews per title, with average rating display

### Search
- **Autocomplete suggestions** — debounced (300 ms), pulls top 5 results as you type
- **Search history** — last 8 queries stored in `localStorage`; shown when the search box is focused and empty; individually removable
- **Filter bar** — client-side chips for type (All / Movies / TV Shows), release year, and genre; options built dynamically from actual results
- **Hover tooltip** — rich metadata card (overview, genres, popularity, language) on desktop

### Recommendations
- **Lifetime recommendations** — based on full watch history
- **Recent recommendations** — based on the last few titles watched

### Account & Activity
- **Account settings** — view username/email, change password
- **Activity modal** — total watch time, session count, recent watch session log
- **Analytics tracking** — search and navigation events via `/track`

### Books
- **Book search** — Google Books integration with download links

---

## Backend API Endpoints

All authenticated endpoints require `user` and `token` in the request body. The server returns `"UNV"` with status `202` when authentication fails.

### Auth

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/login` | Authenticate a user; returns a session token |
| POST | `/register` | Create a new account |
| POST | `/verify` | Verify a session token |

### Home

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/home-mini` | Returns user's favourites and continue-watching lists |
| POST | `/home-favourites` | Returns full favourite items with TMDB metadata |
| POST | `/home-continues` | Returns continue-watching items with TMDB metadata |
| POST | `/home-trending` | Returns top 20 TMDB trending titles enriched with `logo_path` |
| POST | `/home-trailer` | Fetches the YouTube trailer/teaser key for a given TMDB title |

**`/home-trailer` request body:**
```json
{ "user": "string", "token": "string", "tmdbId": "number", "mediaType": "movie|tv" }
```
Returns `{ "key": "youtubeVideoKey" }` (key is `null` if no trailer found).

### Search & Discovery

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/search` | Full-text TMDB multi-search; returns array of results with `genre_ids`, `media_type`, etc. |
| POST | `/similar` | Returns similar titles for a given TMDB ID and media type |
| POST | `/recommendations/lifetime` | TMDB recommendations based on full watch history |
| POST | `/recommendations/recent` | TMDB recommendations based on recent watch history |

### Media Details

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/eretrieve` | Episode details (title, overview, runtime, still image) |
| POST | `/mretrieve` | Movie details (title, overview, runtime, poster, genres, cast) |
| POST | `/sretrieve` | Series details (title, seasons, episode counts, poster, genres) |

### Watchlist & Progress

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/favourite` | Add a title to the user's list |
| POST | `/unfavourite` | Remove a title from the user's list |
| POST | `/continue` | Mark a title as in-progress (Continue Watching) |
| POST | `/uncontinue` | Remove a title from Continue Watching |
| POST | `/progress_update` | Save playback position (seconds) for a title |
| POST | `/progress_retrieve` | Retrieve saved playback position for a title |

### Reviews

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/review` | Submit a star-rated text review for a title |
| GET | `/reviews?tmdbId=&mediaType=` | Fetch all reviews for a title |
| GET | `/recently-reviewed` | Fetch recently reviewed titles site-wide |

### Account & Analytics

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/account/info` | Return username and email for the authenticated user |
| POST | `/account/change-password` | Change password (`PUS` = success, `ILD` = wrong current pw, `PWS` = too short) |
| POST | `/watch-time` | Log a watch session (duration + content name) |
| POST | `/user/stats` | Return total watch time and session history |
| POST | `/track` | Log a client-side analytics event |

### Admin

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/admin/data` | Aggregate platform stats (admin only) |
| POST | `/admin/create-user` | Create a user account without the registration flow |

### Proxy & Streaming

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/proxy/hls` | Proxies HLS `.m3u8` / `.ts` segments (rewrites URLs, injects CORS headers) |
| GET | `/proxy/subtitle` | Proxies subtitle files with CORS headers |
| POST | `/server/lookmovie` | Resolves a LookMovie stream URL from a TMDB ID and media type |

### Books

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/book-search?q=` | Google Books search; returns titles, authors, descriptions, and download links |

---

## Frontend Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/auth` | Auth | Login / register |
| `/app` | App (Home) | Hero banner, Continue Watching, My List, Trending |
| `/search` | Search | Full search with filters |
| `/watch/:id` | Watch | Video player + episode selector + reviews |
| `/books` | Books | Book search |
| `/admin` | Admin | Platform stats (manav only) |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, React Router |
| Video | HLS.js, Plyr |
| Backend | Node.js, Express |
| Database | Firebase Realtime Database |
| Auth | Firebase Admin SDK + custom tokens |
| Media API | TMDB (The Movie Database) |
| Email | SendGrid |
| Deployment | Firebase Hosting (frontend), custom server (backend) |

---

## Running Locally

### Backend
```sh
cd back
npm install
# Create a .env file with the variables below, then:
node server.js
```

### Frontend
```sh
cd front
npm install
npm run dev   # http://localhost:3000
```

### Build & Deploy (frontend)
```sh
cd front
npm run build
npm run deploy   # deploys to Firebase Hosting
```

### Environment Variables

Create a `.env` file in `/back`:

| Variable | Description |
|----------|-------------|
| `GOOGLE_CREDENTIALS` | Firebase Admin SDK service account JSON |
| `TMDB_Credentials` | TMDB API key |
| `mailAPIkey` | SendGrid API key |
