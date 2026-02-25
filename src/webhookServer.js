const express = require('express');
const crypto = require('crypto');
const {
  buildPushEmbed,
  buildPullRequestEmbed,
  buildIssueEmbed,
  buildReleaseEmbed,
} = require('./embeds');

function verifySignature(rawBody, secret, signatureHeader) {
  if (!secret) return true;
  if (!signatureHeader) return false;

  const hmac = crypto.createHmac('sha256', secret);
  const expected = 'sha256=' + hmac.update(rawBody).digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected),
    );
  } catch {
    return false;
  }
}

function createWebhookServer(discordClient) {
  const app = express();

  app.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.get('/health', (_req, res) => res.status(200).send('OK'));

  app.post('/webhook', async (req, res) => {
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    const signature = req.headers['x-hub-signature-256'];

    if (!verifySignature(req.rawBody, secret, signature)) {
      console.warn('[Webhook] Rejected: invalid or missing signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = req.headers['x-github-event'];
    const payload = req.body;

    if (!event || !payload) {
      return res.status(400).json({ error: 'Missing event or payload' });
    }

    res.status(200).json({ ok: true });

    if (event === 'ping') {
      console.log(`[Webhook] Ping received from repo "${payload.repository?.full_name}"`);
      return;
    }

    const channelId = process.env.DISCORD_CHANNEL_ID;
    if (!channelId) {
      console.error('[Webhook] DISCORD_CHANNEL_ID is not set — cannot send message.');
      return;
    }

    let channel;
    try {
      channel = await discordClient.channels.fetch(channelId);
    } catch (err) {
      console.error(`[Webhook] Could not fetch channel ${channelId}:`, err.message);
      return;
    }

    if (!channel?.isTextBased()) {
      console.error(`[Webhook] Channel ${channelId} is not a text-based channel.`);
      return;
    }

    let embed = null;
    try {
      switch (event) {
        case 'push':
          if (payload.commits?.length > 0) {
            embed = buildPushEmbed(payload);
          }
          break;
        case 'pull_request':
          embed = buildPullRequestEmbed(payload);
          break;
        case 'issues':
          embed = buildIssueEmbed(payload);
          break;
        case 'release':
          embed = buildReleaseEmbed(payload);
          break;
        default:
          console.log(`[Webhook] Unhandled event type: "${event}"`);
      }
    } catch (err) {
      console.error(`[Webhook] Failed to build embed for event "${event}":`, err.message);
      return;
    }

    if (embed) {
      try {
        const roleId = process.env.DISCORD_PING_ROLE_ID;
        const content = roleId ? `<@&${roleId}>` : undefined;
        await channel.send({ content, embeds: [embed] });
        console.log(`[Webhook] Sent embed for event: ${event}`);
      } catch (err) {
        console.error('[Webhook] Failed to send embed:', err.message);
      }
    }
  });

  return app;
}

module.exports = { createWebhookServer };
