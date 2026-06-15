/**
 * RaiseGrievanceModal — Modal for raising a refund grievance/complaint.
 * Triggered from RefundTrackerScreen when refund is delayed.
 */

import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';

export interface GrievanceFormData {
  subject: string;
  description: string;
  contactEmail?: string;
}

interface RaiseGrievanceModalProps {
  visible: boolean;
  filingId: string;
  onClose: () => void;
  onSubmit: (data: GrievanceFormData) => Promise<void>;
  testID?: string;
}

export function RaiseGrievanceModal({
  visible,
  onClose,
  onSubmit,
  testID,
}: RaiseGrievanceModalProps) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = subject.trim().length >= 5 && description.trim().length >= 20;

  const handleSubmit = async () => {
    if (!isValid || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        subject: subject.trim(),
        description: description.trim(),
        contactEmail: contactEmail.trim() || undefined,
      });
      onClose();
    } catch {
      setError('Failed to submit grievance. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={onClose}
      testID={testID}
    >
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Raise Grievance</Text>
            <Pressable
              style={styles.closeBtn}
              onPress={onClose}
              accessibilityLabel="Close"
              hitSlop={8}
            >
              <Ionicons name="close" size={22} color={tokens.textSecondary} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.infoBox}>
              <Ionicons name="information-circle-outline" size={18} color={tokens.brandCta} />
              <Text style={styles.infoText}>
                Submitting a grievance will escalate your case to the Income Tax Department.
                Ensure your details are accurate.
              </Text>
            </View>

            {/* Subject */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Subject</Text>
              <TextInput
                style={styles.input}
                value={subject}
                onChangeText={setSubject}
                placeholder="e.g. Refund not received after 45 days"
                placeholderTextColor={tokens.textTertiary}
                maxLength={120}
                accessibilityLabel="Grievance subject"
              />
            </View>

            {/* Description */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={description}
                onChangeText={setDescription}
                placeholder="Describe your issue in detail (min 20 characters)"
                placeholderTextColor={tokens.textTertiary}
                multiline
                numberOfLines={5}
                maxLength={500}
                accessibilityLabel="Grievance description"
                textAlignVertical="top"
              />
              <Text style={styles.charCount}>{description.length}/500</Text>
            </View>

            {/* Contact email (optional) */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Contact email (optional)</Text>
              <TextInput
                style={styles.input}
                value={contactEmail}
                onChangeText={setContactEmail}
                placeholder="yourname@email.com"
                placeholderTextColor={tokens.textTertiary}
                keyboardType="email-address"
                autoCapitalize="none"
                accessibilityLabel="Contact email"
              />
            </View>

            {error && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={16} color={tokens.errorFg} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
          </ScrollView>

          {/* Actions */}
          <View style={styles.footer}>
            <Pressable
              style={styles.cancelBtn}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.submitBtn, (!isValid || isSubmitting) && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={!isValid || isSubmitting}
              accessibilityRole="button"
              accessibilityLabel={isSubmitting ? 'Submitting…' : 'Submit grievance'}
            >
              <Text style={styles.submitText}>
                {isSubmitting ? 'Submitting…' : 'Submit grievance'}
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tk.canvas,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: tk.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: tk.textPrimary,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: tk.sunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 20,
    gap: 20,
  },
  infoBox: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: tk.brandTint,
    borderRadius: 12,
    padding: 14,
    alignItems: 'flex-start',
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: tk.brandFg,
    lineHeight: 19,
  },
  fieldGroup: {
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: tk.textSecondary,
  },
  input: {
    borderWidth: 1.5,
    borderColor: tk.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: tk.textPrimary,
    backgroundColor: tk.raised,
    minHeight: 48,
  },
  textArea: {
    minHeight: 120,
    paddingTop: 12,
  },
  charCount: {
    fontSize: 11,
    color: tk.textTertiary,
    textAlign: 'right',
  },
  errorBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: tk.errorTint,
    borderRadius: 10,
    padding: 12,
    alignItems: 'flex-start',
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: tk.errorFg,
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: tk.border,
  },
  cancelBtn: {
    flex: 1,
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tk.sunken,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: tk.textSecondary,
  },
  submitBtn: {
    flex: 2,
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tk.brandCta,
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitText: {
    fontSize: 16,
    fontWeight: '700',
    color: tk.textOnBrand,
  },
  }),
);
