import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('./QuickModelSetup.tsx', import.meta.url)),
  'utf8',
);
const styles = readFileSync(
  fileURLToPath(new URL('./ModelSettingsPage.scss', import.meta.url)),
  'utf8',
);
const pageSource = readFileSync(
  fileURLToPath(new URL('./ModelSettingsPage.tsx', import.meta.url)),
  'utf8',
);
const appearance = readFileSync(
  fileURLToPath(new URL('./ModelSettingsPage.appearance.ts', import.meta.url)),
  'utf8',
);
const appSource = readFileSync(
  fileURLToPath(new URL('../../../app/App.tsx', import.meta.url)),
  'utf8',
);

describe('QuickModelSetup presentation', () => {
  it('walks the beginner path: provider, recommended model, key, test and save', () => {
    expect(source).toContain("export function QuickModelSetup(");
    expect(source).toContain("variant = 'dialog'");
    expect(source).toContain("'fullscreen'");
    expect(source).toContain('openbitfun-model-settings__quick-setup-providers');
    expect(source).toContain('openbitfun-model-settings__quick-setup-models');
    expect(source).toContain('openbitfun-model-settings__quick-setup-model-badge');
    expect(source).toContain("label={t('quickSetup.apiKeyLabel')}");
    expect(source).toContain('type="password"');
    expect(source).toContain('aiApi.testConfigConnection(config)');
    expect(source).toContain('allocateModelConfigId(modelName, allocatedIds)');
    expect(source).toContain('PROVIDER_INSTANCE_METADATA_KEY');
    expect(source).toContain("'ai.default_models'");
    expect(source).toContain('primary: id');
    expect(source).toContain("variant === 'fullscreen'");
    expect(source).toContain('onSkip');
  });

  it('registers the wizard under the model settings appearance surface', () => {
    expect(appearance).toContain("{ id: 'quickSetup' }");
    expect(appearance).toContain("{ id: 'quickSetupProvider' }");
    expect(appearance).toContain("{ id: 'quickSetupModel' }");
    expect(appearance).toContain("{ id: 'quickSetupFooter' }");
  });

  it('styles the wizard with theme tokens only', () => {
    expect(styles).toMatch(
      /&--fullscreen\s*{[\s\S]*?position:\s*fixed;/,
    );
    expect(styles).toContain('background: var(--openbitfun-color-surface-canvas);');
    expect(styles).toContain('background: var(--openbitfun-color-accent-surface);');
    expect(styles).toContain('color: var(--openbitfun-color-status-danger-content);');
    expect(styles).not.toMatch(/&-[a-z-]+:\s*[\s\S]*?#[0-9a-fA-F]{3,8}\b/);
  });

  it('is reachable from the model settings toolbar', () => {
    expect(pageSource).toContain('import { QuickModelSetup } from \'./QuickModelSetup\';');
    expect(pageSource).toContain('quickSetup.title');
    expect(pageSource).toContain('setQuickSetupOpen(true)');
    expect(pageSource).toContain('<QuickModelSetup');
  });

  it('mounts the first-run onboarding only after the shell is interactive', () => {
    expect(appSource).toContain('LazyModelSetupOnboarding');
    expect(appSource).toContain('interactiveShellReady && !startupOverlayVisible');
  });
});
