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
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';

interface DisclaimerCardProps {
  testID?: string;
}

export function DisclaimerCard({ testID }: DisclaimerCardProps) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();

  return (
    <View
      testID={testID}
      style={styles.card}
      accessibilityRole="text"
      accessible
    >
      <Ionicons name="information-circle" size={18} color={tokens.infoFg} />
      <Text style={styles.text} accessibilityLabel={t('mobile.loan.preview.disclaimer')}>
        {t('mobile.loan.preview.disclaimer')}
      </Text>
    </View>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: tk.infoTint,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tk.infoTint,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  text: {
    flex: 1,
    fontSize: 12,
    color: tk.infoFg,
    lineHeight: 18,
    fontWeight: '500',
  },
  }),
);
