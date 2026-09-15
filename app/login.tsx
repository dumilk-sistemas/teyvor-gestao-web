import { useMemo, useState } from 'react';

import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';

import { router } from 'expo-router';

import { login } from '@/services/api';
import { registerCurrentDeviceForPush } from '@/services/pushNotifications';
import { theme, useThemeColors } from '@/constants/theme';
import { useBranding } from '@/contexts/BrandingContext';
import { useUser } from '@/contexts/UserContext';


export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { reloadStoredBranding } = useBranding();
  const { reloadStoredUser } = useUser();


  async function submit() {
    setBusy(true);
    setError('');

    try {
      await login(
        email.trim(),
        password
      );

      await reloadStoredBranding();
      await reloadStoredUser();
      await registerCurrentDeviceForPush();

      router.replace('/dashboard');

    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Falha no login.'
      );

    } finally {
      setBusy(false);
    }
  }


  return (
    <KeyboardAvoidingView
      behavior={
        Platform.OS === 'ios'
          ? 'padding'
          : undefined
      }
      style={styles.root}
    >
      <View style={styles.brand}>
        <Text style={styles.brandText}>
          TEYVOR
        </Text>

        <Text style={styles.brandSub}>
          GESTÃO 360
        </Text>
      </View>


      <View style={styles.card}>
        <Text style={styles.title}>
          Acesso à Gestão
        </Text>

        <Text style={styles.subtitle}>
          Entre com sua conta para acessar a gestão da empresa.
        </Text>


        <Text style={styles.label}>
          E-mail
        </Text>

        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoCorrect={false}
          style={styles.input}
          placeholder="administrador@dumilk.com.br"
          placeholderTextColor={theme.colors.muted}
          selectionColor={c.gold}
        />


        <Text style={styles.label}>
          Senha
        </Text>

        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          placeholder="Sua senha"
          placeholderTextColor={theme.colors.muted}
          selectionColor={c.gold}
        />


        {!!error && (
          <Text style={styles.error}>
            {error}
          </Text>
        )}


        <Pressable
          onPress={submit}
          disabled={busy}
          style={({ pressed }) => [
            styles.button,
            pressed && {
              opacity: 0.85
            },
            busy && {
              opacity: 0.6
            }
          ]}
        >
          <Text style={styles.buttonText}>
            {busy
              ? 'Entrando...'
              : 'Entrar'}
          </Text>
        </Pressable>


        <Text style={styles.security}>
          Acesso remoto seguro
          {' • '}
          conexão segura via API
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}


const makeStyles = (c: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    justifyContent: 'center',
    padding: 24
  },

  brand: {
    alignItems: 'center',
    marginBottom: 24
  },

  brandText: {
    fontSize: 34,
    letterSpacing: 5,
    fontWeight: '900',
    color: theme.colors.black
  },

  brandSub: {
    marginTop: 6,
    fontSize: 11,
    letterSpacing: 2,
    color: c.gold,
    fontWeight: '800'
  },

  card: {
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: 24,
    borderWidth: 1,
    borderColor: theme.colors.border
  },

  title: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.colors.text
  },

  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    marginBottom: 22,
    color: theme.colors.muted
  },

  label: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 7,
    color: theme.colors.text
  },

  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    height: 50,
    paddingHorizontal: 14,
    marginBottom: 16,
    backgroundColor: '#FFFFFF',

    // IMPORTANTE NO ANDROID:
    color: '#171717',

    fontSize: 15
  },

  button: {
    height: 52,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.black,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4
  },

  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800'
  },

  error: {
    color: theme.colors.danger,
    marginBottom: 12,
    fontSize: 13,
    fontWeight: '600'
  },

  security: {
    textAlign: 'center',
    marginTop: 16,
    fontSize: 11,
    color: theme.colors.muted
  }
});