// Cloudflare Worker — versão alternativa do postar-filme.js (mantenha os dois em sincronia)
export default {
  // Dispara no horário do cron
  async scheduled(event, env, ctx) {
    ctx.waitUntil(postarFilme(env));
  },
  // Abrir a URL do worker no navegador posta na hora (pra testar)
  async fetch(request, env) {
    await postarFilme(env);
    return new Response('🎬 Filme postado no grupo!');
  },
};

async function escolherFilme(env) {
  const page = 1 + Math.floor(Math.random() * 20);
  const url = `https://api.themoviedb.org/3/discover/movie?api_key=${env.TMDB_KEY}&language=pt-BR&sort_by=popularity.desc&vote_count.gte=300&page=${page}`;
  const data = await (await fetch(url)).json();
  const results = data.results || [];
  return results[Math.floor(Math.random() * results.length)];
}

async function ondeAssistir(env, id) {
  try {
    const data = await (await fetch(`https://api.themoviedb.org/3/movie/${id}/watch/providers?api_key=${env.TMDB_KEY}`)).json();
    const br = data.results?.BR?.flatrate || [];
    return br.map((p) => p.provider_name).join(', ');
  } catch {
    return '';
  }
}

async function postarFilme(env) {
  const m = await escolherFilme(env);
  if (!m) return;
  const poster = m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null;
  const onde = await ondeAssistir(env, m.id);
  const legenda =
    `🎬 *Filme de Hoje*\n\n` +
    `*${m.title}* (${(m.release_date || '----').slice(0, 4)})\n` +
    `⭐ ${m.vote_average?.toFixed(1) ?? '—'}/10\n\n` +
    `${m.overview || 'Sem sinopse.'}` +
    (onde ? `\n\n📺 Assista em: ${onde}` : '');

  const metodo = poster ? 'sendPhoto' : 'sendMessage';
  const corpo = poster
    ? { chat_id: env.CHAT_ID, photo: poster, caption: legenda, parse_mode: 'Markdown' }
    : { chat_id: env.CHAT_ID, text: legenda, parse_mode: 'Markdown' };

  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${metodo}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
}
