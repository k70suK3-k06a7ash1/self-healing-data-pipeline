
import React from 'react';

interface SectionCardProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  actionButton?: React.ReactNode;
  defaultOpen?: boolean;
}

const SectionCard: React.FC<SectionCardProps> = ({ title, icon, children, actionButton, defaultOpen = true }) => {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  return (
    <div className="bg-slate-800 shadow-xl rounded-lg overflow-hidden">
      <div 
        className="flex items-center justify-between p-4 border-b border-slate-700 cursor-pointer hover:bg-slate-700/50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center space-x-3">
          {icon && <span className="text-sky-400">{icon}</span>}
          <h2 className="text-xl font-semibold text-slate-100">{title}</h2>
        </div>
        <div className="flex items-center space-x-2">
          {actionButton}
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            fill="none" 
            viewBox="0 0 24 24" 
            strokeWidth={1.5} 
            stroke="currentColor" 
            className={`w-6 h-6 text-slate-400 transform transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </div>
      {isOpen && (
        <div className="p-4 md:p-6">
          {children}
        </div>
      )}
    </div>
  );
};

export default SectionCard;
