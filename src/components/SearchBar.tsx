import { StyleSheet, TextInput, View } from 'react-native';
import { theme } from '@/constants/theme';

type Props = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
};

export function SearchBar({ value, onChangeText, placeholder = 'Buscar...' }: Props) {
  return (
    <View style={styles.wrap}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 2,
  },
  input: {
    minWidth: 240,
    height: 46,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
    fontSize: 14,
    color: theme.colors.text,
  },
});
