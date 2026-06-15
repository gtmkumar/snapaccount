/**
 * RatingSheet — post-call 1–5★ rating bottom sheet (Wave 7 / GAP-031, Flow E).
 * Focus-trapped (accessibilityViewIsModal), skippable ("Maybe later").
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  createThemedStyles,
  useTheme,
  type ThemeTokens,
} from '../../contexts/ThemeContext';
import { StarRatingInput } from '../shared/StarRatingInput';

export const RATING_COMMENT_MAX_LENGTH = 300;

interface RatingSheetProps {
  visible: boolean;
  caName: string;
  busy?: boolean;
  onSubmit: (stars: number, comment: string) => void;
  onClose: () => void;
}

export function RatingSheet({
  visible,
  caName,
  busy = false,
  onSubmit,
  onClose,
}: RatingSheetProps) {
  const { t } = useTranslation();
  const { tokens } = useTheme();
  const styles = useStyles();
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const titleRef = useRef<Text>(null);

  // Reset each time the sheet opens (adjust-state-during-render pattern).
  const [prevVisible, setPrevVisible] = useState(visible);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) {
      setStars(0);
      setComment('');
    }
  }

  // Initial AT focus on the title (modal focus pattern).
  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => {
        const node = findNodeHandle(titleRef.current);
        if (node) AccessibilityInfo.setAccessibilityFocus(node);
      }, 250);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={styles.backdropTouch}
          onPress={onClose}
          accessibilityLabel={t('mobile.common.close')}
        />
        <View style={styles.sheet} accessibilityViewIsModal testID="rating-sheet">
          <Text ref={titleRef} style={styles.title} accessibilityRole="header">
            {t('mobile.ca.rating.title', { caName })}
          </Text>

          <StarRatingInput value={stars} onChange={setStars} testID="rating-sheet-stars" />

          <Text style={styles.commentLabel}>{t('mobile.ca.rating.commentLabel')}</Text>
          <TextInput
            style={styles.input}
            value={comment}
            onChangeText={setComment}
            multiline
            numberOfLines={3}
            maxLength={RATING_COMMENT_MAX_LENGTH}
            placeholder={t('mobile.ca.rating.commentLabel')}
            placeholderTextColor={tokens.textTertiary}
            accessibilityLabel={t('mobile.ca.rating.commentLabel')}
            testID="rating-sheet-comment"
          />
          <Text style={styles.counter}>
            {comment.length}/{RATING_COMMENT_MAX_LENGTH}
          </Text>

          <Pressable
            style={[styles.submitBtn, (stars === 0 || busy) && styles.submitBtnDisabled]}
            onPress={() => onSubmit(stars, comment.trim())}
            disabled={stars === 0 || busy}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.ca.rating.submit')}
            accessibilityState={{ disabled: stars === 0 || busy }}
            testID="rating-sheet-submit"
          >
            <Text style={styles.submitBtnText}>{t('mobile.ca.rating.submit')}</Text>
          </Pressable>
          <Pressable
            style={styles.laterBtn}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.ca.rating.later')}
            testID="rating-sheet-later"
          >
            <Text style={styles.laterBtnText}>{t('mobile.ca.rating.later')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.5)',
      justifyContent: 'flex-end',
    },
    backdropTouch: { flex: 1 },
    sheet: {
      backgroundColor: tk.raised,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      paddingBottom: 36,
      gap: 14,
      ...tk.elevation4,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: tk.textPrimary,
      textAlign: 'center',
    },
    commentLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: tk.textSecondary,
    },
    input: {
      borderWidth: 1.5,
      borderColor: tk.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingTop: 12,
      fontSize: 15,
      color: tk.textPrimary,
      backgroundColor: tk.inputBg,
      minHeight: 80,
      textAlignVertical: 'top',
    },
    counter: {
      fontSize: 11,
      color: tk.textTertiary,
      textAlign: 'right',
    },
    submitBtn: {
      backgroundColor: tk.brandCta,
      borderRadius: 14,
      minHeight: 52,
      alignItems: 'center',
      justifyContent: 'center',
    },
    submitBtnDisabled: { opacity: 0.4 },
    submitBtnText: { fontSize: 16, fontWeight: '700', color: tk.textOnBrand },
    laterBtn: {
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    laterBtnText: { fontSize: 14, fontWeight: '600', color: tk.textSecondary },
  }),
);
