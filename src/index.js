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

// O Markdown do Telegram quebra o post quando o título ou a sinopse tem * _ ` ou [.
// Em HTML basta escapar estes três caracteres.
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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

// Limites do Telegram: caption do sendPhoto é bem menor que o texto do sendMessage.
const LIMITE_CAPTION = 1024;
const LIMITE_TEXTO = 4096;

function montarLegenda(m, onde, limite) {
  const monta = (sinopse) =>
    `🎬 <b>Filme de Hoje</b>\n\n` +
    `<b>${esc(m.title)}</b> (${(m.release_date || '----').slice(0, 4)})\n` +
    `⭐ ${m.vote_average?.toFixed(1) ?? '—'}/10\n\n` +
    `${esc(sinopse) || 'Sem sinopse.'}` +
    (onde ? `\n\n📺 Assista em: ${esc(onde)}` : '');

  const completa = monta(m.overview);
  if (completa.length <= limite) return completa;

  // Corta a sinopse crua, nunca o texto já escapado — cortar depois do esc()
  // partiria uma entidade (&amp;) no meio e o Telegram rejeitaria o HTML.
  // Busca binária pelo maior prefixo que cabe: como o esc() expande de forma
  // imprevisível (um "&" vira 5 caracteres), descontar o excesso direto do
  // texto cru jogaria fora muito mais sinopse do que o necessário.
  const bruto = m.overview || '';
  let lo = 0;
  let hi = bruto.length;
  while (lo < hi) {
    const meio = Math.ceil((lo + hi) / 2);
    if (monta(bruto.slice(0, meio).trimEnd() + '…').length <= limite) lo = meio;
    else hi = meio - 1;
  }
  return monta(bruto.slice(0, lo).trimEnd() + '…');
}

async function postarFilme(env) {
  const m = await escolherFilme(env);
  if (!m) return;
  const poster = m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null;
  const onde = await ondeAssistir(env, m.id);
  const legenda = montarLegenda(m, onde, poster ? LIMITE_CAPTION : LIMITE_TEXTO);

  const metodo = poster ? 'sendPhoto' : 'sendMessage';
  const corpo = poster
    ? { chat_id: env.CHAT_ID, photo: poster, caption: legenda, parse_mode: 'HTML' }
    : { chat_id: env.CHAT_ID, text: legenda, parse_mode: 'HTML' };

  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${metodo}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
}
