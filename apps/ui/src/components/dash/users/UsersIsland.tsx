import { useState, useMemo, useCallback, useRef } from 'react';
import { useQueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { queryClient } from '../../commons/Providers';
import TableWithFetch from '../../commons/TableWithFetch';
import Button from '../../commons/Button';
import IconButton from '../../commons/IconButton';
import { apiFetch } from '../../../lib/api';

const USERS_QUERY_KEY = '/v1/users';

interface User {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
}

interface EditingUser extends User {}

interface PendingResponse {
  pending: boolean;
  message: string;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="relative inline-flex items-center cursor-pointer gap-3">
      <div className="relative">
        <input
          type="checkbox"
          className="sr-only peer"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
        />
        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
      </div>
      <span className="text-sm font-medium text-slate-700">Usuario activo</span>
    </label>
  );
}

function UsersContent() {
  const qc = useQueryClient();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingUser, setEditingUser] = useState<EditingUser | null>(null);
  const [pendingMsg, setPendingMsg] = useState<string | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createRole, setCreateRole] = useState('BASIC');
  const [createError, setCreateError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);

  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState('BASIC');
  const [editIsActive, setEditIsActive] = useState(true);
  const [editLoading, setEditLoading] = useState(false);

  function showPending(msg: string) {
    setPendingMsg(msg);
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
    pendingTimer.current = setTimeout(() => setPendingMsg(null), 10000);
  }

  const handleEdit = useCallback((user: User) => {
    setEditingUser(user);
    setEditEmail(user.email);
    setEditRole(user.role);
    setEditIsActive(user.isActive);
    setShowCreateForm(false);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('¿Eliminar este usuario? Recibirás un email para confirmar la operación.')) return;
    const res = await apiFetch(`/v1/users/${id}`, { method: 'DELETE' });
    const data: PendingResponse | null = await res.json().catch(() => null);
    if (data?.pending) {
      showPending(data.message);
    } else {
      qc.invalidateQueries({ queryKey: [USERS_QUERY_KEY] });
    }
  }, [qc]);

  const columns = useMemo<ColumnDef<User>[]>(() => [
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ getValue }) => (
        <span className="font-medium text-slate-800 max-w-xs truncate block">{getValue<string>()}</span>
      ),
    },
    {
      accessorKey: 'role',
      header: 'Rol',
      cell: ({ getValue }) => (
        <span className="whitespace-nowrap text-slate-600">{getValue<string>()}</span>
      ),
    },
    {
      accessorKey: 'isActive',
      header: 'Activo',
      cell: ({ getValue }) => {
        const active = getValue<boolean>();
        return (
          <span className={`px-2 py-0.5 text-xs rounded-full whitespace-nowrap ${active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {active ? 'Sí' : 'No'}
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: 'Acciones',
      cell: ({ row }) => (
        <div className="flex gap-1 justify-end">
          <IconButton icon="pencil" label="Editar" variant="primary" onClick={() => handleEdit(row.original)} />
          <IconButton icon="trash" label="Eliminar" variant="danger" onClick={() => handleDelete(row.original.id)} />
        </div>
      ),
    },
  ], [handleEdit, handleDelete]);

  async function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreateLoading(true);
    try {
      const res = await apiFetch('/v1/users', {
        method: 'POST',
        body: JSON.stringify({ email: createEmail, password: createPassword, role: createRole }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setCreateError(data?.message || 'Error al crear usuario');
        return;
      }
      setShowCreateForm(false);
      setCreateEmail('');
      setCreatePassword('');
      setCreateRole('BASIC');
      if (data?.pending) {
        showPending(data.message);
      } else {
        qc.invalidateQueries({ queryKey: [USERS_QUERY_KEY] });
      }
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return;
    setEditLoading(true);
    try {
      const res = await apiFetch(`/v1/users/${editingUser.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ email: editEmail, role: editRole, isActive: editIsActive }),
      });
      const data = await res.json().catch(() => null);
      setEditingUser(null);
      if (data?.pending) {
        showPending(data.message);
      } else {
        qc.invalidateQueries({ queryKey: [USERS_QUERY_KEY] });
      }
    } finally {
      setEditLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Usuarios</h2>
        {!showCreateForm && !editingUser && (
          <Button onClick={() => { setShowCreateForm(true); setEditingUser(null); }}>
            Nuevo usuario
          </Button>
        )}
      </div>

      {pendingMsg && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500 mt-0.5 shrink-0">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="text-sm text-amber-800">{pendingMsg}</p>
        </div>
      )}

      {showCreateForm && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Nuevo usuario</h3>
          <form onSubmit={handleCreateSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input type="email" required value={createEmail} onChange={e => setCreateEmail(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña</label>
              <input type="password" required minLength={8} value={createPassword} onChange={e => setCreatePassword(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Rol</label>
              <select value={createRole} onChange={e => setCreateRole(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="BASIC">Basic</option>
                <option value="MANAGER">Manager</option>
              </select>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={createLoading}>Crear</Button>
              <Button type="button" variant="secondary" onClick={() => { setShowCreateForm(false); setCreateError(null); }}>Cancelar</Button>
            </div>
            {createError && (
              <p className="md:col-span-4 text-sm text-red-600">{createError}</p>
            )}
          </form>
        </div>
      )}

      {editingUser && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Editar usuario</h3>
          <form onSubmit={handleEditSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Rol</label>
              <select value={editRole} onChange={e => setEditRole(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="ADMIN">Admin</option>
                <option value="MANAGER">Manager</option>
                <option value="BASIC">Basic</option>
              </select>
            </div>
            <div className="pb-1">
              <Toggle checked={editIsActive} onChange={setEditIsActive} />
            </div>
            <div className="md:col-span-3 flex gap-2">
              <Button type="submit" disabled={editLoading}>Guardar</Button>
              <Button type="button" variant="secondary" onClick={() => setEditingUser(null)}>Cancelar</Button>
            </div>
          </form>
        </div>
      )}

      <TableWithFetch<User>
        url={USERS_QUERY_KEY}
        columns={columns}
        params={{ limit: '30' }}
        emptyMessage="No hay usuarios"
      />
    </div>
  );
}

export default function UsersIsland() {
  return (
    <QueryClientProvider client={queryClient}>
      <UsersContent />
    </QueryClientProvider>
  );
}
