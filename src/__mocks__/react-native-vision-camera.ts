/**
 * Jest mock for react-native-vision-camera
 */

import React from 'react';

export const Camera = React.forwardRef((props: any, ref: any) => null);

export const useCameraDevice = jest.fn(() => ({
  id: 'mock-camera',
  position: 'back',
  hasFlash: false,
  hasTorch: false,
}));

export const useCameraPermission = jest.fn(() => ({
  hasPermission: true,
  requestPermission: jest.fn(() => Promise.resolve(true)),
}));

export const usePhotoOutput = jest.fn(() => ({
  capturePhoto: jest.fn(() => Promise.resolve({ path: '/mock/photo.jpg' })),
}));
