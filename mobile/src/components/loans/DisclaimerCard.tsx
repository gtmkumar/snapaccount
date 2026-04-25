/**
 * DisclaimerCard — Mandatory legal disclaimer shown on LoanPackagePreviewScreen.
 * Phase 6C — docs/design/component-library.md addendum
 *
 * CANONICAL DISCLAIMER TEXT (do not alter):
 * "Prepared by SnapAccount from user-provided data. Not a CA certification.
 *  Final lending decision rests with the partner bank."
 *
 * This text MUST appear on:
 *  (a) LoanPackagePreviewScreen above the footer (this component)
 *  (b) every PDF page footer (handled by backend ReportService/QuestPDF)
 *  (c) the email body when EmailBankAdapter sends the package
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../constants/colors';

interface DisclaimerCardProps {
  testID?: string;
}

export function DisclaimerCard({ testID }: DisclaimerCardProps) {
  const { t } = useTranslation();

  return (
    <View
      testID={testID}
      style={styles.card}
      accessibilityRole="text"
      accessible
    >
      <Ionicons name="information-circle" size={18} color={Colors.info[600]} />
      <Text style={styles.text} accessibilityLabel={t('mobile.loan.preview.disclaimer')}>
        {t('mobile.loan.preview.disclaimer')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: Colors.info[50],
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.info[100],
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  text: {
    flex: 1,
    fontSize: 12,
    color: Colors.info[800],
    lineHeight: 18,
    fontWeight: '500',
  },
});
