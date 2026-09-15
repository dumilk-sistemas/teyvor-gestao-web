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

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>

      <View style={styles.chips}>
        {allowEmpty && (
          <Pressable
            onPress={() => onChange('')}
            style={styles.chip}
          >
            <Text style={[styles.chipText, styles.chipTextMuted]}>
              {emptyLabel}
            </Text>
          </Pressable>
        )}

        {options.map((o) => {
          const active = value === o.value;
          return (
            <Pressable
              key={o.value}
              onPress={() => onChange(o.value)}
              style={[
                styles.chip,
                active && {
                  backgroundColor: `${c.gold}1F`,
                  borderColor: c.gold,
                },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  active && { color: c.gold },
                ]}
              >
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: 7,
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: '#FAFAF8',
  },
  chipText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: theme.colors.text,
  },
  chipTextMuted: {
    color: theme.colors.muted,
    fontWeight: '600',
    fontStyle: 'italic',
  },
});
