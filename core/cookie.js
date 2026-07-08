const REQUIRED = ["ltoken_v2", "ltuid_v2", "ltmid_v2"];
const REDEEM = ["cookie_token_v2", "account_mid_v2", "account_id_v2"];

const parseCookie = (raw) => {
	const map = Object.fromEntries(
		String(raw ?? "")
			.split(";")
			.map((part) => part.trim())
			.filter(Boolean)
			.map((part) => {
				const eq = part.indexOf("=");
				return eq === -1 ? [part, ""] : [part.slice(0, eq), part.slice(eq + 1)];
			})
	);

	for (const key of REQUIRED) {
		if (!map[key]) {
			throw new Error(`Cookie is missing required key: ${key}`);
		}
	}

	const codeRedeem = REDEEM.every((key) => Boolean(map[key]));
	const keys = codeRedeem ? [...REQUIRED, ...REDEEM] : REQUIRED;
	const cookie = keys.map((key) => `${key}=${map[key]}`).join("; ");

	return { cookie, ltuid: map.ltuid_v2, codeRedeem };
};

module.exports = { parseCookie };
