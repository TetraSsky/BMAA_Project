const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
const { createWebhookServer } = require('./webhookServer');

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('[Bot] DISCORD_TOKEN is not set. Exiting.');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once('ready', () => {
  console.log(`[Bot] Logged in as ${client.user.tag}`);
  client.user.setActivity('TetraSsky/TetraSkyBlenderStuff', { type: ActivityType.Playing });

  const PORT = parseInt(process.env.PORT || '8080', 10);
  const app = createWebhookServer(client);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Webhook] HTTP server listening on port ${PORT}`);
  });
});

client.on('error', (err) => {
  console.error('[Bot] Discord client error:', err.message);
});

client.login(token).catch((err) => {
  console.error('[Bot] Failed to login:', err.message);
  process.exit(1);
});
