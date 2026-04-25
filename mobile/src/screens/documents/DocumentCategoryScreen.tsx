/**
 * Document Category Selection Screen
 * Assign category to newly captured/uploaded document
 * Matches docs/design/screens/mobile/document-vault.md §Screen 16
 */

import React, { useState } from 'react';
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
import { Colors } from '../../constants/colors';
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

const CATEGORIES: CategoryItem[] = [
  { id: 'sales_bill', label: 'Sales Bill', hint: 'Bills you\'ve issued to customers', icon: 'receipt-outline', color: Colors.success[600] },
  { id: 'purchase_bill', label: 'Purchase Bill', hint: 'Bills from your suppliers', icon: 'cart-outline', color: Colors.brand[600] },
  { id: 'expense', label: 'Expense Receipt', hint: 'Travel, office, and business expenses', icon: 'wallet-outline', color: Colors.warning[600] },
  { id: 'bank_statement', label: 'Bank Statement', hint: 'Monthly bank statements (PDF)', icon: 'business-outline', color: Colors.info[600] },
  { id: 'salary_slip', label: 'Salary Slip', hint: 'For employee ITR documents', icon: 'person-outline', color: Colors.gst },
  { id: 'other', label: 'Other', hint: 'Misc. documents — re-categorize later', icon: 'document-outline', color: Colors.neutral[600] },
];

export function DocumentCategoryScreen({ navigation, route }: Props) {
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
        data={CATEGORIES}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.base },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.surface.default,
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral[200],
  },
  backBtn: { padding: 4 },
  backText: { fontSize: 20, color: Colors.brand[500] },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', color: Colors.neutral[900] },
  headerSpacer: { width: 28 },
  subtext: { fontSize: 14, color: Colors.neutral[500], paddingHorizontal: 16, paddingVertical: 12 },
  gridContent: { padding: 16 },
  columnWrapper: { gap: 12, marginBottom: 12 },
  categoryCard: {
    flex: 1,
    backgroundColor: Colors.surface.default,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.neutral[200],
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
  categoryLabel: { fontSize: 14, fontWeight: '700', color: Colors.neutral[800], marginBottom: 4 },
  categoryHint: { fontSize: 11, color: Colors.neutral[500], lineHeight: 15 },
  uploadingOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.brand[500],
    padding: 16,
    alignItems: 'center',
  },
  uploadingText: { color: Colors.neutral[0], fontSize: 14, fontWeight: '600' },
});
