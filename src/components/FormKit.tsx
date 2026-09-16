import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { theme, useThemeColors } from '@/constants/theme';

export function ActionButton({label,onPress,tone='dark',disabled=false}:{label:string;onPress:()=>void;tone?:'dark'|'gold'|'danger'|'plain';disabled?:boolean}){
  const c = useThemeColors();
  const toneStyle = tone === 'gold' ? { backgroundColor: c.gold } : styles[`button_${tone}`];
  return <Pressable disabled={disabled} onPress={onPress} style={[styles.button,toneStyle,disabled&&styles.disabled]}><Text style={[styles.buttonText,tone==='plain'&&styles.plainText]}>{label}</Text></Pressable>;
}

export function Field({label,value,onChangeText,placeholder='',keyboardType='default',multiline=false}:{label:string;value:string;onChangeText:(v:string)=>void;placeholder?:string;keyboardType?:any;multiline?:boolean}){
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} keyboardType={keyboardType} multiline={multiline} style={[styles.input,multiline&&styles.multiline]}/></View>;
}

export function Choice({label,options,value,onChange}:{label:string;options:Array<{label:string;value:string}>;value:string;onChange:(v:string)=>void}){
  const c = useThemeColors();
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><View style={styles.choices}>{options.map(o=>{const on=o.value===value;return <Pressable key={o.value} onPress={()=>onChange(o.value)} style={[styles.choice,on&&{backgroundColor:`${c.gold}1F`,borderColor:c.gold}]}><Text style={[styles.choiceText,on&&{color:c.gold,fontWeight:'700'}]}>{o.label}</Text></Pressable>;})}</View></View>;
}

export function FormModal({visible,title,children,onCancel,onSave,saveLabel='Salvar',busy=false,wide=false}:{visible:boolean;title:string;children:ReactNode;onCancel:()=>void;onSave:()=>void;saveLabel?:string;busy?:boolean;wide?:boolean}){
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}><View style={styles.backdrop}><View style={[styles.modal,wide&&styles.wide]}><View style={styles.head}><Text style={styles.title}>{title}</Text><Pressable onPress={onCancel}><Text style={styles.close}>×</Text></Pressable></View><ScrollView contentContainerStyle={styles.body}>{children}</ScrollView><View style={styles.actions}><ActionButton label="Cancelar" tone="plain" onPress={onCancel}/><ActionButton disabled={busy} label={busy?'Enviando...':saveLabel} tone="gold" onPress={onSave}/></View></View></View></Modal>;
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
  cardTitle:{fontSize:18,fontWeight:'900',padding:16,color:theme.colors.text},row:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:12,padding:15,borderTopWidth:1,borderTopColor:theme.colors.border},
  main:{flex:1},right:{alignItems:'flex-end'},name:{fontSize:15,fontWeight:'900',color:theme.colors.text},meta:{fontSize:13,color:theme.colors.muted,marginTop:4},amount:{fontSize:16,fontWeight:'900',color:theme.colors.text},
  empty:{padding:18,color:theme.colors.muted,fontSize:14},toolbar:{flexDirection:'row',flexWrap:'wrap',gap:8,justifyContent:'flex-end'},error:{color:theme.colors.danger,fontSize:14,fontWeight:'700'},
  badge:{fontSize:12,fontWeight:'900',paddingHorizontal:8,paddingVertical:4,borderRadius:10,backgroundColor:'#EAF7EF',color:theme.colors.success},badBadge:{backgroundColor:'#FDECEC',color:theme.colors.danger},
});

const styles=StyleSheet.create({
  backdrop:{flex:1,backgroundColor:'rgba(0,0,0,.48)',alignItems:'center',justifyContent:'center',padding:18},modal:{width:'100%',maxWidth:620,maxHeight:'92%',backgroundColor:'#FFF',borderRadius:18,overflow:'hidden'},wide:{maxWidth:900},
  head:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',padding:18,borderBottomWidth:1,borderBottomColor:theme.colors.border},title:{fontSize:21,fontWeight:'900',color:theme.colors.text},close:{fontSize:30,lineHeight:30,color:theme.colors.muted},body:{padding:18,gap:13},actions:{flexDirection:'row',justifyContent:'flex-end',gap:9,padding:16,borderTopWidth:1,borderTopColor:theme.colors.border},
  field:{gap:6},label:{fontSize:12,fontWeight:'700',color:theme.colors.muted},input:{borderWidth:1,borderColor:theme.colors.border,borderRadius:10,paddingHorizontal:12,paddingVertical:11,fontSize:15,color:theme.colors.text,backgroundColor:'#FFF'},multiline:{minHeight:82,textAlignVertical:'top'},
  choices:{flexDirection:'row',flexWrap:'wrap',gap:7},choice:{borderWidth:1,borderColor:theme.colors.border,borderRadius:9,paddingHorizontal:11,paddingVertical:7,backgroundColor:'#FAFAF8'},choiceText:{fontSize:12.5,fontWeight:'600',color:theme.colors.text},
  button:{borderRadius:9,paddingHorizontal:14,paddingVertical:9,alignItems:'center',justifyContent:'center'},button_dark:{backgroundColor:theme.colors.black},button_danger:{backgroundColor:theme.colors.danger},button_plain:{backgroundColor:'#FFF',borderWidth:1,borderColor:theme.colors.border},buttonText:{color:'#FFF',fontSize:13,fontWeight:'700'},plainText:{color:theme.colors.text},disabled:{opacity:.55},
  notice:{backgroundColor:'#EAF7EF',borderRadius:10,padding:12},noticeError:{backgroundColor:'#FDECEC'},noticeText:{color:theme.colors.success,fontSize:13,fontWeight:'800'},noticeErrorText:{color:theme.colors.danger},
});
