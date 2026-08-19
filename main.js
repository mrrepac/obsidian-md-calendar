'use strict';

/*
 * MD Calendar — a calendar that lives in one Markdown file.
 *
 * Put a fenced ```md-calendar code block in any note. Its body is a small JSON
 * document; the plugin renders it as a switchable month / week / day / agenda
 * calendar and writes every change back into that same block. The note stays a
 * normal, portable Markdown file — the calendar is just one block inside it.
 *
 * A self-contained calendar: all data lives in the one block, no other plugins
 * required.
 *
 * Plain CommonJS, no build step (same style as the author's md-reader plugin).
 */

const {
  Plugin,
  PluginSettingTab,
  Setting,
  Menu,
  Modal,
  Notice,
  TFile,
  moment,
  setIcon,
  MarkdownRenderChild,
  editorLivePreviewField,
} = require('obsidian');
// Obsidian resolves this at runtime for unbundled plugins, same as 'obsidian'.
const { EditorView } = require('@codemirror/view');
const { EditorState } = require('@codemirror/state');

/* Floor for the full-bleed height. A note carrying enough text under the calendar can't have
 * both fit; past this point the grid stops being usable, so the note keeps its scrollbar
 * instead of the calendar being crushed. */
const MIN_FILL = 340;


/* ------------------------------------------------------------------ *
 * i18n — English by default, Russian when Obsidian's language is ru.  *
 * ------------------------------------------------------------------ */
const LANG = (() => {
  // Obsidian sets moment's locale to the app language — read it instead of localStorage
  try {
    const loc = String((moment && moment.locale && moment.locale()) || '').toLowerCase();
    if (loc.split('-')[0] === 'ru') return 'ru';
  } catch (e) { /* ignore */ }
  return 'en';
})();

const STRINGS = {
  en: {
    untitled: 'Calendar',
    addPlaceholder: 'New event or task…',
    addHint: 'Type a title and press Enter, then pick the day right in the calendar — click it, or arrows + Enter. Ctrl/Cmd+Enter (or a leading “- ”) adds it as a task (no time).',
    today: 'Today',
    prev: 'Previous',
    next: 'Next',
    timePlaceholder: 'time — e.g. 1530, or 15-18 for a range',
    v_month: 'Month',
    v_week: 'Week',
    v_day: 'Day',
    v_agenda: 'Agenda',
    showCompleted: 'Show completed',
    hideCompleted: 'Hide completed',
    clearDone: 'Delete completed',
    clearedDone: 'Deleted {0} completed item(s) — Ctrl+Z brings them back.',
    noDoneToClear: 'Nothing completed to delete.',
    deletedNotice: 'Deleted.',
    undoBtn: 'Undo',
    allDay: 'All-day',
    more: '+{0} more',
    noEvents: 'No events this day.',
    gridNav: 'Calendar grid. Arrows or WASD move the day selection (W/S walk the hours in week/day). Tab steps into that day’s items: Enter edits, Space completes, Delete removes, M opens the menu, digits 1 to 7 set the color, Shift with an arrow moves the item itself, Escape steps back out. Q/E switch views, PageUp/PageDown months, Enter or Space on a day adds an event, T jumps to today, G goes to a date, F searches, C copies the period as text',
    newEvent: 'New event',
    editEvent: 'Edit event',
    e_title: 'Title',
    e_allday: 'All-day',
    e_endDate: 'End date',
    e_end: 'End',
    e_time: 'Time',
    e_done: 'Done',
    e_kind: 'Kind',
    e_event: 'Event',
    e_task: 'Task',
    e_color: 'Color',
    e_note: 'Description',
    e_until: 'Until',
    e_orTimes: 'or times:',
    r_until: ' — until {0}',
    seriesDone: 'Series finished.',
    c_default: 'Accent',
    c_red: 'Red',
    c_orange: 'Orange',
    c_yellow: 'Yellow',
    c_green: 'Green',
    c_blue: 'Blue',
    c_purple: 'Purple',
    save: 'Save',
    quickHint: 'Enter → time, Enter again to add (empty = all-day). Ctrl/Cmd+Enter — a task.',
    quickTaskHint: 'A task — Enter to add it (no time).',
    moreOptions: 'More options…',
    placeHint: 'Pick a day for “{0}” — click, or arrow keys + Enter/Space',
    placeTimeHint: 'Time on {0} — e.g. 1500 or 15-18, Enter to add (empty = all-day)',
    placeCancel: 'Cancel placement',
    r_none: 'No repeat',
    r_daily: 'Every day',
    r_weekly: 'Every week',
    r_monthly: 'Every month',
    r_yearly: 'Every year',
    r_weekday: 'Every weekday',
    r_weekdays: 'On days…',
    r_everyN: 'Every {0} {1}',
    u_day: 'days',
    u_week: 'weeks',
    u_month: 'months',
    u_year: 'years',
    e_interval: 'Interval',
    e_intervalHint: 'Repeat every N — 2 means every other one.',
    e_skipped: 'Skipped',
    e_skipRestore: 'Bring this occurrence back',
    e_skipAll: 'Restore all',
    m_snooze: 'Postpone',
    m_tomorrow: 'To tomorrow',
    m_nextWeek: 'By a week',
    m_pickDate: 'To a date…',
    snoozed: 'Moved to {0}.',
    purge: 'Delete the past',
    purgeCmd: 'Delete past records',
    purgeHint: 'The calendar lives in one note, so old records keep it growing. This deletes what is over and done with — and trims the dates that finished series and skipped occurrences leave behind.',
    purgeKeeps: 'Unfinished tasks and repeats that are still running are always kept.',
    purgeOlder: 'Older than',
    p_today: 'today',
    p_month: 'a month ago',
    p_3months: 'three months ago',
    p_year: 'a year ago',
    p_custom: 'a date of my own',
    purgeCount: 'Will delete {0}.',
    purgeBallast: ' Plus {0} inside series that stay.',
    purgeNothing: 'Nothing to delete before that date.',
    purgeDone: 'Deleted {0} — Ctrl+Z brings them back.',
    m_edit: 'Edit',
    m_duplicate: 'Duplicate',
    m_color: 'Color',
    m_delete: 'Delete',
    m_deleteSeries: 'Delete series',
    m_skip: 'Delete this occurrence',
    m_done: 'Mark done',
    m_undone: 'Mark not done',
    goToDate: 'Go to date',
    goBtn: 'Go',
    movedOut: 'Occurrence moved out of the series.',
    copied: 'Copied.',
    cancel: 'Cancel',
    badJson: 'This calendar block contains invalid JSON and cannot be displayed.',
    repair: 'Reset block',
    repairConfirm: 'Reset this block? Every event in it will be replaced with an empty calendar.',
    insertCmd: 'Insert calendar',
    newNoteCmd: 'Create new calendar note',
    openNoteCmd: 'Open the calendar note',
    ribbon: 'Create a calendar note',
    recurred: 'Recurring event moved to {0}',
    orphanWarn: '{0} record(s) with no usable date — kept in the block, but not shown.',
    orphanBtn: 'Sort out',
    orphanTitle: 'Records without a date',
    orphanHint: 'These records could not be placed on the calendar: their date is missing or unreadable. Give each one a date to bring it back, or delete it.',
    orphanNoDate: 'no date',
    orphanRestore: 'Place',
    orphanEmpty: 'Nothing left here.',
    search: 'Search',
    searchPlaceholder: 'Search titles and descriptions…',
    searchEmpty: 'Nothing found.',
    searchCmd: 'Find an event',
    searchHint: '{0} found — Enter jumps to the date',
    calTitle: 'Calendar name',
    calTitleHint: 'Shown above the calendar. Leave empty to hide it.',
    nextDay: 'next day',
    copyPeriod: 'Copy the period as text',
    copyCmd: 'Copy the visible period as text',
    copiedPeriod: 'Copied to the clipboard: {0} record(s).',
    copyEmpty: 'Nothing to copy in this period.',
    copyFailed: 'Could not write to the clipboard.',
    txtAllDay: 'all day',
    stTomorrow: 'tomorrow',
    stTip: 'MD Calendar — what is coming up. Click to open the calendar.',
    s_viewDesktop: 'Default view (desktop)',
    s_viewMobile: 'Default view (mobile)',
    s_fdow: 'First day of week',
    s_fdowAuto: 'Follow Obsidian locale',
    s_dur: 'New event duration (min)',
    s_snap: 'Drag and resize step (min)',
    s_sound: 'Completion sound',
    s_soundDesc: 'A short chime when you tick something done.',
    s_dayStart: 'Day starts at (hour)',
    s_dayEnd: 'Day ends at (hour)',
    s_hoursDesc: 'The hours normally on screen in week and day. The grid widens by itself to fit anything outside them.',
    s_monthChips: 'Events per day in month view',
    s_monthChipsDesc: 'Beyond this, the day shows “+N more”, which lists the rest without leaving the month. Higher values make the rows taller.',
    s_multi: 'Multiple calendars',
    s_multiDesc: 'On — the button creates a new calendar every time. Off — one calendar, the button opens it.',
    s_status: 'Next event in the status bar',
    s_statusDesc: 'The nearest upcoming item of the calendar note, at the bottom of the window — without opening the note. Desktop only.',
    s_full: 'Fill the pane',
    s_fullDesc: 'A calendar is a grid, not prose: let the block use the whole width and height of the pane instead of the readable-line-width column. Fits exactly on desktop; on mobile it can still grow past the pane and let the note scroll.',
    s_fullScope_desktop: 'Desktop only',
    s_fullScope_mobile: 'Mobile only',
    s_fullScope_none: 'Nowhere',
    s_fullScope_all: 'Everywhere',
  },
  ru: {
    untitled: 'Календарь',
    addPlaceholder: 'Новое событие или задача…',
    addHint: 'Введите название и нажмите Enter, затем выберите день прямо в календаре — кликом или стрелками + Enter. Ctrl/Cmd+Enter (или «- » в начале) — задача (без времени).',
    today: 'Сегодня',
    prev: 'Назад',
    next: 'Вперёд',
    timePlaceholder: 'время — напр. 1530 или 15-18 для диапазона',
    v_month: 'Месяц',
    v_week: 'Неделя',
    v_day: 'День',
    v_agenda: 'Повестка',
    showCompleted: 'Показывать выполненные',
    hideCompleted: 'Скрыть выполненные',
    clearDone: 'Удалить выполненные',
    clearedDone: 'Удалено выполненных: {0} — Ctrl+Z вернёт.',
    noDoneToClear: 'Выполненных нет — удалять нечего.',
    deletedNotice: 'Удалено.',
    undoBtn: 'Вернуть',
    allDay: 'Весь день',
    more: 'ещё {0}',
    noEvents: 'В этот день событий нет.',
    gridNav: 'Сетка календаря. Стрелки или WASD двигают указатель по дням (W/S — часы в неделе/дне). Tab заходит внутрь дня, к его событиям: Enter — изменить, пробел — выполнено, Delete — удалить, M — меню, цифры от 1 до 7 — цвет, Shift со стрелкой двигает саму запись, Escape — обратно к дню. Q/E — переключение вида, PageUp/PageDown — месяцы, Enter/пробел на дне — новое событие, T — сегодня, G — переход к дате, F — поиск, C — скопировать период текстом',
    newEvent: 'Новое событие',
    editEvent: 'Изменить событие',
    e_title: 'Название',
    e_allday: 'Весь день',
    e_endDate: 'Дата конца',
    e_end: 'Конец',
    e_time: 'Время',
    e_done: 'Выполнено',
    e_kind: 'Тип',
    e_event: 'Событие',
    e_task: 'Задача',
    e_color: 'Цвет',
    e_note: 'Описание',
    e_until: 'До даты',
    e_orTimes: 'или раз:',
    r_until: ' — до {0}',
    seriesDone: 'Серия завершена.',
    c_default: 'Акцентный',
    c_red: 'Красный',
    c_orange: 'Оранжевый',
    c_yellow: 'Жёлтый',
    c_green: 'Зелёный',
    c_blue: 'Синий',
    c_purple: 'Фиолетовый',
    save: 'Сохранить',
    quickHint: 'Enter → время, ещё раз Enter — добавить (пусто = весь день). Ctrl+Enter — задача.',
    quickTaskHint: 'Задача — Enter, чтобы добавить (без времени).',
    moreOptions: 'Подробнее…',
    placeHint: 'Выберите день для «{0}» — клик или стрелки + Enter/пробел',
    placeTimeHint: 'Время на {0} — напр. 1500 или 15-18, Enter — добавить (пусто = весь день)',
    placeCancel: 'Отменить размещение',
    r_none: 'Без повтора',
    r_daily: 'Каждый день',
    r_weekly: 'Каждую неделю',
    r_monthly: 'Каждый месяц',
    r_yearly: 'Каждый год',
    r_weekday: 'По будням',
    r_weekdays: 'По дням недели…',
    r_everyN: 'Каждые {0} {1}',
    u_day: 'дн.',
    u_week: 'нед.',
    u_month: 'мес.',
    u_year: 'г.',
    e_interval: 'Интервал',
    e_intervalHint: 'Повторять каждые N — 2 значит через раз.',
    e_skipped: 'Пропущено',
    e_skipRestore: 'Вернуть это вхождение',
    e_skipAll: 'Вернуть все',
    m_snooze: 'Отложить',
    m_tomorrow: 'На завтра',
    m_nextWeek: 'На неделю',
    m_pickDate: 'На дату…',
    snoozed: 'Перенесено на {0}.',
    purge: 'Удалить прошедшее',
    purgeCmd: 'Удалить прошедшие записи',
    purgeHint: 'Календарь живёт в одной заметке, и старые записи её раздувают. Здесь удаляется то, что уже прошло и закрыто, — вместе с датами, которые остаются от завершённых серий и удалённых вхождений.',
    purgeKeeps: 'Незавершённые задачи и повторы, которые ещё идут, остаются всегда.',
    purgeOlder: 'Раньше чем',
    p_today: 'сегодня',
    p_month: 'месяц назад',
    p_3months: 'три месяца назад',
    p_year: 'год назад',
    p_custom: 'своя дата',
    purgeCount: 'Будет удалено: {0}.',
    purgeBallast: ' И ещё {0} внутри серий, которые остаются.',
    purgeNothing: 'До этой даты удалять нечего.',
    purgeDone: 'Удалено: {0} — Ctrl+Z вернёт.',
    m_edit: 'Изменить',
    m_duplicate: 'Дублировать',
    m_color: 'Цвет',
    m_delete: 'Удалить',
    m_deleteSeries: 'Удалить всю серию',
    m_skip: 'Удалить это вхождение',
    m_done: 'Отметить выполненным',
    m_undone: 'Снять отметку',
    goToDate: 'Перейти к дате',
    goBtn: 'Перейти',
    movedOut: 'Вхождение перенесено из серии.',
    copied: 'Скопировано.',
    cancel: 'Отмена',
    badJson: 'В этом блоке календаря некорректный JSON, его нельзя отобразить.',
    repair: 'Сбросить блок',
    repairConfirm: 'Сбросить блок? Все события в нём будут заменены пустым календарём.',
    insertCmd: 'Вставить календарь',
    newNoteCmd: 'Создать заметку-календарь',
    openNoteCmd: 'Открыть заметку-календарь',
    ribbon: 'Создать заметку-календарь',
    recurred: 'Повтор перенесён на {0}',
    orphanWarn: 'Записей без пригодной даты: {0} — они сохранены в блоке, но не показаны.',
    orphanBtn: 'Разобрать',
    orphanTitle: 'Записи без даты',
    orphanHint: 'Эти записи не удалось поставить в календарь: даты нет или она нечитаема. Задайте дату, чтобы вернуть запись, либо удалите её.',
    orphanNoDate: 'нет даты',
    orphanRestore: 'Поставить',
    orphanEmpty: 'Здесь больше ничего нет.',
    search: 'Поиск',
    searchPlaceholder: 'Поиск по названию и описанию…',
    searchEmpty: 'Ничего не найдено.',
    searchCmd: 'Найти событие',
    searchHint: 'Найдено: {0} — Enter перейдёт к дате',
    calTitle: 'Название календаря',
    calTitleHint: 'Показывается над календарём. Пустое поле скрывает заголовок.',
    nextDay: 'след. день',
    copyPeriod: 'Скопировать период текстом',
    copyCmd: 'Скопировать видимый период текстом',
    copiedPeriod: 'Скопировано в буфер, записей: {0}.',
    copyEmpty: 'В этом периоде копировать нечего.',
    copyFailed: 'Не удалось записать в буфер обмена.',
    txtAllDay: 'весь день',
    stTomorrow: 'завтра',
    stTip: 'MD Calendar — что дальше. Клик открывает календарь.',
    s_viewDesktop: 'Вид по умолчанию (десктоп)',
    s_viewMobile: 'Вид по умолчанию (мобильный)',
    s_fdow: 'Первый день недели',
    s_fdowAuto: 'Как в языке Obsidian',
    s_dur: 'Длительность нового события (мин)',
    s_snap: 'Шаг перетаскивания и растяжения (мин)',
    s_sound: 'Звук выполнения',
    s_soundDesc: 'Короткий сигнал при отметке «выполнено».',
    s_dayStart: 'Начало дня (час)',
    s_dayEnd: 'Конец дня (час)',
    s_hoursDesc: 'Часы, которые обычно видно в неделе и дне. Для событий вне этого окна сетка раздвигается сама.',
    s_monthChips: 'Событий в дне в виде «Месяц»',
    s_monthChipsDesc: 'Дальше день показывает «ещё N» — список остальных открывается на месте, не уводя из месяца. Чем больше значение, тем выше строки.',
    s_multi: 'Несколько календарей',
    s_multiDesc: 'Вкл — кнопка каждый раз создаёт новый календарь. Выкл — календарь один, кнопка открывает его.',
    s_status: 'Ближайшее событие в строке состояния',
    s_statusDesc: 'Ближайшая запись из заметки-календаря внизу окна — не открывая заметку. Только на десктопе.',
    s_full: 'Календарь во всё окно',
    s_fullDesc: 'Календарь — сетка, а не текст: блок занимает всю ширину и высоту панели, а не колонку «читаемой длины строки». На ПК подгоняется впритык; на мобильном может занять больше панели — тогда прокручивается сама заметка.',
    s_fullScope_desktop: 'Только на ПК',
    s_fullScope_mobile: 'Только на мобильном',
    s_fullScope_none: 'Нигде',
    s_fullScope_all: 'Везде',
  },
};

function t(key) {
  let s = STRINGS[LANG][key];
  if (s === undefined) s = STRINGS.en[key];
  if (s === undefined) s = key;
  if (arguments.length > 1) {
    s = s.replace(/\{(\d+)\}/g, (_, i) => String(arguments[1 + Number(i)] ?? ''));
  }
  return s;
}

/* Count words for the day summaries. Russian needs three forms (1 событие / 2 события /
 * 5 событий), English two — so this can't go through t()'s {0} substitution. */
const PLURALS = {
  en: { ev: ['event', 'events'], task: ['task', 'tasks'], rec: ['record', 'records'], date: ['date', 'dates'] },
  ru: {
    ev: ['событие', 'события', 'событий'], task: ['задача', 'задачи', 'задач'],
    rec: ['запись', 'записи', 'записей'], date: ['дата', 'даты', 'дат'],
  },
};
function plural(n, kind) {
  const forms = (PLURALS[LANG] || PLURALS.en)[kind];
  if (LANG !== 'ru') return forms[n === 1 ? 0 : 1];
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
  return forms[2];
}

/* Everything drawn on one day, spans included. Month and the time grid keep multi-day events
 * in a SEPARATE list (they draw as continuous bars, not per-day chips), so a day summary has
 * to put the two back together — otherwise a week away reads as an empty week. */
function itemsOnDay(byDay, spans, iso) {
  const out = (byDay.get(iso) || []).slice();
  for (const it of spans || []) if (it.date <= iso && it.endDate >= iso) out.push(it);
  return out;
}

/* "3 events · 1 task" for one day's drawn items. Tasks are counted only while UNDONE — that
 * is the number that still asks something of you; events are counted as drawn. The tail half
 * of an event that ran past midnight belongs to the previous day and isn't counted twice. */
function dayCountLabel(items) {
  let events = 0, tasks = 0;
  for (const it of items || []) {
    if (it.spill === 'tail') continue;
    if (it.task) { if (!it.done) tasks++; } else events++;
  }
  const parts = [];
  if (events) parts.push(events + ' ' + plural(events, 'ev'));
  if (tasks) parts.push(tasks + ' ' + plural(tasks, 'task'));
  return parts.join(' · ');
}

/* ------------------------------------------------------------------ *
 * Constants                                                           *
 * ------------------------------------------------------------------ */
const FENCE = 'md-calendar';
// Used to sanity-check cached block geometry before overwriting (see persist()).
const DN_FENCE_OPEN = /^\s*(?:`{3,}|~{3,})\s*md-calendar\b/i;
const DN_FENCE_CLOSE = /^\s*(?:`{3,}|~{3,})\s*$/;

const UNITS = ['day', 'week', 'month', 'year'];
const VIEW_CYCLE = ['month', 'week', 'day', 'agenda'];
// A phone gets just these two: agenda (the default — its mini calendar with dots IS the
// month overview) and day. Month/week grids are unreadable at that size.
const MOBILE_VIEWS = ['agenda', 'day'];
// Semantic color keys → theme CSS variables (never a raw hex). See styles.css.
const COLOR_KEYS = ['default', 'red', 'orange', 'yellow', 'green', 'blue', 'purple'];
// Where fullWidthScope applies full-bleed: desktop's exact-fit-no-scrollbar and mobile's
// grow-and-scroll are different enough trade-offs (see styles.css) to want separately.
const FULL_WIDTH_SCOPES = ['desktop', 'mobile', 'none', 'all'];
const DEFAULT_PLUGIN_SETTINGS = {
  firstView: 'month',
  firstViewMobile: 'agenda',
  dayStart: 7,
  dayEnd: 22,
  firstDayOfWeek: -1,     // -1 = follow Obsidian's locale; 0..6 = forced weekday
  defaultDurationMin: 60, // a new timed event lasts this long
  snapMin: 30,            // drag/resize grid step
  multiCalendar: false,   // false: the ribbon/command opens the existing calendar note
  calendarNotePath: '',   // remembered single-calendar note (kept fresh across renames)
  completionSound: true,  // a short chime when something is ticked done
  monthChips: 4,          // events drawn in a month cell before "+N more" takes over
  statusBar: true,        // desktop: show the next upcoming item in Obsidian's status bar
  fullWidthScope: 'desktop', // 'desktop' | 'mobile' | 'none' | 'all' — where the block fills the pane
  // Per-block UI state — { "<notePath>::<calId>": { view, showCompleted } }. It lives HERE and
  // not in the note so that paging through views stops rewriting the user's Markdown file.
  viewMemory: {},
};

/* A soft rising two-note chime (Web Audio, no asset files): played on completing an item.
 * The context is created lazily inside the click gesture, so autoplay policies are happy. */
let AUDIO_CTX = null;
function playDoneSound() {
  try {
    if (!AUDIO_CTX) AUDIO_CTX = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = AUDIO_CTX;
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime;
    [[880, 0, 0.09], [1318.5, 0.07, 0.18]].forEach(([freq, dt, dur]) => { // A5 → E6, a fifth up
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0 + dt);
      g.gain.exponentialRampToValueAtTime(0.12, t0 + dt + 0.012); // gentle, not startling
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + dur);
      o.connect(g).connect(ctx.destination);
      o.start(t0 + dt);
      o.stop(t0 + dt + dur + 0.02);
    });
  } catch (e) { /* no audio device / blocked — stay silent */ }
}

/* Plugin-level knobs mirrored out of settings so module helpers (normalizeEvent, fdow,
 * the drag math) can read them without threading a settings object everywhere. */
const CFG = { fdow: null, defaultDur: 60, snap: 30 };

const IS_MOBILE = () => !!(window.document && document.body && document.body.classList.contains('is-mobile'));

/* ------------------------------------------------------------------ *
 * Small utilities (date/time engine — lifted from tasknote verbatim)  *
 * ------------------------------------------------------------------ */
function uid(prefix) {
  return (prefix || '') + Math.random().toString(36).slice(2, 9);
}
function todayM() { return moment().startOf('day'); }
function isoToday() { return todayM().format('YYYY-MM-DD'); }
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

/* Normalize an "H:mm"/"HH:mm" string to zero-padded "HH:mm", or null if invalid. */
function normTime(v) {
  if (typeof v !== 'string') return null;
  const m = v.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]), mm = Number(m[2]);
  if (hh > 23 || mm > 59) return null;
  return String(hh).padStart(2, '0') + ':' + m[2];
}

/* Parse a compact/loose time entry into "HH:mm", or null if empty/invalid. */
function parseCompactTime(s) {
  const d = String(s == null ? '' : s).replace(/\D/g, '');
  if (!d) return null;
  let hh, mm;
  if (d.length <= 2) { hh = Number(d); mm = 0; }
  else if (d.length === 3) {
    if (Number(d.slice(0, 2)) < 24) { hh = Number(d.slice(0, 2)); mm = Number(d[2]) * 10; }
    else { hh = Number(d[0]); mm = Number(d.slice(1)); }
  } else { hh = Number(d.slice(0, 2)); mm = Number(d.slice(2, 4)); }
  if (hh > 23 || mm > 59) return null;
  return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}

/* Parse a time entry that may be a RANGE: a hyphen / en-dash / em-dash splits start from end —
 * "15-18" → {start:'15:00', end:'18:00'}, "1500-1800" and "9:00-10:30" likewise. A lone time —
 * "1518", "15:18", "15" — is a start only (":" and bare digits never mean a range): {start,end:null}.
 * null if the start doesn't parse. An end EARLIER than the start is kept — "23-02" is the night
 * train, an event that runs past midnight; only an end equal to the start is meaningless and
 * dropped (normalizeEvent would rewrite it to start+duration anyway). */
function parseTimeRange(s) {
  const str = String(s == null ? '' : s).trim();
  const parts = str.split(/\s*[-–—]\s*/);
  if (parts.length === 2 && parts[0] && parts[1]) {
    const start = parseCompactTime(parts[0]);
    const end = parseCompactTime(parts[1]);
    if (start) return { start, end: (end && timeToMin(end) !== timeToMin(start)) ? end : null };
  }
  const start = parseCompactTime(str);
  return start ? { start, end: null } : null;
}

const DAY_MIN = 24 * 60;

function timeToMin(hhmm) {
  const m = normTime(hhmm);
  if (!m) return null;
  return Number(m.slice(0, 2)) * 60 + Number(m.slice(3, 5));
}
function minToTime(min) {
  min = Math.max(0, Math.min(DAY_MIN - 1, Math.round(min)));
  return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
}

/* How long a timed event lasts, wrapping over midnight: 23:00→02:00 is 180 minutes, not −1260. */
function durationMin(start, end) {
  const s = timeToMin(start), e = timeToMin(end);
  if (s == null || e == null) return null;
  return e > s ? e - s : (e + DAY_MIN) - s;
}

/* A timed event whose end is BEFORE its start runs into the next day (the night train, the
 * party that ends at 02:00). It is drawn as two segments — see bucketByDay. An end of exactly
 * 00:00 is the midnight boundary itself: one segment, finishing at the bottom of its own day. */
function crossesMidnight(it) {
  if (!it || it.allDay || !it.start || !it.end) return false;
  const s = timeToMin(it.start), e = timeToMin(it.end);
  return s != null && e != null && e < s && e > 0;
}

/* The minute a drawn segment finishes at. An end of exactly 00:00 belongs to the BOTTOM of its
 * own day (24:00), not to the top of it — otherwise a 22:00–00:00 event lays out as zero-length
 * and gets rewritten to the default duration. */
function segEndMin(it) {
  const e = timeToMin(it.segEnd || it.end);
  if (e == null) return null;
  const s = timeToMin(it.segStart || it.start);
  return (e === 0 && s != null && s > 0) ? DAY_MIN : e;
}

/* Advance an ISO date by a repeat rule. */
function advanceDue(iso, rep) {
  let m = iso ? moment(iso, 'YYYY-MM-DD', true) : todayM();
  if (!m.isValid()) m = todayM();
  if (rep.unit === 'weekdays') {
    // weekly on a chosen set of weekday numbers (0=Sun..6=Sat) — next matching day after iso
    const set = new Set(rep.days && rep.days.length ? rep.days : [m.day()]);
    let g = 0;
    do { m.add(1, 'day'); } while (!set.has(m.day()) && g++ < 14);
    return m.format('YYYY-MM-DD');
  }
  if (rep.unit === 'weekday') {
    do { m.add(1, 'day'); } while (m.day() === 0 || m.day() === 6);
    return m.format('YYYY-MM-DD');
  }
  if (rep.unit === 'month' || rep.unit === 'year') {
    const anchor = (typeof rep.day === 'number' && rep.day >= 1 && rep.day <= 31) ? rep.day : m.date();
    m.date(1);
    m.add(rep.every || 1, rep.unit);
    m.date(Math.min(anchor, m.daysInMonth()));
    return m.format('YYYY-MM-DD');
  }
  m.add(rep.every || 1, rep.unit);
  return m.format('YYYY-MM-DD');
}

function relDayLabel(iso) {
  if (!iso) return '';
  const d = moment(iso, 'YYYY-MM-DD', true).startOf('day');
  if (!d.isValid()) return iso;
  const diff = Math.round(d.diff(todayM(), 'days', true)); // rounded: DST-safe (see expandInstances)
  if (diff === 0) return t('today');
  return cap(d.format('dddd, D MMMM'));
}

function repeatLabel(rep) {
  if (!rep) return t('r_none');
  let base;
  if (rep.unit === 'weekday') base = t('r_weekday');
  else if (rep.unit === 'weekdays') {
    const wmin = moment.weekdaysMin();
    base = (rep.days || []).slice().sort((a, b) => a - b).map((d) => wmin[d]).join(', ');
  } else {
    const n = rep.every || 1;
    base = n === 1
      ? ({ day: t('r_daily'), week: t('r_weekly'), month: t('r_monthly'), year: t('r_yearly') }[rep.unit] || t('r_none'))
      : t('r_everyN', n, t('u_' + rep.unit));
  }
  if (rep.until) base += t('r_until', moment(rep.until, 'YYYY-MM-DD').format('D.MM.YYYY'));
  return base;
}

function normalizeRepeat(r) {
  if (!r || typeof r !== 'object' || !r.unit) return null;
  // Optional series end: the last date an occurrence may START on (inclusive).
  const until = toIsoDate(r.until);
  const withUntil = (o) => { if (until) o.until = until; return o; };
  if (r.unit === 'weekday') return withUntil({ unit: 'weekday' });
  if (r.unit === 'weekdays') {
    const days = Array.isArray(r.days)
      ? Array.from(new Set(r.days.map(Number).filter((n) => n >= 0 && n <= 6))).sort((a, b) => a - b)
      : [];
    return days.length ? withUntil({ unit: 'weekdays', days }) : null; // no days chosen ⇒ no repeat
  }
  const unit = UNITS.includes(r.unit) ? r.unit : 'week';
  const out = { every: Math.max(1, Number(r.every) || 1), unit };
  if ((unit === 'month' || unit === 'year') && typeof r.day === 'number' && r.day >= 1 && r.day <= 31) {
    out.day = Math.floor(r.day);
  }
  return withUntil(out);
}

/* The date of the Nth occurrence (n ≥ 1) of a rule starting at startIso — powers the
 * "repeat N times" helper, which stores the result as a plain `until` date. */
function nthOccurrence(startIso, rep, n) {
  let d = startIso;
  let g = 0;
  for (let i = 1; i < n && g++ < 999; i++) d = advanceDue(d, rep);
  return d;
}

/* ------------------------------------------------------------------ *
 * Calendar model: parse / normalize / serialize                       *
 * ------------------------------------------------------------------ */
/* Coerce a value to a strict zero-padded YYYY-MM-DD (accepting a loose YYYY-M-D); null if unusable.
 * All downstream date math (lexical range checks + moment parsing) assumes strict ISO, so a
 * hand-edited/pasted date must be validated here rather than trusted verbatim. */
function toIsoDate(v) {
  if (typeof v !== 'string' || !v) return null;
  const m = moment(v, ['YYYY-MM-DD', 'YYYY-M-D'], true);
  return m.isValid() ? m.format('YYYY-MM-DD') : null;
}

function normalizeEvent(raw, i) {
  const r = raw && typeof raw === 'object' ? raw : {};
  // A task is a to-do: a single all-day item with no time (see rendering — it shows a checkbox).
  const task = r.task === true;
  const date = toIsoDate(r.date) || toIsoDate(r.due); // strict/coerced ISO; accept a pasted tasknote 'due'
  let start = task ? null : normTime(r.start != null ? r.start : r.time);
  let end = normTime(r.end);
  // A time-less start makes no sense; an end without a start is dropped.
  if (!start) {
    end = null;
  } else {
    // An end BEFORE the start means the event runs past midnight (23:00–02:00) — that is kept
    // exactly as typed. Only a missing or zero-length end is materialized, to the configured
    // default (one hour out of the box), wrapping around midnight rather than being flattened
    // against 23:59 as it used to be.
    const sMin = timeToMin(start);
    let eMin = end ? timeToMin(end) : null;
    if (eMin == null || eMin === sMin) eMin = (sMin + CFG.defaultDur) % DAY_MIN;
    end = minToTime(eMin);
  }
  // A multi-day span is an all-day-only concept, so endDate only survives for time-less events;
  // keeping it on a timed event would be inert on-disk state the renderer never uses.
  let endDate = (!task && !start) ? toIsoDate(r.endDate) : null;
  if (endDate && date && endDate < date) endDate = null; // guard: span must not run backwards
  const color = COLOR_KEYS.includes(r.color) && r.color !== 'default' ? r.color : null;
  const done = r.done === true || r.status === 'done';
  const repeat = normalizeRepeat(r.repeat);
  // A series end before the event's own date would make every occurrence vanish (an
  // invisible ghost that still round-trips) — drop the end, keep the event visible.
  if (repeat && repeat.until && date && repeat.until < date) delete repeat.until;
  // Occurrence exceptions (iCal EXDATE): ISO dates a repeating event skips — the "delete
  // this occurrence" action. Meaningless without a repeat, so dropped there.
  let skip = null;
  if (repeat && Array.isArray(r.skip)) {
    const ds = Array.from(new Set(r.skip.map(toIsoDate).filter(Boolean))).sort();
    if (ds.length) skip = ds;
  }
  // Per-occurrence completion for a repeating EVENT: ticking one occurrence must not move the
  // series (that erased every earlier occurrence from the calendar). A repeating TASK keeps the
  // to-do model instead — completing it rolls the base date forward — so the list is inert there.
  let doneDates = null;
  if (repeat && !task && Array.isArray(r.doneDates)) {
    const ds = Array.from(new Set(r.doneDates.map(toIsoDate).filter(Boolean))).sort();
    if (ds.length) doneDates = ds;
  }
  return {
    id: typeof r.id === 'string' && r.id ? r.id : uid('e'),
    title: typeof r.title === 'string' ? r.title : (typeof r.text === 'string' ? r.text : ''),
    task,
    date,
    start,
    end,
    endDate,
    repeat,
    skip,
    doneDates,
    note: typeof r.note === 'string' ? r.note : '',
    color,
    done,
    completedAt: typeof r.completedAt === 'string' ? r.completedAt : null,
    created: typeof r.created === 'string' && r.created ? r.created : isoToday(),
    order: typeof r.order === 'number' ? r.order : i,
  };
}

function normalizeCal(parsed, defaults) {
  const m = parsed && typeof parsed === 'object' ? parsed : {};
  // Effective default view is resolved per-device here (not by mutating the persisted
  // firstView), so opening a note on mobile never clobbers the saved desktop default.
  const effectiveFirstView = IS_MOBILE() ? (defaults.firstViewMobile || defaults.firstView) : defaults.firstView;
  // Whitelist the block settings: earlier versions left stale keys (showTasks, …) that the code
  // never reads but that round-tripped to disk forever. Only known keys survive a save.
  const rawSettings = m.settings && typeof m.settings === 'object' ? m.settings : {};
  const settings = {
    view: typeof rawSettings.view === 'string' ? rawSettings.view : effectiveFirstView,
    showCompleted: rawSettings.showCompleted !== false,
  };
  if (!VIEW_CYCLE.includes(settings.view)) settings.view = 'month';

  const rawEvents = Array.isArray(m.events) ? m.events
    : Array.isArray(m.tasks) ? m.tasks : []; // accept a pasted tasknote board
  // A record with no usable date can't be placed by expandInstances, so it can't be rendered.
  // It is NOT dropped, though — that used to delete a hand-typed "01.07.2026" from the note on
  // the next save, silently and past undo's reach. Such records are quarantined verbatim:
  // serializeCal writes them back untouched, and the header offers a way to date or delete them.
  const orphans = [];
  const events = [];
  rawEvents.forEach((raw, i) => {
    const ev = normalizeEvent(raw, i);
    if (ev.date) events.push(ev);
    else if (raw && typeof raw === 'object') orphans.push(raw);
  });

  // Guarantee unique ids so find()/edit/delete stay consistent after a hand-edit or sync conflict.
  const seen = new Set();
  events.forEach((ev) => { if (seen.has(ev.id)) ev.id = uid('e'); seen.add(ev.id); });
  events.forEach((ev, i) => { if (typeof ev.order !== 'number') ev.order = i; });
  events.sort((a, b) => a.order - b.order);
  events.forEach((ev, i) => { ev.order = i; });

  return {
    version: 1,
    calId: typeof m.calId === 'string' && m.calId ? m.calId : uid('c'),
    title: typeof m.title === 'string' ? m.title : '',
    settings,
    events,
    orphans,
  };
}

function cleanEvent(ev) {
  const o = { id: ev.id, title: ev.title, date: ev.date };
  if (ev.task) o.task = true;
  if (ev.start) o.start = ev.start;
  if (ev.end) o.end = ev.end;
  if (ev.endDate) o.endDate = ev.endDate;
  if (ev.repeat) o.repeat = ev.repeat;
  if (ev.skip && ev.skip.length) o.skip = ev.skip;
  if (ev.doneDates && ev.doneDates.length) o.doneDates = ev.doneDates;
  if (ev.note) o.note = ev.note;
  if (ev.color) o.color = ev.color;
  if (ev.done) o.done = true;
  if (ev.completedAt) o.completedAt = ev.completedAt;
  if (ev.created) o.created = ev.created;
  if (typeof ev.order === 'number') o.order = ev.order;
  return o;
}

function serializeCal(m) {
  const out = { version: 1, calId: m.calId };
  if (m.title) out.title = m.title;
  out.settings = m.settings;
  // Undatable records ride along at the end, byte-for-byte as they were read (see normalizeCal):
  // the block never loses a record just because its date didn't parse.
  out.events = m.events.map(cleanEvent).concat(m.orphans || []);
  return JSON.stringify(out, null, 2);
}

function find(model, id) { return model.events.find((ev) => ev.id === id); }

/* ------------------------------------------------------------------ *
 * Grid / range / recurrence helpers                                   *
 * ------------------------------------------------------------------ */
function fdow() { return CFG.fdow != null ? CFG.fdow : moment.localeData().firstDayOfWeek(); }

/* Jump to the first recurrence on/after targetIso without walking step-by-step over huge
 * gaps (a rule anchored centuries ago must still resolve within the loop guard). day/week
 * and month/year jump arithmetically (undershooting, the loop lands exactly); weekday snaps
 * into the window (every weekday on/after the anchor is an occurrence). */
function fastForward(startIso, rep, targetIso) {
  let d = startIso;
  if (d >= targetIso) return d;
  if (rep.unit === 'weekday') {
    d = targetIso;
    let wd = moment(d, 'YYYY-MM-DD').day();
    let g = 0;
    while ((wd === 0 || wd === 6) && g++ < 7) { d = moment(d, 'YYYY-MM-DD').add(1, 'day').format('YYYY-MM-DD'); wd = moment(d, 'YYYY-MM-DD').day(); }
    return d;
  }
  if (rep.unit === 'day' || rep.unit === 'week') {
    const per = (rep.unit === 'week' ? 7 : 1) * (rep.every || 1);
    const diff = moment(targetIso, 'YYYY-MM-DD').diff(moment(startIso, 'YYYY-MM-DD'), 'days');
    const steps = Math.max(0, Math.floor(diff / per));
    if (steps > 0) d = moment(startIso, 'YYYY-MM-DD').add(steps * per, 'day').format('YYYY-MM-DD');
  }
  if (rep.unit === 'month' || rep.unit === 'year') {
    // Same arithmetic jump for month/year (a monthly rule anchored >500 years back used to
    // exhaust the 6000-step guard below). Undershoot by one period and let advanceDue land
    // the exact occurrence with its day-of-month anchor semantics.
    const perMonths = (rep.unit === 'year' ? 12 : 1) * (rep.every || 1);
    const diff = moment(targetIso, 'YYYY-MM-DD').diff(moment(startIso, 'YYYY-MM-DD'), 'months');
    const steps = Math.floor(diff / perMonths) - 1;
    if (steps > 0) {
      const anchor = (typeof rep.day === 'number') ? rep.day : moment(startIso, 'YYYY-MM-DD').date();
      const m = moment(startIso, 'YYYY-MM-DD').date(1).add(steps * perMonths, 'month');
      m.date(Math.min(anchor, m.daysInMonth()));
      d = m.format('YYYY-MM-DD');
    }
  }
  let g = 0;
  while (d < targetIso && g++ < 6000) d = advanceDue(d, rep);
  return d;
}

/* Expand an event's recurrences into concrete dated instances within [from,to] (ISO).
 * `limit` stops after that many instances — callers that only need the FIRST few (the search
 * ordering, the status bar) must not walk a whole year of a daily series to get them. */
function expandInstances(ev, fromIso, toIso, limit) {
  const out = [];
  if (!ev.date) return out;
  // diff(...,'days', true) + round: across a DST transition a "day" is 23/25h and the integer
  // diff truncates, silently shortening a span that crosses the change-over.
  const spanDays = (ev.endDate && !ev.start)
    ? Math.max(0, Math.round(moment(ev.endDate, 'YYYY-MM-DD').diff(moment(ev.date, 'YYYY-MM-DD'), 'days', true))) : 0;
  const occEnd = (d) => spanDays > 0 ? moment(d, 'YYYY-MM-DD').add(spanDays, 'day').format('YYYY-MM-DD') : d;

  if (!ev.repeat) {
    // An undone task from the past carries forward: it renders on TODAY, flagged overdue
    // (drawn red), instead of silently sinking into history. Events keep their date — only
    // tasks roll. Ticking it done pins its date to today (see toggleDone).
    const today = isoToday();
    if (ev.task && !ev.done && ev.date < today) {
      if (today >= fromIso && today <= toIso) {
        const inst = instance(ev, today);
        inst.overdue = true;
        out.push(inst);
      }
      return out;
    }
    // include if the (possibly multi-day) span intersects the window
    if (occEnd(ev.date) >= fromIso && ev.date <= toIso) out.push(instance(ev, ev.date));
    return out;
  }
  const skip = ev.skip && ev.skip.length ? new Set(ev.skip) : null; // deleted occurrences (EXDATE)
  if (ev.repeat.unit === 'weekdays') {
    // weekly on a chosen set of weekdays — every matching day on/after the event date in the window.
    // Reach back by the span (like the generic branch) so a multi-day all-day occurrence that begins
    // before the window but overlaps it is still emitted; occEnd() then keeps only real overlaps.
    const set = new Set(ev.repeat.days || []);
    const target = spanDays > 0 ? moment(fromIso, 'YYYY-MM-DD').subtract(spanDays, 'day').format('YYYY-MM-DD') : fromIso;
    const start = ev.date > target ? ev.date : target;
    let d = moment(start, 'YYYY-MM-DD');
    // Series end: no occurrence STARTS after until (a span may still overhang past it).
    const capIso = ev.repeat.until && ev.repeat.until < toIso ? ev.repeat.until : toIso;
    const end = moment(capIso, 'YYYY-MM-DD');
    let g = 0;
    while (d.isSameOrBefore(end) && g++ < 4000) {
      const iso = d.format('YYYY-MM-DD');
      if (iso >= ev.date && set.has(d.day()) && occEnd(iso) >= fromIso && !(skip && skip.has(iso))) {
        out.push(instance(ev, iso));
        if (limit && out.length >= limit) return out;
      }
      d.add(1, 'day');
    }
    return out;
  }
  // Pin the month/year day-of-month anchor from the base date so display agrees with the
  // completion roll-forward (an end-of-month rule stays end-of-month, doesn't drift to the 28th).
  let rep = ev.repeat;
  if ((rep.unit === 'month' || rep.unit === 'year') && typeof rep.day !== 'number') {
    const base = moment(ev.date, 'YYYY-MM-DD', true);
    if (base.isValid()) rep = Object.assign({}, rep, { day: base.date() });
  }
  // Reach back by the span so an occurrence that starts before the window but overlaps it is kept.
  const target = spanDays > 0 ? moment(fromIso, 'YYYY-MM-DD').subtract(spanDays, 'day').format('YYYY-MM-DD') : fromIso;
  let d = fastForward(ev.date, rep, target);
  const capIso = rep.until && rep.until < toIso ? rep.until : toIso; // series end (inclusive)
  let guard = 0;
  while (d <= capIso && guard++ < 4000) {
    if (occEnd(d) >= fromIso && !(skip && skip.has(d))) {
      out.push(instance(ev, d));
      if (limit && out.length >= limit) return out;
    }
    d = advanceDue(d, rep);
  }
  return out;
}

/* A multi-day all-day instance — drawn as one continuous bar, not as per-day chips. */
function isSpanItem(it) { return !!(it.allDay && it.endDate && it.endDate > it.date); }

/* The next occurrence after iso, honoring the event's skip list (deleted occurrences) —
 * completing a repeat must never roll it forward onto a date the user has deleted. */
function advancePastSkips(iso, rep, skipArr) {
  const skip = skipArr && skipArr.length ? new Set(skipArr) : null;
  let d = advanceDue(iso, rep);
  let g = 0;
  while (skip && skip.has(d) && g++ < 400) d = advanceDue(d, rep);
  return d;
}

function instance(ev, dateIso) {
  const span = (ev.endDate && !ev.start)
    ? Math.round(moment(ev.endDate, 'YYYY-MM-DD').diff(moment(ev.date, 'YYYY-MM-DD'), 'days', true)) : 0; // rounded — see expandInstances (DST)
  const endDate = span > 0 ? moment(dateIso, 'YYYY-MM-DD').add(span, 'day').format('YYYY-MM-DD') : null;
  return {
    instanceId: ev.id + '@' + dateIso,
    baseId: ev.id,
    title: ev.title,
    task: ev.task,
    date: dateIso,
    start: ev.start,
    end: ev.end,
    endDate,
    allDay: !ev.start,
    repeat: ev.repeat,
    note: ev.note,
    color: ev.color,
    // A repeating EVENT is completed per occurrence (doneDates) — the series itself stays put.
    // A repeating TASK still rolls its base date forward when ticked, so a live task series is
    // never done as a whole; a task series completed past its repeat END (until) does carry
    // done:true — its occurrences render struck-through and un-ticking one revives the series.
    done: ev.repeat
      ? (ev.done === true || !!(ev.doneDates && ev.doneDates.indexOf(dateIso) >= 0))
      : ev.done,
  };
}

/* Range of days a view needs fetched, as {from,to} ISO. */
function rangeForView(view, anchorM) {
  const a = moment(anchorM);
  if (view === 'day') return { from: a.format('YYYY-MM-DD'), to: a.format('YYYY-MM-DD') };
  if (view === 'week') {
    const start = weekStart(a);
    return { from: start.format('YYYY-MM-DD'), to: moment(start).add(6, 'day').format('YYYY-MM-DD') };
  }
  if (view === 'agenda') {
    return { from: moment(a).startOf('month').format('YYYY-MM-DD'), to: moment(a).endOf('month').format('YYYY-MM-DD') };
  }
  // month grid: 6 weeks starting at the fdow-aligned cell before the 1st
  const monthStart = moment(a).startOf('month');
  const gridStart = moment(monthStart).subtract((monthStart.day() - fdow() + 7) % 7, 'day');
  return { from: gridStart.format('YYYY-MM-DD'), to: moment(gridStart).add(41, 'day').format('YYYY-MM-DD') };
}

function weekStart(m) {
  const d = moment(m).startOf('day');
  return moment(d).subtract((d.day() - fdow() + 7) % 7, 'day');
}

function periodLabel(view, anchorM) {
  const a = moment(anchorM);
  if (view === 'day') return cap(a.format('dddd, D MMMM YYYY'));
  if (view === 'week') {
    const s = weekStart(a), e = moment(s).add(6, 'day');
    if (s.month() === e.month()) return cap(s.format('D')) + '–' + e.format('D MMMM YYYY');
    return cap(s.format('D MMM')) + ' – ' + cap(e.format('D MMM YYYY'));
  }
  return cap(a.format('MMMM YYYY'));
}

function navStep(view, anchorM, dir) {
  const a = moment(anchorM);
  if (view === 'day') return a.add(dir, 'day');
  if (view === 'week') return a.add(dir * 7, 'day');
  return a.add(dir, 'month'); // month + agenda
}

/* Greedy overlap layout for timed events in a single day column.
 * Returns each item decorated with {topPct, heightPct, leftPct, widthPct}. */
function layoutTimedEvents(items, dayStartMin, dayEndMin, defaultDur) {
  const range = Math.max(1, dayEndMin - dayStartMin);
  const evs = items.map((it) => {
    // segStart/segEnd exist on the two halves of an event that runs past midnight (bucketByDay);
    // start/end stay truthful there so the label still reads "23:00–02:00" on both halves.
    let s = timeToMin(it.segStart || it.start);
    if (s == null) s = dayStartMin;
    let e = segEndMin(it);
    if (e == null || e <= s) e = s + defaultDur;
    // Clamp into the visible working-hours window BEFORE laying out, so lane grouping, top and
    // height all agree. Otherwise an event starting before dayStart (or ending after dayEnd) pins
    // to the edge via the top-clamp but keeps its full duration for grouping — so it never joins
    // the lane of the events it visually overlaps and silently stacks on top of them.
    s = Math.max(dayStartMin, Math.min(s, dayEndMin - 1));
    e = Math.max(s + 1, Math.min(e, dayEndMin));
    return { it, s, e };
  }).sort((a, b) => a.s - b.s || a.e - b.e);

  let group = [];
  let groupEnd = -Infinity;
  const finalize = (g) => {
    const cols = g.reduce((mx, x) => Math.max(mx, x.lane + 1), 1);
    for (const x of g) {
      x.it._layout = {
        topPct: ((x.s - dayStartMin) / range) * 100, // x.s already clamped into the window
        heightPct: (Math.min(Math.max(x.e - x.s, 18), range) / range) * 100,
        leftPct: (x.lane / cols) * 100,
        widthPct: 100 / cols,
      };
    }
  };
  const laneEnds = [];
  for (const x of evs) {
    if (group.length && x.s >= groupEnd) { finalize(group); group = []; laneEnds.length = 0; groupEnd = -Infinity; }
    let lane = laneEnds.findIndex((end) => end <= x.s);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(x.e); } else { laneEnds[lane] = x.e; }
    x.lane = lane;
    group.push(x);
    groupEnd = Math.max(groupEnd, x.e);
  }
  if (group.length) finalize(group);
  return evs.map((x) => x.it);
}

/* What "delete the past" would do at a given cut-off, worked out WITHOUT doing it — the dialog
 * shows the numbers before anything is touched.
 *
 * A record counts as past only when it can no longer show up again:
 *  - an UNFINISHED task is never past. It carries forward to today (see expandInstances), so
 *    deleting it would silently drop a live to-do;
 *  - a repeat with no end, or an end still ahead, is still running — it stays whatever its
 *    start date says. Only a series that has finished (its `until` is behind the cut-off, or it
 *    was completed as a whole) goes;
 *  - a multi-day event is judged by the day it ENDS on, not the day it starts.
 * Series that stay still shed their ballast: the skip / doneDates entries behind the cut-off can
 * never matter again, and in one long-running series they are most of what the note is carrying.
 * Quarantined records are left alone — they have no usable date to judge, and the orphan dialog
 * is where they get sorted out. */
function purgePlan(events, beforeIso) {
  const drop = [];
  let ballast = 0;
  for (const ev of events || []) {
    if (!ev.date) continue;
    if (ev.repeat) {
      const until = ev.repeat.until || null;
      const finished = ev.done === true || (until && until < beforeIso);
      if (finished && ev.date < beforeIso) { drop.push(ev.id); continue; }
      for (const d of ev.skip || []) if (d < beforeIso) ballast++;
      for (const d of ev.doneDates || []) if (d < beforeIso) ballast++;
      continue;
    }
    if (ev.task && !ev.done) continue; // carried forward to today — never past
    if ((ev.endDate || ev.date) < beforeIso) drop.push(ev.id);
  }
  return { drop, ballast };
}

/* Per-block undo/redo of the calendar model (serialized snapshots). Keyed like VIEW_STATES —
 * a save triggers a block reprocess that replaces the renderer, so per-renderer stacks would
 * be wiped by the very change they were meant to revert. */
const UNDO_STACKS = new Map();
function undoState(key) {
  let u = UNDO_STACKS.get(key);
  if (!u) { u = { undo: [], redo: [] }; UNDO_STACKS.set(key, u); }
  return u;
}

/* Ephemeral per-block view state that survives re-renders but isn't written to disk. */
const VIEW_STATES = new Map();
function viewState(key) {
  let v = VIEW_STATES.get(key);
  if (!v) {
    v = { view: null, seeded: false, showCompleted: true, anchor: isoToday(), selItem: null, addDraft: '', focusAddUntil: 0 };
    VIEW_STATES.set(key, v);
  }
  return v;
}

/* ------------------------------------------------------------------ *
 * CalendarRenderer — one instance per rendered code block             *
 * ------------------------------------------------------------------ */
class CalendarRenderer {
  constructor(plugin, el, ctx, child, source) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.el = el;
    this.ctx = ctx;
    this.parseError = null;
    this._persistTimer = null;
    this._persistRetries = 0;
    this._dirty = false;
    this._activeDrags = new Set(); // cleanup fns for in-flight move/resize gestures (multi-touch safe)
    this._placeCleanup = null;     // document key handler while picking a placement day

    const trimmed = (source || '').trim();
    if (!trimmed) {
      this.model = normalizeCal({}, plugin.settings);
    } else {
      try {
        this.model = normalizeCal(JSON.parse(trimmed), plugin.settings);
      } catch (e) {
        this.parseError = e.message || String(e);
        this.rawSource = source;
      }
    }
    // Register as the live renderer for this block so a modal opened against an earlier
    // renderer (since destroyed by a reprocess) can re-resolve the current one at commit time.
    if (this.model) {
      this.plugin.liveRenderers.set(this.stateKey(), this);
      this.plugin.allRenderers.add(this); // full set (for cross-block calId de-dup within a note)
    }
    // Ctrl/Cmd+Z inside the calendar undoes the last calendar change (Shift+Z or Ctrl+Y = redo) —
    // no need to click out into the note. Text fields keep their native undo untouched.
    this.el.addEventListener('keydown', (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (e.code !== 'KeyZ' && e.code !== 'KeyY') return;
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea, [contenteditable="true"]')) return;
      const redo = e.code === 'KeyY' || e.shiftKey;
      if (redo ? this.redo() : this.undo()) { e.preventDefault(); e.stopPropagation(); }
    }, true);

    this._gridEl = null; // the keyboard-navigable grid of the current render (month/agenda)
    // Keep a long-open block honest: reposition the now-line every minute, and re-render
    // across midnight so the is-today decorations move to the new day (auto-cleared on unload).
    this._timeGridInfo = null;
    this._lastDay = isoToday();
    child.registerInterval(window.setInterval(() => this._minuteTick(), 60 * 1000));
  }

  /* Once a minute: move the now-line in week/day; across midnight, re-render every view. */
  _minuteTick() {
    if (this._destroyed || this.parseError || !this.model) return;
    const today = isoToday();
    if (today !== this._lastDay) {
      const v = this.view();
      if (v.pending || this._activeDrags.size) return; // don't yank an in-flight interaction; retry next tick
      // Someone reading "today" at 23:59 should still be on today at 00:01. Only follow the
      // clock if the selection WAS the old today — a deliberate jump to another day stays put.
      if (v.anchor === this._lastDay) { v.anchor = today; v.selItem = null; }
      this._lastDay = today;
      this.render();
      return;
    }
    const g = this._timeGridInfo;
    if (!g) return; // month/agenda have no now-line
    const line = this.el.querySelector('.dn-now-line');
    const col = g.cols.get(today);
    const nowMin = moment().hours() * 60 + moment().minutes();
    if (!col || nowMin < g.dayStartMin || nowMin > g.dayEndMin) { if (line) line.remove(); return; }
    (line || col.createDiv({ cls: 'dn-now-line' })).style.top =
      ((nowMin - g.dayStartMin) / (g.dayEndMin - g.dayStartMin)) * 100 + '%';
  }

  stateKey() { return this.model ? (this.ctx.sourcePath + '::' + this.model.calId) : 'broken'; }

  /* Which view is on screen, and whether completed items are shown. Both are UI state, not
   * content: they are seeded from the block (so an old note still opens the way it was left)
   * but from then on live in the plugin's own data.json. Writing them back into the note on
   * every switch meant that merely paging through months rewrote the file, bumped its mtime
   * and pushed it through sync — and forced a full block reprocess each time. */
  view() {
    const v = viewState(this.stateKey());
    if (!v.seeded) {
      v.seeded = true;
      const mem = this.plugin.recallViewState(this.stateKey());
      if (!v.view) v.view = mem.view || this.model.settings.view || 'month';
      v.showCompleted = (typeof mem.showCompleted === 'boolean')
        ? mem.showCompleted
        : this.model.settings.showCompleted !== false;
    }
    if (!v.view) v.view = this.model.settings.view || 'month';
    // Mobile shows only agenda + day. The coercion is EPHEMERAL, so opening the note on a
    // phone never clobbers the desktop choice.
    if (IS_MOBILE() && !MOBILE_VIEWS.includes(v.view)) v.view = 'agenda';
    return v;
  }

  showCompleted() { return this.view().showCompleted !== false; }

  setView(next) {
    const v = this.view();
    if (v.view === next) return;
    v.view = next;
    this.plugin.rememberViewState(this.stateKey(), { view: next });
    this.render();
  }

  setShowCompleted(on) {
    this.view().showCompleted = !!on;
    this.plugin.rememberViewState(this.stateKey(), { showCompleted: !!on });
    this.render(); // NOT mutate(): this is a filter, not an edit — it must not land in the undo stack
  }

  // Tear down every in-flight drag/resize gesture (a single shared slot would leak the earlier
  // gesture's document listeners when two pointers are active at once — see _activeDrags).
  abortDrags() {
    if (!this._activeDrags.size) return;
    const cs = Array.from(this._activeDrags);
    this._activeDrags.clear();
    for (const c of cs) { try { c(); } catch (e) { /* already gone */ } }
  }

  destroy() {
    this._destroyed = true; // stops _armPersist() re-arming a dead timer during the flush below
    if (this._persistTimer) clearTimeout(this._persistTimer);
    if (this._dirty) this.persist().catch((e) => console.error('MD Calendar: flush on teardown failed', e));
    this.abortDrags();
    if (this._placeCleanup) this._placeCleanup();
    if (this._paneObserver) { this._paneObserver.disconnect(); this._paneObserver = null; }
    this.plugin.allRenderers.delete(this);
    // After the delete above, so a sibling calendar in this note is the only thing that can
    // keep the note widened — a note that no longer renders one goes back to normal width.
    this._clearBleed(true);
    // Only drop the registry entry if it still points at us — a reprocess may have already
    // registered the replacement renderer under the same key.
    if (this.plugin.liveRenderers.get(this.stateKey()) === this) this.plugin.liveRenderers.delete(this.stateKey());
  }

  // A calId is meant to be unique per note. If the user copy-pastes an entire rendered block (its
  // JSON incl. the calId) within the same note, two blocks share a calId → identical stateKey →
  // the liveRenderers / VIEW_STATES maps and modal routing collide and edits land in the wrong
  // block. Deferred + guarded so it only fires on a POSITIVE duplicate signal (another live block,
  // same file, same calId, but a DIFFERENT line range — never a same-block reprocess).
  _dedupeCalId() {
    try {
      if (!this.model || this._destroyed) return;
      const mine = this.ctx.getSectionInfo(this.el);
      if (!mine) return; // geometry not resolvable yet — skip (no worse than before)
      for (const other of this.plugin.allRenderers) {
        if (other === this || other._destroyed || !other.model) continue;
        if (other.ctx.sourcePath !== this.ctx.sourcePath) continue;
        if (other.model.calId !== this.model.calId) continue;
        if (!other.el || !other.el.isConnected) continue;
        const oi = other.ctx.getSectionInfo(other.el);
        if (!oi || oi.lineStart === mine.lineStart) continue; // same position ⇒ reprocess, not a duplicate
        const oldKey = this.stateKey();
        if (this.plugin.liveRenderers.get(oldKey) === this) this.plugin.liveRenderers.delete(oldKey);
        this.model.calId = uid('c');
        this.plugin.liveRenderers.set(this.stateKey(), this);
        this.schedulePersist(); // write the fresh id back into this block
        this.render();
        return;
      }
    } catch (e) { /* best-effort de-dup */ }
  }

  /* ---- persistence (lifted from tasknote, fence renamed) ---- */
  schedulePersist() { this._persistRetries = 0; this._dirty = true; this._armPersist(); }
  _armPersist() {
    if (this._destroyed) return; // don't re-arm on a torn-down renderer (persist re-arms on transient misses)
    if (this._persistTimer) clearTimeout(this._persistTimer);
    this._persistTimer = setTimeout(() => {
      this._persistTimer = null;
      this.persist().catch((e) => console.error('MD Calendar: persist failed', e));
    }, 150);
  }

  async persist() {
    const file = this.app.vault.getAbstractFileByPath(this.ctx.sourcePath);
    if (!(file instanceof TFile)) return;
    const info = this.ctx.getSectionInfo(this.el);
    if (!info) {
      if (this._persistRetries++ < 20) this._armPersist();
      else console.warn('MD Calendar: could not locate the calendar block to save changes');
      return;
    }
    const json = serializeCal(this.model);
    const apply = (content) => {
      const lines = content.split('\n');
      const open = lines[info.lineStart] || '';
      const close = lines[info.lineEnd] || '';
      if (!DN_FENCE_OPEN.test(open) || !DN_FENCE_CLOSE.test(close)) {
        const err = new Error('MD Calendar: block geometry moved; skipping write');
        err.__staleGeometry = true;
        throw err;
      }
      const before = lines.slice(0, info.lineStart + 1);
      const after = lines.slice(info.lineEnd);
      return before.concat(json.split('\n'), after).join('\n');
    };
    try {
      if (typeof this.app.vault.process === 'function') await this.app.vault.process(file, apply);
      else { const content = await this.app.vault.read(file); await this.app.vault.modify(file, apply(content)); }
      this._persistRetries = 0;
      this._dirty = false;
    } catch (e) {
      if (e && e.__staleGeometry) {
        if (this._persistRetries++ < 20) this._armPersist();
        else console.warn('MD Calendar: could not re-locate the calendar block; a save was skipped to avoid corrupting the note');
        return;
      }
      throw e;
    }
  }

  /* Every model mutation flows through here — snapshot first, so Ctrl+Z can walk back. */
  mutate(fn) {
    const u = undoState(this.stateKey());
    u.undo.push(serializeCal(this.model));
    if (u.undo.length > 50) u.undo.shift();
    u.redo.length = 0;
    fn(this.model);
    this.render();
    this.schedulePersist();
  }

  undo() { const u = undoState(this.stateKey()); return this._restoreSnap(u.undo, u.redo); }
  redo() { const u = undoState(this.stateKey()); return this._restoreSnap(u.redo, u.undo); }
  _restoreSnap(from, to) {
    if (!from.length) return false;
    const snap = from.pop();
    let parsed;
    try { parsed = JSON.parse(snap); } catch (e) { return false; }
    to.push(serializeCal(this.model));
    this.model = normalizeCal(parsed, this.plugin.settings);
    this.render();
    this.schedulePersist();
    return true;
  }

  /* Header button: delete every completed item. No confirmation — undo restores them. */
  clearDone() {
    const n = this.model.events.filter((ev) => ev.done).length;
    if (!n) { new Notice(t('noDoneToClear')); return; }
    this.mutate((m) => { m.events = m.events.filter((ev) => !ev.done); });
    returnFocusToGrid(this);
    this.offerUndo(t('clearedDone', n));
  }

  openPurge() {
    if (this.view().pending) return; // placement mode owns the flow
    new PurgeModal(this.app, this).open();
  }

  /* Carry out the plan above. One mutate, so Ctrl+Z brings the whole sweep back. */
  purgePast(beforeIso) {
    const plan = purgePlan(this.model.events, beforeIso);
    if (!plan.drop.length && !plan.ballast) { new Notice(t('purgeNothing')); return; }
    const dropSet = new Set(plan.drop);
    this.mutate((m) => {
      m.events = m.events.filter((ev) => !dropSet.has(ev.id));
      for (const ev of m.events) {
        if (!ev.repeat) continue;
        if (ev.skip) { ev.skip = ev.skip.filter((d) => d >= beforeIso); if (!ev.skip.length) ev.skip = null; }
        if (ev.doneDates) { ev.doneDates = ev.doneDates.filter((d) => d >= beforeIso); if (!ev.doneDates.length) ev.doneDates = null; }
      }
      m.events.forEach((x, i) => { x.order = i; });
    });
    returnFocusToGrid(this);
    this.offerUndo(t('purgeDone', plan.drop.length + ' ' + plural(plan.drop.length, 'rec')));
  }

  /* ---- data ---- */
  itemsInRange(fromIso, toIso) {
    // Reach one day further back than asked: an event running past midnight has a tail that
    // belongs to the FIRST visible day, and bucketByDay can only cut that tail off if the head
    // was fetched. Anything else picked up out there is clipped away by bucketByDay's window.
    const fetchFrom = moment(fromIso, 'YYYY-MM-DD').subtract(1, 'day').format('YYYY-MM-DD');
    let items = [];
    for (const ev of this.model.events) {
      for (const inst of expandInstances(ev, fetchFrom, toIso)) items.push(inst);
    }
    if (!this.showCompleted()) items = items.filter((it) => !it.done);
    return items;
  }

  /* Bucket items by ISO day (multi-day all-day items land on each covered day; an event that
   * runs past midnight is cut into a head and a tail, one per day). */
  bucketByDay(items, fromIso, toIso) {
    const map = new Map();
    const push = (iso, it) => {
      if (iso < fromIso || iso > toIso) return;
      if (!map.has(iso)) map.set(iso, []);
      map.get(iso).push(it);
    };
    for (const it of items) {
      if (it.allDay && it.endDate && it.endDate > it.date) {
        // Walk only the visible slice of the span; the window is at most 42 days so this
        // is naturally bounded (a huge hand-edited span can't run away here).
        const spanStart = it.date < fromIso ? fromIso : it.date;
        const spanEnd = it.endDate > toIso ? toIso : it.endDate;
        let d = moment(spanStart, 'YYYY-MM-DD');
        const end = moment(spanEnd, 'YYYY-MM-DD');
        while (d.isSameOrBefore(end)) { push(d.format('YYYY-MM-DD'), it); d.add(1, 'day'); }
      } else if (crossesMidnight(it)) {
        // Two display halves of ONE occurrence. Both keep the real date/start/end (so the label,
        // the context menu and per-occurrence actions all still address the true occurrence);
        // only the drawn segment differs, via segStart/segEnd.
        push(it.date, Object.assign({}, it, { spill: 'head', segStart: it.start, segEnd: '23:59' }));
        const tailIso = moment(it.date, 'YYYY-MM-DD').add(1, 'day').format('YYYY-MM-DD');
        push(tailIso, Object.assign({}, it, { spill: 'tail', segStart: '00:00', segEnd: it.end }));
      } else {
        push(it.date, it);
      }
    }
    for (const arr of map.values()) arr.sort(cmpItems);
    return map;
  }

  /* Full-bleed. Obsidian's "readable line width" is right for a paragraph and wrong for a grid:
   * it leaves half the pane empty on both sides and the calendar ends wherever its content does.
   * Rather than guess at the DOM, tag EVERY ancestor between the block and the pane — the width
   * clamps live on .cm-sizer / .cm-content in Live Preview and .markdown-preview-sizer in reading
   * view, and this lets all of them give way at once whatever the structure — then hand the block
   * the pane's remaining height as --dn-fill. */
  _applyFullBleed(tries) {
    if (this._destroyed) return;
    const on = this.plugin.fullBleedOn() && !this.parseError;
    this._clearBleed();
    this.el.toggleClass('is-full', on);
    if (!on) { this.el.style.removeProperty('--dn-fill'); return; }
    const pane = this.el.closest('.view-content');
    if (!pane) {
      // The first render runs while the block is still being assembled, before it is in the
      // document — there is no pane to measure against yet. Come back when there is, otherwise
      // the note would stay clamped until something else forced a redraw.
      if ((tries || 0) < 30) window.requestAnimationFrame(() => this._applyFullBleed((tries || 0) + 1));
      return;
    }
    for (let n = this.el.parentElement; n && n !== pane; n = n.parentElement) {
      n.addClass('dn-bleed');
      this._bleedNodes.push(n);
    }
    // The pane resizes on window resize, a sidebar toggle, a split — recompute rather than
    // pinning a height that was true once.
    if (!this._paneObserver && typeof ResizeObserver === 'function') {
      this._paneObserver = new ResizeObserver(() => this._fillHeight(pane, 0));
      this._paneObserver.observe(pane);
    }
    this._fillHeight(pane, 0);
  }

  /* Drop the tags again. Another calendar in the SAME note may still want them, so leave them
   * alone if one is live — otherwise closing one block would un-widen the other. */
  _clearBleed(final) {
    const nodes = this._bleedNodes || [];
    this._bleedNodes = [];
    if (final && this._sharesNoteWithLiveCalendar()) return;
    for (const n of nodes) { n.removeClass('dn-bleed'); n.removeClass('dn-owns-pane'); }
  }

  _sharesNoteWithLiveCalendar() {
    for (const other of this.plugin.allRenderers) {
      if (other !== this && !other._destroyed && other.model && other.el && other.el.isConnected
        && other.ctx.sourcePath === this.ctx.sourcePath) return true;
    }
    return false;
  }

  /* Fit the block to the pane exactly: the note must not scroll, and no strip of dead space may
   * be left under the calendar.
   *
   * Everything here is read off element boxes. The obvious reading — scrollHeight minus
   * clientHeight — is unusable twice over. It is stale: CodeMirror keeps its own height map for
   * the note and will not re-measure a block widget in the same frame, so shrinking by what it
   * reports and reading again subtracts the same figure twice, which is what chopped the
   * calendar in half. And it can never show slack: .cm-sizer carries min-height:100%, so the
   * content is padded out to the viewport and a block that is too SHORT measures exactly like
   * one that fits. The distance from the bottom of the block's own margin box to the inside
   * bottom of the scroller is visible in both directions and lands in one step. */
  _fillHeight(pane, tries) {
    if (this._destroyed || !this.el.isConnected) return;
    // The scrolling box is .cm-scroller while editing and .markdown-preview-view when reading.
    const scroller = this.el.closest('.cm-scroller, .markdown-preview-view');
    const sr = scroller && scroller.getBoundingClientRect();
    // First render runs before the block is in the document — come back when there is a box.
    if (!sr || !sr.height) { if ((tries || 0) < 30) window.requestAnimationFrame(() => this._fillHeight(pane, (tries || 0) + 1)); return; }
    this._settleFill(scroller, 0);
  }

  /* One step of the fit, repeated only while it still moves. Growing the block reflows what is
   * inside it, so the second reading can differ from the first; three passes are plenty and the
   * "already there" test below stops it dead when the block refuses to shrink any further
   * (a month grid has six rows of minimum height and will not go below them). */
  _settleFill(scroller, pass) {
    if (this._destroyed || !this.el.isConnected) return;
    const cs = getComputedStyle(scroller);
    const sr = scroller.getBoundingClientRect();
    // Inside bottom edge of the scroller: its box, less its border and its own bottom padding.
    const inner = sr.bottom - (parseFloat(cs.borderBottomWidth) || 0) - (parseFloat(cs.paddingBottom) || 0);
    // Measure the outermost wrapper, not the calendar itself: Obsidian puts the rendered block
    // inside a container of its own, and that container's bottom margin is below the calendar.
    const top = this._blockTop();
    const tr = top.getBoundingClientRect();
    const foot = parseFloat(getComputedStyle(top).marginBottom) || 0;
    const after = this._afterBlock(top);
    // With nothing after the calendar, nothing in the note can be out of reach — so hide the
    // pane's scrollbar instead of leaving one standing for the last pixel of editor chrome.
    // With something after it, the bar stays: it is the only way down to that text.
    const alone = this._nothingFollows();
    scroller.toggleClass('dn-owns-pane', alone === null ? after === 0 : alone);
    const delta = Math.round(inner - (tr.bottom + foot) - after);
    if (Math.abs(delta) <= 1) return;
    const next = Math.max(MIN_FILL, Math.round(this.el.getBoundingClientRect().height + delta));
    if (next === Math.round(parseFloat(this.el.style.getPropertyValue('--dn-fill')) || 0)) return;
    this.el.style.setProperty('--dn-fill', next + 'px');
    if (pass < 3) window.requestAnimationFrame(() => this._settleFill(scroller, pass + 1));
  }

  /* The block as the note's flow sees it: walk out to whatever sits directly in the note's own
   * content element. Anything above that is the editor, not the note. */
  _blockTop() {
    let n = this.el;
    for (let i = 0; i < 12 && n.parentElement; i++) {
      const c = n.parentElement.className || '';
      if (/cm-content|markdown-preview-sizer/.test(c)) return n;
      n = n.parentElement;
    }
    return this.el;
  }

  /* Whatever the note still puts after the calendar. The block may take the pane's height, but
   * not at the cost of sitting on top of a paragraph written below it.
   *
   * CodeMirror parks scaffolding of its own around a block widget — zero-width buffer images,
   * measuring stubs — and those are siblings too. They are not the note, so anything without
   * real height is skipped; counting them made the calendar a few pixels short. */
  _afterBlock(top) {
    let after = 0;
    for (let s = top.nextElementSibling; s; s = s.nextElementSibling) {
      if (s.classList && s.classList.contains('cm-widgetBuffer')) continue;
      const h = s.getBoundingClientRect().height;
      if (h >= 2) after += h;
    }
    return after;
  }

  /* Is the calendar the last thing in the note? Asked of the note's own text rather than of the
   * DOM: the editor's scaffolding sits in the element tree beside the block and is impossible to
   * tell from content by looking at boxes. null when the answer isn't available — during a
   * reflow the block's position in the file may be momentarily unknown — and the caller then
   * falls back on measuring. */
  _nothingFollows() {
    try {
      const info = this.ctx.getSectionInfo && this.ctx.getSectionInfo(this.el);
      if (!info) return null;
      const lines = String(info.text || '').split('\n');
      for (let i = info.lineEnd + 1; i < lines.length; i++) if (lines[i].trim()) return false;
      return true;
    } catch (e) {
      return null;
    }
  }

  /* ---- top-level render ---- */
  render() {
    this._applyFullBleed();
    if (this.parseError) return this.renderError();
    // Tear down any in-flight drag / placement-key listener first: el.empty() below detaches
    // their DOM but leaves the document-level listeners bound to dead nodes.
    this.abortDrags();
    if (this._placeCleanup) this._placeCleanup();
    const v = this.view();
    // Keyboard nav: if focus sat on the grid about to be destroyed, put it back afterwards.
    const hadGridFocus = this._gridEl && document.activeElement === this._gridEl;
    this._gridEl = null;
    this.el.empty();
    this._timeGridInfo = null; // stale col refs die with el.empty(); renderTimeGrid rebuilds
    this._daySel = [];         // rebuilt by registerSelectable as the views draw the anchor day
    this.el.addClass('md-calendar');
    this.el.toggleClass('dn-placing', !!v.pending); // placement mode: pick a day/slot to drop
    this.buildHeader(this.el);
    const body = this.el.createDiv({ cls: 'dn-body dn-view-' + v.view });
    try {
      if (v.view === 'month') this.renderMonth(body);
      else if (v.view === 'agenda') this.renderAgenda(body);
      else this.renderTimeGrid(body, v.view === 'day' ? [moment(v.anchor, 'YYYY-MM-DD')] : weekDayList(v.anchor));
    } catch (e) {
      console.error('MD Calendar: view render failed', e);
      body.createDiv({ cls: 'dn-empty', text: 'MD Calendar: ' + (e.message || e) });
    }

    // Mark the keyboard-selected item. The index is clamped here rather than at every
    // mutation site: deleting or completing an item can shorten the day's list under it.
    if (typeof v.selItem === 'number') {
      if (v.selItem >= this._daySel.length) v.selItem = this._daySel.length ? this._daySel.length - 1 : null;
      const row = this._daySel[v.selItem];
      if (row && row.el) row.el.addClass('is-item-sel');
      else v.selItem = null;
    }

    if (!v.pending && hadGridFocus && this._gridEl) this._gridEl.focus({ preventScroll: true });

    // While picking the placement day, arrow keys drive the cursor over the calendar itself. Keep
    // keyboard focus anchored inside this calendar (desktop) so the scoped key handler fires and we
    // don't have to swallow app-wide keys off document.body. (Mobile places by tap, no arrow nav.)
    if (v.pending && !v.pending.timing) {
      this.armPlaceKeys();
      if (this.addInput && !IS_MOBILE()) this.addInput.focus({ preventScroll: true });
    }

    if (this.addInput && v.focusAddUntil && Date.now() < v.focusAddUntil) {
      const ae = document.activeElement;
      if (!ae || ae === document.body || this.el.contains(ae)) this.addInput.focus();
    }

    // One-shot: if this block shares a calId with another block in the SAME note (a pasted
    // duplicate), give it a fresh identity so their view state / edit routing don't collide.
    // Deferred so getSectionInfo resolves and any same-block reprocess has settled.
    if (!this._dedupeScheduled) { this._dedupeScheduled = true; setTimeout(() => this._dedupeCalId(), 60); }

    // One-shot: a dedicated calendar note takes keyboard focus on open, selection on today —
    // arrows work immediately. Deferred so getSectionInfo (the dedicated-note check) resolves.
    if (!this._autoFocusScheduled) { this._autoFocusScheduled = true; setTimeout(() => this._autoFocusGrid(), 60); }
  }

  renderError() {
    this.el.empty();
    this.el.addClass('md-calendar', 'dn-error');
    this.el.createDiv({ cls: 'dn-error-msg', text: t('badJson') });
    this.el.createEl('pre', { cls: 'dn-error-raw', text: (this.rawSource || '').slice(0, 600) });
    const btn = this.el.createEl('button', { cls: 'dn-btn dn-danger', text: t('repair') });
    btn.onclick = () => {
      new ConfirmModal(this.app, t('repairConfirm'), () => {
        this.parseError = null;
        this.model = normalizeCal({}, this.plugin.settings);
        this.render();
        this.schedulePersist();
      }, t('repair')).open();
    };
  }

  /* ---- header: nav + view switcher + toggles + add bar ---- */
  buildHeader(root) {
    const v = this.view();
    const head = root.createDiv({ cls: 'dn-header' });

    // Optional calendar title from the block JSON. Rendered as its own full-width line above
    // the controls, and editable by clicking it (the pencil in the right cluster is the way in
    // when there is no title yet — it used to be settable only by hand-editing the JSON).
    if (this.model.title) {
      const titleEl = head.createDiv({ cls: 'dn-title', text: this.model.title, attr: { role: 'button', tabindex: '0', 'aria-label': t('calTitle') } });
      titleEl.addEventListener('click', () => this.openTitleEdit());
      titleEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.openTitleEdit(); } });
    }

    // The period label is its own full-width line ABOVE the controls: its width varies
    // wildly between views («Июль 2026» vs «29 Июня – 5 Июля 2026»), so anything sharing
    // its row would jump on every view switch — and the block's top-right corner stays
    // free for Obsidian's own edit-block button.
    const periodEl = head.createDiv({ cls: 'dn-period', text: periodLabel(v.view, moment(v.anchor, 'YYYY-MM-DD')), attr: { role: 'button', tabindex: '0', 'aria-label': t('goToDate') } });
    periodEl.addEventListener('click', () => this.openGoToDate());
    periodEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.openGoToDate(); } });

    const nav = head.createDiv({ cls: 'dn-nav' });
    this.iconBtn(nav, 'chevron-left', t('prev'), () => { v.anchor = navStep(v.view, moment(v.anchor, 'YYYY-MM-DD'), -1).format('YYYY-MM-DD'); this.render(); });
    const todayBtn = nav.createEl('button', { cls: 'dn-today', text: t('today') });
    todayBtn.addEventListener('click', () => this.goToday());
    this.iconBtn(nav, 'chevron-right', t('next'), () => { v.anchor = navStep(v.view, moment(v.anchor, 'YYYY-MM-DD'), 1).format('YYYY-MM-DD'); this.render(); });

    // A sibling of .dn-nav, not nested inside .dn-head-right: on a narrow pane the two need to
    // share the first wrapped row while the icon buttons below follow together on a row of
    // their own — see the container query, which pins .dn-head-right to a fresh line and
    // leaves this one free to sit next to .dn-nav.
    const seg = head.createDiv({ cls: 'dn-views' });
    for (const view of (IS_MOBILE() ? MOBILE_VIEWS : VIEW_CYCLE)) {
      const b = seg.createEl('button', { cls: 'dn-seg-btn' + (v.view === view ? ' is-on' : ''), text: t('v_' + view) });
      b.addEventListener('click', () => this.setView(view));
    }

    const right = head.createDiv({ cls: 'dn-head-right' });
    this.iconBtn(right, 'search', t('search'), () => this.openSearch());
    this.iconBtn(right, 'clipboard-copy', t('copyPeriod'), () => this.copyPeriod());
    this.iconBtn(right, 'pencil', t('calTitle'), () => this.openTitleEdit());
    const showDone = this.showCompleted();
    this.iconBtn(right, showDone ? 'eye' : 'eye-off', showDone ? t('hideCompleted') : t('showCompleted'),
      () => this.setShowCompleted(!showDone), showDone);
    this.iconBtn(right, 'trash-2', t('clearDone'), () => this.clearDone());
    this.iconBtn(right, 'archive', t('purge'), () => this.openPurge());

    this.buildAddBar(head);

    // Quarantined records (no usable date) — they are still in the block, just not placeable.
    // Say so out loud rather than letting them sit invisible forever.
    const orphans = this.model.orphans || [];
    if (orphans.length) {
      const strip = head.createDiv({ cls: 'dn-orphan-strip' });
      setIcon(strip.createSpan({ cls: 'dn-orphan-ic' }), 'alert-triangle');
      strip.createSpan({ cls: 'dn-orphan-text', text: t('orphanWarn', orphans.length) });
      const btn = strip.createEl('button', { cls: 'dn-btn dn-orphan-btn', text: t('orphanBtn') });
      btn.addEventListener('click', () => new OrphanModal(this.app, this).open());
    }
  }

  /* Give a quarantined record a date: it leaves model.orphans and becomes a normal event. */
  adoptOrphan(key, iso) {
    this.mutate((m) => {
      const idx = (m.orphans || []).findIndex((o) => JSON.stringify(o) === key);
      if (idx < 0 || !iso) return;
      const raw = m.orphans[idx];
      m.orphans.splice(idx, 1);
      m.events.push(normalizeEvent(Object.assign({}, raw, { date: iso }), m.events.length));
      m.events.forEach((x, i) => { x.order = i; });
    });
  }

  dropOrphan(key) {
    this.mutate((m) => {
      const idx = (m.orphans || []).findIndex((o) => JSON.stringify(o) === key);
      if (idx >= 0) m.orphans.splice(idx, 1);
    });
  }

  iconBtn(parent, icon, label, onClick, on) {
    const btn = parent.createSpan({ cls: 'dn-icon-btn' + (on ? ' is-on' : ''), attr: { 'aria-label': label, role: 'button', tabindex: '0' } });
    setIcon(btn, icon);
    btn.addEventListener('click', onClick);
    btn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e); } });
    return btn;
  }

  buildAddBar(root) {
    const v = this.view();
    const wrap = root.createDiv({ cls: 'dn-addbar' });
    const row = wrap.createDiv({ cls: 'dn-add-row' });
    setIcon(row.createSpan({ cls: 'dn-add-plus' }), 'plus');
    this.addInput = row.createEl('input', {
      cls: 'dn-add-input',
      attr: { type: 'text', placeholder: t('addPlaceholder'), value: v.addDraft || '' },
    });
    this.addInput.addEventListener('input', () => { v.addDraft = this.addInput.value; });
    this.addInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && v.pending) { e.preventDefault(); v.pending = null; this.render(); return; }
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const text = this.addInput.value.trim();
      if (!text) { this.addInput.value = ''; v.addDraft = ''; return; }
      v.addDraft = '';
      this.addInput.value = '';
      // Ctrl/Cmd+Enter, or a leading "- " / "[] " marker, makes it a task (a no-time to-do).
      const taskMark = text.match(/^(?:[-*]|\[[ xX]?\])\s+/);
      const isTask = !!taskMark || e.ctrlKey || e.metaKey;
      const body = taskMark ? text.slice(taskMark[0].length) : text;
      // The text is the TITLE, verbatim — no date/time parsing magic (it guessed wrong more
      // than it helped). One predictable flow: placement mode — pick the day in the calendar
      // (click or arrows + Enter), then the time. Held as view state; nothing written until placed.
      const seed = v.anchor || isoToday();
      v.pending = { title: body, start: null, repeat: null, cursor: seed, dom: moment(seed, 'YYYY-MM-DD').date(), timing: false, task: isTask };
      this.render();
    });
    const hint = row.createSpan({ cls: 'dn-add-help', attr: { 'aria-label': t('addHint'), role: 'button', tabindex: '0' } });
    setIcon(hint, 'help-circle');
    const toggleHint = () => {
      const existing = wrap.querySelector('.dn-add-hint');
      if (existing) existing.remove();
      else wrap.createDiv({ cls: 'dn-add-hint', text: t('addHint') });
      if (this.addInput) this.addInput.focus();
    };
    hint.addEventListener('click', toggleHint);
    hint.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleHint(); } });

    // Placement-mode banner. Two phases: pick the day (arrows/click), then enter the time.
    if (v.pending) {
      const p = v.pending;
      const place = wrap.createDiv({ cls: 'dn-place' });
      if (!p.timing) {
        setIcon(place.createSpan({ cls: 'dn-place-ic' }), 'mouse-pointer-click');
        place.createSpan({ cls: 'dn-place-text', text: t('placeHint', p.title || '…') });
      } else {
        setIcon(place.createSpan({ cls: 'dn-place-ic' }), 'clock');
        place.createSpan({ cls: 'dn-place-text', text: t('placeTimeHint', cap(moment(p.cursor, 'YYYY-MM-DD').format('D MMM'))) });
        const timeInput = place.createEl('input', { cls: 'dn-in dn-place-time', attr: { type: 'text', inputmode: 'numeric', placeholder: t('timePlaceholder'), value: p.start || '' } });
        setTimeout(() => { timeInput.focus(); const L = timeInput.value.length; timeInput.setSelectionRange(L, L); }, 0);
        timeInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const val = timeInput.value.trim();
            if (val && !parseTimeRange(val)) return; // invalid — let them fix it
            const r = val ? parseTimeRange(val) : null; // "15-18" → start + end; empty = all-day
            this.commitPlace(r ? r.start : null, r ? r.end : null);
          } else if (e.key === 'Escape') { e.preventDefault(); p.timing = false; this.render(); } // back to day nav
        });
      }
      const x = place.createSpan({ cls: 'dn-place-x', attr: { role: 'button', 'aria-label': t('placeCancel'), tabindex: '0' } });
      setIcon(x, 'x');
      const cancel = () => { this.view().pending = null; this.render(); };
      x.addEventListener('click', cancel);
      x.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cancel(); } });
    }
  }

  /* ---- placement mode: keyboard + click ---- */
  /* A click on a day/slot: pick the day (+ time from an hour slot) and go straight to the time step
   * so it matches the keyboard flow. An explicit slot time skips the time prompt and commits. */
  placePending(dateIso, startOverride) {
    const v = this.view();
    const p = v.pending;
    if (!p) return false;
    p.cursor = dateIso;
    if (p.task) { this.commitPlace(null); return true; } // a task has no time — drop it on the day
    if (startOverride) { this.commitPlace(startOverride); return true; } // hour slot → time is known
    p.timing = true; // month/all-day/agenda click → ask for the time next
    this.render();
    return true;
  }

  movePlaceCursor(days) {
    const v = this.view();
    if (!v.pending) return;
    const next = moment(v.pending.cursor || v.anchor || isoToday(), 'YYYY-MM-DD').add(days, 'day').format('YYYY-MM-DD');
    v.pending.cursor = next;
    v.pending.dom = moment(next, 'YYYY-MM-DD').date(); // remember the intended day-of-month for month paging
    const r = rangeForView(v.view, moment(v.anchor, 'YYYY-MM-DD'));
    if (next < r.from || next > r.to) v.anchor = next; // keep the cursor visible
    this.render();
  }

  shiftPlaceMonth(months) {
    const v = this.view();
    if (!v.pending) return;
    const cur = moment(v.pending.cursor || v.anchor || isoToday(), 'YYYY-MM-DD');
    const dom = v.pending.dom || cur.date(); // the day-of-month the user wants to hold across months
    const m = cur.date(1).add(months, 'month');
    m.date(Math.min(dom, m.daysInMonth())); // clamp to short months, but restore e.g. the 31st later
    const next = m.format('YYYY-MM-DD');
    v.pending.cursor = next;
    v.anchor = next;
    this.render();
  }

  pickPlaceDay(seedDigit) {
    const v = this.view();
    if (!v.pending) return;
    if (!v.pending.cursor) v.pending.cursor = v.anchor || isoToday();
    if (v.pending.task) { this.commitPlace(null); return; } // task: no time step, add on the chosen day
    if (seedDigit) v.pending.start = seedDigit; // typed a digit on the grid → seed the time box
    v.pending.timing = true;
    this.render();
  }

  commitPlace(start, end) {
    const v = this.view();
    const p = v.pending;
    if (!p) return;
    v.pending = null;
    v.focusAddUntil = Date.now() + 600;
    this.addEvent({ title: p.title, date: p.cursor || v.anchor || isoToday(), start: p.task ? null : (start || null), end: p.task ? null : (end || null), repeat: p.repeat, task: p.task });
  }

  /* Document-level key nav while picking the day (the add input is kept focused as the anchor). */
  armPlaceKeys() {
    // Take over: only ONE calendar owns keyboard placement at a time. Without this, two blocks
    // both in the day-picking phase would each catch the same keypress (both move at once).
    const prev = this.plugin.activePlacement;
    if (prev && prev !== this && prev._placeCleanup) {
      prev._placeCleanup();
      // The losing calendar keeps its placement banner but no longer owns the keyboard; clear its
      // pending state so it visibly exits placement mode instead of looking interactive but dead.
      try { const pv = prev.view(); if (pv.pending) { pv.pending = null; prev.render(); } } catch (e) { /* prev gone */ }
    }
    this.plugin.activePlacement = this;
    const onKey = (e) => {
      const v = this.view();
      if (!v.pending || v.pending.timing || this.plugin.activePlacement !== this) return;
      const ae = document.activeElement;
      if (!this.el.contains(ae)) return; // only when focus is inside THIS calendar — never hijack app-wide keys
      const handle = (fn) => { e.preventDefault(); e.stopPropagation(); fn(); };
      switch (e.key) {
        case 'ArrowLeft': handle(() => this.movePlaceCursor(-1)); break;
        case 'ArrowRight': handle(() => this.movePlaceCursor(1)); break;
        case 'ArrowUp': handle(() => this.movePlaceCursor(-7)); break;
        case 'ArrowDown': handle(() => this.movePlaceCursor(7)); break;
        case 'PageUp': handle(() => this.shiftPlaceMonth(e.shiftKey ? -12 : -1)); break;
        case 'PageDown': handle(() => this.shiftPlaceMonth(e.shiftKey ? 12 : 1)); break;
        case 'Enter': handle(() => this.pickPlaceDay()); break;
        case ' ':
          // Space drops on the day too — unless the user is composing text in the add bar.
          if (ae === this.addInput && this.addInput && this.addInput.value) return;
          handle(() => this.pickPlaceDay());
          break;
        case 'Escape': handle(() => { this.view().pending = null; this.render(); }); break;
        default:
          if (/^[0-9]$/.test(e.key)) handle(() => this.pickPlaceDay(e.key));
          break;
      }
    };
    document.addEventListener('keydown', onKey, true);
    this._placeCleanup = () => {
      document.removeEventListener('keydown', onKey, true);
      this._placeCleanup = null;
      if (this.plugin.activePlacement === this) this.plugin.activePlacement = null;
    };
  }

  /* ---- grid keyboard navigation (month + agenda, outside placement mode) ---- */
  /* The grid itself is the focus target (tabindex), so the handler is scoped to it — no
   * document-level listeners, and a keypress in the note editor never reaches us. The
   * selection IS v.anchor: agenda already renders it (the day panel), month highlights
   * it only while the grid owns focus. */
  armGridKeys(grid, role) {
    this._gridEl = grid;
    grid.setAttribute('tabindex', '0');
    // Only the month grid is a real row/cell table. The agenda's 42 cells have no row
    // wrappers and the time grid isn't tabular at all — claiming role="grid" there made a
    // screen reader announce a table with no rows in it.
    grid.setAttribute('role', role || 'group');
    grid.setAttribute('aria-label', t('gridNav'));
    grid.addEventListener('keydown', (e) => {
      const v = this.view();
      if (v.pending) return; // placement mode owns the keyboard (armPlaceKeys)
      if (e.ctrlKey || e.metaKey || e.altKey) return; // don't shadow app shortcuts
      // Letters match by PHYSICAL key (e.code) so WASD/Q/E/T work in the ru layout too.
      const code = e.code || '';
      const k = e.key;
      // In the week/day time grid the selection is 2D: A/D (←/→) picks the day,
      // W/S (↑/↓) walks the all-day band and the hour slots. Elsewhere ↑/↓ = ±week.
      const timeGrid = v.view === 'week' || v.view === 'day';
      // Tab steps INTO the selected day's items; with one picked, Enter/Space/Delete act on
      // it instead of on the day. Without this the grid could only walk days and create —
      // editing or deleting anything needed the mouse.
      const item = this.selectedItem();
      let handled = true;
      if (k === 'Tab') handled = this.selectItem(e.shiftKey ? -1 : 1);
      // With an item picked, Shift+arrow moves the ITEM rather than the day cursor — the
      // keyboard's answer to dragging. Checked before the plain arrows below, which would
      // otherwise walk the selection away from the item being moved.
      else if (item && e.shiftKey && (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown')) {
        this.nudgeItem(item, k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : 0, k === 'ArrowUp' ? -1 : k === 'ArrowDown' ? 1 : 0);
      } else if (item && /^[1-7]$/.test(k)) {
        // Digits recolor the picked item, in the swatch order of the editor (1 = the accent).
        const key = COLOR_KEYS[Number(k) - 1];
        this.setEventColor(item, key === 'default' ? null : key);
        this._reselect(item.baseId);
      } else if (k === 'ArrowLeft' || code === 'KeyA') this.moveSelection(-1);
      else if (k === 'ArrowRight' || code === 'KeyD') this.moveSelection(1);
      else if (k === 'ArrowUp' || code === 'KeyW') { if (timeGrid) this.moveSelSlot(-1); else this.moveSelection(-7); }
      else if (k === 'ArrowDown' || code === 'KeyS') { if (timeGrid) this.moveSelSlot(1); else this.moveSelection(7); }
      else if (code === 'KeyQ') this.switchView(-1);
      else if (code === 'KeyE') this.switchView(1);
      else if (k === 'PageUp') this.shiftSelectionMonth(e.shiftKey ? -12 : -1);
      else if (k === 'PageDown') this.shiftSelectionMonth(e.shiftKey ? 12 : 1);
      else if (k === 'Home' || k === 'End') {
        const ws = weekStart(moment(v.anchor, 'YYYY-MM-DD'));
        v.anchor = (k === 'Home' ? ws : ws.add(6, 'day')).format('YYYY-MM-DD');
        v.selDom = moment(v.anchor, 'YYYY-MM-DD').date();
        v.selItem = null;
        this.render();
      } else if (k === 'Enter') {
        if (item) this.onItemClick(item);
        else this.openQuickCreate(v.anchor, this._slotStart() || undefined);
      } else if (k === ' ') {
        if (item) this.toggleDone(item);
        else this.openQuickCreate(v.anchor, this._slotStart() || undefined);
      } else if (k === 'Delete' || k === 'Backspace') {
        if (item) this.deleteEvent(item); else handled = false;
      } else if (code === 'KeyM' || k === 'ContextMenu') {
        if (item) this.openItemMenuAtSelection(); else handled = false;
      } else if (code === 'KeyT') this.goToday();
      else if (code === 'KeyG') this.openGoToDate();
      else if (code === 'KeyF') this.openSearch();
      else if (code === 'KeyC') this.copyPeriod();
      else if (k === 'Escape') {
        // Step out of the item selection first; only a second Escape leaves the grid.
        if (item) { v.selItem = null; this.render(); } else grid.blur();
      } else handled = false;
      if (handled) { e.preventDefault(); e.stopPropagation(); }
    });
  }

  /* The hour under the week/day slot cursor, as quick-create options. */
  _slotStart() {
    const v = this.view();
    const timeGrid = v.view === 'week' || v.view === 'day';
    if (!timeGrid || typeof v.selSlot !== 'number') return null;
    return { start: String(v.selSlot).padStart(2, '0') + ':00' };
  }

  /* Items of the selected day, in the order they are drawn — the Tab order. Filled by
   * registerSelectable() as each view builds its chips/rows/blocks. */
  registerSelectable(el, it, dayIso) {
    if (!el || dayIso !== this.view().anchor) return el;
    this._daySel.push({ el, it });
    return el;
  }

  selectedItem() {
    const v = this.view();
    const row = (this._daySel || [])[v.selItem];
    return row ? row.it : null;
  }

  /* Tab / Shift+Tab through the day's items. Stepping past either end drops back to
   * day level rather than wrapping straight round, so the day itself stays reachable.
   * Returns false when there is nothing to step into — the caller then leaves Tab alone,
   * so a day with no items doesn't trap keyboard focus inside the calendar. */
  selectItem(dir) {
    const v = this.view();
    const list = this._daySel || [];
    if (!list.length) { v.selItem = null; return false; }
    const cur = (typeof v.selItem === 'number') ? v.selItem : null;
    let next;
    if (cur == null) next = dir > 0 ? 0 : list.length - 1;
    else next = cur + dir;
    v.selItem = (next < 0 || next >= list.length) ? null : next;
    this.render();
    return true;
  }

  /* Shift+arrow on a picked item: ←/→ by a day, ↑/↓ by a week — or, for a timed item in the
   * week/day grid, by one grid step of TIME, which is what up and down mean there. Goes through
   * the same paths a drag does, so a recurring occurrence detaches exactly as dragging it would. */
  nudgeItem(it, dx, dy) {
    const v = this.view();
    const timeGrid = v.view === 'week' || v.view === 'day';
    if (dy && timeGrid && !it.allDay) { this.nudgeTime(it, dy * CFG.snap); return; }
    const days = dx + dy * 7;
    if (!days) return;
    const iso = moment(it.date, 'YYYY-MM-DD').add(days, 'day').format('YYYY-MM-DD');
    // Move the day cursor FIRST: dropDate re-renders, and the selection has to land where the
    // item went, not stay on the day it left.
    v.anchor = iso;
    v.selDom = moment(iso, 'YYYY-MM-DD').date();
    this.dropDate(it, it.date, iso, false);
    this._reselect(it.baseId);
  }

  /* Slide a timed item along its own day, keeping its duration (and wrapping past midnight
   * rather than clamping — the night train stays three hours long). */
  nudgeTime(it, deltaMin) {
    const s = timeToMin(it.start);
    if (s == null) return;
    const dur = it.end ? (durationMin(it.start, it.end) || CFG.defaultDur) : CFG.defaultDur;
    const start = (s + deltaMin + DAY_MIN) % DAY_MIN;
    const startStr = minToTime(start);
    const endStr = it.end ? minToTime((start + dur) % DAY_MIN) : null;
    if (it.repeat) { this.detachOccurrence(it, { date: it.date, start: startStr, end: endStr }); return; }
    this.mutate((m) => {
      const ev = find(m, it.baseId);
      if (!ev) return;
      ev.start = startStr;
      if (endStr) ev.end = endStr;
    });
    this._reselect(it.baseId);
  }

  /* Put the item selection back on an event after a re-render reshuffled the day — so a
   * Shift+arrow (or a recolor) can be repeated without re-picking the item every time. */
  _reselect(baseId) {
    const v = this.view();
    const idx = (this._daySel || []).findIndex((r) => r.it && r.it.baseId === baseId);
    v.selItem = idx >= 0 ? idx : null;
    const row = idx >= 0 ? this._daySel[idx] : null;
    if (row && row.el) row.el.addClass('is-item-sel');
  }

  /* The context menu for the keyboard-selected item, anchored to its own box. */
  openItemMenuAtSelection() {
    const v = this.view();
    const row = (this._daySel || [])[v.selItem];
    if (!row || !row.el) return;
    const r = row.el.getBoundingClientRect();
    this.openEventMenu({ x: r.left, y: r.bottom }, row.it);
  }

  /* Q/E cycle the view left/right through month → week → day → agenda (wrapping), exactly
   * like clicking the header switcher: the choice persists into the block settings. */
  switchView(dir) {
    const v = this.view();
    const cycle = IS_MOBILE() ? MOBILE_VIEWS : VIEW_CYCLE;
    const i = Math.max(0, cycle.indexOf(v.view));
    this.setView(cycle[(i + dir + cycle.length) % cycle.length]);
  }

  /* W/S in the time grid: null = the all-day band (the default), numbers walk the visible
   * hour slots; up from the first hour lands back on all-day. */
  /* The hour window the time grid is CURRENTLY drawn with: the configured one, possibly grown to
   * fit the events on screen (see renderTimeGrid). Every consumer — the slot cursor, the drop
   * ghost, the resize math — reads it from here, so none of them can disagree with the grid. */
  hourWindow() {
    const g = this._timeGridInfo;
    if (g) return { dayStartMin: g.dayStartMin, dayEndMin: g.dayEndMin };
    const s = this.plugin.settings;
    const dayStart = Math.max(0, Math.min(23, s.dayStart));
    const dayEnd = Math.max(dayStart + 1, Math.min(24, s.dayEnd));
    return { dayStartMin: dayStart * 60, dayEndMin: dayEnd * 60 };
  }

  moveSelSlot(dir) {
    const v = this.view();
    const w = this.hourWindow();
    const dayStart = Math.floor(w.dayStartMin / 60), dayEnd = Math.ceil(w.dayEndMin / 60);
    let cur = (typeof v.selSlot === 'number') ? v.selSlot : null;
    if (dir > 0) cur = cur == null ? dayStart : Math.min(dayEnd - 1, cur + 1);
    else cur = (cur == null || cur <= dayStart) ? null : cur - 1;
    v.selSlot = cur;
    v.selItem = null;
    this.render();
  }

  /* Hand the grid keyboard focus so the arrows just work — on open, after a view switch,
   * and after a reprocess drops focus to <body>. Only a "dedicated calendar note" (the block
   * is the note's only non-blank content, as the create-calendar-note command makes) may take
   * focus — an embedded calendar must never hijack reading or editing. Never steals from an
   * input, a modal, or anything focused in ANOTHER pane. The dedicated note's own editor
   * caret IS fair game (there is no other text there) — that's what makes live preview work. */
  _autoFocusGrid(attempt) {
    if (this._destroyed || !this._gridEl || !this._gridEl.isConnected) return;
    if (IS_MOBILE() || this.view().pending) return;
    const ae = document.activeElement;
    if (ae && ae !== document.body) {
      if (ae.closest('input, textarea, select, .modal')) return;
      const myLeaf = this.el.closest('.workspace-leaf');
      if (!myLeaf || ae.closest('.workspace-leaf') !== myLeaf) return;
    }
    if (this._dedicated == null) { // tri-state cache — getSectionInfo may not resolve right away
      const info = this.ctx.getSectionInfo(this.el);
      if (!info) {
        if ((attempt || 0) < 3) setTimeout(() => this._autoFocusGrid((attempt || 0) + 1), 250);
        return;
      }
      const lines = info.text.split('\n');
      this._dedicated = true;
      for (let i = 0; i < lines.length; i++) {
        if (i >= info.lineStart && i <= info.lineEnd) continue;
        if (lines[i].trim()) { this._dedicated = false; break; }
      }
    }
    if (this._dedicated) this._gridEl.focus({ preventScroll: true });
  }

  /* ‹Today› / the T key: the pointer jumps to today and the per-view state returns to its
   * defaults — day-of-month paging memory cleared, the week/day slot cursor back on the
   * all-day band — and the grid takes focus so the keys work immediately. */
  goToday() {
    const v = this.view();
    v.anchor = isoToday();
    v.selDom = null;
    v.selSlot = null;
    v.selItem = null;
    this.render();
    if (this._gridEl) this._gridEl.focus({ preventScroll: true });
  }

  /* Jump the current view to an arbitrary ISO date (the header title / the G key), so reaching
   * a date months away doesn't mean clicking ‹ › a dozen times. Mirrors goToday's state reset. */
  goToDate(iso) {
    if (!iso) return;
    const v = this.view();
    v.anchor = iso;
    v.selDom = moment(iso, 'YYYY-MM-DD').date();
    v.selSlot = null;
    v.selItem = null;
    this.render();
    if (this._gridEl) this._gridEl.focus({ preventScroll: true });
  }

  openGoToDate() {
    if (this.view().pending) return; // placement mode owns the flow
    new GoToDateModal(this.app, this).open();
  }

  openSearch() {
    if (this.view().pending) return; // placement mode owns the flow
    new SearchModal(this.app, this).open();
  }

  openTitleEdit() {
    if (this.view().pending) return;
    new TitleModal(this.app, this).open();
  }

  /* ---- copy the visible period as plain Markdown ---- */
  /* What you SEE is what you get: the completed-items filter applies, a multi-day span is
   * written ONCE (filed under its first visible day, with its real date range) instead of
   * repeated on every day it covers, and an event running past midnight is one line rather
   * than a head and a tail. Meant to be pasted into a chat or another note as-is. */
  periodMarkdown() {
    const v = this.view();
    const anchorM = moment(v.anchor, 'YYYY-MM-DD');
    // Month and agenda copy the MONTH, not the 6-week grid on screen: the neighbouring-month
    // cells are padding, and nobody means them by "this month".
    const range = (v.view === 'month' || v.view === 'agenda')
      ? { from: moment(anchorM).startOf('month').format('YYYY-MM-DD'), to: moment(anchorM).endOf('month').format('YYYY-MM-DD') }
      : rangeForView(v.view, anchorM);
    const items = this.itemsInRange(range.from, range.to);

    const byDay = new Map();
    let n = 0;
    for (const it of items) {
      // A span that began before the period is filed under its first day inside it; everything
      // else under its own day. itemsInRange reaches one day back, so drop what falls outside.
      const day = (isSpanItem(it) && it.date < range.from) ? range.from : it.date;
      if (day < range.from || day > range.to) continue;
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(it);
      n++;
    }

    const lines = ['## ' + (this.model.title ? this.model.title + ' — ' : '') + periodLabel(v.view, anchorM), ''];
    for (const iso of Array.from(byDay.keys()).sort()) {
      lines.push('**' + cap(moment(iso, 'YYYY-MM-DD').format('dd, D MMMM')) + '**');
      for (const it of byDay.get(iso).sort(cmpItems)) lines.push(...this.itemMarkdown(it));
      lines.push('');
    }
    return { text: lines.join('\n').trim() + '\n', n };
  }

  itemMarkdown(it) {
    let body = it.title || '…';
    if (it.done && !it.task) body = '~~' + body + '~~'; // a task carries its state in the checkbox
    let line;
    if (it.task) {
      line = '- [' + (it.done ? 'x' : ' ') + '] ' + body;
    } else if (isSpanItem(it)) {
      const dm = (iso) => cap(moment(iso, 'YYYY-MM-DD').format('D MMM'));
      line = '- ' + body + ' (' + dm(it.date) + ' – ' + dm(it.endDate) + ')';
    } else if (it.allDay) {
      line = '- ' + t('txtAllDay') + ' · ' + body;
    } else {
      const when = it.start + (it.end ? '–' + it.end : '') + (crossesMidnight(it) ? ' (' + t('nextDay') + ')' : '');
      line = '- ' + when + ' · ' + body;
    }
    const out = [line];
    // The description rides along, indented under its item, so a multi-line note stays part of
    // the same list entry when the text is pasted back into Markdown.
    if (it.note) for (const nl of String(it.note).split('\n')) out.push('  ' + nl);
    return out;
  }

  async copyPeriod() {
    if (this.view().pending) return; // placement mode owns the flow
    const { text, n } = this.periodMarkdown();
    if (!n) { new Notice(t('copyEmpty')); return; }
    try {
      await navigator.clipboard.writeText(text);
      new Notice(t('copiedPeriod', n));
    } catch (e) {
      console.error('MD Calendar: clipboard write failed', e);
      new Notice(t('copyFailed'));
    }
    returnFocusToGrid(this);
  }

  moveSelection(days) {
    const v = this.view();
    v.anchor = moment(v.anchor || isoToday(), 'YYYY-MM-DD').add(days, 'day').format('YYYY-MM-DD');
    v.selDom = moment(v.anchor, 'YYYY-MM-DD').date(); // the day-of-month to hold across month paging
    v.selItem = null; // the item selection belongs to the day we just left
    this.render();
  }

  shiftSelectionMonth(months) {
    const v = this.view();
    const cur = moment(v.anchor || isoToday(), 'YYYY-MM-DD');
    const dom = v.selDom || cur.date();
    const m = cur.date(1).add(months, 'month');
    m.date(Math.min(dom, m.daysInMonth())); // clamp to short months, but restore e.g. the 31st later
    v.anchor = m.format('YYYY-MM-DD');
    v.selItem = null;
    this.render();
  }

  /* ---- MONTH VIEW ---- */
  renderMonth(body) {
    const v = this.view();
    const anchorM = moment(v.anchor, 'YYYY-MM-DD');
    const { from, to } = rangeForView('month', anchorM);
    const items = this.itemsInRange(from, to);
    // Multi-day all-day events draw as ONE continuous bar per week row (not a chip per day);
    // everything else stays a per-day chip.
    const spans = items.filter(isSpanItem);
    const byDay = this.bucketByDay(items.filter((it) => !isSpanItem(it)), from, to);

    const wmin = moment.weekdaysMin();
    const wd = body.createDiv({ cls: 'dn-month-wd' });
    for (let i = 0; i < 7; i++) wd.createSpan({ cls: 'dn-wd', text: wmin[(fdow() + i) % 7] });

    const grid = body.createDiv({ cls: 'dn-month' });
    this.armGridKeys(grid, 'grid');
    const gridStart = moment(from, 'YYYY-MM-DD');
    const curMonth = anchorM.month();
    const todayIso = isoToday();
    for (let w = 0; w < 6; w++) {
      const weekStartM = moment(gridStart).add(w * 7, 'day');
      const week = grid.createDiv({ cls: 'dn-mweek', attr: { role: 'row' } });
      for (let c = 0; c < 7; c++) {
        const d = moment(weekStartM).add(c, 'day');
        const iso = d.format('YYYY-MM-DD');
        const count0 = dayCountLabel(itemsOnDay(byDay, spans, iso)); // "3 events · 1 task" — the hover/AT summary
        const cell = week.createDiv({
          cls: 'dn-day' + (d.month() !== curMonth ? ' is-other' : '') + (iso === todayIso ? ' is-today' : '') + (iso === v.anchor ? ' is-sel' : '') + (v.pending && iso === v.pending.cursor ? ' is-cursor' : ''),
          attr: {
            role: 'gridcell',
            'aria-label': cap(d.format('dddd, D MMMM')) + (count0 ? ' — ' + count0 : ''),
            'aria-selected': String(iso === v.anchor),
          },
        });
        cell.dataset.iso = iso;
        const head = cell.createDiv({ cls: 'dn-day-head' });
        head.createSpan({ cls: 'dn-day-num', text: String(d.date()) });
        cell.addEventListener('click', (e) => {
          if (this.view().pending) { this.placePending(iso); return; } // placement mode: drop here
          if (e.target === cell || e.target === head) {
            // Move the keyboard selection to the clicked day (class swap, no re-render flicker).
            const old = grid.querySelector('.dn-day.is-sel');
            if (old) old.removeClass('is-sel');
            cell.addClass('is-sel');
            v.anchor = iso;
            v.selDom = d.date();
            this.openQuickCreate(iso);
          }
        });

        const chips = cell.createDiv({ cls: 'dn-day-chips' });
        const dayItems = byDay.get(iso) || [];
        // A cap, not a measurement. The row is `minmax(78px, 1fr)` inside a month with no
        // height of its own, so a cell GROWS to whatever it holds — there is no clipped
        // height to measure "what fits" against, and one busy day would stretch the whole
        // week. The cap is a setting instead, so a big screen can simply raise it.
        const max = Math.max(1, Math.min(20, Number(this.plugin.settings.monthChips) || 4));
        dayItems.slice(0, max).forEach((it) => this.buildChip(chips, it, 'date'));
        if (dayItems.length > max) {
          const hidden = dayItems.slice(max);
          const more = chips.createDiv({ cls: 'dn-more', text: t('more', hidden.length) });
          more.addEventListener('click', (e) => { e.stopPropagation(); this.openDayList(iso, hidden, e); });
        }
      }
      this.buildWeekBars(week, weekStartM, spans);
    }
  }

  /* "+N more": the rest of the day, right there. It used to throw you into day view, which
   * lost the month you were reading just to see two more titles. */
  openDayList(iso, hidden, evt) {
    const menu = new Menu();
    for (const it of hidden) {
      const when = it.allDay ? t('allDay') : (it.segStart || it.start);
      menu.addItem((i) => i
        .setTitle(when + ' · ' + (it.title || '…'))
        .setIcon(it.task ? (it.done ? 'check-square' : 'square') : 'dot')
        .onClick(() => this.onItemClick(it)));
    }
    menu.addSeparator();
    menu.addItem((i) => i.setTitle(t('v_day')).setIcon('calendar-clock').onClick(() => {
      this.view().anchor = iso;
      this.setView('day');
    }));
    if (evt && typeof evt.clientX === 'number') menu.showAtMouseEvent(evt);
    else menu.showAtPosition({ x: 0, y: 0 });
  }

  /* Clip spans to the [startM, startM+cols) day range and stack them into lanes —
   * earlier start first, longer first on ties (the Google look). Rounded fractional
   * diffs: a DST week must not shift a bar by a column. */
  spanSegments(spans, startM, cols) {
    const startIso = startM.format('YYYY-MM-DD');
    const endIso = moment(startM).add(cols - 1, 'day').format('YYYY-MM-DD');
    const segs = [];
    for (const it of spans) {
      if (it.endDate < startIso || it.date > endIso) continue;
      const sIso = it.date > startIso ? it.date : startIso;
      const eIso = it.endDate < endIso ? it.endDate : endIso;
      segs.push({
        it,
        sIso,
        c1: Math.round(moment(sIso, 'YYYY-MM-DD').diff(startM, 'days', true)),
        c2: Math.round(moment(eIso, 'YYYY-MM-DD').diff(startM, 'days', true)),
        clipL: it.date < startIso,  // continues out of this range on the left
        clipR: it.endDate > endIso, // …and on the right
      });
    }
    segs.sort((a, b) => a.c1 - b.c1 || (b.c2 - b.c1) - (a.c2 - a.c1));
    const laneEnd = [];
    for (const g of segs) {
      let lane = laneEnd.findIndex((endCol) => endCol < g.c1);
      if (lane === -1) { lane = laneEnd.length; laneEnd.push(g.c2); } else { laneEnd[lane] = g.c2; }
      g.lane = lane;
    }
    return { segs, lanes: laneEnd.length };
  }

  /* One clickable/draggable span bar (shared by the month grid and the all-day gutter). */
  makeSpanBar(parent, g) {
    const days = g.c2 - g.c1 + 1;
    const tip = (g.it.title || '') + (g.it.note ? ' — ' + g.it.note : '');
    const bar = parent.createDiv({
      cls: this.itemCls('dn-mbar', g.it) + (g.clipL ? ' is-clip-l' : '') + (g.clipR ? ' is-clip-r' : ''),
      attr: { 'aria-label': tip }, // single (Obsidian) tooltip — title would stack the native one
    });
    bar.style.gridColumn = (g.c1 + 1) + ' / span ' + days;
    bar.style.gridRow = String(g.lane + 1);
    bar.createSpan({ cls: 'dn-mbar-title', text: g.it.title || '…' });
    // The day under the pointer, for drag deltas and placement — a bar covers several.
    const dayAt = (clientX) => {
      const r = bar.getBoundingClientRect();
      const frac = Math.max(0, Math.min(0.999, (clientX - r.left) / Math.max(1, r.width)));
      return moment(g.sIso, 'YYYY-MM-DD').add(Math.floor(frac * days), 'day').format('YYYY-MM-DD');
    };
    // Registered BEFORE enableEventDrag's pointerdown, so the grab day is resolved by the
    // time its handler reads el.closest('[data-iso]') — which is the bar itself.
    bar.addEventListener('pointerdown', (e) => { bar.dataset.iso = dayAt(e.clientX); });
    bar.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.view().pending) { this.placePending(dayAt(e.clientX)); return; }
      this.onItemClick(g.it);
    });
    this.attachItemMenu(bar, g.it, true);
    this.enableEventDrag(bar, g.it, 'date');
    // A multi-day event is ONLY a bar in month view, so without this it would be the one
    // thing the keyboard could never reach. Claim it if the selected day falls under it.
    const anchor = this.view().anchor;
    const barEnd = moment(g.sIso, 'YYYY-MM-DD').add(days - 1, 'day').format('YYYY-MM-DD');
    if (anchor >= g.sIso && anchor <= barEnd) this.registerSelectable(bar, g.it, anchor);
    // Resize a multi-day span by its ends — but only on a REAL end (not a clip where it continues
    // into the next week/out of view) and not for a recurring span (its occurrences are edited).
    // Left handle moves the start date, right handle moves the end date; each snaps to a day cell.
    if (!g.it.repeat && !IS_MOBILE()) {
      if (!g.clipL) this.enableSpanResize(makeSpanHandle(bar, 'l'), g.it, 'l');
      if (!g.clipR) this.enableSpanResize(makeSpanHandle(bar, 'r'), g.it, 'r');
    }
    return bar;
  }

  /* The continuous multi-day bars of one MONTH week row: a 7-column grid OVERLAY on the
   * week (bars align with the cells, gaps included); the cells underneath reserve
   * --dn-lanes rows of space between the day number and their chips. */
  buildWeekBars(week, weekStartM, spans) {
    const { segs, lanes } = this.spanSegments(spans, weekStartM, 7);
    week.style.setProperty('--dn-lanes', String(lanes));
    if (!segs.length) return;
    const bars = week.createDiv({ cls: 'dn-mbars' });
    for (const g of segs) this.makeSpanBar(bars, g);
  }

  /* The same bars across the week/day all-day gutter (an overlay over the day cells;
   * the cells reserve --dn-lanes rows above their single-day chips). */
  buildAllDayBars(cellsWrap, dayMoments, spans) {
    const { segs, lanes } = this.spanSegments(spans, dayMoments[0], dayMoments.length);
    cellsWrap.style.setProperty('--dn-lanes', String(lanes));
    if (!segs.length) return;
    const bars = cellsWrap.createDiv({ cls: 'dn-tg-adbars' });
    bars.style.setProperty('--dn-cols', String(dayMoments.length));
    for (const g of segs) this.makeSpanBar(bars, g);
  }

  buildChip(parent, it, dragKind) {
    // Month view: a compact lead + title. A timed event shows its START HOUR in place of the
    // dot (14:00 → "14") — the colored number keeps the color cue AND tells the time at a glance;
    // an all-day event keeps a plain colored dot; a task gets a checkbox so you can tick it here.
    // The full time/note still live in the hover tooltip.
    // aria-label ONLY (Obsidian shows its styled tooltip for it) — adding title too would
    // stack the native tooltip on top of it. The note joins with a dash: Obsidian's tooltip
    // doesn't render newlines.
    const full = ((it.allDay ? '' : it.start + (it.end ? '–' + it.end : '') + ' ') + (it.title || '')).trim()
      + (crossesMidnight(it) ? ' (' + t('nextDay') + ')' : '')
      + (it.note ? ' — ' + it.note : ''); // the note lives in the tooltip — the cell is too narrow to show it
    const chip = parent.createDiv({ cls: this.itemCls('dn-chip', it) + (it.spill ? ' dn-spill dn-spill-' + it.spill : ''), attr: { 'aria-label': full } }); // hover/AT = full text (dot chips have no other label)
    if (it.task) this.buildCheck(chip, it, 'dn-chip-check');
    // The tail of an event that started the previous evening: an arrow, not "23" — that hour
    // belongs to yesterday and reading it here is actively misleading.
    else if (it.spill === 'tail') chip.createSpan({ cls: 'dn-chip-hour dn-chip-cont', text: '↳' });
    else if (!it.allDay && it.start) chip.createSpan({ cls: 'dn-chip-hour', text: String(Number(it.start.slice(0, 2))) }); // start hour, no leading zero
    else chip.createSpan({ cls: 'dn-chip-dot' });
    chip.createSpan({ cls: 'dn-chip-title', text: it.title || '…' });
    // The day this chip is drawn on — a span shows on several, so read it off the cell.
    const dayCell = parent.closest && parent.closest('[data-iso]');
    this.registerSelectable(chip, it, dayCell ? dayCell.dataset.iso : null);
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      // Placement mode: the user is aiming at the DAY under the chip, not at the chip —
      // place there instead of opening the editor on top of the placement banner.
      if (this.view().pending) {
        const cell = chip.closest('[data-iso]');
        if (cell) { this.placePending(cell.dataset.iso); return; }
      }
      this.onItemClick(it);
    });
    this.attachItemMenu(chip, it, !!dragKind);
    if (dragKind) this.enableEventDrag(chip, it, dragKind);
    return chip;
  }

  /* ---- AGENDA VIEW: a mini month calendar with event dots + a selected-day panel ---- */
  renderAgenda(body) {
    const v = this.view();
    const anchorM = moment(v.anchor, 'YYYY-MM-DD');
    // Fetch the full 6-week grid so leading/trailing other-month cells get their dots too.
    const { from, to } = rangeForView('month', anchorM);
    const items = this.itemsInRange(from, to);
    const byDay = this.bucketByDay(items, from, to);
    const todayIso = isoToday();
    const selIso = v.anchor; // the selected day IS the anchor — ‹ Today › already drives it

    const wrap = body.createDiv({ cls: 'dn-ag2' });

    // mini calendar: number + up to 3 dots per day, dots carry the event's color
    const cal = wrap.createDiv({ cls: 'dn-ag2-cal' });
    const wmin = moment.weekdaysMin();
    const wd = cal.createDiv({ cls: 'dn-ag2-wd' });
    for (let i = 0; i < 7; i++) wd.createSpan({ cls: 'dn-wd', text: wmin[(fdow() + i) % 7] });
    const grid = cal.createDiv({ cls: 'dn-ag2-grid' });
    this.armGridKeys(grid);
    const gridStart = moment(from, 'YYYY-MM-DD');
    const curMonth = anchorM.month();
    for (let i = 0; i < 42; i++) {
      const d = moment(gridStart).add(i, 'day');
      const iso = d.format('YYYY-MM-DD');
      const cell = grid.createDiv({
        cls: 'dn-ag2-cell' + (d.month() !== curMonth ? ' is-other' : '') + (iso === todayIso ? ' is-today' : '')
          + (iso === selIso ? ' is-sel' : '') + (v.pending && iso === v.pending.cursor ? ' is-cursor' : ''),
      });
      cell.dataset.iso = iso;
      cell.createSpan({ cls: 'dn-ag2-num', text: String(d.date()) });
      const dots = cell.createDiv({ cls: 'dn-ag2-dots' });
      (byDay.get(iso) || []).slice(0, 3).forEach((it) => {
        dots.createSpan({ cls: 'dn-ag2-dot' + (it.color ? ' dn-c-' + it.color : '') + (it.done ? ' is-done' : '') + (it.overdue ? ' is-overdue' : '') });
      });
      cell.addEventListener('click', () => {
        if (this.view().pending) { this.placePending(iso); return; } // placement mode: drop here
        if (v.anchor === iso) { this.openQuickCreate(iso); return; } // second click = create on this day
        v.anchor = iso;
        v.selDom = d.date(); // keyboard paging (PageUp/Down) holds the clicked day-of-month
        this.render();
      });
    }

    // selected-day panel: the familiar agenda rows (checkboxes, notes, context menu)
    const panel = wrap.createDiv({ cls: 'dn-ag2-day' });
    const dayItems = byDay.get(selIso) || [];
    const dateRow = panel.createDiv({ cls: 'dn-ag-date' + (selIso === todayIso ? ' is-today' : '') });
    dateRow.createSpan({ text: relDayLabel(selIso) });
    const count = dayCountLabel(dayItems);
    if (count) dateRow.createSpan({ cls: 'dn-day-count', text: count });
    if (dayItems.length) {
      const ul = panel.createDiv({ cls: 'dn-ag-list' });
      for (const it of dayItems) this.buildAgendaItem(ul, it, selIso);
    } else {
      panel.createDiv({ cls: 'dn-empty dn-ag2-empty', text: t('noEvents') });
    }
    const add = panel.createDiv({ cls: 'dn-ag2-add', attr: { role: 'button', tabindex: '0', 'aria-label': t('newEvent') } });
    setIcon(add.createSpan(), 'plus');
    add.createSpan({ text: t('newEvent') });
    const addClick = () => {
      if (this.view().pending) { this.placePending(selIso); return; }
      this.openQuickCreate(selIso);
    };
    add.addEventListener('click', addClick);
    add.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addClick(); } });
  }

  buildAgendaItem(parent, it, dayIso) {
    const row = parent.createDiv({ cls: this.itemCls('dn-ag-item', it) });
    this.buildCheck(row, it);
    const time = row.createSpan({
      cls: 'dn-ag-time',
      text: it.allDay ? t('allDay')
        : (it.start + (it.end ? '–' + it.end + (crossesMidnight(it) ? ' (' + t('nextDay') + ')' : '') : '')),
    });
    const main = row.createDiv({ cls: 'dn-ag-main' });
    main.createDiv({ cls: 'dn-ag-title', text: it.title || '…' });
    if (it.note) this.renderNoteText(main.createDiv({ cls: 'dn-ag-note' }), it.note); // shown in full (multi-line) so its links are clickable — no tooltip needed
    // In placement mode a click anywhere on the row means "this day" (dayIso, not it.date —
    // a multi-day span's row can sit on a later day than the span start).
    const open = (e) => {
      e.stopPropagation();
      if (this.view().pending) { this.placePending(dayIso || it.date); return; }
      this.onItemClick(it);
    };
    main.addEventListener('click', open);
    row.addEventListener('click', (e) => { if (e.target === row || e.target === time) open(e); });
    // Desktop: drag a row onto a day in the mini calendar to reschedule it (same 'date' drag as a
    // month chip; the grab day is THIS row's day, so a span shifts by the day you grabbed). On mobile
    // the row stays a plain menu source — dragging onto tiny mini-cells by long-press isn't worth it.
    const draggable = !IS_MOBILE();
    if (draggable) row.dataset.iso = dayIso || it.date; // grab day for the drag delta
    this.attachItemMenu(row, it, draggable);
    if (draggable) this.enableEventDrag(row, it, 'date');
    this.registerSelectable(row, it, dayIso || it.date);
    return row;
  }

  /* Render an event's description, turning links into clickable elements (the rest stays plain
   * text). Two forms, both "links in square brackets": a wiki link [[Note]] / [[Note#heading]] /
   * [[Note|alias]], and a markdown link [label](target) — an http(s)/mailto target opens in the
   * browser, anything else opens as a vault note. A click opens the link and never bubbles up to
   * the row/block (which would open the editor); links are excluded from drag too (see
   * enableEventDrag), so tapping one always follows it. */
  renderNoteText(parent, note) {
    // Alternation: [[wiki]]  OR  [label](target). Non-link "[x]" text is left untouched. The
    // markdown target allows spaces (note names) but not parens, so it stops at its own ")".
    const re = /\[\[([^\[\]]+)\]\]|\[([^\[\]]*)\]\(([^()]+)\)/g;
    let last = 0, m;
    while ((m = re.exec(note))) {
      if (m.index > last) parent.appendText(note.slice(last, m.index));
      if (m[1] != null) {
        const inner = m[1];
        const bar = inner.indexOf('|');
        const linktext = (bar >= 0 ? inner.slice(0, bar) : inner).trim(); // "Note" or "Note#heading"
        const label = (bar >= 0 ? inner.slice(bar + 1).trim() : '') || linktext;
        this._noteLink(parent, label, (e) => { if (linktext) this.app.workspace.openLinkText(linktext, this.ctx.sourcePath || '', e.ctrlKey || e.metaKey); });
      } else {
        const target = (m[3] || '').trim();
        const label = (m[2] || '').trim() || target;
        const external = /^[a-z][a-z0-9+.-]*:/i.test(target); // has a scheme (http:, https:, mailto:, obsidian:)
        this._noteLink(parent, label, (e) => {
          if (!target) return;
          if (external) window.open(target, '_blank');
          else this.app.workspace.openLinkText(target, this.ctx.sourcePath || '', e.ctrlKey || e.metaKey);
        });
      }
      last = m.index + m[0].length;
    }
    if (last < note.length) parent.appendText(note.slice(last));
  }

  _noteLink(parent, label, onClick) {
    const a = parent.createEl('a', { cls: 'internal-link dn-note-link', text: label });
    a.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onClick(e); });
    return a;
  }

  /* ---- WEEK / DAY TIME GRID ---- */
  renderTimeGrid(body, dayMoments) {
    const v = this.view();
    const s = this.plugin.settings;

    const from = dayMoments[0].format('YYYY-MM-DD');
    const to = dayMoments[dayMoments.length - 1].format('YYYY-MM-DD');
    const items = this.itemsInRange(from, to);
    // Multi-day spans draw as continuous bars over the all-day gutter, not per-day chips.
    const spans = items.filter(isSpanItem);
    const byDay = this.bucketByDay(items.filter((it) => !isSpanItem(it)), from, to);
    const todayIso = isoToday();

    // The configured day window is a PREFERENCE, not a clip. It used to be a hard crop: an event
    // outside it was squeezed into a sliver against the edge while its label still read 06:00 —
    // several events could pile up there invisibly. Grow the window to cover whatever the visible
    // days actually hold; on days that fit, it stays exactly as configured.
    let dayStart = Math.max(0, Math.min(23, s.dayStart));
    let dayEnd = Math.max(dayStart + 1, Math.min(24, s.dayEnd));
    for (const d of dayMoments) {
      for (const it of byDay.get(d.format('YYYY-MM-DD')) || []) {
        if (it.allDay) continue;
        const sMin = timeToMin(it.segStart || it.start);
        const eMin = segEndMin(it);
        if (sMin != null) dayStart = Math.min(dayStart, Math.floor(sMin / 60));
        if (eMin != null) dayEnd = Math.max(dayEnd, Math.ceil(eMin / 60));
      }
    }
    dayStart = Math.max(0, dayStart);
    dayEnd = Math.min(24, Math.max(dayStart + 1, dayEnd));
    const dayStartMin = dayStart * 60, dayEndMin = dayEnd * 60;
    // The one source of truth for the drawn window: the minute ticker AND every drag/resize
    // computation read it back through hourWindow(), so a grown grid can't disagree with them.
    this._timeGridInfo = { cols: new Map(), dayStartMin, dayEndMin };
    // Keyboard slot cursor: null = the all-day band; clamp a stale hour into the visible window.
    if (typeof v.selSlot === 'number' && (v.selSlot < dayStart || v.selSlot >= dayEnd)) v.selSlot = null;

    const grid = body.createDiv({ cls: 'dn-timegrid' + (dayMoments.length === 1 ? ' is-day' : '') });
    this.armGridKeys(grid);

    // column headers
    const colhead = grid.createDiv({ cls: 'dn-tg-colhead' });
    colhead.createDiv({ cls: 'dn-tg-corner' });
    for (const d of dayMoments) {
      const iso = d.format('YYYY-MM-DD');
      const count = dayCountLabel(itemsOnDay(byDay, spans, iso));
      const h = colhead.createDiv({
        cls: 'dn-tg-dayhead' + (iso === todayIso ? ' is-today' : ''),
        attr: { 'aria-label': cap(d.format('dddd, D MMMM')) + (count ? ' — ' + count : '') },
      });
      h.createSpan({ cls: 'dn-tg-dow', text: cap(d.format('ddd')) });
      const num = h.createSpan({ cls: 'dn-tg-daynum', text: String(d.date()) });
      num.addEventListener('click', () => { this.view().anchor = iso; this.setView('day'); this.render(); });
      // Day view has one wide column with room to spare — spell the summary out there.
      if (dayMoments.length === 1 && count) h.createSpan({ cls: 'dn-day-count', text: count });
    }

    // all-day gutter — single-day items are chips in their day cell; multi-day spans draw
    // as one continuous bar across the covered columns (the same bars as the month view)
    const allday = grid.createDiv({ cls: 'dn-tg-allday' });
    allday.createDiv({ cls: 'dn-tg-allday-label', text: t('allDay') });
    const adWrap = allday.createDiv({ cls: 'dn-tg-allday-cells' });
    for (const d of dayMoments) {
      const iso = d.format('YYYY-MM-DD');
      const cell = adWrap.createDiv({ cls: 'dn-tg-allday-cell' + (iso === v.anchor && v.selSlot == null ? ' is-sel' : '') });
      cell.dataset.iso = iso;
      cell.addEventListener('click', (e) => {
        if (this.view().pending) { this.placePending(iso); return; }
        if (e.target === cell) this.openQuickCreate(iso);
      });
      const dayItems = (byDay.get(iso) || []).filter((it) => it.allDay);
      for (const it of dayItems) this.buildChip(cell, it, 'date');
    }
    this.buildAllDayBars(adWrap, dayMoments, spans);

    // scrollable hour body
    const scroll = grid.createDiv({ cls: 'dn-tg-scroll' });
    const inner = scroll.createDiv({ cls: 'dn-tg-inner' });
    inner.style.setProperty('--dn-hours', String(dayEnd - dayStart));

    const hours = inner.createDiv({ cls: 'dn-tg-hours' });
    for (let h = dayStart; h < dayEnd; h++) {
      hours.createDiv({ cls: 'dn-tg-hour' }).createSpan({ text: String(h).padStart(2, '0') + ':00' });
    }

    const cols = inner.createDiv({ cls: 'dn-tg-cols' });
    const pendCursor = this.view().pending ? this.view().pending.cursor : null;
    for (const d of dayMoments) {
      const iso = d.format('YYYY-MM-DD');
      const col = cols.createDiv({ cls: 'dn-tg-col' + (iso === todayIso ? ' is-today' : '') + (iso === pendCursor ? ' is-cursor' : '') });
      col.dataset.iso = iso;
      this._timeGridInfo.cols.set(iso, col);
      this.enableDrawCreate(col, iso, dayStartMin, dayEndMin);
      // hour lines + click-to-create
      for (let h = dayStart; h < dayEnd; h++) {
        const slot = col.createDiv({ cls: 'dn-tg-slot' + (iso === v.anchor && v.selSlot === h ? ' is-sel' : '') });
        const slotStart = String(h).padStart(2, '0') + ':00';
        slot.addEventListener('click', () => {
          if (this.view().pending) { this.placePending(iso, slotStart); return; }
          this.openQuickCreate(iso, { start: slotStart });
        });
      }
      const timed = (byDay.get(iso) || []).filter((it) => !it.allDay);
      const laid = layoutTimedEvents(timed, dayStartMin, dayEndMin, CFG.defaultDur);
      for (const it of laid) {
        const L = it._layout;
        // The note now shows inside the block (a muted line under the title) when it fits — the
        // block clips it and the hover tooltip still carries the full text (aria-label only, so a
        // single Obsidian tooltip, never the native one stacked on top).
        const overnight = crossesMidnight(it);
        const timeLabel = it.start + (it.end ? '–' + it.end : '') + (overnight ? ' (' + t('nextDay') + ')' : '');
        const tip = (timeLabel + ' ' + (it.title || '')).trim() + (it.note ? ' — ' + it.note : '');
        const block = col.createDiv({
          cls: this.itemCls('dn-ev', it) + (it.spill ? ' dn-spill dn-spill-' + it.spill : ''),
          attr: { 'aria-label': tip },
        });
        block.style.top = L.topPct + '%';
        block.style.height = L.heightPct + '%';
        block.style.left = L.leftPct + '%';
        block.style.width = 'calc(' + L.widthPct + '% - 3px)';
        // Same checkbox as the agenda row: the time grid used to be the one view where an item
        // could not be ticked at all, so "can I complete it here?" depended on which view you
        // happened to be in. (Month cells stay dots-and-hours — two lines of room, no space.)
        this.buildCheck(block, it, 'dn-ev-check');
        block.createSpan({ cls: 'dn-ev-time', text: timeLabel });
        block.createSpan({ cls: 'dn-ev-title', text: it.title || '…' });
        if (it.note) this.renderNoteText(block.createSpan({ cls: 'dn-ev-note' }), it.note);
        block.addEventListener('click', (e) => {
          e.stopPropagation();
          // Placement mode: treat a click on a covering block as a click on its day column.
          if (this.view().pending) { this.placePending(iso); return; }
          this.onItemClick(it);
        });
        this.attachItemMenu(block, it, true);
        this.registerSelectable(block, it, iso);
        // The tail half of an overnight event sits on a day the event does not start on — a timed
        // drag there would rewrite the start against the wrong day. Grab it by its head instead.
        if (it.spill !== 'tail') this.enableEventDrag(block, it, 'timed');
        // Recurring occurrences are edited via the editor, not resized. Neither half of an
        // overnight event can be resized in place: the edge being dragged lives on the other day.
        if (!it.repeat && !it.spill) {
          const topHandle = block.createDiv({ cls: 'dn-ev-resize-top', attr: { 'aria-label': t('e_time') } });
          this.enableEventResizeTop(block, topHandle, it, dayStartMin, dayEndMin);
          const handle = block.createDiv({ cls: 'dn-ev-resize', attr: { 'aria-label': t('e_end') } });
          this.enableEventResize(block, handle, it, dayStartMin, dayEndMin);
        }
      }
      // now-line
      if (iso === todayIso) {
        const nowMin = moment().hours() * 60 + moment().minutes();
        if (nowMin >= dayStartMin && nowMin <= dayEndMin) {
          const line = col.createDiv({ cls: 'dn-now-line' });
          line.style.top = ((nowMin - dayStartMin) / (dayEndMin - dayStartMin)) * 100 + '%';
        }
      }
    }

    // Scroll so the keyboard slot cursor — else the current hour when today is on screen, else
    // the top of the working day — is in view. The slot cursor and "now" get centered; the plain
    // 8:00 fallback just sits near the top. On the FIRST render the block is not always laid out
    // yet: clientHeight reads 0, the arithmetic collapses to 0 and the grid opens at the start of
    // the day instead of at "now". Retry on the next frame until the browser gives it a height.
    const totalMin = dayEndMin - dayStartMin;
    const nowMin = moment().hours() * 60 + moment().minutes();
    const showsNow = this._timeGridInfo.cols.has(todayIso) && nowMin >= dayStartMin && nowMin <= dayEndMin;
    const centered = (typeof v.selSlot === 'number') || showsNow;
    const focusMin = (typeof v.selSlot === 'number') ? v.selSlot * 60 : (showsNow ? nowMin : Math.max(dayStartMin, 8 * 60));
    const applyScroll = (tries) => {
      if (this._destroyed || !scroll.isConnected) return; // a re-render replaced this grid
      const innerH = inner.clientHeight;
      if (!innerH) { if (tries < 30) window.requestAnimationFrame(() => applyScroll(tries + 1)); return; }
      const pad = centered ? Math.max(20, scroll.clientHeight / 2 - 22) : 20;
      scroll.scrollTop = Math.max(0, ((focusMin - dayStartMin) / totalMin) * innerH - pad);
    };
    applyScroll(0);
  }

  /* ---- item styling / interaction ---- */
  itemCls(base, it) {
    return base
      + (it.color ? ' dn-c-' + it.color : '')
      + (it.done ? ' is-done' : '')
      + (it.task ? ' dn-is-task' : '')
      + (it.overdue ? ' is-overdue' : '')
      + (it.allDay ? ' is-allday' : ' is-timed');
  }

  buildCheck(parent, it, extraCls) {
    const box = parent.createSpan({
      cls: 'dn-check' + (extraCls ? ' ' + extraCls : '') + (it.done ? ' is-done' : ''),
      attr: { role: 'checkbox', tabindex: '0', 'aria-checked': String(!!it.done), 'aria-label': it.title || '…' },
    });
    if (it.done) setIcon(box, 'check');
    const toggle = (e) => { e.preventDefault(); e.stopPropagation(); this.toggleDone(it); };
    box.addEventListener('click', toggle);
    box.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') toggle(e); });
    return box;
  }

  onItemClick(it) {
    const ev = find(this.model, it.baseId);
    if (ev) this.openEditor(ev);
  }

  toggleDone(it) {
    let completed = false; // play the chime only on completion, never on un-ticking
    this.mutate((m) => {
      const ev = find(m, it.baseId);
      if (!ev) return;
      // A repeating EVENT: tick THIS occurrence, leave the series alone. Rolling the base date
      // forward (the task model below) would delete every earlier occurrence from the calendar —
      // a meeting you attended is history, not a to-do that disappears once it's done.
      if (ev.repeat && !ev.task) {
        if (ev.done) { ev.done = false; ev.completedAt = null; return; } // whole series un-finished
        const iso = it.date || ev.date;
        const set = new Set(ev.doneDates || []);
        if (set.has(iso)) set.delete(iso);
        else { set.add(iso); completed = true; }
        ev.doneDates = set.size ? Array.from(set).sort() : null;
        return;
      }
      if (ev.repeat) {
        if (ev.done) {
          // A FINISHED series (completed past its until) — un-ticking revives it.
          ev.done = false;
          ev.completedAt = null;
          return;
        }
        completed = true; // ticking a repeat occurrence = completing it
        // Completing a repeat rolls the series forward to the occurrence AFTER the one the
        // user actually clicked (it.date), not blindly from the base date, so ticking the
        // second shown occurrence advances to the third rather than back to the first.
        let rep = ev.repeat;
        if ((rep.unit === 'month' || rep.unit === 'year') && typeof rep.day !== 'number') {
          const base = ev.date ? moment(ev.date, 'YYYY-MM-DD', true) : todayM();
          rep = Object.assign({}, rep, { day: base.isValid() ? base.date() : todayM().date() });
        }
        const next = advancePastSkips(it.date || ev.date, rep, ev.skip);
        if (rep.until && next > rep.until) {
          // That was the last occurrence — the series is done as a whole.
          ev.date = it.date || ev.date;
          ev.repeat = rep;
          ev.done = true;
          ev.completedAt = isoToday();
          new Notice(t('seriesDone'));
        } else {
          ev.date = next; ev.repeat = rep; ev.done = false; ev.completedAt = null;
          // Past skips are inert once the base moves beyond them — prune so the JSON stays tidy.
          if (ev.skip) { ev.skip = ev.skip.filter((d) => d > next); if (!ev.skip.length) ev.skip = null; }
          new Notice(t('recurred', relDayLabel(next)));
        }
      } else {
        ev.done = !ev.done;
        ev.completedAt = ev.done ? isoToday() : null;
        // Ticking an overdue (carried-forward) task pins it to the day it was actually done —
        // otherwise it would jump back to its original past date the moment it's completed.
        if (ev.done && ev.task && ev.date && ev.date < isoToday()) ev.date = isoToday();
        completed = ev.done;
      }
    });
    if (completed && this.plugin.settings.completionSound) playDoneSound();
  }

  makeEvent(fields) {
    const maxOrder = this.model.events.reduce((mx, ev) => Math.max(mx, ev.order || 0), -1);
    return normalizeEvent(Object.assign({ created: isoToday(), order: maxOrder + 1 }, fields));
  }

  addEvent(fields) {
    const ev = this.makeEvent(fields);
    this.mutate((m) => { m.events.push(ev); });
    return ev;
  }

  openEditor(ev, defaults) {
    new EventModal(this.app, this, ev, defaults || {}).open();
  }

  openQuickCreate(dateIso, opts) {
    new QuickCreateModal(this.app, this, dateIso, opts || {}).open();
  }

  /* Attach the context menu — except on mobile for DRAGGABLE (non-recurring) items, where a
   * long-press must arm the drag, not pop the menu over it. Recurring items keep the menu
   * everywhere (they can't be dragged, and it's the only mobile path to "delete this
   * occurrence"); agenda rows keep it too (they aren't drag sources at all). */
  attachItemMenu(el, it, draggable) {
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (IS_MOBILE() && draggable && !it.repeat) return; // long-press means drag here
      this.openEventMenu(e, it);
    });
  }

  /* Right-click context menu for an event (works in every view): done / edit / duplicate / delete. */
  openEventMenu(evt, it) {
    const menu = new Menu();
    menu.addItem((i) => i.setTitle(it.done ? t('m_undone') : t('m_done')).setIcon(it.done ? 'rotate-ccw' : 'check').onClick(() => this.toggleDone(it)));
    menu.addItem((i) => i.setTitle(t('m_edit')).setIcon('pencil').onClick(() => { const ev = find(this.model, it.baseId); if (ev) this.openEditor(ev); }));
    menu.addItem((i) => i.setTitle(t('m_duplicate')).setIcon('copy').onClick(() => this.duplicateEvent(it)));
    // Quick recolor without opening the full editor. Submenu where supported (Obsidian ≥ 1.4),
    // else fall through to the editor — the color picker lives there too.
    menu.addItem((i) => {
      i.setTitle(t('m_color')).setIcon('palette');
      if (typeof i.setSubmenu === 'function') {
        const sub = i.setSubmenu();
        for (const key of COLOR_KEYS) {
          sub.addItem((si) => si
            .setTitle(t('c_' + key))
            .setChecked((it.color || 'default') === key)
            .onClick(() => this.setEventColor(it, key === 'default' ? null : key)));
        }
      } else {
        i.onClick(() => { const ev = find(this.model, it.baseId); if (ev) this.openEditor(ev); });
      }
    });
    // Postpone — submenu where supported (Obsidian ≥ 1.4), same as the color picker; without it
    // the date dialog is the single entry, which still beats dragging across a month boundary.
    menu.addItem((i) => {
      i.setTitle(t('m_snooze')).setIcon('clock');
      const pick = () => new DatePickModal(this.app, this, t('m_snooze'), it.date, (iso) => this.snooze(it, iso)).open();
      if (typeof i.setSubmenu === 'function') {
        const sub = i.setSubmenu();
        for (const [label, iso, icon] of this.snoozeTargets(it)) {
          sub.addItem((si) => si.setTitle(label).setIcon(icon).onClick(() => this.snooze(it, iso)));
        }
        sub.addSeparator();
        sub.addItem((si) => si.setTitle(t('m_pickDate')).setIcon('calendar-days').onClick(pick));
      } else {
        i.onClick(pick);
      }
    });
    menu.addSeparator();
    // A recurring occurrence can be deleted alone (an EXDATE-style skip) — the vacation case:
    // drop two weeks of gym sessions without touching the series before and after.
    if (it.repeat) menu.addItem((i) => i.setTitle(t('m_skip')).setIcon('calendar-x').onClick(() => this.skipOccurrence(it)));
    menu.addItem((i) => i.setTitle(it.repeat ? t('m_deleteSeries') : t('m_delete')).setIcon('trash-2').onClick(() => this.deleteEvent(it)));
    // A real pointer event positions itself; the keyboard path (M on a selected item)
    // hands in the item's own box instead.
    if (evt && typeof evt.clientX === 'number') menu.showAtMouseEvent(evt);
    else menu.showAtPosition({ x: (evt && evt.x) || 0, y: (evt && evt.y) || 0 });
  }

  /* "Delete this occurrence": add the clicked date to the repeat's skip list. */
  skipOccurrence(it) {
    this.mutate((m) => {
      const ev = find(m, it.baseId);
      if (!ev || !ev.repeat || !it.date) return;
      const set = new Set(ev.skip || []);
      set.add(it.date);
      ev.skip = Array.from(set).sort();
    });
  }

  setEventColor(it, color) {
    this.mutate((m) => { const ev = find(m, it.baseId); if (ev) ev.color = color; });
  }

  /* Postpone: push an item to a later day without a drag or a trip through the editor — the
   * everyday move for a task that didn't happen. Measured from the day you SEE it (it.date), so
   * "tomorrow" on an overdue task carried forward to today means tomorrow, not the day after its
   * original date. dropDate already owns the rules — multi-day spans shift whole, a recurring
   * occurrence detaches instead of dragging the series with it. */
  snooze(it, iso) {
    if (!iso || iso === it.date) return;
    this.dropDate(it, it.date, iso, false);
    new Notice(t('snoozed', relDayLabel(iso)));
    returnFocusToGrid(this);
  }

  /* The days "postpone" offers, relative to the occurrence on screen. */
  snoozeTargets(it) {
    const from = moment(it.date, 'YYYY-MM-DD');
    return [
      [t('m_tomorrow'), moment(from).add(1, 'day').format('YYYY-MM-DD'), 'chevron-right'],
      [t('m_nextWeek'), moment(from).add(7, 'day').format('YYYY-MM-DD'), 'chevrons-right'],
    ];
  }

  /* Move ONE occurrence of a repeating event (dragging it in the grid, desktop only): skip the
   * original date and drop a standalone one-off at the new spot. Simpler and safer than an
   * in-series override — the moved copy is an ordinary event you can drag/edit/delete as usual,
   * and the rest of the series is untouched. `fields` carries the new date/start/end/endDate. */
  detachOccurrence(it, fields) {
    this.mutate((m) => {
      const ev = find(m, it.baseId);
      if (!ev || !ev.repeat || !it.date) return;
      const set = new Set(ev.skip || []);
      set.add(it.date); // EXDATE the occurrence at its original date
      ev.skip = Array.from(set).sort();
      const copy = normalizeEvent({
        title: it.title,
        task: it.task,
        date: fields.date,
        start: it.task ? null : fields.start,
        end: it.task ? null : fields.end,
        endDate: fields.endDate || null,
        note: it.note,
        color: it.color,
      });
      const idx = m.events.findIndex((x) => x.id === ev.id);
      m.events.splice(idx < 0 ? m.events.length : idx + 1, 0, copy);
      m.events.forEach((x, i) => { x.order = i; });
    });
    new Notice(t('movedOut'));
  }

  /* Ctrl/Cmd-drag: drop a standalone copy at `fields`, leaving the source (and any series) exactly
   * as it was — same body (title/kind/note/color), fresh identity, no repeat. Works from any drag
   * source (month day, all-day gutter, week/day time grid). A recurring source copies just the one
   * occurrence; the series keeps ALL its dates (unlike a plain drag, which detaches). */
  copyEventTo(it, fields) {
    this.mutate((m) => {
      const src = find(m, it.baseId);
      const copy = normalizeEvent({
        title: it.title,
        task: it.task,
        date: fields.date,
        start: it.task ? null : fields.start,
        end: it.task ? null : fields.end,
        endDate: fields.endDate || null,
        note: it.note,
        color: it.color,
      });
      const idx = src ? m.events.findIndex((x) => x.id === src.id) : -1;
      m.events.splice(idx < 0 ? m.events.length : idx + 1, 0, copy);
      m.events.forEach((x, i) => { x.order = i; });
    });
    new Notice(t('copied'));
  }

  duplicateEvent(it) {
    const ev = find(this.model, it.baseId);
    if (!ev) return;
    const copy = normalizeEvent(Object.assign(cleanEvent(ev), { id: uid('e'), done: false, completedAt: null, created: isoToday() }));
    this.mutate((m) => {
      const idx = m.events.findIndex((x) => x.id === ev.id);
      m.events.splice(idx < 0 ? m.events.length : idx + 1, 0, copy);
      m.events.forEach((x, i) => { x.order = i; });
    });
  }

  /* Deletes never ask — undo is the safety net (Ctrl+Z on desktop, the notice's Undo on mobile). */
  deleteEvent(it) {
    this.mutate((m) => { m.events = m.events.filter((x) => x.id !== it.baseId); });
    returnFocusToGrid(this); // so Ctrl+Z lands in the calendar right away
    this.offerUndo();
  }

  /* Desktop: an optional plain notice (Ctrl+Z is the path back). Mobile has no Ctrl+Z —
   * the notice carries a one-tap Undo button instead. Undo resolves the LIVE renderer at
   * tap time: the persist that follows the delete reprocesses the block under the notice. */
  offerUndo(msg) {
    if (!IS_MOBILE()) {
      if (msg) new Notice(msg);
      return;
    }
    const n = new Notice(msg || t('deletedNotice'), 7000);
    const btn = n.noticeEl.createEl('button', { cls: 'dn-notice-undo', text: t('undoBtn') });
    btn.addEventListener('click', () => {
      const live = (this.plugin.liveRenderers && this.plugin.liveRenderers.get(this.stateKey())) || this;
      live.undo();
      n.hide();
    });
  }

  /* ---- drag to reschedule ---- */
  /* kind 'date' (month cell / all-day gutter) moves only the date; kind 'timed' (week/day
   * grid block) moves date + start time, snapped to 30 min and preserving duration. Dragging a
   * RECURRING occurrence detaches just that one (desktop only — on mobile a long-press already
   * owns the context menu, the only touch path to "delete this occurrence"). */
  enableEventDrag(el, it, kind) {
    if (it.repeat && IS_MOBILE()) return; // touch: long-press = menu, not drag (see attachItemMenu)
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      if (e.target.closest('.dn-check, .dn-ev-resize, .dn-ev-resize-top, .dn-mbar-resize, .dn-note-link')) return; // the checkbox / resize handles / a link own their press
      // The day whose chip was grabbed — for a multi-day span the same instance is shown on
      // every covered day, so the delta must be measured from THIS day, not the span start.
      const grabCell = el.closest('[data-iso]');
      const grabIso = (grabCell && grabCell.dataset.iso) || it.date;
      const isTouch = e.pointerType !== 'mouse';
      if (!isTouch) e.preventDefault();
      const pointerId = e.pointerId; // only THIS pointer drives this gesture (multi-touch safe)
      const startX = e.clientX, startY = e.clientY;
      let dragging = false;
      let armed = !isTouch; // mouse: immediate; touch: after a long-press so scrolling still works
      let pressTimer = null;
      let lastTarget = null;
      let ghost = null; // live snapped preview (timed drags): what you see is where it lands

      const clearTarget = () => { if (lastTarget) { lastTarget.removeClass('dn-drop-target'); lastTarget = null; } };
      const clearGhost = () => { if (ghost) { ghost.remove(); ghost = null; } };
      const cleanup = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        if (pressTimer) clearTimeout(pressTimer);
        el.removeClass('dn-dragging');
        document.body.removeClass('dn-drag-active');
        document.body.removeClass('dn-copy');
        clearTarget();
        clearGhost();
        this._activeDrags.delete(cleanup);
      };
      const begin = () => { dragging = true; el.addClass('dn-dragging'); document.body.addClass('dn-drag-active'); };

      const cellAt = (x, y) => {
        const sel = kind === 'timed'
          ? '.dn-tg-col[data-iso]'
          : '.dn-day[data-iso], .dn-tg-allday-cell[data-iso], .dn-tg-col[data-iso], .dn-ag2-cell[data-iso]';
        for (const c of this.el.querySelectorAll(sel)) {
          const r = c.getBoundingClientRect();
          if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return c;
        }
        return null;
      };

      const onMove = (ev) => {
        if (ev.pointerId !== pointerId) return; // ignore a second finger's stream
        const dx = Math.abs(ev.clientX - startX), dy = Math.abs(ev.clientY - startY);
        if (!armed) { if (dx > 8 || dy > 8) cleanup(); return; } // moved before long-press → a scroll
        if (!dragging) { if (dx < 6 && dy < 6) return; begin(); }
        ev.preventDefault();
        document.body.toggleClass('dn-copy', !!(ev.ctrlKey || ev.metaKey)); // Ctrl/Cmd held → copy cursor
        clearTarget();
        const cell = cellAt(ev.clientX, ev.clientY);
        if (cell) { cell.addClass('dn-drop-target'); lastTarget = cell; }
        // Timed drags draw a snapped ghost at the exact drop spot (incl. the 30-min snap),
        // with the would-be time — no more guessing on desktop, no blind drops on touch.
        if (kind === 'timed') {
          if (cell) {
            const spot = this.timedDropSpot(it, cell, ev.clientY);
            if (!ghost || ghost.parentElement !== cell) {
              clearGhost();
              ghost = cell.createDiv({ cls: 'dn-drag-ghost' });
            }
            ghost.style.top = ((spot.startMin - spot.dayStartMin) / spot.range) * 100 + '%';
            // An overnight drop runs off the bottom of the column — show it reaching the edge
            // rather than letting the ghost spill outside the day.
            const visible = Math.min(spot.dur, spot.dayStartMin + spot.range - spot.startMin);
            ghost.style.height = (visible / spot.range) * 100 + '%';
            ghost.setText(spot.start + '–' + spot.end);
          } else {
            clearGhost();
          }
        }
      };

      const onUp = (ev) => {
        if (ev.pointerId !== pointerId) return; // this gesture only ends with its own pointer
        const was = dragging;
        const cell = was ? cellAt(ev.clientX, ev.clientY) : null;
        const dropY = ev.clientY;
        const copy = !!(ev.ctrlKey || ev.metaKey); // Ctrl/Cmd on release → copy, leaving the original
        cleanup();
        if (!was) return; // it was a tap/click — let the normal click handler run
        const swallow = (ce) => { ce.stopPropagation(); ce.preventDefault(); };
        document.addEventListener('click', swallow, true);
        setTimeout(() => document.removeEventListener('click', swallow, true), 0);
        if (!cell) return;
        if (kind === 'timed') this.dropTimed(it, cell, cell.dataset.iso, dropY, copy);
        else this.dropDate(it, grabIso, cell.dataset.iso, copy);
      };

      if (isTouch) pressTimer = setTimeout(() => { armed = true; begin(); }, 350);
      this._activeDrags.add(cleanup);
      document.addEventListener('pointermove', onMove, { passive: false });
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    });
  }

  dropDate(it, grabIso, targetIso, copy) {
    if (!targetIso || targetIso === grabIso) return;
    // rounded fractional diff: on a DST transition day the integer diff truncates 0.96 → 0
    // and the drop would silently do nothing.
    const delta = Math.round(moment(targetIso, 'YYYY-MM-DD').diff(moment(grabIso, 'YYYY-MM-DD'), 'days', true));
    if (!delta) return;
    const newDate = moment(it.date, 'YYYY-MM-DD').add(delta, 'day').format('YYYY-MM-DD');
    const newEndDate = it.endDate ? moment(it.endDate, 'YYYY-MM-DD').add(delta, 'day').format('YYYY-MM-DD') : null;
    // Ctrl/Cmd: drop a standalone copy, leaving the original (and any series) untouched.
    if (copy) {
      this.copyEventTo(it, { date: newDate, start: it.start, end: it.end, endDate: newEndDate });
      return;
    }
    // A recurring occurrence detaches to a standalone event instead of dragging the whole series.
    if (it.repeat) {
      this.detachOccurrence(it, { date: newDate, start: it.start, end: it.end, endDate: newEndDate });
      return;
    }
    this.mutate((m) => {
      const ev = find(m, it.baseId);
      if (!ev) return;
      // Move relative to the SHOWN instance (it.date), not the base date: a carried-forward overdue
      // task renders on today while its base date sits in the past — dragging it must land on the
      // target day, not apply today's delta to the old date. For normal events it.date == ev.date.
      ev.date = newDate;
      if (ev.endDate) ev.endDate = newEndDate || ev.endDate;
    });
  }

  /* Where a timed drag over `cell` at `clientY` would land — the snap/clamp math shared
   * by the live ghost preview and the actual drop, so the preview can never lie. */
  timedDropSpot(it, cell, clientY) {
    const { dayStartMin, dayEndMin } = this.hourWindow();
    const range = dayEndMin - dayStartMin;
    const r = cell.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientY - r.top) / r.height));
    const mins = Math.round((dayStartMin + frac * range) / CFG.snap) * CFG.snap; // snap to the grid step
    const hadEnd = it.end != null;
    // Wrapping duration: an overnight event is 3 hours long, not minus twenty-one.
    const dur = hadEnd ? Math.max(15, durationMin(it.start, it.end) || CFG.defaultDur) : CFG.defaultDur;
    // A normal event must finish inside the window; an overnight one already ends on the next
    // day, so only its START is constrained — otherwise it could never be dropped late again.
    const lastStart = crossesMidnight(it) ? dayEndMin - CFG.snap : dayEndMin - dur;
    const startMin = Math.max(dayStartMin, Math.min(Math.max(dayStartMin, lastStart), mins));
    return {
      dayStartMin, range, startMin, dur, hadEnd,
      start: minToTime(startMin),
      end: minToTime((startMin + dur) % DAY_MIN),
    };
  }

  dropTimed(it, cell, targetIso, clientY, copy) {
    const spot = this.timedDropSpot(it, cell, clientY);
    const newEndStr = spot.hadEnd ? spot.end : null;
    if (!copy && targetIso === it.date && spot.start === it.start && (!spot.hadEnd || newEndStr === it.end)) return;
    // Ctrl/Cmd: drop a standalone copy, leaving the original (and any series) untouched.
    if (copy) {
      this.copyEventTo(it, { date: targetIso, start: spot.start, end: newEndStr, endDate: null });
      return;
    }
    // A recurring occurrence detaches to a standalone event instead of dragging the whole series.
    if (it.repeat) {
      this.detachOccurrence(it, { date: targetIso, start: spot.start, end: newEndStr, endDate: null });
      return;
    }
    this.mutate((m) => {
      const ev = find(m, it.baseId);
      if (!ev) return;
      ev.date = targetIso;
      ev.start = spot.start;
      if (spot.hadEnd) ev.end = newEndStr;
    });
  }

  /* Draw-to-create: press an empty spot of a week/day column and drag vertically — a snapped
   * ghost grows with the range; release opens quick create with that start & end. Mouse only
   * (on touch, scrolling must win on empty space — a tap already quick-creates). A plain
   * click without movement falls through to the slot's own click handler. */
  enableDrawCreate(col, iso, dayStartMin, dayEndMin) {
    col.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      if (this.view().pending) return; // placement mode owns clicks
      if (e.target.closest('.dn-ev, .dn-mbar, .dn-drag-ghost')) return; // events own their gestures
      const pointerId = e.pointerId;
      const range = Math.max(1, dayEndMin - dayStartMin);
      const minAt = (y) => {
        const r = col.getBoundingClientRect();
        const frac = Math.max(0, Math.min(1, (y - r.top) / r.height));
        return Math.round((dayStartMin + frac * range) / CFG.snap) * CFG.snap;
      };
      const anchor = minAt(e.clientY);
      let startMin = anchor, endMin = anchor + CFG.snap;
      let drawing = false;
      let ghost = null;
      const cleanup = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        if (ghost) ghost.remove();
        document.body.removeClass('dn-drag-active');
        this._activeDrags.delete(cleanup);
      };
      const onMove = (ev) => {
        if (ev.pointerId !== pointerId) return;
        if (!drawing) {
          if (Math.abs(ev.clientY - e.clientY) < 6) return; // not a drag yet
          drawing = true;
          ghost = col.createDiv({ cls: 'dn-drag-ghost' });
          document.body.addClass('dn-drag-active');
        }
        ev.preventDefault();
        const m = minAt(ev.clientY);
        // Drawing works both downward and upward from the anchor, minimum one snap step.
        startMin = Math.max(dayStartMin, Math.min(anchor, m));
        endMin = Math.min(dayEndMin, Math.max(anchor, m));
        if (endMin - startMin < CFG.snap) {
          endMin = Math.min(dayEndMin, startMin + CFG.snap);
          if (endMin - startMin < CFG.snap) startMin = Math.max(dayStartMin, endMin - CFG.snap);
        }
        ghost.style.top = ((startMin - dayStartMin) / range) * 100 + '%';
        ghost.style.height = ((endMin - startMin) / range) * 100 + '%';
        ghost.setText(minToTime(startMin) + '–' + minToTime(endMin));
      };
      const onUp = (ev) => {
        if (ev.pointerId !== pointerId) return;
        const was = drawing;
        const s = startMin, en = endMin;
        cleanup();
        if (!was) return; // plain click — the slot's own handler opens quick create
        // swallow the click that follows the release so the slot doesn't ALSO open a dialog
        const swallow = (ce) => { ce.stopPropagation(); ce.preventDefault(); };
        document.addEventListener('click', swallow, true);
        setTimeout(() => document.removeEventListener('click', swallow, true), 0);
        this.openQuickCreate(iso, { start: minToTime(s), end: minToTime(en) });
      };
      this._activeDrags.add(cleanup);
      document.addEventListener('pointermove', onMove, { passive: false });
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    });
  }

  /* Drag the bottom edge of a timed block (week/day) to change its end time. Snaps to 30 min,
   * keeps at least a 30-min duration, and never exceeds the end of the day. Live-previews the height. */
  enableEventResize(block, handle, it, dayStartMin, dayEndMin) {
    if (it.repeat) return; // like move-drag, don't let one occurrence silently resize the whole series
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault();
      e.stopPropagation(); // don't also start the block's move-drag
      const pointerId = e.pointerId; // only THIS pointer drives the resize (multi-touch safe)
      const col = block.parentElement; // .dn-tg-col — its box maps Y → minutes
      if (!col) return;
      const range = Math.max(1, dayEndMin - dayStartMin);
      // Never store past 23:59 (the model can't represent 24:00); keep preview == committed value.
      const maxEnd = Math.min(dayEndMin, 24 * 60 - 1);
      const startMin = timeToMin(it.start);
      if (startMin == null) return;
      let endMin = it.end != null ? timeToMin(it.end) : startMin + CFG.defaultDur;
      let moved = false;

      block.addClass('dn-resizing');
      document.body.addClass('dn-drag-active');

      const compute = (clientY) => {
        const r = col.getBoundingClientRect();
        const frac = Math.max(0, Math.min(1, (clientY - r.top) / r.height));
        const m = Math.round((dayStartMin + frac * range) / CFG.snap) * CFG.snap; // snap to the grid step
        // Cap at the day end (outermost), floor at a one-step minimum — this ordering never
        // returns a value past maxEnd even when the event starts within one step of the day end.
        return Math.min(maxEnd, Math.max(startMin + CFG.snap, m));
      };
      const cleanup = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        block.removeClass('dn-resizing');
        document.body.removeClass('dn-drag-active');
        this._activeDrags.delete(cleanup);
      };
      const onMove = (ev) => {
        if (ev.pointerId !== pointerId) return; // ignore a second finger's stream
        moved = true;
        endMin = compute(ev.clientY);
        block.style.height = ((endMin - startMin) / range) * 100 + '%'; // live preview
      };
      const onUp = (ev) => {
        if (ev && ev.pointerId !== pointerId) return; // this gesture only ends with its own pointer
        cleanup();
        // swallow the click that fires right after the drag so it doesn't open the editor
        const swallow = (ce) => { ce.stopPropagation(); ce.preventDefault(); };
        document.addEventListener('click', swallow, true);
        setTimeout(() => document.removeEventListener('click', swallow, true), 0);
        if (!moved) return;
        // Never commit a degenerate block: near the day end compute() can floor below a real
        // duration (the day-end cap wins over the one-step minimum), yielding end <= start.
        if (endMin - startMin < CFG.snap) return;
        const endStr = minToTime(endMin);
        if (endStr === it.end) return;
        this.mutate((m) => { const ev = find(m, it.baseId); if (ev) ev.end = endStr; });
      };
      this._activeDrags.add(cleanup);
      document.addEventListener('pointermove', onMove, { passive: false });
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    });
  }

  /* Drag the TOP edge of a timed block (week/day) to change its start time, keeping the end put.
   * Mirror of enableEventResize: snaps to the grid step, keeps at least one step of duration, and
   * never starts before the day window. Live-previews both top and height. */
  enableEventResizeTop(block, handle, it, dayStartMin, dayEndMin) {
    if (it.repeat) return; // like move-drag, don't let one occurrence silently resize the whole series
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault();
      e.stopPropagation(); // don't also start the block's move-drag
      const pointerId = e.pointerId; // only THIS pointer drives the resize (multi-touch safe)
      const col = block.parentElement; // .dn-tg-col — its box maps Y → minutes
      if (!col) return;
      const range = Math.max(1, dayEndMin - dayStartMin);
      const rawEnd = it.end != null ? timeToMin(it.end) : ((timeToMin(it.start) || 0) + CFG.defaultDur);
      // An end of 00:00 means the bottom of THIS day; read as minute 0 it would put the cap
      // below the day start and slam the new start against the top of the grid.
      const endMin = rawEnd === 0 ? DAY_MIN : rawEnd;
      let startMin = timeToMin(it.start);
      if (startMin == null || endMin == null) return;
      let moved = false;

      block.addClass('dn-resizing');
      document.body.addClass('dn-drag-active');

      const compute = (clientY) => {
        const r = col.getBoundingClientRect();
        const frac = Math.max(0, Math.min(1, (clientY - r.top) / r.height));
        const m = Math.round((dayStartMin + frac * range) / CFG.snap) * CFG.snap; // snap to the grid step
        // Floor at the day start, cap one step below the (fixed) end — the ordering keeps a
        // real one-step block even when the end sits within a step of the day start.
        return Math.max(dayStartMin, Math.min(endMin - CFG.snap, m));
      };
      const cleanup = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        block.removeClass('dn-resizing');
        document.body.removeClass('dn-drag-active');
        this._activeDrags.delete(cleanup);
      };
      const onMove = (ev) => {
        if (ev.pointerId !== pointerId) return; // ignore a second finger's stream
        moved = true;
        startMin = compute(ev.clientY);
        block.style.top = ((startMin - dayStartMin) / range) * 100 + '%'; // live preview: top…
        block.style.height = ((endMin - startMin) / range) * 100 + '%';   // …and height follow
      };
      const onUp = (ev) => {
        if (ev && ev.pointerId !== pointerId) return; // this gesture only ends with its own pointer
        cleanup();
        // swallow the click that fires right after the drag so it doesn't open the editor
        const swallow = (ce) => { ce.stopPropagation(); ce.preventDefault(); };
        document.addEventListener('click', swallow, true);
        setTimeout(() => document.removeEventListener('click', swallow, true), 0);
        if (!moved) return;
        if (endMin - startMin < CFG.snap) return;
        const startStr = minToTime(startMin);
        if (startStr === it.start) return;
        // Commit the end too: it may have been materialized from the default when it.end was null.
        const endStr = endMin === DAY_MIN ? '00:00' : minToTime(endMin); // keep midnight as midnight

        this.mutate((m) => { const ev = find(m, it.baseId); if (ev) { ev.start = startStr; ev.end = endStr; } });
      };
      this._activeDrags.add(cleanup);
      document.addEventListener('pointermove', onMove, { passive: false });
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    });
  }

  /* Resize a multi-day span (month grid / all-day gutter) by dragging one of its ends across day
   * cells: 'l' moves the start date, 'r' the end date. It snaps to whatever day cell the pointer
   * is over and never passes the opposite end (dragged too far, it clamps there). Desktop only,
   * non-recurring only — wired up in makeSpanBar on the REAL (unclipped) end of the bar. */
  enableSpanResize(handle, it, edge) {
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault();
      e.stopPropagation(); // don't also start the bar's move-drag
      const pointerId = e.pointerId;
      const bar = handle.closest('.dn-mbar');
      let moved = false, targetIso = null, lastCell = null;
      document.body.addClass('dn-drag-active');
      if (bar) bar.addClass('dn-resizing');
      const clearCell = () => { if (lastCell) { lastCell.removeClass('dn-drop-target'); lastCell = null; } };
      const dayCellAt = (x, y) => {
        for (const c of this.el.querySelectorAll('.dn-day[data-iso], .dn-tg-allday-cell[data-iso]')) {
          const r = c.getBoundingClientRect();
          if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return c;
        }
        return null;
      };
      const cleanup = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        document.body.removeClass('dn-drag-active');
        if (bar) bar.removeClass('dn-resizing');
        clearCell();
        this._activeDrags.delete(cleanup);
      };
      const onMove = (ev) => {
        if (ev.pointerId !== pointerId) return;
        moved = true;
        ev.preventDefault();
        clearCell();
        const cell = dayCellAt(ev.clientX, ev.clientY);
        if (cell) { targetIso = cell.dataset.iso; cell.addClass('dn-drop-target'); lastCell = cell; }
      };
      const onUp = (ev) => {
        if (ev && ev.pointerId !== pointerId) return;
        const drop = targetIso;
        cleanup();
        const swallow = (ce) => { ce.stopPropagation(); ce.preventDefault(); };
        document.addEventListener('click', swallow, true);
        setTimeout(() => document.removeEventListener('click', swallow, true), 0);
        if (!moved || !drop) return;
        this.resizeSpan(it, edge, drop);
      };
      this._activeDrags.add(cleanup);
      document.addEventListener('pointermove', onMove, { passive: false });
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    });
  }

  resizeSpan(it, edge, targetIso) {
    this.mutate((m) => {
      const ev = find(m, it.baseId);
      if (!ev || !ev.endDate || !targetIso) return;
      if (edge === 'l') {
        if (targetIso > ev.endDate) targetIso = ev.endDate; // can't pass the end — clamp to it
        if (targetIso === ev.date) return;
        ev.date = targetIso;
      } else {
        if (targetIso < ev.date) targetIso = ev.date; // can't pass the start — clamp to it
        if (targetIso === ev.endDate) return;
        ev.endDate = targetIso;
      }
      if (ev.endDate && ev.endDate <= ev.date) ev.endDate = null; // collapsed → an ordinary one-day event
    });
  }

}

/* A thin grab strip on one end of a span bar (left = start, right = end). */
function makeSpanHandle(bar, edge) {
  return bar.createDiv({ cls: 'dn-mbar-resize dn-mbar-resize-' + edge });
}

function weekDayList(anchorIso) {
  const start = weekStart(moment(anchorIso, 'YYYY-MM-DD'));
  const out = [];
  for (let i = 0; i < 7; i++) out.push(moment(start).add(i, 'day'));
  return out;
}

/* After a modal closes, hand keyboard focus (back) to the calendar grid — this is how
 * "click a day, dismiss the dialog, drive with the arrows" flows without re-touching the mouse. */
function returnFocusToGrid(renderer) {
  if (IS_MOBILE() || !renderer || renderer._destroyed) return;
  const g = renderer._gridEl;
  if (g && g.isConnected && !renderer.view().pending) g.focus({ preventScroll: true });
}

/* Sort items within a day: all-day first, then by start time, then by title. The tail half of an
 * event that ran past midnight sorts by its segment start (00:00), not by the previous evening. */
function cmpItems(a, b) {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  const ka = a.segStart || a.start || '', kb = b.segStart || b.start || '';
  return ka.localeCompare(kb) || (a.title || '').localeCompare(b.title || '');
}

/* ------------------------------------------------------------------ *
 * Event editor modal                                                  *
 * ------------------------------------------------------------------ */
class EventModal extends Modal {
  constructor(app, renderer, ev, defaults) {
    super(app);
    this.renderer = renderer;
    this.ev = ev; // existing event or null
    this.defaults = defaults || {};
  }

  // The current live renderer for this block — the captured one may have been destroyed by a
  // reprocess while the modal was open; committing to a dead renderer would silently fail.
  live() {
    const r = this.renderer;
    return (r.plugin.liveRenderers && r.plugin.liveRenderers.get(r.stateKey())) || r;
  }

  onOpen() {
    const { contentEl, titleEl } = this;
    contentEl.addClass('dn-modal');
    if (this.modalEl) this.modalEl.addClass('dn-event-modal'); // a narrower modal box
    titleEl.setText(this.ev ? t('editEvent') : t('newEvent'));

    const src = this.ev || {};
    const state = {
      title: src.title || this.defaults.title || '',
      date: src.date || this.defaults.date || isoToday(),
      allDay: this.ev ? !src.start : !this.defaults.start,
      start: src.start || this.defaults.start || '09:00',
      end: src.end || this.defaults.end || '',
      endDate: src.endDate || '',
      repeat: src.repeat || null,
      done: !!(this.ev && src.done),
      task: this.ev ? !!src.task : !!this.defaults.task,
      color: src.color || null, // null = the theme accent ('default' swatch)
      note: src.note || '',
    };

    // Left column = the row's toggle/label, right column = its control(s). Keeping both
    // checkboxes in that left column (not floating after the fields) is what reads as tidy.

    // Row 0 — kind: Event or Task (a task is a no-time to-do)
    const typeRow = contentEl.createDiv({ cls: 'dn-row' });
    typeRow.createSpan({ cls: 'dn-row-label', text: t('e_kind') });
    const seg = typeRow.createDiv({ cls: 'dn-seg' });
    [[false, t('e_event')], [true, t('e_task')]].forEach(([isTask, label]) => {
      const b = seg.createEl('button', { cls: 'dn-seg-btn' + (!!state.task === isTask ? ' is-on' : ''), text: label });
      b.addEventListener('click', () => {
        state.task = isTask;
        seg.querySelectorAll('.dn-seg-btn').forEach((x) => x.removeClass('is-on'));
        b.addClass('is-on');
        syncKind();
      });
    });

    // Row 1 — Done (when editing) + title
    const r1 = contentEl.createDiv({ cls: 'dn-row' });
    if (this.ev) this.checkToggle(r1, t('e_done'), state.done, (v) => { state.done = v; });
    else r1.createSpan({ cls: 'dn-toggle-spacer' });
    const titleInput = r1.createEl('input', { cls: 'dn-in dn-grow', attr: { type: 'text', value: state.title, placeholder: t('e_title') } });
    setTimeout(() => { titleInput.focus(); titleInput.select(); }, 0);
    titleInput.addEventListener('input', () => { state.title = titleInput.value; });

    // Row 2 — All-day (events only) + date + repeat. For a task the toggle is replaced by a
    // spacer (a task is always all-day), keeping the date aligned with the title above.
    const r2 = contentEl.createDiv({ cls: 'dn-row' });
    const allDayToggle = this.checkToggle(r2, t('e_allday'), state.allDay, (v) => { state.allDay = v; syncAllDay(); });
    const allDaySpacer = r2.createSpan({ cls: 'dn-toggle-spacer dn-hide' });
    const dateInput = r2.createEl('input', { cls: 'dn-in', attr: { type: 'date', value: state.date } });
    dateInput.addEventListener('change', () => { state.date = dateInput.value; });
    const repSel = r2.createEl('select', { cls: 'dn-in dn-grow' });
    const curRep = state.repeat ? state.repeat.unit : 'none';
    [['none', t('r_none')], ['day', t('r_daily')], ['week', t('r_weekly')], ['month', t('r_monthly')], ['year', t('r_yearly')], ['weekday', t('r_weekday')], ['weekdays', t('r_weekdays')]].forEach(([val, label]) => {
      const o = repSel.createEl('option', { value: val, text: label });
      if (curRep === val) o.selected = true;
    });

    // Interval — the N of "every N weeks". The engine has always understood it (advanceDue,
    // fastForward, repeatLabel); until now the dialog couldn't express it, so such a rule could
    // only be written by hand into the JSON and had to be pinned as an opaque option to survive
    // a save. A plain number field says the same thing and round-trips by itself.
    const intervalRow = contentEl.createDiv({ cls: 'dn-row' });
    intervalRow.createSpan({ cls: 'dn-row-label', text: t('e_interval') });
    const everyInput = intervalRow.createEl('input', {
      cls: 'dn-in dn-in-times',
      attr: { type: 'number', min: '1', max: '999', value: String((state.repeat && Number(state.repeat.every)) || 1) },
    });
    const everyUnit = intervalRow.createSpan({ cls: 'dn-until-or' });
    intervalRow.createSpan({ cls: 'dn-row-hint', text: t('e_intervalHint') });
    this._everyInput = everyInput; // read on commit (see readRepeat)

    // "On selected weekdays" — a row of day chips, shown only when repeat = weekdays
    const wdRow = contentEl.createDiv({ cls: 'dn-row' });
    wdRow.createSpan({ cls: 'dn-toggle-spacer' });
    const wdWrap = wdRow.createDiv({ cls: 'dn-wd-pick' });
    const selDays = new Set(
      (state.repeat && state.repeat.unit === 'weekdays' && Array.isArray(state.repeat.days) && state.repeat.days.length)
        ? state.repeat.days
        : [moment(state.date, 'YYYY-MM-DD').day()] // default to the event's own weekday
    );
    const wminNames = moment.weekdaysMin();
    const fd = fdow();
    for (let i = 0; i < 7; i++) {
      const dnum = (fd + i) % 7;
      const btn = wdWrap.createSpan({ cls: 'dn-wd-btn' + (selDays.has(dnum) ? ' is-on' : ''), text: wminNames[dnum], attr: { role: 'button', tabindex: '0', 'aria-pressed': String(selDays.has(dnum)) } });
      const toggle = () => {
        if (selDays.has(dnum)) selDays.delete(dnum); else selDays.add(dnum);
        btn.toggleClass('is-on', selDays.has(dnum));
        btn.setAttribute('aria-pressed', String(selDays.has(dnum)));
      };
      btn.addEventListener('click', toggle);
      btn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    }
    this._selDays = selDays; // read on commit

    // Repeat end — a date ("until", inclusive), with an "N times" helper that just computes
    // that date from the rule. Only the date is stored; empty = the series never ends.
    const untilRow = contentEl.createDiv({ cls: 'dn-row' });
    untilRow.createSpan({ cls: 'dn-row-label', text: t('e_until') });
    const untilInput = untilRow.createEl('input', { cls: 'dn-in', attr: { type: 'date', value: (state.repeat && state.repeat.until) || '' } });
    untilRow.createSpan({ cls: 'dn-until-or', text: t('e_orTimes') });
    const timesInput = untilRow.createEl('input', { cls: 'dn-in dn-in-times', attr: { type: 'number', min: '1', max: '999', placeholder: '∞' } });
    timesInput.addEventListener('change', () => {
      const n = Math.floor(Number(timesInput.value));
      if (n >= 1) {
        const rep = normalizeRepeat(this.readRepeat(repSel, dateInput.value || state.date));
        if (rep) untilInput.value = nthOccurrence(dateInput.value || state.date || isoToday(), rep, n);
      }
    });
    untilInput.addEventListener('change', () => { timesInput.value = ''; }); // a manual date wins

    // Skipped occurrences (the EXDATE list "Delete this occurrence" writes to). A long-running
    // series collects them — and the only way back used to be hand-editing the JSON, which is
    // what the README had to tell people to do. Each skipped date is a chip; clicking it brings
    // that occurrence back. Held in a Set and applied on save, so Cancel really cancels.
    const skipRow = contentEl.createDiv({ cls: 'dn-row dn-row-top' });
    skipRow.createSpan({ cls: 'dn-row-label', text: t('e_skipped') });
    const skipWrap = skipRow.createDiv({ cls: 'dn-skip-list' });
    this._skipDates = new Set((this.ev && this.ev.skip) || []);
    const renderSkips = () => {
      skipWrap.empty();
      const ds = Array.from(this._skipDates).sort();
      for (const iso of ds) {
        const chip = skipWrap.createSpan({
          cls: 'dn-skip-chip',
          attr: { role: 'button', tabindex: '0', 'aria-label': t('e_skipRestore') },
        });
        chip.createSpan({ text: cap(moment(iso, 'YYYY-MM-DD').format('D MMM YYYY')) });
        setIcon(chip.createSpan({ cls: 'dn-skip-x' }), 'x');
        const restore = () => { this._skipDates.delete(iso); renderSkips(); syncRep(); };
        chip.addEventListener('click', restore);
        chip.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); restore(); } });
      }
      if (ds.length > 1) {
        const all = skipWrap.createEl('button', { cls: 'dn-skip-all', text: t('e_skipAll') });
        all.addEventListener('click', () => { this._skipDates.clear(); renderSkips(); syncRep(); });
      }
    };
    renderSkips();

    // Row 3 — times (timed events)
    const timeRow = contentEl.createDiv({ cls: 'dn-row' });
    timeRow.createSpan({ cls: 'dn-row-label', text: t('e_time') });
    const startInput = timeRow.createEl('input', { cls: 'dn-in dn-in-time', attr: { type: 'time', value: state.start } });
    startInput.addEventListener('change', () => {
      // Moving the start drags the end along, preserving the duration — a 14:00–15:30
      // meeting moved to 16:00 becomes 16:00–17:30, not 16:00–15:30. A 23:00 start wraps the
      // end past midnight instead of being flattened against 23:59.
      const oldS = timeToMin(state.start), oldE = timeToMin(state.end), newS = timeToMin(startInput.value);
      state.start = startInput.value;
      if (oldS != null && oldE != null && newS != null && oldE > oldS) {
        state.end = minToTime((newS + (oldE - oldS)) % DAY_MIN);
        endInput.value = state.end;
      }
      syncOvernight();
    });
    timeRow.createSpan({ cls: 'dn-row-dash', text: '–' });
    const endInput = timeRow.createEl('input', { cls: 'dn-in dn-in-time', attr: { type: 'time', value: state.end } });
    // An end before the start is legal now — it means the next morning. Say so, so nobody
    // reads "23:00 – 02:00" as a typo the dialog was about to silently repair.
    const overnightTag = timeRow.createSpan({ cls: 'dn-overnight-tag dn-hide', text: t('nextDay') });
    const syncOvernight = () => {
      overnightTag.toggleClass('dn-hide', !crossesMidnight({ start: normTime(state.start), end: normTime(state.end) }));
    };
    endInput.addEventListener('change', () => { state.end = endInput.value; syncOvernight(); });
    syncOvernight();

    // Row 4 — end date (all-day multi-day)
    const endDateRow = contentEl.createDiv({ cls: 'dn-row' });
    endDateRow.createSpan({ cls: 'dn-row-label', text: t('e_endDate') });
    const endDateInput = endDateRow.createEl('input', { cls: 'dn-in', attr: { type: 'date', value: state.endDate } });
    endDateInput.addEventListener('change', () => { state.endDate = endDateInput.value; });

    // Row 5 — color: the same semantic swatches the views draw with (theme variables, no raw hex)
    const colorRow = contentEl.createDiv({ cls: 'dn-row' });
    colorRow.createSpan({ cls: 'dn-row-label', text: t('e_color') });
    const swWrap = colorRow.createDiv({ cls: 'dn-color-pick', attr: { role: 'radiogroup', 'aria-label': t('e_color') } });
    for (const key of COLOR_KEYS) {
      const on = (state.color || 'default') === key;
      const sw = swWrap.createSpan({
        cls: 'dn-color-swatch dn-c-' + key + (on ? ' is-on' : ''),
        attr: { role: 'radio', tabindex: '0', 'aria-checked': String(on), 'aria-label': t('c_' + key) },
      });
      const pick = () => {
        state.color = key === 'default' ? null : key;
        swWrap.querySelectorAll('.dn-color-swatch').forEach((x) => { x.removeClass('is-on'); x.setAttribute('aria-checked', 'false'); });
        sw.addClass('is-on');
        sw.setAttribute('aria-checked', 'true');
      };
      sw.addEventListener('click', pick);
      sw.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    }

    // Row 6 — note: free text; the views surface it in hover tooltips and under the agenda title
    const noteRow = contentEl.createDiv({ cls: 'dn-row dn-row-top' });
    noteRow.createSpan({ cls: 'dn-row-label', text: t('e_note') });
    const noteInput = noteRow.createEl('textarea', { cls: 'dn-in dn-grow dn-note-in', attr: { rows: '2', placeholder: t('e_note') } });
    noteInput.value = state.note;
    noteInput.addEventListener('input', () => { state.note = noteInput.value; });

    const syncAllDay = () => {
      timeRow.toggleClass('dn-hide', state.allDay || state.task);   // tasks never have a time
      endDateRow.toggleClass('dn-hide', !state.allDay || state.task); // tasks are single-day
    };
    // Task ⇒ no time (driven by state.task, NOT state.allDay — so switching Task→Event keeps the
    // event's original all-day choice and doesn't silently drop its time). Just swap the toggle for
    // a spacer; syncAllDay already treats a task as time-less on its own.
    const syncKind = () => {
      allDayToggle.toggleClass('dn-hide', state.task);
      allDaySpacer.toggleClass('dn-hide', !state.task);
      syncAllDay();
    };
    const syncRep = () => {
      wdRow.toggleClass('dn-hide', repSel.value !== 'weekdays');
      untilRow.toggleClass('dn-hide', repSel.value === 'none');
      // Only day/week/month/year take an interval — "every 2 weekdays" isn't a thing.
      const hasInterval = UNITS.includes(repSel.value);
      intervalRow.toggleClass('dn-hide', !hasInterval);
      if (hasInterval) everyUnit.setText(t('u_' + repSel.value));
      skipRow.toggleClass('dn-hide', repSel.value === 'none' || !this._skipDates.size);
    };
    repSel.addEventListener('change', syncRep);
    syncKind();
    syncRep();

    // Buttons
    const foot = contentEl.createDiv({ cls: 'dn-modal-foot' });
    if (this.ev) {
      const del = foot.createEl('button', { cls: 'mod-warning', text: t('m_delete') });
      del.addEventListener('click', () => {
        // No confirmation — undo covers it; onClose hands focus back to the grid for Ctrl+Z.
        const r = this.live();
        r.mutate((m) => { m.events = m.events.filter((x) => x.id !== this.ev.id); });
        r.offerUndo();
        this.close();
      });
    }
    foot.createDiv({ cls: 'dn-foot-spacer' });
    foot.createEl('button', { text: t('cancel') }).addEventListener('click', () => this.close());
    const save = foot.createEl('button', { cls: 'mod-cta', text: t('save') });
    let committed = false; // plain Enter and the button can both fire — never save (or add) twice
    const commit = () => {
      if (committed) return;
      committed = true;
      const noTime = state.task || state.allDay;
      const fields = {
        title: state.title.trim(),
        task: state.task,
        date: state.date || isoToday(),
        start: noTime ? null : (normTime(state.start) || '09:00'),
        end: noTime ? null : (normTime(state.end) || null),
        endDate: (!state.task && state.allDay) ? (state.endDate || null) : null,
        repeat: null,
        color: state.color, // null ⇒ normalizeEvent drops it (theme accent)
        note: state.note.trim(),
      };
      let rep0 = this.readRepeat(repSel, fields.date);
      if (rep0) {
        rep0 = Object.assign({}, rep0); // never mutate the pinned custom rule in place
        if (untilInput.value) rep0.until = untilInput.value; else delete rep0.until;
      }
      fields.repeat = rep0;
      // The dialog's skip list wins: cleanEvent() below carries the stored one forward, so a
      // restored occurrence would otherwise come straight back on save.
      fields.skip = rep0 ? Array.from(this._skipDates).sort() : null;
      if (this.ev) {
        fields.done = state.done;
        fields.completedAt = state.done ? (this.ev.completedAt || isoToday()) : null;
        // Completing a recurring TASK advances the series to its next occurrence instead of
        // marking the base done — mirrors ticking the checkbox in the grid (toggleDone). Only on
        // the done TRANSITION: a series already finished (done past its until) must not roll
        // again on every save. At the series end, finish it as a whole instead. A recurring
        // EVENT never rolls here: this dialog edits the series, so Done means "the whole series
        // is over" — single occurrences are ticked in the grid (they go into doneDates).
        if (fields.repeat && fields.task && state.done && !this.ev.done) {
          let rep = normalizeRepeat(fields.repeat) || fields.repeat;
          if ((rep.unit === 'month' || rep.unit === 'year') && typeof rep.day !== 'number') {
            const base = moment(fields.date, 'YYYY-MM-DD', true);
            rep = Object.assign({}, rep, { day: base.isValid() ? base.date() : todayM().date() });
          }
          const next = advancePastSkips(fields.date, rep, this.ev.skip);
          if (rep.until && next > rep.until) {
            fields.repeat = rep;
            fields.done = true;
            fields.completedAt = isoToday();
            new Notice(t('seriesDone'));
          } else {
            fields.date = next;
            fields.repeat = rep;
            fields.done = false;
            fields.completedAt = null;
            fields.skip = (fields.skip || []).filter((d) => d > fields.date); // prune past skips
            new Notice(t('recurred', relDayLabel(fields.date)));
          }
        }
        this.live().mutate((m) => {
          const ev = find(m, this.ev.id);
          if (!ev) return;
          Object.assign(ev, normalizeEvent(Object.assign(cleanEvent(ev), fields, { id: ev.id, order: ev.order, created: ev.created })));
        });
      } else {
        this.live().addEvent(fields);
      }
      this.close();
    };
    save.addEventListener('click', commit);
    // Enter saves from anywhere in the form (Lev's ask: no mouse trip to the button). Ctrl/Cmd+Enter
    // always saves, even from the multi-line note. Plain Enter saves too, EXCEPT from the note
    // textarea (there it's a newline) and when a button / day-chip / color-swatch holds focus — those
    // act on their own Enter. IME composition (e.isComposing) is left alone.
    contentEl.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.isComposing) return;
      if (e.metaKey || e.ctrlKey) { e.preventDefault(); commit(); return; }
      const el = e.target;
      const tag = (el && el.tagName) || '';
      if (tag === 'TEXTAREA' || tag === 'BUTTON') return;
      if (el && el.classList && (el.classList.contains('dn-wd-btn') || el.classList.contains('dn-color-swatch'))) return;
      e.preventDefault();
      commit();
    });
  }

  readRepeat(repSel, committedDate) {
    const val = repSel.value;
    if (val === 'none') return null;
    if (val === 'weekday') return { unit: 'weekday' };
    if (val === 'weekdays') {
      const days = Array.from(this._selDays || []).sort((a, b) => a - b);
      return days.length ? { unit: 'weekdays', days } : null; // no day chosen ⇒ no repeat
    }
    // The interval field; normalizeRepeat floors it at 1, so a blank or junk entry is "every one".
    const every = Math.max(1, Math.min(999, Math.floor(Number(this._everyInput && this._everyInput.value)) || 1));
    const rep = { every, unit: val };
    // Preserve the day-of-month anchor for month/year rules so an end-of-month event doesn't drift
    // to the 28th. Carry an explicit stored anchor; otherwise derive it from the date being
    // committed (NOT the pre-edit date), so changing the date in the same edit takes effect.
    if (rep.unit === 'month' || rep.unit === 'year') {
      let anchor = (this.ev && this.ev.repeat && typeof this.ev.repeat.day === 'number') ? this.ev.repeat.day : null;
      if (anchor == null) {
        const b = moment(committedDate || (this.ev && this.ev.date), 'YYYY-MM-DD', true);
        if (b.isValid()) anchor = b.date();
      }
      if (anchor >= 1 && anchor <= 31) rep.day = anchor;
    }
    return rep;
  }

  onClose() {
    this.contentEl.empty();
    returnFocusToGrid(this.live());
  }

  /* A tidy labelled checkbox (reuses the rounded .dn-check look from the agenda). */
  checkToggle(parent, label, checked, onChange) {
    let val = !!checked;
    const wrap = parent.createDiv({ cls: 'dn-toggle', attr: { role: 'checkbox', tabindex: '0', 'aria-checked': String(val), 'aria-label': label } });
    const box = wrap.createSpan({ cls: 'dn-check' + (val ? ' is-done' : '') });
    if (val) setIcon(box, 'check');
    wrap.createSpan({ cls: 'dn-toggle-label', text: label });
    const toggle = () => {
      val = !val;
      box.toggleClass('is-done', val);
      box.empty();
      if (val) setIcon(box, 'check');
      wrap.setAttribute('aria-checked', String(val));
      onChange(val);
    };
    wrap.addEventListener('click', toggle);
    wrap.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    return wrap;
  }
}

/* ------------------------------------------------------------------ *
 * Quick create — title, Enter, compact time, Enter to add             *
 * (two Enters with an empty time → an all-day event)                  *
 * ------------------------------------------------------------------ */
class QuickCreateModal extends Modal {
  constructor(app, renderer, dateIso, opts) {
    super(app);
    this.renderer = renderer;
    this.dateIso = dateIso;
    this.opts = opts || {};
  }

  // Re-resolve the live renderer in case a reprocess replaced it while this modal was open.
  live() {
    const r = this.renderer;
    return (r.plugin.liveRenderers && r.plugin.liveRenderers.get(r.stateKey())) || r;
  }

  onOpen() {
    const { contentEl, titleEl } = this;
    contentEl.addClass('dn-quick');
    titleEl.setText(t('newEvent'));
    contentEl.createDiv({ cls: 'dn-quick-date', text: cap(moment(this.dateIso, 'YYYY-MM-DD').format('dddd, D MMMM YYYY')) });

    const titleInput = contentEl.createEl('input', { cls: 'dn-in dn-quick-title', attr: { type: 'text', placeholder: t('e_title') } });

    // Task toggle — a task is added immediately (no time step).
    let isTask = !!this.opts.task;
    const taskRow = contentEl.createDiv({ cls: 'dn-quick-taskrow' });
    const tglWrap = taskRow.createDiv({ cls: 'dn-toggle', attr: { role: 'checkbox', tabindex: '0', 'aria-checked': String(isTask), 'aria-label': t('e_task') } });
    const tglBox = tglWrap.createSpan({ cls: 'dn-check' + (isTask ? ' is-done' : '') });
    if (isTask) setIcon(tglBox, 'check');
    tglWrap.createSpan({ cls: 'dn-toggle-label', text: t('e_task') });

    const timeRow = contentEl.createDiv({ cls: 'dn-quick-timerow dn-hide' });
    setIcon(timeRow.createSpan({ cls: 'dn-quick-clock' }), 'clock');
    const timeInput = timeRow.createEl('input', { cls: 'dn-in dn-quick-time', attr: { type: 'text', inputmode: 'numeric', placeholder: t('timePlaceholder'), value: this.opts.start || '' } });
    const hint = contentEl.createDiv({ cls: 'dn-quick-hint', text: isTask ? t('quickTaskHint') : t('quickHint') });

    const syncTask = () => {
      tglBox.toggleClass('is-done', isTask);
      tglBox.empty();
      if (isTask) setIcon(tglBox, 'check');
      tglWrap.setAttribute('aria-checked', String(isTask));
      if (isTask) timeRow.addClass('dn-hide'); // a task has no time
      hint.setText(isTask ? t('quickTaskHint') : t('quickHint'));
    };
    const toggleTask = () => { isTask = !isTask; syncTask(); titleInput.focus(); };
    tglWrap.addEventListener('click', toggleTask);
    tglWrap.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleTask(); } });

    setTimeout(() => { titleInput.focus(); }, 0);

    let committed = false;
    const commit = () => {
      if (committed) return;
      const title = titleInput.value.trim();
      if (!title) { titleInput.focus(); return; }
      let start = null, endTyped = null;
      if (!isTask) {
        const val = timeInput.value.trim();
        if (val) {
          const r = parseTimeRange(val); // "15-18" → start 15:00 + end 18:00; "1518"/"15:18" → start only
          if (!r) { timeRow.removeClass('dn-hide'); timeInput.focus(); timeInput.select(); return; } // invalid → let them fix it
          start = r.start;
          endTyped = r.end;
        }
      }
      committed = true;
      let end = endTyped;
      // A drawn range (drag-to-create) carries its duration — but a typed end wins. Even if the
      // user typed a different start, the drawn end shifts along keeping the drawn length.
      if (!isTask && start && !end && this.opts.end && this.opts.start) {
        const dur = timeToMin(this.opts.end) - timeToMin(this.opts.start);
        if (dur > 0) end = minToTime((timeToMin(start) + dur) % DAY_MIN); // wraps rather than flattening to 23:59
      }
      this.live().addEvent({ title, date: this.dateIso, start: isTask ? null : start, end: isTask ? null : end, task: isTask });
      this.close();
    };

    // First Enter: a task is added right away; an event reveals the time field. Second Enter (in
    // the time field) adds the event — empty time means all-day.
    titleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!titleInput.value.trim()) return;
        if (e.ctrlKey || e.metaKey) { isTask = true; syncTask(); } // Ctrl/Cmd+Enter → add as a task
        if (isTask) { commit(); return; }
        timeRow.removeClass('dn-hide');
        timeInput.focus();
        timeInput.select();
      } else if (e.key === 'Escape') { e.preventDefault(); this.close(); }
    });
    timeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { e.preventDefault(); this.close(); }
    });

    const foot = contentEl.createDiv({ cls: 'dn-modal-foot' });
    const more = foot.createEl('button', { text: t('moreOptions') });
    more.addEventListener('click', () => {
      committed = true;
      const val = timeInput.value.trim();
      const r = val ? parseTimeRange(val) : null; // carry a typed range into the editor
      const start = r ? r.start : (this.opts.start || null);
      const end = (r && r.end) ? r.end : (this.opts.end || null);
      this.close();
      this.live().openEditor(null, { date: this.dateIso, title: titleInput.value.trim(), start: isTask ? null : start, end: isTask ? null : end, task: isTask });
    });
    foot.createDiv({ cls: 'dn-foot-spacer' });
    foot.createEl('button', { text: t('cancel') }).addEventListener('click', () => this.close());
    foot.createEl('button', { cls: 'mod-cta', text: t('save') }).addEventListener('click', () => commit());
  }

  onClose() {
    this.contentEl.empty();
    returnFocusToGrid(this.live());
  }
}

/* The date this event next lands on, at or after fromIso — a plain event's own date, a series'
 * next live occurrence. Used to order search hits by "when will I actually see this". */
function nextOccurrenceDate(ev, fromIso) {
  if (!ev.repeat || ev.date >= fromIso) return ev.date;
  const horizon = moment(fromIso, 'YYYY-MM-DD').add(400, 'day').format('YYYY-MM-DD');
  const insts = expandInstances(ev, fromIso, horizon, 1); // only the first — see expandInstances
  return insts.length ? insts[0].date : ev.date;
}

/* ------------------------------------------------------------------ *
 * Search — find an event by title or description, jump to its date    *
 * ------------------------------------------------------------------ */
class SearchModal extends Modal {
  constructor(app, renderer) { super(app); this.renderer = renderer; this.sel = 0; this.hits = []; }

  live() {
    const r = this.renderer;
    return (r.plugin.liveRenderers && r.plugin.liveRenderers.get(r.stateKey())) || r;
  }

  onOpen() {
    const { contentEl, titleEl } = this;
    contentEl.addClass('dn-modal');
    if (this.modalEl) this.modalEl.addClass('dn-event-modal');
    titleEl.setText(t('search'));
    this.input = contentEl.createEl('input', { cls: 'dn-in dn-grow dn-search-in', attr: { type: 'text', placeholder: t('searchPlaceholder') } });
    this.countEl = contentEl.createDiv({ cls: 'dn-search-count' });
    this.listEl = contentEl.createDiv({ cls: 'dn-search-list' });
    this.input.addEventListener('input', () => { this.sel = 0; this.renderList(); });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); this.move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); this.move(-1); }
      // Enter goes to the date; Ctrl/Cmd+Enter opens the event itself, which is what you
      // want when the search was "where did I put that thing" rather than "take me there".
      else if (e.key === 'Enter') { e.preventDefault(); this.commit(this.hits[this.sel], e.ctrlKey || e.metaKey); }
    });
    setTimeout(() => this.input.focus(), 0);
    this.renderList();
  }

  /* Search the BASE events, not the expanded instances: a weekly series is one hit, dated by its
   * next live occurrence. Upcoming first (soonest at the top), then the past, most recent first. */
  search(q) {
    const needle = q.trim().toLowerCase();
    const today = isoToday();
    const events = (this.live().model && this.live().model.events) || [];
    const hits = [];
    for (const ev of events) {
      if (needle && ((ev.title || '') + ' ' + (ev.note || '')).toLowerCase().indexOf(needle) < 0) continue;
      hits.push({ ev, when: nextOccurrenceDate(ev, today) || ev.date });
    }
    hits.sort((a, b) => {
      const ap = a.when < today ? 1 : 0, bp = b.when < today ? 1 : 0;
      if (ap !== bp) return ap - bp;
      return ap ? b.when.localeCompare(a.when) : a.when.localeCompare(b.when);
    });
    return hits.slice(0, 80);
  }

  renderList() {
    this.hits = this.search(this.input.value);
    this.countEl.setText(this.hits.length ? t('searchHint', this.hits.length) : '');
    const list = this.listEl;
    list.empty();
    if (!this.hits.length) { list.createDiv({ cls: 'dn-empty', text: t('searchEmpty') }); return; }
    this.rowEls = this.hits.map((hit, i) => {
      const ev = hit.ev;
      const row = list.createDiv({ cls: 'dn-search-row' + (i === this.sel ? ' is-sel' : '') + (ev.color ? ' dn-c-' + ev.color : '') + (ev.done ? ' is-done' : '') });
      row.createSpan({ cls: 'dn-search-date', text: cap(moment(hit.when, 'YYYY-MM-DD').format('D MMM YYYY')) });
      const main = row.createDiv({ cls: 'dn-search-main' });
      main.createDiv({ cls: 'dn-search-title', text: (ev.start ? ev.start + ' ' : '') + (ev.title || '…') });
      const sub = [ev.repeat ? repeatLabel(ev.repeat) : '', ev.note || ''].filter(Boolean).join(' · ');
      if (sub) main.createDiv({ cls: 'dn-search-sub', text: sub });
      row.addEventListener('click', (e) => this.commit(hit, e.ctrlKey || e.metaKey));
      const edit = row.createSpan({ cls: 'dn-search-edit', attr: { role: 'button', tabindex: '-1', 'aria-label': t('m_edit') } });
      setIcon(edit, 'pencil');
      edit.addEventListener('click', (e) => { e.stopPropagation(); this.commit(hit, true); });
      return row;
    });
  }

  move(dir) {
    if (!this.hits.length) return;
    this.sel = (this.sel + dir + this.hits.length) % this.hits.length;
    (this.rowEls || []).forEach((el, i) => el.toggleClass('is-sel', i === this.sel));
    const el = (this.rowEls || [])[this.sel];
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }

  /* Jumping is enough for most hits: every view renders the day it lands on, so the event is
   * right there. `edit` also opens it, for when finding it was only the first half of the job. */
  commit(hit, edit) {
    if (!hit) return;
    this.close();
    const r = this.live();
    r.goToDate(hit.when || hit.ev.date);
    if (edit) {
      const ev = find(r.model, hit.ev.id); // re-resolve: the model may have been reparsed
      if (ev) r.openEditor(ev);
    }
  }

  onClose() { this.contentEl.empty(); returnFocusToGrid(this.live()); }
}

/* ------------------------------------------------------------------ *
 * Calendar name                                                       *
 * ------------------------------------------------------------------ */
class TitleModal extends Modal {
  constructor(app, renderer) { super(app); this.renderer = renderer; }

  live() {
    const r = this.renderer;
    return (r.plugin.liveRenderers && r.plugin.liveRenderers.get(r.stateKey())) || r;
  }

  onOpen() {
    const { contentEl, titleEl } = this;
    contentEl.addClass('dn-modal');
    if (this.modalEl) this.modalEl.addClass('dn-event-modal');
    titleEl.setText(t('calTitle'));
    contentEl.createDiv({ cls: 'dn-quick-hint', text: t('calTitleHint') });
    const row = contentEl.createDiv({ cls: 'dn-row' });
    const cur = (this.live().model && this.live().model.title) || '';
    const input = row.createEl('input', { cls: 'dn-in dn-grow', attr: { type: 'text', value: cur, placeholder: t('calTitle') } });
    setTimeout(() => { input.focus(); input.select(); }, 0);
    const commit = () => {
      const val = input.value.trim();
      if (val !== cur) this.live().mutate((m) => { m.title = val; });
      this.close();
    };
    const foot = contentEl.createDiv({ cls: 'dn-modal-foot' });
    foot.createDiv({ cls: 'dn-foot-spacer' });
    foot.createEl('button', { text: t('cancel') }).addEventListener('click', () => this.close());
    foot.createEl('button', { cls: 'mod-cta', text: t('save') }).addEventListener('click', commit);
    contentEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); commit(); } });
  }

  onClose() { this.contentEl.empty(); returnFocusToGrid(this.live()); }
}

/* ------------------------------------------------------------------ *
 * Quarantined records — the ones with no usable date (see normalizeCal)*
 * ------------------------------------------------------------------ */
class OrphanModal extends Modal {
  constructor(app, renderer) { super(app); this.renderer = renderer; }

  live() {
    const r = this.renderer;
    return (r.plugin.liveRenderers && r.plugin.liveRenderers.get(r.stateKey())) || r;
  }

  onOpen() {
    const { contentEl, titleEl } = this;
    contentEl.addClass('dn-modal');
    if (this.modalEl) this.modalEl.addClass('dn-event-modal');
    titleEl.setText(t('orphanTitle'));
    contentEl.createDiv({ cls: 'dn-orphan-hint', text: t('orphanHint') });
    this.listEl = contentEl.createDiv({ cls: 'dn-orphan-list' });
    this.renderList();
    const foot = contentEl.createDiv({ cls: 'dn-modal-foot' });
    foot.createDiv({ cls: 'dn-foot-spacer' });
    foot.createEl('button', { cls: 'mod-cta', text: t('cancel') }).addEventListener('click', () => this.close());
  }

  /* Rows are addressed by the serialized raw record, not by index or object identity: a
   * mutation re-parses the block, so both of those change underneath an open dialog. */
  renderList() {
    const list = this.listEl;
    list.empty();
    const orphans = (this.live().model && this.live().model.orphans) || [];
    if (!orphans.length) { list.createDiv({ cls: 'dn-empty', text: t('orphanEmpty') }); return; }
    for (const raw of orphans) {
      const key = JSON.stringify(raw);
      const row = list.createDiv({ cls: 'dn-orphan-row' });
      const main = row.createDiv({ cls: 'dn-orphan-main' });
      main.createDiv({ cls: 'dn-orphan-title', text: String(raw.title || raw.text || '…') });
      const rawDate = raw.date != null ? raw.date : raw.due;
      main.createDiv({ cls: 'dn-orphan-raw', text: rawDate ? String(rawDate) : t('orphanNoDate') });
      const dateIn = row.createEl('input', { cls: 'dn-in', attr: { type: 'date', value: isoToday() } });
      const place = row.createEl('button', { cls: 'mod-cta', text: t('orphanRestore') });
      place.addEventListener('click', () => {
        const iso = toIsoDate(dateIn.value);
        if (!iso) { dateIn.focus(); return; }
        this.live().adoptOrphan(key, iso);
        this.renderList();
      });
      row.createEl('button', { cls: 'mod-warning', text: t('m_delete') })
        .addEventListener('click', () => { this.live().dropOrphan(key); this.renderList(); });
    }
  }

  onClose() { this.contentEl.empty(); returnFocusToGrid(this.live()); }
}

/* ------------------------------------------------------------------ *
 * Confirm dialog                                                      *
 * ------------------------------------------------------------------ */
class ConfirmModal extends Modal {
  constructor(app, message, onConfirm, confirmLabel) {
    super(app);
    this.message = message;
    this.onConfirm = onConfirm;
    this.confirmLabel = confirmLabel;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('dn-confirm');
    contentEl.createEl('p', { text: this.message });
    const row = contentEl.createDiv({ cls: 'dn-confirm-row' });
    row.createEl('button', { text: t('cancel') }).addEventListener('click', () => this.close());
    const ok = row.createEl('button', { cls: 'mod-warning', text: this.confirmLabel || t('m_delete') });
    ok.addEventListener('click', () => { this.close(); this.onConfirm(); });
    setTimeout(() => ok.focus(), 0);
  }
  onClose() { this.contentEl.empty(); }
}

/* ------------------------------------------------------------------ *
 * Delete the past — keep the one note from growing forever            *
 * ------------------------------------------------------------------ */
class PurgeModal extends Modal {
  constructor(app, renderer) { super(app); this.renderer = renderer; }

  live() {
    const r = this.renderer;
    return (r.plugin.liveRenderers && r.plugin.liveRenderers.get(r.stateKey())) || r;
  }

  /* The cut-off currently chosen: everything strictly BEFORE this date is up for deletion. */
  cutoff() {
    if (this.choice === 'custom') return toIsoDate(this.dateInput.value) || isoToday();
    const back = { today: 0, month: 1, months3: 3, year: 12 }[this.choice] || 0;
    return moment().subtract(back, 'month').format('YYYY-MM-DD');
  }

  onOpen() {
    const { contentEl, titleEl } = this;
    contentEl.addClass('dn-modal');
    if (this.modalEl) this.modalEl.addClass('dn-event-modal');
    titleEl.setText(t('purge'));
    contentEl.createDiv({ cls: 'dn-quick-hint', text: t('purgeHint') });
    this.choice = 'month';

    const row = contentEl.createDiv({ cls: 'dn-row' });
    row.createSpan({ cls: 'dn-row-label', text: t('purgeOlder') });
    const sel = row.createEl('select', { cls: 'dn-in dn-grow' });
    [['today', t('p_today')], ['month', t('p_month')], ['months3', t('p_3months')], ['year', t('p_year')], ['custom', t('p_custom')]]
      .forEach(([val, label]) => {
        const o = sel.createEl('option', { value: val, text: label });
        if (val === this.choice) o.selected = true;
      });

    const dateRow = contentEl.createDiv({ cls: 'dn-row dn-hide' });
    dateRow.createSpan({ cls: 'dn-row-label', text: t('goToDate') });
    this.dateInput = dateRow.createEl('input', { cls: 'dn-in dn-grow', attr: { type: 'date', value: isoToday() } });

    // The count is the whole point of the dialog: no one can guess what "older than a year"
    // covers in their own note, and a delete this broad should be seen before it happens.
    const countEl = contentEl.createDiv({ cls: 'dn-purge-count' });
    contentEl.createDiv({ cls: 'dn-row-hint dn-purge-keeps', text: t('purgeKeeps') });

    const sync = () => {
      this.choice = sel.value;
      dateRow.toggleClass('dn-hide', this.choice !== 'custom');
      const model = this.live().model;
      const plan = purgePlan((model && model.events) || [], this.cutoff());
      if (!plan.drop.length && !plan.ballast) {
        countEl.setText(t('purgeNothing'));
      } else {
        let text = t('purgeCount', plan.drop.length + ' ' + plural(plan.drop.length, 'rec'));
        if (plan.ballast) text += t('purgeBallast', plan.ballast + ' ' + plural(plan.ballast, 'date'));
        countEl.setText(text);
      }
      go.toggleClass('dn-disabled', !plan.drop.length && !plan.ballast);
    };

    const foot = contentEl.createDiv({ cls: 'dn-modal-foot' });
    foot.createDiv({ cls: 'dn-foot-spacer' });
    foot.createEl('button', { text: t('cancel') }).addEventListener('click', () => this.close());
    const go = foot.createEl('button', { cls: 'mod-warning', text: t('m_delete') });
    go.addEventListener('click', () => {
      const iso = this.cutoff();
      this.close();
      this.live().purgePast(iso);
    });
    sel.addEventListener('change', sync);
    this.dateInput.addEventListener('change', sync);
    sync();
  }

  onClose() { this.contentEl.empty(); returnFocusToGrid(this.live()); }
}

/* One date field and a Save — for "postpone to a date…". GoToDateModal is its sibling but moves
 * the VIEW (and carries its own Today button); this one hands a date to whoever asked. */
class DatePickModal extends Modal {
  constructor(app, renderer, title, initialIso, onPick) {
    super(app);
    this.renderer = renderer;
    this.pickTitle = title;
    this.initialIso = initialIso;
    this.onPick = onPick;
  }

  onOpen() {
    const { contentEl, titleEl } = this;
    contentEl.addClass('dn-modal');
    if (this.modalEl) this.modalEl.addClass('dn-event-modal');
    titleEl.setText(this.pickTitle);
    const row = contentEl.createDiv({ cls: 'dn-row' });
    const input = row.createEl('input', { cls: 'dn-in dn-grow', attr: { type: 'date', value: this.initialIso || isoToday() } });
    setTimeout(() => { input.focus(); }, 0);
    const commit = () => { const iso = toIsoDate(input.value); this.close(); if (iso) this.onPick(iso); };
    const foot = contentEl.createDiv({ cls: 'dn-modal-foot' });
    foot.createDiv({ cls: 'dn-foot-spacer' });
    foot.createEl('button', { text: t('cancel') }).addEventListener('click', () => this.close());
    foot.createEl('button', { cls: 'mod-cta', text: t('save') }).addEventListener('click', commit);
    contentEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); commit(); } });
  }

  onClose() { this.contentEl.empty(); returnFocusToGrid(this.renderer); }
}

/* A tiny date jumper: a native date field + Go / Today. Enter commits; closing hands focus
 * back to the grid so the arrows keep working. */
class GoToDateModal extends Modal {
  constructor(app, renderer) { super(app); this.renderer = renderer; }

  // Same as the other modals: a reprocess may have replaced the renderer we were opened
  // against, and jumping a destroyed one would silently do nothing.
  live() {
    const r = this.renderer;
    return (r.plugin.liveRenderers && r.plugin.liveRenderers.get(r.stateKey())) || r;
  }

  onOpen() {
    const { contentEl, titleEl } = this;
    contentEl.addClass('dn-modal');
    if (this.modalEl) this.modalEl.addClass('dn-event-modal');
    titleEl.setText(t('goToDate'));
    const v = this.live().view();
    const row = contentEl.createDiv({ cls: 'dn-row' });
    const input = row.createEl('input', { cls: 'dn-in dn-grow', attr: { type: 'date', value: v.anchor || isoToday() } });
    setTimeout(() => { input.focus(); }, 0);
    const go = () => { const iso = toIsoDate(input.value); this.close(); if (iso) this.live().goToDate(iso); };
    const foot = contentEl.createDiv({ cls: 'dn-modal-foot' });
    foot.createDiv({ cls: 'dn-foot-spacer' });
    foot.createEl('button', { text: t('today') }).addEventListener('click', () => { this.close(); this.live().goToday(); });
    foot.createEl('button', { cls: 'mod-cta', text: t('goBtn') }).addEventListener('click', go);
    contentEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  }
  onClose() { this.contentEl.empty(); returnFocusToGrid(this.live()); }
}

/* ------------------------------------------------------------------ *
 * Settings tab                                                        *
 * ------------------------------------------------------------------ */
class MdCalendarSettingTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName(t('s_viewDesktop'))
      .addDropdown((d) => {
        VIEW_CYCLE.forEach((v) => d.addOption(v, t('v_' + v)));
        d.setValue(this.plugin.settings.firstView).onChange(async (v) => { this.plugin.settings.firstView = v; await this.plugin.saveSettings(); });
      });

    new Setting(containerEl)
      .setName(t('s_viewMobile'))
      .addDropdown((d) => {
        MOBILE_VIEWS.forEach((v) => d.addOption(v, t('v_' + v))); // phones get agenda + day only
        const cur = MOBILE_VIEWS.includes(this.plugin.settings.firstViewMobile) ? this.plugin.settings.firstViewMobile : 'agenda';
        d.setValue(cur).onChange(async (v) => { this.plugin.settings.firstViewMobile = v; await this.plugin.saveSettings(); });
      });

    new Setting(containerEl)
      .setName(t('s_fdow'))
      .addDropdown((d) => {
        d.addOption('-1', t('s_fdowAuto'));
        for (const n of [1, 6, 0]) d.addOption(String(n), cap(moment.weekdays()[n])); // Mon, Sat, Sun
        d.setValue(String(this.plugin.settings.firstDayOfWeek)).onChange(async (v) => {
          this.plugin.settings.firstDayOfWeek = Number(v);
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName(t('s_dur'))
      .addSlider((sl) => sl.setLimits(15, 240, 15).setDynamicTooltip().setValue(this.plugin.settings.defaultDurationMin).onChange(async (v) => {
        this.plugin.settings.defaultDurationMin = v;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName(t('s_snap'))
      .addDropdown((d) => {
        [15, 30, 60].forEach((n) => d.addOption(String(n), String(n)));
        d.setValue(String(this.plugin.settings.snapMin)).onChange(async (v) => {
          this.plugin.settings.snapMin = Number(v);
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName(t('s_sound'))
      .setDesc(t('s_soundDesc'))
      .addToggle((tg) => tg.setValue(!!this.plugin.settings.completionSound).onChange(async (v) => {
        this.plugin.settings.completionSound = v;
        if (v) playDoneSound(); // instant preview
        await this.plugin.saveSettings();
      }));

    // The two sliders keep the window non-empty by nudging EACH OTHER directly (setValue
    // doesn't fire onChange, so no loop). Never this.display() from a slider's onChange:
    // it fires on every drag step, and rebuilding the tab mid-drag yanks the knob away.
    let startSlider, endSlider;
    new Setting(containerEl)
      .setName(t('s_dayStart'))
      .setDesc(t('s_hoursDesc'))
      .addSlider((sl) => {
        startSlider = sl;
        sl.setLimits(0, 23, 1).setDynamicTooltip().setValue(this.plugin.settings.dayStart).onChange(async (v) => {
          this.plugin.settings.dayStart = v;
          if (this.plugin.settings.dayEnd <= v) {
            this.plugin.settings.dayEnd = Math.min(24, v + 1);
            if (endSlider) endSlider.setValue(this.plugin.settings.dayEnd);
          }
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName(t('s_dayEnd'))
      .addSlider((sl) => {
        endSlider = sl;
        sl.setLimits(1, 24, 1).setDynamicTooltip().setValue(this.plugin.settings.dayEnd).onChange(async (v) => {
          this.plugin.settings.dayEnd = v;
          if (v <= this.plugin.settings.dayStart) {
            this.plugin.settings.dayStart = Math.max(0, v - 1);
            if (startSlider) startSlider.setValue(this.plugin.settings.dayStart);
          }
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName(t('s_monthChips'))
      .setDesc(t('s_monthChipsDesc'))
      .addSlider((sl) => sl.setLimits(2, 10, 1).setDynamicTooltip().setValue(this.plugin.settings.monthChips).onChange(async (v) => {
        this.plugin.settings.monthChips = v;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName(t('s_full'))
      .setDesc(t('s_fullDesc'))
      .addDropdown((d) => {
        for (const scope of FULL_WIDTH_SCOPES) d.addOption(scope, t('s_fullScope_' + scope));
        const cur = FULL_WIDTH_SCOPES.includes(this.plugin.settings.fullWidthScope) ? this.plugin.settings.fullWidthScope : 'desktop';
        d.setValue(cur).onChange(async (v) => {
          this.plugin.settings.fullWidthScope = v;
          await this.plugin.saveSettings();
          this.plugin.refreshAll(); // layout, not data — the open calendars have to redraw
        });
      });

    // Desktop only — a phone has no status bar to put it in.
    if (!IS_MOBILE()) {
      new Setting(containerEl)
        .setName(t('s_status'))
        .setDesc(t('s_statusDesc'))
        .addToggle((tg) => tg.setValue(!!this.plugin.settings.statusBar).onChange(async (v) => {
          this.plugin.settings.statusBar = v;
          await this.plugin.saveSettings();
          this.plugin.refreshStatusBar(v); // turning it on may need the one-off vault scan
        }));
    }

    new Setting(containerEl)
      .setName(t('s_multi'))
      .setDesc(t('s_multiDesc'))
      .addToggle((tg) => tg.setValue(!!this.plugin.settings.multiCalendar).onChange(async (v) => {
        this.plugin.settings.multiCalendar = v;
        await this.plugin.saveSettings();
      }));
  }
}

/* ------------------------------------------------------------------ *
 * Plugin                                                              *
 * ------------------------------------------------------------------ */
const STARTER_BLOCK = '```' + FENCE + '\n{\n  "events": []\n}\n```\n';

/* Character ranges of every md-calendar block in a CodeMirror document. An unterminated
 * block runs to the end of the note — that's how the editor renders it too. */
function calendarBlockRanges(doc) {
  const out = [];
  let from = -1, pos = 0;
  // One walk over the text. doc.line(n) descends the document tree afresh for every line, and
  // the caret guard calls this on every cursor move in every editor, calendar note or not.
  const it = doc.iterLines();
  for (;;) {
    const step = it.next();
    if (step.done) break;
    const text = step.value;
    const end = pos + text.length;
    if (from < 0) { if (DN_FENCE_OPEN.test(text)) from = pos; }
    else if (DN_FENCE_CLOSE.test(text)) { out.push([from, end]); from = -1; }
    pos = end + 1; // and the newline between lines
  }
  if (from >= 0) out.push([from, doc.length]);
  return out;
}

/* The JSON bodies of every md-calendar block in a note's RAW text. This is how the status bar
 * reads a calendar with no renderer anywhere — the note doesn't have to be open. An unterminated
 * block runs to the end of the note, same as the editor renders it. */
function extractCalendarBlocks(text) {
  const lines = String(text || '').split('\n');
  const out = [];
  let open = -1;
  for (let i = 0; i < lines.length; i++) {
    if (open < 0) { if (DN_FENCE_OPEN.test(lines[i])) open = i; }
    else if (DN_FENCE_CLOSE.test(lines[i])) { out.push(lines.slice(open + 1, i).join('\n')); open = -1; }
  }
  if (open >= 0) out.push(lines.slice(open + 1).join('\n'));
  return out;
}

class MdCalendarPlugin extends Plugin {
  async onload() {
    // Keep only known settings keys — earlier versions / a pasted tasknote data.json left stale
    // keys (showTasksByDefault, defaultDurationMin, …) the code never reads; prune them so
    // saveData() stops rewriting cruft.
    const loaded = (await this.loadData()) || {};
    // fullWidth (a plain on/off) became fullWidthScope (which platform) once desktop and mobile
    // needed different defaults. Translate it once so upgrading doesn't silently change what a
    // vault already had — true was applied on both platforms alike, so it becomes 'all', not
    // the new 'desktop'-only default.
    if ('fullWidth' in loaded && !('fullWidthScope' in loaded)) loaded.fullWidthScope = loaded.fullWidth ? 'all' : 'none';
    this.settings = Object.assign({}, DEFAULT_PLUGIN_SETTINGS);
    for (const k of Object.keys(DEFAULT_PLUGIN_SETTINGS)) { if (k in loaded) this.settings[k] = loaded[k]; }
    // Own the object rather than sharing the literal in DEFAULT_PLUGIN_SETTINGS.
    this.settings.viewMemory = (this.settings.viewMemory && typeof this.settings.viewMemory === 'object')
      ? Object.assign({}, this.settings.viewMemory) : {};
    const hadStale = Object.keys(loaded).some((k) => !(k in DEFAULT_PLUGIN_SETTINGS));
    // Forget view state for notes that are gone. Deferred to layout-ready: during onload the
    // vault index isn't populated yet and every lookup would miss, wiping the whole memory.
    this.app.workspace.onLayoutReady(() => {
      const mem = this.settings.viewMemory;
      let pruned = false;
      for (const key of Object.keys(mem)) {
        const cut = key.lastIndexOf('::');
        const path = cut > 0 ? key.slice(0, cut) : '';
        if (!path || !this.app.vault.getAbstractFileByPath(path)) { delete mem[key]; pruned = true; }
      }
      if (pruned) this.saveSettings().catch((e) => console.error('MD Calendar: pruning view memory failed', e));
    });
    // Live renderer per block (key = sourcePath::calId) so open modals commit to the current
    // renderer even if the block was reprocessed while the modal was open.
    this.liveRenderers = new Map();
    this.allRenderers = new Set(); // every live renderer (for cross-block calId de-dup within a note)
    this.activePlacement = null; // the one calendar currently owning keyboard placement
    this._syncCfg();
    if (hadStale) await this.saveSettings(); // one-time cleanup of data.json

    this.registerMarkdownCodeBlockProcessor(FENCE, (source, el, ctx) => {
      const child = new MarkdownRenderChild(el);
      ctx.addChild(child);
      const renderer = new CalendarRenderer(this, el, ctx, child, source);
      child.register(() => renderer.destroy());
      try { renderer.render(); }
      catch (e) { console.error('MD Calendar: render failed', e); el.setText('MD Calendar: ' + (e.message || e)); }
    });

    // In Live Preview a click on the note *around* the calendar — the block's own margin, the
    // strip above or below it — drops the text cursor inside the fence, and the editor answers
    // by unfolding the whole calendar into raw JSON. Swallow those clicks. The block's hover
    // "edit" pencil and Source mode still get you to the source when you actually want it.
    this.registerEditorExtension(EditorView.domEventHandlers({
      mousedown: (evt, view) => {
        const target = evt.target;
        if (!(target instanceof HTMLElement)) return false;
        // The pencil is the deliberate way in — let it through, and let the caret guard below
        // stand aside for the selection it is about to place inside the fence.
        if (target.closest('.edit-block-button')) { this._caretPass = Date.now(); return false; }
        if (target.closest('.md-calendar')) return false; // inside the calendar
        // No rendered block in this editor means Source mode, or a block already unfolded —
        // either way the note is being edited as text and the cursor belongs to the user.
        if (!view.dom.querySelector('.block-language-' + FENCE)) return false;
        const pos = view.posAtCoords({ x: evt.clientX, y: evt.clientY }, false);
        if (pos == null) return false;
        if (!calendarBlockRanges(view.state.doc).some(([from, to]) => pos >= from && pos <= to)) return false;
        evt.preventDefault();
        return true;
      },
    }));

    // The other road into the raw JSON: the caret itself lands inside the fence — a cursor
    // position restored when the note opens, an arrow key walking in from the line above, a jump
    // out of search. Obsidian decides that from the selection and its decorations can't be
    // overridden, so keep the caret out instead: a plain cursor landing inside a calendar is put
    // down on the near side of it, in the direction it was travelling. A selection with a length
    // — Ctrl+A, Shift+arrows — is left alone: that is someone handling the note as text, and
    // hijacking it would break copying the note out.
    this.registerEditorExtension(EditorState.transactionFilter.of((tr) => {
      if (!tr.selection || tr.docChanged) return tr;
      // Source mode shows the whole note as text on purpose: nothing is rendered there, so there
      // is nothing to protect — and that is where editing the JSON by hand has to stay possible.
      if (editorLivePreviewField && !tr.startState.field(editorLivePreviewField, false)) return tr;
      if (Date.now() - (this._caretPass || 0) < 2000) return tr; // the block's edit pencil, just clicked
      const sel = tr.newSelection.main;
      if (!sel.empty) return tr;
      const doc = tr.newDoc;
      const hit = calendarBlockRanges(doc).find(([from, to]) => sel.head > from && sel.head < to);
      if (!hit) return tr;
      const [from, to] = hit;
      // Already in there — the block is open for editing and someone is working inside it. Only
      // an arrival from outside is turned back, so an edit session isn't interrupted halfway.
      const prev = tr.startState.selection.main.head;
      if (prev > from && prev < to) return tr;
      // End of the line above the opening fence / start of the line below the closing one.
      const before = from > 0 ? from - 1 : -1;
      const after = to < doc.length ? to + 1 : -1;
      // Arriving from below? Stop above the block. Otherwise — including a caret that came from
      // nowhere, which is what a restored cursor looks like — pass below it.
      const up = prev > to;
      const target = up ? (before >= 0 ? before : after) : (after >= 0 ? after : before);
      if (target < 0) return tr; // the block is the whole note: nowhere to stand
      return [tr, { selection: { anchor: target } }];
    }));

    this.addCommand({ id: 'insert-calendar', name: t('insertCmd'), editorCallback: (editor) => editor.replaceSelection(STARTER_BLOCK) });
    this.addCommand({
      id: 'search-events',
      name: t('searchCmd'),
      checkCallback: (checking) => {
        const r = this.activeRenderer();
        if (!r) return false;
        if (!checking) r.openSearch();
        return true;
      },
    });
    this.addCommand({
      id: 'copy-period',
      name: t('copyCmd'),
      checkCallback: (checking) => {
        const r = this.activeRenderer();
        if (!r) return false;
        if (!checking) r.copyPeriod();
        return true;
      },
    });
    this.addCommand({
      id: 'purge-past',
      name: t('purgeCmd'),
      checkCallback: (checking) => {
        const r = this.activeRenderer();
        if (!r) return false;
        if (!checking) r.openPurge();
        return true;
      },
    });
    // Single-calendar mode (default) is open-or-create, so the labels say "open"; the
    // multi-calendar setting flips them back to "create" (applied on plugin reload).
    const noteCmdLabel = t(this.settings.multiCalendar ? 'newNoteCmd' : 'openNoteCmd');
    this.addCommand({ id: 'create-calendar-note', name: noteCmdLabel, callback: () => this.createCalendarNote() });
    this.addRibbonIcon('calendar-days', this.settings.multiCalendar ? t('ribbon') : noteCmdLabel, () => this.createCalendarNote());

    // Keep the remembered calendar-note path fresh across renames/moves.
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      if (oldPath === this.settings.calendarNotePath) {
        this.settings.calendarNotePath = file.path;
        this.saveSettings();
      }
    }));
    // The status bar exists on desktop only. Created once and hidden when the setting is off,
    // rather than added/removed on every toggle (addStatusBarItem only unregisters on unload).
    if (!IS_MOBILE()) {
      this.statusEl = this.addStatusBarItem();
      this.statusEl.addClass('dn-status');
      this.statusEl.addEventListener('click', () => this.openStatusItem());
      this.registerInterval(window.setInterval(() => this.refreshStatusBar(), 60 * 1000));
      this.registerEvent(this.app.vault.on('modify', (f) => {
        if (this._statusPath && f.path === this._statusPath) this.refreshStatusBar();
      }));
      // One vault scan at startup to find the calendar note; after that the remembered path
      // (or an open block) answers the question without touching the disk.
      this.app.workspace.onLayoutReady(() => this.refreshStatusBar(true));
    }

    this.addSettingTab(new MdCalendarSettingTab(this.app, this));
  }

  onunload() {
    // Flush a pending view-state save, then let go of everything module-level this plugin owns:
    // the per-block maps and the lazily created audio context all outlive a disable otherwise.
    if (this._memTimer) {
      clearTimeout(this._memTimer);
      this._memTimer = null;
      this.saveSettings().catch(() => { /* shutting down */ });
    }
    VIEW_STATES.clear();
    UNDO_STACKS.clear();
    if (AUDIO_CTX) { try { AUDIO_CTX.close(); } catch (e) { /* already gone */ } AUDIO_CTX = null; }
  }

  /* The calendar the user is looking at: a block in the active note, else any live one. */
  activeRenderer() {
    const file = this.app.workspace.getActiveFile();
    const path = file ? file.path : null;
    let fallback = null;
    for (const r of this.allRenderers) {
      if (r._destroyed || !r.model || !r.el || !r.el.isConnected) continue;
      if (path && r.ctx.sourcePath === path) return r;
      if (!fallback) fallback = r;
    }
    return fallback;
  }

  /* ---- status bar: the next thing coming up, with the note closed ---- */
  /* Reads the calendar NOTE rather than a rendered block — that is the whole point of it. The
   * file is parsed at most once per revision; deciding which item is next is cheap and re-runs
   * every minute. Any failure just hides the item: a status bar must never be a source of noise. */
  async refreshStatusBar(rescan) {
    const el = this.statusEl;
    if (!el) return;
    if (!this.settings.statusBar) { el.toggleClass('dn-hide', true); return; }
    try {
      const file = await this.statusFile(rescan);
      const item = file ? this.nextUp(await this.statusEvents(file)) : null;
      this._statusItem = item;
      el.empty();
      el.toggleClass('dn-hide', !item);
      if (!item) return;
      setIcon(el.createSpan({ cls: 'dn-status-ic' }), 'calendar-clock');
      el.createSpan({ cls: 'dn-status-text', text: this.statusLabel(item) });
      el.setAttribute('aria-label', (item.title || '…') + (item.note ? ' — ' + item.note : '') + ' · ' + t('stTip'));
    } catch (e) {
      console.error('MD Calendar: status bar refresh failed', e);
      el.toggleClass('dn-hide', true);
    }
  }

  /* Which note the status bar reads: the remembered single-calendar path while it exists, else
   * whatever calendar block is open right now. Only failing both does it scan the vault, and
   * only when asked (startup) — a scan reads every note that holds a code block. */
  async statusFile(rescan) {
    const remembered = this.settings.calendarNotePath && this.app.vault.getAbstractFileByPath(this.settings.calendarNotePath);
    if (remembered instanceof TFile) { this._statusPath = remembered.path; return remembered; }
    const open = this.activeRenderer();
    const byOpen = open && this.app.vault.getAbstractFileByPath(open.ctx.sourcePath);
    if (byOpen instanceof TFile) { this._statusPath = byOpen.path; return byOpen; }
    if (!rescan) return null;
    const found = await this.findCalendarNote();
    this._statusPath = found ? found.path : null;
    return found;
  }

  /* The events of every md-calendar block in `file`, cached per file revision. */
  async statusEvents(file) {
    const stamp = file.path + ':' + file.stat.mtime;
    if (this._statusCache && this._statusCache.stamp === stamp) return this._statusCache.events;
    const text = await this.app.vault.cachedRead(file);
    const events = [];
    for (const src of extractCalendarBlocks(text)) {
      let parsed;
      try { parsed = JSON.parse(src.trim() || '{}'); } catch (e) { continue; } // a broken block is the renderer's story to tell
      for (const ev of normalizeCal(parsed, this.settings).events) events.push(ev);
    }
    this._statusCache = { stamp, events };
    return events;
  }

  /* The soonest undone instance from now on. A timed item counts until it FINISHES — a meeting
   * you are sitting in is still what's happening — while all-day items and tasks count all day. */
  nextUp(events) {
    const today = isoToday();
    const horizon = moment().add(14, 'day').format('YYYY-MM-DD');
    const nowMin = moment().hours() * 60 + moment().minutes();
    let best = null;
    for (const ev of events) {
      // A handful per event is plenty: only the earliest few can win, and at most today's are
      // already over. Without the cap a daily series would expand two weeks every minute.
      for (const it of expandInstances(ev, today, horizon, 4)) {
        if (it.done) continue;
        // On a FUTURE day an all-day item leads ("tomorrow: on tour"). On TODAY it sorts last:
        // you have already seen it, whereas the meeting in an hour is what's actually next —
        // and an overdue task carried forward to today would otherwise sit here forever.
        const startMin = it.allDay ? (it.date === today ? DAY_MIN : 0) : (timeToMin(it.start) || 0);
        if (it.date === today && !it.allDay && !crossesMidnight(it)) {
          const endMin = it.end ? timeToMin(it.end) : startMin + CFG.defaultDur;
          if (endMin != null && endMin <= nowMin) continue; // already finished
        }
        const rank = it.date + ' ' + String(startMin).padStart(4, '0');
        if (!best || rank < best.rank) best = { rank, it };
      }
    }
    return best ? best.it : null;
  }

  statusLabel(it) {
    const today = isoToday();
    const tomorrow = moment().add(1, 'day').format('YYYY-MM-DD');
    let when;
    if (it.date === today) when = it.allDay ? t('today') : it.start;
    else if (it.date === tomorrow) when = t('stTomorrow') + (it.allDay ? '' : ' ' + it.start);
    else when = cap(moment(it.date, 'YYYY-MM-DD').format('D MMM')) + (it.allDay ? '' : ' ' + it.start);
    const title = it.title || '…';
    return when + ' · ' + (title.length > 42 ? title.slice(0, 41) + '…' : title);
  }

  /* Click the status bar: open the calendar note and land on that item's day. */
  async openStatusItem() {
    const path = this._statusPath;
    const file = path && this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return;
    await this.app.workspace.getLeaf(false).openFile(file);
    const iso = this._statusItem && this._statusItem.date;
    if (!iso) return;
    // The block renders after the file opens — give it a beat, then jump whichever renderer appeared.
    setTimeout(() => {
      for (const r of this.allRenderers) {
        if (!r._destroyed && r.model && r.ctx.sourcePath === path) { r.goToDate(iso); return; }
      }
    }, 250);
  }

  /* Whether full-bleed applies on the current platform, per the fullWidthScope setting. */
  fullBleedOn() {
    const scope = this.settings.fullWidthScope;
    return scope === 'all' || (IS_MOBILE() ? scope === 'mobile' : scope === 'desktop');
  }

  /* Redraw every live calendar — for settings that change the layout rather than the data. */
  refreshAll() {
    for (const r of this.allRenderers) {
      if (r._destroyed || !r.model || !r.el || !r.el.isConnected) continue;
      try { r.render(); } catch (e) { console.error('MD Calendar: re-render failed', e); }
    }
  }

  async saveSettings() { this._syncCfg(); await this.saveData(this.settings); }

  /* Mirror the validated settings into the module-level CFG the helpers read. */
  _syncCfg() {
    const s = this.settings;
    CFG.fdow = (typeof s.firstDayOfWeek === 'number' && s.firstDayOfWeek >= 0 && s.firstDayOfWeek <= 6) ? s.firstDayOfWeek : null;
    // Capped below a full day: the default duration wraps around midnight now, and exactly 24h
    // would wrap back onto the start time — a zero-length event.
    CFG.defaultDur = Math.max(15, Math.min(23 * 60, Number(s.defaultDurationMin) || 60));
    CFG.snap = [15, 30, 60].includes(Number(s.snapMin)) ? Number(s.snapMin) : 30;
  }

  /* Per-block UI state (current view, completed-items filter). Kept out of the note on purpose —
   * see CalendarRenderer.view(). Saves are debounced: a keyboard user can cycle views fast. */
  recallViewState(key) { return (this.settings.viewMemory && this.settings.viewMemory[key]) || {}; }

  rememberViewState(key, patch) {
    if (!this.settings.viewMemory) this.settings.viewMemory = {};
    this.settings.viewMemory[key] = Object.assign({}, this.settings.viewMemory[key], patch);
    if (this._memTimer) clearTimeout(this._memTimer);
    this._memTimer = setTimeout(() => {
      this._memTimer = null;
      this.saveSettings().catch((e) => console.error('MD Calendar: saving view state failed', e));
    }, 600);
  }

  /* The vault's calendar note (single-calendar mode): the remembered path when it still
   * exists; otherwise a content scan for an md-calendar block — most recently modified
   * note wins — remembering what it finds. */
  async findCalendarNote() {
    const byPath = this.settings.calendarNotePath && this.app.vault.getAbstractFileByPath(this.settings.calendarNotePath);
    if (byPath instanceof TFile) return byPath;
    const fenceRe = /^\s*(?:`{3,}|~{3,})\s*md-calendar\b/m;
    const files = this.app.vault.getMarkdownFiles().sort((a, b) => b.stat.mtime - a.stat.mtime);
    for (const f of files) {
      // Skip notes the metadata cache says hold no code block at all: the fence can only be
      // in one, and this turns a whole-vault read into a read of the few files that qualify.
      const cache = this.app.metadataCache.getFileCache(f);
      if (cache && cache.sections && !cache.sections.some((s) => s.type === 'code')) continue;
      let text;
      try { text = await this.app.vault.cachedRead(f); } catch (e) { continue; }
      if (fenceRe.test(text)) {
        await this._rememberCalendarNote(f.path);
        return f;
      }
    }
    return null;
  }

  async _rememberCalendarNote(path) {
    if (this.settings.calendarNotePath === path) return;
    this.settings.calendarNotePath = path;
    await this.saveSettings();
  }

  async createCalendarNote() {
    // Single-calendar mode (default): if a calendar already exists anywhere in the vault,
    // the button simply OPENS it. "Multiple calendars" in settings restores always-create.
    if (!this.settings.multiCalendar) {
      const existing = await this.findCalendarNote();
      if (existing) {
        await this.app.workspace.getLeaf(false).openFile(existing);
        return;
      }
    }
    const base = t('untitled');
    let name = base, n = 1;
    while (this.app.vault.getAbstractFileByPath(name + '.md')) name = base + ' ' + ++n;
    const file = await this.app.vault.create(name + '.md', STARTER_BLOCK);
    await this._rememberCalendarNote(file.path);
    const leaf = this.app.workspace.getLeaf(true);
    await leaf.openFile(file);
  }
}

module.exports = MdCalendarPlugin;
