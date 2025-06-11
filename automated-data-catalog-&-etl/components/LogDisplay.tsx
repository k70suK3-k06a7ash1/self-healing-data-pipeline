
import React from 'react';
import { EtlLogEntry } from '../types';
import { CheckCircleIcon } from './icons/CheckCircleIcon';
import { ExclamationTriangleIcon } from './icons/ExclamationTriangleIcon';

interface LogDisplayProps {
  logs: EtlLogEntry[];
  title?: string;
}

const LogDisplay: React.FC<LogDisplayProps> = ({ logs, title = "Process Logs" }) => {
  const getIcon = (type: EtlLogEntry['type']) => {
    switch (type) {
      case 'success': return <CheckCircleIcon className="w-5 h-5 text-green-400" />;
      case 'error': return <ExclamationTriangleIcon className="w-5 h-5 text-red-400" />;
      case 'warning': return <ExclamationTriangleIcon className="w-5 h-5 text-yellow-400" />;
      case 'info':
      default:
        return <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-sky-400"><path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" /></svg>;
    }
  };

  const getTextColor = (type: EtlLogEntry['type']) => {
    switch (type) {
      case 'success': return "text-green-300";
      case 'error': return "text-red-300";
      case 'warning': return "text-yellow-300";
      case 'info':
      default:
        return "text-sky-300";
    }
  };


  return (
    <div className="bg-slate-800 shadow-md rounded-lg p-4 max-h-96 overflow-y-auto">
      <h3 className="text-lg font-semibold text-slate-200 mb-3 sticky top-0 bg-slate-800 py-2 border-b border-slate-700">{title}</h3>
      {logs.length === 0 ? (
        <p className="text-sm text-slate-400">No logs yet.</p>
      ) : (
        <ul className="space-y-2">
          {logs.map((log) => (
            <li key={log.id} className={`flex items-start space-x-2 p-2 rounded-md bg-slate-700/30 text-sm ${getTextColor(log.type)}`}>
              <span className="flex-shrink-0 mt-0.5">{getIcon(log.type)}</span>
              <div>
                <span className="font-mono text-xs text-slate-500 mr-2">{log.timestamp}</span>
                <span>{log.message}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default LogDisplay;
