import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { SearchablePicker } from '@/components/FormKit';
import { theme, useThemeColors } from '@/constants/theme';

export type PeriodPreset = 'today' | 'yesterday' | '7days' | '30days' | 'month' | 'previous_month' | 'year' | 'custom';

const iso = (date: Date) => {
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

export const formatPeriodLabel = (start: string, end: string) => {
  const format = (value: string) => {
    const [year, month, day] = value.split('-');
    return year && month && day ? `${day}/${month}/${year}` : value;
  };
  return start === end ? format(start) : `${format(start)} a ${format(end)}`;
};

export function rangeForPreset(preset: Exclude<PeriodPreset, 'custom'>) {
  const now = new Date();
  const end = iso(now);
  if (preset === 'today') return { start: end, end };
  if (preset === 'yesterday') {
    const yesterday = iso(addDays(now, -1));
    return { start: yesterday, end: yesterday };
  }
  if (preset === '7days') return { start: iso(addDays(now, -6)), end };
  if (preset === '30days') return { start: iso(addDays(now, -29)), end };
  if (preset === 'month') {
    return {
      start: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
      end: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    };
  }
  if (preset === 'previous_month') {
    return {
      start: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      end: iso(new Date(now.getFullYear(), now.getMonth(), 0)),
    };
  }
  return {
    start: iso(new Date(now.getFullYear(), 0, 1)),
    end: iso(new Date(now.getFullYear(), 11, 31)),
  };
}

const PRESETS: Array<{ label: string; value: PeriodPreset; description: string }> = [
  { label: 'Hoje', value: 'today', description: 'Somente o dia atual' },
  { label: 'Ontem', value: 'yesterday', description: 'Somente o dia anterior' },
  { label: 'Últimos 7 dias', value: '7days', description: 'Hoje e os seis dias anteriores' },
  { label: 'Últimos 30 dias', value: '30days', description: 'Hoje e os 29 dias anteriores' },
  { label: 'Mês atual', value: 'month', description: 'Do primeiro ao último dia do mês' },
  { label: 'Mês anterior', value: 'previous_month', description: 'Do primeiro ao último dia do mês anterior' },
  { label: 'Ano atual', value: 'year', description: 'Do primeiro ao último dia do ano' },
  { label: 'Período personalizado', value: 'custom', description: 'Selecione a data inicial e final' },
];

function presetForRange(start: string, end: string, maxDate?: string): PeriodPreset {
  const match = PRESETS.find((option) => {
    if (option.value === 'custom') return false;
    const range = rangeForPreset(option.value);
    const limitedEnd = maxDate && range.end > maxDate ? maxDate : range.end;
    return range.start === start && limitedEnd === end;
  });
  return match?.value || 'custom';
}

const parseIso = (value?: string) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
};

const brDate = (value?: string) => {
  const parsed = parseIso(value);
  return parsed ? parsed.toLocaleDateString('pt-BR') : 'Selecione uma data';
};

const monthStart = (value?: string) => {
  const parsed = parseIso(value) || new Date();
  return new Date(parsed.getFullYear(), parsed.getMonth(), 1);
};

function CalendarField({
  label,
  value,
  active,
  onPress,
}: {
  label: string;
  value: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <View style={styles.dateColumn}>
      <Text style={styles.dateLabel}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${brDate(value)}`}
        onPress={onPress}
        style={[styles.dateButton, active && styles.dateButtonActive]}
      >
        <Text style={[styles.dateButtonText, !value && styles.dateButtonPlaceholder]}>{brDate(value)}</Text>
        <Feather name="calendar" size={17} color={active ? theme.colors.black : theme.colors.muted} />
      </Pressable>
    </View>
  );
}

export function PeriodCalendar({
  start,
  end,
  onApply,
  label = 'Período',
  compact = false,
  maxDate,
}: {
  start: string;
  end: string;
  onApply: (start: string, end: string, preset: PeriodPreset) => void;
  label?: string;
  compact?: boolean;
  maxDate?: string;
}) {
  const colors = useThemeColors();
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<PeriodPreset>('custom');
  const [draftStart, setDraftStart] = useState(start);
  const [draftEnd, setDraftEnd] = useState(end);
  const [error, setError] = useState('');
  const [calendarTarget, setCalendarTarget] = useState<'start' | 'end' | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => monthStart(start));

  useEffect(() => {
    if (!open) return;
    setDraftStart(start);
    setDraftEnd(end);
    setPreset(presetForRange(start, end, maxDate));
    setError('');
    setCalendarTarget(null);
    setCalendarMonth(monthStart(start));
  }, [open, start, end, maxDate]);

  const display = useMemo(() => formatPeriodLabel(start, end), [start, end]);
  const selectedPresetLabel = useMemo(() => {
    const selected = presetForRange(start, end, maxDate);
    return PRESETS.find((option) => option.value === selected)?.label || 'Período personalizado';
  }, [start, end, maxDate]);

  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const firstCell = new Date(year, month, 1 - firstWeekday);
    return Array.from({ length: 42 }, (_, index) => addDays(firstCell, index));
  }, [calendarMonth]);

  const activeValue = calendarTarget === 'start' ? draftStart : draftEnd;
  const calendarMin = calendarTarget === 'end' ? draftStart : undefined;
  // A data final existente não pode bloquear a escolha de uma nova data
  // inicial. Se o usuário avançar a data inicial além do fim atual, o fim
  // acompanha a seleção. `maxDate` continua sendo o único limite superior
  // quando uma tela realmente precisa restringir o período.
  const calendarMax = maxDate;

  function openCalendar(target: 'start' | 'end') {
    const value = target === 'start' ? draftStart : draftEnd;
    setCalendarTarget(target);
    setCalendarMonth(monthStart(value));
    setError('');
  }

  function selectDate(value: string) {
    if (calendarTarget === 'start') {
      setDraftStart(value);
      if (!draftEnd || value > draftEnd) setDraftEnd(value);
    }
    if (calendarTarget === 'end') setDraftEnd(value);
    setPreset('custom');
    setCalendarTarget(null);
    setError('');
  }

  function choose(next: string) {
    const selected = next as PeriodPreset;
    setPreset(selected);
    setError('');
    setCalendarTarget(null);
    if (selected !== 'custom') {
      const range = rangeForPreset(selected);
      setDraftStart(range.start);
      setDraftEnd(maxDate && range.end > maxDate ? maxDate : range.end);
    }
  }

  function apply() {
    if (!draftStart || !draftEnd) return setError('Selecione a data inicial e a data final.');
    if (draftStart > draftEnd) return setError('A data inicial não pode ser posterior à data final.');
    if (maxDate && draftEnd > maxDate) return setError('A data final não pode ser posterior a hoje.');
    onApply(draftStart, draftEnd, preset);
    setOpen(false);
  }

  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={[styles.trigger, compact && styles.triggerCompact]}>
        <View style={[styles.icon, { backgroundColor: `${colors.primary}14` }]}>
          <Feather name="calendar" size={17} color={colors.primary} />
        </View>
        <View style={styles.triggerText}>
          <Text style={styles.triggerLabel}>{label}</Text>
          <Text numberOfLines={1} style={styles.triggerValue}>{selectedPresetLabel} · {display}</Text>
        </View>
        <Feather name="chevron-down" size={18} color={theme.colors.muted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <View style={styles.header}>
              <View>
                <Text style={styles.title}>Selecionar período</Text>
                <Text style={styles.subtitle}>Escolha um atalho ou use o calendário.</Text>
              </View>
              <Pressable onPress={() => setOpen(false)} style={styles.close}>
                <Feather name="x" size={21} color={theme.colors.muted} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.bodyScroll}
              contentContainerStyle={styles.body}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
            >
              <SearchablePicker
                label="Tipo de período"
                value={preset}
                onChange={choose}
                options={PRESETS}
              />

              <View style={styles.dateArea}>
                <CalendarField label="Data inicial" value={draftStart} active={calendarTarget === 'start'} onPress={() => openCalendar('start')} />
                <CalendarField label="Data final" value={draftEnd} active={calendarTarget === 'end'} onPress={() => openCalendar('end')} />
              </View>

              {calendarTarget && (
                <View style={styles.calendarPanel}>
                  <View style={styles.calendarHeader}>
                    <Pressable
                      accessibilityLabel="Mês anterior"
                      onPress={() => setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
                      style={styles.calendarNavButton}
                    >
                      <Feather name="chevron-left" size={19} color={theme.colors.text} />
                    </Pressable>
                    <Text style={styles.calendarTitle}>
                      {calendarMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                    </Text>
                    <Pressable
                      accessibilityLabel="Próximo mês"
                      onPress={() => setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
                      style={styles.calendarNavButton}
                    >
                      <Feather name="chevron-right" size={19} color={theme.colors.text} />
                    </Pressable>
                  </View>

                  <View style={styles.calendarGrid}>
                    {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((weekday, index) => (
                      <View key={`${weekday}-${index}`} style={styles.calendarCell}>
                        <Text style={styles.calendarWeekday}>{weekday}</Text>
                      </View>
                    ))}
                    {calendarDays.map((date) => {
                      const value = iso(date);
                      const outside = date.getMonth() !== calendarMonth.getMonth();
                      const selected = value === activeValue;
                      const today = value === iso(new Date());
                      const disabled = Boolean((calendarMin && value < calendarMin) || (calendarMax && value > calendarMax));
                      return (
                        <View key={value} style={styles.calendarCell}>
                          <Pressable
                            disabled={disabled}
                            accessibilityLabel={date.toLocaleDateString('pt-BR')}
                            onPress={() => selectDate(value)}
                            style={[
                              styles.calendarDay,
                              today && styles.calendarToday,
                              selected && styles.calendarDaySelected,
                              disabled && styles.calendarDayDisabled,
                            ]}
                          >
                            <Text style={[
                              styles.calendarDayText,
                              outside && styles.calendarDayOutside,
                              selected && styles.calendarDayTextSelected,
                              disabled && styles.calendarDayTextDisabled,
                            ]}>
                              {date.getDate()}
                            </Text>
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}
              {!!error && <Text style={styles.error}>{error}</Text>}
            </ScrollView>

            <View style={styles.footer}>
              <Pressable onPress={() => setOpen(false)} style={styles.cancel}><Text style={styles.cancelText}>Cancelar</Text></Pressable>
              <Pressable onPress={apply} style={styles.apply}><Text style={styles.applyText}>Aplicar período</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { minWidth: 250, minHeight: 56, paddingHorizontal: 12, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, backgroundColor: '#FFF', flexDirection: 'row', alignItems: 'center', gap: 10 },
  triggerCompact: { minWidth: 220, minHeight: 48 },
  icon: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  triggerText: { flex: 1 }, triggerLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 11.5, color: theme.colors.muted },
  triggerValue: { marginTop: 2, fontFamily: 'Inter_700Bold', fontSize: 13.5, color: theme.colors.text },
  backdrop: { flex: 1, backgroundColor: 'rgba(10,14,20,.48)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  modal: { width: '100%', maxWidth: 660, maxHeight: '92%', borderRadius: 18, backgroundColor: '#FFF', overflow: 'hidden' },
  header: { padding: 18, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  title: { fontFamily: 'Sora_700Bold', fontSize: 20, color: theme.colors.text }, subtitle: { marginTop: 4, fontFamily: 'Inter_400Regular', fontSize: 13, color: theme.colors.muted },
  close: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F6F5F2' },
  bodyScroll: { flexShrink: 1 },
  body: { padding: 18, gap: 14 }, dateArea: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 12, borderRadius: 12, backgroundColor: '#F7F6F3' },
  dateColumn: { flex: 1, minWidth: 220, gap: 6 }, dateLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12.5, color: theme.colors.muted },
  dateButton: { alignItems: 'center', backgroundColor: '#FFF', borderColor: theme.colors.border, borderRadius: 10, borderWidth: 1, flexDirection: 'row', height: 48, justifyContent: 'space-between', paddingHorizontal: 12 },
  dateButtonActive: { borderColor: theme.colors.black, borderWidth: 2 },
  dateButtonText: { color: theme.colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  dateButtonPlaceholder: { color: theme.colors.muted, fontFamily: 'Inter_400Regular' },
  calendarPanel: { alignSelf: 'center', backgroundColor: '#FFF', borderColor: theme.colors.border, borderRadius: 14, borderWidth: 1, maxWidth: 370, padding: 12, width: '100%' },
  calendarHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  calendarNavButton: { alignItems: 'center', borderColor: theme.colors.border, borderRadius: 8, borderWidth: 1, height: 34, justifyContent: 'center', width: 34 },
  calendarTitle: { color: theme.colors.text, fontFamily: 'Sora_700Bold', fontSize: 14, textTransform: 'capitalize' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarCell: { alignItems: 'center', justifyContent: 'center', width: '14.2857%' },
  calendarWeekday: { color: theme.colors.muted, fontFamily: 'Inter_700Bold', fontSize: 11, paddingVertical: 6 },
  calendarDay: { alignItems: 'center', borderColor: 'transparent', borderRadius: 9, borderWidth: 1, height: 36, justifyContent: 'center', marginVertical: 1, width: 36 },
  calendarToday: { borderColor: '#9BB4D1' },
  calendarDaySelected: { backgroundColor: theme.colors.black, borderColor: theme.colors.black },
  calendarDayDisabled: { opacity: 0.3 },
  calendarDayText: { color: theme.colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 12.5 },
  calendarDayOutside: { color: '#AEB4BA' },
  calendarDayTextSelected: { color: '#FFF', fontFamily: 'Inter_700Bold' },
  calendarDayTextDisabled: { color: '#AEB4BA' },
  error: { fontFamily: 'Inter_600SemiBold', fontSize: 12.5, color: theme.colors.danger },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: theme.colors.border, flexDirection: 'row', justifyContent: 'flex-end', gap: 9 },
  cancel: { paddingHorizontal: 15, paddingVertical: 10, borderRadius: 9, borderWidth: 1, borderColor: theme.colors.border }, cancelText: { fontFamily: 'Inter_700Bold', fontSize: 13, color: theme.colors.text },
  apply: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 9, backgroundColor: theme.colors.black }, applyText: { fontFamily: 'Inter_700Bold', fontSize: 13, color: '#FFF' },
});
