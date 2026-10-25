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

> **Idioma:** o app é em **inglês** (telas, Lumi, área dos pais). O português aparece só nos textos e atividades das matérias em português (Português, Ortografia, Leitura, Literatura, Redação, BSS).


1. **📝 Minha semana:** o estudante escolhe o **ano escolar** e o app mostra as matérias da etapa. Depois abre a seção de cada matéria e escreve do jeito dele, ou fala pelo microfone do teclado. Por exemplo, em BSS: *"estamos aprendendo sobre as bacias hidrográficas"*.
   - **🪄 Preencher pela varinha:** preenche cada matéria com o tópico, os objetivos e as palavras-chave da **semana letiva** atual, segundo um currículo de referência pré-planejado semana a semana. Tudo continua editável.
     - **Fontes:** English National Curriculum e BNCC até o Year 9, Cambridge IGCSE no Year 10–11, IB Diploma (SL/HL) no Year 12–13 e IPC no Primary. Cada fonte está em `data/curriculum/SOURCES.md`.
     - **Cálculo da semana:** o app usa o início do ano letivo e as semanas de férias configurados em Ajustes.
     - **Escola adiantada ou atrasada?** Use **◂ semana N ▸**. É uma referência: vale ajustar ao que a escola realmente passou.
   - **💬 Dúvida, sugestão ou problema:** botão pequeno no canto da tela. A mensagem vai para o administrador do app (ver Passo 4).

   | Ano | Brasil | Etapa | Matérias sugeridas |
   |---|---|---|---|
   | Year 1–6 | Infantil 5 a 5º ano | Primary (KS1–KS2) | Português, Ortografia, Leitura, BSS, English, Reading, Spelling, IPC, Math |
   | Year 7–9 | 6º a 8º ano | Key Stage 3 | Português, Leitura, BSS, English, Reading, Math, Science, History, Geography |
   | Year 10–11 | 9º ano e 1ª série EM | IGCSE | Português, Literatura, BSS, English, English Literature, Math, Biology, Chemistry, Physics, History, Geography |
   | Year 12–13 | 2ª e 3ª série EM | **IB Diploma** (DP1 e DP2) | Português A, English A, Math, Biology, Chemistry, Economics, Theory of Knowledge |

   - **📚 Escolher matérias:** cada estudante marca as que faz. Também estão disponíveis Redação, Additional/Further Maths, Computer Science, Business, Psychology, Spanish e French. No IB, ele marca também **HL** ou **SL** em cada matéria, e a Lumi ajusta a profundidade.
   - O Claude segue o estilo da etapa: *command words* do IGCSE, *command terms* e Papers do IB, BNCC no português.
   - **Additional Maths** (Cambridge 0606 / Edexcel Further Pure) está coberta: logaritmos, surds, completar o quadrado, raízes α e β, funções inversas e compostas. Respostas algébricas são aceitas com espaços e símbolos diferentes (`x<-1 or x>4` = `x > 4, x < −1`).
   - Erros de digitação óbvios nos tópicos são corrigidos (ex.: *"surfs"* → *surds*).
   - **Ortografia/Spelling:** 📝 lista de palavras, 🎯 tema (ex.: *silent letters*) ou 🎲 a Lumi escolhe as palavras.
     Todo dia com Ortografia ou Spelling tem um **🔎 Caça-erros**: um parágrafo curto com 4–5 palavras escritas errado.
     - **Na tela:** a criança toca na palavra, corrige ali mesmo e acompanha o contador ("2 de 5 marcadas"). Ao concluir, cada palavra aparece em verde (corrigida), vermelho (faltou, com a forma certa) ou laranja (estava certa).
     - **No papel:** o parágrafo sai com espaço para escrever por cima e linhas para as correções.
     - **Em celulares bem pequenos:** vira um botão que abre o texto em tela cheia, para a folha continuar sem rolagem.
   - **Leitura/Reading:** ela escolhe o nível do texto (⬇️ mais fácil, 🎯 no nível dela, ⬆️ acima ou 🚀 bem acima). A Lumi **escreve o texto** e as perguntas são sobre ele. O texto abre antes das perguntas e sai impresso no topo da folha.
   - Também pode mandar **foto do worksheet ou da agenda**. O Claude cria as perguntas de sábado a sexta no nível do ano escolhido.
2. **Todo dia** ela abre a tarefa:
   - **Quantidade — só 3 ajustes** (Minha semana e Ajustes dos pais): **perguntas por tema** (padrão 2, de 1 a 6), **perguntas do texto em português** e **do texto em inglês** (5 a 8, ou automático). Total do dia = por tema × matérias + perguntas do texto do dia. Todo dia tem tarefa; não há mais mínimo/máximo por dia.
     - **Automático do texto:** Y1–Y2 5, Y3–Y6 6, Y7–Y9 7, IGCSE/IB 8 perguntas; +1 com nível "acima"/"bem acima" (até 8).
   - **📖 Leitura diária:** cada dia começa com um capítulo do **livro da semana**, escrito pela Lumi.
     - **Cada dia tem um texto**, em português ou em inglês: com as duas línguas, os dias alternam (sábado português, domingo inglês…), e a história continua de um dia para o outro.
     - Depois do capítulo: 1 **resumo** e as perguntas de compreensão (5 a 8 no total).
     - **📖 Texto extra** (nos Extras): vem no idioma que não foi o do texto do dia.
     - O botão **🔊** lê o capítulo em voz alta, e **🖨️ Imprimir** (no topo do texto) imprime só a leitura em A4.
   - **🗂️ Temas do dia:** ao abrir o dia aparece um cartão por tema (📖 leitura primeiro, depois cada matéria), com o assunto da semana, quantas perguntas tem e o progresso (✅ quando termina).
     - **▶ Começar / Continuar** segue a sequência. Ela também pode tocar no tema que quiser fazer agora.
     - Dentro do tema aparecem só as perguntas dele, numeradas 1, 2, 3…; no fim, **Próximo tema ▸** leva ao próximo que falta. Depois do último, **✔ Concluir**.
     - Se tentar concluir com algo faltando, a Lumi abre o tema e a pergunta que faltam.
   - **Na tela:** cada tema é dividido em **partes** (1, 2, 3…) que cabem na tela sem rolar; as bolinhas ficam verdes quando a parte está completa.
   - **🖨️ Imprimir (A4):** em toda tarefa (dia, recuperação, extras, reforço e Livro extra) e na aulinha. O texto vem numa folha própria e continua na folha seguinte se for longo. As perguntas ocupam quantas folhas forem precisas, com gabarito opcional para os pais.
   - **⏱️ Times tables (Year 4 e 5):** botão na tela inicial e nos Extras. *Times tables check* com 25 contas da tabuada do 2 ao 12 contra o relógio (6 s por conta no Year 4, como no Multiplication Tables Check; 5 s no Year 5; os pais mudam nos Ajustes). Também dá para praticar uma tabuada só ou as contas que errou (as erradas voltam mais vezes). Tem teclado numérico na tela, recorde por modo e 1 🪙 por acerto (3 rodadas com moedas por dia).
   - **🙋 Contestar a correção:** depois de concluir, a pergunta marcada como errada ganha o botão 🙋. A Lumi confere de novo e, se a criança tiver razão, corrige a nota (e as moedas dos extras). Se a Lumi mantiver, a criança pode pedir para um adulto: a contestação aparece em **Área dos pais → Marking → 🙋 Challenges**, onde os pais decidem.
   - **Extras:** ficam nos temas da semana (só as matérias da semana e os mesmos assuntos). Na **leitura extra**, a criança escolhe inglês ou português; a ⭐ sugere o idioma que não foi o do texto do dia.
   - **Áudio:** nada toca sozinho; a Lumi só lê quando a criança toca no 🔊.
3. **Ajuda em cada pergunta:**
   - **💡** dá uma dica. Com **"Me explica mais"**, o Claude dá uma explicação nova, sem entregar a resposta.
   - **? Aulinha:** explicação em partes, exemplos e um macete, lida em voz alta pela Lumi. Depois, **"Vamos treinar"**: 3–4 exercícios na hora, com correção.
   - **🧠 Reforço:** perguntas erradas (ou em que ela pediu a aulinha) vão para o Reforço, nos Extras. A Lumi cria perguntas novas parecidas, e quando ela acerta, a pergunta sai da lista.
   - **🤷 Não sei a regra** (no Caça-erros) abre uma aulinha sobre a regra de ortografia, por exemplo acentuação.
   - **🔊 A Lumi fala:** todo balão da Lumi tem um botão para ouvir.
4. **Correção:**
   - **Na tela:** as objetivas são corrigidas na hora, e as **livres são corrigidas pela Lumi** com um comentário.
   - **No papel:** em **📄 Corrigir folha**, ela tira uma foto e o Claude lê a letra dela e corrige tudo (livres inclusive). Ou ela corrige sozinha com o gabarito, marcando ✓/✗.
   - Os pais veem todas as livres com o comentário da Lumi e podem confirmar ou mudar.
5. **Sexta** é o dia de entregar a semana. **⭐ Extras** dão moedas a mais:
   - **📖 Livro extra:** o próximo capítulo do livro dela (em português ou inglês), com resumo e perguntas;
   - **🧠 Reforço:** treinar o que errou;
   - **🎲 Quiz extra:** por matéria, ou misturado;
   - **✏️ Oficina de palavras:** as palavras de Ortografia/Spelling da semana e as que ela errou (🔥).
     - Tocar numa palavra: ouvir, ou **"Não sei esse! Me ensina"**, que abre uma aulinha sobre a regra.
     - **Jogos na tela** (+3 🪙 por jogo, até 5 por dia): 🔍 Caça-palavras, 🎧 Ditado da Lumi, ⚡ Pisca-pisca (a palavra some e ela escreve de memória), 🧩 Embaralhadas, 🕳️ Vogais sumidas.
     - **Folhas para imprimir:** 🌈 Palavras arco-íris, 👀 Olhe-cubra-escreva-confira, ✍️ Caligrafia, 🔍 Caça-palavras, 🔺 Pirâmide de letras, 🫧 Letras-bolha, 🎨 Vogais coloridas, 🕵️ Código secreto, 🧩 Letras embaralhadas, 🔤 Ordem alfabética, 🤪 Frase maluca, 🖍️ Palavra-desenho.

   As moedas compram itens na **🛒 Lojinha**.

## 2. Moedas e lojinha

| Evento | Moedas |
|---|---|
| Tarefa do dia concluída **no próprio dia** | **+10** na hora (atrasada dentro da semana: +5; ajustável, 0 desliga) |
| Semana entregue (todos os dias feitos, até sexta) — bônus | **+100** numa semana completa; proporcional aos dias se a semana começou no meio (planejada na sexta = só 1 dia = +14) |
| Semana não entregue | **−150** (maior que a recompensa; também proporcional) |
| ⏳ Recuperação: dias que faltaram, feitos até a sexta seguinte | **metade da recompensa** (+50 se recuperar todos, dividido entre os dias) |
| Exercícios extras | **+2 por acerto** (rodadas de 5, até 3 rodadas pagas por dia) |
| Jogos da Oficina de palavras | **+3 por jogo** (até 5 por dia) |
| 📜 Missões (3 do dia + 2 da semana) | fácil **+5–10**, média **+20–30**, difícil **+50–80**; missão de compra = valor gasto **+50** |
| 🎡 Roleta diária | 1 giro grátis por dia (+1 de uma missão do dia e +1 de uma da semana; máx. 3/dia) — prêmios na tabela abaixo |
| ⚡ Desafio da Lumi (a cada 2 h, máx. 5/dia) | **+10** por acerto; desafio de leitura (1 por dia) **+20**; errar não tira moedas |

A tela inicial mostra o bônus pendente: *"🎁 +100 na sexta 30/10 se completar todos os dias (2 de 7 feitos)"*.

**📜 Missões:** sorteadas por dia e por semana, para cada criança, e não mudam ao recarregar. Exemplos: "Conclua a tarefa de hoje", "Acerte 100% nos extras", "Use o ? para aprender algo novo", "Mantenha a sequência por 3 dias". Às vezes aparece "Compre 2 ovos hoje", que devolve o valor gasto + 50. Toque em **Resgatar** para receber. Os pais ligam ou desligam as missões (e as de compra) em Ajustes.

**🎡 Roleta diária (Daily spin):** botão **🎡 Spin** na tela inicial, com selo quando há giro.
- 1 giro grátis por dia (não acumula). Uma missão do dia (a mais difícil) e uma da semana podem dar **+1 spin 🎡** em vez de moedas. Máximo de 3 giros por dia.
- Chances (constante `SPIN_ODDS` no código; o botão **Odds** mostra na própria roleta):

| Fatia | Chance | Prêmio |
|---|---|---|
| 🪙 Moedas | 40% | 15 moedas (ajustável) |
| 💰 Moedas | 22% | 50 moedas (ajustável) |
| 🎩 Acessório da Lumi | 16% | chapéu, óculos, acessório ou asas/capa ainda não comprado |
| 🎁 Surpresa da lojinha | 16% | cor, fundo, efeito ou adesivo ainda não comprado; vales só se os pais marcarem "can come from the spin" |
| 🥚 Ovo do dia | 6% | alterna por dia entre ovo de amiguinho e ovo de mascote; choca na hora |

- Se a criança já tem tudo de uma fatia de item, ganha moedas no valor do item mais barato dessa categoria.
- O sorteio usa `crypto.getRandomValues` e é salvo antes da animação: recarregar a página mostra o mesmo prêmio, sem girar de novo.
- Respeita "reduzir movimento" do aparelho e o 🔇. Pais: Ajustes → ligar/desligar e valores das fatias de moedas.

**⚡ Desafio da Lumi (Lumi's challenge):** com o app aberto, a Lumi aparece a cada 2 horas (contando o tempo com o app fechado, cerca de 1 minuto depois de voltar): *"Hey! Want to earn 10 coins?…"*.
- **Let's go! ⚡** abre 1 pergunta difícil e objetiva da semana (primeiro do banco de sugestões; o Claude só se o banco não tiver). Sem ? e sem 💡, uma tentativa. Acertou: +10. Errou: mostra a resposta com uma explicação curta, sem perder moedas.
- **Later** adia 30 minutos. Ignorado por 2 minutos: some e conta como pulado.
- Nunca interrompe o times tables, a correção por foto ou uma janela aberta. Máximo de 5 por dia.
- Uma vez por dia, um desafio pode ser de **leitura**, com um trecho curto do texto do dia, valendo +20.
- Pais: Ajustes → ligar/desligar, intervalo, valores e máximo por dia. Os desafios do dia (acertos, erros e pulados) aparecem em **Marking**.
- É diferente do **🙋 I think I'm right**, que serve para contestar a correção.

Lojinha (do mais barato ao mais caro em cada categoria):
- 🥚 **Ovos:**
  - **Ovo de amiguinho** (250): choca um amiguinho surpresa, com chances à mostra: Comum 55%, Raro 28%, Épico 14% e Lendário 3% (o Dragãozinho e o Unicórnio).
  - **Ovo de mascote** (600): libera um mascote para trocar a Lumi. São 7, com chances iguais: Pipoca 🐶, Mel 🐱, Bambu 🐼, Nina 🐰, Faísca 🦊, Picolé 🐧 e Brontinho 🦖.
  - Pode vir repetido (×2). O ovo treme, racha e revela.
- 📖 **Minha coleção:** amiguinhos e mascotes, silhuetas dos que faltam e contagem (ex.: 7/21). Tocar num mascote troca quem aparece no app, e o nome muda junto. As roupinhas servem em todos os mascotes.
- 💌 **Recadinho secreto** (500, ajustável): os pais escrevem recadinhos em Área dos pais → 💌 Recadinhos.
  - A criança compra um envelope, que sorteia um recadinho ainda não lido (nunca repete) e abre com animação. Ela relê os que já abriu em 📬 Meus recadinhos.
  - Sem recadinhos guardados, o envelope aparece como "Em breve".
  - Os textos ficam no servidor, fora do aparelho da criança, até a compra.
- 🎉 **Reações:** aparecem quando a criança gabarita, e cada uma tem botão **Testar**. Ela equipa 1 de cada:
  - **dancinhas do mascote:** Pulinhos, Giro, Robô, Dancinha estilo Macarena e Moonwalk;
  - **musiquinhas originais curtas:** 🔇 desliga o som;
  - **confetes:** estrelas, corações, arco-íris e fogos.
  - O confete colorido é grátis sempre que gabaritar.
- 🎩 18 chapéus, 👓 9 óculos e 🎀 9 acessórios.
- 🦋 7 asas e capas, incluindo a mochila a jato.
- 🎨 10 cores da Lumi, incluindo a **Arco-íris** e a **Galáxia**.
- ✨ 9 efeitos ao redor da Lumi: corações, notas musicais, neve, arco-íris, **aura dourada**.
- 🖼️ 13 fundos para o app e ⭐ 45 adesivos para o álbum.
- 🎟️ **24 vales de prêmios reais**, de 150 a 10.000 moedas: escolher as músicas do carro, pizza, livro novo, dormir mais tarde, cinema, R$ 20, jogo novo, Dia do SIM, ingresso para show/jogo, escolher a viagem do fim de semana… Os pais editam, apagam e criam vales.
- Os itens a partir de 1.000 moedas aparecem como **✨ SONHO**.

**⏳ Recuperação:** quando a semana fecha sem entrega, a penalidade é aplicada. Os dias que faltaram continuam abertos, num cartão na tela inicial, até a sexta seguinte.
- Cada dia recuperado vale uma parte de **metade da recompensa**. Exemplo: faltaram 6 dias → cerca de +8 por dia, +50 ao recuperar todos.
- A porcentagem é ajustável nos Ajustes dos pais (0 desliga a recuperação).
- Os dias recuperados aparecem como "⏳ recuperada" no resumo dos pais.

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

### Passo 4 (opcional) — E-mail das mensagens do botão 💬
As mensagens sempre ficam em Área dos pais → **💬 Mensagens** (só o admin vê). Para recebê-las também por e-mail:
1. Crie uma conta grátis em **resend.com** (com o mesmo e-mail de atendimento, ex.: carloscurioni@gmail.com) e gere uma **API key** em *API Keys*.
2. No computador, dentro da pasta do projeto: `npx wrangler secret put RESEND_API_KEY` e cole a chave. Ou, no painel da Cloudflare: Worker → *Settings* → *Variables and Secrets* → **Add** → tipo **Secret**.
3. Sem domínio próprio, o Resend envia de `onboarding@resend.dev` **só para o e-mail da sua conta Resend**. Para mandar para outro endereço, verifique um domínio no Resend e crie a variável `RESEND_FROM` (ex.: `Lumi <lumi@seudominio.com>`).
4. O endereço que recebe é configurável no Admin → 💬 Mensagens (padrão carloscurioni@gmail.com). Limite: até 20 mensagens e 10 e-mails por família por dia.

### Passo 5 (recomendado) — Voz natural da Lumi
Sem isso, a Lumi lê com a voz do aparelho (o app escolhe a melhor disponível, e nos Ajustes dá para trocar e testar). Para uma voz natural em português do Brasil e inglês britânico:
1. Em [console.cloud.google.com](https://console.cloud.google.com), crie um projeto, ative a **Cloud Text-to-Speech API** e crie uma **chave de API** (Credenciais → Criar credenciais → Chave de API), restrita a essa API.
2. No Cloudflare (Worker → Settings → Variables and Secrets), adicione o secret **`GOOGLE_TTS_API_KEY`** com a chave.
3. Pronto: o app usa a melhor voz do Google (Chirp 3 HD, senão Neural2). Para fixar uma voz, crie as variáveis `TTS_VOICE_PT` / `TTS_VOICE_EN` com o nome dela.
- Custo: cota grátis mensal (1 milhão de caracteres nas vozes neurais); depois, cerca de US$ 16–30 por milhão. Cada áudio fica guardado no servidor, então um texto do banco lido por várias crianças é pago uma vez só. O gasto entra no limite diário de cada criança.

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
Modelo por etapa: no painel de admin (cartão 💳 Claude spending), o menu 🤖 escolhe até que ano as perguntas da semana (`plan-day`), o banco (`bank-fill`) e os livros do banco usam `MODEL_EASY` (Haiku, bem mais barato); os outros anos usam `MODEL_PLAN` (Sonnet). Sem escolha no painel, vale `EASY_MAX_YEAR` do `wrangler.jsonc` (`"0"` = tudo no Sonnet).

### 🏦 Banco de sugestões (menos custo, semana pronta na hora)

Perguntas e livros da leitura diária ficam num **banco compartilhado entre todas as famílias**, por currículo · ano · matéria · nível (HL/SL) · semana letiva.
- **Ao criar a semana:** cada matéria que segue o currículo de referência (preenchida pela 🪄 varinha, com texto igual ao do currículo, ou "a Lumi escolhe") vem do banco. Cada criança recebe uma ordem diferente, e as perguntas que ela já tem não se repetem.
- **Quando falta:** o Claude cria só o que falta, e o resultado volta para o banco. A próxima criança do mesmo ano e semana não gasta nada.
- **O que nunca entra no banco:** texto digitado diferente do currículo, fotos e reforço com os erros da criança. Isso continua personalizado e não é compartilhado. Os prompts do banco usam só a linha do currículo, sem o nome nem o texto da criança.
- **Avisos:** o 🚩 numa pergunta do banco (depois de concluir o dia) avisa o admin. Avisos de 2 famílias diferentes, ou do admin, escondem o item até a revisão no cartão 🏦 do Admin.
- **Job que enche o banco:** uma tarefa agendada do Claude, que usa a conta Pro e não a chave da API, gera lotes seguindo `docs/JOB-BANCO.md`. Cada lote é validado e publicado direto no `main`, e o Cloudflare faz o deploy. A ordem é a semana letiva atual primeiro, com os anos de `data/bank/priority.json` na frente.

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

Para testar outra data, acrescente `?hoje=2026-10-30` ao endereço (simula uma sexta). Para ver o ⚡ desafio da Lumi sem esperar 2 horas, acrescente `?dare=now` (ex.: `?hoje=2026-10-26&dare=now`); ele aparece em poucos segundos na tela inicial. Roteiros de teste manual: `docs/TESTES-MANUAIS.md`.

**Banco de sugestões:** formato em `data/bank/FORMAT.md`; `npm run bank:todo` (o que falta), `bank:add lote.json`, `bank:check`, `bank:build` (publica em `public/bank`). Instruções do job: `docs/JOB-BANCO.md`.

**Currículo de referência (varinha):**
- **Onde ficam:** os arquivos estão em `data/curriculum/<etapa>/<ano>-<matéria>[-sl|-hl].json`. O formato e o calendário de 37 semanas estão em `data/curriculum/FORMAT.md`.
- **Validar:** `node scripts/validate-curriculum.mjs`.
- **Publicar:** depois de editar, rode `node scripts/build-curriculum.mjs`, que gera `public/curriculum/*.json`, e faça o push.
- **Carga no servidor:** o servidor carrega os arquivos no SQLite sozinho na primeira consulta e quando a versão muda. No Admin, **Recarregar currículo** força a carga, sem apagar as linhas editadas lá.

```
public/index.html   telas do app
public/style.css    visual, layout sem rolagem, folha A4 de impressão
public/script.js    lógica do app: contas e perfis, semana, moedas, lojinha, impressão, correção, sincronização
public/privacidade.html  aviso de privacidade
src/worker.js       servidor: rotas /api/*, cofre de cada criança, chamadas ao Claude com limite de gasto
src/directory.js    diretório de contas: famílias, pais, crianças, convites, sessões, uso, avisos, mensagens (💬) e ajustes do app
src/curriculum.js   currículo de referência (Durable Object com SQLite)
src/bank.js         banco de sugestões compartilhado (Durable Object com SQLite); src/bank-format.js valida (servidor e scripts)
data/bank/          banco no repositório (JSON por ano/semana) + priority.json; docs/JOB-BANCO.md = instruções do job
data/curriculum/    currículo semana a semana (JSON) + fontes; scripts/ valida e publica
wrangler.jsonc      configuração da Cloudflare (nome, Durable Objects, modelos, limites)
```

Rotas do servidor:

| Grupo | Rotas |
|---|---|
| Público | `GET /api/health`, `POST /api/setup` (primeiro acesso), `POST /api/auth/login`, `GET/POST /api/invite/:token[/accept]` |
| Sessão | `GET /api/auth/me`, `POST /api/auth/logout`, `POST /api/auth/verify`, `POST /api/auth/password` |
| Família | `GET/DELETE /api/family`, `POST /api/family/children`, `PATCH/DELETE /api/family/children/:id`, `POST /api/family/children/:id/unlock`, `POST /api/family/invite-parent`, `GET /api/family/export`, `POST /api/report` |
| Dados da criança | `GET/PUT/DELETE /api/children/:id/state`; 💌 `GET/POST /api/children/:id/notes`, `DELETE …/notes/:nid` (com a área dos pais desbloqueada), `GET …/notes/status`, `POST …/notes/open` |
| Currículo e mensagens | `GET /api/curriculum?year=&week=&subjects=`, `POST /api/feedback` |
| Banco | `POST /api/bank/draw` (sorteia sem chamar o Claude), `POST /api/bank/report` (🚩) |
| Claude | `POST /api/ai/plan-outline`, `/plan-day`, `/bank-fill`, `/bank-book`, `/bank-chapter`, `/more`, `/tutor`, `/explain`, `/check-open`, `/grade`, `/lesson`, `/reading` (sempre com `childId`) |
| Admin | `GET /api/admin/bank[?prefix=|?ckey=]`, `POST /api/admin/bank/status`, `PUT /api/admin/bank/item`, `GET /api/admin/bank/export`, `GET/PUT /api/admin/curriculum`, `POST /api/admin/curriculum/seed`, `GET /api/admin/feedback`, `POST /api/admin/feedback/:id`, `GET/PUT /api/admin/settings`, `GET /api/admin/overview`, `POST /api/admin/invites`, `DELETE /api/admin/invites/:id`, `POST /api/admin/reset-link`, `PATCH/DELETE /api/admin/families/:id`, `POST /api/admin/reports/:id` |

Todas as respostas do Claude usam *structured outputs* (JSON garantido pelo esquema).
