# MD Calendar

A calendar that lives in **one Markdown file**. Drop a ` ```md-calendar ` code block
into any note and it renders a switchable **month / week / day / agenda** calendar —
events and tasks, recurrence, colors, notes, and drag-to-reschedule. The block's body
is a small JSON document, so all the data lives **inside that one note**; the rest of
the note stays a normal, editable Markdown file. Nothing else is required — it's a
self-contained calendar.

## Usage

Click the **ribbon icon** (or run **“Open the calendar note”**) — it opens your
calendar, creating the note on first use. One calendar per vault is the default;
enable **Multiple calendars** in settings to make the button create a new note every
time. You can also run **“Insert calendar”** or type the block yourself anywhere:

````markdown
```md-calendar
{
  "events": []
}
```
````

Switch to Reading view or Live Preview and the block becomes the calendar. Every
change you make in the UI is written straight back into the block.

## The header

- **‹ Today ›** — page back/forward by the current view's period, or jump to today.
- **Month · Week · Day · Agenda** — switch views. Your choice is remembered per note.
- **Completed toggle** — show or hide done events. The **trash button** next to it
  deletes every completed item.
- **Add bar** — type a title and press **Enter**: the calendar enters **placement
  mode** — a banner appears and you pick the day (in month or the agenda
  mini-calendar, or the all-day strip / an hour slot in week/day) by click or by
  arrows + Enter/Space. Clicking an hour slot sets the time right away; otherwise a quick
  time prompt follows — leave it empty for an all-day event. Start the line with `- `
  (or press **Ctrl/Cmd+Enter**) to add a **task** instead — it lands on the picked day
  with no time step. **Esc** or the banner's **✕** cancels.

## Events and tasks

- **All-day or timed.** An event with no start time is all-day; give it a start and it
  becomes a positioned block in the week/day time grid, lasting **exactly one hour** by
  default (change the end in the editor for a different length). In the editor, moving
  the start time drags the end along, keeping the duration.
- **Tasks** — a to-do on a day: no time, and a **checkbox** in every view so you can
  tick it off right in the grid. Create one with a leading `- ` (or **Ctrl/Cmd+Enter**)
  in the add bar, the Task toggle in quick create, or **Kind: Task** in the editor.
  An unfinished task never sinks into the past — it **carries forward to today**,
  drawn **red**, until you complete it (ticking pins it to the day it was done).
- **Multi-day** all-day events (an *end date*) draw across each day they cover.
- **Recurrence** — every day / week / month / year, every weekday, or a custom
  “every N …”. Completing a repeating event (or task) rolls it forward to the next
  occurrence (month/year repeats keep their day-of-month, so an end-of-month event
  stays end-of-month). A series can **end**: set “Until” in the editor as a date, or
  type a number into “or times” and the date is computed for you. Completing the last
  occurrence finishes the whole series (it renders done; un-tick to revive it).
- **Deleting one occurrence** — right-click it → **Delete this occurrence**: only that
  date is skipped, the series continues before and after (going on vacation = delete
  two weeks of gym sessions, they resume when you're back). **Delete series** removes
  the whole event. Skipped dates are stored in the event's `skip` list in the JSON —
  remove a date there to restore that occurrence. Completing a repeat rolls it past
  any deleted dates.
- **Colors** — pick one of the theme colors (`red`, `orange`, `yellow`, `green`,
  `blue`, `purple`) in the event editor; it adapts to your theme and renders in
  every view. The default is your theme's accent color.
- **Notes** — an event can carry a short free-text note (edited in the event editor).
  It shows in the hover tooltip in month/week/day, and under the title in agenda.
- **Quick create:** click an empty day (or an hour slot in week/day) and a small window
  opens — type the title, press **Enter**, type a time like `1500`, press **Enter** to
  add. Two Enters (leaving the time empty) makes it an **all-day** event; the Task
  toggle (or **Ctrl/Cmd+Enter**) adds a task instead. **More options…** opens the full
  editor (kind, repeat, end time, multi-day, color, note). Click an existing event to
  **edit** it; in the full editor **Cmd/Ctrl+Enter** saves.

## Drag to reschedule

Drag a non-recurring event (or task) to move it:

- **Month / all-day:** drag the chip to another day. Multi-day spans move as a whole.
- **Week / Day:** drag a timed block to another time or day — it snaps to the grid
  step and keeps its duration. While dragging, a dashed **ghost with the exact time**
  shows where the block will land (snap included). Drag the **bottom edge** of a block
  to change its end time. **Draw on empty space** (press and drag vertically) to create
  an event with exactly that start and length — release and type the title.

(Recurring events aren't draggable — which occurrence to move is ambiguous; edit them
through the event editor instead.)

On mobile a **long-press starts the drag** — the context menu is suppressed for
draggable items there (recurring events keep it: they can't be dragged, and it's the
way to delete one occurrence on a phone).

## Views

- **Month** — the classic grid; each day shows a few event chips and “+N more”.
  Multi-day events draw as **continuous bars** across the week rows (clipped ends mean
  the event continues into the neighboring week); drag a bar to move the whole span.
- **Week** — a 7-column hour grid; timed events are blocks sized to their duration,
  all-day events sit in a band at the top — multi-day ones as **continuous bars**
  across their days, exactly like in month view. Overlapping events split into columns.
- **Day** — the week grid focused on one day.
- **Agenda** — a mini month calendar where each day shows up to three colored dots for
  its events; click a day to see (and add) its events in the panel beside it — below it
  on narrow screens. Click the selected day again to create an event there. The
  friendliest view on mobile.

On a phone the switcher offers just **Agenda and Day** — agenda by default (its dotted
mini calendar is the month overview). The view saved in the note by your desktop is
left untouched: the phone only narrows what it shows, per session.

Every view is **keyboard-navigable** — the arrow keys or **WASD** move the selection
(physical keys, so they work in any layout). In month and agenda, left/right is ±1 day
and up/down ±1 week. In week and day the selection is two-dimensional: it starts on
**today's all-day band**; **A/D** (←/→) pick the day, **W/S** (↑/↓) walk down into the
hour slots and back up. **Enter** or **Space** creates an event on the selection — from an
hour slot it carries that time into the dialog. **Q/E** cycle the view left/right through
month → week → day → agenda. **PageUp/PageDown** switch months (**Shift** — a year),
**Home/End** jump to the week's edges. **T** — like the **Today** button — jumps the selection to today and
resets the week/day slot cursor to the all-day band, keeping the grid focused.
A **dedicated calendar note** (the block is the whole note, as made by the command)
focuses the grid on open — the keys work immediately. In a calendar embedded among
other text, click or Tab onto the grid first (closing an event dialog also returns
focus to the grid). The selection ring shows while the grid holds focus; in agenda the
selected day drives the side panel. **Ctrl/Cmd+Z** anywhere in the calendar undoes the
last calendar change, **Shift+Z** (or **Ctrl+Y**) redoes — the note editor's own undo
history stays untouched. Deletes never ask for confirmation: undo is the safety net,
and on mobile the delete notice carries a one-tap **Undo** button.

**Settings:** default view (desktop and mobile separately), the first day of the week
(Obsidian's locale, or a fixed day), the working-hours window (default 07–22), the
duration of a new timed event (default one hour), the drag/resize snap step
(15 / 30 / 60 minutes), and the completion chime (a soft synthesized two-note sound
on ticking something done — no audio files involved). Times are shown in 24-hour
format.

## Storage format

The JSON is human-inspectable but meant to be edited through the UI. If you hand-edit
it into invalid JSON, the block shows an error with a **Reset block** button. An optional
top-level `"title"` string is shown as a heading above the calendar controls.

Interface follows Obsidian's language (English, or Russian when the app is set to
Russian), works on desktop and mobile.

---

Author: [mrrepac](https://github.com/mrrepac) · MIT
