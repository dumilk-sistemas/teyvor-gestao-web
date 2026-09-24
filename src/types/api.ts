export type Branding = {
  brand_name: string;
  logo_url: string | null;
  color_primary: string;
  color_secondary: string;
};

export type User = {
  id?: number;
  email: string;
  name: string;
  role: string;
  permissions?: string[];
  branch_id?: number;
  branding?: Branding;
};

export type ManagedUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  role_label: string;
  branch_id: number;
  permissions: string[];
  active: boolean;
  created_at: string | null;
  last_login_at: string | null;
};

export type RoleOption = { value: string; label: string };

export type UsersData = {
  ok: boolean;
  roles: RoleOption[];
  permission_keys: string[];
  users: ManagedUser[];
};

export type DailyRevenue = {
  date: string;
  revenue: number;
  sales: number;
};

export type DashboardSummary = {
  revenue_today: number;
  revenue_yesterday: number;
  revenue_month: number;
  revenue_year: number;
  sales_today: number;
  sales_yesterday: number;
  ticket_average: number;
  gross_result_estimated: number;
  cash_status: string;
  cash_session: string | null;
  cash_expected: number;
  stock_alerts: number;
  receivables_next_30d: number;
  payables_next_30d: number;
  revenue_last_7d: DailyRevenue[];
  last_sync_at: string | null;
};

export type SalesData = {
  summary: { total: number; valid_sales: number; excluded_sales: number; ticket: number; payment_totals: Record<string, number> };
  rows: Array<{ id?: string; number?: number; date?: string; time?: string; summary: string; items: number; payment: string; total: number; discount: number; status: string; customer: string; operator: string; cash_session: string }>;
  last_sync_at: string | null;
};

export type PurchaseSuggestion = {
  code: string;
  name: string;
  unit: string;
  stock: number;
  minimum: number;
  max_stock: number;
  suggested_qty: number;
  below_minimum: boolean;
};

export type StockData = {
  summary: { products: number; alerts: number; negative: number; sale_value: number; cost_value: number };
  rows: Array<{ id?: number|string; code: string; name: string; category: string; unit: string; sale_mode: string; stock: number; minimum: number; max_stock?: number | null; price: number; cost: number; status: string }>;
  purchase_suggestions?: PurchaseSuggestion[];
  last_sync_at: string | null;
};

export type ProductCategoryData = {
  summary: { categories: number; active: number; inactive: number };
  rows: Array<{ id: number; name: string; active: boolean; product_count: number }>;
};

export type FinanceData = {
  summary: { opening_balance: number; open_payables: number; overdue_payables: number; open_receivables: number; card_forecast: number; card_anticipated: number; realized_payables: number; realized_receivables: number };
  entries: Array<{
    id?: string;
    type: string;
    description: string;
    category: string;
    category_id?: string;
    supplier_id?: string | null;
    customer_id?: string | null;
    amount: number;
    due_date: string;
    competence_date?: string;
    status: string;
    settlement_date: string;
    settlement_date_inferred?: boolean;
    payment_method: string;
    planned_payment_method?: string;
    notes?: string;
  }>;
  card_receivables: Array<{ key: string; sale_number?: number; method: string; installment: number; installments: number; date: string; original_date: string; gross: number; fee: number; net: number; status: string }>;
  cash_flow?: Array<{
    date: string;
    realized_in: number;
    forecast_in: number;
    realized_out: number;
    forecast_out: number;
    balance: number;
  }>;
  last_sync_at: string | null;
};

export type CashMovementRow = {
  id?: string | number;
  date: string;
  time: string;
  type: string;
  amount: number;
  reason: string;
  operator: string;
};

export type CashData = {
  status: string;
  current: null | { status: string; code: string; date: string; opened_at: string; operator: string; opening_float: number; opening_difference?: number; opening_divergence_reason?: string; sales: number; total_sales: number; payment_totals: Record<string, number>; supplies: number; withdrawals: number; expected_cash: number; movements?: CashMovementRow[] };
  closings: Array<{ id?: string; code: string; date: string; opened_at: string; closed_at: string; operator: string; opening_float?: number; opening_difference?: number; opening_divergence_reason?: string; sales: number; total_sales: number; expected_total: number; counted_total: number; difference: number; observation?: string; movements?: CashMovementRow[] }>;
  last_sync_at: string | null;
};

export type ReportsData = {
  summary: { sales: number; total: number; ticket: number; discounts: number };
  by_day: Array<{ date: string; sales: number; total: number; ticket: number }>;
  by_month: Array<{ month: string; sales: number; total: number; ticket: number }>;
  payment_totals: Record<string, number>;
  top_products: Array<{ name: string; qty: number; revenue: number }>;
  scoped?: boolean;
  last_sync_at: string | null;
};


export type ProductsData = {
  summary: { products: number; categories: number; by_weight: number; scale: number };
  rows: Array<{ id?: number|string; code: string; name: string; category: string; unit: string; sale_mode: string; price: number; cost: number; stock: number; minimum: number; favorite: boolean; scale_enabled: boolean; scale_plu: string; active: boolean; image_url?: string | null; max_stock?: number | null }>;
  last_sync_at: string | null;
};

export type CustomerHistoryRow = {
  id?: number|string;
  number?: number;
  date: string;
  time: string;
  summary: string;
  payment: string;
  total: number;
  status: string;
};

export type CustomerRow = {
  id?: number|string;
  name: string;
  document: string;
  document_type: string;
  phone: string;
  email: string;
  city: string;
  notes: string;
  active: boolean;
  purchases: number;
  total: number;
  ticket_average: number;
  last_purchase_date: string;
  last_sale_number?: number|null;
  history: CustomerHistoryRow[];
};

export type CustomerWrite = {
  name: string;
  document: string;
  phone: string;
  email: string;
  city: string;
  notes: string;
  active: boolean;
};

export type CustomersData = {
  summary: { customers: number; active: number; identified_revenue: number; unidentified_sales: number };
  rows: CustomerRow[];
  last_sync_at: string | null;
};

export type SuppliersData = {
  summary: { suppliers: number; active: number; purchases: number; total_purchased: number; open_payables: number };
  rows: Array<{ id?: number|string; name: string; trade_name: string; document: string; phone: string; email: string; contact: string; city: string; state: string; active: boolean; purchases: number; total: number; open_payables: number; paid: number; last_purchase_date: string }>;
  last_sync_at: string | null;
};

export type PurchasesData = {
  summary: { receipts: number; month_total: number; historic_total: number; active_suppliers: number };
  rows: Array<{ id?: string; date: string; due_date: string; supplier: string; supplier_id?: string; document: string; items: number; total: number; status: string; payable_status: string; payable_amount: number; payment_method: string }>;
  last_sync_at: string | null;
};
