import {
  PROVIDER_PRESETS,
  loadAiConfig,
  saveAiConfig,
  type UserAiConfig,
} from '../game/AiConfig';
import { testAiConnection } from '../game/JevClient';

export class SettingsDialog {
  private readonly overlay: HTMLElement;
  private readonly openBtn: HTMLButtonElement;
  private readonly closeBtn: HTMLButtonElement;
  private readonly cancelBtn: HTMLButtonElement;
  private readonly testBtn: HTMLButtonElement;
  private readonly fillPresetKeyBtn: HTMLButtonElement;
  private readonly toggleKeyBtn: HTMLButtonElement;
  private readonly form: HTMLFormElement;
  private readonly providerSelect: HTMLSelectElement;
  private readonly endpointInput: HTMLInputElement;
  private readonly modelInput: HTMLInputElement;
  private readonly modelList: HTMLDataListElement;
  private readonly keyInput: HTMLInputElement;
  private readonly headersInput: HTMLInputElement;
  private readonly statusEl: HTMLElement;

  private onSaveCallback: ((config: UserAiConfig) => void) | null = null;
  private isOpen = false;

  constructor() {
    this.overlay = this.getRequiredElement<HTMLElement>('#settings-overlay');
    this.openBtn = this.getRequiredElement<HTMLButtonElement>('#settings-btn');
    this.closeBtn = this.getRequiredElement<HTMLButtonElement>('#settings-close-btn');
    this.cancelBtn = this.getRequiredElement<HTMLButtonElement>('#cfg-cancel-btn');
    this.testBtn = this.getRequiredElement<HTMLButtonElement>('#cfg-test-btn');
    this.fillPresetKeyBtn = this.getRequiredElement<HTMLButtonElement>('#cfg-fill-preset-key-btn');
    this.toggleKeyBtn = this.getRequiredElement<HTMLButtonElement>('#cfg-toggle-key-btn');
    this.form = this.getRequiredElement<HTMLFormElement>('#settings-form');
    this.providerSelect = this.getRequiredElement<HTMLSelectElement>('#cfg-provider');
    this.endpointInput = this.getRequiredElement<HTMLInputElement>('#cfg-endpoint');
    this.modelInput = this.getRequiredElement<HTMLInputElement>('#cfg-model');
    this.modelList = this.getRequiredElement<HTMLDataListElement>('#cfg-model-list');
    this.keyInput = this.getRequiredElement<HTMLInputElement>('#cfg-key');
    this.headersInput = this.getRequiredElement<HTMLInputElement>('#cfg-headers');
    this.statusEl = this.getRequiredElement<HTMLElement>('#settings-status');

    this.initProviderOptions();
    this.bindEvents();
  }

  onConfigSaved(callback: (config: UserAiConfig) => void): void {
    this.onSaveCallback = callback;
  }

  open(): void {
    const config = loadAiConfig();
    this.populateForm(config);
    this.setStatus('', '');
    this.overlay.classList.remove('hidden');
    this.isOpen = true;
    this.providerSelect.focus();
  }

  close(): void {
    this.overlay.classList.add('hidden');
    this.isOpen = false;
    this.openBtn.focus();
  }

  dispose(): void {
    this.openBtn.removeEventListener('click', this.handleOpenClick);
    this.closeBtn.removeEventListener('click', this.handleCloseClick);
    this.cancelBtn.removeEventListener('click', this.handleCloseClick);
    this.form.removeEventListener('submit', this.handleFormSubmit);
    this.providerSelect.removeEventListener('change', this.handleProviderChange);
    this.fillPresetKeyBtn.removeEventListener('click', this.handleFillPresetKey);
    this.toggleKeyBtn.removeEventListener('click', this.handleToggleKeyVisibility);
    this.testBtn.removeEventListener('click', this.handleTestConnection);
    window.removeEventListener('keydown', this.handleWindowKeydown);
  }

  private initProviderOptions(): void {
    this.providerSelect.innerHTML = '';
    for (const preset of PROVIDER_PRESETS) {
      const option = document.createElement('option');
      option.value = preset.id;
      option.textContent = preset.name;
      this.providerSelect.appendChild(option);
    }
  }

  private bindEvents(): void {
    this.openBtn.addEventListener('click', this.handleOpenClick);
    this.closeBtn.addEventListener('click', this.handleCloseClick);
    this.cancelBtn.addEventListener('click', this.handleCloseClick);
    this.form.addEventListener('submit', this.handleFormSubmit);
    this.providerSelect.addEventListener('change', this.handleProviderChange);
    this.fillPresetKeyBtn.addEventListener('click', this.handleFillPresetKey);
    this.toggleKeyBtn.addEventListener('click', this.handleToggleKeyVisibility);
    this.testBtn.addEventListener('click', this.handleTestConnection);
    window.addEventListener('keydown', this.handleWindowKeydown);
  }

  private readonly handleOpenClick = (): void => {
    this.open();
  };

  private readonly handleCloseClick = (): void => {
    this.close();
  };

  private readonly handleWindowKeydown = (event: KeyboardEvent): void => {
    if (this.isOpen && event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
  };

  private populateForm(config: UserAiConfig): void {
    this.providerSelect.value = config.providerId || 'typesafe';
    this.endpointInput.value = config.endpoint || '';
    this.modelInput.value = config.model || '';
    this.keyInput.value = config.apiKey || '';
    this.headersInput.value =
      config.customHeaders && Object.keys(config.customHeaders).length > 0
        ? JSON.stringify(config.customHeaders)
        : '';

    const currentPreset = PROVIDER_PRESETS.find((p) => p.id === config.providerId);
    this.updateModelOptions(currentPreset?.models || []);
  }

  private updateModelOptions(models: string[]): void {
    this.modelList.innerHTML = '';
    for (const m of models) {
      const opt = document.createElement('option');
      opt.value = m;
      this.modelList.appendChild(opt);
    }
  }

  private readonly handleProviderChange = (): void => {
    const selectedId = this.providerSelect.value;
    const preset = PROVIDER_PRESETS.find((p) => p.id === selectedId);
    if (!preset) {
      return;
    }

    if (preset.id !== 'custom') {
      this.endpointInput.value = preset.endpoint;
      this.modelInput.value = preset.defaultModel;
      this.updateModelOptions(preset.models);
      this.headersInput.value =
        Object.keys(preset.customHeaders).length > 0
          ? JSON.stringify(preset.customHeaders)
          : '';
      if (preset.notes) {
        this.setStatus(preset.notes, 'info');
      }
    } else {
      this.updateModelOptions([]);
      this.setStatus('自定义通道：可自主输入接口地址、模型与密钥。', 'info');
    }
  };

  private readonly handleFillPresetKey = (): void => {
    const selectedId = this.providerSelect.value;
    const preset = PROVIDER_PRESETS.find((p) => p.id === selectedId);
    if (preset && preset.defaultKey) {
      this.keyInput.value = preset.defaultKey;
      this.setStatus('已填入预设密钥', 'success');
    } else {
      this.setStatus('当前通道无预设密钥，请手动输入。', 'info');
    }
  };

  private readonly handleToggleKeyVisibility = (): void => {
    if (this.keyInput.type === 'password') {
      this.keyInput.type = 'text';
      this.toggleKeyBtn.textContent = '隐藏';
    } else {
      this.keyInput.type = 'password';
      this.toggleKeyBtn.textContent = '显示';
    }
  };

  private readonly handleTestConnection = async (): Promise<void> => {
    const endpoint = this.endpointInput.value.trim();
    const model = this.modelInput.value.trim();
    const apiKey = this.keyInput.value.trim();
    const customHeadersRaw = this.headersInput.value.trim();

    let customHeaders: Record<string, string> = {};
    if (customHeadersRaw) {
      try {
        customHeaders = JSON.parse(customHeadersRaw);
      } catch {
        this.setStatus('请求头 JSON 格式无效，请检查语法。', 'error');
        return;
      }
    }

    this.setStatus('正在测试连接，请稍候...', 'loading');
    this.testBtn.disabled = true;

    try {
      const result = await testAiConnection({
        endpoint,
        model,
        apiKey,
        customHeaders,
      });

      if (result.ok) {
        this.setStatus(result.message, 'success');
      } else {
        this.setStatus(result.message, 'error');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.setStatus(`测试异常: ${msg}`, 'error');
    } finally {
      this.testBtn.disabled = false;
    }
  };

  private readonly handleFormSubmit = (event: Event): void => {
    event.preventDefault();

    const providerId = this.providerSelect.value;
    const endpoint = this.endpointInput.value.trim();
    const model = this.modelInput.value.trim();
    const apiKey = this.keyInput.value.trim();
    const customHeadersRaw = this.headersInput.value.trim();

    if (!endpoint) {
      this.setStatus('接口地址不能为空。', 'error');
      this.endpointInput.focus();
      return;
    }

    if (!model) {
      this.setStatus('模型名称不能为空。', 'error');
      this.modelInput.focus();
      return;
    }

    let customHeaders: Record<string, string> = {};
    if (customHeadersRaw) {
      try {
        customHeaders = JSON.parse(customHeadersRaw);
      } catch {
        this.setStatus('自定义请求头必须是合法的 JSON 对象。', 'error');
        this.headersInput.focus();
        return;
      }
    }

    const preset = PROVIDER_PRESETS.find((p) => p.id === providerId);
    const providerName = preset ? preset.name : '自定义通道';
    const shortName = preset ? preset.shortName : '自定义';

    const newConfig: UserAiConfig = {
      providerId,
      providerName,
      shortName,
      endpoint,
      model,
      apiKey,
      customHeaders,
    };

    saveAiConfig(newConfig);
    this.onSaveCallback?.(newConfig);
    this.close();
  };

  private setStatus(text: string, kind: 'success' | 'error' | 'info' | 'loading' | ''): void {
    this.statusEl.textContent = text;
    this.statusEl.className = 'settings-status';
    if (kind) {
      this.statusEl.classList.add(kind);
    }
  }

  private getRequiredElement<T extends HTMLElement>(selector: string): T {
    const el = document.querySelector<T>(selector);
    if (!el) {
      throw new Error(`找不到元素: ${selector}`);
    }
    return el;
  }
}
