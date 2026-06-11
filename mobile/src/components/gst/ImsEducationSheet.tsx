/**
 * ImsEducationSheet — "How the Invoice Management System works" bottom sheet.
 * Spec: docs/design/ims-inbox-spec.md §5. The "doing nothing = accepted"
 * sentence carries display weight (the single most important line).
 * Dismissible by back gesture; never blocks the inbox.
 */

import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { formatDateDDMMMYYYY } from '../../lib/imsPeriod';
import { Button } from '../ui/Button';

interface Props {
  visible: boolean;
  /** ISO date of the current period's GSTR-2B generation deadline. */
  deadline?: string;
  onClose: () => void;
}

export function ImsEducationSheet({ visible, deadline, onClose }: Props) {
  const { t } = useTranslation();
  const styles = useStyles();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable
          style={styles.backdropTouch}
          onPress={onClose}
          accessibilityLabel={t('mobile.common.close')}
        />
        <View style={styles.sheet} accessibilityViewIsModal>
          <ScrollView>
            <Text style={styles.title} accessibilityRole="header">
              {t('mobile.gst.ims.edu.title')}
            </Text>
            <Text style={styles.body}>{t('mobile.gst.ims.edu.what')}</Text>
            <Text style={styles.body}>
              {deadline
                ? t('mobile.gst.ims.edu.cutoff', { date: formatDateDDMMMYYYY(deadline) })
                : t('mobile.gst.ims.edu.cutoffNoDate')}
            </Text>
            <Text style={styles.doingNothing}>
              {t('mobile.gst.ims.edu.doingNothing')}
            </Text>
            <Text style={styles.body}>{t('mobile.gst.ims.edu.rejectPath')}</Text>
            <Button
              label={t('mobile.gst.ims.edu.gotIt')}
              onPress={onClose}
              fullWidth
              style={styles.gotIt}
              testID="ims-edu-got-it"
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.55)',
      justifyContent: 'flex-end',
    },
    backdropTouch: {
      flex: 1,
    },
    sheet: {
      backgroundColor: tk.raised,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 20,
      paddingBottom: 32,
      maxHeight: '80%',
      ...tk.elevation3,
    },
    title: {
      fontSize: 18,
      fontWeight: '800',
      color: tk.textPrimary,
      marginBottom: 12,
    },
    body: {
      fontSize: 14,
      lineHeight: 22,
      color: tk.textSecondary,
      marginBottom: 10,
    },
    // display.section weight — the most important sentence (spec §5)
    doingNothing: {
      fontSize: 16,
      lineHeight: 24,
      fontWeight: '800',
      color: tk.warningFg,
      backgroundColor: tk.warningTint,
      borderWidth: 1,
      borderColor: tk.warningTintBorder,
      borderRadius: 12,
      padding: 12,
      marginBottom: 10,
    },
    gotIt: {
      marginTop: 8,
    },
  }),
);
