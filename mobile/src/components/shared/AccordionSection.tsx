/**
 * AccordionSection — Collapsible section for filing summaries, deductions, etc.
 */

import React, { useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';

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
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const rotateAnim = useRef(new Animated.Value(defaultOpen ? 1 : 0)).current;

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
          <Ionicons name="chevron-down" size={18} color={Colors.neutral[500]} />
        </Animated.View>
      </Pressable>

      {isOpen && <View style={styles.content}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    backgroundColor: Colors.surface.default,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.neutral[100],
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
    color: Colors.neutral[900],
  },
  subtitle: {
    fontSize: 12,
    color: Colors.neutral[500],
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.neutral[100],
  },
});
