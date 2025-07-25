// app/api/import-collection/route.ts
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export const dynamic = 'force-dynamic';

const ALLOWED_ORIGIN = 'http://localhost:3000';
const headersBase = {
  'Access-Control-Allow-Origin' : ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: headersBase });
}

export async function POST(req: Request) {
  try {
    const { address, cid } = await req.json();
    if (!address || !cid)
      return new Response(
        JSON.stringify({ error: 'address or cid missing' }),
        { status: 400, headers: { ...headersBase, 'Content-Type': 'application/json' } },
      );

    /* ensure ./data exists */
    const dir  = join(process.cwd(), 'data');
    await mkdir(dir, { recursive: true });

    /* write or overwrite file */
    const file = join(dir, 'currentCollection.json');
    await writeFile(file, JSON.stringify({ address, cid }), 'utf8');

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { ...headersBase, 'Content-Type': 'application/json' } },
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e.message || 'failed' }),
      { status: 500, headers: { ...headersBase, 'Content-Type': 'application/json' } },
    );
  }
}
