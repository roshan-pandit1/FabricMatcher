/**
 * useFabricStore.tsx
 * Application state management store & React Context for FabricMatcher.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AppState,
  CameraContract,
  UNKNOWN_CONTRACT,
  ReferenceCapture,
  ComparisonResult,
  SavedMatch,
  makeSessionId,
  makeCaptureId,
  makeMatchId,
  labToHex,
} from '../colour/sessionState';
import { LabColour, componentwiseMedian } from '../colour/colourMath';
import { PatchResult, BurstResult, DEFAULT_CONFIG } from '../colour/patchAnalysis';
import { compareBursts } from '../colour/compareBursts';

const SAVED_MATCHES_KEY = '@fabric_matcher_saved_matches';

export interface FabricStoreState {
  permissionGranted: boolean;
  appState: AppState;
  contract: CameraContract;
  reference: ReferenceCapture | null;
  liveResult: ComparisonResult | null;
  savedMatches: SavedMatch[];
  error: string | null;
}

export interface FabricStoreActions {
  setPermissionGranted: () => void;
  startCollectingReference: () => void;
  setContractVerified: (verified: boolean) => void;
  commitReference: (labValues: LabColour[], patchResults: PatchResult[]) => void;
  resetReference: () => void;
  updateLiveCandidate: (labValues: LabColour[], patchResults: PatchResult[], focusAndMotionOk?: boolean) => void;
  saveCurrentMatch: (customName: string | null) => void;
  deleteMatch: (id: string) => void;
  setError: (msg: string | null) => void;
}

export interface FabricStoreContextType {
  store: FabricStoreState;
  actions: FabricStoreActions;
}

const FabricStoreContext = createContext<FabricStoreContextType | null>(null);

export const FabricStoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [permissionGranted, setPermissionGrantedState] = useState<boolean>(false);
  const [appState, setAppState] = useState<AppState>('readyForReference');
  const [contract, setContract] = useState<CameraContract>(UNKNOWN_CONTRACT);
  const [reference, setReference] = useState<ReferenceCapture | null>(null);
  const [liveResult, setLiveResult] = useState<ComparisonResult | null>(null);
  const [savedMatches, setSavedMatches] = useState<SavedMatch[]>([]);
  const [error, setErrorState] = useState<string | null>(null);

  // Load saved matches on startup
  useEffect(() => {
    AsyncStorage.getItem(SAVED_MATCHES_KEY)
      .then(json => {
        if (json) {
          try {
            setSavedMatches(JSON.parse(json));
          } catch (_) {}
        }
      })
      .catch(() => {});
  }, []);

  // Save matches whenever they change
  const persistMatches = useCallback((matches: SavedMatch[]) => {
    setSavedMatches(matches);
    AsyncStorage.setItem(SAVED_MATCHES_KEY, JSON.stringify(matches)).catch(() => {});
  }, []);

  const setPermissionGranted = useCallback(() => {
    setPermissionGrantedState(true);
  }, []);

  const startCollectingReference = useCallback(() => {
    setAppState('collectingReference');
    setErrorState(null);
  }, []);

  const setContractVerified = useCallback((verified: boolean) => {
    setContract(prev => ({ ...prev, aeAwbActuallyLocked: verified }));
  }, []);

  const commitReference = useCallback((labValues: LabColour[], patchResults: PatchResult[]) => {
    const repLab = componentwiseMedian(labValues);
    const burstResult: BurstResult = {
      ok: true,
      reasons: [],
      frameLab: labValues,
      representativeLab: repLab,
      temporalP90: 0.1,
      spatialP90Max: 0.5,
    };

    const newRef: ReferenceCapture = {
      sessionId: makeSessionId(),
      captureId: makeCaptureId(),
      timestamp: Date.now(),
      burstResult,
      contract,
      frameLab: labValues,
      representativeLab: repLab,
    };

    setReference(newRef);
    setAppState('referenceReady');
  }, [contract]);

  const resetReference = useCallback(() => {
    setReference(null);
    setLiveResult(null);
    setAppState('readyForReference');
  }, []);

  const updateLiveCandidate = useCallback((
    labValues: LabColour[],
    patchResults: PatchResult[],
    focusAndMotionOk = true,
  ) => {
    if (!reference) return;

    const repLab = componentwiseMedian(labValues);
    const candidateBurst: BurstResult = {
      ok: true,
      reasons: [],
      frameLab: labValues,
      representativeLab: repLab,
      temporalP90: 0.1,
      spatialP90Max: 0.5,
    };

    const comp = compareBursts({
      referenceResult: reference.burstResult,
      candidateResult: candidateBurst,
      captureConditionsVerified: true,
      focusAndMotionOk,
      sessionId: reference.sessionId,
      referenceId: reference.captureId,
      config: DEFAULT_CONFIG,
    });

    setLiveResult(comp);
  }, [reference]);

  const saveCurrentMatch = useCallback((customName: string | null) => {
    if (!reference || !liveResult) return;

    const candLab: LabColour = liveResult.deltaLab
      ? [
          reference.representativeLab[0] + liveResult.deltaLab[0],
          reference.representativeLab[1] + liveResult.deltaLab[1],
          reference.representativeLab[2] + liveResult.deltaLab[2],
        ]
      : reference.representativeLab;

    const newMatch: SavedMatch = {
      id: makeMatchId(),
      sessionId: reference.sessionId,
      referenceId: reference.captureId,
      savedAt: Date.now(),
      name: customName || `Match ${new Date().toLocaleDateString()}`,
      referenceSwatch: labToHex(reference.representativeLab),
      candidateSwatch: labToHex(candLab),
      thumbnailUri: null,
      comparison: liveResult,
    };

    persistMatches([newMatch, ...savedMatches]);
  }, [reference, liveResult, savedMatches, persistMatches]);

  const deleteMatch = useCallback((id: string) => {
    persistMatches(savedMatches.filter(m => m.id !== id));
  }, [savedMatches, persistMatches]);

  const setError = useCallback((msg: string | null) => {
    setErrorState(msg);
  }, []);

  const value = useMemo(
    () => ({
      store: {
        permissionGranted,
        appState,
        contract,
        reference,
        liveResult,
        savedMatches,
        error,
      },
      actions: {
        setPermissionGranted,
        startCollectingReference,
        setContractVerified,
        commitReference,
        resetReference,
        updateLiveCandidate,
        saveCurrentMatch,
        deleteMatch,
        setError,
      },
    }),
    [
      permissionGranted, appState, contract, reference, liveResult, savedMatches, error,
      setPermissionGranted, startCollectingReference, setContractVerified,
      commitReference, resetReference, updateLiveCandidate, saveCurrentMatch, deleteMatch, setError,
    ],
  );

  return (
    <FabricStoreContext.Provider value={value}>
      {children}
    </FabricStoreContext.Provider>
  );
};

export function useFabricStore(): FabricStoreContextType {
  const context = useContext(FabricStoreContext);
  if (!context) {
    throw new Error('useFabricStore must be used within a FabricStoreProvider');
  }
  return context;
}
