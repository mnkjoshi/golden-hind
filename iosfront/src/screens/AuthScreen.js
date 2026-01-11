import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator
} from 'react-native';
import axios from 'axios';
import { Storage } from '../utils/storage';
import { API_ENDPOINTS } from '../utils/constants';
import { colors, commonStyles } from '../styles/commonStyles';

export default function AuthScreen({ navigation }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const user = await Storage.getItem('user');
    const token = await Storage.getItem('token');
    if (user && token) {
      navigation.replace('Home');
    }
  };

  const showNotification = (title, message) => {
    Alert.alert(title, message);
  };

  const handleLogin = async () => {
    if (!username || !password) {
      showNotification('Error', 'Missing information!');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(API_ENDPOINTS.LOGIN, {
        username,
        password
      });

      if (response.status === 200) {
        await Storage.setItem('user', response.data.username);
        await Storage.setItem('token', response.data.token);
        showNotification('Success', `Ahoy there, ${response.data.username}!`);
        setTimeout(() => {
          navigation.replace('Home');
        }, 1000);
      }
    } catch (error) {
      if (error.response) {
        switch (error.response.data) {
          case 'UNF':
            showNotification('Error', 'User not found!');
            break;
          case 'ICP':
            showNotification('Error', 'Incorrect password!');
            break;
          case 'UNV':
            showNotification('Error', 'User not verified! Check your email.');
            break;
          default:
            showNotification('Error', 'An error occurred. Please try again.');
        }
      } else {
        showNotification('Error', 'Network error. Please check your connection.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!username || !password || !email) {
      showNotification('Error', 'Missing information!');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(API_ENDPOINTS.REGISTER, {
        username,
        password,
        email
      });

      if (response.status === 200) {
        if (response.data === 'URS') {
          showNotification('Success', 'Account created! Check your email to verify.');
          setIsLogin(true);
          setPassword('');
        } else if (response.data === 'UAE') {
          showNotification('Error', 'Username already exists!');
        } else if (response.data === 'EAE') {
          showNotification('Error', 'Email already in use!');
        }
      }
    } catch (error) {
      showNotification('Error', 'An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = () => {
    if (isLogin) {
      handleLogin();
    } else {
      handleRegister();
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.content}>
        {/* Logo */}
        <Text style={styles.logo}>Golden Hind</Text>
        <Text style={styles.tagline}>Your Streaming Companion</Text>

        {/* Form */}
        <View style={styles.form}>
          <TextInput
            style={commonStyles.input}
            placeholder="Username"
            placeholderTextColor={colors.textSecondary}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            editable={!loading}
          />

          {!isLogin && (
            <TextInput
              style={[commonStyles.input, styles.inputSpacing]}
              placeholder="Email"
              placeholderTextColor={colors.textSecondary}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              editable={!loading}
            />
          )}

          <TextInput
            style={[commonStyles.input, styles.inputSpacing]}
            placeholder="Password"
            placeholderTextColor={colors.textSecondary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            editable={!loading}
          />

          {/* Submit Button */}
          <TouchableOpacity 
            style={[commonStyles.button, styles.submitButton]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Text style={commonStyles.buttonText}>
                {isLogin ? 'Login' : 'Register'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Toggle Login/Register */}
          <TouchableOpacity 
            onPress={() => {
              setIsLogin(!isLogin);
              setEmail('');
            }}
            disabled={loading}
          >
            <Text style={styles.toggleText}>
              {isLogin 
                ? "Don't have an account? Register" 
                : "Already have an account? Login"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logo: {
    fontSize: 42,
    fontWeight: 'bold',
    color: colors.primary,
    textAlign: 'center',
    marginBottom: 8,
  },
  tagline: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 48,
  },
  form: {
    width: '100%',
  },
  inputSpacing: {
    marginTop: 16,
  },
  submitButton: {
    marginTop: 24,
  },
  toggleText: {
    color: colors.primary,
    textAlign: 'center',
    marginTop: 16,
    fontSize: 14,
  },
});
