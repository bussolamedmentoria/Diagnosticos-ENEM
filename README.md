# Natureza 40+ · Diagnósticos ENEM

Plataforma da Mentoria Mário Machado para Ciências da Natureza no ENEM: diagnóstico de 40 questões que monta a trilha de estudo, os 20 padrões, resumos teóricos, banco com 720 questões reais (2018–2025), simulados e tutor de IA.

## Estrutura

```
web/                 site estático publicado na Vercel (Root Directory = web)
  index.html         casca do app
  js/boot.js         login, cadastro, perfil e carregamento
  js/app.js          o app (diagnóstico, trilha, padrões, teoria, banco, simulados, desempenho)
  js/config.js       URL do Supabase e chave publicável
  js/supabase.js     cliente Supabase (UMD, versão fixada)
  data/              conteúdo: meta.json, capítulos (p_*.html), teoria (t_*.html), guia (g_*.html),
                     textos das questões (texts.json) e imagens em pacotes (img_*.json)
  termos.html        termos de uso e política de privacidade
supabase/
  migrations/        esquema do banco (perfis, progresso, respostas, uso e cache da IA) com RLS
  functions/ai/      Edge Function que chama a API do Gemini
```

## Banco (Supabase)

- `profiles`: cadastro do aluno (nome, WhatsApp, cidade, UF, escolaridade, curso, consentimentos, origem).
- `progress`: estado completo da trilha por aluno (`state` em JSON) + resumo (`trilha`, `diag_score`, `pct`).
- `answers`: cada resposta (diagnóstico, banco, treino, simulado), para estatísticas.
- `ai_usage` / `ai_cache`: limite diário de IA por aluno e cache das explicações de questões.
- `admin.leads`: visão com todos os cadastros + e-mail + progresso (só no painel do Supabase, fora da API).

Para ver os leads: Supabase → SQL Editor → `select * from admin.leads order by cadastro_em desc;`

## IA

A Edge Function `ai` usa o Gemini (`gemini-3.8-flash`). A chave fica no Vault do Supabase (segredo `gemini_api_key`);
se existir o segredo `GEMINI_API_KEY` em Edge Functions → Secrets, ele tem prioridade.
Opcionais: `AI_DAILY_LIMIT` (padrão 20 pedidos/dia por aluno) e `GEMINI_MODEL`.
Explicações de questões ficam em cache e são reaproveitadas entre alunos (não contam no limite).
O tutor envia só o trecho do capítulo ligado à pergunta e as últimas 6 mensagens, para reduzir custo.

## Origem do cadastro

Links com `?origem=instagram` (ou `?utm_source=...`) gravam a origem no perfil do aluno.
