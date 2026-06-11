/**
 * Splash Screen — Redesign 2026
 * Premium brand animation with gradient background
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { FirebaseAuth } from '../../lib/firebase';
import { useAuthStore } from '../../store/authStore';
import type { AuthStackParamList } from '../../navigation/AuthNavigator';

type SplashNavProp = NativeStackNavigationProp<AuthStackParamList, 'Splash'>;

interface SplashScreenProps {
  navigation: SplashNavProp;
}

// Full-bleed brand gradient — deliberately identical in light and dark mode
// (deep indigo 950→800→700); all text on it stays literal white.
const SPLASH_GRADIENT = ['#1E1B4B', '#3730A3', '#4338CA'] as const;

export function SplashScreen({ navigation }: SplashScreenProps) {
  const styles = useStyles();
  const { isAuthenticated, setLoading } = useAuthStore();

  const [logoOpacity] = useState(() => new Animated.Value(0));
  const [logoScale] = useState(() => new Animated.Value(0.85));
  const [logoTranslateY] = useState(() => new Animated.Value(20));
  const [taglineOpacity] = useState(() => new Animated.Value(0));
  const [bottomOpacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.spring(logoScale, {
          toValue: 1,
          tension: 60,
          friction: 10,
          useNativeDriver: true,
        }),
        Animated.timing(logoTranslateY, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(taglineOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(bottomOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(async () => {
      try {
        const currentUser = FirebaseAuth.getCurrentUser();
        if (currentUser && isAuthenticated) {
          navigation.replace('App');
        } else {
          navigation.replace('PhoneEntry');
        }
      } catch {
        navigation.replace('PhoneEntry');
      } finally {
        setLoading(false);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [isAuthenticated, navigation, logoOpacity, logoScale, logoTranslateY, taglineOpacity, bottomOpacity, setLoading]);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={SPLASH_GRADIENT}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safeArea}>
        {/* Logo area */}
        <View style={styles.centerContent}>
          <Animated.View
            style={[
              styles.logoContainer,
              {
                opacity: logoOpacity,
                transform: [{ scale: logoScale }, { translateY: logoTranslateY }],
              },
            ]}
          >
            <View style={styles.logoOuter}>
              <View style={styles.logoInner}>
                <Text style={styles.logoText}>S</Text>
              </View>
            </View>
          </Animated.View>

          <Animated.View style={{ opacity: logoOpacity }}>
            <Text style={styles.appName}>SnapAccount</Text>
          </Animated.View>

          <Animated.View style={{ opacity: taglineOpacity }}>
            <Text style={styles.tagline}>Smart accounting for Indian businesses</Text>
          </Animated.View>
        </View>

        {/* Loading indicator */}
        <Animated.View style={[styles.bottomContent, { opacity: bottomOpacity }]}>
          <ActivityIndicator color="rgba(255,255,255,0.5)" size="small" />
          <Text style={styles.madeInIndia}>Made with pride in India</Text>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const useStyles = createThemedStyles((_tk: ThemeTokens) =>
  StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  logoContainer: {
    marginBottom: 28,
  },
  logoOuter: {
    width: 110,
    height: 110,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  logoInner: {
    width: 80,
    height: 80,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontSize: 38,
    fontWeight: '800',
    color: '#FFFFFF', // on fixed SPLASH_GRADIENT
    letterSpacing: -1,
  },
  appName: {
    fontSize: 34,
    fontWeight: '800',
    color: '#FFFFFF', // on fixed SPLASH_GRADIENT
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  tagline: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    fontWeight: '400',
    letterSpacing: 0.2,
  },
  bottomContent: {
    paddingBottom: 36,
    alignItems: 'center',
    gap: 14,
  },
  madeInIndia: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 0.5,
  },
  }),
);
