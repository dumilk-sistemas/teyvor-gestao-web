import { createElement, type ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { theme, useThemeColors } from '@/constants/theme';
import { brDateToISO, formatDateBR } from '@/utils/date';

export function ActionButton({label,onPress,tone='dark',disabled=false}:{label:string;onPress:()=>void;tone?:'dark'|'gold'|'danger'|'plain';disabled?:boolean}){
  const c = useThemeColors();
  const toneStyle = tone === 'gold' ? { backgroundColor: c.gold } : styles[`button_${tone}`];
  return <Pressable disabled={disabled} onPress={onPress} style={[styles.button,toneStyle,disabled&&styles.disabled]}><Text style={[styles.buttonText,tone==='plain'&&styles.plainText]}>{label}</Text></Pressable>;
}

export function Field({label,value,onChangeText,placeholder='',keyboardType='default',multiline=false}:{label:string;value:string;onChangeText:(v:string)=>void;placeholder?:string;keyboardType?:any;multiline?:boolean}){
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} keyboardType={keyboardType} multiline={multiline} style={[styles.input,multiline&&styles.multiline]}/></View>;
}

export function DateField({label,value,onChangeText,min,max}:{label:string;value:string;onChangeText:(v:string)=>void;min?:string;max?:string}){
  if (Platform.OS === 'web') {
    return <View style={styles.field}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      {createElement('input', {
        type: 'date',
        value: value || '',
        min,
        max,
        onChange: (event: any) => onChangeText(event.target.value),
        style: {
          width: '100%', height: 48, boxSizing: 'border-box',
          border: `1px solid ${theme.colors.border}`, borderRadius: 10,
          padding: '0 12px', fontFamily: 'Inter_400Regular', fontSize: 14.5,
          color: theme.colors.text, background: '#FFF', outline: 'none', colorScheme: 'light',
        },
      })}
    </View>;
  }
  return <NativeDateParts label={label} value={value} onChangeText={onChangeText} />;
}

function NativeDateParts({label,value,onChangeText}:{label:string;value:string;onChangeText:(v:string)=>void}) {
  const split = (source: string) => {
    const formatted = formatDateBR(source);
    const match = formatted.match(/^(\d{0,2})\/?(\d{0,2})?\/?(\d{0,4})?/);
    return { day: match?.[1] || '', month: match?.[2] || '', year: match?.[3] || '' };
  };
  const [parts, setParts] = useState(() => split(value));
  const lastEmittedValue = useRef<string | null>(null);
  useEffect(() => {
    if (lastEmittedValue.current === value) {
      lastEmittedValue.current = null;
      return;
    }
    setParts(split(value));
  }, [value]);

  function change(part: 'day' | 'month' | 'year', rawValue: string) {
    const max = part === 'year' ? 4 : 2;
    const nextParts = { ...parts, [part]: rawValue.replace(/\D/g, '').slice(0, max) };
    const display = `${nextParts.day}/${nextParts.month}/${nextParts.year}`;
    const nextValue = brDateToISO(display) || display;
    setParts(nextParts);
    lastEmittedValue.current = nextValue;
    onChangeText(nextValue);
  }
  return <View style={styles.field}>
    {!!label && <Text style={styles.label}>{label}</Text>}
    <View style={styles.dateInput}>
      <TextInput value={parts.day} onChangeText={(v)=>change('day',v)} placeholder="DD" keyboardType="number-pad" selectTextOnFocus maxLength={2} style={[styles.datePart,styles.datePartShort]}/>
      <Text style={styles.dateSeparator}>/</Text>
      <TextInput value={parts.month} onChangeText={(v)=>change('month',v)} placeholder="MM" keyboardType="number-pad" selectTextOnFocus maxLength={2} style={[styles.datePart,styles.datePartShort]}/>
      <Text style={styles.dateSeparator}>/</Text>
      <TextInput value={parts.year} onChangeText={(v)=>change('year',v)} placeholder="AAAA" keyboardType="number-pad" selectTextOnFocus maxLength={4} style={[styles.datePart,styles.datePartYear]}/>
    </View>
  </View>;
}

export function Choice({label,options,value,onChange}:{label:string;options:Array<{label:string;value:string}>;value:string;onChange:(v:string)=>void}){
  const c = useThemeColors();
  if (options.length > 3) {
    return <SearchablePicker label={label} options={options} value={value} onChange={onChange} />;
  }
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><View style={styles.choices}>{options.map(o=>{const on=o.value===value;return <Pressable key={o.value} onPress={()=>onChange(o.value)} style={[styles.choice,on&&{backgroundColor:`${c.gold}1F`,borderColor:c.gold}]}><Text style={[styles.choiceText,on&&{color:c.gold,fontWeight:'700'}]}>{o.label}</Text></Pressable>;})}</View></View>;
}

export function SearchablePicker({
  label,
  options,
  value,
  onChange,
  placeholder = 'Selecione uma opção',
  searchPlaceholder = 'Buscar...',
  emptyText = 'Nenhuma opção encontrada.',
}: {
  label: string;
  options: Array<{ label: string; value: string; description?: string }>;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
}) {
  const c = useThemeColors();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = options.find((option) => option.value === value);
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    if (!term) return options;
    return options.filter((option) =>
      [option.label, option.description]
        .filter(Boolean)
        .some((text) =>
          String(text).toLocaleLowerCase('pt-BR').includes(term)
        )
    );
  }, [options, search]);

  function select(nextValue: string) {
    onChange(nextValue);
    setSearch('');
    setOpen(false);
  }

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={() => setOpen((current) => !current)}
        style={[styles.pickerButton, open && { borderColor: c.gold }]}
      >
        <View style={styles.pickerTextArea}>
          <Text
            style={selected ? styles.pickerValue : styles.pickerPlaceholder}
            numberOfLines={1}
          >
            {selected?.label || placeholder}
          </Text>
          {!!selected?.description && (
            <Text style={styles.pickerDescription} numberOfLines={1}>
              {selected.description}
            </Text>
          )}
        </View>
        <Text style={styles.pickerChevron}>{open ? '⌃' : '⌄'}</Text>
      </Pressable>

      {open && (
        <View style={styles.pickerPanel}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={searchPlaceholder}
            autoFocus
            style={styles.pickerSearch}
          />
          <ScrollView
            style={styles.pickerList}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            {filtered.map((option) => {
              const active = option.value === value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => select(option.value)}
                  style={[
                    styles.pickerOption,
                    active && { backgroundColor: `${c.gold}14` },
                  ]}
                >
                  <View style={styles.pickerTextArea}>
                    <Text
                      style={[
                        styles.pickerOptionLabel,
                        active && { color: c.gold },
                      ]}
                    >
                      {option.label}
                    </Text>
                    {!!option.description && (
                      <Text style={styles.pickerDescription}>
                        {option.description}
                      </Text>
                    )}
                  </View>
                  {active && <Text style={{ color: c.gold, fontWeight: '900' }}>✓</Text>}
                </Pressable>
              );
            })}
            {filtered.length === 0 && (
              <Text style={styles.pickerEmpty}>{emptyText}</Text>
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

export function FormModal({visible,title,children,onCancel,onSave,saveLabel='Salvar',busy=false,wide=false,errorText=''}:{visible:boolean;title:string;children:ReactNode;onCancel:()=>void;onSave:()=>void;saveLabel?:string;busy?:boolean;wide?:boolean;errorText?:string}){
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}><View style={styles.backdrop}><View style={[styles.modal,wide&&styles.wide]}><View style={styles.head}><Text style={styles.title}>{title}</Text><Pressable onPress={onCancel}><Text style={styles.close}>×</Text></Pressable></View><ScrollView contentContainerStyle={styles.body}>{children}</ScrollView>{!!errorText&&<View style={styles.footerError}><Notice text={errorText} tone="error"/></View>}<View style={styles.actions}><ActionButton label="Cancelar" tone="plain" onPress={onCancel}/><ActionButton disabled={busy} label={busy?'Enviando...':saveLabel} tone="gold" onPress={onSave}/></View></View></View></Modal>;
}

export function Notice({text,tone='ok'}:{text:string;tone?:'ok'|'error'}){return <View style={[styles.notice,tone==='error'&&styles.noticeError]}><Text style={[styles.noticeText,tone==='error'&&styles.noticeErrorText]}>{text}</Text></View>}

// react-native-web nao implementa Alert.alert (e' um metodo vazio),
// entao qualquer confirmacao baseada nele nunca aparece e a Promise
// nunca resolve -- usa o confirm() nativo do navegador em vez disso.
export function confirmAction(title: string, message: string): Promise<boolean> {
  if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return Promise.resolve(true);
}

export const formStyles=StyleSheet.create({
  grid:{flexDirection:'row',flexWrap:'wrap',gap:10},card:{backgroundColor:'#FFF',borderWidth:1,borderColor:theme.colors.border,borderRadius:theme.radius.md,overflow:'hidden'},
  cardTitle:{fontFamily:'Sora_700Bold',fontSize:17,padding:16,color:theme.colors.text},row:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:12,padding:15,borderTopWidth:1,borderTopColor:theme.colors.border},
  main:{flex:1},right:{alignItems:'flex-end'},name:{fontFamily:'Inter_700Bold',fontSize:14,color:theme.colors.text},meta:{fontFamily:'Inter_400Regular',fontSize:13,color:theme.colors.muted,marginTop:4},amount:{fontFamily:'Inter_700Bold',fontSize:15,color:theme.colors.text},
  empty:{padding:18,color:theme.colors.muted,fontSize:14},toolbar:{flexDirection:'row',flexWrap:'wrap',gap:8,justifyContent:'flex-end'},error:{color:theme.colors.danger,fontSize:14,fontWeight:'700'},
  badge:{fontFamily:'Inter_700Bold',fontSize:11.5,paddingHorizontal:8,paddingVertical:4,borderRadius:10,backgroundColor:'#EAF7EF',color:theme.colors.success},badBadge:{backgroundColor:'#FDECEC',color:theme.colors.danger},
});

const styles=StyleSheet.create({
  backdrop:{flex:1,backgroundColor:'rgba(0,0,0,.48)',alignItems:'center',justifyContent:'center',padding:18},modal:{width:'100%',maxWidth:620,maxHeight:'92%',backgroundColor:'#FFF',borderRadius:18,overflow:'hidden'},wide:{maxWidth:900},
  head:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',padding:18,borderBottomWidth:1,borderBottomColor:theme.colors.border},title:{fontFamily:'Sora_700Bold',fontSize:20,color:theme.colors.text},close:{fontSize:30,lineHeight:30,color:theme.colors.muted},body:{padding:18,gap:13},footerError:{paddingHorizontal:16,paddingTop:12},actions:{flexDirection:'row',justifyContent:'flex-end',gap:9,padding:16,borderTopWidth:1,borderTopColor:theme.colors.border},
  field:{gap:6},label:{fontFamily:'Inter_600SemiBold',fontSize:12.5,color:theme.colors.muted},input:{borderWidth:1,borderColor:theme.colors.border,borderRadius:10,paddingHorizontal:12,paddingVertical:11,fontFamily:'Inter_400Regular',fontSize:14.5,color:theme.colors.text,backgroundColor:'#FFF'},multiline:{minHeight:82,textAlignVertical:'top'},
  dateInput:{minHeight:48,borderWidth:1,borderColor:theme.colors.border,borderRadius:10,paddingHorizontal:10,backgroundColor:'#FFF',flexDirection:'row',alignItems:'center'},datePart:{paddingVertical:10,paddingHorizontal:4,fontSize:15,color:theme.colors.text,textAlign:'center',outlineStyle:'none' as any},datePartShort:{width:42},datePartYear:{width:62},dateSeparator:{fontSize:16,fontWeight:'800',color:theme.colors.muted},
  choices:{flexDirection:'row',flexWrap:'wrap',gap:7},choice:{borderWidth:1,borderColor:theme.colors.border,borderRadius:9,paddingHorizontal:11,paddingVertical:7,backgroundColor:'#FAFAF8'},choiceText:{fontFamily:'Inter_600SemiBold',fontSize:12.5,color:theme.colors.text},
  pickerButton:{minHeight:48,borderWidth:1,borderColor:theme.colors.border,borderRadius:10,paddingHorizontal:12,paddingVertical:9,backgroundColor:'#FFF',flexDirection:'row',alignItems:'center',gap:10},pickerTextArea:{flex:1,minWidth:0},pickerValue:{fontFamily:'Inter_600SemiBold',fontSize:14,color:theme.colors.text},pickerPlaceholder:{fontFamily:'Inter_400Regular',fontSize:14,color:theme.colors.muted},pickerDescription:{fontFamily:'Inter_400Regular',fontSize:12,color:theme.colors.muted,marginTop:2},pickerChevron:{fontSize:18,color:theme.colors.muted},pickerPanel:{borderWidth:1,borderColor:theme.colors.border,borderRadius:10,backgroundColor:'#FFF',overflow:'hidden'},pickerSearch:{margin:10,borderWidth:1,borderColor:theme.colors.border,borderRadius:8,paddingHorizontal:11,paddingVertical:9,fontFamily:'Inter_400Regular',fontSize:14,color:theme.colors.text,backgroundColor:'#FAFAF8'},pickerList:{maxHeight:230},pickerOption:{minHeight:48,paddingHorizontal:12,paddingVertical:9,borderTopWidth:1,borderTopColor:'#F0EFEA',flexDirection:'row',alignItems:'center',gap:10},pickerOptionLabel:{fontFamily:'Inter_600SemiBold',fontSize:13.5,color:theme.colors.text},pickerEmpty:{padding:16,fontSize:13,color:theme.colors.muted,textAlign:'center'},
  button:{borderRadius:9,paddingHorizontal:14,paddingVertical:9,alignItems:'center',justifyContent:'center'},button_dark:{backgroundColor:theme.colors.black},button_danger:{backgroundColor:theme.colors.danger},button_plain:{backgroundColor:'#FFF',borderWidth:1,borderColor:theme.colors.border},buttonText:{color:'#FFF',fontFamily:'Inter_700Bold',fontSize:13},plainText:{color:theme.colors.text},disabled:{opacity:.55},
  notice:{backgroundColor:'#EAF7EF',borderRadius:10,padding:12},noticeError:{backgroundColor:'#FDECEC'},noticeText:{color:theme.colors.success,fontFamily:'Inter_600SemiBold',fontSize:13,lineHeight:18},noticeErrorText:{color:theme.colors.danger},
});
