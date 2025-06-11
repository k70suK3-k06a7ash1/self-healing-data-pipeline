
import React from 'react';
import { DataRow } from '../types';
import { MAX_PREVIEW_ROWS } from '../constants';

interface DataTableProps {
  data: DataRow[];
  title?: string;
  maxRows?: number;
}

const DataTable: React.FC<DataTableProps> = ({ data, title, maxRows = MAX_PREVIEW_ROWS }) => {
  if (!data || data.length === 0) {
    return <p className="text-sm text-slate-400">{title ? `${title}: ` : ''}No data to display.</p>;
  }

  const headers = Object.keys(data[0]);
  const displayData = data.slice(0, maxRows);

  return (
    <div className="w-full overflow-x-auto bg-slate-800 shadow-md rounded-lg">
      {title && <h3 className="p-3 text-lg font-semibold text-slate-200 border-b border-slate-700">{title}</h3>}
      <div className="max-h-96 overflow-y-auto">
        <table className="min-w-full divide-y divide-slate-700">
          <thead className="bg-slate-700 sticky top-0">
            <tr>
              {headers.map((header) => (
                <th key={header} scope="col" className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-slate-800 divide-y divide-slate-700">
            {displayData.map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-slate-700/50 transition-colors">
                {headers.map((header) => (
                  <td key={`${rowIndex}-${header}`} className="px-4 py-3 whitespace-nowrap text-sm text-slate-300">
                    {String(row[header])?.length > 50 ? String(row[header]).substring(0, 50) + '...' : String(row[header])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.length > maxRows && (
        <p className="p-3 text-xs text-slate-400 border-t border-slate-700">Showing {maxRows} of {data.length} rows.</p>
      )}
    </div>
  );
};

export default DataTable;
