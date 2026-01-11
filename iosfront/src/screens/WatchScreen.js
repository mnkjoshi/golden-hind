import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';
import axios from 'axios';
import { Storage, authenticateUser } from '../utils/storage';
import { API_ENDPOINTS, getVideoUrl, VIDEO_PROVIDERS } from '../utils/constants';
import { colors, commonStyles } from '../styles/commonStyles';

export default function WatchScreen({ navigation, route }) {
  const { id } = route.params;
  const type = id.slice(0, 1) === 'm' ? 'movie' : 'tv';
  const vidID = id.slice(1);

  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);
  const [maxEp, setMaxEp] = useState(1);
  const [maxSe, setMaxSe] = useState(1);
  const [provider, setProvider] = useState(VIDEO_PROVIDERS.VIDLINK);
  const [autoPlay, setAutoPlay] = useState(false);
  const [autoNext, setAutoNext] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [webViewKey, setWebViewKey] = useState(0);
  const [currentUrl, setCurrentUrl] = useState('');
  const webViewRef = React.useRef(null);

  useEffect(() => {
    checkAuth();
    loadVideoData();
  }, []);

  useEffect(() => {
    // Reload WebView when season, episode, or provider changes
    setWebViewKey(prev => prev + 1);
    const url = getVideoUrl(provider, type, vidID, season, episode, autoPlay);
    setCurrentUrl(url);
  }, [season, episode, provider, autoPlay]);

  const checkAuth = async () => {
    await authenticateUser(navigation);
  };

  const loadVideoData = async () => {
    const user = await Storage.getItem('user');
    const token = await Storage.getItem('token');

    try {
      setLoading(true);

      if (type === 'movie') {
        const response = await axios.post(API_ENDPOINTS.MRETRIEVE, {
          user,
          token,
          movie: vidID
        });
        const movieData = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
        setData(movieData);
      } else {
        const response = await axios.post(API_ENDPOINTS.SRETRIEVE, {
          user,
          token,
          series: vidID
        });
        const seriesData = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
        setData(seriesData);
        if (response.data.seasons) {
          setMaxSe(response.data.seasons.length);
          if (response.data.seasons[0]) {
            setMaxEp(response.data.seasons[0].episode_count || 1);
          }
        }
      }

      // Check if bookmarked
      const bookmarks = await Storage.getItem('bookmarks');
      if (bookmarks) {
        const bookmarkList = JSON.parse(bookmarks);
        setBookmarked(bookmarkList.includes(vidID));
      }

      setLoading(false);
    } catch (error) {
      console.error('Error loading video data:', error);
      setLoading(false);
    }
  };

  const toggleBookmark = async () => {
    const user = await Storage.getItem('user');
    const token = await Storage.getItem('token');

    try {
      const favId = type === 'movie' ? 'm' + vidID : 't' + vidID;
      
      if (bookmarked) {
        await axios.post(API_ENDPOINTS.UNFAVOURITE, {
          user,
          token,
          favId: favId
        });
        setBookmarked(false);
        Alert.alert('Success', 'Removed from bookmarks');
      } else {
        await axios.post(API_ENDPOINTS.FAVOURITE, {
          user,
          token,
          favId: favId
        });
        setBookmarked(true);
        Alert.alert('Success', 'Added to bookmarks');
      }
    } catch (error) {
      console.error('Error toggling bookmark:', error);
      Alert.alert('Error', 'Failed to update bookmark');
    }
  };

  const updateContinueWatching = async () => {
    const user = await Storage.getItem('user');
    const token = await Storage.getItem('token');

    try {
      const favId = type === 'movie' ? 'm' + vidID : 't' + vidID;
      await axios.post(API_ENDPOINTS.CONTINUE, {
        user,
        token,
        favId: favId
      });
      
      // Update progress for TV shows
      if (type === 'tv') {
        await axios.post(API_ENDPOINTS.PROGRESS_UPDATE, {
          user,
          token,
          progID: vidID,
          progStatus: `${season};${episode}`
        });
      }
    } catch (error) {
      console.error('Error updating continue watching:', error);
    }
  };

  const handleNextEpisode = () => {
    if (type === 'tv') {
      if (episode < maxEp) {
        setEpisode(episode + 1);
        updateContinueWatching();
      } else if (season < maxSe) {
        setSeason(season + 1);
        setEpisode(1);
        // Update maxEp for new season
        if (data.seasons && data.seasons[season]) {
          setMaxEp(data.seasons[season].episode_count || 1);
        }
        updateContinueWatching();
      }
    }
  };

  const handlePreviousEpisode = () => {
    if (type === 'tv') {
      if (episode > 1) {
        setEpisode(episode - 1);
      } else if (season > 1) {
        setSeason(season - 1);
        // Set to last episode of previous season
        if (data.seasons && data.seasons[season - 2]) {
          setMaxEp(data.seasons[season - 2].episode_count || 1);
          setEpisode(data.seasons[season - 2].episode_count || 1);
        }
      }
    }
  };

  const videoUrl = getVideoUrl(provider, type, vidID, season, episode, autoPlay);

  // Handle navigation state changes to block redirects
  const handleNavigationStateChange = (navState) => {
    const { url } = navState;
    
    // Allow navigation within video player domains (any domain containing vidsrc, vidlink, or cloudnestra)
    const isAllowedDomain = url.includes('vidsrc') || url.includes('vidlink') || url.includes('cloudnestra');
    
    // Update current URL if navigating within allowed domains
    if (isAllowedDomain) {
      setCurrentUrl(url);
      return;
    }
    
    // If navigating away from video player to external site, go back
    if (!isAllowedDomain && webViewRef.current && url !== currentUrl) {
      webViewRef.current.stopLoading();
      webViewRef.current.goBack();
    }
  };

  // Block new window/popup attempts
  const handleShouldStartLoadWithRequest = (request) => {
    const { url } = request;
    
    // Allow navigation within video player domains (any domain containing vidsrc, vidlink, or cloudnestra)
    const isAllowedDomain = url.includes('vidsrc') || url.includes('vidlink') || url.includes('cloudnestra');
    
    // Allow all navigation within video player domains
    if (isAllowedDomain) {
      return true;
    }
    
    // Block external redirects and popups
    console.log('Blocked navigation to:', url);
    return false;
  };

  const title = data.title || data.name || 'Loading...';
  const year = data.release_date?.substring(0, 4) || data.first_air_date?.substring(0, 4) || '';
  const rating = data.vote_average ? data.vote_average.toFixed(1) : 'N/A';

  return (
    <View style={commonStyles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={toggleBookmark} style={styles.bookmarkButton}>
          <Text style={styles.bookmarkText}>{bookmarked ? '★' : '☆'}</Text>
        </TouchableOpacity>
      </View>

      {/* Video Player */}
      <View style={styles.videoContainer}>
        <WebView
          ref={webViewRef}
          key={webViewKey}
          source={{ uri: videoUrl }}
          style={styles.webview}
          allowsFullscreenVideo={true}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
          setSupportMultipleWindows={false}
          onNavigationStateChange={handleNavigationStateChange}
          onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
          originWhitelist={['*']}
          mixedContentMode="always"
          renderLoading={() => (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          )}
        />
      </View>

      {/* Controls */}
      <ScrollView style={styles.controls}>
        {/* Title */}
        <View style={styles.infoSection}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.metadata}>
            {year} • ⭐ {rating} • {type === 'movie' ? 'Movie' : 'TV Show'}
          </Text>
          {data.overview && (
            <Text style={styles.overview}>{data.overview}</Text>
          )}
        </View>

        {/* TV Show Controls */}
        {type === 'tv' && (
          <View style={styles.episodeControls}>
            <View style={styles.controlRow}>
              <Text style={styles.controlLabel}>Season {season}</Text>
              <View style={styles.buttonGroup}>
                <TouchableOpacity
                  style={[styles.controlButton, season <= 1 && styles.controlButtonDisabled]}
                  onPress={() => setSeason(Math.max(1, season - 1))}
                  disabled={season <= 1}
                >
                  <Text style={styles.controlButtonText}>-</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.controlButton, season >= maxSe && styles.controlButtonDisabled]}
                  onPress={() => setSeason(Math.min(maxSe, season + 1))}
                  disabled={season >= maxSe}
                >
                  <Text style={styles.controlButtonText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.controlRow}>
              <Text style={styles.controlLabel}>Episode {episode}</Text>
              <View style={styles.buttonGroup}>
                <TouchableOpacity
                  style={[styles.controlButton, episode <= 1 && styles.controlButtonDisabled]}
                  onPress={() => setEpisode(Math.max(1, episode - 1))}
                  disabled={episode <= 1}
                >
                  <Text style={styles.controlButtonText}>-</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.controlButton, episode >= maxEp && styles.controlButtonDisabled]}
                  onPress={() => setEpisode(Math.min(maxEp, episode + 1))}
                  disabled={episode >= maxEp}
                >
                  <Text style={styles.controlButtonText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.navigationButtons}>
              <TouchableOpacity
                style={[commonStyles.button, styles.navButton]}
                onPress={handlePreviousEpisode}
              >
                <Text style={commonStyles.buttonText}>← Previous</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[commonStyles.button, styles.navButton]}
                onPress={handleNextEpisode}
              >
                <Text style={commonStyles.buttonText}>Next →</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Provider Selection */}
        <View style={styles.providerSection}>
          <Text style={styles.sectionTitle}>Video Provider</Text>
          <View style={styles.providerButtons}>
            <TouchableOpacity
              style={[
                styles.providerButton,
                provider === VIDEO_PROVIDERS.VIDLINK && styles.providerButtonActive
              ]}
              onPress={() => setProvider(VIDEO_PROVIDERS.VIDLINK)}
            >
              <Text style={styles.providerButtonText}>VidLink</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.providerButton,
                provider === VIDEO_PROVIDERS.VIDSRC_ME && styles.providerButtonActive
              ]}
              onPress={() => setProvider(VIDEO_PROVIDERS.VIDSRC_ME)}
            >
              <Text style={styles.providerButtonText}>VidSrc.me</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.providerButton,
                provider === VIDEO_PROVIDERS.VIDSRC_ICU && styles.providerButtonActive
              ]}
              onPress={() => setProvider(VIDEO_PROVIDERS.VIDSRC_ICU)}
            >
              <Text style={styles.providerButtonText}>VidSrc.icu</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Auto Play Toggle (TV only) */}
        {type === 'tv' && (
          <TouchableOpacity
            style={styles.toggleRow}
            onPress={() => setAutoPlay(!autoPlay)}
          >
            <Text style={styles.toggleText}>Auto Play Next Episode</Text>
            <View style={[styles.toggle, autoPlay && styles.toggleActive]}>
              <View style={[styles.toggleThumb, autoPlay && styles.toggleThumbActive]} />
            </View>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    padding: 8,
  },
  backText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  bookmarkButton: {
    padding: 8,
  },
  bookmarkText: {
    fontSize: 24,
    color: colors.primary,
  },
  videoContainer: {
    width: '100%',
    height: 250,
    backgroundColor: '#000',
  },
  webview: {
    flex: 1,
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  controls: {
    flex: 1,
  },
  infoSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  metadata: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  overview: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  episodeControls: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  controlLabel: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '600',
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  controlButton: {
    backgroundColor: colors.primary,
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlButtonDisabled: {
    backgroundColor: colors.cardBg,
    opacity: 0.5,
  },
  controlButtonText: {
    color: colors.text,
    fontSize: 20,
    fontWeight: 'bold',
  },
  navigationButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  navButton: {
    flex: 1,
  },
  providerSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  providerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  providerButton: {
    flex: 1,
    backgroundColor: colors.cardBg,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.border,
  },
  providerButtonActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '20',
  },
  providerButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  toggleText: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '600',
  },
  toggle: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.cardBg,
    padding: 2,
    justifyContent: 'center',
  },
  toggleActive: {
    backgroundColor: colors.primary,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.text,
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
});
