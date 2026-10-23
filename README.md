# 🦉 Estudos com a Lumi

App de estudos gamificado para uma aluna de escola internacional. Toda semana ela escreve o que está aprendendo na escola, o app gera tarefas curtas para cada dia (sábado → sexta), e a corujinha **Lumi** guia, dá dicas e comemora. Moedas viram roupinhas, fundos, adesivos e vales na lojinha.

- **HTML, CSS e JavaScript puros** — sem framework, sem back-end, sem build.
- **Estado no `localStorage`** do navegador (com backup/restauração em JSON).
- Publicável direto no **GitHub Pages** (ou Netlify, Vercel, Cloudflare Pages).

---

## 1. Validação da estrutura

| Requisito | Como foi atendido |
|---|---|
| Input semanal do conteúdo | Tela **📝 Minha semana**: um campo por matéria, separados em 🇧🇷 português e 🇬🇧 inglês. |
| Fim de semana mais pesado | Padrão: **Sáb 9 · Dom 9 · Seg–Qui 7 · Sex 5** perguntas (ajustável). |
| Sexta = entrega | O ciclo vai de sábado a sexta. Na sexta aparece **🎁 Entregar a semana**. Depois da sexta, o app fecha a semana sozinho (recompensa ou penalidade). |
| Sem rolagem | A folha do dia ocupa 100% da tela; o script testa tamanhos de fonte e 1–3 colunas até **tudo caber**. Testado em celular (390×844) com até 15 perguntas, tablet e notebook. |
| Volume > complexidade | Perguntas curtas e objetivas. No máximo ~30% de perguntas abertas por dia. |
| Quantidade flexível | Ela escolhe perguntas por dia no planejamento e também no botão **− / +** da folha (antes de começar o dia). Mín. 3, máx. 15 (os pais ajustam). |
| 10 matérias em 2 idiomas | PT: Português, Ortografia, Leitura, BSS. EN: English, Reading, Spelling, Guided Reading, IPC, Math. |
| Mascote em todas as telas | A Lumi fica na barra superior: tutorial, dicas por tela, dica de cada pergunta (💡), comemorações. |
| Gabarito | Botão **🔑 Gabarito** no rodapé da folha. Perguntas abertas aparecem como **[Resposta Livre]**. |
| Pais corrigem as abertas | **🔒 Área dos pais → Correção** mostra cada resposta livre com ✓ / ↺. |

**Duas decisões que tomei e que vocês podem mudar em Ajustes:**

1. **Gabarito libera depois de "Concluir"** (senão ela copia antes de responder). Dá para deixar sempre aberto.
2. **Dias futuros ficam trancados** 🔒: a tarefa de quarta só abre na quarta, para criar o hábito diário. Dias atrasados podem ser feitos até sexta.

> **Sobre o "Study Worksheet":** o documento não veio junto com o pedido. O gerador segue a estrutura descrita no briefing. Quando quiserem usar o worksheet da escola, há duas formas: (a) me mandar o arquivo para eu ajustar os modelos de pergunta; (b) usar a importação via Claude (seção 5), colando o worksheet no prompt.

---

## 2. Fluxo de telas (wireframe em texto)

```
┌─ BARRA (todas as telas) ───────────────────────────────┐
│ 🦉 Lumi   Título da tela        🪙 120   🏠  🛒  🔒     │
│  └ balão de fala: dicas, tutorial, comemorações        │
└────────────────────────────────────────────────────────┘

[1] BOAS-VINDAS (só na 1ª vez)
    🦉 grande · "Como você se chama?" [_____] [Vamos começar!]
    → tutorial da Lumi em 7 balões (explica semana, sexta, moedas, loja, dicas)

[2] INÍCIO
    ┌ 🦉 Oi, Amanda!  Entrega: sexta 30/10 · faltam 3 dias · 2/7 feitos ┐
    │ [Sáb★][Dom★][Seg][Ter][Qua][Qui][Sex]   ✅ feito 📘 hoje ⏰ atrasado 🔒 │
    │ [ 📘 Abrir a tarefa de hoje (7 perguntas) ]   ← ou "Fazer atrasada" │
    │                                                ← ou "🎁 Entregar a semana" (sexta) │
    │ [ ⭐ Exercícios extras (+2 🪙/acerto · 3 hoje) ]                   │
    │ [ 📝 Minha semana ]  [ 🛒 Lojinha ]                                 │
    └ Meu álbum: 🌈 🐬 🦄 (adesivos comprados)                            ┘

[3] MINHA SEMANA (input semanal)
    [🇧🇷 Em português | 🇬🇧 In English]
    📝 Português ........ [substantivos; plural...]
    ✏️ Ortografia ....... [exceção, cachorro, ...]
    📖 Leitura .......... [livro/capítulo + trecho opcional]
    🇧🇷 BSS ............. [regiões do Brasil...]
    Perguntas por dia:  Sáb 9 · Dom 9 · Seg 7 · Ter 7 · Qua 7 · Qui 7 · Sex 5  (−/+)
    ( ) Esta semana   ( ) Próxima semana
    [Voltar]  [ Criar tarefas da semana ✨ ]

[4] FOLHA DO DIA — SEM ROLAGEM
    Sábado 24/10   ▓▓▓░░░ 3/9   [− 9 +]
    ┌─────────────────────┐┌─────────────────────┐
    │① PORTUGUÊS      💡  ││② ORTOGRAFIA   🔊 💡 │   cartões curtos,
    │ "corajoso" é um:    ││ Ouça e escreva:     │   1–3 colunas,
    │ [subst][adj][verbo] ││ [__________]        │   fonte ajustada
    └─────────────────────┘└─────────────────────┘   para caber
    ...
    [◂ Voltar]  [🔑 Gabarito]  [✔ Concluir]
    → Concluir: corrige as objetivas (✓/✗), libera o gabarito, Lumi comemora

[5] GABARITO (modal, também sem rolagem)
    1. adjetivo · você: substantivo   ✗
    2. papéis                           ✓
    6. [Resposta Livre]   ← pais corrigem

[6] LOJINHA
    🦉 prévia (com o item "provado")  Saldo: 🪙 70
    [🎩 Chapéus][👓 Óculos][🎀 Acessórios][🖼️ Fundos][⭐ Adesivos][🎟️ Vales]
    cartões: desenho · nome · 🪙 preço · [Provar] [Comprar] / [Usar] / [Usando ✔]

[7] ÁREA DOS PAIS (PIN, padrão 1234)
    [📝 Correção] respostas livres da semana com ✓ Certo / ↺ Conversar + resumo dos dias
    [🪙 Moedas]   saldo, lançamento manual (+/−) e extrato
    [🎟️ Vales]    vales resgatados → "Entregue ✔"; editar nomes e preços
    [⚙️ Ajustes]  recompensa, penalidade, extras, mín./máx., gabarito, voz, PIN
    [📥 Dados]    importar perguntas do Claude (JSON), backup, zerar
```

---

## 3. Economia de moedas

| Evento | Moedas | Regra |
|---|---|---|
| **Semana entregue** (todos os dias feitos, até sexta) | **+100** | Botão *Entregar a semana* na sexta. Se ela esquecer de apertar mas fez tudo, o app paga no sábado. |
| **Semana não entregue** | **−150** | Cobrado ao abrir o app depois da sexta. 1,5× a recompensa, como pedido. |
| **Exercícios extras** | **+2 por acerto** | Rodadas de 5 perguntas objetivas → até 10 🪙 por rodada. |
| Limite de extras pagos | **3 rodadas/dia** | Até 30 🪙/dia. Depois disso os extras continuam, só que valendo treino. |
| Ajuste dos pais | livre | Ex.: bônus por capricho nas respostas livres. |

**Por que esses números:** uma semana completa (100) mais extras moderados (~50) dá cerca de 150 🪙 por semana. Um adesivo sai no primeiro dia de extras, uma roupinha simples na primeira semana, a coroa em ~1,5 semana e os vales em 1–2 semanas. Perder uma semana (−150) custa mais que uma semana inteira de recompensa: o incentivo é entregar. O saldo **pode ficar negativo**; nesse caso a lojinha só volta quando ele ficar positivo.

Todos os valores mudam em **🔒 Área dos pais → Ajustes** (o app exige penalidade > recompensa).

## 4. A Lojinha

| Categoria | Itens (🪙) |
|---|---|
| 🎩 Chapéus | Boné vermelho 40 · Coroa de flores 70 · Chapéu de bruxinha 90 · Coroa dourada 150 · Capelo de formatura 200 |
| 👓 Óculos | Redondos 35 · De coração 60 · Escuros 80 |
| 🎀 Acessórios | Gravata-borboleta 30 · Cachecol 50 · Medalha de campeã 120 |
| 🖼️ Fundos do app | Oceano 60 · Floresta 60 · Pôr do sol 90 · Doceria 90 · Galáxia 140 |
| ⭐ Adesivos (álbum na tela inicial) | 15 adesivos de 15 a 40 (🌈 ⭐ 🍉 🌸 🍩 🎀 🐬 🦋 🐱 🎨 🦄 🐼 🚀 🐴 🏆) |
| 🎟️ Vales (prêmios reais, repetíveis) | 30 min extras de tela 150 · Escolher o jantar 250 · Escolher o filme da família 300 — **editáveis pelos pais** |

Roupinhas e fundos podem ser **provados** antes de comprar. Ao resgatar um vale, ele aparece na Área dos pais até ser marcado como entregue.

---

## 5. Como as perguntas são geradas

O app gera tudo **offline**, a partir do que ela escreve:

| Matéria | O que escrever | Perguntas geradas |
|---|---|---|
| Português / English | assuntos (*plural, sinônimos, past tense, prefixes, homophones…*) | Bancos internos por assunto: classes de palavras, plural, sinônimo/antônimo, feminino, pontuação, diminutivo, sílabas, acentuação / word classes, past tense, plurals, synonyms, antonyms, pronouns, contractions, prefixes, homophones. Sem assunto reconhecido → revisão mista. |
| Ortografia / Spelling | lista de palavras separadas por vírgula | Ditado com voz 🔊, "qual está correta?" (com erros típicos do idioma: ss/ç, x/ch, g/j… · ie/ei, letras dobradas…), completar letras, desembaralhar, frase com a palavra. |
| Leitura / Reading / Guided Reading | 1ª linha: livro e capítulo; opcional: colar um trecho | Perguntas de compreensão (Guided Reading segue **VIPERS**: Vocabulary, Infer, Predict, Explain, Retrieve, Sequence/Summarise). Com trecho colado: perguntas de completar frases do texto (corrigidas automaticamente). |
| BSS | tema | Bancos para **capitais, regiões, biomas e história do Brasil** + perguntas abertas sobre o tema. |
| IPC | unidade | Bancos para continentes, Sistema Solar, ciclo da água, Egito, Roma, plantas, corpo humano + abertas. |
| Math | assuntos (*fractions, times tables, perimeter, rounding, time, money…*) | Geradores numéricos com resposta exata para 20+ assuntos. |

**Flashcards em qualquer matéria:** uma linha no formato `pergunta = resposta` vira pergunta de resposta curta e de múltipla escolha. Ex.: `Capital da Bahia = Salvador`, `What is the hottest planet? = Venus`.

### Perguntas sob medida com o Claude (opcional)

Para perguntas específicas do conteúdo da escola (ou do Study Worksheet):

1. **🔒 Área dos pais → 📥 Dados → Copiar prompt para o Claude** (o prompt já vem com os tópicos da semana).
2. Cole no Claude, junto com o Study Worksheet.
3. Cole o JSON que ele devolver em **JSON das perguntas → Importar**.

As importadas entram primeiro; o gerador completa o resto. Se a semana já estiver em andamento, só os dias ainda não começados são refeitos.

Formato:

```json
{"questions": [
  {"subject": "math", "type": "num", "q": "7 × 8 = ?", "answer": "56", "hint": "7 × 4 × 2"},
  {"subject": "pt", "type": "mc", "q": "Antônimo de 'alto'?", "options": ["baixo","grande","forte","feliz"], "answer": "baixo"},
  {"subject": "en_spell", "type": "listen", "say": "because", "answer": "because"},
  {"subject": "ipc", "type": "open", "q": "Write 3 facts about Mars.", "answer": "", "day": "sab"}
]}
```

`subject`: `pt`, `pt_ort`, `pt_leit`, `bss`, `en`, `en_read`, `en_spell`, `en_guided`, `ipc`, `math` · `type`: `mc`, `short`, `num`, `listen`, `open` · `day` (opcional): `sab`, `dom`, `seg`, `ter`, `qua`, `qui`, `sex`.

---

## 6. Publicar no GitHub Pages

Este repositório já está pronto. Para ativar o site:

1. No GitHub, abra o repositório → **Settings → Pages**.
2. Em **Build and deployment → Source**, escolha **Deploy from a branch**.
3. Branch **`main`**, pasta **`/ (root)`** → **Save**.
4. Em 1–2 minutos o site fica em **https://carloscurioni.github.io/amanda-study-app/**.

No tablet/celular dela, abra o link e use **Compartilhar → Adicionar à Tela de Início**: vira um ícone de app.

### Atualizar o código depois

```bash
git clone https://github.com/carloscurioni/amanda-study-app.git
cd amanda-study-app
# edite os arquivos
git add -A && git commit -m "Ajusta ..." && git push
```

O GitHub Pages republica sozinho a cada push.

### Rodar no computador (sem publicar)

```bash
cd amanda-study-app
python3 -m http.server 8000
# abra http://localhost:8000
```

Para testar outra data: `http://localhost:8000/?hoje=2026-10-30` (simula uma sexta).

---

## 7. Arquivos

```
index.html   estrutura da página (barra com a mascote + telas)
style.css    visual, temas de fundo, layout sem rolagem da folha do dia
script.js    toda a lógica, organizada em seções:
             1 configuração (matérias, moedas, lojinha) · 2 utilitários
             3 estado/localStorage · 4 mascote · 5 gerador de perguntas
             6 semana (distribuição, entrega, penalidade) · 7 telas · 8 início
```

## 8. Bom saber

- **Os dados ficam no navegador do aparelho.** Se ela usar o app no tablet e no computador, cada um terá seu próprio saldo. Escolham um aparelho principal e usem **Backup** para trocar.
- Limpar os dados do navegador apaga o progresso — façam backup de vez em quando (Área dos pais → Dados).
- Em celulares muito pequenos (altura ≤ 640 px), cabem até ~10 perguntas sem rolar; acima disso a folha rola dentro do cartão como último recurso. Em tablet e notebook cabem 15 com folga.
- O ditado 🔊 usa a voz do próprio navegador (Safari e Chrome têm). Se não houver voz, o app não gera perguntas de ditado.
- PIN padrão dos pais: **1234** — troquem em Ajustes.
