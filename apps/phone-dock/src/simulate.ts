import type { BridgethingClient } from '@bridgething/client';

type Handler<F> = F extends (handler: (msg: infer M) => void) => unknown ? M : never;
export type PhoneCall = Handler<BridgethingClient['phone']['onCallStarted']>;
export type Notification = Handler<BridgethingClient['notifications']['onPosted']>;

export const SIM_CONFIG = 'simulate';
// the settings page writes each button press here, stamped so a repeat press still changes the doc
export const SIM_DOC = 'simulate-action';
export const SIM_PREFIX = 'sim-';

export const SIM_ACTIONS = [
  { action: 'incoming', label: 'Incoming call' },
  { action: 'unknown', label: 'Call from an unknown number' },
  { action: 'waiting', label: 'Second caller during a call' },
  { action: 'hangup', label: 'Caller hangs up' },
  { action: 'message', label: 'Text message' },
  { action: 'long', label: 'Long message' },
  { action: 'email', label: 'Email' },
  { action: 'reminder', label: 'Reminder, no actions' },
  { action: 'burst', label: 'Five notifications at once' },
  { action: 'clear', label: 'Clear everything' },
] as const;

export type SimAction = (typeof SIM_ACTIONS)[number]['action'];

export type SimEffect =
  | { kind: 'call'; call: PhoneCall }
  | { kind: 'hangup' }
  | { kind: 'notes'; notes: Notification[] }
  | { kind: 'clear' };

let seq = 0;
const id = () => `${SIM_PREFIX}${Date.now()}-${seq++}`;

function call(displayName: string, remoteId: string): PhoneCall {
  return {
    callId: id(),
    remoteId,
    displayName,
    status: 'ringing',
    direction: 'incoming',
    startedAtUnixS: null,
    label: null,
    addressBookId: null,
    service: null,
    isConferenced: null,
    conferenceGroup: null,
  };
}

function note(app: string, title: string, message: string | null, minsAgo: number, pos?: string, neg?: string): Notification {
  return {
    id: id(),
    app: { bundleId: app, displayName: app, iconAssetId: null },
    category: 'social',
    title,
    subtitle: null,
    message,
    timestampUnixS: Math.floor(Date.now() / 1000) - minsAgo * 60,
    flags: { silent: false, important: false },
    positiveAction: pos ? { label: pos } : null,
    negativeAction: neg ? { label: neg } : null,
  };
}

export function simulate(action: SimAction): SimEffect {
  switch (action) {
    case 'incoming':
      return { kind: 'call', call: call('Dara Sok', '+855 12 345 678') };
    case 'unknown':
      return { kind: 'call', call: call('', '+855 97 555 0142') };
    case 'waiting':
      return { kind: 'call', call: call('Sokha Chan', '+855 16 222 333') };
    case 'hangup':
      return { kind: 'hangup' };
    case 'message':
      return { kind: 'notes', notes: [note('Messages', 'Sokha', 'On my way, see you in 10', 0, 'Reply', 'Mark as Read')] };
    case 'long':
      return {
        kind: 'notes',
        notes: [
          note(
            'Telegram',
            'Family group',
            'Mom: dinner moved to 7 tonight at the place by the river. Bring the cake from the fridge and pick up ' +
              'grandma on the way, she is waiting at the front door. Do not forget the ice!',
            0,
            'Reply',
            'Mute',
          ),
        ],
      };
    case 'email':
      return { kind: 'notes', notes: [note('Gmail', 'Your order has shipped', 'Arriving Thursday by 8pm', 0, undefined, 'Archive')] };
    case 'reminder':
      return { kind: 'notes', notes: [note('Calendar', 'Standup in 15 minutes', 'Room 3 · Google Meet', 0)] };
    case 'burst':
      return {
        kind: 'notes',
        notes: [
          note('ABA Mobile', 'Payment received', '$120.00 from Dara', 9),
          note('Slack', '#general', 'Lunch is here', 6, 'Reply'),
          note('WhatsApp', 'Vanna', 'Did you see the game last night?', 4, 'Reply', 'Mark as Read'),
          note('Grab', 'Your driver is nearby', 'Silver Toyota Prius · 2AB-1234', 2, undefined, 'Dismiss'),
          note('Messages', 'Bopha', 'Call me when you can', 0, 'Reply', 'Mark as Read'),
        ],
      };
    case 'clear':
      return { kind: 'clear' };
  }
}
