export class ModelServiceError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string) {
    super(message); this.name = 'ModelServiceError';
  }
}
export type ModelProvider = 'google' | 'nvidia';
export interface ModelConfig { provider: ModelProvider; apiKey?: string; model: string }
export function readModelConfig(provider: ModelProvider = 'google'): ModelConfig {
  if (provider === 'nvidia') return {provider,apiKey:Deno.env.get('NVIDIA_API_KEY')?.trim(),model:Deno.env.get('NVIDIA_MODEL')?.trim() || 'nvidia/nemotron-3-ultra-550b-a55b'};
  return {provider,apiKey:(Deno.env.get('GOOGLE_AI_API_KEY') || Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_API_KEY'))?.trim(),model:Deno.env.get('GOOGLE_PRIMARY_MODEL')?.trim() || 'gemini-4-hydrogen'};
}
function providerError(status:number,provider:ModelProvider):ModelServiceError {
  const name=provider==='google'?'Google':'NVIDIA NIM';
  if(status===401||status===403)return new ModelServiceError(`${name} 模型存取遭拒，請確認 API Key 與權限。`,502,'MODEL_ACCESS_DENIED');
  if(status===404)return new ModelServiceError(`${name} 找不到指定模型，請確認模型名稱與可用性。`,502,'MODEL_NOT_FOUND');
  if(status===400)return new ModelServiceError(`${name} 不接受目前的模型請求設定。`,502,'MODEL_INVALID_REQUEST');
  if(status===429)return new ModelServiceError(`${name} 使用額度或速率已達上限。`,429,'MODEL_RATE_LIMITED');
  return new ModelServiceError(`${name} ${status===408||status===504?'模型回應逾時':'模型服務暫時不可用'}，請稍後再試。`,status===408||status===504?504:503,status===408||status===504?'MODEL_TIMEOUT':'MODEL_UNAVAILABLE');
}

/** One request-wide deadline; after failover, stay on NVIDIA for SQL repair and chart planning. */
export class ModelClient {
  readonly usedModels=new Set<string>();
  readonly usedProviders=new Set<ModelProvider>();
  readonly events:string[]=[];
  private readonly deadline:number;
  private switched=false;
  private lastSuccessful?:ModelConfig;
  constructor(private readonly config:ModelConfig,budgetMs=110_000,private readonly fallback?:ModelConfig){this.deadline=Date.now()+budgetMs;}
  get remainingMs(){return Math.max(0,this.deadline-Date.now());}
  get provider(){return this.lastSuccessful?.provider||(this.switched?this.fallback!.provider:this.config.provider);}
  get model(){return this.lastSuccessful?.model||(this.switched?this.fallback!.model:this.config.model);}

  async generate(prompt:string,maxTokens=3000):Promise<any>{
    if(this.switched)return this.attempts(this.fallback!,prompt,maxTokens,2);
    try{return await this.attempts(this.config,prompt,maxTokens,this.fallback?1:2);}
    catch(error){
      if(!(error instanceof ModelServiceError)||error.code==='MODEL_CONTENT_BLOCKED'||!this.fallback)throw error;
      this.switched=true;
      this.events.push('Google 模型暫時無法完成請求，已自動切換至 NVIDIA NIM 備援。');
      try{return await this.attempts(this.fallback,prompt,maxTokens,2);}
      catch(backupError){
        const backup=backupError as ModelServiceError;
        throw new ModelServiceError(`Google 主服務與 NVIDIA NIM 備援皆無法完成請求。${backup.message}`,backup.status||503,'MODEL_ALL_PROVIDERS_FAILED');
      }
    }
  }
  private async attempts(config:ModelConfig,prompt:string,maxTokens:number,count:number){
    if(!config.apiKey||!config.model)throw new ModelServiceError(`${config.provider==='google'?'Google':'NVIDIA NIM'} 模型設定不完整。`,503,'MODEL_NOT_CONFIGURED');
    let last=providerError(504,config.provider);
    for(let attempt=0;attempt<count;attempt++){
      if(this.remainingMs<1000)throw last;
      if(attempt){await new Promise(resolve=>setTimeout(resolve,Math.min(800,this.remainingMs-500)));}
      try{return await this.request(config,prompt,maxTokens);}
      catch(error){
        if(!(error instanceof ModelServiceError))throw error;
        last=error;
        console.warn(JSON.stringify({event:'model_request_failed',provider:config.provider,model:config.model,attempt:attempt+1,code:error.code}));
        if(!['MODEL_TIMEOUT','MODEL_UNAVAILABLE','MODEL_RATE_LIMITED'].includes(error.code))throw error;
      }
    }
    throw last;
  }
  private async request(config:ModelConfig,prompt:string,maxTokens:number){
    const nvidia=config.provider==='nvidia';
    // Google gets at most 30s and 40% of remaining time, reserving time for NVIDIA.
    const timeout=this.fallback&&!this.switched?Math.min(30_000,Math.floor(this.remainingMs*0.4)):Math.min(40_000,this.remainingMs);
    let res:Response;let payload:any;
    try{
      res=await fetch(nvidia?'https://integrate.api.nvidia.com/v1/chat/completions':`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`,{
        method:'POST',headers:nvidia?{'Content-Type':'application/json',Authorization:`Bearer ${config.apiKey}`}:{'Content-Type':'application/json','x-goog-api-key':config.apiKey!},
        signal:AbortSignal.timeout(Math.max(1,timeout)),
        body:JSON.stringify(nvidia?{model:config.model,messages:[{role:'system',content:'Return exactly one JSON object. No Markdown or explanation outside JSON.'},{role:'user',content:prompt}],max_tokens:maxTokens,temperature:0.1,stream:false}:{contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature:0.1,maxOutputTokens:Math.max(maxTokens,4096),responseMimeType:'application/json',thinkingConfig:{thinkingLevel:'low'}}})
      });
      if(!res.ok){await res.body?.cancel();throw providerError(res.status,config.provider);}
      try{payload=await res.json();}catch(error){if(error instanceof Error&&['TimeoutError','AbortError'].includes(error.name))throw error;throw new ModelServiceError('模型服務回傳無法解析的回應。',502,'MODEL_INVALID_RESPONSE');}
    }catch(error){
      if(error instanceof ModelServiceError)throw error;
      throw providerError(error instanceof Error&&['TimeoutError','AbortError'].includes(error.name)?504:503,config.provider);
    }
    const reason=nvidia?payload.choices?.[0]?.finish_reason:payload.candidates?.[0]?.finishReason;
    if(['SAFETY','BLOCKLIST','PROHIBITED_CONTENT','RECITATION','SPII','content_filter'].includes(reason)||payload.promptFeedback?.blockReason)throw new ModelServiceError('模型拒絕處理此內容，請調整問題。',422,'MODEL_CONTENT_BLOCKED');
    if(reason==='length'||reason==='MAX_TOKENS')throw new ModelServiceError('模型輸出達到長度上限，請縮小查詢範圍。',502,'MODEL_OUTPUT_TRUNCATED');
    const raw=nvidia?String(payload.choices?.[0]?.message?.content||'').trim():(payload.candidates?.[0]?.content?.parts||[]).filter((p:any)=>!p.thought).map((p:any)=>p.text||'').join('').trim();
    const text=raw.replace(/^<think>[\s\S]*?<\/think>\s*/,'').replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');
    let value:any;
    try{value=JSON.parse(text);}catch{throw new ModelServiceError('模型未回傳有效 JSON。',502,'MODEL_INVALID_JSON');}
    if(!value||typeof value!=='object'||Array.isArray(value))throw new ModelServiceError('模型回應結構不正確。',502,'MODEL_INVALID_JSON');
    this.lastSuccessful=config;
    this.usedModels.add(config.model);this.usedProviders.add(config.provider);
    return value;
  }
}
