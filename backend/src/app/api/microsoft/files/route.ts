import {
  createDriveFile,
  createDriveFolder,
  getDriveItemContent,
  listDriveItemChildren,
  listDriveRootChildren,
  updateDriveFileContent,
} from '@/lib/microsoft';
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
    const children = searchParams.get('children') === '1';
    const top = Number(searchParams.get('top') || '25');

    if (fileId && includeContent) {
      const content = await getDriveItemContent(accessToken, fileId);
      return Response.json({ fileId, content }, { status: 200 });
    }

    if (fileId && children) {
      const items = await listDriveItemChildren({
        accessToken,
        itemId: fileId,
        top,
      });
      return Response.json({ files: items.value }, { status: 200 });
    }

    const files = await listDriveRootChildren(accessToken, top);
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
  action: z.literal('create_file').optional(),
  title: z.string().min(1).optional(),
  content: z.string().min(1),
  parentId: z.string().min(1).optional(),
  format: z
    .enum(['doc', 'txt', 'md', 'csv', 'ppt_outline'])
    .optional()
    .default('doc'),
});

const createFolderSchema = z.object({
  action: z.literal('create_folder'),
  name: z.string().min(1),
  parentId: z.string().min(1).optional(),
});

const postSchema = z.union([createFileSchema, createFolderSchema]);

const updateFileSchema = z.object({
  id: z.string().min(1),
  content: z.string().min(1),
  format: z.enum(['doc', 'txt', 'md', 'csv', 'ppt_outline']).optional().default('txt'),
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

    const parsed = postSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ message: 'Invalid request body' }, { status: 400 });
    }

    if (parsed.data.action === 'create_folder') {
      const createdFolder = await createDriveFolder({
        accessToken,
        folderName: parsed.data.name,
        parentItemId: parsed.data.parentId,
      });

      return Response.json(
        {
          folder: {
            id: createdFolder.id,
            name: createdFolder.name,
            webUrl: createdFolder.webUrl,
          },
        },
        { status: 200 },
      );
    }

    const { content, format } = parsed.data;
    const baseTitle = parsed.data.title?.trim() || `Atlas-${new Date().toISOString().slice(0, 10)}`;
    const extension =
      format === 'ppt_outline'
        ? 'md'
        : format;
    const fileName = `${baseTitle}.${extension}`;

    const payload =
      format === 'doc'
        ? `<!doctype html><html><head><meta charset="utf-8"></head><body><pre style="white-space:pre-wrap;font-family:Calibri,Arial,sans-serif;font-size:12pt;">${escapeHtml(content)}</pre></body></html>`
        : format === 'csv'
          ? content
          : format === 'ppt_outline'
            ? `# ${baseTitle}\n\n${content}`
            : content;

    const created = await createDriveFile({
      accessToken,
      fileName,
      parentItemId: parsed.data.parentId,
      content: payload,
      contentType:
        format === 'doc'
          ? 'text/html; charset=utf-8'
          : format === 'csv'
            ? 'text/csv; charset=utf-8'
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
            excel: created.webUrl || '',
            powerpoint: created.webUrl || '',
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

export const PATCH = async (req: Request) => {
  try {
    const accessToken = getAccessToken(req);
    if (!accessToken) {
      return Response.json({ message: 'Missing Microsoft access token' }, { status: 401 });
    }

    const parsed = updateFileSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ message: 'Invalid request body' }, { status: 400 });
    }

    const format = parsed.data.format;
    const payload =
      format === 'doc'
        ? `<!doctype html><html><head><meta charset="utf-8"></head><body><pre style="white-space:pre-wrap;font-family:Calibri,Arial,sans-serif;font-size:12pt;">${escapeHtml(parsed.data.content)}</pre></body></html>`
        : format === 'ppt_outline'
          ? `# Updated Deck Outline\n\n${parsed.data.content}`
          : parsed.data.content;

    const updated = await updateDriveFileContent({
      accessToken,
      itemId: parsed.data.id,
      content: payload,
      contentType:
        format === 'doc'
          ? 'text/html; charset=utf-8'
          : format === 'csv'
            ? 'text/csv; charset=utf-8'
            : 'text/plain; charset=utf-8',
    });

    return Response.json(
      {
        file: {
          id: updated.id,
          name: updated.name,
          webUrl: updated.webUrl,
          links: {
            onedrive: updated.webUrl || '',
            word: updated.webUrl || '',
            excel: updated.webUrl || '',
            powerpoint: updated.webUrl || '',
          },
        },
      },
      { status: 200 },
    );
  } catch (error: any) {
    const message = String(error?.message || '');
    const unauthorized =
      message.includes('(401)') || message.includes('InvalidAuthenticationToken');

    return Response.json(
      {
        message: unauthorized
          ? 'Microsoft token is expired or invalid. Reconnect Microsoft in Apps.'
          : 'Failed to update file',
        error: error?.message || 'Unknown error',
      },
      { status: unauthorized ? 401 : 500 },
    );
  }
};
