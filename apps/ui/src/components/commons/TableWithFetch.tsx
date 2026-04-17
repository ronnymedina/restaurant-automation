import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import Table from './Table';
import { apiFetch } from '../../lib/api';

interface Meta {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
}

interface ApiResponse<T> {
  data: T[];
  meta: Meta;
}

interface TableWithFetchProps<T> {
  url: string;
  columns: ColumnDef<T>[];
  params?: Record<string, string>;
  emptyMessage?: string;
}

export default function TableWithFetch<T>({
  url,
  columns,
  params = {},
  emptyMessage,
}: TableWithFetchProps<T>) {
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery<ApiResponse<T>>({
    queryKey: [url, params, page],
    queryFn: async () => {
      const qs = new URLSearchParams({ ...params, page: String(page) }).toString();
      const res = await apiFetch(`${url}?${qs}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<ApiResponse<T>>;
    },
  });

  if (isError) {
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border border-gray-200 rounded-lg">
          <tbody>
            <tr>
              <td className="px-4 py-4 text-center text-sm text-red-600">
                Error al cargar los datos
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <Table
      columns={columns}
      data={data?.data ?? []}
      isLoading={isLoading}
      emptyMessage={emptyMessage}
      pagination={
        data?.meta && data.meta.totalPages > 1
          ? { page, totalPages: data.meta.totalPages, onPageChange: setPage }
          : undefined
      }
    />
  );
}
