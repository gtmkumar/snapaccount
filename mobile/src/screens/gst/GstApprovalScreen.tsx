/**
 * GST Approval Screen
 * Final review with checkboxes before submission
 * Matches docs/design/screens/mobile/gst-filing.md §Screen 20
 */

import React, { useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusTimeline } from '../../components/shared/StatusTimeline';
import { useTranslation } from 'react-i18next';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { useHaptics } from '../../hooks/useHaptics';
import apiClient from '../../lib/api';
import type { GstStackParamList } from '../../navigation/GstStack';
import { useSensitiveScreen } from '../../hooks/usePreventScreenCapture';
import { useBiometricGate } from '../../hooks/useBiometricGate';

const RATING_PROMPT_KEY = '@snapaccount/gst_rating_prompted';

/** Show app-rating prompt once after a user's first successful GST approval. */
async function maybeRequestReview(): Promise<void> {
  try {
    const already = await AsyncStorage.getItem(RATING_PROMPT_KEY);
    if (already) return;
    await AsyncStorage.setItem(RATING_PROMPT_KEY, 'true');
    const available = await StoreReview.isAvailableAsync();
    if (available) {
      await StoreReview.requestReview();
    }
  } catch {
    // silent — never block filing flow on rating prompt errors
  }
}

type NavProp = NativeStackNavigationProp<GstStackParamList, 'GstApproval'>;
type RoutePropType = RouteProp<GstStackParamList, 'GstApproval'>;
interface Props { navigation: NavProp; route: RoutePropType }

const CHECKLIST = [
  { id: 'sales', label: 'I confirm the sales figures are correct' },
  { id: 'itc', label: 'I confirm the ITC values are accurate' },
  { id: 'payable', label: 'I understand the net tax payable' },
  { id: 'authorize', label: 'I authorize SnapAccount to file on my behalf' },
];

const TIMELINE_STEPS = [
  { id: 'draft', label: 'Draft', status: 'completed' as const },
  { id: 'pending', label: 'Pending Approval', status: 'active' as const },
  { id: 'approved', label: 'Approved', status: 'pending' as const },
  { id: 'filed', label: 'Filed', status: 'pending' as const },
];

export function GstApprovalScreen({ navigation, route }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  // SEC-015: Prevent screenshots on GST approval screen (authorisation with tax figures)
  useSensitiveScreen();

  const { trigger: triggerBiometric } = useBiometricGate();
  const { t } = useTranslation();
  const haptics = useHaptics();
  const { returnId, returnType } = route.params;
  const [checked, setChecked] = useState<Record<string, boolean>>(
    Object.fromEntries(CHECKLIST.map((item) => [item.id, false])),
  );
  const [submitting, setSubmitting] = useState(false);
  const [showChangesInput, setShowChangesInput] = useState(false);
  const [changesText, setChangesText] = useState('');

  const allChecked = CHECKLIST.every((item) => checked[item.id]);

  const toggleCheck = (id: string) => {
    haptics.lightTap(); // §3.3: checkbox toggle
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleApprove = async () => {
    if (!allChecked) return;
    // GAP-063 / M4: Biometric step-up before GST approval submission.
    const passed = await triggerBiometric({ promptMessage: t('mobile.gst.approval.biometricPrompt') });
    if (!passed) return;
    setSubmitting(true);
    try {
      await apiClient.post(`/gst/returns/${returnId}/approve`);
      haptics.success(); // §3.3: GST approval submitted
      // One-time app-rating prompt on first successful GST approval (Phase 6F)
      void maybeRequestReview();
      Alert.alert(
        t('mobile.gst.approval.successTitle'),
        t('mobile.gst.approval.successBody'),
        [{ text: t('mobile.common.ok'), onPress: () => navigation.popToTop() }],
      );
    } catch {
      haptics.error(); // §3.3: submit failure
      Alert.alert(t('mobile.common.error'), t('mobile.gst.approval.errorBody'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestChanges = () => {
    if (Platform.OS === 'ios') {
      Alert.prompt(
        'Request Changes',
        'Describe what needs to be changed:',
        async (text) => {
          if (text) {
            await apiClient.post(`/gst/returns/${returnId}/request-changes`, { message: text });
            navigation.goBack();
          }
        },
        'plain-text',
      );
    } else {
      // Android: use inline text input modal
      setShowChangesInput(true);
    }
  };

  const handleSubmitChanges = async () => {
    if (changesText.trim()) {
      try {
        await apiClient.post(`/gst/returns/${returnId}/request-changes`, { message: changesText });
      } catch {
        // ignore API errors in mock mode
      }
      setShowChangesInput(false);
      setChangesText('');
      navigation.goBack();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Approve GST Return</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Return summary */}
        <Card style={styles.summaryCard}>
          <Text style={styles.summaryType}>{returnType}</Text>
          <StatusTimeline steps={TIMELINE_STEPS} orientation="horizontal" />
        </Card>

        {/* Checklist */}
        <Card style={styles.checklistCard}>
          <Text style={styles.checklistTitle}>Please confirm before approving:</Text>
          {CHECKLIST.map((item) => (
            <Pressable
              key={item.id}
              style={styles.checkItem}
              onPress={() => toggleCheck(item.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: checked[item.id] }}
            >
              <View
                style={[
                  styles.checkbox,
                  checked[item.id] && styles.checkboxChecked,
                ]}
              >
                {checked[item.id] && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
              </View>
              <Text style={styles.checkItemLabel}>{item.label}</Text>
            </Pressable>
          ))}
        </Card>

        {/* Consent declaration */}
        <Card style={styles.consentCard}>
          <Text style={styles.consentTitle}>Declaration</Text>
          <Text style={styles.consentText}>
            I hereby authorize SnapAccount Tax Services to file the {returnType} on my behalf for the
            mentioned period. I confirm that the information provided is accurate to the best of
            my knowledge and belief.
          </Text>
        </Card>

        {/* Disclaimer */}
        <View style={styles.disclaimer}>
          <View style={styles.disclaimerRow}>
            <Ionicons name="information-circle-outline" size={16} color={tokens.infoFg} style={styles.disclaimerIcon} />
            <Text style={styles.disclaimerText}>
              Once approved, our team will file within 24 hours of the deadline.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Action bar */}
      <View style={styles.actionBar}>
        <Button
          label="Request Changes"
          variant="ghost"
          onPress={handleRequestChanges}
          style={styles.changesBtn}
        />
        <Button
          label="Approve & Submit"
          onPress={handleApprove}
          disabled={!allChecked}
          loading={submitting}
          style={styles.approveBtn}
        />
      </View>

      {/* Android-compatible changes request modal */}
      {showChangesInput && (
        <View style={styles.changesModal}>
          <View style={styles.changesModalContent}>
            <Text style={styles.changesModalTitle}>Request Changes</Text>
            <Text style={styles.changesModalSubtitle}>Describe what needs to be changed:</Text>
            <TextInput
              style={styles.changesModalInput}
              value={changesText}
              onChangeText={setChangesText}
              placeholder="Enter your comments..."
              multiline
              numberOfLines={4}
              autoFocus
            />
            <View style={styles.changesModalActions}>
              <Button
                label="Cancel"
                variant="ghost"
                onPress={() => { setShowChangesInput(false); setChangesText(''); }}
                style={styles.changesModalBtn}
              />
              <Button
                label="Submit"
                onPress={handleSubmitChanges}
                disabled={!changesText.trim()}
                style={styles.changesModalBtn}
              />
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: tk.canvas },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: tk.raised,
    borderBottomWidth: 1,
    borderBottomColor: tk.border,
  },
  backBtn: { padding: 4 },
  backText: { fontSize: 20, color: tk.brand500 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: tk.textPrimary },
  headerSpacer: { width: 28 },
  scrollContent: { padding: 16, paddingBottom: 100, gap: 16 },
  summaryCard: { padding: 16 },
  summaryType: { fontSize: 20, fontWeight: '700', color: tk.textPrimary, marginBottom: 16 },
  checklistCard: { padding: 16 },
  checklistTitle: { fontSize: 15, fontWeight: '600', color: tk.textSecondary, marginBottom: 14 },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: tk.border,
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: tk.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: tk.brand500,
    borderColor: tk.brand500,
  },
  checkmark: { color: tk.textOnBrand, fontSize: 14, fontWeight: '700' },
  checkItemLabel: { flex: 1, fontSize: 14, color: tk.textSecondary, lineHeight: 20 },
  consentCard: {
    padding: 16,
    backgroundColor: tk.canvas,
  },
  consentTitle: { fontSize: 14, fontWeight: '600', color: tk.textSecondary, marginBottom: 8 },
  consentText: { fontSize: 13, color: tk.textSecondary, lineHeight: 20 },
  disclaimer: {
    padding: 12,
    backgroundColor: tk.infoTint,
    borderRadius: 8,
  },
  disclaimerRow: { flexDirection: 'row', alignItems: 'flex-start' },
  disclaimerIcon: { marginRight: 6, marginTop: 1 },
  disclaimerText: { fontSize: 13, color: tk.infoFg, lineHeight: 18, flex: 1 },
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: tk.raised,
    borderTopWidth: 1,
    borderTopColor: tk.border,
    padding: 16,
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 32,
  },
  changesBtn: { flex: 1 },
  approveBtn: { flex: 1.5 },
  changesModal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  changesModalContent: {
    backgroundColor: tk.raised,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    gap: 12,
  },
  changesModalTitle: { fontSize: 18, fontWeight: '700', color: tk.textPrimary },
  changesModalSubtitle: { fontSize: 14, color: tk.textSecondary },
  changesModalInput: {
    borderWidth: 1,
    borderColor: tk.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: tk.textPrimary,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  changesModalActions: { flexDirection: 'row', gap: 12 },
  changesModalBtn: { flex: 1 },
  }),
);
