import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AccountPicker } from '@/components/AccountPicker';
import { AdminShell } from '@/components/AdminShell';
import { MetricCard } from '@/components/MetricCard';
import { ActionButton, Notice, formStyles as s } from '@/components/FormKit';
import { getCashFlow } from '@/services/fullApi';
import { theme } from '@/constants/theme';

const money = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0);

const isoFromDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

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

const monthRange = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return {
    start: isoFromDate(new Date(y, m - 1, 1)),
    end: isoFromDate(new Date(y, m, 0)),
  };
};

const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = date
    .toLocaleDateString('pt-BR', { weekday: 'short' })
    .replace('.', '');
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')} (${weekday})`;
};

const isoToBR = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
};

const brToIso = (value: string) => {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return '';
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
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

type Mode = 'month' | 'custom';

export default function FullCashFlow() {
  const [mode, setMode] = useState<Mode>('month');
  const [month, setMonth] = useState(currentMonthString());
  const initialRange = monthRange(currentMonthString());
  const [startInput, setStartInput] = useState(isoToBR(initialRange.start));
  const [endInput, setEndInput] = useState(isoToBR(initialRange.end));
  const [periodError, setPeriodError] = useState('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [accountId, setAccountId] = useState<number | null>(null);

  async function load(start: string, end: string, accId: number | null = accountId) {
    try {
      setLoading(true);
      setError('');
      const result = await getCashFlow(start, end, accId);
      setData(result);
    } catch (e: any) {
      setError(e?.message || 'Não foi possível carregar o fluxo de caixa.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const { start, end } = monthRange(month);
    load(start, end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  function changeMonth(delta: number) {
    setMode('month');
    setMonth((m) => shiftMonth(m, delta));
  }

  function applyCustomPeriod() {
    const start = brToIso(startInput.trim());
    const end = brToIso(endInput.trim());
    if (!start || !end) {
      setPeriodError('Datas inválidas. Use o formato DD/MM/AAAA.');
      return;
    }
    if (start > end) {
      setPeriodError('A data inicial precisa ser antes da data final.');
      return;
    }
    setPeriodError('');
    load(start, end);
  }

  function changeAccount(value: string) {
    const nextId = value ? Number(value) : null;
    setAccountId(nextId);
    if (mode === 'month') {
      const { start, end } = monthRange(month);
      load(start, end, nextId);
    } else {
      const start = brToIso(startInput.trim());
      const end = brToIso(endInput.trim());
      if (start && end) load(start, end, nextId);
    }
  }

  const totalIn = data ? data.totals?.realized_in + data.totals?.forecast_in : 0;
  const totalOut = data ? data.totals?.realized_out + data.totals?.forecast_out : 0;
  const todayIso = isoFromDate(new Date());

  return (
    <AdminShell
      title="Fluxo de Caixa"
      subtitle="Entradas, saídas e saldo projetado por período"
      syncText={
        data?.last_sync_at
          ? `Atualizado em ${new Date(data.last_sync_at).toLocaleString('pt-BR')}`
          : 'Aguardando sincronização'
      }
      refreshing={loading}
      onRefresh={() => {
        if (mode === 'month') {
          const { start, end } = monthRange(month);
          load(start, end);
        } else {
          applyCustomPeriod();
        }
      }}
      headerActions={
        <ActionButton
          label={mode === 'month' ? 'Período personalizado' : 'Voltar para mês'}
          tone="plain"
          onPress={() => {
            if (mode === 'month') {
              setMode('custom');
            } else {
              setMode('month');
              const { start, end } = monthRange(month);
              load(start, end);
            }
          }}
        />
      }
    >
      {!!error && <Notice text={error} tone="error" />}

      {!!data?.no_accounts && (
        <Notice
          text="Nenhuma conta cadastrada ainda. Vá em Financeiro → Contas para cadastrar sua primeira conta (nome, saldo inicial e data) e liberar o fluxo de caixa."
          tone="error"
        />
      )}

      {!data?.no_accounts && (data?.accounts || []).length > 0 && (
        <AccountPicker
          label="Conta"
          options={(data.accounts || []).map((a: any) => ({
            label: a.name,
            value: String(a.id),
          }))}
          value={accountId != null ? String(accountId) : ''}
          onChange={changeAccount}
          emptyLabel="Todas as contas"
        />
      )}

      {!!data && !data.no_accounts && data.clamped && (
        <Notice
          text={`Essa conta só tem saldo cadastrado a partir de ${isoToBR(data.opening_date)} — datas anteriores não aparecem.`}
        />
      )}

      {!!data && !data.no_accounts && data.has_negative_day && (
        <Notice
          text="Atenção: o saldo projetado fica negativo em algum dia deste período."
          tone="error"
        />
      )}

      {mode === 'month' ? (
        <View style={styles.monthNav}>
          <Pressable style={styles.monthArrow} onPress={() => changeMonth(-1)}>
            <Text style={styles.monthArrowText}>‹</Text>
          </Pressable>

          <Text style={styles.monthLabel}>{monthLabel(month)}</Text>

          <Pressable style={styles.monthArrow} onPress={() => changeMonth(1)}>
            <Text style={styles.monthArrowText}>›</Text>
          </Pressable>

          {month !== currentMonthString() && (
            <Pressable
              style={styles.currentMonthButton}
              onPress={() => setMonth(currentMonthString())}
            >
              <Text style={styles.currentMonthButtonText}>Mês atual</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <View style={styles.customArea}>
          <View style={styles.dateFields}>
            <View style={styles.dateField}>
              <Text style={styles.dateLabel}>Data inicial</Text>
              <TextInput
                value={startInput}
                onChangeText={(value) => {
                  setStartInput(formatDateInput(value));
                  setPeriodError('');
                }}
                placeholder="DD/MM/AAAA"
                keyboardType="number-pad"
                maxLength={10}
                style={styles.input}
              />
            </View>

            <View style={styles.dateField}>
              <Text style={styles.dateLabel}>Data final</Text>
              <TextInput
                value={endInput}
                onChangeText={(value) => {
                  setEndInput(formatDateInput(value));
                  setPeriodError('');
                }}
                placeholder="DD/MM/AAAA"
                keyboardType="number-pad"
                maxLength={10}
                style={styles.input}
              />
            </View>
          </View>

          {!!periodError && <Text style={styles.periodError}>{periodError}</Text>}

          <Pressable style={styles.applyButton} onPress={applyCustomPeriod}>
            <Text style={styles.applyButtonText}>Aplicar período</Text>
          </Pressable>
        </View>
      )}

      {!!data && !data.no_accounts && (
        <>
          <View style={s.grid}>
            <MetricCard label="Entradas no período" value={money(totalIn)} />
            <MetricCard label="Saídas no período" value={money(totalOut)} />
            <MetricCard
              label="Saldo final do período"
              value={money(data.closing_balance)}
              tone={data.closing_balance < 0 ? 'warning' : 'default'}
            />
          </View>

          <View style={s.card}>
            <Text style={s.cardTitle}>
              {data.start === data.end
                ? isoToBR(data.start)
                : `${isoToBR(data.start)} a ${isoToBR(data.end)}`}
            </Text>

            {data.rows.length === 0 ? (
              <Text style={s.empty}>Sem movimentação no período.</Text>
            ) : (
              data.rows.map((day: any) => {
                const totalDayIn = day.realized_in + day.forecast_in;
                const totalDayOut = day.realized_out + day.forecast_out;

                return (
                  <View key={day.date} style={s.row}>
                    <View style={s.main}>
                      <Text style={s.name}>
                        {dayLabel(day.date)}
                        {day.date === todayIso ? ' • hoje' : ''}
                      </Text>

                      <Text style={s.meta}>
                        {totalDayIn > 0
                          ? `Entra ${money(totalDayIn)}${
                              day.forecast_in > 0
                                ? ` (previsto ${money(day.forecast_in)})`
                                : ''
                            }`
                          : 'Sem entrada'}
                        {totalDayOut > 0
                          ? ` • Sai ${money(totalDayOut)}${
                              day.forecast_out > 0
                                ? ` (previsto ${money(day.forecast_out)})`
                                : ''
                            }`
                          : ''}
                      </Text>
                    </View>

                    <View style={s.right}>
                      <Text
                        style={[
                          s.amount,
                          day.balance < 0 && { color: '#A63D40' },
                        ]}
                      >
                        {money(day.balance)}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </>
      )}
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  monthNav: {
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
    fontSize: 16,
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
});
