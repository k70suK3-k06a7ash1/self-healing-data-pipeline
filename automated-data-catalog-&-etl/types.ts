
export interface ColumnAnalysis {
  columnName: string;
  originalType?: string; // Type from initial parsing (e.g., string, number)
  inferredSqlType: string; // SQL type suggested by LLM (e.g., TEXT, INTEGER, DATE)
  semanticType: string; // Semantic meaning (e.g., 'Person Name', 'Email Address')
  description: string;
  qualityIssues: string[];
}

export interface TableSchema {
  tableName: string;
  columns: ColumnAnalysis[];
}

export interface EtlLogEntry {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'error' | 'success' | 'warning';
}

export type DataRow = Record<string, any>;

export interface GroundingChunkWeb {
  uri: string;
  title: string;
}

export interface GroundingChunk {
  web?: GroundingChunkWeb;
  // Other types of chunks can be added here if needed
}

export interface GroundingMetadata {
  groundingChunks?: GroundingChunk[];
  // Other grounding metadata fields can be added
}
