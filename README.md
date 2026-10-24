# 🦉 Estudos com a Lumi

App de estudos gamificado para crianças de escola internacional, usado por **famílias convidadas**. Começou para a Amanda. Toda semana a criança conta, com as próprias palavras, o que está aprendendo na escola. O **Claude** cria na hora as perguntas de cada dia. Ela faz na tela ou **imprime** a folha, e a corujinha **Lumi**:
- dá dicas (💡);
- explica o conteúdo (**?**);
- corrige tudo, inclusive as respostas livres e a folha de papel por foto.

Cada família tem uma conta (e-mail e senha dos pais). Cada criança tem um perfil com PIN e um **cofre de dados separado** no servidor, então tudo funciona em qualquer aparelho.

```
 Tablet / celular / computador ──▶ Cloudflare Worker (grátis)
                                     ├─ serve o app (pasta public/)
                                     ├─ Diretório: famílias, pais, crianças, convites, sessões, uso (Durable Object + SQLite)
                                     ├─ Cofre de cada criança: semana, moedas, lojinha (um Durable Object por criança)
                                     └─ chama a API do Claude ──▶ perguntas, dicas, explicações e correções
```

## 0. Contas e famílias

- **Só por convite.** O administrador gera, em **Área dos pais → 🛠️ Admin**, um link de convite para cada família (válido por 14 dias, uso único) e o envia por WhatsApp ou e-mail.
- **Pais:** entram com e-mail e senha. As senhas ficam guardadas só como hash (PBKDF2), e o login usa um cookie seguro (HttpOnly). Depois de 5 senhas erradas, o acesso bloqueia por 15 minutos.
- **Outro responsável:** em **Família → Convidar outro responsável**, um pai gera o link para o outro entrar na mesma família.
- **Esqueci a senha:** o administrador gera um **link de nova senha** (vale 48 h) na aba Admin.
- **Crianças:** não usam e-mail. No aparelho da família, tocam no próprio personagem e digitam o **PIN de 4 números**. A **Área dos pais** pede a senha do responsável.
- **Isolamento:** o servidor só abre os cofres das crianças da família logada. Uma família nunca vê os dados da outra.
- **Custo do Claude:** pago pela chave do administrador, com limite por criança por dia (padrão **US$ 0,50**) e total por mês (padrão **US$ 40**). A aba Admin mostra o gasto de cada família, permite mudar o limite de uma família, pausar ou apagar uma família e ver os avisos de problema.
- **Privacidade (LGPD, art. 14):**
  - autorização do responsável no cadastro e [Aviso de Privacidade](public/privacidade.html);
  - download de todos os dados da família;
  - apagar o perfil de uma criança ou a conta inteira.
- **Regras da Anthropic para apps usados por crianças:**
  - o tutorial avisa que a Lumi é uma inteligência artificial;
  - todos os prompts levam regras de segurança infantil;
  - há um botão "🚩 Algo estranho?" na mini-aula e um formulário de aviso para os pais.

### Primeiro acesso (uma vez, depois de publicar esta versão)
1. Abra o endereço do app. Aparece a tela **"Configurar o app"**.
2. Digite o **FAMILY_CODE**, o secret que já está na Cloudflare. Depois, os seus dados (nome da família, e-mail, senha) e os da Amanda: ano escolar e um PIN de 4 números.
3. Os dados que já estavam no app (moedas, compras, semana) passam para o perfil da Amanda. Você vira o **administrador**.
4. No tablet dela, entre com o seu e-mail e senha uma vez. Depois, ela só toca no personagem e digita o PIN.

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
   - `FAMILY_CODE` = um código secreto usado **só no primeiro acesso**, para criar a conta do administrador.
5. Salve (**Deploy**). O endereço do app aparece em **Settings → Domains & Routes**, no formato `https://amanda-study-app.<sua-conta>.workers.dev`.

### Passo 3 — Usar
- Faça o **primeiro acesso** (seção 0) e depois entre no tablet ou celular dela com o seu e-mail.
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

**Total típico: US$ 1–2 por criança por mês.** O servidor calcula o custo de cada chamada pelos tokens e aplica dois limites:
- **por criança por dia:** `CHILD_DAILY_USD`, padrão US$ 0,50, que a aba Admin pode mudar para uma família;
- **total do app por mês:** `MONTHLY_USD`, padrão US$ 40.

Os modelos e os limites ficam em `wrangler.jsonc` (`MODEL_PLAN`, `MODEL_FAST`, `CHILD_DAILY_USD`, `MONTHLY_USD`).

## 5. Segurança e privacidade

- A chave da API fica **só no servidor** (Secret da Cloudflare). O navegador nunca a vê.
- Todas as rotas de dados exigem login (cookie de sessão HttpOnly e Secure, válido por 60 dias). Toda escrita exige o cabeçalho `x-lumi`, como proteção contra requisições vindas de outros sites.
- Senhas e PINs ficam guardados só como hash (PBKDF2-SHA256), com bloqueio após várias tentativas erradas.
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
public/script.js    lógica do app: contas e perfis, semana, moedas, lojinha, impressão, correção, sincronização
public/privacidade.html  aviso de privacidade
src/worker.js       servidor: rotas /api/*, cofre de cada criança, chamadas ao Claude com limite de gasto
src/directory.js    diretório de contas: famílias, pais, crianças, convites, sessões, uso, avisos
wrangler.jsonc      configuração da Cloudflare (nome, Durable Objects, modelos, limites)
```

Rotas do servidor:

| Grupo | Rotas |
|---|---|
| Público | `GET /api/health`, `POST /api/setup` (primeiro acesso), `POST /api/auth/login`, `GET/POST /api/invite/:token[/accept]` |
| Sessão | `GET /api/auth/me`, `POST /api/auth/logout`, `POST /api/auth/verify`, `POST /api/auth/password` |
| Família | `GET/DELETE /api/family`, `POST /api/family/children`, `PATCH/DELETE /api/family/children/:id`, `POST /api/family/children/:id/unlock`, `POST /api/family/invite-parent`, `GET /api/family/export`, `POST /api/report` |
| Dados da criança | `GET/PUT/DELETE /api/children/:id/state` |
| Claude | `POST /api/ai/plan`, `/more`, `/tutor`, `/explain`, `/check-open`, `/grade` (sempre com `childId`) |
| Admin | `GET /api/admin/overview`, `POST /api/admin/invites`, `DELETE /api/admin/invites/:id`, `POST /api/admin/reset-link`, `PATCH/DELETE /api/admin/families/:id`, `POST /api/admin/reports/:id` |

Todas as respostas do Claude usam *structured outputs* (JSON garantido pelo esquema).
