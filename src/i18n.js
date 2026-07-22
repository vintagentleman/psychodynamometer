/** @typedef {'en' | 'ru'} Locale */

/** @type {Record<Locale, Record<string, string>>} */
export const messages = {
	en: {
		progress: 'Progress',
		nextSession: 'Next session',
		inProgress: 'in progress',
		rhythm: 'Rhythm',
		schedule: 'Schedule',
		headerHours: '{completed} of {target} contracted hours',
		remaining: '{hours} h left',
		hoursShort: '{hours} h',
		noUpcoming: 'No upcoming sessions',
		noSessions: 'No sessions yet',
		done: 'done',
		upcoming: 'upcoming',
		edit: 'Edit',
		buildTitle: 'Build a group progress page',
		badLink: 'This link could not be read — build a fresh one below.',
		groupName: 'Group name',
		targetHours: 'Target hours',
		sessions: 'Sessions',
		addSession: 'Add a session',
		copyLink: 'Copy link',
		copied: 'Copied!',
		fixRows: 'Fix the highlighted rows before copying a link.',
		copyFailed: 'Couldn’t copy the link. Please try again.',
		preview: 'Preview',
		previewHint: 'Fill in a name, target hours and at least one session.',
		date: 'Date',
		start: 'Start',
		end: 'End',
		remove: 'Remove',
	},
	ru: {
		progress: 'Прогресс',
		nextSession: 'Следующая сессия',
		inProgress: 'идёт сейчас',
		rhythm: 'Ритм',
		schedule: 'Расписание',
		headerHours: '{completed} из {target} ч по договору',
		remaining: 'осталось {hours} ч',
		hoursShort: '{hours} ч',
		noUpcoming: 'Предстоящих сессий нет',
		noSessions: 'Сессий пока нет',
		done: 'проведено',
		upcoming: 'впереди',
		edit: 'Редактировать',
		buildTitle: 'Страница прогресса группы',
		badLink: 'Не удалось прочитать ссылку — создайте новую ниже.',
		groupName: 'Название группы',
		targetHours: 'Часы по договору',
		sessions: 'Сессии',
		addSession: 'Добавить сессию',
		copyLink: 'Скопировать ссылку',
		copied: 'Скопировано!',
		fixRows: 'Исправьте выделенные строки перед копированием ссылки.',
		copyFailed: 'Не удалось скопировать ссылку. Попробуйте ещё раз.',
		preview: 'Предпросмотр',
		previewHint: 'Укажите название, часы и хотя бы одну сессию.',
		date: 'Дата',
		start: 'Начало',
		end: 'Конец',
		remove: 'Удалить',
	},
};

/**
 * Stored choice wins; otherwise the browser language; default English.
 * @param {string | null | undefined} navLang
 * @param {string | null} stored
 * @returns {Locale}
 */
export function resolveLocale(navLang, stored) {
	if (stored === 'en' || stored === 'ru') return stored;
	return (navLang ?? '').toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

/**
 * Translate a key, interpolating {name} params.
 * @param {Locale} locale
 * @param {string} key
 * @param {Record<string, string | number>} [params]
 * @returns {string}
 */
export function t(locale, key, params = {}) {
	const template = messages[locale][key] ?? messages.en[key] ?? key;
	return template.replace(/\{(\w+)\}/g, (match, name) =>
		name in params ? String(params[name]) : match,
	);
}
