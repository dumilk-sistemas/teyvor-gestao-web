import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:8000/api/v1';
const TOKEN_KEY = 'dumilk_admin_token';

// O FastAPI manda `detail` como string na maioria dos erros, mas em
// erro de validacao (422) manda uma lista de objetos -- sem isso,
// `new Error(detail)` vira o texto inutil "[object Object]".
function detailToMessage(detail: unknown): string {
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    return detail.map((item) => (item && typeof item === 'object' ? item.msg || JSON.stringify(item) : String(item))).join(' ');
  }
  return 'Não foi possível concluir a operação.';
}

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
    throw new Error(detailToMessage(body.detail));
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

export async function getProductCategories() {
  return fullRequest<any>('/admin/product-categories');
}

export async function createProductCategory(payload: { name: string; active: boolean }) {
  return fullRequest<any>('/admin/product-categories', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateProductCategory(
  id: number,
  payload: { name?: string; active?: boolean }
) {
  return fullRequest<any>(`/admin/product-categories/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteProductCategory(id: number, transferToId?: number | null) {
  return fullRequest<any>(`/admin/product-categories/${id}/delete`, {
    method: 'POST',
    body: JSON.stringify({ transfer_to_id: transferToId ?? null }),
  });
}

export async function getMonthlyFinanceReport(month: string) {
  return fullRequest<any>(`/admin/finance/monthly-report?month=${encodeURIComponent(month)}`);
}

export async function getFinancialCategories() {
  return fullRequest<any>('/admin/finance-management/categories');
}

export async function createFinancialCategory(payload: {
  name: string;
  category_type: 'expense' | 'revenue' | 'non_operating';
  parent_id?: number | null;
  active: boolean;
}) {
  return fullRequest<any>('/admin/finance-management/categories', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateFinancialCategory(id: number, payload: Record<string, unknown>) {
  return fullRequest<any>(`/admin/finance-management/categories/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteFinancialCategory(id: number, transferToId?: number | null) {
  return fullRequest<any>(`/admin/finance-management/categories/${id}/delete`, {
    method: 'POST',
    body: JSON.stringify({ transfer_to_id: transferToId ?? null }),
  });
}

export async function deleteFinancialEntry(
  id: string,
  payload: { reason: string; stop_recurring?: boolean }
) {
  return fullRequest<any>(`/admin/finance-management/entries/${encodeURIComponent(id)}/delete`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
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

export async function deleteAccount(id: number) {
  return fullRequest<any>(`/admin/accounts/${id}/delete`, {
    method: 'POST',
  });
}

export async function adjustAccountBalance(
  id: number,
  payload: { new_balance: number; reason: string }
) {
  return fullRequest<any>(`/admin/accounts/${id}/adjust-balance`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getAccountAdjustments(id: number) {
  return fullRequest<any>(`/admin/accounts/${id}/adjustments`);
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

// Contas fixas / recorrentes -- a regra mora so na nuvem, mas cada
// parcela gerada vira um lancamento de verdade no PDV (mesmo comando
// que "+ Conta a pagar" ja usa), entao aparece e e' baixada normalmente.
export async function getRecurringRules() {
  return fullRequest<any>('/admin/recurring-rules');
}

export async function createRecurringRule(payload: Record<string, unknown>) {
  return fullRequest<any>('/admin/recurring-rules', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateRecurringRule(id: number, payload: Record<string, unknown>) {
  return fullRequest<any>(`/admin/recurring-rules/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function generateRecurringRule(id: number, monthsAhead = 12) {
  return fullRequest<any>(`/admin/recurring-rules/${id}/generate?months_ahead=${monthsAhead}`, {
    method: 'POST',
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
