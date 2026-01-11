# Testing Instructions - Golden Hind Mobile App

## Pre-Testing Checklist

- [ ] Node.js installed (v14+)
- [ ] npm or yarn installed
- [ ] Expo Go app installed on your phone
- [ ] Phone and computer on same WiFi network

## Step-by-Step Testing Guide

### 1. Initial Setup (First Time Only)

```bash
cd c:\Users\manav\Documents\Development\golden-hind\iosfront
npm install
```

### 2. Start the Development Server

```bash
npm start
```

You should see:
- Terminal showing "Metro waiting on..."
- QR code in the terminal
- Or browser opening with Expo DevTools

### 3. Open on Your Device

#### iOS:
1. Open the Camera app
2. Point at the QR code
3. Tap the notification to open in Expo Go

#### Android:
1. Open Expo Go app
2. Tap "Scan QR Code"
3. Scan the QR code from terminal

### 4. Test Flow

#### A. Authentication
1. **Register a new account**
   - Tap "Don't have an account? Register"
   - Enter username, email, password
   - Tap "Register"
   - Check email for verification (if email service is set up)
   - Return to app and login

2. **Login**
   - Enter username and password
   - Tap "Login"
   - Should redirect to Home screen

#### B. Home Screen
1. **Check sections load**
   - Continue Watching (if you have history)
   - My Bookmarks (if you have bookmarks)
   - Trending Now
   
2. **Pull to refresh**
   - Swipe down from top
   - Content should reload

3. **Navigate**
   - Tap "Browse" in top navigation
   - Should go to Search screen

#### C. Search
1. **Perform search**
   - Enter movie/TV show name (e.g., "Inception")
   - Tap "Search" or hit Enter
   - Results should display

2. **Navigate results**
   - Tap "Next" to see page 2
   - Tap "Previous" to go back
   - Page number should update

3. **Open content**
   - Tap any movie/TV show card
   - Should navigate to Watch screen

#### D. Watch Screen - Movie
1. **Video player**
   - WebView should load video player
   - Tap play to start video
   - Video should play (may take a moment to buffer)

2. **Bookmark**
   - Tap star icon (☆) in top-right
   - Should turn filled (★)
   - Alert should confirm "Added to bookmarks"

3. **Provider switching**
   - If video doesn't load, tap different provider
   - Options: VidLink, VidSrc.me, VidSrc.icu
   - WebView should reload with new provider

#### E. Watch Screen - TV Show
1. **Season/Episode navigation**
   - Use + and - buttons to change season
   - Use + and - buttons to change episode
   - Video should reload when changed

2. **Quick navigation**
   - Tap "Next →" button
   - Should go to next episode
   - Tap "← Previous" button
   - Should go to previous episode

3. **Auto-play toggle**
   - Toggle "Auto Play Next Episode"
   - Switch should animate
   - Next episode should auto-play when current finishes (if enabled)

#### F. Back Navigation
1. **Return to Home**
   - Tap "← Back" button
   - Should return to previous screen
   - Tap "Home" in top navigation
   - Should go to Home screen

2. **Logout**
   - Tap profile icon (👤) in top-right
   - Tap "Logout"
   - Should return to Auth screen

## Common Issues & Solutions

### Issue: "Unable to connect to Metro"
**Solution**: 
- Check WiFi connection
- Try "Tunnel" mode: `npm start -- --tunnel`
- Restart Expo server

### Issue: "Network request failed"
**Solution**:
- Check internet connection
- Verify backend API is running
- Check API URL in `src/utils/constants.js`

### Issue: "WebView not loading video"
**Solution**:
- Wait 10-15 seconds for initial load
- Try switching video provider
- Check if video is available in your region
- Try a different movie/show

### Issue: "App crashes on startup"
**Solution**:
```bash
npm start -- --clear
```
Or:
```bash
rm -rf node_modules
npm install
npm start
```

### Issue: "Changes not reflecting"
**Solution**:
- Shake device to open dev menu
- Tap "Reload"
- Or enable "Fast Refresh" in dev menu

## Feature Testing Checklist

- [ ] User registration works
- [ ] User login works
- [ ] Home screen loads content
- [ ] Pull-to-refresh works
- [ ] Search finds results
- [ ] Pagination works (Next/Previous)
- [ ] Tapping content opens Watch screen
- [ ] Video player loads
- [ ] Video plays when tapped
- [ ] Bookmarking works (add and remove)
- [ ] Season/Episode navigation works (TV shows)
- [ ] Provider switching works
- [ ] Auto-play toggle works
- [ ] Back navigation works
- [ ] Top navigation works (Home/Browse)
- [ ] Logout works
- [ ] App remembers login after restart

## Performance Testing

1. **Load time**
   - App should start in < 3 seconds
   - Home screen should load in < 5 seconds

2. **Scroll performance**
   - Scrolling should be smooth (60fps)
   - Images should load progressively

3. **Video loading**
   - Video should start buffering within 5 seconds
   - Playback should be smooth

## Device Testing Matrix

Test on multiple devices if possible:

### iOS
- [ ] iPhone (iOS 14+)
- [ ] iPad

### Android
- [ ] Android phone (Android 8+)
- [ ] Android tablet

## Reporting Issues

When reporting issues, include:
1. Device model and OS version
2. Steps to reproduce
3. Expected behavior
4. Actual behavior
5. Screenshots/screen recording if possible

## Success Criteria

✅ All authentication flows work  
✅ Content loads and displays correctly  
✅ Video playback works  
✅ Navigation is smooth and intuitive  
✅ No crashes or freezes  
✅ Data persists across app restarts  

---

**Ready to test?** Run `npm start` and follow the steps above!

For quick testing without reading everything, follow:
1. `npm start`
2. Scan QR code with Expo Go
3. Login/Register
4. Browse and watch content
