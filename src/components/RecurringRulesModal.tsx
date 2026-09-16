import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ActionButton, Choice, Field, Notice, formStyles as s } from '@/components/FormKit';
import {
  createRecurringRule,
  generateRecurringRule,
  getRecurringRules,
  updateRecurringRule,
} from '@/services/fullApi';
import { theme } from '@/constants/theme';

const money = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

const isoMonth = () => new Date().toISOString().slice(0, 7);

const toNumber = (value: string) => Number(String(value).replace(',', '.')) || 0;

const emptyForm = {
  type: 'payable',
  description: '',
  category_id: '',
  supplier_id: '',
  amount: '',
  amount_mode: 'fixed',
  due_day: '10',
  start_month: isoMonth(),
  end_month: '',
  notes: '',
  active: true,
};

export function RecurringRulesModal({
  visible,
  onClose,
  categories,
  suppliers,
  onChanged,
}: {
  visible: boolean;
  onClose: () => void;
  categories: any[];
  suppliers: any[];
  onChanged?: () => void;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const [busy, setBusy] = useState(false);

  function showError(message: string) {
    setSuccess('');
    setError(message);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }

  function showSuccess(message: string) {
    setError('');
    setSuccess(message);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    if (successTimer.current) clearTimeout(successTimer.current);
    successTimer.current = setTimeout(() => setSuccess(''), 4000);
  }

  async function load() {
    try {
      setLoading(true);
      setError('');
      const res = await getRecurringRules();
      setRules(res.rules || []);
    } catch (e: any) {
      showError(e?.message || 'Não foi possível carregar as contas fixas.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (visible) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setFormOpen(true);
  }

  function startEdit(rule: any) {
    setEditingId(rule.id);
    setForm({
      type: rule.type,
      description: rule.description,
      category_id: String(rule.category_id || ''),
      supplier_id: String(rule.supplier_id || ''),
      amount: String(rule.amount).replace('.', ','),
      amount_mode: rule.amount_mode,
      due_day: String(rule.due_day),
      start_month: rule.start_month,
      end_month: rule.end_month || '',
      notes: rule.notes || '',
      active: rule.active,
    });
    setFormOpen(true);
  }

  function cancelForm() {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  async function save() {
    if (!form.description.trim()) {
      showError('Informe a descrição.');
      return;
    }
    const amount = toNumber(form.amount);
    if (!(amount > 0)) {
      showError('Informe um valor maior que zero.');
      return;
    }
    const dueDay = Number(form.due_day);
    if (!(dueDay >= 1 && dueDay <= 31)) {
      showError('Informe um dia de vencimento entre 1 e 31.');
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(form.start_month)) {
      showError('Informe o mês de início no formato AAAA-MM.');
      return;
    }
    const payload = {
      type: form.type,
      description: form.description.trim(),
      category_id: form.category_id,
      supplier_id: form.type === 'payable' ? form.supplier_id || null : null,
      amount,
      amount_mode: form.amount_mode,
      due_day: dueDay,
      start_month: form.start_month,
      end_month: form.end_month || null,
      notes: form.notes,
      active: form.active,
    };
    try {
      setBusy(true);
      setError('');
      if (editingId) {
        const res = await updateRecurringRule(editingId, payload);
        showSuccess(`Regra salva. ${res.created || 0} parcela(s) nova(s) gerada(s).`);
      } else {
        const res = await createRecurringRule(payload);
        showSuccess(`Regra criada. ${res.created || 0} parcela(s) gerada(s) automaticamente.`);
      }
      cancelForm();
      await load();
      onChanged?.();
    } catch (e: any) {
      showError(e?.message || 'Não foi possível salvar a regra.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(rule: any) {
    try {
      await updateRecurringRule(rule.id, { active: !rule.active });
      showSuccess(rule.active ? 'Regra desativada.' : 'Regra ativada.');
      await load();
      onChanged?.();
    } catch (e: any) {
      showError(e?.message || 'Falha ao atualizar a regra.');
    }
  }

  async function generateMore(rule: any) {
    try {
      const res = await generateRecurringRule(rule.id, 12);
      showSuccess(`${res.created || 0} parcela(s) nova(s) gerada(s) (${res.skipped || 0} já existiam).`);
      onChanged?.();
    } catch (e: any) {
      showError(e?.message || 'Falha ao gerar novas parcelas.');
    }
  }

  const categoryOptions = categories
    .filter((c: any) => c.type === form.type)
    .map((c: any) => ({ label: c.name, value: String(c.id) }));

  const supplierOptions = [
    { label: 'Sem fornecedor', value: '' },
    ...suppliers.map((sp: any) => ({ label: sp.name, value: String(sp.id) })),
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Contas fixas / recorrentes</Text>

            <Pressable onPress={onClose}>
              <Text style={styles.close}>×</Text>
            </Pressable>
          </View>

          <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            {!!error && <Notice text={error} tone="error" />}
            {!!success && <Notice text={success} tone="ok" />}

            <Text style={styles.intro}>
              Cadastre uma vez (aluguel, internet, etc.) e o sistema gera automaticamente as
              próximas 12 parcelas mensais, uma para cada mês — cada uma aparece e é paga
              normalmente em "Contas a pagar/receber".
            </Text>

            <View style={s.card}>
              <View style={styles.cardHeadRow}>
                <Text style={s.cardTitle}>Suas contas fixas</Text>

                <View style={styles.headBtn}>
                  <ActionButton
                    label={formOpen ? 'Cancelar' : '+ Nova conta fixa'}
                    tone="plain"
                    onPress={() => (formOpen ? cancelForm() : startCreate())}
                  />
                </View>
              </View>

              {formOpen && (
                <View style={styles.formArea}>
                  <Choice
                    label="Tipo"
                    value={form.type}
                    onChange={(v) => setForm({ ...form, type: v, category_id: '', supplier_id: '' })}
                    options={[
                      { label: 'Conta a pagar', value: 'payable' },
                      { label: 'Conta a receber', value: 'receivable' },
                    ]}
                  />

                  <Field
                    label="Descrição"
                    value={form.description}
                    onChangeText={(v) => setForm({ ...form, description: v })}
                    placeholder="Ex.: Aluguel, Internet"
                  />

                  <Choice
                    label="Categoria"
                    value={form.category_id}
                    onChange={(v) => setForm({ ...form, category_id: v })}
                    options={categoryOptions}
                  />

                  {form.type === 'payable' && (
                    <Choice
                      label="Fornecedor"
                      value={form.supplier_id}
                      onChange={(v) => setForm({ ...form, supplier_id: v })}
                      options={supplierOptions}
                    />
                  )}

                  <Field
                    label="Valor"
                    value={form.amount}
                    onChangeText={(v) => setForm({ ...form, amount: v })}
                    placeholder="0,00"
                    keyboardType="decimal-pad"
                  />

                  <Choice
                    label="O valor é sempre igual ou muda todo mês?"
                    value={form.amount_mode}
                    onChange={(v) => setForm({ ...form, amount_mode: v })}
                    options={[
                      { label: 'Fixo (sempre igual)', value: 'fixed' },
                      { label: 'Estimado (costuma variar)', value: 'estimated' },
                    ]}
                  />

                  <Field
                    label="Dia do vencimento (1 a 31)"
                    value={form.due_day}
                    onChangeText={(v) => setForm({ ...form, due_day: v })}
                    keyboardType="decimal-pad"
                  />

                  <Field
                    label="Começa em (AAAA-MM)"
                    value={form.start_month}
                    onChangeText={(v) => setForm({ ...form, start_month: v })}
                    placeholder={isoMonth()}
                  />

                  <Field
                    label="Termina em (AAAA-MM, deixe em branco se não tiver fim)"
                    value={form.end_month}
                    onChangeText={(v) => setForm({ ...form, end_month: v })}
                  />

                  <Field
                    label="Observações (opcional)"
                    value={form.notes}
                    onChangeText={(v) => setForm({ ...form, notes: v })}
                  />

                  {editingId != null && (
                    <Choice
                      label="Ativa"
                      value={form.active ? '1' : '0'}
                      onChange={(v) => setForm({ ...form, active: v === '1' })}
                      options={[
                        { label: 'Sim', value: '1' },
                        { label: 'Não', value: '0' },
                      ]}
                    />
                  )}

                  <ActionButton label="Salvar" onPress={save} disabled={busy} />
                </View>
              )}

              {loading && rules.length === 0 ? (
                <Text style={s.empty}>Carregando...</Text>
              ) : rules.length === 0 ? (
                <Text style={s.empty}>Nenhuma conta fixa cadastrada ainda.</Text>
              ) : (
                rules.map((rule) => (
                  <View key={rule.id} style={s.row}>
                    <View style={s.main}>
                      <Text style={s.name}>
                        {rule.description}
                        {!rule.active ? ' • inativa' : ''}
                      </Text>

                      <Text style={s.meta}>
                        {rule.type === 'payable' ? 'A pagar' : 'A receber'} • todo dia{' '}
                        {rule.due_day} • desde {rule.start_month}
                        {rule.end_month ? ` até ${rule.end_month}` : ''}
                      </Text>

                      <View style={styles.rowActions}>
                        <Pressable onPress={() => startEdit(rule)}>
                          <Text style={styles.linkAction}>Editar</Text>
                        </Pressable>

                        <Pressable onPress={() => toggleActive(rule)}>
                          <Text style={styles.linkAction}>
                            {rule.active ? 'Desativar' : 'Ativar'}
                          </Text>
                        </Pressable>

                        {rule.active && (
                          <Pressable onPress={() => generateMore(rule)}>
                            <Text style={styles.linkAction}>Gerar mais 12 meses</Text>
                          </Pressable>
                        )}
                      </View>
                    </View>

                    <Text style={s.amount}>{money(rule.amount)}</Text>
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
    maxHeight: '92%',
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
  scroll: {
    marginTop: 14,
  },
  scrollContent: {
    gap: 14,
    paddingBottom: 10,
  },
  intro: {
    fontSize: 12.5,
    color: theme.colors.muted,
    lineHeight: 18,
  },
  cardHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingBottom: 0,
  },
  headBtn: {
    flexDirection: 'row',
  },
  formArea: {
    padding: 16,
    paddingTop: 12,
    gap: 12,
  },
  rowActions: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  linkAction: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.text,
    textDecorationLine: 'underline',
  },
});
