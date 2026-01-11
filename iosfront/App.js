import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import React from 'react';

// Screens
import AuthScreen from './src/screens/AuthScreen';
import HomeScreen from './src/screens/HomeScreen';
import WatchScreen from './src/screens/WatchScreen';
import SearchScreen from './src/screens/SearchScreen';

// Components
import ErrorBoundary from './src/components/ErrorBoundary';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <ErrorBoundary>
      <NavigationContainer>
        <StatusBar style="light" />
        <Stack.Navigator initialRouteName="Auth">
          <Stack.Screen 
            name="Auth" 
            component={AuthScreen}
            options={{
              headerShown: false,
              contentStyle: { backgroundColor: '#0a0e27' }
            }}
          />
          <Stack.Screen 
            name="Home" 
            component={HomeScreen}
            options={{
              headerShown: false,
              contentStyle: { backgroundColor: '#0a0e27' }
            }}
          />
          <Stack.Screen 
            name="Watch" 
            component={WatchScreen}
            options={{
              headerShown: false,
              contentStyle: { backgroundColor: '#0a0e27' }
            }}
          />
          <Stack.Screen 
            name="Search" 
            component={SearchScreen}
            options={{
              headerShown: false,
              contentStyle: { backgroundColor: '#0a0e27' }
            }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </ErrorBoundary>
  );
}
