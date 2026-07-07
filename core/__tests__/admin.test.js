const { test } = require("node:test");
const assert = require("node:assert/strict");
const { PermissionFlagsBits } = require("discord.js");

const { requireGuildAdmin } = require("../admin.js");

const fakeInteraction = ({ inGuild, admin }) => {
	const replies = [];
	return {
		replies,
		inGuild: () => inGuild,
		memberPermissions: { has: (flag) => flag === PermissionFlagsBits.Administrator && admin },
		reply: async (payload) => replies.push(payload)
	};
};

test("denies outside guilds", async () => {
	const interaction = fakeInteraction({ inGuild: false, admin: true });
	assert.equal(await requireGuildAdmin(interaction), false);
	assert.match(interaction.replies[0].content, /server/i);
});

test("denies non-admins", async () => {
	const interaction = fakeInteraction({ inGuild: true, admin: false });
	assert.equal(await requireGuildAdmin(interaction), false);
	assert.match(interaction.replies[0].content, /administrator/i);
});

test("allows guild admins without replying", async () => {
	const interaction = fakeInteraction({ inGuild: true, admin: true });
	assert.equal(await requireGuildAdmin(interaction), true);
	assert.equal(interaction.replies.length, 0);
});
