import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/constants/theme';

type ToastTone = 'success' | 'error';
type ToastItem = { id: number; message: string; tone: ToastTone };

type ToastContextValue = {
  showToast: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let nextToastId = 1;

// Notificação flutuante que aparece e some sozinha, no lugar do antigo
// aviso fixo ("Notice") que ficava ocupando espaço na tela até a
// próxima navegação. Erros continuam como aviso fixo (Notice) — o
// usuário precisa de tempo para ler e agir sobre eles.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (message: string, tone: ToastTone = 'success') => {
      const id = nextToastId++;
      setToast({ id, message, tone });

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      opacity.stopAnimation();
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }).start();

      timerRef.current = setTimeout(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }).start(() => {
          setToast((current) => (current?.id === id ? null : current));
        });
      }, 3200);
    },
    [opacity]
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      <View style={styles.root}>
        {children}

        {toast && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.host,
              { opacity },
              toast.tone === 'error' ? styles.hostError : styles.hostSuccess,
            ]}
          >
            <Text style={styles.text}>{toast.message}</Text>
          </Animated.View>
        )}
      </View>
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  host: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 28,
    maxWidth: 420,
    alignSelf: 'center',
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    paddingHorizontal: 18,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 10,
    zIndex: 999,
  },

  hostSuccess: {
    backgroundColor: '#1F2A22',
  },

  hostError: {
    backgroundColor: '#3A1F20',
  },

  text: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
});
