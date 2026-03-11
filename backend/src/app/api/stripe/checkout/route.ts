export const runtime = 'nodejs';

export const POST = async () =>
  Response.json(
    { message: 'Stripe checkout is disabled in this Atlas build.' },
    { status: 410 },
  );
