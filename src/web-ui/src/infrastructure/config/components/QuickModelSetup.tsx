import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Dialog,
  DialogBody,
  DialogClose,
  DialogHeader,
  DialogHeading,
  DialogTitle,
  Field,
  Input,
} from '@openbitfun/ui';
import { AlertTriangle, ArrowLeft, Check, ExternalLink, Wifi } from 'lucide-react';
import { configManager } from '../services/ConfigManager';
import { aiApi } from '@/infrastructure/api';
import { resolveProviderTemplates } from '../services/builtinProviderCatalog';
import { allocateModelConfigId, PROVIDER_INSTANCE_METADATA_KEY } from '../services/modelConfigs';
import { getCapabilitiesByCategory, resolveModelCategory } from '../services/modelCategory';
import { supportsResponsesReasoning } from '../utils/reasoning';
import type { ProviderTemplate, ProviderRegion } from '@/shared/types';
import type { AIModelConfig as AIModelConfigType } from '../types';
import type { ConnectionTestResult, ProviderCatalogModel, ProviderCatalogProvider } from '@/infrastructure/api/service-api/AIApi';

const DEFAULT_CONTEXT_WINDOW = 200000;

interface QuickModelSetupProps {
  open: boolean;
  onClose: () => void;
  /** `dialog` renders inside a settings dialog; `fullscreen` covers the shell (first-run). */
  variant?: 'dialog' | 'fullscreen';
  onComplete?: () => void;
  /** Fullscreen only: lets a first-run user defer setup. */
  onSkip?: () => void;
}

type WizardStep = 'provider' | 'model' | 'done';

interface ModelOption {
  id: string;
  label: string;
  description?: string;
  context?: number;
}

function generateProviderInstanceId(): string {
  return `provider_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function geminiBaseUrl(url: string): string {
  return url
    .replace(/\/v1beta(?:\/models(?:\/[^/?#]*(?::(?:stream)?[Gg]enerateContent)?(?:\?[^]*)?)?)?$/, '')
    .replace(/\/models(?:\/[^/?#]*(?::(?:stream)?[Gg]enerateContent)?(?:\?[^]*)?)?$/, '')
    .replace(/\/+$/, '');
}

/** Replicates the settings-page request URL derivation from base_url + format. */
function resolveRequestUrl(baseUrl: string, provider: string, _modelName = ''): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (trimmed.endsWith('#')) {
    return trimmed.slice(0, -1).replace(/\/+$/, '');
  }
  if (provider === 'openai') {
    return trimmed.endsWith('chat/completions') ? trimmed : `${trimmed}/chat/completions`;
  }
  if (supportsResponsesReasoning(provider)) {
    return trimmed.endsWith('responses') ? trimmed : `${trimmed}/responses`;
  }
  if (provider === 'anthropic') {
    if (trimmed.endsWith('/messages')) return trimmed;
    return trimmed.endsWith('/v1') ? `${trimmed}/messages` : `${trimmed}/v1/messages`;
  }
  if (provider === 'gemini') {
    return geminiBaseUrl(trimmed);
  }
  return trimmed;
}

function resolveModelOptions(
  template: ProviderTemplate,
  catalogProvider?: ProviderCatalogProvider,
): ModelOption[] {
  const resolvedModels = catalogProvider?.models ?? [];
  const recommended = resolvedModels.filter((model: ProviderCatalogModel) => model.recommended);
  if (recommended.length > 0) {
    return recommended.map((model: ProviderCatalogModel) => ({
      id: model.id,
      label: model.display_name || model.id,
      description: model.description,
      context: model.limits?.context,
    }));
  }
  return template.models.map((id) => ({ id, label: id }));
}

export function QuickModelSetup({
  open,
  onClose,
  variant = 'dialog',
  onComplete,
  onSkip,
}: QuickModelSetupProps) {
  const { t, i18n } = useTranslation('settings/models');

  const [step, setStep] = useState<WizardStep>('provider');
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof aiApi.getModelCatalog>> | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConnectionTestResult | null>(null);

  useEffect(() => {
    if (!open) return;
    aiApi.getModelCatalog()
      .then(setCatalog)
      .catch(() => setCatalog(null));
  }, [open]);

  const providerTemplates = useMemo(
    () => resolveProviderTemplates(catalog?.provider_catalog),
    [catalog?.provider_catalog],
  );

  const preferredProviderRegion: ProviderRegion = i18n.language.toLowerCase().startsWith('zh') ? 'cn' : 'global';
  const providers = useMemo(() => {
    const regionRank = (region: ProviderRegion | undefined) => {
      if (region === 'any') return 0;
      return region === preferredProviderRegion ? 1 : 2;
    };
    return Object.values(providerTemplates)
      .filter((template) => template.models.length > 0)
      .map((template) => ({
        ...template,
        name: t(`providers.${template.id}.name`),
        description: t(`providers.${template.id}.description`),
      }))
      .sort((left, right) => (
        regionRank(left.region) - regionRank(right.region)
        || (left.displayOrder ?? 999) - (right.displayOrder ?? 999)
        || left.name.localeCompare(right.name)
      ));
  }, [preferredProviderRegion, providerTemplates, t]);

  const selectedTemplate = selectedProviderId ? providerTemplates[selectedProviderId] : null;
  const selectedCatalogProvider = catalog?.provider_catalog?.providers.find(
    (provider) => provider.id === selectedProviderId,
  );
  const modelOptions = useMemo(
    () => (selectedTemplate ? resolveModelOptions(selectedTemplate, selectedCatalogProvider) : []),
    [selectedTemplate, selectedCatalogProvider],
  );
  const selectedModelOption = modelOptions.find((option) => option.id === selectedModelId);

  const providerName = selectedTemplate ? t(`providers.${selectedTemplate.id}.name`) : '';
  const requiresKey = selectedTemplate?.requiresApiKey ?? true;

  const reset = () => {
    setStep('provider');
    setSelectedProviderId(null);
    setSelectedModelId(null);
    setApiKey('');
    setError(null);
    setResult(null);
  };

  const handleNext = () => {
    if (!selectedProviderId) return;
    setError(null);
    setStep('model');
  };

  const handleBack = () => {
    setError(null);
    setStep('provider');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleTestAndSave = async () => {
    if (!selectedTemplate || !selectedModelId) return;
    setSaving(true);
    setError(null);
    try {
      const modelName = selectedModelId.trim();
      const existing = await configManager.getConfig<AIModelConfigType[]>('ai.models') || [];
      const allocatedIds = new Set(existing
        .map((model) => model.id?.trim())
        .filter((id): id is string => Boolean(id)));
      const id = allocateModelConfigId(modelName, allocatedIds);
      const category = resolveModelCategory(modelName, undefined, selectedTemplate.format);
      const config: AIModelConfigType = {
        id,
        name: providerName,
        base_url: selectedTemplate.baseUrl,
        request_url: resolveRequestUrl(selectedTemplate.baseUrl, selectedTemplate.format, modelName),
        api_key: apiKey.trim(),
        model_name: modelName,
        provider: selectedTemplate.format,
        enabled: true,
        context_window: selectedModelOption?.context ?? DEFAULT_CONTEXT_WINDOW,
        category,
        capabilities: getCapabilitiesByCategory(category),
        metadata: { [PROVIDER_INSTANCE_METADATA_KEY]: generateProviderInstanceId() },
        inline_think_in_text: true,
        auth: { type: 'api_key' },
      };

      await configManager.updateConfig<AIModelConfigType[]>('ai.models', (current) => [...current, config]);
      const defaultModels = await configManager.getConfig<Record<string, unknown>>('ai.default_models') || {};
      await configManager.setConfig('ai.default_models', { ...defaultModels, primary: id });

      const connection = await aiApi.testConfigConnection(config);
      setResult(connection);
      setStep('done');
      onComplete?.();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  const renderProviderStep = () => (
    <div className="openbitfun-model-settings__quick-setup-step">
      <p className="openbitfun-model-settings__quick-setup-subtitle">{t('quickSetup.chooseProvider')}</p>
      <div className="openbitfun-model-settings__quick-setup-providers">
        {providers.map((provider) => {
          const selected = provider.id === selectedProviderId;
          return (
            <button
              key={provider.id}
              type="button"
              className={[
                'openbitfun-model-settings__quick-setup-provider',
                selected && 'openbitfun-model-settings__quick-setup-provider--active',
              ].filter(Boolean).join(' ')}
              aria-pressed={selected}
              onClick={() => setSelectedProviderId(provider.id)}
            >
              <span className="openbitfun-model-settings__quick-setup-provider-name">{provider.name}</span>
              <span className="openbitfun-model-settings__quick-setup-provider-desc">{provider.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderModelStep = () => (
    <div className="openbitfun-model-settings__quick-setup-step">
      <p className="openbitfun-model-settings__quick-setup-subtitle">
        {t('quickSetup.chooseModel', { provider: providerName })}
      </p>
      <div className="openbitfun-model-settings__quick-setup-models">
        {modelOptions.map((option) => {
          const selected = option.id === selectedModelId;
          return (
            <button
              key={option.id}
              type="button"
              className={[
                'openbitfun-model-settings__quick-setup-model',
                selected && 'openbitfun-model-settings__quick-setup-model--active',
              ].filter(Boolean).join(' ')}
              aria-pressed={selected}
              onClick={() => setSelectedModelId(option.id)}
            >
              <span className="openbitfun-model-settings__quick-setup-model-name">
                {option.label}
                <span className="openbitfun-model-settings__quick-setup-model-badge">{t('quickSetup.recommended')}</span>
              </span>
              {option.description && (
                <span className="openbitfun-model-settings__quick-setup-model-desc">{option.description}</span>
              )}
            </button>
          );
        })}
      </div>

      {requiresKey && (
        <Field label={t('quickSetup.apiKeyLabel')}>
          <Input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={t('quickSetup.apiKeyPlaceholder')}
            autoComplete="off"
          />
        </Field>
      )}
      {requiresKey && selectedTemplate?.helpUrl && (
        <a
          className="openbitfun-model-settings__quick-setup-help"
          href={selectedTemplate.helpUrl}
          target="_blank"
          rel="noreferrer"
        >
          {t('quickSetup.getApiKey')}
          <ExternalLink size={13} aria-hidden="true" />
        </a>
      )}
      {error && (
        <div className="openbitfun-model-settings__quick-setup-error" role="alert">
          <AlertTriangle size={14} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );

  const renderDoneStep = () => (
    <div className="openbitfun-model-settings__quick-setup-step">
      <div className="openbitfun-model-settings__quick-setup-result">
        {result?.success ? (
          <>
            <Check size={28} aria-hidden="true" className="openbitfun-model-settings__quick-setup-result-icon" />
            <p className="openbitfun-model-settings__quick-setup-result-title">{t('quickSetup.successTitle')}</p>
            <p className="openbitfun-model-settings__quick-setup-result-desc">
              {t('quickSetup.successDescription', { provider: providerName })}
            </p>
          </>
        ) : (
          <>
            <AlertTriangle size={28} aria-hidden="true" className="openbitfun-model-settings__quick-setup-result-icon" />
            <p className="openbitfun-model-settings__quick-setup-result-title">{t('quickSetup.warningTitle')}</p>
            <p className="openbitfun-model-settings__quick-setup-result-desc">
              {t('quickSetup.warningDescription', { provider: providerName })}
            </p>
          </>
        )}
      </div>
    </div>
  );

  const renderFooter = () => {
    if (step === 'provider') {
      return (
        <div className="openbitfun-model-settings__quick-setup-footer">
          <Button variant="text" onClick={handleClose}>{t('quickSetup.cancel')}</Button>
          <Button onClick={handleNext} disabled={!selectedProviderId}>
            {t('quickSetup.next')}
          </Button>
        </div>
      );
    }
    if (step === 'model') {
      return (
        <div className="openbitfun-model-settings__quick-setup-footer">
          <Button variant="text" onClick={handleBack} disabled={saving}>
            <ArrowLeft size={14} aria-hidden="true" />{t('quickSetup.back')}
          </Button>
          <Button
            onClick={() => void handleTestAndSave()}
            disabled={!selectedModelId || (requiresKey && !apiKey.trim()) || saving}
            loading={saving}
            leadingIcon={saving ? undefined : <Wifi size={14} />}
          >
            {t('quickSetup.testAndSave')}
          </Button>
        </div>
      );
    }
    return (
      <div className="openbitfun-model-settings__quick-setup-footer">
        <Button onClick={handleClose}>{t('quickSetup.finish')}</Button>
      </div>
    );
  };

  const renderSteps = () => (
    <>
      {step === 'provider' && renderProviderStep()}
      {step === 'model' && renderModelStep()}
      {step === 'done' && renderDoneStep()}
    </>
  );

  if (variant === 'fullscreen') {
    return (
      <div
        className="openbitfun-model-settings__quick-setup openbitfun-model-settings__quick-setup--fullscreen"
        role="dialog"
        aria-modal="true"
        aria-label={t('quickSetup.title')}
      >
        <div className="openbitfun-model-settings__quick-setup-panel">
          <div className="openbitfun-model-settings__quick-setup-header">
            <h2 className="openbitfun-model-settings__quick-setup-title">{t('quickSetup.title')}</h2>
            {onSkip && (
              <Button variant="text" size="sm" onClick={onSkip}>
                {t('quickSetup.later')}
              </Button>
            )}
          </div>
          <div className="openbitfun-model-settings__quick-setup-body">{renderSteps()}</div>
          {renderFooter()}
        </div>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) handleClose(); }} size="md">
      <DialogHeader className="openbitfun-model-settings__quick-setup-header">
        <DialogHeading>
          <DialogTitle>{t('quickSetup.title')}</DialogTitle>
        </DialogHeading>
        <DialogClose />
      </DialogHeader>
      <DialogBody className="openbitfun-model-settings__quick-setup-body">
        {renderSteps()}
      </DialogBody>
      {renderFooter()}
    </Dialog>
  );
}
