/**
 * Jest mock for @react-native-async-storage/async-storage
 */

const items: Record<string, string> = {};

const AsyncStorage = {
  getItem: jest.fn((key: string) => Promise.resolve(items[key] || null)),
  setItem: jest.fn((key: string, value: string) => {
    items[key] = value;
    return Promise.resolve();
  }),
  removeItem: jest.fn((key: string) => {
    delete items[key];
    return Promise.resolve();
  }),
  clear: jest.fn(() => {
    Object.keys(items).forEach(key => delete items[key]);
    return Promise.resolve();
  }),
};

export default AsyncStorage;
