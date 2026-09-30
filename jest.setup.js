/**
 * jest.setup.js
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
}));

jest.mock('react-native-vision-camera', () => ({
  Camera: () => null,
  useCameraDevice: jest.fn(() => ({
    id: 'mock-camera',
    position: 'back',
    hasFlash: false,
    hasTorch: false,
  })),
  useCameraPermission: jest.fn(() => ({
    hasPermission: true,
    requestPermission: jest.fn(() => Promise.resolve(true)),
  })),
  usePhotoOutput: jest.fn(() => ({
    capturePhoto: jest.fn(() => Promise.resolve({ path: '/mock/photo.jpg' })),
  })),
}));
