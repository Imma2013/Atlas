import { createDriveFile, getDriveItemContent, listDriveRootChildren } from '@/lib/microsoft';
import { z } from 'zod';

export const runtime = 'nodejs';

const getAccessToken = (req: Request) =>
  req.headers.get('x-microsoft-access-token') ||
  req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

export const GET = async (req: Request) => {
  try {
    const accessToken = getAccessToken(req);
    if (!accessToken) {
      return Response.json({ message: 'Missing Microsoft access token' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const fileId = searchParams.get('id');
    const includeContent = searchParams.get('content') === '1';

    if (fileId && includeContent) {
      const content = await getDriveItemContent(accessToken, fileId);
      return Response.json({ fileId, content }, { status: 200 });
    }

    const files = await listDriveRootChildren(accessToken, 25);
    return Response.json({ files: files.value }, { status: 200 });
  } catch (error: any) {
    const message = String(error?.message || '');
    const unauthorized =
      message.includes('(401)') || message.includes('InvalidAuthenticationToken');

    return Response.json(
      {
        message: unauthorized
          ? 'Microsoft token is expired or invalid. Reconnect Microsoft in Apps.'
          : 'Failed to fetch files',
        error: error?.message || 'Unknown error',
      },
      { status: unauthorized ? 401 : 500 },
    );
  }
};

const createFileSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().min(1),
  format: z.enum(['doc', 'txt', 'md']).optional().default('doc'),
});

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const POST = async (req: Request) => {
  try {
    const accessToken = getAccessToken(req);
    if (!accessToken) {
      return Response.json({ message: 'Missing Microsoft access token' }, { status: 401 });
    }

    const parsed = createFileSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ message: 'Invalid request body' }, { status: 400 });
    }

    const { content, format } = parsed.data;
    const baseTitle = parsed.data.title?.trim() || `Atlas-${new Date().toISOString().slice(0, 10)}`;
    const extension = format === 'doc' ? 'doc' : format;
    const fileName = `${baseTitle}.${extension}`;

    const payload =
      format === 'doc'
        ? `<!doctype html><html><head><meta charset="utf-8"></head><body><pre style="white-space:pre-wrap;font-family:Calibri,Arial,sans-serif;font-size:12pt;">${escapeHtml(content)}</pre></body></html>`
        : content;

    const created = await createDriveFile({
      accessToken,
      fileName,
      content: payload,
      contentType:
        format === 'doc'
          ? 'text/html; charset=utf-8'
          : 'text/plain; charset=utf-8',
    });

    return Response.json(
      {
        file: {
          id: created.id,
          name: created.name,
          webUrl: created.webUrl,
          links: {
            word: created.webUrl || '',
            onedrive: created.webUrl || '',
          },
        },
      },
      { status: 200 },
    );
  } catch (error: any) {
    const message = String(error?.message || '');
    const unauthorized =
      message.includes('(401)') || message.includes('InvalidAuthenticationToken');
    const missingWriteScope =
      message.includes('AccessDenied') || message.includes('Insufficient privileges');

    return Response.json(
      {
        message: unauthorized
          ? 'Microsoft token is expired or invalid. Reconnect Microsoft in Apps.'
          : missingWriteScope
            ? 'Missing Files.ReadWrite permission. Reconnect Microsoft after adding Files.ReadWrite scope in Azure.'
            : 'Failed to create file',
        error: error?.message || 'Unknown error',
      },
      { status: unauthorized ? 401 : 500 },
    );
  }
};
