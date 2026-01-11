import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../styles/commonStyles';
import { logout } from '../utils/storage';

export default function TopBar({ showSearch = true, title = "Golden Hind" }) {
  const [searchValue, setSearchValue] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const navigation = useNavigation();

  const handleSearch = () => {
    if (searchValue.trim()) {
      navigation.navigate('Search', { searched: searchValue.trim() });
      setSearchValue('');
    }
  };

  const handleLogout = async () => {
    await logout(navigation);
    setDropdownOpen(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Logo/Brand */}
        <TouchableOpacity 
          style={styles.logoContainer}
          onPress={() => navigation.navigate('Home')}
        >
          <Image 
            source={require('../../assets/GoldenHind.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <Text style={styles.logo}>{title}</Text>
        </TouchableOpacity>

        {/* Navigation */}
        <View style={styles.nav}>
          <TouchableOpacity 
            style={styles.navButton}
            onPress={() => navigation.navigate('Home')}
          >
            <Text style={styles.navText}>Home</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.navButton}
            onPress={() => navigation.navigate('Search')}
          >
            <Text style={styles.navText}>Browse</Text>
          </TouchableOpacity>
        </View>

        {/* Right Side */}
        <View style={styles.rightSide}>
          {showSearch && (
            <View style={styles.searchContainer}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search..."
                placeholderTextColor={colors.textSecondary}
                value={searchValue}
                onChangeText={setSearchValue}
                onSubmitEditing={handleSearch}
                returnKeyType="search"
              />
            </View>
          )}
          
          <TouchableOpacity 
            style={styles.profileButton}
            onPress={() => setDropdownOpen(!dropdownOpen)}
          >
            <Text style={styles.profileText}>👤</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Dropdown Menu */}
      {dropdownOpen && (
        <View style={styles.dropdown}>
          <TouchableOpacity style={styles.dropdownItem} onPress={handleLogout}>
            <Text style={styles.dropdownText}>Logout</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingTop: 50, // Account for status bar
    paddingBottom: 12,
    paddingHorizontal: 16,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoImage: {
    width: 32,
    height: 32,
  },
  logo: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.primary,
  },
  nav: {
    flexDirection: 'row',
    gap: 16,
    flex: 1,
    marginLeft: 24,
  },
  navButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  navText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '500',
  },
  rightSide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  searchContainer: {
    width: 150,
  },
  searchInput: {
    backgroundColor: colors.cardBg,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    color: colors.text,
    fontSize: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  profileButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileText: {
    fontSize: 18,
  },
  dropdown: {
    position: 'absolute',
    top: 100,
    right: 16,
    backgroundColor: colors.cardBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 150,
    zIndex: 1000,
  },
  dropdownItem: {
    padding: 12,
  },
  dropdownText: {
    color: colors.text,
    fontSize: 16,
  },
});
