# 🦉 Estudos com a Lumi

App de estudos gamificado para a Amanda. Toda semana ela conta, com as próprias palavras, o que está aprendendo na escola. O **Claude** cria na hora as perguntas de cada dia. Ela faz na tela ou **imprime** a folha, e a corujinha **Lumi**:
- dá dicas (💡);
- explica o conteúdo (**?**);
- corrige tudo, inclusive as respostas livres e a folha de papel por foto.

Os dados ficam salvos num servidor, então funcionam em qualquer aparelho.

```
 Tablet / celular / computador ──▶ Cloudflare Worker (grátis)
                                     ├─ serve o app (pasta public/)
                                     ├─ banco de dados da família (Durable Object + SQLite)
                                     └─ chama a API do Claude ──▶ perguntas, dicas, explicações e correções
```

---

## 1. Como a Amanda usa

1. **📝 Minha semana:** ela escolhe o **ano escolar** (Year 1–9, com o equivalente brasileiro). Depois abre a seção de cada matéria e escreve do jeito dela, ou fala pelo microfone do teclado. Por exemplo, em BSS: *"estamos aprendendo sobre as bacias hidrográficas"*.
   - **Ortografia/Spelling:** 📝 lista de palavras, 🎯 tema (ex.: *silent letters*) ou 🎲 a Lumi escolhe as palavras.
   - **Leitura/Reading/Guided Reading:** ela escolhe o nível do texto (⬇️ mais fácil, 🎯 no nível dela, ⬆️ acima ou 🚀 bem acima). A Lumi **escreve o texto** e as perguntas são sobre ele. O texto abre antes das perguntas e sai impresso no topo da folha.
   - Também pode mandar **foto do worksheet ou da agenda**. O Claude cria as perguntas de sábado a sexta no nível do ano escolhido.
2. **Todo dia** ela abre a tarefa:
   - **na tela:** cartões curtos, tudo visível sem rolar;
   - **🖨️ Imprimir:** uma página A4 por dia, com gabarito opcional para os pais em página separada.
3. **Ajuda em cada pergunta:**
   - **💡** dá uma dica. Com **"Me explica mais"**, o Claude dá uma explicação nova, sem entregar a resposta.
   - **?** abre uma mini-aula sobre o conteúdo da pergunta: conceito + exemplo. Depois de concluir, explica também por que a resposta certa é a certa.
4. **Correção:**
   - **Na tela:** as objetivas são corrigidas na hora, e as **livres são corrigidas pela Lumi** com um comentário.
   - **No papel:** em **📄 Corrigir folha**, ela tira uma foto e o Claude lê a letra dela e corrige tudo (livres inclusive). Ou ela corrige sozinha com o gabarito, marcando ✓/✗.
   - Os pais veem todas as livres com o comentário da Lumi e podem confirmar ou mudar.
5. **Sexta** é o dia de entregar a semana. **⭐ Extras** dão moedas a mais. Ela escolhe a matéria: Math, English, Português, IPC, BSS ou misturado. Math e English estão sempre disponíveis; sem assunto na semana, viram revisão do ano. As moedas compram itens na **🛒 Lojinha**.

## 2. Moedas e lojinha

| Evento | Moedas |
|---|---|
| Semana entregue (todos os dias feitos, até sexta) | **+100** |
| Semana não entregue | **−150** (maior que a recompensa) |
| Exercícios extras | **+2 por acerto** (rodadas de 5, até 3 rodadas pagas por dia) |

Lojinha (**135 itens**, do mais barato ao mais caro em cada categoria):
- 🎩 18 chapéus, 👓 9 óculos e 🎀 9 acessórios.
- 🦋 7 asas e capas, incluindo a mochila a jato.
- 🎨 10 cores da Lumi, incluindo a **Arco-íris** e a **Galáxia**.
- 🐾 15 amiguinhos, do pintinho ao **dragãozinho**.
- ✨ 9 efeitos ao redor da Lumi: corações, notas musicais, neve, arco-íris, **aura dourada**.
- 🖼️ 13 fundos para o app e ⭐ 45 adesivos para o álbum.
- 🎟️ Vales de prêmios reais, editáveis pelos pais.
- Os itens a partir de 1.000 moedas aparecem como **✨ SONHO** (até 3.000).

**🔥 Sequência:** fazer a tarefa no próprio dia, vários dias seguidos, mostra a chama na tela inicial. A cada 5 dias seguidos, ganha **+15 moedas**.

Tudo é ajustável em **🔒 Área dos pais → Ajustes** (PIN padrão **1234** — troquem).

---

## 3. Colocar no ar (uma vez, ~15 minutos)

Vocês precisam de duas contas: **Anthropic** (API do Claude, pré-paga) e **Cloudflare** (hospedagem, grátis).

> A assinatura do claude.ai (Pro/Max) **não** cobre a API. A API tem cobrança própria, por uso, com créditos pré-pagos.

### Passo 1 — Chave da API do Claude
1. Entre em **https://platform.claude.com/** e crie a conta (pode usar o mesmo e-mail).
2. Em **Billing**, adicione créditos. US$ 5–10 duram meses (veja os custos abaixo).
3. Em **API Keys → Create Key**, crie uma chave chamada `amanda-study-app` e **copie** o valor (começa com `sk-ant-`). Ele só aparece uma vez.

### Passo 2 — Cloudflare
1. Crie a conta grátis em **https://dash.cloudflare.com/sign-up**.
2. No painel: **Workers & Pages → Create application** e escolha conectar ao **GitHub**. Autorize e selecione o repositório **amanda-study-app**.
3. Deixe o **nome do projeto exatamente `amanda-study-app`** (precisa bater com o `wrangler.jsonc`) e os comandos padrão. Toque em **Deploy**.
4. Quando terminar, abra o Worker → **Settings → Variables and Secrets → Add** e crie dois **Secrets**:
   - `ANTHROPIC_API_KEY` = a chave do passo 1;
   - `FAMILY_CODE` = uma senha da família (ex.: `coruja-azul-2026`). É o que se digita uma vez em cada aparelho.
5. Salve (**Deploy**). O endereço do app aparece em **Settings → Domains & Routes**, no formato `https://amanda-study-app.<sua-conta>.workers.dev`.

### Passo 3 — Usar
- Abra o endereço no tablet ou celular dela, digite o **código da família** e pronto.
- No iPad/iPhone: **Compartilhar → Adicionar à Tela de Início** para virar um ícone de app.
- A cada `git push` neste repositório, a Cloudflare publica a nova versão sozinha.

### E o link do GitHub Pages?
O link antigo (`carloscurioni.github.io/amanda-study-app`) continua funcionando como **versão sem servidor**: sem Claude, com perguntas do gerador interno e dados só naquele aparelho. Quando a versão da Cloudflare estiver no ar, desligue-o em **Settings → Pages → Source → None**, para não haver duas versões.

---

## 4. Custos estimados

- **Cloudflare:** grátis neste uso (plano Free de Workers e Durable Objects).
- **Claude (API):**

| Uso | Modelo | Custo aproximado |
|---|---|---|
| Criar a semana (texto + fotos) | Claude Sonnet 5.5 | ~US$ 0,10–0,20 por semana |
| Corrigir a folha por foto | Claude Sonnet 5.5 | ~US$ 0,03 por folha |
| Dicas, "?", extras, correção das livres na tela | Claude Haiku 5.5 | frações de centavo cada |

**Total típico: menos de US$ 2 por mês.** Para proteger o custo, o servidor limita a **150 chamadas por dia**. A Área dos pais → Dados mostra o uso do dia. Os modelos e o limite ficam em `wrangler.jsonc` (`MODEL_PLAN`, `MODEL_FAST`, `AI_DAILY_LIMIT`).

## 5. Segurança e privacidade

- A chave da API fica **só no servidor** (Secret da Cloudflare). O navegador nunca a vê.
- Todas as rotas exigem o **código da família**.
- As fotos vão direto para o Claude corrigir e **não são guardadas** pelo app. O que fica guardado: tarefas, respostas, moedas e compras.
- Sem servidor (ex.: o arquivo aberto direto), o app ainda funciona **só naquele aparelho**: perguntas do gerador interno, sem Claude.

---

## 6. Para desenvolver

```bash
git clone https://github.com/carloscurioni/amanda-study-app.git
cd amanda-study-app
npm install
printf 'FAMILY_CODE=teste\nANTHROPIC_API_KEY=sk-ant-...\n' > .dev.vars   # não vai para o Git
npm run dev            # http://localhost:8787
```

Para testar outra data, acrescente `?hoje=2026-10-30` ao endereço (simula uma sexta).

```
public/index.html   telas do app
public/style.css    visual, layout sem rolagem, folha A4 de impressão
public/script.js    lógica do app: semana, moedas, lojinha, impressão, correção, sincronização
src/worker.js       servidor: banco da família + rotas /api/* que chamam o Claude
wrangler.jsonc      configuração da Cloudflare (nome, banco, modelos, limite diário)
```

Rotas do servidor (todas com o cabeçalho `x-family-code`):
- `/api/state`: guarda e lê o estado da família.
- `/api/plan`: cria a semana a partir de texto e fotos.
- `/api/more`: extras.
- `/api/tutor`: dica.
- `/api/explain`: botão "?".
- `/api/check-open`: corrige as livres.
- `/api/grade`: corrige a folha por foto.
- `/api/usage`: uso do dia.

Todas as respostas do Claude usam *structured outputs* (JSON garantido pelo esquema).
