import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

interface Props<T extends object> {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  empty?: ReactNode;
  /** Class applied to the outer .table-wrap container. */
  className?: string;
  /** Class applied to the inner <table>. Use 'data-table-compact' for 28px rows. */
  tableClassName?: string;
}

/**
 * Plain TanStack Table wrapper. Renders inside .table-wrap / .table-scroll
 * so callers don't need to wire scroll/empty handling.
 */
export const Table = <T extends object>({
  columns,
  data,
  empty,
  className,
  tableClassName,
}: Props<T>) => {
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });

  if (data.length === 0 && empty) {
    return <div className="empty-state">{empty}</div>;
  }

  return (
    <div className={cn('table-wrap', className)}>
      <div className="table-scroll">
        <table className={cn('data-table', tableClassName)}>
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
