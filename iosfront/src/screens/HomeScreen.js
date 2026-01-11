import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import axios from 'axios';
import { Storage, authenticateUser } from '../utils/storage';
import { API_ENDPOINTS } from '../utils/constants';
import { colors, commonStyles } from '../styles/commonStyles';
import TopBar from '../components/TopBar';
import MediaCard from '../components/MediaCard';
import HeroBanner from '../components/HeroBanner';

export default function HomeScreen({ navigation }) {
  const [bookmarkData, setBookmarkData] = useState([]);
  const [continueData, setContinueData] = useState([]);
  const [trendingData, setTrendingData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    checkAuthAndLoadData();
  }, []);

  const checkAuthAndLoadData = async () => {
    const isAuth = await authenticateUser(navigation);
    if (isAuth) {
      loadHomeData();
    }
  };

  const loadHomeData = async () => {
    const user = await Storage.getItem('user');
    const token = await Storage.getItem('token');

    if (!user || !token) {
      navigation.replace('Auth');
      return;
    }

    try {
      setIsLoading(true);

      // Load mini data first for quick display
      const miniResponse = await axios.post(API_ENDPOINTS.HOME_MINI, {
        user,
        token
      });

      if (miniResponse.data) {
        const validBookmarks = (miniResponse.data.favouritesData || []).filter(item => item && item.id);
        const validContinues = (miniResponse.data.continuesData || []).filter(item => item && item.id);
        
        setBookmarkData(validBookmarks);
        setContinueData(validContinues);
        setIsLoading(false);

        // Load full data in background
        loadFullData(user, token);
      }
    } catch (error) {
      console.error('Error loading home data:', error);
      setIsLoading(false);
    }
  };

  const loadFullData = async (user, token) => {
    try {
      // Load full favourites
      const favResponse = await axios.post(API_ENDPOINTS.HOME_FAVOURITES, {
        user,
        token
      });

      if (favResponse.data) {
        const validBookmarks = (favResponse.data.favouritesData || []).filter(item => item && item.id);
        setBookmarkData(validBookmarks.reverse());
      }

      // Load trending
      const trendingResponse = await axios.post(API_ENDPOINTS.HOME_TRENDING, {
        user,
        token
      });

      if (trendingResponse.data && trendingResponse.data.trendingData) {
        const results = trendingResponse.data.trendingData.results || [];
        const validTrending = results.filter(item => item && item.id);
        setTrendingData(validTrending);
      }
    } catch (error) {
      console.error('Error loading full data:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadHomeData();
    setRefreshing(false);
  };

  const renderSection = (title, data) => {
    if (!data || data.length === 0) return null;

    return (
      <View style={styles.section}>
        <Text style={commonStyles.sectionTitle}>{title}</Text>
        <FlatList
          horizontal
          data={data}
          renderItem={({ item }) => <MediaCard item={item} />}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        />
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={commonStyles.centerContent}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[commonStyles.text, styles.loadingText]}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={commonStyles.container}>
      <TopBar />
      <ScrollView
        style={commonStyles.scrollView}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Hero Banner */}
        {trendingData && trendingData.length > 0 && (
          <HeroBanner items={trendingData} navigation={navigation} />
        )}
        
        {renderSection('Continue Watching', continueData)}
        {renderSection('My Bookmarks', bookmarkData)}
        {renderSection('Trending Now', trendingData)}
        
        {!continueData.length && !bookmarkData.length && !trendingData.length && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No content available</Text>
            <Text style={commonStyles.text}>Start exploring by searching for movies and TV shows!</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginVertical: 12,
  },
  listContent: {
    paddingHorizontal: 16,
  },
  loadingText: {
    marginTop: 12,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
});
