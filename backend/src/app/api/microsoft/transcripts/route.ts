import { createActivityItem } from '@/lib/activity';
import {
  getCallRecord,
  getCallRecordSessions,
  mergeTranscriptText,
  normalizeTranscriptSegments,
} from '@/lib/microsoft';
import { defaultRouterModelConfig } from '@/lib/router';
import { summarizeText } from '@/lib/summaries';
import { assertUsageWithinPlan, recordAIUsage } from '@/lib/usage';
import { z } from 'zod';

export const runtime = 'nodejs';

const bodySchema = z.object({
  callRecordId: z.string().min(1),
  userId: z.string().uuid().optional(),
  title: z.string().optional(),
  model: z.string().optional(),
});

const getAccessToken = (req: Request) =>
  req.headers.get('x-microsoft-access-token') ||
  req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

export const POST = async (req: Request) => {
  try {
    const accessToken = getAccessToken(req);
    if (!accessToken) {
      return Response.json({ message: 'Missing Microsoft access token' }, { status: 401 });
    }

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ message: 'Invalid request body' }, { status: 400 });
    }

    const { callRecordId, userId } = parsed.data;

    const usage = await assertUsageWithinPlan(userId);
    if (!usage.allowed) {
      return Response.json(
        {
          message: `Monthly AI action limit reached for ${usage.tier} plan`,
          used: usage.used,
          limit: usage.limit,
        },
        { status: 402 },
      );
    }

    const [record, sessionsResponse] = await Promise.all([
      getCallRecord(accessToken, callRecordId),
      getCallRecordSessions(accessToken, callRecordId),
    ]);

    const sessions = sessionsResponse.value || [];
    const segments = normalizeTranscriptSegments(sessions);
    const transcript = mergeTranscriptText(segments);

    if (!transcript.trim()) {
      return Response.json({ message: 'No transcript content found for this call record' }, { status: 404 });
    }

    const model = parsed.data.model || defaultRouterModelConfig.midModel;
    const summary = await summarizeText({
      content: transcript,
      context: 'a Teams meeting transcript',
      model,
    });

    const title =
      parsed.data.title ||
      record?.organizer?.user?.displayName ||
      record?.subject ||
      `Meeting ${callRecordId}`;

    await Promise.all([
      createActivityItem({
        userId,
        type: 'meeting',
        sourceId: callRecordId,
        title,
        summary,
        modelUsed: model,
        links: {
          teams: record?.joinWebUrl || '',
        },
      }),
      recordAIUsage({
        userId,
        actionType: 'summary',
        modelUsed: model,
      }),
    ]);

    return Response.json(
      {
        callRecordId,
        title,
        summary,
        segments: segments.length,
      },
      { status: 200 },
    );
  } catch (error: any) {
    const message = String(error?.message || '');
    const callRecordsPermissionError =
      message.includes('CallRecords.Read') || message.includes('Authorization_RequestDenied');

    return Response.json(
      {
        message: callRecordsPermissionError
          ? 'Transcript sync via call records requires Microsoft Graph application permissions (app-only) and admin consent.'
          : 'Transcript pipeline failed',
        error: error?.message || 'Unknown error',
      },
      { status: 500 },
    );
  }
};
