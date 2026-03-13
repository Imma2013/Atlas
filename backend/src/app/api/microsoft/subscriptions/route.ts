import { createGraphSubscription } from '@/lib/microsoft';
import { z } from 'zod';

export const runtime = 'nodejs';

const getAccessToken = (req: Request) =>
  req.headers.get('x-microsoft-access-token') ||
  req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

const createSubscriptionSchema = z.object({
  resource: z.string().min(1),
  notificationUrl: z.string().url(),
  changeType: z
    .enum(['created', 'updated', 'deleted', 'created,updated', 'updated,deleted', 'created,updated,deleted'])
    .optional()
    .default('created,updated'),
  expirationDateTime: z.string().datetime().optional(),
  clientState: z.string().min(1).optional(),
});

const defaultExpiryIso = () => {
  const expires = new Date(Date.now() + 45 * 60 * 1000);
  return expires.toISOString();
};

export const POST = async (req: Request) => {
  try {
    const accessToken = getAccessToken(req);
    if (!accessToken) {
      return Response.json({ message: 'Missing Microsoft access token' }, { status: 401 });
    }

    const parsed = createSubscriptionSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ message: 'Invalid request body' }, { status: 400 });
    }

    const subscription = await createGraphSubscription({
      accessToken,
      resource: parsed.data.resource,
      notificationUrl: parsed.data.notificationUrl,
      changeType: parsed.data.changeType,
      expirationDateTime: parsed.data.expirationDateTime || defaultExpiryIso(),
      clientState: parsed.data.clientState,
    });

    return Response.json({ subscription }, { status: 200 });
  } catch (error: any) {
    const message = String(error?.message || '');
    const unauthorized =
      message.includes('(401)') || message.includes('InvalidAuthenticationToken');

    return Response.json(
      {
        message: unauthorized
          ? 'Microsoft token is expired or invalid. Reconnect Microsoft in Settings > Connections.'
          : 'Failed to create Microsoft Graph subscription',
        error: error?.message || 'Unknown error',
      },
      { status: unauthorized ? 401 : 500 },
    );
  }
};
