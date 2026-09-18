import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme, useThemeColors } from '@/constants/theme';

type Option = { label: string; value: string };

export function AccountPicker({
  label,
  options,
  value,
  onChange,
  allowEmpty = true,
  emptyLabel = '(sem conta)',
}: {
  label: string;
  options: Option[];
  value: string;
  onChange: (v: string) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  const c = useThemeColors();
  const [open, setOpen] = useState(false);

  const allOptions = allowEmpty ? [{ label: emptyLabel, value: '' }, ...options] : options;
  const current = allOptions.find((o) => o.value === value);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>

      <Pressable style={styles.select} onPress={() => setOpen((v) => !v)}>
        <Text style={[styles.selectText, !current?.value && styles.selectTextMuted]}>
          {current ? current.label : emptyLabel}
        </Text>
        <Text style={styles.chevron}>{open ? '▲' : '▼'}</Text>
      </Pressable>

      {open && (
        <View style={styles.dropdown}>
          {allOptions.map((o) => {
            const active = o.value === value;
            return (
              <Pressable
                key={o.value || '(vazio)'}
                onPress={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                style={[styles.option, active && { backgroundColor: `${c.gold}1F` }]}
              >
                <Text style={[styles.optionText, active && { color: c.gold, fontWeight: '800' }]}>
                  {o.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: 7,
    position: 'relative',
    zIndex: 1,
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: '#FAFAF8',
  },
  selectText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: theme.colors.text,
  },
  selectTextMuted: {
    color: theme.colors.muted,
    fontWeight: '600',
    fontStyle: 'italic',
  },
  chevron: {
    fontSize: 11.5,
    color: theme.colors.muted,
  },
  dropdown: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  option: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  optionText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.text,
  },
});
