/**
 * AppearanceScreen — theme picker (System / Light / Dark).
 * DG-MOBUX-02 · docs/design/mobile/ux/dark-mode-mobile.md §4 (Toggle UX) & §11 (Settings UI)
 *
 * Three radio cards wired to useTheme().setTheme. setTheme already persists the
 * preference locally (AsyncStorage) and debounce-PATCHes /auth/me/preferences,
 * so this screen is purely the UI surface — no extra storage/network code here.
 */

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  useTheme,
  createThemedStyles,
  type ThemePreference,
  type ThemeTokens,
} from '../../contexts/ThemeContext';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type NavProp = NativeStackNavigationProp<MoreStackParamList, 'Appearance'>;
interface Props { navigation: NavProp }

const OPTIONS: {
  pref: ThemePreference;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}[] = [
  { pref: 'system', icon: 'phone-portrait-outline' },
  { pref: 'light', icon: 'sunny-outline' },
  { pref: 'dark', icon: 'moon-outline' },
];

export function AppearanceScreen({ navigation }: Props) {
  const { tokens, preference, setTheme } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.common.back')}
        >
          <Ionicons name="arrow-back" size={22} color={tokens.textPrimary} />
        </Pressable>
        <Text style={styles.title}>{t('mobile.appearance.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>{t('mobile.appearance.heading')}</Text>
        <Text style={styles.subtitle}>{t('mobile.appearance.subtitle')}</Text>

        <View
          style={styles.cardGroup}
          accessibilityRole="radiogroup"
          testID="appearance-options"
        >
          {OPTIONS.map((opt) => {
            const selected = preference === opt.pref;
            const optionLabel = t(`mobile.appearance.options.${opt.pref}.label`);
            return (
              <Pressable
                key={opt.pref}
                style={[styles.card, selected && styles.cardSelected]}
                onPress={() => setTheme(opt.pref)}
                accessibilityRole="radio"
                accessibilityState={{ selected, checked: selected }}
                accessibilityLabel={t(
                  selected
                    ? 'mobile.appearance.selectedA11y'
                    : 'mobile.appearance.notSelectedA11y',
                  { option: optionLabel },
                )}
                testID={`appearance-option-${opt.pref}`}
              >
                <View
                  style={[
                    styles.iconWrap,
                    { backgroundColor: selected ? tokens.brandTint : tokens.sunken },
                  ]}
                >
                  <Ionicons
                    name={opt.icon}
                    size={22}
                    color={selected ? tokens.brand500 : tokens.textSecondary}
                  />
                </View>
                <View style={styles.cardText}>
                  <Text style={styles.cardLabel}>{optionLabel}</Text>
                  <Text style={styles.cardDesc}>
                    {t(`mobile.appearance.options.${opt.pref}.desc`)}
                  </Text>
                </View>
                <View
                  style={[styles.radio, selected && styles.radioSelected]}
                >
                  {selected && (
                    <Ionicons name="checkmark" size={14} color={tokens.textOnBrand} />
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.footerNote}>{t('mobile.appearance.footerNote')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: tk.canvas },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: tk.raised,
      borderBottomWidth: 1,
      borderBottomColor: tk.border,
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: tk.sunken,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { fontSize: 18, fontWeight: '700', color: tk.textPrimary, letterSpacing: -0.2 },
    scrollContent: { padding: 16, gap: 8 },
    heading: { fontSize: 22, fontWeight: '800', color: tk.textPrimary, letterSpacing: -0.3 },
    subtitle: { fontSize: 14, color: tk.textSecondary, marginBottom: 8 },
    cardGroup: { gap: 12, marginTop: 4 },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      backgroundColor: tk.raised,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: tk.border,
      padding: 16,
      minHeight: 64,
    },
    cardSelected: { borderColor: tk.brand500, backgroundColor: tk.brandTint },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardText: { flex: 1 },
    cardLabel: { fontSize: 16, fontWeight: '700', color: tk.textPrimary, letterSpacing: -0.2 },
    cardDesc: { fontSize: 13, color: tk.textSecondary, marginTop: 2 },
    radio: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: tk.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioSelected: { borderColor: tk.brand500, backgroundColor: tk.brand500 },
    footerNote: { fontSize: 13, color: tk.textTertiary, marginTop: 16, lineHeight: 18 },
  }),
);
