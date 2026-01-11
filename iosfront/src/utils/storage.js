import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { API_ENDPOINTS } from './constants';

// Storage functions
export const Storage = {
  async setItem(key, value) {
    try {
      await AsyncStorage.setItem(key, value);
    } catch (error) {
      console.error('Error storing data:', error);
    }
  },

  async getItem(key) {
    try {
      const value = await AsyncStorage.getItem(key);
      return value;
    } catch (error) {
      console.error('Error retrieving data:', error);
      return null;
    }
  },

  async removeItem(key) {
    try {
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.error('Error removing data:', error);
    }
  },

  async clear() {
    try {
      await AsyncStorage.clear();
    } catch (error) {
      console.error('Error clearing storage:', error);
    }
  }
};

// Authentication check
export const authenticateUser = async (navigation) => {
  const user = await Storage.getItem('user');
  const token = await Storage.getItem('token');
  
  if (!user || !token) {
    navigation.replace('Auth');
    return false;
  }
  
  return true;
};

// Logout function
export const logout = async (navigation) => {
  await Storage.removeItem('user');
  await Storage.removeItem('token');
  await Storage.removeItem('bookmarks');
  await Storage.removeItem('continues');
  navigation.replace('Auth');
};
