import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  Branding,
  CashData,
  CustomerWrite,
  CustomersData,
  DashboardSummary,
  FinanceData,
  ManagedUser,
  ProductsData,
  PurchasesData,
  ReportsData,
  SalesData,
  StockData,
  SuppliersData,
  User,
  UsersData
} from '@/types/api';


const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  'http://127.0.0.1:8000/api/v1';

const TOKEN_KEY = 'dumilk_admin_token';
const BRANDING_KEY = 'teyvor_admin_branding';
const USER_KEY = 'teyvor_admin_user';


async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await AsyncStorage.getItem(TOKEN_KEY);

  const response = await fetch(
    `${BASE_URL}${path}`,
    {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token
          ? {
              Authorization: `Bearer ${token}`
            }
          : {}),
        ...(options.headers || {})
      }
    }
  );

  if (!response.ok) {
    const body = await response
      .json()
      .catch(() => ({}));

    throw new Error(
      body.detail ||
      'Não foi possível concluir a operação.'
    );
  }

  return response.json();
}


// =====================================================
// AUTENTICAÇÃO
// =====================================================

export async function login(
  email: string,
  password: string
): Promise<User> {
  const result = await request<{
    access_token: string;
    user: User;
  }>(
    '/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({
        email,
        password
      })
    }
  );

  await AsyncStorage.setItem(
    TOKEN_KEY,
    result.access_token
  );

  if (result.user.branding) {
    await AsyncStorage.setItem(
      BRANDING_KEY,
      JSON.stringify(result.user.branding)
    );
  }

  await AsyncStorage.setItem(
    USER_KEY,
    JSON.stringify(result.user)
  );

  return result.user;
}


export async function logout() {
  await AsyncStorage.removeItem(TOKEN_KEY);
  await AsyncStorage.removeItem(BRANDING_KEY);
  await AsyncStorage.removeItem(USER_KEY);
}


export async function getStoredUser(): Promise<User | null> {
  const raw = await AsyncStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}


export async function hasSession() {
  return Boolean(
    await AsyncStorage.getItem(TOKEN_KEY)
  );
}


export async function getStoredBranding(): Promise<Branding | null> {
  const raw = await AsyncStorage.getItem(BRANDING_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Branding;
  } catch {
    return null;
  }
}


// =====================================================
// DASHBOARD / SINCRONIZAÇÃO
// =====================================================

export async function getDashboard() {
  return request<DashboardSummary>(
    '/dashboard/summary'
  );
}


export async function getSyncStatus() {
  return request<{
    configured: boolean;
    message: string;
    last_sync_at: string | null;
    terminal_name?: string | null;
  }>('/sync/status');
}


// =====================================================
// VENDAS
// =====================================================

export async function getSales() {
  return request<SalesData>(
    '/admin/sales'
  );
}


// =====================================================
// PRODUTOS
// =====================================================

export async function getProducts() {
  return request<ProductsData>(
    '/admin/products'
  );
}


// =====================================================
// CLIENTES
// =====================================================

export async function getCustomers() {
  return request<CustomersData>(
    '/admin/customers'
  );
}


export async function createCustomer(
  payload: CustomerWrite
) {
  return request<{
    ok: boolean;
    customer: Record<string, unknown>;
    sync_pending: boolean;
  }>(
    '/admin/customers',
    {
      method: 'POST',
      body: JSON.stringify(payload)
    }
  );
}


export async function updateCustomer(
  id: number | string,
  payload: CustomerWrite
) {
  return request<{
    ok: boolean;
    customer: Record<string, unknown>;
    sync_pending: boolean;
  }>(
    `/admin/customers/${encodeURIComponent(
      String(id)
    )}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload)
    }
  );
}


// =====================================================
// FORNECEDORES / COMPRAS
// =====================================================

export async function getSuppliers() {
  return request<SuppliersData>(
    '/admin/suppliers'
  );
}


export async function getPurchases() {
  return request<PurchasesData>(
    '/admin/purchases'
  );
}


// =====================================================
// ESTOQUE
// =====================================================

export async function getStock() {
  return request<StockData>(
    '/admin/stock'
  );
}


// =====================================================
// FINANCEIRO
// =====================================================

export async function getFinance() {
  return request<FinanceData>(
    '/admin/finance'
  );
}


// =====================================================
// CAIXA
// =====================================================

export async function getCash() {
  return request<CashData>(
    '/admin/cash'
  );
}


// =====================================================
// RELATÓRIOS
// =====================================================

export async function getReports(start?: string, end?: string) {
  const params = new URLSearchParams();
  if (start) params.set('start', start);
  if (end) params.set('end', end);
  const query = params.toString();
  return request<ReportsData>(
    `/admin/reports${query ? `?${query}` : ''}`
  );
}


// =====================================================
// CENTRAL DE NOTIFICAÇÕES
// =====================================================

export type NotificationEvent = {
  id: number;
  event_key: string;
  event_type: string;
  terminal_id: string | null;
  title: string;
  message: string;
  payload: Record<string, unknown>;
  push_status: string;
  created_at: string | null;
  push_sent_at: string | null;
  read_at: string | null;
  read: boolean;
};


export type NotificationsData = {
  ok: boolean;
  unread_count: number;
  notifications: NotificationEvent[];
};


export async function getNotifications(
  unreadOnly = false,
  limit = 100
) {
  return request<NotificationsData>(
    `/admin/notifications?unread_only=${
      unreadOnly ? 'true' : 'false'
    }&limit=${limit}`
  );
}


export async function markNotificationRead(
  eventId: number
) {
  return request<{
    ok: boolean;
    notification: NotificationEvent;
  }>(
    `/admin/notifications/${eventId}/read`,
    {
      method: 'PATCH'
    }
  );
}


export async function markAllNotificationsRead() {
  return request<{
    ok: boolean;
    marked_read: number;
  }>(
    '/admin/notifications/read-all',
    {
      method: 'PATCH'
    }
  );
}


// =====================================================
// DISPOSITIVOS PARA PUSH
// =====================================================

export type PushDeviceRegister = {
  device_id: string;
  push_token: string;
  platform: 'ios' | 'android';
  device_name?: string | null;
};


export type PushDevice = {
  id: number;
  device_id: string;
  platform: string;
  owner_email: string | null;
  device_name: string | null;
  active: boolean;
  created_at: string | null;
  last_seen_at: string | null;
};


export async function registerPushDevice(
  payload: PushDeviceRegister
) {
  return request<{
    ok: boolean;
    device: PushDevice;
  }>(
    '/admin/push-devices/register',
    {
      method: 'POST',
      body: JSON.stringify(payload)
    }
  );
}


export async function getPushDevices() {
  return request<{
    ok: boolean;
    devices: PushDevice[];
  }>(
    '/admin/push-devices'
  );
}


export async function deactivatePushDevice(
  deviceId: string
) {
  return request<{
    ok: boolean;
    device: PushDevice;
  }>(
    `/admin/push-devices/${encodeURIComponent(
      deviceId
    )}/deactivate`,
    {
      method: 'PATCH'
    }
  );
}


// =====================================================
// USUÁRIOS E PERMISSÕES
// =====================================================

export async function getUsers() {
  return request<UsersData>('/admin/users');
}


export type UserCreatePayload = {
  name: string;
  email: string;
  password: string;
  role: string;
  branch_id: number;
  permissions?: string[];
};


export async function createUser(payload: UserCreatePayload) {
  return request<{ ok: boolean; user: ManagedUser }>(
    '/admin/users',
    {
      method: 'POST',
      body: JSON.stringify(payload)
    }
  );
}


export type UserUpdatePayload = {
  name?: string;
  role?: string;
  branch_id?: number;
  permissions?: string[];
  active?: boolean;
  password?: string;
};


export async function updateUser(
  userId: number,
  payload: UserUpdatePayload
) {
  return request<{ ok: boolean; user: ManagedUser }>(
    `/admin/users/${userId}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload)
    }
  );
}