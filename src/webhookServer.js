const express = require('express');
const crypto = require('crypto');
const { ChannelType } = require('discord.js');
const {
  buildPushEmbed,
  buildPullRequestEmbed,
  buildIssueEmbed,
  buildReleaseEmbed,
  buildStarEmbed,
} = require('./embeds');

function verifySignature(rawBody, secret, signatureHeader) {
  if (!secret) return true;
  if (!signatureHeader) return false;
  if (!rawBody) return false;

  const signatureValue = Array.isArray(signatureHeader)
    ? signatureHeader[0]
    : signatureHeader;

  const hmac = crypto.createHmac('sha256', secret);
  const expected = 'sha256=' + hmac.update(rawBody).digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureValue),
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
      limit: '2mb',
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.get('/health', (_req, res) => res.status(200).send('OK'));

  app.post('/webhook', async (req, res) => {
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    const signature = req.headers['x-hub-signature-256'];
    const deliveryId = req.headers['x-github-delivery'] || 'unknown-delivery';
    const event = req.headers['x-github-event'];
    const payload = req.body;

    console.log(
      `[Webhook] Delivery ${deliveryId}: event="${event || 'unknown'}" repo="${payload?.repository?.full_name || 'unknown'}"`,
    );

    if (!verifySignature(req.rawBody, secret, signature)) {
      console.warn(`[Webhook] Delivery ${deliveryId} rejected: invalid or missing signature`);
      return res.status(401).json({ error: 'Invalid signature' });
    }

    if (!event || !payload) {
      console.warn(`[Webhook] Delivery ${deliveryId} rejected: missing event or payload`);
      return res.status(400).json({ error: 'Missing event or payload' });
    }

    res.status(200).json({ ok: true });

    if (event === 'ping') {
      console.log(`[Webhook] Delivery ${deliveryId}: ping received from repo "${payload.repository?.full_name}"`);
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
          embed = buildPushEmbed(payload);
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
        case 'star':
          embed = buildStarEmbed(payload);
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
        const content = roleId && event !== 'star' ? `<@&${roleId}>` : undefined;
        const message = await channel.send({ content, embeds: [embed] });
        if (channel.type === ChannelType.GuildAnnouncement) {
          await message.crosspost();
        }
        console.log(`[Webhook] Delivery ${deliveryId}: sent embed for event "${event}"`);
      } catch (err) {
        console.error(`[Webhook] Delivery ${deliveryId}: failed to send embed:`, err.message);
      }
    } else {
      console.log(`[Webhook] Delivery ${deliveryId}: no embed generated for event "${event}"`);
    }
  });

  app.use((err, _req, res, _next) => {
    if (err?.type === 'entity.too.large') {
      console.warn('[Webhook] Rejected: payload too large for JSON parser');
      return res.status(413).json({ error: 'Payload too large' });
    }

    if (err instanceof SyntaxError && 'body' in err) {
      console.warn('[Webhook] Rejected: invalid JSON payload');
      return res.status(400).json({ error: 'Invalid JSON' });
    }

    console.error('[Webhook] Unexpected server error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createWebhookServer };
