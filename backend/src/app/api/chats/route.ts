export const GET = async (req: Request) => {
  return Response.json(
    {
      message:
        'Legacy chat history is disabled. Use /chat with the new workspace-first brain flow.',
      chats: [],
    },
    { status: 200 },
  );
};
