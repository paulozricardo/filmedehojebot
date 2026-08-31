# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O que é

Bot que posta um filme por dia (sorteado da API do TMDB) em um grupo do Telegram: capa, nota, sinopse e onde assistir no Brasil.

O `README.md` cobre setup, deploy e como obter `CHAT_ID` — consulte-o em vez de duplicar essas instruções. Este arquivo cobre o que não está lá.

Mensagens, comentários e nomes de identificadores estão em português; mantenha esse padrão ao editar.

## Restrições de design (do README, "Decisões tomadas")

Respeite-as ao propor mudanças — não são acidentes:

- **Sem Telegraf, sem polling, sem dependências, sem `package.json`**: apenas `fetch` nativo → POST na API HTTP do Telegram. Adicionar uma lib quebra a premissa de "roda em qualquer agendador de graça". Comandos on-demand (`/filme`) exigiriam webhook, ou seja, mudança de arquitetura — está no roadmap como opcional.
- **Cron em UTC** (`9 12 * * *` = 09h09 em Recife), sem horário de verão. O minuto quebrado é proposital: agendamentos em minutos redondos (`:00`, `:30`) caem no pico de fila do GitHub e atrasam mais. O agendado é só o pedido: em conta free os runs saem da fila com **3h+ de atraso** (medido em 28–30/08/2026: 9h02, 3h15, 3h33), então o post chega perto do meio-dia em Recife. Foi por isso que o horário saiu de 14:37 UTC para 12:09 UTC em 31/08/2026 — antecipar a janela, já que o atraso em si não é controlável daqui.
- **Nome exibido no post**: "Filme de Hoje".
- Não há build nem testes.

## Duas implantações do mesmo bot

O mesmo fluxo existe duplicado em dois runtimes alternativos. **Qualquer mudança de lógica (filtro de filmes, formato da legenda, provedores) precisa ser aplicada nos dois arquivos** — eles compartilham `escolherFilme`/`ondeAssistir`/`montarLegenda`/`esc` por cópia, não por import:

- `postar-filme.js` — **é o deploy em uso, no ar desde 27/08/2026**, postando no canal `@filmedehojecanal`. Script Node 20+ de execução única, disparado por `.github/workflows/filme-de-hoje.yml` (cron diário + `workflow_dispatch`). Lê config de `process.env`; falha com `process.exit(1)` para marcar o job como vermelho. Os secrets são três, com os nomes exatos `BOT_TOKEN`/`TMDB_KEY`/`CHAT_ID` — um nome fora do esperado faz o GitHub interpolar string vazia sem erro, e a falha aparece só como um 401 da TMDB.
- `src/index.js` — Cloudflare Worker, mantido só como alternativa; **não está deployado e não tem `wrangler.toml`** (removido de propósito — os dois deploys no ar postariam dois filmes por dia; o README traz o conteúdo para recriar). Handler `scheduled` para o agendamento e handler `fetch` que posta a cada requisição na URL, para teste. Lê config de `env`. Diferença de comportamento relevante: erros são engolidos silenciosamente e a resposta do Telegram não é verificada (sem `throw`, sem checagem de `ok`).

Não reintroduza um `wrangler.toml` sem que o workflow do Actions seja desativado no mesmo passo.

Uma divergência é intencional: o **histórico anti-repetição existe só no `postar-filme.js`**, porque depende de escrever em arquivo. O Worker precisaria de um KV binding; como não está deployado, ficou sem.

## Histórico anti-repetição

`postados.json` na raiz guarda `{id, titulo, em}` de cada filme postado, e é **commitado de volta pelo próprio workflow** (passo "Salva o histórico", que exige `permissions: contents: write`). O `escolherFilme` sorteia até 10 páginas procurando um id inédito; se todas vierem repetidas, considera o pool esgotado, recomeça o histórico do zero e segue postando em vez de falhar.

Duas invariantes que os testes cobrem e que é fácil quebrar ao mexer aqui:

- **O histórico só é gravado depois do `ok` do Telegram.** Gravar antes queimaria o filme num run que falhou no envio.
- **Um `postados.json` ausente ou corrompido não pode derrubar o post do dia** — `lerHistorico` cai para lista vazia.

Efeito colateral útil: o commit diário mantém o repositório ativo, o que evita o desligamento automático de workflows agendados após 60 dias em repositório público.

## Fluxo

1. Sorteia uma página de 1–20 de `discover/movie` (pt-BR, ordenado por popularidade, `vote_count.gte=300`) e um filme aleatório dessa página — ou seja, ~400 filmes no pool, e repetição é possível. Não há histórico de IDs postados (é o item 2 do roadmap).
2. Consulta `movie/{id}/watch/providers` e usa apenas `results.BR.flatrate` (streaming por assinatura no Brasil); falha nessa etapa é ignorada e a legenda sai sem a linha "Assista em".
3. Envia via `sendPhoto` com o poster `w500` quando há `poster_path`, senão `sendMessage`. `parse_mode: "HTML"` — todo texto vindo da TMDB passa pelo helper `esc()`, que escapa `&`, `<` e `>`. Não use `Markdown` aqui: títulos e sinopses com `*`, `_`, `` ` `` ou `[` faziam o Telegram responder `ok: false`. Ao adicionar qualquer campo novo à legenda, passe-o por `esc()`.

O `montarLegenda(m, onde, limite)` respeita os limites do Telegram (1024 na caption do `sendPhoto`, 4096 no texto do `sendMessage`) truncando a sinopse com `…`. Ele faz busca binária sobre a sinopse **crua** e escapa depois — cortar o texto já escapado partiria uma entidade `&amp;` e o Telegram rejeitaria o HTML. Se acrescentar campos fixos à legenda, ponha-os dentro do `monta()` para que entrem na conta do limite.

## Rodar localmente

Existe um `.env` local (fora do git). Ele **não** é lido sozinho — não há `dotenv`, então use a flag nativa do Node:

```bash
node --env-file=.env postar-filme.js
```

Isso posta de verdade no grupo configurado — use um `CHAT_ID` de teste.

**A rede da máquina de desenvolvimento não alcança o `api.telegram.org`** (verificado em 27/08/2026: TMDB e GitHub respondem, o Telegram dá `ETIMEDOUT`; o bloqueio é do provedor, não do sandbox). Consequências ao trabalhar aqui:

- Qualquer teste que chame o Telegram falha na conexão, antes de exercitar o código. Não interprete isso como bug.
- Para exercitar `montarLegenda`/`esc` sem rede, stube o `globalThis.fetch` e importe o `postar-filme.js` — foi assim que o truncamento e o escape foram validados.
- A validação de ponta a ponta é o **Run workflow** no GitHub Actions, que roda fora dessa rede.

## Por que o repositório é público

Público desde 28/08/2026, e isso **não é descuido** — foi a correção para o cron nunca disparar. Nos dois primeiros dias do bot, nenhum run com `event=schedule` chegou a ser criado (os horários de 12:00 e 14:37 UTC passaram em branco), enquanto `workflow_dispatch` manual funcionava sempre. Não era fila, não era cota (US$ 0,04 no mês) e não era incidente do GitHub: é o padrão conhecido de agendamentos despriorizados em **repositório privado novo de conta free**.

Não volte o repositório para privado sem antes ter outra forma de disparo (um agendador externo chamando `workflow_dispatch` pela API). Se voltar, o post diário para de sair sem nenhum erro visível — não existe job vermelho quando o run sequer é criado; o sintoma é só o silêncio no canal.

Nenhum segredo mora no repositório: `BOT_TOKEN`/`TMDB_KEY`/`CHAT_ID` são secrets do Actions, `.env` nunca foi rastreado e o `.env.example` só tem os nomes das variáveis. O histórico completo foi varrido antes da abertura.
