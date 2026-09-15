import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { registerPushDevice } from '@/services/api';


const DEVICE_ID_KEY = 'dumilk_admin_device_id';


Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true
  })
});


function createDeviceId(): string {
  const randomPart = Math.random()
    .toString(36)
    .slice(2, 12);

  return [
    'dumilk-admin',
    Platform.OS,
    Date.now().toString(36),
    randomPart
  ].join('-');
}


async function getOrCreateDeviceId(): Promise<string> {
  const existing =
    await AsyncStorage.getItem(DEVICE_ID_KEY);

  if (existing) {
    return existing;
  }

  const created = createDeviceId();

  await AsyncStorage.setItem(
    DEVICE_ID_KEY,
    created
  );

  return created;
}


async function configureAndroidChannel() {
  if (Platform.OS !== 'android') {
    return;
  }

  await Notifications.setNotificationChannelAsync(
    'dumilk-sales',
    {
      name: 'Vendas e eventos DUMILK',
      description:
        'Alertas de vendas, caixa e eventos administrativos.',
      importance:
        Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      enableVibrate: true,
      enableLights: true,
      sound: 'default'
    }
  );
}


async function requestNotificationPermission(): Promise<boolean> {
  await configureAndroidChannel();

  const current =
    await Notifications.getPermissionsAsync();

  if (current.status === 'granted') {
    return true;
  }

  const requested =
    await Notifications.requestPermissionsAsync();

  return requested.status === 'granted';
}


function getProjectId(): string {
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

  if (!projectId) {
    throw new Error(
      'Project ID do Expo/EAS não encontrado.'
    );
  }

  return projectId;
}


function getDeviceName(): string {
  const parts = [
    Device.deviceName,
    Device.modelName
  ].filter(Boolean);

  if (parts.length > 0) {
    return parts.join(' - ');
  }

  return Platform.OS === 'ios'
    ? 'iPhone / iPad'
    : 'Android';
}


export type PushRegistrationResult = {
  ok: boolean;
  registered: boolean;
  reason?: string;
};


export async function registerCurrentDeviceForPush():
  Promise<PushRegistrationResult> {

  if (Platform.OS === 'web') {
    return {
      ok: true,
      registered: false,
      reason:
        'Push móvel não é registrado na versão web.'
    };
  }

  try {
    const allowed =
      await requestNotificationPermission();

    if (!allowed) {
      return {
        ok: true,
        registered: false,
        reason:
          'Permissão de notificações não concedida.'
      };
    }

    const projectId = getProjectId();

    const expoPushToken =
      await Notifications.getExpoPushTokenAsync({
        projectId
      });

    const deviceId =
      await getOrCreateDeviceId();

    await registerPushDevice({
      device_id: deviceId,
      push_token: expoPushToken.data,
      platform:
        Platform.OS === 'ios'
          ? 'ios'
          : 'android',
      device_name: getDeviceName()
    });

    return {
      ok: true,
      registered: true
    };

  } catch (error) {
    console.warn(
      'DUMILK Push: não foi possível registrar o aparelho.',
      error
    );

    return {
      ok: false,
      registered: false,
      reason:
        error instanceof Error
          ? error.message
          : 'Erro desconhecido ao registrar notificações.'
    };
  }
}