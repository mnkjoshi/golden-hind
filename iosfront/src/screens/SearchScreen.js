import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import axios from 'axios';
import { Storage, authenticateUser } from '../utils/storage';
import { API_ENDPOINTS, getGenreNames } from '../utils/constants';
import { colors, commonStyles } from '../styles/commonStyles';
import TopBar from '../components/TopBar';
import MediaCard from '../components/MediaCard';

export default function SearchScreen({ navigation, route }) {
  const [results, setResults] = useState([]);
  const [currentSearch, setCurrentSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const itemsPerPage = 20;

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (route.params?.searched && route.params.searched !== currentSearch) {
      performSearch(route.params.searched);
    }
  }, [route.params?.searched]);

  const checkAuth = async () => {
    await authenticateUser(navigation);
  };

  const performSearch = async (query) => {
    if (!query) return;

    setLoading(true);
    try {
      const response = await axios.post(API_ENDPOINTS.SEARCH, {
        query: query
      });

      setCurrentSearch(query);
      setSearchInput(query);
      setPage(0);
      setResults(response.data || []);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    if (searchInput.trim()) {
      performSearch(searchInput.trim());
    }
  };

  const totalPages = Math.ceil(results.length / itemsPerPage);
  const currentResults = results.slice(page * itemsPerPage, (page + 1) * itemsPerPage);

  const renderPagination = () => {
    if (totalPages <= 1) return null;

    return (
      <View style={styles.pagination}>
        <TouchableOpacity
          style={[styles.pageButton, page === 0 && styles.pageButtonDisabled]}
          onPress={() => setPage(Math.max(0, page - 1))}
          disabled={page === 0}
        >
          <Text style={styles.pageButtonText}>← Previous</Text>
        </TouchableOpacity>

        <Text style={styles.pageInfo}>
          Page {page + 1} of {totalPages}
        </Text>

        <TouchableOpacity
          style={[styles.pageButton, page >= totalPages - 1 && styles.pageButtonDisabled]}
          onPress={() => setPage(Math.min(totalPages - 1, page + 1))}
          disabled={page >= totalPages - 1}
        >
          <Text style={styles.pageButtonText}>Next →</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={commonStyles.container}>
      <TopBar showSearch={false} />
      
      <View style={styles.searchHeader}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search movies, TV shows..."
          placeholderTextColor={colors.textSecondary}
          value={searchInput}
          onChangeText={setSearchInput}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
          <Text style={styles.searchButtonText}>Search</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={commonStyles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[commonStyles.text, styles.loadingText]}>Searching...</Text>
        </View>
      ) : (
        <>
          {currentSearch && (
            <Text style={styles.resultsText}>
              {results.length} results for "{currentSearch}"
            </Text>
          )}

          {currentResults.length > 0 ? (
            <>
              <FlatList
                data={currentResults}
                renderItem={({ item }) => <MediaCard item={item} />}
                keyExtractor={(item, index) => `${item.id}-${index}`}
                numColumns={2}
                contentContainerStyle={styles.gridContent}
                columnWrapperStyle={styles.row}
              />
              {renderPagination()}
            </>
          ) : currentSearch ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No results found</Text>
              <Text style={commonStyles.text}>Try a different search term</Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Start Searching</Text>
              <Text style={commonStyles.text}>Search for your favorite movies and TV shows</Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  searchHeader: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    backgroundColor: colors.cardBg,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    color: colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    borderRadius: 8,
    justifyContent: 'center',
  },
  searchButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  resultsText: {
    color: colors.textSecondary,
    fontSize: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  gridContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  pageButton: {
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  pageButtonDisabled: {
    backgroundColor: colors.cardBg,
    opacity: 0.5,
  },
  pageButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  pageInfo: {
    color: colors.text,
    fontSize: 14,
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
