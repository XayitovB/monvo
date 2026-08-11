import React, { useEffect, useState } from 'react';
import { I, T, Button, Surface, Badge, Avatar, Th, Td, Field, Input, EmptyState } from '../kit';
import Topbar from '../layout/Topbar';
import { useLang } from '../i18n/LangContext';
import { useApi } from '../hooks/useApi';
import { useConfirm } from '../hooks/useConfirm';
import { useAlert } from '../hooks/useAlert';
import api from '../api';

function splitName(full) {
  const parts = (full || '').trim().split(/\s+/);
  return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') || '' };
}

function StaffModal({ row, onClose, onSaved }) {
  const { t } = useLang();
  const isEdit = !!row;
  const initialSplit = isEdit ? splitName(row.name || row.full_name) : { firstName: '', lastName: '' };
  const [form, setForm] = useState({
    firstName: initialSplit.firstName,
    lastName: initialSplit.lastName,
    phone: row?.phone || '',
    role: row?.role || 'cashier',
    username: row?.username || '',
    password: '',
    branch_id: row?.branch_id ?? null,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [branches, setBranches] = useState([]);

  useEffect(() => {
    api.branches().then(d => setBranches(Array.isArray(d) ? d : [])).catch(() => setBranches([]));
  }, []);

  function onPhone(e) {
    let v = e.target.value.replace(/[^\d+]/g, '');
    if (!v.startsWith('+')) v = '+' + v.replace(/^\+/, '');
    if (!v.startsWith('+998')) v = '+998' + v.slice(1).replace(/^998/, '');
    setForm({ ...form, phone: v.slice(0, 13) });
  }

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const fullName = `${form.firstName.trim()} ${form.lastName.trim()}`.trim();
      const payload = {
        full_name: fullName,
        name: fullName,
        phone: form.phone.trim(),
        role: form.role,
        username: form.username.trim(),
        branch_id: form.branch_id,
      };
      if (form.password) payload.password = form.password;
      if (isEdit) {
        if (form.password) payload.new_password = form.password;
        delete payload.password;
        await api.updateStaff(row.id, payload);
      } else {
        await api.createStaff(payload);
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const canSave = form.firstName && form.lastName && form.phone && form.username && (isEdit || form.password);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--m-surface)', borderRadius: 14, padding: 24, width: 480,
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ ...T.h2 }}>{isEdit ? t('st.modal.title.edit') : t('st.modal.title.new')}</div>

        <div style={{ fontSize: 11, color: 'var(--m-ink-mute)', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600 }}>
          {t('st.modal.section.personal')}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label={t('st.modal.firstName')} required>
            <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })}/>
          </Field>
          <Field label={t('st.modal.lastName')} required>
            <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })}/>
          </Field>
        </div>
        <Field label={t('st.modal.role')} required hint={t(`st.role.help.${form.role === 'manager' ? 'admin' : form.role}`)}>
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            style={{
              padding: '10px 12px', border: '1px solid var(--m-line-strong)', borderRadius: 9,
              background: 'var(--m-surface)', fontSize: 13, color: 'var(--m-ink)', width: '100%',
            }}
          >
            <option value="owner">{t('st.role.owner')}</option>
            <option value="admin">{t('st.role.admin')}</option>
            <option value="branch_chief">{t('st.role.branch_chief')}</option>
            <option value="cashier">{t('st.role.cashier')}</option>
          </select>
        </Field>
        <Field
          label={t('st.modal.branch')}
          hint={branches.length === 0 ? t('st.modal.branch.hint_empty') : t('st.modal.branch.hint')}
        >
          <select
            value={form.branch_id ?? ''}
            onChange={(e) => setForm({ ...form, branch_id: e.target.value ? Number(e.target.value) : null })}
            disabled={branches.length === 0}
            style={{
              padding: '10px 12px', border: '1px solid var(--m-line-strong)', borderRadius: 9,
              background: 'var(--m-surface)', fontSize: 13, color: 'var(--m-ink)', width: '100%',
              cursor: branches.length === 0 ? 'not-allowed' : 'pointer',
              opacity: branches.length === 0 ? 0.6 : 1,
            }}
          >
            <option value="">{t('st.modal.branch.none')}</option>
            {branches.map(b => (
              <option key={b.id} value={b.id}>{b.name}{b.address ? ` · ${b.address}` : ''}</option>
            ))}
          </select>
        </Field>
        <Field label={t('st.modal.phone')} required>
          <Input
            value={form.phone}
            onChange={onPhone}
            onFocus={(e) => { if (!e.target.value) setForm((f) => ({ ...f, phone: '+998' })); }}
            placeholder="+998 90 123 45 67"
            inputMode="tel"
          />
        </Field>

        <div style={{ height: 1, background: 'var(--m-line)', margin: '4px 0' }}/>

        <div style={{ fontSize: 11, color: 'var(--m-ink-mute)', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600 }}>
          {t('st.modal.section.access')}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label={t('st.modal.username')} required>
            <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })}/>
          </Field>
          <Field label={isEdit ? t('st.modal.passwordEdit') : t('st.modal.password')} required={!isEdit}>
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}/>
          </Field>
        </div>

        {error && <div style={{ padding: 10, background: 'var(--m-bad-soft)', color: 'var(--m-bad)', borderRadius: 8, fontSize: 12 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <Button variant="secondary" full onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" full onClick={save} disabled={saving || !canSave}>
            {saving ? t('common.loading') : t('common.save')}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function Staff() {
  const { t } = useLang();
  const [askConfirm, confirmModal] = useConfirm();
  const [showAlert, alertModal] = useAlert();
  const { data: staff, reload, loading } = useApi(() => api.staff(), []);
  const [editing, setEditing] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  async function onDelete(id) {
    if (!await askConfirm(t('st.confirmDelete'), { danger: true })) return;
    try {
      await api.deleteStaff(id);
      reload();
    } catch (e) {
      showAlert(e.message);
    }
  }

  const list = Array.isArray(staff) ? staff : [];

  return (
    <>
      {confirmModal}
      {alertModal}
      <Topbar
        title={t('st.title')}
        subtitle={t('st.subtitle', { n: list.length })}
        actions={
          <>
            <Button variant="secondary" icon={<I.link/>}>{t('st.invite')}</Button>
            <Button variant="primary" icon={<I.plus/>} onClick={() => setShowAdd(true)}>{t('st.add')}</Button>
          </>
        }
      />

      <div style={{ padding: 28 }}>
        <Surface padding={0}>
          {loading && <div style={{ padding: 40, textAlign: 'center', color: 'var(--m-ink-mute)', fontSize: 12 }}>{t('common.loading')}</div>}
          {!loading && list.length === 0 && (
            <EmptyState
              title={t('st.empty.title')}
              sub={t('st.empty.sub')}
              action={<Button variant="primary" icon={<I.plus/>} onClick={() => setShowAdd(true)}>{t('st.add')}</Button>}
            />
          )}
          {!loading && list.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <Th>{t('st.col.staff')}</Th>
                  <Th>{t('st.col.role')}</Th>
                  <Th>{t('st.col.username')}</Th>
                  <Th align="right">{t('st.col.txn30')}</Th>
                  <Th>{t('common.status')}</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {list.map((s) => {
                  const roleKey = s.role === 'manager' ? 'admin' : s.role;
                  const role = t(`st.role.${roleKey || 'cashier'}`);
                  const roleTone = s.role === 'owner' ? 'good'
                    : (s.role === 'admin' || s.role === 'manager') ? 'warn'
                    : s.role === 'branch_chief' ? 'brand'
                    : 'neutral';
                  const displayName = s.full_name || s.name || s.username;
                  return (
                    <tr key={s.id}>
                      <Td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Avatar name={displayName} size={30}/>
                          <div>
                            <div style={{ color: 'var(--m-ink)', fontWeight: 500, fontSize: 13 }}>{displayName}</div>
                            <div style={{ fontSize: 11, color: 'var(--m-ink-mute)' }}>{s.phone || s.email || ''}</div>
                          </div>
                        </div>
                      </Td>
                      <Td>
                        <Badge tone={roleTone}>{role}</Badge>
                      </Td>
                      <Td mono style={{ color: 'var(--m-ink-soft)' }}>{s.username}</Td>
                      <Td align="right" mono>{s.transactions_count ?? 0}</Td>
                      <Td>
                        {s.is_active === false
                          ? <Badge>{t('common.offline')}</Badge>
                          : <Badge tone="good" dot>{t('common.active')}</Badge>}
                      </Td>
                      <Td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            onClick={() => setEditing(s)}
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--m-ink-mute)', padding: 4 }}
                          ><I.cog size={14}/></button>
                          <button
                            onClick={() => onDelete(s.id)}
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--m-bad)', padding: 4 }}
                          ><I.x size={14}/></button>
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Surface>
      </div>

      {showAdd && <StaffModal onClose={() => setShowAdd(false)} onSaved={reload}/>}
      {editing && <StaffModal row={editing} onClose={() => setEditing(null)} onSaved={reload}/>}
    </>
  );
}
