# Quick Start Guide - Golden Hind Mobile App

## Getting Started in 3 Steps

### 1. Install Expo Go on Your Phone

**iOS**: Download from the [App Store](https://apps.apple.com/app/expo-go/id982107779)  
**Android**: Download from the [Google Play Store](https://play.google.com/store/apps/details?id=host.exp.exponent)

### 2. Start the Development Server

Open a terminal in the `iosfront` folder and run:

```bash
npm start
```

This will start the Expo development server and show a QR code.

### 3. Open the App on Your Phone

**Using Expo Go:**
- **iOS**: Open the Camera app and scan the QR code
- **Android**: Open Expo Go app and scan the QR code

The app will load on your device!

## Testing on Simulators/Emulators

### iOS Simulator (macOS only)
```bash
npm run ios
```

### Android Emulator
```bash
npm run android
```

## Common Commands

- `npm start` - Start development server
- `npm run ios` - Run on iOS simulator (macOS only)
- `npm run android` - Run on Android emulator
- `npm run web` - Run in web browser

## First Time Setup

If you haven't installed dependencies yet:

```bash
npm install
```

## Troubleshooting

### "Metro bundler error"
```bash
npm start -- --clear
```

### "Unable to resolve module"
```bash
rm -rf node_modules
npm install
npm start
```

### QR Code Not Working
- Make sure your phone and computer are on the same WiFi network
- Try using the "Tunnel" connection method instead of "LAN"

## App Features

Once the app loads, you'll see:

1. **Login/Register Screen**: Create an account or log in
2. **Home Screen**: Browse bookmarks, continue watching, and trending content
3. **Search**: Find movies and TV shows
4. **Watch**: Stream content with multiple providers

## Need Help?

- Check the full README.md for detailed documentation
- Make sure the backend API is running
- Verify your network connection

## Development Tips

- Shake your device to open the developer menu
- Enable "Live Reload" for automatic updates
- Use "Debug Remote JS" for debugging in Chrome DevTools

---

**Ready to start?** Run `npm start` and scan the QR code!
