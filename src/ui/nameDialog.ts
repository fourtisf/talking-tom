/**
 * The first thing a new player sees: who are you, and what is she called.
 *
 * DOM rather than Phaser for the same reason the backup dialog is — Phaser has
 * no text input, and a `window.prompt` in a Capacitor webview is an unstyled
 * system alert that iOS can suppress outright.
 *
 * REQUIRED, and enforced by having no way out: no close button, no backdrop
 * dismiss, and Escape does nothing. That is a deliberate piece of friction in
 * the first ten seconds, and it buys the thing the rest of the save work is
 * for — a pet with a name on it is a pet somebody minds losing.
 */

const OVERLAY_ID = 'biskit-name-dialog';

export interface NameDialogOptions {
  readonly title: string;
  readonly body: string;
  readonly playerLabel: string;
  readonly petLabel: string;
  readonly playerPlaceholder: string;
  readonly petPlaceholder: string;
  readonly confirmLabel: string;
  readonly maxLength: number;
  /** Shown under the fields when the player tries to continue with a blank. */
  readonly requiredMessage: string;
  readonly initialPlayer?: string;
  readonly initialPet?: string;
  /** Optional escape hatch, used when EDITING rather than first-run. */
  readonly onCancel?: () => void;
  readonly cancelLabel?: string;
  readonly onConfirm: (playerName: string, petName: string) => void;
}

const CSS = `
#${OVERLAY_ID}{position:fixed;inset:0;z-index:60;display:flex;align-items:center;
  justify-content:center;padding:20px;background:rgba(26,19,40,.78);
  backdrop-filter:blur(8px);font-family:Fredoka,system-ui,sans-serif}
#${OVERLAY_ID} .card{width:min(400px,100%);background:#fffbf7;border-radius:24px;
  padding:26px 22px 22px;box-shadow:0 26px 64px -18px rgba(0,0,0,.62)}
#${OVERLAY_ID} h2{margin:0 0 8px;font-size:24px;color:#33243f}
#${OVERLAY_ID} p.intro{margin:0 0 18px;font-size:13.5px;line-height:1.5;color:#5b486b}
#${OVERLAY_ID} label{display:block;margin:0 0 6px;font-size:12px;font-weight:700;
  letter-spacing:.04em;text-transform:uppercase;color:#8a76a8}
#${OVERLAY_ID} input{width:100%;margin:0 0 16px;padding:13px 14px;border-radius:15px;
  border:2px solid #d9cbe8;background:#fff;font:600 16px Fredoka,system-ui,sans-serif;color:#33243f}
#${OVERLAY_ID} input:focus{outline:none;border-color:#a88bd8}
#${OVERLAY_ID} input.bad{border-color:#e06a8d}
#${OVERLAY_ID} .note{min-height:18px;margin:0 0 10px;font-size:12.5px;font-weight:600;color:#c0392b}
#${OVERLAY_ID} .row{display:flex;gap:9px}
#${OVERLAY_ID} button{flex:1;padding:14px 10px;border:none;border-radius:16px;
  font:700 16px Fredoka,system-ui,sans-serif;cursor:pointer}
#${OVERLAY_ID} .primary{background:#7fd9b8;color:#14331f;box-shadow:0 4px 0 #4fbe96}
#${OVERLAY_ID} .ghost{background:#efe7f8;color:#5b486b}
#${OVERLAY_ID} button:active{transform:translateY(2px);box-shadow:none}
`;

export function openNameDialog(options: NameDialogOptions): void {
  document.getElementById(OVERLAY_ID)?.remove();

  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;

  /*
   * Same trap the backup dialog hit: Phaser's input manager listens on
   * `window`, so a tap here would otherwise also be hit-tested against the game
   * drawn underneath — and this dialog covers the pet, whose tap handler would
   * happily fire behind it.
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

  const intro = document.createElement('p');
  intro.className = 'intro';
  intro.textContent = options.body;

  const field = (labelText: string, placeholder: string, value: string): HTMLInputElement => {
    const label = document.createElement('label');
    label.textContent = labelText;
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = options.maxLength;
    input.placeholder = placeholder;
    input.value = value;
    input.autocomplete = 'off';
    input.spellcheck = false;
    label.append(input);
    card.append(label);
    return input;
  };

  card.append(heading, intro);
  const playerInput = field(options.playerLabel, options.playerPlaceholder, options.initialPlayer ?? '');
  const petInput = field(options.petLabel, options.petPlaceholder, options.initialPet ?? '');

  const note = document.createElement('p');
  note.className = 'note';

  const row = document.createElement('div');
  row.className = 'row';

  const confirm = document.createElement('button');
  confirm.className = 'primary';
  confirm.textContent = options.confirmLabel;

  const submit = (): void => {
    const player = playerInput.value.trim();
    const pet = petInput.value.trim();
    playerInput.classList.toggle('bad', player.length === 0);
    petInput.classList.toggle('bad', pet.length === 0);

    if (player.length === 0 || pet.length === 0) {
      note.textContent = options.requiredMessage;
      (player.length === 0 ? playerInput : petInput).focus();
      return;
    }
    overlay.remove();
    options.onConfirm(player, pet);
  };

  confirm.addEventListener('click', submit);
  for (const input of [playerInput, petInput]) {
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') submit();
    });
    // Clear the complaint as soon as they start fixing it.
    input.addEventListener('input', () => {
      input.classList.remove('bad');
      note.textContent = '';
    });
  }

  row.append(confirm);

  if (options.onCancel) {
    const cancel = document.createElement('button');
    cancel.className = 'ghost';
    cancel.textContent = options.cancelLabel ?? 'Cancel';
    cancel.addEventListener('click', () => {
      overlay.remove();
      options.onCancel?.();
    });
    row.append(cancel);
  }

  card.append(note, row);
  overlay.append(card);
  document.body.append(overlay);
  playerInput.focus();
}
