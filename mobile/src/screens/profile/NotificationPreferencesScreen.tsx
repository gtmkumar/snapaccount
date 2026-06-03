/**
 * Notification Preferences Screen
 * Lets the user pick their language and toggle notification channels
 * (push / SMS / email / WhatsApp).
 *
 * Hydrated from GET /auth/me/preferences; changes are saved via PATCH (partial body).
 * Reachable from Profile → "Notification Preferences".
 *
 * Language is also applied locally (i18next + preferences store) so the change is
 * reflected immediately, in addition to being persisted server-side.
 */

import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Colors } from '../../constants/colors';
import {
  getPreferences,
  updatePreferences,
  type UserPreferences,
} from '../../api/auth';
import {
  usePreferencesStore,
  LANGUAGES,
  type AppLanguage,
} from '../../store/preferencesStore';
import i18n from '../../i18n';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type NavProp = NativeStackNavigationProp<MoreStackParamList, 'NotificationPreferences'>;
interface Props { navigation: NavProp }

// Languages with full i18n bundles loaded in the app (en/hi/bn).
const SUPPORTED_LANGUAGES: AppLanguage[] = ['en', 'hi', 'bn'];

type ChannelKey =
  | 'pushNotificationsEnabled'
  | 'smsNotificationsEnabled'
  | 'emailNotificationsEnabled'
  | 'whatsappNotificationsEnabled';

const CHANNELS: { key: ChannelKey; labelKey: string; descKey: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { key: 'pushNotificationsEnabled', labelKey: 'mobile.auth.preferences.push', descKey: 'mobile.auth.preferences.pushDesc', icon: 'notifications-outline' },
  { key: 'smsNotificationsEnabled', labelKey: 'mobile.auth.preferences.sms', descKey: 'mobile.auth.preferences.smsDesc', icon: 'chatbox-outline' },
  { key: 'emailNotificationsEnabled', labelKey: 'mobile.auth.preferences.email', descKey: 'mobile.auth.preferences.emailDesc', icon: 'mail-outline' },
  { key: 'whatsappNotificationsEnabled', labelKey: 'mobile.auth.preferences.whatsapp', descKey: 'mobile.auth.preferences.whatsappDesc', icon: 'logo-whatsapp' },
];

export function NotificationPreferencesScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const setStoreLanguage = usePreferencesStore((s) => s.setLanguage);

  const { data, isLoading, isError, refetch } = useQuery<UserPreferences>({
    queryKey: ['auth', 'preferences'],
    queryFn: getPreferences,
  });

  // Local edits are kept as a partial overlay merged onto the server data; this
  // avoids syncing query data into state via an effect (no cascading renders).
  const [overrides, setOverrides] = useState<Partial<UserPreferences>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  const prefs = useMemo<UserPreferences | null>(
    () => (data ? { ...data, ...overrides } : null),
    [data, overrides],
  );

  const toggleChannel = (key: ChannelKey) => {
    if (!prefs) return;
    setOverrides((prev) => ({ ...prev, [key]: !prefs[key] }));
    setSaved(false);
    setSaveError('');
  };

  const selectLanguage = (lang: AppLanguage) => {
    setOverrides((prev) => ({ ...prev, preferredLanguage: lang }));
    setSaved(false);
    setSaveError('');
  };

  const handleSave = async () => {
    if (!prefs) return;
    setSaving(true);
    setSaveError('');
    try {
      await updatePreferences({
        preferredLanguage: prefs.preferredLanguage,
        pushNotificationsEnabled: prefs.pushNotificationsEnabled,
        smsNotificationsEnabled: prefs.smsNotificationsEnabled,
        emailNotificationsEnabled: prefs.emailNotificationsEnabled,
        whatsappNotificationsEnabled: prefs.whatsappNotificationsEnabled,
      });
      // Apply the language locally too (immediate effect + persistence).
      const lang = prefs.preferredLanguage as AppLanguage;
      if (SUPPORTED_LANGUAGES.includes(lang)) {
        setStoreLanguage(lang);
        void i18n.changeLanguage(lang);
      }
      setSaved(true);
    } catch {
      setSaveError(t('mobile.auth.preferences.saveError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel={t('mobile.common.back')}>
          <Ionicons name="arrow-back" size={22} color={Colors.neutral[800]} />
        </Pressable>
        <Text style={styles.title}>{t('mobile.auth.preferences.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading || !prefs ? (
        isError ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{t('mobile.auth.common.loadError')}</Text>
            <Button label={t('mobile.common.retry')} variant="secondary" onPress={() => refetch()} style={styles.retryBtn} />
          </View>
        ) : (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={Colors.brand[500]} />
          </View>
        )
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.subtitle}>{t('mobile.auth.preferences.subtitle')}</Text>

          {/* Language */}
          <Text style={styles.sectionLabel}>{t('mobile.auth.preferences.language')}</Text>
          <Card shadow="sm" padding="none" style={styles.card}>
            {SUPPORTED_LANGUAGES.map((lang, idx, arr) => {
              const selected = prefs.preferredLanguage === lang;
              return (
                <Pressable
                  key={lang}
                  style={[styles.langRow, idx === arr.length - 1 && { borderBottomWidth: 0 }]}
                  onPress={() => selectLanguage(lang)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <View style={styles.langInfo}>
                    <Text style={styles.langNative}>{LANGUAGES[lang].nativeLabel}</Text>
                    <Text style={styles.langName}>{LANGUAGES[lang].label}</Text>
                  </View>
                  {selected && <Ionicons name="checkmark-circle" size={22} color={Colors.brand[500]} />}
                </Pressable>
              );
            })}
          </Card>

          {/* Channels */}
          <Text style={styles.sectionLabel}>{t('mobile.auth.preferences.channels')}</Text>
          <Card shadow="sm" padding="none" style={styles.card}>
            {CHANNELS.map((ch, idx, arr) => (
              <View key={ch.key} style={[styles.channelRow, idx === arr.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={styles.channelIcon}>
                  <Ionicons name={ch.icon} size={18} color={Colors.brand[500]} />
                </View>
                <View style={styles.channelInfo}>
                  <Text style={styles.channelLabel}>{t(ch.labelKey)}</Text>
                  <Text style={styles.channelDesc}>{t(ch.descKey)}</Text>
                </View>
                <Switch
                  value={prefs[ch.key]}
                  onValueChange={() => toggleChannel(ch.key)}
                  trackColor={{ false: Colors.neutral[300], true: Colors.brand[500] }}
                  thumbColor={Colors.neutral[0]}
                  accessibilityLabel={t(ch.labelKey)}
                />
              </View>
            ))}
          </Card>

          {saved ? (
            <View style={styles.savedRow}>
              <Ionicons name="checkmark-circle" size={16} color={Colors.success[600]} />
              <Text style={styles.savedText}>{t('mobile.auth.preferences.saved')}</Text>
            </View>
          ) : null}
          {saveError ? (
            <View style={styles.savedRow}>
              <Ionicons name="alert-circle" size={16} color={Colors.error[600]} />
              <Text style={styles.errorText}>{saveError}</Text>
            </View>
          ) : null}

          <Button
            label={t('mobile.auth.preferences.save')}
            onPress={handleSave}
            loading={saving}
            fullWidth
            size="lg"
            style={styles.saveBtn}
          />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.base },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.surface.default,
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral[100],
  },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: Colors.neutral[900], letterSpacing: -0.2 },
  scrollContent: { padding: 16, gap: 8, paddingBottom: 40 },
  subtitle: { fontSize: 14, color: Colors.neutral[500], marginBottom: 8 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  errorText: { fontSize: 14, color: Colors.error[600], flex: 1 },
  retryBtn: { marginTop: 8 },

  sectionLabel: { fontSize: 12, color: Colors.neutral[400], textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 6 },
  card: { overflow: 'hidden', borderRadius: 18 },

  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral[100],
  },
  langInfo: { gap: 2 },
  langNative: { fontSize: 15, fontWeight: '600', color: Colors.neutral[900] },
  langName: { fontSize: 12, color: Colors.neutral[500] },

  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral[100],
  },
  channelIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: Colors.brand[50], alignItems: 'center', justifyContent: 'center' },
  channelInfo: { flex: 1 },
  channelLabel: { fontSize: 15, color: Colors.neutral[800] },
  channelDesc: { fontSize: 12, color: Colors.neutral[500], marginTop: 2 },

  savedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  savedText: { fontSize: 13, color: Colors.success[600], fontWeight: '600' },

  saveBtn: { marginTop: 20 },
});
