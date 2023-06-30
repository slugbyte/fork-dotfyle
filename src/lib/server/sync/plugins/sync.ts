import { fetchGitCommits, fetchGithubRepositoryByName, fetchReadme } from '$lib/server/github/api';
import { upsertBreakingChange } from '$lib/server/prisma/breakingChanges/service';
import type { NeovimPluginWithCount } from '$lib/server/prisma/neovimplugins/schema';
import { getPlugin, updatePlugin } from '$lib/server/prisma/neovimplugins/service';
import { getGithubToken } from '$lib/server/prisma/users/service';
import { hasBeenOneDay, oneWeekAgo } from '$lib/utils';
import type { NeovimPlugin } from '@prisma/client';
import { TRPCError } from '@trpc/server';

export class PluginSyncer {
	plugin: NeovimPlugin;
	configCount: number;
	constructor(private token: string, { configCount, ...plugin }: NeovimPluginWithCount) {
		this.plugin = plugin;
		this.configCount = configCount;
	}
	async sync() {
		await Promise.all([this.syncStars(), this.syncReadme(), this.syncBreakingChanges()]);
		return this.updatePlugin();
	}

	async syncBreakingChanges() {
		const commits = await fetchGitCommits(
			this.token,
			this.plugin.lastSyncedAt ?? oneWeekAgo(),
			this.plugin.owner,
			this.plugin.name
		);
		const regex_1 = /\w+!:/;
		const breakingChangesTasks: Promise<void>[] = [];
		for (const commit of commits) {
			const firstCommitLine = commit.commit.message.split('\n')[0];
			if (regex_1.test(firstCommitLine)) {
				breakingChangesTasks.push(
					upsertBreakingChange(this.plugin.id, commit.sha, commit.html_url, commit.commit.message)
				);
			}
		}
	}

	async syncStars() {
		const repo = await fetchGithubRepositoryByName(this.token, this.plugin.owner, this.plugin.name);
		this.plugin.stars = repo.stargazers_count;
		this.plugin.shortDescription = repo.description ?? this.plugin.shortDescription;
	}

	async syncReadme() {
		let readme = await fetchReadme(this.token, this.plugin.owner, this.plugin.name);

		const invalidGithubLinksRegex =
			/https:\/\/github.com\/[a-zA-Z0-9/]+\/blob\/[a-zA-Z0-9/._]+.(png|jpg|jpeg|mp4|webp)/g;

		const invalidGithubLinkMatches = readme.matchAll(invalidGithubLinksRegex);

		for (const invalidGithubLinkMatch of invalidGithubLinkMatches) {
			const invalidGithubLink = invalidGithubLinkMatch[0];
			const validGithubLink = invalidGithubLink .replace('github.com', 'raw.githubusercontent.com')
				.replace('/blob', '');
			readme = readme.replaceAll(invalidGithubLink, validGithubLink);
		}

		const validGithubLinkRegex =
			/https:\/\/(raw|user-images).githubusercontent.com\/[a-zA-Z0-9/]+\/[a-zA-Z0-9/\-._]+.(png|jpg|jpeg|mp4|gif)/g;

		const validGithubLinkMatches = readme.matchAll(validGithubLinkRegex);

		for (const validGithubLinkMatch of validGithubLinkMatches) {
			const media = validGithubLinkMatch[0];
			console.log({ media });
		}

    const githubAssetRegex = new RegExp(`https://github.com/${this.plugin.owner}/${this.plugin.name}/assets/[0-9]+/[a-zA-Z0-9-]+`, 'g')

    for (const validAssetUrlMatches of readme.matchAll(githubAssetRegex)) {
			const asset = validAssetUrlMatches[0];
			console.log({ asset });
    }

		this.plugin.readme = readme;
	}

	async updatePlugin() {
		this.plugin.lastSyncedAt = new Date();
		await updatePlugin(this.plugin);
		return {
			configCount: this.configCount,
			...this.plugin
		};
	}
}

export async function getPluginSyncer(
	userId: number,
	owner: string,
	name: string
): Promise<PluginSyncer> {
	const token = await getGithubToken(userId);
	const plugin = await getPlugin(owner, name);
	if (plugin.lastSyncedAt && !hasBeenOneDay(plugin.lastSyncedAt.toString())) {
		throw new TRPCError({ code: 'FORBIDDEN' });
	}
	return new PluginSyncer(token, plugin);
}
