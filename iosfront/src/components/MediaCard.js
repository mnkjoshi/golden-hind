import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../styles/commonStyles';

export default function MediaCard({ item, onPress }) {
  const navigation = useNavigation();
  
  const handlePress = () => {
    if (onPress) {
      onPress(item);
    } else {
      const type = item.media_type === 'movie' || item.title ? 'm' : 't';
      const id = item.id;
      navigation.navigate('Watch', { id: `${type}${id}` });
    }
  };

  const posterUrl = item.poster_path 
    ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
    : 'https://via.placeholder.com/300x450/151a35/3FA3FF?text=No+Image';

  const title = item.title || item.name || 'Unknown Title';
  const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';

  return (
    <TouchableOpacity style={styles.container} onPress={handlePress}>
      <View style={styles.imageContainer}>
        <Image 
          source={{ uri: posterUrl }}
          style={styles.poster}
          resizeMode="cover"
        />
        <View style={styles.ratingBadge}>
          <Text style={styles.ratingText}>⭐ {rating}</Text>
        </View>
      </View>
      <Text style={styles.title} numberOfLines={2}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 150,
    marginRight: 12,
  },
  imageContainer: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.cardBg,
  },
  poster: {
    width: 150,
    height: 225,
  },
  ratingBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  ratingText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  title: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
    marginTop: 8,
  },
});
