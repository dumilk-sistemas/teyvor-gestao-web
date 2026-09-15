import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { AdminShell } from '@/components/AdminShell';
import {
  ActionButton,
  Choice,
  Field,
  Notice,
  formStyles as s,
} from '@/components/FormKit';
import {
  deleteFiscalCertificate,
  getFiscalCertificate,
  getProductFiscalSummary,
  setFiscalAmbiente,
  uploadFiscalCertificate,
} from '@/services/fullApi';
import { theme } from '@/constants/theme';

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
  'SP', 'SE', 'TO',
].map((uf) => ({ label: uf, value: uf }));

const isoToBR = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
};

function pickWebFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    if (Platform.OS !== 'web') {
      resolve(null);
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => {
      resolve(input.files && input.files[0] ? input.files[0] : null);
    };
    input.click();
  });
}

export default function FullFiscal() {
  const [cert, setCert] = useState<any>(null);
  const [summary, setSummary] = useState<{ classified_count: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    cnpj: '',
    razao_social: '',
    inscricao_estadual: '',
    uf: 'SP',
    password: '',
  });
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setLoading(true);
      setError('');
      const [certRes, summaryRes] = await Promise.all([
        getFiscalCertificate(),
        getProductFiscalSummary(),
      ]);
      setCert(certRes);
      setSummary(summaryRes);
    } catch (e: any) {
      setError(e?.message || 'Não foi possível carregar os dados fiscais.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handlePickFile() {
    const picked = await pickWebFile('.pfx,.p12');
    if (picked) setFile(picked);
  }

  async function handleUpload() {
    setError('');
    setSuccess('');
    if (!file) {
      setError('Selecione o arquivo do certificado (.pfx ou .p12).');
      return;
    }
    if (!form.password.trim()) {
      setError('Informe a senha do certificado.');
      return;
    }
    const cnpjDigits = form.cnpj.replace(/\D/g, '');
    if (cnpjDigits.length !== 14) {
      setError('CNPJ inválido — precisa ter 14 dígitos.');
      return;
    }
    if (!form.razao_social.trim() || !form.inscricao_estadual.trim()) {
      setError('Preencha razão social e inscrição estadual.');
      return;
    }

    try {
      setBusy(true);
      await uploadFiscalCertificate({
        file,
        password: form.password,
        cnpj: cnpjDigits,
        razao_social: form.razao_social.trim(),
        inscricao_estadual: form.inscricao_estadual.trim(),
        uf: form.uf,
      });
      setSuccess('Certificado cadastrado com sucesso.');
      setFile(null);
      setForm({ ...form, password: '' });
      await load();
    } catch (e: any) {
      setError(e?.message || 'Não foi possível enviar o certificado.');
    } finally {
      setBusy(false);
    }
  }

  async function handleAmbiente(value: string) {
    try {
      await setFiscalAmbiente(value as 'homologacao' | 'producao');
      await load();
    } catch (e: any) {
      setError(e?.message || 'Não foi possível trocar o ambiente.');
    }
  }

  async function handleRemove() {
    try {
      setBusy(true);
      await deleteFiscalCertificate();
      setSuccess('Certificado removido.');
      await load();
    } catch (e: any) {
      setError(e?.message || 'Não foi possível remover o certificado.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell
      title="Fiscal"
      subtitle="Certificado digital e classificação fiscal para emissão de nota"
      refreshing={loading}
      onRefresh={load}
      headerActions={null}
    >
      {!!error && <Notice text={error} tone="error" />}
      {!!success && <Notice text={success} />}

      <View style={s.card}>
        <Text style={s.cardTitle}>Classificação fiscal dos produtos</Text>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>
            {summary ? summary.classified_count : 0} produto(s) com NCM e CFOP preenchidos.
          </Text>
          <Text style={styles.summaryNote}>
            Vá em Produtos e edite cada item para preencher NCM, CFOP e situação tributária —
            é obrigatório por lei ter isso certo antes de emitir qualquer nota.
          </Text>
        </View>
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>Certificado digital (A1)</Text>

        {cert?.has_certificate ? (
          <View style={styles.certInfo}>
            <Text style={s.name}>{cert.razao_social}</Text>
            <Text style={s.meta}>
              CNPJ {cert.cnpj} • IE {cert.inscricao_estadual} • {cert.uf}
            </Text>
            <Text style={s.meta}>Válido até {isoToBR(cert.valid_until)}</Text>

            <View style={styles.ambienteRow}>
              <Choice
                label="Ambiente"
                value={cert.ambiente}
                onChange={handleAmbiente}
                options={[
                  { label: 'Homologação (teste)', value: 'homologacao' },
                  { label: 'Produção (valendo)', value: 'producao' },
                ]}
              />
            </View>

            {cert.ambiente === 'producao' && (
              <Notice
                text="Ambiente em PRODUÇÃO: as notas emitidas aqui valem de verdade perante a lei."
                tone="error"
              />
            )}

            <View style={styles.removeButton}>
              <ActionButton
                label="Remover certificado"
                tone="danger"
                onPress={handleRemove}
                disabled={busy}
              />
            </View>
          </View>
        ) : (
          <View style={styles.formArea}>
            <Text style={s.meta}>
              Nenhum certificado cadastrado ainda. Envie o arquivo .pfx/.p12 do certificado A1
              da empresa (fornecido pela certificadora) para liberar a emissão de nota fiscal.
            </Text>

            <ActionButton
              label={file ? `Arquivo: ${file.name}` : 'Selecionar arquivo (.pfx/.p12)'}
              tone="plain"
              onPress={handlePickFile}
            />

            <Field
              label="Senha do certificado"
              value={form.password}
              onChangeText={(v) => setForm({ ...form, password: v })}
              placeholder="Senha definida na compra do certificado"
            />

            <Field
              label="CNPJ"
              value={form.cnpj}
              onChangeText={(v) => setForm({ ...form, cnpj: v })}
              placeholder="00.000.000/0000-00"
              keyboardType="number-pad"
            />

            <Field
              label="Razão social"
              value={form.razao_social}
              onChangeText={(v) => setForm({ ...form, razao_social: v })}
            />

            <Field
              label="Inscrição estadual"
              value={form.inscricao_estadual}
              onChangeText={(v) => setForm({ ...form, inscricao_estadual: v })}
            />

            <Choice
              label="Estado (UF)"
              value={form.uf}
              onChange={(v) => setForm({ ...form, uf: v })}
              options={UFS}
            />

            <ActionButton
              label="Cadastrar certificado"
              onPress={handleUpload}
              disabled={busy}
            />
          </View>
        )}
      </View>
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  summaryRow: {
    padding: 16,
    gap: 6,
  },
  summaryText: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.colors.text,
  },
  summaryNote: {
    fontSize: 12.5,
    color: theme.colors.muted,
  },
  certInfo: {
    padding: 16,
    gap: 8,
  },
  ambienteRow: {
    marginTop: 8,
  },
  removeButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  formArea: {
    padding: 16,
    gap: 12,
  },
});
