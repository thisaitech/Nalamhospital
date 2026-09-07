import { Alert, Platform } from 'react-native';

export function showAlert(title: string, message: string, onOk?: () => void) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
    onOk?.();
    return;
  }
  Alert.alert(title, message, onOk ? [{ text: 'OK', onPress: onOk }] : undefined);
}

export function showConfirm(title: string, message: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'OK', onPress: () => resolve(true) },
    ]);
  });
}

/** Ask staff/doctor: Continue next shift, or Punch Out to end the day. */
export function showPunchOutChoice(
  onContinue: () => void,
  onPunchOut: () => void
): void {
  if (Platform.OS === 'web') {
    showWebPunchOutChoice(onContinue, onPunchOut);
    return;
  }
  Alert.alert('End shift?', 'Continue to the next shift, or punch out to end your day.', [
    { text: 'Continue', onPress: onContinue },
    { text: 'Punch Out', style: 'destructive', onPress: onPunchOut },
  ]);
}

function showWebPunchOutChoice(onContinue: () => void, onPunchOut: () => void) {
  const existing = document.getElementById('punch-out-choice-overlay');
  existing?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'punch-out-choice-overlay';
  overlay.setAttribute(
    'style',
    [
      'position:fixed',
      'inset:0',
      'background:rgba(15,23,42,0.45)',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'z-index:99999',
      'padding:20px',
      'font-family:system-ui,-apple-system,sans-serif',
    ].join(';')
  );

  const sheet = document.createElement('div');
  sheet.setAttribute(
    'style',
    [
      'background:#fff',
      'border-radius:16px',
      'padding:20px',
      'width:min(360px,100%)',
      'box-shadow:0 16px 40px rgba(0,0,0,0.2)',
    ].join(';')
  );

  const title = document.createElement('div');
  title.textContent = 'End shift?';
  title.setAttribute('style', 'font-size:18px;font-weight:800;color:#0F172A;margin-bottom:8px');

  const body = document.createElement('div');
  body.textContent = 'Continue to the next shift, or punch out to end your day.';
  body.setAttribute('style', 'font-size:14px;color:#64748B;margin-bottom:16px;line-height:1.4');

  const row = document.createElement('div');
  row.setAttribute('style', 'display:flex;gap:10px');

  const makeBtn = (label: string, primary: boolean, onClick: () => void) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.setAttribute(
      'style',
      [
        'flex:1',
        'border-radius:12px',
        'padding:12px 10px',
        'font-size:14px',
        'font-weight:700',
        'cursor:pointer',
        primary
          ? 'border:none;background:#4F46E5;color:#fff'
          : 'border:1px solid #CBD5E1;background:#fff;color:#DC2626',
      ].join(';')
    );
    btn.onclick = () => {
      overlay.remove();
      onClick();
    };
    return btn;
  };

  row.appendChild(makeBtn('Continue', true, onContinue));
  row.appendChild(makeBtn('Punch Out', false, onPunchOut));

  sheet.appendChild(title);
  sheet.appendChild(body);
  sheet.appendChild(row);
  overlay.appendChild(sheet);
  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.remove();
  };
  document.body.appendChild(overlay);
}
