
import { GoogleGenAI, GenerateContentResponse, Part, GroundingMetadata } from "@google/genai";
import { DataRow, ColumnAnalysis, TableSchema } from '../types';
import { GEMINI_MODEL_TEXT, MAX_DATA_SAMPLE_ROWS_FOR_LLM } from '../constants';

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  // This will be caught by the App component and displayed to the user.
  // We throw here to make it explicit during development if the key is missing.
  console.error("API_KEY environment variable not set for Gemini API.");
}

// Initialize the GoogleGenAI client instance.
// Ensure this is done only once or managed appropriately in your app's lifecycle.
// For this example, we initialize it here. If API_KEY is undefined, it might throw an error or fail silently later.
const ai = API_KEY ? new GoogleGenAI({ apiKey: API_KEY }) : null;


const prepareDataSample = (data: DataRow[]): string => {
  if (!data || data.length === 0) return "No data provided.";
  const sample = data.slice(0, MAX_DATA_SAMPLE_ROWS_FOR_LLM);
  const headers = Object.keys(sample[0]).join(',');
  const rows = sample.map(row => Object.values(row).map(val => String(val).replace(/,/g,' ')).join(',')).join('\\n'); // Simple CSV-like format
  return `Headers: ${headers}\\nData (first ${sample.length} rows):\\n${rows}`;
};

const parseJsonFromMarkdown = <T,>(text: string): T | null => {
  let jsonStr = text.trim();
  const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
  const match = jsonStr.match(fenceRegex);
  if (match && match[2]) {
    jsonStr = match[2].trim();
  }
  try {
    return JSON.parse(jsonStr) as T;
  } catch (e) {
    console.error("Failed to parse JSON response:", e, "Original text:", text);
    // Try to return the original text if it's already valid JSON (e.g. if LLM didn't use fences)
    try {
        return JSON.parse(text) as T;
    } catch (e2) {
        console.error("Failed to parse original text as JSON:", e2);
        return null;
    }
  }
};


export const analyzeSchemaWithGemini = async (
  data: DataRow[],
  fileName: string
): Promise<{ analysis: ColumnAnalysis[] | null; error?: string }> => {
  if (!ai) return { analysis: null, error: "Gemini API client not initialized. API_KEY might be missing." };

  const sampleDataString = prepareDataSample(data);
  const prompt = `
    Analyze the following data sample from a file named "${fileName}".
    For each column, provide:
    1.  columnName: The original name of the column.
    2.  inferredSqlType: The most appropriate SQL data type for PGLite (e.g., TEXT, INTEGER, REAL, DATE, TIMESTAMP, BOOLEAN, BLOB). Prioritize TEXT for unknown or mixed types.
    3.  semanticType: A concise description of the column's semantic meaning (e.g., 'Person Name', 'Email Address', 'Product ID', 'Unique Identifier', 'Category', 'Monetary Value', 'Count', 'Date of Birth', 'URL', 'Geographic Coordinate'). If unsure, use 'General Text', 'Numeric Value', etc.
    4.  description: A brief human-readable description of what the column likely represents.
    5.  qualityIssues: An array of strings describing potential data quality issues observed in the sample for this column (e.g., "Contains null values", "Mixed data types observed", "Potentially inconsistent formatting", "Possible outliers detected", "High cardinality unique values"). Keep this array brief.

    Data Sample:
    ${sampleDataString}

    Respond ONLY with a JSON array of objects, where each object represents a column and follows this structure:
    [{ "columnName": "...", "inferredSqlType": "...", "semanticType": "...", "description": "...", "qualityIssues": ["..."] }, ...]
    Ensure the JSON is well-formed. Do not include any explanatory text before or after the JSON array.
  `;

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: GEMINI_MODEL_TEXT,
      contents: [{ role: "user", parts: [{text: prompt}] }],
      config: {
        responseMimeType: "application/json",
        temperature: 0.2, // Lower temperature for more deterministic schema analysis
      },
    });

    const parsedResult = parseJsonFromMarkdown<ColumnAnalysis[]>(response.text);
    if (!parsedResult) {
      return { analysis: null, error: "Failed to parse schema analysis from LLM response." };
    }
    // Validate that it's an array
    if (!Array.isArray(parsedResult)) {
        console.error("LLM response for schema is not an array:", parsedResult);
        return { analysis: null, error: "LLM response for schema analysis was not in the expected array format." };
    }
    return { analysis: parsedResult };

  } catch (error) {
    console.error("Error analyzing schema with Gemini:", error);
    return { analysis: null, error: `Gemini API error: ${error instanceof Error ? error.message : String(error)}` };
  }
};

export const generateSqlSchemaWithGemini = async (
  columns: ColumnAnalysis[],
  baseTableName: string
): Promise<{ sql: string | null; error?: string }> => {
  if (!ai) return { sql: null, error: "Gemini API client not initialized. API_KEY might be missing." };

  const prompt = `
    Based on the following column metadata, generate a PGLite compatible SQL CREATE TABLE statement.
    The table name should be "${baseTableName}".
    Use the 'inferredSqlType' for each column. Ensure primary keys or unique constraints are NOT added automatically unless explicitly stated in semantic types like 'Unique Identifier'.
    Focus on creating a basic table structure.

    Column Metadata:
    ${JSON.stringify(columns, null, 2)}

    Respond ONLY with the SQL CREATE TABLE statement. Do not include any explanatory text, markdown, or backticks.
    Example: CREATE TABLE ${baseTableName} (column1 TEXT, column2 INTEGER);
  `;

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: GEMINI_MODEL_TEXT,
      contents: [{ role: "user", parts: [{text: prompt}] }],
      config: {
        temperature: 0.1, // Very low temperature for precise SQL generation
      },
    });

    let sqlStatement = response.text.trim();
    // Remove potential markdown fences if responseMimeType: "application/json" was not used or failed
    const fenceRegex = /^```(sql)?\s*\n?(.*?)\n?\s*```$/s;
    const match = sqlStatement.match(fenceRegex);
    if (match && match[2]) {
      sqlStatement = match[2].trim();
    }
    
    // Basic validation
    if (!sqlStatement.toUpperCase().startsWith("CREATE TABLE")) {
        return { sql: null, error: "LLM did not return a valid CREATE TABLE statement. Response: " + sqlStatement };
    }

    return { sql: sqlStatement };
  } catch (error) {
    console.error("Error generating SQL schema with Gemini:", error);
    return { sql: null, error: `Gemini API error: ${error instanceof Error ? error.message : String(error)}` };
  }
};

// Placeholder for future ETL script generation
export const generateEtlScriptsWithGemini = async (
  schema: TableSchema,
  dataSample: DataRow[]
): Promise<{ scripts: string[] | null; error?: string }> => {
   if (!ai) return { scripts: null, error: "Gemini API client not initialized. API_KEY might be missing." };
  // This is a more complex task and would require careful prompting.
  // For now, it's a placeholder.
  console.warn("generateEtlScriptsWithGemini is not fully implemented.");
  return Promise.resolve({ scripts: [], error: "ETL script generation not yet implemented." });
};

// Placeholder for generic query
export const queryWithGemini = async (
  promptText: string,
  useGoogleSearch: boolean = false
): Promise<{ text: string | null; groundingMetadata?: GroundingMetadata; error?: string; }> => {
  if (!ai) return { text: null, error: "Gemini API client not initialized. API_KEY might be missing." };

  const parts: Part[] = [{ text: promptText }];
  
  const config: any = { // Use 'any' for config to allow conditional 'tools'
    temperature: 0.7,
  };

  if (useGoogleSearch) {
    config.tools = [{ googleSearch: {} }];
    // IMPORTANT: Do not use responseMimeType: "application/json" with googleSearch
  } else {
    config.responseMimeType = "application/json"; // For general queries where JSON might be useful
  }
  
  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: GEMINI_MODEL_TEXT,
      contents: [{ role: "user", parts: parts }],
      config: config,
    });
    
    const textOutput = response.text;
    const groundingMetadata = response.candidates?.[0]?.groundingMetadata as GroundingMetadata | undefined;

    return { text: textOutput, groundingMetadata };

  } catch (error) {
    console.error("Error querying Gemini:", error);
    return { text: null, error: `Gemini API error: ${error instanceof Error ? error.message : String(error)}` };
  }
};
