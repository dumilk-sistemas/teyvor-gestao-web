import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, type DimensionValue } from 'react-native';

type Props = {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: any;
};

// Bloco cinza com pulso de opacidade, usado no lugar de tela em
// branco/spinner enquanto os dados de uma tela ainda não chegaram.
export function Skeleton({ width = '100%', height = 16, radius = 8, style }: Props) {
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 650, useNativeDriver: true }),
      ])
    );

    loop.start();

    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[styles.base, { width, height, borderRadius: radius, opacity }, style]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: '#E7E5DF',
  },
});
