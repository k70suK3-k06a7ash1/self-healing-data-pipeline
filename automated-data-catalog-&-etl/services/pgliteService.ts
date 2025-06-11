import * as pgliteModule from "@electric-sql/pglite"; // Using @electric-sql/pglite
import { DataRow } from '../types';

let dbInstance: pgliteModule.PGlite | null = null; // Changed PGLite to PGlite
let currentDbName: string | null = null;

export const initializePGLite = async (dbName: string): Promise<{ success: boolean; error?: string }> => {
  if (dbInstance && currentDbName === dbName) {
    console.log("PGLite already initialized with this DB:", dbName);
    return { success: true };
  }
  
  try {
    // If an old instance exists with a different name, close it.
    if (dbInstance) {
        await dbInstance.close();
        console.log("Closed previous PGLite instance:", currentDbName);
    }
    console.log("Initializing PGLite with DB:", dbName);
    // PGLite constructor can take a dataDir string for persistence, 
    // or defaults to in-memory if not provided or if environment doesn't support persistence well.
    // For this app, we'll use a unique name for each session/dataset to keep it in-memory like behavior.
    dbInstance = new pgliteModule.PGlite(`pglite://${dbName}`); // Changed PGLite to PGlite
    await dbInstance.waitReady; // Ensure the database is ready
    currentDbName = dbName;
    console.log("PGLite initialized successfully with DB:", dbName);
    return { success: true };
  } catch (error) {
    console.error("Failed to initialize PGLite:", error);
    dbInstance = null;
    currentDbName = null;
    return { success: false, error: `PGLite initialization failed: ${error instanceof Error ? error.message : String(error)}` };
  }
};

export const executeSql = async (sql: string): Promise<{ success: boolean; results?: any[]; error?: string }> => {
  if (!dbInstance) {
    return { success: false, error: "PGLite not initialized." };
  }
  try {
    console.log("Executing SQL:", sql);
    const results = await dbInstance.query(sql);
    console.log("SQL execution successful, results:", results);
    return { success: true, results };
  } catch (error) {
    console.error("PGLite SQL execution error:", error, "SQL:", sql);
    return { success: false, error: `SQL execution error: ${error instanceof Error ? error.message : String(error)}` };
  }
};

export const batchInsertData = async (tableName: string, data: DataRow[]): Promise<{ success: boolean; error?: string }> => {
  if (!dbInstance) {
    return { success: false, error: "PGLite not initialized." };
  }
  if (data.length === 0) {
    return { success: true }; // No data to insert
  }

  const columns = Object.keys(data[0]);
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(',');
  const insertSqlBase = `INSERT INTO "${tableName}" (${columns.map(c => `"${c}"`).join(',')}) VALUES (${placeholders})`;

  try {
    // PGLite transactions for batch operations
    await dbInstance.transaction(async (tx) => {
      for (const row of data) {
        const values = columns.map(col => row[col]);
        // console.log("Preparing to insert row:", values, "SQL:", insertSqlBase);
        await tx.query(insertSqlBase, values);
      }
    });
    console.log(`Successfully inserted ${data.length} rows into ${tableName}.`);
    return { success: true };
  } catch (error) {
    console.error("PGLite batch insert error:", error);
    return { success: false, error: `Batch insert error: ${error instanceof Error ? error.message : String(error)}` };
  }
};


export const queryTableData = async (tableName: string, limit: number = 10): Promise<{ success: boolean; data?: DataRow[]; error?: string }> => {
    if (!dbInstance) {
      return { success: false, error: "PGLite not initialized." };
    }
    try {
      // Ensure table name is quoted to handle special characters or case sensitivity
      const safeTableName = `"${tableName}"`;
      const sql = `SELECT * FROM ${safeTableName} LIMIT ${limit};`;
      // Call query without explicit generic, let it default to Row or infer.
      // The result will be RowList<Row> (or similar, depending on PGLite's default)
      const resultsFromDb = await dbInstance.query(sql);
      // Cast the result to DataRow[] for the return type.
      // This assumes that the structure of rows returned by PGLite is compatible with DataRow.
      // Since DataRow uses `any` for values, this cast is generally permissible
      // if the actual data types are compatible (e.g. string, number, boolean, null).
      return { success: true, data: resultsFromDb as DataRow[] };
    } catch (error) {
      console.error(`Error querying table ${tableName}:`, error);
      return { success: false, error: `Failed to query table ${tableName}: ${error instanceof Error ? error.message : String(error)}` };
    }
  };


export const getPGLiteInstance = (): pgliteModule.PGlite | null => dbInstance; // Changed PGLite to PGlite

export const closePGLite = async (): Promise<void> => {
    if (dbInstance) {
        try {
            await dbInstance.close();
            console.log("PGLite instance closed:", currentDbName);
        } catch(e) {
            console.error("Error closing PGLite instance:", e);
        } finally {
            dbInstance = null;
            currentDbName = null;
        }
    }
};