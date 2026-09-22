import { type Table, getTableColumns } from 'drizzle-orm';
import { chunk } from './array';

// D1 は 1 クエリあたり 100 個までしか bound parameter を受け付けず、超えるとクエリ全体が失敗する
const MAX_BOUND_PARAMS = 100;

export function chunkForInsert<T>(table: Table, rows: T[]): T[][] {
  const columnCount = Object.keys(getTableColumns(table)).length;
  return chunk(rows, Math.max(1, Math.floor(MAX_BOUND_PARAMS / columnCount)));
}
