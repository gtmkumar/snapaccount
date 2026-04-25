/**
 * Root Navigator
 * Switches between Auth stack and App tabs based on auth state
 */

import React, { useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import type { NavigationContainerRef } from '@react-navigation/native';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AuthNavigator } from './AuthNavigator';
import { AppNavigator } from './AppNavigator';
import { Colors } from '../constants/colors';
import { useAuthStore } from '../store/authStore';
import { FirebaseAuth } from '../lib/firebase';
import { initPushNotifications, configureForegroundNotificationHandler } from '../notifications/pushTokenManager';
import { wireNotificationRouter } from '../notifications/notificationRouter';

// Configure foreground notification display at module level
configureForegroundNotificationHandler();

export function RootNavigator() {
  const { isAuthenticated, isLoading, setLoading, signOut, setAuthenticated } = useAuthStore();
  const navigationRef = useRef<NavigationContainerRef<Record<string, object | undefined>>>(null);

  // Wire push deep-link router once nav is ready
  const handleNavigationReady = () => {
    if (navigationRef.current) {
      const cleanup = wireNotificationRouter(navigationRef.current);
      // Stored for future cleanup if needed; module-level for now
      return cleanup;
    }
  };

  // Initialise FCM/APNs token registration when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      initPushNotifications().catch(console.warn);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    // Listen to Firebase auth state
    const unsubscribe = FirebaseAuth.onAuthStateChanged((user) => {
      if (user) {
        // ─────────────────────────────────────────────────────────────────────
        // WARNING: EXPO GO TESTING ARTIFACT
        // The mock firebase.ts (lib/firebase.ts) is used during Expo Go
        // development and does not return real user profile data. The
        // fallback values below ('Test User', '+919876543210') are only
        // reached when the real Firebase user object has no displayName or
        // phoneNumber. When using real Firebase Auth in production, these
        // fields will be populated from the actual authenticated user.
        //
        // TODO (before production release):
        //   - Replace 'mock-id-token' with a real Firebase ID token via
        //     user.getIdToken().
        //   - Remove the Expo Go mock shim from lib/firebase.ts.
        //   - Verify that user.displayName and user.phoneNumber are set
        //     during onboarding before relying on them here.
        // ─────────────────────────────────────────────────────────────────────
        setAuthenticated('mock-id-token', {
          id: user.uid,
          firebaseUid: user.uid,
          phone: user.phoneNumber ?? '+919876543210',
          name: (user as { displayName?: string | null }).displayName ?? 'Test User',
          userType: 'business_owner',
          aadhaarVerified: false,
          profileComplete: true,
          createdAt: new Date().toISOString(),
        });
      } else {
        // Firebase signed out — clear local state
        signOut();
      }
      setLoading(false);
    });

    return unsubscribe;
  }, [setLoading, signOut, setAuthenticated]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.brand[500]} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef} onReady={handleNavigationReady}>
      {isAuthenticated ? <AppNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bg.base,
  },
});
