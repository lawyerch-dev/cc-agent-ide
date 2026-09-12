import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('./ModelSettingsPage.tsx', import.meta.url)),
  'utf8',
);
const styles = readFileSync(
  fileURLToPath(new URL('./ModelSettingsPage.scss', import.meta.url)),
  'utf8',
);
const appearance = readFileSync(
  fileURLToPath(new URL('./ModelSettingsPage.appearance.ts', import.meta.url)),
  'utf8',
);

describe('ModelSettingsPage providers layout', () => {
  it('integrates API-key providers and subscription accounts into one two-column section', () => {
    expect(source).toContain("title={t('providersSection.title')}");
    expect(source).toContain('openbitfun-model-settings__providers-layout');
    expect(source).toContain('apiKeyProviders.map(renderApiKeyProviderCard)');
    expect(source).toContain('subscriptionAccounts.map(renderSubscriptionCard)');
    expect(source).not.toContain("title={t('subscriptionAuth.sectionTitle')}");
    expect(source).not.toContain("t('subscriptionAuth.sectionDescription')");
  });

  it('shows the provider model list and lets the user pick before adding', () => {
    expect(source).toContain('buildProviderModelOptions(provider.id)');
    expect(source).toContain('openbitfun-model-settings__providers-model-list');
    expect(source).toContain('type="checkbox"');
    expect(source).toContain('toggleApiProviderModel(provider.id, option.id)');
    expect(source).toContain("t('providersSection.apiKeys.chooseModels')");
    expect(source).toContain("t('providersSection.apiKeys.addSelected'");
    expect(source).toContain('handleApiProviderFetchModels(provider.id)');
    expect(source).toContain('aiApi.listModelsByConfig(discoveryConfig');
  });

  it('adds only the selected models and promotes the first as primary', () => {
    expect(source).toContain('const selectedModels = apiProviderSelectedModels[providerId] ?? [];');
    expect(source).toContain('selectedModels.length === 0');
    expect(source).toContain('selectedModels.map(modelId => {');
    expect(source).toContain('allocateModelConfigId(modelId, allocatedIds)');
    expect(source).toContain("'ai.default_models'");
    expect(source).toContain('primary: configs[0].id');
  });

  it('lets subscription accounts log in with OAuth from the card', () => {
    expect(source).toContain('renderSubscriptionCard');
    expect(source).toContain('handleSubscriptionLogin(account.provider)');
    expect(source).toContain('requestSubscriptionLogout(account)');
    expect(source).toContain('handleImportFromSubscription(account)');
  });

  it('registers the new section under the model settings appearance surface', () => {
    expect(appearance).toContain("{ id: 'providersLayout' }");
    expect(appearance).toContain("{ id: 'providersCard' }");
    expect(appearance).toContain("{ id: 'providersModelList' }");
    expect(appearance).toContain("{ id: 'providersModelOption' }");
  });

  it('styles the two columns with theme tokens only', () => {
    expect(styles).toMatch(
      /&__providers-layout\s*{[\s\S]*?grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(320px,\s*1fr\)\);/,
    );
    expect(styles).toContain('background: var(--openbitfun-color-field-background);');
    expect(styles).toContain('color: var(--openbitfun-color-status-danger-content);');
    expect(styles).not.toMatch(/&__providers-card[a-z-]*:[\s\S]*?#[0-9a-fA-F]{3,8}\b/);
  });
});
