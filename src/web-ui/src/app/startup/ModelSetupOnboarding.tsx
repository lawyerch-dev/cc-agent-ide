import { useEffect, useState } from 'react';
import { configManager } from '../../infrastructure/config/services/ConfigManager';
import { QuickModelSetup } from '../../infrastructure/config/components/QuickModelSetup';

const MODEL_SETUP_SKIP_KEY = 'openbitfun:model-setup-skipped';

/**
 * First-run model onboarding. Shown when no model is configured yet and the
 * user has not explicitly deferred setup. Completing the wizard (or adding a
 * model through the settings page) automatically hides it.
 */
export function ModelSetupOnboarding() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (window.localStorage.getItem(MODEL_SETUP_SKIP_KEY) === '1') {
        return;
      }
      const models = await configManager.getConfig<unknown[]>('ai.models');
      if (cancelled) return;
      if (!models || models.length === 0) {
        setShow(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!show) {
    return null;
  }

  const defer = () => {
    window.localStorage.setItem(MODEL_SETUP_SKIP_KEY, '1');
    setShow(false);
  };

  return (
    <QuickModelSetup
      open={show}
      variant="fullscreen"
      onClose={defer}
      onSkip={defer}
      onComplete={() => setShow(false)}
    />
  );
}

export default ModelSetupOnboarding;