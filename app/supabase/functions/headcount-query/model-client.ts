export class ModelServiceError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string) {
    super(message);
    this.name = 'ModelServiceError';
  }
}

const transient = new Set([408, 429, 500, 502, 503, 504]);
const providerStatuses = new Set(['UNAVAILABLE', 'RESOURCE_EXHAUSTED', 'INTERNAL', 'DEADLINE_EXCEEDED', 'PERMISSION_DENIED', 'UNAUTHENTICATED', 'NOT_FOUND', 'INVALID_ARGUMENT']);

export type ModelProvider = 'google' | 'nvidia';
export interface ModelConfig { provider: ModelProvider; apiKey?: string; model: string; fallbackModel: string }

export function readModelConfig(): ModelConfig {
  const selection = Deno.env.get('LLM_PROVIDER')?.trim().toLowerCase() || (Deno.env.get('NVIDIA_API_KEY')?.trim() ? 'nvidia' : 'google');
  if (!['google', 'nvidia'].includes(selection)) throw new ModelServiceError('LLM_PROVIDER 僅支援 nvidia 或 google。', 503, 'MODEL_INVALID_CONFIG');
  if (selection === 'nvidia') return {provider:'nvidia', apiKey:Deno.env.get('NVIDIA_API_KEY')?.trim(), model:Deno.env.get('NVIDIA_MODEL')?.trim() || '', fallbackModel:Deno.env.get('NVIDIA_FALLBACK_MODEL')?.trim() || ''};
  return {provider:'google', apiKey:(Deno.env.get('GOOGLE_AI_API_KEY') || Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_API_KEY'))?.trim(), model:Deno.env.get('GOOGLE_MODEL')?.trim() || 'gemma-4-31b-it', fallbackModel:Deno.env.get('GOOGLE_FALLBACK_MODEL')?.trim() ?? 'gemma-4-26b-a4b-it'};
}

function providerError(status: number, provider: ModelProvider): ModelServiceError {
  const name = provider === 'nvidia' ? 'NVIDIA NIM' : 'Google';
  const modelSetting = provider === 'nvidia' ? 'NVIDIA_MODEL' : 'GOOGLE_MODEL';
  if (status === 401 || status === 403) return new ModelServiceError(`${name} 模型存取遭拒，請確認 API Key 與模型使用權限。`, 502, 'MODEL_ACCESS_DENIED');
  if (status === 404) return new ModelServiceError(`找不到指定模型，請確認 ${modelSetting} 的模型名稱與可用性。`, 502, 'MODEL_NOT_FOUND');
  if (status === 400) return new ModelServiceError(`${name} 不接受目前的模型請求設定，請檢查模型支援的參數。`, 502, 'MODEL_INVALID_REQUEST');
  if (status === 429) return new ModelServiceError(`${name} 使用額度或速率已達上限，請稍後再試。`, 429, 'MODEL_RATE_LIMITED');
  if (status === 408 || status === 504) return new ModelServiceError(`${name} 模型回應逾時，已達自動重試上限，請稍後再試。`, 504, 'MODEL_TIMEOUT');
  return new ModelServiceError(`${name} 模型服務暫時忙碌或不可用，已達自動重試上限，請稍後再試。`, 503, 'MODEL_UNAVAILABLE');
}

/** One client per incoming request: retries, SQL repair and chart planning share a deadline. */
export class ModelClient {
  readonly usedModels = new Set<string>();
  readonly events: string[] = [];
  private readonly deadline: number;

  constructor(private readonly config: ModelConfig, budgetMs = 110_000) {
    this.deadline = Date.now() + budgetMs;
  }

  get remainingMs() { return Math.max(0, this.deadline - Date.now()); }

  async generate(prompt: string, maxTokens = 3000): Promise<any> {
    if (!this.config.apiKey || !this.config.model) throw new ModelServiceError(this.config.provider === 'nvidia' ? '請設定 NVIDIA_API_KEY 與 NVIDIA_MODEL。' : '請設定 GOOGLE_AI_API_KEY 與 GOOGLE_MODEL。', 503, 'MODEL_NOT_CONFIGURED');
    const models = [this.config.model, this.config.model, this.config.fallbackModel || this.config.model];
    let lastError = providerError(503, this.config.provider);
    for (let attempt = 0; attempt < models.length; attempt++) {
      if (this.remainingMs < 1000) throw lastError;
      if (attempt > 0) {
        const delay = Math.min(800 * 2 ** (attempt - 1) + Math.random() * 300, this.remainingMs - 500);
        if (delay <= 0) throw lastError;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      const model = models[attempt];
      let res: Response;
      try {
        const nvidia = this.config.provider === 'nvidia';
        res = await fetch(nvidia ? 'https://integrate.api.nvidia.com/v1/chat/completions' : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST', headers: nvidia ? {'Content-Type':'application/json', 'Authorization':`Bearer ${this.config.apiKey}`} : {'Content-Type':'application/json','x-goog-api-key':this.config.apiKey},
          signal: AbortSignal.timeout(Math.max(1, Math.min(60_000, this.remainingMs))),
          body: JSON.stringify(nvidia
            ? {model, messages:[{role:'system',content:'Return exactly one JSON object. No Markdown or explanation outside JSON.'},{role:'user',content:prompt}], max_tokens:maxTokens, temperature:0.1, stream:false}
            : {contents:[{role:'user',parts:[{text:prompt}]}], generationConfig:{temperature:0.1,maxOutputTokens:maxTokens}})
        });
      } catch (error) {
        const timeout = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name);
        lastError = providerError(timeout ? 504 : 503, this.config.provider);
        console.warn(JSON.stringify({event: 'model_request_failed', provider:this.config.provider, model, attempt: attempt + 1, status: timeout ? 504 : 503, code: timeout ? 'TIMEOUT' : 'NETWORK_ERROR'}));
        continue;
      }
      if (!res.ok) {
        const status = res.status;
        const retryAfter = res.headers.get('retry-after');
        // Retain only an allowlisted diagnostic enum, never provider text, prompts or keys.
        let providerStatus: string | undefined;
        try {
          const payload = await res.json();
          if (providerStatuses.has(payload?.error?.status)) providerStatus = payload.error.status;
        } catch { await res.body?.cancel().catch(() => {}); }
        console.warn(JSON.stringify({event: 'model_request_failed', provider:this.config.provider, model, attempt: attempt + 1, status, providerStatus}));
        lastError = providerError(status, this.config.provider);
        if (!transient.has(status)) throw lastError;
        const requestedWait = retryAfter ? (/^\d+(\.\d+)?$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now()) : 0;
        // A long quota cooldown cannot fit in this synchronous Edge request.
        if (requestedWait > 4000 || requestedWait >= this.remainingMs - 1000) throw lastError;
        if (requestedWait > 0 && attempt < models.length - 1) await new Promise(resolve => setTimeout(resolve, requestedWait));
        continue;
      }
      let payload: any;
      try { payload = await res.json(); }
      catch { throw new ModelServiceError('模型服務回傳無法解析的回應，請重新查詢。', 502, 'MODEL_INVALID_RESPONSE'); }
      const raw = this.config.provider === 'nvidia' ? String(payload.choices?.[0]?.message?.content || '').trim() : (payload.candidates?.[0]?.content?.parts || []).filter((p: any) => !p.thought).map((p: any) => p.text || '').join('').trim();
      if (this.config.provider === 'nvidia' && payload.choices?.[0]?.finish_reason === 'length') throw new ModelServiceError('模型輸出達到長度上限，請縮小查詢範圍。',502,'MODEL_OUTPUT_TRUNCATED');
      const text = raw.replace(/^<think>[\s\S]*?<\/think>\s*/, '').replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
      let value: any;
      try { value = JSON.parse(text); }
      catch { throw new ModelServiceError('模型未回傳有效 JSON，請重新查詢。', 502, 'MODEL_INVALID_JSON'); }
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ModelServiceError('模型回應結構不正確，請重新查詢。', 502, 'MODEL_INVALID_JSON');
      this.usedModels.add(model);
      if (model !== this.config.model) this.events.push(`主要模型暫時不可用，已改用 ${model} 完成此階段。`);
      return value;
    }
    throw lastError;
  }
}
