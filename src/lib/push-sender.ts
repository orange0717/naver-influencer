/**
 * 서버사이드 푸시 알림 발송 (Firebase Admin SDK)
 *
 * 환경변수 필요:
 * - FIREBASE_PROJECT_ID
 * - FIREBASE_CLIENT_EMAIL
 * - FIREBASE_PRIVATE_KEY
 */

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

interface SendResult {
  successCount: number;
  failedTokens: string[];
}

/** Firebase Admin 동적 import (서버사이드 전용) */
async function getMessaging() {
  const admin = (await import('firebase-admin')).default;

  if (!admin.apps.length) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error('Firebase 환경변수 미설정');
    }

    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
  }

  return admin.messaging();
}

/** 다중 기기에 푸시 발송 */
export async function sendPushToMultipleDevices(
  tokens: string[],
  payload: PushPayload,
): Promise<SendResult> {
  if (tokens.length === 0) return { successCount: 0, failedTokens: [] };

  const messaging = await getMessaging();

  const response = await messaging.sendEachForMulticast({
    tokens,
    notification: {
      title: payload.title,
      body: payload.body,
    },
    data: payload.data || {},
    apns: {
      payload: { aps: { badge: 1, sound: 'default' } },
    },
    android: {
      priority: 'high',
      notification: { sound: 'default', channelId: 'rank_changes' },
    },
  });

  const failedTokens: string[] = [];
  response.responses.forEach((resp, idx) => {
    if (!resp.success) {
      failedTokens.push(tokens[idx]);
    }
  });

  return { successCount: response.successCount, failedTokens };
}
