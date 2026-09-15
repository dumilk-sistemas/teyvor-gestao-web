import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AdminShell } from '@/components/AdminShell';
import { useToast } from '@/components/Toast';
import { theme, useThemeColors } from '@/constants/theme';
import { useUser } from '@/contexts/UserContext';
import { createUser, getUsers, updateUser } from '@/services/api';
import type { ManagedUser, RoleOption, UsersData } from '@/types/api';

type FormState = {
  name: string;
  email: string;
  password: string;
  role: string;
};

const blankForm = (defaultRole: string): FormState => ({
  name: '',
  email: '',
  password: '',
  role: defaultRole,
});

const dateBR = (value: string | null) =>
  value ? new Date(value).toLocaleString('pt-BR') : 'Nunca';

export default function Users() {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { user: currentUser } = useUser();

  const [data, setData] = useState<UsersData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [form, setForm] = useState<FormState>(blankForm('caixa'));

  async function load() {
    try {
      setLoading(true);
      setError('');
      setData(await getUsers());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar usuários.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openNew() {
    setEditing(null);
    setForm(blankForm(data?.roles[0]?.value || 'caixa'));
    setError('');
    setFormOpen(true);
  }

  function openEdit(row: ManagedUser) {
    setEditing(row);
    setForm({ name: row.name, email: row.email, password: '', role: row.role });
    setError('');
    setFormOpen(true);
  }

  function closeForm() {
    if (!saving) {
      setFormOpen(false);
      setEditing(null);
    }
  }

  async function save() {
    if (form.name.trim().length < 2) {
      setError('Informe o nome do usuário.');
      return;
    }
    if (!editing && !form.email.trim()) {
      setError('Informe o e-mail do usuário.');
      return;
    }
    if (!editing && form.password.trim().length < 8) {
      setError('A senha inicial deve ter pelo menos 8 caracteres.');
      return;
    }
    try {
      setSaving(true);
      setError('');
      if (editing) {
        await updateUser(editing.id, {
          name: form.name.trim(),
          role: form.role,
          ...(form.password.trim() ? { password: form.password.trim() } : {}),
        });
        showToast('Usuário atualizado.');
      } else {
        await createUser({
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password.trim(),
          role: form.role,
          branch_id: currentUser?.branch_id ?? 1,
        });
        showToast('Usuário criado. Já pode entrar com o e-mail e a senha informados.');
      }
      setFormOpen(false);
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar o usuário.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: ManagedUser) {
    try {
      setError('');
      await updateUser(row.id, { active: !row.active });
      showToast(row.active ? 'Usuário desativado.' : 'Usuário ativado.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível alterar o usuário.');
    }
  }

  const roles: RoleOption[] = data?.roles || [];

  return (
    <AdminShell
      title="Usuários"
      subtitle="Cadastre outros administradores, gerentes, vendedores ou operadores de caixa"
      refreshing={loading}
      onRefresh={load}
      headerActions={
        <Pressable style={styles.primary} onPress={openNew}>
          <Text style={styles.primaryText}>+ Novo usuário</Text>
        </Pressable>
      }
    >
      {!!error && <Text style={styles.error}>{error}</Text>}

      {formOpen && (
        <View style={styles.formCard}>
          <View style={styles.formHeader}>
            <View>
              <Text style={styles.formTitle}>{editing ? 'Editar usuário' : 'Novo usuário'}</Text>
              <Text style={styles.formSub}>
                {editing
                  ? 'Deixe a senha em branco para não alterá-la.'
                  : 'O usuário poderá entrar assim que você salvar.'}
              </Text>
            </View>
            <Pressable onPress={closeForm}>
              <Text style={styles.cancelLink}>Fechar</Text>
            </Pressable>
          </View>

          <View style={styles.fields}>
            <View style={styles.fieldWide}>
              <Text style={styles.label}>Nome *</Text>
              <TextInput
                value={form.name}
                onChangeText={(name) => setForm({ ...form, name })}
                style={styles.input}
                placeholder="Nome completo"
              />
            </View>

            {!editing && (
              <View style={styles.field}>
                <Text style={styles.label}>E-mail *</Text>
                <TextInput
                  value={form.email}
                  onChangeText={(email) => setForm({ ...form, email })}
                  style={styles.input}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholder="pessoa@empresa.com.br"
                />
              </View>
            )}

            <View style={styles.field}>
              <Text style={styles.label}>{editing ? 'Nova senha (opcional)' : 'Senha inicial *'}</Text>
              <TextInput
                value={form.password}
                onChangeText={(password) => setForm({ ...form, password })}
                style={styles.input}
                secureTextEntry
                placeholder="Mínimo 8 caracteres"
              />
            </View>

            <View style={styles.fieldWide}>
              <Text style={styles.label}>Perfil</Text>
              <View style={styles.roleChoices}>
                {roles.map((role) => (
                  <Pressable
                    key={role.value}
                    style={[styles.choice, form.role === role.value && styles.choiceActive]}
                    onPress={() => setForm({ ...form, role: role.value })}
                  >
                    <Text style={[styles.choiceText, form.role === role.value && styles.choiceTextActive]}>
                      {role.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          <View style={styles.formActions}>
            <Pressable style={styles.secondary} onPress={closeForm}>
              <Text style={styles.secondaryText}>Cancelar</Text>
            </Pressable>
            <Pressable disabled={saving} style={[styles.primary, saving && styles.disabled]} onPress={save}>
              <Text style={styles.primaryText}>{saving ? 'Salvando...' : 'Salvar usuário'}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {data && (
        <>
          <View style={styles.toolbar}>
            <Text style={styles.count}>{data.users.length} usuário(s)</Text>
          </View>

          <View style={styles.card}>
            {data.users.map((row) => (
              <View key={row.id} style={styles.row}>
                <View style={styles.main}>
                  <Text style={styles.name}>{row.name}</Text>
                  <Text style={styles.meta}>{row.email}</Text>
                  <Text style={styles.meta}>
                    {row.role_label} • Último acesso: {dateBR(row.last_login_at)}
                  </Text>
                </View>
                <View style={styles.right}>
                  <Text style={[styles.status, row.active ? styles.ok : styles.bad]}>
                    {row.active ? 'Ativo' : 'Inativo'}
                  </Text>
                  <View style={styles.rowActions}>
                    <Pressable style={styles.smallButton} onPress={() => openEdit(row)}>
                      <Text style={styles.smallButtonText}>Editar</Text>
                    </Pressable>
                    {row.id !== currentUser?.id && (
                      <Pressable style={styles.smallButton} onPress={() => toggleActive(row)}>
                        <Text style={styles.smallButtonText}>
                          {row.active ? 'Desativar' : 'Ativar'}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              </View>
            ))}
            {data.users.length === 0 && <Text style={styles.empty}>Nenhum usuário cadastrado.</Text>}
          </View>
        </>
      )}
    </AdminShell>
  );
}

const makeStyles = (c: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    error: { color: theme.colors.danger, fontSize: 14, fontWeight: '700' },
    toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' },
    count: { fontSize: 13, color: theme.colors.muted, fontWeight: '700' },
    formCard: { backgroundColor: '#FFF', borderWidth: 1, borderColor: c.gold, borderRadius: theme.radius.md, padding: 18, gap: 16 },
    formHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
    formTitle: { fontSize: 21, fontWeight: '900', color: theme.colors.text },
    formSub: { fontSize: 13, color: theme.colors.muted, marginTop: 4 },
    cancelLink: { color: theme.colors.danger, fontWeight: '800' },
    fields: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    field: { flexGrow: 1, flexBasis: 280 },
    fieldWide: { flexGrow: 1, flexBasis: '100%' },
    label: { fontSize: 13, fontWeight: '800', color: theme.colors.text, marginBottom: 6 },
    input: { height: 48, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm, paddingHorizontal: 13, backgroundColor: '#FFF', fontSize: 15, color: theme.colors.text },
    roleChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    choice: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#FFF' },
    choiceActive: { backgroundColor: theme.colors.black, borderColor: theme.colors.black },
    choiceText: { fontSize: 13, fontWeight: '800', color: theme.colors.text },
    choiceTextActive: { color: '#FFF' },
    formActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
    primary: { backgroundColor: theme.colors.black, borderRadius: theme.radius.sm, paddingHorizontal: 17, paddingVertical: 13 },
    primaryText: { color: '#FFF', fontSize: 14, fontWeight: '900' },
    secondary: { backgroundColor: '#FFF', borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm, paddingHorizontal: 17, paddingVertical: 12 },
    secondaryText: { color: theme.colors.text, fontSize: 14, fontWeight: '800' },
    disabled: { opacity: 0.55 },
    card: { backgroundColor: '#FFF', borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, overflow: 'hidden' },
    row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, padding: 15, borderTopWidth: 1, borderTopColor: theme.colors.border },
    main: { flexGrow: 1, flexBasis: 280 },
    right: { alignItems: 'flex-end', gap: 6 },
    name: { fontSize: 15, fontWeight: '900', color: theme.colors.text },
    meta: { fontSize: 13, color: theme.colors.muted, marginTop: 2 },
    status: { fontSize: 12, fontWeight: '800' },
    ok: { color: theme.colors.success },
    bad: { color: theme.colors.danger },
    rowActions: { flexDirection: 'row', gap: 8 },
    smallButton: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
    smallButtonText: { fontSize: 12, fontWeight: '800', color: theme.colors.text },
    empty: { padding: 18, color: theme.colors.muted, fontSize: 14 },
  });
