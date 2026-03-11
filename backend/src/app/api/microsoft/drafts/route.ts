import { createEmailDraft } from '@/lib/microsoft';
import { z } from 'zod';

export const runtime = 'nodejs';

const getAccessToken = (req: Request) =>
  req.headers.get('x-microsoft-access-token') ||
  req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

const draftSchema = z.object({
  to: z.array(z.string().email()).min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
  contentType: z.enum(['Text', 'HTML']).optional().default('Text'),
});

export const POST = async (req: Request) => {
  try {
    const accessToken = getAccessToken(req);
    if (!accessToken) {
      return Response.json({ message: 'Missing Microsoft access token' }, { status: 401 });
    }

    const parsed = draftSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ message: 'Invalid request body' }, { status: 400 });
    }

    const draft = await createEmailDraft({
      accessToken,
      to: parsed.data.to,
      subject: parsed.data.subject,
      body: parsed.data.body,
      contentType: parsed.data.contentType,
    });

    return Response.json(
      {
        draft: {
          id: draft.id,
          subject: draft.subject,
          webLink: draft.webLink || '',
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
          : 'Failed to create email draft',
        error: error?.message || 'Unknown error',
      },
      { status: unauthorized ? 401 : 500 },
    );
  }
};

