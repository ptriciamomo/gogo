import { Dimensions, Platform } from 'react-native';

// Add global web styles to prevent zoom issues
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  // Inject global CSS to prevent zoom issues
  const style = document.createElement('style');
  style.textContent = `
    body {
      zoom: 1 !important;
      transform: scale(1) !important;
      transform-origin: top left !important;
    }
    * {
      box-sizing: border-box;
    }
    html {
      font-size: 16px !important;
    }
  `;
  document.head.appendChild(style);
}

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Base dimensions for responsive calculations
const baseWidth = 375; // iPhone X width
const baseHeight = 812; // iPhone X height

// Check if we're on web
const isWeb = Platform.OS === 'web';

// Web-specific scaling factor (less aggressive scaling)
const webScaleFactor = Math.min(screenWidth / baseWidth, 1.5); // Cap at 1.5x

// Responsive width (percentage of screen width)
export const rw = (size: number): number => (screenWidth * size) / 100;

// Responsive height (percentage of screen height)
export const rh = (size: number): number => (screenHeight * size) / 100;

// Responsive font size (scales with screen width, but less aggressive on web)
export const rf = (size: number): number => {
  if (isWeb) {
    // On web, use a more conservative scaling
    return size * webScaleFactor;
  }
  return (screenWidth * size) / baseWidth;
};

// Responsive padding/margin (scales with screen width, but less aggressive on web)
export const rp = (size: number): number => {
  if (isWeb) {
    // On web, use a more conservative scaling
    return size * webScaleFactor;
  }
  return (screenWidth * size) / baseWidth;
};

// Responsive border radius (scales with screen width, but less aggressive on web)
export const rb = (size: number): number => {
  if (isWeb) {
    // On web, use a more conservative scaling
    return size * webScaleFactor;
  }
  return (screenWidth * size) / baseWidth;
};

// Web-specific utilities for better control
export const webResponsive = {
  // Web font size (even more conservative)
  font: (size: number): number => {
    if (isWeb) {
      return Math.min(size * 1.2, size + 4); // Max 20% increase or +4px
    }
    return rf(size);
  },
  
  // Web padding (even more conservative)
  padding: (size: number): number => {
    if (isWeb) {
      return Math.min(size * 1.1, size + 2); // Max 10% increase or +2px
    }
    return rp(size);
  },
  
  // Web border radius (minimal scaling)
  borderRadius: (size: number): number => {
    if (isWeb) {
      return Math.min(size * 1.1, size + 1); // Max 10% increase or +1px
    }
    return rb(size);
  }
};

// Main responsive function
export const responsive = {
  width: rw,
  height: rh,
  font: rf,
  padding: rp,
  borderRadius: rb,
  percentageWidth: rw, // Alias for rw
  buttonHeight: (): number => rh(6), // Standard button height
};
