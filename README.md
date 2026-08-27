# Filme de Hoje 🎬

Bot que posta **um filme por dia** num grupo do Telegram: capa, nota, sinopse e onde assistir (streaming legal no Brasil).

Pega um filme popular na **TMDB** e manda no grupo direto pela **API HTTP do Telegram** (sem Telegraf). Não precisa de servidor 24/7 — só um **agendador**, então roda de graça.

---

## Estrutura

```
filme-de-hoje/
├── postar-filme.js                     # versão GitHub Actions (roda e encerra)
├── .github/workflows/filme-de-hoje.yml # agendamento do GitHub Actions
├── src/index.js                        # versão Cloudflare Worker
├── wrangler.toml                       # config do Cloudflare
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

```
BOT_TOKEN=
TMDB_KEY=
CHAT_ID=
```

`.gitignore`:

```
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

O código do Worker é o `src/index.js`; o `wrangler.toml` já traz o cron e aponta pra ele.

```bash
npx wrangler login
npx wrangler secret put BOT_TOKEN
npx wrangler secret put TMDB_KEY
npx wrangler secret put CHAT_ID
npx wrangler deploy
```

Testa abrindo a URL `*.workers.dev` que aparece no deploy — cada visita posta na hora. O cron dispara certinho no minuto.

---

## Decisões tomadas

- **Nome exibido no post:** "Filme de Hoje".
- **Sem Telegraf / sem polling:** é só `fetch` → POST no Telegram. Mais leve e roda em qualquer agendador.
- **Cron em UTC** = 9h Recife (12:00 UTC), sem horário de verão.
- **Repo privado:** 2.000 min/mês grátis (o job usa ~30-60 min/mês) e escapa do auto-desativar de 60 dias, que na doc do GitHub vale só pra repo público.
- **Seleção atual:** filme aleatório entre os ~400 mais populares (`vote_count.gte=300`), então repetir é raro — mas não impossível.

---

## Próximos passos

1. **Shipar de verdade** — escolher um dos dois deploys e deixar rodando.
2. **Zero repetição** — guardar histórico dos IDs já postados: **KV** no Cloudflare (grátis) ou um JSON commitado no repo (GitHub Actions).
3. **Picks melhores** — filtrar por gênero e/ou nota mínima, ou trocar o aleatório por lançamentos (`/movie/now_playing`).
4. **Post mais rico** — trailer (endpoint `/movie/{id}/videos` → YouTube), duração, diretor.
5. **Alerta de falha** — ping num healthchecks.io (grátis) pra saber se um dia não postou.
6. **(Opcional) comandos on-demand** — `/filme`, watchlist etc. Isso vira um bot com **webhook** (mudança de arquitetura); o próprio Cloudflare Worker pode hospedar.
7. **Livro/HQ da semana** — retomar a ideia original com Open Library (livros/HQ) ou Comic Vine (metadados de quadrinhos).
