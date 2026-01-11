# Golden Hind - React Native Mobile App

A React Native mobile application for streaming movies and TV shows, built with Expo and compatible with Expo Go.

## Overview

This is the iOS/Android version of the Golden Hind streaming platform, ported from the web application. It provides a native mobile experience for browsing and watching content.

## Features

- **Authentication**: Login and registration with email verification
- **Home Screen**: Browse bookmarks, continue watching, and trending content
- **Search**: Search for movies and TV shows with pagination
- **Watch**: Stream content with multiple video providers
- **TV Show Support**: Navigate seasons and episodes
- **Bookmarks**: Save favorite content
- **Continue Watching**: Track viewing progress

## Tech Stack

- **React Native**: Mobile framework
- **Expo**: Development platform
- **React Navigation**: Screen navigation
- **Axios**: HTTP client
- **AsyncStorage**: Local data persistence
- **WebView**: Video player embedding

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Expo Go app (for testing on physical devices)

## Installation

1. Navigate to the iosfront directory:
```bash
cd iosfront
```

2. Install dependencies:
```bash
npm install
```

## Running the App

### Development Mode

Start the Expo development server:
```bash
npm start
```

This will open the Expo developer tools in your browser. You can then:

- Scan the QR code with the Expo Go app (iOS/Android)
- Press `i` to open in iOS Simulator (macOS only)
- Press `a` to open in Android Emulator
- Press `w` to open in web browser

### Platform-Specific Commands

- **iOS**: `npm run ios` (requires macOS)
- **Android**: `npm run android` (requires Android Studio/Emulator)
- **Web**: `npm run web`

## Project Structure

```
iosfront/
├── App.js                 # Main app entry with navigation
├── src/
│   ├── screens/
│   │   ├── AuthScreen.js      # Login/Registration
│   │   ├── HomeScreen.js      # Main content feed
│   │   ├── SearchScreen.js    # Search functionality
│   │   └── WatchScreen.js     # Video player
│   ├── components/
│   │   ├── TopBar.js          # Navigation header
│   │   └── MediaCard.js       # Content card component
│   ├── utils/
│   │   ├── constants.js       # API endpoints & config
│   │   └── storage.js         # AsyncStorage helpers
│   └── styles/
│       └── commonStyles.js    # Shared styles
├── app.json              # Expo configuration
└── package.json          # Dependencies
```

## API Integration

The app connects to the Golden Hind backend API at:
- Base URL: `https://golden-hind.duckdns.org`

### Key Endpoints

- `/login` - User authentication
- `/register` - New user registration
- `/home-mini` - Quick load home content
- `/home-favourites` - Full bookmarks list
- `/trending` - Trending content
- `/search` - Content search
- `/bookmark` - Add bookmark
- `/continue` - Update watch progress

## Video Providers

The app supports multiple video streaming providers:

1. **VidLink** (Default)
2. **VidSrc.me**
3. **VidSrc.icu**

Users can switch providers in the watch screen if one isn't working.

## Features in Detail

### Authentication
- Login with username and password
- Registration with email verification
- Persistent login with AsyncStorage
- Auto-redirect to home if already authenticated

### Home Screen
- Continue watching section
- Bookmarks section
- Trending content section
- Pull-to-refresh functionality
- Lazy loading for better performance

### Search
- Real-time search for movies and TV shows
- Paginated results (20 items per page)
- Genre display from TMDB
- Rating information

### Watch Screen
- Embedded WebView player
- Season/episode navigation (TV shows)
- Multiple video provider options
- Bookmark toggle
- Auto-play next episode option
- Continue watching tracking

## Development Notes

### Expo Go Compatibility

This app is fully compatible with Expo Go, meaning you can:
- Test on physical devices without building
- Use all standard Expo modules
- No custom native code required

### Key Dependencies

- `@react-navigation/native` - Navigation
- `@react-navigation/native-stack` - Stack navigation
- `react-native-webview` - Video embedding
- `@react-native-async-storage/async-storage` - Local storage
- `axios` - HTTP requests
- `firebase` - Backend integration (if needed)

## Building for Production

### iOS (requires macOS and Apple Developer account)
```bash
expo build:ios
```

### Android
```bash
expo build:android
```

### Using EAS Build (Recommended)
```bash
npm install -g eas-cli
eas build --platform ios
eas build --platform android
```

## Troubleshooting

### WebView not loading videos
- Check internet connection
- Try switching video providers
- Ensure the backend API is accessible
- Check console logs for CORS or network errors

### App crashes on startup
- Clear Expo cache: `expo start -c`
- Reinstall dependencies: `rm -rf node_modules && npm install`
- Check Expo Go app is up to date

### Authentication issues
- Verify API endpoints in `utils/constants.js`
- Check AsyncStorage permissions
- Clear app data and try again

## Future Enhancements

- [ ] Offline viewing support
- [ ] Push notifications
- [ ] Social features (watch with friends)
- [ ] Download management
- [ ] Advanced search filters
- [ ] User profiles and avatars
- [ ] Dark/light theme toggle
- [ ] Subtitle support
- [ ] Picture-in-picture mode

## License

This project is part of the Golden Hind streaming platform.

## Support

For issues or questions, please contact the development team or create an issue in the repository.
