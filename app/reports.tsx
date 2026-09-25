import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

import { AdminShell } from '@/components/AdminShell';
import { DateField, Notice, SearchablePicker } from '@/components/FormKit';
import { PeriodCalendar, type PeriodPreset } from '@/components/PeriodCalendar';
import { theme } from '@/constants/theme';
import { useBranding } from '@/contexts/BrandingContext';
import { getReports } from '@/services/api';
import { getCashFlow, getFull, getManagerialDre } from '@/services/fullApi';
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

const dreCostQualityText = (quality: any) => {
  if (quality?.historical_cogs_complete) {
    return `CMV histórico completo em ${Number(quality.cogs_costed_lines || 0)} item(ns) vendido(s)`;
  }
  if (quality?.historical_cogs_available) {
    return `CMV histórico parcial: ${Number(quality.cogs_coverage_percent || 0).toFixed(1).replace('.', ',')}% dos itens com custo`;
  }
  return 'CMV histórico indisponível; usando custos diretos classificados';
};

const dreNeedsReview = (quality: any) => Boolean(
  quality && (
    Number(quality.categories_to_review || 0) > 0 ||
    Number(quality.unmapped_entries || 0) > 0 ||
    !quality.historical_cogs_complete
  )
);

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

function safePrintColor(value: string | null | undefined, fallback: string) {
  return /^#[0-9a-f]{6}$/i.test(value || '') ? String(value) : fallback;
}

function pdfColor(value: string) {
  const hex = value.replace('#', '');
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ] as [number, number, number];
}

function reportPdfFilename(title: string) {
  const normalized = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  const date = new Date().toISOString().slice(0, 10);
  return `${normalized || 'relatorio'}-${date}.pdf`;
}

async function printRows(
  title: string,
  subtitle: string,
  headers: string[],
  rows: Array<Array<string | number>>,
  branding: Branding,
  recordCount = rows.length
) {
  if (Platform.OS !== 'web') {
    return;
  }

  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const autoTable = autoTableModule.default;

  const primary = safePrintColor(branding.color_primary, '#C49A3A');
  const secondary = safePrintColor(branding.color_secondary, '#1F2933');
  const pageOrientation = headers.length >= 6 ? 'landscape' : 'portrait';
  const brandName = branding.brand_name || 'TEYVOR';
  const generatedAt = new Date().toLocaleString('pt-BR');
  const primaryRgb = pdfColor(primary);
  const secondaryRgb = pdfColor(secondary);
  const document = new jsPDF({
    orientation: pageOrientation,
    unit: 'mm',
    format: 'a4',
    compress: true,
  });
  const pageWidth = document.internal.pageSize.getWidth();
  const pageHeight = document.internal.pageSize.getHeight();

  document.setProperties({
    title,
    subject: subtitle,
    author: `${brandName} Gestão 360`,
    creator: 'TEYVOR Gestão 360',
  });

  document.setFillColor(...primaryRgb);
  document.rect(12, 11, pageWidth - 24, 1.8, 'F');
  document.setFillColor(...secondaryRgb);
  document.roundedRect(12, 17, 3.5, 13, 1, 1, 'F');
  document.setFillColor(...primaryRgb);
  document.roundedRect(16.5, 17, 3.5, 13, 1, 1, 'F');
  document.setTextColor(17, 24, 32);
  document.setFont('helvetica', 'bold');
  document.setFontSize(16);
  document.text(brandName.toUpperCase(), 23, 23);
  document.setTextColor(...primaryRgb);
  document.setFontSize(7);
  document.text('GESTÃO 360', 23, 28);

  document.setTextColor(17, 24, 32);
  document.setFontSize(18);
  document.text(title, 12, 41);
  document.setFont('helvetica', 'normal');
  document.setTextColor(102, 113, 125);
  document.setFontSize(8.5);
  document.text(`Período / referência: ${subtitle}`, 12, 47);
  document.text(`Emitido em ${generatedAt}`, pageWidth - 12, 41, { align: 'right' });
  document.text(
    `${recordCount} ${recordCount === 1 ? 'registro' : 'registros'}`,
    pageWidth - 12,
    47,
    { align: 'right' }
  );

  autoTable(document, {
    startY: 53,
    head: [headers],
    body: rows.length > 0
      ? rows.map((row) => row.map((cell) => String(cell ?? '')))
      : [['Nenhuma informação encontrada para o período selecionado.', ...headers.slice(1).map(() => '')]],
    theme: 'grid',
    margin: { top: 18, right: 12, bottom: 17, left: 12 },
    styles: {
      font: 'helvetica',
      fontSize: headers.length >= 6 ? 6.8 : 7.6,
      cellPadding: 2.2,
      lineColor: [223, 227, 230],
      lineWidth: 0.25,
      textColor: [23, 32, 42],
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      fillColor: [23, 32, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'left',
    },
    alternateRowStyles: { fillColor: [250, 250, 248] },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const text = String(data.cell.raw ?? '').trim();
      if (/^-?(?:R\$\s*)?[\d.]+(?:,\d+)?(?:\s*(?:un|kg|%))?$/i.test(text)) {
        data.cell.styles.halign = 'right';
      }
    },
    willDrawPage: (data) => {
      if (data.pageNumber === 1) return;
      document.setFillColor(...primaryRgb);
      document.rect(12, 10, pageWidth - 24, 1.2, 'F');
      document.setFont('helvetica', 'bold');
      document.setFontSize(9);
      document.setTextColor(23, 32, 42);
      document.text(title, 12, 15);
      document.setFont('helvetica', 'normal');
      document.setTextColor(102, 113, 125);
      document.text(brandName, pageWidth - 12, 15, { align: 'right' });
    },
  });

  const totalPages = document.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    document.setPage(page);
    document.setDrawColor(223, 227, 230);
    document.line(12, pageHeight - 12, pageWidth - 12, pageHeight - 12);
    document.setFont('helvetica', 'normal');
    document.setFontSize(7);
    document.setTextColor(122, 131, 140);
    document.text(`${brandName} Gestão 360 · Documento gerado pelo sistema`, 12, pageHeight - 7.5);
    document.text(`${title} · Página ${page} de ${totalPages}`, pageWidth - 12, pageHeight - 7.5, { align: 'right' });
  }

  document.save(reportPdfFilename(title));
}

type PeriodKey =
  | 'today'
  | '7days'
  | '30days'
  | 'month'
  | 'year'
  | 'custom';

type DetailMode = 'sales' | 'cash' | 'products' | 'payments' | 'customers' | 'finance' | 'dre' | 'purchases' | 'stock' | null;

function reportRowKey(mode: DetailMode, row: any, index: number) {
  if (mode === 'sales') return `sales:${row.date || index}`;
  if (mode === 'cash') return `cash:${row.id || row.code || row.date || index}`;
  if (mode === 'products') return `products:${row.id || row.name || 'item'}:${index}`;
  if (mode === 'payments') return `payments:${row.method || index}`;
  if (mode === 'customers') return `customers:${row.id || row.name || 'cliente'}:${index}`;
  if (mode === 'purchases') return `purchases:${row.id || row.document || row.date || index}`;
  if (mode === 'stock') return `stock:${row.code || row.id || row.name || index}`;
  if (mode === 'dre') return `dre:${row.key || index}`;
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

type CashFlowDay = {
  date: string;
  realized_in: number;
  forecast_in: number;
  realized_out: number;
  forecast_out: number;
  balance: number;
  realized_balance?: number;
  projected_balance?: number;
  items?: Array<{
    kind: 'in' | 'out';
    realized: boolean;
    label: string;
    amount: number;
    category?: string;
  }>;
};

type CashFlowData = {
  opening_balance: number;
  realized_closing_balance?: number;
  closing_balance: number;
  totals: {
    realized_in: number;
    forecast_in: number;
    realized_out: number;
    forecast_out: number;
    net: number;
  };
  rows: CashFlowDay[];
  last_sync_at?: string | null;
};

const METHODS = ['Dinheiro', 'Pix', 'Débito', 'Crédito', 'Outros'];

export default function Reports() {
  const { width } = useWindowDimensions();
  const compactReports = width < 900;
  const { branding } = useBranding();
  const [data, setData] = useState<ReportsData | null>(null);
  const [cash, setCash] = useState<CashData | null>(null);
  const [cashFlow, setCashFlow] = useState<CashFlowData | null>(null);
  const [customers, setCustomers] = useState<CustomersData | null>(null);
  const [finance, setFinance] = useState<FinanceData | null>(null);
  const [stock, setStock] = useState<StockData | null>(null);
  const [purchases, setPurchases] = useState<PurchasesData | null>(null);
  const [dre, setDre] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [financeReportMode, setFinanceReportMode] = useState<
    'category' | 'payable_open' | 'receivable_open' | 'payable_paid' | 'receivable_paid'
  >('category');
  const [selectedReportId, setSelectedReportId] = useState('sales-performance');
  const [financeSelected, setFinanceSelected] = useState<Record<string, boolean>>({});
  const [reportSelected, setReportSelected] = useState<Record<string, boolean>>({});

  const today = isoFromDate(new Date());

  const printReport = (
    title: string,
    subtitle: string,
    headers: string[],
    rows: Array<Array<string | number>>,
    recordCount?: number
  ) => printRows(title, subtitle, headers, rows, branding, recordCount);

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
        cashFlowResult,
        customersResult,
        financeResult,
        stockResult,
        purchasesResult,
        dreResult,
      ] = await Promise.all([
        getReports(appliedStart, appliedEnd),
        getFull<CashData>('cash').catch(() => null),
        getCashFlow(appliedStart, appliedEnd).catch(() => null),
        getFull<CustomersData>('customers').catch(() => null),
        getFull<FinanceData>('finance').catch(() => null),
        getFull<StockData>('stock').catch(() => null),
        getFull<PurchasesData>('purchases').catch(() => null),
        getManagerialDre(appliedStart, appliedEnd).catch(() => null),
      ]);

      setData(reportsResult);
      setCash(cashResult);
      setCashFlow(cashFlowResult);
      setCustomers(customersResult);
      setFinance(financeResult);
      setStock(stockResult);
      setPurchases(purchasesResult);
      setDre(dreResult);
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

    const performanceEnd = appliedEnd < today ? appliedEnd : today;
    const startDate = new Date(`${appliedStart}T00:00:00`);
    const endDate = new Date(`${performanceEnd}T00:00:00`);
    const calendarDays = performanceEnd >= appliedStart
      ? Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1
      : 0;

    return {
      sales,
      total,
      ticket: sales > 0 ? total / sales : 0,
      activeDays: periodDays.filter((row) => Number(row.sales || 0) > 0).length,
      dailyAverage: calendarDays > 0 ? total / calendarDays : 0,
      calendarDays,
    };
  }, [periodDays, appliedStart, appliedEnd, today]);

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

  const cashFlowSummary = useMemo(() => {
    const totals = cashFlow?.totals;
    return {
      realizedIn: Number(totals?.realized_in || 0),
      forecastIn: Number(totals?.forecast_in || 0),
      realizedOut: Number(totals?.realized_out || 0),
      forecastOut: Number(totals?.forecast_out || 0),
      closingBalance: Number(cashFlow?.closing_balance || 0),
    };
  }, [cashFlow]);

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
    if (detailMode === 'dre') return dre?.rows || [];
    return [];
  }, [detailMode, periodDays, cashClosings, productsAbc, paymentBreakdown, customerRanking, purchaseRows, stockAlerts, dre]);

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
      id: 'managerial-dre',
      category: 'finance' as const,
      group: 'Financeiro',
      icon: 'layers' as const,
      color: '#3568B8',
      background: '#EEF4FC',
      title: 'DRE gerencial',
      description: 'Receitas, custos, despesas e resultado pelo regime de competência.',
      value: money(dre?.rows?.find((row: any) => row.key === 'net_result')?.value || 0),
      subtitle: Number(dre?.quality?.categories_to_review || 0) > 0
        ? `${dre.quality.categories_to_review} categoria(s) para revisar`
        : periodLabel,
      onPress: () => setDetailMode('dre' as const),
    },
    {
      id: 'cash',
      category: 'cash' as const,
      group: 'Caixa',
      icon: 'briefcase' as const,
      color: '#66717D',
      background: '#F2F4F5',
      title: 'Movimentação de caixa',
      description: 'Entradas, saídas, saldo diário e saldo projetado ao final do período.',
      value: money(cashFlowSummary.closingBalance),
      subtitle: `Entradas ${money(cashFlowSummary.realizedIn + cashFlowSummary.forecastIn)} • saídas ${money(cashFlowSummary.realizedOut + cashFlowSummary.forecastOut)}`,
      onPress: () => setDetailMode('cash' as const),
    },
    {
      id: 'purchases',
      category: 'purchases' as const,
      group: 'Compras',
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
      category: 'stock' as const,
      group: 'Estoque',
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

  const selectedReport = reportCatalog.find((report) => report.id === selectedReportId) || reportCatalog[0];
  const reportOptions = reportCatalog.map((report) => ({
    label: report.title,
    value: report.id,
    description: `${report.group} • ${report.description}`,
  }));

  const inlineFinanceEntries = useMemo(() => {
    if (!['payables', 'receivables'].includes(selectedReportId)) return [];
    const type = selectedReportId === 'payables' ? 'payable' : 'receivable';
    const settled = financeReportMode === 'payable_paid' || financeReportMode === 'receivable_paid';
    return (finance?.entries || []).filter((entry: any) => {
      if (entry.type !== type) return false;
      if (settled) {
        const expectedStatus = type === 'payable' ? 'paid' : 'received';
        const referenceDate = entry.settlement_date || entry.due_date;
        return entry.status === expectedStatus && referenceDate >= appliedStart && referenceDate <= appliedEnd;
      }
      return ['open', 'overdue'].includes(entry.status) && entry.due_date >= appliedStart && entry.due_date <= appliedEnd;
    });
  }, [finance, selectedReportId, financeReportMode, appliedStart, appliedEnd]);

  const inlineFinanceTitle = ['payables', 'receivables'].includes(selectedReportId)
    ? financeModeLabel(financeReportMode)
    : selectedReport.title;
  const inlineFinanceTotal = inlineFinanceEntries.reduce(
    (sum: number, row: any) => sum + Number(row.amount || 0),
    0
  );

  const inlineRows = useMemo(() => {
    if (selectedReportId === 'sales-performance') return periodDays.map((row: any) => ({ id: row.date, primary: dateBR(row.date), secondary: `${row.sales || 0} venda(s)`, value: money(row.total) }));
    if (selectedReportId === 'products') return productsAbc.map((row: any, index) => ({ id: `${row.name}-${index}`, primary: row.name, secondary: `${qtyLabel(row.qty)} vendido(s) • Curva ${row.tier}`, value: money(row.revenue) }));
    if (selectedReportId === 'payments') return paymentBreakdown.map((row: any) => ({ id: row.method, primary: row.method, secondary: `${row.percent.toFixed(1).replace('.', ',')}% do faturamento`, value: money(row.value) }));
    if (selectedReportId === 'customers') return customerRanking.map((row: any, index) => ({ id: `${row.name}-${index}`, primary: row.name, secondary: `${row.purchases} compra(s) • Curva ${row.tier}`, value: money(row.total) }));
    if (selectedReportId === 'payables' || selectedReportId === 'receivables') {
      const settled = financeReportMode === 'payable_paid' || financeReportMode === 'receivable_paid';
      return inlineFinanceEntries.map((row: any) => ({
        id: String(row.id),
        primary: row.description || (selectedReportId === 'payables' ? 'Conta a pagar' : 'Conta a receber'),
        secondary: `${row.category || 'Sem categoria'} • ${settled ? (selectedReportId === 'payables' ? 'paga' : 'recebida') : 'vence'} em ${dateBR(settled ? (row.settlement_date || row.due_date) : row.due_date)}`,
        value: money(row.amount),
      }));
    }
    if (selectedReportId === 'finance-categories') return financeCategoryRows.map((row: any) => ({ id: row.selectionKey, primary: row.category, secondary: `${row.reportType} • ${row.count} lançamento(s)`, value: money(row.total) }));
    if (selectedReportId === 'managerial-dre') return (dre?.rows || []).map((row: any) => ({
      id: row.key,
      primary: row.label,
      secondary: row.key === 'gross_profit'
        ? `Margem bruta ${dre?.quality?.gross_margin_percent == null ? 'indisponível' : `${Number(dre.quality.gross_margin_percent).toFixed(1).replace('.', ',')}%`}`
        : row.kind === 'result' ? 'Resultado líquido do período' : row.kind === 'subtotal' ? 'Subtotal gerencial' : 'Regime de competência',
      value: money(row.value),
      kind: row.kind,
      statementKey: row.key,
      tone: Number(row.value) < 0 && ['subtotal', 'result'].includes(row.kind) ? 'danger' : row.kind === 'result' ? 'success' : 'default',
    }));
    if (selectedReportId === 'cash') return (cashFlow?.rows || []).map((row: CashFlowDay) => {
      const entries = Number(row.realized_in || 0) + Number(row.forecast_in || 0);
      const exits = Number(row.realized_out || 0) + Number(row.forecast_out || 0);
      return {
        id: row.date,
        primary: dateBR(row.date),
        secondary: `Entradas ${money(entries)} • saídas ${money(exits)} • realizado ${money(row.realized_balance ?? row.balance)}`,
        value: `Projetado ${money(row.projected_balance ?? row.balance)}`,
        tone: Number(row.projected_balance ?? row.balance ?? 0) < 0 ? 'danger' : 'default',
      };
    });
    if (selectedReportId === 'purchases') return purchaseRows.map((row: any) => ({ id: String(row.id), primary: row.supplier || row.description || `Compra #${row.number || row.id}`, secondary: `${dateBR(row.date)} • ${row.status || 'Recebida'}`, value: money(row.total) }));
    return stockAlerts.map((row: any) => ({ id: String(row.id || row.code), primary: row.name, secondary: `${row.category || 'Sem categoria'} • mínimo ${row.minimum || 0}`, value: `${row.stock || 0} em estoque`, tone: row.status === 'Negativo' ? 'danger' : 'default' }));
  }, [selectedReportId, periodDays, productsAbc, paymentBreakdown, customerRanking, inlineFinanceEntries, financeReportMode, financeCategoryRows, dre, cashFlow, purchaseRows, stockAlerts]);

  useEffect(() => {
    setReportSelected(Object.fromEntries(inlineRows.map((row: any) => [String(row.id), true])));
  }, [selectedReportId, inlineRows.map((row: any) => row.id).join('|')]);

  const selectedInlineRows = inlineRows.filter((row: any) => reportSelected[String(row.id)]);
  const reportGroups = ['Vendas e clientes', 'Financeiro', 'Caixa', 'Compras', 'Estoque'];

  function exportInlinePdf() {
    if (selectedReportId === 'sales-performance') {
      const selectedIds = new Set(selectedInlineRows.map((row: any) => String(row.id)));
      const rows = periodDays.filter((row) => selectedIds.has(String(row.date)));
      const selectedSales = rows.reduce((sum, row) => sum + Number(row.sales || 0), 0);
      const selectedRevenue = rows.reduce((sum, row) => sum + Number(row.total || 0), 0);
      printReport(
        selectedReport.title,
        periodLabel,
        ['Data', 'Quantidade de vendas', 'Faturamento', 'Ticket médio'],
        [
          ...rows.map((row) => [dateBR(row.date), row.sales || 0, money(row.total), money(row.ticket)]),
          ['TOTAL SELECIONADO', selectedSales, money(selectedRevenue), money(selectedSales > 0 ? selectedRevenue / selectedSales : 0)],
        ],
        rows.length
      );
      return;
    }
    if (selectedReportId === 'cash') {
      const selectedIds = new Set(selectedInlineRows.map((row: any) => String(row.id)));
      const rows = (cashFlow?.rows || []).filter((row) => selectedIds.has(row.date));
      const selectedTotals = rows.reduce((totals, row) => ({
        realizedIn: totals.realizedIn + Number(row.realized_in || 0),
        forecastIn: totals.forecastIn + Number(row.forecast_in || 0),
        realizedOut: totals.realizedOut + Number(row.realized_out || 0),
        forecastOut: totals.forecastOut + Number(row.forecast_out || 0),
      }), { realizedIn: 0, forecastIn: 0, realizedOut: 0, forecastOut: 0 });
      const sortedRows = [...rows].sort((a, b) => a.date.localeCompare(b.date));
      const lastSelected = sortedRows[sortedRows.length - 1];
      printReport(
        selectedReport.title,
        periodLabel,
        ['Data', 'Entradas realizadas', 'Entradas previstas', 'Saídas realizadas', 'Saídas previstas', 'Saldo realizado', 'Saldo projetado'],
        [
          ...rows.map((row) => [dateBR(row.date), money(row.realized_in), money(row.forecast_in), money(row.realized_out), money(row.forecast_out), money(row.realized_balance ?? row.balance), money(row.projected_balance ?? row.balance)]),
          ['TOTAL / SALDO FINAL SELECIONADO', money(selectedTotals.realizedIn), money(selectedTotals.forecastIn), money(selectedTotals.realizedOut), money(selectedTotals.forecastOut), money(lastSelected?.realized_balance ?? lastSelected?.balance ?? 0), money(lastSelected?.projected_balance ?? lastSelected?.balance ?? 0)],
        ],
        rows.length
      );
      return;
    }
    if (selectedReportId === 'payables' || selectedReportId === 'receivables') {
      const selectedIds = new Set(selectedInlineRows.map((row: any) => String(row.id)));
      const settled = financeReportMode === 'payable_paid' || financeReportMode === 'receivable_paid';
      const rows = inlineFinanceEntries.filter((row: any) => selectedIds.has(String(row.id)));
      const total = rows.reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);
      printReport(
        inlineFinanceTitle,
        periodLabel,
        ['Descrição', 'Categoria', settled ? (selectedReportId === 'payables' ? 'Pagamento' : 'Recebimento') : 'Vencimento', 'Situação', 'Valor'],
        [
          ...rows.map((row: any) => [
            row.description || (selectedReportId === 'payables' ? 'Conta a pagar' : 'Conta a receber'),
            row.category || 'Sem categoria',
            dateBR(settled ? (row.settlement_date || row.due_date) : row.due_date),
            statusLabelPt(row.status),
            money(row.amount),
          ]),
          ['TOTAL SELECIONADO', '', '', `${rows.length} registro(s)`, money(total)],
        ],
        rows.length
      );
      return;
    }
    printReport(selectedReport.title, periodLabel, ['Descrição', 'Detalhes', 'Valor'], selectedInlineRows.map((row: any) => [row.primary, row.secondary, row.value]));
  }

  function exportInlineCsv() {
    if (selectedReportId === 'sales-performance') {
      const selectedIds = new Set(selectedInlineRows.map((row: any) => String(row.id)));
      const rows = periodDays.filter((row) => selectedIds.has(String(row.date)));
      const selectedSales = rows.reduce((sum, row) => sum + Number(row.sales || 0), 0);
      const selectedRevenue = rows.reduce((sum, row) => sum + Number(row.total || 0), 0);
      downloadCsv(
        `relatorio_desempenho_vendas_${appliedStart}_${appliedEnd}.csv`,
        ['Data', 'Quantidade de vendas', 'Faturamento', 'Ticket médio'],
        [
          ...rows.map((row) => [dateBR(row.date), row.sales || 0, row.total || 0, row.ticket || 0]),
          ['TOTAL SELECIONADO', selectedSales, selectedRevenue, selectedSales > 0 ? selectedRevenue / selectedSales : 0],
        ]
      );
      return;
    }
    if (selectedReportId === 'cash') {
      const selectedIds = new Set(selectedInlineRows.map((row: any) => String(row.id)));
      const rows = (cashFlow?.rows || []).filter((row) => selectedIds.has(row.date));
      const selectedTotals = rows.reduce((totals, row) => ({
        realizedIn: totals.realizedIn + Number(row.realized_in || 0),
        forecastIn: totals.forecastIn + Number(row.forecast_in || 0),
        realizedOut: totals.realizedOut + Number(row.realized_out || 0),
        forecastOut: totals.forecastOut + Number(row.forecast_out || 0),
      }), { realizedIn: 0, forecastIn: 0, realizedOut: 0, forecastOut: 0 });
      const sortedRows = [...rows].sort((a, b) => a.date.localeCompare(b.date));
      const lastSelected = sortedRows[sortedRows.length - 1];
      downloadCsv(
        `relatorio_fluxo_caixa_${appliedStart}_${appliedEnd}.csv`,
        ['Data', 'Entradas realizadas', 'Entradas previstas', 'Saídas realizadas', 'Saídas previstas', 'Saldo realizado', 'Saldo projetado'],
        [
          ...rows.map((row) => [dateBR(row.date), row.realized_in, row.forecast_in, row.realized_out, row.forecast_out, row.realized_balance ?? row.balance, row.projected_balance ?? row.balance]),
          ['TOTAL / SALDO FINAL SELECIONADO', selectedTotals.realizedIn, selectedTotals.forecastIn, selectedTotals.realizedOut, selectedTotals.forecastOut, lastSelected?.realized_balance ?? lastSelected?.balance ?? 0, lastSelected?.projected_balance ?? lastSelected?.balance ?? 0],
        ]
      );
      return;
    }
    if (selectedReportId === 'payables' || selectedReportId === 'receivables') {
      const selectedIds = new Set(selectedInlineRows.map((row: any) => String(row.id)));
      const settled = financeReportMode === 'payable_paid' || financeReportMode === 'receivable_paid';
      const rows = inlineFinanceEntries.filter((row: any) => selectedIds.has(String(row.id)));
      const total = rows.reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);
      downloadCsv(
        `relatorio_${financeReportMode}_${appliedStart}_${appliedEnd}.csv`,
        ['Descrição', 'Categoria', settled ? (selectedReportId === 'payables' ? 'Pagamento' : 'Recebimento') : 'Vencimento', 'Situação', 'Valor'],
        [
          ...rows.map((row: any) => [
            row.description || (selectedReportId === 'payables' ? 'Conta a pagar' : 'Conta a receber'),
            row.category || 'Sem categoria',
            settled ? (row.settlement_date || row.due_date) : row.due_date,
            statusLabelPt(row.status),
            row.amount,
          ]),
          ['TOTAL SELECIONADO', '', '', `${rows.length} registro(s)`, total],
        ]
      );
      return;
    }
    downloadCsv(`relatorio_${selectedReportId}_${appliedStart}_${appliedEnd}.csv`, ['Descrição', 'Detalhes', 'Valor'], selectedInlineRows.map((row: any) => [row.primary, row.secondary, row.value]));
  }

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

      {!!data && (
        <View style={[styles.reportsWorkspace, compactReports && styles.reportsWorkspaceCompact]}>
          <View style={[styles.reportsNavigation, compactReports && styles.reportsNavigationCompact]}>
            <Text style={styles.navigationTitle}>Relatórios</Text>
            {reportGroups.map((group) => (
              <View key={group} style={styles.navigationGroup}>
                <Text style={styles.navigationGroupTitle}>{group}</Text>
                {reportCatalog.filter((report) => report.group === group).map((report) => (
                  <Pressable key={report.id} onPress={() => {
                    setSelectedReportId(report.id);
                    if (report.id === 'payables') setFinanceReportMode('payable_open');
                    if (report.id === 'receivables') setFinanceReportMode('receivable_open');
                    setDetailMode(null);
                  }} style={[styles.navigationItem, selectedReportId === report.id && styles.navigationItemActive]}>
                    <Feather name={report.icon} size={15} color={selectedReportId === report.id ? report.color : theme.colors.muted} />
                    <Text style={[styles.navigationItemText, selectedReportId === report.id && styles.navigationItemTextActive]}>{report.title}</Text>
                  </Pressable>
                ))}
              </View>
            ))}
          </View>

          <View style={[styles.inlineReport, compactReports && styles.inlineReportCompact]}>
            <View style={styles.inlineReportHeader}>
              <View style={styles.inlineTitleArea}>
                <View style={[styles.iconCircle, { backgroundColor: selectedReport.background }]}><Feather name={selectedReport.icon} size={20} color={selectedReport.color} /></View>
                <View style={styles.selectedReportMain}>
                  <Text style={styles.selectedReportGroup}>{selectedReport.group}</Text>
                  <Text style={styles.inlineTitle}>{inlineFinanceTitle}</Text>
                  <Text style={styles.selectedReportDescription}>{selectedReport.description}</Text>
                </View>
              </View>
              <View style={styles.inlineHeaderActions}>
                <PeriodCalendar
                  start={appliedStart}
                  end={appliedEnd}
                  compact
                  label="Período"
                  onApply={(start, end, preset: PeriodPreset) => {
                    setAppliedStart(start); setAppliedEnd(end); setStartInput(isoToBR(start)); setEndInput(isoToBR(end)); setPeriod(preset as PeriodKey); setAppliedNotice(`Período aplicado: ${isoToBR(start)} a ${isoToBR(end)}`);
                  }}
                />
                <Pressable style={styles.inlineExportButton} onPress={exportInlinePdf}><Feather name="printer" size={15} color={theme.colors.text} /><Text style={styles.inlineExportButtonText}>PDF</Text></Pressable>
                <Pressable style={styles.inlineExportButton} onPress={exportInlineCsv}><Feather name="download" size={15} color={theme.colors.text} /><Text style={styles.inlineExportButtonText}>Excel</Text></Pressable>
              </View>
            </View>

            {selectedReportId === 'payables' && (
              <View style={styles.inlineFinanceModes}>
                <PeriodButton label="Em aberto e vencidas" active={financeReportMode === 'payable_open'} onPress={() => setFinanceReportMode('payable_open')} />
                <PeriodButton label="Contas pagas" active={financeReportMode === 'payable_paid'} onPress={() => setFinanceReportMode('payable_paid')} />
              </View>
            )}

            {selectedReportId === 'receivables' && (
              <View style={styles.inlineFinanceModes}>
                <PeriodButton label="Em aberto e vencidas" active={financeReportMode === 'receivable_open'} onPress={() => setFinanceReportMode('receivable_open')} />
                <PeriodButton label="Contas recebidas" active={financeReportMode === 'receivable_paid'} onPress={() => setFinanceReportMode('receivable_paid')} />
              </View>
            )}

            <View style={styles.inlineSummary}>
              <View><Text style={styles.inlineSummaryLabel}>RESULTADO PRINCIPAL</Text><Text style={styles.inlineSummaryValue}>{['payables', 'receivables'].includes(selectedReportId) ? money(inlineFinanceTotal) : selectedReport.value}</Text><Text style={styles.inlineSummaryDetail}>{['payables', 'receivables'].includes(selectedReportId) ? `${inlineFinanceEntries.length} lançamento(s) no período` : selectedReport.subtitle}</Text></View>
              <View style={styles.selectionActions}><Text style={styles.selectionCount}>{selectedInlineRows.length} de {inlineRows.length} selecionado(s)</Text><Pressable onPress={() => setReportSelected(Object.fromEntries(inlineRows.map((row: any) => [String(row.id), true])))}><Text style={styles.selectionLink}>Selecionar todos</Text></Pressable><Pressable onPress={() => setReportSelected({})}><Text style={styles.selectionLink}>Limpar</Text></Pressable></View>
            </View>

            {selectedReportId === 'sales-performance' && (
              <View style={styles.salesKpiGrid}>
                {[
                  { label: 'Faturamento', value: money(salesSummary.total), note: periodLabel },
                  { label: 'Vendas', value: String(salesSummary.sales), note: `${salesSummary.activeDays} dia(s) com movimento` },
                  { label: 'Ticket médio', value: money(salesSummary.ticket), note: 'Valor médio por venda' },
                  { label: 'Média diária', value: money(salesSummary.dailyAverage), note: `Considera ${salesSummary.calendarDays} dia(s) decorridos no período` },
                ].map((item) => (
                  <View key={item.label} style={styles.salesKpiCard}>
                    <Text style={styles.salesKpiLabel}>{item.label}</Text>
                    <Text style={styles.salesKpiValue}>{item.value}</Text>
                    <Text style={styles.salesKpiNote}>{item.note}</Text>
                  </View>
                ))}
              </View>
            )}

            {selectedReportId === 'managerial-dre' && (
              <View style={styles.dreInlineContext}>
                <View style={styles.dreInlineQuality}>
                  <Feather
                    name={dreNeedsReview(dre?.quality) ? 'alert-triangle' : 'check-circle'}
                    size={17}
                    color={dreNeedsReview(dre?.quality) ? '#9A6A12' : theme.colors.success}
                  />
                  <View style={styles.inlineRowMain}>
                    <Text style={styles.dreInlineTitle}>
                      {dreNeedsReview(dre?.quality)
                        ? 'Resultado sujeito a revisão'
                        : 'Base do DRE consistente para o período'}
                    </Text>
                    <Text style={styles.dreInlineText}>
                      {Number(dre?.quality?.categories_to_review || 0)} categoria(s) para revisar • {Number(dre?.quality?.unmapped_entries || 0)} lançamento(s) sem mapeamento • {dreCostQualityText(dre?.quality)}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            <ScrollView style={styles.inlineRows} nestedScrollEnabled>
              {inlineRows.map((row: any) => {
                const checked = !!reportSelected[String(row.id)];
                return <Pressable key={String(row.id)} onPress={() => setReportSelected((current) => ({ ...current, [String(row.id)]: !checked }))} style={[
                  styles.inlineRow,
                  row.kind === 'subtotal' && styles.inlineRowSubtotal,
                  row.kind === 'result' && styles.inlineRowResult,
                  row.kind === 'result' && row.tone === 'danger' && styles.inlineRowResultDanger,
                ]}>
                  <View style={[styles.inlineCheckbox, checked && { backgroundColor: selectedReport.color, borderColor: selectedReport.color }]}>{checked && <Feather name="check" size={13} color="#FFF" />}</View>
                  <View style={styles.inlineRowMain}><Text style={styles.inlineRowTitle}>{row.primary}</Text><Text style={styles.inlineRowDetail}>{row.secondary}</Text></View>
                  <Text style={[styles.inlineRowValue, row.tone === 'danger' && styles.inlineRowDanger, row.tone === 'success' && styles.inlineRowSuccess]}>{row.value}</Text>
                </Pressable>;
              })}
              {inlineRows.length === 0 && <View style={styles.inlineEmpty}><Feather name="inbox" size={24} color={theme.colors.muted} /><Text style={styles.inlineEmptyTitle}>Nenhum dado neste período</Text><Text style={styles.inlineEmptyText}>Altere o período para consultar outros resultados.</Text></View>}
            </ScrollView>
          </View>
        </View>
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
                              ? `baixado em ${dateBR(row.settlement_date)}${row.settlement_date_inferred ? ' (data de referência)' : ''}`
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
        visible={detailMode === 'dre'}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailMode(null)}
      >
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <ModalHeader
              title="DRE gerencial"
              subtitle={`${periodLabel} • regime de competência`}
              onClose={() => setDetailMode(null)}
              onPrint={() => printReport(
                'DRE gerencial',
                `${periodLabel} • regime de competência`,
                ['Linha', 'Valor'],
                selectedReportRows.map((row) => [row.label, money(row.value)])
              )}
              onExcel={() => downloadCsv(
                `dre_gerencial_${appliedStart}_${appliedEnd}.csv`,
                ['Linha', 'Valor'],
                selectedReportRows.map((row) => [row.label, row.value])
              )}
            />

            <ReportSelectionBar
              selected={selectedReportRows.length}
              total={(dre?.rows || []).length}
              onSelectAll={() => selectAllReportRows(true)}
              onClear={() => selectAllReportRows(false)}
            />

            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalBody}>
              {dreNeedsReview(dre?.quality) && (
                <View style={styles.dreNotice}>
                  <Feather name="alert-circle" size={18} color="#9A6A12" />
                  <View style={styles.dayMain}>
                    <Text style={styles.dreNoticeTitle}>Revise a base antes de usar o resultado como definitivo</Text>
                    <Text style={styles.dreNoticeText}>
                      {Number(dre?.quality?.categories_to_review || 0)} categoria(s) ainda usam classificação automática; {Number(dre?.quality?.unmapped_entries || 0)} lançamento(s) estão sem categoria mapeada. {dreCostQualityText(dre?.quality)}.
                    </Text>
                  </View>
                </View>
              )}

              <View style={styles.dreTable}>
                {(dre?.rows || []).map((row: any, index: number) => (
                  <View key={row.key} style={[
                    styles.dreRow,
                    row.kind === 'subtotal' && styles.dreRowStrong,
                    row.key === 'gross_profit' && styles.dreRowGrossProfit,
                    row.kind === 'result' && styles.dreRowResult,
                    row.kind === 'result' && Number(row.value) < 0 && styles.dreRowResultDanger,
                  ]}>
                    <ReportCheckbox selected={!!reportSelected[reportRowKey('dre', row, index)]} onPress={() => toggleReportSelection(row, index)} />
                    <Text style={[styles.dreLabel, ['subtotal', 'result'].includes(row.kind) && styles.dreLabelStrong]}>{row.label}</Text>
                    <Text style={[
                      styles.dreValue,
                      Number(row.value) < 0 && styles.danger,
                      row.kind === 'result' && Number(row.value) >= 0 && styles.success,
                    ]}>{money(row.value)}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.dreMethod}>
                <Text style={styles.dreMethodTitle}>Critério do relatório</Text>
                {(dre?.notes || []).map((note: string) => <Text key={note} style={styles.dreMethodText}>• {note}</Text>)}
              </View>
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
        <View style={styles.reportAction}>
          <Text style={[styles.reportActionText, { color }]}>Visualizar relatório</Text>
          <Feather name="arrow-right" size={15} color={color} />
        </View>
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
                  Baixar PDF
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
  reportsWorkspace: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 12 },
  reportsWorkspaceCompact: { flexDirection: 'column' },
  reportsNavigation: { width: 230, flexGrow: 0, flexShrink: 0, padding: 10, backgroundColor: '#FFF', borderWidth: 1, borderColor: theme.colors.border, borderRadius: 14 },
  reportsNavigationCompact: { width: '100%' },
  navigationTitle: { paddingHorizontal: 8, paddingVertical: 8, fontFamily: 'Sora_700Bold', fontSize: 17, color: theme.colors.text },
  navigationGroup: { marginTop: 8 }, navigationGroupTitle: { paddingHorizontal: 8, paddingVertical: 6, fontFamily: 'Inter_700Bold', fontSize: 10.5, letterSpacing: .65, textTransform: 'uppercase', color: theme.colors.muted },
  navigationItem: { minHeight: 42, paddingHorizontal: 9, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }, navigationItemActive: { backgroundColor: '#EEF4FC' },
  navigationItemText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 12.5, color: theme.colors.text }, navigationItemTextActive: { fontFamily: 'Inter_700Bold', color: '#285DA9' },
  inlineReport: { flex: 1, minWidth: 500, overflow: 'hidden', backgroundColor: '#FFF', borderWidth: 1, borderColor: theme.colors.border, borderRadius: 14 },
  inlineReportCompact: { width: '100%', minWidth: 0 },
  inlineReportHeader: { padding: 16, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  inlineTitleArea: { flex: 1, minWidth: 280, flexDirection: 'row', alignItems: 'flex-start', gap: 11 }, inlineTitle: { marginTop: 3, fontFamily: 'Sora_700Bold', fontSize: 19, color: theme.colors.text },
  inlineHeaderActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: 7 },
  inlineExportButton: { minHeight: 42, paddingHorizontal: 11, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 9, flexDirection: 'row', alignItems: 'center', gap: 6 }, inlineExportButtonText: { fontFamily: 'Inter_700Bold', fontSize: 12, color: theme.colors.text },
  inlineSummary: { padding: 15, backgroundColor: '#F8F8F6', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  inlineFinanceModes: { paddingHorizontal: 15, paddingVertical: 10, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  inlineSummaryLabel: { fontFamily: 'Inter_700Bold', fontSize: 10.5, letterSpacing: .6, color: theme.colors.muted }, inlineSummaryValue: { marginTop: 4, fontFamily: 'Sora_700Bold', fontSize: 21, color: theme.colors.text }, inlineSummaryDetail: { marginTop: 3, fontFamily: 'Inter_400Regular', fontSize: 12.5, color: theme.colors.muted },
  salesKpiGrid: { backgroundColor: '#F8F8F6', borderBottomColor: theme.colors.border, borderBottomWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 15 },
  salesKpiCard: { backgroundColor: '#FFF', borderColor: theme.colors.border, borderRadius: 11, borderWidth: 1, flex: 1, minWidth: 165, paddingHorizontal: 12, paddingVertical: 11 },
  salesKpiLabel: { color: theme.colors.muted, fontFamily: 'Inter_700Bold', fontSize: 10.5, letterSpacing: .45, textTransform: 'uppercase' },
  salesKpiValue: { color: theme.colors.text, fontFamily: 'Sora_700Bold', fontSize: 17, marginTop: 4 },
  salesKpiNote: { color: theme.colors.muted, fontFamily: 'Inter_400Regular', fontSize: 11.5, marginTop: 3 },
  dreInlineContext: { paddingHorizontal: 15, paddingTop: 12 },
  dreInlineQuality: { alignItems: 'flex-start', backgroundColor: '#FFF8E8', borderColor: '#E8D3A4', borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 9, padding: 11 },
  dreInlineTitle: { color: theme.colors.text, fontFamily: 'Inter_700Bold', fontSize: 12.5 },
  dreInlineText: { color: theme.colors.muted, fontFamily: 'Inter_400Regular', fontSize: 11.5, lineHeight: 17, marginTop: 2 },
  selectionCount: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: theme.colors.muted }, inlineRows: { maxHeight: 590 }, inlineRow: { minHeight: 66, paddingHorizontal: 15, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: 'row', alignItems: 'center', gap: 11 },
  inlineRowSubtotal: { backgroundColor: '#F3F6F8' },
  inlineRowResult: { backgroundColor: '#EAF2FC', borderTopColor: '#AFC7E8', borderTopWidth: 2 },
  inlineRowResultDanger: { backgroundColor: '#FFF0F0', borderTopColor: '#E5B5B7' },
  inlineCheckbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' }, inlineRowMain: { flex: 1, minWidth: 0 }, inlineRowTitle: { fontFamily: 'Inter_700Bold', fontSize: 13.5, color: theme.colors.text }, inlineRowDetail: { marginTop: 3, fontFamily: 'Inter_400Regular', fontSize: 12, color: theme.colors.muted }, inlineRowValue: { fontFamily: 'Inter_700Bold', fontSize: 13.5, color: theme.colors.text, textAlign: 'right' }, inlineRowDanger: { color: theme.colors.danger }, inlineRowSuccess: { color: theme.colors.success },
  inlineEmpty: { minHeight: 230, padding: 30, alignItems: 'center', justifyContent: 'center' }, inlineEmptyTitle: { marginTop: 9, fontFamily: 'Sora_700Bold', fontSize: 15, color: theme.colors.text }, inlineEmptyText: { marginTop: 4, fontFamily: 'Inter_400Regular', fontSize: 12.5, color: theme.colors.muted },
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
    fontFamily: 'Inter_700Bold',
    fontSize: 11.5,
    letterSpacing: 0.35,
  },

  periodTitle: {
    color: theme.colors.text,
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    marginTop: 2,
  },

  periodButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  periodSelect: {
    minWidth: 260,
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
    fontFamily: 'Inter_700Bold',
    fontSize: 11.5,
    letterSpacing: 0.5,
    color: theme.colors.muted,
  },

  catalogTitle: {
    marginTop: 3,
    fontFamily: 'Sora_700Bold',
    fontSize: 19,
    color: theme.colors.text,
  },

  catalogSubtitle: {
    marginTop: 5,
    maxWidth: 720,
    fontSize: 13,
    lineHeight: 19,
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
    fontSize: 11.5,
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
    fontSize: 11.5,
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

  reportFlow: {
    backgroundColor: '#FFF',
    borderColor: theme.colors.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: 18,
    padding: 18,
  },

  flowHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
    justifyContent: 'space-between',
  },

  flowSteps: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  flowStep: {
    alignItems: 'center',
    backgroundColor: '#F5F6F7',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },

  flowStepDone: {
    alignItems: 'center',
    backgroundColor: '#EAF7F0',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },

  flowStepActive: {
    alignItems: 'center',
    backgroundColor: '#EEF4FC',
    borderColor: '#BED0EA',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  flowStepNumber: {
    color: theme.colors.success,
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
  },

  flowStepNumberActive: {
    color: '#3568B8',
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
  },

  flowStepNumberMuted: {
    color: theme.colors.muted,
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
  },

  flowStepText: {
    color: theme.colors.muted,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },

  flowStepTextActive: {
    color: '#285A9D',
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
  },

  reportChooser: {
    alignItems: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },

  reportPickerColumn: {
    flex: 1,
    minWidth: 280,
  },

  chooserHelp: {
    color: theme.colors.muted,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    marginTop: 7,
  },

  selectedReportCard: {
    alignItems: 'center',
    backgroundColor: '#F7F8F9',
    borderColor: theme.colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flex: 1.35,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    minWidth: 340,
    padding: 14,
  },

  selectedReportMain: {
    flex: 1,
    minWidth: 190,
  },

  selectedReportGroup: {
    color: theme.colors.muted,
    fontFamily: 'Inter_700Bold',
    fontSize: 11.5,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },

  selectedReportTitle: {
    color: theme.colors.text,
    fontFamily: 'Sora_700Bold',
    fontSize: 16,
    marginTop: 3,
  },

  selectedReportDescription: {
    color: theme.colors.muted,
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },

  openReportButton: {
    alignItems: 'center',
    backgroundColor: '#17202A',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 15,
    paddingVertical: 11,
  },

  openReportButtonText: {
    color: '#FFF',
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
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
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
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
    fontSize: 14,
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
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12.5,
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
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
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
    minHeight: 102,
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
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: theme.colors.text,
  },

  reportDescription: {
    color: theme.colors.muted,
    fontSize: 12.5,
    lineHeight: 18,
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
    fontSize: 11.5,
    color: theme.colors.muted,
  },

  reportAction: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    marginTop: 8,
  },

  reportActionText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12.5,
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

  success: {
    color: theme.colors.success,
  },

  dreNotice: {
    alignItems: 'flex-start',
    backgroundColor: '#FFF8E8',
    borderColor: '#E8D3A4',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 13,
  },

  dreNoticeTitle: {
    color: theme.colors.text,
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
  },

  dreNoticeText: {
    color: theme.colors.muted,
    fontFamily: 'Inter_400Regular',
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 3,
  },

  dreTable: {
    borderColor: theme.colors.border,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },

  dreRow: {
    alignItems: 'center',
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 48,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },

  dreRowStrong: {
    backgroundColor: '#F3F6F8',
  },

  dreRowGrossProfit: {
    backgroundColor: '#EDF8F2',
    borderTopColor: '#B9DEC9',
  },

  dreRowResult: {
    backgroundColor: '#EAF2FC',
    borderTopColor: '#AFC7E8',
    borderTopWidth: 2,
    minHeight: 56,
  },

  dreRowResultDanger: {
    backgroundColor: '#FFF0F0',
    borderTopColor: '#E5B5B7',
  },

  dreLabel: {
    color: theme.colors.text,
    flex: 1,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13.5,
  },

  dreLabelStrong: {
    fontFamily: 'Inter_700Bold',
  },

  dreValue: {
    color: theme.colors.text,
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    textAlign: 'right',
  },

  dreMethod: {
    backgroundColor: '#F7F8F9',
    borderRadius: 12,
    gap: 5,
    padding: 13,
  },

  dreMethodTitle: {
    color: theme.colors.text,
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
  },

  dreMethodText: {
    color: theme.colors.muted,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 18,
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
