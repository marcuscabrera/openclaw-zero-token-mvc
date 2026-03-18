# OpenClaw Zero Token

**Use LLMs sem tokens de API** — faça login pelo navegador uma vez e chame ChatGPT, Claude, Gemini, DeepSeek, Qwen (internacional/China), Doubao, Kimi, Zhipu GLM, Grok, Manus e muito mais gratuitamente através de um gateway unificado.

[Licença: MIT](https://opensource.org/licenses/MIT)

[English](README.md) | [简体中文](README.zh-CN.md) | Português (Brasil)

---

## Índice

- [Visão Geral](#visao-geral)
- [Como Funciona](#como-funciona)
- [Início Rápido](#inicio-rapido)
- [Uso](#uso)
- [Configuração](#configuracao)
- [Solução de Problemas](#solucao-de-problemas)
- [Roteiro](#roteiro)
- [Adicionando Novas Plataformas](#adicionando-novas-plataformas)
- [Estrutura de Arquivos](#estrutura-de-arquivos)
- [Notas de Segurança](#seguranca)
- [Sincronizar com Upstream](#sincronizar-upstream)
- [Contribuindo](#contribuindo)
- [Licença](#licenca)
- [Agradecimentos](#agradecimentos)
- [Aviso Legal](#aviso-legal)

---

<a id="visao-geral"></a>

## Visão Geral

O OpenClaw Zero Token é um fork do [OpenClaw](https://github.com/openclaw/openclaw) focado em **eliminar o custo de tokens de API**, controlando as interfaces web oficiais (login pelo navegador) em vez de chaves de API pagas.

### Por que Zero Token?

| Uso tradicional          | Método Zero Token              |
| ------------------------ | ------------------------------ |
| Comprar tokens de API    | **Completamente gratuito**     |
| Pagar por requisição     | Sem cota imposta               |
| Cartão de crédito exigido| Login apenas pelo navegador    |
| Tokens de API podem vazar| Credenciais armazenadas localmente |

### Provedores suportados

| Provedor                | Status        | Modelos (exemplos)                                   |
| ----------------------- | ------------- | ---------------------------------------------------- |
| DeepSeek                | ✅ testado    | deepseek-chat, deepseek-reasoner                     |
| Qwen Internacional      | ✅ testado    | Qwen 3.5 Plus, Qwen 3.5 Turbo                        |
| Qwen China              | ✅ testado    | Qwen 3.5 Plus, Qwen 3.5 Turbo                        |
| Kimi                    | ✅ testado    | Moonshot v1 8K / 32K / 128K                          |
| Claude Web              | ✅ testado    | claude-sonnet-4-6, claude-opus-4-6, claude-haiku-4-6 |
| Doubao                  | ✅ testado    | doubao-seed-2.0, doubao-pro                          |
| ChatGPT Web             | ✅ testado    | GPT-4, GPT-4 Turbo                                   |
| Gemini Web              | ✅ testado    | Gemini Pro, Gemini Ultra                             |
| Grok Web                | ✅ testado    | Grok 1, Grok 2                                       |
| GLM Web (Zhipu)         | ✅ testado    | glm-4-Plus, glm-4-Think                              |
| GLM Web (Internacional) | ✅ testado    | GLM-4 Plus, GLM-4 Think                              |
| Manus API               | ✅ testado    | Manus 1.6, Manus 1.6 Lite (chave de API, cota grátis)|

### Chamada de ferramentas

Todos os modelos suportados podem chamar **ferramentas locais** (`exec`, `read_file`, `list_dir`, `browser`, `apply_patch`, etc.), permitindo que agentes executem comandos, leiam/escrevam arquivos do workspace e automatizem o navegador.

| Tipo de provedor                                                    | Ferramentas | Notas                                                                              |
| ------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------- |
| Web (DeepSeek, Qwen, Kimi, Claude, Doubao, GLM, Grok, etc.)        | ✅          | Injeta descrições XML de ferramentas em `system`, analisa streams `<tool_call>`.  |
| ChatGPT Web / Gemini Web / Manus API                                | ✅          | Similar via descrições de ferramentas + contexto multi-turno + `<tool_call>`.     |
| OpenRouter / APIs compatíveis com OpenAI                            | ✅          | Usa `tools` / `tool_calls` nativo.                                                |
| Ollama                                                              | ✅          | Usa ferramentas nativas `/api/chat`.                                              |

O acesso a arquivos do agente é restrito pelo diretório de **workspace** configurado (veja `agents.defaults.workspace`).

### Funcionalidades extras

**AskOnce: uma pergunta, respostas de todos os modelos.**  
O AskOnce pode transmitir uma única consulta para múltiplos provedores configurados e exibir suas respostas lado a lado.

![AskOnce: pergunte uma vez, respostas multi-modelos](askonce.png)

---

<a id="como-funciona"></a>

## Como Funciona

### Arquitetura de alto nível

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                              OpenClaw Zero Token                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │   Web UI    │    │  CLI/TUI    │    │   Gateway   │    │   Canais    │  │
│  │  (Lit 3.x)  │    │             │    │  (Port API) │    │ (Telegram…) │  │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘  │
│         │                  │                  │                  │          │
│         └──────────────────┴──────────────────┴──────────────────┘          │
│                                    │                                         │
│                           ┌────────▼────────┐                               │
│                           │   Núcleo Agente │                               │
│                           │  (Motor PI-AI)  │                               │
│                           └────────┬────────┘                               │
│                                    │                                         │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  Camada de Provedores                                                 │  │
│  │  DeepSeek Web (Zero Token)                                       ✅   │  │
│  │  Qwen Web intl/cn (Zero Token)                                  ✅   │  │
│  │  Kimi (Zero Token)                                              ✅   │  │
│  │  Claude Web (Zero Token)                                        ✅   │  │
│  │  Doubao (Zero Token)                                            ✅   │  │
│  │  ChatGPT Web (Zero Token)                                       ✅   │  │
│  │  Gemini Web (Zero Token)                                        ✅   │  │
│  │  Grok Web (Zero Token)                                          ✅   │  │
│  │  GLM Web (Zero Token)                                           ✅   │  │
│  │  Manus API (Token)                                              ✅   │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Fluxo de autenticação DeepSeek (exemplo)

```text
1. Iniciar navegador
   openclaw gateway  ──▶  Chrome (CDP: 18892, user-data-dir)

2. Usuário faz login
   Navegador  ──▶  https://chat.deepseek.com  (QR code / login com senha)

3. Capturar credenciais
   Playwright CDP  ──▶  monitorar requisições de rede
                    └─▶ interceptar cabeçalho Authorization + cookies

4. Armazenar credenciais
   auth.json  ◀──  { cookie, bearer, userAgent }

5. Chamar a API web
   DeepSeek WebClient  ──▶  DeepSeek Web API  ──▶  chat.deepseek.com
   (reutiliza cookie + bearer token armazenados)
```

---

<a id="inicio-rapido"></a>

## Início Rápido

> **Plataformas**
>
> - 🍎 **macOS** / 🐧 **Linux**: siga o [START_HERE.md](START_HERE.md); instalação e configuração completas em [INSTALLATION.md](INSTALLATION.md).
> - 🪟 **Windows**: use o WSL2 e depois siga os passos do Linux. Instalar WSL2: `wsl --install`, documentação: <https://docs.microsoft.com/windows/wsl/install>

### Requisitos

- Node.js >= 22.12.0
- pnpm >= 9.0.0
- Navegador Chrome
- SO: macOS, Linux ou Windows (via WSL2)

### Scripts auxiliares (primeiro uso e uso diário)

Você pode executar `./start.sh` diretamente ou seguir os passos abaixo manualmente.

```text
Primeira vez:
  1. Build         npm install && npm run build && pnpm ui:build
  2. Iniciar Chrome  ./start-chrome-debug.sh
  3. Login nos sites  Qwen intl/cn, Kimi, DeepSeek, ...
  4. Onboard        ./onboard.sh webauth
  5. Iniciar servidor  ./server.sh start

Uso diário:
  start-chrome-debug.sh → onboard.sh → server.sh start
  server.sh [start|stop|restart|status] gerencia o gateway
```

**Visão geral dos scripts (3 scripts principais):**

| Script                  | Propósito                         | Quando usar                                                                  |
| ----------------------- | --------------------------------- | ---------------------------------------------------------------------------- |
| `start-chrome-debug.sh` | Iniciar Chrome em modo debug      | Passo 2: abre o navegador na porta 9222 para logins + onboarding             |
| `onboard.sh`            | Wizard de autenticação/onboarding | Passo 4/5: selecionar provedor (ex.: `deepseek-web`) e capturar credenciais  |
| `server.sh`             | Gerenciar serviço de gateway      | Passo 6 e uso diário: `start` / `stop` / `restart` / `status` na porta 3001 |

### Instalação

#### Clonar o repositório

```bash
git clone https://github.com/linuxhsj/openclaw-zero-token.git
cd openclaw-zero-token
```

#### Instalar dependências

```bash
pnpm install
```

#### Passo 1: Build

```bash
pnpm build
pnpm ui:build
```

#### Passo 2: Configurar autenticação

```bash
# (Opcional, mas recomendado antes do primeiro ./onboard.sh webauth)
# Copie o exemplo de configuração para o diretório de estado local:
# cp .openclaw-state.example/openclaw.json .openclaw-upstream-state/openclaw.json

# Na primeira execução, o onboard.sh perguntará se deseja copiar o arquivo de configuração; basta escolher sim.
# Ele copiará .openclaw-state.example/openclaw.json para .openclaw-upstream-state/openclaw.json;
# nas execuções seguintes, não é necessário copiar esses arquivos de configuração.

# Iniciar Chrome em modo debug
./start-chrome-debug.sh

# IMPORTANTE: Não feche este terminal; caso contrário, os passos seguintes falharão.
# Mantenha este terminal aberto durante todo o processo.

# Faça login em cada modelo web uma vez (por exemplo, DeepSeek)
#   https://chat.deepseek.com/

# Executar o wizard de onboarding
# IMPORTANTE: Abra um novo terminal para este passo (não use o mesmo terminal do passo anterior,
# pois o terminal do ./start-chrome-debug.sh precisa permanecer aberto).
./onboard.sh webauth


# Ou use a versão compilada
node openclaw.mjs onboard

# Exemplo de fluxo DeepSeek no wizard:
# ? Provedor de autenticação: DeepSeek (Login pelo Navegador)
#
# ? Modo de Autenticação DeepSeek:
#   > Login Automatizado (Recomendado)   # captura cookies/tokens automaticamente

# Quando você ver que a autenticação foi bem-sucedida, está tudo pronto.
# Para adicionar mais provedores depois, basta executar ./onboard.sh webauth novamente.
```

Siga os prompts (escolha, por exemplo, **DeepSeek (Login pelo Navegador)** e **Login Automatizado (Recomendado)**).  
Para adicionar mais provedores depois, basta executar `./onboard.sh webauth` novamente.

#### Passo 3: Iniciar o gateway

```bash
./server.sh
```

Isso iniciará o gateway HTTP e a interface Web.

---

<a id="uso"></a>

## Uso

### Interface Web

Após `./server.sh`, a interface Web é iniciada automaticamente. Abra-a no seu navegador e converse com qualquer modelo configurado.

#### Trocar de modelos

Use `/model` dentro da caixa de chat:

```bash
# Mudar para Claude Web
/model claude-web

# Mudar para Doubao
/model doubao-web

# Mudar para DeepSeek
/model deepseek-web

# Ou especificar modelos exatos
/model claude-web/claude-sonnet-4-6
/model doubao-web/doubao-seed-2.0
/model deepseek-web/deepseek-chat
```

#### Listar modelos disponíveis

```bash
/models
```

> **Importante:** Apenas os provedores configurados via `./onboard.sh webauth` são escritos no `openclaw.json` e aparecem em `/models`.

A saída mostra:

- Todos os provedores disponíveis (ex.: `claude-web`, `doubao-web`, `deepseek-web`)
- Modelos de cada provedor
- Modelo atualmente ativo
- Aliases e configuração

Exemplo:

```text
Modelo                                     Entrada    Ctx      Auth Local  Tags
doubao-web/doubao-seed-2.0                 texto      63k      não   não   padrão,configurado,alias:Doubao Navegador
claude-web/claude-sonnet-4-6               text+image 195k     não   não   configurado,alias:Claude Web
deepseek-web/deepseek-chat                 texto      64k      não   não   configurado
```

### API HTTP

```bash
curl http://127.0.0.1:3001/v1/chat/completions \
  -H "Authorization: Bearer SEU_TOKEN_DO_GATEWAY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-web/deepseek-chat",
    "messages": [{"role": "user", "content": "Olá!"}]
  }'
```

### CLI / TUI

```bash
node openclaw.mjs tui
```

---

<a id="configuracao"></a>

## Configuração

### Exemplo de `openclaw.json`

```json
{
  "auth": {
    "profiles": {
      "deepseek-web:default": {
        "provider": "deepseek-web",
        "mode": "api_key"
      }
    }
  },
  "models": {
    "providers": {
      "deepseek-web": {
        "baseUrl": "https://chat.deepseek.com",
        "api": "deepseek-web",
        "models": [
          {
            "id": "deepseek-chat",
            "name": "DeepSeek Chat",
            "contextWindow": 64000,
            "maxTokens": 4096
          },
          {
            "id": "deepseek-reasoner",
            "name": "DeepSeek Reasoner",
            "reasoning": true,
            "contextWindow": 64000,
            "maxTokens": 8192
          }
        ]
      }
    }
  },
  "gateway": {
    "port": 3001,
    "auth": {
      "mode": "token",
      "token": "seu-token-do-gateway"
    }
  }
}
```

---

<a id="solucao-de-problemas"></a>

## Solução de Problemas

### Primeiro uso: utilize o wizard de onboarding (recomendado)

```bash
./onboard.sh webauth
```

O wizard criará todos os diretórios e arquivos básicos necessários.

### Corrigir problemas: comando doctor

Se você já executou o projeto, mas vê erros de diretórios ausentes ou similares:

```bash
node dist/index.mjs doctor
```

O comando doctor irá:

- ✅ Verificar todos os diretórios necessários
- ✅ Criar diretórios ausentes
- ✅ Corrigir problemas comuns de permissão
- ✅ Validar a estrutura do arquivo de configuração
- ✅ Detectar múltiplos diretórios de estado conflitantes
- ✅ Exibir sugestões detalhadas

**Limitações:**

- ❌ **Não** cria `openclaw.json`
- ❌ **Não** cria `auth-profiles.json`
- ✅ Se esses arquivos estiverem ausentes/corrompidos, execute novamente `./onboard.sh webauth`

---

<a id="roteiro"></a>

## Roteiro

### Foco atual

- ✅ DeepSeek Web, Qwen intl/cn, Kimi, Claude Web, Doubao, ChatGPT Web, Gemini Web, Grok Web, GLM Web, GLM intl, Manus API — todos testados
- 🔧 Melhorar a robustez da captura de credenciais
- 📝 Melhorias na documentação

### Planejado

- 🔜 Atualização automática de sessões web expiradas

---

<a id="adicionando-novas-plataformas"></a>

## Adicionando Novas Plataformas

Para adicionar um novo provedor web, você normalmente precisará de:

### 1. Módulo de autenticação (`src/providers/{plataforma}-web-auth.ts`)

```ts
export async function loginPlataformaWeb(params: {
  onProgress: (msg: string) => void;
  openUrl: (url: string) => Promise<boolean>;
}): Promise<{ cookie: string; bearer: string; userAgent: string }> {
  // Automatize o login no navegador e capture as credenciais
}
```

### 2. Cliente de API (`src/providers/{plataforma}-web-client.ts`)

```ts
export class PlataformaWebClient {
  constructor(options: { cookie: string; bearer?: string }) {}

  async chatCompletions(params: ChatParams): Promise<ReadableStream> {
    // Chamar a API web da plataforma
  }
}
```

### 3. Manipulador de stream (`src/agents/{plataforma}-web-stream.ts`)

```ts
export function createPlataformaWebStreamFn(credentials: string): StreamFn {
  // Tratar o formato de streaming específico do provedor
}
```

---

<a id="estrutura-de-arquivos"></a>

## Estrutura de Arquivos

```text
openclaw-zero-token/
├── src/
│   ├── providers/
│   │   ├── deepseek-web-auth.ts          # Captura de login DeepSeek
│   │   └── deepseek-web-client.ts        # Cliente de API DeepSeek
│   ├── agents/
│   │   └── deepseek-web-stream.ts        # Tratamento de resposta em streaming
│   ├── commands/
│   │   └── auth-choice.apply.deepseek-web.ts  # Fluxo de autenticação
│   └── browser/
│       └── chrome.ts                     # Automação do Chrome
├── ui/                                   # Interface Web (Lit 3.x)
├── .openclaw-zero-state/                 # Estado local (ignorado pelo git)
│   ├── openclaw.json                     # Configuração
│   └── agents/main/agent/
│       └── auth.json                     # Credenciais (sensíveis)
└── .gitignore                            # Inclui .openclaw-zero-state/
```

---

<a id="seguranca"></a>

## Notas de Segurança

1. **Armazenamento de credenciais**: cookies e bearer tokens ficam no `auth.json` local e **nunca** devem ser commitados.
2. **Tempo de vida da sessão**: sessões web expiram; pode ser necessário refazer o login periodicamente.
3. **Limitação de taxa**: endpoints web podem impor limites de taxa; não são adequados para cargas de trabalho pesadas em produção.
4. **Conformidade**: este projeto é para aprendizado e experimentação pessoal. Sempre siga os Termos de Serviço de cada plataforma.

---

<a id="sincronizar-upstream"></a>

## Sincronizar com o OpenClaw Upstream

Este projeto é baseado no OpenClaw. Para sincronizar mudanças do upstream:

```bash
git remote add upstream https://github.com/openclaw/openclaw.git
git fetch upstream
git merge upstream/main
```

---

<a id="contribuindo"></a>

## Contribuindo

PRs são bem-vindos, especialmente para:

- Correções de bugs
- Melhorias na documentação

---

<a id="licenca"></a>

## Licença

[Licença MIT](LICENSE)

---

<a id="agradecimentos"></a>

## Agradecimentos

- [OpenClaw](https://github.com/openclaw/openclaw) — projeto original
- [DeepSeek](https://deepseek.com) — excelentes modelos de IA

---

<a id="aviso-legal"></a>

## Aviso Legal

Este projeto é apenas para aprendizado e pesquisa.  
Ao usá-lo para acessar qualquer serviço de terceiros, você é responsável por cumprir os Termos de Uso desse serviço.  
Os autores não se responsabilizam por quaisquer problemas causados pelo uso indevido deste projeto.
