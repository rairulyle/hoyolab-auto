const AUTH = new Set([-100, -1071, -10001, 10001, 10102]);

const classifyRedeem = (retcode) => {
	if (retcode === 0) {
		return "ok";
	}
	if (AUTH.has(retcode)) {
		return "auth";
	}
	switch (retcode) {
		case -2017:
			return "already";
		case -2003:
			return "invalid";
		case -2001:
			return "expired";
		case -2016:
			return "cooldown";
		default:
			return "error";
	}
};

module.exports = { classifyRedeem };
