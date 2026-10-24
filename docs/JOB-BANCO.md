# Job que popula o banco de sugestões

Roda como **tarefa agendada do Claude** na conta do Carlos (usa o limite do plano, não a chave da API).
Cada execução gera um lote pequeno, valida, publica no `main`. O Cloudflare faz o deploy sozinho e o servidor carrega as semanas novas quando forem pedidas.
O formato dos arquivos está em `data/bank/FORMAT.md`.

## Passo a passo de cada execução

1. **Repositório**: `git clone https://github.com/carloscurioni/amanda-study-app` (ou `git pull --rebase` se já existir) e entre na pasta. Não precisa de `npm install`.
2. **O que falta**: `node scripts/bank-todo.mjs --limit 10`. Cada item de `units` é uma matéria-semana (`kind: "questions"`, com `need` perguntas a criar) ou um livro (`kind: "book"`).
   - Tamanho do lote: até **10 unidades de perguntas** OU **1 livro + 4 unidades de perguntas** por execução (o que vier primeiro na lista). Não passe disso: o plano tem limite de uso e o job roda várias vezes por dia.
3. **Escreva o lote** num arquivo fora do repositório (ex.: `/tmp/lote.json`), no formato do `bank-add` (ver `data/bank/FORMAT.md`), seguindo as regras abaixo. Para cada unidade, copie `year`, `academic_week`, `subject` e `level` exatamente como vieram.
4. **Junte**: `node scripts/bank-add.mjs /tmp/lote.json`. Leia as linhas `✗` (itens recusados), corrija esses itens num novo arquivo e rode de novo (no máximo 2 rodadas de correção).
5. **Confira e publique**: `node scripts/validate-bank.mjs` (precisa sair sem erros) e `node scripts/build-bank.mjs`.
6. **Commit e push no main**:
   ```bash
   git add data/bank public/bank
   git -c user.name="Carlos Curioni" -c user.email="carloscurioni@gmail.com" commit -m "Banco: +N perguntas, +M livros (Y5 w12, …)"
   git pull --rebase && git push origin main
   ```
   Se o push falhar por conflito, `git pull --rebase` de novo e repita (até 3 vezes). Só mexa em `data/bank` e `public/bank`.
7. Termine com um resumo de 2–3 linhas: o que entrou, o que foi recusado e o progresso (`progress` do bank-todo).

Se o limite de uso do plano acabar no meio: junte e publique o que já estiver pronto (passos 4–6) e pare.

## Regras de conteúdo (as mesmas do app)

**Quem usa**: crianças e adolescentes de escola internacional bilíngue em São Paulo (currículo britânico + IB em inglês, matérias brasileiras em português).
Anos: Y1 ≈ Infantil 5 (5–6 anos) … Y5 ≈ 4º ano (9–10) … Y9 ≈ 8º ano (13–14), Y10–Y11 = IGCSE, Y12–Y13 = IB Diploma (DP1/DP2).

**Perguntas** (cada unidade: exatamente `need` perguntas sobre `topic`/`objectives`/`keywords` da semana):
- Idioma da matéria (`language`): `pt` = português do Brasil; `en` = inglês britânico. Spanish/French: exercício na língua estrangeira com instrução em inglês.
- Nível exato do ano. Do mais fácil ao mais difícil, cobrindo todos os objetivos. Semana `review`/`exam`: revisão do tópico.
- Mistura de tipos: maioria `mc` e `short`; `num` em matemática/ciências; no máximo 1 em cada 4 `open`. Em ortografia/spelling (`pt_ort`, `en_spell`): use as palavras de `spelling` e inclua 2 `proof` (caça-erros) por unidade.
  - `mc`: 3–4 opções curtas do mesmo tipo, só uma correta, `answer` idêntico a uma opção.
  - `short`: resposta de 1–3 palavras sem ambiguidade; variações aceitáveis em `accept`.
  - `num`: `answer` só o número (ou fração "3/4"); arredondamento pedido no enunciado.
  - `open`: `answer` vazio; respondível em 1–3 frases (IGCSE/IB: 3–5 frases com argumento).
  - `proof`: `text` com parágrafo natural de 35–60 palavras com 4 ou 5 palavras erradas; cada `wrong` aparece exatamente 1 vez no texto; o resto 100% correto; `q` = "Caça-erros: encontre e corrija as 5 palavras escritas errado." / "Spot the mistakes: find and fix the 5 misspelled words.".
  - Os outros campos ficam vazios (`options: []`, `text: ""`, `errors: []`).
- Cada pergunta funciona sozinha, na tela e impressa (sem figura, sem áudio). Fatos corretos e verificáveis — na dúvida, não use.
- `hint`: ajuda a pensar, **nunca** contém a resposta.
- Perguntas de completar letras (`ca_ _orro`, `fr_ _nd`): o enunciado diz SEMPRE para escrever a **palavra inteira** ("Complete e escreva a palavra inteira: …" / "Fill in the missing letters and write the whole word: …"), e `answer` é a palavra inteira.
- IGCSE: estilo das provas Cambridge/Edexcel/AQA, com command words. IB: estilo das provas do IB, command terms, respeitando HL/SL (`level`). Add Maths (`fmath`): respostas exatas ("2√3", "x < -1 or x > 4").
- Conteúdo compartilhado: **nenhum** nome de pessoa real, escola, link, e-mail ou telefone. Personagens com nomes inventados e variados.
- Adequado para a idade, gentil e educativo.

**Livros** (`kind: "book"`): livro original no idioma da matéria, `read_level: "at"`, exatamente 7 capítulos.
- Série de episódios: cada capítulo tem começo, meio e fim e dá para ler sozinho; a história avança (personagens fixos, gancho leve).
- Tamanho de cada capítulo: Y1–Y2 120–200 palavras; Y3–Y6 250–400; Y7+ 400–600. Parágrafos separados por `\n`.
- Planeje os capítulos para praticar a habilidade de leitura da semana (`topic`/`objectives`). Em `pt_lit`/`en_lit` (IGCSE/IB) podem ser contos/crônicas originais com recursos literários.
- Cada capítulo: `title` ("Capítulo 1: …" / "Chapter 1: …"), `synopsis` (1–2 frases), `text`, e `questions` com 8 itens: 1 `open` pedindo o resumo em 2–3 frases e 7 de compreensão (das mais literais às de inferência) (`mc` ou `short`, começando com "No capítulo…" / "In the chapter…").
- Sem personagens ou trechos de obras reais.
