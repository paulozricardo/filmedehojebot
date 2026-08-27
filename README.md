# Filme de Hoje 🎬

Bot que posta **um filme por dia** num grupo do Telegram: capa, nota, sinopse e onde assistir (streaming legal no Brasil).

Pega um filme popular na **TMDB** e manda no grupo direto pela **API HTTP do Telegram** (sem Telegraf). Não precisa de servidor 24/7 — só um **agendador**, então roda de graça.

---

## Estrutura

```text
filme-de-hoje/
├── postar-filme.js                     # versão GitHub Actions (roda e encerra)
├── postados.json                       # histórico pra não repetir filme
├── .github/workflows/filme-de-hoje.yml # agendamento do GitHub Actions
├── src/index.js                        # versão Cloudflare Worker (não deployada)
├── .env.example
├── .gitignore
└── README.md
```

São **duas formas de rodar o mesmo bot**. Escolha uma pra deployar de verdade; a outra fica como alternativa.

---

## Variáveis de ambiente

| Nome        | O que é                                                  |
| ----------- | -------------------------------------------------------- |
| `BOT_TOKEN` | Token do bot (via @BotFather)                            |
| `TMDB_KEY`  | API key grátis da TMDB (themoviedb.org → Settings → API) |
| `CHAT_ID`   | ID do grupo (número negativo)                            |

**Pegar o `CHAT_ID`:** adiciona o bot no grupo → manda uma mensagem começando com `/` (ex: `/id@SeuBot`) → abre `https://api.telegram.org/bot<TOKEN>/getUpdates` no navegador → copia o número em `"chat":{"id":-100...}`. (Se vier vazio, no @BotFather usa `/setprivacy` → Disable e repete.)

`.env.example`:

```ini
BOT_TOKEN=
TMDB_KEY=
CHAT_ID=
```

`.gitignore`:

```gitignore
node_modules/
.env
.dev.vars
```

---

## Deploy

### Opção A — GitHub Actions (mais simples)

1. Sobe o projeto num repo (**privado** é ok).
2. Settings → Secrets and variables → Actions → cria `BOT_TOKEN`, `TMDB_KEY`, `CHAT_ID`.
3. Testa: aba **Actions** → Filme de Hoje → **Run workflow**.

Cron: `0 12 * * *` = **12:00 UTC = 9h em Recife**. (O GitHub roda em UTC; desde mar/2026 dá pra usar o campo `timezone:` no schedule se preferir.) O horário pode atrasar alguns minutos.

### Opção B — Cloudflare Workers (horário exato)

**Deploy em uso: Opção A.** O `wrangler.toml` foi removido de propósito — com os dois deploys no ar, o grupo receberia dois filmes por dia. O `src/index.js` fica como alternativa; para usá-lo, recrie o arquivo abaixo na raiz (e aí desative o workflow do Actions):

```toml
name = "filme-de-hoje"
main = "src/index.js"
compatibility_date = "2026-08-27"

[triggers]
crons = ["0 12 * * *"]
```

```bash
npx wrangler login
npx wrangler secret put BOT_TOKEN
npx wrangler secret put TMDB_KEY
npx wrangler secret put CHAT_ID
npx wrangler deploy
```

Testa abrindo a URL `*.workers.dev` que aparece no deploy — cada visita posta na hora. O cron dispara certinho no minuto.

---

## Teste local

O `.env` fica fora do git e serve **só** pra rodar na mão — no Actions os secrets já viram variáveis de ambiente sozinhos. Como não tem `dotenv`, use a flag nativa do Node (20.6+):

```bash
node --env-file=.env postar-filme.js
```

Posta de verdade no grupo do `CHAT_ID` — use um grupo de teste.

Se der `ETIMEDOUT` em `api.telegram.org`, é a sua rede bloqueando a API do Telegram (dá pra confirmar com `curl -sI https://api.telegram.org`; se a TMDB e o GitHub responderem e só o Telegram não, é isso). Nesse caso o teste local não roda — use o **Run workflow** do Actions, que executa nos runners do GitHub. Pelo mesmo motivo, pegue o `CHAT_ID` por um bot dentro do app (@RawDataBot, @getidsbot) em vez do `getUpdates` no navegador.

---

## Decisões tomadas

- **Nome exibido no post:** "Filme de Hoje".
- **Sem Telegraf / sem polling:** é só `fetch` → POST no Telegram. Mais leve e roda em qualquer agendador.
- **Cron em UTC** = 9h Recife (12:00 UTC), sem horário de verão.
- **Repo privado:** 2.000 min/mês grátis (o job usa ~30-60 min/mês) e escapa do auto-desativar de 60 dias, que na doc do GitHub vale só pra repo público.
- **Seleção atual:** filme aleatório entre os ~400 mais populares (`vote_count.gte=300`), descartando o que já foi postado.
- **Zero repetição:** o `postados.json` guarda os filmes já postados e o workflow commita o arquivo de volta a cada run. Quando o pool de ~400 acaba, o histórico recomeça e o ciclo se repete. De quebra, o commit diário mantém o repo ativo e evita o desligamento de workflows agendados após 60 dias em repo público.

---

## Próximos passos

1. ~~**Shipar de verdade**~~ — feito: GitHub Actions, postando em `@filmedehojecanal`.
2. ~~**Zero repetição**~~ — feito no Actions, via `postados.json`. Falta o equivalente no Worker (**KV**), se um dia ele for usado.
3. **Picks melhores** — filtrar por gênero e/ou nota mínima, ou trocar o aleatório por lançamentos (`/movie/now_playing`).
4. **Post mais rico** — trailer (endpoint `/movie/{id}/videos` → YouTube), duração, diretor.
5. **Alerta de falha** — ping num healthchecks.io (grátis) pra saber se um dia não postou.
6. **(Opcional) comandos on-demand** — `/filme`, watchlist etc. Isso vira um bot com **webhook** (mudança de arquitetura); o próprio Cloudflare Worker pode hospedar.
7. **Livro/HQ da semana** — retomar a ideia original com Open Library (livros/HQ) ou Comic Vine (metadados de quadrinhos).
