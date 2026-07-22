export type Locale = 'en' | 'ru';

export const messages: Record<Locale, Record<string, string>> = {
	en: {
		appTitle: 'Psychodynamometer',
		tagline: 'Psychodynamic group progress meter, link-shareable',
		progress: 'Progress',
		nextSession: 'Next session',
		inProgress: 'in progress',
		rhythm: 'Rhythm',
		hoursPerWeek: 'Hours per week',
		schedule: 'Schedule',
		headerHours: '{completed} of {target} contracted hours',
		remaining: '{hours} h left',
		hoursShort: '{hours} h',
		noUpcoming: 'No upcoming sessions',
		noSessions: 'No sessions yet',
		done: 'done',
		upcoming: 'upcoming',
		edit: 'Edit',
		doneEditing: 'Done',
		badLink: 'This link could not be read — build a fresh one below.',
		groupName: 'Group name',
		targetHours: 'Target hours',
		sessions: 'Sessions',
		addSession: 'Add a session',
		copyLink: 'Copy link',
		copied: 'Copied!',
		fixRows: 'Fix the highlighted rows before copying a link.',
		copyFailed: 'Couldn’t copy the link. Please try again.',
		date: 'Date',
		start: 'Start',
		end: 'End',
		remove: 'Remove',
		timeZone: 'Time zone',
		timesInZone: 'Times are in the group’s zone.',
		groupTime: 'group time',
		yourTime: 'your time',
	},
	ru: {
		appTitle: 'Психодинамометр',
		tagline: 'Счётчик прогресса психодинамической группы, которым можно делиться по ссылке',
		progress: 'Прогресс',
		nextSession: 'Следующая сессия',
		inProgress: 'идёт сейчас',
		rhythm: 'Ритм',
		hoursPerWeek: 'Часов за неделю',
		schedule: 'Расписание',
		headerHours: '{completed} из {target} ч по договору',
		remaining: 'осталось {hours} ч',
		hoursShort: '{hours} ч',
		noUpcoming: 'Предстоящих сессий нет',
		noSessions: 'Сессий пока нет',
		done: 'проведено',
		upcoming: 'запланировано',
		edit: 'Редактировать',
		doneEditing: 'Готово',
		badLink: 'Не удалось прочитать ссылку — создайте новую ниже.',
		groupName: 'Название группы',
		targetHours: 'Часы по договору',
		sessions: 'Сессии',
		addSession: 'Добавить сессию',
		copyLink: 'Скопировать ссылку',
		copied: 'Скопировано!',
		fixRows: 'Исправьте выделенные строки перед копированием ссылки.',
		copyFailed: 'Не удалось скопировать ссылку. Попробуйте ещё раз.',
		date: 'Дата',
		start: 'Начало',
		end: 'Конец',
		remove: 'Удалить',
		timeZone: 'Time zone',
		timesInZone: 'Times are in the group’s zone.',
		groupTime: 'group time',
		yourTime: 'your time',
	},
};

// Stored choice wins; otherwise the browser language; default English.
export function resolveLocale(navLang: string | null | undefined, stored: string | null): Locale {
	if (stored === 'en' || stored === 'ru') return stored;
	return (navLang ?? '').toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

// Translate a key, interpolating {name} params.
export function t(
	locale: Locale,
	key: string,
	params: Record<string, string | number> = {},
): string {
	const template = messages[locale][key] ?? messages.en[key] ?? key;
	return template.replace(/\{(\w+)\}/g, (match, name) =>
		name in params ? String(params[name]) : match,
	);
}
