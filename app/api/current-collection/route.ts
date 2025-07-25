// app/api/current-collection/route.ts
import { readFile } from 'fs/promises';
import { join } from 'path';

export const dynamic = 'force-dynamic';

function headers(extra: HeadersInit = {}) {
  return { 'Content-Type': 'application/json', ...extra };
}

export async function GET() {
  try {
    const file = join(process.cwd(), 'data', 'currentCollection.json');
    const json = await readFile(file, 'utf8');
    return new Response(json, { status: 200, headers: headers() });
  } catch {
    /* file not found ⇒ no collection configured yet */
    return new Response(JSON.stringify({}), { status: 200, headers: headers() });
  }
}
