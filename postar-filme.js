// GitHub Actions — roda, posta o filme do dia e encerra. Zero dependências (Node 20+).
const BOT_TOKEN = process.env.BOT_TOKEN;
const TMDB_KEY = process.env.TMDB_KEY;
const CHAT_ID = process.env.CHAT_ID;

// O Markdown do Telegram quebra o post quando o título ou a sinopse tem * _ ` ou [.
// Em HTML basta escapar estes três caracteres.
const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

async function escolherFilme() {
  const page = 1 + Math.floor(Math.random() * 20);
  const url = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}&language=pt-BR&sort_by=popularity.desc&vote_count.gte=300&page=${page}`;
  const data = await (await fetch(url)).json();
  const results = data.results || [];
  return results[Math.floor(Math.random() * results.length)];
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
  const m = await escolherFilme();
  if (!m) throw new Error("Nenhum filme encontrado");
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
  console.log("Postado:", m.title);
}

enviar().catch((e) => {
  console.error(e);
  process.exit(1);
});
