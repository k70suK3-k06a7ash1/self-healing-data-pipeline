
import React, { useState, useCallback, useEffect } from 'react';
import FileUpload from './components/FileUpload';
import DataTable from './components/DataTable';
import LogDisplay from './components/LogDisplay';
import LoadingSpinner from './components/LoadingSpinner';
import SectionCard from './components/SectionCard';
import { parseData } from './services/dataProcessingService';
import { analyzeSchemaWithGemini, generateSqlSchemaWithGemini } from './services/geminiService';
import { initializePGLite, executeSql, batchInsertData, queryTableData, closePGLite } from './services/pgliteService';
import { DataRow, ColumnAnalysis, EtlLogEntry, TableSchema } from './types';
import { MAX_PREVIEW_ROWS, PGLITE_DB_NAME_PREFIX } from './constants';
import { DocumentTextIcon } from './components/icons/DocumentTextIcon';
import { TableCellsIcon } from './components/icons/TableCellsIcon';
import { CodeBracketIcon } from './components/icons/CodeBracketIcon';
import { ExclamationTriangleIcon } from './components/icons/ExclamationTriangleIcon'; // Added import

enum AppStep {
  Upload,
  AnalyzingSchema,
  ReviewSchema,
  GeneratingSql,
  ReviewSql,
  ProcessingDb,
  Done,
  Error,
}

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<AppStep>(AppStep.Upload);
  const [file, setFile] = useState<File | null>(null);
  const [rawDataPreview, setRawDataPreview] = useState<DataRow[] | null>(null);
  const [fullParsedData, setFullParsedData] = useState<DataRow[] | null>(null);
  
  const [schemaAnalysis, setSchemaAnalysis] = useState<ColumnAnalysis[] | null>(null);
  const [generatedCreateTableSql, setGeneratedCreateTableSql] = useState<string | null>(null);
  
  const [etlLogs, setEtlLogs] = useState<EtlLogEntry[]>([]);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const [pgliteStatus, setPgliteStatus] = useState<'inactive' | 'initializing' | 'ready' | 'error'>('inactive');
  const [currentDbName, setCurrentDbName] = useState<string | null>(null);
  const [dbDataPreview, setDbDataPreview] = useState<DataRow[] | null>(null);

  const isApiKeyMissing = !process.env.API_KEY;

  const addLog = useCallback((message: string, type: EtlLogEntry['type'] = 'info') => {
    setEtlLogs(prevLogs => [
      ...prevLogs,
      { id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), message, type }
    ]);
  }, []);

  useEffect(() => {
    if (isApiKeyMissing) {
      addLog("Critical: Gemini API Key (process.env.API_KEY) is missing. Most features will not work.", 'error');
      setGlobalError("Gemini API Key is not configured. Please set the process.env.API_KEY environment variable.");
      setCurrentStep(AppStep.Error);
    }
    // Cleanup PGLite on component unmount
    return () => {
        closePGLite();
    };
  }, [isApiKeyMissing, addLog]);


  const resetState = useCallback(() => { 
    setCurrentStep(isApiKeyMissing ? AppStep.Error : AppStep.Upload);
    setFile(null);
    setRawDataPreview(null);
    setFullParsedData(null);
    setSchemaAnalysis(null);
    setGeneratedCreateTableSql(null);
    // Keep logs for history, or clear them:
    // setEtlLogs([]); 
    if(!isApiKeyMissing) setGlobalError(null);
    setPgliteStatus('inactive');
    if (currentDbName) {
      // Consider if we want to close/delete the old DB or allow reconnecting
      // For now, closing it simplifies things.
      closePGLite(); 
    }
    setCurrentDbName(null);
    setDbDataPreview(null);
    addLog("State reset. Ready for new file upload.", "info"); 
  }, [isApiKeyMissing, currentDbName, addLog]);


  const handleFileUpload = useCallback(async (uploadedFile: File, content: string) => {
    if (isApiKeyMissing) return;
    
    resetState(); 
    addLog(`File "${uploadedFile.name}" selected. Type: ${uploadedFile.type}. Size: ${uploadedFile.size} bytes.`);
    setFile(uploadedFile);
    setCurrentStep(AppStep.AnalyzingSchema);

    try {
      const parsed = parseData(uploadedFile.name, content);
      setRawDataPreview(parsed.slice(0, MAX_PREVIEW_ROWS));
      setFullParsedData(parsed);
      addLog(`Successfully parsed ${parsed.length} rows from "${uploadedFile.name}".`);

      if (parsed.length === 0) {
        addLog("Uploaded file is empty or contains no data rows.", 'warning');
        setGlobalError("Uploaded file contains no data.");
        setCurrentStep(AppStep.Error);
        return;
      }

      addLog("Starting schema analysis with Gemini...");
      const analysisResult = await analyzeSchemaWithGemini(parsed, uploadedFile.name);
      if (analysisResult.error || !analysisResult.analysis) {
        throw new Error(analysisResult.error || "Schema analysis failed to return data.");
      }
      setSchemaAnalysis(analysisResult.analysis);
      addLog("Schema analysis complete.", 'success');
      setCurrentStep(AppStep.ReviewSchema);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`Error during file processing or schema analysis: ${errorMessage}`, 'error');
      setGlobalError(`Failed to process file or analyze schema: ${errorMessage}`);
      setCurrentStep(AppStep.Error);
    }
  }, [addLog, isApiKeyMissing, resetState]);

  const handleGenerateSql = useCallback(async () => {
    if (!schemaAnalysis || !file || isApiKeyMissing) return;
    setCurrentStep(AppStep.GeneratingSql);
    addLog("Generating SQL CREATE TABLE statement with Gemini...");
    
    const baseTableName = file.name.split('.')[0].replace(/[^a-zA-Z0-9_]/g, '_') || 'uploaded_data';

    const sqlResult = await generateSqlSchemaWithGemini(schemaAnalysis, baseTableName);
    if (sqlResult.error || !sqlResult.sql) {
      const errorMessage = sqlResult.error || "SQL generation failed to return data.";
      addLog(`Error generating SQL: ${errorMessage}`, 'error');
      setGlobalError(`Failed to generate SQL: ${errorMessage}`);
      setCurrentStep(AppStep.Error); // Or back to ReviewSchema
      return;
    }
    setGeneratedCreateTableSql(sqlResult.sql);
    addLog("SQL CREATE TABLE statement generated.", 'success');
    setCurrentStep(AppStep.ReviewSql);
  }, [schemaAnalysis, file, addLog, isApiKeyMissing]);

  const handleProcessWithPGLite = useCallback(async () => {
    if (!generatedCreateTableSql || !fullParsedData || !file || isApiKeyMissing) return;
    setCurrentStep(AppStep.ProcessingDb);
    addLog("Processing data with PGLite...");

    const newDbName = `${PGLITE_DB_NAME_PREFIX}${Date.now()}`;
    setCurrentDbName(newDbName);
    setPgliteStatus('initializing');
    addLog(`Initializing PGLite database: ${newDbName}...`);
    const initResult = await initializePGLite(newDbName);

    if (!initResult.success) {
      addLog(`PGLite initialization failed: ${initResult.error}`, 'error');
      setGlobalError(`PGLite failed: ${initResult.error}`);
      setPgliteStatus('error');
      setCurrentStep(AppStep.Error);
      return;
    }
    setPgliteStatus('ready');
    addLog("PGLite initialized successfully.", 'success');
    
    // Extract table name from CREATE TABLE statement (simple regex, might need improvement for complex cases)
    const tableNameMatch = generatedCreateTableSql.match(/CREATE TABLE\s+"?([^"\s(]+)"?/i);
    const tableName = tableNameMatch ? tableNameMatch[1] : (file.name.split('.')[0].replace(/[^a-zA-Z0-9_]/g, '_') || 'uploaded_data');

    addLog(`Executing CREATE TABLE statement for table "${tableName}"...`);
    const createTableResult = await executeSql(generatedCreateTableSql);
    if (!createTableResult.success) {
      addLog(`Failed to create table: ${createTableResult.error}`, 'error');
      setGlobalError(`PGLite error: ${createTableResult.error}`);
      setCurrentStep(AppStep.Error);
      return;
    }
    addLog(`Table "${tableName}" created successfully.`, 'success');

    addLog(`Inserting ${fullParsedData.length} rows into "${tableName}"...`);
    const insertResult = await batchInsertData(tableName, fullParsedData);
    if (!insertResult.success) {
      addLog(`Failed to insert data: ${insertResult.error}`, 'error');
      setGlobalError(`PGLite error: ${insertResult.error}`);
      setCurrentStep(AppStep.Error);
      return;
    }
    addLog(`Data insertion complete. ${fullParsedData.length} rows processed.`, 'success');
    
    addLog(`Fetching preview from table "${tableName}"...`);
    const previewResult = await queryTableData(tableName, MAX_PREVIEW_ROWS);
    if (previewResult.success && previewResult.data) {
        setDbDataPreview(previewResult.data);
        addLog(`Successfully fetched ${previewResult.data.length} rows from "${tableName}".`, 'success');
    } else {
        addLog(`Failed to fetch preview from DB: ${previewResult.error}`, 'warning');
    }

    setCurrentStep(AppStep.Done);
    addLog("ETL process completed.", 'success');

  }, [generatedCreateTableSql, fullParsedData, file, addLog, isApiKeyMissing]);

  const isLoading = [
    AppStep.AnalyzingSchema,
    AppStep.GeneratingSql,
    AppStep.ProcessingDb,
  ].includes(currentStep) || pgliteStatus === 'initializing';

  const renderCurrentStepContent = () => {
    if (globalError && currentStep === AppStep.Error) {
      return (
        <div className="text-center p-8 bg-red-900/30 rounded-lg">
          <ExclamationTriangleIcon className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h3 className="text-2xl font-semibold text-red-300 mb-2">An Error Occurred</h3>
          <p className="text-red-200 mb-6">{globalError}</p>
          <button
            onClick={resetState}
            className="px-6 py-2 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-lg shadow-md transition-colors"
          >
            Start Over
          </button>
        </div>
      );
    }
    
    // Main UI structure
    return (
      <div className="space-y-8">
        <SectionCard title="1. Upload Data Source" icon={<DocumentTextIcon className="w-6 h-6"/>} defaultOpen={currentStep === AppStep.Upload}>
          <FileUpload onFileUpload={handleFileUpload} disabled={isLoading || isApiKeyMissing} />
        </SectionCard>

        {rawDataPreview && (
          <SectionCard title="Data Preview (Raw)" icon={<TableCellsIcon className="w-6 h-6"/>} defaultOpen={true}>
            <DataTable data={rawDataPreview} title={`First ${MAX_PREVIEW_ROWS} rows of ${file?.name}`} />
          </SectionCard>
        )}

        {schemaAnalysis && (
          <SectionCard 
            title="2. Schema Analysis & Catalog" 
            icon={<TableCellsIcon className="w-6 h-6"/>}
            actionButton={currentStep === AppStep.ReviewSchema && (
                <button
                onClick={handleGenerateSql}
                disabled={isLoading}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold rounded-md shadow-sm transition-colors disabled:opacity-50"
              >
                Generate SQL Schema
              </button>
            )}
            defaultOpen={currentStep >= AppStep.ReviewSchema}
          >
            <div className="space-y-3">
              <h4 className="text-md font-semibold text-slate-300">Inferred Column Metadata:</h4>
              <div className="max-h-96 overflow-y-auto bg-slate-800/50 p-3 rounded-md border border-slate-700">
              {schemaAnalysis.map(col => (
                <details key={col.columnName} className="mb-2 p-2 bg-slate-700 rounded shadow">
                  <summary className="font-semibold text-sky-400 cursor-pointer">{col.columnName} <span className="text-xs text-slate-400">({col.inferredSqlType} - {col.semanticType})</span></summary>
                  <p className="text-sm text-slate-300 mt-1 pl-4">{col.description}</p>
                  {col.qualityIssues && col.qualityIssues.length > 0 && (
                    <div className="mt-1 pl-4">
                      <p className="text-xs font-medium text-yellow-400">Quality Notes:</p>
                      <ul className="list-disc list-inside text-xs text-yellow-300">
                        {col.qualityIssues.map((issue, i) => <li key={i}>{issue}</li>)}
                      </ul>
                    </div>
                  )}
                </details>
              ))}
              </div>
            </div>
          </SectionCard>
        )}

        {generatedCreateTableSql && (
           <SectionCard 
            title="3. Generated ETL (SQL Schema)" 
            icon={<CodeBracketIcon className="w-6 h-6"/>}
            actionButton={currentStep === AppStep.ReviewSql && (
                <button
                onClick={handleProcessWithPGLite}
                disabled={isLoading}
                className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-semibold rounded-md shadow-sm transition-colors disabled:opacity-50"
              >
                Load to PGLite Database
              </button>
            )}
            defaultOpen={currentStep >= AppStep.ReviewSql}
          >
            <h4 className="text-md font-semibold text-slate-300 mb-2">PGLite CREATE TABLE Statement:</h4>
            <pre className="bg-slate-900 p-4 rounded-md text-sky-300 text-sm overflow-x-auto border border-slate-700">
              <code>{generatedCreateTableSql}</code>
            </pre>
          </SectionCard>
        )}

        {pgliteStatus !== 'inactive' && dbDataPreview && currentStep === AppStep.Done && (
            <SectionCard title="4. Data in PGLite" icon={<TableCellsIcon className="w-6 h-6" />} defaultOpen={true}>
                 <DataTable data={dbDataPreview} title={`Preview from PGLite table (DB: ${currentDbName})`} />
            </SectionCard>
        )}

        {isLoading && (
            <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center z-50">
                <LoadingSpinner text={
                    currentStep === AppStep.AnalyzingSchema ? "Analyzing schema..." :
                    currentStep === AppStep.GeneratingSql ? "Generating SQL..." :
                    currentStep === AppStep.ProcessingDb ? (pgliteStatus === 'initializing' ? "Initializing PGLite DB..." : "Processing data in PGLite...") :
                    "Loading..."
                } size="lg" />
            </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-4 md:p-8 selection:bg-sky-500 selection:text-white">
      <header className="mb-8 text-center">
        <h1 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-cyan-300">
          Automated Data Catalog & ETL
        </h1>
        <p className="mt-2 text-slate-400 max-w-2xl mx-auto">
          Upload your data (CSV/JSON), and let AI analyze its structure, generate a schema, and prepare it for an in-browser database.
        </p>
      </header>

      {isApiKeyMissing && currentStep !== AppStep.Error && (
         <div className="mb-6 p-4 bg-red-800/50 border border-red-700 rounded-lg text-center">
           <ExclamationTriangleIcon className="w-8 h-8 text-red-300 mx-auto mb-2" />
           <p className="text-red-200 font-semibold">Gemini API Key is missing.</p>
           <p className="text-red-300 text-sm">Please ensure the <code>process.env.API_KEY</code> environment variable is set. Application functionality is limited.</p>
         </div>
      )}
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        <main className="lg:col-span-2 space-y-6">
          {renderCurrentStepContent()}
        </main>
        <aside className="lg:col-span-1 space-y-6">
           <SectionCard title="Process Logs" icon={<DocumentTextIcon className="w-6 h-6"/>} defaultOpen={true}>
             <LogDisplay logs={etlLogs} />
          </SectionCard>
          {file && currentStep !== AppStep.Upload && currentStep !== AppStep.Error && (
             <button
                onClick={resetState}
                disabled={isLoading}
                className="w-full mt-4 px-6 py-3 bg-slate-600 hover:bg-slate-500 text-white font-semibold rounded-lg shadow-md transition-colors disabled:opacity-50"
              >
                Reset / Upload New File
              </button>
          )}
        </aside>
      </div>

      <footer className="mt-12 pt-8 border-t border-slate-700 text-center text-sm text-slate-500">
        <p>&copy; {new Date().getFullYear()} AI Data Tools Inc. All rights reserved.</p>
        <p>Powered by React, Tailwind CSS, Gemini API, and PGLite.</p>
      </footer>
    </div>
  );
};

export default App;