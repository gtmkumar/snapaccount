/**
 * DpoContactScreen — Full DPO / Grievance Officer contact
 * Phase 7 Wave 2 | M3b (GAP-020)
 * DPDP Rules 2025: published India-based contact required.
 */

import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors } from '../../constants/colors';
import { PRIVACY_CONTACT } from '../../config/privacyContact';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type NavProp = NativeStackNavigationProp<MoreStackParamList, 'DpoContact'>;
interface Props { navigation: NavProp }

export function DpoContactScreen({ navigation }: Props) {
  const { t } = useTranslation();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={8} accessibilityLabel={t('mobile.common.back')}>
          <Ionicons name="arrow-back" size={22} color={Colors.neutral[800]} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('mobile.privacy.dpo.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* NEW-W2-007 / TL-10: DPO not appointed — render the pending state
            instead of presenting placeholder values as live contact details. */}
        {PRIVACY_CONTACT.isPlaceholder && (
          <View style={styles.pendingCard} accessibilityRole="text">
            <Ionicons name="hourglass-outline" size={20} color={Colors.warning[700]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.pendingTitle}>{t('mobile.privacy.dpo.pendingTitle')}</Text>
              <Text style={styles.pendingBody}>{t('mobile.privacy.dpo.pendingBody')}</Text>
            </View>
          </View>
        )}

        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Ionicons name="person-outline" size={18} color={Colors.neutral[500]} />
            <View style={styles.cardContent}>
              <Text style={styles.cardLabel}>{t('mobile.privacy.dpo.title')}</Text>
              <Text style={styles.cardValue}>
                {PRIVACY_CONTACT.isPlaceholder
                  ? t('mobile.privacy.dpo.pendingShort')
                  : PRIVACY_CONTACT.dpoName}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          {!PRIVACY_CONTACT.isPlaceholder && (
            <>
              <View style={styles.cardRow}>
                <Ionicons name="mail-outline" size={18} color={Colors.neutral[500]} />
                <View style={styles.cardContent}>
                  <Text style={styles.cardLabel}>{t('mobile.privacy.dpo.labels.email')}</Text>
                  <Text style={styles.cardValue}>{PRIVACY_CONTACT.dpoEmail}</Text>
                </View>
                <Pressable
                  style={styles.actionBtn}
                  onPress={() => void Linking.openURL(`mailto:${PRIVACY_CONTACT.dpoEmail}`)}
                  accessibilityRole="button"
                  accessibilityLabel={t('mobile.privacy.dpo.cta.email')}
                >
                  <Text style={styles.actionBtnText}>{t('mobile.privacy.dpo.cta.email')}</Text>
                </Pressable>
              </View>

              <View style={styles.cardRow}>
                <Ionicons name="call-outline" size={18} color={Colors.neutral[500]} />
                <View style={styles.cardContent}>
                  <Text style={styles.cardLabel}>{t('mobile.privacy.dpo.labels.phone')}</Text>
                  <Text style={styles.cardValue}>{PRIVACY_CONTACT.dpoPhone}</Text>
                </View>
                <Pressable
                  style={styles.actionBtn}
                  onPress={() => void Linking.openURL(`tel:${PRIVACY_CONTACT.dpoPhone}`)}
                  accessibilityRole="button"
                  accessibilityLabel={t('mobile.privacy.dpo.cta.call')}
                >
                  <Text style={styles.actionBtnText}>{t('mobile.privacy.dpo.cta.call')}</Text>
                </Pressable>
              </View>

              <View style={styles.divider} />

              <View style={styles.cardRow}>
                <Ionicons name="location-outline" size={18} color={Colors.neutral[500]} />
                <View style={styles.cardContent}>
                  <Text style={styles.cardLabel}>{t('mobile.privacy.dpo.labels.address')}</Text>
                  <Text style={styles.cardValue}>{PRIVACY_CONTACT.indiaAddress}</Text>
                </View>
              </View>
            </>
          )}

          <View style={styles.cardRow}>
            <Ionicons name="time-outline" size={18} color={Colors.neutral[500]} />
            <View style={styles.cardContent}>
              <Text style={styles.cardLabel}>{t('mobile.privacy.dpo.labels.hours')}</Text>
              <Text style={styles.cardValue}>{PRIVACY_CONTACT.businessHours}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <Text style={styles.sla}>
            {t('mobile.privacy.dpo.sla', {
              ackDays: PRIVACY_CONTACT.ackDays,
              slaDays: PRIVACY_CONTACT.slaDays,
            })}
          </Text>
        </View>

        {/* Grievance escalation */}
        <View style={styles.escalationCard}>
          <Ionicons name="alert-circle-outline" size={20} color={Colors.warning[600]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.escalationText}>{t('mobile.privacy.dpo.escalation')}</Text>
            <Pressable
              onPress={() => void Linking.openURL(PRIVACY_CONTACT.dpbLearnMoreUrl)}
              accessibilityRole="link"
            >
              <Text style={styles.escalationLink}>{t('mobile.privacy.dpo.cta.learnMore')} →</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.base },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: Colors.surface.default, borderBottomWidth: 1, borderBottomColor: Colors.neutral[100],
  },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.neutral[900] },

  scrollContent: { padding: 16, gap: 16, paddingBottom: 32 },

  // NEW-W2-007: DPO appointment pending banner
  pendingCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: Colors.warning[50], borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.warning[100],
  },
  pendingTitle: { fontSize: 14, fontWeight: '700', color: Colors.warning[800], marginBottom: 4 },
  pendingBody: { fontSize: 13, color: Colors.warning[800], lineHeight: 20 },

  card: {
    backgroundColor: Colors.surface.default, borderRadius: 16, padding: 16, gap: 14,
    borderWidth: 1, borderColor: Colors.neutral[100],
  },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardContent: { flex: 1, gap: 2 },
  cardLabel: { fontSize: 12, color: Colors.neutral[500], fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.3 },
  cardValue: { fontSize: 14, color: Colors.neutral[900], lineHeight: 21 },
  divider: { height: 1, backgroundColor: Colors.neutral[100] },
  actionBtn: {
    backgroundColor: Colors.brand[50], borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, minHeight: 44,
    alignItems: 'center', justifyContent: 'center',
  },
  actionBtnText: { fontSize: 14, fontWeight: '600', color: Colors.brand[700] },
  sla: { fontSize: 13, color: Colors.neutral[600], lineHeight: 20 },

  escalationCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: Colors.warning[50], borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.warning[100],
  },
  escalationText: { fontSize: 13, color: Colors.warning[800], lineHeight: 20, marginBottom: 4 },
  escalationLink: { fontSize: 14, fontWeight: '600', color: Colors.warning[700] },
});
