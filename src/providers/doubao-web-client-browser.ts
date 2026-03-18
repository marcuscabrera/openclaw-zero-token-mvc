import crypto from "node:crypto";
import { chromium } from "playwright-core";
import type { BrowserContext, Page } from "playwright-core";
import type { ModelDefinitionConfig } from "../config/types.models.js";
import { getHeadersWithAuth } from "../browser/cdp.helpers.js";
import {
  launchOpenClawChrome,
  stopOpenClawChrome,
  getChromeWebSocketUrl,
  type RunningChrome,
} from "../browser/chrome.js";
import { resolveBrowserConfig, resolveProfile } from "../browser/config.js";
import { loadConfig } from "../config/io.js";

export interface DoubaoWebClientOptions {
  sessionid: string;
  ttwid?: string;
  cookie?: string;
  userAgent?: string;
}

/**
 * Doubao Web Client using Playwright browser context
 * Baseado na implementação do Claude; executa requisições no contexto do navegador para contornar anti-bot
 */
export class DoubaoWebClientBrowser {
  private sessionid: string;
  private ttwid?: string;
  private cookie: string;
  private userAgent: string;
  private baseUrl = "https://www.doubao.com";
  private browser: BrowserContext | null = null;
  private page: Page | null = null;
  private running: RunningChrome | null = null;
  private conversationId: string | null = null;  // Reutiliza o ID de conversa existente

  constructor(options: DoubaoWebClientOptions | string) {
    if (typeof options === "string") {
      const parsed = JSON.parse(options) as DoubaoWebClientOptions;
      this.sessionid = parsed.sessionid;
      this.ttwid = parsed.ttwid;
      this.cookie = parsed.cookie || this.buildCookieString(parsed.sessionid, parsed.ttwid);
      this.userAgent = parsed.userAgent || "Mozilla/5.0";
    } else {
      this.sessionid = options.sessionid;
      this.ttwid = options.ttwid;
      this.cookie = options.cookie || this.buildCookieString(options.sessionid, options.ttwid);
      this.userAgent = options.userAgent || "Mozilla/5.0";
    }

    if (!this.sessionid) {
      throw new Error("Doubao sessionid is required");
    }
    if (!this.cookie) {
      throw new Error("Doubao cookie could not be built");
    }
  }

  private buildCookieString(sessionid: string | undefined, ttwid?: string): string {
    if (!sessionid) {
      return "";
    }
    if (ttwid) {
      return `sessionid=${sessionid}; ttwid=${ttwid}`;
    }
    return `sessionid=${sessionid}`;
  }

  private async ensureBrowser() {
    if (this.browser && this.page) {
      return { browser: this.browser, page: this.page };
    }

    const rootConfig = loadConfig();
    const browserConfig = resolveBrowserConfig(rootConfig.browser, rootConfig);
    const profile = resolveProfile(browserConfig, browserConfig.defaultProfile);
    if (!profile) {
      throw new Error(`Could not resolve browser profile '${browserConfig.defaultProfile}'`);
    }

    // If attachOnly is true, connect to existing Chrome instead of launching
    if (browserConfig.attachOnly) {
      console.log(`[Doubao Web Browser] Connecting to existing Chrome at ${profile.cdpUrl}`);
      
      let wsUrl: string | null = null;
      for (let i = 0; i < 10; i++) {
        wsUrl = await getChromeWebSocketUrl(profile.cdpUrl, 2000);
        if (wsUrl) {
          break;
        }
        await new Promise((r) => setTimeout(r, 500));
      }

      if (!wsUrl) {
        throw new Error(
          `Failed to connect to Chrome at ${profile.cdpUrl}. ` +
          `Make sure Chrome is running in debug mode`
        );
      }

      this.browser = (await chromium.connectOverCDP(wsUrl, {
        headers: getHeadersWithAuth(wsUrl),
      })).contexts()[0]!;

      // Find the Doubao page or create new one
      const pages = this.browser!.pages();
      let doubaoPage = pages.find(p => p.url().includes('doubao.com'));

      if (doubaoPage) {
        console.log(`[Doubao Web Browser] Found existing Doubao page: ${doubaoPage.url()}`);
        this.page = doubaoPage;
      } else {
        console.log(`[Doubao Web Browser] No Doubao page found, creating new one...`);
        this.page = await this.browser!.newPage();
        await this.page.goto('https://www.doubao.com/chat/', { waitUntil: 'domcontentloaded' });
      }
      
      console.log(`[Doubao Web Browser] Connected to existing Chrome successfully`);
    } else {
      // Launch new Chrome
      this.running = await launchOpenClawChrome(browserConfig, profile);

      const cdpUrl = `http://127.0.0.1:${this.running.cdpPort}`;
      let wsUrl: string | null = null;

      for (let i = 0; i < 10; i++) {
        wsUrl = await getChromeWebSocketUrl(cdpUrl, 2000);
        if (wsUrl) {
          break;
        }
        await new Promise((r) => setTimeout(r, 500));
      }

      if (!wsUrl) {
        throw new Error(`Failed to resolve Chrome WebSocket URL from ${cdpUrl}`);
      }

      this.browser = (await chromium.connectOverCDP(wsUrl, {
        headers: getHeadersWithAuth(wsUrl),
      })).contexts()[0]!;

      this.page = this.browser!.pages()[0] || (await this.browser!.newPage());
    }

    // Set cookies
    const cookies = this.cookie.split(";").map((c) => {
      const [name, ...valueParts] = c.trim().split("=");
      return {
        name: name.trim(),
        value: valueParts.join("=").trim(),
        domain: ".doubao.com",
        path: "/",
      };
    });

    await this.browser!.addCookies(cookies);

    return { browser: this.browser, page: this.page };
  }

  async init() {
    // Garante que o navegador está iniciado e os cookies foram configurados
    await this.ensureBrowser();
  }

  /** Mescla múltiplas mensagens em um único content de texto para a interface samantha */
  private mergeMessagesForSamantha(messages: Array<{ role: string; content: string }>): string {
    return messages
      .map(m => {
        const role = m.role === "user" ? "user" : m.role === "assistant" ? "assistant" : "system";
        return `<|im_start|>${role}\n${m.content}\n`;
      })
      .join("") + "<|im_end|>\n";
  }

  async chatCompletions(params: {
    messages: Array<{ role: string; content: string }>;
    model?: string;
    signal?: AbortSignal;
  }): Promise<ReadableStream<Uint8Array>> {
    const { page } = await this.ensureBrowser();

    const modelId = params.model || "doubao-seed-2.0";
    const text = this.mergeMessagesForSamantha(params.messages);

    console.log(`[Doubao Web Browser] Sending message`);
    console.log(`[Doubao Web Browser] Model: ${modelId}`);
    console.log(`[Doubao Web Browser] Messages count: ${params.messages.length}`);

    // Constrói o corpo da requisição
    const requestBody = {
      messages: [
        {
          content: JSON.stringify({ text }),
          content_type: 2001,
          attachments: [],
          references: [],
        },
      ],
      completion_option: {
        is_regen: false,
        with_suggest: true,
        need_create_conversation: !this.conversationId,  // Não recria a conversa se já existe um conversation_id
        launch_stage: 1,
        is_replace: false,
        is_delete: false,
        message_from: 0,
        event_id: "0",
      },
      conversation_id: this.conversationId || "0",  // Reutiliza o conversation_id existente
      local_conversation_id: `local_16${Date.now().toString().slice(-14)}`,
      local_message_id: crypto.randomUUID(),
    };

    // Executa a requisição no contexto do navegador (essencial para contornar anti-bot)
    const responseData = await page.evaluate(
      async ({ baseUrl, body }) => {
        // Constrói os parâmetros de query (o navegador gera automaticamente os parâmetros dinâmicos)
        const params = new URLSearchParams({
          aid: "497858",
          device_platform: "web",
          language: "zh",
          pkg_type: "release_version",
          real_aid: "497858",
          region: "CN",
          samantha_web: "1",
          sys_region: "CN",
          use_olympus_account: "1",
          version_code: "20800",
        });

        const url = `${baseUrl}/samantha/chat/completion?${params.toString()}`;

        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
            "Referer": "https://www.doubao.com/chat/",
            "Origin": "https://www.doubao.com",
            "Agw-js-conv": "str",
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errorText = await res.text();
          return { ok: false, status: res.status, error: errorText };
        }

        // Lê a resposta em streaming
        const reader = res.body?.getReader();
        if (!reader) {
          return { ok: false, status: 500, error: "No response body" };
        }

        const decoder = new TextDecoder();
        let fullText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fullText += decoder.decode(value, { stream: true });
        }

        return { ok: true, data: fullText };
      },
      { baseUrl: this.baseUrl, body: requestBody },
    );

    console.log(`[Doubao Web Browser] Message response: ${responseData.ok ? 200 : responseData.status}`);

    if (!responseData.ok) {
      console.error(`[Doubao Web Browser] Message failed: ${responseData.status} - ${responseData.error}`);

      if (responseData.status === 401) {
        throw new Error(
          "Authentication failed. Please re-run onboarding to refresh your Doubao session."
        );
      }
      throw new Error(`Doubao API error: ${responseData.status}`);
    }

    console.log(`[Doubao Web Browser] Response data length: ${responseData.data?.length || 0} bytes`);
    console.log(`[Doubao Web Browser] Response data preview: ${responseData.data?.slice(0, 500)}`);

    // Extrai o conversation_id da resposta
    if (!this.conversationId && responseData.data) {
      try {
        // Procura o conversation_id nos dados (pode estar no event_data de cada evento)
        const lines = responseData.data.split('\n');
        for (const line of lines) {
          if (line.startsWith('data:') && line.includes('conversation_id')) {
            const match = line.match(/"conversation_id"\s*:\s*"([^"]+)"/);
            if (match && match[1] && match[1] !== '0') {
              this.conversationId = match[1];
              console.log(`[Doubao Web Browser] Captured conversation_id: ${this.conversationId}`);
              break;
            }
          }
        }
      } catch (e) {
        console.log(`[Doubao Web Browser] Could not extract conversation_id: ${e}`);
      }
    }

    // Converte para ReadableStream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(responseData.data));
        controller.close();
      },
    });

    return stream;
  }

  async close() {
    if (this.running) {
      await stopOpenClawChrome(this.running);
      this.running = null;
    }
    this.browser = null;
    this.page = null;
  }

  async discoverModels(): Promise<ModelDefinitionConfig[]> {
    return [
      {
        id: "doubao-seed-2.0",
        name: "Doubao-Seed 2.0",
        api: "doubao-web",
        reasoning: true,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 64000,
        maxTokens: 8192,
      },
    ];
  }
}
