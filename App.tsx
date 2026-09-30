/**
 * App.tsx
 * FabricMatcher App Entry Point
 */

import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { FabricStoreProvider } from './src/state/useFabricStore';
import AppNavigator from './src/navigation/AppNavigator';
import { Colors } from './src/components/theme';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
      <FabricStoreProvider>
        <NavigationContainer>
          <AppNavigator />
        </NavigationContainer>
      </FabricStoreProvider>
    </SafeAreaProvider>
  );
}
