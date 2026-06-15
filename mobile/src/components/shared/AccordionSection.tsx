/**
 * AccordionSection — Collapsible section for filing summaries, deductions, etc.
 */

import React, { useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';

interface AccordionSectionProps {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  testID?: string;
}

export function AccordionSection({
  title,
  subtitle,
  defaultOpen = false,
  children,
  testID,
}: AccordionSectionProps) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [rotateAnim] = useState(() => new Animated.Value(defaultOpen ? 1 : 0));

  const toggle = () => {
    const toValue = isOpen ? 0 : 1;
    Animated.timing(rotateAnim, {
      toValue,
      duration: 180,
      useNativeDriver: true,
    }).start();
    setIsOpen(!isOpen);
  };

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  return (
    <View testID={testID} style={styles.container}>
      <Pressable
        style={styles.header}
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        accessibilityLabel={title}
        hitSlop={4}
      >
        <View style={styles.headerLeft}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Ionicons name="chevron-down" size={18} color={tokens.textSecondary} />
        </Animated.View>
      </Pressable>

      {isOpen && <View style={styles.content}>{children}</View>}
    </View>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  container: {
    borderRadius: 14,
    backgroundColor: tk.raised,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: tk.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    minHeight: 52,
  },
  headerLeft: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: tk.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: tk.textSecondary,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: tk.border,
  },
  }),
);
