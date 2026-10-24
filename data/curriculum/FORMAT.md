# Currículo de referência — formato dos arquivos

Um arquivo por ano + matéria (+ nível no IB): `data/curriculum/<etapa>/<year>-<subject>[-<level>].json`

- etapa: `primary` (Y1–Y6), `ks3` (Y7–Y9), `igcse` (Y10–Y11), `ib` (Y12–Y13)
- year: `Y1` … `Y13`
- subject: id da matéria no app (pt, pt_ort, pt_leit, pt_lit, pt_red, bss, en, en_read, en_spell, en_guided, en_lit, ipc, math, fmath, sci, bio, chem, phys, hist, geog, comp, econ, bus, psych, spa, fre, tok)
- level: só no IB, `sl` ou `hl` (TOK não tem nível)

```json
{
  "version": 1,
  "year": "Y5",
  "stage": "primary",
  "subject": "math",
  "level": null,
  "language": "en",
  "source": "English National Curriculum — Mathematics programmes of study: key stage 2 (Year 5), DfE 2013",
  "weeks": [
    {
      "academic_week": 1,
      "term": 1,
      "week_of_term": 1,
      "type": "teaching",
      "topic": "Place value to 1,000,000",
      "objectives": ["Read, write, order and compare numbers to at least 1,000,000", "Determine the value of each digit"],
      "keywords": ["place value", "digit", "millions", "compare"],
      "spelling": []
    }
  ]
}
```

## Calendário padrão (37 semanas letivas; férias não contam)

| Term | academic_week | week_of_term |
|---|---|---|
| 1 (ago–dez) | 1–15 | 1–15 |
| 2 (jan–mar) | 16–27 | 1–12 |
| 3 (abr–jun) | 28–37 | 1–10 |

`type`: `teaching` (conteúdo novo), `review` (revisão/consolidação) ou `exam` (semana de provas).
- Todos os anos: semana 15 = `review` (fim do term 1); semana 27 = `exam` (provas de meio de ano / mocks); semana 36 = `exam`; semana 37 = `review`.
- Year 11 (IGCSE) e Year 13 (IB DP2): as provas finais externas são em maio. Use semanas 28–33 como `review` (revisão por tópico, com o tópico revisado no campo `topic`) e 34–37 como `exam`.
- Semanas `review`/`exam` também têm `topic`, `objectives` e `keywords` (o que revisar).

## Regras de conteúdo
- `topic`: até ~90 caracteres, no idioma da matéria.
- `objectives`: 2 a 4 itens curtos, no idioma da matéria (Spanish/French: em inglês, com palavras-chave na língua estrangeira).
- `keywords`: 3 a 8 termos.
- `spelling`: só em `pt_ort` e `en_spell` (Primary): 8 a 10 palavras da semana, seguindo o padrão do tópico. Nas outras matérias, `[]`.
- Progressão coerente ao longo das 37 semanas, sem repetir o mesmo tópico em semanas `teaching`.
- Leitura (pt_leit, en_read, en_guided, en_lit, pt_lit): o tópico é a habilidade/gênero da semana (ex.: "Inference: characters' feelings — adventure stories"); pode sugerir obras clássicas pelo título, sem copiar trechos.
