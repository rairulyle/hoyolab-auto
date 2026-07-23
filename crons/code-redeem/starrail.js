const redeemCodes = async (accountData, code) => {
	const Cookie = app.HoyoLab.parseCookie(accountData.cookie, {
		whitelist: [
			"cookie_token_v2",
			"account_mid_v2",
			"account_id_v2",
			"cookie_token",
			"account_id"
		]
	});

	const res = await app.Got("HoYoLab", {
		url: "https://sg-hkrpg-api.hoyoverse.com/common/apicdkey/api/webExchangeCdkeyRisk",
		method: "POST",
		searchParams: {
			uid: accountData.uid,
			region: accountData.region,
			lang: "en",
			cdkey: code.code,
			game_biz: "hkrpg_global",
			t: app.Date.now()
		},
		headers: { Cookie }
	});

	if (res.statusCode !== 200) {
		throw new app.Error({
			message: "API returned non-200 status code",
			args: {
				statusCode: res.statusCode,
				body: res.body
			}
		});
	}

	const retcode = res.body.retcode;
	if (retcode === -2001 || retcode === -2003) {
		app.Logger.log(`CodeRedeem:StarRail:${accountData.uid}`, {
			code: code.code,
			message: "Expired or invalid code"
		});

		return {
			success: false,
			reason: "Expired or invalid code"
		};
	}

	if (retcode !== 0) {
		app.Logger.info(
			`CodeRedeem:StarRail:${accountData.uid}`,
			`${code.code} - ${res.body.message}`
		);
		return {
			success: false,
			reason: res.body.message
		};
	}

	app.Logger.info(`CodeRedeem:StarRail:${accountData.uid}`, `${code.code} - Redeemed`);
	return {
		success: true
	};
};

module.exports = {
	redeemCodes
};
