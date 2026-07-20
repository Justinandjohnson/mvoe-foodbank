import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const SURFACE_PRESETS = {
  light: {
    colors: ['rgba(255,255,255,0.90)', 'rgba(248,250,252,0.68)'],
    borderColor: 'rgba(255,255,255,0.58)',
  },
  dark: {
    colors: ['rgba(15,23,42,0.90)', 'rgba(15,23,42,0.72)'],
    borderColor: 'rgba(255,255,255,0.16)',
  },
  emerald: {
    colors: ['rgba(11,61,55,0.92)', 'rgba(11,61,55,0.72)'],
    borderColor: 'rgba(167,243,208,0.20)',
  },
};

export default function GlassSurface({
  children,
  style,
  contentStyle,
  preset = 'light',
  radius = 26,
  padding = 16,
}) {
  const surface = SURFACE_PRESETS[preset] || SURFACE_PRESETS.light;

  return (
    <LinearGradient
      colors={surface.colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.surface,
        {
          borderRadius: radius,
          borderColor: surface.borderColor,
          padding,
        },
        style,
      ]}
    >
      <View style={contentStyle}>{children}</View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  surface: {
    borderWidth: 1,
    shadowColor: '#020617',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.14,
    shadowRadius: 22,
  },
});
