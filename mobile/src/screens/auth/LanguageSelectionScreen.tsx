/**
 * Language Selection Screen — Redesign 2026
 * Premium grid with refined selection states
 */

import React, { useState } from 'react';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import {
  AppLanguage,
  LANGUAGES,
  usePreferencesStore,
} from '../../store/preferencesStore';
import type { AuthStackParamList } from '../../navigation/AuthNavigator';

type LangNavProp = NativeStackNavigationProp<AuthStackParamList, 'LanguageSelection'>;

interface Props { navigation: LangNavProp }

const LANGUAGE_LIST: { code: AppLanguage; label: string; nativeLabel: string }[] =
  Object.entries(LANGUAGES).map(([code, meta]) => ({
    code: code as AppLanguage,
    label: meta.label,
    nativeLabel: meta.nativeLabel,
  }));

export function LanguageSelectionScreen({ navigation }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const { language: savedLanguage, setLanguage, setLanguageSelected } = usePreferencesStore();
  const [selected, setSelected] = useState<AppLanguage>(savedLanguage);

  const handleContinue = () => {
    setLanguage(selected);
    setLanguageSelected();
    navigation.replace('PermissionRequests');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.illustration}>
            <Ionicons name="language-outline" size={28} color={tokens.brand500} />
          </View>
          <Text style={styles.heading}>{t('mobile.auth.language.heading')}</Text>
          <Text style={styles.subtext}>{t('mobile.auth.language.subtext')}</Text>
        </View>

        {/* Language grid */}
        <FlatList
          data={LANGUAGE_LIST}
          numColumns={2}
          scrollEnabled={false}
          keyExtractor={(item) => item.code}
          renderItem={({ item }) => (
            <LanguageCard
              code={item.code}
              label={item.label}
              nativeLabel={item.nativeLabel}
              selected={selected === item.code}
              onPress={() => setSelected(item.code)}
            />
          )}
          columnWrapperStyle={styles.columnWrapper}
          contentContainerStyle={styles.gridContent}
        />

        {/* Continue button */}
        <View style={styles.footer}>
          <Button
            label={t('mobile.auth.language.continue')}
            onPress={handleContinue}
            disabled={!selected}
            fullWidth
            size="lg"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

interface LanguageCardProps {
  code: AppLanguage;
  label: string;
  nativeLabel: string;
  selected: boolean;
  onPress: () => void;
}

function LanguageCard({ label, nativeLabel, selected, onPress }: LanguageCardProps) {
  const { tokens } = useTheme();
  const styles = useStyles();
  return (
    <TouchableOpacity
      style={[styles.langCard, selected && styles.langCardSelected]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${label} (${nativeLabel})`}
      activeOpacity={0.7}
    >
      <Text
        style={[
          styles.nativeLabel,
          selected && styles.nativeLabelSelected,
        ]}
      >
        {nativeLabel}
      </Text>
      <Text
        style={[
          styles.langLabel,
          selected && styles.langLabelSelected,
        ]}
      >
        {label}
      </Text>
      {selected && (
        <View style={styles.checkmark}>
          <Ionicons name="checkmark" size={12} color={tokens.textOnBrand} />
        </View>
      )}
    </TouchableOpacity>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tk.raised,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  illustration: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: tk.brandTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  heading: {
    fontSize: 26,
    fontWeight: '800',
    color: tk.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtext: {
    fontSize: 14,
    color: tk.textSecondary,
    textAlign: 'center',
  },
  columnWrapper: {
    gap: 12,
    marginBottom: 12,
  },
  gridContent: {
    paddingBottom: 8,
  },
  langCard: {
    flex: 1,
    padding: 18,
    backgroundColor: tk.raised,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: tk.border,
    alignItems: 'center',
    minHeight: 84,
    justifyContent: 'center',
    position: 'relative',
  },
  langCardSelected: {
    borderColor: tk.brand500,
    borderWidth: 2,
    backgroundColor: tk.brandTint,
    shadowColor: tk.brand500,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  nativeLabel: {
    fontSize: 20,
    fontWeight: '700',
    color: tk.textPrimary,
    marginBottom: 4,
  },
  nativeLabelSelected: {
    color: tk.brandFg,
  },
  langLabel: {
    fontSize: 12,
    color: tk.textSecondary,
  },
  langLabelSelected: {
    color: tk.brandCta,
    fontWeight: '500',
  },
  checkmark: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: tk.brand500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    marginTop: 24,
  },
  }),
);
