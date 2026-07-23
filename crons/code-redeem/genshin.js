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
		url: "https://sg-hk4e-api.hoyoverse.com/common/apicdkey/api/webExchangeCdkey",
		searchParams: {
			uid: accountData.uid,
			region: accountData.region,
			lang: "en",
			cdkey: code.code,
			game_biz: "hk4e_global",
			sLangKey: "en-us"
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
	if (retcode !== 0) {
		app.Logger.info(
			`CodeRedeem:Genshin:${accountData.uid}`,
			`${code.code} - ${res.body.message}`
		);

		return {
			success: false,
			reason: res.body.message,
			retcode
		};
	}

	app.Logger.info(`CodeRedeem:Genshin:${accountData.uid}`, `${code.code} - Redeemed`);
	return {
		success: true,
		retcode
	};
};

module.exports = {
	redeemCodes
};
