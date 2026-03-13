import {
  closeWorkbookSession,
  createDriveFile,
  createDriveFolder,
  createWorkbookSession,
  getDriveItemBuffer,
  getDriveItemContent,
  getDriveItemPreview,
  listDriveItemChildren,
  listDriveRootChildren,
  runGraphBatch,
  updateDriveFileContent,
  updateWorkbookRange,
} from '@/lib/microsoft';
import { extractOfficeText, extractWorkbookText } from '@/lib/officeArtifacts';
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
    const includePreview = searchParams.get('preview') === '1';
    const format = (searchParams.get('format') || 'text').toLowerCase();
    const children = searchParams.get('children') === '1';
    const top = Number(searchParams.get('top') || '25');

    if (fileId && includePreview) {
      const preview = await getDriveItemPreview({
        accessToken,
        itemId: fileId,
        noBrowserNav: true,
      });
      const rawUrl = String(preview?.getUrl || '').trim();
      const embedUrl = rawUrl
        ? rawUrl.includes('nb=true')
          ? rawUrl
          : `${rawUrl}${rawUrl.includes('?') ? '&' : '?'}nb=true`
        : '';
      return Response.json({ fileId, embedUrl, preview }, { status: 200 });
    }

    if (fileId && includeContent) {
      let content = '';
      if (format === 'excel' || format === 'xlsx') {
        const buffer = await getDriveItemBuffer(accessToken, fileId);
        content = extractWorkbookText(buffer);
      } else if (format === 'powerpoint' || format === 'pptx' || format === 'word' || format === 'docx') {
        const buffer = await getDriveItemBuffer(accessToken, fileId);
        content = await extractOfficeText(buffer);
      } else {
        content = await getDriveItemContent(accessToken, fileId);
      }
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
          ? 'Microsoft token is expired or invalid. Reconnect Microsoft in Settings > Connections.'
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

const workbookSessionCreateSchema = z.object({
  action: z.literal('workbook_session_create'),
  id: z.string().min(1),
  persistChanges: z.boolean().optional().default(false),
});

const workbookRangeUpdateSchema = z.object({
  action: z.literal('workbook_range_update'),
  id: z.string().min(1),
  worksheet: z.string().min(1),
  address: z.string().min(1),
  values: z.array(z.array(z.any())).min(1),
  workbookSessionId: z.string().min(1).optional(),
});

const workbookSessionCloseSchema = z.object({
  action: z.literal('workbook_session_close'),
  id: z.string().min(1),
  workbookSessionId: z.string().min(1),
});

const graphBatchSchema = z.object({
  action: z.literal('graph_batch'),
  requests: z
    .array(
      z.object({
        id: z.string().min(1),
        method: z.enum(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']),
        url: z.string().min(1),
        headers: z.record(z.string(), z.string()).optional(),
        body: z.any().optional(),
      }),
    )
    .min(1)
    .max(20),
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
          ? 'Microsoft token is expired or invalid. Reconnect Microsoft in Settings > Connections.'
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

    const body = await req.json();

    const sessionCreate = workbookSessionCreateSchema.safeParse(body);
    if (sessionCreate.success) {
      const session = await createWorkbookSession({
        accessToken,
        itemId: sessionCreate.data.id,
        persistChanges: sessionCreate.data.persistChanges,
      });
      return Response.json({ sessionId: session.id || '' }, { status: 200 });
    }

    const rangeUpdate = workbookRangeUpdateSchema.safeParse(body);
    if (rangeUpdate.success) {
      const range = await updateWorkbookRange({
        accessToken,
        itemId: rangeUpdate.data.id,
        worksheet: rangeUpdate.data.worksheet,
        address: rangeUpdate.data.address,
        values: rangeUpdate.data.values,
        workbookSessionId: rangeUpdate.data.workbookSessionId,
      });
      return Response.json({ range }, { status: 200 });
    }

    const sessionClose = workbookSessionCloseSchema.safeParse(body);
    if (sessionClose.success) {
      await closeWorkbookSession({
        accessToken,
        itemId: sessionClose.data.id,
        workbookSessionId: sessionClose.data.workbookSessionId,
      });
      return Response.json({ ok: true }, { status: 200 });
    }

    const graphBatch = graphBatchSchema.safeParse(body);
    if (graphBatch.success) {
      const batch = await runGraphBatch({
        accessToken,
        requests: graphBatch.data.requests,
      });
      return Response.json({ batch }, { status: 200 });
    }

    const parsed = updateFileSchema.safeParse(body);
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
          ? 'Microsoft token is expired or invalid. Reconnect Microsoft in Settings > Connections.'
          : 'Failed to update file',
        error: error?.message || 'Unknown error',
      },
      { status: unauthorized ? 401 : 500 },
    );
  }
};


