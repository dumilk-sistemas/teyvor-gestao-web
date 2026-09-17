import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AccountPicker } from '@/components/AccountPicker';
import { AdminShell } from '@/components/AdminShell';
import { MetricCard } from '@/components/MetricCard';
import { SearchBar } from '@/components/SearchBar';
import {
  ActionButton,
  Choice,
  DateField,
  Field,
  FormModal,
  Notice,
  confirmAction,
  formStyles as s,
} from '@/components/FormKit';
import {
  commandMessage,
  createRecurringRule,
  enqueue,
  getFull,
  getMonthlyFinanceReport,
  setEntryAccount,
  updateRecurringRule,
} from '@/services/fullApi';
import { useToast } from '@/components/Toast';
import { theme } from '@/constants/theme';
import { formatDateBR } from '@/utils/date';

const money = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0);

const today = () =>
  new Date().toISOString().slice(0, 10);

const currentMonthString = () => new Date().toISOString().slice(0, 7);

const monthLabel = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  const date = new Date(y, m - 1, 1);
  const label = date.toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const shiftMonth = (month: string, delta: number) => {
  const [y, m] = month.split('-').map(Number);
  const date = new Date(y, m - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const shiftDate = (iso: string, deltaDays: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d + deltaDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
};

const parseMoneyInput = (value: unknown) => {
  const raw = String(value ?? '').trim().replace(/[^\d,.-]/g, '');
  if (!raw) return 0;

  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  let normalized = raw;

  if (lastComma >= 0 && lastDot >= 0) {
    normalized = lastComma > lastDot
      ? raw.replace(/\./g, '').replace(',', '.')
      : raw.replace(/,/g, '');
  } else if (lastComma >= 0) {
    normalized = raw.replace(/\./g, '').replace(',', '.');
  } else if ((raw.match(/\./g) || []).length > 1) {
    normalized = raw.replace(/\./g, '');
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const validIsoDate = (value: unknown) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getFullYear() === Number(match[1]) &&
    date.getMonth() === Number(match[2]) - 1 &&
    date.getDate() === Number(match[3]);
};

const PAYMENT_METHODS = [
  'Boleto',
  'Pix',
  'Transferência',
  'Cheque',
  'Dinheiro',
  'Débito automático',
  'Cartão de débito',
  'Cartão de crédito',
  'Outros',
];

const plannedPaymentMethod = (row: any) => {
  const explicit = String(row?.planned_payment_method || row?.plannedPaymentMethod || '').trim();
  if (explicit) return explicit;
  const notes = String(row?.notes || '');
  const match = notes.match(/Forma prevista:\s*([^\n.•]+)/i);
  return match?.[1]?.trim() || '';
};

const notesWithPlannedMethod = (notes: unknown, method: unknown) => {
  const cleanNotes = String(notes || '')
    .replace(/(?:^|\n)Forma prevista:\s*[^\n.•]+[.•]?\s*/gi, '')
    .trim();
  const prefix = method ? `Forma prevista: ${method}.` : '';
  return [prefix, cleanNotes].filter(Boolean).join('\n');
};

const statusLabel = (status: string) => {
  if (status === 'paid') return 'Pago';
  if (status === 'received') return 'Recebido';
  if (status === 'overdue') return 'Vencido';
  if (status === 'pending_sync') return 'Sincronizando';
  return 'Em aberto';
};

type FinanceView = 'all' | 'payable' | 'receivable';

export default function FullFinance({ view = 'all' }: { view?: FinanceView }) {
  const [data, setData] = useState<any>(null);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('entry');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<any>({});
  const [modalError, setModalError] = useState('');
  const pendingEntriesRef = useRef<any[]>([]);
  const [search, setSearch] = useState('');
  const [listMonth, setListMonth] = useState(currentMonthString());

  const [monthlyOpen, setMonthlyOpen] = useState(false);
  const [monthlyMonth, setMonthlyMonth] = useState(currentMonthString());
  const [monthlyData, setMonthlyData] = useState<any>(null);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [monthlyError, setMonthlyError] = useState('');

  const counterpartyName = (row: any) => {
    const collection = row?.type === 'receivable' ? customers : suppliers;
    const id = row?.type === 'receivable' ? row?.customer_id : row?.supplier_id;
    return collection.find((item: any) => String(item.id) === String(id || ''))?.name || '';
  };

  async function loadMonthlyReport(month: string) {
    try {
      setMonthlyLoading(true);
      setMonthlyError('');
      const result = await getMonthlyFinanceReport(month);
      setMonthlyData(result);
    } catch (e) {
      setMonthlyError(
        e instanceof Error
          ? e.message
          : 'Falha ao carregar o relatório financeiro mensal.'
      );
    } finally {
      setMonthlyLoading(false);
    }
  }

  function openMonthlyReport() {
    setMonthlyOpen(true);
    loadMonthlyReport(monthlyMonth);
  }

  function changeMonth(delta: number) {
    const next = shiftMonth(monthlyMonth, delta);
    setMonthlyMonth(next);
    loadMonthlyReport(next);
  }

  async function handleSetEntryAccount(entryId: string, accountId: number | null) {
    try {
      await setEntryAccount(String(entryId), accountId);
      setData((prev: any) =>
        prev
          ? {
              ...prev,
              entries: prev.entries.map((e: any) =>
                e.id === entryId ? { ...e, account_id: accountId } : e
              ),
            }
          : prev
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Falha ao definir a conta do lançamento.'
      );
    }
  }

  const filteredEntries = useMemo(() => {
    const entries = data?.entries || [];
    const term = search.trim().toLocaleLowerCase('pt-BR');

    return entries.filter((row: any) => {
      if (view !== 'all' && row.type !== view) return false;
      if (view !== 'all' && String(row.due_date || '').slice(0, 7) !== listMonth) return false;
      if (!term) return true;
      return [
        counterpartyName(row),
        row.description,
        row.category,
        plannedPaymentMethod(row),
        row.payment_method,
      ]
        .filter(Boolean)
        .some((field) => String(field).toLocaleLowerCase('pt-BR').includes(term));
    });
  }, [customers, data, listMonth, search, suppliers, view]);

  const periodSummary = useMemo(() => {
    const entries = (data?.entries || []).filter((row: any) =>
      (view === 'all' || row.type === view) &&
      String(row.due_date || '').slice(0, 7) === listMonth
    );
    const open = entries
      .filter((row: any) => ['open', 'overdue', 'pending_sync'].includes(row.status))
      .reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);
    const overdue = entries
      .filter((row: any) => row.status === 'overdue')
      .reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);
    const settled = entries
      .filter((row: any) => ['paid', 'received'].includes(row.status))
      .reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);
    const recurring = entries
      .filter((row: any) => row.recurring_rule_id && ['open', 'overdue', 'pending_sync'].includes(row.status))
      .reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);
    return { open, overdue, settled, recurring, count: entries.length };
  }, [data, listMonth, view]);

  const nearTerm = useMemo(() => {
    const entries = data?.entries || [];
    const todayIso = today();
    const in7 = shiftDate(todayIso, 7);
    let dueToday = 0;
    let due7Days = 0;
    for (const e of entries) {
      if (e.type !== 'payable' || !['open', 'overdue'].includes(e.status)) continue;
      if (e.due_date === todayIso) dueToday += Number(e.amount || 0);
      if (e.due_date >= todayIso && e.due_date <= in7) due7Days += Number(e.amount || 0);
    }
    return { dueToday, due7Days };
  }, [data]);

  async function load() {
    try {
      setLoading(true);
      setError('');

      const [financeData, supplierData, customerData] = await Promise.all([
        getFull('finance'),
        // A tela financeira continua disponível mesmo se o perfil não
        // puder consultar uma das bases de contrapartes.
        getFull('suppliers').catch(() => null),
        getFull('customers').catch(() => null),
      ]);

      const serverEntries = financeData?.entries || [];
      const stillPending = pendingEntriesRef.current.filter((pending) => {
        const server = serverEntries.find((row: any) => String(row.id) === String(pending.id));
        if (!server) return true;
        return server.description !== pending.description ||
          Number(server.amount || 0) !== Number(pending.amount || 0) ||
          server.due_date !== pending.due_date;
      });
      pendingEntriesRef.current = stillPending;
      const pendingIds = new Set(stillPending.map((row) => String(row.id)));
      setData({
        ...financeData,
        entries: [...stillPending, ...serverEntries.filter((row: any) => !pendingIds.has(String(row.id)))],
      });
      setSuppliers(supplierData?.rows || []);
      setCustomers(customerData?.rows || []);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Falha ao carregar financeiro.'
      );
    } finally {
      setLoading(false);
    }
  }

  function addPendingEntry(entry: any) {
    if (!entry) return;
    const category = (data?.categories || []).find(
      (item: any) => String(item.id) === String(entry.categoryId || '')
    );
    const pending = {
      id: entry.id,
      type: entry.type || 'payable',
      description: entry.description || '',
      category: category?.name || 'Sem categoria',
      category_id: entry.categoryId || '',
      supplier_id: entry.supplierId || null,
      customer_id: entry.customerId || null,
      planned_payment_method: entry.plannedPaymentMethod || '',
      amount: Number(entry.amount || 0),
      due_date: entry.dueDate || '',
      competence_date: entry.competenceDate || '',
      status: 'pending_sync',
      notes: entry.notes || '',
      account_id: null,
      recurring_rule_id: entry.recurringRuleId || null,
    };
    pendingEntriesRef.current = [
      pending,
      ...pendingEntriesRef.current.filter((row) => String(row.id) !== String(pending.id)),
    ];
    setData((current: any) => current ? {
      ...current,
      entries: [pending, ...(current.entries || []).filter((row: any) => String(row.id) !== String(pending.id))],
    } : current);
  }

  function refreshAfterSync() {
    [3000, 8000, 16000].forEach((delay) => setTimeout(() => load(), delay));
  }

  useEffect(() => {
    load();
  }, []);

  const set = (
    key: string,
    value: any
  ) => {
    setForm((current: any) => ({
      ...current,
      [key]: value,
    }));
  };

  const startEntry = (
    type = 'payable',
    row?: any
  ) => {
    setModalError('');
    setMode('entry');

    setForm({
      id: row?.id || '',
      type: row?.type || type,
      description: row?.description || '',
      categoryId: String(
        row?.category_id || ''
      ),
      supplierId: String(
        row?.supplier_id || ''
      ),
      customerId: String(
        row?.customer_id || ''
      ),
      plannedPaymentMethod: plannedPaymentMethod(row),
      amount: String(
        row?.amount || 0
      ).replace('.', ','),
      competenceDate:
        row?.competence_date || today(),
      dueDate:
        row?.due_date || today(),
      notes: row?.notes || '',
      recurringRuleId: row?.recurring_rule_id || null,
      recurringMode: 'none',
      recurringAmountMode: 'fixed',
      recurringMonthsCount: '',
    });

    setOpen(true);
  };

  const startSettle = (row: any) => {
    setModalError('');
    setMode('settle');

    setForm({
      id: row.id,
      description: row.description,
      type: row.type,
      date: today(),
      method: plannedPaymentMethod(row) || 'Pix',
      note: '',
    });

    setOpen(true);
  };

  const startAnticipate = (
    row: any
  ) => {
    setModalError('');
    setMode('anticipate');

    setForm({
      receivableKey: row.key,
      description: `Venda #${row.sale_number} • ${row.installment}/${row.installments}`,
      date: today(),
      gross: String(
        row.gross || 0
      ).replace('.', ','),
      fee: '0,00',
    });

    setOpen(true);
  };

  async function save() {
    try {
      setBusy(true);
      setError('');
      setModalError('');

      if (mode === 'entry') {
        const amount = parseMoneyInput(form.amount);
        if (String(form.description || '').trim().length < 2) {
          setModalError('Informe uma descrição com pelo menos 2 caracteres.');
          return;
        }
        if (!form.categoryId) {
          setModalError('Selecione uma categoria.');
          return;
        }
        if (form.type === 'payable' && !form.supplierId) {
          setModalError('Selecione o fornecedor ou favorecido da conta.');
          return;
        }
        if (form.type === 'receivable' && !form.customerId) {
          setModalError('Selecione o cliente ou pagador da conta.');
          return;
        }
        if (!form.plannedPaymentMethod) {
          setModalError('Selecione a forma prevista de pagamento.');
          return;
        }
        if (amount <= 0) {
          setModalError('Informe um valor maior que zero. Você pode usar 1500,00 ou 1.500,00.');
          return;
        }
        if (!validIsoDate(form.dueDate)) {
          setModalError('Informe o vencimento no formato DD/MM/AAAA.');
          return;
        }
        if (form.competenceDate && !validIsoDate(form.competenceDate)) {
          setModalError('Informe a competência no formato DD/MM/AAAA.');
          return;
        }
      }

      if (
        mode === 'entry' &&
        form.recurringMode &&
        form.recurringMode !== 'none' &&
        !form.id
      ) {
        const amount = parseMoneyInput(form.amount);
        const dueDay = Number(String(form.dueDate || '').slice(8, 10)) || 1;
        const startMonth = String(form.dueDate || '').slice(0, 7);
        let endMonth: string | null = null;
        if (form.recurringMode === 'months') {
          const count = Number(form.recurringMonthsCount || '0');
          if (!(count >= 1)) {
            setModalError('Informe quantos meses a recorrência deve durar (1 ou mais).');
            return;
          }
          endMonth = shiftMonth(startMonth, count - 1);
        }
        const result = await createRecurringRule({
          type: form.type,
          description: form.description,
          category_id: form.categoryId,
          supplier_id: form.supplierId || null,
          customer_id: form.customerId || null,
          amount,
          amount_mode: form.recurringAmountMode || 'fixed',
          due_day: dueDay,
          start_month: startMonth,
          end_month: endMonth,
          notes: notesWithPlannedMethod(form.notes, form.plannedPaymentMethod),
          active: true,
        });
        addPendingEntry({
          id: `REC-${result.id}-${startMonth}`,
          type: form.type,
          description: form.description,
          categoryId: form.categoryId,
          supplierId: form.supplierId || null,
          customerId: form.customerId || null,
          plannedPaymentMethod: form.plannedPaymentMethod,
          amount,
          competenceDate: `${startMonth}-01`,
          dueDate: form.dueDate,
          notes: form.notes || '',
          recurringRuleId: result.id,
        });
        setOpen(false);
        setForm({});
        showToast(
          `Conta recorrente criada. ${result?.created || 0} parcela(s) gerada(s) automaticamente.`
        );
        refreshAfterSync();
        return;
      } else if (mode === 'entry') {
        const result = await enqueue(
          'finance',
          'FINANCIAL_ENTRY_UPSERT',
          {
            entry: {
              id: form.id || undefined,
              type: form.type,
              description:
                form.description,
              categoryId:
                form.categoryId,
              supplierId:
                form.type === 'payable' ? form.supplierId || null : null,
              customerId:
                form.type === 'receivable' ? form.customerId || null : null,
              plannedPaymentMethod:
                form.plannedPaymentMethod,
              amount: parseMoneyInput(form.amount),
              competenceDate:
                form.competenceDate,
              dueDate: form.dueDate,
              notes: form.notes || '',
            },
          }
        );
        addPendingEntry(result.payload?.entry);
      } else if (
        mode === 'settle'
      ) {
        await enqueue(
          'finance',
          'FINANCIAL_SETTLE',
          {
            id: form.id,
            date: form.date,
            method: form.method,
            note: form.note || '',
          }
        );
      } else {
        const gross = Number(
          String(
            form.gross || '0'
          ).replace(',', '.')
        );

        const fee = Number(
          String(
            form.fee || '0'
          ).replace(',', '.')
        );

        await enqueue(
          'finance',
          'CARD_ANTICIPATE',
          {
            receivableKey:
              form.receivableKey,
            anticipationDate:
              form.date,
            grossAmount: gross,
            feeAmount: fee,
            netAmount: gross - fee,
          }
        );
      }

      const successMessage = mode === 'entry'
        ? `${form.type === 'receivable' ? 'Conta a receber' : 'Conta a pagar'} ${form.id ? 'atualizada' : 'salva'} com sucesso. A sincronização será concluída automaticamente.`
        : commandMessage;

      setOpen(false);
      setForm({});
      showToast(successMessage);

      refreshAfterSync();
    } catch (e) {
      const message = e instanceof Error
        ? e.message
        : 'Falha ao enviar operação financeira.';
      setModalError(message);
      showToast(message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function stopRecurring() {
    if (!form.recurringRuleId) return;
    try {
      setBusy(true);
      setError('');

      const confirmed = await confirmAction(
        'Parar recorrência',
        'As parcelas já geradas continuam existindo, mas nenhum mês novo será criado a partir de agora. Confirma?'
      );
      if (!confirmed) return;

      await updateRecurringRule(form.recurringRuleId, { active: false });
      setOpen(false);
      showToast('Recorrência parada. As parcelas já geradas continuam normalmente.');

      setTimeout(() => {
        load();
      }, 1200);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Falha ao parar a recorrência.'
      );
    } finally {
      setBusy(false);
    }
  }

  async function reverse(row: any) {
    try {
      setError('');

      const confirmed = await confirmAction(
        'Estornar baixa',
        `Deseja realmente estornar a baixa de ${row.description || 'este lançamento'}?`
      );
      if (!confirmed) return;

      await enqueue(
        'finance',
        'FINANCIAL_REVERSE',
        {
          id: row.id,
          reason:
            'Estorno solicitado no Admin',
        }
      );

      showToast(commandMessage);

      setTimeout(() => {
        load();
      }, 1200);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Falha ao estornar baixa.'
      );
    }
  }

  const categories = (
    data?.categories || []
  ).filter(
    (category: any) =>
      category.type === form.type
  );

  return (
    <AdminShell
      title={view === 'payable' ? 'Contas a pagar' : view === 'receivable' ? 'Contas a receber' : 'Financeiro'}
      subtitle={
        view === 'payable'
          ? 'Despesas, vencimentos, recorrências e baixas'
          : view === 'receivable'
            ? 'Recebimentos, vencimentos e baixas'
            : 'Contas a pagar, receber, baixas e antecipações'
      }
      syncText={
        data?.last_sync_at
          ? `Atualizado em ${new Date(
              data.last_sync_at
            ).toLocaleString('pt-BR')}`
          : 'Aguardando sincronização'
      }
      refreshing={loading}
      onRefresh={load}
      syncNote
      headerActions={
        <>
          {view !== 'receivable' && (
            <ActionButton label="+ Nova conta a pagar" tone="gold" onPress={() => startEntry('payable')} />
          )}

          {view !== 'payable' && (
            <ActionButton label="+ Nova conta a receber" tone="dark" onPress={() => startEntry('receivable')} />
          )}
        </>
      }
    >
      {!!error && (
        <Notice
          text={error}
          tone="error"
        />
      )}

      {!!data && (
        <>
          {view !== 'all' && (
            <View style={monthlyStyles.periodBar}>
              <View>
                <Text style={monthlyStyles.periodCaption}>PERÍODO DOS LANÇAMENTOS</Text>
                <Text style={monthlyStyles.periodTitle}>{monthLabel(listMonth)}</Text>
              </View>
              <View style={monthlyStyles.periodActions}>
                <Pressable style={monthlyStyles.monthArrow} onPress={() => setListMonth((value) => shiftMonth(value, -1))}>
                  <Text style={monthlyStyles.monthArrowText}>‹</Text>
                </Pressable>
                <Pressable style={monthlyStyles.monthArrow} onPress={() => setListMonth((value) => shiftMonth(value, 1))}>
                  <Text style={monthlyStyles.monthArrowText}>›</Text>
                </Pressable>
                {listMonth !== currentMonthString() && (
                  <Pressable style={monthlyStyles.currentMonthButton} onPress={() => setListMonth(currentMonthString())}>
                    <Text style={monthlyStyles.currentMonthButtonText}>Mês atual</Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}

          <View style={monthlyStyles.compactSummaryGrid}>
            {view !== 'all' ? (
              <>
                <CompactFinanceMetric
                  label={view === 'payable' ? 'A pagar no mês' : 'A receber no mês'}
                  value={money(periodSummary.open)}
                  note="Somente lançamentos do período selecionado"
                  tone={view === 'payable' ? 'out' : 'in'}
                />
                <CompactFinanceMetric
                  label="Vencido no mês"
                  value={money(periodSummary.overdue)}
                  tone={periodSummary.overdue > 0 ? 'danger' : 'neutral'}
                />
                <CompactFinanceMetric
                  label={view === 'payable' ? 'Pago no mês' : 'Recebido no mês'}
                  value={money(periodSummary.settled)}
                  tone="settled"
                />
                {view === 'payable' && (
                  <CompactFinanceMetric
                    label="Recorrentes do mês"
                    value={money(periodSummary.recurring)}
                    note="Cada recorrência é contada apenas uma vez no mês"
                    tone="neutral"
                  />
                )}
              </>
            ) : (
              <>
            <CompactFinanceMetric
              label="A pagar"
              value={money(
                data.summary
                  ?.open_payables || 0
              )}
              tone="out"
            />

            <CompactFinanceMetric
              label="Vencido"
              value={money(
                data.summary
                  ?.overdue_payables || 0
              )}
              tone={
                (data.summary?.overdue_payables || 0) > 0
                  ? 'danger'
                  : 'neutral'
              }
            />

            <CompactFinanceMetric
              label="Vence hoje"
              value={money(nearTerm.dueToday)}
              tone={nearTerm.dueToday > 0 ? 'danger' : 'neutral'}
            />

            <CompactFinanceMetric
              label="Próximos 7 dias"
              value={money(nearTerm.due7Days)}
              tone="neutral"
            />

            <CompactFinanceMetric
              label="A receber"
              value={money(
                data.summary
                  ?.open_receivables || 0
              )}
              tone="in"
            />

            <CompactFinanceMetric
              label="Cartões previstos"
              value={money(
                data.summary
                  ?.card_forecast || 0
              )}
              tone="forecast"
            />
              </>
            )}
          </View>

          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por fornecedor, cliente, descrição, categoria ou forma"
          />

          {(data.entries || []).some((row: any) => row.status === 'pending_sync') && (
            <Notice text="Lançamento salvo e aguardando o PDV concluir a sincronização. Esta tela será atualizada automaticamente." />
          )}

          <View style={monthlyStyles.entriesCard}>
            <Text style={monthlyStyles.entriesTitle}>
              {view === 'payable' ? `Contas a pagar — ${monthLabel(listMonth)}` : view === 'receivable' ? `Contas a receber — ${monthLabel(listMonth)}` : 'Lançamentos'}
            </Text>

            {filteredEntries.length >
            0 ? (
              filteredEntries.map(
                (row: any) => {
                  const counterparty = counterpartyName(row);
                  const plannedMethod = plannedPaymentMethod(row);
                  return (
                  <View
                    key={String(row.id)}
                    style={monthlyStyles.entryRow}
                  >
                    <View style={monthlyStyles.entryMain}>
                      <Text style={monthlyStyles.entryName}>
                        {counterparty || row.description}
                        {row.recurring_rule_id ? ' 🔁' : ''}
                      </Text>

                      <Text style={monthlyStyles.entryMeta}>
                        {counterparty
                          ? `${row.description} • `
                          : `${row.type === 'payable' ? 'Fornecedor' : 'Cliente'} não vinculado • `}
                        {row.category} • vence{' '}
                        {formatDateBR(row.due_date)} •{' '}
                        {row.type ===
                        'payable'
                          ? 'A pagar'
                          : 'A receber'}
                      </Text>

                      <Text style={monthlyStyles.entryMeta}>
                        {['paid', 'received'].includes(row.status) && row.payment_method
                          ? `Realizado por: ${row.payment_method}`
                          : plannedMethod
                            ? `Previsto: ${plannedMethod}`
                            : 'Forma prevista não informada'}
                      </Text>

                      {row.status !== 'pending_sync' && (data.accounts || []).length > 0 && (
                        <AccountPicker
                          label="Conta"
                          options={(data.accounts || []).map((a: any) => ({
                            label: a.name,
                            value: String(a.id),
                          }))}
                          value={
                            row.account_id != null
                              ? String(row.account_id)
                              : ''
                          }
                          onChange={(v) =>
                            handleSetEntryAccount(
                              row.id,
                              v ? Number(v) : null
                            )
                          }
                        />
                      )}
                    </View>

                    <View style={monthlyStyles.entryRight}>
                      <Text style={monthlyStyles.entryAmount}>
                        {money(row.amount)}
                      </Text>

                      <Text
                        style={[
                          monthlyStyles.entryStatus,
                          row.status ===
                            'overdue' &&
                            monthlyStyles.entryStatusDanger,
                        ]}
                      >
                        {statusLabel(row.status)}
                      </Text>

                      {row.status !== 'pending_sync' && (
                        <View style={s.toolbar}>
                        <ActionButton
                          label="Editar"
                          tone="plain"
                          onPress={() =>
                            startEntry(
                              row.type,
                              row
                            )
                          }
                        />

                        {[
                          'open',
                          'overdue',
                        ].includes(
                          row.status
                        ) ? (
                          <ActionButton
                            label="Baixar"
                            tone="gold"
                            onPress={() =>
                              startSettle(
                                row
                              )
                            }
                          />
                        ) : (
                          <ActionButton
                            label="Estornar baixa"
                            tone="danger"
                            onPress={() =>
                              reverse(row)
                            }
                          />
                        )}
                        </View>
                      )}
                    </View>
                  </View>
                  );
                }
              )
            ) : (
              <Text style={s.empty}>
                {search
                  ? 'Nenhum lançamento encontrado para essa busca.'
                  : 'Nenhum lançamento.'}
              </Text>
            )}
          </View>

          {view !== 'payable' && (
            <View style={s.card}>
              <Text style={s.cardTitle}>
                Recebíveis de cartão
              </Text>

            {(data.card_receivables || [])
              .length > 0 ? (
              (
                data.card_receivables ||
                []
              ).map((row: any) => (
                <View
                  key={String(row.key)}
                  style={s.row}
                >
                  <View style={s.main}>
                    <Text style={s.name}>
                      Venda #{row.sale_number}{' '}
                      • {row.method}
                    </Text>

                    <Text style={s.meta}>
                      Parcela{' '}
                      {row.installment}/
                      {row.installments} •
                      previsão {formatDateBR(row.date)}
                    </Text>
                  </View>

                  <View style={s.right}>
                    <Text style={s.amount}>
                      {money(row.net)}
                    </Text>

                    <Text style={s.badge}>
                      {row.status}
                    </Text>

                    {row.status ===
                      'Previsto' &&
                      row.method ===
                        'Crédito' && (
                        <ActionButton
                          label="Antecipar"
                          tone="gold"
                          onPress={() =>
                            startAnticipate(
                              row
                            )
                          }
                        />
                      )}
                  </View>
                </View>
              ))
            ) : (
              <Text style={s.empty}>
                Nenhum recebível de
                cartão.
              </Text>
            )}
            </View>
          )}
        </>
      )}

      <FormModal
        visible={open}
        title={
          mode === 'entry'
            ? form.id
              ? 'Editar lançamento'
              : 'Novo lançamento'
            : mode === 'settle'
              ? 'Baixar lançamento'
              : 'Antecipar recebível'
        }
        onCancel={() => {
          setModalError('');
          setOpen(false);
        }}
        onSave={save}
        busy={busy}
        errorText={modalError}
      >
        {mode === 'entry' ? (
          <>
            <Choice
              label="Tipo"
              value={form.type || 'payable'}
              onChange={(value) => setForm((current: any) => ({
                ...current,
                type: value,
                supplierId: value === 'payable' ? current.supplierId : '',
                customerId: value === 'receivable' ? current.customerId : '',
              }))}
              options={[
                {
                  label:
                    'Conta a pagar',
                  value: 'payable',
                },
                {
                  label:
                    'Conta a receber',
                  value: 'receivable',
                },
              ]}
            />

            <Field
              label={form.type === 'payable' ? 'Descrição da despesa *' : 'Descrição do recebimento *'}
              value={
                form.description || ''
              }
              onChangeText={(value) =>
                set(
                  'description',
                  value
                )
              }
              placeholder={form.type === 'payable' ? 'Ex.: compra de mercadorias' : 'Ex.: venda ou serviço prestado'}
            />

            <AccountPicker
              label="Categoria *"
              value={
                form.categoryId || ''
              }
              onChange={(value) =>
                set(
                  'categoryId',
                  value
                )
              }
              allowEmpty={false}
              emptyLabel="Selecione a categoria"
              options={categories.map(
                (category: any) => ({
                  label:
                    category.name,
                  value: String(
                    category.id
                  ),
                })
              )}
            />

            {form.type ===
              'payable' && (
              <AccountPicker
                label="Fornecedor / favorecido *"
                value={
                  form.supplierId || ''
                }
                onChange={(value) =>
                  set(
                    'supplierId',
                    value
                  )
                }
                emptyLabel="Selecione o fornecedor"
                options={suppliers.map(
                  (supplier) => ({
                    label:
                      supplier.name,
                    value: String(
                      supplier.id
                    ),
                  })
                )}
              />
            )}

            {form.type === 'receivable' && (
              <AccountPicker
                label="Cliente / pagador *"
                value={form.customerId || ''}
                onChange={(value) => set('customerId', value)}
                emptyLabel="Selecione o cliente"
                options={customers.map((customer) => ({
                  label: customer.name,
                  value: String(customer.id),
                }))}
              />
            )}

            <Choice
              label="Forma prevista de pagamento *"
              value={form.plannedPaymentMethod || ''}
              onChange={(value) => set('plannedPaymentMethod', value)}
              options={PAYMENT_METHODS.map((value) => ({ label: value, value }))}
            />

            <Field
              label="Valor *"
              value={form.amount || ''}
              onChangeText={(value) =>
                set('amount', value)
              }
              keyboardType="decimal-pad"
            />

            <DateField
              label="Competência"
              value={form.competenceDate || ''}
              onChangeText={(value) =>
                set(
                  'competenceDate',
                  value
                )
              }
            />

            <DateField
              label="Vencimento *"
              value={form.dueDate || ''}
              onChangeText={(value) =>
                set(
                  'dueDate',
                  value
                )
              }
            />

            <Field
              label="Observações"
              value={form.notes || ''}
              onChangeText={(value) =>
                set('notes', value)
              }
              multiline
            />

            {form.id && form.recurringRuleId ? (
              <>
                <Notice
                  text='Esta conta faz parte de uma recorrência (se repete todo mês). Editar aqui só muda esta parcela.'
                  tone="ok"
                />

                <ActionButton
                  label="Parar recorrência (não gerar mais meses)"
                  tone="danger"
                  onPress={stopRecurring}
                />
              </>
            ) : !form.id ? (
              <>
                <Choice
                  label="Repetição"
                  value={form.recurringMode || 'none'}
                  onChange={(value) =>
                    set('recurringMode', value)
                  }
                  options={[
                    { label: 'Não repete', value: 'none' },
                    { label: 'Repete todo mês', value: 'forever' },
                    { label: 'Repete por um período', value: 'months' },
                  ]}
                />

                {form.recurringMode === 'months' && (
                  <Field
                    label="Quantos meses (incluindo este)?"
                    value={form.recurringMonthsCount || ''}
                    onChangeText={(value) =>
                      set('recurringMonthsCount', value)
                    }
                    keyboardType="decimal-pad"
                    placeholder="Ex.: 12"
                  />
                )}

                {form.recurringMode && form.recurringMode !== 'none' && (
                  <Choice
                    label="O valor é sempre igual ou muda todo mês?"
                    value={form.recurringAmountMode || 'fixed'}
                    onChange={(value) =>
                      set('recurringAmountMode', value)
                    }
                    options={[
                      { label: 'Fixo (sempre igual)', value: 'fixed' },
                      { label: 'Estimado (costuma variar)', value: 'estimated' },
                    ]}
                  />
                )}
              </>
            ) : null}
          </>
        ) : mode === 'settle' ? (
          <>
            <Text style={s.name}>
              {form.description}
            </Text>

            <DateField
              label="Data da baixa *"
              value={form.date || ''}
              onChangeText={(value) =>
                set('date', value)
              }
            />

            <Choice
              label="Forma"
              value={form.method || 'Pix'}
              onChange={(value) =>
                set('method', value)
              }
              options={[
                'Dinheiro',
                'Pix',
                'Débito',
                'Crédito',
                'Boleto',
                'Transferência',
                'Cheque',
                'Outros',
              ].map((value) => ({
                label: value,
                value,
              }))}
            />

            <Field
              label="Observação"
              value={form.note || ''}
              onChangeText={(value) =>
                set('note', value)
              }
              multiline
            />
          </>
        ) : (
          <>
            <Text style={s.name}>
              {form.description}
            </Text>

            <DateField
              label="Data da antecipação"
              value={form.date || ''}
              onChangeText={(value) =>
                set('date', value)
              }
            />

            <Field
              label="Valor bruto"
              value={form.gross || ''}
              onChangeText={(value) =>
                set('gross', value)
              }
              keyboardType="decimal-pad"
            />

            <Field
              label="Taxa cobrada"
              value={form.fee || ''}
              onChangeText={(value) =>
                set('fee', value)
              }
              keyboardType="decimal-pad"
            />
          </>
        )}
      </FormModal>

      <Modal
        visible={monthlyOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMonthlyOpen(false)}
      >
        <View style={monthlyStyles.backdrop}>
          <View style={monthlyStyles.modal}>
            <View style={monthlyStyles.header}>
              <Text style={monthlyStyles.title}>
                Relatório financeiro mensal
              </Text>

              <Pressable onPress={() => setMonthlyOpen(false)}>
                <Text style={monthlyStyles.close}>×</Text>
              </Pressable>
            </View>

            <View style={monthlyStyles.monthNav}>
              <Pressable
                style={monthlyStyles.monthArrow}
                onPress={() => changeMonth(-1)}
              >
                <Text style={monthlyStyles.monthArrowText}>‹</Text>
              </Pressable>

              <Text style={monthlyStyles.monthLabel}>
                {monthLabel(monthlyMonth)}
              </Text>

              <Pressable
                style={monthlyStyles.monthArrow}
                onPress={() => changeMonth(1)}
              >
                <Text style={monthlyStyles.monthArrowText}>›</Text>
              </Pressable>

              {monthlyMonth !== currentMonthString() && (
                <Pressable
                  style={monthlyStyles.currentMonthButton}
                  onPress={() => {
                    const current = currentMonthString();
                    setMonthlyMonth(current);
                    loadMonthlyReport(current);
                  }}
                >
                  <Text style={monthlyStyles.currentMonthButtonText}>
                    Mês atual
                  </Text>
                </Pressable>
              )}
            </View>

            <ScrollView
              style={monthlyStyles.scroll}
              contentContainerStyle={monthlyStyles.scrollContent}
            >
              {!!monthlyError && (
                <Notice text={monthlyError} tone="error" />
              )}

              {monthlyLoading && !monthlyData && (
                <Text style={s.empty}>Carregando...</Text>
              )}

              {!!monthlyData && (
                <>
                  <View style={s.grid}>
                    <MetricCard
                      label="Receitas"
                      value={money(monthlyData.result.total_revenue)}
                      note="Vendas + outras receitas"
                    />

                    <MetricCard
                      label="Despesas operacionais"
                      value={money(monthlyData.result.operating_expenses)}
                      note="Sem compras (tratadas via CMV)"
                    />

                    <MetricCard
                      label="Resultado após CMV"
                      value={money(monthlyData.result.result_after_cogs)}
                      tone={
                        monthlyData.result.result_after_cogs < 0
                          ? 'warning'
                          : 'default'
                      }
                    />

                    <MetricCard
                      label="Caixa previsto no mês"
                      value={money(monthlyData.cash.projected_net)}
                      tone={
                        monthlyData.cash.projected_net < 0
                          ? 'warning'
                          : 'default'
                      }
                    />
                  </View>

                  <View style={s.card}>
                    <Text style={s.cardTitle}>
                      Receitas x despesas (competência)
                    </Text>

                    <SummaryLine
                      label="Vendas"
                      value={money(monthlyData.result.sales_revenue)}
                    />
                    <SummaryLine
                      label="Outras receitas operacionais"
                      value={money(monthlyData.result.other_revenue)}
                    />
                    <SummaryLine
                      label="Despesas operacionais"
                      value={money(monthlyData.result.operating_expenses)}
                    />
                    <SummaryLine
                      label="CMV estimado"
                      value={money(monthlyData.result.cogs)}
                    />
                    <SummaryLine
                      label="Resultado após CMV"
                      value={money(monthlyData.result.result_after_cogs)}
                      bold
                      danger={monthlyData.result.result_after_cogs < 0}
                    />

                    {monthlyData.result.purchases > 0 && (
                      <Text style={monthlyStyles.note}>
                        Compras/Mercadorias no mês:{' '}
                        {money(monthlyData.result.purchases)}. Não deduzido de
                        novo do resultado — o custo já aparece no CMV.
                      </Text>
                    )}
                  </View>

                  <View style={s.card}>
                    <Text style={s.cardTitle}>
                      Fluxo de caixa do mês
                    </Text>

                    <SummaryLine
                      label="Entradas realizadas"
                      value={money(monthlyData.cash.realized_in)}
                    />
                    <SummaryLine
                      label="Entradas previstas"
                      value={money(monthlyData.cash.forecast_in)}
                    />
                    <SummaryLine
                      label="Saídas realizadas"
                      value={money(monthlyData.cash.realized_out)}
                    />
                    <SummaryLine
                      label="Saídas previstas"
                      value={money(monthlyData.cash.forecast_out)}
                    />
                    <SummaryLine
                      label="Movimento líquido previsto"
                      value={money(monthlyData.cash.projected_net)}
                      bold
                      danger={monthlyData.cash.projected_net < 0}
                    />
                  </View>

                  {monthlyData.categories.length > 0 && (
                    <View style={s.card}>
                      <Text style={s.cardTitle}>
                        Despesas por categoria
                      </Text>

                      {monthlyData.categories.map((cat: any) => (
                        <View key={cat.category_id} style={s.row}>
                          <View style={s.main}>
                            <Text style={s.name}>{cat.category}</Text>
                            <Text style={s.meta}>
                              {cat.count} lançamento(s) • realizado{' '}
                              {money(cat.realized)} • pendente{' '}
                              {money(cat.pending)}
                            </Text>
                          </View>

                          <Text style={s.amount}>{money(cat.total)}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  <View style={s.card}>
                    <Text style={s.cardTitle}>
                      Contas a pagar do mês
                    </Text>

                    {monthlyData.payables.length > 0 ? (
                      monthlyData.payables.map((row: any) => (
                        <View key={String(row.id)} style={s.row}>
                          <View style={s.main}>
                            <Text style={s.name}>{row.description}</Text>
                            <Text style={s.meta}>
                              Vence {formatDateBR(row.due_date)} • {row.category} •{' '}
                              {statusLabel(row.status)}
                            </Text>
                          </View>

                          <Text style={s.amount}>{money(row.amount)}</Text>
                        </View>
                      ))
                    ) : (
                      <Text style={s.empty}>
                        Nenhuma conta a pagar com vencimento neste mês.
                      </Text>
                    )}
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

    </AdminShell>
  );
}

function CompactFinanceMetric({
  label,
  value,
  note,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  note?: string;
  tone?: 'in' | 'out' | 'danger' | 'settled' | 'forecast' | 'neutral';
}) {
  const toneColors = {
    in: { accent: '#25835A', soft: '#EAF7F0' },
    out: { accent: '#C84E4E', soft: '#FFF3F3' },
    danger: { accent: '#B63D42', soft: '#FDEBEC' },
    settled: { accent: '#3568B8', soft: '#EEF4FC' },
    forecast: { accent: '#6A70A8', soft: '#F0F1FA' },
    neutral: { accent: '#66717D', soft: '#F2F4F5' },
  }[tone];

  return (
    <View style={monthlyStyles.compactMetricCard}>
      <View style={[monthlyStyles.compactMetricMark, { backgroundColor: toneColors.soft }]}>
        <View style={[monthlyStyles.compactMetricDot, { backgroundColor: toneColors.accent }]} />
      </View>
      <View style={monthlyStyles.compactMetricContent}>
        <Text style={monthlyStyles.compactMetricLabel}>{label}</Text>
        <Text style={[monthlyStyles.compactMetricValue, tone === 'danger' && { color: toneColors.accent }]}>{value}</Text>
        {!!note && <Text style={monthlyStyles.compactMetricNote}>{note}</Text>}
      </View>
    </View>
  );
}

function SummaryLine({
  label,
  value,
  bold = false,
  danger = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
  danger?: boolean;
}) {
  return (
    <View style={monthlyStyles.summaryRow}>
      <Text style={monthlyStyles.summaryLabel}>{label}</Text>
      <Text
        style={[
          monthlyStyles.summaryValue,
          bold && monthlyStyles.summaryValueBold,
          danger && monthlyStyles.summaryValueDanger,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const monthlyStyles = StyleSheet.create({
  compactSummaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  compactMetricCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: theme.colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    minWidth: 220,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  compactMetricMark: {
    alignItems: 'center',
    borderRadius: 9,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  compactMetricDot: { borderRadius: 5, height: 9, width: 9 },
  compactMetricContent: { flex: 1 },
  compactMetricLabel: { color: theme.colors.muted, fontSize: 9.5, fontWeight: '900', textTransform: 'uppercase' },
  compactMetricValue: { color: theme.colors.text, fontFamily: 'Sora_700Bold', fontSize: 17, marginTop: 2 },
  compactMetricNote: { color: theme.colors.muted, fontSize: 9.5, marginTop: 2 },
  entriesCard: {
    backgroundColor: '#FFFFFF',
    borderColor: theme.colors.border,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  entriesTitle: {
    color: theme.colors.text,
    fontFamily: 'Sora_700Bold',
    fontSize: 15,
    paddingHorizontal: 15,
    paddingVertical: 13,
  },
  entryRow: {
    alignItems: 'center',
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  entryMain: { flex: 1, minWidth: 260 },
  entryName: { color: theme.colors.text, fontSize: 12.5, fontWeight: '900' },
  entryMeta: { color: theme.colors.muted, fontSize: 10.5, marginTop: 3 },
  entryRight: { alignItems: 'flex-end', gap: 5 },
  entryAmount: { color: theme.colors.text, fontFamily: 'Sora_700Bold', fontSize: 14 },
  entryStatus: {
    backgroundColor: '#EAF7EF',
    borderRadius: 9,
    color: theme.colors.success,
    fontSize: 9,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  entryStatusDanger: { backgroundColor: '#FDECEC', color: theme.colors.danger },
  periodBar: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: theme.colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    justifyContent: 'space-between',
    padding: 16,
  },
  periodCaption: {
    color: theme.colors.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  periodTitle: {
    color: theme.colors.text,
    fontFamily: 'Sora_700Bold',
    fontSize: 16,
    marginTop: 3,
  },
  periodActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modal: {
    width: '100%',
    maxWidth: 640,
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 19,
    fontWeight: '900',
    color: theme.colors.text,
    flex: 1,
  },
  close: {
    fontSize: 28,
    lineHeight: 28,
    color: theme.colors.muted,
  },
  monthNav: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  monthArrow: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F1EC',
  },
  monthArrowText: {
    fontSize: 20,
    lineHeight: 22,
    color: theme.colors.text,
  },
  monthLabel: {
    fontSize: 15,
    fontWeight: '900',
    color: theme.colors.text,
  },
  currentMonthButton: {
    marginLeft: 'auto',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  currentMonthButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.text,
  },
  scroll: {
    marginTop: 14,
  },
  scrollContent: {
    gap: 14,
    paddingBottom: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingHorizontal: 15,
  },
  summaryLabel: {
    fontSize: 13,
    color: theme.colors.muted,
    fontWeight: '700',
  },
  summaryValue: {
    fontSize: 13,
    color: theme.colors.text,
    fontWeight: '800',
  },
  summaryValueBold: {
    fontSize: 14,
    fontWeight: '900',
  },
  summaryValueDanger: {
    color: theme.colors.danger,
  },
  note: {
    marginHorizontal: 15,
    marginTop: 10,
    marginBottom: 12,
    fontSize: 12,
    lineHeight: 17,
    color: theme.colors.muted,
    fontStyle: 'italic',
  },
});
