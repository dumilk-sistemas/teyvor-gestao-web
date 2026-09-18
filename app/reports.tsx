import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

import { AdminShell } from '@/components/AdminShell';
import { DateField, Notice } from '@/components/FormKit';
import { theme } from '@/constants/theme';
import { useBranding } from '@/contexts/BrandingContext';
import { getReports } from '@/services/api';
import { getFull } from '@/services/fullApi';
import type { Branding, CustomersData, FinanceData, PurchasesData, ReportsData, StockData } from '@/types/api';

const money = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value || 0));

const dateBR = (value: string) =>
  value
    ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR')
    : '—';

const financeModeLabel = (mode: string) => {
  if (mode === 'payable_open') return 'Contas a pagar';
  if (mode === 'receivable_open') return 'Contas a receber';
  if (mode === 'payable_paid') return 'Contas pagas';
  if (mode === 'receivable_paid') return 'Contas recebidas';
  return 'Financeiro';
};

const statusLabelPt = (status: string) => {
  if (status === 'paid') return 'Pago';
  if (status === 'received') return 'Recebido';
  if (status === 'overdue') return 'Vencido';
  if (status === 'not_generated') return 'Não gerada';
  return 'Em aberto';
};

const isoFromDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDays = (date: Date, amount: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};

const startOfMonth = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), 1);

const startOfYear = (date: Date) =>
  new Date(date.getFullYear(), 0, 1);

const isoToBR = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return value;
  }

  return `${match[3]}/${match[2]}/${match[1]}`;
};

const brToIso = (value: string) => {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (!match) {
    return '';
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  const parsed = new Date(year, month - 1, day);

  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return '';
  }

  return `${match[3]}-${match[2]}-${match[1]}`;
};

const inputToIso = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : brToIso(value);

function csvCell(value: string | number) {
  const str = String(value ?? '');
  return /[",;\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function downloadCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number>>
) {
  if (Platform.OS !== 'web') {
    return;
  }

  const lines = [headers, ...rows].map((row) =>
    row.map(csvCell).join(';')
  );
  const csv = '﻿' + lines.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeHtml(value: string | number) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      }[c] as string)
  );
}

function safePrintColor(value: string | null | undefined, fallback: string) {
  return /^#[0-9a-f]{6}$/i.test(value || '') ? String(value) : fallback;
}

function printRows(
  title: string,
  subtitle: string,
  headers: string[],
  rows: Array<Array<string | number>>,
  branding: Branding
) {
  if (Platform.OS !== 'web') {
    return;
  }

  const primary = safePrintColor(branding.color_primary, '#C49A3A');
  const secondary = safePrintColor(branding.color_secondary, '#1F2933');
  const brandName = escapeHtml(branding.brand_name || 'TEYVOR');
  const generatedAt = new Date().toLocaleString('pt-BR');
  const safeLogoUrl = branding.logo_url && /^https?:\/\//i.test(branding.logo_url)
    ? escapeHtml(branding.logo_url)
    : '';
  const brandLogo = safeLogoUrl
    ? `<img class="brand-logo" src="${safeLogoUrl}" alt="${brandName}">`
    : `<div class="brand-mark" aria-hidden="true"></div>`;

  const head = `<tr>${headers
    .map((h) => `<th scope="col">${escapeHtml(h)}</th>`)
    .join('')}</tr>`;
  const body = rows
    .map(
      (row) =>
        `<tr>${row
          .map((cell) => {
            const text = String(cell ?? '').trim();
            const numeric = /^-?(?:R\$\s*)?[\d.]+(?:,\d+)?(?:\s*(?:un|kg|%))?$/i.test(text);
            return `<td${numeric ? ' class="numeric"' : ''}>${escapeHtml(cell)}</td>`;
          })
          .join('')}</tr>`
    )
    .join('');

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(
    title
  )}</title><style>
    :root{--primary:${primary};--secondary:${secondary};--ink:#17202a;--muted:#66717d;--line:#dfe3e6;--soft:#f5f6f4}
    *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    @page{size:A4 portrait;margin:15mm 11mm 18mm}
    html,body{margin:0;padding:0;background:#fff;color:var(--ink);font-family:Inter,"Segoe UI",Arial,sans-serif}
    body{font-size:10px;line-height:1.4}
    .brand-header{display:flex;align-items:center;justify-content:space-between;border-top:5px solid var(--primary);border-bottom:1px solid var(--line);padding:12px 2px 11px;margin-bottom:22px}
    .brand-lockup{display:flex;align-items:center;gap:10px;min-width:0}
    .brand-logo{display:block;max-width:118px;max-height:38px;object-fit:contain}
    .brand-mark{width:9px;height:34px;border-radius:3px;background:var(--primary);box-shadow:5px 0 0 var(--secondary)}
    .brand-name{font-size:18px;font-weight:800;letter-spacing:.08em;color:#111820;line-height:1}
    .brand-sub{margin-top:4px;color:var(--primary);font-size:8px;font-weight:800;letter-spacing:.22em}
    .document-label{border:1px solid var(--line);border-radius:999px;padding:6px 10px;color:var(--muted);font-size:8px;font-weight:700;letter-spacing:.12em}
    .report-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:14px}
    .report-heading h1{font-size:21px;line-height:1.16;margin:0 0 7px;color:#111820;letter-spacing:-.02em}
    .report-heading p{font-size:10px;color:var(--muted);margin:0}
    .issue-meta{min-width:150px;text-align:right;color:var(--muted);font-size:8px;line-height:1.6}
    .issue-meta strong{display:block;color:#27313a;font-size:9px}
    .summary{display:flex;align-items:center;justify-content:space-between;gap:14px;background:var(--soft);border-left:4px solid var(--primary);border-radius:5px;padding:9px 11px;margin-bottom:14px;color:#39434c}
    .summary strong{color:#151b21}
    .record-count{white-space:nowrap;font-weight:700;color:var(--secondary)}
    table{width:100%;border-collapse:separate;border-spacing:0;font-size:8.5px;table-layout:auto}
    thead{display:table-header-group}
    tr{break-inside:avoid;page-break-inside:avoid}
    th{background:#17202a;color:#fff;font-weight:700;padding:7px 6px;text-align:left;border-right:1px solid rgba(255,255,255,.18);white-space:nowrap}
    th:first-child{border-radius:5px 0 0 0}
    th:last-child{border-radius:0 5px 0 0;border-right:0}
    td{padding:6px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);vertical-align:top;overflow-wrap:anywhere}
    td:first-child{border-left:1px solid var(--line)}
    tbody tr:nth-child(even) td{background:#fafaf8}
    td.numeric{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
    .empty{padding:28px;text-align:center;border:1px solid var(--line);border-radius:6px;color:var(--muted)}
    .footer{display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--line);margin-top:14px;padding-top:7px;color:#7a838c;font-size:7px;break-inside:avoid;page-break-inside:avoid}
    .footer strong{color:var(--primary);letter-spacing:.06em}
    @media print{.brand-header,.summary,th{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
  </style></head><body>
    <header class="brand-header">
      <div class="brand-lockup">${brandLogo}<div><div class="brand-name">${brandName}</div><div class="brand-sub">GESTÃO 360</div></div></div>
      <div class="document-label">RELATÓRIO GERENCIAL</div>
    </header>
    <section class="report-heading">
      <div><h1>${escapeHtml(title)}</h1><p>Informações consolidadas para acompanhamento e tomada de decisão.</p></div>
      <div class="issue-meta"><strong>Emitido em</strong>${escapeHtml(generatedAt)}</div>
    </section>
    <section class="summary"><span><strong>Período / referência:</strong> ${escapeHtml(subtitle)}</span><span class="record-count">${rows.length} ${rows.length === 1 ? 'registro' : 'registros'}</span></section>
    ${rows.length > 0 ? `<table><thead>${head}</thead><tbody>${body}</tbody></table>` : '<div class="empty">Nenhuma informação encontrada para o período selecionado.</div>'}
    <footer class="footer"><span><strong>${brandName} GESTÃO 360</strong> · Documento gerado pelo sistema</span><span>${escapeHtml(title)}</span></footer>
  </body></html>`;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const frameWindow = iframe.contentWindow;
  if (!frameWindow) {
    document.body.removeChild(iframe);
    return;
  }

  frameWindow.document.open();
  frameWindow.document.write(html);
  frameWindow.document.close();

  const readyToPrint = async () => {
    const images = Array.from(frameWindow.document.images);
    await Promise.all(
      images.map(
        (image) =>
          image.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                image.onload = () => resolve();
                image.onerror = () => resolve();
              })
      )
    );
    await frameWindow.document.fonts?.ready;
    frameWindow.focus();
    frameWindow.print();
    setTimeout(() => document.body.removeChild(iframe), 1000);
  };

  setTimeout(() => void readyToPrint(), 300);
}

type PeriodKey =
  | 'today'
  | '7days'
  | '30days'
  | 'month'
  | 'year'
  | 'custom';

type DetailMode = 'sales' | 'cash' | 'products' | 'payments' | 'customers' | 'finance' | 'purchases' | 'stock' | null;

type ReportCategory = 'all' | 'sales' | 'finance' | 'operation';

function reportRowKey(mode: DetailMode, row: any, index: number) {
  if (mode === 'sales') return `sales:${row.date || index}`;
  if (mode === 'cash') return `cash:${row.id || row.code || row.date || index}`;
  if (mode === 'products') return `products:${row.id || row.name || 'item'}:${index}`;
  if (mode === 'payments') return `payments:${row.method || index}`;
  if (mode === 'customers') return `customers:${row.id || row.name || 'cliente'}:${index}`;
  if (mode === 'purchases') return `purchases:${row.id || row.document || row.date || index}`;
  if (mode === 'stock') return `stock:${row.code || row.id || row.name || index}`;
  return `${mode || 'report'}:${index}`;
}

type AbcTier = 'A' | 'B' | 'C';

type CashClosing = {
  id?: string;
  code?: string;
  date?: string;
  opened_at?: string;
  opened_time?: string;
  closed_at?: string;
  closed_time?: string;
  operator?: string;
  opening_float?: number;
  supplies?: number;
  withdrawals?: number;
  sales?: number;
  total_sales?: number;
  expected?: Record<string, number>;
  counted?: Record<string, number>;
  differences?: Record<string, number>;
  expected_total?: number;
  counted_total?: number;
  difference?: number;
  observation?: string;
  movements?: Array<{
    id?: string;
    date?: string;
    time?: string;
    type?: string;
    amount?: number;
    reason?: string;
    operator?: string;
  }>;
};

type CashData = {
  status?: string;
  current?: any;
  closings?: CashClosing[];
  last_sync_at?: string;
};

const METHODS = ['Dinheiro', 'Pix', 'Débito', 'Crédito', 'Outros'];

export default function Reports() {
  const { branding } = useBranding();
  const [data, setData] = useState<ReportsData | null>(null);
  const [cash, setCash] = useState<CashData | null>(null);
  const [customers, setCustomers] = useState<CustomersData | null>(null);
  const [finance, setFinance] = useState<FinanceData | null>(null);
  const [stock, setStock] = useState<StockData | null>(null);
  const [purchases, setPurchases] = useState<PurchasesData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [financeReportMode, setFinanceReportMode] = useState<
    'category' | 'payable_open' | 'receivable_open' | 'payable_paid' | 'receivable_paid'
  >('category');
  const [reportCategory, setReportCategory] = useState<ReportCategory>('all');
  const [reportSearch, setReportSearch] = useState('');
  const [financeSelected, setFinanceSelected] = useState<Record<string, boolean>>({});
  const [reportSelected, setReportSelected] = useState<Record<string, boolean>>({});

  const today = isoFromDate(new Date());

  const printReport = (
    title: string,
    subtitle: string,
    headers: string[],
    rows: Array<Array<string | number>>
  ) => printRows(title, subtitle, headers, rows, branding);

  const [period, setPeriod] = useState<PeriodKey>('30days');
  const [appliedStart, setAppliedStart] = useState(
    isoFromDate(addDays(new Date(), -29))
  );
  const [appliedEnd, setAppliedEnd] = useState(today);

  const [startInput, setStartInput] = useState(
    isoToBR(isoFromDate(addDays(new Date(), -29)))
  );
  const [endInput, setEndInput] = useState(isoToBR(today));
  const [periodError, setPeriodError] = useState('');
  const [appliedNotice, setAppliedNotice] = useState('');

  const [detailMode, setDetailMode] = useState<DetailMode>(null);
  const [selectedClosing, setSelectedClosing] =
    useState<CashClosing | null>(null);

  async function load() {
    try {
      setLoading(true);
      setError('');

      // Carrega as fontes em paralelo. Em hospedagens que hibernam, fazer
      // essas chamadas em sequência deixava a central aparentemente vazia.
      const [
        reportsResult,
        cashResult,
        customersResult,
        financeResult,
        stockResult,
        purchasesResult,
      ] = await Promise.all([
        getReports(appliedStart, appliedEnd),
        getFull<CashData>('cash').catch(() => null),
        getFull<CustomersData>('customers').catch(() => null),
        getFull<FinanceData>('finance').catch(() => null),
        getFull<StockData>('stock').catch(() => null),
        getFull<PurchasesData>('purchases').catch(() => null),
      ]);

      setData(reportsResult);
      setCash(cashResult);
      setCustomers(customersResult);
      setFinance(financeResult);
      setStock(stockResult);
      setPurchases(purchasesResult);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Falha ao carregar relatórios.'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [appliedStart, appliedEnd]);

  function setRange(
    key: PeriodKey,
    start: string,
    end: string
  ) {
    setPeriod(key);
    setAppliedStart(start);
    setAppliedEnd(end);
    setStartInput(isoToBR(start));
    setEndInput(isoToBR(end));
    setPeriodError('');
    setAppliedNotice(`Período aplicado: ${isoToBR(start)} a ${isoToBR(end)}`);
  }

  function applyQuickPeriod(key: PeriodKey) {
    const now = new Date();
    const end = isoFromDate(now);

    if (key === 'today') {
      setRange(key, end, end);
      return;
    }

    if (key === '7days') {
      setRange(
        key,
        isoFromDate(addDays(now, -6)),
        end
      );
      return;
    }

    if (key === '30days') {
      setRange(
        key,
        isoFromDate(addDays(now, -29)),
        end
      );
      return;
    }

    if (key === 'month') {
      setRange(
        key,
        isoFromDate(startOfMonth(now)),
        end
      );
      return;
    }

    if (key === 'year') {
      setRange(
        key,
        isoFromDate(startOfYear(now)),
        end
      );
      return;
    }

    setPeriod('custom');
    setPeriodError('');
    setAppliedNotice('');
  }

  function applyCustomPeriod() {
    const start = inputToIso(startInput.trim());
    const end = inputToIso(endInput.trim());

    if (!start || !end) {
      setPeriodError(
        'Informe as datas no formato DD/MM/AAAA.'
      );
      return;
    }

    if (start > end) {
      setPeriodError(
        'A data inicial não pode ser posterior à data final.'
      );
      return;
    }

    setAppliedStart(start);
    setAppliedEnd(end);
    setPeriod('custom');
    setPeriodError('');
    setAppliedNotice(
      `Relatório atualizado: ${isoToBR(start)} a ${isoToBR(end)}`
    );
  }

  const periodDays = useMemo(() => {
    if (!data) {
      return [];
    }

    return (data.by_day || []).filter(
      (row) =>
        row.date >= appliedStart &&
        row.date <= appliedEnd
    );
  }, [data, appliedStart, appliedEnd]);

  const salesSummary = useMemo(() => {
    const sales = periodDays.reduce(
      (sum, row) => sum + Number(row.sales || 0),
      0
    );

    const total = periodDays.reduce(
      (sum, row) => sum + Number(row.total || 0),
      0
    );

    return {
      sales,
      total,
      ticket: sales > 0 ? total / sales : 0,
    };
  }, [periodDays]);

  const cashClosings = useMemo(() => {
    return (cash?.closings || []).filter((closing) => {
      const date = String(closing.date || '');

      return (
        date >= appliedStart &&
        date <= appliedEnd
      );
    });
  }, [cash, appliedStart, appliedEnd]);

  const customerRanking = useMemo(() => {
    const rows = customers?.rows || [];

    const ranked = rows
      .map((customer) => {
        const periodHistory = (customer.history || []).filter(
          (h) => h.date >= appliedStart && h.date <= appliedEnd
        );
        const total = periodHistory.reduce(
          (sum, h) => sum + Number(h.total || 0),
          0
        );
        const purchases = periodHistory.length;

        return {
          name: customer.name,
          total,
          purchases,
          ticket: purchases > 0 ? total / purchases : 0,
        };
      })
      .filter((c) => c.purchases > 0);

    ranked.sort((a, b) => b.total - a.total);

    // Curva ABC: classifica pelo acumulado do valor comprado sobre o
    // total de TODOS os clientes com compra no período (nao so os 15
    // exibidos), igual a convencao classica (A ate 80%, B ate 95%, C o resto).
    const grandTotal = ranked.reduce((sum, c) => sum + c.total, 0);
    let cumulative = 0;

    const withAbc = ranked.map((c) => {
      const percent = grandTotal > 0 ? (c.total / grandTotal) * 100 : 0;
      cumulative += percent;
      const tier: AbcTier = cumulative <= 80 ? 'A' : cumulative <= 95 ? 'B' : 'C';
      return { ...c, percent, cumulativePercent: cumulative, tier };
    });

    return withAbc.slice(0, 15);
  }, [customers, appliedStart, appliedEnd]);

  const productsAbc = useMemo(() => {
    const rows = data?.top_products || [];
    const total = rows.reduce((sum, p) => sum + Number(p.revenue || 0), 0);
    let cumulative = 0;

    return rows.map((p) => {
      const percent = total > 0 ? (Number(p.revenue || 0) / total) * 100 : 0;
      cumulative += percent;
      const tier: AbcTier = cumulative <= 80 ? 'A' : cumulative <= 95 ? 'B' : 'C';
      return { ...p, percent, cumulativePercent: cumulative, tier };
    });
  }, [data]);

  const financeByCategory = useMemo(() => {
    const entries = (finance?.entries || []).filter(
      (e) => e.due_date >= appliedStart && e.due_date <= appliedEnd
    );

    const build = (type: string) => {
      const filtered = entries.filter((e) => e.type === type);
      const map: Record<
        string,
        { category: string; count: number; total: number; realized: number; pending: number }
      > = {};

      filtered.forEach((e) => {
        const key = e.category || 'Sem categoria';
        if (!map[key]) {
          map[key] = { category: key, count: 0, total: 0, realized: 0, pending: 0 };
        }
        map[key].count += 1;
        map[key].total += Number(e.amount || 0);
        if (e.status === 'paid') {
          map[key].realized += Number(e.amount || 0);
        } else {
          map[key].pending += Number(e.amount || 0);
        }
      });

      return Object.values(map).sort((a, b) => b.total - a.total);
    };

    return { payables: build('payable'), receivables: build('receivable') };
  }, [finance, appliedStart, appliedEnd]);

  // Visao "lancamento por lancamento" (nao agrupada por categoria) das
  // contas a pagar/receber/pagas/recebidas -- complementa financeByCategory
  // pra quem quer ver cada conta individualmente, nao so o total por categoria.
  const financeFlatRows = useMemo(() => {
    const entries = finance?.entries || [];
    if (financeReportMode === 'payable_open')
      return entries.filter(
        (e) =>
          e.type === 'payable' &&
          ['open', 'overdue'].includes(e.status) &&
          e.due_date >= appliedStart &&
          e.due_date <= appliedEnd
      );
    if (financeReportMode === 'receivable_open')
      return entries.filter(
        (e) =>
          e.type === 'receivable' &&
          ['open', 'overdue'].includes(e.status) &&
          e.due_date >= appliedStart &&
          e.due_date <= appliedEnd
      );
    if (financeReportMode === 'payable_paid')
      return entries.filter(
        (e) =>
          e.type === 'payable' &&
          e.status === 'paid' &&
          e.settlement_date >= appliedStart &&
          e.settlement_date <= appliedEnd
      );
    if (financeReportMode === 'receivable_paid')
      return entries.filter(
        (e) =>
          e.type === 'receivable' &&
          e.status === 'received' &&
          e.settlement_date >= appliedStart &&
          e.settlement_date <= appliedEnd
      );
    return [];
  }, [finance, financeReportMode, appliedStart, appliedEnd]);

  const financeCategoryRows = useMemo(() => [
    ...financeByCategory.payables.map((row) => ({ ...row, reportType: 'Despesa', selectionKey: `expense:${row.category}` })),
    ...financeByCategory.receivables.map((row) => ({ ...row, reportType: 'Receita', selectionKey: `revenue:${row.category}` })),
  ], [financeByCategory]);

  const financeSelectionKeys = useMemo(
    () => financeReportMode === 'category'
      ? financeCategoryRows.map((row) => row.selectionKey)
      : financeFlatRows.map((row) => String(row.id)),
    [financeCategoryRows, financeFlatRows, financeReportMode]
  );

  useEffect(() => {
    if (detailMode !== 'finance') return;
    setFinanceSelected(Object.fromEntries(financeSelectionKeys.map((key) => [key, true])));
  }, [detailMode, financeReportMode, financeSelectionKeys.join('|')]);

  const selectedFinanceCategoryRows = financeCategoryRows.filter((row) => financeSelected[row.selectionKey]);
  const selectedFinanceFlatRows = financeFlatRows.filter((row) => financeSelected[String(row.id)]);

  function toggleFinanceSelection(key: string) {
    setFinanceSelected((current) => ({ ...current, [key]: !current[key] }));
  }

  function selectAllFinance(selected: boolean) {
    setFinanceSelected(Object.fromEntries(financeSelectionKeys.map((key) => [key, selected])));
  }

  const stockAlerts = useMemo(() => {
    const rows = (stock?.rows || []).filter((r) => r.status !== 'OK');

    return rows.sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === 'Negativo' ? -1 : 1;
      }
      return a.stock - b.stock;
    });
  }, [stock]);

  const purchaseRows = useMemo(
    () =>
      (purchases?.rows || []).filter(
        (row) => row.date >= appliedStart && row.date <= appliedEnd
      ),
    [purchases, appliedStart, appliedEnd]
  );

  const purchaseSummary = useMemo(() => {
    const total = purchaseRows.reduce(
      (sum, row) => sum + Number(row.total || 0),
      0
    );
    const open = purchaseRows.reduce(
      (sum, row) =>
        ['open', 'overdue'].includes(row.payable_status)
          ? sum + Number(row.payable_amount || row.total || 0)
          : sum,
      0
    );
    return { count: purchaseRows.length, total, open };
  }, [purchaseRows]);

  const financePosition = useMemo(() => {
    const entries = (finance?.entries || []).filter(
      (entry) => entry.due_date >= appliedStart && entry.due_date <= appliedEnd
    );
    const summarize = (type: string) => {
      const rows = entries.filter(
        (entry) =>
          entry.type === type && ['open', 'overdue'].includes(entry.status)
      );
      return {
        count: rows.length,
        total: rows.reduce((sum, entry) => sum + Number(entry.amount || 0), 0),
      };
    };
    return {
      payables: summarize('payable'),
      receivables: summarize('receivable'),
    };
  }, [finance, appliedStart, appliedEnd]);

  const cashSummary = useMemo(() => {
    return cashClosings.reduce(
      (acc, closing) => {
        acc.closings += 1;
        acc.sales += Number(closing.sales || 0);
        acc.totalSales += Number(
          closing.total_sales || 0
        );
        acc.supplies += Number(
          closing.supplies || 0
        );
        acc.withdrawals += Number(
          closing.withdrawals || 0
        );
        acc.expected += Number(
          closing.expected_total || 0
        );
        acc.counted += Number(
          closing.counted_total || 0
        );
        acc.difference += Number(
          closing.difference || 0
        );

        return acc;
      },
      {
        closings: 0,
        sales: 0,
        totalSales: 0,
        supplies: 0,
        withdrawals: 0,
        expected: 0,
        counted: 0,
        difference: 0,
      }
    );
  }, [cashClosings]);

  const paymentBreakdown = useMemo(() => {
    const totals = data?.payment_totals || {};
    const sum = Object.values(totals).reduce(
      (acc, value) => acc + Number(value || 0),
      0
    );

    return Object.entries(totals)
      .map(([method, value]) => ({
        method,
        value: Number(value || 0),
        percent: sum > 0 ? (Number(value || 0) / sum) * 100 : 0,
      }))
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [data]);

  const selectableRows = useMemo<any[]>(() => {
    if (detailMode === 'sales') return periodDays;
    if (detailMode === 'cash') return cashClosings;
    if (detailMode === 'products') return productsAbc;
    if (detailMode === 'payments') return paymentBreakdown;
    if (detailMode === 'customers') return customerRanking;
    if (detailMode === 'purchases') return purchaseRows;
    if (detailMode === 'stock') return stockAlerts;
    return [];
  }, [detailMode, periodDays, cashClosings, productsAbc, paymentBreakdown, customerRanking, purchaseRows, stockAlerts]);

  const selectableKeys = useMemo(
    () => selectableRows.map((row, index) => reportRowKey(detailMode, row, index)),
    [detailMode, selectableRows]
  );

  useEffect(() => {
    if (!detailMode || detailMode === 'finance') return;
    setReportSelected(Object.fromEntries(selectableKeys.map((key) => [key, true])));
  }, [detailMode, selectableKeys.join('|')]);

  const selectedReportRows = selectableRows.filter((row, index) =>
    reportSelected[reportRowKey(detailMode, row, index)]
  );

  function toggleReportSelection(row: any, index: number) {
    const key = reportRowKey(detailMode, row, index);
    setReportSelected((current) => ({ ...current, [key]: !current[key] }));
  }

  function selectAllReportRows(selected: boolean) {
    setReportSelected(Object.fromEntries(selectableKeys.map((key) => [key, selected])));
  }

  const periodLabel =
    appliedStart === appliedEnd
      ? dateBR(appliedStart)
      : `${dateBR(appliedStart)} a ${dateBR(
          appliedEnd
        )}`;

  const syncText =
    data?.last_sync_at
      ? `Atualizado em ${new Date(
          data.last_sync_at
        ).toLocaleString('pt-BR')}`
      : 'Aguardando sincronização';

  const reportCatalog = [
    {
      id: 'sales-performance',
      category: 'sales' as const,
      group: 'Vendas e clientes',
      icon: 'bar-chart-2' as const,
      color: '#3568B8',
      background: '#EEF4FC',
      title: 'Desempenho de vendas',
      description: 'Faturamento, quantidade de vendas, ticket médio e evolução diária.',
      value: money(salesSummary.total),
      subtitle: `${salesSummary.sales} venda(s) • ticket ${money(salesSummary.ticket)}`,
      onPress: () => setDetailMode('sales' as const),
    },
    {
      id: 'products',
      category: 'sales' as const,
      group: 'Vendas e clientes',
      icon: 'award' as const,
      color: '#6A70A8',
      background: '#F0F1FA',
      title: 'Produtos vendidos e Curva ABC',
      description: 'Ranking por quantidade, receita e relevância comercial dos produtos.',
      value: data?.top_products?.[0]?.name || 'Sem vendas no período',
      subtitle: data?.top_products?.[0]
        ? `${money(data.top_products[0].revenue)} em receita`
        : periodLabel,
      onPress: () => setDetailMode('products' as const),
    },
    {
      id: 'payments',
      category: 'sales' as const,
      group: 'Vendas e clientes',
      icon: 'credit-card' as const,
      color: '#3568B8',
      background: '#EEF4FC',
      title: 'Formas de pagamento',
      description: 'Participação de dinheiro, Pix, débito, crédito e outros meios.',
      value: paymentBreakdown[0]?.method || 'Sem vendas no período',
      subtitle: paymentBreakdown[0]
        ? `${paymentBreakdown[0].percent.toFixed(1)}% do faturamento`
        : periodLabel,
      onPress: () => setDetailMode('payments' as const),
    },
    {
      id: 'customers',
      category: 'sales' as const,
      group: 'Vendas e clientes',
      icon: 'users' as const,
      color: '#25835A',
      background: '#EAF7F0',
      title: 'Ranking de clientes',
      description: 'Clientes com maior volume de compras e participação no período.',
      value: customerRanking[0]?.name || 'Sem dados no período',
      subtitle: customerRanking[0]
        ? `${money(customerRanking[0].total)} em compras`
        : periodLabel,
      onPress: () => setDetailMode('customers' as const),
    },
    {
      id: 'payables',
      category: 'finance' as const,
      group: 'Financeiro',
      icon: 'arrow-up-right' as const,
      color: '#C84E4E',
      background: '#FFF3F3',
      title: 'Contas a pagar',
      description: 'Lançamentos em aberto e vencidos dentro do período selecionado.',
      value: money(financePosition.payables.total),
      subtitle: `${financePosition.payables.count} lançamento(s) pendente(s)`,
      onPress: () => {
        setFinanceReportMode('payable_open');
        setDetailMode('finance');
      },
    },
    {
      id: 'receivables',
      category: 'finance' as const,
      group: 'Financeiro',
      icon: 'arrow-down-left' as const,
      color: '#25835A',
      background: '#EAF7F0',
      title: 'Contas a receber',
      description: 'Recebimentos em aberto e vencidos no intervalo analisado.',
      value: money(financePosition.receivables.total),
      subtitle: `${financePosition.receivables.count} lançamento(s) pendente(s)`,
      onPress: () => {
        setFinanceReportMode('receivable_open');
        setDetailMode('finance');
      },
    },
    {
      id: 'finance-categories',
      category: 'finance' as const,
      group: 'Financeiro',
      icon: 'pie-chart' as const,
      color: '#B8862F',
      background: '#FBF3E0',
      title: 'Financeiro por categoria',
      description: 'Composição de receitas e despesas agrupadas por categoria.',
      value: `${financeByCategory.payables.length + financeByCategory.receivables.length} categoria(s)`,
      subtitle: periodLabel,
      onPress: () => {
        setFinanceReportMode('category');
        setDetailMode('finance');
      },
    },
    {
      id: 'cash',
      category: 'operation' as const,
      group: 'Operação e estoque',
      icon: 'briefcase' as const,
      color: '#66717D',
      background: '#F2F4F5',
      title: 'Movimentação de caixa',
      description: 'Aberturas, fechamentos, suprimentos, retiradas e diferenças.',
      value: `${cashSummary.closings} fechamento(s)`,
      subtitle: cash?.current
        ? `Caixa aberto • ${cash.current.code || ''}`
        : `Diferença ${money(cashSummary.difference)}`,
      onPress: () => setDetailMode('cash' as const),
    },
    {
      id: 'purchases',
      category: 'operation' as const,
      group: 'Operação e estoque',
      icon: 'shopping-cart' as const,
      color: '#B8862F',
      background: '#FBF3E0',
      title: 'Compras e recebimentos',
      description: 'Compras recebidas, valores movimentados e situação financeira.',
      value: money(purchaseSummary.total),
      subtitle: `${purchaseSummary.count} compra(s) • ${money(purchaseSummary.open)} a pagar`,
      onPress: () => setDetailMode('purchases' as const),
    },
    {
      id: 'stock',
      category: 'operation' as const,
      group: 'Operação e estoque',
      icon: 'archive' as const,
      color: '#C84E4E',
      background: '#FFF3F3',
      title: 'Posição e alertas de estoque',
      description: 'Saldos atuais, produtos abaixo do mínimo e estoques negativos.',
      value: `${stockAlerts.length} produto(s) em atenção`,
      subtitle: 'Posição atual do estoque',
      onPress: () => setDetailMode('stock' as const),
    },
  ];

  const normalizedReportSearch = reportSearch.trim().toLocaleLowerCase('pt-BR');
  const visibleReports = reportCatalog.filter((report) => {
    const matchesCategory = reportCategory === 'all' || report.category === reportCategory;
    const matchesSearch = !normalizedReportSearch ||
      [report.title, report.description, report.group]
        .join(' ')
        .toLocaleLowerCase('pt-BR')
        .includes(normalizedReportSearch);
    return matchesCategory && matchesSearch;
  });

  const reportGroups = ['Vendas e clientes', 'Financeiro', 'Operação e estoque']
    .map((group) => ({
      group,
      reports: visibleReports.filter((report) => report.group === group),
    }))
    .filter((section) => section.reports.length > 0);

  return (
    <AdminShell
      title="Relatórios"
      subtitle="Consulte os resultados por período"
      syncText={syncText}
      refreshing={loading}
      onRefresh={load}
      headerActions={null}
    >
      {!!error && (
        <Text style={styles.error}>
          {error}
        </Text>
      )}

      <View style={styles.periodCard}>
        <View style={styles.periodTopRow}>
          <View style={styles.periodHeading}>
            <View style={styles.periodIcon}>
              <Feather name="calendar" size={17} color="#B8862F" />
            </View>
            <View>
              <Text style={styles.periodEyebrow}>PERÍODO DA ANÁLISE</Text>
              <Text style={styles.periodTitle}>{periodLabel}</Text>
            </View>
          </View>

          <View style={styles.periodButtons}>
            <PeriodButton
              label="Hoje"
              active={period === 'today'}
              onPress={() => applyQuickPeriod('today')}
            />
            <PeriodButton
              label="7 dias"
              active={period === '7days'}
              onPress={() => applyQuickPeriod('7days')}
            />
            <PeriodButton
              label="30 dias"
              active={period === '30days'}
              onPress={() => applyQuickPeriod('30days')}
            />
            <PeriodButton
              label="Mês"
              active={period === 'month'}
              onPress={() => applyQuickPeriod('month')}
            />
            <PeriodButton
              label="Ano"
              active={period === 'year'}
              onPress={() => applyQuickPeriod('year')}
            />
            <PeriodButton
              label="Personalizado"
              active={period === 'custom'}
              onPress={() => applyQuickPeriod('custom')}
            />
          </View>
        </View>

        {period === 'custom' && (
          <View style={styles.customArea}>
            <View style={styles.dateFields}>
              <View style={styles.dateField}>
                <DateField label="Data inicial" value={startInput} onChangeText={(value) => {
                  setStartInput(value);
                  setPeriodError('');
                  setAppliedNotice('');
                }} />
              </View>

              <View style={styles.dateField}>
                <DateField label="Data final" value={endInput} onChangeText={(value) => {
                  setEndInput(value);
                  setPeriodError('');
                  setAppliedNotice('');
                }} />
              </View>
            </View>

            {!!periodError && (
              <Text
                style={styles.periodError}
              >
                {periodError}
              </Text>
            )}

            <Pressable
              style={styles.applyButton}
              onPress={applyCustomPeriod}
            >
              <Text
                style={styles.applyButtonText}
              >
                Ver relatório
              </Text>
            </Pressable>

            {!!appliedNotice && (
              <Text style={styles.appliedNotice}>
                {appliedNotice}
              </Text>
            )}
          </View>
        )}

        {period !== 'custom' && !!appliedNotice && (
          <Text style={styles.appliedNotice}>
            {appliedNotice}
          </Text>
        )}

      </View>

      {!!data && (
        <>
          <View style={styles.executiveSection}>
            <View>
              <Text style={styles.catalogEyebrow}>RESUMO EXECUTIVO</Text>
              <Text style={styles.executiveTitle}>Indicadores do período</Text>
            </View>
            <View style={styles.executiveGrid}>
              <ExecutiveMetric
                label="FATURAMENTO"
                value={money(salesSummary.total)}
                note={`${salesSummary.sales} venda(s)`}
                icon="dollar-sign"
                color="#25835A"
                background="#EAF7F0"
              />
              <ExecutiveMetric
                label="VENDAS"
                value={String(salesSummary.sales)}
                note="concluídas no período"
                icon="shopping-bag"
                color="#3568B8"
                background="#EEF4FC"
              />
              <ExecutiveMetric
                label="TICKET MÉDIO"
                value={money(salesSummary.ticket)}
                note="média por venda"
                icon="trending-up"
                color="#B8862F"
                background="#FBF3E0"
              />
              <ExecutiveMetric
                label="DESCONTOS"
                value={money(data.summary?.discounts || 0)}
                note="concedidos no período"
                icon="percent"
                color="#C84E4E"
                background="#FFF3F3"
              />
            </View>
          </View>

          <View style={styles.catalogPanel}>
            <View style={styles.catalogHeader}>
              <View style={styles.catalogIntro}>
                <Text style={styles.catalogEyebrow}>CENTRAL DE RELATÓRIOS</Text>
                <Text style={styles.catalogTitle}>Escolha a análise que deseja emitir</Text>
                <Text style={styles.catalogSubtitle}>
                  Consulte, imprima, salve em PDF ou exporte para Excel sem sair da análise.
                </Text>
              </View>
              <View style={styles.catalogCount}>
                <Feather name="file-text" size={15} color={theme.colors.muted} />
                <Text style={styles.catalogCountText}>{visibleReports.length} relatório(s)</Text>
              </View>
            </View>

            <View style={styles.catalogTools}>
              <View style={styles.searchBox}>
                <Feather name="search" size={16} color={theme.colors.muted} />
                <TextInput
                  value={reportSearch}
                  onChangeText={setReportSearch}
                  placeholder="Buscar relatório por nome ou assunto"
                  placeholderTextColor="#8A8A8A"
                  style={styles.searchInput}
                />
              </View>
              <View style={styles.catalogFilters}>
                <CatalogFilter label="Todos" active={reportCategory === 'all'} onPress={() => setReportCategory('all')} />
                <CatalogFilter label="Vendas" active={reportCategory === 'sales'} onPress={() => setReportCategory('sales')} />
                <CatalogFilter label="Financeiro" active={reportCategory === 'finance'} onPress={() => setReportCategory('finance')} />
                <CatalogFilter label="Operação" active={reportCategory === 'operation'} onPress={() => setReportCategory('operation')} />
              </View>
            </View>
          </View>

          {reportGroups.map((section) => (
            <View key={section.group} style={styles.reportSection}>
              <View style={styles.reportSectionHead}>
                <Text style={styles.reportSectionTitle}>{section.group}</Text>
                <Text style={styles.reportSectionCount}>{section.reports.length}</Text>
              </View>
              <View style={styles.reportCards}>
                {section.reports.map((report) => (
                  <ReportCard key={report.id} {...report} />
                ))}
              </View>
            </View>
          ))}

          {visibleReports.length === 0 && (
            <View style={styles.catalogEmpty}>
              <Feather name="search" size={22} color={theme.colors.muted} />
              <Text style={styles.catalogEmptyTitle}>Nenhum relatório encontrado</Text>
              <Text style={styles.catalogEmptyText}>Tente outro termo ou selecione uma área diferente.</Text>
            </View>
          )}
        </>
      )}

      <Modal
        visible={detailMode === 'sales'}
        transparent
        animationType="fade"
        onRequestClose={() =>
          setDetailMode(null)
        }
      >
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <ModalHeader
              title="Resumo de vendas"
              subtitle={periodLabel}
              onClose={() =>
                setDetailMode(null)
              }
              onPrint={() =>
                printReport(
                  'Relatório de vendas',
                  periodLabel,
                  ['Data', 'Vendas', 'Faturamento'],
                  selectedReportRows.map((r) => [
                    dateBR(r.date),
                    r.sales,
                    money(r.total),
                  ])
                )
              }
              onExcel={() =>
                downloadCsv(
                  `relatorio_vendas_${appliedStart}_${appliedEnd}.csv`,
                  ['Data', 'Vendas', 'Faturamento'],
                  selectedReportRows.map((r) => [
                    dateBR(r.date),
                    r.sales,
                    r.total,
                  ])
                )
              }
            />

            <ReportSelectionBar selected={selectedReportRows.length} total={selectableKeys.length} onSelectAll={() => selectAllReportRows(true)} onClear={() => selectAllReportRows(false)} />

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={
                styles.modalBody
              }
            >
              <SummaryRow
                label="Faturamento"
                value={money(
                  salesSummary.total
                )}
              />

              <SummaryRow
                label="Quantidade de vendas"
                value={String(
                  salesSummary.sales
                )}
              />

              <SummaryRow
                label="Ticket médio"
                value={money(
                  salesSummary.ticket
                )}
              />

              <View style={styles.detailSection}>
                <Text
                  style={
                    styles.detailSectionTitle
                  }
                >
                  Faturamento por dia
                </Text>

                {periodDays.length > 0 ? (
                  periodDays.map(
                    (row, index) => (
                      <View
                        key={
                          row.date ||
                          String(index)
                        }
                        style={
                          styles.dayRow
                        }
                      >
                        <ReportCheckbox selected={!!reportSelected[reportRowKey('sales', row, index)]} onPress={() => toggleReportSelection(row, index)} />
                        <View
                          style={
                            styles.dayMain
                          }
                        >
                          <Text
                            style={
                              styles.dayTitle
                            }
                          >
                            {dateBR(
                              row.date
                            )}
                          </Text>

                          <Text
                            style={
                              styles.dayMeta
                            }
                          >
                            {row.sales}{' '}
                            venda(s)
                          </Text>
                        </View>

                        <Text
                          style={
                            styles.dayAmount
                          }
                        >
                          {money(
                            row.total
                          )}
                        </Text>
                      </View>
                    )
                  )
                ) : (
                  <Text
                    style={
                      styles.emptyText
                    }
                  >
                    Não há vendas no
                    período.
                  </Text>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={detailMode === 'cash'}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setDetailMode(null);
          setSelectedClosing(null);
        }}
      >
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <ModalHeader
              title={
                selectedClosing
                  ? 'Detalhes do fechamento'
                  : 'Relatório de caixa'
              }
              subtitle={
                selectedClosing?.code ||
                periodLabel
              }
              onClose={() => {
                if (selectedClosing) {
                  setSelectedClosing(
                    null
                  );
                } else {
                  setDetailMode(null);
                }
              }}
              onPrint={
                selectedClosing
                  ? undefined
                  : () =>
                      printReport(
                        'Relatório de caixa',
                        periodLabel,
                        [
                          'Caixa',
                          'Data',
                          'Vendas',
                          'Total vendido',
                          'Esperado',
                          'Contado',
                          'Diferença',
                        ],
                        selectedReportRows.map((c) => [
                          c.code || '',
                          dateBR(c.date || ''),
                          c.sales || 0,
                          money(c.total_sales || 0),
                          money(c.expected_total || 0),
                          money(c.counted_total || 0),
                          money(c.difference || 0),
                        ])
                      )
              }
              onExcel={
                selectedClosing
                  ? undefined
                  : () =>
                      downloadCsv(
                        `relatorio_caixa_${appliedStart}_${appliedEnd}.csv`,
                        [
                          'Caixa',
                          'Data',
                          'Vendas',
                          'Total vendido',
                          'Esperado',
                          'Contado',
                          'Diferença',
                        ],
                        selectedReportRows.map((c) => [
                          c.code || '',
                          dateBR(c.date || ''),
                          c.sales || 0,
                          c.total_sales || 0,
                          c.expected_total || 0,
                          c.counted_total || 0,
                          c.difference || 0,
                        ])
                      )
              }
            />

            {!selectedClosing && <ReportSelectionBar selected={selectedReportRows.length} total={selectableKeys.length} onSelectAll={() => selectAllReportRows(true)} onClear={() => selectAllReportRows(false)} />}

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={
                styles.modalBody
              }
            >
              {selectedClosing ? (
                <ClosingDetails
                  closing={selectedClosing}
                />
              ) : (
                <>
                  {cash?.current && (
                    <View
                      style={
                        styles.currentCash
                      }
                    >
                      <Text
                        style={
                          styles.currentCashTitle
                        }
                      >
                        Caixa atual aberto
                      </Text>

                      <Text
                        style={
                          styles.currentCashMeta
                        }
                      >
                        {cash.current
                          .code || ''}
                      </Text>

                      <SummaryRow
                        label="Fundo inicial"
                        value={money(
                          cash.current
                            .opening_float
                        )}
                      />

                      <SummaryRow
                        label="Vendas"
                        value={`${cash.current.sales || 0} • ${money(
                          cash.current
                            .total_sales
                        )}`}
                      />

                      <SummaryRow
                        label="Dinheiro esperado"
                        value={money(
                          cash.current
                            .expected_cash
                        )}
                      />
                    </View>
                  )}

                  <SummaryRow
                    label="Fechamentos"
                    value={String(
                      cashSummary.closings
                    )}
                  />

                  <SummaryRow
                    label="Vendas"
                    value={`${cashSummary.sales} • ${money(
                      cashSummary.totalSales
                    )}`}
                  />

                  <SummaryRow
                    label="Suprimentos"
                    value={money(
                      cashSummary.supplies
                    )}
                  />

                  <SummaryRow
                    label="Sangrias"
                    value={money(
                      cashSummary.withdrawals
                    )}
                  />

                  <SummaryRow
                    label="Total esperado"
                    value={money(
                      cashSummary.expected
                    )}
                  />

                  <SummaryRow
                    label="Total contado"
                    value={money(
                      cashSummary.counted
                    )}
                  />

                  <SummaryRow
                    label="Diferença"
                    value={money(
                      cashSummary.difference
                    )}
                    danger={
                      Math.abs(
                        cashSummary.difference
                      ) > 0.009
                    }
                  />

                  <View style={styles.detailSection}>
                    <Text
                      style={
                        styles.detailSectionTitle
                      }
                    >
                      Fechamentos do período
                    </Text>

                    {cashClosings.length >
                    0 ? (
                      cashClosings.map(
                        (
                          closing,
                          index
                        ) => (
                          <Pressable
                            key={
                              closing.id ||
                              `${closing.code}-${index}`
                            }
                            style={
                              styles.closingRow
                            }
                            onPress={() =>
                              setSelectedClosing(
                                closing
                              )
                            }
                          >
                            <ReportCheckbox selected={!!reportSelected[reportRowKey('cash', closing, index)]} onPress={(event?: any) => { event?.stopPropagation?.(); toggleReportSelection(closing, index); }} />
                            <View
                              style={
                                styles.dayMain
                              }
                            >
                              <Text
                                style={
                                  styles.dayTitle
                                }
                              >
                                {closing.code ||
                                  'Caixa'}
                              </Text>

                              <Text
                                style={
                                  styles.dayMeta
                                }
                              >
                                {dateBR(
                                  closing.date ||
                                    ''
                                )}{' '}
                                •{' '}
                                {closing.sales ||
                                  0}{' '}
                                venda(s)
                              </Text>
                            </View>

                            <View
                              style={
                                styles.closingRight
                              }
                            >
                              <Text
                                style={
                                  styles.dayAmount
                                }
                              >
                                {money(
                                  closing.total_sales ||
                                    0
                                )}
                              </Text>

                              <Text
                                style={
                                  styles.arrow
                                }
                              >
                                ›
                              </Text>
                            </View>
                          </Pressable>
                        )
                      )
                    ) : (
                      <Text
                        style={
                          styles.emptyText
                        }
                      >
                        Nenhum fechamento
                        no período.
                      </Text>
                    )}
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={detailMode === 'products'}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailMode(null)}
      >
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <ModalHeader
              title="Produtos mais vendidos"
              subtitle={`${periodLabel} • Curva ABC por receita (top 10)`}
              onClose={() => setDetailMode(null)}
              onPrint={() =>
                printReport(
                  'Produtos mais vendidos — Curva ABC',
                  periodLabel,
                  ['Produto', 'Quantidade', 'Faturamento', '% individual', '% acumulado', 'Curva'],
                  selectedReportRows.map((p) => [
                    p.name,
                    qtyLabel(p.qty),
                    money(p.revenue),
                    `${p.percent.toFixed(1)}%`,
                    `${p.cumulativePercent.toFixed(1)}%`,
                    p.tier,
                  ])
                )
              }
              onExcel={() =>
                downloadCsv(
                  `relatorio_produtos_${appliedStart}_${appliedEnd}.csv`,
                  ['Produto', 'Quantidade', 'Faturamento', '% individual', '% acumulado', 'Curva'],
                  selectedReportRows.map((p) => [
                    p.name,
                    p.qty,
                    p.revenue,
                    p.percent.toFixed(1),
                    p.cumulativePercent.toFixed(1),
                    p.tier,
                  ])
                )
              }
            />

            <ReportSelectionBar selected={selectedReportRows.length} total={selectableKeys.length} onSelectAll={() => selectAllReportRows(true)} onClear={() => selectAllReportRows(false)} />

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalBody}
            >
              <Notice
                text="Curva ABC: produtos A concentram até 80% da receita, B até 95% e C o restante — priorize a reposição dos A."
              />

              <View style={styles.detailSection}>
                {productsAbc.length > 0 ? (
                  productsAbc.map((product, index) => (
                    <View
                      key={`${product.name}-${index}`}
                      style={styles.dayRow}
                    >
                      <ReportCheckbox selected={!!reportSelected[reportRowKey('products', product, index)]} onPress={() => toggleReportSelection(product, index)} />
                      <AbcBadge tier={product.tier} />

                      <View style={styles.dayMain}>
                        <Text style={styles.dayTitle}>
                          {index + 1}. {product.name}
                        </Text>

                        <Text style={styles.dayMeta}>
                          {qtyLabel(product.qty)} vendido(s) • {product.percent.toFixed(1)}% do período • acumulado {product.cumulativePercent.toFixed(1)}%
                        </Text>
                      </View>

                      <Text style={styles.dayAmount}>
                        {money(product.revenue)}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptyText}>
                    Nenhuma venda registrada ainda.
                  </Text>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={detailMode === 'payments'}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailMode(null)}
      >
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <ModalHeader
              title="Formas de pagamento"
              subtitle={periodLabel}
              onClose={() => setDetailMode(null)}
              onPrint={() =>
                printReport(
                  'Formas de pagamento',
                  periodLabel,
                  ['Forma de pagamento', 'Valor', 'Percentual'],
                  selectedReportRows.map((row) => [
                    row.method,
                    money(row.value),
                    `${row.percent.toFixed(1)}%`,
                  ])
                )
              }
              onExcel={() =>
                downloadCsv(
                  `relatorio_pagamentos_${appliedStart}_${appliedEnd}.csv`,
                  ['Forma de pagamento', 'Valor', 'Percentual'],
                  selectedReportRows.map((row) => [
                    row.method,
                    row.value,
                    row.percent.toFixed(1),
                  ])
                )
              }
            />

            <ReportSelectionBar selected={selectedReportRows.length} total={selectableKeys.length} onSelectAll={() => selectAllReportRows(true)} onClear={() => selectAllReportRows(false)} />

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalBody}
            >
              {paymentBreakdown.length > 0 ? (
                paymentBreakdown.map((row, index) => (
                  <View key={row.method} style={styles.dayRow}>
                    <ReportCheckbox selected={!!reportSelected[reportRowKey('payments', row, index)]} onPress={() => toggleReportSelection(row, index)} />
                    <View style={styles.dayMain}>
                      <Text style={styles.dayTitle}>{row.method}</Text>
                      <Text style={styles.dayMeta}>{row.percent.toFixed(1)}% do faturamento selecionado</Text>
                    </View>
                    <Text style={styles.dayAmount}>{money(row.value)}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyText}>
                  Nenhuma venda registrada ainda.
                </Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={detailMode === 'customers'}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailMode(null)}
      >
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <ModalHeader
              title="Ranking de clientes"
              subtitle={`${periodLabel} • Curva ABC (top 15)`}
              onClose={() => setDetailMode(null)}
              onPrint={() =>
                printReport(
                  'Ranking de clientes — Curva ABC',
                  periodLabel,
                  ['Cliente', 'Compras', 'Total gasto', 'Ticket médio', '% individual', '% acumulado', 'Curva'],
                  selectedReportRows.map((c) => [
                    c.name,
                    c.purchases,
                    money(c.total),
                    money(c.ticket),
                    `${c.percent.toFixed(1)}%`,
                    `${c.cumulativePercent.toFixed(1)}%`,
                    c.tier,
                  ])
                )
              }
              onExcel={() =>
                downloadCsv(
                  `relatorio_clientes_${appliedStart}_${appliedEnd}.csv`,
                  ['Cliente', 'Compras', 'Total gasto', 'Ticket médio', '% individual', '% acumulado', 'Curva'],
                  selectedReportRows.map((c) => [
                    c.name,
                    c.purchases,
                    c.total,
                    c.ticket,
                    c.percent.toFixed(1),
                    c.cumulativePercent.toFixed(1),
                    c.tier,
                  ])
                )
              }
            />

            <ReportSelectionBar selected={selectedReportRows.length} total={selectableKeys.length} onSelectAll={() => selectAllReportRows(true)} onClear={() => selectAllReportRows(false)} />

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalBody}
            >
              <Notice
                text="Curva ABC: clientes A concentram até 80% do faturamento do período, B até 95% e C o restante."
              />

              {customerRanking.length > 0 ? (
                customerRanking.map((customer, index) => (
                  <View
                    key={`${customer.name}-${index}`}
                    style={styles.dayRow}
                  >
                    <ReportCheckbox selected={!!reportSelected[reportRowKey('customers', customer, index)]} onPress={() => toggleReportSelection(customer, index)} />
                    <AbcBadge tier={customer.tier} />

                    <View style={styles.dayMain}>
                      <Text style={styles.dayTitle}>
                        {index + 1}. {customer.name}
                      </Text>

                      <Text style={styles.dayMeta}>
                        {customer.purchases} compra(s) • ticket médio{' '}
                        {money(customer.ticket)} •{' '}
                        {customer.percent.toFixed(1)}% do período • acumulado {customer.cumulativePercent.toFixed(1)}%
                      </Text>
                    </View>

                    <Text style={styles.dayAmount}>
                      {money(customer.total)}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyText}>
                  Nenhum cliente identificado com compra no período.
                </Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={detailMode === 'finance'}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailMode(null)}
      >
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <ModalHeader
              title="Financeiro"
              subtitle={periodLabel}
              onClose={() => setDetailMode(null)}
              onPrint={() =>
                financeReportMode === 'category'
                  ? printReport(
                      'Financeiro por categoria',
                      periodLabel,
                      ['Tipo', 'Categoria', 'Lançamentos', 'Total', 'Realizado', 'Pendente'],
                      [
                        ...selectedFinanceCategoryRows.map((r) => [
                          r.reportType,
                          r.category,
                          r.count,
                          money(r.total),
                          money(r.realized),
                          money(r.pending),
                        ]),
                      ]
                    )
                  : printReport(
                      financeModeLabel(financeReportMode),
                      periodLabel,
                      ['Descrição', 'Categoria', 'Data', 'Status', 'Valor'],
                      selectedFinanceFlatRows.map((r) => [
                        r.description,
                        r.category,
                        dateBR(
                          r.status === 'paid' || r.status === 'received'
                            ? r.settlement_date
                            : r.due_date
                        ),
                        statusLabelPt(r.status),
                        money(r.amount),
                      ])
                    )
              }
              onExcel={() =>
                financeReportMode === 'category'
                  ? downloadCsv(
                      `relatorio_financeiro_${appliedStart}_${appliedEnd}.csv`,
                      ['Tipo', 'Categoria', 'Lançamentos', 'Total', 'Realizado', 'Pendente'],
                      [
                        ...selectedFinanceCategoryRows.map((r) => [
                          r.reportType,
                          r.category,
                          r.count,
                          r.total,
                          r.realized,
                          r.pending,
                        ]),
                      ]
                    )
                  : downloadCsv(
                      `relatorio_${financeReportMode}_${appliedStart}_${appliedEnd}.csv`,
                      ['Descrição', 'Categoria', 'Data', 'Status', 'Valor'],
                      selectedFinanceFlatRows.map((r) => [
                        r.description,
                        r.category,
                        r.status === 'paid' || r.status === 'received'
                          ? r.settlement_date
                          : r.due_date,
                        r.status,
                        r.amount,
                      ])
                    )
              }
            />

            <View style={styles.periodButtons}>
              <PeriodButton
                label="Por categoria"
                active={financeReportMode === 'category'}
                onPress={() => setFinanceReportMode('category')}
              />
              <PeriodButton
                label="Contas a pagar"
                active={financeReportMode === 'payable_open'}
                onPress={() => setFinanceReportMode('payable_open')}
              />
              <PeriodButton
                label="Contas a receber"
                active={financeReportMode === 'receivable_open'}
                onPress={() => setFinanceReportMode('receivable_open')}
              />
              <PeriodButton
                label="Contas pagas"
                active={financeReportMode === 'payable_paid'}
                onPress={() => setFinanceReportMode('payable_paid')}
              />
              <PeriodButton
                label="Contas recebidas"
                active={financeReportMode === 'receivable_paid'}
                onPress={() => setFinanceReportMode('receivable_paid')}
              />
            </View>

            <View style={styles.selectionBar}>
              <Text style={styles.selectionText}>
                {financeReportMode === 'category' ? selectedFinanceCategoryRows.length : selectedFinanceFlatRows.length} de {financeSelectionKeys.length} item(ns) selecionado(s)
              </Text>
              <View style={styles.selectionActions}>
                <Pressable onPress={() => selectAllFinance(true)}><Text style={styles.selectionLink}>Selecionar todos</Text></Pressable>
                <Pressable onPress={() => selectAllFinance(false)}><Text style={styles.selectionLink}>Limpar seleção</Text></Pressable>
              </View>
            </View>

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalBody}
            >
              {financeReportMode === 'category' ? (
                <>
                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>
                      Contas a pagar
                    </Text>

                    {financeByCategory.payables.length > 0 ? (
                      financeByCategory.payables.map((row) => (
                        <View key={row.category} style={styles.dayRow}>
                          <Pressable onPress={() => toggleFinanceSelection(`expense:${row.category}`)} style={[styles.checkbox, financeSelected[`expense:${row.category}`] && styles.checkboxActive]}>
                            <Text style={styles.checkboxText}>{financeSelected[`expense:${row.category}`] ? '✓' : ''}</Text>
                          </Pressable>
                          <View style={styles.dayMain}>
                            <Text style={styles.dayTitle}>
                              {row.category}
                            </Text>
                            <Text style={styles.dayMeta}>
                              {row.count} lançamento(s) • pago{' '}
                              {money(row.realized)} • pendente{' '}
                              {money(row.pending)}
                            </Text>
                          </View>

                          <Text style={styles.dayAmount}>
                            {money(row.total)}
                          </Text>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.emptyText}>
                        Nenhuma conta a pagar com vencimento no período.
                      </Text>
                    )}
                  </View>

                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>
                      Contas a receber
                    </Text>

                    {financeByCategory.receivables.length > 0 ? (
                      financeByCategory.receivables.map((row) => (
                        <View key={row.category} style={styles.dayRow}>
                          <Pressable onPress={() => toggleFinanceSelection(`revenue:${row.category}`)} style={[styles.checkbox, financeSelected[`revenue:${row.category}`] && styles.checkboxActive]}>
                            <Text style={styles.checkboxText}>{financeSelected[`revenue:${row.category}`] ? '✓' : ''}</Text>
                          </Pressable>
                          <View style={styles.dayMain}>
                            <Text style={styles.dayTitle}>
                              {row.category}
                            </Text>
                            <Text style={styles.dayMeta}>
                              {row.count} lançamento(s) • recebido{' '}
                              {money(row.realized)} • pendente{' '}
                              {money(row.pending)}
                            </Text>
                          </View>

                          <Text style={styles.dayAmount}>
                            {money(row.total)}
                          </Text>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.emptyText}>
                        Nenhuma conta a receber com vencimento no período.
                      </Text>
                    )}
                  </View>
                </>
              ) : (
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>
                    {financeModeLabel(financeReportMode)} • {financeFlatRows.length} lançamento(s)
                  </Text>

                  {financeFlatRows.length > 0 ? (
                    financeFlatRows.map((row) => (
                      <View key={row.id} style={styles.dayRow}>
                        <Pressable onPress={() => toggleFinanceSelection(String(row.id))} style={[styles.checkbox, financeSelected[String(row.id)] && styles.checkboxActive]}>
                          <Text style={styles.checkboxText}>{financeSelected[String(row.id)] ? '✓' : ''}</Text>
                        </Pressable>
                        <View style={styles.dayMain}>
                          <Text style={styles.dayTitle}>{row.description}</Text>
                          <Text style={styles.dayMeta}>
                            {row.category} •{' '}
                            {row.status === 'paid' || row.status === 'received'
                              ? `baixado em ${dateBR(row.settlement_date)}`
                              : `vence ${dateBR(row.due_date)}`}
                          </Text>
                        </View>

                        <Text style={styles.dayAmount}>{money(row.amount)}</Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.emptyText}>Nada nesse período.</Text>
                  )}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={detailMode === 'purchases'}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailMode(null)}
      >
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <ModalHeader
              title="Compras e recebimentos"
              subtitle={periodLabel}
              onClose={() => setDetailMode(null)}
              onPrint={() =>
                printReport(
                  'Relatório de compras e recebimentos',
                  periodLabel,
                  ['Data', 'Fornecedor', 'Documento', 'Itens', 'Total', 'Conta a pagar'],
                  selectedReportRows.map((row) => [
                    dateBR(row.date),
                    row.supplier,
                    row.document || '—',
                    row.items,
                    money(row.total),
                    statusLabelPt(row.payable_status),
                  ])
                )
              }
              onExcel={() =>
                downloadCsv(
                  `relatorio_compras_${appliedStart}_${appliedEnd}.csv`,
                  ['Data', 'Fornecedor', 'Documento', 'Itens', 'Total', 'Conta a pagar'],
                  selectedReportRows.map((row) => [
                    row.date,
                    row.supplier,
                    row.document || '',
                    row.items,
                    row.total,
                    row.payable_status,
                  ])
                )
              }
            />

            <ReportSelectionBar selected={selectedReportRows.length} total={selectableKeys.length} onSelectAll={() => selectAllReportRows(true)} onClear={() => selectAllReportRows(false)} />

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalBody}
            >
              <SummaryRow label="Compras no período" value={String(purchaseSummary.count)} />
              <SummaryRow label="Total comprado" value={money(purchaseSummary.total)} />
              <SummaryRow label="A pagar vinculado" value={money(purchaseSummary.open)} />

              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Lançamentos</Text>
                {purchaseRows.length > 0 ? (
                  purchaseRows.map((row, index) => (
                    <View key={String(row.id || index)} style={styles.dayRow}>
                      <ReportCheckbox selected={!!reportSelected[reportRowKey('purchases', row, index)]} onPress={() => toggleReportSelection(row, index)} />
                      <View style={styles.dayMain}>
                        <Text style={styles.dayTitle}>{row.supplier}</Text>
                        <Text style={styles.dayMeta}>
                          {dateBR(row.date)} • {row.document || 'Sem documento'} • {row.items} item(ns) • {statusLabelPt(row.payable_status)}
                        </Text>
                      </View>
                      <Text style={styles.dayAmount}>{money(row.total)}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptyText}>Nenhuma compra registrada no período.</Text>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={detailMode === 'stock'}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailMode(null)}
      >
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <ModalHeader
              title="Alertas de estoque"
              subtitle="Situação atual da loja"
              onClose={() => setDetailMode(null)}
              onPrint={() =>
                printReport(
                  'Alertas de estoque',
                  `Situação em ${dateBR(today)}`,
                  ['Código', 'Produto', 'Estoque', 'Mínimo', 'Situação'],
                  selectedReportRows.map((r) => [
                    r.code,
                    r.name,
                    `${qtyLabel(r.stock)} ${r.unit}`,
                    `${qtyLabel(r.minimum)} ${r.unit}`,
                    r.status,
                  ])
                )
              }
              onExcel={() =>
                downloadCsv(
                  `relatorio_estoque_${today}.csv`,
                  ['Código', 'Produto', 'Estoque', 'Mínimo', 'Situação'],
                  selectedReportRows.map((r) => [
                    r.code,
                    r.name,
                    r.stock,
                    r.minimum,
                    r.status,
                  ])
                )
              }
            />

            <ReportSelectionBar selected={selectedReportRows.length} total={selectableKeys.length} onSelectAll={() => selectAllReportRows(true)} onClear={() => selectAllReportRows(false)} />

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalBody}
            >
              {stockAlerts.length > 0 ? (
                stockAlerts.map((row, index) => (
                  <View key={row.code} style={styles.dayRow}>
                    <ReportCheckbox selected={!!reportSelected[reportRowKey('stock', row, index)]} onPress={() => toggleReportSelection(row, index)} />
                    <View style={styles.dayMain}>
                      <Text style={styles.dayTitle}>{row.name}</Text>

                      <Text style={styles.dayMeta}>
                        Cód. {row.code} • estoque {qtyLabel(row.stock)}{' '}
                        {row.unit} • mínimo {qtyLabel(row.minimum)}{' '}
                        {row.unit}
                      </Text>
                    </View>

                    <Text
                      style={[
                        styles.dayAmount,
                        row.status === 'Negativo' && styles.danger,
                      ]}
                    >
                      {row.status}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyText}>
                  Nenhum produto no mínimo ou abaixo agora.
                </Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </AdminShell>
  );
}

function qtyLabel(value: number) {
  const number = Number(value || 0);

  return Number.isInteger(number)
    ? String(number)
    : new Intl.NumberFormat('pt-BR', {
        maximumFractionDigits: 3,
      }).format(number);
}

function PeriodButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[
        styles.periodButton,
        active &&
          styles.periodButtonActive,
      ]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.periodButtonText,
          active &&
            styles.periodButtonTextActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function CatalogFilter({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.catalogFilter, active && styles.catalogFilterActive]}
      onPress={onPress}
    >
      <Text style={[styles.catalogFilterText, active && styles.catalogFilterTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function ExecutiveMetric({
  label,
  value,
  note,
  icon,
  color,
  background,
}: {
  label: string;
  value: string;
  note: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
  background: string;
}) {
  return (
    <View style={styles.executiveCard}>
      <View style={[styles.executiveIcon, { backgroundColor: background }]}>
        <Feather name={icon} size={15} color={color} />
      </View>
      <View style={styles.executiveContent}>
        <Text style={styles.executiveLabel}>{label}</Text>
        <Text style={styles.executiveValue}>{value}</Text>
        <Text style={styles.executiveNote}>{note}</Text>
      </View>
    </View>
  );
}

function ReportCard({
  icon,
  color,
  background,
  title,
  description,
  value,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  color: string;
  background: string;
  title: string;
  description: string;
  value: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.reportCard, pressed && styles.reportCardPressed]}
      onPress={onPress}
    >
      <View style={[styles.reportAccent, { backgroundColor: color }]} />
      <View style={[styles.iconCircle, { backgroundColor: background }]}>
        <Feather name={icon} size={22} color={color} />
      </View>

      <View style={styles.reportMain}>
        <Text style={styles.reportTitle}>
          {title}
        </Text>
        <Text style={styles.reportDescription} numberOfLines={2}>{description}</Text>
        <View style={styles.reportPreview}>
          <Text style={styles.reportValue} numberOfLines={1}>{value}</Text>
          <Text style={styles.reportSubtitle} numberOfLines={1}>{subtitle}</Text>
        </View>
      </View>

      <View style={[styles.cardArrow, { backgroundColor: background }]}>
        <Feather name="chevron-right" size={18} color={color} />
      </View>
    </Pressable>
  );
}

function ModalHeader({
  title,
  subtitle,
  onClose,
  onPrint,
  onExcel,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  onPrint?: () => void;
  onExcel?: () => void;
}) {
  return (
    <View style={styles.modalHeader}>
      <View style={styles.modalHeaderMain}>
        <Text style={styles.modalTitle}>
          {title}
        </Text>

        <Text style={styles.modalSubtitle}>
          {subtitle}
        </Text>

        {Platform.OS === 'web' && (!!onPrint || !!onExcel) && (
          <View style={styles.exportRow}>
            {!!onPrint && (
              <Pressable style={styles.exportButton} onPress={onPrint}>
                <Text style={styles.exportButtonText}>
                  Imprimir / PDF
                </Text>
              </Pressable>
            )}

            {!!onExcel && (
              <Pressable style={styles.exportButton} onPress={onExcel}>
                <Text style={styles.exportButtonText}>Excel</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>

      <Pressable onPress={onClose}>
        <Text style={styles.modalClose}>
          ×
        </Text>
      </Pressable>
    </View>
  );
}

function ReportSelectionBar({
  selected,
  total,
  onSelectAll,
  onClear,
}: {
  selected: number;
  total: number;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  return (
    <View style={styles.selectionBar}>
      <Text style={styles.selectionText}>{selected} de {total} item(ns) selecionado(s)</Text>
      <View style={styles.selectionActions}>
        <Pressable onPress={onSelectAll}><Text style={styles.selectionLink}>Selecionar todos</Text></Pressable>
        <Pressable onPress={onClear}><Text style={styles.selectionLink}>Limpar seleção</Text></Pressable>
      </View>
    </View>
  );
}

function ReportCheckbox({ selected, onPress }: { selected: boolean; onPress: (event?: any) => void }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={onPress} style={[styles.checkbox, selected && styles.checkboxActive]}>
      <Text style={styles.checkboxText}>{selected ? '✓' : ''}</Text>
    </Pressable>
  );
}

function SummaryRow({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>
        {label}
      </Text>

      <Text
        style={[
          styles.summaryValue,
          danger && styles.danger,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function AbcBadge({ tier }: { tier: AbcTier }) {
  const tone = {
    A: { color: '#25835A', background: '#EAF7F0' },
    B: { color: '#B8862F', background: '#FBF3E0' },
    C: { color: '#66717D', background: '#F2F4F5' },
  }[tier];

  return (
    <View style={[styles.abcBadge, { backgroundColor: tone.background }]}>
      <Text style={[styles.abcBadgeText, { color: tone.color }]}>{tier}</Text>
    </View>
  );
}

function ClosingDetails({
  closing,
}: {
  closing: CashClosing;
}) {
  return (
    <>
      <SummaryRow
        label="Data"
        value={dateBR(
          closing.date || ''
        )}
      />

      <SummaryRow
        label="Abertura"
        value={
          closing.opened_at ||
          closing.opened_time ||
          '—'
        }
      />

      <SummaryRow
        label="Fechamento"
        value={
          closing.closed_at ||
          closing.closed_time ||
          '—'
        }
      />

      <SummaryRow
        label="Operador"
        value={
          closing.operator || '—'
        }
      />

      <SummaryRow
        label="Fundo inicial"
        value={money(
          closing.opening_float || 0
        )}
      />

      <SummaryRow
        label="Vendas"
        value={`${closing.sales || 0} • ${money(
          closing.total_sales || 0
        )}`}
      />

      <SummaryRow
        label="Suprimentos"
        value={money(
          closing.supplies || 0
        )}
      />

      <SummaryRow
        label="Sangrias"
        value={money(
          closing.withdrawals || 0
        )}
      />

      <View style={styles.detailSection}>
        <Text
          style={
            styles.detailSectionTitle
          }
        >
          Conferência por pagamento
        </Text>

        {METHODS.map((method) => (
          <View
            key={method}
            style={
              styles.paymentSection
            }
          >
            <Text
              style={
                styles.paymentTitle
              }
            >
              {method}
            </Text>

            <SummaryRow
              label="Esperado"
              value={money(
                closing.expected?.[
                  method
                ] || 0
              )}
            />

            <SummaryRow
              label="Contado"
              value={money(
                closing.counted?.[
                  method
                ] || 0
              )}
            />

            <SummaryRow
              label="Diferença"
              value={money(
                closing.differences?.[
                  method
                ] || 0
              )}
              danger={
                Math.abs(
                  closing.differences?.[
                    method
                  ] || 0
                ) > 0.009
              }
            />
          </View>
        ))}
      </View>

      <SummaryRow
        label="Total esperado"
        value={money(
          closing.expected_total || 0
        )}
      />

      <SummaryRow
        label="Total contado"
        value={money(
          closing.counted_total || 0
        )}
      />

      <SummaryRow
        label="Diferença final"
        value={money(
          closing.difference || 0
        )}
        danger={
          Math.abs(
            closing.difference || 0
          ) > 0.009
        }
      />

      <View style={styles.detailSection}>
        <Text
          style={
            styles.detailSectionTitle
          }
        >
          Sangrias e suprimentos
        </Text>

        {(closing.movements || [])
          .length > 0 ? (
          (closing.movements || []).map(
            (movement, index) => (
              <View
                key={
                  movement.id ||
                  `${movement.type}-${index}`
                }
                style={
                  styles.movementRow
                }
              >
                <View
                  style={
                    styles.dayMain
                  }
                >
                  <Text
                    style={
                      styles.dayTitle
                    }
                  >
                    {movement.type ===
                    'SANGRIA'
                      ? 'Sangria'
                      : 'Suprimento'}
                  </Text>

                  <Text
                    style={
                      styles.dayMeta
                    }
                  >
                    {movement.time ||
                      '—'}{' '}
                    •{' '}
                    {movement.reason ||
                      'Sem motivo'}
                  </Text>
                </View>

                <Text
                  style={[
                    styles.dayAmount,
                    movement.type ===
                      'SANGRIA' &&
                      styles.danger,
                  ]}
                >
                  {money(
                    movement.amount || 0
                  )}
                </Text>
              </View>
            )
          )
        ) : (
          <Text
            style={styles.emptyText}
          >
            Nenhuma sangria ou
            suprimento.
          </Text>
        )}
      </View>

      {!!closing.observation && (
        <View style={styles.detailSection}>
          <Text
            style={
              styles.detailSectionTitle
            }
          >
            Observação
          </Text>

          <Text
            style={
              styles.observation
            }
          >
            {closing.observation}
          </Text>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  error: {
    color: theme.colors.danger,
    fontSize: 14,
    fontWeight: '700',
  },

  periodCard: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 14,
    padding: 13,
    gap: 10,
  },

  periodTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    justifyContent: 'space-between',
  },

  periodHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },

  periodIcon: {
    alignItems: 'center',
    backgroundColor: '#FBF3E0',
    borderRadius: 9,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },

  periodEyebrow: {
    color: theme.colors.muted,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.7,
  },

  periodTitle: {
    color: theme.colors.text,
    fontFamily: 'Sora_700Bold',
    fontSize: 15,
    marginTop: 2,
  },

  periodButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  selectionBar: {
    alignItems: 'center',
    backgroundColor: '#F7F6F2',
    borderBottomColor: theme.colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  selectionText: { color: theme.colors.text, fontSize: 12, fontWeight: '800' },
  selectionActions: { flexDirection: 'row', gap: 14 },
  selectionLink: { color: '#9A6B12', fontSize: 12, fontWeight: '900' },
  checkbox: { alignItems: 'center', borderColor: theme.colors.border, borderRadius: 5, borderWidth: 1, height: 22, justifyContent: 'center', width: 22 },
  checkboxActive: { backgroundColor: '#B88A32', borderColor: '#B88A32' },
  checkboxText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },

  periodButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 999,
    backgroundColor: '#FFF',
  },

  periodButtonActive: {
    backgroundColor: theme.colors.text,
    borderColor: theme.colors.text,
  },

  periodButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.text,
  },

  periodButtonTextActive: {
    color: '#FFF',
  },

  customArea: {
    gap: 10,
  },

  dateFields: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },

  dateField: {
    flex: 1,
    minWidth: 135,
  },

  dateLabel: {
    marginBottom: 5,
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.muted,
  },

  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: theme.colors.text,
    backgroundColor: '#FFF',
  },

  periodError: {
    color: theme.colors.danger,
    fontSize: 13,
    fontWeight: '700',
  },

  appliedNotice: {
    color: '#2E7D32',
    fontSize: 13,
    fontWeight: '800',
  },

  applyButton: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.text,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },

  applyButtonText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '900',
  },

  selectedPeriod: {
    fontSize: 13,
    color: theme.colors.muted,
    fontWeight: '700',
  },

  catalogIntro: {
    flex: 1,
    minWidth: 260,
  },

  catalogEyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    color: theme.colors.muted,
  },

  catalogTitle: {
    marginTop: 3,
    fontFamily: 'Sora_700Bold',
    fontSize: 18,
    color: theme.colors.text,
  },

  catalogSubtitle: {
    marginTop: 5,
    maxWidth: 720,
    fontSize: 11.5,
    lineHeight: 17,
    color: theme.colors.muted,
  },

  executiveSection: {
    gap: 10,
  },

  executiveTitle: {
    color: theme.colors.text,
    fontFamily: 'Sora_700Bold',
    fontSize: 18,
    marginTop: 3,
  },

  executiveGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },

  executiveCard: {
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderColor: theme.colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    minWidth: 210,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },

  executiveIcon: {
    alignItems: 'center',
    borderRadius: 9,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },

  executiveContent: {
    flex: 1,
  },

  executiveLabel: {
    color: theme.colors.muted,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.55,
  },

  executiveValue: {
    color: theme.colors.text,
    fontFamily: 'Sora_700Bold',
    fontSize: 17,
    marginTop: 2,
  },

  executiveNote: {
    color: theme.colors.muted,
    fontSize: 9.5,
    marginTop: 1,
  },

  catalogPanel: {
    backgroundColor: '#FFF',
    borderColor: theme.colors.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },

  catalogHeader: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },

  catalogCount: {
    alignItems: 'center',
    backgroundColor: '#F5F4F0',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  catalogCountText: {
    color: theme.colors.muted,
    fontSize: 10.5,
    fontWeight: '800',
  },

  catalogTools: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },

  searchBox: {
    alignItems: 'center',
    backgroundColor: '#FAFAF8',
    borderColor: theme.colors.border,
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    minWidth: 260,
    paddingHorizontal: 12,
  },

  searchInput: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 12.5,
    height: 40,
    outlineStyle: 'none',
  } as any,

  catalogFilters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },

  catalogFilter: {
    backgroundColor: '#FFF',
    borderColor: theme.colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },

  catalogFilterActive: {
    backgroundColor: theme.colors.text,
    borderColor: theme.colors.text,
  },

  catalogFilterText: {
    color: theme.colors.text,
    fontSize: 11,
    fontWeight: '800',
  },

  catalogFilterTextActive: {
    color: '#FFF',
  },

  reportSection: {
    gap: 9,
  },

  reportSectionHead: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },

  reportSectionTitle: {
    color: theme.colors.text,
    fontFamily: 'Sora_700Bold',
    fontSize: 15,
  },

  reportSectionCount: {
    backgroundColor: '#ECEAE5',
    borderRadius: 999,
    color: theme.colors.muted,
    fontSize: 9.5,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 2,
  },

  reportCards: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },

  reportCard: {
    alignItems: 'center',
    minWidth: 300,
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 14,
    minHeight: 108,
    overflow: 'hidden',
    paddingHorizontal: 13,
    paddingVertical: 12,
    flexDirection: 'row',
    gap: 11,
    shadowColor: '#17202A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
  },

  reportCardPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.995 }],
  },

  reportAccent: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
    width: 3,
  },

  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1EFE9',
  },

  reportMain: {
    flex: 1,
  },

  reportTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: theme.colors.text,
  },

  reportDescription: {
    color: theme.colors.muted,
    fontSize: 10.5,
    lineHeight: 15,
    marginTop: 3,
  },

  reportPreview: {
    alignItems: 'baseline',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 7,
  },

  reportValue: {
    fontSize: 13,
    fontWeight: '900',
    color: theme.colors.text,
    maxWidth: '58%',
  },

  reportSubtitle: {
    flex: 1,
    fontSize: 9.5,
    color: theme.colors.muted,
  },

  cardArrow: {
    alignItems: 'center',
    borderRadius: 15,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },

  catalogEmpty: {
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderColor: theme.colors.border,
    borderRadius: 14,
    borderStyle: 'dashed',
    borderWidth: 1,
    padding: 28,
  },

  catalogEmptyTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
    marginTop: 8,
  },

  catalogEmptyText: {
    color: theme.colors.muted,
    fontSize: 11,
    marginTop: 3,
  },

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,.55)',
    justifyContent: 'center',
    padding: 18,
  },

  modal: {
    width: '100%',
    maxWidth: 700,
    height: '90%',
    maxHeight: 780,
    alignSelf: 'center',
    backgroundColor: '#FFF',
    borderRadius: 18,
    overflow: 'hidden',
  },

  modalHeader: {
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
  },

  modalHeaderMain: {
    flex: 1,
  },

  modalTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: theme.colors.text,
  },

  modalSubtitle: {
    marginTop: 3,
    fontSize: 13,
    color: theme.colors.muted,
    fontWeight: '700',
  },

  exportRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },

  exportButton: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },

  exportButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.text,
  },

  modalClose: {
    fontSize: 30,
    lineHeight: 32,
    color: theme.colors.muted,
  },

  modalScroll: {
    flex: 1,
  },

  modalBody: {
    padding: 14,
    gap: 10,
  },

  summaryRow: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 11,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 14,
  },

  summaryLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.muted,
  },

  summaryValue: {
    flexShrink: 1,
    textAlign: 'right',
    fontSize: 14,
    fontWeight: '900',
    color: theme.colors.text,
  },

  danger: {
    color: theme.colors.danger,
  },

  detailSection: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    overflow: 'hidden',
  },

  detailSectionTitle: {
    padding: 13,
    fontSize: 15,
    fontWeight: '900',
    color: theme.colors.text,
    backgroundColor: '#F7F6F3',
  },

  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 13,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },

  dayMain: {
    flex: 1,
  },

  abcBadge: {
    alignItems: 'center',
    borderRadius: 9,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },

  abcBadgeText: {
    fontSize: 13,
    fontWeight: '900',
  },

  dayTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: theme.colors.text,
  },

  dayMeta: {
    marginTop: 3,
    fontSize: 12,
    color: theme.colors.muted,
  },

  dayAmount: {
    fontSize: 14,
    fontWeight: '900',
    color: theme.colors.text,
  },

  emptyText: {
    padding: 14,
    fontSize: 13,
    color: theme.colors.muted,
  },

  currentCash: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    padding: 12,
    gap: 8,
    backgroundColor: '#F7F6F3',
  },

  currentCashTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: theme.colors.text,
  },

  currentCashMeta: {
    fontSize: 12,
    color: theme.colors.muted,
    fontWeight: '700',
  },

  closingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 13,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },

  closingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  arrow: {
    fontSize: 28,
    color: theme.colors.muted,
  },

  paymentSection: {
    paddingHorizontal: 10,
    paddingBottom: 10,
    gap: 7,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },

  paymentTitle: {
    paddingTop: 10,
    fontSize: 14,
    fontWeight: '900',
    color: theme.colors.text,
  },

  movementRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    padding: 13,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },

  observation: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.text,
  },
});
