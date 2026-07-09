const groupCheckInResults = (results, errors) => {
	const groups = new Map();
	const ensure = (key, name, assets) => {
		if (!groups.has(key)) {
			groups.set(key, { name, assets, rows: [] });
		}
		return groups.get(key);
	};

	for (const r of results) {
		const group = ensure(r.platform, r.assets?.game ?? r.platform, r.assets ?? null);
		const signed = /already/i.test(r.result ?? "");
		group.rows.push({
			level: signed ? "info" : "ok",
			ign: r.username ?? r.uid,
			text: signed
				? `already claimed · Day ${r.total}`
				: `${r.award.name} ×${r.award.count} · Day ${r.total}`
		});
	}

	for (const e of errors) {
		const group = ensure(e.game, e.name ?? e.game, e.assets ?? null);
		group.rows.push({ level: "alert", ign: e.name ?? e.game, text: e.error });
	}

	return [...groups.values()];
};

module.exports = { groupCheckInResults };
