import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { router } from 'expo-router';

import { AccountPicker } from '@/components/AccountPicker';
import { AccountsModal } from '@/components/AccountsModal';
import { AdminShell } from '@/components/AdminShell';
import { MetricCard } from '@/components/MetricCard';
import { SearchBar } from '@/components/SearchBar';
import {
  ActionButton,
  Choice,
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

const statusLabel = (status: string) => {
  if (status === 'paid') return 'Pago';
  if (status === 'received') return 'Recebido';
  if (status === 'overdue') return 'Vencido';
  return 'Em aberto';
};

export default function FullFinance() {
  const [data, setData] = useState<any>(null);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('entry');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<any>({});
  const [search, setSearch] = useState('');

  const [monthlyOpen, setMonthlyOpen] = useState(false);
  const [monthlyMonth, setMonthlyMonth] = useState(currentMonthString());
  const [monthlyData, setMonthlyData] = useState<any>(null);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [monthlyError, setMonthlyError] = useState('');

  const [accountsOpen, setAccountsOpen] = useState(false);

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

    if (!term) {
      return entries;
    }

    return entries.filter((row: any) =>
      [row.description, row.category]
        .filter(Boolean)
        .some((field) =>
          String(field).toLocaleLowerCase('pt-BR').includes(term)
        )
    );
  }, [data, search]);

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

      const financeData = await getFull('finance');

      // Fornecedores só são usados para exibir o nome em contas a
      // pagar. Perfis sem acesso a Fornecedores ainda veem o
      // financeiro normalmente.
      const supplierData = await getFull('suppliers').catch(() => null);

      setData(financeData);
      setSuppliers(supplierData?.rows || []);
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
    setMode('settle');

    setForm({
      id: row.id,
      description: row.description,
      type: row.type,
      date: today(),
      method: 'Pix',
      note: '',
    });

    setOpen(true);
  };

  const startAnticipate = (
    row: any
  ) => {
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

      if (
        mode === 'entry' &&
        form.recurringMode &&
        form.recurringMode !== 'none' &&
        !form.id
      ) {
        const amount = Number(
          String(form.amount || '0').replace(',', '.')
        );
        const dueDay = Number(String(form.dueDate || '').slice(8, 10)) || 1;
        const startMonth = String(form.dueDate || '').slice(0, 7);
        let endMonth: string | null = null;
        if (form.recurringMode === 'months') {
          const count = Number(form.recurringMonthsCount || '0');
          if (!(count >= 1)) {
            setError('Informe quantos meses (1 ou mais).');
            setBusy(false);
            return;
          }
          endMonth = shiftMonth(startMonth, count - 1);
        }
        const result = await createRecurringRule({
          type: form.type,
          description: form.description,
          category_id: form.categoryId,
          supplier_id: form.supplierId || null,
          amount,
          amount_mode: form.recurringAmountMode || 'fixed',
          due_day: dueDay,
          start_month: startMonth,
          end_month: endMonth,
          notes: form.notes || '',
          active: true,
        });
        setOpen(false);
        showToast(
          `Conta recorrente criada. ${result?.created || 0} parcela(s) gerada(s) automaticamente.`
        );
        setTimeout(() => {
          load();
        }, 1200);
        return;
      } else if (mode === 'entry') {
        await enqueue(
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
                form.supplierId || null,
              amount: Number(
                String(
                  form.amount || '0'
                ).replace(',', '.')
              ),
              competenceDate:
                form.competenceDate,
              dueDate: form.dueDate,
              notes: form.notes || '',
            },
          }
        );
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

      setOpen(false);
      showToast(commandMessage);

      setTimeout(() => {
        load();
      }, 1200);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Falha ao enviar operação financeira.'
      );
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
      title="Financeiro"
      subtitle="Contas a pagar, receber, baixas e antecipações"
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
          <ActionButton
            label="+ Conta a pagar"
            tone="gold"
            onPress={() =>
              startEntry('payable')
            }
          />

          <ActionButton
            label="+ Conta a receber"
            tone="dark"
            onPress={() =>
              startEntry('receivable')
            }
          />

          <ActionButton
            label="Contas"
            tone="plain"
            onPress={() => setAccountsOpen(true)}
          />

          <ActionButton
            label="Fluxo de Caixa"
            tone="plain"
            onPress={() => router.push('/cashflow')}
          />

          <ActionButton
            label="Fiscal"
            tone="plain"
            onPress={() => router.push('/fiscal')}
          />

          <ActionButton
            label="Relatório mensal"
            tone="plain"
            onPress={openMonthlyReport}
          />
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
          <View style={s.grid}>
            <MetricCard
              label="A pagar"
              value={money(
                data.summary
                  ?.open_payables || 0
              )}
            />

            <MetricCard
              label="Vencido"
              value={money(
                data.summary
                  ?.overdue_payables || 0
              )}
              tone={
                (data.summary?.overdue_payables || 0) > 0
                  ? 'warning'
                  : 'default'
              }
            />

            <MetricCard
              label="Vence hoje"
              value={money(nearTerm.dueToday)}
              tone={nearTerm.dueToday > 0 ? 'warning' : 'default'}
            />

            <MetricCard
              label="Próximos 7 dias"
              value={money(nearTerm.due7Days)}
            />

            <MetricCard
              label="A receber"
              value={money(
                data.summary
                  ?.open_receivables || 0
              )}
            />

            <MetricCard
              label="Cartões previstos"
              value={money(
                data.summary
                  ?.card_forecast || 0
              )}
            />
          </View>

          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por descrição ou categoria"
          />

          <View style={s.card}>
            <Text style={s.cardTitle}>
              Lançamentos
            </Text>

            {filteredEntries.length >
            0 ? (
              filteredEntries.map(
                (row: any) => (
                  <View
                    key={String(row.id)}
                    style={s.row}
                  >
                    <View style={s.main}>
                      <Text style={s.name}>
                        {row.description}
                        {row.recurring_rule_id ? ' 🔁' : ''}
                      </Text>

                      <Text style={s.meta}>
                        {row.category} • vence{' '}
                        {row.due_date} •{' '}
                        {row.type ===
                        'payable'
                          ? 'A pagar'
                          : 'A receber'}
                      </Text>

                      {(data.accounts || []).length > 0 && (
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

                    <View style={s.right}>
                      <Text style={s.amount}>
                        {money(row.amount)}
                      </Text>

                      <Text
                        style={[
                          s.badge,
                          row.status ===
                            'overdue' &&
                            s.badBadge,
                        ]}
                      >
                        {row.status}
                      </Text>

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
                    </View>
                  </View>
                )
              )
            ) : (
              <Text style={s.empty}>
                {search
                  ? 'Nenhum lançamento encontrado para essa busca.'
                  : 'Nenhum lançamento.'}
              </Text>
            )}
          </View>

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
                      previsão {row.date}
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
        onCancel={() =>
          setOpen(false)
        }
        onSave={save}
        busy={busy}
      >
        {mode === 'entry' ? (
          <>
            <Choice
              label="Tipo"
              value={form.type || 'payable'}
              onChange={(value) =>
                set('type', value)
              }
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
              label="Descrição *"
              value={
                form.description || ''
              }
              onChangeText={(value) =>
                set(
                  'description',
                  value
                )
              }
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
                label="Fornecedor"
                value={
                  form.supplierId || ''
                }
                onChange={(value) =>
                  set(
                    'supplierId',
                    value
                  )
                }
                emptyLabel="Sem fornecedor"
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

            <Field
              label="Valor *"
              value={form.amount || ''}
              onChangeText={(value) =>
                set('amount', value)
              }
              keyboardType="decimal-pad"
            />

            <Field
              label="Competência"
              value={
                form.competenceDate ||
                today()
              }
              onChangeText={(value) =>
                set(
                  'competenceDate',
                  value
                )
              }
              placeholder="AAAA-MM-DD"
            />

            <Field
              label="Vencimento *"
              value={
                form.dueDate || today()
              }
              onChangeText={(value) =>
                set(
                  'dueDate',
                  value
                )
              }
              placeholder="AAAA-MM-DD"
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

            <Field
              label="Data da baixa *"
              value={form.date || today()}
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

            <Field
              label="Data da antecipação"
              value={form.date || today()}
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
                              Vence {row.due_date} • {row.category} •{' '}
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

      <AccountsModal
        visible={accountsOpen}
        onClose={() => setAccountsOpen(false)}
        onChanged={load}
      />
    </AdminShell>
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