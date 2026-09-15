import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:8000/api/v1';
const TOKEN_KEY = 'dumilk_admin_token';

export async function fullRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || 'Não foi possível concluir a operação.');
  }
  return response.json();
}

export const getFull = <T=any>(module: string) => fullRequest<T>(`/admin/${module}`);

export async function enqueue(module: string, action: string, payload: Record<string, unknown>) {
  return fullRequest<{ok:boolean;command_id:string;status:string;payload:Record<string,unknown>}>('/admin/commands', {
    method: 'POST',
    body: JSON.stringify({ module, action, payload }),
  });
}

export const commandMessage = 'Comando enviado. A sincronização com o PDV é automática e normalmente aparece em alguns segundos.';

// Foto do produto e um dado so da nuvem (nao muda a logica de venda do
// PDV), por isso e salva direto, sem passar pelo enqueue de comandos.
export async function setProductImage(code: string, imageUrl: string | null) {
  return fullRequest<{ ok: boolean; product_code: string; image_url: string | null }>(
    `/admin/products/${encodeURIComponent(code)}/image`,
    {
      method: 'PUT',
      body: JSON.stringify({ image_url: imageUrl }),
    }
  );
}

// Estoque maximo tambem e um dado so da nuvem (o PDV so conhece o
// minimo), usado para calcular a sugestao de compra.
export async function setProductStockMax(code: string, maxStock: number | null) {
  return fullRequest<{ ok: boolean; product_code: string; max_stock: number | null }>(
    `/admin/products/${encodeURIComponent(code)}/stock-settings`,
    {
      method: 'PUT',
      body: JSON.stringify({ max_stock: maxStock }),
    }
  );
}

export async function getMonthlyFinanceReport(month: string) {
  return fullRequest<any>(`/admin/finance/monthly-report?month=${encodeURIComponent(month)}`);
}

export async function getCashFlow(start: string, end: string, accountId?: number | null) {
  const accountParam = accountId ? `&account_id=${accountId}` : '';
  return fullRequest<any>(
    `/admin/finance/cashflow?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}${accountParam}`
  );
}

// Contas (caixa/banco), mapeamento de forma de pagamento e
// transferencias -- tudo dado so da nuvem, igual foto de produto.
export async function getAccounts() {
  return fullRequest<any>('/admin/accounts');
}

export async function createAccount(payload: {
  name: string;
  account_type: string;
  initial_balance: number;
  opening_date: string;
  is_default: boolean;
}) {
  return fullRequest<any>('/admin/accounts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateAccount(id: number, payload: Record<string, unknown>) {
  return fullRequest<any>(`/admin/accounts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function getPaymentMapping() {
  return fullRequest<any>('/admin/accounts/payment-mapping');
}

export async function setPaymentMapping(mapping: Record<string, number | null>) {
  return fullRequest<any>('/admin/accounts/payment-mapping', {
    method: 'PUT',
    body: JSON.stringify({ mapping }),
  });
}

export async function setEntryAccount(entryId: string, accountId: number | null) {
  return fullRequest<any>(`/admin/accounts/entries/${encodeURIComponent(entryId)}/account`, {
    method: 'PUT',
    body: JSON.stringify({ account_id: accountId }),
  });
}

export async function getTransfers() {
  return fullRequest<any>('/admin/accounts/transfers');
}

export async function createTransfer(payload: {
  from_account_id: number;
  to_account_id: number;
  amount: number;
  transfer_date: string;
  description?: string;
}) {
  return fullRequest<any>('/admin/accounts/transfers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// Fiscal (NFC-e) -- fase 1, so cadastro. O certificado digital e' um
// arquivo, por isso usa multipart em vez de JSON (nao pode passar pelo
// fullRequest, que sempre manda Content-Type: application/json).
export async function getFiscalCertificate() {
  return fullRequest<any>('/admin/fiscal/certificate');
}

export async function uploadFiscalCertificate(payload: {
  file: { uri: string; name: string; type: string } | File;
  password: string;
  cnpj: string;
  razao_social: string;
  inscricao_estadual: string;
  uf: string;
}) {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  const form = new FormData();
  form.append('file', payload.file as any);
  form.append('password', payload.password);
  form.append('cnpj', payload.cnpj);
  form.append('razao_social', payload.razao_social);
  form.append('inscricao_estadual', payload.inscricao_estadual);
  form.append('uf', payload.uf);

  const response = await fetch(`${BASE_URL}/admin/fiscal/certificate`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || 'Não foi possível enviar o certificado.');
  }
  return response.json();
}

export async function setFiscalAmbiente(ambiente: 'homologacao' | 'producao') {
  return fullRequest<any>('/admin/fiscal/certificate/ambiente', {
    method: 'PUT',
    body: JSON.stringify({ ambiente }),
  });
}

export async function deleteFiscalCertificate() {
  return fullRequest<any>('/admin/fiscal/certificate', { method: 'DELETE' });
}

export async function getProductFiscal(code: string) {
  return fullRequest<any>(`/admin/fiscal/products/${encodeURIComponent(code)}`);
}

export async function setProductFiscal(
  code: string,
  payload: { ncm: string; cfop: string; csosn_cst: string; origem_mercadoria: string; unidade_tributavel: string }
) {
  return fullRequest<any>(`/admin/fiscal/products/${encodeURIComponent(code)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function getProductFiscalSummary() {
  return fullRequest<any>('/admin/fiscal/products/summary/count');
}
