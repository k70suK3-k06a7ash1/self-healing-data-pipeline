
import React, { useCallback, useState } from 'react';
import { DocumentTextIcon } from './icons/DocumentTextIcon';

interface FileUploadProps {
  onFileUpload: (file: File, content: string) => void;
  disabled?: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileUpload, disabled }) => {
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type === 'text/csv' || file.type === 'application/json') {
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          setFileName(file.name);
          setError(null);
          onFileUpload(file, content);
        };
        reader.onerror = () => {
          setError('Error reading file.');
          setFileName(null);
        }
        reader.readAsText(file);
      } else {
        setError('Invalid file type. Please upload a CSV or JSON file.');
        setFileName(null);
      }
    }
     // Reset file input to allow re-uploading the same file
     event.target.value = '';
  }, [onFileUpload]);

  return (
    <div className="w-full p-4 border-2 border-dashed border-slate-600 rounded-lg hover:border-sky-500 transition-colors duration-200 bg-slate-800">
      <label htmlFor="file-upload" className={`cursor-pointer flex flex-col items-center justify-center space-y-2 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
        <DocumentTextIcon className="w-12 h-12 text-slate-500" />
        <span className="text-sm font-medium text-slate-300">
          {fileName ? `Selected: ${fileName}` : 'Click to upload CSV or JSON file'}
        </span>
        <span className="text-xs text-slate-500">Max file size: 5MB</span>
        <input
          id="file-upload"
          name="file-upload"
          type="file"
          className="sr-only"
          accept=".csv, .json"
          onChange={handleFileChange}
          disabled={disabled}
        />
      </label>
      {error && <p className="mt-2 text-xs text-red-400 text-center">{error}</p>}
    </div>
  );
};

export default FileUpload;
