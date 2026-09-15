import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AccountPicker } from '@/components/AccountPicker';
import { ActionButton, Choice, Field, Notice, formStyles as s } from '@/components/FormKit';
import {
  createAccount,
  createTransfer,
  getAccounts,
  getPaymentMapping,
  getTransfers,
  setPaymentMapping,
  updateAccount,
} from '@/services/fullApi';
import { theme } from '@/constants/theme';

const money = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0);

const isoToday = () => new Date().toISOString().slice(0, 10);

const isoToBR = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
};

const toNumber = (value: string) => Number(String(value).replace(',', '.')) || 0;

const PAYMENT_METHODS = ['Dinheiro', 'Pix', 'Débito', 'Crédito', 'Outros'];

const ACCOUNT_TYPES = [
  { label: 'Caixa', value: 'caixa' },
  { label: 'Conta corrente', value: 'conta_corrente' },
  { label: 'Poupança', value: 'poupanca' },
];

function accountName(accounts: any[], id: number) {
  return accounts.find((a) => a.id === id)?.name || `#${id}`;
}

const emptyAccountForm = {
  name: '',
  account_type: 'caixa',
  initial_balance: '',
  opening_date: isoToday(),
  is_default: false,
};

const emptyTransferForm = {
  from_account_id: '',
  to_account_id: '',
  amount: '',
  transfer_date: isoToday(),
  description: '',
};

export function AccountsModal({
  visible,
  onClose,
  onChanged,
}: {
  visible: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [mapping, setMapping] = useState<Record<string, number | null>>({});
  const [transfers, setTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [newAccountOpen, setNewAccountOpen] = useState(false);
  const [form, setForm] = useState<any>(emptyAccountForm);
  const [busy, setBusy] = useState(false);

  const [transferForm, setTransferForm] = useState<any>(emptyTransferForm);
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferError, setTransferError] = useState('');

  async function load() {
    try {
      setLoading(true);
      setError('');
      const [accRes, mapRes, trRes] = await Promise.all([
        getAccounts(),
        getPaymentMapping(),
        getTransfers(),
      ]);
      setAccounts(accRes.accounts || []);
      setMapping(mapRes.mapping || {});
      setTransfers(trRes.transfers || []);
    } catch (e: any) {
      setError(e?.message || 'Não foi possível carregar as contas.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (visible) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  async function saveAccount() {
    if (!form.name.trim()) {
      setError('Informe o nome da conta.');
      return;
    }
    try {
      setBusy(true);
      setError('');
      await createAccount({
        name: form.name.trim(),
        account_type: form.account_type,
        initial_balance: toNumber(form.initial_balance),
        opening_date: form.opening_date,
        is_default: form.is_default,
      });
      setForm(emptyAccountForm);
      setNewAccountOpen(false);
      await load();
      onChanged?.();
    } catch (e: any) {
      setError(e?.message || 'Não foi possível criar a conta.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleDefault(id: number) {
    try {
      await updateAccount(id, { is_default: true });
      await load();
      onChanged?.();
    } catch (e: any) {
      setError(e?.message || 'Falha ao definir conta padrão.');
    }
  }

  async function toggleActive(account: any) {
    try {
      await updateAccount(account.id, { active: !account.active });
      await load();
      onChanged?.();
    } catch (e: any) {
      setError(e?.message || 'Falha ao atualizar conta.');
    }
  }

  async function changeMapping(method: string, value: string) {
    const accountId = value ? Number(value) : null;
    setMapping((prev) => ({ ...prev, [method]: accountId }));
    try {
      await setPaymentMapping({ [method]: accountId });
      onChanged?.();
    } catch (e: any) {
      setError(e?.message || 'Falha ao salvar mapeamento.');
    }
  }

  async function saveTransfer() {
    const amount = toNumber(transferForm.amount);
    if (!transferForm.from_account_id || !transferForm.to_account_id) {
      setTransferError('Escolha as duas contas.');
      return;
    }
    if (transferForm.from_account_id === transferForm.to_account_id) {
      setTransferError('As contas precisam ser diferentes.');
      return;
    }
    if (amount <= 0) {
      setTransferError('Informe um valor maior que zero.');
      return;
    }
    try {
      setTransferBusy(true);
      setTransferError('');
      await createTransfer({
        from_account_id: Number(transferForm.from_account_id),
        to_account_id: Number(transferForm.to_account_id),
        amount,
        transfer_date: transferForm.transfer_date,
        description: transferForm.description,
      });
      setTransferForm(emptyTransferForm);
      await load();
      onChanged?.();
    } catch (e: any) {
      setTransferError(e?.message || 'Não foi possível registrar a transferência.');
    } finally {
      setTransferBusy(false);
    }
  }

  const accountOptions = accounts
    .filter((a) => a.active)
    .map((a) => ({ label: a.name, value: String(a.id) }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Contas</Text>

            <Pressable onPress={onClose}>
              <Text style={styles.close}>×</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            {!!error && <Notice text={error} tone="error" />}

            <View style={s.card}>
              <View style={styles.cardHeadRow}>
                <Text style={s.cardTitle}>Suas contas</Text>

                <View style={styles.headBtn}>
                  <ActionButton
                    label={newAccountOpen ? 'Cancelar' : '+ Nova conta'}
                    tone="plain"
                    onPress={() => setNewAccountOpen((v) => !v)}
                  />
                </View>
              </View>

              {newAccountOpen && (
                <View style={styles.formArea}>
                  <Field
                    label="Nome"
                    value={form.name}
                    onChangeText={(v) => setForm({ ...form, name: v })}
                    placeholder="Ex.: Caixa Loja, Banco do Brasil"
                  />

                  <Choice
                    label="Tipo"
                    options={ACCOUNT_TYPES}
                    value={form.account_type}
                    onChange={(v) => setForm({ ...form, account_type: v })}
                  />

                  <Field
                    label="Saldo inicial"
                    value={String(form.initial_balance)}
                    onChangeText={(v) => setForm({ ...form, initial_balance: v })}
                    placeholder="0,00"
                    keyboardType="decimal-pad"
                  />

                  <Field
                    label="Data do saldo inicial (AAAA-MM-DD)"
                    value={form.opening_date}
                    onChangeText={(v) => setForm({ ...form, opening_date: v })}
                    placeholder={isoToday()}
                  />

                  <Choice
                    label="Conta padrão (usada quando a forma de pagamento não tiver conta definida)"
                    options={[
                      { label: 'Não', value: '0' },
                      { label: 'Sim', value: '1' },
                    ]}
                    value={form.is_default ? '1' : '0'}
                    onChange={(v) => setForm({ ...form, is_default: v === '1' })}
                  />

                  <ActionButton label="Salvar conta" onPress={saveAccount} disabled={busy} />
                </View>
              )}

              {loading && accounts.length === 0 ? (
                <Text style={s.empty}>Carregando...</Text>
              ) : accounts.length === 0 ? (
                <Text style={s.empty}>Nenhuma conta cadastrada ainda.</Text>
              ) : (
                accounts.map((acc) => (
                  <View key={acc.id} style={s.row}>
                    <View style={s.main}>
                      <Text style={s.name}>
                        {acc.name}
                        {acc.is_default ? ' • padrão' : ''}
                        {!acc.active ? ' • inativa' : ''}
                      </Text>

                      <Text style={s.meta}>
                        Saldo em {isoToBR(acc.opening_date)}: {money(acc.initial_balance)}
                      </Text>

                      <View style={styles.rowActions}>
                        {!acc.is_default && (
                          <Pressable onPress={() => toggleDefault(acc.id)}>
                            <Text style={styles.linkAction}>Tornar padrão</Text>
                          </Pressable>
                        )}

                        <Pressable onPress={() => toggleActive(acc)}>
                          <Text style={styles.linkAction}>
                            {acc.active ? 'Desativar' : 'Ativar'}
                          </Text>
                        </Pressable>
                      </View>
                    </View>

                    <Text
                      style={[s.amount, acc.current_balance < 0 && { color: theme.colors.danger }]}
                    >
                      {money(acc.current_balance)}
                    </Text>
                  </View>
                ))
              )}
            </View>

            <View style={s.card}>
              <Text style={s.cardTitle}>Para onde vai cada forma de pagamento</Text>

              <Text style={styles.cardNote}>
                Vendas do PDV entram automaticamente na conta escolhida aqui.
              </Text>

              <View style={styles.mappingList}>
                {PAYMENT_METHODS.map((method) => (
                  <AccountPicker
                    key={method}
                    label={method}
                    options={accountOptions}
                    value={mapping[method] != null ? String(mapping[method]) : ''}
                    onChange={(v) => changeMapping(method, v)}
                  />
                ))}
              </View>
            </View>

            <View style={s.card}>
              <Text style={s.cardTitle}>Transferência entre contas</Text>

              {!!transferError && <Notice text={transferError} tone="error" />}

              <AccountPicker
                label="De"
                options={accountOptions}
                value={transferForm.from_account_id}
                onChange={(v) => setTransferForm({ ...transferForm, from_account_id: v })}
                allowEmpty={false}
              />

              <AccountPicker
                label="Para"
                options={accountOptions}
                value={transferForm.to_account_id}
                onChange={(v) => setTransferForm({ ...transferForm, to_account_id: v })}
                allowEmpty={false}
              />

              <Field
                label="Valor"
                value={String(transferForm.amount)}
                onChangeText={(v) => setTransferForm({ ...transferForm, amount: v })}
                placeholder="0,00"
                keyboardType="decimal-pad"
              />

              <Field
                label="Data (AAAA-MM-DD)"
                value={transferForm.transfer_date}
                onChangeText={(v) => setTransferForm({ ...transferForm, transfer_date: v })}
                placeholder={isoToday()}
              />

              <Field
                label="Descrição (opcional)"
                value={transferForm.description}
                onChangeText={(v) => setTransferForm({ ...transferForm, description: v })}
              />

              <ActionButton
                label="Registrar transferência"
                onPress={saveTransfer}
                disabled={transferBusy}
              />

              {transfers.length > 0 && (
                <View style={styles.transferList}>
                  <Text style={styles.cardNote}>Últimas transferências</Text>

                  {transfers.slice(0, 10).map((t) => (
                    <View key={t.id} style={s.row}>
                      <View style={s.main}>
                        <Text style={s.name}>
                          {accountName(accounts, t.from_account_id)} → {accountName(accounts, t.to_account_id)}
                        </Text>

                        <Text style={s.meta}>
                          {isoToBR(t.transfer_date)}
                          {t.description ? ` • ${t.description}` : ''}
                        </Text>
                      </View>

                      <Text style={s.amount}>{money(t.amount)}</Text>
                    </View>
                  ))}
                </View>
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
  },
  linkAction: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.text,
    textDecorationLine: 'underline',
  },
  cardNote: {
    fontSize: 12,
    color: theme.colors.muted,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  mappingList: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 14,
  },
  transferList: {
    marginTop: 6,
  },
});
