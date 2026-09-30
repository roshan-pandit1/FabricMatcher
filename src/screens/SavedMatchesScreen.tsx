/**
 * SavedMatchesScreen.tsx
 * Production list view of saved fabric colour comparisons with search filter.
 */

import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFabricStore } from '../state/useFabricStore';
import { Colors, Typography, Spacing, BorderRadius, StatusColors } from '../components/theme';
import { statusLabel, SavedMatch } from '../colour/sessionState';

function MatchCard({ match, onDelete }: { match: SavedMatch; onDelete: (id: string) => void }) {
  const status = match.comparison.status;
  const statusStyle = StatusColors[status] || StatusColors.recapture;
  const percent = match.comparison.similarityPercent;

  const handleDelete = () => {
    Alert.alert('Delete Match', `Are you sure you want to delete "${match.name || 'Saved Match'}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(match.id) },
    ]);
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{match.name || 'Saved Match'}</Text>
        <Text style={styles.cardDate}>
          {new Date(match.savedAt).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      </View>

      <View style={styles.cardBody}>
        {/* Color Swatches */}
        <View style={styles.swatchPair}>
          <View style={styles.swatchCol}>
            <View style={[styles.swatch, { backgroundColor: match.referenceSwatch }]} />
            <Text style={styles.swatchLabel}>Ref</Text>
          </View>
          <Text style={styles.vsText}>vs</Text>
          <View style={styles.swatchCol}>
            <View style={[styles.swatch, { backgroundColor: match.candidateSwatch }]} />
            <Text style={styles.swatchLabel}>Cand</Text>
          </View>
        </View>

        {/* Score & Status Badge */}
        <View style={styles.scoreContainer}>
          <Text style={[styles.scoreValue, { color: statusStyle.text }]}>
            {percent !== null ? `${Math.round(percent)}%` : '—'}
          </Text>
          <View style={[styles.badge, { backgroundColor: statusStyle.bg, borderColor: statusStyle.border }]}>
            <Text style={[styles.badgeText, { color: statusStyle.text }]}>
              {statusLabel(status)}
            </Text>
          </View>
        </View>

        {/* Delete Action */}
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete} accessibilityLabel="Delete match">
          <Text style={styles.deleteText}>✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function SavedMatchesScreen() {
  const { store, actions } = useFabricStore();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredMatches = useMemo(() => {
    if (!searchQuery.trim()) return store.savedMatches;
    const q = searchQuery.toLowerCase();
    return store.savedMatches.filter(m =>
      (m.name && m.name.toLowerCase().includes(q)) ||
      statusLabel(m.comparison.status).toLowerCase().includes(q),
    );
  }, [store.savedMatches, searchQuery]);

  if (store.savedMatches.length === 0) {
    return (
      <SafeAreaView style={styles.emptyContainer} edges={['top']}>
        <Text style={styles.title}>Saved Matches</Text>
        <View style={styles.emptyContent}>
          <Text style={styles.emptyTitle}>No Saved Comparisons</Text>
          <Text style={styles.emptyBody}>
            When comparing fabrics in the camera view, tap "Save match" to save your results here.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.title}>Saved Matches</Text>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search saved matches…"
          placeholderTextColor={Colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          clearButtonMode="while-editing"
        />
      </View>

      <FlatList
        data={filteredMatches}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <MatchCard match={item} onDelete={actions.deleteMatch} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: Spacing[5] },
  emptyContainer: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: Spacing[5] },
  title: {
    fontSize: Typography.fontSize['2xl'], fontWeight: Typography.fontWeight.bold,
    color: Colors.textPrimary, marginVertical: Spacing[4],
  },
  searchContainer: { marginBottom: Spacing[4] },
  searchInput: {
    backgroundColor: Colors.surface, color: Colors.textPrimary,
    borderRadius: BorderRadius.lg, paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3], fontSize: Typography.fontSize.base,
    borderWidth: 1, borderColor: Colors.border,
  },
  emptyContent: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: Spacing[6] },
  emptyTitle: {
    fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.semibold,
    color: Colors.textPrimary, marginBottom: Spacing[2],
  },
  emptyBody: {
    fontSize: Typography.fontSize.base, color: Colors.textSecondary,
    textAlign: 'center', lineHeight: Typography.fontSize.base * 1.5,
  },
  listContent: { paddingBottom: Spacing[8] },
  card: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing[4], marginBottom: Spacing[4],
    borderWidth: 1, borderColor: Colors.border,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing[3] },
  cardTitle: { fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.semibold, color: Colors.textPrimary },
  cardDate: { fontSize: Typography.fontSize.xs, color: Colors.textMuted },
  cardBody: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  swatchPair: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  swatchCol: { alignItems: 'center' },
  swatch: { width: 40, height: 40, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border },
  swatchLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  vsText: { fontSize: Typography.fontSize.xs, color: Colors.textMuted },
  scoreContainer: { alignItems: 'center' },
  scoreValue: { fontSize: Typography.fontSize['2xl'], fontWeight: Typography.fontWeight.bold },
  badge: { paddingHorizontal: Spacing[2], paddingVertical: 2, borderRadius: BorderRadius.full, borderWidth: 1, marginTop: 2 },
  badgeText: { fontSize: 10, fontWeight: Typography.fontWeight.semibold },
  deleteButton: { padding: Spacing[2] },
  deleteText: { fontSize: Typography.fontSize.lg, color: Colors.textMuted },
});
