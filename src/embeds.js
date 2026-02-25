const { EmbedBuilder } = require('discord.js');

const COLORS = {
  push:           0x4078c0, // GitHub blue
  pr_opened:      0x2cbe4e, // GitHub green
  pr_merged:      0x6f42c1, // GitHub purple
  pr_closed:      0xcb2431, // GitHub red
  pr_reopened:    0x2cbe4e,
  issue_opened:   0xe4a13f, // GitHub orange
  issue_closed:   0xcb2431,
  issue_reopened: 0x2cbe4e,
  release:        0x0075ca, // GitHub dark blue
};

const GITHUB_ICON =
  'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png';

function truncate(str, maxLength = 100) {
  if (!str) return '';
  return str.length > maxLength ? `${str.slice(0, maxLength)}…` : str;
}

function commitLink(sha, url) {
  return `[\`${sha.slice(0, 7)}\`](${url})`;
}

function buildPushEmbed(payload) {
  const { repository, pusher, commits, ref, compare, head_commit } = payload;
  const branch = ref.replace('refs/heads/', '');
  const repoName = repository.full_name;

  const shown = commits.slice(0, 10);
  const commitLines = shown
    .map((c) => {
      const link = commitLink(c.id, c.url);
      const msg = truncate(c.message.split('\n')[0], 72);
      return `${link} ${msg} — **${c.author.name}**`;
    })
    .join('\n');

  const overflow =
    commits.length > 10
      ? `\n*…and ${commits.length - 10} more commit${commits.length - 10 !== 1 ? 's' : ''}.*`
      : '';

  return new EmbedBuilder()
    .setColor(COLORS.push)
    .setAuthor({
      name: pusher.name,
      iconURL: `https://github.com/${pusher.name}.png?size=32`,
      url: `https://github.com/${pusher.name}`,
    })
    .setTitle(
      `[${repoName}:${branch}] ${commits.length} new commit${commits.length !== 1 ? 's' : ''}`,
    )
    .setURL(compare)
    .setDescription(`${commitLines}${overflow}`)
    .setTimestamp(head_commit ? new Date(head_commit.timestamp) : new Date())
    .setFooter({ text: 'GitHub', iconURL: GITHUB_ICON });
}

const PR_IGNORED_ACTIONS = new Set([
  'synchronize',
  'ready_for_review',
  'review_requested',
  'review_request_removed',
  'labeled',
  'unlabeled',
  'assigned',
  'unassigned',
]);

function buildPullRequestEmbed(payload) {
  const { action, pull_request: pr, repository } = payload;
  if (PR_IGNORED_ACTIONS.has(action)) return null;

  const repoName = repository.full_name;
  const isMerged = action === 'closed' && pr.merged;
  const displayAction = isMerged ? 'merged' : action;

  let color;
  if (isMerged) color = COLORS.pr_merged;
  else if (action === 'closed') color = COLORS.pr_closed;
  else if (action === 'reopened') color = COLORS.pr_reopened;
  else color = COLORS.pr_opened;

  return new EmbedBuilder()
    .setColor(color)
    .setAuthor({
      name: pr.user.login,
      iconURL: pr.user.avatar_url,
      url: pr.user.html_url,
    })
    .setTitle(`[${repoName}] PR ${displayAction}: #${pr.number} — ${pr.title}`)
    .setURL(pr.html_url)
    .setDescription(truncate(pr.body, 350) || '*No description provided.*')
    .addFields(
      {
        name: 'Branch',
        value: `\`${pr.head.ref}\` → \`${pr.base.ref}\``,
        inline: true,
      },
      {
        name: 'Commits',
        value: String(pr.commits ?? '—'),
        inline: true,
      },
      {
        name: 'Changes',
        value: pr.additions != null ? `+${pr.additions} / -${pr.deletions}` : '—',
        inline: true,
      },
    )
    .setTimestamp(new Date(pr.updated_at))
    .setFooter({ text: 'GitHub', iconURL: GITHUB_ICON });
}

const ISSUE_IGNORED_ACTIONS = new Set([
  'edited',
  'labeled',
  'unlabeled',
  'assigned',
  'unassigned',
  'milestoned',
  'demilestoned',
  'pinned',
  'unpinned',
]);

function buildIssueEmbed(payload) {
  const { action, issue, repository } = payload;
  if (ISSUE_IGNORED_ACTIONS.has(action)) return null;

  const repoName = repository.full_name;
  let color;
  if (action === 'opened') color = COLORS.issue_opened;
  else if (action === 'reopened') color = COLORS.issue_reopened;
  else color = COLORS.issue_closed;

  const labels =
    issue.labels?.map((l) => `\`${l.name}\``).join(', ') || 'None';

  return new EmbedBuilder()
    .setColor(color)
    .setAuthor({
      name: issue.user.login,
      iconURL: issue.user.avatar_url,
      url: issue.user.html_url,
    })
    .setTitle(`[${repoName}] Issue ${action}: #${issue.number} — ${issue.title}`)
    .setURL(issue.html_url)
    .setDescription(truncate(issue.body, 350) || '*No description provided.*')
    .addFields({ name: 'Labels', value: labels, inline: false })
    .setTimestamp(new Date(issue.updated_at))
    .setFooter({ text: 'GitHub', iconURL: GITHUB_ICON });
}

function buildReleaseEmbed(payload) {
  const { action, release, repository } = payload;
  if (action !== 'published') return null;

  const repoName = repository.full_name;

  return new EmbedBuilder()
    .setColor(COLORS.release)
    .setAuthor({
      name: release.author.login,
      iconURL: release.author.avatar_url,
      url: release.author.html_url,
    })
    .setTitle(`[${repoName}] New Release: ${release.name || release.tag_name}`)
    .setURL(release.html_url)
    .setDescription(truncate(release.body, 450) || '*No release notes provided.*')
    .addFields(
      { name: 'Tag', value: release.tag_name, inline: true },
      { name: 'Pre-release', value: release.prerelease ? 'Yes' : 'No', inline: true },
    )
    .setTimestamp(new Date(release.published_at))
    .setFooter({ text: 'GitHub', iconURL: GITHUB_ICON });
}

module.exports = {
  buildPushEmbed,
  buildPullRequestEmbed,
  buildIssueEmbed,
  buildReleaseEmbed,
};
