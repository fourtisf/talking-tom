/**
 * The backup/restore dialog, built from DOM rather than Phaser.
 *
 * Phaser has no text input. The options were `window.prompt` — which Capacitor
 * webviews render as a system alert with no styling and which iOS can suppress
 * entirely — or a DOM layer over the canvas. This is the DOM layer: a real
 * textarea the player can select, a real button the clipboard API will accept a
 * gesture from, and a look that matches the game rather than the platform.
 *
 * It owns no game state. It is handed strings and hands strings back.
 */

const OVERLAY_ID = 'biskit-save-dialog';

export interface SaveDialogOptions {
  readonly title: string;
  readonly body: string;
  /** Pre-filled and read-only for backup; empty and editable for restore. */
  readonly value?: string;
  readonly readOnly: boolean;
  readonly confirmLabel: string;
  /** Return a message to show in place of closing, or null to close. */
  readonly onConfirm: (value: string) => string | null;
  readonly onClose?: () => void;
}

/** Styles inline: the game ships one stylesheet and this is not worth a second. */
const CSS = `
#${OVERLAY_ID}{position:fixed;inset:0;z-index:50;display:flex;align-items:center;
  justify-content:center;padding:20px;background:rgba(26,19,40,.72);
  backdrop-filter:blur(6px);font-family:Fredoka,system-ui,sans-serif}
#${OVERLAY_ID} .card{width:min(420px,100%);max-height:86vh;overflow:auto;
  background:#fffbf7;border-radius:22px;padding:22px;box-shadow:0 24px 60px -18px rgba(0,0,0,.6)}
#${OVERLAY_ID} h2{margin:0 0 8px;font-size:22px;color:#33243f}
#${OVERLAY_ID} p{margin:0 0 14px;font-size:13.5px;line-height:1.5;color:#5b486b}
#${OVERLAY_ID} textarea{width:100%;height:132px;resize:none;border-radius:14px;
  border:2px solid #d9cbe8;padding:11px;font:600 11.5px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;
  color:#33243f;background:#fff;word-break:break-all}
#${OVERLAY_ID} textarea:focus{outline:none;border-color:#a88bd8}
#${OVERLAY_ID} .note{min-height:18px;margin:8px 0 0;font-size:12.5px;font-weight:600;color:#c0392b}
#${OVERLAY_ID} .note.ok{color:#2f8f6b}
#${OVERLAY_ID} .row{display:flex;gap:9px;margin-top:14px}
#${OVERLAY_ID} button{flex:1;padding:13px 10px;border:none;border-radius:15px;
  font:700 15px Fredoka,system-ui,sans-serif;cursor:pointer}
#${OVERLAY_ID} .primary{background:#7fd9b8;color:#14331f;box-shadow:0 4px 0 #4fbe96}
#${OVERLAY_ID} .ghost{background:#efe7f8;color:#5b486b}
#${OVERLAY_ID} button:active{transform:translateY(2px);box-shadow:none}
`;

export function openSaveDialog(options: SaveDialogOptions): void {
  // Never two at once: a second call replaces the first rather than stacking.
  document.getElementById(OVERLAY_ID)?.remove();

  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;

  /**
   * Stop every pointer event at the overlay.
   *
   * Phaser's input manager listens on `window`, not on the canvas, so an event
   * on a DOM layer ABOVE the canvas still bubbles up and gets hit-tested
   * against whatever Phaser is drawing underneath. Without this, tapping this
   * dialog's Close button also tapped the settings sheet's backdrop behind it:
   * the sheet closed, the scene emitted `settings-closed`, and an unfinished
   * tutorial restarted from step one. Every subsequent tap then landed on a
   * screen that was no longer there.
   *
   * `stopPropagation`, not `stopImmediatePropagation`: this listener is on the
   * ancestor, so the dialog's own buttons have already handled the event by the
   * time it arrives here. Only the trip onward to `window` is cancelled.
   */
  for (const type of [
    'pointerdown',
    'pointerup',
    'pointermove',
    'mousedown',
    'mouseup',
    'click',
    'touchstart',
    'touchmove',
    'touchend',
    'wheel',
  ]) {
    overlay.addEventListener(type, (event) => event.stopPropagation());
  }

  const style = document.createElement('style');
  style.textContent = CSS;
  overlay.append(style);

  const card = document.createElement('div');
  card.className = 'card';

  const heading = document.createElement('h2');
  heading.textContent = options.title;

  const body = document.createElement('p');
  body.textContent = options.body;

  const field = document.createElement('textarea');
  field.value = options.value ?? '';
  field.readOnly = options.readOnly;
  field.spellcheck = false;
  field.autocapitalize = 'off';
  field.setAttribute('autocorrect', 'off');
  field.setAttribute('aria-label', options.title);

  const note = document.createElement('p');
  note.className = 'note';

  const row = document.createElement('div');
  row.className = 'row';

  const close = (): void => {
    overlay.remove();
    options.onClose?.();
  };

  const confirm = document.createElement('button');
  confirm.className = 'primary';
  confirm.textContent = options.confirmLabel;
  confirm.addEventListener('click', () => {
    const message = options.onConfirm(field.value);
    if (message === null) {
      close();
      return;
    }
    // A message means "stayed open on purpose" — a failed import, or the
    // confirmation that a copy landed. Green only for the copy case, which is
    // the one that starts with a tick.
    note.textContent = message;
    note.classList.toggle('ok', message.startsWith('✓'));
  });

  const cancel = document.createElement('button');
  cancel.className = 'ghost';
  cancel.textContent = 'Close';
  cancel.addEventListener('click', close);

  row.append(confirm, cancel);
  card.append(heading, body, field, note, row);
  overlay.append(card);
  document.body.append(overlay);

  // Selecting the whole code is the first thing anyone wants to do with it.
  if (options.readOnly) {
    field.focus();
    field.select();
  } else {
    field.focus();
  }
}

/**
 * Clipboard write, with a truthful answer.
 *
 * `navigator.clipboard` is absent on insecure origins and can reject even on
 * secure ones if the gesture is judged stale. The caller needs to know, because
 * "copied!" over a clipboard that did not receive anything is how someone loses
 * a pet they believed they had backed up.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
