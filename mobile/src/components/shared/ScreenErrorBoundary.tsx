/**
 * ScreenErrorBoundary — AND-09 (live Android sweep 2026-06-11)
 *
 * A render error inside a screen must never red-screen the app or strand the
 * user (on Android, dismissing the crash overlay + hardware BACK exited the
 * app entirely). This boundary catches the error and renders an in-app
 * fallback with "Try again" (re-mounts the screen) and "Back" (pops the
 * navigator) actions, so navigation state stays intact.
 *
 * Usage (navigator registration):
 *   <Stack.Screen name="PrivacyCenter" component={withScreenErrorBoundary(PrivacyCenterScreen)} />
 *
 * Note: this is a class component because React error boundaries require
 * componentDidCatch/getDerivedStateFromError. It therefore reads translations
 * via the i18n instance directly instead of the useTranslation hook.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import i18n from '../../i18n';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';

interface ScreenErrorBoundaryProps {
  children: React.ReactNode;
  /** Pops back to the previous screen. Hidden when not provided. */
  onBack?: () => void;
}

interface ScreenErrorBoundaryState {
  hasError: boolean;
}

export class ScreenErrorBoundary extends React.Component<
  ScreenErrorBoundaryProps,
  ScreenErrorBoundaryState
> {
  state: ScreenErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ScreenErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Crashlytics picks this up via the global JS error console hook.
    // eslint-disable-next-line no-console
    console.error('[ScreenErrorBoundary]', error, info.componentStack);
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false });
  };

  render(): React.ReactNode {
    if (!this.state.hasError) return this.props.children;
    return <ErrorFallback onRetry={this.handleRetry} onBack={this.props.onBack} />;
  }
}

/**
 * Themed fallback UI. Hooks are not allowed inside the class boundary, so the
 * themed styles live in this function component instead.
 */
function ErrorFallback({ onRetry, onBack }: { onRetry: () => void; onBack?: () => void }) {
  const styles = useStyles();
  const { tokens } = useTheme();
  return (
    <SafeAreaView style={styles.container} testID="screen-error-boundary">
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="alert-circle-outline" size={40} color={tokens.errorFg} />
        </View>
        <Text style={styles.title}>{i18n.t('mobile.common.screenError.title')}</Text>
        <Text style={styles.body}>{i18n.t('mobile.common.screenError.body')}</Text>
        <Pressable
          style={styles.retryBtn}
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel={i18n.t('mobile.common.retry')}
          testID="screen-error-retry"
        >
          <Text style={styles.retryBtnText}>{i18n.t('mobile.common.retry')}</Text>
        </Pressable>
        {onBack && (
          <Pressable
            style={styles.backBtn}
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel={i18n.t('mobile.common.back')}
            testID="screen-error-back"
          >
            <Text style={styles.backBtnText}>{i18n.t('mobile.common.back')}</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

type NavigationLike = { goBack?: () => void; canGoBack?: () => boolean };

/**
 * Wraps a screen component in a ScreenErrorBoundary, wiring the fallback's
 * Back action to `props.navigation.goBack()` when available.
 */
export function withScreenErrorBoundary<P extends object>(
  Screen: React.ComponentType<P>,
  // Return a plain function-component type (not ComponentType<P>) so the
  // wrapped screen stays assignable to react-navigation's ScreenComponentType
  // exactly like the original function screens.
): React.FC<P> {
  function WrappedScreen(props: P): React.ReactElement {
    const navigation = (props as { navigation?: NavigationLike }).navigation;
    const canGoBack = navigation?.canGoBack ? navigation.canGoBack() : true;
    const onBack =
      navigation?.goBack && canGoBack ? () => navigation.goBack!() : undefined;
    return (
      <ScreenErrorBoundary onBack={onBack}>
        <Screen {...props} />
      </ScreenErrorBoundary>
    );
  }
  WrappedScreen.displayName = `withScreenErrorBoundary(${
    Screen.displayName ?? Screen.name ?? 'Screen'
  })`;
  return WrappedScreen;
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: tk.canvas },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: tk.errorTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: tk.textPrimary,
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    color: tk.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
  },
  retryBtn: {
    marginTop: 8,
    minHeight: 48,
    minWidth: 160,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: tk.brandCta,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryBtnText: { fontSize: 15, fontWeight: '700', color: tk.textOnBrand },
  backBtn: {
    minHeight: 44,
    minWidth: 160,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: { fontSize: 14, fontWeight: '600', color: tk.brandCta },
  }),
);
