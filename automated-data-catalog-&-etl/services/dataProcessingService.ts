
import { DataRow } from '../types';
import Papa from 'papaparse'; // PapaParse is a popular CSV parser

export const parseData = (fileName: string, fileContent: string): DataRow[] => {
  const fileExtension = fileName.split('.').pop()?.toLowerCase();

  if (fileExtension === 'csv') {
    const result = Papa.parse<DataRow>(fileContent, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true, // Automatically convert numbers, booleans
    });
    if (result.errors.length > 0) {
      console.error("CSV parsing errors:", result.errors);
      // For simplicity, we'll return data even with errors. Handle more robustly in production.
    }
    return result.data;
  } else if (fileExtension === 'json') {
    try {
      const jsonData = JSON.parse(fileContent);
      // Expecting an array of objects. If it's a single object, wrap it in an array or handle as needed.
      return Array.isArray(jsonData) ? jsonData : [jsonData];
    } catch (error) {
      console.error("JSON parsing error:", error);
      throw new Error("Invalid JSON format.");
    }
  } else {
    throw new Error("Unsupported file type. Please use CSV or JSON.");
  }
};
