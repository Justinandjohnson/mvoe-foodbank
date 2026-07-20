import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

// Three palette states per variant — base + two alternates that crossfade in/out
const PALETTES = {
  default: [
    { colors: ['#07121F', '#0E2D3A', '#0C3A2C'], locations: [0, 0.42, 1] },
    { colors: ['#061422', '#0C3350', '#143E34'], locations: [0, 0.46, 1] },
    { colors: ['#080F1C', '#0B283C', '#0F3630'], locations: [0, 0.38, 1] },
  ],
  map: [
    { colors: ['#05101B', '#0A2434', '#123B36'], locations: [0, 0.45, 1] },
    { colors: ['#040D18', '#0C2D42', '#163F3C'], locations: [0, 0.48, 1] },
    { colors: ['#060E19', '#091F30', '#0E322E'], locations: [0, 0.42, 1] },
  ],
  soft: [
    { colors: ['#091724', '#163746', '#F3F8F6'], locations: [0, 0.34, 1] },
    { colors: ['#071320', '#123244', '#EBF5F1'], locations: [0, 0.38, 1] },
    { colors: ['#0B1928', '#183A48', '#F0F7F4'], locations: [0, 0.31, 1] },
  ],
};

// Floating aurora orbs — large translucent blobs that drift slowly
const ORBS = {
  default: [
    { color: 'rgba(13,78,55,0.26)', size: 380, x0: -80, y0: -90, dx: 72, dy: 52, dur: 14000 },
    { color: 'rgba(8,42,96,0.20)', size: 310, x0: 130, y0: 55, dx: -62, dy: 74, dur: 18500 },
    { color: 'rgba(18,72,50,0.17)', size: 250, x0: 40, y0: 290, dx: 82, dy: -48, dur: 12800 },
  ],
  map: [
    { color: 'rgba(10,72,68,0.24)', size: 360, x0: -60, y0: -55, dx: 66, dy: 48, dur: 16200 },
    { color: 'rgba(5,38,85,0.17)', size: 290, x0: 145, y0: 80, dx: -56, dy: 66, dur: 20500 },
    { color: 'rgba(16,68,62,0.15)', size: 230, x0: 50, y0: 250, dx: 76, dy: -42, dur: 13800 },
  ],
  soft: [
    { color: 'rgba(13,78,55,0.14)', size: 380, x0: -80, y0: -90, dx: 70, dy: 50, dur: 14000 },
    { color: 'rgba(8,42,96,0.10)', size: 310, x0: 130, y0: 55, dx: -60, dy: 72, dur: 18500 },
    { color: 'rgba(18,72,50,0.09)', size: 250, x0: 40, y0: 290, dx: 80, dy: -45, dur: 12800 },
  ],
};

export default function AppScreenBackground({ variant = 'default', style }) {
  const palettes = PALETTES[variant] || PALETTES.default;
  const orbConfigs = ORBS[variant] || ORBS.default;

  const l1 = useRef(new Animated.Value(0)).current;
  const l2 = useRef(new Animated.Value(0)).current;

  const orbState = useRef(
    orbConfigs.map(() => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      alpha: new Animated.Value(0.65),
    }))
  ).current;

  useEffect(() => {
    // Gradient crossfade: base → layer1 → layer2 → base → ...
    const gradientLoop = Animated.loop(
      Animated.sequence([
        Animated.delay(4200),
        Animated.timing(l1, { toValue: 1, duration: 2800, useNativeDriver: true }),
        Animated.delay(3800),
        Animated.parallel([
          Animated.timing(l1, { toValue: 0, duration: 2600, useNativeDriver: true }),
          Animated.timing(l2, { toValue: 1, duration: 2600, useNativeDriver: true }),
        ]),
        Animated.delay(3800),
        Animated.timing(l2, { toValue: 0, duration: 2800, useNativeDriver: true }),
      ])
    );

    gradientLoop.start();

    // Orb drift + breathe animations — each on its own independent loop
    const allAnims = orbState.map((orb, i) => {
      const cfg = orbConfigs[i];

      const xLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(orb.x, { toValue: cfg.dx, duration: cfg.dur, useNativeDriver: true }),
          Animated.timing(orb.x, { toValue: -cfg.dx * 0.55, duration: cfg.dur * 1.15, useNativeDriver: true }),
          Animated.timing(orb.x, { toValue: 0, duration: cfg.dur * 0.85, useNativeDriver: true }),
        ])
      );

      const yLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(orb.y, { toValue: cfg.dy, duration: cfg.dur * 1.3, useNativeDriver: true }),
          Animated.timing(orb.y, { toValue: -cfg.dy * 0.5, duration: cfg.dur * 1.1, useNativeDriver: true }),
          Animated.timing(orb.y, { toValue: 0, duration: cfg.dur, useNativeDriver: true }),
        ])
      );

      const alphaLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(orb.alpha, { toValue: 1.0, duration: cfg.dur * 0.9, useNativeDriver: true }),
          Animated.timing(orb.alpha, { toValue: 0.42, duration: cfg.dur * 1.1, useNativeDriver: true }),
        ])
      );

      xLoop.start();
      yLoop.start();
      alphaLoop.start();

      return { xLoop, yLoop, alphaLoop };
    });

    return () => {
      gradientLoop.stop();
      allAnims.forEach(({ xLoop, yLoop, alphaLoop }) => {
        xLoop.stop();
        yLoop.stop();
        alphaLoop.stop();
      });
    };
  }, [variant]);

  return (
    <View pointerEvents="none" style={[styles.fill, style]}>
      {/* Solid base gradient — always visible */}
      <LinearGradient
        colors={palettes[0].colors}
        locations={palettes[0].locations}
        style={styles.fill}
      />

      {/* Aurora orbs — drifting translucent blobs */}
      {orbConfigs.map((cfg, i) => (
        <Animated.View
          key={i}
          pointerEvents="none"
          style={[
            styles.orb,
            {
              width: cfg.size,
              height: cfg.size,
              borderRadius: cfg.size / 2,
              backgroundColor: cfg.color,
              left: cfg.x0,
              top: cfg.y0,
              opacity: orbState[i].alpha,
              transform: [
                { translateX: orbState[i].x },
                { translateY: orbState[i].y },
              ],
            },
          ]}
        />
      ))}

      {/* Crossfade layer 1 */}
      <Animated.View pointerEvents="none" style={[styles.fill, { opacity: l1 }]}>
        <LinearGradient
          colors={palettes[1].colors}
          locations={palettes[1].locations}
          style={styles.fill}
        />
      </Animated.View>

      {/* Crossfade layer 2 */}
      <Animated.View pointerEvents="none" style={[styles.fill, { opacity: l2 }]}>
        <LinearGradient
          colors={palettes[2].colors}
          locations={palettes[2].locations}
          style={styles.fill}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
  orb: {
    position: 'absolute',
  },
});
