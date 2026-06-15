/**
 * Document Category Selection Screen
 * Assign category to newly captured/uploaded document
 * Matches docs/design/screens/mobile/document-vault.md §Screen 16
 */

import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import apiClient from '../../lib/api';
import type { DocumentStackParamList } from '../../navigation/DocumentStack';

type NavProp = NativeStackNavigationProp<DocumentStackParamList, 'DocumentCategory'>;
type RoutePropType = RouteProp<DocumentStackParamList, 'DocumentCategory'>;
interface Props { navigation: NavProp; route: RoutePropType }

type CategoryItem = {
  id: string;
  label: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
};

const buildCategories = (tk: ThemeTokens): CategoryItem[] => [
  { id: 'sales_bill', label: 'Sales Bill', hint: 'Bills you\'ve issued to customers', icon: 'receipt-outline', color: tk.successFg },
  { id: 'purchase_bill', label: 'Purchase Bill', hint: 'Bills from your suppliers', icon: 'cart-outline', color: tk.brandCta },
  { id: 'expense', label: 'Expense Receipt', hint: 'Travel, office, and business expenses', icon: 'wallet-outline', color: tk.warningFg },
  { id: 'bank_statement', label: 'Bank Statement', hint: 'Monthly bank statements (PDF)', icon: 'business-outline', color: tk.infoFg },
  { id: 'salary_slip', label: 'Salary Slip', hint: 'For employee ITR documents', icon: 'person-outline', color: tk.gstAccent },
  { id: 'other', label: 'Other', hint: 'Misc. documents — re-categorize later', icon: 'document-outline', color: tk.textSecondary },
];

export function DocumentCategoryScreen({ navigation, route }: Props) {
  const styles = useStyles();
  const { tokens } = useTheme();
  const categories = useMemo(() => buildCategories(tokens), [tokens]);
  const { documentUri } = route.params;
  const [uploading, setUploading] = useState(false);

  const handleSelectCategory = async (categoryId: string) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: documentUri,
        type: 'image/jpeg',
        name: 'document.jpg',
      } as unknown as Blob);
      formData.append('category', categoryId);

      const res = await apiClient.post<{ id: string }>('/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      navigation.navigate('DocumentDetail', { documentId: res.data.id });
    } catch {
      // Navigate back on error
      navigation.goBack();
    } finally {
      setUploading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Categorize Document</Text>
        <View style={styles.headerSpacer} />
      </View>

      <Text style={styles.subtext}>Help us process your document faster</Text>

      {/* Category grid */}
      <FlatList
        data={categories}
        numColumns={2}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.categoryCard, uploading && styles.categoryCardDisabled]}
            onPress={() => !uploading && handleSelectCategory(item.id)}
            accessibilityRole="button"
            accessibilityLabel={`${item.label}: ${item.hint}`}
          >
            <View style={[styles.categoryIcon, { backgroundColor: item.color + '20' }]}>
              <Ionicons name={item.icon} size={22} color={item.color} />
            </View>
            <Text style={styles.categoryLabel}>{item.label}</Text>
            <Text style={styles.categoryHint} numberOfLines={2}>
              {item.hint}
            </Text>
          </Pressable>
        )}
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={styles.gridContent}
      />

      {uploading && (
        <View style={styles.uploadingOverlay}>
          <Text style={styles.uploadingText}>Uploading document...</Text>
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
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', color: tk.textPrimary },
  headerSpacer: { width: 28 },
  subtext: { fontSize: 14, color: tk.textSecondary, paddingHorizontal: 16, paddingVertical: 12 },
  gridContent: { padding: 16 },
  columnWrapper: { gap: 12, marginBottom: 12 },
  categoryCard: {
    flex: 1,
    backgroundColor: tk.raised,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: tk.border,
    alignItems: 'flex-start',
  },
  categoryCardDisabled: { opacity: 0.5 },
  categoryIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  categoryLabel: { fontSize: 14, fontWeight: '700', color: tk.textPrimary, marginBottom: 4 },
  categoryHint: { fontSize: 11, color: tk.textSecondary, lineHeight: 15 },
  uploadingOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: tk.brand500,
    padding: 16,
    alignItems: 'center',
  },
  uploadingText: { color: tk.textOnBrand, fontSize: 14, fontWeight: '600' },
  }),
);
