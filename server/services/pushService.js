import webpush from 'web-push';

const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL } = process.env;

// Defer VAPID init — only configure if keys are present so missing env vars
// don't crash the server at startup. Pushes simply won't send without them.
let vapidReady = false;
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        VAPID_EMAIL || 'mailto:support@mealme.app',
        VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY
    );
    vapidReady = true;
} else {
    console.warn('[pushService] VAPID keys not set — push notifications disabled.');
}

/**
 * Send a push notification to a single subscription object.
 * Returns true on success, false on gone (410/404 — subscription expired).
 */
export const sendPush = async (subscription, payload) => {
    if (!vapidReady) return false;
    try {
        await webpush.sendNotification(subscription, JSON.stringify(payload));
        return true;
    } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) return false; // subscription gone
        throw err;
    }
};

/**
 * Send to multiple subscriptions. Returns an array of expired endpoints to clean up.
 */
export const sendPushToAll = async (subscriptions, payload) => {
    const expired = [];
    await Promise.allSettled(
        subscriptions.map(async sub => {
            const pushSub = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };
            const ok = await sendPush(pushSub, payload);
            if (!ok) expired.push(sub.endpoint);
        })
    );
    return expired;
};

export const vapidPublicKey = VAPID_PUBLIC_KEY || null;
