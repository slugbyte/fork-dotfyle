<script lang="ts">
	import { page } from '$app/stores';
	const links = [
		{ label: 'Discover', url: '/neovim/plugins/trending' },
		{ label: 'Colorschemes', url: '/neovim/colorscheme/trending' },
		{ label: 'Configurations', url: '/neovim/configurations/top' }
	];

	function isOnCurrentUrl(relativeUrl: string) {
		const paths = relativeUrl.split('/');
		paths.pop();
		const pathWithoutSort = paths.join('/');
		return $page.url.pathname.startsWith(pathWithoutSort);
	}
</script>

<div class="flex gap-2 text-sm">
	{#each links as link}
		<a
			href={link.url}
			class="{isOnCurrentUrl(link.url)
				? 'bg-white text-black'
				: 'bg-black/30 border-[1px] border-accent-muted hover:bg-white text-white hover:text-black'} p-2 px-4 rounded-lg font-semibold"
		>
			{link.label}
		</a>
	{/each}
</div>
