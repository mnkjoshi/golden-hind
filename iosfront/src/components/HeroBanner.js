import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../styles/commonStyles';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export default function HeroBanner({ items, navigation: navProp }) {
  const [heroIndex, setHeroIndex] = useState(0);
  const [isAutoplaying, setIsAutoplaying] = useState(true);
  const fadeAnim = useState(new Animated.Value(1))[0];
  const navigation = navProp || useNavigation();

  const maxItems = Math.min(5, items?.length || 0);

  // Auto-rotate hero slider
  useEffect(() => {
    if (items && isAutoplaying && maxItems > 0) {
      const interval = setInterval(() => {
        handleTransition((heroIndex + 1) % maxItems);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [heroIndex, isAutoplaying, maxItems]);

  const handleTransition = (newIndex) => {
    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
    
    setTimeout(() => setHeroIndex(newIndex), 300);
  };

  const handleManualNavigation = (newIndex) => {
    setIsAutoplaying(false);
    handleTransition(newIndex);
    
    // Resume autoplay after 5 seconds
    setTimeout(() => setIsAutoplaying(true), 5000);
  };

  const handleNavigateLeft = () => {
    const newIndex = (heroIndex - 1 + maxItems) % maxItems;
    handleManualNavigation(newIndex);
  };

  const handleNavigateRight = () => {
    const newIndex = (heroIndex + 1) % maxItems;
    handleManualNavigation(newIndex);
  };

  const handlePlayPress = () => {
    const item = items[heroIndex];
    const type = item.media_type === 'movie' ? 'm' : 't';
    navigation.navigate('Watch', { id: `${type}${item.id}` });
  };

  if (!items || items.length === 0) {
    return null;
  }

  const currentItem = items[heroIndex];
  const backdropUrl = currentItem.backdrop_path
    ? `https://image.tmdb.org/t/p/w1280${currentItem.backdrop_path}`
    : `https://image.tmdb.org/t/p/w500${currentItem.poster_path}`;

  const title = currentItem.name || currentItem.title || 'Untitled';
  const year = (currentItem.release_date || currentItem.first_air_date)?.substring(0, 4) || 'N/A';
  const rating = currentItem.vote_average?.toFixed(1) || 'N/A';
  const mediaType = currentItem.media_type === 'movie' ? 'Movie' : 'TV Series';

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.imageContainer, { opacity: fadeAnim }]}>
        <Image
          source={{ uri: backdropUrl }}
          style={styles.backdropImage}
          resizeMode="cover"
        />
        <LinearGradient
          colors={['transparent', 'rgba(10, 14, 39, 0.8)', colors.background]}
          style={styles.gradient}
        />
      </Animated.View>

      {/* Navigation Arrows */}
      <TouchableOpacity style={styles.arrowLeft} onPress={handleNavigateLeft}>
        <Text style={styles.arrowText}>‹</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.arrowRight} onPress={handleNavigateRight}>
        <Text style={styles.arrowText}>›</Text>
      </TouchableOpacity>

      {/* Content */}
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={2}>{title}</Text>
          <Text style={styles.overview} numberOfLines={3}>
            {currentItem.overview}
          </Text>
          <View style={styles.meta}>
            <Text style={styles.metaItem}>⭐ {rating}</Text>
            <Text style={styles.metaItem}>{year}</Text>
            <Text style={styles.metaItem}>{mediaType}</Text>
          </View>
          <TouchableOpacity style={styles.playButton} onPress={handlePlayPress}>
            <Text style={styles.playButtonText}>▶ Play</Text>
          </TouchableOpacity>
        </View>

        {/* Indicators */}
        <View style={styles.indicators}>
          {items.slice(0, maxItems).map((_, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.indicator,
                index === heroIndex && styles.indicatorActive,
              ]}
              onPress={() => handleManualNavigation(index)}
            />
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: screenHeight * 0.6,
    position: 'relative',
    marginBottom: 20,
  },
  imageContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  backdropImage: {
    width: '100%',
    height: '100%',
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  arrowLeft: {
    position: 'absolute',
    left: 16,
    top: '50%',
    marginTop: -25,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  arrowRight: {
    position: 'absolute',
    right: 16,
    top: '50%',
    marginTop: -25,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  arrowText: {
    fontSize: 36,
    color: colors.text,
    fontWeight: 'bold',
  },
  content: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
  },
  info: {
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  overview: {
    fontSize: 14,
    color: colors.text,
    marginBottom: 12,
    lineHeight: 20,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  meta: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  metaItem: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  playButton: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  playButtonText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  indicators: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  indicatorActive: {
    backgroundColor: colors.primary,
    width: 24,
  },
});
