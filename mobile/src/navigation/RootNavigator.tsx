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
import { useTheme, createThemedStyles, type ThemeTokens } from '../contexts/ThemeContext';
import { useAuthStore } from '../store/authStore';
import { initPushNotifications, configureForegroundNotificationHandler } from '../notifications/pushTokenManager';
import { wireNotificationRouter } from '../notifications/notificationRouter';

// Configure foreground notification display at module level
configureForegroundNotificationHandler();

/**
 * Deep-link config for the org-invite flow (Phase 2).
 *
 * `snapaccount://invite/{token}` → AcceptInvite (with the token route param).
 * AcceptInvite is registered in BOTH navigators (Auth stack when logged out,
 * MoreTab → MoreStack when logged in), but the `invite/:token` PATTERN must map to
 * exactly ONE screen in the linking config — declaring it twice makes React
 * Navigation throw "conflicting screens that map to the same pattern". Because
 * RootNavigator mounts only one of the two navigators at a time (keyed on
 * isAuthenticated), we build the config to match whichever navigator is active so
 * the pattern is present exactly once.
 */
type RootLinkParamList = {
  AcceptInvite: { token?: string } | undefined;
  MoreTab: undefined;
};

function buildLinking(isAuthenticated: boolean): LinkingOptions<RootLinkParamList> {
  return {
    prefixes: ['snapaccount://'],
    config: {
      screens: isAuthenticated
        ? // App tab navigator — AcceptInvite nested under MoreTab/MoreStack
          { MoreTab: { screens: { AcceptInvite: 'invite/:token' } } }
        : // Auth stack — AcceptInvite at the top level
          { AcceptInvite: 'invite/:token' },
    },
  };
}

export function RootNavigator() {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { isAuthenticated, isLoading, setLoading } = useAuthStore();
  const navigationRef = useRef<NavigationContainerRef<Record<string, object | undefined>>>(null);
  // Build the linking config for the currently-mounted navigator so the
  // `invite/:token` pattern is declared exactly once (see buildLinking above).
  // Cheap object literal — no useMemo needed (avoids a hook that complicates HMR).
  const linking = buildLinking(isAuthenticated);

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
        <ActivityIndicator size="large" color={tokens.brand500} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef} linking={linking} onReady={handleNavigationReady}>
      {isAuthenticated ? <AppNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tk.canvas,
  },
  }),
);
