/**
 * CameraScreen.tsx
 * Production Camera View for FabricMatcher.
 * Real camera frame sampling, exposure lock, live similarity gauge, and match saving.
 */

import React, { useEffect, useRef, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  usePhotoOutput,
  type CameraRef,
} from 'react-native-vision-camera';
import { useFabricStore } from '../state/useFabricStore';
import { useCameraSession } from '../camera/useCameraSession';
import { Colors, Typography, Spacing, BorderRadius, Shadow, StatusColors } from '../components/theme';
import { statusLabel, lighterDarkerLabel, labToHex } from '../colour/sessionState';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const SQUARE_SIZE = Math.min(SCREEN_W, SCREEN_H) * 0.35;

// ─── Sampling Square Overlay ──────────────────────────────────────────────────

function SamplingSquare({ size }: { size: number }) {
  return (
    <View style={[styles.samplingOuter, { width: size, height: size }]} pointerEvents="none">
      <View style={[styles.corner, styles.cornerTL]} />
      <View style={[styles.corner, styles.cornerTR]} />
      <View style={[styles.corner, styles.cornerBL]} />
      <View style={[styles.corner, styles.cornerBR]} />
    </View>
  );
}

// ─── Swatch ───────────────────────────────────────────────────────────────────

function Swatch({ colour, label, size = 52 }: { colour: string | null; label: string; size?: number }) {
  return (
    <View style={styles.swatchContainer}>
      <View
        style={[
          styles.swatch,
          { width: size, height: size, backgroundColor: colour ?? Colors.surfaceSecondary },
          !colour && styles.swatchEmpty,
        ]}
      />
      <Text style={styles.swatchLabel}>{label}</Text>
    </View>
  );
}

// ─── Similarity Gauge ─────────────────────────────────────────────────────────

function SimilarityGauge({ percent, status }: { percent: number | null; status: string | null }) {
  const statusStyle = status && StatusColors[status] ? StatusColors[status] : null;
  if (percent === null) {
    return (
      <View style={styles.gaugeContainer}>
        <Text style={styles.gaugeNoData}>—</Text>
        <Text style={styles.gaugeLabel}>Colour similarity</Text>
      </View>
    );
  }
  return (
    <View style={styles.gaugeContainer}>
      <Text style={[styles.gaugeValue, statusStyle && { color: statusStyle.text }]}>
        {Math.round(percent)}%
      </Text>
      <Text style={styles.gaugeLabel}>Colour similarity</Text>
      {status && statusStyle && (
        <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg, borderColor: statusStyle.border }]}>
          <Text style={[styles.statusText, { color: statusStyle.text }]}>
            {statusLabel(status as any)}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Main Camera Screen ───────────────────────────────────────────────────────

export default function CameraScreen() {
  const { store, actions } = useFabricStore();
  const { collectReferenceBurst, sampleCandidateFrame } = useCameraSession();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back', {
    physicalDevices: ['wide-angle-camera'],
  });
  const photoOutput = usePhotoOutput({ quality: 0.85 });
  const cameraRef = useRef<CameraRef>(null);

  const [isCameraActive, setCameraActive] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [refSwatch, setRefSwatch] = useState<string | null>(null);
  const [candSwatch, setCandSwatch] = useState<string | null>(null);
  const [instruction, setInstruction] = useState('');

  // Permission handling
  useEffect(() => {
    if (!hasPermission) {
      requestPermission().then((granted: boolean) => {
        if (granted) {
          actions.setPermissionGranted();
          setCameraActive(true);
        }
      });
    } else {
      actions.setPermissionGranted();
      setCameraActive(true);
    }
  }, [hasPermission]);

  // Update Reference Swatch
  useEffect(() => {
    if (store.reference) {
      setRefSwatch(labToHex(store.reference.representativeLab));
    } else {
      setRefSwatch(null);
    }
  }, [store.reference]);

  // Update Candidate Swatch
  useEffect(() => {
    const res = store.liveResult;
    if (res?.deltaLab && store.reference) {
      const candLab: [number, number, number] = [
        store.reference.representativeLab[0] + res.deltaLab[0],
        store.reference.representativeLab[1] + res.deltaLab[1],
        store.reference.representativeLab[2] + res.deltaLab[2],
      ];
      setCandSwatch(labToHex(candLab));
    } else {
      setCandSwatch(null);
    }
  }, [store.liveResult, store.reference]);

  // Live Candidate Sampling Interval
  useEffect(() => {
    if (store.reference && store.appState === 'referenceReady') {
      const interval = setInterval(() => {
        sampleCandidateFrame(SCREEN_W, SCREEN_H, SQUARE_SIZE);
      }, 1500);
      return () => clearInterval(interval);
    }
  }, [store.reference, store.appState, sampleCandidateFrame]);

  // Instruction updates
  useEffect(() => {
    if (store.appState === 'readyForReference') {
      setInstruction('Fill the square with one fabric colour');
    } else if (store.appState === 'collectingReference') {
      setInstruction('Hold steady… capturing burst');
    } else if (store.appState === 'referenceReady') {
      const res = store.liveResult;
      if (!res || res.status === 'recapture') {
        setInstruction('Hold steady · Point camera at candidate fabric');
      } else if (res.deltaLab) {
        const lighter = lighterDarkerLabel(res.deltaLab[0]);
        setInstruction(lighter ? `Candidate is ${lighter} than reference` : 'Fabrics compared under same light');
      } else {
        setInstruction('');
      }
    }
  }, [store.appState, store.liveResult]);

  // Set Reference Handler
  const handleSetReference = useCallback(async () => {
    if (isCapturing) return;
    setIsCapturing(true);

    try {
      // Lock exposure if supported
      const controller = cameraRef.current?.controller;
      if (controller) {
        try {
          if (typeof (controller as any).lockCurrentExposure === 'function') {
            await (controller as any).lockCurrentExposure();
            actions.setContractVerified(true);
          }
        } catch (_) {}
      }

      // Collect 5-frame burst
      await collectReferenceBurst(SCREEN_W, SCREEN_H, SQUARE_SIZE, [115, 138, 162]);
    } catch (e) {
      actions.setError('Failed to capture reference. Try again.');
      Alert.alert('Capture Error', 'Could not collect valid fabric frames. Ensure good lighting.');
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing, collectReferenceBurst, actions]);

  // Reset Reference Handler
  const handleResetReference = useCallback(() => {
    Alert.alert(
      'Reset reference?',
      'The current reference colour will be cleared. Capture a new reference under the same light.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            actions.resetReference();
            setRefSwatch(null);
            setCandSwatch(null);
          },
        },
      ],
    );
  }, [actions]);

  // Save Match Handler
  const handleSaveMatch = useCallback(() => {
    actions.saveCurrentMatch(null);
    Alert.alert('Match Saved', 'Comparison saved to your history.');
  }, [actions]);

  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.permissionContainer}>
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionBody}>
          FabricMatcher requires camera access to perform color matching calculations.
        </Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => requestPermission()}
          accessibilityLabel="Grant camera permission">
          <Text style={styles.primaryButtonText}>Allow Camera Access</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!device) {
    return (
      <SafeAreaView style={styles.permissionContainer}>
        <Text style={styles.permissionTitle}>Camera Unavailable</Text>
        <Text style={styles.permissionBody}>No back camera detected on this device.</Text>
      </SafeAreaView>
    );
  }

  const liveResult = store.liveResult;
  const canSave = liveResult !== null && liveResult.status !== 'recapture' && store.reference !== null;

  return (
    <View style={styles.container}>
      {/* VisionCamera View */}
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isCameraActive}
        outputs={[photoOutput]}
      />

      {/* Sampling Square Overlay */}
      <View style={styles.samplingWrapper} pointerEvents="none">
        <SamplingSquare size={SQUARE_SIZE} />
        <Text style={styles.squareHint}>Keep fabric inside the square</Text>
      </View>

      {/* First-use overlay hint */}
      {store.reference === null && store.appState === 'readyForReference' && (
        <View style={styles.firstUseHint} pointerEvents="none">
          <Text style={styles.firstUseText}>
            Bring your fabric. Compare under the same light.
          </Text>
        </View>
      )}

      {/* Bottom Panel */}
      <SafeAreaView edges={['bottom']} style={styles.panel}>
        {/* Swatch & Gauge Row */}
        <View style={styles.swatchRow}>
          <Swatch colour={refSwatch} label="Reference" size={52} />
          <SimilarityGauge
            percent={liveResult?.similarityPercent ?? null}
            status={liveResult?.status ?? null}
          />
          <Swatch colour={candSwatch} label="Current" size={52} />
        </View>

        {/* Guidance Instruction */}
        {!!instruction && <Text style={styles.instruction}>{instruction}</Text>}

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          {store.reference === null ? (
            <TouchableOpacity
              style={[styles.primaryButton, styles.actionButton, isCapturing && styles.buttonDisabled]}
              onPress={handleSetReference}
              disabled={isCapturing}
              accessibilityLabel="Set reference fabric colour">
              {isCapturing ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.primaryButtonText}>Set reference</Text>
              )}
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.secondaryButton, styles.actionButton]}
                onPress={handleResetReference}
                accessibilityLabel="Reset reference colour">
                <Text style={styles.secondaryButtonText}>Reset reference</Text>
              </TouchableOpacity>
              {canSave && (
                <TouchableOpacity
                  style={[styles.primaryButton, styles.actionButton]}
                  onPress={handleSaveMatch}
                  accessibilityLabel="Save this colour match">
                  <Text style={styles.primaryButtonText}>Save match</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  permissionContainer: {
    flex: 1, backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center', padding: Spacing[6],
  },
  permissionTitle: {
    fontSize: Typography.fontSize['2xl'], fontWeight: Typography.fontWeight.bold,
    color: Colors.textPrimary, textAlign: 'center', marginBottom: Spacing[3],
  },
  permissionBody: {
    fontSize: Typography.fontSize.base, color: Colors.textSecondary,
    textAlign: 'center', lineHeight: Typography.fontSize.base * 1.6, marginBottom: Spacing[8],
  },
  samplingWrapper: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
  },
  samplingOuter: { position: 'relative' },
  corner: { position: 'absolute', width: 22, height: 22, borderColor: Colors.samplingSquare },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  squareHint: {
    marginTop: Spacing[2], fontSize: Typography.fontSize.sm,
    color: 'rgba(255,255,255,0.75)', textAlign: 'center',
  },
  firstUseHint: {
    position: 'absolute', top: 80, left: Spacing[6], right: Spacing[6],
    backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: BorderRadius.lg,
    padding: Spacing[4], borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  firstUseText: {
    color: Colors.white, fontSize: Typography.fontSize.base,
    textAlign: 'center', lineHeight: Typography.fontSize.base * 1.5,
  },
  panel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(13,31,34,0.92)',
    borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl,
    paddingHorizontal: Spacing[5], paddingTop: Spacing[5], paddingBottom: Spacing[4],
  },
  swatchRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: Spacing[4],
  },
  swatchContainer: { alignItems: 'center' },
  swatch: { borderRadius: BorderRadius.md, borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)', ...Shadow.sm },
  swatchEmpty: { borderStyle: 'dashed', borderColor: Colors.textMuted, backgroundColor: 'rgba(255,255,255,0.08)' },
  swatchLabel: { marginTop: Spacing[1], fontSize: Typography.fontSize.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  gaugeContainer: { alignItems: 'center', flex: 1, paddingHorizontal: Spacing[3] },
  gaugeValue: { fontSize: Typography.fontSize['4xl'], fontWeight: Typography.fontWeight.bold, color: Colors.white, lineHeight: Typography.fontSize['4xl'] * 1.1 },
  gaugeNoData: { fontSize: Typography.fontSize['4xl'], fontWeight: Typography.fontWeight.bold, color: Colors.textMuted },
  gaugeLabel: { fontSize: Typography.fontSize.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 2 },
  statusBadge: { marginTop: Spacing[2], paddingHorizontal: Spacing[3], paddingVertical: Spacing[1], borderRadius: BorderRadius.full, borderWidth: 1 },
  statusText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold },
  instruction: { textAlign: 'center', fontSize: Typography.fontSize.sm, color: Colors.textMuted, marginBottom: Spacing[3] },
  actionRow: { flexDirection: 'row', gap: Spacing[3], justifyContent: 'center' },
  actionButton: { flex: 1 },
  primaryButton: {
    backgroundColor: Colors.teal500, paddingVertical: Spacing[4], paddingHorizontal: Spacing[5],
    borderRadius: BorderRadius.lg, alignItems: 'center', justifyContent: 'center', minHeight: 52, ...Shadow.sm,
  },
  primaryButtonText: { color: Colors.textInverse, fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.semibold },
  secondaryButton: {
    backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    paddingVertical: Spacing[4], paddingHorizontal: Spacing[5], borderRadius: BorderRadius.lg,
    alignItems: 'center', justifyContent: 'center', minHeight: 52,
  },
  secondaryButtonText: { color: Colors.white, fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.medium },
  buttonDisabled: { opacity: 0.6 },
});
