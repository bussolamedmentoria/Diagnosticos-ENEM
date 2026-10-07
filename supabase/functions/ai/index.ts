// Natureza 40+ · função de IA (Gemini)
// Recebe pedidos do app (aluno logado), aplica limite diário, usa cache para explicações de questões
// e devolve a resposta do Gemini em streaming de texto puro.
// Chave: segredo GEMINI_API_KEY (Edge Functions → Secrets) ou, se ausente, o segredo "gemini_api_key" do Vault.
// Opcionais: AI_DAILY_LIMIT (padrão 20), GEMINI_MODEL (padrão gemini-3.8-flash)
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.8-flash";
const LIMIT = Number(Deno.env.get("AI_DAILY_LIMIT") ?? "20");

const BASE = `Você é o tutor de Ciências da Natureza da Mentoria Mário Machado e ajuda estudantes que se preparam para o ENEM. Responda sempre em português do Brasil, com rigor científico, de forma didática e direta, no nível do ENEM. Use títulos curtos (###) e listas quando ajudarem. Nunca invente dados que não estejam no material recebido. Se o pedido não tiver relação com estudos para o ENEM, recuse em uma frase e volte ao conteúdo.`;

const METHOD = `Use o método do material: 1) Gatilho (o trecho que indica o conceito); 2) Comando reformulado (a pergunta em uma frase simples); 3) Conceito necessário, explicado do zero em 2–3 frases; 4) Alternativa por alternativa: por que a correta está certa e por que cada errada está errada, dizendo o tipo de distrator entre parênteses — V (verdadeiro que não responde ao comando), A (absoluto), N (conceito vizinho), L (lamarckista/teleológico), M (mito do senso comum) ou C (erro de conta); 5) "O que levar": uma frase para reconhecer o padrão da próxima vez. Se houver conta, mostre o passo a passo com unidades. No máximo 380 palavras.`;

const clip = (s: unknown, n: number) => String(s ?? "").slice(0, n);
const okLetter = (s: unknown) => (typeof s === "string" && /^[A-E]$/.test(s) ? s : "");

let KEY_CACHE = "";
async function apiKey(admin: ReturnType<typeof createClient>) {
  const env = Deno.env.get("GEMINI_API_KEY");
  if (env) return env;
  if (KEY_CACHE) return KEY_CACHE;
  const { data } = await admin.rpc("get_secret", { p_name: "gemini_api_key" });
  KEY_CACHE = typeof data === "string" ? data : "";
  return KEY_CACHE;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const auth = req.headers.get("Authorization") ?? "";
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: u, error: ue } = await userClient.auth.getUser();
  if (ue || !u?.user) return json(401, { error: "auth" });
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const key = await apiKey(admin);
  if (!key) return json(503, { error: "not_configured" });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: "body" }); }
  const kind = String(body.kind ?? "");
  if (!["explain", "tutor", "coach"].includes(kind)) return json(400, { error: "kind" });

  // ---- build the request (Gemini format)
  let system = BASE, contents: unknown[] = [], maxTokens = 1500, cacheKey = "";
  if (kind === "explain") {
    const qid = clip(body.qid, 12);
    if (!/^\d\d[RP]_\d{2,3}$/.test(qid)) return json(400, { error: "qid" });
    const mine = okLetter(body.mine);
    cacheKey = `explain:${qid}:${mine || "-"}`;
    const { data: hit } = await admin.from("ai_cache").select("text").eq("key", cacheKey).maybeSingle();
    if (hit?.text) return new Response(hit.text, { headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8", "X-Cache": "hit" } });
    const parts: unknown[] = [];
    const img = typeof body.image === "string" ? body.image : "";
    if (img && img.length < 2_000_000) parts.push({ inline_data: { mime_type: "image/webp", data: img } });
    parts.push({ text:
      `Explique esta questão para um estudante. ${METHOD}\n${img ? "A imagem anexada é a questão original e é a referência principal; o texto abaixo foi extraído automaticamente e pode ter falhas.\n" : ""}\n` +
      `Questão: ${clip(body.label, 80)}\nPadrão do material: ${clip(body.pattern, 200)}. Tipo de cobrança: ${clip(body.cob, 30)}.\n` +
      `Gabarito oficial: ${okLetter(body.gab) || "—"}.` +
      (mine ? ` O estudante marcou ${mine}${mine === body.gab ? " (acertou)." : " (errou) — explique por que essa alternativa atrai e por que está errada."}` : "") +
      (body.comment ? `\nComentário do material sobre esta questão: ${clip(body.comment, 1500)}` : "") +
      `\n\nTexto da questão:\n${clip(body.text, 5000)}` });
    contents = [{ role: "user", parts }];
    maxTokens = 2000;
  } else if (kind === "tutor") {
    // Tutor econômico: só o trecho do capítulo ligado à pergunta, histórico curto, resposta curta
    system = `${BASE}\nO estudante está lendo o capítulo "${clip(body.title, 160)}" da plataforma. Responda em até 150 palavras, salvo se ele pedir mais. Quando fizer sentido, ligue a resposta ao padrão de questão e às pegadinhas (distratores V, A, N, L, M, C). Se ele pedir perguntas de revisão, faça uma de cada vez e espere a resposta antes de corrigir.\n\nTrecho do capítulo (referência):\n${clip(body.excerpt, 4000)}`;
    const turns = Array.isArray(body.messages) ? body.messages.slice(-6) : [];
    contents = turns
      .filter((t: any) => t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string" && t.content.trim())
      .map((t: any) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: clip(t.content, 1200) }] }));
    while (contents.length && (contents[0] as any).role !== "user") contents.shift();
    if (!contents.length || (contents[contents.length - 1] as any).role !== "user") return json(400, { error: "messages" });
    maxTokens = 1000;
  } else {
    const mode = body.mode === "sim" ? "sim" : "geral";
    const task = mode === "sim"
      ? `Analise o simulado do estudante. Escreva no máximo 220 palavras:\n### O que o resultado mostra — padrões e tipos de cobrança que concentram os erros (cite números).\n### Antes do próximo simulado — 3 ações concretas e curtas na plataforma.\n### Tempo de prova — 1 frase, só se o tempo indicar problema.`
      : `Escreva, falando direto com o estudante, no máximo 220 palavras:\n### Diagnóstico — 2 frases sobre onde ele está e onde estão os pontos mais baratos (cruze acerto baixo com padrões que caem muito).\n### Próximos 7 dias — 3 ações concretas, cada uma citando o padrão e o que fazer na plataforma (capítulo, resumo teórico, treino, banco filtrado, simulado).\n### Atenção — 1 alerta (ritmo, prazo, dúvidas, tempo de prova), só se os dados mostrarem.`;
    contents = [{ role: "user", parts: [{ text: `${task}\nUse apenas os dados abaixo; não invente números.\n\n${clip(body.stats, 10000)}` }] }];
    maxTokens = 1500;
  }

  // ---- daily limit (cache hits above don't count)
  const { data: used, error: be } = await admin.rpc("ai_bump", { p_user: u.user.id, p_limit: LIMIT });
  if (be) return json(500, { error: "usage" });
  if ((used as number) > LIMIT) return json(429, { error: "limit", limit: LIMIT });

  const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.4, thinkingConfig: { thinkingLevel: "low" } },
    }),
  });
  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    console.error("gemini", upstream.status, detail.slice(0, 500));
    return json(502, { error: "upstream", status: upstream.status });
  }

  // ---- SSE (Gemini) -> plain text stream (app)
  const enc = new TextEncoder(), dec = new TextDecoder();
  let full = "";
  const stream = new ReadableStream({
    async start(ctl) {
      const reader = upstream.body!.getReader();
      let buf = "";
      const handle = (evt: string) => {
        for (const line of evt.split("\n")) {
          if (!line.startsWith("data:")) continue;
          try {
            const d = JSON.parse(line.slice(5).trim());
            for (const p of d?.candidates?.[0]?.content?.parts ?? []) {
              if (p && typeof p.text === "string" && !p.thought) { full += p.text; ctl.enqueue(enc.encode(p.text)); }
            }
          } catch { /* ignore partial lines */ }
        }
      };
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true }).replace(/\r\n/g, "\n");
          let i;
          while ((i = buf.indexOf("\n\n")) >= 0) { handle(buf.slice(0, i)); buf = buf.slice(i + 2); }
        }
        if (buf.trim()) handle(buf);
        if (cacheKey && full.length > 200) await admin.from("ai_cache").upsert({ key: cacheKey, text: full, model: MODEL });
      } catch (e) {
        console.error("stream", e);
      } finally {
        ctl.close();
      }
    },
  });
  return new Response(stream, { headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
});
