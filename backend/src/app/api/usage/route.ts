import { getUsageSnapshot } from '@/lib/usage';

export const runtime = 'nodejs';

export const GET = async (req: Request) => {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || req.headers.get('x-user-id');

    if (!userId) {
      return Response.json({ message: 'Missing userId' }, { status: 400 });
    }

    const usage = await getUsageSnapshot(userId);
    return Response.json(usage, { status: 200 });
  } catch (error: any) {
    return Response.json(
      { message: 'Failed to fetch usage', error: error?.message || 'Unknown error' },
      { status: 500 },
    );
  }
};
