export const GET = async (
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;
  return Response.json(
    {
      message:
        'Legacy chat details are disabled. Use /chat with the new workspace-first brain flow.',
      chat: { id },
      messages: [],
    },
    { status: 200 },
  );
};

export const DELETE = async (
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  return Response.json(
    {
      message: 'Legacy chat deletion is disabled.',
    },
    { status: 200 },
  );
};
