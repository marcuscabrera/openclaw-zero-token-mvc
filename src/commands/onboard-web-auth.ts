/**
 * Web Model Auth Onboard
 *
 * Módulo independente de autorização de modelos Web
 * Suporta autorização simultânea de múltiplos modelos Web
 */

import type { WizardStep } from "../wizard/types.js";
import { loadConfig, writeConfigFile } from "../config/io.js";
import type { OpenClawConfig } from "../config/config.js";
import { resolveBrowserConfig, resolveProfile } from "../browser/config.js";
import { ensureAuthProfileStore, saveAuthProfileStore } from "../agents/auth-profiles.js";
import type { AuthProfileStore } from "../agents/auth-profiles/types.js";

// Importa as funções de login de cada modelo Web
import { loginClaudeWeb } from "../providers/claude-web-auth.js";
import { loginChatGPTWeb } from "../providers/chatgpt-web-auth.js";
import { loginDeepseekWeb } from "../providers/deepseek-web-auth.js";
import { loginDoubaoWeb } from "../providers/doubao-web-auth.js";
import { loginGeminiWeb } from "../providers/gemini-web-auth.js";
import { loginZWeb } from "../providers/glm-web-auth.js";
import { loginGlmIntlWeb } from "../providers/glm-intl-web-auth.js";
import { loginGrokWeb } from "../providers/grok-web-auth.js";
import { loginKimiWeb } from "../providers/kimi-web-auth.js";
import { loginQwenWeb } from "../providers/qwen-web-auth.js";
import { loginQwenCNWeb } from "../providers/qwen-cn-web-auth.js";

// Função auxiliar para salvar credenciais de modelos Web
async function saveWebModelCredentials(
  providerId: string,
  credentials: unknown
): Promise<void> {
  const store = ensureAuthProfileStore();
  const profileId = `${providerId}:default`;

  store.profiles[profileId] = {
    type: "token",
    provider: providerId,
    token: JSON.stringify(credentials),
  };

  saveAuthProfileStore(store);
  console.log(`  > Credenciais salvas em auth-profiles.json`);
}

// Função para atualizar a lista de permissão de modelos Web
async function addModelToWhitelist(providerId: string, modelIds: string[]): Promise<void> {
  const config = loadConfig();

  // Inicializa o campo models (se ainda não existir)
  if (!config.agents.defaults.models) {
    config.agents.defaults.models = {};
  }

  // Mapeamento de aliases de modelos
  const modelAliases: Record<string, Record<string, string>> = {
    "claude-web": {
      "claude-sonnet-4-6": "Claude Web",
      "claude-opus-4-6": "Claude Opus",
      "claude-haiku-4-6": "Claude Haiku",
    },
    "chatgpt-web": {
      "gpt-4": "ChatGPT Web",
    },
    "deepseek-web": {
      "deepseek-chat": "DeepSeek V3",
      "deepseek-reasoner": "DeepSeek R1",
    },
    "doubao-web": {
      "doubao-seed-2.0": "Doubao Browser",
    },
    "gemini-web": {
      "gemini-pro": "Gemini Pro",
      "gemini-ultra": "Gemini Ultra",
    },
    "glm-web": {
      "glm-4-plus": "GLM Web",
    },
    "glm-intl-web": {
      "glm-4-plus": "GLM-4 Plus (International)",
      "glm-4-think": "GLM-4 Think",
    },
    "grok-web": {
      "grok-2": "Grok Web",
    },
    "kimi-web": {
      "moonshot-v1-32k": "Kimi Web",
    },
    "qwen-web": {
      "qwen-max": "Qwen Web",
    },
    "qwen-cn-web": {
      "qwen-turbo": "Qwen CN Web",
    },
  };

  // Adiciona os modelos à lista de permissão
  for (const modelId of modelIds) {
    const modelKey = `${providerId}/${modelId}`;
    const alias = modelAliases[providerId]?.[modelId] || modelId;
    config.agents.defaults.models[modelKey] = { alias };
  }

  await writeConfigFile(config);
  console.log(`  > Lista de permissão de modelos atualizada em openclaw.json`);
}

// Definição dos modelos Web
interface WebModelProvider {
  id: string;
  name: string;
  loginFn: (params: {
    onProgress: (msg: string) => void;
    openUrl: (url: string) => Promise<boolean>;
  }) => Promise<unknown>;
}

const WEB_MODEL_PROVIDERS: WebModelProvider[] = [
  { id: "claude-web", name: "Claude Web", loginFn: loginClaudeWeb },
  { id: "chatgpt-web", name: "ChatGPT Web", loginFn: loginChatGPTWeb },
  { id: "deepseek-web", name: "DeepSeek Web", loginFn: loginDeepseekWeb },
  { id: "doubao-web", name: "Doubao Web", loginFn: loginDoubaoWeb },
  { id: "gemini-web", name: "Gemini Web", loginFn: loginGeminiWeb },
  { id: "glm-web", name: "GLM Web (CN)", loginFn: loginZWeb },
  { id: "glm-intl-web", name: "GLM Web (Internacional)", loginFn: loginGlmIntlWeb },
  { id: "grok-web", name: "Grok Web", loginFn: loginGrokWeb },
  { id: "kimi-web", name: "Kimi Web", loginFn: loginKimiWeb },
  { id: "qwen-web", name: "Qwen Web (Alibaba CN)", loginFn: loginQwenWeb },
  { id: "qwen-cn-web", name: "Qwen Web (Alibaba Internacional)", loginFn: loginQwenCNWeb },
];

export async function runOnboardWebAuth(): Promise<void> {
  console.log("\n🦞 Web Model Auth Onboard\n");

  // Exibe os modelos já autorizados
  const store = ensureAuthProfileStore();
  const authorizedModels = Object.keys(store.profiles).filter((key) =>
    key.endsWith("-web") || key.includes("-web:")
  );

  if (authorizedModels.length > 0) {
    console.log("Modelos Web autorizados:");
    for (const model of authorizedModels) {
      console.log(`  - ${model}`);
    }
    console.log("");
  }

  // Seleciona os modelos a autorizar
  console.log("Selecione os modelos Web a autorizar (separe múltiplos por vírgula):\n");

  for (let i = 0; i < WEB_MODEL_PROVIDERS.length; i++) {
    const provider = WEB_MODEL_PROVIDERS[i];
    const isAuthorized = authorizedModels.some((m) => m.startsWith(provider.id));
    const status = isAuthorized ? " ✓ Autorizado" : "";
    console.log(`  ${i + 1}. ${provider.name}${status}`);
  }

  console.log("\n  0. Sair");
  console.log("  a. Autorizar todos os modelos");
  console.log("");

  // Aguarda entrada do usuário
  const readline = await import("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> =>
    new Promise((resolve) => rl.question(prompt, resolve));

  const input = await question("Digite a opção: ");

  rl.close();

  if (input.trim() === "0" || input.trim() === "") {
    console.log("Saindo.");
    return;
  }

  // Analisa os modelos selecionados
  let selectedProviders: WebModelProvider[] = [];

  if (input.trim() === "a") {
    selectedProviders = WEB_MODEL_PROVIDERS;
  } else {
    const indices = input.split(",").map((s) => parseInt(s.trim()) - 1);
    selectedProviders = indices
      .filter((i) => i >= 0 && i < WEB_MODEL_PROVIDERS.length)
      .map((i) => WEB_MODEL_PROVIDERS[i]);
  }

  if (selectedProviders.length === 0) {
    console.log("Nenhum modelo selecionado.");
    return;
  }

  console.log(`\nAutorizando os seguintes modelos: ${selectedProviders.map((p) => p.name).join(", ")}`);

  // Lista de IDs de modelos por provedor Web
  const providerModelIds: Record<string, string[]> = {
    "claude-web": ["claude-sonnet-4-6", "claude-opus-4-6", "claude-haiku-4-6"],
    "chatgpt-web": ["gpt-4"],
    "deepseek-web": ["deepseek-chat", "deepseek-reasoner"],
    "doubao-web": ["doubao-seed-2.0"],
    "gemini-web": ["gemini-pro", "gemini-ultra"],
    "glm-web": ["glm-4-plus"],
    "glm-intl-web": ["glm-4-plus", "glm-4-think"],
    "grok-web": ["grok-2"],
    "kimi-web": ["moonshot-v1-32k"],
    "qwen-web": ["qwen-max"],
    "qwen-cn-web": ["qwen-turbo"],
  };

  // Autoriza um por um
  for (const provider of selectedProviders) {
    console.log(`\nAutorizando ${provider.name}...`);
    try {
      const result = await provider.loginFn({
        onProgress: (msg) => console.log(`  > ${msg}`),
        openUrl: async (url) => {
          console.log(`  > Abrindo navegador: ${url}`);
          return true;
        },
      });

      // Se as credenciais foram retornadas, salva em auth-profiles.json
      if (result && typeof result === "object") {
        await saveWebModelCredentials(provider.id, result);
      }

      // Adiciona os modelos à lista de permissão
      const modelIds = providerModelIds[provider.id] || [];
      if (modelIds.length > 0) {
        await addModelToWhitelist(provider.id, modelIds);
      }

      console.log(`  ✓ ${provider.name} 授权成功!`);
    } catch (error) {
      console.error(`  ✗ ${provider.name} 授权失败:`, error);
    }
  }

  console.log("\n授权完成!");
  console.log("你可以在 Web UI 中使用这些模型了。");
}

// 注册为 CLI 命令
export const ONBOARD_WEB_AUTH_STEP: WizardStep = {
  title: "Web Model Auth",
  description: "Authorize Web AI models (Claude, ChatGPT, DeepSeek, etc.)",
  run: async () => {
    await runOnboardWebAuth();
  },
};
