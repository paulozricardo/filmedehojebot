# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O que é

Bot que posta um filme por dia (sorteado da API do TMDB) em um grupo do Telegram: capa, nota, sinopse e onde assistir no Brasil.

O `README.md` cobre setup, deploy e como obter `CHAT_ID` — consulte-o em vez de duplicar essas instruções. Este arquivo cobre o que não está lá.

Mensagens, comentários e nomes de identificadores estão em português; mantenha esse padrão ao editar.

## Restrições de design (do README, "Decisões tomadas")

Respeite-as ao propor mudanças — não são acidentes:

- **Sem Telegraf, sem polling, sem dependências, sem `package.json`**: apenas `fetch` nativo → POST na API HTTP do Telegram. Adicionar uma lib quebra a premissa de "roda em qualquer agendador de graça". Comandos on-demand (`/filme`) exigiriam webhook, ou seja, mudança de arquitetura — está no roadmap como opcional.
- **Cron em UTC** (`0 12 * * *` = 9h em Recife), sem horário de verão.
- **Nome exibido no post**: "Filme de Hoje".
- Não há build nem testes.

## Duas implantações do mesmo bot

O mesmo fluxo existe duplicado em dois runtimes alternativos. **Qualquer mudança de lógica (filtro de filmes, formato da legenda, provedores) precisa ser aplicada nos dois arquivos** — eles compartilham `escolherFilme`/`ondeAssistir`/`montarLegenda`/`esc` por cópia, não por import:

- `postar-filme.js` — **é o deploy em uso**. Script Node 20+ de execução única, disparado por `.github/workflows/filme-de-hoje.yml` (cron diário + `workflow_dispatch`). Lê config de `process.env`; falha com `process.exit(1)` para marcar o job como vermelho.
- `src/index.js` — Cloudflare Worker, mantido só como alternativa; **não está deployado e não tem `wrangler.toml`** (removido de propósito — os dois deploys no ar postariam dois filmes por dia; o README traz o conteúdo para recriar). Handler `scheduled` para o agendamento e handler `fetch` que posta a cada requisição na URL, para teste. Lê config de `env`. Diferença de comportamento relevante: erros são engolidos silenciosamente e a resposta do Telegram não é verificada (sem `throw`, sem checagem de `ok`).

Não reintroduza um `wrangler.toml` sem que o workflow do Actions seja desativado no mesmo passo.

## Fluxo

1. Sorteia uma página de 1–20 de `discover/movie` (pt-BR, ordenado por popularidade, `vote_count.gte=300`) e um filme aleatório dessa página — ou seja, ~400 filmes no pool, e repetição é possível. Não há histórico de IDs postados (é o item 2 do roadmap).
2. Consulta `movie/{id}/watch/providers` e usa apenas `results.BR.flatrate` (streaming por assinatura no Brasil); falha nessa etapa é ignorada e a legenda sai sem a linha "Assista em".
3. Envia via `sendPhoto` com o poster `w500` quando há `poster_path`, senão `sendMessage`. `parse_mode: "HTML"` — todo texto vindo da TMDB passa pelo helper `esc()`, que escapa `&`, `<` e `>`. Não use `Markdown` aqui: títulos e sinopses com `*`, `_`, `` ` `` ou `[` faziam o Telegram responder `ok: false`. Ao adicionar qualquer campo novo à legenda, passe-o por `esc()`.

O `montarLegenda(m, onde, limite)` respeita os limites do Telegram (1024 na caption do `sendPhoto`, 4096 no texto do `sendMessage`) truncando a sinopse com `…`. Ele faz busca binária sobre a sinopse **crua** e escapa depois — cortar o texto já escapado partiria uma entidade `&amp;` e o Telegram rejeitaria o HTML. Se acrescentar campos fixos à legenda, ponha-os dentro do `monta()` para que entrem na conta do limite.

## Rodar localmente

```bash
BOT_TOKEN=... TMDB_KEY=... CHAT_ID=... node postar-filme.js
```

Isso posta de verdade no grupo configurado — use um `CHAT_ID` de teste.
