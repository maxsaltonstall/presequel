let _rum = null;

export function rumAction(name, attrs) {
  if (!_rum) return;
  try { _rum.addAction(name, attrs); } catch {}
}

export function rumError(err, attrs) {
  if (!_rum) return;
  try { _rum.addError(err, attrs); } catch {}
}

async function loadConfig() {
  try {
    const res = await fetch('/config');
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function init() {
  const cfg = await loadConfig();
  if (!cfg || cfg.enabled === false) return;
  if (!cfg.applicationId || !cfg.clientToken) return;
  try {
    const mod = await import('https://www.datadoghq-browser-agent.com/datadog-rum.js');
    const rum = mod.datadogRum || mod.default || mod;
    rum.init({
      applicationId: cfg.applicationId,
      clientToken: cfg.clientToken,
      site: cfg.site || 'datadoghq.com',
      service: cfg.service || 'chrono-consulting',
      env: cfg.env || 'dev',
      version: cfg.version || 'unknown',
      sessionSampleRate: 100,
      sessionReplaySampleRate: 20,
      defaultPrivacyLevel: 'mask-user-input',
      trackUserInteractions: true,
      trackResources: true,
      trackLongTasks: true,
      allowedTracingUrls: [window.location.origin],
    });
    if (typeof rum.startSessionReplayRecording === 'function') {
      rum.startSessionReplayRecording();
    }
    _rum = rum;
  } catch (err) {
    console.warn('RUM init skipped:', err && err.message);
  }
}

init();
