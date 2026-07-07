require("dotenv").config();

const Command = require("./classes/command.js");
const Config = require("./classes/config.js");
const Got = require("./classes/got.js");

const Cache = require("./singleton/cache.js");
const Logger = require("./singleton/logger.js");
const Utils = require("./singleton/utils.js");
const TestNotification = require("./singleton/test-notification.js");

const HoyoLab = require("./hoyolab-modules/template.js");
const Platform = require("./platforms/template.js");

const Date = require("./object/date.js");
const Error = require("./object/error.js");
const RegionalTaskManager = require("./object/regional-task-manager.js");

const Database = require("./db/index.js");
const { assemble } = require("./core/assembler.js");

(async () => {
	const start = process.hrtime.bigint();

	const db = new Database();
	await db.init();

	let config;
	try {
		config = await assemble(db);
	}
	catch (e) {
		console.error(e.message);
		process.exit(1);
	}

	globalThis.app = {
		Date,
		Error,
		RegionalTaskManager,

		Config,
		Command,

		db,
		Got: await Got.initialize(),
		Cache: new Cache(),
		Logger: new Logger(config.loglevel),
		Utils: new Utils(),
		TestNotification
	};

	Config.load(config);

	const { loadCommands } = require("./commands/index.js");
	const commands = await loadCommands();
	await Command.importData(commands.definitions);

	const definitions = require("./gots/index.js");
	await app.Got.importData(definitions);

	globalThis.app = {
		...app,
		Platform,
		HoyoLab
	};

	const platforms = config.platforms.map(definition => Platform.create(definition.type, definition));
	await Promise.all(platforms.map(platform => platform.connect()));

	const { reload } = require("./core/reload.js");
	const result = await reload();
	if (result.accountCount === 0) {
		app.Logger.warn("Client", "No profiles linked yet — use /link add in your server to get started");
	}

	const end = process.hrtime.bigint();
	app.Logger.info("Client", `Initialize completed (${Number(end - start) / 1e6}ms)`);

	process.on("unhandledRejection", (reason) => {
		if (!(reason instanceof Error)) {
			return;
		}

		app.Logger.log("Client", {
			message: "Unhandled promise rejection",
			args: { reason }
		});
	});
})();
