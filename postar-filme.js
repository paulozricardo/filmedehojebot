// GitHub Actions — roda, posta o filme do dia e encerra. Zero dependências (Node 20+).
const fs = require("fs");

const BOT_TOKEN = process.env.BOT_TOKEN;
const TMDB_KEY = process.env.TMDB_KEY;
const CHAT_ID = process.env.CHAT_ID;

// Histórico do que já foi postado, pra não repetir filme. Fica versionado no
// repo: o workflow commita o arquivo depois de cada post bem-sucedido.
// Caminho relativo ao cwd, que no Actions é a raiz do repositório.
const ARQUIVO_HISTORICO = "postados.json";
// Páginas sorteadas até desistir de achar um filme inédito.
const MAX_TENTATIVAS = 10;

function lerHistorico() {
  try {
    const lista = JSON.parse(fs.readFileSync(ARQUIVO_HISTORICO, "utf8"));
    return Array.isArray(lista) ? lista : [];
  } catch {
    // Arquivo ausente ou corrompido não pode impedir o post do dia.
    return [];
  }
}

function salvarHistorico(lista) {
  fs.writeFileSync(ARQUIVO_HISTORICO, JSON.stringify(lista, null, 2) + "\n");
}

// O Markdown do Telegram quebra o post quando o título ou a sinopse tem * _ ` ou [.
// Em HTML basta escapar estes três caracteres.
const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const sortear = (lista) => lista[Math.floor(Math.random() * lista.length)];

async function buscarPagina(page) {
  const url = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}&language=pt-BR&sort_by=popularity.desc&vote_count.gte=300&page=${page}`;
  const res = await fetch(url);
  // Sem esta checagem, uma chave inválida (401) viraria "nenhum filme
  // encontrado" e esconderia a causa. A URL nunca entra na mensagem: ela
  // carrega a api_key.
  if (!res.ok) {
    const erro = await res.json().catch(() => ({}));
    throw new Error(
      `TMDB respondeu ${res.status}: ${erro.status_message ?? "sem detalhe"}` +
        (res.status === 401 ? " (confira o secret TMDB_KEY: é a chave v3, 32 caracteres, não o token eyJ...)" : ""),
    );
  }
  const data = await res.json();
  return data.results || [];
}

// Sorteia páginas até cair um filme que ainda não foi postado. `reiniciar`
// avisa que o pool acabou e o histórico deve recomeçar do zero.
async function escolherFilme(vistos) {
  let ultimaPagina = [];
  for (let i = 0; i < MAX_TENTATIVAS; i++) {
    const page = 1 + Math.floor(Math.random() * 20);
    ultimaPagina = await buscarPagina(page);
    const ineditos = ultimaPagina.filter((f) => !vistos.has(f.id));
    if (ineditos.length) return { filme: sortear(ineditos), reiniciar: false };
  }
  // Todo o pool já foi postado. Melhor recomeçar o ciclo do que parar de postar.
  if (!ultimaPagina.length) {
    throw new Error(`TMDB devolveu 0 filmes em ${MAX_TENTATIVAS} páginas`);
  }
  return { filme: sortear(ultimaPagina), reiniciar: true };
}

async function ondeAssistir(id) {
  try {
    const data = await (
      await fetch(
        `https://api.themoviedb.org/3/movie/${id}/watch/providers?api_key=${TMDB_KEY}`,
      )
    ).json();
    const br = data.results?.BR?.flatrate || [];
    return br.map((p) => p.provider_name).join(", ");
  } catch {
    return "";
  }
}

// Limites do Telegram: caption do sendPhoto é bem menor que o texto do sendMessage.
const LIMITE_CAPTION = 1024;
const LIMITE_TEXTO = 4096;

function montarLegenda(m, onde, limite) {
  const monta = (sinopse) =>
    `🎬 <b>Filme de Hoje</b>\n\n` +
    `<b>${esc(m.title)}</b> (${(m.release_date || "----").slice(0, 4)})\n` +
    `⭐ ${m.vote_average?.toFixed(1) ?? "—"}/10\n\n` +
    `${esc(sinopse) || "Sem sinopse."}` +
    (onde ? `\n\n📺 Assista em: ${esc(onde)}` : "");

  const completa = monta(m.overview);
  if (completa.length <= limite) return completa;

  // Corta a sinopse crua, nunca o texto já escapado — cortar depois do esc()
  // partiria uma entidade (&amp;) no meio e o Telegram rejeitaria o HTML.
  // Busca binária pelo maior prefixo que cabe: como o esc() expande de forma
  // imprevisível (um "&" vira 5 caracteres), descontar o excesso direto do
  // texto cru jogaria fora muito mais sinopse do que o necessário.
  const bruto = m.overview || "";
  let lo = 0;
  let hi = bruto.length;
  while (lo < hi) {
    const meio = Math.ceil((lo + hi) / 2);
    if (monta(bruto.slice(0, meio).trimEnd() + "…").length <= limite) lo = meio;
    else hi = meio - 1;
  }
  return monta(bruto.slice(0, lo).trimEnd() + "…");
}

async function enviar() {
  const historico = lerHistorico();
  const { filme: m, reiniciar } = await escolherFilme(
    new Set(historico.map((h) => h.id)),
  );
  if (reiniciar) {
    console.log(`Pool esgotado após ${historico.length} filmes — recomeçando o histórico.`);
  }
  const poster = m.poster_path
    ? `https://image.tmdb.org/t/p/w500${m.poster_path}`
    : null;
  const onde = await ondeAssistir(m.id);
  const legenda = montarLegenda(
    m,
    onde,
    poster ? LIMITE_CAPTION : LIMITE_TEXTO,
  );

  const metodo = poster ? "sendPhoto" : "sendMessage";
  const corpo = poster
    ? {
        chat_id: CHAT_ID,
        photo: poster,
        caption: legenda,
        parse_mode: "HTML",
      }
    : { chat_id: CHAT_ID, text: legenda, parse_mode: "HTML" };

  const data = await (
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${metodo}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    })
  ).json();

  if (!data.ok) throw new Error("Telegram: " + JSON.stringify(data));

  // Só grava depois do post confirmado: se o Telegram falhar, o filme continua
  // disponível para o próximo run em vez de ser queimado à toa.
  const registro = {
    id: m.id,
    titulo: m.title,
    em: new Date().toISOString().slice(0, 10),
  };
  salvarHistorico(reiniciar ? [registro] : [...historico, registro]);

  console.log("Postado:", m.title);
}

enviar().catch((e) => {
  console.error(e);
  process.exit(1);
});
