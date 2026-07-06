/**
 * SnapAccount — Main App Entry Point
 * Bootstraps: TanStack Query, SafeAreaProvider, ThemeProvider, RootNavigator
 *
 * Provider order (outer → inner) and why:
 *   GestureHandlerRootView — must be the outermost native view.
 *   SafeAreaProvider       — insets for everything below.
 *   QueryClientProvider    — server state; ThemeProvider's debounced PATCH
 *                            uses the raw apiClient (not useQuery) so theme
 *                            has no hard dependency on it, but keeping query
 *                            above theme means any future themed query
 *                            devtools/overlays still work.
 *   ThemeProvider          — MUST wrap RootNavigator: the navigation shell
 *                            (RootNavigator loading view, AppNavigator tab
 *                            bar) and every screen consume useTheme().
 *                            Auth is a zustand store and i18n is a module
 *                            singleton — neither is a React provider, so
 *                            theme has no ordering constraint against them.
 *                            (W5-DARK-01: this provider was previously never
 *                            mounted, so the whole app silently rendered the
 *                            light-token default context value.)
 */

import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { StyleSheet } from 'react-native';
import { ThemeProvider } from './src/contexts/ThemeContext';
import { ForceUpdateGate } from './src/components/ForceUpdateGate';
import { RootNavigator } from './src/navigation/RootNavigator';
// Single shared query client (extracted so authStore.signOut can clear it).
import { queryClient } from './src/lib/queryClient';
// i18n — must be imported before any component that calls useTranslation()
import './src/i18n';

// ─────────────────────────────────────────────────────────────────────────────
// App
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <ForceUpdateGate>
              <RootNavigator />
            </ForceUpdateGate>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
