const parseGuildAllowlist = (raw) =>
	new Set(
		(raw ?? "")
			.split(",")
			.map((id) => id.trim())
			.filter(Boolean)
	);

const currentAllowlist = () => parseGuildAllowlist(process.env.GUILD_IDS);

const isGuildAllowed = (guildId) => {
	const allowlist = currentAllowlist();
	return allowlist.size === 0 || allowlist.has(String(guildId));
};

const isRestricted = () => currentAllowlist().size > 0;

module.exports = { parseGuildAllowlist, isGuildAllowed, isRestricted };
