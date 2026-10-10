/** True only for events produced by a real user action (not script-dispatched clicks). */
export function isTrustedUserEvent(event: { nativeEvent: Event }): boolean {
  return event.nativeEvent.isTrusted === true;
}
