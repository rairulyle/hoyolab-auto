const checkInSuffix = (cardSign) => {
	if (!cardSign) {
		return "";
	}

	return cardSign === "Completed" ? " · ✅Check-in" : " · ❌Check-in";
};

const shouldRemind = ({ dailies, cardSign }) =>
	dailies.task !== dailies.maxTask || cardSign === "Not Completed";

const buildReminderText = ({ dailies, stamina, cardSign }) => {
	const current = Math.floor(stamina.currentStamina);
	return `${dailies.task}/${dailies.maxTask} dailies · ${current}/${stamina.maxStamina} stamina${checkInSuffix(cardSign)}`;
};

module.exports = { shouldRemind, buildReminderText };
