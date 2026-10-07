// Natureza 40+ · função de IA
// Recebe pedidos do app (aluno logado), aplica limite diário, usa cache para explicações de questões
// e devolve a resposta da API da Anthropic em streaming de texto puro.
// Segredos necessários (Project Settings → Edge Functions → Secrets): ANTHROPIC_API_KEY
// Opcionais: AI_DAILY_LIMIT (padrão 40), MODEL_EXPLAIN, MODEL_TUTOR, MODEL_COACH
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const MODELS = {
  explain: Deno.env.get("MODEL_EXPLAIN") ?? "claude-sonnet-5-5",
  tutor: Deno.env.get("MODEL_TUTOR") ?? "claude-haiku-4-5-20251001",
  coach: Deno.env.get("MODEL_COACH") ?? "claude-sonnet-5-5",
};
const LIMIT = Number(Deno.env.get("AI_DAILY_LIMIT") ?? "40");

const BASE = `Você é o tutor de Ciências da Natureza da Mentoria Mário Machado e ajuda estudantes que se preparam para o ENEM. Responda sempre em português do Brasil, com rigor científico, de forma didática e direta, no nível do ENEM. Use títulos curtos (###) e listas quando ajudarem. Nunca invente dados que não estejam no material recebido. Se o pedido não tiver relação com estudos para o ENEM, recuse em uma frase e volte ao conteúdo.`;

const METHOD = `Use o método do material: 1) Gatilho (o trecho que indica o conceito); 2) Comando reformulado (a pergunta em uma frase simples); 3) Conceito necessário, explicado do zero em 2–3 frases; 4) Alternativa por alternativa: por que a correta está certa e por que cada errada está errada, dizendo o tipo de distrator entre parênteses — V (verdadeiro que não responde ao comando), A (absoluto), N (conceito vizinho), L (lamarckista/teleológico), M (mito do senso comum) ou C (erro de conta); 5) "O que levar": uma frase para reconhecer o padrão da próxima vez. Se houver conta, mostre o passo a passo com unidades. No máximo 380 palavras.`;

const clip = (s: unknown, n: number) => String(s ?? "").slice(0, n);
const okLetter = (s: unknown) => (typeof s === "string" && /^[A-E]$/.test(s) ? s : "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method" });

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json(503, { error: "not_configured" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const auth = req.headers.get("Authorization") ?? "";
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: u, error: ue } = await userClient.auth.getUser();
  if (ue || !u?.user) return json(401, { error: "auth" });
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: "body" }); }
  const kind = String(body.kind ?? "");
  if (!["explain", "tutor", "coach"].includes(kind)) return json(400, { error: "kind" });

  // ---- build the request
  let system = BASE, messages: unknown[] = [], maxTokens = 900, cacheKey = "";
  if (kind === "explain") {
    const qid = clip(body.qid, 12);
    if (!/^\d\d[RP]_\d{2,3}$/.test(qid)) return json(400, { error: "qid" });
    const mine = okLetter(body.mine);
    cacheKey = `explain:${qid}:${mine || "-"}`;
    const { data: hit } = await admin.from("ai_cache").select("text").eq("key", cacheKey).maybeSingle();
    if (hit?.text) return new Response(hit.text, { headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8", "X-Cache": "hit" } });
    const content: unknown[] = [];
    const img = typeof body.image === "string" ? body.image : "";
    if (img && img.length < 2_000_000) content.push({ type: "image", source: { type: "base64", media_type: "image/webp", data: img } });
    content.push({ type: "text", text:
      `Explique esta questão para um estudante. ${METHOD}\n${img ? "A imagem anexada é a questão original e é a referência principal; o texto abaixo foi extraído automaticamente e pode ter falhas.\n" : ""}\n` +
      `Questão: ${clip(body.label, 80)}\nPadrão do material: ${clip(body.pattern, 200)}. Tipo de cobrança: ${clip(body.cob, 30)}.\n` +
      `Gabarito oficial: ${okLetter(body.gab) || "—"}.` +
      (mine ? ` O estudante marcou ${mine}${mine === body.gab ? " (acertou)." : " (errou) — explique por que essa alternativa atrai e por que está errada."}` : "") +
      (body.comment ? `\nComentário do material sobre esta questão: ${clip(body.comment, 1500)}` : "") +
      `\n\nTexto da questão:\n${clip(body.text, 5000)}` });
    messages = [{ role: "user", content }];
    maxTokens = 1100;
  } else if (kind === "tutor") {
    system = `${BASE}\nO estudante está lendo o capítulo "${clip(body.title, 160)}" da plataforma. Responda em até 180 palavras, salvo se ele pedir mais. Quando fizer sentido, ligue a resposta ao padrão de questão e às pegadinhas (distratores V, A, N, L, M, C). Se ele pedir perguntas de revisão, faça uma de cada vez e espere a resposta antes de corrigir.\n\nTrecho do capítulo (referência):\n${clip(body.excerpt, 9000)}`;
    const turns = Array.isArray(body.messages) ? body.messages.slice(-10) : [];
    messages = turns
      .filter((t: any) => t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string" && t.content.trim())
      .map((t: any) => ({ role: t.role, content: clip(t.content, 2000) }));
    if (!messages.length || (messages[messages.length - 1] as any).role !== "user") return json(400, { error: "messages" });
    while (messages.length && (messages[0] as any).role !== "user") messages.shift();
    maxTokens = 700;
  } else {
    const mode = body.mode === "sim" ? "sim" : "geral";
    const task = mode === "sim"
      ? `Analise o simulado do estudante. Escreva no máximo 220 palavras:\n### O que o resultado mostra — padrões e tipos de cobrança que concentram os erros (cite números).\n### Antes do próximo simulado — 3 ações concretas e curtas na plataforma.\n### Tempo de prova — 1 frase, só se o tempo indicar problema.`
      : `Escreva, falando direto com o estudante, no máximo 220 palavras:\n### Diagnóstico — 2 frases sobre onde ele está e onde estão os pontos mais baratos (cruze acerto baixo com padrões que caem muito).\n### Próximos 7 dias — 3 ações concretas, cada uma citando o padrão e o que fazer na plataforma (capítulo, resumo teórico, treino, banco filtrado, simulado).\n### Atenção — 1 alerta (ritmo, prazo, dúvidas, tempo de prova), só se os dados mostrarem.`;
    messages = [{ role: "user", content: `${task}\nUse apenas os dados abaixo; não invente números.\n\n${clip(body.stats, 12000)}` }];
    maxTokens = 800;
  }

  // ---- daily limit (cache hits above don't count)
  const { data: used, error: be } = await admin.rpc("ai_bump", { p_user: u.user.id, p_limit: LIMIT });
  if (be) return json(500, { error: "usage" });
  if ((used as number) > LIMIT) return json(429, { error: "limit", limit: LIMIT });

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODELS[kind as keyof typeof MODELS], max_tokens: maxTokens, system, messages, stream: true }),
  });
  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    console.error("anthropic", upstream.status, detail.slice(0, 500));
    return json(502, { error: "upstream", status: upstream.status });
  }

  // ---- SSE (Anthropic) -> plain text stream (app)
  const enc = new TextEncoder(), dec = new TextDecoder();
  let full = "";
  const stream = new ReadableStream({
    async start(ctl) {
      const reader = upstream.body!.getReader();
      let buf = "";
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf("\n\n")) >= 0) {
            const evt = buf.slice(0, i); buf = buf.slice(i + 2);
            const line = evt.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue;
            try {
              const d = JSON.parse(line.slice(5).trim());
              if (d.type === "content_block_delta" && d.delta?.type === "text_delta") {
                full += d.delta.text; ctl.enqueue(enc.encode(d.delta.text));
              }
            } catch { /* ignore keep-alives */ }
          }
        }
        if (cacheKey && full.length > 200) await admin.from("ai_cache").upsert({ key: cacheKey, text: full, model: MODELS.explain });
      } catch (e) {
        console.error("stream", e);
      } finally {
        ctl.close();
      }
    },
  });
  return new Response(stream, { headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
});
