// Signal sonore généré (aucun fichier audio requis)
let ctx: AudioContext | null = null;

export function beep(kind: 'alert' | 'sos' | 'info' = 'alert') {
  try {
    ctx = ctx || new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const pattern = kind === 'sos' ? [880, 660, 880, 660, 880, 660] : kind === 'alert' ? [740, 988] : [660];
    let t = ctx.currentTime;
    for (const f of pattern) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = kind === 'sos' ? 'square' : 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.24);
      t += 0.26;
    }
  } catch {
    /* audio non disponible */
  }
}

export function desktopNotify(title: string, body: string) {
  try {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'granted') new Notification(title, { body, icon: '/logo-fameco-mark.png' });
  } catch {
    /* ignore */
  }
}

export function requestNotificationPermission() {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission();
  } catch {
    /* ignore */
  }
}
