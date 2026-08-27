// GitHub Actions — roda, posta o filme do dia e encerra. Zero dependências (Node 20+).
const BOT_TOKEN = process.env.BOT_TOKEN;
const TMDB_KEY = process.env.TMDB_KEY;
const CHAT_ID = process.env.CHAT_ID;

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

async function enviar() {
  const m = await escolherFilme();
  if (!m) throw new Error("Nenhum filme encontrado");
  const poster = m.poster_path
    ? `https://image.tmdb.org/t/p/w500${m.poster_path}`
    : null;
  const onde = await ondeAssistir(m.id);
  const legenda =
    `🎬 *Filme de Hoje*\n\n` +
    `*${m.title}* (${(m.release_date || "----").slice(0, 4)})\n` +
    `⭐ ${m.vote_average?.toFixed(1) ?? "—"}/10\n\n` +
    `${m.overview || "Sem sinopse."}` +
    (onde ? `\n\n📺 Assista em: ${onde}` : "");

  const metodo = poster ? "sendPhoto" : "sendMessage";
  const corpo = poster
    ? {
        chat_id: CHAT_ID,
        photo: poster,
        caption: legenda,
        parse_mode: "Markdown",
      }
    : { chat_id: CHAT_ID, text: legenda, parse_mode: "Markdown" };

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
