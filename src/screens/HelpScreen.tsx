/**
 * HelpScreen.tsx
 * Explains the app, the similarity index, and limitations.
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, BorderRadius } from '../components/theme';
import { DEFAULT_CONFIG } from '../colour/patchAnalysis';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Body({ text }: { text: string }) {
  return <Text style={styles.body}>{text}</Text>;
}

export default function HelpScreen() {
  const cfg = DEFAULT_CONFIG;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>How FabricMatcher Works</Text>

        <Section title="Same-light, same-session">
          <Body text={
            'Bring your reference fabric into the shop. Tap "Set reference" to capture its colour. Then point the camera at candidate fabrics under the same nearby light — the app shows how closely they match.\n\nAlways capture reference and candidate fabrics under the same lighting. Moving to a different location or switching lights invalidates the comparison; use "Reset reference" and recapture.'
          } />
        </Section>

        <Section title="Colour similarity">
          <Body text={
            'The similarity percentage is a mathematical index:\n\nS = 100 × exp(−ln 2 × (ΔE₀₀ / ' +
            String(cfg.d50) +
            ')²)\n\nAt ΔE₀₀ = 0 (identical), S = 100%. At ΔE₀₀ = ' +
            String(cfg.d50) +
            ', S = 50%. This is NOT an accuracy percentage, a match probability, or a guarantee of visual equivalence under different lights.'
          } />
        </Section>

        <Section title="Decision labels">
          <Body text={
            'Close match: 90th-percentile ΔE₀₀ ≤ ' + String(cfg.acceptanceDeltaE) +
            ' (trial tolerance)\nDifferent shade: 10th-percentile ΔE₀₀ > ' + String(cfg.acceptanceDeltaE) +
            '\nBorderline: neither threshold clearly met\n\nThese are engineering starting points, not calibrated textile tolerances. Tune them against real fabric pairs in your lighting.'
          } />
        </Section>

        <Section title="What the app checks">
          <Body text={
            '• Channel clipping: over-exposed or black pixels are excluded\n' +
            '• Spatial uniformity: detects mixed colours or strong folds (trial gate ΔE₀₀ P90 ≤ ' + String(cfg.maxSpatialP90) + ')\n' +
            '• Temporal stability: 5-frame burst spread ≤ ' + String(cfg.maxTemporalP90) + '\n' +
            '• Same session, same lens: reference is invalidated if the camera restarts'
          } />
        </Section>

        <Section title="Limitations">
          <Body text={
            'Lab values from a phone camera are estimates of appearance under current conditions — not instrument measurements of fabric reflectance.\n\n' +
            '• Shiny, iridescent, fluorescent, translucent, or patterned fabrics cannot be reliably measured with this method.\n' +
            '• Uniform lighting bias, wrong colour profile, or locked-but-unsuitable exposure cannot be detected by pixel statistics alone.\n' +
            '• Historical comparisons from a previous session cannot be compared against a new session as if directly equivalent.\n\n' +
            'Passing a formula test does not establish real-camera matching accuracy. Validate with actual fabric pairs under defined lighting.'
          } />
        </Section>

        <Section title="Trial thresholds (configurable)">
          <Body text={
            'Tolerance τ = ' + String(cfg.acceptanceDeltaE) + '\n' +
            'Spatial P90 gate = ' + String(cfg.maxSpatialP90) + '\n' +
            'Temporal P90 gate = ' + String(cfg.maxTemporalP90) + '\n' +
            'Clipping margin = ' + String(Math.round(cfg.channelMargin * 255)) + '/255\n' +
            'Max clipped fraction = ' + String(Math.round(cfg.maxClippedFraction * 100)) + '%\n' +
            'Min usable tiles = ' + String(Math.ceil(cfg.grid * cfg.grid * cfg.minGoodTileFraction)) + '/' + String(cfg.grid * cfg.grid) + '\n' +
            'd50 (display) = ' + String(cfg.d50)
          } />
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing[5], paddingBottom: Spacing[12] },
  title: {
    fontSize: Typography.fontSize['2xl'], fontWeight: Typography.fontWeight.bold,
    color: Colors.textPrimary, marginBottom: Spacing[5],
  },
  section: {
    marginBottom: Spacing[6], backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg, padding: Spacing[4],
    borderWidth: 1, borderColor: Colors.border,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.semibold,
    color: Colors.teal600, marginBottom: Spacing[3],
  },
  body: {
    fontSize: Typography.fontSize.base, color: Colors.textSecondary,
    lineHeight: Typography.fontSize.base * 1.6,
  },
});
