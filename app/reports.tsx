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

import { AdminShell } from '@/components/AdminShell';
import { theme } from '@/constants/theme';
import { getReports } from '@/services/api';
import { getFull } from '@/services/fullApi';
import type { CustomersData, FinanceData, ReportsData, StockData } from '@/types/api';

const money = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value || 0));

const dateBR = (value: string) =>
  value
    ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR')
    : '—';

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

const formatDateInput = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 8);

  if (digits.length <= 2) {
    return digits;
  }

  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }

  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

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
    /[&<>]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string)
  );
}

function printRows(
  title: string,
  subtitle: string,
  headers: string[],
  rows: Array<Array<string | number>>
) {
  if (Platform.OS !== 'web') {
    return;
  }

  const head = `<tr>${headers
    .map((h) => `<th>${escapeHtml(h)}</th>`)
    .join('')}</tr>`;
  const body = rows
    .map(
      (row) =>
        `<tr>${row
          .map((cell) => `<td>${escapeHtml(cell)}</td>`)
          .join('')}</tr>`
    )
    .join('');

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(
    title
  )}</title><style>
    body{font-family:Arial,Helvetica,sans-serif;padding:24px;color:#171717}
    h1{font-size:18px;margin:0 0 4px}
    p{font-size:12px;color:#666;margin:0 0 18px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
    th{background:#f2f2f2}
  </style></head><body>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(subtitle)}</p>
    <table><thead>${head}</thead><tbody>${body}</tbody></table>
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

  setTimeout(() => {
    frameWindow.focus();
    frameWindow.print();
    setTimeout(() => document.body.removeChild(iframe), 1000);
  }, 300);
}

type PeriodKey =
  | 'today'
  | '7days'
  | '30days'
  | 'month'
  | 'year'
  | 'custom';

type DetailMode = 'sales' | 'cash' | 'products' | 'payments' | 'customers' | 'finance' | 'stock' | null;

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
  const [data, setData] = useState<ReportsData | null>(null);
  const [cash, setCash] = useState<CashData | null>(null);
  const [customers, setCustomers] = useState<CustomersData | null>(null);
  const [finance, setFinance] = useState<FinanceData | null>(null);
  const [stock, setStock] = useState<StockData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const today = isoFromDate(new Date());

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

      const reportsResult = await getReports(appliedStart, appliedEnd);

      // Caixa/Clientes/Financeiro só enriquecem relatórios extras;
      // perfis sem acesso a esses módulos ainda veem o resto normal.
      const cashResult = await getFull<CashData>('cash').catch(() => null);
      const customersResult = await getFull<CustomersData>('customers').catch(() => null);
      const financeResult = await getFull<FinanceData>('finance').catch(() => null);
      const stockResult = await getFull<StockData>('stock').catch(() => null);

      setData(reportsResult);
      setCash(cashResult);
      setCustomers(customersResult);
      setFinance(financeResult);
      setStock(stockResult);
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
    const start = brToIso(startInput.trim());
    const end = brToIso(endInput.trim());

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

    const grandTotal = ranked.reduce((sum, c) => sum + c.total, 0);

    return ranked.slice(0, 15).map((c) => ({
      ...c,
      percent: grandTotal > 0 ? (c.total / grandTotal) * 100 : 0,
    }));
  }, [customers, appliedStart, appliedEnd]);

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

  const stockAlerts = useMemo(() => {
    const rows = (stock?.rows || []).filter((r) => r.status !== 'OK');

    return rows.sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === 'Negativo' ? -1 : 1;
      }
      return a.stock - b.stock;
    });
  }, [stock]);

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
        <Text style={styles.periodTitle}>
          Período
        </Text>

        <View style={styles.periodButtons}>
          <PeriodButton
            label="Hoje"
            active={period === 'today'}
            onPress={() =>
              applyQuickPeriod('today')
            }
          />

          <PeriodButton
            label="7 dias"
            active={period === '7days'}
            onPress={() =>
              applyQuickPeriod('7days')
            }
          />

          <PeriodButton
            label="30 dias"
            active={period === '30days'}
            onPress={() =>
              applyQuickPeriod('30days')
            }
          />

          <PeriodButton
            label="Mês"
            active={period === 'month'}
            onPress={() =>
              applyQuickPeriod('month')
            }
          />

          <PeriodButton
            label="Ano"
            active={period === 'year'}
            onPress={() =>
              applyQuickPeriod('year')
            }
          />

          <PeriodButton
            label="Período"
            active={period === 'custom'}
            onPress={() =>
              applyQuickPeriod('custom')
            }
          />
        </View>

        {period === 'custom' && (
          <View style={styles.customArea}>
            <View style={styles.dateFields}>
              <View style={styles.dateField}>
                <Text style={styles.dateLabel}>
                  Data inicial
                </Text>

                <TextInput
                  value={startInput}
                  onChangeText={(value) => {
                    setStartInput(formatDateInput(value));
                    setPeriodError('');
                    setAppliedNotice('');
                  }}
                  placeholder="DD/MM/AAAA"
                  keyboardType="number-pad"
                  maxLength={10}
                  style={styles.input}
                />
              </View>

              <View style={styles.dateField}>
                <Text style={styles.dateLabel}>
                  Data final
                </Text>

                <TextInput
                  value={endInput}
                  onChangeText={(value) => {
                    setEndInput(formatDateInput(value));
                    setPeriodError('');
                    setAppliedNotice('');
                  }}
                  placeholder="DD/MM/AAAA"
                  keyboardType="number-pad"
                  maxLength={10}
                  style={styles.input}
                />
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

        <Text style={styles.selectedPeriod}>
          {periodLabel}
        </Text>
      </View>

      {!!data && (
        <View style={styles.reportCards}>
          <ReportCard
            icon="$"
            title="Faturamento"
            value={money(
              salesSummary.total
            )}
            subtitle={`${salesSummary.sales} venda(s) no período`}
            onPress={() =>
              setDetailMode('sales')
            }
          />

          <ReportCard
            icon="V"
            title="Qtd. de vendas"
            value={String(
              salesSummary.sales
            )}
            subtitle={`Ticket médio ${money(
              salesSummary.ticket
            )}`}
            onPress={() =>
              setDetailMode('sales')
            }
          />

          <ReportCard
            icon="T"
            title="Ticket médio"
            value={money(
              salesSummary.ticket
            )}
            subtitle={`Faturamento ${money(
              salesSummary.total
            )}`}
            onPress={() =>
              setDetailMode('sales')
            }
          />

          <ReportCard
            icon="C"
            title="Caixa"
            value={`${cashSummary.closings} fechamento(s)`}
            subtitle={
              cash?.current
                ? `Caixa atual aberto • ${cash.current.code || ''}`
                : `Diferença do período ${money(
                    cashSummary.difference
                  )}`
            }
            onPress={() =>
              setDetailMode('cash')
            }
          />

          <ReportCard
            icon="P"
            title="Produtos mais vendidos"
            value={
              data.top_products?.[0]?.name ||
              'Sem vendas no período'
            }
            subtitle={
              data.top_products?.[0]
                ? `${money(
                    data.top_products[0].revenue
                  )} em receita • ${periodLabel}`
                : periodLabel
            }
            onPress={() =>
              setDetailMode('products')
            }
          />

          <ReportCard
            icon="$"
            title="Formas de pagamento"
            value={
              paymentBreakdown[0]?.method ||
              'Sem vendas no período'
            }
            subtitle={
              paymentBreakdown[0]
                ? `${paymentBreakdown[0].percent.toFixed(
                    1
                  )}% do total • ${periodLabel}`
                : periodLabel
            }
            onPress={() =>
              setDetailMode('payments')
            }
          />

          <ReportCard
            icon="C"
            title="Ranking de clientes"
            value={
              customerRanking[0]?.name || 'Sem dados no período'
            }
            subtitle={
              customerRanking[0]
                ? `${money(customerRanking[0].total)} no período`
                : periodLabel
            }
            onPress={() => setDetailMode('customers')}
          />

          <ReportCard
            icon="$"
            title="Financeiro por categoria"
            value={`${
              financeByCategory.payables.length +
              financeByCategory.receivables.length
            } categoria(s)`}
            subtitle={periodLabel}
            onPress={() => setDetailMode('finance')}
          />

          <ReportCard
            icon="E"
            title="Alertas de estoque"
            value={`${stockAlerts.length} produto(s)`}
            subtitle="Situação atual • não depende do período"
            onPress={() => setDetailMode('stock')}
          />
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
                printRows(
                  'Relatório de vendas',
                  periodLabel,
                  ['Data', 'Vendas', 'Faturamento'],
                  periodDays.map((r) => [
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
                  periodDays.map((r) => [
                    dateBR(r.date),
                    r.sales,
                    r.total,
                  ])
                )
              }
            />

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
                      printRows(
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
                        cashClosings.map((c) => [
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
                        cashClosings.map((c) => [
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
              subtitle={`${periodLabel} • por receita (top 10)`}
              onClose={() => setDetailMode(null)}
              onPrint={() =>
                printRows(
                  'Produtos mais vendidos',
                  periodLabel,
                  ['Produto', 'Quantidade', 'Faturamento'],
                  (data?.top_products || []).map((p) => [
                    p.name,
                    qtyLabel(p.qty),
                    money(p.revenue),
                  ])
                )
              }
              onExcel={() =>
                downloadCsv(
                  `relatorio_produtos_${appliedStart}_${appliedEnd}.csv`,
                  ['Produto', 'Quantidade', 'Faturamento'],
                  (data?.top_products || []).map((p) => [
                    p.name,
                    p.qty,
                    p.revenue,
                  ])
                )
              }
            />

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalBody}
            >
              <View style={styles.detailSection}>
                {(data?.top_products || []).length > 0 ? (
                  (data?.top_products || []).map((product, index) => (
                    <View
                      key={`${product.name}-${index}`}
                      style={styles.dayRow}
                    >
                      <View style={styles.dayMain}>
                        <Text style={styles.dayTitle}>
                          {index + 1}. {product.name}
                        </Text>

                        <Text style={styles.dayMeta}>
                          {qtyLabel(product.qty)} vendido(s)
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
                printRows(
                  'Formas de pagamento',
                  periodLabel,
                  ['Forma de pagamento', 'Valor', 'Percentual'],
                  paymentBreakdown.map((row) => [
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
                  paymentBreakdown.map((row) => [
                    row.method,
                    row.value,
                    row.percent.toFixed(1),
                  ])
                )
              }
            />

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalBody}
            >
              {paymentBreakdown.length > 0 ? (
                paymentBreakdown.map((row) => (
                  <SummaryRow
                    key={row.method}
                    label={row.method}
                    value={`${money(row.value)} • ${row.percent.toFixed(1)}%`}
                  />
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
              subtitle={periodLabel}
              onClose={() => setDetailMode(null)}
              onPrint={() =>
                printRows(
                  'Ranking de clientes',
                  periodLabel,
                  ['Cliente', 'Compras', 'Total gasto', 'Ticket médio', '% do período'],
                  customerRanking.map((c) => [
                    c.name,
                    c.purchases,
                    money(c.total),
                    money(c.ticket),
                    `${c.percent.toFixed(1)}%`,
                  ])
                )
              }
              onExcel={() =>
                downloadCsv(
                  `relatorio_clientes_${appliedStart}_${appliedEnd}.csv`,
                  ['Cliente', 'Compras', 'Total gasto', 'Ticket médio', '% do período'],
                  customerRanking.map((c) => [
                    c.name,
                    c.purchases,
                    c.total,
                    c.ticket,
                    c.percent.toFixed(1),
                  ])
                )
              }
            />

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalBody}
            >
              {customerRanking.length > 0 ? (
                customerRanking.map((customer, index) => (
                  <View
                    key={`${customer.name}-${index}`}
                    style={styles.dayRow}
                  >
                    <View style={styles.dayMain}>
                      <Text style={styles.dayTitle}>
                        {index + 1}. {customer.name}
                      </Text>

                      <Text style={styles.dayMeta}>
                        {customer.purchases} compra(s) • ticket médio{' '}
                        {money(customer.ticket)} •{' '}
                        {customer.percent.toFixed(1)}% do período
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
              title="Financeiro por categoria"
              subtitle={periodLabel}
              onClose={() => setDetailMode(null)}
              onPrint={() =>
                printRows(
                  'Financeiro por categoria',
                  periodLabel,
                  ['Tipo', 'Categoria', 'Lançamentos', 'Total', 'Realizado', 'Pendente'],
                  [
                    ...financeByCategory.payables.map((r) => [
                      'Despesa',
                      r.category,
                      r.count,
                      money(r.total),
                      money(r.realized),
                      money(r.pending),
                    ]),
                    ...financeByCategory.receivables.map((r) => [
                      'Receita',
                      r.category,
                      r.count,
                      money(r.total),
                      money(r.realized),
                      money(r.pending),
                    ]),
                  ]
                )
              }
              onExcel={() =>
                downloadCsv(
                  `relatorio_financeiro_${appliedStart}_${appliedEnd}.csv`,
                  ['Tipo', 'Categoria', 'Lançamentos', 'Total', 'Realizado', 'Pendente'],
                  [
                    ...financeByCategory.payables.map((r) => [
                      'Despesa',
                      r.category,
                      r.count,
                      r.total,
                      r.realized,
                      r.pending,
                    ]),
                    ...financeByCategory.receivables.map((r) => [
                      'Receita',
                      r.category,
                      r.count,
                      r.total,
                      r.realized,
                      r.pending,
                    ]),
                  ]
                )
              }
            />

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalBody}
            >
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>
                  Contas a pagar
                </Text>

                {financeByCategory.payables.length > 0 ? (
                  financeByCategory.payables.map((row) => (
                    <View key={row.category} style={styles.dayRow}>
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
                printRows(
                  'Alertas de estoque',
                  `Situação em ${dateBR(today)}`,
                  ['Código', 'Produto', 'Estoque', 'Mínimo', 'Situação'],
                  stockAlerts.map((r) => [
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
                  stockAlerts.map((r) => [
                    r.code,
                    r.name,
                    r.stock,
                    r.minimum,
                    r.status,
                  ])
                )
              }
            />

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalBody}
            >
              {stockAlerts.length > 0 ? (
                stockAlerts.map((row) => (
                  <View key={row.code} style={styles.dayRow}>
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

function ReportCard({
  icon,
  title,
  value,
  subtitle,
  onPress,
}: {
  icon: string;
  title: string;
  value: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={styles.reportCard}
      onPress={onPress}
    >
      <View style={styles.iconCircle}>
        <Text style={styles.iconText}>
          {icon}
        </Text>
      </View>

      <View style={styles.reportMain}>
        <Text style={styles.reportTitle}>
          {title}
        </Text>

        <Text style={styles.reportValue}>
          {value}
        </Text>

        <Text
          style={styles.reportSubtitle}
        >
          {subtitle}
        </Text>
      </View>

      <Text style={styles.cardArrow}>
        ›
      </Text>
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
    borderRadius: theme.radius.md,
    padding: 14,
    gap: 12,
  },

  periodTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: theme.colors.text,
  },

  periodButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  periodButton: {
    paddingHorizontal: 13,
    paddingVertical: 9,
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
    fontSize: 13,
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

  reportCards: {
    gap: 12,
  },

  reportCard: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },

  iconCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1EFE9',
  },

  iconText: {
    fontSize: 23,
    fontWeight: '900',
    color: theme.colors.text,
  },

  reportMain: {
    flex: 1,
  },

  reportTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: theme.colors.text,
  },

  reportValue: {
    marginTop: 2,
    fontSize: 25,
    fontWeight: '900',
    color: theme.colors.text,
  },

  reportSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: theme.colors.muted,
  },

  cardArrow: {
    fontSize: 34,
    lineHeight: 36,
    color: theme.colors.muted,
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
