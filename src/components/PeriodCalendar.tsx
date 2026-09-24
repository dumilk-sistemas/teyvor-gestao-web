import { createElement, useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { DateField, SearchablePicker } from '@/components/FormKit';
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

function NativeDateInput({ value, onChange, min, max }: { value: string; onChange: (value: string) => void; min?: string; max?: string }) {
  if (Platform.OS === 'web') {
    return createElement('input', {
      type: 'date',
      value,
      min,
      max,
      onChange: (event: any) => onChange(event.target.value),
      style: {
        width: '100%', height: 48, boxSizing: 'border-box', border: `1px solid ${theme.colors.border}`,
        borderRadius: 10, padding: '0 12px', fontFamily: 'Inter_400Regular', fontSize: 14,
        color: theme.colors.text, background: '#FFF', outline: 'none', colorScheme: 'light',
      },
    });
  }
  return <DateField label="" value={value} onChangeText={onChange} />;
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

  useEffect(() => {
    if (!open) return;
    setDraftStart(start);
    setDraftEnd(end);
    setPreset(presetForRange(start, end, maxDate));
    setError('');
  }, [open, start, end, maxDate]);

  const display = useMemo(() => formatPeriodLabel(start, end), [start, end]);
  const selectedPresetLabel = useMemo(() => {
    const selected = presetForRange(start, end, maxDate);
    return PRESETS.find((option) => option.value === selected)?.label || 'Período personalizado';
  }, [start, end, maxDate]);

  function choose(next: string) {
    const selected = next as PeriodPreset;
    setPreset(selected);
    setError('');
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

            <View style={styles.body}>
              <SearchablePicker
                label="Tipo de período"
                value={preset}
                onChange={choose}
                options={PRESETS}
              />

              <View style={styles.dateArea}>
                <View style={styles.dateColumn}>
                  <Text style={styles.dateLabel}>Data inicial</Text>
                  <NativeDateInput
                    value={draftStart}
                    max={draftEnd && maxDate ? (draftEnd < maxDate ? draftEnd : maxDate) : draftEnd || maxDate}
                    onChange={(value) => { setDraftStart(value); setPreset('custom'); }}
                  />
                </View>
                <View style={styles.dateColumn}>
                  <Text style={styles.dateLabel}>Data final</Text>
                  <NativeDateInput
                    value={draftEnd}
                    min={draftStart}
                    max={maxDate}
                    onChange={(value) => { setDraftEnd(value); setPreset('custom'); }}
                  />
                </View>
              </View>
              {!!error && <Text style={styles.error}>{error}</Text>}
            </View>

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
  body: { padding: 18, gap: 14 }, dateArea: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 12, borderRadius: 12, backgroundColor: '#F7F6F3' },
  dateColumn: { flex: 1, minWidth: 220, gap: 6 }, dateLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12.5, color: theme.colors.muted },
  error: { fontFamily: 'Inter_600SemiBold', fontSize: 12.5, color: theme.colors.danger },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: theme.colors.border, flexDirection: 'row', justifyContent: 'flex-end', gap: 9 },
  cancel: { paddingHorizontal: 15, paddingVertical: 10, borderRadius: 9, borderWidth: 1, borderColor: theme.colors.border }, cancelText: { fontFamily: 'Inter_700Bold', fontSize: 13, color: theme.colors.text },
  apply: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 9, backgroundColor: theme.colors.black }, applyText: { fontFamily: 'Inter_700Bold', fontSize: 13, color: '#FFF' },
});
