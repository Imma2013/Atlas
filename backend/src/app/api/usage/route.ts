import { getMonthlyUsageCount, getUserPlanTier } from '@/lib/usage';

export const runtime = 'nodejs';

export const GET = async (req: Request) => {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || req.headers.get('x-user-id');

    if (!userId) {
      return Response.json({ message: 'Missing userId' }, { status: 400 });
    }

    const [tier, used] = await Promise.all([getUserPlanTier(userId), getMonthlyUsageCount(userId)]);

    return Response.json({ tier, used }, { status: 200 });
  } catch (error: any) {
    return Response.json(
      { message: 'Failed to fetch usage', error: error?.message || 'Unknown error' },
      { status: 500 },
    );
  }
};