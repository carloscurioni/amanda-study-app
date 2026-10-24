# Banco de sugestões — formato dos arquivos

Perguntas e livros prontos, compartilhados entre todas as crianças do mesmo **currículo · ano · semana letiva**.
O app sorteia daqui antes de chamar o Claude (ver `src/bank.js`). O que o Claude cria na hora fica no SQLite do servidor (`source = api`); o que está aqui no repositório entra como `source = repo`.

Um arquivo por currículo + ano + semana letiva: `data/bank/<currículo>/<ano>/wNN.json` (ex.: `data/bank/uk/Y5/w12.json`).
- currículo: `uk` (britânico + IB; o brasileiro será `br`)
- ano: `Y1` … `Y13`; semana: `01` … `37` (mesmas semanas de `data/curriculum`)

```json
{
  "version": 1, "curriculum": "uk", "year": "Y5", "academic_week": 12,
  "subjects": {
    "math":   { "topic": "Multiplying 4-digit by 1-digit numbers", "questions": [ { "id": "r…", "type": "num", "q": "3,214 × 3 = ?", "options": [], "answer": "9642", "accept": [], "hint": "Multiply the ones first.", "text": "", "errors": [] } ] },
    "bio-hl": { "topic": "…", "questions": [] }
  },
  "books": [
    { "subject": "pt_leit", "level": "", "read_level": "at", "title": "O Segredo do Farol", "premise": "…",
      "chapters": [ { "title": "Capítulo 1: …", "synopsis": "…", "text": "parágrafo\nparágrafo", "questions": [ {"type": "open", "q": "Resuma…"}, {"type": "mc", "q": "No capítulo…"}, {"type": "short", "q": "No capítulo…"} ] } ] }
  ]
}
```

- Chave de matéria: o id da matéria, com `-hl`/`-sl` no IB (igual aos nomes de `data/curriculum`).
- `id` é opcional: o build cria um id estável pelo conteúdo.
- Tipos: `mc` (2–5 opções, `answer` igual a uma delas), `short` (1–3 palavras), `num` (só o número ou fração), `open` (`answer` vazio), `proof` (caça-erros: `text` com 3–7 palavras erradas, cada `wrong` aparece exatamente 1 vez no texto).
- A dica (`hint`) nunca contém a resposta. Nada de links, e-mails, telefones, nomes de pessoas reais ou de escolas.
- Livros: exatamente 7 capítulos-episódio (cada um com começo, meio e fim), cada capítulo com texto (≥ 60 palavras) e 3 perguntas (1 `open` de resumo + 2 de compreensão). `read_level`: `below`, `at`, `above` ou `way`.
- Leitura diária do app: o 1º livro em português e o 1º em inglês da etapa (`pt_leit`/`en_read` até o Year 9, `pt_lit`/`en_lit` do Year 10 em diante).

## Scripts

```bash
node scripts/bank-todo.mjs --limit 12        # o que falta, na ordem (semana atual primeiro; anos de priority.json antes)
node scripts/bank-add.mjs lote.json          # junta um lote validando item por item
node scripts/validate-bank.mjs               # confere tudo (código 1 se houver erro)
node scripts/build-bank.mjs                  # publica em public/bank (+ index.json com o hash de cada semana)
```

Formato do lote (`bank-add`): uma lista de unidades
`{ "year": "Y5", "academic_week": 12, "subject": "math", "level": "", "questions": [ … ] }` ou
`{ "year": "Y5", "academic_week": 12, "book": { "subject": "pt_leit", "level": "", "read_level": "at", "title": …, "premise": …, "chapters": [ … ] } }`.

Meta por matéria-semana: 16 perguntas no repositório (≈ 1 semana de uma criança: 2 por dia × 7 dias + folga). O servidor completa sob demanda e guarda até 150 por matéria-semana.
