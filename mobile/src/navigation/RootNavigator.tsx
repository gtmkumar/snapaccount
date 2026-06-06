/**
 * Root Navigator
 * Switches between Auth stack and App tabs based on auth state
 */

import React, { useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import type { LinkingOptions, NavigationContainerRef } from '@react-navigation/native';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AuthNavigator } from './AuthNavigator';
import { AppNavigator } from './AppNavigator';
import { Colors } from '../constants/colors';
import { useAuthStore } from '../store/authStore';
import { initPushNotifications, configureForegroundNotificationHandler } from '../notifications/pushTokenManager';
import { wireNotificationRouter } from '../notifications/notificationRouter';

// Configure foreground notification display at module level
configureForegroundNotificationHandler();

/**
 * Deep-link config for the org-invite flow (Phase 2).
 *
 * `snapaccount://invite/{token}` → AcceptInvite (with the token route param).
 * The same screen name is registered in BOTH navigators:
 *   - unauthenticated: AcceptInvite lives at the top of the Auth stack.
 *   - authenticated:   AcceptInvite lives inside MoreTab → MoreStack.
 * Providing both nestings lets React Navigation resolve the path against whichever
 * navigator is currently mounted.
 */
type RootLinkParamList = {
  AcceptInvite: { token?: string } | undefined;
  MoreTab: undefined;
};

const linking: LinkingOptions<RootLinkParamList> = {
  prefixes: ['snapaccount://'],
  config: {
    screens: {
      // Auth stack (unauthenticated)
      AcceptInvite: 'invite/:token',
      // App tab navigator (authenticated) — AcceptInvite nested under MoreTab/MoreStack
      MoreTab: {
        screens: {
          AcceptInvite: 'invite/:token',
        },
      },
    },
  },
};

export function RootNavigator() {
  const { isAuthenticated, isLoading, setLoading } = useAuthStore();
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
    // Auth is driven by the backend session token (a LOCAL_AUTH JWT issued by
    // /auth/otp/verify) held in the auth store. The token is intentionally NOT
    // persisted at rest, so if a previous session restored `isAuthenticated`
    // without a token, treat the user as logged out and re-run the OTP flow.
    const { firebaseToken, signOut } = useAuthStore.getState();
    if (!firebaseToken) {
      signOut();
    }
    setLoading(false);
  }, [setLoading]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.brand[500]} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef} linking={linking} onReady={handleNavigationReady}>
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
