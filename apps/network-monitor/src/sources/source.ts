// a source is anything that can hand the dashboard protocol messages. raw input from outside goes through
// readMessage before it reaches a sink; the mock source builds typed messages and is checked the same way
import type { Message } from '../protocol/messages';

export type Sink = (message: Message) => void;

export type Source = {
  kind: 'mock' | 'live';
  /** returns the function that stops it */
  start: (sink: Sink) => () => void;
};
