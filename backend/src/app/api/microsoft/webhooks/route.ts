export const runtime = 'nodejs';

export const GET = async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const validationToken = searchParams.get('validationToken');
  if (!validationToken) {
    return new Response('Missing validationToken', { status: 400 });
  }
  return new Response(validationToken, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain',
    },
  });
};

export const POST = async (req: Request) => {
  const payload = await req.json().catch(() => ({}));

  // Keep this endpoint lightweight and process notifications asynchronously.
  return Response.json(
    {
      ok: true,
      received: Array.isArray(payload?.value) ? payload.value.length : 0,
    },
    { status: 202 },
  );
};
