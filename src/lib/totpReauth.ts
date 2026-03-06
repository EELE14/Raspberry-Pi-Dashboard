type Handler = (resolve: () => void, reject: (err: Error) => void) => void;

let _handler: Handler | null = null;
let _inProgress = false;
const _queue: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];

export function registerTotpReauthHandler(handler: Handler): void {
  _handler = handler;
}

export function triggerTotpReauth(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (!_handler) {
      reject(new Error("TOTP session expired. Please sign in again."));
      return;
    }

    _queue.push({ resolve, reject });

    // If modal show, queue
    if (_inProgress) return;

    _inProgress = true;
    _handler(
      () => {
        // resolve every queued caller.
        _inProgress = false;
        const waiting = _queue.splice(0);
        waiting.forEach((w) => w.resolve());
      },
      (err) => {
        //reject every queued caller.
        _inProgress = false;
        const waiting = _queue.splice(0);
        waiting.forEach((w) => w.reject(err));
      },
    );
  });
}
