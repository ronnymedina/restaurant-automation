import { useState } from 'react';
import IconButton from '../../commons/icons/IconButton';
import Button from '../../commons/Button';
import type { MenuItem } from '../../../lib/menus-api';
import { deleteMenuItem, updateMenuItem } from '../../../lib/menus-api';

interface MenuItemsSectionProps {
  menuId: string;
  sectionName: string;
  items: MenuItem[];
  onAddProducts: () => void;
  onRefresh: () => void;
}

export default function MenuItemsSection({
  menuId,
  sectionName,
  items,
  onAddProducts,
  onRefresh,
}: MenuItemsSectionProps) {
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editSectionName, setEditSectionName] = useState('');

  const handleEditOpen = (item: MenuItem) => {
    setEditingItemId(item.id);
    setEditSectionName(item.sectionName ?? '');
  };

  const handleEditSave = async (itemId: string) => {
    await updateMenuItem(menuId, itemId, { sectionName: editSectionName || null });
    setEditingItemId(null);
    onRefresh();
  };

  const handleDelete = async (itemId: string) => {
    if (!confirm('¿Quitar este producto del menú?')) return;
    await deleteMenuItem(menuId, itemId);
    onRefresh();
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-4">
      <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
        <h3 className="text-sm font-semibold text-slate-700">{sectionName}</h3>
        <Button size="sm" variant="secondary" onClick={onAddProducts}>
          + Agregar productos
        </Button>
      </div>

      <table className="w-full text-sm">
        <thead className="border-b border-slate-100">
          <tr>
            <th className="text-left px-4 py-2 font-medium text-slate-500 text-xs">Orden</th>
            <th className="text-left px-4 py-2 font-medium text-slate-500 text-xs">Producto</th>
            <th className="text-left px-4 py-2 font-medium text-slate-500 text-xs">Categoría</th>
            <th className="text-left px-4 py-2 font-medium text-slate-500 text-xs">Precio</th>
            <th className="text-right px-4 py-2 font-medium text-slate-500 text-xs">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50">
              <td className="px-4 py-2.5 text-slate-400 text-xs">{item.order}</td>
              <td className="px-4 py-2.5 font-medium text-slate-800">{item.product.name}</td>
              <td className="px-4 py-2.5 text-slate-500 text-xs">
                {item.product.category?.name ?? '-'}
              </td>
              <td className="px-4 py-2.5 text-slate-600">
                ${Number(item.product.price).toFixed(2)}
              </td>
              <td className="px-4 py-2.5 text-right">
                {editingItemId === item.id ? (
                  <div className="flex gap-2 justify-end items-center">
                    <input
                      type="text"
                      value={editSectionName}
                      onChange={e => setEditSectionName(e.target.value)}
                      className="px-2 py-1 border border-slate-300 rounded text-xs w-32 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <Button size="sm" onClick={() => handleEditSave(item.id)}>
                      Guardar
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditingItemId(null)}>
                      Cancelar
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-1 justify-end">
                    <IconButton
                      icon="pencil"
                      label="Editar sección"
                      variant="primary"
                      onClick={() => handleEditOpen(item)}
                    />
                    <IconButton
                      icon="trash"
                      label="Quitar producto"
                      variant="danger"
                      onClick={() => handleDelete(item.id)}
                    />
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
